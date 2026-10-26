import test from 'node:test';import assert from 'node:assert/strict';import {createWorker,fresh,visible,mergePaperCoauthors} from '../server/worker.mjs';
const OWNER='owner@example.test';
test('students add and edit research while financial and administrative data remain intact',async()=>{
 const {worker,env}=fixture();const original=await (await worker.fetch(req(OWNER),env)).json();original.data.papers[0].id='existing';original.data.papers[0].fund='private fund';
 await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:original.data}),env);
 const changes=[{type:'papers',id:'existing',action:'edit',values:{title:'Revised paper',journal:'Journal',firstAuthor:'Student Author'}},{type:'papers',id:'new-paper',action:'add',values:{title:'New paper',journal:'Journal',year:2026,sci:'Y',authorCount:3}},{type:'conferences',id:'new-talk',action:'add',values:{title:'Talk',year:2026,date:'2026-09-21',presenter:'Student',conference:'Conference',scope:'국내',city:'Seoul',venue:'Hall',kind:'구두'}}];
 assert.equal((await worker.fetch(req('student@example.test','/api/research','PUT',{version:1,changes}),env)).status,200);
 let saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.data.papers[0].title,'Revised paper');assert.equal(saved.data.papers[0].points,100);assert.equal(saved.data.papers[0].fund,'private fund');assert.deepEqual(saved.data.funds,original.data.funds);assert.deepEqual(saved.data.payroll,original.data.payroll);assert.equal(saved.data.conferences.length,1);assert.ok(saved.data.papers[0].paperEditedFields.includes('firstAuthor'));
 const edit=[{type:'conferences',id:'new-talk',action:'edit',values:{title:'Revised talk'}}];assert.equal((await worker.fetch(req('student@example.test','/api/research','PUT',{version:2,changes:edit}),env)).status,200);
 assert.equal((await worker.fetch(req('student@example.test','/api/research','PUT',{version:2,changes:edit}),env)).status,409);
 for(const change of [{type:'funds',id:'x',action:'add',values:{title:'bad'}},{type:'papers',id:'existing',action:'edit',values:{fund:'overwrite'}},{type:'papers',id:'existing',action:'edit',values:{points:0}},{type:'papers',id:'existing',action:'delete',values:{title:'bad'}},{type:'papers',id:'existing',action:'edit',values:{paperEditedFields:['fund']}}])assert.equal((await worker.fetch(req('student@example.test','/api/research','PUT',{version:3,changes:[change]}),env)).status,400);
 assert.equal((await worker.fetch(req('unapproved@example.test','/api/research','PUT',{version:3,changes:edit}),env)).status,403);
 saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.version,3);assert.equal(saved.data.conferences[0].title,'Revised talk');assert.equal(saved.notifications[0].actor,'연구실 구성원');
});
test('authorized student roster applies once and owner revocation remains effective',async()=>{
 const {worker,env}=fixture();env.STUDENT_ACCESS_REVISION='roster-1';env.STUDENT_ACCESS_ROSTER=JSON.stringify([{name:'Student One',email:'one@example.test'}]);
 assert.equal((await worker.fetch(req('unlisted@example.test'),env)).status,403);
 const first=await worker.fetch(req('one@example.test'),env);assert.equal(first.status,200);const student=await first.json();assert.equal(student.user.role,'student');assert.deepEqual(student.students,[]);assert.deepEqual(student.studentNames,{});assert.deepEqual(student.data.funds,[]);assert.deepEqual(student.data.payroll,[]);
 const owner=await (await worker.fetch(req(OWNER),env)).json();assert.ok(owner.students.includes('one@example.test'));assert.ok(owner.students.includes('student@example.test'));assert.equal(owner.studentNames['one@example.test'],'Student One');
 assert.equal((await worker.fetch(req(OWNER,'/api/students','PUT',{version:owner.version,students:owner.students.filter(s=>s!=='one@example.test')}),env)).status,200);
 assert.equal((await worker.fetch(req('one@example.test'),env)).status,403);assert.equal((await worker.fetch(req('one@example.test','/api/notifications'),env)).status,403);assert.equal((await worker.fetch(req('student@example.test'),env)).status,200);
 assert.equal((await (await worker.fetch(req(OWNER),env)).json()).students.includes('one@example.test'),false);
});
test('research notifications persist, exclude private fields and ignore metadata-only edits',async()=>{
 const {worker,env}=fixture();const initial=await (await worker.fetch(req(OWNER),env)).json(),d=initial.data;
 d.papers[0].journal='Updated journal';d.papers[0].fund='PRIVATE FUND';d.conferences.push({id:'new',year:2026,presenter:'Author',conference:'Meeting',title:'Talk'});
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:d}),env)).status,200);
 const feed=await (await worker.fetch(req('student@example.test','/api/notifications'),env)).json();assert.equal(feed.notifications.length,2);assert.ok(!JSON.stringify(feed).includes('PRIVATE'));assert.ok(feed.notifications.some(n=>n.label==='논문 수정'));
 d.papers[0].fund='OTHER PRIVATE';d.papers[0].metadataChecked='2026-09-22';
 await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data:d}),env);assert.equal((await (await worker.fetch(req(OWNER,'/api/notifications'),env)).json()).notifications.length,2);
 d.conferences=[];await worker.fetch(req(OWNER,'/api/data','PUT',{version:2,data:d}),env);assert.equal((await (await worker.fetch(req(OWNER,'/api/notifications'),env)).json()).notifications[0].action,'삭제');
 assert.equal((await worker.fetch(req(null,'/api/notifications'),env)).status,401);
});
test('conference deployment notifications establish baseline and detect future editions without check-date noise',async()=>{
 const {env}=fixture();let events=[{id:'meeting-2027',name:'Meeting 2027',start:'2027-05-01',end:'2027-05-03',checked:'2026-09-21'}];
 let worker=createWorker('',events);let first=await (await worker.fetch(req(OWNER),env)).json();assert.equal(first.version,1);assert.equal(first.notifications.length,0);
 worker=createWorker('',[{...events[0],checked:'2026-09-22'}]);assert.equal((await (await worker.fetch(req(OWNER,'/api/notifications'),env)).json()).notifications.length,0);
 worker=createWorker('',[{...events[0],start:'2027-05-02'},{id:'meeting-2028',name:'Meeting 2028'}]);const feed=await (await worker.fetch(req(OWNER,'/api/notifications'),env)).json();assert.equal(feed.notifications.length,2);assert.ok(feed.notifications.some(n=>n.title==='Meeting 2028'&&n.action==='등록'));
 assert.equal((await (await worker.fetch(req(OWNER,'/api/notifications'),env)).json()).notifications.length,2);
});
test('paper form adds and edits SCI and author count with persistent validation',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');const source=await readFile(new URL('../app.js',import.meta.url),'utf8');let submit;
 const data=fresh().data,context=vm.createContext({data,crypto,Date,admin:()=>true,esc:s=>String(s??''),searchKey:s=>String(s||'').toLowerCase().replace(/\s/g,''),paperFirst:r=>r.firstAuthor||'',englishAuthorText:s=>s||'',field:()=>'',editor:(title,fields,save)=>{submit=save;}});
 vm.runInContext(source.slice(source.indexOf('function paperAuthorName('),source.indexOf('function editPaperAuthor(')),context);
 assert.equal(context.paperAuthorCount({authors:7}),7);assert.equal(context.paperAuthorCount({authorList:[{},{}]}),2);assert.equal(context.paperAuthorCount({authorCount:null,authors:7}),null);
 const values={title:'New paper',year:'2026',journal:'Test journal',firstAuthor:'First Author',correspondingAuthor:'Lead Author',volume:'1',issue:'2',pages:'3–4',articleNumber:'',sci:'SCI',authorCount:'5',issueDate:'2026-09',onlineDate:'',doi:'',publicationUrl:'',fund:''};
 context.editPaper();submit({...values},data);assert.equal(data.papers.length,1);assert.ok(data.papers[0].id);assert.equal(data.papers[0].authorCount,5);
 const {worker,env}=fixture();assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data}),env)).status,200);
 context.editPaper(0);submit({...values,sci:'KCI',authorCount:'6'},data);assert.equal(data.papers.length,1);assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data}),env)).status,200);
 const saved=(await (await worker.fetch(req('student@example.test'),env)).json()).data;assert.equal(saved.papers[0].sci,'KCI');assert.equal(saved.papers[0].authorCount,6);
 for(const bad of [{sci:'yes'},{authorCount:0},{authorCount:1.5},{authorCount:'5'}]){const invalid=structuredClone(data);Object.assign(invalid.papers[0],bad);assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:2,data:invalid}),env)).status,400);}
 const adapter=vm.createContext({structuredClone});vm.runInContext(await readFile(new URL('../data.js',import.meta.url),'utf8')+'\nthis.adapter=LabData;',adapter);
 const merged=adapter.adapter.merge(data,{type:'papers',data:{papers:[],sources:[],issues:[]}});assert.equal(merged.papers[0].sci,'KCI');assert.equal(merged.papers[0].authorCount,6);
});
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
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');const source=await readFile(new URL('../app.js',import.meta.url),'utf8');const context=vm.createContext({Intl,Date,Math});vm.runInContext(source.slice(source.indexOf('function calendarDay('),source.indexOf('// Shared research change feed')),context);
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
 vm.runInContext(source.slice(source.indexOf('function calendarDay('),source.indexOf('// Shared research change feed'))+source.slice(source.indexOf('function fundCountdown('),source.indexOf('function editFund(')),context);
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

test('removed papers stay removed after catalog refresh and workbook upload',async()=>{
 const {mergePaperCatalog}=await import('../server/worker.mjs');const {readFile}=await import('node:fs/promises');const vm=await import('node:vm');
 const d=fresh().data;d.papers=[{id:'draft',title:'Remove this draft',year:2026},{id:'published',title:'Keep this paper',year:2026}];d.funds=[{months:[],balance:10}];
 const catalog={source:'https://lab.example/papers',checked:'2026-09-20',papers:[{websiteNumber:1,title:'Keep this paper',year:2026,authorList:[{name:'Example Author',korean:'예시저자',nameMatch:'record',first:true}]}],removedPapers:[{id:'draft',title:'Remove this draft'}]};
 const merged=mergePaperCatalog(d,catalog);assert.equal(merged.papers.length,1);assert.equal(merged.papers[0].id,'published');assert.deepEqual(merged.funds,d.funds);assert.deepEqual(mergePaperCatalog(merged,catalog),merged);assert.equal(merged.authorAliases[0].english,'Example Author');
 const context=vm.createContext({structuredClone});vm.runInContext((await readFile(new URL('../data.js',import.meta.url),'utf8'))+'\nthis.adapter=LabData;',context);
 const result=context.adapter.merge(merged,{type:'papers',data:{papers:[{id:'new-excel-id',title:'Remove this draft',year:2026}],sources:[],issues:[]}});assert.equal(result.papers.length,1);assert.equal(result.papers[0].title,'Keep this paper');
});
test('name mappings save for shared Korean search and invalid mappings are rejected',async()=>{
 const {worker,env}=fixture();const d=(await (await worker.fetch(req(OWNER),env)).json()).data;d.authorAliases=[{korean:'예시학생',english:'Example Student'}];
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:d}),env)).status,200);
 const student=(await (await worker.fetch(req('student@example.test'),env)).json()).data;assert.deepEqual(student.authorAliases,d.authorAliases);assert.deepEqual(student.funds,[]);
 d.authorAliases[0].english='한글';assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data:d}),env)).status,400);
});
test('paper authors display in English and Korean search uses the saved mapping',async()=>{
 const {readFile}=await import('node:fs/promises');const vm=await import('node:vm');const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const r={title:'Test paper',year:2026,firstAuthor:'예시학생 (Example Student)',authorList:[{name:'Example Student',korean:'예시학생',first:true},{name:'Other Author',corresponding:true}]};const context=vm.createContext({data:{papers:[r],authorAliases:[{korean:'등록학생',english:'Example Student'}]}});
 vm.runInContext(source.slice(source.indexOf('const searchKey='),source.indexOf('const filter='))+source.slice(source.indexOf('function authorAliases('),source.indexOf('const badge='))+source.slice(source.indexOf('function paperAuthorName('),source.indexOf('function paperLocation(')),context);
 assert.equal(context.paperFirst(r),'Example Student');assert.equal(context.paperCorresponding(r),'Other Author');assert.equal(context.matchesResearch(r,'등록학생'),true);assert.equal(context.matchesResearch(r,'예시학생'),false);assert.equal(context.matchesResearch(r,'ExampleStudent'),true);
 assert.equal(context.englishAuthorText('예시학생 (Example Student), 다른이름 [확인 필요] (Other Author)'),'Example Student, Other Author');
 r.fund='RS-2024-00397807, 아주대학교 연구지원';for(const q of ['RS-2024-00397807','rs202400397807','00397807','아주대학교 연구지원'])assert.equal(context.matchesResearch(r,q),true);assert.equal(context.matchesResearch(r,'RS-2099-99999999'),false);delete r.fund;assert.equal(context.matchesResearch(r,'00397807'),false);
});

test('lab paper highlighting and recent papers distinguish lead and corresponding roles',async()=>{
 const {readFile}=await import('node:fs/promises');const vm=await import('node:vm');const source=await readFile(new URL('../app.js',import.meta.url),'utf8');const context=vm.createContext({data:{papers:[],authorAliases:[{korean:'학생',english:'Student Author'}]},labLeadAuthor:'Lab Professor',labMemberAuthors:['Former Student'],Intl,Date});
 vm.runInContext(source.slice(source.indexOf('const searchKey='),source.indexOf('const filter='))+source.slice(source.indexOf('function authorAliases('),source.indexOf('const badge='))+source.slice(source.indexOf('function paperAuthorName('),source.indexOf('function paperLocation('))+source.slice(source.indexOf('function calendarDay('),source.indexOf('// Shared research change feed')),context);
 assert.equal(context.labPaperRole({authorList:[{name:'Other Person',first:true},{name:'Student Author',equalContribution:true}]}).highlight,true);
 assert.equal(context.labPaperRole({authorList:[{name:'Lab Professor',corresponding:true}]}).highlight,true);
 assert.equal(context.labPaperRole({authorList:[{name:'Student Author'},{name:'Lab Professor'}]}).recent,false);
 assert.equal(context.labPaperRole({authorList:[{name:'Former Student',first:true}]}).highlight,true);
 const studentCorresponding=context.labPaperRole({authorList:[{name:'Student Author',corresponding:true}]});assert.equal(studentCorresponding.highlight,false);assert.equal(studentCorresponding.recent,true);
 assert.equal(context.labPaperRole({authorList:[{name:'Lab Professor',first:true}]}).highlight,false);
 assert.equal(context.labPaperRole({firstAuthor:'Student Author',paperEditedFields:['firstAuthor'],authorList:[]}).highlight,true);
 assert.equal(context.labPaperRole({firstAuthor:'Student Author Jr.',paperEditedFields:['firstAuthor']}).highlight,false);
 const rows=[{year:2014},{year:2015},{year:2026,date:'2026-09-21'},{year:2026,date:'2026-09-22'},{year:2027}];
 assert.equal(JSON.stringify(context.homePeriod(rows,new Date('2026-09-20T15:10:00Z'))),JSON.stringify([rows[1],rows[2]]));
});

test('account preferences survive reload, isolate users and preserve research records',async()=>{
 const {worker,env}=fixture();const before=await (await worker.fetch(req(OWNER),env)).json();
 const prefs={theme:'dark',accent:'green',texture:'jelly',papers:{selected:['논문 제목','출판일'],order:['출판일','논문 제목']},notifications:{read:['n1'],hidden:['n2']}};
 const saved=await worker.fetch(req('student@example.test','/api/preferences','PUT',prefs),env);assert.equal(saved.status,200);
 const student=await (await worker.fetch(req('student@example.test'),env)).json();assert.deepEqual(student.preferences,prefs);
 const owner=await (await worker.fetch(req(OWNER),env)).json();assert.deepEqual(owner.preferences,{});assert.deepEqual(owner.data,before.data);
 assert.equal((await worker.fetch(req('unapproved@example.test','/api/preferences','PUT',prefs),env)).status,403);
 assert.equal((await worker.fetch(req('student@example.test','/api/preferences','PUT',{papers:{selected:[{}],order:[]}}),env)).status,400);
 const stale={notifications:{read:[],hidden:[]}};await worker.fetch(req('student@example.test','/api/preferences','PUT',stale),env);
 const again=await (await worker.fetch(req('student@example.test'),env)).json();assert.deepEqual(again.preferences.notifications,{read:['n1'],hidden:['n2']});
});

test('paper deletion records title aliases and preserves unrelated records; only owner saves',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm'),source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const context=vm.createContext({Error});vm.runInContext(source.slice(source.indexOf('function removePaperRecord('),source.indexOf('function editPaperAuthor(')),context);
 const {worker,env}=fixture(),before=await (await worker.fetch(req(OWNER),env)).json(),next=structuredClone(before.data);next.papers[0]={...next.papers[0],id:'paper',titleAliases:['Earlier title']};
 context.removePaperRecord(next,next.papers[0]);assert.equal(next.papers.length,0);assert.deepEqual(Array.from(next.removedPapers,r=>r.title),['A','Earlier title']);assert.deepEqual(next.funds,before.data.funds);assert.deepEqual(next.payroll,before.data.payroll);
 assert.equal((await worker.fetch(req('student@example.test','/api/data','PUT',{version:0,data:next}),env)).status,403);
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:next}),env)).status,200);const saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.data.papers.length,0);assert.equal(saved.notifications[0].action,'삭제');
});

test('reagent CRUD persists across reload, preserves finance and enforces administrator writes',async()=>{
 const {worker,env}=fixture();const original=await (await worker.fetch(req(OWNER),env)).json();const next=structuredClone(original.data);
 const reagent={id:'reagent-1',name:'Example reagent',unit:'mL',capacity:'100',quantity:'2',location:'냉장고 1층',note:'Manufacturer',links:[]};next.reagents=[reagent];
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:next}),env)).status,200);
 const student=await (await worker.fetch(req('student@example.test'),env)).json();assert.deepEqual(student.data.reagents,[reagent]);assert.deepEqual(student.data.funds,[]);
 next.reagents[0].quantity='1';assert.equal((await worker.fetch(req('student@example.test','/api/data','PUT',{version:1,data:next}),env)).status,403);
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data:next}),env)).status,200);
 let saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.data.reagents[0].quantity,'1');assert.deepEqual(saved.data.funds,original.data.funds);assert.deepEqual(saved.data.payroll,original.data.payroll);
 const invalid=structuredClone(next);invalid.reagents.push({...reagent});assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:2,data:invalid}),env)).status,400);
 next.reagents=[];assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:1,data:next}),env)).status,409);assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:2,data:next}),env)).status,200);
 saved=await (await worker.fetch(req(OWNER),env)).json();assert.deepEqual(saved.data.reagents,[]);assert.deepEqual(saved.data.papers,original.data.papers);
});

test('reagent import respects column order, duplicates, units and blank auxiliary sheets',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');const s=await readFile(new URL('../reagents.js',import.meta.url),'utf8');const model=vm.runInNewContext(s.slice(0,s.indexOf("let reagentQuery"))+';ReagentData',{crypto});
 const rows=model.parse({inventory:[['','化','화학물질명','단위','용량','연구실입고수량','보관위치','비고'],['','','Same','mL',100,2,'냉장고','A'],['','','Same','L',1,1,'방폭장','B']],empty:[['화학물질명','단위','용량','연구실입고수량','보관위치','비고']]});
 assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.equal(rows[0].capacity,'100');assert.equal(rows[1].unit,'L');assert.equal(model.filter(rows,'same','방폭장').length,1);assert.equal(model.filter(rows,'냉장고','all').length,1);assert.throws(()=>model.parse({bad:[['wrong header']]}));
});

test('coauthor enrichment only patches matching live papers and preserves manual authors and finance',()=>{
 const data=fresh().data;data.papers=[{id:'a',title:'A edited title',titleAliases:['A original'],year:2026,fund:'private',firstAuthor:'First',correspondingAuthor:'Lead'},{id:'b',title:'B',year:2025,coauthors:'Manual Author',paperEditedFields:['coauthors']},{id:'c',title:'Unpublished',year:2026}];data.funds=[{title:'PRIVATE',months:[]}];
 const catalog={source:'https://nisml.ajou.ac.kr/?page_id=234',checked:'2026-10-13',papers:[{title:'A original',coauthors:'Second, Third'},{title:'B',coauthors:'Website Author'},{title:'Deleted paper',coauthors:'No revival'}]};
 const r=mergePaperCoauthors(data,catalog);assert.equal(r.data.papers.length,3);assert.equal(r.data.papers[0].coauthors,'Second, Third');assert.equal(r.data.papers[0].fund,'private');assert.equal(r.data.papers[1].coauthors,'Manual Author');assert.equal(r.data.papers[2].coauthors,undefined);assert.deepEqual(r.data.funds,data.funds);assert.deepEqual(r.summary,{matched:2,filled:1,preserved:1,unmatched:1});
});
test('SCI initialization is once only and future KCI or non-indexed selections persist',async()=>{
 const {worker,env}=fixture();env.PAPER_SCI_REVISION='initial-sci-v1';const initial=await (await worker.fetch(req(OWNER),env)).json();assert.equal(initial.data.papers[0].sci,'SCI');
 for(const sci of ['KCI','해당사항없음','SCI']){const current=await (await worker.fetch(req(OWNER),env)).json();current.data.papers[0].sci=sci;current.data.papers[0].coauthors='Another Author';assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:current.version,data:current.data}),env)).status,200);assert.equal((await (await worker.fetch(req(OWNER),env)).json()).data.papers[0].sci,sci);}
 const before=await (await worker.fetch(req(OWNER),env)).json();const changes=[{type:'papers',id:'new',action:'add',values:{title:'New',year:2026,journal:'Journal',sci:'KCI',coauthors:'Author Two'}}];assert.equal((await worker.fetch(req('student@example.test','/api/research','PUT',{version:before.version,changes}),env)).status,200);const saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.data.papers[1].sci,'KCI');assert.equal(saved.data.papers[1].coauthors,'Author Two');
});

test('students edit existing reagents only, preserving records and rejecting unauthorized or stale changes',async()=>{
 const {worker,env}=fixture();const original=await (await worker.fetch(req(OWNER),env)).json();const next=structuredClone(original.data);
 next.reagents=[{id:'r1',name:'Example',unit:'mL',capacity:'100',quantity:'2',location:'냉장고',note:'old',links:[]}];
 await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:next}),env);
 const changes=[{id:'r1',values:{quantity:'1',location:'시약장',note:'updated',links:[]}}];
 assert.equal((await worker.fetch(req('student@example.test','/api/reagents','PUT',{version:1,changes}),env)).status,200);
 let saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.data.reagents[0].quantity,'1');assert.equal(saved.data.reagents[0].location,'시약장');assert.equal(saved.data.reagents[0].note,'updated');
 for(const k of ['papers','conferences','funds','payroll','sources'])assert.deepEqual(saved.data[k],next[k]);
 assert.equal((await worker.fetch(req('student@example.test','/api/reagents','PUT',{version:1,changes}),env)).status,409);
 assert.equal((await worker.fetch(req('unapproved@example.test','/api/reagents','PUT',{version:2,changes}),env)).status,403);
 for(const change of [{id:'new',values:{name:'New'}},{id:'r1',action:'delete',values:{}},{id:'r1',values:{id:'other'}},{id:'r1',values:{quantity:5}},{id:'r1',values:{name:''}},{id:'r1',values:{funds:[]}}])assert.equal((await worker.fetch(req('student@example.test','/api/reagents','PUT',{version:2,changes:[change]}),env)).status,400);
 assert.equal((await worker.fetch(req('student@example.test','/api/reagents','PUT',{version:2,changes,data:{funds:[]}}),env)).status,400);
 saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.version,2);assert.equal(saved.data.reagents.length,1);
});

test('shared content parity lets students add/delete/import reagents and manage papers and aliases without financial access',async()=>{
 const {worker,env}=fixture();const original=await (await worker.fetch(req(OWNER),env)).json();original.data.papers[0].id='existing-paper';await worker.fetch(req(OWNER,'/api/data','PUT',{version:0,data:original.data}),env);let student=await (await worker.fetch(req('student@example.test'),env)).json();
 student.data.reagents=[{id:'new-r',name:'Student reagent',unit:'g',capacity:'10',quantity:'1',location:'새 장소',note:'added',links:[]}];
 student.data.authorAliases=[{korean:'홍길동',english:'Gil Dong Hong'}];
 assert.equal((await worker.fetch(req('student@example.test','/api/shared','PUT',{version:1,data:student.data}),env)).status,200);
 let saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.data.reagents[0].name,'Student reagent');assert.equal(saved.data.authorAliases[0].english,'Gil Dong Hong');
 for(const k of ['funds','payroll','standards'])assert.deepEqual(saved.data[k],original.data[k]);assert.equal(saved.data.papers[0].points,original.data.papers[0].points);
 student=await (await worker.fetch(req('student@example.test'),env)).json();const removed=student.data.papers.shift();student.data.reagents=[];
 assert.equal((await worker.fetch(req('student@example.test','/api/shared','PUT',{version:2,data:student.data}),env)).status,200);
 saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.data.reagents.length,0);assert.ok(saved.data.removedPapers.some(r=>r.title===removed.title));
 for(const k of ['funds','payroll','standards']){const bad=structuredClone(student.data);bad[k]=[{title:'blocked'}];assert.equal((await worker.fetch(req('student@example.test','/api/shared','PUT',{version:3,data:bad}),env)).status,400);}
 assert.equal((await worker.fetch(req('unapproved@example.test','/api/shared','PUT',{version:3,data:student.data}),env)).status,403);
 assert.equal((await worker.fetch(req('student@example.test','/api/shared','PUT',{version:2,data:student.data}),env)).status,409);
 student=await (await worker.fetch(req('student@example.test'),env)).json();student.data.reagents=[{id:'import-r',name:'Imported reagent',unit:'mL',capacity:'50',quantity:'3',location:'냉장고',note:'',links:[]}];
 assert.equal((await worker.fetch(req('student@example.test','/api/shared','PUT',{version:3,data:student.data}),env)).status,200);
 saved=await (await worker.fetch(req(OWNER),env)).json();assert.equal(saved.data.reagents[0].id,'import-r');assert.deepEqual(saved.data.funds,original.data.funds);assert.deepEqual(saved.data.payroll,original.data.payroll);
});

test('group meeting sheet saves for approved members, rejects invalid and stale changes, and preserves private data',async()=>{
 const {worker,env}=fixture();const before=await(await worker.fetch(req(OWNER),env)).json();
 const meetings=[{id:'meeting-1',date:'2026-11-03',time:'14:30',presenter:'Student',kind:'랩세미나',location:'Room',note:'Topic'}];
 assert.equal((await worker.fetch(req('student@example.test','/api/group-meetings','PUT',{version:before.version,groupMeetings:meetings}),env)).status,200);
 const saved=await(await worker.fetch(req(OWNER),env)).json();assert.deepEqual(saved.data.groupMeetings,meetings);assert.deepEqual(saved.data.funds,before.data.funds);assert.deepEqual(saved.data.payroll,before.data.payroll);
 const student=await(await worker.fetch(req('student@example.test'),env)).json();assert.deepEqual(student.data.groupMeetings,meetings);assert.deepEqual(student.data.funds,[]);
 assert.equal((await worker.fetch(req('student@example.test','/api/group-meetings','PUT',{version:before.version,groupMeetings:meetings}),env)).status,409);
 for(const patch of [{date:'2026-02-30'},{time:'25:00'},{presenter:''},{kind:'invalid'}])assert.equal((await worker.fetch(req(OWNER,'/api/group-meetings','PUT',{version:saved.version,groupMeetings:[{...meetings[0],...patch}]}),env)).status,400);
 assert.equal((await worker.fetch(req(OWNER,'/api/group-meetings','PUT',{version:saved.version,groupMeetings:meetings,data:{funds:[]}}),env)).status,400);
 assert.equal((await worker.fetch(req('unapproved@example.test','/api/group-meetings','PUT',{version:saved.version,groupMeetings:meetings}),env)).status,403);
 assert.equal((await worker.fetch(req(null,'/api/group-meetings','PUT',{version:saved.version,groupMeetings:meetings}),env)).status,401);
});

test('game night is shared editable content with validation and private-data preservation',async()=>{
 const {worker,env}=fixture();const before=await(await worker.fetch(req(OWNER),env)).json();const gameNight={date:'2026-11-06',game:'Board games'};
 assert.equal((await worker.fetch(req('student@example.test','/api/game-night','PUT',{version:before.version,gameNight}),env)).status,200);
 const saved=await(await worker.fetch(req(OWNER),env)).json();assert.deepEqual(saved.data.gameNight,gameNight);assert.deepEqual(saved.data.funds,before.data.funds);assert.deepEqual(saved.data.payroll,before.data.payroll);
 const student=await(await worker.fetch(req('student@example.test'),env)).json();assert.deepEqual(student.data.gameNight,gameNight);assert.deepEqual(student.data.funds,[]);
 assert.equal((await worker.fetch(req(OWNER,'/api/game-night','PUT',{version:before.version,gameNight}),env)).status,409);
 for(const bad of [{...gameNight,date:'2026-02-30'},{...gameNight,game:'a'.repeat(121)},{...gameNight,funds:[]}])assert.equal((await worker.fetch(req(OWNER,'/api/game-night','PUT',{version:saved.version,gameNight:bad}),env)).status,400);
 assert.equal((await worker.fetch(req('unapproved@example.test','/api/game-night','PUT',{version:saved.version,gameNight}),env)).status,403);
 assert.equal((await worker.fetch(req(null,'/api/game-night','PUT',{version:saved.version,gameNight}),env)).status,401);
});

test('monthly Game Night archive preserves seasons and validates month/date boundaries',async()=>{
 const {worker,env}=fixture();const before=await(await worker.fetch(req(OWNER),env)).json();const gameNights=[{month:'2026-06',date:'2026-06-30',game:'Spring'},{month:'2026-07',date:'',game:'Summer'},{month:'2027-01',date:'2027-01-12',game:'New year'}];
 assert.equal((await worker.fetch(req('student@example.test','/api/game-nights','PUT',{version:before.version,gameNights}),env)).status,200);
 const saved=await(await worker.fetch(req(OWNER),env)).json();assert.deepEqual(saved.data.gameNights,gameNights);assert.deepEqual(saved.data.funds,before.data.funds);
 assert.deepEqual((await(await worker.fetch(req('student@example.test'),env)).json()).data.gameNights,gameNights);
 for(const rows of [[{month:'2026-06',date:'2026-07-01',game:'Bad'}],[gameNights[0],gameNights[0]],[{month:'2026-13',date:'',game:'Bad'}]])assert.equal((await worker.fetch(req(OWNER,'/api/game-nights','PUT',{version:saved.version,gameNights:rows}),env)).status,400);
 assert.equal((await worker.fetch(req(OWNER,'/api/game-nights','PUT',{version:before.version,gameNights}),env)).status,409);
 assert.equal((await worker.fetch(req('unapproved@example.test','/api/game-nights','PUT',{version:saved.version,gameNights}),env)).status,403);
 assert.equal((await worker.fetch(req(null,'/api/game-nights','PUT',{version:saved.version,gameNights}),env)).status,401);
});
test('schedule registration notices are shared by owner and students including the author',async()=>{
 const {worker,env}=fixture();const initial=await (await worker.fetch(req(OWNER),env)).json();
 const response=await worker.fetch(req('student@example.test','/api/game-nights','PUT',{version:initial.version,gameNights:[{month:'2099-06',date:'2099-06-10',game:'Shared game'}]}),env);assert.equal(response.status,200);
 const owner=await (await worker.fetch(req(OWNER),env)).json(),student=await (await worker.fetch(req('student@example.test'),env)).json();
 const notice=owner.notifications.find(n=>n.type==='groupMeetings'&&n.action==='등록'&&n.detail.includes('Shared game'));assert.ok(notice);assert.ok(student.notifications.some(n=>n.id===notice.id));
 assert.equal((await worker.fetch(req('outsider@example.test','/api/notifications'),env)).status,403);
});
test('annual plan saves atomically, shares one notice and preserves other data',async()=>{
 const {worker,env}=fixture();const before=await(await worker.fetch(req(OWNER),env)).json();
 const plan={year:2027,start:'2027-03-04',time:'15:00',location:'Room',kind:'랩세미나',names:['A','B'],first:'A'};
 const groupMeetings=[{id:'annual-a',date:'2027-03-04',time:'15:00',kind:'랩세미나',presenter:'A',location:'Room',note:'',academicYear:2027,locked:false},{id:'annual-b',date:'2027-03-18',time:'15:00',kind:'논문발표',presenter:'B',location:'Room',note:'',academicYear:2027,locked:false}];
 const body={version:before.version,planYear:2027,plan,groupMeetings};
 const response=await worker.fetch(req('student@example.test','/api/group-meetings','PUT',body),env);assert.equal(response.status,200,await response.text());
 const owner=await(await worker.fetch(req(OWNER),env)).json(),student=await(await worker.fetch(req('student@example.test'),env)).json();
 assert.deepEqual(owner.data.groupPlans['2027'],plan);assert.deepEqual(student.data.groupPlans,owner.data.groupPlans);assert.deepEqual(owner.data.funds,before.data.funds);assert.deepEqual(owner.data.payroll,before.data.payroll);
 const notices=owner.notifications.filter(n=>n.label==='그룹미팅 일정 확정');assert.equal(notices.length,1);assert.ok(student.notifications.some(n=>n.id===notices[0].id));
 assert.equal((await worker.fetch(req(OWNER,'/api/group-meetings','PUT',body),env)).status,409);
 assert.equal((await worker.fetch(req(OWNER,'/api/group-meetings','PUT',{...body,version:owner.version,plan:{...plan,names:['A','A']}}),env)).status,400);
});

test('verified paper grants persist once on authenticated reads without exposing financial data',async()=>{
 const {paperGrantCatalog}=await import('../server/paper-grants.mjs');const {worker,env}=fixture();const original=await (await worker.fetch(req(OWNER),env)).json();
 original.data.papers[0].doi=paperGrantCatalog[1].doi;
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:original.version,data:original.data}),env)).status,200);
 assert.equal((await worker.fetch(req('unapproved@example.test'),env)).status,403);
 const student=await (await worker.fetch(req('student@example.test'),env)).json();assert.equal(student.version,2);assert.deepEqual(student.data.funds,[]);assert.deepEqual(student.data.payroll,[]);
 const owner=await (await worker.fetch(req(OWNER),env)).json();assert.equal(owner.version,2);assert.equal(owner.data.papers[0].fund,'RS-2024-00397807');assert.equal(owner.data.papers[0].fundSource,paperGrantCatalog[1].source);assert.deepEqual(owner.data.funds,original.data.funds);
});

 test('purchase links seed once and students can remove all without regeneration',async()=>{
 const {worker,env}=fixture();let owner=await (await worker.fetch(req(OWNER),env)).json();
 owner.data.papers[0].id='links-paper';owner.data.reagents=[{id:'links-r',name:'Ecoflex 00-30 part A',unit:'g',capacity:'450',quantity:'1',location:'Shelf',note:'SMOOTH-ON'}];
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:owner.version,data:owner.data}),env)).status,200);
 owner=await (await worker.fetch(req(OWNER),env)).json();assert.equal(owner.data.reagents[0].links.length,3);assert.match(owner.data.reagents[0].links[0],/smooth-on.com/);
 const version=owner.version;assert.equal((await (await worker.fetch(req(OWNER),env)).json()).version,version);
 let student=await (await worker.fetch(req('student@example.test'),env)).json();student.data.reagents[0].links=[];
 assert.equal((await worker.fetch(req('student@example.test','/api/shared','PUT',{version:student.version,data:student.data}),env)).status,200);
 owner=await (await worker.fetch(req(OWNER),env)).json();assert.deepEqual(owner.data.reagents[0].links,[]);
 assert.equal((await (await worker.fetch(req(OWNER),env)).json()).version,owner.version);
 for(const links of [['javascript:alert(1)'],['https://user:pass@example.com'],['http://example.com'],Array(13).fill('https://example.com')])assert.equal((await worker.fetch(req('student@example.test','/api/reagents','PUT',{version:owner.version,changes:[{id:'links-r',values:{links}}]}),env)).status,400);
 assert.equal((await worker.fetch(req('student@example.test','/api/reagents','PUT',{version:owner.version,changes:[{id:'links-r',values:{links:['https://example.com/a','https://example.com/b']}}]}),env)).status,200);
 assert.deepEqual((await (await worker.fetch(req(OWNER),env)).json()).data.reagents[0].links,['https://example.com/a','https://example.com/b']);
 });

test('product links replace generated searches and preserve student deletions and custom URLs',async()=>{
 const {suggestReagentLinks,upgradedReagentLinks}=await import('../server/worker.mjs');
 const name='1-Decanol',note='DAEJUNG',search='https://www.google.com/search?q='+encodeURIComponent('site:daejungchem.co.kr '+name);
 const base={id:'product-r',name,note,unit:'mL',capacity:'500',quantity:'1',location:'Shelf'};
 assert.deepEqual(suggestReagentLinks(base),['https://4science.net/shop/goods/798624']);
 assert.deepEqual(upgradedReagentLinks({...base,links:[]}),[]);
 assert.deepEqual(upgradedReagentLinks({...base,links:['https://example.com/custom']}),['https://example.com/custom']);
 assert.deepEqual(upgradedReagentLinks({...base,links:[search,'https://example.com/custom']}),['https://example.com/custom','https://4science.net/shop/goods/798624']);
 const sigma=suggestReagentLinks({name:'(3-Aminopropyl)triethoxysilane',note:'SIGMA-ALDRICH'});assert.ok(sigma.length);assert.ok(sigma.every(u=>new URL(u).hostname==='www.sigmaaldrich.com'));
 assert.deepEqual(suggestReagentLinks({name:'Calcium chloride dry, 74.0%',note:'SAMCHUN'}),[]);
 assert.deepEqual(suggestReagentLinks({name:'Unknown reagent',note:'DAEJUNG'}),[]);
 const {worker,env}=fixture();let owner=await (await worker.fetch(req(OWNER),env)).json();owner.data.papers[0].id='product-paper';owner.data.reagents=[{...base,links:[search]}];
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:owner.version,data:owner.data}),env)).status,200);
 owner=await (await worker.fetch(req(OWNER),env)).json();assert.deepEqual(owner.data.reagents[0].links,['https://4science.net/shop/goods/798624']);
 assert.equal((await (await worker.fetch(req(OWNER),env)).json()).version,owner.version);
 const student=await (await worker.fetch(req('student@example.test'),env)).json();assert.deepEqual(student.data.reagents[0].links,owner.data.reagents[0].links);assert.deepEqual(student.data.funds,[]);
 assert.equal((await worker.fetch(req('student@example.test','/api/reagents','PUT',{version:student.version,changes:[{id:base.id,values:{links:[]}}]}),env)).status,200);
 owner=await (await worker.fetch(req(OWNER),env)).json();assert.deepEqual(owner.data.reagents[0].links,[]);
});

test('student session exposes only their own display name for personal schedules',async()=>{const {worker,env}=fixture();env.STUDENT_ACCESS_REVISION='personal-schedule';env.STUDENT_ACCESS_ROSTER=JSON.stringify([{name:'손은지',email:'student@example.test'},{name:'Other Student',email:'other@example.test'}]);const result=await (await worker.fetch(req('student@example.test'),env)).json();assert.equal(result.user.name,'손은지');assert.deepEqual(result.studentNames,{});assert.deepEqual(result.students,[]);});
test('personal schedules match whole presenter names, separate meeting kinds and stay hidden for professors',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');const source=await readFile(new URL('../app.js',import.meta.url),'utf8');const context=vm.createContext({Intl,Date,user:{role:'student',name:'손은지'},studentPreview:false,studentPreviewEmail:'',studentNames:{},esc:String,upcomingGroupMeetings:()=>[['2026-10-29','논문발표','손은지영','15:00',''],['2026-11-12','논문 발표','박진혁 · 손은지 · 박준하','15:00',''],['2027-01-21','랩세미나','손은지','15:00','']],groupMeetingCards:()=>'<shared>'});vm.runInContext(source.slice(source.indexOf('function groupMeetingCountdown('),source.indexOf('function groupMeetingCards(')),context);
 assert.equal(vm.runInContext("personalGroupMeetings('손은지').paper[0]",context),'2026-11-12');assert.equal(vm.runInContext("personalGroupMeetings('').paper",context),null);assert.equal(vm.runInContext("personalGroupMeetings('없는학생').seminar",context),null);assert.equal(vm.runInContext("groupMeetingCountdown('2026-10-25',new Date('2026-10-24T16:00:00Z'))",context),'오늘');assert.match(vm.runInContext("studentMeetingCards(new Date('2026-10-25T00:00:00Z'))",context),/D−18/);context.user.role='admin';assert.equal(vm.runInContext('studentMeetingCards()',context),'<shared>');
});

test('owner student preview is read-only and uses the selected student permissions',async()=>{
 const {worker,env}=fixture();env.STUDENT_ACCESS_REVISION='preview';env.STUDENT_ACCESS_ROSTER=JSON.stringify([{name:'학생 하나',email:'student@example.test'},{name:'학생 둘',email:'two@example.test'}]);
 const path='/api/data?previewStudent=student%40example.test';
 const response=await worker.fetch(req(OWNER,path),env);assert.equal(response.status,200);const view=await response.json();
 assert.equal(view.user.email,'student@example.test');assert.equal(view.user.name,'학생 하나');assert.equal(view.user.role,'student');assert.deepEqual(view.data.funds,[]);assert.deepEqual(view.data.payroll,[]);assert.deepEqual(view.students,[]);assert.deepEqual(view.studentNames,{});
 assert.equal((await worker.fetch(req('student@example.test','/api/data?previewStudent=two%40example.test'),env)).status,403);
 assert.equal((await worker.fetch(req(OWNER,'/api/data?previewStudent=missing%40example.test'),env)).status,403);
 assert.equal((await worker.fetch(req(OWNER,path,'PUT',{version:view.version,data:view.data}),env)).status,403);
 assert.equal((await worker.fetch(req(OWNER,'/api/ai/topic?previewStudent=student%40example.test','POST',{}),env)).status,403);
 const owner=await(await worker.fetch(req(OWNER),env)).json();assert.equal(owner.user.role,'admin');assert.ok(owner.data.funds.length);
});

test('personal research counts match whole Korean and mapped English names, count each record once and respect year',async()=>{
 const {readFile}=await import('node:fs/promises'),vm=await import('node:vm');const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const data={papers:[{year:2026,firstAuthor:'손은지',coauthors:'손은지'},{year:2026,authorList:[{name:'Eun-Ji Son',korean:'손은지'}]},{year:2026,firstAuthor:'손은지영'},{year:2025,firstAuthor:'손은지'},{year:2026,firstAuthor:'Other',authorList:[{name:'Eun Ji Son'}],paperEditedFields:['firstAuthor']}],conferences:[{year:2026,presenter:'박진혁 · 손은지'},{year:2026,presenter:'Other',coauthors:'Eun Ji Son; Other'},{year:2026,presenter:'손은지영'},{year:2025,presenter:'손은지'}]};
 const ctx=vm.createContext({data,authorAliases:()=>[{korean:'손은지',english:'Eun Ji Son'}],paperFirst:r=>r.firstAuthor||'',paperCorresponding:r=>r.correspondingAuthor||'',paperCoauthors:r=>r.coauthors||''});
 vm.runInContext(source.slice(source.indexOf('function personalResearchCounts('),source.indexOf('function yearAndGameNight(')),ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.personalResearchCounts(2026,'손은지'))),{papers:2,conferences:2});
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.personalResearchCounts(2026,''))),{papers:0,conferences:0});
});

test('professor achievement settings persist and never appear in student data',async()=>{
 const {worker,env}=fixture();const owner=await(await worker.fetch(req(OWNER),env)).json();
 const achievement={year:2026,authors:6,sci:'SCI',role:'lead',percentile:20,category:'Polymer Science',jcrYear:2025,include:true,note:'Verified'};
 owner.data.papers[0].achievement=achievement;
 assert.equal((await worker.fetch(req(OWNER,'/api/data','PUT',{version:owner.version,data:owner.data}),env)).status,200);
 const saved=await(await worker.fetch(req(OWNER),env)).json();assert.deepEqual(saved.data.papers[0].achievement,achievement);
 const student=await(await worker.fetch(req('student@example.test'),env)).json();assert.equal(student.data.papers[0].achievement,undefined);
 assert.equal((await worker.fetch(req('student@example.test','/api/data','PUT',{version:saved.version,data:owner.data}),env)).status,403);
});
test('board layouts are persisted under authenticated accounts and reject invalid rectangles',async()=>{
 const {worker,env}=fixture(),board=[{id:'papers-list',x:0,y:0,w:6,h:4}];
 assert.equal((await worker.fetch(req(OWNER,'/api/preferences','PUT',{hubBoard:board,email:'student@example.test'}),env)).status,200);
 assert.deepEqual((await (await worker.fetch(req(OWNER),env)).json()).preferences.hubBoard,board);
 assert.equal((await (await worker.fetch(req('student@example.test'),env)).json()).preferences.hubBoard,undefined);
 const student=[{id:'reagents-list',x:6,y:0,w:6,h:5}];
 assert.equal((await worker.fetch(req('student@example.test','/api/preferences','PUT',{hubBoard:student}),env)).status,200);
 assert.deepEqual((await (await worker.fetch(req(OWNER),env)).json()).preferences.hubBoard,board);
 for(const invalid of [[{...board[0],x:10}], [board[0],{...board[0],id:'other'}], [{...board[0],h:-1}],null])assert.equal((await worker.fetch(req(OWNER,'/api/preferences','PUT',{hubBoard:invalid}),env)).status,400);
 assert.equal((await worker.fetch(req(null,'/api/preferences','PUT',{hubBoard:board}),env)).status,401);
});
