const $=s=>document.querySelector(s), settings=window.GIMAE_SUPABASE||{};
const status=$('#status'), login=$('#login-section'), workspace=$('#workspace'), editor=$('#editor'), records=$('#records');
const ui=window.GIMAE_UI;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const word=v=>String(v??'').trim();
const field=(name,label,value='',type='text',extra='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const area=(name,label,value='')=>`<label>${esc(label)}<textarea name="${name}">${esc(value)}</textarea></label>`;
const select=(name,label,values,current)=>`<label>${label}<select name="${name}">${values.map(([v,l])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
const checked=(name,label,value)=>`<label class="admin-check"><input type="checkbox" name="${name}" ${value?'checked':''}>${esc(label)}</label>`;
const notice=message=>status.textContent=message;
const toast=(tone,title,message)=>ui?.toast({tone,title,message});
const ask=options=>ui?.confirm(options)??Promise.resolve(false);
let client,profile,tab='posts',items=[],members=[];

async function query(promise){const result=await promise;if(result.error)throw result.error;return result.data||[]}
async function init(){
  if(!settings.url||!settings.publishableKey){notice('Supabase aún no está configurado. Falta la publishable key pública.');return}
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    client=createClient(settings.url,settings.publishableKey);
    $('#login-form').addEventListener('submit',signIn);
    $('#password-form').addEventListener('submit',changePassword);
    $('#logout').addEventListener('click',async()=>{await client.auth.signOut();profile=null;showLogin()});
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.tab)));
    await session();
  }catch(error){notice(`No se pudo iniciar el panel: ${error.message}`);toast('error','No se pudo iniciar el panel',error.message)}
}
function showLogin(){workspace.hidden=true;login.hidden=false;$('#logout').hidden=true;notice('Ingresa con tu cuenta del equipo.');}
async function session(){
  const {data,error}=await client.auth.getSession();if(error||!data?.session){showLogin();return}
  const id=data.user?.id||data.session.user?.id;
  profile=(await query(client.from('profiles').select('*').eq('user_id',id)))[0];
  if(!profile){await client.auth.signOut();showLogin();$('#login-error').textContent='Esta cuenta no tiene rol asignado. Consulta con la administradora.';return}
  login.hidden=true;workspace.hidden=false;$('#logout').hidden=false;
  document.querySelectorAll('[data-admin]').forEach(node=>node.hidden=profile.role!=='admin');
  await openTab('posts');
}
async function signIn(event){event.preventDefault();const button=event.submitter;button.disabled=true;$('#login-error').textContent='';notice('Verificando acceso…');
  try{const fd=new FormData(event.currentTarget);const {error}=await client.auth.signInWithPassword({email:word(fd.get('email')),password:fd.get('password')});if(error)throw error;await session()}
  catch(error){$('#login-error').textContent=error.message||'No fue posible ingresar';notice('Revisa el correo y la contraseña.');toast('error','No pudimos iniciar sesión',error.message||'Revisa el correo y la contraseña.')}
  finally{button.disabled=false}
}
async function changePassword(event){
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');
  const data=new FormData(form),password=data.get('password');
  $('#password-error').textContent='';
  if(password!==data.get('confirmation')){$('#password-error').textContent='Las contraseñas no coinciden.';toast('warning','Revisa las contraseñas','Las dos contraseñas deben coincidir.');return}
  const original=button.textContent;button.disabled=true;button.textContent='Guardando…';
  try{const {error}=await client.auth.updateUser({password});if(error)throw error;form.reset();notice('Contraseña guardada.');toast('success','Contraseña actualizada','Tu nueva contraseña ya está activa.')}
  catch(error){$('#password-error').textContent=error.message||'No se pudo guardar la contraseña.';toast('error','No se pudo cambiar la contraseña',error.message||'Inténtalo nuevamente.')}
  finally{button.disabled=false;button.textContent=original}
}
const titles={posts:'Entradas del blog',products:'Productos de merch',members:'Integrantes',events:'Eventos'};
const singular={posts:'entrada',products:'producto',members:'integrante',events:'evento'};
async function openTab(next){if(next!=='posts'&&profile.role!=='admin')return;tab=next;notice(`Cargando ${titles[tab].toLowerCase()}…`);
  try{
    document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.tab===tab)));
    let listQuery=client.from(tab).select('*');
    if(tab==='posts'&&profile.role==='integrante')listQuery=listQuery.eq('author_id',profile.user_id);
    [items,members]=await Promise.all([query(listQuery.order(tab==='events'?'starts_at':tab==='posts'?'updated_at':'display_order',{ascending:tab!=='posts'})),query(client.from('members').select('*').order('display_order'))]);
    records.replaceChildren();const heading=document.createElement('h2');heading.textContent=titles[tab];records.append(heading);
    const create=document.createElement('button');create.type='button';create.textContent='＋ Crear';create.addEventListener('click',()=>form(null));records.append(create);
    const list=document.createElement('div');list.className='admin-list';
    for(const row of items){const button=document.createElement('button');button.type='button';button.textContent=tab==='posts'?`${row.title} · ${row.status} · ${row.visibility}`:tab==='products'?`${row.name} · $${row.price_clp.toLocaleString('es-CL')}`:row.name||row.title;button.addEventListener('click',()=>form(row));list.append(button)}
    if(!items.length){const empty=document.createElement('p');empty.textContent='Todavía no hay registros. Puedes crear el primero.';list.append(empty)}records.append(list);
    editor.replaceChildren();notice(`${items.length} registros. ${profile.role==='admin'?'Rol administrador.':'Solo puedes editar tus propias entradas.'}`);
  }catch(error){notice(`No se pudo cargar: ${error.message}`);toast('error',`No se pudieron cargar ${titles[tab].toLowerCase()}`,error.message)}
}
function form(row){const title=row?'Editar':'Crear';let fields='';
  if(tab==='products') fields=field('id','Código (único)',row?.id||'','text',row?'readonly':'required pattern="[a-zA-Z0-9_-]+"')+field('name','Nombre',row?.name,'text','required')+
    area('description','Descripción',row?.description)+field('note','Frase breve',row?.note)+`<div class="admin-row">${field('price_clp','Precio CLP',row?.price_clp??0,'number','min="0" required')}${field('stock','Stock general',row?.stock??0,'number','min="0" required')}${field('display_order','Orden',row?.display_order??0,'number','required')}</div>`+
    checked('stock_confirmed','Inventario general confirmado',row?.stock_confirmed)+checked('active','Visible en la web',row?.active??true)+field('variant_label','Nombre de la variante',row?.variant_label)+field('variant_source','Origen de variantes (members si aplica)',row?.variant_source)+
    (row?'<fieldset><legend>Imágenes del producto</legend><label>Subir varias imágenes (PNG, JPG o WebP, hasta 8 MB cada una)<input type="file" name="images" accept="image/png,image/jpeg,image/webp" multiple></label><div id="image-list" class="admin-preview"></div></fieldset><fieldset><legend>Variantes y tallas</legend><div id="variant-list"></div><div class="admin-row">'+field('new_variant','Nueva variante (por ejemplo, M)')+field('new_price','Precio CLP',row.price_clp,'number','min="0"')+'</div><button id="add-variant" type="button">Añadir variante</button></fieldset>':'<p class="admin-hint">Guarda el producto para agregar imágenes y variantes.</p>');
  if(tab==='posts')fields=field('title','Título',row?.title,'text','required')+field('slug','Slug URL',row?.slug,'text','required pattern="[a-z0-9]+(-[a-z0-9]+)*"')+area('content','Contenido (texto sencillo)',row?.content)+
    `<div class="admin-row">${select('status','Estado',[['borrador','Borrador'],['publicado','Publicado']],row?.status||'borrador')}${select('visibility','Visibilidad',[['publico','Público'],['exclusivo','Exclusivo']],row?.visibility||'publico')}</div>`+
    (row?'<label>Imagen de portada (PNG, JPG o WebP, hasta 8 MB)<input type="file" name="cover" accept="image/png,image/jpeg,image/webp"></label><label>Otras imágenes del post<input type="file" name="post_images" accept="image/png,image/jpeg,image/webp" multiple></label><div id="post-image-list" class="admin-preview"></div><p class="admin-hint">Las imágenes de un post exclusivo se entregan solo con permiso.</p>':'<p class="admin-hint">Guarda el borrador antes de subir sus imágenes.</p>');
  if(tab==='members')fields=field('id','Código',row?.id,'text',row?'readonly':'required')+field('name','Nombre',row?.name,'text','required')+area('biography','Biografía',row?.biography)+field('handle','Usuario Instagram',row?.handle)+field('photo_url','URL de retrato',row?.photo_url)+`<div class="admin-row">${field('accent','Color hexadecimal',row?.accent||'#e84694','text','pattern="#[0-9A-Fa-f]{6}" required')}${field('color','Clase de color',row?.color||'pink')}${field('color_label','Nombre del color',row?.color_label)}${field('display_order','Orden',row?.display_order??0,'number')}</div>`+field('instagram','URL Instagram',row?.socials?.instagram||'','url');
  if(tab==='events') fields=field('title','Título',row?.title,'text','required')+area('description','Descripción',row?.description)+field('venue','Lugar',row?.venue)+`<div class="admin-row">${field('starts_at','Inicio',row?.starts_at?.slice(0,16),'datetime-local','required')}${field('ends_at','Fin',row?.ends_at?.slice(0,16),'datetime-local')}</div>`+field('url','Enlace',row?.url,'url')+checked('active','Evento visible en la web',row?.active);
  editor.innerHTML=`<h2>${title} ${esc(titles[tab].toLowerCase())}</h2><form id="record-form">${fields}<div class="admin-actions"><button type="submit">Guardar</button>${row?'<button type="button" id="delete-record" class="danger">Eliminar</button>':''}</div></form>`;
  const formNode=$('#record-form');formNode.addEventListener('submit',event=>save(event,row));
  $('#delete-record')?.addEventListener('click',event=>remove(row,event.currentTarget));
  if(tab==='products'&&row){renderImages(row.id);renderVariants(row.id);$('#add-variant').addEventListener('click',()=>addVariant(row.id))}
  if(tab==='posts'&&row){
    renderPostImages(row.id);
    if(row.cover_url)resolveBlogImage(row.cover_url).then(url=>{
      const preview=document.createElement('img');preview.className='admin-cover';preview.src=url;preview.alt=`Portada actual de ${row.title}`;
      $('#record-form [name=cover]').parentElement.after(preview);
    }).catch(error=>{notice(`No se pudo cargar la portada: ${error.message}`);toast('error','No se pudo cargar la portada',error.message)});
  }
  for(const input of formNode.querySelectorAll('input[type=file]')){
    const preview=document.createElement('div');preview.className='admin-preview';input.parentElement.after(preview);
    input.addEventListener('change',()=>{preview.replaceChildren();for(const file of input.files){const image=document.createElement('img');image.src=URL.createObjectURL(file);image.alt=`Vista previa de ${file.name}`;image.onload=()=>URL.revokeObjectURL(image.src);preview.append(image)}});
  }
  formNode.querySelector('input,textarea,select')?.focus();
}
async function save(event,row){event.preventDefault();const f=event.currentTarget,fd=new FormData(f),button=f.querySelector('[type=submit]');const original=button.textContent;button.disabled=true;button.textContent=row?'Guardando…':'Creando…';notice('Guardando…');
  try{let data;
    if(tab==='products')data={id:word(fd.get('id')),name:word(fd.get('name')),description:word(fd.get('description')),note:word(fd.get('note')),price_clp:Number(fd.get('price_clp')),stock:Number(fd.get('stock')),stock_confirmed:fd.has('stock_confirmed'),active:fd.has('active'),display_order:Number(fd.get('display_order')),variant_label:word(fd.get('variant_label'))||null,variant_source:word(fd.get('variant_source'))||null,color:row?.color||'pink'};
    if(tab==='posts')data={title:word(fd.get('title')),slug:word(fd.get('slug')),content:word(fd.get('content')),status:fd.get('status'),visibility:fd.get('visibility'),published_at:fd.get('status')==='publicado'?(row?.published_at||new Date().toISOString()):null,...(!row?{author_id:profile.user_id}:{})};
    if(tab==='members')data={id:word(fd.get('id')),name:word(fd.get('name')),biography:word(fd.get('biography'))||null,handle:word(fd.get('handle')),photo_url:word(fd.get('photo_url'))||null,accent:word(fd.get('accent')),color:word(fd.get('color')),color_label:word(fd.get('color_label')),display_order:Number(fd.get('display_order')),socials:{instagram:word(fd.get('instagram'))}};
    if(tab==='events')data={title:word(fd.get('title')),description:word(fd.get('description')),venue:word(fd.get('venue'))||null,starts_at:new Date(fd.get('starts_at')).toISOString(),ends_at:fd.get('ends_at')?new Date(fd.get('ends_at')).toISOString():null,url:word(fd.get('url'))||null,active:fd.has('active')};
    const result=row?await query(client.from(tab).update(data).eq('id',row.id).select('*')):await query(client.from(tab).insert(data).select('*'));
    const saved=result[0];if(!saved)throw new Error('No se guardó el registro. Verifica tus permisos.');
    if(tab==='products'){for(const file of fd.getAll('images'))if(file?.size){const url=await upload(file,'product',saved.id);await query(client.from('product_images').insert({product_id:saved.id,url,display_order:0}))}}
    if(tab==='posts'&&fd.get('cover')?.size){const url=await upload(fd.get('cover'),'post',saved.id);await query(client.from('posts').update({cover_url:url}).eq('id',saved.id));await removeStorage(row?.cover_url)}
    if(tab==='posts'){for(const file of fd.getAll('post_images'))if(file?.size){const url=await upload(file,'post',saved.id);await query(client.from('post_images').insert({post_id:saved.id,url,alt:file.name}))}}
    const action=row?'actualizó':'creó';const label=saved.title||saved.name||saved.id||singular[tab];
    await openTab(tab);notice('Cambios guardados.');toast('success',`${titles[tab].replace(/^./,c=>c.toUpperCase())} guardado${tab==='posts'||tab==='members'?'a':''}`,`Se ${action} “${label}” correctamente.`);
  }catch(error){notice(`No se pudo guardar: ${error.message}`);toast('error','No se pudieron guardar los cambios',error.message)}finally{if(button.isConnected){button.disabled=false;button.textContent=original}}
}
async function upload(file,kind,id){
  if(file.size>8388608||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Usa PNG, JPG o WebP de hasta 8 MB.');
  const bucket=kind==='product'?'gimae-products':'gimae-blog';
  const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
  const path=kind==='product'?`products/${id}/${crypto.randomUUID()}.${extension}`:`posts/${id}/${crypto.randomUUID()}.${extension}`;
  const {error}=await client.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw error;
  return kind==='product'?client.storage.from(bucket).getPublicUrl(path).data.publicUrl:`storage:${bucket}/${path}`;
}
async function resolveBlogImage(url){
  if(!url?.startsWith('storage:gimae-blog/'))return url;
  const {data,error}=await client.storage.from('gimae-blog').createSignedUrl(url.slice('storage:gimae-blog/'.length),3600);
  if(error)throw error;return data.signedUrl;
}
async function removeStorage(url){
  if(!url)return;
  const productPrefix=`${settings.url}/storage/v1/object/public/gimae-products/`;
  const bucket=url.startsWith(productPrefix)?'gimae-products':url.startsWith('storage:gimae-blog/')?'gimae-blog':null;
  if(!bucket)return;
  const path=bucket==='gimae-products'?decodeURIComponent(url.slice(productPrefix.length)):url.slice('storage:gimae-blog/'.length);
  if(!path.startsWith(bucket==='gimae-products'?'products/':'posts/'))return;
  const {error}=await client.storage.from(bucket).remove([path]);if(error)throw error;
}
async function renderImages(id){
  try{
    const images=await query(client.from('product_images').select('*').eq('product_id',id).order('display_order'));const target=$('#image-list');target.replaceChildren();
    for(const img of images){
      const wrap=document.createElement('div'),preview=document.createElement('img'),button=document.createElement('button');preview.src=img.url;preview.alt=img.alt||'Imagen de producto';button.type='button';button.textContent='Quitar imagen';
      button.addEventListener('click',async()=>{
        const ok=await ask({tone:'danger',title:'Quitar imagen del producto',message:`Vas a eliminar “${img.alt||'esta imagen'}” de la galería del producto.`,detail:'El archivo también se eliminará del almacenamiento y esta acción no se puede deshacer.',confirmText:'Quitar imagen'});if(!ok)return;
        try{button.disabled=true;button.textContent='Quitando…';await removeStorage(img.url);await query(client.from('product_images').delete().eq('id',img.id));wrap.remove();toast('success','Imagen eliminada','La imagen ya no forma parte del producto.')}
        catch(error){button.disabled=false;button.textContent='Quitar imagen';notice(error.message);toast('error','No se pudo quitar la imagen',error.message)}
      });
      wrap.append(preview,button);target.append(wrap)
    }
  }catch(error){notice(error.message);toast('error','No se pudieron cargar las imágenes',error.message)}
}
async function renderPostImages(id){
  try{
    const images=await query(client.from('post_images').select('*').eq('post_id',id).order('display_order'));const target=$('#post-image-list');target.replaceChildren();
    for(const img of images){
      const wrap=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');label.textContent=img.alt||'Imagen del post';button.type='button';button.textContent='Quitar imagen';
      button.addEventListener('click',async()=>{
        const ok=await ask({tone:'danger',title:'Quitar recurso del post',message:`Vas a quitar “${img.alt||'este recurso'}” de la galería.`,detail:'El archivo también se eliminará del almacenamiento.',confirmText:'Quitar recurso'});if(!ok)return;
        try{button.disabled=true;button.textContent='Quitando…';await removeStorage(img.url);await query(client.from('post_images').delete().eq('id',img.id));wrap.remove();toast('success','Recurso eliminado','La galería del post se actualizó.')}
        catch(error){button.disabled=false;button.textContent='Quitar imagen';notice(error.message);toast('error','No se pudo quitar el recurso',error.message)}
      });
      if(img.url){const preview=document.createElement('img');preview.src=await resolveBlogImage(img.url);preview.alt=img.alt||'Imagen del post';wrap.append(preview)}wrap.append(label,button);target.append(wrap)
    }
  }catch(error){notice(error.message);toast('error','No se pudo cargar la galería',error.message)}
}
async function renderVariants(id){
  try{
    const variants=await query(client.from('product_variants').select('*').eq('product_id',id).order('display_order'));const target=$('#variant-list');target.replaceChildren();
    for(const v of variants){
      const line=document.createElement('div');line.className='admin-row';const label=document.createElement('strong');label.textContent=v.label;const price=document.createElement('input');price.type='number';price.min='0';price.value=v.price_clp;price.setAttribute('aria-label',`Precio CLP de ${v.label}`);const stock=document.createElement('input');stock.type='number';stock.min='0';stock.value=v.stock;stock.setAttribute('aria-label',`Stock de ${v.label}`);const confirmStock=document.createElement('input');confirmStock.type='checkbox';confirmStock.checked=v.stock_confirmed;confirmStock.setAttribute('aria-label',`Stock confirmado de ${v.label}`);const save=document.createElement('button');save.textContent='Guardar variante';save.type='button';
      save.addEventListener('click',async()=>{const original=save.textContent;save.disabled=true;save.textContent='Guardando…';try{await query(client.from('product_variants').update({price_clp:Number(price.value),stock:Number(stock.value),stock_confirmed:confirmStock.checked}).eq('id',v.id));notice('Variante guardada.');toast('success','Variante actualizada',`Se guardaron precio y stock de “${v.label}”.`)}catch(error){notice(error.message);toast('error','No se pudo guardar la variante',error.message)}finally{save.disabled=false;save.textContent=original}});
      line.append(label,price,stock,confirmStock,save);target.append(line)
    }
  }catch(error){notice(error.message);toast('error','No se pudieron cargar las variantes',error.message)}
}
async function addVariant(id){
  const f=$('#record-form'),label=word(new FormData(f).get('new_variant'));if(!label){notice('Escribe el nombre de la variante.');toast('warning','Falta el nombre de la variante','Escribe un nombre antes de añadirla.');return}
  try{await query(client.from('product_variants').insert({id:`${id}-${crypto.randomUUID()}`,product_id:id,label,price_clp:Number(new FormData(f).get('new_price'))||0}));await renderVariants(id);notice('Variante creada con inventario sin confirmar.');toast('success','Variante creada',`“${label}” ya forma parte del producto.`)}catch(error){notice(error.message);toast('error','No se pudo crear la variante',error.message)}
}
async function remove(row,button){
  const label=row.title||row.name||row.id||singular[tab];
  const extra=tab==='posts'?'También se eliminarán su portada y los archivos de su galería.':tab==='products'?'También se eliminarán las imágenes almacenadas del producto.':'Esta acción no se puede deshacer.';
  const ok=await ask({tone:'danger',title:`Eliminar ${singular[tab]}`,message:`Vas a eliminar “${label}”.`,detail:extra,confirmText:'Eliminar definitivamente'});if(!ok)return;
  const original=button?.textContent;if(button){button.disabled=true;button.textContent='Eliminando…'}
  try{
    if(tab==='posts'){
      const images=await query(client.from('post_images').select('url').eq('post_id',row.id));
      for(const image of images)await removeStorage(image.url);
      await removeStorage(row.cover_url);
    }
    if(tab==='products'){
      const images=await query(client.from('product_images').select('url').eq('product_id',row.id));
      for(const image of images)await removeStorage(image.url);
    }
    await query(client.from(tab).delete().eq('id',row.id));await openTab(tab);notice('Registro eliminado.');toast('success',`${singular[tab].replace(/^./,c=>c.toUpperCase())} eliminado${tab==='posts'||tab==='members'?'a':''}`,`“${label}” se eliminó correctamente.`)
  }catch(error){notice(`No se pudo eliminar: ${error.message}`);toast('error',`No se pudo eliminar ${singular[tab]}`,error.message);if(button?.isConnected){button.disabled=false;button.textContent=original}}
}
init();
