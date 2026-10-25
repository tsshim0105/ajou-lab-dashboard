/* Professor workspace: preserve the live research panel and recorder when rearranging. */
(()=>{
 const keys=['home','research','achievements','funds'],titles=['대시보드','연구회의록','업적평가','연구비'];
 const embedded=window.parent!==window&&keys.includes(new URLSearchParams(location.search).get('hubUnit'));
 const unit=embedded?new URLSearchParams(location.search).get('hubUnit'):null;
 let active=false,root=null,marker=null,editing=false,fullscreenPending=false;
 const defaults=()=>keys.map((id,i)=>({id,w:i===0?7:i===1?5:6,h:560,closed:false}));
 let layout=defaults();
 const storageKey=()=> 'nisml-hub-layout-v1:'+String(user.email||'');
 function read(){try{const saved=JSON.parse(localStorage.getItem(storageKey()));if(Array.isArray(saved)&&saved.length===4&&new Set(saved.map(x=>x.id)).size===4&&saved.every(x=>keys.includes(x.id)))layout=saved.map(x=>({id:x.id,w:Math.max(4,Math.min(12,Math.round(Number(x.w)||6))),h:Math.max(260,Math.min(1600,Number(x.h)||620)),closed:!!x.closed}));}catch{}}
 function save(){try{localStorage.setItem(storageKey(),JSON.stringify(layout));}catch{root.querySelector('[data-status]').textContent='배치 저장을 사용할 수 없습니다.';}}
 const originalRender=render;
 render=function(){
  if(embedded){if(!admin()){originalRender();document.body.replaceChildren(Object.assign(document.createElement('p'),{textContent:'교수님 전용 화면입니다.'}));return;}tab=unit==='achievements'?'papers':unit;originalRender();if(unit==='achievements'){const p=$('panel');p.innerHTML='<div data-pa-body></div>';p.close=()=>{};paRender(p);}return;}
  if(active&&!admin())close();
  if(active&&tab!=='researchRooms'){const target=tab;close();tab=target;}
  originalRender();button();if(fullscreenPending&&!active&&admin())queueMicrotask(open);
 };
 function button(){let b=$('hubWorkspaceOpen');if(!admin()){b?.remove();return;}if(!b){b=document.createElement('button');b.id='hubWorkspaceOpen';b.className='secondary';b.textContent='통합 화면';b.onclick=()=>open();document.querySelector('.desktop-controls')?.prepend(b);}}
 if(embedded){
  document.documentElement.classList.add('hub-embedded');
  document.addEventListener('click',e=>{const b=e.target.closest('[data-recent-topic]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'hub-topic',topic:b.dataset.recentTopic,recording:b.dataset.recording},location.origin);},true);
  if(user.email)render();
  return;
 }
 function apply(){for(const x of layout){const el=root.querySelector('[data-unit="'+x.id+'"]');el.style.gridColumn='span '+x.w;el.style.height=x.closed?'48px':x.h+'px';el.classList.toggle('collapsed',x.closed);el.querySelector('[data-fold]').setAttribute('aria-expanded',String(!x.closed));el.querySelector('[data-fold]').textContent=x.closed?'펼치기':'접기';el.style.order=layout.indexOf(x);el.querySelector('select').value=String(x.w);}root.classList.toggle('editing',editing);}
 function open(){if(active||!admin()||innerWidth<900)return;read();active=true;
  root=document.createElement('section');root.className='hub-workspace';root.setAttribute('aria-label','교수님 통합 작업 화면');root.innerHTML='<header class="hub-workspace-head"><strong>NISML Hub <small>통합 화면</small></strong><span data-status>배치는 이 기기에 자동 저장됩니다.</span><button class="secondary" data-edit>배치 편집</button><button class="secondary" data-reset>기본 배치</button><button class="secondary" data-full>전체화면</button><button class="secondary" data-close>일반 화면</button></header><div class="hub-unit-grid"></div>';
  document.body.append(root);document.body.classList.add('hub-workspace-active');
  keys.forEach((id,i)=>{const section=document.createElement('section');section.className='hub-unit';section.dataset.unit=id;section.innerHTML='<header class="hub-unit-head"><strong>'+titles[i]+'</strong><div class="hub-edit-tools"><button class="secondary" data-left aria-label="앞으로 이동">←</button><button class="secondary" data-right aria-label="뒤로 이동">→</button><select aria-label="'+titles[i]+' 너비">'+Array.from({length:9},(_,i)=>[i+4,(i+4)+'/12']).map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select></div><button class="secondary" data-fold aria-expanded="true">접기</button></header><div class="hub-unit-body"></div><button class="hub-resize" aria-label="'+titles[i]+' 크기 조절">◢</button>';
   root.querySelector('.hub-unit-grid').append(section);const body=section.querySelector('.hub-unit-body');
   if(id==='research'){const panel=$('panel');marker=document.createComment('research panel home');panel.before(marker);body.append(panel);}else{const frame=document.createElement('iframe');const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('hubUnit',id);frame.src=url.href;frame.title=titles[i];body.append(frame);}
   const item=()=>layout.find(x=>x.id===id);section.querySelector('select').value=item().w;
   section.querySelector('select').onchange=e=>{item().w=Number(e.target.value);apply();save();};
   section.querySelector('[data-fold]').onclick=()=>{item().closed=!item().closed;apply();save();};
   for(const [s,n] of [['left',-1],['right',1]])section.querySelector('[data-'+s+']').onclick=()=>{const a=layout.indexOf(item()),b=a+n;if(b>=0&&b<4){[layout[a],layout[b]]=[layout[b],layout[a]];apply();save();}};
   const head=section.querySelector('.hub-unit-head');head.draggable=true;head.ondragstart=e=>{if(!editing||e.target.closest('button,select')){e.preventDefault();return;}e.dataTransfer.setData('text/plain',id);};section.ondragover=e=>{if(editing)e.preventDefault();};section.ondrop=e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain');if(!editing||!keys.includes(from)||from===id)return;const old=layout.find(x=>x.id===from);layout=layout.filter(x=>x.id!==from);layout.splice(layout.findIndex(x=>x.id===id),0,old);apply();save();};
   const handle=section.querySelector('.hub-resize');handle.onpointerdown=e=>{if(!editing)return;e.preventDefault();handle.setPointerCapture(e.pointerId);const sx=e.clientX,sy=e.clientY,sw=item().w,sh=item().h,grid=root.querySelector('.hub-unit-grid').clientWidth;root.classList.add('resizing');handle.onpointermove=m=>{item().w=Math.max(4,Math.min(12,Math.round(sw+(m.clientX-sx)/grid*12)));item().h=Math.max(260,Math.min(1600,sh+m.clientY-sy));section.style.gridColumn='span '+item().w;section.style.height=item().h+'px';};const end=()=>{handle.onpointermove=null;root.classList.remove('resizing');save();};handle.onpointerup=end;handle.onpointercancel=end;};
  });
  root.querySelector('[data-edit]').onclick=e=>{editing=!editing;e.target.textContent=editing?'편집 완료':'배치 편집';apply();};root.querySelector('[data-reset]').onclick=()=>{layout=defaults();apply();save();};root.querySelector('[data-close]').onclick=close;root.querySelector('[data-full]').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{root.querySelector('[data-status]').textContent='앱의 초록색 전체화면 버튼을 이용해 주세요.';}};
  if(tab!=='researchRooms'){tab='researchRooms';originalRender();}apply();
 }
 function close(){if(!active)return;const panel=$('panel');marker.replaceWith(panel);root.remove();root=null;active=false;document.body.classList.remove('hub-workspace-active');/* Keep the research DOM and recording session alive. */tab='researchRooms';nav();}
 window.addEventListener('message',async e=>{if(!active||e.origin!==location.origin||![...root.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source)||e.data?.type!=='hub-topic')return;await openResearchNotification({id:'workspace',type:'researchRooms',topic:e.data.topic,recording:e.data.recording});const item=layout.find(x=>x.id==='research');item.closed=false;apply();root.querySelector('[data-unit="research"]').scrollIntoView({behavior:'smooth',block:'start'});});
 document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement)open();else close();});
 window.addEventListener('nisml-fullscreen',e=>{fullscreenPending=!!e.detail?.active;if(fullscreenPending)open();else close();});
 button();
})();
