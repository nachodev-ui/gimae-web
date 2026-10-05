-- Webpay integration expires its form at about ten minutes. Reserve for nine.
CREATE OR REPLACE FUNCTION public.reserve_webpay_order(
  p_buyer_name text, p_buyer_contact text, p_items jsonb,
  p_origin text, p_session_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  line jsonb; product_id text; variant_id text; option_id text;
  requested integer; unit_price integer; subtotal integer := 0;
  held integer; physical integer; confirmed boolean;
  product public.products%ROWTYPE; variant public.product_variants%ROWTYPE;
  new_id uuid; expires_at timestamptz := clock_timestamp() + interval '9 minutes';
BEGIN
  IF length(trim(p_buyer_name)) NOT BETWEEN 2 AND 60 OR
     length(trim(p_buyer_contact)) NOT BETWEEN 3 AND 100 OR
     jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR
     jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 OR
     p_origin NOT IN ('http://localhost:8000','https://nachodev-ui.github.io') OR
     p_session_id !~ '^[a-f0-9-]{36}$' THEN
    RAISE EXCEPTION 'Invalid reserved order';
  END IF;
  IF (SELECT count(*) FROM (SELECT value->>'productId', value->>'optionId'
      FROM jsonb_array_elements(p_items) GROUP BY 1,2) x) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Duplicate reserved line';
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_items)
              ORDER BY value->>'productId', value->>'variantId', value->>'optionId'
  LOOP
    product_id := line->>'productId';
    variant_id := NULLIF(line->>'variantId','');
    option_id := line->>'optionId';
    IF product_id !~ '^[a-zA-Z0-9_-]{1,40}$' OR
       option_id !~ '^[a-zA-Z0-9_-]{1,40}$' OR
       line->>'quantity' !~ '^[0-9]{1,2}$' OR
       line->>'unitPriceClp' !~ '^[0-9]{1,7}$' THEN
      RAISE EXCEPTION 'Invalid reserved line';
    END IF;
    requested := (line->>'quantity')::integer;
    unit_price := (line->>'unitPriceClp')::integer;
    IF requested NOT BETWEEN 1 AND 20 OR unit_price < 1 OR
       (line->>'lineTotalClp')::integer IS DISTINCT FROM requested * unit_price THEN
      RAISE EXCEPTION 'Invalid reserved amount';
    END IF;
    SELECT * INTO product FROM public.products p WHERE p.id = product_id FOR UPDATE;
    IF NOT FOUND OR NOT product.active THEN RAISE EXCEPTION 'Product unavailable'; END IF;
    IF variant_id IS NOT NULL THEN
      IF variant_id <> (CASE WHEN product.variant_source = 'members'
                           THEN product_id || '-' || option_id ELSE option_id END) THEN
        RAISE EXCEPTION 'Variant mismatch';
      END IF;
      SELECT * INTO variant FROM public.product_variants v
        WHERE v.product_id = product_id AND v.id = variant_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Variant unavailable'; END IF;
      physical := variant.stock; confirmed := variant.stock_confirmed;
      IF variant.price_clp <> unit_price THEN RAISE EXCEPTION 'Price changed'; END IF;
    ELSE
      IF option_id <> 'default' OR EXISTS (
        SELECT 1 FROM public.product_variants v WHERE v.product_id = product_id
      ) THEN RAISE EXCEPTION 'Variant required'; END IF;
      physical := product.stock; confirmed := product.stock_confirmed;
      IF product.price_clp <> unit_price THEN RAISE EXCEPTION 'Price changed'; END IF;
    END IF;
    SELECT COALESCE(sum(r.quantity),0)::integer INTO held
    FROM public.merch_reservation_lines r JOIN public.merch_orders o ON o.id = r.order_id
    WHERE r.product_id = product_id AND r.variant_id IS NOT DISTINCT FROM variant_id
      AND (o.reservation_state = 'capturing' OR
           (o.reservation_state = 'held' AND o.reservation_expires_at > clock_timestamp()));
    IF NOT confirmed OR physical - held < requested THEN
      RAISE EXCEPTION 'No confirmed stock available for reservation';
    END IF;
    subtotal := subtotal + requested * unit_price;
  END LOOP;
  IF subtotal < 1 OR subtotal > 2000000 THEN RAISE EXCEPTION 'Invalid subtotal'; END IF;
  INSERT INTO public.merch_orders(buyer_name,buyer_contact,items,subtotal_clp,total_clp,
      payment_provider,fx_source,reservation_state,reservation_expires_at,
      webpay_buy_order,webpay_session_id,webpay_return_origin)
    VALUES(p_buyer_name,p_buyer_contact,p_items,subtotal,subtotal,
      'webpay',NULL,'held',expires_at,
      'G' || substr(replace(gen_random_uuid()::text,'-',''),1,24),p_session_id,p_origin)
    RETURNING id INTO new_id;
  INSERT INTO public.merch_reservation_lines(order_id,product_id,variant_id,option_id,quantity)
    SELECT new_id, value->>'productId', NULLIF(value->>'variantId',''),
      value->>'optionId', (value->>'quantity')::integer FROM jsonb_array_elements(p_items);
  RETURN jsonb_build_object('id',new_id,'expiresAt',expires_at);
END;
$$;
