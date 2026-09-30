(() => {
  'use strict';

  const STORAGE_KEY = 'gimae-seen-event-announcements-v1';
  const MODE = new URLSearchParams(location.search).get('event-announcement');
  const POSTER = MODE === 'poster';
  const PREVIEW = MODE === 'preview' || POSTER;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let started = false;

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
      try {
        const probe = `${STORAGE_KEY}-session-probe`;
        sessionStorage.setItem(probe, '1');
        sessionStorage.removeItem(probe);
        return sessionStorage;
      } catch {
        return null;
      }
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

  function remember(event) {
    if (PREVIEW) return;
    const target = storage();
    if (!target) return;
    const seen = readSeen();
    seen.add(eventIdentity(event));
    try { target.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-80))); } catch { /* Progressive enhancement only. */ }
  }

  function visibleEvents(source) {
    return (Array.isArray(source) ? source : [])
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
    const dialog = node('dialog', POSTER ? 'event-announcement event-announcement--poster' : 'event-announcement');
    dialog.setAttribute('aria-labelledby', 'event-announcement-title');
    dialog.setAttribute('aria-describedby', 'event-announcement-description');

    const shell = node('div', 'event-announcement-shell');
    const ribbon = node('span', 'event-announcement-ribbon', POSTER ? '✦ LIVE! LIVE! LIVE! ✦' : '✦ NUEVA FECHA ✦');
    ribbon.setAttribute('aria-hidden', 'true');

    const content = node('div', 'event-announcement-content');
    content.append(node('p', 'event-announcement-kicker', POSTER ? 'GIMAE! PRESENTA · LIVE SHOW' : 'GIMAE! LIVE · SAVE THE DATE'));

    const heading = node('h2', '', POSTER ? 'Una noche para cantar juntas. ' : 'Tenemos una nueva cita. ');
    heading.id = 'event-announcement-title';
    heading.append(node('em', '', POSTER ? 'Nos vemos en vivo ✦' : 'Nos vemos allí ♡'));
    content.append(
      heading,
      node(
        'p',
        'event-announcement-lede',
        POSTER
          ? 'Luces arriba, música fuerte y una nueva fecha en el calendario. Este es el próximo escenario donde queremos encontrarnos contigo.'
          : 'Una nueva fecha acaba de sumarse a la agenda de Gimae!. Te dejamos lo importante para que no se te pase.'
      )
    );

    const pass = node('div', 'event-announcement-pass');
    const date = node('div', 'event-announcement-date');
    date.append(
      node('span', '', start ? month.format(start).replace('.', '').toUpperCase() : 'FECHA'),
      node('strong', '', start ? day.format(start) : '—'),
      node('span', '', start ? year.format(start) : 'POR CONFIRMAR')
    );

    const info = node('div', 'event-announcement-info');
    info.append(node('span', 'event-announcement-badge', POSTER ? 'PRÓXIMA FECHA' : 'NUEVO EVENTO'));
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
    const view = node('button', 'event-announcement-action primary', POSTER ? 'Quiero ver esta fecha ↓' : 'Ver evento en la agenda ↓');
    view.type = 'button';
    view.addEventListener('click', () => {
      const target = document.getElementById(`gimae-event-${eventDomKey(event)}`);
      dialog.close('view-event');
      const scrollTarget = target || document.querySelector('#eventos');
      if (!scrollTarget) return;
      window.setTimeout(() => {
        if (target) {
          target.classList.add('is-announcement-target');
          target.setAttribute('tabindex', '-1');
        }
        scrollTarget.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: target ? 'center' : 'start' });
        if (target) {
          window.setTimeout(() => {
            target.focus({ preventScroll: true });
            window.setTimeout(() => target.classList.remove('is-announcement-target'), 1500);
          }, reducedMotion.matches ? 0 : 520);
        }
      }, 60);
    });
    actions.append(view);

    if (href) {
      const details = node('a', 'event-announcement-action secondary', POSTER ? 'Ver info oficial ↗' : 'Abrir información ↗');
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
      node('span', 'event-announcement-stub-label', POSTER ? 'GIMAE! ON STAGE' : 'GIMAE! LIVE'),
      node('span', 'event-announcement-stub-star', '✳'),
      node('small', '', POSTER ? 'SEE YOU UNDER THE LIGHTS' : 'ADMIT ONE DREAMER'),
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

  function showFrom(source, reason = 'renderer') {
    if (started) return;
    const events = visibleEvents(source);
    const candidate = candidateFrom(events);
    if (!candidate) {
      if (PREVIEW) console.warn(`[GIMAE event preview] No hay eventos activos y futuros disponibles (${reason}).`, source);
      return;
    }

    started = true;
    const dialog = buildAnnouncement(candidate);
    const delay = reducedMotion.matches ? 120 : 650;
    window.setTimeout(() => {
      if (!dialog.isConnected || dialog.open) return;
      try {
        document.documentElement.classList.add('event-announcement-open');
        dialog.showModal();
        remember(candidate);
        dialog.querySelector('.event-announcement-close')?.focus({ preventScroll: true });
      } catch (error) {
        started = false;
        document.documentElement.classList.remove('event-announcement-open');
        dialog.remove();
        console.error('No se pudo abrir el anuncio del nuevo evento.', error);
      }
    }, delay);
  }

  window.addEventListener('gimae:public-events-ready', event => {
    showFrom(event.detail?.events, 'public-events-ready');
  }, { once: true });

  // Si el renderizador terminó antes de que este archivo se ejecutara, no perdemos
  // el evento. Las variantes de preview tampoco dependen del historial de vistos.
  if (window.GIMAE_PUBLIC_EVENTS_READY) {
    showFrom(window.GIMAE_PUBLIC_EVENTS, 'already-ready');
  }

  function attachBackend(attempt = 0) {
    if (started) return;
    const ready = window.GIMAE_READY;
    if (ready && typeof ready.then === 'function') {
      ready.then(() => {
        if (!started) showFrom(window.GIMAE_PUBLIC_EVENTS_READY ? window.GIMAE_PUBLIC_EVENTS : window.GIMAE?.events, 'backend-ready');
      }).catch(error => {
        console.warn('No se pudo preparar el anuncio desde GIMAE_READY.', error);
        if (!started) showFrom(window.GIMAE?.events, 'backend-fallback');
      });
      return;
    }
    if (attempt < 80) {
      window.setTimeout(() => attachBackend(attempt + 1), 50);
      return;
    }
    if (!started) showFrom(window.GIMAE?.events, 'local-timeout');
  }

  attachBackend();
})();
