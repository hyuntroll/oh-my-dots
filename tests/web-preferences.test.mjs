import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences, shouldSend, shouldNotify, mergeServerPreferences, DEFAULT_PREFERENCES } from '../apps/web/lib/preferences.ts';
test('invalid persisted preferences recover safe defaults and ignore unknown fields', () => {
  for (const value of [null, '{broken', 'null', '[]']) assert.deepEqual(parsePreferences(value), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences('{"sendWith":"unknown","showComputer":"no","reduceMotion":"false"}'), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences('{"theme":"light","sendWith":"modifier-enter","showComputer":false,"reduceMotion":true,"runNotifications":true,"notificationSound":false}'),
    { sendWith: 'modifier-enter', showComputer: false, reduceMotion: true, runNotifications: true, notificationSound: false });
});
test('send shortcut never submits IME composition or Shift+Enter', () => {
  assert.equal(shouldSend('Enter', false, false, false, 'enter'), true);
  assert.equal(shouldSend('Enter', false, false, false, 'modifier-enter'), false);
  assert.equal(shouldSend('Enter', false, true, false, 'modifier-enter'), true);
  assert.equal(shouldSend('Enter', true, true, false, 'modifier-enter'), false);
  assert.equal(shouldSend('Enter', false, true, true, 'modifier-enter'), false);
});
test('server preferences replace local values only when they are usable', () => {
  assert.deepEqual(mergeServerPreferences(DEFAULT_PREFERENCES, null), DEFAULT_PREFERENCES);
  assert.equal(mergeServerPreferences(DEFAULT_PREFERENCES, { runNotifications: true }).runNotifications, true);
  assert.equal(mergeServerPreferences(DEFAULT_PREFERENCES, { sendWith: 'nonsense', runNotifications: 'yes' }).sendWith, 'enter');
});
test('completion notifications fire once and stay silent while the tab is visible', () => {
  assert.equal(shouldNotify('RUNNING', 'COMPLETED', true, false), true);
  assert.equal(shouldNotify('RUNNING', 'COMPLETED', false, false), false);
  assert.equal(shouldNotify('RUNNING', 'COMPLETED', true, true), false);
  assert.equal(shouldNotify('PENDING', 'RUNNING', true, false), false);
  assert.equal(shouldNotify('COMPLETED', 'COMPLETED', true, false), false);
  assert.equal(shouldNotify(undefined, 'FAILED', true, false), false);
});
