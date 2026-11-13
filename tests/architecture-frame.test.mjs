import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Box3,Vector3} from 'three';
import {architectureError,cornerInFrame,projectedGroup,proposeArchitecture} from '../src/architecture-frame.mjs';
import {applyLevelCamera} from '../src/camera-projection.mjs';
import {DEFAULT_HEIGHTS} from '../src/scene-core.mjs';
const room={width:3050,depth:5505,doorWall:'left',doorOffset:3400,doorWidth:950,doorHinge:'start',doorSwing:'inward'};
const placement={x:1060,z:1620,rotation:270},product={dimensionsMm:{width:1720,depth:2120,height:1000}};
test('general view permits an offscreen door but requires full furniture and a wall corner',()=>{
  const good={fits:true,doorArea:.07,doorVisibleRatio:.98,corners:[{walls:['wallLeft','wallTop'],span:.25}]};
  assert.equal(architectureError(good),'');
  assert.equal(architectureError({...good,doorArea:0,doorVisibleRatio:0}),'');
  for(const change of [{fits:false},{corners:[]}])assert.ok(architectureError({...good,...change}));
});
test('portrait camera can frame actual furniture group and two adjacent walls without moving them',()=>{
  const box=(a,b)=>new Box3(new Vector3(...a),new Vector3(...b));
  const view={camera:new PerspectiveCamera(60,.75,.05,8),bedBounds:box([.009,0,.756],[2.111,1.004,2.484]),furniture:[{bounds:box([.0295,0,2.5645],[.4445,.47,3.0195])},{bounds:box([.0295,0,.2205],[.4445,.47,.6755])}],doorBounds:box([-.02,0,3.34],[.1125,2.17,4.41]),setCamera(c){applyLevelCamera(this.camera,c);},balanceArchitectureCamera(c){return c;}};
  const before=JSON.stringify({room,placement,product});
  const {camera:c}=proposeArchitecture(view,room,placement,product,DEFAULT_HEIGHTS);
  assert.ok(c);assert.equal(c.pitch,0);assert.equal(c.roll,0);assert.ok(c.fov<=85);
  view.setCamera(c);
  assert.ok(projectedGroup(view.camera,[view.bedBounds,...view.furniture.map(f=>f.bounds)]).fits);
  assert.ok(cornerInFrame(view.camera,room,DEFAULT_HEIGHTS,{wallLeft:.25,wallTop:.1,wallRight:0,wallBottom:0}).length);
  assert.equal(cornerInFrame(view.camera,room,DEFAULT_HEIGHTS,{wallLeft:.25,wallTop:.001,wallRight:0,wallBottom:0}).length,0);
  assert.equal(JSON.stringify({room,placement,product}),before);
});
