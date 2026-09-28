// Operación local de una sola vez, sin credenciales en Git ni en el navegador.
// DATABASE_URL_UNPOOLED y AWS_* corresponden a la misma rama Neon.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';

const required=['AWS_ENDPOINT_URL_S3','AWS_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','DATABASE_URL_UNPOOLED'];
for(const key of required) if(!process.env[key]) throw new Error(`Falta ${key}`);
const root=fileURLToPath(new URL('../../dist/images/',import.meta.url));
const base=process.env.AWS_ENDPOINT_URL_S3.replace(/\/$/,'');
const bucket='gimae-products';
const s3=new S3Client({endpoint:base,region:process.env.AWS_REGION,forcePathStyle:true,
  credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
async function* walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,e.name);if(e.isDirectory()) yield* walk(path);else if(e.isFile()) yield path;
}}
let count=0;
for await (const path of walk(root)) {
  const key=`images/${relative(root,path).split('\\').join('/')}`;
  const contentType=mime[extname(path).toLowerCase()];
  if(!contentType) continue;
  await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:await readFile(path),ContentType:contentType,CacheControl:'public,max-age=31536000,immutable'}));
  count++;
}
const sql=`UPDATE public.members SET photo_url=$1||photo_url WHERE photo_url LIKE 'images/%';
UPDATE public.product_images SET url=$1||url WHERE url LIKE 'images/%';
UPDATE public.product_variants SET image_url=$1||image_url WHERE image_url LIKE 'images/%';`;
const client=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED});
await client.connect();
try{await client.query('BEGIN');for(const stmt of sql.split(';').filter(Boolean)) await client.query(stmt,[`${base}/${bucket}/`]);await client.query('COMMIT')}
catch(error){await client.query('ROLLBACK');throw error}finally{await client.end()}
console.log(`Subidas ${count} imágenes; URLs de integrantes, variantes y productos actualizadas.`);
