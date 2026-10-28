#!/usr/bin/env node
import { openSync, closeSync } from 'node:fs';
import { access, readFile, writeFile, mkdir, chmod, lstat, rename } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { ReadStream, WriteStream } from 'node:tty';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const args=process.argv.slice(2),options={};
const flags=new Set(['--non-interactive','--no-start','--dry-run','--help']);
for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(flags.has(arg)){options[arg.slice(2)]=true;continue;}
  if(!['--directory','--input','--mode','--public-url','--port','--engine','--legacy-dir'].includes(arg)||!args[i+1])throw Error('Unknown or incomplete option: '+arg);
  options[arg.slice(2)]=args[++i];
}
if(options.help){console.log('node tools/service-setup.mjs [--directory /private/state] [--input /private/answers.json] [--mode foreground|systemd|docker] [--public-url URL] [--port 3420] [--engine opencode|grok] [--legacy-dir /existing/data] [--non-interactive] [--no-start] [--dry-run]');process.exit(0);}
const directory=resolve(options.directory||join(root,'.data/service'));
const configPath=join(directory,'config.json');
const readObject=async path=>{let contents;try{contents=await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return {};throw error;}let value;try{value=JSON.parse(contents);}catch{throw Error('Invalid JSON in '+path);}if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected JSON object in '+path);return value;};
let input={};
if(options.input){const path=resolve(options.input),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('Setup input must be a regular private file (chmod 600).');input=await readObject(path);}
const old=await readObject(configPath);
const providerPath=join(directory,'providers.json');
const providerConfig=await readObject(providerPath);providerConfig.providers||={};providerConfig.env||={};
let terminal,output,reader,terminalFd,hidden=false;
const restoreEcho=()=>{if(hidden&&terminalFd!==undefined){spawnSync('stty',['echo'],{stdio:[terminalFd,'ignore','ignore']});hidden=false;}};
const interrupted=()=>{restoreEcho();process.stderr.write('\nSetup cancelled.\n');process.exit(130);};
const interactive=!options['non-interactive'];
if(interactive){try{terminalFd=openSync('/dev/tty','r+');terminal=new ReadStream(terminalFd);output=new WriteStream(terminalFd);reader=createInterface({input:terminal,output,terminal:false});process.once('SIGINT',interrupted);process.once('SIGTERM',interrupted);}catch{throw Error('Interactive setup needs /dev/tty. Use --non-interactive --input /private/answers.json.');}}
async function ask(label,fallback='',secret=false){
  if(!reader)return fallback;
  const prompt=label+(fallback&&!secret?' ['+fallback+']':'')+': ';
  output.write(prompt);
  if(secret){const result=spawnSync('stty',['-echo'],{stdio:[terminalFd,'ignore','ignore']});if(result.status!==0)throw Error('Cannot hide terminal input.');hidden=true;}
  try{const value=await reader.question('');return value||fallback;}
  finally{if(secret){restoreEcho();output.write('\n');}}
}
async function privateWrite(path,text,mode=0o600){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const stat=await lstat(path).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  if(stat?.isSymbolicLink()||stat&&!stat.isFile())throw Error('Refusing non-regular config file: '+path);
  const temporary=path+'.'+randomBytes(8).toString('hex')+'.tmp';
  await writeFile(temporary,text,{mode,flag:'wx'});await rename(temporary,path);await chmod(path,mode);
}
function run(command,argv,env=process.env){const result=spawnSync(command,argv,{cwd:root,env,stdio:'inherit'});if(result.status!==0)throw Error(command+' failed');}
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
const providerTypes={
  openai:{title:'OpenAI',key:'OPENAI_API_KEY',package:'@opencode/ai/providers/openai',url:'https://api.openai.com/v1'},
  anthropic:{title:'Anthropic',key:'ANTHROPIC_API_KEY',package:'@opencode/ai/providers/anthropic',url:'https://api.anthropic.com/v1'},
  openrouter:{title:'OpenRouter',key:'OPENROUTER_API_KEY',package:'@opencode/ai/providers/openrouter',url:'https://openrouter.ai/api/v1'},
  ollama:{title:'Ollama',key:'OLLAMA_API_KEY',package:'@opencode/ai/providers/openai-compatible',url:'http://127.0.0.1:11434/v1'},
  compatible:{title:'OpenAI-compatible',package:'@opencode/ai/providers/openai-compatible',url:''},
};
let firstModel;
const printable=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200);
async function chooseModel({type,id,baseURL,apiKey}){
  let result;
  try{const {discoverModels}=await import('../server/model-discovery.mjs');result=await discoverModels({provider:type,providerId:id,baseUrl:baseURL,apiKey,config:providerConfig});}
  catch{console.log('모델 목록을 가져오지 못했습니다. 연결 주소·키·접근 권한을 확인하세요. 직접 모델 ID를 입력해 계속할 수 있습니다.');return ask('이 제공자에서 사용 가능한 모델 ID');}
  const models=Array.isArray(result.models)?result.models.filter(m=>!m.outputModalities?.length||m.outputModalities.includes("text")):[];
  if(result.notice)console.log(printable(result.notice));
  if(result.truncated)console.log('모델 목록이 제공자 또는 조회 한도 때문에 일부만 표시되었습니다.');
  if(!models.length){console.log('이 연결에서 모델을 찾지 못했습니다. 직접 모델 ID를 입력해 계속할 수 있습니다.');return ask('사용 가능한 모델 ID');}
  let search='',page=0;
  for(;;){
    const visible=models.filter(model=>(String(model.name||'')+' '+String(model.id)).toLowerCase().includes(search.toLowerCase()));
    const pages=Math.max(1,Math.ceil(visible.length/20));page=Math.max(0,Math.min(page,pages-1));
    console.log('\n'+models.length+'개 모델 · '+visible.length+'개 일치 · '+(page+1)+'/'+pages+' 페이지');
    for(const [i,model]of visible.slice(page*20,page*20+20).entries())console.log((page*20+i+1)+'. '+printable(model.name||model.id)+(model.name&&model.name!==model.id?' — '+printable(model.id):''));
    const value=await ask('번호 선택 / 검색어 / n 다음 / p 이전 / Enter 전체');
    if(/^\d+$/.test(value)){const model=visible[Number(value)-1];if(model)return String(model.id);console.log('목록의 번호를 선택하세요.');}
    else if(value==='n')page=Math.min(page+1,pages-1);
    else if(value==='p')page=Math.max(0,page-1);
    else{search=value;page=0;}
  }
}
async function addProvider(value,mode){
  const type=value.type||value.id,spec=providerTypes[type];if(!spec)throw Error('Unknown provider type.');
  const id=type==='compatible'?String(value.id||'compatible'):type;
  if(!/^[a-z][a-z0-9_-]{0,63}$/.test(id))throw Error('Provider ID must use lowercase letters, numbers, _ or -.');
  const full=String(value.model||'');const model=full.startsWith(id+'/')?full.slice(id.length+1):full;
  if(!model||model.length>300||/\s|#/.test(model))throw Error('Enter an explicit model ID for '+id+'.');
  const endpoint=new URL(value.baseURL||(mode==='docker'&&type==='ollama'?'http://host.docker.internal:11434/v1':spec.url));if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Invalid provider endpoint.');
  if(endpoint.protocol==='http:'&&!['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(endpoint.hostname))throw Error('Remote provider endpoints need HTTPS.');
  const envName=spec.key||'OHMYDOTS_'+id.toUpperCase().replace(/[^A-Z0-9]/g,'_')+'_API_KEY';
  const secret=String(value.apiKey||'').trim();if(secret){if(secret.length>8192||/[\r\n\0]/.test(secret))throw Error('Invalid provider API key.');providerConfig.env[envName]=secret;}
  const previous=providerConfig.providers[id]||{};
  providerConfig.providers[id]={...previous,name:spec.title,env:[envName],package:spec.package,settings:{...previous.settings,baseURL:endpoint.href.replace(/\/$/,'')},models:{...previous.models,[model]:{name:model}}};
  firstModel||=id+'/'+model;
}
try{
  console.log('OhMyDots — 계정 · 모델 · 서버 설정');
  const mode=options.mode||input.mode||await ask('실행 방식 foreground / systemd / docker','foreground');
  if(!['foreground','systemd','docker'].includes(mode))throw Error('Invalid deployment mode.');
  const port=Number(options.port||input.port||old.port||3420);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be between 1024 and 65535.');
  const publicUrl=options['public-url']||input.publicUrl||await ask('서비스 주소 (외부 공개는 https://도메인)',old.publicUrl||'http://127.0.0.1:'+port);
  const url=new URL(publicUrl);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Use an origin URL without a path, credentials, query or fragment.');
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Public service URLs require HTTPS.');
  const engine=options.engine||input.engine||await ask('실행기 opencode / grok',old.engine||'opencode');if(!['opencode','grok'].includes(engine))throw Error('Unknown runtime.');
  if(mode==='docker'&&engine==='grok')throw Error('Docker installer supports OpenCode. Use foreground/systemd for an existing Grok source installation.');
  let legacyDir=options['legacy-dir']||input.legacyDir||old.legacyDir;
  if(!legacyDir&&interactive){try{await access(join(root,'.data/dots.sqlite'));if((await ask('기존 .data 기록을 첫 관리자 계정에 연결할까요? yes / no','no'))==='yes')legacyDir=join(root,'.data');}catch(error){if(error.code!=='ENOENT')throw error;}}
  if(legacyDir){legacyDir=resolve(legacyDir);await access(join(legacyDir,'dots.sqlite'));if(mode==='docker')throw Error('Legacy data attachment requires foreground/systemd so the existing directory stays at its original path.');}
  let legacyInference=input.legacyInference??old.legacyInference??false;
  if(legacyDir&&interactive)legacyInference=(await ask('이 관리자만 기존 OpenCode 연결을 이어 쓸까요? yes / no',legacyInference?'yes':'no'))==='yes';
  if(typeof legacyInference!=='boolean'||legacyInference&&!legacyDir)throw Error('legacyInference requires an attached legacyDir and a boolean value.');
  const registration=input.registration??old.registration??false;
  if(typeof registration!=='boolean')throw Error('registration must be boolean.');
  for(const provider of input.providers||[])await addProvider(provider,mode);
  if(interactive){
    let more=true;
    while(more){
      const type=await ask('제공자 openai / anthropic / openrouter / ollama / compatible / later','later');
      if(type==='later')break;
      const spec=providerTypes[type];if(!spec)throw Error('Choose one of the listed providers.');
      const id=type==='compatible'?await ask('제공자 ID','compatible'):type;
      const baseURL=await ask('API 주소',mode==='docker'&&type==='ollama'?'http://host.docker.internal:11434/v1':spec.url);
      const apiKey=await ask('API 키 (화면에 표시하지 않음; 기존 키 유지/Ollama는 Enter)','',true);
      const model=await chooseModel({type,id,baseURL,apiKey});
      await addProvider({type,id,baseURL,model,apiKey},mode);
      more=(await ask('다른 제공자도 추가할까요? yes / no','no'))==='yes';
    }
  }
  const env={...old.env,OPENCODE_BIN:process.env.OPENCODE_BIN||old.env?.OPENCODE_BIN||join(homedir(),'.opencode/bin/opencode'),DOTS_PROVIDER_CONFIG:mode==='docker'?'/data/providers.json':providerPath};
  if(firstModel)env.DOTS_MODEL=firstModel;
  if(mode==='docker')env.OPENCODE_BIN='/usr/local/bin/opencode';
  if(engine==='grok'){
    env.DOTS_GROK_SOURCE=resolve(input.grokSource||process.env.DOTS_GROK_SOURCE||old.env?.DOTS_GROK_SOURCE||join(homedir(),'Github/grok-bot-0.18-reconstructed'));
    env.DOTS_GROK_NODE=input.grokNode||process.env.DOTS_GROK_NODE||old.env?.DOTS_GROK_NODE||process.execPath;
    await access(join(env.DOTS_GROK_SOURCE,'source/host/main.ts'));
  }
  const config={directory:mode==='docker'?'/data':directory,publicUrl:url.origin,port:mode==='docker'?3420:port,host:mode==='docker'?'0.0.0.0':input.host||old.host||'127.0.0.1',engine,registration,legacyInference,env,...(legacyDir?{legacyDir}:{})};
  if(!['127.0.0.1','::1','0.0.0.0'].includes(config.host))throw Error('Use a loopback address or 0.0.0.0 for host.');
  let admin=input.admin;
  if(interactive&&!admin){const username=await ask('첫 관리자 아이디 (나중에 /setup에서 만들려면 Enter)');if(username){const displayName=await ask('표시 이름',username),password=await ask('관리자 비밀번호 (12자 이상)','',true),again=await ask('비밀번호 확인','',true);if(password!==again)throw Error('Passwords do not match.');admin={username,displayName,password};}}
  if(options['dry-run']){console.log(JSON.stringify({dryRun:true,directory,configPath,mode,publicUrl:url.origin,engine,providers:Object.keys(providerConfig.providers),model:firstModel||env.DOTS_MODEL||null,admin:admin?.username||'bootstrap UI',legacyDir:legacyDir||null},null,2));process.exitCode=0;}
  else{
    await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
    if(engine==='grok')run(process.execPath,[join(root,'tools/grok-prepare.mjs')],{...process.env,...env});
    await privateWrite(providerPath,JSON.stringify(providerConfig,null,2)+'\n');
    await privateWrite(configPath,JSON.stringify(config,null,2)+'\n');
    if(admin){const {Accounts}=await import('../server/accounts.mjs');const accounts=new Accounts(directory);try{if(accounts.count())throw Error('An account already exists; use the account page to add users.');await accounts.create({...admin,admin:true,dataPath:legacyDir||null});}finally{accounts.close();}}
    const runPath=join(directory,'run.sh');
    await privateWrite(runPath,'#!/usr/bin/env bash\nset -euo pipefail\nexport PATH='+quote(dirname(process.execPath))+':"${PATH:-/usr/local/bin:/usr/bin:/bin}"\nexport DOTS_SERVICE_CONFIG='+quote(configPath)+'\nexec '+quote(process.execPath)+' '+quote(join(root,'server/service.mjs'))+'\n',0o700);
    if(mode==='systemd'){
      if(process.platform!=='linux')throw Error('systemd mode is Linux-only. Use foreground or docker on this platform.');
      const unit=join(homedir(),'.config/systemd/user/ohmydots.service');
      const unitQuote=value=>'"'+String(value).replaceAll('%','%%').replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
      const existing=await readFile(unit,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return '';});if(existing&&!existing.includes('# OhMyDots managed service'))throw Error('Existing ohmydots.service is not managed by this installer.');
      const content='# OhMyDots managed service\n[Unit]\nDescription=OhMyDots account service\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory='+unitQuote(root)+'\nExecStart='+unitQuote(runPath)+'\nRestart=on-failure\nRestartSec=3\nNoNewPrivileges=true\nPrivateTmp=true\nKillMode=control-group\n\n[Install]\nWantedBy=default.target\n';
      await privateWrite(unit,content);
      if(!options['no-start']){run('systemctl',['--user','daemon-reload']);run('systemctl',['--user','enable','--now','ohmydots.service']);}
      console.log('systemd: systemctl --user status ohmydots.service');
    }
    if(mode==='docker'){
      if(!/^\d+$/.test(String(process.getuid?.()??1000))||/\r|\n/.test(directory))throw Error('Invalid deployment path.');
      const caddyPath=join(directory,'Caddyfile');
      if(!/^[a-zA-Z0-9.:[\]-]+$/.test(url.host))throw Error('Invalid public host.');
      await privateWrite(caddyPath,url.host+' {\n    reverse_proxy app:3420\n}\n');
      const deployEnv=join(directory,'deployment.env');
      if(directory.includes("'"))throw Error('Docker setup directory cannot contain a single quote.');
      await privateWrite(deployEnv,"DOTS_SERVICE_DATA='"+directory+"'\nDOTS_SERVICE_PORT="+port+"\nDOTS_UID="+(process.getuid?.()??1000)+"\nDOTS_GID="+(process.getgid?.()??1000)+"\n");
      const composeArgs=['compose','--env-file',deployEnv,'-f',join(root,'deploy/compose.yaml'),...(url.protocol==='https:'?['--profile','tls']:[])];
      const dockerRun=join(directory,'compose.sh');
      await privateWrite(dockerRun,'#!/usr/bin/env bash\nset -euo pipefail\nexec docker '+composeArgs.map(quote).join(' ')+' "$@"\n',0o700);
      await privateWrite(runPath,'#!/usr/bin/env bash\nset -euo pipefail\nexec '+quote(dockerRun)+' up -d --build\n',0o700);
      if(!options['no-start'])run('docker',[...composeArgs,'up','-d','--build']);
      console.log('Docker: '+quote(dockerRun)+' up -d --build');
    }
    if(mode!=='docker'&&url.protocol==='https:'){
      await privateWrite(join(directory,'Caddyfile'),url.host+' {\n    reverse_proxy 127.0.0.1:'+port+'\n}\n');
      console.log('HTTPS proxy: caddy run --config '+quote(join(directory,'Caddyfile')));
    }
    console.log('Config: '+configPath+'\nOpen: '+url.origin+'/login\nStart: '+quote(runPath));
    if(!admin)console.log('First admin: open /setup; enter the code from '+join(directory,'bootstrap.token')+' after the service starts.');
    if(mode==='foreground'&&!options['no-start']){
      reader?.close();terminal?.destroy();output?.destroy();reader=null;process.removeListener('SIGINT',interrupted);process.removeListener('SIGTERM',interrupted);
      const child=spawn(process.execPath,[join(root,'server/service.mjs')],{cwd:root,env:{...process.env,DOTS_SERVICE_CONFIG:configPath},stdio:'inherit'});
      for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
      await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',code=>{process.exitCode=code||0;done();});});
    }
  }
}finally{restoreEcho();process.removeListener('SIGINT',interrupted);process.removeListener('SIGTERM',interrupted);reader?.close();terminal?.destroy();output?.destroy();if(terminalFd!==undefined)try{closeSync(terminalFd);}catch{}}
