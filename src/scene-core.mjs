import { boundsOf, footprint, doorGeometry } from './placement-core.mjs';
import {clippingError,outsideRoom} from './camera-clipping.mjs';

export const LAYOUT_KEY='obzhivi-bedroom-layout-v1';
export const CAMERA_KEY='obzhivi-bedroom-cameras-v1';
export const DEFAULT_HEIGHTS={ceiling:2700,door:2100,sill:850,window:1500};
export const FRAME_WIDTH=1200,FRAME_HEIGHT=1600;
export const ASPECT=FRAME_WIDTH/FRAME_HEIGHT;
export function validateHeights(h,room=null){
  if(!Object.values(h).every(Number.isFinite))return 'Укажите все высоты в миллиметрах.';
  if(h.ceiling<2200||h.ceiling>6000)return 'Высота потолка должна быть от 2200 до 6000 мм.';
  if(h.door<1800||h.door>h.ceiling-80)return 'Дверь должна быть ниже потолка минимум на 80 мм.';
  if(!Array.isArray(room?.windows)&&(h.sill<100||h.window<400||h.sill+h.window>h.ceiling-80))return 'Проверьте окно: подоконник от 100 мм, высота окна от 400 мм, верх ниже потолка на 80 мм.';
  return '';
}
export function windowsFor(room,h=DEFAULT_HEIGHTS){return Array.isArray(room.windows)?room.windows.map((w,i)=>({id:w.id||'window-'+i,kind:'window',wall:w.wall,start:w.offset,end:w.offset+w.width,bottom:w.sill,top:w.sill+w.height})):[
  {id:'window-top',kind:'window',wall:'top',start:room.width*.11,end:room.width*.77,bottom:h.sill,top:h.sill+h.window},
  {id:'window-right',kind:'window',wall:'right',start:room.depth*.183,end:room.depth*.56,bottom:h.sill,top:h.sill+h.window}
];}
export function openingsFor(room,h){return [...windowsFor(room,h),{id:'door',kind:'door',wall:room.doorWall,start:room.doorOffset,end:room.doorOffset+room.doorWidth,bottom:0,top:h.door}];}
export function openingPlanPath(o,room){return o.wall==='top'?`M${o.start} 0H${o.end}`:o.wall==='bottom'?`M${o.start} ${room.depth}H${o.end}`:o.wall==='left'?`M0 ${o.start}V${o.end}`:`M${room.width} ${o.start}V${o.end}`;}
export function openingConflict(openings){return openings.some((a,i)=>openings.slice(i+1).some(b=>a.wall===b.wall&&a.start<b.end&&b.start<a.end&&a.bottom<b.top&&b.bottom<a.top));}
// Subdivide each wall at opening edges; keep only solid cells. Coordinates in mm.
export function wallCells(length,height,openings){
  const xs=[...new Set([0,length,...openings.flatMap(o=>[o.start,o.end])])].sort((a,b)=>a-b);
  const ys=[...new Set([0,height,...openings.flatMap(o=>[o.bottom,o.top])])].sort((a,b)=>a-b),cells=[];
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
    const u=(xs[i]+xs[i+1])/2,v=(ys[j]+ys[j+1])/2;
    if(!openings.some(o=>u>o.start&&u<o.end&&v>o.bottom&&v<o.top))cells.push({start:xs[i],end:xs[i+1],bottom:ys[j],top:ys[j+1]});
  }
  return cells;
}
export function sceneSignature(layout,product){return JSON.stringify({room:layout.room,heights:layout.heights||null,placement:layout.placement,furniture:layout.furniture||[],productId:product.id,updatedAt:product.updatedAt||null,normalization:product.normalization,dimensions:product.dimensionsMm});}
export function cameraError(c,room,placement,product,h){
  if(!c||![c.x,c.z,c.height,c.yaw,c.pitch,c.fov].every(Number.isFinite))return 'Укажите все параметры камеры.';
  const clipError=clippingError(c,room);if(clipError)return clipError;
  if(!outsideRoom(c,room)&&(c.x<180||c.x>room.width-180||c.z<180||c.z>room.depth-180))return 'Передвиньте камеру на 18 см от стены внутрь или вынесите за стену для отсечения.';
  if(c.height<800||c.height>Math.min(2200,h.ceiling-200))return 'Камера должна быть на высоте от 80 см до 220 см и ниже потолка.';
  if(c.fov<35||c.fov>(c.composition==='architecture'?85:75)||c.pitch!==0||(c.roll??0)!==0||!['shiftX','shiftY'].every(k=>Number.isFinite(c[k]??0)&&Math.abs(c[k]??0)<=.35))return 'Недопустимый угол обзора или смещение. Горизонт должен оставаться ровным.';
  const b=boundsOf(placement,footprint(product));
  if(c.x>b.left-120&&c.x<b.right+120&&c.z>b.top-120&&c.z<b.bottom+120)return 'Камера попала в зону кровати. Передвиньте её на свободное место.';
  const dg=doorGeometry(room),a=dg.hinge,bp=dg.closed,dx=bp.x-a.x,dz=bp.z-a.z;
  const t=Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.z-a.z)*dz)/(dx*dx+dz*dz)));
  if(Math.hypot(c.x-a.x-t*dx,c.z-a.z-t*dz)<150)return 'Камера слишком близко к двери.';
  return '';
}
export function levelCamera(c){
  const shift=c.shiftY??(-Math.tan((c.pitch||0)*Math.PI/180)/(2*Math.tan(c.fov*Math.PI/360)));
  return {...c,pitch:0,roll:0,shiftY:Math.max(-.35,Math.min(.35,shift))};
}
export function aimAt(c,x,z,y=1000){const dx=x-c.x,dz=z-c.z;return levelCamera({...c,yaw:Math.atan2(dx,-dz)*180/Math.PI,shiftY:(c.height-y)/(2*Math.max(1,Math.hypot(dx,dz))*Math.tan(c.fov*Math.PI/360))});}
export function cameraCandidates(room,placement,product,h){
  const result=[];
  for(let ix=0;ix<=4;ix++)for(let iz=0;iz<=6;iz++){
    if(ix!==0&&ix!==4&&iz!==0&&iz!==6)continue;
    let c={x:250+(room.width-500)*ix/4,z:250+(room.depth-500)*iz/6,height:Math.min(1500,h.ceiling-300),yaw:0,pitch:0,fov:60};
    c=aimAt(c,placement.x,placement.z,Math.min(950,product.dimensionsMm.height*.7));
    if(!cameraError(c,room,placement,product,h))result.push(c);
  }
  return result;
}
export function cameraTarget(c){const yaw=c.yaw*Math.PI/180;return [c.x/1000+Math.sin(yaw),c.height/1000,c.z/1000-Math.cos(yaw)];}
