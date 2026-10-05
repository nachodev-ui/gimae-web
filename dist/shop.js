/*
 * TIENDA ESTÁTICA GIMAE
 * - Productos y precios se leen desde Supabase, con content.js como respaldo.
 * - Entregas y medios de pago se configuran en content.js.
 * - El carrito guarda únicamente IDs, variantes y cantidades; los precios se recalculan al cargar.
 * - PayPal crea/captura órdenes en Supabase Edge Functions; ningún monto del cliente es confiable.
 * - Nunca pegues aquí un secret de PayPal, contraseña, token o dato privado.
 */
(async () => {
  'use strict';

  await window.GIMAE_READY;

  const config = window.GIMAE || {};
  // Acceso explícito a Sandbox desde los dos orígenes de prueba autorizados.
  const sandboxPreview = (window.location.origin === 'http://localhost:8000' ||
    (window.location.origin === 'https://nachodev-ui.github.io' && window.location.pathname.startsWith('/gimae-web/'))) &&
    new URLSearchParams(window.location.search).get('paypal-sandbox') === '1';
  // Prueba solo local: recorre el callback de error del SDK sin abrir PayPal ni cobrar.
  const localPaypalErrorTest = sandboxPreview && window.location.origin === 'http://localhost:8000' &&
    new URLSearchParams(window.location.search).get('paypal-test-error') === '1';
  const paypalEnabled = Boolean(config.PAYMENT_METHODS?.paypal?.enabled || sandboxPreview);
  const webpayPreview = (window.location.origin === 'http://localhost:8000' ||
    (window.location.origin === 'https://nachodev-ui.github.io' && window.location.pathname.startsWith('/gimae-web/'))) &&
    new URLSearchParams(window.location.search).get('webpay-sandbox') === '1';
  const webpayEnabled = Boolean(config.PAYMENT_METHODS?.webpay?.enabled || webpayPreview);
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
  const checkoutLoading = document.querySelector('#checkout-loading');
  const checkoutDetails = document.querySelector('#checkout-details');
  const paypalWait = document.querySelector('#paypal-wait');
  const paypalWaitTitle = document.querySelector('#paypal-wait-title');
  const paypalWaitMessage = document.querySelector('#paypal-wait-message');
  const paypalWaitAmount = document.querySelector('#paypal-wait-amount');
  const paypalWaitProgress = document.querySelector('#paypal-wait-progress');
  const paypalWaitNote = document.querySelector('#paypal-wait-note');
  const paypalCancelled = document.querySelector('#paypal-cancelled');
  const paypalCancelledBack = document.querySelector('#paypal-cancelled-back');
  const paypalError = document.querySelector('#paypal-error');
  const paypalErrorMessage = document.querySelector('#paypal-error-message');
  const paypalErrorAction = document.querySelector('#paypal-error-action');
  const paypalButtons = document.querySelector('#paypal-buttons');
  const paypalConversion = document.querySelector('#paypal-conversion');
  const checkoutPrivacy = document.querySelector('#checkout-privacy');
  const storageNote = document.querySelector('#cart-storage-note');
  const configNote = document.querySelector('#shop-config-note');
  const pendingOrder = document.querySelector('#pending-order');
  const reopenOrder = document.querySelector('#reopen-order');
  const recentOrder = document.querySelector('#recent-order');
  const recentOrderDescription = document.querySelector('#recent-order-description');
  const recentOrderState = document.querySelector('#recent-order-state');
  const recentOrderCode = document.querySelector('#recent-order-code');
  const recentOrderTotal = document.querySelector('#recent-order-total');
  const recentOrderOpen = document.querySelector('#recent-order-open');
  const recentOrderShortcut = document.querySelector('#shop-order-shortcut');
  const orderSummary = document.querySelector('#order-summary');
  const dialogOpeners = new WeakMap();
  let storageAvailable = testStorage();
  let cart = readCart();
  let selectedShippingId = readShipping();
  let paypalPromise = null;
  let paypalPreparing = false;
  let webpayPreparing = false;
  let paypalPrepared = false;
  let paypalWaitTimer = null;
  let paypalErrorOrder = null;
  let statusPollEpoch = 0;
  let recentOrderPolling = false;
  let recentOrderTimer = null;
  let orderStatusTimer = null;
  let openOrderConfirmation = null;

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
    return Boolean(paypalEnabled && config.backendStatus === 'live' && window.GIMAE_SUPABASE?.url);
  }

  function webpayReady() {
    return Boolean(webpayEnabled && webpayPreview && config.backendStatus === 'live' && window.GIMAE_SUPABASE?.url);
  }

  function readyMethods() {
    return [bankReady() ? 'bankTransfer' : null, paypalReady() ? 'paypal' : null,
      webpayReady() ? 'webpay' : null].filter(Boolean);
  }

  function renderConfigNote() {
    const stockPending = catalog.some(product => optionsFor(product).some(option => stockFor(product, option.id) === null));
    const messages = [];
    if (sandboxPreview) messages.push('Modo de prueba PayPal Sandbox: los pagos no usan dinero real y los pedidos son de prueba.');
    if (webpayPreview) messages.push('Modo de integración Webpay: utiliza solo tarjetas de prueba. Los pedidos son de prueba.');
    if (!readyMethods().length) messages.push('La compra online está en preparación: puedes armar y guardar tu carrito, pero el pago todavía no está habilitado.');
    if (stockPending) messages.push('Algunos productos muestran disponibilidad por confirmar; el equipo debe validarla antes de confirmar el pedido.');
    configNote.textContent = messages.join(' ');
    configNote.hidden = !messages.length;
  }

  function renderPaymentMethods() {
    paymentMethodList.replaceChildren();
    const methods = [
      { id: 'bankTransfer', label: cleanText(config.PAYMENT_METHODS?.bankTransfer?.label || 'Transferencia bancaria', 60), enabled: Boolean(config.PAYMENT_METHODS?.bankTransfer?.enabled), ready: bankReady() },
      { id: 'paypal', label: sandboxPreview ? 'PayPal Sandbox · prueba sin dinero real' : cleanText(config.PAYMENT_METHODS?.paypal?.label || 'PayPal', 60), enabled: paypalEnabled, ready: paypalReady() && selectedShippingId === 'pickup' },
      { id: 'webpay', label: 'Webpay Plus · integración, sin dinero real', enabled: webpayEnabled, ready: webpayReady() && selectedShippingId === 'pickup' }
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

  function updatePaymentUI() {
    paypalPrepared = false;
    const method = chosenPayment();
    const isPaypal = method === 'paypal';
    paypalConversion.hidden = !isPaypal;
    checkoutPrivacy.textContent = isPaypal
      ? (sandboxPreview ? 'Pago de prueba sin dinero real. El pedido Sandbox no se preparará ni entregará.' : 'Usaremos tu nombre y contacto para coordinar el retiro. PayPal cobra en USD.')
      : method === 'webpay' ? 'Pago de prueba en pesos chilenos. Usa solamente tarjetas de prueba de Transbank; este pedido no se preparará ni entregará.'
      : 'Tus datos quedan en el resumen del pedido de este dispositivo.';
    paypalButtons.hidden = true;
    paypalButtons.replaceChildren();
    if (isPaypal) {
      paypalConversion.textContent = 'Verás el total exacto en USD antes de pagar. Retiro en persona sin costo.';
      preparePayment.textContent = 'Preparar pago con PayPal';
    } else if (method === 'webpay') {
      preparePayment.textContent = 'Continuar a Webpay de prueba';
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
      status: method === 'paypal' || method === 'webpay' ? 'preparing_payment' : 'pending_payment',
      paymentMethod: method,
      sandbox: (method === 'paypal' && sandboxPreview) || method === 'webpay',
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

  function forgetOrder(code) {
    const orders = storageGet(ORDERS_KEY, []);
    if (Array.isArray(orders)) storageSet(ORDERS_KEY, orders.filter(order => order?.code !== code));
    renderPendingOrder();
  }

  function clearCartForOrder(order) {
    if (cart.length !== order.items.length || !cart.every(line => order.items.some(item =>
      item.productId === line.productId && item.optionId === line.optionId && item.quantity === line.quantity))) return;
    cart = []; saveCart();
  }

  function latestOrder() {
    const orders = storageGet(ORDERS_KEY, []);
    if (!Array.isArray(orders)) return null;
    return orders.find(order => typeof order?.code === 'string' && Array.isArray(order.items)) || null;
  }

  function renderPendingOrder() {
    const order = latestOrder();
    pendingOrder.hidden = !order;
    recentOrder.hidden = !order;
    recentOrderShortcut.hidden = !order;
    if (!order) return;
    const firstItem = order.items[0];
    const more = order.items.length - 1;
    recentOrderDescription.textContent = firstItem
      ? `${firstItem.quantity}× ${cleanText(firstItem.name, 80)}${more ? ` y ${more} producto${more === 1 ? '' : 's'} más` : ''}. Consulta aquí los detalles de tu compra.`
      : 'Consulta aquí los detalles de tu compra.';
    const online = order.paymentMethod === 'paypal' || order.paymentMethod === 'webpay';
    const paid = online && order.status === 'paid';
    const abandoned = online && order.status === 'abandoned';
    const expired = abandoned && order.abandonReason === 'reservation_expired';
    if (order.sandbox) recentOrderDescription.textContent += ' Pedido de prueba Sandbox, sin preparación ni entrega.';
    if (expired) recentOrderDescription.textContent += ' La reserva venció y las unidades ya no están apartadas.';
    else if (abandoned) recentOrderDescription.textContent += ' Este intento se cerró sin pago confirmado.';
    else if (online && !paid) recentOrderDescription.textContent += ' Comprueba el estado antes de intentar otro pago.';
    recentOrderState.textContent = paid ? (order.sandbox ? 'Prueba confirmada' : 'Pago confirmado') : online
      ? (expired ? 'Reserva vencida' : abandoned ? 'Intento cerrado' : order.status === 'capture_pending' ? 'Confirmación en curso' : 'Pago sin confirmar') : 'Pendiente de pago';
    recentOrderState.classList.toggle('is-paid', paid);
    recentOrderState.classList.toggle('is-abandoned', abandoned);
    recentOrder.classList.toggle('is-expired', expired);
    recentOrder.querySelector('.recent-order-sticker').textContent = expired ? '⌛' : '♡';
    recentOrderCode.textContent = `Pedido ${cleanText(order.code, 40)}`;
    recentOrderTotal.textContent = money.format(Number(order.total) || 0);
  }

  async function pollRecentOrderStatus() {
    window.clearTimeout(recentOrderTimer);
    recentOrderTimer = null;
    if (recentOrderPolling || orderDialog.open || checkoutDialog.open || document.hidden || !navigator.onLine) return;
    const current = latestOrder();
    if (!['paypal', 'webpay'].includes(current?.paymentMethod) || !(current.paypalOrderId || current.webpayBuyOrder) || current.status === 'paid' ||
      (current.status === 'abandoned' && Date.now() - Date.parse(current.createdAt) > 86400_000)) return;
    recentOrderPolling = true;
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (orderDialog.open || document.hidden || !navigator.onLine) break;
        const latest = latestOrder();
        if (latest?.code !== current.code || (latest.paypalOrderId || latest.webpayBuyOrder) !== (current.paypalOrderId || current.webpayBuyOrder)) break;
        try {
          const result = await edgeFunction(current.paymentMethod === 'webpay' ? 'webpay-order-status' : 'paypal-order-status',
            current.paymentMethod === 'webpay' ? { orderCode: current.code, buyOrder: current.webpayBuyOrder } : { orderCode: current.code, orderId: current.paypalOrderId });
          if (result.status === 'paid' && latestOrder()?.code === current.code) {
            latest.status = 'paid';
            clearCartForOrder(latest);
            saveOrder(latest);
            break;
          }
          if (result.status === 'capture_pending' && latest.status === 'awaiting_approval') {
            latest.status = 'capture_pending';
            clearCartForOrder(latest);
            saveOrder(latest);
          }
          if (result.status === 'abandoned') {
            latest.status = 'abandoned';
            latest.abandonReason = result.abandonReason;
            saveOrder(latest);
            break;
          }
          if (result.status === 'awaiting_approval') break;
        } catch (error) {
          // El botón Ver mi pedido permite consultar de nuevo sin iniciar otro cobro.
        }
        if (attempt < 11) await new Promise(resolve => window.setTimeout(resolve, 2500));
      }
    } finally {
      recentOrderPolling = false;
      const latest = latestOrder();
      if (['paypal', 'webpay'].includes(latest?.paymentMethod) && (latest.paypalOrderId || latest.webpayBuyOrder) && latest.status !== 'paid' &&
        (latest.status !== 'abandoned' || Date.now() - Date.parse(latest.createdAt) <= 86400_000) &&
        !orderDialog.open && !checkoutDialog.open && !document.hidden && navigator.onLine) {
        recentOrderTimer = window.setTimeout(() => { void pollRecentOrderStatus(); }, 30000);
      }
    }
  }

  function loadPayPal(clientId) {
    if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
    if (paypalPromise) return paypalPromise;
    paypalPromise = new Promise((resolve, reject) => {
      const params = new URLSearchParams({ 'client-id': clientId, currency: 'USD', intent: 'capture', components: 'buttons' });
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
      script.async = true; script.dataset.gimaePaypal = 'true';
      script.addEventListener('load', () => window.paypal?.Buttons ? resolve(window.paypal) : (paypalPromise = null, reject(new Error('PAYPAL_UNAVAILABLE'))), { once: true });
      script.addEventListener('error', () => { paypalPromise = null; reject(new Error('PAYPAL_LOAD_ERROR')); }, { once: true });
      document.head.append(script);
    });
    return paypalPromise;
  }

  async function edgeFunction(name, payload) {
    const url = window.GIMAE_SUPABASE?.url;
    if (!url) throw new Error('El servidor de pagos no está disponible.');
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No pudimos conectar con el servidor de pagos.');
    return result;
  }

  function showPayPalWait(order, verifying = false) {
    window.clearTimeout(paypalWaitTimer);
    paypalWaitTitle.textContent = verifying ? 'Verificando tu pago ♡' : 'Completa el pago en PayPal';
    paypalWaitMessage.textContent = verifying
      ? 'PayPal recibió tu autorización. Estamos comprobando la captura con nuestro servidor.'
      : 'Revisa y aprueba la compra en la ventana segura de PayPal que se abrió.';
    paypalWaitAmount.textContent = `${money.format(Number(order.total))} CLP → ${usd.format(Number(order.paypalUsd))} USD`;
    paypalWaitProgress.textContent = verifying ? 'Confirmando el resultado…' : 'Esperando tu decisión en PayPal…';
    paypalWaitNote.textContent = verifying
      ? 'Mantén abierta esta página mientras confirmamos el resultado. No repitas el pago.'
      : 'Mantén abierta esta página. Al terminar en PayPal, te mostraremos el resultado aquí. Si cancelas, conservarás tu carrito.';
    checkoutDetails.inert = true;
    checkoutDetails.setAttribute('aria-hidden', 'true');
    paypalWait.hidden = false;
    checkoutDialog.classList.add('is-paypal-waiting');
    checkoutDialog.setAttribute('aria-labelledby', 'paypal-wait-title');
    checkoutDialog.scrollTop = 0;
  }

  function clearPayPalWait() {
    window.clearTimeout(paypalWaitTimer);
    paypalWait.hidden = true;
    checkoutDetails.inert = false;
    checkoutDetails.removeAttribute('aria-hidden');
    checkoutDialog.classList.remove('is-paypal-waiting');
    checkoutDialog.setAttribute('aria-labelledby', 'checkout-title');
  }

  function showPayPalCancelled() {
    clearPayPalWait();
    checkoutDetails.hidden = true;
    paypalCancelled.hidden = false;
    checkoutDialog.classList.add('is-paypal-cancelled');
    checkoutDialog.setAttribute('aria-labelledby', 'paypal-cancelled-title');
    checkoutDialog.scrollTop = 0;
    paypalCancelledBack.focus();
  }

  function returnToCheckout() {
    paypalCancelled.hidden = true;
    checkoutDetails.hidden = false;
    checkoutDialog.classList.remove('is-paypal-cancelled');
    checkoutDialog.setAttribute('aria-labelledby', 'checkout-title');
    checkoutDialog.scrollTop = 0;
    preparePayment.focus();
  }

  function clearPayPalError() {
    paypalError.hidden = true;
    paypalErrorOrder = null;
    checkoutDetails.hidden = false;
    checkoutDialog.classList.remove('is-paypal-error');
    checkoutDialog.setAttribute('aria-labelledby', 'checkout-title');
  }

  function showPayPalError(order, message) {
    clearPayPalWait();
    paypalPrepared = false;
    paypalButtons.hidden = true;
    checkoutStatus.textContent = '';
    showError(checkoutError, '');
    paypalErrorOrder = order;
    paypalErrorMessage.textContent = message;
    paypalErrorAction.firstChild.textContent = order ? 'Ver estado de mi pedido ' : 'Volver a mis datos ';
    checkoutDetails.hidden = true;
    paypalError.hidden = false;
    checkoutDialog.classList.add('is-paypal-error');
    checkoutDialog.setAttribute('aria-labelledby', 'paypal-error-title');
    checkoutDialog.scrollTop = 0;
    paypalErrorAction.focus();
  }

  function leavePayPalError() {
    const order = paypalErrorOrder;
    clearPayPalError();
    if (order) {
      checkoutDialog.close();
      window.setTimeout(() => renderOrder(order, document.querySelector('#shop-order-shortcut')), 0);
    } else {
      checkoutDialog.scrollTop = 0;
      preparePayment.focus();
    }
  }

  async function renderPayPal(order) {
    if (paypalPreparing || paypalPrepared) return;
    if (selectedShippingId !== 'pickup') return showError(checkoutError, 'PayPal solo está disponible para retiro en persona.');
    paypalPreparing = true;
    preparePayment.disabled = true;
    checkoutLoading.hidden = false;
    checkoutStatus.textContent = '';
    showError(checkoutError, '');
    paypalButtons.replaceChildren(); paypalButtons.hidden = true;
    preparePayment.hidden = true;
    try {
      const quote = await edgeFunction('paypal-create-order', {
        buyerName: order.buyer.name, buyerContact: order.buyer.contact,
        shippingId: 'pickup',
        items: cart.map(({ productId, optionId, quantity }) => ({ productId, optionId, quantity }))
      });
      order.code = quote.orderCode;
      order.paypalOrderId = quote.orderId;
      order.reservationExpiresAt = quote.reservationExpiresAt;
      order.total = quote.totalClp;
      order.paypalUsd = quote.totalUsd;
      order.items = quote.items;
      // Persistir las dos IDs antes de abrir PayPal permite consultar el pago tras recargar o perder conexión.
      order.status = 'awaiting_approval';
      saveOrder(order);
      paypalConversion.textContent = `${money.format(quote.totalClp)} CLP → ${usd.format(Number(quote.totalUsd))} USD · Retiro sin costo. Tus unidades están reservadas durante 15 minutos, hasta las ${new Intl.DateTimeFormat('es-CL', { timeStyle: 'short' }).format(new Date(quote.reservationExpiresAt))}.`;
      await loadPayPal(quote.clientId);
      paypalButtons.hidden = false;
      let capturing = false;
      const handlePayPalError = (simulated = false) => {
        if (capturing) return;
        if (simulated) {
          forgetOrder(order.code);
          preparePayment.hidden = false;
          showPayPalError(null, 'Esta es una prueba de error. Tu carrito sigue guardado y puedes volver a tus datos.');
          return;
        }
        preparePayment.hidden = true;
        showPayPalError(order, 'No pudimos confirmar el resultado. Dejamos guardado tu intento: revisa el estado del pedido antes de volver a pagar.');
      };
      const buttons = window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', color: 'gold', label: 'paypal' },
        createOrder: () => quote.orderId,
        onClick: data => {
          if (data.fundingSource && data.fundingSource !== 'paypal') return;
          // Deja que el SDK abra su ventana antes de ocultar visualmente el iframe.
          paypalWaitTimer = window.setTimeout(() => {
            if (checkoutDialog.open && paypalPrepared && !capturing) showPayPalWait(order);
          }, 0);
        },
        onApprove: async data => {
          if (capturing) return;
          if (data.orderID !== quote.orderId) {
            capturing = true;
            showPayPalError(order, 'La orden aprobada no coincide con tu pedido. Revisa su estado y contacta a Gimae con el ID ' + quote.orderId + '.');
            return;
          }
          capturing = true;
          showPayPalWait(order, true);
          try {
            const result = await edgeFunction('paypal-capture-order', { orderId: quote.orderId });
            order.status = result.status;
            saveOrder(order);
            clearCartForOrder(order);
            clearPayPalWait();
            checkoutDialog.close();
            renderOrder(order, preparePayment);
          } catch (error) {
            showPayPalError(order, error.message?.includes('reserva venció')
              ? error.message
              : 'No pudimos comprobar el resultado. Revisa el estado de tu pedido antes de pagar otra vez.');
          }
        },
        onCancel: () => {
          if (capturing) return;
          paypalPrepared = false;
          forgetOrder(order.code);
          checkoutStatus.textContent = '';
          paypalConversion.textContent = 'Verás el total exacto en USD antes de pagar. Retiro en persona sin costo.';
          preparePayment.hidden = false; paypalButtons.hidden = true;
          showPayPalCancelled();
        },
        onError: () => handlePayPalError()
      });
      if (buttons.isEligible && !buttons.isEligible()) throw new Error('PAYPAL_INELIGIBLE');
      if (localPaypalErrorTest) {
        // Recorre el mismo manejo del callback del SDK sin abrir PayPal ni hacer un cargo.
        handlePayPalError(true);
        return;
      }
      await buttons.render('#paypal-buttons');
      paypalPrepared = true;
      checkoutStatus.textContent = 'Revisa el total exacto en USD y continúa en PayPal.';
    } catch (error) {
      clearPayPalWait();
      paypalPrepared = false;
      if (order.status === 'awaiting_approval') forgetOrder(order.code);
      showError(checkoutError, error.message || 'No pudimos preparar PayPal. Intenta nuevamente.');
      checkoutStatus.textContent = '';
      preparePayment.hidden = false; paypalButtons.hidden = true;
    } finally {
      paypalPreparing = false;
      preparePayment.disabled = false;
      checkoutLoading.hidden = true;
    }
  }

  async function renderWebpay(order) {
    if (webpayPreparing) return;
    if (selectedShippingId !== 'pickup') return showError(checkoutError, 'Webpay de prueba solo está disponible para retiro en persona.');
    webpayPreparing = true;
    preparePayment.disabled = true;
    checkoutLoading.hidden = false;
    showError(checkoutError, '');
    try {
      const quote = await edgeFunction('webpay-create-order', {
        buyerName: order.buyer.name, buyerContact: order.buyer.contact, shippingId: 'pickup',
        items: cart.map(({ productId, optionId, quantity }) => ({ productId, optionId, quantity }))
      });
      order.code = quote.orderCode;
      order.webpayBuyOrder = quote.buyOrder;
      order.reservationExpiresAt = quote.reservationExpiresAt;
      order.total = quote.totalClp;
      order.items = quote.items;
      order.status = 'awaiting_approval';
      saveOrder(order);
      // POST is required by Transbank. Persist the order before leaving this page.
      const form = element('form');
      form.method = 'POST'; form.action = quote.url;
      const token = element('input'); token.type = 'hidden'; token.name = 'token_ws'; token.value = quote.token;
      form.append(token); document.body.append(form); form.submit();
    } catch (error) {
      showError(checkoutError, error.message || 'No pudimos preparar Webpay. Revisa tu carrito.');
      preparePayment.disabled = false;
      checkoutLoading.hidden = true;
      webpayPreparing = false;
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
    statusPollEpoch += 1;
    window.clearTimeout(orderStatusTimer);
    orderStatusTimer = null;
    openOrderConfirmation = null;
    orderSummary.replaceChildren();
    orderDialog.classList.remove('is-paid', 'is-expired');
    const isPayPal = order.paymentMethod === 'paypal';
    const isWebpay = order.paymentMethod === 'webpay';
    const online = isPayPal || isWebpay;
    const paid = online && order.status === 'paid';
    const awaiting = online && order.status === 'awaiting_approval';
    const abandoned = online && order.status === 'abandoned';
    const expired = abandoned && order.abandonReason === 'reservation_expired';
    let pendingConfirmation = null;
    orderDialog.querySelector(':scope > .eyebrow').textContent = expired ? 'TIEMPO DE RESERVA AGOTADO' : 'RESUMEN DEL PEDIDO';
    document.querySelector('#order-title').textContent = paid ? (order.sandbox ? '¡Prueba confirmada!' : '¡Pago confirmado!') : expired ? 'Reserva vencida' : abandoned ? 'Intento cerrado' : order.status === 'payment_denied' ? 'Pago no aprobado' : awaiting ? 'Revisa tu pago' : 'Tu pedido quedó guardado';
    const status = element('p', `order-status${paid ? ' is-paid' : abandoned ? ' is-abandoned' : ''}`,
      online ? (paid ? (order.sandbox ? 'Pago de prueba confirmado · pedido de prueba' : 'Pago confirmado · pedido recibido') : expired ? 'Reserva finalizada · sin pago confirmado' : abandoned ? 'Sin pago confirmado · intento cerrado' : awaiting ? 'Pago sin confirmar' : order.status === 'payment_denied' ? 'Pago rechazado · sin cobro confirmado' : 'Verificando confirmación') : 'Pendiente de pago');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    orderSummary.append(status);
    if (order.sandbox) orderSummary.append(element('p', 'order-local-note', 'Pedido de prueba Sandbox · sin dinero real, preparación ni entrega.'));
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
    } else if (isWebpay) {
      orderSummary.append(copyRow('Orden Webpay', order.webpayBuyOrder || 'Pendiente'));
      const instruction = element('p', 'order-instruction', paid
        ? `Pago de prueba por ${money.format(Number(order.total))} confirmado en Webpay. Este pedido de integración no se preparará.`
        : expired ? 'La reserva venció y se liberaron las unidades. Si tu banco muestra un cargo, contacta a Gimae con el ID antes de repetir.'
        : order.status === 'payment_denied' ? 'Transbank rechazó o anuló el intento. Puedes volver al carrito e iniciar otra compra de prueba.'
        : order.webpayReturn === 'cancelled' ? 'Volviste sin completar el pago. La reserva vencerá a la hora indicada. Puedes iniciar un nuevo intento al vencer.'
        : awaiting ? `Estamos esperando tu resultado de Webpay. La reserva vence a las ${new Intl.DateTimeFormat('es-CL', { timeStyle: 'short' }).format(new Date(order.reservationExpiresAt))}. No repitas el pago sin consultar el estado.`
        : 'Estamos verificando el resultado con Transbank. No repitas el pago.');
      orderSummary.append(instruction);
    if (!paid && order.webpayBuyOrder) {
        const check = element('button', 'copy-button', expired ? 'Comprobar si llegó un pago' : 'Consultar confirmación');
        check.type = 'button';
        if (expired) check.classList.add('order-expired-refresh');
        check.addEventListener('click', () => confirmWebpayOrder(order, instruction, check));
        orderSummary.append(check);
        pendingConfirmation = () => confirmWebpayOrder(order, instruction, check);
      }
    } else {
      orderSummary.append(copyRow('ID de orden PayPal', order.paypalOrderId || 'Pendiente'));
      const instruction = element('p', 'order-instruction', paid
        ? (order.sandbox ? `Pago de prueba de ${usd.format(Number(order.paypalUsd))} USD confirmado en Sandbox.` : `Pago de ${usd.format(Number(order.paypalUsd))} USD confirmado. Te contactaremos para coordinar los siguientes pasos.`)
        : abandoned
          ? order.abandonReason === 'reservation_expired'
            ? 'La reserva de 15 minutos venció y se liberaron las unidades. Prepara una compra nueva. Si PayPal muestra un cobro, contáctanos con el ID de orden.'
            : 'PayPal ya no encontró esta orden o la anuló. Puedes preparar una compra nueva. Si ves un cobro en PayPal, contáctanos con el ID de orden antes de volver a pagar.'
        : awaiting
          ? `Tus unidades están reservadas${order.reservationExpiresAt ? ' hasta las ' + new Intl.DateTimeFormat('es-CL', { timeStyle: 'short' }).format(new Date(order.reservationExpiresAt)) : ' durante 15 minutos'}. Si aprobaste en PayPal, puedes comprobar y completar el pago antes de que venza la reserva.`
          : `Estamos verificando la captura de ${usd.format(Number(order.paypalUsd))} USD. No repitas el pago.`);
      orderSummary.append(instruction);
      if (!paid && order.paypalOrderId && order.code) {
        const check = element('button', 'copy-button', expired ? 'Comprobar si llegó un pago' : 'Consultar confirmación');
        check.type = 'button';
        if (expired) check.classList.add('order-expired-refresh');
        let recover = null;
        if (awaiting) {
          recover = element('button', 'button primary order-recover-payment', 'Comprobar y completar si aprobaste en PayPal');
          recover.type = 'button';
          recover.addEventListener('click', () => recoverPayPalOrder(order, instruction, recover));
          orderSummary.append(recover);
        }
        check.addEventListener('click', () => confirmPayPalOrder(order, status, instruction, check, recover));
        orderSummary.append(check);
        pendingConfirmation = () => confirmPayPalOrder(order, status, instruction, check, recover);
      }
    }
    if (!paid) orderSummary.append(element('p', 'order-local-note', online ? 'El intento se guarda en el servidor. Esta copia local sirve para reabrir el resumen.' : 'Este resumen existe solo en este navegador. El pedido se confirma cuando el equipo recibe y verifica el comprobante.'));
    if (!order.sandbox) {
      const actions = contactActions(order);
      if (actions.children.length) orderSummary.append(actions);
    }
    if (paid) showPaidOrder(status, order.sandbox, isWebpay ? 'Webpay Plus' : 'PayPal Sandbox');
    else if (expired) showExpiredOrder(order, status);
    openDialog(orderDialog, opener || document.querySelector('[data-open-cart]'));
    openOrderConfirmation = pendingConfirmation;
    pendingConfirmation?.();
  }

  function showPaidOrder(status, sandbox = false, provider = 'PayPal Sandbox') {
    orderDialog.classList.add('is-paid');
    const celebration = element('div', 'order-success');
    const art = element('div', 'order-success-art');
    art.setAttribute('aria-hidden', 'true');
    art.append(element('span', 'order-success-check', '✓'));
    const copy = element('div', 'order-success-copy');
    copy.append(status, element('p', '', sandbox
      ? `¡La prueba de ${provider} se completó! Este pedido no se preparará ni entregará.`
      : '¡Gracias por comprar en Gimae! Ya recibimos tu pedido. Pronto coordinaremos contigo los siguientes pasos.'));
    celebration.append(art, copy);
    orderSummary.prepend(celebration);
    if (!sandbox) orderSummary.querySelector('.order-local-note')?.remove();

    const receipt = element('section', 'order-receipt');
    receipt.setAttribute('aria-label', 'Detalles del pedido');
    const heading = element('div', 'order-receipt-heading');
    heading.append(element('span', '', 'TU COMPRA EN DETALLE'), element('span', 'order-receipt-dots', '● ● ●'));
    receipt.append(heading, orderSummary.querySelector('.order-code'));

    const products = element('div', 'order-receipt-products');
    products.append(element('h3', '', 'Lo que elegiste'), orderSummary.querySelector('.order-lines'));
    receipt.append(products);

    const amounts = element('div', 'order-receipt-amounts');
    amounts.append(orderSummary.querySelector('.order-total-box'), orderSummary.querySelector('.order-shipping-copy'));
    receipt.append(amounts);

    const payment = element('div', 'order-receipt-payment');
    payment.append(element('h3', '', 'Pago registrado'), orderSummary.querySelector('.order-copy-row'), orderSummary.querySelector('.order-instruction'));
    receipt.append(payment);
    orderSummary.append(receipt);

    const actions = orderSummary.querySelector('.order-contact-actions');
    if (actions) {
      const contact = element('div', 'order-receipt-contact');
      contact.append(element('p', '', '¿Quieres escribirnos sobre tu pedido?'), actions);
      orderSummary.append(contact);
    }
  }

  function showExpiredOrder(order, status) {
    orderDialog.classList.add('is-expired');
    const hero = element('section', 'order-expired-hero');
    hero.setAttribute('aria-label', 'Reserva vencida');
    const art = element('span', 'order-expired-art');
    art.setAttribute('aria-hidden', 'true');
    art.append(element('span', 'order-expired-clock'));
    const message = element('div', 'order-expired-message');
    message.append(status, element('h3', '', 'El tiempo para pagar terminó'),
      element('p', '', 'Las unidades ya no están apartadas para este pedido. Puedes revisar tu carrito y preparar un intento nuevo.'));
    hero.append(art, message);

    const actions = element('div', 'order-expired-actions');
    const restart = element('button', 'order-expired-primary', cart.length ? 'Volver al carrito' : 'Elegir productos');
    restart.type = 'button';
    restart.addEventListener('click', () => {
      closeDialog(orderDialog);
      if (cart.length) {
        renderCart();
        window.setTimeout(() => openDialog(cartDialog, recentOrderOpen), 0);
      } else {
        productGrid.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        productGrid.querySelector('button')?.focus({ preventScroll: true });
      }
    });
    actions.append(restart);
    const refresh = orderSummary.querySelector('.order-expired-refresh');
    if (refresh) actions.append(refresh);

    const instruction = orderSummary.querySelector('.order-instruction');
    instruction.textContent = `¿${order.paymentMethod === 'webpay' ? 'Tu banco' : 'PayPal'} muestra un pago? Abre los detalles para copiar el ID y contacta a Gimae antes de intentarlo otra vez.`;
    instruction.classList.add('order-expired-help');
    const details = element('details', 'order-expired-details');
    const summary = element('summary', '', 'Ver productos, importe e ID de este intento');
    details.append(summary);
    const detailBody = element('div', 'order-expired-detail-body');
    for (const selector of ['.order-code', '.order-lines', '.order-total-box', '.order-shipping-copy', '.order-copy-row']) {
      const section = orderSummary.querySelector(selector);
      if (section) detailBody.append(section);
    }
    details.append(detailBody);
    const sandboxNote = order.sandbox ? orderSummary.querySelector('.order-local-note') : null;
    const contact = orderSummary.querySelector('.order-contact-actions');
    orderSummary.replaceChildren(hero, actions, instruction, details);
    if (sandboxNote) orderSummary.append(sandboxNote);
    if (contact) orderSummary.append(contact);
  }

  async function recoverPayPalOrder(order, instruction, button) {
    if (button.disabled) return;
    button.disabled = true;
    instruction.textContent = 'Consultando el estado seguro de tu pedido…';
    try {
      const current = await edgeFunction('paypal-order-status', { orderCode: order.code, orderId: order.paypalOrderId });
      const result = current.status === 'awaiting_approval'
        ? await edgeFunction('paypal-capture-order', { orderId: order.paypalOrderId })
        : current;
      if (result.status === 'abandoned') {
        order.status = 'abandoned';
        order.abandonReason = result.abandonReason;
        saveOrder(order);
        renderOrder(order, button);
        return;
      }
      if (result.status !== 'paid' && result.status !== 'capture_pending') {
        instruction.textContent = 'El pago aún no está confirmado. Revisa tu actividad en PayPal o consulta a Gimae con el ID de orden antes de intentarlo de nuevo.';
        return;
      }
      order.status = result.status;
      clearCartForOrder(order);
      saveOrder(order);
      renderOrder(order, button);
    } catch (error) {
      instruction.textContent = 'No pudimos comprobar si PayPal recibió tu aprobación. Conserva este pedido y su ID; inténtalo cuando vuelva la conexión o consulta a Gimae antes de pagar otra vez.';
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  function confirmPayPalOrder(order, statusNode, instruction, check, recover) {
    const epoch = ++statusPollEpoch;
    window.clearTimeout(orderStatusTimer);
    let checks = 0;
    const refresh = async () => {
      if (epoch !== statusPollEpoch || !orderDialog.open) return;
      if (document.hidden || !navigator.onLine) {
        check.disabled = false;
        return;
      }
      check.disabled = true;
      try {
        const result = await edgeFunction('paypal-order-status', { orderCode: order.code, orderId: order.paypalOrderId });
        if (epoch !== statusPollEpoch || !orderDialog.open) return;
        if (result.status === 'paid') {
          order.status = 'paid';
          clearCartForOrder(order);
          saveOrder(order);
          renderOrder(order, check);
          const title = document.querySelector('#order-title');
          title.tabIndex = -1; title.focus({ preventScroll: true });
          return;
        }
        if (result.status === 'abandoned') {
          const changed = order.status !== 'abandoned' || order.abandonReason !== result.abandonReason;
          order.status = 'abandoned';
          order.abandonReason = result.abandonReason;
          saveOrder(order);
          if (changed) {
            renderOrder(order, check);
            orderDialog.scrollTop = 0;
            const title = document.querySelector('#order-title');
            title.tabIndex = -1; title.focus({ preventScroll: true });
            return;
          }
          check.disabled = false;
          // Una captura tardía aún puede llegar: mantener la consulta ligera.
          if (Date.now() - Date.parse(order.createdAt) <= 86400_000) {
            orderStatusTimer = window.setTimeout(refresh, 30000);
          } else openOrderConfirmation = null;
          return;
        }
        if (result.status === 'capture_pending' && order.status === 'awaiting_approval') {
          order.status = 'capture_pending';
          clearCartForOrder(order);
          saveOrder(order);
          statusNode.textContent = 'Captura recibida · verificando confirmación';
          instruction.textContent = 'Estamos verificando la captura. No repitas el pago.';
          recover?.remove();
        }
        if (result.status === 'awaiting_approval') {
          if (checks < 11) {
            statusNode.textContent = 'Pago sin confirmar';
            instruction.textContent = 'Aún no consta una captura. Si aprobaste el pago en PayPal, pulsa “Comprobar y completar” para recuperar tu compra.';
          }
        }
      } catch (error) {
        // La captura puede seguir confirmándose aunque falle una consulta de estado.
      }
      if (epoch !== statusPollEpoch || !orderDialog.open) return;
      checks += 1;
      if (checks === 12) {
        statusNode.textContent = 'Verificación aún en curso';
        instruction.textContent = 'Seguiremos comprobando este pedido mientras tengas la página abierta. No repitas el pago.';
      }
      check.disabled = false;
      orderStatusTimer = window.setTimeout(refresh, checks < 12 ? 2500 : 30000);
    };
    void refresh();
  }

  function confirmWebpayOrder(order, instruction, button) {
    const epoch = ++statusPollEpoch;
    window.clearTimeout(orderStatusTimer);
    let checks = 0;
    const refresh = async () => {
      if (epoch !== statusPollEpoch || !orderDialog.open) return;
      if (document.hidden || !navigator.onLine) { button.disabled = false; return; }
      button.disabled = true;
      try {
        const result = await edgeFunction('webpay-order-status', { orderCode: order.code, buyOrder: order.webpayBuyOrder });
        if (epoch !== statusPollEpoch || !orderDialog.open) return;
        if (result.status !== order.status || result.abandonReason !== order.abandonReason) {
          order.status = result.status;
          order.abandonReason = result.abandonReason;
          if (order.status === 'paid' || order.status === 'capture_pending') clearCartForOrder(order);
          saveOrder(order);
          renderOrder(order, button);
          return;
        }
        if (result.status === 'paid' || result.status === 'payment_denied') { button.disabled = false; return; }
        if (checks >= 12) instruction.textContent = 'Seguimos esperando una respuesta segura de Transbank. Conserva este ID y no repitas el pago.';
      } catch (error) {
        instruction.textContent = 'No pudimos consultar el servidor. Conserva este ID y prueba de nuevo cuando vuelva la conexión.';
      }
      if (epoch !== statusPollEpoch || !orderDialog.open) return;
      checks += 1;
      button.disabled = false;
      orderStatusTimer = window.setTimeout(refresh, checks < 12 ? 2500 : 30000);
    };
    void refresh();
  }

  function openDialog(dialog, opener) {
    if (!dialog || dialog.open) return;
    dialogOpeners.set(dialog, opener instanceof HTMLElement ? opener : document.activeElement);
    dialog.showModal(); document.body.classList.add('dialog-open');
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  paypalCancelledBack.addEventListener('click', returnToCheckout);
  paypalErrorAction.addEventListener('click', leavePayPalError);

  document.querySelectorAll('.shop-dialog').forEach(dialog => {
    dialog.querySelector('[data-close-dialog]')?.addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('cancel', event => {
      if (dialog === checkoutDialog && checkoutDialog.classList.contains('is-paypal-waiting')) event.preventDefault();
      if (dialog === checkoutDialog && checkoutDialog.classList.contains('is-paypal-cancelled')) {
        event.preventDefault();
        returnToCheckout();
      }
      if (dialog === checkoutDialog && checkoutDialog.classList.contains('is-paypal-error')) {
        event.preventDefault();
        leavePayPalError();
      }
    });
    dialog.addEventListener('click', event => {
      if (dialog === checkoutDialog && checkoutDialog.classList.contains('is-paypal-waiting')) return;
      if (dialog === checkoutDialog && checkoutDialog.classList.contains('is-paypal-cancelled')) return;
      if (dialog === checkoutDialog && checkoutDialog.classList.contains('is-paypal-error')) return;
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      if (dialog === orderDialog) {
        statusPollEpoch += 1;
        window.clearTimeout(orderStatusTimer);
        orderStatusTimer = null;
        openOrderConfirmation = null;
        void pollRecentOrderStatus();
      }
      if (dialog === checkoutDialog) { clearPayPalWait(); clearPayPalError(); }
      if (!document.querySelector('.shop-dialog[open]')) document.body.classList.remove('dialog-open');
      const opener = dialog === orderDialog && !recentOrder.hidden ? recentOrderOpen : dialogOpeners.get(dialog);
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
    event.preventDefault();
    if (paypalPreparing || webpayPreparing || (paypalPrepared && chosenPayment() === 'paypal')) return;
    showError(checkoutError, ''); checkoutStatus.textContent = '';
    const buyer = buyerData();
    if (buyer.error) return showError(checkoutError, buyer.error);
    const method = chosenPayment();
    if (!method) return showError(checkoutError, 'Elige una forma de pago disponible.');
    const order = createOrderSnapshot(method, buyer);
    if (method === 'paypal') return renderPayPal(order);
    if (method === 'webpay') return renderWebpay(order);
    if (!bankReady()) return showError(checkoutError, 'La transferencia todavía no está configurada.');
    saveOrder(order); cart = []; saveCart(); checkoutDialog.close(); renderOrder(order, preparePayment);
  });

  reopenOrder.addEventListener('click', () => {
    const order = latestOrder();
    if (!order) return;
    cartDialog.close(); window.setTimeout(() => renderOrder(order, reopenOrder), 0);
  });

  recentOrderOpen.addEventListener('click', () => {
    const order = latestOrder();
    if (order) renderOrder(order, recentOrderOpen);
  });
  recentOrderShortcut.addEventListener('click', () => {
    const order = latestOrder();
    if (order) renderOrder(order, recentOrderShortcut);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (orderDialog.open && openOrderConfirmation) openOrderConfirmation();
    else void pollRecentOrderStatus();
  });
  window.addEventListener('online', () => {
    if (checkoutDialog.open && checkoutDialog.classList.contains('is-paypal-error') && paypalErrorOrder) {
      leavePayPalError();
    } else if (orderDialog.open && openOrderConfirmation) openOrderConfirmation();
    else void pollRecentOrderStatus();
  });

  renderProducts(); renderShipping(); renderCart(); renderConfigNote();
  const returned = new URL(window.location.href);
  const returnedOrder = returned.searchParams.get('webpay-order');
  const returnedRef = returned.searchParams.get('webpay-ref');
  if (returnedOrder || returnedRef) {
    returned.searchParams.delete('webpay-order');
    returned.searchParams.delete('webpay-ref');
    const result = returned.searchParams.get('webpay-result');
    returned.searchParams.delete('webpay-result');
    window.history.replaceState(null, '', returned.pathname + returned.search + returned.hash);
    const order = (storageGet(ORDERS_KEY, []) || []).find(item => item?.paymentMethod === 'webpay' &&
      item.code === returnedOrder && item.webpayBuyOrder === returnedRef);
    if (order) {
      order.webpayReturn = result;
      saveOrder(order);
      renderOrder(order, recentOrderOpen);
    } else {
      configNote.hidden = false;
      configNote.textContent = `Volviste de Webpay. Busca el pedido ${cleanText(returnedOrder, 40)} en el mismo navegador o contacta a Gimae antes de pagar otra vez.`;
    }
  } else void pollRecentOrderStatus();
})();
