import {reagentProducts} from './reagent-products.mjs';
import {receiveResearchImageUpload} from './research-upload.mjs';
import {researchRoomRequest,researchNotifications} from './research-room.mjs';
import {applyPaperGrants} from './paper-grants.mjs';
import {recordScheduleAdditions,recordScheduleDay} from './schedule-notifications.mjs';
import {homepageManagers,updateHomepageManagers} from './homepage-access.mjs';
import {migrationRequest} from './migration.mjs';
import {gatewayRequest,mountDashboardText} from './gateway.mjs';
// Only run behind the Sites trusted authentication dispatcher, never on a public Worker origin.
// Candidate purchase links: verified product pages or explicitly labelled searches.
function legacyReagentLinks(r){
 const name=String(r.name||'').trim(),note=String(r.note||'').trim(),brand=note.toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
 if(!name)return [];
 const domains={sigmaaldrich:'sigmaaldrich.com',aldrich:'sigmaaldrich.com',merck:'sigmaaldrich.com',tci:'tcichemicals.com',samchun:'samchun.com',daejung:'daejungchem.co.kr',junsei:'junsei.co.jp',kayaku:'kayakuam.com',microchem:'kayakuam.com',smoothon:'smooth-on.com',evonik:'evonik.com',byk:'byk.com'};
 const direct={
  'smoothon|ecoflex 00-30 part a':'https://www.smooth-on.com/products/ecoflex-00-30/',
  'smoothon|ecoflex 00-30 part b':'https://www.smooth-on.com/products/ecoflex-00-30/',
  'evonik|abil em 90':'https://www.evonik.com/en/products/cs/pr_52003302.html',
  'tci|imidazole-2-carboxaldehyde':'https://www.tcichemicals.com/KR/ko/p/I0809',
  'tci|4-benzoylphenyl methacrylate':'https://www.tcichemicals.com/KR/ko/p/B6151'
 };
 const result=[],product=direct[brand+'|'+name.toLowerCase()];if(product)result.push(product);
 const domain=domains[brand],brandText=/^[—-]?$/.test(note)?'':note;
 if(domain)result.push('https://www.google.com/search?q='+encodeURIComponent('site:'+domain+' '+name));
 result.push('https://www.google.com/search?q='+encodeURIComponent([brandText,name,'구매'].filter(Boolean).join(' ')));
 return [...new Set(result)];
}
function reagentProductKey(r){let brand=String(r.note||'').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');if(brand==='aldrich')brand='sigmaaldrich';return brand+'|'+String(r.name||'').trim().toLowerCase();}
export function suggestReagentLinks(r){
 const key=reagentProductKey(r);if(Object.hasOwn(reagentProducts,key))return [...reagentProducts[key]];
 if(/^(sigmaaldrich|samchun|daejung)\|/.test(key))return [];
 return legacyReagentLinks(r);
}
export function upgradedReagentLinks(r){
 if(r.links===undefined)return suggestReagentLinks(r);
 const key=reagentProductKey(r);if(!Object.hasOwn(reagentProducts,key)||!r.links.length)return r.links;
 // Replace only the exact search URLs supplied by v181. Keep custom links and explicit deletions.
 const searches=legacyReagentLinks(r).filter(url=>url.startsWith('https://www.google.com/search?'));
 if(!r.links.some(url=>searches.includes(url)))return r.links;
 return [...new Set([...r.links.filter(url=>!searches.includes(url)),...reagentProducts[key]])].slice(0,12);
}
export function validateReagentLinks(links){
 if(!Array.isArray(links)||links.length>12)throw Error('구매 링크는 최대 12개까지 입력해주세요.');
 for(const value of links){if(typeof value!=='string'||value.length>2000)throw Error('구매 링크 주소를 확인해주세요.');let u;try{u=new URL(value);}catch{throw Error('구매 링크는 https:// 주소로 입력해주세요.');}if(u.protocol!=='https:'||u.username||u.password)throw Error('구매 링크는 인증정보 없는 HTTPS 주소만 사용할 수 있습니다.');}
 return [...new Set(links)];
}

export const fresh=()=>({version:0,data:{papers:[],conferences:[],reagents:[],funds:[],payroll:[],standards:[],sources:[],issues:[]},students:[]});
export function visible(data,admin){if(admin)return data;return {papers:data.papers.map(({points,engineeringPoints,achievement,...r})=>r),conferences:data.conferences,reagents:data.reagents||[],funds:[],payroll:[],standards:[],sources:data.sources.filter(s=>['papers','conferences','reagents'].includes(s.type)),issues:[],authorAliases:data.authorAliases||[],groupMeetings:data.groupMeetings,groupPlans:data.groupPlans,gameNight:data.gameNight,gameNights:data.gameNights};}
export function groupPaperRows(state,email,admin=false){
 return (state.data.groupMeetings||[]).filter(r=>r.kind==='논문발표').flatMap(r=>r.presenter.split(/[·,、;\n]/).map(n=>n.trim()).filter(Boolean).map(name=>{
  const accounts=state.students.filter(e=>state.studentNames?.[e]===name),owner=accounts.length===1?accounts[0]:null,entry=owner?state.groupPresentationPapers?.[r.id]?.[owner]:null;
  return {meeting:r.id,name,title:entry?.title||'',url:entry?.url||'',canEdit:!admin&&owner===email};
 }));
}
export function updateGroupPaper(state,email,admin,input){
 if(admin||!state.students.includes(email))throw Object.assign(Error('해당 발표 학생만 등록·수정할 수 있습니다.'),{status:403});
 if(!input||Object.keys(input).some(k=>!['version','meeting','title','url'].includes(k)))throw Error('논문 제목과 링크만 입력해주세요.');
 const mine=groupPaperRows(state,email).find(r=>r.meeting===input.meeting&&r.canEdit);if(!mine)throw Object.assign(Error('해당 발표 학생만 등록·수정할 수 있습니다.'),{status:403});
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>500||typeof input.url!=='string'||input.url.length>2000)throw Error('논문 제목과 링크를 확인해주세요.');
 let link;try{link=new URL(input.url.trim());}catch{throw Error('올바른 논문 링크를 입력해주세요.');}if(link.protocol!=='https:'||link.username||link.password)throw Error('https 논문 링크를 입력해주세요.');
 state.groupPresentationPapers??={};state.groupPresentationPapers[input.meeting]??={};state.groupPresentationPapers[input.meeting][email]={title:input.title.trim(),url:link.href};
}
export function validateGroupMeetings(rows){
 if(!Array.isArray(rows)||rows.length>1000)throw Error('일정은 1,000개까지 저장할 수 있습니다.');
 const ids=new Set();return rows.map(r=>{
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['id','date','time','presenter','kind','location','note','academicYear','locked'].includes(k)))throw Error('그룹미팅 항목을 확인해주세요.');
  for(const k of ['id','date','time','presenter','kind','location','note'])if(typeof r[k]!=='string'||r[k].length>({note:1000,presenter:300,location:300}[k]||100))throw Error('그룹미팅 입력값을 확인해주세요.');
  if(!r.id||ids.has(r.id))throw Error('일정 식별자가 중복되었습니다.');ids.add(r.id);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date||r.date<'2000-01-01'||r.date>'2200-12-31')throw Error('날짜를 확인해주세요.');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)||!r.presenter.trim()||!['랩세미나','논문발표','학부생 발표','특별 발표'].includes(r.kind))throw Error('시간, 발표자, 발표 종류를 확인해주세요.');
  if(r.academicYear!==undefined&&(!Number.isInteger(r.academicYear)||r.academicYear<2026||r.academicYear>2199))throw Error('학년도를 확인해주세요.');
  if(r.locked!==undefined&&typeof r.locked!=='boolean')throw Error('고정 상태를 확인해주세요.');
  return {...r,presenter:r.presenter.trim(),location:r.location.trim(),note:r.note.trim()};
 }).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
}
export function validateGameNight(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['date','game'].includes(k))||typeof value.date!=='string'||typeof value.game!=='string'||value.game.length>120)throw Error('게임나잇 날짜와 게임 종류를 확인해주세요.');
 if(value.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!Number.isFinite(Date.parse(value.date))||new Date(value.date).toISOString().slice(0,10)!==value.date||value.date<'2000-01-01'||value.date>'2200-12-31'))throw Error('날짜를 확인해주세요.');
 return {date:value.date,game:value.game.trim()};
}
export function validateGameNights(rows){
 if(!Array.isArray(rows)||rows.length>2412)throw Error('게임나잇 기록을 확인해주세요.');const months=new Set();
 return rows.map(r=>{if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['month','date','game'].includes(k))||typeof r.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)||r.month<'2000-01'||r.month>'2200-12'||months.has(r.month))throw Error('월별 기록은 한 개씩 입력해주세요.');months.add(r.month);const value=validateGameNight({date:r.date,game:r.game});if(value.date&&!value.date.startsWith(r.month+'-'))throw Error('해당 월의 날짜를 입력해주세요.');return {month:r.month,...value};}).sort((a,b)=>a.month.localeCompare(b.month));
}
export function validateData(d){
 if(d?.gameNights!==undefined)d.gameNights=validateGameNights(d.gameNights);
 if(d?.gameNight!==undefined)d.gameNight=validateGameNight(d.gameNight);
 if(d?.groupMeetings!==undefined)d.groupMeetings=validateGroupMeetings(d.groupMeetings);
 if(!d||typeof d!=='object')throw Error('자료 형식이 올바르지 않습니다.');
 if(d.reagents!==undefined){
  if(!Array.isArray(d.reagents)||d.reagents.length>20000)throw Error('시약 목록을 확인해주세요.');
  const ids=new Set();for(const r of d.reagents){if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!r.id||r.id.length>200||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim())throw Error('시약 이름과 식별자를 확인해주세요.');ids.add(r.id);if(r.links!==undefined)r.links=validateReagentLinks(r.links);for(const k of ['name','unit','capacity','quantity','location','note'])if(typeof r[k]!=='string'||r[k].length>2000)throw Error('시약 항목은 2000자 이하의 텍스트로 입력해주세요.');}
 }
 for(const key of ['papers','conferences','funds','payroll','standards','sources','issues'])if(!Array.isArray(d[key])||d[key].length>20000)throw Error('필수 자료 목록이 없거나 너무 큽니다.');
 for(const row of [...d.papers,...d.conferences,...d.funds,...d.payroll,...d.standards,...d.sources,...d.issues])if(!row||typeof row!=='object'||Array.isArray(row))throw Error('자료 행 형식이 올바르지 않습니다.');
 if(d.authorAliases!==undefined&&(!Array.isArray(d.authorAliases)||d.authorAliases.length>1000||d.authorAliases.some(a=>!a||typeof a.korean!=='string'||!a.korean.trim()||a.korean.length>100||!/[가-힣]/.test(a.korean)||typeof a.english!=='string'||!a.english.trim()||a.english.length>200||/[가-힣]/.test(a.english)||!/[A-Za-z]/.test(a.english))))throw Error('학생 국문·영문명 연결 정보를 확인해주세요.');
 const str=JSON.stringify(d);if(str.length>1500000)throw Error('자료가 너무 큽니다.');
 for(const r of d.papers)if(typeof r.title!=='string'||!Number.isInteger(r.year))throw Error('논문 제목과 연도를 확인해주세요.');
 for(const r of d.conferences)if(typeof r.presenter!=='string'||!Number.isInteger(r.year))throw Error('발표자와 연도를 확인해주세요.');
 for(const r of d.funds)if(!Array.isArray(r.months))throw Error('연구비 월별 자료를 확인해주세요.');
 const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 const partialDateOK=s=>{if(typeof s!=='string'||!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)||s.slice(0,4)<'1900'||s.slice(0,4)>'2200')return false;return dateOK(s.length===4?s+'-01-01':s.length===7?s+'-01':s);};
 for(const p of d.papers){
  if(p.achievement!==undefined){
   const a=p.achievement;
   if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['year','semester','authors','sci','role','base','engineeringRecorded','percentile','category','jcrYear','include','note'].includes(k))||(a.year!==undefined&&(!Number.isInteger(a.year)||a.year<1900||a.year>2200))||(a.semester!==undefined&&a.semester!==null&&![1,2].includes(a.semester))||(a.authors!==undefined&&(!Number.isInteger(a.authors)||a.authors<1||a.authors>100000))||(a.sci!==undefined&&!['','SCI','other'].includes(a.sci))||(a.role!==undefined&&!['','lead','co'].includes(a.role))||(a.base!==undefined&&a.base!==null&&![300,360,450,600,1000].includes(a.base))||(a.engineeringRecorded!==undefined&&a.engineeringRecorded!==null&&(!Number.isFinite(a.engineeringRecorded)||a.engineeringRecorded<0||a.engineeringRecorded>1000))||(a.authors===1&&a.role==='co')||(a.percentile!==null&&(!Number.isFinite(a.percentile)||a.percentile<0||a.percentile>100))||(a.jcrYear!==null&&(!Number.isInteger(a.jcrYear)||a.jcrYear<1900||a.jcrYear>2200))||(a.include!==undefined&&typeof a.include!=='boolean')||typeof a.category!=='string'||a.category.length>500||typeof a.note!=='string'||a.note.length>2000)throw Error('논문 업적 정보를 확인해주세요.');
  }

  if(p.sci!==undefined&&!['','Y','N','SCI','KCI','해당사항없음'].includes(p.sci))throw Error('SCI 여부를 확인해주세요.');
  if(p.authorCount!==undefined&&p.authorCount!==null&&(!Number.isInteger(p.authorCount)||p.authorCount<1||p.authorCount>100000))throw Error('총저자수는 1 이상의 정수여야 합니다.');
  for(const k of ['correspondingAuthor','coauthors','volume','issue','pages','articleNumber','doi','publicationUrl','issueDate','onlineDate'])if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>2000))throw Error('논문 출판 정보를 확인해주세요.');
  for(const k of ['issueDate','onlineDate'])if(p[k]&&!partialDateOK(p[k]))throw Error('논문 출판일을 확인해주세요.');
  if(p.publicationUrl&&!/^https:\/\//i.test(p.publicationUrl))throw Error('논문 링크는 https 주소여야 합니다.');
  if(p.paperEditedFields!==undefined&&(!Array.isArray(p.paperEditedFields)||p.paperEditedFields.length>50||p.paperEditedFields.some(k=>!['title','year','journal','firstAuthor','correspondingAuthor','coauthors','volume','issue','pages','articleNumber','issueDate','onlineDate','doi','publicationUrl','fund','status','citation','sci','authorCount'].includes(k))))throw Error('논문 수정 항목을 확인해주세요.');
  if(p.paperEditedFields?.length&&(!p.title.trim()||p.year<1900||p.year>2200))throw Error('논문 제목과 게재 연도를 확인해주세요.');
 }
 const amountOK=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000000;
 for(const r of d.conferences)if(r.manual&&(!(r.year>=1900&&r.year<=2200)||!r.presenter.trim()||typeof r.conference!=='string'||!r.conference.trim()||!['구두','포스터','미기재'].includes(r.kind)||(r.date&&(!dateOK(r.date)||Number(r.date.slice(0,4))!==r.year))))throw Error('학회명, 발표자, 연도와 발표일을 확인해주세요.');
 for(const r of d.conferences)if(r.locationEdited&&(!['국내','국제'].includes(r.scope)||typeof r.city!=='string'||r.city.length>500||typeof r.venue!=='string'||r.venue.length>1000))throw Error('학회 국내/국제 구분, 도시와 장소를 확인해주세요.');
 for(const f of d.funds){
  if(f.endDate!==undefined&&f.endDate!==''&&(!dateOK(f.endDate)||f.endDate<'1900-01-01'||f.endDate>'2200-12-31'))throw Error('연구비 종료일을 확인해주세요.');
  if(f.initialEdited&&f.months.some(m=>!m||typeof m.month!=='string'||!m.month.trim()||(m.spend!==null&&!amountOK(m.spend))||(m.balance!==null&&!amountOK(m.balance))))throw Error('연구비 월별 기록의 기간과 금액을 확인해주세요.');
  if((f.manual||f.initialEdited)&&(typeof f.title!=='string'||!f.title.trim()||!amountOK(f.total)||!amountOK(f.balance)||f.balance>f.total))throw Error('연구비명, 총액과 잔액을 확인해주세요.');
  if(f.entries!==undefined){if(!Array.isArray(f.entries)||f.entries.length>20000)throw Error('지출 목록을 확인해주세요.');for(const e of f.entries)if(!e||!dateOK(e.date)||typeof e.description!=='string'||!e.description.trim()||!amountOK(e.amount)||e.amount===0)throw Error('지출일, 사용 내역과 양의 정수 금액을 확인해주세요.');}
 }
 return d;
}
const notificationFields={
 papers:['title','year','journal','firstAuthor','correspondingAuthor','coauthors','authorList','volume','issue','pages','articleNumber','issueDate','onlineDate','sci','authorCount','authors','doi','publicationUrl'],
 conferences:['title','year','date','presenter','coauthors','conference','scope','city','region','venue','kind','note'],
 meetingInfo:['name','start','end','venue','abstracts','registration','url','note']
};
function notificationView(row,type){return Object.fromEntries(notificationFields[type].map(k=>[k,row[k]??null]));}
export function recordNotifications(state,before,after,type,actor='교수님'){
 const key=r=>r.id||r.title||r.name;const old=new Map(before.map(r=>[key(r),r])),next=new Map(after.map(r=>[key(r),r])),events=[];
 for(const [id,r] of next){const previous=old.get(id);if(previous&&JSON.stringify(notificationView(previous,type))===JSON.stringify(notificationView(r,type)))continue;events.push({r,action:previous?'수정':'등록'});}
 for(const [id,r] of old)if(!next.has(id))events.push({r,action:'삭제'});
 const label={papers:'논문',conferences:'학회 발표',meetingInfo:'학술대회'}[type];
 const added=events.map(({r,action})=>({id:crypto.randomUUID(),at:new Date().toISOString(),actor,type,recordId:r.id||null,action,label:label+' '+action,title:String(r.title||r.name||r.conference||'제목 미기재').slice(0,500),detail:String(type==='papers'?r.journal||'':type==='conferences'?[r.presenter,r.conference,r.kind,r.date].filter(Boolean).join(' · '):[r.start,r.venue].filter(Boolean).join(' · ')).slice(0,500)}));
 state.notifications=[...added.reverse(),...(state.notifications||[])].slice(0,200);
}
const researchFields={papers:['title','year','journal','firstAuthor','correspondingAuthor','coauthors','volume','issue','pages','articleNumber','issueDate','onlineDate','doi','publicationUrl','sci','authorCount'],conferences:['date','year','presenter','coauthors','conference','scope','city','venue','title','kind','note']};
// Archive edits invalidate only the spreadsheet overrides affected by that edit.
export function syncPaperAchievement(previous,paper){
 if(!previous?.achievement||!paper.achievement)return paper;
 const changed=keys=>keys.some(k=>JSON.stringify(previous[k])!==JSON.stringify(paper[k]));
 const a={...paper.achievement};
 if(changed(['authorCount','authors','authorList'])){delete a.authors;delete a.engineeringRecorded;}
 if(changed(['firstAuthor','correspondingAuthor','coauthors','authorList'])){delete a.role;delete a.engineeringRecorded;}
 if(changed(['sci'])){delete a.sci;delete a.engineeringRecorded;}
 if(changed(['issueDate','year'])){delete a.year;delete a.semester;}
 if(changed(['journal','doi'])){a.base=null;a.percentile=null;a.category='';a.jcrYear=null;delete a.engineeringRecorded;}
 if(changed(['status']))delete a.include;
 return {...paper,achievement:a};
}
export function syncArchiveAchievements(previous,next){
 const old=new Map(previous.papers.map(p=>[p.id,p]));
 return {...next,papers:next.papers.map(p=>syncPaperAchievement(old.get(p.id),p))};
}
export function applyResearchChanges(data,changes){
 if(!Array.isArray(changes)||!changes.length||changes.length>100)throw Error('변경할 연구 기록을 확인해주세요.');
 const next=structuredClone(data),seen=new Set();
 for(const c of changes){
  if(!c||!['papers','conferences'].includes(c.type)||!['add','edit'].includes(c.action)||typeof c.id!=='string'||!c.id||c.id.length>200||!c.values||typeof c.values!=='object'||Array.isArray(c.values))throw Error('연구 기록 형식이 올바르지 않습니다.');
  const key=c.type+':'+c.id;if(seen.has(key))throw Error('중복 수정 요청입니다.');seen.add(key);
  const keys=Object.keys(c.values);if(!keys.length||keys.some(k=>!researchFields[c.type].includes(k)))throw Error('허용되지 않는 수정 항목입니다.');
  for(const k of keys){const v=c.values[k];if(k==='year'){if(!Number.isInteger(v)||v<1900||v>2200)throw Error('연도를 확인해주세요.');}else if(k==='authorCount'){if(v!==null&&(!Number.isInteger(v)||v<1||v>100000))throw Error('총저자수를 확인해주세요.');}else if(typeof v!=='string'||v.length>2000)throw Error('입력값을 확인해주세요.');}
  const index=next[c.type].findIndex(r=>r.id===c.id);if(c.action==='add'?index>=0:index<0)throw Error('기록이 변경되었습니다. 새로고침해주세요.');
  const old=index>=0?next[c.type][index]:{},r={...old,...c.values,id:c.id};
  if(c.type==='papers'){
   if(!r.title?.trim()||!r.journal?.trim()||/[가-힣]/.test((r.firstAuthor||'')+(r.correspondingAuthor||'')+(r.coauthors||'')))throw Error('논문 제목, 학술지와 영문 저자를 확인해주세요.');
   if(old.title&&r.title!==old.title)r.titleAliases=[...new Set([...(old.titleAliases||[]),old.title])];
   r.paperEditedFields=[...new Set([...(old.paperEditedFields||[]),...keys])];r.paperEditedAt=new Date().toISOString();
  }else{r.manual=true;r.locationEdited=true;}
  if(index>=0)next[c.type][index]=r;else next[c.type].push(r);
 }
 return validateData(syncArchiveAchievements(data,next));
}
export function applySharedData(current,input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('자료 형식을 확인해주세요.');
 for(const k of ['funds','payroll','standards','issues'])if(input[k]!==undefined&&(!Array.isArray(input[k])||input[k].length))throw Error('연구비·인건비 및 관리 자료는 변경할 수 없습니다.');
 let next=structuredClone(current);
 for(const type of ['papers','conferences']){
  if(!Array.isArray(input[type])||input[type].length>20000)throw Error('연구 목록을 확인해주세요.');
  const ids=new Set();
  for(const row of input[type]){
   if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('연구 식별자를 확인해주세요.');ids.add(row.id);
   const old=next[type].find(r=>r.id===row.id),values=Object.fromEntries(researchFields[type].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
   if(old&&Object.keys(values).every(k=>JSON.stringify(values[k])===JSON.stringify(old[k])))continue;
   next=applyResearchChanges(next,[{type,id:row.id,action:old?'edit':'add',values}]);
  }
  const removed=next[type].filter(r=>!ids.has(r.id));
  if(type==='papers'&&removed.length)next.removedPapers=[...(next.removedPapers||[]),...removed.flatMap(r=>[r.title,...(r.titleAliases||[])].filter(Boolean).map(title=>({id:r.id,title})))];
  next[type]=input[type].map(r=>next[type].find(saved=>saved.id===r.id));
 }
 if(!Array.isArray(input.reagents))throw Error('시약 목록을 확인해주세요.');
 next.reagents=input.reagents.map(r=>({id:r.id,...Object.fromEntries(['name','unit','capacity','quantity','location','note'].map(k=>[k,r[k]])),...((r.links??current.reagents?.find(x=>x.id===r.id)?.links)!==undefined?{links:r.links??current.reagents.find(x=>x.id===r.id).links}:{})}));
 next.authorAliases=input.authorAliases||[];
 if(!Array.isArray(input.sources)||input.sources.some(r=>!r||!['papers','conferences','reagents'].includes(r.type)))throw Error('공용 자료의 출처를 확인해주세요.');
 next.sources=[...current.sources.filter(r=>!['papers','conferences','reagents'].includes(r.type)),...input.sources];
 return validateData(next);
}

export function createWorker(html,meetingEvents=null,serviceWorkerSource='',notificationIcon=''){return {async fetch(req,env,ctx){if(new URL(req.url).pathname==='/api/research-image-upload')return receiveResearchImageUpload(req,env);const migration=await migrationRequest(req,env);if(migration)return migration;const gateway=await gatewayRequest(req,env);if(gateway instanceof Response)return gateway;if(gateway){const response=await createWorker(html,meetingEvents,serviceWorkerSource,notificationIcon).fetch(gateway,env,ctx);const type=response.headers.get('Content-Type')||'';if(type.includes('text/html')||type.includes('javascript')){const h=new Headers(response.headers);if(type.includes('javascript'))h.set('Service-Worker-Allowed','/dashboard/');return new Response(req.method==='HEAD'?null:mountDashboardText(await response.text()),{status:response.status,headers:h});}return response;}const url=new URL(req.url),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie, oai-authenticated-user-id, oai-authenticated-user-email','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'"};
 const reply=(body,status=200,type)=>new Response(req.method==='HEAD'?null:typeof body==='string'?body:JSON.stringify(body),{status,headers:{...headers,...(type?{'Content-Type':type}:{})}});
 try{
  if(url.pathname==='/notification-icon.png'&&['GET','HEAD'].includes(req.method))return new Response(req.method==='HEAD'?null:Uint8Array.from(atob(notificationIcon),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'}});
  let email=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase(),id=req.headers.get('oai-authenticated-user-id');
  if(!id||!email)return reply({error:'승인된 계정으로 로그인해주세요.'},401);
  if(!env.ADMIN_EMAIL)return reply({error:'관리자 계정 설정이 필요합니다.'},503);
  let admin=email===env.ADMIN_EMAIL.trim().toLowerCase();
  if(!env.DB)return reply({error:'공동 저장소가 연결되지 않았습니다.'},503);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS lab_state (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL)').run();
  const existing=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();
  if(!existing){
   const initial=fresh();
   const initialSeed=env.INITIAL_DATA_GZIP||Array.from({length:16},(_,i)=>env['INITIAL_DATA_GZIP_'+(i+1)]||'').join('');
   if(initialSeed){const bytes=Uint8Array.from(atob(initialSeed),c=>c.charCodeAt(0));const json=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();initial.data=validateData(JSON.parse(json));}
   await env.DB.prepare('INSERT OR IGNORE INTO lab_state VALUES (1,0,?)').bind(JSON.stringify(initial)).run();
  }
  let row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first(),state=JSON.parse(row.payload);
  if(state.migrationTarget){const target=new URL('/dashboard'+(url.pathname==='/'?'':url.pathname)+url.search,state.migrationTarget);return new Response(null,{status:307,headers:{Location:target.href,'Cache-Control':'no-store'}});}
  if(env.STUDENT_ACCESS_REVISION&&state.studentAccessRevision!==env.STUDENT_ACCESS_REVISION){
   const roster=JSON.parse(env.STUDENT_ACCESS_ROSTER||'[]');
   if(!Array.isArray(roster)||roster.length>100||roster.some(r=>!r||typeof r.name!=='string'||typeof r.email!=='string'||!/^\S+@\S+\.\S+$/.test(r.email)))throw Error('학생 접근 설정을 확인해주세요.');
   // Apply the owner-authorized roster once; subsequent removals remain revoked.
   if(!admin&&!roster.some(r=>r.email.trim().toLowerCase()===email))return reply({error:'연구실 접근 권한이 없습니다.'},403);
   const next={...state,students:[...new Set([...state.students,...roster.map(r=>r.email.trim().toLowerCase())])],studentNames:{...(state.studentNames||{}),...Object.fromEntries(roster.map(r=>[r.email.trim().toLowerCase(),r.name]))},studentAccessRevision:env.STUDENT_ACCESS_REVISION};
   const saved=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(next),row.version).run();
   if(!saved.meta?.changes)return reply({error:'계정 정보를 갱신 중입니다. 다시 시도해주세요.'},409);
   row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();state=JSON.parse(row.payload);
  }
  if(!admin&&!state.students.includes(email))return reply({error:'연구실 접근 권한이 없습니다.'},403);
  const read=['GET','HEAD'].includes(req.method),origin=req.headers.get('Origin');
  if((origin&&origin!==url.origin)||(!read&&(origin!==url.origin||req.headers.get('X-Lab-Request')!=='1'||req.headers.get('Content-Type')!=='application/json')))return reply({error:'허용되지 않는 요청입니다.'},403);
  if(url.searchParams.has('previewStudent')){
   const selected=url.searchParams.get('previewStudent');
   if(!admin||!read||!state.students.includes(selected)||!(['/api/data','/api/notifications'].includes(url.pathname)||url.pathname.startsWith('/api/ai/')))return reply({error:'교수님만 등록된 학생의 읽기 전용 화면을 확인할 수 있습니다.'},403);
   email=selected;id='student-preview:'+selected;admin=false;
  }
  if(url.pathname.startsWith('/api/ai/'))return researchRoomRequest(req,env,{admin,email,id,name:admin?'교수님':state.studentNames?.[email]||email,members:state.students.map(email=>({email,name:state.studentNames?.[email]||email}))});
  if(read&&url.pathname==='/service-worker.js')return new Response(req.method==='HEAD'?null:serviceWorkerSource,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-cache','Service-Worker-Allowed':'/','X-Content-Type-Options':'nosniff'}});
  if(url.pathname.startsWith('/api/push/'))return reply({error:'웹 데스크톱알림 기능이 종료되었습니다.'},410);
  if(admin&&read&&url.pathname==='/api/data'&&(state.data.reagents||[]).some(r=>JSON.stringify(r.links)!==JSON.stringify(upgradedReagentLinks(r)))){
   const next=structuredClone(state);for(const r of next.data.reagents)r.links=upgradedReagentLinks(r);
   const saved=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(next),row.version).run();
   if(!saved.meta?.changes)return reply({error:'시약 링크를 갱신 중입니다. 다시 시도해주세요.'},409);
   row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();state=JSON.parse(row.payload);
  }
  if(admin&&read&&url.pathname==='/api/data'&&env.PAPER_CATALOG_REVISION&&state.paperCatalogRevision!==env.PAPER_CATALOG_REVISION){
   const count=Number(env.PAPER_CATALOG_CHUNKS);if(!Number.isInteger(count)||count<1||count>16)throw Error('논문 갱신 자료 설정을 확인해주세요.');
   const compressed=Array.from({length:count},(_,i)=>env['PAPER_CATALOG_GZIP_'+(i+1)]||'').join('');
   const bytes=Uint8Array.from(atob(compressed),c=>c.charCodeAt(0));
   const catalog=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
   if(catalog.revision!==env.PAPER_CATALOG_REVISION)throw Error('논문 갱신 자료 버전이 일치하지 않습니다.');
   const next={...state,data:validateData(mergePaperCatalog(state.data,catalog)),paperCatalogRevision:catalog.revision};
   recordNotifications(next,state.data.papers,next.data.papers,'papers','자동 갱신');
   const changed=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(next),row.version).run();
   if(!changed.meta?.changes)return reply({error:'자료가 변경되었습니다. 새로고침해주세요.'},409);
   row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();state=JSON.parse(row.payload);
  }
  if(admin&&read&&url.pathname==='/api/data'&&((env.PAPER_COAUTHORS_REVISION&&state.paperCoauthorsRevision!==env.PAPER_COAUTHORS_REVISION)||(env.PAPER_SCI_REVISION&&state.paperSciRevision!==env.PAPER_SCI_REVISION))){
   const next=structuredClone(state);
   if(env.PAPER_COAUTHORS_REVISION&&state.paperCoauthorsRevision!==env.PAPER_COAUTHORS_REVISION){
    const count=Number(env.PAPER_COAUTHORS_CHUNKS);if(!Number.isInteger(count)||count<1||count>16)throw Error('공동저자 자료 설정을 확인해주세요.');
    const bytes=Uint8Array.from(atob(Array.from({length:count},(_,i)=>env['PAPER_COAUTHORS_GZIP_'+(i+1)]||'').join('')),c=>c.charCodeAt(0));
    const catalog=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());if(catalog.revision!==env.PAPER_COAUTHORS_REVISION)throw Error('공동저자 자료 버전이 일치하지 않습니다.');
    const result=mergePaperCoauthors(next.data,catalog);next.data=result.data;next.paperCoauthorsSummary=result.summary;next.paperCoauthorsRevision=catalog.revision;
   }
   if(env.PAPER_SCI_REVISION&&state.paperSciRevision!==env.PAPER_SCI_REVISION){next.data.papers=next.data.papers.map(p=>({...p,sci:'SCI'}));next.paperSciRevision=env.PAPER_SCI_REVISION;}
   validateData(next.data);const changed=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(next),row.version).run();if(!changed.meta?.changes)return reply({error:'자료가 변경되었습니다. 새로고침해주세요.'},409);
   row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();state=JSON.parse(row.payload);
  }
  if(url.pathname==='/api/group-paper'&&req.method==='PUT'){
   const raw=await req.text();if(raw.length>6000)return reply({error:'입력이 너무 깁니다.'},413);const input=JSON.parse(raw);
   if(input.version!==row.version)return reply({error:'자료가 변경되었습니다. 새로고침 후 다시 저장해주세요.'},409);
   try{updateGroupPaper(state,email,admin,input);}catch(e){return reply({error:e.message},e.status||400);}
   const saved=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),row.version).run();if(!saved.meta?.changes)return reply({error:'자료가 변경되었습니다. 다시 저장해주세요.'},409);
   return reply({version:row.version+1,groupPresentationPapers:groupPaperRows(state,email,admin)});
  }
  if(url.pathname==='/api/preferences'&&req.method==='PUT'){
   const raw=await req.text();if(raw.length>16000)return reply({error:'설정이 너무 큽니다.'},413);
   const input=JSON.parse(raw),next={};
   for(const k of ['papers','conferences'])if(input[k]){next[k]={};for(const field of ['selected','order']){const a=input[k][field];if(!Array.isArray(a)||a.length>30||a.some(v=>typeof v!=='string'||v.length>80))return reply({error:'표시 항목을 확인해주세요.'},400);next[k][field]=[...new Set(a)];}}
   for(const [k,values] of Object.entries({meetingView:['emphasized','normal'],theme:['light','dark'],accent:['default','blue','green','pink','yellow','purple'],layout:['horizontal','vertical'],texture:['plain','jelly','metal']}))if(values.includes(input[k]))next[k]=input[k];
   if(Object.hasOwn(input,'hubBoard')){const a=input.hubBoard;if(!Array.isArray(a)||a.length>100||new Set(a.map(r=>r?.id)).size!==a.length||a.some(r=>!r||typeof r.id!=='string'||r.id.length>500||!['x','w'].every(k=>Number.isInteger(r[k]))||!['y','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.w<2||r.x+r.w>12||r.y<0||r.y>9999||r.h<.5||r.h>40)||a.some((r,i)=>a.slice(i+1).some(t=>r.x<t.x+t.w&&r.x+r.w>t.x&&r.y<t.y+t.h&&r.y+r.h>t.y)))return reply({error:'통합보드 배치를 확인해주세요.'},400);next.hubBoard=a.map(({id,x,y,w,h})=>({id,x,y,w,h}));}
   if(Object.hasOwn(input,'hubBoardRows')){if(!Number.isFinite(input.hubBoardRows)||input.hubBoardRows<12||input.hubBoardRows>10040)return reply({error:'격자 크기를 확인해주세요.'},400);next.hubBoardRows=input.hubBoardRows;}
   const previous=state.preferences?.[email]||{};
   if(input.notifications){next.notifications={};for(const k of ['read','hidden']){const a=input.notifications[k]||[];if(!Array.isArray(a)||a.length>400||a.some(v=>typeof v!=='string'||v.length>200))return reply({error:'알림 설정을 확인해주세요.'},400);next.notifications[k]=[...new Set([...(previous.notifications?.[k]||[]),...a])].slice(-400);}}
   state.preferences={...(state.preferences||{}),[email]:{...previous,...next}};
   const result=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),row.version).run();
   if(!result.meta?.changes)return reply({error:'설정이 변경되었습니다. 다시 저장해주세요.'},409);
   return reply({preferences:state.preferences[email],previousVersion:row.version,version:row.version+1});
  }
  if(read&&['/api/notifications','/api/data'].includes(url.pathname)){
   if(recordScheduleDay(state)){
    const saved=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),row.version).run();
    if(!saved.meta?.changes)return reply({error:'다시 확인 중입니다.'},409);
    row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();state=JSON.parse(row.payload);
   }
   const snapshot=(meetingEvents||[]).map(r=>({id:r.id,...notificationView(r,'meetingInfo')}));
   if(meetingEvents!==null&&JSON.stringify(state.meetingNotificationSnapshot)!==JSON.stringify(snapshot)){
    if(state.meetingNotificationSnapshot)recordNotifications(state,state.meetingNotificationSnapshot,snapshot,'meetingInfo','자동 갱신');
    state.meetingNotificationSnapshot=snapshot;
    const saved=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),row.version).run();
    if(!saved.meta?.changes)return reply({error:'다시 확인 중입니다.'},409);
    row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();state=JSON.parse(row.payload);
   }
   if(url.pathname==='/api/notifications')return reply({notifications:await researchNotifications(env.DB,{admin,email},state.notifications||[])});
  }
  if(read&&url.pathname==='/_mobile-preview'){
   if(!admin)return reply({error:'교수님만 확인할 수 있습니다.'},403);
   const width=Math.max(320,Math.min(760,Number(url.searchParams.get('width'))||390)),height=Math.max(500,Math.min(1100,Number(url.searchParams.get('height'))||844));
   return reply(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>모바일 화면 검증</title><style>body{margin:0;background:#edf1f5;display:grid;place-items:start center;padding:20px}iframe{border:0;border-radius:16px;background:white;box-shadow:0 4px 30px #0002}</style></head><body><iframe title="모바일 대시보드" src="/" width="${width}" height="${height}"></iframe></body></html>`,200,'text/html; charset=utf-8');
  }
  if(read&&['/','/index.html'].includes(url.pathname))return reply(html,200,'text/html; charset=utf-8');
  if(read&&url.pathname==='/api/data'){
   // Each merge starts from the latest snapshot; never overwrite a concurrent save.
   for(let attempt=0;attempt<3;attempt++){
    const merged=applyPaperGrants(state.data);if(!merged.count)break;
    const next={...state,data:merged.data};
    const saved=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(next),row.version).run();
    row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();state=JSON.parse(row.payload);
    if(saved.meta?.changes)break;
   }
  }
  if(read&&url.pathname==='/api/data')return reply({version:row.version,user:{email,name:admin?'교수님':state.studentNames?.[email]||'',role:admin?'admin':'student',canManageHomepage:!!env.HOMEPAGE_ADMIN_EMBED&&homepageManagers(state,env.ADMIN_EMAIL).includes(email)},preferences:state.preferences?.[email]||{},labLeadAuthor:env.LAB_LEAD_AUTHOR||'',labMemberAuthors:(env.LAB_MEMBER_AUTHORS||'').split(';').map(s=>s.trim()).filter(Boolean),notifications:await researchNotifications(env.DB,{admin,email},state.notifications||[]),data:{...visible(state.data,admin),groupPresentationPapers:groupPaperRows(state,email,admin)},homepageAdmins:admin?homepageManagers(state,env.ADMIN_EMAIL):[],students:admin?state.students:[],studentNames:admin?(state.studentNames||{}):{}});
  if(req.method==='PUT'&&['/api/data','/api/students','/api/homepage-admins','/api/research','/api/reagents','/api/shared','/api/group-meetings','/api/game-night','/api/game-nights'].includes(url.pathname)){
   if(!admin&&!['/api/research','/api/reagents','/api/shared','/api/group-meetings','/api/game-night','/api/game-nights'].includes(url.pathname))return reply({error:'교수님만 변경할 수 있습니다.'},403);
   const reader=req.body?.getReader();let size=0,parts=[];if(!reader)return reply({error:'자료가 없습니다.'},400);
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2500000){await reader.cancel();return reply({error:'자료가 너무 큽니다.'},413);}parts.push(value);}
   const input=JSON.parse(await new Blob(parts).text());if(input.version!==row.version)return reply({error:'다른 곳에서 자료가 변경되었습니다. 새로고침 후 다시 시도해주세요.'},409);
   const beforeSchedules=structuredClone(state.data);
   if(url.pathname==='/api/game-nights'){if(Object.keys(input).some(k=>!['version','gameNights'].includes(k)))throw Error('게임나잇 기록만 수정할 수 있습니다.');state.data.gameNights=validateGameNights(input.gameNights);}
   else if(url.pathname==='/api/game-night'){if(Object.keys(input).some(k=>!['version','gameNight'].includes(k)))throw Error('게임나잇 항목만 수정할 수 있습니다.');state.data.gameNight=validateGameNight(input.gameNight);}
   else if(url.pathname==='/api/group-meetings'){
    if(Object.keys(input).some(k=>!['version','groupMeetings','planYear','plan'].includes(k)))throw Error('그룹미팅 항목만 수정할 수 있습니다.');
    state.data.groupMeetings=validateGroupMeetings(input.groupMeetings);
    if(input.plan!==undefined){const p=input.plan,y=input.planYear;if(!Number.isInteger(y)||y<2026||y>2199||!p||p.year!==y||Object.keys(p).some(k=>!['year','start','time','location','kind','names','first'].includes(k))||!Array.isArray(p.names)||p.names.length<1||p.names.length>100||p.names.some(n=>typeof n!=='string'||!n.trim()||n.length>60)||new Set(p.names).size!==p.names.length||!p.names.includes(p.first)||!['랩세미나','논문발표'].includes(p.kind)||typeof p.start!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.start)||!Number.isFinite(Date.parse(p.start))||new Date(p.start).toISOString().slice(0,10)!==p.start||p.start<y+'-03-01'||p.start>=(y+1)+'-03-01'||typeof p.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)||typeof p.location!=='string'||p.location.length>300)throw Error('학년도 편성 설정을 확인해주세요.');
     state.data.groupPlans={...(state.data.groupPlans||{}),[y]:p};
    }else if(input.planYear!==undefined)throw Error('편성 설정이 필요합니다.');
   }
   else if(url.pathname==='/api/shared'){const next=applySharedData(state.data,input.data);for(const type of ['papers','conferences'])recordNotifications(state,state.data[type],next[type],type,state.studentNames?.[email]||'연구실 구성원');state.data=next;}
   else if(url.pathname==='/api/reagents'){
    const fields=['name','unit','capacity','quantity','location','note','links'];
    if(!Array.isArray(input.changes)||!input.changes.length||input.changes.length>50||Object.keys(input).some(k=>!['version','changes'].includes(k)))throw Error('시약 수정 항목을 확인해주세요.');
    const next=structuredClone(state.data),seen=new Set();
    for(const change of input.changes){
     if(!change||Object.keys(change).some(k=>!['id','values'].includes(k))||typeof change.id!=='string'||seen.has(change.id)||!change.values||typeof change.values!=='object'||Array.isArray(change.values)||!Object.keys(change.values).length||Object.keys(change.values).some(k=>!fields.includes(k)))throw Error('시약 수정 항목을 확인해주세요.');
     seen.add(change.id);const index=(next.reagents||[]).findIndex(r=>r.id===change.id);if(index<0)throw Error('시약이 삭제되었거나 존재하지 않습니다. 새로고침해주세요.');
     next.reagents[index]={...next.reagents[index],...change.values};
    }
    state.data=validateData(next);
   }
   else if(url.pathname==='/api/research'){const next=applyResearchChanges(state.data,input.changes);for(const type of ['papers','conferences'])recordNotifications(state,state.data[type],next[type],type,admin?'교수님':state.studentNames?.[email]||'연구실 구성원');state.data=next;}
   else if(url.pathname==='/api/data'){const next=validateData(syncArchiveAchievements(state.data,input.data));for(const type of ['papers','conferences'])recordNotifications(state,state.data[type],next[type],type);state.data=next;}
   else if(url.pathname==='/api/homepage-admins'){state.homepageAdmins=updateHomepageManagers(state,input.emails,env.ADMIN_EMAIL);}
   else {if(!Array.isArray(input.students)||input.students.length>100||input.students.some(s=>typeof s!=='string'||!/^\S+@\S+\.\S+$/.test(s)||s.length>254))return reply({error:'이메일 목록을 확인해주세요.'},400);state.students=[...new Set(input.students.map(s=>s.trim().toLowerCase()))];}
   if(url.pathname==='/api/group-meetings'&&input.plan&&JSON.stringify(beforeSchedules)!==JSON.stringify(state.data)){state.notifications=[{id:crypto.randomUUID(),at:new Date().toISOString(),actor:admin?'교수님':'연구실 구성원',type:'groupMeetings',action:'수정',label:'그룹미팅 일정 확정',title:input.planYear+'학년도 그룹미팅',detail:'학년도 일정이 등록 또는 변경되었습니다.'},...(state.notifications||[])].slice(0,200);}
   else recordScheduleAdditions(state,beforeSchedules,state.data,admin?'교수님':state.studentNames?.[email]||'연구실 구성원');
   recordScheduleDay(state);
   const result=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),row.version).run();
   if(!result.meta?.changes)return reply({error:'자료가 변경되었습니다. 새로고침해주세요.'},409);
   return reply({version:row.version+1,notifications:await researchNotifications(env.DB,{admin,email},state.notifications||[])});
  }
  return reply({error:'페이지를 찾을 수 없습니다.'},404);
 }catch(e){return reply({error:e instanceof SyntaxError?'자료 형식을 확인해주세요.':e.message||'처리 중 오류가 발생했습니다.'},400);}
}};}

export function mergePaperCoauthors(data,catalog){
 if(catalog.source!=='https://nisml.ajou.ac.kr/?page_id=234'||!Array.isArray(catalog.papers)||catalog.papers.length>2000)throw Error('공동저자 출처와 목록을 확인해주세요.');
 const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');let matched=0,preserved=0;
 const papers=data.papers.map(p=>{const incoming=catalog.papers.find(r=>(p.metadataSource===catalog.source&&p.websiteNumber===r.websiteNumber)||[p.title,...(p.titleAliases||[])].some(t=>key(t)===key(r.title)));if(!incoming)return p;matched++;if(p.paperEditedFields?.includes('coauthors')){preserved++;return p;}if(typeof incoming.coauthors!=='string'||incoming.coauthors.length>2000)throw Error('공동저자 정보를 확인해주세요.');return {...p,coauthors:incoming.coauthors,coauthorsSource:catalog.source,coauthorsChecked:catalog.checked};});
 return {data:{...data,papers},summary:{matched,filled:matched-preserved,preserved,unmatched:papers.length-matched}};
}
export function mergePaperCatalog(data,catalog){
 if(!Array.isArray(catalog.papers)||catalog.papers.length>2000)throw Error('논문 갱신 목록을 확인해주세요.');
 const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
 const signatures=p=>new Set([p.title,...(p.titleAliases||[])].map(key).filter(Boolean));
 const removedPapers=[...(data.removedPapers||[])];for(const item of catalog.removedPapers||[])if(!removedPapers.some(r=>r.id===item.id&&r.title===item.title))removedPapers.push(item);
 const removed=p=>removedPapers.some(r=>[p.title,...(p.titleAliases||[])].some(t=>key(t)===key(r.title)));
 const existing=data.papers.filter(p=>!removed(p)),used=new Set();
 const papers=catalog.papers.filter(p=>!removed(p)).map(p=>{
  if(!p.title||!Number.isInteger(p.year)||!Array.isArray(p.authorList)||!p.authorList.length)throw Error('논문 저자·제목·연도를 확인해주세요.');
  const keys=signatures(p);const index=existing.findIndex((r,i)=>!used.has(i)&&((r.metadataSource===catalog.source&&r.websiteNumber===p.websiteNumber)||[...signatures(r)].some(k=>keys.has(k))));
  const previous=index>=0?existing[index]:{};if(index>=0)used.add(index);
  const aliases=[...new Set([...(previous.titleAliases||[]),...(p.titleAliases||[]),previous.title,p.title].filter(t=>t&&key(t)!==key(previous.paperEditedFields?.includes('title')?previous.title:p.title)))];
  const incoming=index>=0&&previous.metadataSource===catalog.source&&Array.isArray(catalog.patchFields)?Object.fromEntries(catalog.patchFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])):p;
  const edited=Object.fromEntries((previous.paperEditedFields||[]).filter(k=>previous[k]!==undefined).map(k=>[k,previous[k]]));
  return {...previous,...incoming,...edited,id:previous.id||'nisml-paper-'+p.websiteNumber,titleAliases:aliases,role:previous.role||'미기재',fund:previous.fund||'',metadataSource:catalog.source,metadataChecked:catalog.checked};
 });
 papers.push(...existing.filter((_,i)=>!used.has(i)));
 const aliases=data.authorAliases??[...new Map(papers.flatMap(p=>(p.authorList||[]).filter(a=>a.korean&&a.nameMatch==='record').map(a=>[a.korean+'|'+a.name,{korean:a.korean,english:a.name}]))).values()];
 return syncArchiveAchievements(data,{...data,papers,removedPapers,authorAliases:aliases,sources:[...data.sources.filter(s=>s.name!=='연구실 홈페이지 논문 목록'),{type:'papers',name:'연구실 홈페이지 논문 목록',url:catalog.source,importedAt:catalog.checked+'T00:00:00Z'}]});
}
