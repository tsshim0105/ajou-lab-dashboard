import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../research-room.js',import.meta.url),'utf8');
function cropContext(extra={}){const c=vm.createContext(extra);vm.runInContext(source.slice(source.indexOf('function rrCoverCropRect(')),c);return c;}
test('wide and portrait crops fill the card ratio without exposing empty edges',()=>{
 const c=cropContext();for(const [width,height] of [[1600,900],[600,1600],[40,40]])for(const ratio of [1.5,2.7,5])for(const zoom of [1,2,4])for(const x of [-1,0,.5,1,2]){
 c.args={width,height,ratio,zoom,x,y:x};const r=vm.runInContext('rrCoverCropRect(args.width,args.height,args)',c);
 assert.ok(r.sx>=0&&r.sy>=0);assert.ok(r.sx+r.sw<=width+.0001&&r.sy+r.sh<=height+.0001);assert.ok(Math.abs(r.sw/r.sh-ratio)<.00001);
 }
});
test('export uses the selected source rectangle and requested card aspect',()=>{
 const calls=[],c=cropContext(),ctx={fillRect(){},drawImage(...args){calls.push(args)}};c.canvas={getContext:()=>ctx};c.bitmap={width:1600,height:900};
 vm.runInContext('rrDrawCover(canvas,bitmap,{zoom:2,x:1,y:0,ratio:2})',c);assert.equal(c.canvas.width,640);assert.equal(c.canvas.height,320);assert.deepEqual(calls[0].slice(1),[800,0,800,400,0,0,640,320]);
});
test('cover conversion preserves server size limit and releases decoded source on failure',async()=>{
 let closed=false;const canvas={getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'x'.repeat(90000)};
 const c=cropContext({document:{createElement:()=>canvas},createImageBitmap:async()=>({width:100,height:100,close(){closed=true;}})});
 await assert.rejects(vm.runInContext("rrPrepareCover({type:'image/jpeg',size:100},{ratio:2})",c),/복잡/);assert.equal(closed,true);
 await assert.rejects(vm.runInContext("rrPrepareCover({type:'image/svg+xml',size:100})",c),/JPG/);
});
