// RFC 8291 aes128gcm and RFC 8292 VAPID, using Workers Web Crypto only.
const enc=new TextEncoder();
export const from64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const to64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
async function hmac(key,value){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,value));}
export async function encryptPush(subscription,payload,options={}){
 const receiver=from64(subscription.keys.p256dh),auth=from64(subscription.keys.auth);
 const pair=options.pair||await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const sender=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const publicKey=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},pair.privateKey,256));
 const prkKey=await hmac(auth,secret),ikm=await hmac(prkKey,join(enc.encode('WebPush: info\0'),receiver,sender,new Uint8Array([1])));
 const salt=options.salt||crypto.getRandomValues(new Uint8Array(16)),prk=await hmac(salt,ikm);
 const cek=(await hmac(prk,enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0,16),nonce=(await hmac(prk,enc.encode('Content-Encoding: nonce\0\x01'))).slice(0,12);
 const plain=typeof payload==='string'?enc.encode(payload):enc.encode(JSON.stringify(payload));if(plain.length>3900)throw Error('Push payload too large');
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,join(plain,new Uint8Array([2]))));
 const header=new Uint8Array(5);new DataView(header.buffer).setUint32(0,4096);header[4]=65;
 return join(salt,header,sender,cipher);
}
export async function vapidAuthorization(endpoint,env,now=Date.now()){
 const header=to64(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=to64(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+43200,sub:env.WEB_PUSH_SUBJECT})));
 const input=header+'.'+claims,key=await crypto.subtle.importKey('jwk',JSON.parse(env.WEB_PUSH_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(input));
 return 'vapid t='+input+'.'+to64(signature)+', k='+env.WEB_PUSH_PUBLIC_KEY;
}
export function pushConfigured(env){return !!(env.WEB_PUSH_PUBLIC_KEY&&env.WEB_PUSH_PRIVATE_JWK&&env.WEB_PUSH_SUBJECT);}
export function validateSubscription(input){
 if(!input||typeof input.endpoint!=='string'||input.endpoint.length>2000)throw Error('알림 구독 주소를 확인해주세요.');
 const u=new URL(input.endpoint),host=u.hostname;
 const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
 if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password||u.hash||!allowed)throw Error('지원하지 않는 브라우저 Push 주소입니다.');
 const keys=input.keys;if(!keys||!['p256dh','auth'].every(k=>typeof keys[k]==='string'&&/^[A-Za-z0-9_-]+$/.test(keys[k])))throw Error('알림 암호화 키를 확인해주세요.');
 if(from64(keys.p256dh).length!==65||from64(keys.p256dh)[0]!==4||from64(keys.auth).length!==16)throw Error('알림 암호화 키를 확인해주세요.');
 return {endpoint:input.endpoint,expirationTime:input.expirationTime||null,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
export async function sendPush(subscription,payload,env,transport=fetch){
 validateSubscription(subscription);
 const body=await encryptPush(subscription,payload),authorization=await vapidAuthorization(subscription.endpoint,env);
 const response=await transport(subscription.endpoint,{method:'POST',redirect:'manual',headers:{Authorization:authorization,'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',TTL:'86400',Urgency:'normal'},body,signal:AbortSignal.timeout(8000)});
 await response.arrayBuffer();return response.status;
}
export async function pushTables(DB){
 await DB.prepare('CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, account_id TEXT NOT NULL, email TEXT NOT NULL, subscription TEXT NOT NULL, created_at TEXT NOT NULL, last_status INTEGER, last_test INTEGER DEFAULT 0)').run();
 await DB.prepare('CREATE TABLE IF NOT EXISTS push_delivery (event_id TEXT NOT NULL, endpoint TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, token TEXT, PRIMARY KEY(event_id,endpoint))').run();
}
export function researchPushPayload(events,origin){
 const single=events.length===1,record=events[0],q=single&&record.action!=='삭제'?record.title:'';
 const target=single?'/?view='+encodeURIComponent(record.type)+'&q='+encodeURIComponent(q):'/?inbox=1';
 return {title:'NISML 대시보드',body:single?[record.label,record.title,record.detail].filter(Boolean).join('\n').slice(0,700):events.length+'건의 논문·학회 정보가 변경되었습니다. 알림 센터에서 확인해주세요.',url:new URL(target,origin).href,tag:'nisml-'+record.id,ids:events.map(n=>n.id)};
}
export async function dispatchPendingPush(env,state,origin){
 if(!pushConfigured(env))return;
 await pushTables(env.DB);
 const allowed=new Set([env.ADMIN_EMAIL.trim().toLowerCase(),...state.students]);
 const subs=(await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results||[];
 // At most 30 new events per device per invocation, summarized into one push.
 const deliverDevice=async sub=>{
  if(!allowed.has(sub.email)) {await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(sub.endpoint).run();return;}
  const events=(state.notifications||[]).filter(n=>['papers','conferences','meetingInfo'].includes(n.type)&&n.at>sub.created_at&&Date.now()-Date.parse(n.at)<86400000).slice(0,30);
  if(!events.length)return;
  const token=crypto.randomUUID(),now=Date.now();
  const statements=events.flatMap(n=>[
   env.DB.prepare('INSERT OR IGNORE INTO push_delivery (event_id,endpoint) VALUES (?,?)').bind(n.id,sub.endpoint),
   env.DB.prepare("UPDATE push_delivery SET status='sending',attempts=attempts+1,locked_until=?,token=? WHERE event_id=? AND endpoint=? AND status IN ('pending','sending') AND attempts<3 AND retry_at<=? AND locked_until<=?").bind(now+60000,token,n.id,sub.endpoint,now,now)
  ]);
  await env.DB.batch(statements);
  const claimed=new Set(((await env.DB.prepare('SELECT event_id FROM push_delivery WHERE endpoint=? AND token=?').bind(sub.endpoint,token).all()).results||[]).map(r=>r.event_id));
  const fresh=events.filter(n=>claimed.has(n.id));if(!fresh.length)return;
  let status=0;try{status=await sendPush(JSON.parse(sub.subscription),researchPushPayload(fresh,origin),env);}catch{}
  await env.DB.prepare('UPDATE push_subscriptions SET last_status=? WHERE endpoint=?').bind(status,sub.endpoint).run();
  if(status===404||status===410){await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(sub.endpoint).run();}
  const done=status>=200&&status<300,transient=status===0||status===429||status>=500;
  await env.DB.prepare('UPDATE push_delivery SET status=?,retry_at=?,locked_until=0,token=NULL WHERE endpoint=? AND token=?').bind(done?'done':transient?'pending':'failed',now+60000,sub.endpoint,token).run();
 };
 // Three concurrent devices; leave unclaimed jobs for the next invocation if
 // the provider is slow, staying within the Worker background time budget.
 let index=0;const deadline=Date.now()+20000;
 await Promise.all(Array.from({length:3},async()=>{while(index<subs.length&&Date.now()<deadline){const sub=subs[index++];await deliverDevice(sub);}}));
 // No subscription secrets are included in HTML or API responses.
 if((state.notifications||[]).length)await env.DB.prepare('DELETE FROM push_delivery WHERE event_id NOT IN ('+(state.notifications||[]).map(()=>'?').join(',')+')').bind(...(state.notifications||[]).map(n=>n.id)).run();
}
