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
const steps = ['Pagado', 'Preparando', 'Listo', 'Entregado'];
const stepIndex = { new: 0, preparing: 1, ready: 2, handed_over: 3 };
const opened = new Set();
let selectedFilter = 'work';
let firstOpen = true;
const isLegacy = order => order.stock_state === 'legacy_review';
const isAttention = order => order.fulfillment_status === 'on_hold' && !isLegacy(order);
const isWork = order => ['new', 'preparing', 'ready'].includes(order.fulfillment_status);
const reference = order => order.paypal_order_id || order.id.slice(0, 8).toUpperCase();
const feedback = (tone, title, message, notice) => {
  notice(`${title}. ${message}`);
  window.GIMAE_UI?.toast({ tone, title, message, duration: tone === 'error' ? 8000 : 5500 });
};

export async function renderMerchOrders(client, records, notice, focus = null) {
  const { data, error } = await client.from('merch_orders')
    .select('id,buyer_name,buyer_contact,items,total_clp,total_usd_cents,paypal_order_id,paypal_capture_id,paid_at,stock_state,stock_allocations,reservation_issue,reservation_reviewed_at,fulfillment_status,fulfillment_note,fulfillment_updated_at,ready_at,handed_over_at')
    .eq('status', 'paid').order('paid_at', { ascending: false }).limit(100);
  if (error) throw error;
  const orders = data || [];
  const totals = {
    work: orders.filter(isWork).length, attention: orders.filter(isAttention).length,
    legacy: orders.filter(isLegacy).length,
    done: orders.filter(order => order.fulfillment_status === 'handed_over').length,
    all: orders.length
  };
  if (firstOpen) {
    selectedFilter = totals.work ? 'work' : totals.attention ? 'attention' : totals.done ? 'done' : totals.legacy ? 'legacy' : 'work';
    firstOpen = false;
  }
  records.replaceChildren(node('h2', 'merch-orders-section-title', 'Pedidos pagados'));
  const shell = node('div', 'merch-orders');
  const intro = node('div', 'merch-orders-intro');
  const copy = node('div');
  copy.append(node('p', 'merch-orders-eyebrow', 'GIMAE! · MESA DE PEDIDOS'),
    node('h3', '', 'Cada venta, un siguiente paso'),
    node('p', '', 'Aquí solo aparecen pagos confirmados. El stock se asigna al confirmarse el pago; los faltantes se señalan antes de preparar.'));
  const refresh = node('button', 'merch-orders-refresh', '↻  Actualizar pedidos');
  refresh.type = 'button';
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    refresh.textContent = 'Actualizando…';
    try { await renderMerchOrders(client, records, notice, 'refresh'); feedback('success', 'Pedidos actualizados', 'La bandeja muestra el estado más reciente.', notice); }
    catch (cause) { feedback('error', 'No se pudo actualizar', cause.message, notice); refresh.disabled = false; refresh.textContent = '↻  Actualizar pedidos'; }
  });
  intro.append(copy, refresh);
  shell.append(intro);
  const guide = node('p', 'merch-orders-guide');
  guide.append(node('span', '', '✦'), document.createTextNode(' Revisa los productos → prepara → marca listo → registra la entrega. Cada tarjeta muestra el próximo paso.'));
  shell.append(guide);
  if (totals.attention || totals.legacy) {
    const alert = node('div', 'merch-orders-alert');
    const alertText = node('div');
    alertText.append(node('strong', '', totals.attention ? `${totals.attention} pedido${totals.attention === 1 ? '' : 's'} necesita${totals.attention === 1 ? '' : 'n'} atención` : 'Hay ventas antiguas por revisar'),
      node('p', '', totals.attention ? 'Revisa faltantes o pedidos pausados antes de continuar.' : 'Los pagos anteriores al control de stock requieren auditoría manual.'));
    alert.append(node('span', 'merch-orders-alert-icon', '!'), alertText);
    if (totals.attention) {
      const see = node('button', '', 'Ver pedidos →');
      see.type = 'button';
      see.addEventListener('click', () => { selectedFilter = 'attention'; draw(); filters.querySelector('[data-filter="attention"]')?.focus(); });
      alert.append(see);
    }
    shell.append(alert);
  }

  const filters = node('div', 'merch-orders-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filtrar pedidos pagados');
  const count = node('p', 'merch-orders-count');
  count.setAttribute('role', 'status');
  const list = node('div', 'merch-orders-list');
  const draw = () => {
    list.replaceChildren();
    const visible = orders.filter(order => selectedFilter === 'all' ||
      (selectedFilter === 'work' && isWork(order)) ||
      (selectedFilter === 'attention' && isAttention(order)) ||
      (selectedFilter === 'legacy' && isLegacy(order)) ||
      (selectedFilter === 'done' && order.fulfillment_status === 'handed_over'))
      .sort((a, b) => (selectedFilter === 'all'
        ? (isLegacy(a) ? 5 : {on_hold:0,new:1,preparing:2,ready:3,handed_over:4}[a.fulfillment_status]) -
          (isLegacy(b) ? 5 : {on_hold:0,new:1,preparing:2,ready:3,handed_over:4}[b.fulfillment_status])
        : 0) || Date.parse(a.paid_at) - Date.parse(b.paid_at));
    count.textContent = `${visible.length} de ${orders.length} ventas recientes · máximo 100`;
    filters.querySelectorAll('button').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.filter === selectedFilter)));
    if (!visible.length) list.append(node('p', 'merch-orders-empty', selectedFilter === 'work' ? '♡ Todo al día: no hay ventas pendientes de preparación o entrega.' : 'No hay pedidos en este grupo.'));
    for (const order of visible) list.append(orderCard(order));
  };
  for (const [value, label] of [['work','Por gestionar'],['attention','Necesitan atención'],['done','Entregados'],['legacy','Ventas anteriores'],['all','Todos']]) {
    const button = node('button', '', undefined);
    button.type = 'button';
    button.dataset.filter = value;
    button.append(node('span', '', label), node('strong', '', totals[value]));
    button.addEventListener('click', () => { selectedFilter = value; draw(); });
    filters.append(button);
  }
  const controls = node('div', 'merch-orders-controls');
  controls.append(filters, count);
  shell.append(controls, list);
  records.append(shell);
  draw();
  notice(`${orders.length} ventas confirmadas recientes. Elige una tarjeta para continuar su preparación.`);
  if (focus === 'refresh') refresh.focus({ preventScroll: true });
  else if (focus) {
    const [kind, id] = focus.split(':');
    const card = [...list.querySelectorAll('.merch-order')].find(item => item.dataset.id === id);
    (kind === 'note' ? card?.querySelector('textarea') : card?.querySelector('.merch-order-reference') || filters.querySelector(`[data-filter="${selectedFilter}"]`))?.focus({ preventScroll: true });
  }

  async function saveChange(order, changes, button, title, message, focusKind = 'card') {
    const card = button.closest('.merch-order');
    const buttons = [...card.querySelectorAll('button')];
    const wasDisabled = buttons.map(item => item.disabled);
    buttons.forEach(item => { item.disabled = true; });
    card.setAttribute('aria-busy', 'true');
    const original = button.textContent;
    button.textContent = 'Guardando…';
    try {
      const { data: updated, error: updateError } = await client.from('merch_orders')
        .update(changes).eq('id', order.id)
        .eq('fulfillment_status', order.fulfillment_status)
        .eq('fulfillment_note', order.fulfillment_note || '').select('id');
      if (updateError) throw updateError;
      if (updated?.length !== 1) throw new Error('Otra persona modificó este pedido. Actualiza la bandeja y comprueba su estado.');
      await renderMerchOrders(client, records, notice, `${focusKind}:${order.id}`);
      feedback('success', title, message, notice);
    } catch (cause) {
      const inline = card.querySelector('.merch-order-feedback');
      inline.textContent = `No se guardó el cambio. ${cause.message}`;
      inline.hidden = false;
      feedback('error', 'No se guardó el cambio', cause.message, notice);
      buttons.forEach((item, index) => { item.disabled = wasDisabled[index]; });
      button.textContent = original;
      card.removeAttribute('aria-busy');
    }
  }

  function orderCard(order) {
    const card = node('article', `merch-order is-${isLegacy(order) ? 'legacy' : order.fulfillment_status}`);
    card.dataset.id = order.id;
    const head = node('div', 'merch-order-head');
    const title = node('div', 'merch-order-identity');
    title.append(node('span', 'merch-order-date', `✦ Pago confirmado · ${order.paid_at ? date.format(new Date(order.paid_at)) : 'fecha pendiente'}`));
    const ref = node('strong', 'merch-order-reference', `Pedido ${reference(order)}`);
    ref.tabIndex = -1;
    title.append(ref);
    const badge = node('span', `merch-order-badge is-${isLegacy(order) ? 'legacy' : order.fulfillment_status}`,
      isLegacy(order) ? 'Auditoría manual' : labels[order.fulfillment_status] || 'Revisar');
    head.append(title, badge);
    const buyer = node('div', 'merch-order-buyer');
    const buyerCopy = node('div');
    buyerCopy.append(node('small', '', 'COMPRADOR'), node('strong', '', order.buyer_name), node('span', '', order.buyer_contact));
    buyer.append(buyerCopy, node('strong', 'merch-order-total', money.format(order.total_clp)));
    card.append(head, buyer);
    const detail = node('details', 'merch-order-details');
    if (opened.has(order.id)) detail.open = true;
    detail.addEventListener('toggle', () => detail.open ? opened.add(order.id) : opened.delete(order.id));
    detail.append(node('summary', '', 'Ver nota interna y datos del pago'));
    function noteIsSaved() {
      if (note.value.trim() === (order.fulfillment_note || '')) return true;
      detail.open = true;
      note.focus();
      feedback('warning', 'Hay una nota sin guardar', 'Guarda la nota interna antes de cambiar este pedido.', notice);
      return false;
    }
    const body = node('div', 'merch-order-body');
    const allocations = Array.isArray(order.stock_allocations) ? order.stock_allocations : [];
    const productArea = node('div', 'merch-order-products');
    productArea.append(node('h5', '', 'Qué se compró'));
    const products = node('ul', 'merch-order-lines');
    for (const item of (Array.isArray(order.items) ? order.items : [])) {
      const line = node('li');
      const identity = node('div');
      identity.append(node('strong', '', item.name || 'Producto'),
        node('small', '', item.option || item.optionId || 'Sin variante'));
      const allocation = allocations.find(row => row.productId === item.productId && row.optionId === item.optionId);
      line.append(node('strong', 'merch-order-quantity', `${item.quantity} ×`), identity);
      if (!isLegacy(order)) line.append(node('small', `merch-order-stock${allocation?.shortage ? ' is-short' : ''}`,
        allocation ? (allocation.shortage ? `Faltan ${allocation.shortage}` : `${allocation.allocated} asignadas`) : 'Stock pendiente'));
      products.append(line);
    }
    productArea.append(products);
    card.append(productArea);
    if (isLegacy(order) || order.stock_state === 'shortage' || order.fulfillment_status === 'on_hold') {
      const warning = node('div', 'merch-order-warning');
      const copy = node('div');
      if (isLegacy(order)) copy.append(node('strong', '', 'Venta anterior al control de stock'), node('p', '', 'No se descontaron unidades automáticamente. Una administradora debe comprobar el inventario y la entrega manualmente; esta tarjeta no permite continuar la preparación.'));
      else if (order.stock_state === 'shortage') copy.append(node('strong', '', order.reservation_issue === 'late_capture' ? 'Pago tardío: revisar antes de preparar' : 'Faltan unidades para completar el pedido'), node('p', '', 'El pago está confirmado. Repón y confirma el inventario en Merch; después vuelve a revisar el stock aquí.'));
      else if (order.reservation_issue === 'late_capture') copy.append(node('strong', '', 'Pago confirmado después de vencer la reserva'),
        node('p', '', 'Comprueba la captura en PayPal y revisa las unidades asignadas. Registra una nota antes de empezar la preparación.'));
      else copy.append(node('strong', '', 'Preparación pausada'), node('p', '', `Motivo interno: ${order.fulfillment_note || 'No se registró un motivo.'} Reanuda cuando esté resuelto.`));
      warning.append(node('span', 'merch-order-warning-icon', '!'), copy);
      card.append(warning);
    }
    if (!isLegacy(order) && order.fulfillment_status !== 'on_hold') {
      const progress = node('ol', 'merch-order-progress');
      const active = stepIndex[order.fulfillment_status] ?? 0;
      steps.forEach((label, index) => {
        const step = node('li', index < active ? 'is-complete' : index === active ? 'is-current' : '');
        step.append(node('span', 'merch-order-progress-dot', index < active ? '✓' : index + 1), node('span', '', label));
        if (index === active) step.setAttribute('aria-current', 'step');
        progress.append(step);
      });
      card.append(progress);
    }
    const actions = {
      new: ['Comprueba productos y cantidades', 'Al empezar a reunirlos, registra que el pedido está en preparación.', 'Empezar preparación', 'preparing'],
      preparing: ['Prepara y revisa el pedido', 'Cuando todas las unidades estén separadas, márcalo como listo.', 'Marcar como listo', 'ready'],
      ready: ['Espera el retiro', 'Registra la entrega únicamente después de entregar el pedido en persona.', 'Confirmar entrega', 'handed_over'],
      handed_over: ['Pedido entregado', 'La entrega quedó registrada. No hay más pasos en esta bandeja.']
    };
    const next = isLegacy(order) ? null : order.fulfillment_status === 'on_hold'
      ? order.stock_state === 'allocated'
        ? order.reservation_issue === 'late_capture'
          ? ['Pago después del vencimiento', 'Las unidades están asignadas. Comprueba el pago y el pedido antes de autorizar la preparación; deja una nota de revisión.', 'Revisar y autorizar', 'review']
          : ['Listo para retomar', 'El stock está asignado. Reanuda el pedido para prepararlo.', 'Reanudar preparación', 'new']
        : ['Hay un faltante', 'Repón el inventario y vuelve a revisarlo para continuar.', 'Volver a revisar stock', 'recheck']
      : actions[order.fulfillment_status];
    if (next) {
      const action = node('div', 'merch-order-next');
      const instruction = node('div');
      instruction.append(node('span', '', next[2] ? 'SIGUIENTE PASO' : 'RECORRIDO COMPLETADO'),
        node('strong', '', next[0]), node('p', '', next[1]));
      action.append(instruction);
      if (next[2]) {
        const button = node('button', 'merch-order-primary', next[2]);
        button.type = 'button';
        button.addEventListener('click', async () => {
          if (!noteIsSaved()) return;
          if (next[3] === 'review') {
            const review = await window.GIMAE_UI?.input({ tone: 'warning', title: 'Revisar captura tardía',
              message: `Confirma en PayPal la captura ${order.paypal_capture_id} y la disponibilidad del pedido ${reference(order)}. Registra tu decisión para la cola.`,
              label: 'Nota de revisión (mínimo 8 caracteres)', value: '', confirmText: 'Autorizar preparación' });
            if (review === null || review === undefined) return;
            if (review.trim().length < 8 || review.length > 300) {
              feedback('warning', 'Nota requerida', 'Explica la revisión entre 8 y 300 caracteres.', notice); return;
            }
            button.disabled = true;
            try {
              const { data: result, error: functionError } = await client.functions.invoke('merch-reservation-review',
                { body: { orderId: order.id, note: review.trim() } });
              if (functionError || !result?.reviewed) throw functionError || new Error(result?.error || 'Sin confirmación');
              await renderMerchOrders(client, records, notice, `card:${order.id}`);
              feedback('success', 'Revisión guardada', `El pedido ${reference(order)} vuelve a «Por preparar».`, notice);
            } catch (cause) {
              feedback('error', 'No se pudo autorizar', cause.message, notice); button.disabled = false;
            }
            return;
          }
          if (next[3] === 'recheck') {
            button.disabled = true; button.textContent = 'Revisando stock…'; card.setAttribute('aria-busy', 'true');
            try {
              const { data: result, error: functionError } = await client.functions.invoke('merch-stock-recheck', { body: { orderId: order.id } });
              if (functionError) throw functionError;
              if (!result?.stockState) throw new Error('No se recibió el resultado de la revisión.');
              await renderMerchOrders(client, records, notice, `card:${order.id}`);
              feedback(result.stockState === 'allocated' ? 'success' : 'warning',
                result.stockState === 'allocated' ? 'Stock completo' : 'Aún faltan unidades',
                result.stockState === 'allocated' ? `El pedido ${reference(order)} vuelve a «Por preparar».` : 'Revisa las unidades pendientes en la tarjeta.', notice);
            } catch (cause) {
              const inline = card.querySelector('.merch-order-feedback');
              inline.textContent = `No se pudo revisar el stock. ${cause.message}`; inline.hidden = false;
              feedback('error', 'No se pudo revisar el stock', cause.message, notice);
              button.disabled = false; button.textContent = next[2]; card.removeAttribute('aria-busy');
            }
            return;
          }
          if (next[3] === 'handed_over') {
            const accepted = await window.GIMAE_UI?.confirm({ tone: 'warning', title: '¿Ya entregaste este pedido?',
              message: `Vas a registrar la entrega del pedido ${reference(order)} a ${order.buyer_name}.`,
              detail: 'Hazlo solo después de la entrega en persona. Este registro no envía un aviso automático al comprador.',
              confirmText: 'Sí, registrar entrega', cancelText: 'Volver al pedido' });
            if (!accepted) return;
          }
          await saveChange(order, { fulfillment_status: next[3] }, button, next[3] === 'handed_over' ? 'Entrega registrada' : 'Paso actualizado',
            `El pedido ${reference(order)} ahora está «${labels[next[3]]}».`);
        });
        action.append(button);
      }
      card.append(action);
    }
    if (isWork(order)) {
      const hold = node('button', 'merch-order-hold', '¿Hay un problema? Poner en revisión');
      hold.type = 'button';
      hold.addEventListener('click', async () => {
        if (!noteIsSaved()) return;
        const reason = await window.GIMAE_UI?.input({ tone: 'warning', title: 'Pausar la preparación',
          message: `Explica qué impide continuar con el pedido ${reference(order)}. Solo el equipo verá la nota.`,
          label: 'Motivo para el equipo', value: order.fulfillment_note || '', confirmText: 'Guardar y poner en revisión' });
        if (reason === null || reason === undefined) return;
        if (!reason.trim()) { feedback('warning', 'Falta el motivo', 'Escribe una nota breve antes de poner el pedido en revisión.', notice); return; }
        if (reason.length > 500) { feedback('warning', 'Nota demasiado larga', 'Usa como máximo 500 caracteres.', notice); return; }
        await saveChange(order, { fulfillment_status: 'on_hold', fulfillment_note: reason }, hold,
          'Pedido en revisión', `El pedido ${reference(order)} quedó pausado con una nota para el equipo.`);
      });
      card.append(hold);
    }
    if (!isLegacy(order)) body.append(node('p', 'merch-order-stock-note', order.stock_state === 'allocated'
      ? 'Inventario: todas las unidades están asignadas y descontadas.' : 'Inventario: revisa las unidades faltantes en cada producto.'));
    const payment = node('dl', 'merch-order-payment');
    for (const [label, value] of [['Orden PayPal', order.paypal_order_id], ['Captura PayPal', order.paypal_capture_id], ['ID interno', order.id]]) {
      payment.append(node('dt', '', label), node('dd', '', value || '—'));
    }
    body.append(payment);
    const noteLabel = node('label', 'merch-order-note');
    noteLabel.append(node('span', '', 'Nota interna · visible solo para el equipo'));
    const note = node('textarea');
    note.maxLength = 500;
    note.rows = 3;
    note.value = order.fulfillment_note || '';
    note.placeholder = 'Ej.: avisar al comprador cuando esté listo';
    noteLabel.append(note);
    const save = node('button', 'merch-order-save-note', 'Guardar nota');
    save.type = 'button';
    save.disabled = true;
    note.addEventListener('input', () => { save.disabled = note.value.trim() === (order.fulfillment_note || ''); });
    save.addEventListener('click', () => saveChange(order, { fulfillment_note: note.value.trim() }, save,
      'Nota guardada', `La nota interna del pedido ${reference(order)} quedó actualizada.`, 'note'));
    body.append(noteLabel, save);
    if (order.handed_over_at) body.append(node('small', 'merch-order-history', `Entregado: ${date.format(new Date(order.handed_over_at))}`));
    else if (order.ready_at && order.fulfillment_status === 'ready') body.append(node('small', 'merch-order-history', `Listo desde: ${date.format(new Date(order.ready_at))}`));
    detail.append(body);
    card.append(detail);
    const inline = node('p', 'merch-order-feedback');
    inline.setAttribute('role', 'alert'); inline.hidden = true;
    card.append(inline);
    return card;
  }
}
