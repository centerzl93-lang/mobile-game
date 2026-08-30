/**
 * Bird-call scheduling — CLAUDE.md "Bird Audio": "occasional, not continuous... randomized
 * intervals... slight timing variation," never a looping layer. Kept to pure timing math, the same
 * split `decision.ts`/`concurrency.ts` use for one-shot sfx: this file decides *when* a call is
 * next due, `AudioManager` (`manager.ts`) just asks the clock and, when it's time, fires the
 * ordinary `BIRD_CALL` event through `playSfx` — so birds get muting, ambient-volume scaling and
 * missing-asset handling for free from the machinery every other sound already goes through,
 * instead of a parallel bird-specific playback path.
 */
import type { Season } from '../types';

/** Min/max gap before the next call, by season. Spring and Summer are the liveliest; Autumn eases
 *  off; Winter goes quiet rather than silent — CLAUDE.md "Birds can become less frequent in
 *  winter," not "birds stop in winter." */
function intervalRangeMs(season: Season): { min: number; max: number } {
  switch (season) {
    case 'Winter':
      return { min: 45_000, max: 120_000 };
    case 'Autumn':
      return { min: 20_000, max: 60_000 };
    default: // Spring, Summer
      return { min: 10_000, max: 35_000 };
  }
}

/**
 * The next time (same clock as `now`, e.g. `performance.now()`) a bird may call. `rand` defaults to
 * `Math.random` — this module lives on the Web-Audio-facing side of `src/audio/`, not inside the
 * simulation, so it deliberately does *not* draw from the seeded sim stream (CLAUDE.md "Seeded RNG
 * only inside the simulation" — pulling ambience timing off `state.rng` would perturb the very
 * determinism that rule protects for zero gameplay benefit). Tests pass their own `rand` for a
 * reproducible pick.
 */
export function nextBirdCallAt(now: number, season: Season, rand: () => number = Math.random): number {
  const { min, max } = intervalRangeMs(season);
  return now + min + rand() * (max - min);
}
