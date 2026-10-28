/* Professor-only recorder. Media capture lives outside rendered topic panels. */
const meetingRecorder={session:null,version:0,active:false,paused:false,busy:false,clockBase:0,clockStarted:0,selected:null,history:[],ready:null,message:'',pendingAudio:[],audioIndex:0,syncing:false,dirty:false,collapsed:false,interim:'',summaryDrafts:{}};

// Native capture survives closing the Mac window; web/browser capture remains unchanged.
function mrNativeAvailable(){return !!window.webkit?.messageHandlers?.nismlMeeting?.postMessage;}
function mrNative(action,body={}){if(!mrNativeAvailable())return Promise.reject(Error('Mac 앱에서 녹음 파일을 복구해주세요.'));return window.webkit.messageHandlers.nismlMeeting.postMessage({action,...body});}
// Use the latest classified marker, so unclassified intervals retain the last participants.
function mrQuickTopics(){
 const m=meetingRecorder,rooms=researchRoomState.rooms||{},topics=(rooms.topics||[]).filter(t=>!t.archived);
 const basisID=m.active?[...(m.session?.markers||[])].reverse().find(x=>x.topic)?.topic||m.selected:mrTopic();
 const basis=topics.find(t=>t.id===basisID),normalize=x=>String(x||'').trim().toLowerCase();
 const students=t=>[...new Set((t?.viewers||[]).map(normalize).filter(x=>x&&x!==normalize(user.email)))];
 const people=students(basis),names=people.map(email=>{const member=(rooms.members||[]).find(x=>normalize(x.email)===email);return member?.name&&member.name!==email?member.name:'연구실 구성원';});
 const quick=topics.filter(t=>t.id===basisID||students(t).some(x=>people.includes(x)));
 const other=topics.filter(t=>!quick.includes(t));
 const item=(t,priority)=>({id:t.id,title:t.title,cover:rrCoverURL(t),quick:priority?'true':'false',participants:students(t).map(email=>{const member=(rooms.members||[]).find(x=>normalize(x.email)===email);return member?.name&&member.name!==email?member.name:'연구실 구성원';}).join(' · ')});
 return {names,topics:[...quick.map(t=>item(t,true)),{id:mrUnclassified,title:'미분류',quick:'true',participants:'임시 주제 기록'},...other.map(t=>item(t,false))]};
}
const mrCoverTransfers=new Map();
function mrSendNativeCovers(topics){for(const t of topics){if(!t.cover||mrCoverTransfers.has(t.cover))continue;mrCoverTransfers.set(t.cover,true);fetch(t.cover).then(r=>{if(!r.ok)throw Error('cover');return r.blob();}).then(blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);})).then(base64=>mrNative('covers',{images:{[t.cover]:base64}})).catch(()=>mrCoverTransfers.delete(t.cover));}}
function mrNativeState(){if(!mrNativeAvailable())return;const m=meetingRecorder,quick=mrQuickTopics();mrNative('state',{admin:admin(),active:m.active,cancelPending:!!m.cancelPending,startReady:!m.active&&!m.cancelPending&&!m.busy&&!m.stopping&&!m.syncing&&!m.converting&&!m.discarding&&!m.processing&&!m.dirty&&!m.pendingAudio.length&&!m.session?.nativePending,backgroundProcessing:!!mrQueue.busy||mrQueue.pending>0,protect:!!(m.active||m.cancelPending||m.busy||m.stopping||m.processing||m.dirty||m.pendingAudio.length||m.session?.nativePending),selected:m.selected||mrUnclassified,topics:quick.topics,participantNames:quick.names}).then(()=>mrSendNativeCovers(quick.topics)).catch(()=>{});}

window.nismlRecorderCommand=async function(command){
 if(!admin())throw Error('교수님만 녹음에 접근할 수 있습니다.');
 const m=meetingRecorder;if(m.busy||m.stopping||m.converting||m.discarding)throw Error('현재 녹음을 저장 중입니다. 잠시 후 다시 시도해주세요.');
 if(command.action==='start'){
  if(m.active)throw Error('이미 녹음 중입니다.');
  if(m.syncing||m.processing||m.dirty||m.pendingAudio.length||m.session?.nativePending)throw Error('이전 회의 업로드가 완료되면 새 녹음을 시작할 수 있습니다.');
  await mrStart();if(!m.active)throw Error(m.message||'녹음을 시작하지 못했습니다.');return true;
 }
 if(command.action==='cancel')return await mrCancel();
 if(command.action==='pause'||command.action==='stop'||command.action==='summary'){
  if(!m.active)throw Error('진행 중인 녹음이 없습니다.');
  return command.action==='pause'?await mrPause():await mrStop();
 }
 if(command.action==='topic'){
  const id=command.topic;if(id!==mrUnclassified&&!(researchRoomState.rooms?.topics||[]).some(t=>t.id===id&&!t.archived))throw Error('선택할 수 없는 연구미팅입니다.');
  mrChooseTopic(id);researchRoomState.selected=id;
  if(tab==='researchRooms')await rrRefresh(true);return true;
 }
 throw Error('지원하지 않는 동작입니다.');
};
async function mrNativeUpload(){
 const m=meetingRecorder,s=m.session;if((!s?.nativeCapture&&!s?.nativePending)||m.nativeStopping||s.audioDeletedAt)return;
 if(!s.segmentedCapture){if(!s.nativePending||m.active)return;const {size}=await mrNative('recover',{id:s.id});let index=0;for(let offset=0;offset<size;){const part=await mrNative('read',{id:s.id,offset});if(!part.length)throw Error('녹음 파일을 끝까지 읽지 못했습니다.');await researchFetch('recording-audio',{id:s.id,index:index++,base64:part.base64});offset+=part.length;}m.audioIndex=index;s.nativePending=false;s.nativeUploaded=true;await mrChanged();return;}
 const wasActive=m.active,result=await mrNative('parts',{id:s.id});
 if(m.active&&!m.paused){m.clockBase=result.duration;m.clockStarted=performance.now();}else if(!wasActive)m.clockBase=result.duration;
 for(const part of result.parts.slice(s.audioParts.length)){
  const first=m.audioIndex;let index=first;
  for(let offset=0;offset<part.size;){const piece=await mrNative('read',{id:s.id,part:part.part,offset});if(!piece.length)throw Error('녹음 구간을 끝까지 읽지 못했습니다.');await researchFetch('recording-audio',{id:s.id,index,base64:piece.base64});offset+=piece.length;index++;}
  s.audioParts.push({first,count:index-first,start:part.start,end:part.end,mime:'audio/mp4'});m.audioIndex=index;await mrChanged();
 }
 if(!m.active&&!wasActive&&result.duration>=m.clockBase-.1){s.nativePending=false;s.nativeUploaded=true;await mrChanged();}
}
async function mrNativeStart(){
 const m=meetingRecorder;const capabilities=await mrNative('capabilities').catch(()=>({}));if(!capabilities.segmentedRecording)throw Error('5분 단위 전사를 사용하려면 트레이의 업데이트 확인에서 Mac 앱 0.4.5 이상으로 업데이트해주세요.');const created=await researchFetch('recording-create',{id:crypto.randomUUID(),mime:'audio/mp4',markers:[{at:0,topic:mrTopic(),title:mrTopicName(mrTopic())}]});
 Object.assign(m,{session:{...created,nativeCapture:true,segmentedCapture:true,audioParts:[],nativeUploaded:false},version:created.version,clockBase:0,selected:mrTopic(),pendingAudio:[],audioIndex:0,native:true});
 await mrNative('start',{id:created.id});m.clockStarted=performance.now();m.active=true;m.paused=false;m.session.status='recording';m.message='Mac 앱에서 녹음 중 · 창을 닫아도 플로팅 패널로 조작할 수 있습니다.';await mrChanged();rrDraw();
}

const mrUnclassified='__unclassified__';
const mrSeconds=()=>meetingRecorder.active&&!meetingRecorder.paused?meetingRecorder.clockBase+(performance.now()-meetingRecorder.clockStarted)/1000:meetingRecorder.clockBase;
const mrStamp=n=>{n=Math.floor(n||0);return (n>=3600?String(Math.floor(n/3600)).padStart(2,'0')+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
function mrTopicAt(markers,time){let topic=null;for(const m of markers){if(m.at>time)break;topic=m.topic;}return topic;}
function mrTopic(){return researchRoomState.selected===mrUnclassified?null:researchRoomState.selected;}
function mrTopicName(id){return id?(researchRoomState.rooms?.topics.find(t=>t.id===id)?.title||'연구주제'):'미분류';}
function mrEmptyThread(){return {topic:{id:mrUnclassified,title:'미분류',archived:false},messages:[],papers:[],selectedImages:[],memo:{content:'',version:0},jobs:[]};}
function mrSidebar(){if(!admin())return '';const m=meetingRecorder,usage=researchRoomState.rooms?.usage,budget=researchRoomState.rooms?.config?.budget||50;return `<div class="mr-controls"><div class="mr-eyebrow">회의 전사 <span>교수님 전용</span></div><div class="mr-clock"><i class="${m.active?'on':''}"></i><strong data-mr-clock>${mrStamp(mrSeconds())}</strong><span data-mr-state>${m.active?(m.paused?'일시정지':'녹음 중'):'녹음 대기'}</span></div><div class="mr-buttons">${m.active?`<button class="secondary" data-mr="pause">${m.paused?'녹음 재개':'일시정지'}</button><button class="mr-stop" data-mr="stop">회의 요약 시작</button>`:`<button class="primary" data-mr="start" ${m.busy||m.processing?'disabled':''}>● 회의 녹음 시작</button>`}</div><p class="mr-connection">${m.ready?.transcriptionReady?'OpenAI · 녹음 중 5분마다 전사':m.ready?'OpenAI 키 미등록 · 녹음 저장 가능':'OpenAI 연결 확인 중 · 녹음 저장 가능'}</p>${usage?`<p class="mr-connection mr-usage">월 사용 추정 ${rrMoney(usage.spent)} / $${budget}${usage.reserved?` · 처리 예약 ${rrMoney(usage.reserved)}`:''}${usage.spent+usage.reserved>=budget*.8?' · 예산 80% 이상':''}</p>`:''}<button class="secondary" data-mr="voices">음성 등록</button><button class="secondary" data-mr="knowledge">연구 배경·용어집</button><p class="mr-message" role="status">${esc(m.message)}</p></div>`;}
function mrUnclassifiedButton(){return admin()?`<button class="rr-topic mr-unclassified ${researchRoomState.selected===mrUnclassified?'selected':''}" data-topic="${mrUnclassified}"><div><strong>미분류</strong><small>다른 이야기 · 나중에 분류</small></div></button>`:'';}
function mrDrawer(){if(!admin())return '';const m=meetingRecorder,s=m.session;return `<section class="mr-drawer ${m.collapsed?'collapsed':''}"><header><div><strong>회의 녹음 · 전사</strong><span class="mr-current">${esc(mrTopicName(m.active?m.selected:mrTopic()))}</span></div><button class="secondary" data-mr="collapse" aria-expanded="${!m.collapsed}">${m.collapsed?'펼치기':'접기'}</button></header><div class="mr-drawer-body"><p class="mr-hint">음성 등록을 했다면 처음 8초 동안 교수님 혼자 참여자 이름을 호명해주세요. 예: “오늘 참여자는 [교수님 이름], [학생 이름]입니다.” 등록하지 않았다면 첫 발언을 교수님 기준으로 사용합니다. 연구목록을 누르면 녹음을 유지한 채 해당 주제로 분류합니다.</p>${mrVoiceStatus(s)}<div class="mr-transcript" id="mrTranscript">${mrTranscriptHTML(s)}</div><footer>${s?.segments?.length?'<button class="secondary" data-mr="speaker-roles">교수님 변경</button>':''}${mrCreateTopicButton()}${mrDiscardButton()}${s?'<button class="secondary" data-mr="import">전사문 가져오기</button>':''}<span data-mr-save>${m.dirty?'저장 대기':'교수님만 볼 수 있습니다'}</span></footer></div></section>`;}
function mrTranscriptHTML(s){if(!s)return '<div class="mr-empty">회의 녹음을 시작하면 이곳에 기록됩니다.<br><small>녹음은 계속 이어지며, 5분마다 완료된 구간의 전사가 표시됩니다.</small></div>';const rows=[...(s.markers||[]).map((x,i)=>({time:x.at,html:`<div class="mr-marker"><time>${mrStamp(x.at)}</time><span>↪ ${esc(x.title||mrTopicName(x.topic))}${i?'으로 전환':' · 회의 시작'}</span></div>`})),...(s.segments||[]).map(x=>({time:x.start,html:`<div class="mr-line"><time>${mrStamp(x.start)}</time><button class="mr-speaker" data-mr-speaker="${esc(x.speaker)}">${esc(s.speakers?.[x.speaker]||x.speaker)}</button><p>${esc(x.text)}</p><small>${esc(mrTopicName(mrTopicAt(s.markers,x.start)))}</small></div>`}))].sort((a,b)=>a.time-b.time);return rows.map(x=>x.html).join('')+(meetingRecorder.interim?'<p class="mr-interim">'+esc(meetingRecorder.interim)+'</p>':'');}
function mrBind(){if(!admin())return;const root=document.getElementById('researchRoomRoot');root?.classList.add('mr-owner');root?.querySelectorAll('[data-mr]').forEach(b=>b.onclick=()=>mrAction(b.dataset.mr));root?.querySelectorAll('[data-mr-speaker]').forEach(b=>b.onclick=()=>mrRenameSpeaker(b.dataset.mrSpeaker));mrPaint();if(!meetingRecorder.ready&&!meetingRecorder.loading){meetingRecorder.loading=true;researchFetch('recording-status').then(r=>{meetingRecorder.ready=r;mrUpdateControls();}).catch(e=>{meetingRecorder.message=e.message;mrPaint();}).finally(()=>meetingRecorder.loading=false);}}
function mrUpdateControls(){const old=document.querySelector('.mr-controls');if(old){old.outerHTML=mrSidebar();document.querySelectorAll('.mr-controls [data-mr]').forEach(b=>b.onclick=()=>mrAction(b.dataset.mr));}mrPaint();}
function mrPaint(){mrNativeState();const m=meetingRecorder;if(!admin()){document.getElementById('mrGlobalRecording')?.remove();return;}document.querySelectorAll('[data-mr-clock]').forEach(e=>e.textContent=mrStamp(mrSeconds()));document.querySelectorAll('[data-mr-state]').forEach(e=>e.textContent=m.active?(m.paused?'일시정지':'녹음 중'):'녹음 대기');document.querySelectorAll('.mr-current').forEach(e=>e.textContent=mrTopicName(m.active?m.selected:mrTopic()));document.querySelectorAll('.mr-message').forEach(e=>e.textContent=m.message);document.querySelectorAll('[data-mr-save]').forEach(e=>e.textContent=m.syncing?'서버에 저장 중':m.dirty?'저장 대기 · 이 기기에 보관됨':'교수님만 볼 수 있습니다');document.querySelectorAll('[data-topic]').forEach(b=>{const id=b.dataset.topic===mrUnclassified?null:b.dataset.topic;b.classList.toggle('mr-recording-topic',m.active&&id===m.selected);});let chip=document.getElementById('mrGlobalRecording');if(m.active){if(!chip){chip=document.createElement('button');chip.id='mrGlobalRecording';chip.onclick=()=>{tab='researchRooms';render();};document.body.append(chip);}chip.textContent='● '+(m.paused?'일시정지':'녹음 중')+' '+mrStamp(mrSeconds())+' · '+mrTopicName(m.active?m.selected:mrTopic());chip.hidden=tab==='researchRooms';}else chip?.remove();}
function mrPaintTranscript(){const e=document.getElementById('mrTranscript');if(!e)return;const bottom=e.scrollHeight-e.scrollTop-e.clientHeight<80;e.innerHTML=mrTranscriptHTML(meetingRecorder.session);e.querySelectorAll('[data-mr-speaker]').forEach(b=>b.onclick=()=>mrRenameSpeaker(b.dataset.mrSpeaker));if(bottom)e.scrollTop=e.scrollHeight;}
function mrChooseTopic(id){if(!admin())return;const m=meetingRecorder,topic=id===mrUnclassified?null:id;m.selected=topic;if(m.active){const at=mrSeconds();const markers=m.session.markers;if(markers.at(-1)?.topic!==topic){markers.push({at,topic,title:mrTopicName(topic)});mrChanged();mrPaintTranscript();}}mrPaint();}
async function mrDB(){return new Promise((resolve,reject)=>{const q=indexedDB.open('nisml-meeting-recorder',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
async function mrLocal(key,value,remove=false){const db=await mrDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('drafts',value!==undefined||remove?'readwrite':'readonly'),store=tx.objectStore('drafts'),q=remove?store.delete(key):value===undefined?store.get(key):store.put(value,key);let result;q.onsuccess=()=>result=q.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
const mrDraftKey=()=>String(user.email)+':current';
function mrSnapshot(){const m=meetingRecorder;return {...m.session,duration:mrSeconds(),status:m.active?(m.paused?'paused':'recording'):(m.session?.status||'ended'),audioCount:m.audioIndex};}
async function mrChanged(){const m=meetingRecorder;if(!m.session)return;m.dirty=true;m.revision=(m.revision||0)+1;try{await mrLocal(mrDraftKey(),{session:mrSnapshot(),version:m.version});}catch{m.message='기기 임시 저장에 실패했습니다. 녹음을 내려받아 보관해주세요.';}mrPaint();}
function mrSync(){const m=meetingRecorder;if(m.syncPromise)return m.syncPromise;m.syncPromise=mrSyncRun().finally(()=>m.syncPromise=null);return m.syncPromise;}
async function mrSyncRun(){const m=meetingRecorder;if(m.syncing||m.converting||m.discarding||m.cancelPending||!m.session||!admin())return;m.syncing=true;mrPaint();try{await mrNativeUpload();while(m.pendingAudio.length){const item=m.pendingAudio[0];const bytes=new Uint8Array(await item.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));await researchFetch('recording-audio',{id:m.session.id,index:item.index,base64:btoa(binary)});m.pendingAudio.shift();await mrLocal(user.email+':audio:'+m.session.id+':'+item.index,undefined,true);}if(m.dirty){const revision=m.revision;let r;try{r=await researchFetch('recording-save',{...mrSnapshot(),version:m.version});}catch(error){const latest=await researchFetch('recording-detail?id='+encodeURIComponent(m.session.id));m.version=latest.version;mrMergeTranscript(latest);r=await researchFetch('recording-save',{...mrSnapshot(),version:m.version});}m.version=r.version;if(m.revision===revision)m.dirty=false;await mrLocal(mrDraftKey(),{session:mrSnapshot(),version:m.version});}if(m.session.nativeUploaded&&!m.dirty){await mrNative('uploaded',{id:m.session.id}).catch(()=>{});}}catch(e){m.message='서버 저장 대기: '+e.message;}finally{m.syncing=false;mrPaint();}if(!m.discarding&&!m.cancelPending&&!m.dirty&&!m.pendingAudio.length&&!['completed','failed','attention','participants-required'].includes(m.session.processing?.status)&&m.session.audioParts?.length&&(m.session.audioParts.at(-1).end>=300||m.session.voiceEnrollment||!m.active))mrEnqueue(m.session.id).catch(e=>{m.message=e.message;mrPaint();});}
async function mrQueueAudio(blob){if(!blob.size)return;if(blob.size>500000){for(let at=0;at<blob.size;at+=500000)await mrQueueAudio(blob.slice(at,at+500000,blob.type));return;}const m=meetingRecorder,index=m.audioIndex++;const item={index,blob};m.pendingAudio.push(item);try{await mrLocal(user.email+':audio:'+m.session.id+':'+index,blob);}catch{m.message='기기 저장 공간이 부족합니다. 녹음을 종료하고 파일을 보관해주세요.';}await mrChanged();}
async function mrStart(){const m=meetingRecorder;if(m.discarding||m.active||m.busy||m.processing||m.syncing||m.stopping||m.converting)return;m.busy=true;mrUpdateControls();try{
 if(m.pendingAudio.length||m.dirty||m.session?.nativePending){await mrSync();if(m.pendingAudio.length||m.dirty||m.session?.nativePending)throw Error('이전 회의를 먼저 서버에 저장해주세요.');}
 const draft=await mrLocal(mrDraftKey());if(draft?.session&&(['recording','paused','interrupted'].includes(draft.session.status)||draft.session.nativePending)&&draft.session.id!==m.session?.id){await mrRestore(draft);throw Error('이전에 중단된 회의를 복구했습니다. 내용을 확인한 뒤 새 녹음을 시작해주세요.');}
 if(mrNativeAvailable()){await mrNativeStart();return;}m.native=false;
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('이 브라우저에서는 녹음할 수 없습니다. 최신 Chrome 또는 Safari를 사용해주세요.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});m.stream=stream;
 const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime)throw Error('지원되는 녹음 형식이 없습니다.');
 const created=await researchFetch('recording-create',{id:crypto.randomUUID(),mime,markers:[{at:0,topic:mrTopic(),title:mrTopicName(mrTopic())}]});m.session=created;m.version=created.version;m.clockBase=0;m.selected=mrTopic();m.pendingAudio=[];m.audioIndex=0;m.chunks=[];m.audioChain=Promise.resolve();m.group=[];m.groupBytes=0;m.totalBytes=0;
 m.session.audioParts=[];m.clockStarted=performance.now();m.active=true;m.paused=false;m.session.status='recording';mrBeginPart(0);
 stream.getAudioTracks().forEach(track=>track.onended=()=>{if(m.active){m.message='마이크 연결이 끊어졌습니다. 저장된 구간을 확인해주세요.';mrStop('interrupted');}});
 m.message='녹음 중 · 5분마다 자동 전사합니다. 처음 8초는 교수님 혼자 참여자 이름을 말씀해주세요.';await mrChanged();rrDraw();
 }catch(e){m.stream?.getTracks().forEach(t=>t.stop());m.message=e.name==='NotAllowedError'?'마이크 사용 권한을 허용해주세요.':e.message;}finally{m.busy=false;mrUpdateControls();}}
async function mrPause(){const m=meetingRecorder;if(!m.active||m.pausing)return;m.pausing=true;try{if(m.native)await mrNative(m.paused?'resume':'pause');if(m.paused){m.clockStarted=performance.now();if(!m.native)m.recorder.resume();m.paused=false;}else{m.clockBase=mrSeconds();m.paused=true;if(!m.native)m.recorder.pause();}await mrChanged();mrUpdateControls();}finally{m.pausing=false;}}
async function mrCancel(){
 const m=meetingRecorder;if((!m.active&&!m.cancelPending)||m.stopping||m.discarding)return;m.discarding=true;const id=m.session.id;
 try{
  // Stop locally first, then cancel on the server before any final upload/enqueue.
  if(m.active&&m.native)await mrNative('stop');else if(m.active){m.recorder.stop();m.stream?.getTracks().forEach(t=>t.stop());await m.recorder.done;await m.audioChain;}
  m.clockBase=mrSeconds();m.active=false;m.cancelPending=id;
  await mrSync();
  const result=await researchFetch('recording-cancel',{id});
  if(m.native)await mrNative('purge',{id});
  for(const item of m.pendingAudio)await mrLocal(user.email+':audio:'+id+':'+item.index,undefined,true);
  Object.assign(m,{session:null,version:0,pendingAudio:[],dirty:false,cancelPending:null,paused:false});await mrLocal(mrDraftKey(),undefined,true);
  m.message='현재 회의를 취소했습니다. 요약을 생성하지 않습니다.';mrQueue.last=0;await mrLoadHistory();rrDraw();
 }catch(e){m.message='회의 취소를 완료하지 못했습니다. 다시 시도해주세요. '+e.message;throw e;}finally{m.discarding=false;mrUpdateControls();}
}
async function mrStop(status='ended'){
 const m=meetingRecorder;if(!m.active||m.stopping||m.converting)return;m.stopping=true;
 try{
  if(m.native){m.nativeStopping=true;try{const result=await mrNative('stop');m.clockBase=result.duration??mrSeconds();m.session.nativePending=true;}finally{m.nativeStopping=false;}}
  else {m.clockBase=mrSeconds();m.recorder.partEnd=m.clockBase;m.recorder.stop();}
  m.active=false;m.session.status=status;
  if(!m.native){await m.recorder.done;await m.audioChain;m.stream?.getTracks().forEach(t=>t.stop());}
  await mrChanged();await mrSync();if(m.native)await mrChanged();if(m.dirty)await mrSync();
  m.message=(m.dirty||m.session.nativePending)?'연결 복구 후 업로드를 다시 시도합니다. 녹음은 기기에 보관되어 있습니다.':'업로드 완료 · 다음 회의를 시작할 수 있습니다. 전사·요약은 별도로 진행됩니다.';
  if(!m.dirty&&!m.pendingAudio.length&&!m.session.nativePending)await mrEnqueue(m.session.id);
  await mrLoadHistory();researchRoomState.view='meeting';rrDraw();
 }finally{m.stopping=false;mrUpdateControls();}
}
function mrBeginPart(start){
 const m=meetingRecorder,recorder=new MediaRecorder(m.stream,{mimeType:m.session.mime,audioBitsPerSecond:48000}),chunks=[];
 recorder.partStart=start;recorder.partEnd=null;recorder.boundary=start<8?8:(Math.floor(start/300)+1)*300;
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.done=new Promise(resolve=>{recorder.onstop=()=>{const end=recorder.partEnd??mrSeconds(),blob=new Blob(chunks,{type:m.session.mime});m.audioChain=m.audioChain.then(async()=>{if(!blob.size||end<=start)return;const first=m.audioIndex;await mrQueueAudio(blob);m.session.audioParts.push({first,count:m.audioIndex-first,start,end,mime:m.session.mime});await mrChanged();});m.audioChain.then(resolve);};});
 recorder.onerror=()=>{m.message='마이크 오류 · 저장된 구간은 유지됩니다.';mrStop('interrupted');};
 recorder.start(1000);m.recorder=recorder;
}
function mrRotatePart(){const m=meetingRecorder;if(!m.active||m.native||m.paused||m.stopping||m.rotating||mrSeconds()<m.recorder.boundary)return;m.rotating=true;const old=m.recorder;try{const boundary=mrSeconds();mrBeginPart(boundary);old.partEnd=boundary;old.stop();old.done.finally(()=>{m.rotating=false;mrSync();});}catch(e){m.rotating=false;m.message='녹음 구간 전환 오류: '+e.message;mrStop('interrupted');}}
async function mrRestore(draft){const m=meetingRecorder;m.session={...draft.session,status:'interrupted'};m.native=!!m.session.nativeCapture;if(m.native&&!m.session.nativeUploaded)m.session.nativePending=true;m.version=draft.version;m.clockBase=m.session.duration;m.selected=m.session.markers.at(-1)?.topic||null;m.audioIndex=m.session.audioCount||0;m.pendingAudio=[];for(let i=0;i<m.audioIndex;i++){const blob=await mrLocal(user.email+':audio:'+m.session.id+':'+i);if(blob)m.pendingAudio.push({index:i,blob});}await mrChanged();await mrSync();}
async function mrLoadHistory(){const r=await researchFetch('recording-list');meetingRecorder.history=r.meetings;meetingRecorder.historyLoaded=true;return r.meetings;}
function mrRenameSpeaker(){
 const m=meetingRecorder,s=m.session;if(!s||m.active||m.processing||m.converting||m.discarding)return;
 const keys=[...new Set([...s.segments].filter(x=>x.text.trim()).sort((a,b)=>a.start-b.start).map(x=>x.speaker))];if(!keys.length)return;
 const current=keys.find(k=>s.speakers?.[k]?.includes('교수님'))||keys[0];
 rrDialog('교수님 변경',(s.voiceEnrollment?'<p>등록 음성과 연결된 발언 중 교수님 발언을 선택하세요. 이름은 유지하고 역할만 수정합니다.</p>':'<p>매 회의 첫 발언자를 교수님으로 지정합니다. 잘못 지정됐다면 교수님의 발언을 선택하세요. 나머지는 학생 1·학생 2로 표시합니다.</p>')+'<label>교수님 발언<select name="professor">'+keys.map(k=>'<option value="'+esc(k)+'" '+(k===current?'selected':'')+'>'+esc((s.speakers?.[k]||'미지정')+' — '+s.segments.find(x=>x.speaker===k&&x.text.trim()).text.slice(0,120))+'</option>').join('')+'</select></label><p>기존 요약은 유지됩니다. 역할 변경 후 내용을 검토하거나 요약을 다시 생성해주세요.</p>',async b=>{
  if(m.active||m.processing||m.converting||m.discarding||m.session?.id!==s.id)throw Error('회의 처리 종료 후 다시 열어주세요.');
  await mrSync();if(m.dirty)throw Error('회의 저장을 먼저 완료해주세요.');
  const result=await researchFetch('recording-speaker-roles',{id:s.id,version:m.version,professor:b.professor});m.session=result;m.version=result.version;
  await mrLocal(mrDraftKey(),{session:result,version:result.version});await mrLoadHistory();m.message='교수님·학생 구분을 저장했습니다. 기존 요약의 역할 구분도 확인해주세요.';mrPaintTranscript();
 });
}

async function mrDownload(){const m=meetingRecorder;if(!m.session)return;try{const blobs=[];for(let i=0;i<m.audioIndex;i++){let blob=m.pendingAudio.find(x=>x.index===i)?.blob||await mrLocal(user.email+':audio:'+m.session.id+':'+i);if(!blob){const r=await fetch('/api/ai/recording-audio?id='+encodeURIComponent(m.session.id)+'&index='+i);if(!r.ok)throw Error('일부 녹음이 아직 저장되지 않았습니다. 잠시 후 다시 시도해주세요.');blob=await r.blob();}blobs.push(blob);}if(m.active&&m.group?.length)blobs.push(...m.group);if(!blobs.length)throw Error('내려받을 녹음이 없습니다.');const url=URL.createObjectURL(new Blob(blobs,{type:m.session.mime})),a=document.createElement('a');a.href=url;a.download='연구미팅-'+m.session.created.slice(0,10)+(m.session.mime.includes('mp4')?'.m4a':'.webm');a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){m.message=e.message;mrPaint();}}
function mrImport(){const m=meetingRecorder;if(!m.session||m.active||m.processing){m.message='회의와 AI 처리 종료 후 전사문을 가져올 수 있습니다.';mrPaint();return;}rrDialog('전사문 가져오기','<p>현재 선택한 연구주제의 전사문을 붙여넣습니다. 다른 주제의 내용은 따로 가져와주세요.</p><textarea name="text" rows="12" maxlength="30000" required></textarea>',async b=>{const topic=mrTopic(),marker=m.session.markers.find(x=>x.topic===topic);if(!marker)throw Error('이 회의에서 기록한 주제를 선택해주세요.');const paragraphs=b.text.split(/\n+/).filter(Boolean);for(const [i,text] of paragraphs.entries())m.session.segments.push({id:crypto.randomUUID(),start:marker.at,end:marker.at,text:text.slice(0,4000),speaker:'speaker-0',topic});await mrChanged();await mrSync();mrPaintTranscript();});}
const mrSummaryTitles=['연구진행상황','문제점 · 학생','개선점 · 교수','해야 할 일'];
function mrSummarySections(content){const parts=['','','',''];let section=0;for(const line of String(content||'').split('\n')){const heading=line.replace(/^#+\s*|\*\*/g,'').trim();const index=mrSummaryTitles.findIndex((title,i)=>heading===title||(i===1&&/^문제점/.test(heading))||(i===2&&/^개선점/.test(heading)));if(index>=0){section=index;continue;}parts[section]+=line+'\n';}return parts.map(x=>x.trim());}
// Keep stored minutes intact; presentation metadata is escaped and never interpreted as HTML.
function mrSummaryItems(part,section){return String(part||'').split('\n').filter(x=>x.trim()).map(line=>{
 let text=line.replace(/^\s*[-*•]\s*/,''),tags=[],due=[];
 const tag=value=>{const name=value.trim();if(name&&name.length<=40&&!tags.includes(name))tags.push(name);};
 text=text.replace(/\[\[(학생|이름|담당자|기한):([^\]\n]{1,80})\]\]/g,(_,kind,value)=>{if(kind==='기한'){if(!/미정|미언급|언급.*없/.test(value))due.push(value.trim());}else value.split(/[,、]/).forEach(tag);return '';}).trim();
 // Remove generated metadata labels without changing the saved source minutes.
 text=text.replace(/\*\*(채택\s*여부(?:\s*[·ㆍ/・,]\s*담당자)?|담당자)\*\*/g,'$1');
 text=text.replace(/[（(]\s*채택\s*여부(?:\s*[·ㆍ/・,]\s*담당자)?\s*[:：][^）)\n]*[）)]/g,'');
 text=text.replace(/채택\s*여부(?:\s*[·ㆍ/・,]\s*담당자)?\s*[:：]\s*(?:미정|미확정|확인 필요|언급 없음)(?:이다|입니다)?[。.]/g,'');
 // Legacy summaries name speakers in prose; remove only an explicit subject prefix.
 const students=/^(?:담당자\s*[:：]?\s*)?(학생\s*\d*(?:\s*(?:과|와|및|,|·)\s*학생\s*\d*)*)\s*(?:은|는|이|가|[:：])\s*/;
 const match=text.match(students);if(match){(match[1].match(/학생\s*\d*/g)||[]).forEach(x=>tag(x.replace(/\s+/g,' ').trim()));text=text.slice(match[0].length);}
 if(section===2)text=text.replace(/^교수(?:님)?(?:은|는|이|가)\s*/, '');
 text=text.replace(/[（(]?\s*(?:기한|마감일|마감)\s*[:：]?\s*(?:은|는)?\s*(?:미정(?:이다|입니다)?|미언급|언급(?:이)?\s*없(?:음|다|습니다))\.?\s*[）)]?/g,' ').trim();
 if(section===3){text=text.replace(/담당자\s*[:：]\s*([^。.\n]+)[。.]?/g,(_,value)=>{const names=value.match(/학생\s*\d+/g)||[];names.forEach(name=>tag(name+(/미정|제안|확정 여부|요청/.test(value)?' · 확인 필요':'')));return '';}).trim();}
 text=text.replace(/채택\s*여부(?:\s*[·ㆍ/・,]\s*담당자)?\s*[:：]?\s*/g,'').replace(/담당자\s*[:：]?\s*/g,'').replace(/[（(]\s*[）)]/g,'').trim();
 const body=esc(text.replace(/^[,;·\s]+|[,;·\s]+$/g,'')).replace(/학생\s*\d+(?:[·,]\s*\d+)*(?:은|는|이|가|도)?/g,value=>{const numbers=value.match(/\d+/g)||[];return numbers.map(n=>'<span class="mr-person-tag">학생 '+n+'</span>').join('');});
 text=text.replace(/^[,;·\s]+|[,;·\s]+$/g,'');
 if(!text)return '';
 return '<li>'+tags.map(name=>'<span class="mr-person-tag">'+esc(name)+'</span>').join('')+'<span class="mr-summary-text">'+body+'</span>'+due.map(value=>'<span class="mr-due-tag">'+esc(value)+'</span>').join('')+'</li>';
}).join('')||'<li class="muted">기록된 내용이 없습니다.</li>';}

function mrSummaryContent(parts){return parts.map((x,i)=>'## '+mrSummaryTitles[i]+'\n'+x).join('\n\n');}
function mrHasMeetingContent(s,key){return !!s&&s.status!=='cancelled'&&((['failed','queued','working','waiting','attention','participants-required'].includes(s.processing?.status)&&s.markers?.some(m=>(m.topic||'unclassified')===key))||!!s.summary?.[key]?.content?.trim()||(s.segments?s.segments.some(x=>x.text?.trim()&&(mrTopicAt(s.markers,x.start)||'unclassified')===key):s.transcriptTopics?.includes(key)));}
async function mrOpenLatestSummary(root,key){
 const m=meetingRecorder;if(m.summaryLoading)return;m.summaryLoading=true;
 try{if(!m.historyLoaded)await mrLoadHistory();const latest=(m.history||[]).find(x=>mrHasMeetingContent(x,key));
 if(latest&&!m.active&&!m.dirty&&!m.pendingAudio.length&&!m.processing&&!m.converting&&!m.discarding){const result=await researchFetch('recording-detail?id='+encodeURIComponent(latest.id));if((mrTopic()||'unclassified')===key&&!m.active&&!m.dirty&&!m.pendingAudio.length)Object.assign(m,{session:result,version:result.version,clockBase:result.duration,audioIndex:result.audioCount||0,dirty:false});}
 }catch(e){m.message=e.message;}finally{m.summaryLoading=false;m.summaryLoadedKey=key;if(root.isConnected)mrSummaryView(root);}
}
function mrSummaryView(root){
 if(!admin())return;const m=meetingRecorder,s=m.session,topic=mrTopic(),key=topic||'unclassified';
 if(!mrHasMeetingContent(s,key)&&!m.active&&!m.processing&&!m.converting&&!m.dirty&&!m.pendingAudio.length&&m.summaryLoadedKey!==key){root.innerHTML='<div class="mr-empty">회의 기록을 불러오는 중입니다.</div>';mrOpenLatestSummary(root,key);return;}
 if(!s||(!mrHasMeetingContent(s,key)&&!m.active&&!m.processing&&!m.converting&&!['queued','working'].includes(s.processing?.status))){root.innerHTML='<div class="mr-empty">이 연구주제에 저장된 전사 또는 회의요약이 없습니다.</div>';return;}
 const draftKey=s.id+':'+key,segments=s.segments.filter(x=>mrTopicAt(s.markers,x.start)===topic),content=m.summaryDrafts[draftKey]??s.summary?.[key]?.content??'',parts=mrSummarySections(content),editing=m.summaryEditing===draftKey,locked=m.active||m.processing||m.converting||m.discarding||['queued','working'].includes(s.processing?.status);
 const meetings=[s,...(m.history||[]).filter(x=>x.id!==s.id)].filter(x=>mrHasMeetingContent(x,key)).sort((a,b)=>b.created.localeCompare(a.created));
 root.innerHTML=`${mrVoiceStatus(s)}<div class="mr-summary">${s.processing?.status==='failed'?`<div role="status" class="mr-recovery"><p>전사·요약이 중단되었습니다. ${esc(s.processing.error||'')}</p><button class="primary" data-mr="transcribe" ${locked?'disabled':''}>저장된 녹음으로 다시 처리</button></div>`:['queued','working','waiting'].includes(s.processing?.status)?`<p role="status">전사·요약 처리 중 · 완료되면 알림으로 알려드립니다.</p>`:s.processing?.status==='attention'?`<p role="status">${esc(s.processing.error||'처리 상태 확인이 필요합니다.')}</p><button class="primary" data-mr="retry-uncertain">미확인 구간 재처리</button>`:''}<div class="mr-date-tabs">${meetings.map(x=>`<button class="secondary ${x.id===s.id?'selected':''}" data-summary-meeting="${esc(x.id)}" ${locked?'disabled':''}>${esc(new Date(x.created).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))}</button>`).join('')}</div><div class="mr-summary-heading"><div><h3>${rrTime(s.created)}</h3><p>${esc(mrTopicName(topic))}</p></div><span class="mr-review-state">${s.summary?.[key]?.rolesChanged?'역할 변경 · 재검토 필요':s.summary?.[key]?.status==='reviewed'&&m.summaryDrafts[draftKey]===undefined?'등록 완료':'등록된 회의요약'}</span><button class="secondary" id="mrEditSummary" ${locked?'disabled':''}>${editing?'보기':'수정'}</button></div><p class="muted">요약은 자동 등록되며, 참여 학생과 교수님이 수정할 수 있습니다.${s.summary?.[key]?.knowledgeSources?.length ? ` 이번 요약은 이전 회의 ${s.summary[key].knowledgeSources.length}건을 참고했습니다.` : ''}</p><div class="mr-summary-grid">${parts.map((part,i)=>`<section><h4>${mrSummaryTitles[i]}</h4>${editing?`<textarea data-summary-section="${i}" aria-label="${mrSummaryTitles[i]}" maxlength="40000" placeholder="- 구체적인 내용을 문장으로 작성하세요.">${esc(part)}</textarea>`:`<ul>${mrSummaryItems(part,i)}</ul>`}</section>`).join('')}</div><div class="mr-review-actions">${segments.length?`<button class="secondary" data-mr="speaker-roles" ${locked?'disabled':''}>교수님 변경</button>`:''}${s.summary?.[key]?.rolesChanged?`<button class="secondary" data-mr="summarize" ${locked?'disabled':''}>역할 반영해 요약 재생성</button>`:''}<button class="primary" id="mrSaveSummary" ${locked?'disabled':''}>수정 내용 저장</button>${mrDiscardButton()}<span id="mrSummaryStatus" role="status"></span></div><details class="mr-tools"><summary>전사 원문 · 교수님 전용 / 요약 도구</summary><div class="mr-summary-actions">${mrCreateTopicButton()}<button class="primary" data-mr="transcribe" ${locked||!m.ready?.transcriptionReady?'disabled':''}>전사 · 주제별 요약</button><button class="secondary" data-mr="import" ${locked?'disabled':''}>전사문 가져오기</button><button class="secondary" data-mr="summarize" ${locked||!segments.length||!m.ready?.summaryReady?'disabled':''}>AI 요약 생성</button></div>${segments.map(x=>`<p><time>${mrStamp(x.start)}</time> <strong>${esc(s.speakers?.[x.speaker]||x.speaker)}</strong> ${esc(x.text)}</p>`).join('')||'<p>전사 내용이 없습니다.</p>'}<details><summary>주제 전환 기록</summary>${s.markers.map(x=>`<p>${mrStamp(x.at)} · ${esc(x.title)}</p>`).join('')}</details></details></div>`;
 root.querySelectorAll('[data-summary-section]').forEach(input=>input.oninput=()=>{parts[+input.dataset.summarySection]=input.value;m.summaryDrafts[draftKey]=mrSummaryContent(parts);root.querySelector('.mr-review-state').textContent='수정 중 · 미저장';});
 root.querySelector('#mrEditSummary').onclick=()=>{m.summaryEditing=editing?null:draftKey;mrSummaryView(root);};
 const save=async status=>{const buttons=root.querySelectorAll('.mr-review-actions button');buttons.forEach(b=>b.disabled=true);try{await mrSync();if(m.dirty)throw Error('회의 기록을 먼저 서버에 저장해주세요.');const text=m.summaryDrafts[draftKey]??content,r=await researchFetch('recording-summary-save',{id:s.id,topic:key,content:text,status,version:m.version});m.version=r.version;s.summary??={};s.summary[key]={content:text,status};delete m.summaryDrafts[draftKey];m.summaryEditing=null;await mrLocal(mrDraftKey(),{session:s,version:m.version});mrSummaryView(root);root.querySelector('#mrSummaryStatus').textContent='요약을 저장했습니다.';}catch(e){root.querySelector('#mrSummaryStatus').textContent=e.message;buttons.forEach(b=>b.disabled=false);}};
 root.querySelector('#mrSaveSummary').onclick=()=>save('reviewed');
 root.querySelectorAll('[data-summary-meeting]').forEach(b=>b.onclick=async()=>{if(locked||m.discarding||m.active||m.processing||m.converting||m.syncing)return;try{await mrSync();if(m.dirty||m.pendingAudio.length)throw Error('현재 회의 저장을 먼저 완료해주세요.');const result=await researchFetch('recording-detail?id='+encodeURIComponent(b.dataset.summaryMeeting));Object.assign(m,{session:result,version:result.version,clockBase:result.duration,audioIndex:result.audioCount||0,dirty:false});mrSummaryView(root);mrPaintTranscript();}catch(e){root.querySelector('#mrSummaryStatus').textContent=e.message;}});mrBind();
}


function mrDiscardButton(){const m=meetingRecorder;return admin()&&m.session?.segments?.length?`<button class="secondary" data-mr="discard-transcript" ${m.active||m.processing||m.stopping||m.discarding?'disabled':''}>이번 전사 폐기</button>`:'';}
async function mrDiscardTranscript(){
 const m=meetingRecorder;if(!admin()||!m.session||m.active||m.processing||m.stopping||m.converting||m.discarding)return;
 if(!confirm('현재 회의의 전사와 미확정 요약을 폐기할까요? 다른 회의는 유지됩니다. 전사가 완료된 녹음은 이미 삭제되므로 다시 전사할 수 없습니다. 확정된 요약이 있으면 폐기할 수 없습니다.'))return;
 m.discarding=true;try{await mrSync();if(m.dirty||m.pendingAudio.length||m.session.nativePending)throw Error('서버 저장이 끝난 뒤 다시 시도해주세요.');const s=await researchFetch('recording-discard-transcript',{id:m.session.id,version:m.version});m.session=s;m.version=s.version;m.dirty=false;for(const k of Object.keys(m.summaryDrafts))if(k.startsWith(s.id+':'))delete m.summaryDrafts[k];m.summaryEditing=null;await mrLocal(mrDraftKey(),{session:s,version:s.version});await mrLoadHistory();m.message='이번 전사와 미확정 요약을 폐기했습니다. 전사가 완료된 녹음 원본은 삭제되므로 다시 전사할 수 없습니다.';rrDraw();}finally{m.discarding=false;mrUpdateControls();}
}

async function mrAction(action){if(!admin())return;try{if(action==='voices')return await mrVoices();if(action==='participants')return await mrParticipants();if(action==='knowledge')return await mrKnowledge();if(action==='discard-transcript')return await mrDiscardTranscript();if(action==='create-topic')return mrCreateTopic();if(action==='speaker-roles')return mrRenameSpeaker();if(action==='start')return await mrStart();if(action==='pause')return await mrPause();if(action==='stop')return await mrStop();if(action==='download')return await mrDownload();if(action==='import')return mrImport();if(action==='collapse'){meetingRecorder.collapsed=!meetingRecorder.collapsed;document.querySelector('.mr-drawer')?.classList.toggle('collapsed',meetingRecorder.collapsed);rrDraw();return;}if(action==='retry-uncertain'){const m=meetingRecorder;if(!confirm('이전 요청의 결과를 받지 못했습니다. 해당 구간의 API 비용이 중복될 수 있습니다. 이미 저장된 전사는 유지하고 다시 처리할까요?'))return;const result=await researchFetch('recording-retry-uncertain',{id:m.session.id,version:m.version,acknowledgeDuplicateCost:true});mrMergeTranscript(result);mrQueue.last=0;mrPump();rrDraw();return;}if(action==='transcribe')return await mrProcessMeeting();if(action==='summarize'&&typeof mrSummarize==='function')return await mrSummarize();}catch(e){meetingRecorder.message=e.message;mrPaint();}}
setInterval(()=>{if(!admin())return;mrPaint();mrRotatePart();},1000);
setInterval(()=>{if(admin()&&meetingRecorder.session&&(meetingRecorder.dirty||meetingRecorder.pendingAudio.length||meetingRecorder.session.nativePending||(meetingRecorder.active&&meetingRecorder.native)))mrSync();},8000);
window.addEventListener('beforeunload',e=>{if(meetingRecorder.active||meetingRecorder.dirty||meetingRecorder.pendingAudio.length){e.preventDefault();e.returnValue='';}});
const mrQueue={busy:false,pending:0,last:0,cleaned:new Set(),enqueuing:new Set()};
function mrMergeTranscript(result){const m=meetingRecorder;if(m.session?.id!==result.id)return;if(!m.syncing&&!m.dirty)m.version=result.version;for(const key of ['segments','speakers','transcription','summary','processing','audioDeletedAt','voiceEnrollment','voiceCatalog','voiceSelection','voiceParticipants'])if(result[key]!==undefined)m.session[key]=result[key];mrPaintTranscript();}
async function mrEnqueue(id,retry=false){if(mrQueue.enqueuing.has(id))return;mrQueue.enqueuing.add(id);try{await researchFetch('recording-enqueue',{id,retry});mrQueue.pending=Math.max(1,mrQueue.pending);mrQueue.last=0;}finally{mrQueue.enqueuing.delete(id);}mrPump();}
async function mrCleanLocal(item){if(!item.audioDeletedAt||mrQueue.cleaned.has(item.id))return;for(let i=0;i<(item.audioCount||0);i++)await mrLocal(user.email+':audio:'+item.id+':'+i,undefined,true);if(mrNativeAvailable())await mrNative('purge',{id:item.id});mrQueue.cleaned.add(item.id);}
async function mrPump(){
 if(!admin()||mrQueue.busy||Date.now()-mrQueue.last<5000)return;mrQueue.busy=true;mrQueue.last=Date.now();
 try{
  const {meetings}=await researchFetch('recording-queue');
  mrQueue.pending=meetings.filter(x=>['queued','working','waiting'].includes(x.processing?.status)).length;
  for(const item of meetings){await mrCleanLocal(item).catch(()=>{});
   const m=meetingRecorder;
   if(m.session?.id===item.id&&!m.active&&!m.dirty&&!m.syncing&&!m.summaryEditing&&m.session.processing?.updated!==item.processing?.updated){
    const fresh=await researchFetch('recording-detail?id='+encodeURIComponent(item.id));mrMergeTranscript(fresh);
    if(['completed','failed','attention','participants-required'].includes(fresh.processing?.status)){await mrLoadHistory();if(typeof refreshNotifications==='function')await refreshNotifications();}
    if(tab==='researchRooms')rrDraw();
   }
   if(!['queued','waiting','working'].includes(item.processing?.status))continue;if(item.processing.status==='working'&&Date.now()-Date.parse(item.processing.updated)<480000)continue;
   const result=await researchFetch('recording-work',{id:item.id});if(result.busy)continue;
   mrMergeTranscript(result);if(result.voiceEnrollment&&tab==='researchRooms'&&!meetingRecorder.summaryEditing)rrDraw();await mrCleanLocal(result).catch(()=>{});if(meetingRecorder.session?.id===result.id&&!meetingRecorder.active&&!meetingRecorder.dirty&&!meetingRecorder.syncing)await mrLocal(mrDraftKey(),{session:meetingRecorder.session,version:meetingRecorder.version});
   if(result.processing?.status==='completed'){if(typeof refreshNotifications==='function')await refreshNotifications();await mrLoadHistory();if(tab==='researchRooms'&&!meetingRecorder.active&&!meetingRecorder.summaryEditing)rrDraw();}
   if(['failed','attention'].includes(result.processing?.status)){meetingRecorder.message='전사 확인 필요: '+result.processing.error;}
  }
 }catch(e){meetingRecorder.message='전사 처리 연결 대기 · 녹음은 계속됩니다. '+e.message;}
 finally{mrQueue.busy=false;mrPaint();}
}
setInterval(()=>mrPump(),5000);
async function mrProcessMeeting(){const m=meetingRecorder;if(!m.session||m.active)return;await mrSync();if(m.dirty||m.pendingAudio.length||m.session.nativePending)throw Error('업로드 완료 후 다시 시도해주세요.');await mrEnqueue(m.session.id,true);const updated=await researchFetch('recording-detail?id='+encodeURIComponent(m.session.id));mrMergeTranscript(updated);rrDraw();m.message='전사·요약 대기열에 등록했습니다. 다음 회의를 시작할 수 있습니다.';mrUpdateControls();}

async function mrSummarize(){const m=meetingRecorder;if(m.processing||m.converting||!m.session)return;if(m.session.summary?.[mrTopic()||'unclassified']?.rolesChanged&&!confirm('기존 요약을 보관하고 변경된 교수님·학생 구분으로 새 요약을 생성해 등록할까요?'))return;m.processing=true;try{await mrSync();if(m.dirty)throw Error('서버 저장이 끝난 후 다시 시도해주세요.');const s=await researchFetch('recording-summarize',{id:m.session.id,topic:mrTopic()||'unclassified',regenerate:!!m.session.summary?.[mrTopic()||'unclassified']?.rolesChanged});m.session=s;m.version=s.version;delete m.summaryDrafts[s.id+':'+(mrTopic()||'unclassified')];if(typeof refreshNotifications==='function')await refreshNotifications();m.message='요약이 자동 등록되었습니다.';rrDraw();}catch(e){m.message=e.message;mrPaint();}finally{m.processing=false;mrUpdateControls();}}

function mrCreateTopicButton(){const m=meetingRecorder;return admin()&&mrTopic()===null&&m.session?.markers.some(x=>x.topic===null)?`<button class="primary" data-mr="create-topic" ${m.processing||m.converting?'disabled':''}>＋ 새 연구미팅으로 만들기</button>`:'';}
function mrCreateTopic(){
 const m=meetingRecorder,s=m.session;if(!s||m.processing||m.converting)return;
 const ranges=s.markers.map((x,i)=>({...x,index:i,end:s.markers[i+1]?.at})).filter(x=>x.topic===null);
 if(!ranges.length)throw Error('옮길 미분류 구간이 없습니다.');
 const newTopic=crypto.randomUUID();
 const fields=rrField('새 연구미팅 이름','title','','text','required maxlength="120" placeholder="예: 새로운 전해질 조성 연구"')+'<p>선택한 구간을 새 연구미팅에 연결합니다. 녹음은 계속 유지되며, 새 연구미팅은 우선 교수님만 볼 수 있습니다.</p><fieldset><legend>옮길 미분류 구간</legend>'+ranges.map((x,i)=>`<label class="rr-check"><input type="checkbox" name="range" value="${x.index}" ${i===ranges.length-1?'checked':''}> ${mrStamp(x.at)}–${x.end===undefined?(m.active?'현재':mrStamp(mrSeconds())):mrStamp(x.end)}</label>`).join('')+'</fieldset>';
 const dialog=rrDialog('미분류 → 새 연구미팅',fields,async b=>{
  if(m.session?.id!==s.id||m.processing)throw Error('선택한 회의가 바뀌었거나 전사 처리 중입니다. 다시 열어주세요.');
  const markerIndexes=[...dialog.querySelectorAll('[name=range]:checked')].map(x=>Number(x.value));if(!markerIndexes.length)throw Error('미분류 구간을 하나 이상 선택해주세요.');
  await mrSync();if(m.dirty)await mrSync();if(m.dirty||m.pendingAudio.length)throw Error('회의 저장이 끝난 뒤 다시 시도해주세요.');
  m.converting=true;mrUpdateControls();
  try{
   let result;try{result=await researchFetch('recording-create-topic',{id:s.id,newTopic,title:b.title,markerIndexes,version:m.version});}catch(error){const latest=await researchFetch('recording-detail?id='+encodeURIComponent(s.id)).catch(()=>null);if(!latest?.conversions?.[newTopic])throw error;result=latest;}
   // Preserve locally arriving audio and elapsed time while the server commits.
   m.version=result.version;m.session.markers=m.session.markers.map((x,i)=>markerIndexes.includes(i)?{...x,topic:newTopic,title:b.title.trim()}:x);
   m.session.segments=m.session.segments.map(x=>({...x,topic:mrTopicAt(m.session.markers,x.start)}));
   m.session.summary=result.summary;m.session.summaryEpoch=result.summaryEpoch;m.session.conversions=result.conversions;
   delete m.summaryDrafts[s.id+':unclassified'];
   researchRoomState.rooms?.topics.push({id:newTopic,title:b.title.trim(),archived:false,viewers:[]});researchRoomState.selected=newTopic;researchRoomState.archived=false;researchRoomState.mobileChatOpen=true;researchRoomState.view='meeting';
   mrChooseTopic(newTopic);await mrChanged();m.message='새 연구미팅에 연결했습니다. '+(m.active?'이후 녹음도 이 주제로 기록합니다.':'회의 요약과 전사 원문에서 확인하세요.');
  }finally{m.converting=false;mrUpdateControls();}
  await mrSync();
 },'새 연구미팅 만들기');
}

window.nismlRecorderSegmentReady=()=>{if(admin()){mrSync();mrPump();}};

async function mrKnowledge(){
 const topic=mrTopic();if(!topic)throw Error('연구주제를 먼저 선택해주세요.');
 const data=await researchFetch('recording-knowledge?topic='+encodeURIComponent(topic));
 const d=rrDialog('연구 배경·용어집',`<p>${esc(mrTopicName(topic))} · ${data.entries.length}개 항목</p><p>AI 작성 자료는 용어와 배경 이해에만 참고합니다. 과거 결과를 이번 회의 사실로 사용하지 않습니다.</p><label>연구별 자료집 가져오기<input type="file" name="knowledge" accept="application/json,.json"></label><details><summary>현재 자료 보기</summary>${data.entries.map(e=>`<p>${esc(e.text)}<small style="display:block">${esc(e.sources.join(' · '))}</small></p>`).join('')||'<p>등록된 자료가 없습니다.</p>'}</details>`,async v=>{if(!v.knowledge?.size) return;if(v.knowledge.size>2500000)throw Error('자료집을 나누어 가져와주세요.');const parsed=JSON.parse(await v.knowledge.text());if(!Array.isArray(parsed.topics))throw Error('연구별 자료집 형식을 확인해주세요.');for(const item of parsed.topics)await researchFetch('recording-knowledge-import',{topics:[item]});},'자료 연결');
}

function mrVoiceScript(name){return '안녕하세요. 저는 '+(String(name||'').trim()||'[이름]')+'입니다. 오늘 연구 결과와 다음 실험 계획을 설명하겠습니다.';}
async function mrPrepareVoice(file){
 if(!file?.size||file.size>12000000)throw Error('12MB 이하의 음성 파일을 선택해주세요.');
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('이 브라우저에서는 파일을 변환할 수 없습니다. 최신 Chrome 또는 Safari를 사용해주세요.');
 const ctx=new Audio();let decoded;try{decoded=await ctx.decodeAudioData(await file.arrayBuffer());}catch{throw Error('음성을 읽을 수 없습니다. M4A, MP3 또는 WAV 파일을 선택해주세요.');}finally{await ctx.close();}
 if(decoded.duration<2||decoded.duration>10)throw Error('현재 '+decoded.duration.toFixed(1)+'초입니다. 2~10초 파일로 준비해주세요. 권장 길이는 5~8초입니다.');
 const length=Math.floor(decoded.duration*16000),bytes=new Uint8Array(44+length*2),v=new DataView(bytes.buffer),str=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
 str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,length*2,true);
 let energy=0;const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));
 for(let i=0;i<length;i++){const at=i*decoded.sampleRate/16000,j=Math.floor(at),f=at-j;let value=0;for(const c of channels)value+=(c[j]||0)*(1-f)+(c[Math.min(j+1,c.length-1)]||0)*f;value=Math.max(-1,Math.min(1,value/channels.length));energy+=value*value;v.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);}
 if(Math.sqrt(energy/length)<.001)throw Error('목소리가 너무 작거나 무음입니다. 다시 녹음해주세요.');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {base64:btoa(binary),duration:decoded.duration,blob:new Blob([bytes],{type:'audio/wav'})};
}
async function mrCaptureVoice(onTick){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('마이크 녹음을 지원하는 최신 브라우저에서 열어주세요.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
 let recorder,timer,timeout,done=false,parts=[],resolve,reject;
 const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const cleanup=()=>{clearInterval(timer);clearTimeout(timeout);stream.getTracks().forEach(t=>t.stop());};
 try{const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});
 recorder.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
 recorder.onerror=()=>{if(done)return;done=true;cleanup();reject(Error('마이크 녹음이 중단되었습니다. 다시 시도해주세요.'));};
 recorder.onstop=()=>{if(done)return;done=true;cleanup();resolve(new Blob(parts,{type:recorder.mimeType||mime||'audio/webm'}));};
 const start=performance.now();recorder.start();onTick(0);timer=setInterval(()=>onTick(Math.min(8,(performance.now()-start)/1000)),100);timeout=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},8000);
 return {result,stop(){if(!done&&recorder.state==='recording')recorder.stop();},cancel(){if(done)return;done=true;cleanup();if(recorder.state!=='inactive')recorder.stop();resolve(null);}};
 }catch(e){done=true;cleanup();throw e;}
}

async function mrVoices(){
 if(!admin())return;const {voices}=await researchFetch('recording-voices');let prepared=null,objectURL=null,preparing=false,capture=null,closed=false;
 const d=rrDialog('음성 등록 · 교수님 전용',`<p>참여자별 목소리를 등록합니다. 회의 시작 시 호명한 이름과 연결하여 화자 구분에 참고합니다.</p><label>이름<input name="name" required maxlength="40" placeholder="예: 박준하" autocomplete="off"></label><label>역할<select name="role"><option value="student">학생</option><option value="professor">교수님</option></select></label><section class="mr-voice-script"><strong>이 문장을 평소 말투로 읽어주세요</strong><p data-voice-script>${esc(mrVoiceScript(''))}</p><small>혼자 말하기 · 권장 5~8초 / 허용 2~10초 · 실제 회의 마이크와 거리로 녹음</small></section><div class="mr-voice-record"><button type="button" class="primary" data-voice-record>● 바로 녹음하기</button><button type="button" class="secondary" data-voice-stop disabled>녹음 끝내기</button><span data-voice-timer aria-live="off">00:00 / 00:08</span></div><audio data-voice-preview controls hidden></audio><p data-voice-length role="status">녹음하기를 누르고 위 문장을 읽어주세요. 8초 후 자동으로 끝납니다.</p><p class="muted">등록 음성은 다음 회의에도 사용하도록 별도 보관합니다. 화자 분석 시 OpenAI에 전달되며, 아래에서 삭제할 수 있습니다. 회의 녹음 원본은 전사 완료 후 폐기됩니다.</p><details open><summary>등록된 음성 ${voices.length}명</summary><div class="mr-voice-list">${voices.map(p=>`<article><div><strong>${esc(p.name)}</strong> <span>${p.role==='professor'?'교수님':'학생'} · ${p.duration.toFixed(1)}초</span><button type="button" class="secondary" data-voice-delete="${esc(p.id)}">삭제</button></div><audio controls preload="none" src="${esc(previewURL('/api/ai/recording-voice-audio?id='+encodeURIComponent(p.id)))}"></audio></article>`).join('')||'<p>아직 등록된 음성이 없습니다.</p>'}</div></details>`,async v=>{
  if(preparing||capture||!prepared)throw Error('먼저 녹음한 뒤 재생해서 확인하고 등록해주세요.');await researchFetch('recording-voice-save',{id:crypto.randomUUID(),name:v.name,role:v.role,base64:prepared.base64});meetingRecorder.message='음성을 등록했습니다. 다음 회의 시작 후 첫 8초 안에 참여자 이름을 말씀해주세요.';
 },'음성 등록');
 d.querySelector('[name=name]').oninput=e=>d.querySelector('[data-voice-script]').textContent=mrVoiceScript(e.target.value);
 let generation=0;const record=d.querySelector('[data-voice-record]'),stop=d.querySelector('[data-voice-stop]'),status=d.querySelector('[data-voice-length]'),saveButton=d.querySelector('footer .primary');saveButton.disabled=true;
 record.onclick=async()=>{
  if(meetingRecorder.active){status.textContent='회의 녹음을 마친 뒤 음성을 등록해주세요.';return;}
  const token=++generation;record.disabled=true;saveButton.disabled=true;prepared=null;preparing=true;status.textContent='마이크 연결 중…';d.querySelector('[data-voice-preview]').hidden=true;
  try{const controller=await mrCaptureVoice(seconds=>{if(!closed)d.querySelector('[data-voice-timer]').textContent='00:'+String(Math.floor(seconds)).padStart(2,'0')+' / 00:08';});
   if(closed||token!==generation){controller.cancel();return;}capture=controller;stop.disabled=false;status.textContent='녹음 중 · 평소 말투로 문장을 읽어주세요.';
   const blob=await controller.result;capture=null;stop.disabled=true;if(!blob||closed||token!==generation)return;
   status.textContent='녹음 확인 중…';const result=await mrPrepareVoice(blob);if(closed||token!==generation)return;prepared=result;
   if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(result.blob);const audio=d.querySelector('[data-voice-preview]');audio.src=objectURL;audio.hidden=false;saveButton.disabled=false;status.textContent=result.duration.toFixed(1)+'초 · 재생해서 확인한 뒤 등록해주세요.';record.textContent='↻ 다시 녹음하기';
  }catch(e){if(!closed)status.textContent=e.name==='NotAllowedError'?'마이크 사용이 허용되지 않았습니다. 브라우저의 마이크 권한을 확인해주세요.':e.message;}
  finally{if(!closed){preparing=false;record.disabled=false;stop.disabled=true;capture=null;}}
 };
 stop.onclick=()=>capture?.stop();
 const close=d.onclose;d.onclose=()=>{closed=true;generation++;capture?.cancel();capture=null;if(objectURL)URL.revokeObjectURL(objectURL);close();};
 d.querySelectorAll('[data-voice-delete]').forEach(button=>button.onclick=async()=>{const profile=voices.find(p=>p.id===button.dataset.voiceDelete);if(!confirm(profile.name+'님의 등록 음성을 삭제할까요? 다음 회의에는 사용되지 않습니다.'))return;button.disabled=true;try{await researchFetch('recording-voice-delete',{id:profile.id,version:profile.version});d.close();await mrVoices();}catch(e){d.querySelector('.rr-dialog-status').textContent=e.message;button.disabled=false;}});
}
function mrVoiceStatus(s){if(!s?.voiceEnrollment)return '';const names=(s.voiceParticipants||[]).map(p=>p.name+' · '+(p.role==='professor'?'교수님':'학생')).join(', '),review=s.voiceSelection?.status==='review';return `<div class="mr-voice-status"><strong>${review?'참여자 확인 필요':names?'등록 음성 연결':'참여자 호명 대기'}</strong><span>${esc(names||'처음 8초 동안 교수님 혼자 참여자 이름을 말씀해주세요.')}</span>${review?`<p>${esc(s.voiceSelection.reason)}</p>`:''}${s.transcription?.completedParts===1?'<button class="secondary" data-mr="participants">참여자 확인</button>':''}</div>`;}
async function mrParticipants(){
 const m=meetingRecorder;if(!admin()||!m.session)return;const s=await researchFetch('recording-detail?id='+encodeURIComponent(m.session.id));if(!s.voiceEnrollment)throw Error('음성을 등록한 뒤 새 회의부터 사용할 수 있습니다.');
 const d=rrDialog('회의 참여자 확인',`<p>등록된 음성을 최대 4명까지 선택합니다. 녹음은 계속되며, 확인이 필요한 동안 다음 구간 전사만 대기합니다.</p>${s.voiceSelection?.heard?`<p>시작 발언: ${esc(s.voiceSelection.heard)}</p>`:''}<fieldset><legend>참여자</legend>${(s.voiceCatalog||[]).map(p=>`<label class="rr-check"><input type="checkbox" name="participant" value="${esc(p.id)}" ${(s.voiceParticipants||[]).some(q=>q.id===p.id)?'checked':''}>${esc(p.name)} · ${p.role==='professor'?'교수님':'학생'}</label>`).join('')}</fieldset>`,async()=>{const selected=[...d.querySelectorAll('[name=participant]:checked')].map(x=>x.value);const fresh=await researchFetch('recording-detail?id='+encodeURIComponent(s.id));const result=await researchFetch('recording-participants',{id:s.id,version:fresh.version,participants:selected});mrMergeTranscript(result);mrQueue.last=0;mrPump();},'참여자 적용');
}
