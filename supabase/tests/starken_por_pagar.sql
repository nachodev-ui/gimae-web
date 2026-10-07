-- SQL Editor in the connected Sandbox project. No order survives ROLLBACK.
BEGIN;
DO $test$
DECLARE
  product record;
  cart jsonb;
  delivery jsonb := jsonb_build_object(
    'name','Persona de Prueba','rut','12345678-5','phone','+56912345678',
    'email','prueba@example.invalid','region','Metropolitana de Santiago',
    'commune','Santiago','street','Calle de prueba','number','123',
    'unit','','instructions','');
  result jsonb;
  sample uuid;
  before_stock integer;
  denied boolean := false;
  row_state record;
BEGIN
  SELECT p.id,p.name,p.price_clp,p.stock INTO product FROM public.products p
  WHERE p.active AND p.price_clp > 0 AND NOT EXISTS (
    SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id)
  ORDER BY p.id LIMIT 1 FOR UPDATE;
  IF product.id IS NULL THEN RAISE EXCEPTION 'An active product without variants is required'; END IF;
  before_stock := product.stock;
  cart := jsonb_build_array(jsonb_build_object(
    'productId',product.id,'variantId',null,'optionId','default','name',product.name,
    'option','Única','quantity',1,'unitPriceClp',product.price_clp,
    'lineTotalClp',product.price_clp));

  BEGIN
    PERFORM public.reserve_webpay_order_with_delivery('Persona de Prueba','prueba@example.invalid',cart,
      'http://localhost:8000',gen_random_uuid()::text,'starken_por_pagar',delivery - 'rut');
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Missing recipient RUT was accepted'; END IF;

  result := public.reserve_webpay_order_with_delivery('Persona de Prueba','prueba@example.invalid',cart,
    'http://localhost:8000',gen_random_uuid()::text,'starken_por_pagar',delivery);
  sample := (result->>'id')::uuid;
  SELECT delivery_method,shipping_details,shipping_clp,total_clp INTO row_state
    FROM public.merch_orders WHERE id=sample;
  IF row_state.delivery_method <> 'starken_por_pagar' OR row_state.shipping_details <> delivery OR
     row_state.shipping_clp <> 0 OR row_state.total_clp <> product.price_clp THEN
    RAISE EXCEPTION 'Delivery snapshot or product-only amount is wrong';
  END IF;
  result := public.reserve_merch_order_with_delivery('Persona de Prueba','prueba@example.invalid',cart,
    1000,current_date,greatest(product.price_clp / 10,1),'test','starken_por_pagar',delivery);
  IF NOT EXISTS (SELECT 1 FROM public.merch_orders WHERE id=(result->>'id')::uuid AND
    delivery_method='starken_por_pagar' AND shipping_details=delivery AND shipping_clp=0 AND
    order_environment='test') THEN RAISE EXCEPTION 'PayPal delivery snapshot was not saved'; END IF;
  result := public.reserve_webpay_order_with_delivery('Persona de Prueba','prueba@example.invalid',cart,
    'http://localhost:8000',gen_random_uuid()::text,'pickup','{}'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM public.merch_orders WHERE id=(result->>'id')::uuid AND
    delivery_method='pickup' AND shipping_details='{}'::jsonb) THEN
    RAISE EXCEPTION 'Existing pickup flow broke';
  END IF;
  UPDATE public.merch_orders SET status='paid',paid_at=now(),
    webpay_token=replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
    webpay_authorization_code='TEST' WHERE id=sample;
  UPDATE public.merch_orders SET test_fulfillment_status='preparing' WHERE id=sample;
  UPDATE public.merch_orders SET test_fulfillment_status='ready' WHERE id=sample;
  denied := false;
  BEGIN
    UPDATE public.merch_orders SET test_fulfillment_status='handed_over' WHERE id=sample;
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Handoff without a waybill was accepted'; END IF;
  UPDATE public.merch_orders SET test_fulfillment_status='handed_over',
    test_starken_waybill='SIMULADO-123' WHERE id=sample;
  IF (SELECT stock FROM public.products WHERE id=product.id) IS DISTINCT FROM before_stock OR
     (SELECT starken_waybill FROM public.merch_orders WHERE id=sample) IS NOT NULL THEN
    RAISE EXCEPTION 'Sandbox handoff modified physical stock or real shipping data';
  END IF;
  RAISE NOTICE 'starken_por_pagar: OK (transaction will be rolled back)';
END;
$test$;
ROLLBACK;
