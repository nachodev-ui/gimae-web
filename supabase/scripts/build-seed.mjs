import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../dist/content.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { timeout: 1000 });
const { members, merch, socials } = sandbox.window.GIMAE;
const q = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const values = rows => rows.map(row => `(${row.map(q).join(',')})`).join(',\n  ');
const output = [
  '-- Generado desde dist/content.js: node supabase/scripts/build-seed.mjs',
  '-- Stock desconocido: se inicia en 0 con stock_confirmed=false; no significa agotado.',
  'BEGIN;',
  `INSERT INTO public.members(id,name,color,accent,color_label,photo_url,handle,socials,display_order)
VALUES ${values(members.map((m,i)=>[m.id,m.name,m.color,m.accent,m.colorLabel,m.photo,m.handle,JSON.stringify(m.socials),i]))}
ON CONFLICT(id) DO NOTHING;`,
  `INSERT INTO public.group_socials(platform,url)
VALUES ${values(Object.entries(socials).map(([key,url])=>[key,url]))}
ON CONFLICT(platform) DO NOTHING;`,
  `INSERT INTO public.products(id,name,description,note,color,price_clp,active,display_order,variant_label,variant_source)
VALUES ${values(merch.map((p,i)=>[p.id,p.name,p.description,p.note,p.color,p.price??p.prices?.[0]?.value,p.active,i,p.variantLabel??null,p.variantSource??null]))}
ON CONFLICT(id) DO NOTHING;`
];
const variants=[];
for (const product of merch) {
  if(product.variantSource==='members') members.forEach((m,i)=>variants.push([
    `${product.id}-${m.id}`,product.id,`${m.name} · ${m.colorLabel}`,m.id,product.price,null,'',i
  ]));
  if(product.id==='04') {
    const individual=product.prices.find(p=>p.id==='individual');
    const group=product.prices.find(p=>p.id==='group');
    members.forEach((m,i)=>variants.push([`individual-${m.id}`,product.id,`Individual · ${m.name}`,m.id,individual.value,individual.image,individual.imageAlt,i]));
    variants.push(['group',product.id,'Grupal',null,group.value,group.image,group.imageAlt,members.length]);
  }
}
if(variants.length) output.push(`INSERT INTO public.product_variants(id,product_id,label,member_id,price_clp,image_url,image_alt,display_order)
VALUES ${values(variants)} ON CONFLICT(id) DO NOTHING;`);
const images=merch.flatMap(p=>(p.gallery||[]).map((img,i)=>[p.id,img.src,img.alt,i]));
if(images.length) output.push(`INSERT INTO public.product_images(product_id,url,alt,display_order)
SELECT seed.product_id,seed.url,seed.alt,seed.display_order::integer FROM (VALUES ${values(images)}) AS seed(product_id,url,alt,display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.product_id=seed.product_id AND pi.url=seed.url);`);
output.push('COMMIT;');
const target=new URL('../migrations/202609280003_seed.sql',import.meta.url);
writeFileSync(target,output.join('\n\n')+'\n');
console.log(`Seed: ${members.length} integrantes, ${merch.length} productos, ${variants.length} variantes, ${images.length} imágenes de producto; 0 posts, 0 eventos.`);
