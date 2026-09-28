// Supabase público; si la API falla, content.js sigue mostrando el respaldo local.
window.GIMAE_READY=(async()=>{
  const cfg=window.GIMAE,settings=window.GIMAE_SUPABASE||{};
  if(!cfg)return null;
  if(!settings.url||!settings.publishableKey){cfg.backendStatus='fallback';return cfg}
  let timeout;
  try{
    const live=(async()=>{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    // La página pública usa siempre el rol anon, incluso en un navegador con el panel abierto.
    const api=createClient(settings.url,settings.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const get=async(table,order)=>{const {data,error}=await api.from(table).select('*').order(order);if(error)throw error;return data||[]};
    const [members,socials,products,variants,images,posts,postImages,events]=await Promise.all([
      get('members','display_order'),get('group_socials','platform'),get('products','display_order'),
      get('product_variants','display_order'),get('product_images','display_order'),
      get('posts','published_at'),get('post_images','display_order'),get('events','starts_at')
    ]);
    const publicMembers=members.map(m=>({id:m.id,name:m.name,color:m.color,accent:m.accent,colorLabel:m.color_label,
      photo:m.photo_url,handle:m.handle,socials:m.socials||{},biography:m.biography}));
    const publicSocials=Object.fromEntries(socials.map(s=>[s.platform,s.url]));
    const merch=products.map(p=>{
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
      // Los vídeos pueden durar varios minutos y hacer peticiones Range durante la reproducción.
      const {data,error}=await api.storage.from('gimae-blog').createSignedUrl(path,3600);
      if(error)throw error;return data.signedUrl;
    }
    // Un asset roto o sin permiso no debe sustituir también los precios vigentes por el catálogo de respaldo.
    const optionalBlogImage=async url=>{
      try{return await blogImage(url)}
      catch(error){console.warn('No se pudo cargar un recurso del blog:',error);return null}
    };
    const publicPosts=await Promise.all(posts.map(async p=>({...p,cover_url:await optionalBlogImage(p.cover_url)})));
    const publicImages=(await Promise.all(postImages.map(async im=>({...im,url:await optionalBlogImage(im.url)})))).filter(im=>im.url);
    return {members:publicMembers,socials:publicSocials,merch,posts:publicPosts,postImages:publicImages,events};
    })();
    const data=await Promise.race([live,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Supabase tardó demasiado en responder')),8000)})]);
    Object.assign(cfg,data);
    cfg.backendStatus='live';
  }catch(error){cfg.backendStatus='fallback';console.warn('Catálogo local de respaldo:',error)}
  finally{clearTimeout(timeout)}
  return cfg;
})();
