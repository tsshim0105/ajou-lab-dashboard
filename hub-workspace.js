/* Grid coordinates are independent of DOM order; moving a widget never reloads its content. */
const HubWidgetGrid={
 overlaps:(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,
 place(items,id,rect){
  const result=items.map(x=>({...x})),moving=result.find(x=>x.id===id);
  if(!moving)return result;
  Object.assign(moving,rect);const placed=[moving];
  for(const item of result.filter(x=>x!==moving).sort((a,b)=>a.y-b.y||a.x-b.x)){
   let hits;while((hits=placed.filter(x=>this.overlaps(item,x))).length)item.y=Math.max(...hits.map(x=>x.y+x.h));
   placed.push(item);
  }return result;
 }
};
/* Professor workspace: preserve the live research panel and recorder when rearranging. */
(()=>{
 const keys=['home','research','achievements','funds','groupMeetings','papers','conferences','reagents','meetingInfo','payroll'],titles=['대시보드','연구회의록','업적평가','연구비','그룹미팅/게임나잇','논문 출판','학회 발표','시약관리','학술대회 정보','인건비'];
 const embedded=window.parent!==window&&keys.includes(new URLSearchParams(location.search).get('hubUnit'));
 const unit=embedded?new URLSearchParams(location.search).get('hubUnit'):null;
 let active=false,root=null,marker=null,editing=false,fullscreenPending=false,cancelGesture=null,researchTimer=null;
 const defaults=()=>{const h=Math.max(4,Math.round((innerHeight-110)/144));return keys.slice(0,4).map((id,i)=>({id,x:i%2?6:0,y:i<2?0:h,w:6,h}));};
 let layout=defaults();
 const storageKey=()=> 'nisml-hub-layout-v2:'+String(user.email||'');
 function read(){layout=defaults();try{const saved=JSON.parse(localStorage.getItem(storageKey()));if(Array.isArray(saved)&&saved.length>=1&&saved.length<=keys.length&&new Set(saved.map(x=>x.id)).size===saved.length&&saved.every(x=>keys.includes(x.id)&&['x','y','w','h'].every(k=>Number.isInteger(x[k]))&&x.x>=0&&x.y>=0&&x.y<10000&&x.w>=3&&x.w<=12&&x.x+x.w<=12&&x.h>=3&&x.h<=24)&&!saved.some((x,i)=>saved.slice(i+1).some(y=>HubWidgetGrid.overlaps(x,y))))layout=saved;}catch{}}
 function save(){try{localStorage.setItem(storageKey(),JSON.stringify(layout));}catch{if(root)root.querySelector('[data-status]').textContent='배치 저장을 사용할 수 없습니다.';}}
 const originalRender=render;
 render=function(){
  if(embedded){if(!admin()){originalRender();document.body.replaceChildren(Object.assign(document.createElement('p'),{textContent:'교수님 전용 화면입니다.'}));return;}tab=unit==='achievements'?'papers':unit;originalRender();if(unit==='achievements'){const p=$('panel');p.innerHTML='<div data-pa-body></div>';p.close=()=>{};paRender(p);}return;}
  if(active&&!admin())close();
  originalRender();button();settings();if(fullscreenPending&&!active&&admin())queueMicrotask(open);
 };
 function button(){let b=$('hubWorkspaceOpen');if(!admin()){b?.remove();return;}if(!b){b=document.createElement('button');b.id='hubWorkspaceOpen';b.className='secondary';b.textContent='통합 화면';b.onclick=()=>open();document.querySelector('.desktop-controls')?.prepend(b);}}
 if(embedded){
  document.documentElement.classList.add('hub-embedded');document.documentElement.dataset.hubUnit=unit;
  document.addEventListener('click',e=>{const b=e.target.closest('[data-recent-topic]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'hub-topic',topic:b.dataset.recentTopic,recording:b.dataset.recording},location.origin);},true);
  if(user.email)render();
  return;
 }
 function settings(){
  if(!admin()||tab!=='settings'||$('hubWorkspaceSettings'))return;
  const card=document.createElement('section');card.id='hubWorkspaceSettings';card.className='section-card';card.innerHTML='<h2>전체화면 모드</h2><p>함께 볼 메뉴를 선택하고 각 블록의 위치와 크기를 직접 배치합니다. 대시보드 내부 구성은 그대로 유지됩니다.</p><button class="primary" data-config>메뉴 조합 설정</button> <button class="secondary" data-launch>전체화면 모드 열기</button><p class="muted">교수님 전용 · 메뉴 선택과 배치는 이 브라우저에 저장됩니다.</p>';$('panel').prepend(card);card.querySelector('[data-config]').onclick=configure;card.querySelector('[data-launch]').onclick=open;
 }
 function configure(){
  if(!admin())return;if(!active)read();const d=document.createElement('dialog');d.className='hub-config';d.setAttribute('aria-label','전체화면 메뉴 조합');d.innerHTML='<form><h2>전체화면 메뉴 조합</h2><p>함께 볼 메뉴를 선택하세요. 각 블록은 배치 편집에서 이동하거나 크기를 바꿀 수 있습니다.</p><div class="hub-config-options">'+keys.map((id,i)=>'<label><input type="checkbox" name="unit" value="'+id+'" '+(layout.some(x=>x.id===id)?'checked':'')+'> '+titles[i]+'</label>').join('')+'</div><p role="status"></p><footer><button type="button" class="secondary" data-cancel>취소</button><button class="primary" type="submit">저장하고 열기</button></footer></form>';document.body.append(d);d.showModal();d.querySelector('[data-cancel]').onclick=()=>d.close();d.onclose=()=>d.remove();d.querySelector('form').onsubmit=e=>{e.preventDefault();const selected=[...d.querySelectorAll('input:checked')].map(x=>x.value);if(!selected.length){d.querySelector('[role=status]').textContent='한 개 이상의 메뉴를 선택해주세요.';return;}if(active)close();const previous=layout;let bottom=Math.max(0,...previous.filter(x=>selected.includes(x.id)).map(x=>x.y+x.h));layout=selected.map(id=>{const old=previous.find(x=>x.id===id);if(old)return old;const item={id,x:0,y:bottom,w:6,h:4};bottom+=4;return item;});save();d.close();open();};
 }
 function apply(){if(!root)return;for(const x of layout){const el=root.querySelector('[data-unit="'+x.id+'"]');el.style.left=(x.x/12*100)+'%';el.style.top=(x.y*72)+'px';el.style.width=(x.w/12*100)+'%';el.style.height=(x.h*72)+'px';}root.querySelector('.hub-unit-grid').style.height=(Math.max(...layout.map(x=>x.y+x.h))+(editing?6:0))*72+'px';root.classList.toggle('editing',editing);root.querySelector('[data-edit]').textContent=editing?'편집 완료':'배치 편집';}
 function bindWidget(section,id){
  const head=section.querySelector('.hub-unit-head'),handle=section.querySelector('.hub-resize');
  const item=()=>layout.find(x=>x.id===id);
  function constrain(r){r.w=Math.max(3,Math.min(12,r.w));r.h=Math.max(3,Math.min(24,r.h));r.x=Math.max(0,Math.min(12-r.w,r.x));r.y=Math.max(0,Math.min(9999,r.y));return r;}
  function start(e,resize){
   if(!editing||e.button!==0)return;e.preventDefault();const target=e.currentTarget;target.setPointerCapture(e.pointerId);
   const origin={...item()},before=layout.map(x=>({...x})),sx=e.clientX,sy=e.clientY,scroll=root.scrollTop,step=root.querySelector('.hub-unit-grid').clientWidth/12;
   let current={...origin},lastY=e.clientY,raf;
   section.classList.add('moving');root.classList.add('resizing');
   function update(x,y){const dx=Math.round((x-sx)/step),dy=Math.round((y-sy+root.scrollTop-scroll)/72);current=constrain({...origin,...(resize?{w:origin.w+dx,h:origin.h+dy}:{x:origin.x+dx,y:origin.y+dy})});layout=HubWidgetGrid.place(before,id,current);apply();}
   let lastX=e.clientX;
   function tick(){const box=root.getBoundingClientRect();if(lastY>box.bottom-48)root.scrollTop+=12;else if(lastY<box.top+100)root.scrollTop-=12;update(lastX,lastY);raf=requestAnimationFrame(tick);}
   const move=m=>{lastX=m.clientX;lastY=m.clientY;update(lastX,lastY);};
   const finish=cancel=>{cancelGesture=null;cancelAnimationFrame(raf);target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',abort);target.removeEventListener('lostpointercapture',abort);document.removeEventListener('keydown',escape);if(cancel)layout=before;section.classList.remove('moving');root?.classList.remove('resizing');apply();if(!cancel)save();if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);};
   const up=()=>finish(false),abort=()=>finish(true),escape=k=>{if(k.key==='Escape'){k.preventDefault();finish(true);}};
   cancelGesture=abort;target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',abort);target.addEventListener('lostpointercapture',abort);document.addEventListener('keydown',escape);raf=requestAnimationFrame(tick);
  }
  head.onpointerdown=e=>start(e,false);handle.onpointerdown=e=>start(e,true);
  for(const [target,resize] of [[head,false],[handle,true]])target.onkeydown=e=>{if(!editing||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0,r={...item()};if(resize){r.w+=dx;r.h+=dy;}else{r.x+=dx;r.y+=dy;}layout=HubWidgetGrid.place(layout,id,constrain(r));apply();save();};
 }
 async function loadResearch(body){
  if(!body.isConnected||!admin()||body.dataset.loading==='true')return;body.dataset.loading='true';
  if(!body.children.length)body.innerHTML='<p class="muted">연구회의록을 불러오는 중입니다.</p>';
  try{
   const [rooms,history]=await Promise.all([researchFetch('rooms'),researchFetch('recording-list')]);if(!body.isConnected||!admin())return;
   const topics=[...rooms.topics];if(history.meetings.some(m=>m.summary?.unclassified?.content?.trim()))topics.push({id:'unclassified',title:'미분류',archived:false});
   const html=topics.map(topic=>{const meetings=history.meetings.filter(m=>m.status!=='cancelled'&&m.summary?.[topic.id]?.content?.trim()).sort((a,b)=>b.created.localeCompare(a.created));return '<article class="hub-meeting-topic"><header>'+rrTopicCover(topic)+'<h2>'+esc(topic.title)+'</h2>'+(topic.archived?'<small>보관된 연구</small>':'')+'</header>'+(meetings.length?meetings.map(m=>{const summary=m.summary[topic.id];return '<section class="hub-meeting-record"><div class="hub-meeting-date"><time>'+esc(rrTime(m.created))+'</time><span>'+ (summary.status==='reviewed'?'검토 확정':'초안')+'</span></div><div class="mr-summary-grid">'+mrSummarySections(summary.content).map((part,i)=>'<section><h4>'+esc(mrSummaryTitles[i])+'</h4><ul>'+part.split(/\n/).filter(x=>x.trim()).map(line=>'<li>'+esc(line.replace(/^\s*[-*•]\s*/,''))+'</li>').join('')+'</ul></section>').join('')+'</div></section>';}).join(''):'<p class="muted hub-meeting-empty">등록된 회의요약이 없습니다.</p>')+'</article>';}).join('')||'<p class="muted">등록된 연구주제가 없습니다.</p>';
   if(body.dataset.content!==html){const y=body.scrollTop;body.innerHTML=html;body.dataset.content=html;body.scrollTop=y;}
  }catch(error){if(body.isConnected&&!body.dataset.content){body.innerHTML='<p role="status">'+esc(error.message)+'</p><button class="secondary">다시 불러오기</button>';body.querySelector('button').onclick=()=>loadResearch(body);}}
  finally{delete body.dataset.loading;}
 }
 function open(){if(active||!admin()||innerWidth<900)return;read();active=true;
  root=document.createElement('section');root.className='hub-workspace';root.setAttribute('aria-label','교수님 통합 작업 화면');root.innerHTML='<button class="hub-board-menu secondary" aria-label="전체화면 메뉴" aria-expanded="false">☰</button><header class="hub-workspace-head"><strong>NISML Hub <small>통합 화면</small></strong><span data-status>제목을 끌어 이동 · 모서리로 크기 조절 · 자동 저장</span><button class="secondary" data-config>메뉴 조합</button><button class="secondary" data-edit>배치 편집</button><button class="secondary" data-reset>기본 배치</button><button class="secondary" data-full>전체화면</button><button class="secondary" data-close>일반 화면</button></header><div class="hub-unit-grid"></div>';
  document.body.append(root);document.body.classList.add('hub-workspace-active');
  layout.forEach(({id})=>{const i=keys.indexOf(id);const section=document.createElement('section');section.className='hub-unit';section.dataset.unit=id;section.innerHTML='<header class="hub-unit-head" tabindex="0" role="button" aria-label="'+titles[i]+' 위치 이동"><span class="hub-grip" aria-hidden="true">⠿</span><strong>'+titles[i]+'</strong></header><div class="hub-unit-body"></div><button class="hub-resize" aria-label="'+titles[i]+' 크기 조절">◢</button>' ;
   root.querySelector('.hub-unit-grid').append(section);const body=section.querySelector('.hub-unit-body');
   if(id==='research'){body.classList.add('hub-meeting-overview');loadResearch(body);researchTimer=setInterval(()=>{if(!document.hidden)loadResearch(body);},60000);}else{const frame=document.createElement('iframe');const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('hubUnit',id);frame.src=url.href;frame.title=titles[i];body.append(frame);}
   bindWidget(section,id);
  });
  root.querySelector('.hub-board-menu').onclick=e=>{const expanded=root.classList.toggle('menu-open');e.currentTarget.setAttribute('aria-expanded',String(expanded));};
  root.querySelector('[data-config]').onclick=configure;root.querySelector('[data-edit]').onclick=e=>{editing=!editing;e.target.textContent=editing?'편집 완료':'배치 편집';apply();};root.querySelector('[data-reset]').onclick=()=>{const h=Math.max(4,Math.round((innerHeight-110)/144));layout=layout.map((x,i)=>({...x,x:i%2?6:0,y:Math.floor(i/2)*h,w:6,h}));apply();save();};root.querySelector('[data-close]').onclick=close;root.querySelector('[data-full]').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{root.querySelector('[data-status]').textContent='앱의 초록색 전체화면 버튼을 이용해 주세요.';}};
  apply();
 }
 function close(){if(!active)return;cancelGesture?.();clearInterval(researchTimer);researchTimer=null;const panel=$('panel');if(marker?.isConnected)marker.replaceWith(panel);marker=null;root.remove();root=null;active=false;fullscreenPending=false;document.body.classList.remove('hub-workspace-active');/* Keep the research DOM and recording session alive. */nav();}
 window.addEventListener('message',async e=>{if(!active||e.origin!==location.origin||![...root.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source)||e.data?.type!=='hub-topic')return;close();await openResearchNotification({id:'workspace',type:'researchRooms',topic:e.data.topic,recording:e.data.recording});apply();root?.querySelector('[data-unit="research"]')?.scrollIntoView({behavior:'smooth',block:'start'});});
 document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement)open();else close();});
 window.addEventListener('nisml-fullscreen',e=>{fullscreenPending=!!e.detail?.active;if(fullscreenPending)open();else close();});
 button();settings();
})();
