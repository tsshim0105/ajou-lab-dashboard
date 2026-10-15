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
