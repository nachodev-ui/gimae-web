import { CheckoutError } from "./paypal.ts";

const base = "https://webpay3gint.transbank.cl";

function requiredEnv(key: string): string {
  const value = Deno.env.get(key)?.trim();
  if (!value) throw new Error(`Falta configurar ${key}`);
  return value;
}

function integrationCommerceCode(): string {
  const value = requiredEnv("WEBPAY_INTEGRATION_COMMERCE_CODE");
  if (!/^\d{8,20}$/.test(value)) {
    throw new Error("WEBPAY_INTEGRATION_COMMERCE_CODE tiene formato inválido");
  }
  return value;
}

function integrationApiKey(): string {
  const value = requiredEnv("WEBPAY_INTEGRATION_API_KEY");
  if (!/^[A-F0-9]{32,128}$/i.test(value)) {
    throw new Error("WEBPAY_INTEGRATION_API_KEY tiene formato inválido");
  }
  return value;
}

// This module is intentionally locked to Transbank's integration host.
// Even public/shared integration credentials live in Supabase Secrets so a
// production credential can never be normalized as a source-code literal.
export function webpayOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("PAYPAL_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim());
  if (!allowed.includes(origin) || !["http://localhost:8000", "https://nachodev-ui.github.io"].includes(origin)) {
    throw new CheckoutError(403, "Origen de prueba no autorizado.");
  }
  return origin;
}

export class WebpayHttpError extends Error {
  constructor(public status: number, public code: string) {
    super(`WEBPAY_HTTP_${status}_${code}`);
  }
}

export async function webpay(path: string, method: "POST" | "PUT" | "GET", payload?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${base}/rswebpaytransaction/api/webpay/v1.2/transactions${path}`, {
    method,
    headers: {
      "Tbk-Api-Key-Id": integrationCommerceCode(),
      "Tbk-Api-Key-Secret": integrationApiKey(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    // Keep diagnostics in server logs; never send tokens or card details to the browser.
    const code = String(detail.error_code || detail.error || "UNSPECIFIED").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 50);
    console.error(
      "Webpay API rejected request",
      response.status,
      code,
      String(detail.error_message || detail.message || "").slice(0, 180),
    );
    throw new WebpayHttpError(response.status, code);
  }
  return await response.json();
}

export function authorized(result: Record<string, unknown>, order: {
  webpay_buy_order: string; webpay_session_id: string; total_clp: number;
}): boolean {
  return result.status === "AUTHORIZED" && result.response_code === 0 &&
    result.buy_order === order.webpay_buy_order &&
    result.session_id === order.webpay_session_id &&
    result.amount === order.total_clp &&
    typeof result.authorization_code === "string" &&
    /^[A-Z0-9]{1,20}$/i.test(result.authorization_code);
}
