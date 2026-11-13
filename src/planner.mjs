import {PLAN_KEY,planGeometryError} from './plan-core.mjs';
import {windowsFor,openingPlanPath,DEFAULT_HEIGHTS} from './scene-core.mjs';
import {bedsidePair,furnitureErrors,furnitureSvg} from './furniture-layout.mjs';
import { listProducts } from './db.mjs';
import { safeProductUrl, validDimensions } from './core.mjs';
import { productPhoto } from './product-photo.mjs';
import { DEFAULT_ROOM, footprint, boundsOf, assessPlacement, snapPosition, validRoom, restorePlacement, doorGeometry, wallLength } from './placement-core.mjs';
const $=id=>document.getElementById(id), key='obzhivi-bedroom-layout-v1';
let planProject=null;try{const p=JSON.parse(localStorage.getItem(PLAN_KEY));if(p?.schemaVersion===1&&!planGeometryError(p.room,p.heights))planProject=p;}catch{}
const fmt=n=>Math.round(n).toLocaleString('ru-RU');
const names={left:'Слева',right:'Справа',top:'Сверху',bottom:'Снизу'};
let allProducts=[],items=[],selectedItem=null,itemDrag=null;
let room={...DEFAULT_ROOM},position=null,product,products=[],drag=null,dirty=true,storageAvailable=true;
const demo={id:'demo-bed',name:'Учебная кровать',manufacturer:'Пример',sku:'DEMO-BED',category:'bed',demo:true,dimensionsMm:{width:1800,depth:2200,height:1100}};
function dirtyLayout(){dirty=true;$('save-note').textContent='Есть изменения. Сохраните подходящее положение.';}
function updateRoomInputs(){for(const[id,value]of Object.entries({'room-width':room.width,'room-depth':room.depth,'door-offset':room.doorOffset,'door-width':room.doorWidth,'door-wall':room.doorWall,'door-hinge':room.doorHinge,'door-swing':room.doorSwing}))$(id).value=value;updateDoorLabels();}
function updateDoorLabels(){const vertical=['left','right'].includes($('door-wall').value);$('door-offset-label').textContent=vertical?'От верхнего угла, мм':'От левого угла, мм';$('door-hinge').options[0].text=vertical?'Сверху на плане':'Слева на плане';$('door-hinge').options[1].text=vertical?'Снизу на плане':'Справа на плане';}
function renderProduct(){
  const host=$('selected-product');host.replaceChildren();
  const photo=productPhoto(product);if(photo){const img=document.createElement('img');img.className='selected-image';img.src=photo.src;img.alt='Фото товара: '+product.name;host.append(img);}else{const empty=document.createElement('div');empty.className='photo-placeholder';empty.textContent='Фото товара пока не добавлено';host.append(empty);}
  const title=document.createElement('p');title.className='selected-name';title.textContent=product.name;host.append(title);
  const meta=document.createElement('p');meta.className='selected-meta';const d=product.dimensionsMm;meta.textContent=`${product.manufacturer} · ${fmt(d.width)} × ${fmt(d.depth)} × ${fmt(d.height)} мм`;host.append(meta);
  const url=safeProductUrl(product.productUrl);if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className='seller-link';a.textContent='Посмотреть у продавца ↗';host.append(a);}
  $('catalog-note').textContent=product.demo?'Учебный пример. Для своей мебели добавьте и проверьте товар в каталоге.':'Кровать из вашего каталога. Контур учитывает габариты карточки и выступы 3D-модели.';
}
function renderArchitecture(){
  const w=room.width,d=room.depth,o=room.doorOffset,r=room.doorWidth;
  const margin=room.doorSwing==='outward'?Math.max(640,r+150):640;$('room-plan').setAttribute('viewBox',`${-margin} ${-margin} ${w+margin*2} ${d+margin*2}`);
  $('room-caption').textContent=`${(w/1000).toLocaleString('ru-RU')} × ${(d/1000).toLocaleString('ru-RU')} м · ${(w*d/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})} м²`;
  // Openings follow the source image proportions; both remain explicitly provisional.
  const windowPath=windowsFor(room).map(o=>openingPlanPath(o,room)).join(' ');
  const dg=doorGeometry(room),xy=p=>`${p.x} ${p.z}`,sweep=`M${xy(dg.hinge)} L${dg.arc.map(xy).join(' L')} Z`,access=dg.access.map(xy).join(' '),a=dg.map(o,0),b=dg.map(o+r,0);
  $('architecture').innerHTML=`<rect x="0" y="0" width="${w}" height="${d}" fill="#fafbf7"/><rect x="0" y="0" width="${w}" height="${d}" fill="url(#grid)"/><polygon points="${access}" fill="#ede3cd" fill-opacity=".6" stroke="#c7ac72" stroke-dasharray="25 20" stroke-width="7"/><path d="${sweep}" fill="#e2c990" fill-opacity=".45" stroke="#ba9c60" stroke-width="8"/><path d="M0 0 H${w} V${d} H0 Z" fill="none" stroke="#526345" stroke-width="65"/><path d="${windowPath}" fill="none" stroke="#edf0e6" stroke-width="70"/><path d="${windowPath}" fill="none" stroke="#91bac8" stroke-width="28"/><path d="M${xy(a)} L${xy(b)}" stroke="#fafbf7" stroke-width="72"/><path d="M${xy(dg.hinge)} L${xy(dg.opened)}" stroke="#9d7c3c" stroke-width="20"/><circle cx="${dg.hinge.x}" cy="${dg.hinge.z}" r="30" fill="#9d7c3c"/><g id="door-on-plan" role="button" tabindex="0" aria-label="Настроить дверь на плане"><rect x="${Math.min(a.x,b.x)-110}" y="${Math.min(a.z,b.z)-110}" width="${Math.abs(a.x-b.x)+220}" height="${Math.abs(a.z-b.z)+220}" fill="transparent" pointer-events="all"/></g><text x="${w/2}" y="-205" font-size="115" text-anchor="middle" fill="#53624a">${fmt(w)} мм</text><text x="${w+320}" y="${d/2}" font-size="115" text-anchor="middle" fill="#53624a" transform="rotate(90 ${w+320} ${d/2})">${fmt(d)} мм</text>`;
  $('empty-plan').setAttribute('x',w/2);$('empty-plan').setAttribute('y',d/2);$('empty-plan').hidden=!!position;$('empty-plan').style.display=position?'none':'';
}
function dimensionLine(x1,y1,x2,y2,value){if(value<0)return '';return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#81956f" stroke-width="7" stroke-dasharray="18 15"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-35}" text-anchor="middle" font-size="95" fill="#435b31" stroke="#fafbf7" stroke-width="22" paint-order="stroke">${fmt(value)}</text>`;}
function render(){
  if(Array.isArray(room.windows)){const error=planGeometryError(room,planProject?.heights||DEFAULT_HEIGHTS);$('room-error').textContent=error;$('room-error').hidden=!error;}
  renderArchitecture();$('placement-controls').hidden=!position;$('place-bed').textContent=position?'Вернуть в центр комнаты':'Поставить в комнате';
  $('continue-design').disabled=!position; $('rotate-bed').hidden=!position;requestAnimationFrame(positionRotateButton);
  if(!position){$('furniture').replaceChildren();$('distances').replaceChildren();renderItems();return;}
  const size=footprint(product),a=assessPlacement(room,position,size),b=a.bounds,w=size.width,d=size.depth;
  const bad=a.outside||a.doorBlocked,stroke=bad?'#a84f3c':'#526e3f',fill=bad?'#ead0c8':'#cfdbc2';
  $('furniture').innerHTML=`<g id="bed-shape" role="button" tabindex="0" aria-label="Кровать на плане. Перетаскивайте или двигайте стрелками клавиатуры; R — поворот." transform="translate(${position.x} ${position.z}) rotate(${position.rotation})"><rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" rx="45" fill="${fill}" stroke="${stroke}" stroke-width="16"/><rect x="${-w/2}" y="${-d/2}" width="${w}" height="115" rx="25" fill="${stroke}"/><rect x="${-w/2+80}" y="${-d/2+185}" width="${w-160}" height="${d-260}" rx="70" fill="#f5f6ef" stroke="#aebba3" stroke-width="7"/><rect x="${-w/2+150}" y="${-d/2+260}" width="${w/2-210}" height="320" rx="65" fill="white" stroke="#c4ccb9" stroke-width="6"/><rect x="60" y="${-d/2+260}" width="${w/2-210}" height="320" rx="65" fill="white" stroke="#c4ccb9" stroke-width="6"/><path d="M${-w/2+85} ${-d/2+700} H${w/2-85}" stroke="#b0bca5" stroke-width="10"/><text y="280" text-anchor="middle" font-size="110" fill="#56664c">Кровать</text><text y="430" text-anchor="middle" font-size="90" fill="#748169">${position.rotation}°</text></g>`;
  $('distances').innerHTML=dimensionLine(0,position.z,b.left,position.z,a.gaps.left)+dimensionLine(b.right,position.z,room.width,position.z,a.gaps.right)+dimensionLine(position.x,0,position.x,b.top,a.gaps.top)+dimensionLine(position.x,b.bottom,position.x,room.depth,a.gaps.bottom);
  $('bed-x').value=Math.round(position.x);$('bed-z').value=Math.round(position.z);
  const status=$('placement-status');status.replaceChildren();status.className='placement-status'+(bad?' error':a.tight.length?' warning':'');
  const messages=[];if(a.outside)messages.push('Кровать пересекает стену. Переместите её внутрь комнаты.');if(a.doorSweepBlocked)messages.push('Кровать мешает открыванию двери. Освободите отмеченную дугой зону.');if(a.doorAccessBlocked)messages.push('Кровать перекрывает подход к двери. Оставьте свободными 60 см перед проёмом.');if(!bad)messages.push('Кровать внутри комнаты; зона двери свободна.');if(a.tight.length)messages.push(`Тесный проход: ${a.tight.map(side=>names[side].toLowerCase()).join(', ')} — менее 60 см.`);
  for(const text of messages){const p=document.createElement('p');p.textContent=text;status.append(p);}
  const list=$('gap-list');list.replaceChildren();for(const[side,gap]of Object.entries(a.gaps)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=names[side]+' до стены';dd.textContent=fmt(gap)+' мм';if(gap<0)dd.className='negative';list.append(dt,dd);}
  $('save-layout').disabled=!a.canSave||!$('door-error').hidden||!$('room-error').hidden; $('continue-design').disabled=$('save-layout').disabled;$('save-layout').textContent=dirty?'Сохранить расстановку':'Расстановка сохранена';renderItems();
}
function positionRotateButton(){if(!position)return;const matrix=$('room-plan').getScreenCTM();if(!matrix)return;const p=new DOMPoint(position.x,position.z).matrixTransform(matrix),parent=$('plan-stage').getBoundingClientRect();$('rotate-bed').style.left=`${p.x-parent.left}px`;$('rotate-bed').style.top=`${p.y-parent.top}px`;}
new ResizeObserver(positionRotateButton).observe($('plan-stage'));
function move(dx,dz){if(!position)return;position={...position,x:position.x+dx,z:position.z+dz};dirtyLayout();render();}
function rotate(){if(!position)return;position={...position,rotation:(position.rotation+90)%360};dirtyLayout();render();}
function point(event){const matrix=$('room-plan').getScreenCTM();return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());}
const svg=$('room-plan');
svg.addEventListener('pointerdown',event=>{if(!event.target.closest('#bed-shape')||!position)return;event.preventDefault();const p=point(event);drag={id:event.pointerId,dx:p.x-position.x,dz:p.y-position.z};svg.setPointerCapture(event.pointerId);});
svg.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const p=point(event);position=snapPosition(room,{...position,x:p.x-drag.dx,z:p.y-drag.dz},footprint(product),$('snap').checked);dirtyLayout();render();});
function endDrag(event){if(drag?.id!==event.pointerId)return;drag=null;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);}
svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
svg.addEventListener('keydown',event=>{if(!event.target.closest('#bed-shape')||!position||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','r','R','к','К'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?10:100;if(['r','R','к','К'].includes(event.key))rotate();else move(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);$('bed-shape').focus({preventScroll:true});});
$('place-bed').onclick=()=>{position={x:room.width/2,z:room.depth/2,rotation:0};dirtyLayout();render();};
$('rotate-bed').onclick=rotate;
function openDoorSettings(){$('door-settings').open=true;$('door-wall').focus({preventScroll:true});$('door-settings').scrollIntoView({block:'nearest',behavior:'smooth'});}
svg.addEventListener('click',event=>{if(event.target.closest('#door-on-plan'))openDoorSettings();});
svg.addEventListener('keydown',event=>{if(event.target.closest('#door-on-plan')&&['Enter',' '].includes(event.key)){event.preventDefault();openDoorSettings();}});
document.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{const step=Number($('move-step').value),v={left:[-step,0],right:[step,0],up:[0,-step],down:[0,step]}[button.dataset.move];move(...v);});
for(const[id,axis]of[['bed-x','x'],['bed-z','z']])$(id).oninput=()=>{const n=Number($(id).value);if(!position||!$(id).value||!Number.isFinite(n)||Math.abs(n)>30000)return;position[axis]=n;dirtyLayout();render();};
$('bed-select').onchange=()=>{product=products.find(p=>p.id===$('bed-select').value);position=null;dirtyLayout();renderProduct();render();};
function applyDoorSettings(){updateDoorLabels();const candidate={...room,doorWall:$('door-wall').value,doorHinge:$('door-hinge').value,doorSwing:$('door-swing').value,doorOffset:Number($('door-offset').value),doorWidth:Number($('door-width').value)};if(!validRoom(candidate)){$('door-error').textContent='Дверь должна быть шириной 500–2000 мм и помещаться на выбранной стене.';$('door-error').hidden=false;$('save-layout').disabled=true;$('continue-design').disabled=true;return;}$('door-error').hidden=true;room=candidate;dirtyLayout();render();}
for(const id of ['door-hinge','door-swing','door-offset','door-width'])$(id).addEventListener('input',applyDoorSettings);
$('door-wall').onchange=()=>{const candidate={...room,doorWall:$('door-wall').value};$('door-offset').value=Math.max(0,Math.min(Number($('door-offset').value),wallLength(candidate)-Number($('door-width').value)));applyDoorSettings();};
$('apply-room').onclick=()=>{const candidate={...room,width:Number($('room-width').value),depth:Number($('room-depth').value),verified:false};if(!validRoom(candidate)){$('room-error').textContent='Стены должны быть 1500–15000 мм, а дверь — целиком на выбранной стене.';$('room-error').hidden=false;$('save-layout').disabled=true;$('continue-design').disabled=true;return;}$('room-error').hidden=true;room=candidate;dirtyLayout();render();};
function saveLayout(){if(!position||furnitureErrors(room,position,product,items,allProducts).length||!assessPlacement(room,position,footprint(product)).canSave||!$('door-error').hidden||!$('room-error').hidden)return false;const data={schemaVersion:1,sourceProjectId:planProject?.id||null,heights:planProject?.heights||null,planSource:planProject?{name:planProject.source.name,kind:planProject.source.kind,page:planProject.source.page,contour:planProject.contour,calibration:planProject.calibration,recognition:planProject.recognition||null,imageSize:[planProject.source.image.width,planProject.source.image.height]}:null,furniture:items,room:{...room,verified:false,source:room.source||'area_and_image_proportions_then_manual_edits'},placement:{productId:product.id,x:position.x,z:position.z,rotation:position.rotation,units:'mm',origin:'room_top_left',rotationConvention:'clockwise_top_view'},updatedAt:new Date().toISOString()};try{localStorage.setItem(key,JSON.stringify(data));dirty=false;$('save-note').textContent='Сохранено в этом браузере. Геометрия комнаты остаётся предварительной.';render();return true;}catch{$('save-note').textContent='Браузер не разрешил сохранение. Расстановка остаётся на экране.';return false;}}
$('save-layout').onclick=saveLayout;
$('continue-design').onclick=()=>{if(saveLayout())location.href='/cameras.html';};
$('remove-bed').onclick=()=>{position=null;items=[];selectedItem=null;dirty=true;try{localStorage.removeItem(key);}catch{}render();};
try{allProducts=await listProducts();products=allProducts.filter(p=>p.category==='bed'&&validDimensions(p.dimensionsMm));}catch{storageAvailable=false;}
if(!products.length)products=[demo];
for(const p of products){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('bed-select').append(option);}
product=products.find(p=>p.id===new URLSearchParams(location.search).get('product'))||products.find(p=>p.sku==='YM-5971077429')||products[0];
if(planProject){room={...planProject.room};document.querySelector('.room-badge').textContent='Спальня · из вашего плана';document.querySelector('.geometry .hint').textContent='Размеры оценены по площади и пропорциям плана. Окна, высоты и размеры можно изменить по ссылке выше.';}
if(planProject?.recognition){
 $('recognition-note').hidden=false;$('recognition-note').textContent='По плану определены '+room.windows.length+' '+(room.windows.length===1?'окно':'окна')+' и дверь. Размеры приблизительные; высота потолка принята '+(planProject.heights.ceiling/1000).toLocaleString('ru-RU')+' м.';
 const assumptions=document.createElement('p');assumptions.className='hint';assumptions.textContent='Высота двери, окон и подоконников, петли и открывание приняты типовыми: на плане сверху этих данных может не быть. Их можно изменить по ссылке выше.';document.querySelector('.geometry .hint').after(assumptions);
}

try{const saved=JSON.parse(localStorage.getItem(key));const restored=restorePlacement(saved,products);if(restored&&(!planProject||saved.sourceProjectId===planProject.id)&&(!new URLSearchParams(location.search).get('product')||restored.product.id===product.id)){room=restored.room;position=restored.position;items=JSON.parse(localStorage.getItem(key)).furniture||[];if(!Array.isArray(items))items=[];product=restored.product;dirty=false;$('save-note').textContent='Открыта сохранённая расстановка. Размеры комнаты предварительные.';}}catch{}
initItems();$('bed-select').value=product.id;updateRoomInputs();renderProduct();render();if(!storageAvailable)$('catalog-note').textContent='Каталог в браузере недоступен. Пока доступна учебная кровать.';

function initItems(){
  const options=allProducts.filter(p=>p.category==='nightstand');
  for(const p of options){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('nightstand-select').append(o);}
  const p=options[0];if(p){const photo=productPhoto(p);if(photo){const img=document.createElement('img');img.src=photo.src;img.alt='Фото '+p.name;img.className='selected-image';$('nightstand-product').append(img);}const text=document.createElement('p');text.className='hint';text.textContent='GRV · 450 × 400 × 470 мм. Модель для примерки: при высоте 470 мм её глубина около 415 мм. Контур учитывает этот выступ.';$('nightstand-product').append(text);const a=document.createElement('a');a.href=safeProductUrl(p.productUrl);a.target='_blank';a.rel='noopener noreferrer';a.className='seller-link';a.textContent='Посмотреть у продавца ↗';$('nightstand-product').append(a);}
  $('add-nightstands').onclick=()=>{if(!position)return;const p=allProducts.find(p=>p.id===$('nightstand-select').value);if(!p)return;items=bedsidePair(position,product,p);selectedItem=items[0].id;dirtyLayout();render();};
  $('remove-nightstand').onclick=()=>{items=items.filter(p=>p.id!==selectedItem);selectedItem=items[0]?.id||null;dirtyLayout();render();};
  $('rotate-nightstand').onclick=()=>{const item=items.find(p=>p.id===selectedItem);if(item){item.rotation=(item.rotation+90)%360;dirtyLayout();render();}};
  for(const [id,axis] of [['item-x','x'],['item-z','z']])$(id).oninput=()=>{const item=items.find(p=>p.id===selectedItem),n=Number($(id).value);if(!item||!$(id).value||!Number.isFinite(n))return;item[axis]=n;dirtyLayout();render();};
  svg.addEventListener('pointerdown',e=>{const target=e.target.closest('[data-item]');if(!target)return;e.preventDefault();const item=items[Number(target.dataset.item)];selectedItem=item.id;const p=point(e);itemDrag={id:e.pointerId,item,dx:p.x-item.x,dz:p.y-item.z};svg.setPointerCapture(e.pointerId);render();});
  svg.addEventListener('pointermove',e=>{if(!itemDrag||itemDrag.id!==e.pointerId)return;const p=point(e),item=itemDrag.item,prod=allProducts.find(v=>v.id===item.productId);Object.assign(item,snapPosition(room,{...item,x:p.x-itemDrag.dx,z:p.y-itemDrag.dz},footprint(prod),$('snap').checked));dirtyLayout();render();});
  for(const name of ['pointerup','pointercancel'])svg.addEventListener(name,e=>{if(itemDrag?.id!==e.pointerId)return;itemDrag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);});
  svg.addEventListener('keydown',e=>{const target=e.target.closest('[data-item]');if(!target)return;const i=Number(target.dataset.item),item=items[i];selectedItem=item.id;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(delta){e.preventDefault();item.x+=delta[0]*(e.shiftKey?10:100);item.z+=delta[1]*(e.shiftKey?10:100);}else if(['r','R','к','К'].includes(e.key)){e.preventDefault();item.rotation=(item.rotation+90)%360;}else if(!['Enter',' '].includes(e.key))return;dirtyLayout();render();svg.querySelector(`[data-item="${i}"]`)?.focus({preventScroll:true});});
  new ResizeObserver(positionItemRotate).observe($('plan-stage'));
}
function positionItemRotate(){const item=items.find(p=>p.id===selectedItem);$('rotate-nightstand').hidden=!item||!position;if(!item||!position)return;const matrix=svg.getScreenCTM();if(!matrix)return;const p=new DOMPoint(item.x,item.z).matrixTransform(matrix),parent=$('plan-stage').getBoundingClientRect();$('rotate-nightstand').style.left=`${p.x-parent.left}px`;$('rotate-nightstand').style.top=`${p.y-parent.top}px`;}
function renderItems(){
  const errors=position?furnitureErrors(room,position,product,items,allProducts):[];
  $('extra-furniture').innerHTML=position?furnitureSvg(items,allProducts,errors,selectedItem):'';
  $('add-nightstands').disabled=!position||!$('nightstand-select').value;
  $('add-nightstands').textContent=items.length?'Поставить тумбы у изголовья':'Добавить две тумбы';
  const item=items.find(p=>p.id===selectedItem);$('item-controls').hidden=!item||!position;
  if(item){$('item-x').value=Math.round(item.x);$('item-z').value=Math.round(item.z);$('item-title').textContent='Тумба '+(items.indexOf(item)+1);}
  $('items-status').textContent=errors.length?[...new Set(errors.map(e=>e.message))].join(' '):items.length?'Тумбы стоят свободно. Выберите предмет на плане, чтобы передвинуть или повернуть.':'Добавьте пару по сторонам изголовья.';
  $('items-status').classList.toggle('error',!!errors.length);
  if(errors.length){$('save-layout').disabled=true;$('continue-design').disabled=true;}
  requestAnimationFrame(positionItemRotate);
}
