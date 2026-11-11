import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera,Vector3 } from 'three';
import { silhouetteCenter,centeredShift,isCentered } from '../src/visual-balance.mjs';
import { applyLevelCamera } from '../src/camera-projection.mjs';
test('visual center uses silhouette area and converts bottom-up pixels',()=>{
  const pixels=new Uint8Array(4*4*4);for(const[x,y]of[[0,0],[1,0],[0,1]])pixels[(y*4+x)*4]=255;
  const center=silhouetteCenter(pixels,4,4);assert.ok(Math.abs(center.x-5/24)<1e-12);assert.ok(Math.abs(center.y-19/24)<1e-12);assert.equal(center.area,3/16);
  assert.equal(silhouetteCenter(new Uint8Array(64),4,4),null);assert.equal(isCentered(center),false);assert.equal(isCentered({x:.5,y:.5}),true);
});
test('two-axis optical correction moves an off-center point to the exact frame center',()=>{
  const camera=new PerspectiveCamera(60,.75,.05,30),c={x:0,z:0,height:1400,yaw:0,pitch:0,fov:60,shiftX:.02,shiftY:.1};
  const point=new Vector3(.4,.8,-3);applyLevelCamera(camera,c);const projected=point.clone().project(camera);
  const corrected=centeredShift(c,{x:(projected.x+1)/2,y:(1-projected.y)/2});applyLevelCamera(camera,corrected);const centered=point.clone().project(camera);
  assert.ok(Math.abs(centered.x)<1e-12);assert.ok(Math.abs(centered.y)<1e-12);assert.ok(Math.abs(camera.getWorldDirection(new Vector3()).y)<1e-12);
});
