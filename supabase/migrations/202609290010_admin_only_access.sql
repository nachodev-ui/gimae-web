BEGIN;

-- Desde esta migración, una fila en public.profiles ES el permiso de acceso al Backstage.
-- Ya no existen roles de integrante ni vínculos entre una cuenta Auth y una member.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = (SELECT auth.uid())
  )
$$;

-- La autoría visible deja de derivarse de una cuenta/member. Los posts existentes
-- conservan author_name y los nuevos usan el DEFAULT 'Equipo Gimae'.
DROP TRIGGER IF EXISTS set_post_author_name ON public.posts;
DROP FUNCTION IF EXISTS public.set_post_author_name();

-- Retirar las políticas editoriales basadas en propiedad antes de eliminar
-- can_write_post(). La lectura pública anon permanece separada.
DROP POLICY IF EXISTS posts_private ON public.posts;
DROP POLICY IF EXISTS posts_insert ON public.posts;
DROP POLICY IF EXISTS posts_update ON public.posts;
DROP POLICY IF EXISTS posts_delete ON public.posts;
DROP POLICY IF EXISTS posts_admin ON public.posts;

DROP POLICY IF EXISTS post_images_private ON public.post_images;
DROP POLICY IF EXISTS post_images_insert ON public.post_images;
DROP POLICY IF EXISTS post_images_update ON public.post_images;
DROP POLICY IF EXISTS post_images_delete ON public.post_images;
DROP POLICY IF EXISTS post_images_admin ON public.post_images;

-- El blog privado sigue usando rutas posts/<uuid>/<archivo>, pero cualquier cuenta
-- autorizada del Backstage puede gestionar cualquier post y sus archivos.
CREATE OR REPLACE FUNCTION public.can_upload_blog_image(object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = public.blog_object_post_id(object_name)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_blog_image(object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = public.blog_object_post_id(object_name)
      AND (
        public.is_admin()
        OR (
          (SELECT auth.role()) = 'anon'
          AND p.status = 'publicado'
          AND p.visibility = 'publico'
          AND p.published_at <= now()
          AND (
            p.cover_url = 'storage:gimae-blog/' || object_name
            OR EXISTS (
              SELECT 1 FROM public.post_images i
              WHERE i.post_id = p.id
                AND i.url = 'storage:gimae-blog/' || object_name
            )
          )
        )
      )
  )
$$;

DROP FUNCTION IF EXISTS public.can_write_post(uuid);

-- Una única política administrativa por tabla editorial. posts_public y
-- post_images_read siguen siendo las políticas anon creadas anteriormente.
CREATE POLICY posts_admin ON public.posts FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY post_images_admin ON public.post_images FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Todas las filas de profiles representan cuentas administrativas. Los datos de
-- las integrantes permanecen exclusivamente en public.members.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS member_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

COMMIT;
