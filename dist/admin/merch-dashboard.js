const records=document.querySelector('#records');
const merchTab=document.querySelector('[data-tab="products"]');
const settings=window.GIMAE_SUPABASE||{};
const money=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
let clientPromise=null;
let scheduled=0;
let generation=0;

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const safeUrl=value=>{try{const url=new URL(String(value||''),location.href);return ['https:','http:'].includes(url.protocol)?url.href:null}catch{return null}};
const isMerchActive=()=>merchTab?.getAttribute('aria-current')==='true';

async function getClient(){
  if(clientPromise)return clientPromise;
  clientPromise=(async()=>{
    if(!settings.url||!settings.publishableKey)throw new Error('Supabase no está configurado.');
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    const client=createClient(settings.url,settings.publishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(!data?.session)throw new Error('La sesión del panel ya no está disponible.');
    return client;
  })();
  return clientPromise;
}

function inventoryState(product,variants){
  if(variants.length){
    const pending=variants.some(item=>!item.stock_confirmed);
    const total=variants.reduce((sum,item)=>sum+(item.stock_confirmed?Number(item.stock||0):0),0);
    if(pending)return {kind:'pending',label:'Stock por confirmar',detail:`${variants.length} variantes`};
    if(total<=0)return {kind:'out',label:'Agotado',detail:`${variants.length} variantes`};
    return {kind:'ok',label:`${total} uds.`,detail:`${variants.length} variantes`};
  }
  if(!product.stock_confirmed)return {kind:'pending',label:'Stock por confirmar',detail:'Inventario general'};
  const stock=Number(product.stock||0);
  if(stock<=0)return {kind:'out',label:'Agotado',detail:'Inventario general'};
  return {kind:'ok',label:`${stock} uds.`,detail:'Inventario general'};
}

function priceLabel(product,variants){
  const values=variants.map(item=>Number(item.price_clp)).filter(Number.isFinite);
  if(!values.length)return money.format(Number(product.price_clp||0));
  const min=Math.min(...values),max=Math.max(...values);
  return min===max?money.format(min):`${money.format(min)} – ${money.format(max)}`;
}

function buildLoadingShell(createAction){
  const shell=el('div','merch-dashboard');
  const hero=el('div','merch-dashboard-hero');
  const copy=el('div','merch-dashboard-copy');
  copy.append(el('p','merch-eyebrow','GIMAE! MERCH DESK'),el('h2','','Tu catálogo, de un vistazo ♡'),el('p','merch-dashboard-lede','Revisa visibilidad, precios, imágenes e inventario antes de entrar a editar cada producto.'));
  const actions=el('div','merch-dashboard-actions');
  const shop=document.createElement('a');shop.href='../shop.html';shop.target='_blank';shop.rel='noopener noreferrer';shop.className='merch-secondary-action';shop.textContent='Ver tienda ↗';
  const add=el('button','merch-primary-action','＋ Nuevo producto');add.type='button';add.addEventListener('click',()=>createAction.click());
  actions.append(shop,add);hero.append(copy,actions);
  const loading=el('div','merch-dashboard-loading');
  loading.innerHTML='<span aria-hidden="true">✦</span><div><strong>Preparando el catálogo visual…</strong><small>Reuniendo imágenes, variantes y stock.</small></div>';
  shell.append(hero,loading);
  return shell;
}

async function enhance(){
  if(!records||!isMerchActive())return;
  const basicList=records.querySelector('.admin-list');
  if(!basicList||records.querySelector('.merch-dashboard'))return;
  const currentGeneration=++generation;
  const originalChildren=[...records.children];
  const originalCreate=originalChildren.find(node=>node.tagName==='BUTTON');
  const originalButtons=[...basicList.querySelectorAll(':scope > button')];
  if(!originalCreate)return;

  records.classList.add('merch-records-mode');
  const shell=buildLoadingShell(originalCreate);
  records.replaceChildren(shell);

  try{
    const client=await getClient();
    const [productResult,imageResult,variantResult]=await Promise.all([
      client.from('products').select('id,name,description,note,price_clp,stock,stock_confirmed,active,display_order,variant_label,color').order('display_order'),
      client.from('product_images').select('id,product_id,url,alt,display_order').order('display_order'),
      client.from('product_variants').select('id,product_id,label,price_clp,stock,stock_confirmed,display_order').order('display_order')
    ]);
    for(const result of [productResult,imageResult,variantResult])if(result.error)throw result.error;
    if(currentGeneration!==generation||!isMerchActive())return;
    const products=productResult.data||[],images=imageResult.data||[],variants=variantResult.data||[];
    if(products.length!==originalButtons.length)throw new Error('El catálogo visual no coincide con la lista administrativa. Recarga el panel para sincronizarlo.');
    renderDashboard(shell,products,images,variants,originalButtons,originalCreate);
  }catch(error){
    console.error('No se pudo preparar Merch Desk:',error);
    if(currentGeneration!==generation||!isMerchActive())return;
    records.classList.remove('merch-records-mode');
    records.replaceChildren(...originalChildren);
    window.GIMAE_UI?.toast?.({tone:'warning',title:'No se pudo cargar la vista visual de Merch',message:error.message||'Se mantuvo la lista básica para que puedas seguir trabajando.'});
  }
}

function renderDashboard(shell,products,images,variants,originalButtons,originalCreate){
  shell.querySelector('.merch-dashboard-loading')?.remove();
  const imageByProduct=new Map();
  images.forEach(image=>{if(!imageByProduct.has(image.product_id))imageByProduct.set(image.product_id,image)});
  const variantsByProduct=new Map();
  variants.forEach(item=>{if(!variantsByProduct.has(item.product_id))variantsByProduct.set(item.product_id,[]);variantsByProduct.get(item.product_id).push(item)});

  const models=products.map((product,index)=>{
    const productVariants=variantsByProduct.get(product.id)||[];
    return {product,index,image:imageByProduct.get(product.id)||null,variants:productVariants,inventory:inventoryState(product,productVariants)};
  });
  const attention=models.filter(model=>['pending','out'].includes(model.inventory.kind)).length;
  const visible=products.filter(product=>product.active).length;
  const hidden=products.length-visible;

  const overview=el('div','merch-overview');
  const stats=[['all','Productos',products.length,'Todo el catálogo'],['visible','En la tienda',visible,'Visibles ahora'],['hidden','Ocultos',hidden,'Fuera de la tienda'],['attention','Revisar stock',attention,'Necesitan atención']];
  stats.forEach(([filter,label,value,detail],index)=>{
    const button=el('button','merch-stat-card');button.type='button';button.dataset.summaryFilter=filter;button.setAttribute('aria-pressed',String(index===0));
    button.append(el('span','merch-stat-label',label),el('strong','',String(value)),el('small','',detail));overview.append(button);
  });

  const toolbar=el('div','merch-catalog-toolbar');
  const searchWrap=el('label','merch-search');searchWrap.append(el('span','','Buscar producto'));
  const search=document.createElement('input');search.type='search';search.placeholder='Nombre, código o descripción…';search.autocomplete='off';searchWrap.append(search);
  const filters=el('div','merch-filter-group');filters.setAttribute('role','group');filters.setAttribute('aria-label','Filtrar productos');
  [['all','Todos'],['visible','Visibles'],['hidden','Ocultos'],['attention','Revisar stock']].forEach(([value,label],index)=>{const button=el('button','',label);button.type='button';button.dataset.merchFilter=value;button.setAttribute('aria-pressed',String(index===0));filters.append(button)});
  toolbar.append(searchWrap,filters);

  const meta=el('div','merch-catalog-meta');
  const resultCount=el('span','','');
  const hint=el('span','','Selecciona “Editar producto” para abrir todos sus controles.');
  meta.append(resultCount,hint);
  const grid=el('div','merch-product-grid');
  const empty=el('div','merch-empty-state');empty.hidden=true;empty.innerHTML='<span aria-hidden="true">♡</span><strong>No encontramos productos</strong><p>Prueba con otra búsqueda o cambia el filtro.</p>';
  shell.append(overview,toolbar,meta,grid,empty);

  let filter='all';
  const setFilter=next=>{
    filter=next;
    shell.querySelectorAll('[data-merch-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.merchFilter===filter)));
    shell.querySelectorAll('[data-summary-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.summaryFilter===filter)));
    renderGrid();
  };

  function renderGrid(){
    const term=search.value.trim().toLocaleLowerCase('es');
    const filtered=models.filter(model=>{
      const product=model.product;
      const haystack=[product.id,product.name,product.description,product.note].filter(Boolean).join(' ').toLocaleLowerCase('es');
      const matchesSearch=!term||haystack.includes(term);
      const matchesFilter=filter==='all'||(filter==='visible'&&product.active)||(filter==='hidden'&&!product.active)||(filter==='attention'&&['pending','out'].includes(model.inventory.kind));
      return matchesSearch&&matchesFilter;
    });
    grid.replaceChildren();
    filtered.forEach(model=>grid.append(buildProductCard(model,originalButtons[model.index])));
    resultCount.textContent=`${filtered.length} ${filtered.length===1?'producto':'productos'}`;
    empty.hidden=filtered.length!==0;
  }

  filters.addEventListener('click',event=>{const button=event.target.closest('[data-merch-filter]');if(button)setFilter(button.dataset.merchFilter)});
  overview.addEventListener('click',event=>{const button=event.target.closest('[data-summary-filter]');if(button)setFilter(button.dataset.summaryFilter)});
  search.addEventListener('input',renderGrid);
  renderGrid();
}

function buildProductCard(model,editAction){
  const {product,image,variants,inventory}=model;
  const card=el('article','merch-product-card');
  card.dataset.active=String(Boolean(product.active));card.dataset.stock=inventory.kind;
  const visual=el('div','merch-product-visual');
  const imageUrl=safeUrl(image?.url);
  if(imageUrl){const img=document.createElement('img');img.src=imageUrl;img.alt=image.alt||`Imagen de ${product.name}`;img.loading='lazy';visual.append(img)}
  else{const fallback=el('div','merch-product-fallback');fallback.setAttribute('aria-hidden','true');fallback.append(el('span','','♡'),el('small','',String(product.id||'GIMAE').toUpperCase())) ;visual.append(fallback)}
  const visibility=el('span',`merch-visibility ${product.active?'is-visible':'is-hidden'}`,product.active?'● Visible':'○ Oculto');visual.append(visibility);

  const body=el('div','merch-product-body');
  const identity=el('div','merch-product-identity');identity.append(el('span','merch-product-code',`ITEM ${product.id}`),el('h3','',product.name||'Producto sin nombre'));
  const note=el('p','merch-product-note',product.note||product.description||'Sin descripción breve todavía.');
  const price=el('strong','merch-product-price',priceLabel(product,variants));
  const facts=el('div','merch-product-facts');
  const stock=el('span',`merch-stock-pill is-${inventory.kind}`);stock.append(el('b','',inventory.label),el('small','',inventory.detail));
  const variant=el('span','merch-variant-pill');variant.append(el('b','',variants.length?`${variants.length} ${variants.length===1?'variante':'variantes'}`:'Sin variantes'),el('small','',product.variant_label||'Precio general'));
  facts.append(stock,variant);

  const footer=el('div','merch-product-footer');
  const order=el('span','merch-order',`Orden ${Number(product.display_order||0)+1}`);
  const edit=el('button','merch-edit-product','Editar producto →');edit.type='button';edit.addEventListener('click',()=>editAction?.click());
  footer.append(order,edit);
  body.append(identity,note,price,facts,footer);card.append(visual,body);
  return card;
}

function schedule(){
  cancelAnimationFrame(scheduled);
  scheduled=requestAnimationFrame(()=>{
    if(!isMerchActive()){records?.classList.remove('merch-records-mode');generation++;return}
    void enhance();
  });
}

if(records&&merchTab){
  const observer=new MutationObserver(schedule);
  observer.observe(records,{childList:true});
  merchTab.addEventListener('click',schedule);
  schedule();
}
