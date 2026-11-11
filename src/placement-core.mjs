export const DEFAULT_ROOM = { width: 3050, depth: 5505, doorOffset: 3400, doorWidth: 950, verified: false };
export const CLEARANCE_HINT_MM = 600;
export function validRoom(room) {
  return ['width','depth'].every(k => Number.isFinite(room[k]) && room[k] >= 1500 && room[k] <= 15000)
    && Number.isFinite(room.doorOffset) && room.doorOffset >= 0 && Number.isFinite(room.doorWidth)
    && room.doorWidth >= 500 && room.doorWidth <= 2000 && room.doorOffset + room.doorWidth <= room.depth;
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
  // Conservative rectangular reservation: opening + space for a door leaf.
  const doorBlocked = b.left < room.doorWidth && b.right > 0 && b.top < room.doorOffset+room.doorWidth && b.bottom > room.doorOffset;
  const angle = ((position.rotation % 360) + 360) % 360;
  const headSide = {0:'top',90:'right',180:'bottom',270:'left'}[angle];
  const tight = Object.entries(gaps).filter(([side,gap])=>side!==headSide && gap>=0 && gap<CLEARANCE_HINT_MM).map(([side])=>side);
  return {bounds:b,gaps,outside,doorBlocked,tight,canSave:!outside&&!doorBlocked};
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
  return {room:{...value.room,verified:false},product,position:{x:p.x,z:p.z,rotation:p.rotation}};
}
