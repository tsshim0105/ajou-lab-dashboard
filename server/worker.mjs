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
   if(env.INITIAL_DATA_GZIP){const bytes=Uint8Array.from(atob(env.INITIAL_DATA_GZIP),c=>c.charCodeAt(0));const json=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();initial.data=validateData(JSON.parse(json));}
   await env.DB.prepare('INSERT OR IGNORE INTO lab_state VALUES (1,0,?)').bind(JSON.stringify(initial)).run();
  }
  const row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first(),state=JSON.parse(row.payload);
  if(!admin&&!state.students.includes(email))return reply({error:'연구실 접근 권한이 없습니다.'},403);
  const read=['GET','HEAD'].includes(req.method),origin=req.headers.get('Origin');
  if((origin&&origin!==url.origin)||(!read&&(origin!==url.origin||req.headers.get('X-Lab-Request')!=='1'||req.headers.get('Content-Type')!=='application/json')))return reply({error:'허용되지 않는 요청입니다.'},403);
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
