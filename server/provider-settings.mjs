import { readFile, writeFile, mkdir, rename, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export const providerTypes={openai:{env:'OPENAI_API_KEY',package:'openai'},anthropic:{env:'ANTHROPIC_API_KEY',package:'anthropic'},openrouter:{env:'OPENROUTER_API_KEY',package:'openrouter'},ollama:{env:'OLLAMA_API_KEY',package:'openai-compatible',baseURL:'http://127.0.0.1:11434/v1'},compatible:{env:'DOTS_COMPATIBLE_API_KEY',package:'openai-compatible'}};
export async function readProviders(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return {providers:{},env:{}};throw e;}}
export async function saveProvider(path,{provider,model,models=[],baseUrl,apiKey}){
  const type=Object.hasOwn(providerTypes,provider)&&providerTypes[provider];if(!type||typeof model!=='string'||!model.trim()||/\s/.test(model)||model.length>300)throw Object.assign(Error('제공자와 모델 이름을 확인하세요.'),{status:400});
  let address=baseUrl||type.baseURL;if(address){const url=new URL(address);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Object.assign(Error('API 주소가 올바르지 않습니다.'),{status:400});address=url.href.replace(/\/$/,'');}
  if(provider==='compatible'&&!address)throw Object.assign(Error('호환 서버의 API 주소가 필요합니다.'),{status:400});
  const config=await readProviders(path);config.env??={};config.providers??={};
  const current=config.providers[provider]||{};
  const defaults={openai:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com/v1',openrouter:'https://openrouter.ai/api/v1'};
  const previousUrl=current.settings?.baseURL||defaults[provider];
  if(!apiKey&&config.env[type.env]&&address&&previousUrl&&new URL(address).origin!==new URL(previousUrl).origin)throw Object.assign(Error('변경한 API 주소에 사용할 키를 다시 입력해 주세요.'),{status:400});
  if(apiKey){if(typeof apiKey!=='string'||apiKey.length>8192||/[\r\n\0]/.test(apiKey))throw Object.assign(Error('API 키 형식을 확인해 주세요.'),{status:400});if(type.env)config.env[type.env]=apiKey;}
  if(!Array.isArray(models)||models.length>5000||models.some(m=>!m||typeof m.id!=='string'||!m.id||m.id.length>300||/\s/.test(m.id)))throw Object.assign(Error('모델 목록이 올바르지 않습니다.'),{status:400});
  config.providers[provider]={...current,name:provider,...(type.env?{env:[type.env]}:{}),package:'@opencode/ai/providers/'+type.package,settings:{...current.settings,...(address?{baseURL:address}:{})},models:{...current.models,...Object.fromEntries(models.map(m=>[m.id,{name:String(m.name||m.id).slice(0,300)}])),[model.trim()]:{name:models.find(m=>m.id===model)?.name||model.trim()}}};
  config.defaultModel=provider+'/'+model.trim();
  await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=path+'.'+randomUUID();await writeFile(temp,JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});await rename(temp,path);await chmod(path,0o600);
  return config;
}
export function publicProviders(config){return Object.entries(config.providers||{}).map(([id,value])=>({id,models:Object.keys(value.models||{}),baseUrl:value.settings?.baseURL||null}));}
