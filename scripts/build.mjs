import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
const iconBytes=await readFile(new URL('../assets/notification-icon.png',import.meta.url));
const notificationIcon='data:image/png;base64,'+iconBytes.toString('base64');
export async function inline(){let html=await readFile(new URL('../index.html',import.meta.url),'utf8');for(const name of ['data.js','conference-info.js','web-push-client.js','notifications.js','app.js']){const js=await readFile(new URL('../'+name,import.meta.url),'utf8');new vm.Script(js);const compiled=js.replace('__NISML_ICON__',notificationIcon);html=html.replace(`<script src="${name}"></script>`,'<script>'+compiled.replace(/<\/script/gi,'<\\/script')+'</script>');}return html;}
const meetingEvents=vm.runInNewContext((await readFile(new URL('../conference-info.js',import.meta.url),'utf8'))+';ConferenceInfo.events');
const html=await inline();const pushCode=await readFile(new URL('../server/web-push.mjs',import.meta.url),'utf8');const sw=(await readFile(new URL('../service-worker.js',import.meta.url),'utf8')).replace("icon:'/notification-icon.png'",'icon:'+JSON.stringify(notificationIcon));const worker=await readFile(new URL('../server/worker.mjs',import.meta.url),'utf8');
await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/server/index.js',import.meta.url),pushCode+'\n'+worker.replace(/^import[^\n]+web-push\.mjs';\n/,'')+'\nexport default createWorker('+JSON.stringify(html)+','+JSON.stringify(meetingEvents)+','+JSON.stringify(sw)+','+JSON.stringify(iconBytes.toString('base64'))+');\n');
try{const manifest=await readFile(new URL('../.openai/hosting.json',import.meta.url));await mkdir(new URL('../dist/.openai/',import.meta.url),{recursive:true});await writeFile(new URL('../dist/.openai/hosting.json',import.meta.url),manifest);}catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Built protected Worker. No private data embedded.');
