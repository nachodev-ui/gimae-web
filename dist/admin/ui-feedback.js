(function(){
  const TONES={
    success:{icon:'✓',label:'LISTO'},
    error:{icon:'!',label:'ALGO SALIÓ MAL'},
    warning:{icon:'✦',label:'ATENCIÓN'},
    danger:{icon:'×',label:'ACCIÓN IMPORTANTE'},
    info:{icon:'♡',label:'GIMAE! TEAM DESK'}
  };
  let toastStack=null,dialogSequence=0;
  const previousFocus=()=>document.activeElement instanceof HTMLElement?document.activeElement:null;

  function ensureToastStack(){
    if(toastStack?.isConnected)return toastStack;
    toastStack=document.createElement('div');
    toastStack.className='gimae-toast-stack';
    toastStack.setAttribute('aria-label','Notificaciones del panel');
    document.body.append(toastStack);
    return toastStack;
  }

  function toast(options={}){
    if(typeof options==='string')options={message:options};
    const tone=TONES[options.tone]?options.tone:'info';
    const meta=TONES[tone];
    const item=document.createElement('section');
    item.className=`gimae-toast is-${tone}`;
    item.setAttribute('role',tone==='error'||tone==='danger'?'alert':'status');
    item.setAttribute('aria-live',tone==='error'||tone==='danger'?'assertive':'polite');

    const icon=document.createElement('span');icon.className='gimae-toast-icon';icon.setAttribute('aria-hidden','true');icon.textContent=options.icon||meta.icon;
    const copy=document.createElement('div');copy.className='gimae-toast-copy';
    const eyebrow=document.createElement('span');eyebrow.className='gimae-toast-eyebrow';eyebrow.textContent=options.eyebrow||meta.label;
    const title=document.createElement('strong');title.textContent=options.title||'';
    const message=document.createElement('p');message.textContent=options.message||'';
    copy.append(eyebrow);
    if(options.title)copy.append(title);
    if(options.message)copy.append(message);

    const close=document.createElement('button');close.type='button';close.className='gimae-toast-close';close.setAttribute('aria-label','Cerrar notificación');close.textContent='×';
    item.append(icon,copy,close);
    ensureToastStack().append(item);
    requestAnimationFrame(()=>item.classList.add('is-visible'));

    let timer=null;
    const dismiss=()=>{
      if(!item.isConnected)return;
      clearTimeout(timer);item.classList.remove('is-visible');item.classList.add('is-leaving');
      setTimeout(()=>item.remove(),180);
    };
    close.addEventListener('click',dismiss);
    const duration=options.persistent?0:(Number(options.duration)||4600);
    if(duration>0)timer=setTimeout(dismiss,duration);

    return {
      dismiss,
      update(next={}){
        if(next.title!==undefined){title.textContent=next.title;if(!title.isConnected)copy.insertBefore(title,message)}
        if(next.message!==undefined){message.textContent=next.message;if(!message.isConnected)copy.append(message)}
      }
    };
  }

  function dialogBase(options={},extraClass=''){
    const tone=TONES[options.tone]?options.tone:'danger';
    const meta=TONES[tone];
    const id=`gimae-dialog-${++dialogSequence}`;
    const dialog=document.createElement('dialog');dialog.className=`gimae-confirm-dialog is-${tone}${extraClass?` ${extraClass}`:''}`;
    const shell=document.createElement('div');shell.className='gimae-confirm-shell';
    const top=document.createElement('div');top.className='gimae-confirm-top';
    const icon=document.createElement('span');icon.className='gimae-confirm-icon';icon.setAttribute('aria-hidden','true');icon.textContent=options.icon||meta.icon;
    const heading=document.createElement('div');heading.className='gimae-confirm-heading';
    const eyebrow=document.createElement('span');eyebrow.className='gimae-confirm-eyebrow';eyebrow.textContent=options.eyebrow||meta.label;
    const title=document.createElement('h2');title.id=`${id}-title`;title.textContent=options.title||'¿Confirmar acción?';
    heading.append(eyebrow,title);top.append(icon,heading);
    const message=document.createElement('p');message.id=`${id}-message`;message.className='gimae-confirm-message';message.textContent=options.message||'';
    shell.append(top,message);
    if(options.image?.src){
      const media=document.createElement('figure');media.className='gimae-confirm-media';
      const preview=document.createElement('img');preview.src=options.image.src;preview.alt=options.image.alt||'Vista previa del elemento seleccionado';
      preview.addEventListener('error',()=>media.remove(),{once:true});media.append(preview);
      if(options.image.caption){const caption=document.createElement('figcaption');caption.textContent=options.image.caption;media.append(caption)}
      shell.append(media);
    }
    if(options.detail){const detail=document.createElement('div');detail.className='gimae-confirm-detail';detail.textContent=options.detail;shell.append(detail)}
    dialog.setAttribute('aria-labelledby',title.id);
    if(options.message)dialog.setAttribute('aria-describedby',message.id);
    return {dialog,shell,tone};
  }

  function confirmDialog(options={}){
    const restore=previousFocus();
    return new Promise(resolve=>{
      const {dialog,shell,tone}=dialogBase(options);
      const actions=document.createElement('div');actions.className='gimae-confirm-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='gimae-confirm-cancel';cancel.textContent=options.cancelText||'Cancelar';
      const accept=document.createElement('button');accept.type='button';accept.className='gimae-confirm-accept';accept.textContent=options.confirmText||'Confirmar';
      if(tone==='danger')accept.classList.add('is-danger');
      actions.append(cancel,accept);shell.append(actions);dialog.append(shell);document.body.append(dialog);

      let settled=false;
      const finish=value=>{
        if(settled)return;settled=true;
        dialog.classList.add('is-closing');
        setTimeout(()=>{if(dialog.open)dialog.close();dialog.remove();restore?.focus?.({preventScroll:true});resolve(value)},150);
      };
      cancel.addEventListener('click',()=>finish(false));
      accept.addEventListener('click',()=>finish(true));
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)});
      dialog.addEventListener('click',event=>{if(event.target===dialog)finish(false)});
      dialog.showModal();
      requestAnimationFrame(()=>dialog.classList.add('is-visible'));
      (tone==='danger'?cancel:accept).focus();
    });
  }

  function inputDialog(options={}){
    const restore=previousFocus();
    return new Promise(resolve=>{
      const settings={tone:'info',title:'Escribe un valor',...options};
      const {dialog,shell}=dialogBase(settings,'gimae-input-dialog');
      const field=document.createElement('label');field.className='gimae-prompt-field';
      const label=document.createElement('span');label.textContent=settings.label||'Valor';
      const input=document.createElement('input');input.type=settings.type||'text';input.value=settings.value||'';input.placeholder=settings.placeholder||'';input.autocomplete='off';
      if(settings.inputMode)input.inputMode=settings.inputMode;
      field.append(label,input);shell.append(field);
      const actions=document.createElement('div');actions.className='gimae-confirm-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='gimae-confirm-cancel';cancel.textContent=settings.cancelText||'Cancelar';
      const accept=document.createElement('button');accept.type='button';accept.className='gimae-confirm-accept';accept.textContent=settings.confirmText||'Aceptar';
      actions.append(cancel,accept);shell.append(actions);dialog.append(shell);document.body.append(dialog);

      let settled=false;
      const finish=value=>{
        if(settled)return;settled=true;
        dialog.classList.add('is-closing');
        setTimeout(()=>{if(dialog.open)dialog.close();dialog.remove();restore?.focus?.({preventScroll:true});resolve(value)},150);
      };
      cancel.addEventListener('click',()=>finish(null));
      accept.addEventListener('click',()=>finish(input.value.trim()));
      input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();accept.click()}});
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null)});
      dialog.addEventListener('click',event=>{if(event.target===dialog)finish(null)});
      dialog.showModal();
      requestAnimationFrame(()=>dialog.classList.add('is-visible'));
      input.focus();input.select();
    });
  }

  window.GIMAE_UI={toast,confirm:confirmDialog,input:inputDialog};
})();
