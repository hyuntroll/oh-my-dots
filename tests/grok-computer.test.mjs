import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/main.mjs';
import { desktopInputs } from '../server/grok-computer-bridge.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const screen = { width: 1280, height: 960 };
test('Grok desktop protocol preserves coordinates, buttons, drag endpoints, key aliases and scroll axes', () => {
  const result = desktopInputs([{ case: 'click', value: { coordinate: { x: 1279, y: 959 }, button: 2, count: 1 } }, { case: 'drag', value: { path: [{ x: 1, y: 2 }, { x: 7, y: 8 }], button: 1 } }, { case: 'key', value: { key: 'Control+a' } }, { case: 'scroll', value: { direction: 1, amount: 3 } }, { case: 'scroll', value: { direction: 4, amount: 2 } }], screen);
  assert.equal(result[0].button, 3); assert.deepEqual(result.slice(1, 4).map(action => action.action), ['down', 'move', 'up']);
  assert.equal(result[4].key, 'ctrl+a'); assert.deepEqual(result[5], { action: 'scroll', axis: 'vertical', delta: 3 });
  assert.deepEqual(result[6], { action: 'scroll', axis: 'horizontal', delta: -2 });
  for (const coordinate of [{ x: 1280, y: 2 }, { x: -1, y: 2 }, { x: 1.2, y: 2 }]) assert.throws(() => desktopInputs([{ case: 'mouseMove', value: { coordinate } }], screen));
  assert.throws(() => desktopInputs([{ case: 'key', value: { key: 'x; rm' } }], screen));
  assert.equal(desktopInputs([{ case: 'key', value: { key: 'CTRL+L' } }], screen)[0].key, 'ctrl+l');
});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'grok-screen-'));
  const inputs = [], state = { connected: true, ...screen, owner: 'AGENT', epoch: 7 };
  const desktop = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer owned-test-desktop');
    let body = ''; for await (const part of req) body += part;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify(state));
    if (req.url === '/screenshot') { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from('actual-test-image')); }
    const input = JSON.parse(body);
    if (req.url === '/control') { assert.equal(input.epoch, state.epoch); state.owner = input.owner; state.epoch++; return res.end(JSON.stringify(state)); }
    if (input.epoch !== state.epoch || input.actor !== state.owner) { res.writeHead(409); return res.end(JSON.stringify({ detail: 'Control revoked or stale input' })); }
    inputs.push(input); res.end(JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => desktop.listen(0, '127.0.0.1', resolve));
  await writeFile(join(dir, 'computer.token'), 'owned-test-desktop', { mode: 0o600 });
  const app = createApp({ dataDir: dir, engine: 'grok', provider: { status: async () => ({ installed: true }) } });
  app.store.patch('settings', 'app', { computer_url: 'http://127.0.0.1:' + desktop.address().port });
  app.store.put('profile', { id: 'dot', status: 'working' });
  app.store.put('task', { id: 'task', profile_id: 'dot', status: 'in_progress', items: [] });
  const controller = new AbortController();
  app.runtime.runs.set('task', { controller, profileId: 'dot' }); app.runtime.tokens.set('task', 'owned-task-token');
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const call = async (body, token = 'owned-task-token') => { const response = await fetch('http://127.0.0.1:' + app.server.address().port + '/internal/grok-computer/task', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  const approval = async () => { for (let n = 0; n < 100; n++) { const pending = app.store.get('task', 'task').items.find(item => item.type === 'approval' && item.status === 'pending'); if (pending) return pending; await pause(5); } assert.fail('No approval'); };
  t.after(async () => { app.runtime.runs.clear(); await app.close(); await new Promise(resolve => desktop.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  return { app, call, approval, inputs, state, controller };
}
test('Grok screenshot uses only the owned desktop and never transfers ownership or accepts an invalid bearer', async t => {
  const f = await fixture(t);
  assert.equal((await f.call({ operation: 'status' }, 'wrong')).status, 401);
  const result = await f.call({ operation: 'execute', actions: [{ case: 'screenshot', value: {} }] });
  assert.equal(result.status, 200); assert.equal(Buffer.from(result.body.screenshot, 'base64').toString(), 'actual-test-image');
  assert.equal(f.state.owner, 'AGENT'); assert.equal(f.inputs.length, 0);
  assert.equal(f.app.store.get('task', 'task').items[0].result.captured, true);
});
test('Grok computer waits for explicit approval and denies without running any input', async t => {
  const f = await fixture(t), request = f.call({ operation: 'execute', actions: [{ case: 'type', value: { text: 'hello' } }] });
  const approval = await f.approval(); assert.equal(f.inputs.length, 0);
  await f.app.runtime.respond(approval.id, { decision: 'deny' });
  assert.equal((await request).status, 500); assert.equal(f.inputs.length, 0);
});
test('an ownership change while an approval is open invalidates all pending Grok inputs', async t => {
  const f = await fixture(t), request = f.call({ operation: 'execute', actions: [{ case: 'click', value: { coordinate: { x: 30, y: 40 }, button: 1, count: 1 } }] });
  const approval = await f.approval(); f.state.owner = 'USER'; f.state.epoch++;
  await f.app.runtime.respond(approval.id, { decision: 'allow' });
  const result = await request; assert.equal(result.status, 409); assert.equal(f.inputs.length, 0);
});
test('Grok applies an approved batch with the same epoch and returns a real final screen', async t => {
  const f = await fixture(t), request = f.call({ operation: 'execute', actions: [{ case: 'key', value: { key: 'Control+l' } }, { case: 'type', value: { text: 'screen check' } }] });
  await f.app.runtime.respond((await f.approval()).id, { decision: 'allow' });
  assert.equal((await request).status, 200); assert.deepEqual(f.inputs.map(input => input.action), ['key', 'type']); assert.ok(f.inputs.every(input => input.actor === 'AGENT' && input.epoch === 7));
});
test('one Grok Dot cannot operate a desktop leased by another task', async t => {
  const f = await fixture(t); f.app.runtime.computerLease = 'another-task';
  const result = await f.call({ operation: 'execute', actions: [{ case: 'screenshot', value: {} }] });
  assert.equal(result.status, 500); assert.equal(f.inputs.length, 0);
});
test('desktop control acknowledgement does not wait for resumed Grok inference', async t => {
  const f = await fixture(t);
  let finish, called = false;
  f.app.runtime.computerHandback = () => { called = true; return new Promise(resolve => { finish = resolve; }); };
  t.after(() => finish?.());
  const response = await fetch('http://127.0.0.1:' + f.app.server.address().port + '/api/computer/control', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'AGENT', epoch: 7 }), signal: AbortSignal.timeout(1500) });
  assert.equal(response.status, 200); assert.equal(called, true); assert.equal((await response.json()).epoch, 8);
  finish();
});
