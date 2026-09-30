(() => {
  'use strict';

  const ready = window.GIMAE_READY;
  if (!ready || typeof ready.then !== 'function') return;

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

  const eventKey = (event, index = 0) => {
    const raw = event?.id || `${event?.created_at || event?.starts_at || 'event'}-${index}`;
    return String(raw).replace(/[^a-zA-Z0-9_-]/g, '-');
  };

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
    const start = validDate(event.starts_at);
    const end = validDate(event.ends_at);
    const now = new Date();
    if (!start) return false;
    if (end) return end >= now;
    return start >= now || dayKey(start) === dayKey(now);
  };

  function buildCard(event, index) {
    const start = validDate(event.starts_at);
    const card = node('article', `public-event-card${index === 0 ? ' is-featured' : ''}`);
    const key = eventKey(event, index);
    card.id = `gimae-event-${key}`;
    card.dataset.eventKey = key;

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
    const timeItem = node('span', 'time', start ? `${time.format(start)} hrs` : 'Hora por confirmar');
    const placeItem = node('span', 'place', event.venue || 'Lugar por confirmar');
    meta.append(timeItem, placeItem);
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
      const noLink = node('span', 'public-event-link is-disabled', 'Info en redes ♡');
      side.append(noLink);
    }

    card.append(date, body, side);
    return card;
  }

  function buildEmpty() {
    const empty = node('div', 'public-event-empty');
    const card = node('div', 'public-event-empty-card');
    card.setAttribute('aria-hidden', 'true');
    card.append(node('strong', '', '♡'), node('small', '', 'SAVE THE DATE'));
    const copy = node('div', 'public-event-empty-copy');
    copy.append(
      node('h3', '', 'La próxima fecha todavía es un pequeño secreto.'),
      node('p', '', 'Cuando tengamos un nuevo escenario, aparecerá aquí con todos los detalles. Mientras tanto, quédate cerquita en nuestras redes ♡')
    );
    empty.append(card, copy);
    return empty;
  }

  function buildStub(count) {
    const stub = node('aside', 'public-event-stub');
    stub.setAttribute('aria-label', 'Ticket decorativo de Gimae! Live');
    const orbit = node('div', 'public-event-stub-orbit', '✳');
    orbit.setAttribute('aria-hidden', 'true');
    stub.append(
      node('span', 'public-event-stub-label', 'GIMAE! LIVE'),
      orbit,
      node('span', 'public-event-stub-caption', count ? 'NEXT SHOW' : 'STAY TUNED'),
      node('span', 'public-event-stub-rule', ''),
      node('strong', 'public-event-stub-count', count ? `${String(count).padStart(2, '0')} ${count === 1 ? 'DATE' : 'DATES'}` : 'SOON ♡'),
      node('span', 'public-event-stub-code', 'G M A — 0 0 4'),
      node('span', 'public-event-stub-note', 'admit one dreamer')
    );
    return stub;
  }

  function render() {
    const section = document.querySelector('#eventos');
    const ticket = section?.querySelector('.event-ticket');
    if (!section || !ticket || ticket.dataset.publicEventsReady === 'true') return;

    const allEvents = Array.isArray(window.GIMAE?.events) ? window.GIMAE.events : [];
    const events = allEvents
      .filter(event => event && event.active !== false && eventIsCurrentOrFuture(event))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 4);

    ticket.dataset.publicEventsReady = 'true';
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
    heading.append(copy, node('span', 'public-event-live-chip', events.length ? 'AGENDA ABIERTA' : 'PRÓXIMAMENTE'));
    main.append(heading);

    if (events.length) {
      const list = node('div', 'public-events-list');
      events.forEach((event, index) => list.append(buildCard(event, index)));
      main.append(list);
    } else {
      main.append(buildEmpty());
    }

    ticket.append(main, buildStub(events.length));
    window.dispatchEvent(new CustomEvent('gimae:public-events-rendered', { detail: { events } }));
  }

  ready.then(() => {
    requestAnimationFrame(() => requestAnimationFrame(render));
  }).catch(() => {
    requestAnimationFrame(() => requestAnimationFrame(render));
  });
})();
