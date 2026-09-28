(function(){
  const ready=window.GIMAE_READY;
  const rt=window.GIMAE_RICH_TEXT;
  if(!ready||!rt)return;

  const safeUrl=value=>rt.safeUrl?rt.safeUrl(value):null;
  function videoDescriptor(value){
    const href=safeUrl(value);if(!href)return null;
    const url=new URL(href);
    const host=url.hostname.replace(/^www\./,'').toLowerCase();
    if(host==='youtu.be'){
      const id=url.pathname.split('/').filter(Boolean)[0];
      if(id)return {type:'youtube',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,href};
    }
    if(host.endsWith('youtube.com')){
      const id=url.searchParams.get('v')||url.pathname.match(/\/(?:embed|shorts)\/([^/?#]+)/)?.[1];
      if(id)return {type:'youtube',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,href};
    }
    if(host.endsWith('vimeo.com')){
      const id=url.pathname.split('/').filter(Boolean).find(part=>/^\d+$/.test(part));
      if(id)return {type:'vimeo',src:`https://player.vimeo.com/video/${id}`,href};
    }
    if(/\.(?:mp4|webm)(?:$|[?#])/i.test(url.pathname+url.search+url.hash))return {type:'video',src:href,href};
    return {type:'link',src:href,href};
  }
  function createMediaNode(asset,title){
    if(asset.kind==='image'){
      const image=document.createElement('img');
      image.loading='lazy';image.src=asset.src;image.alt=asset.alt||`Imagen de ${title}`;
      return image;
    }
    const video=videoDescriptor(asset.src);
    if(!video)return document.createTextNode('');
    if(video.type==='youtube'||video.type==='vimeo'){
      const frame=document.createElement('iframe');
      frame.src=video.src;frame.title=`Vídeo de ${title}`;frame.loading='lazy';frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;
      return frame;
    }
    if(video.type==='video'){
      const element=document.createElement('video');
      element.src=video.src;element.controls=true;element.playsInline=true;element.preload='metadata';
      element.setAttribute('aria-label',`Vídeo de ${title}`);return element;
    }
    const link=document.createElement('a');
    link.className='gimae-media-external';link.href=video.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir vídeo ↗';
    return link;
  }
  function buildCarousel(assets,title){
    if(!assets.length)return null;
    const root=document.createElement('section');root.className='gimae-media-carousel';root.setAttribute('aria-label',`Galería multimedia de ${title}`);
    const head=document.createElement('div');head.className='gimae-media-head';
    const label=document.createElement('span');label.textContent='GALERÍA';
    const counter=document.createElement('span');counter.className='gimae-media-counter';counter.textContent=`1 / ${assets.length}`;
    head.append(label,counter);
    const frame=document.createElement('div');frame.className='gimae-media-frame';
    const track=document.createElement('div');track.className='gimae-media-track';track.tabIndex=0;track.setAttribute('aria-label','Desliza para ver más contenido');
    assets.forEach((asset,index)=>{
      const slide=document.createElement('figure');slide.className='gimae-media-slide';slide.dataset.index=String(index);slide.setAttribute('aria-label',`${index+1} de ${assets.length}`);
      slide.append(createMediaNode(asset,title));track.append(slide);
    });
    frame.append(track);
    const dots=document.createElement('div');dots.className='gimae-media-dots';
    let active=0,raf=0;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setActive=index=>{
      active=Math.max(0,Math.min(assets.length-1,index));counter.textContent=`${active+1} / ${assets.length}`;
      dots.querySelectorAll('button').forEach((dot,i)=>dot.setAttribute('aria-current',String(i===active)));
      track.querySelectorAll('video').forEach((video,i)=>{if(i!==active&&!video.paused)video.pause()});
    };
    const go=index=>{setActive(index);track.scrollTo({left:track.clientWidth*active,behavior:reduced?'auto':'smooth'})};
    if(assets.length>1){
      const prev=document.createElement('button'),next=document.createElement('button');
      prev.type=next.type='button';prev.className='gimae-media-nav gimae-media-prev';next.className='gimae-media-nav gimae-media-next';
      prev.setAttribute('aria-label','Elemento anterior');next.setAttribute('aria-label','Elemento siguiente');prev.textContent='←';next.textContent='→';
      prev.addEventListener('click',()=>go(active-1<0?assets.length-1:active-1));next.addEventListener('click',()=>go(active+1>=assets.length?0:active+1));
      frame.append(prev,next);
      assets.forEach((_,index)=>{const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label',`Ir al elemento ${index+1}`);dot.setAttribute('aria-current',String(index===0));dot.addEventListener('click',()=>go(index));dots.append(dot)});
      track.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>setActive(Math.round(track.scrollLeft/Math.max(1,track.clientWidth))))},{passive:true});
      track.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();go(active+1>=assets.length?0:active+1)}if(event.key==='ArrowLeft'){event.preventDefault();go(active-1<0?assets.length-1:active-1)}});
    }else dots.hidden=true;
    root.append(head,frame,dots);return root;
  }

  ready.then(()=>setTimeout(()=>{
    const config=window.GIMAE||{};
    const posts=config.posts||[];
    const cards=[...document.querySelectorAll('#blog .live-posts .diary-card.live-entry')];
    cards.forEach((card,index)=>{
      const post=posts[index];if(!post)return;
      card.dataset.postSlug=post.slug||'';
      const body=card.querySelector('.diary-copy');if(!body)return;
      if(!body.querySelector('.category')){const category=document.createElement('span');category.className='category';category.textContent='EL DIARIO DE GIMAE';body.prepend(category)}
      const time=body.querySelector('time');
      const paragraphs=[...body.children].filter(node=>node.tagName==='P');
      const author=paragraphs[0],content=paragraphs[paragraphs.length-1];
      if(author)author.classList.add('gimae-post-author');
      const parsed=rt.extractMedia?rt.extractMedia(post.content||''):{content:post.content||'',videos:[]};
      let rich;
      if(content){rich=document.createElement('div');rt.render(parsed.content,rich);content.replaceWith(rich)}
      else{rich=document.createElement('div');rt.render(parsed.content,rich);body.append(rich)}
      body.querySelectorAll(':scope > img').forEach(image=>image.remove());
      const assets=(config.postImages||[]).filter(media=>media.post_id===post.id&&media.url).map(media=>({kind:'image',src:media.url,alt:media.alt||''}));
      parsed.videos.forEach(url=>assets.push({kind:'video',src:url,alt:''}));
      const carousel=buildCarousel(assets,post.title||'Gimae');if(carousel)body.append(carousel);
      if(!card.querySelector(':scope > img')&&!card.querySelector(':scope > .gimae-generated-cover')){
        const generated=document.createElement('div');generated.className='gimae-generated-cover';generated.setAttribute('aria-hidden','true');generated.innerHTML='<span>Dear<br>you.</span><small>GIMAE! DIARY</small>';card.insertBefore(generated,body)
      }
      if(time)time.classList.add('gimae-post-date');
    });
  },0));
})();