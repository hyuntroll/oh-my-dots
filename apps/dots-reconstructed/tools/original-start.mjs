import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const apiPort = Number(process.env.DOTS_EXACT_API_PORT || 3410);
const uiPort = Number(process.env.DOTS_EXACT_PORT || 3420);
if (![apiPort, uiPort].every(value => Number.isInteger(value) && value > 0 && value < 65536) || apiPort === uiPort) throw Error('Use two different valid local ports');
const children = new Set();
let stopping = false;
function start(file, env) {
  const child = spawn(process.execPath, [file], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  children.add(child);
  child.on('exit', code => { children.delete(child); if (!stopping) { process.exitCode = code || 0; stop(); } });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
}
function stop() { stopping = true; for (const child of children) child.kill('SIGTERM'); }
async function health(port, path) {
  try { const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(1500) }); return response.ok ? await response.json() : null; }
  catch { return null; }
}
const backend = await health(apiPort, '/api/health');
if (backend && (!backend.ok || backend.provider !== 'opencode')) throw Error('The API port belongs to another service');
if (!backend) start('server/main.mjs', { PORT: String(apiPort), DOTS_ORIGINAL_UI_PORT: String(uiPort) });
const renderer = await health(uiPort, '/__exact/health');
if (renderer && (renderer.renderer !== 'original-dots' || renderer.apiPort !== apiPort)) throw Error('The renderer port belongs to another service');
if (!renderer) start('exact-host/server.mjs', { DOTS_EXACT_PORT: String(uiPort), DOTS_EXACT_API_PORT: String(apiPort) });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
const readyDeadline = Date.now() + 15000;
for (;;) {
  if (stopping) break;
  const [api, ui] = await Promise.all([health(apiPort, '/api/health'), health(uiPort, '/__exact/health')]);
  if (api?.ok && ui?.renderer === 'original-dots' && ui.apiPort === apiPort) {
    console.log(`Original Dots UI: http://127.0.0.1:${uiPort}/original/webview/`);
    break;
  }
  if (Date.now() >= readyDeadline) { console.error('Local services did not become ready'); process.exitCode = 1; stop(); break; }
  await new Promise(resolve => setTimeout(resolve, 250));
}
