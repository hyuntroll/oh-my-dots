import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDotProfile, DEFAULT_PROFILE, DOT_CHARACTERS } from '../apps/web/lib/dot-profile.ts';
test('corrupt or incomplete profiles cannot skip onboarding or inject unsupported appearance values', () => {
  for (const raw of [null, '{', 'null', '[]', '"value"']) assert.deepEqual(parseDotProfile(raw), DEFAULT_PROFILE);
  assert.deepEqual(parseDotProfile('{"name":"   ","color":"url(x)","avatar":"other","theme":"other","setupStep":9,"setupCompleted":"true"}'), DEFAULT_PROFILE);
});
test('onboarding resumes its saved step and preserves a validated custom identity', () => {
  const saved = { name: '  나의 닷  ', color: 'blue', avatar: 'pet', theme: 'light', setupStep: 5, setupCompleted: false };
  assert.deepEqual(parseDotProfile(JSON.stringify(saved)), { ...saved, name: '나의 닷' });
  assert.equal(parseDotProfile(JSON.stringify({ ...saved, setupCompleted: true })).setupCompleted, true);
  assert.equal(parseDotProfile(JSON.stringify({ name: 'x'.repeat(100) })).name.length, 32);
});

test('all five character selections survive saved profile parsing', () => {
  for (const character of DOT_CHARACTERS) {
    const profile = parseDotProfile(JSON.stringify({ avatar: character.id, color: character.color, setupCompleted: true }));
    assert.equal(profile.avatar, character.id);
    assert.equal(profile.color, character.color);
  }
});

test('character appearance survives parsing without accepting remote portrait URLs or oversized state', () => {
  const profile = parseDotProfile(JSON.stringify({ characterState: 'T1JCQQ==', characterImage: 'data:image/png;base64,aGVsbG8=' }));
  assert.equal(profile.characterState, 'T1JCQQ==');
  assert.equal(profile.characterImage, 'data:image/png;base64,aGVsbG8=');
  const invalid = parseDotProfile(JSON.stringify({ characterState: 'a'.repeat(87385), characterImage: 'https://example.com/avatar.png' }));
  assert.equal(invalid.characterState, undefined);
  assert.equal(invalid.characterImage, undefined);
});
