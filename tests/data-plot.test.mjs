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
test('professor guard and student navigation exclusion',()=>{const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');assert.match(src,/if\(!admin\(\)\)return/);const allowed=app.match(/const allowed=menu.filter[^\n]+/)[0];assert.doesNotMatch(allowed,/dataPlot/);assert.match(app,/if\(tab!=='homepage'&&!admin\(\)/);});
test('closed frame with inward major and minor ticks on four sides',()=>{
 const s=p.svg(p.parse('0\t1\n1\t2'),p.defaults);
 assert.match(s,/<rect class="plot-axis-frame"/);
 const groups=[...s.matchAll(/<g class="plot-(major|minor)-ticks">(.*?)<\/g>/g)];
 assert.equal(groups.filter(g=>g[1]==='major').length,6);
 assert.equal(groups.filter(g=>g[1]==='minor').length,20);
 for(const [,kind,content] of groups){const lines=[...content.matchAll(/x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map(m=>m.slice(1).map(Number));assert.equal(lines.length,4);assert.ok(lines[0][3]<lines[0][1]);assert.ok(lines[1][3]>lines[1][1]);assert.ok(lines[2][2]>lines[2][0]);assert.ok(lines[3][2]<lines[3][0]);assert.equal(lines[0][1]-lines[0][3],kind==='major'?12:7);}
});
test('square default and CSP-compatible PNG conversion',()=>{assert.equal(p.defaults.width,p.defaults.height);assert.match(src,/const url=await dataURL\(new Blob\(\[snapshot\]/);assert.match(src,/action:'export',name,base64/);assert.match(src,/document.body.append\(a\)/);});
test('axis and legend fonts are independent; plot box dimensions never shrink',()=>{
 const data=p.parse('X\tSample\n0\t1\n1\t2');
 assert.equal(p.defaults.font,50);assert.equal(p.defaults.legendFont,40);
 const small=p.svg(data,{...p.defaults,font:12}),large=p.svg(data,{...p.defaults,font:60});
 for(const s of [small,large])assert.match(s,/<rect class="plot-axis-frame"[^>]+width="800" height="800"/);
 assert.match(large,/<g class="plot-legend-text" font-size="40" font-weight="400"/);
 const dimensions=s=>s.match(/<svg[^>]+width="([\d.]+)" height="([\d.]+)"/).slice(1).map(Number);
 assert.ok(dimensions(large)[0]>dimensions(small)[0]);assert.ok(dimensions(large)[1]>dimensions(small)[1]);
 assert.match(src,/c.width=img.naturalWidth\*2;c.height=img.naturalHeight\*2/);
});

test('default line-only mode omits markers and adapts QtiPlot without changing stored styles',()=>{const data=p.parse('0\t1\n1\t2'),settings={...p.defaults,series:[{shape:'circle',color:'#ff0000'}]};assert.equal(p.defaults.type,'lineonly');const svg=p.svg(data,settings);assert.match(svg,/stroke-linejoin="round"/);assert.doesNotMatch(svg,/<circle/);assert.match(p.svg(data,{...settings,type:'line'}),/<circle/);const native=p.nativeSettings(settings,1);assert.equal(native.type,'line');assert.equal(native.series[0].shape,'none');assert.equal(settings.series[0].shape,'circle');});

test('ratio presets keep exact inner-box proportions within size limits',()=>{for(const ratio of ['1:1','4:3','16:9','9:16'])for(const width of [400,800,2400]){const size=p.ratioSize(width,ratio),[w,h]=ratio.split(':').map(Number);assert.equal(size.width*h,size.height*w);assert.ok(size.width>=400&&size.width<=2400);assert.ok(size.height>=300&&size.height<=1800);const svg=p.svg(p.parse('0\t1\n1\t2'),{...p.defaults,...size});assert.match(svg,new RegExp('class="plot-axis-frame"[^>]+width="'+size.width+'" height="'+size.height+'"'));}assert.equal(p.ratioSize(800,'4:3').height,600);});
test('independent upper X and right Y axes exclude X2 from plotted series',()=>{
 const data={names:['Time','Signal','Temperature','Response'],x2Index:2,data:[[0,1,20,100],[1,3,40,300],[2,2,null,null],[null,null,80,500]]};
 assert.deepEqual(Array.from(p.seriesColumns(data),c=>c.col),[1,3]);
 const s=p.svg(data,{...p.defaults,xmin:0,xmax:2,ymin:0,ymax:4,x2min:20,x2max:80,y2min:100,y2max:500,x2Label:'Temperature',y2Label:'Response'});
 assert.match(s,/plot-secondary-axes/);assert.match(s,/data-axis="primary"/);assert.match(s,/data-axis="secondary"/);assert.match(s,/Temperature/);assert.match(s,/Response/);
 assert.equal((s.match(/class="plot-series-data"/g)||[]).length,2);assert.doesNotMatch(s,/NaN|Infinity/);
 assert.match(s,/<rect class="plot-axis-frame"[^>]*width="800" height="800"/);
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
 assert.equal(p.svg(data,p.defaults,undefined,true).replace(/<rect class="plot-legend-hitbox"[^>]*\/>/,''),p.svg(data,p.defaults));
 assert.doesNotMatch(p.svg(data,{...p.defaults,legendX:null}),/NaN/);
});

test('categorical bars are equally spaced, wider and safely labelled',()=>{const d=p.parse('Sample\tValue\nPristine\t10\nAA0\t20\n<A&>\t30');let g;const svg=p.svg(d,{type:'bar'},v=>g=v);assert.equal(g.xa,.5);assert.equal(g.xb,3.5);assert.match(svg,/&lt;A&amp;&gt;/);const bars=[...svg.matchAll(/<rect x="([^"]+)" y="[^"]+" width="([^"]+)" height="[^"]+" fill="#[^"]+"/g)].map(m=>[+m[1],+m[2]]);assert.equal(bars.length,3);assert.ok(bars[0][1]>40);assert.ok(Math.abs((bars[1][0]-bars[0][0])-(bars[2][0]-bars[1][0]))<1e-8);assert.throws(()=>p.svg(d,{type:'lineonly'}));assert.equal(d.data[0][0],'Pristine');});
test('X precision is uniform and preserves explicit trailing decimal places',()=>{const f=p.xFormat(-.5,5,'auto',['5.0']);assert.equal(f.format(5),'5.0');assert.equal(f.format(.6),'0.6');assert.equal(p.xFormat(0,5,'2').format(5),'5.00');assert.equal(p.xFormat(0,5,'auto',['5.00']).format(5),'5.00');assert.equal(p.xFormat(0,1e-8).scientific,true);});
test('palette presets and bar width settings remain compatible with saved formats',()=>{assert.ok(Object.keys(p.palettes).length>=3);assert.equal(p.normalize({}).barWidth,80);for(const palette of Object.keys(p.palettes)){const s=p.normalize({palette});assert.equal(p.colorAt(s,0),p.palettes[palette].colors[0]);}assert.equal(p.colorAt({...p.defaults,palette:'paper',series:[{color:'#123456'}]},0),'#123456');});
test('adopted palettes match approved first five colors and safely cycle by palette length',()=>{const expected={lancet:['#00468b','#ed0000','#42b540','#0099b4','#925e9f'],auroraJewel:['#3677a8','#45a69c','#8c72b5','#d77e9c','#d6aa54'],softBrewer:['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854']};for(const [palette,colors] of Object.entries(expected)){const s=p.normalize({palette});assert.deepEqual(Array.from({length:5},(_,i)=>p.colorAt(s,i)),colors);for(let i=0;i<12;i++)assert.match(p.colorAt(s,i),/^#[0-9a-f]{6}$/);assert.equal(p.colorAt(s,p.palettes[palette].colors.length),colors[0]);}for(const palette of ['gradientRed','gradientGreen','gradientBlue']){const s=p.normalize({palette}),light=p.palettes[palette].colors.map(c=>{const rgb=c.match(/[0-9a-f]{2}/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;});assert.ok(light.every((v,i)=>!i||v>light[i-1]));assert.equal(p.normalize(JSON.parse(JSON.stringify(s))).palette,palette);}});
