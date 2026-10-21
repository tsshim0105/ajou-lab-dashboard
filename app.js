const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n==null?'미기재':Number(n).toLocaleString('ko-KR')+'원',count=n=>Number(n).toLocaleString('ko-KR');
let notifications=[];
let notificationRefreshPending=false;
let preferences={},viewDetail=false,viewLayout="sheet",prefQueue=Promise.resolve(),writePending=false;
let data=LabData.empty(),user={role:'student'},version=0,students=[],homepageAdmins=[],studentNames={},labLeadAuthor='',labMemberAuthors=[],tab='home',meetingGroup='all',fundTab='internal',term='2026-2 인건비(안)',busy=false,exportRows=[];
let studentPreview=false;
const offline=!!globalThis.LAB_PREVIEW,admin=()=>user.role==='admin'&&!studentPreview;
const canEditResearch=()=>['admin','student'].includes(user.role);
const canManageHomepage=()=>user.canManageHomepage===true&&!studentPreview;
const menu=[['home','연구실 활동'],['groupMeetings','그룹미팅/게임나잇'],['researchRooms','연구미팅'],['papers','논문아카이브'],['conferences','학회 발표'],['reagents','시약관리'],['meetingInfo','학술대회 정보'],['funds','연구비'],['payroll','인건비'],['settings','자료·계정 관리'],['homepage','홈페이지 관리']];
const searchKey=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s\-‐‑–—.,·*†]/g,'');
const filter=rows=>rows.filter(r=>($('year').value==='all'||String(r.year)===$('year').value)&&matchesResearch(r,$('query').value.trim()));
function authorAliases(){return data.authorAliases||[];}
function englishAuthorText(value){let text=String(value||'').replace(/[가-힣][가-힣\s]*(?:\s*\[[^\]]*\])?\s*\(([^)]+)\)/g,'$1');for(const a of authorAliases())text=text.split(a.korean).join(a.english);return text.replace(/\[[^\]]*[가-힣][^\]]*\]/g,'').split(/[,;]/).map(v=>v.replace(/[가-힣]+/g,'').replace(/[()]/g,'').trim()).filter(v=>/[A-Za-z]/.test(v)).join(', ');}
function paperFirst(r){return r.paperEditedFields?.includes('firstAuthor')?englishAuthorText(r.firstAuthor):(r.authorList||[]).filter(a=>a.first||a.equalContribution).map(a=>a.name).join(', ')||englishAuthorText(r.firstAuthor);}
function labPaperRole(r){
 const names=s=>String(s||'').split(/[,;]|\s+and\s+/i).map(searchKey).filter(Boolean);
 const lead=searchKey(labLeadAuthor),students=new Set([...authorAliases().map(a=>a.english),...labMemberAuthors].map(searchKey).filter(n=>n&&n!==lead)),members=new Set(students);if(lead)members.add(lead);
 const first=names(paperFirst(r)),corresponding=names(paperCorresponding(r));
 return {highlight:first.some(n=>students.has(n))||!!lead&&corresponding.includes(lead),recent:first.some(n=>members.has(n))||corresponding.some(n=>members.has(n))};
}
function homePeriod(rows,now=new Date()){
 const today=calendarDay('Asia/Seoul',now),year=Number(today.slice(0,4));return rows.filter(r=>{if(r.year<2015||r.year>year)return false;const date=r.date||r.issueDate||r.onlineDate;return !date||date<=today.slice(0,date.length);});
}
function matchesResearch(r,query){const q=searchKey(query);if(!q)return true;const paper=data.papers.includes(r);const text=paper?[r.title,r.journal,r.citation,r.doi,r.year,r.volume,r.issue,r.pages,r.articleNumber,r.onlineDate,r.issueDate,r.fund,paperFirst(r),paperCorresponding(r),paperCoauthors(r),...(r.authorList||[]).map(a=>a.name)].join(' '):JSON.stringify(r);const haystack=searchKey(text);if(haystack.includes(q))return true;return authorAliases().filter(a=>searchKey(a.korean)===q).some(a=>haystack.includes(searchKey(a.english)));}
const badge=s=>`<span class="badge">${esc(s)}</span>`;
function table(headers,rows,classes=[],rowClasses=[]){if(!rows.length)return '<div class="empty">선택한 조건에 해당하는 자료가 없습니다.</div>';return `<div class="table-wrap"><table class="data-table responsive-table"><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,ri)=>`<tr class="${esc(rowClasses[ri]||'')}">${row.map((v,i)=>`<td data-label="${esc(headers[i])}" class="${classes[i]||''} ${i===0?'record-title':''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
const card=(label,value,note)=>`<div class="card"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span>${note?`<small>${esc(note)}</small>`:''}</div>`;
function bar(label,value,max,light=false){return `<div class="bar-row"><span>${esc(label)}</span><div class="track"><div class="fill ${light?'light':''}" style="width:${max?value/max*100:0}%"></div></div><strong>${count(value)}</strong></div>`;}
function nav(){
 const allowed=menu.filter(([k])=>k==='homepage'?canManageHomepage():admin()||['home','groupMeetings','researchRooms','papers','conferences','meetingInfo','reagents','settings'].includes(k));
 const navLabels={...mobileLabels,researchRooms:['연구미팅','◌'],homepage:['홈페이지','⚒'],funds:['연구비','₩'],payroll:['인건비','▦'],settings:['관리','⚙']},navScroll=$('tabs').scrollLeft;
 $('tabs').innerHTML=allowed.map(([k,v])=>`<button class="tab ${k===tab?'active':''}" data-tab="${k}" aria-label="${esc(v)}" aria-current="${k===tab?'page':'false'}"><span class="tab-label">${v}</span><span class="tab-icon" aria-hidden="true">${navLabels[k][1]}</span><span class="tab-short" aria-hidden="true">${navLabels[k][0]}</span></button>`).join('');
 $('tabs').scrollLeft=navScroll;
 if(typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>{$('tabs').querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});});
 $('filters').classList.toggle('hidden',!['papers','conferences'].includes(tab));
 $('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.tab==='papers'&&tab!=='papers')$('year').value='all';const changed=tab!==b.dataset.tab;tab=b.dataset.tab;render();if(changed&&matchMedia('(max-width:760px)').matches)window.scrollTo({top:0});});
}
function years(){const old=$('year').value;const list=[...new Set([...data.papers,...data.conferences].map(r=>r.year).filter(Boolean))].sort((a,b)=>b-a);$('year').innerHTML='<option value="all">전체 연도</option>'+list.map(y=>`<option>${y}</option>`).join('');$('year').value=list.includes(Number(old))?old:'all';}
let lastRenderedSection=null;
function resetSectionScroll(){
 const panel=$('panel');if(panel){panel.scrollTop=0;panel.scrollLeft=0;}
 if(typeof window!=='undefined')window.scrollTo?.({top:0,left:0,behavior:'instant'});
}
function placePageFooter(){
 const footer=document.querySelector('.foot'),panel=$('panel');if(!footer||!panel)return;
 const scroller=['papers','conferences'].includes(tab)?panel.querySelector(':scope > .table-wrap, :scope > .paper-archive-list'):null;
 (scroller||panel).append(footer);
}
function render(){const pageFooter=document.querySelector('.foot');if(pageFooter)document.querySelector('main.app').append(pageFooter);if(lastRenderedSection!==tab){lastRenderedSection=tab;resetSectionScroll();}const filterFocus=$('filters')?.contains(document.activeElement)?document.activeElement:null,filterSelection=filterFocus?.tagName==='INPUT'?[filterFocus.selectionStart,filterFocus.selectionEnd]:null;if($('filters')?.parentElement===$('panel'))$('panel').before($('filters'));document.documentElement.dataset.activeTab=tab;if(tab==='homepage'&&!canManageHomepage())tab='home';if(tab!=='homepage'&&!admin()&&!['home','groupMeetings','researchRooms','papers','conferences','meetingInfo','reagents','settings'].includes(tab))tab='home';$('userLabel').innerHTML=badge(studentPreview?'학생 화면 미리보기':admin()?'교수님':'연구실 구성원');nav();exportRows=[];const panel=$('panel'),p=tab==='home'?homePeriod(data.papers):filter(data.papers),c=tab==='home'?homePeriod(data.conferences):filter(data.conferences);const title=tab==='home'?'연구실 활동 (2015년~현재)':menu.find(([k])=>k===tab)[1];let html=['papers','conferences'].includes(tab)?`<div class="research-title"><div class="research-title-label"><h1>${title}</h1>${tab==='papers'?'<small class="paper-title-note">연초록: 학생 제1저자·교수 교신저자 · 국문명 검색 가능</small>':''}</div><div class="research-title-actions">${canEditResearch()?`<button class="primary" id="${tab==='papers'?'addPaper':'addConference'}">${tab==='papers'?'논문추가':'발표 내역 추가'}</button>`:''}<button class="secondary" id="csv">CSV 저장</button></div></div>`:['home','groupMeetings','meetingInfo','funds'].includes(tab)?'':`<h1>${title}</h1>`;
 if(tab==='researchRooms'){panel.innerHTML='<div id="researchRoomRoot"></div>';mountResearchRooms();placePageFooter();return;}
 if(tab==='homepage'){panel.innerHTML=html+'<iframe title="홈페이지 관리" src="/dashboard/homepage#admin" style="width:100%;height:calc(100dvh - 190px);min-height:620px;border:0;border-radius:12px;background:white"></iframe>';syncSectionClock();placePageFooter();return;}
 if(tab==='home'){
  html+=groupMeetingCards();
  html+=yearAndGameNight();
  const ys=[...new Set([...p,...c].map(r=>r.year))].sort((a,b)=>b-a),counts=ys.map(y=>({year:y,p:p.filter(r=>r.year===y).length,c:c.filter(r=>r.year===y).length})),max=Math.max(1,...counts.flatMap(r=>[r.p,r.c]));
  html+=`<div class="grid research-year-charts"><section class="section-card" aria-label="연도별 논문 그래프"><h2>연도별 논문</h2>${counts.length?counts.map(r=>bar(r.year+'년',r.p,max)).join(''):'<p class="muted">등록된 논문이 없습니다.</p>'}</section><section class="section-card" aria-label="연도별 학회 발표 그래프"><h2>연도별 학회 발표</h2>${counts.length?counts.map(r=>bar(r.year+'년',r.c,max,true)).join(''):'<p class="muted">등록된 학회 발표가 없습니다.</p>'}</section></div>`;
 }else if(tab==='papers'){

  const headers=['순번','연도','논문 제목','학술지명','제1저자','교신저자','공동저자','권','호','페이지','SCI 여부','총저자수','온라인공개일','출판일','DOI','과제사사'];
  const records=p.slice().sort((a,b)=>b.year-a.year||(b.websiteNumber||0)-(a.websiteNumber||0));
  const rows=records.map((r,i)=>[i+1,r.year,r.title,r.journal||'미기재',paperFirst(r)||'미입력',paperCorresponding(r)||'미입력',paperCoauthors(r)||((r.coauthors!==undefined||r.authorList?.length)?'없음':'미확인'),r.volume||'—',r.issue||'—',[r.pages,r.articleNumber].filter(Boolean).join(' / ')||'—',paperSci(r)||'미확인',paperAuthorCount(r)??'미확인',r.onlineDate||'미확인',r.issueDate||'미확인',r.doi||'미등록',r.fund||'미등록']);exportRows=[headers,...rows];
  html+=toolbar(rows.length)+table([...headers,...(canEditResearch()?['수정']:[])],rows.map((row,i)=>{const cells=row.map(esc),r=records[i];
   cells[2]=`<span class="paper-title-text">${esc(row[2])}</span> ${paperLinkButton(r)}`;
   cells[6]=coauthorMarkup(esc(row[6]),'sheet-coauthors-'+i);
   cells[15]=coauthorMarkup(esc(row[15]),'sheet-grants-'+i);
   cells[13]=`<span title="${esc(r.bibliographyDateBasis||'')}">${esc(row[13])}</span>`;
   if(canEditResearch())cells.push(`<button class="primary green" data-edit-paper="${data.papers.indexOf(r)}">수정</button>`);return cells;}),['nowrap','nowrap','title','title','title','title','title','nowrap','nowrap','nowrap','nowrap','nowrap','nowrap','nowrap','nowrap'],records.map(r=>labPaperRole(r).highlight?'lab-paper':''));
 }else if(tab==='conferences'){
  const records=c.slice().sort((a,b)=>b.year-a.year||(b.date||'').localeCompare(a.date||''));const headers=['발표일','발표자','학회명','국내/국제','지역','장소','발표 제목','유형','비고'];const rows=records.map(r=>[r.date||'미기재',r.presenter,r.conference,conferenceScope(r)||'미기재',conferenceCity(r)||'미기재',r.venue||'미기재',r.title||'미기재',r.kind,r.note]);exportRows=[headers,...rows];html+=toolbar(rows.length)+table([...headers,...(canEditResearch()?['관리']:[])],rows.map((r,i)=>[...r.map(esc),...(canEditResearch()?[`<button class="secondary" style="white-space:nowrap" data-conf="${data.conferences.indexOf(records[i])}">수정</button>`]:[])]),['nowrap','nowrap','title','nowrap','nowrap','title','title','nowrap','']);
 }else if(tab==='groupMeetings'){
  html+=groupMeetingSchedule()+gameNightEditor();
 }else if(tab==='meetingInfo'){
  html+=renderMeetingInfo();
 }else if(tab==='reagents'){
  html=renderReagents();
 }else if(tab==='funds'){
  html+=`${sectionFilterTitle('연구비',[['internal','교내연구비'],['external','교외연구비']],fundTab,'fund-tab')}<div class="note">직접 입력한 지출은 기존 기록 잔액에서 차감합니다. 이미 반영된 지출은 중복 입력하지 마세요.</div><div class="toolbar"><button class="primary" id="addFund">연구비 항목 추가</button></div><p id="fundStatus" role="status"></p>`;
  sortedFundItems(data.funds).forEach(({f,fi})=>{if((f.category||'internal')!==fundTab)return;const entries=f.entries||[],added=entries.reduce((s,e)=>s+e.amount,0),spend=(f.manual||f.initialEdited)?f.total-f.balance:f.months.reduce((s,m)=>s+m.spend,0);html+=`<div class="section-card fund-card"><div class="fund-top"><div class="fund-heading"><h2 style="margin:0">${esc(f.title)} ${fundCountdown(f.endDate)} ${f.closed?badge('사용완료 메모'):''}</h2>${!f.closed?`<button class="primary" data-expense="${fi}">지출 입력</button>`:''}</div><div class="toolbar fund-actions"><label>연구비 구분 <select data-fund-category="${fi}" aria-label="${esc(f.title)} 연구비 구분"><option value="internal" ${(f.category||'internal')==='internal'?'selected':''}>교내연구비</option><option value="external" ${f.category==='external'?'selected':''}>교외연구비</option></select></label><button class="primary" style="background:#15803d;color:#fff" data-edit-fund="${fi}">수정</button><button class="primary" style="background:#c62828;color:#fff" data-delete-fund="${fi}">항목삭제</button></div></div><p class="muted fund-end-date">연구비 종료일: <span>${esc(f.endDate||'미등록')}</span>${f.note?`<span class="fund-note">비고: ${esc(f.note)}</span>`:''}</p><div class="cards" style="grid-template-columns:repeat(3,1fr)">${card('등록 총액',money(f.total),'')}${card('누적 지출',money(spend+added),'')}${card('잔액',money(f.balance==null?null:f.balance-added),'')}</div><details class="fund-expenses"><summary>상세 지출 내역 <span class="muted">(${f.months.length+entries.length}건)</span></summary>${renderFundExpenses(f,fi)}</details></div>`;});
  if(!data.funds.some(f=>(f.category||'internal')===fundTab))html+='<div class="empty">연구비 항목을 추가하거나 엑셀 파일을 등록해주세요.</div>';
 }else if(tab==='payroll'){
  const terms=[...new Set(data.payroll.map(r=>r.term))];if(!terms.includes(term))term=terms[0]||'';const rs=data.payroll.filter(r=>r.term===term);html+=`<div class="toolbar"><label>지급 계획 <select id="term">${terms.map(t=>`<option ${t===term?'selected':''}>${esc(t)}</option>`).join('')}</select></label>${badge('교수님 전용')}</div><div class="note warning">지급계획표를 표시하며 실제 지급 완료를 의미하지 않습니다. (안) 표기를 유지하고, 월 합계와 학기 금액이 다르더라도 원본 값을 임의로 바꾸지 않았습니다.</div><div class="cards" style="grid-template-columns:repeat(3,1fr)">${card('계획 행 수',rs.length+'명분','xxx 등 미정 인원 포함')}${card('월 합계',money(rs.reduce((s,r)=>s+(r.monthly||0),0)),'원본 H열 합계')}${card('학기 합계',money(rs.reduce((s,r)=>s+(r.semester||0),0)),'원본 I열 합계')}</div>`;
  const headers=['이름','과정 / 장학','기준 월급','핵심연구A','기관계정','SRC','월 합계','학기 금액','확인'];const rows=rs.map(r=>[r.name,r.degree+' / '+r.scholarship,money(r.base),money(r.core),money(r.institution),money(r.src),money(r.monthly),money(r.semester),r.monthly*6!==r.semester?'월×6 불일치':r.name==='xxx'?'미정 인원':r.note]);exportRows=[headers,...rows];html+=toolbar(rows.length)+table(headers,rows.map(r=>r.map(esc)),['nowrap','nowrap','money','money','money','money','money','money','title']);
  html+='<details><summary>2026 과정별 지급 기준</summary>'+table(['과정','기본 월 인건비','BK 지원금','BK 포함 월 수령액','등록금 고려 월액'],data.standards.map(r=>[esc(r.degree),money(r.base),money(r.bk),money(r.total),money(r.afterTuition)]),['','money','money','money','money'])+'</details>';
 }else{
  html+=`${admin()?`<section class="section-card"><h2>학생 화면 미리보기</h2><p class="muted">학생에게 보이는 연구 탭과 시약 목록과 조회 화면을 확인합니다.</p><button class="primary" id="previewStudent">학생 화면 미리보기</button></section>`:''}`+nameMappingForm()+homepageAdminSettings()+`<div class="grid">${admin()?`<div class="stack"><div class="section-card"><h2>학생 접근 계정</h2><p class="muted">학생은 네 개 연구 탭을 이용하고 논문·학회 발표를 추가·수정할 수 있습니다.</p>${studentAccountList()}<label for="students">학생 이메일 · 한 줄에 한 명</label><textarea id="students" rows="5" style="width:100%;margin:10px 0" placeholder="student@ajou.ac.kr">${esc(students.join('\n'))}</textarea><button id="saveStudents" class="primary" ${offline?'disabled':''}>접근 목록 저장</button><p class="muted">${offline?'검토용 파일에서는 계정 설정을 저장할 수 없습니다.':'Sites에서 사이트 공유 권한도 별도로 부여해야 합니다.'}</p><p class="status" id="accountStatus" role="status"></p></div></div>`:''}</div>`+desktopDownloads();
 }
 panel.innerHTML=(studentPreview?`<div class="note" role="status" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><strong>학생 화면 미리보기 · 저장 미적용</strong><button class="primary" id="exitStudentPreview">관리자 화면으로 돌아가기</button></div>`:'')+html;
 syncSectionClock();
 if(tab==='reagents')bindReagents();
 enhanceView();
 const gameHeading=panel.querySelector('.game-night-editor>.planner-heading'),gameToolbar=panel.querySelector('.game-season-toolbar');
 if(gameHeading&&gameToolbar){const actions=document.createElement('div');actions.className='research-title-actions';gameHeading.append(actions);actions.append(gameToolbar,gameHeading.querySelector('[data-game-edit]'));}
 if(['papers','conferences'].includes(tab))panel.querySelector('.research-title')?.after($('filters'));
 if(filterFocus){filterFocus.focus({preventScroll:true});if(filterSelection)filterFocus.setSelectionRange(...filterSelection);}
 placePageFooter();
 if(document.getElementById('desktopDownloads'))loadDesktopDownloads();
 if($('previewStudent'))$('previewStudent').onclick=()=>setStudentPreview(true);
 if($('exitStudentPreview'))$('exitStudentPreview').onclick=()=>setStudentPreview(false);
 if($('saveHomepageAdmins'))$('saveHomepageAdmins').onclick=saveHomepageAdmins;
 if($('nameMappingForm'))bindNameMappings();
 if($('addPaper'))$('addPaper').onclick=()=>editPaper();
 panel.querySelectorAll('[data-edit-paper]').forEach(b=>b.onclick=()=>editPaper(Number(b.dataset.editPaper)));
 panel.querySelectorAll('[data-paper-author]').forEach(b=>b.onclick=()=>editPaperAuthor(Number(b.dataset.paperAuthor)));
 panel.querySelectorAll('[data-meeting-group]').forEach(b=>b.onclick=()=>{meetingGroup=b.dataset.meetingGroup;render();});
 panel.querySelectorAll('[data-fund-tab]').forEach(b=>b.onclick=()=>{if(!busy){fundTab=b.dataset.fundTab;render();}});panel.querySelectorAll('[data-edit-fund]').forEach(b=>b.onclick=()=>editFund(Number(b.dataset.editFund)));panel.querySelectorAll('[data-delete-fund]').forEach(b=>b.onclick=()=>deleteFund(Number(b.dataset.deleteFund)));panel.querySelectorAll('[data-fund-category]').forEach(el=>el.onchange=()=>changeFundCategory(Number(el.dataset.fundCategory),el));
 if($('addConference'))$('addConference').onclick=()=>editConference();panel.querySelectorAll('[data-conf]').forEach(b=>b.onclick=()=>editConference(Number(b.dataset.conf)));if($('addFund'))$('addFund').onclick=addFund;panel.querySelectorAll('[data-expense]').forEach(b=>b.onclick=()=>editExpense(Number(b.dataset.expense),b.dataset.entry===undefined?null:Number(b.dataset.entry)));
 if($('term'))$('term').onchange=e=>{term=e.target.value;render();};if($('csv'))$('csv').onclick=download;
 if($('saveStudents'))$('saveStudents').onclick=saveStudents;panel.querySelectorAll('[data-remove-student]').forEach(b=>b.onclick=()=>removeStudent(b.dataset.removeStudent));
 const release=globalThis.DASHBOARD_RELEASE,releaseLabel=release?'v'+release.version+' · 수정 '+new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(release.updatedAt)):'개발 미리보기';const dates=data.sources.filter(s=>admin()||['papers','conferences'].includes(s.type)).map(s=>s.importedAt).sort();$('sourceDate').textContent=dates.length?'자료 갱신 '+dates.at(-1).slice(0,10)+' · '+releaseLabel:releaseLabel;
}
function toolbar(n){if(tab==='papers')return '';return `<div class="toolbar"><span class="muted">${count(n)}개 기록</span>${['papers','conferences'].includes(tab)?'':'<button class="secondary" id="csv">현재 표 CSV 저장</button>'}</div>`;}
function download(){const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const b=new Blob(['\ufeff'+exportRows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='연구실_'+tab+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
// Rebase only the user's changes onto a fresh snapshot; never resend a stale full copy.
function mergeSavedData(base,local,remote,key=''){
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),copy=v=>v===undefined?undefined:structuredClone(v);
 if(equal(local,base))return copy(remote);
 if(equal(remote,base)||equal(local,remote))return copy(local);
 if(key==='paperEditedAt')return [local,remote].sort().at(-1);
 if(key==='paperEditedFields'&&Array.isArray(local)&&Array.isArray(remote))return [...new Set([...remote,...local])];
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)){
  const keyed=rows=>rows.every(r=>r&&typeof r==='object'&&typeof r.id==='string')&&new Set(rows.map(r=>r.id)).size===rows.length;
  if([base,local,remote].every(keyed)){
   const b=new Map(base.map(r=>[r.id,r])),l=new Map(local.map(r=>[r.id,r])),r=new Map(remote.map(r=>[r.id,r]));
   return [...new Set([...remote.map(r=>r.id),...local.map(r=>r.id)])].map(id=>mergeSavedData(b.get(id),l.get(id),r.get(id),id)).filter(v=>v!==undefined);
  }
 }
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(object(base)&&object(local)&&object(remote)){
  const result={};for(const field of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   const value=mergeSavedData(base[field],local[field],remote[field],field);if(value!==undefined)result[field]=value;
  }return result;
 }
 throw Error('같은 항목을 다른 사람이 수정했습니다. 입력 내용은 유지되어 있습니다. 최신 내용을 확인한 뒤 저장해주세요.');
}
async function performPut(path,input){
 if(studentPreview)throw Error('학생 화면 미리보기에서는 자료를 변경할 수 없습니다.');
 if(user.role==='student'&&path==='/api/data')path='/api/shared';
 const canMerge=['/api/data','/api/shared'].includes(path)&&input.data;
 const baseline=canMerge?structuredClone(data):null,desired=canMerge?structuredClone(input.data):null;
 let payload=input,saveVersion=version;
 for(let attempt=0;attempt<4;attempt++){
  const res=await fetch(path,{method:'PUT',headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify({...payload,version:saveVersion})});
  const result=await res.json();
  if(res.ok){
   version=result.version;
   // Callers retain their next-data reference; update it only after successful persistence.
   if(canMerge&&payload!==input){for(const key of Object.keys(input.data))delete input.data[key];Object.assign(input.data,payload.data);}
   if(result.notifications){notifications=result.notifications;renderNotifications();}return;
  }
  if(res.status!==409||!canMerge)throw Error(result.error||'저장하지 못했습니다. 입력 내용을 유지한 채 다시 시도해주세요.');
  if(attempt===3)throw Error('자료 저장이 잠시 밀리고 있습니다. 입력 내용은 유지되어 있으니 저장을 다시 눌러주세요.');
  const fresh=await fetch('/api/data',{cache:'no-store'}),snapshot=await fresh.json();
  if(!fresh.ok)throw Error(snapshot.error||'최신 자료를 확인하지 못했습니다. 입력 내용은 유지되어 있습니다.');
  payload={...input,data:mergeSavedData(baseline,desired,snapshot.data)};saveVersion=snapshot.version;
 }
}


async function saveStudents(){const b=$('saveStudents');b.disabled=true;try{const next=$('students').value.split(/\s+/).filter(Boolean);await put('/api/students',{students:next});students=next;render();$('accountStatus').textContent='접근 목록을 저장했습니다.';}catch(e){$('accountStatus').textContent=e.message;}finally{b.disabled=false;}}
$('year').onchange=render;$('query').oninput=render;$('reset').onclick=()=>{$('year').value='all';$('query').value='';render();};
function theme(mode){document.documentElement.dataset.theme=mode;const label=mode==='dark'?'라이트모드로 전환':'다크모드로 전환';$('theme').innerHTML='<span aria-hidden="true">'+(mode==='dark'?'☀':'☾')+'</span>';$('theme').setAttribute('aria-label',label);$('theme').title=label;try{localStorage.setItem('ajou-lab-theme',mode);}catch{}}
try{theme(localStorage.getItem('ajou-lab-theme')||'light');}catch{theme('light');}$('theme').onclick=()=>{theme(document.documentElement.dataset.theme==='dark'?'light':'dark');preferences.theme=document.documentElement.dataset.theme;savePreferences();};
(async()=>{await Promise.resolve();try{if(offline){data=LAB_PREVIEW;user={email:'',role:'admin'};$('previewNotice').classList.remove('hidden');}else{const res=await fetch('/api/data',{cache:'no-store'}),result=await res.json();if(!res.ok)throw Error(result.error);({data,user,version,students}=result);studentNames=result.studentNames||{};homepageAdmins=result.homepageAdmins||[];notifications=result.notifications||[];preferences=result.preferences||{};theme(preferences.theme||'light');applyAppearance();labLeadAuthor=result.labLeadAuthor||'';labMemberAuthors=result.labMemberAuthors||[];}retireDesktopNotifications();closeNotifications();renderNotifications();years();const current=String(new Date().getFullYear());if([...$('year').options].some(o=>o.value===current))$('year').value=current;$('userLabel').innerHTML=badge(admin()?'교수님':'연구실 구성원');render();openPushTarget(location.href,{initial:true});}catch(e){$('userLabel').textContent='연결 필요';$('panel').innerHTML=`<div class="note warning">${esc(e.message)}</div>`;}finally{globalThis.DashboardStartup?.finish();}})();

function field(name,label,value='',type='text',extra=''){return `<label style="display:grid;gap:6px">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} style="width:100%;box-sizing:border-box;padding:10px"></label>`;}
function editor(title,fields,save,research=false,remove=null,options={}){
 if(!(research?canEditResearch():admin())||busy)return;
 const d=document.createElement('dialog');d.style.cssText='width:min(640px,calc(100vw - 40px));max-height:85vh;overflow:auto;border:1px solid #999;border-radius:14px;padding:24px;background:var(--surface,#fff);color:var(--text,#172b3a)';
 d.innerHTML=`<form><h2>${esc(title)}</h2><p class="muted">* 필수 항목</p><div style="display:grid;gap:14px">${fields}</div><p role="alert" id="entryStatus"></p><div class="toolbar editor-actions"><button type="button" class="secondary" id="cancelEntry">취소</button><button type="submit" class="primary">저장</button></div>${remove&&(research?canEditResearch():admin())?`<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--edge)"><button type="button" class="primary delete-action" id="deletePaper">${esc(options.removeLabel||'논문 삭제')}</button></div>`:''}</form>`;
 document.body.append(d);d.showModal();const form=d.querySelector('form'),status=d.querySelector('[role=alert]');let saving=false;
 if(remove&&(research?canEditResearch():admin()))d.querySelector('#deletePaper').onclick=async()=>{if(saving||busy||!(research?canEditResearch():admin()))return;if(!confirm(options.removeConfirm||'이 논문을 삭제할까요? 삭제한 논문은 자동 자료 갱신에서도 다시 나타나지 않습니다.'))return;saving=true;busy=true;const buttons=[...d.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='삭제 중…';try{const next=structuredClone(data);remove(next);if(!offline)await put('/api/data',{data:next});data=next;years();render();d.close();}catch(e){status.textContent=e.message;}finally{saving=false;busy=false;buttons.forEach(b=>b.disabled=false);}};
 d.querySelector('#cancelEntry').onclick=()=>{if(!saving)d.close();};d.oncancel=e=>{if(saving)e.preventDefault();};d.onclose=()=>d.remove();
 form.onsubmit=async e=>{e.preventDefault();if(saving||busy)return;saving=true;busy=true;const buttons=[...d.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='저장 중…';try{if(studentPreview)throw Error('미리보기에서는 저장하지 않습니다. 관리자 화면으로 돌아가 저장해주세요.');const values=Object.fromEntries(new FormData(form));const next=structuredClone(data);save(values,next);if(!offline)await put('/api/data',{data:next});data=next;years();if(['conferences','papers'].includes(tab)){$('year').value='all';$('query').value='';}render();d.close();const notice=document.createElement('p');notice.className='note';notice.setAttribute('role','status');notice.textContent=offline?'검토 화면에 반영했습니다. 서버에는 저장되지 않습니다.':'저장했습니다.';$('panel').prepend(notice);}catch(err){status.textContent=err.message;}finally{saving=false;busy=false;buttons.forEach(b=>b.disabled=false);}};
 if(options.onMount)options.onMount(form);
 return d;
}
function conferenceScope(r){return r.scope??(['국내','국제'].includes(r.region)?r.region:'');}
function conferenceCity(r){return r.city??(['국내','국제'].includes(r.region)?'':r.region||'');}
function conferenceScopeField(r,inline=false){const select=`<select ${inline?'data-key="scope"':'name="scope"'} aria-label="국내/국제" required style="width:100%;padding:10px"><option value="" ${!conferenceScope(r)?'selected':''}>선택</option>${['국내','국제'].map(k=>`<option value="${k}" ${conferenceScope(r)===k?'selected':''}>${k}</option>`).join('')}</select>`;return inline?select:`<label style="display:grid;gap:6px">국내/국제 *${select}</label>`;}
function editConference(index=null){const r=index===null?{year:new Date().getFullYear(),kind:'미기재'}:data.conferences[index];editor(index===null?'학회 발표 추가':'학회 발표 수정',field('date','발표일 *',r.date,'date','required min="1900-01-01" max="2200-12-31"')+field('presenter','발표자 *',r.presenter,'text','required maxlength="300"')+field('coauthors','공동 저자',r.coauthors)+field('conference','학회명 *',r.conference,'text','required maxlength="500"')+conferenceScopeField(r)+field('city','지역 (국내의 경우 도시, 국제의 경우 나라 입력)',conferenceCity(r),'text','maxlength="500"')+field('venue','장소',r.venue,'text','maxlength="1000"')+field('title','발표 제목',r.title)+`<label>발표 유형 <select name="kind">${['구두','포스터','미기재'].map(k=>`<option ${r.kind===k?'selected':''}>${k}</option>`).join('')}</select></label>`+field('note','비고 / 수상',r.note),(v,next)=>{v.year=Number(v.date.slice(0,4));v.presenter=v.presenter.trim();v.conference=v.conference.trim();if(!v.presenter||!v.conference)throw Error('발표자와 학회명을 입력해주세요.');if(v.date&&Number(v.date.slice(0,4))!==v.year)throw Error('발표일과 연도가 일치해야 합니다.');const row={...r,...v,id:r.id||crypto.randomUUID(),manual:true,locationEdited:true};if(index===null)next.conferences.push(row);else next.conferences[index]=row;},true);}
function addFund(){editFund();}
function fundCountdown(endDate,now=new Date()){
 if(!endDate)return '';
 const days=Math.round((Date.parse(endDate+'T00:00:00Z')-Date.parse(calendarDay('Asia/Seoul',now)+'T00:00:00Z'))/86400000);
 return Number.isFinite(days)?badge(days<0?'종료':days===0?'D-DAY':'D-'+days):'';
}
function editFund(index=null){
 const f=index===null?{category:fundTab,months:[],entries:[]}:data.funds[index];
 const amountAttrs='min="0" max="1000000000000" step="1"';
 const monthFields=(f.months||[]).map((m,i)=>`<fieldset style="border:1px solid #aaa;padding:12px;display:grid;gap:10px"><legend>월별 기록 ${i+1}</legend>`+field('month_'+i,'연월 / 기간 (예: 2026-09)',m.month,'text','required maxlength="100"')+field('spend_'+i,'기록 지출',m.spend,'number',amountAttrs)+field('monthBalance_'+i,'기록 잔액',m.balance,'number',amountAttrs)+'</fieldset>').join('');
 editor(index===null?'연구비 항목 추가':'연구비 최초 기록 수정',`<label>연구비 구분 <select name="category"><option value="internal" ${(f.category||'internal')==='internal'?'selected':''}>교내연구비</option><option value="external" ${f.category==='external'?'selected':''}>교외연구비</option></select></label>`+field('title','연구비명 / 기간 *',f.title,'text','required maxlength="500"')+field('total','배정 총액 *',f.total,'number','required '+amountAttrs)+field('balance','최초 기록 잔액 (직접 입력 지출 차감 전) *',f.balance,'number','required '+amountAttrs)+field('endDate','연구비 종료일',f.endDate,'date','min="1900-01-01" max="2200-12-31"')+field('note','비고',f.note)+`<label><input type="checkbox" name="closed" ${f.closed?'checked':''}> 사용완료</label>`+(monthFields?'<details><summary>최초 월별 기록 수정</summary><p class="muted">월별 내역을 바꾼 경우 위의 총액과 최초 기록 잔액도 확인해주세요.</p>'+monthFields+'</details>':''),(v,next)=>{
  const total=Number(v.total),balance=Number(v.balance);
  if(!v.title.trim())throw Error('연구비명을 입력해주세요.');
  if(![total,balance].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000000)||balance>total)throw Error('총액과 잔액은 0 이상의 정수로 입력하고 잔액은 총액 이하로 입력해주세요.');
  const optionalAmount=value=>value===''?null:Number(value);
  const months=(f.months||[]).map((m,i)=>({...m,month:v['month_'+i].trim(),spend:optionalAmount(v['spend_'+i]),balance:optionalAmount(v['monthBalance_'+i])}));
  const updated={...f,id:f.id||crypto.randomUUID(),category:v.category,title:v.title.trim(),total,balance,endDate:v.endDate,note:v.note,closed:v.closed==='on',months,entries:f.entries||[],initialEdited:true};
  if(index===null){updated.manual=true;updated.sheet='직접 입력';next.funds.push(updated);}else next.funds[index]=updated;
  fundTab=v.category;
 });
}
function editExpense(fi,ei=null){const f=data.funds[fi],r=ei===null?{}:f.entries[ei];editor(ei===null?'연구비 지출 입력':'연구비 지출 수정',`<p>${esc(f.title)}</p>`+field('date','지출일 *',r.date||new Date().toLocaleDateString('sv-SE'),'date','required')+field('description','사용 내역 *',r.description,'text','required maxlength="1000"')+field('amount','지출 금액 *',r.amount,'number','required min="1" max="1000000000000" step="1"')+field('note','비고',r.note),(v,next)=>{v.amount=Number(v.amount);v.description=v.description.trim();if(!v.description||!Number.isSafeInteger(v.amount)||v.amount<=0)throw Error('사용 내역과 양의 정수 금액을 입력해주세요.');const entries=next.funds[fi].entries||=[];const entry={...v,id:r.id||crypto.randomUUID()};if(ei===null)entries.push(entry);else entries[ei]=entry;});}

function editConferenceRow(index,tr){
 if(!canEditResearch()||busy||document.querySelector('[data-inline-editor]'))return;
 const r=data.conferences[index];tr.dataset.inlineEditor='true';
 const input=(key,label,type='text',extra='')=>`<input data-key="${key}" aria-label="${label}" type="${type}" value="${esc(r[key])}" ${extra} style="width:100%;min-width:${type==='date'?'155':'110'}px;padding:7px">`;
 const area=(key,label)=>`<textarea data-key="${key}" aria-label="${label}" rows="4" style="width:100%;min-width:160px;padding:7px">${esc(r[key])}</textarea>`;
 tr.innerHTML=[input('date','발표일','date','min="1900-01-01" max="2200-12-31"')+`<button type="button" class="secondary" data-calendar style="white-space:nowrap;margin-top:6px">달력 열기</button>`,input('presenter','발표자','text','required maxlength="300"'),area('conference','학회명'),conferenceScopeField(r,true),`<label>지역<input data-key="city" aria-label="지역 (국내의 경우 도시, 국제의 경우 나라 입력)" value="${esc(conferenceCity(r))}" maxlength="500" style="width:100%;min-width:110px;padding:7px"><small style="display:block;white-space:normal;margin-top:6px">(국내의 경우 도시, 국제의 경우 나라 입력)</small></label>`,input('venue','장소','text','maxlength="1000"'),area('title','발표 제목'),`<select data-key="kind" aria-label="발표 유형">${['구두','포스터','미기재'].map(k=>`<option ${r.kind===k?'selected':''}>${k}</option>`).join('')}</select>`,area('note','비고'),'<div style="display:grid;gap:8px;min-width:72px"><button class="primary" data-save>저장</button><button class="secondary" data-cancel>취소</button></div><p role="status" style="min-width:100px"></p>'].map(v=>`<td>${v}</td>`).join('');

 // Keep the edited row stable while sorting, searching and navigation are locked.
 const locked=[...document.querySelectorAll('#tabs button,#filters input,#filters select,#filters button,#addConference,[data-conf],#csv')].filter(el=>!el.disabled);locked.forEach(el=>el.disabled=true);
 const unlock=()=>locked.forEach(el=>el.disabled=false),warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);
 const close=()=>{unlock();window.removeEventListener('beforeunload',warn);render();};
 tr.querySelector('[data-cancel]').onclick=close;
 const date=tr.querySelector('[data-key="date"]'),calendar=()=>{date.focus();try{date.showPicker?.();}catch{}};tr.querySelector('[data-calendar]').onclick=calendar;date.onclick=()=>{try{date.showPicker?.();}catch{}};
 tr.querySelector('[data-save]').onclick=async()=>{
  if(busy)return;const controls=[...tr.querySelectorAll('[data-key]')];if(controls.some(el=>!el.reportValidity()))return;
  const values=Object.fromEntries(controls.map(el=>[el.dataset.key,el.value]));values.presenter=values.presenter.trim();values.conference=values.conference.trim();const status=tr.querySelector('[role=status]');if(!values.presenter||!values.conference){status.textContent='발표자와 학회명을 입력해주세요.';return;}
  if(r.date&&!values.date){status.textContent='발표일을 선택해주세요.';return;}
  const next=structuredClone(data);next.conferences[index]={...r,...values,year:values.date?Number(values.date.slice(0,4)):r.year,manual:true,locationEdited:true};
  busy=true;tr.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);status.textContent='저장 중…';
  try{if(studentPreview)throw Error('미리보기에서는 저장하지 않습니다.');if(!offline)await put('/api/data',{data:next});data=next;years();$('year').value='all';$('query').value='';close();const notice=document.createElement('p');notice.className='note';notice.setAttribute('role','status');notice.textContent=offline?'검토 화면에만 반영했습니다.':'발표 내역을 저장했습니다.';$('panel').prepend(notice);}catch(e){status.textContent=e.message;tr.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=false);}finally{busy=false;}
 };
 tr.querySelector('[data-key="presenter"]').focus();
}

async function saveFundChange(next,message){
 busy=true;const controls=[...document.querySelectorAll('#panel button,#panel select,#tabs button')];controls.forEach(el=>el.disabled=true);
 try{if(!offline)await put('/api/data',{data:next});data=next;render();$('fundStatus').textContent=message+(offline?' (검토 화면에만 반영)':'');return true;}catch(e){if($('fundStatus'))$('fundStatus').textContent=e.message;return false;}finally{busy=false;controls.forEach(el=>el.disabled=false);}
}
async function deleteFund(index){
 if(!admin()||busy)return;const f=data.funds[index];if(!confirm('“'+f.title+'” 항목을 삭제하시겠습니까?\n이 항목의 월별 기록과 지출 내역도 함께 삭제됩니다.'))return;
 const next=structuredClone(data);next.funds.splice(index,1);await saveFundChange(next,'연구비 항목을 삭제했습니다.');
}
async function changeFundCategory(index,el){
 const previous=data.funds[index].category||'internal';if(!admin()||busy){el.value=previous;return;}const next=structuredClone(data);next.funds[index].category=el.value;if(!await saveFundChange(next,'연구비 구분을 변경했습니다.'))el.value=previous;
}

function paperAuthorName(a){return a.name;}
function paperCorresponding(r){return typeof r.correspondingAuthor==='string'?englishAuthorText(r.correspondingAuthor):(r.authorList||[]).filter(a=>a.corresponding).map(a=>a.name).join(', ');}
function paperSci(r){return r.sci==='Y'?'SCI':r.sci==='N'?'해당사항없음':r.sci||'';}
function paperCoauthors(r){if(typeof r.coauthors==='string')return englishAuthorText(r.coauthors);const excluded=new Set((paperFirst(r)+','+paperCorresponding(r)).split(/[,;]/).map(searchKey));return (r.authorList||[]).filter(a=>!a.first&&!a.equalContribution&&!a.corresponding&&!excluded.has(searchKey(a.name))).map(a=>a.name).join(', ');}
function paperLocation(r){return [r.volume?'Vol. '+r.volume:'',r.issue?'No. '+r.issue:'',r.pages?'pp. '+r.pages:'',r.articleNumber||''].filter(Boolean).join(' · ');}
function paperCitation(r){return paperLocation(r)?[r.journal,paperLocation(r),`(${r.year})`].filter(Boolean).join(', '):r.citation||r.journal||'미기재';}
function validPaperDate(s){if(!s)return true;if(!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)||Number(s.slice(0,4))<1900||Number(s.slice(0,4))>2200)return false;const full=s.length===4?s+'-01-01':s.length===7?s+'-01':s;return Number.isFinite(Date.parse(full))&&new Date(full).toISOString().slice(0,10)===full;}
function paperAuthorCount(r){if(r.authorCount!==undefined)return r.authorCount;if(r.authorList?.length)return r.authorList.length;return Number.isInteger(r.authors)&&r.authors>0?r.authors:null;}
function editPaper(index=null){
 const r=index===null?{year:new Date().getFullYear(),sci:'SCI'}:data.papers[index];const fields=[['title','논문 제목 *'],['year','게재 연도 *','number'],['journal','학술지 *'],['firstAuthor','제1저자 (영문)'],['correspondingAuthor','교신저자 (영문)'],['coauthors','공동저자 (영문)'],['volume','권 (Volume)'],['issue','호 (Issue)'],['pages','페이지 (예: 419–425)'],['sci','SCI 여부','select'],['authorCount','총저자수','number'],['onlineDate','온라인 공개일 (YYYY-MM-DD / YYYY-MM / YYYY)'],['issueDate','호·권 출판일 (YYYY-MM-DD / YYYY-MM / YYYY)'],['doi','DOI'],['fund','과제사사']];
 editor(index===null?'논문 추가':'논문 정보 수정',fields.filter(([k])=>k!=='fund'||admin()).map(([k,label,type])=>k==='sci'?`<label style="display:grid;gap:6px">SCI 여부<select name="sci" style="width:100%;padding:10px">${['SCI','KCI','해당사항없음'].map(v=>`<option value="${v}" ${paperSci(r)===v?'selected':''}>${v}</option>`).join('')}</select></label>`:field(k,label,k==='authorCount'?paperAuthorCount(r):k==='correspondingAuthor'?paperCorresponding(r):k==='firstAuthor'?paperFirst(r):k==='coauthors'?paperCoauthors(r):r[k],type||'text',(k==='authorCount'?'min="1" max="100000" step="1"':k==='year'?'required min="1900" max="2200" step="1"':k==='title'||k==='journal'?'required maxlength="2000"':'maxlength="2000"'))).join('')+'<p class="muted">확인되지 않은 값은 비워두세요. 출판일은 확인된 연도·월·일까지만 입력할 수 있습니다.</p>',(v,next)=>{
  for(const k of Object.keys(v))v[k]=v[k].trim();v.year=Number(v.year);v.authorCount=v.authorCount===''?null:Number(v.authorCount);
  if(!['','SCI','KCI','해당사항없음'].includes(v.sci))throw Error('SCI, KCI 또는 해당사항없음으로 선택해주세요.');
  if(v.authorCount!==null&&(!Number.isInteger(v.authorCount)||v.authorCount<1||v.authorCount>100000))throw Error('총저자수는 1 이상의 정수로 입력해주세요.');
  if(!v.title||!v.journal||!Number.isInteger(v.year)||v.year<1900||v.year>2200)throw Error('제목, 학술지와 게재 연도를 확인해주세요.');
  if(!validPaperDate(v.issueDate)||!validPaperDate(v.onlineDate))throw Error('출판일은 실제 날짜로 YYYY, YYYY-MM 또는 YYYY-MM-DD 형식으로 입력해주세요.');
  if(v.publicationUrl&&!/^https:\/\//i.test(v.publicationUrl))throw Error('논문 링크는 https 주소로 입력해주세요.');
  if(/[가-힣]/.test(v.firstAuthor+v.correspondingAuthor+(v.coauthors||'')))throw Error('저자 이름은 영문으로 입력해주세요.');
  const changed=Object.keys(v).filter(k=>['sci','authorCount'].includes(k)||String(r[k]??'')!==String(v[k]));
  const row={...r,...v,id:r.id||crypto.randomUUID(),paperEditedFields:[...new Set([...(r.paperEditedFields||[]),...changed])],paperEditedAt:new Date().toISOString()};
  if(r.title&&v.title!==r.title)row.titleAliases=[...new Set([...(r.titleAliases||[]),r.title])];
  row.citation=[row.journal,paperLocation(row),`(${row.year})`].filter(Boolean).join(', ');row.paperEditedFields=[...new Set([...row.paperEditedFields,'citation'])];if(index===null)next.papers.push(row);else next.papers[index]=row;
 },true,index!==null?next=>removePaperRecord(next,r):null);
}
function removePaperRecord(next,record){
 const index=next.papers.findIndex(p=>record.id?p.id===record.id:p.title===record.title&&p.year===record.year);if(index<0)throw Error('논문이 변경되었습니다. 새로고침해주세요.');const removed=next.papers.splice(index,1)[0];const tombstones=next.removedPapers||=[];for(const title of [removed.title,...(removed.titleAliases||[])])if(!tombstones.some(r=>r.title===title))tombstones.push({id:removed.id||'',title});
}
function editPaperAuthor(index){const r=data.papers[index];editor('논문 제1저자 입력',`<p>${esc(r.title)}</p>`+field('firstAuthor','제1저자 영문 이름 *',paperFirst(r),'text','required maxlength="500"'),(v,next)=>{const author=v.firstAuthor.trim();if(!author||/[가-힣]/.test(author))throw Error('제1저자를 영문으로 입력해주세요.');next.papers[index]={...r,firstAuthor:author,paperEditedFields:[...new Set([...(r.paperEditedFields||[]),'firstAuthor'])]};});}
function calendarDay(tz='Asia/Seoul',now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function deadlineState(d,now=new Date()){
 const today=calendarDay(d.tz,now),days=Math.round((Date.parse(d.date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
 if(days<0)return {label:'마감',urgent:false};
 if(days===0){const clock=new Intl.DateTimeFormat('en-GB',{timeZone:d.tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);return {label:d.time&&clock>d.time?'마감':'오늘 마감 · 시각 확인',urgent:true};}
 return {label:'D-'+days,urgent:days<=14};
}
function deadlineLabel(label){
 const labels={'초록':'초록 등록 마감','구두':'구두발표 마감','포스터':'포스터발표 마감','일반 참가':'일반 참가등록 마감','제출 초록 수정':'제출 초록 수정 마감'};
 return labels[label]||(/마감/.test(label)?label:label+' 마감');
}
function deadlineList(list){
 if(!list.length)return '<p class="meeting-unknown">미공개 / 확인 대기</p>';
 return list.map(d=>{const state=deadlineState(d);return `<div class="meeting-deadline"><span class="meeting-deadline-label">${esc(deadlineLabel(d.label))}</span><div class="meeting-deadline-line"><strong><time datetime="${esc(d.date)}" aria-label="${esc(d.date)}">${esc(d.date.replaceAll('-','.'))}</time></strong><span class="badge ${state.urgent?'meeting-urgent':''}">${esc(state.label)}</span></div></div>`;}).join('');
}
function sectionFilterTitle(title,items,selected,attribute){
 return `<div class="research-title section-filter-title"><h1>${esc(title)}</h1><div class="section-filter-buttons" role="group" aria-label="${esc(title)} 구분">${items.map(([key,label])=>`<button type="button" class="${selected===key?'primary':'secondary'}" aria-pressed="${selected===key}" data-${attribute}="${key}">${esc(label)}</button>`).join('')}</div></div>`;
}
function renderMeetingInfo(){
 const today=calendarDay(),all=ConferenceInfo.events,records=all.filter(e=>(meetingGroup==='all'||e.group===meetingGroup)&&(!e.end||e.end>=today)).sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999'));
 const meetingCard=e=>{
  const icon=ConferenceInfo.icons[e.society];
  const domestic=e.group==='domestic',transport=domestic?'<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M12 3v7M8 21l2-3m6 3-2-3"/><circle cx="8.5" cy="14.5" r=".5"/><circle cx="15.5" cy="14.5" r=".5"/>':'<path d="M12 2c-1 0-1.5 1.5-1.5 3v4L3 13v2l7.5-2v5L8 20v1l4-1 4 1v-1l-2.5-2v-5l7.5 2v-2l-7.5-4V5c0-1.5-.5-3-1.5-3Z"/>';
  const shortDate=date=>esc(date.slice(5).replace('-','.'));
  return `<article class="conference-pass ${domestic?'is-domestic':'is-international'}"><div class="conference-pass-spine" aria-hidden="true">${esc(e.society.toUpperCase())} · CONFERENCE TICKET${e.start?' · '+esc(e.start.slice(0,4)):''}</div><div class="conference-pass-main"><header class="conference-pass-header"><a class="conference-pass-logo" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(e.name)} 공식 홈페이지">${icon?`<img src="${esc(icon.src)}" alt="${esc(e.name)} 로고" width="50" height="50">`:'<span>학회</span>'}</a><span class="conference-pass-mobile-region">${domestic?'국내':'국외'} 학술대회</span><div class="conference-pass-heading"><h2><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.name)} <span aria-hidden="true">↗</span></a></h2><p>${esc(e.venue||'장소 공지 대기')}</p></div><span class="conference-pass-transport" role="img" aria-label="${domestic?'국내 학술대회':'국외 학술대회'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${transport}</svg></span></header><div class="conference-pass-deadlines"><section aria-label="초록 및 발표 마감">${deadlineList(e.abstracts)}</section><section aria-label="참가등록 마감">${deadlineList(e.registration)}</section></div><footer class="meeting-footer"><details><summary>안내 및 공식 출처</summary>${e.note?`<p>${esc(e.note)}</p>`:''}<div class="meeting-sources">${e.sources.map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">공식 출처 ${i+1} ↗</a>`).join('')}</div></details><span class="muted">확인 ${esc(e.checked)}</span></footer></div><aside class="conference-pass-stub"><small>행사 일정${e.start?' · '+esc(e.start.slice(0,4)):''}</small>${e.start?`<time datetime="${esc(e.start)}">${shortDate(e.start)}</time>${e.end&&e.end!==e.start?`<span class="conference-pass-dash">—</span>${e.end.slice(0,4)!==e.start.slice(0,4)?`<small>${esc(e.end.slice(0,4))}</small>`:''}<time datetime="${esc(e.end)}">${shortDate(e.end)}</time>`:''}`:'<strong class="conference-pass-pending">공지 대기</strong>'}<span class="conference-pass-region">${domestic?'국내':'국외'} · ${e.start?'일정 공개':'미정'}</span><div class="conference-pass-barcode" aria-hidden="true"></div></aside></article>`;
 };
 return `${sectionFilterTitle('학술대회 정보',[['all','전체'],['domestic','국내'],['international','국외']],meetingGroup,'meeting-group')}<div class="toolbar"><span class="muted">공식 공지 확인: ${esc(ConferenceInfo.updated)} · ${records.length}개 대회</span></div><div class="meeting-list">${records.map(meetingCard).join('')||'<div class="empty">선택한 조건의 학술대회가 없습니다.</div>'}</div>`;
}

function fundExpenseGroups(f){
 const groups=new Map();
 const add=(period,row)=>{
  const raw=String(period||'').trim();
  const dated=raw.match(/^(\d{4})\s*(?:[-./]|년)\s*(\d{1,2})(?=$|[-./월月\s])/);
  const monthOnly=raw.match(/^(\d{1,2})\s*[월月]$/);
  const valid=dated&&Number(dated[2])>=1&&Number(dated[2])<=12;
  const key=valid?dated[1]+'-'+dated[2].padStart(2,'0'):'unknown:'+raw;
  const label=valid?dated[1]+'년 '+dated[2].padStart(2,'0')+'월':monthOnly?'연도 미확인 · '+Number(monthOnly[1])+'월':'연월 미확인'+(raw?' · '+raw:'');
  if(!groups.has(key))groups.set(key,{key,label,rows:[]});
  groups.get(key).rows.push({...row,period:raw});
 };
 (f.months||[]).forEach((m,index)=>add(m.month,{kind:'monthly',index,amount:m.spend,balance:m.balance,description:m.description||'월별 지출 합계',note:m.note||''}));
 (f.entries||[]).forEach((e,index)=>add(e.date,{...e,kind:'entry',index}));
 return [...groups.values()].sort((a,b)=>a.key.startsWith('unknown:')!==b.key.startsWith('unknown:')?(a.key.startsWith('unknown:')?1:-1):a.key.startsWith('unknown:')?0:b.key.localeCompare(a.key)).map(g=>({...g,rows:g.rows.sort((a,b)=>b.period.localeCompare(a.period)||a.index-b.index)}));
}
function renderFundExpenses(f,fi){
 const groups=fundExpenseGroups(f);
 if(!groups.length)return '<div class="empty">등록된 지출 내역이 없습니다.</div>';
 return groups.map(g=>`<section style="margin:18px 0"><h4 style="margin:0 0 10px;font-size:16px">${esc(g.label)}</h4>`+table(['지출일 / 기간','사용 내역','금액','기록 잔액','비고','관리'],g.rows.map(r=>[esc(r.period||'미기재'),esc(r.description),money(r.amount),r.kind==='monthly'?money(r.balance):'—',esc(r.note),r.kind==='monthly'?`<button class="secondary" data-edit-fund="${fi}">수정</button>`:`<button class="secondary" data-expense="${fi}" data-entry="${r.index}">수정</button>`]),['nowrap','title','money','money','title','nowrap'])+'</section>').join('');
}

function sortedFundItems(funds,now=new Date()){
 const today=calendarDay('Asia/Seoul',now);
 const rank=f=>!f.endDate?2:f.closed||f.endDate<today?1:0;
 return funds.map((f,fi)=>({f,fi})).sort((a,b)=>rank(a.f)-rank(b.f)||(a.f.endDate||'9999').localeCompare(b.f.endDate||'9999')||a.fi-b.fi);
}

function nameMappingRow(a={korean:'',english:''}){return `<tr><td><input name="korean" aria-label="학생 국문명" value="${esc(a.korean)}" maxlength="100" style="width:100%;min-width:110px"></td><td><input name="english" aria-label="학생 영문명" value="${esc(a.english)}" maxlength="200" style="width:100%;min-width:180px"></td><td><button type="button" class="secondary" data-remove-name>삭제</button></td></tr>`;}
function nameMappingForm(){return `<section class="section-card"><h2>학생 국문·영문명 관리</h2><p class="muted">국문명과 논문에 기재된 영문명을 연결하면 국문명으로 논문을 검색할 수 있습니다. 영문 표기가 여러 개면 행을 추가하세요.</p><form id="nameMappingForm"><div class="table-wrap"><table class="data-table responsive-table"><thead><tr><th>국문명</th><th>영문명</th><th>관리</th></tr></thead><tbody id="nameMappingRows">${(authorAliases().length?authorAliases():[{}]).map(nameMappingRow).join('')}</tbody></table></div><div class="toolbar"><button type="button" class="secondary" id="addNameMapping">학생 추가</button><button type="submit" class="primary green">이름 연결 저장</button></div><p role="status" id="nameMappingStatus"></p></form></section>`;}
function bindNameMappings(){
 const form=$('nameMappingForm'),rows=$('nameMappingRows');
 rows.onclick=e=>{const button=e.target.closest('[data-remove-name]');if(button&&!busy)button.closest('tr').remove();};
 $('addNameMapping').onclick=()=>{if(!busy)rows.insertAdjacentHTML('beforeend',nameMappingRow());};
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;const status=$('nameMappingStatus');try{
  const aliases=[...rows.querySelectorAll('tr')].map(tr=>({korean:tr.querySelector('[name=korean]').value.trim(),english:tr.querySelector('[name=english]').value.trim()})).filter(a=>a.korean||a.english);
  if(aliases.some(a=>!a.korean||!a.english||!/[가-힣]/.test(a.korean)||/[가-힣]/.test(a.english)||!/[A-Za-z]/.test(a.english)))throw Error('각 행에 국문명과 영문명을 모두 입력해주세요.');
  const unique=aliases.filter((a,i)=>aliases.findIndex(b=>searchKey(a.korean)===searchKey(b.korean)&&searchKey(a.english)===searchKey(b.english))===i);
  const next={...data,authorAliases:unique};busy=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);status.textContent='저장 중…';
  if(!offline)await put('/api/data',{data:next});data=next;status.textContent=offline?'검토 화면에 반영했습니다.':'이름 연결을 저장했습니다.';
 }catch(err){status.textContent=err.message;}finally{busy=false;form.querySelectorAll('button,input').forEach(el=>el.disabled=false);}};
}

// Shared research change feed; account-persistent read/dismiss and display settings.
function notificationPrefs(){return preferences.notifications||{};}
function saveNotificationPrefs(p){if(JSON.stringify(p)===JSON.stringify(notificationPrefs()))return;preferences.notifications=p;savePreferences();}
function renderNotifications(){
 const prefs=notificationPrefs(),hidden=new Set(prefs.hidden||[]),read=new Set(prefs.read||[]);
 const rows=notifications.filter(n=>!hidden.has(n.id));
 const open=!$('notificationCenter').classList.contains('hidden');
 if(open){rows.forEach(n=>read.add(n.id));saveNotificationPrefs({hidden:[...hidden].slice(-400),read:[...read].slice(-400)});}
 const unread=rows.filter(n=>!read.has(n.id)).length;$('notificationCount').textContent=unread>99?'99+':unread;$('notificationToggle').setAttribute('aria-label','알림 센터, 미확인 '+unread+'건');
 $('notificationList').innerHTML=rows.map(n=>`<button class="notification-item" data-notification="${esc(n.id)}"><div class="notification-meta"><b>${esc(n.actor)}</b><time datetime="${esc(n.at)}" title="${esc(new Date(n.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}">${esc(new Date(n.at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'}))}</time></div><strong>${esc(n.label)}</strong><p>${esc(n.title)}</p>${n.detail?`<small>${esc(n.detail)}</small>`:''}</button>`).join('')||'<p class="muted">새로운 알림이 없습니다.</p>';
 $('notificationList').querySelectorAll('[data-notification]').forEach(b=>b.onclick=()=>openResearchNotification(notifications.find(n=>n.id===b.dataset.notification)));
}
async function openResearchNotification(n){
 if(busy)return;
 if(!n){$('notificationCenter').classList.remove('hidden');$('notificationToggle').setAttribute('aria-expanded','true');renderNotifications();return;}
 if(!['papers','conferences','meetingInfo','groupMeetings'].includes(n.type))return;
 if(!offline&&n.type!=='meetingInfo'){
  try{const res=await fetch('/api/data',{cache:'no-store'});if(!res.ok)throw Error();const result=await res.json();data=result.data;version=result.version;years();}
  catch{$('notificationCenter').classList.remove('hidden');$('notificationToggle').setAttribute('aria-expanded','true');$('notificationList').innerHTML='<p role="alert">자료를 불러오지 못했습니다. 알림을 다시 열어 시도해주세요.</p>';return;}
 }
 const p=notificationPrefs();saveNotificationPrefs({hidden:p.hidden||[],read:[...new Set([...(p.read||[]),n.id])].slice(-400)});
 tab=n.type;$('year').value='all';$('query').value=n.action==='삭제'?'':n.title;if(tab==='meetingInfo')meetingGroup='all';closeNotifications();render();renderNotifications();
}
function closeNotifications(){$('notificationCenter').classList.add('hidden');$('notificationToggle').setAttribute('aria-expanded','false');}
$('notificationToggle').onclick=()=>{const open=$('notificationCenter').classList.toggle('hidden')===false;$('notificationToggle').setAttribute('aria-expanded',String(open));renderNotifications();};
$('notificationClose').onclick=()=>{closeNotifications();$('notificationToggle').focus();};
$('notificationClear').onclick=()=>{const p=notificationPrefs();saveNotificationPrefs({read:p.read||[],hidden:[...new Set([...(p.hidden||[]),...notifications.map(n=>n.id)])].slice(-400)});renderNotifications();};
document.addEventListener('click',e=>{if(!e.target.closest('.notification-anchor'))closeNotifications();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNotifications();});
async function refreshNotifications(){if(offline||notificationRefreshPending)return;notificationRefreshPending=true;try{const res=await fetch('/api/notifications',{cache:'no-store'});if(!res.ok)return;notifications=(await res.json()).notifications||[];renderNotifications();if(tab==='meetingInfo'&&!busy)render();}catch{}finally{notificationRefreshPending=false;}}
setInterval(refreshNotifications,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshNotifications();});

function studentAccountList(){return students.length?students.map(email=>`<div class="source" style="display:flex;align-items:center;gap:10px"><div style="flex:1;min-width:0;overflow-wrap:anywhere"><strong>${esc(studentNames[email]||'학생')}</strong><div class="muted">${esc(email)}</div></div><button class="secondary" data-remove-student="${esc(email)}" ${offline?'disabled':''} aria-label="${esc(studentNames[email]||email)} 계정 삭제">삭제</button></div>`).join(''):'<p class="muted">등록된 학생 계정이 없습니다.</p>';}
async function removeStudent(email){if(busy||!admin()||offline)return;if(!confirm((studentNames[email]||email)+' 계정의 대시보드 접근권한을 삭제할까요?'))return;busy=true;try{const next=students.filter(s=>s!==email);await put('/api/students',{students:next});students=next;render();$('accountStatus').textContent='계정을 삭제했습니다. 해당 계정은 대시보드에 접근할 수 없습니다.';}catch(e){$('accountStatus').textContent=e.message;}finally{busy=false;}}

function setStudentPreview(enabled){if(user.role!=='admin'||busy)return;studentPreview=enabled;tab=enabled?'home':'settings';$('year').value='all';$('query').value='';closeNotifications();render();window.scrollTo({top:0});}

const studentResearchFields={papers:['title','year','journal','firstAuthor','correspondingAuthor','coauthors','volume','issue','pages','articleNumber','issueDate','onlineDate','doi','publicationUrl','sci','authorCount'],conferences:['date','year','presenter','coauthors','conference','scope','city','venue','title','kind','note']};
function researchChanges(before,after){const changes=[];for(const type of ['papers','conferences']){for(const old of before[type])if(!after[type].some(r=>r.id===old.id))throw Error('학생은 연구 기록을 삭제할 수 없습니다.');for(const r of after[type]){const old=before[type].find(p=>p.id===r.id);if(old&&JSON.stringify(old)===JSON.stringify(r))continue;const values=Object.fromEntries(studentResearchFields[type].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));changes.push({type,id:r.id,action:old?'edit':'add',values});}}return changes;}

function preferenceStatus(message,error=false){let el=$('preferenceStatus');if(!error){el?.remove();return;}if(!el){el=document.createElement('div');el.id='preferenceStatus';el.setAttribute('role','status');document.querySelector('.foot').before(el);}el.className=error?'note warning':'muted';el.textContent=message;if(error){const b=document.createElement('button');b.className='secondary';b.textContent='다시 저장';b.onclick=savePreferences;el.append(' ',b);}}
function savePreferences(){if(offline||studentPreview)return;const snapshot=structuredClone(preferences);prefQueue=prefQueue.catch(()=>{}).then(async()=>{const res=await fetch('/api/preferences',{method:'PUT',headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify(snapshot)});const result=await res.json();if(!res.ok)throw Error(result.error);if(version===result.previousVersion)version=result.version;preferenceStatus('개인 설정 저장됨');}).catch(e=>preferenceStatus('개인 설정 저장 실패: '+e.message,true));}
async function put(path,input){if(writePending)throw Error('처리 중입니다. 잠시 기다려주세요.');writePending=true;const d=document.createElement('dialog');d.className='processing';const deleting=path==='/api/students'&&input.students.length<students.length||input.data&&['papers','conferences','funds','reagents'].some(k=>(input.data[k]||[]).length<(data[k]||[]).length),label=deleting?'삭제 중':'저장 중';d.setAttribute('aria-label',label);d.innerHTML='<span role="status">'+label+'…</span>';d.oncancel=e=>e.preventDefault();document.body.append(d);const timer=setTimeout(()=>d.showModal(),500);try{await prefQueue;return await performPut(path,input);}finally{clearTimeout(timer);d.close();d.remove();writePending=false;}}
function viewDefaults(headers){return headers.filter(h=>tab==='papers'?['연도','논문 제목','학술지명','제1저자','교신저자','공동저자','출판일','관리','수정'].includes(h):['발표일','발표자','학회명','발표 제목','유형','관리'].includes(h));}
function applyAppearance(){document.documentElement.dataset.texture=preferences.texture||'plain';document.documentElement.dataset.accent=preferences.accent||'default';document.documentElement.dataset.layout=preferences.layout||'horizontal';$('menuHorizontal').setAttribute('aria-pressed',String(document.documentElement.dataset.layout==='horizontal'));$('menuVertical').setAttribute('aria-pressed',String(document.documentElement.dataset.layout==='vertical'));}
function paperPageUrl(r){
 const doi=String(r.doi||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'');
 if(/^10\.\d{4,9}\/\S+$/i.test(doi))return 'https://doi.org/'+encodeURI(doi).replace(/#/g,'%23').replace(/\?/g,'%3F');
 try{const url=new URL(String(r.publicationUrl||''));if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;}catch{}
 return '';
}
function paperLinkButton(r){const url=paperPageUrl(r);return url?`<a class="paper-page-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="논문 페이지 열기: ${esc(r.title)}">Link ↗</a>`:'<span class="paper-page-link unavailable" aria-disabled="true" title="DOI 또는 논문 주소가 등록되지 않았습니다">Link</span>';}
function coauthorMarkup(content,id){return `<div class="coauthor-disclosure"><div class="coauthor-text" id="${id}">${content}</div><button type="button" class="coauthor-more" aria-controls="${id}" aria-expanded="false" hidden>더보기</button></div>`;}
let coauthorResizeObserver;
function bindCoauthorDisclosure(root){
 coauthorResizeObserver?.disconnect();
 const items=[...root.querySelectorAll('.coauthor-disclosure')];
 const update=()=>items.forEach(item=>{
  if(!item.isConnected)return;
  const text=item.querySelector('.coauthor-text'),button=item.querySelector('button');
  const lineHeight=parseFloat(getComputedStyle(text).lineHeight);
  const overflow=text.scrollHeight>lineHeight*2+1;
  button.hidden=!overflow;
 });
 items.forEach(item=>{const button=item.querySelector('button');button.onclick=()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));item.classList.toggle('expanded',expanded);button.textContent=expanded?'접기':'더보기';};});
 if(typeof ResizeObserver!=='undefined'){coauthorResizeObserver=new ResizeObserver(update);items.forEach(item=>coauthorResizeObserver.observe(item.querySelector('.coauthor-text')));}
 requestAnimationFrame(update);document.fonts?.ready.then(update);
}
function enhanceView(){
 coauthorResizeObserver?.disconnect();
 const panel=$('panel');panel.querySelectorAll('button').forEach(b=>{if(/수정/.test(b.textContent)){b.classList.add('edit-action');b.style.background='';}if(/삭제/.test(b.textContent))b.classList.add('delete-action');if(/CSV/.test(b.textContent)){b.classList.add('download-action');b.textContent='↓ CSV 저장';}});
 const table=panel.querySelector('.data-table');if(!table)return;
 const customizable=false,hasLayouts=['papers','conferences'].includes(tab),headers=[...table.querySelectorAll('thead th')].map(e=>e.textContent),titleIndex=tab==='papers'?headers.indexOf('논문 제목'):tab==='conferences'?headers.indexOf('발표자'):0;
 const saved=preferences[tab]||{},selected=(saved.selected?[...saved.selected,...(headers.includes('공동저자')&&!saved.order?.includes('공동저자')?['공동저자']:[])]:viewDefaults(headers)).filter(h=>headers.includes(h)),order=[...new Set([...(saved.order||headers).filter(h=>headers.includes(h)),...headers])];
 if(headers.includes('공동저자')&&!saved.order?.includes('공동저자')){order.splice(order.indexOf('공동저자'),1);order.splice(order.indexOf('교신저자')+1,0,'공동저자');}
 if(hasLayouts){const controls=document.createElement('div');controls.className='view-controls';controls.innerHTML=`${customizable?`<div><button class="secondary" data-detail="brief" aria-pressed="${!viewDetail}">간략보기</button><button class="secondary" data-detail="full" aria-pressed="${viewDetail}">펼쳐보기</button></div>`:''}<div class="layout-options"><button class="secondary" data-layout="sheet" aria-pressed="${viewLayout==='sheet'}">시트형</button><button class="secondary" data-layout="cards" aria-pressed="${viewLayout==='cards'}">카드형</button></div>${customizable?'<button class="secondary" id="viewSettings">표시 항목 설정</button>':''}`;if(['papers','conferences'].includes(tab))panel.querySelector('.research-title-actions').prepend(controls);else table.parentElement.before(controls);controls.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{viewDetail=b.dataset.detail==='full';render();});controls.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{viewLayout=b.dataset.layout;render();});if(customizable)$('viewSettings').onclick=()=>openViewSettings(headers,selected,order);}
 if(tab==='papers'&&(viewLayout==='cards'||matchMedia('(max-width:760px)').matches)){
  const records=filter(data.papers).slice().sort((a,b)=>b.year-a.year||(b.websiteNumber||0)-(a.websiteNumber||0));
  const list=document.createElement('div');list.className='paper-archive-list';
  const author=v=>esc(v).replace(/Tae Soup Shim/g,'<strong>Tae Soup Shim</strong>');
  list.innerHTML=records.map((r,i)=>{const facts=[['권',r.volume],['호',r.issue],['페이지',[r.pages,r.articleNumber].filter(Boolean).join(' / ')],['총저자수',paperAuthorCount(r)],['온라인 공개일',r.onlineDate],['호·권 출판일',r.issueDate],['DOI',r.doi],['과제사사',r.fund]];return `<article class="paper-archive ${labPaperRole(r).highlight?'lab-paper':''}"><div class="archive-main"><div class="archive-meta"><span>No. ${i+1}</span><span>${esc(r.year)}</span><span class="archive-sci">${esc(paperSci(r)||'SCI 여부 미확인')}</span></div><h2><span class="paper-title-text">${esc(r.title)}</span> ${paperLinkButton(r)}</h2><p class="archive-journal">${esc(r.journal||'미기재')}</p><dl class="archive-authors">${[['제1저자',paperFirst(r)||'미입력'],['교신저자',paperCorresponding(r)||'미입력'],['공동저자',paperCoauthors(r)||((r.coauthors!==undefined||r.authorList?.length)?'없음':'미확인')]].map(([k,v])=>`<div><dt>${k}</dt><dd>${k==='공동저자'?coauthorMarkup(author(v),'coauthors-'+i):author(v)}</dd></div>`).join('')}</dl>${canEditResearch()?`<button class="secondary edit-action archive-edit" data-edit-paper="${data.papers.indexOf(r)}">정보 수정</button>`:''}</div><dl class="archive-facts">${facts.map(([k,v],j)=>`<div class="${j>=4?'archive-wide':''}"><dt>${k}</dt><dd>${k==='과제사사'?coauthorMarkup(esc(v??'')||'미등록','grants-'+i):esc(v??'')||'미등록'}</dd></div>`).join('')}</dl>${canEditResearch()?`<div class="archive-mobile-actions"><button class="secondary edit-action" data-edit-paper="${data.papers.indexOf(r)}">정보 수정</button></div>`:''}</article>`;}).join('');
  table.parentElement.replaceWith(list);bindCoauthorDisclosure(list);return;
 }
 table.classList.add('responsive-table');table.classList.toggle('paper-sheet',tab==='papers');
 if(tab==='papers'){const widths={'순번':3,'연도':4,'논문 제목':22,'학술지명':12,'제1저자':8,'교신저자':8,'공동저자':12,'권':3,'호':3,'페이지':5,'SCI 여부':5.5,'총저자수':5.5,'온라인공개일':8,'출판일':7,'DOI':10,'과제사사':12,'수정':5};const total=headers.reduce((n,h)=>n+(widths[h]||5),0),cols=document.createElement('colgroup');cols.innerHTML=headers.map(h=>`<col style="width:${(widths[h]||5)/total*100}%">`).join('');table.prepend(cols);}
table.parentElement.classList.toggle('card-layout',hasLayouts&&viewLayout==='cards');
 const indices=(customizable&&!viewDetail?order:headers).map(h=>headers.indexOf(h));for(const row of table.rows){const cells=[...row.cells];for(const i of indices){const cell=cells[i];cell.classList.toggle('column-hidden',customizable&&!viewDetail&&!selected.includes(headers[i])&&!['관리','수정'].includes(headers[i])&&i!==titleIndex);cell.classList.toggle('record-title',i===titleIndex);cell.classList.toggle('wide-cell',/제목|저자|장소|비고|확인/.test(headers[i]));row.append(cell);}}
 if(tab==='papers')bindCoauthorDisclosure(table);
}
function openViewSettings(headers,selected,order){
 const d=document.createElement('dialog');d.className='view-settings';let selection=[...selected],ordering=[...order],dragged=null;d.innerHTML='<h2>간략보기 표시 항목</h2><p class="muted">블록을 눌러 선택하고 드래그하여 순서를 바꾸세요. 화살표로도 이동할 수 있습니다.</p><div class="field-blocks"></div><div class="toolbar"><button data-reset="order" class="secondary">원본 정렬상태로 초기화</button><button data-reset="selection" class="secondary">기본 항목 선택</button></div><div class="toolbar"><button class="secondary" data-close>취소</button><button class="primary" data-save>저장</button></div>';
 const draw=()=>{d.querySelector('.field-blocks').innerHTML=ordering.map((h,i)=>`<div class="field-block" draggable="true" data-field="${i}"><button type="button" class="secondary" aria-pressed="${selection.includes(h)}" data-select="${i}">${esc(h)}</button><button type="button" class="secondary" data-up="${i}" aria-label="${esc(h)} 앞으로 이동" ${i===0?'disabled':''}>←</button></div>`).join('');d.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{const h=ordering[+b.dataset.select];selection=selection.includes(h)?selection.filter(x=>x!==h):[...selection,h];draw();});d.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.up;[ordering[i-1],ordering[i]]=[ordering[i],ordering[i-1]];draw();});d.querySelectorAll('[data-field]').forEach(b=>{b.ondragstart=()=>dragged=+b.dataset.field;b.ondragover=e=>{e.preventDefault();b.classList.add('drop-target');};b.ondragleave=()=>b.classList.remove('drop-target');b.ondrop=e=>{e.preventDefault();if(dragged===null)return;const h=ordering.splice(dragged,1)[0];ordering.splice(+b.dataset.field,0,h);dragged=null;draw();};});};
 d.querySelector('[data-reset=order]').onclick=()=>{ordering=[...headers];draw();};d.querySelector('[data-reset=selection]').onclick=()=>{selection=viewDefaults(headers);draw();};d.querySelector('[data-close]').onclick=()=>d.close();d.querySelector('[data-save]').onclick=()=>{preferences[tab]={selected:selection,order:ordering};savePreferences();d.close();render();};d.onclick=e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}};d.onclose=()=>d.remove();document.body.append(d);draw();d.showModal();
}

for(const [id,layout] of [['menuHorizontal','horizontal'],['menuVertical','vertical']])$(id).onclick=()=>{preferences.layout=layout;applyAppearance();savePreferences();};

function openPushTarget(value,{initial=false}={}){
 let url;try{url=new URL(value,location.origin);}catch{return;}if(url.origin!==location.origin)return;
 if(url.searchParams.get('inbox')==='1'){
  if(initial){const clean=new URL(location.href);clean.searchParams.delete('inbox');history.replaceState(history.state,'',clean.href);if(performance.getEntriesByType('navigation')[0]?.type==='reload')return;}
  openResearchNotification(null);return;
 }
 const view=url.searchParams.get('view');if(['papers','conferences','meetingInfo','groupMeetings'].includes(view))openResearchNotification({id:'push-link',type:view,action:'수정',title:(url.searchParams.get('q')||'').slice(0,500)});
}

// Shared schedule transcribed from the supplied 2026–2027 group meeting workbook.
const groupMeetingDates=[
 ['2026-10-29','랩세미나','오치영'],
 ['2026-11-12','논문발표','박진혁 · 손은지 · 박준하'],
 ['2026-11-26','랩세미나','박진혁'],
 ['2026-12-10','논문발표','오치영 · 손은지 · 박준하'],
 ['2026-12-24','랩세미나','박준하'],
 ['2027-01-07','논문발표','오치영 · 박진혁 · 손은지'],
 ['2027-01-21','랩세미나','손은지'],
 ['2027-02-04','논문발표','오치영 · 박진혁 · 박준하'],
 ['2027-02-18','랩세미나','김혜림 · 이윤서 · 김태희']
];
function upcomingGroupMeetings(now=new Date()){
 return savedGroupMeetings().map(r=>[r.date,r.kind,r.presenter,r.time,r.location,r.note]).filter(r=>Date.parse(r[0]+'T'+r[3]+':00+09:00')>now.getTime());
}
function groupMeetingCountdown(date,now=new Date()){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=key=>parts.find(p=>p.type===key).value;
 const day=value('year')+'-'+value('month')+'-'+value('day');
 const days=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000);
 return days===0?'오늘':'D−'+days;
}
function groupMeetingCards(now=new Date()){
 const upcoming=upcomingGroupMeetings(now);
 return `<section aria-label="그룹미팅 일정" class="group-meeting-summary"><div class="group-meeting-pair aurora-meetings">${[0,1].map(i=>{const r=upcoming[i];return `<article class="aurora-meeting meeting-overview" aria-label="${i===0?'이번':'다음'} 그룹미팅"><header class="meeting-overview-header"><h2>${i===0?'이번':'다음'} 그룹미팅</h2>${r?`<span class="meeting-overview-kind">${esc(r[1])}</span>`:''}</header>${r?`<div class="meeting-overview-main"><time class="meeting-overview-date" datetime="${esc(r[0])}T${esc(r[3])}:00+09:00" aria-label="${esc(r[0])} ${groupWeekday(r[0])}요일 ${esc(r[3])}">${esc(r[0].slice(5).replace('-','.'))}</time><div class="meeting-overview-details"><span class="meeting-overview-time">${esc(r[3])}</span><span class="meeting-overview-place">${esc(r[4])}</span></div></div><div class="meeting-overview-presenters">${esc(r[2])}</div>`:'<div class="aurora-meeting-empty">등록된 일정 없음</div>'}</article>`;}).join('')}</div></section>`;
}
let groupDraft=null;
function savedGroupMeetings(){return (data.groupMeetings===undefined?groupMeetingDates.map((r,i)=>({id:'initial-'+i,date:r[0],kind:r[1],presenter:r[2],time:'15:00',location:'팔달관 1000호',note:''})):data.groupMeetings).map(r=>({...r,location:r.location||'팔달관 1000호'})).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));}
function groupWeekday(date){return ['일','월','화','수','목','금','토'][new Date(date+'T12:00:00+09:00').getUTCDay()];}
document.addEventListener('click',event=>{if(event.target.closest('[data-group-schedule]')){tab='groupMeetings';render();}});
let groupMeetingUpcomingKey=upcomingGroupMeetings().map(r=>r[0]).join(',');
function refreshGroupMeetingSchedule(){
 const key=upcomingGroupMeetings().map(r=>r[0]).join(',')+'|'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 if(key!==groupMeetingUpcomingKey){groupMeetingUpcomingKey=key;if(['home','groupMeetings'].includes(tab)&&!busy&&!groupDraft&&!gameNightDraft)render();}
}
setInterval(refreshGroupMeetingSchedule,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshGroupMeetingSchedule();});

function homepageAdminSettings(){if(!admin()||!user.canManageHomepage)return '';return `<section class="section-card"><h2>홈페이지 관리자 설정</h2><p class="muted">선택한 계정은 홈페이지 관리 탭에서 논문·연구·멤버·뉴스·갤러리를 수정할 수 있습니다. 관리자 지정·해제는 교수님만 가능합니다.</p><label style="display:block;margin:10px 0"><input type="checkbox" checked disabled> ${esc(user.email)} · 교수님 (항상 유지)</label>${students.filter(email=>email!==user.email).map(email=>`<label style="display:block;margin:10px 0"><input type="checkbox" name="homepageAdmin" value="${esc(email)}" ${homepageAdmins.includes(email)?'checked':''}> ${esc(studentNames[email]||email)}${studentNames[email]?' · '+esc(email):''}</label>`).join('')}<p class="muted">새 이메일은 아래 학생 접근 계정에 먼저 추가해주세요.</p><button class="primary" id="saveHomepageAdmins" ${offline?'disabled':''}>홈페이지 관리자 저장</button><p role="status" id="homepageAdminStatus"></p></section>`;}
async function saveHomepageAdmins(){if(!admin()||offline)return;const button=$('saveHomepageAdmins');button.disabled=true;const emails=[user.email,...[...document.querySelectorAll('input[name="homepageAdmin"]:checked')].map(e=>e.value)];try{await put('/api/homepage-admins',{emails});homepageAdmins=emails;render();$('homepageAdminStatus').textContent='홈페이지 관리자 권한을 저장했습니다.';}catch(error){$('homepageAdminStatus').textContent=error.message;}finally{button.disabled=false;}}

// Retire only this dashboard's legacy browser push registration.
async function retireDesktopNotifications(){
 if(offline||!navigator.serviceWorker)return;
 try{for(const registration of await navigator.serviceWorker.getRegistrations()){
  const worker=registration.active||registration.waiting||registration.installing;if(!worker)continue;
  const url=new URL(worker.scriptURL);if(url.origin!==location.origin||!['/service-worker.js','/dashboard/service-worker.js'].includes(url.pathname))continue;
  try{await (await registration.pushManager?.getSubscription())?.unsubscribe();}catch{}
  try{for(const n of await registration.getNotifications())n.close();}catch{}
  await registration.unregister();
 }}catch{}
}

function desktopDownloads(){return `<section class="section-card desktop-downloads" id="desktopDownloads"><div class="download-heading"><div><h2>앱 다운로드</h2><p class="muted">사용하는 기기에 맞는 연구실 대시보드 앱을 다운로드하세요.</p></div></div><div class="download-options"><div><a class="primary desktop-download hidden" id="downloadMac" href="/downloads/mac" download>Mac용 다운로드 <span aria-hidden="true">↓</span></a><button class="secondary" id="downloadMacPending" disabled>Mac용 · 확인 중</button><p class="muted" id="downloadMacInfo"></p></div><div><a class="primary desktop-download hidden" id="downloadPC" href="/downloads/pc" download>PC용 다운로드 <span aria-hidden="true">↓</span></a><button class="secondary" id="downloadPCPending" disabled>PC용 · 확인 중</button><p class="muted" id="downloadPCInfo"></p></div><div><a class="primary desktop-download hidden" id="downloadAndroid" href="/downloads/android" download>Android용 다운로드 <span aria-hidden="true">↓</span></a><button class="secondary" id="downloadAndroidPending" disabled>Android용 · 확인 중</button><p class="muted" id="downloadAndroidInfo"></p></div></div><p class="muted" id="downloadNotice">항상 최신 배포 버전으로 연결됩니다.</p></section>`;}
async function loadDesktopDownloads(){
 const section=document.getElementById('desktopDownloads');if(!section)return;
 try{const response=await fetch('/downloads/manifest',{cache:'no-store'});if(!response.ok)throw Error();const releases=await response.json();if(!section.isConnected)return;
 for(const [platform,label] of [['mac','Mac'],['pc','PC'],['android','Android']]){const release=releases[platform],link=section.querySelector('#download'+label),pending=section.querySelector('#download'+label+'Pending'),info=section.querySelector('#download'+label+'Info');if(release){link.classList.remove('hidden');pending.classList.add('hidden');info.textContent=`v${release.version} · ${release.platform}`;}else{pending.textContent=label+'용 · 준비 중';info.textContent=platform==='pc'?'Windows용 앱을 준비 중입니다.':platform==='android'?'Android용 앱을 준비 중입니다.':'설치 파일을 준비 중입니다.';}}
 if(Object.values(releases).some(r=>r?.preview))section.querySelector('#downloadNotice').textContent='최신 배포 버전으로 연결됩니다. 현재 Mac 앱은 시험 버전이며 정식 서명·공증 전입니다.';
 }catch{if(section.isConnected){for(const label of ['Mac','PC','Android'])section.querySelector('#download'+label+'Pending').textContent=label+'용 · 확인 불가';section.querySelector('#downloadNotice').textContent='다운로드 정보를 불러오지 못했습니다. 잠시 후 다시 접속해주세요.';}}
}

function yearAndGameNight(){
 const year=Number(calendarDay('Asia/Seoul',new Date()).slice(0,4)),papers=data.papers.filter(r=>Number(r.year)===year).length,conferences=data.conferences.filter(r=>Number(r.year)===year).length,g=nextGameNight();
 return `<div class="year-game-row"><section class="year-aurora" aria-label="올해 연구 실적"><h2>${year}년 연구 활동</h2><div class="year-metrics"><div class="year-metric"><span>등록 논문</span><b>${papers}</b><small>건</small></div><div class="year-metric"><span>학회 발표</span><b>${conferences}</b><small>건</small></div></div></section><section class="game-galaxy" aria-label="NISML Game Night"><h2 class="game-overview-heading"><span class="game-overview-title">NISML Game Night</span><span class="game-season-label">${esc(gameSeasonLabel(g.month||calendarDay('Asia/Seoul',new Date()).slice(0,7)))}</span></h2><div class="game-facts"><div><small>날짜</small><strong>${esc(g.date?g.date.replaceAll('-','.'):(g.month?g.month.replace('-','.')+' · 날짜 미정':'일정 미정'))}</strong></div><div><small>게임 종류</small><strong>${esc(g.game||'추후 안내')}</strong></div></div><div class="game-stars" aria-hidden="true">${[[5,15],[27,8],[50,16],[72,10],[94,20],[89,78],[61,88],[32,92],[6,80]].map(([x,y],i)=>`<span style="left:${x}%;top:${y}%;animation-delay:-${i*.4}s">✦</span>`).join('')}</div></section></div>`;
}
let gameNightDraft=null,gameSelectedSeason='';
function gameSeasonKey(month){return month.slice(0,4)+'-'+(Number(month.slice(5,7))<=6?'SS':'FW');}
function gameSeasonLabel(month){return gameSeasonKey(month).replace('-SS',' S/S').replace('-FW',' F/W');}
function savedGameNights(){if(Array.isArray(data.gameNights))return data.gameNights;const old=data.gameNight;if(old&&(old.date||old.game))return [{month:old.date?old.date.slice(0,7):calendarDay('Asia/Seoul',new Date()).slice(0,7),date:old.date||'',game:old.game||''}];return [];}
function nextGameNight(){const today=calendarDay('Asia/Seoul',new Date());return savedGameNights().filter(r=>(r.date?r.date>=today:r.month>=today.slice(0,7))&&(r.date||r.game)).sort((a,b)=>a.month.localeCompare(b.month))[0]||{};}
function gameNightEditor(){
 const current=gameSeasonKey(calendarDay('Asia/Seoul',new Date()).slice(0,7)),selected=gameSelectedSeason||current,rows=savedGameNights(),year=Number(selected.slice(0,4)),start=selected.endsWith('SS')?1:7;
 const seasons=[...new Set([current,selected,...rows.map(r=>gameSeasonKey(r.month))])].sort().reverse();
 return `<section class="game-night-editor"><div class="planner-heading"><div><h2>NISML Game Night</h2><small>${year}.${String(start).padStart(2,'0')}–${year}.${String(start+5).padStart(2,'0')}</small></div><button class="primary" data-game-edit ${offline||studentPreview?'disabled':''}>수정</button></div><div class="toolbar game-season-toolbar"><div><button class="secondary" data-game-step="-1" aria-label="이전 시즌">‹</button><select id="gameSeasonSelect" aria-label="게임나잇 시즌">${seasons.map(key=>`<option value="${key}" ${key===selected?'selected':''}>${key.replace('-SS',' S/S').replace('-FW',' F/W')}</option>`).join('')}</select><button class="secondary" data-game-step="1" aria-label="다음 시즌">›</button><button class="secondary" data-game-current>이번 시즌</button></div></div><div class="meeting-month-board game-season-board">${Array.from({length:6},(_,i)=>{const month=year+'-'+String(start+i).padStart(2,'0'),r=rows.find(r=>r.month===month)||{date:'',game:''};return `<section class="meeting-month"><h3>${start+i}월</h3><article class="game-season-memo ${!r.date&&!r.game?'is-empty':''}"><div class="game-season-date">${r.date?`<time datetime="${esc(r.date)}">${esc(r.date.slice(5).replace('-','.'))}</time>`:'날짜 미정'}</div><div class="game-season-game">${esc(r.game||'게임 미정')}</div></article></section>`;}).join('')}</div></section>`;
}
function openGameNightEditor(){
 if(busy||offline||studentPreview)return;
 const selected=gameSelectedSeason||gameSeasonKey(calendarDay('Asia/Seoul',new Date()).slice(0,7)),year=Number(selected.slice(0,4)),start=selected.endsWith('SS')?1:7;
 gameNightDraft=structuredClone(savedGameNights());let dirty=false;
 const d=document.createElement('dialog');d.className='meeting-planner-dialog game-season-dialog';d.setAttribute('aria-label',selected.replace('-SS',' S/S').replace('-FW',' F/W')+' 게임나잇 수정');
 d.innerHTML=`<header><div><h2>${selected.replace('-SS',' S/S').replace('-FW',' F/W')} Game Night 수정</h2><small>시즌 전체 일정</small></div><button type="button" data-game-close aria-label="게임나잇 편집 닫기">×</button></header><div class="game-months">${Array.from({length:6},(_,i)=>{const month=year+'-'+String(start+i).padStart(2,'0'),r=gameNightDraft.find(r=>r.month===month)||{date:'',game:''},last=new Date(Date.UTC(year,start+i,0)).getUTCDate();return `<div class="game-month" data-game-month="${month}"><strong>${start+i}월</strong><label>날짜<input data-game-field="date" type="date" min="${month}-01" max="${month}-${last}" value="${esc(r.date)}" aria-label="${start+i}월 날짜"></label><label>게임 종류<input data-game-field="game" maxlength="120" value="${esc(r.game)}" placeholder="게임 종류 입력" aria-label="${start+i}월 게임 종류"></label></div>`;}).join('')}</div><footer><span role="status">기존 일정은 저장 전까지 변경되지 않습니다.</span><button type="button" data-game-close>취소</button><button type="button" class="primary" data-game-save>확정·저장</button></footer>`;
 const status=t=>d.querySelector('[role=status]').textContent=t;
 const close=()=>{if(!busy&&(!dirty||confirm('저장하지 않은 변경을 취소할까요?')))d.close();};
 d.addEventListener('cancel',e=>{e.preventDefault();close();});d.onclose=()=>{gameNightDraft=null;d.remove();};
 d.addEventListener('input',()=>{dirty=true;status('저장하지 않은 변경사항이 있습니다.');});
 d.addEventListener('click',async e=>{const button=e.target.closest('button');if(!button||busy)return;if(button.hasAttribute('data-game-close')){close();return;}if(!button.hasAttribute('data-game-save'))return;
  for(const input of d.querySelectorAll('input'))if(!input.reportValidity())return;
  const next=gameNightDraft.filter(r=>gameSeasonKey(r.month)!==selected);
  d.querySelectorAll('[data-game-month]').forEach(row=>{const r={month:row.dataset.gameMonth,date:row.querySelector('[data-game-field=date]').value,game:row.querySelector('[data-game-field=game]').value.trim()};if(r.date||r.game)next.push(r);});
  busy=true;button.disabled=true;try{await put('/api/game-nights',{gameNights:next});data.gameNights=next;dirty=false;d.close();render();}catch(error){status(error.message);}finally{busy=false;button.disabled=false;}
 });document.body.append(d);d.showModal();
}
document.addEventListener('change',e=>{if(e.target.id==='gameSeasonSelect'){gameSelectedSeason=e.target.value;render();}});
document.addEventListener('click',e=>{
 if(e.target.closest('[data-game-edit]')){openGameNightEditor();return;}
 const step=e.target.closest('[data-game-step]'),current=e.target.closest('[data-game-current]');if(step||current){const key=gameSelectedSeason||gameSeasonKey(calendarDay('Asia/Seoul',new Date()).slice(0,7));let n=Number(key.slice(0,4))*2+(key.endsWith('FW')?1:0)+(step?Number(step.dataset.gameStep):0);n=Math.min(4401,Math.max(4000,n));gameSelectedSeason=current?gameSeasonKey(calendarDay('Asia/Seoul',new Date()).slice(0,7)):Math.floor(n/2)+'-'+(n%2?'FW':'SS');render();}
});

matchMedia('(max-width:760px)').addEventListener('change',()=>{if(tab==='papers'&&!busy)render();});

// Refresh shared data without reloading the WebView or replaying the startup screen.
async function refreshDashboardFromPull(){
 if(offline)throw Error('오프라인에서는 새로고침할 수 없습니다.');
 await prefQueue;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/data',{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error(response.status===401?'다시 로그인해 주세요.':'연결을 확인하고 다시 당겨 주세요.');
  const result=await response.json();
  if(!result.data||!result.user)throw Error('데이터를 불러오지 못했습니다.');
  const selectedYear=$('year').value;
  ({data,user,version,students}=result);studentNames=result.studentNames||{};homepageAdmins=result.homepageAdmins||[];
  notifications=result.notifications||[];labLeadAuthor=result.labLeadAuthor||'';labMemberAuthors=result.labMemberAuthors||[];
  years();if([...$('year').options].some(o=>o.value===selectedYear))$('year').value=selectedYear;
  renderNotifications();render();$('panel').scrollTop=0;
 }catch(error){if(error.name==='AbortError')throw Error('연결이 지연됩니다. 다시 당겨 주세요.');throw error;}
 finally{clearTimeout(timer);}
}
