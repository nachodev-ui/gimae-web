-- Los helpers de RLS siguen funcionando, pero dejan de estar publicados como RPC.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

ALTER FUNCTION public.blog_object_post_id(text) SET SCHEMA private;
ALTER FUNCTION public.is_admin() SET SCHEMA private;
ALTER FUNCTION public.can_read_blog_image(text) SET SCHEMA private;
ALTER FUNCTION public.can_upload_blog_image(text) SET SCHEMA private;

CREATE OR REPLACE FUNCTION private.can_read_blog_image(object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = private.blog_object_post_id(object_name)
      AND (private.is_admin() OR (
        (SELECT auth.role()) = 'anon'
        AND p.status = 'publicado' AND p.visibility = 'publico' AND p.published_at <= now()
        AND (p.cover_url = 'storage:gimae-blog/' || object_name OR EXISTS (
          SELECT 1 FROM public.post_images i
          WHERE i.post_id = p.id AND i.url = 'storage:gimae-blog/' || object_name
        ))
      ))
  )
$$;
CREATE OR REPLACE FUNCTION private.can_upload_blog_image(object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_admin() AND EXISTS (
    SELECT 1 FROM public.posts p WHERE p.id = private.blog_object_post_id(object_name)
  )
$$;

REVOKE ALL ON FUNCTION private.blog_object_post_id(text), private.is_admin(),
  private.can_read_blog_image(text), private.can_upload_blog_image(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(), private.can_upload_blog_image(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_blog_image(text) TO anon, authenticated;

-- Contadores atómicos compartidos por todas las instancias Edge. Ningún dato de IP
-- se guarda sin hash; el límite global sigue vigente si la IP enviada es falsa.
CREATE TABLE private.paypal_rate_limits (
  scope text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject_hash)
);
ALTER TABLE private.paypal_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.paypal_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.paypal_rate_limits TO service_role;

CREATE FUNCTION public.check_paypal_rate_limit(p_action text, p_subject text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  global_limit integer;
  subject_limit integer;
  subject_seconds integer;
  entry record;
  current_hits integer;
BEGIN
  IF p_subject !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid rate limit subject';
  END IF;
  CASE p_action
    WHEN 'create' THEN global_limit := 40; subject_limit := 5; subject_seconds := 600;
    WHEN 'capture' THEN global_limit := 120; subject_limit := 6; subject_seconds := 60;
    WHEN 'status' THEN global_limit := 600; subject_limit := 36; subject_seconds := 60;
    WHEN 'webhook' THEN global_limit := 300; subject_limit := 60; subject_seconds := 60;
    ELSE RAISE EXCEPTION 'invalid rate limit action';
  END CASE;

  FOR entry IN SELECT * FROM (VALUES
    (p_action || ':global', 'global', global_limit, 60),
    (p_action || ':subject', p_subject, subject_limit, subject_seconds)
  ) AS limits(scope, subject_hash, max_hits, window_seconds) LOOP
    INSERT INTO private.paypal_rate_limits(scope, subject_hash, window_started_at, hits)
      VALUES (entry.scope, entry.subject_hash, clock_timestamp(), 1)
    ON CONFLICT (scope, subject_hash) DO UPDATE SET
      hits = CASE WHEN private.paypal_rate_limits.window_started_at <=
        clock_timestamp() - make_interval(secs => entry.window_seconds)
        THEN 1 ELSE LEAST(private.paypal_rate_limits.hits + 1, 1000000) END,
      window_started_at = CASE WHEN private.paypal_rate_limits.window_started_at <=
        clock_timestamp() - make_interval(secs => entry.window_seconds)
        THEN clock_timestamp() ELSE private.paypal_rate_limits.window_started_at END
    RETURNING hits INTO current_hits;
    IF current_hits > entry.max_hits THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.check_paypal_rate_limit(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_paypal_rate_limit(text,text) TO service_role;

SELECT cron.schedule('gimae-paypal-rate-limit-cleanup', '17 3 * * *',
  $$DELETE FROM private.paypal_rate_limits WHERE window_started_at < now() - interval '2 days'$$);
