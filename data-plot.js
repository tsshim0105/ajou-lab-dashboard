/* Browser-only scientific plotting. No pasted data is sent to the server. */
const DataPlot = (()=>{
 const colors=['#2563eb','#dc2626','#059669','#9333ea','#d97706','#0891b2'];
 const defaults={width:800,height:800,line:2,font:50,legendFont:40,formatVersion:5,legendX:null,legendY:null,marker:6,type:'lineonly',xLabel:'X',yLabel:'Y',title:'',xmin:'',xmax:'',ymin:'',ymax:'',x2Label:'X2',y2Label:'Y2',x2min:'',x2max:'',y2min:'',y2max:'',grid:false,series:[]};
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
 function normalize(raw={}){const s={...defaults,...raw,series:Array.isArray(raw.series)?raw.series.map(v=>({...v})):[]};for(const [k,min,max] of [['width',400,2400],['height',300,1800],['line',0.5,12],['font',8,72],['legendFont',8,48],['marker',2,20]]){s[k]=Number(s[k]);if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)throw Error(`${k}: ${min}~${max} 범위로 설정해 주세요.`);}for(const k of ['legendX','legendY'])s[k]=raw[k]!==null&&raw[k]!==undefined&&raw[k]!==''&&Number.isFinite(Number(raw[k]))?Math.max(0,Math.min(1,Number(raw[k]))):null;if(!['lineonly','line','scatter','bar'].includes(s.type))s.type='lineonly';return s;}
 function seriesColumns(parsed){const x2=parsed.x2Index;return parsed.names.map((name,col)=>({name,col,xcol:Number.isInteger(x2)&&col>x2?x2:0,secondary:Number.isInteger(x2)&&col>x2})).filter(v=>v.col!==0&&v.col!==x2);}
 function svg(parsed,raw,onLayout,interactive=false){
  const s=normalize(raw),{data,names}=parsed,F=s.font,LF=s.legendFont,pw=s.width,ph=s.height;
  const fmt=v=>Number(v.toPrecision(4)).toString(),textWidth=(v,size)=>Array.from(String(v)).reduce((n,c)=>n+(c.charCodeAt(0)>255?1:.65)*size,0);
  const columns=seriesColumns(parsed),dual=Number.isInteger(parsed.x2Index),primary=columns.filter(c=>!c.secondary),secondary=columns.filter(c=>c.secondary);
  const values=cols=>cols.flatMap(c=>data.filter(r=>r[c.xcol]!=null&&r[c.col]!=null).map(r=>[r[c.xcol],r[c.col]]));
  const p1=values(primary),p2=values(secondary),xs=p1.map(v=>v[0]),ys=p1.map(v=>v[1]);
  if(!xs.length||(dual&&!p2.length))throw Error('각 X축에 연결된 Y 데이터를 한 쌍 이상 입력해 주세요.');
  function range(vals,lo,hi,zero=false){let a=vals.reduce((a,v)=>Math.min(a,v),Infinity),b=vals.reduce((a,v)=>Math.max(a,v),-Infinity);if(zero){a=Math.min(0,a);b=Math.max(0,b);}if(a===b){a-=Math.abs(a)*.1||1;b+=Math.abs(b)*.1||1;}else{const pad=(b-a)*.05;a-=pad;b+=pad;}a=lo===''?a:Number(lo);b=hi===''?b:Number(hi);if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b)throw Error('축 최솟값은 최댓값보다 작아야 합니다.');return [a,b];}
  const [xa,xb]=range(xs,s.xmin,s.xmax),[ya,yb]=range(ys,s.ymin,s.ymax,s.type==='bar');
  const [x2a,x2b]=dual?range(p2.map(v=>v[0]),s.x2min,s.x2max):[xa,xb],[y2a,y2b]=dual?range(p2.map(v=>v[1]),s.y2min,s.y2max,s.type==='bar'):[ya,yb];
  const xTicks=Array.from({length:6},(_,i)=>fmt(xa+(xb-xa)*i/5)),yTicks=Array.from({length:6},(_,i)=>fmt(ya+(yb-ya)*i/5));
  const x2Ticks=Array.from({length:6},(_,i)=>fmt(x2a+(x2b-x2a)*i/5)),y2Ticks=Array.from({length:6},(_,i)=>fmt(y2a+(y2b-y2a)*i/5)),rightWidth=Math.max(...y2Ticks.map(t=>textWidth(t,F)));
  const yTickWidth=Math.max(...yTicks.map(t=>textWidth(t,F))),axisTitleGap=Math.max(10,F*.25);
  const titleOver=Math.max(0,(textWidth(s.title,F)-pw)/2),xOver=Math.max(0,(textWidth(s.xLabel,F)-pw)/2),yOver=Math.max(0,(textWidth(s.yLabel,F)-ph)/2);
  const L=Math.ceil(Math.max(F+yTickWidth+axisTitleGap+36,textWidth(xTicks[0],F)/2+12,titleOver+12,xOver+12)),R=Math.ceil(Math.max(dual?F+rightWidth+axisTitleGap+36:24,textWidth(xTicks[5],F)/2+12,titleOver+12,xOver+12,dual?textWidth(x2Ticks[5],F)/2+12:0)),T=Math.ceil(Math.max(dual?F*(s.title?3.8:2.8)+30:s.title?F*2+20:F+20,yOver+20)),B=Math.ceil(Math.max(F*2.5+30,yOver+20)),W=L+pw+R,H=T+ph+B;
  const x2=v=>L+(v-x2a)/(x2b-x2a)*pw,y2=v=>T+ph-(v-y2a)/(y2b-y2a)*ph;
  const x=v=>L+(v-xa)/(xb-xa)*pw,y=v=>T+ph-(v-ya)/(yb-ya)*ph;
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xml(s.title||'데이터 그래프')}"><rect width="100%" height="100%" fill="white"/><defs><clipPath id="plot-clip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath></defs><g font-family="Arial,sans-serif" font-size="${F}" font-weight="700" fill="#111">`;
  const line=(x1,y1,x2,y2,c='#111',w=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`;
  const text=(xx,yy,v,anchor='middle')=>`<text x="${xx}" y="${yy}" text-anchor="${anchor}">${xml(v)}</text>`;
  let ticks='';
  for(let i=0;i<=25;i++){
   const major=i%5===0,len=major?12:7,xx=L+pw*i/25,yy=T+ph-ph*i/25;
   if(major&&s.grid)out+=line(xx,T,xx,T+ph,'#e5e7eb')+line(L,yy,L+pw,yy,'#e5e7eb');
   ticks+=`<g class="plot-${major?'major':'minor'}-ticks">`+line(xx,T+ph,xx,T+ph-len,'#111',4)+line(xx,T,xx,T+len,'#111',4)+line(L,yy,L+len,yy,'#111',4)+line(L+pw,yy,L+pw-len,yy,'#111',4)+'</g>';
   if(major&&dual)out+=text(xx,T-14,fmt(x2a+(x2b-x2a)*i/25))+text(L+pw+12,yy+F*.35,fmt(y2a+(y2b-y2a)*i/25),'start');
   if(major)out+=text(xx,T+ph+F+10,fmt(xa+(xb-xa)*i/25))+text(L-12,yy+F*.35,fmt(ya+(yb-ya)*i/25),'end');
  }
  const frame=`<rect class="plot-axis-frame" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="#111" stroke-width="4"/>`;
  if(dual)out+=`<g class="plot-secondary-axes">`+text(L+pw/2,T-F-28,s.x2Label)+`<text transform="translate(${L+pw+12+rightWidth+axisTitleGap+F*.2},${T+ph/2}) rotate(90)" text-anchor="middle">${xml(s.y2Label)}</text></g>`;
  out+=text(L+pw/2,dual?T-F*2.3-30:T-F,s.title)+text(L+pw/2,T+ph+F*2+18,s.xLabel)+`<text transform="translate(${L-12-yTickWidth-axisTitleGap-F*.2},${T+ph/2}) rotate(-90)" text-anchor="middle">${xml(s.yLabel)}</text>`;
  const marks=(xx,yy,c,shape)=>{let r=s.marker/2;const attr=`fill="${c}" stroke="${c}" stroke-width="1.5"`;if(shape==='none')return '';if(shape==='square')return `<rect x="${xx-r}" y="${yy-r}" width="${r*2}" height="${r*2}" ${attr}/>`;if(shape==='triangle')return `<path d="M${xx},${yy-r} L${xx+r},${yy+r} L${xx-r},${yy+r} Z" ${attr}/>`;if(shape==='diamond')return `<path d="M${xx},${yy-r} L${xx+r},${yy} L${xx},${yy+r} L${xx-r},${yy} Z" ${attr}/>`;if(shape==='cross')return line(xx-r,yy-r,xx+r,yy+r,c,1.5)+line(xx-r,yy+r,xx+r,yy-r,c,1.5);return `<circle cx="${xx}" cy="${yy}" r="${r}" ${attr}/>`;};
  columns.forEach(({name,col,xcol,secondary:isSecondary},j)=>{const cfg=s.series[j]||{},c=/^#[0-9a-f]{6}$/i.test(cfg.color)?cfg.color:colors[j%colors.length],shape=cfg.shape||'circle';out+=`<g class="plot-series-data" data-axis="${isSecondary?'secondary':'primary'}" clip-path="url(#plot-clip)">`;let path='',connected=false;
   data.forEach(row=>{const v=row[col];if(v==null||row[xcol]==null){connected=false;return;}const xx=(isSecondary?x2:x)(row[xcol]),yy=(isSecondary?y2:y)(v);path+=`${connected?'L':'M'}${xx},${yy} `;connected=true;
    if(s.type==='bar'){const bw=Math.min(40,pw/Math.max(data.length,1)*.65)/columns.length,base=(isSecondary?y2:y)(0);out+=`<rect x="${xx+(j-(columns.length-1)/2)*bw-bw/2}" y="${Math.min(yy,base)}" width="${bw}" height="${Math.abs(base-yy)}" fill="${c}"/>`;}
    else if(s.type!=='lineonly')out+=marks(xx,yy,c,shape);
   });if(s.type==='line'||s.type==='lineonly')out+=`<path d="${path}" fill="none" stroke="${c}" stroke-width="${s.line}" stroke-linejoin="round"/>`;out+='</g>';
  });
  out+=frame+ticks;
  const legendWidth=Math.min(W-24,Math.max(...columns.map(c=>textWidth(c.name,LF)))+60),legendHeight=columns.length*(LF+8)+16;
  const maxX=Math.max(0,W-legendWidth-12),maxY=Math.max(0,H-legendHeight-12),legendX=s.legendX===null?Math.max(0,Math.min(maxX,L+pw-legendWidth-8)):s.legendX*maxX,legendY=s.legendY===null?Math.max(0,Math.min(maxY,T+8)):s.legendY*maxY;
  onLayout?.({L,T,W,H,pw,ph,legendX,legendY,legendWidth,legendHeight,xa,xb,ya,yb});
  out+=`<g class="plot-legend-text" font-size="${LF}" font-weight="400" transform="translate(${legendX},${legendY})" data-legend-x="${legendX}" data-legend-y="${legendY}" data-legend-max-x="${maxX}" data-legend-max-y="${maxY}">`;
  if(interactive)out+=`<rect class="plot-legend-hitbox" width="${legendWidth}" height="${legendHeight}" fill="#ffffff" fill-opacity="0" pointer-events="all"/>`;
  columns.forEach(({name},j)=>{const cfg=s.series[j]||{},c=/^#[0-9a-f]{6}$/i.test(cfg.color)?cfg.color:colors[j%colors.length],xx=12,yy=LF+8+j*(LF+8);out+=line(xx,yy-LF*.3,xx+20,yy-LF*.3,c,s.line)+marks(xx+10,yy-LF*.3,c,s.type==='lineonly'?'none':cfg.shape||'circle')+text(xx+28,yy,name,'start');});out+='</g>';out+='</g></svg>';return out;
 }
 function nativeSettings(settings,count){return settings.type==='lineonly'?{...settings,type:'line',series:Array.from({length:count},(_,i)=>({...settings.series[i],shape:'none'}))}:settings;}
 function ratioSize(width,ratio){const ratios={'1:1':[1,1],'4:3':[4,3],'16:9':[16,9],'9:16':[9,16]};if(!ratios[ratio])throw Error('지원하지 않는 박스 비율입니다.');const [w,h]=ratios[ratio],scale=Math.max(Math.ceil(Math.max(400/w,300/h)),Math.min(Math.floor(Math.min(2400/w,1800/h)),Math.round((Number(width)||800)/w)));return {width:scale*w,height:scale*h};}
 return {parse,normalize,svg,defaults,colors,xml,nativeSettings,ratioSize,seriesColumns};
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
  return {names,cells,...(Number.isInteger(sheet.x2Index)?{x2Index:sheet.x2Index}:{})};
 }
 function parsed(sheet){
  const x2=sheet.x2Index,dual=Number.isInteger(x2),data=[];
  if(dual&&(x2<2||x2>=sheet.names.length-1))throw Error('두 번째 X열 뒤에 Y열이 필요합니다.');
  for(let i=0;i<sheet.cells.length;i++){
   const row=sheet.cells[i].map(v=>String(v??'').trim());if(row.every(v=>!v))continue;
   const nums=row.map((v,c)=>{if(!v)return null;const n=Number(v.replaceAll(',',''));if(!Number.isFinite(n))throw Error(`${i+1}행 ${sheet.names[c]}의 숫자를 확인해 주세요.`);return n;});
   for(const [xc,end] of dual?[[0,x2],[x2,row.length]]:[[0,row.length]])if(nums.slice(xc+1,end).some(v=>v!==null)&&nums[xc]===null)throw Error(`${i+1}행의 ${xc?'X2':'X'}값을 입력해 주세요.`);
   data.push(nums);
  }
  if(!data.length||!data.some(r=>r.slice(1,dual?x2:undefined).some(v=>v!==null)))throw Error('X값과 Y값을 입력해 주세요.');
  if(dual&&!data.some(r=>r.slice(x2+1).some(v=>v!==null)))throw Error('X2에 연결된 Y값을 입력해 주세요.');
  return {names:sheet.names.map((v,c)=>v.trim()||(c?'Y'+c:'X')),data,...(dual?{x2Index:x2}:{})};
 }
 return {clipboard,apply,parsed};
})();
function mountPlotSheet(container,onChange,onError){
 let rangeSelection;const history=[];let sheet={names:['X','Y1'],cells:Array.from({length:10},()=>['',''])},page=0,focus={r:0,c:0};const pageSize=100;
 const invalidate=()=>onChange(sheet.x2Index);
 const remember=(value=sheet)=>{history.push(structuredClone(value));if(history.length>30)history.shift();tools.querySelector('[data-sheet-undo]').disabled=false;};
 const tools=document.createElement('div');tools.className='plot-sheet-tools';tools.innerHTML='<button type="button" class="secondary" data-sheet-add-col>＋ Y열</button><button type="button" class="secondary" data-sheet-add-x>＋ X열</button><label><input type="checkbox" data-sheet-header>붙여넣기에 열 제목 포함</label><div class="plot-sheet-draw-actions"><button id="plotExample" class="secondary">예시 데이터</button><button type="button" class="secondary" data-sheet-undo disabled>↶ 되돌리기</button><button id="plotDraw" class="primary">그래프 그리기</button></div>';container.before(tools);
 const axis=c=>c===0?'X1':c===sheet.x2Index?'X2':Number.isInteger(sheet.x2Index)&&c>sheet.x2Index?'Y2·'+(c-sheet.x2Index):'Y1·'+c;
 const render=()=>{
  const start=Math.max(0,Math.min(page,Math.max(0,sheet.cells.length-pageSize))),end=Math.min(sheet.cells.length,start+pageSize);
  tools.querySelector('[data-sheet-add-x]').disabled=Number.isInteger(sheet.x2Index);tools.querySelector('[data-sheet-undo]').disabled=!history.length;
  container.innerHTML=`<div class="plot-sheet-scroll"><table class="plot-sheet-table" aria-label="X·Y 데이터 입력표"><thead><tr><th scope="col">행</th>${sheet.names.map((n,c)=>`<th scope="col"><div><span class="plot-axis-badge ${c===0||c===sheet.x2Index?'axis-x':'axis-y'}">${axis(c)}</span>${c&&sheet.names.length>2?`<button type="button" data-sheet-remove-col="${c}" aria-label="${axis(c)}열 삭제">×</button>`:''}</div><input data-sheet-name="${c}" aria-label="${axis(c)} 열 제목" value="${esc(n)}"></th>`).join('')}<th scope="col"><span class="sr-only">행 삭제</span></th></tr></thead><tbody>${start?`<tr aria-hidden="true" class="plot-sheet-spacer"><td colspan="${sheet.names.length+2}" style="height:${start*33}px"></td></tr>`:''}${sheet.cells.slice(start,end).map((row,ri)=>{const r=start+ri;return `<tr><th scope="row">${r+1}</th>${row.map((v,c)=>`<td><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-sheet-row="${r}" data-sheet-col="${c}" aria-label="${r+1}행 ${axis(c)}" value="${esc(v)}"></td>`).join('')}<td><button type="button" data-sheet-remove-row="${r}" aria-label="${r+1}행 삭제">×</button></td></tr>`;}).join('')}${end<sheet.cells.length?`<tr aria-hidden="true" class="plot-sheet-spacer"><td colspan="${sheet.names.length+2}" style="height:${(sheet.cells.length-end)*33}px"></td></tr>`:''}</tbody></table></div><div class="plot-sheet-bottom"><span>${sheet.cells.length}행 · X ${Number.isInteger(sheet.x2Index)?2:1}열 + Y ${sheet.names.length-(Number.isInteger(sheet.x2Index)?2:1)}열</span><span>스크롤하여 전체 데이터 보기</span><button type="button" class="secondary" data-sheet-clear>비우기</button></div>`;rangeSelection?.refresh();
 };
 container.addEventListener('scroll',e=>{const el=e.target;if(!el.classList?.contains('plot-sheet-scroll')||sheet.cells.length<=pageSize)return;const first=Math.max(0,Math.floor((el.scrollTop-70)/33));if(first>=page+15&&first<page+pageSize-35)return;const next=Math.max(0,Math.min(first-15,sheet.cells.length-pageSize));if(next===page)return;const top=el.scrollTop,left=el.scrollLeft;page=next;render();const updated=container.querySelector('.plot-sheet-scroll');updated.scrollTop=top;updated.scrollLeft=left;},true);
 const focusCell=(r,c)=>{r=Math.max(0,Math.min(r,sheet.cells.length-1));c=Math.max(0,Math.min(c,sheet.names.length-1));if(r<page||r>=page+pageSize){page=Math.max(0,r-20);render();container.querySelector('.plot-sheet-scroll').scrollTop=Math.max(0,r*33-60);}const el=container.querySelector(`[data-sheet-row="${r}"][data-sheet-col="${c}"]`);el?.focus();el?.select();focus={r,c};};
 container.onfocusin=e=>{if(e.target.dataset.sheetRow!==undefined)focus={r:Number(e.target.dataset.sheetRow),c:Number(e.target.dataset.sheetCol)};};
 container.oninput=e=>{const el=e.target;if(el.dataset.sheetName!==undefined){remember();sheet.names[Number(el.dataset.sheetName)]=el.value;invalidate();}else if(el.dataset.sheetRow!==undefined){remember();sheet.cells[Number(el.dataset.sheetRow)][Number(el.dataset.sheetCol)]=el.value;invalidate();}};
 container.onpaste=e=>{const el=e.target;if(!el.matches('[data-sheet-row],[data-sheet-name]'))return;e.preventDefault();try{const selected=el.dataset.sheetRow!==undefined?rangeSelection.start():null,r=selected?.r??Number(el.dataset.sheetRow??0),c=selected?.c??Number(el.dataset.sheetCol??el.dataset.sheetName);const next=PlotSheet.apply(sheet,e.clipboardData.getData('text/plain'),r,c,el.dataset.sheetName!==undefined||tools.querySelector('[data-sheet-header]').checked);remember();sheet=next;render();focusCell(r,c);invalidate();}catch(error){onError(error.message);}};
 const undo=()=>{if(!history.length)return;sheet=history.pop();rangeSelection.reset();page=0;render();invalidate();};
 const handleClick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-sheet-undo')){undo();return;}const previous=structuredClone(sheet);
  if(b.hasAttribute('data-sheet-add-col')){if(sheet.names.length>=13){onError('Y열은 최대 12개입니다.');return;}sheet.names.push('Y'+sheet.names.length);sheet.cells.forEach(r=>r.push(''));}
  else if(b.hasAttribute('data-sheet-add-x')){if(Number.isInteger(sheet.x2Index))return;if(sheet.names.length>11){onError('X2와 Y2를 추가할 공간이 필요합니다. 열 수를 줄여 주세요.');return;}sheet.x2Index=sheet.names.length;sheet.names.push('X2','Y2');sheet.cells.forEach(r=>r.push('',''));}
  else if(b.dataset.sheetRemoveCol!==undefined){const c=Number(b.dataset.sheetRemoveCol);if(c===sheet.x2Index){if(!confirm('X2와 연결된 Y열을 모두 삭제할까요?'))return;sheet.names.splice(c);sheet.cells.forEach(r=>r.splice(c));delete sheet.x2Index;}else{if(c===1&&(sheet.x2Index===2||sheet.names.length===2)||Number.isInteger(sheet.x2Index)&&c>sheet.x2Index&&sheet.names.length===sheet.x2Index+2){onError('각 X축에는 Y열이 하나 이상 필요합니다.');return;}if(sheet.cells.some(r=>r[c])&&!confirm('이 Y열의 데이터를 삭제할까요?'))return;sheet.names.splice(c,1);sheet.cells.forEach(r=>r.splice(c,1));if(c<sheet.x2Index)sheet.x2Index--;}}
  else if(b.dataset.sheetRemoveRow!==undefined){sheet.cells.splice(Number(b.dataset.sheetRemoveRow),1);if(!sheet.cells.length)sheet.cells.push(Array(sheet.names.length).fill(''));}
  else if(b.hasAttribute('data-sheet-clear')){if(sheet.cells.some(r=>r.some(Boolean))&&!confirm('입력한 표 데이터를 비울까요?'))return;sheet={names:['X','Y1'],cells:Array.from({length:10},()=>['',''])};page=0;}
  else return;remember(previous);rangeSelection.reset();render();invalidate();
 };
 container.onclick=tools.onclick=handleClick;
 container.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();undo();}},true);
 container.onkeydown=e=>{if(e.target.dataset.sheetRow===undefined)return;let {r,c}=focus;if(e.key==='Enter'){e.preventDefault();r+=e.shiftKey?-1:1;if(r===sheet.cells.length&&r<10000){remember();sheet.cells.push(Array(sheet.names.length).fill(''));render();}focusCell(r,c);}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();focusCell(r+(e.key==='ArrowUp'?-1:1),c);}else if(e.key==='Tab'){const next=c+(e.shiftKey?-1:1);if(next>=0&&next<sheet.names.length){e.preventDefault();focusCell(r,next);}else if((e.shiftKey&&r>0)||(!e.shiftKey&&r<sheet.cells.length-1)){e.preventDefault();focusCell(r+(e.shiftKey?-1:1),e.shiftKey?sheet.names.length-1:0);}}};
 rangeSelection=mountSheetRange(container,{selector:'[data-sheet-row]',coords:el=>({r:+el.dataset.sheetRow,c:+el.dataset.sheetCol}),rows:()=>sheet.cells,clear:b=>{remember();for(let r=b.r0;r<=b.r1;r++)for(let c=b.c0;c<=b.c1;c++)if(sheet.cells[r])sheet.cells[r][c]='';render();invalidate();},scrollSelector:'.plot-sheet-scroll'});
 render();return {read:()=>PlotSheet.parsed(sheet),load:value=>{history.length=0;rangeSelection.reset();sheet={...(Number.isInteger(value.x2Index)?{x2Index:value.x2Index}:{}),names:value.names.slice(),cells:value.data.map(row=>row.map(v=>v===null?'':String(v)))};page=0;render();invalidate();},example:()=>{remember();rangeSelection.reset();sheet=Number.isInteger(sheet.x2Index)?{names:['Time (s)','Signal','Temperature (°C)','Response'],x2Index:2,cells:[['0','1','20','100'],['1','3','40','150'],['2','2','60','250'],['3','5','80','300']]}:{names:['Time (s)','Sample A','Sample B'],cells:[['0','1.2','1.5'],['1','2.4','2.8'],['2','3.1','3.9'],['3','4.8','5.2'],['4','5.3','6.4']]};page=0;render();invalidate();}};
}

const PlotLibrary = (()=>{
 let connection;
 const db=()=>connection||(connection=new Promise((resolve,reject)=>{const request=indexedDB.open('nisml-graphs',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('graphs',{keyPath:'key'});store.createIndex('owner','owner');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{connection=null;reject(Error('그래프 보관함을 열지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'));};}));
 async function run(owner,mode,action){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('graphs',mode),store=tx.objectStore('graphs');let result;const request=action(store);request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('그래프 저장에 실패했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.'));});}
 return {remove:(owner,id)=>run(owner,'readwrite',store=>store.delete(owner+':'+id)),list:owner=>run(owner,'readonly',store=>store.index('owner').getAll(owner)),put:(owner,graph)=>run(owner,'readwrite',store=>store.put({...graph,owner,key:owner+':'+graph.id}))};
})();

function mountDataPlot(){
 if(!admin())return;const root=$('dataPlotRoot'),key='nisml.plot.format.v1:'+String(user.email||user.id||'professor');let settings={...DataPlot.defaults},parsed=null,output='',activeGraph=null,library=[],saving=false;const owner=String(user.email||user.id||'professor');
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');settings=DataPlot.normalize(saved?.formatVersion===5?saved:saved?{...saved,type:saved.formatVersion===4?saved.type:'lineonly',legendFont:40,formatVersion:5}:{});}catch{}
 const field=(k,label,type='text')=>`<label><span>${label}</span><input data-plot="${k}" type="${type}" value="${esc(settings[k])}" ${type==='number'?'step="any"':''}></label>`;
 root.innerHTML=`<div class="plot-heading"><h1>데이터 생성</h1><div class="plot-view-tabs" role="tablist" aria-label="데이터 생성 보기"><button type="button" role="tab" class="primary" id="plotEditorTab" aria-selected="true" aria-controls="plotEditor">그래프 그리기</button><button type="button" role="tab" class="primary" id="tableEditorTab" aria-selected="false" aria-controls="tableEditor">테이블 만들기</button><button type="button" role="tab" class="primary" id="plotLibraryTab" aria-selected="false" aria-controls="plotLibraryPanel">내 그래프 <span id="plotLibraryCount">0</span></button><button type="button" role="tab" class="primary" id="tableLibraryTab" aria-selected="false" aria-controls="tableLibraryPanel">내 테이블 <span id="tableLibraryCount">0</span></button></div></div><section id="plotEditor" role="tabpanel" aria-labelledby="plotEditorTab"><div class="plot-layout"><div class="plot-controls"><div class="plot-settings-heading"><strong>그래프 설정</strong><div class="plot-actions"><button class="secondary" id="plotReset">기본 포맷</button><div class="plot-ratio-presets" role="group" aria-label="그래프 박스 비율">${['1:1','4:3','16:9','9:16'].map(r=>`<button type="button" class="secondary" data-plot-ratio="${r}" aria-pressed="false">${r}</button>`).join('')}</div><button class="secondary" id="plotSave">포맷 저장</button></div></div><small>너비·높이는 내부 그래프 박스 기준입니다. 글자와 바깥 여백은 내보내기 이미지에 추가됩니다.</small><div class="plot-fields"><label><span>그래프 종류</span><select data-plot="type"><option value="lineonly">선</option><option value="line">선 + 기호</option><option value="scatter">분산</option><option value="bar">막대</option></select></label>${field('title','그래프 제목')}${field('width','박스 너비 (px)','number')}${field('height','박스 높이 (px)','number')}${field('line','선 두께 (px)','number')}${field('marker','기호 크기 (px)','number')}${field('font','축 제목·눈금 크기 (px)','number')}${field('legendFont','범례 크기 (px)','number')}${field('xLabel','X축 제목')}${field('yLabel','Y축 제목')}${field('xmin','X 최소 (빈칸: 자동)','number')}${field('xmax','X 최대 (빈칸: 자동)','number')}${field('ymin','Y 최소 (빈칸: 자동)','number')}${field('ymax','Y 최대 (빈칸: 자동)','number')}<div class="plot-secondary-settings" hidden>${field('x2Label','위 X축 제목')}${field('y2Label','오른쪽 Y축 제목')}${field('x2min','위 X 최소','number')}${field('x2max','위 X 최대','number')}${field('y2min','오른쪽 Y 최소','number')}${field('y2max','오른쪽 Y 최대','number')}</div><label><span>격자선</span><input data-plot="grid" type="checkbox" ${settings.grid?'checked':''}></label></div><div id="plotSeries" class="plot-series"></div><small>그래프 그리기를 누르면 데이터와 포맷이 이 기기의 내 그래프에 저장됩니다.</small></div><div class="plot-result"><div class="plot-actions"><strong>미리보기</strong><button class="secondary" id="plotSvg" disabled>SVG</button><button class="secondary" id="plotPng" disabled>PNG</button><button class="primary" id="plotQti">QTI</button></div><p id="plotStatus" role="status"></p><small class="plot-legend-help">범례를 드래그해 위치를 옮길 수 있습니다.</small><div id="plotPreview" class="plot-preview"><div class="empty">데이터를 붙여 넣고 그래프를 그려 주세요.</div></div><div id="plotLegend" class="plot-legend"></div></div><section class="plot-data-panel" aria-label="데이터 입력"><strong>X · Y 데이터</strong><small>X1 뒤의 Y열은 아래·왼쪽 축, X2 뒤의 Y열은 위·오른쪽 축으로 그립니다. 엑셀 범위는 시작 셀을 선택한 뒤 그대로 붙여 넣을 수 있습니다. 열 제목도 함께 복사했다면 아래 옵션을 선택하세요.</small><div id="plotSheet"></div></section></div></section><section id="tableEditor" role="tabpanel" aria-labelledby="tableEditorTab" hidden></section><section id="tableLibraryPanel" role="tabpanel" aria-labelledby="tableLibraryTab" hidden><div class="plot-library-toolbar"><p>이 기기에 저장된 테이블 · 이름을 수정하거나 다시 열어 편집할 수 있습니다.</p><button class="primary" id="tableNew">＋ 새 테이블</button></div><p id="tableLibraryStatus" role="status"></p><div id="tableLibraryList"></div></section><section id="plotLibraryPanel" role="tabpanel" aria-labelledby="plotLibraryTab" hidden><div class="plot-library-toolbar"><p>이 기기에 저장된 그래프 · 이름을 수정하거나 다시 열어 편집할 수 있습니다.</p><button type="button" id="plotNew" class="primary">＋ 새 그래프</button></div><p id="plotLibraryStatus" role="status"></p><div id="plotLibraryList"></div></section>`;
 root.querySelector('[data-plot="type"]').value=settings.type;
 const status=(msg,error=false)=>{$('plotStatus').textContent=msg;$('plotStatus').style.color=error?'#c43c3c':'';};
 let tableMounted=false,tableEditor,tableRecords=[];
 const showView=view=>{for(const [v,p,t] of [['editor','plotEditor','plotEditorTab'],['table','tableEditor','tableEditorTab'],['library','plotLibraryPanel','plotLibraryTab'],['tables','tableLibraryPanel','tableLibraryTab']]){$(p).hidden=view!==v;$(t).setAttribute('aria-selected',String(view===v));}if(view==='table'&&!tableMounted){tableEditor=mountDataTable($('tableEditor'),owner,loadTables);tableMounted=true;}};
 $('tableEditorTab').onclick=()=>showView('table');
 const loadTables=async()=>{try{tableRecords=await TableLibrary.list(owner);$('tableLibraryCount').textContent=tableRecords.length;$('tableLibraryList').innerHTML=tableRecords.length?tableRecords.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(t=>`<article class="table-library-row"><div class="table-library-thumb">${DataTable.svg(t.model)}</div><div class="table-library-info"><label>테이블 이름<input maxlength="120" data-table-name="${esc(t.id)}" value="${esc(t.name)}"></label><small>${t.model.rows.length-t.model.settings.headerRows}행 · ${t.model.rows[0].length}열 · ${new Date(t.updatedAt).toLocaleString('ko-KR')}</small></div><button class="secondary" data-table-rename="${esc(t.id)}">이름 저장</button><button class="secondary" data-table-open="${esc(t.id)}">열기</button><button class="danger" data-table-delete="${esc(t.id)}">삭제</button></article>`).join(''):'<div class="empty">저장된 테이블이 없습니다. 테이블 만들기에서 그려 주세요.</div>';}catch(e){$('tableLibraryStatus').textContent=e.message;}};
 $('tableLibraryTab').onclick=()=>{showView('tables');loadTables();};
 $('tableNew').onclick=()=>{showView('table');tableEditor.new();};
 $('tableLibraryList').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.tableRename||b.dataset.tableOpen||b.dataset.tableDelete,t=tableRecords.find(t=>t.id===id);if(!t)return;try{if(b.dataset.tableOpen){showView('table');tableEditor.load(t);return;}if(b.dataset.tableDelete){if(!confirm(`“${t.name}” 테이블을 삭제할까요?`))return;await TableLibrary.remove(owner,id);tableEditor?.detach(id);}else{const name=b.closest('article').querySelector('[data-table-name]').value.trim();if(!name)throw Error('테이블 이름을 입력해 주세요.');await TableLibrary.put(owner,{...t,name,updatedAt:new Date().toISOString()});tableEditor?.rename(id,name);}await loadTables();$('tableLibraryStatus').textContent=b.dataset.tableDelete?'삭제했습니다.':'이름을 저장했습니다.';}catch(err){$('tableLibraryStatus').textContent=err.message;}};
 loadTables();
 const renderLibrary=()=>{$('plotLibraryCount').textContent=library.length;$('plotLibraryList').innerHTML=library.length?library.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(g=>`<article class="plot-library-row"><div class="plot-library-thumb">${DataPlot.svg(g.parsed,g.settings).replaceAll('plot-clip','plot-clip-'+g.id)}</div><div class="plot-library-info"><label>그래프 이름<input maxlength="120" data-graph-name="${esc(g.id)}" value="${esc(g.name)}" aria-label="${esc(g.name)} 이름 수정"></label><small>${g.parsed.data.length}행 · ${DataPlot.seriesColumns(g.parsed).length}개 계열 · ${new Date(g.updatedAt).toLocaleString('ko-KR')}</small></div><button type="button" class="secondary" data-graph-rename="${esc(g.id)}">이름 저장</button><button type="button" class="secondary" data-graph-open="${esc(g.id)}">열기</button><button type="button" class="danger" data-graph-delete="${esc(g.id)}" aria-label="${esc(g.name)} 삭제">삭제</button></article>`).join(''):'<div class="empty">저장된 그래프가 없습니다. 그래프 그리기에서 데이터를 넣고 그려 주세요.</div>';};
 const loadLibrary=async()=>{try{library=await PlotLibrary.list(owner);renderLibrary();}catch(e){$('plotLibraryStatus').textContent=e.message;}};
 $('plotEditorTab').onclick=()=>showView('editor');$('plotLibraryTab').onclick=()=>{showView('library');loadLibrary();};
 $('plotLibraryList').onclick=async e=>{const deleteButton=e.target.closest('[data-graph-delete]');if(deleteButton){const id=deleteButton.dataset.graphDelete,graph=library.find(g=>g.id===id);if(!graph)return;if(saving){$('plotLibraryStatus').textContent='그래프 저장이 완료된 후 삭제해 주세요.';return;}if(!confirm(`“${graph.name}” 그래프를 삭제할까요? 저장된 데이터와 설정이 함께 삭제됩니다.`))return;deleteButton.disabled=true;try{await PlotLibrary.remove(owner,id);library=library.filter(g=>g.id!==id);if(activeGraph===id){activeGraph=null;status('저장된 그래프를 삭제했습니다. 다시 그리면 새 항목으로 저장됩니다.');}renderLibrary();$('plotLibraryStatus').textContent=`“${graph.name}” 그래프를 삭제했습니다.`;}catch(error){deleteButton.disabled=false;$('plotLibraryStatus').textContent=error.message;}return;}const rename=e.target.closest('[data-graph-rename]')?.dataset.graphRename;if(rename){const graph=library.find(g=>g.id===rename),input=e.target.closest('article').querySelector('[data-graph-name]'),name=input.value.trim();if(!name){$('plotLibraryStatus').textContent='그래프 이름을 입력해 주세요.';return;}try{const updated={...graph,name,updatedAt:new Date().toISOString()};await PlotLibrary.put(owner,updated);library=library.map(g=>g.id===rename?updated:g);renderLibrary();$('plotLibraryStatus').textContent='이름을 저장했습니다.';}catch(error){$('plotLibraryStatus').textContent=error.message;}return;}const id=e.target.closest('[data-graph-open]')?.dataset.graphOpen;if(!id)return;const graph=library.find(g=>g.id===id);if(!graph)return;activeGraph=id;settings=DataPlot.normalize(graph.settings);sheet.load(graph.parsed);parsed=structuredClone(graph.parsed);root.querySelectorAll('[data-plot]').forEach(el=>{if(el.type==='checkbox')el.checked=settings[el.dataset.plot];else el.value=settings[el.dataset.plot];});series();draw();showView('editor');status(`“${graph.name}” 열림 · 다시 그리면 이 항목에 저장됩니다.`);};
 $('plotNew').onclick=()=>{activeGraph=null;sheet.load({names:['X','Y1'],data:Array.from({length:10},()=>['',''])});$('plotSeries').innerHTML='';showView('editor');status('새 그래프 데이터를 입력해 주세요.');};
 loadLibrary();
 const sheet=mountPlotSheet($('plotSheet'),x2=>{root.querySelector('.plot-secondary-settings').hidden=!Number.isInteger(x2);parsed=null;output='';$('plotSvg').disabled=$('plotPng').disabled=true;$('plotPreview').innerHTML='<div class="empty">입력한 데이터로 그래프를 다시 그려 주세요.</div>';$('plotLegend').innerHTML='';status('데이터가 변경되었습니다. 그래프 그리기를 눌러 주세요.');},msg=>status(msg,true));
 const qtiBridge=window.webkit?.messageHandlers?.nismlQtiPlot;
 $('plotQti').onclick=async()=>{try{read();const input=sheet.read(),file=DataExport.qti(input,settings);const saved=await DataExport.download(new Blob([file],{type:'application/xml;charset=utf-8'}),'graph.qti');status(saved?'QTI 파일을 저장했습니다. QtiPlot에서 파일을 열어 편집할 수 있습니다.':'저장을 취소했습니다.');}catch(e){status(e.message||String(e),true);}};
 const read=()=>{root.querySelectorAll('[data-plot]').forEach(el=>settings[el.dataset.plot]=el.type==='checkbox'?el.checked:el.value);settings=DataPlot.normalize(settings);};
 const syncRatio=()=>{root.querySelectorAll('[data-plot-ratio]').forEach(button=>{const [w,h]=button.dataset.plotRatio.split(':').map(Number);button.setAttribute('aria-pressed',String(settings.width*h===settings.height*w));});};
 root.querySelectorAll('[data-plot-ratio]').forEach(button=>button.onclick=()=>{const size=DataPlot.ratioSize(root.querySelector('[data-plot=width]').value,button.dataset.plotRatio);root.querySelector('[data-plot=width]').value=size.width;root.querySelector('[data-plot=height]').value=size.height;draw();});syncRatio();
 const draw=()=>{try{read();syncRatio();if(!parsed)return;output=DataPlot.svg(parsed,settings);$('plotPreview').innerHTML=DataPlot.svg(parsed,settings,undefined,true);const legend=$('plotPreview').querySelector('.plot-legend-text');legend?.setAttribute('tabindex','0');legend?.setAttribute('aria-label','범례 위치 이동: 드래그 또는 방향키');$('plotSvg').disabled=$('plotPng').disabled=false;status(`${parsed.data.length}행 · ${DataPlot.seriesColumns(parsed).length}개 계열`);$('plotLegend').innerHTML=DataPlot.seriesColumns(parsed).map(({name:n,secondary},i)=>`<span><i style="background:${settings.series[i]?.color||DataPlot.colors[i%6]}"></i>${esc(n)}</span>`).join('');}catch(e){output='';$('plotSvg').disabled=$('plotPng').disabled=true;status(e.message,true);}};
 // Use SVG coordinates so zoomed previews and high-resolution exports agree.
 const preview=$('plotPreview');let legendDrag=null,legendSaveQueue=Promise.resolve();
 const saveLegendPosition=()=>{
  if(!activeGraph||!parsed)return;const id=activeGraph,position={legendX:settings.legendX,legendY:settings.legendY};
  legendSaveQueue=legendSaveQueue.catch(()=>{}).then(async()=>{const graph=library.find(g=>g.id===id);if(!graph)return;const updated={...graph,settings:{...graph.settings,...position},updatedAt:new Date().toISOString()};await PlotLibrary.put(owner,updated);library=library.map(g=>g.id===id?updated:g);renderLibrary();if(activeGraph===id)status('범례 위치를 저장했습니다. PNG·SVG에도 같은 위치로 반영됩니다.');}).catch(e=>status(e.message+' 그래프 그리기를 눌러 다시 저장해 주세요.',true));
 };
 const legendPoint=(svg,e)=>{const matrix=svg.getScreenCTM();if(!matrix)return null;return new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());};
 const moveLegend=(legend,x,y)=>{const maxX=Number(legend.dataset.legendMaxX),maxY=Number(legend.dataset.legendMaxY);x=Math.max(0,Math.min(maxX,x));y=Math.max(0,Math.min(maxY,y));settings.legendX=maxX?x/maxX:0;settings.legendY=maxY?y/maxY:0;legend.setAttribute('transform',`translate(${x},${y})`);legend.dataset.legendX=x;legend.dataset.legendY=y;};
 preview.addEventListener('pointerdown',e=>{const legend=e.target.closest?.('.plot-legend-text');if(!legend||!parsed||saving||e.button!==0)return;const svg=legend.ownerSVGElement,start=legendPoint(svg,e);if(!start)return;e.preventDefault();legendDrag={legend,svg,start,x:Number(legend.dataset.legendX),y:Number(legend.dataset.legendY),pointer:e.pointerId,oldX:settings.legendX,oldY:settings.legendY};preview.setPointerCapture(e.pointerId);legend.classList.add('dragging');legend.focus();});
 preview.addEventListener('pointermove',e=>{const d=legendDrag;if(!d||e.pointerId!==d.pointer)return;const p=legendPoint(d.svg,e);if(p)moveLegend(d.legend,d.x+p.x-d.start.x,d.y+p.y-d.start.y);});
 const endLegendDrag=e=>{const d=legendDrag;if(!d||e.pointerId!==d.pointer)return;legendDrag=null;if(preview.hasPointerCapture(e.pointerId))preview.releasePointerCapture(e.pointerId);if(e.type==='pointercancel'){settings.legendX=d.oldX;settings.legendY=d.oldY;draw();return;}draw();saveLegendPosition();};
 preview.addEventListener('pointerup',endLegendDrag);preview.addEventListener('pointercancel',endLegendDrag);
 preview.addEventListener('keydown',e=>{const legend=e.target.closest?.('.plot-legend-text'),delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!legend||!delta||saving)return;e.preventDefault();const step=e.shiftKey?20:5;moveLegend(legend,Number(legend.dataset.legendX)+delta[0]*step,Number(legend.dataset.legendY)+delta[1]*step);output=DataPlot.svg(parsed,settings);saveLegendPosition();});
 const series=()=>{root.querySelector('.plot-secondary-settings').hidden=!Number.isInteger(parsed.x2Index);$('plotSeries').innerHTML=DataPlot.seriesColumns(parsed).map(({name:n,secondary},i)=>`<label>${esc(n)}${secondary?' · 위/오른쪽':''}<input aria-label="${esc(n)} 색상" type="color" data-color="${i}" value="${settings.series[i]?.color||DataPlot.colors[i%6]}"><select aria-label="${esc(n)} 기호" data-shape="${i}">${[['circle','원'],['square','사각형'],['triangle','삼각형'],['diamond','마름모'],['cross','십자'],['none','없음']].map(([v,l])=>`<option value="${v}" ${(settings.series[i]?.shape||'circle')===v?'selected':''}>${l}</option>`).join('')}</select></label>`).join('');};
 $('plotDraw').onclick=async()=>{if(saving)return;try{parsed=sheet.read();series();draw();if(!output)return;saving=true;$('plotDraw').disabled=true;const existing=library.find(g=>g.id===activeGraph),now=new Date().toISOString(),graph={id:activeGraph||crypto.randomUUID(),name:existing?.name||settings.title.trim()||'그래프 '+new Date().toLocaleString('ko-KR'),parsed:structuredClone(parsed),settings:structuredClone(settings),createdAt:existing?.createdAt||now,updatedAt:now};await PlotLibrary.put(owner,graph);activeGraph=graph.id;library=library.filter(g=>g.id!==graph.id).concat(graph);renderLibrary();status(`“${graph.name}” · 내 그래프에 저장했습니다.`);}catch(e){status(e.message,true);}finally{saving=false;$('plotDraw').disabled=false;}};
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
