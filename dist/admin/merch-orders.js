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
const isStarken = order => order.delivery_method === 'starken_por_pagar';
const labelFor = order => isStarken(order) ? {
  ready: 'Listo para Starken', handed_over: 'Entregado a Starken'
}[order.fulfillment_status] || labels[order.fulfillment_status] : labels[order.fulfillment_status];
const opened = new Set();
let selectedFilter = 'work';
let firstOpen = true;
let selectedEnvironment = 'live';
const isPractice = order => order.order_environment === 'test';
const isLegacy = order => !isPractice(order) && order.stock_state === 'legacy_review';
const isAttention = order => order.fulfillment_status === 'on_hold' && !isLegacy(order);
const isWork = order => ['new', 'preparing', 'ready'].includes(order.fulfillment_status);
const reference = order => order.paypal_order_id || order.webpay_buy_order || order.id.slice(0, 8).toUpperCase();
const feedback = (tone, title, message, notice) => {
  notice(`${title}. ${message}`);
  window.GIMAE_UI?.toast({ tone, title, message, duration: tone === 'error' ? 8000 : 5500 });
};

export async function renderMerchOrders(client, records, notice, focus = null) {
  const practice = selectedEnvironment === 'test';
  const { data, error } = await client.from('merch_orders')
    .select('id,buyer_name,buyer_contact,delivery_method,shipping_details,starken_waybill,test_starken_waybill,items,total_clp,total_usd_cents,payment_provider,paypal_order_id,paypal_capture_id,webpay_buy_order,webpay_authorization_code,paid_at,order_environment,stock_state,stock_allocations,reservation_issue,reservation_reviewed_at,fulfillment_status,fulfillment_note,fulfillment_updated_at,ready_at,handed_over_at,test_fulfillment_status,test_fulfillment_note,test_fulfillment_updated_at,test_ready_at,test_handed_over_at')
    .eq('status', 'paid').eq('order_environment', selectedEnvironment)
    .order('paid_at', { ascending: false }).limit(100);
  if (error) throw error;
  const orders = (data || []).map(order => practice ? {
    ...order, fulfillment_status: order.test_fulfillment_status || 'new',
    fulfillment_note: order.test_fulfillment_note || '',
    fulfillment_updated_at: order.test_fulfillment_updated_at,
    ready_at: order.test_ready_at, handed_over_at: order.test_handed_over_at,
  } : order);
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
  records.replaceChildren(node('h2', 'merch-orders-section-title', practice ? 'Práctica con pedidos Sandbox' : 'Pedidos pagados'));
  const shell = node('div', 'merch-orders');
  const environment = node('div', 'merch-orders-environment');
  environment.setAttribute('role', 'group');
  environment.setAttribute('aria-label', 'Tipo de bandeja');
  for (const [value, label] of [['live', 'Pedidos reales'], ['test', 'Practicar con Sandbox']]) {
    const choice = node('button', '', label);
    choice.type = 'button';
    choice.setAttribute('aria-pressed', String(selectedEnvironment === value));
    choice.addEventListener('click', async () => {
      if (selectedEnvironment === value) return;
      selectedEnvironment = value;
      selectedFilter = 'work'; firstOpen = true;
      try { await renderMerchOrders(client, records, notice, 'environment'); }
      catch (cause) { feedback('error', 'No se pudo abrir la bandeja', cause.message, notice); }
    });
    environment.append(choice);
  }
  shell.append(environment);
  if (practice) {
    const banner = node('p', 'merch-orders-practice-banner',
      'MODO PRÁCTICA · Solo pedidos pagados en Sandbox. Estas etapas y notas se guardan aparte: no preparan productos, no registran entregas reales y no modifican el inventario. Algunas pruebas antiguas pudieron descontar stock al pagar; avanzar aquí no lo cambia.');
    banner.setAttribute('role', 'note');
    shell.append(banner);
  }
  const intro = node('div', 'merch-orders-intro');
  const copy = node('div');
  copy.append(node('p', 'merch-orders-eyebrow', practice ? 'GIMAE! · ENSAYO SANDBOX' : 'GIMAE! · MESA DE PEDIDOS'),
    node('h3', '', practice ? 'Ensaya el recorrido completo' : 'Cada venta, un siguiente paso'),
    node('p', '', practice
      ? 'Usa pagos de prueba confirmados para practicar cada etapa, pausar un pedido y guardar notas. Las acciones quedan solo en este recorrido de práctica.'
      : 'Aquí solo aparecen pagos reales confirmados. Revisa en cada tarjeta si corresponde retiro o despacho con Starken antes de preparar.'));
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
  guide.append(node('span', '', '✦'), document.createTextNode(practice
    ? ' Ensaya el recorrido de retiro o Starken: revisa → prepara → marca listo → registra el paso final simulado.'
    : ' Revisa productos y destino → prepara → marca listo → registra retiro o entrega a Starken según la tarjeta.'));
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
    count.textContent = `${visible.length} de ${orders.length} ${practice ? 'pruebas' : 'ventas'} recientes · máximo 100`;
    filters.querySelectorAll('button').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.filter === selectedFilter)));
    if (!visible.length) list.append(node('p', 'merch-orders-empty', selectedFilter === 'work'
      ? practice ? 'No hay prácticas pendientes. Crea una compra Sandbox confirmada o revisa «Finalizados».' : '♡ Todo al día: no hay ventas pendientes de preparación o despacho.'
      : 'No hay pedidos en este grupo.'));
    for (const order of visible) list.append(orderCard(order));
  };
  for (const [value, label] of [['work','Por gestionar'],['attention','Necesitan atención'],['done',practice ? 'Finalizados en práctica' : 'Finalizados'],['legacy','Ventas anteriores'],['all','Todos']]) {
    if (practice && value === 'legacy') continue;
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
  notice(practice ? `${orders.length} pedidos de prueba confirmados. Las acciones son solo de práctica.` : `${orders.length} ventas confirmadas recientes. Elige una tarjeta para continuar su preparación.`);
  if (focus === 'refresh') refresh.focus({ preventScroll: true });
  else if (focus === 'environment') environment.querySelector('button[aria-pressed="true"]')?.focus({ preventScroll: true });
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
      let query = client.from('merch_orders').update(practice ? {
        ...(Object.hasOwn(changes, 'fulfillment_status') ? { test_fulfillment_status: changes.fulfillment_status } : {}),
        ...(Object.hasOwn(changes, 'fulfillment_note') ? { test_fulfillment_note: changes.fulfillment_note } : {}),
        ...(Object.hasOwn(changes, 'starken_waybill') ? { test_starken_waybill: changes.starken_waybill } : {}),
      } : changes).eq('id', order.id).eq('order_environment', practice ? 'test' : 'live')
        .eq('status', 'paid');
      query = practice
        ? (order.test_fulfillment_status === null ? query.is('test_fulfillment_status', null) : query.eq('test_fulfillment_status', order.test_fulfillment_status))
          .eq('test_fulfillment_note', order.test_fulfillment_note || '')
        : query.eq('fulfillment_status', order.fulfillment_status).eq('fulfillment_note', order.fulfillment_note || '');
      const { data: updated, error: updateError } = await query.select('id');
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
    const card = node('article', `merch-order is-${isLegacy(order) ? 'legacy' : order.fulfillment_status}${practice ? ' is-practice' : ''}`);
    card.dataset.id = order.id;
    const head = node('div', 'merch-order-head');
    const title = node('div', 'merch-order-identity');
    title.append(node('span', 'merch-order-date', `✦ ${practice ? 'Pago de prueba confirmado' : 'Pago confirmado'} · ${order.paid_at ? date.format(new Date(order.paid_at)) : 'fecha pendiente'}`));
    const ref = node('strong', 'merch-order-reference', `Pedido ${reference(order)}`);
    ref.tabIndex = -1;
    title.append(ref);
    const badge = node('span', `merch-order-badge is-${isLegacy(order) ? 'legacy' : order.fulfillment_status}`,
      isLegacy(order) ? 'Auditoría manual' : `${practice ? 'Práctica · ' : ''}${labelFor(order) || 'Revisar'}`);
    head.append(title, badge);
    const buyer = node('div', 'merch-order-buyer');
    const buyerCopy = node('div');
    buyerCopy.append(node('small', '', 'COMPRADOR'), node('strong', '', order.buyer_name), node('span', '', order.buyer_contact));
    buyer.append(buyerCopy, node('strong', 'merch-order-total', money.format(order.total_clp)));
    card.append(head, buyer);
    const method = node('div', `merch-order-method${isStarken(order) ? ' is-shipping' : ''}`);
    method.append(node('strong', '', isStarken(order) ? '↗ Starken · POR PAGAR' : '♡ Retiro presencial'),
      node('span', '', isStarken(order)
        ? `${order.shipping_details?.commune || 'Comuna sin datos'}, ${order.shipping_details?.region || 'región sin datos'} · el destinatario paga el transporte a Starken`
        : 'Coordina el lugar y horario con el comprador.'));
    card.append(method);
    const detail = node('details', 'merch-order-details');
    if (opened.has(order.id)) detail.open = true;
    detail.addEventListener('toggle', () => detail.open ? opened.add(order.id) : opened.delete(order.id));
    detail.append(node('summary', '', practice ? 'Ver nota de práctica y datos del pago' : 'Ver nota interna y datos del pago'));
    function noteIsSaved() {
      if (note.value.trim() === (order.fulfillment_note || '')) return true;
      detail.open = true;
      note.focus();
      feedback('warning', 'Hay una nota sin guardar', 'Guarda la nota interna antes de cambiar este pedido.', notice);
      return false;
    }
    const body = node('div', 'merch-order-body');
    if (isStarken(order)) {
      const shipping = order.shipping_details || {};
      const destination = node('section', 'merch-order-destination');
      destination.append(node('h5', '', 'Datos para entregar el paquete a Starken'),
        node('p', '', 'El flete va POR PAGAR: no cobres el transporte con los productos. Confirma cobertura y datos antes de despachar.'));
      const details = node('dl');
      for (const [label, value] of [['Destinatario', shipping.name], ['RUT', shipping.rut],
        ['Celular', shipping.phone], ['Correo', shipping.email], ['Región', shipping.region],
        ['Comuna', shipping.commune], ['Dirección', [shipping.street, shipping.number, shipping.unit].filter(Boolean).join(' ')],
        ['Indicaciones', shipping.instructions]].filter(([, value]) => Boolean(value))) {
        details.append(node('dt', '', label), node('dd', '', value));
      }
      destination.append(details);
      body.append(destination);
    }
    if (practice) body.append(node('p', 'merch-order-stock-note is-practice',
      'Sandbox · recorre las etapas con los datos de esta compra, sin preparar ni entregar los productos. El inventario no cambia al ensayar.'));
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
      if (!practice && !isLegacy(order)) line.append(node('small', `merch-order-stock${allocation?.shortage ? ' is-short' : ''}`,
        allocation ? (allocation.shortage ? `Faltan ${allocation.shortage}` : `${allocation.allocated} asignadas`) : 'Stock pendiente'));
      products.append(line);
    }
    productArea.append(products);
    card.append(productArea);
    if (!practice && (isLegacy(order) || order.stock_state === 'shortage' || order.fulfillment_status === 'on_hold') ||
      practice && order.fulfillment_status === 'on_hold') {
      const warning = node('div', 'merch-order-warning');
      const copy = node('div');
      if (practice) copy.append(node('strong', '', 'Práctica en pausa'), node('p', '', `Motivo de práctica: ${order.fulfillment_note || 'No se registró un motivo.'} Reanuda el ensayo cuando quieras.`));
      else if (isLegacy(order)) copy.append(node('strong', '', 'Venta anterior al control de stock'), node('p', '', 'No se descontaron unidades automáticamente. Una administradora debe comprobar el inventario y la entrega manualmente; esta tarjeta no permite continuar la preparación.'));
      else if (order.stock_state === 'shortage') copy.append(node('strong', '', order.reservation_issue === 'late_capture' ? 'Pago tardío: revisar antes de preparar' : 'Faltan unidades para completar el pedido'), node('p', '', 'El pago está confirmado. Repón y confirma el inventario en Merch; después vuelve a revisar el stock aquí.'));
      else if (order.reservation_issue === 'late_capture') copy.append(node('strong', '', 'Pago confirmado después de vencer la reserva'),
        node('p', '', `Comprueba la captura en ${order.payment_provider === 'webpay' ? 'Transbank' : 'PayPal'} y revisa las unidades asignadas. Registra una nota antes de empezar la preparación.`));
      else copy.append(node('strong', '', 'Preparación pausada'), node('p', '', `Motivo interno: ${order.fulfillment_note || 'No se registró un motivo.'} Reanuda cuando esté resuelto.`));
      warning.append(node('span', 'merch-order-warning-icon', '!'), copy);
      card.append(warning);
    }
    if (!isLegacy(order) && order.fulfillment_status !== 'on_hold') {
      const progress = node('ol', 'merch-order-progress');
      const active = stepIndex[order.fulfillment_status] ?? 0;
      (isStarken(order) ? ['Pagado', 'Preparando', 'Listo para despacho', 'Entregado a Starken'] : steps).forEach((label, index) => {
        const step = node('li', index < active ? 'is-complete' : index === active ? 'is-current' : '');
        step.append(node('span', 'merch-order-progress-dot', index < active ? '✓' : index + 1), node('span', '', practice && index === 3 ? `${label} · simulado` : label));
        if (index === active) step.setAttribute('aria-current', 'step');
        progress.append(step);
      });
      card.append(progress);
    }
    const actions = {
      new: ['Comprueba productos y cantidades', 'Al empezar a reunirlos, registra que el pedido está en preparación.', 'Empezar preparación', 'preparing'],
      preparing: ['Prepara y revisa el pedido', isStarken(order) ? 'Cuando esté embalado, márcalo listo para llevar a Starken.' : 'Cuando todas las unidades estén separadas, márcalo como listo.', 'Marcar como listo', 'ready'],
      ready: isStarken(order)
        ? ['Lleva el paquete a Starken', 'Entrega el paquete como POR PAGAR. Registra el número de la orden de flete solo después de recibir el comprobante.', 'Registrar entrega a Starken', 'handed_over']
        : ['Espera el retiro', 'Registra la entrega únicamente después de entregar el pedido en persona.', 'Confirmar entrega', 'handed_over'],
      handed_over: isStarken(order)
        ? ['Paquete entregado a Starken', practice ? 'Fue una simulación. No contactes al destinatario.' : 'Copia el aviso y adjunta una foto del comprobante al enviarlo al destinatario. El seguimiento posterior corresponde a Starken.']
        : ['Pedido entregado', 'La entrega quedó registrada. No hay más pasos en esta bandeja.']
    };
    const next = isLegacy(order) ? null : practice && order.fulfillment_status === 'on_hold'
      ? ['Ensayo en pausa', 'Cuando termines de revisar el motivo, retoma la práctica desde «Por preparar».', 'Reanudar práctica', 'new']
      : order.fulfillment_status === 'on_hold'
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
        const button = node('button', 'merch-order-primary', practice && next[3] === 'handed_over' ? 'Simular entrega' : next[2]);
        button.type = 'button';
        button.addEventListener('click', async () => {
          if (!noteIsSaved()) return;
          if (next[3] === 'review') {
            const review = await window.GIMAE_UI?.input({ tone: 'warning', title: 'Revisar captura tardía',
              message: `Confirma en ${order.payment_provider === 'webpay' ? 'Transbank' : 'PayPal'} el pago ${order.webpay_authorization_code || order.paypal_capture_id} y la disponibilidad del pedido ${reference(order)}. Registra tu decisión para la cola.`,
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
            if (isStarken(order)) {
              const waybill = await window.GIMAE_UI?.input({ tone: 'warning', title: practice ? 'Simular entrega a Starken' : 'Registrar entrega a Starken',
                message: practice ? 'Escribe un número de flete de ejemplo. No entregues productos reales.' : 'Solo registra el número después de entregar el paquete y recibir el comprobante de Starken.',
                label: practice ? 'N.º de flete de práctica' : 'N.º de orden de flete del comprobante', value: '', confirmText: practice ? 'Continuar simulación' : 'Revisar y confirmar' });
              if (waybill === null || waybill === undefined) return;
              const code = waybill.trim().toUpperCase();
              if (!/^[A-Z0-9-]{5,40}$/.test(code)) {
                feedback('warning', 'Revisa el número de flete', 'Usa entre 5 y 40 letras, números o guiones tal como aparece en el comprobante.', notice); return;
              }
              const accepted = await window.GIMAE_UI?.confirm({ tone: 'warning', title: practice ? '¿Simular el despacho?' : '¿Ya entregaste el paquete a Starken?',
                message: `Pedido ${reference(order)} · orden de flete ${code}.`,
                detail: practice ? 'Solo registra la simulación Sandbox. No avisa al destinatario.' : 'Al confirmar, el pedido quedará como entregado a Starken. Después copia el aviso y adjunta una foto del comprobante al enviarlo al destinatario.',
                confirmText: practice ? 'Sí, simular despacho' : 'Sí, registrar despacho', cancelText: 'Volver al pedido' });
              if (!accepted) return;
              await saveChange(order, { fulfillment_status: 'handed_over', starken_waybill: code }, button,
                practice ? 'Despacho simulado' : 'Entregado a Starken', `Orden de flete ${code}. ${practice ? 'No envíes avisos reales.' : 'Envía al destinatario el aviso y una foto del comprobante.'}`);
              return;
            }
            const accepted = await window.GIMAE_UI?.confirm({ tone: 'warning', title: '¿Ya entregaste este pedido?',
              message: practice ? `Vas a ensayar la entrega del pedido ${reference(order)} a ${order.buyer_name}.` : `Vas a registrar la entrega del pedido ${reference(order)} a ${order.buyer_name}.`,
              detail: practice ? 'Es una simulación Sandbox: no registra una entrega real ni avisa al comprador.' : 'Hazlo solo después de la entrega en persona. Este registro no envía un aviso automático al comprador.',
              confirmText: practice ? 'Sí, simular entrega' : 'Sí, registrar entrega', cancelText: 'Volver al pedido' });
            if (!accepted) return;
          }
          await saveChange(order, { fulfillment_status: next[3] }, button, next[3] === 'handed_over' ? practice ? 'Entrega simulada' : 'Entrega registrada' : 'Paso actualizado',
            `El pedido ${reference(order)} ahora está «${labelFor({ ...order, fulfillment_status: next[3] })}»${practice ? ' en la práctica' : ''}.`);
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
        const reason = await window.GIMAE_UI?.input({ tone: 'warning', title: practice ? 'Pausar el ensayo' : 'Pausar la preparación',
          message: practice ? `Anota un motivo de práctica para ${reference(order)}. No se pausa ningún pedido real.` : `Explica qué impide continuar con el pedido ${reference(order)}. Solo el equipo verá la nota.`,
          label: 'Motivo para el equipo', value: order.fulfillment_note || '', confirmText: 'Guardar y poner en revisión' });
        if (reason === null || reason === undefined) return;
        if (!reason.trim()) { feedback('warning', 'Falta el motivo', 'Escribe una nota breve antes de poner el pedido en revisión.', notice); return; }
        if (reason.length > 500) { feedback('warning', 'Nota demasiado larga', 'Usa como máximo 500 caracteres.', notice); return; }
        await saveChange(order, { fulfillment_status: 'on_hold', fulfillment_note: reason }, hold,
          'Pedido en revisión', `El pedido ${reference(order)} quedó pausado con una nota para el equipo.`);
      });
      card.append(hold);
    }
    if (!practice && !isLegacy(order)) body.append(node('p', 'merch-order-stock-note', order.stock_state === 'allocated'
      ? 'Inventario: todas las unidades están asignadas y descontadas.' : 'Inventario: revisa las unidades faltantes en cada producto.'));
    const payment = node('dl', 'merch-order-payment');
    for (const [label, value] of [['Orden PayPal', order.paypal_order_id], ['Captura PayPal', order.paypal_capture_id], ['Orden Webpay', order.webpay_buy_order], ['Autorización Webpay', order.webpay_authorization_code], ['ID interno', order.id]].filter(([, value]) => Boolean(value))) {
      payment.append(node('dt', '', label), node('dd', '', value || '—'));
    }
    body.append(payment);
    if (isStarken(order) && order.fulfillment_status === 'handed_over') {
      const code = practice ? order.test_starken_waybill : order.starken_waybill;
      const receipt = node('div', 'merch-order-receipt');
      receipt.append(node('strong', '', `Orden de flete: ${code || 'Sin número registrado'}`));
      if (!practice && code) {
        const tracking = node('a', '', 'Abrir seguimiento oficial ↗');
        tracking.href = 'https://www.starken.cl/SEGUIMIENTO'; tracking.target = '_blank'; tracking.rel = 'noopener noreferrer';
        const message = `Hola ${order.buyer_name}, tu pedido ${reference(order)} ya fue entregado a Starken. El envío es POR PAGAR: pagarás el transporte directamente a Starken al recibirlo. Número de orden de flete: ${code}. Puedes seguirlo en https://www.starken.cl/SEGUIMIENTO . Adjuntamos el comprobante de entrega a Starken. Si necesitas ayuda, responde a este mensaje. — Gimae`;
        const copy = node('button', '', 'Copiar aviso para el destinatario'); copy.type = 'button';
        copy.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(message); feedback('success', 'Aviso copiado', 'Pégalo en tu canal de contacto y adjunta una foto del comprobante. No se envió automáticamente.', notice); }
          catch { feedback('error', 'No se pudo copiar', 'Copia el número de flete del comprobante y redacta el aviso manualmente.', notice); }
        });
        receipt.append(tracking, copy, node('p', '', 'El texto queda copiado; adjunta manualmente la foto del comprobante y verifica que el mensaje se haya enviado.'));
      } else if (practice) receipt.append(node('p', '', 'Solo práctica: no envíes este número al destinatario.'));
      body.append(receipt);
    }
    const noteLabel = node('label', 'merch-order-note');
    noteLabel.append(node('span', '', practice ? 'Nota de práctica · visible solo para el equipo' : 'Nota interna · visible solo para el equipo'));
    const note = node('textarea');
    note.maxLength = 500;
    note.rows = 3;
    note.value = order.fulfillment_note || '';
    note.placeholder = practice ? 'Ej.: ensayamos cómo separar este producto' : 'Ej.: avisar al comprador cuando esté listo';
    noteLabel.append(note);
    const save = node('button', 'merch-order-save-note', 'Guardar nota');
    save.type = 'button';
    save.disabled = true;
    note.addEventListener('input', () => { save.disabled = note.value.trim() === (order.fulfillment_note || ''); });
    save.addEventListener('click', () => saveChange(order, { fulfillment_note: note.value.trim() }, save,
      'Nota guardada', `La nota interna del pedido ${reference(order)} quedó actualizada.`, 'note'));
    body.append(noteLabel, save);
    if (order.handed_over_at) body.append(node('small', 'merch-order-history', `${isStarken(order) ? practice ? 'Despacho simulado' : 'Entregado a Starken' : practice ? 'Entrega simulada' : 'Entregado'}: ${date.format(new Date(order.handed_over_at))}`));
    else if (order.ready_at && order.fulfillment_status === 'ready') body.append(node('small', 'merch-order-history', `Listo desde: ${date.format(new Date(order.ready_at))}`));
    detail.append(body);
    card.append(detail);
    const inline = node('p', 'merch-order-feedback');
    inline.setAttribute('role', 'alert'); inline.hidden = true;
    card.append(inline);
    return card;
  }
}
