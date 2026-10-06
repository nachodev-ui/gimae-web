import { admin } from "../_shared/paypal.ts";
import { webpay, WebpayHttpError } from "../_shared/webpay.ts";
import { settle, type WebpayOrder } from "../_shared/webpay-order.ts";
import { matchesTransaction, MAX_CHECKS, nextCheck, type ReconcileOrder } from "../_shared/webpay-reconcile.ts";

type Candidate = WebpayOrder & ReconcileOrder & {
  payment_provider: "webpay";
  created_at: string;
  webpay_reconcile_after: string;
  webpay_reconcile_attempts: number;
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function authorized(req: Request, db: ReturnType<typeof admin>): Promise<boolean> {
  const token = req.headers.get("x-gimae-webpay-reconcile") || "";
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const { data, error } = await db.from("webpay_reconcile_auth")
    .select("token_sha256").eq("id", true).single();
  if (error || !data) throw error || new Error("Falta configurar la conciliación Webpay");
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  let difference = 0;
  for (let i = 0; i < bytes.length; i++) {
    difference |= bytes[i] ^ Number.parseInt(data.token_sha256.slice(i * 2, i * 2 + 2), 16);
  }
  return difference === 0;
}

function code(error: unknown): string {
  if (error instanceof WebpayHttpError) return `WEBPAY_HTTP_${error.status}`;
  return "WEBPAY_CHECK_FAILED";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "Método no permitido" }, 405);
  try {
    const db = admin();
    if (!await authorized(req, db)) return response({ error: "No autorizado" }, 401);
    const now = new Date().toISOString();
    const { data: due, error } = await db.from("merch_orders")
      .select("id,payment_provider,status,reservation_state,reservation_expires_at,abandon_reason,webpay_buy_order,webpay_session_id,webpay_token,webpay_return_origin,webpay_authorization_code,total_clp,webpay_commit_claimed_at,created_at,webpay_reconcile_after,webpay_reconcile_attempts,webpay_commit_attempts")
      .eq("payment_provider", "webpay")
      .in("status", ["awaiting_approval", "capture_pending", "abandoned"])
      .not("webpay_token", "is", null)
      .lte("webpay_reconcile_after", now)
      .lt("webpay_reconcile_attempts", MAX_CHECKS)
      .order("webpay_reconcile_after").limit(6);
    if (error) throw error;
    const counts = { checked: 0, paid: 0, denied: 0, pending: 0, alerted: 0, errors: 0 };
    for (const item of (due || []) as Candidate[]) {
      // Conditional lease: two overlapping Cron requests cannot both own this check.
      const { data: claim, error: claimError } = await db.from("merch_orders")
        .update({ webpay_reconcile_after: new Date(Date.now() + 90_000).toISOString(),
          webpay_reconcile_attempts: item.webpay_reconcile_attempts + 1 })
        .eq("id", item.id).eq("status", item.status)
        .eq("webpay_reconcile_attempts", item.webpay_reconcile_attempts)
        .lte("webpay_reconcile_after", now).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claim) continue;
      counts.checked++;
      const attempt = item.webpay_reconcile_attempts + 1;
      let errorCode: string | null = null;
      let alertReason: string | null = null;
      try {
        if (!/^[A-Za-z0-9]{64}$/.test(item.webpay_token)) throw new Error("Invalid token");
        const path = `/${encodeURIComponent(item.webpay_token)}`;
        const remote = await webpay(path, "GET");
        if (!matchesTransaction(remote, item)) {
          alertReason = "mismatch";
          errorCode = "WEBPAY_IDENTITY_MISMATCH";
        }

        if (!alertReason && (remote.status === "AUTHORIZED" || remote.status === "FAILED")) {
          // A status lookup can recover a transaction resolved by the return path.
          // INITIALIZED is not proof that the buyer approved. Commit is only
          // allowed in webpay-return after Transbank sends the browser back.
          const { data: current, error: currentError } = await db.from("merch_orders")
            .select("status").eq("id", item.id).single();
          if (currentError) throw currentError;
          let owned = current.status === "capture_pending";
          if (!owned && ["awaiting_approval", "abandoned"].includes(current.status)) {
            const { data: taken, error: takeError } = await db.rpc("claim_webpay_commit", { p_token: item.webpay_token });
            if (takeError) throw takeError;
            owned = taken === "claimed";
          }
          if (owned) {
            await settle(db, item, remote);
            const { data: final, error: finalError } = await db.from("merch_orders")
              .select("status").eq("id", item.id).single();
            if (finalError) throw finalError;
            if (final.status === "paid" || final.status === "payment_denied") {
              const { error: cleanError } = await db.from("merch_orders").update({
                webpay_last_reconciled_at: new Date().toISOString(), webpay_reconcile_error: null,
                webpay_reconcile_alert_at: null, webpay_reconcile_alert_reason: null,
              }).eq("id", item.id);
              if (cleanError) throw cleanError;
              counts[final.status === "paid" ? "paid" : "denied"]++;
              continue;
            }
          }
          errorCode = "WEBPAY_COMMIT_IN_PROGRESS";
        }
        if (!alertReason && remote.status !== "INITIALIZED" &&
          remote.status !== "AUTHORIZED" && remote.status !== "FAILED") {
          alertReason = "unresolved";
          errorCode = "WEBPAY_STATUS_REVIEW";
        }
        if (!errorCode && remote.status === "INITIALIZED") errorCode = "WEBPAY_STILL_INITIALIZED";
      } catch (cause) {
        counts.errors++;
        errorCode = code(cause);
        console.error("Conciliación Webpay pendiente:", item.id, errorCode);
      }
      const terminal = alertReason !== null || attempt >= MAX_CHECKS;
      if (!alertReason && terminal) alertReason = "unresolved";
      if (!alertReason && Date.now() > Date.parse(item.reservation_expires_at) + 5 * 60_000) {
        alertReason = "unresolved";
      }
      const { error: saveError } = await db.from("merch_orders").update({
        webpay_reconcile_after: nextCheck(attempt, Date.now()),
        webpay_last_reconciled_at: new Date().toISOString(),
        webpay_reconcile_error: errorCode,
        ...(alertReason ? { webpay_reconcile_alert_at: new Date().toISOString(),
          webpay_reconcile_alert_reason: alertReason } : {}),
        ...(terminal ? { webpay_reconcile_attempts: MAX_CHECKS } : {}),
      }).eq("id", item.id).in("status", ["awaiting_approval", "capture_pending", "abandoned"]);
      if (saveError) throw saveError;
      if (alertReason) counts.alerted++;
      else counts.pending++;
    }
    return response(counts);
  } catch (error) {
    console.error("Conciliación Webpay no disponible", error);
    return response({ error: "Conciliación no disponible" }, 500);
  }
});
