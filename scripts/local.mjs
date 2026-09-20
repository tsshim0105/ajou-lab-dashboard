import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createWorker,fresh} from '../server/worker.mjs';
import {inline} from './build.mjs';
const OWNER='local@example.test';
const dir=new URL('../private/',import.meta.url),file=new URL('local-state.json',dir);await mkdir(dir,{recursive:true});
let row;try{row=JSON.parse(await readFile(file,'utf8'));}catch{const state=fresh();try{state.data=JSON.parse(await readFile(new URL('seed.json',dir),'utf8'));}catch{}row={version:0,payload:JSON.stringify(state)};}
const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return {...row};},async run(){if(sql.startsWith('UPDATE')){if(row.version!==this.args[1])return {meta:{changes:0}};row={version:row.version+1,payload:this.args[0]};await writeFile(file,JSON.stringify(row));return {meta:{changes:1}};}return {meta:{changes:0}};}};}};
const worker=createWorker(await inline()),port=4173;
http.createServer(async(req,res)=>{try{if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end('Local host only');return;}const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-owner');headers.set('oai-authenticated-user-email',OWNER);const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>2500000){res.writeHead(413);res.end();return;}chunks.push(c);}const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const result=await worker.fetch(request,{DB:db,ADMIN_EMAIL:OWNER});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500);res.end('Local preview error');}}).listen(port,'127.0.0.1',()=>console.log(`Local owner workspace: http://127.0.0.1:${port} (localhost only; not a shared login service)`));
