const editor=document.querySelector('#editor');

const MEMBER_PALETTE=[
  {key:'suki',match:/\bsuki\b/i,accent:'#e84694',on:'#ffffff'},
  {key:'usi',match:/\busi\b/i,accent:'#df4d62',on:'#ffffff'},
  {key:'vewe',match:/\bvewe\b/i,accent:'#c99a18',on:'#342600'},
  {key:'vali',match:/\bvali\b/i,accent:'#8f62bf',on:'#ffffff'}
];

function paletteFor(title=''){
  return MEMBER_PALETTE.find(item=>item.match.test(title))||{key:'general',accent:'#d84587',on:'#ffffff'};
}

function polish(card){
  if(card.dataset.variantPolished==='true')return;
  const title=card.querySelector('.merch-variant-head strong')?.textContent.trim()||'Variante';
  const palette=paletteFor(title);
  card.dataset.variantPolished='true';
  card.dataset.member=palette.key;
  card.style.setProperty('--variant-accent',palette.accent);
  card.style.setProperty('--variant-on-accent',palette.on);

  const save=card.querySelector('.merch-save-variant');
  if(save){
    save.setAttribute('aria-label',`Guardar cambios de la variante ${title}`);
    save.setAttribute('title',`Guardar solo los cambios de ${title}`);
  }

  const head=card.querySelector('.merch-variant-head');
  if(head&&!head.querySelector('.merch-variant-member-dot')){
    const dot=document.createElement('span');
    dot.className='merch-variant-member-dot';
    dot.setAttribute('aria-hidden','true');
    head.prepend(dot);
  }
}

function scan(){
  if(!editor)return;
  editor.querySelectorAll('.merch-variant-card').forEach(polish);
}

if(editor){
  const observer=new MutationObserver(scan);
  observer.observe(editor,{childList:true,subtree:true});
  scan();
}
