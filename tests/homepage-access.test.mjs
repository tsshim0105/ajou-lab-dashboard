import test from 'node:test';import assert from 'node:assert/strict';import {homepageManagers,updateHomepageManagers} from '../server/homepage-access.mjs';
import {createWorker,fresh} from '../server/worker.mjs';import {DatabaseSync} from 'node:sqlite';
test('homepage administrators require active membership and owner remains protected',()=>{const owner='owner@example.test',state={students:['soneunji2002@ajou.ac.kr','student@example.test']};assert.deepEqual(homepageManagers(state,owner),[owner,'soneunji2002@ajou.ac.kr']);state.homepageAdmins=updateHomepageManagers(state,['student@example.test'],owner);assert.deepEqual(homepageManagers(state,owner),[owner,'student@example.test']);state.students=[];assert.deepEqual(homepageManagers(state,owner),[owner]);assert.throws(()=>updateHomepageManagers(state,['outsider@example.test'],owner));});
test('only professor can grant/revoke homepage rights and financial permission stays separate',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE lab_state(id INTEGER PRIMARY KEY,version INTEGER,payload TEXT)');const state=fresh();state.students=['student@example.test'];state.data.funds=[{title:'private',months:[]}];sql.prepare('INSERT INTO lab_state VALUES(1,0,?)').run(JSON.stringify(state));
 const DB={prepare(text){const statement=sql.prepare(text);let args=[];return {bind(...a){args=a;return this;},async first(){return statement.get(...args)||null;},async run(){return {meta:statement.run(...args)};}};}};
 const env={DB,ADMIN_EMAIL:'owner@example.test',HOMEPAGE_ADMIN_EMBED:true},worker=createWorker('html');
 const request=(email,path='/api/data',body)=>new Request('https://example.test'+path,{method:body?'PUT':'GET',headers:{'oai-authenticated-user-id':email,'oai-authenticated-user-email':email,Origin:'https://example.test','Content-Type':'application/json','X-Lab-Request':'1'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await worker.fetch(request('student@example.test','/api/homepage-admins',{version:0,emails:['student@example.test']}),env)).status,403);
 assert.equal((await worker.fetch(request('owner@example.test','/api/homepage-admins',{version:0,emails:['student@example.test']}),env)).status,200);
 let student=await (await worker.fetch(request('student@example.test'),env)).json();assert.equal(student.user.canManageHomepage,true);assert.equal(student.data.funds.length,0);
 assert.equal((await worker.fetch(request('owner@example.test','/api/homepage-admins',{version:1,emails:[]}),env)).status,200);
 student=await (await worker.fetch(request('student@example.test'),env)).json();assert.equal(student.user.canManageHomepage,false);
});
