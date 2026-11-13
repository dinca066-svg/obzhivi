import {request,ensureSession} from './generation-client.mjs';
const KEY='obzhivi-pending-generation-v1';
export function generationPanel({canGenerate,snapshot}){
 const button=document.getElementById('generate-design'),status=document.getElementById('generation-status'),style=document.getElementById('design-style'),notes=document.getElementById('design-notes');
 let available=false,busy=false,pending=null;
 try{pending=JSON.parse(localStorage.getItem(KEY));}catch{}
 function refresh(){button.disabled=busy||!available||!canGenerate();style.disabled=busy;notes.disabled=busy;}
 async function recover(){
  if(!pending)return null;
  const {jobs}=await request('/api/generations');const existing=jobs.find(j=>j.requestId===pending.requestId);
  if(existing){localStorage.removeItem(KEY);location.assign('/design.html?id='+existing.id);return existing;}
  return null;
 }
 request('/api/config').then(async config=>{available=config.generationReady;status.textContent=available?'Отправим опорный кадр «Комната и дверь» в Seedream. Мебель и планировка будут указаны как неизменяемые.':'Генерация пока недоступна. Вы можете скачать кадры комнаты.';refresh();if(pending&&available){await ensureSession();await recover();}}).catch(e=>{status.textContent=e.message;refresh();});
 button.onclick=async()=>{
  if(!available||busy||!canGenerate())return;busy=true;refresh();status.textContent='Готовим кадр вашей комнаты…';
  try{
   await ensureSession();if(pending&&await recover())return;
   const data=snapshot(),fingerprint=JSON.stringify([data.scene,style.value,notes.value.trim()]);
   if(pending&&pending.fingerprint!==fingerprint)throw Error('Предыдущая отправка не подтверждена. Откройте «Мои дизайны» и проверьте результат перед изменением запроса.');
   pending=pending||{requestId:crypto.randomUUID(),fingerprint};
   // Persist before submitting so a network interruption can reuse the same paid request.
   localStorage.setItem(KEY,JSON.stringify(pending));status.textContent='Передаём кадр генератору. Можно дождаться перехода на страницу результата…';
   const job=await request('/api/generations',{requestId:pending.requestId,...data,style:style.value,notes:notes.value.trim()});
   localStorage.removeItem(KEY);location.assign('/design.html?id='+job.id);
  }catch(e){status.textContent=e.message+' Если соединение прервалось, нажмите ещё раз: повторная отправка использует тот же номер запроса.';busy=false;refresh();}
 };
 return refresh;
}
