import {withRoomClipping,outsideRoom,MAX_CAMERA_RETREAT} from './camera-clipping.mjs';
import {architectureError} from './architecture-frame.mjs';
import { cameraError,aimAt } from './scene-core.mjs';
import { footprint } from './placement-core.mjs';

export const COMPOSITION_VERSION=8;
export const SHOTS=[
  {id:'front',name:'Фронтально на изголовье',description:'По оси кровати, симметрично изножью.'},
  {id:'left',name:'Из левого угла',description:'Диагональ со стороны изножья слева.'},
  {id:'right',name:'Из правого угла',description:'Диагональ со стороны изножья справа.'}
];
export function bedAxes(placement){const a=placement.rotation*Math.PI/180;return {front:{x:-Math.sin(a),z:Math.cos(a)},right:{x:Math.cos(a),z:Math.sin(a)}};}
export function relativeCamera(c,p){const a=bedAxes(p),dx=c.x-p.x,dz=c.z-p.z;return {forward:dx*a.front.x+dz*a.front.z,side:dx*a.right.x+dz*a.right.z};}
export function compositionError(c,type,room,p,product,h,inspect){
  const error=cameraError(c,room,p,product,h);if(error)return error;
  if(type==='architecture'){const m=inspect(c);return m.blocked?'Стена или другой предмет перекрывает мебель в кадре.':architectureError(m.architecture);}
  if(c.fov>65)return 'Для интерьерного кадра угол обзора ограничен 65°.';
  const rel=relativeCamera(c,p);
  if(rel.forward<=footprint(product).depth/2+120)return 'Камера должна быть со стороны изножья кровати.';
  if(type==='front'){
    const expected=aimAt(c,p.x,p.z,c.height).yaw,diff=Math.abs(((c.yaw-expected+540)%360)-180);
    if(Math.abs(rel.side)>5||diff>.1)return 'Фронтальный кадр должен оставаться на оси кровати и смотреть на изголовье.';
  }else{
    if(type==='left'&&rel.side>=-100||type==='right'&&rel.side<=100)return 'Сохраните выбранную сторону кровати.';
    if(Math.abs(Math.atan2(rel.side,rel.forward)*180/Math.PI)<18)return 'Диагональ слишком близка к фронтальному кадру.';
  }
  const m=inspect(c);
  if(m.blocked)return 'Мебель перекрыта стеной или другим предметом.';
  if(!m.fits)return 'Мебель обрезается краем кадра. Отодвиньте камеру, измените угол обзора или смещение кадра.';
  return '';
}
export function proposeCompositions(room,p,product,h,inspect,balance=c=>c){
  const axes=bedAxes(p),size=footprint(product),margin=220;
  const frontPositions=[],outsideFront=[];
  // Sample only the longitudinal axis. Never substitute a diagonal for a frontal shot.
  const maxDistance=Math.hypot(room.width,room.depth)+MAX_CAMERA_RETREAT;
  for(let distance=size.depth/2+180;distance<=maxDistance;distance+=150){const c={x:p.x+axes.front.x*distance,z:p.z+axes.front.z*distance};if(c.x>=margin&&c.x<=room.width-margin&&c.z>=margin&&c.z<=room.depth-margin)frontPositions.push(c);else if(outsideRoom(c,room))outsideFront.push(c);}
  const corners=[],outsideCorners=[];
  for(const inset of [220,400,650])for(const x of [inset,room.width-inset])for(const z of [inset,room.depth-inset])corners.push({x,z});
  for(const inset of [-400,-800,-1400,-2000])for(const x of [inset,room.width-inset])for(const z of [inset,room.depth-inset])outsideCorners.push({x,z});
  const outcomes=SHOTS.map(shot=>{
    const filter=c=>{const r=relativeCamera(c,p);return r.forward>size.depth/2+120&&(shot.id==='left'?r.side<0:r.side>0);};
    const candidateGroups=shot.id==='front'?[frontPositions,outsideFront]:[corners.filter(filter),outsideCorners.filter(filter)];
    let best=null,bestScore=Infinity;
    for(const candidates of candidateGroups){
    if(best)break;
    for(const position of candidates)for(const height of [1400,1300,1500]){
      let base=withRoomClipping(aimAt({...position,height,fov:50,pitch:0,shiftY:0},p.x,p.z,height),room);
      if(cameraError(base,room,p,product,h))continue;
      for(const fov of [35,40,45,50,55,60,65]){
        let c={...base,fov,shiftY:0};const unshifted=inspect(c);
        c.shiftY=Math.max(-.35,Math.min(.35,-(unshifted.minY+unshifted.maxY)/4));c.shiftX=Math.max(-.35,Math.min(.35,(unshifted.minX+unshifted.maxX)/4));
        if(compositionError(c,shot.id,room,p,product,h,inspect))continue;
        const m=inspect(c),rel=relativeCamera(c,p),angle=Math.abs(Math.atan2(rel.side,rel.forward)*180/Math.PI);
        const score=Math.abs(fov-45)*.025+Math.abs(height-1400)*.001+Math.abs(m.width-.62)*3+(shot.id==='front'?0:Math.abs(angle-40)*.012);
        if(score<bestScore){const balanced=balance({...c,composition:shot.id});if(balanced&&!compositionError(balanced,shot.id,room,p,product,h,inspect)){best=balanced;bestScore=score;}}
      }
    }
    }
    return {camera:best,reason:best?'':(shot.id==='front'?'Не найден полный фронтальный кадр даже с отсечением стены: мебель перекрыта или обрезается.':'Из этого угла мебель обрезается или перекрывается даже с отсечением стены.')};
  });
  // Reject effectively duplicate corner views (e.g. unusually narrow floor plans).
  const left=outcomes[1].camera,right=outcomes[2].camera;
  if(left&&right&&Math.hypot(left.x-right.x,left.z-right.z)<500&&Math.abs(left.yaw-right.yaw)<12)outcomes[2]={camera:null,reason:'Этот ракурс почти повторяет левый угол.'};
  return outcomes;
}
