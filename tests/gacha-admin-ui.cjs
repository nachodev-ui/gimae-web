// In-memory jsdom exercise of the admin editor. No remote writes.
// Run after: npm install --no-save --no-package-lock jsdom@26.1.0
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const dom=new JSDOM('<button data-tab="gacha" aria-current="true"></button><main id="records"></main><aside id="editor"></aside>',{url:'https://example.test/admin/'});
global.window=dom.window;global.document=dom.window.document;global.HTMLImageElement=dom.window.HTMLImageElement;
global.URL=dom.window.URL;
const revokedUrls=[];let nextPreview=0;
URL.createObjectURL=()=>`blob:gacha-preview-${++nextPreview}`;
URL.revokeObjectURL=url=>revokedUrls.push(url);
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.matchMedia=()=>({matches:true});

const config={id:true,minimum_clp:2000,pulls_per_order:3,allow_test_orders:false,rarities:{common:{label:'Común',weight:70},rare:{label:'Rara',weight:25},ssr:{label:'SSR',weight:5}}};
const cards=['common','rare','ssr'].map((tier,index)=>({serial:`TEST-${index}`,integrante:`Carta ${index}`,rareza:tier,imagen:'images/suki.webp',frase:`Frase ${index}`,crop:'50% 25%',zoom:1,active:true,display_order:index}));
const toasts=[],confirmations=[],uploads=[],orders=[];
let releaseUpload=null,holdUpload=false,failUpload=false;
dom.window.GIMAE_UI={toast:message=>toasts.push(message),confirm:async options=>{confirmations.push(options);return true;}};

class Query{
  constructor(table){this.table=table;this.filters=[];this.operation='select';}
  select(){return this;}
  eq(key,value){this.filters.push([key,value]);return this;}
  single(){this.singleRow=true;return this;}
  order(){return this;}
  update(value){this.operation='update';this.value=value;return this;}
  insert(value){this.operation='insert';this.value=value;return this;}
  delete(){this.operation='delete';return this;}
  then(resolve,reject){
    const rows=this.table==='gacha_settings'?[config]:cards;
    const matches=row=>this.filters.every(([key,value])=>row[key]===value);
    if(this.operation==='update')rows.filter(matches).forEach(row=>Object.assign(row,this.value));
    if(this.operation==='insert')cards.push({...this.value,serial:'NEW'});
    if(this.operation==='delete')cards.splice(0,cards.length,...cards.filter(row=>!matches(row)));
    const result=rows.filter(matches).sort((a,b)=>(a.display_order??0)-(b.display_order??0)||String(a.serial).localeCompare(String(b.serial)));
    return Promise.resolve({data:this.singleRow?result[0]:result,error:null}).then(resolve,reject);
  }
}
const client={
  from:table=>new Query(table),
  rpc:async(name,{p_serials})=>{assert.equal(name,'reorder_gacha_cards');orders.push([...p_serials]);p_serials.forEach((serial,index)=>{cards.find(card=>card.serial===serial).display_order=index;});return {data:null,error:null};},
  storage:{from:bucket=>{assert.equal(bucket,'gimae-gacha');return {
    upload:async(path,file,options)=>{uploads.push({path,file,options});if(holdUpload)await new Promise(resolve=>{releaseUpload=resolve;});return failUpload?{data:null,error:new Error('Storage no disponible')}:{data:{},error:null};},
    getPublicUrl:path=>({data:{publicUrl:`https://example.test/${path}`}})
  };}}
};
const click=selector=>document.querySelector(selector).click();
const input=(name,value)=>{const control=document.querySelector(`[name="${name}"]`);control.value=value;control.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

(async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../dist/admin/gacha-editor.js'),'utf8');
  const {renderGacha}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  await renderGacha(client,document.querySelector('#records'),document.querySelector('#editor'),()=>{});
  const total=()=>document.querySelector('#gacha-weight-total');
  const save=()=>document.querySelector('#gacha-settings-save');
  assert.equal(total().getAttribute('aria-live'),'polite');
  assert.equal(total().dataset.state,'exact');assert.equal(save().disabled,false);
  input('ssr-weight','0.5');
  assert.match(total().textContent,/Total: 95\.5%/);assert.match(total().textContent,/Faltan 4\.5%/);assert.equal(save().disabled,true);
  input('rare-weight','29.5');assert.equal(total().dataset.state,'exact');assert.equal(save().disabled,false);
  input('rare-weight','30.5');assert.equal(total().dataset.state,'exceeded');assert.match(total().textContent,/Te pasaste por 1%/);assert.equal(save().disabled,true);
  input('rare-weight','29.5');input('common-weight','70');assert.equal(total().dataset.state,'exact');
  input('common-weight','70.001');assert.equal(total().dataset.state,'invalid');assert.equal(save().disabled,true);
  input('common-weight','70');click('#gacha-settings-save');await tick();
  assert.equal(config.rarities.common.weight+config.rarities.rare.weight+config.rarities.ssr.weight,100);

  let first=document.querySelector('.gacha-admin-card');first.focus();
  first.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await tick();
  assert.deepEqual(orders.at(-1),['TEST-1','TEST-0','TEST-2']);
  assert.equal(document.activeElement.dataset.serial,'TEST-0');
  const from=document.querySelectorAll('.gacha-admin-card')[0],to=document.querySelectorAll('.gacha-admin-card')[2];
  const drag=new dom.window.Event('dragstart',{bubbles:true,cancelable:true});drag.dataTransfer={setData(){}};from.dispatchEvent(drag);
  const drop=new dom.window.Event('drop',{bubbles:true,cancelable:true});to.dispatchEvent(drop);await tick();
  assert.deepEqual(orders.at(-1),['TEST-0','TEST-2','TEST-1']);

  const originalRandom=Math.random;Math.random=()=>0;
  click('#gacha-shuffle');await tick();Math.random=originalRandom;
  assert.equal(confirmations.at(-1).confirmText,'Reorganizar álbum');
  assert.notDeepEqual(orders.at(-1),['TEST-0','TEST-2','TEST-1']);
  assert.deepEqual([...document.querySelectorAll('.gacha-admin-card')].map(item=>item.dataset.serial),orders.at(-1));
  assert.ok(toasts.some(item=>item.title==='Álbum reorganizado'));

  click('[data-edit]');
  assert.ok(document.querySelector('.member-editor-visual-layout.gacha-visual-layout'));
  assert.ok(document.querySelector('.member-editor-photo-card.gacha-preview-box'));
  assert.match(document.querySelector('.member-editor-photo-copy').textContent,/2\.55:3\.65/);
  assert.ok([...document.querySelectorAll('#records button,#editor button')].every(button=>button.classList.contains('gacha-button')));
  assert.equal(document.querySelector('#gacha-file').type,'file');
  assert.equal(document.querySelector('#gacha-file').labels.length,1);
  assert.equal(document.querySelector('#gacha-file').tabIndex,0);
  assert.ok(document.querySelector('#gacha-image-spec'));
  assert.equal(document.querySelector('.gacha-preview-box').hidden,false);
  assert.equal(document.querySelector('#gacha-pick-image').textContent,'Reemplazar');
  click('#gacha-remove-image');await tick();
  assert.equal(document.querySelector('#gacha-preview').hidden,true);
  assert.equal(document.querySelector('.gacha-preview-fallback').hidden,false);
  assert.equal(document.querySelector('#gacha-pick-image').textContent,'＋ Seleccionar imagen');
  const bad=new dom.window.File(['x'],'bad.gif',{type:'image/gif'});
  const zone=document.querySelector('.gacha-image-drop');
  const badDrop=new dom.window.Event('drop',{bubbles:true,cancelable:true});badDrop.dataTransfer={files:[bad]};zone.dispatchEvent(badDrop);await tick();
  assert.match(document.querySelector('#gacha-upload-status').textContent,/PNG, JPG o WebP/);assert.equal(uploads.length,0);
  const huge=new dom.window.File(['x'],'huge.png',{type:'image/png'});Object.defineProperty(huge,'size',{value:8*1024*1024+1});
  const hugeDrop=new dom.window.Event('drop',{bubbles:true,cancelable:true});hugeDrop.dataTransfer={files:[huge]};zone.dispatchEvent(hugeDrop);await tick();
  assert.match(document.querySelector('#gacha-upload-status').textContent,/máximo de 8 MB/);assert.equal(uploads.length,0);
  const image=new dom.window.File(['image'],'photo.webp',{type:'image/webp'});
  holdUpload=true;
  const goodDrop=new dom.window.Event('drop',{bubbles:true,cancelable:true});goodDrop.dataTransfer={files:[image]};zone.dispatchEvent(goodDrop);
  assert.match(document.querySelector('#gacha-preview').src,/^blob:gacha-preview-/);
  assert.equal(document.querySelector('#gacha-preview').hidden,false);
  releaseUpload();holdUpload=false;await tick();
  assert.equal(uploads.length,1);assert.equal(uploads[0].options.upsert,false);
  assert.match(document.querySelector('#gacha-upload-status').textContent,/Imagen lista/);
  assert.match(document.querySelector('#gacha-preview').src,/^https:\/\/example\.test\/cards\//);
  assert.equal(revokedUrls.length,1);
  assert.equal(document.querySelector('#gacha-pick-image').textContent,'Reemplazar');
  const savedPreview=document.querySelector('#gacha-preview').src;
  failUpload=true;
  const failedDrop=new dom.window.Event('drop',{bubbles:true,cancelable:true});failedDrop.dataTransfer={files:[image]};zone.dispatchEvent(failedDrop);
  assert.match(document.querySelector('#gacha-preview').src,/^blob:gacha-preview-/);
  await tick();failUpload=false;
  assert.equal(document.querySelector('#gacha-preview').src,savedPreview);
  assert.match(document.querySelector('#gacha-upload-status').textContent,/No pudimos subir/);
  assert.equal(revokedUrls.length,2);
  click('#gacha-editor-cancel');click('[data-delete]');await tick();
  assert.equal(confirmations.at(-1).confirmText,'Quitar carta');
  assert.equal(cards.length,2);
  // The unchanged Merch enhancer must still mount its image manager and gallery cards.
  document.querySelector('[data-tab="gacha"]').setAttribute('aria-current','false');
  const merchTab=document.createElement('button');merchTab.dataset.tab='products';merchTab.setAttribute('aria-current','true');document.body.prepend(merchTab);
  global.Node=dom.window.Node;global.MutationObserver=dom.window.MutationObserver;
  global.requestAnimationFrame=callback=>setTimeout(callback,0);global.cancelAnimationFrame=id=>clearTimeout(id);
  document.querySelector('#editor').innerHTML='<h2>Producto</h2><form id="record-form"><label>Nombre<input name="name" value="Producto"></label><label>Precio<input name="price_clp" value="1000"></label><fieldset><legend>Imágenes</legend><label>Archivo<input name="images" type="file" multiple></label><div id="image-list"><div><img src="/images/suki.webp" alt="Producto"><button type="button">Quitar</button></div></div></fieldset><div class="admin-actions"><button type="submit">Guardar</button></div></form>';
  const merchSource=fs.readFileSync(path.join(__dirname,'../dist/admin/merch-editor.js'),'utf8');
  await import(`data:text/javascript;base64,${Buffer.from(merchSource).toString('base64')}`);await tick();await tick();
  assert.ok(document.querySelector('.merch-image-drop'));
  assert.ok(document.querySelector('.merch-media-primary'));
  assert.ok(document.querySelector('.merch-current-image-card'));
  console.log('PASS: probability states and save gate, keyboard/drag/shuffle order, shared member preview and Gacha buttons, instant image preview and failed-upload rollback, Storage upload, confirmed removal, Merch regression.');
})().catch(error=>{console.error(error);process.exitCode=1;});
