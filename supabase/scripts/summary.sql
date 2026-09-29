SELECT 'members' AS entity,count(*) FROM public.members UNION ALL
SELECT 'group_socials',count(*) FROM public.group_socials UNION ALL
SELECT 'products',count(*) FROM public.products UNION ALL
SELECT 'product_variants',count(*) FROM public.product_variants UNION ALL
SELECT 'product_images',count(*) FROM public.product_images UNION ALL
SELECT 'posts',count(*) FROM public.posts UNION ALL
SELECT 'post_images',count(*) FROM public.post_images UNION ALL
SELECT 'events',count(*) FROM public.events UNION ALL
SELECT 'profiles',count(*) FROM public.profiles;

-- Inventario: si hay variantes, product_variants es la fuente y products.stock es solo el resumen confirmado.
SELECT
  p.id,
  p.name,
  CASE WHEN count(v.id)>0 THEN 'variants' ELSE 'product' END AS inventory_source,
  p.price_clp,
  p.stock AS product_summary_stock,
  p.stock_confirmed AS product_summary_confirmed,
  count(v.id) AS variant_count,
  count(v.id) FILTER (WHERE v.stock_confirmed) AS confirmed_variant_count,
  COALESCE(sum(v.stock) FILTER (WHERE v.stock_confirmed),0) AS confirmed_variant_units,
  p.active
FROM public.products p
LEFT JOIN public.product_variants v ON v.product_id=p.id
GROUP BY p.id,p.name,p.price_clp,p.stock,p.stock_confirmed,p.active,p.display_order
ORDER BY p.display_order,p.id;

SELECT product_id,id,label,price_clp,stock,stock_confirmed FROM public.product_variants ORDER BY product_id,display_order;
SELECT id,name,photo_url FROM public.members ORDER BY display_order;
SELECT platform,url FROM public.group_socials ORDER BY platform;
