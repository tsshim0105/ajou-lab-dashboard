function runResearchBriefing() {
 const picker=document.querySelector('#brief-topic');
 const status=document.querySelector('#brief-status');
 const view=document.querySelector('#brief-view');
 const date=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Seoul'});
 const displayDate=value=>Number.isFinite(Date.parse(value))?date.format(new Date(value)):'날짜 미기록';
 const el=(tag,text,cls)=>{
  const node=document.createElement(tag);
  if(text)node.textContent=text;
  if(cls)node.className=cls;
  return node;
 };
 async function request(topic,body,signal){
  const url='/api/research-briefing'+(topic?'?topic='+encodeURIComponent(topic):'');
  const options=body?{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify(body)}:{cache:'no-store',signal};
  const response=await fetch(url,options);
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'연구 브리핑을 불러오지 못했습니다.');
  return data;
 }
 function card(title,subtitle){
  const section=el('section',null,'card');
  section.append(el('h2',title));
  if(subtitle)section.append(el('p',subtitle,'muted'));
  return section;
 }
 function list(lines){
  const ul=el('ul');
  for(const line of lines)ul.append(el('li',line));
  return ul;
 }
 function summary(title,meeting){
  const dateLabel=meeting?[displayDate(meeting.date),meeting.status==='draft'?'요약 초안':null].filter(Boolean).join(' · '):null;
  const section=card(title,dateLabel);
  if(!meeting){
   section.append(el('p','이전 회의 요약이 없습니다.','muted'));
   return section;
  }
  const lines=[...meeting.progress,...meeting.feedback];
  if(lines.length){
   section.append(list(lines.slice(0,4)));
   if(lines.length>4){
    const details=el('details');
    details.append(el('summary','나머지 회의 내용'),list(lines.slice(4)));
    section.append(details);
   }
  }else section.append(el('p','저장된 요약에 진행 내용이 없습니다.','muted'));
  return section;
 }
 let loadController;
 let saving=false;
 async function save(task,brief,topic,form){
  const input=new FormData(form);
  const button=form.querySelector('button');
  saving=true;
  button.disabled=picker.disabled=true;
  try{
   const next=await request(topic,{taskId:task.id,version:brief.version,meetingId:brief.latest.id,
    state:input.get('state'),note:input.get('note'),pinned:input.has('pinned')});
   render(next,topic);
   status.textContent='이번 회의에 결과를 연결했습니다.';
  }catch(error){status.textContent=error.message;}
  finally{saving=false;button.disabled=picker.disabled=false;}
 }
 function editor(task,brief,topic){
  const details=el('details');
  details.append(el('summary','이번 회의 결과 연결'));
  const form=el('form',null,'edit');
  const stateLabel=el('label','상태');
  const state=el('select');
  state.name='state';
  for(const name of ['결과 미연결','진행 중','완료']){
   const option=el('option',name);option.value=name;state.append(option);
  }
  state.value=task.state;
  stateLabel.append(state);
  const noteLabel=el('label','이번 회의 결과 또는 관찰');
  const note=el('textarea');
  note.name='note';note.maxLength=1500;note.rows=3;noteLabel.append(note);
  const pinLabel=el('label',null,'check');
  const pin=el('input');pin.name='pinned';pin.type='checkbox';pin.checked=task.pinned;
  pinLabel.append(pin,document.createTextNode('별도 추적 카드로 표시'));
  const saveButton=el('button','저장');
  form.append(stateLabel,noteLabel,pinLabel,saveButton);
  form.addEventListener('submit',event=>{event.preventDefault();if(!saving)save(task,brief,topic,form);});
  details.append(form);
  return details;
 }
 function taskRow(task,brief,topic){
  const item=el('article',null,'task');
  const heading=el('div',null,'task-heading');
  heading.append(el('h3',task.text),el('span',task.state,task.state==='완료'?'state done':'state'));
  item.append(heading,el('p','처음 제안 · '+displayDate(task.first),'muted'));
  const update=task.updates.filter(entry=>entry.meetingId===brief.latest.id).at(-1);
  if(update?.note)item.append(el('p',update.note));
  else if(update)item.append(el('p','이번 회의에 상태를 저장했습니다.','muted'));
  else item.append(el('p','이번 회의 결과 미연결','muted'));
  item.append(editor(task,brief,topic));
  return item;
 }
 function trackingCard(task){
  const item=el('article',null,'track');
  item.append(el('h3',task.text),el('p',task.state,'muted'));
  const history=new Map(task.mentions.map(entry=>[entry.id,{date:entry.date,lines:['회의 요약에 후속 실험으로 기록']}]));
  for(const update of task.updates){
   if(!history.has(update.meetingId))history.set(update.meetingId,{date:update.date,lines:[]});
   history.get(update.meetingId).lines.push(update.state+(update.note?' · '+update.note:''));
  }
  for(const entry of [...history.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)))){
   const row=el('div',null,'track-row');
   row.append(el('strong',displayDate(entry.date)),list(entry.lines));
   item.append(row);
  }
  return item;
 }
 function render(brief,topic){
  view.replaceChildren();
  if(!brief.latest){view.append(card('저장된 회의 요약이 없습니다.'));return;}
  const old=brief.tasks.filter(task=>task.mentions[0].id!==brief.latest.id);
  const fresh=brief.tasks.filter(task=>task.mentions[0].id===brief.latest.id);
  const carry=brief.tasks.filter(task=>task.state!=='완료');
  const top=el('div',null,'overview');
  const upcoming=card('다음 회의로 이월 · '+carry.length+'건');
  upcoming.classList.add('carry');
  upcoming.append(carry.length?list(carry.map(task=>task.text)):el('p','이월할 항목이 없습니다.','muted'));
  top.append(summary('지난 회의 요약',brief.previous),upcoming);
  const current=summary('이번 회의 보고',brief.latest);
  const prior=card('지난번에 하기로 한 일 · 이번 회의 결과');
  const reviewed=old.filter(task=>task.state!=='완료'||task.updates.some(update=>update.meetingId===brief.latest.id));
  if(reviewed.length)prior.append(...reviewed.map(task=>taskRow(task,brief,topic)));
  else prior.append(el('p','검토할 이전 후속 실험이 없습니다.','muted'));
  const next=card('이번 회의에서 제안한 후속 실험');
  if(fresh.length)next.append(...fresh.map(task=>taskRow(task,brief,topic)));
  else next.append(el('p','새로 기록된 후속 실험이 없습니다.','muted'));
  const tracking=card('계속 추적하는 실험');
  const tracked=brief.tasks.filter(task=>task.pinned||task.mentions.length>1||task.updates.length>1);
  if(tracked.length){
   const grid=el('div',null,'tracking');
   grid.append(...tracked.map(trackingCard));tracking.append(grid);
  }else tracking.append(el('p','반복 기록이 쌓이거나 후속 실험을 추적 카드로 지정하면 여기에 표시됩니다.','muted'));
  const completed=old.filter(task=>!reviewed.includes(task));
  if(completed.length){
   const archive=el('details',null,'card');
   archive.append(el('summary','이전에 완료한 실험 · '+completed.length+'건'),...completed.map(task=>taskRow(task,brief,topic)));
   view.append(top,current,prior,next,tracking,archive);
  }else view.append(top,current,prior,next,tracking);
 }
 async function load(){
  loadController?.abort();
  const controller=new AbortController();
  loadController=controller;
  const topic=picker.value;
  view.replaceChildren();
  status.textContent=topic?'연구 브리핑을 불러오는 중…':'';
  if(!topic)return;
  try{
   const data=await request(topic,null,controller.signal);
   if(controller.signal.aborted)return;
   status.textContent='';
   render(data,topic);
  }catch(error){if(!controller.signal.aborted)status.textContent=error.message;}
 }
 picker.addEventListener('change',load);
 request().then(({topics})=>{
  for(const topic of topics){
   const option=el('option',topic.title+(topic.archived?' · 보관':''));
   option.value=topic.id;picker.append(option);
  }
  picker.disabled=!topics.length;
  status.textContent=topics.length?'':'등록된 연구 주제가 없습니다.';
 }).catch(error=>{status.textContent=error.message;});
}

export const researchBriefingPage = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>연구브리핑 · NISML Hub</title>
<style>
:root{color-scheme:dark;--ink:#eff6ff;--sub:#b8c8df;--line:#425979;--mint:#89f2d2;--violet:#d0c1ff;--amber:#ffdaa2}
*{box-sizing:border-box}body{margin:0;color:var(--ink);background:radial-gradient(ellipse at top right,#392859,transparent 60%),radial-gradient(ellipse at top left,#123b45,transparent 52%),#091020;font:15px/1.55 system-ui,sans-serif;min-height:100vh}
main{max-width:1110px;margin:auto;padding:22px 18px 50px}nav{display:flex;gap:16px;border-bottom:1px solid var(--line);padding-bottom:12px}
a,summary{color:var(--mint)}h1,h2,h3,p{margin:0;overflow-wrap:anywhere}h1{font-size:clamp(28px,5vw,42px);margin-top:22px}h2{font-size:18px;margin-bottom:8px}h3{font-size:15px}.muted{color:var(--sub);font-size:13px}
.picker{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}select,textarea,button{font:inherit;color:inherit;background:#142640;border:1px solid #6985a8;border-radius:7px;padding:7px 9px;max-width:100%}button,summary{cursor:pointer}button:disabled,select:disabled{opacity:.65}button{background:#9cf1d7;color:#0d2635;font-weight:700;width:max-content}a:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--violet);outline-offset:3px}
#brief-status{min-height:1.5em;margin:8px 0;color:var(--amber)}#brief-view{display:grid;gap:14px}.overview,.tracking{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.card{background:#131f35;border:1px solid var(--line);border-radius:12px;padding:15px;min-width:0}.carry{border-color:#826d71;background:linear-gradient(135deg,#2e293d,#15253a)}.carry h2{color:var(--amber)}ul{padding-left:21px;margin:8px 0 0}li+li{margin-top:5px}details{margin-top:8px}
.task,.track-row{border-top:1px solid var(--line);padding:10px 0}.task-heading{display:flex;justify-content:space-between;gap:10px}.state{flex:none;color:var(--amber);font-size:13px}.done{color:var(--mint)}.track{border:1px solid var(--line);border-top:2px solid var(--violet);border-radius:8px;padding:10px;overflow-wrap:anywhere}.track-row{margin-top:6px;padding-bottom:0}.edit{display:grid;gap:8px;margin:8px 0}.edit label{display:grid;gap:3px}.edit .check{display:flex;align-items:center}
@media(max-width:620px){.overview,.tracking{grid-template-columns:1fr}.task-heading{flex-wrap:wrap}}
</style></head><body><main>
<nav aria-label="주 메뉴"><a href="./">NISML Hub</a><span aria-current="page">연구브리핑</span></nav>
<h1>연구브리핑</h1>
<label class="picker" for="brief-topic">연구 주제 <select id="brief-topic" disabled><option value="">연구 주제 선택</option></select></label>
<p id="brief-status" role="status">연구 주제를 불러오는 중…</p>
<div id="brief-view"></div></main>
<script>(${runResearchBriefing.toString()})();</script></body></html>`;
