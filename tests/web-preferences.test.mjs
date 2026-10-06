import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences, shouldSend, DEFAULT_PREFERENCES } from '../apps/web/lib/preferences.ts';
test('invalid persisted preferences recover safe defaults and ignore unknown fields', () => {
  for (const value of [null, '{broken', 'null', '[]']) assert.deepEqual(parsePreferences(value), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences('{"sendWith":"unknown","showComputer":"no","reduceMotion":"false"}'), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences('{"sendWith":"modifier-enter","showComputer":false,"reduceMotion":true}'), { sendWith:'modifier-enter', showComputer:false, reduceMotion:true });
});
test('send shortcut never submits IME composition or Shift+Enter', () => {
  assert.equal(shouldSend('Enter', false, false, false, 'enter'), true);
  assert.equal(shouldSend('Enter', false, false, false, 'modifier-enter'), false);
  assert.equal(shouldSend('Enter', false, true, false, 'modifier-enter'), true);
  assert.equal(shouldSend('Enter', true, true, false, 'modifier-enter'), false);
  assert.equal(shouldSend('Enter', false, true, true, 'modifier-enter'), false);
});
