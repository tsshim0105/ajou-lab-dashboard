import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../hub-workspace.js',import.meta.url),'utf8');
const grid=vm.runInNewContext(source.slice(0,source.indexOf('/* Professor workspace'))+';HubWidgetGrid');
const initial=[{id:'a',x:0,y:0,w:6,h:4},{id:'b',x:6,y:0,w:6,h:4},{id:'c',x:0,y:4,w:6,h:4},{id:'d',x:6,y:4,w:6,h:4}];
const plain=x=>JSON.parse(JSON.stringify(x));
test('free placement preserves blank cells and leaves other widgets unchanged',()=>{const result=plain(grid.place(initial,'a',{...initial[0],x:3,y:10}));assert.deepEqual(result[0],{id:'a',x:3,y:10,w:6,h:4});assert.deepEqual(result.slice(1),initial.slice(1));assert.equal(initial[0].y,0);});
test('dropping into an occupied cell resolves cascading overlaps without hiding widgets',()=>{const result=grid.place(initial,'a',{...initial[0],x:6});assert.equal(result.length,4);assert.equal(result[1].y,4);assert.equal(result[3].y,8);result.forEach((a,i)=>result.slice(i+1).forEach(b=>assert.equal(grid.overlaps(a,b),false)));});
test('resizing only displaces intersecting widgets',()=>{const result=grid.place(initial,'a',{...initial[0],h:6});assert.equal(result[2].y,6);assert.equal(result[1].y,0);assert.equal(result[3].y,4);});

test('compact cards close unused height but preserve deliberately empty grid rows',()=>{const items=[{id:'a',x:0,y:0,w:6,h:3},{id:'b',x:6,y:0,w:6,h:3},{id:'c',x:0,y:3,w:12,h:4},{id:'d',x:0,y:8,w:12,h:3}];const r=grid.compact(items,60,{a:100,b:110,c:180});assert.equal(r[2].top,110);assert.equal(r[3].top,350);assert.equal(r[3].height,180);assert.equal(items[2].y,3);});
