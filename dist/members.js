(() => {
  'use strict';

  const siteConfig = window.GIMAE || {};
  const members = Array.isArray(siteConfig.members) ? siteConfig.members : [];
  const options = {
    enabled: true,
    hoverDelay: 120,
    rememberSelection: false,
    tilt3d: true,
    arrowNavigation: true,
    groupView: true,
    ...(siteConfig.MEMBER_EXPERIENCE || {})
  };
  const section = document.querySelector('#members');
  const grid = document.querySelector('#member-grid');
  const dialog = document.querySelector('#member-dialog');
  if (!options.enabled || !section || !grid || !members.length) return;

  const darkText = { r: 33, g: 19, b: 34 };
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const storageKey = 'gimae-selected-member-v1';
  const themeProperties = [
    '--accent', '--accent-soft', '--accent-strong', '--on-accent',
    '--accent-line', '--accent-gradient', '--theme-background',
    '--pink', '--pink-dark'
  ];
  const hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selectedIndex = -1;
  let selectionTimer = 0;
  let resetTimer = 0;
  let suppressFocusUntil = 0;
  let leftSectionWhileDialogOpen = false;

  /* Convierte los colores configurados y comprueba contraste WCAG AA. */
  function parseHex(value) {
    const raw = String(value || '').trim().replace('#', '');
    const normalized = raw.length === 3 ? raw.split('').map(char => char + char).join('') : raw;
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return { r: 232, g: 70, b: 148 };
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  }

  function toHex({ r, g, b }) {
    const channel = value => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');
    return `#${channel(r)}${channel(g)}${channel(b)}`;
  }

  function mix(first, second, amount) {
    return {
      r: first.r + (second.r - first.r) * amount,
      g: first.g + (second.g - first.g) * amount,
      b: first.b + (second.b - first.b) * amount
    };
  }

  function luminance(color) {
    const channels = [color.r, color.g, color.b].map(value => {
      const channel = value / 255;
      return channel <= .03928 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4);
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  }

  function contrast(first, second) {
    const light = Math.max(luminance(first), luminance(second));
    const dark = Math.min(luminance(first), luminance(second));
    return (light + .05) / (dark + .05);
  }

  function accessibleAccent(base) {
    let accent = base;
    let onAccent = contrast(accent, white) >= contrast(accent, darkText) ? white : darkText;
    let ratio = contrast(accent, onAccent);
    const direction = onAccent === white ? black : white;
    let attempts = 0;
    while (ratio < 4.5 && attempts < 24) {
      accent = mix(accent, direction, .07);
      ratio = contrast(accent, onAccent);
      attempts += 1;
    }
    return { accent, onAccent, ratio };
  }

  function strongTone(base) {
    let tone = base;
    let attempts = 0;
    while (contrast(tone, white) < 4.5 && attempts < 24) {
      tone = mix(tone, black, .075);
      attempts += 1;
    }
    return tone;
  }

  function makeTheme(value) {
    const base = parseHex(value);
    const readable = accessibleAccent(base);
    const soft = mix(base, white, .84);
    const pale = mix(base, white, .92);
    const line = mix(base, white, .48);
    const strong = strongTone(base);
    return {
      base: toHex(base),
      accent: toHex(readable.accent),
      soft: toHex(soft),
      pale: toHex(pale),
      strong: toHex(strong),
      line: toHex(line),
      onAccent: toHex(readable.onAccent),
      contrast: readable.ratio,
      gradient: `linear-gradient(135deg, ${toHex(soft)}, ${toHex(readable.accent)})`,
      background: `linear-gradient(145deg, ${toHex(pale)} 0%, #fffafd 52%, ${toHex(soft)} 100%)`
    };
  }

  members.forEach(member => { member.theme = makeTheme(member.accent); });
  const cards = [...grid.querySelectorAll('.member-card')];
  cards.forEach((card, index) => {
    const theme = members[index].theme;
    card.style.setProperty('--accent', theme.accent);
    card.style.setProperty('--tint', theme.soft);
    card.style.setProperty('--tone', theme.strong);
    card.style.setProperty('--member-card-accent', theme.base);
    card.dataset.contrast = theme.contrast.toFixed(2);
  });

  const panel = document.createElement('aside');
  panel.className = 'member-spotlight';
  panel.id = 'member-spotlight';
  panel.setAttribute('aria-labelledby', 'member-spotlight-title');
  panel.innerHTML = `
    <div class="member-spotlight-visual">
      <img class="member-spotlight-photo" src="images/logo-rainbow.webp" alt="Logo de Gimae">
      <span class="member-spotlight-sparkles" aria-hidden="true">✦ ♡ ✧</span>
    </div>
    <div class="member-spotlight-copy" aria-live="polite">
      <p class="member-spotlight-kicker">GIMAE! · MEMBER COLORS</p>
      <h3 id="member-spotlight-title">Elige una integrante</h3>
      <p class="member-spotlight-meta"></p>
      <p class="member-spotlight-message">Pasa el cursor, enfoca con el teclado o toca una tarjeta para conocer su color.</p>
      <div class="member-color-list" aria-label="Colores de las integrantes"></div>
      <div class="member-spotlight-actions">
        <button class="member-theme-action member-previous" type="button" aria-label="Integrante anterior">← <span>Anterior</span></button>
        <button class="member-theme-action member-group" type="button"><span aria-hidden="true">✦</span> Todas juntas</button>
        <button class="member-theme-action member-next" type="button" aria-label="Integrante siguiente"><span>Siguiente</span> →</button>
        <button class="member-theme-clear" type="button" disabled>Quitar color</button>
      </div>
    </div>`;
  grid.after(panel);

  const photo = panel.querySelector('.member-spotlight-photo');
  const kicker = panel.querySelector('.member-spotlight-kicker');
  const title = panel.querySelector('#member-spotlight-title');
  const meta = panel.querySelector('.member-spotlight-meta');
  const message = panel.querySelector('.member-spotlight-message');
  const colorList = panel.querySelector('.member-color-list');
  const previousButton = panel.querySelector('.member-previous');
  const nextButton = panel.querySelector('.member-next');
  const groupButton = panel.querySelector('.member-group');
  const clearButton = panel.querySelector('.member-theme-clear');
  previousButton.hidden = !options.arrowNavigation;
  nextButton.hidden = !options.arrowNavigation;
  groupButton.hidden = !options.groupView;

  function fillColorList(activeId = '') {
    colorList.replaceChildren();
    members.forEach(member => {
      const item = document.createElement('span');
      item.className = 'member-color-list-item';
      item.classList.toggle('is-active', member.id === activeId);
      const chip = document.createElement('i');
      chip.style.background = member.theme.base;
      chip.setAttribute('aria-hidden', 'true');
      item.append(chip, document.createTextNode(member.name || `Member ${member.id}`));
      colorList.append(item);
    });
  }

  function applyVariables(theme, memberValue) {
    const values = {
      '--accent': theme.accent,
      '--accent-soft': theme.soft,
      '--accent-strong': theme.strong,
      '--on-accent': theme.onAccent,
      '--accent-line': theme.line,
      '--accent-gradient': theme.gradient,
      '--theme-background': theme.background,
      '--pink': theme.accent,
      '--pink-dark': theme.strong
    };
    Object.entries(values).forEach(([property, value]) => document.body.style.setProperty(property, value));
    document.body.dataset.member = memberValue;
  }

  function setCardSelection(index) {
    cards.forEach((card, cardIndex) => {
      const selected = cardIndex === index;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }

  function displayMember(member) {
    const hasMessage = typeof member.message === 'string' && member.message.trim() && member.message.trim().toUpperCase() !== 'COMPLETAR';
    photo.src = member.photo;
    photo.alt = `Retrato de ${member.name || `integrante ${member.id}`}`;
    kicker.textContent = `GIMAE! · MEMBER ${member.id} · ${member.colorLabel.toUpperCase()}`;
    title.textContent = member.name || `Member ${member.id}`;
    meta.textContent = `${member.colorLabel} · ${member.handle}`;
    message.textContent = hasMessage ? member.message.trim() : 'Mensaje pendiente de completar.';
    message.classList.toggle('is-pending', !hasMessage);
    fillColorList(member.id);
    panel.dataset.member = member.id;
  }

  function displayDefault() {
    photo.src = 'images/logo-rainbow.webp';
    photo.alt = 'Logo de Gimae';
    kicker.textContent = 'GIMAE! · MEMBER COLORS';
    title.textContent = 'Elige una integrante';
    meta.textContent = 'Suki · Usi · Vewe · Vali';
    message.textContent = 'Pasa el cursor, enfoca con el teclado o toca una tarjeta para conocer su color.';
    message.classList.remove('is-pending');
    fillColorList();
    panel.dataset.member = '';
  }

  function remember(memberId) {
    if (!options.rememberSelection) return;
    try {
      if (memberId) sessionStorage.setItem(storageKey, memberId);
      else sessionStorage.removeItem(storageKey);
    } catch {
      // La selección sigue funcionando aunque el almacenamiento esté bloqueado.
    }
  }

  function selectMember(index, { focus = false } = {}) {
    window.clearTimeout(selectionTimer);
    window.clearTimeout(resetTimer);
    const normalized = (index + members.length) % members.length;
    const member = members[normalized];
    selectedIndex = normalized;
    applyVariables(member.theme, member.id);
    setCardSelection(normalized);
    displayMember(member);
    clearButton.disabled = false;
    remember(member.id);
    if (focus) cards[normalized]?.focus({ preventScroll: true });
  }

  function showGroupTheme() {
    const base = makeTheme('#e84694');
    const colors = members.map(member => member.theme.accent);
    const softColors = members.map(member => member.theme.soft);
    base.gradient = `linear-gradient(90deg, ${colors.join(', ')})`;
    base.background = `linear-gradient(135deg, ${softColors.join(', ')})`;
    selectedIndex = -1;
    applyVariables(base, 'all');
    setCardSelection(-1);
    photo.src = 'images/logo-rainbow.webp';
    photo.alt = 'Logo de Gimae con los colores del grupo';
    kicker.textContent = 'GIMAE! · ALL MEMBER COLORS';
    title.textContent = 'Todas juntas';
    meta.textContent = 'Suki · Usi · Vewe · Vali';
    message.textContent = 'Cuatro colores comparten el mismo escenario.';
    message.classList.remove('is-pending');
    fillColorList();
    panel.dataset.member = 'all';
    clearButton.disabled = false;
    remember('all');
  }

  function clearTheme({ keepPanel = false } = {}) {
    window.clearTimeout(selectionTimer);
    window.clearTimeout(resetTimer);
    selectedIndex = -1;
    themeProperties.forEach(property => document.body.style.removeProperty(property));
    delete document.body.dataset.member;
    setCardSelection(-1);
    clearButton.disabled = true;
    remember('');
    if (!keepPanel) displayDefault();
  }

  function queueSelection(index) {
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(() => selectMember(index), Math.max(0, Number(options.hoverDelay) || 120));
  }

  function moveSelection(direction) {
    const start = selectedIndex < 0 ? (direction > 0 ? -1 : 0) : selectedIndex;
    selectMember(start + direction, { focus: true });
  }

  cards.forEach((card, index) => {
    if (hoverCapable.matches) card.addEventListener('pointerenter', () => queueSelection(index));
    card.addEventListener('focus', () => {
      window.requestAnimationFrame(() => {
        if (Date.now() < suppressFocusUntil) return;
        if (card.matches(':focus-visible')) queueSelection(index);
      });
    });
    card.addEventListener('pointerdown', () => {
      if (!hoverCapable.matches) selectMember(index);
    }, { passive: true });
    card.addEventListener('click', () => selectMember(index));

    if (options.arrowNavigation) {
      card.addEventListener('keydown', event => {
        const directions = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
        if (event.key in directions) {
          event.preventDefault();
          selectMember(index + directions[event.key], { focus: true });
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          selectMember(event.key === 'Home' ? 0 : members.length - 1, { focus: true });
        }
      });
    }

    if (options.tilt3d && hoverCapable.matches && !reducedMotion.matches) {
      card.classList.add('has-member-tilt');
      card.addEventListener('pointermove', event => {
        const bounds = card.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - .5;
        const y = (event.clientY - bounds.top) / bounds.height - .5;
        card.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    }
  });

  previousButton.addEventListener('click', () => moveSelection(-1));
  nextButton.addEventListener('click', () => moveSelection(1));
  groupButton.addEventListener('click', showGroupTheme);
  clearButton.addEventListener('click', () => clearTheme());

  section.addEventListener('pointerenter', () => window.clearTimeout(resetTimer));
  section.addEventListener('pointerleave', () => {
    if (!hoverCapable.matches) return;
    if (dialog?.open) {
      leftSectionWhileDialogOpen = true;
      return;
    }
    resetTimer = window.setTimeout(() => clearTheme(), 140);
  });
  section.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!section.contains(document.activeElement) && !dialog?.open) clearTheme();
    }, 0);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    suppressFocusUntil = Date.now() + 450;
    clearTheme();
  });

  dialog?.addEventListener('close', () => {
    if (!leftSectionWhileDialogOpen) return;
    leftSectionWhileDialogOpen = false;
    suppressFocusUntil = Date.now() + 350;
    clearTheme();
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting && !dialog?.open) clearTheme();
    }, { threshold: 0 });
    observer.observe(section);
  }

  displayDefault();
  if (options.rememberSelection) {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'all' && options.groupView) showGroupTheme();
      else {
        const index = members.findIndex(member => member.id === saved);
        if (index >= 0) selectMember(index);
      }
    } catch {
      // La experiencia parte en el tema grupal si sessionStorage no está disponible.
    }
  }
})();
