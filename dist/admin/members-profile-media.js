const profileMediaRoot=document.querySelector('#editor');
const profileMediaTab=document.querySelector('[data-tab="members"]');
const profileMediaSettings=window.GIMAE_SUPABASE||{};
const profileMediaUI=window.GIMAE_UI;
const PROFILE_BUCKET='gimae-members';
const PROFILE_MAX=8*1024*1024;
const PROFILE_TYPES=new Set(['image/png','image/jpeg','image/webp']);
let profileClientPromise=null;

const pmEl=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const pmWord=value=>String(value??'').trim();
const pmActive=()=>profileMediaTab?.getAttribute('aria-current')==='true';

async function profileClient(){
  if(profileClientPromise)return profileClientPromise;
  profileClientPromise=(async()=>{
    if(!profileMediaSettings.url||!profileMediaSettings.publishableKey)throw new Error('Supabase no está configurado.');
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    const client=createClient(profileMediaSettings.url,profileMediaSettings.publishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(!data?.session)throw new Error('La sesión del panel ya no está disponible.');
    return client;
  })();
  return profileClientPromise;
}

function validateProfileImage(file){
  if(!file?.size)throw new Error('Selecciona una imagen antes de continuar.');
  if(file.size>PROFILE_MAX)throw new Error('El retrato supera 8 MB. Usa una imagen más liviana.');
  if(!PROFILE_TYPES.has(file.type))throw new Error('Usa PNG, JPG o WebP para el retrato.');
}
function extensionFor(file){return {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type]}
function cleanSocialUrl(value,label){
  const raw=pmWord(value);if(!raw)return null;
  try{const url=new URL(raw);if(url.protocol!=='https:')throw new Error();return url.href}catch{throw new Error(`${label}: usa una URL completa que comience con https://`)}
}
function publicStoragePath(url){
  const prefix=`${profileMediaSettings.url}/storage/v1/object/public/${PROFILE_BUCKET}/`;
  if(!String(url||'').startsWith(prefix))return null;
  const path=decodeURIComponent(String(url).slice(prefix.length));
  return path.startsWith('members/')?path:null;
}
async function removeProfileObject(client,url){
  const path=publicStoragePath(url);if(!path)return;
  const {error}=await client.storage.from(PROFILE_BUCKET).remove([path]);if(error)throw error;
}
async function uploadProfileImage(client,file,memberId){
  validateProfileImage(file);
  const path=`members/${memberId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const {error}=await client.storage.from(PROFILE_BUCKET).upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw error;
  return {path,url:client.storage.from(PROFILE_BUCKET).getPublicUrl(path).data.publicUrl};
}

function ensureSocialInput(form,name){
  let input=form.elements[name];if(input)return input;
  const label=document.createElement('label');label.hidden=true;
  input=document.createElement('input');input.type='url';input.name=name;input.autocomplete='url';
  label.append(input);form.append(label);return input;
}
function socialCard(title,icon,labelText,input,help,optional=true){
  const card=pmEl('div','member-extra-social-card');
  const brand=pmEl('span','member-extra-social-brand',icon);brand.setAttribute('aria-hidden','true');
  const content=pmEl('div','member-extra-social-content');
  const head=pmEl('div','member-extra-social-head');head.append(pmEl('strong','',title),pmEl('span','',optional?'Opcional':'Perfil público'));
  const field=pmEl('label','member-extra-social-field');field.append(pmEl('span','',labelText),input,pmEl('small','',help));
  content.append(head,field);card.append(brand,content);return card;
}

async function loadExistingMember(form,state){
  if(!form.elements.id?.readOnly)return;
  try{
    const client=await profileClient();
    const {data,error}=await client.from('members').select('socials,photo_url').eq('id',form.elements.id.value).maybeSingle();
    if(error)throw error;
    state.originalPhotoUrl=data?.photo_url||form.elements.photo_url?.value||null;
    state.originalSocials=data?.socials||{};
    if(form.elements.tiktok&&!form.elements.tiktok.value)form.elements.tiktok.value=data?.socials?.tiktok||'';
    if(form.elements.x&&!form.elements.x.value)form.elements.x.value=data?.socials?.x||data?.socials?.twitter||'';
  }catch(error){console.warn('No se pudieron precargar redes adicionales:',error)}
}

function installPortraitUploader(form,state){
  const controls=form.querySelector('.member-editor-visual-controls');
  const photoLabel=form.elements.photo_url?.closest('label');
  const previewImage=form.querySelector('.member-editor-photo-frame img');
  const previewFallback=form.querySelector('.member-editor-photo-fallback');
  if(!controls||!photoLabel||!form.elements.photo_url)return;
  photoLabel.classList.add('member-photo-url-hidden');

  const panel=pmEl('div','member-photo-uploader');
  const heading=pmEl('div','member-photo-uploader-head');
  const copy=pmEl('div');copy.append(pmEl('strong','','Retrato de la integrante'),pmEl('small','','Sube la foto aquí. El panel la guardará automáticamente en Supabase Storage al guardar el perfil.'));
  const status=pmEl('span','member-photo-upload-status','Foto actual');heading.append(copy,status);

  const drop=pmEl('div','member-photo-drop');drop.tabIndex=0;drop.setAttribute('role','button');drop.setAttribute('aria-label','Seleccionar un nuevo retrato');
  const icon=pmEl('span','member-photo-drop-icon','＋');icon.setAttribute('aria-hidden','true');
  const dropCopy=pmEl('div');dropCopy.append(pmEl('strong','','Arrastra una foto aquí'),pmEl('small','','o selecciónala desde tu computador o celular · PNG, JPG o WebP · máximo 8 MB'));drop.append(icon,dropCopy);

  const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.className='member-photo-file';input.hidden=true;
  const actions=pmEl('div','member-photo-actions');
  const choose=pmEl('button','member-photo-primary','Elegir nueva foto');choose.type='button';
  const clear=pmEl('button','member-photo-secondary','Cancelar selección');clear.type='button';clear.hidden=true;
  const remove=pmEl('button','member-photo-secondary is-danger','Quitar retrato');remove.type='button';
  actions.append(choose,clear,remove,input);panel.append(heading,drop,actions);controls.prepend(panel);

  let objectUrl=null;
  const revoke=()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}};
  const showCurrent=()=>{
    revoke();state.pendingFile=null;state.removePortrait=false;clear.hidden=true;status.textContent='Foto actual';
    const url=pmWord(form.elements.photo_url.value);
    if(previewImage&&url){previewImage.hidden=false;previewImage.src=url;previewFallback&&(previewFallback.hidden=true)}
  };
  const useFile=file=>{
    try{validateProfileImage(file)}catch(error){profileMediaUI?.toast?.({tone:'warning',title:'Retrato no válido',message:error.message});return}
    revoke();state.pendingFile=file;state.removePortrait=false;objectUrl=URL.createObjectURL(file);clear.hidden=false;status.textContent='Nueva foto pendiente';
    if(previewImage){previewImage.hidden=false;previewImage.src=objectUrl;previewImage.alt=`Vista previa de ${file.name}`;previewFallback&&(previewFallback.hidden=true)}
  };
  const markRemove=()=>{revoke();state.pendingFile=null;state.removePortrait=true;clear.hidden=false;status.textContent='Se quitará al guardar';if(previewImage){previewImage.hidden=true;previewImage.removeAttribute('src')}if(previewFallback)previewFallback.hidden=false};
  const pick=()=>input.click();
  choose.addEventListener('click',pick);drop.addEventListener('click',pick);
  drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pick()}});
  input.addEventListener('change',()=>{const file=input.files?.[0];if(file)useFile(file)});
  clear.addEventListener('click',showCurrent);remove.addEventListener('click',markRemove);
  drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('is-over')});
  drop.addEventListener('dragleave',()=>drop.classList.remove('is-over'));
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('is-over');const file=event.dataTransfer.files?.[0];if(file)useFile(file)});
  state.cleanup=()=>revoke();
}

function installSocialNetworks(form,state){
  const section=form.querySelector('.member-editor-social-card')?.parentElement;
  if(!section)return;
  const tiktok=ensureSocialInput(form,'tiktok');
  const x=ensureSocialInput(form,'x');
  const grid=pmEl('div','member-extra-socials');
  grid.append(
    socialCard('TikTok','♪','Enlace de TikTok',tiktok,'Ej.: https://www.tiktok.com/@usuario'),
    socialCard('X (Twitter)','𝕏','Enlace de X',x,'Ej.: https://x.com/usuario')
  );
  section.append(grid);
  void loadExistingMember(form,state);
}

async function saveMemberProfile(event,form,state){
  event.preventDefault();event.stopImmediatePropagation();
  if(!form.reportValidity())return;
  const button=form.querySelector('[type="submit"]');const original=button?.textContent;
  if(button){button.disabled=true;button.textContent='Guardando…'}
  const status=document.querySelector('#status');if(status)status.textContent='Guardando perfil…';
  let uploaded=null;
  try{
    const client=await profileClient();
    const fd=new FormData(form);
    const id=pmWord(fd.get('id'));if(!id)throw new Error('El perfil necesita un código interno.');
    const instagram=cleanSocialUrl(fd.get('instagram'),'Instagram');
    const tiktok=cleanSocialUrl(fd.get('tiktok'),'TikTok');
    const x=cleanSocialUrl(fd.get('x'),'X');
    const socials={...(state.originalSocials||{})};
    delete socials.twitter;
    for(const [key,value] of Object.entries({instagram,tiktok,x})){if(value)socials[key]=value;else delete socials[key]}

    let photoUrl=state.removePortrait?null:(pmWord(form.elements.photo_url?.value)||null);
    if(state.pendingFile){uploaded=await uploadProfileImage(client,state.pendingFile,id);photoUrl=uploaded.url}
    const data={
      id,
      name:pmWord(fd.get('name')),
      biography:pmWord(fd.get('biography'))||null,
      handle:pmWord(fd.get('handle')),
      photo_url:photoUrl,
      accent:pmWord(fd.get('accent')),
      color:pmWord(fd.get('color')),
      color_label:pmWord(fd.get('color_label')),
      display_order:Number(fd.get('display_order'))||0,
      socials
    };
    const editing=Boolean(form.elements.id?.readOnly);
    const request=editing?client.from('members').update(data).eq('id',id).select('*'):client.from('members').insert(data).select('*');
    const {data:saved,error}=await request;if(error)throw error;if(!saved?.length)throw new Error('No se guardó el perfil. Verifica tus permisos.');
    if((uploaded||state.removePortrait)&&state.originalPhotoUrl&&state.originalPhotoUrl!==photoUrl){
      try{await removeProfileObject(client,state.originalPhotoUrl)}catch(error){console.warn('El perfil se guardó, pero no se pudo limpiar el retrato anterior:',error)}
    }
    state.cleanup?.();
    profileMediaUI?.toast?.({tone:'success',title:'Perfil guardado',message:`Se actualizó “${data.name||id}” correctamente.`});
    if(status)status.textContent='Cambios guardados.';
    profileMediaTab?.click();
  }catch(error){
    if(uploaded){try{const client=await profileClient();await client.storage.from(PROFILE_BUCKET).remove([uploaded.path])}catch{}}
    if(status)status.textContent=`No se pudo guardar: ${error.message}`;
    profileMediaUI?.toast?.({tone:'error',title:'No se pudo guardar el perfil',message:error.message});
  }finally{if(button?.isConnected){button.disabled=false;button.textContent=original||'Guardar perfil'}}
}

function enhanceProfileMedia(form){
  if(form.dataset.profileMedia==='true'||!pmActive()||form.dataset.memberStudio!=='true')return;
  form.dataset.profileMedia='true';
  const state={pendingFile:null,removePortrait:false,originalPhotoUrl:form.elements.photo_url?.value||null,originalSocials:{},cleanup:null};
  installSocialNetworks(form,state);
  installPortraitUploader(form,state);
  form.addEventListener('submit',event=>saveMemberProfile(event,form,state),{capture:true});
}
function scanProfileMedia(){
  if(!profileMediaRoot||!pmActive())return;
  const form=profileMediaRoot.querySelector('#record-form[data-member-studio="true"]');if(form)enhanceProfileMedia(form);
}
if(profileMediaRoot&&profileMediaTab){
  const observer=new MutationObserver(()=>requestAnimationFrame(scanProfileMedia));
  observer.observe(profileMediaRoot,{childList:true,subtree:true});
  profileMediaTab.addEventListener('click',()=>requestAnimationFrame(scanProfileMedia));
  scanProfileMedia();
}
