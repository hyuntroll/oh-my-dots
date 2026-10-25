import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildRoot, grokNode } from '../tools/grok-prepare.mjs';

export const delay = (ms, signal) => new Promise((resolve, reject) => {
  const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(); };
  const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal.reason); };
  const timer = setTimeout(done, ms);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
});
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// Each Dot owns a host and a database. A stop terminates that host's complete
// process group, including its inference CLI, without cancelling another Dot.
export class GrokHost {
  constructor({ directory, model, computer, build = buildRoot, binary = grokNode() }) {
    this.directory = directory; this.model = model; this.build = build; this.binary = binary;
    this.computer = computer;
    this.token = randomBytes(32).toString('hex'); this.log = ''; this.child = null;
  }
  async start(signal) {
    await access(join(this.build, 'dots-grok-build.json')).catch(() => { throw Error('Run npm run grok:prepare before starting the Grok runtime.'); });
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const settingsPath = join(this.directory, 'settings.json');
    let settings = {};
    try { settings = JSON.parse(await readFile(settingsPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(settingsPath, JSON.stringify({ version: 1, ...settings, inferenceProvider: 'opencode',
      agentDefaultModel: { modelId: this.model, maxMode: true, parameters: [] }, hasSeenOnboarding: true,
      computerUseModel: { modelId: this.model, maxMode: true, parameters: [] },
      boxRuntime: 'remote' }), { mode: 0o600 });
    this.url = 'http://127.0.0.1:' + await freePort();
    signal?.throwIfAborted();
    const inherited = Object.fromEntries(['PATH', 'HOME', 'LANG', 'TMPDIR', 'OPENCODE_BIN'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    this.child = spawn(this.binary, [join(this.build, 'dist/host/host-main.cjs')], {
      cwd: this.directory, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...inherited, SAND_LOCAL_PROFILE: '1', SAND_PACKAGED: '1', SAND_DATA_ROOT: this.directory,
        SAND_USER_DATA_DIR: this.directory, SAND_DISABLE_UPDATES: '1', SAND_DISABLE_SENTRY: '1',
        SAND_DISABLE_TELEMETRY: '1', SAND_DISABLE_ANALYTICS: '1', SAND_BOX_AUTO_UPDATE: '0',
        SAND_OPENCODE_MODEL: this.model, SAND_USE_EXISTING_BOX_EXEC_DAEMON: '1',
        OPENCODE_BIN: fileURLToPath(new URL('./grok-opencode.mjs', import.meta.url)),
        DOTS_OPENCODE_REAL_BIN: process.env.OPENCODE_BIN || join(homedir(), '.opencode/bin/opencode'),
        DOTS_COMPUTER_DIAGNOSTICS: process.env.DOTS_COMPUTER_DIAGNOSTICS || '0',
        DOTS_COMPUTER_BRIDGE_URL: this.computer?.url || '', DOTS_COMPUTER_BRIDGE_TOKEN: this.computer?.token || '',
        DOTS_COMPUTER_WIDTH: String(this.computer?.width || 1280), DOTS_COMPUTER_HEIGHT: String(this.computer?.height || 960),
        SAND_GATEWAY_BIND_HOST: '127.0.0.1', SAND_HOST_PORT: new URL(this.url).port,
        SAND_GATEWAY_REQUIRE_AUTH: '1', SAND_GATEWAY_TOKEN: this.token },
    });
    this.exited = new Promise(resolve => { this.child.once('exit', resolve); this.child.once('error', error => { this.failure = error; resolve(); }); });
    const record = bytes => { this.log = (this.log + bytes.toString()).slice(-20000); };
    this.child.stdout.on('data', record); this.child.stderr.on('data', record);
    this.abort = () => { void this.stop(); };
    signal?.addEventListener('abort', this.abort, { once: true }); this.signal = signal;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      if (this.failure || this.child.exitCode !== null) throw Error(this.failure?.message || 'Grok host failed to start: ' + this.log.slice(-2000));
      try { const health = await fetch(this.url + '/health', { signal: AbortSignal.timeout(500) }); if (health.ok) return this; } catch {}
      await delay(150, signal);
    }
    throw Error('Grok host startup timed out. ' + this.log.slice(-1000));
  }
  async call(command, args = {}, signal = this.signal) {
    const response = await fetch(this.url + '/api/' + command, { method: 'POST',
      headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
    const value = await response.json();
    if (!response.ok) throw Error(value.error?.message || value.error || 'Grok gateway HTTP ' + response.status);
    return value;
  }
  async stop() {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      this.signal?.removeEventListener('abort', this.abort);
      if (!this.child?.pid) return;
      const pid = this.child.pid;
      const kill = signal => { try { process.kill(-pid, signal); } catch {} };
      kill('SIGTERM');
      await Promise.race([this.exited, delay(3000)]);
      // The CLI may still be running after the host exits.
      kill('SIGKILL');
      await writeFile(join(this.directory, 'dots-host.log'), this.log, { mode: 0o600 });
    })();
    return this.stopping;
  }
}
