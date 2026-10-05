-- Prueba transaccional en Sandbox: no quedan pedidos ni cambios de inventario.
-- Requiere una unidad confirmada y disponible de Chekis grupal.
BEGIN;
DO $test$
DECLARE
  a jsonb; b jsonb; state record; result text; n integer;
  item jsonb := '[{"productId":"04","optionId":"group","variantId":"group","name":"Chekis","option":"Grupal","quantity":1,"unitPriceClp":5000,"lineTotalClp":5000}]'::jsonb;
BEGIN
  SELECT stock INTO n FROM public.product_variants WHERE product_id='04' AND id='group';
  IF n<>1 THEN RAISE EXCEPTION 'La prueba requiere una unidad disponible, hay %',n; END IF;
  a := public.reserve_webpay_order('Prueba Webpay','test@example.org',item,
    'http://localhost:8000',gen_random_uuid()::text);
  BEGIN
    PERFORM public.reserve_merch_order('Prueba PayPal','test@example.org',item,950,current_date,526);
    RAISE EXCEPTION 'Ambos proveedores reservaron la última unidad';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'No confirmed stock available for reservation' THEN RAISE; END IF;
  END;
  UPDATE public.merch_orders SET status='awaiting_approval',webpay_token=repeat('a',64)
    WHERE id=(a->>'id')::uuid;
  result := public.claim_webpay_commit(repeat('a',64));
  IF result <> 'claimed' THEN RAISE EXCEPTION 'No tomó el primer retorno'; END IF;
  result := public.claim_webpay_commit(repeat('a',64));
  IF result <> 'in_progress' THEN RAISE EXCEPTION 'Permitió una segunda confirmación'; END IF;
  UPDATE public.merch_orders SET status='paid',webpay_authorization_code='TEST123',
    paid_at=clock_timestamp() WHERE id=(a->>'id')::uuid;
  SELECT stock INTO n FROM public.product_variants WHERE product_id='04' AND id='group';
  IF n<>0 THEN RAISE EXCEPTION 'No descontó stock al cobrar'; END IF;
  result := public.claim_webpay_commit(repeat('a',64));
  IF result <> 'paid' THEN RAISE EXCEPTION 'No reconoció la confirmación repetida'; END IF;
  UPDATE public.merch_orders SET status='paid' WHERE id=(a->>'id')::uuid;
  SELECT stock INTO n FROM public.product_variants WHERE product_id='04' AND id='group';
  IF n<>0 THEN RAISE EXCEPTION 'Descontó stock dos veces'; END IF;

  -- Un segundo pedido ya pagado en esta transacción cede su stock para probar
  -- una autorización que llega después del vencimiento y otra reserva vigente.
  UPDATE public.product_variants SET stock=1 WHERE product_id='04' AND id='group';
  b := public.reserve_webpay_order('Prueba tardía','test@example.org',item,
    'http://localhost:8000',gen_random_uuid()::text);
  UPDATE public.merch_orders SET status='awaiting_approval',webpay_token=repeat('b',64),
    reservation_expires_at=clock_timestamp()-interval '1 minute'
    WHERE id=(b->>'id')::uuid;
  PERFORM public.expire_merch_reservations();
  result := public.claim_webpay_commit(repeat('b',64));
  IF result <> 'claimed' THEN RAISE EXCEPTION 'Ocultó un pago tardío'; END IF;
  UPDATE public.merch_orders SET status='paid',webpay_authorization_code='TESTLATE',
    paid_at=clock_timestamp() WHERE id=(b->>'id')::uuid;
  SELECT reservation_issue,fulfillment_status INTO state FROM public.merch_orders WHERE id=(b->>'id')::uuid;
  IF state.reservation_issue <> 'late_capture' OR state.fulfillment_status <> 'on_hold' THEN
    RAISE EXCEPTION 'Pago tardío no quedó en revisión';
  END IF;
END;
$test$;
ROLLBACK;
