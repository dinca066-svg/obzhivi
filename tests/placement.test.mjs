import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ROOM, boundsOf, assessPlacement, snapPosition, footprint, restorePlacement, validRoom, doorGeometry, doorCollision} from '../src/placement-core.mjs';
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
test('door geometry follows each wall, hinges and opening direction',()=>{
  for(const wall of ['left','right','top','bottom'])for(const hinge of ['start','end'])for(const swing of ['inward','outward']){
    const room={...DEFAULT_ROOM,doorWall:wall,doorHinge:hinge,doorSwing:swing,doorOffset:1000};
    assert.ok(validRoom(room));const g=doorGeometry(room),local=g.toLocal(g.opened.x,g.opened.z);
    assert.equal(local.u,hinge==='start'?1000:1950);assert.equal(local.v,swing==='inward'?950:-950);
    assert.equal(g.arc.length,33);
  }
});
test('hinge reversal changes swept area, outward swing retains access clearance',()=>{
  const room={...DEFAULT_ROOM,doorOffset:1000};
  const bounds={left:750,right:850,top:1050,bottom:1150};
  assert.equal(doorCollision(room,bounds).sweep,true);
  assert.equal(doorCollision({...room,doorHinge:'end'},bounds).sweep,false);
  assert.deepEqual(doorCollision({...room,doorSwing:'outward'},bounds),{access:false,sweep:false});
  assert.equal(doorCollision({...room,doorSwing:'outward'},{left:100,right:300,top:1050,bottom:1200}).access,true);
});
test('old saved rooms get default door settings and invalid walls are rejected',()=>{
  const {doorWall,doorHinge,doorSwing,...old}=DEFAULT_ROOM;
  const result=restorePlacement({schemaVersion:1,room:old,placement:{productId:'b',x:1525,z:1500,rotation:0}},[{id:'b'}]);
  assert.equal(result.room.doorWall,'left');assert.equal(result.room.doorSwing,'inward');
  assert.equal(validRoom({...DEFAULT_ROOM,doorWall:'top'}),false);
  assert.equal(validRoom({...DEFAULT_ROOM,doorWall:'bad'}),false);
});
