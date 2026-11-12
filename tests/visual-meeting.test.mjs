import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createWorker,fresh} from '../server/worker.mjs';

const topic = 'a6e60c56-de8a-446b-8519-e4c21d683906';
const owner = 'owner@example.test';
const student = 'student@example.test';
const api = '/api/ai/recording-visual-';

test('the visual meeting page and APIs are owner-only and the pilot uses one grounded transcript', async t => {
 const db = new DatabaseSync(':memory:');
 t.after(() => db.close());
 db.exec(`CREATE TABLE lab_state (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL);
  CREATE TABLE research_records (id TEXT PRIMARY KEY, payload TEXT, version INTEGER);
  CREATE TABLE research_jobs (id TEXT PRIMARY KEY, topic TEXT, author TEXT, month TEXT, status TEXT,
   reserve INTEGER, cost INTEGER, usage TEXT, created TEXT);`);
 const state = fresh();
 state.students = [student];
 db.prepare('INSERT INTO lab_state VALUES (1,0,?)').run(JSON.stringify(state));
 const latest = {
  id:'meeting-latest', created:'2026-11-10T00:00:00Z', status:'ended',
  markers:[{at:0,topic},{at:30,topic:'other'}],
  segments:[
   {text:'광결정 막에서 반사가 관찰됐습니다.',start:0,speaker:'speaker-0'},
   {text:'농도를 바꿔서 다시 실험합시다.',topic},
   {text:'다른 연구의 비공개 발언',start:31,topic}
  ],
  summary:{private:'기존 회의요약'}
 };
 const insert = db.prepare('INSERT INTO research_records VALUES (?,?,0)');
 for (const meeting of [latest,{...latest,id:'meeting-older',created:'2026-11-01T00:00:00Z'},
  {...latest,id:'meeting-unrelated',created:'2026-11-11T00:00:00Z',markers:[],segments:[{topic:'other',text:'다른 연구'}]}]) {
  insert.run('recording:'+meeting.id,JSON.stringify(meeting));
 }
 const env = {ADMIN_EMAIL:owner,OPENAI_API_KEY:'test-key',DB:{prepare(sql) {
  const query=db.prepare(sql);
  const wrap=(args=[])=>({
   bind:(...params)=>wrap(params),first:async()=>query.get(...args),
   all:async()=>({results:query.all(...args)}),run:async()=>({meta:query.run(...args)})
  });
  return wrap();
 }}};
 const worker = createWorker('<nav class="tabs" id="tabs"></nav>');
 const request = (email,path,body) => worker.fetch(new Request('https://lab.example'+path,{
  method:body?'POST':'GET',headers:{
   ...(email?{'oai-authenticated-user-id':'verified','oai-authenticated-user-email':email}:{}),
   ...(body?{'Origin':'https://lab.example','Content-Type':'application/json','X-Lab-Request':'1'}:{})
  },body:body?JSON.stringify(body):undefined
 }),env);

 assert.match(await (await request(owner,'/')).text(),/data-visual-meeting/);
 assert.doesNotMatch(await (await request(student,'/')).text(),/data-visual-meeting/);
 for(const path of ['/visual-meeting',api+'list']) {
  assert.equal((await request(null,path)).status,401);
  assert.equal((await request(student,path)).status,403);
 }
 assert.equal((await request(student,api+'analyze',{id:latest.id})).status,403);
 const page = await request(owner,'/visual-meeting');
 assert.match(page.headers.get('Cache-Control'),/no-store/);
 assert.match(await page.text(),/AI Visual Meeting/);
 const list = await request(owner,api+'list');
 assert.deepEqual((await list.json()).meetings,[{id:latest.id,created:latest.created}]);
 assert.equal((await request(owner,api+'analyze',{id:'meeting-older'})).status,404);

 const model = t.mock.method(globalThis,'fetch',async (_url,options)=>{
  const payload=JSON.parse(options.body);
  assert.equal(payload.store,false);
  const input=JSON.parse(payload.input[1].content);
  assert.deepEqual(input,latest.segments.slice(0,2).map(({text},index)=>({index,text})));
  return Response.json({status:'completed',usage:{input_tokens:200,output_tokens:100},output:[{content:[
   {type:'output_text',text:JSON.stringify({items:[
    {kind:'topic',segment:0,quote:'광결정 막',topic:null},
    {kind:'observation',segment:0,quote:'반사가 관찰됐습니다.',topic:0},
    {kind:'experiment',segment:1,quote:latest.segments[1].text,topic:0},
    {kind:'action',segment:1,quote:'근거 없이 생성된 조치',topic:0}
   ]})}
  ]}]});
 });
 const analysis=await request(owner,api+'analyze',{id:latest.id});
 assert.equal(analysis.status,200);
 const {items}=await analysis.json();
 assert.deepEqual(items.map(({kind,start,topic})=>({kind,start,topic})),[
  {kind:'topic',start:0,topic:null},{kind:'observation',start:0,topic:0},{kind:'experiment',start:null,topic:0}
 ]);
 assert.equal(model.mock.callCount(),1);
 assert.deepEqual(JSON.parse(db.prepare('SELECT payload FROM research_records WHERE id=?').get('recording:'+latest.id).payload),latest);
});
