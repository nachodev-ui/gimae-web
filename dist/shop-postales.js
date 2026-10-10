/* Galería editorial de postales. La compra usa exclusivamente el catálogo e inventario vigentes. */
(async () => {
  'use strict';

  await window.GIMAE_READY;
  const host = document.querySelector('#postales-grid');
  const dialog = document.querySelector('#product-dialog');
  const dialogContent = document.querySelector('#product-dialog-content');
  if (!host || !dialog || !dialogContent) return;

  const collections = ['Antigua', 'Halloween', 'Traje', 'Verano'];
  const members = ['Suki', 'Usi', 'Vewe', 'Vali', 'Grupal'];
  const names = {
    antigua: ['01', '02', '03'],
    halloween: ['01'],
    traje: ['Grupal', 'Suki', 'Usi', 'Vali', 'Vewe'],
    verano: ['Grupal', 'Suki', 'Usi', 'Vali', 'Vewe']
  };
  const items = collections.flatMap(collection => names[collection.toLowerCase()].map(variant => ({
    collection,
    variant,
    slug: `postal_${collection.toLowerCase()}_${variant.toLowerCase()}`
  })));
  const base = `${window.GIMAE_SUPABASE?.url || ''}/storage/v1/object/public/gimae-products/products/postales/optimizadas/`;
  const catalog = (window.GIMAE?.merch || []).filter(product => product?.active !== false);
  const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const count = document.querySelector('#postales-count');
  const empty = document.querySelector('#postales-empty');
  const clear = document.querySelector('#postales-clear');
  let selectedCollection = '';
  let selectedMember = '';
  let opener = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const imageUrl = (item, size) => `${base}${item.slug}-${size}.webp`;
  const title = item => `${item.collection} · ${item.variant === '01' || item.variant === '02' || item.variant === '03' ? `N.º ${item.variant}` : item.variant}`;

  function liveOption(item) {
    const collection = normalized(item.collection);
    const variant = normalized(item.variant);
    for (const product of catalog) {
      const productName = normalized(product.name);
      if (!productName.includes('postal')) continue;
      const productHasCollection = productName.includes(collection);
      for (const option of product.prices || []) {
        const label = normalized(option.label);
        if (!label.includes(variant)) continue;
        if (!productHasCollection && !label.includes(collection)) continue;
        const stock = product.stockByVariant?.[option.id];
        return { product, option, stock: Number.isInteger(stock) ? stock : null };
      }
    }
    return null;
  }

  function filterButtons(target, values, kind) {
    const host = document.querySelector(target);
    values.forEach(value => {
      const button = el('button', 'postales-chip', value);
      button.type = 'button';
      button.dataset.filter = value;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (kind === 'collection') selectedCollection = selectedCollection === value ? '' : value;
        else selectedMember = selectedMember === value ? '' : value;
        render();
      });
      host.append(button);
    });
  }

  function card(item) {
    const article = el('article', 'postal-card');
    article.style.setProperty('--tilt', `${(Math.random() * 3 - 1.5).toFixed(1)}deg`);
    const button = el('button', 'postal-card__open');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `Ver postal ${title(item)}`);
    const picture = el('span', 'postal-card__picture');
    const img = el('img');
    img.src = imageUrl(item, 600);
    img.alt = `Postal ${title(item)} de Gimae`;
    img.width = 600; img.height = 600;
    img.loading = 'lazy'; img.decoding = 'async';
    picture.append(img);
    const stamp = el('span', 'postal-card__stamp', 'GIMAE!\n♡ POST');
    stamp.setAttribute('aria-hidden', 'true');
    const label = el('span', 'postal-card__label', item.collection.toUpperCase());
    const name = el('strong', 'postal-card__name', item.variant === '01' || item.variant === '02' || item.variant === '03' ? `Postal N.º ${item.variant}` : item.variant);
    const foot = el('span', 'postal-card__foot', `${money.format(2000)} · Ver postal ↗`);
    button.append(picture, stamp, label, name, foot);
    button.addEventListener('click', () => open(item, button));
    article.append(button);
    return article;
  }

  function open(initial, trigger) {
    opener = trigger;
    const choices = items.filter(item => item.collection === initial.collection);
    dialogContent.replaceChildren();
    dialog.classList.add('postales-dialog');
    const layout = el('div', 'postal-detail');
    const media = el('div', 'postal-detail__media');
    const img = el('img');
    img.width = 1600; img.height = 1600;
    img.alt = `Postal ${title(initial)} de Gimae`;
    img.decoding = 'async';
    const mediaNote = el('span', 'postal-detail__media-note', '✦ GIMAE! POSTCARD CLUB ♡');
    media.append(img, mediaNote);
    const info = el('div', 'postal-detail__info');
    info.append(el('p', 'eyebrow', 'UN RECUERDO PARA TI ♡'));
    const heading = el('h2', '', `Postales ${initial.collection}`);
    heading.id = 'product-dialog-title';
    const price = el('strong', 'postal-detail__price', money.format(2000));
    const label = el('label', 'postal-detail__label', 'Elige tu postal');
    const select = el('select', 'postal-detail__select');
    select.id = 'postal-variant';
    for (const choice of choices) {
      const option = el('option', '', choice.variant === '01' || choice.variant === '02' || choice.variant === '03' ? `N.º ${choice.variant}` : choice.variant);
      option.value = choice.slug;
      select.append(option);
    }
    select.value = initial.slug;
    label.append(select);
    const availability = el('p', 'postal-detail__availability');
    availability.setAttribute('role', 'status');
    availability.setAttribute('aria-live', 'polite');
    const add = el('button', 'button primary postal-detail__add', 'Añadir al carrito ♡');
    add.type = 'button';
    const update = () => {
      const selected = choices.find(choice => choice.slug === select.value) || initial;
      img.src = imageUrl(selected, 1600);
      img.alt = `Postal ${title(selected)} de Gimae`;
      const linked = liveOption(selected);
      const correctPrice = linked && Number(linked.option.value) === 2000;
      add.disabled = !correctPrice || linked.stock === null || linked.stock <= 0 || !window.GIMAE_SHOP_CART;
      availability.textContent = !linked || !correctPrice || linked.stock === null
        ? 'Disponibilidad por confirmar en el catálogo.'
        : linked.stock === 0 ? 'Esta postal está agotada.' : linked.stock <= 3 ? 'Últimas unidades disponibles.' : 'Disponible para añadir al carrito.';
      add.textContent = linked?.stock === 0 ? 'Agotada por ahora' : 'Añadir al carrito ♡';
    };
    select.addEventListener('change', update);
    add.addEventListener('click', () => {
      const selected = choices.find(choice => choice.slug === select.value);
      const linked = selected && liveOption(selected);
      if (!linked || linked.stock === null || linked.stock <= 0 || Number(linked.option.value) !== 2000) return;
      window.GIMAE_SHOP_CART?.addToCart(linked.product.id, linked.option.id, 1);
      dialog.close();
    });
    info.append(heading, price, label, availability, add, el('p', 'postal-detail__note', 'Las imágenes muestran el diseño completo; la disponibilidad se confirma con el inventario de la tienda.'));
    layout.append(media, info);
    dialogContent.append(layout);
    update();
    dialog.showModal();
    document.body.classList.add('dialog-open');
    dialog.querySelector('[data-close-dialog]')?.focus();
  }

  function render() {
    document.querySelectorAll('.postales-chip').forEach(button => {
      const active = button.closest('#postales-collections') ? button.dataset.filter === selectedCollection : button.dataset.filter === selectedMember;
      button.setAttribute('aria-pressed', String(active));
    });
    const visible = items.filter(item => (!selectedCollection || item.collection === selectedCollection) &&
      (!selectedMember || item.variant === selectedMember));
    host.replaceChildren(...visible.map(card));
    count.textContent = `${visible.length} ${visible.length === 1 ? 'postal encontrada' : 'postales encontradas'}`;
    empty.hidden = visible.length > 0;
    clear.disabled = !selectedCollection && !selectedMember;
  }

  filterButtons('#postales-collections', collections, 'collection');
  filterButtons('#postales-members', members, 'member');
  clear.addEventListener('click', () => { selectedCollection = ''; selectedMember = ''; render(); });
  dialog.addEventListener('close', () => {
    dialog.classList.remove('postales-dialog');
    if (opener?.isConnected) opener.focus();
    opener = null;
  });
  render();
})();
