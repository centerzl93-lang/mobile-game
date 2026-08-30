/**
 * `decidePlay` (`src/audio/decision.ts`) — the pure "should this play, and how loud" policy behind
 * `AudioManager.playSfx`. Everything CLAUDE.md asks for around settings/concurrency/spatial audio
 * is a plain function of data here, with no `AudioContext` involved, so it is exercised directly.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePlay, CATEGORY_MAX_CONCURRENT, type AudioSettingsSnapshot } from '../src/audio/decision';
import { ConcurrencyGate } from '../src/audio/concurrency';
import type { AudioAssetDef } from '../src/audio/assets';
import type { AudioEvent } from '../src/audio/events';

const fullVolume: AudioSettingsSnapshot = { master: 10, music: 10, ambient: 10, sfx: 10, disasterWeight: 10, muted: false };

/** A tiny asset map covering just the events a given test needs, so tests never depend on
 *  `AUDIO_ASSET_MAP`'s real (currently empty, Phase 2) `variations`. */
function assetMap(overrides: Partial<Record<AudioEvent, AudioAssetDef>>): Record<AudioEvent, AudioAssetDef> {
  return overrides as Record<AudioEvent, AudioAssetDef>;
}

const woodcut: AudioAssetDef = {
  category: 'sfx',
  variations: ['woodcut_01.mp3', 'woodcut_02.mp3'],
  dir: 'buildings',
  maxConcurrent: 2,
  cooldownMs: 100,
};

test('decision: an event missing from the asset map never plays (graceful, no crash)', () => {
  const gate = new ConcurrencyGate();
  const d = decidePlay('BUILDING_PLACED', {}, fullVolume, gate, 0, undefined, assetMap({}));
  assert.equal(d.play, false);
  assert.equal(d.reason, 'no-asset');
});

test('decision: an event with an empty variations array (the Phase-1 default) never plays', () => {
  const gate = new ConcurrencyGate();
  const map = assetMap({ BUILDING_PLACED: { category: 'sfx', variations: [], dir: 'ui' } });
  const d = decidePlay('BUILDING_PLACED', {}, fullVolume, gate, 0, undefined, map);
  assert.equal(d.play, false);
  assert.equal(d.reason, 'no-asset');
});

test('decision: a registered event with a real asset plays and picks a variation', () => {
  const gate = new ConcurrencyGate();
  const map = assetMap({ WOODCUTTING: woodcut });
  const d = decidePlay('WOODCUTTING', {}, fullVolume, gate, 0, undefined, map, () => 'woodcut_01.mp3');
  assert.equal(d.play, true);
  assert.equal(d.variation, 'woodcut_01.mp3');
  assert.ok(d.gain > 0);
});

test('decision: global mute prevents playback even with a valid asset', () => {
  const gate = new ConcurrencyGate();
  const map = assetMap({ WOODCUTTING: woodcut });
  const muted: AudioSettingsSnapshot = { ...fullVolume, muted: true };
  const d = decidePlay('WOODCUTTING', {}, muted, gate, 0, undefined, map);
  assert.equal(d.play, false);
  assert.equal(d.reason, 'muted');
});

test('decision: master volume at zero prevents playback', () => {
  const gate = new ConcurrencyGate();
  const map = assetMap({ WOODCUTTING: woodcut });
  const d = decidePlay('WOODCUTTING', {}, { ...fullVolume, master: 0 }, gate, 0, undefined, map);
  assert.equal(d.play, false);
  assert.equal(d.reason, 'muted');
});

test('decision: the event\'s own category volume at zero prevents playback', () => {
  const gate = new ConcurrencyGate();
  const map = assetMap({ WOODCUTTING: woodcut }); // sfx category
  const d = decidePlay('WOODCUTTING', {}, { ...fullVolume, sfx: 0 }, gate, 0, undefined, map);
  assert.equal(d.play, false);
});

test('decision: a lowered category volume scales gain but does not block playback', () => {
  const gate = new ConcurrencyGate();
  const map = assetMap({ WOODCUTTING: woodcut });
  const full = decidePlay('WOODCUTTING', {}, fullVolume, gate, 0, undefined, map);
  const gate2 = new ConcurrencyGate();
  const half = decidePlay('WOODCUTTING', {}, { ...fullVolume, sfx: 5 }, gate2, 0, undefined, map);
  assert.equal(half.play, true);
  assert.ok(half.gain < full.gain);
});

test('decision: disaster events are additionally scaled by the disaster-noises weight', () => {
  const map = assetMap({ FIRE_STARTED: { category: 'sfx', variations: ['fire.mp3'], dir: 'events' } });
  const loud = decidePlay('FIRE_STARTED', {}, fullVolume, new ConcurrencyGate(), 0, undefined, map);
  const quiet = decidePlay('FIRE_STARTED', {}, { ...fullVolume, disasterWeight: 0 }, new ConcurrencyGate(), 0, undefined, map);
  assert.equal(loud.play, true);
  assert.equal(quiet.play, false); // scaled all the way to silent, so it's not worth playing at all
});

test('decision: a non-disaster event is unaffected by the disaster-noises weight', () => {
  const map = assetMap({ WOODCUTTING: woodcut });
  const d = decidePlay('WOODCUTTING', {}, { ...fullVolume, disasterWeight: 0 }, new ConcurrencyGate(), 0, undefined, map);
  assert.equal(d.play, true);
});

test('decision: a positioned sound close to the listener is louder than one far away', () => {
  const map = assetMap({ FIRE_STARTED: { category: 'sfx', variations: ['fire.mp3'], dir: 'events' } });
  const near = decidePlay('FIRE_STARTED', { x: 1, y: 0 }, fullVolume, new ConcurrencyGate(), 0, { x: 0, y: 0 }, map);
  const far = decidePlay('FIRE_STARTED', { x: 20, y: 0 }, fullVolume, new ConcurrencyGate(), 0, { x: 0, y: 0 }, map);
  assert.ok(near.gain > far.gain);
});

test('decision: a sound beyond the spatial radius is inaudible', () => {
  const map = assetMap({ FIRE_STARTED: { category: 'sfx', variations: ['fire.mp3'], dir: 'events' } });
  const d = decidePlay('FIRE_STARTED', { x: 1000, y: 0 }, fullVolume, new ConcurrencyGate(), 0, { x: 0, y: 0 }, map);
  assert.equal(d.play, false);
});

test('decision: an unpositioned sound is unaffected by a listener position (village-wide cues)', () => {
  const map = assetMap({ ACHIEVEMENT_EARNED: { category: 'sfx', variations: ['ding.mp3'], dir: 'achievements' } });
  const d = decidePlay('ACHIEVEMENT_EARNED', {}, fullVolume, new ConcurrencyGate(), 0, { x: 999, y: 999 }, map);
  assert.equal(d.play, true);
  assert.equal(d.gain, 1);
});

test('decision: per-event cooldown throttles a rapid retrigger of the same event', () => {
  const gate = new ConcurrencyGate();
  const map = assetMap({ WOODCUTTING: woodcut });
  const first = decidePlay('WOODCUTTING', {}, fullVolume, gate, 0, undefined, map);
  assert.equal(first.play, true);
  for (const k of first.releaseKeys) gate.release(k);
  const second = decidePlay('WOODCUTTING', {}, fullVolume, gate, 10, undefined, map); // 10ms < 100ms cooldown
  assert.equal(second.play, false);
  assert.equal(second.reason, 'throttled');
});

test('decision: per-event maxConcurrent caps simultaneous instances of one event', () => {
  const gate = new ConcurrencyGate();
  const map = assetMap({
    WOODCUTTING: { category: 'sfx', variations: ['a.mp3'], dir: 'buildings', maxConcurrent: 2, cooldownMs: 0 },
  });
  const plays = [0, 1, 2, 3].map((i) => decidePlay('WOODCUTTING', {}, fullVolume, gate, i, undefined, map));
  assert.equal(plays.filter((p) => p.play).length, 2);
});

test('decision: a rejected decision releases whatever slot it provisionally acquired', () => {
  // maxConcurrent: 1 on the event, so the second call must not leave a leaked slot behind — the
  // *third* call at the same instant should behave identically to the second, not compound.
  const gate = new ConcurrencyGate();
  const map = assetMap({
    WOODCUTTING: { category: 'sfx', variations: ['a.mp3'], dir: 'buildings', maxConcurrent: 1, cooldownMs: 0 },
  });
  decidePlay('WOODCUTTING', {}, fullVolume, gate, 0, undefined, map);
  const second = decidePlay('WOODCUTTING', {}, fullVolume, gate, 0, undefined, map);
  const third = decidePlay('WOODCUTTING', {}, fullVolume, gate, 0, undefined, map);
  assert.equal(second.play, false);
  assert.equal(third.play, false);
  assert.equal(gate.activeCount('evt:WOODCUTTING'), 1); // still just the first play's slot
});

test('decision: the shared per-category cap throttles a burst across many distinct events', () => {
  const gate = new ConcurrencyGate();
  const events: AudioEvent[] = [
    'BUILDING_PLACED', 'INVALID_ACTION', 'BUTTON_CONFIRM', 'BUTTON_ERROR',
    'CONSTRUCTION_STARTED', 'CONSTRUCTION_COMPLETED', 'BUILDING_DAMAGED', 'BUILDING_REPAIRED',
  ];
  const map = assetMap(
    Object.fromEntries(
      events.map((e) => [e, { category: 'sfx', variations: [`${e}.mp3`], dir: 'ui', maxConcurrent: 5, cooldownMs: 0 } as AudioAssetDef]),
    ) as Record<AudioEvent, AudioAssetDef>,
  );
  // Eight distinct sfx events, all at once, none individually throttled — only the shared sfx
  // category cap (CATEGORY_MAX_CONCURRENT.sfx) should bound how many actually play.
  const results = events.map((e) => decidePlay(e, {}, fullVolume, gate, 0, undefined, map));
  assert.equal(results.filter((r) => r.play).length, CATEGORY_MAX_CONCURRENT.sfx);
});
