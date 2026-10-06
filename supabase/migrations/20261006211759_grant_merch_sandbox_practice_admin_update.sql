-- The existing admin-only UPDATE RLS policy and practice trigger still apply.
-- Limit browser writes to the two practice fields only.
GRANT UPDATE (test_fulfillment_status, test_fulfillment_note)
ON public.merch_orders TO authenticated;
