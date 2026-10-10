-- Consolida los 14 diseños publicados bajo el producto 05 sin alterar precios,
-- imágenes ni existencias de cada variante. El inventario del padre se recalcula
-- mediante los triggers instalados en 202609290008.
BEGIN;

DO $$
DECLARE
  source_count integer;
  variant_count integer;
  image_count integer;
BEGIN
  LOCK TABLE public.products, public.product_variants, public.product_images,
    public.merch_orders, public.merch_reservation_lines IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO source_count FROM public.products
  WHERE (id, name) IN (('05', 'Postales'), ('06', 'Postales Antigua'),
    ('07', 'Postales Halloween'), ('08', 'Postales Traje'), ('09', 'Postales Verano'));
  IF source_count <> 5 THEN
    RAISE EXCEPTION 'Catálogo de postales distinto al revisado: se esperaban los productos 05 a 09';
  END IF;

  SELECT count(*) INTO variant_count FROM public.product_variants
  WHERE product_id IN ('05', '06', '07', '08', '09');
  IF variant_count <> 15 OR NOT EXISTS (
    SELECT 1 FROM public.product_variants
    WHERE id = '05-45cede5f-1180-4171-b433-29903c87ce3b'
      AND product_id = '05' AND label = 'HALLOWEEN'
      AND stock = 0 AND stock_confirmed = false
  ) OR (SELECT count(*) FROM public.product_variants
         WHERE product_id IN ('06', '07', '08', '09') AND id LIKE 'postal_%') <> 14 THEN
    RAISE EXCEPTION 'Variantes de postales modificadas: revisar antes de consolidar';
  END IF;

  SELECT count(*) INTO image_count FROM public.product_images
  WHERE product_id IN ('05', '06', '07', '08', '09');
  IF image_count <> 14 OR EXISTS (
    SELECT 1 FROM public.product_images WHERE product_id = '05'
  ) THEN
    RAISE EXCEPTION 'Galería de postales modificada: revisar antes de consolidar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.merch_reservation_lines
    WHERE product_id IN ('05', '06', '07', '08', '09')
  ) OR EXISTS (
    SELECT 1 FROM public.merch_orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.items) item
    WHERE item->>'productId' IN ('05', '06', '07', '08', '09')
  ) OR EXISTS (
    SELECT 1 FROM public.merch_orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.stock_allocations) allocation
    WHERE allocation->>'productId' IN ('05', '06', '07', '08', '09')
  ) THEN
    RAISE EXCEPTION 'Hay pedidos o reservas de postales: revisar su historial antes de consolidar';
  END IF;

  -- Variante antigua de prueba, sin imagen, unidades confirmadas ni pedidos.
  DELETE FROM public.product_variants
  WHERE id = '05-45cede5f-1180-4171-b433-29903c87ce3b';

  UPDATE public.product_variants
  SET label = (CASE product_id
      WHEN '06' THEN 'Antigua' WHEN '07' THEN 'Halloween'
      WHEN '08' THEN 'Traje' WHEN '09' THEN 'Verano' END) || ' · ' || label,
    display_order = (CASE product_id
      WHEN '06' THEN 0 WHEN '07' THEN 3
      WHEN '08' THEN 4 WHEN '09' THEN 9 END) + display_order,
    product_id = '05'
  WHERE product_id IN ('06', '07', '08', '09');

  UPDATE public.product_images
  SET display_order = (CASE product_id
      WHEN '06' THEN 0 WHEN '07' THEN 3
      WHEN '08' THEN 4 WHEN '09' THEN 9 END) + display_order,
    product_id = '05'
  WHERE product_id IN ('06', '07', '08', '09');

  UPDATE public.products
  SET active = true, variant_label = 'Diseño',
    description = 'Postales de Gimae.'
  WHERE id = '05';

  DELETE FROM public.products WHERE id IN ('06', '07', '08', '09');

  IF (SELECT count(*) FROM public.product_variants WHERE product_id = '05') <> 14
    OR (SELECT count(*) FROM public.product_images WHERE product_id = '05') <> 14
    OR (SELECT stock FROM public.products WHERE id = '05') <> 55 THEN
    RAISE EXCEPTION 'La consolidación de postales no conservó el catálogo o stock esperado';
  END IF;
END;
$$;

COMMIT;
