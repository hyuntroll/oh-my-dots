import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalComputerDriver, localKeyName } from '../exact-host/local-computer.mjs';

class OriginalDriverContract {
  constructor() { this.mode = 'observe'; this.errors = []; this.messages = []; }
  _handleModeDidChange(mode) { this.mode = mode; }
  _handleMessage({ data }) { const message = JSON.parse(data); this.messages.push(message); if (message.event === 'control/locked') this.mode = 'control'; if (message.event === 'control/release') this.mode = 'observe'; }
  _handlePeerDidRejection(error) { this.errors.push(error); }
  _handleDataChannelDidClose() {}
  _handleStream(stream) { this.stream = stream; }
  _handleDataChannelDidOpen() {}
  _handlePeerDidResolve() { this.connected = true; }
  disconnect() { this.dataChannel?.close(); this.dataChannel = null; }
}
function desktop({ connected = true, delayGrant } = {}) {
  const state = { connected, owner:'AGENT', epoch:10, width:1280, height:960 };
  const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers:{ 'Content-Type':'application/json' } });
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, method:options.method, body });
    if (url.endsWith('/status')) return json({ ...state });
    if (url.endsWith('/screenshot')) return new Response('bad frame', { headers:{ 'Content-Type':'text/plain' } });
    if (url.endsWith('/control')) {
      if (body.epoch !== state.epoch) return json({ error:'Stale epoch' }, 409);
      if (body.owner === 'USER') await delayGrant?.();
      state.epoch++; state.owner = body.owner;
      return json({ ...state });
    }
    if (url.endsWith('/input')) {
      if (state.owner !== 'USER' || body.actor !== 'USER' || body.epoch !== state.epoch) return json({ error:'Control revoked' }, 409);
      return json({ ok:true });
    }
    return json({ error:'Unexpected endpoint' }, 404);
  };
  return { state, calls, fetchImpl };
}
async function settle(driver) { await driver._localQueue; await Promise.resolve(); }

test('an offline connection reads status without starting or taking control', async () => {
  const service = desktop({ connected:false });
  const Driver = createLocalComputerDriver(OriginalDriverContract, service);
  const driver = new Driver();
  driver._createPeer();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(service.calls.map(call => call.url), ['/api/computer/status']);
  assert.match(driver.errors[0].message, /offline/);
});

test('invalid screen data produces an error, never a substitute image or ownership transfer', async () => {
  const service = desktop();
  const Driver = createLocalComputerDriver(OriginalDriverContract, service);
  const driver = new Driver();
  driver._createPeer();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(service.calls.map(call => call.url), ['/api/computer/status', '/api/computer/screenshot']);
  assert.match(driver.errors[0].message, /screen frame/);
  assert.equal(service.state.owner, 'AGENT');
});

test('only an explicit grant enables inputs with the acknowledged current epoch', async () => {
  const service = desktop();
  const Driver = createLocalComputerDriver(OriginalDriverContract, service);
  const driver = new Driver();
  driver.sendData('keydown', { key:97 });
  assert.equal(service.calls.length, 0);
  driver._localMessage(JSON.stringify({ event:'control/request' }));
  await settle(driver);
  assert.equal(driver.mode, 'control');
  driver.sendData('keydown', { key:0xff0d });
  await settle(driver);
  assert.deepEqual(service.calls.at(-1).body, { action:'keydown', key:'Return', actor:'USER', epoch:11 });
  driver._localMessage(JSON.stringify({ event:'control/release' }));
  await settle(driver);
  assert.equal(service.state.owner, 'AGENT');
  assert.equal(driver.mode, 'observe');
  const releasedCount = service.calls.length;
  driver.sendData('keydown', { key:97 }); await settle(driver);
  assert.equal(service.calls.length, releasedCount);
  driver.disconnect(); await settle(driver);
  driver.sendData('keydown', { key:97 }); await settle(driver);
  assert.equal(service.calls.length, releasedCount);
});

test('ownership changes revoke input and do not release another owner', async () => {
  const service = desktop();
  const Driver = createLocalComputerDriver(OriginalDriverContract, service);
  const driver = new Driver();
  driver._localMessage(JSON.stringify({ event:'control/request' })); await settle(driver);
  service.state.owner = 'AGENT'; service.state.epoch++;
  await driver._status();
  const count = service.calls.length;
  driver.sendData('keydown', { key:97 });
  driver.disconnect(); await settle(driver);
  assert.equal(service.calls.length, count);
  assert.equal(driver.mode, 'observe');
  assert.equal(service.state.owner, 'AGENT');
});

test('release cancels queued input before the ownership transfer completes', async () => {
  const service = desktop();
  let finishInput;
  const blockedInput = new Promise(resolve => { finishInput = resolve; });
  const Driver = createLocalComputerDriver(OriginalDriverContract, { fetchImpl:async (url, options) => {
    const response = await service.fetchImpl(url, options);
    if (url.endsWith('/input')) await blockedInput;
    return response;
  } });
  const driver = new Driver();
  driver._localMessage(JSON.stringify({ event:'control/request' })); await settle(driver);
  driver.sendData('keydown', { key:97 });
  for (let i = 0; i < 20 && !service.calls.some(call => call.url.endsWith('/input')); i++) await new Promise(resolve => setTimeout(resolve, 1));
  driver.sendData('keydown', { key:98 });
  driver._localMessage(JSON.stringify({ event:'control/release' }));
  finishInput(); await settle(driver);
  assert.deepEqual(service.calls.filter(call => call.url.endsWith('/input')).map(call => call.body.key), ['a']);
  assert.equal(service.state.owner, 'AGENT');
  driver.disconnect(); await settle(driver);
});

test('closing while a control grant is pending releases only that acknowledged epoch', async () => {
  let finishGrant;
  const granted = new Promise(resolve => { finishGrant = resolve; });
  const service = desktop({ delayGrant:() => granted });
  const Driver = createLocalComputerDriver(OriginalDriverContract, service);
  const driver = new Driver();
  driver._localMessage(JSON.stringify({ event:'control/request' }));
  for (let i = 0; i < 20 && !service.calls.some(call => call.url.endsWith('/control')); i++) await new Promise(resolve => setTimeout(resolve, 1));
  driver.disconnect(); finishGrant(); await settle(driver);
  assert.equal(service.state.owner, 'AGENT');
  assert.deepEqual(service.calls.filter(call => call.url.endsWith('/control')).map(call => call.body), [{ owner:'USER', epoch:10 }, { owner:'AGENT', epoch:11 }]);
});

test('unsupported clipboard and passkey operations fail explicitly', () => {
  for (const event of ['control/clipboard', 'browser/webauthn/subscribe']) {
    const service = desktop();
    const Driver = createLocalComputerDriver(OriginalDriverContract, service);
    const driver = new Driver();
    driver._localMessage(JSON.stringify({ event, text:'hello' }));
    assert.match(driver.errors[0].message, /unavailable/);
    assert.equal(service.calls.length, 0);
    assert.equal(driver.messages.some(message => message.event?.includes('webauthn/resolved') || message.approved === true), false);
  }
});

test('X11 keysym mapping preserves modifiers, punctuation and Unicode', () => {
  assert.equal(localKeyName(0xffe3), 'Control_L');
  assert.equal(localKeyName(0xffc0), 'F3');
  assert.equal(localKeyName(0x3b), 'semicolon');
  assert.equal(localKeyName(0x0100d55c), 'UD55C');
  assert.throws(() => localKeyName(NaN), /Unsupported/);
});

test('a first click uses its position without requiring a preceding mousemove', async () => {
  class MouseContract extends OriginalDriverContract {
    mouseMoved(point, video) { this.sendData('mousemove', video ? { x:point.x * 2, y:point.y * 2 } : point); }
    sendMouseEvent(event) { this.sendData(event.type, { key:event.button + 1 }); }
  }
  const savedVideo = globalThis.HTMLVideoElement;
  globalThis.HTMLVideoElement = class {};
  try {
    const service = desktop(), Driver = createLocalComputerDriver(MouseContract, service), driver = new Driver();
    driver._localMessage(JSON.stringify({ event:'control/request' })); await settle(driver);
    const target = new globalThis.HTMLVideoElement();
    driver.sendMouseEvent({ type:'mousedown', button:2, offsetX:140, offsetY:120, currentTarget:target });
    driver.sendMouseEvent({ type:'mouseup', button:2, offsetX:140, offsetY:120, currentTarget:target });
    await settle(driver);
    assert.deepEqual(service.calls.filter(call => call.url.endsWith('/input')).map(call => call.body), [
      { action:'move', x:280, y:240, actor:'USER', epoch:11 },
      { action:'down', button:3, x:280, y:240, actor:'USER', epoch:11 },
      { action:'move', x:280, y:240, actor:'USER', epoch:11 },
      { action:'up', button:3, x:280, y:240, actor:'USER', epoch:11 }
    ]);
    driver.sendData('mousedown', { key:1, x:2000, y:-5 }); await settle(driver);
    assert.deepEqual(service.calls.at(-1).body, { action:'down', button:1, x:1279, y:0, actor:'USER', epoch:11 });
    driver.disconnect(); await settle(driver);
  } finally {
    if (savedVideo === undefined) delete globalThis.HTMLVideoElement; else globalThis.HTMLVideoElement = savedVideo;
  }
});


test('successful frame connection is read only and disconnect stops its stream', async () => {
  const savedDocument = globalThis.document, savedBitmap = globalThis.createImageBitmap;
  const calls = [], track = { stopped:false, stop() { this.stopped = true; }, requestFrame() {} };
  const stream = { getTracks:() => [track], getVideoTracks:() => [track] };
  const canvas = { width:0, height:0, getContext:() => ({ drawImage() {} }), captureStream:() => stream };
  globalThis.document = { createElement:name => { assert.equal(name, 'canvas'); return canvas; } };
  globalThis.createImageBitmap = async () => ({ width:1, height:1, close() {} });
  try {
    const Driver = createLocalComputerDriver(OriginalDriverContract, { frameInterval:1000, fetchImpl:async url => {
      calls.push(url);
      if (url.endsWith('/status')) return new Response(JSON.stringify({ connected:true, owner:'AGENT', epoch:7, width:1, height:1 }), { headers:{ 'Content-Type':'application/json' } });
      if (url.endsWith('/screenshot')) return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVF0AAAAASUVORK5CYII=', 'base64'), { headers:{ 'Content-Type':'image/png' } });
      throw Error('Unexpected mutation: ' + url);
    } });
    const driver = new Driver();
    driver._createPeer();
    for (let i = 0; i < 30 && !driver.connected; i++) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(driver.connected, true);
    assert.equal(driver.mode, 'observe');
    assert.deepEqual(calls, ['/api/computer/status', '/api/computer/screenshot']);
    driver.disconnect(); await settle(driver);
    assert.equal(track.stopped, true);
    assert.deepEqual(calls, ['/api/computer/status', '/api/computer/screenshot']);
  } finally {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = savedBitmap;
  }
});
