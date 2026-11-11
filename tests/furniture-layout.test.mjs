import test from 'node:test';
import assert from 'node:assert/strict';
import {bedsidePair,furnitureErrors} from '../src/furniture-layout.mjs';
import {DEFAULT_ROOM,footprint,boundsOf} from '../src/placement-core.mjs';
import {GRV_NIGHTSTAND as n} from '../src/bundled-products.mjs';
import {sceneSignature} from '../src/scene-core.mjs';
const bed={id:'bed',dimensionsMm:{width:1720,depth:2120,height:1000}},room={...DEFAULT_ROOM,width:8000,depth:8000};
test('pair follows every bed rotation with 80mm clearance and distinct instance IDs',()=>{
 for(const rotation of [0,90,180,270]){const p={x:4000,z:4000,rotation},pair=bedsidePair(p,bed,n);assert.equal(new Set(pair.map(i=>i.id)).size,2);assert.deepEqual(furnitureErrors(room,p,bed,pair,[n]),[]);for(const i of pair){assert.equal(i.rotation,rotation);const b=boundsOf(p,footprint(bed)),t=boundsOf(i,footprint(n));const gap=rotation%180?Math.max(t.top-b.bottom,b.top-t.bottom):Math.max(t.left-b.right,b.left-t.right);assert.ok(Math.abs(gap-80)<1);}}
});
test('intersections with bed, another item, wall and door are blocked',()=>{
 const p={x:1500,z:1600,rotation:0},base={id:'a',productId:n.id,x:1500,z:1600,rotation:0};
 assert.match(furnitureErrors(DEFAULT_ROOM,p,bed,[base],[n])[0].message,/пересекаются/);
 assert.ok(furnitureErrors(DEFAULT_ROOM,p,bed,[{...base,x:0}],[n]).some(e=>/стену/.test(e.message)));
 assert.ok(furnitureErrors(DEFAULT_ROOM,p,bed,[{...base,x:300,z:3700}],[n]).some(e=>/двери/.test(e.message)));
 assert.ok(furnitureErrors(room,p,bed,[{...base,x:5000},{...base,id:'b',x:5000}],[n]).some(e=>/пересекаются/.test(e.message)));
 assert.ok(furnitureErrors(room,p,bed,[{...base,productId:'missing'}],[n]).length);
});
test('moving furniture invalidates stored camera signature and footprint includes mesh excess',()=>{
 const layout={room,placement:{x:1500,z:1600,rotation:0},furniture:[]};const before=sceneSignature(layout,bed);layout.furniture=bedsidePair(layout.placement,bed,n);assert.notEqual(sceneSignature(layout,bed),before);assert.ok(footprint(n).depth>414);assert.equal(n.dimensionsMm.depth,400);assert.equal(n.modelApproximate,true);
});
