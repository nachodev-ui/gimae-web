-- Ejecutar en SQL Editor del proyecto Sandbox. Toda la prueba se revierte.
BEGIN;
DO $$
DECLARE
  first_id uuid;
  variant_id uuid;
  available integer;
  state text;
  assigned integer;
BEGIN
  INSERT INTO public.products(id,name,price_clp,stock,stock_confirmed,active)
    VALUES ('stock_test_general','Stock test general',1000,3,true,false),
           ('stock_test_variant','Stock test variant',1000,0,false,false);
  INSERT INTO public.product_variants(id,product_id,label,price_clp,stock,stock_confirmed)
    VALUES ('stock_test_variant_m','stock_test_variant','M',1000,2,true);

  INSERT INTO public.merch_orders
    (buyer_name,buyer_contact,items,subtotal_clp,total_clp,clp_per_usd,fx_observation_date,total_usd_cents,status)
    VALUES ('Sandbox Tester','test@example.invalid',
      '[{"productId":"stock_test_general","optionId":"default","variantId":null,"quantity":2,"name":"Stock test general","lineTotalClp":2000}]'::jsonb,
      2000,2000,1000,current_date,200,'capture_pending') RETURNING id INTO first_id;
  UPDATE public.merch_orders SET status='paid',paypal_capture_id='STOCKTEST_GENERAL',paid_at=now()
    WHERE id=first_id;
  SELECT stock INTO available FROM public.products WHERE id='stock_test_general';
  IF available <> 1 THEN RAISE EXCEPTION 'El producto general no se descontó: %', available; END IF;
  UPDATE public.merch_orders SET status='paid' WHERE id=first_id;
  SELECT stock INTO available FROM public.products WHERE id='stock_test_general';
  IF available <> 1 THEN RAISE EXCEPTION 'Un reintento descontó dos veces: %', available; END IF;
  UPDATE public.merch_orders SET fulfillment_status='preparing' WHERE id=first_id;
  UPDATE public.merch_orders SET fulfillment_status='ready' WHERE id=first_id;
  UPDATE public.merch_orders SET fulfillment_status='handed_over' WHERE id=first_id;
  SELECT fulfillment_status INTO state FROM public.merch_orders WHERE id=first_id;
  IF state <> 'handed_over' THEN RAISE EXCEPTION 'La preparación no avanzó'; END IF;

  INSERT INTO public.merch_orders
    (buyer_name,buyer_contact,items,subtotal_clp,total_clp,clp_per_usd,fx_observation_date,total_usd_cents,status)
    VALUES ('Sandbox Tester','test@example.invalid',
      '[{"productId":"stock_test_variant","optionId":"stock_test_variant_m","variantId":"stock_test_variant_m","quantity":3,"name":"Stock test variant","option":"M","lineTotalClp":3000}]'::jsonb,
      3000,3000,1000,current_date,300,'capture_pending') RETURNING id INTO variant_id;
  UPDATE public.merch_orders SET status='paid',paypal_capture_id='STOCKTEST_VARIANT',paid_at=now()
    WHERE id=variant_id;
  SELECT stock_state,(stock_allocations->0->>'allocated')::integer INTO state,assigned
    FROM public.merch_orders WHERE id=variant_id;
  IF state <> 'shortage' OR assigned <> 2 THEN
    RAISE EXCEPTION 'Faltante no detectado: %, % asignadas', state, assigned;
  END IF;
  SELECT stock INTO available FROM public.products WHERE id='stock_test_variant';
  IF available <> 0 THEN RAISE EXCEPTION 'El resumen de variantes no se actualizó'; END IF;
  UPDATE public.product_variants SET stock=1 WHERE id='stock_test_variant_m';
  state := public.recheck_merch_order_stock(variant_id);
  IF state <> 'allocated' THEN RAISE EXCEPTION 'No se asignó el faltante: %', state; END IF;
  SELECT stock INTO available FROM public.product_variants WHERE id='stock_test_variant_m';
  IF available <> 0 THEN RAISE EXCEPTION 'La reposición se descontó incorrectamente'; END IF;
  SELECT fulfillment_status INTO state FROM public.merch_orders WHERE id=variant_id;
  IF state <> 'new' THEN RAISE EXCEPTION 'El pedido no volvió a la cola: %', state; END IF;
END $$;
ROLLBACK;
SELECT 'Prueba transaccional completa; sin cambios permanentes' AS resultado;
