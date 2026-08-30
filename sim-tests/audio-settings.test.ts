/**
 * `src/audio/settings.ts` — player audio/haptic preferences. There is no `localStorage` global in
 * `sim-tests/` (Node), so every read here exercises the same try/catch fallback path a private-
 * browsing tab or a locked-down embed would hit in the browser — see CLAUDE.md "Audio failures
 * must never break the simulation."
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAudioSettings, hapticsEnabled, setHapticsEnabled, setMasterVolume } from '../src/audio/settings';

test('settings: loadAudioSettings never throws with no localStorage and returns sane defaults', () => {
  assert.doesNotThrow(() => loadAudioSettings());
  const s = loadAudioSettings();
  assert.equal(s.haptics, true); // haptics default on
  for (const v of [s.master, s.music, s.ambient, s.sfx, s.disasterWeight]) {
    assert.ok(v >= 0 && v <= 10);
  }
});

test('settings: hapticsEnabled defaults true, and writers never throw without storage', () => {
  assert.equal(hapticsEnabled(), true);
  assert.doesNotThrow(() => setHapticsEnabled(false));
  assert.doesNotThrow(() => setMasterVolume(7));
});
