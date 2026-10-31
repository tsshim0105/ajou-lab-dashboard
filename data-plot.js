/* Browser-only scientific plotting. No pasted data is sent to the server. */
const DataPlot = (()=>{
 const colors=['#2563eb','#dc2626','#059669','#9333ea','#d97706','#0891b2'];
 const defaults={width:800,height:800,line:2,font:16,marker:6,type:'line',xLabel:'X',yLabel:'Y',title:'',xmin:'',xmax:'',ymin:'',ymax:'',grid:false,series:[]};
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
 function normalize(raw={}){const s={...defaults,...raw,series:Array.isArray(raw.series)?raw.series.map(v=>({...v})):[]};for(const [k,min,max] of [['width',400,2400],['height',300,1800],['line',0.5,12],['font',8,36],['marker',2,20]]){s[k]=Number(s[k]);if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)throw Error(`${k}: ${min}~${max} 범위로 설정해 주세요.`);}if(!['line','scatter','bar'].includes(s.type))s.type='line';return s;}
 function svg(parsed,raw){
  const s=normalize(raw),{data,names}=parsed,W=s.width,H=s.height,F=s.font,L=F*4.6,R=30,T=50,B=F*5.5,pw=W-L-R,ph=H-T-B;
  if(pw<80||ph<80)throw Error('글자 크기에 비해 그래프 크기가 작습니다.');
  const xs=data.map(r=>r[0]),ys=data.flatMap(r=>r.slice(1).filter(v=>v!==null));
  function range(vals,lo,hi,zero=false){let a=vals.reduce((a,v)=>Math.min(a,v),Infinity),b=vals.reduce((a,v)=>Math.max(a,v),-Infinity);if(zero){a=Math.min(0,a);b=Math.max(0,b);}if(a===b){a-=Math.abs(a)*.1||1;b+=Math.abs(b)*.1||1;}else{const pad=(b-a)*.05;a-=pad;b+=pad;}a=lo===''?a:Number(lo);b=hi===''?b:Number(hi);if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b)throw Error('축 최솟값은 최댓값보다 작아야 합니다.');return [a,b];}
  const [xa,xb]=range(xs,s.xmin,s.xmax),[ya,yb]=range(ys,s.ymin,s.ymax,s.type==='bar');
  const x=v=>L+(v-xa)/(xb-xa)*pw,y=v=>T+ph-(v-ya)/(yb-ya)*ph;
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xml(s.title||'데이터 그래프')}"><rect width="100%" height="100%" fill="white"/><defs><clipPath id="plot-clip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath></defs><g font-family="Arial,sans-serif" font-size="${F}" fill="#111">`;
  const line=(x1,y1,x2,y2,c='#111',w=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`;
  const text=(xx,yy,v,anchor='middle')=>`<text x="${xx}" y="${yy}" text-anchor="${anchor}">${xml(v)}</text>`;
  const fmt=v=>Number(v.toPrecision(4)).toString();
  let ticks='';
  for(let i=0;i<=25;i++){
   const major=i%5===0,len=major?7:4,xx=L+pw*i/25,yy=T+ph-ph*i/25;
   if(major&&s.grid)out+=line(xx,T,xx,T+ph,'#e5e7eb')+line(L,yy,L+pw,yy,'#e5e7eb');
   ticks+=`<g class="plot-${major?'major':'minor'}-ticks">`+line(xx,T+ph,xx,T+ph-len)+line(xx,T,xx,T+len)+line(L,yy,L+len,yy)+line(L+pw,yy,L+pw-len,yy)+'</g>';
   if(major)out+=text(xx,T+ph+F+10,fmt(xa+(xb-xa)*i/25))+text(L-12,yy+F*.35,fmt(ya+(yb-ya)*i/25),'end');
  }
  const frame=`<rect class="plot-axis-frame" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="#111" stroke-width="1"/>`;
  out+=text(W/2,27,s.title)+text(L+pw/2,T+ph+F*3+4,s.xLabel)+`<text transform="translate(${F*1.2},${T+ph/2}) rotate(-90)" text-anchor="middle">${xml(s.yLabel)}</text>`;
  const marks=(xx,yy,c,shape)=>{let r=s.marker/2;const attr=`fill="${c}" stroke="${c}" stroke-width="1.5"`;if(shape==='none')return '';if(shape==='square')return `<rect x="${xx-r}" y="${yy-r}" width="${r*2}" height="${r*2}" ${attr}/>`;if(shape==='triangle')return `<path d="M${xx},${yy-r} L${xx+r},${yy+r} L${xx-r},${yy+r} Z" ${attr}/>`;if(shape==='diamond')return `<path d="M${xx},${yy-r} L${xx+r},${yy} L${xx},${yy+r} L${xx-r},${yy} Z" ${attr}/>`;if(shape==='cross')return line(xx-r,yy-r,xx+r,yy+r,c,1.5)+line(xx-r,yy+r,xx+r,yy-r,c,1.5);return `<circle cx="${xx}" cy="${yy}" r="${r}" ${attr}/>`;};
  names.slice(1).forEach((name,j)=>{const cfg=s.series[j]||{},c=/^#[0-9a-f]{6}$/i.test(cfg.color)?cfg.color:colors[j%colors.length],shape=cfg.shape||'circle';out+='<g clip-path="url(#plot-clip)">';let path='',connected=false;
   data.forEach(row=>{const v=row[j+1];if(v===null){connected=false;return;}const xx=x(row[0]),yy=y(v);path+=`${connected?'L':'M'}${xx},${yy} `;connected=true;
    if(s.type==='bar'){const bw=Math.min(40,pw/Math.max(data.length,1)*.65)/(names.length-1),base=y(0);out+=`<rect x="${xx+(j-(names.length-2)/2)*bw-bw/2}" y="${Math.min(yy,base)}" width="${bw}" height="${Math.abs(base-yy)}" fill="${c}"/>`;}
    else out+=marks(xx,yy,c,shape);
   });if(s.type==='line')out+=`<path d="${path}" fill="none" stroke="${c}" stroke-width="${s.line}" stroke-linejoin="round"/>`;out+='</g>';
  });
  out+=frame+ticks;
  names.slice(1).forEach((name,j)=>{const cfg=s.series[j]||{},c=/^#[0-9a-f]{6}$/i.test(cfg.color)?cfg.color:colors[j%colors.length],xx=L+pw-140,yy=T+18+j*(F+6);out+=line(xx,yy-5,xx+20,yy-5,c,s.line)+marks(xx+10,yy-5,c,cfg.shape||'circle')+text(xx+28,yy,String(name).slice(0,18),'start');});out+='</g></svg>';return out;
 }
 return {parse,normalize,svg,defaults,colors,xml};
})();
function mountDataPlot(){
 if(!admin())return;const root=$('dataPlotRoot'),key='nisml.plot.format.v1:'+String(user.email||user.id||'professor');let settings={...DataPlot.defaults},parsed=null,output='';
 try{settings=DataPlot.normalize(JSON.parse(localStorage.getItem(key)||'null')||{});}catch{}
 const field=(k,label,type='text')=>`<label>${label}<input data-plot="${k}" type="${type}" value="${esc(settings[k])}" ${type==='number'?'step="any"':''}></label>`;
 root.innerHTML=`<div class="plot-intro"><strong>스프레드시트 → 그래프</strong><span>교수님 전용 · 데이터는 서버로 전송하지 않습니다.</span></div><div class="plot-layout"><div class="plot-controls"><label for="plotData">데이터 붙여넣기</label><small>기본 포맷: 닫힌 사각형 축 · 안쪽 메이저/마이너 틱. 첫 열은 X, 나머지는 Y입니다. 첫 행에 열 제목을 넣을 수 있습니다. 빈 Y 셀은 건너뜁니다.</small><textarea id="plotData" rows="9" spellcheck="false" placeholder="Time\tSample A\tSample B&#10;0\t1.2\t1.5&#10;1\t2.4\t2.8"></textarea><div class="plot-actions"><button id="plotDraw" class="primary">그래프 그리기</button><button id="plotExample" class="secondary">예시 데이터</button></div><div class="plot-fields"><label>그래프 종류<select data-plot="type"><option value="line">선 + 기호</option><option value="scatter">산점도</option><option value="bar">막대</option></select></label>${field('title','그래프 제목')}${field('width','너비 (px)','number')}${field('height','높이 (px)','number')}${field('line','선 두께 (px)','number')}${field('marker','기호 크기 (px)','number')}${field('font','글자 크기 (px)','number')}${field('xLabel','X축 제목')}${field('yLabel','Y축 제목')}${field('xmin','X 최소 (빈칸: 자동)','number')}${field('xmax','X 최대 (빈칸: 자동)','number')}${field('ymin','Y 최소 (빈칸: 자동)','number')}${field('ymax','Y 최대 (빈칸: 자동)','number')}<label><span>격자선</span><input data-plot="grid" type="checkbox" ${settings.grid?'checked':''}></label></div><div id="plotSeries" class="plot-series"></div><div class="plot-actions"><button class="secondary" id="plotSave">포맷 저장</button><button class="secondary" id="plotReset">기본 포맷</button></div><small>포맷은 이 브라우저에 저장됩니다. 데이터는 탭을 닫으면 사라집니다.</small></div><div class="plot-result"><div class="plot-actions"><strong>미리보기</strong><button class="secondary" id="plotSvg" disabled>SVG</button><button class="secondary" id="plotPng" disabled>PNG 2×</button><button class="primary" id="plotQti">QtiPlot으로 그리기</button><button class="secondary" id="plotQtiFolder" hidden>QtiPlot 결과 폴더</button></div><p id="plotStatus" role="status"></p><div id="plotPreview" class="plot-preview"><div class="empty">데이터를 붙여 넣고 그래프를 그려 주세요.</div></div><div id="plotLegend" class="plot-legend"></div></div></div>`;
 root.querySelector('[data-plot="type"]').value=settings.type;
 const status=(msg,error=false)=>{$('plotStatus').textContent=msg;$('plotStatus').style.color=error?'#c43c3c':'';};
 const qtiBridge=window.webkit?.messageHandlers?.nismlQtiPlot;let qtiBusy=false;
 $('plotQti').onclick=async()=>{if(qtiBusy)return;if(!qtiBridge){status('Mac용 Hub 0.4.22 이상에서 사용할 수 있습니다. 앱의 업데이트 확인을 이용해 주세요.',true);return;}try{read();const input=DataPlot.parse($('plotData').value);DataPlot.svg(input,settings);qtiBusy=true;$('plotQti').disabled=true;status('QtiPlot 설치 확인 중…');const ready=await qtiBridge.postMessage({action:'status'});if(ready.bridgeVersion<2)throw Error('닫힌 축·안쪽 눈금 적용을 위해 Mac용 Hub 0.4.22로 업데이트해 주세요.');if(!ready.installed)throw Error('QtiPlot을 응용 프로그램 폴더에 설치해 주세요.');status('QtiPlot에서 그래프를 만드는 중…');const result=await qtiBridge.postMessage({action:'plot',payload:{...input,settings}});$('plotQtiFolder').hidden=false;status(result.message+(result.warnings?.length?' 일부 설정 확인 필요: '+result.warnings.join(' / '):''));}catch(e){status(e.message||String(e),true);}finally{qtiBusy=false;$('plotQti').disabled=false;}};
 $('plotQtiFolder').onclick=async()=>{try{await qtiBridge.postMessage({action:'reveal'});}catch(e){status(e.message||String(e),true);}};
 const read=()=>{root.querySelectorAll('[data-plot]').forEach(el=>settings[el.dataset.plot]=el.type==='checkbox'?el.checked:el.value);settings=DataPlot.normalize(settings);};
 const draw=()=>{try{read();if(!parsed)return;output=DataPlot.svg(parsed,settings);$('plotPreview').innerHTML=output;$('plotSvg').disabled=$('plotPng').disabled=false;status(`${parsed.data.length}행 · ${parsed.names.length-1}개 계열`);$('plotLegend').innerHTML=parsed.names.slice(1).map((n,i)=>`<span><i style="background:${settings.series[i]?.color||DataPlot.colors[i%6]}"></i>${esc(n)}</span>`).join('');}catch(e){output='';$('plotSvg').disabled=$('plotPng').disabled=true;status(e.message,true);}};
 const series=()=>{$('plotSeries').innerHTML=parsed.names.slice(1).map((n,i)=>`<label>${esc(n)}<input aria-label="${esc(n)} 색상" type="color" data-color="${i}" value="${settings.series[i]?.color||DataPlot.colors[i%6]}"><select aria-label="${esc(n)} 기호" data-shape="${i}">${[['circle','원'],['square','사각형'],['triangle','삼각형'],['diamond','마름모'],['cross','십자'],['none','없음']].map(([v,l])=>`<option value="${v}" ${(settings.series[i]?.shape||'circle')===v?'selected':''}>${l}</option>`).join('')}</select></label>`).join('');};
 $('plotDraw').onclick=()=>{try{parsed=DataPlot.parse($('plotData').value);series();draw();}catch(e){parsed=null;output='';$('plotSvg').disabled=$('plotPng').disabled=true;$('plotPreview').innerHTML='';status(e.message,true);}};
 $('plotData').oninput=()=>{output='';$('plotSvg').disabled=$('plotPng').disabled=true;parsed=null;status('데이터가 변경되었습니다. 그래프 그리기를 눌러 주세요.');};
 root.onchange=e=>{const el=e.target;if(el.dataset.color!==undefined||el.dataset.shape!==undefined){const i=Number(el.dataset.color??el.dataset.shape);settings.series[i]={...settings.series[i],[el.dataset.color!==undefined?'color':'shape']:el.value};}if(el.matches('[data-plot],[data-color],[data-shape]'))draw();};
 $('plotExample').onclick=()=>{$('plotData').value='Time (s)\tSample A\tSample B\n0\t1.2\t1.5\n1\t2.4\t2.8\n2\t3.1\t3.9\n3\t4.8\t5.2\n4\t5.3\t6.4';$('plotDraw').click();};
 $('plotSave').onclick=()=>{try{read();localStorage.setItem(key,JSON.stringify(settings));status('포맷을 저장했습니다. 다음 데이터에도 동일하게 적용됩니다.');}catch(e){status(e.message,true);}};
 $('plotReset').onclick=()=>{settings=DataPlot.normalize();root.querySelectorAll('[data-plot]').forEach(el=>{if(el.type==='checkbox')el.checked=settings[el.dataset.plot];else el.value=settings[el.dataset.plot];});if(parsed)series();draw();status('기본 포맷으로 되돌렸습니다. 유지하려면 포맷 저장을 눌러 주세요.');};
 const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('이미지 파일을 읽지 못했습니다.'));reader.readAsDataURL(blob);});
 const download=async(blob,name)=>{
  if(window.webkit?.messageHandlers?.nismlWorkspace){
   if(!qtiBridge)throw Error('그래프 저장을 위해 Mac용 Hub 0.4.22로 업데이트해 주세요.');
   const ready=await qtiBridge.postMessage({action:'status'});
   if(ready.bridgeVersion<3)throw Error('그래프 저장을 위해 Mac용 Hub 0.4.22로 업데이트해 주세요.');
   const encoded=await dataURL(blob);const result=await qtiBridge.postMessage({action:'export',name,base64:encoded.split(',')[1]});
   status(result.cancelled?'저장을 취소했습니다.':'그래프 파일을 저장했습니다.');return;
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('파일 다운로드를 요청했습니다. 브라우저의 다운로드 목록을 확인해 주세요.');
 };
 $('plotSvg').onclick=async()=>{if(!output)return;try{await download(new Blob([output],{type:'image/svg+xml;charset=utf-8'}),'graph.svg');}catch(e){status(e.message||String(e),true);}};
 $('plotPng').onclick=async()=>{
  if(!output)return;const snapshot=output,width=settings.width,height=settings.height;
  try{
   const img=new Image();
   // data: is allowed by the Hub CSP; blob: images are intentionally not allowed.
   const url=await dataURL(new Blob([snapshot],{type:'image/svg+xml;charset=utf-8'}));
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('PNG 변환용 그래프 이미지를 읽지 못했습니다.'));img.src=url;});
   const c=document.createElement('canvas');c.width=width*2;c.height=height*2;const ctx=c.getContext('2d');if(!ctx)throw Error('이미지 변환을 시작하지 못했습니다.');ctx.drawImage(img,0,0,c.width,c.height);
   const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG 파일 생성에 실패했습니다.')),'image/png'));
   await download(blob,'graph-2x.png');
  }catch(e){status(e.message||String(e),true);}
 };
}
