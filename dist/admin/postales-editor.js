const editor=document.querySelector('#editor');
const collections=['Antigua','Halloween','Traje','Verano'];
let activeForm=null;
let activeCleanup=null;
let rootFrame=0;

const element=(tag,className,text)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
};

function enhance(form){
  if(form===activeForm||form.elements.id?.value!=='05'||!form.querySelector('.merch-media-section'))return;
  const media=form.querySelector('.merch-media-section');
  const variants=form.querySelector('.merch-variants-section');
  const imageList=form.querySelector('#image-list');
  const variantList=form.querySelector('#variant-list');
  const basics=form.querySelector('.merch-basics-section');
  const sales=form.querySelector('.merch-sales-section');
  const variantSetup=form.querySelector('.merch-variant-setup-section');
  if(!media||!variants||!imageList||!variantList||!basics||!sales||!variantSetup)return;
  activeCleanup?.();
  activeForm=form;
  form.classList.add('merch-postales-form');

  const chooser=element('section','postal-collections');
  chooser.setAttribute('aria-labelledby','postal-collections-title');
  const intro=element('div','postal-collections-intro');
  const heading=element('h3','','Elige una colección de Postales');
  heading.id='postal-collections-title';
  intro.append(element('p','postal-collections-kicker','PRODUCTO 05 · POSTALES'),heading,element('p','','Cada colección reúne sus diseños, fotos y stock dentro del mismo producto.'));
  const grid=element('div','postal-collections-grid');
  chooser.append(intro,grid);
  basics.before(chooser);

  const detail=element('div','postal-collection-detail');
  detail.hidden=true;
  const detailCopy=element('div','postal-collection-detail-copy');
  detailCopy.append(element('span','','EDITANDO COLECCIÓN'),element('h3','',''));
  const back=element('button','postal-collection-back','← Ver colecciones');
  back.type='button';
  detail.append(detailCopy,back);
  media.before(detail);
  detail.after(variants);
  variants.after(media);
  variants.querySelector('.merch-section-number').textContent='01';
  variants.querySelector('.merch-section-head h3').textContent='Diseños y stock de la colección';
  media.querySelector('.merch-section-number').textContent='02';
  media.querySelector('.merch-section-head h3').textContent='Fotos de la colección';

  const settings=element('details','postal-product-settings');
  const summary=element('summary','','Ajustes generales de Postales');
  const settingsNote=element('p','','Nombre, precio base, publicación y configuración del producto 05. El stock se administra en cada diseño.');
  settings.append(summary,settingsNote,basics,sales,variantSetup);
  media.after(settings);

  let selected=null;
  const buttons=new Map();
  const newVariant=form.elements.new_variant;
  const sync=()=>{
    form.dataset.postalCollection=selected||'';
    media.hidden=!selected;
    variants.hidden=!selected;
    detail.hidden=!selected;
    if(selected)detailCopy.querySelector('h3').textContent=`Postales ${selected}`;
    for(const row of variantList.children)row.hidden=!selected||row.dataset.postalCollection!==selected;
    for(const card of imageList.children){
      if(!card.dataset.imageId)continue;
      card.hidden=!selected||(card.dataset.postalCollection!==selected&&card.dataset.postalCollection!=='sin-asociar');
    }
    for(const option of imageList.querySelectorAll('.merch-image-member-field select option')){
      const available=!selected||!option.value||option.textContent.startsWith(`${selected} ·`);
      option.disabled=!available;
      option.hidden=!available;
    }
    for(const [name,button] of buttons)button.setAttribute('aria-pressed',String(name===selected));
  };

  const choose=name=>{
    const previous=selected;
    selected=name;
    if(newVariant&&(!newVariant.value.trim()||newVariant.value===`${previous} · `))newVariant.value=`${name} · `;
    sync();
    detail.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    detailCopy.querySelector('h3').tabIndex=-1;
    detailCopy.querySelector('h3').focus({preventScroll:true});
  };

  for(const name of collections){
    const button=element('button','postal-collection-card');
    button.type='button';button.setAttribute('aria-pressed','false');
    const visual=element('span','postal-collection-visual');
    const info=element('span','postal-collection-info');
    info.append(element('span','postal-collection-eyebrow','COLECCIÓN'),element('strong','',`Postales ${name}`),element('small','','Cargando diseños…'));
    const action=element('span','postal-collection-action','Editar colección →');
    button.append(visual,info,action);
    button.addEventListener('click',()=>choose(name));
    grid.append(button);buttons.set(name,button);
  }

  const updateCards=()=>{
    for(const name of collections){
      const button=buttons.get(name);
      const rows=[...variantList.children].filter(row=>row.dataset.postalCollection===name);
      const photo=[...imageList.children].find(card=>card.dataset.postalCollection===name)?.querySelector('img')?.src||rows.find(row=>row.dataset.postalImage)?.dataset.postalImage;
      const visual=button.querySelector('.postal-collection-visual');
      visual.replaceChildren();
      if(photo){const img=document.createElement('img');img.src=photo;img.alt=`Vista de Postales ${name}`;visual.append(img)}
      else visual.append(element('span','postal-collection-placeholder','♡'));
      button.querySelector('small').textContent=`${rows.length} ${rows.length===1?'diseño':'diseños'}`;
    }
    sync();
  };
  back.addEventListener('click',()=>{
    const previous=selected;
    selected=null;
    sync();
    heading.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    buttons.get(previous||collections[0]).focus({preventScroll:true});
  });
  const listObserver=new MutationObserver(updateCards);
  listObserver.observe(variantList,{childList:true});
  listObserver.observe(imageList,{childList:true});
  updateCards();
  activeCleanup=()=>{listObserver.disconnect();activeForm=null;activeCleanup=null};
}

function schedule(){
  cancelAnimationFrame(rootFrame);
  rootFrame=requestAnimationFrame(()=>{
    const form=editor?.querySelector('#record-form');
    if(form!==activeForm)activeCleanup?.();
    if(!form)return;
    enhance(form);
  });
}

if(editor){
  new MutationObserver(schedule).observe(editor,{childList:true});
  schedule();
}
