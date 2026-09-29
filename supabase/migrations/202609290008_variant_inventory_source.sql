-- Inventario de merch: una sola fuente de verdad.
--
-- Regla:
-- 1) Si un producto NO tiene variantes, products.stock / stock_confirmed son editables y autoritativos.
-- 2) Si un producto TIENE variantes, product_variants es la fuente autoritativa.
--    products.stock se mantiene como resumen de unidades CONFIRMADAS y products.stock_confirmed
--    solo es true cuando todas las variantes tienen inventario confirmado.
--
-- Esto evita que un producto general y sus variantes puedan declarar stocks contradictorios.

BEGIN;

CREATE OR REPLACE FUNCTION public.variant_inventory_summary(target_product_id text)
RETURNS TABLE(stock integer, stock_confirmed boolean)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    COALESCE(sum(CASE WHEN v.stock_confirmed THEN v.stock ELSE 0 END), 0)::integer AS stock,
    CASE WHEN count(*) = 0 THEN false ELSE bool_and(v.stock_confirmed) END AS stock_confirmed
  FROM public.product_variants v
  WHERE v.product_id = target_product_id
$$;

-- Mantiene el resumen del producto después de cualquier cambio de variantes.
CREATE OR REPLACE FUNCTION public.sync_product_inventory_from_variants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_id text;
  variant_count integer;
  summary_stock integer;
  summary_confirmed boolean;
BEGIN
  target_id := COALESCE(NEW.product_id, OLD.product_id);

  SELECT count(*)::integer,
         COALESCE(sum(CASE WHEN v.stock_confirmed THEN v.stock ELSE 0 END), 0)::integer,
         CASE WHEN count(*) = 0 THEN false ELSE bool_and(v.stock_confirmed) END
  INTO variant_count, summary_stock, summary_confirmed
  FROM public.product_variants v
  WHERE v.product_id = target_id;

  -- Al desaparecer la última variante no heredamos el antiguo total como stock general:
  -- volvemos a un inventario general vacío y sin confirmar para obligar a revisarlo.
  UPDATE public.products
  SET stock = CASE WHEN variant_count = 0 THEN 0 ELSE summary_stock END,
      stock_confirmed = CASE WHEN variant_count = 0 THEN false ELSE summary_confirmed END
  WHERE id = target_id;

  -- Si una variante se mueve entre productos, recalcula también el producto anterior.
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    SELECT count(*)::integer,
           COALESCE(sum(CASE WHEN v.stock_confirmed THEN v.stock ELSE 0 END), 0)::integer,
           CASE WHEN count(*) = 0 THEN false ELSE bool_and(v.stock_confirmed) END
    INTO variant_count, summary_stock, summary_confirmed
    FROM public.product_variants v
    WHERE v.product_id = OLD.product_id;

    UPDATE public.products
    SET stock = CASE WHEN variant_count = 0 THEN 0 ELSE summary_stock END,
        stock_confirmed = CASE WHEN variant_count = 0 THEN false ELSE summary_confirmed END
    WHERE id = OLD.product_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS sync_variant_inventory_to_product ON public.product_variants;
CREATE TRIGGER sync_variant_inventory_to_product
AFTER INSERT OR UPDATE OF product_id, stock, stock_confirmed OR DELETE
ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_inventory_from_variants();

-- Evita que una edición directa de products cree una segunda fuente de verdad.
-- Si existen variantes, cualquier intento de cambiar stock general se normaliza al resumen real.
CREATE OR REPLACE FUNCTION public.guard_product_inventory_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  variant_count integer;
  summary_stock integer;
  summary_confirmed boolean;
BEGIN
  SELECT count(*)::integer,
         COALESCE(sum(CASE WHEN v.stock_confirmed THEN v.stock ELSE 0 END), 0)::integer,
         CASE WHEN count(*) = 0 THEN false ELSE bool_and(v.stock_confirmed) END
  INTO variant_count, summary_stock, summary_confirmed
  FROM public.product_variants v
  WHERE v.product_id = NEW.id;

  IF variant_count > 0 THEN
    NEW.stock := summary_stock;
    NEW.stock_confirmed := summary_confirmed;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_product_inventory_source ON public.products;
CREATE TRIGGER guard_product_inventory_source
BEFORE INSERT OR UPDATE OF stock, stock_confirmed
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.guard_product_inventory_source();

-- Normaliza los productos existentes que ya tienen variantes.
UPDATE public.products p
SET stock = summary.stock,
    stock_confirmed = summary.stock_confirmed
FROM (
  SELECT p2.id,
         COALESCE(sum(CASE WHEN v.stock_confirmed THEN v.stock ELSE 0 END), 0)::integer AS stock,
         bool_and(v.stock_confirmed) AS stock_confirmed
  FROM public.products p2
  JOIN public.product_variants v ON v.product_id = p2.id
  GROUP BY p2.id
) AS summary
WHERE p.id = summary.id;

REVOKE ALL ON FUNCTION public.variant_inventory_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.variant_inventory_summary(text) TO authenticated;

COMMIT;
