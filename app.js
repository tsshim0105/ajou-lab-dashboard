const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n==null?'미기재':Number(n).toLocaleString('ko-KR')+'원',count=n=>Number(n).toLocaleString('ko-KR');
let notifications=[];
let data=LabData.empty(),user={role:'student'},version=0,students=[],studentNames={},labLeadAuthor='',labMemberAuthors=[],tab='home',meetingGroup='all',fundTab='internal',term='2026-2 인건비(안)',busy=false,exportRows=[];
let studentPreview=false;
const offline=!!globalThis.LAB_PREVIEW,admin=()=>user.role==='admin'&&!studentPreview;
const canEditResearch=()=>['admin','student'].includes(user.role);
const menu=[['home','연구실 현황'],['papers','논문'],['conferences','학회 발표'],['meetingInfo','학술대회 정보'],['funds','연구비'],['payroll','인건비'],['settings','자료·계정 관리']];
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
function matchesResearch(r,query){const q=searchKey(query);if(!q)return true;const paper=data.papers.includes(r);const text=paper?[r.title,r.journal,r.citation,r.doi,r.year,r.volume,r.issue,r.pages,r.articleNumber,r.onlineDate,r.issueDate,paperFirst(r),paperCorresponding(r),...(r.authorList||[]).map(a=>a.name)].join(' '):JSON.stringify(r);const haystack=searchKey(text);if(haystack.includes(q))return true;return authorAliases().filter(a=>searchKey(a.korean)===q).some(a=>haystack.includes(searchKey(a.english)));}
const badge=s=>`<span class="badge">${esc(s)}</span>`;
function table(headers,rows,classes=[],rowClasses=[]){if(!rows.length)return '<div class="empty">선택한 조건에 해당하는 자료가 없습니다.</div>';return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,ri)=>`<tr class="${esc(rowClasses[ri]||'')}">${row.map((v,i)=>`<td class="${classes[i]||''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
const card=(label,value,note)=>`<div class="card"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span>${note?`<small>${esc(note)}</small>`:''}</div>`;
function bar(label,value,max,light=false){return `<div class="bar-row"><span>${esc(label)}</span><div class="track"><div class="fill ${light?'light':''}" style="width:${max?value/max*100:0}%"></div></div><strong>${count(value)}</strong></div>`;}
function nav(){ $('tabs').innerHTML=menu.filter(([k])=>admin()||['home','papers','conferences','meetingInfo'].includes(k)).map(([k,v])=>`<button class="tab ${k===tab?'active':''}" data-tab="${k}" aria-current="${k===tab?'page':'false'}">${v}</button>`).join('');$('filters').classList.toggle('hidden',!['papers','conferences'].includes(tab));$('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.tab==='papers'&&tab!=='papers')$('year').value='all';tab=b.dataset.tab;render();});}
function years(){const old=$('year').value;const list=[...new Set([...data.papers,...data.conferences].map(r=>r.year).filter(Boolean))].sort((a,b)=>b-a);$('year').innerHTML='<option value="all">전체 연도</option>'+list.map(y=>`<option>${y}</option>`).join('');$('year').value=list.includes(Number(old))?old:'all';}
function render(){if(!admin()&&!['home','papers','conferences','meetingInfo'].includes(tab))tab='home';$('userLabel').innerHTML=badge(studentPreview?'학생 화면 미리보기':admin()?'교수님':'연구실 구성원');nav();exportRows=[];const panel=$('panel'),p=tab==='home'?homePeriod(data.papers):filter(data.papers),c=tab==='home'?homePeriod(data.conferences):filter(data.conferences);const title=tab==='home'?'연구실 현황 (2015년~현재)':menu.find(([k])=>k===tab)[1];let html=['papers','conferences'].includes(tab)?`<div class="research-title"><h1>${title}</h1><div class="research-title-actions">${canEditResearch()?`<button class="primary" id="${tab==='papers'?'addPaper':'addConference'}">${tab==='papers'?'논문추가':'발표 내역 추가'}</button>`:''}<button class="secondary" id="csv">CSV 저장</button></div></div>`:`<h1>${title}</h1>`;
 if(tab==='home'){
  const awards=c.filter(r=>/우수|수상|최우수/.test(r.note));html+=`<div class="cards">${card('등록 논문',p.length+'건','2015년~현재')}${card('학회 발표 기록',c.length+'건','2015년~현재')}${card('발표자',new Set(c.map(r=>r.presenter)).size+'명','해당 기간의 고유 발표자')}${card('수상 표시 기록',awards.length+'건','비고에 수상·우수 표시')}</div>`;
  const ys=[...new Set([...p,...c].map(r=>r.year))].sort((a,b)=>b-a),counts=ys.map(y=>({year:y,p:p.filter(r=>r.year===y).length,c:c.filter(r=>r.year===y).length})),max=Math.max(1,...counts.flatMap(r=>[r.p,r.c]));
  const recent=p.filter(r=>labPaperRole(r).recent).sort((a,b)=>b.year-a.year||(b.issueDate||b.onlineDate||'').localeCompare(a.issueDate||a.onlineDate||'')||(b.websiteNumber||0)-(a.websiteNumber||0)).slice(0,4);
  html+=`<div class="grid home-recent"><div class="section-card"><h2>최근 논문 현황</h2><p class="muted">연구실 구성원이 제1저자 또는 교신저자인 논문</p>${recent.map(r=>`<div class="event"><div class="event-date">${esc(r.year)}</div><div><strong style="font-size:16px">${esc(r.title)}</strong><p style="font-size:16px;font-weight:700;margin-top:8px">제1저자: ${esc(paperFirst(r)||'미입력')}</p><p class="muted">교신저자: ${esc(paperCorresponding(r)||'미입력')}</p><small class="muted">${esc(r.journal||'학술지 미기재')}</small>${canEditResearch()?`<div><button class="secondary" data-edit-paper="${data.papers.indexOf(r)}">수정</button></div>`:''}</div></div>`).join('')||'<p class="muted">해당 조건의 논문이 없습니다.</p>'}</div><div class="section-card"><h2>최근 발표 현황</h2>${[...c].sort((a,b)=>b.year-a.year||(b.date||'').localeCompare(a.date||'')).slice(0,4).map(r=>`<div class="event"><div class="event-date">${esc(r.year)}<br>${esc(r.date?.slice(5)||'날짜 미상')}</div><div><strong style="font-size:20px">${esc(r.presenter)}</strong><p style="font-size:16px;font-weight:600;margin:8px 0">${esc(r.title||'발표 제목 미기재')}</p><small class="muted">${esc(r.conference)}</small></div></div>`).join('')||'<p class="muted">등록된 발표가 없습니다.</p>'}</div></div><div class="section-card"><h2>연도별 연구 기록</h2>${counts.length?counts.map(r=>bar(r.year+' 논문',r.p,max)+bar('발표',r.c,max,true)).join(''):'<p class="muted">등록된 연구 기록이 없습니다.</p>'}<div class="legend"><span><i class="swatch"></i>등록 논문</span><span><i class="swatch light"></i>발표 기록</span></div></div>`;
 }else if(tab==='papers'){
  html+='<div class="note">옅은 초록색: 연구실 학생이 제1저자이거나 교수님이 교신저자인 논문. 자료·계정 관리에 등록한 국문명으로도 검색할 수 있습니다.</div>';
  const headers=['순번','연도','논문 제목','학술지명','제1저자','교신저자','권','호','페이지','SCI 여부','총저자수','온라인공개일','출판일'];
  const records=p.slice().sort((a,b)=>b.year-a.year||(b.websiteNumber||0)-(a.websiteNumber||0));
  const rows=records.map((r,i)=>[i+1,r.year,r.title,r.journal||'미기재',paperFirst(r)||'미입력',paperCorresponding(r)||'미입력',r.volume||'—',r.issue||'—',[r.pages,r.articleNumber].filter(Boolean).join(' / ')||'—',r.sci||'미확인',paperAuthorCount(r)??'미확인',r.onlineDate||'미확인',r.issueDate||'미확인']);exportRows=[headers,...rows];
  html+=toolbar(rows.length)+table([...headers,...(canEditResearch()?['수정']:[])],rows.map((row,i)=>{const cells=row.map(esc),r=records[i];
   if(/^https:\/\//i.test(r.publicationUrl||''))cells[2]=`<a href="${esc(r.publicationUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a>`;
   cells[12]=`<span title="${esc(r.bibliographyDateBasis||'')}">${esc(row[12])}</span>`;
   if(canEditResearch())cells.push(`<button class="primary green" data-edit-paper="${data.papers.indexOf(r)}">수정</button>`);return cells;}),['nowrap','nowrap','title','title','title','title','nowrap','nowrap','nowrap','nowrap','nowrap','nowrap','nowrap','nowrap'],records.map(r=>labPaperRole(r).highlight?'lab-paper':''));
 }else if(tab==='conferences'){
  const records=c.slice().sort((a,b)=>b.year-a.year||(b.date||'').localeCompare(a.date||''));const headers=['발표일','발표자','학회명','국내/국제','지역','장소','발표 제목','유형','비고'];const rows=records.map(r=>[r.date||'미기재',r.presenter,r.conference,conferenceScope(r)||'미기재',conferenceCity(r)||'미기재',r.venue||'미기재',r.title||'미기재',r.kind,r.note]);exportRows=[headers,...rows];html+=(canEditResearch()?'<p class="muted">행의 수정 버튼을 누르면 표에서 바로 편집할 수 있습니다.</p>':'')+toolbar(rows.length)+table([...headers,...(canEditResearch()?['관리']:[])],rows.map((r,i)=>[...r.map(esc),...(canEditResearch()?[`<button class="secondary" style="white-space:nowrap" data-conf="${data.conferences.indexOf(records[i])}">수정</button>`]:[])]),['nowrap','nowrap','title','nowrap','nowrap','title','title','nowrap','']);
 }else if(tab==='meetingInfo'){
  html+=renderMeetingInfo();
 }else if(tab==='funds'){
  html+=`<div class="tabs" role="tablist" aria-label="연구비 구분" style="margin-bottom:20px">${[['internal','교내연구비'],['external','교외연구비']].map(([key,label])=>`<button class="tab ${fundTab===key?'active':''}" role="tab" aria-selected="${fundTab===key}" data-fund-tab="${key}">${label}</button>`).join('')}</div><div class="note">직접 입력한 지출은 기존 기록 잔액에서 차감합니다. 이미 반영된 지출은 중복 입력하지 마세요.</div><div class="toolbar"><button class="primary" id="addFund">연구비 항목 추가</button></div><p id="fundStatus" role="status"></p>`;
  sortedFundItems(data.funds).forEach(({f,fi})=>{if((f.category||'internal')!==fundTab)return;const entries=f.entries||[],added=entries.reduce((s,e)=>s+e.amount,0),spend=(f.manual||f.initialEdited)?f.total-f.balance:f.months.reduce((s,m)=>s+m.spend,0);html+=`<div class="section-card fund-card"><div class="fund-top"><div class="fund-heading"><h2 style="margin:0">${esc(f.title)} ${fundCountdown(f.endDate)} ${f.closed?badge('사용완료 메모'):''}</h2>${!f.closed?`<button class="primary" data-expense="${fi}">지출 입력</button>`:''}</div><div class="toolbar fund-actions"><label>연구비 구분 <select data-fund-category="${fi}" aria-label="${esc(f.title)} 연구비 구분"><option value="internal" ${(f.category||'internal')==='internal'?'selected':''}>교내연구비</option><option value="external" ${f.category==='external'?'selected':''}>교외연구비</option></select></label><button class="primary" style="background:#15803d;color:#fff" data-edit-fund="${fi}">수정</button><button class="primary" style="background:#c62828;color:#fff" data-delete-fund="${fi}">항목삭제</button></div></div><p class="muted fund-end-date">연구비 종료일: <span>${esc(f.endDate||'미등록')}</span>${f.note?`<span class="fund-note">비고: ${esc(f.note)}</span>`:''}</p><div class="cards" style="grid-template-columns:repeat(3,1fr)">${card('등록 총액',money(f.total),'')}${card('누적 지출',money(spend+added),'')}${card('잔액',money(f.balance==null?null:f.balance-added),'')}</div><details class="fund-expenses"><summary>상세 지출 내역 <span class="muted">(${f.months.length+entries.length}건)</span></summary>${renderFundExpenses(f,fi)}</details></div>`;});
  if(!data.funds.some(f=>(f.category||'internal')===fundTab))html+='<div class="empty">연구비 항목을 추가하거나 엑셀 파일을 등록해주세요.</div>';
 }else if(tab==='payroll'){
  const terms=[...new Set(data.payroll.map(r=>r.term))];if(!terms.includes(term))term=terms[0]||'';const rs=data.payroll.filter(r=>r.term===term);html+=`<div class="toolbar"><label>지급 계획 <select id="term">${terms.map(t=>`<option ${t===term?'selected':''}>${esc(t)}</option>`).join('')}</select></label>${badge('교수님 전용')}</div><div class="note warning">지급계획표를 표시하며 실제 지급 완료를 의미하지 않습니다. (안) 표기를 유지하고, 월 합계와 학기 금액이 다르더라도 원본 값을 임의로 바꾸지 않았습니다.</div><div class="cards" style="grid-template-columns:repeat(3,1fr)">${card('계획 행 수',rs.length+'명분','xxx 등 미정 인원 포함')}${card('월 합계',money(rs.reduce((s,r)=>s+(r.monthly||0),0)),'원본 H열 합계')}${card('학기 합계',money(rs.reduce((s,r)=>s+(r.semester||0),0)),'원본 I열 합계')}</div>`;
  const headers=['이름','과정 / 장학','기준 월급','핵심연구A','기관계정','SRC','월 합계','학기 금액','확인'];const rows=rs.map(r=>[r.name,r.degree+' / '+r.scholarship,money(r.base),money(r.core),money(r.institution),money(r.src),money(r.monthly),money(r.semester),r.monthly*6!==r.semester?'월×6 불일치':r.name==='xxx'?'미정 인원':r.note]);exportRows=[headers,...rows];html+=toolbar(rows.length)+table(headers,rows.map(r=>r.map(esc)),['nowrap','nowrap','money','money','money','money','money','money','title']);
  html+='<details><summary>2026 과정별 지급 기준</summary>'+table(['과정','기본 월 인건비','BK 지원금','BK 포함 월 수령액','등록금 고려 월액'],data.standards.map(r=>[esc(r.degree),money(r.base),money(r.bk),money(r.total),money(r.afterTuition)]),['','money','money','money','money'])+'</details>';
 }else{
  html+=`<section class="section-card"><h2>학생 화면 미리보기</h2><p class="muted">학생에게 보이는 네 개 탭과 조회 화면을 확인합니다.</p><button class="primary" id="previewStudent">학생 화면 미리보기</button></section>`+nameMappingForm()+`<div class="grid"><div class="section-card"><h2>엑셀 자료 갱신</h2><p class="muted">기존 양식의 파일을 선택하면 해당 자료만 교체합니다. 논문·학회·연구비·인건비 파일을 한 번에 선택할 수 있습니다.</p><label class="primary green" style="display:inline-block;cursor:pointer">엑셀 선택<input class="hidden" id="upload" type="file" accept=".xlsx" multiple></label><p id="uploadStatus" class="status" role="status"></p>${data.sources.map(s=>`<div class="source"><strong>${esc(s.name)}</strong><div class="muted">불러온 날짜 ${esc(s.importedAt.slice(0,10))}</div></div>`).join('')}<p class="muted">현재는 파일 업로드 방식입니다. 구글 시트 자동 동기화는 아직 연결하지 않았습니다.</p></div><div class="stack"><div class="section-card"><h2>학생 접근 계정</h2><p class="muted">학생은 네 개 연구 탭을 이용하고 논문·학회 발표를 추가·수정할 수 있습니다.</p>${studentAccountList()}<label for="students">학생 이메일 · 한 줄에 한 명</label><textarea id="students" rows="5" style="width:100%;margin:10px 0" placeholder="student@ajou.ac.kr">${esc(students.join('\n'))}</textarea><button id="saveStudents" class="primary" ${offline?'disabled':''}>접근 목록 저장</button><p class="muted">${offline?'검토용 파일에서는 계정 설정을 저장할 수 없습니다.':'Sites에서 사이트 공유 권한도 별도로 부여해야 합니다.'}</p><p class="status" id="accountStatus" role="status"></p></div></div></div>`;
 }
 panel.innerHTML=(studentPreview?`<div class="note" role="status" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><strong>학생 화면 미리보기 · 저장 미적용</strong><button class="primary" id="exitStudentPreview">관리자 화면으로 돌아가기</button></div>`:'')+html;
 if($('previewStudent'))$('previewStudent').onclick=()=>setStudentPreview(true);
 if($('exitStudentPreview'))$('exitStudentPreview').onclick=()=>setStudentPreview(false);
 if($('nameMappingForm'))bindNameMappings();
 if($('addPaper'))$('addPaper').onclick=()=>editPaper();
 panel.querySelectorAll('[data-edit-paper]').forEach(b=>b.onclick=()=>editPaper(Number(b.dataset.editPaper)));
 panel.querySelectorAll('[data-paper-author]').forEach(b=>b.onclick=()=>editPaperAuthor(Number(b.dataset.paperAuthor)));
 panel.querySelectorAll('[data-meeting-group]').forEach(b=>b.onclick=()=>{meetingGroup=b.dataset.meetingGroup;render();});
 panel.querySelectorAll('[data-fund-tab]').forEach(b=>b.onclick=()=>{if(!busy){fundTab=b.dataset.fundTab;render();}});panel.querySelectorAll('[data-edit-fund]').forEach(b=>b.onclick=()=>editFund(Number(b.dataset.editFund)));panel.querySelectorAll('[data-delete-fund]').forEach(b=>b.onclick=()=>deleteFund(Number(b.dataset.deleteFund)));panel.querySelectorAll('[data-fund-category]').forEach(el=>el.onchange=()=>changeFundCategory(Number(el.dataset.fundCategory),el));
 if($('addConference'))$('addConference').onclick=()=>editConference();panel.querySelectorAll('[data-conf]').forEach(b=>b.onclick=()=>editConferenceRow(Number(b.dataset.conf),b.closest('tr')));if($('addFund'))$('addFund').onclick=addFund;panel.querySelectorAll('[data-expense]').forEach(b=>b.onclick=()=>editExpense(Number(b.dataset.expense),b.dataset.entry===undefined?null:Number(b.dataset.entry)));
 if($('term'))$('term').onchange=e=>{term=e.target.value;render();};if($('csv'))$('csv').onclick=download;
 if($('upload'))$('upload').onchange=upload;if($('saveStudents'))$('saveStudents').onclick=saveStudents;panel.querySelectorAll('[data-remove-student]').forEach(b=>b.onclick=()=>removeStudent(b.dataset.removeStudent));
 const dates=data.sources.filter(s=>admin()||['papers','conferences'].includes(s.type)).map(s=>s.importedAt).sort();$('sourceDate').textContent=dates.length?'자료 불러온 날짜 '+dates.at(-1).slice(0,10):'원본 자료 미등록';
}
function toolbar(n){return `<div class="toolbar"><span class="muted">${count(n)}개 기록</span>${['papers','conferences'].includes(tab)?'':'<button class="secondary" id="csv">현재 표 CSV 저장</button>'}</div>`;}
function download(){const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const b=new Blob(['\ufeff'+exportRows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='연구실_'+tab+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function put(path,input){if(studentPreview)throw Error('학생 화면 미리보기에서는 자료를 변경할 수 없습니다.');if(user.role==='student'&&path==='/api/data'){input={changes:researchChanges(data,input.data)};path='/api/research';}const res=await fetch(path,{method:'PUT',headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify({version,...input})});const result=await res.json();if(!res.ok)throw Error(result.error);version=result.version;if(result.notifications){notifications=result.notifications;renderNotifications();}}
async function upload(e){if(busy)return;const input=e.target;busy=true;input.disabled=true;const files=[...input.files];$('uploadStatus').textContent='엑셀을 읽고 있습니다…';try{let updated=structuredClone(data);for(const f of files){const sheets=await LabData.readXlsx(f);updated=LabData.merge(updated,LabData.normalize(sheets,f.name));}if((data.conferences.some(r=>r.manual)||data.funds.some(f=>f.manual||f.initialEdited||f.entries?.length))&&!confirm('엑셀 자료 교체 시 해당 분류의 직접 입력·수정 내역이 사라질 수 있습니다. 계속할까요?')){ $('uploadStatus').textContent='자료 교체를 취소했습니다.';return;}if(!offline)await put('/api/data',{data:updated});data=updated;years();render();$('uploadStatus').textContent=offline?'이 검토 화면에 반영했습니다. 파일을 다시 열면 원래 사본으로 돌아갑니다.':'자료를 저장했습니다.';}catch(err){$('uploadStatus').textContent=err.message;}finally{busy=false;input.disabled=false;input.value='';}}
async function saveStudents(){const b=$('saveStudents');b.disabled=true;try{const next=$('students').value.split(/\s+/).filter(Boolean);await put('/api/students',{students:next});students=next;render();$('accountStatus').textContent='접근 목록을 저장했습니다.';}catch(e){$('accountStatus').textContent=e.message;}finally{b.disabled=false;}}
$('year').onchange=render;$('query').oninput=render;$('reset').onclick=()=>{$('year').value='all';$('query').value='';render();};
function theme(mode){document.documentElement.dataset.theme=mode;$('theme').textContent=mode==='dark'?'라이트 모드':'다크 모드';try{localStorage.setItem('ajou-lab-theme',mode);}catch{}}
try{theme(localStorage.getItem('ajou-lab-theme')||'light');}catch{theme('light');}$('theme').onclick=()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark');
(async()=>{try{if(offline){data=LAB_PREVIEW;user={email:'',role:'admin'};$('previewNotice').classList.remove('hidden');}else{const res=await fetch('/api/data',{cache:'no-store'}),result=await res.json();if(!res.ok)throw Error(result.error);({data,user,version,students}=result);studentNames=result.studentNames||{};notifications=result.notifications||[];labLeadAuthor=result.labLeadAuthor||'';labMemberAuthors=result.labMemberAuthors||[];}renderNotifications();years();const current=String(new Date().getFullYear());if([...$('year').options].some(o=>o.value===current))$('year').value=current;$('userLabel').innerHTML=badge(admin()?'교수님':'연구실 구성원');render();}catch(e){$('userLabel').textContent='연결 필요';$('panel').innerHTML=`<div class="note warning">${esc(e.message)}</div>`;}})();

function field(name,label,value='',type='text',extra=''){return `<label style="display:grid;gap:6px">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} style="width:100%;box-sizing:border-box;padding:10px"></label>`;}
function editor(title,fields,save,research=false){
 if(!(research?canEditResearch():admin())||busy)return;
 const d=document.createElement('dialog');d.style.cssText='width:min(640px,calc(100vw - 40px));max-height:85vh;overflow:auto;border:1px solid #999;border-radius:14px;padding:24px;background:var(--surface,#fff);color:var(--text,#172b3a)';
 d.innerHTML=`<form><h2>${esc(title)}</h2><p class="muted">* 필수 항목</p><div style="display:grid;gap:14px">${fields}</div><p role="alert" id="entryStatus"></p><div class="toolbar"><button type="button" class="secondary" id="cancelEntry">취소</button><button type="submit" class="primary">저장</button></div></form>`;
 document.body.append(d);d.showModal();const form=d.querySelector('form'),status=d.querySelector('[role=alert]');let saving=false;
 d.querySelector('#cancelEntry').onclick=()=>{if(!saving)d.close();};d.oncancel=e=>{if(saving)e.preventDefault();};d.onclose=()=>d.remove();
 form.onsubmit=async e=>{e.preventDefault();if(saving||busy)return;saving=true;busy=true;const buttons=[...d.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='저장 중…';try{if(studentPreview)throw Error('미리보기에서는 저장하지 않습니다. 관리자 화면으로 돌아가 저장해주세요.');const values=Object.fromEntries(new FormData(form));const next=structuredClone(data);save(values,next);if(!offline)await put('/api/data',{data:next});data=next;years();if(['conferences','papers'].includes(tab)){$('year').value='all';$('query').value='';}render();d.close();const notice=document.createElement('p');notice.className='note';notice.setAttribute('role','status');notice.textContent=offline?'검토 화면에 반영했습니다. 서버에는 저장되지 않습니다.':'저장했습니다.';$('panel').prepend(notice);}catch(err){status.textContent=err.message;}finally{saving=false;busy=false;buttons.forEach(b=>b.disabled=false);}};
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
function paperLocation(r){return [r.volume?'Vol. '+r.volume:'',r.issue?'No. '+r.issue:'',r.pages?'pp. '+r.pages:'',r.articleNumber||''].filter(Boolean).join(' · ');}
function paperCitation(r){return paperLocation(r)?[r.journal,paperLocation(r),`(${r.year})`].filter(Boolean).join(', '):r.citation||r.journal||'미기재';}
function validPaperDate(s){if(!s)return true;if(!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)||Number(s.slice(0,4))<1900||Number(s.slice(0,4))>2200)return false;const full=s.length===4?s+'-01-01':s.length===7?s+'-01':s;return Number.isFinite(Date.parse(full))&&new Date(full).toISOString().slice(0,10)===full;}
function paperAuthorCount(r){if(r.authorCount!==undefined)return r.authorCount;if(r.authorList?.length)return r.authorList.length;return Number.isInteger(r.authors)&&r.authors>0?r.authors:null;}
function editPaper(index=null){
 const r=index===null?{year:new Date().getFullYear()}:data.papers[index];const fields=[['title','논문 제목 *'],['year','게재 연도 *','number'],['journal','학술지 *'],['firstAuthor','제1저자 (영문)'],['correspondingAuthor','교신저자 (영문)'],['volume','권 (Volume)'],['issue','호 (Issue)'],['pages','페이지 (예: 419–425)'],['articleNumber','eLocator'],['sci','SCI 여부','select'],['authorCount','총저자수','number'],['issueDate','호·권 출판일 (YYYY-MM-DD / YYYY-MM / YYYY)'],['onlineDate','온라인 공개일 (YYYY-MM-DD / YYYY-MM / YYYY)'],['doi','DOI'],['publicationUrl','논문 링크','url'],['fund','연계 과제']];
 editor(index===null?'논문 추가':'논문 정보 수정',fields.filter(([k])=>k!=='fund'||admin()).map(([k,label,type])=>k==='sci'?`<label style="display:grid;gap:6px">SCI 여부<select name="sci" style="width:100%;padding:10px"><option value="">미확인</option>${['Y','N'].map(v=>`<option value="${v}" ${r.sci===v?'selected':''}>${v}</option>`).join('')}</select></label>`:field(k,label,k==='authorCount'?paperAuthorCount(r):k==='correspondingAuthor'?paperCorresponding(r):k==='firstAuthor'?paperFirst(r):r[k],type||'text',(k==='authorCount'?'min="1" max="100000" step="1"':k==='year'?'required min="1900" max="2200" step="1"':k==='title'||k==='journal'?'required maxlength="2000"':'maxlength="2000"'))).join('')+'<p class="muted">확인되지 않은 값은 비워두세요. 출판일은 확인된 연도·월·일까지만 입력할 수 있습니다.</p>',(v,next)=>{
  for(const k of Object.keys(v))v[k]=v[k].trim();v.year=Number(v.year);v.authorCount=v.authorCount===''?null:Number(v.authorCount);
  if(!['','Y','N'].includes(v.sci))throw Error('SCI 여부는 Y 또는 N으로 선택해주세요.');
  if(v.authorCount!==null&&(!Number.isInteger(v.authorCount)||v.authorCount<1||v.authorCount>100000))throw Error('총저자수는 1 이상의 정수로 입력해주세요.');
  if(!v.title||!v.journal||!Number.isInteger(v.year)||v.year<1900||v.year>2200)throw Error('제목, 학술지와 게재 연도를 확인해주세요.');
  if(!validPaperDate(v.issueDate)||!validPaperDate(v.onlineDate))throw Error('출판일은 실제 날짜로 YYYY, YYYY-MM 또는 YYYY-MM-DD 형식으로 입력해주세요.');
  if(v.publicationUrl&&!/^https:\/\//i.test(v.publicationUrl))throw Error('논문 링크는 https 주소로 입력해주세요.');
  if(/[가-힣]/.test(v.firstAuthor+v.correspondingAuthor))throw Error('저자 이름은 영문으로 입력해주세요.');
  const changed=Object.keys(v).filter(k=>['sci','authorCount'].includes(k)||String(r[k]??'')!==String(v[k]));
  const row={...r,...v,id:r.id||crypto.randomUUID(),paperEditedFields:[...new Set([...(r.paperEditedFields||[]),...changed])],paperEditedAt:new Date().toISOString()};
  if(r.title&&v.title!==r.title)row.titleAliases=[...new Set([...(r.titleAliases||[]),r.title])];
  row.citation=[row.journal,paperLocation(row),`(${row.year})`].filter(Boolean).join(', ');row.paperEditedFields=[...new Set([...row.paperEditedFields,'citation'])];if(index===null)next.papers.push(row);else next.papers[index]=row;
 },true);
}
function editPaperAuthor(index){const r=data.papers[index];editor('논문 제1저자 입력',`<p>${esc(r.title)}</p>`+field('firstAuthor','제1저자 영문 이름 *',paperFirst(r),'text','required maxlength="500"'),(v,next)=>{const author=v.firstAuthor.trim();if(!author||/[가-힣]/.test(author))throw Error('제1저자를 영문으로 입력해주세요.');next.papers[index]={...r,firstAuthor:author,paperEditedFields:[...new Set([...(r.paperEditedFields||[]),'firstAuthor'])]};});}
function calendarDay(tz='Asia/Seoul',now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function deadlineState(d,now=new Date()){
 const today=calendarDay(d.tz,now),days=Math.round((Date.parse(d.date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
 if(days<0)return {label:'마감',urgent:false};
 if(days===0){const clock=new Intl.DateTimeFormat('en-GB',{timeZone:d.tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);return {label:d.time&&clock>d.time?'마감':'오늘 마감 · 시각 확인',urgent:true};}
 return {label:'D-'+days,urgent:days<=14};
}
function deadlineList(list){
 if(!list.length)return '<p class="meeting-unknown">미공개 / 확인 대기</p>';
 return list.map(d=>{const state=deadlineState(d);return `<div class="meeting-deadline"><span class="meeting-deadline-label">${esc(d.label)}</span><div class="meeting-deadline-line"><strong>${esc(d.date)}</strong><span class="badge ${state.urgent?'meeting-urgent':''}">${esc(state.label)}</span></div><small>${esc(d.time||'시각 미공개')} · ${esc(d.tz==='Asia/Seoul'?'한국':d.tz==='Asia/Tokyo'?'일본':'미국 동부')}</small></div>`;}).join('');
}
function renderMeetingInfo(){
 const today=calendarDay(),all=ConferenceInfo.events,records=all.filter(e=>(meetingGroup==='all'||e.group===meetingGroup)&&(!e.end||e.end>=today)).sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999'));
 const meetingCard=e=>{
  const icon=ConferenceInfo.icons[e.society];
  return `<article class="meeting-card"><header class="meeting-header"><a class="meeting-name" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${icon?`<span class="meeting-logo"><img src="${esc(icon.src)}" alt="" width="80" height="64"></span>`:''}<h2>${esc(e.name)} <span aria-hidden="true">↗</span></h2></a><span class="badge">${e.group==='domestic'?'국내':'국외'} · ${e.start?(e.end<today?'행사 종료':'일정 공개'):'공지 대기'}</span></header><div class="meeting-blocks"><section class="meeting-block"><h3>초록등록 마감일</h3>${deadlineList(e.abstracts)}</section><section class="meeting-block"><h3>사전등록 마감일</h3>${deadlineList(e.registration)}</section><section class="meeting-block meeting-schedule"><h3>행사 일정</h3>${e.start?`<strong class="meeting-key">${esc(e.start)}</strong>${e.end&&e.end!==e.start?`<span class="meeting-range">~ ${esc(e.end)}</span>`:''}`:'<p class="meeting-unknown">미공개 / 확인 대기</p>'}</section><section class="meeting-block meeting-location"><h3>장소</h3><strong class="meeting-key">${esc(e.venue||'미공개 / 확인 대기')}</strong></section></div><footer class="meeting-footer"><details><summary>안내 및 공식 출처</summary>${e.note?`<p>${esc(e.note)}</p>`:''}<div class="meeting-sources">${e.sources.map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">공식 출처 ${i+1} ↗</a>`).join('')}</div></details><span class="muted">확인 ${esc(e.checked)}</span></footer></article>`;
 };
 return `<div class="tabs" role="tablist" aria-label="학술대회 지역" style="margin-bottom:20px">${[['all','전체'],['domestic','국내'],['international','국외']].map(([key,label])=>`<button class="tab ${meetingGroup===key?'active':''}" role="tab" aria-selected="${meetingGroup===key}" data-meeting-group="${key}">${label}</button>`).join('')}</div><div class="toolbar"><span class="muted">공식 공지 확인: ${esc(ConferenceInfo.updated)} · ${records.length}개 대회</span></div><div class="note">학회명을 누르면 공식 홈페이지가 새 창에서 열립니다. 마감은 주최 측 현지 날짜 기준이며, 조기등록·일반등록·발표자 등록을 구분합니다.</div><div class="meeting-list">${records.map(meetingCard).join('')||'<div class="empty">선택한 조건의 학술대회가 없습니다.</div>'}</div>`;
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
function nameMappingForm(){return `<section class="section-card"><h2>학생 국문·영문명 관리</h2><p class="muted">국문명과 논문에 기재된 영문명을 연결하면 국문명으로 논문을 검색할 수 있습니다. 영문 표기가 여러 개면 행을 추가하세요.</p><form id="nameMappingForm"><div class="table-wrap"><table class="data-table"><thead><tr><th>국문명</th><th>영문명</th><th>관리</th></tr></thead><tbody id="nameMappingRows">${(authorAliases().length?authorAliases():[{}]).map(nameMappingRow).join('')}</tbody></table></div><div class="toolbar"><button type="button" class="secondary" id="addNameMapping">학생 추가</button><button type="submit" class="primary green">이름 연결 저장</button></div><p role="status" id="nameMappingStatus"></p></form></section>`;}
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

// Shared research change feed, with read/dismiss state scoped to the signed-in browser account.
function notificationPrefs(){try{return JSON.parse(localStorage.getItem('ajou-notifications:'+user.email)||'{}');}catch{return {};}}
function saveNotificationPrefs(p){try{localStorage.setItem('ajou-notifications:'+user.email,JSON.stringify(p));}catch{}}
function renderNotifications(){
 const prefs=notificationPrefs(),hidden=new Set(prefs.hidden||[]),read=new Set(prefs.read||[]);
 const rows=notifications.filter(n=>!hidden.has(n.id));
 const open=!$('notificationCenter').classList.contains('hidden');
 if(open){rows.forEach(n=>read.add(n.id));saveNotificationPrefs({hidden:[...hidden].slice(-400),read:[...read].slice(-400)});}
 const unread=rows.filter(n=>!read.has(n.id)).length;$('notificationCount').textContent=unread>99?'99+':unread;$('notificationToggle').setAttribute('aria-label','알림 센터, 미확인 '+unread+'건');
 $('notificationList').innerHTML=rows.map(n=>`<button class="notification-item" data-notification="${esc(n.id)}"><div class="notification-meta"><b>${esc(n.actor)}</b><time datetime="${esc(n.at)}" title="${esc(new Date(n.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}">${esc(new Date(n.at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'}))}</time></div><strong>${esc(n.label)}</strong><p>${esc(n.title)}</p>${n.detail?`<small>${esc(n.detail)}</small>`:''}</button>`).join('')||'<p class="muted">새로운 알림이 없습니다.</p>';
 $('notificationList').querySelectorAll('[data-notification]').forEach(b=>b.onclick=async()=>{if(busy)return;const n=notifications.find(n=>n.id===b.dataset.notification);if(!offline&&n.type!=='meetingInfo'){try{const res=await fetch('/api/data',{cache:'no-store'});if(!res.ok)throw Error();const result=await res.json();data=result.data;version=result.version;years();}catch{$('notificationList').innerHTML='<p role="alert">자료를 불러오지 못했습니다. 알림을 다시 열어 시도해주세요.</p>';return;}}tab=n.type;$('year').value='all';$('query').value=n.action==='삭제'?'':n.title;if(tab==='meetingInfo'){meetingGroup='all';}closeNotifications();render();});
}
function closeNotifications(){$('notificationCenter').classList.add('hidden');$('notificationToggle').setAttribute('aria-expanded','false');}
$('notificationToggle').onclick=()=>{const open=$('notificationCenter').classList.toggle('hidden')===false;$('notificationToggle').setAttribute('aria-expanded',String(open));renderNotifications();};
$('notificationClose').onclick=()=>{closeNotifications();$('notificationToggle').focus();};
$('notificationClear').onclick=()=>{const p=notificationPrefs();saveNotificationPrefs({read:p.read||[],hidden:[...new Set([...(p.hidden||[]),...notifications.map(n=>n.id)])].slice(-400)});renderNotifications();};
document.addEventListener('click',e=>{if(!e.target.closest('.notification-anchor'))closeNotifications();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNotifications();});
async function refreshNotifications(){if(offline||document.hidden)return;try{const res=await fetch('/api/notifications',{cache:'no-store'});if(!res.ok)return;notifications=(await res.json()).notifications||[];renderNotifications();if(tab==='meetingInfo'&&!busy)render();}catch{}}
setInterval(refreshNotifications,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshNotifications();});

function studentAccountList(){return students.length?students.map(email=>`<div class="source" style="display:flex;align-items:center;gap:10px"><div style="flex:1;min-width:0;overflow-wrap:anywhere"><strong>${esc(studentNames[email]||'학생')}</strong><div class="muted">${esc(email)}</div></div><button class="secondary" data-remove-student="${esc(email)}" ${offline?'disabled':''} aria-label="${esc(studentNames[email]||email)} 계정 삭제">삭제</button></div>`).join(''):'<p class="muted">등록된 학생 계정이 없습니다.</p>';}
async function removeStudent(email){if(busy||!admin()||offline)return;if(!confirm((studentNames[email]||email)+' 계정의 대시보드 접근권한을 삭제할까요?'))return;busy=true;try{const next=students.filter(s=>s!==email);await put('/api/students',{students:next});students=next;render();$('accountStatus').textContent='계정을 삭제했습니다. 해당 계정은 대시보드에 접근할 수 없습니다.';}catch(e){$('accountStatus').textContent=e.message;}finally{busy=false;}}

function setStudentPreview(enabled){if(user.role!=='admin'||busy)return;studentPreview=enabled;tab=enabled?'home':'settings';$('year').value='all';$('query').value='';closeNotifications();render();window.scrollTo({top:0});}

const studentResearchFields={papers:['title','year','journal','firstAuthor','correspondingAuthor','volume','issue','pages','articleNumber','issueDate','onlineDate','doi','publicationUrl','sci','authorCount'],conferences:['date','year','presenter','coauthors','conference','scope','city','venue','title','kind','note']};
function researchChanges(before,after){const changes=[];for(const type of ['papers','conferences']){for(const old of before[type])if(!after[type].some(r=>r.id===old.id))throw Error('학생은 연구 기록을 삭제할 수 없습니다.');for(const r of after[type]){const old=before[type].find(p=>p.id===r.id);if(old&&JSON.stringify(old)===JSON.stringify(r))continue;const values=Object.fromEntries(studentResearchFields[type].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));changes.push({type,id:r.id,action:old?'edit':'add',values});}}return changes;}
