import test from 'node:test';
import assert from 'node:assert/strict';
import {areaFromText,detectPlanOpenings,assembleRecognizedRoom} from '../src/plan-recognition.mjs';

test('area requires one square-metre label; no guessing from dimensions or conflicting labels',()=>{
  for(const [text,n] of [['10.68 м²',10.68],['16,79 м2',16.79],['10.68 м“',10.68]])assert.equal(areaFromText(text,90),n);
  for(const text of ['10.68','3200 × 4500','10.68 м','10.68 м² 3.24 м²','0.5 м²','250 м²'])assert.equal(areaFromText(text),null);
  assert.equal(areaFromText('10.68 м²',20),null);
});
function drawing(){
  const p={width:400,height:400,data:new Uint8ClampedArray(400*400*4).fill(255)};
  const fill=(x,y,w,h,gray=30)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){const k=(j*p.width+i)*4;p.data[k]=p.data[k+1]=p.data[k+2]=gray;}};
  fill(40,40,320,10);fill(40,350,320,10);fill(40,40,10,320);fill(350,40,10,320);
  fill(130,40,120,10,255);fill(130,42,120,1,180);fill(130,47,120,1,180);
  fill(190,350,80,10,255);
  return {p,fill,rect:{x:50,y:50,width:300,height:300}};
}
test('wall evidence distinguishes glazing from doorway, converts offsets to mm and records assumptions',()=>{
  const {p,rect}=drawing(),found=detectPlanOpenings(p,rect);
  assert.equal(found.uncertain.length,0);assert.deepEqual(found.openings.map(o=>[o.wall,o.kind]),[['top','window'],['bottom','door']]);
  const result=assembleRecognizedRoom(rect,9,found);
  assert.equal(result.room.width,3000);assert.equal(result.room.depth,3000);assert.equal(result.room.doorWall,'bottom');assert.ok(Math.abs(result.room.doorWidth-800)<60);assert.equal(result.room.windows[0].wall,'top');assert.equal(result.room.verified,false);assert.equal(result.room.reviewedByUser,false);assert.ok(result.recognition.assumed.includes('ceilingHeight'));
});
test('blank scans, ambiguous glazing and missing or multiple doors cannot produce a fabricated room',()=>{
  const {p,fill,rect}=drawing();fill(130,47,120,1,255);
  const ambiguous=detectPlanOpenings(p,rect);assert.ok(ambiguous.uncertain.length);assert.throws(()=>assembleRecognizedRoom(rect,9,ambiguous));
  assert.throws(()=>assembleRecognizedRoom(rect,9,{openings:[],uncertain:[]}));
  const blank={width:400,height:400,data:new Uint8ClampedArray(400*400*4).fill(255)};assert.equal(detectPlanOpenings(blank,rect).uncertain.length,4);
  const good=drawing(),found=detectPlanOpenings(good.p,good.rect);found.openings.push({...found.openings.find(o=>o.kind==='door'),wall:'left'});assert.throws(()=>assembleRecognizedRoom(rect,9,found));
});
