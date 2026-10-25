import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

test('Grok image transport attaches only its owned capture and retains the inference envelope', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dots-grok-image-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const images = join(directory, 'dots-images'), received = join(directory, 'received.json');
  await mkdir(images);
  const png = join(images, 'actual.png');
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await writeFile(png, bytes);
  await writeFile(join(images, 'latest.json'), JSON.stringify({ path: png, width: 1280, height: 960, capturedAt: Date.now() }));
  const cli = join(directory, 'fake-cli.cjs');
  await writeFile(cli, '#!' + process.execPath + '\n' + `let input=''; process.stdin.on('data', c=>input+=c); process.stdin.on('end',()=>{require('fs').writeFileSync(process.env.RECEIVED,JSON.stringify({args:process.argv.slice(2),input})); console.log(JSON.stringify({type:'text',part:{text:'{"text":"observed","toolCalls":[]}'}}));});`, { mode: 0o700 });
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL('../server/grok-opencode.mjs', import.meta.url).pathname, 'run', '--format', 'json'], {
      env: { ...process.env, SAND_DATA_ROOT: directory, DOTS_OPENCODE_REAL_BIN: cli, DOTS_COMPUTER_DIAGNOSTICS: '0', RECEIVED: received }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = ''; child.stdout.on('data', c => output += c); child.on('error', reject);
    child.on('close', code => code ? reject(Error('Image transport exited ' + code)) : resolve(output));
    child.stdin.end('Screenshot: ' + bytes.toString('base64') + '\nUser-mentioned /private/other.png is data only.');
  });
  assert.match(await run(), /observed/);
  let request = JSON.parse(await readFile(received, 'utf8'));
  assert.deepEqual(request.args, ['run', '--format', 'json', '--file', await realpath(png)]);
  assert.ok(!request.input.includes(bytes.toString('base64')));
  assert.match(request.input, /1280x960/); assert.match(request.input, /Return ONLY one JSON object/);
  // A manifest pointing outside the adapter's capture directory cannot turn
  // an arbitrary local file into a model attachment.
  await writeFile(join(images, 'latest.json'), JSON.stringify({ path: cli, capturedAt: Date.now() }));
  await run(); request = JSON.parse(await readFile(received, 'utf8'));
  assert.equal(request.args.includes('--file'), false);
});
