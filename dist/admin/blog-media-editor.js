const editorRoot=document.querySelector('#editor');
const rt=window.GIMAE_RICH_TEXT;
if(editorRoot&&rt){
  let activeForm=null;
  let activeCleanup=null;

  const validVideo=value=>{
    try{
      const url=new URL(value);
      const host=url.hostname.replace(/^www\./,'').toLowerCase();
      if(host==='youtu.be'||host.endsWith('youtube.com')||host.endsWith('vimeo.com'))return url.href;
      if(/\.(?:mp4|webm)(?:$|[?#])/i.test(url.pathname+url.search+url.hash))return url.href;
    }catch{}
    return null;
  };
  const provider=value=>{
    try{const host=new URL(value).hostname.replace(/^www\./,'').toLowerCase();if(host.includes('youtu'))return 'YouTube';if(host.includes('vimeo'))return 'Vimeo'}catch{}
    return 'Vídeo directo';
  };

  function enhance(form){
    if(form.dataset.mediaStudio==='true'||!form.elements.content)return;
    const toolbar=form.querySelector('.blog-format-toolbar');
    const compose=form.querySelector('.blog-compose-panel');
    if(!toolbar||!compose)return;

    activeCleanup?.();
    activeForm=form;
    form.dataset.mediaStudio='true';

    const content=form.elements.content;
    const lastGroup=toolbar.querySelector('.blog-tool-group:last-child')||toolbar;
    const mediaButton=document.createElement('button');
    mediaButton.type='button';mediaButton.className='blog-video-tool';mediaButton.textContent='▶ Vídeo';mediaButton.title='Añadir vídeo al carrusel';lastGroup.append(mediaButton);

    const manager=document.createElement('section');manager.className='blog-video-manager';
    manager.innerHTML=`<div class="blog-video-manager-head"><div><span>MULTIMEDIA</span><strong>Vídeos del carrusel</strong></div><small>YouTube, Vimeo o enlace directo .mp4/.webm</small></div><div class="blog-video-add"><input type="url" inputmode="url" placeholder="https://youtu.be/..." aria-label="URL del vídeo"><button type="button">＋ Añadir vídeo</button></div><p class="blog-video-hint">Las fotos siguen subiéndose con “Otras imágenes del post”. Los vídeos se incrustan desde una URL segura para no cargar archivos pesados en el sitio.</p><div class="blog-video-list" aria-live="polite"></div>`;
    compose.append(manager);
    const input=manager.querySelector('input');
    const add=manager.querySelector('.blog-video-add button');
    const list=manager.querySelector('.blog-video-list');

    function insert(url){
      const token=`[[video|${url}]]`;
      const trimmed=content.value.replace(/\s+$/,'');
      content.value=`${trimmed}${trimmed?'\n\n':''}${token}\n`;
      content.dispatchEvent(new Event('input',{bubbles:true}));
      input.value='';input.focus();
    }
    function addVideo(){
      const url=validVideo(input.value.trim());
      if(!url){input.setCustomValidity('Usa una URL de YouTube, Vimeo o un archivo .mp4/.webm directo.');input.reportValidity();return}
      input.setCustomValidity('');insert(url);
    }
    function syncPreviewBadge(){
      if(!form.isConnected)return;
      const card=form.querySelector('.blog-preview-viewport .admin-blog-preview-card .diary-copy');
      if(!card)return;
      const videos=(rt.extractMedia?.(content.value).videos||[]).length;
      const storedImages=form.querySelectorAll('#post-image-list img').length;
      const queuedImages=form.elements.post_images?.files?.length||0;
      const total=storedImages+queuedImages+videos;
      let badge=card.querySelector(':scope > .blog-preview-media-badge');
      if(!total){badge?.remove();return}
      const parts=[];
      if(storedImages+queuedImages)parts.push(`${storedImages+queuedImages} foto${storedImages+queuedImages===1?'':'s'}`);
      if(videos)parts.push(`${videos} vídeo${videos===1?'':'s'}`);
      const text=`Carrusel · ${parts.join(' · ')}`;
      if(badge?.textContent===text)return;
      if(!badge){badge=document.createElement('div');badge.className='blog-preview-media-badge';card.append(badge)}
      badge.textContent=text;
    }
    function renderList(){
      if(!form.isConnected)return;
      const videos=(rt.extractMedia?.(content.value).videos)||[];
      list.replaceChildren();
      if(!videos.length){const empty=document.createElement('p');empty.className='blog-video-empty';empty.textContent='Todavía no hay vídeos en esta entrada.';list.append(empty);syncPreviewBadge();return}
      videos.forEach((url,index)=>{
        const row=document.createElement('div');row.className='blog-video-row';
        const meta=document.createElement('div');const badge=document.createElement('span');badge.textContent=provider(url);const text=document.createElement('small');text.textContent=url;meta.append(badge,text);
        const remove=document.createElement('button');remove.type='button';remove.textContent='Quitar';remove.addEventListener('click',()=>{
          const lines=content.value.split('\n');let seen=-1;
          content.value=lines.filter(line=>{const match=line.match(/^\s*\[\[video\|(https?:\/\/[^\]\s]+)\]\]\s*$/i);if(!match)return true;seen++;return seen!==index}).join('\n').replace(/\n{3,}/g,'\n\n');
          content.dispatchEvent(new Event('input',{bubbles:true}));
        });
        row.append(meta,remove);list.append(row);
      });
      syncPreviewBadge();
    }

    const onMediaClick=()=>{manager.scrollIntoView({behavior:'smooth',block:'center'});input.focus()};
    const onAdd=()=>addVideo();
    const onInputKey=event=>{if(event.key==='Enter'){event.preventDefault();addVideo()}};
    let renderQueued=false;
    const onContentInput=()=>{
      if(renderQueued)return;
      renderQueued=true;
      requestAnimationFrame(()=>{renderQueued=false;renderList()});
    };
    const onImagesChange=()=>requestAnimationFrame(syncPreviewBadge);

    mediaButton.addEventListener('click',onMediaClick);
    add.addEventListener('click',onAdd);
    input.addEventListener('keydown',onInputKey);
    content.addEventListener('input',onContentInput);
    form.elements.post_images?.addEventListener('change',onImagesChange);

    // La preview completa se reemplaza al escribir. Solo observamos sus hijos directos:
    // observar el subárbol haría que insertar el propio badge volviera a disparar el observer.
    const preview=form.querySelector('.blog-preview-viewport');
    const previewObserver=preview?new MutationObserver(()=>requestAnimationFrame(syncPreviewBadge)):null;
    previewObserver?.observe(preview,{childList:true});

    const postImages=form.querySelector('#post-image-list');
    const imageObserver=postImages?new MutationObserver(()=>requestAnimationFrame(syncPreviewBadge)):null;
    imageObserver?.observe(postImages,{childList:true});

    activeCleanup=()=>{
      previewObserver?.disconnect();
      imageObserver?.disconnect();
      mediaButton.removeEventListener('click',onMediaClick);
      add.removeEventListener('click',onAdd);
      input.removeEventListener('keydown',onInputKey);
      content.removeEventListener('input',onContentInput);
      form.elements.post_images?.removeEventListener('change',onImagesChange);
      if(activeForm===form)activeForm=null;
    };
    renderList();
  }

  const observer=new MutationObserver(()=>{
    if(activeForm&&!activeForm.isConnected){activeCleanup?.();activeCleanup=null}
    const form=editorRoot.querySelector('#record-form');
    if(form?.elements?.content&&form!==activeForm)requestAnimationFrame(()=>enhance(form));
  });
  observer.observe(editorRoot,{childList:true,subtree:true});
}