import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {api,validateScene} from '../server/api.mjs';
import {submitKie,queryKie,createPayload,buildPrompt,MODEL} from '../server/kie.mjs';
const origin='https://test.obzhivi.example';
const scene={revision:'test-v1',room:{width:3048,depth:5509},camera:{composition:'architecture',pitch:0,roll:0},furniture:[{name:'Bed'}]};
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE,created_at INTEGER,expires_at INTEGER);
 CREATE TABLE generations(id TEXT PRIMARY KEY,session_id TEXT,request_id TEXT,status TEXT,provider_task_id TEXT,style TEXT,prompt TEXT,scene_json TEXT,reference_key TEXT,reference_token_hash TEXT,result_url TEXT,error TEXT,created_at INTEGER,updated_at INTEGER,UNIQUE(session_id,request_id));
 CREATE TABLE feedback(id TEXT PRIMARY KEY,session_id TEXT,generation_id TEXT,stage TEXT,rating INTEGER,message TEXT,created_at INTEGER);`);
 const objects=new Map();const env={KIE_API_KEY:'test-key',DB:{prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return {meta:db.prepare(sql).run(...values)};}};}},BUCKET:{async put(key,value){objects.set(key,value);},async get(key){return objects.has(key)?{body:objects.get(key)}:null;}}};
 const call=(path,body,cookie='',extra={})=>api(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'Content-Type':'application/json',cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 const session=async()=>{const response=await call('/api/session',{});return response.headers.get('set-cookie').split(';')[0];};
 const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);new DataView(bytes.buffer).setUint32(16,1200);new DataView(bytes.buffer).setUint32(20,1600);
 const body=()=>({requestId:crypto.randomUUID(),style:'modern',notes:'',scene,reference:'data:image/png;base64,'+Buffer.from(bytes).toString('base64')});
 return {env,call,session,body,db};
}
test('Kie payload uses one geometry reference, portrait format and locked furniture prompt',()=>{const p=createPayload('https://example.org/frame.png',buildPrompt('classic'));assert.equal(p.model,MODEL);assert.equal(p.input.aspect_ratio,'3:4');assert.equal(p.input.image_urls.length,1);assert.match(p.input.prompt,/visible door must remain closed/);assert.match(p.input.prompt,/do not add or relocate doors or windows/);assert.match(p.input.prompt,/Do not replace, move or add large furniture/);});
test('Kie ambiguous submission is not retried and polling parses resultJson',async()=>{let calls=0;await assert.rejects(()=>submitKie('test','https://x.test','prompt',async()=>{calls++;throw Error('connection reset');}),e=>e.ambiguous===true);assert.equal(calls,1);const result=await queryKie('test','task',async()=>Response.json({code:200,data:{state:'success',resultJson:JSON.stringify({resultUrls:['https://result.example/image.png']})}}));assert.equal(result.status,'succeeded');});
test('guest ownership protects jobs, references and feedback; idempotency avoids second charge',async()=>{
 const {call,session,body,db}=setup();const a=await session(),b=await session();let submissions=0,ref;const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{submissions++;ref=JSON.parse(options.body).input.image_urls[0];return Response.json({code:200,data:{taskId:'provider-1'}});};
 try{const request=body();request.scene={...scene,camera:{composition:'front',pitch:0,roll:0,clipMode:'room-entry',nearClipMm:1696}};const response=await call('/api/generations',request,a);assert.equal(response.status,202);const job=await response.json();assert.equal(job.status,'queued');assert.deepEqual(job.scene.camera,request.scene.camera);const retry=await (await call('/api/generations',request,a)).json();assert.equal(retry.id,job.id);assert.equal(submissions,1);
 assert.equal((await call('/api/generations/'+job.id,undefined,b)).status,404);assert.equal((await call('/api/generations/'+job.id+'/reference',undefined,b)).status,404);assert.equal((await call('/api/feedback',{stage:'design',message:'test',generationId:job.id},b)).status,404);
 assert.equal((await call('/api/generations/'+job.id+'/reference',undefined,a)).status,200);const refUrl=new URL(ref);assert.equal((await call(refUrl.pathname+refUrl.search)).status,200);assert.equal((await call(refUrl.pathname+'?token=wrong')).status,404);
 assert.equal((await call('/api/feedback',{stage:'design',message:'Дверь видна',generationId:job.id,rating:4},a)).status,201);assert.equal(db.prepare('SELECT count(*) AS n FROM feedback').get().n,1);
 }finally{globalThis.fetch=original;db.close();}
});
test('server rejects foreign-origin writes, unauthenticated access and invalid geometry',async()=>{
 const {call,session,body,db}=setup();assert.equal((await call('/api/session',{},'',{origin:'https://foreign.example'})).status,403);assert.equal((await call('/api/generations')).status,401);const cookie=await session();const bad=body();bad.scene={...scene,camera:{composition:'architecture',pitch:10}};assert.equal((await call('/api/generations',bad,cookie)).status,400);assert.equal(db.prepare('SELECT count(*) AS n FROM generations').get().n,0);db.close();
});
test('uncertain paid submission remains unknown on repeat instead of retrying provider',async()=>{
 const {call,session,body,db}=setup(),cookie=await session(),payload=body();const original=globalThis.fetch;let attempts=0;globalThis.fetch=async()=>{attempts++;throw Error('timeout');};
 try{const first=await (await call('/api/generations',payload,cookie)).json();assert.equal(first.status,'unknown');const second=await (await call('/api/generations',payload,cookie)).json();assert.equal(second.id,first.id);assert.equal(attempts,1);}finally{globalThis.fetch=original;db.close();}
});

test('generation accepts every supported level view without requiring a visible door',()=>{
 for(const composition of ['architecture','front','left','right'])assert.equal(validateScene({...scene,camera:{composition,pitch:0,roll:0}}).camera.composition,composition);
 for(const camera of [{composition:'unknown',pitch:0},{composition:'front',pitch:5},{composition:'left',pitch:0,roll:5}])assert.throws(()=>validateScene({...scene,camera}));
});
