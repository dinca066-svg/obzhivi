import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera,Vector3 } from 'three';
import { applyLevelCamera } from '../src/camera-projection.mjs';
import { levelCamera,aimAt } from '../src/scene-core.mjs';

test('vertical edges stay vertical and horizon stays level for every supported framing',()=>{
  for(const yaw of [-120,-32,0,90])for(const fov of [35,60,75])for(const shiftY of [-.35,0,.35]){
    const camera=new PerspectiveCamera(fov,1.6,.05,30);
    camera.rotation.set(.3,.2,.4);camera.up.set(1,0,0);
    applyLevelCamera(camera,{x:2800,z:4400,height:1500,yaw,fov,shiftY,pitch:-14,roll:12});
    const forward=camera.getWorldDirection(new Vector3()),right=new Vector3().crossVectors(forward,camera.up).normalize();
    assert.ok(Math.abs(forward.y)<1e-12);
    for(const side of [-.6,.6]){
      const base=camera.position.clone().addScaledVector(forward,3).addScaledVector(right,side);
      const low=base.clone().add(new Vector3(0,-1,0)).project(camera),high=base.clone().add(new Vector3(0,1,0)).project(camera);
      assert.ok(Math.abs(low.x-high.x)<1e-12,'vertical edge must not converge');
    }
    const a=camera.position.clone().addScaledVector(forward,2).addScaledVector(right,-1).project(camera);
    const b=camera.position.clone().addScaledVector(forward,5).addScaledVector(right,1).project(camera);
    assert.ok(Math.abs(a.y-b.y)<1e-12,'eye-level world plane must form a horizontal horizon');
  }
});
test('legacy tilt is migrated without moving cameras; aiming uses optical shift',()=>{
  const before={x:2800,z:4400,height:1500,yaw:-32,pitch:-14,fov:60};
  const after=levelCamera(before);assert.equal(after.pitch,0);assert.equal(after.roll,0);assert.ok(after.shiftY>0);
  for(const k of ['x','z','height','yaw','fov'])assert.equal(after[k],before[k]);
  assert.deepEqual(levelCamera(after),after);
  const aimed=aimAt(before,1060,1620,700);assert.equal(aimed.pitch,0);assert.ok(aimed.shiftY>0);
  const camera=new PerspectiveCamera(60,1.6,.05,30);applyLevelCamera(camera,aimed);
  const target=new Vector3(1.06,.7,1.62).project(camera);assert.ok(Math.abs(target.y)<1e-12);
});
