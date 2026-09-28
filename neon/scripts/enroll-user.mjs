// Tras crear la cuenta por Neon Auth, asigna el rol usando conexión directa.
// ADMIN_USER_ID / TEAM_EMAIL / TEAM_ROLE / MEMBER_ID se pasan por entorno.
import pg from 'pg';
const {DATABASE_URL_UNPOOLED,TEAM_USER_ID,TEAM_EMAIL,TEAM_ROLE,MEMBER_ID}=process.env;
if(!DATABASE_URL_UNPOOLED||!TEAM_USER_ID||!TEAM_EMAIL||!['admin','integrante'].includes(TEAM_ROLE))
  throw new Error('Requiere DATABASE_URL_UNPOOLED, TEAM_USER_ID, TEAM_EMAIL y TEAM_ROLE=admin|integrante');
if(TEAM_ROLE==='integrante'&&!MEMBER_ID)throw new Error('Falta MEMBER_ID para integrante');
const client=new pg.Client({connectionString:DATABASE_URL_UNPOOLED});await client.connect();
try{await client.query(`INSERT INTO public.profiles(user_id,email,role,member_id) VALUES($1,$2,$3,$4)
  ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,role=EXCLUDED.role,member_id=EXCLUDED.member_id`,
  [TEAM_USER_ID,TEAM_EMAIL,TEAM_ROLE,TEAM_ROLE==='integrante'?MEMBER_ID:null]);
  console.log('Rol asignado a',TEAM_EMAIL);
}finally{await client.end()}
