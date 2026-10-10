-- Imágenes versionadas en Git/Pages; Storage queda para cargas del Backstage.
-- Los predicados exactos conservan cualquier reemplazo editorial posterior.
UPDATE public.members
SET photo_url = replace(
  photo_url,
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/',
  'https://nachodev-ui.github.io/gimae-web/'
)
WHERE photo_url IN (
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/suki.webp',
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/usi.webp',
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/vewe.webp',
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/vali.webp'
);

UPDATE public.product_images
SET url = replace(
  url,
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/',
  'https://nachodev-ui.github.io/gimae-web/'
)
WHERE url IN (
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/merch/lightstick.png',
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/merch/llaveros.png',
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/merch/cheki-individual.png',
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/merch/cheki-grupal.png'
);

UPDATE public.product_variants
SET image_url = replace(
  image_url,
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/',
  'https://nachodev-ui.github.io/gimae-web/'
)
WHERE image_url IN (
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/merch/cheki-individual.png',
  'https://hvaonobbpzbupanuymkh.supabase.co/storage/v1/object/public/gimae-products/images/merch/cheki-grupal.png'
);

-- Impide que vuelvan a subirse copias de dist/images a este bucket.
-- SELECT y DELETE administrativos siguen disponibles para auditar el legado.
ALTER POLICY gimae_products_write ON storage.objects
  WITH CHECK (bucket_id = 'gimae-products' AND name LIKE 'products/%' AND (SELECT private.is_admin()));
ALTER POLICY gimae_products_update ON storage.objects
  USING (bucket_id = 'gimae-products' AND name LIKE 'products/%' AND (SELECT private.is_admin()))
  WITH CHECK (bucket_id = 'gimae-products' AND name LIKE 'products/%' AND (SELECT private.is_admin()));
