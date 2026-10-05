-- Corrige la resolución de variables PL/pgSQL en ambos caminos de inventario.
CREATE OR REPLACE FUNCTION public.allocate_merch_stock_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  line jsonb;
  product_id text;
  variant_id text;
  requested integer;
  available integer;
  confirmed boolean;
  taken integer;
  remaining integer := 0;
  allocations jsonb := '[]'::jsonb;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN RETURN NEW; END IF;
  IF NEW.paypal_capture_id IS NULL OR NEW.paid_at IS NULL THEN
    RAISE EXCEPTION 'A paid order needs a verified capture and paid_at';
  END IF;

  -- Orden estable de bloqueos entre pedidos concurrentes con varios productos.
  FOR line IN
    SELECT value FROM jsonb_array_elements(NEW.items)
    ORDER BY value->>'productId', value->>'variantId', value->>'optionId'
  LOOP
    product_id := line->>'productId';
    variant_id := NULLIF(line->>'variantId', '');
    IF product_id IS NULL OR line->>'quantity' !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'Invalid order inventory snapshot';
    END IF;
    requested := (line->>'quantity')::integer;
    IF requested < 1 OR requested > 20 THEN
      RAISE EXCEPTION 'Invalid order quantity';
    END IF;
    available := NULL;
    confirmed := false;
    -- Serializa pedidos que comparten producto antes de bloquear variantes.
    PERFORM 1 FROM public.products p WHERE p.id = product_id FOR UPDATE;
    IF variant_id IS NOT NULL THEN
      SELECT v.stock, v.stock_confirmed INTO available, confirmed
      FROM public.product_variants v
      WHERE v.product_id = product_id AND v.id = variant_id FOR UPDATE;
    ELSE
      SELECT p.stock, p.stock_confirmed INTO available, confirmed
      FROM public.products p
      WHERE p.id = product_id AND NOT EXISTS (
        SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id
      ) FOR UPDATE;
    END IF;
    taken := CASE WHEN confirmed THEN LEAST(COALESCE(available, 0), requested) ELSE 0 END;
    IF taken > 0 THEN
      IF variant_id IS NOT NULL THEN
        UPDATE public.product_variants SET stock = stock - taken
        WHERE id = variant_id AND product_id = product_id;
      ELSE
        UPDATE public.products SET stock = stock - taken WHERE id = product_id;
      END IF;
    END IF;
    remaining := remaining + requested - taken;
    allocations := allocations || jsonb_build_array(jsonb_build_object(
      'productId', product_id, 'variantId', variant_id,
      'optionId', line->>'optionId', 'name', line->>'name', 'option', line->>'option',
      'requested', requested, 'allocated', taken, 'shortage', requested - taken
    ));
  END LOOP;
  IF jsonb_array_length(allocations) = 0 THEN RAISE EXCEPTION 'Empty paid order'; END IF;
  NEW.stock_allocations := allocations;
  NEW.stock_state := CASE WHEN remaining = 0 THEN 'allocated' ELSE 'shortage' END;
  NEW.stock_processed_at := now();
  NEW.fulfillment_status := CASE WHEN remaining = 0 THEN 'new' ELSE 'on_hold' END;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.recheck_merch_order_stock(p_order_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  current_order public.merch_orders%ROWTYPE;
  line jsonb;
  product_id text;
  variant_id text;
  missing integer;
  available integer;
  confirmed boolean;
  taken integer;
  remaining integer := 0;
  allocations jsonb := '[]'::jsonb;
  next_state text;
BEGIN
  SELECT * INTO current_order FROM public.merch_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR current_order.status <> 'paid' THEN RAISE EXCEPTION 'Paid order not found'; END IF;
  IF current_order.stock_state = 'legacy_review' THEN
    RAISE EXCEPTION 'Historical paid order needs manual stock audit';
  END IF;
  IF current_order.stock_state = 'allocated' THEN RETURN 'allocated'; END IF;
  FOR line IN
    SELECT value FROM jsonb_array_elements(current_order.stock_allocations)
    ORDER BY value->>'productId', value->>'variantId', value->>'optionId'
  LOOP
    product_id := line->>'productId';
    variant_id := NULLIF(line->>'variantId', '');
    missing := (line->>'shortage')::integer;
    taken := 0;
    IF missing > 0 THEN
      available := NULL;
      confirmed := false;
      PERFORM 1 FROM public.products p WHERE p.id = product_id FOR UPDATE;
      IF variant_id IS NOT NULL THEN
        SELECT v.stock, v.stock_confirmed INTO available, confirmed
        FROM public.product_variants v
        WHERE v.product_id = product_id AND v.id = variant_id FOR UPDATE;
      ELSE
        SELECT p.stock, p.stock_confirmed INTO available, confirmed
        FROM public.products p WHERE p.id = product_id
        AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id)
        FOR UPDATE;
      END IF;
      taken := CASE WHEN confirmed THEN LEAST(COALESCE(available, 0), missing) ELSE 0 END;
      IF taken > 0 THEN
        IF variant_id IS NOT NULL THEN
          UPDATE public.product_variants SET stock = stock - taken
          WHERE id = variant_id AND product_id = product_id;
        ELSE
          UPDATE public.products SET stock = stock - taken WHERE id = product_id;
        END IF;
      END IF;
    END IF;
    remaining := remaining + missing - taken;
    allocations := allocations || jsonb_build_array(line || jsonb_build_object(
      'allocated', (line->>'allocated')::integer + taken, 'shortage', missing - taken
    ));
  END LOOP;
  next_state := CASE WHEN remaining = 0 THEN 'allocated' ELSE 'shortage' END;
  UPDATE public.merch_orders SET stock_allocations = allocations, stock_state = next_state,
    stock_processed_at = now(),
    fulfillment_status = CASE WHEN next_state = 'allocated' AND fulfillment_status = 'on_hold'
      THEN 'new' ELSE fulfillment_status END
  WHERE id = p_order_id;
  RETURN next_state;
END
$$;
