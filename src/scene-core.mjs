import { boundsOf, footprint, doorGeometry } from './placement-core.mjs';

export const LAYOUT_KEY='obzhivi-bedroom-layout-v1';
export const CAMERA_KEY='obzhivi-bedroom-cameras-v1';
export const DEFAULT_HEIGHTS={ceiling:2700,door:2100,sill:850,window:1500};
export const ASPECT=16/10;
export function validateHeights(h){
  if(!Object.values(h).every(Number.isFinite))return 'Укажите все высоты в миллиметрах.';
  if(h.ceiling<2200||h.ceiling>6000)return 'Высота потолка должна быть от 2200 до 6000 мм.';
  if(h.door<1800||h.door>h.ceiling-80)return 'Дверь должна быть ниже потолка минимум на 80 мм.';
  if(h.sill<100||h.window<400||h.sill+h.window>h.ceiling-80)return 'Проверьте окно: подоконник от 100 мм, высота окна от 400 мм, верх ниже потолка на 80 мм.';
  return '';
}
export function openingsFor(room,h){return [
  {id:'window-top',kind:'window',wall:'top',start:room.width*.11,end:room.width*.77,bottom:h.sill,top:h.sill+h.window},
  {id:'window-right',kind:'window',wall:'right',start:room.depth*.183,end:room.depth*.56,bottom:h.sill,top:h.sill+h.window},
  {id:'door',kind:'door',wall:room.doorWall,start:room.doorOffset,end:room.doorOffset+room.doorWidth,bottom:0,top:h.door}
];}
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
export function sceneSignature(layout,product){return JSON.stringify({room:layout.room,placement:layout.placement,productId:product.id,updatedAt:product.updatedAt||null,normalization:product.normalization,dimensions:product.dimensionsMm});}
export function cameraError(c,room,placement,product,h){
  if(!c||![c.x,c.z,c.height,c.yaw,c.pitch,c.fov].every(Number.isFinite))return 'Укажите все параметры камеры.';
  if(c.x<180||c.x>room.width-180||c.z<180||c.z>room.depth-180)return 'Передвиньте камеру внутрь комнаты, минимум на 18 см от стены.';
  if(c.height<800||c.height>Math.min(2200,h.ceiling-200))return 'Камера должна быть на высоте от 80 см до 220 см и ниже потолка.';
  if(c.fov<35||c.fov>75||c.pitch!==0||(c.roll??0)!==0||!Number.isFinite(c.shiftY??0)||Math.abs(c.shiftY??0)>.35)return 'Угол обзора: 35–75°. Горизонт закреплён; смещение кадра — до 35%.';
  const b=boundsOf(placement,footprint(product));
  if(c.x>b.left-120&&c.x<b.right+120&&c.z>b.top-120&&c.z<b.bottom+120)return 'Камера попала в зону кровати. Передвиньте её на свободное место.';
  const dg=doorGeometry(room),a=dg.hinge,bp=dg.opened,dx=bp.x-a.x,dz=bp.z-a.z;
  const t=Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.z-a.z)*dz)/(dx*dx+dz*dz)));
  if(Math.hypot(c.x-a.x-t*dx,c.z-a.z-t*dz)<150)return 'Камера слишком близко к открытой двери.';
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
