export const MAX_CHECKS = 12;

export type ReconcileOrder = {
  webpay_buy_order: string;
  webpay_session_id: string;
  total_clp: number;
};

export function matchesTransaction(remote: Record<string, unknown>, order: ReconcileOrder): boolean {
  return remote.buy_order === order.webpay_buy_order &&
    remote.session_id === order.webpay_session_id && remote.amount === order.total_clp;
}

export function reconciliationAction(remote: Record<string, unknown>, order: ReconcileOrder):
  "settle" | "wait" | "review" | "mismatch" {
  if (!matchesTransaction(remote, order)) return "mismatch";
  if (remote.status === "AUTHORIZED" || remote.status === "FAILED") return "settle";
  if (remote.status === "INITIALIZED") return "wait";
  return "review";
}

export function nextCheck(attempt: number, now: number): string {
  const minutes = attempt === 4 ? 1 : attempt < 4 ? 2 : attempt < 8 ? 5 : 15;
  return new Date(now + minutes * 60_000).toISOString();
}
