-- Run in SQL Editor on the Sandbox project. All writes are rolled back.
BEGIN;
DO $test$
DECLARE
  sample uuid;
  physical_before bigint;
  physical_after bigint;
  rejected boolean := false;
  current_order record;
  original_order record;
BEGIN
  SELECT id INTO sample FROM public.merch_orders
  WHERE order_environment = 'test' AND status = 'paid'
    AND test_fulfillment_status IS NULL LIMIT 1 FOR UPDATE;
  IF sample IS NULL THEN RAISE EXCEPTION 'A fresh paid Sandbox order is needed'; END IF;
  SELECT status, fulfillment_status, fulfillment_note, ready_at, handed_over_at
    INTO original_order FROM public.merch_orders WHERE id = sample;

  SELECT (SELECT coalesce(sum(stock), 0) FROM public.products) +
         (SELECT coalesce(sum(stock), 0) FROM public.product_variants)
    INTO physical_before;
  UPDATE public.merch_orders SET test_fulfillment_status = 'preparing' WHERE id = sample;
  UPDATE public.merch_orders SET test_fulfillment_status = 'ready',
    test_fulfillment_note = 'Solo práctica' WHERE id = sample;
  UPDATE public.merch_orders SET test_fulfillment_status = 'handed_over' WHERE id = sample;

  BEGIN
    UPDATE public.merch_orders SET test_fulfillment_status = 'new' WHERE id = sample;
  EXCEPTION WHEN raise_exception THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid stage transition was accepted'; END IF;

  SELECT status, fulfillment_status, fulfillment_note, ready_at,
    handed_over_at, test_fulfillment_status, test_ready_at, test_handed_over_at
    INTO current_order FROM public.merch_orders WHERE id = sample;
  SELECT (SELECT coalesce(sum(stock), 0) FROM public.products) +
         (SELECT coalesce(sum(stock), 0) FROM public.product_variants)
    INTO physical_after;
  IF current_order.status IS DISTINCT FROM original_order.status OR
     current_order.fulfillment_status IS DISTINCT FROM original_order.fulfillment_status OR
     current_order.fulfillment_note IS DISTINCT FROM original_order.fulfillment_note OR
     current_order.ready_at IS DISTINCT FROM original_order.ready_at OR
     current_order.handed_over_at IS DISTINCT FROM original_order.handed_over_at OR
     current_order.test_fulfillment_status <> 'handed_over' OR
     current_order.test_ready_at IS NULL OR current_order.test_handed_over_at IS NULL OR
     physical_before IS DISTINCT FROM physical_after THEN
    RAISE EXCEPTION 'Practice altered a real order field or inventory';
  END IF;
  RAISE NOTICE 'merch_sandbox_practice: OK';
END;
$test$;
ROLLBACK;
