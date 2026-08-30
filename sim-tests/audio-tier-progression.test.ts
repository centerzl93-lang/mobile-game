/**
 * Integration coverage for `simulation.ts`'s own `emitAudio` call sites — proof that the semantic
 * events wired into the tick pipeline (CLAUDE.md "Simulation → Game Event → Audio Manager") really
 * fire, using the real `update()`/`endSeason()` pipeline rather than re-deriving the logic. Uses
 * `pinTier` (an existing test hook — "the way `pinRandom` forces the die") to force a tier change
 * deterministically rather than growing a real village to hamlet population, and `debugEndSeason`
 * to run a season turn without waiting out `SEASON_LENGTH` of real sim time.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { debugEndSeason } from '../src/game/simulation';
import { saveGame, loadGame } from '../src/game/save';
import { pinTier } from '../src/game/tiers';
import { audioBus, type AudioEvent } from '../src/audio/events';

const noLog = () => {};

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

afterEach(() => pinTier(null)); // never leak a pin into another test file's assumptions

test('tier progression: an actual tier increase emits TIER_ADVANCED', () => {
  const s = newGame('small', 'normal', false, 1);
  pinTier('settlement');
  debugEndSeason(s, noLog); // establishes s.tierSeen = 'settlement', no event yet (a fresh village)

  pinTier('hamlet');
  const events = withCapture(() => debugEndSeason(s, noLog));
  assert.ok(events.includes('TIER_ADVANCED'));
});

test('tier progression: repeated season turns at the same tier never re-fire TIER_ADVANCED', () => {
  const s = newGame('small', 'normal', false, 2);
  pinTier('village');
  debugEndSeason(s, noLog); // first turn at this tier — establishes tierSeen, no event (fresh village)

  const events = withCapture(() => {
    debugEndSeason(s, noLog);
    debugEndSeason(s, noLog);
    debugEndSeason(s, noLog);
  });
  assert.equal(events.filter((e) => e === 'TIER_ADVANCED').length, 0);
});

test('tier progression: a tier *regression* does not emit TIER_ADVANCED (that sting is for growth)', () => {
  const s = newGame('small', 'normal', false, 3);
  pinTier('town');
  debugEndSeason(s, noLog);

  pinTier('hamlet'); // falling back — e.g. a required building burned down
  const events = withCapture(() => debugEndSeason(s, noLog));
  assert.equal(events.includes('TIER_ADVANCED'), false);
});

function installFakeLocalStorage(): void {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() { return data.size; },
  } as Storage;
}

test('tier progression: loading a save whose village is already at a high tier does not replay the advancement sting', () => {
  installFakeLocalStorage();
  const s = newGame('small', 'normal', false, 500);
  pinTier('city');
  debugEndSeason(s, noLog); // establishes tierSeen = 'city' on the in-memory state, no event (a fresh village)
  assert.ok(saveGame(s, 7), 'sanity: the state saves cleanly');

  const loaded = loadGame(7);
  assert.ok(loaded, 'sanity: the save loads back');
  // Still pinned to the same tier the save was written at — a load is not a fresh village, so this
  // must read as "no change" rather than a growth from whatever tierSeen would default to.
  const events = withCapture(() => debugEndSeason(loaded!, noLog));
  assert.equal(events.includes('TIER_ADVANCED'), false);
});
