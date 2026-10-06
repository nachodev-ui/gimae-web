const date = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
const node = (tag, className, value) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = value;
  return item;
};

export async function renderWebpayAlerts(client, records, notice) {
  records.replaceChildren(node('h2', '', 'Seguimiento Webpay'));
  const { data, error } = await client.from('merch_orders')
    .select('id,webpay_buy_order,status,created_at,order_environment,webpay_reconcile_attempts,webpay_commit_attempts,webpay_last_reconciled_at,webpay_reconcile_error,webpay_reconcile_alert_at,webpay_reconcile_alert_reason')
    .eq('payment_provider', 'webpay')
    .in('status', ['awaiting_approval', 'capture_pending', 'abandoned'])
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  const orders = (data || []).sort((a, b) => Number(Boolean(b.webpay_reconcile_alert_at)) - Number(Boolean(a.webpay_reconcile_alert_at)));
  const alerts = orders.filter(order => order.webpay_reconcile_alert_at);
  const shell = node('div', 'paypal-attempts');
  const intro = node('div', 'paypal-attempts-intro');
  const copy = node('div');
  copy.append(node('p', 'paypal-attempts-eyebrow', 'GIMAE! · WEBPAY INTEGRACIÓN'),
    node('h3', '', 'Pagos en seguimiento'),
    node('p', '', 'La tarea del servidor consulta Transbank aunque el navegador no regrese. Una alerta no confirma un cobro ni un rechazo.'));
  const refresh = node('button', 'paypal-attempts-refresh', 'Actualizar');
  refresh.type = 'button';
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try { await renderWebpayAlerts(client, records, notice); }
    catch (cause) { notice(`No se pudieron actualizar los intentos: ${cause.message}`); refresh.disabled = false; }
  });
  intro.append(copy, refresh);
  shell.append(intro);
  const summary = node('div', 'paypal-attempts-summary');
  for (const [label, count, detail] of [
    ['Revisión manual', alerts.length, 'Resultado incierto'],
    ['Verificando', orders.filter(order => !order.webpay_reconcile_alert_at && order.status === 'capture_pending').length, 'No repetir el cobro'],
    ['Sin aprobación', orders.filter(order => !order.webpay_reconcile_alert_at && order.status === 'awaiting_approval').length, 'Aún en seguimiento'],
    ['Vencidos', orders.filter(order => !order.webpay_reconcile_alert_at && order.status === 'abandoned').length, 'Sin pago confirmado'],
  ]) {
    const stat = node('div', 'paypal-attempts-stat');
    stat.append(node('span', '', label), node('strong', '', String(count)), node('small', '', detail));
    summary.append(stat);
  }
  shell.append(summary);
  if (alerts.length) {
    const banner = node('p', 'webpay-alert-banner', `${alerts.length} intento${alerts.length === 1 ? '' : 's'} requiere${alerts.length === 1 ? '' : 'n'} revisión. Comprueba el ID en Transbank antes de decidir si hubo cobro. No prepares estos pedidos.`);
    banner.setAttribute('role', 'alert');
    shell.append(banner);
  }
  const list = node('div', 'paypal-attempts-list');
  if (!orders.length) list.append(node('p', 'paypal-attempts-empty', 'No hay intentos Webpay recientes por revisar.'));
  for (const order of orders) {
    const card = node('article', `paypal-attempt${order.webpay_reconcile_alert_at ? ' webpay-needs-review' : ''}`);
    const head = node('div', 'paypal-attempt-head');
    const identity = node('div');
    identity.append(node('span', 'paypal-attempt-date', date.format(new Date(order.created_at))),
      node('strong', 'paypal-attempt-id', order.webpay_buy_order || order.id));
    const badge = node('span', `paypal-attempt-badge is-${order.webpay_reconcile_alert_at ? 'overdue' : order.status}`,
      order.webpay_reconcile_alert_at ? 'Revisión manual' : order.status === 'capture_pending' ? 'Verificando pago' : order.status === 'abandoned' ? 'Vencido' : 'En espera');
    head.append(identity, badge);
    const reason = order.webpay_reconcile_alert_reason === 'mismatch'
      ? 'Los datos devueltos por Transbank no coinciden con el pedido. No cambiar el estado manualmente.'
      : order.webpay_reconcile_alert_at
        ? 'Se agotaron los reintentos o el resultado sigue incierto. Contrasta esta orden en Transbank y consulta al responsable técnico.'
        : order.status === 'capture_pending'
          ? 'El servidor está verificando la operación. No iniciar otro cobro para este intento.'
          : order.status === 'abandoned' ? 'El tiempo de prueba terminó sin pago confirmado.'
            : 'Esperando autorización del comprador de prueba.';
    const detail = node('p', 'paypal-attempt-note', reason);
    const meta = node('small', 'paypal-attempt-diagnostic',
      `${order.order_environment === 'test' ? 'Prueba · ' : ''}${order.webpay_reconcile_attempts} consultas · ${order.webpay_commit_attempts} intentos de confirmación${order.webpay_last_reconciled_at ? ` · última revisión ${date.format(new Date(order.webpay_last_reconciled_at))}` : ''}${order.webpay_reconcile_error ? ` · ${order.webpay_reconcile_error}` : ''}`);
    card.append(head, detail, meta);
    list.append(card);
  }
  shell.append(list);
  records.append(shell);
  notice(`${alerts.length} alertas Webpay · ${orders.length} intentos recientes. Solo lectura.`);
}
