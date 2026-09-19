const $ = (selector) => document.querySelector(selector);
const config = window.GIMAE;
const platformLabels = { instagram: 'Instagram', x: 'X / Twitter', spotify: 'Spotify' };
const icons = {
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 3h5l11 18h-5L4 3Zm0 18L20 3"/></svg>',
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
    const el = document.createElement(url ? 'a' : 'span');
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
  const bio = document.createElement('p'); bio.className = 'dialog-bio'; bio.textContent = member.bio || 'Cada estrella tiene una historia. Muy pronto podrás conocer su nombre, su personalidad y lo que la hace brillar.';
  content.append(label, title, bio);
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
  button.querySelector('.member-caption').textContent = member.name ? 'Conoce su historia' : 'Presentación muy pronto';
  if (safeUrl(member.photo)) { const img = document.createElement('img'); img.src = safeUrl(member.photo); img.alt = ''; img.loading = 'lazy'; button.querySelector('.member-visual').replaceChildren(img); }
  button.addEventListener('click', () => showMember(member, button)); $('#member-grid').append(button);
});
makeSocials($('#group-socials'), config.socials);
if (Object.values(config.socials).some((value) => value && /^https:\/\//i.test(value) && safeUrl(value))) $('#social-note').hidden = true;
$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close(); } });
const menu = $('.menu-toggle');
function closeMenu() { menu.setAttribute('aria-expanded', 'false'); $('#navigation').classList.remove('open'); }
menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); $('#navigation').classList.toggle('open', open); });
$('#navigation').querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
document.addEventListener('click', e => { if (!e.target.closest('.header')) closeMenu(); });
$('#year').textContent = new Date().getFullYear();
