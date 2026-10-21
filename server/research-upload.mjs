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
 const grant={topic:b.topicId,message:b.messageId,caption:String(b.caption||b.filename||'첨부한 그림').slice(0,500),imageIndex:b.imageIndex,expires};
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
 const mime=bytes.length>24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)?'image/png':bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
 if(!mime)throw ruFail('PNG, JPEG, WebP 그림 파일을 선택해주세요.');
 const asset='research-upload/'+grant.topic+'/'+id+'/'+await ruHash(bytes);await env.BUCKET.put(asset,bytes,{httpMetadata:{contentType:mime}});
 await env.DB.prepare('INSERT OR IGNORE INTO research_records(id,version,payload) VALUES(?,0,?)').bind(key,'{}').run();
 for(let attempt=0;attempt<5;attempt++){
 await ruTarget(env,grant.topic,grant.message);
 const current=await env.DB.prepare('SELECT payload,version FROM research_records WHERE id=?').bind(key).first(),rich=JSON.parse(current.payload);rich.importImages||=[];
 const duplicate=rich.importImages.findIndex(x=>x.uploadId===id);if(duplicate>=0)return reply({ok:true,duplicate:true,imagesSaved:1,index:duplicate});
 let index=grant.imageIndex??rich.importImages.findIndex(x=>x.missing);if(index<0)index=rich.importImages.length;
 if(index>rich.importImages.length||index>=40)throw ruFail('그림 위치 또는 첨부 개수를 확인해주세요.');
 if(rich.importImages[index]&&!rich.importImages[index].missing)throw ruFail('이미 연결된 그림입니다. 새 그림으로 첨부해주세요.',409);
 // Appending before legacy images would shift their saved checkbox indices.
 if(index===rich.importImages.length&&((rich.images||[]).length||rich.generatedImage))throw ruFail('이전 형식의 이미지가 있는 답변에는 새 답변으로 그림을 저장해주세요.',409);
 rich.importImages[index]={caption:grant.caption,asset,mime,uploadId:id};
 rich.importWarnings=(rich.importWarnings||[]).filter(w=>!w.startsWith('그림 '+(index+1)+':'));
 const result=await env.DB.prepare('UPDATE research_records SET payload=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(rich),key,current.version).run();
 if(result.meta?.changes||result.changes)return reply({ok:true,imagesSaved:1,topic:grant.topic,message:grant.message,index});
 }
 throw ruFail('다른 수정이 진행 중입니다. 같은 업로드를 다시 시도해주세요.',409);
 }catch(e){return reply({error:e.message||'그림을 저장하지 못했습니다.'},e.status||500);}
}
export async function listResearchImageTargets(env,topicId){
 if(!/^[\w-]{8,100}$/.test(topicId||''))throw ruFail('채팅 ID를 확인해주세요.');
 const rows=await env.DB.prepare("SELECT id,content,created FROM research_messages WHERE topic=? AND kind='assistant' ORDER BY created DESC LIMIT 20").bind(topicId).all();
 return {topicId,answers:rows.results.map(x=>({messageId:x.id,created:x.created,preview:x.content.slice(0,160)}))};
}
