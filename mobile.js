// Mobile UI uses the existing actions and role checks; no separate account state.
const mobileLabels={home:['대시보드','⌂'],groupMeetings:['그룹미팅','◷'],papers:['논문','▤'],conferences:['발표','▣'],meetingInfo:['학술대회','◷'],reagents:['시약','⚗']};
function mobileSheet(title){
 const dialog=document.createElement('dialog');dialog.className='mobile-sheet';dialog.setAttribute('aria-label',title);
 dialog.innerHTML=`<div class="mobile-sheet-heading"><h2>${esc(title)}</h2><button class="secondary" type="button" aria-label="닫기">×</button></div><div class="mobile-sheet-content"></div>`;
 dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}};
 dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();return dialog;
}
function openMobileMore(){
 if(!admin())return;const d=mobileSheet('관리 메뉴');d.querySelector('.mobile-sheet-content').innerHTML=menu.filter(([key])=>!mobileLabels[key]).map(([key,label])=>`<button type="button" class="secondary mobile-menu-entry" data-open="${key}" aria-current="${key===tab?'page':'false'}">${esc(label)}<span aria-hidden="true">›</span></button>`).join('');
 d.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{if(!admin()||busy)return;tab=b.dataset.open;d.close();render();window.scrollTo({top:0});});
}

// Horizontal section gestures use the visible, permission-filtered navigation.
(()=>{
 const panel=document.getElementById('panel');if(!panel?.addEventListener)return;let gesture=null,animating=false,suppressClickUntil=0;
 const mobile=()=>matchMedia('(max-width:760px)').matches;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const reset=()=>{panel.style.transform='';panel.style.willChange='';};
 let pullIndicator=null;
 const pullBlocked=()=>busy||document.querySelector('dialog[open],[data-inline-editor],#startupSplash')||!['home','groupMeetings','papers','conferences','reagents','meetingInfo'].includes(tab);
 const atTop=target=>{
  if(!panel.contains(target)||panel.scrollTop>1)return false;
  for(let n=target;n&&n!==panel;n=n.parentElement)if(n.scrollTop>1)return false;
  return true;
 };
 const showPull=(distance,label,loading=false)=>{
  if(!pullIndicator){pullIndicator=document.createElement('div');pullIndicator.className='pull-refresh';pullIndicator.setAttribute('role','status');pullIndicator.setAttribute('aria-live','polite');panel.parentElement.append(pullIndicator);}
  pullIndicator.style.top=(panel.offsetTop+8)+'px';pullIndicator.hidden=false;
  pullIndicator.classList.toggle('is-loading',loading);
  pullIndicator.innerHTML='<span aria-hidden="true">↻</span><small>'+label+'</small>';
  pullIndicator.style.opacity=String(Math.min(1,distance/40));
  panel.style.willChange='transform';panel.style.transform=`translateY(${distance}px)`;
 };
 const finishPull=async(g,cancel)=>{
  animating=true;
  const commit=!cancel&&g.pull>=64&&!pullBlocked()&&g.tab===tab;
  if(commit){
   busy=true;showPull(52,'새로고침 중',true);
   try{await refreshDashboardFromPull();showPull(52,'업데이트 완료');}
   catch(error){showPull(52,error.message||'연결을 확인해 주세요');await new Promise(resolve=>setTimeout(resolve,1300));}
   finally{busy=false;}
  }
  const from=commit?52:g.pull;
  const a=panel.animate([{transform:`translateY(${from}px)`},{transform:'translateY(-3px)',offset:.72},{transform:'translateY(0)'}],{duration:reduced()?0:460,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'});
  try{await a.finished;}finally{a.cancel();reset();if(pullIndicator)pullIndicator.hidden=true;animating=false;}
 };
 document.addEventListener('touchstart',e=>{
  if(!mobile()||animating||busy||e.target.closest('.rr-topic-list')||e.touches.length!==1||document.querySelector('dialog[open]')||(e.target.closest('.notification-center')||(!e.target.closest('.group-schedule,.game-night-editor')&&e.target.closest('input,textarea,select,[contenteditable]'))))return;
  const t=e.touches[0];
  gesture={x:t.clientX,y:t.clientY,dx:0,axis:null,time:performance.now(),tab,pull:0,canPull:!pullBlocked()&&atTop(e.target),scroller:e.target.closest('.table-wrap,.meeting-sheet-wrap,#tabs')};
 },{passive:true,capture:true});
 document.addEventListener('touchmove',e=>{
  if(!gesture)return;if(e.touches.length!==1){finish(true);return;}
  const t=e.touches[0],dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
  if(!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>10)gesture.axis=Math.abs(dx)>Math.abs(dy)*1.3?'x':'y';
  if(gesture.axis==='y'&&gesture.canPull){
   if(dy<=0&&!gesture.pull){gesture.canPull=false;return;}
   if(e.cancelable)e.preventDefault();
   gesture.pull=Math.max(0,Math.min(100,dy*.42));suppressClickUntil=performance.now()+500;
   showPull(gesture.pull,gesture.pull>=64?'놓으면 새로고침':'당겨서 새로고침');return;
  }
  if(gesture.axis!=='x')return;
  const scroller=gesture.scroller;
  if(scroller&&scroller.scrollWidth>scroller.clientWidth+2&&((dx>0&&scroller.scrollLeft>1)||(dx<0&&scroller.scrollLeft+scroller.clientWidth<scroller.scrollWidth-1))){gesture=null;reset();return;}
  if(e.target.closest('.group-schedule,.game-night-editor')&&document.activeElement?.matches('input,textarea,select'))document.activeElement.blur();
  e.preventDefault();suppressClickUntil=performance.now()+500;
  const keys=[...document.querySelectorAll('#tabs [data-tab]')].map(b=>b.dataset.tab),index=keys.indexOf(tab),next=keys[index+(dx<0?1:-1)];
  gesture.dx=next?dx:dx*.2;panel.style.willChange='transform';panel.style.transform=`translateX(${gesture.dx}px)`;
 },{passive:false,capture:true});
 const finish=cancel=>{
  const g=gesture;gesture=null;if(!g)return;if(g.pull>0){finishPull(g,cancel);return;}if(g.axis!=='x'){reset();return;}
  const keys=[...document.querySelectorAll('#tabs [data-tab]')].map(b=>b.dataset.tab),next=keys[keys.indexOf(tab)+(g.dx<0?1:-1)];
  const commit=!cancel&&g.axis==='x'&&g.tab===tab&&next&&(Math.abs(g.dx)>Math.min(80,innerWidth*.22)||(!g.wheel&&Math.abs(g.dx)>30&&Math.abs(g.dx)/(performance.now()-g.time)>.45));
  const duration=reduced()?0:300,opts={duration,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'};
  if(!commit){animating=true;const a=panel.animate([{transform:`translateX(${g.dx}px)`},{transform:'translateX(0)'}],opts);a.finished.finally(()=>{a.cancel();reset();animating=false;});return;}
  animating=true;const rect=panel.getBoundingClientRect(),copy=panel.cloneNode(true);
  copy.removeAttribute('id');copy.removeAttribute('aria-live');copy.setAttribute('aria-hidden','true');copy.inert=true;copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
  copy.classList.add('section-swipe-copy');Object.assign(copy.style,{position:'fixed',left:rect.left-g.dx+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',transform:'none'});document.body.append(copy);
  reset();tab=next;if(tab==='papers')document.getElementById('year').value='all';render();
  const direction=g.dx<0?-1:1,width=rect.width;
  const outgoing=copy.animate([{transform:`translateX(${g.dx}px)`,opacity:1},{transform:`translateX(${direction*width}px)`,opacity:0}],opts);
  const incoming=panel.animate([{transform:`translateX(${-direction*width+g.dx}px)`,opacity:.25},{transform:'translateX(0)',opacity:1}],opts);
  Promise.all([outgoing.finished,incoming.finished]).finally(()=>{outgoing.cancel();incoming.cancel();copy.remove();reset();animating=false;});
 };
 // Trackpads send horizontal wheel events in WebKit and desktop browsers.
 // Keep one navigation per gesture, including the trailing momentum events.
 let wheelSession=null,wheelTimer;
 const horizontalScroller=target=>{
  for(let node=target;node&&node!==document.body;node=node.parentElement){
   if(node.scrollWidth>node.clientWidth+2&&/(auto|scroll)/.test(getComputedStyle(node).overflowX))return true;
  }
  return false;
 };
 document.addEventListener('wheel',e=>{
  if(e.ctrlKey||e.metaKey||!e.target.closest('main.app')||e.target.closest('input,textarea,select,[contenteditable],.notification-center')||document.querySelector('dialog[open],#startupSplash')||busy)return;
  const unit=e.deltaMode===1?16:e.deltaMode===2?panel.clientWidth:1,dx=e.deltaX*unit,dy=e.deltaY*unit;
  if(!wheelSession){
   if(gesture||animating)return;
   wheelSession={x:0,y:0,axis:null,blocked:horizontalScroller(e.target),done:false};
  }
  clearTimeout(wheelTimer);
  wheelTimer=setTimeout(()=>{if(gesture?.wheel)finish(false);wheelSession=null;},220);
  const w=wheelSession;if(w.blocked)return;
  w.x+=dx;w.y+=dy;
  if(!w.axis&&Math.max(Math.abs(w.x),Math.abs(w.y))>8)w.axis=Math.abs(w.x)>Math.abs(w.y)*1.5?'x':'y';
  if(w.axis!=='x')return;
  if(e.cancelable)e.preventDefault();
  if(w.done||animating)return;
  if(!gesture)gesture={dx:0,axis:'x',time:performance.now(),tab,wheel:true};
  const keys=[...document.querySelectorAll('#tabs [data-tab]')].map(b=>b.dataset.tab),next=keys[keys.indexOf(tab)+(w.x>0?1:-1)];
  gesture.dx=-Math.max(-180,Math.min(180,w.x))*(next?1:.2);
  panel.style.willChange='transform';panel.style.transform=`translateX(${gesture.dx}px)`;
  if(Math.abs(w.x)>=100){w.done=true;finish(!next);}
 },{passive:false});
 document.addEventListener('touchend',()=>finish(false),{passive:true,capture:true});document.addEventListener('touchcancel',()=>finish(true),{passive:true,capture:true});
 document.addEventListener('click',e=>{if(performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
})();

/* Clock follows Korean time, independently of the visitor's timezone. */
(()=>{
 const clock=document.getElementById('headerClock');
 if(!clock||clock.tagName!=='TIME')return;
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 let timer;
 function update(){
  clearTimeout(timer);
  const now=new Date(),p=Object.fromEntries(formatter.formatToParts(now).map(x=>[x.type,x.value]));
  clock.textContent=p.month+'/'+p.day+' '+p.hour+':'+p.minute;
  clock.dateTime=now.toISOString();
  document.querySelectorAll('.section-clock').forEach(el=>{el.textContent=clock.textContent;el.dateTime=clock.dateTime;});
  if(!document.hidden)timer=setTimeout(update,60000-now.getSeconds()*1000-now.getMilliseconds()+50);
 }
 document.addEventListener('visibilitychange',update);
 window.addEventListener('pageshow',update);
 update();
})();

function syncSectionClock(){
 const panel=document.getElementById('panel'),clock=document.getElementById('headerClock');
 if(!panel?.querySelector||!clock)return;
 let heading=tab==='home'?null:panel.querySelector('h1,h2');
 if(!heading){heading=document.createElement('div');heading.className='mobile-section-title';heading.textContent=menu.find(([key])=>key===tab)?.[1]||'';panel.prepend(heading);}
 heading.classList.add('has-section-clock');
 const time=document.createElement('time');time.className='section-clock';time.textContent=clock.textContent;time.dateTime=clock.dateTime;time.setAttribute('aria-label','한국 시간');heading.append(time);
}
