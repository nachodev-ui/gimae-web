const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
const node = (tag, className, value) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = value;
  return item;
};

export async function renderPayPalAttempts(client, records, notice) {
  records.replaceChildren(node('h2', '', 'Intentos PayPal'));
  const { data, error } = await client.from('merch_orders')
    .select('id,paypal_order_id,status,created_at,total_clp,last_reconciled_at,reconcile_error,abandoned_at,abandon_reason')
    .in('status', ['awaiting_approval', 'capture_pending', 'abandoned'])
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  const orders = data || [];
  const overdue = order => order.status === 'awaiting_approval' &&
    Date.now() - Date.parse(order.created_at) >= 3 * 3600_000;
  const shell = node('div', 'paypal-attempts');
  const intro = node('div', 'paypal-attempts-intro');
  const copy = node('div');
  copy.append(node('p', 'paypal-attempts-eyebrow', 'GIMAE! · SEGUIMIENTO DE PAGOS'),
    node('h3', '', 'Cada intento en su lugar'),
    node('p', '', 'Un intento sin confirmar no es una venta. Las ventas confirmadas aparecen en Pedidos pagados.'));
  const refresh = node('button', 'paypal-attempts-refresh', 'Actualizar');
  refresh.type = 'button';
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try { await renderPayPalAttempts(client, records, notice); }
    catch (cause) { notice(`No se pudieron actualizar los intentos: ${cause.message}`); refresh.disabled = false; }
  });
  intro.append(copy, refresh);
  shell.append(intro);

  const summary = node('div', 'paypal-attempts-summary');
  for (const [label, count, detail] of [
    ['En espera', orders.filter(order => order.status === 'awaiting_approval' && !overdue(order)).length, 'Aún en seguimiento'],
    ['Revisar vigencia', orders.filter(overdue).length, 'PayPal todavía no confirmó su cierre'],
    ['Abandonados', orders.filter(order => order.status === 'abandoned').length, 'Cierre confirmado por PayPal'],
    ['Captura pendiente', orders.filter(order => order.status === 'capture_pending').length, 'No repetir el cobro'],
  ]) {
    const stat = node('div', 'paypal-attempts-stat');
    stat.append(node('span', '', label), node('strong', '', String(count)), node('small', '', detail));
    summary.append(stat);
  }
  shell.append(summary);

  const controls = node('div', 'paypal-attempts-controls');
  const filters = node('div', 'paypal-attempts-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filtrar intentos PayPal');
  const list = node('div', 'paypal-attempts-list');
  const count = node('p', 'paypal-attempts-count');
  const labels = { all: 'Todos', awaiting_approval: 'En espera', overdue: 'Revisar vigencia', abandoned: 'Abandonados', capture_pending: 'Captura pendiente' };
  let filter = 'all';
  const draw = () => {
    list.replaceChildren();
    const visible = orders.filter(order => filter === 'all' ||
      (filter === 'overdue' ? overdue(order) : filter === 'awaiting_approval'
        ? order.status === filter && !overdue(order) : order.status === filter));
    count.textContent = `${visible.length} de ${orders.length} intentos recientes (máximo 100)`;
    filters.querySelectorAll('button').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    if (!visible.length) list.append(node('p', 'paypal-attempts-empty', 'No hay intentos en esta categoría.'));
    for (const order of visible) {
      const card = node('article', 'paypal-attempt');
      const head = node('div', 'paypal-attempt-head');
      const identity = node('div');
      identity.append(node('span', 'paypal-attempt-date', date.format(new Date(order.created_at))),
        node('strong', 'paypal-attempt-id', order.id));
      const kind = order.status === 'abandoned' ? 'abandoned' : overdue(order) ? 'overdue' : order.status;
      const badge = node('span', `paypal-attempt-badge is-${kind}`,
        kind === 'abandoned' ? 'Intento cerrado' : kind === 'overdue' ? 'Revisar vigencia'
          : kind === 'capture_pending' ? 'Captura pendiente' : 'En espera de aprobación');
      head.append(identity, badge);
      const detail = node('div', 'paypal-attempt-detail');
      detail.append(node('span', '', `PayPal · ${order.paypal_order_id || 'Sin ID'}`),
        node('strong', '', money.format(order.total_clp)));
      const note = node('p', 'paypal-attempt-note',
        kind === 'abandoned' ? order.abandon_reason === 'paypal_voided'
          ? 'PayPal anuló esta orden. No preparar como venta.'
          : 'PayPal no encontró la orden en dos revisiones. No preparar como venta.'
          : kind === 'overdue' ? 'Ya superó tres horas, pero no hay cierre confirmado. Mantener en seguimiento.'
          : kind === 'capture_pending' ? 'La captura se está verificando. No iniciar otro cobro.'
          : 'Esperando que el comprador apruebe en PayPal.');
      card.append(head, detail, note);
      if (order.reconcile_error && kind !== 'abandoned') {
        card.append(node('small', 'paypal-attempt-diagnostic', `Última revisión: ${order.reconcile_error}`));
      }
      list.append(card);
    }
  };
  for (const [value, label] of Object.entries(labels)) {
    const button = node('button', '', label);
    button.type = 'button';
    button.dataset.filter = value;
    button.addEventListener('click', () => { filter = value; draw(); });
    filters.append(button);
  }
  controls.append(filters, count);
  shell.append(controls, list);
  records.append(shell);
  draw();
  notice(`${orders.length} intentos PayPal recientes. Solo lectura.`);
}
