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
 assert.equal(p.defaults.font,50);assert.equal(p.defaults.legendFont,15);
 const small=p.svg(data,{...p.defaults,font:12}),large=p.svg(data,{...p.defaults,font:60});
 for(const s of [small,large])assert.match(s,/<rect class="plot-axis-frame"[^>]+width="800" height="800"/);
 assert.match(large,/<g class="plot-legend-text" font-size="15" font-weight="400">/);
 const dimensions=s=>s.match(/<svg[^>]+width="([\d.]+)" height="([\d.]+)"/).slice(1).map(Number);
 assert.ok(dimensions(large)[0]>dimensions(small)[0]);assert.ok(dimensions(large)[1]>dimensions(small)[1]);
 assert.match(src,/c.width=img.naturalWidth\*2;c.height=img.naturalHeight\*2/);
});
