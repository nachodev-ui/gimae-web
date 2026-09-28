SELECT 'members' AS entity,count(*) FROM public.members UNION ALL
SELECT 'group_socials',count(*) FROM public.group_socials UNION ALL
SELECT 'products',count(*) FROM public.products UNION ALL
SELECT 'product_variants',count(*) FROM public.product_variants UNION ALL
SELECT 'product_images',count(*) FROM public.product_images UNION ALL
SELECT 'posts',count(*) FROM public.posts UNION ALL
SELECT 'post_images',count(*) FROM public.post_images UNION ALL
SELECT 'events',count(*) FROM public.events UNION ALL
SELECT 'profiles',count(*) FROM public.profiles;

SELECT id,name,price_clp,stock,stock_confirmed,active FROM public.products ORDER BY display_order;
SELECT product_id,id,label,price_clp,stock,stock_confirmed FROM public.product_variants ORDER BY product_id,display_order;
SELECT id,name,photo_url FROM public.members ORDER BY display_order;
SELECT platform,url FROM public.group_socials ORDER BY platform;
