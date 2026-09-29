-- Prueba reversible de la migración 0008.
-- Ejecutar después de 202609290008_variant_inventory_source.sql.
-- Toda la prueba termina en ROLLBACK y no conserva registros.

BEGIN;

INSERT INTO public.products(id,name,description,note,color,price_clp,stock,stock_confirmed,active,display_order)
VALUES ('audit-inventory-model','Audit inventory model','','','pink',1000,9,true,false,9999);

-- Sin variantes, el inventario general sigue siendo directo.
DO $$
DECLARE p public.products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.products WHERE id='audit-inventory-model';
  IF p.stock <> 9 OR p.stock_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'AUDIT_FAIL general inventory: stock %, confirmed %',p.stock,p.stock_confirmed;
  END IF;
END $$;

INSERT INTO public.product_variants(id,product_id,label,price_clp,stock,stock_confirmed,display_order)
VALUES
  ('audit-inventory-model-a','audit-inventory-model','A',1000,2,true,0),
  ('audit-inventory-model-b','audit-inventory-model','B',1000,7,false,1);

-- Con variantes, solo A aporta unidades confirmadas: resumen = 2 y global pendiente.
DO $$
DECLARE p public.products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.products WHERE id='audit-inventory-model';
  IF p.stock <> 2 OR p.stock_confirmed IS NOT FALSE THEN
    RAISE EXCEPTION 'AUDIT_FAIL variant summary: stock %, confirmed %',p.stock,p.stock_confirmed;
  END IF;
END $$;

-- Una edición manual del producto no puede crear otra fuente de verdad.
UPDATE public.products
SET stock=999,stock_confirmed=true
WHERE id='audit-inventory-model';

DO $$
DECLARE p public.products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.products WHERE id='audit-inventory-model';
  IF p.stock <> 2 OR p.stock_confirmed IS NOT FALSE THEN
    RAISE EXCEPTION 'AUDIT_FAIL product guard: stock %, confirmed %',p.stock,p.stock_confirmed;
  END IF;
END $$;

-- Cuando B se confirma, el resumen suma A+B y queda globalmente confirmado.
UPDATE public.product_variants
SET stock_confirmed=true
WHERE id='audit-inventory-model-b';

DO $$
DECLARE p public.products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.products WHERE id='audit-inventory-model';
  IF p.stock <> 9 OR p.stock_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'AUDIT_FAIL all variants confirmed: stock %, confirmed %',p.stock,p.stock_confirmed;
  END IF;
END $$;

-- Si desaparecen todas las variantes, no se hereda el agregado como stock general.
DELETE FROM public.product_variants WHERE product_id='audit-inventory-model';

DO $$
DECLARE p public.products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.products WHERE id='audit-inventory-model';
  IF p.stock <> 0 OR p.stock_confirmed IS NOT FALSE THEN
    RAISE EXCEPTION 'AUDIT_FAIL last variant removed: stock %, confirmed %',p.stock,p.stock_confirmed;
  END IF;
END $$;

SELECT 'AUDIT_OK' AS result,
       'general -> variants -> guard -> all confirmed -> back to general' AS scenario;

ROLLBACK;
