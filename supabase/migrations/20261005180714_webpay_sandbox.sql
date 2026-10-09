-- Webpay Plus integration: CLP orders share the same transactional stock reserve.
ALTER TABLE public.merch_orders
  ADD COLUMN payment_provider text NOT NULL DEFAULT 'paypal'
    CHECK (payment_provider IN ('paypal','webpay')),
  ADD COLUMN webpay_buy_order text UNIQUE,
  ADD COLUMN webpay_token text UNIQUE,
  ADD COLUMN webpay_session_id text,
  ADD COLUMN webpay_authorization_code text,
  ADD COLUMN webpay_return_origin text,
  ADD COLUMN webpay_commit_claimed_at timestamptz;
ALTER TABLE public.merch_orders
  ALTER COLUMN clp_per_usd DROP NOT NULL,
  ALTER COLUMN fx_observation_date DROP NOT NULL,
  ALTER COLUMN total_usd_cents DROP NOT NULL,
  ALTER COLUMN fx_source DROP NOT NULL;
ALTER TABLE public.merch_orders ADD CONSTRAINT merch_orders_provider_amounts_check
  CHECK ((payment_provider = 'paypal' AND clp_per_usd IS NOT NULL
       AND fx_observation_date IS NOT NULL AND total_usd_cents IS NOT NULL
       AND fx_source IS NOT NULL)
    OR (payment_provider = 'webpay' AND clp_per_usd IS NULL
       AND fx_observation_date IS NULL AND total_usd_cents IS NULL
       AND fx_source IS NULL));

-- Existing reservation logic is copied below under a separate RPC, with its
-- original price/stock locks and checks intact; Webpay stores only CLP.

CREATE FUNCTION public.claim_webpay_commit(p_token text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE current_order public.merch_orders%ROWTYPE;
BEGIN
  SELECT * INTO current_order FROM public.merch_orders
    WHERE webpay_token=p_token AND payment_provider='webpay' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF current_order.status='paid' THEN RETURN 'paid'; END IF;
  IF current_order.status='capture_pending' THEN RETURN 'in_progress'; END IF;
  IF current_order.status NOT IN ('awaiting_approval','abandoned') THEN RETURN 'invalid'; END IF;
  IF current_order.status='abandoned' AND
    (current_order.reservation_state NOT IN ('expired','released')) THEN RETURN 'invalid'; END IF;
  -- A late authorization is still verified and recorded, so it can be handled
  -- as an exception. It must not silently consume another buyer's reserve.
  IF current_order.reservation_state='held' AND
     current_order.reservation_expires_at>clock_timestamp() THEN
    UPDATE public.merch_orders SET status='capture_pending',
      reservation_state='capturing', reservation_claimed_at=clock_timestamp(),
      webpay_commit_claimed_at=clock_timestamp() WHERE id=current_order.id;
  ELSE
    UPDATE public.merch_orders SET status='capture_pending',
      reservation_state='expired', webpay_commit_claimed_at=clock_timestamp()
      WHERE id=current_order.id;
  END IF;
  RETURN 'claimed';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_webpay_commit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webpay_commit(text) TO service_role;

CREATE FUNCTION public.reserve_webpay_order(
  p_buyer_name text, p_buyer_contact text, p_items jsonb,
  p_origin text, p_session_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  line jsonb; product_id text; variant_id text; option_id text;
  requested integer; unit_price integer; subtotal integer := 0;
  held integer; physical integer; confirmed boolean;
  product public.products%ROWTYPE; variant public.product_variants%ROWTYPE;
  new_id uuid; expires_at timestamptz := clock_timestamp() + interval '15 minutes';
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

REVOKE ALL ON FUNCTION public.reserve_webpay_order(text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_webpay_order(text,text,jsonb,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.allocate_merch_stock_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  line jsonb; product_id text; variant_id text; requested integer;
  physical integer; confirmed boolean; other_held integer; taken integer;
  remaining integer := 0; allocations jsonb := '[]'::jsonb;
  late boolean;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN RETURN NEW; END IF;
  IF NEW.paid_at IS NULL OR
     (NEW.payment_provider='paypal' AND NEW.paypal_capture_id IS NULL) OR
     (NEW.payment_provider='webpay' AND
       (NEW.webpay_token IS NULL OR NEW.webpay_authorization_code IS NULL)) THEN
    RAISE EXCEPTION 'A paid order needs a verified capture and paid_at';
  END IF;
  late := OLD.reservation_state IN ('expired','released') OR
    (OLD.reservation_state = 'held' AND OLD.reservation_expires_at <= clock_timestamp());
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.items)
              ORDER BY value->>'productId',value->>'variantId',value->>'optionId'
  LOOP
    product_id := line->>'productId';
    variant_id := NULLIF(line->>'variantId','');
    IF product_id IS NULL OR line->>'quantity' !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'Invalid order inventory snapshot';
    END IF;
    requested := (line->>'quantity')::integer;
    IF requested NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid order quantity'; END IF;
    physical := NULL; confirmed := false;
    PERFORM 1 FROM public.products p WHERE p.id = product_id FOR UPDATE;
    IF variant_id IS NOT NULL THEN
      SELECT v.stock,v.stock_confirmed INTO physical,confirmed
      FROM public.product_variants v WHERE v.product_id=product_id AND v.id=variant_id FOR UPDATE;
    ELSE
      SELECT p.stock,p.stock_confirmed INTO physical,confirmed
      FROM public.products p WHERE p.id=product_id AND NOT EXISTS
        (SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id) FOR UPDATE;
    END IF;
    SELECT COALESCE(sum(r.quantity),0)::integer INTO other_held
    FROM public.merch_reservation_lines r JOIN public.merch_orders o ON o.id=r.order_id
    WHERE r.product_id=product_id AND r.variant_id IS NOT DISTINCT FROM variant_id
      AND r.order_id <> NEW.id AND
      (o.reservation_state='capturing' OR
       (o.reservation_state='held' AND o.reservation_expires_at>clock_timestamp()));
    taken := CASE WHEN confirmed THEN LEAST(GREATEST(COALESCE(physical,0)-other_held,0),requested)
                  ELSE 0 END;
    IF taken > 0 THEN
      IF variant_id IS NOT NULL THEN
        UPDATE public.product_variants v SET stock=v.stock-taken
          WHERE v.id=variant_id AND v.product_id=product_id;
      ELSE
        UPDATE public.products p SET stock=p.stock-taken WHERE p.id=product_id;
      END IF;
    END IF;
    remaining := remaining+requested-taken;
    allocations := allocations || jsonb_build_array(jsonb_build_object(
      'productId',product_id,'variantId',variant_id,'optionId',line->>'optionId',
      'name',line->>'name','option',line->>'option',
      'requested',requested,'allocated',taken,'shortage',requested-taken));
  END LOOP;
  IF jsonb_array_length(allocations)=0 THEN RAISE EXCEPTION 'Empty paid order'; END IF;
  NEW.stock_allocations := allocations;
  NEW.stock_state := CASE WHEN remaining=0 THEN 'allocated' ELSE 'shortage' END;
  NEW.stock_processed_at := clock_timestamp();
  NEW.reservation_state := CASE WHEN OLD.reservation_state='legacy' THEN 'legacy'
    WHEN late OR remaining>0 THEN 'exception' ELSE 'consumed' END;
  NEW.reservation_issue := CASE WHEN late THEN 'late_capture'
    WHEN remaining>0 AND OLD.reservation_state<>'legacy' THEN 'stock_shortage' ELSE NULL END;
  NEW.fulfillment_status := CASE WHEN remaining=0 AND NOT late THEN 'new' ELSE 'on_hold' END;
  RETURN NEW;
END;
$$;
