const editorRoot=document.querySelector('#editor');
const statusNode=document.querySelector('#status');
const rt=window.GIMAE_RICH_TEXT;
let activeDraftKey=null;
let activeCleanup=null;

const slugify=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};

function insertMarkup(textarea,prefix,suffix=prefix,placeholder='texto'){
  const start=textarea.selectionStart,end=textarea.selectionEnd;
  const selected=textarea.value.slice(start,end)||placeholder;
  textarea.setRangeText(prefix+selected+suffix,start,end,'end');
  textarea.focus();
  textarea.setSelectionRange(start+prefix.length,start+prefix.length+selected.length);
  textarea.dispatchEvent(new Event('input',{bubbles:true}));
}
function insertLine(textarea,prefix,placeholder='Escribe aquí'){
  const start=textarea.selectionStart;
  const lineStart=textarea.value.lastIndexOf('\n',start-1)+1;
  const lineEnd=textarea.value.indexOf('\n',start);
  const end=lineEnd===-1?textarea.value.length:lineEnd;
  const current=textarea.value.slice(lineStart,end);
  const replacement=prefix+(current||placeholder);
  textarea.setRangeText(replacement,lineStart,end,'end');
  textarea.focus();
  textarea.setSelectionRange(lineStart+prefix.length,lineStart+replacement.length);
  textarea.dispatchEvent(new Event('input',{bubbles:true}));
}
function insertLink(textarea){
  const selected=textarea.value.slice(textarea.selectionStart,textarea.selectionEnd)||'texto del enlace';
  const href=prompt('URL del enlace (https://...)','https://');
  if(!href)return;
  try{const url=new URL(href);if(!['https:','http:'].includes(url.protocol))throw new Error()}catch{return alert('Usa una URL http:// o https:// válida.')}
  insertMarkup(textarea,'[',`](${href})`,selected);
}
function previewCover(form){
  return form.querySelector('img.admin-cover')?.src||'';
}
function createGeneratedCover(){
  const cover=el('div','gimae-generated-cover');
  cover.setAttribute('aria-hidden','true');
  cover.innerHTML='<span>Dear<br>you.</span><small>GIMAE! DIARY</small>';
  return cover;
}
function formatDate(){return new Intl.DateTimeFormat('es-CL',{dateStyle:'long',timeZone:'America/Santiago'}).format(new Date())}

function enhanceBlogForm(form){
  if(form.dataset.blogStudio==='true'||!rt)return;
  const content=form.elements.content,title=form.elements.title,slug=form.elements.slug,status=form.elements.status,visibility=form.elements.visibility;
  if(!content||!title||!slug||!status||!visibility)return;
  form.dataset.blogStudio='true';
  editorRoot.classList.add('is-blog-editor');
  activeCleanup?.();

  const originalSlug=slug.value||'new';
  activeDraftKey=`gimae-blog-draft:${originalSlug}`;
  let draftTimer=null,coverObjectUrl='',slugTouched=Boolean(slug.value);
  const cleanupFns=[];

  const studioHead=el('div','blog-studio-head');
  studioHead.innerHTML='<div><p class="admin-card-eyebrow">GIMAE! BLOG STUDIO</p><h2>Escribe, diseña y mira el resultado al instante.</h2><p>El contenido enriquecido se guarda como texto seguro y se renderiza igual en la portada pública.</p></div><div class="blog-studio-actions"><button type="button" data-blog-focus aria-pressed="false">⛶ Modo enfoque</button></div>';
  form.before(studioHead);

  const titleLabel=title.closest('label'),slugLabel=slug.closest('label');
  titleLabel?.classList.add('blog-title-field');
  slugLabel?.classList.add('blog-slug-field');
  const slugButton=el('button','blog-slug-refresh','↻ Generar desde el título');
  slugButton.type='button';slugLabel?.append(slugButton);

  const contentLabel=content.closest('label');
  contentLabel.classList.add('blog-content-label');
  if(contentLabel.firstChild?.nodeType===Node.TEXT_NODE)contentLabel.firstChild.nodeValue='Contenido de la entrada';
  content.placeholder='Empieza a escribir… Usa la barra para dar formato sin preocuparte por HTML.';
  content.classList.add('blog-content-textarea');

  const toolbar=el('div','blog-format-toolbar');
  toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Formato del contenido');
  toolbar.innerHTML=`
    <div class="blog-tool-group" aria-label="Énfasis">
      <button type="button" data-format="bold" title="Negrita · Ctrl+B"><strong>B</strong></button>
      <button type="button" data-format="italic" title="Cursiva · Ctrl+I"><em>I</em></button>
      <button type="button" data-format="highlight" title="Resaltar">Resaltar</button>
      <button type="button" data-format="strike" title="Tachado"><s>S</s></button>
    </div>
    <div class="blog-tool-group blog-color-tools" aria-label="Colores Gimae">
      <button type="button" data-format="pink" title="Rosado" aria-label="Texto rosado"><span class="swatch pink"></span></button>
      <button type="button" data-format="red" title="Rojo" aria-label="Texto rojo"><span class="swatch red"></span></button>
      <button type="button" data-format="yellow" title="Amarillo" aria-label="Texto amarillo"><span class="swatch yellow"></span></button>
      <button type="button" data-format="purple" title="Morado" aria-label="Texto morado"><span class="swatch purple"></span></button>
    </div>
    <div class="blog-tool-group" aria-label="Bloques">
      <button type="button" data-format="ja" title="Texto japonés"><span lang="ja">日本語</span></button>
      <button type="button" data-format="heading" title="Subtítulo">H2</button>
      <button type="button" data-format="quote" title="Cita">❝</button>
      <button type="button" data-format="callout" title="Nota destacada">✦ Nota</button>
      <button type="button" data-format="idol" title="Nota idol">♡ Idol</button>
      <button type="button" data-format="list" title="Lista">• Lista</button>
      <button type="button" data-format="divider" title="Separador">—</button>
      <button type="button" data-format="link" title="Enlace · Ctrl+K">↗ Link</button>
    </div>`;

  const metrics=el('div','blog-editor-metrics');
  const autosave=el('span','blog-autosave-state','Borrador local listo');
  const stats=el('span','blog-content-stats','0 palabras · 1 min');
  metrics.append(autosave,stats);

  const help=document.createElement('details');help.className='blog-format-help';
  help.innerHTML='<summary>Guía rápida de formato</summary><div><code>**negrita**</code><code>*cursiva*</code><code>==resaltado==</code><code>[[pink|rosado]]</code><code>[[ja|きらきら]]</code><code>## subtítulo</code><code>&gt; cita</code><code>! nota destacada</code><code>♡ nota idol</code></div>';

  const compose=el('section','blog-compose-panel');
  const composeHeader=el('div','blog-compose-heading');
  composeHeader.innerHTML='<div><span>EDITOR</span><strong>Historia</strong></div><span class="blog-shortcuts">Ctrl+B · Ctrl+I · Ctrl+K</span>';
  contentLabel.before(compose);
  compose.append(composeHeader,toolbar,contentLabel,metrics,help);

  const previewPanel=el('aside','blog-live-preview-panel');
  previewPanel.innerHTML='<div class="blog-preview-head"><div><span>PREVIEW EN VIVO</span><strong>Así se verá en la home</strong></div><div class="blog-preview-modes" role="group" aria-label="Tamaño de preview"><button type="button" data-preview="desktop" aria-pressed="true">Escritorio</button><button type="button" data-preview="mobile" aria-pressed="false">Móvil</button></div></div><div class="blog-preview-viewport" data-preview-mode="desktop"></div><div class="blog-publish-checklist" aria-label="Revisión rápida"></div>';
  compose.after(previewPanel);

  const writingGrid=el('div','blog-writing-grid');
  compose.before(writingGrid);writingGrid.append(compose,previewPanel);

  const statusLabel=status.closest('label'),visibilityLabel=visibility.closest('label');
  const metadataRow=statusLabel?.parentElement?.classList.contains('admin-row')?statusLabel.parentElement:null;
  metadataRow?.classList.add('blog-publish-row');
  if(metadataRow){
    const hint=el('p','blog-publish-hint');metadataRow.after(hint);
    const updateHint=()=>{
      if(status.value==='borrador')hint.textContent='Borrador: solo el equipo puede verlo y editarlo.';
      else if(visibility.value==='exclusivo')hint.textContent='Publicado exclusivo: seguirá oculto para visitantes; actualmente solo autora/admin tienen acceso.';
      else hint.textContent='Publicado público: aparecerá en la web para visitantes.';
    };
    status.addEventListener('change',updateHint);visibility.addEventListener('change',updateHint);updateHint();
  }

  const recoveryRaw=localStorage.getItem(activeDraftKey);
  if(recoveryRaw){
    try{
      const saved=JSON.parse(recoveryRaw);
      const current={title:title.value,slug:slug.value,content:content.value,status:status.value,visibility:visibility.value};
      const changed=Object.keys(current).some(key=>String(saved.data?.[key]??'')!==String(current[key]??''));
      if(changed){
        const recovery=el('div','blog-recovery-banner');
        const when=new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'short'}).format(new Date(saved.savedAt));
        recovery.innerHTML=`<div><strong>Encontré un borrador local</strong><span>Guardado automáticamente ${when}. Puedes recuperarlo sin sobrescribir Supabase hasta que pulses Guardar.</span></div><div><button type="button" data-recover>Recuperar</button><button type="button" data-discard>Descartar</button></div>`;
        studioHead.after(recovery);
        recovery.querySelector('[data-recover]').addEventListener('click',()=>{
          for(const [key,value] of Object.entries(saved.data||{}))if(form.elements[key])form.elements[key].value=value;
          slugTouched=true;recovery.remove();syncAll();
        });
        recovery.querySelector('[data-discard]').addEventListener('click',()=>{localStorage.removeItem(activeDraftKey);recovery.remove()});
      }
    }catch{localStorage.removeItem(activeDraftKey)}
  }

  function saveLocalDraft(){
    clearTimeout(draftTimer);draftTimer=setTimeout(()=>{
      const data={title:title.value,slug:slug.value,content:content.value,status:status.value,visibility:visibility.value};
      localStorage.setItem(activeDraftKey,JSON.stringify({savedAt:Date.now(),data}));
      autosave.textContent='Borrador local guardado ✓';
      setTimeout(()=>{if(autosave.isConnected)autosave.textContent='Autoguardado activo'},1400);
    },450);
  }
  function updateStats(){
    const info=rt.stats(content.value);
    stats.textContent=`${info.words} palabras · ${info.characters} caracteres · ${info.minutes} min de lectura`;
  }
  function updateChecklist(hasCover){
    const plain=rt.strip(content.value);
    const entries=[
      [title.value.trim().length>=4,'Título listo'],
      [plain.length>=80,'Contenido con suficiente desarrollo'],
      [Boolean(hasCover),'Portada añadida (recomendado)'],
      [slug.value.trim().length>0,'URL preparada']
    ];
    const list=previewPanel.querySelector('.blog-publish-checklist');
    list.replaceChildren();
    const head=el('strong','','Checklist editorial');list.append(head);
    entries.forEach(([ok,label])=>{const item=el('span',ok?'is-ready':'',`${ok?'✓':'○'} ${label}`);list.append(item)});
  }
  function buildPreview(){
    const viewport=previewPanel.querySelector('.blog-preview-viewport');
    viewport.replaceChildren();
    const card=el('article','diary-card live-entry admin-blog-preview-card');
    let src=coverObjectUrl||previewCover(form);
    if(src){
      const image=document.createElement('img');image.src=src;image.alt=title.value?`Portada de ${title.value}`:'Vista previa de portada';card.append(image);
    }else card.append(createGeneratedCover());
    const body=el('div','diary-copy');
    const category=el('span','category','EL DIARIO DE GIMAE');
    const h3=el('h3','',title.value.trim()||'Tu próxima historia de Gimae');
    const date=document.createElement('time');date.textContent=formatDate();
    const author=el('p','gimae-post-author','Por Equipo Gimae');
    const rich=el('div','');rt.render(content.value||'Escribe algo para comenzar a ver la preview en vivo ♡',rich);
    body.append(category,h3,date,author,rich);card.append(body);viewport.append(card);
    updateChecklist(Boolean(src));
  }
  function syncAll(){updateStats();buildPreview();saveLocalDraft()}

  toolbar.addEventListener('click',event=>{
    const button=event.target.closest('button[data-format]');if(!button)return;
    const action=button.dataset.format;
    if(action==='bold')insertMarkup(content,'**','**','texto importante');
    else if(action==='italic')insertMarkup(content,'*','*','énfasis');
    else if(action==='highlight')insertMarkup(content,'==','==','resaltado');
    else if(action==='strike')insertMarkup(content,'~~','~~','texto');
  });

  // Reasignamos colores y acciones complejas sin depender de HTML editable.
  toolbar.addEventListener('click',event=>{
    const button=event.target.closest('button[data-format]');if(!button)return;
    const action=button.dataset.format;
    if(['pink','red','yellow','purple'].includes(action)){
      const start=content.selectionStart,end=content.selectionEnd,selected=content.value.slice(start,end)||'texto con color';
      content.setRangeText(`[[${action}|${selected}]]`,start,end,'end');content.focus();content.setSelectionRange(start+action.length+3,start+action.length+3+selected.length);content.dispatchEvent(new Event('input',{bubbles:true}));return;
    }
    if(action==='ja')insertMarkup(content,'[[ja|',']]','きらきら');
    else if(action==='heading')insertLine(content,'## ','Subtítulo');
    else if(action==='quote')insertLine(content,'> ','Una cita o frase especial');
    else if(action==='callout')insertLine(content,'! ','Dato destacado');
    else if(action==='idol')insertLine(content,'♡ ','Una notita para las fans');
    else if(action==='list')insertLine(content,'- ','Elemento de la lista');
    else if(action==='divider'){const start=content.selectionStart;content.setRangeText(`${start&&content.value[start-1]!=='\n'?'\n':''}---\n`,start,start,'end');content.dispatchEvent(new Event('input',{bubbles:true}))}
    else if(action==='link')insertLink(content);
  });

  content.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey))return;
    const key=event.key.toLowerCase();
    if(key==='b'){event.preventDefault();insertMarkup(content,'**','**','negrita')}
    if(key==='i'){event.preventDefault();insertMarkup(content,'*','*','cursiva')}
    if(key==='k'){event.preventDefault();insertLink(content)}
  });
  slug.addEventListener('input',()=>{slugTouched=true;syncAll()});
  title.addEventListener('input',()=>{if(!slugTouched||!slug.value)slug.value=slugify(title.value);syncAll()});
  slugButton.addEventListener('click',()=>{slug.value=slugify(title.value);slugTouched=true;slug.dispatchEvent(new Event('input',{bubbles:true}))});
  [content,status,visibility].forEach(node=>node.addEventListener(node===content?'input':'change',syncAll));
  form.elements.cover?.addEventListener('change',()=>{
    if(coverObjectUrl)URL.revokeObjectURL(coverObjectUrl);
    const file=form.elements.cover.files?.[0];if(file)coverObjectUrl=URL.createObjectURL(file);
    syncAll();
  });

  previewPanel.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>{
    previewPanel.querySelectorAll('[data-preview]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    previewPanel.querySelector('.blog-preview-viewport').dataset.previewMode=button.dataset.preview;
  }));

  const focusButton=studioHead.querySelector('[data-blog-focus]');
  const setFocus=enabled=>{editorRoot.classList.toggle('blog-focus-mode',enabled);focusButton.setAttribute('aria-pressed',String(enabled));focusButton.textContent=enabled?'× Salir de enfoque':'⛶ Modo enfoque'};
  focusButton.addEventListener('click',()=>setFocus(!editorRoot.classList.contains('blog-focus-mode')));
  const onKey=event=>{if(event.key==='Escape'&&editorRoot.classList.contains('blog-focus-mode'))setFocus(false)};
  document.addEventListener('keydown',onKey);cleanupFns.push(()=>document.removeEventListener('keydown',onKey));

  const formObserver=new MutationObserver(mutations=>{
    if(form.elements.cover?.files?.length)return;
    const addedCover=mutations.some(m=>[...m.addedNodes].some(node=>node.nodeType===1&&(node.matches?.('img.admin-cover')||node.querySelector?.('img.admin-cover'))));
    if(addedCover)buildPreview();
  });
  formObserver.observe(form,{childList:true,subtree:true});cleanupFns.push(()=>formObserver.disconnect());

  activeCleanup=()=>{clearTimeout(draftTimer);if(coverObjectUrl)URL.revokeObjectURL(coverObjectUrl);cleanupFns.forEach(fn=>fn());editorRoot.classList.remove('blog-focus-mode')};
  syncAll();
}

const editorObserver=new MutationObserver(()=>{
  const form=editorRoot.querySelector('#record-form');
  if(form?.elements?.content)enhanceBlogForm(form);
  else if(!form){activeCleanup?.();activeCleanup=null;editorRoot.classList.remove('is-blog-editor')}
});
editorObserver.observe(editorRoot,{childList:true,subtree:true});

if(statusNode){
  new MutationObserver(()=>{
    if(statusNode.textContent.trim()==='Cambios guardados.'&&activeDraftKey){
      localStorage.removeItem(activeDraftKey);
      activeDraftKey=null;
    }
  }).observe(statusNode,{childList:true,characterData:true,subtree:true});
}