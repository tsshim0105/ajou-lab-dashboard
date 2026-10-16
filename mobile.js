// Mobile UI uses the existing actions and role checks; no separate account state.
const mobileLabels={home:['현황','⌂'],groupMeetings:['그룹미팅','◷'],papers:['논문','▤'],conferences:['발표','▣'],meetingInfo:['학술대회','◷'],reagents:['시약','⚗']};
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
 const panel=document.getElementById('panel');if(!panel?.addEventListener)return;let gesture=null,animating=false;
 const mobile=()=>matchMedia('(max-width:760px)').matches;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const reset=()=>{panel.style.transform='';panel.style.willChange='';};
 panel.addEventListener('touchstart',e=>{
  if(!mobile()||animating||busy||e.touches.length!==1||document.querySelector('dialog[open]')||e.target.closest('input,textarea,select,button,a,iframe,[contenteditable],.table-wrap'))return;
  const t=e.touches[0];if(t.clientX<20||t.clientX>innerWidth-20)return;
  gesture={x:t.clientX,y:t.clientY,dx:0,axis:null,time:performance.now(),tab};
 },{passive:true});
 panel.addEventListener('touchmove',e=>{
  if(!gesture)return;if(e.touches.length!==1){gesture=null;reset();return;}
  const t=e.touches[0],dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
  if(!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>10)gesture.axis=Math.abs(dx)>Math.abs(dy)*1.3?'x':'y';
  if(gesture.axis!=='x')return;e.preventDefault();
  const keys=[...document.querySelectorAll('#tabs [data-tab]')].map(b=>b.dataset.tab),index=keys.indexOf(tab),next=keys[index+(dx<0?1:-1)];
  gesture.dx=next?dx:dx*.2;panel.style.willChange='transform';panel.style.transform=`translateX(${gesture.dx}px)`;
 },{passive:false});
 const finish=cancel=>{
  const g=gesture;gesture=null;if(!g)return;
  const keys=[...document.querySelectorAll('#tabs [data-tab]')].map(b=>b.dataset.tab),next=keys[keys.indexOf(tab)+(g.dx<0?1:-1)];
  const commit=!cancel&&g.axis==='x'&&g.tab===tab&&next&&(Math.abs(g.dx)>Math.min(80,innerWidth*.22)||(Math.abs(g.dx)>30&&Math.abs(g.dx)/(performance.now()-g.time)>.45));
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
 panel.addEventListener('touchend',()=>finish(false),{passive:true});panel.addEventListener('touchcancel',()=>finish(true),{passive:true});
})();
