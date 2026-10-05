import {
  admin,
  body,
  checkOrigin,
  CheckoutError,
  cors,
  currentRate,
  failure,
  json,
  paypal,
  paypalEnvironment,
  paypalClientId,
  paypalMerchantId,
  paypalToken,
  rateLimit,
} from "../_shared/paypal.ts";

type CartLine = { productId: string; optionId: string; quantity: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }
  try {
    if (req.method !== "POST") {
      throw new CheckoutError(405, "Método no permitido.");
    }
    checkOrigin(req);
    const input = await body(req);
    const buyerName = String(input.buyerName || "").trim().replace(/\s+/g, " ");
    const buyerContact = String(input.buyerContact || "").trim().replace(
      /\s+/g,
      " ",
    );
    if (
      buyerName.length < 2 || buyerName.length > 60 ||
      buyerContact.length < 3 || buyerContact.length > 100
    ) {
      throw new CheckoutError(400, "Revisa tu nombre y contacto.");
    }
    if (input.shippingId !== "pickup") {
      throw new CheckoutError(
        400,
        "PayPal está disponible solo para retiro en persona.",
      );
    }
    if (
      !Array.isArray(input.items) || input.items.length < 1 ||
      input.items.length > 20
    ) {
      throw new CheckoutError(400, "Carrito inválido.");
    }
    const items: CartLine[] = input.items.map((x: unknown) => {
      const line = x as CartLine;
      if (
        !line || typeof line.productId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,40}$/.test(line.productId) ||
        typeof line.optionId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,40}$/.test(line.optionId) ||
        !Number.isInteger(line.quantity) || line.quantity < 1 ||
        line.quantity > 20
      ) {
        throw new CheckoutError(400, "Cantidad o variante inválida.");
      }
      return line;
    });
    if (
      new Set(items.map((x) => `${x.productId}:${x.optionId}`)).size !==
        items.length
    ) {
      throw new CheckoutError(400, "El carrito contiene productos repetidos.");
    }
    const db = admin();
    const orderEnvironment = paypalEnvironment();
    await rateLimit(db, req, "create");
    const { data: products, error: productError } = await db.from("products")
      .select("id,name,price_clp,active,stock,stock_confirmed,variant_source")
      .in("id", [...new Set(items.map((x) => x.productId))]);
    if (productError) throw productError;
    const { data: variants, error: variantError } = await db.from(
      "product_variants",
    )
      .select("id,product_id,label,price_clp,stock,stock_confirmed")
      .in("product_id", [...new Set(items.map((x) => x.productId))]);
    if (variantError) throw variantError;
    const priced = items.map((line) => {
      const product = products?.find((p) =>
        p.id === line.productId && p.active
      );
      if (!product) {
        throw new CheckoutError(
          409,
          "Un producto ya no está disponible. Actualiza el carrito.",
        );
      }
      const options = variants?.filter((v) => v.product_id === product.id) ||
        [];
      const variantId = product.variant_source === "members"
        ? `${product.id}-${line.optionId}`
        : line.optionId;
      const variant = options.find((v) => v.id === variantId);
      if (
        (options.length && !variant) ||
        (!options.length && line.optionId !== "default")
      ) {
        throw new CheckoutError(
          409,
          "Una variante cambió. Actualiza el carrito.",
        );
      }
      const available = variant || product;
      if (orderEnvironment === "live" &&
        (!available.stock_confirmed || available.stock < line.quantity)) {
        throw new CheckoutError(
          409,
          "No hay stock confirmado para uno de los productos. Consulta a Gimae antes de pagar.",
        );
      }
      const unitPriceClp = variant ? variant.price_clp : product.price_clp;
      if (!Number.isSafeInteger(unitPriceClp) || unitPriceClp < 1) {
        throw new CheckoutError(409, "Hay un precio pendiente de confirmar.");
      }
      return {
        productId: product.id,
        optionId: line.optionId,
        variantId: variant?.id || null,
        name: product.name,
        option: variant?.label || "",
        quantity: line.quantity,
        unitPriceClp,
        lineTotalClp: unitPriceClp * line.quantity,
      };
    });
    const subtotal = priced.reduce((sum, x) => sum + x.lineTotalClp, 0);
    if (
      !Number.isSafeInteger(subtotal) || subtotal < 1 || subtotal > 2_000_000
    ) {
      throw new CheckoutError(400, "El total está fuera del rango admitido.");
    }
    const fx = await currentRate(db);
    const usdCents = Math.round(subtotal / Number(fx.clp_per_usd) * 100);
    if (!Number.isSafeInteger(usdCents) || usdCents < 1) {
      throw new CheckoutError(503, "No se pudo calcular el total USD.");
    }
    // La comprobación definitiva y la reserva comparten una transacción SQL.
    const { data: order, error: insertError } = await db.rpc("reserve_merch_order", {
      p_buyer_name: buyerName,
      p_buyer_contact: buyerContact,
      p_items: priced,
      p_fx: fx.clp_per_usd,
      p_rate_date: fx.observation_date,
      p_usd_cents: usdCents,
      p_environment: orderEnvironment,
    });
    if (insertError?.message?.includes("No confirmed stock available") ||
      insertError?.message?.includes("Price changed") ||
      insertError?.message?.includes("Product unavailable") ||
      insertError?.message?.includes("Variant unavailable")) {
      throw new CheckoutError(409, "La disponibilidad cambió. Actualiza el carrito e intenta de nuevo.");
    }
    if (insertError) throw insertError;
    let remote;
    try {
      const token = await paypalToken();
      remote = await paypal("/v2/checkout/orders", token, {
        method: "POST",
        headers: { "PayPal-Request-Id": order.id },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: order.id,
            custom_id: order.id,
            description: `Merch Gimae - retiro`,
            payee: { merchant_id: paypalMerchantId() },
            amount: { currency_code: "USD", value: (usdCents / 100).toFixed(2) },
          }],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: "Gimae!",
                shipping_preference: "NO_SHIPPING",
                user_action: "PAY_NOW",
              },
            },
          },
        }),
      });
      if (!remote.id) throw new Error("PayPal no entregó order ID");
    } catch (error) {
      // Si PayPal no entregó la orden, el intento deja de ocupar unidades.
      await db.from("merch_orders").update({ status: "abandoned",
        reservation_state: "released", abandoned_at: new Date().toISOString(),
        abandon_reason: "order_creation_failed" }).eq("id", order.id)
        .eq("status", "creating");
      throw error;
    }
    const { data: saved, error: updateError } = await db.from("merch_orders").update({
      paypal_order_id: remote.id,
      status: "awaiting_approval",
    }).eq("id", order.id).eq("status", "creating")
      .eq("reservation_state", "held").gt("reservation_expires_at", new Date().toISOString())
      .select("id").maybeSingle();
    if (updateError) throw updateError;
    if (!saved) throw new CheckoutError(409, "La reserva venció antes de preparar PayPal. Actualiza el carrito e inténtalo nuevamente.");
    return json(req, {
      orderId: remote.id,
      orderCode: order.id,
      orderEnvironment,
      reservationExpiresAt: order.expiresAt,
      clientId: paypalClientId(),
      totalClp: subtotal,
      totalUsd: (usdCents / 100).toFixed(2),
      clpPerUsd: fx.clp_per_usd,
      rateDate: fx.observation_date,
      shippingClp: 0,
      items: priced.map((x) => ({
        productId: x.productId,
        optionId: x.optionId,
        name: x.name,
        option: x.option,
        quantity: x.quantity,
        unitPrice: x.unitPriceClp,
      })),
    }, 201);
  } catch (error) {
    return failure(req, error);
  }
});
