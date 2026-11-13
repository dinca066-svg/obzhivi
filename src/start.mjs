import {detectPlanOpenings,assembleRecognizedRoom} from './plan-recognition.mjs';
import {recognizeArea} from './plan-ocr.mjs';
import {detectRoomRegions,rescaleRegions} from './room-detection.mjs';
import {PLAN_KEY,dimensionsFromPlan,planGeometryError} from './plan-core.mjs';
import {DEFAULT_HEIGHTS,openingsFor} from './scene-core.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
let stage=1,image=null,rect=null,windows=[],pdf=null,page=1,ticket=0,drag=null,first=null,room=null,geometryError='',sample=false;
let analyzing=false,analysisController=null,analysisCache=null,recognition=null;
let regions=[],selectedRegionId=null,selectionMode='regions',detecting=false;
const number=id=>Number($(id).value),wallOptions='<option value="left">Левая</option><option value="right">Правая</option><option value="top">Верхняя</option><option value="bottom">Нижняя</option>';
const say=t=>{$('message').textContent=t;};
function showStage(n){
 stage=n;$('upload-panel').hidden=n!==1;$('room-panel').hidden=n!==2;$('geometry-panel').hidden=n!==3;
 $('plan-title').textContent=n===3?'Размеры и проёмы на плане':'План квартиры';
 $('stage-title').textContent=n===1?'Сначала — ваша планировка':n===2?'Какая комната станет спальней?':'Изменить комнату';
 $('stage-description').textContent=n===1?'Загрузите план и выберите спальню. Мы определим размеры, дверь и окна и подготовим комнату для мебели.':n===2?'Выберите спальню — размеры, дверь и окна мы найдём на плане сами.':'Здесь можно исправить распознавание или уточнить размеры после обмера.';
 $('step-label').textContent=n===1?'01 · Загрузка плана':n===2?'01 · Выбор спальни':'01 · Размеры и проёмы';
 $('plan-hint').textContent=n===3?'Зелёный контур — спальня. Синий — окна, охра — дверь.':image?'Перед сборкой комнаты проверьте границы по внутреннему краю стен.':'Файл обрабатывается в этом браузере.';
 draw();
}
function sampleRegions(){return [{id:'central',x:533,y:66,width:287,height:277,area:10.68,sampleKey:'central',source:'example',verified:false},{id:'right',x:833,y:66,width:255,height:461,area:16.79,sampleKey:'right',source:'example',verified:false}];}
function buildRegions(){
 const layer=$('room-regions'),list=$('room-options');layer.replaceChildren();list.replaceChildren();
 regions.forEach((r,i)=>{
  const g=document.createElementNS(NS,'g');g.dataset.region=r.id;g.classList.add('room-region','region-color-'+i%4);g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',`Выбрать комнату ${i+1} как спальню${r.area?' · '+r.area.toLocaleString('ru-RU')+' м²':''}`);
  const size=Math.max(22,image.width/35),cx=r.x+r.width/2,cy=r.y+Math.min(r.height*.24,size*1.8);
  g.innerHTML=`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/><circle cx="${cx}" cy="${cy}" r="${size/2}"/><text x="${cx}" y="${cy}" font-size="${size*.52}" dominant-baseline="central" text-anchor="middle">${i+1}</text><path class="region-check" d="M${cx-size*.25} ${cy}l${size*.16} ${size*.17} ${size*.34} ${-size*.35}"/>`;
  g.addEventListener('click',()=>chooseRegion(r.id));g.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();chooseRegion(r.id);}});
  layer.append(g);
  const button=document.createElement('button');button.type='button';button.className='room-option region-color-'+i%4;button.dataset.region=r.id;button.setAttribute('aria-pressed','false');
  const swatch=document.createElement('span');swatch.className='room-swatch';swatch.textContent=i+1;const label=document.createElement('span');label.textContent='Комната '+(i+1)+(r.area?' · '+r.area.toLocaleString('ru-RU')+' м²':'');button.append(swatch,label);button.onclick=()=>chooseRegion(r.id);
  for(const [event,on] of [['pointerenter',true],['pointerleave',false],['focus',true],['blur',false]])button.addEventListener(event,()=>g.classList.toggle('is-hovered',on));list.append(button);
 });
}
function chooseRegion(id){
 if(stage!==2||selectionMode!=='regions'||detecting||analyzing)return;
 const r=regions.find(r=>r.id===id);if(!r||selectedRegionId===id&&rect)return;
 initGeometry();first=null;selectedRegionId=id;
 if(r.sampleKey)chooseSample(r.sampleKey);else{rect={x:r.x,y:r.y,width:r.width,height:r.height};invalidate();}
 say('Спальня выбрана. Можно выбрать другую комнату или собрать комнату.');draw();
}
function updateSelection(){
 const manual=selectionMode==='manual',valid=rect&&rect.width>=5&&rect.height>=5,selected=regions.find(r=>r.id===selectedRegionId),index=regions.indexOf(selected);
 $('source-plan').classList.toggle('manual-mode',stage===2&&manual);$('source-plan').setAttribute('aria-label',stage===3?'План спальни с дверью и окнами':manual?'План квартиры: укажите два противоположных угла спальни':'План квартиры: выберите спальню');
 const showRegions=stage===2&&!manual;$('room-regions').style.display=showRegions?'':'none';$('room-regions').setAttribute('aria-hidden',String(!showRegions));for(const n of $('room-regions').children)n.setAttribute('tabindex',showRegions?'0':'-1');$('room-options').hidden=stage!==2||manual||!regions.length;
 for(const node of document.querySelectorAll('[data-region]')){const on=node.dataset.region===selectedRegionId;node.setAttribute('aria-pressed',String(on));node.classList.toggle('is-selected',on);node.classList.toggle('is-muted',!!selectedRegionId&&!on);}
 $('crop-tools').hidden=stage!==2||!manual;$('reset-selection').hidden=!valid&&!first;$('back-regions').hidden=!regions.length;
 $('selection-instruction').hidden=stage!==2;
 $('selection-instruction').textContent=detecting?'Ищем границы комнат на плане…':manual?(first?'Первый угол отмечен. Теперь нажмите противоположный угол.':valid?'Границы спальни выделены. Потяните за угол, чтобы поправить их.':'Нажмите на два противоположных внутренних угла спальни.'):regions.length?'Нажмите на выделенную комнату, которая станет спальней.':'Не удалось уверенно найти комнаты. Укажите спальню вручную.';
 $('selection-title').textContent=valid?'Спальня выбрана':manual?'Укажите границы спальни':detecting?'Определяем границы комнат':'Выберите спальню на плане';
 $('selection-description').textContent=valid?'Выбор сохранён на этом шаге. Проверьте, что выделена нужная комната.':manual?'Отметьте два угла на плане или задайте границы числами под изображением.':detecting?'Это займёт немного времени. План обрабатывается в вашем браузере.':regions.length?'Нажмите на цветную область или выберите комнату из списка под планом.':'На этом изображении границы недостаточно чёткие. Можно выделить прямоугольную комнату самостоятельно.';
 $('selected-room').hidden=!valid;$('selected-room-name').textContent=selected?'Комната '+(index+1)+' · спальня':'Спальня · свои границы';
 $('selected-room-area').textContent=selected?.area?selected.area.toLocaleString('ru-RU')+' м² · площадь с примера':number('area')>0&&$('scale-mode').value==='area'?number('area').toLocaleString('ru-RU')+' м² · '+(recognition?.areaSource==='ocr'?'прочитано с плана':'указано вами'):'Площадь и проёмы определим автоматически';
 $('selection-status').textContent=detecting?'':manual?'Укажите прямоугольную спальню по внутренним границам стен.':sample?'На примере подсвечены две заранее размеченные комнаты.':regions.length?'Предварительное выделение по линиям плана. Проверьте границы.':'Сейчас поддерживаются прямоугольные комнаты.';
 $('continue-hint').textContent=valid?'Найдём площадь, дверь и окна и откроем расстановку мебели.':manual?'Кнопка станет доступна после выделения двух углов.':'Сначала выберите комнату на плане.';
 $('to-geometry').disabled=!valid||detecting||analyzing;$('manual-selection').hidden=manual;$('manual-selection').disabled=detecting||analyzing;
 $('manual-selection').textContent=valid?'Исправить границы спальни':'Указать спальню вручную';$('manual-help').hidden=manual||detecting;
}
async function findRegions(){
 const current=image;detecting=true;regions=[];buildRegions();draw();
 try{
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const img=new Image();img.src=current.url;await img.decode();if(image!==current)return;
  const scale=Math.min(1,900/img.naturalWidth,900/img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  regions=rescaleRegions(detectRoomRegions(ctx.getImageData(0,0,canvas.width,canvas.height)),canvas,current);
 }catch{if(image===current)regions=[];}finally{if(image===current){detecting=false;buildRegions();draw();}}
}
function drawHandles(){
 const host=$('selection-handles'),marker=$('first-corner');host.replaceChildren();marker.replaceChildren();if(stage!==2||selectionMode!=='manual'||!image)return;
 const radius=Math.max(image.width/65,8);
 if(first){const dot=document.createElementNS(NS,'circle');for(const[k,v]of Object.entries({cx:first.x,cy:first.y,r:radius,fill:'#385333',stroke:'white','stroke-width':radius*.25}))dot.setAttribute(k,v);marker.append(dot);}
 if(!rect||rect.width<5||rect.height<5)return;
 for(const [i,p] of [[0,[rect.x,rect.y]],[1,[rect.x+rect.width,rect.y]],[2,[rect.x+rect.width,rect.y+rect.height]],[3,[rect.x,rect.y+rect.height]]]){
  const handle=document.createElementNS(NS,'circle');for(const[k,v]of Object.entries({cx:p[0],cy:p[1],r:radius,fill:'white',stroke:'#385333','stroke-width':Math.max(image.width/400,2),tabindex:0,role:'button','aria-label':'Угол '+(i+1)+'. Перетащите или двигайте стрелками.', 'data-handle':i}))handle.setAttribute(k,v);
  handle.addEventListener('keydown',e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const step=e.shiftKey?10:1,q={x:Math.max(0,Math.min(image.width,p[0]+delta[0]*step)),y:Math.max(0,Math.min(image.height,p[1]+delta[1]*step))};const opposite=oppositeCorner(i);selectedRegionId=null;setRect(opposite,q);invalidate();host.querySelector('[data-handle="'+i+'"]')?.focus();});host.append(handle);
 }
}
function oppositeCorner(i){return {x:rect.x+([0,3].includes(i)?rect.width:0),y:rect.y+([0,1].includes(i)?rect.height:0)};}
function invalidate(){ validate(); }
function draw(){
  $('blank-plan').hidden=!!image;$('plan-stage').hidden=!image;
  if(image){$('source-plan').setAttribute('viewBox',`0 0 ${image.width} ${image.height}`);for(const k of ['width','height'])$('plan-image').setAttribute(k,image[k]);$('plan-image').setAttribute('href',image.url);$('source-name').textContent=image.name;}
  updateSelection();drawHandles();
  const r=$('room-outline');r.setAttribute('visibility',rect&&(stage!==2||selectionMode==='manual'||!selectedRegionId)?'visible':'hidden');if(rect){for(const k of ['x','y','width','height']){r.setAttribute(k,rect[k]);$('crop-'+k).value=Math.round(rect[k]);}r.setAttribute('stroke-width',Math.max(image.width/350,2));}

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
  $('geometry-error').textContent=stage===3?geometryError:'';$('continue').disabled=!!geometryError;draw();
}
function renderWindows(){
  const host=$('windows');host.replaceChildren();windows.forEach((w,i)=>{
    const div=document.createElement('div');div.className='window-card';div.innerHTML=`<div><strong>Окно ${i+1}</strong><button type="button" aria-label="Убрать окно ${i+1}">Убрать</button></div><div class="fields"><label>Стена окна ${i+1}<select data-key="wall">${wallOptions}</select></label>${[['offset','Отступ'],['width','Ширина'],['sill','Подоконник'],['height','Высота']].map(([k,label])=>`<label>${label} окна ${i+1}, мм<input data-key="${k}" type="number" min="0"></label>`).join('')}</div>`;
    for(const input of div.querySelectorAll('[data-key]')){input.value=w[input.dataset.key];input.addEventListener('input',()=>{w[input.dataset.key]=input.dataset.key==='wall'?input.value:Number(input.value);invalidate();});}
    div.querySelector('button').onclick=()=>{windows.splice(i,1);renderWindows();invalidate();};host.append(div);
  });
}
function initGeometry(){
  analysisCache=null;recognition=null;$('area-help').hidden=true;$('recognition-error').textContent='';$('repair-geometry').hidden=true;$('missing-area').value='';
  $('ceiling').value=DEFAULT_HEIGHTS.ceiling;$('door-height').value=DEFAULT_HEIGHTS.door;$('door-hinge').value='start';$('door-swing').value='inward';
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
async function setImage(data){image=data;rect=null;first=null;selectedRegionId=null;selectionMode='regions';detecting=false;regions=sample?sampleRegions():[];buildRegions();initGeometry();showStage(2);say('');if(!sample)await findRegions();}
async function imageData(source,name){const width=Math.min(1600,source.naturalWidth||source.width),height=Math.round((source.naturalHeight||source.height)*width/(source.naturalWidth||source.width));const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(source,0,0,width,height);return {name,width,height,url:c.toDataURL('image/jpeg',.85)};}
async function renderPage(n,t){const p=await pdf.getPage(n),vp=p.getViewport({scale:1}),viewport=p.getViewport({scale:Math.min(1600/vp.width,2000/vp.height)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await p.render({canvasContext:canvas.getContext('2d'),viewport}).promise;if(t!==ticket)return;page=n;await setImage({...await imageData(canvas,pdfName),originKind:'pdf',originPage:n});$('pdf-pages-label').hidden=pdf.numPages<2;}
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
      const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(img.width*img.height>60000000)throw Error('Изображение слишком большое. Уменьшите его до 60 мегапикселей.');if(t!==ticket)return;if(pdf)await pdf.loadingTask.destroy();pdf=null;page=1;await setImage(await imageData(img,file.name));$('pdf-pages-label').hidden=true;}finally{URL.revokeObjectURL(url);}
    }
  }catch(e){say('Не удалось открыть файл. '+(file.type==='application/pdf'?'Для PDF с паролем используйте копию без защиты или изображение страницы.':e.message));}finally{if(t===ticket){$('plan-file').disabled=false;$('sample-plan').disabled=false;$('plan-file').value='';}}
};
$('pdf-pages').onchange=async()=>{const t=++ticket;try{await renderPage(number('pdf-pages'),t);}catch{say('Не удалось открыть страницу PDF.');}};
$('sample-plan').onclick=async()=>{const t=++ticket;try{const img=new Image();img.src='/plans/apartment.jpg';await img.decode();if(t!==ticket)return;pdf=null;page=1;sample=true;await setImage({name:'Наша квартира · пример',width:1280,height:741,url:'/plans/apartment.jpg'});$('pdf-pages-label').hidden=true;showStage(2);say('Выберите одну из подсвеченных комнат.');}catch{say('Не удалось загрузить пример. Попробуйте свой файл.');}};
const svg=$('source-plan');
function point(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:Math.max(0,Math.min(image.width,p.x)),y:Math.max(0,Math.min(image.height,p.y))};}
function clearAnalysis(){analysisCache=null;recognition=null;$('area-help').hidden=true;$('missing-area').value='';$('recognition-error').textContent='';$('repair-geometry').hidden=true;}
function setRect(a,b){clearAnalysis();rect={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};draw();}
svg.onpointerdown=e=>{if(stage!==2||!image||selectionMode!=='manual'||e.button!==0)return;e.preventDefault();const p=point(e),handle=e.target.closest('[data-handle]');drag={start:handle?oppositeCorner(Number(handle.dataset.handle)):p,id:e.pointerId,moved:false,resize:!!handle};svg.setPointerCapture(e.pointerId);};
svg.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const p=point(e);if(drag.resize||Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>5){drag.moved=true;selectedRegionId=null;first=null;setRect(drag.start,p);}};
svg.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const p=point(e);if(drag.moved){setRect(drag.start,p);first=null;}else if(!drag.resize){if(first){setRect(first,p);first=null;}else{first=p;rect=null;selectedRegionId=null;initGeometry();say('Первый угол отмечен. Теперь нажмите противоположный угол.');draw();}}if(rect&&rect.width>=5&&rect.height>=5)say('Спальня выделена. Проверьте границы и соберите комнату.');drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);invalidate();};
svg.onpointercancel=()=>{drag=null;draw();};
$('reset-selection').onclick=()=>{rect=null;first=null;selectedRegionId=null;initGeometry();draw();say('Нажмите на первый внутренний угол спальни.');};
$('manual-selection').onclick=()=>{selectionMode='manual';first=null;draw();say('');};
$('back-regions').onclick=()=>{selectionMode='regions';first=null;draw();say('Нажмите на комнату на плане.');};
$('apply-crop').onclick=()=>{const r=Object.fromEntries(['x','y','width','height'].map(v=>[v,number('crop-'+v)]));if(!Object.values(r).every(Number.isFinite)||r.x<0||r.y<0||r.width<5||r.height<5||r.x+r.width>image.width||r.y+r.height>image.height){say('Граница должна находиться внутри изображения.');draw();return;}clearAnalysis();rect=r;first=null;selectedRegionId=null;invalidate();};
$('to-geometry').onclick=buildAutomatically;
$('cancel-analysis').onclick=()=>analysisController?.abort();
$('repair-geometry').onclick=()=>{showStage(3);validate();say('Измените только то, что нужно исправить.');};
$('change-file').onclick=()=>showStage(1);$('review-saved').onclick=async()=>{showStage(2);if(!regions.length&&!sample)await findRegions();say('Сохранённая спальня выделена. Можно исправить границы или собрать комнату.');};$('back-room').onclick=()=>{showStage(2);say('');};
for(const id of ['area','reference-length','width','depth','ceiling','door-wall','door-offset','door-width','door-height','door-hinge','door-swing'])$(id).addEventListener('input',invalidate);
$('scale-mode').onchange=()=>{if(room){$('width').value=room.width;$('depth').value=room.depth;}scaleUI();invalidate();};
$('add-window').onclick=()=>{windows.push({id:crypto.randomUUID(),wall:'top',offset:300,width:1200,sill:850,height:1500});renderWindows();invalidate();};
function saveProject(result,manual=false){
  const project={schemaVersion:1,id:crypto.randomUUID(),purpose:'bedroom',source:{name:image.name,kind:sample?'example':image.originKind||'image',page:image.originPage||null,image},contour:{...rect},selection:{method:selectionMode,regionId:selectedRegionId,regions},...result,room:{...result.room,reviewedByUser:manual},createdAt:new Date().toISOString()};
  try{localStorage.setItem(PLAN_KEY,JSON.stringify(project));location.href='/planner.html?from=plan';}catch{throw Error('Не удалось сохранить проект в браузере. Уменьшите файл или освободите место.');}
}
$('continue').onclick=()=>{validate();if(geometryError)return;try{saveProject({room,heights:heights(),calibration:calibration(),recognition:recognition?{...recognition,manuallyEdited:true}:null},true);}catch(e){say(e.message);}};
function analysisUI(on){
 analyzing=on;$('room-panel').setAttribute('aria-busy',String(on));$('plan-card').inert=on;
 for(const id of ['manual-selection','change-file','missing-area','repair-geometry'])$(id).disabled=on;
 $('cancel-analysis').hidden=!on;$('analysis-progress').hidden=!on;
 $('to-geometry').textContent=on?'Собираем спальню…':'Перейти к расстановке →';draw();
}
async function buildAutomatically(){
 if(analyzing||!rect)return;
 const controller=new AbortController();analysisController=controller;
 const current=image,bounds={...rect},signature=JSON.stringify(bounds);analysisUI(true);
 $('recognition-error').textContent='';$('repair-geometry').hidden=true;$('analysis-progress').textContent='Читаем площадь и ищем окна и дверь…';say('');
 try{
  if(!analysisCache||analysisCache.image!==current||analysisCache.signature!==signature){
   const source=new Image();source.src=current.url;await source.decode();controller.signal.throwIfAborted();
   const canvas=document.createElement('canvas');canvas.width=current.width;canvas.height=current.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
   const detection=detectPlanOpenings(ctx.getImageData(0,0,canvas.width,canvas.height),bounds);
   const ocr=await recognizeArea(source,bounds,controller.signal,()=>{$('analysis-progress').textContent='Читаем площадь комнаты…';});
   controller.signal.throwIfAborted();analysisCache={image:current,signature,detection,...ocr};
  }
  controller.signal.throwIfAborted();if(current!==image||signature!==JSON.stringify(rect))return;
  const provided=!$('area-help').hidden?Number($('missing-area').value.replace(',','.')):null;
  const area=analysisCache.area||provided;
  if(!area||!Number.isFinite(area)||area<2||area>225){$('area-help').hidden=false;$('missing-area').focus();throw Error('Не удалось прочитать площадь этой комнаты. Укажите только площадь — остальные данные определим по плану.');}
  $('area').value=area;$('scale-mode').value='area';scaleUI();
  const result=assembleRecognizedRoom(bounds,area,analysisCache.detection);
  result.recognition.areaSource=analysisCache.area?'ocr':'user';result.recognition.areaEvidence=analysisCache.evidence;
  recognition=result.recognition;windows=result.room.windows;
  for(const[k,id]of [['doorWall','door-wall'],['doorOffset','door-offset'],['doorWidth','door-width'],['doorHinge','door-hinge'],['doorSwing','door-swing']])$(id).value=result.room[k];
  renderWindows();$('analysis-progress').textContent='Комната готова. Открываем мебель…';saveProject(result);
 }catch(e){
  if(!controller.signal.aborted){$('recognition-error').textContent=e.message||'Не удалось прочитать план. Попробуйте ещё раз.';$('repair-geometry').hidden=false;}
 }finally{if(analysisController===controller){analysisController=null;analysisUI(false);if(!$('area-help').hidden)$('missing-area').focus();}}
}

try{
  const saved=JSON.parse(localStorage.getItem(PLAN_KEY));
  if(saved?.schemaVersion===1&&saved.source?.image&&saved.contour&&!planGeometryError(saved.room,saved.heights)){
    recognition=saved.recognition||null;image=saved.source.image;rect=saved.contour;sample=saved.source.kind==='example';windows=saved.room.windows;page=saved.source.page||1;
    regions=sample?sampleRegions():(saved.selection?.regions||[]).filter(r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=image.width+1&&r.y+r.height<=image.height+1).slice(0,12);selectedRegionId=saved.selection?.regionId||null;selectionMode='regions';buildRegions();
    $('scale-mode').value=saved.calibration.mode;for(const[k,id]of [['area','area'],['length','reference-length'],['width','width'],['depth','depth']])$(id).value=saved.calibration[k]??'';
    for(const[k,id]of [['doorWall','door-wall'],['doorOffset','door-offset'],['doorWidth','door-width'],['doorHinge','door-hinge'],['doorSwing','door-swing']])$(id).value=saved.room[k];
    $('ceiling').value=saved.heights.ceiling;$('door-height').value=saved.heights.door;renderWindows();scaleUI();showStage(1);validate();$('resume').hidden=false;$('review-saved').hidden=false;if(new URLSearchParams(location.search).get('edit')==='geometry'){showStage(3);validate();}
  }else if(localStorage.getItem('obzhivi-bedroom-layout-v1'))$('resume').hidden=false;
}catch{}
