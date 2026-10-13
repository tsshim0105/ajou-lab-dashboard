import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('mobile menu boot order works and management routes retain role separation',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),mobile=await readFile(new URL('../mobile.js',import.meta.url),'utf8');
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',style:{setProperty(){}},classList:{toggle(){}},querySelectorAll(){return [];}});return elements.get(id);};
 const context=vm.createContext({document:{getElementById:element},LabData:{empty:()=>({})},structuredClone});
 vm.runInContext(mobile,context);vm.runInContext(app.slice(0,app.indexOf('function years()')),context);
 vm.runInContext('nav()',context);let html=element('tabs').innerHTML;assert.ok(html.includes('data-tab="reagents"'));assert.ok(html.includes('data-tab="settings"'));assert.ok(!html.includes('data-tab="funds"'));assert.ok(!html.includes('data-tab="more"'));
 vm.runInContext("user={role:'admin'};nav()",context);html=element('tabs').innerHTML;assert.ok(html.includes('data-tab="funds"'));assert.ok(html.includes('data-tab="settings"'));assert.ok(!html.includes('data-tab="more"'));assert.ok(html.includes('aria-label="학술대회 정보"'));
 vm.runInContext('studentPreview=true;nav()',context);assert.ok(!element('tabs').innerHTML.includes('data-tab="funds"'));
});
