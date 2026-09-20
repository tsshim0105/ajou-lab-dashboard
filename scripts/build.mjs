import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
export async function inline(){let html=await readFile(new URL('../index.html',import.meta.url),'utf8');for(const name of ['data.js','app.js']){const js=await readFile(new URL('../'+name,import.meta.url),'utf8');new vm.Script(js);html=html.replace(`<script src="${name}"></script>`,'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');}return html;}
const html=await inline();const worker=await readFile(new URL('../server/worker.mjs',import.meta.url),'utf8');
await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/server/index.js',import.meta.url),worker+'\nexport default createWorker('+JSON.stringify(html)+');\n');
try{const manifest=await readFile(new URL('../.openai/hosting.json',import.meta.url));await mkdir(new URL('../dist/.openai/',import.meta.url),{recursive:true});await writeFile(new URL('../dist/.openai/hosting.json',import.meta.url),manifest);}catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Built protected Worker. No private data embedded.');
