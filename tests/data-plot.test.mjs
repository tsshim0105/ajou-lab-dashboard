import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../data-plot.js',import.meta.url),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(src+';globalThis.plot=DataPlot;',ctx);const p=ctx.plot;
test('spreadsheet headers, missing values and scientific numbers',()=>{const r=p.parse('Time\tA\tB\n0\t1e-3\t\n1\t2\t3');assert.equal(r.names[1],'A');assert.equal(r.data[0][1],.001);assert.equal(r.data[0][2],null);});
test('invalid input is rejected rather than silently coerced',()=>{for(const x of ['x\ty\n0\tbad','x\ty\n\t1','x\ty\n1\t2\t3','x\ty\n0\t'])assert.throws(()=>p.parse(x));});
test('dimensions, line width, series style and safe labels exported',()=>{const r=p.parse('X\tA\n0\t1\n1\t2');const s=p.svg(r,{...p.defaults,width:1000,height:600,line:4,title:'<script>',series:[{color:'#dc2626',shape:'square'}]});assert.match(s,/<rect class="plot-axis-frame"[^>]+width="1000" height="600"/);assert.match(s,/stroke-width="4"/);assert.match(s,/#dc2626/);assert.match(s,/&lt;script&gt;/);assert.doesNotMatch(s,/<script>/);});
test('reject invalid ranges and sizes',()=>{const r=p.parse('0\t1\n1\t2');assert.throws(()=>p.svg(r,{...p.defaults,xmin:2,xmax:1}));assert.throws(()=>p.normalize({width:0}));});
test('approved student navigation exposes data generation in the requested order while payroll stays private',()=>{const app=readFileSync(new URL('../app.js',import.meta.url),'utf8'),menu=app.match(/const menu=([^\n]+);/)[1],filter=app.match(/const allowed=(menu.filter[^\n]+);/)[1];for(const isAdmin of [false,true]){const nav=vm.runInNewContext('const menu='+menu+';'+filter,{admin:()=>isAdmin,canManageHomepage:()=>false});const keys=Array.from(nav,v=>v[0]);assert.deepEqual(keys.slice(3,9),['dataPlot','reagents','papers','conferences','meetingInfo','funds']);assert.equal(keys.includes('payroll'),isAdmin);}assert.match(src,/if\(!user\?\.email&&!user\?\.id\)return/);assert.match(app,/!\['home','groupMeetings','researchRooms','dataPlot'/);});
test('closed frame with inward major and minor ticks on four sides',()=>{
 const s=p.svg(p.parse('0\t1\n1\t2'),p.defaults);
 assert.match(s,/<rect class="plot-axis-frame"/);
 const groups=[...s.matchAll(/<g class="plot-(major|minor)-ticks">(.*?)<\/g>/g)];
 assert.equal(groups.filter(g=>g[1]==='major').length,6);
 assert.equal(groups.filter(g=>g[1]==='minor').length,20);
 for(const [,kind,content] of groups){const lines=[...content.matchAll(/x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map(m=>m.slice(1).map(Number));assert.equal(lines.length,4);assert.ok(lines[0][3]<lines[0][1]);assert.ok(lines[1][3]>lines[1][1]);assert.ok(lines[2][2]>lines[2][0]);assert.ok(lines[3][2]<lines[3][0]);assert.equal(lines[0][1]-lines[0][3],kind==='major'?6:3.5);}
});
test('square default and CSP-compatible PNG conversion',()=>{assert.equal(p.defaults.width,p.defaults.height);assert.match(src,/const url=await dataURL\(new Blob\(\[snapshot\]/);assert.match(src,/action:'export',name,base64/);assert.match(src,/document.body.append\(a\)/);});
test('axis and legend fonts are independent; plot box dimensions never shrink',()=>{
 const data=p.parse('X\tSample\n0\t1\n1\t2');
 assert.equal(p.defaults.font,25);assert.equal(p.defaults.legendFont,20);
 const small=p.svg(data,{...p.defaults,font:12}),large=p.svg(data,{...p.defaults,font:60});
 for(const s of [small,large])assert.match(s,/<rect class="plot-axis-frame"[^>]+width="400" height="400"/);
 assert.match(large,/<g class="plot-legend-text" font-size="20" font-weight="400"/);
 const dimensions=s=>s.match(/<svg[^>]+width="([\d.]+)" height="([\d.]+)"/).slice(1).map(Number);
 assert.ok(dimensions(large)[0]>dimensions(small)[0]);assert.ok(dimensions(large)[1]>dimensions(small)[1]);
 assert.match(src,/c.width=img.naturalWidth\*2;c.height=img.naturalHeight\*2/);
});

test('default line-only mode omits markers and adapts QtiPlot without changing stored styles',()=>{const data=p.parse('0\t1\n1\t2'),settings={...p.defaults,series:[{shape:'circle',color:'#ff0000'}]};assert.equal(p.defaults.type,'lineonly');const svg=p.svg(data,settings);assert.match(svg,/stroke-linejoin="round"/);assert.doesNotMatch(svg,/<circle/);assert.match(p.svg(data,{...settings,type:'line'}),/<circle/);const native=p.nativeSettings(settings,1);assert.equal(native.type,'line');assert.equal(native.series[0].shape,'none');assert.equal(settings.series[0].shape,'circle');});

test('ratio presets keep exact inner-box proportions within size limits',()=>{for(const ratio of ['1:1','4:3','16:9','9:16'])for(const width of [400,800,2400]){const size=p.ratioSize(width,ratio),[w,h]=ratio.split(':').map(Number);assert.equal(size.width*h,size.height*w);assert.ok(size.width>=200&&size.width<=2400);assert.ok(size.height>=150&&size.height<=1800);const svg=p.svg(p.parse('0\t1\n1\t2'),{...p.defaults,...size});assert.match(svg,new RegExp('class="plot-axis-frame"[^>]+width="'+size.width+'" height="'+size.height+'"'));}assert.equal(p.ratioSize(800,'4:3').height,600);});
test('independent upper X and right Y axes exclude X2 from plotted series',()=>{
 const data={names:['Time','Signal','Temperature','Response'],x2Index:2,data:[[0,1,20,100],[1,3,40,300],[2,2,null,null],[null,null,80,500]]};
 assert.deepEqual(Array.from(p.seriesColumns(data),c=>c.col),[1,3]);
 const s=p.svg(data,{...p.defaults,xmin:0,xmax:2,ymin:0,ymax:4,x2min:20,x2max:80,y2min:100,y2max:500,x2Label:'Temperature',y2Label:'Response'});
 assert.match(s,/plot-secondary-axes/);assert.match(s,/data-axis="primary"/);assert.match(s,/data-axis="secondary"/);assert.match(s,/Temperature/);assert.match(s,/Response/);
 assert.equal((s.match(/class="plot-series-data"/g)||[]).length,2);assert.doesNotMatch(s,/NaN|Infinity/);
 assert.match(s,/<rect class="plot-axis-frame"[^>]*width="400" height="400"/);
 assert.throws(()=>p.svg(data,{...p.defaults,x2min:80,x2max:20}));
 for(const type of ['line','scatter','bar'])assert.doesNotMatch(p.svg(data,{...p.defaults,type}),/NaN|Infinity/);
 const saved=JSON.parse(JSON.stringify(data));assert.equal(p.svg(saved,p.defaults),p.svg(data,p.defaults));
});
test('legend positions survive export and resize with safe normalized coordinates',()=>{
 const data=p.parse('X\tA\tB\n0\t1\t2\n1\t2\t3');
 const get=s=>{const m=s.match(/class="plot-legend-text"[^>]*transform="translate\(([^,]+),([^\)]+)\)"[^>]*data-legend-max-x="([^"]+)" data-legend-max-y="([^"]+)"/);return m.slice(1).map(Number);};
 for(const width of [400,800,1600]){const [x,y,mx,my]=get(p.svg(data,{...p.defaults,width,legendX:.25,legendY:.75}));assert.equal(x,mx*.25);assert.equal(y,my*.75);}
 const [x,y,mx]=get(p.svg(data,{...p.defaults,legendX:2,legendY:-1}));assert.equal(x,mx);assert.equal(y,0);
 assert.equal(p.normalize({legendX:'invalid'}).legendX,null);
 assert.doesNotMatch(p.svg(data,p.defaults),/plot-legend-hitbox|fill="transparent"|pointer-events/);
 assert.match(p.svg(data,p.defaults,undefined,true),/class="plot-legend-hitbox"/);
 assert.equal(p.svg(data,p.defaults,undefined,true).replace(/<rect class="plot-legend-hitbox"[^>]*\/>/,'').replace(/ tabindex="0" aria-label="[^"]*"/g,'').replace(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="#ffffff" fill-opacity="0" pointer-events="all"\/>/g,''),p.svg(data,p.defaults));
 assert.doesNotMatch(p.svg(data,{...p.defaults,legendX:null}),/NaN/);
});

test('categorical bars are equally spaced, wider and safely labelled',()=>{const d=p.parse('Sample\tValue\nPristine\t10\nAA0\t20\n<A&>\t30');let g;const svg=p.svg(d,{type:'bar'},v=>g=v);assert.equal(g.xa,.5);assert.equal(g.xb,3.5);assert.match(svg,/&lt;A&amp;&gt;/);const bars=[...svg.matchAll(/<rect x="([^"]+)" y="[^"]+" width="([^"]+)" height="[^"]+" fill="#[^"]+"/g)].map(m=>[+m[1],+m[2]]);assert.equal(bars.length,3);assert.ok(bars[0][1]>40);assert.ok(Math.abs((bars[1][0]-bars[0][0])-(bars[2][0]-bars[1][0]))<1e-8);for(const type of ['lineonly','line','scatter']){let g;const line=p.svg(d,{type},v=>g=v);assert.equal(g.xa,.5);assert.equal(g.xb,3.5);assert.match(line,/text-anchor="middle">Pristine/);assert.doesNotMatch(line,/rotate\(-45\)/);}assert.equal(d.data[0][0],'Pristine');});
test('X precision is uniform and preserves explicit trailing decimal places',()=>{const f=p.xFormat(-.5,5,'auto',['5.0']);assert.equal(f.format(5),'5.0');assert.equal(f.format(.6),'0.6');assert.equal(p.xFormat(0,5,'2').format(5),'5.00');assert.equal(p.xFormat(0,5,'auto',['5.00']).format(5),'5.00');assert.equal(p.xFormat(0,1e-8).scientific,true);});
test('palette presets and bar width settings remain compatible with saved formats',()=>{assert.ok(Object.keys(p.palettes).length>=3);assert.equal(p.normalize({}).barWidth,80);for(const palette of Object.keys(p.palettes)){const s=p.normalize({palette});assert.equal(p.colorAt(s,0),p.palettes[palette].colors[0]);}assert.equal(p.colorAt({...p.defaults,palette:'paper',series:[{color:'#123456'}]},0),'#123456');});
test('adopted palettes match approved first five colors and safely cycle by palette length',()=>{const expected={lancet:['#00468b','#ed0000','#42b540','#0099b4','#925e9f'],auroraJewel:['#3677a8','#45a69c','#8c72b5','#d77e9c','#d6aa54'],softBrewer:['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854']};for(const [palette,colors] of Object.entries(expected)){const s=p.normalize({palette});assert.deepEqual(Array.from({length:5},(_,i)=>p.colorAt(s,i)),colors);for(let i=0;i<12;i++)assert.match(p.colorAt(s,i),/^#[0-9a-f]{6}$/);assert.equal(p.colorAt(s,p.palettes[palette].colors.length),colors[0]);}for(const palette of ['gradientRed','gradientGreen','gradientBlue']){const s=p.normalize({palette}),light=p.palettes[palette].colors.map(c=>{const rgb=c.match(/[0-9a-f]{2}/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;});assert.ok(light.every((v,i)=>!i||v>light[i-1]));assert.equal(p.normalize(JSON.parse(JSON.stringify(s))).palette,palette);}});

test('half-size defaults apply to every graph kind and ratio',()=>{assert.equal(p.defaults.width,400);assert.equal(p.defaults.height,400);assert.equal(p.defaults.line,1);assert.equal(p.defaults.marker,6);for(const type of ['lineonly','line','scatter','bar']){let g;const svg=p.svg(p.parse('0\t1\n1\t2'),{type},v=>g=v);assert.equal(g.pw,400);assert.equal(g.ph,400);assert.match(svg,/<rect class="plot-axis-frame"[^>]+stroke-width="2"/);}assert.equal(p.ratioSize(400,'16:9').height,225);});
test('hide legend preserves plotted data and layout while omitting preview and export legend',()=>{
 const input=p.parse('X\tSample A\n0\t1\n1\t2');let shown,hidden;
 const normal=p.svg(input,{},g=>shown=g);
 for(const interactive of [false,true]){const svg=p.svg(input,{hideLegend:true},g=>hidden=g,interactive);assert.doesNotMatch(svg,/plot-legend-text|plot-legend-hitbox|Sample A/);assert.match(svg,/plot-axis-frame/);assert.equal(hidden.W,shown.W);assert.equal(hidden.H,shown.H);}
 assert.match(normal,/plot-legend-text/);assert.equal(p.normalize({hideLegend:true}).hideLegend,true);
});
test('X and Y errors expand limits, skip blank errors and are not extra series',()=>{
 const input={names:['X','A','dX','dY'],data:[[1,10,.5,2],[2,15,null,3]],errors:{2:{axis:'x',target:1},3:{axis:'y',target:1}}};let g;
 const svg=p.svg(input,{},v=>g=v);assert.equal(p.seriesColumns(input).length,1);assert.equal((svg.match(/class="plot-error-bar"/g)||[]).length,3);assert.ok(g.xa<.5&&g.xb>2);assert.ok(g.ya<8&&g.yb>18);assert.doesNotMatch(svg,/>dX<|>dY</);
 assert.throws(()=>p.svg({...input,data:[[1,10,-1,2]]},{}),/0 이상/);assert.throws(()=>p.svg({...input,errors:{2:{axis:'y',target:1},3:{axis:'y',target:1}}},{}),/하나만/);
});
test('categorical Y errors and secondary-axis errors use their connected series',()=>{
 const input={names:['X','A','X2','B','dA','dB'],x2Index:2,data:[['one',10,100,1000,2,100],['two',20,200,2000,null,200]],errors:{4:{axis:'y',target:1},5:{axis:'y',target:3}}};let g;const svg=p.svg(input,{},v=>g=v);assert.equal((svg.match(/class="plot-error-bar"/g)||[]).length,3);assert.ok(g.y2b>2200);assert.ok(g.yb>20);assert.throws(()=>p.svg({...input,errors:{4:{axis:'x',target:1}}},{}),/문자 X축/);
});
test('grouped bar errors sit at bar centers and use adjustable caps and widths',()=>{
 const input={names:['X','A','B','dA'],data:[[1,10,20,2],[2,15,25,3]],errors:{3:{axis:'y',target:1}}};const svg=p.svg(input,{type:'bar',errorWidth:3,errorCap:12});const bar=svg.match(/<rect x="([^"]+)" y="[^"]+" width="([^"]+)" height="[^"]+" fill="#2563eb"/);const err=svg.match(/class="plot-error-bar"[^>]*><line x1="([^"]+)"/);assert.ok(Math.abs(+bar[1]+(+bar[2])/2-(+err[1]))<1e-8);assert.match(svg,/stroke-width="3"/);
});
test('sheet paste retains error mapping and primary errors may follow the second axis',()=>{
 const c=vm.createContext({structuredClone});vm.runInContext(src+';globalThis.sheet=PlotSheet;',c);
 const sheet={names:['X','A','X2','B','dA'],x2Index:2,errors:{4:{axis:'y',target:1}},cells:[['1','10','','','2'],['2','20','100','50','3']]};
 const next=c.sheet.apply(sheet,'4\n5',0,4);assert.equal(next.errors[4].target,1);const parsed=c.sheet.parsed(next);assert.equal(parsed.data[0][4],4);assert.equal(parsed.data[0][2],null);assert.equal(parsed.errors[4].axis,'y');
});

 test('independent logarithmic axes map decades equally and preserve linear defaults',()=>{
 assert.equal(p.normalize({}).xScale,'linear'); assert.equal(p.normalize({}).yScale,'linear');
 for(const xScale of ['linear','log'])for(const yScale of ['linear','log']){
 let g; const svg=p.svg(p.parse('X\tA\n1\t1\n10\t10\n100\t100'),{xScale,yScale,xmin:1,xmax:100,ymin:1,ymax:100},v=>g=v);
 assert.doesNotMatch(svg,/NaN|Infinity/);assert.ok(g);
 assert.equal(p.fraction(10,1,100,'log'),.5);assert.equal(p.valueAt(.5,1,100,'log'),10);
 }
 const ticks=Array.from(p.logTicks(1,100));assert.deepEqual(ticks.filter(t=>t.major).map(t=>t.v),[1,10,100]);assert.ok(ticks.some(t=>t.v===2&&!t.major));
 });
 test('log axes reject zero, negative values, categorical X and error bars crossing zero',()=>{
 for(const scale of ['x','y'])assert.throws(()=>p.svg(p.parse('0\t0\n1\t1'),{[scale+'Scale']:'log'}),/0보다/);
 assert.throws(()=>p.svg(p.parse('A\t2\nB\t3'),{xScale:'log'}),/문자/);
 assert.throws(()=>p.svg({names:['X','Y','err'],data:[[1,1,2]],errors:{2:{axis:'y',target:1}}},{yScale:'log'}),/0보다/);
 assert.throws(()=>p.svg(p.parse('1\t2\n3\t4'),{xScale:'log',xmin:0}),/0보다/);
 });
 test('logarithmic dual axes, bars and positive error bars remain finite',()=>{
 const d={names:['X','A','err','X2','B'],x2Index:3,errors:{2:{axis:'x',target:1}},data:[[1,2,.1,10,20],[10,20,1,100,200]]};
 for(const type of ['lineonly','line','scatter','bar'])assert.doesNotMatch(p.svg(d,{type,xScale:'log',yScale:'log'}),/NaN|Infinity/);
 });

test('hollow markers retain colored outlines and paint after lines and errors',()=>{
 const d=p.parse('1\t2\n2\t4');for(const shape of ['circle','square','triangle','diamond']){const svg=p.svg(d,{type:'line',series:[{shape,fill:'hollow',color:'#ff0000'}]});assert.match(svg,/fill="#ffffff" stroke="#ff0000"/);assert.ok(svg.indexOf('class="plot-markers"')>svg.indexOf('stroke-linejoin="round"'));}
 assert.equal(p.normalize({series:[{}]}).series[0].fill,'fill');
});
test('axis title positions preserve canvas proportions and rotation for all axes',()=>{
 const d={names:['X','Y','X2','Y2'],x2Index:2,data:[[1,2,3,4],[2,3,4,5]]};const pos={x:{x:.5,y:.8},y:{x:.2,y:.5},x2:{x:.6,y:.15},y2:{x:.8,y:.4}};
 for(const width of [400,800]){let g;const svg=p.svg(d,{width,titlePositions:pos},v=>g=v);for(const k of Object.keys(pos)){assert.ok(Math.abs(g.titleGeometry[k].x-pos[k].x*g.W)<1e-8);assert.ok(Math.abs(g.titleGeometry[k].y-pos[k].y*g.H)<1e-8);}assert.equal(g.titleGeometry.y.angle,-90);assert.equal(g.titleGeometry.y2.angle,90);assert.doesNotMatch(svg,/tabindex|pointer-events/);}
});

test('three directional triangle markers support filled and hollow in data and legend',()=>{for(const shape of ['triangleDown','triangleLeft','triangleRight'])for(const fill of ['fill','hollow']){const svg=p.svg(p.parse('1\t2\n2\t3'),{type:'scatter',series:[{shape,fill,color:'#123456'}]});assert.equal((svg.match(/<polygon /g)||[]).length,3);assert.match(svg,new RegExp('fill="'+(fill==='hollow'?'#ffffff':'#123456')+'" stroke="#123456"'));}});
