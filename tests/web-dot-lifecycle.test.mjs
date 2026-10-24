import test from 'node:test';
import assert from 'node:assert/strict';
import { DOT_MENU_LABELS, dotMenu, canRename, relativeTime, dotStatusLabel, clampPip, defaultPipRect, parsePipRect, PIP_MIN_WIDTH, PIP_MIN_HEIGHT, DELETE_DIALOG, REBOOT_DIALOG, RENAME_DIALOG, CALL_UNAVAILABLE } from '../apps/web/lib/dot-lifecycle.ts';

test('dot menu offers every lifecycle action and swaps pause for resume', () => {
  assert.deepEqual(dotMenu({ status: 'ACTIVE', pinned: false }),
    ['rename', 'move', 'pause', 'reboot', 'pin', 'delete']);
  assert.deepEqual(dotMenu({ status: 'PAUSED', pinned: true }),
    ['rename', 'move', 'resume', 'reboot', 'pin', 'delete']);
  assert.deepEqual(Object.keys(DOT_MENU_LABELS).sort(),
    ['delete', 'move', 'pause', 'pin', 'reboot', 'rename', 'resume']);
});

test('rename accepts trimmed names and rejects blank, newline or oversized ones', () => {
  assert.equal(canRename('베르데'), true);
  assert.equal(canRename('  베르데  '), true);
  assert.equal(canRename('x'.repeat(32)), true);
  assert.equal(canRename(''), false);
  assert.equal(canRename('   '), false);
  assert.equal(canRename('x'.repeat(33)), false);
  assert.equal(canRename('두\n줄'), false);
});

test('relative time mirrors the dot panel wording', () => {
  const now = 1_700_000_000_000;
  const seconds = now / 1000;
  assert.equal(relativeTime(seconds - 5, now), '방금 전');
  assert.equal(relativeTime(seconds - 39 * 60, now), '39분 전');
  assert.equal(relativeTime(seconds - 3 * 3600, now), '3시간 전');
  assert.equal(relativeTime(seconds - 2 * 86400, now), '2일 전');
  assert.equal(relativeTime(null, now), '활동 기록 없음');
  assert.equal(relativeTime(NaN, now), '활동 기록 없음');
  assert.match(relativeTime(seconds - 30 * 86400, now), /^\d{4}\. \d+\. \d+\.$/);
});

test('paused dots never report live work and running dots say 작업 중', () => {
  assert.equal(dotStatusLabel('PAUSED', { running: true, waiting: false }), '일시 중지됨');
  assert.equal(dotStatusLabel('ACTIVE', { running: false, waiting: true }), '답변을 기다리는 중');
  assert.equal(dotStatusLabel('ACTIVE', { running: true, waiting: false }), '작업 중');
  assert.equal(dotStatusLabel('ACTIVE', { running: false, waiting: false }), '대기 중');
});

test('floating computer stays inside the window and keeps a usable size', () => {
  const bounds = { width: 1200, height: 800 };
  const rect = defaultPipRect(bounds);
  assert.ok(rect.x >= 8 && rect.y >= 8);
  assert.ok(rect.x + rect.width <= bounds.width - 8);
  assert.ok(rect.y + rect.height <= bounds.height - 8);
  const dragged = clampPip({ x: -500, y: 5000, width: 10, height: 10 }, bounds);
  assert.equal(dragged.x, 8);
  assert.equal(dragged.width, PIP_MIN_WIDTH);
  assert.equal(dragged.height, PIP_MIN_HEIGHT);
  assert.equal(dragged.y, bounds.height - dragged.height - 8);
  const shrunk = clampPip({ x: 0, y: 0, width: 5000, height: 5000 }, { width: 400, height: 300 });
  assert.ok(shrunk.width <= 400 - 16 && shrunk.height <= 300 - 16);
});

test('stored floating geometry recovers from corrupt or missing values', () => {
  const bounds = { width: 1000, height: 700 };
  assert.deepEqual(parsePipRect(null, bounds), defaultPipRect(bounds));
  assert.deepEqual(parsePipRect('{oops', bounds), defaultPipRect(bounds));
  assert.deepEqual(parsePipRect('{"x":"1","y":2,"width":3,"height":4}', bounds), defaultPipRect(bounds));
  assert.deepEqual(parsePipRect('{"x":40,"y":50,"width":320,"height":200}', bounds),
    { x: 40, y: 50, width: 320, height: 200 });
});

test('destructive dialog copy states what is kept and what is removed', () => {
  assert.match(DELETE_DIALOG.body, /대화는 보관/);
  assert.match(DELETE_DIALOG.body, /기억과 컴퓨터가 삭제/);
  assert.match(DELETE_DIALOG.title('베르데'), /베르데/);
  assert.match(REBOOT_DIALOG.body, /대화와 파일은 그대로 유지/);
  assert.equal(REBOOT_DIALOG.confirm, '다시 시작');
  assert.equal(RENAME_DIALOG.subtitle, '짧고 알아보기 쉽게 지어 주세요');
  assert.match(CALL_UNAVAILABLE, /아직 지원하지 않습니다/);
});
