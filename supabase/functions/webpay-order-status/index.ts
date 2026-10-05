import { admin, body, CheckoutError, cors, failure, json, rateLimit } from "../_shared/paypal.ts";
import { webpayOrigin } from "../_shared/webpay.ts";
import { reconcileCommitted, type WebpayOrder } from "../_shared/webpay-order.ts";

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
      .select("id,status,reservation_state,reservation_expires_at,abandon_reason,webpay_buy_order,webpay_session_id,webpay_token,webpay_return_origin,webpay_authorization_code,total_clp,webpay_commit_claimed_at")
      .eq("id", orderCode).eq("payment_provider", "webpay")
      .eq("webpay_buy_order", buyOrder).maybeSingle();
    if (error) throw error;
    if (!local) throw new CheckoutError(404, "Pedido no encontrado.");
    if (local.status === "capture_pending") {
      try { await reconcileCommitted(db, local as WebpayOrder); }
      catch (cause) { console.error("Webpay status still pending", local.id, cause); }
    }
    const { data: current, error: refreshError } = await db.from("merch_orders")
      .select("status,reservation_state,reservation_expires_at,abandon_reason")
      .eq("id", orderCode).single();
    if (refreshError) throw refreshError;
    return json(req, { status: current.status, reservationState: current.reservation_state,
      reservationExpiresAt: current.reservation_expires_at, abandonReason: current.abandon_reason });
  } catch (error) { return failure(req, error); }
});
