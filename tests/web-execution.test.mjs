import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeExecution, executionLabel } from '../apps/web/lib/execution.ts';
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
