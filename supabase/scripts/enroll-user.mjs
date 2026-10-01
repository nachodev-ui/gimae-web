// Invita o vincula una cuenta Auth autorizada para el Backstage.
// Solo ejecutable con service_role fuera del navegador.
import {createClient} from '@supabase/supabase-js';

const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,TEAM_EMAIL,TEAM_USER_ID}=process.env;
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!TEAM_EMAIL)
  throw new Error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o TEAM_EMAIL');

const client=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let userId=TEAM_USER_ID;

if(!userId){
  const {data,error}=await client.auth.admin.inviteUserByEmail(TEAM_EMAIL);
  if(error)throw error;
  userId=data.user.id;
}

// Desde la migración 0010, la existencia de esta fila es el permiso administrativo.
const {error}=await client.from('profiles').upsert({user_id:userId,email:TEAM_EMAIL},{onConflict:'user_id'});
if(error)throw error;

console.log(`Acceso administrativo asignado a ${TEAM_EMAIL} (${userId}).`);
