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
