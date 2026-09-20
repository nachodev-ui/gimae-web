/*
 * TIENDA ESTÁTICA GIMAE
 * - Productos, precios, entregas y medios de pago se leen solo desde content.js.
 * - El carrito guarda únicamente IDs, variantes y cantidades; los precios se recalculan al cargar.
 * - Completa los datos bancarios, stock, Client ID público y tipo de cambio exclusivamente en content.js.
 * - Nunca pegues aquí un secret de PayPal, contraseña, token o dato privado.
 */
(() => {
  'use strict';

  const config = window.GIMAE || {};
  const catalog = Array.isArray(config.merch) ? config.merch.filter(product => product?.active !== false) : [];
  const CART_KEY = 'gimae-shop-cart-v1';
  const SHIPPING_KEY = 'gimae-shop-shipping-v1';
  const ORDERS_KEY = 'gimae-shop-orders-v1';
  const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const productGrid = document.querySelector('#shop-product-grid');

  if (!productGrid) return;

  const cartDialog = document.querySelector('#cart-dialog');
  const productDialog = document.querySelector('#product-dialog');
  const checkoutDialog = document.querySelector('#checkout-dialog');
  const orderDialog = document.querySelector('#order-dialog');
  const cartItems = document.querySelector('#cart-items');
  const cartEmpty = document.querySelector('#cart-empty');
  const cartSubtotal = document.querySelector('#cart-subtotal');
  const cartShippingCost = document.querySelector('#cart-shipping-cost');
  const cartTotal = document.querySelector('#cart-total');
  const shippingSelect = document.querySelector('#shipping-option');
  const shippingDetail = document.querySelector('#shipping-detail');
  const cartError = document.querySelector('#cart-error');
  const checkoutError = document.querySelector('#checkout-error');
  const checkoutStatus = document.querySelector('#checkout-status');
  const paymentMethodList = document.querySelector('#payment-method-list');
  const preparePayment = document.querySelector('#prepare-payment');
  const paypalButtons = document.querySelector('#paypal-buttons');
  const paypalConversion = document.querySelector('#paypal-conversion');
  const paypalRisk = document.querySelector('#paypal-risk');
  const storageNote = document.querySelector('#cart-storage-note');
  const configNote = document.querySelector('#shop-config-note');
  const pendingOrder = document.querySelector('#pending-order');
  const reopenOrder = document.querySelector('#reopen-order');
  const orderSummary = document.querySelector('#order-summary');
  const dialogOpeners = new WeakMap();
  let storageAvailable = testStorage();
  let cart = readCart();
  let selectedShippingId = readShipping();
  let paypalPromise = null;
  let paypalDraft = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function cleanText(value, maxLength = 120) {
    return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function testStorage() {
    try {
      localStorage.setItem('__gimae_shop_test__', '1');
      localStorage.removeItem('__gimae_shop_test__');
      return true;
    } catch (error) {
      return false;
    }
  }

  function storageGet(key, fallback) {
    if (!storageAvailable) return fallback;
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (error) { storageAvailable = false; return fallback; }
  }

  function storageSet(key, value) {
    if (!storageAvailable) return false;
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { storageAvailable = false; storageNote.hidden = false; return false; }
  }

  function optionsFor(product) {
    if (Array.isArray(product.prices) && product.prices.length) {
      return product.prices.map((option, index) => ({
        id: cleanText(option.id || `option-${index + 1}`, 40),
        label: cleanText(option.label || `Opción ${index + 1}`, 60),
        price: positiveNumber(option.value)
      })).filter(option => option.id && option.price !== null);
    }
    if (product.variantSource === 'members') {
      return (config.members || []).map(member => ({
        id: cleanText(member.id, 40),
        label: cleanText(`${member.name} · ${member.colorLabel}`, 60),
        price: positiveNumber(product.price)
      })).filter(option => option.id && option.price !== null);
    }
    const price = positiveNumber(product.price);
    return price === null ? [] : [{ id: 'default', label: '', price }];
  }

  function productById(productId) {
    return catalog.find(product => String(product.id) === String(productId));
  }

  function optionFor(product, optionId) {
    return optionsFor(product).find(option => option.id === optionId);
  }

  function stockFor(product, optionId) {
    const variantStock = product.stockByVariant?.[optionId];
    if (Number.isInteger(variantStock) && variantStock >= 0) return variantStock;
    return Number.isInteger(product.stock) && product.stock >= 0 ? product.stock : null;
  }

  function stockLabel(product, optionId) {
    const stock = stockFor(product, optionId);
    if (stock === null) return 'Disponibilidad por confirmar';
    if (stock === 0) return 'Agotado';
    return stock <= 5 ? `Quedan ${stock}` : 'Disponible';
  }

  function cartKey(productId, optionId) {
    return `${productId}::${optionId}`;
  }

  function validateEntry(entry) {
    const product = productById(cleanText(entry?.productId, 40));
    if (!product) return null;
    const option = optionFor(product, cleanText(entry?.optionId, 40));
    if (!option) return null;
    const stock = stockFor(product, option.id);
    let quantity = Math.max(1, Math.min(99, Math.trunc(Number(entry.quantity) || 1)));
    if (stock !== null) quantity = Math.min(quantity, stock);
    if (quantity < 1) return null;
    return { productId: String(product.id), optionId: option.id, quantity };
  }

  function readCart() {
    const stored = storageGet(CART_KEY, []);
    if (!Array.isArray(stored)) return [];
    const unique = new Map();
    stored.forEach(raw => {
      const entry = validateEntry(raw);
      if (entry) unique.set(cartKey(entry.productId, entry.optionId), entry);
    });
    return [...unique.values()];
  }

  function saveCart() {
    cart = cart.map(validateEntry).filter(Boolean);
    storageSet(CART_KEY, cart);
    renderCart();
  }

  function shippingOptions() {
    return (config.SHIPPING?.options || []).filter(option => option?.enabled && cleanText(option.id, 40) && cleanText(option.label, 100));
  }

  function readShipping() {
    if (!storageAvailable) return '';
    try { return cleanText(localStorage.getItem(SHIPPING_KEY) || '', 40); }
    catch (error) { storageAvailable = false; return ''; }
  }

  function selectedShipping() {
    const options = shippingOptions();
    return options.find(option => option.id === selectedShippingId) || options[0] || null;
  }

  function saveShipping() {
    if (!storageAvailable) return;
    try { localStorage.setItem(SHIPPING_KEY, selectedShippingId); }
    catch (error) { storageAvailable = false; storageNote.hidden = false; }
  }

  function cartDetails() {
    return cart.map(entry => {
      const product = productById(entry.productId);
      const option = product && optionFor(product, entry.optionId);
      if (!product || !option) return null;
      return { ...entry, product, option, unitPrice: option.price, lineTotal: option.price * entry.quantity };
    }).filter(Boolean);
  }

  function totals() {
    const subtotal = cartDetails().reduce((sum, item) => sum + item.lineTotal, 0);
    const shipping = selectedShipping();
    const shippingCost = shipping ? positiveNumber(shipping.cost) : null;
    return { subtotal, shippingCost, total: subtotal + (shippingCost ?? 0) };
  }

  function showError(target, message) {
    target.textContent = message;
    target.hidden = !message;
  }

  function showToast(message) {
    let toast = document.querySelector('#shop-toast');
    if (!toast) {
      toast = element('div', 'shop-toast');
      toast.id = 'shop-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  function quantityControl(value = 1, max = 99) {
    const input = element('input', 'shop-quantity');
    input.type = 'number'; input.min = '1'; input.max = String(Math.max(1, max)); input.step = '1'; input.value = String(value);
    input.setAttribute('aria-label', 'Cantidad');
    return input;
  }

  function variantSelect(product, options) {
    const select = element('select', 'shop-variant');
    select.setAttribute('aria-label', cleanText(product.variantLabel || 'Variante', 60));
    options.forEach(option => {
      const item = element('option', '', option.label || 'Única opción');
      item.value = option.id;
      select.append(item);
    });
    return select;
  }

  function displayPrice(product) {
    const prices = [...new Set(optionsFor(product).map(option => option.price))].sort((a, b) => a - b);
    if (!prices.length) return 'Precio por confirmar';
    if (prices.length === 1) return money.format(prices[0]);
    return `${money.format(prices[0])} – ${money.format(prices[prices.length - 1])}`;
  }

  function addToCart(productId, optionId, quantity) {
    const product = productById(productId);
    const option = product && optionFor(product, optionId);
    if (!product || !option) return showToast('Esta opción ya no está disponible.');
    const stock = stockFor(product, optionId);
    const amount = Math.max(1, Math.min(99, Math.trunc(Number(quantity) || 1)));
    const key = cartKey(productId, optionId);
    const existing = cart.find(entry => cartKey(entry.productId, entry.optionId) === key);
    const next = (existing?.quantity || 0) + amount;
    if (stock !== null && next > stock) return showToast(`Solo hay ${stock} unidad${stock === 1 ? '' : 'es'} disponible${stock === 1 ? '' : 's'}.`);
    if (existing) existing.quantity = next;
    else cart.push({ productId: String(productId), optionId, quantity: amount });
    saveCart();
    showToast(`${cleanText(product.name)} se agregó al carrito. ♡`);
  }

  function purchaseControls(product, compact = false) {
    const options = optionsFor(product);
    const controls = element('div', compact ? 'shop-buy-controls compact' : 'shop-buy-controls');
    if (!options.length) {
      controls.append(element('p', 'product-unavailable', 'Precio por confirmar'));
      return controls;
    }
    const select = variantSelect(product, options);
    const firstStock = stockFor(product, options[0].id);
    const quantity = quantityControl(1, firstStock ?? 99);
    const button = element('button', 'button primary add-cart', 'Agregar al carrito');
    button.type = 'button';
    const update = () => {
      const stock = stockFor(product, select.value);
      quantity.max = String(stock ?? 99);
      button.disabled = stock === 0;
      button.textContent = stock === 0 ? 'Agotado' : 'Agregar al carrito';
    };
    select.addEventListener('change', update);
    button.addEventListener('click', () => addToCart(product.id, select.value, quantity.value));
    if (options.length > 1) controls.append(select);
    else select.hidden = true;
    controls.append(quantity, button);
    update();
    return controls;
  }

  function renderProducts() {
    productGrid.replaceChildren();
    catalog.forEach(product => {
      const options = optionsFor(product);
      const card = element('article', `shop-product-card ${cleanText(product.color, 20)}`);
      const top = element('div', 'product-top');
      top.append(element('span', 'product-number', `NO. ${cleanText(product.id, 10)}`), element('span', '', '✧'));
      const title = element('h3', '', cleanText(product.name, 80));
      const note = element('p', 'product-note', cleanText(product.note, 180));
      const price = element('strong', 'shop-product-price', displayPrice(product));
      const stock = element('span', 'shop-stock', options.length ? stockLabel(product, options[0].id) : 'Configuración pendiente');
      const detail = element('button', 'shop-detail-button', 'Ver detalle');
      detail.type = 'button'; detail.setAttribute('aria-haspopup', 'dialog');
      detail.addEventListener('click', () => openProduct(product, detail));
      card.append(top, title, note, price, stock, purchaseControls(product, true), detail);
      productGrid.append(card);
    });
  }

  function openProduct(product, opener) {
    const host = document.querySelector('#product-dialog-content');
    host.replaceChildren();
    host.append(element('p', 'eyebrow', `GIMAE! GOODIE · NO. ${cleanText(product.id, 10)}`));
    const title = element('h2', '', cleanText(product.name, 80)); title.id = 'product-dialog-title';
    const note = element('p', 'product-detail-note', cleanText(product.note, 180));
    const price = element('strong', 'product-detail-price', displayPrice(product));
    const availability = element('p', 'product-detail-stock', `Stock: ${stockLabel(product, optionsFor(product)[0]?.id || 'default')}.`);
    const honest = element('p', 'product-detail-honesty', 'Si la disponibilidad aparece por confirmar, el equipo debe validarla antes de confirmar el pedido.');
    host.append(title, note, price, availability, honest, purchaseControls(product));
    openDialog(productDialog, opener);
  }

  function renderShipping() {
    const options = shippingOptions();
    shippingSelect.replaceChildren();
    if (!options.length) {
      shippingSelect.append(element('option', '', 'Sin opciones configuradas'));
      shippingSelect.disabled = true;
      selectedShippingId = '';
      shippingDetail.textContent = 'Entrega por confirmar.';
      return;
    }
    shippingSelect.disabled = false;
    options.forEach(option => {
      const node = element('option', '', cleanText(option.label, 100));
      node.value = cleanText(option.id, 40);
      shippingSelect.append(node);
    });
    if (!options.some(option => option.id === selectedShippingId)) selectedShippingId = options[0].id;
    shippingSelect.value = selectedShippingId;
    updateShippingDetail();
  }

  function updateShippingDetail() {
    selectedShippingId = shippingSelect.value;
    saveShipping();
    const shipping = selectedShipping();
    const cost = shipping ? positiveNumber(shipping.cost) : null;
    const eta = cleanText(shipping?.eta, 100);
    shippingDetail.textContent = [cost === null ? 'Costo: A coordinar' : `Costo: ${money.format(cost)}`, eta ? `Plazo: ${eta}` : 'Plazo: A coordinar'].join(' · ');
    renderTotals();
  }

  function renderTotals() {
    const current = totals();
    cartSubtotal.textContent = money.format(current.subtotal);
    cartShippingCost.textContent = current.shippingCost === null ? 'A coordinar' : money.format(current.shippingCost);
    cartTotal.textContent = money.format(current.total);
  }

  function updateCartCount() {
    const count = cart.reduce((sum, entry) => sum + entry.quantity, 0);
    document.querySelectorAll('.cart-count').forEach(node => {
      node.textContent = String(count);
      node.setAttribute('aria-label', `${count} producto${count === 1 ? '' : 's'}`);
    });
  }

  function renderCart() {
    cartItems.replaceChildren();
    const details = cartDetails();
    details.forEach(item => {
      const row = element('article', 'cart-item');
      const info = element('div', 'cart-item-info');
      info.append(element('h3', '', cleanText(item.product.name, 80)));
      if (item.option.label) info.append(element('p', '', cleanText(item.option.label, 60)));
      info.append(element('strong', '', money.format(item.unitPrice)));
      const actions = element('div', 'cart-item-actions');
      const stock = stockFor(item.product, item.option.id);
      const quantity = quantityControl(item.quantity, stock ?? 99);
      quantity.addEventListener('change', () => {
        const next = Math.max(1, Math.min(stock ?? 99, Math.trunc(Number(quantity.value) || 1)));
        item.quantity = next;
        const source = cart.find(entry => cartKey(entry.productId, entry.optionId) === cartKey(item.productId, item.optionId));
        if (source) source.quantity = next;
        saveCart();
      });
      const remove = element('button', 'cart-remove', 'Eliminar');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        cart = cart.filter(entry => cartKey(entry.productId, entry.optionId) !== cartKey(item.productId, item.optionId));
        saveCart();
      });
      actions.append(quantity, remove);
      row.append(info, actions, element('strong', 'cart-line-total', money.format(item.lineTotal)));
      cartItems.append(row);
    });
    cartEmpty.hidden = details.length > 0;
    document.querySelector('#start-checkout').disabled = !details.length;
    storageNote.hidden = storageAvailable;
    renderTotals(); updateCartCount(); renderPendingOrder();
  }

  function bankReady() {
    if (!config.PAYMENT_METHODS?.bankTransfer?.enabled) return false;
    const bank = config.BANK_TRANSFER || {};
    return ['accountHolder', 'rut', 'bank', 'accountType', 'accountNumber', 'confirmationEmail'].every(key => {
      const value = cleanText(bank[key], 160);
      return value && value.toUpperCase() !== 'COMPLETAR';
    });
  }

  function paypalReady() {
    const clientId = cleanText(config.PAYPAL_CLIENT_ID, 300);
    return Boolean(config.PAYMENT_METHODS?.paypal?.enabled && clientId && clientId.toUpperCase() !== 'COMPLETAR' && config.PAYPAL_CURRENCY === 'USD' && positiveNumber(config.CLP_PER_USD) > 0);
  }

  function readyMethods() {
    return [bankReady() ? 'bankTransfer' : null, paypalReady() ? 'paypal' : null].filter(Boolean);
  }

  function renderConfigNote() {
    const stockPending = catalog.some(product => optionsFor(product).some(option => stockFor(product, option.id) === null));
    const messages = [];
    if (!readyMethods().length) messages.push('La compra online está en preparación: puedes armar y guardar tu carrito, pero el pago todavía no está habilitado.');
    if (stockPending) messages.push('Algunos productos muestran disponibilidad por confirmar; el equipo debe validarla antes de confirmar el pedido.');
    configNote.textContent = messages.join(' ');
    configNote.hidden = !messages.length;
  }

  function renderPaymentMethods() {
    paymentMethodList.replaceChildren();
    const methods = [
      { id: 'bankTransfer', label: cleanText(config.PAYMENT_METHODS?.bankTransfer?.label || 'Transferencia bancaria', 60), enabled: Boolean(config.PAYMENT_METHODS?.bankTransfer?.enabled), ready: bankReady() },
      { id: 'paypal', label: cleanText(config.PAYMENT_METHODS?.paypal?.label || 'PayPal', 60), enabled: Boolean(config.PAYMENT_METHODS?.paypal?.enabled), ready: paypalReady() }
    ].filter(method => method.enabled);
    methods.forEach((method, index) => {
      const label = element('label', `payment-choice${method.ready ? '' : ' is-disabled'}`);
      const radio = element('input'); radio.type = 'radio'; radio.name = 'paymentMethod'; radio.value = method.id; radio.disabled = !method.ready;
      radio.checked = method.ready && !methods.slice(0, index).some(previous => previous.ready);
      const copy = element('span', '', method.label);
      if (!method.ready) copy.append(element('small', '', 'Configuración pendiente'));
      label.append(radio, copy); paymentMethodList.append(label);
      radio.addEventListener('change', updatePaymentUI);
    });
    updatePaymentUI();
  }

  function chosenPayment() {
    return paymentMethodList.querySelector('input[name="paymentMethod"]:checked')?.value || '';
  }

  function paypalAmount() {
    const rate = positiveNumber(config.CLP_PER_USD);
    return rate ? Math.round((totals().total / rate) * 100) / 100 : null;
  }

  function updatePaymentUI() {
    const method = chosenPayment();
    const isPaypal = method === 'paypal';
    paypalRisk.hidden = !isPaypal;
    paypalConversion.hidden = !isPaypal;
    paypalButtons.hidden = true;
    paypalButtons.replaceChildren();
    paypalDraft = null;
    if (isPaypal) {
      const amount = paypalAmount();
      paypalConversion.textContent = amount === null ? 'Equivalencia pendiente de configuración.' : `${money.format(totals().total)} CLP ≈ ${usd.format(amount)} USD · conversión manual referencial.`;
      preparePayment.textContent = 'Preparar pago con PayPal';
      loadPayPal().catch(() => showError(checkoutError, 'No pudimos cargar PayPal. Intenta nuevamente o elige otro método.'));
    } else {
      preparePayment.textContent = 'Generar instrucciones';
    }
  }

  function buyerData() {
    const nameInput = document.querySelector('#buyer-name');
    const contactInput = document.querySelector('#buyer-contact');
    const name = cleanText(nameInput.value, 60);
    const contact = cleanText(contactInput.value, 80);
    nameInput.value = name; contactInput.value = contact;
    if (name.length < 2) { nameInput.focus(); return { error: 'Escribe tu nombre para continuar.' }; }
    if (contact.length < 3) { contactInput.focus(); return { error: 'Escribe un contacto válido para continuar.' }; }
    return { name, contact };
  }

  function orderCode() {
    const date = new Date();
    const stamp = [String(date.getFullYear()).slice(-2), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(4);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    return `GIM-${stamp}-${[...bytes].map(value => alphabet[value % alphabet.length]).join('')}`;
  }

  function createOrderSnapshot(method, buyer) {
    const shipping = selectedShipping();
    const current = totals();
    return {
      code: orderCode(),
      createdAt: new Date().toISOString(),
      status: method === 'paypal' ? 'preparing_paypal' : 'pending_payment',
      paymentMethod: method,
      buyer: { name: cleanText(buyer.name, 60), contact: cleanText(buyer.contact, 80) },
      shipping: shipping ? { id: cleanText(shipping.id, 40), label: cleanText(shipping.label, 100), cost: positiveNumber(shipping.cost), eta: cleanText(shipping.eta, 100) } : null,
      items: cartDetails().map(item => ({ productId: item.productId, optionId: item.optionId, name: cleanText(item.product.name, 80), option: cleanText(item.option.label, 60), quantity: item.quantity, unitPrice: item.unitPrice })),
      subtotal: current.subtotal,
      total: current.total
    };
  }

  function saveOrder(order) {
    const previous = storageGet(ORDERS_KEY, []);
    const orders = Array.isArray(previous) ? previous.filter(item => item?.code !== order.code) : [];
    orders.unshift(order);
    storageSet(ORDERS_KEY, orders.slice(0, 5));
    renderPendingOrder();
  }

  function latestOrder() {
    const orders = storageGet(ORDERS_KEY, []);
    if (!Array.isArray(orders)) return null;
    return orders.find(order => typeof order?.code === 'string' && Array.isArray(order.items)) || null;
  }

  function renderPendingOrder() {
    pendingOrder.hidden = !latestOrder();
  }

  function loadPayPal() {
    if (!paypalReady()) return Promise.reject(new Error('PAYPAL_NOT_CONFIGURED'));
    if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
    if (paypalPromise) return paypalPromise;
    paypalPromise = new Promise((resolve, reject) => {
      const params = new URLSearchParams({ 'client-id': cleanText(config.PAYPAL_CLIENT_ID, 300), currency: 'USD', intent: 'capture', components: 'buttons' });
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
      script.async = true; script.dataset.gimaePaypal = 'true';
      script.addEventListener('load', () => window.paypal?.Buttons ? resolve(window.paypal) : reject(new Error('PAYPAL_UNAVAILABLE')), { once: true });
      script.addEventListener('error', () => { paypalPromise = null; reject(new Error('PAYPAL_LOAD_ERROR')); }, { once: true });
      document.head.append(script);
    });
    return paypalPromise;
  }

  async function renderPayPal(order) {
    checkoutStatus.textContent = 'Cargando PayPal…';
    showError(checkoutError, '');
    paypalButtons.replaceChildren(); paypalButtons.hidden = false;
    preparePayment.hidden = true;
    try {
      await loadPayPal();
      const amount = paypalAmount();
      if (amount === null || amount <= 0) throw new Error('INVALID_AMOUNT');
      order.paypalUsd = amount;
      paypalDraft = order;
      const buttons = window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', color: 'gold', label: 'paypal' },
        createOrder: (data, actions) => actions.order.create({
          purchase_units: [{ reference_id: order.code, custom_id: order.code, description: `Pedido Gimae ${order.code}`, amount: { currency_code: 'USD', value: amount.toFixed(2) } }],
          application_context: { brand_name: 'Gimae!', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' }
        }),
        onApprove: async (data, actions) => {
          checkoutStatus.textContent = 'Confirmando el pago con PayPal…';
          const capture = await actions.order.capture();
          order.status = 'paypal_verification_pending';
          order.paypalOrderId = cleanText(data.orderID || capture?.id, 80);
          saveOrder(order);
          cart = []; saveCart();
          checkoutStatus.textContent = 'Pago enviado. Gimae debe verificarlo en PayPal antes del despacho.';
          checkoutDialog.close();
          renderOrder(order, preparePayment);
        },
        onCancel: () => {
          checkoutStatus.textContent = 'Pago cancelado. Tu carrito sigue guardado y puedes intentarlo otra vez.';
          preparePayment.hidden = false; paypalButtons.hidden = true;
        },
        onError: () => {
          showError(checkoutError, 'PayPal no pudo completar el pago. No se registró como pagado.');
          checkoutStatus.textContent = '';
          preparePayment.hidden = false; paypalButtons.hidden = true;
        }
      });
      if (buttons.isEligible && !buttons.isEligible()) throw new Error('PAYPAL_INELIGIBLE');
      await buttons.render('#paypal-buttons');
      checkoutStatus.textContent = 'Revisa el equivalente en USD y continúa en PayPal.';
    } catch (error) {
      showError(checkoutError, 'No pudimos preparar PayPal. Intenta nuevamente o usa otro método disponible.');
      checkoutStatus.textContent = '';
      preparePayment.hidden = false; paypalButtons.hidden = true;
    }
  }

  function copyButton(value, label = 'Copiar') {
    const button = element('button', 'copy-button', label); button.type = 'button';
    button.addEventListener('click', async () => {
      const copied = await copyText(value);
      button.textContent = copied ? 'Copiado ✓' : 'No se pudo copiar';
      window.setTimeout(() => { button.textContent = label; }, 1800);
    });
    return button;
  }

  async function copyText(value) {
    const text = cleanText(value, 4000);
    try { await navigator.clipboard.writeText(text); return true; }
    catch (error) {
      const area = element('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.select();
      try { const success = document.execCommand('copy'); area.remove(); return success; }
      catch (fallbackError) { area.remove(); return false; }
    }
  }

  function copyRow(label, value) {
    const row = element('div', 'order-copy-row');
    const text = element('div'); text.append(element('span', '', label), element('strong', '', cleanText(value, 180)));
    row.append(text, copyButton(value));
    return row;
  }

  function orderMessage(order) {
    const lines = [`Hola Gimae ♡ Quiero confirmar mi pedido ${cleanText(order.code, 40)}:`, ''];
    order.items.forEach(item => lines.push(`• ${item.quantity}× ${cleanText(item.name, 80)}${item.option ? ` (${cleanText(item.option, 60)})` : ''} — ${money.format(item.unitPrice * item.quantity)}`));
    lines.push('', `Entrega: ${cleanText(order.shipping?.label || 'A coordinar', 100)}`, `Total productos: ${money.format(Number(order.total) || 0)}`);
    if (order.paymentMethod === 'paypal' && order.paypalOrderId) lines.push(`Pago PayPal: ${cleanText(order.paypalOrderId, 80)}`);
    lines.push(`Nombre: ${cleanText(order.buyer?.name, 60)}`, `Contacto: ${cleanText(order.buyer?.contact, 80)}`);
    return lines.join('\n').slice(0, 3000);
  }

  function contactActions(order) {
    const contacts = config.ORDER_CONTACTS || {};
    const message = orderMessage(order);
    const host = element('div', 'order-contact-actions');
    if (contacts.instagram?.enabled && /^https:\/\//i.test(contacts.instagram.url || '')) {
      const button = element('button', 'button cheki-secondary', 'Copiar y abrir Instagram'); button.type = 'button';
      button.addEventListener('click', async () => { await copyText(message); window.open(contacts.instagram.url, '_blank', 'noopener,noreferrer'); });
      host.append(button);
    }
    const phone = String(contacts.whatsapp?.number || '').replace(/\D/g, '');
    if (contacts.whatsapp?.enabled && phone) {
      const link = element('a', 'button cheki-secondary', 'Abrir WhatsApp'); link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`; host.append(link);
    }
    const email = cleanText(contacts.email?.address, 160);
    if (contacts.email?.enabled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const link = element('a', 'button cheki-secondary', 'Enviar correo');
      link.href = `mailto:${email}?subject=${encodeURIComponent(`Pedido ${order.code}`)}&body=${encodeURIComponent(message)}`; host.append(link);
    }
    return host;
  }

  function renderOrder(order, opener) {
    orderSummary.replaceChildren();
    const status = order.paymentMethod === 'paypal' ? 'Pago enviado · pendiente de verificación' : 'Pendiente de pago';
    orderSummary.append(element('p', 'order-status', status));
    const code = element('div', 'order-code'); code.append(element('span', '', 'Código de pedido'), element('strong', '', cleanText(order.code, 40)), copyButton(order.code));
    orderSummary.append(code);
    const list = element('div', 'order-lines');
    order.items.forEach(item => {
      const row = element('div');
      row.append(element('span', '', `${item.quantity}× ${cleanText(item.name, 80)}${item.option ? ` · ${cleanText(item.option, 60)}` : ''}`), element('strong', '', money.format(item.unitPrice * item.quantity)));
      list.append(row);
    });
    orderSummary.append(list);
    const totalsBox = element('div', 'order-total-box');
    totalsBox.append(element('span', '', 'Total productos'), element('strong', '', money.format(Number(order.total) || 0)), copyButton(String(Math.round(Number(order.total) || 0)), 'Copiar total'));
    orderSummary.append(totalsBox);
    orderSummary.append(element('p', 'order-shipping-copy', `Entrega: ${cleanText(order.shipping?.label || 'A coordinar', 100)} · ${order.shipping?.cost === null ? 'Costo a coordinar' : money.format(order.shipping?.cost || 0)}.`));

    if (order.paymentMethod === 'bankTransfer') {
      const bank = config.BANK_TRANSFER;
      const section = element('section', 'bank-summary');
      section.append(element('h3', '', 'Datos para transferir'));
      [['Titular', bank.accountHolder], ['RUT', bank.rut], ['Banco', bank.bank], ['Tipo de cuenta', bank.accountType], ['Número de cuenta', bank.accountNumber], ['Correo de confirmación', bank.confirmationEmail]].forEach(([label, value]) => section.append(copyRow(label, value)));
      section.append(element('p', 'order-instruction', `Transfiere el monto exacto indicado y usa ${cleanText(order.code, 40)} como glosa o comentario. Si el envío tiene un costo a coordinar, confírmalo antes de transferir. Luego envía el comprobante junto con el código.`));
      orderSummary.append(section);
    } else {
      orderSummary.append(copyRow('ID de orden PayPal', order.paypalOrderId || 'Pendiente'));
      orderSummary.append(element('p', 'order-instruction', 'El pago no implica despacho automático. El equipo de Gimae debe revisar en su panel de PayPal que la operación esté completada y que el monto sea correcto.'));
    }
    orderSummary.append(element('p', 'order-local-note', 'Este resumen existe solo en este navegador. El pedido se confirma cuando el equipo recibe y verifica el comprobante o pago.'));
    const actions = contactActions(order);
    if (actions.children.length) orderSummary.append(actions);
    openDialog(orderDialog, opener || document.querySelector('[data-open-cart]'));
  }

  function openDialog(dialog, opener) {
    if (!dialog || dialog.open) return;
    dialogOpeners.set(dialog, opener instanceof HTMLElement ? opener : document.activeElement);
    dialog.showModal(); document.body.classList.add('dialog-open');
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  document.querySelectorAll('.shop-dialog').forEach(dialog => {
    dialog.querySelector('[data-close-dialog]')?.addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      if (!document.querySelector('.shop-dialog[open]')) document.body.classList.remove('dialog-open');
      const opener = dialogOpeners.get(dialog);
      if (opener?.isConnected) opener.focus();
    });
  });

  document.querySelectorAll('[data-open-cart]').forEach(button => button.addEventListener('click', () => {
    showError(cartError, ''); renderCart(); openDialog(cartDialog, button);
    document.querySelector('#navigation')?.classList.remove('open');
    document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
  }));

  shippingSelect.addEventListener('change', updateShippingDetail);
  document.querySelector('#start-checkout').addEventListener('click', event => {
    showError(cartError, '');
    if (!cartDetails().length) return showError(cartError, 'Tu carrito está vacío.');
    if (!selectedShipping()) return showError(cartError, 'Aún no hay una opción de entrega configurada.');
    if (!readyMethods().length) return showError(cartError, 'Los medios de pago están temporalmente en configuración. Tu carrito quedó guardado.');
    renderPaymentMethods(); checkoutStatus.textContent = ''; showError(checkoutError, ''); preparePayment.hidden = false; paypalButtons.hidden = true;
    cartDialog.close(); window.setTimeout(() => openDialog(checkoutDialog, event.currentTarget), 0);
  });

  document.querySelector('#checkout-form').addEventListener('submit', event => {
    event.preventDefault(); showError(checkoutError, ''); checkoutStatus.textContent = '';
    const buyer = buyerData();
    if (buyer.error) return showError(checkoutError, buyer.error);
    const method = chosenPayment();
    if (!method) return showError(checkoutError, 'Elige una forma de pago disponible.');
    const order = createOrderSnapshot(method, buyer);
    if (method === 'paypal') return renderPayPal(order);
    if (!bankReady()) return showError(checkoutError, 'La transferencia todavía no está configurada.');
    saveOrder(order); cart = []; saveCart(); checkoutDialog.close(); renderOrder(order, preparePayment);
  });

  reopenOrder.addEventListener('click', () => {
    const order = latestOrder();
    if (!order) return;
    cartDialog.close(); window.setTimeout(() => renderOrder(order, reopenOrder), 0);
  });

  renderProducts(); renderShipping(); renderCart(); renderConfigNote();
})();
