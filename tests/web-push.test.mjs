import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {encryptPush,to64,from64,vapidAuthorization,validateSubscription,dispatchPendingPush,sendPush,pushTables,researchPushPayload} from '../server/web-push.mjs';
import {createWorker,fresh} from '../server/worker.mjs';
const OWNER='owner@example.test',STUDENT='student@example.test',origin='https://lab.example.test';
async function keys(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {WEB_PUSH_PUBLIC_KEY:to64(await crypto.subtle.exportKey('raw',pair.publicKey)),WEB_PUSH_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey)),WEB_PUSH_SUBJECT:'mailto:'+OWNER,pair};}
async function subscription(endpoint='https://fcm.googleapis.com/fcm/send/test-token'){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {endpoint,keys:{p256dh:to64(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:to64(crypto.getRandomValues(new Uint8Array(16)))}};}
function d1(){const sql=new DatabaseSync(':memory:');return {sql,prepare(query){return {a:[],bind(...a){this.a=a;return this;},async run(){const r=sql.prepare(query).run(...this.a);return {meta:{changes:Number(r.changes)}};},async first(){return sql.prepare(query).get(...this.a)||null;},async all(){return {results:sql.prepare(query).all(...this.a)};}};},async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;}};}
async function fixture(){const DB=d1(),state=fresh();state.students=[STUDENT];DB.sql.exec('CREATE TABLE lab_state (id INTEGER PRIMARY KEY, version INTEGER, payload TEXT)');DB.sql.prepare('INSERT INTO lab_state VALUES (1,0,?)').run(JSON.stringify(state));return {env:{DB,ADMIN_EMAIL:OWNER,...await keys()},worker:createWorker('HTML',null,'// service worker'),state};}
function req(email,path,method='GET',input){return new Request(origin+path,{method,headers:{...(email?{'oai-authenticated-user-id':'id-'+email,'oai-authenticated-user-email':email}:{}),...(method!=='GET'?{Origin:origin,'Content-Type':'application/json','X-Lab-Request':'1'}:{})},...(input?{body:JSON.stringify(input)}:{})});}

test('RFC 8291 published encryption vector matches byte for byte',async()=>{
 const sender=from64('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
 const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:to64(sender.slice(1,33)),y:to64(sender.slice(33)),d:'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',ext:true},{name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const publicKey=await crypto.subtle.importKey('raw',sender,{name:'ECDH',namedCurve:'P-256'},true,[]);
 const golden='DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
 const actual=await encryptPush({keys:{auth:'BTBZMqHH6r4Tts7J_aSIgg',p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'}},'When I grow up, I want to be a watermelon',{pair:{privateKey,publicKey},salt:from64(golden).slice(0,16)});
 assert.equal(to64(actual),golden);
});
test('VAPID is an ES256 signature with destination origin and bounded expiry',async()=>{
 const env=await keys(),now=Date.now(),auth=await vapidAuthorization('https://fcm.googleapis.com/fcm/send/token',env,now),token=auth.match(/t=([^,]+)/)[1],parts=token.split('.');
 const claims=JSON.parse(new TextDecoder().decode(from64(parts[1])));assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,'mailto:'+OWNER);assert.ok(claims.exp<=now/1000+86400);
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},env.pair.publicKey,from64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])),true);
});
test('subscription rejects arbitrary destinations and malformed encryption keys',async()=>{
 const s=await subscription();assert.equal(validateSubscription(s).endpoint,s.endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/test','https://127.0.0.1/test','https://fcm.googleapis.com.evil.test/test','https://user:secret@fcm.googleapis.com/test','https://fcm.googleapis.com:444/test'])assert.throws(()=>validateSubscription({...s,endpoint}));
 assert.throws(()=>validateSubscription({...s,keys:{...s.keys,auth:'invalid'}}));
});
test('send uses encrypted body, VAPID, no redirects and TTL',async()=>{
 const s=await subscription(),env=await keys();let request;const status=await sendPush(s,{title:'NISML 대시보드',body:'Confidential test'},env,async(url,options)=>{request={url,...options};return new Response(null,{status:201});});assert.equal(status,201);assert.equal(request.redirect,'manual');assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert.equal(request.headers.TTL,'86400');assert.match(request.headers.Authorization,/^vapid t=/);assert.ok(!new TextDecoder().decode(request.body).includes('Confidential'));
});
test('authorized subscriptions are private and student cannot administer other accounts',async()=>{
 const {worker,env}=await fixture(),s=await subscription();assert.equal((await worker.fetch(req(null,'/api/push/config'),env)).status,401);assert.equal((await worker.fetch(req('other@example.test','/api/push/config'),env)).status,403);
 assert.equal((await worker.fetch(req(STUDENT,'/api/push/subscription','PUT',{subscription:s}),env)).status,200);
 const data=await (await worker.fetch(req(STUDENT,'/api/data'),env)).text();assert.ok(!data.includes('test-token'));assert.ok(!data.includes(s.keys.auth));assert.ok(!data.includes('WEB_PUSH_PRIVATE'));
 assert.equal((await worker.fetch(req(STUDENT,'/api/push/admin'),env)).status,403);
 const admin=await (await worker.fetch(req(OWNER,'/api/push/admin'),env)).json();assert.equal(admin.accounts[0].devices,1);assert.ok(!JSON.stringify(admin).includes('test-token'));
 assert.equal((await worker.fetch(req(OWNER,'/api/push/test','POST',{endpoint:s.endpoint}),env)).status,404);
 assert.equal((await worker.fetch(req(STUDENT,'/api/push/subscription','DELETE',{endpoint:s.endpoint}),env)).status,200);assert.equal((await (await worker.fetch(req(STUDENT,'/api/push/status'),env)).json()).devices,0);
});
test('service worker has correct MIME/scope and subscription mutation requires origin',async()=>{
 const {worker,env}=await fixture();const sw=await worker.fetch(req(STUDENT,'/service-worker.js'),env);assert.equal(sw.status,200);assert.match(sw.headers.get('Content-Type'),/javascript/);assert.equal(sw.headers.get('Service-Worker-Allowed'),'/');
 const r=req(STUDENT,'/api/push/subscription','PUT',{subscription:await subscription()});r.headers.set('Origin','https://evil.example.test');assert.equal((await worker.fetch(r,env)).status,403);
});
test('delivery persists, ignores old events, groups new events and removes expired/revoked devices',async()=>{
 const {env,state}=await fixture();await pushTables(env.DB);const s=await subscription();await env.DB.prepare('INSERT INTO push_subscriptions (endpoint,account_id,email,subscription,created_at) VALUES (?,?,?,?,?)').bind(s.endpoint,'id',STUDENT,JSON.stringify(s),new Date(Date.now()-1000).toISOString()).run();
 state.notifications=[{id:'new',type:'conferences',label:'학회 발표 등록',title:'Poster',at:new Date().toISOString()},{id:'old',type:'papers',at:'2020-01-01T00:00:00.000Z'}];
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:201});};
 try{await dispatchPendingPush(env,state,origin);await dispatchPendingPush(env,state,origin);assert.equal(calls,1);assert.equal((await env.DB.prepare("SELECT status FROM push_delivery WHERE event_id='new'").first()).status,'done');
 state.notifications.unshift({id:'new2',type:'papers',title:'Paper',at:new Date().toISOString()});globalThis.fetch=async()=>new Response(null,{status:410});await dispatchPendingPush(env,state,origin);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').first()).count,0);
 await env.DB.prepare('INSERT INTO push_subscriptions (endpoint,account_id,email,subscription,created_at) VALUES (?,?,?,?,?)').bind(s.endpoint,'id','revoked@example.test',JSON.stringify(s),new Date(Date.now()-1000).toISOString()).run();await dispatchPendingPush(env,state,origin);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').first()).count,0);
 }finally{globalThis.fetch=original;}
});
test('payload has exact title and same-origin destinations, burst summary links inbox',()=>{
 const events=[{id:'a',type:'papers',action:'수정',label:'논문 수정',title:'A & B'}];const payload=researchPushPayload(events,origin);assert.equal(payload.title,'NISML 대시보드');assert.equal(new URL(payload.url).origin,origin);assert.equal(new URL(payload.url).searchParams.get('q'),'A & B');assert.ok(!payload.body.includes(origin));assert.match(researchPushPayload([...events,{id:'b'}],origin).url,/inbox=1/);
});
