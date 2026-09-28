-- Ejecutar como propietaria en SQL Editor. El error AUDIT_RESULT es intencional:
-- aborta toda la sentencia y elimina usuarios, perfiles, posts, imágenes y objetos de prueba.
-- Los UUID de prueba no son credenciales reales ni tokens firmados.
DO $audit$
DECLARE
  author_a uuid := 'a0000000-0000-4000-8000-000000000001';
  author_b uuid := 'a0000000-0000-4000-8000-000000000002';
  admin_id uuid := 'a0000000-0000-4000-8000-000000000003';
  own_public uuid := 'b0000000-0000-4000-8000-000000000001';
  own_draft uuid := 'b0000000-0000-4000-8000-000000000002';
  other_public uuid := 'b0000000-0000-4000-8000-000000000003';
  other_private uuid := 'b0000000-0000-4000-8000-000000000004';
  results jsonb := '{}'::jsonb;
  changed integer;
BEGIN
  INSERT INTO auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  VALUES (author_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-a@example.invalid','',now(),now(),now()),
         (author_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-b@example.invalid','',now(),now(),now()),
         (admin_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-admin@example.invalid','',now(),now(),now());
  INSERT INTO public.profiles (user_id,email,role,member_id)
  VALUES (author_a,'audit-a@example.invalid','integrante','01'),
         (author_b,'audit-b@example.invalid','integrante','02'),
         (admin_id,'audit-admin@example.invalid','admin',NULL);
  INSERT INTO public.products(id,name,price_clp,stock,stock_confirmed,active)
  VALUES ('audit-hidden','Hidden audit product',777,3,true,false);
  INSERT INTO public.product_variants(id,product_id,label,price_clp)
  VALUES ('audit-hidden-variant','audit-hidden','Hidden',777);
  INSERT INTO public.product_images(product_id,url)
  VALUES ('audit-hidden','https://example.invalid/hidden.webp');
  INSERT INTO public.events(title,starts_at,active) VALUES
    ('Visible audit event',now()+interval '1 day',true),
    ('Hidden audit event',now()+interval '2 days',false);
  INSERT INTO public.posts (id,author_id,title,slug,status,visibility,published_at)
  VALUES (own_public,author_a,'Own public','audit-own-public','publicado','publico',now()-interval '1 hour'),
         (own_draft,author_a,'Own draft','audit-own-draft','borrador','publico',NULL),
         (other_public,author_b,'Other public','audit-other-public','publicado','publico',now()-interval '1 hour'),
         (other_private,author_b,'Other private','audit-other-private','publicado','exclusivo',now()-interval '1 hour');
  UPDATE public.posts SET cover_url='storage:gimae-blog/posts/'||id||'/cover.webp'
  WHERE id IN (own_public,own_draft,other_public,other_private);
  INSERT INTO public.post_images (post_id,url) VALUES
    (own_draft,'storage:gimae-blog/posts/'||own_draft||'/extra.webp'),
    (other_public,'storage:gimae-blog/posts/'||other_public||'/extra.webp');
  INSERT INTO storage.objects (bucket_id,name) VALUES
    ('gimae-blog','posts/'||own_draft||'/extra.webp'),
    ('gimae-blog','posts/'||other_public||'/extra.webp');

  PERFORM set_config('request.jwt.claim.role','anon',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT jsonb_build_object(
    'role',current_user,'posts',(SELECT count(*) FROM public.posts),
    'other_public',(SELECT count(*) FROM public.posts WHERE id=other_public),
    'other_private',(SELECT count(*) FROM public.posts WHERE id=other_private),
    'post_images',(SELECT count(*) FROM public.post_images),
    'blog_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='gimae-blog'),
    'products',(SELECT count(*) FROM public.products),
    'hidden_product',(SELECT count(*) FROM public.products WHERE id='audit-hidden'),
    'hidden_variant',(SELECT count(*) FROM public.product_variants WHERE product_id='audit-hidden'),
    'hidden_image',(SELECT count(*) FROM public.product_images WHERE product_id='audit-hidden'),
    'events',(SELECT count(*) FROM public.events),
    'profiles',(SELECT count(*) FROM public.profiles)) INTO results;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',author_a::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  results := results || jsonb_build_object('member',jsonb_build_object(
    'role',current_user,'posts',(SELECT count(*) FROM public.posts),
    'own_draft',(SELECT count(*) FROM public.posts WHERE id=own_draft),
    'other_public',(SELECT count(*) FROM public.posts WHERE id=other_public),
    'other_private',(SELECT count(*) FROM public.posts WHERE id=other_private),
    'post_images',(SELECT count(*) FROM public.post_images),
    'blog_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='gimae-blog'),
    'other_public_object',(SELECT count(*) FROM storage.objects WHERE name='posts/'||other_public||'/extra.webp'),
    'own_draft_object',(SELECT count(*) FROM storage.objects WHERE name='posts/'||own_draft||'/extra.webp'),
    'hidden_product',(SELECT count(*) FROM public.products WHERE id='audit-hidden'),
    'events',(SELECT count(*) FROM public.events),
    'profile_count',(SELECT count(*) FROM public.profiles),
    'is_admin',public.is_admin()));
  UPDATE public.posts SET title='Forbidden other edit' WHERE id=other_public;
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('member_other_post_updates',changed);
  UPDATE public.products SET price_clp=1 WHERE id='01';
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('member_product_updates',changed);
  UPDATE public.product_variants SET stock=1 WHERE id='individual-01';
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('member_variant_stock_updates',changed);
  UPDATE public.posts SET title='Allowed own edit' WHERE id=own_draft;
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('member_own_post_updates',changed);
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  results := results || jsonb_build_object('admin',jsonb_build_object(
    'role',current_user,'posts',(SELECT count(*) FROM public.posts),
    'post_images',(SELECT count(*) FROM public.post_images),
    'blog_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='gimae-blog'),
    'products',(SELECT count(*) FROM public.products),
    'hidden_product',(SELECT count(*) FROM public.products WHERE id='audit-hidden'),
    'events',(SELECT count(*) FROM public.events),
    'profiles',(SELECT count(*) FROM public.profiles),'is_admin',public.is_admin()));
  UPDATE public.posts SET title='Allowed admin edit' WHERE id=other_public;
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('admin_other_post_updates',changed);
  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'AUDIT_RESULT %', results;
END
$audit$;
