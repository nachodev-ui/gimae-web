/*
 * GALERÍA DE PRODUCTOS GIMAE
 * Mejora progresiva sobre shop.js: las compras siguen pasando por los
 * controles originales para conservar validación, carrito y stock en un solo lugar.
 */
(() => {
  'use strict';

  const config = window.GIMAE || {};
  const catalog = Array.isArray(config.merch)
    ? config.merch.filter(product => product?.active !== false)
    : [];
  const productGrid = document.querySelector('#shop-product-grid');
  const productDialog = document.querySelector('#product-dialog');
  const productDialogContent = document.querySelector('#product-dialog-content');
  const money = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  });
  let returnFocus = null;

  if (!productGrid || !productDialog || !productDialogContent || !catalog.length) return;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function cleanText(value, maxLength = 180) {
    return String(value ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function assetPath(value) {
    const path = cleanText(value, 240);
    if (!path) return '';
    if (/^(?:https?:)?\/\//i.test(path)) return path;
    if (/^(?:javascript|data):/i.test(path)) return '';
    return path;
  }

  function productById(id) {
    return catalog.find(product => String(product.id) === String(id));
  }

  function optionsFor(product) {
    if (Array.isArray(product.prices) && product.prices.length) {
      return product.prices.map((option, index) => ({
        id: cleanText(option.id || `option-${index + 1}`, 40),
        label: cleanText(option.label || `Opción ${index + 1}`, 80),
        price: positiveNumber(option.value),
        image: assetPath(option.image),
        imageAlt: cleanText(option.imageAlt, 160),
        typeId: cleanText(option.typeId || option.id || `option-${index + 1}`, 40),
        typeLabel: cleanText(option.typeLabel || option.label || `Opción ${index + 1}`, 60),
        memberId: cleanText(option.memberId, 40),
        memberLabel: cleanText(option.memberLabel, 60)
      })).filter(option => option.id && option.price !== null);
    }

    if (product.variantSource === 'members') {
      return (config.members || []).map(member => ({
        id: cleanText(member.id, 40),
        label: cleanText(`${member.name} · ${member.colorLabel}`, 60),
        price: positiveNumber(product.price),
        image: assetPath(product.image),
        imageAlt: cleanText(product.imageAlt, 160),
        typeId: cleanText(member.id, 40),
        typeLabel: cleanText(`${member.name} · ${member.colorLabel}`, 60),
        memberId: '',
        memberLabel: ''
      })).filter(option => option.id && option.price !== null);
    }

    const price = positiveNumber(product.price);
    return price === null ? [] : [{
      id: 'default',
      label: '',
      price,
      image: assetPath(product.image),
      imageAlt: cleanText(product.imageAlt, 160),
      typeId: 'default',
      typeLabel: '',
      memberId: '',
      memberLabel: ''
    }];
  }

  function hasSplitVariant(options) {
    return options.some(option => option.memberId);
  }

  function typeChoices(options) {
    const seen = new Set();
    return options.reduce((choices, option) => {
      if (!option.typeId || seen.has(option.typeId)) return choices;
      seen.add(option.typeId);
      choices.push({ id: option.typeId, label: option.typeLabel || option.label || option.typeId });
      return choices;
    }, []);
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

  function galleryFor(product) {
    const seen = new Set();
    const gallery = [];
    const push = (srcValue, altValue) => {
      const src = assetPath(srcValue);
      if (!src || seen.has(src)) return;
      seen.add(src);
      gallery.push({
        src,
        alt: cleanText(altValue || product.imageAlt || product.name, 160)
      });
    };

    push(product.image, product.imageAlt);
    if (Array.isArray(product.gallery)) {
      product.gallery.forEach(item => {
        if (typeof item === 'string') push(item, product.imageAlt);
        else if (item && typeof item === 'object') push(item.src, item.alt);
      });
    }
    optionsFor(product).forEach(option => push(option.image, option.imageAlt));
    return gallery;
  }

  function cardFor(productId) {
    return productGrid.querySelector(`.shop-product-card[data-product-id="${CSS.escape(String(productId))}"]`);
  }

  function canonicalVariant(card) {
    return card?.querySelector('.shop-variant-canonical') || card?.querySelector('.shop-variant') || null;
  }

  function selectedCardOption(product, card) {
    const options = optionsFor(product);
    const select = canonicalVariant(card);
    return options.find(option => option.id === select?.value) || options[0] || null;
  }

  function syncCardMedia(card, option) {
    const image = card?.querySelector('.shop-product-media img');
    if (!image || !option) return;
    const src = option.image || '';
    if (!src) return;
    image.src = src;
    image.alt = option.imageAlt || image.alt;
  }

  function enhanceSplitCardControls(product, card) {
    const options = optionsFor(product);
    if (!hasSplitVariant(options)) return;

    const controls = card.querySelector('.shop-buy-controls');
    const canonical = controls?.querySelector('.shop-variant');
    if (!controls || !canonical || controls.dataset.splitVariant === 'true') return;

    controls.dataset.splitVariant = 'true';
    canonical.classList.add('shop-variant-canonical');
    canonical.hidden = true;
    canonical.tabIndex = -1;
    canonical.setAttribute('aria-hidden', 'true');

    const typeSelect = element('select', 'shop-variant shop-variant-type');
    typeSelect.setAttribute('aria-label', cleanText(product.variantLabel || 'Tipo', 60));
    typeChoices(options).forEach(choice => {
      const item = element('option', '', choice.label);
      item.value = choice.id;
      typeSelect.append(item);
    });

    const memberSelect = element('select', 'shop-variant shop-variant-member');
    memberSelect.setAttribute('aria-label', cleanText(product.memberVariantLabel || 'Integrante', 60));

    controls.insertBefore(typeSelect, canonical);
    controls.insertBefore(memberSelect, canonical);

    let syncing = false;

    function currentOption() {
      return options.find(option => option.id === canonical.value) || options[0] || null;
    }

    function fillMembers(typeId, preferredMemberId = '') {
      const candidates = options.filter(option => option.typeId === typeId);
      const members = candidates.filter(option => option.memberId);
      memberSelect.replaceChildren();

      if (!members.length) {
        memberSelect.hidden = true;
        const choice = candidates[0] || options[0];
        if (choice) canonical.value = choice.id;
        return;
      }

      memberSelect.hidden = false;
      members.forEach(option => {
        const item = element('option', '', option.memberLabel || option.label);
        item.value = option.memberId;
        memberSelect.append(item);
      });

      const chosen = members.find(option => option.memberId === preferredMemberId) || members[0];
      memberSelect.value = chosen.memberId;
      canonical.value = chosen.id;
    }

    function syncVisibleFromCanonical() {
      const option = currentOption();
      if (!option) return;
      syncing = true;
      typeSelect.value = option.typeId;
      fillMembers(option.typeId, option.memberId);
      syncing = false;
      syncCardMedia(card, option);
    }

    function commitVisibleSelection() {
      if (syncing) return;
      const candidates = options.filter(option => option.typeId === typeSelect.value);
      const memberOptions = candidates.filter(option => option.memberId);
      const option = memberOptions.length
        ? memberOptions.find(item => item.memberId === memberSelect.value) || memberOptions[0]
        : candidates[0];

      if (!option) return;
      canonical.value = option.id;
      canonical.dispatchEvent(new Event('change', { bubbles: true }));
      syncCardMedia(card, option);
    }

    typeSelect.addEventListener('change', () => {
      const previousMember = currentOption()?.memberId || memberSelect.value;
      syncing = true;
      fillMembers(typeSelect.value, previousMember);
      syncing = false;
      commitVisibleSelection();
    });
    memberSelect.addEventListener('change', commitVisibleSelection);
    canonical.addEventListener('change', syncVisibleFromCanonical);

    syncVisibleFromCanonical();
  }

  function addThroughOriginalControls(product, optionId, quantity) {
    const card = cardFor(product.id);
    if (!card) return false;

    const cardVariant = canonicalVariant(card);
    const cardQuantity = card.querySelector('.shop-quantity');
    const cardAdd = card.querySelector('.add-cart');
    if (!cardQuantity || !cardAdd) return false;

    if (cardVariant) {
      cardVariant.value = optionId;
      cardVariant.dispatchEvent(new Event('change', { bubbles: true }));
    }
    cardQuantity.value = String(quantity);
    cardQuantity.dispatchEvent(new Event('change', { bubbles: true }));
    cardAdd.click();
    return true;
  }

  function setHeroMedia(heroImage, heroPlaceholder, src, alt) {
    const safeSrc = assetPath(src);
    if (!safeSrc) {
      heroImage.hidden = true;
      heroImage.removeAttribute('src');
      heroPlaceholder.hidden = false;
      return;
    }
    heroPlaceholder.hidden = true;
    heroImage.hidden = false;
    heroImage.src = safeSrc;
    heroImage.alt = cleanText(alt || 'Imagen del producto', 160);
  }

  function openProduct(product, opener) {
    const options = optionsFor(product);
    const gallery = galleryFor(product);
    const card = cardFor(product.id);
    const cardVariant = canonicalVariant(card);
    let selectedOptionId = options.some(option => option.id === cardVariant?.value)
      ? cardVariant.value
      : (options[0]?.id || 'default');
    let activeMediaSrc = '';

    productDialogContent.replaceChildren();
    productDialog.classList.add('product-gallery-dialog');

    const layout = element('div', `product-detail-layout product-detail-layout--${cleanText(product.color, 20)}`);
    const mediaColumn = element('div', 'product-gallery-column');
    const stage = element('div', 'product-gallery-stage');
    const heroImage = element('img', 'product-gallery-hero');
    heroImage.decoding = 'async';
    const heroPlaceholder = element('div', 'product-gallery-placeholder');
    heroPlaceholder.hidden = true;
    heroPlaceholder.append(
      element('span', '', '✦'),
      element('strong', '', 'Imagen por publicar'),
      element('small', '', 'El producto sigue disponible para consultar.')
    );
    stage.append(heroImage, heroPlaceholder);

    const thumbs = element('div', 'product-gallery-thumbs');
    thumbs.setAttribute('aria-label', 'Vistas del producto');
    mediaColumn.append(stage, thumbs);

    const info = element('div', 'product-detail-info');
    info.append(element('p', 'eyebrow', `GIMAE! GOODIE · NO. ${cleanText(product.id, 10)}`));
    const title = element('h2', '', cleanText(product.name, 80));
    title.id = 'product-dialog-title';
    const note = element('p', 'product-detail-note', cleanText(product.note, 180));
    const description = element(
      'p',
      'product-detail-description',
      cleanText(product.description || product.note, 500)
    );
    const price = element('strong', 'product-detail-price');
    const availability = element('p', 'product-detail-stock');
    availability.setAttribute('aria-live', 'polite');
    info.append(title, note, description, price, availability);

    const form = element('div', 'product-detail-purchase');
    const split = hasSplitVariant(options);
    let variantSelect = null;
    let typeSelect = null;
    let memberSelect = null;
    let memberLabel = null;

    if (options.length > 1) {
      const variantField = element('label', 'product-detail-field');
      variantField.append(element('span', '', cleanText(product.variantLabel || 'Variante', 60)));

      if (split) {
        typeSelect = element('select', 'shop-variant product-detail-variant product-detail-type');
        typeChoices(options).forEach(choice => {
          const item = element('option', '', choice.label);
          item.value = choice.id;
          typeSelect.append(item);
        });
        variantField.append(typeSelect);

        memberLabel = element('span', 'product-detail-member-label', cleanText(product.memberVariantLabel || 'Integrante', 60));
        memberSelect = element('select', 'shop-variant product-detail-member');
        variantField.append(memberLabel, memberSelect);
      } else {
        variantSelect = element('select', 'shop-variant product-detail-variant');
        options.forEach(option => {
          const item = element('option', '', option.label || 'Única opción');
          item.value = option.id;
          variantSelect.append(item);
        });
        variantField.append(variantSelect);
      }

      form.append(variantField);
    }

    const quantityField = element('label', 'product-detail-field product-detail-field--quantity');
    quantityField.append(element('span', '', 'Cantidad'));
    const quantity = element('input', 'shop-quantity product-detail-quantity');
    quantity.type = 'number';
    quantity.min = '1';
    quantity.step = '1';
    quantity.value = '1';
    quantity.inputMode = 'numeric';
    quantityField.append(quantity);

    const addButton = element('button', 'button primary product-detail-add', 'Agregar al carrito ♡');
    addButton.type = 'button';
    form.append(quantityField, addButton);

    const honesty = element(
      'p',
      'product-detail-honesty',
      'Si la disponibilidad aparece por confirmar, el equipo debe validarla antes de confirmar el pedido.'
    );
    info.append(form, honesty);
    layout.append(mediaColumn, info);
    productDialogContent.append(layout);

    function selectedOption() {
      return options.find(option => option.id === selectedOptionId) || options[0] || null;
    }

    function syncVariantUI() {
      const option = selectedOption();
      if (!option) return;

      if (variantSelect) {
        variantSelect.value = option.id;
        return;
      }

      if (!typeSelect || !memberSelect || !memberLabel) return;
      typeSelect.value = option.typeId;
      const memberOptions = options.filter(item => item.typeId === option.typeId && item.memberId);
      memberSelect.replaceChildren();

      if (!memberOptions.length) {
        memberLabel.hidden = true;
        memberSelect.hidden = true;
        return;
      }

      memberOptions.forEach(item => {
        const node = element('option', '', item.memberLabel || item.label);
        node.value = item.memberId;
        memberSelect.append(node);
      });
      memberLabel.hidden = false;
      memberSelect.hidden = false;
      memberSelect.value = option.memberId || memberOptions[0].memberId;
    }

    function markActiveThumb() {
      thumbs.querySelectorAll('.product-gallery-thumb').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.src === activeMediaSrc));
      });
    }

    function showMedia(src, alt) {
      activeMediaSrc = assetPath(src);
      setHeroMedia(heroImage, heroPlaceholder, activeMediaSrc, alt);
      markActiveThumb();
    }

    function syncOption(changeMedia = true) {
      const option = selectedOption();
      syncVariantUI();

      if (!option) {
        price.textContent = 'Precio por confirmar';
        availability.textContent = 'Disponibilidad por confirmar';
        quantity.max = '1';
        addButton.disabled = true;
        return;
      }

      price.textContent = money.format(option.price);
      availability.textContent = stockLabel(product, option.id);
      const stock = stockFor(product, option.id);
      quantity.max = String(stock ?? 99);
      if (stock === 0) quantity.value = '1';
      else if (Number(quantity.value) > Number(quantity.max)) quantity.value = quantity.max;
      addButton.disabled = stock === 0;
      addButton.textContent = stock === 0 ? 'Agotado' : 'Agregar al carrito ♡';

      if (changeMedia) {
        const src = option.image || product.image || gallery[0]?.src || '';
        const alt = option.imageAlt || product.imageAlt || gallery[0]?.alt || product.name;
        showMedia(src, alt);
      }
    }

    function selectSplitOption(typeId, preferredMemberId = '') {
      const candidates = options.filter(option => option.typeId === typeId);
      const memberOptions = candidates.filter(option => option.memberId);
      const option = memberOptions.length
        ? memberOptions.find(item => item.memberId === preferredMemberId) || memberOptions[0]
        : candidates[0];

      if (!option) return;
      selectedOptionId = option.id;
      syncOption(true);
    }

    gallery.forEach((item, index) => {
      const button = element('button', 'product-gallery-thumb');
      button.type = 'button';
      button.dataset.src = item.src;
      button.setAttribute('aria-label', `Ver imagen ${index + 1} de ${cleanText(product.name, 70)}`);
      button.setAttribute('aria-pressed', 'false');
      const image = element('img', '');
      image.src = item.src;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      button.append(image);
      button.addEventListener('click', () => {
        const matches = options.filter(option => option.image && option.image === item.src);
        if (matches.length) {
          const currentMember = selectedOption()?.memberId || '';
          const matchingOption = matches.find(option => option.memberId === currentMember) || matches[0];
          selectedOptionId = matchingOption.id;
          syncOption(false);
        }
        showMedia(item.src, item.alt);
      });
      thumbs.append(button);
    });

    if (gallery.length <= 1) thumbs.hidden = true;

    variantSelect?.addEventListener('change', () => {
      selectedOptionId = variantSelect.value;
      syncOption(true);
    });

    typeSelect?.addEventListener('change', () => {
      selectSplitOption(typeSelect.value, selectedOption()?.memberId || memberSelect?.value || '');
    });

    memberSelect?.addEventListener('change', () => {
      selectSplitOption(typeSelect.value, memberSelect.value);
    });

    quantity.addEventListener('change', () => {
      const max = Math.max(1, Number(quantity.max) || 99);
      quantity.value = String(Math.max(1, Math.min(max, Math.trunc(Number(quantity.value) || 1))));
    });

    addButton.addEventListener('click', () => {
      const option = selectedOption();
      if (!option) return;
      const max = Math.max(1, Number(quantity.max) || 99);
      const amount = Math.max(1, Math.min(max, Math.trunc(Number(quantity.value) || 1)));
      quantity.value = String(amount);
      if (addThroughOriginalControls(product, option.id, amount)) {
        addButton.classList.add('is-confirmed');
        window.setTimeout(() => addButton.classList.remove('is-confirmed'), 700);
      }
    });

    if (!gallery.length) thumbs.hidden = true;
    syncOption(true);

    returnFocus = opener instanceof HTMLElement ? opener : document.activeElement;
    if (!productDialog.open) {
      productDialog.showModal();
      document.body.classList.add('dialog-open');
    }
    requestAnimationFrame(() => productDialog.querySelector('[data-close-dialog]')?.focus());
  }

  function enhanceCards() {
    const cards = [...productGrid.querySelectorAll('.shop-product-card')];
    catalog.forEach((product, index) => {
      const card = cards[index];
      if (!card) return;
      card.dataset.productId = String(product.id);

      enhanceSplitCardControls(product, card);

      if (card.querySelector('.shop-product-media')) {
        syncCardMedia(card, selectedCardOption(product, card));
        return;
      }

      const mediaButton = element('button', 'shop-product-media');
      mediaButton.type = 'button';
      mediaButton.setAttribute('aria-label', `Ver detalle de ${cleanText(product.name, 80)}`);
      const src = assetPath(product.image);
      if (src) {
        const image = element('img', '');
        image.src = src;
        image.alt = cleanText(product.imageAlt || product.name, 160);
        image.loading = 'lazy';
        image.decoding = 'async';
        mediaButton.append(image);
      } else {
        const placeholder = element('span', 'shop-product-media-placeholder');
        placeholder.append(element('span', '', '✦'), element('small', '', 'Imagen por publicar'));
        mediaButton.append(placeholder);
      }
      mediaButton.append(element('span', 'shop-product-media-action', 'VER ♡'));
      mediaButton.addEventListener('click', () => openProduct(product, mediaButton));

      const top = card.querySelector('.product-top');
      if (top) top.insertAdjacentElement('afterend', mediaButton);
      else card.prepend(mediaButton);

      syncCardMedia(card, selectedCardOption(product, card));
    });
  }

  /* El handler original de "Ver detalle" vive dentro de shop.js. Interceptamos
     solo ese click en captura para conservar intacto el resto del carrito. */
  productGrid.addEventListener('click', event => {
    const detail = event.target.closest('.shop-detail-button');
    if (!detail || !productGrid.contains(detail)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = detail.closest('.shop-product-card');
    const product = productById(card?.dataset.productId);
    if (product) openProduct(product, detail);
  }, true);

  productDialog.addEventListener('close', () => {
    productDialog.classList.remove('product-gallery-dialog');
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  });

  enhanceCards();
  if (!productGrid.querySelector('.shop-product-media')) requestAnimationFrame(enhanceCards);
})();
