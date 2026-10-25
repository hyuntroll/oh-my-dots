// Optional source-level integration test: requires the local Grok checkout.
// It does not call a model or use the user's desktop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { sourceRoot, root } from '../tools/grok-prepare.mjs';

test('actual Grok Computer and Screenshot tools retain protobuf serialization and execute through the Docker port', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'grok-protocol-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { build } = await import(pathToFileURL(join(sourceRoot, 'node_modules/esbuild/lib/main.js')));
  const outfile = join(dir, 'protocol.cjs');
  await build({ stdin: { contents: `
    export { adaptDotsComputerTool, createDotsComputerExtension, bindDotsComputerDependencies, createDotsComputerRunStep, getDotsComputerAccessor } from ${JSON.stringify(join(root, 'server/grok-computer-ports.mjs'))};
    export { smartModeClassifierExecutorResource } from ${JSON.stringify(join(sourceRoot, 'source/packages/agent-exec/smart-mode-classifier.ts'))};
    export { SmartModeClassifierDecision } from ${JSON.stringify(join(sourceRoot, 'source/packages/proto/generated/agent/v1/smart_mode_classifier_exec_pb.ts'))};
    export { createComputerTool, createScreenshotTool } from ${JSON.stringify(join(sourceRoot, 'source/host/runner/tools/sand-computer-tool.ts'))};
    export { createContext } from ${JSON.stringify(join(sourceRoot, 'source/packages/context/core.ts'))};`, resolveDir: root },
    outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'silent',
    plugins: [{ name: 'source-ports', setup(builder) { builder.onResolve({ filter: /^grok-source\// }, args => ({ path: join(sourceRoot, 'source', args.path.slice(12)) })); } }] });
  const api = createRequire(import.meta.url)(outfile), operations = [];
  const desktop = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer protocol-test');
    let data = ''; for await (const chunk of req) data += chunk;
    const body = JSON.parse(data); operations.push(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body.operation === 'status' ? { connected: true } : { screenshot: Buffer.from('png-test').toString('base64'), width: 1280, height: 960 }));
  });
  await new Promise(resolve => desktop.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => desktop.close(resolve)));
  const keys = ['DOTS_COMPUTER_BRIDGE_URL', 'DOTS_COMPUTER_BRIDGE_TOKEN', 'SAND_DATA_ROOT'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { DOTS_COMPUTER_BRIDGE_URL: 'http://127.0.0.1:' + desktop.address().port, DOTS_COMPUTER_BRIDGE_TOKEN: 'protocol-test', SAND_DATA_ROOT: dir });
  t.after(() => { for (const key of keys) if (previous[key] == null) delete process.env[key]; else process.env[key] = previous[key]; });
  api.createDotsComputerExtension();
  const review = await api.getDotsComputerAccessor().get(api.smartModeClassifierExecutorResource).execute();
  assert.equal(review.result.value.decision, api.SmartModeClassifierDecision.BLOCK);
  assert.match(review.result.value.blockReason, /수동 검토/);
  for (const [create, args] of [[api.createScreenshotTool, {}], [api.createComputerTool, { action: 'key', key: 'Control+l' }]]) {
    const tool = api.adaptDotsComputerTool(create(api.bindDotsComputerDependencies()));
    const calls = [], handler = { emitPartialToolCall() {}, async executeToolCall(_ctx, initial, id, run, complete) { calls.push(initial); const result = await run(); calls.push(complete(result)); return result; } };
    const result = await tool.execute(api.createContext(), handler, (async function* () { yield JSON.stringify(args); })(), { toolCallId: 'actual-tool' });
    assert.equal(typeof result.toJson, 'function'); assert.equal(result.result.case, 'success');
    assert.equal(calls.at(-1).tool.case, 'computerUseToolCall');
    assert.match(JSON.stringify(await tool.render(api.createContext(), result)), /Screenshot|Computer action/);
    assert.equal(typeof tool.serializeError(Error('test')).toJson, 'function');
  }
  const execute = operations.filter(value => value.operation === 'execute');
  assert.equal(execute.length, 2); assert.deepEqual(execute[1].actions.map(action => action.case), ['key', 'screenshot']);
  const latest = JSON.parse(await readFile(join(dir, 'dots-images/latest.json'), 'utf8'));
  assert.equal((await readFile(latest.path)).toString(), 'png-test');
  const binary = join(dir, 'fake-opencode.cjs');
  await writeFile(binary, '#!' + process.execPath + '\n' + `let input='';process.stdin.on('data',part=>input+=part);process.stdin.on('end',()=>{const request=JSON.parse(input.split('\\n\\nReturn ONE JSON object:')[0]);const done=request.conversation.some(message=>message.role==='tool');console.log(JSON.stringify({type:'text',part:{id:'answer',text:JSON.stringify(done?{text:'Actual screenshot was captured',toolCalls:[]}:{text:'',toolCalls:[{name:'Computer',args:{action:'screenshot'}}]})}}));});`, { mode: 0o700 });
  const old = process.env.OPENCODE_BIN; process.env.OPENCODE_BIN = binary;
  t.after(() => { if (old == null) delete process.env.OPENCODE_BIN; else process.env.OPENCODE_BIN = old; });
  const step = api.createDotsComputerRunStep({ context: api.createContext(), model: 'test/model', getDependencies: () => api.bindDotsComputerDependencies() });
  const input = { signal: new AbortController().signal, prompt: 'Capture the actual screen once', emitUpdate() {} };
  assert.equal((await step(0, input)).done, false);
  const done = await step(1, input); assert.equal(done.done, true); assert.equal(done.value.text, 'Actual screenshot was captured');
});
