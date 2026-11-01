/* Local downloads: no session or server request is needed for generated files. */
const DataExport = (()=>{
 const xml=v=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/\r?\n/g,'&#10;');
 const dataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('파일을 읽지 못했습니다.'));r.readAsDataURL(blob);});
 async function download(blob,name){
  if(window.webkit?.messageHandlers?.nismlWorkspace){
   const bridge=window.webkit?.messageHandlers?.nismlQtiPlot,ready=bridge&&await bridge.postMessage({action:'status'});
   if(!ready||ready.bridgeVersion<9)throw Error('QTI·테이블 저장은 Mac용 Hub 0.5.1로 업데이트한 뒤 이용해 주세요.');
   const result=await bridge.postMessage({action:'export',name,base64:(await dataURL(blob)).split(',')[1]});return !result.cancelled;
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return true;
 }
 async function png(svg){const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('PNG 이미지 변환에 실패했습니다.'));dataURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})).then(url=>image.src=url,reject);});const c=document.createElement('canvas');c.width=image.naturalWidth*2;c.height=image.naturalHeight*2;if(c.width*c.height>32000000)throw Error('PNG가 너무 큽니다. 행 수나 표 너비를 줄여 주세요.');const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG 생성에 실패했습니다.')),'image/png'));}
 function qti(parsed,raw){
  const s=DataPlot.normalize(raw);let geometry;DataPlot.svg(parsed,s,g=>geometry=g);const cols=DataPlot.seriesColumns(parsed),dual=Number.isInteger(parsed.x2Index);
  parsed=DataPlot.prepare(parsed,s.type);
  const r1={x:[geometry.xa,geometry.xb],y:[geometry.ya,geometry.yb]},r2={x:[geometry.x2a,geometry.x2b],y:[geometry.y2a,geometry.y2b]},F=s.font,left=geometry.L,top=geometry.T,W=geometry.W,H=geometry.H;
  const labelColumns=Object.entries(geometry.categories).map(([col,labels])=>({col:Number(col),name:'XLabels'+col,labels}));
  const font=`Arial,-1,${F},5,75,0,0,0,0,0`;
  const axis=(id,r,title,labels)=>{const col=id===2?0:id===3?parsed.x2Index:null,category=labelColumns.find(v=>v.col===col),fmt=id===2?geometry.xf:id===3?geometry.x2f:null;return `<axis id="${id}" on="1" ${category?`type="1" table="HubData" col="${category.name}"`:`type="0" format="${fmt?fmt.scientific?2:1:0}" prec="${fmt?fmt.scientific?3:fmt.digits:6}"`} lw="4"><div from="${r[0]}" to="${r[1]}" step="${category?1:(r[1]-r[0])/5}" maj="${category?category.labels.length:6}" min="${category?0:4}" type="0"/><ticks maj="3" majl="12" min="${category?0:3}" minl="7"/><title text="${xml(title)}" color="#111111" font="${font}" align="5124" space="10"/>${labels?`<labels space="4" font="${font}" align="0"/>`:''}</axis>`;};
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE qti>\n<qti app="QtiPlot" version="1.0.0-rc17" dpi="72" arch="Mac64" script="Python" windows="2" expand="1"><window type="1" name="HubData" x="0" y="0" w="600" h="400"><tab rows="${parsed.data.length}" cols="${parsed.names.length+labelColumns.length}" labels="0">${parsed.names.map((n,i)=>`<col name="C${i+1}" comment="${xml(n)}" type="6" num="0" prec="13" plot="${i===0||i===parsed.x2Index?1:2}" width="120" stat="0" data="${parsed.data.map(row=>row[i]==null?'':row[i]).join(';')};"/>`).join('')}${labelColumns.map(c=>`<col name="${c.name}" type="6" num="0" prec="13" plot="0" width="140" stat="0" data="${xml(c.labels.join(';')+';')}"/>`).join('')}</tab></window><window type="3" name="Graph1" x="0" y="0" w="${W}" h="${H+60}" active="1" dpi="72"><layout cw="${W}" ch="${H}" w="${s.width}" h="${s.height}" left="5" right="5" top="5" bottom="5" rows="1" cols="1" vSpace="5" hSpace="5" hAlign="0" vAlign="0" align="0" common="0" link="0" scale="0" currentLayer="0" sPrint="0" cmPrint="0" atUnits="1" atdIndex="0" atPolicy="4" alMode="0" luMode="2"/><tab x="0" y="0" w="${W}" h="${H}" autoscale="0" maxMajorTicks="20" axesLayout="0" antialias="1" gap="1" scaleFont="0" dataMargins="0"><page x="0" y="0" w="1" h="1"/><title text="${xml(s.title)}" color="#111111" font="${font}" align="4228"/><frame bg="#ffffff,0"/><canvas x="${left}" y="${top}" w="${s.width}" h="${s.height}" fixRatio="0" bg="#ffffff,0"/>
  ${cols.map((c,i)=>{const cfg=s.series[i]||{},color=DataPlot.colorAt(s,i),shape=cfg.shape||'circle',symbol=s.type!=='lineonly'&&s.type!=='bar'&&shape!=='none',type=s.type==='bar'?3:s.type==='scatter'?1:symbol?2:0;return `<curve type="${type}" z="${21+i}" table="HubData" x="C${c.xcol+1}" y="C${c.col+1}" from="0" to="-1" line="${s.type==='scatter'?0:1}" lc="${color}" lw="${s.line}" ls="0" brc="${color}" brs="${s.type==='bar'?1:0}"${s.type==='bar'?` gap="${100-s.barWidth/cols.filter(v=>v.secondary===c.secondary).length}" offset="${(cols.filter(v=>v.secondary===c.secondary).findIndex(v=>v.col===c.col)-(cols.filter(v=>v.secondary===c.secondary).length-1)/2)*100}"`:''}${c.secondary?' xAxis="3" yAxis="1"':''}>${symbol?`<symbol style="${({circle:0,square:1,diamond:2,triangle:3,cross:9})[shape]??0}" size="${s.marker}" lc="${color}" lw="1" ls="0" brc="${color}"/>`:''}</curve>`;}).join('')}
  ${axis(0,r1.y,s.yLabel,true)}${axis(1,r2.y,dual?s.y2Label:'',dual)}${axis(2,r1.x,s.xLabel,true)}${axis(3,r2.x,dual?s.x2Label:'',dual)}<item type="2" x="${r1.x[0]+(r1.x[1]-r1.x[0])*((geometry.legendX-left)/s.width)}" y="${r1.y[1]-(r1.y[1]-r1.y[0])*((geometry.legendY-top)/s.height)}" frame="0" lc="#000000" lw="1" ls="0" bg="#ffffff,0" onTop="1" at="0" on="1" auto="0" font="Arial,-1,${s.legendFont},5,50,0,0,0,0,0" left="10" top="5" symbLineLength="64" symbLineWidth="-1" text="${xml(cols.map((c,i)=>'\\l('+(i+1)+') '+c.name).join('\n'))}"/></tab></window></qti>`;
 }
 return {xml,dataURL,download,png,qti};
})();

/* Range selection is independent of the rendered row window. Editing a single
   cell remains native; drag across cells or Shift-click to select a rectangle. */
const SheetRange = {
 bounds:(a,b)=>({r0:Math.min(a.r,b.r),r1:Math.max(a.r,b.r),c0:Math.min(a.c,b.c),c1:Math.max(a.c,b.c)}),
 text:(rows,b)=>rows.slice(b.r0,b.r1+1).map(r=>r.slice(b.c0,b.c1+1).join('\t')).join('\n')
};
function mountSheetRange(root,{selector,coords,rows,clear,scrollSelector}){
 let anchor=null,end=null,down=false,dragged=false,pointer=null,frame=0,point=null;
 const bounds=()=>anchor&&end?SheetRange.bounds(anchor,end):null;
 const multiple=()=>anchor&&end&&(anchor.r!==end.r||anchor.c!==end.c);
 const paint=()=>{const all=rows();if(anchor&&end&&all.length){const clamp=p=>({r:Math.max(0,Math.min(all.length-1,p.r)),c:Math.max(0,Math.min(all[0].length-1,p.c))});anchor=clamp(anchor);end=clamp(end);}const b=bounds();root.querySelectorAll(selector).forEach(el=>{const p=coords(el),selected=!!b&&p.r>=b.r0&&p.r<=b.r1&&p.c>=b.c0&&p.c<=b.c1;el.classList.toggle('sheet-selected',selected);el.closest('td')?.setAttribute('aria-selected',String(selected));});};
 const locate=(x,y)=>document.elementFromPoint(x,y)?.closest(selector);
 const update=(x,y)=>{const el=locate(x,y);if(el&&root.contains(el)){const p=coords(el);if(p.r!==end.r||p.c!==end.c){end=p;dragged=true;root.classList.add('sheet-dragging');paint();}}};
 const tick=()=>{if(!down||!root.isConnected)return;const sc=root.querySelector(scrollSelector);if(sc&&point&&dragged){const r=sc.getBoundingClientRect(),dx=point.x<r.left+25?-14:point.x>r.right-25?14:0,dy=point.y<r.top+25?-18:point.y>r.bottom-25?18:0;if(dx||dy){sc.scrollLeft+=dx;sc.scrollTop+=dy;update(Math.max(r.left+4,Math.min(r.right-4,point.x)),Math.max(r.top+4,Math.min(r.bottom-4,point.y)));}}frame=requestAnimationFrame(tick);};
 root.addEventListener('pointerdown',e=>{const el=e.target.closest(selector);if(!el||e.button!==0||e.pointerType==='touch')return;const p=coords(el);if(e.shiftKey&&anchor){end=p;e.preventDefault();paint();el.focus();return;}anchor=end=p;down=true;dragged=false;pointer=e.pointerId;point={x:e.clientX,y:e.clientY};paint();root.setPointerCapture(pointer);frame=requestAnimationFrame(tick);});
 root.addEventListener('pointermove',e=>{if(!down)return;point={x:e.clientX,y:e.clientY};update(point.x,point.y);if(dragged)e.preventDefault();});
 const stop=()=>{down=false;cancelAnimationFrame(frame);root.classList.remove('sheet-dragging');if(pointer!==null&&root.hasPointerCapture(pointer))root.releasePointerCapture(pointer);pointer=null;};
 root.addEventListener('pointerup',stop);root.addEventListener('pointercancel',stop);
 root.addEventListener('copy',e=>{if(!multiple())return;e.preventDefault();e.clipboardData.setData('text/plain',SheetRange.text(rows(),bounds()));});
 root.addEventListener('cut',e=>{if(!multiple())return;e.preventDefault();e.clipboardData.setData('text/plain',SheetRange.text(rows(),bounds()));clear(bounds());paint();});
 root.addEventListener('keydown',e=>{if(!e.target.matches(selector))return;if(e.key==='Escape'){anchor=end=null;paint();return;}if(e.shiftKey&&/^Arrow/.test(e.key)&&anchor){e.preventDefault();e.stopImmediatePropagation();const all=rows();end={r:Math.max(0,Math.min(all.length-1,end.r+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0))),c:Math.max(0,Math.min(all[0].length-1,end.c+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)))};paint();return;}if(multiple()&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();e.stopImmediatePropagation();clear(bounds());paint();}},true);
 return {refresh:paint,reset:()=>{anchor=end=null;paint();},start:()=>multiple()?{r:bounds().r0,c:bounds().c0}:null};
}
