import {buildPrompt,STYLES,submitKie,queryKie,MODEL} from './kie.mjs';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const COOKIE='obzhivi_guest';
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}});
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export function sameOrigin(request){return request.headers.get('Origin')===new URL(request.url).origin;}
async function readJSON(request,max=8*1024*1024){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Нужен JSON-запрос.');
 if(Number(request.headers.get('content-length'))>max)throw new ApiError(413,'Кадр слишком большой.');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'Пустой запрос.');const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new ApiError(413,'Кадр слишком большой.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'Некорректный JSON.');}
}
export function pngReference(data){
 if(typeof data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data))throw new ApiError(400,'Нужен PNG-кадр комнаты.');
 let bytes;try{bytes=Uint8Array.from(atob(data.slice(22)),c=>c.charCodeAt(0));}catch{throw new ApiError(400,'Повреждённый кадр.');}
 if(bytes.length<24||bytes.length>5*1024*1024||[137,80,78,71,13,10,26,10].some((b,i)=>bytes[i]!==b))throw new ApiError(400,'Некорректный PNG.');
 const dv=new DataView(bytes.buffer);if(dv.getUint32(16)!==1200||dv.getUint32(20)!==1600)throw new ApiError(400,'Подготовьте кадр комнаты 1200 × 1600.');return bytes;
}
export function validateScene(scene){
 if(!scene||!scene.room||!['width','depth'].every(k=>Number.isFinite(scene.room[k])&&scene.room[k]>=1500&&scene.room[k]<=15000)||!Array.isArray(scene.furniture)||scene.furniture.length>30||typeof scene.revision!=='string'||scene.revision.length>30000)throw new ApiError(400,'Некорректные параметры сцены.');
 if(!scene.camera||!['architecture','front','left','right'].includes(scene.camera.composition)||scene.camera.pitch!==0||(scene.camera.roll||0)!==0)throw new ApiError(400,'Выберите доступный ракурс с ровным горизонтом.');
 if(JSON.stringify(scene).length>100000)throw new ApiError(413,'Описание комнаты слишком большое.');
 return scene;
}
async function getSession(request,env){const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token||!/^[a-f0-9-]{73}$/.test(token))return null;return env.DB.prepare('SELECT id FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token),Date.now()).first();}
async function sessionRequired(request,env){const s=await getSession(request,env);if(!s)throw new ApiError(401,'Откройте страницу заново, чтобы восстановить сеанс.');return s;}
function publicJob(row){return {id:row.id,requestId:row.request_id,status:row.status,style:row.style,styleLabel:STYLES[row.style]?.label||row.style,resultUrl:row.result_url,error:row.error,createdAt:row.created_at,scene:JSON.parse(row.scene_json),referenceUrl:'/api/generations/'+row.id+'/reference'};}
async function ownedJob(env,id,session){const row=await env.DB.prepare('SELECT * FROM generations WHERE id=? AND session_id=?').bind(id,session.id).first();if(!row)throw new ApiError(404,'Дизайн не найден в этом браузере.');return row;}
async function serveReference(env,row){const obj=await env.BUCKET.get(row.reference_key);if(!obj)throw new ApiError(404,'Исходный кадр не найден.');return new Response(obj.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
export async function api(request,env){
 try{
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/config'&&method==='GET')return json({generationReady:!!env.KIE_API_KEY&&!!env.DB&&!!env.BUCKET,provider:'Kie',model:MODEL,styles:Object.entries(STYLES).map(([id,s])=>({id,label:s.label}))});
  if(!env.DB||!env.BUCKET)throw new ApiError(503,'Сервер ещё настраивается. Расстановка и скачивание кадров доступны.');
  if(!['GET','HEAD'].includes(method)&&!sameOrigin(request))throw new ApiError(403,'Запрос разрешён только со страницы сервиса.');
  if(path==='/api/session'&&method==='POST'){
   const existing=await getSession(request,env);if(existing)return json({ready:true});
   const token=crypto.randomUUID()+'-'+crypto.randomUUID(),id=crypto.randomUUID(),now=Date.now();
   await env.DB.prepare('INSERT INTO sessions(id,token_hash,created_at,expires_at) VALUES(?,?,?,?)').bind(id,await hash(token),now,now+90*86400000).run();
   return json({ready:true},200,{'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${url.protocol==='https:'?'; Secure':''}`});
  }
  const asset=path.match(/^\/api\/reference\/([a-f0-9-]+)$/);
  if(asset&&method==='GET'){
   if(!UUID.test(asset[1]))throw new ApiError(404,'Кадр не найден.');
   const row=await env.DB.prepare('SELECT reference_key,reference_token_hash,created_at FROM generations WHERE id=?').bind(asset[1]).first();
   const token=url.searchParams.get('token')||'';
   if(!row||row.created_at<Date.now()-86400000||token.length!==73||await hash(token)!==row.reference_token_hash)throw new ApiError(404,'Ссылка на кадр недоступна.');
   return serveReference(env,row);
  }
  const session=await sessionRequired(request,env);
  if(path==='/api/generations'&&method==='GET'){
   const rows=await env.DB.prepare('SELECT * FROM generations WHERE session_id=? ORDER BY created_at DESC LIMIT 50').bind(session.id).all();return json({jobs:rows.results.map(publicJob)});
  }
  if(path==='/api/generations'&&method==='POST'){
   if(!env.KIE_API_KEY)throw new ApiError(503,'Генерация ещё не подключена. Можно скачать исходные кадры.');
   const body=await readJSON(request);if(!UUID.test(body.requestId||''))throw new ApiError(400,'Нужен идентификатор запроса.');
   const existing=await env.DB.prepare('SELECT * FROM generations WHERE session_id=? AND request_id=?').bind(session.id,body.requestId).first();if(existing)return json(publicJob(existing));
   const scene=validateScene(body.scene),bytes=pngReference(body.reference),notes=typeof body.notes==='string'?body.notes.trim():'';
   if(notes.length>600||!Object.hasOwn(STYLES,body.style))throw new ApiError(400,'Проверьте стиль и пожелания (до 600 символов).');
   const id=crypto.randomUUID(),token=crypto.randomUUID()+'-'+crypto.randomUUID(),referenceKey='generations/'+id+'/reference.png',now=Date.now(),prompt=buildPrompt(body.style,notes);
   // The unique request key is claimed before storage or paid provider submission.
   try{await env.DB.prepare('INSERT INTO generations(id,session_id,request_id,status,style,prompt,scene_json,reference_key,reference_token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,session.id,body.requestId,'submitting',body.style,prompt,JSON.stringify(scene),referenceKey,await hash(token),now,now).run();}catch(e){const row=await env.DB.prepare('SELECT * FROM generations WHERE session_id=? AND request_id=?').bind(session.id,body.requestId).first();if(row)return json(publicJob(row));throw e;}
   let providerTaskId=null;
   try{
    await env.BUCKET.put(referenceKey,bytes,{httpMetadata:{contentType:'image/png'}});
    providerTaskId=await submitKie(env.KIE_API_KEY,url.origin+'/api/reference/'+id+'?token='+encodeURIComponent(token),prompt);
    await env.DB.prepare('UPDATE generations SET provider_task_id=?,status=?,updated_at=? WHERE id=?').bind(providerTaskId,'queued',Date.now(),id).run();
   }catch(e){
    const unknown=!!providerTaskId||e.ambiguous;
    await env.DB.prepare('UPDATE generations SET provider_task_id=?,status=?,error=?,updated_at=? WHERE id=?').bind(providerTaskId,unknown?'unknown':'failed',unknown?'Приём запроса не подтверждён. Не запускайте повторно: владелец сервиса должен проверить задачу в Kie.':e.name==='ProviderError'?e.message:'Не удалось сохранить кадр или отправить запрос. Повторите позже.',Date.now(),id).run();
   }
   return json(publicJob(await ownedJob(env,id,session)),202);
  }
  const match=path.match(/^\/api\/generations\/([a-f0-9-]+)(\/reference)?$/);
  if(match&&method==='GET'){
   if(!UUID.test(match[1]))throw new ApiError(404,'Дизайн не найден.');let row=await ownedJob(env,match[1],session);
   if(match[2])return serveReference(env,row);
   if(row.status==='submitting'&&row.updated_at<Date.now()-90000){await env.DB.prepare('UPDATE generations SET status=?,error=? WHERE id=? AND status=?').bind('unknown','Приём запроса не подтверждён. Команде сервиса нужно проверить задачу в Kie перед повторной генерацией.',row.id,'submitting').run();row=await ownedJob(env,row.id,session);}
   if(['queued','generating','unknown'].includes(row.status)&&row.provider_task_id&&env.KIE_API_KEY){
    // Atomically claim a polling slot; many tabs cannot flood the provider.
    const claim=Date.now();const slot=await env.DB.prepare("UPDATE generations SET updated_at=? WHERE id=? AND updated_at<? AND status IN ('queued','generating','unknown')").bind(claim,row.id,claim-3000).run();
    if(slot.meta.changes){try{const result=await queryKie(env.KIE_API_KEY,row.provider_task_id);await env.DB.prepare('UPDATE generations SET status=?,result_url=?,error=? WHERE id=? AND updated_at=?').bind(result.status,result.url||null,result.error||null,row.id,claim).run();}catch{/* Keep the last known task state; never recreate a task on polling failure. */}}
    row=await ownedJob(env,row.id,session);
   }
   return json(publicJob(row));
  }
  if(path==='/api/feedback'&&method==='POST'){
   const b=await readJSON(request,10000);if(typeof b.message!=='string'||!b.message.trim()||b.message.length>3000||!['plan','placement','cameras','design','general'].includes(b.stage))throw new ApiError(400,'Напишите, что было неудобно (до 3000 символов).');
   if(b.generationId)await ownedJob(env,b.generationId,session);
   const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO feedback(id,session_id,generation_id,stage,rating,message,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,session.id,b.generationId||null,b.stage,Number.isInteger(b.rating)&&b.rating>=1&&b.rating<=5?b.rating:null,b.message.trim(),Date.now()).run();return json({id,saved:true},201);
  }
  return json({error:'Неизвестный маршрут.'},404);
 }catch(e){return json({error:e instanceof ApiError?e.message:'Не удалось выполнить запрос. Попробуйте позже.'},e instanceof ApiError?e.status:500);}
}
