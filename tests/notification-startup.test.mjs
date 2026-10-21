import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fn=code.slice(code.indexOf('function openPushTarget('),code.indexOf('// Shared schedule transcribed'));
for(const type of ['reload','navigate'])test('inbox startup '+type,()=>{
 let opened=0,replaced='';const ctx=vm.createContext({URL,location:{origin:'https://example.test',href:'https://example.test/dashboard?inbox=1&keep=yes'},history:{state:null,replaceState(a,b,url){replaced=url}},performance:{getEntriesByType:()=>[{type}]},openResearchNotification:()=>opened++});vm.runInContext(fn,ctx);vm.runInContext('openPushTarget(location.href,{initial:true})',ctx);assert.equal(opened,type==='reload'?0:1);assert.equal(new URL(replaced).searchParams.has('inbox'),false);assert.equal(new URL(replaced).searchParams.get('keep'),'yes');
});
test('ordinary dashboard refresh never opens inbox',()=>{let opened=0;const ctx=vm.createContext({URL,location:{origin:'https://example.test'},openResearchNotification:()=>opened++});vm.runInContext(fn,ctx);vm.runInContext("openPushTarget('https://example.test/dashboard',{initial:true})",ctx);assert.equal(opened,0);});
