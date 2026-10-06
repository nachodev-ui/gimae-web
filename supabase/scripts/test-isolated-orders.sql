-- Ejecutar en el SQL Editor DESPUÉS de la migración. No deja datos: ROLLBACK.
BEGIN;
DO $test$
DECLARE
  web jsonb; sandbox jsonb; live jsonb; result text; before_stock integer; after_stock integer;
  item jsonb := '[{"productId":"04","optionId":"group","variantId":"group","name":"Chekis","option":"Grupal","quantity":1,"unitPriceClp":5000,"lineTotalClp":5000}]'::jsonb;
  token text := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
BEGIN
  SELECT stock INTO before_stock FROM public.product_variants WHERE product_id='04' AND id='group';
  IF before_stock IS NULL THEN RAISE EXCEPTION 'Variant fixture missing'; END IF;
  web := public.reserve_webpay_order('Prueba Webpay','test@example.org',item,
    'http://localhost:8000',gen_random_uuid()::text);
  sandbox := public.reserve_merch_order('Prueba PayPal','test@example.org',item,
    950,current_date,526,'test');
  IF EXISTS (SELECT 1 FROM public.merch_reservation_lines
    WHERE order_id IN ((web->>'id')::uuid,(sandbox->>'id')::uuid)) THEN
    RAISE EXCEPTION 'Test order reserved physical inventory';
  END IF;
  UPDATE public.merch_orders SET status='awaiting_approval',webpay_token=token
    WHERE id=(web->>'id')::uuid;
  result := public.claim_webpay_commit(token);
  IF result<>'claimed' THEN RAISE EXCEPTION 'Commit claim failed: %',result; END IF;
  UPDATE public.merch_orders SET status='paid',webpay_authorization_code='TEST',paid_at=clock_timestamp()
    WHERE id=(web->>'id')::uuid;
  UPDATE public.merch_orders SET status='paid',paypal_capture_id='TEST_' || replace(gen_random_uuid()::text,'-',''),paid_at=clock_timestamp()
    WHERE id=(sandbox->>'id')::uuid;
  SELECT stock INTO after_stock FROM public.product_variants WHERE product_id='04' AND id='group';
  IF after_stock IS DISTINCT FROM before_stock THEN RAISE EXCEPTION 'Test payment changed real stock'; END IF;
  IF (SELECT count(*) FROM public.merch_orders
      WHERE id IN ((web->>'id')::uuid,(sandbox->>'id')::uuid)
      AND status='paid' AND order_environment='test' AND stock_state='not_applicable'
      AND fulfillment_status='test' AND stock_allocations='[]'::jsonb)<>2 THEN
    RAISE EXCEPTION 'Test payments entered the operational queue';
  END IF;
  BEGIN
    PERFORM public.recheck_merch_order_stock((web->>'id')::uuid);
    RAISE EXCEPTION 'Test order could recheck physical stock';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Test order has no stock to recheck' THEN RAISE; END IF;
  END;
  -- A Live order still checks available stock and discounts exactly once.
  UPDATE public.product_variants SET stock=1 WHERE product_id='04' AND id='group';
  live := public.reserve_merch_order('Prueba Live','test@example.org',item,
    950,current_date,526,'live');
  IF (SELECT count(*) FROM public.merch_reservation_lines WHERE order_id=(live->>'id')::uuid)<>1 THEN
    RAISE EXCEPTION 'Live did not reserve';
  END IF;
  BEGIN
    PERFORM public.reserve_merch_order('Otra Live','test@example.org',item,950,current_date,526,'live');
    RAISE EXCEPTION 'Two live orders reserved the last unit';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'No confirmed stock available for reservation' THEN RAISE; END IF;
  END;
  UPDATE public.merch_orders SET status='paid',paypal_capture_id='TEST_' || replace(gen_random_uuid()::text,'-',''),paid_at=clock_timestamp()
    WHERE id=(live->>'id')::uuid;
  SELECT stock INTO after_stock FROM public.product_variants WHERE product_id='04' AND id='group';
  IF after_stock<>0 THEN RAISE EXCEPTION 'Live payment did not discount exactly one'; END IF;
  UPDATE public.merch_orders SET status='paid' WHERE id=(live->>'id')::uuid;
  SELECT stock INTO after_stock FROM public.product_variants WHERE product_id='04' AND id='group';
  IF after_stock<>0 THEN RAISE EXCEPTION 'Repeat payment discounted twice'; END IF;
END;
$test$;
ROLLBACK;
