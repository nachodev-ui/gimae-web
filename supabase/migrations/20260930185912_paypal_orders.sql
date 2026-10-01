-- Se conserva el catálogo de products/product_variants como fuente de precios.
CREATE TABLE public.paypal_fx_rates (
  source text PRIMARY KEY CHECK (source = 'BCCH_F073.TCO.PRE.Z.D'),
  clp_per_usd numeric(12,4) NOT NULL CHECK (clp_per_usd BETWEEN 100 AND 10000),
  observation_date date NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.merch_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_name text NOT NULL CHECK (length(buyer_name) BETWEEN 2 AND 60),
  buyer_contact text NOT NULL CHECK (length(buyer_contact) BETWEEN 3 AND 100),
  delivery_method text NOT NULL DEFAULT 'pickup' CHECK (delivery_method = 'pickup'),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  subtotal_clp integer NOT NULL CHECK (subtotal_clp > 0),
  shipping_clp integer NOT NULL DEFAULT 0 CHECK (shipping_clp = 0),
  total_clp integer NOT NULL CHECK (total_clp = subtotal_clp + shipping_clp),
  fx_source text NOT NULL DEFAULT 'BCCH_F073.TCO.PRE.Z.D',
  clp_per_usd numeric(12,4) NOT NULL CHECK (clp_per_usd > 0),
  fx_observation_date date NOT NULL,
  total_usd_cents integer NOT NULL CHECK (total_usd_cents > 0),
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','awaiting_approval','capture_pending','paid','payment_denied')),
  paypal_order_id text UNIQUE,
  paypal_capture_id text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX merch_orders_created_at ON public.merch_orders(created_at DESC);
CREATE INDEX merch_orders_status ON public.merch_orders(status,created_at DESC);
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.merch_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.paypal_webhook_events (
  paypal_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  paypal_order_id text,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paypal_fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.paypal_fx_rates,public.merch_orders,public.paypal_webhook_events FROM PUBLIC,anon,authenticated;
-- El panel admin puede consultar pedidos, incluso sus datos de contacto.
-- Ningún navegador obtiene INSERT, UPDATE o DELETE, ni siquiera con login admin.
GRANT SELECT ON public.merch_orders TO authenticated;
CREATE POLICY merch_orders_admin_read ON public.merch_orders
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
-- paypal_fx_rates y paypal_webhook_events solo son accesibles a Edge Functions
-- con secret/service role. El acceso de cliente está revocado y sin políticas.
