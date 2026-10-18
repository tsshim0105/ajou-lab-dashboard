const defaultMeetingDates=[
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
export function scheduleRows(data){
 return [...(data.groupMeetings===undefined?defaultMeetingDates.map((r,i)=>({id:'initial-'+i,date:r[0],kind:r[1],presenter:r[2],time:'15:00',location:'팔달관 1000호'})):data.groupMeetings).map(r=>({...r,key:'meeting:'+r.id,title:r.kind||'그룹미팅',detail:[r.date,r.time,r.presenter,r.location].filter(Boolean).join(' · ')})),...(Array.isArray(data.gameNights)?data.gameNights:data.gameNight?[{...data.gameNight,month:data.gameNight.date?.slice(0,7)||'legacy'}]:[]).filter(r=>r.date||r.game).map(r=>({...r,key:'game:'+r.month,title:'NISML Game Night',detail:[r.date||r.month,r.game].filter(Boolean).join(' · ')}))];
}
export function recordScheduleAdditions(state,before,after,actor){
 const old=new Set(scheduleRows(before).map(r=>r.key));
 const added=scheduleRows(after).filter(r=>!old.has(r.key)).map(r=>({id:crypto.randomUUID(),at:new Date().toISOString(),actor,type:'groupMeetings',action:'등록',label:r.title+' 일정 등록',title:r.title,detail:r.detail}));
 state.notifications=[...added.reverse(),...(state.notifications||[])].slice(0,200);
}
export function recordScheduleDay(state,now=new Date()){
 const today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10);
 const sent=new Set(state.scheduleDaySent||[]),added=[];
 for(const r of scheduleRows(state.data)){
  const key=today+':'+r.key;
  if(r.date!==today||sent.has(key))continue;
  sent.add(key);added.push({id:'schedule-day:'+key,at:now.toISOString(),actor:'일정 알림',type:'groupMeetings',action:'당일',label:'오늘 '+r.title,title:r.title,detail:r.detail});
 }
 if(!added.length)return false;
 state.scheduleDaySent=[...sent].filter(k=>k.slice(0,10)>=today).slice(-2000);
 state.notifications=[...added,...(state.notifications||[])].slice(0,200);return true;
}
