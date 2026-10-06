import { admin, body, CheckoutError, cors, failure, json, rateLimit } from "../_shared/paypal.ts";
import { webpay, webpayOrigin } from "../_shared/webpay.ts";
import { reconcileCommitted, settle, type WebpayOrder } from "../_shared/webpay-order.ts";
import { reconciliationAction } from "../_shared/webpay-reconcile.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  try {
    if (req.method !== "POST") throw new CheckoutError(405, "Método no permitido.");
    webpayOrigin(req);
    const { orderCode, buyOrder } = await body(req);
    if (typeof orderCode !== "string" || !/^[a-f0-9-]{36}$/i.test(orderCode) ||
      typeof buyOrder !== "string" || !/^G[a-f0-9]{24}$/.test(buyOrder))
      throw new CheckoutError(400, "Identificador de pedido inválido.");
    const db = admin();
    await rateLimit(db, req, "status", orderCode);
    const { data: local, error } = await db.from("merch_orders")
      .select("id,status,reservation_state,reservation_expires_at,abandon_reason,webpay_buy_order,webpay_session_id,webpay_token,webpay_return_origin,webpay_authorization_code,total_clp,webpay_commit_claimed_at,webpay_reconcile_alert_at")
      .eq("id", orderCode).eq("payment_provider", "webpay")
      .eq("webpay_buy_order", buyOrder).maybeSingle();
    if (error) throw error;
    if (!local) throw new CheckoutError(404, "Pedido no encontrado.");
    if (local.status === "capture_pending") {
      try { await reconcileCommitted(db, local as WebpayOrder); }
      catch (cause) { console.error("Webpay status still pending", local.id, cause); }
    } else if (local.webpay_reconcile_alert_at && ["awaiting_approval", "abandoned"].includes(local.status)) {
      // After scheduled checks stop, a deliberate buyer lookup can still
      // recover a conclusive status. Never PUT an INITIALIZED transaction.
      try {
        const remote = await webpay(`/${encodeURIComponent(local.webpay_token)}`, "GET");
        if (reconciliationAction(remote, local as WebpayOrder) === "settle") {
          const { data: claim, error: claimError } = await db.rpc("claim_webpay_commit", { p_token: local.webpay_token });
          if (claimError) throw claimError;
          if (claim === "claimed") await settle(db, local as WebpayOrder, remote);
        }
      } catch (cause) { console.error("Webpay review lookup pending", local.id, cause); }
    }
    const { data: current, error: refreshError } = await db.from("merch_orders")
      .select("status,reservation_state,reservation_expires_at,abandon_reason,webpay_reconcile_alert_at")
      .eq("id", orderCode).single();
    if (refreshError) throw refreshError;
    return json(req, { status: current.status, reservationState: current.reservation_state,
      reservationExpiresAt: current.reservation_expires_at, abandonReason: current.abandon_reason,
      reviewRequired: Boolean(current.webpay_reconcile_alert_at) &&
        !["paid", "payment_denied"].includes(current.status) });
  } catch (error) { return failure(req, error); }
});
