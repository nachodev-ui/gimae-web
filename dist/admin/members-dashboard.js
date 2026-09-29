const records=document.querySelector('#records');
const membersTab=document.querySelector('[data-tab="members"]');
const settings=window.GIMAE_SUPABASE||{};
let clientPromise=null;
let scheduled=0;
let generation=0;
let lastFailedList=null;

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const isMembersActive=()=>membersTab?.getAttribute('aria-current')==='true';
const isMembersListReady=()=>{
  if(!records)return false;
  const heading=records.querySelector(':scope > h2');
  return heading?.textContent?.trim()==='Integrantes'&&Boolean(records.querySelector(':scope > .admin-list'));
};
const safeAccent=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):'#e84694';
const safeUrl=value=>{
  const raw=String(value??'').trim();
  if(!raw)return null;
  try{
    if(/^https?:\/\//i.test(raw))return new URL(raw).href;
    const cleaned=raw.replace(/^\.\//,'').replace(/^\//,'');
    return new URL(`../${cleaned}`,location.href).href;
  }catch{return null}
};
const instagramUrl=value=>{
  const raw=String(value??'').trim();
  if(!raw)return null;
  try{const url=new URL(raw);return /^https?:$/.test(url.protocol)?url.href:null}catch{return null}
};

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

function profileHealth(member){
  const checks=[
    Boolean(member.photo_url),
    Boolean(String(member.biography||'').trim()),
    Boolean(String(member.handle||'').trim()),
    Boolean(member.socials?.instagram),
    Boolean(String(member.color_label||'').trim()&&safeAccent(member.accent))
  ];
  const complete=checks.filter(Boolean).length;
  const ratio=complete/checks.length;
  if(ratio===1)return {kind:'complete',label:'Perfil completo',detail:`${complete}/${checks.length} datos clave`};
  if(ratio>=.6)return {kind:'review',label:'Revisar detalles',detail:`${complete}/${checks.length} datos clave`};
  return {kind:'incomplete',label:'Perfil incompleto',detail:`${complete}/${checks.length} datos clave`};
}

function buildLoadingShell(createAction){
  const shell=el('div','members-dashboard');
  const hero=el('div','members-dashboard-hero');
  const copy=el('div','members-dashboard-copy');
  copy.append(
    el('p','members-eyebrow','GIMAE! MEMBER DESK'),
    el('h2','','El equipo, de un vistazo ♡'),
    el('p','members-dashboard-lede','Revisa retratos, colores, redes y biografías antes de entrar a editar cada perfil.')
  );
  const actions=el('div','members-dashboard-actions');
  const publicLink=document.createElement('a');
  publicLink.href='../index.html#members';
  publicLink.target='_blank';
  publicLink.rel='noopener noreferrer';
  publicLink.className='members-secondary-action';
  publicLink.textContent='Ver Members ↗';
  const add=el('button','members-primary-action','＋ Nueva integrante');
  add.type='button';
  add.addEventListener('click',()=>createAction.click());
  actions.append(publicLink,add);
  hero.append(copy,actions);

  const loading=el('div','members-dashboard-loading');
  const sparkle=el('span','','✦');sparkle.setAttribute('aria-hidden','true');
  const loadingCopy=el('div');
  loadingCopy.append(el('strong','','Preparando el roster visual…'),el('small','','Reuniendo retratos, colores y redes del equipo.'));
  loading.append(sparkle,loadingCopy);
  shell.append(hero,loading);
  return shell;
}

async function enhance(){
  if(!records||!isMembersActive()||!isMembersListReady())return;
  const basicList=records.querySelector(':scope > .admin-list');
  if(!basicList||records.querySelector('.members-dashboard')||basicList===lastFailedList)return;
  const currentGeneration=++generation;
  const originalChildren=[...records.children];
  const originalCreate=originalChildren.find(node=>node.tagName==='BUTTON');
  const originalButtons=[...basicList.querySelectorAll(':scope > button')];
  if(!originalCreate)return;

  records.classList.add('members-records-mode');
  const shell=buildLoadingShell(originalCreate);
  records.replaceChildren(shell);

  try{
    const client=await getClient();
    const result=await client.from('members').select('id,name,color,accent,color_label,photo_url,handle,socials,biography,display_order').order('display_order');
    if(result.error)throw result.error;
    if(currentGeneration!==generation||!isMembersActive())return;
    const members=result.data||[];
    if(members.length!==originalButtons.length)throw new Error('La vista visual no coincide con la lista administrativa. Recarga el panel para sincronizarla.');
    lastFailedList=null;
    renderDashboard(shell,members,originalButtons);
  }catch(error){
    console.error('No se pudo preparar Member Desk:',error);
    if(currentGeneration!==generation||!isMembersActive())return;
    lastFailedList=basicList;
    records.classList.remove('members-records-mode');
    records.replaceChildren(...originalChildren);
    window.GIMAE_UI?.toast?.({tone:'warning',title:'No se pudo cargar la vista visual de Integrantes',message:error.message||'Se mantuvo la lista básica para que puedas seguir trabajando.'});
  }
}

function renderDashboard(shell,members,originalButtons){
  shell.querySelector('.members-dashboard-loading')?.remove();
  const models=members.map((member,index)=>({member,index,health:profileHealth(member)}));
  const complete=models.filter(model=>model.health.kind==='complete').length;
  const withPhoto=members.filter(member=>Boolean(member.photo_url)).length;
  const withInstagram=members.filter(member=>Boolean(member.socials?.instagram)).length;

  const overview=el('div','members-overview');
  [
    ['Integrantes',members.length,'Roster actual'],
    ['Perfiles completos',complete,'Listos para publicar'],
    ['Con retrato',withPhoto,'Imagen configurada'],
    ['Instagram',withInstagram,'Red enlazada']
  ].forEach(([label,value,detail])=>{
    const card=el('div','members-stat-card');
    card.append(el('span','members-stat-label',label),el('strong','',String(value)),el('small','',detail));
    overview.append(card);
  });

  const intro=el('div','members-roster-head');
  const introCopy=el('div');
  introCopy.append(el('strong','','Roster oficial'),el('p','','Cada tarjeta resume lo esencial. Entra a “Editar perfil” para cambiar biografía, redes, retrato o color.'));
  const legend=el('span','members-roster-count',`${members.length} ${members.length===1?'integrante':'integrantes'}`);
  intro.append(introCopy,legend);

  const grid=el('div','members-grid');
  models.forEach(model=>grid.append(buildMemberCard(model,originalButtons[model.index])));
  shell.append(overview,intro,grid);
}

function buildMemberCard(model,editAction){
  const {member,health}=model;
  const accent=safeAccent(member.accent);
  const card=el('article','member-admin-card');
  card.style.setProperty('--member-accent',accent);
  card.dataset.health=health.kind;

  const visual=el('div','member-admin-visual');
  const photoUrl=safeUrl(member.photo_url);
  if(photoUrl){
    const image=document.createElement('img');
    image.src=photoUrl;
    image.alt=`Retrato de ${member.name||'integrante'}`;
    image.loading='lazy';
    image.addEventListener('error',()=>{image.remove();if(!visual.querySelector('.member-admin-fallback'))visual.prepend(buildFallback(member))},{once:true});
    visual.append(image);
  }else visual.append(buildFallback(member));

  const memberNumber=el('span','member-admin-number',`MEMBER ${String(Number(member.display_order||0)+1).padStart(2,'0')}`);
  const colorChip=el('span','member-admin-color-chip');
  const swatch=el('i','');swatch.style.background=accent;swatch.setAttribute('aria-hidden','true');
  colorChip.append(swatch,document.createTextNode(member.color_label||'Color sin nombre'));
  visual.append(memberNumber,colorChip);

  const body=el('div','member-admin-body');
  const identity=el('div','member-admin-identity');
  identity.append(el('h3','',member.name||'Integrante sin nombre'));
  const handle=String(member.handle||'').trim();
  if(handle)identity.append(el('span','member-admin-handle',handle.startsWith('@')?handle:`@${handle}`));

  const biography=el('p','member-admin-bio',String(member.biography||'').trim()||'Aún no hay biografía pública cargada para esta integrante.');

  const facts=el('div','member-admin-facts');
  const colorFact=el('span','member-admin-fact');
  colorFact.append(el('small','','Color oficial'),el('b','',`${member.color_label||'Sin nombre'} · ${accent.toUpperCase()}`));
  const socialFact=el('span','member-admin-fact');
  const instagram=instagramUrl(member.socials?.instagram);
  socialFact.append(el('small','','Instagram'));
  if(instagram){
    const link=document.createElement('a');link.href=instagram;link.target='_blank';link.rel='noopener noreferrer';link.textContent=handle||'Abrir perfil ↗';socialFact.append(link);
  }else socialFact.append(el('b','is-muted','Sin enlace'));
  facts.append(colorFact,socialFact);

  const footer=el('div','member-admin-footer');
  const state=el('span',`member-profile-state is-${health.kind}`);
  state.append(el('b','',health.label),el('small','',health.detail));
  const edit=el('button','member-edit-profile','Editar perfil →');
  edit.type='button';
  edit.addEventListener('click',()=>editAction?.click());
  footer.append(state,edit);

  body.append(identity,biography,facts,footer);
  card.append(visual,body);
  return card;
}

function buildFallback(member){
  const fallback=el('div','member-admin-fallback');
  fallback.setAttribute('aria-hidden','true');
  const initial=String(member?.name||'G').trim().charAt(0).toUpperCase()||'G';
  fallback.append(el('span','',initial),el('small','',member?.name||'GIMAE'));
  return fallback;
}

function schedule(){
  cancelAnimationFrame(scheduled);
  scheduled=requestAnimationFrame(()=>{
    if(!isMembersActive()){records?.classList.remove('members-records-mode');generation++;return}
    void enhance();
  });
}

if(records&&membersTab){
  const observer=new MutationObserver(schedule);
  observer.observe(records,{childList:true});
  membersTab.addEventListener('click',schedule);
  schedule();
}
