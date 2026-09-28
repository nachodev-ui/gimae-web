window.GIMAE_READY.then(() => {
const $ = (selector) => document.querySelector(selector);
const config = window.GIMAE;
const platformLabels = { instagram: 'Instagram', tiktok: 'TikTok', spotify: 'Spotify' };
const icons = {
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3v13a4.5 4.5 0 1 1-4-4.5M14 3c.5 3.5 2.5 5.5 6 5.5v3c-2.2 0-4.2-.8-6-2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spotify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M6.5 9c4-1.5 7-1.2 11 1M7.5 12c3-1 6-.7 9 1M8.5 15c2-.6 4-.4 7 .8" stroke-linecap="round"/></svg>'
};
function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const u = new URL(value, location.href); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
function makeSocials(target, socials, compact = false) {
  target.replaceChildren();
  Object.entries(platformLabels).forEach(([key, label]) => {
    const url = socials?.[key] && /^https:\/\//i.test(socials[key]) ? safeUrl(socials[key]) : null;
    if (!url) return;
    const el = document.createElement('a');
    el.className = 'social-link' + (url ? '' : ' unavailable') + (compact ? ' compact' : '');
    el.innerHTML = icons[key];
    const text = document.createElement('span'); text.textContent = label; el.append(text);
    if (url) { el.href = url; el.target = '_blank'; el.rel = 'noopener noreferrer'; el.setAttribute('aria-label', label + ' (se abre en otra pestaña)'); }
    else { const note = document.createElement('small'); note.textContent = 'Pronto'; el.append(note); }
    target.append(el);
  });
}
const dialog = $('#member-dialog');
function showMember(member, trigger) {
  const content = $('#dialog-content'); content.replaceChildren();
  dialog.dataset.color = member.color;
  const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = `GIMAE! / MEMBER ${member.id}`;
  const title = document.createElement('h2'); title.id = 'dialog-title'; title.textContent = member.name || `Member ${member.id}`;
  const bio = document.createElement('p'); bio.className = 'dialog-bio'; bio.textContent = member.handle;
  const color = document.createElement('p'); color.className = 'member-color'; color.textContent = member.colorLabel;
  content.append(label, title, color, bio);
  if (safeUrl(member.photo)) { const img = document.createElement('img'); img.src = safeUrl(member.photo); img.alt = member.name || `Integrante ${member.id}`; img.className = 'dialog-photo'; content.prepend(img); }
  const socials = document.createElement('div'); socials.className = 'member-socials'; makeSocials(socials, member.socials, true); content.append(socials);
  dialog.showModal(); document.body.classList.add('dialog-open');
  dialog.addEventListener('close', () => { document.body.classList.remove('dialog-open'); trigger.focus(); }, { once: true });
}
config.members.forEach((member) => {
  const button = document.createElement('button'); button.type = 'button'; button.className = `member-card ${member.color}`;
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-label', `Conocer a ${member.name || 'Member ' + member.id}`);
  button.innerHTML = `<span class="card-top"><span>GIMAE! MEMBER</span><span>✦</span></span><span class="member-visual"><span class="member-number">${member.id}</span><span class="member-symbol" aria-hidden="true">✧</span><span class="member-reveal">${member.name ? 'MEET THE MEMBER' : 'A LITTLE MYSTERY'}</span></span><span class="member-bottom"><span><strong></strong><span class="member-caption"></span></span><span class="member-plus" aria-hidden="true">+</span></span>`;
  button.querySelector('strong').textContent = member.name || `Member ${member.id}`;
  button.querySelector('.member-caption').textContent = member.colorLabel + ' · ' + member.handle;
  if (safeUrl(member.photo)) { const img = document.createElement('img'); img.src = safeUrl(member.photo); img.alt = ''; img.loading = 'lazy'; button.querySelector('.member-visual').replaceChildren(img); }
  button.addEventListener('click', () => showMember(member, button)); $('#member-grid').append(button);
});
makeSocials($('#group-socials'), config.socials);
if (Object.values(config.socials).some((value) => value && /^https:\/\//i.test(value) && safeUrl(value))) $('#social-note').hidden = true;
$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close(); } });
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const productGrid = $('#product-grid');
if (productGrid) config.merch.forEach(product => {
  const card = document.createElement('article'); card.className = `product-card ${product.color}`;
  const top = document.createElement('div'); top.className = 'product-top';
  const number = document.createElement('span'); number.className = 'product-number'; number.textContent = 'NO. ' + product.id;
  const star = document.createElement('span'); star.textContent = '✧'; star.setAttribute('aria-hidden', 'true'); top.append(number, star);
  const title = document.createElement('h3'); title.textContent = product.name;
  const note = document.createElement('p'); note.className = 'product-note'; note.textContent = product.note;
  const prices = document.createElement('div'); prices.className = 'product-prices';
  (product.prices || [{ value: product.price }]).forEach(price => {
    const row = document.createElement('div'); row.className = 'product-price';
    if (price.label) { const label = document.createElement('span'); label.textContent = price.label; row.append(label); }
    const value = document.createElement('strong'); value.textContent = money.format(price.value); row.append(value); prices.append(row);
  });
  card.append(top, title, note, prices);
  if (product.variants) {
    const colors = document.createElement('div'); colors.className = 'product-colors';
    config.members.forEach(member => { const color = document.createElement('span'); color.className = 'swatch ' + member.color; color.title = member.name + ' · ' + member.colorLabel; color.setAttribute('aria-label', color.title); colors.append(color); });
    card.append(colors);
  }
  productGrid.append(card);
});
const catalogDialog = $('#catalog-dialog');
const catalogImage = $('#catalog-image');
const catalogViews = { restored: { src: 'images/merch.webp', alt: 'Colección Gimae: poleras, lightstick, llaveros, chekis y postales.' }, original: { src: 'images/catalogo-original.webp', alt: 'Catálogo original de Gimae 2026 con diseños y precios en pesos chilenos.' } };
function setCatalogView(view) {
  const data = catalogViews[view]; catalogImage.src = data.src; catalogImage.alt = data.alt;
  document.querySelectorAll('[data-catalog-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.catalogView === view)));
}
$('#open-catalog').addEventListener('click', () => { setCatalogView('restored'); catalogDialog.showModal(); document.body.classList.add('dialog-open'); });
$('#close-catalog').addEventListener('click', () => catalogDialog.close());
catalogDialog.addEventListener('close', () => { document.body.classList.remove('dialog-open'); $('#open-catalog').focus(); });
catalogDialog.addEventListener('click', event => { if (event.target === catalogDialog) { const b = catalogDialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) catalogDialog.close(); } });
document.querySelectorAll('[data-catalog-view]').forEach(button => button.addEventListener('click', () => setCatalogView(button.dataset.catalogView)));

const sectionNote=(root,message)=>{const p=document.createElement('p');p.className='admin-hint';p.textContent=message;root.append(p)};
const eventSection=document.querySelector('#eventos .ticket-main');
if(config.events?.length){
  eventSection.querySelector('.status')?.remove();
  for(const event of config.events){const article=document.createElement('article');article.className='live-entry';
    const title=document.createElement('h3');title.textContent=event.title;
    const date=document.createElement('time');date.dateTime=event.starts_at;date.textContent=new Intl.DateTimeFormat('es-CL',{dateStyle:'long',timeStyle:'short',timeZone:'America/Santiago'}).format(new Date(event.starts_at));
    const description=document.createElement('p');description.textContent=[event.venue,event.description].filter(Boolean).join(' · ');
    article.append(title,date,description);if(event.url&&safeUrl(event.url)){const link=document.createElement('a');link.href=safeUrl(event.url);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver detalles ↗';article.append(link)}
    eventSection.append(article)
  }
} else if(config.backendStatus==='fallback') sectionNote(eventSection,'No pudimos consultar los eventos. Revisa nuestras redes para conocer novedades.');
const blogSection=document.querySelector('#blog');
if(config.posts?.length){
  blogSection.querySelector('.diary-card')?.remove();
  const list=document.createElement('div');list.className='live-posts';
  for(const post of config.posts){const article=document.createElement('article');article.className='diary-card live-entry';
    const body=document.createElement('div');body.className='diary-copy';
    const title=document.createElement('h3');title.textContent=post.title;
    const date=document.createElement('time');date.dateTime=post.published_at;date.textContent=new Intl.DateTimeFormat('es-CL',{dateStyle:'long',timeZone:'America/Santiago'}).format(new Date(post.published_at));
    const author=document.createElement('p');author.textContent=`Por ${post.author_name||'Equipo Gimae'}`;
    const content=document.createElement('p');content.textContent=post.content;body.append(title,date,author,content);
    if(post.cover_url){const image=document.createElement('img');image.loading='lazy';image.alt=`Portada de ${post.title}`;
      image.src=safeUrl(post.cover_url)||'';article.append(image)}
    for(const asset of config.postImages?.filter(im=>im.post_id===post.id)||[]){
      const isVideo=String(asset.alt||'').startsWith('video:')||/\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(String(asset.url||''));
      if(isVideo)continue;
      const image=document.createElement('img');image.loading='lazy';image.alt=asset.alt||`Imagen de ${post.title}`;image.src=safeUrl(asset.url)||'';body.append(image)
    }
    article.append(body);list.append(article)
  }blogSection.append(list)
} else if(config.backendStatus==='fallback') sectionNote(blogSection,'No pudimos consultar el blog. Vuelve a intentarlo más tarde.');
if(config.backendStatus==='fallback'&&window.GIMAE_SUPABASE?.publishableKey) sectionNote(document.querySelector('#merch'),'Se muestran los precios de respaldo. Confirma los valores y el stock por Instagram.');
});
