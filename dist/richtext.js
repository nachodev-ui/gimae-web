(function(){
  const INLINE_TOKEN=/(\*\*[^*\n]+?\*\*|==[^=\n]+?==|~~[^~\n]+?~~|\*[^*\n]+?\*|\[\[(?:pink|red|yellow|purple|blue|mint|ja)\|[^\]\n]+?\]\]|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  const COLOR_CLASS={pink:'pink',red:'red',yellow:'yellow',purple:'purple',blue:'blue',mint:'mint'};
  function safeUrl(value){
    try{const url=new URL(value,location.href);return ['https:','http:'].includes(url.protocol)?url.href:null}catch{return null}
  }
  function appendInline(target,text){
    let last=0;
    for(const match of String(text??'').matchAll(INLINE_TOKEN)){
      if(match.index>last)target.append(document.createTextNode(text.slice(last,match.index)));
      const token=match[0];let node;
      if(token.startsWith('**')){node=document.createElement('strong');node.textContent=token.slice(2,-2)}
      else if(token.startsWith('==')){node=document.createElement('mark');node.textContent=token.slice(2,-2)}
      else if(token.startsWith('~~')){node=document.createElement('s');node.textContent=token.slice(2,-2)}
      else if(token.startsWith('*')){node=document.createElement('em');node.textContent=token.slice(1,-1)}
      else if(token.startsWith('[[')){
        const parsed=token.match(/^\[\[(pink|red|yellow|purple|blue|mint|ja)\|([\s\S]+)\]\]$/);
        node=document.createElement('span');
        if(parsed?.[1]==='ja'){node.className='gimae-rt-ja';node.lang='ja'}
        else node.className=`gimae-rt-color gimae-rt-${COLOR_CLASS[parsed?.[1]]||'pink'}`;
        node.textContent=parsed?.[2]||token;
      }else{
        const parsed=token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        const href=safeUrl(parsed?.[2]);
        if(href){node=document.createElement('a');node.href=href;node.target='_blank';node.rel='noopener noreferrer';node.textContent=parsed[1]}
        else{node=document.createTextNode(parsed?.[1]||token)}
      }
      target.append(node);
      last=match.index+token.length;
    }
    if(last<text.length)target.append(document.createTextNode(text.slice(last)));
  }
  function fragment(content){
    const root=document.createDocumentFragment();
    const lines=String(content??'').replace(/\r/g,'').split('\n');
    let list=null,listType='';
    const endList=()=>{list=null;listType=''};
    const ensureList=type=>{
      if(list&&listType===type)return list;
      endList();list=document.createElement(type);list.className='gimae-rt-list';listType=type;root.append(list);return list;
    };
    for(const raw of lines){
      const line=raw.trimEnd();
      if(!line.trim()){endList();continue}
      if(/^---+$/.test(line.trim())){endList();const hr=document.createElement('hr');hr.className='gimae-rt-divider';root.append(hr);continue}
      if(line.startsWith('## ')){endList();const h=document.createElement('h4');h.className='gimae-rt-heading';appendInline(h,line.slice(3));root.append(h);continue}
      if(line.startsWith('> ')){endList();const q=document.createElement('blockquote');q.className='gimae-rt-quote';appendInline(q,line.slice(2));root.append(q);continue}
      if(line.startsWith('! ')){endList();const callout=document.createElement('aside');callout.className='gimae-rt-callout';const star=document.createElement('span');star.className='gimae-rt-callout-star';star.setAttribute('aria-hidden','true');star.textContent='✦';const body=document.createElement('div');appendInline(body,line.slice(2));callout.append(star,body);root.append(callout);continue}
      if(line.startsWith('♡ ')){endList();const note=document.createElement('p');note.className='gimae-rt-idol-note';appendInline(note,line.slice(2));root.append(note);continue}
      if(line.startsWith('- ')){const li=document.createElement('li');appendInline(li,line.slice(2));ensureList('ul').append(li);continue}
      const ordered=line.match(/^\d+\.\s+(.+)$/);
      if(ordered){const li=document.createElement('li');appendInline(li,ordered[1]);ensureList('ol').append(li);continue}
      endList();const p=document.createElement('p');appendInline(p,line);root.append(p);
    }
    return root;
  }
  function render(content,target){
    if(!target)return;
    target.classList.add('gimae-rich-content');
    target.replaceChildren(fragment(content));
  }
  function strip(content){
    return String(content??'')
      .replace(/^\s*(?:##|>|!|♡|-|\d+\.)\s+/gm,'')
      .replace(/^---+$/gm,' ')
      .replace(/\[\[(?:pink|red|yellow|purple|blue|mint|ja)\|([^\]]+)\]\]/g,'$1')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g,'$1')
      .replace(/(\*\*|==|~~|\*)/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }
  function stats(content){
    const text=strip(content),words=text?text.split(/\s+/).filter(Boolean).length:0;
    return {characters:text.length,words,minutes:Math.max(1,Math.ceil(words/210))};
  }
  window.GIMAE_RICH_TEXT={render,fragment,strip,stats};
})();