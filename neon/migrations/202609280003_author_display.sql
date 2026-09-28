-- La autora se deriva de profiles; el cliente no puede falsificar este campo.
ALTER TABLE public.posts ADD COLUMN author_name text NOT NULL DEFAULT 'Equipo Gimae';
CREATE FUNCTION public.set_post_author_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  SELECT COALESCE(m.name,'Equipo Gimae') INTO NEW.author_name
  FROM public.profiles p LEFT JOIN public.members m ON m.id=p.member_id
  WHERE p.user_id=NEW.author_id;
  RETURN NEW;
END $$;
CREATE TRIGGER set_post_author_name BEFORE INSERT OR UPDATE OF author_id ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.set_post_author_name();
