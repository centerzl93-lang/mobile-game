/**
 * `computeEnvironmentMetrics`/`windIntensity`/`EnvironmentSampler` (`src/audio/environment.ts`) —
 * the live water/forest/village/wind inputs to the Ambient Audio layer (CLAUDE.md "Ambient Audio
 * Architecture"). Built on plain `Tile`/`Building`/`Citizen` fixtures rather than a full generated
 * world, the same way `audio-activity.test.ts` sticks to `{citizens, buildings}` — this module only
 * ever reads terrain, `origin`, population and built buildings.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEnvironmentMetrics, windIntensity, seasonOf, EnvironmentSampler } from '../src/audio/environment';
import type { Building, Citizen, GameState, Tile } from '../src/types';

function mkTile(type: Tile['type']): Tile {
  return { type, trees: type === 'forest' ? 1 : 0 } as unknown as Tile;
}

/** A flat `w`×`h` map of one tile type, with a small water or forest patch centred on `origin` when
 *  `patch` is given — enough to drive the density sampler without a real `generateWorld` call. */
function mkTiles(w: number, h: number, base: Tile['type'], patch?: { type: Tile['type']; cx: number; cy: number; r: number }): Tile[] {
  const tiles: Tile[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (patch && Math.hypot(x - patch.cx, y - patch.cy) <= patch.r) tiles.push(mkTile(patch.type));
      else tiles.push(mkTile(base));
    }
  }
  return tiles;
}

function mkBuilding(x: number, y: number, built = true): Building {
  return { id: 1, x, y, built, razed: false } as unknown as Building;
}
function mkCitizens(n: number): Citizen[] {
  return Array.from({ length: n }, (_, i) => ({ id: i }) as unknown as Citizen);
}

function mkState(over: Partial<GameState>): GameState {
  return {
    w: 40,
    h: 40,
    season: 0, // Spring
    tiles: mkTiles(40, 40, 'grass'),
    buildings: [],
    citizens: [],
    origin: { x: 20, y: 20 },
    ...over,
  } as unknown as GameState;
}

test('environment: a settlement ringed by water reads a high water metric', () => {
  const s = mkState({ tiles: mkTiles(40, 40, 'grass', { type: 'water', cx: 20, cy: 20, r: 12 }) });
  const m = computeEnvironmentMetrics(s);
  assert.ok(m.water > 0.5, `expected high water, got ${m.water}`);
});

test('environment: a settlement with no water nearby reads zero water', () => {
  const s = mkState({ tiles: mkTiles(40, 40, 'grass') }); // no water anywhere
  const m = computeEnvironmentMetrics(s);
  assert.equal(m.water, 0);
});

test('environment: a settlement surrounded by forest reads a high forest metric, bare grass reads zero', () => {
  const wooded = mkState({ tiles: mkTiles(40, 40, 'forest') });
  const bare = mkState({ tiles: mkTiles(40, 40, 'grass') });
  assert.ok(computeEnvironmentMetrics(wooded).forest > 0.8);
  assert.equal(computeEnvironmentMetrics(bare).forest, 0);
});

test('environment: forest ambience eases off in Winter relative to the same terrain in Spring', () => {
  // A partial forest patch, not blanket coverage — full coverage saturates both seasons to 1 and
  // the seasonal multiplier would have nothing left to show.
  const patchTiles = mkTiles(40, 40, 'grass', { type: 'forest', cx: 20, cy: 20, r: 6 });
  const spring = computeEnvironmentMetrics(mkState({ season: 0, tiles: patchTiles }));
  const winter = computeEnvironmentMetrics(mkState({ season: 3, tiles: patchTiles }));
  assert.ok(spring.forest > 0 && spring.forest < 1, `expected an unsaturated reading, got ${spring.forest}`);
  assert.ok(winter.forest < spring.forest);
});

test('environment: village intensity grows with population and built buildings, and saturates rather than climbing forever', () => {
  const empty = computeEnvironmentMetrics(mkState({ citizens: [], buildings: [] }));
  const small = computeEnvironmentMetrics(mkState({ citizens: mkCitizens(10), buildings: [mkBuilding(1, 1)] }));
  const huge = computeEnvironmentMetrics(mkState({ citizens: mkCitizens(400), buildings: Array.from({ length: 60 }, (_, i) => mkBuilding(i, i)) }));
  assert.equal(empty.village, 0);
  assert.ok(small.village > 0 && small.village < 1);
  assert.equal(huge.village, 1); // saturated, not still climbing at city scale
});

test('environment: an unbuilt site (still a plan, not built) does not count toward village activity', () => {
  const s = mkState({ citizens: [], buildings: [mkBuilding(1, 1, false)] });
  assert.equal(computeEnvironmentMetrics(s).village, 0);
});

test('environment: a razed building does not count toward village activity', () => {
  const b = mkBuilding(1, 1, true);
  (b as unknown as { razed: boolean }).razed = true;
  const s = mkState({ citizens: [], buildings: [b] });
  assert.equal(computeEnvironmentMetrics(s).village, 0);
});

test('environment: settlementCentre prefers the founding origin over building spread, keeping a far-flung mine from skewing the sample', () => {
  // A village sits by water at (5,5); a lone mine is placed far away at (35,35), on dry land.
  const tiles = mkTiles(40, 40, 'grass', { type: 'water', cx: 5, cy: 5, r: 5 });
  const s = mkState({ tiles, origin: { x: 5, y: 5 }, buildings: [mkBuilding(5, 5), mkBuilding(35, 35)] });
  assert.ok(computeEnvironmentMetrics(s).water > 0);
});

test('environment: a state with no tiles at all (a bare fixture) never throws and reads zero terrain', () => {
  const s = { w: 10, h: 10, season: 0, buildings: [], citizens: [] } as unknown as GameState;
  assert.doesNotThrow(() => computeEnvironmentMetrics(s));
  const m = computeEnvironmentMetrics(s);
  assert.equal(m.water, 0);
  assert.equal(m.forest, 0);
});

test('windIntensity: a low bed year-round, a bit stronger in Winter', () => {
  const spring = windIntensity(mkState({ season: 0 }));
  const winter = windIntensity(mkState({ season: 3 }));
  assert.ok(spring > 0 && spring < 0.6);
  assert.ok(winter > spring);
  assert.ok(winter <= 1);
});

test('seasonOf: reads SEASONS by index and defaults sanely for a missing/out-of-range value', () => {
  assert.equal(seasonOf(mkState({ season: 1 })), 'Summer');
  assert.equal(seasonOf({ } as unknown as GameState), 'Spring');
});

test('EnvironmentSampler: recomputes only after its interval, not on every call', () => {
  const sampler = new EnvironmentSampler();
  const bare = mkState({ tiles: mkTiles(40, 40, 'grass') });
  const wet = mkState({ tiles: mkTiles(40, 40, 'grass', { type: 'water', cx: 20, cy: 20, r: 12 }) });

  const first = sampler.sample(bare, 0);
  assert.equal(first.water, 0);

  // The underlying state "changed" (a river appeared, hypothetically), but barely any time has
  // passed — the sampler should still hand back the stale cached reading.
  const stillCached = sampler.sample(wet, 500);
  assert.equal(stillCached.water, 0);

  // Enough time has passed — it re-walks the terrain and picks up the change.
  const fresh = sampler.sample(wet, 10_000);
  assert.ok(fresh.water > 0);
});

test('EnvironmentSampler: invalidate() forces a recompute on the very next call', () => {
  const sampler = new EnvironmentSampler();
  const bare = mkState({ tiles: mkTiles(40, 40, 'grass') });
  const wet = mkState({ tiles: mkTiles(40, 40, 'grass', { type: 'water', cx: 20, cy: 20, r: 12 }) });

  sampler.sample(bare, 0);
  sampler.invalidate();
  const fresh = sampler.sample(wet, 1); // barely any clock time — would be cached without invalidate()
  assert.ok(fresh.water > 0);
});
