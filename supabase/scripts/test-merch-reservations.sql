-- Ejecutar solo en Sandbox. Cambia la variante si ya no tiene una unidad libre.
-- Todos los cambios, incluso los de stock y vencimiento, se deshacen.
BEGIN;
DO $test$
DECLARE
  a jsonb; b jsonb; n integer; claim text; state record;
  item jsonb := '[{"productId":"04","optionId":"group","variantId":"group","name":"Chekis","option":"Grupo","quantity":1,"unitPriceClp":5000,"lineTotalClp":5000}]'::jsonb;
BEGIN
  SELECT stock INTO n FROM public.product_variants WHERE id='group' AND product_id='04';
  IF n<>1 THEN RAISE EXCEPTION 'La prueba requiere una unidad de Chekis Grupo; hay %',n; END IF;

  a := public.reserve_merch_order('Prueba reserva','test@example.org',item,950,current_date,526);
  BEGIN
    PERFORM public.reserve_merch_order('Prueba duplicada','test@example.org',item,950,current_date,526);
    RAISE EXCEPTION 'La última unidad se reservó dos veces';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'No confirmed stock available for reservation' THEN RAISE; END IF;
  END;
  SELECT stock INTO n FROM public.product_variants WHERE id='group' AND product_id='04';
  IF n<>1 THEN RAISE EXCEPTION 'La reserva descontó stock físico'; END IF;

  UPDATE public.merch_orders SET status='awaiting_approval',
    reservation_expires_at=clock_timestamp()-interval '1 minute' WHERE id=(a->>'id')::uuid;
  PERFORM public.expire_merch_reservations();
  SELECT status,reservation_state INTO state FROM public.merch_orders WHERE id=(a->>'id')::uuid;
  IF state.status<>'abandoned' OR state.reservation_state<>'expired' THEN
    RAISE EXCEPTION 'No se liberó la reserva vencida';
  END IF;
  claim := public.claim_merch_capture((a->>'id')::uuid);
  IF claim<>'expired' THEN RAISE EXCEPTION 'La captura vencida no fue rechazada'; END IF;
  b := public.reserve_merch_order('Prueba libre','test@example.org',item,950,current_date,526);

  UPDATE public.merch_orders SET status='paid',
    paypal_capture_id='TEST-LATE-'||(a->>'id'),paid_at=clock_timestamp()
    WHERE id=(a->>'id')::uuid;
  SELECT reservation_issue,stock_state,fulfillment_status INTO state
    FROM public.merch_orders WHERE id=(a->>'id')::uuid;
  IF state.reservation_issue<>'late_capture' OR state.stock_state<>'shortage' OR
     state.fulfillment_status<>'on_hold' THEN RAISE EXCEPTION 'Pago tardío sin revisión'; END IF;
  SELECT stock INTO n FROM public.product_variants WHERE id='group' AND product_id='04';
  IF n<>1 THEN RAISE EXCEPTION 'El pago tardío quitó una unidad reservada'; END IF;

  UPDATE public.merch_orders SET status='awaiting_approval' WHERE id=(b->>'id')::uuid;
  claim := public.claim_merch_capture((b->>'id')::uuid);
  IF claim<>'claimed' THEN RAISE EXCEPTION 'No se tomó la captura vigente'; END IF;
  claim := public.claim_merch_capture((b->>'id')::uuid);
  IF claim<>'in_progress' THEN RAISE EXCEPTION 'La segunda captura simultánea no fue bloqueada'; END IF;
  UPDATE public.merch_orders SET status='paid',
    paypal_capture_id='TEST-ON-TIME-'||(b->>'id'),paid_at=clock_timestamp()
    WHERE id=(b->>'id')::uuid;
  SELECT stock INTO n FROM public.product_variants WHERE id='group' AND product_id='04';
  IF n<>0 THEN RAISE EXCEPTION 'La captura no descontó una unidad'; END IF;
  UPDATE public.merch_orders SET status='paid' WHERE id=(b->>'id')::uuid;
  SELECT stock INTO n FROM public.product_variants WHERE id='group' AND product_id='04';
  IF n<>0 THEN RAISE EXCEPTION 'El pago repetido descontó otra unidad'; END IF;
END;
$test$;
ROLLBACK;
SELECT 'reserva, vencimiento, captura, pago tardío e idempotencia: OK' AS resultado;
