import test from 'node:test';import assert from 'node:assert/strict';import {createWorker,fresh,visible} from '../server/worker.mjs';
const OWNER='owner@example.test';
function fixture(){const state=fresh();state.students=['student@example.test'];state.data.papers=[{title:'A',year:2026,points:100,engineeringPoints:200}];state.data.payroll=[{name:'PRIVATE_PERSON',monthly:100}];state.data.funds=[{balance:500,months:[]}];let row={version:0,payload:JSON.stringify(state)};const DB={prepare(sql){return {bind(...a){this.a=a;return this;},async first(){return {...row};},async run(){if(sql.startsWith('UPDATE')){if(this.a[1]!==row.version)return {meta:{changes:0}};row={version:row.version+1,payload:this.a[0]};return {meta:{changes:1}};}return {meta:{changes:0}};}};}};return {env:{DB,ADMIN_EMAIL:OWNER},worker:createWorker('<p>Dashboard</p>')};}
const req=(email,path='/api/data',method='GET',body)=>new Request('https://lab.example'+path,{method,headers:{...(email?{'oai-authenticated-user-id':'verified-id','oai-authenticated-user-email':email}:{}),...(method==='PUT'?{'Origin':'https://lab.example','Content-Type':'application/json','X-Lab-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('anonymous and unapproved users cannot read HTML or API',async()=>{const {worker,env}=fixture();assert.equal((await worker.fetch(req(null),env)).status,401);assert.equal((await worker.fetch(req('unknown@example.test','/'),env)).status,403);});
test('student API excludes financial data and faculty points',async()=>{const {worker,env}=fixture();const r=await worker.fetch(req('student@example.test'),env);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.data.payroll,[]);assert.deepEqual(d.data.funds,[]);assert.ok(!JSON.stringify(d).includes('PRIVATE_PERSON'));assert.equal(d.data.papers[0].points,undefined);assert.deepEqual(d.students,[]);});
test('student cannot upload data or grant accounts',async()=>{const {worker,env}=fixture();for(const path of ['/api/data','/api/students'])assert.equal((await worker.fetch(req('student@example.test',path,'PUT',{version:0,data:fresh().data,students:[]}),env)).status,403);});
test('owner updates persist and stale saves are rejected',async()=>{const {worker,env}=fixture();const input={version:0,students:['new@example.test']};assert.equal((await worker.fetch(req(OWNER,'/api/students','PUT',input),env)).status,200);assert.equal((await worker.fetch(req(OWNER,'/api/students','PUT',input),env)).status,409);assert.equal((await worker.fetch(req('new@example.test'),env)).status,200);assert.equal((await worker.fetch(req('student@example.test'),env)).status,403);});
test('cross origin mutation blocked',async()=>{const {worker,env}=fixture(),r=req(OWNER,'/api/data','PUT',{version:0,data:fresh().data});r.headers.set('Origin','https://other.example');assert.equal((await worker.fetch(r,env)).status,403);});
test('direct conference and expense edits persist without replacing original months',async()=>{const {worker,env}=fixture();const original=await (await worker.fetch(req(OWNER),env)).json();const d=original.data;d.conferences.push({id:'direct',manual:true,year:2026,date:'2026-09-20',presenter:'Researcher',conference:'Conference',kind:'구두',scope:'국제',city:'Seoul',venue:'Convention Center',locationEdited:true});d.funds[0].months=[{month:'8월',spend:100,balance:500}];d.funds[0].entries=[{id:'expense',date:'2026-09-20',description:'Supplies',amount:120,note:''}];assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:d}),env)).status,200);const saved=await (await worker.fetch(req(OWNER),env)).json();assert.deepEqual(saved.data,d);d.funds[0].entries[0].amount=150;assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data:d}),env)).status,200);const edited=await (await worker.fetch(req(OWNER),env)).json();assert.equal(edited.data.funds[0].entries[0].amount,150);assert.deepEqual(edited.data.funds[0].months,[{month:'8월',spend:100,balance:500}]);});
test('invalid direct entries are rejected without changing saved records',async()=>{for(const change of [d=>d.funds[0].entries[0].amount=-1,d=>d.funds[0].entries[0].amount=1.5,d=>d.funds[0].entries[0].date='2026-02-30',d=>d.funds[0].entries[0].description=' ',d=>d.conferences[0].year=2025,d=>{Object.assign(d.conferences[0],{locationEdited:true,scope:'invalid',city:'City',venue:'Venue'});}]){const {worker,env}=fixture();const d=(await (await worker.fetch(req(OWNER),env)).json()).data;d.funds[0].entries=[{date:'2026-09-20',description:'Supplies',amount:120}];d.conferences=[{manual:true,year:2026,date:'2026-09-20',presenter:'Researcher',conference:'Meeting',kind:'구두'}];change(d);assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:d}),env)).status,400);assert.equal((await (await worker.fetch(req(OWNER),env)).json()).version,0);}});

test('conference calendar keeps unknown dates unknown and calculates local deadline days',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');const source=await readFile(new URL('../app.js',import.meta.url),'utf8');const context=vm.createContext({Intl,Date,Math});vm.runInContext(source.slice(source.indexOf('function calendarDay(')),context);
 const d={date:'2026-09-24',tz:'America/New_York',time:'23:59'};
 assert.equal(context.deadlineState(d,new Date('2026-09-25T02:00:00Z')).label,'오늘 마감 · 시각 확인');assert.equal(context.deadlineState(d,new Date('2026-09-25T04:01:00Z')).label,'마감');assert.equal(context.deadlineState(d,new Date('2026-09-20T12:00:00Z')).label,'D-4');
 assert.match(context.deadlineList([]),/미공개/);
 const info=vm.runInContext(await readFile(new URL('../conference-info.js',import.meta.url),'utf8')+'\nConferenceInfo;',context);assert.equal(new Set(info.events.map(e=>e.id)).size,info.events.length);
 for(const e of info.events){assert.ok(info.icons[e.society]);assert.equal(new URL(e.url).protocol,'https:');assert.ok(e.sources.length);if(e.start)assert.ok(e.end>=e.start);for(const d of [...e.abstracts,...e.registration]){assert.equal(new Date(d.date).toISOString().slice(0,10),d.date);assert.doesNotThrow(()=>context.deadlineState(d));}}
 const ksiec=info.events.find(e=>e.id==='ksiec-2026-fall');assert.equal(ksiec.registration.length,2);assert.equal(info.events.find(e=>e.id==='colloids-2027').abstracts.length,0);
});

test('original fund edits and optional end date persist while preserving expense entries',async()=>{
 const {worker,env}=fixture();const d=(await (await worker.fetch(req(OWNER),env)).json()).data;
 d.funds[0]={...d.funds[0],title:'Edited fund',total:1000,balance:700,initialEdited:true,endDate:'2027-02-28',months:[{month:'9월',spend:300,balance:700}],entries:[{date:'2026-09-20',description:'Supplies',amount:100}]};
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:d}),env)).status,200);
 assert.deepEqual((await (await worker.fetch(req(OWNER),env)).json()).data.funds,d.funds);
 d.funds[0].endDate='2027-02-30';assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data:d}),env)).status,400);
 d.funds[0].endDate='';assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data:d}),env)).status,200);
});
test('fund countdown uses the Korean calendar and handles today, ended, and missing dates',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');const source=await readFile(new URL('../app.js',import.meta.url),'utf8');const context=vm.createContext({Intl,Date,Math,badge:s=>s});
 vm.runInContext(source.slice(source.indexOf('function calendarDay('))+source.slice(source.indexOf('function fundCountdown('),source.indexOf('function editFund(')),context);
 const now=new Date('2026-09-20T15:01:00Z');assert.equal(context.fundCountdown('2026-09-22',now),'D-1');assert.equal(context.fundCountdown('2026-09-21',now),'D-DAY');assert.equal(context.fundCountdown('2026-09-20',now),'종료');assert.equal(context.fundCountdown('',now),'');
});

test('website metadata sync is atomic, idempotent and preserves private data and unmatched drafts',async()=>{
 const {gzipSync}=await import('node:zlib');const {worker,env}=fixture();
 const catalog={revision:'test-publications-v1',source:'https://lab.example/publications',checked:'2026-09-20',papers:[{websiteNumber:1,title:'Updated A',titleAliases:['A'],year:2026,journal:'Journal',authorList:[{name:'Example Author',korean:'예시저자',first:true}],firstAuthor:'예시저자',authorNamesKo:['예시저자']}]};
 env.PAPER_CATALOG_REVISION=catalog.revision;env.PAPER_CATALOG_CHUNKS='1';env.PAPER_CATALOG_GZIP_1=gzipSync(JSON.stringify(catalog)).toString('base64');
 const original=(await (await worker.fetch(req(OWNER),env)).json());assert.equal(original.version,1);assert.equal(original.data.papers.length,1);assert.equal(original.data.papers[0].title,'Updated A');assert.equal(original.data.papers[0].points,100);assert.equal(original.data.funds[0].balance,500);assert.equal(original.data.payroll[0].monthly,100);
 const again=await (await worker.fetch(req(OWNER),env)).json();assert.equal(again.version,1);
 const student=await (await worker.fetch(req('student@example.test'),env)).json();assert.equal(student.data.papers[0].authorNamesKo[0],'예시저자');assert.equal(student.data.papers[0].points,undefined);assert.deepEqual(student.data.funds,[]);
 const stale=await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:original.data}),env);assert.equal(stale.status,409);
});

test('paper publication fields save, validate partial dates and retain edit overrides',async()=>{
 const {worker,env}=fixture();const d=(await (await worker.fetch(req(OWNER),env)).json()).data;
 d.papers[0]={...d.papers[0],journal:'Example Journal',correspondingAuthor:'Example Corresponding Author',volume:'25',issue:'1',pages:'419–425',articleNumber:'',issueDate:'2026-02',onlineDate:'2025-12-16',doi:'10.1234/example',publicationUrl:'https://doi.org/10.1234/example',paperEditedFields:['issueDate','pages','correspondingAuthor']};
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:d}),env)).status,200);
 const saved=(await (await worker.fetch(req(OWNER),env)).json());assert.deepEqual(saved.data,d);
 for(const date of ['2026-02-30','2026-13','2026-00','26-01','2026-1-01']){d.papers[0].issueDate=date;assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data:d}),env)).status,400);}
 const student=(await (await worker.fetch(req('student@example.test'),env)).json()).data;assert.equal(student.papers[0].issueDate,'2026-02');assert.equal(student.papers[0].points,undefined);
});
test('catalog refresh and workbook import preserve manual paper edits and unknown drafts',async()=>{
 const {mergePaperCatalog}=await import('../server/worker.mjs');const {readFile}=await import('node:fs/promises');const vm=await import('node:vm');
 const d=fresh().data;d.papers=[{id:'a',title:'Manually revised title',titleAliases:['Original title'],year:2026,journal:'Journal',firstAuthor:'Edited author',issueDate:'2026-08',pages:'55–60',fund:'Private fund',metadataSource:'https://lab.example/papers',websiteNumber:1,paperEditedFields:['title','issueDate','pages','fund'],points:100},{id:'draft',title:'Draft',year:2026,firstAuthor:'Draft author',paperEditedFields:['firstAuthor']}];
 const cat={source:'https://lab.example/papers',checked:'2026-09-20',patchFields:['title','volume','pages','issueDate'],papers:[{websiteNumber:1,title:'Original title',year:2026,volume:'34',pages:'1–10',issueDate:'2026-09',authorList:[{name:'Example'}]}]};
 const merged=mergePaperCatalog(d,cat);assert.equal(merged.papers.length,2);assert.equal(merged.papers[0].title,'Manually revised title');assert.equal(merged.papers[0].pages,'55–60');assert.equal(merged.papers[0].issueDate,'2026-08');assert.equal(merged.papers[0].firstAuthor,'Edited author');assert.equal(merged.papers[0].volume,'34');assert.equal(merged.papers[0].points,100);
 const context=vm.createContext({structuredClone});vm.runInContext((await readFile(new URL('../data.js',import.meta.url),'utf8'))+'\nthis.adapter=LabData;',context);
 const imported=context.adapter.merge(merged,{type:'papers',data:{papers:[{id:'excel',title:'Original title',year:2020,fund:'Workbook fund'}],sources:[],issues:[]}});
 assert.equal(imported.papers.length,2);assert.equal(imported.papers[0].title,'Manually revised title');assert.equal(imported.papers[0].issueDate,'2026-08');assert.equal(imported.papers[0].fund,'Private fund');assert.equal(imported.papers[1].firstAuthor,'Draft author');
});
