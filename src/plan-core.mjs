import {validRoom} from './placement-core.mjs';
import {validateHeights,openingsFor,openingConflict} from './scene-core.mjs';
export const PLAN_KEY='obzhivi-plan-project-v1';
export function dimensionsFromPlan(rect,calibration){
  if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<5||rect.height<5)throw Error('Выделите комнату по внутренним границам стен.');
  let width,depth;const ratio=rect.width/rect.height;
  if(calibration.mode==='area'){
    if(!Number.isFinite(calibration.area)||calibration.area<=0)throw Error('Введите площадь выбранной комнаты.');
    width=Math.sqrt(calibration.area*ratio)*1000;depth=width/ratio;
  }else if(calibration.mode==='wall'){
    if(!Number.isFinite(calibration.length)||calibration.length<=0)throw Error('Введите известную длину верхней стены.');
    width=calibration.length*1000;depth=width/ratio;
  }else{width=calibration.width;depth=calibration.depth;}
  if(![width,depth].every(n=>Number.isFinite(n)&&n>=1500&&n<=15000))throw Error('Каждая сторона комнаты должна быть от 1,5 до 15 м. Проверьте выделение и масштаб.');
  return {width:Math.round(width),depth:Math.round(depth)};
}
export function planGeometryError(room,h){
  if(!validRoom(room))return 'Проверьте размер комнаты и дверь: проём должен помещаться на выбранной стене.';
  const error=validateHeights(h,room);if(error)return error;
  if(!Array.isArray(room.windows))return 'Отметьте окна либо подтвердите, что их нет.';
  for(const w of room.windows){
    const len=['left','right'].includes(w.wall)?room.depth:room.width;
    if(!['left','right','top','bottom'].includes(w.wall)||![w.offset,w.width,w.sill,w.height].every(Number.isFinite)||w.offset<0||w.width<200||w.offset+w.width>len||w.sill<0||w.height<300||w.sill+w.height>h.ceiling-80)return 'Проверьте окна: каждый проём должен помещаться на стене и ниже потолка.';
  }
  if(openingConflict(openingsFor(room,h)))return 'Проёмы пересекаются. Уточните положение двери и окон.';
  return '';
}
