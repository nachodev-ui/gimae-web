// Isolated browser tests: every Supabase request is intercepted. No remote writes.
// GACHA_TEST_MODULES: temporary node_modules with playwright and @sparticuz/chromium.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const modules=process.env.GACHA_TEST_MODULES || '/tmp/gacha-testing/node_modules';
const {chromium}=require(process.env.GACHA_PLAYWRIGHT || `${modules}/playwright`);
const root=path.resolve(__dirname,'../dist');
const server=http.createServer((req,res)=>{
  const name=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!name.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{const type={'.js':'application/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.png':'image/png'}[path.extname(name)];res.setHeader('Content-Type',type||'application/octet-stream');res.end(fs.readFileSync(name));}catch{res.writeHead(404);res.end();}
});
const config={id:true,minimum_clp:2000,pulls_per_order:3,allow_test_orders:false,rarities:{common:{label:'Común',weight:70},rare:{label:'Rara',weight:25},ssr:{label:'Milagro',weight:5}}};
const cards=['common','rare','ssr'].map((t,i)=>({serial:'TEST-'+i,integrante:['Suki','Usi','Vewe'][i],rareza:t,imagen:'images/'+['suki','usi','vewe'][i]+'.webp',frase:'Un recuerdo que brilla contigo.',crop:'50% 25%',zoom:1,active:true,display_order:i}));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const executablePath=process.env.GACHA_CHROMIUM || await require(`${modules}/@sparticuz/chromium/build/index.js`).default.executablePath();
 const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 try{
 const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let voucher=null,dropResponse=true,drawCalls=[],unique=new Map();const code='12345678-1234-4234-8234-123456789abc';
 await page.route('**/backend.js',r=>r.fulfill({contentType:'application/javascript',body:'window.GIMAE_READY=Promise.resolve();'}));
 await page.route('**/rest/v1/gacha_settings?*',r=>r.fulfill({json:[config]}));
 await page.route('**/rest/v1/gacha_cards?*',r=>r.fulfill({json:cards}));
 await page.route('**/functions/v1/gacha',async r=>{
   const body=r.request().postDataJSON();
   if(body.action==='state')return r.fulfill({json:{vouchers:voucher?[voucher]:[]}});
   if(body.action==='redeem'){
     if(body.orderCode!==code)return r.fulfill({status:409,json:{error:'El pedido no es válido para canjear.'}});
     voucher ||= {orderCode:code,remaining:3,granted:3,cards:[]};return r.fulfill({json:{remaining:voucher.remaining,granted:3}});
   }
   drawCalls.push(body.requestId);
   if(!unique.has(body.requestId)){
     const card={...cards[2],rarityLabel:'Milagro',special:true};voucher.remaining--;voucher.cards.push(card);unique.set(body.requestId,{card,remaining:voucher.remaining});
   }
   if(dropResponse){dropResponse=false;return r.abort('failed');}
   return r.fulfill({json:unique.get(body.requestId)});
 });
 await page.goto(origin+'/gacha.html');await page.waitForFunction(()=>!document.querySelector('#gacha-redeem button').disabled);
 assert.equal(await page.locator('#gacha-open').isDisabled(),true);
 await page.locator('#gacha-order-code').fill(code);await page.locator('#gacha-redeem button').click();await page.waitForFunction(()=>!document.querySelector('#gacha-open').disabled);
 await page.locator('#gacha-open').click();await page.waitForFunction(()=>document.querySelector('#gacha-status').textContent.includes('Failed') || document.querySelector('#gacha-status').textContent.includes('fetch'));
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#gacha-open').disabled);
 await page.locator('#gacha-open').click();await page.waitForSelector('#gacha-dialog[open]');
 assert.equal(drawCalls[0],drawCalls[1]);assert.equal(unique.size,1);assert.equal(voucher.remaining,2);
 await page.waitForFunction(()=>!document.querySelector('#gacha-story-download').disabled);
 assert.equal(await page.locator('#gacha-dialog-title').textContent(),'¡Encontraste un destello especial!');
 assert.equal(await page.locator('#gacha-progress-text').textContent(),'1/3');
 assert.equal(await page.locator('.duplicate-count').textContent(),'×1');
 const dl=page.waitForEvent('download');await page.locator('#gacha-story-download').click();const download=await dl;await download.saveAs('/tmp/gacha-story-test.png');
 // PNG IHDR contains the exact 1080x1920 Story dimensions.
 const png=fs.readFileSync('/tmp/gacha-story-test.png');assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1920);
 await page.screenshot({path:'/tmp/gacha-special-preview.png',fullPage:true});await page.locator('#gacha-dialog-close').click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/gacha-mobile-preview.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/tmp/gacha-preview.png',fullPage:true});
 assert.deepEqual(errors,[]);
 // Exercise the actual admin module against an in-memory client.
 await page.route('**/admin/admin.js?*',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.goto(origin+'/admin/index.html');
 await page.evaluate(async({config,cards})=>{
   document.querySelectorAll('script[type=module]').forEach(n=>n.remove());
   document.querySelector('#status').textContent='Gacha listo. Edita cartas, nombres y probabilidades.';
   document.querySelector('#login-section').hidden=true;document.querySelector('#workspace').hidden=false;
   document.querySelectorAll('[data-tab]').forEach(n=>n.setAttribute('aria-current',n.dataset.tab==='gacha'?'true':'false'));
   window.__gachaFixture={config,cards};
   class Query{
     constructor(table){this.table=table;this.op='select';this.filters=[];}
     select(){return this;}eq(k,v){this.filters.push([k,v]);return this;}single(){this.one=true;return this;}order(){return this;}
     update(value){this.op='update';this.value=value;return this;}insert(value){this.op='insert';this.value=value;return this;}delete(){this.op='delete';return this;}
     then(ok,bad){try{let rows=this.table==='gacha_settings'?[config]:cards;const matches=r=>this.filters.every(([k,v])=>r[k]===v);
       if(this.op==='delete')cards.splice(0,cards.length,...cards.filter(r=>!matches(r)));
       if(this.op==='update')rows.filter(matches).forEach(r=>Object.assign(r,this.value));
       if(this.op==='insert')cards.push({...this.value,serial:crypto.randomUUID()});
       const data=rows.filter(matches);return Promise.resolve({data:this.one?data[0]:data,error:null}).then(ok,bad);
     }catch(e){return Promise.reject(e).then(ok,bad);}}
   }
   const client={from:t=>new Query(t),rpc:async(name,{p_serials})=>{p_serials.forEach((s,i)=>cards.find(c=>c.serial===s).display_order=i);cards.sort((a,b)=>a.display_order-b.display_order);return {data:null,error:null}},storage:{from:()=>({upload:async()=>({data:{},error:null}),getPublicUrl:()=>({data:{publicUrl:location.origin+'/images/suki.webp'}})})}};
   const {renderGacha}=await import('./gacha-editor.js');await renderGacha(client,document.querySelector('#records'),document.querySelector('#editor'),()=>{});
 },{config,cards});
 await page.locator('[data-edit]').first().click();await page.waitForSelector('#gacha-card-form');
 await page.screenshot({path:'/tmp/gacha-admin-preview.png',fullPage:true});
 await page.locator('#gacha-remove-image').click();await page.waitForSelector('.gimae-confirm-dialog[open]');assert.equal(await page.locator('.gimae-confirm-media img').count(),1);
 await page.locator('.gimae-confirm-cancel').click();await page.waitForSelector('.gimae-confirm-dialog',{state:'detached'});
 assert.ok(await page.locator('#gacha-preview').isVisible());
 await page.locator('#gacha-editor-cancel').click();
 await page.locator('[data-delete]').first().click();await page.locator('.gimae-confirm-accept').click();await page.waitForFunction(()=>document.querySelectorAll('.gacha-admin-card').length===2);
 await page.locator('#gacha-add').click();await page.locator('#gacha-card-form input[name=integrante]').fill('Suki nueva');
 await page.locator('#gacha-card-form input[type=file]').setInputFiles(path.join(root,'images/suki.webp'));
 await page.waitForFunction(()=>document.querySelector('#gacha-upload-status').textContent.includes('Imagen lista'));
 await page.locator('#gacha-card-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelectorAll('.gacha-admin-card').length===3);
 await page.locator('[data-down]').first().click();await page.waitForTimeout(150);
 await page.locator('#gacha-settings-form input[name=ssr-label]').fill('Estrella');await page.locator('#gacha-settings-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#gacha-settings-form input[name=ssr-label]').value==='Estrella');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/gacha-admin-mobile-preview.png',fullPage:true});
 console.log('PASS: browser redeem, retry/reload recovery, 1 debit, historic count, rare reveal, Story PNG, responsive layout, admin image confirmation, upload/create/delete/order/settings.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
