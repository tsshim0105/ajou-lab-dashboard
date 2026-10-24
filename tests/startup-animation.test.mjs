import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../startup.js',import.meta.url),'utf8');
function setup(){
 let load,decode,fonts;const raf=[],timers=new Map(),classes=new Set(),brand={style:{}},app={},calls=[];
 const ctx=new Proxy({}, {get:(o,k)=>k==='measureText'?()=>({width:100}):(...args)=>calls.push([k,...args]),set:()=>true});
 const canvas={isConnected:true,width:0,setAttribute(){},getContext:()=>ctx,remove(){this.isConnected=false;}};
 const logo={complete:true,naturalWidth:90,decode:()=>new Promise(r=>decode=r)};
 const splash={classList:{add:x=>classes.add(x)},querySelector:s=>s.includes('>img')?logo:brand,prepend(){},remove(){canvas.isConnected=false;}};
 const document={hidden:false,readyState:'loading',fonts:{ready:new Promise(r=>fonts=r)},documentElement:{dataset:{}},getElementById:()=>splash,querySelector:()=>app,createElement:()=>canvas};
 const sandbox={document,matchMedia:()=>({matches:false}),innerWidth:390,devicePixelRatio:2,requestAnimationFrame:f=>raf.push(f),addEventListener:(n,f)=>load=f,setTimeout:(f,ms)=>{timers.set(f,ms);return f},clearTimeout:f=>timers.delete(f)};
 vm.runInNewContext(source,sandbox);return {sandbox,document,raf,timers,brand,app,calls,classes,ready:()=>{load();decode();fonts();}};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('waits for initial data and all assets; first frame begins at zero even after a slow load',async()=>{
 const s=setup();assert.equal(s.raf.length,0);assert.equal(s.app.inert,true);
 s.sandbox.DashboardStartup.finish();await flush();assert.equal(s.raf.length,0);
 s.ready();await flush();assert.equal(s.raf.length,1);s.raf.shift()(9000);s.raf.shift()(9016);assert.equal(s.brand.style.opacity,'0');
 s.sandbox.DashboardStartup.finish();await flush();assert.equal(s.raf.length,1);
 // A hidden window cannot consume the reveal; resuming keeps the current frame.
 s.document.hidden=true;s.raf.shift()(19000);s.document.hidden=false;s.raf.shift()(29000);assert.equal(s.brand.style.opacity,'0');
 for(let i=1;i<=48;i++){if(s.raf.length)s.raf.shift()(29000+i*100);}
 assert.equal(s.app.inert,false);assert(s.classes.has('startup-leaving'));
});
test('network failure releases the UI without waiting indefinitely',()=>{const s=setup();for(const [f,ms] of s.timers)if(ms===20000)f();assert.equal(s.app.inert,false);});
test('brand is hidden by CSS before the first script runs',()=>{const css=readFileSync(new URL('../mobile.css',import.meta.url),'utf8');assert.match(css,/\.startup-splash \.startup-brand\{opacity:0;animation:none\}/);});
