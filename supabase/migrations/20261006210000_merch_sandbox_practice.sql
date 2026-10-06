-- The team can rehearse fulfillment on paid Sandbox orders without changing
-- the operational fulfillment columns or any product inventory.
ALTER TABLE public.merch_orders
  ADD COLUMN test_fulfillment_status text
    CHECK (test_fulfillment_status IN ('new', 'preparing', 'ready', 'handed_over', 'on_hold')),
  ADD COLUMN test_fulfillment_note text NOT NULL DEFAULT ''
    CHECK (length(test_fulfillment_note) <= 500),
  ADD COLUMN test_fulfillment_updated_at timestamptz,
  ADD COLUMN test_ready_at timestamptz,
  ADD COLUMN test_handed_over_at timestamptz;

CREATE FUNCTION public.guard_merch_test_fulfillment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE previous_status text := coalesce(OLD.test_fulfillment_status, 'new');
BEGIN
  IF OLD.order_environment <> 'test' OR NEW.order_environment <> 'test' OR
     OLD.status <> 'paid' OR NEW.status <> 'paid' OR
     OLD.fulfillment_status <> 'test' OR NEW.fulfillment_status <> 'test' THEN
    RAISE EXCEPTION 'Practice is only available for paid Sandbox orders';
  END IF;
  IF NEW.test_fulfillment_status IS DISTINCT FROM OLD.test_fulfillment_status THEN
    IF NOT (
      (previous_status = 'new' AND NEW.test_fulfillment_status IN ('preparing', 'on_hold')) OR
      (previous_status = 'preparing' AND NEW.test_fulfillment_status IN ('ready', 'on_hold')) OR
      (previous_status = 'ready' AND NEW.test_fulfillment_status IN ('handed_over', 'on_hold')) OR
      (previous_status = 'on_hold' AND NEW.test_fulfillment_status = 'new')
    ) THEN RAISE EXCEPTION 'Invalid Sandbox practice transition'; END IF;
    IF NEW.test_fulfillment_status = 'on_hold' AND btrim(NEW.test_fulfillment_note) = '' THEN
      RAISE EXCEPTION 'A practice hold needs a reason';
    END IF;
    IF NEW.test_fulfillment_status = 'ready' THEN NEW.test_ready_at := now(); END IF;
    IF NEW.test_fulfillment_status = 'handed_over' THEN NEW.test_handed_over_at := now(); END IF;
  END IF;
  IF NEW.test_fulfillment_status IS DISTINCT FROM OLD.test_fulfillment_status OR
     NEW.test_fulfillment_note IS DISTINCT FROM OLD.test_fulfillment_note THEN
    NEW.test_fulfillment_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_merch_test_fulfillment
BEFORE UPDATE OF test_fulfillment_status, test_fulfillment_note
ON public.merch_orders FOR EACH ROW
EXECUTE FUNCTION public.guard_merch_test_fulfillment();

REVOKE ALL ON FUNCTION public.guard_merch_test_fulfillment() FROM PUBLIC, anon, authenticated;

-- An explicit SET of either milestone is never allowed; the guard above
-- assigns these values only while changing the practice stage.
CREATE FUNCTION public.reject_merch_test_milestone_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Practice milestones are managed by stage changes';
END;
$$;
CREATE TRIGGER reject_merch_test_milestone_edit
BEFORE UPDATE OF test_ready_at, test_handed_over_at
ON public.merch_orders FOR EACH ROW
EXECUTE FUNCTION public.reject_merch_test_milestone_edit();
REVOKE ALL ON FUNCTION public.reject_merch_test_milestone_edit() FROM PUBLIC, anon, authenticated;
