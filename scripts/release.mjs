import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Persist the source revision so rebuilding identical code keeps its version.
export async function releaseInfo(){
 const root=new URL('../',import.meta.url),files=[];
 for(const dir of ['', 'server/', 'scripts/', 'assets/']){
  for(const entry of await readdir(new URL(dir,root),{withFileTypes:true})){
   if(entry.isFile()&&/\.(?:js|mjs|css|html|png|svg)$/.test(entry.name))files.push(dir+entry.name);
  }
 }
 const hash=createHash('sha256');
 for(const file of files.sort()){hash.update(file+'\0');hash.update(await readFile(new URL(file,root)));}
 const sourceHash=hash.digest('hex'),path=new URL('release.json',root);
 let previous=JSON.parse(await readFile(path,'utf8'));
 if(previous.sourceHash===sourceHash)return previous;
 const updatedAt=new Date().toISOString();
 const next={version:previous.version+1,updatedAt,sourceHash};
 await writeFile(path,JSON.stringify(next,null,2)+'\n');
 return next;
}
