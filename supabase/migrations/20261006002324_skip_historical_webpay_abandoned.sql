-- Attempts already abandoned before this worker existed must not produce new
-- operational alerts. New attempts retain the column's two-minute default.
UPDATE public.merch_orders
SET webpay_reconcile_after=NULL,
    webpay_reconcile_attempts=0,
    webpay_reconcile_error=NULL
WHERE payment_provider='webpay' AND status='abandoned'
  AND webpay_commit_attempts=0;
