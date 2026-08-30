/**
 * Phase 4 (Event Sound Effects) — disaster audio. Proof that each of the four implemented
 * disasters (Fire, Sickness, Famine, Flood — CLAUDE.md "Disaster system") raises its own semantic
 * event off the *actual* state transition (an ignition, an outbreak, a famine brewing, water
 * rising), not off a rendering/UI-refresh tick, and that a disaster affecting several buildings at
 * once still emits its headline event only once — see CLAUDE.md's "Disaster Repetition"
 * requirement in the Phase 4 brief: a flood that damages four buildings is one `FLOOD_STARTED`,
 * not four.
 *
 * Every test drives the real `fireSeason`/`diseaseSeason`/`famineSeason`/`floodSeason` functions
 * `simulation.ts`'s own `endSeason` calls, with `pinRandom` holding the relevant rolls still —
 * the same technique `tests/disasters.spec.ts` uses at the Playwright layer, but here so it runs
 * headless and can inspect the audio bus directly.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { fireSeason, diseaseSeason, famineSeason, floodSeason, update } from '../src/game/simulation';
import { pinRandom } from '../src/game/rng';
import { audioBus, type AudioEvent } from '../src/audio/events';
import { SEASONS } from '../src/types';
import type { GameState, Building, BuildingType } from '../src/types';

const noLog = () => {};
const mk = (seed: number) => newGame('small', 'normal', true, seed);

function withCapture(fn: () => void): AudioEvent[] {
  const seen: AudioEvent[] = [];
  const off = audioBus.on((event) => seen.push(event));
  try {
    fn();
  } finally {
    off();
  }
  return seen;
}

/** Run `fn` with every `rand()` roll pinned to `v`, restoring the real stream afterwards even if
 *  `fn` throws — every disaster roll in this file wants a fixed die, not a real one. */
function withPinned<T>(v: number, fn: () => T): T {
  pinRandom(v);
  try {
    return fn();
  } finally {
    pinRandom(null);
  }
}

/** A single, minimal, non-fireproof/non-stone building — the only candidate in `s.buildings`, so
 *  a disaster roll's target is never in doubt. */
function lonelyBuilding(s: GameState, type: BuildingType = 'house'): Building {
  const b = {
    id: s.nextId++, type, x: 5, y: 5, built: true, progress: 99,
    workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {},
  } as unknown as Building;
  s.buildings = [b];
  return b;
}

function findWaterTile(s: GameState): { x: number; y: number } {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (s.tiles[y * s.w + x].type === 'water') return { x, y };
    }
  }
  throw new Error('no water tile on this map — sanity check for the flood tests');
}

// ---------------------------------------------------------------------------------------------
// Fire
// ---------------------------------------------------------------------------------------------

test('fire: an ignition emits FIRE_STARTED', () => {
  const s = mk(1);
  lonelyBuilding(s);
  const events = withPinned(0, () => withCapture(() => fireSeason(s, noLog)));
  assert.equal(events.filter((e) => e === 'FIRE_STARTED').length, 1);
});

test('fire: a building already burning is never re-ignited by a later roll — no duplicate FIRE_STARTED', () => {
  const s = mk(2);
  lonelyBuilding(s); // the only candidate; once it's alight there is nothing left to ignite
  const first = withPinned(0, () => withCapture(() => fireSeason(s, noLog)));
  const second = withPinned(0, () => withCapture(() => fireSeason(s, noLog)));
  assert.equal(first.filter((e) => e === 'FIRE_STARTED').length, 1);
  assert.equal(second.filter((e) => e === 'FIRE_STARTED').length, 0, 'the same building cannot catch twice');
});

test('fire: disasters toggled off means no ignition and no audio, whatever the roll', () => {
  const s = mk(3);
  s.disasters = false;
  lonelyBuilding(s);
  const events = withPinned(0, () => withCapture(() => fireSeason(s, noLog)));
  assert.equal(events.length, 0);
});

// ---------------------------------------------------------------------------------------------
// Sickness
// ---------------------------------------------------------------------------------------------

test('sickness: an outbreak emits SICKNESS_EVENT', () => {
  const s = mk(10); // default founding population — well over the outbreak's pop>=4 floor
  const events = withPinned(0, () => withCapture(() => diseaseSeason(s, noLog)));
  assert.equal(events.filter((e) => e === 'SICKNESS_EVENT').length, 1);
});

test('sickness: disasters toggled off means no outbreak and no audio', () => {
  const s = mk(11);
  s.disasters = false;
  const events = withPinned(0, () => withCapture(() => diseaseSeason(s, noLog)));
  assert.equal(events.filter((e) => e === 'SICKNESS_EVENT').length, 0);
});

test('sickness: SICKNESS_EVENT is a season-turn event, not a per-tick one — ticks well inside one season never fire it', () => {
  const s = mk(12);
  // diseaseSeason only ever runs from endSeason, itself only reached once s.seasonTimer crosses
  // SEASON_LENGTH — 60s of real sim time, unpinned, cannot cross that boundary, so this is a
  // structural guarantee, not a probabilistic one.
  const events = withCapture(() => {
    for (let t = 0; t < 60; t += 3) update(s, 3, noLog);
  });
  assert.equal(events.filter((e) => e === 'SICKNESS_EVENT').length, 0);
});

// ---------------------------------------------------------------------------------------------
// Famine
// ---------------------------------------------------------------------------------------------

test('famine: a poor-crop warning emits FAMINE_STARTED, once for the summer it brews in', () => {
  const s = mk(20);
  s.season = SEASONS.indexOf('Summer');
  const events = withPinned(0, () => withCapture(() => famineSeason(s, noLog)));
  assert.equal(events.filter((e) => e === 'FAMINE_STARTED').length, 1);

  // Already brewing this summer — a second call the same season must not warn (or sound) again.
  const again = withPinned(0, () => withCapture(() => famineSeason(s, noLog)));
  assert.equal(again.filter((e) => e === 'FAMINE_STARTED').length, 0);
});

test('famine: never rolls outside Summer, so no audio in any other season', () => {
  const s = mk(21);
  for (const name of ['Spring', 'Autumn', 'Winter'] as const) {
    s.season = SEASONS.indexOf(name);
    s.famine = undefined;
    const events = withPinned(0, () => withCapture(() => famineSeason(s, noLog)));
    assert.equal(events.includes('FAMINE_STARTED'), false, name);
  }
});

test('famine: disasters toggled off means no warning and no audio', () => {
  const s = mk(22);
  s.disasters = false;
  s.season = SEASONS.indexOf('Summer');
  const events = withPinned(0, () => withCapture(() => famineSeason(s, noLog)));
  assert.equal(events.includes('FAMINE_STARTED'), false);
});

// ---------------------------------------------------------------------------------------------
// Flood
// ---------------------------------------------------------------------------------------------

test('flood: one flood emits FLOOD_STARTED exactly once, however many riverside buildings it damages', () => {
  const s = mk(30);
  s.season = SEASONS.indexOf('Spring');
  const water = findWaterTile(s);
  s.buildings = [];
  for (let i = 0; i < 5; i++) {
    const b = {
      id: s.nextId++, type: 'house', x: water.x, y: Math.max(0, water.y - 1 - i), built: true,
      progress: 99, workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {},
    } as unknown as Building;
    s.buildings.push(b);
  }
  const events = withPinned(0, () => withCapture(() => floodSeason(s, noLog)));
  assert.equal(events.filter((e) => e === 'FLOOD_STARTED').length, 1);
  assert.ok(s.buildings.some((b) => b.damaged), 'sanity: the flood actually damaged at least one building');
  assert.ok(s.buildings.filter((b) => b.damaged).length >= 2, 'sanity: more than one building took damage this flood');
});

test('flood: never rolls outside Spring, so no audio in any other season', () => {
  const s = mk(31);
  const water = findWaterTile(s);
  s.buildings = [{
    id: s.nextId++, type: 'house', x: water.x, y: Math.max(0, water.y - 1), built: true, progress: 99,
    workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {},
  } as unknown as Building];
  for (const name of ['Summer', 'Autumn', 'Winter'] as const) {
    s.season = SEASONS.indexOf(name);
    const events = withPinned(0, () => withCapture(() => floodSeason(s, noLog)));
    assert.equal(events.includes('FLOOD_STARTED'), false, name);
  }
});

test('flood: disasters toggled off means no flood and no audio', () => {
  const s = mk(32);
  s.disasters = false;
  s.season = SEASONS.indexOf('Spring');
  const water = findWaterTile(s);
  s.buildings = [{
    id: s.nextId++, type: 'house', x: water.x, y: Math.max(0, water.y - 1), built: true, progress: 99,
    workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {},
  } as unknown as Building];
  const events = withPinned(0, () => withCapture(() => floodSeason(s, noLog)));
  assert.equal(events.includes('FLOOD_STARTED'), false);
});
