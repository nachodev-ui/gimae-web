const editorRoot=document.querySelector('#editor');
const merchTab=document.querySelector('[data-tab="products"]');
let activeCleanup=null;
let scheduled=0;

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const isMerchActive=()=>merchTab?.getAttribute('aria-current')==='true';

function variantRows(list){
  return [...(list?.children||[])].map(row=>{
    const stock=[...row.querySelectorAll('input[type="number"]')][1];
    const confirmed=row.querySelector('input[type="checkbox"]');
    if(!stock||!confirmed)return null;
    return {stock,confirmed};
  }).filter(Boolean);
}

function enhance(form){
  if(!form||!isMerchActive()||!form.elements.stock||!form.elements.stock_confirmed)return;
  const sales=form.querySelector('.merch-sales-section');
  const list=form.querySelector('#variant-list');
  if(!sales||!list)return;
  if(form.dataset.inventoryModel==='true')return;

  activeCleanup?.();
  form.dataset.inventoryModel='true';
  const stock=form.elements.stock;
  const confirmed=form.elements.stock_confirmed;
  const stockField=stock.closest('.merch-field')||stock.closest('label');
  const confirmCard=confirmed.closest('.merch-toggle-card')||confirmed.closest('label');
  const stockTitle=stockField?.querySelector('.merch-field-title');
  const stockHelp=stockField?.querySelector('.merch-field-help');
  const confirmTitle=confirmCard?.querySelector('.merch-toggle-copy strong');
  const confirmHelp=confirmCard?.querySelector('.merch-toggle-copy small');

  const original={
    stockReadOnly:stock.readOnly,
    stockAria:stock.getAttribute('aria-readonly'),
    confirmedDisabled:confirmed.disabled,
    stockTitle:stockTitle?.textContent||'',
    stockHelp:stockHelp?.textContent||'',
    confirmTitle:confirmTitle?.textContent||'',
    confirmHelp:confirmHelp?.textContent||''
  };

  const source=el('aside','merch-inventory-source');
  source.setAttribute('aria-live','polite');
  const icon=el('span','merch-inventory-source-icon','✦');icon.setAttribute('aria-hidden','true');
  const copy=el('div','merch-inventory-source-copy');
  const title=el('strong','','');
  const description=el('p','','');
  copy.append(title,description);
  const metrics=el('div','merch-inventory-metrics');
  const units=el('span','merch-inventory-metric');units.append(el('b','','0'),el('small','','uds. confirmadas'));
  const progress=el('span','merch-inventory-metric');progress.append(el('b','','0/0'),el('small','','variantes confirmadas'));
  const status=el('span','merch-inventory-metric');status.append(el('b','','—'),el('small','','estado general'));
  metrics.append(units,progress,status);
  source.append(icon,copy,metrics);
  const toggleGrid=sales.querySelector('.merch-toggle-grid');
  (toggleGrid||sales).before(source);

  const sync=()=>{
    const rows=variantRows(list);
    const hasVariants=rows.length>0;
    form.dataset.inventorySource=hasVariants?'variants':'product';
    source.classList.toggle('is-variants',hasVariants);
    source.classList.toggle('is-product',!hasVariants);

    if(hasVariants){
      const confirmedRows=rows.filter(row=>row.confirmed.checked);
      const confirmedUnits=confirmedRows.reduce((sum,row)=>sum+(Math.max(0,Number(row.stock.value)||0)),0);
      const allConfirmed=confirmedRows.length===rows.length;
      stock.value=String(confirmedUnits);
      stock.readOnly=true;
      stock.setAttribute('aria-readonly','true');
      confirmed.checked=allConfirmed;
      confirmed.disabled=true;
      stockField?.classList.add('is-derived-inventory');
      confirmCard?.classList.add('is-derived-inventory');
      if(stockTitle)stockTitle.textContent='Stock confirmado total';
      if(stockHelp)stockHelp.textContent='Se calcula automáticamente sumando solo las unidades confirmadas de las variantes.';
      if(confirmTitle)confirmTitle.textContent='Confirmación global calculada';
      if(confirmHelp)confirmHelp.textContent='Queda confirmada únicamente cuando todas las variantes fueron revisadas.';
      title.textContent='Inventario administrado por variantes';
      description.textContent='No escribas un segundo stock para el producto general. Actualiza Suki, Usi, Vewe, Vali, talla o edición en “Variantes y stock”; este resumen se recalcula solo.';
      units.querySelector('b').textContent=String(confirmedUnits);
      units.querySelector('small').textContent='uds. confirmadas';
      progress.querySelector('b').textContent=`${confirmedRows.length}/${rows.length}`;
      progress.querySelector('small').textContent='variantes confirmadas';
      status.querySelector('b').textContent=allConfirmed?(confirmedUnits>0?'Confirmado':'Agotado'):'Pendiente';
      status.querySelector('small').textContent='estado general';
      status.dataset.state=allConfirmed?(confirmedUnits>0?'ok':'out'):'pending';
    }else{
      stock.readOnly=original.stockReadOnly;
      if(original.stockAria===null)stock.removeAttribute('aria-readonly');else stock.setAttribute('aria-readonly',original.stockAria);
      confirmed.disabled=original.confirmedDisabled;
      stockField?.classList.remove('is-derived-inventory');
      confirmCard?.classList.remove('is-derived-inventory');
      if(stockTitle)stockTitle.textContent=original.stockTitle||'Stock general';
      if(stockHelp)stockHelp.textContent=original.stockHelp||'Unidades disponibles para este producto.';
      if(confirmTitle)confirmTitle.textContent=original.confirmTitle||'Inventario general confirmado';
      if(confirmHelp)confirmHelp.textContent=original.confirmHelp||'Actívalo cuando hayas comprobado físicamente el stock.';
      title.textContent='Inventario general del producto';
      description.textContent='Este producto no tiene variantes. Aquí sí se administra directamente su cantidad disponible y su confirmación.';
      units.querySelector('b').textContent=String(Math.max(0,Number(stock.value)||0));
      units.querySelector('small').textContent='uds. registradas';
      progress.querySelector('b').textContent='General';
      progress.querySelector('small').textContent='fuente de inventario';
      status.querySelector('b').textContent=confirmed.checked?'Confirmado':'Pendiente';
      status.querySelector('small').textContent='estado general';
      status.dataset.state=confirmed.checked?'ok':'pending';
    }
  };

  const onInput=event=>{
    if(event.target.matches('input[type="number"],input[type="checkbox"]'))sync();
  };
  list.addEventListener('input',onInput);
  list.addEventListener('change',onInput);
  stock.addEventListener('input',sync);
  confirmed.addEventListener('change',sync);
  const observer=new MutationObserver(sync);
  observer.observe(list,{childList:true,subtree:true});
  sync();

  activeCleanup=()=>{
    observer.disconnect();
    list.removeEventListener('input',onInput);
    list.removeEventListener('change',onInput);
    stock.removeEventListener('input',sync);
    confirmed.removeEventListener('change',sync);
    source.remove();
    delete form.dataset.inventoryModel;
    delete form.dataset.inventorySource;
    activeCleanup=null;
  };
}

function schedule(){
  cancelAnimationFrame(scheduled);
  scheduled=requestAnimationFrame(()=>{
    const form=editorRoot?.querySelector('#record-form');
    if(!form||!isMerchActive()){
      if(activeCleanup&&!form)activeCleanup();
      return;
    }
    enhance(form);
  });
}

if(editorRoot){
  const observer=new MutationObserver(schedule);
  observer.observe(editorRoot,{childList:true,subtree:true});
  schedule();
}
