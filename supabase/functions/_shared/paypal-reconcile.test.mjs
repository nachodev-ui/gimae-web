import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRemoteCapture, inspectRemoteOrder } from './paypal-reconcile.ts';

const local = {
  id: '2b7322fb-2aaa-4c0a-8659-5ba896de4946',
  paypal_order_id: '45Y67133ET716621N',
  paypal_capture_id: null,
  total_usd_cents: 1546
};
const remote = {
  id: local.paypal_order_id,
  intent: 'CAPTURE',
  status: 'APPROVED',
  purchase_units: [{
    reference_id: local.id,
    custom_id: local.id,
    payee: { merchant_id: 'GIMAE_MERCHANT' },
    amount: { currency_code: 'USD', value: '15.46' }
  }]
};

test('aprueba solo una orden ligada al pedido y al comercio', () => {
  assert.deepEqual(inspectRemoteOrder(remote, local, 'GIMAE_MERCHANT'), { kind: 'approved' });
  for (const change of [
    { reference_id: 'otro-pedido' },
    { custom_id: 'otro-pedido' },
    { amount: { currency_code: 'USD', value: '15.47' } },
    { amount: { currency_code: 'CLP', value: '15.46' } },
    { payee: { merchant_id: 'OTHER_MERCHANT' } }
  ]) {
    const altered = structuredClone(remote);
    Object.assign(altered.purchase_units[0], change);
    assert.throws(() => inspectRemoteOrder(altered, local, 'GIMAE_MERCHANT'), /PAYPAL_ORDER_MISMATCH/);
  }
});

test('marca pagado solo con una captura completada del monto exacto', () => {
  const completed = structuredClone(remote);
  completed.status = 'COMPLETED';
  completed.purchase_units[0].payments = {
    captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { currency_code: 'USD', value: '15.46' } }]
  };
  assert.deepEqual(inspectRemoteOrder(completed, local, 'GIMAE_MERCHANT'), { kind: 'completed', captureId: 'CAPTURE123' });
  assert.deepEqual(inspectRemoteOrder(completed, { ...local, paypal_capture_id: 'CAPTURE123' }, 'GIMAE_MERCHANT'), { kind: 'completed', captureId: 'CAPTURE123' });
  assert.throws(() => inspectRemoteOrder(completed, { ...local, paypal_capture_id: 'OTHER_CAPTURE' }, 'GIMAE_MERCHANT'), /PAYPAL_CAPTURE_MISMATCH/);
  completed.purchase_units[0].payments.captures[0].status = 'PENDING';
  assert.deepEqual(inspectRemoteOrder(completed, local, 'GIMAE_MERCHANT'), { kind: 'waiting' });
  completed.purchase_units[0].payments.captures[0].amount.value = '15.00';
  assert.throws(() => inspectRemoteOrder(completed, local, 'GIMAE_MERCHANT'), /PAYPAL_CAPTURE_MISMATCH/);
});

test('consulta la captura guardada si PayPal ya no encuentra la orden', () => {
  const captured = {
    id: 'CAPTURE123', status: 'COMPLETED',
    payee: { merchant_id: 'GIMAE_MERCHANT' },
    amount: { currency_code: 'USD', value: '15.46' },
    supplementary_data: { related_ids: { order_id: local.paypal_order_id } }
  };
  const withCapture = { ...local, paypal_capture_id: 'CAPTURE123' };
  assert.deepEqual(inspectRemoteCapture(captured, withCapture, 'GIMAE_MERCHANT'), { kind: 'completed', captureId: 'CAPTURE123' });
  assert.throws(() => inspectRemoteCapture({ ...captured, supplementary_data: { related_ids: { order_id: 'OTHER' } } }, withCapture, 'GIMAE_MERCHANT'), /PAYPAL_CAPTURE_MISMATCH/);
  assert.throws(() => inspectRemoteCapture(captured, { ...local, paypal_capture_id: 'OTHER' }, 'GIMAE_MERCHANT'), /PAYPAL_CAPTURE_MISMATCH/);
  assert.deepEqual(inspectRemoteCapture({ ...captured, status: 'PENDING' }, withCapture, 'GIMAE_MERCHANT'), { kind: 'waiting' });
});
