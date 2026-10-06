-- SQL Editor: no llama a Transbank ni conserva pedidos, tokens o cambios.
BEGIN;
DO $test$
DECLARE
  order_json jsonb; fixture_id uuid; token text := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
  first_claim text; retry_claim text; variant_before integer; variant_after integer;
  item jsonb := '[{"productId":"04","optionId":"group","variantId":"group","name":"Chekis","option":"Grupal","quantity":1,"unitPriceClp":5000,"lineTotalClp":5000}]'::jsonb;
BEGIN
  SELECT stock INTO variant_before FROM public.product_variants WHERE product_id='04' AND id='group';
  IF variant_before IS NULL THEN RAISE EXCEPTION 'Falta variante de prueba'; END IF;
  order_json := public.reserve_webpay_order('Conciliación de prueba','test@example.org',item,
    'http://localhost:8000',gen_random_uuid()::text);
  fixture_id := (order_json->>'id')::uuid;
  UPDATE public.merch_orders SET status='awaiting_approval',webpay_token=token WHERE id=fixture_id;
  first_claim := public.claim_webpay_commit(token);
  IF first_claim <> 'claimed' THEN RAISE EXCEPTION 'Primera toma: %',first_claim; END IF;
  retry_claim := public.claim_webpay_commit(token);
  IF retry_claim <> 'in_progress' THEN RAISE EXCEPTION 'La toma simultánea no fue bloqueada'; END IF;
  UPDATE public.merch_orders SET webpay_commit_claimed_at=clock_timestamp()-interval '76 seconds'
    WHERE id=fixture_id;
  retry_claim := public.claim_webpay_commit(token);
  IF retry_claim <> 'claimed' THEN RAISE EXCEPTION 'La toma vencida no se pudo recuperar'; END IF;
  IF (SELECT count(*) FROM public.merch_reservation_lines WHERE order_id=fixture_id)<>0 THEN
    RAISE EXCEPTION 'La prueba reservó stock físico';
  END IF;
  IF has_function_privilege('anon','public.claim_webpay_commit(text)','EXECUTE') OR
     has_table_privilege('anon','public.webpay_reconcile_auth','SELECT') THEN
    RAISE EXCEPTION 'Permisos públicos inseguros';
  END IF;
  SELECT stock INTO variant_after FROM public.product_variants WHERE product_id='04' AND id='group';
  IF variant_before IS DISTINCT FROM variant_after THEN RAISE EXCEPTION 'Cambió el inventario'; END IF;
  RAISE NOTICE 'test-webpay-reconciliation: OK';
END
$test$;
ROLLBACK;
