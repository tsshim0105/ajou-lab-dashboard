/* Visual composition only: read live dashboard figures; never synthesize research data. */
(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icons={calendar:'<rect x="12" y="17" width="48" height="44" rx="5" fill="white"/><path d="M12 30h48"/><path d="M24 11v13m24-13v13"/><path d="M24 40h6m12 0h6m-24 11h6m12 0h6"/>',paper:'<path d="M23 14h35v47H23z" fill="white"/><path d="M14 8h35v47H14z" fill="white"/><path d="M23 22h17m-17 11h17m-17 11h12"/>',chart:'<path d="M10 61h52"/><rect x="14" y="38" width="10" height="21" fill="#ffe229"/><rect x="31" y="25" width="10" height="34" fill="#ff3a98"/><rect x="48" y="12" width="10" height="47" fill="#0751ed"/>'};
 const icon=k=>`<svg viewBox="0 0 72 72" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${icons[k]}</svg>`;
 function mount(theme){
  document.getElementById('themeDashboardLead')?.remove();
  if(!['pop','shinchan','orchestra'].includes(theme)||document.documentElement.dataset.activeTab!=='home')return;
  const panel=document.getElementById('panel'),meeting=panel?.querySelector('.meeting-overview'),year=panel?.querySelector('.year-aurora');
  if(!panel||!meeting||!year)return;
  const text=(el,selector)=>el?.querySelector(selector)?.textContent?.trim()||'';
  const metric=[...year.querySelectorAll('.year-metric')];
  const cards=[{kind:'calendar',title:'이번 그룹미팅',value:text(meeting,'.meeting-overview-date')||'일정 미정',unit:'',detail:[text(meeting,'.meeting-overview-time'),text(meeting,'.meeting-overview-place')].filter(Boolean).join(' · '),note:text(meeting,'.meeting-overview-presenters')},
   {kind:'paper',title:'등록 논문',value:text(metric[0],'b')||'0',unit:'편',detail:text(year,'h2'),note:'올해 등록된 논문 수'},
   {kind:'chart',title:'학회 발표',value:text(metric[1],'b')||'0',unit:'건',detail:text(year,'h2'),note:'올해 학회 발표 수'}];
  const root=document.createElement('section');root.id='themeDashboardLead';root.setAttribute('aria-label','연구실 주요 현황');
  root.innerHTML=`<div class="theme-hero-cards">${cards.map((c,i)=>`<article class="theme-hero-card theme-hero-${c.kind}"><div class="theme-icon-panel">${icon(c.kind)}</div><div class="theme-card-content"><h2>${esc(c.title)}</h2><div class="theme-hero-number">${esc(c.value)}<small>${c.unit}</small></div><p>${esc(c.detail)}</p><small class="theme-card-note">${esc(c.note)}</small></div><span class="theme-icon-watermark" aria-hidden="true">${icon(c.kind)}</span><span class="theme-character theme-character-${i}" aria-hidden="true"></span></article>`).join('')}</div><div class="theme-support-cards"></div>`;
  const support=root.querySelector('.theme-support-cards');
  for(const el of [panel.querySelectorAll('.meeting-overview')[1],panel.querySelector('.game-galaxy')])if(el){const copy=el.cloneNode(true);copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));copy.classList.add('theme-support-card');support.append(copy);}
  panel.prepend(root);
 }
 globalThis.HubThemeDesign={mount};
})();
