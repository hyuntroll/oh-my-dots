import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir=resolve(process.env.DOTS_DATA_DIR || join(root,'.data'));
await mkdir(dataDir,{recursive:true,mode:0o700});
const workspace=join(dataDir,'workspaces');
await mkdir(workspace,{recursive:true,mode:0o700});
let token;
try{token=(await readFile(join(dataDir,'computer.token'),'utf8')).trim()}
catch(e){if(e.code!=='ENOENT')throw e;token=randomBytes(32).toString('hex');await writeFile(join(dataDir,'computer.token'),token,{mode:0o600,flag:'wx'});}
try{await promisify(execFile)('docker',['info','--format','{{.ServerVersion}}'],{timeout:7000,maxBuffer:20000});}
catch{console.error('Docker 엔진이 응답하지 않습니다. Docker Desktop을 시작한 뒤 다시 시도해 주세요.');process.exit(1);}
let build=process.argv.includes('--rebuild');
if(!process.argv.includes('--stop')&&!build){try{await promisify(execFile)('docker',['image','inspect','dots-reconstructed-computer:latest','--format','{{.Id}}'],{timeout:7000,maxBuffer:20000});}catch{build=true;}}
const args=['compose','-f',join(root,'computer/compose.yaml'),...(process.argv.includes('--stop')?['down']:['up','-d',build?'--build':'--no-build'])];
const child=spawn('docker',args,{env:{...process.env,DOTS_COMPUTER_TOKEN:token,DOTS_WORKSPACES:workspace},stdio:'inherit'});
process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));
child.on('error',e=>{console.error(e.message);process.exitCode=1});
child.on('exit',code=>{process.exitCode=code??1});
