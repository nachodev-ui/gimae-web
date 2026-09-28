// Invita o vincula una cuenta Auth; solo ejecutable con service_role fuera del navegador.
import {createClient} from '@supabase/supabase-js';
const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,TEAM_EMAIL,TEAM_ROLE,MEMBER_ID,TEAM_USER_ID}=process.env;
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!TEAM_EMAIL||!['admin','integrante'].includes(TEAM_ROLE)||TEAM_ROLE==='integrante'&&!MEMBER_ID)
  throw new Error('Faltan URL, service role, TEAM_EMAIL, TEAM_ROLE o MEMBER_ID');
const client=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let userId=TEAM_USER_ID;
if(!userId){
  const {data,error}=await client.auth.admin.inviteUserByEmail(TEAM_EMAIL);
  if(error)throw error;userId=data.user.id;
}
const {error}=await client.from('profiles').upsert({user_id:userId,email:TEAM_EMAIL,role:TEAM_ROLE,
  member_id:TEAM_ROLE==='integrante'?MEMBER_ID:null},{onConflict:'user_id'});
if(error)throw error;
console.log(`Perfil ${TEAM_ROLE} asignado a ${TEAM_EMAIL} (${userId}).`);
