import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ROOM} from '../src/placement-core.mjs';
import {DEFAULT_HEIGHTS,validateHeights,wallCells,openingsFor,openingConflict,cameraCandidates,cameraError,aimAt,cameraTarget,sceneSignature} from '../src/scene-core.mjs';
const product={id:'test',dimensionsMm:{width:1720,depth:2120,height:1000}},position={x:1525,z:1500,rotation:0};
test('wall subdivisions preserve solid area and never cover openings',()=>{
  const openings=[{start:300,end:1700,bottom:850,top:2350},{start:2200,end:2900,bottom:0,top:2100}];
  const cells=wallCells(3050,2700,openings);
  assert.equal(cells.reduce((sum,c)=>sum+(c.end-c.start)*(c.top-c.bottom),0),3050*2700-1400*1500-700*2100);
  for(const c of cells)for(const o of openings)assert.ok(!(c.start<o.end&&o.start<c.end&&c.bottom<o.top&&o.bottom<c.top));
});
test('camera candidates stay within walls, away from bed and open door at all rotations',()=>{
  for(const rotation of [0,90,180,270])for(const wall of ['left','right','top','bottom'])for(const hinge of ['start','end']){
    const room={...DEFAULT_ROOM,doorWall:wall,doorHinge:hinge,doorOffset:1000};
    const p={...position,rotation},candidates=cameraCandidates(room,p,product,DEFAULT_HEIGHTS);assert.ok(candidates.length>=2);
    for(const c of candidates)assert.equal(cameraError(c,room,p,product,DEFAULT_HEIGHTS),'');
  }
});
test('unsafe camera edits and opening heights are rejected',()=>{
  const c={x:250,z:5000,height:1500,yaw:0,pitch:0,fov:60};
  assert.equal(cameraError(c,DEFAULT_ROOM,position,product,DEFAULT_HEIGHTS),'');
  for(const edit of [{x:0},{x:1525,z:1500},{height:3000},{fov:120},{pitch:NaN}])assert.ok(cameraError({...c,...edit},DEFAULT_ROOM,position,product,DEFAULT_HEIGHTS));
  assert.equal(validateHeights(DEFAULT_HEIGHTS),'');assert.ok(validateHeights({...DEFAULT_HEIGHTS,sill:1500}));
  assert.equal(openingConflict(openingsFor(DEFAULT_ROOM,DEFAULT_HEIGHTS)),false);
  assert.equal(openingConflict(openingsFor({...DEFAULT_ROOM,doorWall:'right',doorOffset:1500},DEFAULT_HEIGHTS)),true);
});
test('camera target follows X-right Z-down plan convention',()=>{
  const c=aimAt({x:1000,z:4000,height:1500,fov:60},1000,1000,1500);assert.equal(c.yaw,0);assert.equal(c.pitch,0);assert.deepEqual(cameraTarget(c),[1,1.5,3]);
  assert.equal(aimAt(c,3000,4000,1500).yaw,90);
});
test('scene revision invalidates cameras when layout or product changes',()=>{
  const layout={room:DEFAULT_ROOM,placement:position},sig=sceneSignature(layout,product);
  assert.notEqual(sig,sceneSignature({...layout,placement:{...position,rotation:90}},product));
  assert.notEqual(sig,sceneSignature(layout,{...product,updatedAt:'changed'}));
});
