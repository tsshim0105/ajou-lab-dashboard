function createResearchBriefing(markup) {
 let selectedBriefingTopic="";
 return function mountResearchBriefing(root) {
 root.innerHTML=markup;
 const topicList=root.querySelector('#brief-topics');
 const status=root.querySelector('#brief-status');
 const view=root.querySelector('#brief-view');
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
  const section=el('section',null,'section-card briefing-card');
  section.append(el('h2',title));
  if(subtitle)section.append(el('p',subtitle,'muted'));
  return section;
 }
 function list(lines){
  const ul=el('ul');
  for(const line of lines)ul.append(el('li',line));
  return ul;
 }
 let loadController;
 let saving=false;
 async function save(brief,topic,form,values,message){
  const button=form.querySelector('button');
  saving=true;
  button.disabled=true;
  for(const tag of topicList.children)tag.disabled=true;
  try{
   const next=await request(topic,{...values,version:brief.version,meetingId:brief.latest.id});
   render(next,topic);
   status.textContent=message;
  }catch(error){status.textContent=error.message;}
  finally{saving=false;button.disabled=false;for(const tag of topicList.children)tag.disabled=false;}
 }
 function editor(task,brief,topic){
  const details=el('details');
  details.append(el('summary','이번 회의 결과 연결','secondary briefing-action'));
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
  const saveButton=el('button','저장','primary');
  const reports=[...brief.latest.progress,...brief.latest.feedback].filter(line=>line.length<=1500);
  if(reports.length){
   const label=el('label','이번 회의 보고에서 가져오기');
   const select=el('select');
   const empty=el('option','보고 항목 선택');empty.value='';select.append(empty);
   for(const [index,line] of reports.entries()){const option=el('option',line);option.value=String(index);select.append(option);}
   select.onchange=()=>{if(select.value!=='')note.value=reports[Number(select.value)];};
   label.append(select);form.append(label);
  }
  form.append(stateLabel,noteLabel,pinLabel,saveButton);
  form.addEventListener('submit',event=>{
   event.preventDefault();
   if(!saving)save(brief,topic,form,{taskId:task.id,state:state.value,note:note.value,pinned:pin.checked},'이번 회의에 결과를 연결했습니다.');
  });
  details.append(form);
  return details;
 }
 function taggedText(text){
  const line=el('span');
  const pattern=/\[\[(?:학생|이름|담당자)\s*:\s*([^\]\n]+)\]\]|[（(](?:학생|이름|담당자)\s*[:：]\s*([^）)\n]+)[）)]/g;
  let cursor=0;
  for(const match of text.matchAll(pattern)){
   line.append(document.createTextNode(text.slice(cursor,match.index)));
   for(const name of (match[1]||match[2]).split(/[,、·]/).map(name=>name.trim()).filter(Boolean))line.append(el('span',name,'person-tag'));
   cursor=match.index+match[0].length;
  }
  line.append(document.createTextNode(text.slice(cursor)));
  return line;
 }
 function taskTitle(task){
  const line=el('h3');
  const stamp=new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',timeZone:'Asia/Seoul'});
  if(Number.isFinite(Date.parse(task.first)))line.append(el('time',stamp.format(new Date(task.first)),'date-tag'));
  line.append(taggedText(task.text));return line;
 }
 function taskRow(task,brief,topic){
  const item=el('article',null,'task');
  const heading=el('div',null,'task-heading');
  heading.append(taskTitle(task),el('span',task.state,task.state==='완료'?'badge state done':'badge state'));
  item.append(heading);
  const update=task.updates.filter(entry=>entry.meetingId===brief.latest.id).at(-1);
  const notes=update?.note?[update.note]:task.discussion||[];
  if(notes.length){
   const report=el('div',null,'task-report');
   report.append(el('strong',update?.note?'이번 회의 결과':'이번 회의 관련 논의'));
   for(const note of notes){const line=el('p');line.append(taggedText(note));report.append(line);}
   item.append(report);
  }
  item.append(editor(task,brief,topic));
  return item;
 }
 function trackingCard(task){
  const item=el('article',null,'track');
  item.append(taskTitle(task),el('p',task.state,'muted'));
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
 let active='follow';
 function render(brief,topic){
  view.replaceChildren();
  if(!brief.latest){view.append(card('저장된 회의 요약이 없습니다.'));return;}
  const tabs=el('nav',null,'rr-views briefing-tabs');
  tabs.setAttribute('aria-label','연구브리핑 메뉴');
  for(const [key,label] of [['follow','후속 결과'],['proposals','새로운 제안'],['tracking','실험 추적']]){
   const button=el('button',label,'secondary');
   button.type='button';button.setAttribute('aria-pressed',String(key===active));
   button.onclick=()=>{if(!saving){active=key;render(brief,topic);}};
   tabs.append(button);
  }
  const title=el('p','최근 회의 · '+displayDate(brief.latest.date),'briefing-date');
  const toolbar=el('div',null,'briefing-toolbar');
  toolbar.append(tabs,title);view.append(toolbar);
  if(active==='proposals'){
   const proposals=card('새로운 제안 · '+brief.proposals.length+'건');
   if(brief.proposals.length){
    for(const proposal of brief.proposals){
     const item=el('article',null,'task');
     const line=el('p');line.append(taggedText(proposal.text));item.append(line,el('p',displayDate(proposal.date)+' · '+proposal.source,'muted'));
     proposals.append(item);
    }
   }else proposals.append(el('p','등록된 제안이 없습니다.','muted'));
   const form=el('form',null,'edit');
   const label=el('label','이번 회의 제안 추가');
   const input=el('textarea');input.rows=2;input.maxLength=1500;input.required=true;
   label.append(input);form.append(label,el('button','제안 저장','primary'));
   form.onsubmit=event=>{event.preventDefault();if(!saving)save(brief,topic,form,{kind:'proposal',text:input.value},'새 제안을 저장했습니다.');};
   proposals.append(form);view.append(proposals);return;
  }
  if(active==='tracking'){
   const tracking=card('계속 추적하는 실험');
   const tracked=brief.tasks.filter(task=>task.pinned||task.mentions.length>1||task.updates.length>1);
   if(tracked.length){
    const grid=el('div',null,'tracking');
    grid.append(...tracked.map(trackingCard));tracking.append(grid);
   }else tracking.append(el('p','반복 기록이 쌓이거나 후속 실험을 추적 카드로 지정하면 여기에 표시됩니다.','muted'));
   view.append(tracking);return;
  }
  const old=brief.tasks.filter(task=>task.mentions[0].id!==brief.latest.id);
  const fresh=brief.tasks.filter(task=>task.mentions[0].id===brief.latest.id);
  const reviewed=old.filter(task=>task.updates.some(update=>update.meetingId===brief.latest.id)||task.discussion?.length);
  const carry=old.filter(task=>task.state!=='완료'&&!reviewed.includes(task));
  const prior=card('지난 할 일 · 이번 회의 논의');
  prior.classList.add('briefing-lavender');
  if(reviewed.length)prior.append(...reviewed.map(task=>taskRow(task,brief,topic)));
  else prior.append(el('p','이번 회의 요약에서 지난 할 일과 연결된 논의를 찾지 못했습니다.','muted'));
  const next=card('이번 회의에서 정한 할 일');
  if(fresh.length)next.append(...fresh.map(task=>taskRow(task,brief,topic)));
  else next.append(el('p','새로 기록된 후속 실험이 없습니다.','muted'));
  next.classList.add('briefing-mint');
  view.append(prior,next);
  const completed=old.filter(task=>task.state==='완료'&&!reviewed.includes(task));
  if(completed.length){
   const archive=el('details',null,'section-card');
   archive.append(el('summary','이전에 완료한 실험 · '+completed.length+'건'),...completed.map(task=>taskRow(task,brief,topic)));
   view.append(archive);
  }
  const upcoming=card('다음 회의로 이월 · '+carry.length+'건');
  upcoming.classList.add('briefing-carry');
  if(carry.length)upcoming.append(...carry.map(task=>taskRow(task,brief,topic)));
  else upcoming.append(el('p','이번 회의에서 다루지 않은 지난 할 일이 없습니다.','muted'));
  view.append(upcoming);
 }
 async function load(topic){
  loadController?.abort();
  const controller=new AbortController();
  loadController=controller;
  for(const tag of topicList.children)tag.setAttribute('aria-pressed',String(tag.dataset.topic===topic));
  view.replaceChildren();
  status.textContent=topic?'연구 브리핑을 불러오는 중…':'';
  selectedBriefingTopic=topic;
  if(!topic)return;
  try{
   const data=await request(topic,null,controller.signal);
   if(controller.signal.aborted)return;
   status.textContent='';
   render(data,topic);
  }catch(error){if(!controller.signal.aborted){selectedBriefingTopic='';status.textContent=error.message;}}
 }
 request().then(({topics})=>{
  if(!root.isConnected)return;
  for(const topic of topics){
   const tag=el('button',topic.title+(topic.archived?' · 보관':''),'secondary briefing-tag');
   tag.type='button';tag.dataset.topic=topic.id;
   tag.setAttribute('aria-pressed','false');
   tag.onclick=()=>{if(!saving&&selectedBriefingTopic!==topic.id)void load(topic.id);};
   topicList.append(tag);
  }
  status.textContent=topics.length?'':'등록된 연구 주제가 없습니다.';
  const initial=topics.find(topic=>topic.id===selectedBriefingTopic)||topics[0];
  if(initial)void load(initial.id);
 }).catch(error=>{status.textContent=error.message;});
 };
}

const briefingMarkup = `<style>
#researchBriefingRoot{--brief-accent:var(--menu-ink,#1769e8);--brief-tint:var(--tint,#f5f9ff);--brief-border:var(--edge,#dce4ee);color:var(--text)}
#researchBriefingRoot .briefing-header{margin-bottom:14px}
#researchBriefingRoot .briefing-header h1{border:0;margin:0 0 10px;padding:0;font-size:22px}
#researchBriefingRoot .briefing-topics{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
#researchBriefingRoot .briefing-tag{border-radius:999px;padding:5px 11px;max-width:100%;overflow-wrap:anywhere}
#researchBriefingRoot .briefing-tag[aria-pressed="true"]{background:var(--menu-bg,#edf4ff);color:var(--brief-accent);font-weight:700;border-color:var(--brief-accent)}
#researchBriefingRoot #brief-status:empty{display:none}
#researchBriefingRoot #brief-view{display:grid;gap:14px}
#researchBriefingRoot .briefing-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
#researchBriefingRoot .briefing-tabs{display:flex;flex-wrap:wrap;gap:4px}
#researchBriefingRoot .briefing-tabs button{border-radius:8px;border-color:transparent;background:transparent;color:var(--text);font-weight:650}
#researchBriefingRoot .briefing-tabs button[aria-pressed="true"]{background:var(--menu-bg,#edf4ff);color:var(--brief-accent);border-color:var(--brief-border)}
#researchBriefingRoot .briefing-date{margin:0;color:var(--text);opacity:.78;font-size:13px}

#researchBriefingRoot .briefing-card{min-width:0;padding:16px 18px;border:1px solid var(--brief-border);border-radius:14px;background:var(--surface);overflow-wrap:anywhere}
#researchBriefingRoot .briefing-card h2{margin:0 0 12px}
#researchBriefingRoot .briefing-card:is(.briefing-lavender,.briefing-mint,.briefing-carry){padding-top:0;overflow:hidden}
#researchBriefingRoot .briefing-card:is(.briefing-lavender,.briefing-mint,.briefing-carry)>h2{margin:0 -18px 12px;padding:8px 18px;border-bottom:1px solid var(--brief-border);font-size:15px;background:var(--brief-heading,var(--brief-tint))}
#researchBriefingRoot .briefing-lavender{--brief-heading:linear-gradient(105deg,#ede8f8,#e2edf6)}
#researchBriefingRoot .briefing-mint{--brief-heading:linear-gradient(105deg,#e1eef5,#d8f0e8)}
#researchBriefingRoot .briefing-carry{--brief-heading:linear-gradient(105deg,#edf5fa,#e4eff4)}
[data-theme=dark] #researchBriefingRoot .briefing-lavender{--brief-heading:linear-gradient(105deg,#392d50,#243d51)}
[data-theme=dark] #researchBriefingRoot .briefing-mint{--brief-heading:linear-gradient(105deg,#263e51,#25483f)}
[data-theme=dark] #researchBriefingRoot .briefing-carry{--brief-heading:linear-gradient(105deg,#25374a,#294555)}
#researchBriefingRoot .task-report{margin-top:9px;padding-left:10px;border-left:2px solid var(--brief-border)}
#researchBriefingRoot :is(.date-tag,.person-tag){display:inline-block;margin-right:6px;border:1px solid var(--brief-border);border-radius:999px;padding:1px 7px;font-size:12px;font-weight:650;background:var(--menu-bg,var(--brief-tint));white-space:nowrap}
#researchBriefingRoot .date-tag{font-variant-numeric:tabular-nums;color:var(--brief-accent)}
#researchBriefingRoot .briefing-card>.task{border:0;border-top:1px solid var(--brief-border);border-radius:0;background:transparent;margin:0;padding:10px 0}
#researchBriefingRoot .briefing-card>h2+.task{border-top:0}
#researchBriefingRoot .briefing-carry ul{padding-inline-start:20px;margin-bottom:0}
#researchBriefingRoot .briefing-carry li+li{margin-top:7px}
#researchBriefingRoot .task{background:var(--brief-tint);border:1px solid var(--brief-border);border-radius:11px;padding:12px;margin-top:8px}
#researchBriefingRoot .task p{margin:5px 0;white-space:pre-wrap}
#researchBriefingRoot .task-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:start;gap:8px}
#researchBriefingRoot .task-heading h3{flex:1 1 220px;margin:0}
#researchBriefingRoot .state{border-radius:999px;color:var(--brief-accent);background:var(--menu-bg,#edf4ff);font-size:12px;white-space:nowrap}
#researchBriefingRoot .state.done{color:#146144;background:#dff4e8}
#researchBriefingRoot .briefing-action{display:list-item;width:fit-content;border-radius:8px;list-style-position:inside;cursor:pointer}
#researchBriefingRoot .edit{display:grid;gap:8px;margin:10px 0 0}
#researchBriefingRoot .edit label{display:grid;gap:4px;min-width:0}
#researchBriefingRoot .edit :is(select,textarea){width:100%;min-width:0}
#researchBriefingRoot .edit .check{display:flex;gap:6px;align-items:center}
#researchBriefingRoot .edit button{justify-self:start;border-radius:9px}
#researchBriefingRoot .tracking{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
#researchBriefingRoot .track{background:var(--brief-tint);border:1px solid var(--brief-border);border-radius:12px;padding:12px;overflow-wrap:anywhere}
#researchBriefingRoot .track-row{border-top:1px solid var(--brief-border);padding-top:8px;margin-top:8px}
#researchBriefingRoot .track-row ul{margin:4px 0;padding-inline-start:20px}
@media(max-width:680px){#researchBriefingRoot .briefing-card{padding-inline:12px}#researchBriefingRoot .briefing-card:is(.briefing-lavender,.briefing-mint,.briefing-carry)>h2{margin-inline:-12px;padding-inline:12px}}
</style>
<header class="briefing-header"><h1>연구브리핑</h1>
<div id="brief-topics" class="briefing-topics" role="group" aria-label="연구 주제"></div></header>
<p id="brief-status" role="status" class="muted">연구 주제를 불러오는 중…</p>
<div id="brief-view"></div>`;

// Keep all browser-side state inside the serialized factory so production
// minification cannot break its references to Worker-side variables.
export const researchBriefingScript = '<script>globalThis.mountResearchBriefing=('+createResearchBriefing.toString()+')('+
 JSON.stringify(briefingMarkup)+');</script>';
