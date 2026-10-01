import {
  admin,
  body,
  captureApprovedOrder,
  checkOrigin,
  CheckoutError,
  cors,
  failure,
  json,
  rateLimit,
} from "../_shared/paypal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }
  try {
    if (req.method !== "POST") {
      throw new CheckoutError(405, "Método no permitido.");
    }
    checkOrigin(req);
    const { orderId } = await body(req);
    if (typeof orderId !== "string" || !/^[A-Z0-9-]{8,40}$/.test(orderId)) {
      throw new CheckoutError(400, "Orden PayPal inválida.");
    }
    const db = admin();
    await rateLimit(db, req, "capture", orderId);
    const { data: local, error } = await db.from("merch_orders").select(
      "id,status,total_usd_cents,paypal_capture_id",
    )
      .eq("paypal_order_id", orderId).maybeSingle();
    if (error) throw error;
    if (!local) throw new CheckoutError(404, "Pedido no encontrado.");
    if (local.status === "paid" || local.status === "capture_pending") {
      return json(req, { orderCode: local.id, status: local.status });
    }
    if (local.status !== "awaiting_approval") {
      throw new CheckoutError(409, local.status === "abandoned"
        ? "Este intento de pago ya no está vigente. Prepara una orden nueva."
        : "El pedido no admite captura.");
    }
    // La misma ID evita capturas duplicadas tras reintentos o respuestas perdidas.
    await captureApprovedOrder(db, local, orderId);
    return json(req, { orderCode: local.id, status: "capture_pending" });
  } catch (error) {
    return failure(req, error);
  }
});
