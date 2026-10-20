const fields=['name','start','end','venue','abstracts','registration','url','note'];
const view=e=>Object.fromEntries(fields.map(k=>[k,e[k]??null]));
export const seoulDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function mergeConferenceUpdate(state,seed,input,now=new Date()){
 const day=seoulDay(now),year=Number(day.slice(0,4)),at=now.toISOString(),base=state.conferenceCatalog||seed;
 if(!input||!Array.isArray(input.events)||input.events.length>150||!Array.isArray(input.checkedIds)||input.checkedIds.length>300)throw Error('행사와 확인한 행사 목록을 입력해주세요.');
 const societies=new Set(seed.events.map(e=>e.society)),events=structuredClone(base.events),seen=new Set(),changes=[];
 const string=(v,max=2000)=>typeof v==='string'&&v.length<=max;
 const url=v=>{try{return new URL(v).protocol==='https:';}catch{return false;}};
 const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 for(const item of input.events){
  if(!item||!string(item.id,100)||!item.id||seen.has(item.id)||!societies.has(item.society)||!['domestic','international'].includes(item.group)||!string(item.name,300)||!item.name.trim()||!url(item.url)||!string(item.venue)||!string(item.note)||!Array.isArray(item.sources)||!item.sources.length||item.sources.length>15||item.sources.some(v=>!string(v)||!url(v)))throw Error('공식 출처와 행사 정보를 확인해주세요.');
  const eventYear=Number((item.start||item.id.match(/20\d{2}/)?.[0]||'').slice(0,4));
  if(eventYear<year||eventYear>year+2||(!item.start&&!item.id.match(/20\d{2}/))||(item.start&&!date(item.start))||(item.end&&!date(item.end))||(item.start&&item.end<item.start))throw Error('올해부터 향후 2개 연도 범위의 날짜만 갱신할 수 있습니다.');
  for(const key of ['abstracts','registration'])if(!Array.isArray(item[key])||item[key].length>20||item[key].some(d=>!d||!string(d.label,200)||!date(d.date)||!string(d.tz,100)||!(d.time===null||d.time===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))||!(()=>{try{new Intl.DateTimeFormat('en',{timeZone:d.tz});return true;}catch{return false;}})()))throw Error('마감일과 현지 시간대를 확인해주세요.');
  seen.add(item.id);const i=events.findIndex(e=>e.id===item.id),old=events[i];
  if(old&&(old.society!==item.society||old.group!==item.group))throw Error('기존 행사 학회를 변경할 수 없습니다.');
  const incoming=Object.fromEntries(['id','society','group',...fields,'sources'].map(k=>[k,item[k]]));
  const changed=!old||JSON.stringify(view(old))!==JSON.stringify(view(incoming));
  const next={...old,...incoming,checked:day,...(changed?{updatedAt:at}:{})};
  if(i<0)events.push(next);else events[i]=next;
  if(changed){const names={name:'행사명',start:'시작일',end:'종료일',venue:'장소',abstracts:'초록 마감',registration:'등록 마감',url:'홈페이지',note:'안내'};const changedFields=fields.filter(k=>JSON.stringify(old?.[k]??null)!==JSON.stringify(next[k]??null));changes.push({id:crypto.randomUUID(),eventId:item.id,at,actor:'자동 갱신',type:'meetingInfo',action:old?'수정':'등록',label:'학술대회 '+(old?'수정':'등록'),title:next.name,detail:changedFields.map(k=>names[k]+': '+(typeof next[k]==='string'?next[k]:JSON.stringify(next[k]))).join(' · ').slice(0,1500),changes:changedFields.map(k=>({field:names[k],before:old?.[k]??null,after:next[k]}))});}
 }
 if(input.checkedIds.some(id=>typeof id!=='string'||!events.some(e=>e.id===id)))throw Error('확인한 행사 식별자를 확인해주세요.');
 for(const e of events)if(input.checkedIds.includes(e.id))e.checked=day;
 const catalog={updated:changes.length?day:base.updated,checkedAt:at,events};
 return {state:{...state,conferenceCatalog:catalog,meetingNotificationSnapshot:events.map(e=>({id:e.id,...view(e)})),notifications:[...changes.reverse(),...(state.notifications||[])].slice(0,200)},changes:changes.length};
}
export async function readConferenceCatalog(db,seed){const row=await db.prepare('SELECT version,payload FROM dashboard_state WHERE id=1').first();if(!row)throw Error('대시보드가 초기화되지 않았습니다.');return {version:row.version,catalog:JSON.parse(row.payload).conferenceCatalog||seed};}
export async function writeConferenceCatalog(db,seed,input){
 const row=await db.prepare('SELECT version,payload FROM dashboard_state WHERE id=1').first();if(!row)throw Error('대시보드가 초기화되지 않았습니다.');if(input.version!==row.version)throw Error('자료가 변경되었습니다. 목록을 다시 읽고 재시도해주세요.');
 const result=mergeConferenceUpdate(JSON.parse(row.payload),seed,input);
 const saved=await db.prepare('UPDATE dashboard_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(result.state),row.version).run();if(!saved.meta?.changes)throw Error('다른 저장과 겹쳤습니다. 목록을 다시 읽고 재시도해주세요.');
 return {version:row.version+1,changes:result.changes,catalog:result.state.conferenceCatalog};
}
