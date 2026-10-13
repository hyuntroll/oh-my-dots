import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectComputerStream } from '../apps/web/lib/computer-stream.ts';

const settle = () => new Promise(resolve => setImmediate(resolve));
class FakeRFB extends EventTarget {
  constructor() { super(); this.disconnects = 0; }
  disconnect() { this.disconnects++; this.dispatchEvent(new Event('disconnect')); }
}
function setup(t, load) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const instances = [], statuses = [], retries = [], recoveries = [];
  const host = { replaceChildren() {} };
  const RFB = class extends FakeRFB { constructor() { super(); instances.push(this); } };
  const stream = connectComputerStream(host, 'ws://test', load || (() => Promise.resolve(RFB)),
    state => statuses.push(state), () => recoveries.push(true), () => retries.push(true));
  t.after(() => stream.close());
  return { stream, instances, statuses, retries, recoveries };
}

test('healthy stream survives resume and unrelated health/status polling', async t => {
  const { stream, instances, retries } = setup(t);
  await settle();
  instances[0].dispatchEvent(new Event('connect'));
  for (let n = 0; n < 10; n++) stream.resume();
  t.mock.timers.tick(60_000);
  assert.equal(instances[0].disconnects, 0);
  assert.equal(instances.length, 1);
  assert.equal(retries.length, 0);
});

test('real disconnect requests one recovery and one retry, despite duplicate events', async t => {
  const { instances, statuses, retries, recoveries } = setup(t);
  await settle();
  instances[0].dispatchEvent(new Event('connect'));
  instances[0].dispatchEvent(new Event('disconnect'));
  instances[0].dispatchEvent(new Event('disconnect'));
  assert.deepEqual(statuses, ['connecting', 'connected', 'disconnected']);
  assert.equal(recoveries.length, 1);
  t.mock.timers.tick(2499);
  assert.equal(retries.length, 0);
  t.mock.timers.tick(1);
  assert.equal(retries.length, 1);
});

test('stalled handshake is closed; resume accelerates recovery only once', async t => {
  const { stream, instances, statuses, retries } = setup(t);
  await settle();
  t.mock.timers.tick(10_000);
  assert.equal(instances[0].disconnects, 1);
  assert.equal(statuses.at(-1), 'disconnected');
  stream.resume(); stream.resume();
  t.mock.timers.tick(10_000);
  assert.equal(retries.length, 1);
});

test('closing a pending import cannot create a stale connection', async t => {
  let resolve;
  const pending = new Promise(yes => { resolve = yes; });
  const { stream, retries } = setup(t, () => pending);
  stream.close();
  resolve(class { constructor() { assert.fail('stale connection'); } });
  await settle();
  t.mock.timers.tick(60_000);
  assert.equal(retries.length, 0);
});

test('unmount closes a healthy socket without scheduling recovery', async t => {
  const { stream, instances, retries, recoveries } = setup(t);
  await settle();
  instances[0].dispatchEvent(new Event('connect'));
  stream.close();
  t.mock.timers.tick(60_000);
  assert.equal(instances[0].disconnects, 1);
  assert.equal(recoveries.length, 0);
  assert.equal(retries.length, 0);
});
