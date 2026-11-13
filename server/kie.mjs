export const MODEL='seedream/5-5-image-to-image';
export const STYLES={modern:{label:'Современный тёплый',prompt:'Warm contemporary interior: calm cream walls, natural oak flooring, restrained details, layered warm lighting and linen textiles.'},japandi:{label:'Джапанди',prompt:'Japandi interior: warm natural plaster, light wood, soft muted earth tones, calm minimal detailing, linen and textured textiles.'},classic:{label:'Современная классика',prompt:'Contemporary classic interior: balanced restrained wall mouldings, warm ivory finishes, elegant subtle brass lighting and rich textiles.'},designer:{label:'На вкус дизайнера',prompt:'Develop a cohesive sophisticated bedroom design around the existing furniture, a restrained harmonious palette, realistic layered lighting and coordinated finishes.'}};
export function safeResultUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function buildPrompt(style,notes=''){
 if(!Object.hasOwn(STYLES,style))throw Error('Выберите стиль.');
 return `Transform this exact 3D bedroom reference into a photorealistic interior photograph. Preserve the camera viewpoint, portrait 3:4 framing, level horizon, straight vertical lines, room proportions, visible wall corner, and the exact number, positions and sizes of doors and windows. The door must remain closed and visible. Preserve all existing furniture items: their identities, silhouettes, dimensions, positions, rotations, upholstery colours and distinctive details. Do not replace, move or add large furniture. Design only wall/floor/ceiling finishes, lighting, curtains, bedding and small accessories. Keep furniture recognizable and room geometry faithful. Natural realistic materials, balanced lighting, professional interior photography. ${STYLES[style].prompt}${notes?' Additional preferences for finishes only: '+notes:''}`;
}
export function createPayload(referenceUrl,prompt){return {model:MODEL,input:{prompt,image_urls:[referenceUrl],aspect_ratio:'3:4',size:'2K',output_format:'png',background:'auto',nsfw_checker:true}};}
export class ProviderError extends Error{constructor(message,{ambiguous=false}={}){super(message);this.name='ProviderError';this.ambiguous=ambiguous;}}
async function responseJSON(response){let data;try{data=await response.json();}catch{throw new ProviderError('Kie вернул нечитаемый ответ.',{ambiguous:true});}if(!response.ok||data.code!==200){const code=Number(data.code)||response.status;throw new ProviderError(code===401?'Ключ Kie не принят. Свяжитесь с владельцем сервиса.':code===402?'На аккаунте генерации недостаточно средств.':'Kie не принял запрос. Попробуйте позже.',{ambiguous:response.status>=500});}return data.data;}
export async function submitKie(apiKey,referenceUrl,prompt,fetcher=fetch){
 let response;try{response=await fetcher('https://api.kie.ai/api/v1/jobs/createTask',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(createPayload(referenceUrl,prompt)),signal:AbortSignal.timeout(30000)});}catch{throw new ProviderError('Не удалось подтвердить приём запроса Kie. Повторная отправка автоматически не выполняется.',{ambiguous:true});}
 const data=await responseJSON(response);if(typeof data?.taskId!=='string'||!data.taskId)throw new ProviderError('Kie не вернул номер задачи.',{ambiguous:true});return data.taskId;
}
export async function queryKie(apiKey,taskId,fetcher=fetch){
 const response=await fetcher('https://api.kie.ai/api/v1/jobs/recordInfo?taskId='+encodeURIComponent(taskId),{headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(20000)});
 const data=await responseJSON(response);
 if(data?.state==='fail')return {status:'failed',error:'Генератор не смог обработать этот кадр. Попробуйте другой стиль или ракурс.'};
 if(data?.state==='success'){let result;try{result=JSON.parse(data.resultJson);}catch{}const url=safeResultUrl(result?.resultUrls?.[0]);if(!url)throw new ProviderError('Генератор завершил задачу без доступного изображения.');return {status:'succeeded',url};}
 if(['waiting','queuing','generating'].includes(data?.state))return {status:data.state==='generating'?'generating':'queued'};
 throw new ProviderError('Неизвестное состояние задачи Kie.');
}
