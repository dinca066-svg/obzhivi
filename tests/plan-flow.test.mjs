import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionsFromPlan,planGeometryError} from '../src/plan-core.mjs';
import {DEFAULT_HEIGHTS,windowsFor,openingsFor,openingPlanPath,sceneSignature} from '../src/scene-core.mjs';
import {restorePlacement} from '../src/placement-core.mjs';
const rect={x:833,y:66,width:255,height:461};
const room={...dimensionsFromPlan(rect,{mode:'area',area:16.79}),windows:[{id:'custom',wall:'bottom',offset:200,width:1000,sill:900,height:1400}],doorWall:'left',doorOffset:3400,doorWidth:950,doorHinge:'start',doorSwing:'inward'};
test('area and contour define scale, known wall and exact dimensions override it',()=>{
 const d=dimensionsFromPlan(rect,{mode:'area',area:16.79});assert.ok(Math.abs(d.width*d.depth/1e6-16.79)<.005);
 assert.deepEqual(dimensionsFromPlan(rect,{mode:'wall',length:3.05}),{width:3050,depth:5514});
 assert.deepEqual(dimensionsFromPlan(rect,{mode:'dimensions',width:4000,depth:5000}),{width:4000,depth:5000});
 assert.throws(()=>dimensionsFromPlan(rect,{mode:'area',area:0}));assert.throws(()=>dimensionsFromPlan({...rect,width:0},{mode:'area',area:16.79}));
});
test('explicit openings survive placement restore and feed the scene without example windows',()=>{
 const products=[{id:'bed',dimensionsMm:{width:1720,depth:2120,height:1000}}],layout={schemaVersion:1,room,placement:{productId:'bed',x:2000,z:2000,rotation:0}};
 const restored=restorePlacement(JSON.parse(JSON.stringify(layout)),products);
 assert.deepEqual(restored.room.windows,room.windows);assert.equal(openingsFor(restored.room,DEFAULT_HEIGHTS).length,2);
 assert.equal(windowsFor({...room,windows:[]}).length,0);assert.equal(windowsFor({...room,windows:undefined}).length,2);
 assert.match(openingPlanPath(windowsFor(room)[0],room),/^M200 .*H1200$/);
});
test('invalid or overlapping openings and too-low ceilings block geometry handoff',()=>{
 assert.equal(planGeometryError(room,DEFAULT_HEIGHTS),'');
 assert.equal(planGeometryError({...room,windows:[]},{...DEFAULT_HEIGHTS,ceiling:2200,door:2000}),'');
 assert.ok(planGeometryError({...room,windows:[{...room.windows[0],offset:3000}]},DEFAULT_HEIGHTS));
 assert.ok(planGeometryError({...room,windows:[{...room.windows[0],wall:'left',offset:3500}]},DEFAULT_HEIGHTS));
 assert.ok(planGeometryError(room,{...DEFAULT_HEIGHTS,ceiling:2200}));
 const p={id:'bed'},layout={room,placement:{},heights:DEFAULT_HEIGHTS};
 assert.notEqual(sceneSignature(layout,p),sceneSignature({...layout,heights:{...DEFAULT_HEIGHTS,ceiling:3000}},p));
});
