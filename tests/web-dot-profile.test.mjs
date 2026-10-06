import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDotProfile, DEFAULT_PROFILE } from '../apps/web/lib/dot-profile.ts';
test('corrupt or incomplete profiles cannot skip onboarding or inject unsupported appearance values', () => {
  for (const raw of [null, '{', 'null', '[]', '"value"']) assert.deepEqual(parseDotProfile(raw), DEFAULT_PROFILE);
  assert.deepEqual(parseDotProfile('{"name":"   ","color":"url(x)","avatar":"other","theme":"other","setupStep":9,"setupCompleted":"true"}'), DEFAULT_PROFILE);
});
test('onboarding resumes its saved step and preserves a validated custom identity', () => {
  const saved = { name: '  나의 닷  ', color: 'blue', avatar: 'pet', theme: 'light', setupStep: 2, setupCompleted: false };
  assert.deepEqual(parseDotProfile(JSON.stringify(saved)), { ...saved, name: '나의 닷' });
  assert.equal(parseDotProfile(JSON.stringify({ ...saved, setupCompleted: true })).setupCompleted, true);
  assert.equal(parseDotProfile(JSON.stringify({ name: 'x'.repeat(100) })).name.length, 32);
});
