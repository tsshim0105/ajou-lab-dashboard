import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../mobile.js',import.meta.url),'utf8');
function setup({scrollable=false,dialog=false}={}){
 const handlers={},timers=new Map();let seq=0;
 const animation=()=>({finished:Promise.resolve(),cancel(){}});
 const panel={addEventListener(){},style:{},clientWidth:1000,getBoundingClientRect:()=>({left:0,top:100,width:1000,height:500}),animate:animation,cloneNode:()=>({style:{},classList:{add(){}},removeAttribute(){},setAttribute(){},querySelectorAll:()=>[],animate:animation,remove(){}})};
 const body={append(){}},target={parentElement:body,scrollWidth:scrollable?2000:1000,clientWidth:1000,closest:s=>s==='main.app'?{}:null};
 const context=vm.createContext({document:{body,getElementById:id=>id==='panel'?panel:{value:'all'},addEventListener:(type,fn)=>handlers[type]=fn,querySelector:()=>dialog?{}:null,querySelectorAll:()=>['home','papers','conferences'].map(tab=>({dataset:{tab}}))},getComputedStyle:()=>({overflowX:scrollable?'auto':'visible'}),performance:{now:()=>100},matchMedia:()=>({matches:false}),innerWidth:1200,tab:'home',busy:false,render(){},setTimeout:(fn)=>{timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source,context);
 return {context,send(x,y=0,extra={}){let prevented=false;handlers.wheel({target,deltaX:x,deltaY:y,deltaMode:0,cancelable:true,preventDefault:()=>prevented=true,...extra});return prevented},idle(){[...timers.values()].forEach(fn=>fn());timers.clear();}};
}
test('trackpad advances one allowed tab and absorbs momentum',async()=>{const h=setup();assert.equal(h.send(55),true);h.send(55);assert.equal(h.context.tab,'papers');await new Promise(r=>setImmediate(r));h.send(150);assert.equal(h.context.tab,'papers');h.idle();h.send(-110);assert.equal(h.context.tab,'home');});
test('vertical scrolling, scrollable tables, dialogs and pinch zoom do not navigate',()=>{for(const options of [{scrollable:true},{dialog:true}]){const h=setup(options);assert.equal(h.send(130),false);assert.equal(h.context.tab,'home');}const h=setup();assert.equal(h.send(2,120),false);assert.equal(h.context.tab,'home');const zoom=setup();assert.equal(zoom.send(140,0,{ctrlKey:true}),false);assert.equal(zoom.context.tab,'home');});
test('short horizontal gesture resets without navigation and first tab has no wraparound',()=>{const h=setup();h.send(20);h.idle();assert.equal(h.context.tab,'home');const edge=setup();edge.send(-130);assert.equal(edge.context.tab,'home');});
