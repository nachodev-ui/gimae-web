import assert from 'node:assert/strict';
import { canCommit, matchesTransaction, MAX_CHECKS, MAX_COMMITS, nextCheck } from './webpay-reconcile.ts';

const now = Date.parse('2026-10-06T00:12:00Z');
const order = { status: 'awaiting_approval', created_at: new Date(now - 2 * 60_000).toISOString(),
  reservation_expires_at: new Date(now + 7 * 60_000).toISOString(),
  webpay_commit_attempts: 0, webpay_commit_claimed_at: null,
  webpay_buy_order: 'Gaaaaaaaaaaaaaaaaaaaaaaaa', webpay_session_id: 'session', total_clp: 5000 };
assert.equal(matchesTransaction({ buy_order: order.webpay_buy_order, session_id: 'session', amount: 5000 }, order), true);
assert.equal(matchesTransaction({ buy_order: order.webpay_buy_order, session_id: 'session', amount: 5001 }, order), false);
assert.equal(canCommit(order, now), true);
assert.equal(canCommit({ ...order, webpay_commit_attempts: MAX_COMMITS }, now), false);
assert.equal(canCommit({ ...order, webpay_commit_claimed_at: new Date(now - 10_000).toISOString() }, now), false);
assert.equal(canCommit({ ...order, reservation_expires_at: new Date(now - 60_000).toISOString() }, now), false);
assert.equal(nextCheck(1, now), new Date(now + 2 * 60_000).toISOString());
assert.equal(nextCheck(4, now), new Date(now + 60_000).toISOString());
assert.equal(nextCheck(5, now), new Date(now + 5 * 60_000).toISOString());
assert.equal(nextCheck(MAX_CHECKS, now), new Date(now + 15 * 60_000).toISOString());
console.log('webpay-reconcile helpers: OK');
