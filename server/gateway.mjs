// Server-to-server entrypoint. The credential never reaches the browser.
export async function gatewayRequest(req,env){
 if(new URL(req.url).pathname!=='/__nisml_gateway')return null;
 const reject=()=>new Response('Forbidden',{status:403,headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST'||!env.NISML_GATEWAY_SECRET||req.headers.get('Authorization')!=='Bearer '+env.NISML_GATEWAY_SECRET)return reject();
 let input;try{const raw=await req.text();if(raw.length>2500000)return reject();input=JSON.parse(raw);}catch{return reject();}
 if(!['GET','HEAD','PUT','POST','DELETE'].includes(input.method)||typeof input.path!=='string'||!/^\/(?:api\/[a-z/-]+|service-worker\.js|notification-icon\.png|index\.html|_mobile-preview)?(?:\?[^#]*)?$/.test(input.path)||typeof input.email!=='string'||!/^\S+@\S+\.\S+$/.test(input.email)||typeof input.id!=='string'||!input.id||input.id.length>300)return reject();
 if(!['https://nisml.ajou.ac.kr','https://nisml.tsshim.chatgpt.site'].includes(input.origin))return reject();
 const headers=new Headers({'oai-authenticated-user-email':input.email,'oai-authenticated-user-id':'homepage:'+input.id,'X-NISML-Mounted':'1'});
 const read=['GET','HEAD'].includes(input.method);
 if(!read){headers.set('Origin',input.origin);headers.set('Content-Type','application/json');headers.set('X-Lab-Request','1');if(typeof input.body!=='string')return reject();}
 return new Request(input.origin+input.path,{method:input.method,headers,...(!read?{body:input.body}:{})});
}
export function mountDashboardText(text){
 return text.replaceAll('/api/','/dashboard/api/').replaceAll('/service-worker.js','/dashboard/service-worker.js').replaceAll('/notification-icon.png','/dashboard/notification-icon.png').replaceAll("scope:'/'","scope:'/dashboard/'").replaceAll("new URL('/',self.location.origin)","new URL('/dashboard/',self.location.origin)").replaceAll('src="/"','src="/dashboard/"');
}
