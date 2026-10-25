import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const sourceRoot = resolve(process.env.DOTS_GROK_SOURCE || join(homedir(), 'Github/grok-bot-0.18-reconstructed'));
export const buildRoot = resolve(process.env.DOTS_GROK_BUILD || join(root, '.data/grok-build'));
export function grokNode() {
  for (const binary of [process.env.DOTS_GROK_NODE, process.execPath, '/opt/homebrew/opt/node@26/bin/node', '/opt/homebrew/opt/node/bin/node'].filter(Boolean)) {
    const result = spawnSync(binary, ['-p', 'process.versions.node'], { encoding: 'utf8' });
    if (result.status === 0 && /^26\./.test(result.stdout.trim())) return binary;
  }
  throw Error('Grok runtime requires Node 26. Set DOTS_GROK_NODE to its executable.');
}

export async function prepare() {
  if (!/^26\./.test(process.versions.node)) {
    const result = spawnSync(grokNode(), [fileURLToPath(import.meta.url)], { env: process.env, stdio: 'inherit' });
    if (result.status !== 0) throw Error('Grok host build failed');
    return;
  }
  await access(join(sourceRoot, 'source/host/main.ts'));
  const load = path => import(pathToFileURL(join(sourceRoot, path)));
  const { assembleHostProductionBindingManifest } = await load('scripts/host-production-activation.mjs');
  const validated = await assembleHostProductionBindingManifest();
  if (validated.unboundBindings.length || validated.activationEvidence.runnerRealTurn.status !== 'supported') throw Error('Grok production bindings are incomplete');
  const { build } = await load('node_modules/esbuild/lib/main.js');
  const imports = validated.bindings.map((binding, i) => `import { ${binding.export} as b${i} } from ${JSON.stringify(binding.resolvedModule)};`);
  const value = key => { const i = validated.bindings.findIndex(binding => binding.path === key); if (i < 0) throw Error('Missing Grok binding: ' + key); return `b${i}` + (validated.bindings[i].access === 'call' ? '()' : ''); };
  const entry = `${imports.join('\n')}
import { startProductionHost } from './source/host/main.ts';
import { bindRecoveredProductionExtensions } from './source/host/host-production-extensions.ts';
// This UI integration does not connect to a native desktop or an existing
// loopback exec daemon. Keep the original harness; fail at its box transport.
const box = new Proxy(${value('ports.extensionHost.boxGenerated')}, { get(target, key) {
  if (key === 'createTransport') return () => { throw Error('Grok computer/file execution is not connected in this Dots adapter.'); };
  return Reflect.get(target, key);
}});
void startProductionHost(bindRecoveredProductionExtensions({
  executeBoxCopyInFromEnv: ${value('ports.executeBoxCopyInFromEnv')},
  extensionHost: { boxGenerated: box, convertCloudAgentConversationToTrace: ${value('ports.extensionHost.convertCloudAgentConversationToTrace')} },
  runnerContext: ${value('ports.runnerContext')}, createTranscriptMirror: ${value('ports.createTranscriptMirror')}
}, { stateBackstop: ${value('extensionBindings.stateBackstop')}, localExecCodec: ${value('extensionBindings.localExecCodec')}, secretsContext: ${value('extensionBindings.secretsContext')} })).catch(error => { console.error(error); process.exitCode = 1; });`;
  const host = join(buildRoot, 'dist/host/host-main.cjs');
  await mkdir(resolve(host, '..'), { recursive: true });
  await build({ absWorkingDir: sourceRoot, stdin: { contents: entry, loader: 'ts', resolveDir: sourceRoot },
    outfile: host, bundle: true, platform: 'node', format: 'cjs', target: 'node22', mainFields: ['module', 'main'], logLevel: 'silent' });
  for (const name of ['agent-store-worker', 'transcript-mirror-worker']) {
    const outfile = join(buildRoot, `dist/host/agent-isolation/${name}.cjs`);
    await mkdir(resolve(outfile, '..'), { recursive: true });
    await build({ absWorkingDir: sourceRoot, entryPoints: [join(sourceRoot, `source/host/agent-isolation/${name}.ts`)],
      outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'],
      define: { 'import.meta.url': '__cleanImportMetaUrl' },
      banner: { js: 'const __cleanImportMetaUrl = require("node:url").pathToFileURL(__filename + ".bundled").href;' }, logLevel: 'silent' });
  }
  const { stageNodeTreeSitterRuntime } = await load('scripts/build-tree-sitter-node.mjs');
  await stageNodeTreeSitterRuntime(buildRoot);
  await writeFile(join(buildRoot, 'dots-grok-build.json'), JSON.stringify({ sourceRoot, node: process.version,
    builtAt: new Date().toISOString(), host, computerTransport: 'not-connected' }, null, 2));
  console.log('Grok reconstructed host ready: ' + buildRoot);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepare();
