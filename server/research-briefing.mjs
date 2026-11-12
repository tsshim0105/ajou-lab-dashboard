const briefingStates = ['결과 미연결','진행 중','완료'];

export function briefingSummary(content) {
 const sections = {progress:[],actions:[],feedback:[],proposals:[]};
 let section = 'progress';
 for (const line of String(content || '').split('\n')) {
  const text = line.replace(/^#+\s*|\*\*/g,'').trim();
  if (/^(?:새로운 제안|새 제안|신규 제안|추가 제안|제안 사항)\s*[:：]?$/.test(text)) {section='proposals';continue;}
  if (/^해야 할 일\s*[:：]?$/.test(text)) {section='actions';continue;}
  if (/^(교수 의견|개선점)/.test(text) && (/^#/.test(line) || /^(교수 의견|개선점)$/.test(text))) {section='feedback';continue;}
  if (/^연구\s*진행\s*상황$|^문제점/.test(text) && (/^#/.test(line) || !/^[-*•]/.test(line))) {section='progress';continue;}
  const item = text.replace(/^(?:[-*•]|\d+[.)])\s+/,'').replace(/\[\[(?:교수의견|주제:[^\]\n]*)\]\]/g,'')
   .replace(/\[\[(학생|이름|담당자|기한):([^\]\n]+)\]\]/g,' ($1: $2)').trim();
  if (item && !/^(?:없음|미언급|해당 없음|언급 없음)[.。]?$/.test(item)) sections[section].push(item);
 }
 return sections;
}

async function briefingTaskId(text) {
 const key = text.normalize('NFC').replace(/\s+/g,' ').trim();
 const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
 return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function buildBriefing(records, saved) {
 const tasks = new Map();
 const recent = [];
 const proposals = new Map();
 for (const record of records) {
  const summary = briefingSummary(record.content);
  recent.push({id:record.id,date:record.created,status:record.status,...summary});
  if(recent.length>2)recent.shift();
  for(const text of summary.proposals){
   const key=text.normalize('NFC').replace(/\s+/g,' ');
   if(!proposals.has(key))proposals.set(key,{text,date:record.created,source:'회의요약'});
  }
  for (const text of summary.actions) {
   const id = await briefingTaskId(text);
   if (!tasks.has(id)) tasks.set(id,{id,text,first:record.created,mentions:[]});
   const task = tasks.get(id);
   if(task.mentions.at(-1)?.id!==record.id)task.mentions.push({id:record.id,date:record.created});
  }
 }
 return {latest:recent.at(-1)||null,previous:recent.at(-2)||null,
  proposals:[...proposals.values(),...(saved.proposals||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))),
  tasks:[...tasks.values()].reverse().map(task=>({...task,state:saved[task.id]?.state||briefingStates[0],
   pinned:saved[task.id]?.pinned===true,updates:saved[task.id]?.updates||[]}))};
}

export async function researchBriefingRequest(req, db) {
 const url = new URL(req.url);
 const reply = (data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
 try {
  const topic = url.searchParams.get('topic');
  if (!topic && req.method==='GET') {
   const {results} = await db.prepare(`SELECT substr(id,7) AS id,json_extract(payload,'$.title') AS title,
    COALESCE(json_extract(payload,'$.archived'),0) AS archived FROM research_records
    WHERE id LIKE 'topic:%' AND NOT COALESCE(json_extract(payload,'$.deleted'),0)
    ORDER BY archived,title,id`).all();
   return reply({topics:results});
  }
  if(!['GET','POST'].includes(req.method))return reply({error:'허용되지 않는 요청입니다.'},405);
  if(!topic||!/^[\w-]{8,100}$/.test(topic))return reply({error:'연구주제를 확인해주세요.'},400);
  const topicRow = await db.prepare('SELECT payload FROM research_records WHERE id=?').bind('topic:'+topic).first();
  if(!topicRow||JSON.parse(topicRow.payload).deleted)return reply({error:'연구주제를 찾을 수 없습니다.'},404);
  const key = 'research-briefing:'+topic;
  const row = await db.prepare('SELECT payload,version FROM research_records WHERE id=?').bind(key).first();
  const saved = row ? JSON.parse(row.payload) : {};
  const version = row?.version ?? 0;
  const {results} = await db.prepare(`SELECT substr(r.id,11) AS id,json_extract(r.payload,'$.created') AS created,
   json_extract(s.value,'$.status') AS status,json_extract(s.value,'$.content') AS content
   FROM research_records r, json_each(r.payload,'$.summary') s
   WHERE r.id LIKE 'recording:%' AND s.key=? AND json_extract(r.payload,'$.status') IN ('ended','interrupted')
   AND trim(json_extract(s.value,'$.content'))<>''
   ORDER BY created,r.id`).bind(topic).all();
  const briefing = await buildBriefing(results,saved);
  if(req.method==='GET')return reply({version,...briefing});
  const raw = await req.text();
  if(raw.length>12000)return reply({error:'기록이 너무 깁니다.'},413);
  let input;
  try {input=JSON.parse(raw);} catch {return reply({error:'입력 형식을 확인해주세요.'},400);}
  const {taskId,state,pinned,note,meetingId} = input || {};
  if(input?.version!==version || meetingId!==briefing.latest?.id)return reply({error:'회의나 브리핑이 변경되었습니다. 다시 불러와주세요.'},409);
  if(input.kind==='proposal'){
   const text=typeof input.text==='string'?input.text.trim():'';
   if(!text||text.length>1500||!briefing.latest)return reply({error:'제안 내용을 확인해주세요.'},400);
   const existing=saved.proposals||[];
   if(!briefing.proposals.some(proposal=>proposal.text===text))saved.proposals=[...existing,{text,date:briefing.latest.date,source:'직접 등록'}];
  }else{
   if(!briefingStates.includes(state)||typeof pinned!=='boolean'||typeof note!=='string'||note.length>1500||
    !briefing.tasks.some(task=>task.id===taskId))return reply({error:'후속 실험과 기록 내용을 확인해주세요.'},400);
   const prior = saved[taskId];
   const updates = [...(prior?.updates||[])];
   if(note.trim()||state!==(prior?.state||briefingStates[0]))updates.push({meetingId,date:briefing.latest.date,state,note:note.trim()});
   saved[taskId]={state,pinned,updates};
  }
  const payload=JSON.stringify(saved);
  const result = row
   ? await db.prepare('UPDATE research_records SET payload=?,version=version+1 WHERE id=? AND version=?').bind(payload,key,version).run()
   : await db.prepare('INSERT OR IGNORE INTO research_records(id,payload,version) VALUES (?,?,1)').bind(key,payload).run();
  if(!result.meta?.changes)return reply({error:'다른 화면에서 기록을 수정했습니다. 다시 불러와주세요.'},409);
  return reply({version:version+1,...await buildBriefing(results,saved)});
 }catch{return reply({error:'연구 브리핑을 불러오거나 저장하지 못했습니다.'},503);}
}
