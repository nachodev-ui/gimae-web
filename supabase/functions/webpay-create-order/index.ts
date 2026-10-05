import { admin, body, CheckoutError, cors, failure, json, rateLimit } from "../_shared/paypal.ts";
import { webpay, webpayOrigin } from "../_shared/webpay.ts";

type CartLine = { productId: string; optionId: string; quantity: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  try {
    if (req.method !== "POST") throw new CheckoutError(405, "Método no permitido.");
    const origin = webpayOrigin(req);
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
        "Webpay de prueba está disponible solo para retiro en persona.",
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
      if (!available.stock_confirmed || available.stock < line.quantity) {
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
    const sessionId = crypto.randomUUID();
    const { data: order, error: insertError } = await db.rpc("reserve_webpay_order", {
      p_buyer_name: buyerName, p_buyer_contact: buyerContact, p_items: priced,
      p_origin: origin, p_session_id: sessionId,
    });
    if (insertError?.message?.match(/stock available|Price changed|Product unavailable|Variant unavailable/)) {
      throw new CheckoutError(409, "La disponibilidad cambió. Actualiza el carrito e intenta de nuevo.");
    }
    if (insertError) throw insertError;
    const { data: local, error: localError } = await db.from("merch_orders")
      .select("webpay_buy_order").eq("id", order.id).single();
    if (localError) throw localError;
    let remote;
    try {
      remote = await webpay("", "POST", {
        buy_order: local.webpay_buy_order, session_id: sessionId, amount: subtotal,
        return_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/webpay-return`,
      });
      if (typeof remote.token !== "string" || !/^[a-zA-Z0-9]{64}$/.test(remote.token) ||
        typeof remote.url !== "string" || !remote.url.startsWith("https://webpay3gint.transbank.cl/")) {
        throw new Error("WEBPAY_CREATE_INVALID");
      }
    } catch (error) {
      await db.from("merch_orders").update({ status: "abandoned", reservation_state: "released",
        abandoned_at: new Date().toISOString(), abandon_reason: "order_creation_failed" })
        .eq("id", order.id).eq("status", "creating");
      throw error;
    }
    const { data: saved, error: updateError } = await db.from("merch_orders")
      .update({ webpay_token: remote.token, status: "awaiting_approval" })
      .eq("id", order.id).eq("status", "creating").eq("reservation_state", "held")
      .gt("reservation_expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (updateError) throw updateError;
    if (!saved) throw new CheckoutError(409, "La reserva venció. Vuelve al carrito para empezar otra compra.");
    return json(req, {
      orderCode: order.id, buyOrder: local.webpay_buy_order,
      url: remote.url, token: remote.token, totalClp: subtotal,
      reservationExpiresAt: order.expiresAt,
      items: priced.map((x) => ({ productId: x.productId, optionId: x.optionId,
        name: x.name, option: x.option, quantity: x.quantity, unitPrice: x.unitPriceClp })),
    }, 201);
  } catch (error) { return failure(req, error); }
});
