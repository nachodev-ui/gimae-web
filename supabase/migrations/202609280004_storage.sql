-- La portada de un post exclusivo nunca se entrega sin sesión autorizada.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES
  ('gimae-products','gimae-products',true,8388608,ARRAY['image/png','image/jpeg','image/webp']),
  ('gimae-blog','gimae-blog',false,8388608,ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

-- La ruta es posts/<uuid>/<archivo>. El formato CASE impide convertir UUID ajenos al patrón.
CREATE FUNCTION public.blog_object_post_id(object_name text) RETURNS uuid LANGUAGE sql IMMUTABLE
SET search_path = '' AS $$
  SELECT CASE WHEN object_name ~ '^posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    THEN split_part(object_name,'/',2)::uuid ELSE NULL END
$$;
CREATE FUNCTION public.can_upload_blog_image(object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.posts p
    WHERE p.id=public.blog_object_post_id(object_name) AND public.can_write_post(p.author_id))
$$;
CREATE FUNCTION public.can_read_blog_image(object_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.posts p WHERE p.id=public.blog_object_post_id(object_name)
    AND (public.can_write_post(p.author_id) OR
      (p.status='publicado' AND p.visibility='publico' AND p.published_at<=now()
       AND (p.cover_url='storage:gimae-blog/'||object_name OR EXISTS (
         SELECT 1 FROM public.post_images i WHERE i.post_id=p.id AND i.url='storage:gimae-blog/'||object_name)))))
$$;
REVOKE ALL ON FUNCTION public.blog_object_post_id(text),public.can_upload_blog_image(text),public.can_read_blog_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blog_object_post_id(text),public.can_read_blog_image(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_blog_image(text) TO authenticated;

CREATE POLICY gimae_products_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='gimae-products' AND public.is_admin());
CREATE POLICY gimae_products_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='gimae-products' AND public.is_admin()) WITH CHECK (bucket_id='gimae-products' AND public.is_admin());
CREATE POLICY gimae_products_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='gimae-products' AND public.is_admin());
CREATE POLICY gimae_products_list ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='gimae-products' AND public.is_admin());
CREATE POLICY gimae_blog_read ON storage.objects FOR SELECT TO anon,authenticated
  USING (bucket_id='gimae-blog' AND public.can_read_blog_image(name));
CREATE POLICY gimae_blog_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='gimae-blog' AND public.can_upload_blog_image(name));
CREATE POLICY gimae_blog_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='gimae-blog' AND public.can_upload_blog_image(name))
  WITH CHECK (bucket_id='gimae-blog' AND public.can_upload_blog_image(name));
CREATE POLICY gimae_blog_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='gimae-blog' AND public.can_upload_blog_image(name));
