import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {meetingRecordingRequest,meetingTopicAt,validateMeetingSnapshot} from '../server/meeting-recording.mjs';
import {reserveResearchJob,settleResearchJob,RESEARCH_MODEL,researchRoomRequest} from '../server/research-room.mjs';
import {meetingResearchBackground} from '../server/meeting-recording.mjs';

test('research knowledge imports privately, validates all topics before writing, and isolates retrieval',async()=>{
 const f=fixture(),topics=[{topic:'topic-0001',title:'A',entries:[{kind:'term',text:'PNIPAM 온도감응 고분자',sources:['pdf:1:p2']}]}];
 assert.equal((await f.call('recording-knowledge-import',{topics},STUDENT)).status,403);
 assert.equal((await f.call('recording-knowledge-import',{topics})).status,200);
 assert.equal((await f.call('recording-knowledge?topic=topic-0001',null,STUDENT)).status,403);
 assert.equal((await meetingResearchBackground(f.env.DB,'topic-0001','PNIPAM'))[0].sources[0],'pdf:1:p2');
 assert.deepEqual(await meetingResearchBackground(f.env.DB,'topic-0002','PNIPAM'),[]);
 assert.deepEqual(await meetingResearchBackground(f.env.DB,'unclassified','PNIPAM'),[]);
 const version=f.sql.prepare("SELECT version FROM research_records WHERE id='knowledge:topic-0001'").get().version;
 assert.equal((await f.call('recording-knowledge-import',{topics:[...topics,{topic:'missing-000',entries:[]}]})).status,400);
 assert.equal(f.sql.prepare("SELECT version FROM research_records WHERE id='knowledge:topic-0001'").get().version,version);
 assert.equal((await f.call('recording-knowledge-import',{topics:[{...topics[0],entries:[{text:'no source',sources:[]}]}]})).status,400);
});
const OWNER={admin:true,email:'owner@example.test'},STUDENT={admin:false,email:'student@example.test'};
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE research_records(id TEXT PRIMARY KEY,version INTEGER,payload TEXT);CREATE TABLE research_jobs(id TEXT PRIMARY KEY,topic TEXT,author TEXT,month TEXT,status TEXT,reserve INTEGER,cost INTEGER,usage TEXT,created TEXT);`);sql.prepare('INSERT INTO research_records VALUES(?,0,?)').run('topic:topic-0001',JSON.stringify({id:'topic-0001',title:'A'}));sql.prepare('INSERT INTO research_records VALUES(?,0,?)').run('topic:topic-0002',JSON.stringify({id:'topic-0002',title:'B'}));const DB={async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}},prepare(q){let v=[];return {bind(...a){v=a;return this},async first(){return sql.prepare(q).get(...v)||null},async all(){return {results:sql.prepare(q).all(...v)}},async run(){return {meta:{changes:sql.prepare(q).run(...v).changes}}}}}};const audio=new Map();const env={DB,BUCKET:{async put(k,b,o){audio.set(k,{bytes:b,httpMetadata:o.httpMetadata})},async get(k){const o=audio.get(k);return o?{...o,body:o.bytes,size:o.bytes.length,arrayBuffer:async()=>o.bytes.buffer}:null}}};const call=(action,b,actor=OWNER)=>meetingRecordingRequest(new Request('https://test.local/api/ai/'+action,{method:b?'POST':'GET',...(b?{body:JSON.stringify(b)}:{})}),env,actor,{reserveResearchJob,settleResearchJob,RESEARCH_MODEL});return {sql,env,call};}
const id='meeting-0001',markers=[{at:0,topic:'topic-0001',title:'A'},{at:10,topic:'topic-0002',title:'B'},{at:20,topic:null,title:'미분류'},{at:30,topic:'topic-0001',title:'A'}];
const snap={id,version:0,duration:40,markers,segments:[{id:'s1',start:2,end:4,text:'A finding',speaker:'speaker-0'},{id:'s2',start:11,end:12,text:'B finding',speaker:'speaker-1'},{id:'s3',start:21,end:22,text:'unclassified',speaker:'speaker-0'},{id:'s4',start:32,end:34,text:'A again',speaker:'speaker-0'}],status:'ended',audioCount:1};
async function create(f){return (await f.call('recording-create',{id,markers:[markers[0]],mime:'audio/webm'})).json();}
test('topic boundaries and repeated topic visits remain deterministic',()=>{assert.equal(meetingTopicAt(markers,9.99),'topic-0001');assert.equal(meetingTopicAt(markers,10),'topic-0002');assert.equal(meetingTopicAt(markers,25),null);assert.deepEqual(validateMeetingSnapshot(snap).segments.map(s=>s.topic),['topic-0001','topic-0002',null,'topic-0001']);assert.throws(()=>validateMeetingSnapshot({...snap,markers:[markers[1],markers[0]]}));});
test('every recording action including GET rejects students',async()=>{const f=fixture();for(const action of ['recording-status','recording-list','recording-detail?id='+id,'recording-audio?id='+id+'&index=0'])assert.equal((await f.call(action,null,STUDENT)).status,403);for(const action of ['recording-create','recording-save','recording-audio','recording-transcribe','recording-summarize','recording-summary-save','recording-create-topic','recording-discard-transcript'])assert.equal((await f.call(action,{id},STUDENT)).status,403);assert.equal((await researchRoomRequest(new Request('https://test.local/api/ai/recording-list'),f.env,STUDENT)).status,403);});
test('create retries are idempotent; saved history and audio remain private and durable',async()=>{const f=fixture();await create(f);await create(f);assert.equal(f.sql.prepare("SELECT count(*) n FROM research_records WHERE id LIKE 'recording:%'").get().n,1);assert.equal((await f.call('recording-audio',{id,index:0,base64:btoa('test audio')})).status,200);assert.equal((await f.call('recording-save',snap)).status,200);assert.equal((await f.call('recording-save',snap)).status,409);const s=await(await f.call('recording-detail?id='+id)).json();assert.equal(s.segments.length,4);assert.equal(s.audioCount,1);assert.equal(await(await f.call('recording-audio?id='+id+'&index=0')).text(),'test audio');assert.equal((await(await f.call('recording-list')).json()).meetings.length,1);});
test('summary editing validates topic and preserves entire recording',async()=>{const f=fixture();await create(f);await f.call('recording-save',snap);assert.equal((await f.call('recording-summary-save',{id,version:1,topic:'other',content:'x'})).status,400);assert.equal((await f.call('recording-summary-save',{id,version:1,topic:'topic-0001',content:'Reviewed'})).status,200);const s=await(await f.call('recording-detail?id='+id)).json();assert.equal(s.summary['topic-0001'].status,'reviewed');assert.equal(s.segments.length,4);});
test('missing key fails explicitly without losing recording',async()=>{const f=fixture();await create(f);await f.call('recording-save',snap);assert.equal((await f.call('recording-transcribe',{id})).status,503);assert.equal((await(await f.call('recording-detail?id='+id)).json()).status,'ended');});
test('OpenAI transcription uses saved audio, caches results and summary isolates a topic',async()=>{const f=fixture();await create(f);await f.call('recording-audio',{id,index:0,base64:btoa('test audio')});await f.call('recording-save',snap);f.env.OPENAI_API_KEY='test-secret';const old=globalThis.fetch;let transcribes=0,summaries=0;globalThis.fetch=async(url,init)=>{if(url.includes('/models/'))return Response.json({id:RESEARCH_MODEL});assert.equal(init.headers.Authorization,'Bearer test-secret');if(url.includes('transcriptions')){transcribes++;assert.equal(init.body.get('model'),'gpt-4o-transcribe-diarize');return Response.json({duration:40,segments:snap.segments.map(s=>({...s,speaker:s.speaker}))});}summaries++;const b=JSON.parse(init.body);assert.ok(b.input[1].content.includes('A finding'));assert.ok(b.input[1].content.includes('A again'));assert.ok(!b.input[1].content.includes('B finding'));assert.ok(!b.input[1].content.includes('unclassified'));assert.equal(b.model,RESEARCH_MODEL);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Meeting draft'}]}],usage:{input_tokens:100,output_tokens:100}});};try{let r=await f.call('recording-transcribe',{id});assert.equal(r.status,200);assert.equal((await r.json()).segments.length,4);await f.call('recording-transcribe',{id});assert.equal(transcribes,1);r=await f.call('recording-summarize',{id,topic:'topic-0001'});assert.equal(r.status,200);assert.equal((await r.json()).summary['topic-0001'].status,'draft');await f.call('recording-summarize',{id,topic:'topic-0001'});assert.equal(summaries,1);const latest=await(await f.call('recording-detail?id='+id)).json();assert.equal((await f.call('recording-discard-transcript',{id,version:latest.version})).status,200);assert.equal((await f.call('recording-transcribe',{id})).status,200);assert.equal((await f.call('recording-summarize',{id,topic:'topic-0001'})).status,200);assert.equal(transcribes,2);assert.equal(summaries,2);assert.equal(f.sql.prepare("SELECT count(*) n FROM research_jobs WHERE status='completed'").get().n,4);}finally{globalThis.fetch=old;}});
test('unknown model fails without substitution or billing; exhausted budget blocks calls',async()=>{const f=fixture();await create(f);await f.call('recording-save',snap);f.env.OPENAI_API_KEY='test-secret';const old=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:404});try{assert.equal((await f.call('recording-summarize',{id,topic:'topic-0001'})).status,503);assert.equal(f.sql.prepare('SELECT count(*) n FROM research_jobs').get().n,0);f.sql.prepare("INSERT INTO research_records VALUES('config',0,?)").run(JSON.stringify({budget:.001}));globalThis.fetch=async url=>{assert.ok(url.includes('/models/'));return Response.json({});};assert.equal((await f.call('recording-summarize',{id,topic:'topic-0001'})).status,409);}finally{globalThis.fetch=old;}});
test('uncertain requests retain reservation and cannot double charge',async()=>{const f=fixture();await create(f);await f.call('recording-save',snap);f.env.OPENAI_API_KEY='test-secret';const old=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{if(url.includes('/models/'))return Response.json({});calls++;throw Error('network lost');};try{await f.call('recording-summarize',{id,topic:'topic-0001'});await f.call('recording-summarize',{id,topic:'topic-0001'});assert.equal(calls,1);const job=f.sql.prepare('SELECT * FROM research_jobs').get();assert.equal(job.status,'uncertain');assert.ok(job.reserve>0);}finally{globalThis.fetch=old;}});

import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('client topic changes preserve continuous recorder; pauses exclude wall time',async()=>{
 let now=0,pauses=0,resumes=0;const context=vm.createContext({console,Blob,setInterval(){},setTimeout,window:{addEventListener(){}},document:{querySelectorAll(){return []},querySelector(){return null},getElementById(){return null}},performance:{now:()=>now},admin:()=>true,user:{email:'owner@example.test'},tab:'researchRooms',researchRoomState:{selected:'topic-0001',rooms:{topics:[{id:'topic-0001',title:'A'},{id:'topic-0002',title:'B'}]}},crypto:globalThis.crypto});
 vm.runInContext(readFileSync(new URL('../meeting-recording.js',import.meta.url),'utf8'),context);
 vm.runInContext(`mrLocal=async()=>{};mrPaint=()=>{};mrUpdateControls=()=>{};meetingRecorder.session={markers:[{at:0,topic:'topic-0001'}],segments:[]};meetingRecorder.active=true;meetingRecorder.clockStarted=0;meetingRecorder.recorder={pause(){},resume(){}}`,context);
 now=10000;vm.runInContext("mrChooseTopic('topic-0002')",context);now=15000;await vm.runInContext('mrPause()',context);now=25000;assert.equal(vm.runInContext('mrSeconds()',context),15);await vm.runInContext("mrChooseTopic(mrUnclassified);mrPause()",context);now=30000;assert.equal(vm.runInContext('mrSeconds()',context),20);assert.equal(vm.runInContext('meetingRecorder.session.markers.length',context),3);assert.equal(vm.runInContext('meetingRecorder.active',context),true);assert.equal(vm.runInContext('meetingRecorder.session.markers[2].at',context),15);
});
test('large browser audio chunks are split losslessly for upload limits',async()=>{
 const context=vm.createContext({console,Blob,setInterval(){},window:{addEventListener(){}},document:{},admin:()=>true,user:{email:'owner@example.test'}});vm.runInContext(readFileSync(new URL('../meeting-recording.js',import.meta.url),'utf8'),context);vm.runInContext("mrLocal=async()=>{};mrChanged=async()=>{};meetingRecorder.session={id:'test-session'}",context);context.sample=new Blob([new Uint8Array(1200000).fill(7)]);await vm.runInContext('mrQueueAudio(sample)',context);assert.equal(vm.runInContext('meetingRecorder.pendingAudio.length',context),3);assert.equal(vm.runInContext('meetingRecorder.pendingAudio.reduce((n,x)=>n+x.blob.size,0)',context),1200000);
});

test('unclassified ranges create a private topic atomically and retry without duplication',async()=>{
 const f=fixture();await create(f);await f.call('recording-save',snap);await f.call('recording-summary-save',{id,version:1,topic:'unclassified',content:'Unclassified draft'});
 const body={id,version:2,newTopic:'created-topic-001',title:'New research',markerIndexes:[2]};const response=await f.call('recording-create-topic',body);assert.equal(response.status,200);const result=await response.json();assert.equal(result.markers[2].topic,body.newTopic);assert.equal(result.segments[2].topic,body.newTopic);assert.equal(result.markers[1].topic,'topic-0002');assert.equal(result.summary[body.newTopic].content,'Unclassified draft');assert.equal(result.audioCount,1);
 const topic=JSON.parse(f.sql.prepare('SELECT payload FROM research_records WHERE id=?').get('topic:'+body.newTopic).payload);assert.deepEqual(topic.viewers,[]);assert.equal(topic.title,'New research');assert.equal((await f.call('recording-create-topic',body)).status,200);assert.equal(f.sql.prepare("SELECT count(*) n FROM research_records WHERE id LIKE 'topic:created-%'").get().n,1);
});
test('partial reassignment keeps unrelated unclassified speech and preserves original summary',async()=>{
 const f=fixture();await create(f);await f.call('recording-save',{...snap,markers:[...markers,{at:35,topic:null,title:'미분류'}]});await f.call('recording-summary-save',{id,version:1,topic:'unclassified',content:'Two discussions'});
 const r=await f.call('recording-create-topic',{id,version:2,newTopic:'created-topic-002',title:'One topic',markerIndexes:[2]});assert.equal(r.status,200);const s=await r.json();assert.equal(s.markers[4].topic,null);assert.equal(s.summary.unclassified,undefined);assert.equal(s.summary['created-topic-002'],undefined);assert.equal(s.conversions['created-topic-002'].originalSummary.content,'Two discussions');assert.equal(s.summaryEpoch,1);
});
test('ongoing recording can reassign a range; stale writes and active AI jobs create no topic',async()=>{
 const f=fixture();await create(f);await f.call('recording-save',{...snap,status:'recording'});const b={id,version:0,newTopic:'created-topic-003',title:'Live topic',markerIndexes:[2]};assert.equal((await f.call('recording-create-topic',b)).status,409);assert.equal(f.sql.prepare("SELECT count(*) n FROM research_records WHERE id='topic:created-topic-003'").get().n,0);
 f.sql.prepare('INSERT INTO research_jobs VALUES(?,?,?,?,?,?,?,?,?)').run('pending-job','recording:'+id,OWNER.email,'2026-10','pending',100,0,'{}','now');assert.equal((await f.call('recording-create-topic',{...b,version:1})).status,409);assert.equal(f.sql.prepare("SELECT count(*) n FROM research_records WHERE id='topic:created-topic-003'").get().n,0);f.sql.prepare('DELETE FROM research_jobs').run();const r=await f.call('recording-create-topic',{...b,version:1});assert.equal(r.status,200);assert.equal((await r.json()).status,'recording');
});

test('summary draft and confirmation persist separately without exposing transcript',async()=>{const f=fixture();await create(f);await f.call('recording-save',snap);const content='## 연구진행상황\n- 30도에서 2시간 반응시켰다.\n## 문제점 · 학생\n- 기포가 반복해서 발생했다.\n## 개선점 · 교수\n- 탈기 조건을 10분으로 늘린다.\n## 해야 할 일\n- 학생이 금요일까지 세 조건을 비교한다.';assert.equal((await f.call('recording-summary-save',{id,version:1,topic:'topic-0001',content,status:'draft'})).status,200);let s=await(await f.call('recording-detail?id='+id)).json();assert.equal(s.summary['topic-0001'].status,'draft');assert.equal(s.summary['topic-0001'].content,content);assert.equal((await f.call('recording-summary-save',{id,version:2,topic:'topic-0001',content,status:'reviewed'})).status,200);assert.equal((await f.call('recording-detail?id='+id,null,STUDENT)).status,403);s=await(await f.call('recording-detail?id='+id)).json();assert.equal(s.summary['topic-0001'].status,'reviewed');assert.equal(s.segments.length,4);});

test('summary sections retain detailed and legacy content',()=>{const c=vm.createContext({setInterval(){},window:{addEventListener(){}}});vm.runInContext(readFileSync(new URL('../meeting-recording.js',import.meta.url),'utf8'),c);assert.equal(vm.runInContext("mrSummarySections('기존 상세 회의록')[0]",c),'기존 상세 회의록');assert.equal(vm.runInContext("mrSummarySections('## 연구진행상황\\n- 30도 2시간\\n## 문제점 · 학생\\n- 기포')[1]",c),'- 기포');});

test('presentation log preserves facts and escapes text without conference links',()=>{const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');const c=vm.createContext({esc:x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),conferenceScope:r=>r.scope,conferenceCity:r=>r.city,canEditResearch:()=>true});vm.runInContext(source.slice(source.indexOf('function conferenceLogCard(')),c);const html=vm.runInContext("conferenceLogCard({date:'2026-10-22',title:'<test>',conference:'학회',presenter:'학생',coauthors:'공동저자',scope:'국내',kind:'구두',venue:'장소',note:'수상',url:'https://example.test'},2)",c);assert.match(html,/10.22/);assert.match(html,/공동저자/);assert.match(html,/수상/);assert.match(html,/&lt;test&gt;/);assert.doesNotMatch(html,/<a\b|href=|https:/);assert.match(html,/data-conf="2"/);});

function nativeContext(handler=async()=>({ok:true}),owner=true){
 const c=vm.createContext({rrCoverURL:t=>t.cover?.revision?"/api/ai/topic-cover?topic="+t.id+"&v="+t.cover.revision:"",console,Blob,setInterval(){},setTimeout,window:{addEventListener(){},webkit:{messageHandlers:{nismlMeeting:{postMessage:handler}}}},document:{querySelectorAll:()=>[],getElementById:()=>null},performance:{now:()=>10000},admin:()=>owner,user:{email:'owner@example.test'},tab:'other',researchRoomState:{rooms:{topics:[{id:'topic-A',title:'A'},{id:'archived',title:'Old',archived:true}]}},crypto:globalThis.crypto});
 vm.runInContext(readFileSync(new URL('../meeting-recording.js',import.meta.url),'utf8'),c);vm.runInContext('mrPaint=()=>{};mrPaintTranscript=()=>{};mrUpdateControls=()=>{};mrLocal=async()=>{};',c);return c;
}
test('native controls reject student and stale topic, preserve recorder and mark unclassified',async()=>{
 const student=nativeContext(undefined,false);await assert.rejects(vm.runInContext("window.nismlRecorderCommand({action:'pause'})",student),/교수님/);
 const calls=[],c=nativeContext(async x=>{calls.push(x.action);return {ok:true};});
 vm.runInContext("Object.assign(meetingRecorder,{active:true,native:true,session:{id:'test',markers:[{at:0,topic:'topic-A'}],segments:[]}})",c);
 await assert.rejects(vm.runInContext("window.nismlRecorderCommand({action:'topic',topic:'archived'})",c),/선택/);
 await vm.runInContext("window.nismlRecorderCommand({action:'topic',topic:mrUnclassified})",c);
 assert.equal(vm.runInContext('meetingRecorder.session.markers[1].topic',c),null);assert.equal(vm.runInContext('meetingRecorder.active',c),true);
 await vm.runInContext("window.nismlRecorderCommand({action:'pause'})",c);assert.equal(vm.runInContext('meetingRecorder.paused',c),true);
 await vm.runInContext("window.nismlRecorderCommand({action:'pause'})",c);assert.deepEqual(calls,['pause','resume']);
});
test('native audio retries deterministic pieces and keeps pending state after network failure',async()=>{
 const audio=Buffer.alloc(1000003,19),saved=new Map();let fail=true;
 const c=nativeContext(async x=>x.action==='recover'?{size:audio.length}:x.action==='read'?{length:audio.subarray(x.offset,x.offset+450000).length,base64:audio.subarray(x.offset,x.offset+450000).toString('base64')}:{ok:true});
 c.researchFetch=async(action,x)=>{assert.equal(action,'recording-audio');if(fail&&x.index===1)throw Error('offline');saved.set(x.index,Buffer.from(x.base64,'base64'));return {ok:true};};
 vm.runInContext("meetingRecorder.session={id:'test',nativePending:true};",c);
 await assert.rejects(vm.runInContext('mrNativeUpload()',c),/offline/);assert.equal(vm.runInContext('meetingRecorder.session.nativePending',c),true);
 fail=false;await vm.runInContext('mrNativeUpload()',c);assert.equal(saved.size,3);assert.deepEqual(Buffer.concat([...saved.values()]),audio);assert.equal(vm.runInContext('meetingRecorder.audioIndex',c),3);assert.equal(vm.runInContext('meetingRecorder.session.nativePending',c),false);
});

test('discard removes current transcript and draft, keeps audio and other records, retries idempotently',async()=>{
 const f=fixture();await create(f);await f.call('recording-audio',{id,index:0,base64:btoa('original')});await f.call('recording-save',snap);
 await f.call('recording-summary-save',{id,version:1,topic:'topic-0001',content:'draft',status:'draft'});
 const other=await(await f.call('recording-create',{id:'meeting-other',markers:[markers[0]],mime:'audio/webm'})).json();
 assert.equal((await f.call('recording-discard-transcript',{id,version:1})).status,409);
 const result=await(await f.call('recording-discard-transcript',{id,version:2})).json();assert.deepEqual(result.segments,[]);assert.deepEqual(result.summary,{});assert.equal(result.audioCount,1);assert.equal(result.transcriptionEpoch,1);assert.equal(result.summaryEpoch,1);
 assert.equal(await(await f.call('recording-audio?id='+id+'&index=0')).text(),'original');assert.equal((await(await f.call('recording-detail?id='+other.id)).json()).version,0);
 assert.equal((await f.call('recording-discard-transcript',{id,version:2})).status,200);
});
test('discard refuses active capture, reviewed summary and in-flight AI jobs',async()=>{
 const f=fixture();await create(f);assert.equal((await f.call('recording-discard-transcript',{id,version:0})).status,409);await f.call('recording-save',snap);
 f.sql.prepare("INSERT INTO research_jobs(id,topic,status) VALUES(?,?,'pending')").run('job','recording:'+id);assert.equal((await f.call('recording-discard-transcript',{id,version:1})).status,409);
 f.sql.prepare("UPDATE research_jobs SET status='completed',cost=12 WHERE id='job'").run();await f.call('recording-summary-save',{id,version:1,topic:'topic-0001',content:'confirmed',status:'reviewed'});
 assert.equal((await f.call('recording-discard-transcript',{id,version:2})).status,409);assert.equal(f.sql.prepare("SELECT cost FROM research_jobs WHERE id='job'").get().cost,12);
});

test('first chronological speaker is professor; remaining voices retain numbered student roles',async()=>{
 const {meetingSpeakerRoles}=await import('../server/meeting-recording.mjs');
 assert.deepEqual(meetingSpeakerRoles([{speaker:'speaker-2',start:8,text:'second'},{speaker:'speaker-0',start:1,text:'first'},{speaker:'speaker-1',start:10,text:'third'}]),{'speaker-0':'교수님','speaker-2':'학생 1','speaker-1':'학생 2'});
 assert.deepEqual(meetingSpeakerRoles(snap.segments,'speaker-1'),{'speaker-0':'학생 1','speaker-1':'교수님'});
 assert.throws(()=>meetingSpeakerRoles(snap.segments,'missing'));
});
test('professor correction persists roles and preserves reviewed minutes with a review flag',async()=>{
 const f=fixture();await create(f);await f.call('recording-save',snap);
 await f.call('recording-summary-save',{id,version:1,topic:'topic-0001',content:'Reviewed original'});
 assert.equal((await f.call('recording-speaker-roles',{id,version:2,professor:'speaker-1'},STUDENT)).status,403);
 assert.equal((await f.call('recording-speaker-roles',{id,version:1,professor:'speaker-1'})).status,409);
 assert.equal((await f.call('recording-speaker-roles',{id,version:2,professor:'missing'})).status,400);
 let r=await f.call('recording-speaker-roles',{id,version:2,professor:'speaker-1'});assert.equal(r.status,200);let s=await r.json();
 assert.equal(s.speakers['speaker-1'],'교수님');assert.equal(s.speakers['speaker-0'],'학생 1');assert.equal(s.summary['topic-0001'].content,'Reviewed original');assert.equal(s.summary['topic-0001'].rolesChanged,true);assert.equal(s.summaryEpoch,1);assert.equal(s.segments.length,4);
 assert.equal((await f.call('recording-speaker-roles',{id,version:s.version,professor:'speaker-1'})).status,200);
 const now=new Date().toISOString();f.sql.prepare('INSERT INTO research_jobs VALUES(?,?,?,?,?,?,?,?,?)').run('pending-role-test','recording:'+id,OWNER.email,'2026-10','pending',1,0,'{}');
 assert.equal((await f.call('recording-speaker-roles',{id,version:s.version,professor:'speaker-0'})).status,409);
});
test('corrected roles regenerate only on request and retain the original summary',async()=>{
 const f=fixture();await create(f);await f.call('recording-save',snap);await f.call('recording-summary-save',{id,version:1,topic:'topic-0001',content:'Original reviewed'});await f.call('recording-speaker-roles',{id,version:2,professor:'speaker-1'});f.env.OPENAI_API_KEY='test-secret';const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,init)=>{if(url.includes('/models/'))return Response.json({});calls++;assert.ok(JSON.parse(init.body).input[1].content.includes('학생 1: A finding'));return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Corrected draft'}]}],usage:{input_tokens:1,output_tokens:1}});};
 try{let r=await f.call('recording-summarize',{id,topic:'topic-0001'});assert.equal((await r.json()).summary['topic-0001'].content,'Original reviewed');assert.equal(calls,0);r=await f.call('recording-summarize',{id,topic:'topic-0001',regenerate:true});assert.equal(r.status,200);const s=await r.json();assert.equal(s.summary['topic-0001'].content,'Corrected draft');assert.equal(s.summary['topic-0001'].status,'draft');assert.equal(s.summaryHistory[0].content,'Original reviewed');assert.equal(s.summaryHistory[0].status,'reviewed');assert.equal(calls,1);}finally{globalThis.fetch=old;}
});

test('floating quick switch follows last classified participants and keeps unclassified last in quick group',()=>{
 const c=nativeContext();vm.runInContext(`researchRoomState.rooms={members:[{email:'a@test',name:'학생 A'},{email:'b@test',name:'학생 B'}],topics:[{id:'a',title:'A',viewers:['a@test','owner@example.test']},{id:'ab',title:'AB',viewers:['a@test','b@test']},{id:'b',title:'B',viewers:['b@test']},{id:'owner',title:'Owner',viewers:['owner@example.test']},{id:'old',title:'Old',viewers:['a@test'],archived:true}]};meetingRecorder.active=true;meetingRecorder.selected='a';meetingRecorder.session={markers:[{topic:'a',at:0}]};`,c);
 const read=()=>JSON.parse(vm.runInContext('JSON.stringify(mrQuickTopics())',c));
 assert.deepEqual(read().topics.map(t=>t.id),['a','ab','__unclassified__','b','owner']);
 assert.deepEqual(read().names,['학생 A']);
 vm.runInContext("meetingRecorder.session.markers.push({topic:'b',at:5},{topic:null,at:10});meetingRecorder.selected=null",c);
 assert.deepEqual(read().topics.filter(t=>t.quick==='true').map(t=>t.id),['ab','b','__unclassified__']);
 assert.deepEqual(read().names,['학생 B']);
 vm.runInContext("meetingRecorder.session.markers=[{topic:null,at:0}]",c);
 assert.deepEqual(read().topics.filter(t=>t.quick==='true').map(t=>t.id),['__unclassified__']);
});

test('five-minute live queue survives capture updates, isolates next meeting, deletes audio only after final transcript',async()=>{
 const f=fixture();await create(f);f.env.OPENAI_API_KEY='test-secret';const deleted=[];
 f.env.BUCKET.delete=async keys=>{deleted.push(...keys);};
 const parts=[{first:0,count:1,start:0,end:8,mime:'audio/webm'},{first:1,count:1,start:8,end:300,mime:'audio/webm'}];
 for(let index=0;index<2;index++)await f.call('recording-audio',{id,index,base64:btoa('part'+index)});
 let r=await f.call('recording-save',{...snap,duration:305,segments:[],status:'recording',audioCount:2,audioParts:parts});assert.equal(r.status,200);
 await f.call('recording-enqueue',{id});
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,init)=>{if(url.includes('/models/'))return Response.json({});if(url.includes('transcriptions')){calls++;
  if(calls===2){assert.equal(init.body.get('known_speaker_names[]'),'professor');let latest=await(await f.call('recording-detail?id='+id)).json();assert.equal((await f.call('recording-save',{...latest,duration:450,markers:[...latest.markers,{at:320,topic:'topic-0002',title:'B'}]})).status,200);}
  return Response.json({segments:[{speaker:calls===1?'A':'professor',start:calls===3?30:0,end:calls===3?32:2,text:'테스트 발언'}]});}
 return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'회의 요약 초안'}]}],usage:{input_tokens:1,output_tokens:1}});};
 try{
  let s=await(await f.call('recording-work',{id})).json();assert.equal(s.transcription.completedParts,1);assert.equal(s.status,'recording');assert.equal(deleted.length,0);
  s=await(await f.call('recording-work',{id})).json();assert.equal(s.transcription.completedParts,2);assert.equal(s.duration,450);assert.equal(s.segments[1].start,8);assert.equal(s.segments[1].speaker,'speaker-0');assert.equal(deleted.length,0);
  s=await(await f.call('recording-work',{id})).json();assert.equal(s.processing.status,'waiting');
  assert.equal((await f.call('recording-audio',{id,index:2,base64:btoa('last')})).status,200);
  s=await(await f.call('recording-detail?id='+id)).json();r=await f.call('recording-save',{...s,status:'ended',audioCount:3,audioParts:[...parts,{first:2,count:1,start:300,end:450,mime:'audio/webm'}]});assert.equal(r.status,200);
  await f.call('recording-create',{id:'next-meeting-001',markers:[markers[0]],mime:'audio/webm'});
  await f.call('recording-enqueue',{id});s=await(await f.call('recording-work',{id})).json();assert.equal(s.transcription.status,'completed');assert.ok(s.audioDeletedAt);assert.equal(deleted.length,3);
  assert.equal((await(await f.call('recording-detail?id=next-meeting-001')).json()).status,'recording');
  for(let i=0;i<5&&s.processing.status!=='completed';i++)s=await(await f.call('recording-work',{id})).json();assert.equal(s.processing.status,'completed');assert.equal(calls,3);assert.ok(s.summary['topic-0001']);assert.ok(s.summary['topic-0002']);
  assert.equal((await f.call('recording-audio',{id,index:3,base64:btoa('unexpected')})).status,409);
 }finally{globalThis.fetch=old;}
});
test('recordings longer than one hour are valid; finalized segment manifest cannot be rewritten',async()=>{
 assert.equal(validateMeetingSnapshot({...snap,duration:10800}).duration,10800);
 const f=fixture();await create(f);const part={first:0,count:1,start:0,end:300,mime:'audio/webm'};
 await f.call('recording-save',{...snap,duration:600,status:'recording',audioParts:[part]});
 assert.equal((await f.call('recording-save',{...snap,version:1,duration:600,audioParts:[{...part,end:299}]})).status,409);
 assert.equal((await f.call('recording-enqueue',{id},STUDENT)).status,403);
 assert.equal((await f.call('recording-work',{id},STUDENT)).status,403);
});
test('browser rotation starts replacement before stopping old recorder and never stops microphone',async()=>{
 const calls=[];let now=300000;
 class Recorder{constructor(){this.state='inactive';}start(){calls.push('start');this.state='recording';}stop(){calls.push('stop');this.state='inactive';this.ondataavailable({data:new Blob(['audio'])});this.onstop();}}
 const c=vm.createContext({rrCoverURL:t=>t.cover?.revision?"/api/ai/topic-cover?topic="+t.id+"&v="+t.cover.revision:"",console,Blob,MediaRecorder:Recorder,setInterval(){},setTimeout,window:{addEventListener(){}},document:{},admin:()=>true,user:{email:'owner'},performance:{now:()=>now}});
 vm.runInContext(readFileSync(new URL('../meeting-recording.js',import.meta.url),'utf8'),c);
 vm.runInContext("mrPaint=()=>{};mrChanged=async()=>{};mrLocal=async()=>{};mrSync=async()=>{};Object.assign(meetingRecorder,{session:{id:'session-1',mime:'audio/webm',audioParts:[]},active:true,clockStarted:0,stream:{},audioChain:Promise.resolve()});mrBeginPart(8);",c);
 await vm.runInContext('mrRotatePart();meetingRecorder.audioChain',c);await new Promise(r=>setTimeout(r,0));assert.deepEqual(calls,['start','start','stop']);assert.equal(vm.runInContext('meetingRecorder.active',c),true);assert.equal(vm.runInContext('meetingRecorder.recorder.boundary',c),600);
});
test('failed AI calls retain audio; successful transcript cleanup retries after storage outage',async()=>{
 const f=fixture();await create(f);await f.call('recording-audio',{id,index:0,base64:btoa('audio')});await f.call('recording-save',{...snap,segments:[]});f.env.OPENAI_API_KEY='test-secret';let deleteAttempts=0,deleted=false,failAPI=true;
 f.env.BUCKET.delete=async()=>{deleteAttempts++;if(deleteAttempts===1)throw Error('storage offline');deleted=true;};
 const old=globalThis.fetch;globalThis.fetch=async url=>url.includes('/models/')?Response.json({}):failAPI?new Response('',{status:400}):Response.json({segments:[{speaker:'A',start:0,end:2,text:'hello'}]});
 try{await f.call('recording-enqueue',{id});let s=await(await f.call('recording-work',{id})).json();assert.equal(s.processing.status,'failed');assert.equal(deleteAttempts,0);assert.equal((await(await f.call('recording-enqueue',{id})).json()).processing.status,'failed');
 failAPI=false;await f.call('recording-enqueue',{id,retry:true});s=await(await f.call('recording-work',{id})).json();assert.equal(s.transcription.status,'completed');assert.equal(s.audioDeletedAt,undefined);assert.equal(deleted,false);
 s=await(await f.call('recording-clean-audio',{id})).json();assert.ok(s.audioDeletedAt);assert.equal(deleted,true);
 assert.equal((await f.call('recording-discard-transcript',{id,version:s.version})).status,409); // queued summary must finish before destructive editing
 }finally{globalThis.fetch=old;}
});

test('floating panel chooses next topic while idle without modifying previous meeting markers',async()=>{
 const c=nativeContext();vm.runInContext("researchRoomState.selected='topic-A';Object.assign(meetingRecorder,{active:false,session:{id:'previous',markers:[{at:0,topic:'topic-A'}],segments:[]}});",c);
 await vm.runInContext("window.nismlRecorderCommand({action:'topic',topic:mrUnclassified})",c);
 assert.equal(vm.runInContext('meetingRecorder.session.markers.length',c),1);
 assert.equal(vm.runInContext('researchRoomState.selected',c),'__unclassified__');
 assert.equal(vm.runInContext('meetingRecorder.selected',c),null);
});
test('summary action finishes once and next meeting starts while prior queue continues',async()=>{
 const c=nativeContext();vm.runInContext("Object.assign(meetingRecorder,{active:true,session:{id:'previous',markers:[],segments:[]}});mrStop=async()=>{meetingRecorder.active=false;mrQueue.pending=1;mrQueue.busy=true;};mrStart=async()=>{meetingRecorder.active=true;meetingRecorder.session={id:'next',markers:[],segments:[]};};",c);
 await vm.runInContext("window.nismlRecorderCommand({action:'summary'})",c);
 assert.equal(vm.runInContext('meetingRecorder.active',c),false);
 await assert.rejects(vm.runInContext("window.nismlRecorderCommand({action:'summary'})",c),/진행 중인/);
 await vm.runInContext("window.nismlRecorderCommand({action:'start'})",c);
 assert.equal(vm.runInContext('meetingRecorder.session.id',c),'next');assert.equal(vm.runInContext('mrQueue.busy',c),true);
 await assert.rejects(vm.runInContext("window.nismlRecorderCommand({action:'start'})",c),/이미 녹음/);
 vm.runInContext("mrMergeTranscript({id:'previous',segments:[{text:'old'}],processing:{status:'completed'}})",c);
 assert.equal(vm.runInContext('meetingRecorder.session.id',c),'next');assert.equal(vm.runInContext('meetingRecorder.session.segments.length',c),0);
});
test('floating start is disabled during final upload, independent of background summary',async()=>{
 const calls=[],c=nativeContext(async body=>{calls.push(body);return {};});
 vm.runInContext('meetingRecorder.dirty=true;',c);
 await assert.rejects(vm.runInContext("window.nismlRecorderCommand({action:'start'})",c),/업로드/);
 vm.runInContext('mrNativeState()',c);assert.equal(calls.at(-1).startReady,false);
 vm.runInContext('meetingRecorder.dirty=false;mrQueue.busy=true;mrQueue.pending=1;mrNativeState()',c);
 assert.equal(calls.at(-1).startReady,true);assert.equal(calls.at(-1).backgroundProcessing,true);
 const student=nativeContext(undefined,false);await assert.rejects(vm.runInContext("window.nismlRecorderCommand({action:'start'})",student),/교수님/);
});

test('cancel is owner-only, idempotent and blocks further recording work',async()=>{const f=fixture();await create(f);assert.equal((await f.call('recording-cancel',{id},STUDENT)).status,403);const cancelled=await(await f.call('recording-cancel',{id})).json();assert.equal(cancelled.status,'cancelled');assert.deepEqual(cancelled.summary,{});assert.equal(cancelled.processing,null);assert.equal((await f.call('recording-cancel',{id})).status,200);for(const action of ['recording-enqueue','recording-work','recording-save','recording-transcribe','recording-summarize','recording-audio'])assert.equal((await f.call(action,{...snap,id})).status,409,action);});
test('floating cancel stops without enqueue, clears local session and can start again',async()=>{const calls=[],c=nativeContext(async x=>{calls.push(x.action);return {duration:12}});vm.runInContext("Object.assign(meetingRecorder,{active:true,native:true,session:{id:'test',markers:[],segments:[]},clockBase:12});mrLoadHistory=async()=>{};rrDraw=()=>{};researchFetch=async(action)=>{if(action!=='recording-cancel')throw Error(action);return {status:'cancelled'}};mrEnqueue=()=>{throw Error('must not enqueue')};",c);await vm.runInContext('mrCancel()',c);assert.deepEqual(calls,['stop','purge']);assert.equal(vm.runInContext('meetingRecorder.active',c),false);assert.equal(vm.runInContext('meetingRecorder.session',c),null);});

test('in-flight transcription cannot revive a cancelled meeting',async()=>{
 const f=fixture();await create(f);await f.call('recording-audio',{id,index:0,base64:btoa('audio')});await f.call('recording-save',snap);f.env.OPENAI_API_KEY='test';let signal,finish;const started=new Promise(r=>signal=r),pending=new Promise(r=>finish=r),old=globalThis.fetch;
 globalThis.fetch=async()=>{signal();await pending;return Response.json({duration:40,segments:snap.segments});};
 try{const work=f.call('recording-transcribe',{id});await started;assert.equal((await f.call('recording-cancel',{id})).status,200);finish();await work;const result=await(await f.call('recording-detail?id='+id)).json();assert.equal(result.status,'cancelled');assert.deepEqual(result.segments,[]);assert.deepEqual(result.summary,{});assert.equal(result.processing,null);}finally{finish();globalThis.fetch=old;}
});

test('history marks only topics with nonblank transcripts and does not expose transcript text',async()=>{
 const f=fixture();await create(f);let rows=(await (await f.call('recording-list')).json()).meetings;assert.deepEqual(rows[0].transcriptTopics,[]);
 await f.call('recording-save',{...snap,segments:[snap.segments[0],{...snap.segments[1],text:'   '}]});
 rows=(await (await f.call('recording-list')).json()).meetings;assert.deepEqual(rows[0].transcriptTopics,['topic-0001']);assert.equal(rows[0].segments,undefined);
});
test('summary date filter excludes empty and cancelled meetings per topic',()=>{
 const context=vm.createContext({console,Blob,setInterval(){},window:{addEventListener(){}},document:{}});vm.runInContext(readFileSync(new URL('../meeting-recording.js',import.meta.url),'utf8'),context);
 for(const [record,key,expected] of [[{markers,segments:[]},'topic-0001',false],[{markers,segments:[],processing:{status:'failed'}},'topic-0001',true],[{markers,segments:[],processing:{status:'failed'}},'other-topic',false],[{status:'cancelled',markers,segments:[],processing:{status:'failed'}},'topic-0001',false],[{markers,segments:[snap.segments[0]]},'topic-0002',false],[{markers,segments:[snap.segments[0]]},'topic-0001',true],[{transcriptTopics:['topic-0001']},'topic-0001',true],[{summary:{'topic-0001':{content:'saved summary'}}},'topic-0001',true],[{status:'cancelled',transcriptTopics:['topic-0001']},'topic-0001',false]]){context.record=record;context.key=key;assert.equal(!!vm.runInContext('mrHasMeetingContent(record,key)',context),expected);}
});

import {meetingReviewedKnowledge} from '../server/meeting-recording.mjs';
test('knowledge includes only prior approved same-topic minutes and responds to withdrawal',async()=>{
 const f=fixture();const current={id:'current-0001',created:'2026-10-28T10:00:00Z'};
 for(const [id,date,topic,status,rolesChanged] of [['prior-0001','2026-10-20','topic-0001','reviewed',false],['draft-0001','2026-10-21','topic-0001','draft',false],['other-0001','2026-10-22','topic-0002','reviewed',false],['roles-0001','2026-10-23','topic-0001','reviewed',true],['future-001','2026-10-29','topic-0001','reviewed',false]])f.sql.prepare('INSERT INTO research_records VALUES(?,0,?)').run('recording:'+id,JSON.stringify({id,created:date,status:'ended',summary:{[topic]:{status,rolesChanged,content:'620nm is historical',updated:date}}}));
 let refs=await meetingReviewedKnowledge(f.env.DB,'topic-0001',current);assert.deepEqual(refs.map(x=>x.recordingId),['prior-0001']);assert.deepEqual(await meetingReviewedKnowledge(f.env.DB,'unclassified',current),[]);
 f.sql.prepare("UPDATE research_records SET payload=json_set(payload,'$.summary.\"topic-0001\".status','draft') WHERE id='recording:prior-0001'").run();assert.deepEqual(await meetingReviewedKnowledge(f.env.DB,'topic-0001',current),[]);
});
test('review edits retain prior approved text in history without stale overwrite',async()=>{
 const f=fixture();await create(f);await f.call('recording-save',snap);
 await f.call('recording-summary-save',{id,version:1,topic:'topic-0001',content:'First approved',status:'reviewed'});
 await f.call('recording-summary-save',{id,version:2,topic:'topic-0001',content:'Corrected',status:'reviewed'});
 const s=await(await f.call('recording-detail?id='+id)).json();assert.equal(s.summaryHistory.at(-1).content,'First approved');assert.equal(s.summary['topic-0001'].content,'Corrected');
 assert.equal((await f.call('recording-summary-save',{id,version:2,topic:'topic-0001',content:'Stale'})).status,409);
});

test('explicit uncertain retry preserves completed transcript and isolates jobs',async()=>{
 const f=fixture();await create(f);await f.call('recording-save',snap);
 const row=f.sql.prepare('SELECT payload FROM research_records WHERE id=?').get('recording:'+id),m=JSON.parse(row.payload);
 m.processing={status:'attention'};m.transcription={completedParts:2,status:'partial'};
 f.sql.prepare('UPDATE research_records SET payload=? WHERE id=?').run(JSON.stringify(m),'recording:'+id);
 for(const [job,topic] of [['unknown','recording:'+id],['other','recording:other-0001']])f.sql.prepare('INSERT INTO research_jobs VALUES(?,?,?,?,?,?,?,?,?)').run(job,topic,OWNER.email,'2026-10','uncertain',100,0,'{}','now');
 const b={id,version:1,acknowledgeDuplicateCost:true};
 assert.equal((await f.call('recording-retry-uncertain',b,STUDENT)).status,403);
 assert.equal((await f.call('recording-retry-uncertain',{...b,acknowledgeDuplicateCost:false})).status,400);
 assert.equal((await f.call('recording-retry-uncertain',{...b,version:0})).status,409);
 const r=await f.call('recording-retry-uncertain',b);assert.equal(r.status,200);const next=await r.json();
 assert.deepEqual(next.segments,m.segments);assert.equal(next.transcription.completedParts,2);assert.equal(next.processing.status,'queued');assert.equal(next.transcriptionEpoch,1);
 assert.equal(f.sql.prepare("SELECT status FROM research_jobs WHERE id='unknown'").get().status,'abandoned');assert.equal(f.sql.prepare("SELECT status FROM research_jobs WHERE id='other'").get().status,'uncertain');
 assert.equal((await f.call('recording-retry-uncertain',{...b,version:2})).status,409);
});

test('work stream sends heartbeat before slow result and preserves error semantics',async()=>{
 const {researchWorkStream}=await import('../server/research-room.mjs');let finish;
 const response=researchWorkStream(()=>new Promise(resolve=>{finish=resolve}),5),reader=response.body.getReader(),decoder=new TextDecoder();
 let text=decoder.decode((await reader.read()).value);assert.equal(text,'\n');
 text+=decoder.decode((await reader.read()).value);assert.equal(text.trim(),'');
 finish(Response.json({error:'test rejection'},{status:409}));
 while(true){const {done,value}=await reader.read();if(done)break;text+=decoder.decode(value);}
 assert.deepEqual(JSON.parse(text),{error:'test rejection',__httpStatus:409});
});

test('queue refresh reflects completion by another client without another AI request',async()=>{
 const c=nativeContext();const calls=[];
 c.researchFetch=async action=>{calls.push(action);if(action==='recording-queue')return {meetings:[{id,processing:{status:'completed',updated:'new'}}]};if(action.startsWith('recording-detail'))return {id,version:3,segments:[],summary:{'topic-A':{content:'saved result'}},processing:{status:'completed',updated:'new'}};if(action==='recording-list')return {meetings:[]};throw Error(action);};
 vm.runInContext(`meetingRecorder.session={id:'${id}',processing:{status:'working',updated:'old'}};meetingRecorder.active=false;meetingRecorder.dirty=false;meetingRecorder.syncing=false;mrPaint=()=>{};`,c);
 await vm.runInContext('mrPump()',c);
 assert.equal(vm.runInContext('meetingRecorder.session.processing.status',c),'completed');assert.equal(vm.runInContext("meetingRecorder.session.summary['topic-A'].content",c),'saved result');assert.ok(!calls.includes('recording-work'));
});

import {validateVoiceWav,matchMeetingVoices,labelKnownMeetingSegments} from '../server/meeting-recording.mjs';
function voiceWav(seconds=3){const bytes=new Uint8Array(44+seconds*32000),v=new DataView(bytes.buffer),str=(n,s)=>[...s].forEach((c,i)=>bytes[n+i]=c.charCodeAt(0));str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,bytes.length-44,true);for(let i=44;i<bytes.length;i+=2)v.setInt16(i,Math.round(Math.sin(i/20)*3000),true);return bytes;}
const voices=[{id:'voice-prof-001',name:'홍길동',role:'professor'},{id:'voice-student-001',name:'김하나',role:'student'},{id:'voice-student-002',name:'이지민',role:'student'}];
async function registerVoices(f){for(const p of voices){const r=await f.call('recording-voice-save',{...p,base64:Buffer.from(voiceWav()).toString('base64')});assert.equal(r.status,200);}}
test('voice registration validates audio and is inaccessible to students',async()=>{
 const f=fixture(),b={...voices[0],base64:Buffer.from(voiceWav()).toString('base64')};
 assert.equal((await f.call('recording-voice-save',b,STUDENT)).status,403);assert.equal((await f.call('recording-voices',null,STUDENT)).status,403);assert.equal((await f.call('recording-voice-audio?id='+b.id,null,STUDENT)).status,403);
 assert.equal(validateVoiceWav(voiceWav()),3);assert.throws(()=>validateVoiceWav(voiceWav(1)));const silent=voiceWav();silent.fill(0,44);assert.throws(()=>validateVoiceWav(silent));
 await registerVoices(f);const list=await(await f.call('recording-voices')).json();assert.equal(list.voices.length,3);assert.ok(list.voices.every(p=>!p.base64));assert.equal((await f.call('recording-voice-save',{...b,id:'voice-dupe-001'})).status,400);
 assert.equal((await f.call('recording-voice-audio?id='+b.id)).headers.get('Content-Type'),'audio/wav');
});
test('roll call matches registered names without assuming the named person spoke',()=>{
 const r=matchMeetingVoices('오늘 참여자는 김 하나, 이지민입니다.',voices);assert.equal(r.status,'ready');assert.deepEqual(r.participants.map(p=>p.name),['홍길동','김하나','이지민']);
 assert.equal(matchMeetingVoices('오늘 학생과 미팅합니다.',voices).status,'review');
 const many=[...voices,{id:'extra-001',name:'학생가',role:'student'},{id:'extra-002',name:'학생나',role:'student'}];assert.equal(matchMeetingVoices('김하나 이지민 학생가 학생나',many).status,'review');
});
test('voice identity stays stable across chunks and unrecognized voices remain unassigned',()=>{
 const part={start:300,end:600},data={segments:[{speaker:'voice1',text:'결과입니다',start:1,end:2},{speaker:'other',text:'네',start:3,end:4}]};const a=labelKnownMeetingSegments(data,voices,part,1),b=labelKnownMeetingSegments(data,voices,{start:600,end:900},2);assert.equal(a[0].speaker,b[0].speaker);assert.equal(a[0].speaker,'voice-'+voices[1].id);assert.equal(a[1].speaker,'speaker-unmatched');assert.equal(a[0].start,301);
});
test('roll call and registered references drive subsequent transcription end to end',async()=>{
 const f=fixture();await registerVoices(f);await create(f);await f.call('recording-audio',{id,index:0,base64:'AQID'});await f.call('recording-audio',{id,index:1,base64:'AQID'});
 await f.call('recording-save',{...snap,segments:[],audioCount:2,audioParts:[{first:0,count:1,start:0,end:8,mime:'audio/webm'},{first:1,count:1,start:8,end:40,mime:'audio/webm'}]});f.env.OPENAI_API_KEY='test-secret';let calls=0;const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{if(url.includes('/models/'))return Response.json({});calls++;const form=options.body;if(calls===1){assert.deepEqual(form.getAll('known_speaker_names[]'),[]);return Response.json({segments:[{speaker:'A',start:0,end:7,text:'오늘 참여자는 홍길동 교수, 김하나, 이지민입니다.'}]});}assert.deepEqual(form.getAll('known_speaker_names[]'),['voice0','voice1','voice2']);assert.equal(form.getAll('known_speaker_references[]').length,3);return Response.json({segments:[{speaker:'voice1',start:0,end:3,text:'실험 결과를 설명합니다.'},{speaker:'voice0',start:4,end:6,text:'조건을 비교해주세요.'}]});};
 try{let r=await f.call('recording-transcribe',{id});assert.equal(r.status,200);let m=await r.json();assert.equal(m.voiceSelection.status,'ready');assert.equal(m.segments[0].speaker,'voice-'+voices[0].id);r=await f.call('recording-transcribe',{id});assert.equal(r.status,200);m=await r.json();assert.equal(m.segments[1].speaker,'voice-'+voices[1].id);assert.equal(m.speakers[m.segments[1].speaker],'김하나 · 학생');assert.equal(m.speakers[m.segments[2].speaker],'홍길동 · 교수님');assert.equal(m.transcription.status,'completed');}finally{globalThis.fetch=old;}
});
test('ambiguous roster pauses transcription and manual confirmation resumes it',async()=>{
 const f=fixture();await registerVoices(f);await create(f);await f.call('recording-save',snap);let m=JSON.parse(f.sql.prepare('SELECT payload FROM research_records WHERE id=?').get('recording:'+id).payload);m.voiceSelection={status:'review'};m.transcription={completedParts:1,status:'partial'};m.processing={status:'queued'};f.sql.prepare('UPDATE research_records SET payload=? WHERE id=?').run(JSON.stringify(m),'recording:'+id);
 const work=await(await f.call('recording-work',{id})).json();assert.equal(work.processing.status,'participants-required');
 assert.equal((await f.call('recording-participants',{id,version:work.version,participants:[voices[0].id,voices[1].id]},STUDENT)).status,403);
 const r=await f.call('recording-participants',{id,version:work.version,participants:[voices[0].id,voices[1].id]});assert.equal(r.status,200);assert.equal((await r.json()).voiceSelection.status,'ready');assert.equal((await f.call('recording-voice-delete',{id:voices[0].id,version:1})).status,409);
});
test('voice menu is professor only and script follows entered name',()=>{const c=nativeContext();vm.runInContext('researchRoomState.rooms={};esc=x=>x;',c);assert.match(vm.runInContext('mrSidebar()',c),/음성 등록/);assert.match(vm.runInContext("mrVoiceScript('김하나')",c),/저는 김하나입니다/);const s=nativeContext(undefined,false);assert.equal(vm.runInContext('mrSidebar()',s),'');});
