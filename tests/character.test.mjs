import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { encodeAppearance, decodeAppearance, HEROES, nativePortrait, releaseNativePortraitRenderer } from '../client/lib/character.ts';
import { CharacterActivityController } from '../public/dot-engine/fd5f2a1997e55d5f/activity.mjs';

test('native appearance bytes round trip without lossy JSON conversion', () => {
  const bytes = Uint8Array.from({ length: 65536 }, (_, index) => index % 256);
  assert.deepEqual(decodeAppearance(encodeAppearance(bytes)), bytes);
  assert.throws(() => decodeAppearance('invalid!?'), /base64/);
  assert.throws(() => decodeAppearance('A'.repeat(87385)), /limit/);
  assert.equal(decodeAppearance().length, 0);
  assert.equal(HEROES.length, 8);
});

test('original activity controller preserves episodes and never infers success', () => {
  const calls = [];
  const character = { applyActivity(command) { calls.push(command); return 0; } };
  const controller = new CharacterActivityController();
  assert.equal(controller.bind(character), true);
  controller.requested = { kind: 7, turnId: 'first' };
  assert.equal(controller.apply(character, false), true);
  assert.equal(controller.apply(character, false), true);
  assert.equal(calls.length, 2);
  controller.requested = { kind: 1, turnId: 'second' };
  controller.apply(character, false);
  controller.requested = { kind: 0, turnId: null };
  controller.apply(character, false);
  assert.deepEqual(calls.map(call => call.sequence), [0n, 1n, 2n, 3n]);
  assert.deepEqual(calls.map(call => call.episodeId), [0n, 1n, 2n, 2n]);
  assert.ok(calls.every(call => call.outcome === 0));
});

test('asset extractor independently rebuilds pinned character closure from cache', async () => {
  const destination = await mkdtemp(join(tmpdir(), 'dots-character-test-'));
  try {
    const root = new URL('..', import.meta.url).pathname;
    const { stdout } = await promisify(execFile)(process.execPath, ['tools/extract-character-assets.mjs', '--cache', join(root, 'public/dot-engine'), '--output', destination], { cwd: root });
    assert.match(stdout, /465 character assets/);
    const manifest = JSON.parse(await readFile(join(destination, 'provenance.json'), 'utf8'));
    assert.equal(manifest.currentFiles.length, 465);
  } finally { await rm(destination, { recursive: true, force: true }); }
});

test('missing portraits use one serialized renderer and deduplicate identical appearances', async () => {
  const originals = { window: globalThis.window, document: globalThis.document, location: globalThis.location };
  const browser = new EventTarget();
  let created = 0;
  let active = 0;
  let maximum = 0;
  let snapshots = 0;
  function respond(frame, data) {
    const event = new Event('message');
    Object.defineProperties(event, { source: { value: frame.contentWindow }, origin: { value: 'http://localhost' }, data: { value: data } });
    queueMicrotask(() => browser.dispatchEvent(event));
  }
  globalThis.window = browser;
  globalThis.location = { origin: 'http://localhost' };
  globalThis.document = { createElement() {
    created++;
    const frame = { style: {}, setAttribute() {}, remove() {}, contentWindow: { postMessage(data) {
      if (data.type === 'orbit-character') {
        active++; maximum = Math.max(maximum, active);
        assert.ok(data.state instanceof Uint8Array);
        respond(frame, { type: 'orbit-character', ownerId: data.ownerId, status: 'ready' });
      } else {
        snapshots++; active--;
        respond(frame, { type: 'orbit-character-editor', ownerId: data.ownerId, id: data.id, png: new Uint8Array([137, 80, 78, 71]) });
      }
    } } };
    return frame;
  }, body: { append(frame) { queueMicrotask(() => frame.onload()); } } };
  try {
    const first = nativePortrait('test-one');
    assert.equal(first, nativePortrait('test-one'));
    const [a, b] = await Promise.all([first, nativePortrait('test-two')]);
    assert.ok(a.startsWith('data:image/png;base64,'));
    assert.ok(b.startsWith('data:image/png;base64,'));
    assert.equal(created, 1);
    assert.equal(snapshots, 2);
    assert.equal(maximum, 1);
    await nativePortrait('test-one');
    assert.equal(snapshots, 2);
  } finally {
    releaseNativePortraitRenderer();
    Object.assign(globalThis, originals);
  }
});
