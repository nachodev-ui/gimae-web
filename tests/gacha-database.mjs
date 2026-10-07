// Runs the actual migration and permission/transaction tests in an isolated WASM
// Postgres. Install @electric-sql/pglite@0.5.8 in a temporary directory and set
// GACHA_TEST_MODULES to that directory's node_modules; never connects to Supabase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const prefix=process.env.GACHA_TEST_MODULES;
const {PGlite}=require(prefix?`${prefix}/@electric-sql/pglite`:'@electric-sql/pglite');
const {pgcrypto}=require(prefix?`${prefix}/@electric-sql/pglite/dist/contrib/pgcrypto.cjs`:'@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`
 CREATE SCHEMA private; CREATE SCHEMA extensions; CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 GRANT USAGE ON SCHEMA public,private,storage,extensions TO anon,authenticated,service_role;
 CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE FUNCTION private.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('test.admin',true)='yes'$$;
 GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
 CREATE TABLE public.merch_orders(id uuid PRIMARY KEY, status text,paid_at timestamptz,subtotal_clp integer,order_environment text);
 GRANT ALL ON public.merch_orders TO service_role;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261007172438_gacha_order_rewards.sql',import.meta.url),'utf8'));
const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
const expectError=async(sql,args=[])=>{let threw=false;try{await query(sql,args)}catch{threw=true}assert.ok(threw,`Expected rejection: ${sql}`);};
const hash='1'.repeat(64),other='2'.repeat(64);
const order=await query(`INSERT INTO public.merch_orders VALUES(gen_random_uuid(),'paid',now(),2000,'live') RETURNING id`);
const id=order[0].id;
const action=async(a,id,token=hash,req=null)=> (await query('SELECT public.gacha_action($1,$2,$3,$4) AS result',[a,id,token,req]))[0].result;
await db.exec('SET ROLE anon');
assert.equal((await query('SELECT * FROM public.gacha_cards')).length,12);
await expectError(`UPDATE public.gacha_settings SET pulls_per_order=2`);
await expectError(`INSERT INTO public.gacha_cards(integrante,rareza,imagen) VALUES('X','common','images/x.webp')`);
await expectError('SELECT * FROM private.gacha_redemptions');
await expectError('SELECT public.gacha_action($1,$2,$3,null)',['redeem',id,hash]);
await expectError(`INSERT INTO storage.objects(bucket_id,name) VALUES('gimae-gacha','x.webp')`);
await db.exec("RESET ROLE; SET ROLE authenticated; SET test.admin='no'");
assert.equal((await query('SELECT * FROM public.gacha_cards')).length,0);
await expectError(`INSERT INTO public.gacha_cards(integrante,rareza,imagen) VALUES('X','common','images/x.webp')`);
assert.equal((await query('UPDATE public.gacha_settings SET pulls_per_order=2 RETURNING id')).length,0);
await expectError('SELECT * FROM private.gacha_draws');
await db.exec("SET test.admin='yes'");
assert.equal((await query('SELECT * FROM public.gacha_cards')).length,12);
await query(`UPDATE public.gacha_settings SET pulls_per_order=2`);
await expectError(`UPDATE public.gacha_settings SET rarities='{"common":{"label":"C","weight":70},"rare":{"label":"R","weight":25},"ssr":{"label":"S","weight":10}}'`);
await expectError(`UPDATE public.gacha_settings SET rarities='{"common":{"label":null,"weight":70},"rare":{"label":"R","weight":25},"ssr":{"label":"S","weight":5}}'`);
await query(`INSERT INTO storage.objects(bucket_id,name) VALUES('gimae-gacha','x.webp')`);
await query('SELECT public.reorder_gacha_cards($1)',[(await query('SELECT serial FROM public.gacha_cards ORDER BY serial DESC')).map(c=>c.serial)]);
assert.equal((await query('SELECT serial FROM public.gacha_cards ORDER BY display_order LIMIT 1'))[0].serial,'GIM-012');
await query('UPDATE public.gacha_settings SET pulls_per_order=3');
await db.exec('RESET ROLE; SET ROLE service_role');
assert.equal((await action('redeem',id)).remaining,3);
assert.equal((await action('redeem',id)).remaining,3); // same owner retry, never increments
await expectError('SELECT public.gacha_action($1,$2,$3,null)',['redeem',id,other]);
await query('UPDATE public.gacha_settings SET minimum_clp=5000');
assert.equal((await action('redeem',id)).remaining,3); // threshold changes preserve granted credits
const request=(await query('SELECT gen_random_uuid() id'))[0].id;
const first=await action('draw',id,hash,request);assert.equal(first.remaining,2);
assert.deepEqual(await action('draw',id,hash,request),first); // identical card, no second debit
await action('draw',id,hash,(await query('SELECT gen_random_uuid() id'))[0].id);
assert.equal((await action('draw',id,hash,(await query('SELECT gen_random_uuid() id'))[0].id)).remaining,0);
await expectError('SELECT public.gacha_action($1,$2,$3,$4)',['draw',id,hash,(await query('SELECT gen_random_uuid() id'))[0].id]);
assert.equal((await action('redeem',id)).remaining,0);
assert.equal((await action('state',null)).vouchers[0].cards.length,3);
assert.equal((await action('state',null,other)).vouchers.length,0);
await query('UPDATE public.gacha_settings SET minimum_clp=2000');
for(const [status,subtotal,env] of [['awaiting_approval',2000,'live'],['paid',1999,'live'],['paid',5000,'test']]){
 const bad=(await query('INSERT INTO public.merch_orders VALUES(gen_random_uuid(),$1,now(),$2,$3) RETURNING id',[status,subtotal,env]))[0].id;
 await expectError('SELECT public.gacha_action($1,$2,$3,null)',['redeem',bad,hash]);
}
const test=(await query("INSERT INTO public.merch_orders VALUES(gen_random_uuid(),'paid',now(),2000,'test') RETURNING id"))[0].id;
await query('UPDATE public.gacha_settings SET allow_test_orders=true');
assert.equal((await action('redeem',test)).remaining,3);
// Dynamic lowest-probability tier, not a hard-coded SSR label.
await query(`UPDATE public.gacha_settings SET rarities='{"common":{"label":"Especial","weight":1},"rare":{"label":"Diaria","weight":99},"ssr":{"label":"Descanso","weight":0}}'`);
// A positive-probability category without cards blocks without taking a credit.
await query("UPDATE public.gacha_cards SET active=false WHERE rareza='common'");
await expectError('SELECT public.gacha_action($1,$2,$3,$4)',['draw',test,hash,(await query('SELECT gen_random_uuid() id'))[0].id]);
assert.equal((await action('state',null)).vouchers.find(v=>v.orderCode===test).remaining,3);
await query("UPDATE public.gacha_cards SET active=true WHERE rareza='common'");
// Existing snapshots survive catalogue deletion/replacement.
await query('DELETE FROM public.gacha_cards WHERE serial=$1',[first.card.serial]);
assert.deepEqual((await action('state',null)).vouchers.find(v=>v.orderCode===id).cards[0],first.card);
console.log('PASS: real migration, 3 roles, storage, threshold, test isolation, single redemption, exhaustion, retry idempotency, catalogue maintenance and historic snapshots.');
await db.close();
