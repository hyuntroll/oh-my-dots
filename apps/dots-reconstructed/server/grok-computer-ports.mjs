// Linked only by grok:prepare. The prompt, Task dispatch, Computer/Screenshot
// tools, original approval controller and runner remain in the Grok source.
import { computerUseExecutorResource } from 'grok-source/packages/agent-exec/computer-use.ts';
import { shellExecutorResource } from 'grok-source/packages/agent-exec/shell.ts';
import { smartModeClassifierExecutorResource } from 'grok-source/packages/agent-exec/smart-mode-classifier.ts';
import { SmartModeClassifierResult, SmartModeClassifierSuccess, SmartModeClassifierDecision } from 'grok-source/packages/proto/generated/agent/v1/smart_mode_classifier_exec_pb.ts';
import { HostBox } from 'grok-source/host/extensions/forever-box/host-box.ts';
import { ComputerUseResult, ComputerUseSuccess, ComputerUseError, ComputerUseToolCall, ComputerUseArgs } from 'grok-source/packages/proto/generated/agent/v1/computer_use_tool_pb.ts';
import { ToolCall } from 'grok-source/packages/proto/generated/agent/v1/agent_pb.ts';
import { createZodAgentTool, withSafeParsedArgs } from 'grok-source/packages/agent/tools/common.ts';
import { createStringResult } from 'grok-source/packages/chat-inference/prompt-executor.ts';
import { toAction, describeOutcome } from 'grok-source/host/runner/tools/sand-computer-tool.ts';
import { createHostComputerToolDependencies } from 'grok-source/host/runner/host-computer-tool-dependencies.ts';
import { createComputerTool } from 'grok-source/host/runner/tools/sand-computer-tool.ts';
import { createPromptCollectorGlue } from 'grok-source/host/runner/prompt-collector-glue.ts';
import { displaySpaceSentence } from 'grok-source/host/box/box-monitor-layout.ts';
import { createProviderPromptSession } from 'grok-source/host/extensions/inference/provider-session.ts';
import { SimplePromptToolExecutor } from 'grok-source/packages/agent/tool-stream-executor.ts';
import { ShellResult, ShellSuccess } from 'grok-source/packages/proto/generated/agent/v1/shell_exec_pb.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createContext } from 'grok-source/packages/context/core.ts';
let desktopAccessor;
export const getDotsComputerAccessor = () => desktopAccessor;
export function bindDotsComputerDependencies(existing) {
  if (!desktopAccessor) throw Error('Dots Docker computer extension is not initialized');
  return createHostComputerToolDependencies({ resourceAccessor: desktopAccessor,
    autoReview: existing?.autoReview, persistImage: existing?.getPersistImage?.(),
    isUnicodeTypingEnabled: existing?.isUnicodeTypingEnabled, onComputerAction: existing?.onComputerAction });
}

// The recovered child constructor has no runStep or production stream owner.
// Bind that missing owner to Grok's existing prompt collector, provider session,
// tool-stream executor and original Computer tool; Task/background scheduling
// and its return path remain in the original SandAgentRunner.
export function createDotsComputerRunStep({ context, getDependencies, model }) {
  let executor;
  let tool;
  return async (step, input) => {
    if (step >= 20) throw Error('Computer task exceeded 20 steps; stop and report the remaining work.');
    if (!executor) {
      const instructions = createPromptCollectorGlue({ isSubagentRunner: true, isComputerUseSubagent: true, remoteBoxHasDesktop: true }).getComputerSection();
      const inner = createProviderPromptSession('opencode', model).getExecutor();
      inner.appendMessages([{ role: 'system', content: instructions + '\n' + displaySpaceSentence({ width: Number(process.env.DOTS_COMPUTER_WIDTH), height: Number(process.env.DOTS_COMPUTER_HEIGHT) }) }, { role: 'user', content: input.prompt }]);
      executor = new SimplePromptToolExecutor(inner);
      try { tool = adaptDotsComputerTool(createComputerTool(getDependencies())); }
      catch (error) { console.error('[dots-computer-subagent-init]', error?.stack || error); throw error; }
    }
    const [ctx, cancel] = (typeof context?.withDetached === 'function' ? context : createContext()).withDetached().withCancel();
    const abort = () => cancel(input.signal.reason);
    input.signal.addEventListener('abort', abort, { once: true });
    if (input.signal.aborted) abort();
    const handler = { invocationId: randomUUID(), emitPartialToolCall() {}, emitToolCallError() {},
      async executeToolCall(_ctx, initial, id, run, complete) {
        input.emitUpdate({ type: 'tool-call', id, name: 'Computer', status: 'pending' });
        try { const result = await run(); input.emitUpdate({ type: 'tool-call', id, name: 'Computer', status: result.result.case === 'success' ? 'done' : 'failed' }); return result; }
        catch (error) { input.emitUpdate({ type: 'tool-call', id, name: 'Computer', status: 'failed' }); throw error; }
      },
    };
    try {
      const stream = executor.executeToolStream(ctx, undefined, handler, [tool], {}, async () => {}, undefined, undefined);
      for await (const _event of stream.fullStream) {}
      const response = await stream.response;
      executor.appendMessages(response.messages);
      const requested = response.messages.some(message => message.role === 'assistant' && Array.isArray(message.content) && message.content.some(part => part.type === 'tool-call'));
      const text = response.messages.filter(message => message.role === 'assistant').flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.filter(part => part.type === 'text').map(part => part.text)).join('\n');
      return requested ? { done: false } : { done: true, value: { text, aborted: input.signal.aborted } };
    } catch (error) { console.error('[dots-computer-subagent]', error?.stack || error); throw error; }
    finally { input.signal.removeEventListener('abort', abort); }
  };
}

// The reconstructed raw Computer tools omit the agent tool protocol wrapper.
// Restore the ordinary Grok serialization/interaction-handler contract while
// calling their original validation, review and execution functions unchanged.
export function adaptDotsComputerTool(raw) {
  const wrap = (args, result) => new ToolCall({ tool: { case: 'computerUseToolCall', value: new ComputerUseToolCall({ args, ...(result ? { result } : {}) }) } });
  const empty = wrap(new ComputerUseArgs());
  return createZodAgentTool(raw.id, {
    name: raw.name, parameters: raw.parameters,
    descriptionGenerator: () => raw.name === 'Screenshot' ? 'Capture the actual current computer screen. Read only.' : 'Operate the computer desktop by screenshot, click, move, drag, type, key, scroll and wait. Each action returns a fresh screenshot. Click and drag require description: a concise statement of the intended UI target and purpose. Include the intended purpose for key and type too. Follow the original computer-use instructions.',
    execute: withSafeParsedArgs(raw.parameters, async (ctx, handler, input, meta) => {
      const sequence = raw.name === 'Screenshot' ? [{ action: 'screenshot' }] : [input, ...(input.then || [])];
      const args = new ComputerUseArgs({ actions: sequence.map(value => toAction(value)) });
      return handler.executeToolCall(ctx, wrap(args), meta.toolCallId,
        async () => { try { return new ComputerUseResult(await raw.execute(input, { ...meta, context: ctx })); } catch (error) { console.error('[dots-computer-tool]', error?.stack || error); throw error; } }, result => wrap(args, result));
    }, empty),
    render: async (_ctx, result) => createStringResult(describeOutcome(result, raw.name === 'Screenshot' ? 'screenshot' : 'computer')),
    serializeError: error => wrap(new ComputerUseArgs(), new ComputerUseResult({ result: { case: 'error', value: new ComputerUseError({ error: error?.message || String(error) }) } })),
  });
}

async function request(body) {
  const url = new URL(process.env.DOTS_COMPUTER_BRIDGE_URL);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw Error('The Dots computer bridge must be loopback HTTP');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.DOTS_COMPUTER_BRIDGE_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Dots computer request failed');
  return result;
}

export function createDotsComputerExtension() {
  const ctx = createContext();
  const accessor = { get(resource) {
    // The upstream cloud classifier is unavailable in local mode. This local
    // review provider NEVER allows an action: it explicitly requires a human
    // decision through Grok's original approval controller and state recheck.
    if (resource === smartModeClassifierExecutorResource) return { async execute() {
      return new SmartModeClassifierResult({ result: { case: 'success', value: new SmartModeClassifierSuccess({ decision: SmartModeClassifierDecision.BLOCK,
        blockReason: '로컬 수동 검토: Grok 클라우드 자동 분류기가 연결되지 않아 이 컴퓨터 조작을 직접 승인해야 합니다.' }) } });
    } };
    if (resource === computerUseExecutorResource) return { async execute(_ctx, args) {
      const result = await request({ operation: 'execute', actions: args.actions.map(action => action.action), description: args.description });
      const directory = join(process.env.SAND_DATA_ROOT, 'dots-images');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, randomUUID() + '.png');
      await writeFile(path, Buffer.from(result.screenshot, 'base64'), { mode: 0o600 });
      await writeFile(join(directory, 'latest.json'), JSON.stringify({ path, width: result.width, height: result.height, capturedAt: Date.now() }), { mode: 0o600 });
      return new ComputerUseResult({ result: { case: 'success', value: new ComputerUseSuccess({ screenshot: result.screenshot, screenshotPath: 'file://' + path }) } });
    } };
    if (resource === shellExecutorResource) return { async execute(_ctx, args) {
      if (args.command === 'curl -sf --max-time 2 "http://127.0.0.1:9223/json/list"') {
        try { return new ShellResult({ result: { case: 'success', value: new ShellSuccess({ exitCode: 0, stdout: JSON.stringify(await request({ operation: 'browser_state' })), stderr: '' }) } }); }
        catch { return new ShellResult({ result: { case: 'success', value: new ShellSuccess({ exitCode: 7, stdout: '', stderr: 'Docker browser page-state query failed' }) } }); }
      }
      // Original desktop prewarm asks box-chrome to prepare its browser. The
      // browser must already exist in the actual Docker desktop; do not report
      // a host shell command as successfully executed.
      throw Error('Shell/CDP is not connected to this Docker computer. Use Computer via the original computerUse Task.');
    } };
    return { async execute() { throw Error('This Grok resource is not connected to the Dots Docker computer.'); } };
  } };
  desktopAccessor = accessor;
  const inner = {
    async ensureReady() { const status = await request({ operation: 'status' }); if (!status.connected) throw Error(status.error || 'Dots computer is disconnected'); return { remoteAccessor: accessor, vncUrl: 'http://127.0.0.1:3480', terminalsFolder: '/workspace' }; },
    async runState() { return (await request({ operation: 'status' })).connected ? 'running' : 'absent'; },
    async listBoxes() { return []; },
    async uploadFile() { throw Error('File transfer is not connected'); }, async downloadFile() { throw Error('File transfer is not connected'); },
    async isAvailable() { return (await request({ operation: 'status' })).connected; },
    getAgentWindowIndex() { return 1; }, maxWindows() { return 1; }, getTerminalsFolder() { return '/workspace'; },
    async ensureWindow(_ctx, _agentId, index) { if (index !== 1) throw Error('Dots has one shared computer screen'); return { windowIndex: 1, vncUrl: 'http://127.0.0.1:3480' }; },
    async releaseWindow() {}, async dispose() {}, describe() { return { backend: 'dots-docker' }; },
  };
  const box = new HostBox(inner);
  return { box, isAutoUpdateEnabled: false, diskPressureLevel: null, diskPressureReminder: undefined,
    getStatus: ({ id }) => box.getStatus(ctx, id), ensure: ({ id }) => box.ensure(ctx, id),
    subscribe: listener => box.subscribe(listener), subscribeToDiskPressure: () => () => {},
    releaseAgent: id => box.releaseWindow(ctx, id), setBusy() {}, setMigrating() {},
    async captureScreenshot() { return Buffer.from((await request({ operation: 'execute', actions: [{ case: 'screenshot', value: {} }] })).screenshot, 'base64'); },
    async reset() { throw Error('Use Dots computer controls to restart the Docker computer'); }, async update() { throw Error('Use Dots computer controls to rebuild the Docker computer'); },
    async autoUpdateNow() { return { started: false, reason: 'managed-by-dots' }; },
  };
}
