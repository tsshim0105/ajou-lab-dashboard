import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../notifications.js',import.meta.url),'utf8');
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
