/* Purchase bonus Gacha. Credits and draws are authorized by the server. */
(async () => {
  'use strict';
  await window.GIMAE_READY;

  const GACHA_CONFIG = {
    rarityWeights: { common: 70, rare: 25, ssr: 5 },
    collectionStorageKey: 'gimae-gacha-collection-v1'
  };

  let CARD_CATALOG = [];
  let legacyCollection = {};
  const obtainedCards = new Map();
  let liveSettings;
  let vouchers = [];
  let sessionToken;
  let pendingDraw;
  let viewerCard;
  let storyFile;
  let serviceReady = false;
  const settings = window.GIMAE_SUPABASE;
  const tokenKey = 'gimae-gacha-token-v1';
  const pendingKey = 'gimae-gacha-pending-v1';
  const codeHistoryKey = 'gimae-gacha-code-history-v1';
  const orderCodePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const money = n => new Intl.NumberFormat('es-CL', {style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n);
  async function api(action, extra = {}) {
    const response = await fetch(`${settings.url}/functions/v1/gacha`, {
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
      body:JSON.stringify({action,token:sessionToken,...extra})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No pudimos conectar con el Gacha.');
    return result;
  }
  async function restoreCredits() {
    const data = await api('state');
    vouchers = data.vouchers;
    syncRedeemedCodeHistory();
    const counts = {};
    obtainedCards.clear();
    for (const voucher of vouchers) for (const card of voucher.cards) {
      obtainedCards.set(card.serial,card);
      counts[card.serial] = (counts[card.serial] || 0) + 1;
      if (!CARD_CATALOG.some(c => c.serial === card.serial)) CARD_CATALOG.push(card);
    }
    collection = {...legacyCollection};
    for (const [serial,count] of Object.entries(counts)) collection[serial] = (legacyCollection[serial] || 0) + count;
    saveCollection();renderAlbum();updateDailyUI();
  }
  async function initializeService() {
    try {
      if (!storageAvailable) throw new Error('Permite el almacenamiento del navegador antes de canjear: lo usamos para conservar tus tiradas.');
      sessionToken = localStorage.getItem(tokenKey);
      if (!/^[0-9a-f]{64}$/.test(sessionToken || '')) {
        sessionToken = Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
        localStorage.setItem(tokenKey,sessionToken);
      }
      pendingDraw = JSON.parse(localStorage.getItem(pendingKey) || 'null');
      const get = async table => {
        const res = await fetch(`${settings.url}/rest/v1/${table}?select=*`, {headers:{apikey:settings.publishableKey},signal:AbortSignal.timeout(10000)});
        if (!res.ok) throw new Error('El Gacha está en mantenimiento. Intenta más tarde.');
        return res.json();
      };
      const [config,cards] = await Promise.all([get('gacha_settings'),get('gacha_cards')]);
      liveSettings = config[0];
      if (!liveSettings) throw new Error('El Gacha todavía no está disponible.');
      CARD_CATALOG = cards.sort((a,b)=>a.display_order-b.display_order);
      RARITY_ORDER.forEach(key => {
        RARITIES[key].label = liveSettings.rarities[key].label;
        RARITIES[key].short = liveSettings.rarities[key].label;
        GACHA_CONFIG.rarityWeights[key] = Number(liveSettings.rarities[key].weight);
      });
      const baselineKey = 'gimae-gacha-legacy-v1';
      const baseline = localStorage.getItem(baselineKey);
      legacyCollection = baseline ? JSON.parse(baseline) : readCollection();
      if (!baseline) localStorage.setItem(baselineKey,JSON.stringify(legacyCollection));
      collection = {...legacyCollection};
      document.querySelector('#gacha-redeem-info').textContent = `Cada pedido pagado con ${money(liveSettings.minimum_clp)} o más en productos te regala ${liveSettings.pulls_per_order} sobres. El envío no cuenta. Cada pedido se canjea una sola vez.`;
      buildLegend();await restoreCredits();
      serviceReady = true;updateDailyUI();
      if (pendingDraw) status.textContent = 'Hay una tirada pendiente de recuperar. Presiona Abrir sobre para ver el resultado.';
    } catch(error) {
      status.textContent = error.message;
      window.GIMAE_UI.toast({tone:'error',title:'No pudimos cargar el Gacha',message:error.message});
    }
  }


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
  const redeemForm = document.querySelector('#gacha-redeem');
  const codeInput = document.querySelector('#gacha-order-code');
  const redeemButton = redeemForm.querySelector('button[type="submit"]');
  const redeemMessage = document.querySelector('#gacha-redeem-message');
  const historyToggle = document.querySelector('#gacha-history-toggle');
  const historyPanel = document.querySelector('#gacha-code-history');
  const historyList = document.querySelector('#gacha-history-list');
  const historyCount = document.querySelector('#gacha-history-count');
  const historyEmpty = document.querySelector('#gacha-history-empty');
  const historyNote = document.querySelector('#gacha-history-note');
  const historyFeedback = document.querySelector('#gacha-history-feedback');
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
  let displayedPacks = null;
  let viewerOpener = null;
  let storageAvailable = testStorage();
  let collection = readCollection();
  let historyAvailable = storageAvailable;
  let codeHistory = readCodeHistory();

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

  function remainingPacks() { return vouchers.reduce((sum,v)=>sum+v.remaining,0); }
  function updateDailyUI() {
    dailyNote.hidden = false;
    dailyNote.textContent = `Sobres de tus pedidos: ${displayedPacks ?? remainingPacks()}`;
    openButton.disabled = busy || !serviceReady;
    redeemButton.disabled = busy || !serviceReady;
  }

  function readCodeHistory() {
    if (!historyAvailable) return [];
    try {
      const saved = JSON.parse(localStorage.getItem(codeHistoryKey) || '[]');
      return Array.isArray(saved) ? saved.filter(entry =>
        entry && typeof entry.code === 'string' && entry.code.length > 0 && entry.code.length <= 36 &&
        ['redeemed', 'failed'].includes(entry.status) &&
        (entry.at === null || (Number.isFinite(entry.at) && entry.at > 0 && entry.at <= Date.now() + 86400000))
      ).slice(0, 30) : [];
    } catch (error) {
      historyAvailable = false;
      return [];
    }
  }

  function showRedeemMessage(message, tone = 'error') {
    redeemMessage.textContent = message;
    redeemMessage.dataset.tone = tone;
    redeemMessage.hidden = !message;
    codeInput.setAttribute('aria-invalid', String(Boolean(message) && tone === 'error'));
  }

  function renderCodeHistory() {
    historyList.replaceChildren();
    historyCount.textContent = `${codeHistory.length} ${codeHistory.length === 1 ? 'registro' : 'registros'}`;
    historyEmpty.hidden = codeHistory.length > 0;
    if (!historyAvailable) historyNote.textContent = 'Este navegador no permite guardar el historial. Conserva tus códigos en un lugar privado para pedir ayuda si la necesitas.';
    for (const entry of codeHistory) {
      const item = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'gacha-history-meta';
      const state = document.createElement('span');
      state.className = 'gacha-history-state';
      state.dataset.state = entry.status;
      state.textContent = entry.status === 'redeemed' ? 'Canjeado' : 'Intento fallido';
      const when = document.createElement('span');
      when.textContent = entry.at === null ? 'Recuperado de tu colección' :
        new Intl.DateTimeFormat('es-CL', {dateStyle:'short',timeStyle:'short'}).format(entry.at);
      const code = document.createElement('code');
      code.textContent = entry.code;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'gacha-history-copy';
      copy.textContent = 'Copiar';
      copy.setAttribute('aria-label', `Copiar código ${entry.code}`);
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(entry.code);
          historyFeedback.textContent = 'Código copiado. Compártelo solo con soporte si necesitas ayuda.';
        } catch (error) {
          historyFeedback.textContent = 'No pudimos copiarlo. Selecciona el código y cópialo manualmente.';
        }
        historyFeedback.hidden = false;
      });
      meta.append(state, when);
      item.append(meta, code, copy);
      historyList.append(item);
    }
  }

  function saveCodeHistory() {
    if (historyAvailable) {
      try { localStorage.setItem(codeHistoryKey, JSON.stringify(codeHistory)); }
      catch (error) { historyAvailable = false; }
    }
    renderCodeHistory();
  }

  function rememberCodeAttempt(code, status) {
    codeHistory.unshift({code, status, at:Date.now()});
    codeHistory = codeHistory.slice(0, 30);
    saveCodeHistory();
  }

  function syncRedeemedCodeHistory() {
    const redeemed = new Set(codeHistory.filter(entry => entry.status === 'redeemed').map(entry => entry.code));
    const recovered = vouchers.filter(voucher => orderCodePattern.test(voucher.orderCode) && !redeemed.has(voucher.orderCode))
      .map(voucher => {
        redeemed.add(voucher.orderCode);
        return {code:voucher.orderCode, status:'redeemed', at:null};
      });
    if (recovered.length) {
      codeHistory = [...recovered, ...codeHistory].slice(0, 30);
      saveCodeHistory();
    } else renderCodeHistory();
  }

  async function animateRedeemedPacks(previousPacks) {
    if (remainingPacks() <= previousPacks || reducedMotion.matches) {
      displayedPacks = null;
      updateDailyUI();
      return;
    }
    const source = redeemButton.getBoundingClientRect();
    const destination = dailyNote.getBoundingClientRect();
    const startX = source.left + source.width / 2 + window.scrollX;
    const startY = source.top + source.height / 2 + window.scrollY;
    const travelX = destination.left + destination.width / 2 + window.scrollX - startX;
    const travelY = destination.top + destination.height / 2 + window.scrollY - startY;
    const sparkles = document.createElement('div');
    sparkles.className = 'gacha-credit-sparkles';
    sparkles.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 12; index += 1) {
      const sparkle = document.createElement('span');
      sparkle.textContent = index % 3 === 0 ? '♡' : '✦';
      sparkle.style.left = `${startX}px`;
      sparkle.style.top = `${startY}px`;
      sparkle.style.setProperty('--spark-x', `${travelX}px`);
      sparkle.style.setProperty('--spark-y', `${travelY}px`);
      sparkle.style.setProperty('--spark-mid-x', `${travelX * 0.5 + (index - 5.5) * 14}px`);
      sparkle.style.setProperty('--spark-mid-y', `${travelY * 0.5 - 34}px`);
      sparkle.style.setProperty('--spark-delay', `${index * 0.025}s`);
      sparkles.append(sparkle);
    }
    document.body.append(sparkles);
    if (destination.top > window.innerHeight * 0.9 || destination.bottom < 0) {
      dailyNote.scrollIntoView({behavior:'smooth',block:'center'});
    }
    try { await pause(2300); }
    finally {
      sparkles.remove();
      displayedPacks = null;
      updateDailyUI();
      dailyNote.classList.add('is-credit-arrival');
      window.setTimeout(() => dailyNote.classList.remove('is-credit-arrival'), 650);
    }
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
    rarity.textContent = card.rarityLabel || RARITIES[card.rareza].short;
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
        const obtained = obtainedCards.get(card.serial) || card;
        const cardButton = createPhotocard(obtained, { interactive: true, compact: true });
        cardButton.addEventListener('click', () => openViewer(obtained, cardButton));
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

  function pause(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function clearStage() {
    stage.classList.remove('is-shaking', 'is-opening', 'is-revealed', 'reveal-common', 'reveal-rare', 'reveal-ssr', 'is-special');
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
    if (!pendingDraw && remainingPacks() <= 0) {
      const message = vouchers.length ? 'Ya abriste todos los sobres de tus pedidos. Canjea otro pedido para seguir jugando.'
        : codeInput.value.trim() ? 'Aún no has canjeado tu pedido. Presiona «Canjear mis sobres» antes de abrir uno.'
          : 'Ingresa y canjea el código de tu pedido para recibir sobres antes de abrir uno.';
      status.textContent = message;
      status.classList.add('is-notice');
      return;
    }

    busy = true;
    status.classList.remove('is-notice');
    updateDailyUI();
    clearStage();
    let card;
    try {
      if (!pendingDraw) {
        const nextDraw = {orderCode:vouchers.find(v=>v.remaining>0).orderCode,requestId:crypto.randomUUID()};
        localStorage.setItem(pendingKey,JSON.stringify(nextDraw));
        pendingDraw = nextDraw;
      }
      status.textContent = 'Preparando tu sobre…';
      const result = await api('draw',pendingDraw);
      card = result.card;
      await restoreCredits();
      localStorage.removeItem(pendingKey);pendingDraw = null;
      if (!CARD_CATALOG.some(c=>c.serial===card.serial)) CARD_CATALOG.push(card);
    } catch(error) {
      status.textContent = error.message;busy=false;updateDailyUI();
      window.GIMAE_UI.toast({tone:'error',title:'Tu sobre está a salvo',message:error.message});
      return;
    }
    status.textContent = 'El sobre está temblando…';
    stage.classList.add('is-shaking');
    await pause(reducedMotion.matches ? 60 : 680);
    stage.classList.remove('is-shaking');
    stage.classList.add('is-opening');
    status.textContent = '¡Algo está brillando!';
    await pause(reducedMotion.matches ? 60 : 620);


    const previousCount = Math.max(0,(collection[card.serial] || 1) - 1);
    renderAlbum();

    const cardButton = createPhotocard(card, { interactive: true, reveal: true });
    cardButton.classList.add('is-reveal-card');
    cardButton.addEventListener('click', () => openViewer(card, cardButton));
    revealSlot.append(cardButton);
    stage.classList.add('is-revealed', `reveal-${card.rareza}`);
    if (card.special) {
      stage.classList.add('is-special');createConfetti();
      status.textContent = '¡Una estrella extraordinaria ha aparecido!';
    }

    const copy = previousCount === 0 ? '¡Nueva!' : `¡Repetida! Ahora tienes ×${previousCount + 1}.`;
    status.textContent = `${card.special ? '✦ ¡DESTELLO ESPECIAL! ' : ''}${copy} ${card.integrante} · ${RARITIES[card.rareza].label} · ${card.serial}`;
    await pause(reducedMotion.matches ? 80 : card.rareza === 'ssr' ? 1500 : card.rareza === 'rare' ? 900 : 650);
    busy = false;
    updateDailyUI();
    if (card.special) openViewer(card,cardButton);
  }

  function openViewer(card, opener) {
    viewerOpener = opener;
    viewerCard = card;storyFile = null;
    dialog.classList.toggle('is-special',Boolean(card.special));
    document.querySelector('#gacha-dialog-title').textContent = card.special ? '¡Encontraste un destello especial!' : 'Una estrella en tu colección.';
    document.querySelector('#gacha-story-share').disabled = true;
    document.querySelector('#gacha-story-download').disabled = true;
    document.querySelector('#gacha-story-status').textContent = 'Preparando tu imagen para Stories…';
    prepareStory(card);
    dialogCard.replaceChildren(createPhotocard(card, { viewer: true }));
    resetTilt();
    dialog.showModal();
    dialog.scrollTop = 0;
    document.body.classList.add('dialog-open');
  }

  function resetTilt() {
    dialogTilt.style.setProperty('--tilt-x', '0deg');
    dialogTilt.style.setProperty('--tilt-y', '0deg');
  }

  function closeViewer() {
    if (dialog.open) dialog.close();
  }

  async function resetCollection() {
    try { await restoreCredits(); window.GIMAE_UI.toast({tone:'success',title:'Álbum actualizado',message:'Recuperamos las cartas de esta sesión.'}); }
    catch(error) { window.GIMAE_UI.toast({tone:'error',title:'No pudimos sincronizar',message:error.message}); }
  }
  async function prepareStory(card) {
    try {
      const photo = new Image();photo.crossOrigin = 'anonymous';photo.src = card.imagen;
      await photo.decode();
      const canvas = document.createElement('canvas');canvas.width=1080;canvas.height=1920;
      const ctx=canvas.getContext('2d');
      const gradient=ctx.createLinearGradient(0,0,1080,1920);gradient.addColorStop(0,'#fff2f8');gradient.addColorStop(1,'#eaf5ff');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1920);
      ctx.fillStyle='#efd4e5';for(let i=0;i<36;i++){ctx.beginPath();ctx.arc((i*193)%1080,(i*307)%1920,6,0,Math.PI*2);ctx.fill();}
      ctx.textAlign='center';ctx.fillStyle='#8f476b';ctx.font='bold 86px sans-serif';ctx.fillText('GIMAE!',540,280);
      ctx.font='28px sans-serif';ctx.fillText(card.special?'✦ MI DESTELLO ESPECIAL ✦':'♡ MI PHOTOCARD ♡',540,355);
      ctx.fillStyle='#ffffff';ctx.fillRect(105,430,870,1120);
      const scale=Math.max(810/photo.width,870/photo.height)*Number(card.zoom || 1);
      const [px,py]=(card.crop || '50% 25%').split(' ').map(v=>parseFloat(v)/100);
      ctx.save();ctx.beginPath();ctx.rect(135,460,810,870);ctx.clip();
      ctx.drawImage(photo,135+(810-photo.width*scale)*px,460+(870-photo.height*scale)*py,photo.width*scale,photo.height*scale);ctx.restore();
      ctx.fillStyle='#8f476b';ctx.font='bold 48px sans-serif';ctx.fillText(card.integrante,540,1410,790);
      ctx.font='30px sans-serif';ctx.fillText(card.rarityLabel || RARITIES[card.rareza].label,540,1480,790);
      ctx.font='30px sans-serif';ctx.fillText(card.frase,540,1640,900);
      ctx.font='28px sans-serif';ctx.fillText('@gimae_official · Gacha de photocards',540,1770);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('No se pudo crear la imagen.');
      if(viewerCard!==card)return;
      storyFile=new File([blob],'gimae-photocard-story.png',{type:'image/png'});
      document.querySelector('#gacha-story-share').disabled = !navigator.canShare?.({files:[storyFile]});
      document.querySelector('#gacha-story-download').disabled = false;
      document.querySelector('#gacha-story-status').textContent = 'Imagen vertical lista. Compártela desde tu teléfono o descárgala y añádela a una Story de Instagram.';
    } catch(error) { if(viewerCard===card) document.querySelector('#gacha-story-status').textContent = 'No pudimos preparar la imagen. Revisa tu conexión o la imagen de la carta.'; }
  }
  document.querySelector('#gacha-story-share').addEventListener('click',async()=>{
    if(!storyFile)return;
    try { await navigator.share({files:[storyFile]}); }
    catch(error) { if(error.name!=='AbortError') window.GIMAE_UI.toast({tone:'error',title:'No se pudo compartir',message:'Puedes descargar la imagen y subirla desde Instagram.'}); }
  });
  document.querySelector('#gacha-story-download').addEventListener('click',()=>{
    if(!storyFile)return;
    const url=URL.createObjectURL(storyFile),a=document.createElement('a');a.href=url;a.download=storyFile.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  codeInput.addEventListener('input', () => showRedeemMessage(''));
  historyToggle.addEventListener('click', () => {
    historyPanel.hidden = !historyPanel.hidden;
    const expanded = !historyPanel.hidden;
    if (expanded) renderCodeHistory();
    historyToggle.setAttribute('aria-expanded', String(expanded));
    historyToggle.setAttribute('aria-label', expanded ? 'Ocultar historial de códigos' : 'Mostrar historial de códigos');
    historyFeedback.hidden = true;
  });
  redeemForm.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !serviceReady)return;
    const orderCode = codeInput.value.trim().toLowerCase();
    if (!orderCode) {
      showRedeemMessage('Escribe el código de tu pedido para canjear tus sobres.');
      codeInput.focus();
      return;
    }
    if (!orderCodePattern.test(orderCode)) {
      rememberCodeAttempt(orderCode, 'failed');
      showRedeemMessage('Revisa el código: debe tener el formato que aparece en tu comprobante.');
      codeInput.focus();
      return;
    }
    showRedeemMessage('');
    busy=true;updateDailyUI();
    let redeemed = false;
    try {
      const previousPacks = remainingPacks();
      await api('redeem',{orderCode});
      redeemed = true;
      rememberCodeAttempt(orderCode, 'redeemed');
      codeInput.value = '';
      displayedPacks = previousPacks;
      await restoreCredits();
      showRedeemMessage('¡Pedido canjeado! Tus sobres van camino a la máquina.', 'success');
      await animateRedeemedPacks(previousPacks);
      showRedeemMessage('¡Pedido canjeado! Tus sobres ya están disponibles.', 'success');
      window.GIMAE_UI.toast({tone:'success',title:'¡Tus sobres están listos!',message:'El pedido quedó canjeado. Ya puedes abrir tus sobres disponibles.'});
      status.textContent='¡Gracias por apoyar a Gimae! Abre tu próximo recuerdo.';
      status.classList.remove('is-notice');
    } catch(error) {
      if (!redeemed) rememberCodeAttempt(orderCode, 'failed');
      const belowMinimum = error.message.includes('Debe estar pagado y cumplir el mínimo');
      const message = redeemed ? 'El código se canjeó, pero no pudimos actualizar los sobres. Conserva el código del historial y prueba «Sincronizar colección».'
        : belowMinimum ? `El pedido debe estar pagado y sumar al menos ${money(liveSettings.minimum_clp)} en productos, sin contar el envío.`
          : error.message;
      showRedeemMessage(message);
      window.GIMAE_UI.toast({tone:'error',title:redeemed ? 'No pudimos actualizar tus sobres' : 'No pudimos canjear el pedido',message});
    } finally {displayedPacks=null;busy=false;updateDailyUI();}
  });

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

  updateDailyUI();
  await initializeService();
})();
