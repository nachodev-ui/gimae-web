(() => {
  'use strict';

  const ready = window.GIMAE_READY;
  if (!ready || typeof ready.then !== 'function') return;

  const STORAGE_KEY = 'gimae-seen-event-announcements-v1';
  const PREVIEW = new URLSearchParams(location.search).get('event-announcement') === 'preview';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const validDate = value => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const safeUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  const dateParts = new Intl.DateTimeFormat('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Santiago' });
  const day = new Intl.DateTimeFormat('es-CL', { day: '2-digit', timeZone: 'America/Santiago' });
  const month = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'America/Santiago' });
  const year = new Intl.DateTimeFormat('es-CL', { year: 'numeric', timeZone: 'America/Santiago' });
  const longDate = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });
  const time = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });

  const dayKey = date => {
    const parts = Object.fromEntries(dateParts.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const eventIdentity = (event, index = 0) => String(event?.id || `${event?.created_at || event?.starts_at || 'event'}-${index}`);
  const eventDomKey = (event, index = 0) => eventIdentity(event, index).replace(/[^a-zA-Z0-9_-]/g, '-');

  const eventIsCurrentOrFuture = event => {
    const start = validDate(event?.starts_at);
    const end = validDate(event?.ends_at);
    const now = new Date();
    if (!start) return false;
    if (end) return end >= now;
    return start >= now || dayKey(start) === dayKey(now);
  };

  function storage() {
    try {
      const probe = `${STORAGE_KEY}-probe`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch {
      try { return sessionStorage; } catch { return null; }
    }
  }

  function readSeen() {
    const target = storage();
    if (!target) return new Set();
    try {
      const value = JSON.parse(target.getItem(STORAGE_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function remember(events) {
    if (PREVIEW) return;
    const target = storage();
    if (!target) return;
    const seen = readSeen();
    events.forEach((event, index) => seen.add(eventIdentity(event, index)));
    try { target.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-80))); } catch { /* Progressive enhancement only. */ }
  }

  function visibleEvents() {
    const all = Array.isArray(window.GIMAE?.events) ? window.GIMAE.events : [];
    return all
      .filter(event => event && event.active !== false && eventIsCurrentOrFuture(event))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 4);
  }

  function candidateFrom(events) {
    if (!events.length) return null;
    const seen = readSeen();
    const newestFirst = [...events].sort((a, b) => {
      const createdA = validDate(a.created_at)?.getTime() || validDate(a.starts_at)?.getTime() || 0;
      const createdB = validDate(b.created_at)?.getTime() || validDate(b.starts_at)?.getTime() || 0;
      return createdB - createdA;
    });
    if (PREVIEW) return newestFirst[0];
    return newestFirst.find(event => !seen.has(eventIdentity(event))) || null;
  }

  function buildAnnouncement(event) {
    const start = validDate(event.starts_at);
    const href = safeUrl(event.url);
    const dialog = node('dialog', 'event-announcement');
    dialog.setAttribute('aria-labelledby', 'event-announcement-title');
    dialog.setAttribute('aria-describedby', 'event-announcement-description');

    const shell = node('div', 'event-announcement-shell');
    const ribbon = node('span', 'event-announcement-ribbon', '✦ NUEVA FECHA ✦');
    ribbon.setAttribute('aria-hidden', 'true');

    const content = node('div', 'event-announcement-content');
    content.append(node('p', 'event-announcement-kicker', 'GIMAE! LIVE · SAVE THE DATE'));
    const heading = node('h2', '', 'Tenemos una nueva cita. ');
    heading.id = 'event-announcement-title';
    heading.append(node('em', '', 'Nos vemos allí ♡'));
    content.append(heading, node('p', 'event-announcement-lede', 'Una nueva fecha acaba de sumarse a la agenda de Gimae!. Te dejamos lo importante para que no se te pase.'));

    const pass = node('div', 'event-announcement-pass');
    const date = node('div', 'event-announcement-date');
    date.append(
      node('span', '', start ? month.format(start).replace('.', '').toUpperCase() : 'FECHA'),
      node('strong', '', start ? day.format(start) : '—'),
      node('span', '', start ? year.format(start) : 'POR CONFIRMAR')
    );

    const info = node('div', 'event-announcement-info');
    info.append(node('span', 'event-announcement-badge', 'NUEVO EVENTO'));
    info.append(node('h3', 'event-announcement-title', event.title || 'Evento Gimae!'));

    const description = node('p', 'event-announcement-description', event.description || 'Muy pronto compartiremos más detalles de esta fecha.');
    description.id = 'event-announcement-description';
    info.append(description);

    const meta = node('div', 'event-announcement-meta');
    const when = node('span', '', start ? `${longDate.format(start)} · ${time.format(start)} hrs` : 'Fecha y horario por confirmar');
    when.prepend(node('b', '', '◷'));
    const where = node('span', '', event.venue || 'Lugar por confirmar');
    where.prepend(node('b', '', '⌖'));
    meta.append(when, where);
    info.append(meta);
    pass.append(date, info);
    content.append(pass);

    const actions = node('div', 'event-announcement-actions');
    const view = node('button', 'event-announcement-action primary', 'Ver evento en la agenda ↓');
    view.type = 'button';
    view.addEventListener('click', () => {
      const key = eventDomKey(event);
      const target = document.querySelector(`[data-event-key="${CSS.escape(key)}"]`);
      dialog.close('view-event');
      if (!target) {
        document.querySelector('#eventos')?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      window.setTimeout(() => {
        target.classList.add('is-announcement-target');
        target.setAttribute('tabindex', '-1');
        target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
        window.setTimeout(() => {
          target.focus({ preventScroll: true });
          window.setTimeout(() => target.classList.remove('is-announcement-target'), 1500);
        }, reducedMotion.matches ? 0 : 520);
      }, 60);
    });
    actions.append(view);

    if (href) {
      const details = node('a', 'event-announcement-action secondary', 'Abrir información ↗');
      details.href = href;
      details.target = '_blank';
      details.rel = 'noopener noreferrer';
      details.setAttribute('aria-label', `Abrir información de ${event.title || 'este evento'} en otra pestaña`);
      actions.append(details);
    }
    content.append(actions);

    const stub = node('aside', 'event-announcement-stub');
    stub.setAttribute('aria-hidden', 'true');
    stub.append(
      node('span', 'event-announcement-stub-label', 'GIMAE! LIVE'),
      node('span', 'event-announcement-stub-star', '✳'),
      node('small', '', 'ADMIT ONE DREAMER'),
      node('strong', '', start ? `${day.format(start)} ${month.format(start).replace('.', '').toUpperCase()}` : 'SAVE THE DATE')
    );

    const close = node('button', 'event-announcement-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar anuncio del nuevo evento');
    close.addEventListener('click', () => dialog.close('dismiss'));

    shell.append(content, stub, ribbon, close);
    ['✦', '♡', '☆', '✧'].forEach((symbol, index) => {
      const sparkle = node('span', `event-announcement-spark is-${index + 1}`, symbol);
      sparkle.setAttribute('aria-hidden', 'true');
      shell.append(sparkle);
    });
    dialog.append(shell);

    dialog.addEventListener('click', eventClick => {
      if (eventClick.target !== dialog) return;
      const bounds = shell.getBoundingClientRect();
      const outside = eventClick.clientX < bounds.left || eventClick.clientX > bounds.right || eventClick.clientY < bounds.top || eventClick.clientY > bounds.bottom;
      if (outside) dialog.close('dismiss');
    });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('event-announcement-open');
      window.setTimeout(() => dialog.remove(), 80);
    }, { once: true });

    document.body.append(dialog);
    return dialog;
  }

  function showIfNeeded() {
    const events = visibleEvents();
    const candidate = candidateFrom(events);
    if (!candidate) return;
    const dialog = buildAnnouncement(candidate);
    const delay = reducedMotion.matches ? 180 : 1150;
    window.setTimeout(() => {
      if (!dialog.isConnected || dialog.open) return;
      document.documentElement.classList.add('event-announcement-open');
      dialog.showModal();
      remember(events);
      dialog.querySelector('.event-announcement-close')?.focus({ preventScroll: true });
    }, delay);
  }

  ready.then(showIfNeeded).catch(() => {});
})();
