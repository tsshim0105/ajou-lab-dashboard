// Private, recipient-owned copies. Caller must authenticate and enforce lab membership + CSRF first.
const lsFail=message=>{throw Error(message);};
const lsText=(v,n)=>typeof v==='string'&&v.length<=n?v:lsFail('텍스트 길이 또는 형식을 확인해 주세요.');
function lsSettings(raw,kind){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))lsFail('설정 형식을 확인해 주세요.');const out={};
 const ranges=kind==='graph'?{width:[200,2400],height:[150,1800],line:[.5,12],font:[8,72],legendFont:[8,48],marker:[2,20],barWidth:[20,95],errorWidth:[.5,12],errorCap:[0,40],legendX:[0,1],legendY:[0,1]}:{width:[400,1800],font:[12,48],padding:[4,30],line:[1,6],headerRows:[1,6]};
 for(const [k,[lo,hi]] of Object.entries(ranges)){if(raw[k]===undefined)continue;if(raw[k]===null&&['legendX','legendY'].includes(k)){out[k]=null;continue;}if(typeof raw[k]!=='number'||!Number.isFinite(raw[k])||raw[k]<lo||raw[k]>hi)lsFail('설정 범위를 확인해 주세요.');out[k]=raw[k];}
 for(const k of kind==='graph'?['title','xLabel','yLabel','x2Label','y2Label','palette','type','xDecimals','xScale','yScale']:['title','face'])if(raw[k]!==undefined)out[k]=lsText(raw[k],300);
 if(kind==='graph'){
  for(const k of ['xmin','xmax','ymin','ymax','x2min','x2max','y2min','y2max'])if(raw[k]!==undefined){if(raw[k]!==''&&!Number.isFinite(Number(raw[k])))lsFail('축 범위를 확인해 주세요.');out[k]=raw[k]===''?'':Number(raw[k]);}
  for(const k of ['grid','hideLegend'])if(raw[k]!==undefined)out[k]=raw[k]===true;
  out.formatVersion=6;out.series=(Array.isArray(raw.series)?raw.series:[]).slice(0,39).map(s=>({...(typeof s?.color==='string'&&/^#[\da-f]{6}$/i.test(s.color)?{color:s.color}:{}),...(['circle','square','diamond','triangle','cross','none'].includes(s?.shape)?{shape:s.shape}:{})}));
 }
 return out;
}
export function validateSharedArtifact(kind,input){
 if(!['graph','table'].includes(kind)||!input||typeof input!=='object')lsFail('공유 항목을 확인해 주세요.');
 const name=lsText(input.name,120).trim();if(!name)lsFail('이름을 입력해 주세요.');
 if(kind==='table'){
  const model=input.model,settings=lsSettings(model?.settings,kind),rows=model?.rows,h=settings.headerRows??2;
  if(!Number.isInteger(h)||!Array.isArray(rows)||rows.length<=h||rows.length>h+200||!Array.isArray(rows[0])||rows[0].length<1||rows[0].length>12)lsFail('테이블 크기를 확인해 주세요.');
  return {name,model:{settings,rows:rows.map(r=>{if(!Array.isArray(r)||r.length!==rows[0].length)lsFail('열 수를 확인해 주세요.');return r.map(v=>lsText(v,2000));})}};
 }
 const p=input.parsed,n=p?.names?.length,x2=p?.x2Index;
 if(!Array.isArray(p?.names)||n<2||n>39||!Array.isArray(p.data)||!p.data.length||p.data.length>10000||x2!==undefined&&(!Number.isInteger(x2)||x2<2||x2>=n-1))lsFail('그래프 데이터 크기를 확인해 주세요.');
 const names=p.names.map(v=>lsText(v,200)),data=p.data.map(r=>{if(!Array.isArray(r)||r.length!==n)lsFail('열 수를 확인해 주세요.');return r.map((v,c)=>{if(v===null||typeof v==='number'&&Number.isFinite(v))return v;if((c===0||c===x2)&&typeof v==='string')return lsText(v,200);return lsFail('그래프 수치를 확인해 주세요.');});});
 const errors={},seen=new Set();for(const [key,e] of Object.entries(p.errors||{})){const c=Number(key);if(!Number.isInteger(c)||c<=0||c>=n||c===x2||!['x','y'].includes(e?.axis)||!Number.isInteger(e.target)||e.target<=0||e.target>=n||e.target===x2||p.errors?.[e.target]||seen.has(e.axis+':'+e.target))lsFail('오차열 연결을 확인해 주세요.');seen.add(e.axis+':'+e.target);for(const r of data)if(r[c]!==null&&(typeof r[c]!=='number'||r[c]<0))lsFail('오차값을 확인해 주세요.');errors[c]={axis:e.axis,target:e.target};}
 const ycols=names.map((_,c)=>c).filter(c=>c!==0&&c!==x2&&!errors[c]);
 for(const xc of x2===undefined?[0]:[0,x2]){const cols=ycols.filter(c=>xc===0?(x2===undefined||c<x2):c>x2);if(!cols.length||!data.some(r=>r[xc]!==null&&cols.some(c=>r[c]!==null)))lsFail('각 X축에 연결된 Y 데이터가 필요합니다.');}
 for(const e of Object.values(errors))if(e.axis==='x'){const xc=x2!==undefined&&e.target>x2?x2:0;if(data.some(r=>typeof r[xc]==='string'))lsFail('문자 X축에는 X 오차를 적용할 수 없습니다.');}
 const settings=lsSettings(input.settings,kind);for(const key of ['xScale','yScale'])if(settings[key]!==undefined&&!['linear','log'].includes(settings[key]))lsFail('축 스케일을 확인해 주세요.');if(settings.xDecimals!==undefined&&!['auto','0','1','2','3','4','5','6','7','8'].includes(settings.xDecimals))lsFail('소수 자릿수를 확인해 주세요.');
 for(const prefix of ['x','y','x2','y2']){const lo=settings[prefix+'min'],hi=settings[prefix+'max'];if(lo!==undefined&&hi!==undefined&&lo!==''&&hi!==''&&lo>=hi)lsFail('축 최솟값은 최댓값보다 작아야 합니다.');}
 return {name,parsed:{names,data,errors,...(x2===undefined?{}:{x2Index:x2})},settings};
}
async function lsBody(req){if(Number(req.headers.get('Content-Length'))>1100000)lsFail('공유 데이터는 1 MB 이하로 줄여 주세요.');const text=await req.text();if(new TextEncoder().encode(text).length>1100000)lsFail('공유 데이터는 1 MB 이하로 줄여 주세요.');return JSON.parse(text);}
export async function librarySharingRequest(req,env,actor){
 const url=new URL(req.url),path=url.pathname.replace(/^\/dashboard(?=\/)/,''),read=['GET','HEAD'].includes(req.method),reply=(data,status=200)=>new Response(req.method==='HEAD'?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie, oai-authenticated-user-id, oai-authenticated-user-email'}});
 try{
  if(path==='/api/library/members'&&read)return reply({members:actor.members.filter(m=>m.email!==actor.email)});
  const db=env.DB;await db.prepare('CREATE TABLE IF NOT EXISTS library_copies (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, kind TEXT NOT NULL, sender_name TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, delivery_key TEXT UNIQUE NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS library_recipient ON library_copies(recipient,kind,id)').run();
  if(path==='/api/library/share'&&req.method==='POST'){
   const body=await lsBody(req),kind=body.kind,artifact=validateSharedArtifact(kind,body.artifact),requestId=body.requestId;
   if(typeof requestId!=='string'||!/^[-\w]{10,80}$/.test(requestId)||!Array.isArray(body.recipients)||!body.recipients.length||body.recipients.length>20)return reply({error:'공유할 구성원을 선택해 주세요.'},400);
   const recipients=[...new Set(body.recipients)];if(recipients.some(email=>email===actor.email||!actor.members.some(m=>m.email===email)))return reply({error:'현재 승인된 연구실 구성원에게만 공유할 수 있습니다.'},403);
   const now=new Date().toISOString(),payload=JSON.stringify(artifact),statements=[];
   for(const recipient of recipients){const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actor.email,requestId,recipient])))),v=>v.toString(16).padStart(2,'0')).join('');statements.push(db.prepare('INSERT OR IGNORE INTO library_copies (id,recipient,kind,sender_name,payload,updated_at,delivery_key) VALUES (?,?,?,?,?,?,?)').bind('shared_'+crypto.randomUUID(),recipient,kind,actor.name,payload,now,key));}
   await db.batch(statements);return reply({ok:true,count:recipients.length});
  }
  const match=path.match(/^\/api\/library\/(graph|table)(?:\/(shared_[\w-]+))?$/);if(!match)return reply({error:'잘못된 요청입니다.'},404);const [,kind,id]=match;
  if(!id&&read){const cursor=url.searchParams.get('after')||'';const {results}=await db.prepare('SELECT * FROM library_copies WHERE recipient=? AND kind=? AND deleted=0 AND id>? ORDER BY id LIMIT 21').bind(actor.email,kind,cursor).all();const rows=results.slice(0,20);return reply({items:rows.map(r=>({...JSON.parse(r.payload),id:r.id,updatedAt:r.updated_at,sharedBy:r.sender_name,revision:r.revision})),next:results.length>20?rows.at(-1).id:null});}
  if(!id||!['PUT','DELETE'].includes(req.method))return reply({error:'허용되지 않는 요청입니다.'},405);
  const row=await db.prepare('SELECT * FROM library_copies WHERE id=? AND recipient=? AND kind=? AND deleted=0').bind(id,actor.email,kind).first();if(!row)return reply({error:'내 보관함의 공유 항목을 찾지 못했습니다.'},404);
  const body=await lsBody(req);if(body.revision!==row.revision)return reply({error:'다른 기기에서 변경되었습니다. 보관함을 다시 열어 주세요.'},409);
  const now=new Date().toISOString(),next=req.method==='PUT'?JSON.stringify(validateSharedArtifact(kind,body.artifact)):row.payload;
  const result=await db.prepare('UPDATE library_copies SET payload=?,updated_at=?,revision=revision+1,deleted=? WHERE id=? AND recipient=? AND revision=?').bind(next,now,req.method==='DELETE'?1:0,id,actor.email,body.revision).run();if(!result.meta?.changes)return reply({error:'다른 기기에서 변경되었습니다. 보관함을 다시 열어 주세요.'},409);return reply({ok:true,revision:row.revision+1});
 }catch(e){return reply({error:e.message||'공유 요청을 처리하지 못했습니다.'},400);}
}
