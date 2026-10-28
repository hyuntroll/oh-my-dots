import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverModels } from '../server/model-discovery.mjs';
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('OpenAI discovery uses bearer auth, deduplicates model IDs, and exposes no key',async()=>{
  const result=await discoverModels({provider:'openai',apiKey:'fixture-private-key',fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/models');assert.equal(options.headers.Authorization,'Bearer fixture-private-key');assert.equal(options.redirect,'manual');return response({data:[{id:'second'},{id:'first'},{id:'second'}]});}});
  assert.deepEqual(result.models.map(m=>m.id),['first','second']);assert.ok(!JSON.stringify(result).includes('fixture-private-key'));
});
test('Anthropic follows every after_id page and retains advertised capabilities',async()=>{
  const requests=[];const result=await discoverModels({provider:'anthropic',apiKey:'fixture',fetchImpl:async(url,options)=>{requests.push(url);assert.equal(options.headers['anthropic-version'],'2026-10-21');return url.includes('after_id=')?response({data:[{id:'claude-second',display_name:'Second',max_input_tokens:200000,capabilities:{image_input:{supported:true}}}],has_more:false}):response({data:[{id:'claude-first'}],has_more:true,last_id:'claude-first'});}});
  assert.equal(requests.length,2);assert.match(requests[1],/after_id=claude-first/);assert.equal(result.models[1].contextLength,200000);assert.ok(result.models[1].inputModalities.includes('image'));
});
test('OpenRouter lists user-filtered models with all modalities and paginates by total',async()=>{
  const requests=[];const result=await discoverModels({provider:'openrouter',apiKey:'fixture',fetchImpl:async url=>{requests.push(url);return url.includes('offset=')?response({data:[{id:'vendor/second'}],total_count:2}):response({data:[{id:'vendor/first',architecture:{input_modalities:['text','image'],output_modalities:['text']},supported_parameters:['tools']}],total_count:2});}});
  assert.match(requests[0],/models\/user\?output_modalities=all/);assert.equal(requests.length,2);assert.equal(result.models[0].tools,true);assert.equal(result.models.length,2);
});
test('compatible and Ollama list models, stored keys stay server side, endpoint changes require reentry',async()=>{
  const config={env:{DOTS_COMPATIBLE_API_KEY:'stored-fixture'},providers:{compatible:{env:['DOTS_COMPATIBLE_API_KEY'],settings:{baseURL:'https://fixture.example/v1'}}}};
  const result=await discoverModels({provider:'compatible',config,fetchImpl:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer stored-fixture');return response({data:[{id:'local-model'}]});}});assert.equal(result.models.length,1);
  await assert.rejects(discoverModels({provider:'compatible',config,baseUrl:'https://changed.example/v1',fetchImpl:()=>assert.fail('must not send stored key to another origin')}),/키를 다시 입력/);
  assert.equal((await discoverModels({provider:'ollama',fetchImpl:async()=>response({data:[{id:'local:latest'}]})})).models[0].id,'local:latest');
});
test('invalid keys and redirects are explicit failures without vendor message or secret leakage',async()=>{
  await assert.rejects(discoverModels({provider:'openai',apiKey:'secret',fetchImpl:async()=>new Response('{"error":"secret"}',{status:401})}),e=>e.status===422&&!e.message.includes('secret'));
  await assert.rejects(discoverModels({provider:'openai',apiKey:'secret',fetchImpl:async()=>new Response('',{status:302,headers:{Location:'https://other.example/'}})}),/최종 API 주소/);
  await assert.rejects(discoverModels({provider:'openai',apiKey:'fixture',fetchImpl:async()=>response({unexpected:true})}),/올바른 모델 목록/);
});
