import {
  admin,
  captureApprovedOrder,
  cents,
  paypal,
  paypalMerchantId,
  paypalToken,
  recordCompletedCapture,
} from "../_shared/paypal.ts";

// PayPal no envía JWT Supabase. Solo se procesa tras verify-webhook-signature.
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Método no permitido", { status: 405 });
  }
  try {
    const raw = await req.text();
    if (raw.length > 50_000) {
      return new Response("Payload demasiado grande", { status: 413 });
    }
    const event = JSON.parse(raw);
    const headers = [
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ];
    if (
      headers.some((name) => !req.headers.get(name)) ||
      !Deno.env.get("PAYPAL_WEBHOOK_ID")
    ) {
      return new Response("Firma incompleta", { status: 400 });
    }
    const token = await paypalToken();
    const verified = await paypal(
      "/v1/notifications/verify-webhook-signature",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          auth_algo: req.headers.get("paypal-auth-algo"),
          cert_url: req.headers.get("paypal-cert-url"),
          transmission_id: req.headers.get("paypal-transmission-id"),
          transmission_sig: req.headers.get("paypal-transmission-sig"),
          transmission_time: req.headers.get("paypal-transmission-time"),
          webhook_id: Deno.env.get("PAYPAL_WEBHOOK_ID"),
          webhook_event: event,
        }),
      },
    );
    if (verified.verification_status !== "SUCCESS") {
      return new Response("Firma inválida", { status: 401 });
    }
    if (
      typeof event.id !== "string" || !event.id ||
      typeof event.event_type !== "string"
    ) {
      return new Response("Evento inválido", { status: 400 });
    }
    const approved = event.event_type === "CHECKOUT.ORDER.APPROVED";
    if (!approved && event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return new Response("Ignorado", { status: 200 });
    }
    const resource = event.resource;
    const orderId = approved
      ? resource?.id
      : resource?.supplementary_data?.related_ids?.order_id;
    if (typeof orderId !== "string") {
      return new Response("Sin order ID", { status: 400 });
    }
    const db = admin();
    const { data: order, error: findError } = await db.from("merch_orders")
      .select("id,status,total_usd_cents,paypal_capture_id").eq(
        "paypal_order_id",
        orderId,
      ).maybeSingle();
    if (findError) throw findError;
    if (!order) return new Response("Orden aún no registrada", { status: 503 });
    if (approved) {
      if (resource.status !== "APPROVED") {
        return new Response("Aprobación inválida", { status: 422 });
      }
      if (order.status === "awaiting_approval") {
        // Verifica la orden desde PayPal antes de capturar, incluso con webhook firmado.
        const remote = await paypal(
          `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
          token,
        );
        const units = remote.purchase_units || [];
        if (
          remote.id !== orderId ||
          !["APPROVED", "COMPLETED"].includes(remote.status) ||
          units.length !== 1 || units[0]?.reference_id !== order.id ||
          units[0]?.payee?.merchant_id !== paypalMerchantId() ||
          units[0]?.amount?.currency_code !== "USD" ||
          cents(units[0]?.amount?.value) !== order.total_usd_cents
        ) {
          console.error("Orden aprobada discordante", event.id, orderId);
          return new Response("Orden discordante", { status: 422 });
        }
        if (remote.status === "APPROVED") {
          await captureApprovedOrder(db, order, orderId, token);
        } else {
          // El navegador pudo capturar antes de que llegara este evento.
          await recordCompletedCapture(db, order, orderId, remote);
        }
      }
      const { error: eventError } = await db.from("paypal_webhook_events").upsert(
        { paypal_event_id: event.id, event_type: event.event_type, paypal_order_id: orderId },
        { onConflict: "paypal_event_id", ignoreDuplicates: true },
      );
      if (eventError) throw eventError;
      return new Response("OK", { status: 200 });
    }
    if (
      resource.status !== "COMPLETED" ||
      resource.amount?.currency_code !== "USD" ||
      cents(resource.amount?.value) !== order.total_usd_cents ||
      resource.payee?.merchant_id !== paypalMerchantId() ||
      typeof resource.id !== "string" ||
      (order.paypal_capture_id && resource.id !== order.paypal_capture_id)
    ) {
      console.error(
        "Webhook verificado con pago discordante",
        event.id,
        orderId,
      );
      return new Response("Datos de pago discordantes", { status: 422 });
    }
    // Idempotente: puede llegar antes del retorno de la función de captura.
    if (order.status !== "paid") {
      const { error: updateError } = await db.from("merch_orders").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paypal_capture_id: resource.id,
      }).eq("id", order.id).in("status", [
        "awaiting_approval",
        "capture_pending",
      ]);
      if (updateError) throw updateError;
    }
    const { error: eventError } = await db.from("paypal_webhook_events").upsert(
      {
        paypal_event_id: event.id,
        event_type: event.event_type,
        paypal_order_id: orderId,
      },
      { onConflict: "paypal_event_id", ignoreDuplicates: true },
    );
    if (eventError) throw eventError;
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook PayPal:", error);
    return new Response("Reintentar", { status: 500 });
  }
});
