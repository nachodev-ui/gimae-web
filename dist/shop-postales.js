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
  const portraitSlugs = new Set(['postal_traje_suki','postal_traje_usi','postal_traje_vali','postal_traje_vewe','postal_verano_suki','postal_verano_usi','postal_verano_vali']);
  const fallbackItems = collections.flatMap(collection => names[collection.toLowerCase()].map(variant => ({
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
  const zoomDialog = document.querySelector('#postales-zoom');
  const zoomImage = zoomDialog?.querySelector('#postales-zoom-image');
  const zoomCaption = zoomDialog?.querySelector('#postales-zoom-caption');
  const zoomToggle = zoomDialog?.querySelector('#postales-zoom-toggle');
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
  const collectionProduct = collection => catalog.find(product => normalized(product.name) === `postales ${normalized(collection)}`);
  const items = collections.flatMap(collection => {
    const product = collectionProduct(collection);
    if (!product?.prices?.length) return product ? [] : fallbackItems.filter(item => item.collection === collection);
    return product.prices.map(option => {
      const variant = String(option.label).match(/(?:n[.º°o]*\s*)?(0[1-9])\b/i)?.[1] || String(option.label).trim();
      return { collection, variant, slug: `postal_${normalized(collection)}_${normalized(variant).replace(/[^a-z0-9]+/g, '_')}`, product, option };
    });
  });

  function liveOption(item) {
    if (item.product && item.option) {
      const stock = item.product.stockByVariant?.[item.option.id];
      return { product: item.product, option: item.option, stock: Number.isInteger(stock) ? stock : null };
    }
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

  function photo(item) {
    const linked = liveOption(item);
    if (linked && !linked.option.image) return null;
    const full = linked?.option.image || imageUrl(item, 1600);
    const known = full === imageUrl(item, 1600);
    return {
      full,
      thumbnail: known ? imageUrl(item, 600) : full,
      original: known ? imageUrl(item, 3000) : full
    };
  }

  function filterButtons(target, values, kind) {
    const host = document.querySelector(target);
    ['Todas', ...values].forEach(value => {
      const button = el('button', 'postales-chip', value);
      button.type = 'button';
      button.dataset.filter = value;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (kind === 'collection') selectedCollection = value === 'Todas' || selectedCollection === value ? '' : value;
        else selectedMember = value === 'Todas' || selectedMember === value ? '' : value;
        render();
      });
      host.append(button);
    });
  }

  function card(item, useFullImage) {
    const article = el('article', 'postal-card');
    article.style.setProperty('--tilt', `${(Math.random() * 3 - 1.5).toFixed(1)}deg`);
    const button = el('button', 'postal-card__open');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `Ver postal ${title(item)}`);
    const picture = el('span', 'postal-card__picture');
    const source = photo(item);
    if (source) {
      const img = el('img');
      img.src = useFullImage ? source.full : source.thumbnail;
      if (!useFullImage && source.thumbnail !== source.full) {
        const portrait = portraitSlugs.has(item.slug);
        img.srcset = `${source.thumbnail} ${portrait ? 400 : 600}w, ${source.full} ${portrait ? 1067 : 1600}w`;
        img.sizes = '(max-width: 680px) 45vw, 270px';
      }
      img.alt = `Postal ${title(item)} de Gimae`;
      img.width = 600; img.height = 750;
      img.loading = 'lazy'; img.decoding = 'async';
      picture.append(img);
    } else picture.append(el('span', 'postal-card__missing', 'Imagen por agregar ♡'));
    const stamp = el('span', 'postal-card__stamp', 'GIMAE!\n♡ POST');
    stamp.setAttribute('aria-hidden', 'true');
    const label = el('span', 'postal-card__label', item.collection.toUpperCase());
    const name = el('strong', 'postal-card__name', item.variant === '01' || item.variant === '02' || item.variant === '03' ? `Postal N.º ${item.variant}` : item.variant);
    const foot = el('span', 'postal-card__foot', `${money.format(liveOption(item)?.option.value ?? 2000)} · Ver postal ↗`);
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
    const zoomButton = el('button', 'postal-detail__zoom', 'Ver imagen en grande ↗');
    zoomButton.type = 'button';
    media.append(img, mediaNote, zoomButton);
    img.addEventListener('load', () => media.classList.toggle('is-portrait', img.naturalHeight > img.naturalWidth));
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
    zoomButton.addEventListener('click', () => {
      const selected = choices.find(choice => choice.slug === select.value) || initial;
      const source = photo(selected);
      if (!source || !zoomDialog || !zoomImage) return;
      zoomImage.src = source.original;
      zoomImage.alt = `Postal ${title(selected)} de Gimae en tamaño grande`;
      zoomImage.onerror = () => { if (zoomImage.src !== source.full) zoomImage.src = source.full; };
      zoomCaption.textContent = `Postal ${title(selected)} · vista ampliada`;
      zoomDialog.classList.remove('is-actual-size');
      zoomToggle.textContent = 'Ampliar al 100%';
      zoomToggle.setAttribute('aria-pressed', 'false');
      zoomDialog.showModal();
      zoomDialog.querySelector('[data-close-dialog]')?.focus();
    });
    const update = () => {
      const selected = choices.find(choice => choice.slug === select.value) || initial;
      const source = photo(selected);
      if (source) img.src = source.full;
      else img.removeAttribute('src');
      media.classList.toggle('has-no-image', !source);
      zoomButton.disabled = !source;
      img.alt = `Postal ${title(selected)} de Gimae`;
      const linked = liveOption(selected);
      const validPrice = linked && Number.isFinite(Number(linked.option.value)) && Number(linked.option.value) >= 0;
      price.textContent = money.format(validPrice ? Number(linked.option.value) : 2000);
      add.disabled = !validPrice || linked.stock === null || linked.stock <= 0 || !window.GIMAE_SHOP_CART;
      availability.textContent = !linked || !validPrice || linked.stock === null
        ? 'Disponibilidad por confirmar en el catálogo.'
        : linked.stock === 0 ? 'Esta postal está agotada.' : linked.stock <= 3 ? 'Últimas unidades disponibles.' : 'Disponible para añadir al carrito.';
      add.textContent = linked?.stock === 0 ? 'Agotada por ahora' : 'Añadir al carrito ♡';
    };
    select.addEventListener('change', update);
    add.addEventListener('click', () => {
      const selected = choices.find(choice => choice.slug === select.value);
      const linked = selected && liveOption(selected);
      if (!linked || linked.stock === null || linked.stock <= 0 || !Number.isFinite(Number(linked.option.value))) return;
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
      const chosen = button.closest('#postales-collections') ? selectedCollection : selectedMember;
      const active = button.dataset.filter === (chosen || 'Todas');
      button.setAttribute('aria-pressed', String(active));
    });
    const visible = items.filter(item => (!selectedCollection || item.collection === selectedCollection) &&
      (!selectedMember || item.variant === selectedMember));
    host.replaceChildren(...visible.map(item => card(item, visible.length <= 2)));
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
  zoomToggle?.addEventListener('click', () => {
    const actual = zoomDialog.classList.toggle('is-actual-size');
    zoomToggle.textContent = actual ? 'Ajustar a la pantalla' : 'Ampliar al 100%';
    zoomToggle.setAttribute('aria-pressed', String(actual));
  });
  zoomDialog?.addEventListener('close', () => {
    zoomImage.removeAttribute('src');
    dialogContent.querySelector('.postal-detail__zoom')?.focus();
  });
  render();
})();
