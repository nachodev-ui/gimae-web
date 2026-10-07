-- Starken por pagar: the checkout total includes merchandise only. The
-- recipient pays the carrier directly on delivery; no tariff is estimated.
ALTER TABLE public.merch_orders DROP CONSTRAINT merch_orders_delivery_method_check;
ALTER TABLE public.merch_orders ADD CONSTRAINT merch_orders_delivery_method_check
  CHECK (delivery_method IN ('pickup', 'starken_por_pagar'));
ALTER TABLE public.merch_orders ADD COLUMN shipping_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN starken_waybill text,
  ADD COLUMN test_starken_waybill text;

ALTER TABLE public.merch_orders ADD CONSTRAINT merch_orders_shipping_details_check CHECK (
  jsonb_typeof(shipping_details) = 'object' AND
  (delivery_method <> 'pickup' OR shipping_details = '{}'::jsonb) AND
  (delivery_method <> 'starken_por_pagar' OR ((
    length(shipping_details->>'name') BETWEEN 2 AND 80 AND
    shipping_details->>'rut' ~ '^[0-9]{7,8}-[0-9K]$' AND
    shipping_details->>'phone' ~ '^\+56[0-9]{9}$' AND
    length(shipping_details->>'email') BETWEEN 5 AND 120 AND
    shipping_details->>'email' ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND
    length(shipping_details->>'region') BETWEEN 3 AND 80 AND
    length(shipping_details->>'commune') BETWEEN 2 AND 80 AND
    length(shipping_details->>'street') BETWEEN 3 AND 120 AND
    length(shipping_details->>'number') BETWEEN 1 AND 20 AND
    length(coalesce(shipping_details->>'unit','')) <= 60 AND
    length(coalesce(shipping_details->>'instructions','')) <= 200
  ) IS TRUE))
);
ALTER TABLE public.merch_orders ADD CONSTRAINT merch_orders_starken_waybill_check CHECK (
  (starken_waybill IS NULL OR (delivery_method = 'starken_por_pagar' AND starken_waybill ~ '^[A-Za-z0-9-]{5,40}$')) AND
  (test_starken_waybill IS NULL OR (delivery_method = 'starken_por_pagar' AND test_starken_waybill ~ '^[A-Za-z0-9-]{5,40}$'))
);

-- The existing reserve functions still lock/check stock. These wrappers add
-- the delivery snapshot inside the *same* database transaction. A validation
-- error rolls back both the order and its inventory reservation.
CREATE FUNCTION public.reserve_merch_order_with_delivery(
  p_buyer_name text, p_buyer_contact text, p_items jsonb,
  p_fx numeric, p_rate_date date, p_usd_cents integer, p_environment text,
  p_delivery_method text, p_shipping_details jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_delivery_method NOT IN ('pickup','starken_por_pagar') OR p_shipping_details IS NULL THEN
    RAISE EXCEPTION 'Invalid delivery method';
  END IF;
  result := public.reserve_merch_order(p_buyer_name,p_buyer_contact,p_items,
    p_fx,p_rate_date,p_usd_cents,p_environment);
  UPDATE public.merch_orders SET delivery_method=p_delivery_method,
    shipping_details=p_shipping_details WHERE id=(result->>'id')::uuid;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_merch_order_with_delivery(text,text,jsonb,numeric,date,integer,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_merch_order_with_delivery(text,text,jsonb,numeric,date,integer,text,text,jsonb)
  TO service_role;

CREATE FUNCTION public.reserve_webpay_order_with_delivery(
  p_buyer_name text, p_buyer_contact text, p_items jsonb,
  p_origin text, p_session_id text, p_delivery_method text, p_shipping_details jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_delivery_method NOT IN ('pickup','starken_por_pagar') OR p_shipping_details IS NULL THEN
    RAISE EXCEPTION 'Invalid delivery method';
  END IF;
  result := public.reserve_webpay_order(p_buyer_name,p_buyer_contact,p_items,p_origin,p_session_id);
  UPDATE public.merch_orders SET delivery_method=p_delivery_method,
    shipping_details=p_shipping_details WHERE id=(result->>'id')::uuid;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_webpay_order_with_delivery(text,text,jsonb,text,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_webpay_order_with_delivery(text,text,jsonb,text,text,text,jsonb)
  TO service_role;

-- Do not allow edits to the address after the provider order was created.
CREATE FUNCTION public.guard_merch_delivery_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'creating' AND (
    NEW.delivery_method IS DISTINCT FROM OLD.delivery_method OR
    NEW.shipping_details IS DISTINCT FROM OLD.shipping_details
  ) THEN RAISE EXCEPTION 'Delivery snapshot is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_merch_delivery_snapshot
BEFORE UPDATE OF delivery_method,shipping_details ON public.merch_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_merch_delivery_snapshot();
REVOKE ALL ON FUNCTION public.guard_merch_delivery_snapshot() FROM PUBLIC,anon,authenticated;

-- Recording handoff to Starken requires a waybill. Pickup never has one.
CREATE FUNCTION public.guard_merch_starken_handoff()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.starken_waybill IS DISTINCT FROM OLD.starken_waybill THEN
    IF OLD.order_environment <> 'live' OR NEW.delivery_method <> 'starken_por_pagar' OR
       OLD.fulfillment_status <> 'ready' OR NEW.fulfillment_status <> 'handed_over' THEN
      RAISE EXCEPTION 'Waybill must be recorded with Starken handoff';
    END IF;
  END IF;
  IF NEW.test_starken_waybill IS DISTINCT FROM OLD.test_starken_waybill THEN
    IF OLD.order_environment <> 'test' OR NEW.delivery_method <> 'starken_por_pagar' OR
       coalesce(OLD.test_fulfillment_status,'new') <> 'ready' OR
       NEW.test_fulfillment_status <> 'handed_over' THEN
      RAISE EXCEPTION 'Practice waybill must be recorded with simulated handoff';
    END IF;
  END IF;
  IF NEW.delivery_method='starken_por_pagar' AND (
     (OLD.order_environment='live' AND OLD.fulfillment_status <> 'handed_over' AND
      NEW.fulfillment_status='handed_over' AND NEW.starken_waybill IS NULL) OR
     (OLD.order_environment='test' AND coalesce(OLD.test_fulfillment_status,'new') <> 'handed_over' AND
      NEW.test_fulfillment_status='handed_over' AND NEW.test_starken_waybill IS NULL)
  ) THEN RAISE EXCEPTION 'Starken waybill is required for handoff'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_merch_starken_handoff BEFORE UPDATE OF
  fulfillment_status,test_fulfillment_status,starken_waybill,test_starken_waybill
ON public.merch_orders FOR EACH ROW EXECUTE FUNCTION public.guard_merch_starken_handoff();
REVOKE ALL ON FUNCTION public.guard_merch_starken_handoff() FROM PUBLIC,anon,authenticated;

GRANT UPDATE (starken_waybill,test_starken_waybill) ON public.merch_orders TO authenticated;
