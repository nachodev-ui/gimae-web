-- Las integrantes leen únicamente sus publicaciones e imágenes, aun si otra autora publicó contenido público.
-- La web pública utiliza una sesión anon independiente del panel.
BEGIN;
ALTER POLICY posts_public ON public.posts TO anon;
ALTER POLICY post_images_read ON public.post_images TO anon;

CREATE OR REPLACE FUNCTION public.can_read_blog_image(object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = public.blog_object_post_id(object_name)
      AND (
        public.can_write_post(p.author_id)
        OR (
          (SELECT auth.role()) = 'anon'
          AND p.status = 'publicado' AND p.visibility = 'publico' AND p.published_at <= now()
          AND (
            p.cover_url = 'storage:gimae-blog/' || object_name
            OR EXISTS (
              SELECT 1 FROM public.post_images i
              WHERE i.post_id = p.id AND i.url = 'storage:gimae-blog/' || object_name
            )
          )
        )
      )
  )
$$;
COMMIT;
