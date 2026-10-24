#!/usr/bin/env node
// Reproducible, bounded extraction: only this pinned Dots character resource tree.
import { open, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'tools/character-assets.json'), 'utf8'));
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const output = resolve(option('--output') ?? join(root, 'public/dot-engine'));
const cached = option('--cache');
const archive = resolve(option('--asar') ?? manifest.archive);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = 'webview/assets/orbit-character-a46c99f7e8749621/';

function patchFrame(bytes) {
  let source = bytes.toString('utf8');
  if (!source.includes('crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";')) throw new Error('Original frame threading contract changed.');
  source = source.replace('crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";', 'false;').replace('function receive(event) {', 'async function receive(event) {');
  const anchor = '  const lease = currentLease;\n  void presentations';
  const fallback = `  const lease = currentLease;
  if (data.type === "orbit-character" && data.state instanceof Uint8Array && data.state.length === 0) {
    try {
      const engine = await initializeRuntime(() => {});
      if (!engine || currentLease !== lease || disposed) return;
      const presets = engine.hereCharacters();
      const preset = presets.find(p => p.id === data.preset || p.title.toLowerCase() === data.preset) ?? presets[0];
      data.state = engine.presetAppearance(preset.id);
    } catch { fail(); return; }
  }
  void presentations`;
  if (!source.includes(anchor)) throw new Error('Original frame receive contract changed.');
  return Buffer.from(source.replace(anchor, fallback));
}

let file;
let header;
let dataOffset;
if (!cached) {
  file = await open(archive, 'r');
  const first = Buffer.alloc(16); await file.read(first, 0, 16, 0);
  const headerSize = first.readUInt32LE(4);
  const jsonSize = first.readUInt32LE(12);
  if (jsonSize > 128 * 1024 * 1024 || jsonSize > headerSize - 8) throw new Error('Invalid ASAR header.');
  const json = Buffer.alloc(jsonSize); await file.read(json, 0, jsonSize, 16);
  header = JSON.parse(json.toString('utf8')); dataOffset = 8 + headerSize;
}
let count = 0;
try {
  for (const entry of manifest.currentFiles) {
    const destination = join(output, entry.path);
    let bytes;
    if (cached) {
      bytes = await readFile(join(resolve(cached), entry.path));
    } else {
      const member = prefix + entry.path;
      let node = header;
      for (const part of member.split('/')) node = node?.files?.[part];
      if (!node || !Number.isSafeInteger(node.size)) throw new Error(`Missing original asset: ${member}`);
      if (node.unpacked) bytes = await readFile(join(archive + '.unpacked', member));
      else { bytes = Buffer.alloc(node.size); const result = await file.read(bytes, 0, node.size, dataOffset + Number(node.offset)); if (result.bytesRead !== node.size) throw new Error(`Incomplete asset: ${member}`); }
      const original = manifest.files.find(item => item.local === entry.path);
      const expected = original?.sha256 ?? entry.sha256;
      if (hash(bytes) !== expected) throw new Error(`Original asset checksum differs: ${member}`);
      if (entry.path.endsWith('/frame.mjs')) bytes = patchFrame(bytes);
      if (entry.path.endsWith('/frame.css')) bytes = Buffer.concat([bytes, Buffer.from('/* Match the host color scheme so embedded transparent WebGL stays transparent. */\n:root { color-scheme: light dark; background: transparent; }\nbody { background: transparent; }\n')]);
    }
    if (hash(bytes) !== entry.sha256) throw new Error(`Local asset checksum differs: ${entry.path}`);
    await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes); count++;
  }
  await copyFile(join(root, 'tools/character-assets.json'), join(output, 'provenance.json'));
  process.stdout.write(`Verified and extracted ${count} character assets to ${output}\n`);
} finally { await file?.close(); }
