// Temporary, service-authenticated migration endpoint. Never accepts browser identity as authorization.
export async function migrationRequest(req,env){
 if(new URL(req.url).pathname!=='/__nisml_migration')return null;
 const headers={'Cache-Control':'private, no-store','Content-Type':'application/json'};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method!=='POST'||!env.NISML_GATEWAY_SECRET||req.headers.get('Authorization')!=='Bearer '+env.NISML_GATEWAY_SECRET)return reply({error:'Forbidden'},403);
 const input=await req.json();if(!['inspect','cutover'].includes(input.action))return reply({error:'Invalid action'},400);
 let row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();if(!row)return reply({error:'Missing source state'},409);
 if(input.action==='cutover'){
  const state=JSON.parse(row.payload);if(state.migrationTarget&&state.migrationTarget!=='https://nisml.ajou.ac.kr')return reply({error:'Unexpected target'},409);
  if(!state.migrationTarget){state.migrationTarget='https://nisml.ajou.ac.kr';state.migrationAt=new Date().toISOString();const result=await env.DB.prepare('UPDATE lab_state SET payload=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),row.version).run();if(!result.meta?.changes)return reply({error:'Concurrent update; retry'},409);row=await env.DB.prepare('SELECT version,payload FROM lab_state WHERE id=1').first();}
 }
 const config={};for(const k of ['ADMIN_EMAIL','LAB_LEAD_AUTHOR','LAB_MEMBER_AUTHORS','WEB_PUSH_PUBLIC_KEY','WEB_PUSH_PRIVATE_KEY','WEB_PUSH_SUBJECT'])if(env[k])config[k]=env[k];
 const subscriptions=(await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results||[];
 const delivery=(await env.DB.prepare('SELECT * FROM push_delivery').all()).results||[];
 return reply({schema:1,row,subscriptions,delivery,config});
}
