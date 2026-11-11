import { zipSync, strToU8 } from 'fflate';
import { listProducts } from './db.mjs';
import { productPhoto } from './product-photo.mjs';
import { safeProductUrl } from './core.mjs';
import { restorePlacement, assessPlacement, footprint, doorGeometry } from './placement-core.mjs';
import { LAYOUT_KEY,CAMERA_KEY,DEFAULT_HEIGHTS,ASPECT,FRAME_WIDTH,FRAME_HEIGHT,validateHeights,openingsFor,openingConflict,sceneSignature,cameraError,cameraCandidates,aimAt,levelCamera } from './scene-core.mjs';
import { SHOTS,COMPOSITION_VERSION,proposeCompositions,compositionError,bedAxes } from './composition.mjs';
import { RoomScene,MASKS } from './room-scene.mjs';
const $=id=>document.getElementById(id),shotNames=SHOTS.map(s=>s.name);
// A cached previous HTML shell can briefly receive the current bundle during publication.
// Upgrade the small markup addition in place instead of failing the entire room.
if(!$('composition-status')){const status=document.createElement('p');status.id='composition-status';status.className='hint';status.setAttribute('role','status');$('shot-list').before(status);}
$('cam-fov').max='65';document.querySelector('.preview-size').textContent='3:4';$('export-status').textContent='Кадры сохраняются в разрешении 1200 × 1600.';
const demo={id:'demo-bed',name:'Учебная кровать',manufacturer:'Пример',sku:'DEMO-BED',category:'bed',demo:true,dimensionsMm:{width:1800,depth:2200,height:1100}};
let room,placement,product,layout,signature,view,cameras=[],outcomes=[],active=0,heights={...DEFAULT_HEIGHTS},pass='rgb',ready=false,stale=false,drag=null,thumbnailTimer,storageOK=true,busy=false,geometryDirty=false;
function notice(text,error=false){$('page-notice').textContent=text;$('page-notice').classList.toggle('error',error);}
function fail(message){notice(message,true);$('empty-reason').textContent=message;$('empty-state').hidden=false;$('camera-workbench').hidden=true;}
function save(){if(!ready||stale)return;try{localStorage.setItem(CAMERA_KEY,JSON.stringify({schemaVersion:1,rulesVersion:COMPOSITION_VERSION,signature,heights,cameras,active,updatedAt:new Date().toISOString()}));storageOK=true;$('camera-save-status').textContent='Ракурсы сохранены в этом браузере.';}catch{storageOK=false;$('camera-save-status').textContent='Браузер не разрешил сохранение. Скачайте комплект кадров перед закрытием.';}}
function currentError(){return cameras[active]?compositionError(cameras[active],SHOTS[active].id,room,placement,product,heights,c=>view.inspectFrame(c)):'Нет доступного ракурса.';}
function allValid(){return cameras.some(Boolean)&&cameras.every((c,i)=>!c||!compositionError(c,SHOTS[i].id,room,placement,product,heights,c=>view.inspectFrame(c)));}
function updateButtons(){const disabled=!ready||stale||busy||geometryDirty;$('download-frame').disabled=disabled||!!currentError();$('export-shots').disabled=disabled||!allValid();}
function render(){if(!view)return;const selected=cameras[active];$('scene-loading').hidden=!!selected;if(!selected)$('scene-loading').textContent='Для этой расстановки нет полного кадра. Вернитесь к плану и освободите место перед кроватью.';if(selected)view.render(selected,pass);drawMap();$('view-title').textContent=shotNames[active];const error=currentError();$('camera-error').textContent=error;$('camera-error').hidden=!error;document.querySelectorAll('.shot-card').forEach((el,i)=>el.setAttribute('aria-pressed',String(i===active)));updateButtons();}
function fillCameraInputs(){const c=cameras[active];for(const id of ['cam-x','cam-z','cam-height','cam-yaw','cam-fov','cam-shift','aim-bed'])$(id).disabled=!c;if(!c)return;$('cam-yaw').disabled=active===0;for(const [id,k,factor] of [['cam-x','x',10],['cam-z','z',10],['cam-height','height',10],['cam-yaw','yaw',1],['cam-fov','fov',1],['cam-shift','shiftY',.01]])$(id).value=Math.round(c[k]/factor);$('fov-value').textContent=Math.round(c.fov)+'°';$('shift-value').textContent=Math.round(c.shiftY*100)+'%';}
function updateThumbnails(){if(!ready||!cameras.length)return;for(let i=0;i<cameras.length;i++){if(cameras[i])$('shot-image-'+i).src=view.capture(cameras[i],'rgb',480);}render();}
function scheduleThumbnails(){clearTimeout(thumbnailTimer);thumbnailTimer=setTimeout(updateThumbnails,220);}
function editCamera(candidate,{syncInputs=false}={}){
  if(!ready||busy||!cameras[active])return false;
  if(active===0){const axis=bedAxes(placement).front,distance=(candidate.x-placement.x)*axis.x+(candidate.z-placement.z)*axis.z;candidate={...candidate,x:placement.x+axis.x*distance,z:placement.z+axis.z*distance,yaw:cameras[active].yaw};}
  const error=compositionError(candidate,SHOTS[active].id,room,placement,product,heights,c=>view.inspectFrame(c));
  if(error){$('camera-error').textContent=error;$('camera-error').hidden=false;if(syncInputs)fillCameraInputs();return false;}
  cameras[active]=candidate;if(syncInputs)fillCameraInputs();render();save();scheduleThumbnails();return true;
}
function choose(index){if(!ready||busy||!cameras[index])return;active=index;fillCameraInputs();render();save();}
function createShotCards(){const host=$('shot-list');host.replaceChildren();for(let i=0;i<SHOTS.length;i++){const button=document.createElement('button');button.className='shot-card';button.disabled=!cameras[i];button.setAttribute('aria-label',shotNames[i]);button.innerHTML=(cameras[i]?`<img id="shot-image-${i}" alt="3D-предпросмотр: ${shotNames[i]}">`:`<div class="unavailable-shot">Ракурс недоступен</div>`)+`<div class="shot-copy"><span>0${i+1}</span><strong>${shotNames[i]}</strong><i aria-hidden="true"></i></div>`;const reason=document.createElement('p');reason.className='shot-reason';reason.textContent=cameras[i]?SHOTS[i].description:outcomes[i].reason;button.append(reason);button.onclick=()=>choose(i);host.append(button);}
$('composition-status').textContent=`Доступно ракурсов: ${cameras.filter(Boolean).length} из 3. Дверь закрыта во всех кадрах.`;}
function proposeCameras(){outcomes=proposeCompositions(room,placement,product,heights,c=>view.inspectFrame(c));cameras=outcomes.map(o=>o.camera);active=Math.max(0,cameras.findIndex(Boolean));createShotCards();}
function drawMap(){
  const w=room.width,d=room.depth,s=footprint(product);$('camera-map').setAttribute('viewBox',`-200 -200 ${w+400} ${d+400}`);
  const dg=doorGeometry(room),p=p=>`${p.x},${p.z}`,windows=openingsFor(room,heights).filter(o=>o.kind==='window');
  $('map-architecture').innerHTML=`<rect width="${w}" height="${d}" fill="#fafbf7" stroke="#69785c" stroke-width="55"/>${windows.map(o=>o.wall==='top'?`<path d="M${o.start} 0H${o.end}" stroke="#a9d1dc" stroke-width="65"/>`:`<path d="M${w} ${o.start}V${o.end}" stroke="#a9d1dc" stroke-width="65"/>`).join('')}<path d="M${p(dg.map(room.doorOffset,0))}L${p(dg.map(room.doorOffset+room.doorWidth,0))}" stroke="#fafbf7" stroke-width="65"/><path d="M${p(dg.hinge)}L${p(dg.closed)}" stroke="#b29662" stroke-width="35"/>`;
  $('map-bed').innerHTML=`<g transform="translate(${placement.x} ${placement.z}) rotate(${placement.rotation})"><rect x="${-s.width/2}" y="${-s.depth/2}" width="${s.width}" height="${s.depth}" rx="55" fill="#d4dec9" stroke="#93a77e" stroke-width="20"/><rect x="${-s.width/2}" y="${-s.depth/2}" width="${s.width}" height="120" rx="30" fill="#7f936c"/><text y="80" text-anchor="middle" font-size="160" fill="#667959">Кровать</text></g>`;
  const order=cameras.map((c,i)=>i).filter(i=>cameras[i]&&i!==active);if(cameras[active])order.push(active);$('map-cameras').innerHTML=order.map(i=>{const c=cameras[i],half=Math.atan(Math.tan(c.fov*Math.PI/360)*ASPECT),reach=1300,dx=Math.sin(half)*reach,dz=Math.cos(half)*reach;return `<g transform="translate(${c.x} ${c.z})"><path transform="rotate(${c.yaw})" d="M0 0L${-dx} ${-dz}L${dx} ${-dz}Z" fill="${i===active?'#d4a454':'#a7b79a'}" opacity="${i===active?'.27':'.15'}"/><g data-camera="${i}" role="button" tabindex="0" aria-label="Камера ${i+1}. Перетаскивайте или двигайте стрелками"><circle r="210" fill="transparent"/><circle r="135" fill="${i===active?'#293822':'#a3af99'}" stroke="white" stroke-width="28"/><text y="55" text-anchor="middle" font-size="160" fill="white" pointer-events="none">${i+1}</text></g></g>`;}).join('');
}
function mapPoint(event){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform($('camera-map').getScreenCTM().inverse());return {x:p.x,z:p.y};}
const map=$('camera-map');map.addEventListener('pointerdown',event=>{const target=event.target.closest('[data-camera]');if(!target||busy)return;event.preventDefault();choose(Number(target.dataset.camera));const p=mapPoint(event),c=cameras[active];drag={id:event.pointerId,dx:p.x-c.x,dz:p.z-c.z};map.setPointerCapture(event.pointerId);});
map.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const p=mapPoint(event);editCamera({...cameras[active],x:Math.round(p.x-drag.dx),z:Math.round(p.z-drag.dz)},{syncInputs:true});});
for(const name of ['pointerup','pointercancel'])map.addEventListener(name,event=>{if(drag?.id===event.pointerId){drag=null;if(map.hasPointerCapture(event.pointerId))map.releasePointerCapture(event.pointerId);}});
map.addEventListener('keydown',event=>{const target=event.target.closest('[data-camera]');if(!target)return;const i=Number(target.dataset.camera);if(['Enter',' '].includes(event.key)){event.preventDefault();choose(i);return;}const delta={ArrowLeft:[-50,0],ArrowRight:[50,0],ArrowUp:[0,-50],ArrowDown:[0,50]}[event.key];if(delta){event.preventDefault();active=i;editCamera({...cameras[i],x:cameras[i].x+delta[0],z:cameras[i].z+delta[1]},{syncInputs:true});map.querySelector(`[data-camera="${i}"]`).focus();}});
for(const[id,k,factor]of[['cam-x','x',10],['cam-z','z',10],['cam-height','height',10],['cam-yaw','yaw',1]]){ $(id).addEventListener('input',()=>{if(!ready)return;const n=$(id).value===''?NaN:Number($(id).value)*factor;editCamera({...cameras[active],[k]:n});}); $(id).addEventListener('blur',()=>{if(ready){fillCameraInputs();render();}}); }
for(const[id,k]of[['cam-fov','fov'],['cam-shift','shiftY']])$(id).addEventListener('input',()=>editCamera({...cameras[active],[k]:Number($(id).value)*(k==='shiftY'?.01:1)},{syncInputs:true}));
$('aim-bed').onclick=()=>{if(!ready||busy||!cameras[active])return;const c=aimAt(cameras[active],placement.x,placement.z,Math.min(950,product.dimensionsMm.height*.7));editCamera(c,{syncInputs:true});};
$('reset-cameras').onclick=()=>{if(!ready||busy)return;try{proposeCameras();fillCameraInputs();render();save();updateThumbnails();}catch(e){notice(e.message,true);}};
document.querySelectorAll('[data-pass]').forEach(button=>button.onclick=()=>{pass=button.dataset.pass;document.querySelectorAll('[data-pass]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('pass-description').textContent={rgb:'Нейтральная отделка и ваша мебель. Дизайн ещё не сгенерирован.',depth:'Карта глубины: светлое ближе к камере, тёмное дальше. Для генератора с поддержкой глубины.',masks:'Каждый цвет — отдельная поверхность или предмет. Мебель и проёмы можно выделять отдельно.'}[pass];render();});
for(const k of Object.keys(DEFAULT_HEIGHTS))$('height-'+k).addEventListener('input',()=>{geometryDirty=true;$('height-error').textContent='Примените высоты, чтобы обновить комнату и кадры.';$('height-error').hidden=false;updateButtons();});
$('apply-heights').onclick=()=>{
  if(!ready||busy)return;
  const next=Object.fromEntries(Object.keys(DEFAULT_HEIGHTS).map(k=>[k,Number($('height-'+k).value)]));const error=validateHeights(next)||(openingConflict(openingsFor(room,next))?'Дверь пересекается с окном. Уточните высоты или положение двери.':'');
  if(error){$('height-error').textContent=error;$('height-error').hidden=false;return;}
  heights=next;geometryDirty=false;$('height-error').hidden=true;view.buildRoom(room,heights);proposeCameras();fillCameraInputs();render();save();updateThumbnails();
};
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function pngBytes(data){return Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));}
function freshLayout(){try{return localStorage.getItem(LAYOUT_KEY)===JSON.stringify(layout);}catch{return false;}}
function guardFresh(){if(!freshLayout()){stale=true;notice('Расстановка изменилась в другой вкладке. Откройте этот шаг заново, чтобы обновить комнату.',true);updateButtons();return false;}return true;}
$('download-frame').onclick=()=>{if(!guardFresh()||currentError()||geometryDirty)return;const bytes=pngBytes(view.capture(cameras[active],pass));download(bytes,`obzhivi-camera-${active+1}-${pass}.png`,'image/png');render();};
$('export-shots').onclick=async()=>{
  if(!ready||busy||geometryDirty||!allValid()||!guardFresh())return;busy=true;clearTimeout(thumbnailTimer);updateButtons();$('export-status').textContent='Готовим доступные ракурсы…';
  // Allow the busy state to paint before rendering and packing.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{
    const files={};for(let i=0;i<cameras.length;i++)if(cameras[i])for(const mode of ['rgb','depth','masks'])files[`camera-${i+1}/${mode}.png`]=pngBytes(view.capture(cameras[i],mode));
    const metadata={schemaVersion:1,kind:'obzhivi-generation-input',createdAt:new Date().toISOString(),sceneRevision:signature,geometryVerified:false,units:'meters',coordinateSystem:'Y-up, X right, Z down on the floor plan',room:{...room,sourceUnits:'mm',heightsMm:heights,heightsVerified:false,doorState:'closed',openings:openingsFor(room,heights)},placement:layout.placement,product:{id:product.id,name:product.name,manufacturer:product.manufacturer,sku:product.sku,sourceUrl:safeProductUrl(product.productUrl),dimensionsMm:product.dimensionsMm,normalization:product.normalization||{uniformScale:1,rotationQuaternion:[0,0,0,1]},sourceGlb:'furniture/source.glb',demo:!!product.demo},rulesVersion:COMPOSITION_VERSION,unavailableShots:outcomes.flatMap((o,i)=>cameras[i]?[]:[{id:SHOTS[i].id,reason:o.reason}]),cameras:cameras.flatMap((c,i)=>c?[{id:`camera-${i+1}`,name:shotNames[i],controls:c,...view.cameraMetadata(c),images:{rgb:`camera-${i+1}/rgb.png`,depth:`camera-${i+1}/depth.png`,masks:`camera-${i+1}/masks.png`}}]:[]),imageSize:[FRAME_WIDTH,FRAME_HEIGHT],depth:{encoding:'linear view-space depth, 8-bit grayscale, white near / black far; background black',nearMeters:view.camera.near,farMeters:view.camera.far,decode:'depthMeters = near + (1 - byte / 255) * (far - near)'},maskPalette:MASKS,locks:{architecture:true,furnitureIdentity:true,furnitureTransform:true},generation:{status:'not_started',sharedDesignBrief:null}};
    files['scene.json']=strToU8(JSON.stringify(metadata,null,2));files['furniture/source.glb']=new Uint8Array(view.sourceBuffer);
    files['README.txt']=strToU8('Обживи — исходные кадры комнаты\n\nЭто подготовка к генерации, а не готовый дизайн. Дверь в сцене закрыта; её настройки открывания относятся только к планировщику. Недоступные ракурсы перечислены в scene.json и не экспортируются. Геометрия и высоты предварительные.\nВ каждом camera-N: rgb.png — нейтральный вид; depth.png — линейная глубина, светлое ближе; masks.png — маски поверхностей и кровати. Размер всех изображений: 1200 × 1600.\nscene.json содержит камеры, проёмы, масштаб и позиции. Горизонт и вертикали закреплены: pitch=0, roll=0. Для точного воспроизведения кадра обязательно применить viewOffset или projectionMatrix; одного положения и FOV недостаточно. Все поля с Mm и sourceUnits:mm — в миллиметрах; камеры positionMeters — в метрах.\nfurniture/source.glb — исходный файл. Применить normalization.rotationQuaternion, затем uniformScale; выровнять по центру X/Z и основанию Y=0, затем положение и поворот из placement. Не применять масштаб дважды.\nДля всех ракурсов нужен один общий дизайн-проект с привязкой отделки к стенам. Генератор не подключён. Глубина и маски требуют соответствующей поддержки генератора; сами по себе не гарантируют сохранение геометрии.\n');
    download(zipSync(files,{level:1}),'obzhivi-bedroom-camera-inputs.zip','application/zip');$('export-status').textContent=`Комплект подготовлен: ${cameras.filter(Boolean).length*3} изображений, параметры сцены и исходная модель мебели.`;
  }catch(e){$('export-status').textContent='Не удалось подготовить комплект. '+e.message;}finally{busy=false;render();}
};
window.addEventListener('storage',event=>{if(event.key===LAYOUT_KEY)guardFresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready)guardFresh();});
async function init(){
  try{
    const raw=localStorage.getItem(LAYOUT_KEY);layout=raw?JSON.parse(raw):null;
    const products=await listProducts();if(!products.some(p=>p.id==='demo-bed'))products.push(demo);
    const restored=restorePlacement(layout,products);if(!restored){fail('Сохранённая расстановка не найдена. Поставьте кровать и сохраните её положение в этом браузере.');return;}
    ({room,product}=restored);placement=restored.position;
    if(!assessPlacement(room,placement,footprint(product)).canSave){fail('Положение кровати пересекает стену или зону двери. Исправьте расстановку перед подготовкой кадров.');return;}
    signature=sceneSignature(layout,product);let stored;try{stored=JSON.parse(localStorage.getItem(CAMERA_KEY));}catch{}
    const same=stored?.schemaVersion===1&&stored.signature===signature;
    if(same&&stored.heights&&!validateHeights(stored.heights))heights=stored.heights;
    if(openingConflict(openingsFor(room,heights))){fail('Дверь пересекается с предварительно размеченным окном. Исправьте положение двери на плане перед сборкой комнаты.');return;}
    for(const k of Object.keys(DEFAULT_HEIGHTS))$('height-'+k).value=heights[k];
    $('camera-workbench').hidden=false;view=new RoomScene($('scene-viewport'));view.buildRoom(room,heights);await view.loadBed(product,placement);
    proposeCameras();
    if(same&&stored.rulesVersion===COMPOSITION_VERSION&&Array.isArray(stored.cameras)&&stored.cameras.length===SHOTS.length){for(let i=0;i<SHOTS.length;i++){const c=stored.cameras[i];if(c&&!compositionError(c,SHOTS[i].id,room,placement,product,heights,c=>view.inspectFrame(c)))cameras[i]=c;}if(cameras[stored.active])active=stored.active;}
    createShotCards();ready=true;fillCameraInputs();updateThumbnails();save();
    const host=$('scene-product'),photo=productPhoto(product);if(photo){const img=document.createElement('img');img.src=photo.src;img.alt='Фото '+product.name;host.append(img);}const title=document.createElement('p');title.className='product-name';title.textContent=product.name;host.append(title);const url=safeProductUrl(product.productUrl);if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className='seller-link';a.textContent='Посмотреть у продавца ↗';host.append(a);}
    notice((product.demo?'Сейчас в кадре учебная кровать. ':'')+'Комната собрана по сохранённому плану. Высоты и положение окон предварительные; их нужно уточнить перед финальным дизайном.'+(stored&&!same?' Расстановка обновилась — камеры подобраны заново.':''));
    new ResizeObserver(()=>{if(ready&&!busy)render();}).observe($('scene-viewport'));
    view.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();ready=false;updateButtons();notice('3D-просмотр остановлен браузером. Обновите страницу; сохранённые настройки останутся.',true);});
  }catch(e){ready=false;fail('Не удалось открыть 3D-комнату. '+(e.message||'Проверьте поддержку WebGL в браузере.'));}
}
init();
