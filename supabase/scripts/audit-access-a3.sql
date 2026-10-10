-- Ejecutar SOLO en una base aislada con todas las migraciones, incluida
-- 20261010175130_a3_authenticated_public_reads.sql. Nunca en producción.
-- Todos los datos y cambios de prueba se revierten con ROLLBACK.
BEGIN;

DO $audit$
DECLARE
  admin_a uuid := 'a3000000-0000-4000-8000-000000000001';
  admin_b uuid := 'a3000000-0000-4000-8000-000000000002';
  outsider uuid := 'a3000000-0000-4000-8000-000000000003';
  public_post uuid := 'b3000000-0000-4000-8000-000000000001';
  draft_post uuid := 'b3000000-0000-4000-8000-000000000002';
  public_blog_object text := 'posts/b3000000-0000-4000-8000-000000000001/public.webp';
  public_blog_extra text := 'posts/b3000000-0000-4000-8000-000000000001/extra.webp';
  draft_blog_object text := 'posts/b3000000-0000-4000-8000-000000000002/draft.webp';
  actor record;
  internal_table text;
  bucket_case record;
  probe_name text;
  visible_count integer;
  hidden_count integer;
  changed integer;
  can_select boolean;
  can_write boolean;
  is_admin boolean;
  expected_admin boolean;
  expected_admin_count integer;
  role_results jsonb;
BEGIN
  INSERT INTO auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  VALUES
    (admin_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-a3-admin-a@example.invalid','',now(),now(),now()),
    (admin_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-a3-admin-b@example.invalid','',now(),now(),now()),
    (outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-a3-outsider@example.invalid','',now(),now(),now());
  INSERT INTO public.profiles (user_id,email) VALUES
    (admin_a,'audit-a3-admin-a@example.invalid'),
    (admin_b,'audit-a3-admin-b@example.invalid');

  INSERT INTO public.posts (id,author_id,title,slug,status,visibility,published_at)
  VALUES
    (public_post,admin_a,'A3 public','audit-a3-public','publicado','publico',now()-interval '1 hour'),
    (draft_post,admin_b,'A3 draft','audit-a3-draft','borrador','publico',NULL);
  UPDATE public.posts SET cover_url='storage:gimae-blog/'||public_blog_object
    WHERE id=public_post;
  INSERT INTO public.post_images (post_id,url) VALUES
    (public_post,'storage:gimae-blog/'||public_blog_extra),
    (draft_post,'storage:gimae-blog/'||draft_blog_object);
  INSERT INTO public.gacha_cards (serial,integrante,rareza,imagen,active)
  VALUES
    ('audit-a3-active','Audit','common','images/suki.webp',true),
    ('audit-a3-hidden','Audit','common','images/suki.webp',false);
  INSERT INTO storage.objects (bucket_id,name) VALUES
    ('gimae-blog',public_blog_object),
    ('gimae-blog',public_blog_extra),
    ('gimae-blog',draft_blog_object),
    ('gimae-products','audit-a3/product.webp'),
    ('gimae-members','members/audit-a3.webp'),
    ('gimae-gacha','audit-a3/card.webp');

  -- Storage API activa este GUC antes de borrar; el trigger bloquea DELETE
  -- SQL directo incluso cuando la política RLS permite la operación.
  PERFORM set_config('storage.allow_delete_query','true',true);

  FOR actor IN
    SELECT * FROM (VALUES
      ('anon'::text, NULL::uuid, 'anon'::text, false),
      ('outsider', outsider, 'authenticated', false),
      ('admin_a', admin_a, 'authenticated', true),
      ('admin_b', admin_b, 'authenticated', true)
    ) AS cases(label,user_id,db_role,admin_expected)
  LOOP
    expected_admin := actor.admin_expected;
    expected_admin_count := CASE WHEN expected_admin THEN 1 ELSE 0 END;
    PERFORM set_config('request.jwt.claim.role',actor.db_role,true);
    PERFORM set_config('request.jwt.claim.sub',coalesce(actor.user_id::text,''),true);
    EXECUTE format('SET LOCAL ROLE %I',actor.db_role);

    IF actor.db_role='authenticated' THEN
      SELECT private.is_admin() INTO is_admin;
      IF is_admin IS DISTINCT FROM expected_admin THEN
        RAISE EXCEPTION '%: is_admin incorrecto',actor.label;
      END IF;
    END IF;

    SELECT count(*) INTO visible_count FROM public.posts WHERE id=public_post;
    SELECT count(*) INTO hidden_count FROM public.posts WHERE id=draft_post;
    IF visible_count<>1 OR hidden_count<>expected_admin_count THEN
      RAISE EXCEPTION '%: lectura de posts incorrecta (%/%).',actor.label,visible_count,hidden_count;
    END IF;
    SELECT count(*) INTO visible_count FROM public.post_images WHERE post_id=public_post;
    IF visible_count<>1 THEN RAISE EXCEPTION '%: imagen pública invisible.',actor.label; END IF;
    SELECT count(*) INTO hidden_count FROM public.post_images WHERE post_id=draft_post;
    IF hidden_count<>expected_admin_count THEN
      RAISE EXCEPTION '%: lectura de imágenes de borrador incorrecta.',actor.label;
    END IF;

    SELECT count(*) INTO visible_count FROM public.gacha_cards WHERE serial='audit-a3-active';
    SELECT count(*) INTO hidden_count FROM public.gacha_cards WHERE serial='audit-a3-hidden';
    IF visible_count<>1 OR hidden_count<>expected_admin_count THEN
      RAISE EXCEPTION '%: lectura de cartas Gacha incorrecta.',actor.label;
    END IF;
    SELECT count(*) INTO visible_count FROM public.gacha_settings WHERE id=true;
    IF visible_count<>1 THEN RAISE EXCEPTION '%: configuración Gacha invisible.',actor.label; END IF;

    role_results := jsonb_build_object('admin',expected_admin);
    FOR bucket_case IN
      SELECT * FROM (VALUES
        ('gimae-blog'::text,public_blog_object,1),
        ('gimae-blog',public_blog_extra,1),
        ('gimae-blog',draft_blog_object,expected_admin_count),
        ('gimae-products','audit-a3/product.webp',expected_admin_count),
        ('gimae-members','members/audit-a3.webp',expected_admin_count),
        ('gimae-gacha','audit-a3/card.webp',1)
      ) AS cases(bucket_id,object_name,expected_reads)
    LOOP
      SELECT count(*) INTO visible_count FROM storage.objects
        WHERE bucket_id=bucket_case.bucket_id AND name=bucket_case.object_name;
      IF visible_count<>bucket_case.expected_reads THEN
        RAISE EXCEPTION '%: lectura incorrecta en %/%: %',
          actor.label,bucket_case.bucket_id,bucket_case.object_name,visible_count;
      END IF;

      UPDATE storage.objects SET name=name
        WHERE bucket_id=bucket_case.bucket_id AND name=bucket_case.object_name;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed<>expected_admin_count THEN
        RAISE EXCEPTION '%: escritura incorrecta en %/%: %',
          actor.label,bucket_case.bucket_id,bucket_case.object_name,changed;
      END IF;
      role_results := role_results || jsonb_build_object(
        bucket_case.bucket_id||':'||bucket_case.object_name,
        jsonb_build_object('read',visible_count,'update',changed));
    END LOOP;

    FOR bucket_case IN
      SELECT * FROM (VALUES
        ('gimae-blog'::text,'posts/'||public_post||'/probe-'||actor.label||'.webp'),
        ('gimae-products','audit-a3/probe-'||actor.label||'.webp'),
        ('gimae-members','members/probe-'||actor.label||'.webp'),
        ('gimae-gacha','audit-a3/probe-'||actor.label||'.webp')
      ) AS cases(bucket_id,object_name)
    LOOP
      probe_name := bucket_case.object_name;
      can_write := false;
      BEGIN
        INSERT INTO storage.objects (bucket_id,name)
          VALUES (bucket_case.bucket_id,probe_name);
        can_write := true;
      EXCEPTION WHEN insufficient_privilege THEN can_write := false;
      END;
      IF can_write IS DISTINCT FROM expected_admin THEN
        RAISE EXCEPTION '%: inserción incorrecta en %.',actor.label,bucket_case.bucket_id;
      END IF;

      changed := 0;
      BEGIN
        IF expected_admin THEN
          DELETE FROM storage.objects WHERE bucket_id=bucket_case.bucket_id
            AND name=probe_name;
          GET DIAGNOSTICS changed = ROW_COUNT;
        ELSE
          DELETE FROM storage.objects WHERE bucket_id=bucket_case.bucket_id
            AND name=CASE bucket_case.bucket_id
              WHEN 'gimae-blog' THEN public_blog_object
              WHEN 'gimae-products' THEN 'audit-a3/product.webp'
              WHEN 'gimae-members' THEN 'members/audit-a3.webp'
              ELSE 'audit-a3/card.webp'
            END;
          GET DIAGNOSTICS changed = ROW_COUNT;
        END IF;
      EXCEPTION WHEN insufficient_privilege THEN changed := 0;
      END;
      IF changed<>expected_admin_count THEN
        RAISE EXCEPTION '%: borrado incorrecto en %.',actor.label,bucket_case.bucket_id;
      END IF;
      role_results := role_results || jsonb_build_object(
        bucket_case.bucket_id||':mutations',
        jsonb_build_object('insert',can_write,'delete',changed));
    END LOOP;

    changed := 0;
    BEGIN
      UPDATE public.posts SET title=title WHERE id=public_post;
      GET DIAGNOSTICS changed = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN changed := 0;
    END;
    IF changed<>expected_admin_count THEN
      RAISE EXCEPTION '%: actualización de posts incorrecta.',actor.label;
    END IF;
    changed := 0;
    BEGIN
      UPDATE public.gacha_cards SET display_order=display_order WHERE serial='audit-a3-active';
      GET DIAGNOSTICS changed = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN changed := 0;
    END;
    IF changed<>expected_admin_count THEN
      RAISE EXCEPTION '%: actualización de cartas incorrecta.',actor.label;
    END IF;
    changed := 0;
    BEGIN
      UPDATE public.gacha_settings SET minimum_clp=minimum_clp WHERE id=true;
      GET DIAGNOSTICS changed = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN changed := 0;
    END;
    IF changed<>expected_admin_count THEN
      RAISE EXCEPTION '%: actualización de configuración incorrecta.',actor.label;
    END IF;

    -- Las ocho tablas internas carecen de GRANT cliente y deniegan SELECT real.
    FOR internal_table IN SELECT unnest(ARRAY[
      'private.gacha_draws','private.gacha_redemptions','private.paypal_rate_limits',
      'public.merch_reservation_lines','public.paypal_fx_rates',
      'public.paypal_reconcile_auth','public.paypal_webhook_events',
      'public.webpay_reconcile_auth'
    ]) LOOP
      can_write := has_table_privilege(current_user,internal_table,'INSERT,UPDATE,DELETE');
      IF can_write THEN RAISE EXCEPTION '%: escritura interna concedida en %',actor.label,internal_table; END IF;
      can_select := false;
      BEGIN
        EXECUTE 'SELECT 1 FROM '||internal_table||' LIMIT 0';
        can_select := true;
      EXCEPTION WHEN insufficient_privilege THEN
        can_select := false;
      END;
      IF can_select THEN RAISE EXCEPTION '%: lectura interna concedida en %',actor.label,internal_table; END IF;
    END LOOP;

    RAISE NOTICE 'AUDIT_A3 % %',actor.label,role_results;
    EXECUTE 'RESET ROLE';
  END LOOP;
END
$audit$;

ROLLBACK;
