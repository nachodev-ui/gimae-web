-- Programador y llamadas HTTP internas para conciliar pagos sin un navegador.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.merch_orders
  ADD COLUMN reconcile_after timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  ADD COLUMN reconcile_attempts integer NOT NULL DEFAULT 0 CHECK (reconcile_attempts >= 0),
  ADD COLUMN last_reconciled_at timestamptz,
  ADD COLUMN reconcile_error text;

CREATE INDEX merch_orders_reconcile_due ON public.merch_orders(reconcile_after)
  WHERE status IN ('awaiting_approval', 'capture_pending') AND paypal_order_id IS NOT NULL;

-- La función solo conoce el hash. Cron lee el token original desde Vault.
CREATE TABLE public.paypal_reconcile_auth (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.paypal_reconcile_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paypal_reconcile_auth FROM PUBLIC, anon, authenticated;

DO $setup$
DECLARE
  token text := encode(gen_random_bytes(32), 'hex');
BEGIN
  INSERT INTO public.paypal_reconcile_auth(id, token_sha256)
    VALUES (true, encode(sha256(convert_to(token, 'UTF8')), 'hex'));
  PERFORM vault.create_secret(token, 'gimae_paypal_reconcile_token',
    'Credencial interna para la conciliación periódica de PayPal');
END
$setup$;
