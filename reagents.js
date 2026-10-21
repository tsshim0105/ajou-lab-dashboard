const ReagentData=(()=>{
 const fields=['name','unit','capacity','quantity','location','note'];
 const headers=['화학물질명','단위','용량','연구실입고수량','보관위치','비고'];
 function parse(sheets){
  const result=[];let found=false;
  for(const rows of Object.values(sheets)){
   let columns=null;
   for(const row of rows){
    const labels=row.map(v=>String(v??'').replace(/\s/g,''));
    if(headers.every(h=>labels.includes(h))){columns=headers.map(h=>labels.indexOf(h));found=true;continue;}
    if(!columns)continue;
    const values=columns.map(i=>String(row[i]??'').trim());
    if(values.every(v=>!v))continue;
    if(!values[0])throw Error('화학물질명이 없는 행이 있습니다. 엑셀을 확인해주세요.');
    result.push({id:crypto.randomUUID(),...Object.fromEntries(fields.map((k,i)=>[k,values[i]]))});
   }
  }
  if(!found||!result.length)throw Error('화학물질명·단위·용량·연구실입고수량·보관위치·비고 열이 있는 시약 목록을 선택해주세요.');
  return result;
 }
 const key=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 function filter(rows,query,location){const q=key(query);return rows.filter(r=>(location==='all'||r.location===location)&&(q===''||fields.some(k=>key(r[k]).includes(q))));}
 return {fields,headers,parse,filter};
})();

let reagentQuery='',reagentLocation='all';
function renderReagents(){
 const locations=[...new Set((data.reagents||[]).map(r=>r.location).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 if(reagentLocation!=='all'&&!locations.includes(reagentLocation))reagentLocation='all';
 return `<div class="research-title"><h1>시약관리</h1><div class="research-title-actions">${canEditResearch()?'<button class="primary" id="addReagent">시약 추가</button><label class="secondary reagent-upload" role="button" tabindex="0">↑ 엑셀 가져오기<input id="reagentUpload" type="file" accept=".xlsx" hidden></label>':''}<button class="secondary download-action" id="csv">↓ CSV 저장</button></div></div><div class="toolbar reagent-filters"><label><span class="reagent-filter-label">보관위치</span> <select id="reagentLocation"><option value="all">전체</option>${locations.map(l=>`<option value="${esc(l)}" ${l===reagentLocation?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label style="flex:1"><span class="reagent-filter-label">검색</span> <input id="reagentQuery" type="search" value="${esc(reagentQuery)}" placeholder="시약명·보관위치·비고 검색"></label><button class="secondary" id="reagentReset">초기화</button></div><p id="reagentStatus" role="status"></p><p id="reagentCount" class="muted" aria-live="polite"></p><div id="reagentList"></div>`;
}
function drawReagents(){
 const all=data.reagents||[],rows=ReagentData.filter(all,reagentQuery,reagentLocation);
 exportRows=[[...ReagentData.headers,'구매 링크'],...rows.map(r=>[...ReagentData.fields.map(k=>r[k]),(r.links||[]).join('\n')])];
 $('reagentCount').textContent=`${rows.length}개 항목 / 전체 ${all.length}개`;
 $('reagentList').innerHTML=table([...ReagentData.headers,...(canEditResearch()?['관리']:[])],rows.map(r=>[...ReagentData.fields.map(k=>k==='name'?reagentNameLinks(r):esc(r[k]||'—')),...(canEditResearch()?[`<div class="reagent-actions"><button class="secondary edit-action" data-reagent-edit="${esc(r.id)}" aria-label="${esc(r.name)} 수정">수정</button></div>`]:[])]),['title','nowrap','nowrap','nowrap','nowrap','wide-cell','nowrap']);
 $('reagentList').querySelectorAll('[data-reagent-edit]').forEach(b=>b.onclick=()=>editReagent(b.dataset.reagentEdit));
}
function bindReagents(){
 drawReagents();$('reagentQuery').oninput=e=>{reagentQuery=e.target.value;drawReagents();};$('reagentLocation').onchange=e=>{reagentLocation=e.target.value;drawReagents();};
 $('reagentReset').onclick=()=>{reagentQuery='';reagentLocation='all';$('reagentQuery').value='';$('reagentLocation').value='all';drawReagents();};
 if($('addReagent'))$('addReagent').onclick=()=>editReagent();
 if($('reagentUpload')){$('reagentUpload').onchange=uploadReagents;const label=$('reagentUpload').parentElement;label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('reagentUpload').click();}};}
}
function reagentLocationField(record){
 const current=record?.location||'',locations=[...new Set([...(data.reagents||[]).map(r=>r.location),current].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 return `<label style="display:grid;gap:6px">보관위치<select name="location" style="width:100%;padding:10px"><option value="">미지정</option>${locations.map(l=>`<option value="${esc(l)}" ${l===current?'selected':''}>${esc(l)}</option>`).join('')}<option value="__custom__">＋ 새 장소 직접 입력</option></select></label><label data-custom-location hidden style="gap:6px">새 보관위치<input name="newLocation" maxlength="2000" placeholder="새 장소 이름" disabled style="width:100%;box-sizing:border-box;padding:10px"></label>`;
}
function editReagent(id=null){
 if(!canEditResearch())return;const record=(data.reagents||[]).find(r=>r.id===id);if(id&&!record)return;
 editor(id?'시약 정보 수정':'시약 추가',ReagentData.fields.map((k,i)=>k==='location'?reagentLocationField(record):field(k,ReagentData.headers[i]+(k==='name'?' *':''),record?.[k]||'','text',`${k==='name'?'required':''} maxlength="2000"`)).join('')+reagentLinksEditor(record?.links||[]),(values,next)=>{
  const location=values.location==='__custom__'?String(values.newLocation||'').trim():String(values.location||'').trim();if(values.location==='__custom__'&&!location)throw Error('새 보관위치를 입력해주세요.');
  const reagent={id:id||crypto.randomUUID(),...Object.fromEntries(ReagentData.fields.map(k=>[k,String(values[k]||'').trim()])),location};if(!reagent.name)throw Error('화학물질명을 입력해주세요.');
  reagent.links=[...document.querySelectorAll('dialog[open] [data-reagent-link-url]')].map(i=>i.value.trim()).filter(Boolean);if(reagent.links.length>12)throw Error('구매 링크는 최대 12개까지 입력해주세요.');for(const value of reagent.links){let u;try{u=new URL(value);}catch{throw Error('구매 링크는 https:// 주소로 입력해주세요.');}if(u.protocol!=='https:'||u.username||u.password)throw Error('구매 링크는 인증정보 없는 HTTPS 주소만 사용할 수 있습니다.');}reagent.links=[...new Set(reagent.links)];
  next.reagents=next.reagents||[];if(id){const index=next.reagents.findIndex(r=>r.id===id);if(index<0)throw Error('시약이 삭제되었습니다. 새로고침해주세요.');next.reagents[index]=reagent;}else next.reagents.push(reagent);
 },true,id?next=>{next.reagents=(next.reagents||[]).filter(r=>r.id!==id);}:null,{
  removeLabel:'시약 삭제',removeConfirm:`「${record?.name||''}」 시약 항목을 삭제할까요?`,
  onMount:form=>{bindReagentLinksEditor(form);const select=form.elements.location,input=form.elements.newLocation,wrapper=form.querySelector('[data-custom-location]');select.onchange=()=>{const custom=select.value==='__custom__';wrapper.hidden=!custom;wrapper.style.display=custom?'grid':'';input.disabled=!custom;input.required=custom;if(custom)input.focus();};}
 });
}
async function uploadReagents(e){
 if(!canEditResearch()||busy)return;const input=e.target,file=input.files[0];if(!file)return;busy=true;input.disabled=true;$('reagentStatus').textContent='시약 목록을 읽고 있습니다…';
 try{const rows=ReagentData.parse(await LabData.readXlsx(file));if((data.reagents||[]).length&&!confirm(`기존 시약 ${(data.reagents||[]).length}개를 선택한 파일의 ${rows.length}개 항목으로 교체할까요? 기존 수정·삭제 내역도 교체됩니다.`)){$('reagentStatus').textContent='가져오기를 취소했습니다.';return;}
  const next=structuredClone(data);next.reagents=rows;next.sources=next.sources.filter(s=>s.type!=='reagents');next.sources.push({type:'reagents',name:'시약 목록',importedAt:new Date().toISOString()});if(!offline)await put('/api/data',{data:next});data=next;render();$('reagentStatus').textContent=`시약 ${rows.length}개 항목을 저장했습니다.`;
 }catch(e){$('reagentStatus').textContent=e.message;}finally{busy=false;input.disabled=false;input.value='';}
}

function reagentLinkLabel(url,index){try{const u=new URL(url);if(u.hostname==='4science.net'||u.hostname==='www.4science.net')return '4science '+(index+1);if(u.hostname==='sigmaaldrich.com'||u.hostname==='www.sigmaaldrich.com')return 'Sigma-Aldrich '+(index+1);return u.hostname==='www.google.com'&&u.pathname==='/search'?(u.searchParams.get('q')?.startsWith('site:')?'공식몰 검색':'구매 검색'):'구매처 '+(index+1);}catch{return '링크';}}
function reagentNameLinks(r){return `<span>${esc(r.name||'—')}</span> <span class="reagent-purchase-links">${(r.links||[]).map((url,i)=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return '';return `<a class="reagent-purchase-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" title="${esc(r.name+' · '+(r.note||'')+' · '+url)}">${esc(reagentLinkLabel(url,i))} ↗</a>`;}catch{return '';}}).join('')}</span>`;}
function reagentLinkRow(url=''){return `<div class="reagent-link-row"><input data-reagent-link-url type="url" aria-label="구매 링크 주소" placeholder="https://…" maxlength="2000" value="${esc(url)}"><button type="button" class="secondary" data-remove-reagent-link aria-label="이 구매 링크 삭제">삭제</button></div>`;}
function reagentLinksEditor(links){return `<section class="reagent-links-editor"><strong>구매 링크</strong><p class="muted">여러 주소를 추가하고, 확인 후 맞는 링크만 남겨주세요. 삭제 후 저장하면 다시 추가되지 않습니다.</p><div data-reagent-link-rows>${links.map(reagentLinkRow).join('')}</div><button type="button" class="secondary" data-add-reagent-link>＋ 링크 추가</button></section>`;}
function bindReagentLinksEditor(form){const rows=form.querySelector('[data-reagent-link-rows]');rows.onclick=e=>{const button=e.target.closest('[data-remove-reagent-link]');if(button)button.closest('.reagent-link-row').remove();};form.querySelector('[data-add-reagent-link]').onclick=()=>{if(rows.children.length>=12)return;rows.insertAdjacentHTML('beforeend',reagentLinkRow());rows.lastElementChild.querySelector('input').focus();};}
