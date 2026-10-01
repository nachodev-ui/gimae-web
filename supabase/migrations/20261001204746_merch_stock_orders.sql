-- Una captura pagada contabiliza inventario una sola vez, dentro del mismo UPDATE.
-- Los pagos anteriores a esta migración quedan para revisión; nunca se descuentan retroactivamente.
ALTER TABLE public.merch_orders
  ADD COLUMN stock_state text NOT NULL DEFAULT 'pending'
    CHECK (stock_state IN ('pending', 'allocated', 'shortage', 'legacy_review')),
  ADD COLUMN stock_allocations jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(stock_allocations) = 'array'),
  ADD COLUMN stock_processed_at timestamptz,
  ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (fulfillment_status IN ('unpaid', 'new', 'preparing', 'ready', 'handed_over', 'on_hold')),
  ADD COLUMN fulfillment_note text NOT NULL DEFAULT '' CHECK (length(fulfillment_note) <= 500),
  ADD COLUMN fulfillment_updated_at timestamptz,
  ADD COLUMN fulfillment_updated_by uuid,
  ADD COLUMN ready_at timestamptz,
  ADD COLUMN handed_over_at timestamptz;

UPDATE public.merch_orders
SET stock_state = 'legacy_review', fulfillment_status = 'on_hold',
    fulfillment_note = 'Pago anterior al control de stock: comprobar unidades y entrega manualmente.'
WHERE status = 'paid';

CREATE INDEX merch_orders_fulfillment_queue ON public.merch_orders(fulfillment_status, paid_at DESC)
  WHERE status = 'paid';

-- La fila del pedido se bloquea durante el UPDATE de pago. Otros webhooks o la
-- conciliación de la misma orden ven ya el estado paid y no ejecutan otro descuento.
CREATE FUNCTION public.allocate_merch_stock_on_payment()
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

CREATE TRIGGER allocate_merch_stock_on_payment
BEFORE UPDATE OF status ON public.merch_orders
FOR EACH ROW WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.allocate_merch_stock_on_payment();
REVOKE ALL ON FUNCTION public.allocate_merch_stock_on_payment() FROM PUBLIC, anon, authenticated;

-- La API solo puede editar dos columnas operativas y solo desde una cuenta
-- autorizada del Backstage. El estado financiero, los ítems y el ledger son inmutables allí.
GRANT UPDATE (fulfillment_status, fulfillment_note) ON public.merch_orders TO authenticated;
CREATE POLICY merch_orders_admin_fulfillment ON public.merch_orders
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));

CREATE FUNCTION public.guard_merch_fulfillment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'paid' THEN RAISE EXCEPTION 'Only paid orders can be prepared'; END IF;
  IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status THEN
    IF NEW.fulfillment_status <> 'on_hold' AND NEW.stock_state <> 'allocated' THEN
      RAISE EXCEPTION 'Stock needs review before preparing';
    END IF;
    IF NOT (
      (OLD.fulfillment_status = 'new' AND NEW.fulfillment_status IN ('preparing', 'on_hold')) OR
      (OLD.fulfillment_status = 'preparing' AND NEW.fulfillment_status IN ('ready', 'on_hold')) OR
      (OLD.fulfillment_status = 'ready' AND NEW.fulfillment_status IN ('handed_over', 'on_hold')) OR
      (OLD.fulfillment_status = 'on_hold' AND NEW.fulfillment_status = 'new')
    ) THEN RAISE EXCEPTION 'Invalid fulfillment transition'; END IF;
    IF NEW.fulfillment_status = 'ready' THEN NEW.ready_at := now(); END IF;
    IF NEW.fulfillment_status = 'handed_over' THEN NEW.handed_over_at := now(); END IF;
  END IF;
  IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status OR
     NEW.fulfillment_note IS DISTINCT FROM OLD.fulfillment_note THEN
    NEW.fulfillment_updated_at := now();
    NEW.fulfillment_updated_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER guard_merch_fulfillment
BEFORE UPDATE OF fulfillment_status, fulfillment_note ON public.merch_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_merch_fulfillment();
REVOKE ALL ON FUNCTION public.guard_merch_fulfillment() FROM PUBLIC, anon, authenticated;

-- Solo la Edge Function autenticada con su service role puede invocar esta
-- función. Reintentar tras reponer stock reserva únicamente el faltante.
CREATE FUNCTION public.recheck_merch_order_stock(p_order_id uuid)
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

REVOKE ALL ON FUNCTION public.recheck_merch_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recheck_merch_order_stock(uuid) TO service_role;
