import { readProviders } from './provider-settings.mjs';
const types={openai:{url:'https://api.openai.com/v1',env:'OPENAI_API_KEY'},anthropic:{url:'https://api.anthropic.com/v1',env:'ANTHROPIC_API_KEY'},openrouter:{url:'https://openrouter.ai/api/v1',env:'OPENROUTER_API_KEY'},ollama:{url:'http://127.0.0.1:11434/v1',env:'OLLAMA_API_KEY'},compatible:{env:'DOTS_COMPATIBLE_API_KEY'}};
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const MAX_MODELS=5000;
function normalize(row){
  if(!row||typeof row!=='object')return null;
  const id=row.id||row.model||row.name;if(typeof id!=='string'||!id||id.length>300||/\s/.test(id))return null;
  const input=row.architecture?.input_modalities|| (row.capabilities?.image_input?.supported?['text','image']:[]);
  const output=row.architecture?.output_modalities||[];
  return {id,name:String(row.display_name||row.name||id).slice(0,300),contextLength:Number(row.context_length||row.max_input_tokens)||null,inputModalities:Array.isArray(input)?input.filter(x=>typeof x==='string'):[],outputModalities:Array.isArray(output)?output.filter(x=>typeof x==='string'):[],tools:Array.isArray(row.supported_parameters)?row.supported_parameters.includes('tools'):null,...(row.lifecycle?{lifecycle:String(row.lifecycle)}:{})};
}
export async function discoverModels({provider,providerId=provider,apiKey,baseUrl,config,configPath,fetchImpl=fetch}={}){
  const type=Object.hasOwn(types,provider)&&types[provider];if(!type)throw fail('제공자를 선택해 주세요.');
  config??=configPath?await readProviders(configPath):{providers:{},env:{}};
  const saved=config.providers?.[providerId];
  let address=baseUrl||saved?.settings?.baseURL||type.url;if(!address)throw fail('API 주소를 입력해 주세요.');
  let base;try{base=new URL(address);}catch{throw fail('API 주소가 올바르지 않습니다.');}
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw fail('API 주소가 올바르지 않습니다.');
  if(base.protocol==='http:'&&!['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(base.hostname))throw fail('외부 제공자는 HTTPS 주소를 사용해 주세요.');
  const storedKey=(saved?.env||[type.env]).map(key=>config.env?.[key]).find(Boolean)||saved?.settings?.apiKey;
  if(!apiKey&&storedKey&&saved&&(saved.settings?.baseURL||type.url)&&new URL(saved.settings?.baseURL||type.url).origin!==base.origin)throw fail('API 주소가 변경되었습니다. 이 주소에 사용할 키를 다시 입력해 주세요.');
  const key=apiKey||storedKey;
  if(provider!=='ollama'&&!key)throw fail('API 키를 입력해 주세요.');
  if(key&&(typeof key!=='string'||key.length>8192||/[\r\n\0]/.test(key)))throw fail('API 키 형식을 확인해 주세요.');
  const headers={Accept:'application/json',...(key?{Authorization:'Bearer '+key}:{}),...(provider==='anthropic'?{'anthropic-version':'2026-10-21'}:{})};
  const prefix=base.href.replace(/\/$/,'');
  let endpoint=prefix+(provider==='openrouter'?'/models/user?output_modalities=all':provider==='ollama'?'/models':'/models');
  if(provider==='anthropic')endpoint+='?limit=100';
  const models=new Map(),cursors=new Set();let truncated=false;
  const deadline=AbortSignal.timeout(30000);
  async function get(url){
    let response;try{response=await fetchImpl(url,{headers,redirect:'manual',signal:AbortSignal.any([deadline,AbortSignal.timeout(12000)])});}catch{throw fail('제공자에 연결하지 못했습니다. API 주소와 서버 연결을 확인해 주세요.',502);}
    if(!response.ok){await response.body?.cancel();const status=response.status;throw fail(status===401?'API 키가 거절되었습니다. 키를 확인해 주세요.':status===403?'이 키에는 모델 목록 조회 권한이 없습니다.':status===429?'제공자의 요청 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.':status===404?'이 서버는 모델 목록 자동 조회를 지원하지 않습니다. 고급 설정에서 모델 ID를 직접 추가할 수 있습니다.':status>=300&&status<400?'API 주소가 다른 주소로 이동했습니다. 최종 API 주소를 직접 입력해 주세요.':'모델 목록을 불러오지 못했습니다 (HTTP '+status+').',status===401||status===403?422:502);}
    const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>12e6){await response.body?.cancel().catch(()=>{});throw fail('모델 목록이 너무 큽니다.',502);}chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail('서버가 올바른 모델 목록을 반환하지 않았습니다.',502);}
  }
  for(let page=0;page<50;page++){
    const data=await get(endpoint);const rows=data.data||data.models;
    if(!Array.isArray(rows))throw fail('서버가 올바른 모델 목록을 반환하지 않았습니다.',502);
    for(const row of rows){const model=normalize(row);if(model)models.set(model.id,model);if(models.size>=MAX_MODELS){truncated=true;break;}}
    if(truncated)break;
    if(provider==='openrouter'&&Number(data.total_count)>models.size&&rows.length){const next=new URL(endpoint);next.searchParams.set('offset',String(Number(next.searchParams.get('offset')||0)+rows.length));next.searchParams.set('limit','1000');endpoint=next.href;if(page===49)truncated=true;continue;}
    if(data.has_more){const cursor=data.last_id||rows.at(-1)?.id;if(!cursor||cursors.has(cursor)){truncated=true;break;}cursors.add(cursor);const next=new URL(endpoint);next.searchParams.set(provider==='anthropic'?'after_id':'after',cursor);endpoint=next.href;if(page===49)truncated=true;continue;}
    break;
  }
  return {provider,models:[...models.values()].sort((a,b)=>a.id.localeCompare(b.id)),truncated,notice:truncated?'목록이 커서 최대 5,000개까지 표시합니다.':provider==='openrouter'?'이 키의 제공자·개인정보·가드레일 설정에 맞춰 조회했습니다.':'제공자가 이 키에 반환한 모델 목록입니다. 모델별 실제 호출 권한·한도는 사용 시 확인됩니다.'};
}
