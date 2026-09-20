// Only run behind the Sites trusted authentication dispatcher, never on a public Worker origin.
export const fresh=()=>({version:0,data:{papers:[],conferences:[],funds:[],payroll:[],standards:[],sources:[],issues:[]},students:[]});
export function visible(data,admin){if(admin)return data;return {papers:data.papers.map(({points,engineeringPoints,...r})=>r),conferences:data.conferences,funds:[],payroll:[],standards:[],sources:data.sources.filter(s=>['papers','conferences'].includes(s.type)),issues:[]};}
export function validateData(d){
 if(!d||typeof d!=='object')throw Error('자료 형식이 올바르지 않습니다.');
 for(const key of ['papers','conferences','funds','payroll','standards','sources','issues'])if(!Array.isArray(d[key])||d[key].length>20000)throw Error('필수 자료 목록이 없거나 너무 큽니다.');
 for(const row of [...d.papers,...d.conferences,...d.funds,...d.payroll,...d.standards,...d.sources,...d.issues])if(!row||typeof row!=='object'||Array.isArray(row))throw Error('자료 행 형식이 올바르지 않습니다.');
 const str=JSON.stringify(d);if(str.length>1500000)throw Error('자료가 너무 큽니다.');
 for(const r of d.papers)if(typeof r.title!=='string'||!Number.isInteger(r.year))throw Error('논문 제목과 연도를 확인해주세요.');
 for(const r of d.conferences)if(typeof r.presenter!=='string'||!Number.isInteger(r.year))throw Error('발표자와 연도를 확인해주세요.');
 for(const r of d.funds)if(!Array.isArray(r.months))throw Error('연구비 월별 자료를 확인해주세요.');
 const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 const partialDateOK=s=>{if(typeof s!=='string'||!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)||s.slice(0,4)<'1900'||s.slice(0,4)>'2200')return false;return dateOK(s.length===4?s+'-01-01':s.length===7?s+'-01':s);};
 for(const p of d.papers){
  for(const k of ['correspondingAuthor','volume','issue','pages','articleNumber','doi','publicationUrl','issueDate','onlineDate'])if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>2000))throw Error('논문 출판 정보를 확인해주세요.');
  for(const k of ['issueDate','onlineDate'])if(p[k]&&!partialDateOK(p[k]))throw Error('논문 출판일을 확인해주세요.');
  if(p.publicationUrl&&!/^https:\/\//i.test(p.publicationUrl))throw Error('논문 링크는 https 주소여야 합니다.');
  if(p.paperEditedFields!==undefined&&(!Array.isArray(p.paperEditedFields)||p.paperEditedFields.length>50||p.paperEditedFields.some(k=>!['title','year','journal','firstAuthor','correspondingAuthor','volume','issue','pages','articleNumber','issueDate','onlineDate','doi','publicationUrl','fund','status','citation'].includes(k))))throw Error('논문 수정 항목을 확인해주세요.');
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
export function createWorker(html){return {async fetch(req,env){const url=new URL(req.url),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie, oai-authenticated-user-id, oai-authenticated-user-email','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'"};
 const reply=(body,status=200,type)=>new Response(req.method==='HEAD'?null:typeof body==='string'?body:JSON.stringify(body),{status,headers:{...headers,...(type?{'Content-Type':type}:{})}});
 try{
  const email=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase(),id=req.headers.get('oai-authenticated-user-id');
  if(!id||!email)return reply({error:'승인된 계정으로 로그인해주세요.'},401);
  if(!env.ADMIN_EMAIL)return reply({error:'관리자 계정 설정이 필요합니다.'},503);
  const admin=email===env.ADMIN_EMAIL.trim().toLowerCase();
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
  if(!admin&&!state.students.includes(email))return reply({error:'연구실 접근 권한이 없습니다.'},403);
  const read=['GET','HEAD'].includes(req.method),origin=req.headers.get('Origin');
  if((origin&&origin!==url.origin)||(!read&&(origin!==url.origin||req.headers.get('X-Lab-Request')!=='1'||req.headers.get('Content-Type')!=='application/json')))return reply({error:'허용되지 않는 요청입니다.'},403);
  if(admin&&read&&url.pathname==='/api/data'&&env.PAPER_CATALOG_REVISION&&state.paperCatalogRevision!==env.PAPER_CATALOG_REVISION){
   const count=Number(env.PAPER_CATALOG_CHUNKS);if(!Number.isInteger(count)||count<1||count>16)throw Error('논문 갱신 자료 설정을 확인해주세요.');
   const compressed=Array.from({length:count},(_,i)=>env['PAPER_CATALOG_GZIP_'+(i+1)]||'').join('');
   const bytes=Uint8Array.from(atob(compressed),c=>c.charCodeAt(0));
   const catalog=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
   if(catalog.revision!==env.PAPER_CATALOG_REVISION)throw Error('논문 갱신 자료 버전이 일치하지 않습니다.');
   const next={...state,data:validateData(mergePaperCatalog(state.data,catalog)),paperCatalogRevision:catalog.revision};
   const changed=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(next),row.version).run();
   if(!changed.meta?.changes)return reply({error:'자료가 변경되었습니다. 새로고침해주세요.'},409);
   row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();state=JSON.parse(row.payload);
  }
  if(read&&['/','/index.html'].includes(url.pathname))return reply(html,200,'text/html; charset=utf-8');
  if(read&&url.pathname==='/api/data')return reply({version:row.version,user:{email,role:admin?'admin':'student'},data:visible(state.data,admin),students:admin?state.students:[]});
  if(req.method==='PUT'&&['/api/data','/api/students'].includes(url.pathname)){
   if(!admin)return reply({error:'교수님만 변경할 수 있습니다.'},403);
   const reader=req.body?.getReader();let size=0,parts=[];if(!reader)return reply({error:'자료가 없습니다.'},400);
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2500000){await reader.cancel();return reply({error:'자료가 너무 큽니다.'},413);}parts.push(value);}
   const input=JSON.parse(await new Blob(parts).text());if(input.version!==row.version)return reply({error:'다른 곳에서 자료가 변경되었습니다. 새로고침 후 다시 시도해주세요.'},409);
   if(url.pathname==='/api/data')state.data=validateData(input.data);
   else {if(!Array.isArray(input.students)||input.students.length>100||input.students.some(s=>typeof s!=='string'||!/^\S+@\S+\.\S+$/.test(s)||s.length>254))return reply({error:'이메일 목록을 확인해주세요.'},400);state.students=[...new Set(input.students.map(s=>s.trim().toLowerCase()))];}
   const result=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),row.version).run();
   if(!result.meta?.changes)return reply({error:'자료가 변경되었습니다. 새로고침해주세요.'},409);
   return reply({version:row.version+1});
  }
  return reply({error:'페이지를 찾을 수 없습니다.'},404);
 }catch(e){return reply({error:e instanceof SyntaxError?'자료 형식을 확인해주세요.':e.message||'처리 중 오류가 발생했습니다.'},400);}
}};}

export function mergePaperCatalog(data,catalog){
 if(!Array.isArray(catalog.papers)||catalog.papers.length>2000)throw Error('논문 갱신 목록을 확인해주세요.');
 const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
 const signatures=p=>new Set([p.title,...(p.titleAliases||[])].map(key).filter(Boolean));
 const existing=data.papers,used=new Set();
 const papers=catalog.papers.map(p=>{
  if(!p.title||!Number.isInteger(p.year)||!Array.isArray(p.authorList)||!p.authorList.length)throw Error('논문 저자·제목·연도를 확인해주세요.');
  const keys=signatures(p);const index=existing.findIndex((r,i)=>!used.has(i)&&((r.metadataSource===catalog.source&&r.websiteNumber===p.websiteNumber)||[...signatures(r)].some(k=>keys.has(k))));
  const previous=index>=0?existing[index]:{};if(index>=0)used.add(index);
  const aliases=[...new Set([...(previous.titleAliases||[]),...(p.titleAliases||[]),previous.title,p.title].filter(t=>t&&key(t)!==key(previous.paperEditedFields?.includes('title')?previous.title:p.title)))];
  const incoming=index>=0&&Array.isArray(catalog.patchFields)?Object.fromEntries(catalog.patchFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])):p;
  const edited=Object.fromEntries((previous.paperEditedFields||[]).filter(k=>previous[k]!==undefined).map(k=>[k,previous[k]]));
  return {...previous,...incoming,...edited,id:previous.id||'nisml-paper-'+p.websiteNumber,titleAliases:aliases,role:previous.role||'미기재',fund:previous.fund||'',metadataSource:catalog.source,metadataChecked:catalog.checked};
 });
 papers.push(...existing.filter((_,i)=>!used.has(i)));
 return {...data,papers,sources:[...data.sources.filter(s=>s.name!=='연구실 홈페이지 논문 목록'),{type:'papers',name:'연구실 홈페이지 논문 목록',url:catalog.source,importedAt:catalog.checked+'T00:00:00Z'}]};
}
