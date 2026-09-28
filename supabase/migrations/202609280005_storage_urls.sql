-- Aplicar después de subir dist/images a gimae-products con la misma ruta images/.
-- Solo transforma URLs locales iniciales; no sobrescribe ediciones posteriores.
BEGIN;
UPDATE public.members SET photo_url='https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/'||photo_url
WHERE photo_url LIKE 'images/%';
UPDATE public.product_images SET url='https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/'||url
WHERE url LIKE 'images/%';
UPDATE public.product_variants SET image_url='https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/'||image_url
WHERE image_url LIKE 'images/%';
COMMIT;
