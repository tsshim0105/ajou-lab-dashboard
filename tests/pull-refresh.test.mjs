import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../mobile.js',import.meta.url),'utf8');
function setup({top=0,nested=0,blocked=false}={}){
 const handlers={},animation={finished:Promise.resolve(),cancel(){}};let refreshes=0;
 const indicator={style:{},classList:{toggle(){}},setAttribute(){}};
 const panel={addEventListener(){},contains:()=>true,scrollTop:top,style:{},offsetTop:100,parentElement:{append(){}},animate:()=>animation};
 const target={scrollTop:nested,parentElement:panel,closest:()=>null};
 const context=vm.createContext({document:{getElementById:id=>id==='panel'?panel:{},createElement:()=>indicator,addEventListener:(type,fn)=>handlers[type]=fn,querySelector:()=>blocked?{}:null,querySelectorAll:()=>[]},performance:{now:()=>100},matchMedia:q=>({matches:q.includes('max-width')}),tab:'home',busy:false,setTimeout,clearTimeout,refreshDashboardFromPull:async()=>{refreshes++;}});
 vm.runInContext(source,context);
 const touch=(type,x,y)=>{let prevented=false;handlers[type]({target,touches:[{clientX:x,clientY:y}],cancelable:true,preventDefault(){prevented=true;}});return prevented;};
 return {context,panel,indicator,touch,end:()=>handlers.touchend(),cancel:()=>handlers.touchcancel(),get refreshes(){return refreshes;}};
}
const settled=()=>new Promise(r=>setImmediate(r));
test('pull from top refreshes once and springs back',async()=>{const h=setup();h.touch('touchstart',0,0);assert.equal(h.touch('touchmove',2,180),true);h.end();h.end();await settled();assert.equal(h.refreshes,1);assert.equal(h.panel.style.transform,'');assert.equal(h.indicator.hidden,true);assert.equal(h.context.busy,false);});
test('short or cancelled pull never refreshes',async()=>{for(const cancel of [false,true]){const h=setup();h.touch('touchstart',0,0);h.touch('touchmove',0,cancel?200:50);cancel?h.cancel():h.end();await settled();assert.equal(h.refreshes,0);}});
test('scrolled panels, nested scrollers, dialogs and upward scrolling retain native behavior',async()=>{for(const options of [{top:30},{nested:30},{blocked:true}]){const h=setup(options);h.touch('touchstart',0,0);assert.equal(h.touch('touchmove',0,180),false);h.end();await settled();assert.equal(h.refreshes,0);}const h=setup();h.touch('touchstart',0,100);assert.equal(h.touch('touchmove',0,30),false);h.end();await settled();assert.equal(h.refreshes,0);});
