const socialStudioRoot=document.querySelector('#editor');
const socialStudioTab=document.querySelector('[data-tab="members"]');

const ssEl=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const ssActive=()=>socialStudioTab?.getAttribute('aria-current')==='true';

function brandIcon(kind){
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  svg.classList.add('member-social-brand-svg');
  const add=(tag,attrs)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);svg.append(node)};
  if(kind==='instagram'){
    add('rect',{x:'4',y:'4',width:'16',height:'16',rx:'5',fill:'none',stroke:'currentColor','stroke-width':'2'});
    add('circle',{cx:'12',cy:'12',r:'3.7',fill:'none',stroke:'currentColor','stroke-width':'2'});
    add('circle',{cx:'17.4',cy:'6.8',r:'1.1',fill:'currentColor'});
  }else if(kind==='tiktok'){
    add('path',{d:'M13.2 3v10.25a4.35 4.35 0 1 1-3-4.05v2.95a1.75 1.75 0 1 0 1.55 1.74V3h1.95c.55 1.92 1.85 3.2 3.8 3.75v2.72c-1.75-.2-3.22-.95-4.3-2.08V3z',fill:'currentColor'});
  }else{
    add('path',{d:'M5 4l14 16M19 4L5 20',fill:'none',stroke:'currentColor','stroke-width':'2.4','stroke-linecap':'round'});
  }
  return svg;
}

function prettySocialValue(kind,input,handleInput){
  const raw=String(input?.value||'').trim();
  if(kind==='instagram'){
    const handle=String(handleInput?.value||'').trim();
    if(handle)return handle.startsWith('@')?handle:`@${handle}`;
  }
  if(!raw)return kind==='instagram'?'Añade el perfil oficial':kind==='tiktok'?'Añade el TikTok oficial':'Añade el perfil de X';
  try{
    const url=new URL(raw);
    const path=decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g,'');
    if(path)return path.startsWith('@')?path:`@${path.split('/')[0]}`;
    return url.hostname.replace(/^www\./,'');
  }catch{return raw.length>34?`${raw.slice(0,31)}…`:raw}
}

function installPreview(card,kind,input,handleInput){
  let preview=card.querySelector('.member-social-public-preview');
  if(!preview){
    preview=ssEl('div','member-social-public-preview');
    const sparkle=ssEl('span','member-social-preview-sparkle','✦');sparkle.setAttribute('aria-hidden','true');
    const copy=ssEl('div','member-social-preview-copy');
    copy.append(ssEl('small','',kind==='instagram'?'VISTA PÚBLICA':'EN EL PERFIL'),ssEl('strong','member-social-preview-value'));
    preview.append(sparkle,copy);
    card.append(preview);
  }
  const value=preview.querySelector('.member-social-preview-value');
  const state=card.querySelector('.member-social-state');
  const sync=()=>{
    const configured=Boolean(String(input?.value||'').trim());
    card.classList.toggle('is-configured',configured);
    if(state){state.textContent=configured?'Activo':kind==='instagram'?'Falta enlace':'Opcional';state.classList.toggle('is-active',configured)}
    if(value)value.textContent=prettySocialValue(kind,input,handleInput);
  };
  input?.addEventListener('input',sync);
  handleInput?.addEventListener('input',sync);
  sync();
}

function decorateCard(card,kind,input,handleInput){
  if(!card||card.dataset.socialStudio==='true')return;
  card.dataset.socialStudio='true';
  card.classList.add('member-social-card',`member-social-card--${kind}`);
  if(kind==='instagram')card.classList.add('is-primary');

  const brand=card.querySelector('.member-editor-social-brand,.member-extra-social-brand');
  if(brand){brand.classList.add('member-social-brand');brand.replaceChildren(brandIcon(kind))}

  const head=card.querySelector('.member-editor-social-head,.member-extra-social-head');
  if(head){
    head.classList.add('member-social-head');
    const oldBadge=[...head.children].find(node=>node.tagName==='SPAN');
    if(oldBadge){oldBadge.classList.add('member-social-kind');oldBadge.textContent=kind==='instagram'?'Principal':'Opcional'}
    const state=ssEl('span','member-social-state');
    const badges=ssEl('div','member-social-badges');
    if(oldBadge)badges.append(oldBadge);
    badges.append(state);
    head.append(badges);
  }

  const fields=card.querySelector('.member-editor-social-fields,.member-extra-social-field');
  fields?.classList.add('member-social-fields');
  installPreview(card,kind,input,handleInput);
}

function addSectionRibbon(section){
  if(section.querySelector('.member-social-ribbon'))return;
  const ribbon=ssEl('div','member-social-ribbon');
  const left=ssEl('div','member-social-ribbon-copy');
  left.append(ssEl('span','member-social-ribbon-kicker','SOCIAL IDOL CARD'),ssEl('strong','','Conecta sus escenarios digitales'));
  const deco=ssEl('span','member-social-ribbon-deco','✦  ♡  ♪');deco.setAttribute('aria-hidden','true');
  ribbon.append(left,deco);
  const firstCard=section.querySelector('.member-editor-social-card');
  if(firstCard)section.insertBefore(ribbon,firstCard);
}

function enhanceSocialStudio(form){
  if(form.dataset.socialStudio==='true'||!ssActive())return;
  const instagramInput=form.elements.instagram;
  const handleInput=form.elements.handle;
  const tiktokInput=form.elements.tiktok;
  const xInput=form.elements.x;
  const instagramCard=form.querySelector('.member-editor-social-card');
  const extraCards=[...form.querySelectorAll('.member-extra-social-card')];
  if(!instagramCard||!tiktokInput||!xInput||extraCards.length<2)return;
  form.dataset.socialStudio='true';
  const section=instagramCard.parentElement;
  section?.classList.add('member-social-studio');
  addSectionRibbon(section);
  decorateCard(instagramCard,'instagram',instagramInput,handleInput);
  decorateCard(extraCards[0],'tiktok',tiktokInput,null);
  decorateCard(extraCards[1],'x',xInput,null);
  const grid=form.querySelector('.member-extra-socials');
  grid?.classList.add('member-social-secondary-grid');
}

function scanSocialStudio(){
  if(!socialStudioRoot||!ssActive())return;
  const form=socialStudioRoot.querySelector('#record-form[data-member-studio="true"][data-profile-media="true"]');
  if(form)enhanceSocialStudio(form);
}

if(socialStudioRoot&&socialStudioTab){
  const observer=new MutationObserver(()=>requestAnimationFrame(scanSocialStudio));
  observer.observe(socialStudioRoot,{childList:true,subtree:true});
  socialStudioTab.addEventListener('click',()=>requestAnimationFrame(scanSocialStudio));
  scanSocialStudio();
}
