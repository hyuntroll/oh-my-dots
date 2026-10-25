import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../public/original/',import.meta.url)));
const manifest=JSON.parse(await readFile(resolve(root,'exact-assets.json'),'utf8'));
if(manifest.missing.length)throw Error('Original dependency closure has missing assets');
let bytes=0;
for(const file of manifest.files){
  const path=resolve(root,file.path);if(!path.startsWith(root+sep))throw Error('Invalid manifest path');
  const data=await readFile(path);const hash=createHash('sha256').update(data).digest('hex');
  if(hash!==file.sha256||data.length!==file.bytes)throw Error('Original bytes changed: '+file.path);
  bytes+=data.length;
}
console.log(`Verified ${manifest.files.length} exact original files (${bytes} bytes), source ${manifest.archiveSha256}.`);
