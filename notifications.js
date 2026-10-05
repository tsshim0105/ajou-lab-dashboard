/* Desktop notifications: local permission + changes from the shared research feed.
 * Keep permission and presentation here; Web Push can later supply a transport
 * backed by ServiceWorkerRegistration.showNotification with the same payload.
 * Permission belongs to this browser + origin, never to an account preference.
 */
globalThis.NISMLNotifications = (() => {
  const blocked = '브라우저에서 NISML 대시보드의 알림 권한이 차단되어 있습니다. 브라우저 설정에서 알림을 허용해주세요.';
  const testBody = '연구실 알림 설정이 완료되었습니다.';
  const icon = 'data:image/png;base64,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';

  function createController(env = globalThis, onState = () => {}) {
    let pending = false, message = '', permissionHandle;
    const supported = () => env.isSecureContext === true && typeof env.Notification === 'function' && typeof env.Notification.requestPermission === 'function';
    const state = () => {
      const permission = supported() ? env.Notification.permission : 'unsupported';
      return {permission, pending,
        label: permission === 'granted' ? '🔔 알림 켜짐' : permission === 'denied' ? '🔕 알림 차단됨' : permission === 'default' ? '🔔 알림 허용' : '🔕 알림 미지원',
        message: permission === 'denied' ? blocked : permission === 'unsupported' ? (env.isSecureContext ? '이 브라우저에서는 데스크톱 알림을 지원하지 않습니다. Mac/PC의 Safari, Chrome 또는 Edge에서 열어주세요.' : '브라우저 알림은 HTTPS로 접속해야 사용할 수 있습니다.') : message};
    };
    const refresh = () => onState(state());

    // Same-origin target is shared with the future notificationclick handler.
    function show({title = 'NISML 연구실', body, target = '/', tag = 'nisml-local-test', onClick, test = true} = {}) {
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
    return {state, enable, show, refresh, start, stop};
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
      if(!fresh.length||controller.state().permission!=='granted')return;
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
