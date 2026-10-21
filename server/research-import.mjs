// ChatGPT-selected results. No model calls, credentials or automatic history access.
const text=(v,n,required=false)=>{if(typeof v!=='string'||v.length>n||(required&&!v.trim()))throw Error('텍스트 길이와 필수 항목을 확인해주세요.');return v;};
const url=v=>{try{const u=new URL(v);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}throw Error('HTTPS 링크만 저장할 수 있습니다.');};
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
export async function listResearchImports(env){const rows=await env.DB.prepare("SELECT payload FROM research_records WHERE id LIKE 'topic:%'").all();return {topics:rows.results.map(r=>JSON.parse(r.payload)).map(({id,title,archived})=>({id,title,archived})),project:'연구미팅',instructions:'Use save_research_result only when the user selects an answer to save. Copy the question and answer faithfully; do not regenerate or summarize. Include paper URLs and transferable images. Report any missing image.'};}
export async function saveResearchImport(env,b){
 const title=text(b.topicTitle,120,true),question=text(b.question,12000,true),answer=text(b.answer,80000,true);
 const source=b.chatUrl?url(b.chatUrl):'';if(source&&new URL(source).hostname!=='chatgpt.com')throw Error('원본 대화 링크는 chatgpt.com 주소여야 합니다.');
 const topic=b.topicId||'chatgpt-'+(await hash(title)).slice(0,24);if(!/^[\w-]{8,100}$/.test(topic))throw Error('연구주제 ID를 확인해주세요.');
 const existing=await env.DB.prepare('SELECT payload FROM research_records WHERE id=?').bind('topic:'+topic).first();if(b.topicId&&!existing)throw Error('연구주제를 찾을 수 없습니다.');if(existing&&JSON.parse(existing.payload).archived)throw Error('보관된 주제는 복원 후 저장해주세요.');
 const id='import-'+(await hash(JSON.stringify([topic,source,question,answer]))).slice(0,40),message='ai-'+id;
 const old=await env.DB.prepare('SELECT payload FROM research_records WHERE id=?').bind('answer:'+topic+':'+message).first();if(old&&!((b.images||[]).length&&JSON.parse(old.payload).importWarnings?.length))return {ok:true,duplicate:true,topic,id,warnings:JSON.parse(old.payload).importWarnings||[]};
 if((b.papers||[]).length>30||(b.images||[]).length>8)throw Error('논문 30개, 그림 8개까지 저장할 수 있습니다.');
 const papers=(b.papers||[]).map(p=>({title:text(p.title,500,true),url:url(p.url),authors:text(p.authors||'',1000),journal:text(p.journal||'',200),year:text(p.year||'',20),doi:text(p.doi||'',160)}));
 const images=[],warnings=[];
 for(const [i,x] of (b.images||[]).entries()){
  const caption=text(x.caption||'ChatGPT에서 저장한 그림',500),origin=x.url?url(x.url):'',sourceUrl=x.source?url(x.source):origin;let bytes;
  try{
   if(x.base64){if(x.base64.length>5600000)throw Error();bytes=Uint8Array.from(atob(x.base64),c=>c.charCodeAt(0));}
   else if(origin){const host=new URL(origin).hostname;const allowed=['oaiusercontent.com','oaistatic.com','blob.core.windows.net','acs.org','wiley.com','springernature.com'];if(!allowed.some(d=>host===d||host.endsWith('.'+d)))throw Error();const r=await fetch(origin,{redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok||Number(r.headers.get('content-length'))>4194304)throw Error();const reader=r.body.getReader(),parts=[];let n=0;while(true){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>4194304){await reader.cancel();throw Error();}parts.push(v.value);}bytes=new Uint8Array(n);let off=0;for(const p of parts){bytes.set(p,off);off+=p.length;}}
   if(!bytes?.length||bytes.length>4194304||!env.BUCKET)throw Error();
   const mime=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;if(!mime)throw Error();
   const asset='research-import/'+topic+'/'+id+'/'+i;await env.BUCKET.put(asset,bytes,{httpMetadata:{contentType:mime}});images.push({caption,source:sourceUrl,asset,mime});
  }catch{warnings.push('그림 '+(i+1)+': 파일을 가져오지 못했습니다. PNG/JPEG/WebP 파일을 첨부해 다시 저장해주세요.');images.push({caption,source:sourceUrl,missing:true});}
 }
 const now=new Date().toISOString(),rich={origin:'chatgpt',project:'연구미팅',chatUrl:source,papers,sources:papers.map(p=>({title:p.title,url:p.url})),importImages:images,importWarnings:warnings};
 const statements=[env.DB.prepare('INSERT OR IGNORE INTO research_records VALUES(?,0,?)').bind('topic:'+topic,JSON.stringify({id:topic,title,description:'ChatGPT 연구미팅 프로젝트에서 저장한 결과',archived:false,created:now,summary:''})),env.DB.prepare('INSERT OR IGNORE INTO research_messages VALUES(?,?,?,?,?,?,?)').bind(id,topic,'교수님','human',question,null,now),env.DB.prepare('INSERT OR IGNORE INTO research_messages VALUES(?,?,?,?,?,?,?)').bind(message,topic,'ChatGPT · 저장한 답변','assistant',answer,id,new Date(Date.now()+1).toISOString()),env.DB.prepare('INSERT INTO research_records VALUES(?,0,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=version+1').bind('answer:'+topic+':'+message,JSON.stringify(rich))];
 await env.DB.batch(statements);return {ok:true,topic,id,papers:papers.length,imagesSaved:images.filter(x=>x.asset).length,warnings};
}
