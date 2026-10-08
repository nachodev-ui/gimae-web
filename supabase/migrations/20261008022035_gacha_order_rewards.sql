-- Purchase bonuses are server-owned. No browser can read orders or grant credits.
CREATE TABLE public.gacha_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 minimum_clp integer NOT NULL DEFAULT 2000 CHECK(minimum_clp >= 2000),
 pulls_per_order integer NOT NULL DEFAULT 3 CHECK(pulls_per_order BETWEEN 2 AND 3),
 allow_test_orders boolean NOT NULL DEFAULT false,
 rarities jsonb NOT NULL DEFAULT '{"common":{"label":"Común","weight":70},"rare":{"label":"Rara","weight":25},"ssr":{"label":"SSR","weight":5}}'
);
CREATE FUNCTION private.validate_gacha_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE tier text; total numeric:=0;
BEGIN
 IF jsonb_typeof(NEW.rarities) IS DISTINCT FROM 'object' OR
    (SELECT count(*) FROM jsonb_object_keys(NEW.rarities))<>3 THEN
   RAISE EXCEPTION 'Configura las tres categorías.';
 END IF;
 FOREACH tier IN ARRAY ARRAY['common','rare','ssr'] LOOP
   IF NOT (NEW.rarities ? tier) OR jsonb_typeof(NEW.rarities->tier->'label') IS DISTINCT FROM 'string' OR length(trim(NEW.rarities->tier->>'label')) NOT BETWEEN 1 AND 24
      OR jsonb_typeof(NEW.rarities->tier->'weight') IS DISTINCT FROM 'number' THEN
     RAISE EXCEPTION 'Nombre o probabilidad inválidos.';
   END IF;
   IF (NEW.rarities->tier->>'weight')::numeric NOT BETWEEN 0 AND 100 THEN
     RAISE EXCEPTION 'Usa probabilidades de 0 a 100.';
   END IF;
   total:=total+(NEW.rarities->tier->>'weight')::numeric;
 END LOOP;
 IF total<>100 THEN RAISE EXCEPTION 'Las probabilidades deben sumar 100%%.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_gacha_settings() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_gacha_settings BEFORE INSERT OR UPDATE ON public.gacha_settings
 FOR EACH ROW EXECUTE FUNCTION private.validate_gacha_settings();
INSERT INTO public.gacha_settings(id) VALUES(true);
CREATE TABLE public.gacha_cards (
 serial text PRIMARY KEY DEFAULT gen_random_uuid()::text CHECK(length(serial) BETWEEN 1 AND 64),
 integrante text NOT NULL CHECK(length(trim(integrante)) BETWEEN 1 AND 60),
 rareza text NOT NULL CHECK(rareza IN ('common','rare','ssr')),
 imagen text NOT NULL CHECK(imagen ~ '^https://[^ ]+$' OR imagen ~ '^images/[a-zA-Z0-9_./-]+$'),
 frase text NOT NULL DEFAULT '' CHECK(length(frase)<=160),
 crop text NOT NULL DEFAULT '50% 25%' CHECK(crop ~ '^[0-9]{1,3}% [0-9]{1,3}%$'),
 zoom numeric NOT NULL DEFAULT 1 CHECK(zoom BETWEEN 1 AND 2),
 active boolean NOT NULL DEFAULT true,
 display_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.gacha_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gacha_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gacha_settings,public.gacha_cards FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.gacha_settings,public.gacha_cards TO anon,authenticated;
GRANT UPDATE ON public.gacha_settings TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.gacha_cards TO authenticated;
GRANT ALL ON public.gacha_settings,public.gacha_cards TO service_role;
CREATE POLICY gacha_settings_public ON public.gacha_settings FOR SELECT TO anon USING(true);
CREATE POLICY gacha_settings_admin ON public.gacha_settings FOR ALL TO authenticated
 USING((SELECT private.is_admin())) WITH CHECK((SELECT private.is_admin()));
CREATE POLICY gacha_cards_public ON public.gacha_cards FOR SELECT TO anon USING(active);
CREATE POLICY gacha_cards_admin ON public.gacha_cards FOR ALL TO authenticated
 USING((SELECT private.is_admin())) WITH CHECK((SELECT private.is_admin()));

CREATE TABLE private.gacha_redemptions (
 order_id uuid PRIMARY KEY REFERENCES public.merch_orders(id) ON DELETE RESTRICT,
 token_hash text NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 granted integer NOT NULL CHECK(granted BETWEEN 2 AND 3),
 remaining integer NOT NULL CHECK(remaining>=0 AND remaining<=granted),
 redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gacha_redemptions_token ON private.gacha_redemptions(token_hash);
CREATE TABLE private.gacha_draws (
 order_id uuid NOT NULL REFERENCES private.gacha_redemptions(order_id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 card jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,request_id)
);
ALTER TABLE private.gacha_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.gacha_draws ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.gacha_redemptions,private.gacha_draws FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.gacha_redemptions,private.gacha_draws TO service_role;

-- Only the Edge Function may invoke this transaction. UNIQUE(order_id), row locks,
-- immutable draw snapshots and request IDs prevent double redemption and retry losses.
CREATE FUNCTION public.gacha_action(p_action text,p_order uuid,p_hash text,p_request uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cfg public.gacha_settings%ROWTYPE; purchase public.merch_orders%ROWTYPE;
 voucher private.gacha_redemptions%ROWTYPE; chosen public.gacha_cards%ROWTYPE;
 tier text; entry record; roll numeric; weight numeric; result jsonb; special boolean;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Sesión inválida.'; END IF;
 SELECT * INTO cfg FROM public.gacha_settings WHERE id=true FOR SHARE;
 IF p_action='state' THEN
   RETURN jsonb_build_object('vouchers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'orderCode',r.order_id,'remaining',r.remaining,'granted',r.granted,'cards',COALESCE(
      (SELECT jsonb_agg(d.card ORDER BY d.created_at,d.request_id) FROM private.gacha_draws d WHERE d.order_id=r.order_id),'[]'::jsonb)))
    FROM private.gacha_redemptions r WHERE r.token_hash=p_hash),'[]'::jsonb));
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('redeem','draw') OR p_order IS NULL THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 SELECT * INTO purchase FROM public.merch_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR purchase.status<>'paid' OR purchase.paid_at IS NULL
  OR (p_action='redeem' AND purchase.subtotal_clp<cfg.minimum_clp AND
    NOT EXISTS(SELECT 1 FROM private.gacha_redemptions WHERE order_id=p_order))
  OR (purchase.order_environment='test' AND NOT cfg.allow_test_orders) THEN
   RAISE EXCEPTION 'El pedido no es válido para canjear. Debe estar pagado y cumplir el mínimo.';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(cfg.rarities) e WHERE (e.value->>'weight')::numeric>0
   AND NOT EXISTS(SELECT 1 FROM public.gacha_cards c WHERE c.active AND c.rareza=e.key)) THEN
   RAISE EXCEPTION 'El Gacha está en mantenimiento. Intenta más tarde.';
 END IF;
 IF p_action='redeem' THEN
   INSERT INTO private.gacha_redemptions(order_id,token_hash,granted,remaining)
   VALUES(p_order,p_hash,cfg.pulls_per_order,cfg.pulls_per_order) ON CONFLICT(order_id) DO NOTHING;
 END IF;
 SELECT * INTO voucher FROM private.gacha_redemptions WHERE order_id=p_order FOR UPDATE;
 IF NOT FOUND OR voucher.token_hash<>p_hash THEN RAISE EXCEPTION 'Este pedido ya fue canjeado o no pertenece a esta sesión.'; END IF;
 IF p_action='redeem' THEN RETURN jsonb_build_object('remaining',voucher.remaining,'granted',voucher.granted); END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Falta el identificador de tirada.'; END IF;
 SELECT card INTO result FROM private.gacha_draws WHERE order_id=p_order AND request_id=p_request;
 IF FOUND THEN RETURN jsonb_build_object('card',result,'remaining',voucher.remaining); END IF;
 IF voucher.remaining<=0 THEN RAISE EXCEPTION 'Este pedido ya utilizó todas sus tiradas.'; END IF;
 -- Cryptographic random bytes; category probabilities apply to the category,
 -- and each active card within it has equal probability.
 roll:=('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint::numeric/4294967296*100;
 FOR entry IN SELECT key,value FROM jsonb_each(cfg.rarities) ORDER BY key LOOP
   weight:=(entry.value->>'weight')::numeric;
   roll:=roll-weight;
   IF roll<0 THEN tier:=entry.key; EXIT; END IF;
 END LOOP;
 SELECT * INTO chosen FROM public.gacha_cards WHERE active AND rareza=tier
 ORDER BY extensions.gen_random_bytes(16) LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No hay cartas disponibles.'; END IF;
 special:=(cfg.rarities->tier->>'weight')::numeric=(SELECT min((value->>'weight')::numeric)
   FROM jsonb_each(cfg.rarities) WHERE (value->>'weight')::numeric>0);
 result:=to_jsonb(chosen)||jsonb_build_object('rarityLabel',cfg.rarities->tier->>'label','special',special);
 INSERT INTO private.gacha_draws(order_id,request_id,card) VALUES(p_order,p_request,result);
 UPDATE private.gacha_redemptions SET remaining=remaining-1 WHERE order_id=p_order;
 RETURN jsonb_build_object('card',result,'remaining',voucher.remaining-1);
END $$;
REVOKE ALL ON FUNCTION public.gacha_action(text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gacha_action(text,uuid,text,uuid) TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('gimae-gacha','gimae-gacha',true,8388608,ARRAY['image/jpeg','image/png','image/webp']);
CREATE POLICY gacha_images_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='gimae-gacha');
CREATE POLICY gacha_images_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='gimae-gacha' AND (SELECT private.is_admin()));
CREATE POLICY gacha_images_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='gimae-gacha' AND (SELECT private.is_admin()))
 WITH CHECK(bucket_id='gimae-gacha' AND (SELECT private.is_admin()));
CREATE POLICY gacha_images_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='gimae-gacha' AND (SELECT private.is_admin()));

INSERT INTO public.gacha_cards(serial,integrante,rareza,imagen,frase,crop,zoom,display_order) VALUES
('GIM-001','Suki','common','images/suki.webp','Una sonrisa para guardar.','50% 28%',1,0),
('GIM-002','Usi','common','images/usi.webp','Tu energía llegó al escenario.','50% 24%',1,1),
('GIM-003','Vewe','common','images/vewe.webp','Un rayito de luz para ti.','50% 30%',1,2),
('GIM-004','Vali','common','images/vali.webp','Que este recuerdo siga brillando.','50% 26%',1,3),
('GIM-005','Suki','rare','images/suki.webp','Nuestro momento más rosado.','47% 20%',1.1,4),
('GIM-006','Usi','rare','images/usi.webp','Rojo pasión, corazón idol.','53% 18%',1.11,5),
('GIM-007','Vewe','rare','images/vewe.webp','Atrapa este destello amarillo.','54% 24%',1.1,6),
('GIM-008','Vali','rare','images/vali.webp','Una melodía violeta para ti.','46% 22%',1.12,7),
('GIM-009','Suki','ssr','images/suki.webp','Tu cariño enciende nuestro cielo.','50% 16%',1.2,8),
('GIM-010','Usi','ssr','images/usi.webp','Este brillo nació para encontrarte.','50% 15%',1.2,9),
('GIM-011','Vewe','ssr','images/vewe.webp','Juntas hacemos magia de verdad.','52% 18%',1.21,10),
('GIM-012','Vali','ssr','images/vali.webp','Una estrella violeta solo para ti.','48% 17%',1.2,11);

-- Reordering is atomic and does not change draw probabilities.
CREATE FUNCTION public.reorder_gacha_cards(p_serials text[]) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT (SELECT private.is_admin()) THEN RAISE EXCEPTION 'Acceso del equipo requerido.'; END IF;
 IF cardinality(p_serials)<>(SELECT count(*) FROM public.gacha_cards) OR
    cardinality(p_serials)<>(SELECT count(DISTINCT s) FROM unnest(p_serials) s) OR
    EXISTS(SELECT 1 FROM unnest(p_serials) s WHERE NOT EXISTS(SELECT 1 FROM public.gacha_cards c WHERE c.serial=s)) THEN
   RAISE EXCEPTION 'El catálogo cambió. Recarga antes de ordenar.';
 END IF;
 UPDATE public.gacha_cards c SET display_order=t.position-1
 FROM unnest(p_serials) WITH ORDINALITY t(serial,position) WHERE c.serial=t.serial;
END $$;
REVOKE ALL ON FUNCTION public.reorder_gacha_cards(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_gacha_cards(text[]) TO authenticated;
