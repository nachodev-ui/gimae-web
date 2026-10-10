-- An Auth account without a Backstage profile should retain the same public
-- reads as an anonymous visitor. Admin policies remain separate and unchanged.
ALTER POLICY posts_public ON public.posts TO anon, authenticated;
ALTER POLICY post_images_read ON public.post_images TO anon, authenticated;
ALTER POLICY gacha_cards_public ON public.gacha_cards TO anon, authenticated;
ALTER POLICY gacha_settings_public ON public.gacha_settings TO anon, authenticated;

-- The private bucket still exposes only files linked to a published, public,
-- currently visible post. A signed-in non-admin may read those same files.
CREATE OR REPLACE FUNCTION private.can_read_blog_image(object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = private.blog_object_post_id(object_name)
      AND (
        private.is_admin()
        OR (
          p.status = 'publicado'
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
