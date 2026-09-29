const membersEditorRoot=document.querySelector('#editor');
const membersEditorTab=document.querySelector('[data-tab="members"]');

const memberEl=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const memberActive=()=>membersEditorTab?.getAttribute('aria-current')==='true';
const hexOk=value=>/^#[0-9a-f]{6}$/i.test(String(value||'').trim());
const memberAccent=value=>hexOk(value)?String(value).trim():'#e84694';
const memberField=(form,name)=>form.elements[name]?.closest('label')||null;

function removeDirectText(label){
  [...label.childNodes].forEach(node=>{if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim())node.remove()});
}

function decorateMemberField(form,name,title,help,{icon='',compact=false}={}){
  const label=memberField(form,name);
  if(!label||label.dataset.memberDecorated)return label;
  label.dataset.memberDecorated='true';
  label.classList.add('member-editor-field');
  if(compact)label.classList.add('is-compact');
  removeDirectText(label);
  const heading=memberEl('span','member-editor-field-heading');
  if(icon){const iconNode=memberEl('span','member-editor-field-icon',icon);iconNode.setAttribute('aria-hidden','true');heading.append(iconNode)}
  heading.append(memberEl('span','',title));
  label.prepend(heading);
  if(help)label.append(memberEl('small','member-editor-field-help',help));
  return label;
}

function memberSection(number,title,help,className=''){
  const section=memberEl('section',`member-editor-section ${className}`.trim());
  const head=memberEl('div','member-editor-section-head');
  const badge=memberEl('span','member-editor-section-number',String(number).padStart(2,'0'));
  const copy=memberEl('div');
  copy.append(memberEl('h3','',title),memberEl('p','',help));
  head.append(badge,copy);
  section.append(head);
  return section;
}

function memberImageUrl(value){
  const raw=String(value??'').trim();
  if(!raw)return null;
  try{
    if(/^https?:\/\//i.test(raw))return new URL(raw).href;
    return new URL(`../${raw.replace(/^\.\//,'').replace(/^\//,'')}`,location.href).href;
  }catch{return null}
}

function buildMemberHero(form,isEditing){
  const name=form.elements.name;
  const accent=form.elements.accent;
  const hero=memberEl('header','member-editor-hero');
  const copy=memberEl('div','member-editor-hero-copy');
  copy.append(memberEl('p','member-editor-eyebrow','GIMAE! MEMBER STUDIO'));
  const title=memberEl('h2','',isEditing?`Editar ${name?.value||'integrante'}`:'Crear nueva integrante');
  copy.append(title,memberEl('p','member-editor-lede','Mantén actualizado lo que verá el público: nombre, biografía, retrato, color oficial y redes.'));
  const actions=memberEl('div','member-editor-hero-actions');
  const color=memberEl('span','member-editor-hero-color');
  const colorDot=memberEl('i','');colorDot.setAttribute('aria-hidden','true');
  const colorText=memberEl('span','');
  color.append(colorDot,colorText);
  const back=memberEl('button','member-editor-back','← Volver al roster');back.type='button';back.addEventListener('click',()=>membersEditorTab?.click());
  actions.append(color,back);hero.append(copy,actions);
  const sync=()=>{
    const value=memberAccent(accent?.value);
    title.textContent=isEditing?`Editar ${name?.value.trim()||'integrante'}`:'Crear nueva integrante';
    colorDot.style.background=value;
    colorText.textContent=value.toUpperCase();
    hero.style.setProperty('--member-editor-accent',value);
  };
  name?.addEventListener('input',sync);accent?.addEventListener('input',sync);sync();
  return hero;
}

function buildPortraitPanel(form){
  const photoInput=form.elements.photo_url;
  const accentInput=form.elements.accent;
  const colorLabelInput=form.elements.color_label;
  const section=memberSection(2,'Retrato y color','Estos elementos identifican visualmente a la integrante en Members y otras partes del sitio.','member-editor-visual-section');
  const layout=memberEl('div','member-editor-visual-layout');
  const preview=memberEl('div','member-editor-photo-card');
  const frame=memberEl('div','member-editor-photo-frame');
  const image=document.createElement('img');image.alt='Vista previa del retrato';image.hidden=true;
  const fallback=memberEl('div','member-editor-photo-fallback');fallback.setAttribute('aria-hidden','true');fallback.append(memberEl('span','','♡'),memberEl('small','','Sin retrato'));
  frame.append(image,fallback);
  const previewCopy=memberEl('div','member-editor-photo-copy');previewCopy.append(memberEl('strong','','Vista previa pública'),memberEl('small','','Comprueba aquí que el retrato se vea bien antes de guardar.'));
  preview.append(frame,previewCopy);

  const controls=memberEl('div','member-editor-visual-controls');
  const photo=decorateMemberField(form,'photo_url','URL del retrato','Usa una imagen pública del sitio o de Storage.','');
  const accent=decorateMemberField(form,'accent','Color oficial (HEX)','Ejemplo: #E84694. El círculo y el selector muestran el color real.');
  const colorName=decorateMemberField(form,'color_label','Nombre del color','Nombre fácil de entender, por ejemplo Rosado, Rojo, Amarillo o Morado.');

  if(accent&&accentInput){
    const pickerRow=memberEl('div','member-editor-color-tools');
    const swatch=memberEl('span','member-editor-color-swatch');swatch.setAttribute('aria-hidden','true');
    const picker=document.createElement('input');picker.type='color';picker.className='member-editor-color-picker';picker.setAttribute('aria-label','Elegir color oficial');picker.value=memberAccent(accentInput.value);
    const chip=memberEl('span','member-editor-color-value',memberAccent(accentInput.value).toUpperCase());
    pickerRow.append(swatch,picker,chip);
    accent.append(pickerRow);
    const syncFromText=()=>{const value=memberAccent(accentInput.value);swatch.style.background=value;chip.textContent=value.toUpperCase();if(hexOk(accentInput.value))picker.value=value};
    const syncFromPicker=()=>{accentInput.value=picker.value.toUpperCase();accentInput.dispatchEvent(new Event('input',{bubbles:true}));};
    accentInput.addEventListener('input',syncFromText);picker.addEventListener('input',syncFromPicker);syncFromText();
  }

  [photo,accent,colorName].filter(Boolean).forEach(node=>controls.append(node));
  layout.append(preview,controls);section.append(layout);

  const renderPreview=()=>{
    const url=memberImageUrl(photoInput?.value);
    const name=form.elements.name?.value.trim()||'integrante';
    if(!url){image.hidden=true;image.removeAttribute('src');fallback.hidden=false;return}
    image.hidden=false;fallback.hidden=true;image.src=url;image.alt=`Vista previa del retrato de ${name}`;
  };
  image.addEventListener('error',()=>{image.hidden=true;fallback.hidden=false});
  photoInput?.addEventListener('input',renderPreview);form.elements.name?.addEventListener('input',renderPreview);renderPreview();
  return section;
}

function buildSocialSection(form){
  const section=memberSection(3,'Redes sociales','Mantén el usuario y el enlace oficial sincronizados para evitar enviar a una cuenta equivocada.');
  const socialCard=memberEl('div','member-editor-social-card');
  const icon=memberEl('span','member-editor-social-brand','◎');icon.setAttribute('aria-hidden','true');
  const content=memberEl('div','member-editor-social-content');
  const head=memberEl('div','member-editor-social-head');head.append(memberEl('strong','','Instagram'),memberEl('span','','Perfil público'));
  const fields=memberEl('div','member-editor-social-fields');
  const handle=decorateMemberField(form,'handle','Usuario','Ej.: @bunnidoru. Se muestra como referencia rápida.',{icon:'@'});
  const instagram=decorateMemberField(form,'instagram','Enlace de Instagram','URL completa del perfil oficial.',{icon:'↗'});
  [handle,instagram].filter(Boolean).forEach(node=>fields.append(node));
  content.append(head,fields);socialCard.append(icon,content);section.append(socialCard);
  return section;
}

function buildAdvanced(form){
  const details=memberEl('details','member-editor-advanced');
  const summary=document.createElement('summary');
  const icon=memberEl('span','member-editor-advanced-icon','⚙');icon.setAttribute('aria-hidden','true');
  const copy=memberEl('span','member-editor-advanced-copy');copy.append(memberEl('strong','','Opciones avanzadas'),memberEl('small','','Código interno, clase CSS y posición en el roster. Normalmente no necesitas cambiar esto.'));
  const plus=memberEl('span','member-editor-advanced-toggle','＋');plus.setAttribute('aria-hidden','true');
  summary.append(icon,copy,plus);details.append(summary);
  const content=memberEl('div','member-editor-advanced-grid');
  const id=decorateMemberField(form,'id','Código interno','Identificador estable usado por productos y otras relaciones. No lo cambies salvo que estés corrigiendo una configuración.',{compact:true});
  const css=decorateMemberField(form,'color','Clase de color','Nombre técnico usado por algunos estilos del sitio, por ejemplo pink o purple.',{compact:true});
  const order=decorateMemberField(form,'display_order','Orden en Members','0 aparece primero, luego 1, 2, 3…',{compact:true});
  [id,css,order].filter(Boolean).forEach(node=>content.append(node));
  details.append(content);
  details.addEventListener('toggle',()=>{plus.textContent=details.open?'−':'＋'});
  return details;
}

function enhanceMemberEditor(form){
  if(form.dataset.memberStudio==='true'||!memberActive()||!form.elements.biography||!form.elements.accent)return;
  form.dataset.memberStudio='true';
  membersEditorRoot.classList.add('is-member-editor');
  const legacyTitle=membersEditorRoot.querySelector(':scope > h2');legacyTitle?.classList.add('member-editor-legacy-title');
  const isEditing=Boolean(form.elements.id?.readOnly);
  const hero=buildMemberHero(form,isEditing);

  const publicSection=memberSection(1,'Perfil público','Esta es la información principal que verá una persona al conocer a la integrante.');
  const publicGrid=memberEl('div','member-editor-public-grid');
  const name=decorateMemberField(form,'name','Nombre artístico','Nombre que se muestra públicamente en Members.');
  const bio=decorateMemberField(form,'biography','Biografía','Una presentación breve y personal. Idealmente 2–4 frases fáciles de leer.');
  if(name)publicGrid.append(name);if(bio){bio.classList.add('is-wide');publicGrid.append(bio)}
  publicSection.append(publicGrid);

  const portrait=buildPortraitPanel(form);
  const social=buildSocialSection(form);
  const advanced=buildAdvanced(form);
  const actions=form.querySelector('.admin-actions');
  if(actions){
    actions.classList.add('member-editor-actions');
    const save=actions.querySelector('[type="submit"]');if(save)save.textContent='Guardar perfil';
    const remove=actions.querySelector('.danger');if(remove)remove.textContent='Eliminar integrante';
  }

  form.prepend(hero,publicSection,portrait,social,advanced);
  if(actions)form.append(actions);
}

function scanMemberEditor(){
  if(!membersEditorRoot)return;
  if(!memberActive()){membersEditorRoot.classList.remove('is-member-editor');return}
  const form=membersEditorRoot.querySelector('#record-form');
  if(form)enhanceMemberEditor(form);
}

if(membersEditorRoot&&membersEditorTab){
  const observer=new MutationObserver(()=>requestAnimationFrame(scanMemberEditor));
  observer.observe(membersEditorRoot,{childList:true,subtree:false});
  membersEditorTab.addEventListener('click',()=>requestAnimationFrame(scanMemberEditor));
  scanMemberEditor();
}
