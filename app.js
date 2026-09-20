const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n==null?'미기재':Number(n).toLocaleString('ko-KR')+'원',count=n=>Number(n).toLocaleString('ko-KR');
let data=LabData.empty(),user={role:'student'},version=0,students=[],tab='home',meetingGroup='all',showPastMeetings=false,fundTab='internal',term='2026-2 인건비(안)',busy=false,exportRows=[];
const offline=!!globalThis.LAB_PREVIEW,admin=()=>user.role==='admin';
const menu=[['home','연구실 현황'],['papers','논문'],['conferences','학회 발표'],['meetingInfo','학술대회 정보'],['funds','연구비'],['payroll','인건비'],['settings','자료·계정 관리']];
const filter=rows=>rows.filter(r=>($('year').value==='all'||String(r.year)===$('year').value)&&JSON.stringify(r).toLowerCase().includes($('query').value.trim().toLowerCase()));
const badge=s=>`<span class="badge">${esc(s)}</span>`;
function table(headers,rows,classes=[]){if(!rows.length)return '<div class="empty">선택한 조건에 해당하는 자료가 없습니다.</div>';return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<td class="${classes[i]||''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
const card=(label,value,note)=>`<div class="card"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span>${note?`<small>${esc(note)}</small>`:''}</div>`;
function bar(label,value,max,light=false){return `<div class="bar-row"><span>${esc(label)}</span><div class="track"><div class="fill ${light?'light':''}" style="width:${max?value/max*100:0}%"></div></div><strong>${count(value)}</strong></div>`;}
function nav(){ $('tabs').innerHTML=menu.filter(([k])=>admin()||['home','papers','conferences','meetingInfo'].includes(k)).map(([k,v])=>`<button class="tab ${k===tab?'active':''}" data-tab="${k}" aria-current="${k===tab?'page':'false'}">${v}</button>`).join('');$('filters').classList.toggle('hidden',!['home','papers','conferences'].includes(tab));$('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});}
function years(){const old=$('year').value;const list=[...new Set([...data.papers,...data.conferences].map(r=>r.year).filter(Boolean))].sort((a,b)=>b-a);$('year').innerHTML='<option value="all">전체 연도</option>'+list.map(y=>`<option>${y}</option>`).join('');$('year').value=list.includes(Number(old))?old:'all';}
function render(){nav();exportRows=[];const panel=$('panel'),p=filter(data.papers),c=filter(data.conferences);const title=menu.find(([k])=>k===tab)[1];let html=`<h1>${title}</h1>`;
 if(tab==='home'){
  const awards=c.filter(r=>/우수|수상|최우수/.test(r.note));html+=`<div class="cards">${card('등록 논문',p.length+'건','게재 여부 미확인 · 예정 목록 포함')}${card('학회 발표 기록',c.length+'건','원본에 등록된 발표 내역')}${card('발표자',new Set(c.map(r=>r.presenter)).size+'명','선택 기간의 고유 발표자')}${card('수상 표시 기록',awards.length+'건','비고에 수상·우수 표시')}</div>`;
  const ys=[...new Set([...p,...c].map(r=>r.year))].sort((a,b)=>a-b),counts=ys.map(y=>({year:y,p:p.filter(r=>r.year===y).length,c:c.filter(r=>r.year===y).length})),max=Math.max(1,...counts.flatMap(r=>[r.p,r.c]));
  html+=`<div class="grid"><div class="section-card"><h2>연도별 연구 기록</h2>${counts.length?counts.map(r=>bar(r.year+' 논문',r.p,max)+bar('발표',r.c,max,true)).join(''):'<p class="muted">원본 자료를 등록해주세요.</p>'}<div class="legend"><span><i class="swatch"></i>등록 논문</span><span><i class="swatch light"></i>발표 기록</span></div></div><div class="stack"><div class="section-card"><h2>최근 논문 기록</h2><p class="muted">연도순 · 같은 연도는 원본 등록 순서 기준</p>${[...p].sort((a,b)=>b.year-a.year||(b.sourceRow||0)-(a.sourceRow||0)).slice(0,4).map(r=>`<div class="event"><div class="event-date">${esc(r.year)}</div><div><strong style="font-size:16px">${esc(r.title)}</strong><p style="font-size:16px;font-weight:700;margin-top:8px">제1저자: ${esc(r.firstAuthor||'미입력')}</p><small class="muted">${esc(r.journal||'학술지 미기재')} · ${esc(r.status)}</small>${admin()?`<div><button class="secondary" data-paper-author="${data.papers.indexOf(r)}">제1저자 입력·수정</button></div>`:''}</div></div>`).join('')||'<p class="muted">등록된 논문이 없습니다.</p>'}</div><div class="section-card"><h2>최근 발표 기록</h2>${[...c].sort((a,b)=>b.year-a.year||b.date.localeCompare(a.date)).slice(0,4).map(r=>`<div class="event"><div class="event-date">${esc(r.year)}<br>${esc(r.date.slice(5)||'날짜 미상')}</div><div><strong style="font-size:20px">${esc(r.presenter)}</strong><p style="font-size:16px;font-weight:600;margin:8px 0">${esc(r.title||'발표 제목 미기재')}</p><small class="muted" style="font-size:12px">${esc(r.conference)}</small></div></div>`).join('')||'<p class="muted">등록된 발표가 없습니다.</p>'}</div></div></div><div class="note">현재 화면은 업로드된 기록을 기준으로 합니다. 논문 게재 상태는 원본에서 확인되지 않아 확정 실적으로 표시하지 않습니다. 학회 마감일은 학술대회 정보 탭에서 확인하세요.</div>`;
 }else if(tab==='papers'){
  html+='<div class="note">원본 Paper 시트를 기준으로 통합했습니다. 홈페이지 게시용·생애업적 시트는 중복 합산하지 않습니다. IF와 업적평가 점수는 서로 다른 값입니다.</div>';
  const headers=['연도','논문 제목','학술지','저자 구분','연계 과제','등록 구분'];const rows=p.slice().sort((a,b)=>b.year-a.year).map(r=>[r.year,r.title,r.journal||'미기재',r.role,r.fund||'미기재',r.status]);exportRows=[headers,...rows];html+=toolbar(rows.length)+table(headers,rows.map(r=>r.map(esc)),['nowrap','title','title','nowrap','','nowrap']);
 }else if(tab==='conferences'){
  const records=c.slice().sort((a,b)=>b.year-a.year||b.date.localeCompare(a.date));const headers=['발표일 / 기간','발표자','학회명','장소','발표 제목','유형','비고'];const rows=records.map(r=>[r.date||r.period||'미기재',r.presenter,r.conference,[r.region,r.venue].filter(Boolean).join(' / '),r.title||'미기재',r.kind,r.note]);exportRows=[headers,...rows];html+=`<div class="toolbar"><span class="muted">${admin()?'행의 수정 버튼을 누르면 표에서 바로 편집할 수 있습니다.':''}</span>${admin()?'<button class="primary" id="addConference">발표 내역 추가</button>':''}</div>`+toolbar(rows.length)+table([...headers,...(admin()?['관리']:[])],rows.map((r,i)=>[...r.map(esc),...(admin()?[`<button class="secondary" style="white-space:nowrap" data-conf="${data.conferences.indexOf(records[i])}">수정</button>`]:[])]),['nowrap','nowrap','title','title','title','nowrap','']);
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
  html+=`<div class="grid"><div class="section-card"><h2>엑셀 자료 갱신</h2><p class="muted">기존 양식의 파일을 선택하면 해당 자료만 교체합니다. 논문·학회·연구비·인건비 파일을 한 번에 선택할 수 있습니다.</p><label class="primary green" style="display:inline-block;cursor:pointer">엑셀 선택<input class="hidden" id="upload" type="file" accept=".xlsx" multiple></label><p id="uploadStatus" class="status" role="status"></p>${data.sources.map(s=>`<div class="source"><strong>${esc(s.name)}</strong><div class="muted">불러온 날짜 ${esc(s.importedAt.slice(0,10))}</div></div>`).join('')}<p class="muted">현재는 파일 업로드 방식입니다. 구글 시트 자동 동기화는 아직 연결하지 않았습니다.</p></div><div class="stack"><div class="section-card"><h2>학생 접근 계정</h2><p class="muted">학생은 논문·학회만 조회합니다. 연구비·인건비는 서버에서 제외합니다.</p><label for="students">학생 이메일 · 한 줄에 한 명</label><textarea id="students" rows="5" style="width:100%;margin:10px 0" placeholder="student@ajou.ac.kr">${esc(students.join('\n'))}</textarea><button id="saveStudents" class="primary" ${offline?'disabled':''}>접근 목록 저장</button><p class="muted">${offline?'검토용 파일에서는 계정 설정을 저장할 수 없습니다.':'Sites에서 사이트 공유 권한도 별도로 부여해야 합니다.'}</p><p class="status" id="accountStatus" role="status"></p></div><div class="section-card"><h2>원본 확인 사항</h2>${data.issues.length?'<ul>'+data.issues.map(i=>`<li style="margin-bottom:10px;font-size:14px">${esc(i.message)}</li>`).join('')+'</ul>':'<p class="muted">등록된 확인 사항이 없습니다.</p>'}</div></div></div>`;
 }
 panel.innerHTML=html;
 panel.querySelectorAll('[data-paper-author]').forEach(b=>b.onclick=()=>editPaperAuthor(Number(b.dataset.paperAuthor)));
 panel.querySelectorAll('[data-meeting-group]').forEach(b=>b.onclick=()=>{meetingGroup=b.dataset.meetingGroup;render();});if($('showPastMeetings'))$('showPastMeetings').onchange=e=>{showPastMeetings=e.target.checked;render();};
 panel.querySelectorAll('[data-fund-tab]').forEach(b=>b.onclick=()=>{if(!busy){fundTab=b.dataset.fundTab;render();}});panel.querySelectorAll('[data-edit-fund]').forEach(b=>b.onclick=()=>editFund(Number(b.dataset.editFund)));panel.querySelectorAll('[data-delete-fund]').forEach(b=>b.onclick=()=>deleteFund(Number(b.dataset.deleteFund)));panel.querySelectorAll('[data-fund-category]').forEach(el=>el.onchange=()=>changeFundCategory(Number(el.dataset.fundCategory),el));
 if($('addConference'))$('addConference').onclick=()=>editConference();panel.querySelectorAll('[data-conf]').forEach(b=>b.onclick=()=>editConferenceRow(Number(b.dataset.conf),b.closest('tr')));if($('addFund'))$('addFund').onclick=addFund;panel.querySelectorAll('[data-expense]').forEach(b=>b.onclick=()=>editExpense(Number(b.dataset.expense),b.dataset.entry===undefined?null:Number(b.dataset.entry)));
 if($('term'))$('term').onchange=e=>{term=e.target.value;render();};if($('csv'))$('csv').onclick=download;
 if($('upload'))$('upload').onchange=upload;if($('saveStudents'))$('saveStudents').onclick=saveStudents;
 const dates=data.sources.map(s=>s.importedAt).sort();$('sourceDate').textContent=dates.length?'자료 불러온 날짜 '+dates.at(-1).slice(0,10):'원본 자료 미등록';
}
function toolbar(n){return `<div class="toolbar"><span class="muted">${count(n)}개 기록</span><button class="secondary" id="csv">현재 표 CSV 저장</button></div>`;}
function download(){const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const b=new Blob(['\ufeff'+exportRows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='연구실_'+tab+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function put(path,input){const res=await fetch(path,{method:'PUT',headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify({version,...input})});const result=await res.json();if(!res.ok)throw Error(result.error);version=result.version;}
async function upload(e){if(busy)return;const input=e.target;busy=true;input.disabled=true;const files=[...input.files];$('uploadStatus').textContent='엑셀을 읽고 있습니다…';try{let updated=structuredClone(data);for(const f of files){const sheets=await LabData.readXlsx(f);updated=LabData.merge(updated,LabData.normalize(sheets,f.name));}if((data.conferences.some(r=>r.manual)||data.funds.some(f=>f.manual||f.initialEdited||f.entries?.length))&&!confirm('엑셀 자료 교체 시 해당 분류의 직접 입력·수정 내역이 사라질 수 있습니다. 계속할까요?')){ $('uploadStatus').textContent='자료 교체를 취소했습니다.';return;}if(!offline)await put('/api/data',{data:updated});data=updated;years();render();$('uploadStatus').textContent=offline?'이 검토 화면에 반영했습니다. 파일을 다시 열면 원래 사본으로 돌아갑니다.':'자료를 저장했습니다.';}catch(err){$('uploadStatus').textContent=err.message;}finally{busy=false;input.disabled=false;input.value='';}}
async function saveStudents(){const b=$('saveStudents');b.disabled=true;try{const next=$('students').value.split(/\s+/).filter(Boolean);await put('/api/students',{students:next});students=next;$('accountStatus').textContent='접근 목록을 저장했습니다.';}catch(e){$('accountStatus').textContent=e.message;}finally{b.disabled=false;}}
$('year').onchange=render;$('query').oninput=render;$('reset').onclick=()=>{$('year').value='all';$('query').value='';render();};
function theme(mode){document.documentElement.dataset.theme=mode;$('theme').textContent=mode==='dark'?'라이트 모드':'다크 모드';try{localStorage.setItem('ajou-lab-theme',mode);}catch{}}
try{theme(localStorage.getItem('ajou-lab-theme')||'light');}catch{theme('light');}$('theme').onclick=()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark');
(async()=>{try{if(offline){data=LAB_PREVIEW;user={email:'',role:'admin'};$('previewNotice').classList.remove('hidden');}else{const res=await fetch('/api/data',{cache:'no-store'}),result=await res.json();if(!res.ok)throw Error(result.error);({data,user,version,students}=result);}years();const current=String(new Date().getFullYear());if([...$('year').options].some(o=>o.value===current))$('year').value=current;$('userLabel').innerHTML=badge(admin()?'교수님':'연구실 구성원');render();}catch(e){$('userLabel').textContent='연결 필요';$('panel').innerHTML=`<div class="note warning">${esc(e.message)}</div>`;}})();

function field(name,label,value='',type='text',extra=''){return `<label style="display:grid;gap:6px">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} style="width:100%;box-sizing:border-box;padding:10px"></label>`;}
function editor(title,fields,save){
 if(!admin()||busy)return;
 const d=document.createElement('dialog');d.style.cssText='width:min(640px,calc(100vw - 40px));max-height:85vh;overflow:auto;border:1px solid #999;border-radius:14px;padding:24px;background:var(--surface,#fff);color:var(--text,#172b3a)';
 d.innerHTML=`<form><h2>${esc(title)}</h2><p class="muted">* 필수 항목 · 금액 단위: 원</p><div style="display:grid;gap:14px">${fields}</div><p role="alert" id="entryStatus"></p><div class="toolbar"><button type="button" class="secondary" id="cancelEntry">취소</button><button type="submit" class="primary">저장</button></div></form>`;
 document.body.append(d);d.showModal();const form=d.querySelector('form'),status=d.querySelector('[role=alert]');let saving=false;
 d.querySelector('#cancelEntry').onclick=()=>{if(!saving)d.close();};d.oncancel=e=>{if(saving)e.preventDefault();};d.onclose=()=>d.remove();
 form.onsubmit=async e=>{e.preventDefault();if(saving||busy)return;saving=true;busy=true;const buttons=[...d.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='저장 중…';try{const values=Object.fromEntries(new FormData(form));const next=structuredClone(data);save(values,next);if(!offline)await put('/api/data',{data:next});data=next;years();if(tab==='conferences'){$('year').value='all';$('query').value='';}render();d.close();const notice=document.createElement('p');notice.className='note';notice.setAttribute('role','status');notice.textContent=offline?'검토 화면에 반영했습니다. 서버에는 저장되지 않습니다.':'저장했습니다.';$('panel').prepend(notice);}catch(err){status.textContent=err.message;}finally{saving=false;busy=false;buttons.forEach(b=>b.disabled=false);}};
}
function editConference(index=null){const r=index===null?{year:new Date().getFullYear(),kind:'미기재'}:data.conferences[index];editor(index===null?'학회 발표 추가':'학회 발표 수정',field('date','발표일 *',r.date,'date','required min="1900-01-01" max="2200-12-31"')+field('period','기간 (발표일 미정 시)',r.period)+field('presenter','발표자 *',r.presenter,'text','required maxlength="300"')+field('coauthors','공동 저자',r.coauthors)+field('conference','학회명 *',r.conference,'text','required maxlength="500"')+field('region','국내 / 국제 등 구분',r.region)+field('venue','개최 장소',r.venue)+field('title','발표 제목',r.title)+`<label>발표 유형 <select name="kind">${['구두','포스터','미기재'].map(k=>`<option ${r.kind===k?'selected':''}>${k}</option>`).join('')}</select></label>`+field('note','비고 / 수상',r.note),(v,next)=>{v.year=Number(v.date.slice(0,4));v.presenter=v.presenter.trim();v.conference=v.conference.trim();if(!v.presenter||!v.conference)throw Error('발표자와 학회명을 입력해주세요.');if(v.date&&Number(v.date.slice(0,4))!==v.year)throw Error('발표일과 연도가 일치해야 합니다.');const row={...r,...v,id:r.id||crypto.randomUUID(),manual:true};if(index===null)next.conferences.push(row);else next.conferences[index]=row;});}
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
 if(!admin()||busy||document.querySelector('[data-inline-editor]'))return;
 const r=data.conferences[index];tr.dataset.inlineEditor='true';
 const input=(key,label,type='text',extra='')=>`<input data-key="${key}" aria-label="${label}" type="${type}" value="${esc(r[key])}" ${extra} style="width:100%;min-width:${type==='date'?'155':'110'}px;padding:7px">`;
 const area=(key,label)=>`<textarea data-key="${key}" aria-label="${label}" rows="4" style="width:100%;min-width:160px;padding:7px">${esc(r[key])}</textarea>`;
 tr.innerHTML=[input('date','발표일','date','min="1900-01-01" max="2200-12-31"')+`<button type="button" class="secondary" data-calendar style="white-space:nowrap;margin-top:6px">달력 열기</button>`+(!r.date?`<small style="display:block">기존 기간: ${esc(r.period||'미기재')}</small>`:''),input('presenter','발표자','text','required maxlength="300"'),area('conference','학회명'),input('region','국가 / 지역')+input('venue','개최 장소'),area('title','발표 제목'),`<select data-key="kind" aria-label="발표 유형">${['구두','포스터','미기재'].map(k=>`<option ${r.kind===k?'selected':''}>${k}</option>`).join('')}</select>`,area('note','비고'),'<div style="display:grid;gap:8px;min-width:72px"><button class="primary" data-save>저장</button><button class="secondary" data-cancel>취소</button></div><p role="status" style="min-width:100px"></p>'].map(v=>`<td>${v}</td>`).join('');
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
  const next=structuredClone(data);next.conferences[index]={...r,...values,year:values.date?Number(values.date.slice(0,4)):r.year,manual:true};
  busy=true;tr.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);status.textContent='저장 중…';
  try{if(!offline)await put('/api/data',{data:next});data=next;years();$('year').value='all';$('query').value='';close();const notice=document.createElement('p');notice.className='note';notice.setAttribute('role','status');notice.textContent=offline?'검토 화면에만 반영했습니다.':'발표 내역을 저장했습니다.';$('panel').prepend(notice);}catch(e){status.textContent=e.message;tr.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=false);}finally{busy=false;}
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

function editPaperAuthor(index){const r=data.papers[index];editor('논문 제1저자 입력',`<p>${esc(r.title)}</p>`+field('firstAuthor','제1저자 이름 *',r.firstAuthor,'text','required maxlength="500"'),(v,next)=>{const author=v.firstAuthor.trim();if(!author)throw Error('제1저자를 입력해주세요.');next.papers[index]={...r,firstAuthor:author};});}
function calendarDay(tz='Asia/Seoul',now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function deadlineState(d,now=new Date()){
 const today=calendarDay(d.tz,now),days=Math.round((Date.parse(d.date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
 if(days<0)return {label:'마감',urgent:false};
 if(days===0){const clock=new Intl.DateTimeFormat('en-GB',{timeZone:d.tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);return {label:d.time&&clock>d.time?'마감':'오늘 마감 · 시각 확인',urgent:true};}
 return {label:'D-'+days,urgent:days<=14};
}
function deadlineList(list){if(!list.length)return '<span class="muted">미공개 / 확인 대기</span>';return list.map(d=>{const state=deadlineState(d);return `<div style="margin-bottom:10px"><small>${esc(d.label)}</small><br><strong class="nowrap">${esc(d.date)}</strong><br><span class="badge" ${state.urgent?'style="background:#fee2e2;color:#b91c1c"':''}>${esc(state.label)}</span><small style="display:block">${esc(d.time||'시각 미공개')} · ${esc(d.tz==='Asia/Seoul'?'한국':d.tz==='Asia/Tokyo'?'일본':'미국 동부')}</small></div>`;}).join('');}
function renderMeetingInfo(){
 const today=calendarDay(),all=ConferenceInfo.events,records=all.filter(e=>(meetingGroup==='all'||e.group===meetingGroup)&&(showPastMeetings||!e.end||e.end>=today)).sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999'));
 const name=e=>{const icon=ConferenceInfo.icons[e.society];return `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit;font-weight:700;display:flex;align-items:center;gap:10px">${icon?`<img src="${esc(icon.src)}" alt="" width="32" height="32" style="object-fit:contain;background:white;border-radius:5px;flex:none" title="${esc(e.name.split(' · ')[0])} 로고">`:''}<span>${esc(e.name)} ↗</span></a><small class="muted">${e.group==='domestic'?'국내':'국외'} · ${e.start?(e.end<today?'행사 종료':'일정 공개'):'공지 대기'}</small>`;};
 return `<div class="tabs" role="tablist" aria-label="학술대회 지역" style="margin-bottom:20px">${[['all','전체'],['domestic','국내'],['international','국외']].map(([key,label])=>`<button class="tab ${meetingGroup===key?'active':''}" role="tab" aria-selected="${meetingGroup===key}" data-meeting-group="${key}">${label}</button>`).join('')}</div><div class="toolbar"><span class="muted">공식 공지 확인: ${esc(ConferenceInfo.updated)} · ${records.length}개 대회</span><label><input type="checkbox" id="showPastMeetings" ${showPastMeetings?'checked':''}> 종료된 행사 포함</label></div><div class="note">학회명을 누르면 공식 홈페이지가 새 창에서 열립니다. 마감은 주최 측 현지 날짜 기준이며, 조기등록·일반등록·발표자 등록을 구분합니다. 미확인 날짜는 추정하지 않습니다.</div>${table(['학술대회','초록등록 마감일','사전등록 마감일','행사 일정','장소','안내 / 확인 출처'],records.map(e=>[name(e),deadlineList(e.abstracts),deadlineList(e.registration),e.start?`<strong>${esc(e.start)}</strong><br>~ ${esc(e.end)}`:'미공개 / 확인 대기',esc(e.venue||'미공개 / 확인 대기'),`<p style="margin:0 0 8px">${esc(e.note)}</p>${e.sources.map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">공식 출처 ${i+1} ↗</a>`).join('<br>')}<small class="muted" style="display:block">확인 ${esc(e.checked)}</small>`]),['title','nowrap','nowrap','nowrap','title','title'])}`;
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
