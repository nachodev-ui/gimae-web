const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
const node = (tag, className, value) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = String(value);
  return item;
};

const labels = {
  new: 'Por preparar', preparing: 'En preparación', ready: 'Listo para retiro',
  handed_over: 'Entregado', on_hold: 'En revisión'
};

export async function renderMerchOrders(client, records, notice) {
  records.replaceChildren(node('h2', '', 'Pedidos pagados'));
  const { data, error } = await client.from('merch_orders')
    .select('id,buyer_name,buyer_contact,items,total_clp,total_usd_cents,paypal_order_id,paypal_capture_id,paid_at,stock_state,stock_allocations,fulfillment_status,fulfillment_note,fulfillment_updated_at,ready_at,handed_over_at')
    .eq('status', 'paid').order('paid_at', { ascending: false }).limit(100);
  if (error) throw error;
  const orders = data || [];
  const shell = node('div', 'merch-orders');
  const intro = node('div', 'merch-orders-intro');
  const copy = node('div');
  copy.append(node('p', 'merch-orders-eyebrow', 'GIMAE! · PEDIDOS DEL EQUIPO'),
    node('h3', '', 'De pago confirmado a entrega'),
    node('p', '', 'Solo aparecen ventas confirmadas por PayPal. Revisa las unidades asignadas antes de preparar cada pedido.'));
  const refresh = node('button', 'merch-orders-refresh', 'Actualizar');
  refresh.type = 'button';
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try { await renderMerchOrders(client, records, notice); }
    catch (cause) { notice(`No se pudieron actualizar los pedidos: ${cause.message}`); refresh.disabled = false; }
  });
  intro.append(copy, refresh);
  shell.append(intro);

  const summary = node('div', 'merch-orders-summary');
  for (const [label, count] of [
    ['Por preparar', orders.filter(order => order.fulfillment_status === 'new').length],
    ['En preparación', orders.filter(order => order.fulfillment_status === 'preparing').length],
    ['Listos', orders.filter(order => order.fulfillment_status === 'ready').length],
    ['Necesitan revisión', orders.filter(order => order.fulfillment_status === 'on_hold').length]
  ]) {
    const stat = node('div', 'merch-orders-stat');
    stat.append(node('span', '', label), node('strong', '', count));
    summary.append(stat);
  }
  shell.append(summary);

  const filters = node('div', 'merch-orders-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filtrar pedidos pagados');
  const count = node('p', 'merch-orders-count');
  const list = node('div', 'merch-orders-list');
  let filter = 'active';
  const draw = () => {
    list.replaceChildren();
    const visible = orders.filter(order => filter === 'all' ||
      (filter === 'active' ? order.fulfillment_status !== 'handed_over' :
        order.fulfillment_status === filter));
    count.textContent = `${visible.length} de ${orders.length} ventas recientes (máximo 100)`;
    filters.querySelectorAll('button').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    if (!visible.length) list.append(node('p', 'merch-orders-empty', 'No hay pedidos en esta categoría.'));
    for (const order of visible) list.append(orderCard(order));
  };
  for (const [value, label] of Object.entries({ active: 'Pendientes', all: 'Todos', ...labels })) {
    const button = node('button', '', label);
    button.type = 'button';
    button.dataset.filter = value;
    button.addEventListener('click', () => { filter = value; draw(); });
    filters.append(button);
  }
  const controls = node('div', 'merch-orders-controls');
  controls.append(filters, count);
  shell.append(controls, list);
  records.append(shell);
  draw();
  notice(`${orders.length} pedidos pagados recientes. La preparación se guarda en Supabase.`);

  async function changeStatus(order, next, button) {
    button.disabled = true;
    try {
      const { data: updated, error: updateError } = await client.from('merch_orders')
        .update({ fulfillment_status: next }).eq('id', order.id)
        .eq('fulfillment_status', order.fulfillment_status).select('id');
      if (updateError) throw updateError;
      if (updated?.length !== 1) throw new Error('Otro integrante actualizó el pedido. Recarga la lista.');
      await renderMerchOrders(client, records, notice);
    } catch (cause) { notice(`No se pudo actualizar el pedido: ${cause.message}`); button.disabled = false; }
  }

  function orderCard(order) {
    const card = node('article', 'merch-order');
    const head = node('div', 'merch-order-head');
    const title = node('div');
    title.append(node('span', 'merch-order-date', order.paid_at ? date.format(new Date(order.paid_at)) : 'Pago confirmado'),
      node('strong', 'merch-order-id', order.id));
    const badge = node('span', `merch-order-badge is-${order.fulfillment_status}`, labels[order.fulfillment_status] || 'Revisar');
    head.append(title, badge);
    const buyer = node('div', 'merch-order-buyer');
    buyer.append(node('strong', '', order.buyer_name), node('span', '', order.buyer_contact),
      node('strong', '', money.format(order.total_clp)));
    const detail = node('details', 'merch-order-details');
    detail.append(node('summary', '', 'Ver productos, stock y preparación'));
    const body = node('div', 'merch-order-body');
    const payment = node('p', 'merch-order-payment', `PayPal ${order.paypal_order_id || '—'} · Captura ${order.paypal_capture_id || '—'} · Retiro en persona`);
    body.append(payment);
    const allocations = Array.isArray(order.stock_allocations) ? order.stock_allocations : [];
    const products = node('ul', 'merch-order-lines');
    for (const item of (Array.isArray(order.items) ? order.items : [])) {
      const line = node('li');
      const identity = node('div');
      identity.append(node('strong', '', `${item.quantity}× ${item.name || 'Producto'}`),
        node('small', '', item.option || item.optionId || 'Producto general'));
      const allocation = allocations.find(row => row.productId === item.productId && row.optionId === item.optionId);
      line.append(identity, node('span', '', money.format(Number(item.lineTotalClp) || 0)));
      if (order.stock_state !== 'legacy_review') line.append(node('small', `merch-order-stock${allocation?.shortage ? ' is-short' : ''}`,
        allocation ? `${allocation.allocated}/${allocation.requested} uds. asignadas${allocation.shortage ? ` · faltan ${allocation.shortage}` : ''}` : 'Stock pendiente de revisar'));
      products.append(line);
    }
    body.append(products);
    const state = node('p', `merch-order-stock-note is-${order.stock_state}`,
      order.stock_state === 'allocated' ? 'Stock descontado y asignado a este pedido.' :
        order.stock_state === 'shortage' ? 'Faltan unidades: repón y confirma el inventario antes de volver a revisar.' :
          'Venta anterior al control automático: verifica existencias y entrega manualmente. No se descontó stock retroactivo.');
    body.append(state);
    if (order.stock_state === 'shortage') {
      const recheck = node('button', 'merch-order-recheck', 'Volver a revisar stock');
      recheck.type = 'button';
      recheck.addEventListener('click', async () => {
        recheck.disabled = true;
        try {
          const { data: result, error: functionError } = await client.functions.invoke('merch-stock-recheck', { body: { orderId: order.id } });
          if (functionError) throw functionError;
          if (!result?.stockState) throw new Error('No se recibió el resultado de la revisión.');
          await renderMerchOrders(client, records, notice);
        } catch (cause) { notice(`No se pudo revisar el stock: ${cause.message}`); recheck.disabled = false; }
      });
      body.append(recheck);
    }
    const transitions = {
      new: [['preparing', 'Iniciar preparación'], ['on_hold', 'Poner en revisión']],
      preparing: [['ready', 'Marcar listo para retiro'], ['on_hold', 'Poner en revisión']],
      ready: [['handed_over', 'Registrar entrega'], ['on_hold', 'Poner en revisión']],
      on_hold: order.stock_state === 'allocated' ? [['new', 'Reanudar pedido']] : []
    };
    const actions = node('div', 'merch-order-actions');
    for (const [next, label] of transitions[order.fulfillment_status] || []) {
      const button = node('button', next === 'handed_over' ? 'is-final' : '', label);
      button.type = 'button';
      button.addEventListener('click', () => changeStatus(order, next, button));
      actions.append(button);
    }
    if (actions.childElementCount) body.append(actions);
    const noteLabel = node('label', 'merch-order-note', 'Nota interna de preparación');
    const note = node('textarea');
    note.maxLength = 500;
    note.rows = 2;
    note.value = order.fulfillment_note || '';
    noteLabel.append(note);
    const save = node('button', 'merch-order-save-note', 'Guardar nota');
    save.type = 'button';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const { data: updated, error: updateError } = await client.from('merch_orders')
          .update({ fulfillment_note: note.value.trim() }).eq('id', order.id)
          .eq('fulfillment_status', order.fulfillment_status)
          .eq('fulfillment_note', order.fulfillment_note || '').select('id');
        if (updateError) throw updateError;
        if (updated?.length !== 1) throw new Error('El pedido cambió. Recarga antes de guardar la nota.');
        await renderMerchOrders(client, records, notice);
      } catch (cause) { notice(`No se pudo guardar la nota: ${cause.message}`); save.disabled = false; }
    });
    body.append(noteLabel, save);
    if (order.handed_over_at) body.append(node('small', 'merch-order-history', `Entregado: ${date.format(new Date(order.handed_over_at))}`));
    else if (order.ready_at && order.fulfillment_status === 'ready') body.append(node('small', 'merch-order-history', `Listo desde: ${date.format(new Date(order.ready_at))}`));
    detail.append(body);
    card.append(head, buyer, detail);
    return card;
  }
}
