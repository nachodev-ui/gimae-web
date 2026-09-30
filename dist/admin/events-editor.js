const editor=document.querySelector('#editor');
const eventsTab=document.querySelector('[data-tab="events"]');
let scheduled=0;

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const isEventsActive=()=>eventsTab?.getAttribute('aria-current')==='true';
const fieldLabel=(control,title,hint)=>{
  const label=control?.closest('label');
  if(!label)return null;
  label.classList.add('events-field');
  const titleNode=el('span','events-field-label',title);
  const hintNode=hint?el('small','events-field-hint',hint):null;
  label.replaceChildren(titleNode,control);
  if(hintNode)label.append(hintNode);
  return label;
};

function splitCanonical(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!match)return {date:'',time:''};
  return {date:`${match[3]}/${match[2]}/${match[1]}`,time:`${match[4]}:${match[5]}`};
}

function dateParts(value){
  const match=String(value||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!match)return null;
  const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);
  const date=new Date(year,month-1,day);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
  return {day,month,year};
}

function formatDateInput(input){
  const digits=input.value.replace(/\D/g,'').slice(0,8);
  input.value=[digits.slice(0,2),digits.slice(2,4),digits.slice(4,8)].filter(Boolean).join('/');
}

function buildDateTimeField(original,{title,hint,required=false}){
  const originalLabel=original.closest('label');
  const current=splitCanonical(original.value);
  original.type='hidden';
  original.removeAttribute('required');
  original.classList.add('events-canonical-datetime');

  const wrap=el('div','events-datetime-field');
  const heading=el('div','events-datetime-heading');
  heading.append(el('strong','',title),el('small','',hint));

  const controls=el('div','events-datetime-controls');
  const dateLabel=el('label','events-mini-field');
  const dateName=el('span','','Fecha');
  const dateInput=document.createElement('input');
  dateInput.type='text';
  dateInput.inputMode='numeric';
  dateInput.autocomplete='off';
  dateInput.placeholder='dd/mm/aaaa';
  dateInput.maxLength=10;
  dateInput.value=current.date;
  dateInput.required=required;
  dateInput.setAttribute('aria-label',`${title}: fecha en formato día, mes y año`);
  dateLabel.append(dateName,dateInput);

  const timeLabel=el('label','events-mini-field');
  const timeName=el('span','','Hora');
  const timeInput=document.createElement('input');
  timeInput.type='time';
  timeInput.value=current.time;
  timeInput.required=required;
  timeInput.setAttribute('aria-label',`${title}: hora`);
  timeLabel.append(timeName,timeInput);
  controls.append(dateLabel,timeLabel);

  originalLabel?.replaceWith(wrap);
  wrap.append(heading,controls,original);

  const validate=()=>{
    const rawDate=dateInput.value.trim();
    const rawTime=timeInput.value.trim();
    dateInput.setCustomValidity('');
    timeInput.setCustomValidity('');

    if(required&&!rawDate)dateInput.setCustomValidity('Ingresa la fecha en formato dd/mm/aaaa.');
    else if(rawDate&&!dateParts(rawDate))dateInput.setCustomValidity('Usa una fecha válida en formato dd/mm/aaaa.');

    if(required&&!rawTime)timeInput.setCustomValidity('Ingresa la hora del evento.');
    if(!required&&((rawDate&&!rawTime)||(!rawDate&&rawTime))){
      if(rawDate&&!rawTime)timeInput.setCustomValidity('Completa la hora o deja fecha y hora vacías.');
      if(!rawDate&&rawTime)dateInput.setCustomValidity('Completa la fecha o deja fecha y hora vacías.');
    }

    const parts=dateParts(rawDate);
    if(parts&&rawTime){
      const yyyy=String(parts.year).padStart(4,'0');
      const mm=String(parts.month).padStart(2,'0');
      const dd=String(parts.day).padStart(2,'0');
      original.value=`${yyyy}-${mm}-${dd}T${rawTime}`;
    }else original.value='';

    return dateInput.checkValidity()&&timeInput.checkValidity();
  };

  dateInput.addEventListener('input',()=>{formatDateInput(dateInput);validate()});
  dateInput.addEventListener('blur',validate);
  timeInput.addEventListener('input',validate);
  timeInput.addEventListener('blur',validate);
  validate();

  return {wrap,dateInput,timeInput,original,validate};
}

function buildSwitch(label,input){
  label.className='events-switch-field';
  input.className='events-switch-input';
  input.setAttribute('role','switch');
  const copy=el('span','events-switch-copy');
  copy.append(el('strong','','Publicar evento en la web'),el('small','','Actívalo cuando quieras que esta fecha aparezca públicamente en el sitio.'));
  const track=el('span','events-switch-track');
  const thumb=el('span','events-switch-thumb');
  const state=el('span','events-switch-state');
  track.append(thumb,state);
  const refresh=()=>{state.textContent=input.checked?'ON':'OFF';input.setAttribute('aria-checked',String(input.checked))};
  input.addEventListener('change',refresh);
  refresh();
  label.replaceChildren(copy,input,track);
  return label;
}

function section(icon,title,subtitle,className=''){
  const node=el('section',`events-form-section ${className}`.trim());
  const head=el('div','events-form-section-head');
  const badge=el('span','events-form-section-icon',icon);badge.setAttribute('aria-hidden','true');
  const copy=el('div');copy.append(el('h3','',title),el('p','',subtitle));
  head.append(badge,copy);node.append(head);
  return node;
}

function enhanceEditor(){
  if(!editor||!isEventsActive())return;
  const form=editor.querySelector('#record-form');
  if(!form||form.dataset.eventsEnhanced==='true'||!form.querySelector('[name="starts_at"]'))return;
  form.dataset.eventsEnhanced='true';
  editor.classList.add('events-editor-mode');

  const oldTitle=editor.querySelector(':scope > h2');
  const editing=/^Editar/i.test(oldTitle?.textContent||'');
  const hero=el('div','events-editor-hero');
  const heroCopy=el('div','events-editor-hero-copy');
  heroCopy.append(
    el('p','events-editor-eyebrow',editing?'EDITAR FECHA':'NUEVA FECHA'),
    el('h2','',editing?'Ajusta los detalles del evento ♡':'Diseña la próxima fecha ♡'),
    el('p','events-editor-lede',editing?'Actualiza la información sin perder de vista cómo se presentará en la agenda.':'Completa la información esencial para que la fecha quede clara, bonita y lista para publicar.')
  );
  const ticket=el('div','events-editor-ticket');
  ticket.setAttribute('aria-hidden','true');
  ticket.append(el('span','','GIMAE! EVENT'),el('strong','','☆'),el('small','','BACKSTAGE PASS'));
  hero.append(heroCopy,ticket);
  oldTitle?.replaceWith(hero);

  const titleInput=form.querySelector('[name="title"]');
  const descriptionInput=form.querySelector('[name="description"]');
  const venueInput=form.querySelector('[name="venue"]');
  const startInput=form.querySelector('[name="starts_at"]');
  const endInput=form.querySelector('[name="ends_at"]');
  const urlInput=form.querySelector('[name="url"]');
  const activeInput=form.querySelector('[name="active"]');
  const actions=form.querySelector('.admin-actions');

  titleInput.placeholder='Ej. GIMAE! en Festival Idol';
  descriptionInput.placeholder='Cuenta qué ocurrirá, qué puede esperar el público y cualquier detalle importante…';
  venueInput.placeholder='Ej. Teatro, café, centro cultural o comuna';
  urlInput.placeholder='https://…';

  const titleLabel=fieldLabel(titleInput,'Nombre del evento','Será el nombre principal que verás en la agenda.');
  const descriptionLabel=fieldLabel(descriptionInput,'Descripción','Resume la actividad con la información que realmente necesita el público.');
  const venueLabel=fieldLabel(venueInput,'Lugar','Puedes usar un recinto, dirección breve o indicar “Por confirmar”.');
  const urlLabel=fieldLabel(urlInput,'Enlace relacionado','Opcional · entradas, inscripción, publicación o información oficial.');

  const info=section('✦','Información principal','La identidad de la fecha: nombre, contexto y lugar.','is-primary');
  const infoGrid=el('div','events-form-stack');infoGrid.append(titleLabel,descriptionLabel,venueLabel);info.append(infoGrid);

  const schedule=section('⌚','Fecha y horario','Formato local: día / mes / año.','is-schedule');
  const dates=el('div','events-date-grid');
  const start=buildDateTimeField(startInput,{title:'Inicio',hint:'Obligatorio · dd/mm/aaaa',required:true});
  const end=buildDateTimeField(endInput,{title:'Fin',hint:'Opcional · úsalo si la actividad tiene hora de cierre.'});
  dates.append(start.wrap,end.wrap);schedule.append(dates);

  const publish=section('♡','Publicación','Controla el acceso público y agrega un enlace si corresponde.','is-publish');
  const publishGrid=el('div','events-publish-grid');
  const activeLabel=activeInput?.closest('label');
  const switchField=activeLabel&&activeInput?buildSwitch(activeLabel,activeInput):null;
  publishGrid.append(urlLabel);
  if(switchField)publishGrid.append(switchField);
  publish.append(publishGrid);

  actions?.classList.add('events-form-actions');
  const saveButton=actions?.querySelector('button[type="submit"]');
  if(saveButton)saveButton.textContent=editing?'Guardar cambios':'Crear evento';
  const actionNote=el('p','events-action-note',editing?'Los cambios se reflejarán al guardar.':'Podrás volver a editar todos estos datos después.');
  if(actions)actions.prepend(actionNote);

  form.replaceChildren(info,schedule,publish,...(actions?[actions]:[]));

  form.addEventListener('submit',event=>{
    const validStart=start.validate();
    const validEnd=end.validate();
    if(validStart&&validEnd)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    form.reportValidity();
  },true);
}

function scheduleEnhance(){
  cancelAnimationFrame(scheduled);
  scheduled=requestAnimationFrame(()=>{
    if(!isEventsActive()){editor?.classList.remove('events-editor-mode');return}
    enhanceEditor();
  });
}

if(editor&&eventsTab){
  new MutationObserver(scheduleEnhance).observe(editor,{childList:true,subtree:false});
  eventsTab.addEventListener('click',scheduleEnhance);
  scheduleEnhance();
}
