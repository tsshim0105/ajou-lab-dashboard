// Receives encrypted Web Push even with no dashboard tab. Never caches lab data.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  let target=new URL('/',self.location.origin);try{const candidate=new URL(payload.url,self.location.origin);if(candidate.origin===self.location.origin)target=candidate;}catch{}
  await self.registration.showNotification(String(payload.title||'NISML 대시보드').slice(0,100),{body:String(payload.body||'새로운 연구실 알림이 도착했습니다.').slice(0,1000),tag:String(payload.tag||'nisml-update').slice(0,200),lang:'ko',data:{url:target.href},icon:'/notification-icon.png'});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let target=new URL('/',self.location.origin);try{const candidate=new URL(event.notification.data?.url,self.location.origin);if(candidate.origin===self.location.origin)target=candidate;}catch{}
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.focus();existing.postMessage({type:'NISML_PUSH_OPEN',url:target.href});}
  else await self.clients.openWindow(target.href);
 })());
});
