-- Los intentos sin aprobación se conservan para trazabilidad, sin contarlos como ventas.
ALTER TABLE public.merch_orders
  DROP CONSTRAINT merch_orders_status_check,
  ADD CONSTRAINT merch_orders_status_check
    CHECK (status IN ('creating','awaiting_approval','capture_pending','paid','payment_denied','abandoned')),
  ADD COLUMN abandoned_at timestamptz,
  ADD COLUMN abandon_reason text
    CHECK (abandon_reason IN ('paypal_not_found','paypal_voided'));
