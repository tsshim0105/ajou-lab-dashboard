import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {researchPushPayload} from '../server/web-push.mjs';
test('slashless dashboard startup uses its own registration without waiting for a controlling worker',async()=>{
 const source=await readFile(new URL('../web-push-client.js',import.meta.url),'utf8');let status,registered=false;const registration={active:{},pushManager:{async getSubscription(){return null;}}};
 const serviceWorker={async register(){registered=true;return registration;},get ready(){throw Error('Must not wait for document control');}};
 const context=vm.createContext({isSecureContext:true,navigator:{serviceWorker},PushManager:{},Notification:{permission:'default'},fetch:async()=>({ok:true,json:async()=>({ready:true,publicKey:'test'})}),setTimeout,clearTimeout});vm.runInContext(source,context);context.NISMLWebPush.create(s=>status=s);await new Promise(r=>setImmediate(r));assert.equal(registered,true);assert.equal(status.error,false);assert.match(status.message,/알림 허용/);
});
test('remote notification opens the integrated dashboard',()=>{const p=researchPushPayload([{id:'1',type:'papers',action:'등록',title:'Paper',label:'논문 등록'}],'https://example.test','/dashboard');assert.equal(new URL(p.url).pathname,'/dashboard/');});
