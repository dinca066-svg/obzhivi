import {PLAN_KEY,dimensionsFromPlan,planGeometryError} from './plan-core.mjs';
import {DEFAULT_HEIGHTS,openingsFor} from './scene-core.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
let stage=1,image=null,rect=null,windows=[],pdf=null,page=1,ticket=0,drag=null,first=null,room=null,geometryError='',sample=false;
const number=id=>Number($(id).value),wallOptions='<option value="left">Левая</option><option value="right">Правая</option><option value="top">Верхняя</option><option value="bottom">Нижняя</option>';
const say=t=>{$('message').textContent=t;};
function showStage(n){stage=n;$('upload-panel').hidden=n!==1;$('room-panel').hidden=n!==2;$('geometry-panel').hidden=n!==3;$('crop-tools').hidden=n!==2;$('sample-rooms').hidden=!sample||n!==2;$('plan-title').textContent=n===3?'Проверьте проёмы на плане':'План квартиры';$('plan-hint').textContent=n===3?'Зелёный контур — комната. Синий — окна, охра — дверь.':image?'Выделите только одну прямоугольную комнату по внутреннему краю стен.':'Файл обрабатывается в этом браузере.';draw();}
function invalidate(){ $('confirm-geometry').checked=false;validate(); }
function draw(){
  $('blank-plan').hidden=!!image;$('plan-stage').hidden=!image;
  if(image){$('source-plan').setAttribute('viewBox',`0 0 ${image.width} ${image.height}`);for(const k of ['width','height'])$('plan-image').setAttribute(k,image[k]);$('plan-image').setAttribute('href',image.url);$('source-name').textContent=image.name;}
  const r=$('room-outline');r.setAttribute('visibility',rect?'visible':'hidden');if(rect){for(const k of ['x','y','width','height']){r.setAttribute(k,rect[k]);$('crop-'+k).value=Math.round(rect[k]);}r.setAttribute('stroke-width',Math.max(image.width/350,2));}
  $('to-geometry').disabled=!rect||rect.width<5||rect.height<5;
  const g=$('opening-overlay');g.replaceChildren();if(stage!==3||!room||!rect)return;
  for(const o of openingsFor(room,heights())){
    const vertical=['left','right'].includes(o.wall),len=vertical?room.depth:room.width;
    const p=u=>vertical?[rect.x+(o.wall==='right'?rect.width:0),rect.y+rect.height*u/len]:[rect.x+rect.width*u/len,rect.y+(o.wall==='bottom'?rect.height:0)];
    const a=p(o.start),b=p(o.end),line=document.createElementNS(NS,'line');for(const[k,v]of Object.entries({x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:o.kind==='door'?'#b47c35':'#338aaf','stroke-width':Math.max(image.width/150,5),'stroke-linecap':'round'}))line.setAttribute(k,v);g.append(line);
  }
}
function calibration(){return {mode:$('scale-mode').value,area:number('area'),length:number('reference-length'),width:number('width'),depth:number('depth')};}
function heights(){return {...DEFAULT_HEIGHTS,ceiling:number('ceiling'),door:number('door-height')};}
function validate(){
  room=null;geometryError='';
  try{
    const d=dimensionsFromPlan(rect,calibration());
    room={...d,doorWall:$('door-wall').value,doorOffset:number('door-offset'),doorWidth:number('door-width'),doorHinge:$('door-hinge').value,doorSwing:$('door-swing').value,windows:structuredClone(windows),verified:false,source:'user_selected_plan',purpose:'bedroom'};
    $('dimensions-result').textContent=`${(d.width/1000).toLocaleString('ru-RU')} × ${(d.depth/1000).toLocaleString('ru-RU')} м · ${(d.width*d.depth/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})} м²`;
    geometryError=planGeometryError(room,heights());
  }catch(e){geometryError=e.message;$('dimensions-result').textContent='Размеры ещё не определены.';}
  $('geometry-error').textContent=stage===3?geometryError:'';$('continue').disabled=!!geometryError||!$('confirm-geometry').checked;draw();
}
function renderWindows(){
  const host=$('windows');host.replaceChildren();windows.forEach((w,i)=>{
    const div=document.createElement('div');div.className='window-card';div.innerHTML=`<div><strong>Окно ${i+1}</strong><button type="button" aria-label="Убрать окно ${i+1}">Убрать</button></div><div class="fields"><label>Стена окна ${i+1}<select data-key="wall">${wallOptions}</select></label>${[['offset','Отступ'],['width','Ширина'],['sill','Подоконник'],['height','Высота']].map(([k,label])=>`<label>${label} окна ${i+1}, мм<input data-key="${k}" type="number" min="0"></label>`).join('')}</div>`;
    for(const input of div.querySelectorAll('[data-key]')){input.value=w[input.dataset.key];input.addEventListener('input',()=>{w[input.dataset.key]=input.dataset.key==='wall'?input.value:Number(input.value);invalidate();});}
    div.querySelector('button').onclick=()=>{windows.splice(i,1);renderWindows();invalidate();};host.append(div);
  });
}
function initGeometry(){
  $('area').value='';$('reference-length').value='';$('width').value='';$('depth').value='';$('door-offset').value='0';$('door-width').value='900';$('door-wall').value='left';$('scale-mode').value='area';windows=[];renderWindows();scaleUI();invalidate();
}
function chooseSample(which){
  rect=which==='right'?{x:833,y:66,width:255,height:461}:{x:533,y:66,width:287,height:277};
  $('area').value=which==='right'?'16.79':'10.68';$('scale-mode').value='area';scaleUI();
  const d=dimensionsFromPlan(rect,calibration());$('width').value=d.width;$('depth').value=d.depth;
  $('door-wall').value=which==='right'?'left':'bottom';$('door-offset').value=which==='right'?'3400':Math.round(d.width*.45);$('door-width').value=which==='right'?'950':'900';
  windows=which==='right'?[{id:'window-1',wall:'top',offset:Math.round(d.width*.11),width:Math.round(d.width*.66),sill:850,height:1500},{id:'window-2',wall:'right',offset:Math.round(d.depth*.183),width:Math.round(d.depth*.377),sill:850,height:1500}]:[{id:'window-1',wall:'top',offset:400,width:Math.round(d.width*.6),sill:850,height:1500}];
  renderWindows();invalidate();say('Комната выделена по нашей предварительной разметке. Проверьте её границы и проёмы.');
}
function scaleUI(){const m=$('scale-mode').value;$('area-field').hidden=m!=='area';$('length-field').hidden=m!=='wall';$('dimension-fields').hidden=m!=='dimensions';}
function setImage(data){image=data;rect=null;first=null;initGeometry();showStage(2);say('План открыт. Выделите спальню; площадь и проёмы нужно указать по плану.');}
async function imageData(source,name){const width=Math.min(1600,source.naturalWidth||source.width),height=Math.round((source.naturalHeight||source.height)*width/(source.naturalWidth||source.width));const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(source,0,0,width,height);return {name,width,height,url:c.toDataURL('image/jpeg',.85)};}
async function renderPage(n,t){const p=await pdf.getPage(n),vp=p.getViewport({scale:1}),viewport=p.getViewport({scale:Math.min(1600/vp.width,2000/vp.height)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await p.render({canvasContext:canvas.getContext('2d'),viewport}).promise;if(t!==ticket)return;page=n;setImage({...await imageData(canvas,pdfName),originKind:'pdf',originPage:n});$('pdf-pages-label').hidden=pdf.numPages<2;}
let pdfName='';
$('plan-file').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;const t=++ticket;
  if(file.size>20*1024*1024){say('Файл больше 20 МБ. Уменьшите его или сохраните одну страницу.');return;}
  if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type)){say('Поддерживаются PDF, JPG, PNG и WebP.');return;}
  $('plan-file').disabled=true;$('sample-plan').disabled=true;say('Открываем план…');
  try{
    sample=false;if(file.type==='application/pdf'){
      const lib=await import('/pdf/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/pdf/pdf.worker.mjs';
      const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:'/pdf/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdf/standard_fonts/',wasmUrl:'/pdf/wasm/'}).promise;
      if(t!==ticket){await doc.loadingTask.destroy();return;}if(pdf)await pdf.loadingTask.destroy();pdf=doc;pdfName=file.name;
      $('pdf-pages').replaceChildren(...Array.from({length:doc.numPages},(_,i)=>new Option('Страница '+(i+1),i+1)));await renderPage(1,t);
    }else{
      const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(img.width*img.height>60000000)throw Error('Изображение слишком большое. Уменьшите его до 60 мегапикселей.');if(t!==ticket)return;if(pdf)await pdf.loadingTask.destroy();pdf=null;page=1;setImage(await imageData(img,file.name));$('pdf-pages-label').hidden=true;}finally{URL.revokeObjectURL(url);}
    }
  }catch(e){say('Не удалось открыть файл. '+(file.type==='application/pdf'?'Для PDF с паролем используйте копию без защиты или изображение страницы.':e.message));}finally{if(t===ticket){$('plan-file').disabled=false;$('sample-plan').disabled=false;$('plan-file').value='';}}
};
$('pdf-pages').onchange=async()=>{const t=++ticket;try{await renderPage(number('pdf-pages'),t);}catch{say('Не удалось открыть страницу PDF.');}};
$('sample-plan').onclick=async()=>{const t=++ticket;try{const img=new Image();img.src='/plans/apartment.jpg';await img.decode();if(t!==ticket)return;pdf=null;page=1;sample=true;setImage({name:'Наша квартира · пример',width:1280,height:741,url:'/plans/apartment.jpg'});$('pdf-pages-label').hidden=true;showStage(2);say('Выберите комнату на примере или обведите её самостоятельно.');}catch{say('Не удалось загрузить пример. Попробуйте свой файл.');}};
$('right-room').onclick=()=>chooseSample('right');$('central-room').onclick=()=>chooseSample('central');
const svg=$('source-plan');
function point(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:Math.max(0,Math.min(image.width,p.x)),y:Math.max(0,Math.min(image.height,p.y))};}
function setRect(a,b){rect={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};draw();}
svg.onpointerdown=e=>{if(stage!==2||!image)return;e.preventDefault();const p=point(e);drag={start:p,id:e.pointerId,moved:false};svg.setPointerCapture(e.pointerId);};
svg.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const p=point(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>5){drag.moved=true;setRect(drag.start,p);}};
svg.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const p=point(e);if(drag.moved){setRect(drag.start,p);first=null;}else if(first){setRect(first,p);first=null;}else{first=p;rect=null;say('Теперь нажмите на противоположный внутренний угол комнаты.');draw();}drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);invalidate();};
svg.onpointercancel=()=>{drag=null;first=null;};
$('reset-selection').onclick=()=>{rect=null;first=null;invalidate();say('Выделите комнату заново.');};
$('apply-crop').onclick=()=>{const r=Object.fromEntries(['x','y','width','height'].map(v=>[v,number('crop-'+v)]));if(!Object.values(r).every(Number.isFinite)||r.x<0||r.y<0||r.width<5||r.height<5||r.x+r.width>image.width||r.y+r.height>image.height){say('Граница должна находиться внутри изображения.');draw();return;}rect=r;invalidate();};
$('to-geometry').onclick=()=>{showStage(3);validate();say('Проверьте масштаб и все проёмы. По одной площади точные длины определить нельзя.');};
$('change-file').onclick=()=>showStage(1);$('review-saved').onclick=()=>{showStage(2);say('Сохранённая комната. Можно исправить выделение или перейти к размерам.');};$('back-room').onclick=()=>showStage(2);
for(const id of ['area','reference-length','width','depth','ceiling','door-wall','door-offset','door-width','door-height','door-hinge','door-swing'])$(id).addEventListener('input',invalidate);
$('scale-mode').onchange=()=>{if(room){$('width').value=room.width;$('depth').value=room.depth;}scaleUI();invalidate();};
$('confirm-geometry').onchange=validate;
$('add-window').onclick=()=>{windows.push({id:crypto.randomUUID(),wall:'top',offset:300,width:1200,sill:850,height:1500});renderWindows();invalidate();};
$('continue').onclick=()=>{
  validate();if(geometryError||!$('confirm-geometry').checked)return;
  const project={schemaVersion:1,id:crypto.randomUUID(),purpose:'bedroom',source:{name:image.name,kind:sample?'example':image.originKind||'image',page:image.originPage||null,image},contour:rect,calibration:calibration(),room:{...room,reviewedByUser:true},heights:heights(),reviewedAt:new Date().toISOString()};
  try{localStorage.setItem(PLAN_KEY,JSON.stringify(project));location.href='/planner.html?from=plan';}catch{say('Не удалось сохранить проект в браузере. Уменьшите файл или освободите место; переход не выполнен.');}
};
try{
  const saved=JSON.parse(localStorage.getItem(PLAN_KEY));
  if(saved?.schemaVersion===1&&saved.source?.image&&saved.contour&&!planGeometryError(saved.room,saved.heights)){
    image=saved.source.image;rect=saved.contour;sample=saved.source.kind==='example';windows=saved.room.windows;page=saved.source.page||1;
    $('scale-mode').value=saved.calibration.mode;for(const[k,id]of [['area','area'],['length','reference-length'],['width','width'],['depth','depth']])$(id).value=saved.calibration[k]??'';
    for(const[k,id]of [['doorWall','door-wall'],['doorOffset','door-offset'],['doorWidth','door-width'],['doorHinge','door-hinge'],['doorSwing','door-swing']])$(id).value=saved.room[k];
    $('ceiling').value=saved.heights.ceiling;$('door-height').value=saved.heights.door;renderWindows();scaleUI();showStage(1);validate();$('resume').hidden=false;$('review-saved').hidden=false;
  }else if(localStorage.getItem('obzhivi-bedroom-layout-v1'))$('resume').hidden=false;
}catch{}
