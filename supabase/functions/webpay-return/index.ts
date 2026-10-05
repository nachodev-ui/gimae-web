import { admin, rateLimit } from "../_shared/paypal.ts";
import { webpay } from "../_shared/webpay.ts";
import { settle, type WebpayOrder } from "../_shared/webpay-order.ts";

const fields = "id,status,reservation_state,reservation_expires_at,abandon_reason,webpay_buy_order,webpay_session_id,webpay_token,webpay_return_origin,webpay_authorization_code,total_clp,webpay_commit_claimed_at";
function redirect(order: WebpayOrder, outcome: string): Response {
  const path = order.webpay_return_origin === "https://nachodev-ui.github.io" ? "/gimae-web/shop.html" : "/shop.html";
  const url = new URL(path, order.webpay_return_origin);
  url.searchParams.set("webpay-order", order.id);
  url.searchParams.set("webpay-ref", order.webpay_buy_order);
  url.searchParams.set("webpay-result", outcome);
  url.searchParams.set("webpay-sandbox", "1");
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return new Response("Método no permitido", { status: 405 });
  try {
    // Transbank can return to the merchant via GET ?token_ws=... as well as
    // POST form data. Neither format proves payment: only commit/status does.
    const raw = req.method === "POST" ? await req.text() : new URL(req.url).search.slice(1);
    if (raw.length > 2048) return new Response("Solicitud inválida", { status: 400 });
    const form = new URLSearchParams(raw);
    const token = form.get("token_ws");
    const db = admin();
    if (!token) {
      // Abort/timeout sends TBK_* fields instead of a transaction token.
      const buyOrder = form.get("TBK_ORDEN_COMPRA") || "";
      const session = form.get("TBK_ID_SESION") || "";
      if (!/^G[a-f0-9]{24}$/.test(buyOrder) || !/^[a-f0-9-]{36}$/.test(session))
        return new Response("Retorno inválido", { status: 400 });
      const { data: order } = await db.from("merch_orders").select(fields)
        .eq("payment_provider", "webpay").eq("webpay_buy_order", buyOrder)
        .eq("webpay_session_id", session).maybeSingle();
      if (!order) return new Response("Pedido no encontrado", { status: 404 });
      // No token: do not infer a charge, leave the short reserve to expire.
      return redirect(order as WebpayOrder, "cancelled");
    }
    if (!/^[a-zA-Z0-9]{64}$/.test(token)) return new Response("Token inválido", { status: 400 });
    const { data: order, error } = await db.from("merch_orders").select(fields)
      .eq("payment_provider", "webpay").eq("webpay_token", token).maybeSingle();
    if (error) throw error;
    if (!order) return new Response("Pedido no encontrado", { status: 404 });
    await rateLimit(db, req, "capture", order.id);
    if (order.status === "paid") return redirect(order as WebpayOrder, "paid");
    const { data: claim, error: claimError } = await db.rpc("claim_webpay_commit", { p_token: token });
    if (claimError) throw claimError;
    if (claim === "claimed") {
      // Only the winner commits. If a previous call failed after committing,
      // the status endpoint queries Webpay before showing any final result.
      try {
        const result = await webpay(`/${encodeURIComponent(token)}`, "PUT");
        await settle(db, order as WebpayOrder, result);
      } catch (cause) {
        console.error("Webpay return pending verification", order.id, cause);
        return redirect(order as WebpayOrder, "pending");
      }
      return redirect(order as WebpayOrder, "verified");
    }
    return redirect(order as WebpayOrder, "pending");
  } catch (error) {
    console.error("Webpay return error", error);
    return new Response("No se pudo verificar el pago. Regresa a la tienda y consulta tu pedido antes de intentar otra compra.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
});
