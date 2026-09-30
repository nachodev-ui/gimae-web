(() => {
  'use strict';

  const safeUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  const validDate = value => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const month = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'America/Santiago' });
  const year = new Intl.DateTimeFormat('es-CL', { year: 'numeric', timeZone: 'America/Santiago' });
  const day = new Intl.DateTimeFormat('es-CL', { day: '2-digit', timeZone: 'America/Santiago' });
  const time = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });
  const localDateParts = new Intl.DateTimeFormat('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Santiago' });

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const dayKey = date => {
    const parts = Object.fromEntries(localDateParts.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const eventIdentity = (event, index = 0) => String(event?.id || `${event?.created_at || event?.starts_at || 'event'}-${index}`);
  const eventDomKey = (event, index = 0) => eventIdentity(event, index).replace(/[^a-zA-Z0-9_-]/g, '-');

  const relativeLabel = start => {
    if (!start) return 'Fecha por confirmar';
    const now = new Date();
    const startDay = Date.parse(`${dayKey(start)}T00:00:00Z`);
    const today = Date.parse(`${dayKey(now)}T00:00:00Z`);
    const days = Math.round((startDay - today) / 86400000);
    if (days === 0) return 'Hoy ♡';
    if (days === 1) return 'Mañana ✦';
    if (days > 1 && days < 31) return `En ${days} días`;
    return 'Próximamente';
  };

  const eventIsCurrentOrFuture = event => {
    const start = validDate(event?.starts_at);
    const end = validDate(event?.ends_at);
    const now = new Date();
    if (!start) return false;
    if (end) return end >= now;
    return start >= now || dayKey(start) === dayKey(now);
  };

  function buildCard(event, index) {
    const start = validDate(event.starts_at);
    const card = node('article', `public-event-card${index === 0 ? ' is-featured' : ''}`);
    card.id = `gimae-event-${eventDomKey(event, index)}`;
    card.dataset.eventKey = eventDomKey(event, index);
    card.dataset.eventId = eventIdentity(event, index);

    const date = node('div', 'public-event-date');
    date.append(
      node('span', 'month', start ? month.format(start).replace('.', '').toUpperCase() : 'FECHA'),
      node('strong', 'day', start ? day.format(start) : '—'),
      node('span', 'year', start ? year.format(start) : 'POR CONFIRMAR'),
      node('span', 'spark', '✦')
    );

    const body = node('div', 'public-event-body');
    body.append(node('span', 'public-event-kicker', index === 0 ? 'Próxima fecha' : 'También en agenda'));
    body.append(node('h3', '', event.title || 'Evento Gimae!'));
    if (event.description) body.append(node('p', 'public-event-description', event.description));

    const meta = node('div', 'public-event-meta');
    meta.append(
      node('span', 'time', start ? `${time.format(start)} hrs` : 'Hora por confirmar'),
      node('span', 'place', event.venue || 'Lugar por confirmar')
    );
    body.append(meta);

    const side = node('div', 'public-event-side');
    const countdown = node('div', 'public-event-countdown', 'SAVE THE DATE');
    countdown.append(node('strong', '', relativeLabel(start)));
    side.append(countdown);

    const href = safeUrl(event.url);
    if (href) {
      const link = node('a', 'public-event-link', 'Ver detalles ↗');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Ver detalles de ${event.title || 'este evento'} (se abre en otra pestaña)`);
      side.append(link);
    } else {
      side.append(node('span', 'public-event-link is-disabled', 'Info en redes ♡'));
    }

    card.append(date, body, side);
    return card;
  }

  function buildEmpty(provisional) {
    const empty = node('div', 'public-event-empty');
    const card = node('div', 'public-event-empty-card');
    card.setAttribute('aria-hidden', 'true');
    card.append(node('strong', '', provisional ? '✦' : '♡'), node('small', '', provisional ? 'LOADING LIVE' : 'SAVE THE DATE'));
    const copy = node('div', 'public-event-empty-copy');
    copy.append(
      node('h3', '', provisional ? 'Preparando la agenda de Gimae!…' : 'La próxima fecha todavía es un pequeño secreto.'),
      node('p', '', provisional ? 'Estamos consultando las fechas publicadas para mostrarte la información más reciente.' : 'Cuando tengamos un nuevo escenario, aparecerá aquí con todos los detalles. Mientras tanto, quédate cerquita en nuestras redes ♡')
    );
    empty.append(card, copy);
    return empty;
  }

  function buildStub(count, provisional) {
    const stub = node('aside', 'public-event-stub');
    stub.setAttribute('aria-label', 'Ticket decorativo de Gimae! Live');
    const orbit = node('div', 'public-event-stub-orbit', '✳');
    orbit.setAttribute('aria-hidden', 'true');
    stub.append(
      node('span', 'public-event-stub-label', 'GIMAE! LIVE'),
      orbit,
      node('span', 'public-event-stub-caption', provisional ? 'LOADING' : (count ? 'NEXT SHOW' : 'STAY TUNED')),
      node('span', 'public-event-stub-rule', ''),
      node('strong', 'public-event-stub-count', provisional ? '♡' : (count ? `${String(count).padStart(2, '0')} ${count === 1 ? 'DATE' : 'DATES'}` : 'SOON ♡')),
      node('span', 'public-event-stub-code', 'G M A — 0 0 4'),
      node('span', 'public-event-stub-note', 'admit one dreamer')
    );
    return stub;
  }

  function normalizeEvents(source) {
    return (Array.isArray(source) ? source : [])
      .filter(event => event && event.active !== false && eventIsCurrentOrFuture(event))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 4);
  }

  function render(source, { provisional = false } = {}) {
    const section = document.querySelector('#eventos');
    const ticket = section?.querySelector('.event-ticket');
    if (!section || !ticket) return [];

    const events = normalizeEvents(source);
    ticket.dataset.publicEventsReady = provisional ? 'pending' : 'true';
    ticket.classList.add('event-ticket--redesign');
    ticket.replaceChildren();

    const main = node('div', 'public-event-main');
    const heading = node('div', 'public-event-heading');
    const copy = node('div', 'public-event-heading-copy');
    const eyebrow = node('p', 'eyebrow', '02 / SAVE THE DATE');
    const title = document.createElement('h2');
    title.id = 'events-title';
    title.append('Nos vemos bajo las luces. ', node('em', '', 'La próxima parada es contigo.'));
    copy.append(
      eyebrow,
      title,
      node('p', '', 'Fechas, escenarios y pequeños momentos que queremos compartir contigo. Guarda tu favorita y ven a vivirla con Gimae! ♡')
    );
    heading.append(copy, node('span', 'public-event-live-chip', provisional ? 'CARGANDO AGENDA' : (events.length ? 'AGENDA ABIERTA' : 'PRÓXIMAMENTE')));
    main.append(heading);

    if (events.length) {
      const list = node('div', 'public-events-list');
      events.forEach((event, index) => list.append(buildCard(event, index)));
      main.append(list);
    } else {
      main.append(buildEmpty(provisional));
    }

    ticket.append(main, buildStub(events.length, provisional));

    if (provisional) {
      const legacySink = node('div', 'ticket-main public-events-legacy-sink');
      legacySink.hidden = true;
      legacySink.setAttribute('aria-hidden', 'true');
      ticket.append(legacySink);
    } else {
      window.GIMAE_PUBLIC_EVENTS = events;
      window.GIMAE_PUBLIC_EVENTS_READY = true;
      window.dispatchEvent(new CustomEvent('gimae:public-events-ready', { detail: { events } }));
    }

    return events;
  }

  // El HTML conserva un fallback antiguo por si JavaScript está desactivado. Lo
  // sustituimos de inmediato para que nunca quede visible mientras responde Supabase.
  render(window.GIMAE?.events, { provisional: true });

  function finish() {
    render(window.GIMAE?.events, { provisional: false });
  }

  function attachReady(attempt = 0) {
    const ready = window.GIMAE_READY;
    if (ready && typeof ready.then === 'function') {
      ready.then(finish).catch(error => {
        console.warn('No se pudo actualizar la agenda desde el backend; se mantiene el respaldo local.', error);
        finish();
      });
      return;
    }
    if (attempt < 80) {
      window.setTimeout(() => attachReady(attempt + 1), 50);
      return;
    }
    console.warn('GIMAE_READY no estuvo disponible; se finalizó la agenda con los datos locales.');
    finish();
  }

  attachReady();
})();
