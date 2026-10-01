// Comprueba la orden completa obtenida directamente desde la API de PayPal.
// No usa datos enviados por el navegador ni el contenido de un webhook.
export type LocalPayPalOrder = {
  id: string;
  paypal_order_id: string;
  paypal_capture_id: string | null;
  total_usd_cents: number;
};

export type RemoteOrderState =
  | { kind: "approved" }
  | { kind: "completed"; captureId: string }
  | { kind: "voided" }
  | { kind: "waiting" };

function cents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) return null;
  const [whole, fraction] = value.split(".").map(Number);
  const result = whole * 100 + fraction;
  return Number.isSafeInteger(result) ? result : null;
}

export function inspectRemoteOrder(
  remote: Record<string, unknown>,
  local: LocalPayPalOrder,
  merchantId: string,
): RemoteOrderState {
  const units = Array.isArray(remote.purchase_units) ? remote.purchase_units : [];
  const unit = units[0] as Record<string, unknown> | undefined;
  const amount = unit?.amount as Record<string, unknown> | undefined;
  const payee = unit?.payee as Record<string, unknown> | undefined;
  if (
    remote.id !== local.paypal_order_id || remote.intent !== "CAPTURE" ||
    units.length !== 1 || unit?.reference_id !== local.id ||
    unit?.custom_id !== local.id || payee?.merchant_id !== merchantId ||
    amount?.currency_code !== "USD" ||
    cents(amount?.value) !== local.total_usd_cents
  ) throw new Error("PAYPAL_ORDER_MISMATCH");

  if (remote.status === "APPROVED") return { kind: "approved" };
  if (remote.status === "VOIDED") return { kind: "voided" };
  if (remote.status !== "COMPLETED") return { kind: "waiting" };

  const payments = unit.payments as Record<string, unknown> | undefined;
  const captures = Array.isArray(payments?.captures) ? payments.captures : [];
  if (captures.length !== 1) throw new Error("PAYPAL_CAPTURE_MISMATCH");
  const capture = captures[0] as Record<string, unknown>;
  const capturedAmount = capture.amount as Record<string, unknown> | undefined;
  if (
    typeof capture.id !== "string" || !capture.id ||
    (local.paypal_capture_id && capture.id !== local.paypal_capture_id) ||
    capturedAmount?.currency_code !== "USD" ||
    cents(capturedAmount?.value) !== local.total_usd_cents
  ) throw new Error("PAYPAL_CAPTURE_MISMATCH");
  if (capture.status !== "COMPLETED") return { kind: "waiting" };
  return { kind: "completed", captureId: capture.id };
}

export function inspectRemoteCapture(
  remote: Record<string, unknown>,
  local: LocalPayPalOrder,
  merchantId: string,
): RemoteOrderState {
  const amount = remote.amount as Record<string, unknown> | undefined;
  const payee = remote.payee as Record<string, unknown> | undefined;
  const supplementary = remote.supplementary_data as Record<string, unknown> | undefined;
  const related = supplementary?.related_ids as Record<string, unknown> | undefined;
  if (
    !local.paypal_capture_id || remote.id !== local.paypal_capture_id ||
    payee?.merchant_id !== merchantId ||
    amount?.currency_code !== "USD" ||
    cents(amount?.value) !== local.total_usd_cents ||
    (related?.order_id && related.order_id !== local.paypal_order_id)
  ) throw new Error("PAYPAL_CAPTURE_MISMATCH");
  return remote.status === "COMPLETED"
    ? { kind: "completed", captureId: local.paypal_capture_id }
    : { kind: "waiting" };
}
