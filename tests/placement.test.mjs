import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ROOM, boundsOf, assessPlacement, snapPosition, footprint, restorePlacement, validRoom} from '../src/placement-core.mjs';
const size={width:1728,depth:2120};
test('rotation swaps room footprint without changing furniture size',()=>{
  const b=boundsOf({x:1500,z:2500,rotation:90},size);assert.equal(b.width,2120);assert.equal(b.depth,1728);assert.equal(b.left,440);
});
test('wall and door intersections block saving; small passages only advise',()=>{
  assert.equal(assessPlacement(DEFAULT_ROOM,{x:100,z:2000,rotation:0},size).canSave,false);
  const door=assessPlacement(DEFAULT_ROOM,{x:1000,z:3900,rotation:0},size);assert.equal(door.doorBlocked,true);assert.equal(door.canSave,false);
  const tight=assessPlacement(DEFAULT_ROOM,{x:1100,z:1500,rotation:0},size);assert.equal(tight.canSave,true);assert.ok(tight.tight.includes('left'));
});
test('a headboard against a wall is not called a tight passage',()=>{
  const a=assessPlacement(DEFAULT_ROOM,{x:1525,z:1060,rotation:0},size);assert.equal(a.gaps.top,0);assert.ok(!a.tight.includes('top'));
});
test('snap respects the rotated footprint and can be disabled',()=>{
  const p={x:1065,z:2500,rotation:90};assert.equal(snapPosition(DEFAULT_ROOM,p,size).x,1060);assert.equal(snapPosition(DEFAULT_ROOM,p,size,false).x,1065);
});
test('room fit uses the greater of physical mesh and supplier dimensions',()=>{
  assert.deepEqual(footprint({dimensionsMm:{width:1720,depth:2120},measuredDimensionsMm:{width:1728,depth:2101}}),size);
});
test('saved layouts require a real catalog item and valid geometry',()=>{
  const p={id:'bed'},data={schemaVersion:1,room:DEFAULT_ROOM,placement:{productId:'bed',x:1525,z:2000,rotation:90}};
  assert.equal(restorePlacement(data,[p]).position.rotation,90);assert.equal(restorePlacement(data,[]),null);
  assert.equal(restorePlacement({...data,placement:{...data.placement,x:Infinity}},[p]),null);
  assert.equal(validRoom({...DEFAULT_ROOM,doorOffset:5500}),false);
});
