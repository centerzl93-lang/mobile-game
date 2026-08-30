/**
 * Phase 4 (Event Sound Effects) — warning audio. `WARNING` rides `warnLowStocks`'s existing
 * `lowWarned` latch (CLAUDE.md's low-stock signalling): a stock says so the moment it crosses the
 * critical mark, once, and stays quiet until it climbs back out and falls again. This is exactly
 * the "event-based triggering + deduplication" the Phase 4 brief asks for — no separate audio-side
 * cooldown was needed because the gameplay signal it rides is already latched the same way.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { update } from '../src/game/simulation';
import { audioBus, type AudioEvent } from '../src/audio/events';
import type { Building } from '../src/types';

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

/**
 * Zero every barn's wood, with a cap set on wood alone. `newGame` seeds every difficulty's own
 * starting caps on founding (CLAUDE.md/`DIFFICULTY_RESOURCES`), and a fresh village starts most of
 * them at 0 stock too — so a village that kept *all* of its founding caps would already read
 * several resources critical on tick one, which is real behaviour but not what this test is
 * isolating. Replacing `s.limits` outright (not merging into it) leaves only wood capped, so
 * `isCriticalStock` — which requires a cap greater than zero to judge against — has exactly one
 * key to ever call critical.
 */
function makeWoodCritical(s: ReturnType<typeof newGame>): void {
  s.limits = { wood: 1000 }; // critical mark = 100 (WARN_STOCK_FRACTION)
  for (const b of s.buildings as Building[]) {
    if (b.store && 'wood' in b.store) delete b.store.wood;
  }
}

test('warning: a stock crossing critical emits WARNING once, and stays silent while it remains critical', () => {
  const s = newGame('small', 'normal', false, 40); // no barn wood production without a lumberyard
  makeWoodCritical(s);
  const events = withCapture(() => {
    update(s, 5, noLog); // > WARN_SWEEP_INTERVAL — the sweep runs and finds wood critical
    update(s, 5, noLog);
    update(s, 5, noLog);
  });
  assert.equal(events.filter((e) => e === 'WARNING').length, 1, 'three sweeps of an unchanged shortage, one warning');
});

test('warning: recovering above the mark and falling critical again re-fires WARNING', () => {
  const s = newGame('small', 'normal', false, 41);
  makeWoodCritical(s);
  const barn = s.buildings.find((b) => b.type === 'barn')!;

  const firstWarn = withCapture(() => update(s, 5, noLog));
  assert.equal(firstWarn.filter((e) => e === 'WARNING').length, 1);

  barn.store.wood = 500; // well clear of the 100 mark — the latch should clear
  const recovered = withCapture(() => update(s, 5, noLog));
  assert.equal(recovered.filter((e) => e === 'WARNING').length, 0);

  barn.store.wood = 0; // critical again
  const secondWarn = withCapture(() => update(s, 5, noLog));
  assert.equal(secondWarn.filter((e) => e === 'WARNING').length, 1, 'a fresh drop below the mark warns again');
});
