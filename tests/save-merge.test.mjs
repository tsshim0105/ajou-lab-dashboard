import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function mergeSavedData('),app.indexOf('async function saveStudents('));
function context(extra={}){return vm.createContext({structuredClone,studentPreview:false,user:{role:'student'},version:1,data:{papers:[{id:'a',title:'Old',journal:'J'}]},renderNotifications(){},...extra});}
function merge(base,local,remote){const c=context({base,local,remote});vm.runInContext(source,c);return JSON.parse(JSON.stringify(vm.runInContext('mergeSavedData(base,local,remote)',c)));}
test('merges different records and different fields without losing remote additions',()=>{
 const base={papers:[{id:'a',title:'Old',journal:'J'},{id:'b',title:'B'}]};
 const local=structuredClone(base);local.papers[0].title='New';
 const remote=structuredClone(base);remote.papers[0].journal='New journal';remote.papers[1].title='Remote';remote.papers.push({id:'c',title:'Added'});
 const result=merge(base,local,remote);assert.equal(result.papers[0].title,'New');assert.equal(result.papers[0].journal,'New journal');assert.equal(result.papers[1].title,'Remote');assert.equal(result.papers[2].id,'c');
});
test('preserves deletions and rejects concurrent edits to deleted records',()=>{
 const base={papers:[{id:'a',title:'Old'},{id:'b',title:'B'}]};
 assert.deepEqual(merge(base,{papers:[base.papers[0]]},{papers:[{id:'a',title:'Remote'},base.papers[1]]}),{papers:[{id:'a',title:'Remote'}]});
 assert.throws(()=>merge(base,{papers:[base.papers[0]]},{papers:[base.papers[0],{id:'b',title:'Changed'}]}),/같은 항목/);
});
test('does not silently overwrite overlapping changes; merges paper edit metadata',()=>{
 assert.throws(()=>merge({x:'old'},{x:'mine'},{x:'theirs'}),/같은 항목/);
 assert.deepEqual(merge({paperEditedFields:[]},{paperEditedFields:['title']},{paperEditedFields:['journal']}),{paperEditedFields:['journal','title']});
});
test('student save rebases on 409, keeps target object reference and uses shared endpoint',async()=>{
 const calls=[],next={papers:[{id:'a',title:'New',journal:'J'}]};let n=0;
 const c=context({next,fetch:async(path,options)=>{calls.push({path,body:options?.body&&JSON.parse(options.body)});n++;return n===1?{ok:false,status:409,json:async()=>({error:'stale'})}:n===2?{ok:true,json:async()=>({version:7,data:{papers:[{id:'a',title:'Old',journal:'Fresh'}]}})}:{ok:true,json:async()=>({version:8})};}});
 vm.runInContext(source,c);await vm.runInContext("performPut('/api/data',{data:next})",c);
 assert.equal(calls[0].path,'/api/shared');assert.equal(calls[1].path,'/api/data');assert.equal(calls[2].body.version,7);assert.equal(next.papers[0].journal,'Fresh');assert.equal(next.papers[0].title,'New');assert.equal(c.version,8);
});
test('failed retry leaves local data/version intact and stops after bounded attempts',async()=>{
 const next={papers:[{id:'a',title:'New',journal:'J'}]};let writes=0;
 const c=context({next,fetch:async(path,options)=>options?.method==='PUT'?(writes++,{ok:false,status:409,json:async()=>({error:'stale'})}):{ok:true,json:async()=>({version:9,data:{papers:[{id:'a',title:'Old',journal:'Fresh'}]}})}});
 vm.runInContext(source,c);await assert.rejects(vm.runInContext("performPut('/api/data',{data:next})",c),/입력 내용/);assert.equal(writes,4);assert.equal(c.version,1);assert.equal(next.papers[0].journal,'J');
});
test('authorization failures are not retried',async()=>{
 let calls=0;const c=context({fetch:async()=>{calls++;return {ok:false,status:403,json:async()=>({error:'권한 없음'})}}});vm.runInContext(source,c);
 await assert.rejects(vm.runInContext("performPut('/api/data',{data:structuredClone(data)})",c),/권한 없음/);assert.equal(calls,1);
});
