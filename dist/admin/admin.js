import {renderGacha} from './gacha-editor.js?v=20261008-ui02';
import {renderPayPalAttempts} from './paypal-attempts.js?v=20261001-attempts01';
import {renderWebpayAlerts} from './webpay-alerts.js?v=20261006-reconcile01';
import {renderMerchOrders} from './merch-orders.js?v=20261007-starken02';
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
function showLogin(){workspace.hidden=true;login.hidden=false;$('#logout').hidden=true;notice('Ingresa con una cuenta autorizada del equipo.');}
async function session(){
  const {data,error}=await client.auth.getSession();if(error||!data?.session){showLogin();return}
  const id=data.user?.id||data.session.user?.id;
  profile=(await query(client.from('profiles').select('user_id,email').eq('user_id',id)))[0];
  if(!profile){await client.auth.signOut();showLogin();$('#login-error').textContent='Esta cuenta no tiene acceso al Backstage. Consulta con la administradora.';return}
  login.hidden=true;workspace.hidden=false;$('#logout').hidden=false;
  document.querySelectorAll('[data-admin]').forEach(node=>node.hidden=false);
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
const titles={gacha:'Gacha de photocards',posts:'Entradas del blog',products:'Productos de merch',paypal_attempts:'Intentos PayPal',webpay_alerts:'Seguimiento Webpay',orders:'Pedidos pagados',members:'Integrantes',events:'Eventos'};
const singular={posts:'entrada',products:'producto',members:'integrante',events:'evento'};
async function openTab(next){tab=next;notice(`Cargando ${titles[tab].toLowerCase()}…`);
  try{
    document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.tab===tab)));
    if(tab==='gacha'){
      editor.replaceChildren();
      await renderGacha(client,records,editor,notice);
      return;
    }
    if(tab==='paypal_attempts'){
      editor.replaceChildren();
      await renderPayPalAttempts(client,records,notice);
      return;
    }
    if(tab==='webpay_alerts'){
      editor.replaceChildren();
      await renderWebpayAlerts(client,records,notice);
      return;
    }
    if(tab==='orders'){
      editor.replaceChildren();
      await renderMerchOrders(client,records,notice);
      return;
    }
    const listQuery=client.from(tab).select('*');
    [items,members]=await Promise.all([query(listQuery.order(tab==='events'?'starts_at':tab==='posts'?'updated_at':'display_order',{ascending:tab!=='posts'})),query(client.from('members').select('*').order('display_order'))]);
    records.replaceChildren();const heading=document.createElement('h2');heading.textContent=titles[tab];records.append(heading);
    const create=document.createElement('button');create.type='button';create.textContent='＋ Crear';create.addEventListener('click',()=>form(null));records.append(create);
    const list=document.createElement('div');list.className='admin-list';
    for(const row of items){const button=document.createElement('button');button.type='button';button.textContent=tab==='posts'?`${row.title} · ${row.status} · ${row.visibility}`:tab==='products'?`${row.name} · $${row.price_clp.toLocaleString('es-CL')}`:row.name||row.title;button.addEventListener('click',()=>form(row));list.append(button)}
    if(!items.length){const empty=document.createElement('p');empty.textContent='Todavía no hay registros. Puedes crear el primero.';list.append(empty)}records.append(list);
    editor.replaceChildren();notice(`${items.length} registros. Acceso administrativo.`);
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
    if(tab==='products'){
      const productFiles=fd.getAll('images').filter(file=>file?.size);
      if(productFiles.length){
        const existingImages=await query(client.from('product_images').select('id').eq('product_id',saved.id));
        let displayOrder=existingImages.length;
        for(const file of productFiles){
          const url=await upload(file,'product',saved.id);
          await query(client.from('product_images').insert({product_id:saved.id,url,alt:file.name,display_order:displayOrder++}))
        }
      }
    }
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
async function persistImageOrder(images){
  for(let index=0;index<images.length;index++){
    const saved=await query(client.from('product_images').update({display_order:index})
      .eq('id',images[index].id).eq('product_id',images[index].product_id).select('id,display_order'));
    if(saved.length!==1||saved[0].id!==images[index].id||saved[0].display_order!==index){
      throw new Error('No se confirmó el cambio en la base de datos. Revisa los permisos de tu cuenta.');
    }
  }
}
async function renderImages(id){
  try{
    const loadImages=()=>query(client.from('product_images').select('*').eq('product_id',id).order('display_order',{ascending:true}).order('id',{ascending:true}));
    const product=items.find(entry=>entry.id===id);
    const memberProduct=product?.variant_source==='members';
    const postalProduct=/^postales\b/i.test(product?.name||'');
    const imageVariantProduct=memberProduct||postalProduct;
    const loadMemberVariants=()=>imageVariantProduct
      ?query(client.from('product_variants').select('id,member_id,label,image_url,image_alt').eq('product_id',id).order('display_order'))
      :Promise.resolve([]);
    let images=await loadImages();
    let memberVariants=await loadMemberVariants();
    const target=$('#image-list');if(!target)return;
    let busy=false;
    target.setAttribute('aria-label','Galería actual del producto. Arrastra una foto para cambiar el orden.');
    const syncPostalVariantPhoto=(variantId,url)=>{
      if(id!=='05')return;
      const line=[...($('#variant-list')?.children||[])].find(row=>row.dataset.postalVariantId===variantId);
      if(!line)return;
      line.dataset.postalImage=url||'';
      const identity=line.querySelector('.merch-variant-head>div');
      const thumb=identity?.querySelector('.postal-variant-thumb');
      if(!url){thumb?.remove();return}
      if(thumb)thumb.src=url;
      else if(identity){const photo=document.createElement('img');photo.className='postal-variant-thumb';photo.src=url;photo.alt=`Imagen de ${line.querySelector('strong')?.textContent||'postal'}`;identity.prepend(photo)}
    };

    const setBusy=value=>{
      busy=value;
      target.setAttribute('aria-busy',String(value));
      target.querySelectorAll('button,select').forEach(control=>{control.disabled=value});
    };

    const reorder=async(from,to,focusId)=>{
      if(busy||from===to||to<0||to>=images.length)return;
      const previous=[...images];const next=[...images];const [moved]=next.splice(from,1);next.splice(to,0,moved);
      images=next;paint(focusId);setBusy(true);
      try{
        await persistImageOrder(next);
        const confirmed=await loadImages();
        if(confirmed.map(image=>image.id).join('|')!==next.map(image=>image.id).join('|'))throw new Error('El orden guardado no coincide. Actualiza la galería antes de intentarlo otra vez.');
        images=confirmed;paint(focusId);notice('Orden guardado. La primera foto es la imagen principal.');toast('success','Galería ordenada','La tienda mostrará las fotos en este orden.');
      }catch(error){
        try{images=await loadImages()}catch{images=previous}
        paint(focusId);notice(`No se pudo guardar el orden: ${error.message}`);toast('error','No se pudo cambiar el orden',error.message);
      }finally{if(target.isConnected)setBusy(false)}
    };

    const paint=(focusId=null)=>{
      target.replaceChildren();
      images.forEach((img,index)=>{
        const role=index===0?'Imagen principal':`Imagen ${index+1}`;
        const description=img.alt||role;
        const wrap=document.createElement('article');wrap.className='merch-current-image-card';wrap.dataset.merchImageCard='true';wrap.dataset.imageId=img.id;
        if(id==='05')wrap.dataset.postalCollection=memberVariants.find(variant=>variant.image_url===img.url)?.label.split(' · ')[0]||'sin-asociar';
        const badge=document.createElement('span');badge.className='merch-image-role';badge.textContent=role;
        const removeButton=document.createElement('button');removeButton.type='button';removeButton.className='merch-image-delete';removeButton.textContent='×';removeButton.setAttribute('aria-label',`Quitar ${role.toLowerCase()} de la galería`);removeButton.title='Quitar imagen';
        const head=document.createElement('div');head.className='merch-image-card-head';head.append(badge,removeButton);
        const stage=document.createElement('div');stage.className='merch-image-drag';stage.tabIndex=0;stage.setAttribute('role','group');stage.setAttribute('aria-label',`${role}. Arrastra esta foto para cambiar su posición; con teclado usa las flechas izquierda o derecha.`);
        const preview=document.createElement('img');preview.src=img.url;preview.alt=img.alt||'Imagen de producto';preview.draggable=false;
        stage.append(preview);
        const footer=document.createElement('div');footer.className='merch-image-card-footer';
        const position=document.createElement('span');position.className='merch-image-position';position.textContent=`${index+1} / ${images.length}`;
        const hint=document.createElement('span');hint.className='merch-image-drag-hint';hint.textContent='⠿ Arrastra la foto';
        footer.append(position,hint);

        let association=null;
        if(imageVariantProduct&&memberVariants.length){
          association=document.createElement('label');association.className='merch-image-member-field';
          const label=document.createElement('span');label.textContent=postalProduct?'Postal de esta imagen':'Integrante de esta polera';
          const picker=document.createElement('select');picker.setAttribute('aria-label',`${postalProduct?'Postal':'Integrante'} de imagen ${index+1}`);
          const unassigned=document.createElement('option');unassigned.value='';unassigned.textContent='Sin asociar';picker.append(unassigned);
          memberVariants.forEach(variant=>{
            const member=members.find(person=>person.id===variant.member_id);if(memberProduct&&!member)return;
            const choice=document.createElement('option');choice.value=variant.id;
            choice.textContent=memberProduct?`${member.name} · ${member.color_label}`:variant.label;picker.append(choice);
          });
          picker.value=memberVariants.find(variant=>variant.image_url===img.url)?.id||'';
          picker.addEventListener('change',async()=>{
            if(busy)return;
            const current=memberVariants.find(variant=>variant.image_url===img.url);
            const chosen=memberVariants.find(variant=>variant.id===picker.value);
            if(chosen&&current&&chosen.id!==current.id){
              picker.value=current.id;
              toast('warning','Imagen ya asociada','Primero deja esta foto sin asociar para asignarla a otra variante.');return;
            }
            if(chosen&&chosen.image_url&&chosen.image_url!==img.url){
              picker.value=current?.id||'';
              toast('warning','La variante ya tiene foto','Quita la asociación de su foto anterior antes de elegir esta.');return;
            }
            const variant=chosen||current;
            if(!variant)return;
            const member=members.find(person=>person.id===variant.member_id);
            setBusy(true);
            try{
              const alt=chosen?(postalProduct?`Postal ${product.id==='05'?chosen.label:`${product.name.replace(/^Postales\s*/i,'')} · ${chosen.label}`} de Gimae`:`Polera estampada de ${member?.name||'Gimae'} · ${member?.color_label||'color de integrante'}`):'';
              const saved=await query(client.from('product_variants').update({image_url:chosen?img.url:null,image_alt:alt})
                .eq('id',variant.id).eq('product_id',id).select('id,image_url'));
              if(saved.length!==1||saved[0].image_url!==(chosen?img.url:null))throw new Error('No se confirmó la asociación en la base de datos.');
              memberVariants=await loadMemberVariants();syncPostalVariantPhoto(variant.id,chosen?img.url:null);paint();
              notice(chosen?`Imagen asociada con ${postalProduct?chosen.label:member?.name}.`:'Imagen sin variante asociada.');
              toast('success','Asociación guardada',chosen?`Esta foto mostrará ${postalProduct?`la postal ${chosen.label}`:`la polera de ${member?.name}`} en la tienda.`:'La foto ya no elegirá una variante.');
            }catch(error){memberVariants=await loadMemberVariants();paint();notice(error.message);toast('error','No se pudo asociar la imagen',error.message)}
            finally{if(target.isConnected)setBusy(false)}
          });
          association.append(label,picker);
        }

        let drag=null;
        const findDrop=(x,y)=>[...target.querySelectorAll('.merch-current-image-card:not([hidden])')].find(card=>{
          if(card===wrap)return false;
          const rect=card.getBoundingClientRect();return x>=rect.left-6&&x<=rect.right+6&&y>=rect.top-6&&y<=rect.bottom+6;
        });
        const showDrop=(x,y)=>{
          const candidate=findDrop(x,y);
          if(drag.over!==candidate){drag.over?.classList.remove('is-drop-target');drag.over=candidate;candidate?.classList.add('is-drop-target')}
        };
        const scrollDuringDrag=()=>{
          if(!drag?.active)return;
          const speed=drag.clientY<65?-11:drag.clientY>window.innerHeight-65?11:0;
          if(speed){window.scrollBy(0,speed);wrap.style.transform=`translate3d(${drag.clientX-drag.x}px,${drag.clientY-drag.y+window.scrollY-drag.scrollY}px,0)`;showDrop(drag.clientX,drag.clientY)}
          drag.scrollFrame=requestAnimationFrame(scrollDuringDrag);
        };
        stage.addEventListener('pointerdown',event=>{
          if(busy||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;
          event.preventDefault();stage.setPointerCapture(event.pointerId);
          drag={id:event.pointerId,x:event.clientX,y:event.clientY,clientX:event.clientX,clientY:event.clientY,scrollY:window.scrollY,active:false,over:null,scrollFrame:null};
        });
        stage.addEventListener('pointermove',event=>{
          if(!drag||event.pointerId!==drag.id)return;
          drag.clientX=event.clientX;drag.clientY=event.clientY;
          const dx=event.clientX-drag.x,dy=event.clientY-drag.y+window.scrollY-drag.scrollY;
          if(!drag.active&&Math.hypot(dx,dy)<7)return;
          if(!drag.active){drag.active=true;wrap.classList.add('is-dragging');drag.scrollFrame=requestAnimationFrame(scrollDuringDrag)}
          wrap.style.transform=`translate3d(${dx}px,${dy}px,0)`;
          showDrop(event.clientX,event.clientY);
        });
        const finishDrag=event=>{
          if(!drag||event.pointerId!==drag.id)return;
          const destination=event.type==='pointerup'&&drag.active?drag.over:null;
          if(drag.scrollFrame!==null)cancelAnimationFrame(drag.scrollFrame);
          drag.over?.classList.remove('is-drop-target');wrap.classList.remove('is-dragging');wrap.style.transform='';
          drag=null;
          if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
          if(destination){const to=images.findIndex(image=>image.id===destination.dataset.imageId);reorder(index,to,img.id)}
        };
        stage.addEventListener('pointerup',finishDrag);stage.addEventListener('pointercancel',finishDrag);
        stage.addEventListener('keydown',event=>{
          if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
          event.preventDefault();
          if(id==='05'){
            const visible=[...target.querySelectorAll('.merch-current-image-card:not([hidden])')];
            const position=visible.findIndex(card=>card.dataset.imageId===img.id);
            const neighbor=visible[position+(event.key==='ArrowLeft'?-1:1)];
            if(neighbor)reorder(index,images.findIndex(image=>image.id===neighbor.dataset.imageId),img.id);
          }else reorder(index,index+(event.key==='ArrowLeft'?-1:1),img.id);
        });

        removeButton.addEventListener('click',async()=>{
          if(busy)return;
          const primary=index===0;
          const detail=primary
            ?'Esta es la imagen principal. Si la quitas, la siguiente pasará automáticamente a ser la principal. El archivo también se eliminará del almacenamiento y esta acción no se puede deshacer.'
            :'El archivo también se eliminará del almacenamiento y esta acción no se puede deshacer.';
          const ok=await ask({tone:'danger',title:'¿Quitar esta imagen?',message:`Vas a quitar ${role.toLowerCase()} de la galería del producto.`,detail,image:{src:img.url,alt:`Vista previa de ${description}`,caption:role},confirmText:'Sí, quitar imagen'});if(!ok)return;
          setBusy(true);
          try{
            const linked=memberVariants.find(variant=>variant.image_url===img.url);
            if(linked){
              const unlinked=await query(client.from('product_variants').update({image_url:null,image_alt:''})
                .eq('id',linked.id).eq('product_id',id).select('id,image_url'));
              if(unlinked.length!==1||unlinked[0].image_url!==null)throw new Error('No se pudo desvincular la variante de esta foto.');
              memberVariants=await loadMemberVariants();
              syncPostalVariantPhoto(linked.id,null);
            }
            await removeStorage(img.url);
            await query(client.from('product_images').delete().eq('id',img.id));
            images=images.filter(image=>image.id!==img.id);
            await persistImageOrder(images);
            paint();
            notice('Imagen eliminada de la galería.');toast('success','Imagen eliminada','La galería y su orden ya están actualizados.');
          }catch(error){
            notice(`No se pudo quitar la imagen: ${error.message}`);toast('error','No se pudo quitar la imagen',error.message);
          }finally{if(target.isConnected)setBusy(false)}
        });

        wrap.append(head,stage,footer);
        if(association)wrap.append(association);
        target.append(wrap);
      });
      if(!images.length){
        const empty=document.createElement('p');empty.className='merch-current-empty';empty.textContent='Este producto todavía no tiene imágenes guardadas.';target.append(empty);
      }
      if(focusId){
        requestAnimationFrame(()=>{
          const card=[...target.children].find(node=>node.dataset?.imageId===focusId);
          card?.querySelector('.merch-image-drag')?.focus({preventScroll:true});
        });
      }
    };
    paint();
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
    const postalProduct=/^postales\b/i.test(items.find(product=>product.id===id)?.name||'');
    for(const v of variants){
      const line=document.createElement('div');line.className='admin-row';if(id==='05'){line.dataset.postalVariantId=v.id;line.dataset.postalCollection=v.label.split(' · ')[0];line.dataset.postalImage=v.image_url||''}const label=document.createElement('strong');label.textContent=v.label;const price=document.createElement('input');price.type='number';price.min='0';price.value=v.price_clp;price.setAttribute('aria-label',`Precio CLP de ${v.label}`);const stock=document.createElement('input');stock.type='number';stock.min='0';stock.value=v.stock;stock.setAttribute('aria-label',`Stock de ${v.label}`);const confirmStock=document.createElement('input');confirmStock.type='checkbox';confirmStock.checked=v.stock_confirmed;confirmStock.setAttribute('aria-label',`Stock confirmado de ${v.label}`);const save=document.createElement('button');save.textContent='Guardar variante';save.type='button';
      save.addEventListener('click',async()=>{const original=save.textContent;save.disabled=true;save.textContent='Guardando…';try{await query(client.from('product_variants').update({price_clp:Number(price.value),stock:Number(stock.value),stock_confirmed:confirmStock.checked}).eq('id',v.id));notice('Variante guardada.');toast('success','Variante actualizada',`Se guardaron precio y stock de “${v.label}”.`)}catch(error){notice(error.message);toast('error','No se pudo guardar la variante',error.message)}finally{save.disabled=false;save.textContent=original}});
      line.append(label,price,stock,confirmStock,save);
      if(postalProduct){
        const removeVariant=document.createElement('button');removeVariant.type='button';removeVariant.className='merch-delete-variant';removeVariant.textContent='Eliminar variante';
        removeVariant.setAttribute('aria-label',`Eliminar variante ${v.label}`);
        removeVariant.addEventListener('click',async()=>{
          const ok=await ask({tone:'danger',title:'¿Eliminar esta variante?',message:`Vas a eliminar “${v.label}” de este producto.`,detail:'Esta acción no se puede deshacer. Su imagen seguirá en la galería hasta que la quites por separado.',confirmText:'Eliminar variante'});if(!ok)return;
          removeVariant.disabled=true;
          try{
            const removed=await query(client.from('product_variants').delete().eq('id',v.id).eq('product_id',id).select('id'));
            if(removed.length!==1)throw new Error('No se confirmó la eliminación de la variante.');
            await renderVariants(id);await renderImages(id);
            notice('Variante eliminada.');toast('success','Variante eliminada',`“${v.label}” ya no está disponible.`)
          }catch(error){removeVariant.disabled=false;notice(error.message);toast('error','No se pudo eliminar la variante',error.message)}
        });
        line.append(removeVariant);
      }
      target.append(line)
    }
  }catch(error){notice(error.message);toast('error','No se pudieron cargar las variantes',error.message)}
}
async function addVariant(id){
  const f=$('#record-form'),label=word(new FormData(f).get('new_variant'));if(!label){notice('Escribe el nombre de la variante.');toast('warning','Falta el nombre de la variante','Escribe un nombre antes de añadirla.');return}
  if(id==='05'&&f.dataset.postalCollection&&label.split(/\s*·\s*/)[0].trim().toLowerCase()!==f.dataset.postalCollection.toLowerCase()){
    notice(`Estás editando Postales ${f.dataset.postalCollection}.`);toast('warning','Revisa la colección',`Usa “${f.dataset.postalCollection} · Diseño” para añadir la postal aquí.`);return;
  }
  if(id==='05'&&!/^(Antigua|Halloween|Traje|Verano)\s*·\s*\S+/i.test(label)){
    notice('Escribe la colección y el diseño, por ejemplo “Verano · Suki”.');
    toast('warning','Falta la colección','Usa “Colección · Diseño”, por ejemplo “Verano · Suki”.');
    return;
  }
  try{await query(client.from('product_variants').insert({id:`${id}-${crypto.randomUUID()}`,product_id:id,label,price_clp:Number(new FormData(f).get('new_price'))||0}));await renderVariants(id);f.elements.new_variant.value=f.dataset.postalCollection?`${f.dataset.postalCollection} · `:'';notice('Variante creada con inventario sin confirmar.');toast('success','Variante creada',`“${label}” ya forma parte del producto.`)}catch(error){notice(error.message);toast('error','No se pudo crear la variante',error.message)}
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
