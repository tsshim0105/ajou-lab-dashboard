import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createWorker,fresh} from '../server/worker.mjs';

test('briefing is owner-only and persists open tasks across saved meetings',async t=>{
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 sqlite.exec('CREATE TABLE lab_state(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT); CREATE TABLE research_records(id TEXT PRIMARY KEY,payload TEXT,version INTEGER)');
 const state=fresh();state.students=['student@example.test'];
 sqlite.prepare('INSERT INTO lab_state VALUES(1,0,?)').run(JSON.stringify(state));
 const insert=sqlite.prepare('INSERT INTO research_records VALUES(?,?,0)');
 const topic='test-topic';
 insert.run('topic:'+topic,JSON.stringify({title:'Test'}));
 insert.run('topic:hidden-topic',JSON.stringify({title:'Deleted',deleted:true}));
 const add=(id,created,content)=>insert.run('recording:'+id,JSON.stringify({created,status:'ended',summary:{[topic]:{content,status:'reviewed'},other:{content:'private other topic'}}}));
 add('meeting-first','2026-11-04T00:00:00Z','## 연구진행상황\n- 첫 관찰\n## 해야 할 일\n- 후속 실험\n- 미결 실험');
 add('meeting-second','2026-11-11T00:00:00Z','## 연구진행상황\n- 이번 관찰\n## 해야 할 일\n- 후속 실험');
 const DB={prepare(sql){const stmt=sqlite.prepare(sql);const wrap=(args=[])=>({
  bind:(...params)=>wrap(params),first:async()=>stmt.get(...args),all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:stmt.run(...args)})
 });return wrap();}};
 const owner='owner@example.test',student=state.students[0];
 const env={ADMIN_EMAIL:owner,DB};
 const worker=createWorker('<nav class="tabs" id="tabs"></nav>');
 const api='/api/research-briefing';
 const path=api+'?topic='+topic;
 const call=(email,url,body)=>worker.fetch(new Request('https://lab.example'+url,{method:body?'POST':'GET',headers:{
  ...(email?{'oai-authenticated-user-id':'trusted','oai-authenticated-user-email':email}:{}),
  ...(body?{Origin:'https://lab.example','Content-Type':'application/json','X-Lab-Request':'1'}:{})
 },body:body?JSON.stringify(body):undefined}),env);
 for(const url of ['/research-briefing',api,path]){
  assert.equal((await call(null,url)).status,401);
  assert.equal((await call(student,url)).status,403);
 }
 assert.equal((await call(student,path,{})).status,403);
 assert.match(await (await call(owner,'/research-briefing')).text(),/연구브리핑/);
 assert.deepEqual((await (await call(owner,api)).json()).topics.map(x=>x.id),[topic]);
 const before=await (await call(owner,path)).json();
 assert.deepEqual(before.previous.progress,['첫 관찰']);
 assert.deepEqual(before.latest.progress,['이번 관찰']);
 assert.equal(before.tasks.find(x=>x.text==='후속 실험').mentions.length,2);
 assert.equal(before.tasks.find(x=>x.text==='미결 실험').state,'결과 미연결');
 const update={taskId:before.tasks.find(x=>x.text==='후속 실험').id,version:0,meetingId:'meeting-second',state:'완료',pinned:true,note:'비교 결과를 보고함'};
 const saved=await call(owner,path,update);
 assert.equal(saved.status,200);
 assert.equal((await call(owner,path,update)).status,409);
 add('meeting-third','2026-11-18T00:00:00Z','## 연구진행상황\n- 다음 관찰');
 const next=await (await call(owner,path)).json();
 const finished=next.tasks.find(x=>x.id===update.taskId);
 assert.equal(finished.state,'완료');
 assert.equal(finished.pinned,true);
 assert.deepEqual(finished.updates.map(x=>[x.meetingId,x.note]),[['meeting-second','비교 결과를 보고함']]);
 assert.equal(next.tasks.find(x=>x.text==='미결 실험').state,'결과 미연결');
});
