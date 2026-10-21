// Declarative content only. No HTML, scripts, external SVG references or executable charts.
export function validateResearchBlocks(blocks,images,papers){
 if(blocks===undefined)return [];
 if(!Array.isArray(blocks)||blocks.length>100)throw Error('콘텐츠 블록은 100개까지 저장할 수 있습니다.');
 const str=(v,max=12000)=>{if(typeof v!=='string'||v.length>max)throw Error('콘텐츠 텍스트를 확인해주세요.');return v;};
 return blocks.map(b=>{if(!b||typeof b!=='object')throw Error('콘텐츠 형식을 확인해주세요.');
 const title=b.title===undefined?'':str(b.title,300);
 if(b.type==='markdown')return {type:b.type,text:str(b.text,80000)};
 if(b.type==='image'||b.type==='paper'){if(!Number.isInteger(b.index)||b.index<0||b.index>=(b.type==='image'?images:papers))throw Error('그림·논문 참조 번호를 확인해주세요.');return {type:b.type,index:b.index};}
 if(b.type==='table'){if(!Array.isArray(b.headers)||!b.headers.length||b.headers.length>20||!Array.isArray(b.rows)||b.rows.length>200)throw Error('표 크기를 확인해주세요.');const headers=b.headers.map(v=>str(v,500));return {type:b.type,title,headers,rows:b.rows.map(r=>{if(!Array.isArray(r)||r.length!==headers.length)throw Error('표의 열 수를 확인해주세요.');return r.map(v=>str(v,3000));})};}
 if(b.type==='metrics'){if(!Array.isArray(b.items)||!b.items.length||b.items.length>12)throw Error('수치 카드 개수를 확인해주세요.');return {type:b.type,title,items:b.items.map(x=>({label:str(x.label,150),value:str(x.value,150),unit:str(x.unit||'',80)}))};}
 if(b.type==='chart'){if(!['bar','line'].includes(b.chartType)||!Array.isArray(b.labels)||!b.labels.length||b.labels.length>100||!Array.isArray(b.series)||!b.series.length||b.series.length>6)throw Error('그래프 형식을 확인해주세요.');const labels=b.labels.map(x=>str(x,120));return {type:b.type,title,chartType:b.chartType,unit:str(b.unit||'',80),labels,series:b.series.map(x=>{if(!Array.isArray(x.values)||x.values.length!==labels.length||x.values.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e12))throw Error('그래프 수치를 확인해주세요.');return {name:str(x.name,120),values:x.values};})};}
 throw Error('지원하지 않는 콘텐츠 블록입니다. 그림으로 첨부해주세요.');
 });
}
export function safeResearchSvg(value){
 if(typeof value!=='string'||value.length>200000||!/^\s*<svg[\s>]/i.test(value)||!/<\/svg>\s*$/i.test(value))throw Error('SVG 형식을 확인해주세요.');
 if(/<!|<\?|\bon\w+\s*=|\b(?:href|src|style)\s*=|url\s*\(/i.test(value))throw Error('외부 참조나 실행 코드가 있는 SVG는 저장할 수 없습니다.');
 const allowed=new Set('svg g path rect circle ellipse line polyline polygon text tspan defs lineargradient radialgradient stop clippath mask title desc'.split(' '));
 for(const m of value.matchAll(/<\/?\s*([\w:-]+)/g))if(!allowed.has(m[1].toLowerCase()))throw Error('지원하지 않는 SVG 요소입니다. PNG로 첨부해주세요.');
 return value;
}
