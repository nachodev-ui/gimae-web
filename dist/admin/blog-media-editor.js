const editorRoot=document.querySelector('#editor');
const settings=window.GIMAE_SUPABASE||{};
const rt=window.GIMAE_RICH_TEXT;
const ui=window.GIMAE_UI;
let activeCleanup=null;
let mediaClientPromise=null;

const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const VIDEO_TYPES=new Set(['video/mp4','video/webm','video/quicktime','video/x-m4v']);
const MAX_IMAGE=8*1024*1024;
const MAX_VIDEO=50*1024*1024;
const TUS_THRESHOLD=6*1024*1024;

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const formatBytes=value=>{const bytes=Number(value)||0;if(bytes<1024)return `${bytes} B`;if(bytes<1024**2)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1024**2).toFixed(bytes>=10*1024**2?0:1)} MB`};
const notify=(tone,title,message)=>ui?.toast({tone,title,message});
const ask=options=>ui?.confirm(options)??Promise.resolve(confirm(`${options.title||'Confirmar'}\n\n${options.message||''}`));
const fileExtension=file=>{
  const byType={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-m4v':'m4v'}[file.type];
  if(byType)return byType;
  return (file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'bin';
};
const fileKind=file=>{
  if(IMAGE_TYPES.has(file.type)||/\.(?:png|jpe?g|webp)$/i.test(file.name))return 'image';
  if(VIDEO_TYPES.has(file.type)||/\.(?:mp4|webm|mov|m4v)$/i.test(file.name))return 'video';
  return null;
};
const rowKind=row=>String(row?.alt||'').startsWith('video:')||/\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(String(row?.url||''))?'video':'image';
const rowName=row=>String(row?.alt||'').replace(/^video:/,'')||'Archivo multimedia';

async function getClient(){
  if(mediaClientPromise)return mediaClientPromise;
  mediaClientPromise=(async()=>{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    const client=createClient(settings.url,settings.publishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await client.auth.getSession();
    if(error||!data?.session)throw new Error('La sesión del panel expiró. Vuelve a iniciar sesión.');
    return client;
  })();
  return mediaClientPromise;
}

async function resolveBlogAsset(client,url){
  if(!url?.startsWith('storage:gimae-blog/'))return url;
  const {data,error}=await client.storage.from('gimae-blog').createSignedUrl(url.slice('storage:gimae-blog/'.length),3600);
  if(error)throw error;return data.signedUrl;
}
async function removeBlogAsset(client,url){
  if(!url?.startsWith('storage:gimae-blog/'))return;
  const path=url.slice('storage:gimae-blog/'.length);
  if(!path.startsWith('posts/'))return;
  const {error}=await client.storage.from('gimae-blog').remove([path]);
  if(error)throw error;
}
async function queryOne(promise){const {data,error}=await promise;if(error)throw error;return data}

function validateFile(file){
  const kind=fileKind(file);
  if(!kind)throw new Error(`${file.name}: usa PNG, JPG, WebP, MP4, WebM, MOV o M4V.`);
  if(kind==='image'&&file.size>MAX_IMAGE)throw new Error(`${file.name}: las imágenes admiten hasta 8 MB.`);
  if(kind==='video'&&file.size>MAX_VIDEO)throw new Error(`${file.name}: los vídeos admiten hasta 50 MB.`);
  return kind;
}

async function tusUpload(client,file,path,onProgress){
  const {data,error}=await client.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('No fue posible obtener la sesión para subir el vídeo.');
  const tus=await import('https://esm.sh/tus-js-client@4');
  const projectRef=new URL(settings.url).hostname.split('.')[0];
  const endpoint=`https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  return new Promise((resolve,reject)=>{
    const upload=new tus.Upload(file,{
      endpoint,
      retryDelays:[0,3000,5000,10000,20000],
      headers:{authorization:`Bearer ${data.session.access_token}`},
      uploadDataDuringCreation:true,
      removeFingerprintOnSuccess:true,
      chunkSize:6*1024*1024,
      metadata:{bucketName:'gimae-blog',objectName:path,contentType:file.type||'application/octet-stream',cacheControl:'3600'},
      onError:reject,
      onProgress:(sent,total)=>onProgress?.(total?sent/total:0),
      onSuccess:()=>resolve()
    });
    upload.findPreviousUploads().then(previous=>{if(previous.length)upload.resumeFromPreviousUpload(previous[0]);upload.start()}).catch(reject);
  });
}

async function uploadAsset(client,postId,file,onProgress){
  const kind=validateFile(file);
  const extension=fileExtension(file);
  const path=`posts/${postId}/${crypto.randomUUID()}.${extension}`;
  if(file.size>TUS_THRESHOLD){
    await tusUpload(client,file,path,onProgress);
  }else{
    onProgress?.(.12);
    const {error}=await client.storage.from('gimae-blog').upload(path,file,{contentType:file.type||undefined,upsert:false,cacheControl:'3600'});
    if(error)throw error;
    onProgress?.(1);
  }
  return {kind,url:`storage:gimae-blog/${path}`};
}

function validVideo(value){
  try{
    const url=new URL(value);const host=url.hostname.replace(/^www\./,'').toLowerCase();
    if(host==='youtu.be'||host.endsWith('youtube.com')||host.endsWith('vimeo.com'))return url.href;
    if(/\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(url.pathname+url.search+url.hash))return url.href;
  }catch{}
  return null;
}
function provider(value){
  try{const host=new URL(value).hostname.replace(/^www\./,'').toLowerCase();if(host.includes('youtu'))return 'YouTube';if(host.includes('vimeo'))return 'Vimeo'}catch{}
  return 'Vídeo externo';
}

function enhance(form){
  if(form.dataset.mediaStudio==='true'||!form.elements.content||!form.elements.post_images||!form.elements.cover)return;
  form.dataset.mediaStudio='true';
  activeCleanup?.();
  const cleanup=[];
  const content=form.elements.content;
  const coverInput=form.elements.cover;
  const oldGalleryInput=form.elements.post_images;
  const initialSlug=form.elements.slug?.value||'';
  let client=null,post=null,assets=[],coverObjectUrl='',busy=false,previewRaf=0;

  const coverLabel=coverInput.closest('label');
  const galleryLabel=oldGalleryInput.closest('label');
  coverLabel?.classList.add('blog-native-file-field');
  galleryLabel?.classList.add('blog-native-file-field');
  oldGalleryInput.disabled=true;
  const legacyList=form.querySelector('#post-image-list');if(legacyList)legacyList.classList.add('blog-legacy-media-list');

  const panel=el('section','blog-media-studio');
  panel.innerHTML=`
    <div class="blog-media-studio-head">
      <div><span>MULTIMEDIA</span><h3>Portada y galería del post</h3><p>Gestiona aquí lo que verá la gente. Las fotos y vídeos del carrusel se suben al instante.</p></div>
      <span class="blog-media-sticker" aria-hidden="true">PHOTO<br>♡<br>VIDEO</span>
    </div>
    <div class="blog-cover-manager">
      <div class="blog-media-subhead"><div><span>01</span><div><strong>Portada</strong><small>La imagen que acompaña la entrada en la home.</small></div></div><span class="blog-media-spec">PNG/JPG/WebP · máx. 8 MB</span></div>
      <div class="blog-cover-layout"><div class="blog-cover-stage" data-cover-stage><span>Sin portada</span></div><div class="blog-cover-copy"><strong data-cover-name>Sin cambios pendientes</strong><p data-cover-help>Selecciona una portada vertical o cuadrada. Se aplicará cuando pulses Guardar.</p><div class="blog-media-actions"><button type="button" data-cover-pick>Elegir / cambiar portada</button><button type="button" class="secondary" data-cover-cancel hidden>Cancelar selección</button><button type="button" class="secondary danger-soft" data-cover-remove>Quitar portada actual</button></div></div></div>
    </div>
    <div class="blog-gallery-manager">
      <div class="blog-media-subhead"><div><span>02</span><div><strong>Galería multimedia</strong><small>Fotos y vídeos aparecen juntos en el carrusel.</small></div></div><span class="blog-media-spec">Fotos 8 MB · vídeos 50 MB</span></div>
      <div class="blog-media-drop" data-media-drop tabindex="0"><span class="blog-media-drop-icon" aria-hidden="true">＋</span><div><strong>Arrastra archivos aquí</strong><small>o usa los botones para elegir desde el computador o celular</small></div></div>
      <div class="blog-media-actions blog-gallery-actions"><button type="button" data-media-add>＋ Añadir fotos o vídeos</button><button type="button" class="secondary" data-media-camera>● Grabar vídeo</button><button type="button" class="secondary" data-media-replace>↻ Reemplazar galería</button></div>
      <input data-media-picker type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v,.mov,.m4v" multiple hidden>
      <input data-media-camera-input type="file" accept="video/*" capture="environment" hidden>
      <div class="blog-upload-queue" data-upload-queue aria-live="polite"></div>
      <div class="blog-current-media"><div class="blog-current-media-head"><strong>Contenido actual</strong><span data-media-count>0 elementos</span></div><div class="blog-current-media-grid" data-media-grid></div></div>
      <p class="blog-media-footnote">Los vídeos grandes usan carga reanudable. MOV/HEVC de iPhone se acepta, aunque su reproducción depende del navegador; MP4 H.264 es el formato más compatible.</p>
    </div>
    <div class="blog-video-link-manager">
      <div class="blog-media-subhead compact"><div><span>03</span><div><strong>Vídeo por enlace <em>opcional</em></strong><small>YouTube, Vimeo o un archivo directo.</small></div></div></div>
      <div class="blog-video-add"><input type="url" inputmode="url" placeholder="https://youtu.be/..." aria-label="URL del vídeo"><button type="button">＋ Añadir enlace</button></div>
      <div class="blog-video-list" aria-live="polite"></div>
    </div>`;
  form.querySelector('.admin-actions')?.before(panel);

  const picker=panel.querySelector('[data-media-picker]');
  const camera=panel.querySelector('[data-media-camera-input]');
  const queue=panel.querySelector('[data-upload-queue]');
  const grid=panel.querySelector('[data-media-grid]');
  const count=panel.querySelector('[data-media-count]');
  const drop=panel.querySelector('[data-media-drop]');
  const coverStage=panel.querySelector('[data-cover-stage]');
  const coverName=panel.querySelector('[data-cover-name]');
  const coverHelp=panel.querySelector('[data-cover-help]');
  const coverCancel=panel.querySelector('[data-cover-cancel]');
  const coverRemove=panel.querySelector('[data-cover-remove]');
  let pickerMode='add';

  async function ensureContext(){
    if(client&&post)return {client,post};
    client=await getClient();
    post=await queryOne(client.from('posts').select('id,title,slug,cover_url').eq('slug',initialSlug).single());
    return {client,post};
  }
  function setBusy(value){
    busy=value;
    panel.classList.toggle('is-busy',value);
    panel.querySelectorAll('button').forEach(button=>{if(!button.matches('[data-cover-pick],[data-cover-cancel]'))button.disabled=value});
  }
  function schedulePreviewBadge(){cancelAnimationFrame(previewRaf);previewRaf=requestAnimationFrame(syncPreviewBadge)}
  function syncPreviewBadge(){
    const body=document.querySelector('.blog-preview-viewport .admin-blog-preview-card .diary-copy');if(!body)return;
    const external=(rt.extractMedia?.(content.value).videos||[]).length;
    const photos=assets.filter(row=>rowKind(row)==='image').length;
    const videos=assets.filter(row=>rowKind(row)==='video').length+external;
    const total=photos+videos;
    let badge=body.querySelector('.blog-preview-media-badge');
    if(!total){badge?.remove();return}
    const text=`Carrusel · ${[photos?`${photos} foto${photos===1?'':'s'}`:'',videos?`${videos} vídeo${videos===1?'':'s'}`:''].filter(Boolean).join(' · ')}`;
    if(!badge){badge=el('div','blog-preview-media-badge');body.append(badge)}
    if(badge.textContent!==text)badge.textContent=text;
  }

  async function renderCover(){
    try{
      const {client,post}=await ensureContext();
      coverStage.replaceChildren();
      if(post.cover_url){
        const image=document.createElement('img');image.src=await resolveBlogAsset(client,post.cover_url);image.alt=`Portada actual de ${post.title||'la entrada'}`;coverStage.append(image);
        coverName.textContent='Portada actual';coverHelp.textContent='Puedes elegir una nueva; el cambio se aplicará al guardar.';coverRemove.hidden=false;
      }else{
        const empty=el('div','blog-cover-empty','Sin portada');coverStage.append(empty);coverName.textContent='Esta entrada no tiene portada';coverHelp.textContent='Elige una imagen para darle identidad visual en la home.';coverRemove.hidden=true;
      }
    }catch(error){coverStage.textContent='No se pudo cargar';coverHelp.textContent=error.message}
  }
  function renderPendingCover(){
    const file=coverInput.files?.[0];
    if(!file){if(coverObjectUrl){URL.revokeObjectURL(coverObjectUrl);coverObjectUrl=''}coverCancel.hidden=true;renderCover();return}
    try{if(fileKind(file)!=='image'||file.size>MAX_IMAGE)throw new Error('La portada debe ser PNG, JPG o WebP de hasta 8 MB.')}
    catch(error){coverInput.value='';notify('warning','Portada no válida',error.message);renderCover();return}
    if(coverObjectUrl)URL.revokeObjectURL(coverObjectUrl);coverObjectUrl=URL.createObjectURL(file);
    coverStage.replaceChildren();const image=document.createElement('img');image.src=coverObjectUrl;image.alt='Nueva portada seleccionada';coverStage.append(image);
    coverName.textContent=`Nueva portada: ${file.name}`;coverHelp.textContent=`${formatBytes(file.size)} · pendiente de guardar`;coverCancel.hidden=false;
  }

  async function deleteAsset(row){
    const {client}=await ensureContext();
    await removeBlogAsset(client,row.url);
    const {error}=await client.from('post_images').delete().eq('id',row.id);if(error)throw error;
  }
  async function loadAssets(){
    try{
      const {client,post}=await ensureContext();
      const {data,error}=await client.from('post_images').select('*').eq('post_id',post.id).order('display_order',{ascending:true}).order('created_at',{ascending:true});if(error)throw error;
      assets=data||[];grid.replaceChildren();count.textContent=`${assets.length} elemento${assets.length===1?'':'s'}`;
      if(!assets.length){const empty=el('div','blog-media-empty');empty.innerHTML='<strong>La galería está vacía</strong><span>Añade fotos o vídeos y aparecerán aquí.</span>';grid.append(empty);schedulePreviewBadge();return}
      for(let index=0;index<assets.length;index++){
        const row=assets[index],kind=rowKind(row);const card=el('article','blog-media-card');card.dataset.kind=kind;
        const visual=el('div','blog-media-card-visual');
        try{
          const src=await resolveBlogAsset(client,row.url);
          if(kind==='video'){const video=document.createElement('video');video.src=src;video.controls=true;video.preload='metadata';video.playsInline=true;visual.append(video)}
          else{const image=document.createElement('img');image.src=src;image.alt=rowName(row);image.loading='lazy';visual.append(image)}
        }catch{visual.append(el('span','blog-media-broken','No se pudo previsualizar'))}
        const meta=el('div','blog-media-card-meta');const badge=el('span','blog-media-type',kind==='video'?'VÍDEO':'FOTO');const name=el('strong','',rowName(row));meta.append(badge,name);
        const actions=el('div','blog-media-card-actions');
        const left=el('button','secondary','←');left.type='button';left.title='Mover antes';left.disabled=index===0;
        const right=el('button','secondary','→');right.type='button';right.title='Mover después';right.disabled=index===assets.length-1;
        const remove=el('button','secondary danger-soft','Quitar');remove.type='button';
        left.addEventListener('click',()=>reorder(index,index-1));right.addEventListener('click',()=>reorder(index,index+1));
        remove.addEventListener('click',async()=>{
          const ok=await ask({tone:'danger',title:`Quitar ${kind==='video'?'vídeo':'foto'} de la galería`,message:`Vas a quitar “${rowName(row)}” de esta entrada.`,detail:'El archivo también se eliminará del almacenamiento. Esta acción no se puede deshacer.',confirmText:'Quitar definitivamente'});if(!ok)return;
          try{setBusy(true);await deleteAsset(row);await loadAssets();notify('success',kind==='video'?'Vídeo eliminado':'Foto eliminada','La galería se actualizó correctamente.')}
          catch(error){notify('error','No se pudo quitar el recurso',error.message)}finally{setBusy(false)}
        });
        actions.append(left,right,remove);card.append(visual,meta,actions);grid.append(card);
      }
      schedulePreviewBadge();
    }catch(error){grid.replaceChildren(el('p','blog-media-error',`No se pudo cargar la galería: ${error.message}`));notify('error','No se pudo cargar la galería',error.message)}
  }
  async function reorder(from,to){
    if(to<0||to>=assets.length||from===to)return;
    const next=[...assets];[next[from],next[to]]=[next[to],next[from]];
    try{setBusy(true);const {client}=await ensureContext();for(let index=0;index<next.length;index++){const {error}=await client.from('post_images').update({display_order:index}).eq('id',next[index].id);if(error)throw error}await loadAssets()}
    catch(error){notify('error','No se pudo cambiar el orden',error.message)}finally{setBusy(false)}
  }

  function queueCard(file){
    const card=el('div','blog-upload-item');const top=el('div','blog-upload-item-top');const info=el('div');
    const kind=fileKind(file);info.innerHTML=`<strong>${file.name}</strong><span>${kind==='video'?'Vídeo':'Foto'} · ${formatBytes(file.size)}</span>`;
    const state=el('span','blog-upload-state','Esperando…');top.append(info,state);
    const bar=el('div','blog-upload-bar');const fill=el('span');bar.append(fill);card.append(top,bar);queue.append(card);
    return {state,fill,setProgress:value=>{const pct=Math.max(0,Math.min(100,Math.round(value*100)));fill.style.width=`${pct}%`;state.textContent=pct>=100?'Procesando…':`${pct}%`},done:()=>{card.classList.add('is-done');fill.style.width='100%';state.textContent='Subido ✓'},fail:message=>{card.classList.add('is-error');state.textContent=message}};
  }
  async function uploadFiles(fileList,{replace=false}={}){
    if(busy)return;const files=[...fileList];if(!files.length)return;
    try{files.forEach(validateFile)}catch(error){notify('warning','Archivo no válido',error.message);return}
    if(replace&&assets.length){
      const ok=await ask({tone:'danger',title:'Reemplazar toda la galería',message:`La galería actual tiene ${assets.length} elemento${assets.length===1?'':'s'}. Los ${files.length} archivo${files.length===1?'':'s'} seleccionado${files.length===1?'':'s'} pasarán a reemplazarlos.`,detail:'Los recursos actuales se eliminarán del almacenamiento. Si solo quieres sumar contenido, usa “Añadir fotos o vídeos”.',confirmText:'Reemplazar galería'});if(!ok){picker.value='';return}
    }
    setBusy(true);queue.replaceChildren();let succeeded=0,failed=0;
    try{
      const {client,post}=await ensureContext();
      if(replace){for(const row of [...assets])await deleteAsset(row);assets=[]}
      let order=assets.length?Math.max(...assets.map(row=>Number(row.display_order)||0))+1:0;
      for(const file of files){
        const uiItem=queueCard(file);
        try{
          const uploaded=await uploadAsset(client,post.id,file,value=>uiItem.setProgress(value));
          const alt=uploaded.kind==='video'?`video:${file.name}`:file.name;
          const {error}=await client.from('post_images').insert({post_id:post.id,url:uploaded.url,alt,display_order:order++});
          if(error){await removeBlogAsset(client,uploaded.url);throw error}
          uiItem.done();succeeded++;
        }catch(error){uiItem.fail(error.message||'Error al subir');failed++}
      }
      await loadAssets();
      if(succeeded)notify('success',replace?'Galería reemplazada':'Multimedia añadida',`${succeeded} archivo${succeeded===1?'':'s'} se ${succeeded===1?'subió':'subieron'} correctamente.`);
      if(failed)notify('warning','Algunos archivos no se subieron',`${failed} archivo${failed===1?'':'s'} presentó${failed===1?'':'ron'} un problema. Revisa la cola de subida.`);
    }catch(error){notify('error','No se pudo actualizar la galería',error.message)}finally{setBusy(false);picker.value='';camera.value=''}
  }

  const externalInput=panel.querySelector('.blog-video-add input');
  const externalAdd=panel.querySelector('.blog-video-add button');
  const externalList=panel.querySelector('.blog-video-list');
  function insertExternal(url){const token=`[[video|${url}]]`;const trimmed=content.value.replace(/\s+$/,'');content.value=`${trimmed}${trimmed?'\n\n':''}${token}\n`;content.dispatchEvent(new Event('input',{bubbles:true}));externalInput.value='';externalInput.focus()}
  function renderExternal(){
    const videos=rt.extractMedia?.(content.value).videos||[];externalList.replaceChildren();
    if(!videos.length){externalList.append(el('p','blog-video-empty','No hay vídeos enlazados.'));schedulePreviewBadge();return}
    videos.forEach((url,index)=>{
      const row=el('div','blog-video-row');const meta=el('div');meta.append(el('span','',provider(url)),el('small','',url));const remove=el('button','secondary','Quitar');remove.type='button';
      remove.addEventListener('click',async()=>{
        const ok=await ask({tone:'danger',title:'Quitar vídeo enlazado',message:'Este vídeo dejará de aparecer en el carrusel de la entrada.',detail:url,confirmText:'Quitar enlace'});if(!ok)return;
        let seen=-1;content.value=content.value.split('\n').filter(line=>{const match=line.match(/^\s*\[\[video\|(https?:\/\/[^\]\s]+)\]\]\s*$/i);if(!match)return true;seen++;return seen!==index}).join('\n').replace(/\n{3,}/g,'\n\n');content.dispatchEvent(new Event('input',{bubbles:true}));notify('success','Vídeo quitado','El enlace se eliminó del carrusel.');
      });
      row.append(meta,remove);externalList.append(row)
    });schedulePreviewBadge();
  }
  function addExternal(){
    const url=validVideo(externalInput.value.trim());if(!url){externalInput.setCustomValidity('Usa YouTube, Vimeo o un enlace directo MP4/WebM/MOV/M4V.');externalInput.reportValidity();notify('warning','Enlace de vídeo no válido','Usa YouTube, Vimeo o un archivo de vídeo directo.');return}
    externalInput.setCustomValidity('');insertExternal(url);notify('success','Vídeo enlazado','Se añadió al carrusel. Recuerda guardar la entrada para conservar este cambio.')
  }

  panel.querySelector('[data-cover-pick]').addEventListener('click',()=>coverInput.click());
  coverCancel.addEventListener('click',()=>{coverInput.value='';renderPendingCover();notify('info','Selección cancelada','Se mantendrá la portada actual.')});
  coverRemove.addEventListener('click',async()=>{
    if(!post?.cover_url&&!await ensureContext().then(ctx=>ctx.post.cover_url))return;
    const ok=await ask({tone:'danger',title:'Quitar portada actual',message:'La entrada quedará sin imagen de portada hasta que elijas otra.',detail:'El archivo actual se eliminará del almacenamiento.',confirmText:'Quitar portada'});if(!ok)return;
    try{setBusy(true);const {client,post}=await ensureContext();const previous=post.cover_url;const {error}=await client.from('posts').update({cover_url:null}).eq('id',post.id);if(error)throw error;await removeBlogAsset(client,previous);post.cover_url=null;coverInput.value='';renderPendingCover();notify('success','Portada eliminada','La entrada ya no tiene portada.')}
    catch(error){notify('error','No se pudo quitar la portada',error.message)}finally{setBusy(false)}
  });
  coverInput.addEventListener('change',renderPendingCover);

  panel.querySelector('[data-media-add]').addEventListener('click',()=>{pickerMode='add';picker.value='';picker.click()});
  panel.querySelector('[data-media-replace]').addEventListener('click',()=>{pickerMode='replace';picker.value='';picker.click()});
  panel.querySelector('[data-media-camera]').addEventListener('click',()=>{camera.value='';camera.click()});
  picker.addEventListener('change',()=>uploadFiles(picker.files,{replace:pickerMode==='replace'}));
  camera.addEventListener('change',()=>uploadFiles(camera.files,{replace:false}));
  drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('is-over')});
  drop.addEventListener('dragleave',()=>drop.classList.remove('is-over'));
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('is-over');uploadFiles(event.dataTransfer.files,{replace:false})});
  drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pickerMode='add';picker.click()}});

  externalAdd.addEventListener('click',addExternal);externalInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addExternal()}});
  content.addEventListener('input',renderExternal);
  for(const field of [content,form.elements.title,form.elements.status,form.elements.visibility])field?.addEventListener(field===content?'input':'change',schedulePreviewBadge);

  const toolbar=form.querySelector('.blog-format-toolbar');
  if(toolbar&&!toolbar.querySelector('.blog-video-tool')){const group=toolbar.querySelector('.blog-tool-group:last-child')||toolbar;const shortcut=el('button','blog-video-tool','▣ Media');shortcut.type='button';shortcut.title='Ir a multimedia';shortcut.addEventListener('click',()=>panel.scrollIntoView({behavior:'smooth',block:'start'}));group.append(shortcut)}

  renderExternal();renderCover();loadAssets();
  activeCleanup=()=>{cancelAnimationFrame(previewRaf);if(coverObjectUrl)URL.revokeObjectURL(coverObjectUrl);cleanup.forEach(fn=>fn())};
}

if(editorRoot&&rt){
  const observer=new MutationObserver(()=>{
    const form=editorRoot.querySelector('#record-form');
    if(form?.elements?.content&&form.elements?.post_images&&form.elements?.cover)queueMicrotask(()=>enhance(form));
    else if(!form){activeCleanup?.();activeCleanup=null}
  });
  observer.observe(editorRoot,{childList:true,subtree:true});
}
