import { Vector3,Raycaster } from 'three';

// Check the complete projected bounding box, including the floor-contact points.
export function frameMetrics(camera,box,obstacles=[],margin=.9){
  const points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new Vector3(x,y,z));
  const projected=points.map(p=>p.clone().project(camera));
  const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const fits=projected.every(p=>p.z>-1&&p.z<1&&Math.abs(p.x)<=margin&&Math.abs(p.y)<=margin);
  const forward=camera.getWorldDirection(new Vector3());
  const blocked=obstacles.length>0&&[...points,box.getCenter(new Vector3())].some(world=>{const direction=world.clone().sub(camera.position),distance=direction.length();direction.normalize();const cosine=direction.dot(forward);if(cosine<=0)return true;const near=camera.near/cosine;return distance>near&&new Raycaster(camera.position,direction,near,Math.max(near,distance-.03)).intersectObjects(obstacles,true).length>0;});
  return {fits,blocked,minX,maxX,minY,maxY,width:(maxX-minX)/2,height:(maxY-minY)/2};
}
