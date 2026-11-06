/* Share only an explicitly selected snapshot; ordinary personal files remain local. */
const SharedArtifactLibrary=(()=>{
 const api=async(path,method='GET',body)=>{if(typeof studentPreview!=='undefined'&&studentPreview)throw Error('학생 미리보기에서는 공유 보관함을 사용할 수 없습니다.');const response=await fetch('/api/library/'+path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','X-Lab-Request':'1'},...(body?{body:JSON.stringify(body)}:{})});let result;try{result=await response.json();}catch{throw Error(response.status===401?'로그인이 만료되었습니다. 다시 로그인해 주세요.':response.status===404?'공유 항목의 저장 경로를 찾지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.':`공유 저장소 응답을 읽지 못했습니다 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`);}if(!response.ok)throw Error(result.error||'공유 요청에 실패했습니다.');return result;};
 const payload=(kind,a)=>kind==='graph'?{name:a.name,parsed:a.parsed,settings:a.settings}:{name:a.name,model:a.model};
 function wrap(kind,local){return {
  lastError:'',
  async list(owner){const own=await local.list(owner);try{let after='',shared=[];do{const page=await api(kind+(after?'?after='+encodeURIComponent(after):''));shared.push(...page.items);after=page.next;}while(after);this.lastError='';return own.filter(a=>!a.id.startsWith('shared_')).concat(shared);}catch(e){this.lastError='공유받은 항목을 불러오지 못했습니다: '+e.message;return own;}},
  async put(owner,a){if(!a.id.startsWith('shared_'))return local.put(owner,a);const result=await api(kind+'/'+encodeURIComponent(a.id),'PUT',{revision:a.revision,artifact:payload(kind,a)});a.revision=result.revision;return a;},
  async remove(owner,id,revision){if(!id.startsWith('shared_'))return local.remove(owner,id);await api(kind+'/'+encodeURIComponent(id),'DELETE',{revision});}
 };}
 async function share(kind,record,onDone){
  const d=document.createElement('dialog');d.className='library-share-dialog';d.setAttribute('aria-labelledby','libraryShareTitle');const title=kind==='graph'?'그래프':'테이블',requestId=crypto.randomUUID(),snapshot=structuredClone(payload(kind,record));
  d.innerHTML=`<form><h2 id="libraryShareTitle">${title} 공유</h2><p class="share-item-name"></p><p>선택한 구성원의 ‘내 ${title}’에 데이터와 서식의 사본이 추가됩니다. 서로의 수정 내용은 영향을 주지 않습니다.</p><div class="share-member-list" role="group" aria-label="공유할 연구실 구성원"></div><p class="share-message" role="status">구성원을 불러오는 중…</p><div class="share-actions"><button type="button" class="secondary" data-share-cancel>취소</button><button type="submit" class="primary" disabled>선택한 사람에게 공유</button></div></form>`;
  d.querySelector('.share-item-name').textContent=record.name;document.body.append(d);d.showModal();const close=()=>{d.close();d.remove();};d.querySelector('[data-share-cancel]').onclick=close;d.addEventListener('close',()=>d.remove());
  const message=d.querySelector('.share-message'),submit=d.querySelector('[type=submit]'),list=d.querySelector('.share-member-list');let members=[],sending=false;
  d.oncancel=e=>{if(sending)e.preventDefault();};
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();if(sending)return;const recipients=[...list.querySelectorAll('input:checked')].map(el=>el.value);if(!recipients.length){message.textContent='공유할 구성원을 선택해 주세요.';return;}sending=true;submit.disabled=true;d.querySelector('[data-share-cancel]').disabled=true;message.textContent='공유 중…';try{const result=await api('share','POST',{kind,artifact:snapshot,recipients,requestId});onDone?.(`${result.count}명에게 ${title} 사본을 공유했습니다.`);close();}catch(error){message.textContent=error.message;sending=false;submit.disabled=false;d.querySelector('[data-share-cancel]').disabled=false;}};
  try{({members}=await api('members'));if(!d.isConnected)return;for(const m of members){const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.value=m.email;text.textContent=m.name;label.append(input,text);list.append(label);}message.textContent=members.length?'공유할 구성원을 선택해 주세요.':'공유할 다른 구성원이 없습니다.';submit.disabled=!members.length;}catch(e){if(d.isConnected)message.textContent=e.message;}
 }
 return {wrap,share};
})();
