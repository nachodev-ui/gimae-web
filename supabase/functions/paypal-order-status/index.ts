import { admin, body, checkOrigin, CheckoutError, cors, failure, json, rateLimit } from "../_shared/paypal.ts";

// Devuelve solo el estado: nunca expone el contacto ni los datos del pedido.
// El navegador debe presentar ambas IDs aleatorias que recibió al crear la orden.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }
  try {
    if (req.method !== "POST") throw new CheckoutError(405, "Método no permitido.");
    checkOrigin(req);
    const { orderCode, orderId } = await body(req);
    if (
      typeof orderCode !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderCode) ||
      typeof orderId !== "string" || !/^[A-Z0-9-]{8,40}$/.test(orderId)
    ) throw new CheckoutError(400, "Identificador de pedido inválido.");

    const db = admin();
    await rateLimit(db, req, "status", orderCode);
    const { data, error } = await db.from("merch_orders").select("status")
      .eq("id", orderCode).eq("paypal_order_id", orderId).maybeSingle();
    if (error) throw error;
    if (!data) throw new CheckoutError(404, "Pedido no encontrado.");
    return json(req, { status: data.status });
  } catch (error) {
    return failure(req, error);
  }
});
