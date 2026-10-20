import {env} from 'cloudflare:workers';
import seed from '../dashboard/conference-seed.json';
import {readConferenceCatalog,writeConferenceCatalog} from '../dashboard/conference-updates.mjs';
export const dynamic='force-dynamic';
const tools=[{name:'read_conference_catalog',description:'Read currently registered research-lab academic conferences and version for official-source updates. Owner only.',inputSchema:{type:'object',properties:{}}},{name:'update_conference_catalog',description:'Persist official-source-verified conference additions and changes, checked dates, per-card updated badges, and shared dashboard alerts. Supply full public fields of changed events only; checkedIds lists successfully verified events. Preserves unrelated and private records. Owner only.',inputSchema:{type:'object',properties:{version:{type:'integer'},events:{type:'array',items:{type:'object',properties:{id:{type:'string'},society:{type:'string'},group:{type:'string',enum:['domestic','international']},name:{type:'string'},url:{type:'string'},start:{type:['string','null']},end:{type:['string','null']},venue:{type:'string'},abstracts:{type:'array',items:{type:'object'}},registration:{type:'array',items:{type:'object'}},note:{type:'string'},sources:{type:'array',items:{type:'string'}}},required:['id','society','group','name','url','start','end','venue','abstracts','registration','note','sources']}},checkedIds:{type:'array',items:{type:'string'}}},required:['version','events','checkedIds']}}];
export async function POST(req:Request){
 if(req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase()!=='tsshim@ajou.ac.kr'||!req.headers.get('oai-authenticated-user-id'))return Response.json({error:'Owner access required'},{status:403});
 let body:any;try{const raw=await req.text();if(raw.length>300000)throw Error('Request too large');body=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 const reply=(result:any)=>Response.json({jsonrpc:'2.0',id:body.id??null,result},{headers:{'Cache-Control':'no-store'}});
 if(body.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(body.method==='initialize')return reply({protocolVersion:'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'NISML conferences',version:'1.0.0'}});
 if(body.method==='tools/list')return reply({tools});
 if(body.method==='tools/call'){try{let result;const name=body.params?.name;if(name==='read_conference_catalog')result=await readConferenceCatalog(env.DB,seed);else if(name==='update_conference_catalog')result=await writeConferenceCatalog(env.DB,seed,body.params.arguments);else throw Error('Unknown tool');return reply({content:[{type:'text',text:JSON.stringify(result)}]});}catch(e:any){return reply({isError:true,content:[{type:'text',text:e.message}]});}}
 return Response.json({jsonrpc:'2.0',id:body.id??null,error:{code:-32601,message:'Method not found'}});
}
