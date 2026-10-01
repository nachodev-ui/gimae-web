import {
  admin,
  captureApprovedOrder,
  paypal,
  paypalBase,
  paypalMerchantId,
  paypalToken,
} from "../_shared/paypal.ts";
import {
  inspectRemoteCapture,
  inspectRemoteOrder,
  type LocalPayPalOrder,
} from "../_shared/paypal-reconcile.ts";

type Candidate = LocalPayPalOrder & {
  status: "awaiting_approval" | "capture_pending";
  created_at: string;
  reconcile_after: string;
  reconcile_attempts: number;
};

function result(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function authorized(req: Request, db: ReturnType<typeof admin>): Promise<boolean> {
  const secret = req.headers.get("x-gimae-reconcile") || "";
  if (!/^[0-9a-f]{64}$/.test(secret)) return false;
  const { data, error } = await db.from("paypal_reconcile_auth")
    .select("token_sha256").eq("id", true).single();
  if (error || !data) throw error || new Error("Falta configurar la conciliación");
  const hash = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  ));
  const expected = data.token_sha256 as string;
  if (expected.length !== 64) throw new Error("Hash de conciliación inválido");
  let difference = 0;
  for (let i = 0; i < hash.length; i++) {
    difference |= hash[i] ^ Number.parseInt(expected.slice(i * 2, i * 2 + 2), 16);
  }
  return difference === 0;
}

function nextCheck(order: Candidate): string {
  const age = Date.now() - Date.parse(order.created_at);
  // Cron corre cada dos minutos; 90 s permite tomar el siguiente ciclo.
  const delay = order.status === "capture_pending"
    ? age < 3600_000 ? 90_000 : age < 86400_000 ? 15 * 60_000 : 3600_000
    : age < 3600_000 ? 90_000 : age < 3 * 3600_000 ? 5 * 60_000
    : age < 86400_000 ? 30 * 60_000 : 6 * 3600_000;
  return new Date(Date.now() + delay).toISOString();
}

async function getOrder(orderId: string, token: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`PAYPAL_ORDER_HTTP_${response.status}`);
  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return result({ error: "Método no permitido" }, 405);
  try {
    const db = admin();
    if (!await authorized(req, db)) return result({ error: "No autorizado" }, 401);
    const now = new Date().toISOString();
    const { data: due, error } = await db.from("merch_orders")
      .select("id,paypal_order_id,paypal_capture_id,total_usd_cents,status,created_at,reconcile_after,reconcile_attempts")
      .in("status", ["awaiting_approval", "capture_pending"])
      .not("paypal_order_id", "is", null)
      .lte("reconcile_after", now).order("reconcile_after").limit(8);
    if (error) throw error;
    if (!due?.length) return result({ checked: 0, paid: 0, approved: 0, captured: 0, errors: 0 });
    const token = await paypalToken();
    const counts = { checked: 0, paid: 0, approved: 0, captured: 0, errors: 0 };
    for (const item of due as Candidate[]) {
      // La actualización condicional deja un lease; otra ejecución no procesará esta fila.
      const { data: claim, error: claimError } = await db.from("merch_orders")
        .update({
          reconcile_after: new Date(Date.now() + 2 * 60_000).toISOString(),
          reconcile_attempts: item.reconcile_attempts + 1,
        }).eq("id", item.id).eq("status", item.status)
        .lte("reconcile_after", now).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claim) continue;
      counts.checked++;
      try {
        if (!/^[A-Z0-9-]{8,40}$/.test(item.paypal_order_id)) {
          throw new Error("PAYPAL_ORDER_ID_INVALID");
        }
        const remote = await getOrder(item.paypal_order_id, token);
        const state = remote
          ? inspectRemoteOrder(remote, item, paypalMerchantId())
          : item.paypal_capture_id
          ? inspectRemoteCapture(
            await paypal(`/v2/payments/captures/${encodeURIComponent(item.paypal_capture_id)}`, token),
            item,
            paypalMerchantId(),
          )
          : { kind: "missing" as const };
        if (state.kind === "completed") {
          const { data: paid, error: updateError } = await db.from("merch_orders")
            .update({
              status: "paid",
              paypal_capture_id: state.captureId,
              paid_at: new Date().toISOString(),
              last_reconciled_at: new Date().toISOString(),
              reconcile_error: null,
            }).eq("id", item.id).in("status", ["awaiting_approval", "capture_pending"])
            .select("id").maybeSingle();
          if (updateError) throw updateError;
          if (paid) counts.paid++;
        } else if (state.kind === "approved" && item.status === "awaiting_approval") {
          counts.approved++;
          // La orden se verificó directamente con PayPal. El navegador, el webhook
          // y esta tarea comparten el UUID del pedido como PayPal-Request-Id.
          await captureApprovedOrder(db, item, item.paypal_order_id, token);
          const { error: saveError } = await db.from("merch_orders")
            .update({
              reconcile_after: new Date(Date.now() + 90_000).toISOString(),
              last_reconciled_at: new Date().toISOString(),
              reconcile_error: null,
            }).eq("id", item.id).eq("status", "capture_pending");
          if (saveError) throw saveError;
          counts.captured++;
        } else {
          if (state.kind === "approved") counts.approved++;
          const { error: saveError } = await db.from("merch_orders")
            .update({
              reconcile_after: nextCheck(item),
              last_reconciled_at: new Date().toISOString(),
              reconcile_error: state.kind === "approved" ? "PAYPAL_APPROVED_CAPTURE_PENDING"
                : state.kind === "missing" ? "PAYPAL_ORDER_NOT_FOUND" : null,
            }).eq("id", item.id).in("status", ["awaiting_approval", "capture_pending"]);
          if (saveError) throw saveError;
        }
      } catch (cause) {
        counts.errors++;
        const code = cause instanceof Error && /^PAYPAL_[A-Z_]+$/.test(cause.message)
          ? cause.message : "PAYPAL_CHECK_FAILED";
        console.error("Conciliación PayPal:", item.id, code);
        const { error: saveError } = await db.from("merch_orders")
          .update({
            reconcile_after: nextCheck(item),
            last_reconciled_at: new Date().toISOString(),
            reconcile_error: code,
          }).eq("id", item.id).in("status", ["awaiting_approval", "capture_pending"]);
        if (saveError) throw saveError;
      }
    }
    return result(counts);
  } catch (error) {
    console.error("No se pudo ejecutar la conciliación:", error);
    return result({ error: "Conciliación no disponible" }, 500);
  }
});
