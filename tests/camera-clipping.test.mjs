import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,PerspectiveCamera,Mesh,BoxGeometry,MeshBasicMaterial,DoubleSide} from 'three';
import {withRoomClipping,clippingError,roomEntryNear} from '../src/camera-clipping.mjs';
import {applyLevelCamera} from '../src/camera-projection.mjs';
import {frameMetrics} from '../src/frame-metrics.mjs';
import {RoomScene} from '../src/room-scene.mjs';
const room={width:3200,depth:3200};
test('clipping distance follows all four room edges and resets inside',()=>{
  for(const c of [{x:1600,z:4200,yaw:0},{x:4200,z:1600,yaw:-90},{x:1600,z:-1000,yaw:180},{x:-1000,z:1600,yaw:90}]){
    const clipped=withRoomClipping(c,room);assert.equal(clipped.clipMode,'room-entry');assert.ok(Math.abs(clipped.nearClipMm-1130)<1e-6);assert.equal(clippingError(clipped,room),'');
  }
  assert.equal(roomEntryNear({x:-1000,z:1600,yaw:-90},room),null);
  assert.ok(clippingError(withRoomClipping({x:1600,z:6000,yaw:0},room),room));
  assert.ok(clippingError({x:1600,z:4200,yaw:0,clipMode:'room-entry',nearClipMm:10},room));
  assert.equal(withRoomClipping({x:1600,z:2800,yaw:0,nearClipMm:1130},room).nearClipMm,50);
});
test('entry wall is clipped but interior obstructions and furniture cut by near plane are rejected',()=>{
  const camera=new PerspectiveCamera(55,.75,.05,12),c=withRoomClipping({x:1600,z:5200,yaw:0,height:1400,pitch:0,fov:60,shiftY:.12},room);
  applyLevelCamera(camera,c);
  const box=new Box3(new Vector3(.8,0,.6),new Vector3(2.4,1.1,2.65));
  const wall=new Mesh(new BoxGeometry(3.2,2.7,.12),new MeshBasicMaterial({side:DoubleSide}));wall.position.set(1.6,1.35,3.26);wall.updateMatrixWorld(true);
  const clear=frameMetrics(camera,box,[wall]);assert.equal(clear.blocked,false);assert.equal(clear.fits,true);
  wall.position.z=2.9;wall.updateMatrixWorld(true);assert.equal(frameMetrics(camera,box,[wall]).blocked,true);
  box.max.z=3.15;assert.equal(frameMetrics(camera,box,[]).fits,false);
  wall.geometry.dispose();wall.material.dispose();
});
test('RGB camera and depth uniforms use the same per-shot near plane, with no leakage into next shot',()=>{
  const camera=new PerspectiveCamera(55,.75,.05,12),state={camera,depthUniforms:{captureNear:{value:.05}}};
  const c=withRoomClipping({x:1600,z:4200,yaw:0,height:1400,pitch:0,fov:60},room);
  RoomScene.prototype.setCamera.call(state,c);assert.equal(camera.near,1.13);assert.equal(state.depthUniforms.captureNear.value,1.13);
  RoomScene.prototype.setCamera.call(state,{...c,x:1600,z:2800,nearClipMm:50,clipMode:'none'});assert.equal(camera.near,.05);assert.equal(state.depthUniforms.captureNear.value,.05);
});
test('mask and depth passes preserve visible face sides after clipping instead of exposing the underside of the floor',()=>{
  const state={passMaterialVariants:new WeakMap()},base=new MeshBasicMaterial({side:DoubleSide}),front=new MeshBasicMaterial(),twoSided=new MeshBasicMaterial({side:DoubleSide});
  const shaderHook=()=>{};base.onBeforeCompile=shaderHook;
  const adapted=RoomScene.prototype.passMaterial.call(state,base,front);
  assert.equal(adapted.side,front.side);assert.equal(adapted.onBeforeCompile,shaderHook);assert.equal(base.side,DoubleSide);
  assert.equal(RoomScene.prototype.passMaterial.call(state,base,front),adapted);assert.equal(RoomScene.prototype.passMaterial.call(state,base,twoSided),base);
  for(const m of [base,front,twoSided,adapted])m.dispose();
});
