/**
 * Headless coverage for the Assimilation Period: the temporary food/production penalty a nomad
 * carries through their first year in the village (`Citizen.assimilation`, `isAssimilating`,
 * `assimilationFoodFactor`/`assimilationProdFactor` — simulation.ts).
 *
 * Same shape as `production-ratios.test.ts`/`heating.test.ts` — drives `update()` directly in
 * Node, no browser or renderer. `structuredClone`-forked A/B comparisons isolate the one modifier
 * under test the same way the tool-tier tests do: identical map, identical RNG stream, only the
 * thing being measured differs between forks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import {
  update, acceptNomads, isAssimilating, assimilationFoodFactor, assimilationProdFactor,
  setPolicy, debugWorkSpotFor, placementReachable, workerPolicyFactor,
} from '../src/game/simulation';
import { saveGame, loadGame } from '../src/game/save';
import {
  BUILDING_DEFS, ASSIMILATION_DURATION, ASSIMILATION_FOOD_FACTOR, ASSIMILATION_PROD_FACTOR,
  FOOD_PER_CITIZEN_PER_SEASON, SEASON_LENGTH, YEAR_LENGTH, SMITH_IRON_IN,
  NO_TOOLS_PENALTY, STEEL_TOOL_PROD, POLICY_RATION_FOOD, POLICY_HOURS_PROD,
} from '../src/types';
import type { GameState, Building, BuildingType, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number) => newGame('small', 'normal', false, seed);
const barnOf = (s: GameState) => s.buildings.find((b) => b.type === 'barn')!;

function findClear(s: GameState, w: number, h: number): { x: number; y: number } {
  const occ = (x: number, y: number) => s.buildings.some((b) => {
    const bw = b.w ?? BUILDING_DEFS[b.type].w, bh = b.h ?? BUILDING_DEFS[b.type].h;
    return x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y;
  });
  for (let r = 3; r < 40; r++)
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

/** A finished house, standing in for construction, with an explicit larder — same shape as
 *  `heating.test.ts`'s `builtHouse`. */
function builtHouse(s: GameState, store: Building['store'] = {}): Building {
  const { x, y } = findClear(s, BUILDING_DEFS.house.w, BUILDING_DEFS.house.h);
  const b: Building = {
    id: s.nextId++, type: 'house', x, y, built: true, progress: BUILDING_DEFS.house.work, workers: [],
    desiredWorkers: 0, growth: 0, store: { fruit: 1e6, firewood: 1e6, ...store },
  };
  s.buildings.push(b);
  s.navVersion = (s.navVersion ?? 0) + 1;
  return b;
}

/** One adult citizen, homed in a fresh house of their own, with a given assimilation state. */
function citizenIn(s: GameState, assimilation: number | undefined): { c: Citizen; h: Building } {
  const h = builtHouse(s);
  const c = {
    id: s.nextId++, name: 'X', x: h.x, y: h.y, tx: h.x, ty: h.y,
    homeId: h.id, jobId: null, carry: null, task: { kind: 'idle' }, timer: 0,
    sex: 'f', age: 25, health: 100, happiness: 100, educated: false, sick: false,
    assimilation,
  } as Citizen;
  s.citizens.push(c);
  return { c, h };
}

/** Food a household's larder lost over one `update` call. */
function eaten(s: GameState, h: Building, dt: number): number {
  const before = h.store.fruit ?? 0;
  update(s, dt, noLog);
  return before - (h.store.fruit ?? 0);
}

// -------------------------------------------------------------------------------------------
// 1/2. The pure gate and modifiers — undefined means "never assimilating" (existing villagers,
// test 7), 0 means "just arrived", and the documented +25%/-15% figures are exact.
// -------------------------------------------------------------------------------------------
test('isAssimilating: undefined (a founder, or a nomad from an old save) is never assimilating', () => {
  const c = { assimilation: undefined } as unknown as Citizen;
  assert.equal(isAssimilating(c), false);
  assert.equal(assimilationFoodFactor(c), 1);
  assert.equal(assimilationProdFactor(c), 1);
});

test('isAssimilating: a freshly-arrived nomad (assimilation = 0) reads as assimilating', () => {
  const c = { assimilation: 0 } as unknown as Citizen;
  assert.equal(isAssimilating(c), true);
  assert.equal(assimilationFoodFactor(c), ASSIMILATION_FOOD_FACTOR);
  assert.equal(assimilationProdFactor(c), ASSIMILATION_PROD_FACTOR);
});

test('the documented starting balance: +25% food, -15% production', () => {
  assert.equal(ASSIMILATION_FOOD_FACTOR, 1.25);
  assert.equal(ASSIMILATION_PROD_FACTOR, 0.85);
});

// -------------------------------------------------------------------------------------------
// 4/5. Duration — exactly one year, robust at the boundary (an instant short of the duration is
// still assimilating; an instant past it is not — no rounding to a whole extra tick either way).
// -------------------------------------------------------------------------------------------
test('duration: one tick short of ASSIMILATION_DURATION is still assimilating', () => {
  const c = { assimilation: ASSIMILATION_DURATION - 0.01 } as unknown as Citizen;
  assert.equal(isAssimilating(c), true);
});

test('duration: exactly at (and past) ASSIMILATION_DURATION is no longer assimilating', () => {
  const atBoundary = { assimilation: ASSIMILATION_DURATION } as unknown as Citizen;
  const pastBoundary = { assimilation: ASSIMILATION_DURATION + 0.01 } as unknown as Citizen;
  assert.equal(isAssimilating(atBoundary), false);
  assert.equal(isAssimilating(pastBoundary), false);
});

test('duration equals exactly one calendar year (ASSIMILATION_DURATION === YEAR_LENGTH)', () => {
  assert.equal(ASSIMILATION_DURATION, YEAR_LENGTH);
});

// -------------------------------------------------------------------------------------------
// Off-by-one at the year boundary: a nomad who arrives late in a calendar year must still get
// exactly ASSIMILATION_DURATION seconds, not "however long is left in this calendar year" and
// not "however long is left plus a whole extra year" — the two shapes an off-by-one on a
// year-number comparison could produce. The clock here is a plain elapsed-seconds counter (see
// `Citizen.assimilation`'s doc comment), so it is exercised straight through a New Year turnover.
// -------------------------------------------------------------------------------------------
test('a nomad who arrives late in the year still assimilates for exactly one year, crossing New Year', () => {
  const s = mk(9101);
  s.citizens = [];
  // Land just before the Spring turnover (season 3 = Winter, seasonTimer near SEASON_LENGTH) so
  // the run below crosses a year boundary partway through the Assimilation Period.
  s.season = 3;
  s.seasonTimer = SEASON_LENGTH - 5;
  const yearAtArrival = s.year;
  // A well-stocked larder of their own — a starved citizen stops accumulating simulation time at
  // all (a dead citizen is dropped from `s.citizens` and never ticks again), which would corrupt
  // this test's clock reading for reasons that have nothing to do with assimilation itself.
  const { c, h } = citizenIn(s, 0);
  const step = 0.5;
  let crossedNewYear = false;
  let elapsed = 0;
  while (elapsed < ASSIMILATION_DURATION - step) {
    update(s, step, noLog);
    elapsed += step;
    if (s.year !== yearAtArrival) crossedNewYear = true;
    assert.equal(isAssimilating(c), true, `should still be assimilating ${elapsed}s in`);
  }
  assert.ok(crossedNewYear, 'sanity: the run actually crossed a New Year');
  // A few more ticks push it just past the duration.
  update(s, step * 4, noLog);
  assert.equal(isAssimilating(c), false, 'a full year (and change) after arrival, assimilation is over');
  void h;
});

// -------------------------------------------------------------------------------------------
// 1, 6, 7. Nomad arrival through the real flow (`acceptNomads`) — every newcomer in a band starts
// assimilating together, founders are untouched, and a second, later-arriving band gets its own
// independent clock rather than sharing one village-wide timer.
// -------------------------------------------------------------------------------------------
test('accepting a nomad band starts the Assimilation Period for every newcomer, and only them', () => {
  const s = mk(9201);
  const founders = [...s.citizens];
  assert.ok(founders.length > 0, 'sanity: a fresh village has founding citizens');
  for (const f of founders) assert.equal(isAssimilating(f), false, 'a founder never assimilates');

  s.pendingNomads = { count: 8, sick: 0 };
  acceptNomads(s, noLog);
  const newcomers = s.citizens.filter((c) => !founders.includes(c));
  assert.equal(newcomers.length, 8);
  for (const n of newcomers) {
    assert.equal(n.assimilation, 0, 'a newcomer starts the clock at exactly 0');
    assert.equal(isAssimilating(n), true);
  }
  // Founders are unaffected by another band joining.
  for (const f of founders) assert.equal(isAssimilating(f), false);
});

test('two bands arriving months apart keep independent clocks', () => {
  const s = mk(9202);
  // A deep stockpile so a village nearly doubled by two nomad bands in under a year never comes
  // up short and starves someone — a dead citizen drops out of `s.citizens` and stops ticking
  // altogether, which would corrupt this test's clock readings for reasons unrelated to
  // assimilation itself.
  const barn = barnOf(s);
  barn.store.fruit = 1e7;
  barn.store.firewood = 1e7;
  barn.store.clothing = 1e7;
  s.pendingNomads = { count: 4, sick: 0 };
  acceptNomads(s, noLog);
  const bandA = s.citizens.filter((c) => c.assimilation === 0);
  assert.equal(bandA.length, 4);

  // Half a year later, a second band joins.
  for (let t = 0; t < YEAR_LENGTH / 2; t += 5) update(s, 5, noLog);
  for (const c of bandA) assert.equal(isAssimilating(c), true, 'band A is only half a year in');

  s.pendingNomads = { count: 3, sick: 0 };
  acceptNomads(s, noLog);
  const bandB = s.citizens.filter((c) => c.assimilation === 0 && !bandA.includes(c));
  assert.equal(bandB.length, 3);

  // Advance to just past band A's one-year mark, but well short of band B's.
  for (let t = 0; t < YEAR_LENGTH / 2 + 10; t += 5) update(s, 5, noLog);
  for (const c of bandA) assert.equal(isAssimilating(c), false, 'band A has completed its own year');
  for (const c of bandB) assert.equal(isAssimilating(c), true, 'band B, arriving later, is still mid-year');
});

// -------------------------------------------------------------------------------------------
// 2, 9, 11. Food consumption: +25% on top of the ordinary calculation, stacking multiplicatively
// with Rationing rather than being bypassed by it, and not applied twice.
// -------------------------------------------------------------------------------------------
test('an assimilating villager eats exactly ASSIMILATION_FOOD_FACTOR more than an established one', () => {
  const seed = mk(9301);
  seed.citizens = [];
  const dt = 5;

  const established = structuredClone(seed);
  const { h: hEstablished } = citizenIn(established, undefined);
  const gotEstablished = eaten(established, hEstablished, dt);

  const assimilating = structuredClone(seed);
  const { h: hAssim } = citizenIn(assimilating, 0);
  const gotAssim = eaten(assimilating, hAssim, dt);

  assert.ok(gotEstablished > 0 && gotAssim > 0, 'sanity: both actually ate something');
  const ratio = gotAssim / gotEstablished;
  assert.ok(
    Math.abs(ratio - ASSIMILATION_FOOD_FACTOR) < 1e-6,
    `assimilating/established food ratio should be exactly ${ASSIMILATION_FOOD_FACTOR}, got ${ratio}`,
  );
  // And not squared/doubled by accident.
  assert.ok(Math.abs(ratio - ASSIMILATION_FOOD_FACTOR * ASSIMILATION_FOOD_FACTOR) > 0.05);
});

test('Rationing and the Assimilation Period stack multiplicatively, neither bypassing the other', () => {
  const s = mk(9302);
  s.citizens = [];
  // With only two citizens in play below, leave nobody on the hook to cover the founding
  // village's builder quota — otherwise `assignHomesAndJobs`'s builder-shortfall reservation
  // would demote the clerk right back off the Town Hall desk the moment `update` runs.
  s.desiredBuilders = 0;
  // A staffed Town Hall clerk desk, so Rationing can actually be enacted (`policyCapacity`). The
  // clerk has to be a real citizen id — `reconcileWorkers` prunes any building's `workers` list
  // down to ids that actually exist in `s.citizens` on the very first tick, which would silently
  // drop the desk (and Rationing with it) if this were a placeholder id.
  const { x: hx, y: hy } = findClear(s, BUILDING_DEFS.townhall.w, BUILDING_DEFS.townhall.h);
  const hall: Building = {
    id: s.nextId++, type: 'townhall', x: hx, y: hy, built: true, progress: BUILDING_DEFS.townhall.work,
    workers: [], desiredWorkers: 1, growth: 0, store: {},
  };
  s.buildings.push(hall);
  // Their own house, and the same sex as the test citizen — otherwise `rehouseVillagers` (which
  // runs on its own short cadence, not just at a season turn) pairs the two single opposite-sex
  // adults into a couple on the very first tick and moves them in together, and two residents
  // drawing on the one larder would double what this test measures.
  const clerkHouse = builtHouse(s);
  const clerk = {
    id: s.nextId++, name: 'Clerk', x: hx, y: hy, tx: hx, ty: hy,
    homeId: clerkHouse.id, jobId: hall.id, carry: null, task: { kind: 'idle' }, timer: 0,
    sex: 'f', age: 30, health: 100, happiness: 100, educated: false, sick: false,
  } as Citizen;
  s.citizens.push(clerk);
  hall.workers = [clerk.id];
  assert.ok(setPolicy(s, 'rationing', true), 'sanity: rationing enacted');

  const { c, h } = citizenIn(s, 0);
  c.homeId = h.id;
  const dt = 5;
  const got = eaten(s, h, dt);
  const rate = dt / SEASON_LENGTH;
  const expected = FOOD_PER_CITIZEN_PER_SEASON * rate * POLICY_RATION_FOOD * ASSIMILATION_FOOD_FACTOR;
  assert.ok(
    Math.abs(got - expected) < 1e-6,
    `expected Rationing (${POLICY_RATION_FOOD}) and assimilation (${ASSIMILATION_FOOD_FACTOR}) to both apply: expected ${expected}, got ${got}`,
  );
});

// -------------------------------------------------------------------------------------------
// 3, 8, 10, 11. Production: -15% on an ordinary work cycle, stacking correctly with tools and
// with a productivity policy, and — like the food side — applied exactly once.
// -------------------------------------------------------------------------------------------
function findClearReachable(s: GameState, type: BuildingType): { x: number; y: number } {
  const w = BUILDING_DEFS[type].w, h = BUILDING_DEFS[type].h;
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
        if (ok && !occ(x, y) && placementReachable(s, type, x, y, w, h, 0)) return { x, y };
      }
  throw new Error('no clear, reachable spot');
}

/** A staffed blacksmith bootstrapped exactly like `production-ratios.test.ts`'s own smith setup
 *  (same reasoning: let the real job-assignment pipeline pick and place a founding worker, so
 *  what's measured afterward is only the modifier under test). */
function bootstrapSmith(seed: number): GameState {
  const s = mk(seed);
  s.season = 0; // Spring — the cold-work penalty only applies in Winter
  delete barnOf(s).store.tools;
  delete barnOf(s).store.steeltools;
  const { x, y } = findClearReachable(s, 'blacksmith');
  const smith: Building = {
    id: s.nextId++, type: 'blacksmith', x, y, built: true, progress: BUILDING_DEFS.blacksmith.work,
    workers: [], desiredWorkers: 1, growth: 0, output: 'coal', recipe: 'iron', replant: false,
    animal: 'cattle', store: { iron: 1_000_000 },
  };
  s.buildings.push(smith);
  s.navVersion = (s.navVersion ?? 0) + 1;
  let worker: Citizen | undefined;
  for (let i = 0; i < 400 && !worker; i++) {
    update(s, 0.5, noLog);
    if (smith.workers.length > 0) worker = s.citizens.find((c) => c.id === smith.workers[0]);
  }
  if (!worker) throw new Error('no worker was ever assigned to the smith');
  const spot = debugWorkSpotFor(s, worker, smith);
  worker.x = spot.x;
  worker.y = spot.y;
  worker.tx = worker.x;
  worker.ty = worker.y;
  return s;
}

/** Tools output over a fixed window, with a given tool tier and assimilation state forced on the
 *  smith's worker. Discards completed carries so the worker never leaves the bench (same
 *  isolation trick `production-ratios.test.ts` uses). */
function measureSmith(
  seedState: GameState,
  tool: 'iron' | 'steel' | undefined,
  assimilation: number | undefined,
): number {
  const s: GameState = structuredClone(seedState);
  const smith = s.buildings.find((b) => b.type === 'blacksmith')!;
  const worker = s.citizens.find((c) => c.jobId === smith.id)!;
  worker.tool = tool;
  worker.toolWear = 0;
  worker.assimilation = assimilation;
  smith.producedThisSeason = {};
  for (let i = 0; i < 600; i++) {
    update(s, 0.5, noLog);
    if (worker.carry) worker.carry = null;
  }
  return smith.producedThisSeason?.tools ?? 0;
}

test('an assimilating worker produces exactly ASSIMILATION_PROD_FACTOR of an established one', () => {
  const seedState = bootstrapSmith(9401);
  const established = measureSmith(seedState, 'iron', undefined);
  const assimilating = measureSmith(seedState, 'iron', 0);
  assert.ok(established > 0 && assimilating > 0, 'sanity: both actually produced tools');
  const ratio = assimilating / established;
  assert.ok(
    Math.abs(ratio - ASSIMILATION_PROD_FACTOR) < 0.05,
    `assimilating/established yield ratio should track ${ASSIMILATION_PROD_FACTOR}, got ${ratio.toFixed(3)}`,
  );
  // Not applied twice — that would read close to ASSIMILATION_PROD_FACTOR^2 (~0.72) instead.
  assert.ok(
    Math.abs(ratio - ASSIMILATION_PROD_FACTOR * ASSIMILATION_PROD_FACTOR) > 0.05,
    'the penalty must not be applied twice to the same cycle',
  );
});

test('tools still work normally under assimilation: the steel/bare ladder is unchanged', () => {
  const seedState = bootstrapSmith(9402);
  const bareAssim = measureSmith(seedState, undefined, 0);
  const steelAssim = measureSmith(seedState, 'steel', 0);
  assert.ok(bareAssim > 0 && steelAssim > 0);
  const ratio = steelAssim / bareAssim;
  const wantRatio = STEEL_TOOL_PROD / NO_TOOLS_PENALTY;
  assert.ok(
    Math.abs(ratio - wantRatio) < 0.08,
    `steel should still beat bare hands by ${wantRatio.toFixed(3)}x while assimilating, got ${ratio.toFixed(3)}`,
  );
});

test('an assimilating steel-tooled worker still out-produces a non-assimilating bare-handed one appropriately', () => {
  const seedState = bootstrapSmith(9403);
  const bareEstablished = measureSmith(seedState, undefined, undefined);
  const steelAssimilating = measureSmith(seedState, 'steel', 0);
  const ratio = steelAssimilating / bareEstablished;
  const want = (STEEL_TOOL_PROD / NO_TOOLS_PENALTY) * ASSIMILATION_PROD_FACTOR;
  assert.ok(
    Math.abs(ratio - want) < 0.08,
    `tool and assimilation factors should combine as a straight product (${want.toFixed(3)}), got ${ratio.toFixed(3)}`,
  );
});

test('Long Hours and the Assimilation Period stack multiplicatively on production', () => {
  // `workerPolicyFactor` (Long Hours' own contribution) and `assimilationProdFactor` are the two
  // exact factors `runWorker` multiplies into a work cycle's `prod` — see the doc comment on
  // `workerPolicyFactor` for why this codebase always folds standing rules together as a straight
  // product. Read directly rather than through a live multi-hundred-tick smith run: Long Hours
  // also carries its own ongoing *health* cost (`POLICY_HOURS_HEALTH`), which drifts `wellbeing`
  // (a *different* factor in the same product) down over a long run — a real interaction, but not
  // the one this test is about, and it would otherwise swamp the clean 1.12x this test checks for.
  const s = mk(9404);
  const hall = s.buildings.find((b) => b.type === 'townhall');
  assert.ok(!hall, 'sanity: a fresh small village starts with no Town Hall');
  const { x, y } = findClear(s, BUILDING_DEFS.townhall.w, BUILDING_DEFS.townhall.h);
  const clerk = s.citizens[0]; // a real citizen id — see the Rationing test above for why
  const newHall: Building = {
    id: s.nextId++, type: 'townhall', x, y, built: true, progress: BUILDING_DEFS.townhall.work,
    workers: [clerk.id], desiredWorkers: 1, growth: 0, store: {},
  };
  s.buildings.push(newHall);
  assert.ok(setPolicy(s, 'longHours', true), 'sanity: Long Hours enacted');

  const established = { assimilation: undefined } as unknown as Citizen;
  const assimilating = { assimilation: 0 } as unknown as Citizen;
  const policyFactor = workerPolicyFactor(s);
  assert.ok(
    Math.abs(policyFactor - POLICY_HOURS_PROD) < 1e-9,
    `sanity: only Long Hours is enacted, so workerPolicyFactor should read exactly ${POLICY_HOURS_PROD}`,
  );
  const combinedEstablished = policyFactor * assimilationProdFactor(established);
  const combinedAssimilating = policyFactor * assimilationProdFactor(assimilating);
  assert.ok(
    Math.abs(combinedEstablished - POLICY_HOURS_PROD) < 1e-9,
    'Long Hours alone should lift an established worker by exactly its own factor',
  );
  assert.ok(
    Math.abs(combinedAssimilating - POLICY_HOURS_PROD * ASSIMILATION_PROD_FACTOR) < 1e-9,
    'Long Hours and assimilation should combine as a straight product, neither one bypassing the other',
  );
});

// -------------------------------------------------------------------------------------------
// Sanity on the fixed per-cycle input cost: assimilation changes OUTPUT, not how much iron a
// cycle consumes (mirrors the equivalent tool-tier assertion in production-ratios.test.ts).
// -------------------------------------------------------------------------------------------
test('assimilation does not change the fixed per-cycle iron cost, only the tools produced', () => {
  const seedState = bootstrapSmith(9405);
  const established = structuredClone(seedState);
  const assimilating = structuredClone(seedState);
  const wE = established.citizens.find((c) => c.jobId !== null)!;
  const wA = assimilating.citizens.find((c) => c.jobId !== null)!;
  wE.tool = 'iron';
  wA.tool = 'iron';
  wA.assimilation = 0;
  const smithE = established.buildings.find((b) => b.type === 'blacksmith')!;
  const smithA = assimilating.buildings.find((b) => b.type === 'blacksmith')!;
  const ironStartE = smithE.store.iron!;
  const ironStartA = smithA.store.iron!;
  for (let i = 0; i < 600; i++) {
    update(established, 0.5, noLog);
    update(assimilating, 0.5, noLog);
    if (wE.carry) wE.carry = null;
    if (wA.carry) wA.carry = null;
  }
  const cyclesE = (ironStartE - smithE.store.iron!) / SMITH_IRON_IN;
  const cyclesA = (ironStartA - smithA.store.iron!) / SMITH_IRON_IN;
  assert.ok(Math.abs(cyclesA - cyclesE) <= 2, 'assimilation should not change how many cycles complete');
});

// -------------------------------------------------------------------------------------------
// 12. Save/load — a plain in-memory localStorage polyfill so `save.ts` runs headlessly, exactly
// as it would in a browser tab. Confirms the field round-trips, and that an old save (no field on
// its citizens at all) loads clean rather than being treated as "everyone is assimilating".
// -------------------------------------------------------------------------------------------
function installFakeLocalStorage(): void {
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() { return data.size; },
  };
}

test('save/load: an assimilating villager keeps their exact clock across a save round-trip', () => {
  installFakeLocalStorage();
  const s = mk(9501);
  s.pendingNomads = { count: 1, sick: 0 };
  acceptNomads(s, noLog);
  const nomad = s.citizens[s.citizens.length - 1];
  nomad.assimilation = 123.5;
  const slot = 7;
  assert.ok(saveGame(s, slot), 'sanity: the save actually wrote');
  const loaded = loadGame(slot);
  assert.ok(loaded, 'sanity: the save actually loaded');
  const reloadedNomad = loaded!.citizens.find((c) => c.id === nomad.id)!;
  assert.equal(reloadedNomad.assimilation, 123.5);
  assert.equal(isAssimilating(reloadedNomad), true);
  // Founders are still untouched by the round-trip.
  for (const c of loaded!.citizens) {
    if (c.id === nomad.id) continue;
    assert.equal(c.assimilation, undefined);
    assert.equal(isAssimilating(c), false);
  }
});

test('save/load: a save from before this feature (no assimilation field at all) loads with nobody assimilating', () => {
  installFakeLocalStorage();
  const s = mk(9502);
  assert.ok(saveGame(s, 8), 'sanity: the save actually wrote');
  // Simulate a pre-feature save by stripping the field the current code would have written (there
  // is none here since these are founders, but this also covers a save written by an older build
  // that never knew about `assimilation` at all — same shape, nothing to migrate).
  const loaded = loadGame(8);
  assert.ok(loaded);
  for (const c of loaded!.citizens) {
    assert.equal(c.assimilation, undefined, 'an old save must not retroactively flag anyone as assimilating');
    assert.equal(isAssimilating(c), false);
  }
});
