/**
 * Headless simulation regression tests for the Phase-1 gameplay-stability pass.
 *
 * These drive the real simulation (`update`) directly in Node — no browser, no renderer — which is
 * fast and fully deterministic (fixed seeds). They cover the five areas the sprint touched:
 * construction scaling & the tool penalty, food production/consumption, population growth & the
 * birth cap, the freezing failure curve, and work-building enable/disable.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 *
 * They live outside `tests/` so the Playwright runner (testDir ./tests) does not pick them up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { update } from '../src/game/simulation';
import { placeBuilding } from '../src/game/buildings';
import {
  BUILDING_DEFS, FOOD_KINDS, SEASONS, MAX_CHILDREN_PER_COUPLE, FREEZE_SECONDS, SEASON_LENGTH,
  FOOD_PER_CITIZEN_PER_SEASON, CHILD_FOOD_FACTOR,
} from '../src/types';
import type { GameState, Building, BuildingType, ResourceKind, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number, diff: any = 'normal') => newGame('small', diff, false, seed);
const barnOf = (s: GameState) => s.buildings.find((b) => b.type === 'barn')!;
function addAdults(s: GameState, n: number) {
  for (let i = 0; i < n; i++)
    s.citizens.push({
      id: s.nextId++, name: 'X', x: s.origin.x, y: s.origin.y, tx: s.origin.x, ty: s.origin.y,
      homeId: null, jobId: null, carry: null, task: { kind: 'idle' }, timer: 0,
      sex: i % 2 ? 'm' : 'f', age: 25, health: 80, happiness: 80, educated: false, sick: false,
    } as Citizen);
}
/** A cleared, unoccupied w×h footprint near origin. */
function findClear(s: GameState, w: number, h: number): { x: number; y: number } {
  const occ = (x: number, y: number) => s.buildings.some((b) => {
    const bw = b.w ?? BUILDING_DEFS[b.type].w, bh = b.h ?? BUILDING_DEFS[b.type].h;
    return x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y;
  });
  for (let r = 3; r < 30; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s.origin.x + dx, y = s.origin.y + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w && ok; xx++) {
            const t = s.tiles[(y + yy) * s.w + (x + xx)];
            if (!t || t.type !== 'grass') ok = false;
          }
        if (ok && !occ(x, y)) return { x, y };
      }
  throw new Error('no clear spot');
}
/** A construction site of `type`, materials optionally pre-delivered so hauling is out of the picture. */
function siteAt(s: GameState, type: BuildingType, preDeliver: boolean): Building {
  const { x, y } = findClear(s, BUILDING_DEFS[type].w, BUILDING_DEFS[type].h);
  const b: Building = {
    id: s.nextId++, type, x, y, built: false, progress: 0, workers: [], desiredWorkers: 0,
    growth: 0, output: 'coal', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  if (preDeliver) for (const [k, amt] of Object.entries(BUILDING_DEFS[type].cost)) b.store[k as ResourceKind] = amt as number;
  s.buildings.push(b);
  return b;
}
/** Seconds of sim to raise a pre-delivered `type` with `builders`, `tools` on hand or not. */
function buildTime(type: BuildingType, builders: number, tools: boolean): number {
  const s = mk(12345); // a seed with open ground near the barn for a 6x6 mine
  const barn = barnOf(s);
  barn.store.tools = tools ? 400 : 0;
  barn.store.fruit = 4000; // no starvation pressure
  addAdults(s, builders + 4);
  const site = siteAt(s, type, true);
  s.desiredBuilders = builders;
  update(s, 0.1, noLog);
  let t = 0;
  for (; t < 4 * SEASON_LENGTH && !site.built && !s.gameOver; t += 0.2) update(s, 0.2, noLog);
  return site.built ? t : Infinity;
}

// ---------------------------------------------------------------------------------------------
// PRIORITY 1 — construction scaling & the tool penalty
// ---------------------------------------------------------------------------------------------
test('construction: more builders raise a building meaningfully faster', () => {
  const one = buildTime('mine', 1, true);
  const four = buildTime('mine', 4, true);
  const eight = buildTime('mine', 8, true);
  assert.ok(isFinite(one) && isFinite(eight), 'all builds finish');
  // Near-linear, not the old plateau: four builders clearly beat one, eight beat four.
  assert.ok(four < one * 0.55, `4 builders (${four.toFixed(0)}s) well under 1 builder (${one.toFixed(0)}s)`);
  assert.ok(eight < four * 0.85, `8 builders (${eight.toFixed(0)}s) beat 4 (${four.toFixed(0)}s)`);
});

test('construction: no tools slows building but never stalls it', () => {
  const withTools = buildTime('mine', 6, true);
  const noTools = buildTime('mine', 6, false);
  assert.ok(isFinite(noTools), 'a toolless village still finishes the mine — progress continues');
  assert.ok(noTools > withTools * 1.1, `no-tools (${noTools.toFixed(0)}s) is slower than with tools (${withTools.toFixed(0)}s)`);
  assert.ok(noTools < withTools * 2.2, 'the penalty is meaningful, not catastrophic (~1.3x, not a year)');
});

test('construction: a full barn does not trap builders hauling excess (over-fetch regression)', () => {
  // The original "mine took a season and a half" bug: builders over-fetch, the barns are full, and
  // they loop carrying loads nobody can accept — one hand builds while the rest shuttle sacks.
  const s = mk(12345); // open ground near the barn for a 6x6 mine
  const barn = barnOf(s);
  barn.store.wood = 400; barn.store.stone = 400; barn.store.iron = 200; // barn near/over full
  barn.store.tools = 400; barn.store.fruit = 4000; barn.store.firewood = 2000;
  addAdults(s, 16);
  const site = siteAt(s, 'mine', false); // materials in the (full) barn, must be hauled
  s.desiredBuilders = 12;
  update(s, 0.1, noLog);
  let t = 0;
  for (; t < 2 * SEASON_LENGTH && !site.built; t += 0.2) update(s, 0.2, noLog);
  assert.ok(site.built, 'the mine is built');
  assert.ok(t < 0.5 * SEASON_LENGTH, `built quickly (${t.toFixed(0)}s), not stuck for a season+ (${SEASON_LENGTH})`);
});

// ---------------------------------------------------------------------------------------------
// PRIORITY 5 — work building enable / disable
// ---------------------------------------------------------------------------------------------
function builtWorkplace(s: GameState, type: BuildingType): Building {
  const { x, y } = findClear(s, BUILDING_DEFS[type].w, BUILDING_DEFS[type].h);
  const b: Building = {
    id: s.nextId++, type, x, y, built: true, progress: BUILDING_DEFS[type].work, workers: [],
    desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  s.navVersion = (s.navVersion ?? 0) + 1;
  return b;
}

test('enable/disable: disabling frees the workers and keeps the desired count; enabling restores them', () => {
  const s = mk(2024);
  barnOf(s).store.fruit = 4000; barnOf(s).store.firewood = 2000;
  addAdults(s, 8);
  const b = builtWorkplace(s, 'gatherer'); // 3 jobs
  b.desiredWorkers = 3;
  for (let i = 0; i < 40; i++) update(s, 0.5, noLog);
  assert.equal(b.workers.length, 3, 'staffed to its 3 jobs');

  // Disable: workers let go, but the desired count is preserved and they are available (jobId null),
  // not stranded — a disabled building is a *different state* from an unstaffed one.
  b.enabled = false;
  const freed = [...b.workers];
  for (let i = 0; i < 10; i++) update(s, 0.5, noLog);
  assert.equal(b.workers.length, 0, 'disabled building holds no workers');
  assert.equal(b.desiredWorkers, 3, 'the desired worker count is preserved across a shutdown');
  for (const id of freed) {
    const c = s.citizens.find((x) => x.id === id)!;
    assert.equal(c.jobId, null, 'a freed worker is unassigned — available as a general labourer');
  }

  // Re-enable: it staffs back up to the same count from whoever is free.
  b.enabled = true;
  for (let i = 0; i < 40; i++) update(s, 0.5, noLog);
  assert.equal(b.workers.length, 3, 're-enabling restores full staffing');
});

test('enable/disable: a disabled converter does not consume inputs or produce', () => {
  const s = mk(2024);
  barnOf(s).store.fruit = 4000; barnOf(s).store.firewood = 2000;
  addAdults(s, 6);
  const smith = builtWorkplace(s, 'blacksmith'); // iron -> tools
  smith.store.iron = 60;
  smith.desiredWorkers = 1;
  smith.enabled = false;
  const ironBefore = smith.store.iron;
  for (let i = 0; i < 200; i++) update(s, 0.5, noLog);
  assert.equal(smith.store.iron, ironBefore, 'a disabled blacksmith consumes no iron');
  assert.ok((smith.store.tools ?? 0) === 0, 'and forges no tools');
});

// ---------------------------------------------------------------------------------------------
// PRIORITY 3 — population growth & the four-child cap
// ---------------------------------------------------------------------------------------------
test('population: grows steadily and never exceeds four children per mother', () => {
  const s = mk(777, 'easy');
  const barn = barnOf(s);
  // Ample housing so growth is demographic, not housing-limited.
  let placed = 0;
  for (let r = 3; r < 20 && placed < 30; r++)
    for (let dy = -r; dy <= r && placed < 30; dy++)
      for (let dx = -r; dx <= r && placed < 30; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const h = placeBuilding(s, 'house', barn.x + dx, barn.y + dy);
        if (h) { h.built = true; h.progress = 1; s.navVersion = (s.navVersion ?? 0) + 1; placed++; }
      }
  const start = s.citizens.length;
  let maxBorne = 0;
  const YEAR = SEASON_LENGTH * 4;
  for (let t = 0; t < 12 * YEAR && !s.gameOver; t += 0.5) {
    // Keep food/fuel ample (real food kind + house larders) so this isolates births from deaths.
    barn.store.fruit = 8000; barn.store.firewood = 4000; barn.store.clothing = 200;
    for (const b of s.buildings) if (b.built && (b.type === 'house' || b.type === 'stonehouse')) {
      b.store.firewood = 40; b.store.fruit = 60; b.store.clothing = 12;
    }
    update(s, 0.5, noLog);
    for (const c of s.citizens) maxBorne = Math.max(maxBorne, c.childrenBorne ?? 0);
  }
  const end = s.citizens.length;
  assert.ok(maxBorne <= MAX_CHILDREN_PER_COUPLE, `no mother exceeds ${MAX_CHILDREN_PER_COUPLE} children (saw ${maxBorne})`);
  assert.ok(maxBorne >= 1, 'the village does reproduce');
  assert.ok(end > start, `population grows (${start} -> ${end})`);
  // Steady, not exponential: 15 years of unlimited housing and food stays well under a 12x blowup.
  assert.ok(end < start * 12, `growth is bounded, not explosive (${start} -> ${end})`);
});

// ---------------------------------------------------------------------------------------------
// PRIORITY 4 — the freezing failure curve
// ---------------------------------------------------------------------------------------------
test('freezing: deaths come gradually with a grace period, not in one mass die-off', () => {
  const s = mk(2024);
  const barn = barnOf(s);
  // Deep winter, plenty of food, and no fuel of any kind: the pure cold case.
  s.season = SEASONS.indexOf('Winter');
  barn.store.fruit = 100000;
  barn.store.firewood = 0; barn.store.coal = 0;
  addAdults(s, 30); // a sizeable population so "staggered vs all-at-once" is measurable
  const pop0 = s.citizens.length;

  let firstDeathAt = -1;
  let popAtFirstDeath = 0;
  let t = 0;
  for (; t < 2 * SEASON_LENGTH && s.citizens.length > 0; t += 0.5) {
    const before = s.citizens.length;
    update(s, 0.5, noLog);
    if (firstDeathAt < 0 && s.citizens.length < before) {
      firstDeathAt = t;
      popAtFirstDeath = s.citizens.length;
    }
  }
  assert.ok(firstDeathAt >= FREEZE_SECONDS, `nobody dies before the freezing grace (${FREEZE_SECONDS}s); first death at ${firstDeathAt.toFixed(0)}s`);
  // The whole village must not vanish in the same frame as the first death — the anti-spiral property.
  assert.ok(popAtFirstDeath >= pop0 - 1, `the first death is a warning, not a wipeout (pop ${pop0} -> ${popAtFirstDeath} on the first fatal tick)`);
});

test('freezing: an unheated winter drains health before it kills', () => {
  const s = mk(2024);
  const barn = barnOf(s);
  s.season = SEASONS.indexOf('Winter');
  barn.store.fruit = 100000; barn.store.firewood = 0; barn.store.coal = 0;
  addAdults(s, 6);
  const c = s.citizens[0];
  c.health = 100;
  for (let i = 0; i < 100; i++) update(s, 0.5, noLog); // 50s of cold, well before any death
  assert.ok(c.health < 100, `cold erodes health as a visible warning (health now ${c.health.toFixed(0)})`);
});

// ---------------------------------------------------------------------------------------------
// PRIORITY 2 — food production / consumption sanity
// ---------------------------------------------------------------------------------------------
test('food: consumption scales with population (adults eat more than children)', () => {
  // A direct check on the consumption model the balance analysis rests on: a mixed village draws
  // food down at (FOOD_PER_CITIZEN_PER_SEASON per adult, ×CHILD_FOOD_FACTOR per child) each season.
  // The rates come from the game, not the test, so a rebalance moves both together (see B6/R=35).
  const s = mk(2024);
  const barn = barnOf(s);
  barn.store.fruit = 5000;
  s.limits!.food = 1e9;
  // Homeless adults (no births) + the founding children — a stable, known headcount.
  addAdults(s, 10);
  const adults = s.citizens.filter((c) => c.age >= 16).length;
  const children = s.citizens.filter((c) => c.age < 16).length;
  const before = FOOD_KINDS.reduce((n, k) => n + (barn.store[k as ResourceKind] ?? 0), 0);
  for (let t = 0; t < SEASON_LENGTH; t += 0.5) update(s, 0.5, noLog);
  const after = FOOD_KINDS.reduce((n, k) => n + (barn.store[k as ResourceKind] ?? 0), 0);
  const eaten = before - after;
  const expected = adults * FOOD_PER_CITIZEN_PER_SEASON + children * FOOD_PER_CITIZEN_PER_SEASON * CHILD_FOOD_FACTOR;
  assert.ok(Math.abs(eaten - expected) < expected * 0.15,
    `a season's consumption (~${eaten.toFixed(0)}) matches ${adults} adults + ${children} children = ${expected}`);
});

/**
 * True food output of one fully-staffed food building per season, measured past the barn-delivery
 * hauling bottleneck (a pre-existing headless artifact) by teleport-delivering carried/pending food
 * each tick. Cabin sits by the barn with forest painted into its work circle: the idealised ceiling.
 */
function cabinCapacity(type: BuildingType, seasons = 3): number {
  const s = mk(12345);
  const barn = barnOf(s);
  s.limits!.food = 1e9;
  barn.store.tools = 2000; barn.store.wood = 500; barn.store.stone = 500;
  const def = BUILDING_DEFS[type];
  let cabin: Building | null = null;
  for (let r = 2; r < 10 && !cabin; r++)
    for (let dy = -r; dy <= r && !cabin; dy++)
      for (let dx = -r; dx <= r && !cabin; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        cabin = placeBuilding(s, type, barn.x + dx, barn.y + dy);
      }
  if (!cabin) throw new Error('no place for cabin');
  const rad = (def.workRadius ?? 6) + 1;
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    const x = cabin.x + 1 + dx, y = cabin.y + 1 + dy; const t = s.tiles[y * s.w + x];
    if (!t) continue;
    if (x >= barn.x && x < barn.x + 5 && y >= barn.y && y < barn.y + 5) continue;
    if (t.type === 'grass') { t.type = 'forest'; (t as { trees?: number }).trees = 1; }
  }
  cabin.built = true; cabin.progress = def.work; s.navVersion = (s.navVersion ?? 0) + 1;
  cabin.desiredWorkers = def.jobs;
  addAdults(s, def.jobs + 3); // plenty of hands so the cabin always staffs to its cap
  const isFood = (k: string) => (FOOD_KINDS as readonly string[]).includes(k);
  let produced = 0;
  const drain = () => {
    for (const c of s.citizens) {
      if (c.carry && isFood(c.carry.kind)) { produced += c.carry.amount; c.carry = null; }
      const p = (c as unknown as { pending?: { kind: string; amount: number } | null }).pending;
      if (p && isFood(p.kind)) { produced += p.amount; (c as unknown as { pending: null }).pending = null; }
    }
    barn.store.firewood = 4000; barn.store.fruit = 4000; // keep the workforce alive & fed
  };
  for (let i = 0; i < 100; i++) { update(s, 0.5, noLog); drain(); }
  produced = 0;
  for (let t = 0; t < seasons * SEASON_LENGTH; t += 0.5) { update(s, 0.5, noLog); drain(); }
  return produced / seasons;
}

test('food balance: one food building sustains the founding village but not a grown one', () => {
  // The R=35 design target (PLAYTEST B6): a single food building carries the opening twelve, but its
  // ceiling is low enough that the first wave of births pushes a growing village past it — forcing a
  // second food source. Guards against food drifting back to "one hut feeds everyone".
  const cap = cabinCapacity('hunting');
  const R = FOOD_PER_CITIZEN_PER_SEASON;
  const founding = 8 * R + 4 * R * CHILD_FOOD_FACTOR; // 8 adults + 4 children
  // A "grown" village: roughly doubled, mostly adults (≈18 adult-equivalents).
  const grown = 18 * R;

  assert.ok(cap > founding * 1.1, `one cabin (${cap.toFixed(0)}/season) comfortably feeds the founding village (${founding})`);
  assert.ok(cap < grown, `one cabin (${cap.toFixed(0)}/season) does NOT feed a grown village (${grown}) — a second is needed`);
  // And the per-worker ceiling stays in the sane band the analysis assumed (~120–160/worker).
  const perWorker = cap / BUILDING_DEFS.hunting.jobs;
  assert.ok(perWorker > 110 && perWorker < 180, `production ~${perWorker.toFixed(0)}/worker is in the expected band`);
});
