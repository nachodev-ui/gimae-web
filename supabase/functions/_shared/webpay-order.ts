import { admin } from "./paypal.ts";
import { authorized, webpay } from "./webpay.ts";

export type WebpayOrder = {
  id: string; status: string; reservation_state: string; reservation_expires_at: string;
  abandon_reason: string | null; webpay_buy_order: string; webpay_session_id: string;
  webpay_token: string; webpay_return_origin: string; webpay_authorization_code: string | null;
  total_clp: number; webpay_commit_claimed_at: string | null;
};

export async function settle(db: ReturnType<typeof admin>, order: WebpayOrder, result: Record<string, unknown>): Promise<void> {
  // Clear stale diagnostics in the same database update that closes the order.
  // A browser return can succeed after an earlier status check had failed.
  const resolved = { webpay_reconcile_after: null, webpay_reconcile_error: null,
    webpay_reconcile_alert_at: null, webpay_reconcile_alert_reason: null };
  if (authorized(result, order)) {
    const { error } = await db.from("merch_orders").update({ status: "paid",
      webpay_authorization_code: result.authorization_code, paid_at: new Date().toISOString(), ...resolved })
      .eq("id", order.id).eq("webpay_token", order.webpay_token)
      .in("status", ["capture_pending", "abandoned"]);
    if (error) throw error;
  } else {
    // Mismatching amount/order/session is never treated as a successful payment.
    // Keep the reservation in review if Webpay claims authorization for another order.
    if (result.status === "AUTHORIZED" || result.response_code === 0 || result.status !== "FAILED" ||
      result.buy_order !== order.webpay_buy_order || result.session_id !== order.webpay_session_id ||
      result.amount !== order.total_clp) throw new Error("WEBPAY_AMOUNT_OR_ID_MISMATCH");
    const { error } = await db.from("merch_orders").update({ status: "payment_denied",
      reservation_state: "released", ...resolved })
      .eq("id", order.id).eq("status", "capture_pending");
    if (error) throw error;
  }
}

export async function reconcileCommitted(db: ReturnType<typeof admin>, order: WebpayOrder): Promise<void> {
  if (order.status !== "capture_pending") return;
  const result = await webpay(`/${encodeURIComponent(order.webpay_token)}`, "GET");
  if (result.status === "AUTHORIZED" || result.status === "FAILED") {
    await settle(db, order, result);
  }
  // INITIALIZED after an uncertain commit is not proof of rejection. Cron
  // retries within the Webpay window, then shows an operational alert.
}
