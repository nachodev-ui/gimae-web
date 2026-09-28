import { createRemoteJWKSet, jwtVerify } from 'jose';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
pool.on('error', error => console.error('Idle database connection:', error));
const storage = new S3Client({ endpoint: process.env.AWS_ENDPOINT_URL_S3,
  region: process.env.AWS_REGION, forcePathStyle: true,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
const issuer = new URL(process.env.NEON_AUTH_BASE_URL).origin;
const origins = new Set(['https://nachodev-ui.github.io','http://localhost:8000']);
const allowed = new Map([['image/png','png'],['image/jpeg','jpg'],['image/webp','webp']]);
function headers(request) {
  const origin=request.headers.get('origin');
  return origins.has(origin) ? {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'} : {};
}
function reply(request,data,status=200) {return Response.json(data,{status,headers:headers(request)});}
async function identity(request) {
  const bearer=request.headers.get('authorization');
  if(!bearer?.startsWith('Bearer ')) return null;
  try {const {payload}=await jwtVerify(bearer.slice(7),jwks,{issuer,algorithms:['EdDSA']});return payload.sub||null}
  catch{return null}
}
export default {
  async fetch(request) {
    const url=new URL(request.url), cors=headers(request);
    if(request.headers.has('origin')&&!origins.has(request.headers.get('origin'))) return reply(request,{error:'Origen no autorizado'},403);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    const userId=await identity(request);
    if(request.method==='GET') {
      const key=url.searchParams.get('key');
      if(!key||!/^posts\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key)) return reply(request,{error:'Imagen inválida'},400);
      const reference=`media:${key}`;
      const result=await pool.query(`SELECT p.author_id,p.status,p.visibility,p.published_at
        FROM public.posts p WHERE (p.cover_url=$1 OR EXISTS(SELECT 1 FROM public.post_images pi WHERE pi.post_id=p.id AND pi.url=$1)) LIMIT 1`,[reference]);
      const post=result.rows[0];
      if(!post) return reply(request,{error:'No existe'},404);
      const isPublic=post.status==='publicado'&&post.visibility==='publico'&&new Date(post.published_at)<=new Date();
      if(!isPublic) {
        if(!userId) return reply(request,{error:'No autorizado'},401);
        const profile=await pool.query('SELECT role FROM public.profiles WHERE user_id=$1',[userId]);
        if(profile.rows[0]?.role!=='admin'&&post.author_id!==userId) return reply(request,{error:'No autorizado'},403);
      }
      try {const object=await storage.send(new GetObjectCommand({Bucket:'gimae-blog',Key:key}));
        return new Response(await object.Body.transformToByteArray(),{headers:{...cors,'Content-Type':object.ContentType||'application/octet-stream','Cache-Control':isPublic?'public,max-age=300':'private,no-store'}});
      } catch{return reply(request,{error:'Imagen no disponible'},404)}
    }
    if(request.method!=='POST') return reply(request,{error:'Método no permitido'},405);
    if(!userId) return reply(request,{error:'Inicia sesión'},401);
    const profile=(await pool.query('SELECT role FROM public.profiles WHERE user_id=$1',[userId])).rows[0];
    if(!profile) return reply(request,{error:'Sin permisos'},403);
    const form=await request.formData(), kind=String(form.get('kind')||''), id=String(form.get('id')||''), file=form.get('file');
    if(!(file instanceof File)||!allowed.has(file.type)||file.size===0||file.size>8*1024*1024)
      return reply(request,{error:'Usa PNG, JPG o WebP de hasta 8 MB'},400);
    if(kind==='product') {
      if(profile.role!=='admin'||!(await pool.query('SELECT 1 FROM public.products WHERE id=$1',[id])).rowCount)
        return reply(request,{error:'Sin permisos para el producto'},403);
    } else if(kind==='post') {
      const post=(await pool.query('SELECT author_id FROM public.posts WHERE id=$1',[id])).rows[0];
      if(!post||(profile.role!=='admin'&&post.author_id!==userId)) return reply(request,{error:'Sin permisos para el post'},403);
    } else return reply(request,{error:'Destino inválido'},400);
    const key=kind==='post'?`posts/${id}/${crypto.randomUUID()}.${allowed.get(file.type)}`:`products/${id}/${crypto.randomUUID()}.${allowed.get(file.type)}`;
    const bucket=kind==='post'?'gimae-blog':'gimae-products';
    await storage.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:new Uint8Array(await file.arrayBuffer()),ContentType:file.type}));
    const value=kind==='post'?`media:${key}`:`${process.env.AWS_ENDPOINT_URL_S3.replace(/\/$/,'')}/${bucket}/${key}`;
    return reply(request,{url:value});
  }
};
