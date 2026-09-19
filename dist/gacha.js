/*
 * GACHA DE PHOTOCARDS
 * CONFIGURACIÓN: modifica aquí probabilidades y límite diario.
 * Las probabilidades pueden cambiar, pero deberían sumar 100.
 * El límite diario está DESACTIVADO por defecto; cambia enabled a true para usarlo.
 */
(() => {
  'use strict';

  const GACHA_CONFIG = {
    rarityWeights: { common: 70, rare: 25, ssr: 5 },
    dailyLimit: { enabled: false, freePacks: 5 },
    collectionStorageKey: 'gimae-gacha-collection-v1',
    dailyStorageKey: 'gimae-gacha-daily-v1'
  };

  /*
   * CATÁLOGO EDITABLE:
   * Para agregar una carta, copia un objeto y cambia serial, integrante, rareza,
   * frase e imagen. "imagen" debe ser una ruta relativa dentro de dist/.
   * crop acepta el mismo formato de object-position y zoom controla el acercamiento.
   */
  const CARD_CATALOG = [
    { serial: 'GIM-001', integrante: 'Suki', rareza: 'common', imagen: 'images/suki.webp', frase: 'Una sonrisa para guardar.', crop: '50% 28%', zoom: 1 },
    { serial: 'GIM-002', integrante: 'Usi', rareza: 'common', imagen: 'images/usi.webp', frase: 'Tu energía llegó al escenario.', crop: '50% 24%', zoom: 1 },
    { serial: 'GIM-003', integrante: 'Vewe', rareza: 'common', imagen: 'images/vewe.webp', frase: 'Un rayito de luz para ti.', crop: '50% 30%', zoom: 1 },
    { serial: 'GIM-004', integrante: 'Vali', rareza: 'common', imagen: 'images/vali.webp', frase: 'Que este recuerdo siga brillando.', crop: '50% 26%', zoom: 1 },
    { serial: 'GIM-005', integrante: 'Suki', rareza: 'rare', imagen: 'images/suki.webp', frase: 'Nuestro momento más rosado.', crop: '47% 20%', zoom: 1.1 },
    { serial: 'GIM-006', integrante: 'Usi', rareza: 'rare', imagen: 'images/usi.webp', frase: 'Rojo pasión, corazón idol.', crop: '53% 18%', zoom: 1.11 },
    { serial: 'GIM-007', integrante: 'Vewe', rareza: 'rare', imagen: 'images/vewe.webp', frase: 'Atrapa este destello amarillo.', crop: '54% 24%', zoom: 1.1 },
    { serial: 'GIM-008', integrante: 'Vali', rareza: 'rare', imagen: 'images/vali.webp', frase: 'Una melodía violeta para ti.', crop: '46% 22%', zoom: 1.12 },
    { serial: 'GIM-009', integrante: 'Suki', rareza: 'ssr', imagen: 'images/suki.webp', frase: 'Tu cariño enciende nuestro cielo.', crop: '50% 16%', zoom: 1.2 },
    { serial: 'GIM-010', integrante: 'Usi', rareza: 'ssr', imagen: 'images/usi.webp', frase: 'Este brillo nació para encontrarte.', crop: '50% 15%', zoom: 1.2 },
    { serial: 'GIM-011', integrante: 'Vewe', rareza: 'ssr', imagen: 'images/vewe.webp', frase: 'Juntas hacemos magia de verdad.', crop: '52% 18%', zoom: 1.21 },
    { serial: 'GIM-012', integrante: 'Vali', rareza: 'ssr', imagen: 'images/vali.webp', frase: 'Una estrella violeta solo para ti.', crop: '48% 17%', zoom: 1.2 }
  ];

  const RARITIES = {
    common: { label: 'Común', short: 'C', accent: '#d96e9f' },
    rare: { label: 'Rara', short: 'R', accent: '#7e7bd4' },
    ssr: { label: 'SSR', short: 'SSR', accent: '#c58a18' }
  };
  const RARITY_ORDER = ['common', 'rare', 'ssr'];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stage = document.querySelector('#gacha-stage');

  if (!stage) return;

  const openButton = document.querySelector('#gacha-open');
  const revealSlot = document.querySelector('#gacha-reveal-slot');
  const confettiHost = document.querySelector('#gacha-confetti');
  const status = document.querySelector('#gacha-status');
  const legend = document.querySelector('#rarity-legend');
  const albumGrid = document.querySelector('#gacha-album-grid');
  const progressText = document.querySelector('#gacha-progress-text');
  const progressBar = document.querySelector('#gacha-progress');
  const resetButton = document.querySelector('#gacha-reset');
  const storageNote = document.querySelector('#gacha-storage-note');
  const dailyNote = document.querySelector('#gacha-daily');
  const dialog = document.querySelector('#gacha-dialog');
  const dialogCard = document.querySelector('#gacha-dialog-card');
  const dialogTilt = document.querySelector('#gacha-dialog-tilt');
  const dialogClose = document.querySelector('#gacha-dialog-close');
  let busy = false;
  let viewerOpener = null;
  let storageAvailable = testStorage();
  let collection = readCollection();
  let memoryDaily = { date: localDateKey(), count: 0 };

  function testStorage() {
    try {
      const key = '__gimae_gacha_test__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readCollection() {
    if (!storageAvailable) return {};
    try {
      const parsed = JSON.parse(localStorage.getItem(GACHA_CONFIG.collectionStorageKey) || '{}');
      const cleaned = {};
      CARD_CATALOG.forEach(card => {
        const count = Number(parsed?.[card.serial]);
        if (Number.isInteger(count) && count > 0) cleaned[card.serial] = count;
      });
      return cleaned;
    } catch (error) {
      storageAvailable = false;
      return {};
    }
  }

  function saveCollection() {
    if (!storageAvailable) return;
    try {
      localStorage.setItem(GACHA_CONFIG.collectionStorageKey, JSON.stringify(collection));
    } catch (error) {
      storageAvailable = false;
      storageNote.hidden = false;
    }
  }

  function localDateKey() {
    const date = new Date();
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0')).join('-');
  }

  function readDailyState() {
    if (!GACHA_CONFIG.dailyLimit.enabled) return { date: localDateKey(), count: 0 };
    if (!storageAvailable) {
      if (memoryDaily.date !== localDateKey()) memoryDaily = { date: localDateKey(), count: 0 };
      return { ...memoryDaily };
    }
    try {
      const saved = JSON.parse(localStorage.getItem(GACHA_CONFIG.dailyStorageKey) || '{}');
      if (saved.date !== localDateKey()) return { date: localDateKey(), count: 0 };
      return { date: saved.date, count: Math.max(0, Number(saved.count) || 0) };
    } catch (error) {
      return { date: localDateKey(), count: 0 };
    }
  }

  function incrementDailyCount() {
    if (!GACHA_CONFIG.dailyLimit.enabled) return;
    const daily = readDailyState();
    daily.count += 1;
    memoryDaily = { ...daily };
    if (!storageAvailable) return;
    try {
      localStorage.setItem(GACHA_CONFIG.dailyStorageKey, JSON.stringify(daily));
    } catch (error) {
      storageAvailable = false;
      storageNote.hidden = false;
    }
  }

  function remainingPacks() {
    if (!GACHA_CONFIG.dailyLimit.enabled) return Infinity;
    return Math.max(0, GACHA_CONFIG.dailyLimit.freePacks - readDailyState().count);
  }

  function updateDailyUI() {
    if (!GACHA_CONFIG.dailyLimit.enabled) {
      dailyNote.hidden = true;
      openButton.disabled = busy;
      return;
    }
    const remaining = remainingPacks();
    dailyNote.hidden = false;
    dailyNote.textContent = `Sobres gratuitos disponibles hoy: ${remaining}/${GACHA_CONFIG.dailyLimit.freePacks}`;
    openButton.disabled = busy || remaining <= 0;
    if (remaining <= 0 && !busy) status.textContent = 'Ya abriste todos los sobres gratuitos de hoy. Vuelve mañana. ♡';
  }

  function memberAccent(name) {
    return window.GIMAE?.members?.find(member => member.name === name)?.accent || '#e84694';
  }

  function buildLegend() {
    legend.replaceChildren();
    RARITY_ORDER.forEach(rarity => {
      const chip = document.createElement('span');
      chip.className = `rarity-chip rarity-${rarity}`;
      chip.textContent = `${RARITIES[rarity].label} ${GACHA_CONFIG.rarityWeights[rarity]}%`;
      legend.append(chip);
    });
  }

  function createPhotocard(card, options = {}) {
    const interactive = Boolean(options.interactive);
    const element = document.createElement(interactive ? 'button' : 'article');
    if (interactive) element.type = 'button';
    element.className = `photocard rarity-${card.rareza}${options.compact ? ' is-compact' : ''}${options.viewer ? ' is-viewer' : ''}`;
    element.style.setProperty('--card-accent', memberAccent(card.integrante));
    element.dataset.serial = card.serial;
    if (interactive) element.setAttribute('aria-label', `Ver ${card.integrante}, carta ${RARITIES[card.rareza].label}, ${card.serial}`);

    const photo = document.createElement('div');
    photo.className = 'photocard-photo';
    const image = document.createElement('img');
    image.src = card.imagen;
    image.alt = `${card.integrante} en la photocard ${card.serial}`;
    image.loading = options.viewer || options.reveal ? 'eager' : 'lazy';
    image.style.objectPosition = card.crop || '50% 25%';
    image.style.setProperty('--card-zoom', String(card.zoom || 1));
    const shine = document.createElement('span');
    shine.className = 'photocard-shine';
    shine.setAttribute('aria-hidden', 'true');
    photo.append(image, shine);

    const top = document.createElement('div');
    top.className = 'photocard-top';
    const group = document.createElement('span');
    group.textContent = 'GIMAE!';
    const rarity = document.createElement('strong');
    rarity.textContent = RARITIES[card.rareza].short;
    top.append(group, rarity);

    const info = document.createElement('div');
    info.className = 'photocard-info';
    const name = document.createElement('h4');
    name.textContent = card.integrante;
    const phrase = document.createElement('p');
    phrase.textContent = card.frase;
    const serial = document.createElement('span');
    serial.textContent = card.serial;
    info.append(name, phrase, serial);
    element.append(top, photo, info);
    return element;
  }

  function createLockedCard(card) {
    const locked = document.createElement('article');
    locked.className = `photocard is-locked rarity-${card.rareza}`;
    locked.setAttribute('aria-label', 'Photocard todavía no obtenida');
    const image = document.createElement('img');
    image.className = 'locked-image';
    image.src = card.imagen;
    image.alt = '';
    image.loading = 'lazy';
    image.style.objectPosition = card.crop || '50% 25%';
    image.style.setProperty('--card-zoom', String(card.zoom || 1));
    const question = document.createElement('span');
    question.className = 'locked-question';
    question.textContent = '?';
    const label = document.createElement('span');
    label.className = 'locked-label';
    label.textContent = 'POR DESCUBRIR';
    locked.append(image, question, label);
    return locked;
  }

  function renderAlbum() {
    albumGrid.replaceChildren();
    let unique = 0;
    CARD_CATALOG.forEach(card => {
      const count = collection[card.serial] || 0;
      const slot = document.createElement('div');
      slot.className = 'album-slot';
      if (count > 0) {
        unique += 1;
        const cardButton = createPhotocard(card, { interactive: true, compact: true });
        cardButton.addEventListener('click', () => openViewer(card, cardButton));
        const duplicate = document.createElement('span');
        duplicate.className = 'duplicate-count';
        duplicate.textContent = `×${count}`;
        duplicate.setAttribute('aria-label', `${count} copias`);
        slot.append(cardButton, duplicate);
      } else {
        slot.append(createLockedCard(card));
      }
      albumGrid.append(slot);
    });
    progressText.textContent = `${unique}/${CARD_CATALOG.length}`;
    progressBar.max = CARD_CATALOG.length;
    progressBar.value = unique;
    storageNote.hidden = storageAvailable;
  }

  function rollRarity() {
    const total = RARITY_ORDER.reduce((sum, rarity) => sum + Math.max(0, Number(GACHA_CONFIG.rarityWeights[rarity]) || 0), 0);
    if (total <= 0) return 'common';
    let roll = Math.random() * total;
    for (const rarity of RARITY_ORDER) {
      roll -= Math.max(0, Number(GACHA_CONFIG.rarityWeights[rarity]) || 0);
      if (roll < 0) return rarity;
    }
    return 'common';
  }

  function drawCard() {
    const rarity = rollRarity();
    const pool = CARD_CATALOG.filter(card => card.rareza === rarity);
    const available = pool.length ? pool : CARD_CATALOG;
    return available[Math.floor(Math.random() * available.length)];
  }

  function pause(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function clearStage() {
    stage.classList.remove('is-shaking', 'is-opening', 'is-revealed', 'reveal-common', 'reveal-rare', 'reveal-ssr');
    revealSlot.replaceChildren();
    confettiHost.replaceChildren();
  }

  function createConfetti() {
    confettiHost.replaceChildren();
    const colors = ['#f0569d', '#ffd45e', '#9f79df', '#78d8ed', '#ffffff'];
    for (let index = 0; index < 28; index += 1) {
      const piece = document.createElement('span');
      piece.style.setProperty('--confetti-x', `${5 + Math.random() * 90}%`);
      piece.style.setProperty('--confetti-delay', `${Math.random() * 0.35}s`);
      piece.style.setProperty('--confetti-drift', `${-60 + Math.random() * 120}px`);
      piece.style.setProperty('--confetti-turn', `${180 + Math.random() * 540}deg`);
      piece.style.background = colors[index % colors.length];
      confettiHost.append(piece);
    }
  }

  async function openPack() {
    if (busy) return;
    if (remainingPacks() <= 0) {
      updateDailyUI();
      return;
    }

    busy = true;
    updateDailyUI();
    clearStage();
    status.textContent = 'El sobre está temblando…';
    stage.classList.add('is-shaking');
    await pause(reducedMotion.matches ? 60 : 680);
    stage.classList.remove('is-shaking');
    stage.classList.add('is-opening');
    status.textContent = '¡Algo está brillando!';
    await pause(reducedMotion.matches ? 60 : 620);

    const card = drawCard();
    const previousCount = collection[card.serial] || 0;
    collection[card.serial] = previousCount + 1;
    saveCollection();
    incrementDailyCount();
    renderAlbum();

    const cardButton = createPhotocard(card, { interactive: true, reveal: true });
    cardButton.classList.add('is-reveal-card');
    cardButton.addEventListener('click', () => openViewer(card, cardButton));
    revealSlot.append(cardButton);
    stage.classList.add('is-revealed', `reveal-${card.rareza}`);
    if (card.rareza === 'ssr') createConfetti();

    const copy = previousCount === 0 ? '¡Nueva!' : `¡Repetida! Ahora tienes ×${previousCount + 1}.`;
    status.textContent = `${copy} ${card.integrante} · ${RARITIES[card.rareza].label} · ${card.serial}`;
    await pause(reducedMotion.matches ? 80 : card.rareza === 'ssr' ? 1500 : card.rareza === 'rare' ? 900 : 650);
    busy = false;
    updateDailyUI();
  }

  function openViewer(card, opener) {
    viewerOpener = opener;
    dialogCard.replaceChildren(createPhotocard(card, { viewer: true }));
    resetTilt();
    dialog.showModal();
    document.body.classList.add('dialog-open');
  }

  function resetTilt() {
    dialogTilt.style.setProperty('--tilt-x', '0deg');
    dialogTilt.style.setProperty('--tilt-y', '0deg');
  }

  function closeViewer() {
    if (dialog.open) dialog.close();
  }

  function resetCollection() {
    if (!window.confirm('¿Quieres reiniciar tu álbum? Se borrarán todas las cartas y duplicados guardados en este dispositivo.')) return;
    collection = {};
    saveCollection();
    renderAlbum();
    clearStage();
    status.textContent = 'Tu álbum está vacío y listo para una nueva historia.';
  }

  openButton.addEventListener('click', openPack);
  resetButton.addEventListener('click', resetCollection);
  dialogClose.addEventListener('click', closeViewer);
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    resetTilt();
    viewerOpener?.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeViewer();
  });
  dialogTilt.addEventListener('pointermove', event => {
    if (reducedMotion.matches) return;
    const bounds = dialogTilt.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    dialogTilt.style.setProperty('--tilt-x', `${(-y * 14).toFixed(2)}deg`);
    dialogTilt.style.setProperty('--tilt-y', `${(x * 14).toFixed(2)}deg`);
  });
  dialogTilt.addEventListener('pointerleave', resetTilt);
  dialogTilt.addEventListener('pointercancel', resetTilt);

  buildLegend();
  renderAlbum();
  updateDailyUI();
})();
