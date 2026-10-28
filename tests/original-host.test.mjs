import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('original host confines static files, keeps CSP local, and streams only its local API', async t => {
  let stream;
  const backend = http.createServer((req, res) => {
    if (req.url === '/api/test-stream') {
      stream = res;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': connected\n\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ actualLocalPath: req.url }));
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  t.after(() => backend.close());
  const reserve = http.createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['exact-host/server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DOTS_EXACT_PORT: String(port), DOTS_EXACT_API_PORT: String(backend.address().port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } });
  await Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(([code]) => { throw Error('Host exited before listening: ' + code); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Host startup timed out')), 5000); timer.unref(); }),
  ]);
  const origin = `http://127.0.0.1:${port}`;
  const bootstrap = await fetch(origin + '/exact-host/bootstrap.mjs');
  assert.equal(bootstrap.status, 200);
  assert.match(bootstrap.headers.get('content-security-policy'), /connect-src 'self' blob:/);
  assert.match(await bootstrap.text(), /installLocalAdapter/);
  const originalCreation = await fetch(origin + '/original/webview/assets/page-a0db2051c101.js');
  assert.equal(originalCreation.status, 200);
  const creationSource = await originalCreation.text();
  assert.match(creationSource, /if\(r\.status!==`ready`\)return;/);
  assert.doesNotMatch(creationSource, /if\(r\.status!==`ready`\|\|r\.orbitIds\.length>0\)return;/);
  assert.match(creationSource, /rc as ExactCreationController/);
  const initialSource = await (await fetch(origin + '/original/webview/assets/app-initial-dddef47d6ef6.js')).text();
  assert.match(initialSource, /function ExactSetSettingsBody/);
  assert.match(initialSource, /function ExactDotNavigationItem/);
  // Encoded separators must not turn the host source route into repo-wide access.
  for (const path of ['/exact-host/..%2fpackage.json', '/exact-host/..%2f.data%2fsettings.json', '/original/..%2f..%2fpackage.json']) {
    const response = await fetch(origin + path);
    assert.notEqual(response.status, 200, path);
  }
  assert.deepEqual(await (await fetch(origin + '/api/health?test=local')).json(), { actualLocalPath: '/api/health?test=local' });
  assert.equal((await fetch(origin + '/api/health', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(origin + '/__exact/health')).status, 200);
  const response = await fetch(origin + '/api/test-stream');
  const reader = response.body.getReader();
  assert.ok((await reader.read()).value.length);
  stream.destroy();
  await reader.read().catch(() => {});
  assert.equal((await fetch(origin + '/__exact/health')).status, 200, 'upstream stream failure must not crash the host');
});
