// Una sola vez, desde un entorno privado. Nunca copiar la secret key a dist/.
import {readdir,readFile} from 'node:fs/promises';
import {join,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY}=process.env;
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
const client=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const root=fileURLToPath(new URL('../../dist/images/',import.meta.url));
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
async function* walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,e.name);if(e.isDirectory())yield* walk(path);else if(e.isFile())yield path;
}}
let count=0;
for await(const path of walk(root)){
  const type=mime[extname(path).toLowerCase()];if(!type)continue;
  const key=`images/${relative(root,path).split('\\').join('/')}`;
  const {error}=await client.storage.from('gimae-products').upload(key,await readFile(path),{contentType:type,upsert:true});
  if(error)throw new Error(`No se pudo subir ${key}: ${error.message}`);
  count++;
}
const base=`${SUPABASE_URL.replace(/\/$/,'')}/storage/v1/object/public/gimae-products/`;
for(const [table,column,key] of [['members','photo_url','id'],['product_images','url','id'],['product_variants','image_url','id']]){
  const {data,error}=await client.from(table).select(`${key},${column}`).like(column,'images/%');if(error)throw error;
  for(const row of data){const result=await client.from(table).update({[column]:base+row[column]}).eq(key,row[key]);if(result.error)throw result.error;}
}
console.log(`Subidas ${count} imágenes y actualizadas las rutas de integrantes y merch.`);
