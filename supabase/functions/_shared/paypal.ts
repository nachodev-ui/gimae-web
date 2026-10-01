import { createClient } from "@supabase/supabase-js";

export class CheckoutError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function env(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Falta configurar ${key}`);
  return value;
}

export function paypalBase(): string {
  const mode = env("PAYPAL_ENV");
  if (mode === "sandbox") return "https://api-m.sandbox.paypal.com";
  if (mode === "live") return "https://api-m.paypal.com";
  throw new Error("PAYPAL_ENV debe ser sandbox o live");
}

export function paypalClientId(): string {
  return env("PAYPAL_CLIENT_ID");
}
export function paypalMerchantId(): string {
  return env("PAYPAL_MERCHANT_ID");
}

export function admin() {
  const secret =
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Falta secret key de Supabase");
  return createClient(env("SUPABASE_URL"), secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("PAYPAL_ALLOWED_ORIGINS") || "").split(",").map(
    (s) => s.trim(),
  );
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

export function checkOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const allowed = (Deno.env.get("PAYPAL_ALLOWED_ORIGINS") || "").split(",").map(
    (s) => s.trim(),
  );
  if (!origin || !allowed.includes(origin)) {
    throw new CheckoutError(403, "Origen no autorizado.");
  }
}

export function json(req: Request, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function failure(req: Request, error: unknown): Response {
  const known = error instanceof CheckoutError;
  if (!known) console.error("Error checkout:", error);
  const response = json(req, {
    error: known
      ? error.message
      : "No se pudo procesar el pago. Intenta más tarde.",
  }, known ? error.status : 500);
  if (known && error.status === 429) response.headers.set("Retry-After", "60");
  return response;
}

function clientAddress(req: Request): string {
  // El gateway normalmente entrega cf-connecting-ip; x-forwarded-for es solo
  // un respaldo. La cuota global impide eludir el límite cambiando cabeceras.
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function rateLimit(
  db: ReturnType<typeof admin>,
  req: Request,
  action: "create" | "capture" | "status" | "webhook",
  subject?: string,
): Promise<void> {
  const bytes = new TextEncoder().encode(subject ?? clientAddress(req));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data, error } = await db.rpc("check_paypal_rate_limit", {
    p_action: action,
    p_subject: hash,
  });
  if (error) throw error;
  if (data !== true) throw new CheckoutError(429, "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.");
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > 12_000) {
    throw new CheckoutError(413, "Solicitud demasiado grande.");
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("object");
    }
    return value;
  } catch {
    throw new CheckoutError(400, "Solicitud inválida.");
  }
}

export function cents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) return null;
  const [dollars, fraction] = value.split(".").map(Number);
  const result = dollars * 100 + fraction;
  return Number.isSafeInteger(result) ? result : null;
}

export async function paypalToken(): Promise<string> {
  const basic = btoa(`${paypalClientId()}:${env("PAYPAL_CLIENT_SECRET")}`);
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("PayPal OAuth sin token");
  return data.access_token;
}

export async function paypal(
  path: string,
  token: string,
  options: RequestInit = {},
) {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  headers.set("Prefer", "return=representation");
  const response = await fetch(`${paypalBase()}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("PayPal API:", response.status, data?.name, data?.debug_id);
    throw new CheckoutError(
      502,
      "PayPal no pudo completar la operación. Revisa el estado antes de reintentar.",
    );
  }
  return data;
}

type CaptureOrder = { id: string; total_usd_cents: number };
type PayPalCapturedOrder = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    payee?: { merchant_id?: string };
    payments?: { captures?: unknown[] };
  }>;
};

// También se usa desde el webhook ORDER.APPROVED: misma clave para la misma captura.
export async function captureApprovedOrder(
  db: ReturnType<typeof admin>,
  local: CaptureOrder,
  orderId: string,
  token?: string,
): Promise<"captured" | "in_progress" | "expired" | "already"> {
  const accessToken = token ?? await paypalToken();
  const { data: claim, error: claimError } = await db.rpc("claim_merch_capture", {
    p_order_id: local.id,
  });
  if (claimError) throw claimError;
  if (claim === "expired" || claim === "in_progress" || claim === "already") return claim;
  if (claim !== "claimed") throw new Error("Unexpected capture claim");
  const capture = await paypal(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    accessToken,
    {
      method: "POST",
      headers: { "PayPal-Request-Id": local.id },
      body: "{}",
    },
  );
  await recordCompletedCapture(db, local, orderId, capture);
  return "captured";
}

export async function recordCompletedCapture(
  db: ReturnType<typeof admin>,
  local: CaptureOrder,
  orderId: string,
  capture: PayPalCapturedOrder,
): Promise<void> {
  const units = capture.purchase_units || [];
  const payments = units.flatMap((unit) => unit.payments?.captures || []);
  if (
    capture.id !== orderId || capture.status !== "COMPLETED" ||
    units.length !== 1 || payments.length !== 1
  ) {
    throw new CheckoutError(
      502,
      "PayPal aún no confirmó la captura. Consulta el estado antes de reintentar.",
    );
  }
  const payment = payments[0] as {
    id: string;
    status: string;
    amount?: { currency_code: string; value: string };
  };
  if (
    payment.status !== "COMPLETED" ||
    payment.amount?.currency_code !== "USD" ||
    cents(payment.amount?.value) !== local.total_usd_cents ||
    units[0]?.payee?.merchant_id !== paypalMerchantId() || !payment.id
  ) {
    throw new CheckoutError(502, "El pago recibido no coincide con el pedido. Contacta a Gimae.");
  }
  const { error } = await db.from("merch_orders").update({
    status: "capture_pending",
    paypal_capture_id: payment.id,
    abandoned_at: null,
    abandon_reason: null,
  }).eq("id", local.id).in("status", ["awaiting_approval", "abandoned"]);
  if (error) throw error;
}

// Tipo de cambio oficial CLP/USD. Consulta reciente al crear la orden; cache <= 12 h.
// Se rehúsa a cobrar con una observación de más de 5 días (incluye fines de semana).
export async function currentRate(db: ReturnType<typeof admin>) {
  const source = "BCCH_F073.TCO.PRE.Z.D";
  const { data: cached, error } = await db.from("paypal_fx_rates").select("*")
    .eq("source", source).maybeSingle();
  if (error) throw error;
  const now = Date.now();
  if (
    cached && now - Date.parse(cached.fetched_at) < 12 * 3600_000 &&
    now - Date.parse(`${cached.observation_date}T00:00:00Z`) < 5 * 86400_000
  ) return cached;
  const url = new URL("https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx");
  url.search = new URLSearchParams({
    token: env("BCCH_API_TOKEN"),
    function: "GetSeries",
    timeseries: "F073.TCO.PRE.Z.D",
    firstdate: new Date(now - 7 * 86400_000).toISOString().slice(0, 10),
    lastdate: new Date(now).toISOString().slice(0, 10),
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new CheckoutError(
      503,
      "La cotización USD no está disponible. Intenta más tarde.",
    );
  }
  const payload = await response.json();
  if (payload.Codigo !== 0 || !Array.isArray(payload.Series?.Obs)) {
    throw new CheckoutError(
      503,
      "La cotización USD no está disponible. Intenta más tarde.",
    );
  }
  const observations = payload.Series.Obs.filter((
    o: { statusCode: string; value: string; indexDateString: string },
  ) =>
    o.statusCode === "OK" && /^\d{2}-\d{2}-\d{4}$/.test(o.indexDateString) &&
    Number.isFinite(Number(o.value))
  )
    .map((o: { value: string; indexDateString: string }) => ({
      rate: Number(o.value),
      date: o.indexDateString.split("-").reverse().join("-"),
    })).sort((a: { date: string }, b: { date: string }) =>
      b.date.localeCompare(a.date)
    );
  const latest = observations[0];
  if (
    !latest || latest.rate < 100 || latest.rate > 10000 ||
    now - Date.parse(`${latest.date}T00:00:00Z`) >= 5 * 86400_000
  ) {
    throw new CheckoutError(
      503,
      "La cotización USD está desactualizada. Intenta más tarde.",
    );
  }
  const row = {
    source,
    clp_per_usd: latest.rate,
    observation_date: latest.date,
    fetched_at: new Date(now).toISOString(),
  };
  const { error: saveError } = await db.from("paypal_fx_rates").upsert(row);
  if (saveError) throw saveError;
  return row;
}
