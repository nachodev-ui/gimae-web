-- Independent follow-up for Webpay integration when the browser never returns.
-- PayPal keeps its own reconciliation counters and schedule.
ALTER TABLE public.merch_orders
  ADD COLUMN webpay_reconcile_after timestamptz DEFAULT (now() + interval '2 minutes'),
  ADD COLUMN webpay_reconcile_attempts integer NOT NULL DEFAULT 0 CHECK (webpay_reconcile_attempts >= 0),
  ADD COLUMN webpay_commit_attempts integer NOT NULL DEFAULT 0 CHECK (webpay_commit_attempts >= 0),
  ADD COLUMN webpay_last_reconciled_at timestamptz,
  ADD COLUMN webpay_reconcile_error text,
  ADD COLUMN webpay_reconcile_alert_at timestamptz,
  ADD COLUMN webpay_reconcile_alert_reason text
    CHECK (webpay_reconcile_alert_reason IN ('unresolved','mismatch'));

CREATE INDEX merch_orders_webpay_reconcile_due
  ON public.merch_orders(webpay_reconcile_after)
  WHERE payment_provider='webpay' AND status IN ('awaiting_approval','capture_pending','abandoned');

-- A timed-out HTTP call is not evidence that the commit did not succeed.
-- A new caller may reclaim only after the first request had time to finish.
CREATE OR REPLACE FUNCTION public.claim_webpay_commit(p_token text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE current_order public.merch_orders%ROWTYPE;
BEGIN
  SELECT * INTO current_order FROM public.merch_orders
    WHERE webpay_token=p_token AND payment_provider='webpay' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF current_order.status='paid' THEN RETURN 'paid'; END IF;
  IF current_order.status='capture_pending' THEN
    IF current_order.webpay_commit_claimed_at > clock_timestamp()-interval '75 seconds' THEN
      RETURN 'in_progress';
    END IF;
    UPDATE public.merch_orders SET webpay_commit_claimed_at=clock_timestamp()
      WHERE id=current_order.id;
    RETURN 'claimed';
  END IF;
  IF current_order.status NOT IN ('awaiting_approval','abandoned') THEN RETURN 'invalid'; END IF;
  IF current_order.status='abandoned' AND
    current_order.reservation_state NOT IN ('expired','released') THEN RETURN 'invalid'; END IF;
  IF current_order.reservation_state='held' AND
    current_order.reservation_expires_at>clock_timestamp() THEN
    UPDATE public.merch_orders SET status='capture_pending',
      reservation_state='capturing', reservation_claimed_at=clock_timestamp(),
      webpay_commit_claimed_at=clock_timestamp() WHERE id=current_order.id;
  ELSE
    UPDATE public.merch_orders SET status='capture_pending',
      reservation_state='expired', webpay_commit_claimed_at=clock_timestamp()
      WHERE id=current_order.id;
  END IF;
  RETURN 'claimed';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_webpay_commit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webpay_commit(text) TO service_role;

-- Cron has the plaintext token in Vault; the Edge Function sees only its hash.
CREATE TABLE public.webpay_reconcile_auth (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.webpay_reconcile_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webpay_reconcile_auth FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.webpay_reconcile_auth TO service_role;
DO $setup$
DECLARE token text := encode(gen_random_bytes(32),'hex');
BEGIN
  INSERT INTO public.webpay_reconcile_auth(id,token_sha256)
    VALUES (true,encode(sha256(convert_to(token,'UTF8')),'hex'));
  PERFORM vault.create_secret(token,'gimae_webpay_reconcile_token',
    'Credencial interna para la conciliación de Webpay integración');
END
$setup$;
