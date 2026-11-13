export const MAX_CAMERA_RETREAT=2000;
export const DEFAULT_NEAR_MM=50;
export function outsideRoom(c,room){return c.x<0||c.z<0||c.x>room.width||c.z>room.depth;}

// Slab intersection of the level optical axis with the room's interior.
// Distances are along the optical axis, not Euclidean distances to a wall.
// A 13 cm inset also clears the closed leaf's handle and interior trim.
export function roomEntryNear(c,room){
  if(!outsideRoom(c,room))return DEFAULT_NEAR_MM;
  const yaw=c.yaw*Math.PI/180,dir={x:Math.sin(yaw),z:-Math.cos(yaw)};
  let enter=0,exit=Infinity;
  for(const [axis,max] of [['x',room.width],['z',room.depth]]){
    const lo=130,hi=max-130,p=c[axis],v=dir[axis];
    if(Math.abs(v)<1e-9){if(p<lo||p>hi)return null;continue;}
    const a=(lo-p)/v,b=(hi-p)/v;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  }
  return exit>enter&&enter>0?enter:null;
}
export function withRoomClipping(c,room){
  const near=roomEntryNear(c,room);
  return {...c,clipMode:outsideRoom(c,room)?'room-entry':'none',nearClipMm:near??NaN};
}
export function clippingError(c,room){
  if(c.x < -MAX_CAMERA_RETREAT||c.x>room.width+MAX_CAMERA_RETREAT||c.z < -MAX_CAMERA_RETREAT||c.z>room.depth+MAX_CAMERA_RETREAT)return 'Камеру можно отодвинуть не дальше 2 м за стену.';
  if(outsideRoom(c,room)){
    const near=roomEntryNear(c,room);
    if(c.clipMode!=='room-entry'||!near||!Number.isFinite(c.nearClipMm)||Math.abs(c.nearClipMm-near)>.01)return 'Внешняя камера должна смотреть внутрь комнаты с автоматическим отсечением стены.';
  }else if(c.nearClipMm!=null&&Math.abs(c.nearClipMm-DEFAULT_NEAR_MM)>.01)return 'Для внутреннего ракурса отсечение стены не требуется.';
  return '';
}
