import { access, mkdir, writeFile, readFile } from 'node:fs/promises';
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
import { createDotsComputerExtension } from 'dots-grok-computer';
// This UI integration does not connect to a native desktop or an existing
// loopback exec daemon. Keep the original harness; fail at its box transport.
const box = new Proxy(${value('ports.extensionHost.boxGenerated')}, { get(target, key) {
  if (key === 'createTransport') return () => { throw Error('Grok computer/file execution is not connected in this Dots adapter.'); };
  return Reflect.get(target, key);
}});
const ports = bindRecoveredProductionExtensions({
  executeBoxCopyInFromEnv: ${value('ports.executeBoxCopyInFromEnv')},
  extensionHost: { boxGenerated: box, convertCloudAgentConversationToTrace: ${value('ports.extensionHost.convertCloudAgentConversationToTrace')} },
  runnerContext: ${value('ports.runnerContext')}, createTranscriptMirror: ${value('ports.createTranscriptMirror')}
}, { stateBackstop: ${value('extensionBindings.stateBackstop')}, localExecCodec: ${value('extensionBindings.localExecCodec')}, secretsContext: ${value('extensionBindings.secretsContext')} });
ports.extensionsById['forever-box'] = { ...ports.extensionsById['forever-box'], start: () => createDotsComputerExtension() };
void startProductionHost(ports).catch(error => { console.error(error); process.exitCode = 1; });`;
  const host = join(buildRoot, 'dist/host/host-main.cjs');
  await mkdir(resolve(host, '..'), { recursive: true });
  await build({ absWorkingDir: sourceRoot, stdin: { contents: entry, loader: 'ts', resolveDir: sourceRoot },
    outfile: host, bundle: true, platform: 'node', format: 'cjs', target: 'node22', mainFields: ['module', 'main'], logLevel: 'silent',
    plugins: [{ name: 'dots-computer-boundary', setup(builder) {
      builder.onResolve({ filter: /^dots-grok-computer$/ }, () => ({ path: join(root, 'server/grok-computer-ports.mjs') }));
      builder.onResolve({ filter: /^grok-source\// }, args => ({ path: join(sourceRoot, 'source', args.path.slice('grok-source/'.length)) }));
      builder.onLoad({ filter: /\/box-monitor-layout\.ts$/ }, async args => ({ contents: (await readFile(args.path, 'utf8')).replace('SAND_MONITOR_HEIGHT = 800', 'SAND_MONITOR_HEIGHT = Number(process.env.DOTS_COMPUTER_HEIGHT || 800)').replace('SAND_MONITOR_WIDTH = 1280', 'SAND_MONITOR_WIDTH = Number(process.env.DOTS_COMPUTER_WIDTH || 1280)'), loader: 'ts' }));
      builder.onLoad({ filter: /\/host-runner-composition\.ts$/ }, async args => {
        let contents = await readFile(args.path, 'utf8');
        const needle = 'const provider: TurnToolsetHostFactoryProvider = {';
        if (contents.split(needle).length !== 2) throw Error('Grok computer factory binding changed');
        contents = contents.replace(needle, needle + `
          createScreenshotToolInputs: (_turn, props) => ({ dependencies: bindDotsComputerDependencies(
            props.createScreenshotToolDependencies?.(props) ?? createHostComputerToolDependencies({ resourceAccessor: props.resourceAccessor, persistImage: persistImageForTurn })) }),
          createComputerToolInputs: (_turn, props) => ({ dependencies: bindDotsComputerDependencies(
            props.createComputerToolDependencies?.(props) ?? createHostComputerToolDependencies({ resourceAccessor: props.resourceAccessor, persistImage: persistImageForTurn })) }),
          createRequestBoxHelpToolInputs: turn => ({ dependencies: {
            getAgentId: () => session.id,
            endTurn: () => { if (typeof turn.endThisRunAwaitingUser !== 'function') throw Error('Grok handoff lifecycle is unavailable'); turn.endThisRunAwaitingUser('computer handoff'); },
            requestHelp: request => extensions.api('session').startHandoff(request),
            onSendMessage: (message, timestampMs) => turn.emitUpdate?.({ type: 'send-message', message, timestampMs })
          } }),
        `);
        const configs = 'subagentConfigs: [],';
        if (contents.split(configs).length !== 2) throw Error('Grok computerUse Task configuration binding changed');
        contents = contents.replace(configs, 'subagentConfigs: [createSandComputerUseSubagentConfig(false)],');
        const owner = 'createAgentOwnerInput: ({ requestId, runOptions, context, cancelThisRun, emitUpdate }) => {';
        if (contents.split(owner).length !== 2) throw Error('Grok handoff owner binding changed');
        contents = contents.replace(owner, owner.replace('emitUpdate }', 'emitUpdate, endThisRunAwaitingUser }'));
        const turn = '            ...baseTurn,\n            emitUpdate,\n            cancelThisRun,';
        if (contents.split(turn).length !== 2) throw Error('Grok handoff turn binding changed');
        contents = contents.replace(turn, turn + '\n            endThisRunAwaitingUser,');
        const child = 'productionTurnRunShell: undefined,';
        if (contents.split(child).length !== 2) throw Error('Grok computerUse child runner binding changed');
        contents = contents.replace(child, child + `
          ...(args.subagentType.replace(/[-_ ]/g, '').toLowerCase() === 'computeruse' ? { runStep: createDotsComputerRunStep({ context: ctx,
            model: process.env.SAND_OPENCODE_MODEL,
            getDependencies: () => bindDotsComputerDependencies(createTurnToolProjections?.({ resourceAccessor: getDotsComputerAccessor() })?.createComputerToolDependencies()) }) } : {}),
        `);
        contents = contents.replace('const child = deps.buildRunner({', `if (process.env.DOTS_COMPUTER_DIAGNOSTICS === '1') console.error('[dots-subagent-type]', args.subagentType);\nconst child = deps.buildRunner({`);
        return { contents: `import { bindDotsComputerDependencies, createDotsComputerRunStep, getDotsComputerAccessor } from 'dots-grok-computer';\nimport { createSandComputerUseSubagentConfig } from './runner/tools/sand-computer-use-subagent.js';\n` + contents, loader: 'ts', resolveDir: resolve(args.path, '..') };
      });
      builder.onLoad({ filter: /\/production-turn-run-shell-adapter\.ts$/ }, async args => {
        let contents = await readFile(args.path, 'utf8');
        const relay = '          cancelThisRun: input.cancelThisRun,\n          emitUpdate,';
        if (contents.split(relay).length !== 2) throw Error('Grok handoff lifecycle relay changed');
        contents = contents.replace(relay, relay + `\n          endThisRunAwaitingUser: reason => {
            const callbacks = updateRelay.callbacks;
            if (!callbacks) throw Error('Grok handoff has no active turn');
            callbacks.pauseForUser(reason);
          },`);
        const owner = '      cancelThisRun,\n      emitUpdate,\n    }) => createProductionTurnAgentOwner({';
        if (contents.split(owner).length !== 2) throw Error('Grok handoff owner relay changed');
        contents = contents.replace(owner, owner.replace('      emitUpdate,', '      emitUpdate,\n      endThisRunAwaitingUser,'));
        const forward = '        cancelThisRun,\n        emitUpdate,\n      }),';
        if (contents.split(forward).length !== 2) throw Error('Grok handoff factory relay changed');
        contents = contents.replace(forward, forward.replace('        emitUpdate,', '        emitUpdate,\n        endThisRunAwaitingUser,'));
        return { contents, loader: 'ts', resolveDir: resolve(args.path, '..') };
      });
      builder.onLoad({ filter: /\/tools\/turn-toolset\.ts$/ }, async args => {
        let contents = await readFile(args.path, 'utf8');
        for (const name of ['Computer', 'Screenshot']) {
          const needle = `asTurnTool(create${name}Tool(input.dependencies))`;
          if (contents.split(needle).length !== 2) throw Error('Grok computer tool protocol binding changed');
          contents = contents.replace(needle, `asTurnTool(adaptDotsComputerTool(create${name}Tool(input.dependencies)))`);
        }
        return { contents: `import { adaptDotsComputerTool } from 'dots-grok-computer';\n` + contents, loader: 'ts', resolveDir: resolve(args.path, '..') };
      });
    } }] });
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
    builtAt: new Date().toISOString(), host, computerTransport: 'dots-docker' }, null, 2));
  console.log('Grok reconstructed host ready: ' + buildRoot);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepare();
