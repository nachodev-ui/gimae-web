import { admin, body, checkOrigin, CheckoutError, cors, json, rateLimit } from '../_shared/paypal.ts';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// No customer account: a random 256-bit browser token owns the redeemed credits.
// The order UUID is the bearer redemption code; only paid orders qualify.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, {status:204,headers:cors(req)});
  try {
    if (req.method !== 'POST') throw new CheckoutError(405,'Método no permitido.');
    checkOrigin(req);
    const data = await body(req);
    if (!['redeem','draw','state'].includes(String(data.action)) ||
      typeof data.token !== 'string' || !/^[0-9a-f]{64}$/.test(data.token) ||
      (data.action !== 'state' && (typeof data.orderCode !== 'string' || !uuid.test(data.orderCode))) ||
      (data.action === 'draw' && (typeof data.requestId !== 'string' || !uuid.test(data.requestId))))
      throw new CheckoutError(400,'Revisa el código de pedido e inténtalo nuevamente.');
    const db = admin();
    await rateLimit(db,req,'status'); // IP + global, including invalid/redemption attempts.
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.token));
    const hash = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const {data:result,error} = await db.rpc('gacha_action',{
      p_action:data.action,p_order:data.orderCode || null,p_hash:hash,p_request:data.requestId || null
    });
    if (error) {
      if(error.code==='P0001') throw new CheckoutError(409,error.message);
      throw error;
    }
    return json(req,result);
  } catch(error) {
    if (!(error instanceof CheckoutError)) console.error('Gacha request failed');
    return json(req,{error:error instanceof CheckoutError?error.message:'No pudimos conectar con el Gacha. Tus tiradas se conservan; vuelve a intentarlo.'},error instanceof CheckoutError?error.status:500);
  }
});
