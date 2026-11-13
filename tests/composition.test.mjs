import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera,Box3,Vector3,Mesh,BoxGeometry,MeshBasicMaterial,Scene,Group } from 'three';
import { RoomScene } from '../src/room-scene.mjs';
import { DEFAULT_ROOM,boundsOf,footprint } from '../src/placement-core.mjs';
import { DEFAULT_HEIGHTS } from '../src/scene-core.mjs';
import { applyLevelCamera } from '../src/camera-projection.mjs';
import { frameMetrics } from '../src/frame-metrics.mjs';
import { proposeCompositions,relativeCamera,compositionError,SHOTS } from '../src/composition.mjs';
const product={dimensionsMm:{width:1720,depth:2120,height:1000}};
function inspector(p,obstacles=[]){const b=boundsOf(p,footprint(product)),box=new Box3(new Vector3(b.left/1000,0,b.top/1000),new Vector3(b.right/1000,1,b.bottom/1000)),camera=new PerspectiveCamera(50,1.6,.05,30);return c=>{applyLevelCamera(camera,c);return frameMetrics(camera,box,obstacles);};}
test('three compositions follow the bed at every quarter turn and keep the entire bed in frame',()=>{
  const room={...DEFAULT_ROOM,width:8000,depth:8000,doorOffset:4000};
  for(const rotation of [0,90,180,270]){
    const p={x:4000,z:4000,rotation},inspect=inspector(p),out=proposeCompositions(room,p,product,DEFAULT_HEIGHTS,inspect);
    assert.equal(out.filter(o=>o.camera).length,3);
    assert.ok(Math.abs(relativeCamera(out[0].camera,p).side)<.001);
    assert.ok(relativeCamera(out[1].camera,p).side<0);assert.ok(relativeCamera(out[2].camera,p).side>0);
    out.forEach((o,i)=>{assert.equal(compositionError(o.camera,SHOTS[i].id,room,p,product,DEFAULT_HEIGHTS,inspect),'');assert.equal(o.camera.pitch,0);assert.equal(o.camera.roll,0);assert.ok(o.camera.fov<=65);});
  }
});
test('tight foot clearance uses an exterior frontal camera without substituting a diagonal',()=>{
  const p={x:1060,z:1620,rotation:270},out=proposeCompositions(DEFAULT_ROOM,p,product,DEFAULT_HEIGHTS,inspector(p));
  assert.ok(out[0].camera);assert.equal(out[0].camera.clipMode,'room-entry');assert.ok(out[0].camera.x>DEFAULT_ROOM.width);assert.ok(Math.abs(relativeCamera(out[0].camera,p).side)<.001);assert.ok(out[0].camera.nearClipMm>50);assert.ok(out.slice(1).some(o=>o.camera));
});
test('occluding geometry blocks shots even when the whole bed projects inside the frame',()=>{
  const p={x:3000,z:1500,rotation:0},room={...DEFAULT_ROOM,width:6000,depth:6000},inspect=inspector(p),out=proposeCompositions(room,p,product,DEFAULT_HEIGHTS,inspect),c=out[0].camera;
  assert.ok(c);const wall=new Mesh(new BoxGeometry(6,3,.1),new MeshBasicMaterial());wall.position.set(3,1.5,2.7);wall.updateMatrixWorld(true);
  const blocked=inspector(p,[wall]);assert.equal(blocked(c).blocked,true);assert.match(compositionError(c,'front',room,p,product,DEFAULT_HEIGHTS,blocked),/перекрыта/);
});
test('rendered door stays closed for every wall, hinge and opening direction',()=>{
  for(const doorWall of ['left','right','top','bottom'])for(const doorHinge of ['start','end'])for(const doorSwing of ['inward','outward']){
    const room={...DEFAULT_ROOM,doorWall,doorHinge,doorSwing,doorOffset:500},scene=new Scene(),architecture=new Group();scene.add(architecture);
    const state={scene,architecture,keyLight:{target:{position:new Vector3()}},camera:{},depthUniforms:{captureFar:{value:0}},box:RoomScene.prototype.box};
    RoomScene.prototype.buildRoom.call(state,room,DEFAULT_HEIGHTS);
    const door=architecture.children.find(o=>o.userData.mask==='door'),b=new Box3().setFromObject(door),size=b.getSize(new Vector3()),center=b.getCenter(new Vector3());
    assert.equal(door.userData.doorState,'closed');
    const vertical=['left','right'].includes(doorWall),plane=doorWall==='right'?room.width/1000:doorWall==='bottom'?room.depth/1000:0;
    assert.ok(Math.abs((vertical?center.x:center.z)-plane)<1e-10);
    assert.ok(Math.abs((vertical?size.z:size.x)-room.doorWidth/1000)<1e-6);
    assert.ok(Math.abs((vertical?size.x:size.z)-.04)<1e-6);
    architecture.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
});
