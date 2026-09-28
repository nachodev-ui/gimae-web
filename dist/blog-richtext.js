(function(){
  const ready=window.GIMAE_READY;
  if(!ready||!window.GIMAE_RICH_TEXT)return;
  ready.then(()=>setTimeout(()=>{
    const posts=window.GIMAE?.posts||[];
    const cards=[...document.querySelectorAll('#blog .live-posts .diary-card.live-entry')];
    cards.forEach((card,index)=>{
      const post=posts[index];if(!post)return;
      card.dataset.postSlug=post.slug||'';
      const body=card.querySelector('.diary-copy');if(!body)return;
      if(!body.querySelector('.category')){
        const category=document.createElement('span');category.className='category';category.textContent='EL DIARIO DE GIMAE';body.prepend(category);
      }
      const time=body.querySelector('time');
      const children=[...body.children];
      const paragraphs=children.filter(node=>node.tagName==='P');
      const author=paragraphs[0];
      const content=paragraphs[paragraphs.length-1];
      if(author){author.classList.add('gimae-post-author')}
      if(content){
        const rich=document.createElement('div');
        window.GIMAE_RICH_TEXT.render(post.content||'',rich);
        content.replaceWith(rich);
      }
      if(!card.querySelector(':scope > img')&&!card.querySelector(':scope > .gimae-generated-cover')){
        const generated=document.createElement('div');
        generated.className='gimae-generated-cover';
        generated.setAttribute('aria-hidden','true');
        generated.innerHTML='<span>Dear<br>you.</span><small>GIMAE! DIARY</small>';
        card.insertBefore(generated,body);
      }
      if(time)time.classList.add('gimae-post-date');
    });
  },0));
})();