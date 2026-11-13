import {withRoomClipping} from './camera-clipping.mjs';
import {Vector3} from 'three';
import {frameMetrics} from './frame-metrics.mjs';
import {cameraError,aimAt} from './scene-core.mjs';

export const ARCHITECTURE_SHOT={id:'architecture',name:'Комната и дверь',description:'Основной кадр для генерации: две смежные стены, угол и закрытая дверь целиком.'};
export const ARCHITECTURE_RULES={margin:.94,minWallArea:.03,minDoorArea:.02,minDoorVisibleRatio:.85,minCornerSpan:.12,maxFov:85};
export function projectedGroup(camera,boxes,margin=ARCHITECTURE_RULES.margin){
  const frames=boxes.map(b=>frameMetrics(camera,b,[],margin));
  return {fits:frames.every(f=>f.fits),minX:Math.min(...frames.map(f=>f.minX)),maxX:Math.max(...frames.map(f=>f.maxX)),minY:Math.min(...frames.map(f=>f.minY)),maxY:Math.max(...frames.map(f=>f.maxY))};
}
export function cornerInFrame(camera,room,h,wallAreas){
  const w=room.width/1000,d=room.depth/1000,H=h.ceiling/1000;
  const corners=[{x:.005,z:.005,walls:['wallLeft','wallTop']},{x:w-.005,z:.005,walls:['wallRight','wallTop']},{x:.005,z:d-.005,walls:['wallLeft','wallBottom']},{x:w-.005,z:d-.005,walls:['wallRight','wallBottom']}];
  return corners.flatMap(c=>{
    if(wallAreas&&!c.walls.every(id=>wallAreas[id]>=ARCHITECTURE_RULES.minWallArea))return [];
    const points=[.15,.3,.45,.6,.75,.9].map(t=>new Vector3(c.x,H*t,c.z).project(camera)).filter(p=>p.z>-1&&p.z<1&&Math.abs(p.x)<.94&&Math.abs(p.y)<.94);
    if(points.length<2)return [];const span=(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)))/2;
    return span>=ARCHITECTURE_RULES.minCornerSpan?[{walls:c.walls,span}]:[];
  });
}
export function polygonArea(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p.x*q.y-q.x*p.y;}return Math.abs(a)/8;}
export function architectureError(context){
  if(!context?.fits)return 'В опорный кадр должны целиком попадать мебель и дверь с наличниками.';
  if(context.doorArea<ARCHITECTURE_RULES.minDoorArea||context.doorVisibleRatio<ARCHITECTURE_RULES.minDoorVisibleRatio)return 'Дверь должна быть хорошо видна и не перекрыта мебелью.';
  if(!context.corners?.length)return 'В кадре нужны две достаточно широкие смежные стены и видимый угол между ними.';
  return '';
}
export function proposeArchitecture(view,room,placement,product,h){
  const boxes=[view.bedBounds,...view.furniture.map(f=>f.bounds),view.doorBounds],target=new Vector3();for(const b of boxes)target.add(b.getCenter(new Vector3()));target.divideScalar(boxes.length);
  for(const insets of [[180,350],[-400,-900,-1500]]){
  const candidates=[];
  for(const inset of insets)for(let i=0;i<=6;i++)for(const side of ['top','right','bottom','left']){
    const x=side==='left'?inset:side==='right'?room.width-inset:inset+(room.width-2*inset)*i/6;
    const z=side==='top'?inset:side==='bottom'?room.depth-inset:inset+(room.depth-2*inset)*i/6;
    for(const height of [1400,1500,1600,1700,1300])for(const fov of [50,55,60,65,70,75,80,85])for(const yawDelta of [-15,0,15]){
      let c=aimAt({x,z,height,fov,pitch:0,composition:'architecture'},target.x*1000,target.z*1000,height);c.yaw+=yawDelta;c=withRoomClipping(c,room);
      if(cameraError(c,room,placement,product,h))continue;
      view.setCamera(c);const unshifted=projectedGroup(view.camera,boxes);
      if(!Number.isFinite(unshifted.minX))continue;
      c.shiftX=(unshifted.minX+unshifted.maxX)/4;c.shiftY=-(unshifted.minY+unshifted.maxY)/4;
      if(Math.abs(c.shiftX)>.35||Math.abs(c.shiftY)>.35)continue;
      view.setCamera(c);const metrics=projectedGroup(view.camera,boxes);
      if(!metrics.fits||!cornerInFrame(view.camera,room,h).length)continue;
      if(view.inspectFrame?.({...c,composition:'front'}).blocked)continue;
      candidates.push({c,score:fov+Math.abs(height-1400)*.003+Math.abs(yawDelta)*.01+Math.abs(c.shiftX)*2});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const {c} of candidates){const balanced=view.balanceArchitectureCamera(c);if(balanced)return {camera:balanced,reason:''};}
  }
  return {camera:null,reason:'Не найден кадр 3:4 даже с внешней камерой и отсечением стены, в котором целиком помещаются мебель, дверь и две смежные стены. Уточните расстановку или геометрию.'};
}
