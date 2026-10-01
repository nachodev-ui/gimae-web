BEGIN;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES (
  'gimae-members',
  'gimae-members',
  true,
  8388608,
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS gimae_members_write ON storage.objects;
DROP POLICY IF EXISTS gimae_members_update ON storage.objects;
DROP POLICY IF EXISTS gimae_members_delete ON storage.objects;
DROP POLICY IF EXISTS gimae_members_list ON storage.objects;

CREATE POLICY gimae_members_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='gimae-members'
    AND public.is_admin()
    AND name LIKE 'members/%'
  );

CREATE POLICY gimae_members_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id='gimae-members'
    AND public.is_admin()
    AND name LIKE 'members/%'
  )
  WITH CHECK (
    bucket_id='gimae-members'
    AND public.is_admin()
    AND name LIKE 'members/%'
  );

CREATE POLICY gimae_members_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id='gimae-members'
    AND public.is_admin()
    AND name LIKE 'members/%'
  );

CREATE POLICY gimae_members_list ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id='gimae-members'
    AND public.is_admin()
    AND name LIKE 'members/%'
  );

COMMIT;
