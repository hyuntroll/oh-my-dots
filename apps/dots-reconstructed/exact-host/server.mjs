import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm','.data':'application/octet-stream'};
const appendedExports={
  'page-a0db2051c101.js':'export { Gs as ExactWelcome, Ns as ExactSteps, ds as ExactCreating, Es as ExactCharacterScope, rc as ExactCreationController, Ja as ExactComputerSetup, ns as ExactConnectors, xs as ExactNotifications };',
  'app-initial-dddef47d6ef6.js': `
function ExactSetMessagingSubscription(fn) { Pjn = fn; }
function ExactAdaptMessagingClient(transform) { const original = c4c; c4c = options => transform(original(options), options); }
function ExactInitPersistedAtoms(snapshot, publish) { Ig(); ajt(snapshot, publish); ojt(null); }
function ExactSetLocalAccountQuery(resolve) { Xg(); Yg = Sc(J, (account, {get}) => ({queryKey:aEt(account,get(Vg)),queryFn:()=>Promise.resolve(resolve(account)),staleTime:Infinity,retry:false})); }
let exactLocalRoomLive = false; function ExactSetLocalRoomLive(scope, room, value) { Fic(); if (!exactLocalRoomLive) { Pic = Sa(J, () => null); exactLocalRoomLive = true; } scope.set(Pic, room, value); }
function ExactUseLocalAccountInputs() { mEt(); pEt = oc(J, "ready"); }
function ExactSetLocalOutputs(scope, rows) { A9n(); scope.set(E9n, rows); }
function ExactSetExecutionManager(factory) { gh = factory; }
function ExactAuthNonceContext() { lzn(); return czn; }
function ExactAdaptProfileFooter(adapt) { ROc(); const original = NOc; NOc = adapt(original); return () => { NOc = original; }; }
export { f8 as ExactSettingsSection, PPl as ExactInitSettingsSection, ExactAuthNonceContext, ExactAdaptProfileFooter };
export { qos as ExactApplyThemes, ExactSetMessagingSubscription, ExactAdaptMessagingClient, ExactInitPersistedAtoms, ExactSetLocalAccountQuery, ExactSetExecutionManager, ExactSetLocalOutputs, ExactUseLocalAccountInputs, ExactSetLocalRoomLive, bjs as ExactNavigationBridge, Ejs as ExactInitNavigationBridge, qfu as ExactLocationBridge, Xfu as ExactInitLocationBridge };
`,
  'room-view-fe0c1087e5e0.js':'export { Lt as ExactRoom };',
  'webauthn-c37be3fbf886.js':'export function ExactAdaptComputerTransport(adapt) { A(); const Original = k; k = adapt(Original); return () => { k = Original; }; }',
  'profile-dropdown-items-92ce6aadc70e.js': 'export { ha as ExactAccountMenuLayout, ea as ExactHelpMenuLayout, Sr as ExactAccountAvatar, ga as ExactPetMenuItem }; export function ExactAdaptProfileDropdownItems(adapt) { const Original = wa; wa = adapt(Original); return () => { wa = Original; }; }',
  'use-visible-settings-sections-acca727feff5.js': 'export function ExactAdaptSettingsVisibility(adapt) { po(); const original = ro; ro = adapt(original); return () => { ro = original; }; }',
};
const port = Number(process.env.DOTS_EXACT_PORT || 3420);
const apiPort = Number(process.env.DOTS_EXACT_API_PORT || 3410);
if (![port, apiPort].every(value => Number.isInteger(value) && value > 0 && value < 65536)) throw Error('Invalid local port');
const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' blob:; frame-src 'self' blob:; media-src 'self' blob: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
http.createServer(async(req,res)=>{
  try{
    if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host||'')){res.writeHead(403).end('Local host required');return;}
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__exact/health'){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ok:true,renderer:'original-dots',apiPort,source:'5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869'}));return;
    }
    if(url.pathname.startsWith('/api/')){
      if(req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403).end();return;}
      const headers={'Content-Type':req.headers['content-type']||'application/json'};
      const body=['GET','HEAD'].includes(req.method)?undefined:await new Promise((done,fail)=>{const parts=[];let size=0;req.on('data',b=>{size+=b.length;if(size>8e6){fail(Error('Request too large'));req.destroy();}else parts.push(b)});req.on('end',()=>done(Buffer.concat(parts)));req.on('error',fail)});
      const abort = new AbortController();
      res.on('close', () => abort.abort());
      const upstream=await fetch('http://127.0.0.1:'+apiPort+url.pathname+url.search,{method:req.method,headers,body,signal:abort.signal});
      res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store'});
      res.flushHeaders();
      if(upstream.body){for await(const chunk of upstream.body){if(res.destroyed)break;res.write(chunk)}}res.end();return;
    }
    const path=['/','/original/webview/'].includes(url.pathname)?'/original/webview/index.html':decodeURIComponent(url.pathname);
    const hostFile=path.startsWith('/exact-host/');
    const base=hostFile?resolve(root,'exact-host'):resolve(root,'public');
    const file=resolve(base,hostFile?path.slice('/exact-host/'.length):'.'+path);
    if(!file.startsWith(base+sep))throw Error('Invalid path');
    let bytes=await readFile(file);
    if(path==='/original/webview/index.html'){
      bytes=Buffer.from(bytes.toString().replace('<!-- PROD_BASE_TAG_HERE -->','<base href="/original/webview/">').replace('src="./assets/index-40a03cbe11dc.js"','src="/exact-host/bootstrap.mjs"'));
    }
    const patch=appendedExports[path.split('/').at(-1)];
    if(patch)bytes=Buffer.concat([bytes,Buffer.from('\n// Local host: expose existing original functions; bodies unchanged.\n'+patch+'\n')]);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Security-Policy':csp,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(bytes);
  }catch(error){if(res.destroyed)return;if(res.headersSent){res.end();return;}res.writeHead(error.code==='ENOENT'?404:500,{'Content-Type':'text/plain; charset=utf-8'}).end(error.message);}
}).listen(port,'127.0.0.1',()=>console.log('Original renderer host: http://127.0.0.1:'+port+'/original/webview/'));
