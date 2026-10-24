import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../public/dot-engine/',import.meta.url));
const manifest=JSON.parse(await readFile(join(root,'provenance.json'),'utf8'));
for(const file of manifest.currentFiles){
  const actual=createHash('sha256').update(await readFile(join(root,file.path))).digest('hex');
  if(actual!==file.sha256)throw new Error(`Character asset changed: ${file.path}`);
}
console.log(`Verified ${manifest.currentFiles.length} character assets against recorded SHA-256.`);
