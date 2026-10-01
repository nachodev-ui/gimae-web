import { createClient } from "@supabase/supabase-js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("PAYPAL_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}

function reply(req: Request, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, { error: "Método no permitido" }, 405);
  if (cors(req)["Access-Control-Allow-Origin"] === "null") {
    return reply(req, { error: "Origen no autorizado" }, 403);
  }
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return reply(req, { error: "Inicia sesión en Backstage" }, 401);
  const secret = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  if (!secret || !url) return reply(req, { error: "Servicio no configurado" }, 503);
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: { user }, error: authError } = await db.auth.getUser(bearer);
    if (authError || !user) return reply(req, { error: "Sesión inválida" }, 401);
    const { data: profile, error: profileError } = await db.from("profiles").select("user_id")
      .eq("user_id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return reply(req, { error: "Sin acceso al Backstage" }, 403);
    const raw = await req.text();
    if (raw.length > 1000) return reply(req, { error: "Solicitud demasiado grande" }, 413);
    let orderId: unknown;
    try { orderId = JSON.parse(raw)?.orderId; } catch { /* JSON inválido */ }
    if (typeof orderId !== "string" || !uuid.test(orderId)) {
      return reply(req, { error: "Pedido inválido" }, 400);
    }
    const { data, error } = await db.rpc("recheck_merch_order_stock", { p_order_id: orderId });
    if (error) throw error;
    return reply(req, { stockState: data });
  } catch (error) {
    console.error("Revisión de stock:", error);
    return reply(req, { error: "No se pudo revisar el stock del pedido" }, 500);
  }
});
