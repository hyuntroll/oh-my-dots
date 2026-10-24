import test from 'node:test';
import assert from 'node:assert/strict';
import { dotActivity } from '../apps/web/lib/dot-motion.ts';
test('attention and terminal states override stale running tool events', () => {
  const tools = [{ sequence: 1, type: 'tool.started', summary: 'search', payload: { call_id: 'a' } }];
  assert.equal(dotActivity({ status: 'WAITING_USER' }, { tools }), 'NeedsInput');
  assert.equal(dotActivity({ status: 'WAITING_USER', wait_reason: 'CONTROL' }, { tools }), 'Paused');
  assert.equal(dotActivity({ status: 'FAILED' }, { tools }), 'Error');
  assert.equal(dotActivity({ status: 'COMPLETED' }, { tools }), 'Ready');
});
test('only an unfinished tool drives the character; completion returns to thinking', () => {
  const started = { sequence: 1, type: 'tool.started', summary: 'search', payload: { call_id: 'a' } };
  assert.equal(dotActivity({ status: 'RUNNING' }, { tools: [started] }), 'Searching');
  assert.equal(dotActivity({ status: 'RUNNING' }, { tools: [started, { ...started, sequence: 2, type: 'tool.completed' }] }), 'Thinking');
  assert.equal(dotActivity({ status: 'RUNNING' }, { tools: [{ ...started, summary: 'write_file' }] }), 'Creating');
});
