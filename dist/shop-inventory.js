(async()=>{
  'use strict';

  await window.GIMAE_READY;

  const config=window.GIMAE||{};
  const catalog=Array.isArray(config.merch)?config.merch.filter(product=>product?.active!==false):[];
  const productGrid=document.querySelector('#shop-product-grid');
  const dialogContent=document.querySelector('#product-dialog-content');
  if(!productGrid)return;

  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const isStock=value=>Number.isInteger(value)&&value>=0;

  function optionsFor(product){
    if(Array.isArray(product.prices)&&product.prices.length){
      return product.prices.map((option,index)=>({
        id:clean(option.id||`option-${index+1}`),
        label:clean(option.label||`Opción ${index+1}`)
      })).filter(option=>option.id);
    }
    if(product.variantSource==='members'){
      return (config.members||[]).map(member=>({
        id:clean(member.id),
        label:clean(`${member.name} · ${member.colorLabel}`)
      })).filter(option=>option.id);
    }
    return [{id:'default',label:''}];
  }

  function stockFor(product,optionId){
    if(product.inventoryMode==='variants'||product.stockByVariant){
      const value=product.stockByVariant?.[optionId];
      return isStock(value)?value:null;
    }
    return isStock(product.stock)?product.stock:null;
  }

  function optionStockLabel(stock){
    if(stock===null)return 'Disponibilidad por confirmar';
    if(stock===0)return 'Agotado';
    if(stock<=5)return `Quedan ${stock}`;
    return 'Disponible';
  }

  function summaryLabel(product){
    if(product.inventoryMode!=='variants')return optionStockLabel(stockFor(product,'default'));
    const summary=product.inventorySummary;
    if(!summary)return 'Stock administrado por variante';
    const units=Math.max(0,Number(summary.confirmedUnits)||0);
    const confirmed=Math.max(0,Number(summary.confirmedVariants)||0);
    const total=Math.max(0,Number(summary.variantCount)||0);
    if(summary.allConfirmed){
      if(units===0)return 'Agotado en todas las variantes';
      return `${units} ${units===1?'unidad':'unidades'} en total`;
    }
    return `${units} ${units===1?'unidad confirmada':'unidades confirmadas'} · ${confirmed}/${total} variantes revisadas`;
  }

  function patchControls(product,controls){
    if(!controls||controls.dataset.inventoryPatched==='true')return;
    controls.dataset.inventoryPatched='true';
    const options=optionsFor(product);
    const select=controls.querySelector('.shop-variant');
    const quantity=controls.querySelector('.shop-quantity');
    const button=controls.querySelector('.add-cart');
    if(!quantity||!button||!options.length)return;

    const availability=document.createElement('span');
    availability.className='shop-option-stock';
    availability.setAttribute('role','status');
    availability.setAttribute('aria-live','polite');
    if(select)select.insertAdjacentElement('afterend',availability);
    else controls.prepend(availability);

    const selectedOption=()=>{
      const id=select?.value||options[0].id;
      return options.find(option=>option.id===id)||options[0];
    };

    const update=()=>{
      const option=selectedOption();
      const stock=stockFor(product,option.id);
      const prefix=option.label?`${option.label}: `:'';
      availability.textContent=`${prefix}${optionStockLabel(stock)}`;
      availability.dataset.state=stock===null?'pending':stock===0?'out':'ok';

      const unavailable=stock===null||stock===0;
      quantity.disabled=unavailable;
      quantity.max=String(stock===null?1:Math.max(1,stock));
      if(stock!==null&&stock>0&&Number(quantity.value)>stock)quantity.value=String(stock);
      if(unavailable)quantity.value='1';
      button.disabled=unavailable;
      button.textContent=stock===null?'Stock por confirmar':stock===0?'Agotado':'Agregar al carrito';
      button.setAttribute('aria-disabled',String(unavailable));
    };

    select?.addEventListener('change',update);
    update();
  }

  function patchDialog(product){
    if(!dialogContent)return;
    const summary=dialogContent.querySelector('.product-detail-stock');
    if(summary)summary.textContent=`Inventario total: ${summaryLabel(product)}.`;
    dialogContent.querySelectorAll('.shop-buy-controls').forEach(controls=>patchControls(product,controls));
  }

  function patchCard(card,product){
    if(!card||!product||card.dataset.inventoryPatched==='true')return;
    card.dataset.inventoryPatched='true';
    const summary=card.querySelector('.shop-stock');
    if(summary){
      summary.textContent=summaryLabel(product);
      summary.classList.add('shop-stock-summary');
      summary.dataset.mode=product.inventoryMode||'product';
    }
    card.querySelectorAll('.shop-buy-controls').forEach(controls=>patchControls(product,controls));
    const detail=card.querySelector('.shop-detail-button');
    detail?.addEventListener('click',()=>queueMicrotask(()=>patchDialog(product)));
  }

  function patchProducts(){
    const cards=[...productGrid.querySelectorAll('.shop-product-card')];
    cards.forEach((card,index)=>patchCard(card,catalog[index]));
  }

  const observer=new MutationObserver(patchProducts);
  observer.observe(productGrid,{childList:true});
  patchProducts();
})();
