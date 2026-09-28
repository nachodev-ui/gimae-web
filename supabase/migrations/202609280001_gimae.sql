-- Supabase Postgres: ejecutar antes de la migración de contenido.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.members (
  id text PRIMARY KEY, name text NOT NULL, color text NOT NULL,
  accent text NOT NULL CHECK (accent ~ '^#[0-9A-Fa-f]{6}$'),
  color_label text NOT NULL, photo_url text, handle text, biography text,
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.group_socials (
  platform text PRIMARY KEY, url text NOT NULL CHECK (url ~ '^https://'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.products (
  id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '', color text NOT NULL DEFAULT 'pink',
  price_clp integer NOT NULL CHECK (price_clp >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_confirmed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0,
  variant_label text, variant_source text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.product_variants (
  id text PRIMARY KEY, product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label text NOT NULL, member_id text REFERENCES public.members(id) ON DELETE SET NULL,
  price_clp integer NOT NULL CHECK (price_clp >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_confirmed boolean NOT NULL DEFAULT false,
  image_url text, image_alt text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, id)
);
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL, alt text NOT NULL DEFAULT '', display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email text NOT NULL, role text NOT NULL CHECK (role IN ('admin','integrante')),
  member_id text UNIQUE REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_role CHECK (role = 'admin' OR member_id IS NOT NULL)
);
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid NOT NULL REFERENCES public.profiles(user_id),
  title text NOT NULL, slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  content text NOT NULL DEFAULT '', cover_url text,
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','publicado')),
  visibility text NOT NULL DEFAULT 'publico' CHECK (visibility IN ('publico','exclusivo')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_date CHECK (status = 'borrador' OR published_at IS NOT NULL)
);
CREATE TABLE public.post_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  url text NOT NULL, alt text NOT NULL DEFAULT '', display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL DEFAULT '',
  venue text, starts_at timestamptz NOT NULL, ends_at timestamptz,
  url text, active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_dates CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX products_public_order ON public.products(display_order,id) WHERE active;
CREATE INDEX product_variants_product ON public.product_variants(product_id,display_order);
CREATE INDEX product_images_product ON public.product_images(product_id,display_order);
CREATE INDEX posts_public ON public.posts(published_at DESC) WHERE status='publicado' AND visibility='publico';
CREATE INDEX posts_author ON public.posts(author_id,updated_at DESC);
CREATE INDEX post_images_post ON public.post_images(post_id,display_order);
CREATE INDEX events_public ON public.events(starts_at) WHERE active;

CREATE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['members','group_socials','products','product_variants','product_images','profiles','posts','post_images','events'] LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',tab);
  END LOOP;
END $$;

-- SECURITY DEFINER evita recursión al consultar profiles desde sus propias políticas.
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = (SELECT auth.uid()) AND role = 'admin')
$$;
CREATE FUNCTION public.can_write_post(owner_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = (SELECT auth.uid())
    AND role = 'integrante' AND user_id = owner_id)
$$;
REVOKE ALL ON FUNCTION public.is_admin(), public.can_write_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(), public.can_write_post(uuid) TO authenticated;

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['members','group_socials','products','product_variants','product_images','profiles','posts','post_images','events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.members,public.group_socials,public.products,public.product_variants,public.product_images,public.posts,public.post_images,public.events TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.members,public.group_socials,public.products,public.product_variants,public.product_images,public.profiles,public.posts,public.post_images,public.events TO authenticated;

CREATE POLICY members_read ON public.members FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY members_admin ON public.members FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY socials_read ON public.group_socials FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY socials_admin ON public.group_socials FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY products_read ON public.products FOR SELECT TO anon,authenticated USING (active);
CREATE POLICY products_admin ON public.products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY variants_read ON public.product_variants FOR SELECT TO anon,authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.active));
CREATE POLICY variants_admin ON public.product_variants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_images_read ON public.product_images FOR SELECT TO anon,authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.active));
CREATE POLICY product_images_admin ON public.product_images FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY profile_self_admin ON public.profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());
CREATE POLICY profile_admin_write ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY posts_public ON public.posts FOR SELECT TO anon,authenticated
  USING (status='publicado' AND visibility='publico' AND published_at <= now());
CREATE POLICY posts_private ON public.posts FOR SELECT TO authenticated USING (public.can_write_post(author_id));
CREATE POLICY posts_insert ON public.posts FOR INSERT TO authenticated WITH CHECK (public.can_write_post(author_id));
CREATE POLICY posts_update ON public.posts FOR UPDATE TO authenticated USING (public.can_write_post(author_id)) WITH CHECK (public.can_write_post(author_id));
CREATE POLICY posts_delete ON public.posts FOR DELETE TO authenticated USING (public.can_write_post(author_id));
CREATE POLICY post_images_read ON public.post_images FOR SELECT TO anon,authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND p.status='publicado' AND p.visibility='publico' AND p.published_at<=now()));
CREATE POLICY post_images_private ON public.post_images FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND public.can_write_post(p.author_id)));
CREATE POLICY post_images_insert ON public.post_images FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND public.can_write_post(p.author_id)));
CREATE POLICY post_images_update ON public.post_images FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND public.can_write_post(p.author_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND public.can_write_post(p.author_id)));
CREATE POLICY post_images_delete ON public.post_images FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id=post_id AND public.can_write_post(p.author_id)));
CREATE POLICY events_read ON public.events FOR SELECT TO anon,authenticated USING (active);
CREATE POLICY events_admin ON public.events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
