export const MAX_CHECKS = 12;
export const MAX_COMMITS = 5;

export type ReconcileOrder = {
  status: string;
  created_at: string;
  reservation_expires_at: string;
  webpay_commit_attempts: number;
  webpay_commit_claimed_at: string | null;
  webpay_buy_order: string;
  webpay_session_id: string;
  total_clp: number;
};

export function matchesTransaction(remote: Record<string, unknown>, order: ReconcileOrder): boolean {
  return remote.buy_order === order.webpay_buy_order &&
    remote.session_id === order.webpay_session_id && remote.amount === order.total_clp;
}

export function canCommit(order: ReconcileOrder, now: number): boolean {
  return order.webpay_commit_attempts < MAX_COMMITS &&
    now >= Date.parse(order.created_at) + 90_000 &&
    now < Date.parse(order.reservation_expires_at) + 45_000 &&
    (!order.webpay_commit_claimed_at ||
      now >= Date.parse(order.webpay_commit_claimed_at) + 75_000);
}

export function nextCheck(attempt: number, now: number): string {
  const minutes = attempt === 4 ? 1 : attempt < 4 ? 2 : attempt < 8 ? 5 : 15;
  return new Date(now + minutes * 60_000).toISOString();
}
