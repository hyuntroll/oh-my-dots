import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeExecution, executionLabel, toolSteps, stepStatus } from '../apps/web/lib/execution.ts';
const event = (sequence, type, run_id, text) => ({ sequence, type, run_id, summary: text, payload: { text } });
test('snapshot and reconnect replay never regress or duplicate streamed output', () => {
  const latest = event(15, 'message.updated', 'a', '완성된 문장');
  const state = mergeExecution({}, [latest]);
  const replay = mergeExecution(state, [event(12, 'message.updated', 'a', '완성'), latest]);
  assert.equal(replay, state);
  assert.equal(replay.a.message.payload.text, '완성된 문장');
});
test('tool activity supersedes commentary, while another conversation stays separate', () => {
  const state = mergeExecution({}, [event(1, 'message.updated', 'a', '시작'), event(2, 'run.activity', 'a', '파일 확인 중'), event(3, 'message.updated', 'b', '다른 대화')]);
  assert.equal(executionLabel(state.a), '파일 확인 중');
  assert.equal(executionLabel(state.b), '답변을 작성하고 있어요');
});

const toolEvent = (sequence, type, call_id, payload = {}) => ({ sequence, type, run_id: 'a', summary: 'shell_exec', created_at: sequence, payload: { call_id, ...payload } });
test('concurrent same-name tools pair by call id across out-of-order reconnect replay', () => {
  const end = toolEvent(4, 'tool.completed', 'two', { exit_code: 2 });
  let state = mergeExecution({}, [end, toolEvent(2, 'tool.started', 'two'), toolEvent(1, 'tool.started', 'one')]);
  state = mergeExecution(state, [end, toolEvent(3, 'tool.completed', 'one', { exit_code: 0 })]);
  assert.equal(state.a.tools.length, 4);
  const steps = toolSteps(state.a);
  assert.equal(steps.length, 2);
  assert.equal(stepStatus(steps[0], 'COMPLETED'), 'completed');
  assert.equal(stepStatus(steps[1], 'COMPLETED'), 'failed');
});
test('legacy records, cancellation and unfinished terminal runs never stay spinning', () => {
  const state = mergeExecution({}, [toolEvent(1, 'tool.started'), toolEvent(2, 'tool.completed'), toolEvent(3, 'tool.started', 'new')]);
  const steps = toolSteps(state.a);
  assert.equal(steps.length, 2);
  assert.equal(stepStatus(steps[0], 'RUNNING'), 'completed');
  assert.equal(stepStatus(steps[1], 'RUNNING'), 'running');
  assert.equal(stepStatus(steps[1], 'CANCELLED'), 'interrupted');
  const cancelled = toolSteps(mergeExecution(state, [toolEvent(4, 'tool.cancelled', 'new')]).a);
  assert.equal(stepStatus(cancelled[1], 'CANCELLED'), 'cancelled');
});
