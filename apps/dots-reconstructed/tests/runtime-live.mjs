// Explicitly opt in: DOTS_LIVE_TEST=1 node --test tests/runtime-live.mjs
// Uses the existing OpenCode account and only public generic test content.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/main.mjs';
test('LIVE installed OpenCode creates and reads an actual approved workspace file',{skip:process.env.DOTS_LIVE_TEST!=='1',timeout:300000},async()=>{
 let dataDir=await mkdtemp(join(tmpdir(),'dots-live-verified-'));let app=createApp({dataDir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 let base='http://127.0.0.1:'+app.server.address().port;const post=async(path,body)=>{let response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(response.ok);return await response.json();};
 try{
  let profile=await post('/api/profiles',{display_name:'Live Verification Dot'});
  let sent=await post('/api/messaging/rooms/'+profile.room_id+'/messages',{content:{text:'내 작업 폴더에 hello.txt 파일을 만들고 내용은 "안녕하세요"로 써 주세요. 반드시 제공된 파일 쓰기 도구를 사용하고 저장 뒤 읽기 도구로 확인한 뒤 짧게 답해 주세요.'},request_id:'live-tool-test',idempotency_token:'live-tool-test'});
  let approved=new Set(),task;
  for(let attempt=0;attempt<270;attempt++){
   await new Promise(r=>setTimeout(r,1000));task=app.store.get('task',sent.task.id);
   for(let item of task.items)if(item.type==='approval'&&item.status==='pending'&&!approved.has(item.id)){
    assert.equal(item.kind,'write');assert.equal(item.path,'hello.txt');assert.equal(item.content,'안녕하세요');
    approved.add(item.id);await post('/api/approvals/'+item.id+'/respond',{decision:'allow'});
   }
   if(['completed','error','cancelled'].includes(task.status))break;
  }
  assert.equal(task.status,'completed',task.error);assert.equal(await readFile(join(app.runtime.workspace(profile.id),'hello.txt'),'utf8'),'안녕하세요');
  assert.ok(task.items.some(i=>i.type==='tool_call'&&i.name==='write_file'&&i.status==='completed'));
  assert.ok(task.items.some(i=>i.type==='tool_call'&&i.name==='read_file'&&i.status==='completed'));
  assert.equal(approved.size,1);assert.equal(app.store.all('message').at(-1).role,'assistant');
  console.log(JSON.stringify({model:app.store.getSettings().model,status:task.status,approved:approved.size,tool_calls:task.items.filter(i=>i.type==='tool_call').map(i=>({name:i.name,status:i.status})),file_content:'안녕하세요'}));
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
