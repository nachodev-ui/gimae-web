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

  function optionStockLabel(product,stock){
    if(stock===null)return 'Disponibilidad por confirmar';
    if(stock===0){
      const otherAvailable=optionsFor(product).some(option=>stockFor(product,option.id)>0);
      return otherAvailable?'Esta opción está agotada':'Agotado por ahora';
    }
    if(stock<=3)return 'Últimas unidades';
    return 'Disponible';
  }

  function showAvailability(target,product,stock){
    if(!target)return;
    target.textContent=optionStockLabel(product,stock);
    target.dataset.state=stock===null?'pending':stock===0?'out':stock<=3?'low':'ok';
    target.setAttribute('role','status');
    target.setAttribute('aria-live','polite');
  }

  function patchControls(product,controls,availability){
    if(!controls||controls.dataset.inventoryPatched==='true')return;
    controls.dataset.inventoryPatched='true';
    const options=optionsFor(product);
    const select=controls.querySelector('.shop-variant');
    const quantity=controls.querySelector('.shop-quantity');
    const button=controls.querySelector('.add-cart');
    if(!quantity||!button||!options.length)return;

    const selectedOption=()=>{
      const id=select?.value||options[0].id;
      return options.find(option=>option.id===id)||options[0];
    };

    const update=()=>{
      const option=selectedOption();
      const stock=stockFor(product,option.id);
      showAvailability(availability,product,stock);

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
    dialogContent.querySelectorAll('.shop-buy-controls').forEach(controls=>patchControls(product,controls,summary));
  }

  function patchCard(card,product){
    if(!card||!product||card.dataset.inventoryPatched==='true')return;
    card.dataset.inventoryPatched='true';
    const summary=card.querySelector('.shop-stock');
    if(summary){
      summary.classList.add('shop-availability');
    }
    card.querySelectorAll('.shop-buy-controls').forEach(controls=>patchControls(product,controls,summary));
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
