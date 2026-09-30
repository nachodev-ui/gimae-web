(() => {
  'use strict';

  const STORAGE_KEY = 'gimae-seen-event-announcements-v1';
  const MODE = new URLSearchParams(location.search).get('event-announcement');
  const PREVIEW = ['preview', 'poster', 'kawaii', 'teaser'].includes(MODE);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let started = false;

  const variants = {
    default: ['','✦ NUEVA FECHA ✦','GIMAE! LIVE · SAVE THE DATE','Tenemos una nueva cita. ','Nos vemos allí ♡','Una nueva fecha acaba de sumarse a la agenda de Gimae!. Te dejamos lo importante para que no se te pase.','NUEVO EVENTO','Ver evento en la agenda ↓','Abrir información ↗','GIMAE! LIVE','ADMIT ONE DREAMER','✳'],
    poster: ['event-announcement--poster','✦ LIVE! LIVE! LIVE! ✦','GIMAE! PRESENTA · LIVE SHOW','Una noche para cantar juntas. ','Nos vemos en vivo ✦','Luces arriba, música fuerte y una nueva fecha en el calendario. Este es el próximo escenario donde queremos encontrarnos contigo.','PRÓXIMA FECHA','Quiero ver esta fecha ↓','Ver info oficial ↗','GIMAE! ON STAGE','SEE YOU UNDER THE LIGHTS','✳'],
    kawaii: ['event-announcement--kawaii','♡ NUEVA CITA IDOL ♡','GIMAE! KIRAKIRA CLUB · NEW DATE','Tenemos un plan muy lindo. ','¿Vienes con nosotras? ♡','Una nueva fecha acaba de aparecer en nuestro calendario. Guarda el día, prepara tu outfit y ven a compartir un poquito de magia idol con Gimae! ✦','NUEVO PLAN ♡','Sí, quiero verla ↓','Ver todos los detalles ↗','GIMAE! FAN CLUB','KIRAKIRA DATE','♡'],
    teaser: ['event-announcement--teaser','● NEXT LIVE ●','GIMAE! / NEXT STAGE TRANSMISSION','Las luces vuelven a encenderse. ','Tu próxima noche empieza aquí.','Hay una nueva fecha en el radar. Escenario, música y toda la energía de Gimae! reunidas para el próximo encuentro en vivo.','NEXT STAGE','Entrar al próximo live ↓','Abrir información ↗','GIMAE! LIVE SIGNAL','STAGE LIGHTS ON','✦']
  };
  const v = variants[MODE] || variants.default;
  const [variantClass,ribbonText,kickerText,headingText,emphasisText,ledeText,badgeText,primaryText,secondaryText,stubLabel,stubSmall,stubStar] = v;

  const styleMap = {
    kawaii: 'public-event-announcement-kawaii.css?v=20260930-eventkawaii01',
    teaser: 'public-event-announcement-teaser.css?v=20260930-eventteaser01'
  };
  const styleReady = (() => {
    const href = styleMap[MODE];
    if (!href) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = href;
      link.onload = resolve;
      link.onerror = () => { console.warn(`No se pudo cargar la variante ${MODE}.`); resolve(); };
      document.head.append(link);
    });
  })();

  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const validDate = value => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
  const safeUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { const u = new URL(value, location.href); return ['https:','http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
  };

  const fmt = opts => new Intl.DateTimeFormat('es-CL', { ...opts, timeZone:'America/Santiago' });
  const dayFmt = fmt({day:'2-digit'}), monthFmt = fmt({month:'short'}), yearFmt = fmt({year:'numeric'}),
        longFmt = fmt({weekday:'long',day:'numeric',month:'long',year:'numeric'}), timeFmt = fmt({hour:'2-digit',minute:'2-digit',hour12:false}),
        partsFmt = fmt({year:'numeric',month:'2-digit',day:'2-digit'});
  const dayKey = date => {
    const p = Object.fromEntries(partsFmt.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const eventIdentity = (e,i=0) => String(e?.id || `${e?.created_at || e?.starts_at || 'event'}-${i}`);
  const eventDomKey = (e,i=0) => eventIdentity(e,i).replace(/[^a-zA-Z0-9_-]/g,'-');
  const currentOrFuture = e => {
    const start = validDate(e?.starts_at), end = validDate(e?.ends_at), now = new Date();
    if (!start) return false;
    if (end) return end >= now;
    return start >= now || dayKey(start) === dayKey(now);
  };

  const storage = () => {
    for (const target of [localStorage, sessionStorage]) {
      try { const k = `${STORAGE_KEY}-probe`; target.setItem(k,'1'); target.removeItem(k); return target; } catch {}
    }
    return null;
  };
  const readSeen = () => {
    const s = storage(); if (!s) return new Set();
    try { const x = JSON.parse(s.getItem(STORAGE_KEY) || '[]'); return new Set(Array.isArray(x) ? x.map(String) : []); } catch { return new Set(); }
  };
  const remember = e => {
    if (PREVIEW) return;
    const s = storage(); if (!s) return;
    const seen = readSeen(); seen.add(eventIdentity(e));
    try { s.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-80))); } catch {}
  };
  const visibleEvents = source => (Array.isArray(source) ? source : []).filter(e => e && e.active !== false && currentOrFuture(e)).sort((a,b) => new Date(a.starts_at)-new Date(b.starts_at)).slice(0,4);
  const candidateFrom = events => {
    if (!events.length) return null;
    const sorted = [...events].sort((a,b) => (validDate(b.created_at)?.getTime() || validDate(b.starts_at)?.getTime() || 0) - (validDate(a.created_at)?.getTime() || validDate(a.starts_at)?.getTime() || 0));
    if (PREVIEW) return sorted[0];
    const seen = readSeen(); return sorted.find(e => !seen.has(eventIdentity(e))) || null;
  };

  function buildAnnouncement(event) {
    const start = validDate(event.starts_at), href = safeUrl(event.url);
    const dialog = node('dialog', ['event-announcement',variantClass].filter(Boolean).join(' '));
    dialog.setAttribute('aria-labelledby','event-announcement-title');
    dialog.setAttribute('aria-describedby','event-announcement-description');

    const shell = node('div','event-announcement-shell');
    const ribbon = node('span','event-announcement-ribbon',ribbonText); ribbon.setAttribute('aria-hidden','true');
    const content = node('div','event-announcement-content');
    content.append(node('p','event-announcement-kicker',kickerText));
    const h2 = node('h2','',headingText); h2.id='event-announcement-title'; h2.append(node('em','',emphasisText));
    content.append(h2,node('p','event-announcement-lede',ledeText));

    const pass = node('div','event-announcement-pass'), date = node('div','event-announcement-date');
    date.append(node('span','',start ? monthFmt.format(start).replace('.','').toUpperCase() : 'FECHA'),node('strong','',start ? dayFmt.format(start) : '—'),node('span','',start ? yearFmt.format(start) : 'POR CONFIRMAR'));
    const info = node('div','event-announcement-info');
    info.append(node('span','event-announcement-badge',badgeText),node('h3','event-announcement-title',event.title || 'Evento Gimae!'));
    const desc = node('p','event-announcement-description',event.description || 'Muy pronto compartiremos más detalles de esta fecha.'); desc.id='event-announcement-description'; info.append(desc);
    const meta = node('div','event-announcement-meta');
    const when = node('span','',start ? `${longFmt.format(start)} · ${timeFmt.format(start)} hrs` : 'Fecha y horario por confirmar'); when.prepend(node('b','','◷'));
    const where = node('span','',event.venue || 'Lugar por confirmar'); where.prepend(node('b','','⌖')); meta.append(when,where); info.append(meta);
    pass.append(date,info); content.append(pass);

    const actions = node('div','event-announcement-actions'), view = node('button','event-announcement-action primary',primaryText); view.type='button';
    view.onclick = () => {
      const target = document.getElementById(`gimae-event-${eventDomKey(event)}`), scrollTarget = target || document.querySelector('#eventos');
      dialog.close('view-event'); if (!scrollTarget) return;
      setTimeout(() => {
        if (target) { target.classList.add('is-announcement-target'); target.setAttribute('tabindex','-1'); }
        scrollTarget.scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:target?'center':'start'});
        if (target) setTimeout(() => { target.focus({preventScroll:true}); setTimeout(() => target.classList.remove('is-announcement-target'),1500); }, reducedMotion.matches?0:520);
      },60);
    };
    actions.append(view);
    if (href) {
      const details = node('a','event-announcement-action secondary',secondaryText); details.href=href; details.target='_blank'; details.rel='noopener noreferrer';
      details.setAttribute('aria-label',`Abrir información de ${event.title || 'este evento'} en otra pestaña`); actions.append(details);
    }
    content.append(actions);

    const stub = node('aside','event-announcement-stub'); stub.setAttribute('aria-hidden','true');
    stub.append(node('span','event-announcement-stub-label',stubLabel),node('span','event-announcement-stub-star',stubStar),node('small','',stubSmall),node('strong','',start ? `${dayFmt.format(start)} ${monthFmt.format(start).replace('.','').toUpperCase()}` : 'SAVE THE DATE'));
    const close = node('button','event-announcement-close','×'); close.type='button'; close.setAttribute('aria-label','Cerrar anuncio del nuevo evento'); close.onclick=()=>dialog.close('dismiss');
    shell.append(content,stub,ribbon,close);
    ['✦','♡','☆','✧'].forEach((s,i)=>{ const e=node('span',`event-announcement-spark is-${i+1}`,s); e.setAttribute('aria-hidden','true'); shell.append(e); });
    dialog.append(shell);
    dialog.onclick = ev => { if (ev.target!==dialog) return; const b=shell.getBoundingClientRect(); if (ev.clientX<b.left||ev.clientX>b.right||ev.clientY<b.top||ev.clientY>b.bottom) dialog.close('dismiss'); };
    dialog.addEventListener('close',()=>{ document.documentElement.classList.remove('event-announcement-open'); setTimeout(()=>dialog.remove(),80); },{once:true});
    document.body.append(dialog); return dialog;
  }

  function showFrom(source, reason='renderer') {
    if (started) return;
    const events=visibleEvents(source), candidate=candidateFrom(events);
    if (!candidate) { if (PREVIEW) console.warn(`[GIMAE event preview] No hay eventos activos y futuros disponibles (${reason}).`,source); return; }
    started=true;
    styleReady.then(() => {
      const dialog=buildAnnouncement(candidate), delay=reducedMotion.matches?120:650;
      setTimeout(()=>{
        if (!dialog.isConnected||dialog.open) return;
        try { document.documentElement.classList.add('event-announcement-open'); dialog.showModal(); remember(candidate); dialog.querySelector('.event-announcement-close')?.focus({preventScroll:true}); }
        catch(error){ started=false; document.documentElement.classList.remove('event-announcement-open'); dialog.remove(); console.error('No se pudo abrir el anuncio del nuevo evento.',error); }
      },delay);
    });
  }

  addEventListener('gimae:public-events-ready',e=>showFrom(e.detail?.events,'public-events-ready'),{once:true});
  if (window.GIMAE_PUBLIC_EVENTS_READY) showFrom(window.GIMAE_PUBLIC_EVENTS,'already-ready');
  (function attach(attempt=0){
    if(started) return;
    const ready=window.GIMAE_READY;
    if(ready&&typeof ready.then==='function'){
      ready.then(()=>{ if(!started) showFrom(window.GIMAE_PUBLIC_EVENTS_READY?window.GIMAE_PUBLIC_EVENTS:window.GIMAE?.events,'backend-ready'); })
        .catch(err=>{ console.warn('No se pudo preparar el anuncio desde GIMAE_READY.',err); if(!started) showFrom(window.GIMAE?.events,'backend-fallback'); });
      return;
    }
    if(attempt<80) return setTimeout(()=>attach(attempt+1),50);
    if(!started) showFrom(window.GIMAE?.events,'local-timeout');
  })();
})();