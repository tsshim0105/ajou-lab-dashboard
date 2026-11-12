function mountResearchBriefing(root) {
 root.innerHTML=briefingMarkup;
 const picker=root.querySelector('#brief-topic');
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
  const section=el('section',null,'section-card');
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
  button.disabled=picker.disabled=true;
  try{
   const next=await request(topic,{...values,version:brief.version,meetingId:brief.latest.id});
   render(next,topic);
   status.textContent=message;
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
 let active='follow';
 function render(brief,topic){
  view.replaceChildren();
  if(!brief.latest){view.append(card('저장된 회의 요약이 없습니다.'));return;}
  const tabs=el('nav',null,'rr-views briefing-tabs');
  tabs.setAttribute('aria-label','연구브리핑 메뉴');
  for(const [key,label] of [['follow','후속 결과'],['proposals','새로운 제안'],['tracking','실험 추적']]){
   const button=el('button',label,key===active?'active':'');
   button.type='button';button.setAttribute('aria-pressed',String(key===active));
   button.onclick=()=>{if(!saving){active=key;render(brief,topic);}};
   tabs.append(button);
  }
  const title=el('p','최근 회의 · '+displayDate(brief.latest.date),'muted');
  view.append(tabs,title);
  if(active==='proposals'){
   const proposals=card('새로운 제안 · '+brief.proposals.length+'건');
   if(brief.proposals.length){
    for(const proposal of brief.proposals){
     const item=el('article',null,'task');
     item.append(el('p',proposal.text),el('p',displayDate(proposal.date)+' · '+proposal.source,'muted'));
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
  const carry=brief.tasks.filter(task=>task.state!=='완료');
  const upcoming=card('다음 회의로 이월 · '+carry.length+'건');
  upcoming.append(carry.length?list(carry.map(task=>task.text)):el('p','이월할 항목이 없습니다.','muted'));
  const prior=card('지난 할 일 · 이번 회의 결과');
  const reviewed=old.filter(task=>task.state!=='완료'||task.updates.some(update=>update.meetingId===brief.latest.id));
  if(reviewed.length)prior.append(...reviewed.map(task=>taskRow(task,brief,topic)));
  else prior.append(el('p','검토할 이전 후속 실험이 없습니다.','muted'));
  const next=card('이번 회의에서 정한 할 일');
  if(fresh.length)next.append(...fresh.map(task=>taskRow(task,brief,topic)));
  else next.append(el('p','새로 기록된 후속 실험이 없습니다.','muted'));
  view.append(prior,upcoming,next);
  const completed=old.filter(task=>!reviewed.includes(task));
  if(completed.length){
   const archive=el('details',null,'section-card');
   archive.append(el('summary','이전에 완료한 실험 · '+completed.length+'건'),...completed.map(task=>taskRow(task,brief,topic)));
   view.append(archive);
  }
 }
 async function load(){
  loadController?.abort();
  const controller=new AbortController();
  loadController=controller;
  const topic=picker.value;
  view.replaceChildren();
  status.textContent=topic?'연구 브리핑을 불러오는 중…':'';
  selectedBriefingTopic=topic;
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
  if(topics.some(topic=>topic.id===selectedBriefingTopic)){picker.value=selectedBriefingTopic;void load();}
 }).catch(error=>{status.textContent=error.message;});
}

const briefingMarkup = `<style>
#researchBriefingRoot .briefing-picker{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#researchBriefingRoot #brief-status:empty{display:none}
#researchBriefingRoot #brief-view{display:grid;gap:12px;margin-top:12px}
#researchBriefingRoot .briefing-tabs{display:flex;flex-wrap:wrap;gap:6px}
#researchBriefingRoot .briefing-tabs button[aria-pressed="true"]{background:var(--menu-bg,#edf4ff);color:var(--menu-ink,#1458bf);font-weight:700}
#researchBriefingRoot .task,#researchBriefingRoot .track-row{border-top:1px solid var(--edge,#dce4ee);padding:10px 0}
#researchBriefingRoot .task-heading{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}
#researchBriefingRoot .task-heading h3{margin:0;overflow-wrap:anywhere}
#researchBriefingRoot .state{font-size:13px;color:var(--menu-ink,#1458bf);font-weight:700}
#researchBriefingRoot .edit{display:grid;gap:8px;margin:8px 0}
#researchBriefingRoot .edit label{display:grid;gap:3px}
#researchBriefingRoot .edit .check{display:flex;gap:6px;align-items:center}
#researchBriefingRoot .edit button{justify-self:start}
#researchBriefingRoot .tracking{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px}
#researchBriefingRoot .track{border:1px solid var(--edge,#dce4ee);border-radius:8px;padding:10px;overflow-wrap:anywhere}
</style>
<div class="research-title"><h1>연구브리핑</h1></div>
<label class="briefing-picker" for="brief-topic">연구 주제 <select id="brief-topic" disabled><option value="">연구 주제 선택</option></select></label>
<p id="brief-status" role="status" class="muted">연구 주제를 불러오는 중…</p>
<div id="brief-view"></div>`;

export const researchBriefingScript = '<script>let selectedBriefingTopic="";const briefingMarkup='+
 JSON.stringify(briefingMarkup)+';'+mountResearchBriefing.toString()+'</script>';
