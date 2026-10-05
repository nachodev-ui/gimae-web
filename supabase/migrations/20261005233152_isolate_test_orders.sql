-- En este proyecto solo se han cobrado pedidos Sandbox/integración.
-- La etiqueta inicial es deliberadamente test; una futura compra real necesita
-- p_environment='live' explícito desde la Edge Function de PayPal.
ALTER TABLE public.merch_orders ADD COLUMN order_environment text NOT NULL DEFAULT 'test'
  CHECK (order_environment IN ('test','live'));
ALTER TABLE public.merch_orders ADD CONSTRAINT merch_orders_webpay_only_test
  CHECK (payment_provider <> 'webpay' OR order_environment = 'test');
ALTER TABLE public.merch_orders DROP CONSTRAINT merch_orders_fulfillment_status_check;
ALTER TABLE public.merch_orders ADD CONSTRAINT merch_orders_fulfillment_status_check
  CHECK (fulfillment_status IN ('unpaid','new','preparing','ready','handed_over','on_hold','test'));
ALTER TABLE public.merch_orders DROP CONSTRAINT merch_orders_stock_state_check;
ALTER TABLE public.merch_orders ADD CONSTRAINT merch_orders_stock_state_check
  CHECK (stock_state IN ('pending','allocated','shortage','legacy_review','not_applicable'));
CREATE INDEX merch_orders_live_queue ON public.merch_orders(paid_at DESC)
  WHERE status='paid' AND order_environment='live';

-- El entorno y el proveedor forman parte del registro financiero inmutable.
CREATE FUNCTION public.guard_merch_order_environment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.order_environment IS DISTINCT FROM OLD.order_environment OR
     NEW.payment_provider IS DISTINCT FROM OLD.payment_provider THEN
    RAISE EXCEPTION 'Payment environment and provider are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_merch_order_environment
BEFORE UPDATE OF order_environment, payment_provider ON public.merch_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_merch_order_environment();
REVOKE ALL ON FUNCTION public.guard_merch_order_environment() FROM PUBLIC, anon, authenticated;


CREATE FUNCTION public.reserve_merch_order(
  p_buyer_name text, p_buyer_contact text, p_items jsonb,
  p_fx numeric, p_rate_date date, p_usd_cents integer, p_environment text
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
     p_fx <= 0 OR p_rate_date IS NULL OR p_usd_cents <= 0 OR
     p_environment NOT IN ('test','live') OR p_environment IS NULL THEN
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
    SELECT * INTO product FROM public.products p WHERE p.id = product_id
      FOR UPDATE;
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
    IF p_environment='live' THEN
    SELECT COALESCE(sum(r.quantity),0)::integer INTO held
    FROM public.merch_reservation_lines r JOIN public.merch_orders o ON o.id = r.order_id
    WHERE r.product_id = product_id AND r.variant_id IS NOT DISTINCT FROM variant_id
      AND o.order_environment='live'
      AND (o.reservation_state = 'capturing' OR
           (o.reservation_state = 'held' AND o.reservation_expires_at > clock_timestamp()));
    IF NOT confirmed OR physical - held < requested THEN
      RAISE EXCEPTION 'No confirmed stock available for reservation';
    END IF;
    END IF;
    subtotal := subtotal + requested * unit_price;
  END LOOP;
  IF subtotal < 1 OR subtotal > 2000000 THEN RAISE EXCEPTION 'Invalid subtotal'; END IF;
  INSERT INTO public.merch_orders(buyer_name,buyer_contact,items,subtotal_clp,total_clp,
      clp_per_usd,fx_observation_date,total_usd_cents,reservation_state,reservation_expires_at,order_environment)
    VALUES(p_buyer_name,p_buyer_contact,p_items,subtotal,subtotal,
      p_fx,p_rate_date,p_usd_cents,'held',expires_at,p_environment) RETURNING id INTO new_id;
  IF p_environment='live' THEN
  INSERT INTO public.merch_reservation_lines(order_id,product_id,variant_id,option_id,quantity)
    SELECT new_id, value->>'productId', NULLIF(value->>'variantId',''),
      value->>'optionId', (value->>'quantity')::integer FROM jsonb_array_elements(p_items);
  END IF;
  RETURN jsonb_build_object('id',new_id,'expiresAt',expires_at);
END;
$$;


REVOKE ALL ON FUNCTION public.reserve_merch_order(text,text,jsonb,numeric,date,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_merch_order(text,text,jsonb,numeric,date,integer,text)
  TO service_role;
-- Compatibilidad con instancias Edge aún desplegadas en Sandbox: test por defecto.
CREATE OR REPLACE FUNCTION public.reserve_merch_order(
  p_buyer_name text, p_buyer_contact text, p_items jsonb,
  p_fx numeric, p_rate_date date, p_usd_cents integer
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.reserve_merch_order(p_buyer_name,p_buyer_contact,p_items,
    p_fx,p_rate_date,p_usd_cents,'test')
$$;
REVOKE ALL ON FUNCTION public.reserve_merch_order(text,text,jsonb,numeric,date,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_merch_order(text,text,jsonb,numeric,date,integer) TO service_role;


CREATE OR REPLACE FUNCTION public.reserve_webpay_order(
  p_buyer_name text, p_buyer_contact text, p_items jsonb,
  p_origin text, p_session_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  line jsonb; product_id text; variant_id text; option_id text;
  requested integer; unit_price integer; subtotal integer := 0;
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
      IF variant.price_clp <> unit_price THEN RAISE EXCEPTION 'Price changed'; END IF;
    ELSE
      IF option_id <> 'default' OR EXISTS (
        SELECT 1 FROM public.product_variants v WHERE v.product_id = product_id
      ) THEN RAISE EXCEPTION 'Variant required'; END IF;
      IF product.price_clp <> unit_price THEN RAISE EXCEPTION 'Price changed'; END IF;
    END IF;
    subtotal := subtotal + requested * unit_price;
  END LOOP;
  IF subtotal < 1 OR subtotal > 2000000 THEN RAISE EXCEPTION 'Invalid subtotal'; END IF;
  INSERT INTO public.merch_orders(buyer_name,buyer_contact,items,subtotal_clp,total_clp,
      payment_provider,fx_source,reservation_state,reservation_expires_at,
      webpay_buy_order,webpay_session_id,webpay_return_origin,order_environment)
    VALUES(p_buyer_name,p_buyer_contact,p_items,subtotal,subtotal,
      'webpay',NULL,'held',expires_at,
      'G' || substr(replace(gen_random_uuid()::text,'-',''),1,24),p_session_id,p_origin,'test')
    RETURNING id INTO new_id;
  RETURN jsonb_build_object('id',new_id,'expiresAt',expires_at);
END;
$$;

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
  IF NEW.order_environment='test' THEN
    NEW.stock_allocations := '[]'::jsonb;
    NEW.stock_state := 'not_applicable';
    NEW.stock_processed_at := clock_timestamp();
    NEW.reservation_state := 'consumed';
    NEW.reservation_issue := NULL;
    NEW.fulfillment_status := 'test';
    RETURN NEW;
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
      AND o.order_environment='live' AND r.order_id <> NEW.id AND
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

CREATE OR REPLACE FUNCTION public.guard_merch_fulfillment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'paid' THEN RAISE EXCEPTION 'Only paid orders can be prepared'; END IF;
  IF OLD.order_environment='test' THEN
    IF NEW.fulfillment_note IS DISTINCT FROM OLD.fulfillment_note OR
       (NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status AND
        NEW.fulfillment_status <> 'test') THEN
      RAISE EXCEPTION 'Test orders cannot be prepared';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status THEN
    IF NEW.fulfillment_status <> 'on_hold' AND
       (NEW.stock_state <> 'allocated' OR NEW.reservation_issue IS NOT NULL) THEN
      RAISE EXCEPTION 'Stock or reservation exception needs review before preparing';
    END IF;
    IF NOT (
      (OLD.fulfillment_status='new' AND NEW.fulfillment_status IN ('preparing','on_hold')) OR
      (OLD.fulfillment_status='preparing' AND NEW.fulfillment_status IN ('ready','on_hold')) OR
      (OLD.fulfillment_status='ready' AND NEW.fulfillment_status IN ('handed_over','on_hold')) OR
      (OLD.fulfillment_status='on_hold' AND NEW.fulfillment_status='new')
    ) THEN RAISE EXCEPTION 'Invalid fulfillment transition'; END IF;
    IF NEW.fulfillment_status='ready' THEN NEW.ready_at := now(); END IF;
    IF NEW.fulfillment_status='handed_over' THEN NEW.handed_over_at := now(); END IF;
  END IF;
  IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status OR
     NEW.fulfillment_note IS DISTINCT FROM OLD.fulfillment_note THEN
    NEW.fulfillment_updated_at := now();
    NEW.fulfillment_updated_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;


-- Conservar allocations históricas como auditoría, pero sacar todas las pruebas
-- previas de la cola operativa. El inventario ya modificado no se corrige aquí:
-- requiere conteo físico y cotejo con ajustes manuales anteriores.
UPDATE public.merch_orders SET fulfillment_status='test'
WHERE order_environment='test' AND status='paid' AND fulfillment_status<>'test';


CREATE OR REPLACE FUNCTION public.recheck_merch_order_stock(p_order_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  current_order public.merch_orders%ROWTYPE; line jsonb;
  product_id text; variant_id text; missing integer;
  physical integer; confirmed boolean; held integer; taken integer;
  remaining integer := 0; allocations jsonb := '[]'::jsonb; next_state text;
BEGIN
  SELECT * INTO current_order FROM public.merch_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR current_order.status<>'paid' THEN RAISE EXCEPTION 'Paid order not found'; END IF;
  IF current_order.order_environment<>'live' THEN RAISE EXCEPTION 'Test order has no stock to recheck'; END IF;
  IF current_order.stock_state='legacy_review' THEN RAISE EXCEPTION 'Historical order needs manual audit'; END IF;
  IF current_order.stock_state='allocated' THEN RETURN 'allocated'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(current_order.stock_allocations)
              ORDER BY value->>'productId',value->>'variantId',value->>'optionId'
  LOOP
    product_id := line->>'productId'; variant_id := NULLIF(line->>'variantId','');
    missing := (line->>'shortage')::integer; taken := 0;
    IF missing > 0 THEN
      physical := NULL; confirmed := false;
      PERFORM 1 FROM public.products p WHERE p.id=product_id FOR UPDATE;
      IF variant_id IS NOT NULL THEN
        SELECT v.stock,v.stock_confirmed INTO physical,confirmed
        FROM public.product_variants v WHERE v.product_id=product_id AND v.id=variant_id FOR UPDATE;
      ELSE
        SELECT p.stock,p.stock_confirmed INTO physical,confirmed
        FROM public.products p WHERE p.id=product_id AND NOT EXISTS
          (SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id) FOR UPDATE;
      END IF;
      SELECT COALESCE(sum(r.quantity),0)::integer INTO held
      FROM public.merch_reservation_lines r JOIN public.merch_orders o ON o.id=r.order_id
      WHERE r.product_id=product_id AND r.variant_id IS NOT DISTINCT FROM variant_id
        AND o.order_environment='live' AND (o.reservation_state='capturing' OR
          (o.reservation_state='held' AND o.reservation_expires_at>clock_timestamp()));
      taken := CASE WHEN confirmed THEN LEAST(GREATEST(COALESCE(physical,0)-held,0),missing)
                    ELSE 0 END;
      IF taken>0 THEN
        IF variant_id IS NOT NULL THEN
          UPDATE public.product_variants v SET stock=v.stock-taken
            WHERE v.id=variant_id AND v.product_id=product_id;
        ELSE
          UPDATE public.products p SET stock=p.stock-taken WHERE p.id=product_id;
        END IF;
      END IF;
    END IF;
    remaining := remaining+missing-taken;
    allocations := allocations || jsonb_build_array(line || jsonb_build_object(
      'allocated',(line->>'allocated')::integer+taken,'shortage',missing-taken));
  END LOOP;
  next_state := CASE WHEN remaining=0 THEN 'allocated' ELSE 'shortage' END;
  UPDATE public.merch_orders SET stock_allocations=allocations,stock_state=next_state,
    stock_processed_at=clock_timestamp(),
    reservation_issue=CASE WHEN next_state='allocated' AND reservation_issue='stock_shortage'
      THEN NULL ELSE reservation_issue END,
    reservation_state=CASE WHEN next_state='allocated' AND reservation_issue='stock_shortage'
      THEN 'consumed' ELSE reservation_state END,
    fulfillment_status=CASE WHEN next_state='allocated' AND
      (reservation_issue IS NULL OR reservation_issue='stock_shortage') AND
      fulfillment_status='on_hold' THEN 'new' ELSE fulfillment_status END
  WHERE id=p_order_id;
  RETURN next_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_merch_reservation_exception(
  p_order_id uuid, p_user_id uuid, p_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE current_order public.merch_orders%ROWTYPE;
BEGIN
  IF length(trim(p_note)) NOT BETWEEN 8 AND 300 THEN RAISE EXCEPTION 'Review note required'; END IF;
  SELECT * INTO current_order FROM public.merch_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR current_order.status<>'paid' OR current_order.order_environment<>'live' OR
     current_order.reservation_issue<>'late_capture'
     OR current_order.stock_state<>'allocated' OR current_order.fulfillment_status<>'on_hold' THEN
    RAISE EXCEPTION 'Order cannot resume without stock and late-capture review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'Backstage review required';
  END IF;
  UPDATE public.merch_orders SET reservation_issue=NULL,reservation_state='consumed',
    reservation_reviewed_at=clock_timestamp(),reservation_reviewed_by=p_user_id,
    fulfillment_note=left(trim(p_note),500),fulfillment_status='new'
  WHERE id=p_order_id;
  RETURN true;
END;
$$;
