import { computerStatus, requestDesktop } from './computer.mjs';

function assert(condition, message) { if (!condition) throw Error(message); }
function point(value, status) {
  assert(value && Number.isInteger(value.x) && Number.isInteger(value.y) && value.x >= 0 && value.y >= 0 && value.x < status.width && value.y < status.height, '화면 좌표가 범위를 벗어났습니다.');
  return { x: value.x, y: value.y };
}
const optionalPoint = (value, status) => value == null ? {} : point(value, status);
function button(value = 1) { assert([1, 2, 3].includes(value), '지원하지 않는 마우스 버튼입니다.'); return value === 2 ? 3 : value === 3 ? 2 : 1; }
export function desktopInputs(actions, status) {
  assert(Array.isArray(actions) && actions.length >= 1 && actions.length <= 11, '컴퓨터 액션은 1~11개여야 합니다.');
  return actions.flatMap(({ case: kind, value = {} }) => {
    if (kind === 'screenshot' || kind === 'cursorPosition') return [];
    if (kind === 'wait') { assert(Number.isInteger(value.durationMs) && value.durationMs >= 0 && value.durationMs <= 30000, '대기 시간은 30초 이하여야 합니다.'); return [{ wait: value.durationMs }]; }
    if (kind === 'mouseMove') return [{ action: 'move', ...point(value.coordinate, status) }];
    if (kind === 'click') { assert(Number.isInteger(value.count) && value.count >= 1 && value.count <= 3, '클릭 횟수가 올바르지 않습니다.'); return Array.from({ length: value.count }, () => ({ action: 'click', ...optionalPoint(value.coordinate, status), button: button(value.button) })); }
    if (kind === 'drag') {
      assert(Array.isArray(value.path) && value.path.length >= 2 && value.path.length <= 256, '드래그 경로가 올바르지 않습니다.');
      const path = value.path.map(value => point(value, status)), key = button(value.button);
      return [{ action: 'down', ...path[0], button: key }, ...path.slice(1).map(p => ({ action: 'move', ...p })), { action: 'up', ...path.at(-1), button: key }];
    }
    if (kind === 'type') { assert(typeof value.text === 'string' && value.text.length <= 8000, '입력할 텍스트가 너무 깁니다.'); return [{ action: 'type', text: value.text }]; }
    if (kind === 'key') {
      const aliases = { ENTER: 'Return', RETURN: 'Return', ESC: 'Escape', ESCAPE: 'Escape', CTRL: 'ctrl', CONTROL: 'ctrl', ALT: 'alt', SHIFT: 'shift', CMD: 'super', COMMAND: 'super', META: 'super', SUPER: 'super', BACKSPACE: 'BackSpace', DELETE: 'Delete', TAB: 'Tab', SPACE: 'space', ARROWUP: 'Up', ARROWDOWN: 'Down', ARROWLEFT: 'Left', ARROWRIGHT: 'Right' };
      assert(typeof value.key === 'string' && value.key.length <= 100, '키 입력이 올바르지 않습니다.');
      // Grok writes CTRL+L; xdotool treats a capital L as Shift+l.
      // Modifier intent is explicit, so normalize one-letter keysyms.
      const key = value.key.split('+').map(key => aliases[key.toUpperCase()] || (/^[A-Z]$/.test(key) ? key.toLowerCase() : key)).join('+');
      assert(/^[A-Za-z0-9_+]+$/.test(key) && !key.startsWith('-'), '키 입력이 올바르지 않습니다.');
      return [{ action: 'key', key }];
    }
    if (kind === 'scroll') { assert([1, 2, 3, 4].includes(value.direction), '스크롤 방향이 올바르지 않습니다.'); assert(Number.isInteger(value.amount) && value.amount >= 0 && value.amount <= 20, '스크롤 양이 범위를 벗어났습니다.'); return [{ action: 'scroll', ...optionalPoint(value.coordinate, status), axis: value.direction >= 3 ? 'horizontal' : 'vertical', delta: value.amount * ([1, 3].includes(value.direction) ? 1 : -1) }]; }
    throw Error('지원하지 않는 Grok 컴퓨터 액션: ' + kind);
  });
}

async function performGrokComputer(runtime, taskId, body) {
  const run = runtime.runs.get(taskId), task = runtime.store.get('task', taskId);
  assert(run && task && !run.controller.signal.aborted, '진행 중인 Grok 작업이 아닙니다.');
  const options = { dataDir: runtime.dataDir, settings: runtime.store.getSettings(), signal: run.controller.signal };
  const status = await computerStatus(options);
  if (body.operation === 'status') return status;
  assert(status.connected, status.error || '컴퓨터가 연결되지 않았습니다.');
  if (body.operation === 'browser_state') return await (await requestDesktop('/browser-state', options)).json();
  assert(!runtime.computerLease || runtime.computerLease === taskId, '다른 Dot이 이 컴퓨터를 사용 중입니다. 작업이 끝난 뒤 다시 시도하세요.');
  runtime.computerLease = taskId;
  if (body.operation === 'handoff') {
    const current = await (await requestDesktop('/control', { ...options, body: { owner: 'USER', epoch: status.epoch } })).json();
    return current;
  }
  assert(body.operation === 'execute', '지원하지 않는 컴퓨터 요청입니다.');
  const inputs = desktopInputs(body.actions, status);
  if (inputs.some(input => input.action)) {
    assert(status.owner === 'AGENT', '사용자가 직접 제어 중입니다. 제어권을 돌려줄 때까지 봇은 조작할 수 없습니다.');
    const approval = await runtime.approval(task, 'computer', { args: { actions: body.actions, description: body.description }, action: 'grok_computer' });
    assert(approval.decision === 'allow', '사용자가 컴퓨터 조작을 거절했습니다.');
  }
  const timer = await import('node:timers/promises');
  const pressed = new Set();
  try { for (const input of inputs) {
    run.controller.signal.throwIfAborted();
    if (input.wait != null) await timer.setTimeout(input.wait, undefined, { signal: run.controller.signal });
    else { await requestDesktop('/input', { ...options, body: { ...input, actor: 'AGENT', epoch: status.epoch } }); if (input.action === 'down') pressed.add(input.button); if (input.action === 'up') pressed.delete(input.button); }
  } } finally { for (const button of pressed) { try { await requestDesktop('/input', { ...options, signal: AbortSignal.timeout(1000), body: { action: 'up', button, actor: 'AGENT', epoch: status.epoch } }); } catch {} } }
  // xdotool acknowledges event delivery before Chromium paints. Let the
  // compositor apply those events before returning the verification image.
  if (inputs.some(input => input.action)) await timer.setTimeout(150, undefined, { signal: run.controller.signal });
  const image = await requestDesktop('/screenshot', options);
  const latest = await computerStatus(options);
  return { screenshot: Buffer.from(await image.arrayBuffer()).toString('base64'), width: latest.width, height: latest.height, epoch: latest.epoch, owner: latest.owner };
}

export async function grokComputer(runtime, taskId, body) {
  const task = runtime.store.get('task', taskId);
  let item;
  if (task && body.operation === 'execute') item = runtime.addItem(task, { type: 'tool_call', name: body.actions?.every(action => action.case === 'screenshot') ? 'Screenshot' : 'Computer', args: { actions: body.actions, description: body.description }, status: 'running' });
  try {
    const result = await performGrokComputer(runtime, taskId, body);
    if (item) runtime.updateItem(task, item.id, { status: 'completed', result: { captured: true, width: result.width, height: result.height, owner: result.owner } });
    return result;
  } catch (error) { if (item) runtime.updateItem(task, item.id, { status: 'error', error: error.message }); throw error; }
}
