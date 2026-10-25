import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/main.mjs';
import { grokEntry } from '../server/grok-runtime.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(t, mode = 'reply') {
  const directory = await mkdtemp(join(tmpdir(), 'dots-grok-'));
  const app = createApp({ dataDir: directory, engine: 'grok', provider: { status: async () => ({ installed: true, provider: 'grok-reconstructed' }) } });
  const calls = [], instances = [];
  app.runtime.pollMs = 5;
  app.runtime.hostFactory = () => {
    const host = { entries: [], sent: false, answered: false, stopped: false, log: '',
      async start(signal) { this.signal = signal; return this; },
      async stop() { this.stopped = true; },
      async call(name, args = {}) {
        calls.push({ name, args });
        if (name === 'createAgent') return { agent: { id: 'actual-agent-1' } };
        if (name === 'sendPrompt') {
          this.sent = true;
          this.entries.push({ id: 'user-' + args.clientNonce, kind: 'message', role: 'user', content: args.prompt });
          this.entries.push({ id: 'scratch', kind: 'assistant-text', text: 'private scratch work' });
          if (mode === 'widget') this.entries.push({ id: 'question1', kind: 'send-message', message: { type: 'widget', widget: { prompt: '어떤 이름?', options: [{ label: '하늘' }] } } });
          else if (mode === 'approval') this.entries.push({ id: 'approval1', kind: 'send-message', message: { type: 'local-tool-permission', ask: { requestId: 'ask1', status: 'pending' } } });
          else if (mode === 'reply') this.entries.push({ id: 'sent1', kind: 'send-message', message: { type: 'text', content: '실제 Grok 전송 메시지' } });
          return { accepted: true };
        }
        if (name === 'getAgentTranscript') return structuredClone(this.entries);
        if (name === 'listAgents') return [{ id: 'actual-agent-1', isRunning: mode === 'hold' }];
        if (name === 'getTrays') return mode === 'failure' && this.sent ? [{ id: 'error1', kind: 'error', agentId: 'actual-agent-1', detail: 'provider quota exhausted' }] : [];
        if (name === 'resolveLocalToolPermission' || name === 'respondToWidget') {
          assert.equal(this.answered, false); this.answered = true;
          const entry = this.entries.find(entry => entry.id === args.entryId);
          if (mode === 'widget') entry.respondedValue = args.value;
          else entry.message.ask.status = args.resolution === 'allow-once' ? 'allowed' : 'denied';
          this.entries.push({ id: 'sent1', kind: 'send-message', message: { type: 'text', content: '응답 반영 완료' } });
          return { accepted: true };
        }
        if (name === 'updateAgent') return {};
        throw Error('Unexpected command ' + name);
      },
    }; instances.push(host); return host;
  };
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const request = async (path, body) => { const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, data: await response.json() }; };
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const profile = (await request('/api/profiles', { display_name: 'Grok 연결' })).data;
  const send = async (text = '안녕') => (await request('/api/messaging/rooms/' + profile.room_id + '/messages', { content: { text }, request_id: text, idempotency_token: text })).data;
  const until = async (id, status) => { for (let n = 0; n < 800; n++) { const task = app.store.get('task', id); if (task.status === status) return task; await wait(5); } throw Error('Expected ' + status + ': ' + JSON.stringify(app.store.get('task', id))); };
  return { app, calls, instances, profile, request, send, until };
}

test('Grok projection sends only explicit chat messages and never exposes scratch work or secret inputs', () => {
  assert.equal(grokEntry({ kind: 'thinking', text: 'secret scratch' }), null);
  assert.equal(grokEntry({ kind: 'assistant-text', text: 'secret scratch' }), null);
  assert.equal(grokEntry({ kind: 'send-message', message: { type: 'secret-request', secretRequest: {} } }).type, 'tool_call');
});
test('original computer approvals remain resolved after subsequent transcript polls', () => {
  for (const [status, expected] of [['pending', 'pending'], ['approved', 'allowed'], ['denied', 'denied'], ['expired', 'interrupted']]) {
    assert.equal(grokEntry({ kind: 'send-message', message: { type: 'auto-review-approval', approval: { requestId: 'review', status } } }).status, expected);
  }
});
test('Grok tasks use original gateway commands and persist only actual SendMessage replies', async t => {
  const f = await fixture(t), sent = await f.send(); await f.until(sent.task.id, 'completed');
  const messages = f.app.store.all('message');
  assert.deepEqual(messages.map(message => message.content.text), ['안녕', '실제 Grok 전송 메시지']);
  assert.equal(f.app.store.get('grok_binding', f.profile.id).agent_id, 'actual-agent-1');
  const call = f.calls.find(call => call.name === 'sendPrompt'); assert.equal(call.args.agentId, 'actual-agent-1'); assert.match(call.args.clientNonce, /^dots-.*-1$/);
  await f.until(sent.task.id, 'completed'); const revision = f.app.store.revision(); await wait(40); assert.equal(f.app.store.revision(), revision);
});
for (const mode of ['widget', 'approval']) test('Grok ' + mode + ' requires an explicit response through the awaited API route', async t => {
  const f = await fixture(t, mode), sent = await f.send(), task = await f.until(sent.task.id, 'needs_input');
  const item = task.items.find(item => item.status === 'pending'); assert.equal(f.instances[0].answered, false);
  let answer = await f.request('/api/approvals/' + item.id + '/respond', { decision: 'allow', ...(mode === 'widget' ? { value: '하늘' } : {}) });
  assert.equal(answer.status, 200); assert.equal(f.instances[0].answered, true);
  await f.until(sent.task.id, 'completed');
  const actual = f.calls.find(call => call.name === (mode === 'widget' ? 'respondToWidget' : 'resolveLocalToolPermission'));
  if (mode === 'approval') assert.equal(actual.args.resolution, 'allow-once'); else assert.equal(actual.args.value, '하늘');
  assert.equal((await f.request('/api/approvals/' + item.id + '/respond', { decision: 'allow', value: 'duplicate' })).status, 409);
});
test('Grok runtime failures remain errors with no invented assistant message', async t => {
  const f = await fixture(t, 'failure'), sent = await f.send(), task = await f.until(sent.task.id, 'error');
  assert.match(task.error, /quota/); assert.equal(f.app.store.all('message').length, 1);
});
test('cancelling a Grok turn stops its owned host and cannot become completed', async t => {
  const f = await fixture(t, 'hold'), sent = await f.send();
  await f.until(sent.task.id, 'in_progress'); await wait(20);
  await f.request('/api/tasks/' + sent.task.id + '/cancel', {});
  await f.until(sent.task.id, 'cancelled'); await wait(30);
  assert.equal(f.instances[0].stopped, true); assert.equal(f.app.store.all('message').length, 1);
});
