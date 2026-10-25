#!/usr/bin/env node
/** Preserve a bounded Dots renderer dependency closure as exact shipped bytes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function dependency(name){
  try{return require(name);}catch(error){
    throw Error(`Run npm ci before the extractor; the pinned ${name} dependency is required.`,{cause:error});
  }
}
const asar=dependency('@electron/asar'),parser=dependency('@babel/parser');
const archive=process.argv[2]||'/Applications/ChatGPT.app/Contents/Resources/app.asar';
const out=path.resolve(process.argv[3]||path.join(repo,'public','original'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const archiveHash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(archive))archiveHash.update(chunk);
const all=asar.listPackage(archive).map(p=>p.replace(/^\//,'')),set=new Set(all),assets=all.filter(p=>p.startsWith('webview/assets/'));
const resolve=(p,ref)=>ref.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(p),ref)):null;
function uniqueAsset(prefix){const matches=assets.filter(p=>path.posix.basename(p).startsWith(prefix)&&p.endsWith('.js'));if(matches.length!==1)throw Error(`Expected one ${prefix} JS asset; found ${matches.join(', ')}`);return matches[0];}
const rootPrefixes=['side-panel-','aeon-onboarding-','aeon-appearance-picker-','room-view-','dot-onboarding-ring-','dot-onboarding-flight-','orbit-conversation-route-','page-a0db2051c101','rpc-94f5a75e4b1f','index-40a03cbe11dc','index.client-17f4cd7252fb','app-main-246745df4c14','ko-KR-8a007bddadf3','ko-968eacb21091','realtime-voice-launch-surface-476127c4991a','panel-61683d263c1a','open-file-ea7bd5664e81','text-document-preview-b7c6cb8e32f5','profile-dropdown-items-92ce6aadc70e','settings-page-20e2bed110da','skills-page-b946c71dd768','general-settings-ac26e93f0ea2','appearance-settings-90f8e813006c','account-settings-6840b590b4f0','personalization-settings-c24ed4573607','plugins-settings-94cd739d6862','keyboard-shortcuts-settings-5dc755c08827','page-9a126919fe29'];
// Some public components have an initializing wrapper plus an implementation chunk.
const roots=rootPrefixes.flatMap(prefix=>assets.filter(p=>path.posix.basename(p).startsWith(prefix)&&p.endsWith('.js')));
roots.push('webview/assets/page-af6278188bd3.css');
roots.push('webview/assets/o-soft-gradient-gray-ed947018774a.png');
if(roots.length<7)throw Error('Dots root discovery incomplete; archive layout changed.');
const globals=/\/app-(?:shared|initial|primary|main)-[^/]+\.js$/;
const queue=[...roots,...all.filter(p=>/^webview\/assets\/app-(shared|initial|primary)-[^/]+\.css$/.test(p)),...all.filter(p=>/^webview\/assets\/OpenAI(?:Sans|Serif)-[^/]+\.woff2$/.test(p)), 'webview/index.html','webview/detached-window.html'];
// This is the one named native character runtime directory, not an all-ASAR extraction.
queue.push(...all.filter(p=>/^webview\/assets\/orbit-character-[^/]+\//.test(p)));
const selected=new Map(),missing=[],edges=[];
let classCssExpanded=false;
const classPattern=()=>/_[A-Za-z][A-Za-z0-9_]*_[a-z0-9]{3,}_\d+/g;
while(queue.length || !classCssExpanded){
 if(!queue.length){
  classCssExpanded=true;
  const classes=new Map();
  for(const [source,b]of selected){if(!/\.m?js$/.test(source)||globals.test(source)||source.includes('/orbit-character-'))continue;for(const m of b.toString().matchAll(classPattern())){if(!classes.has(m[0]))classes.set(m[0],source);}}
  // CSS modules are sometimes linked only by a parent Vite preload table. Match
  // exact generated class identities in selected UI JS to original CSS rules.
  for(const css of assets.filter(p=>p.endsWith('.css'))){if(selected.has(css))continue;const s=asar.extractFile(archive,css).toString();let matching;
   for(const m of s.matchAll(classPattern()))if(classes.has(m[0])){matching=m[0];break;}
   if(matching){edges.push({from:classes.get(matching),to:css,kind:'css-module-class-identity',className:matching});queue.push(css);}
  }
  if(!queue.length)break;
 }
const p=queue.shift();if(selected.has(p))continue;if(!set.has(p)){missing.push(p);continue;}if(!p.startsWith('webview/'))throw Error(`Refusing resource outside renderer: ${p}`);
 if(asar.statFile(archive,p,false).files)continue;
 const b=asar.extractFile(archive,p);selected.set(p,b);
 if(selected.size>2500||[...selected.values()].reduce((n,b)=>n+b.length,0)>200*1024*1024)throw Error(`Dependency scope exceeded bounded 2500-file/200MiB limit at ${p}: ${selected.size} files/${[...selected.values()].reduce((n,b)=>n+b.length,0)} bytes; no extraction written.`);
 const refs=[];if(/\.m?js$/.test(p)&&!p.includes('/orbit-character-')){
  const s=b.toString(),ast=parser.parse(s,{sourceType:'module',errorRecovery:true,createImportExpressions:true});
  for(const declaration of ast.program.body)if((declaration.type==='ImportDeclaration'||declaration.type==='ExportNamedDeclaration'||declaration.type==='ExportAllDeclaration')&&declaration.source){const q=resolve(p,declaration.source.value);if(q)refs.push([q,'static-import']);}
  if((roots.includes(p)&&!globals.test(p))||/\/(?:editor-lazy|appearance-edit-badge|appearance-picker-button|native-room|tab)-[^/]+\.js$/.test(p)){
   for(const m of s.matchAll(/\bimport\(["'`]([^"'`]+)["'`]\)/g)){const q=resolve(p,m[1]);if(q)refs.push([q,'literal-dynamic-import']);}
   const header=s.match(/^const __vite__mapDeps=[\s\S]*?\n/);if(header)for(const m of header[0].matchAll(/["'](\.\/[^"']+)["']/g)){const q=resolve(p,m[1]);if(q)refs.push([q,'vite-preload-candidate']);}
  }
  // Vite also emits new URL(`image-hash.png`, import.meta.url) with no ./.
  // Inspect only literal local resource strings in the selected JS closure;
  // remote/data URLs, templates with expressions and unknown archive paths
  // never expand this bounded dependency graph.
  for(const m of s.matchAll(/["'`]((?:\.\/|\.\.\/)?[A-Za-z0-9_./-]{1,220}\.(?:svg|png|jpe?g|webp|gif|avif|woff2?|ttf|otf|wasm|data|mjs|mp4|webm))["'`]/g)){
   const ref=m[1];if(ref.startsWith('/')||ref.split('/').includes('..')&&!ref.startsWith('../'))continue;
   const q=resolve(p,ref.startsWith('.')?ref:'./'+ref);if(q&&set.has(q))refs.push([q,'literal-resource']);
  }
 } else if(p.endsWith('.css')) {for(const m of b.toString().matchAll(/url\(\s*["']?([^\)"']+)["']?\s*\)/g)){const q=resolve(p,m[1]);if(q)refs.push([q,'css-url']);}}
 for(const[q,kind]of refs){edges.push({from:p,to:q,kind});queue.push(q);}
}
const criticalMissing=[...new Set(missing)].filter(p=>/\.(js|css)$/.test(p));if(criticalMissing.length)throw Error(`Missing renderer dependencies: ${criticalMissing.join(', ')}`);
fs.mkdirSync(out,{recursive:true});const manifest={archive,archiveSha256:archiveHash.digest('hex'),createdAt:new Date().toISOString(),roots,policy:{files:'Exact original bytes; no JavaScript/CSS patches',dynamicBoundary:'Follow literal dynamic imports and Vite preload candidates only from Dots roots and character editor/native-room/tab UI chunks',nativeAssets:'Entire single named orbit-character renderer directory',css:'Global styles, mapped/preload styles, explicit welcome page CSS, plus exact generated class identity matches from selected non-global UI JS against all original renderer CSS',network:'No source URLs fetched'},limitations:['Preload candidate membership does not prove runtime use.','Global shared bundles include code for other features.','Cloud backend behavior and native bridge implementations are not reconstructed by asset extraction.'],missing:[...new Set(missing)],edges,files:[]};
for(const[p,b]of selected){const dest=path.join(out,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);if(hash(fs.readFileSync(dest))!==hash(b))throw Error(`Written hash mismatch: ${p}`);manifest.files.push({path:p,bytes:b.length,sha256:hash(b)});}
const stylePriority = ['app-shared-', 'app-initial-', 'app-primary-', 'page-af6278188bd3'];
manifest.styleRoots = manifest.files.map(f=>f.path).filter(p=>p.endsWith('.css')&&!p.includes('/orbit-character-')).sort((a,b)=>{const rank=p=>{const index=stylePriority.findIndex(prefix=>path.posix.basename(p).startsWith(prefix));return index<0?stylePriority.length:index;};return rank(a)-rank(b);});
fs.writeFileSync(path.join(out,'exact-styles.json'),JSON.stringify(manifest.styleRoots,null,2)+'\n');
fs.writeFileSync(path.join(out,'exact-assets.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({output:out,archiveSha256:manifest.archiveSha256,roots:roots.length,files:manifest.files.length,bytes:manifest.files.reduce((n,f)=>n+f.bytes,0),missing:manifest.missing.length},null,2));
