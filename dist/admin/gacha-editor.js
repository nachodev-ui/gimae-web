const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tiers=['common','rare','ssr'];
const imageTypes=new Set(['image/jpeg','image/png','image/webp']);
const maxImageBytes=8*1024*1024;
const photoUrl=path=>path?.startsWith('images/')?'../'+path:path;
// Probabilities have two decimal places; integer hundredths avoid floating-point sums.
function weightHundredths(value){
  const match=String(value).trim().match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if(!match)return null;
  const units=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
  return units<=10000?units:null;
}
const percent=units=>`${(units/100).toFixed(2).replace(/\.?0+$/,'')}%`;
export async function renderGacha(client,records,editor,notice){
  const ui=window.GIMAE_UI;
  const query=async p=>{const {data,error}=await p;if(error)throw error;return data;};
  let cards,config,dragging=null,moving=false;
  const active=()=>document.querySelector('[data-tab="gacha"]')?.getAttribute('aria-current')==='true';
  const fail=error=>{notice(error.message);ui.toast({tone:'error',title:'No pudimos guardar el Gacha',message:error.message});};
  async function load(focusSerial){
    const data=await Promise.all([query(client.from('gacha_settings').select('*').eq('id',true).single()),query(client.from('gacha_cards').select('*').order('display_order').order('serial'))]);
    if(!active())return;
    [config,cards]=data;editor.replaceChildren();render();
    if(focusSerial)[...records.querySelectorAll('.gacha-admin-card')].find(item=>item.dataset.serial===focusSerial)?.focus();
    notice('Gacha listo. Edita cartas, nombres y probabilidades.');
  }
  function render(){
    records.innerHTML=`<div class="gacha-admin-heading"><div><p class="admin-card-eyebrow">PHOTOCARD STUDIO ✦</p><h2>Pequeños recuerdos, grandes sorpresas</h2><p>Cuida el catálogo que aparece en cada sobre de tus fans.</p></div><button type="button" id="gacha-add" class="gacha-button">＋ Nueva carta</button></div>
    <form id="gacha-settings-form" class="gacha-admin-settings"><h3>Las posibilidades del sobre</h3><p>La probabilidad corresponde a la categoría. Sus cartas activas comparten esa posibilidad por igual.</p><div class="gacha-tier-settings">${tiers.map(t=>{const count=cards.filter(c=>c.active&&c.rareza===t).length;return `<fieldset><legend>${esc(config.rarities[t].label)}</legend><label>Nombre<input name="${t}-label" value="${esc(config.rarities[t].label)}" maxlength="24" required></label><label>Probabilidad (%)<input name="${t}-weight" type="number" min="0" max="100" step="0.01" value="${config.rarities[t].weight}" required></label><small>${count} ${count===1?'carta activa':'cartas activas'}</small></fieldset>`;}).join('')}</div>
    <div id="gacha-weight-total" class="gacha-weight-status" role="status" aria-live="polite" aria-atomic="true"><span class="gacha-weight-icon" aria-hidden="true"></span><div class="gacha-weight-copy"><span class="gacha-weight-kicker">EL SOBRE ✦</span><strong class="gacha-weight-heading"></strong><span class="gacha-weight-detail"></span><div class="gacha-weight-track" role="progressbar" aria-label="Total de probabilidades" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="gacha-weight-fill"></span></div></div><span class="gacha-weight-decoration" aria-hidden="true">♡</span></div><div class="gacha-bonus-settings"><label>Mínimo en productos (CLP)<input name="minimum" type="number" min="2000" step="1" value="${config.minimum_clp}" required></label><label>Sobres por pedido<select name="pulls"><option value="2" ${config.pulls_per_order===2?'selected':''}>2 sobres</option><option value="3" ${config.pulls_per_order===3?'selected':''}>3 sobres</option></select></label></div><label class="admin-check"><input name="test" type="checkbox" ${config.allow_test_orders?'checked':''}>Permitir canjes de pedidos Sandbox para pruebas</label><p class="gacha-admin-note">Desactiva Sandbox antes de abrir la promoción al público. Los pedidos ya canjeados conservan su cantidad original de sobres.</p><button type="submit" id="gacha-settings-save" class="gacha-button is-primary" aria-describedby="gacha-save-help">Guardar posibilidades ♡</button><p id="gacha-save-help" class="gacha-save-help"></p></form>
    <div class="gacha-admin-heading gacha-album-heading"><div><h3>Catálogo · ${cards.length} cartas</h3><p>Arrastra una carta o enfócala y usa ← y → para cambiar el orden. El orden no cambia el azar.</p></div><button type="button" id="gacha-shuffle" class="gacha-button" ${cards.length<2?'disabled':''}>↝ Reorganizar álbum</button></div><div id="gacha-card-list" class="gacha-admin-grid"></div>`;
    records.querySelector('#gacha-add').onclick=()=>edit(null);
    const form=records.querySelector('#gacha-settings-form');
    const save=form.querySelector('#gacha-settings-save'),status=form.querySelector('#gacha-weight-total');
    const updateTotal=()=>{
      const weights=tiers.map(t=>weightHundredths(form.elements[`${t}-weight`].value));
      const valid=weights.every(value=>value!==null);
      const sum=valid?weights.reduce((total,value)=>total+value,0):0;
      const state=!valid?'invalid':sum===10000?'exact':sum<10000?'incomplete':'exceeded';
      status.dataset.state=state;
      status.querySelector('.gacha-weight-icon').textContent={invalid:'?',incomplete:'✦',exact:'♡',exceeded:'↗'}[state];
      status.querySelector('.gacha-weight-heading').textContent=valid?`Total: ${percent(sum)}`:'Revisa las probabilidades';
      status.querySelector('.gacha-weight-detail').textContent=state==='exact'?'¡Listo! El sobre suma 100%.':state==='incomplete'?`Faltan ${percent(10000-sum)} para completar el sobre.`:state==='exceeded'?`Te pasaste por ${percent(sum-10000)}. Ajusta las posibilidades.`:'Usa valores de 0 a 100 con hasta dos decimales.';
      const progress=Math.min(100,Math.max(0,sum/100)),bar=status.querySelector('.gacha-weight-track');
      bar.setAttribute('aria-valuenow',String(progress));bar.querySelector('.gacha-weight-fill').style.width=`${progress}%`;
      save.disabled=state!=='exact';
      form.querySelector('#gacha-save-help').textContent=state==='exact'?'Puedes guardar estas posibilidades.':'Guardar bloqueado: las probabilidades deben sumar exactamente 100%.';
      return state;
    };
    form.addEventListener('input',updateTotal);updateTotal();
    form.onsubmit=async e=>{
      e.preventDefault();if(updateTotal()!=='exact'||!form.reportValidity())return;save.disabled=true;
      try{
        const rarities=Object.fromEntries(tiers.map(t=>[t,{label:form.elements[`${t}-label`].value.trim(),weight:weightHundredths(form.elements[`${t}-weight`].value)/100}]));
        if(tiers.some(t=>rarities[t].weight>0&&!cards.some(c=>c.active&&c.rareza===t)))throw new Error('Cada categoría con probabilidad mayor a cero necesita al menos una carta activa.');
        if(form.elements.test.checked&&!config.allow_test_orders){if(!await ui.confirm({tone:'warning',title:'¿Activar canjes de prueba?',message:'Los pedidos pagados en Sandbox también podrán obtener sobres. Desactiva esta opción antes de la promoción pública.',confirmText:'Activar para pruebas'}))return;}
        await query(client.from('gacha_settings').update({rarities,minimum_clp:Number(form.elements.minimum.value),pulls_per_order:Number(form.elements.pulls.value),allow_test_orders:form.elements.test.checked}).eq('id',true));
        ui.toast({tone:'success',title:'Posibilidades guardadas',message:'Los próximos sobres usarán esta configuración.'});await load();
      }catch(error){fail(error);}finally{if(form.isConnected)updateTotal();}
    };
    const list=records.querySelector('#gacha-card-list');
    cards.forEach((card,index)=>{
      const item=document.createElement('article');item.className='gacha-admin-card';item.draggable=true;item.tabIndex=0;item.dataset.serial=card.serial;
      item.setAttribute('aria-label',`${card.integrante}, ${config.rarities[card.rareza].label}, ${card.active?'activa':'oculta'}. Posición ${index+1} de ${cards.length}. Usa flecha izquierda o derecha para reordenar.`);
      item.innerHTML=`<div class="gacha-card-head"><div class="gacha-card-badges"><span class="gacha-card-rarity">${esc(config.rarities[card.rareza].label)}</span><span class="gacha-card-state ${card.active?'is-active':'is-hidden'}">${card.active?'● Activa':'○ Oculta'}</span></div><div class="gacha-card-secondary"><button type="button" class="gacha-button is-icon" data-delete aria-label="Quitar ${esc(card.integrante)} del catálogo">×</button></div></div><div class="gacha-card-photo"><img src="${esc(photoUrl(card.imagen))}" alt="Photocard de ${esc(card.integrante)}" loading="lazy"></div><div class="gacha-card-body"><h4>${esc(card.integrante)}</h4><p>${esc(card.frase)}</p><button type="button" class="gacha-button is-primary gacha-card-edit" data-edit>Editar</button></div>`;
      item.querySelector('[data-edit]').onclick=()=>edit(card);
      item.querySelector('[data-delete]').onclick=async()=>{
        if(!await ui.confirm({tone:'danger',title:'¿Quitar esta photocard?',message:'Se eliminará del catálogo y dejará de salir en nuevos sobres. Las cartas ya obtenidas por tus fans se conservan.',image:{src:item.querySelector('img').src,alt:card.integrante,caption:config.rarities[card.rareza].label},confirmText:'Quitar carta'}))return;
        try{await query(client.from('gacha_cards').delete().eq('serial',card.serial));await load();ui.toast({tone:'success',title:'Carta eliminada',message:'Se retiró del catálogo de nuevos sobres.'});}catch(error){fail(error);}
      };
      item.addEventListener('keydown',event=>{
        if(event.target!==item||!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();move(index,index+(event.key==='ArrowLeft'?-1:1),card.serial);
      });
      item.addEventListener('dragstart',e=>{if(e.target instanceof HTMLImageElement||e.target.closest('button')){e.preventDefault();return;}dragging=index;e.dataTransfer.setData('text/plain',card.serial);item.classList.add('is-dragging');});
      item.addEventListener('dragend',()=>{dragging=null;item.classList.remove('is-dragging');});
      item.addEventListener('dragover',e=>{if(dragging!==null)e.preventDefault();});
      item.addEventListener('drop',e=>{e.preventDefault();if(dragging!==null)move(dragging,index);});
      list.append(item);
    });
    records.querySelector('#gacha-shuffle').onclick=shuffle;
  }
  async function persistOrder(ordered,focusSerial){
    moving=true;
    try{
      const serials=ordered.map(card=>card.serial);
      await query(client.rpc('reorder_gacha_cards',{p_serials:serials}));await load(focusSerial);
      if(!cards||cards.map(card=>card.serial).some((serial,index)=>serial!==serials[index]))throw new Error('El orden guardado no coincide con el álbum recargado. Vuelve a intentarlo.');
      return true;
    }catch(error){fail(error);return false;}finally{moving=false;dragging=null;}
  }
  async function move(from,to,focusSerial){
    if(moving||to<0||to>=cards.length||from===to)return;
    const ordered=[...cards];ordered.splice(to,0,ordered.splice(from,1)[0]);
    await persistOrder(ordered,focusSerial);
  }
  async function shuffle(){
    if(moving||cards.length<2)return;
    if(!await ui.confirm({tone:'warning',title:'¿Reorganizar el álbum?',message:'Se mezclará el orden actual de todas las cartas del álbum. Este cambio se guardará de inmediato.',confirmText:'Reorganizar álbum'}))return;
    const ordered=[...cards];
    for(let i=ordered.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
    if(ordered.every((card,index)=>card.serial===cards[index].serial)){
      [ordered[ordered.length-1],ordered[ordered.length-2]]=[ordered[ordered.length-2],ordered[ordered.length-1]];
    }
    if(await persistOrder(ordered))ui.toast({tone:'success',title:'Álbum reorganizado',message:'El nuevo orden se guardó y se verificó al recargarlo.'});
  }
  function edit(card){
    const photo=card?.imagen || '';
    editor.innerHTML=`<p class="admin-card-eyebrow">${card?'EDITAR RECUERDO':'NUEVA PHOTOCARD'} ♡</p><h2>${card?'Cuida cada detalle':'Una nueva estrella'}</h2>
      <form id="gacha-card-form" class="gacha-card-form"><div class="member-editor-visual-layout gacha-visual-layout">
      <div class="member-editor-photo-card gacha-preview-box"><div class="member-editor-photo-frame gacha-preview-frame"><img id="gacha-preview" alt="Vista previa de la photocard" ${photo?`src="${esc(photoUrl(photo))}"`:'hidden'}><div class="member-editor-photo-fallback gacha-preview-fallback" ${photo?'hidden':''} aria-hidden="true"><span>♡</span><small>Sin imagen</small></div></div><div class="member-editor-photo-copy"><strong>Vista previa pública</strong><small>Imagen completa en el formato 2.55:3.65 de la carta. El encuadre y el zoom se aplican al álbum público.</small></div></div>
      <div class="member-editor-visual-controls gacha-visual-controls"><div class="gacha-media-manager"><div class="merch-media-head"><div><span class="merch-mini-kicker">IMAGEN DE LA CARTA</span><h4>Photocard</h4><p>Usa una sola imagen. Puedes reemplazarla antes de guardar.</p></div><span id="gacha-image-spec" class="merch-media-spec">PNG · JPG · WebP · máx. 8 MB</span></div><div class="merch-image-drop gacha-image-drop" role="button" tabindex="0" aria-label="Seleccionar imagen de la carta"><span class="merch-image-drop-icon" aria-hidden="true">＋</span><div><strong>Arrastra una imagen aquí</strong><small>o selecciónala desde tu computador o celular</small></div><label class="gacha-visually-hidden" for="gacha-file">Imagen de la carta</label><input id="gacha-file" class="gacha-file-input" name="file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="gacha-image-spec gacha-upload-status"></div><div class="merch-image-actions"><button type="button" class="merch-media-primary gacha-button is-primary" id="gacha-pick-image">${photo?'Reemplazar':'＋ Seleccionar imagen'}</button><button type="button" class="merch-media-secondary gacha-button" id="gacha-remove-image" ${photo?'':'hidden'}>Quitar imagen</button></div><p id="gacha-upload-status" role="status" aria-live="polite"></p></div>
      <div class="gacha-card-details"><label>Integrante / nombre de carta<input name="integrante" value="${esc(card?.integrante)}" maxlength="60" required></label><label>Categoría<select name="rareza">${tiers.map(t=>`<option value="${t}" ${card?.rareza===t?'selected':''}>${esc(config.rarities[t].label)}</option>`).join('')}</select></label><label class="is-wide">Frase<textarea name="frase" maxlength="160">${esc(card?.frase)}</textarea></label><div class="gacha-bonus-settings"><label>Encuadre horizontal (%)<input name="x" type="number" min="0" max="100" value="${parseFloat(card?.crop || '50%')}" required></label><label>Encuadre vertical (%)<input name="y" type="number" min="0" max="100" value="${parseFloat(card?.crop?.split(' ')[1] || '25%')}" required></label><label>Zoom<input name="zoom" type="number" min="1" max="2" step="0.01" value="${card?.zoom || 1}" required></label></div><label class="admin-check"><input name="active" type="checkbox" ${!card||card.active?'checked':''}>Disponible en nuevos sobres</label></div></div></div>
      <input name="imagen" type="hidden" value="${esc(photo)}"><div class="gacha-card-form-actions"><button type="submit" class="gacha-button is-primary">Guardar carta ♡</button><button type="button" id="gacha-editor-cancel" class="gacha-button">Cerrar</button></div></form>`;
    editor.scrollIntoView(window.matchMedia('(prefers-reduced-motion: reduce)').matches?{block:'start'}:{behavior:'smooth',block:'start'});
    const form=editor.querySelector('form'),preview=form.querySelector('#gacha-preview'),zone=form.querySelector('.gacha-image-drop'),submit=form.querySelector('[type=submit]');
    const fileInput=form.elements.file,status=form.querySelector('#gacha-upload-status'),remove=form.querySelector('#gacha-remove-image'),pick=form.querySelector('#gacha-pick-image');
    let uploading=false,revision=0,objectUrl=null;
    const releasePreview=()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}};
    const syncImage=()=>{
      const hasImage=Boolean(preview.getAttribute('src'));
      preview.hidden=!hasImage;form.querySelector('.gacha-preview-fallback').hidden=hasImage;
      remove.hidden=!form.elements.imagen.value;pick.textContent=form.elements.imagen.value?'Reemplazar':'＋ Seleccionar imagen';
    };
    const imageError=message=>{status.textContent=message;status.dataset.tone='error';ui.toast({tone:'warning',title:'Imagen no válida',message});};
    async function upload(file){
      if(!file||uploading)return;
      if(!imageTypes.has(file.type)){imageError('Selecciona una imagen PNG, JPG o WebP.');return;}
      if(file.size>maxImageBytes){imageError('La imagen supera el máximo de 8 MB. Elige una más liviana.');return;}
      const priorImage=form.elements.imagen.value;
      uploading=true;submit.disabled=true;pick.disabled=true;remove.disabled=true;const generation=++revision;
      status.dataset.tone='info';status.textContent='Subiendo imagen…';
      try{
        releasePreview();objectUrl=URL.createObjectURL(file);preview.src=objectUrl;syncImage();
        const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type],path=`cards/${crypto.randomUUID()}.${ext}`;
        await query(client.storage.from('gimae-gacha').upload(path,file,{contentType:file.type,upsert:false}));
        const {data}=client.storage.from('gimae-gacha').getPublicUrl(path);
        if(generation!==revision||!form.isConnected)return;
        form.elements.imagen.value=data.publicUrl;preview.src=data.publicUrl;releasePreview();syncImage();
        status.textContent='Imagen lista. Guarda la carta para publicarla.';
      }catch(error){
        releasePreview();if(priorImage)preview.src=photoUrl(priorImage);else preview.removeAttribute('src');syncImage();
        status.dataset.tone='error';status.textContent=`No pudimos subir la imagen: ${error.message}`;fail(error);
      }
      finally{if(!form.isConnected)releasePreview();uploading=false;submit.disabled=false;pick.disabled=false;remove.disabled=false;fileInput.value='';}
    }
    fileInput.onchange=()=>upload(fileInput.files[0]);
    pick.onclick=()=>fileInput.click();zone.onclick=event=>{if(event.target!==fileInput)fileInput.click();};
    zone.onkeydown=event=>{if(event.target===zone&&(event.key==='Enter'||event.key===' ')){event.preventDefault();fileInput.click();}};
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('is-over');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('is-over'));
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('is-over');upload(e.dataTransfer.files[0]);});
    remove.onclick=async()=>{
      if(uploading||!form.elements.imagen.value)return;
      if(await ui.confirm({tone:'danger',title:'¿Quitar esta imagen?',message:'Elige una nueva imagen antes de guardar la carta.',image:{src:preview.src,alt:'Imagen que se va a quitar'},confirmText:'Quitar imagen'})){form.elements.imagen.value='';preview.removeAttribute('src');fileInput.value='';syncImage();status.textContent='Imagen quitada. Selecciona otra antes de guardar.';}
    };
    form.querySelector('#gacha-editor-cancel').onclick=()=>{revision++;releasePreview();editor.replaceChildren();};
    form.onsubmit=async e=>{
      e.preventDefault();if(uploading||submit.disabled)return;submit.disabled=true;
      try{
        if(!form.elements.imagen.value)throw new Error('Selecciona una imagen antes de guardar.');
        const row={integrante:form.elements.integrante.value.trim(),rareza:form.elements.rareza.value,frase:form.elements.frase.value.trim(),imagen:form.elements.imagen.value,crop:`${form.elements.x.value}% ${form.elements.y.value}%`,zoom:Number(form.elements.zoom.value),active:form.elements.active.checked};
        await query(card?client.from('gacha_cards').update(row).eq('serial',card.serial):client.from('gacha_cards').insert({...row,display_order:cards.length?Math.max(...cards.map(c=>c.display_order))+1:0}));
        await load();ui.toast({tone:'success',title:'Carta guardada',message:'Tu catálogo ya está actualizado.'});
      }catch(error){fail(error);}finally{submit.disabled=false;}
    };
  }
  await load();
}
