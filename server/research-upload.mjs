// Short-lived, single-image upload grants. Only authenticated owner routes mint them.
const ruMax=20*1024*1024;
const ruHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value)),x=>x.toString(16).padStart(2,'0')).join('');
const ruFail=(message,status=400)=>Object.assign(Error(message),{status});
async function ruTarget(env,topicId,messageId){
 if(!/^[\w-]{8,100}$/.test(topicId||'')||!/^ai-[\w-]{8,100}$/.test(messageId||''))throw ruFail('채팅과 답변 ID를 확인해주세요.');
 const topic=await env.DB.prepare('SELECT payload FROM research_records WHERE id=?').bind('topic:'+topicId).first();
 if(!topic)throw ruFail('채팅을 찾을 수 없습니다.',404);
 const t=JSON.parse(topic.payload);if(t.deleted||t.archived)throw ruFail('삭제되거나 보관된 채팅에는 그림을 추가할 수 없습니다.',409);
 const message=await env.DB.prepare("SELECT id FROM research_messages WHERE id=? AND topic=? AND kind='assistant'").bind(messageId,topicId).first();
 if(!message)throw ruFail('이 채팅의 답변을 찾을 수 없습니다.',404);
 return 'answer:'+topicId+':'+messageId;
}
export async function prepareResearchImageUpload(env,b,origin){
 if(!env.BUCKET)throw ruFail('그림 저장소가 연결되지 않았습니다.',503);
 await ruTarget(env,b.topicId,b.messageId);
 if(b.imageIndex!==undefined&&(!Number.isInteger(b.imageIndex)||b.imageIndex<0||b.imageIndex>39))throw ruFail('그림 위치를 확인해주세요.');
 const token=crypto.randomUUID()+crypto.randomUUID(),id=await ruHash(token),expires=Date.now()+15*60*1000;
 const grant={topic:b.topicId,message:b.messageId,caption:String(b.caption||b.filename||'첨부한 그림').slice(0,500),imageIndex:b.imageIndex,fileMode:b.fileMode===true,filename:String(b.filename||'').normalize('NFC').slice(0,200),expires};
 await env.DB.prepare('INSERT INTO research_records(id,version,payload) VALUES(?,0,?)').bind('upload:'+id,JSON.stringify(grant)).run();
 return {uploadUrl:new URL('/api/research-image-upload',origin).href,uploadToken:token,expiresAt:new Date(expires).toISOString(),maxBytes:ruMax,method:'POST',contentType:'application/octet-stream',instructions:'Read the actual local PNG/JPEG/WebP file as binary and POST it to uploadUrl with Authorization: Bearer <uploadToken>. Do not send a sandbox path or print base64. This token only attaches one image to the selected answer, expires in 15 minutes, and must not be shown in chat. Check ok and imagesSaved in the JSON response before claiming success. If outbound file upload is unavailable, the user can use 그림 첨부 on this answer in the dashboard.'};
}
export async function receiveResearchImageUpload(req,env){
 const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 try{
 if(req.method!=='POST')throw ruFail('POST만 허용됩니다.',405);
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');if(!/^[\w-]{72}$/.test(token))throw ruFail('업로드 권한이 없습니다.',403);
 const id=await ruHash(token),row=await env.DB.prepare('SELECT payload FROM research_records WHERE id=?').bind('upload:'+id).first();
 if(!row)throw ruFail('업로드 권한이 없습니다.',403);const grant=JSON.parse(row.payload);
 if(Date.now()>grant.expires)throw ruFail('업로드 시간이 만료되었습니다. 다시 첨부해주세요.',410);
 const key=await ruTarget(env,grant.topic,grant.message);
 const prior=await env.DB.prepare('SELECT payload FROM research_records WHERE id=?').bind(key).first();const previous=prior?JSON.parse(prior.payload):{};
 const saved=(previous.importImages||[]).findIndex(x=>x.uploadId===id);if(saved>=0)return reply({ok:true,duplicate:true,imagesSaved:1,index:saved});
 if(Number(req.headers.get('Content-Length'))>ruMax)throw ruFail('그림은 20MB 이내로 첨부해주세요.',413);
 const reader=req.body?.getReader();if(!reader)throw ruFail('그림 파일이 없습니다.');const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>ruMax){await reader.cancel();throw ruFail('그림은 20MB 이내로 첨부해주세요.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return reply(await (grant.fileMode?ruStoreFile(env,grant,bytes):ruStoreImage(env,grant,id,bytes)));
 }catch(e){return reply({error:e.message||'그림을 저장하지 못했습니다.'},e.status||500);}
}
export async function listResearchImageTargets(env,topicId){
 if(!/^[\w-]{8,100}$/.test(topicId||''))throw ruFail('채팅 ID를 확인해주세요.');
 const rows=await env.DB.prepare("SELECT id,content,created FROM research_messages WHERE topic=? AND kind='assistant' ORDER BY created DESC LIMIT 20").bind(topicId).all();
 return {topicId,answers:rows.results.map(x=>({messageId:x.id,created:x.created,preview:x.content.slice(0,160)}))};
}

async function ruStoreImage(env,grant,id,bytes){
 const key=await ruTarget(env,grant.topic,grant.message);
 const mime=bytes.length>24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)?'image/png':bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
 if(!mime)throw ruFail('PNG, JPEG, WebP 그림 파일을 선택해주세요.');
 const asset='research-upload/'+grant.topic+'/'+id+'/'+await ruHash(bytes);await env.BUCKET.put(asset,bytes,{httpMetadata:{contentType:mime}});
 await env.DB.prepare('INSERT OR IGNORE INTO research_records(id,version,payload) VALUES(?,0,?)').bind(key,'{}').run();
 for(let attempt=0;attempt<5;attempt++){
 await ruTarget(env,grant.topic,grant.message);
 const current=await env.DB.prepare('SELECT payload,version FROM research_records WHERE id=?').bind(key).first(),rich=JSON.parse(current.payload);rich.importImages||=[];
 const duplicate=rich.importImages.findIndex(x=>x.uploadId===id);if(duplicate>=0)return ({ok:true,duplicate:true,imagesSaved:1,index:duplicate});
 let index=grant.imageIndex??rich.importImages.findIndex(x=>x.missing);if(index<0)index=rich.importImages.length;
 if(index>rich.importImages.length||index>=40)throw ruFail('그림 위치 또는 첨부 개수를 확인해주세요.');
 if(rich.importImages[index]&&!rich.importImages[index].missing)throw ruFail('이미 연결된 그림입니다. 새 그림으로 첨부해주세요.',409);
 // Appending before legacy images would shift their saved checkbox indices.
 if(index===rich.importImages.length&&((rich.images||[]).length||rich.generatedImage))throw ruFail('이전 형식의 이미지가 있는 답변에는 새 답변으로 그림을 저장해주세요.',409);
 rich.importImages[index]={caption:grant.caption,asset,mime,uploadId:id};
 rich.importWarnings=(rich.importWarnings||[]).filter(w=>!w.startsWith('그림 '+(index+1)+':'));
 const result=await env.DB.prepare('UPDATE research_records SET payload=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(rich),key,current.version).run();
 if(result.meta?.changes||result.changes)return ({ok:true,imagesSaved:1,topic:grant.topic,message:grant.message,index});
 }
 throw ruFail('다른 수정이 진행 중입니다. 같은 업로드를 다시 시도해주세요.',409);
}

// ChatGPT resolves native file parameters; the server fetches the file without
// requiring networking from the ChatGPT code execution sandbox.
export async function attachResearchFile(env,b,fetchFile=fetch){
 if(!env.BUCKET)throw ruFail('그림 저장소가 연결되지 않았습니다.',503);
 const key=await ruTarget(env,b.topicId,b.messageId);
 if(b.imageIndex!==undefined&&(!Number.isInteger(b.imageIndex)||b.imageIndex<0||b.imageIndex>39))throw ruFail('그림 위치를 확인해주세요.');
 const file=b.file;
 if(!file||typeof file.file_id!=='string'||!file.file_id||file.file_id.length>512)throw ruFail('ChatGPT 원본 파일을 선택해주세요.');
 const id='native-'+await ruHash(JSON.stringify([b.topicId,b.messageId,file.file_id,b.imageIndex??null]));
 const prior=await env.DB.prepare('SELECT payload FROM research_records WHERE id=?').bind(key).first();
 const index=(prior?JSON.parse(prior.payload).importImages||[]:[]).findIndex(x=>x.uploadId===id);
 if(index>=0)return {ok:true,duplicate:true,imagesSaved:1,index};
 const {bytes}=await ruDownloadNative(file,fetchFile);
 return ruStoreImage(env,{topic:b.topicId,message:b.messageId,imageIndex:b.imageIndex,caption:String(b.caption||file.file_name||'첨부한 그림').slice(0,500)},id,bytes);
}

function ruFileUrl(value){
 let url;try{url=new URL(value);}catch{throw ruFail('FILE_URL_MISSING: ChatGPT 원본 파일 주소가 전달되지 않았습니다.');}
 const allowed=['oaiusercontent.com','oaistatic.com','blob.core.windows.net'];
 if(url.protocol!=='https:'||url.username||url.password||url.port||!allowed.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw ruFail('FILE_HOST_DENIED: ChatGPT 파일 저장소 주소만 허용됩니다.');
 return url;
}
async function ruDownloadNative(file,fetchFile){
 let url=ruFileUrl(file?.download_url),stage='connect',redirects=0;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
 try{
 let response;
 for(;;){
 response=await fetchFile(url.href,{redirect:'manual',signal:controller.signal});
 if(![301,302,303,307,308].includes(response.status))break;
 await response.body?.cancel();
 if(++redirects>3)throw ruFail('FILE_REDIRECT_LIMIT: 파일 주소 이동 횟수를 초과했습니다.',502);
 const next=response.headers.get('location');if(!next)throw ruFail('FILE_REDIRECT_MISSING: 파일 이동 주소가 없습니다.',502);
 url=ruFileUrl(new URL(next,url).href);
 }
 if(!response.ok)throw ruFail('FILE_HTTP_'+response.status+': 원본 파일 서버가 다운로드를 거절했습니다. 새 파일 참조가 필요합니다.',502);
 stage='read';
 if(Number(response.headers.get('Content-Length'))>ruMax)throw ruFail('FILE_TOO_LARGE: 그림은 20MB 이내로 첨부해주세요.',413);
 const reader=response.body?.getReader();if(!reader)throw ruFail('FILE_EMPTY: 파일 내용이 없습니다.');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>ruMax){await reader.cancel();throw ruFail('FILE_TOO_LARGE: 그림은 20MB 이내로 첨부해주세요.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return {bytes,redirects,host:url.hostname};
 }catch(e){
 if(e.status)throw e;
 const detail=String(e?.message||'')+' '+String(e?.cause?.code||'');
 const code=controller.signal.aborted?'TIMEOUT':/ENOTFOUND|DNS|resolve/i.test(detail)?'DNS':/denied|not allowed|blocked|policy|restricted/i.test(detail)?'POLICY':/certificate|TLS|SSL/i.test(detail)?'TLS':/redirect/i.test(detail)?'REDIRECT':'NETWORK';
 // Do not log signed URLs, file IDs, query strings, or raw exception messages.
 console.error(JSON.stringify({event:'research_file_download_failed',stage,code,host:url.hostname}));
 throw ruFail('FILE_'+code+'_'+stage.toUpperCase()+': 원본 파일 전송에 실패했습니다. 이 오류 코드를 관리자에게 전달해주세요.',502);
 }finally{clearTimeout(timeout);}
}
export async function diagnoseResearchFile(b,fetchFile=fetch){
 const {bytes,redirects,host}=await ruDownloadNative(b.file,fetchFile);
 return {ok:true,downloaded:true,bytes:bytes.length,sha256:await ruHash(bytes),redirects,host,saved:false};
}

function ruFileType(name,bytes){
 const ext=name.split('.').pop().toLowerCase();
 const png=bytes.length>24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(ext==='png'&&png)return ['image','image/png'];
 if(['jpg','jpeg'].includes(ext)&&jpg)return ['image','image/jpeg'];
 if(ext==='webp'&&webp)return ['image','image/webp'];
 if(ext==='pdf'&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-')return ['document','application/pdf'];
 const office={docx:'wordprocessingml.document',xlsx:'spreadsheetml.sheet',pptx:'presentationml.presentation'};
 if(office[ext]&&bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4)return ['document','application/vnd.openxmlformats-officedocument.'+office[ext]];
 if(['txt','md','csv'].includes(ext)){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw ruFail('UTF-8 텍스트 파일을 선택해주세요.');}return ['document','text/plain; charset=utf-8'];}
 throw ruFail('PNG/JPG/WebP, PDF, DOCX, PPTX, XLSX, TXT/MD/CSV 파일만 지원합니다.');
}
async function ruStoreFile(env,grant,bytes){
 const key=await ruTarget(env,grant.topic,grant.message),name=String(grant.filename||'').normalize('NFC');
 if(!name||name.length>200||/[\\/\x00-\x1f]/.test(name))throw ruFail('파일명을 확인해주세요.');
 if(!bytes.length||bytes.length>ruMax)throw ruFail('파일은 20MB 이내로 선택해주세요.');
 const [kind,mime]=ruFileType(name,bytes),digest=await ruHash(bytes),asset='research-files/'+grant.topic+'/'+digest;
 await env.BUCKET.put(asset,bytes,{httpMetadata:{contentType:mime}});
 await env.DB.prepare('INSERT OR IGNORE INTO research_records(id,version,payload) VALUES(?,0,?)').bind(key,'{}').run();
 for(let attempt=0;attempt<5;attempt++){
 await ruTarget(env,grant.topic,grant.message);
 const current=await env.DB.prepare('SELECT payload,version FROM research_records WHERE id=?').bind(key).first(),rich=JSON.parse(current.payload);rich.files||=[];
 let index=rich.files.findIndex(f=>f.name===name);
 if(index>=0&&rich.files[index].asset){if(rich.files[index].sha256===digest)return {ok:true,duplicate:true,filesSaved:1,name,kind,index};throw ruFail('같은 이름의 다른 파일이 있습니다. 파일명을 바꿔주세요.',409);}
 if(index<0){index=rich.files.length;if(index>=40)throw ruFail('답변당 파일은 40개까지 보관할 수 있습니다.');}
 rich.files[index]={name,kind,mime,size:bytes.length,sha256:digest,asset};
 const result=await env.DB.prepare('UPDATE research_records SET payload=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(rich),key,current.version).run();
 if(result.meta?.changes||result.changes)return {ok:true,filesSaved:1,name,kind,index};
 }
 throw ruFail('다른 저장이 진행 중입니다. 다시 시도해주세요.',409);
}
export async function attachResearchFiles(env,b,fetchFile=fetch){
 await ruTarget(env,b.topicId,b.messageId);
 if(!Array.isArray(b.files)||!b.files.length||b.files.length>20)throw ruFail('한 번에 파일 1–20개를 선택해주세요.');
 const results=[];
 for(const file of b.files){try{const {bytes}=await ruDownloadNative(file,fetchFile);results.push(await ruStoreFile(env,{topic:b.topicId,message:b.messageId,filename:file.file_name},bytes));}catch(e){results.push({ok:false,name:file.file_name||'',error:e.message});}}
 return {ok:results.every(r=>r.ok),filesSaved:results.filter(r=>r.ok).length,results};
}
