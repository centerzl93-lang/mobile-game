/**
 * `AudioManager` (`src/audio/manager.ts`) at the level Node can exercise it: there is no
 * `AudioContext`/`window` in `sim-tests/`, which is itself the "browser audio unavailable" case
 * CLAUDE.md requires the game to survive — see "Audio failures must never break the simulation."
 * The deep playback-decision logic (concurrency/mute/volume/spatial) is covered directly against
 * `decidePlay` in `audio-decision.test.ts`; this file covers the manager's own surface: it never
 * throws, degrades correctly with no context, and the tier/activity bookkeeping around it behaves.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../src/audio/manager';
import { audioBus } from '../src/audio/events';
import type { GameState } from '../src/types';

test('manager: constructing with no AudioContext/window available does not throw', () => {
  assert.doesNotThrow(() => new AudioManager());
});

test('manager: `available` flips false the first time context creation is actually tried', () => {
  const m = new AudioManager();
  assert.equal(m.available, true); // not attempted yet — construction alone never touches the context
  m.unlock(); // this is what actually calls the context factory
  assert.equal(m.available, false); // Node has no AudioContext, so the attempt fails gracefully
});

test('manager: playSfx never throws for an unmapped event, a real event, or with audio unavailable', () => {
  const m = new AudioManager();
  assert.doesNotThrow(() => m.playSfx('BUILDING_PLACED'));
  assert.doesNotThrow(() => m.playSfx('FIRE_STARTED', { x: 1, y: 2 }));
  assert.doesNotThrow(() => m.playSfx('MERCHANT_ARRIVAL'));
});

test('manager: volume/mute/listener setters never throw with no context', () => {
  const m = new AudioManager();
  assert.doesNotThrow(() => {
    m.setMasterVolume(3);
    m.setMusicVolume(0);
    m.setAmbientVolume(10);
    m.setSfxVolume(7);
    m.setDisasterWeight(5);
    m.setMuted(true);
    m.setListenerPosition(10, 10);
  });
});

test('manager: install() plays every bus event through playSfx without throwing, uninstall() detaches it', () => {
  const m = new AudioManager();
  m.install();
  assert.doesNotThrow(() => audioBus.emit('ACHIEVEMENT_EARNED'));
  m.uninstall();
  assert.doesNotThrow(() => audioBus.emit('ACHIEVEMENT_EARNED')); // no subscriber left to react
});

test('manager: installAutoUnlock() is a safe no-op with no `window` (Node)', () => {
  const m = new AudioManager();
  assert.doesNotThrow(() => m.installAutoUnlock());
});

test('manager: updateActivity() reads a GameState and never throws, even for an empty village', () => {
  const m = new AudioManager();
  const state = { citizens: [], buildings: [] } as unknown as GameState;
  assert.doesNotThrow(() => m.updateActivity(state));
  assert.equal(m.ambientIntensity('MINING'), 0);
});

test('manager: playMusicForTier tracks the requested tier and is idempotent on repeat calls', () => {
  let contextAttempts = 0;
  const m = new AudioManager({
    contextFactory: () => {
      contextAttempts++;
      return null; // unavailable — this test only cares how many times it was *asked*
    },
  });
  m.playMusicForTier('settlement');
  assert.equal(contextAttempts, 1); // the first, tier-changing call does reach ensureContext

  m.playMusicForTier('settlement'); // same tier again — must not error, restart, or re-touch the context
  m.playMusicForTier('settlement');
  assert.equal(m.currentMusicTier(), 'settlement');
  assert.equal(contextAttempts, 1); // still just the one attempt — the same-tier guard fires first

  m.playMusicForTier('hamlet'); // a real change
  assert.equal(m.currentMusicTier(), 'hamlet');

  assert.doesNotThrow(() => m.stopMusic());
  assert.equal(m.currentMusicTier(), null);
});

test('manager: setAmbientLayer/stopAmbient never throw and remember the requested intensity', () => {
  const m = new AudioManager();
  m.setAmbientLayer('water', 0.7);
  assert.equal(m.ambientIntensity('water'), 0.7);
  assert.doesNotThrow(() => m.stopAmbient('water'));
});
