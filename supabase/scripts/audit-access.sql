-- Ejecutar como propietaria en SQL Editor DESPUÉS de aplicar la migración 0010.
-- El error AUDIT_RESULT es intencional: aborta la sentencia completa y revierte
-- usuarios, perfiles, posts, imágenes, objetos, productos y eventos de prueba.
DO $audit$
DECLARE
  admin_a uuid := 'a1000000-0000-4000-8000-000000000001';
  admin_b uuid := 'a1000000-0000-4000-8000-000000000002';
  outsider uuid := 'a1000000-0000-4000-8000-000000000003';
  a_public uuid := 'b1000000-0000-4000-8000-000000000001';
  a_draft uuid := 'b1000000-0000-4000-8000-000000000002';
  b_public uuid := 'b1000000-0000-4000-8000-000000000003';
  b_private uuid := 'b1000000-0000-4000-8000-000000000004';
  results jsonb := '{}'::jsonb;
  changed integer;
BEGIN
  INSERT INTO auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  VALUES
    (admin_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-admin-a@example.invalid','',now(),now(),now()),
    (admin_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-admin-b@example.invalid','',now(),now(),now()),
    (outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-outsider@example.invalid','',now(),now(),now());

  INSERT INTO public.profiles (user_id,email)
  VALUES
    (admin_a,'audit-admin-a@example.invalid'),
    (admin_b,'audit-admin-b@example.invalid');

  INSERT INTO public.products(id,name,price_clp,stock,stock_confirmed,active)
  VALUES ('audit-access-hidden','Hidden audit product',777,3,true,false);
  INSERT INTO public.product_variants(id,product_id,label,price_clp)
  VALUES ('audit-access-hidden-variant','audit-access-hidden','Hidden',777);
  INSERT INTO public.product_images(product_id,url)
  VALUES ('audit-access-hidden','https://example.invalid/hidden.webp');
  INSERT INTO public.events(title,starts_at,active) VALUES
    ('Visible access audit event',now()+interval '1 day',true),
    ('Hidden access audit event',now()+interval '2 days',false);

  INSERT INTO public.posts (id,author_id,title,slug,status,visibility,published_at)
  VALUES
    (a_public,admin_a,'Admin A public','audit-access-a-public','publicado','publico',now()-interval '1 hour'),
    (a_draft,admin_a,'Admin A draft','audit-access-a-draft','borrador','publico',NULL),
    (b_public,admin_b,'Admin B public','audit-access-b-public','publicado','publico',now()-interval '1 hour'),
    (b_private,admin_b,'Admin B private','audit-access-b-private','publicado','exclusivo',now()-interval '1 hour');

  UPDATE public.posts SET cover_url='storage:gimae-blog/posts/'||id||'/cover.webp'
  WHERE id IN (a_public,a_draft,b_public,b_private);
  INSERT INTO public.post_images (post_id,url) VALUES
    (a_draft,'storage:gimae-blog/posts/'||a_draft||'/extra.webp'),
    (b_public,'storage:gimae-blog/posts/'||b_public||'/extra.webp');
  INSERT INTO storage.objects (bucket_id,name) VALUES
    ('gimae-blog','posts/'||a_draft||'/extra.webp'),
    ('gimae-blog','posts/'||b_public||'/extra.webp');

  -- Visitante: solo posts públicos y recursos realmente públicos.
  PERFORM set_config('request.jwt.claim.role','anon',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  EXECUTE 'SET LOCAL ROLE anon';
  results := results || jsonb_build_object('anon',jsonb_build_object(
    'posts',(SELECT count(*) FROM public.posts),
    'private_posts',(SELECT count(*) FROM public.posts WHERE visibility='exclusivo'),
    'post_images',(SELECT count(*) FROM public.post_images),
    'blog_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='gimae-blog'),
    'hidden_product',(SELECT count(*) FROM public.products WHERE id='audit-access-hidden'),
    'visible_events',(SELECT count(*) FROM public.events),
    'profiles',(SELECT count(*) FROM public.profiles)
  ));
  EXECUTE 'RESET ROLE';

  -- Usuario Auth sin profile: no es Backstage y no puede escribir.
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  results := results || jsonb_build_object('outsider',jsonb_build_object(
    'is_admin',public.is_admin(),
    'posts',(SELECT count(*) FROM public.posts),
    'blog_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='gimae-blog'),
    'profile_rows',(SELECT count(*) FROM public.profiles)
  ));
  UPDATE public.posts SET title='Forbidden outsider edit' WHERE id=b_public;
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('outsider_post_updates',changed);
  UPDATE public.products SET price_clp=1 WHERE id='audit-access-hidden';
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('outsider_product_updates',changed);
  EXECUTE 'RESET ROLE';

  -- Admin A puede gestionar contenido creado por Admin B.
  PERFORM set_config('request.jwt.claim.sub',admin_a::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  results := results || jsonb_build_object('admin_a',jsonb_build_object(
    'is_admin',public.is_admin(),
    'posts',(SELECT count(*) FROM public.posts),
    'post_images',(SELECT count(*) FROM public.post_images),
    'blog_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='gimae-blog'),
    'hidden_product',(SELECT count(*) FROM public.products WHERE id='audit-access-hidden'),
    'profiles',(SELECT count(*) FROM public.profiles)
  ));
  UPDATE public.posts SET title='Cross edit by Admin A' WHERE id=b_public;
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('admin_a_cross_post_updates',changed);
  UPDATE public.products SET price_clp=778 WHERE id='audit-access-hidden';
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('admin_a_product_updates',changed);
  EXECUTE 'RESET ROLE';

  -- Admin B puede gestionar contenido creado por Admin A.
  PERFORM set_config('request.jwt.claim.sub',admin_b::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  results := results || jsonb_build_object('admin_b',jsonb_build_object(
    'is_admin',public.is_admin(),
    'posts',(SELECT count(*) FROM public.posts),
    'private_post',(SELECT count(*) FROM public.posts WHERE id=b_private),
    'profiles',(SELECT count(*) FROM public.profiles)
  ));
  UPDATE public.posts SET title='Cross edit by Admin B' WHERE id=a_draft;
  GET DIAGNOSTICS changed = ROW_COUNT;
  results := results || jsonb_build_object('admin_b_cross_post_updates',changed);
  EXECUTE 'RESET ROLE';

  -- Esperado: outsider_*_updates=0; ambos cross_post_updates=1;
  -- admin_a/admin_b is_admin=true; anon no ve privados ni producto oculto.
  RAISE EXCEPTION 'AUDIT_RESULT %', results;
END
$audit$;
