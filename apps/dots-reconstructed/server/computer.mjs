import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

let startup = {phase:'idle',error:null};
let managedProcess;
const script=fileURLToPath(new URL('../tools/computer-start.mjs',import.meta.url));

export function validateComputerUrl(value) {
  const url=new URL(value||'http://127.0.0.1:3480');
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/') {
    throw new Error('컴퓨터 서비스 주소는 이 Mac의 로컬 HTTP 주소여야 합니다.');
  }
  return url.origin;
}

async function connection(dataDir,settings={}) {
  const base=validateComputerUrl(settings.computer_url||process.env.DOTS_COMPUTER_URL);
  let token=process.env.DOTS_COMPUTER_TOKEN;
  if(!token){try{token=(await readFile(join(dataDir,'computer.token'),'utf8')).trim()}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(!token)throw new Error('컴퓨터를 시작하면 연결할 수 있습니다.');
  return {base,token};
}

export async function requestDesktop(path,{dataDir,settings={},body,signal,timeout=3500}={}) {
  const {base,token}=await connection(dataDir,settings);
  const timeoutSignal=AbortSignal.timeout(timeout);
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal});
  if(!response.ok){let reason;try{reason=(await response.json()).detail}catch{}const e=new Error(typeof reason==='string'?reason:`컴퓨터 연결 요청이 실패했습니다 (${response.status}).`);e.status=response.status;throw e;}
  return response;
}

export async function computerStatus({dataDir,settings={}}) {
  try {
    const status=await (await requestDesktop('/health',{dataDir,settings,timeout:2000})).json();
    if(status.connected!==true||!Number.isSafeInteger(status.epoch)||!['AGENT','USER'].includes(status.owner)||!Number.isFinite(status.width)||!Number.isFinite(status.height))throw Error('컴퓨터가 잘못된 연결 상태를 반환했습니다.');
    return {...status,state:'ready',error:null};
  } catch(error) {
    return {connected:false,state:startup.phase==='starting'?'starting':'disconnected',owner:null,epoch:null,width:1280,height:960,error:startup.error||(['fetch failed','The operation was aborted due to timeout'].includes(error.message)?'컴퓨터에 연결할 수 없습니다. 컴퓨터를 시작하거나 연결 주소를 확인해 주세요.':error.message)};
  }
}

function manageComputer(dataDir,stop=false) {
  if(managedProcess && !stop)return;
  managedProcess?.kill('SIGTERM');
  startup={phase:stop?'stopping':'starting',error:null};
  const child=spawn(process.execPath,[script,...(stop?['--stop']:[])],{cwd:resolve(fileURLToPath(new URL('..',import.meta.url))),env:{...process.env,DOTS_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  managedProcess=child;
  let diagnostic='';
  const capture=chunk=>{diagnostic=(diagnostic+String(chunk)).slice(-4000)};
  child.stdout.on('data',capture);child.stderr.on('data',capture);
  child.once('error',error=>{if(managedProcess!==child)return;managedProcess=null;startup={phase:'failed',error:error.message}});
  child.once('exit',code=>{if(managedProcess!==child)return;managedProcess=null;startup={phase:code===0?'idle':'failed',error:code===0?null:(diagnostic.trim()||'컴퓨터 시작에 실패했습니다.')}});
}

export async function handleComputerRequest(req,res,{store,runtime,dataDir,url,readJson,json}) {
  const path=url.pathname;
  if(!path.startsWith('/api/computer/'))return false;
  if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'Cross-site computer requests are not allowed'});return true;}
  const settings=await store.getSettings();
  const options={dataDir,settings};
  if(path==='/api/computer/status'&&req.method==='GET'){json(res,200,await computerStatus(options));return true;}
  if(path==='/api/computer/start'&&req.method==='POST'){manageComputer(dataDir);json(res,202,{state:'starting'});return true;}
  if(path==='/api/computer/stop'&&req.method==='POST'){manageComputer(dataDir,true);json(res,202,{state:'stopping'});return true;}
  if(['/api/computer/control','/api/computer/input'].includes(path)&&req.method==='POST'){
    const body=await readJson(req);
    const result=await (await requestDesktop(path.endsWith('control')?'/control':'/input',{...options,body})).json();
    // Ownership is already transferred. Grok's resume may include inference;
    // do not hold the desktop driver's short control acknowledgement open.
    if(path.endsWith('control')&&body.owner==='AGENT')void runtime?.computerHandback?.().catch(error=>console.error('[computer-handback]',error.message));
    json(res,200,result);return true;
  }
  if(path==='/api/computer/screenshot'&&req.method==='GET'){
    const upstream=await requestDesktop('/screenshot',options);
    res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'});
    res.end(Buffer.from(await upstream.arrayBuffer()));return true;
  }
  if(path==='/api/computer/stream'&&req.method==='GET'){
    const stop=new AbortController();res.once('close',()=>stop.abort());
    const {base,token}=await connection(dataDir,settings);
    const upstream=await fetch(base+'/stream',{headers:{Authorization:`Bearer ${token}`},signal:stop.signal});
    if(!upstream.ok||!upstream.body)throw new Error('화면 스트림에 연결할 수 없습니다.');
    res.writeHead(200,{'Content-Type':upstream.headers.get('content-type')||'multipart/x-mixed-replace; boundary=frame','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'});
    Readable.fromWeb(upstream.body).on('error',()=>res.end()).pipe(res);return true;
  }
  json(res,404,{error:'Unknown computer route'});return true;
}

/** Called only through the runtime's tool approval boundary. */
export async function executeComputerTool(name,args,{dataDir,signal,settings,store}={}) {
  if(!['computer','computer_status','computer_screenshot','computer_action'].includes(name))throw new Error('Unknown computer tool');
  if(!dataDir)throw new Error('Computer tool requires the local data directory');
  settings??=store?.getSettings()??{};
  const status=await computerStatus({dataDir,settings});
  if(name==='computer_status')return status;
  if(!status.connected)throw new Error(status.error);
  if(name==='computer_screenshot'||args.action==='screenshot'){
    const response=await requestDesktop('/screenshot',{dataDir,settings,signal});
    return {type:'image',mime_type:'image/png',data:Buffer.from(await response.arrayBuffer()).toString('base64'),width:status.width,height:status.height};
  }
  if(status.owner!=='AGENT')throw new Error('사용자가 컴퓨터를 제어하고 있습니다. 제어권을 돌려줄 때까지 기다려 주세요.');
  const allowed=['move','click','double_click','scroll','type','key','launch'];
  if(!allowed.includes(args.action))throw new Error('Unknown computer action');
  const {actor:_actor,epoch:_epoch,...input}=args;
  return await (await requestDesktop('/input',{dataDir,settings,signal,body:{...input,actor:'AGENT',epoch:status.epoch}})).json();
}
