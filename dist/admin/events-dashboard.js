const records=document.querySelector('#records');
const eventsTab=document.querySelector('[data-tab="events"]');
const settings=window.GIMAE_SUPABASE||{};
let clientPromise=null;
let scheduled=0;
let generation=0;
let lastFailedList=null;

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const safeUrl=value=>{
  const raw=String(value??'').trim();
  if(!raw)return null;
  try{const url=new URL(raw,location.href);return ['https:','http:'].includes(url.protocol)?url.href:null}catch{return null}
};
const asDate=value=>{const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null};
const dayKey=date=>date?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`:'';
const isEventsActive=()=>eventsTab?.getAttribute('aria-current')==='true';
const isEventsListReady=()=>{
  if(!records)return false;
  const heading=records.querySelector(':scope > h2');
  return heading?.textContent?.trim()==='Eventos'&&Boolean(records.querySelector(':scope > .admin-list'));
};
const monthFormat=new Intl.DateTimeFormat('es-CL',{month:'short'});
const yearFormat=new Intl.DateTimeFormat('es-CL',{year:'numeric'});
const longDateFormat=new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long'});
const timeFormat=new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit'});

async function getClient(){
  if(clientPromise)return clientPromise;
  clientPromise=(async()=>{
    if(!settings.url||!settings.publishableKey)throw new Error('Supabase no está configurado.');
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    const client=createClient(settings.url,settings.publishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(!data?.session)throw new Error('La sesión del panel ya no está disponible.');
    return client;
  })();
  return clientPromise;
}

function temporalState(event,now=new Date()){
  const start=asDate(event.starts_at);
  const end=asDate(event.ends_at);
  if(!start)return {kind:'undated',label:'Sin fecha'};
  const sameDay=dayKey(start)===dayKey(now);
  if(start<=now&&(end?end>=now:sameDay))return {kind:'live',label:sameDay?'Hoy':'En curso'};
  if(start>now)return {kind:'upcoming',label:sameDay?'Hoy':'Próximo'};
  return {kind:'past',label:'Finalizado'};
}

function buildLoadingShell(createAction){
  const shell=el('div','events-dashboard');
  const hero=el('div','events-dashboard-hero');
  const copy=el('div','events-dashboard-copy');
  copy.append(
    el('p','events-eyebrow','GIMAE! EVENT PLANNER'),
    el('h2','','Fechas que merecen brillar ☆'),
    el('p','events-dashboard-lede','Organiza presentaciones, encuentros y actividades desde una agenda visual pensada para el backstage de Gimae!.')
  );
  const actions=el('div','events-dashboard-actions');
  const add=el('button','events-primary-action','＋ Nuevo evento');
  add.type='button';
  add.addEventListener('click',()=>createAction.click());
  actions.append(add);
  const next=el('div','events-next-card');
  next.setAttribute('aria-live','polite');
  const calendar=el('div','events-next-calendar');
  calendar.append(el('span','events-next-month','AGENDA'),el('strong','events-next-day','✦'));
  const nextCopy=el('div','events-next-copy');
  nextCopy.append(el('span','events-next-label','PRÓXIMA FECHA'),el('strong','events-next-title','Preparando calendario…'),el('small','events-next-meta','Un momento ♡'));
  next.append(calendar,nextCopy);
  hero.append(copy,actions,next);

  const loading=el('div','events-dashboard-loading');
  const sparkle=el('span','','☆');sparkle.setAttribute('aria-hidden','true');
  const loadingCopy=el('div');loadingCopy.append(el('strong','','Ordenando la agenda…'),el('small','','Revisando fechas, lugares y visibilidad.'));
  loading.append(sparkle,loadingCopy);
  shell.append(hero,loading);
  return shell;
}

async function enhance(){
  if(!records||!isEventsActive()||!isEventsListReady())return;
  const basicList=records.querySelector(':scope > .admin-list');
  if(!basicList||records.querySelector('.events-dashboard')||basicList===lastFailedList)return;
  const currentGeneration=++generation;
  const originalChildren=[...records.children];
  const originalCreate=originalChildren.find(node=>node.tagName==='BUTTON');
  const originalButtons=[...basicList.querySelectorAll(':scope > button')];
  if(!originalCreate)return;

  records.classList.add('events-records-mode');
  const shell=buildLoadingShell(originalCreate);
  records.replaceChildren(shell);

  try{
    const client=await getClient();
    const result=await client.from('events').select('id,title,description,venue,starts_at,ends_at,url,active').order('starts_at',{ascending:true});
    if(result.error)throw result.error;
    if(currentGeneration!==generation||!isEventsActive())return;
    const events=result.data||[];
    if(events.length!==originalButtons.length)throw new Error('La agenda visual no coincide con la lista administrativa. Recarga el panel para sincronizarla.');
    lastFailedList=null;
    renderDashboard(shell,events,originalButtons,originalCreate);
  }catch(error){
    console.error('No se pudo preparar Event Planner:',error);
    if(currentGeneration!==generation||!isEventsActive())return;
    lastFailedList=basicList;
    records.classList.remove('events-records-mode');
    records.replaceChildren(...originalChildren);
    window.GIMAE_UI?.toast?.({tone:'warning',title:'No se pudo cargar la agenda visual',message:error.message||'Se mantuvo la lista básica para que puedas seguir trabajando.'});
  }
}

function renderDashboard(shell,events,originalButtons,createAction){
  shell.querySelector('.events-dashboard-loading')?.remove();
  const now=new Date();
  const models=events.map((event,index)=>({event,index,state:temporalState(event,now)}));
  const upcoming=models.filter(model=>model.state.kind==='upcoming').length;
  const live=models.filter(model=>model.state.kind==='live').length;
  const past=models.filter(model=>model.state.kind==='past').length;
  const hidden=events.filter(event=>!event.active).length;
  const nextModel=models.find(model=>model.state.kind==='upcoming'&&model.event.active)||models.find(model=>model.state.kind==='upcoming')||models.find(model=>model.state.kind==='live');
  updateNextCard(shell,nextModel);

  const overview=el('div','events-overview');
  const stats=[
    ['all','Agenda',events.length,'Fechas registradas'],
    ['upcoming','Próximos',upcoming,'Lo que viene'],
    ['live','En curso',live,'Sucediendo ahora'],
    ['hidden','Ocultos',hidden,'Fuera del sitio']
  ];
  stats.forEach(([filter,label,value,detail],index)=>{
    const button=el('button','events-stat-card');button.type='button';button.dataset.summaryFilter=filter;button.setAttribute('aria-pressed',String(index===0));
    button.append(el('span','events-stat-label',label),el('strong','',String(value)),el('small','',detail));overview.append(button);
  });

  const toolbar=el('div','events-toolbar');
  const searchWrap=el('label','events-search');searchWrap.append(el('span','','Buscar en la agenda'));
  const search=document.createElement('input');search.type='search';search.placeholder='Título, lugar o descripción…';search.autocomplete='off';searchWrap.append(search);
  const filters=el('div','events-filter-group');filters.setAttribute('role','group');filters.setAttribute('aria-label','Filtrar eventos');
  [['all','Todos'],['upcoming','Próximos'],['live','En curso'],['past','Pasados'],['hidden','Ocultos']].forEach(([value,label],index)=>{
    const button=el('button','',label);button.type='button';button.dataset.eventsFilter=value;button.setAttribute('aria-pressed',String(index===0));filters.append(button);
  });
  toolbar.append(searchWrap,filters);

  const meta=el('div','events-agenda-meta');
  const resultCount=el('span','','');
  const hint=el('span','',past?`${past} ${past===1?'fecha finalizada':'fechas finalizadas'} permanecen disponibles para editar.`:'Las fechas pasadas quedarán archivadas visualmente aquí.');
  meta.append(resultCount,hint);

  const agenda=el('div','events-agenda');
  const empty=buildEmptyState(createAction);
  const noResults=el('div','events-no-results');noResults.hidden=true;
  noResults.append(el('span','','⌕'),el('strong','','No encontramos fechas'),el('p','','Prueba con otra búsqueda o cambia el filtro.'));
  shell.append(overview,toolbar,meta,agenda,empty,noResults);

  let filter='all';
  const setFilter=next=>{
    filter=next;
    shell.querySelectorAll('[data-events-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.eventsFilter===filter)));
    shell.querySelectorAll('[data-summary-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.summaryFilter===filter)));
    renderAgenda();
  };

  function renderAgenda(){
    const term=search.value.trim().toLocaleLowerCase('es');
    const filtered=models.filter(model=>{
      const event=model.event;
      const haystack=[event.title,event.description,event.venue].filter(Boolean).join(' ').toLocaleLowerCase('es');
      const matchesSearch=!term||haystack.includes(term);
      const matchesFilter=filter==='all'||model.state.kind===filter||(filter==='hidden'&&!event.active);
      return matchesSearch&&matchesFilter;
    });
    agenda.replaceChildren();
    filtered.forEach(model=>agenda.append(buildEventCard(model,originalButtons[model.index])));
    resultCount.textContent=`${filtered.length} ${filtered.length===1?'evento':'eventos'} en esta vista`;
    const trulyEmpty=events.length===0;
    empty.hidden=!trulyEmpty;
    noResults.hidden=trulyEmpty||filtered.length!==0;
    agenda.hidden=trulyEmpty||filtered.length===0;
    toolbar.hidden=trulyEmpty;
    meta.hidden=trulyEmpty;
    overview.hidden=trulyEmpty;
  }

  filters.addEventListener('click',event=>{const button=event.target.closest('[data-events-filter]');if(button)setFilter(button.dataset.eventsFilter)});
  overview.addEventListener('click',event=>{const button=event.target.closest('[data-summary-filter]');if(button)setFilter(button.dataset.summaryFilter)});
  search.addEventListener('input',renderAgenda);
  renderAgenda();
}

function updateNextCard(shell,model){
  const card=shell.querySelector('.events-next-card');
  if(!card)return;
  const month=card.querySelector('.events-next-month');
  const day=card.querySelector('.events-next-day');
  const title=card.querySelector('.events-next-title');
  const meta=card.querySelector('.events-next-meta');
  if(!model){
    month.textContent='AGENDA';day.textContent='♡';title.textContent='Sin próximas fechas';meta.textContent='Lista para planear algo nuevo.';card.dataset.state='empty';return;
  }
  const start=asDate(model.event.starts_at);
  month.textContent=start?monthFormat.format(start).replace('.','').toUpperCase():'FECHA';
  day.textContent=start?String(start.getDate()).padStart(2,'0'):'✦';
  title.textContent=model.event.title||'Evento sin título';
  meta.textContent=[start?`${longDateFormat.format(start)} · ${timeFormat.format(start)}`:null,model.event.venue].filter(Boolean).join(' · ');
  card.dataset.state=model.state.kind;
}

function buildEmptyState(createAction){
  const empty=el('div','events-empty-state');
  const illustration=el('div','events-empty-illustration');
  const ticket=el('div','events-empty-ticket');
  ticket.append(el('span','','SAVE THE DATE'),el('strong','','♡'),el('small','','GIMAE! EVENT'));
  const sparkA=el('span','events-empty-spark is-a','✦');sparkA.setAttribute('aria-hidden','true');
  const sparkB=el('span','events-empty-spark is-b','☆');sparkB.setAttribute('aria-hidden','true');
  illustration.append(ticket,sparkA,sparkB);
  const copy=el('div','events-empty-copy');
  copy.append(el('p','events-empty-eyebrow','AGENDA EN BLANCO'),el('h3','','Tu próxima fecha empieza aquí ♡'),el('p','','Todavía no hay eventos registrados. Cuando agregues el primero, aparecerá como una tarjeta con fecha, lugar, estado y acceso rápido a edición.'));
  const button=el('button','events-empty-action','＋ Crear el primer evento');button.type='button';button.addEventListener('click',()=>createAction.click());copy.append(button);
  empty.append(illustration,copy);
  return empty;
}

function buildEventCard(model,editAction){
  const {event,state}=model;
  const start=asDate(event.starts_at);
  const end=asDate(event.ends_at);
  const card=el('article','events-card');
  card.dataset.state=state.kind;card.dataset.active=String(Boolean(event.active));

  const date=el('div','events-date-block');
  date.append(
    el('span','events-date-month',start?monthFormat.format(start).replace('.','').toUpperCase():'SIN'),
    el('strong','events-date-day',start?String(start.getDate()).padStart(2,'0'):'—'),
    el('small','events-date-year',start?yearFormat.format(start):'FECHA')
  );

  const content=el('div','events-card-content');
  const top=el('div','events-card-top');
  const identity=el('div','events-card-identity');
  const badges=el('div','events-badges');
  const stateBadge=el('span',`events-state-badge is-${state.kind}`,state.label);
  const visibility=el('span',`events-visibility ${event.active?'is-visible':'is-hidden'}`,event.active?'● Visible':'○ Oculto');
  badges.append(stateBadge,visibility);
  identity.append(badges,el('h3','',event.title||'Evento sin título'));
  top.append(identity);

  const description=el('p','events-card-description',event.description||'Sin descripción todavía. Puedes añadir detalles al editar este evento.');
  const facts=el('div','events-card-facts');
  const when=el('div','events-fact');when.append(el('span','','⌚'),buildFactCopy('Horario',formatSchedule(start,end)));
  const where=el('div','events-fact');where.append(el('span','','⌖'),buildFactCopy('Lugar',event.venue||'Por definir'));
  facts.append(when,where);

  const footer=el('div','events-card-footer');
  const link=safeUrl(event.url);
  const left=el('div','events-card-link');
  if(link){const anchor=document.createElement('a');anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.textContent='Abrir enlace ↗';left.append(anchor)}
  else left.append(el('span','','Sin enlace público'));
  const edit=el('button','events-edit-action','Editar evento →');edit.type='button';edit.addEventListener('click',()=>editAction?.click());
  footer.append(left,edit);

  content.append(top,description,facts,footer);card.append(date,content);
  return card;
}

function buildFactCopy(label,value){
  const copy=el('div');copy.append(el('small','',label),el('strong','',value));return copy;
}

function formatSchedule(start,end){
  if(!start)return 'Fecha por definir';
  const startTime=timeFormat.format(start);
  if(!end)return `${longDateFormat.format(start)} · ${startTime}`;
  const sameDay=dayKey(start)===dayKey(end);
  if(sameDay)return `${longDateFormat.format(start)} · ${startTime}–${timeFormat.format(end)}`;
  return `${longDateFormat.format(start)} ${startTime} → ${longDateFormat.format(end)} ${timeFormat.format(end)}`;
}

function schedule(){
  cancelAnimationFrame(scheduled);
  scheduled=requestAnimationFrame(()=>{
    if(!isEventsActive()){records?.classList.remove('events-records-mode');generation++;return}
    void enhance();
  });
}

if(records&&eventsTab){
  const observer=new MutationObserver(schedule);
  observer.observe(records,{childList:true});
  eventsTab.addEventListener('click',schedule);
  schedule();
}
