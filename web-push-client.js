globalThis.NISMLWebPush=(()=>{
 const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 async function request(path,method,body){
  const res=await fetch(path,{method,cache:'no-store',...(body?{headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify(body)}:{})});
  const value=await res.json();if(!res.ok)throw Error(value.error||'원격 알림 연결을 확인해주세요.');return value;
 }
 function create(onChange){
  let registration,config,active=false,preparing;
  const supported=()=>isSecureContext&&'serviceWorker' in navigator&&'PushManager' in globalThis&&'Notification' in globalThis;
  const notify=(message,error=false)=>onChange({active,message,error});
  async function save(subscription){await request('/api/push/subscription','PUT',{subscription:subscription.toJSON()});active=true;notify('원격 알림 켜짐 · 대시보드를 닫아도 새 연구실 알림을 받을 수 있습니다.');}
  async function prepare(){
   if(!supported()){notify('이 브라우저에서는 원격 알림을 지원하지 않습니다.',true);return;}
   config=await request('/api/push/config','GET');if(!config.ready)throw Error('원격 알림 서버 설정이 필요합니다.');
   registration=await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});
   registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service Worker activation timeout')),15000))]);
   const subscription=await registration.pushManager.getSubscription();
   if(subscription&&Notification.permission==='granted')await save(subscription);else notify('상단 알림 허용 버튼을 눌러 페이지를 닫아도 받는 원격 알림을 켜세요.');
  }
  async function enable(){
   if(!supported())throw Error('이 브라우저에서는 Web Push를 지원하지 않습니다. Mac의 Safari/Chrome 또는 PC의 Chrome/Edge에서 열어주세요.');
   if(Notification.permission==='denied')throw Error('브라우저 설정에서 대시보드의 알림을 허용해주세요.');
   // Preparation starts at page load, so subscribe runs directly from the click.
   if(!registration||!config?.ready){await prepare();if(!registration)throw Error('원격 알림 준비 중입니다. 잠시 후 다시 눌러주세요.');}
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(config.publicKey)});
   await save(subscription);
   const result=await request('/api/push/test','POST',{endpoint:subscription.endpoint});
   if(result.accepted)notify('원격 테스트 알림을 발송했습니다. 대시보드를 닫아도 알림을 수신할 수 있습니다.');
  }
  async function disable(){
   const subscription=await registration?.pushManager.getSubscription();if(subscription){await request('/api/push/subscription','DELETE',{endpoint:subscription.endpoint});await subscription.unsubscribe();}
   active=false;notify('이 브라우저의 원격 알림을 껐습니다. 다시 켜려면 상단 알림 버튼을 누르세요.');
  }
  preparing=prepare().catch(()=>notify('원격 알림 연결을 준비하지 못했습니다. 상단 알림 버튼으로 다시 시도해주세요.',true));
  return {supported,enable,disable,get active(){return active;},retry:()=>{preparing=prepare();return preparing;}};
 }
 return {create};
})();
