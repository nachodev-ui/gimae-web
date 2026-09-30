import {
  admin,
  body,
  cents,
  checkOrigin,
  CheckoutError,
  cors,
  failure,
  json,
  paypal,
  paypalMerchantId,
  paypalToken,
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
      throw new CheckoutError(409, "El pedido no admite captura.");
    }
    // La misma ID evita capturas duplicadas tras reintentos o respuestas perdidas.
    const token = await paypalToken();
    const capture = await paypal(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      token,
      {
        method: "POST",
        headers: { "PayPal-Request-Id": local.id },
        body: "{}",
      },
    );
    const units = capture.purchase_units || [];
    const payments = units.flatMap((
      u: { payments?: { captures?: unknown[] } },
    ) => u.payments?.captures || []);
    if (
      capture.id !== orderId || capture.status !== "COMPLETED" ||
      payments.length !== 1
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
      throw new CheckoutError(
        502,
        "El pago recibido no coincide con el pedido. Contacta a Gimae.",
      );
    }
    const { error: updateError } = await db.from("merch_orders").update({
      status: "capture_pending",
      paypal_capture_id: payment.id,
    }).eq("id", local.id).eq("status", "awaiting_approval");
    if (updateError) throw updateError;
    return json(req, { orderCode: local.id, status: "capture_pending" });
  } catch (error) {
    return failure(req, error);
  }
});
