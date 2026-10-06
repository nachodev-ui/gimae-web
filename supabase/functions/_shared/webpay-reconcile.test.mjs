import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesTransaction, reconciliationAction, MAX_CHECKS, nextCheck } from './webpay-reconcile.ts';

const now = Date.parse('2026-10-06T00:12:00Z');
const order = { webpay_buy_order: 'Gaaaaaaaaaaaaaaaaaaaaaaaa', webpay_session_id: 'session', total_clp: 5000 };
assert.equal(matchesTransaction({ buy_order: order.webpay_buy_order, session_id: 'session', amount: 5000 }, order), true);
assert.equal(matchesTransaction({ buy_order: order.webpay_buy_order, session_id: 'session', amount: 5001 }, order), false);
assert.equal(matchesTransaction({ buy_order: 'other', session_id: 'session', amount: 5000 }, order), false);
const identity = { buy_order: order.webpay_buy_order, session_id: order.webpay_session_id, amount: order.total_clp };
assert.equal(reconciliationAction({ ...identity, status: 'INITIALIZED' }, order), 'wait');
assert.equal(reconciliationAction({ ...identity, status: 'AUTHORIZED', response_code: 0 }, order), 'settle');
assert.equal(reconciliationAction({ ...identity, status: 'FAILED' }, order), 'settle');
assert.equal(reconciliationAction({ ...identity, status: 'REVERSED' }, order), 'review');
assert.equal(reconciliationAction({ ...identity, amount: 5001, status: 'AUTHORIZED' }, order), 'mismatch');
// A worker PUT before the merchant return caused HTTP 422 during the Sandbox test.
// Guard the safety boundary even if the worker's control flow is refactored.
const worker = readFileSync(new URL('../webpay-reconcile/index.ts', import.meta.url), 'utf8');
assert.doesNotMatch(worker, /\bwebpay\([^;]+,\s*["']PUT["']/);
assert.equal(nextCheck(1, now), new Date(now + 2 * 60_000).toISOString());
assert.equal(nextCheck(4, now), new Date(now + 60_000).toISOString());
assert.equal(nextCheck(5, now), new Date(now + 5 * 60_000).toISOString());
assert.equal(nextCheck(MAX_CHECKS, now), new Date(now + 15 * 60_000).toISOString());
console.log('webpay-reconcile helpers: OK');
