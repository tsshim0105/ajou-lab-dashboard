/* Workbook adapters. Original files remain the source of truth. */
globalThis.LabData=(()=>{
 const text=v=>v==null?'':String(v).trim(),num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const date=v=>typeof v==='number'&&v>30000&&v<80000?new Date(Math.round((v-25569)*86400000)).toISOString().slice(0,10):text(v).slice(0,10);
 const empty=()=>({papers:[],conferences:[],funds:[],payroll:[],standards:[],sources:[],issues:[]});
 function normalize(sheets,name){
  const out=empty();let type;
  if(sheets.Paper){type='papers';let upcoming=false;
   sheets.Paper.forEach((r,i)=>{if(/Upcoming papers/i.test(text(r[4]))){upcoming=true;return;}if(!r[4]||i===0||!num(r[1]))return;
    out.papers.push({id:'paper-'+(i+1),year:r[1],journal:text(r[3]),title:text(r[4]),role:r[5]==='Y'?'제1·교신':r[5]==='N'?'공동':'미기재',authors:num(r[6]),fund:text(r[12]),points:num(r[9]),engineeringPoints:num(r[10]),status:upcoming?'예정 목록':'상태 미확인',sourceRow:i+1});});
   out.issues.push('논문 목록에 게재·투고 상태 열이 없어 등록 논문 수로 표시합니다. 저널명만으로 게재 완료를 판단하지 않습니다.');
  }else if(sheets['학회참석내역']){type='conferences';let year;
   sheets['학회참석내역'].forEach((r,i)=>{if(i<2)return;if(num(r[0]))year=r[0];if(!r[5]||!r[3])return;
    const d=date(r[2]),period=typeof r[1]==='number'?date(r[1]):text(r[1]);
    out.conferences.push({id:'conf-'+(i+1),year,period,date:d,presenter:text(r[3]),coauthors:text(r[4]),conference:text(r[5]),region:text(r[6]),venue:text(r[7]),title:text(r[8]),kind:text(r[9])||'미기재',note:text(r[10]),sourceRow:i+1});
    if(/^\d{4}-/.test(d||period)&&Number((d||period).slice(0,4))!==year)out.issues.push(`학회 ${i+1}행: 연도와 날짜가 다릅니다. 원본을 확인해주세요.`);
   });
  }else if(sheets['(2026-) 인건비 지급계획']){type='payroll';const rows=sheets['(2026-) 인건비 지급계획'];let term='';
   [2,3,4,6].forEach(i=>{const r=rows[i];if(r)out.standards.push({degree:text(r[0]),base:num(r[1]),bk:num(r[3]),total:num(r[4]),afterTuition:num(r[6]),school:num(r[7])});});
   rows.forEach((r,i)=>{if(/^20\d\d-[12] 인건비/.test(text(r[0]))){term=text(r[0]);return;}if(!term||!r[0]||num(r[3])===null)return;
    const record={id:'pay-'+(i+1),term,name:text(r[0]),scholarship:text(r[1]),degree:text(r[2]),base:num(r[3]),core:num(r[4])||0,institution:num(r[5])||0,src:num(r[6])||0,monthly:num(r[7]),semester:num(r[8]),note:text(r[9]),sourceRow:i+1};out.payroll.push(record);
    if(record.monthly!==null&&record.semester!==null&&record.monthly*6!==record.semester)out.issues.push(`인건비 ${i+1}행: 월 합계 × 6과 학기 금액이 다릅니다. 원본 값을 유지했습니다.`);
   });
  }else if(Object.values(sheets).some(rows=>rows.some(r=>/^기본연구소 연구비/.test(text(r[0]))))){type='funds';
   for(const [sheet,rows]of Object.entries(sheets)){rows.forEach((r,i)=>{if(!/^기본연구소 연구비/.test(text(r[0])))return;
    const total=rows[i+1],balance=rows.slice(i+2).find(r=>r[0]==='잔액');if(!total||!balance)return;
    const months=[];for(let c=2;c<r.length;c++){if(!r[c])continue;let spend=0;for(let k=i+1;k<rows.length&&rows[k]!==balance;k++)spend+=num(rows[k][c])||0;months.push({month:text(r[c]),spend,balance:num(balance[c])});}
    const closed=balance.some(v=>/사용완료/.test(text(v)));out.funds.push({id:'fund-'+sheet+'-'+i,title:text(r[0]),sheet,total:num(total[1]),months,balance:months.filter(m=>m.balance!==null).at(-1)?.balance??null,closed,note:closed?'원본에 잔액 사용완료 메모가 있습니다. 잔액을 현재 가용액으로 합산하지 않습니다.':'마지막 열의 기록 잔액입니다. 미정산·구매 예정액은 포함 여부를 확인해야 합니다.'});});}
   out.issues.push('연구비의 월 표기에 연도가 없으며, 시트명과 표 제목의 연도가 다를 수 있습니다. 원본 기간을 함께 표시합니다.');
  }else throw Error('지원되는 원본 시트가 없습니다. 논문·학회·인건비·기본연구소 연구비 파일을 선택해주세요.');
  out.sources=[{type,name,importedAt:new Date().toISOString()}];return {type,data:out};
 }
 function merge(base,part){const out=structuredClone(base),{type,data}=part;out[type]=data[type];if(type==='papers'){
 const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
 const used=new Set();out.papers=data.papers.map(r=>{const old=base.papers.find(p=>p.metadataSource&&[p.title,...(p.titleAliases||[])].some(t=>key(t)===key(r.title)));if(!old)return r;used.add(old.id);const merged={...r,id:old.id};for(const k of ['title','year','journal','citation','authorList','authorNamesKo','authorsText','authors','firstAuthor','publicationUrl','websiteNumber','metadataSource','metadataChecked','titleAliases','status'])if(old[k]!==undefined)merged[k]=old[k];return merged;});out.papers.push(...base.papers.filter(p=>p.metadataSource&&!used.has(p.id)));
 }if(type==='payroll')out.standards=data.standards;out.sources=[...out.sources.filter(s=>s.type!==type),...data.sources];out.issues=[...out.issues.filter(s=>s.type!==type),...data.issues.map(message=>({type,message}))];return out;}
 async function readXlsx(file){
  if(file.size>12*1024*1024)throw Error('엑셀 파일은 12MB 이하로 선택해주세요.');
  const buf=await file.arrayBuffer(),v=new DataView(buf),bytes=new Uint8Array(buf);let end=-1;
  for(let p=buf.byteLength-22;p>=Math.max(0,buf.byteLength-65557);p--)if(v.getUint32(p,true)===0x06054b50){end=p;break;}
  if(end<0)throw Error('올바른 .xlsx 파일이 아닙니다.');const entries=new Map();let p=v.getUint32(end+16,true),total=0;
  for(let i=0;i<v.getUint16(end+10,true);i++){if(v.getUint32(p,true)!==0x02014b50)throw Error('손상된 엑셀 파일입니다.');const len=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true);const n=new TextDecoder().decode(bytes.slice(p+46,p+46+len));const size=v.getUint32(p+24,true);total+=size;if(total>60*1024*1024)throw Error('압축 해제 크기가 너무 큽니다.');entries.set(n,{method:v.getUint16(p+10,true),size:v.getUint32(p+20,true),offset:v.getUint32(p+42,true)});p+=46+len+extra+comment;}
  async function xml(name){const e=entries.get(name);if(!e)return null;const o=e.offset+30+v.getUint16(e.offset+26,true)+v.getUint16(e.offset+28,true);let data=bytes.slice(o,o+e.size);if(e.method===8)data=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());else if(e.method!==0)throw Error('지원되지 않는 압축 방식입니다.');const d=new DOMParser().parseFromString(new TextDecoder().decode(data),'text/xml');if(d.querySelector('parsererror'))throw Error('엑셀 XML을 읽을 수 없습니다.');return d;}
  const shared=await xml('xl/sharedStrings.xml'),strings=shared?[...shared.getElementsByTagName('si')].map(n=>[...n.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
  const book=await xml('xl/workbook.xml'),rels=await xml('xl/_rels/workbook.xml.rels');if(!book||!rels)throw Error('엑셀 통합문서를 찾을 수 없습니다.');const paths=Object.fromEntries([...rels.getElementsByTagName('Relationship')].map(r=>[r.getAttribute('Id'),r.getAttribute('Target')])),sheets={};
  for(const sheet of book.getElementsByTagName('sheet')){const target=paths[sheet.getAttribute('r:id')];if(!target)continue;const path=target.startsWith('/')?target.slice(1):'xl/'+target;const doc=await xml(path);if(!doc)continue;const rows=[];for(const row of doc.getElementsByTagName('row')){const index=Number(row.getAttribute('r'))-1;if(index>20000)throw Error('행 수가 너무 많습니다.');const values=[];for(const c of row.getElementsByTagName('c')){const col=c.getAttribute('r').match(/^[A-Z]+/)[0];let n=0;for(const l of col)n=n*26+l.charCodeAt(0)-64;if(n>1000)continue;const raw=c.getElementsByTagName('v')[0]?.textContent,t=c.getAttribute('t');values[n-1]=t==='s'?strings[Number(raw)]:t==='inlineStr'?[...c.getElementsByTagName('t')].map(t=>t.textContent).join(''):t==='e'?raw:raw===undefined?null:t==='str'?raw:Number(raw);}rows[index]=values;}sheets[sheet.getAttribute('name')]=Array.from({length:rows.length},(_,i)=>rows[i]||[]);}
  return sheets;
 }
 return {empty,normalize,merge,readXlsx};
})();
