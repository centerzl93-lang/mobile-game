/**
 * The village's random number generator.
 *
 * Two things use randomness here and they want opposite properties. **World generation** wants a
 * pure function of a seed: the same seed must always carve the same river, so a map can be shared
 * or regenerated. **The simulation** wants a stream — births, fires, disease, merchant arrivals,
 * animal breeding — that carries on across a save and a load, so a village that is put down and
 * picked back up is the same village rather than a fresh roll of the dice.
 *
 * `mulberry32` serves both because its whole state is one 32-bit integer. World gen takes a
 * generator by value and throws it away; the simulation keeps its state on `GameState.rng`, which
 * means it is saved and restored like any other number and the stream resumes exactly where it
 * stopped.
 *
 * Why bother: an unseeded `Math.random()` makes a village unreproducible, and a bug that only
 * shows up in one village in twenty cannot be chased. It also makes the test suite quietly
 * unreliable — roughly one test per full run has been failing on map or timing variance all along,
 * a different one each time and every one green in isolation.
 */

/** A seeded generator. Small, fast, and good enough for a village — not for cryptography. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Anything carrying a simulation RNG state — `GameState` does, and tests can fake it. */
export interface HasRng {
  rng: number;
}

/**
 * The next number in the simulation's stream, 0..1, advancing the state in place.
 *
 * One step of `mulberry32` written out, because the state has to live on the game rather than in
 * a closure: a closure cannot be saved to `localStorage` and restored.
 */
/**
 * Test-only: pin every roll to a fixed value, or `null` to let the stream run again.
 *
 * Probabilistic behaviour has to be testable, and the way to test "a 25% chance fires and a 3%
 * chance does not" is to hold the roll still and vary the odds. The tests used to do this by
 * replacing `Math.random`, which stopped working the moment the simulation drew from its own
 * stream instead — so the hook moved here rather than the tests losing the ability.
 *
 * Deliberately does *not* advance the stream: a pinned roll is a fixed number, not a real draw.
 * Reached through `debugPinRandom` on the game object, alongside the other debug hooks.
 */
let pinned: number | null = null;
let queue: number[] | null = null;
let queueAt = 0;
let queueAfter = 0.5;
export function pinRandom(v: number | number[] | null, after = 0.5): void {
  if (Array.isArray(v)) {
    queue = v;
    queueAt = 0;
    queueAfter = after;
    pinned = null;
    return;
  }
  queue = null;
  pinned = v;
}

export function rand(s: HasRng): number {
  // A queue answers the first N rolls in order and every one after with `after`, which is how a
  // test says "a fire starts, it picks this building, and *this* is the resistance roll" — the
  // sequence is the assertion. A bare value answers everything.
  if (queue) return queueAt < queue.length ? queue[queueAt++] : queueAfter;
  if (pinned !== null) return pinned;
  let a = s.rng | 0;
  a = (a + 0x6d2b79f5) | 0;
  s.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A whole number in `[0, n)` — the `Math.floor(rand() * n)` this codebase writes everywhere. */
export function randInt(s: HasRng, n: number): number {
  return Math.floor(rand(s) * n);
}

/** A number in `[lo, hi)`. */
export function randRange(s: HasRng, lo: number, hi: number): number {
  return lo + rand(s) * (hi - lo);
}

/** One item of a non-empty array. */
export function randPick<T>(s: HasRng, items: readonly T[]): T {
  return items[randInt(s, items.length)];
}

/** A fresh seed for a village nobody asked to reproduce. */
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
