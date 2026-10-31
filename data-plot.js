/* Browser-only scientific plotting. No pasted data is sent to the server. */
const DataPlot = (()=>{
 const colors=['#2563eb','#dc2626','#059669','#9333ea','#d97706','#0891b2'];
 const defaults={width:800,height:800,line:2,font:30,legendFont:15,formatVersion:2,marker:6,type:'line',xLabel:'X',yLabel:'Y',title:'',xmin:'',xmax:'',ymin:'',ymax:'',grid:false,series:[]};
 const xml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function parse(text){
  if(text.length>1000000)throw Error('데이터는 1 MB 이하로 입력해 주세요.');
  const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)throw Error('X열과 Y열을 포함해 두 행 이상 입력해 주세요.');
  const delimiter=lines[0].includes('\t')?'\t':',';
  const rows=lines.map(l=>l.split(delimiter).map(v=>v.trim().replace(/^"|"$/g,'')));
  const num=v=>v!==''&&Number.isFinite(Number(v.replaceAll(',','')));
  const header=!rows[0].every(num);const names=header?rows.shift():rows[0].map((_,i)=>i?'Y'+i:'X');
  if(names.length<2||names.length>13)throw Error('첫 열 X + Y 데이터 1~12열을 입력해 주세요.');
  if(rows.length>10000)throw Error('최대 10,000행까지 그릴 수 있습니다.');
  const data=rows.map((row,i)=>{if(row.length!==names.length||!num(row[0])||row.slice(1).some(v=>v!==''&&!num(v)))throw Error(`${i+1+(header?1:0)}행의 열 수 또는 숫자를 확인해 주세요.`);return row.map(v=>v===''?null:Number(v.replaceAll(',','')));});
  if(!data.some(r=>r.slice(1).some(v=>v!==null)))throw Error('Y 데이터가 없습니다.');
  return {names,data};
 }
 function normalize(raw={}){const s={...defaults,...raw,series:Array.isArray(raw.series)?raw.series.map(v=>({...v})):[]};for(const [k,min,max] of [['width',400,2400],['height',300,1800],['line',0.5,12],['font',8,72],['legendFont',8,48],['marker',2,20]]){s[k]=Number(s[k]);if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)throw Error(`${k}: ${min}~${max} 범위로 설정해 주세요.`);}if(!['line','scatter','bar'].includes(s.type))s.type='line';return s;}
 function svg(parsed,raw){
  const s=normalize(raw),{data,names}=parsed,F=s.font,LF=s.legendFont,pw=s.width,ph=s.height;
  const fmt=v=>Number(v.toPrecision(4)).toString(),textWidth=(v,size)=>Array.from(String(v)).reduce((n,c)=>n+(c.charCodeAt(0)>255?1:.65)*size,0);
  const xs=data.map(r=>r[0]),ys=data.flatMap(r=>r.slice(1).filter(v=>v!==null));
  function range(vals,lo,hi,zero=false){let a=vals.reduce((a,v)=>Math.min(a,v),Infinity),b=vals.reduce((a,v)=>Math.max(a,v),-Infinity);if(zero){a=Math.min(0,a);b=Math.max(0,b);}if(a===b){a-=Math.abs(a)*.1||1;b+=Math.abs(b)*.1||1;}else{const pad=(b-a)*.05;a-=pad;b+=pad;}a=lo===''?a:Number(lo);b=hi===''?b:Number(hi);if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b)throw Error('축 최솟값은 최댓값보다 작아야 합니다.');return [a,b];}
  const [xa,xb]=range(xs,s.xmin,s.xmax),[ya,yb]=range(ys,s.ymin,s.ymax,s.type==='bar');
  const xTicks=Array.from({length:6},(_,i)=>fmt(xa+(xb-xa)*i/5)),yTicks=Array.from({length:6},(_,i)=>fmt(ya+(yb-ya)*i/5));
  const titleOver=Math.max(0,(textWidth(s.title,F)-pw)/2),xOver=Math.max(0,(textWidth(s.xLabel,F)-pw)/2),yOver=Math.max(0,(textWidth(s.yLabel,F)-ph)/2);
  const L=Math.ceil(Math.max(F*2+Math.max(...yTicks.map(t=>textWidth(t,F)))+24,textWidth(xTicks[0],F)/2+12,titleOver+12,xOver+12)),R=Math.ceil(Math.max(24,textWidth(xTicks[5],F)/2+12,titleOver+12,xOver+12)),T=Math.ceil(Math.max(s.title?F*2+20:F+20,yOver+20)),B=Math.ceil(Math.max(F*3.5+24,yOver+20)),W=L+pw+R,H=T+ph+B;
  const x=v=>L+(v-xa)/(xb-xa)*pw,y=v=>T+ph-(v-ya)/(yb-ya)*ph;
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xml(s.title||'데이터 그래프')}"><rect width="100%" height="100%" fill="white"/><defs><clipPath id="plot-clip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath></defs><g font-family="Arial,sans-serif" font-size="${F}" fill="#111">`;
  const line=(x1,y1,x2,y2,c='#111',w=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`;
  const text=(xx,yy,v,anchor='middle')=>`<text x="${xx}" y="${yy}" text-anchor="${anchor}">${xml(v)}</text>`;
  let ticks='';
  for(let i=0;i<=25;i++){
   const major=i%5===0,len=major?7:4,xx=L+pw*i/25,yy=T+ph-ph*i/25;
   if(major&&s.grid)out+=line(xx,T,xx,T+ph,'#e5e7eb')+line(L,yy,L+pw,yy,'#e5e7eb');
   ticks+=`<g class="plot-${major?'major':'minor'}-ticks">`+line(xx,T+ph,xx,T+ph-len)+line(xx,T,xx,T+len)+line(L,yy,L+len,yy)+line(L+pw,yy,L+pw-len,yy)+'</g>';
   if(major)out+=text(xx,T+ph+F+10,fmt(xa+(xb-xa)*i/25))+text(L-12,yy+F*.35,fmt(ya+(yb-ya)*i/25),'end');
  }
  const frame=`<rect class="plot-axis-frame" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="#111" stroke-width="1"/>`;
  out+=text(L+pw/2,T-F,s.title)+text(L+pw/2,T+ph+F*2.7+12,s.xLabel)+`<text transform="translate(${F*1.2},${T+ph/2}) rotate(-90)" text-anchor="middle">${xml(s.yLabel)}</text>`;
  const marks=(xx,yy,c,shape)=>{let r=s.marker/2;const attr=`fill="${c}" stroke="${c}" stroke-width="1.5"`;if(shape==='none')return '';if(shape==='square')return `<rect x="${xx-r}" y="${yy-r}" width="${r*2}" height="${r*2}" ${attr}/>`;if(shape==='triangle')return `<path d="M${xx},${yy-r} L${xx+r},${yy+r} L${xx-r},${yy+r} Z" ${attr}/>`;if(shape==='diamond')return `<path d="M${xx},${yy-r} L${xx+r},${yy} L${xx},${yy+r} L${xx-r},${yy} Z" ${attr}/>`;if(shape==='cross')return line(xx-r,yy-r,xx+r,yy+r,c,1.5)+line(xx-r,yy+r,xx+r,yy-r,c,1.5);return `<circle cx="${xx}" cy="${yy}" r="${r}" ${attr}/>`;};
  names.slice(1).forEach((name,j)=>{const cfg=s.series[j]||{},c=/^#[0-9a-f]{6}$/i.test(cfg.color)?cfg.color:colors[j%colors.length],shape=cfg.shape||'circle';out+='<g clip-path="url(#plot-clip)">';let path='',connected=false;
   data.forEach(row=>{const v=row[j+1];if(v===null){connected=false;return;}const xx=x(row[0]),yy=y(v);path+=`${connected?'L':'M'}${xx},${yy} `;connected=true;
    if(s.type==='bar'){const bw=Math.min(40,pw/Math.max(data.length,1)*.65)/(names.length-1),base=y(0);out+=`<rect x="${xx+(j-(names.length-2)/2)*bw-bw/2}" y="${Math.min(yy,base)}" width="${bw}" height="${Math.abs(base-yy)}" fill="${c}"/>`;}
    else out+=marks(xx,yy,c,shape);
   });if(s.type==='line')out+=`<path d="${path}" fill="none" stroke="${c}" stroke-width="${s.line}" stroke-linejoin="round"/>`;out+='</g>';
  });
  out+=frame+ticks;
  const legendWidth=Math.min(pw-32,Math.max(...names.slice(1).map(n=>textWidth(n,LF)))+48);
  out+=`<g class="plot-legend-text" font-size="${LF}">`;
  names.slice(1).forEach((name,j)=>{const cfg=s.series[j]||{},c=/^#[0-9a-f]{6}$/i.test(cfg.color)?cfg.color:colors[j%colors.length],xx=L+pw-legendWidth-16,yy=T+LF+12+j*(LF+8);out+=line(xx,yy-LF*.3,xx+20,yy-LF*.3,c,s.line)+marks(xx+10,yy-LF*.3,c,cfg.shape||'circle')+text(xx+28,yy,name,'start');});out+='</g>';out+='</g></svg>';return out;
 }
 return {parse,normalize,svg,defaults,colors,xml};
})();
const PlotSheet = (()=>{
 function clipboard(text){
  if(text.length>1000000)throw Error('붙여넣기는 1 MB 이하로 입력해 주세요.');
  const sep=text.includes('\t')?'\t':',',rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=c;}else if(!quoted&&(c===sep||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!==sep){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}else cell+=c;}
  if(quoted)throw Error('붙여넣은 데이터의 따옴표를 확인해 주세요.');row.push(cell);rows.push(row);while(rows.length&&rows.at(-1).every(v=>!v.trim()))rows.pop();if(!rows.length)throw Error('붙여넣을 데이터가 없습니다.');return rows;
 }
 function apply(sheet,text,startRow,startCol,header=false){
  const incoming=clipboard(text),width=Math.max(...incoming.map(r=>r.length));
  const titles=header?incoming.shift():null;
  if(startCol+width>13||startRow+incoming.length>10000)throw Error('X 1열과 Y 최대 12열, 최대 10,000행까지 입력할 수 있습니다.');
  const names=sheet.names.slice(),cells=sheet.cells.map(r=>r.slice());
  while(names.length<startCol+width)names.push('Y'+names.length);
  for(const row of cells)while(row.length<names.length)row.push('');
  while(cells.length<startRow+incoming.length)cells.push(Array(names.length).fill(''));
  if(titles)titles.forEach((v,c)=>names[startCol+c]=v.trim()||(startCol+c?'Y'+(startCol+c):'X'));
  incoming.forEach((row,r)=>{for(let c=0;c<width;c++)cells[startRow+r][startCol+c]=row[c]?.trim()||'';});
  return {names,cells};
 }
 function parsed(sheet){
  const data=[];for(let i=0;i<sheet.cells.length;i++){const row=sheet.cells[i].map(v=>v.trim());if(row.every(v=>!v))continue;
   const nums=row.map((v,c)=>{if(!v){if(c===0)throw Error(`${i+1}행의 X값을 입력해 주세요.`);return null;}const n=Number(v.replaceAll(',',''));if(!Number.isFinite(n))throw Error(`${i+1}행 ${c?'Y'+c:'X'}의 숫자를 확인해 주세요.`);return n;});data.push(nums);
  }
  if(!data.length||!data.some(r=>r.slice(1).some(v=>v!==null)))throw Error('X값과 Y값을 입력해 주세요.');
  return {names:sheet.names.map((v,c)=>v.trim()||(c?'Y'+c:'X')),data};
 }
 return {clipboard,apply,parsed};
})();
function mountPlotSheet(container,onChange,onError){
 let sheet={names:['X','Y1'],cells:Array.from({length:10},()=>['',''])},page=0,focus={r:0,c:0};const pageSize=50;
 const invalidate=()=>onChange();
 const render=()=>{
  const pages=Math.max(1,Math.ceil(sheet.cells.length/pageSize));page=Math.max(0,Math.min(page,pages-1));
  container.innerHTML=`<div class="plot-sheet-tools"><button type="button" class="secondary" data-sheet-add-col>＋ Y열</button><button type="button" class="secondary" data-sheet-add-row>＋ 10행</button><label><input type="checkbox" data-sheet-header>붙여넣기에 열 제목 포함</label></div><div class="plot-sheet-scroll"><table class="plot-sheet-table" aria-label="X·Y 데이터 입력표"><thead><tr><th scope="col">행</th>${sheet.names.map((n,c)=>`<th scope="col"><div><span class="plot-axis-badge ${c?'axis-y':'axis-x'}">${c?'Y'+c:'X'}</span>${c&&sheet.names.length>2?`<button type="button" data-sheet-remove-col="${c}" aria-label="Y${c}열 삭제">×</button>`:''}</div><input data-sheet-name="${c}" aria-label="${c?'Y'+c:'X'} 열 제목" value="${esc(n)}"></th>`).join('')}<th scope="col"><span class="sr-only">행 삭제</span></th></tr></thead><tbody>${sheet.cells.slice(page*pageSize,(page+1)*pageSize).map((row,ri)=>{const r=page*pageSize+ri;return `<tr><th scope="row">${r+1}</th>${row.map((v,c)=>`<td><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-sheet-row="${r}" data-sheet-col="${c}" aria-label="${r+1}행 ${c?'Y'+c:'X'}" value="${esc(v)}"></td>`).join('')}<td><button type="button" data-sheet-remove-row="${r}" aria-label="${r+1}행 삭제">×</button></td></tr>`;}).join('')}</tbody></table></div><div class="plot-sheet-bottom"><span>${sheet.cells.length}행 · X 1열 + Y ${sheet.names.length-1}열</span>${pages>1?`<button type="button" class="secondary" data-sheet-page="-1" ${page===0?'disabled':''}>이전</button><span>${page+1}/${pages}</span><button type="button" class="secondary" data-sheet-page="1" ${page===pages-1?'disabled':''}>다음</button>`:''}<button type="button" class="secondary" data-sheet-clear>비우기</button></div>`;
 };
 const focusCell=(r,c)=>{r=Math.max(0,Math.min(r,sheet.cells.length-1));c=Math.max(0,Math.min(c,sheet.names.length-1));if(Math.floor(r/pageSize)!==page){page=Math.floor(r/pageSize);render();}const el=container.querySelector(`[data-sheet-row="${r}"][data-sheet-col="${c}"]`);el?.focus();el?.select();focus={r,c};};
 container.onfocusin=e=>{if(e.target.dataset.sheetRow!==undefined)focus={r:Number(e.target.dataset.sheetRow),c:Number(e.target.dataset.sheetCol)};};
 container.oninput=e=>{const el=e.target;if(el.dataset.sheetName!==undefined){sheet.names[Number(el.dataset.sheetName)]=el.value;invalidate();}else if(el.dataset.sheetRow!==undefined){sheet.cells[Number(el.dataset.sheetRow)][Number(el.dataset.sheetCol)]=el.value;invalidate();}};
 container.onpaste=e=>{const el=e.target;if(!el.matches('[data-sheet-row],[data-sheet-name]'))return;e.preventDefault();try{const r=Number(el.dataset.sheetRow??0),c=Number(el.dataset.sheetCol??el.dataset.sheetName);sheet=PlotSheet.apply(sheet,e.clipboardData.getData('text/plain'),r,c,el.dataset.sheetName!==undefined||container.querySelector('[data-sheet-header]').checked);render();focusCell(r,c);invalidate();}catch(error){onError(error.message);}};
 container.onclick=e=>{const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-sheet-add-col')){if(sheet.names.length>=13){onError('Y열은 최대 12개입니다.');return;}sheet.names.push('Y'+sheet.names.length);sheet.cells.forEach(r=>r.push(''));}
  else if(b.hasAttribute('data-sheet-add-row')){if(sheet.cells.length>=10000){onError('최대 10,000행까지 입력할 수 있습니다.');return;}for(let i=0,n=Math.min(10,10000-sheet.cells.length);i<n;i++)sheet.cells.push(Array(sheet.names.length).fill(''));page=Math.floor((sheet.cells.length-1)/pageSize);}
  else if(b.dataset.sheetRemoveCol!==undefined){const c=Number(b.dataset.sheetRemoveCol);if(sheet.cells.some(r=>r[c])&&!confirm('이 Y열의 데이터를 삭제할까요?'))return;sheet.names.splice(c,1);sheet.cells.forEach(r=>r.splice(c,1));}
  else if(b.dataset.sheetRemoveRow!==undefined){sheet.cells.splice(Number(b.dataset.sheetRemoveRow),1);if(!sheet.cells.length)sheet.cells.push(Array(sheet.names.length).fill(''));}
  else if(b.hasAttribute('data-sheet-clear')){if(sheet.cells.some(r=>r.some(Boolean))&&!confirm('입력한 표 데이터를 비울까요?'))return;sheet={names:['X','Y1'],cells:Array.from({length:10},()=>['',''])};page=0;}
  else if(b.dataset.sheetPage!==undefined){page+=Number(b.dataset.sheetPage);render();return;}
  else return;render();invalidate();
 };
 container.onkeydown=e=>{if(e.target.dataset.sheetRow===undefined)return;let {r,c}=focus;if(e.key==='Enter'){e.preventDefault();r+=e.shiftKey?-1:1;if(r===sheet.cells.length&&r<10000){sheet.cells.push(Array(sheet.names.length).fill(''));render();}focusCell(r,c);}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();focusCell(r+(e.key==='ArrowUp'?-1:1),c);}else if(e.key==='Tab'){const next=c+(e.shiftKey?-1:1);if(next>=0&&next<sheet.names.length){e.preventDefault();focusCell(r,next);}else if((e.shiftKey&&r>0)||(!e.shiftKey&&r<sheet.cells.length-1)){e.preventDefault();focusCell(r+(e.shiftKey?-1:1),e.shiftKey?sheet.names.length-1:0);}}};
 render();return {read:()=>PlotSheet.parsed(sheet),example:()=>{sheet={names:['Time (s)','Sample A','Sample B'],cells:[['0','1.2','1.5'],['1','2.4','2.8'],['2','3.1','3.9'],['3','4.8','5.2'],['4','5.3','6.4']]};page=0;render();invalidate();}};
}

function mountDataPlot(){
 if(!admin())return;const root=$('dataPlotRoot'),key='nisml.plot.format.v1:'+String(user.email||user.id||'professor');let settings={...DataPlot.defaults},parsed=null,output='';
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');settings=DataPlot.normalize(saved?.formatVersion===2?saved:saved?{...saved,width:800,height:800,font:30,legendFont:15,formatVersion:2}:{});}catch{}
 const field=(k,label,type='text')=>`<label>${label}<input data-plot="${k}" type="${type}" value="${esc(settings[k])}" ${type==='number'?'step="any"':''}></label>`;
 root.innerHTML=`<div class="plot-intro"><strong>스프레드시트 → 그래프</strong><span>교수님 전용 · 데이터는 서버로 전송하지 않습니다.</span></div><div class="plot-layout"><div class="plot-controls"><strong>그래프 설정</strong><small>너비·높이는 내부 그래프 박스 기준입니다. 글자와 바깥 여백은 내보내기 이미지에 추가됩니다.</small><div class="plot-fields"><label>그래프 종류<select data-plot="type"><option value="line">선 + 기호</option><option value="scatter">산점도</option><option value="bar">막대</option></select></label>${field('title','그래프 제목')}${field('width','박스 너비 (px)','number')}${field('height','박스 높이 (px)','number')}${field('line','선 두께 (px)','number')}${field('marker','기호 크기 (px)','number')}${field('font','축 제목·눈금 크기 (px)','number')}${field('legendFont','범례 크기 (px)','number')}${field('xLabel','X축 제목')}${field('yLabel','Y축 제목')}${field('xmin','X 최소 (빈칸: 자동)','number')}${field('xmax','X 최대 (빈칸: 자동)','number')}${field('ymin','Y 최소 (빈칸: 자동)','number')}${field('ymax','Y 최대 (빈칸: 자동)','number')}<label><span>격자선</span><input data-plot="grid" type="checkbox" ${settings.grid?'checked':''}></label></div><div id="plotSeries" class="plot-series"></div><div class="plot-actions"><button class="secondary" id="plotSave">포맷 저장</button><button class="secondary" id="plotReset">기본 포맷</button></div><small>포맷은 이 브라우저에 저장됩니다. 데이터는 탭을 닫으면 사라집니다.</small></div><div class="plot-result"><div class="plot-actions"><strong>미리보기</strong><button class="secondary" id="plotSvg" disabled>SVG</button><button class="secondary" id="plotPng" disabled>PNG 2×</button><button class="primary" id="plotQti">QtiPlot으로 그리기</button><button class="secondary" id="plotQtiFolder" hidden>QtiPlot 결과 폴더</button></div><p id="plotStatus" role="status"></p><div id="plotPreview" class="plot-preview"><div class="empty">데이터를 붙여 넣고 그래프를 그려 주세요.</div></div><div id="plotLegend" class="plot-legend"></div></div><section class="plot-data-panel" aria-label="데이터 입력"><strong>X · Y 데이터</strong><small>X값과 Y값을 각 열에 입력하세요. 엑셀 범위는 시작 셀을 선택한 뒤 그대로 붙여 넣을 수 있습니다. 열 제목도 함께 복사했다면 아래 옵션을 선택하세요.</small><div id="plotSheet"></div><div class="plot-actions"><button id="plotDraw" class="primary">그래프 그리기</button><button id="plotExample" class="secondary">예시 데이터</button></div></section></div>`;
 root.querySelector('[data-plot="type"]').value=settings.type;
 const status=(msg,error=false)=>{$('plotStatus').textContent=msg;$('plotStatus').style.color=error?'#c43c3c':'';};
 const sheet=mountPlotSheet($('plotSheet'),()=>{parsed=null;output='';$('plotSvg').disabled=$('plotPng').disabled=true;$('plotPreview').innerHTML='<div class="empty">입력한 데이터로 그래프를 다시 그려 주세요.</div>';$('plotLegend').innerHTML='';status('데이터가 변경되었습니다. 그래프 그리기를 눌러 주세요.');},msg=>status(msg,true));
 const qtiBridge=window.webkit?.messageHandlers?.nismlQtiPlot;let qtiBusy=false;
 $('plotQti').onclick=async()=>{if(qtiBusy)return;if(!qtiBridge){status('Mac용 Hub 0.4.22 이상에서 사용할 수 있습니다. 앱의 업데이트 확인을 이용해 주세요.',true);return;}try{read();const input=sheet.read();DataPlot.svg(input,settings);qtiBusy=true;$('plotQti').disabled=true;status('QtiPlot 설치 확인 중…');const ready=await qtiBridge.postMessage({action:'status'});if(ready.bridgeVersion<5)throw Error('박스 크기·글자 포맷 적용을 위해 Mac용 Hub 0.4.24로 업데이트해 주세요.');if(!ready.installed)throw Error('QtiPlot을 응용 프로그램 폴더에 설치해 주세요.');status('QtiPlot에서 그래프를 만드는 중…');const result=await qtiBridge.postMessage({action:'plot',payload:{...input,settings}});$('plotQtiFolder').hidden=false;status(result.message+(result.warnings?.length?' 일부 설정 확인 필요: '+result.warnings.join(' / '):''));}catch(e){status(e.message||String(e),true);}finally{qtiBusy=false;$('plotQti').disabled=false;}};
 $('plotQtiFolder').onclick=async()=>{try{await qtiBridge.postMessage({action:'reveal'});}catch(e){status(e.message||String(e),true);}};
 const read=()=>{root.querySelectorAll('[data-plot]').forEach(el=>settings[el.dataset.plot]=el.type==='checkbox'?el.checked:el.value);settings=DataPlot.normalize(settings);};
 const draw=()=>{try{read();if(!parsed)return;output=DataPlot.svg(parsed,settings);$('plotPreview').innerHTML=output;$('plotSvg').disabled=$('plotPng').disabled=false;status(`${parsed.data.length}행 · ${parsed.names.length-1}개 계열`);$('plotLegend').innerHTML=parsed.names.slice(1).map((n,i)=>`<span><i style="background:${settings.series[i]?.color||DataPlot.colors[i%6]}"></i>${esc(n)}</span>`).join('');}catch(e){output='';$('plotSvg').disabled=$('plotPng').disabled=true;status(e.message,true);}};
 const series=()=>{$('plotSeries').innerHTML=parsed.names.slice(1).map((n,i)=>`<label>${esc(n)}<input aria-label="${esc(n)} 색상" type="color" data-color="${i}" value="${settings.series[i]?.color||DataPlot.colors[i%6]}"><select aria-label="${esc(n)} 기호" data-shape="${i}">${[['circle','원'],['square','사각형'],['triangle','삼각형'],['diamond','마름모'],['cross','십자'],['none','없음']].map(([v,l])=>`<option value="${v}" ${(settings.series[i]?.shape||'circle')===v?'selected':''}>${l}</option>`).join('')}</select></label>`).join('');};
 $('plotDraw').onclick=()=>{try{parsed=sheet.read();series();draw();}catch(e){parsed=null;output='';$('plotSvg').disabled=$('plotPng').disabled=true;$('plotPreview').innerHTML='';status(e.message,true);}};
 root.onchange=e=>{const el=e.target;if(el.dataset.color!==undefined||el.dataset.shape!==undefined){const i=Number(el.dataset.color??el.dataset.shape);settings.series[i]={...settings.series[i],[el.dataset.color!==undefined?'color':'shape']:el.value};}if(el.matches('[data-plot],[data-color],[data-shape]'))draw();};
 $('plotExample').onclick=()=>{sheet.example();$('plotDraw').click();};
 $('plotSave').onclick=()=>{try{read();localStorage.setItem(key,JSON.stringify(settings));status('포맷을 저장했습니다. 다음 데이터에도 동일하게 적용됩니다.');}catch(e){status(e.message,true);}};
 $('plotReset').onclick=()=>{settings=DataPlot.normalize();root.querySelectorAll('[data-plot]').forEach(el=>{if(el.type==='checkbox')el.checked=settings[el.dataset.plot];else el.value=settings[el.dataset.plot];});if(parsed)series();draw();status('기본 포맷으로 되돌렸습니다. 유지하려면 포맷 저장을 눌러 주세요.');};
 const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('이미지 파일을 읽지 못했습니다.'));reader.readAsDataURL(blob);});
 const download=async(blob,name)=>{
  if(window.webkit?.messageHandlers?.nismlWorkspace){
   if(!qtiBridge)throw Error('그래프 저장을 위해 Mac용 Hub 0.4.23로 업데이트해 주세요.');
   const ready=await qtiBridge.postMessage({action:'status'});
   if(ready.bridgeVersion<4)throw Error('그래프 저장을 위해 Mac용 Hub 0.4.23로 업데이트해 주세요.');
   const encoded=await dataURL(blob);const result=await qtiBridge.postMessage({action:'export',name,base64:encoded.split(',')[1]});
   status(result.cancelled?'저장을 취소했습니다.':'그래프 파일을 저장했습니다.');return;
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('파일 다운로드를 요청했습니다. 브라우저의 다운로드 목록을 확인해 주세요.');
 };
 $('plotSvg').onclick=async()=>{if(!output)return;try{await download(new Blob([output],{type:'image/svg+xml;charset=utf-8'}),'graph.svg');}catch(e){status(e.message||String(e),true);}};
 $('plotPng').onclick=async()=>{
  if(!output)return;const snapshot=output;
  try{
   const img=new Image();
   // data: is allowed by the Hub CSP; blob: images are intentionally not allowed.
   const url=await dataURL(new Blob([snapshot],{type:'image/svg+xml;charset=utf-8'}));
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('PNG 변환용 그래프 이미지를 읽지 못했습니다.'));img.src=url;});
   const c=document.createElement('canvas');c.width=img.naturalWidth*2;c.height=img.naturalHeight*2;const ctx=c.getContext('2d');if(!ctx)throw Error('이미지 변환을 시작하지 못했습니다.');ctx.drawImage(img,0,0,c.width,c.height);
   const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG 파일 생성에 실패했습니다.')),'image/png'));
   await download(blob,'graph-2x.png');
  }catch(e){status(e.message||String(e),true);}
 };
}
