import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from '../apps/web/lib/api.ts';
import { RemoteInputQueue } from '../apps/web/lib/remote-input.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));
const user = () => ({ connected: true, owner: 'USER', epoch: 1, handoff: false });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('drag burst keeps its last position and mouse-up before the next app launch', async () => {
  const first = deferred(), sent = [];
  const queue = new RemoteInputQueue(user, async entry => {
    sent.push(entry.body);
    if (sent.length === 1) await first.promise;
  }, assert.fail);
  queue.send({ action: 'down', x: 10, y: 10 });
  for (let x = 11; x <= 1000; x++) queue.send({ action: 'move', x, y: 10 });
  queue.send({ action: 'up', x: 1000, y: 10 });
  queue.release();
  queue.send({ action: 'launch', app: 'terminal' });
  first.resolve(); await turn();
  assert.deepEqual(sent.map(body => body.action), ['down', 'move', 'up', undefined, 'launch']);
  assert.equal(sent[1].x, 1000);
});

test('pending typing is combined without reordering Enter', async () => {
  const first = deferred(), sent = [];
  const queue = new RemoteInputQueue(user, async entry => {
    sent.push(entry.body); if (sent.length === 1) await first.promise;
  }, assert.fail);
  for (const text of '안녕하세요') queue.send({ action: 'type', text });
  queue.send({ action: 'keydown', key: 'Return' });
  first.resolve(); await turn();
  assert.deepEqual(sent, [{ action: 'type', text: '안' }, { action: 'type', text: '녕하세요' }, { action: 'keydown', key: 'Return' }]);
});

test('ownership change rejects queued input from the previous epoch', async () => {
  const first = deferred(), sent = []; let state = user();
  const queue = new RemoteInputQueue(() => state, async entry => {
    sent.push(entry); if (sent.length === 1) await first.promise;
  }, assert.fail);
  queue.send({ action: 'down' }); queue.send({ action: 'type', text: 'stale' });
  state = { ...state, epoch: 2 }; first.resolve(); await turn();
  queue.send({ action: 'launch', app: 'files' }); await turn();
  assert.deepEqual(sent.map(entry => [entry.body.action, entry.epoch]), [['down', 1], ['launch', 2]]);
});

test('reset aborts a stalled request and new input can run', async () => {
  const sent = [];
  const queue = new RemoteInputQueue(user, async (entry, signal) => {
    sent.push(entry.body.action);
    if (sent.length === 1) await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  }, assert.fail);
  queue.send({ action: 'down' }); queue.send({ action: 'move' });
  queue.reset(); queue.release(); queue.send({ action: 'launch', app: 'terminal' }); await turn();
  assert.deepEqual(sent, ['down', undefined, 'launch']);
});

test('failed input clears uncertain actions, releases keys and accepts subsequent input', async () => {
  const first = deferred(), sent = [], errors = [];
  const queue = new RemoteInputQueue(user, async entry => {
    sent.push(entry.body.action); if (sent.length === 1) await first.promise;
  }, error => errors.push(error));
  queue.send({ action: 'down' }); queue.send({ action: 'type', text: 'do not replay' });
  first.reject(new Error('timeout')); await turn();
  queue.send({ action: 'launch', app: 'files' }); await turn();
  assert.deepEqual(sent, ['down', undefined, 'launch']); assert.equal(errors.length, 1);
});

test('request deadline covers both connection and reading the response', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const aborted = signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  globalThis.fetch = async (_, { signal }) => aborted(signal);
  await assert.rejects(api('/stalled', {}, 20), { name: 'TimeoutError' });
  globalThis.fetch = async (_, { signal }) => ({ ok: true, json: () => aborted(signal) });
  await assert.rejects(api('/stalled-body', {}, 20), { name: 'TimeoutError' });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ recovered: true }) });
  assert.deepEqual(await api('/recovered'), { recovered: true });
});
