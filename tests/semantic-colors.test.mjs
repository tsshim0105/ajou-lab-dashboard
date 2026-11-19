import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../semantic-colors.css',import.meta.url),'utf8');
function palette(theme,dark){
 const values={};
 for(const [,selector,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  if(!body.includes('--ui-action:')&&!selector.trim().endsWith(':root'))continue;
  const t=selector.match(/data-hub-theme=([a-z]+)/)?.[1];
  if(t&&t!==theme||selector.includes('data-theme=dark')&&!dark)continue;
  for(const [,k,v] of body.matchAll(/(--ui-[\w-]+):([^;]+);?/g))values[k]=v.trim();
 }
 return values;
}
function luminance(hex){let s=hex.slice(1);if(s.length===3)s=[...s].map(x=>x+x).join('');return s.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for(const theme of ['aurora','pop','shinchan','baseball','orchestra'])for(const dark of [false,true])test(`${theme} ${dark?'dark':'light'} readable role pairs`,()=>{
 const p=palette(theme,dark);
 for(const [ink,bg] of [['on-action','action'],['text','surface'],['muted','surface'],['text','soft'],['muted','soft'],['link','surface'],['on-danger','danger'],['on-success','success'],['warning','warning-soft']]){
  const ratio=contrast(p['--ui-'+ink],p['--ui-'+bg]);assert.ok(ratio>=4.5,`${ink}/${bg}: ${ratio.toFixed(2)}`);
 }
});
test('all referenced UI roles exist and stylesheet avoids plot SVG/artwork styling',()=>{
 const declared=new Set([...css.matchAll(/(--ui-[\w-]+)\s*:/g)].map(m=>m[1]));
 for(const file of ['semantic-colors.css','mobile.css','index.html'])for(const m of readFileSync(new URL('../'+file,import.meta.url),'utf8').matchAll(/var\((--ui-[\w-]+)/g))assert.ok(declared.has(m[1]),m[1]);
 assert.doesNotMatch(css,/(?:fill|stroke|filter)\s*:/);
 assert.doesNotMatch(css,/\.(?:plot-preview|table-maker-preview|plot-palette|dashboard-logo)[^{]*\{/);
});
