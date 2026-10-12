// Mobile UI uses the existing actions and role checks; no separate account state.
const mobileLabels={home:['현황','⌂'],papers:['논문','▤'],conferences:['발표','▣'],meetingInfo:['학술대회','◷'],reagents:['시약','⚗']};
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
function openMobileSettings(){
 const d=mobileSheet('화면·알림 설정'),content=d.querySelector('.mobile-sheet-content');
 const actions=[['personalization','개인화'],['theme',$('theme').textContent],...(!$('browserNotificationPermission').classList.contains('hidden')?[['browserNotificationPermission',$('browserNotificationPermission').textContent]]:[])];
 content.innerHTML=actions.map(([id,label])=>`<button class="secondary mobile-menu-entry" type="button" data-action="${id}">${esc(label)}<span aria-hidden="true">›</span></button>`).join('')+`<p class="muted">${esc($('browserNotificationStatus').textContent||'알림 설정은 이 기기의 브라우저에 적용됩니다.')}</p>`;
 content.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const id=b.dataset.action;if(id==='theme'){$('theme').click();b.firstChild.textContent=$('theme').textContent;return;}d.close();$(id).click();});
}
document.getElementById('mobileSettings').onclick=openMobileSettings;
function openMainMenu(){
 const d=mobileSheet('메뉴');d.classList.add('main-menu-dialog');
 const allowed=menu.filter(([key])=>admin()||mobileLabels[key]);
 d.querySelector('.mobile-sheet-content').innerHTML='<div class="main-menu-grid">'+allowed.map(([key,label])=>`<button type="button" class="secondary main-menu-item" data-open="${key}" aria-current="${key===tab?'page':'false'}"><span aria-hidden="true">${mobileLabels[key]?.[1]||({funds:'₩',payroll:'▦',settings:'⚙'})[key]}</span>${esc(label)}</button>`).join('')+'</div>';
 d.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{if(busy)return;const key=b.dataset.open;if(!admin()&&!mobileLabels[key])return;if(key==='papers'&&tab!=='papers')$('year').value='all';tab=key;d.close();render();window.scrollTo({top:0});});
}
document.getElementById('mainMenuToggle').onclick=openMainMenu;
