import { CheckoutError } from "./paypal.ts";

// Integration credentials are public test values documented by Transbank.
// This module intentionally has no production host or credentials.
const commerceCode = "597055555532";
const apiKey = "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C";
const base = "https://webpay3gint.transbank.cl";

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
    headers: { "Tbk-Api-Key-Id": commerceCode, "Tbk-Api-Key-Secret": apiKey,
      Accept: "application/json", "Content-Type": "application/json" },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    // Keep diagnostics in server logs; never send tokens or card details to the browser.
    const code = String(detail.error_code || detail.error || "UNSPECIFIED").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 50);
    console.error("Webpay API rejected request", response.status, code,
      String(detail.error_message || detail.message || "").slice(0, 180));
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
