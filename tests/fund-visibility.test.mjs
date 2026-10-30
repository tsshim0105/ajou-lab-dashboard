import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,visible,applySharedData} from '../server/worker.mjs';
test('funds are private by default; only explicitly shared entries are returned',()=>{
 const d=fresh().data;d.funds=[{id:'private',months:[]},{id:'shared',title:'Shared',studentVisible:true,months:[],entries:[],sheet:'private-source'}];d.payroll=[{name:'secret'}];
 const student=visible(d,false);assert.deepEqual(student.funds.map(f=>f.id),['shared']);assert.equal(student.funds[0].sheet,undefined);assert.deepEqual(student.payroll,[]);assert.equal(visible(d,true),d);
 d.funds[1].studentVisible=false;assert.deepEqual(visible(d,false).funds,[]);
});
test('students cannot change or publish funds through shared saves',()=>{
 const d=fresh().data;d.funds=[{id:'f',title:'Shared',studentVisible:true,months:[],entries:[]}];
 const input=visible(d,false);assert.throws(()=>applySharedData(d,{...input,funds:[{...input.funds[0],title:'changed'}]}),/조회만/);
 assert.throws(()=>applySharedData(d,{...input,funds:[{id:'hidden',studentVisible:true}]}),/조회만/);
 assert.deepEqual(applySharedData(d,input).funds,d.funds);
});
