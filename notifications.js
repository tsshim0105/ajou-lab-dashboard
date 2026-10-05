/* Desktop notifications: local permission + changes from the shared research feed.
 * Keep permission and presentation here; Web Push can later supply a transport
 * backed by ServiceWorkerRegistration.showNotification with the same payload.
 * Permission belongs to this browser + origin, never to an account preference.
 */
globalThis.NISMLNotifications = (() => {
  const blocked = '브라우저에서 NISML 대시보드의 알림 권한이 차단되어 있습니다. 브라우저 설정에서 알림을 허용해주세요.';
  const testBody = '연구실 알림 설정이 완료되었습니다.';
  const icon = '__NISML_ICON__';

  function createController(env = globalThis, onState = () => {}) {
    let pending = false, message = '', permissionHandle,remote;
    const supported = () => env.isSecureContext === true && typeof env.Notification === 'function' && typeof env.Notification.requestPermission === 'function';
    const state = () => {
      const permission = supported() ? env.Notification.permission : 'unsupported';
      return {permission, pending, remote:!!remote?.active,
        label: permission === 'granted' ? '🔔 알림 켜짐' : permission === 'denied' ? '🔕 알림 차단됨' : permission === 'default' ? '🔔 알림 허용' : '🔕 알림 미지원',
        message: permission === 'denied' ? blocked : permission === 'unsupported' ? (env.isSecureContext ? '이 브라우저에서는 데스크톱 알림을 지원하지 않습니다. Mac/PC의 Safari, Chrome 또는 Edge에서 열어주세요.' : '브라우저 알림은 HTTPS로 접속해야 사용할 수 있습니다.') : message};
    };
    const refresh = () => onState(state());

    // Same-origin target is shared with the future notificationclick handler.
    function show({title = 'NISML 대시보드', body, target = '/', tag = 'nisml-local-test', onClick, test = true} = {}) {
      if (!supported() || env.Notification.permission !== 'granted') return false;
      let destination;
      try {
        destination = new URL(target, env.location.href);
        if (destination.origin !== env.location.origin) throw Error('외부 알림 링크');
        const notification = new env.Notification(title, {body, icon, lang:'ko', tag});
        notification.onclick = () => {env.focus(); notification.close(); if(onClick)onClick();else env.location.assign(destination.href);};
        notification.onerror = () => {message = '알림을 표시하지 못했습니다. 브라우저 및 운영체제의 알림 설정을 확인한 뒤 다시 눌러주세요.'; refresh();};
        if(test)message = '테스트 알림을 요청했습니다. 대시보드가 열려 있는 동안 연구 정보 변경도 자동으로 알립니다. 표시되지 않으면 운영체제의 브라우저 알림 설정과 집중 모드를 확인해주세요.';
        return true;
      } catch {
        message = '알림을 표시하지 못했습니다. Mac/PC의 브라우저 알림 설정을 확인한 뒤 다시 눌러주세요.';
        return false;
      } finally {refresh();}
    }
    async function enable() {
      if (pending) return;
      message = '';
      if (!supported() || env.Notification.permission === 'denied') {refresh(); return;}
      if(remote?.supported()){
        pending=true;refresh();try{await remote.enable();message='원격 알림을 연결했습니다. 알림 센터에서 연결 상태를 확인할 수 있습니다.';}catch(e){message=e.message||'원격 알림 연결을 확인해주세요.';}finally{pending=false;refresh();}return;
      }
      if (env.Notification.permission === 'granted') {show({body:testBody, target:env.location.href}); return;}
      pending = true;
      refresh();
      try {
        // Call synchronously from the button gesture, before any await/network.
        const permission = await env.Notification.requestPermission();
        if (permission === 'granted') show({body:testBody, target:env.location.href});
        else if (permission === 'default') message = '알림 허용이 완료되지 않았습니다. 원할 때 다시 눌러주세요.';
      } catch {message = '알림 권한을 요청하지 못했습니다. 브라우저 설정을 확인한 뒤 다시 눌러주세요.';}
      finally {pending = false; refresh();}
    }
    function start() {
      refresh();
      env.addEventListener('focus', refresh);
      env.document.addEventListener('visibilitychange', refresh);
      // Safari may not implement Permissions API for notifications.
      try {env.navigator.permissions?.query({name:'notifications'}).then(handle => {permissionHandle=handle; handle.onchange=refresh;}).catch(()=>{});} catch {}
    }
    function stop() {
      env.removeEventListener('focus', refresh);
      env.document.removeEventListener('visibilitychange', refresh);
      if (permissionHandle) permissionHandle.onchange=null;
    }
    return {state, enable, show, refresh, start, stop,setRemote:client=>{remote=client;refresh();}};
  }

  // First response is a baseline, not an inbox replay. Track IDs even while
  // permission is denied so granting later cannot cause an old-event flood.
  function createFeedDelivery(controller, account, onOpen, env = globalThis) {
    let seen = null;
    const key = 'nisml-os-delivered:' + encodeURIComponent(account);
    const valid = rows => rows.filter(row => row && typeof row.id === 'string' && ['papers','conferences','meetingInfo'].includes(row.type));
    function readDelivered() {
      try {const value=JSON.parse(env.localStorage.getItem(key)||'[]');return new Set(Array.isArray(value)?value.filter(id=>typeof id==='string'):[]);}catch{return new Set();}
    }
    async function observe(rows) {
      rows=valid(rows);
      if(seen===null){seen=new Set(rows.map(row=>row.id));return;}
      const fresh=rows.filter(row=>!seen.has(row.id));
      seen=new Set([...seen,...rows.map(row=>row.id)].slice(-400));
      if(!fresh.length||controller.state().permission!=='granted'||controller.state().remote)return;
      const deliver=()=>{
        const delivered=readDelivered(),unsent=[...new Map(fresh.filter(row=>!delivered.has(row.id)).map(row=>[row.id,row])).values()].reverse();
        if(!unsent.length)return;
        const sent=[];
        if(unsent.length>5){
          if(controller.show({body:unsent.length+'건의 논문·학회 정보가 변경되었습니다. 알림 센터에서 확인해주세요.',tag:'nisml-research-batch',onClick:()=>onOpen(null),test:false}))sent.push(...unsent.map(row=>row.id));
        }else for(const row of unsent){
          if(controller.show({body:[row.label,row.title,row.detail].filter(Boolean).join('\n'),tag:'nisml-research-'+row.id,onClick:()=>onOpen(row),test:false}))sent.push(row.id);
        }
        try {env.localStorage.setItem(key,JSON.stringify([...delivered,...sent].slice(-400)));}catch{}
      };
      // Serializes check + record across open tabs on browsers with Web Locks.
      if(env.navigator?.locks)await env.navigator.locks.request(key,deliver);else deliver();
    }
    return {observe};
  }

  function mount(button, status) {
    const controller = createController(globalThis, value => {
      button.textContent = value.pending ? '알림 권한 확인 중…' : value.label;
      button.disabled = value.pending || value.permission === 'unsupported';
      button.dataset.permission = value.permission;
      button.title = value.permission === 'granted' ? '테스트 알림 다시 표시' : value.permission === 'denied' ? blocked : '이 브라우저에서 연구실 알림 허용';
      status.textContent = value.message;
      status.classList.toggle('hidden', !value.message);
    });
    button.classList.remove('hidden');
    button.onclick = () => controller.enable();
    controller.start();
    return controller;
  }
  return {createController, createFeedDelivery, mount};
})();
