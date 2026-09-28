const $=s=>document.querySelector(s), settings=window.GIMAE_NEON||{};
const status=$('#status'), login=$('#login-section'), workspace=$('#workspace'), editor=$('#editor'), records=$('#records');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const word=v=>String(v??'').trim();
const field=(name,label,value='',type='text',extra='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const area=(name,label,value='')=>`<label>${esc(label)}<textarea name="${name}">${esc(value)}</textarea></label>`;
const select=(name,label,values,current)=>`<label>${label}<select name="${name}">${values.map(([v,l])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
const checked=(name,label,value)=>`<label class="admin-check"><input type="checkbox" name="${name}" ${value?'checked':''}>${esc(label)}</label>`;
const notice=message=>status.textContent=message;
let client,profile,tab='posts',items=[],members=[];

async function query(promise){const result=await promise;if(result.error)throw result.error;return result.data||[]}
async function init(){
  if(!settings.databaseUrl){notice('Neon aún no está configurado. Falta la URL HTTPS pública de la Data API/Auth.');return}
  try{
    const {createClient}=await import('https://esm.sh/@neondatabase/neon-js@0.7.0-beta');
    client=createClient(settings.databaseUrl,{auth:{allowAnonymous:true}});
    $('#login-form').addEventListener('submit',signIn);
    $('#logout').addEventListener('click',async()=>{await client.auth.signOut();profile=null;showLogin()});
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.tab)));
    await session();
  }catch(error){notice(`No se pudo iniciar el panel: ${error.message}`)}
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
  try{const fd=new FormData(event.currentTarget);const {error}=await client.auth.signIn.email({email:word(fd.get('email')),password:fd.get('password')});if(error)throw error;await session()}
  catch(error){$('#login-error').textContent=error.message||'No fue posible ingresar';notice('Revisa el correo y la contraseña.')}
  finally{button.disabled=false}
}
const titles={posts:'Entradas del blog',products:'Productos de merch',members:'Integrantes',events:'Eventos'};
async function openTab(next){if(next!=='posts'&&profile.role!=='admin')return;tab=next;notice(`Cargando ${titles[tab].toLowerCase()}…`);
  try{
    document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.tab===tab)));
    [items,members]=await Promise.all([query(client.from(tab).select('*').order(tab==='events'?'starts_at':tab==='posts'?'updated_at':'display_order',{ascending:tab!=='posts'})),query(client.from('members').select('*').order('display_order'))]);
    records.replaceChildren();const heading=document.createElement('h2');heading.textContent=titles[tab];records.append(heading);
    const create=document.createElement('button');create.type='button';create.textContent='＋ Crear';create.addEventListener('click',()=>form(null));records.append(create);
    const list=document.createElement('div');list.className='admin-list';
    for(const row of items){const button=document.createElement('button');button.type='button';button.textContent=tab==='posts'?`${row.title} · ${row.status} · ${row.visibility}`:tab==='products'?`${row.name} · $${row.price_clp.toLocaleString('es-CL')}`:row.name||row.title;button.addEventListener('click',()=>form(row));list.append(button)}
    if(!items.length){const empty=document.createElement('p');empty.textContent='Todavía no hay registros. Puedes crear el primero.';list.append(empty)}records.append(list);
    editor.replaceChildren();notice(`${items.length} registros. ${profile.role==='admin'?'Rol administrador.':'Solo puedes editar tus propias entradas.'}`);
  }catch(error){notice(`No se pudo cargar: ${error.message}`)}
}
function form(row){const title=row?'Editar':'Crear';let fields='';
  if(tab==='products') fields=field('id','Código (único)',row?.id||'','text',row?'readonly':'required pattern="[a-zA-Z0-9_-]+"')+field('name','Nombre',row?.name,'text','required')+
    area('description','Descripción',row?.description)+field('note','Frase breve',row?.note)+`<div class="admin-row">${field('price_clp','Precio CLP',row?.price_clp??0,'number','min="0" required')}${field('stock','Stock general',row?.stock??0,'number','min="0" required')}${field('display_order','Orden',row?.display_order??0,'number','required')}</div>`+
    checked('stock_confirmed','Inventario general confirmado',row?.stock_confirmed)+checked('active','Visible en la web',row?.active??true)+field('variant_label','Nombre de la variante',row?.variant_label)+field('variant_source','Origen de variantes (members si aplica)',row?.variant_source)+
    (row?'<fieldset><legend>Imágenes del producto</legend><label>Subir varias imágenes (PNG, JPG o WebP, hasta 8 MB cada una)<input type="file" name="images" accept="image/png,image/jpeg,image/webp" multiple></label><div id="image-list" class="admin-preview"></div></fieldset><fieldset><legend>Variantes y tallas</legend><div id="variant-list"></div><div class="admin-row">'+field('new_variant','Nueva variante (por ejemplo, M)')+field('new_price','Precio CLP',row.price_clp,'number','min="0"')+'</div><button id="add-variant" type="button">Añadir variante</button></fieldset>':'<p class="admin-hint">Guarda el producto para agregar imágenes y variantes.</p>');
  if(tab==='posts')fields=field('title','Título',row?.title,'text','required')+field('slug','Slug URL',row?.slug,'text','required pattern="[a-z0-9]+(-[a-z0-9]+)*"')+area('content','Contenido (texto sencillo)',row?.content)+
    `<div class="admin-row">${select('status','Estado',[['borrador','Borrador'],['publicado','Publicado']],row?.status||'borrador')}${select('visibility','Visibilidad',[['publico','Público'],['exclusivo','Exclusivo']],row?.visibility||'publico')}</div>`+
    (row?'<label>Imagen de portada (PNG, JPG o WebP, hasta 8 MB)<input type="file" name="cover" accept="image/png,image/jpeg,image/webp"></label><p class="admin-hint">La imagen de un post exclusivo se entrega solo con permiso.</p>':'<p class="admin-hint">Guarda el borrador antes de subir su portada.</p>');
  if(tab==='members')fields=field('id','Código',row?.id,'text',row?'readonly':'required')+field('name','Nombre',row?.name,'text','required')+area('biography','Biografía',row?.biography)+field('handle','Usuario Instagram',row?.handle)+field('photo_url','URL de retrato',row?.photo_url)+`<div class="admin-row">${field('accent','Color hexadecimal',row?.accent||'#e84694','text','pattern="#[0-9A-Fa-f]{6}" required')}${field('color','Clase de color',row?.color||'pink')}${field('color_label','Nombre del color',row?.color_label)}${field('display_order','Orden',row?.display_order??0,'number')}</div>`+field('instagram','URL Instagram',row?.socials?.instagram||'','url');
  if(tab==='events') fields=field('title','Título',row?.title,'text','required')+area('description','Descripción',row?.description)+field('venue','Lugar',row?.venue)+`<div class="admin-row">${field('starts_at','Inicio',row?.starts_at?.slice(0,16),'datetime-local','required')}${field('ends_at','Fin',row?.ends_at?.slice(0,16),'datetime-local')}</div>`+field('url','Enlace',row?.url,'url')+checked('active','Evento visible en la web',row?.active);
  editor.innerHTML=`<h2>${title} ${esc(titles[tab].toLowerCase())}</h2><form id="record-form">${fields}<div class="admin-actions"><button type="submit">Guardar</button>${row?'<button type="button" id="delete-record" class="danger">Eliminar</button>':''}</div></form>`;
  const formNode=$('#record-form');formNode.addEventListener('submit',event=>save(event,row));
  $('#delete-record')?.addEventListener('click',()=>remove(row));
  if(tab==='products'&&row){renderImages(row.id);renderVariants(row.id);$('#add-variant').addEventListener('click',()=>addVariant(row.id))}
  formNode.querySelector('input,textarea,select')?.focus();
}
async function save(event,row){event.preventDefault();const f=event.currentTarget,fd=new FormData(f),button=f.querySelector('[type=submit]');button.disabled=true;notice('Guardando…');
  try{let data;
    if(tab==='products')data={id:word(fd.get('id')),name:word(fd.get('name')),description:word(fd.get('description')),note:word(fd.get('note')),price_clp:Number(fd.get('price_clp')),stock:Number(fd.get('stock')),stock_confirmed:fd.has('stock_confirmed'),active:fd.has('active'),display_order:Number(fd.get('display_order')),variant_label:word(fd.get('variant_label'))||null,variant_source:word(fd.get('variant_source'))||null,color:row?.color||'pink'};
    if(tab==='posts')data={title:word(fd.get('title')),slug:word(fd.get('slug')),content:word(fd.get('content')),status:fd.get('status'),visibility:fd.get('visibility'),published_at:fd.get('status')==='publicado'?(row?.published_at||new Date().toISOString()):null,...(!row?{author_id:profile.user_id}:{})};
    if(tab==='members')data={id:word(fd.get('id')),name:word(fd.get('name')),biography:word(fd.get('biography'))||null,handle:word(fd.get('handle')),photo_url:word(fd.get('photo_url'))||null,accent:word(fd.get('accent')),color:word(fd.get('color')),color_label:word(fd.get('color_label')),display_order:Number(fd.get('display_order')),socials:{instagram:word(fd.get('instagram'))}};
    if(tab==='events')data={title:word(fd.get('title')),description:word(fd.get('description')),venue:word(fd.get('venue'))||null,starts_at:new Date(fd.get('starts_at')).toISOString(),ends_at:fd.get('ends_at')?new Date(fd.get('ends_at')).toISOString():null,url:word(fd.get('url'))||null,active:fd.has('active')};
    const result=row?await query(client.from(tab).update(data).eq('id',row.id).select('*')):await query(client.from(tab).insert(data).select('*'));
    const saved=result[0];if(!saved)throw new Error('No se guardó el registro. Verifica tus permisos.');
    if(tab==='products'){for(const file of fd.getAll('images'))if(file?.size){const url=await upload(file,'product',saved.id);await query(client.from('product_images').insert({product_id:saved.id,url,display_order:0}))}}
    if(tab==='posts'&&fd.get('cover')?.size){const url=await upload(fd.get('cover'),'post',saved.id);await query(client.from('posts').update({cover_url:url}).eq('id',saved.id))}
    await openTab(tab);notice('Cambios guardados.');
  }catch(error){notice(`No se pudo guardar: ${error.message}`)}finally{button.disabled=false}
}
async function upload(file,kind,id){if(!settings.mediaUrl)throw new Error('Falta configurar la URL de la función de imágenes.');
  const token=await client.auth.token();if(token.error||!token.data?.token)throw new Error('La sesión expiró. Vuelve a iniciar sesión.');
  const data=new FormData();data.append('kind',kind);data.append('id',id);data.append('file',file);
  const response=await fetch(settings.mediaUrl,{method:'POST',headers:{Authorization:`Bearer ${token.data.token}`},body:data});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo subir la imagen');return result.url;
}
async function renderImages(id){try{const images=await query(client.from('product_images').select('*').eq('product_id',id).order('display_order'));const target=$('#image-list');target.replaceChildren();for(const img of images){const wrap=document.createElement('div'),preview=document.createElement('img'),button=document.createElement('button');preview.src=img.url;preview.alt=img.alt||'Imagen de producto';button.type='button';button.textContent='Quitar imagen';button.addEventListener('click',async()=>{try{await query(client.from('product_images').delete().eq('id',img.id));wrap.remove()}catch(error){notice(error.message)}});wrap.append(preview,button);target.append(wrap)}}catch(error){notice(error.message)}}
async function renderVariants(id){try{const variants=await query(client.from('product_variants').select('*').eq('product_id',id).order('display_order'));const target=$('#variant-list');target.replaceChildren();for(const v of variants){const line=document.createElement('div');line.className='admin-row';const label=document.createElement('strong');label.textContent=v.label;const price=document.createElement('input');price.type='number';price.min='0';price.value=v.price_clp;price.setAttribute('aria-label',`Precio CLP de ${v.label}`);const stock=document.createElement('input');stock.type='number';stock.min='0';stock.value=v.stock;stock.setAttribute('aria-label',`Stock de ${v.label}`);const confirm=document.createElement('input');confirm.type='checkbox';confirm.checked=v.stock_confirmed;confirm.setAttribute('aria-label',`Stock confirmado de ${v.label}`);const save=document.createElement('button');save.textContent='Guardar variante';save.type='button';save.addEventListener('click',async()=>{try{await query(client.from('product_variants').update({price_clp:Number(price.value),stock:Number(stock.value),stock_confirmed:confirm.checked}).eq('id',v.id));notice('Variante guardada.')}catch(error){notice(error.message)}});line.append(label,price,stock,confirm,save);target.append(line)}}catch(error){notice(error.message)}}
async function addVariant(id){const f=$('#record-form'),label=word(new FormData(f).get('new_variant'));if(!label)return notice('Escribe el nombre de la variante.');try{await query(client.from('product_variants').insert({id:`${id}-${crypto.randomUUID()}`,product_id:id,label,price_clp:Number(new FormData(f).get('new_price'))||0}));await renderVariants(id);notice('Variante creada con inventario sin confirmar.')}catch(error){notice(error.message)}}
async function remove(row){if(!confirm(`¿Eliminar ${row.title||row.name}? Esta acción no se puede deshacer.`))return;
  try{await query(client.from(tab).delete().eq('id',row.id));await openTab(tab);notice('Registro eliminado.')}catch(error){notice(`No se pudo eliminar: ${error.message}`)}
}
init();
