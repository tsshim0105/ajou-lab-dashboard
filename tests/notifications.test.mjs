import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../notifications.js',import.meta.url),'utf8');
const api=vm.createContext({URL});vm.runInContext(source,api);
function fixture(permission='default',answer='granted'){
 const shown=[],updates=[],events=new Map();let requests=0,focused=false,assigned;
 class Notification{
  static permission=permission;
  static requestPermission(){requests++;return Promise.resolve(answer).then(value=>(this.permission=value));}
  constructor(title,options){this.title=title;this.options=options;shown.push(this);}
  close(){this.closed=true;}
 }
 const env={Notification,isSecureContext:true,URL,location:{href:'https://lab.example.test/',origin:'https://lab.example.test',assign:url=>assigned=url},focus:()=>focused=true,navigator:{},document:{addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const context=vm.createContext({URL});vm.runInContext(source,context);
 const controller=context.NISMLNotifications.createController(env,state=>updates.push(state));
 return {controller,env,Notification,shown,updates,events,get requests(){return requests;},get focused(){return focused;},get assigned(){return assigned;}};
}
test('no permission prompt or test notification during startup',()=>{
 const f=fixture();f.controller.start();assert.equal(f.requests,0);assert.equal(f.shown.length,0);assert.equal(f.updates.at(-1).label,'🔔 알림 허용');
});
test('permission gesture grants once and presents exact local test',async()=>{
 const f=fixture();const work=f.controller.enable();assert.equal(f.requests,1);assert.equal(f.controller.state().pending,true);await work;
 assert.equal(f.shown.length,1);assert.equal(f.shown[0].title,'NISML 연구실');assert.equal(f.shown[0].options.body,'연구실 알림 설정이 완료되었습니다.');assert.match(f.shown[0].options.icon,/^data:image\/png;base64,/);assert.equal(f.controller.state().label,'🔔 알림 켜짐');assert.equal(f.controller.state().pending,false);
});
test('duplicate clicks do not prompt twice or duplicate the completion notification',async()=>{
 const f=fixture();await Promise.all([f.controller.enable(),f.controller.enable()]);assert.equal(f.requests,1);assert.equal(f.shown.length,1);
});
test('granted state survives fresh controller and allows retest without request',async()=>{
 const f=fixture('granted');f.controller.start();assert.equal(f.controller.state().label,'🔔 알림 켜짐');assert.equal(f.shown.length,0);await f.controller.enable();assert.equal(f.requests,0);assert.equal(f.shown.length,1);
});
test('denial shows instructions and never requests again',async()=>{
 const f=fixture('default','denied');await f.controller.enable();await f.controller.enable();assert.equal(f.requests,1);assert.equal(f.shown.length,0);assert.equal(f.controller.state().label,'🔕 알림 차단됨');assert.equal(f.controller.state().message,'브라우저에서 NISML 대시보드의 알림 권한이 차단되어 있습니다. 브라우저 설정에서 알림을 허용해주세요.');
});
test('dismissal remains requestable and sends no notification',async()=>{
 const f=fixture('default','default');await f.controller.enable();assert.equal(f.controller.state().permission,'default');assert.equal(f.shown.length,0);assert.match(f.controller.state().message,/완료되지/);
});
test('insecure context and unavailable Notification are handled without exceptions',async()=>{
 for(const configure of [f=>f.env.isSecureContext=false,f=>delete f.env.Notification]){const f=fixture();configure(f);f.controller.start();await f.controller.enable();assert.equal(f.requests,0);assert.equal(f.controller.state().permission,'unsupported');}
});
test('failed request and unsupported constructor report retry help and release busy state',async()=>{
 const f=fixture();f.Notification.requestPermission=()=>Promise.reject(Error('request failed'));await f.controller.enable();assert.equal(f.controller.state().pending,false);assert.match(f.controller.state().message,/요청하지 못/);
 f.env.Notification=class {static permission='granted';static requestPermission(){}constructor(){throw Error('not supported');}};await f.controller.enable();assert.match(f.controller.state().message,/표시하지 못/);
});
test('permission changes outside the dashboard update on focus/visibility without prompting',()=>{
 const f=fixture('granted');f.controller.start();f.Notification.permission='denied';f.events.get('focus')();assert.equal(f.updates.at(-1).permission,'denied');f.Notification.permission='default';f.events.get('visibilitychange')();assert.equal(f.updates.at(-1).permission,'default');assert.equal(f.requests,0);f.controller.stop();assert.equal(f.events.size,0);
});
test('notification click focuses dashboard and external destinations are rejected',()=>{
 const f=fixture('granted');assert.equal(f.controller.show({body:'Test',target:'/'}),true);f.shown[0].onclick();assert.equal(f.focused,true);assert.equal(f.assigned,'https://lab.example.test/');assert.equal(f.shown[0].closed,true);assert.equal(f.controller.show({body:'Test',target:'https://other.example.test/'}),false);assert.equal(f.shown.length,1);
});

const record=(id,type='papers')=>({id,type,label:type==='papers'?'논문 수정':type==='conferences'?'학회 발표 등록':'학술대회 수정',title:'Research '+id,detail:'Public detail'});
function deliveryFixture(permission='granted',storage=new Map()){
 const f=fixture(permission),opened=[];
 f.env.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 const delivery=api.NISMLNotifications.createFeedDelivery(f.controller,'student@example.test',row=>opened.push(row),f.env);
 return {f,delivery,opened,storage};
}
test('first feed is silent, all research categories generate new alerts only once',async()=>{
 const {f,delivery,opened}=deliveryFixture();await delivery.observe([record('old')]);assert.equal(f.shown.length,0);
 const fresh=[record('paper'),record('poster','conferences'),record('meeting','meetingInfo'),record('private','funds'),record('old')];
 await delivery.observe(fresh);assert.equal(f.shown.length,3);assert.equal(f.requests,0);assert.equal(new Set(f.shown.map(n=>n.options.tag)).size,3);await delivery.observe(fresh);assert.equal(f.shown.length,3);
 const alert=f.shown.find(n=>n.options.body.includes('poster'));alert.onclick();assert.equal(opened[0].id,'poster');assert.equal(f.assigned,undefined);
});
test('denied events are not replayed on later permission grant or reload',async()=>{
 const {f,delivery}=deliveryFixture('denied');await delivery.observe([]);await delivery.observe([record('blocked')]);assert.equal(f.shown.length,0);f.Notification.permission='granted';await delivery.observe([record('blocked')]);assert.equal(f.shown.length,0);await delivery.observe([record('new'),record('blocked')]);assert.equal(f.shown.length,1);
 const reloaded=api.NISMLNotifications.createFeedDelivery(f.controller,'student@example.test',()=>{},f.env);await reloaded.observe([record('new'),record('blocked')]);assert.equal(f.shown.length,1);
});
test('large change batches generate one summary and open notification center',async()=>{
 const {f,delivery,opened}=deliveryFixture();await delivery.observe([]);const rows=Array.from({length:8},(_,i)=>record(String(i)));await delivery.observe(rows);assert.equal(f.shown.length,1);assert.match(f.shown[0].options.body,/8건/);f.shown[0].onclick();assert.equal(opened[0],null);await delivery.observe(rows);assert.equal(f.shown.length,1);
});
test('multiple tabs deduplicate using shared storage and lock; another computer still receives',async()=>{
 const storage=new Map(),a=deliveryFixture('granted',storage),b=deliveryFixture('granted',storage);let lockQueue=Promise.resolve();const locks={request:(key,fn)=>(lockQueue=lockQueue.then(fn))};a.f.env.navigator.locks=locks;b.f.env.navigator.locks=locks;
 await Promise.all([a.delivery.observe([]),b.delivery.observe([])]);await Promise.all([a.delivery.observe([record('one')]),b.delivery.observe([record('one')])]);assert.equal(a.f.shown.length+b.f.shown.length,1);
 const another=deliveryFixture();await another.delivery.observe([]);await another.delivery.observe([record('one')]);assert.equal(another.f.shown.length,1);
});
test('storage unavailable still deduplicates in this page without interrupting dashboard',async()=>{
 const {f,delivery}=deliveryFixture();f.env.localStorage={getItem:()=>{throw Error();},setItem:()=>{throw Error();}};await delivery.observe([]);await delivery.observe([record('one')]);await delivery.observe([record('one')]);assert.equal(f.shown.length,1);
});
