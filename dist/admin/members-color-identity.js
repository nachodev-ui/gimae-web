const memberColorEditor=document.querySelector('#editor');
const memberColorTab=document.querySelector('[data-tab="members"]');

const colorHexOk=value=>/^#[0-9a-f]{6}$/i.test(String(value||'').trim());
const colorValue=value=>colorHexOk(value)?String(value).trim().toUpperCase():'#E84694';

function enhanceMemberColorCard(form){
  if(form.dataset.memberColorIdentity==='true'||form.dataset.memberStudio!=='true')return;
  const accentInput=form.elements.accent;
  const colorNameInput=form.elements.color_label;
  if(!accentInput||!colorNameInput)return;

  const accentField=accentInput.closest('.member-editor-field');
  const colorNameField=colorNameInput.closest('.member-editor-field');
  if(!accentField||!colorNameField)return;

  const controls=accentField.parentElement;
  if(!controls||!controls.classList.contains('member-editor-visual-controls'))return;

  form.dataset.memberColorIdentity='true';
  accentField.classList.add('member-color-hex-field');
  colorNameField.classList.add('member-color-name-field');

  const accentHelp=accentField.querySelector('.member-editor-field-help');
  if(accentHelp)accentHelp.textContent='Código oficial de la integrante. Escríbelo manualmente solo si necesitas corregirlo.';
  const colorNameHelp=colorNameField.querySelector('.member-editor-field-help');
  if(colorNameHelp)colorNameHelp.textContent='Nombre simple que verá el equipo y el público, por ejemplo Rosado, Rojo, Amarillo o Morado.';

  /* El picker previo podía cambiar el color con un clic accidental. Se retira por completo. */
  accentField.querySelector('.member-editor-color-picker')?.remove();

  const card=document.createElement('section');
  card.className='member-color-identity';
  card.setAttribute('aria-label','Identidad cromática de la integrante');

  const head=document.createElement('div');head.className='member-color-identity-head';
  const headCopy=document.createElement('div');
  const kicker=document.createElement('p');kicker.className='member-color-identity-kicker';kicker.textContent='MEMBER COLOR';
  const title=document.createElement('h4');title.textContent='Identidad cromática';
  headCopy.append(kicker,title);
  const badge=document.createElement('span');badge.className='member-color-identity-badge';badge.textContent='Color oficial ✦';
  head.append(headCopy,badge);

  const body=document.createElement('div');body.className='member-color-identity-body';
  const preview=document.createElement('div');preview.className='member-color-preview';
  const orb=document.createElement('span');orb.className='member-color-orb';orb.setAttribute('aria-hidden','true');
  const previewName=document.createElement('strong');previewName.className='member-color-preview-name';
  const previewHex=document.createElement('span');previewHex.className='member-color-preview-hex';
  const previewNote=document.createElement('p');previewNote.className='member-color-preview-note';previewNote.textContent='Muestra visual · no se puede seleccionar';
  preview.append(orb,previewName,previewHex,previewNote);

  const fields=document.createElement('div');fields.className='member-color-fields';
  fields.append(accentField,colorNameField);
  body.append(preview,fields);
  card.append(head,body);
  controls.append(card);

  const sync=()=>{
    const hex=colorValue(accentInput.value);
    const name=String(colorNameInput.value||'Color sin nombre').trim()||'Color sin nombre';
    card.style.setProperty('--member-color',hex);
    orb.style.background=hex;
    previewHex.textContent=hex;
    previewName.textContent=name;
  };
  accentInput.addEventListener('input',sync);
  colorNameInput.addEventListener('input',sync);
  sync();
}

function scanMemberColor(){
  if(memberColorTab?.getAttribute('aria-current')!=='true')return;
  const form=memberColorEditor?.querySelector('#record-form');
  if(form)enhanceMemberColorCard(form);
}

if(memberColorEditor&&memberColorTab){
  const observer=new MutationObserver(()=>requestAnimationFrame(scanMemberColor));
  observer.observe(memberColorEditor,{childList:true,subtree:true});
  memberColorTab.addEventListener('click',()=>requestAnimationFrame(scanMemberColor));
  scanMemberColor();
}

/* Capa visual adicional para Instagram/TikTok/X. La lógica de guardado permanece en members-profile-media.js. */
if(!document.querySelector('link[data-members-social-studio]')){
  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href='members-social-studio.css?v=20260929-social01';
  style.dataset.membersSocialStudio='true';
  document.head.append(style);
}
import('./members-social-studio.js?v=20260929-social01').catch(error=>console.warn('No se pudo cargar Social Studio:',error));
