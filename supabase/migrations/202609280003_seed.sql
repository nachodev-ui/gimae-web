-- Generado desde dist/content.js: node supabase/scripts/build-seed.mjs

-- Stock desconocido: se inicia en 0 con stock_confirmed=false; no significa agotado.

BEGIN;

INSERT INTO public.members(id,name,color,accent,color_label,photo_url,handle,socials,display_order)
VALUES ('01','Suki','pink','#e84694','Rosado','images/suki.webp','@bunnidoru','{"instagram":"https://www.instagram.com/bunnidoru/"}','0'),
  ('02','Usi','red','#df4d62','Rojo','images/usi.webp','@usi__chan','{"instagram":"https://www.instagram.com/usi__chan/"}','1'),
  ('03','Vewe','yellow','#c99a18','Amarillo','images/vewe.webp','@novvewe','{"instagram":"https://www.instagram.com/novvewe/"}','2'),
  ('04','Vali','purple','#8f62bf','Morado','images/vali.webp','@vali_chuu','{"instagram":"https://www.instagram.com/vali_chuu/"}','3')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.group_socials(platform,url)
VALUES ('instagram','https://www.instagram.com/gimae_official'),
  ('tiktok','https://www.tiktok.com/@gimae_official'),
  ('spotify','https://open.spotify.com/artist/3fCnhznvLe2OnwRa3Rif4g')
ON CONFLICT(platform) DO NOTHING;

INSERT INTO public.products(id,name,description,note,color,price_clp,active,display_order,variant_label,variant_source)
VALUES ('01','Poleras estampadas','Poleras estampadas de Gimae disponibles por integrante y color. La imagen corresponde al diseño de referencia del producto; el estampado se presenta sin recortes ni modificaciones.','Tu color, tu member.','pink','15000','true','0','Color / integrante','members'),
  ('02','Lightstick','Lightstick oficial de Gimae con el logotipo multicolor. La fotografía de producto se muestra completa para conservar proporciones y detalles.','Lleva tu brillo al escenario.','purple','8000','true','1',NULL,NULL),
  ('03','Llaveros','Llaveros de las integrantes de Gimae con ilustración, lazo y cuentas en el color de cada member.','Un pequeño amuleto idol.','yellow','3000','true','2','Integrante','members'),
  ('04','Chekis','Chekis impresas en formato instantáneo. Puedes elegir la versión individual o grupal; el detalle mostrará la imagen correspondiente a la variante seleccionada.','Un recuerdo en formato instantáneo.','pink','4500','true','3','Tipo',NULL),
  ('05','Postales','Postales de Gimae. La imagen de producto todavía no está publicada en el catálogo; se mantendrá la tarjeta funcional hasta contar con el asset definitivo.','Un pedacito de nuestro universo.','red','2000','true','4',NULL,NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.product_variants(id,product_id,label,member_id,price_clp,image_url,image_alt,display_order)
VALUES ('01-01','01','Suki · Rosado','01','15000',NULL,'','0'),
  ('01-02','01','Usi · Rojo','02','15000',NULL,'','1'),
  ('01-03','01','Vewe · Amarillo','03','15000',NULL,'','2'),
  ('01-04','01','Vali · Morado','04','15000',NULL,'','3'),
  ('03-01','03','Suki · Rosado','01','3000',NULL,'','0'),
  ('03-02','03','Usi · Rojo','02','3000',NULL,'','1'),
  ('03-03','03','Vewe · Amarillo','03','3000',NULL,'','2'),
  ('03-04','03','Vali · Morado','04','3000',NULL,'','3'),
  ('individual-01','04','Individual · Suki','01','4500','images/merch/cheki-individual.png','Cheki individual de Gimae','0'),
  ('individual-02','04','Individual · Usi','02','4500','images/merch/cheki-individual.png','Cheki individual de Gimae','1'),
  ('individual-03','04','Individual · Vewe','03','4500','images/merch/cheki-individual.png','Cheki individual de Gimae','2'),
  ('individual-04','04','Individual · Vali','04','4500','images/merch/cheki-individual.png','Cheki individual de Gimae','3'),
  ('group','04','Grupal',NULL,'5000','images/merch/cheki-grupal.png','Cheki grupal de las integrantes de Gimae','4') ON CONFLICT(id) DO NOTHING;

INSERT INTO public.product_images(product_id,url,alt,display_order)
SELECT seed.product_id,seed.url,seed.alt,seed.display_order::integer FROM (VALUES ('01','images/merch/poleras.png','Vista de las cuatro poleras estampadas de Gimae','0'),
  ('02','images/merch/lightstick.png','Vista completa del lightstick de Gimae','0'),
  ('03','images/merch/llaveros.png','Vista conjunta de los cuatro llaveros de Gimae','0'),
  ('04','images/merch/cheki-individual.png','Cheki individual de Gimae','0'),
  ('04','images/merch/cheki-grupal.png','Cheki grupal de las integrantes de Gimae','1')) AS seed(product_id,url,alt,display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.product_id=seed.product_id AND pi.url=seed.url);

COMMIT;
