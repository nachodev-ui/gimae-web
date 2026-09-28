// Supabase público; si la API falla, content.js sigue mostrando el respaldo local.
window.GIMAE_READY=(async()=>{
  const cfg=window.GIMAE,settings=window.GIMAE_SUPABASE||{};
  if(!cfg||!settings.url||!settings.publishableKey){cfg.backendStatus='fallback';return cfg}
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    // La página pública usa siempre el rol anon, incluso en un navegador con el panel abierto.
    const api=createClient(settings.url,settings.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const get=async(table,order)=>{const {data,error}=await api.from(table).select('*').order(order);if(error)throw error;return data||[]};
    const [members,socials,products,variants,images,posts,postImages,events]=await Promise.all([
      get('members','display_order'),get('group_socials','platform'),get('products','display_order'),
      get('product_variants','display_order'),get('product_images','display_order'),
      get('posts','published_at'),get('post_images','display_order'),get('events','starts_at')
    ]);
    cfg.members=members.map(m=>({id:m.id,name:m.name,color:m.color,accent:m.accent,colorLabel:m.color_label,
      photo:m.photo_url,handle:m.handle,socials:m.socials||{},biography:m.biography}));
    cfg.socials=Object.fromEntries(socials.map(s=>[s.platform,s.url]));
    cfg.merch=products.map(p=>{
      const gallery=images.filter(im=>im.product_id===p.id).map(im=>({src:im.url,alt:im.alt}));
      const v=variants.filter(option=>option.product_id===p.id);
      const product={id:p.id,name:p.name,description:p.description,note:p.note,color:p.color,price:p.price_clp,
        stock:p.stock_confirmed?p.stock:null,active:p.active,variantLabel:p.variant_label,variantSource:p.variant_source,
        image:gallery[0]?.src||null,imageAlt:gallery[0]?.alt||'',gallery};
      if(p.id==='04')product.prices=v.map(x=>({id:x.id,label:x.label,value:x.price_clp,image:x.image_url,imageAlt:x.image_alt,
        memberId:x.member_id||'',memberLabel:members.find(m=>m.id===x.member_id)?.name||'',typeId:x.id==='group'?'group':'individual',typeLabel:x.id==='group'?'Grupal':'Individual'}));
      if(v.length)product.stockByVariant=Object.fromEntries(v.map(x=>[p.id==='04'?x.id:(x.member_id||x.id),x.stock_confirmed?x.stock:null]));
      return product;
    });
    async function blogImage(url){
      if(!url?.startsWith('storage:gimae-blog/'))return url;
      const path=url.slice('storage:gimae-blog/'.length);
      const {data,error}=await api.storage.from('gimae-blog').createSignedUrl(path,3600);
      if(error)throw error;return data.signedUrl;
    }
    cfg.posts=await Promise.all(posts.map(async p=>({...p,cover_url:await blogImage(p.cover_url)})));
    cfg.postImages=await Promise.all(postImages.map(async im=>({...im,url:await blogImage(im.url)})));
    cfg.events=events;
    cfg.backendStatus='live';
  }catch(error){cfg.backendStatus='fallback';console.warn('Catálogo local de respaldo:',error)}
  return cfg;
})();
