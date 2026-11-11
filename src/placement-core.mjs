export const DEFAULT_ROOM = { width: 3050, depth: 5505, doorOffset: 3400, doorWidth: 950, doorWall: 'left', doorHinge: 'start', doorSwing: 'inward', verified: false };
export const CLEARANCE_HINT_MM = 600;
export function normalizeRoom(room) {return {doorWall:'left',doorHinge:'start',doorSwing:'inward',...room};}
export function wallLength(room) {return ['left','right'].includes(room.doorWall||'left')?room.depth:room.width;}
export function validRoom(room) {
  room=normalizeRoom(room);
  return ['width','depth'].every(k => Number.isFinite(room[k]) && room[k] >= 1500 && room[k] <= 15000)
    && Number.isFinite(room.doorOffset) && room.doorOffset >= 0 && Number.isFinite(room.doorWidth)
    && ['left','right','top','bottom'].includes(room.doorWall) && ['start','end'].includes(room.doorHinge) && ['inward','outward'].includes(room.doorSwing)
    && room.doorWidth >= 500 && room.doorWidth <= 2000 && room.doorOffset + room.doorWidth <= wallLength(room);
}
// Local axes: u runs along the wall (top→bottom or left→right); v points inside the room.
export function doorGeometry(room) {
  room=normalizeRoom(room);const o=room.doorOffset,r=room.doorWidth,end=room.doorHinge==='end',h=end?o+r:o,sign=room.doorSwing==='inward'?1:-1;
  const map=(u,v)=>room.doorWall==='left'?{x:v,z:u}:room.doorWall==='right'?{x:room.width-v,z:u}:room.doorWall==='top'?{x:u,z:v}:{x:u,z:room.depth-v};
  const toLocal=(x,z)=>room.doorWall==='left'?{u:z,v:x}:room.doorWall==='right'?{u:z,v:room.width-x}:room.doorWall==='top'?{u:x,v:z}:{u:x,v:room.depth-z};
  const hinge=map(h,0),closed=map(end?o:o+r,0),opened=map(h,sign*r);
  const arc=Array.from({length:33},(_,i)=>{const a=i/32*Math.PI/2;return map(h+(end?-1:1)*r*Math.cos(a),sign*r*Math.sin(a));});
  const access=[map(o,0),map(o+r,0),map(o+r,CLEARANCE_HINT_MM),map(o,CLEARANCE_HINT_MM)];
  return {hinge,closed,opened,arc,access,map,toLocal};
}
export function doorCollision(room,b) {
  room=normalizeRoom(room);const g=doorGeometry(room),corners=[[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.bottom]].map(([x,z])=>g.toLocal(x,z));
  const u0=Math.min(...corners.map(p=>p.u)),u1=Math.max(...corners.map(p=>p.u)),v0=Math.min(...corners.map(p=>p.v)),v1=Math.max(...corners.map(p=>p.v));
  const o=room.doorOffset,r=room.doorWidth;
  const access=u0<o+r&&u1>o&&v0<CLEARANCE_HINT_MM&&v1>0;
  if(room.doorSwing==='outward')return {access,sweep:false};
  const low=Math.max(u0,o),high=Math.min(u1,o+r),v=Math.max(v0,0),h=room.doorHinge==='end'?o+r:o;
  const closestU=Math.max(low,Math.min(high,h));
  const sweep=low<high&&v1>0&&(closestU-h)**2+v**2<r*r;
  return {access,sweep};
}
export function footprint(product) {
  return {width:Math.max(product.dimensionsMm.width, product.measuredDimensionsMm?.width || 0),depth:Math.max(product.dimensionsMm.depth,product.measuredDimensionsMm?.depth || 0)};
}
export function boundsOf(position, size) {
  const angle = ((position.rotation % 360) + 360) % 360;
  const width = angle % 180 === 0 ? size.width : size.depth, depth = angle % 180 === 0 ? size.depth : size.width;
  return {left:position.x-width/2,right:position.x+width/2,top:position.z-depth/2,bottom:position.z+depth/2,width,depth};
}
export function assessPlacement(room, position, size) {
  const b = boundsOf(position,size);
  const gaps = {left:b.left,right:room.width-b.right,top:b.top,bottom:room.depth-b.bottom};
  const outside = Object.values(gaps).some(v=>v < -.01);
  const door=doorCollision(room,b),doorBlocked=door.access||door.sweep;
  const angle = ((position.rotation % 360) + 360) % 360;
  const headSide = {0:'top',90:'right',180:'bottom',270:'left'}[angle];
  const tight = Object.entries(gaps).filter(([side,gap])=>side!==headSide && gap>=0 && gap<CLEARANCE_HINT_MM).map(([side])=>side);
  return {bounds:b,gaps,outside,doorBlocked,doorAccessBlocked:door.access,doorSweepBlocked:door.sweep,tight,canSave:!outside&&!doorBlocked};
}
export function snapPosition(room, position, size, enabled = true) {
  if (!enabled) return {...position};
  const out={...position,x:Math.round(position.x/10)*10,z:Math.round(position.z/10)*10};
  const b=boundsOf(out,size),threshold=80;
  if(Math.abs(b.left)<threshold)out.x=sizeForAxis(b,'x')/2;
  else if(Math.abs(room.width-b.right)<threshold)out.x=room.width-b.width/2;
  if(Math.abs(b.top)<threshold)out.z=b.depth/2;
  else if(Math.abs(room.depth-b.bottom)<threshold)out.z=room.depth-b.depth/2;
  return out;
}
function sizeForAxis(bounds,axis){return axis==='x'?bounds.width:bounds.depth;}
export function restorePlacement(value, products) {
  if(!value || value.schemaVersion!==1 || !validRoom(value.room))return null;
  const p=value.placement,product=products.find(item=>item.id===p?.productId);
  if(!product || !Number.isFinite(p.x)||!Number.isFinite(p.z)||![0,90,180,270].includes(p.rotation))return null;
  return {room:{...normalizeRoom(value.room),verified:false},product,position:{x:p.x,z:p.z,rotation:p.rotation}};
}
