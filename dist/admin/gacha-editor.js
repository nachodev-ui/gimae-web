const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tiers=['common','rare','ssr'];
export async function renderGacha(client,records,editor,notice){
  const ui=window.GIMAE_UI;
  const query=async p=>{const {data,error}=await p;if(error)throw error;return data;};
  let cards,config,dragging=null;
  const active=()=>document.querySelector('[data-tab="gacha"]')?.getAttribute('aria-current')==='true';
  const fail=error=>{notice(error.message);ui.toast({tone:'error',title:'No pudimos guardar el Gacha',message:error.message});};
  async function load(){
    const data=await Promise.all([query(client.from('gacha_settings').select('*').eq('id',true).single()),query(client.from('gacha_cards').select('*').order('display_order').order('serial'))]);
    if(!active())return;
    [config,cards]=data;editor.replaceChildren();render();notice('Gacha listo. Edita cartas, nombres y probabilidades.');
  }
  function render(){
    records.innerHTML=`<div class="gacha-admin-heading"><div><p class="admin-card-eyebrow">PHOTOCARD STUDIO ✦</p><h2>Pequeños recuerdos, grandes sorpresas</h2><p>Cuida el catálogo que aparece en cada sobre de tus fans.</p></div><button type="button" id="gacha-add">＋ Nueva carta</button></div>
    <form id="gacha-settings-form" class="gacha-admin-settings"><h3>Las posibilidades del sobre</h3><p>La probabilidad corresponde a la categoría. Sus cartas activas comparten esa posibilidad por igual.</p><div class="gacha-tier-settings">${tiers.map(t=>`<fieldset><legend>${esc(config.rarities[t].label)}</legend><label>Nombre<input name="${t}-label" value="${esc(config.rarities[t].label)}" maxlength="24" required></label><label>Probabilidad (%)<input name="${t}-weight" type="number" min="0" max="100" step="0.01" value="${config.rarities[t].weight}" required></label><small>${cards.filter(c=>c.active&&c.rareza===t).length} cartas activas</small></fieldset>`).join('')}</div>
    <p id="gacha-weight-total" role="status"></p><div class="gacha-bonus-settings"><label>Mínimo en productos (CLP)<input name="minimum" type="number" min="2000" step="1" value="${config.minimum_clp}" required></label><label>Sobres por pedido<select name="pulls"><option value="2" ${config.pulls_per_order===2?'selected':''}>2 sobres</option><option value="3" ${config.pulls_per_order===3?'selected':''}>3 sobres</option></select></label></div><label class="admin-check"><input name="test" type="checkbox" ${config.allow_test_orders?'checked':''}>Permitir canjes de pedidos Sandbox para pruebas</label><p class="gacha-admin-note">Desactiva Sandbox antes de abrir la promoción al público. Los pedidos ya canjeados conservan su cantidad original de sobres.</p><button type="submit">Guardar posibilidades ♡</button></form>
    <div class="gacha-admin-heading"><h3>Catálogo · ${cards.length} cartas</h3><p>Arrastra una carta o usa las flechas para ordenar el álbum. El orden no cambia el azar.</p></div><div id="gacha-card-list" class="gacha-admin-grid"></div>`;
    records.querySelector('#gacha-add').onclick=()=>edit(null);
    const form=records.querySelector('#gacha-settings-form');
    const total=()=>{const sum=tiers.reduce((n,t)=>n+Number(form.elements[`${t}-weight`].value),0);form.querySelector('#gacha-weight-total').textContent=`Total: ${Math.round(sum*100)/100}% · debe ser 100%`;};
    form.addEventListener('input',total);total();
    form.onsubmit=async e=>{
      e.preventDefault();const button=e.submitter;if(button.disabled)return;button.disabled=true;
      try{
        const rarities=Object.fromEntries(tiers.map(t=>[t,{label:form.elements[`${t}-label`].value.trim(),weight:Number(form.elements[`${t}-weight`].value)}]));
        if(Math.abs(tiers.reduce((n,t)=>n+rarities[t].weight,0)-100)>0.000001)throw new Error('Las probabilidades deben sumar 100%.');
        if(tiers.some(t=>rarities[t].weight>0&&!cards.some(c=>c.active&&c.rareza===t)))throw new Error('Cada categoría con probabilidad mayor a cero necesita al menos una carta activa.');
        if(form.elements.test.checked&&!config.allow_test_orders){if(!await ui.confirm({tone:'warning',title:'¿Activar canjes de prueba?',message:'Los pedidos pagados en Sandbox también podrán obtener sobres. Desactiva esta opción antes de la promoción pública.',confirmText:'Activar para pruebas'}))return;}
        await query(client.from('gacha_settings').update({rarities,minimum_clp:Number(form.elements.minimum.value),pulls_per_order:Number(form.elements.pulls.value),allow_test_orders:form.elements.test.checked}).eq('id',true));
        ui.toast({tone:'success',title:'Posibilidades guardadas',message:'Los próximos sobres usarán esta configuración.'});await load();
      }catch(error){fail(error);}finally{button.disabled=false;}
    };
    const list=records.querySelector('#gacha-card-list');
    cards.forEach((card,index)=>{
      const item=document.createElement('article');item.className='gacha-admin-card';item.draggable=true;
      item.innerHTML=`<img src="${esc(card.imagen.startsWith('images/')?'../'+card.imagen:card.imagen)}" alt="${esc(card.integrante)}" loading="lazy"><div><small>${esc(config.rarities[card.rareza].label)} · ${card.active?'Activa':'Oculta'}</small><h4>${esc(card.integrante)}</h4><p>${esc(card.frase)}</p><div class="gacha-card-controls"><button type="button" data-edit>Editar</button><button type="button" data-up aria-label="Mover ${esc(card.integrante)} antes" ${index===0?'disabled':''}>←</button><button type="button" data-down aria-label="Mover ${esc(card.integrante)} después" ${index===cards.length-1?'disabled':''}>→</button><button type="button" data-delete aria-label="Eliminar carta de ${esc(card.integrante)}">×</button></div></div>`;
      item.querySelector('[data-edit]').onclick=()=>edit(card);
      item.querySelector('[data-up]').onclick=()=>move(index,index-1);
      item.querySelector('[data-down]').onclick=()=>move(index,index+1);
      item.querySelector('[data-delete]').onclick=async()=>{
        if(!await ui.confirm({tone:'danger',title:'¿Quitar esta photocard?',message:'Dejará de salir en nuevos sobres. Las cartas ya obtenidas por tus fans se conservan.',image:{src:item.querySelector('img').src,alt:card.integrante,caption:config.rarities[card.rareza].label},confirmText:'Quitar carta'}))return;
        try{await query(client.from('gacha_cards').delete().eq('serial',card.serial));await load();ui.toast({tone:'success',title:'Carta eliminada',message:'Se retiró del catálogo de nuevos sobres.'});}catch(error){fail(error);}
      };
      item.addEventListener('dragstart',e=>{if(e.target instanceof HTMLImageElement){e.preventDefault();return;}dragging=index;e.dataTransfer.setData('text/plain',card.serial);item.classList.add('is-dragging');});
      item.addEventListener('dragend',()=>{dragging=null;item.classList.remove('is-dragging');});
      item.addEventListener('dragover',e=>{if(dragging!==null)e.preventDefault();});
      item.addEventListener('drop',e=>{e.preventDefault();if(dragging!==null)move(dragging,index);});
      list.append(item);
    });
  }
  let moving=false;
  async function move(from,to){
    if(moving||to<0||to>=cards.length||from===to)return;moving=true;
    const ordered=[...cards];ordered.splice(to,0,ordered.splice(from,1)[0]);
    try{await query(client.rpc('reorder_gacha_cards',{p_serials:ordered.map(c=>c.serial)}));await load();}
    catch(error){fail(error);}finally{moving=false;}
  }
  function edit(card){
    const photo=card?.imagen || '';
    editor.innerHTML=`<p class="admin-card-eyebrow">${card?'EDITAR RECUERDO':'NUEVA PHOTOCARD'} ♡</p><h2>${card?'Cuida cada detalle':'Una nueva estrella'}</h2><form id="gacha-card-form" class="gacha-card-form"><div class="gacha-upload-zone" tabindex="0"><img id="gacha-preview" alt="Vista previa de la photocard" ${photo?`src="${esc(photo.startsWith('images/')?'../'+photo:photo)}"`:'hidden'}><label>Arrastra una imagen aquí o selecciónala<input name="file" type="file" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG o WebP · máximo 8 MB</small><p id="gacha-upload-status" role="status"></p><button type="button" id="gacha-remove-image">Quitar imagen ×</button></div><input name="imagen" type="hidden" value="${esc(photo)}"><label>Integrante / nombre de carta<input name="integrante" value="${esc(card?.integrante)}" maxlength="60" required></label><label>Categoría<select name="rareza">${tiers.map(t=>`<option value="${t}" ${card?.rareza===t?'selected':''}>${esc(config.rarities[t].label)}</option>`).join('')}</select></label><label>Frase<textarea name="frase" maxlength="160">${esc(card?.frase)}</textarea></label><div class="gacha-bonus-settings"><label>Encuadre horizontal (%)<input name="x" type="number" min="0" max="100" value="${parseFloat(card?.crop || '50%')}" required></label><label>Encuadre vertical (%)<input name="y" type="number" min="0" max="100" value="${parseFloat(card?.crop?.split(' ')[1] || '25%')}" required></label><label>Zoom<input name="zoom" type="number" min="1" max="2" step="0.01" value="${card?.zoom || 1}" required></label></div><label class="admin-check"><input name="active" type="checkbox" ${!card||card.active?'checked':''}>Disponible en nuevos sobres</label><div class="gacha-card-controls"><button type="submit">Guardar carta ♡</button><button type="button" id="gacha-editor-cancel">Cerrar</button></div></form>`;
    editor.scrollIntoView({behavior:'smooth',block:'start'});
    const form=editor.querySelector('form'),preview=form.querySelector('#gacha-preview'),zone=form.querySelector('.gacha-upload-zone'),submit=form.querySelector('[type=submit]');
    let uploading=false,revision=0;
    const refresh=()=>{preview.style.objectPosition=`${form.elements.x.value}% ${form.elements.y.value}%`;preview.style.transform=`scale(${form.elements.zoom.value})`;};
    form.addEventListener('input',refresh);refresh();
    async function upload(file){
      if(!file||uploading)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8388608){fail(new Error('Usa una imagen JPG, PNG o WebP de hasta 8 MB.'));return;}
      uploading=true;submit.disabled=true;const generation=++revision;
      form.querySelector('#gacha-upload-status').textContent='Subiendo imagen…';
      try{
        const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type],path=`cards/${crypto.randomUUID()}.${ext}`;
        await query(client.storage.from('gimae-gacha').upload(path,file,{contentType:file.type,upsert:false}));
        const {data}=client.storage.from('gimae-gacha').getPublicUrl(path);
        if(generation!==revision||!form.isConnected)return;
        form.elements.imagen.value=data.publicUrl;preview.src=data.publicUrl;preview.hidden=false;
        form.querySelector('#gacha-upload-status').textContent='Imagen lista. Guarda la carta para publicarla.';
      }catch(error){fail(error);}finally{uploading=false;submit.disabled=false;}
    }
    form.elements.file.onchange=()=>upload(form.elements.file.files[0]);
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('is-over');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('is-over'));
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('is-over');upload(e.dataTransfer.files[0]);});
    form.querySelector('#gacha-remove-image').onclick=async()=>{
      if(uploading||!form.elements.imagen.value)return;
      if(await ui.confirm({tone:'danger',title:'¿Quitar esta imagen?',message:'Elige una nueva imagen antes de guardar la carta.',image:{src:preview.src,alt:'Imagen que se va a quitar'},confirmText:'Quitar imagen'})){form.elements.imagen.value='';preview.hidden=true;preview.removeAttribute('src');form.elements.file.value='';}
    };
    form.querySelector('#gacha-editor-cancel').onclick=()=>{revision++;editor.replaceChildren();};
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
