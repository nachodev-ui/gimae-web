const editorRoot=document.querySelector('#editor');
const merchTab=document.querySelector('[data-tab="products"]');
const ui=window.GIMAE_UI;
let activeCleanup=null;
let enhanceRaf=0;

const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const MAX_IMAGE=8*1024*1024;
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const money=value=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value)||0);
const formatBytes=value=>{const bytes=Number(value)||0;if(bytes<1024)return `${bytes} B`;if(bytes<1024**2)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1024**2).toFixed(bytes>=10*1024**2?0:1)} MB`};
const toast=(tone,title,message)=>ui?.toast({tone,title,message});
const isMerchActive=()=>merchTab?.getAttribute('aria-current')==='true';

function field(form,name){return form.elements[name]?.closest('label')||null}
function removeLooseText(label){
  [...label.childNodes].forEach(node=>{if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim())node.remove()});
}
function decorateField(form,name,title,help,{compact=false}={}){
  const label=field(form,name);if(!label||label.dataset.merchDecorated)return label;
  label.dataset.merchDecorated='true';label.classList.add('merch-field');if(compact)label.classList.add('is-compact');
  removeLooseText(label);
  const titleNode=el('span','merch-field-title',title);label.prepend(titleNode);
  if(help)label.append(el('small','merch-field-help',help));
  return label;
}
function decorateToggle(form,name,title,help){
  const input=form.elements[name];const label=input?.closest('label');if(!label||label.dataset.merchDecorated)return label;
  label.dataset.merchDecorated='true';label.classList.add('merch-toggle-card');
  [...label.childNodes].forEach(node=>{if(node!==input)node.remove()});
  const visual=el('span','merch-toggle-visual');visual.setAttribute('aria-hidden','true');
  const copy=el('span','merch-toggle-copy');copy.append(el('strong','',title),el('small','',help));
  label.append(visual,copy);return label;
}
function section(number,title,help,className=''){
  const node=el('section',`merch-editor-section ${className}`.trim());
  const head=el('div','merch-section-head');
  const badge=el('span','merch-section-number',String(number).padStart(2,'0'));
  const copy=el('div');copy.append(el('h3','',title),el('p','',help));head.append(badge,copy);node.append(head);
  return node;
}
function appendExisting(parent,...nodes){nodes.filter(Boolean).forEach(node=>parent.append(node))}
function validateImage(file){
  if(!IMAGE_TYPES.has(file.type)&&!/[.](?:png|jpe?g|webp)$/i.test(file.name))throw new Error(`${file.name}: usa PNG, JPG o WebP.`);
  if(file.size>MAX_IMAGE)throw new Error(`${file.name}: supera el máximo de 8 MB.`);
}
function fileKey(file){return `${file.name}:${file.size}:${file.lastModified}`}
function applyFiles(input,files){
  if(typeof DataTransfer==='undefined')return false;
  const transfer=new DataTransfer();files.forEach(file=>transfer.items.add(file));input.files=transfer.files;return true;
}

function buildHero(form,isEditing){
  const nameInput=form.elements.name;
  const active=form.elements.active?.checked??true;
  const hero=el('header','merch-editor-hero');
  const copy=el('div','merch-editor-hero-copy');
  copy.append(el('p','merch-editor-eyebrow','GIMAE! MERCH STUDIO'));
  const heading=el('h2','',isEditing?`Editar ${nameInput?.value||'producto'}`:'Crear nuevo producto');copy.append(heading);
  copy.append(el('p','merch-editor-lede','Información clara para actualizar precios, inventario, imágenes y variantes sin perderse entre controles.'));
  const actions=el('div','merch-editor-hero-actions');
  const state=el('span',`merch-editor-state ${active?'is-live':'is-hidden'}`,active?'● Visible en la tienda':'○ Oculto de la tienda');
  const back=el('button','merch-editor-back','← Volver al catálogo');back.type='button';back.addEventListener('click',()=>merchTab?.click());
  actions.append(state,back);hero.append(copy,actions);
  const syncHeading=()=>{heading.textContent=isEditing?`Editar ${nameInput?.value.trim()||'producto'}`:'Crear nuevo producto'};
  const syncState=()=>{const live=form.elements.active?.checked;state.className=`merch-editor-state ${live?'is-live':'is-hidden'}`;state.textContent=live?'● Visible en la tienda':'○ Oculto de la tienda'};
  nameInput?.addEventListener('input',syncHeading);form.elements.active?.addEventListener('change',syncState);
  return {hero,cleanup:()=>{nameInput?.removeEventListener('input',syncHeading);form.elements.active?.removeEventListener('change',syncState)}};
}

function buildImageManager(form,fieldset,cleanup){
  const input=form.elements.images;if(!input||!fieldset)return;
  fieldset.classList.add('merch-image-manager');
  const legend=fieldset.querySelector('legend');if(legend)legend.hidden=true;
  const nativeLabel=input.closest('label');nativeLabel?.classList.add('merch-native-file-field');
  const legacyPreview=nativeLabel?.nextElementSibling;if(legacyPreview?.classList.contains('admin-preview')&&legacyPreview.id!=='image-list')legacyPreview.classList.add('merch-legacy-file-preview');
  const currentList=fieldset.querySelector('#image-list');
  let pendingFiles=[];let pickerMode='add';const objectUrls=new Set();

  const intro=el('div','merch-media-head');
  const introCopy=el('div');introCopy.append(el('span','merch-mini-kicker','GALERÍA DEL PRODUCTO'),el('h4','','Imágenes del producto'),el('p','',form.elements.variant_source?.value==='members'?'Asocia cada foto con su integrante. Puedes cambiar el orden libremente: la asociación determina qué variante se añade al carrito.':'La primera imagen funciona como referencia principal en la tienda. Puedes añadir, quitar y cambiar el orden de las fotos cuando quieras.'));
  intro.append(introCopy,el('span','merch-media-spec','PNG · JPG · WebP · máx. 8 MB'));

  const drop=el('div','merch-image-drop');drop.tabIndex=0;drop.setAttribute('role','button');drop.setAttribute('aria-label','Añadir imágenes al producto');
  const dropIcon=el('span','merch-image-drop-icon','＋');dropIcon.setAttribute('aria-hidden','true');
  const dropCopy=el('div');dropCopy.append(el('strong','','Arrastra imágenes aquí'),el('small','','o selecciónalas desde tu computador o celular'));drop.append(dropIcon,dropCopy);

  const actionRow=el('div','merch-image-actions');
  const add=el('button','merch-media-primary','＋ Añadir imágenes');add.type='button';
  const replace=el('button','merch-media-secondary','↻ Reemplazar selección pendiente');replace.type='button';
  const clear=el('button','merch-media-secondary','Vaciar selección');clear.type='button';clear.hidden=true;
  actionRow.append(add,replace,clear);

  const pendingBox=el('div','merch-pending-images');
  const pendingHead=el('div','merch-current-head');pendingHead.append(el('strong','','Pendientes de guardar'),el('span','merch-count','0 archivos'));
  const pendingGrid=el('div','merch-pending-grid');pendingBox.append(pendingHead,pendingGrid);

  const currentBox=el('div','merch-current-images');
  const currentHead=el('div','merch-current-head');currentHead.append(el('strong','','Galería actual'),el('span','merch-current-help','Mantén pulsada una foto y arrástrala a otra posición. La primera será la imagen principal. Usa × para quitar una foto.'));
  currentBox.append(currentHead);
  if(currentList)currentBox.append(currentList);

  const note=el('p','merch-media-note','Las imágenes seleccionadas se añadirán cuando pulses “Guardar producto”. No reemplazan automáticamente las imágenes actuales.');
  nativeLabel?.before(intro,drop,actionRow,pendingBox,currentBox,note);

  function setPending(files){
    pendingFiles=files;applyFiles(input,pendingFiles);renderPending();
  }
  function mergeFiles(files,replaceMode=false){
    const accepted=[];for(const file of files){try{validateImage(file);accepted.push(file)}catch(error){toast('warning','Imagen no válida',error.message)}}
    const base=replaceMode?[]:pendingFiles;const seen=new Set(base.map(fileKey));const merged=[...base];
    accepted.forEach(file=>{const key=fileKey(file);if(!seen.has(key)){seen.add(key);merged.push(file)}});setPending(merged);
  }
  function renderPending(){
    objectUrls.forEach(url=>URL.revokeObjectURL(url));objectUrls.clear();pendingGrid.replaceChildren();
    pendingHead.querySelector('.merch-count').textContent=`${pendingFiles.length} ${pendingFiles.length===1?'archivo':'archivos'}`;clear.hidden=!pendingFiles.length;
    if(!pendingFiles.length){const empty=el('div','merch-pending-empty');empty.append(el('span','','♡'),el('strong','','No hay imágenes nuevas seleccionadas'),el('small','','Usa “Añadir imágenes” cuando quieras sumar fotos a la galería.'));pendingGrid.append(empty);return}
    pendingFiles.forEach((file,index)=>{
      const card=el('article','merch-pending-card');const visual=el('div','merch-pending-visual');const image=document.createElement('img');const url=URL.createObjectURL(file);objectUrls.add(url);image.src=url;image.alt=`Vista previa de ${file.name}`;visual.append(image);
      const meta=el('div','merch-pending-meta');meta.append(el('strong','',file.name),el('small','',formatBytes(file.size)));
      const remove=el('button','merch-mini-remove','Quitar');remove.type='button';remove.addEventListener('click',()=>setPending(pendingFiles.filter((_,i)=>i!==index)));
      card.append(visual,meta,remove);pendingGrid.append(card);
    });
  }
  function pick(mode){pickerMode=mode;input.click()}
  const onChange=()=>{const chosen=[...input.files];mergeFiles(chosen,pickerMode==='replace');pickerMode='add'};
  const onDrop=event=>{event.preventDefault();drop.classList.remove('is-over');mergeFiles([...event.dataTransfer.files])};
  const onDrag=event=>{event.preventDefault();drop.classList.add('is-over')};
  const onLeave=()=>drop.classList.remove('is-over');
  const onKey=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pick('add')}};
  add.addEventListener('click',()=>pick('add'));replace.addEventListener('click',()=>pick('replace'));clear.addEventListener('click',()=>setPending([]));drop.addEventListener('click',()=>pick('add'));drop.addEventListener('keydown',onKey);drop.addEventListener('dragover',onDrag);drop.addEventListener('dragleave',onLeave);drop.addEventListener('drop',onDrop);input.addEventListener('change',onChange);
  renderPending();

  if(currentList){
    const decorateCurrent=()=>{
      currentList.setAttribute('aria-label','Galería actual del producto. Arrastra una foto para cambiar el orden.');
      [...currentList.children].forEach((card,index)=>{
        if(!card.querySelector('img'))return;
        card.dataset.merchImageCard='true';card.classList.add('merch-current-image-card');
        let badge=card.querySelector('.merch-image-role');
        if(!badge){badge=el('span','merch-image-role');card.prepend(badge)}
        badge.textContent=index===0?'Imagen principal':`Imagen ${index+1}`;
        const legacyButton=card.querySelector('button:not(.merch-image-delete)');
        if(legacyButton){legacyButton.classList.add('merch-current-remove');legacyButton.textContent='Quitar imagen'}
      });
    };
    const imageObserver=new MutationObserver(decorateCurrent);imageObserver.observe(currentList,{childList:true});decorateCurrent();cleanup.push(()=>imageObserver.disconnect());
  }
  cleanup.push(()=>{objectUrls.forEach(url=>URL.revokeObjectURL(url));input.removeEventListener('change',onChange);drop.removeEventListener('keydown',onKey);drop.removeEventListener('dragover',onDrag);drop.removeEventListener('dragleave',onLeave);drop.removeEventListener('drop',onDrop)});
}

function enhanceVariantRows(list){
  if(!list)return;
  [...list.children].forEach(row=>{
    if(row.dataset.merchVariantRow)return;row.dataset.merchVariantRow='true';row.classList.add('merch-variant-card');
    const name=row.querySelector('strong');const numbers=[...row.querySelectorAll('input[type="number"]')];const price=numbers[0],stock=numbers[1];const confirmed=row.querySelector('input[type="checkbox"]');const save=row.querySelector('button');
    if(!name||!price||!stock||!confirmed||!save)return;
    const title=name.textContent.trim();row.replaceChildren();
    const head=el('div','merch-variant-head');const identity=el('div');identity.append(el('span','merch-variant-kicker','VARIANTE'),name);const state=el('span','merch-variant-state');head.append(identity,state);
    const fields=el('div','merch-variant-fields');
    const priceLabel=el('label','merch-variant-field');priceLabel.append(el('span','','Precio'),price,el('small','',`Precio actual: ${money(price.value)}`));
    const stockLabel=el('label','merch-variant-field');stockLabel.append(el('span','','Stock disponible'),stock,el('small','','Unidades listas para vender'));
    const confirmLabel=el('label','merch-variant-confirm');confirmLabel.append(confirmed);const confirmCopy=el('span');confirmCopy.append(el('strong','','Stock confirmado'),el('small','','Actívalo solo después de revisar físicamente las unidades.'));confirmLabel.append(el('span','merch-check-visual'),confirmCopy);
    save.classList.add('merch-save-variant');save.textContent='Guardar cambios';fields.append(priceLabel,stockLabel,confirmLabel,save);row.append(head,fields);
    const updateState=()=>{const value=Number(stock.value)||0;if(!confirmed.checked){state.className='merch-variant-state is-pending';state.textContent='Stock por confirmar'}else if(value<=0){state.className='merch-variant-state is-out';state.textContent='Agotado'}else{state.className='merch-variant-state is-ok';state.textContent=`${value} uds. disponibles`}priceLabel.querySelector('small').textContent=`Precio actual: ${money(price.value)}`};
    price.addEventListener('input',updateState);stock.addEventListener('input',updateState);confirmed.addEventListener('change',updateState);updateState();
  });
}

function buildVariantsManager(form,fieldset,cleanup){
  if(!fieldset)return;fieldset.classList.add('merch-variants-manager');const legend=fieldset.querySelector('legend');if(legend)legend.hidden=true;
  const list=fieldset.querySelector('#variant-list');
  const info=el('div','merch-variants-intro');const infoIcon=el('span','','✦');infoIcon.setAttribute('aria-hidden','true');const copy=el('div');copy.append(el('strong','','¿Qué es una variante?'),el('p','','Es una opción del mismo producto —por ejemplo una integrante, color o talla— que puede tener su propio precio y stock. Actualiza una fila y pulsa “Guardar cambios”.'));info.append(infoIcon,copy);fieldset.prepend(info);
  if(list){const observer=new MutationObserver(()=>enhanceVariantRows(list));observer.observe(list,{childList:true});enhanceVariantRows(list);cleanup.push(()=>observer.disconnect())}
  const newVariant=form.elements.new_variant?.closest('label');const newPrice=form.elements.new_price?.closest('label');const add=form.querySelector('#add-variant');const row=newVariant?.parentElement;
  if(row){row.classList.add('merch-new-variant-fields');decorateField(form,'new_variant','Nombre de la nueva variante','Ej.: Suki · Rosado, Talla M o Edición especial.');decorateField(form,'new_price','Precio de esta variante','Puedes usar el precio general o definir uno distinto.');}
  if(add){add.classList.add('merch-add-variant');add.textContent='＋ Añadir nueva variante'}
}

function enhance(form){
  if(form.dataset.merchEditor==='true'||!isMerchActive()||!form.elements.price_clp)return;
  activeCleanup?.();const cleanup=[];form.dataset.merchEditor='true';editorRoot.classList.add('is-merch-editor');
  const oldHeading=editorRoot.querySelector(':scope > h2');oldHeading?.classList.add('merch-legacy-editor-title');
  const isEditing=Boolean(form.querySelector('#delete-record'));
  const heroData=buildHero(form,isEditing);form.before(heroData.hero);cleanup.push(heroData.cleanup);

  decorateField(form,'name','Nombre del producto','Así aparecerá en la tienda y en el carrito.');
  decorateField(form,'description','Descripción','Explica qué incluye, materiales o detalles importantes para quien compra.');
  decorateField(form,'note','Frase breve','Una línea corta y atractiva para la tarjeta del producto.');
  decorateField(form,'id','Código interno','Identificador único del producto. No conviene cambiarlo después de crearlo.',{compact:true});
  decorateField(form,'price_clp','Precio general','Precio base en pesos chilenos. Las variantes pueden sobrescribirlo.');
  decorateField(form,'stock','Stock general','Úsalo cuando el producto no tenga stock separado por variantes.');
  decorateField(form,'display_order','Orden en la tienda','0 aparece primero; números mayores aparecen después.');
  decorateField(form,'variant_label','Cómo llamamos a las variantes','Ej.: Integrante, Color, Talla. Se muestra como contexto en el panel.');
  decorateField(form,'variant_source','Origen automático','“members” vincula las variantes con las integrantes. Déjalo vacío para variantes manuales.');
  decorateToggle(form,'stock_confirmed','Inventario general confirmado','Actívalo cuando hayas comprobado físicamente el stock general.');
  decorateToggle(form,'active','Visible en la web','Desactívalo para ocultar el producto de la tienda sin eliminarlo.');

  const basics=section(1,'Información del producto','Lo que verá la gente cuando encuentre este artículo.','merch-basics-section');
  const basicGrid=el('div','merch-form-grid');appendExisting(basicGrid,field(form,'name'),field(form,'description'),field(form,'note'));basics.append(basicGrid);
  const sales=section(2,'Precio, stock y publicación','Los datos que más se revisan durante ventas y eventos.','merch-sales-section');
  const salesGrid=el('div','merch-sales-grid');appendExisting(salesGrid,field(form,'price_clp'),field(form,'stock'));const toggles=el('div','merch-toggle-grid');appendExisting(toggles,form.elements.stock_confirmed?.closest('label'),form.elements.active?.closest('label'));sales.append(salesGrid,toggles);
  const variantSetup=section(3,'Configuración de variantes','Define cómo se organizan las opciones de este producto.','merch-variant-setup-section');
  const variantSetupGrid=el('div','merch-variant-setup-grid');appendExisting(variantSetupGrid,field(form,'variant_label'),field(form,'variant_source'));variantSetup.append(variantSetupGrid);
  const advanced=document.createElement('details');advanced.className='merch-advanced-settings';const summary=document.createElement('summary');summary.textContent='Ajustes internos del catálogo';const advancedGrid=el('div','merch-advanced-grid');appendExisting(advancedGrid,field(form,'id'),field(form,'display_order'));advanced.append(summary,advancedGrid);variantSetup.append(advanced);

  const firstFieldset=form.querySelector('fieldset');
  const fieldsets=[...form.querySelectorAll('fieldset')];const imageFieldset=fieldsets.find(node=>node.querySelector('[name="images"]'));const variantsFieldset=fieldsets.find(node=>node.querySelector('#variant-list'));
  if(imageFieldset){const wrapper=section(4,'Imágenes del producto','Mantén una galería clara y consistente con lo que se muestra en la tienda.','merch-media-section');imageFieldset.before(wrapper);wrapper.append(imageFieldset);buildImageManager(form,imageFieldset,cleanup)}
  if(variantsFieldset){const wrapper=section(5,'Variantes y stock','Revisa cada opción por separado para evitar vender unidades que no están confirmadas.','merch-variants-section');variantsFieldset.before(wrapper);wrapper.append(variantsFieldset);buildVariantsManager(form,variantsFieldset,cleanup)}
  const hint=[...form.querySelectorAll('.admin-hint')].find(node=>node.textContent.includes('Guarda el producto'));if(hint){const wrapper=section(4,'Imágenes y variantes','Primero guarda este producto; después podrás añadir su galería y opciones de stock.','merch-empty-config-section');hint.before(wrapper);wrapper.append(hint)}

  const anchor=firstFieldset?.parentElement===form?firstFieldset:form.firstElementChild;
  const actions=form.querySelector('.admin-actions');
  if(anchor)form.insertBefore(basics,anchor);else form.prepend(basics);
  basics.after(sales,variantSetup);
  if(actions){actions.classList.add('merch-editor-actions');const save=actions.querySelector('[type="submit"]');if(save)save.textContent=isEditing?'Guardar producto':'Crear producto';const del=actions.querySelector('.danger');if(del)del.textContent='Eliminar producto'}

  activeCleanup=()=>{cleanup.forEach(fn=>{try{fn()}catch{}});editorRoot.classList.remove('is-merch-editor');activeCleanup=null};
}

function scheduleEnhance(){
  cancelAnimationFrame(enhanceRaf);enhanceRaf=requestAnimationFrame(()=>{
    const form=editorRoot?.querySelector('#record-form');
    if(!form||!isMerchActive()){if(activeCleanup&&!form)activeCleanup();return}
    enhance(form);
  });
}
if(editorRoot){const observer=new MutationObserver(scheduleEnhance);observer.observe(editorRoot,{childList:true});scheduleEnhance()}
