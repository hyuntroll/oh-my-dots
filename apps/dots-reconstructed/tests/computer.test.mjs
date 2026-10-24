import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {createApp} from '../server/main.mjs';
import {computerStatus,executeComputerTool,validateComputerUrl} from '../server/computer.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ6kAAAAASUVORK5CYII=','base64');
async function fixture(t){
 const dataDir=await mkdtemp(join(tmpdir(),'dots-computer-contract-'));const calls=[];let owner='AGENT',epoch=10;
 await writeFile(join(dataDir,'computer.token'),'test-private-token',{mode:0o600});
 const daemon=http.createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer test-private-token');
  let raw='';for await(const b of req)raw+=b;const body=raw?JSON.parse(raw):null;calls.push({path:req.url,body});
  const status=()=>({connected:true,owner,epoch,width:1280,height:960});
  if(req.url==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(status()))}
  if(req.url==='/screenshot'){res.setHeader('Content-Type','image/png');return res.end(png)}
  if(req.url==='/control'){if(body.epoch!==epoch){res.writeHead(409);return res.end(JSON.stringify({detail:'Stale handoff'}))}owner=body.owner;epoch++;return res.end(JSON.stringify(status()))}
  if(req.url==='/input'){if(body.actor!==owner||body.epoch!==epoch){res.writeHead(409);return res.end(JSON.stringify({detail:'Control revoked or stale input'}))}return res.end(JSON.stringify(status()))}
  res.writeHead(404);res.end();
 });await new Promise(r=>daemon.listen(0,'127.0.0.1',r));
 const computer_url='http://127.0.0.1:'+daemon.address().port;
 const app=createApp({dataDir,provider:{status:async()=>({installed:true,models:[]}),run:async()=>''}});app.store.patch('settings','app',{computer_url});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();await new Promise(r=>daemon.close(r));await rm(dataDir,{recursive:true,force:true})});
 const call=async(path,body,headers={})=>fetch(base+'/api/computer/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {app,call,dataDir,settings:{computer_url},calls};
}

test('computer URLs require a local HTTP service, without embedded credentials or external targets',()=>{
 assert.equal(validateComputerUrl('http://127.0.0.1:3480'),'http://127.0.0.1:3480');
 for(const url of ['https://127.0.0.1:3480','http://example.com','http://user:password@localhost:3480','file:///etc/passwd','http://127.0.0.1:3480/private','http://127.0.0.1:3480/?token=secret'])assert.throws(()=>validateComputerUrl(url));
});

test('an absent service is explicitly disconnected, with no simulated live desktop',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'dots-computer-absent-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
 const status=await computerStatus({dataDir});assert.equal(status.connected,false);assert.equal(status.state,'disconnected');assert.equal(status.owner,null);
});

test('computer HTTP bridge keeps service credentials private and forwards actual image bytes',async t=>{
 const f=await fixture(t);const r=await f.call('status');assert.equal(r.status,200);const status=await r.json();assert.equal(status.connected,true);assert.equal(status.epoch,10);assert.ok(!JSON.stringify(status).includes('test-private-token'));
 const image=await f.call('screenshot');assert.equal(image.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 assert.equal(image.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
 const blocked=await f.call('screenshot',undefined,{'Sec-Fetch-Site':'cross-site'});assert.equal(blocked.status,403);
});

test('ownership transfers advance epoch and stale user input is rejected',async t=>{
 const f=await fixture(t);const changed=await (await f.call('control',{owner:'USER',epoch:10})).json();assert.equal(changed.owner,'USER');assert.equal(changed.epoch,11);
 const stale=await f.call('input',{actor:'USER',epoch:10,action:'click',x:0,y:0});assert.equal(stale.status,409);
 const valid=await f.call('input',{actor:'USER',epoch:11,action:'click',x:50,y:60});assert.equal(valid.status,200);
 await assert.rejects(executeComputerTool('computer_action',{action:'click',x:0,y:0},{dataDir:f.dataDir,settings:f.settings}),/사용자가/);
 const released=await(await f.call('control',{owner:'AGENT',epoch:11})).json();assert.equal(released.epoch,12);
});

test('runtime computer aliases use native image MCP data and current actor epoch',async t=>{
 const f=await fixture(t),context={dataDir:f.dataDir,store:f.app.store};
 const s=await executeComputerTool('computer_status',{},context);assert.equal(s.connected,true);
 const capture=await executeComputerTool('computer_screenshot',{},context);assert.equal(capture.mime_type,'image/png');assert.deepEqual(Buffer.from(capture.data,'base64'),png);
 await executeComputerTool('computer_action',{action:'click',x:20,y:40,actor:'USER',epoch:9999},context);
 assert.deepEqual(f.calls.at(-1).body,{action:'click',x:20,y:40,actor:'AGENT',epoch:10});
});
