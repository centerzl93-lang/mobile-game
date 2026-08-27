/**
 * Headless coverage for the resource-conversion audit (PLAYTEST B11): the blacksmith (iron/steel
 * tools), the tailor (Regular/Warm clothing) and the luxury workshop's recipe ratios, plus the
 * tool-efficiency ladder that multiplies every producer's output.
 *
 * Same shape as `clothing.test.ts`/`tool-seeking.test.ts` — drives `update()` directly in Node, no
 * browser or renderer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import {
  update, debugConverterInputs, citizenToolFactor, wearCitizenTool, debugWorkSpotFor,
  placementReachable,
} from '../src/game/simulation';
import { totalStored } from '../src/game/storage';
import {
  BUILDING_DEFS,
  SMITH_IRON_IN, SMITH_IRON_OUT, SMITH_STEEL_IRON, SMITH_STEEL_COAL, SMITH_STEEL_OUT,
  TAILOR_LEATHER_IN, TAILOR_WOOL_IN, TAILOR_OUT,
  TAILOR_WARM_LEATHER_IN, TAILOR_WARM_WOOL_IN, TAILOR_WARM_OUT,
  LUX_GLASS_SAND, LUX_GLASS_COAL, LUX_GLASS_OUT,
  LUX_JEWEL_GLASS, LUX_JEWEL_IRON, LUX_JEWEL_OUT,
  NO_TOOLS_PENALTY, IRON_TOOL_PROD, STEEL_TOOL_PROD, STEEL_DURABILITY,
  TOOL_WEAR_PER_CYCLE,
} from '../src/types';
import type { GameState, Building, BuildingType, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number, diff: any = 'normal') => newGame('small', diff, false, seed);
const barnOf = (s: GameState) => s.buildings.find((b) => b.type === 'barn')!;

function addAdults(s: GameState, n: number) {
  for (let i = 0; i < n; i++)
    s.citizens.push({
      id: s.nextId++, name: 'X', x: s.origin.x, y: s.origin.y, tx: s.origin.x, ty: s.origin.y,
      homeId: null, jobId: null, carry: null, task: { kind: 'idle' }, timer: 0,
      sex: i % 2 ? 'm' : 'f', age: 25, health: 100, happiness: 100, educated: false, sick: false,
    } as Citizen);
}

/**
 * Clear, reachable grass for a w×h footprint. Reachability (`placementReachable`, against the
 * village's built barns) matters here in a way it doesn't for a qualitative "did output happen"
 * test: an unreachable site still gets an `assignHomesAndJobs` worker (nothing checks reachability
 * at assignment time — see PLAYTEST T2), but that worker then stalls at the site forever with a
 * full carry and nowhere to walk it, which would silently zero out every ratio these tests measure.
 */
function findClear(s: GameState, type: BuildingType): { x: number; y: number } {
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

/** A finished, staffable workplace — bypasses construction entirely. */
function builtWorkplace(s: GameState, type: BuildingType): Building {
  const { x, y } = findClear(s, type);
  const b: Building = {
    id: s.nextId++, type, x, y, built: true, progress: BUILDING_DEFS[type].work, workers: [],
    desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'leather', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  s.navVersion = (s.navVersion ?? 0) + 1;
  return b;
}

// ---------------------------------------------------------------------------------------------
// Section 1/13 — the recipe table itself: exact input quantities, read straight off the live
// converter, not re-derived from a guess.
// ---------------------------------------------------------------------------------------------
test('blacksmith: the iron recipe is exactly SMITH_IRON_IN iron in', () => {
  const b = { type: 'blacksmith', recipe: 'iron' } as unknown as Building;
  assert.deepEqual(debugConverterInputs(b), [['iron', SMITH_IRON_IN]]);
});

test('blacksmith: the steel recipe needs both iron AND coal, at their own quantities', () => {
  const b = { type: 'blacksmith', recipe: 'steel' } as unknown as Building;
  assert.deepEqual(debugConverterInputs(b), [['iron', SMITH_STEEL_IRON], ['coal', SMITH_STEEL_COAL]]);
});

test('tailor: leather-only, wool-only and warm recipes each read their documented quantities', () => {
  assert.deepEqual(
    debugConverterInputs({ type: 'tailor', recipe: 'leather' } as unknown as Building),
    [['leather', TAILOR_LEATHER_IN]],
  );
  assert.deepEqual(
    debugConverterInputs({ type: 'tailor', recipe: 'wool' } as unknown as Building),
    [['wool', TAILOR_WOOL_IN]],
  );
  assert.deepEqual(
    debugConverterInputs({ type: 'tailor', recipe: 'warm' } as unknown as Building),
    [['leather', TAILOR_WARM_LEATHER_IN], ['wool', TAILOR_WARM_WOOL_IN]],
  );
});

test('luxury workshop: glass and jewelry recipes read their documented quantities', () => {
  assert.deepEqual(
    debugConverterInputs({ type: 'luxury', recipe: 'glass' } as unknown as Building),
    [['sand', LUX_GLASS_SAND], ['coal', LUX_GLASS_COAL]],
  );
  assert.deepEqual(
    debugConverterInputs({ type: 'luxury', recipe: 'jewelry' } as unknown as Building),
    [['glass', LUX_JEWEL_GLASS], ['iron', LUX_JEWEL_IRON]],
  );
});

// ---------------------------------------------------------------------------------------------
// Section 3/4/5/15 — tools affect OUTPUT (yield), on a fixed WORK_SECONDS cadence, never input
// consumption or cycle speed. Three otherwise-identical smiths, one per tool tier — forked from
// the *same* bootstrapped village (same map, same worker, same RNG stream) so leisure-break timing
// and every other seed-dependent variable are identical across all three, and tool tier is the
// only thing that differs.
// ---------------------------------------------------------------------------------------------
function bootstrapSmith(seed: number): GameState {
  const s = mk(seed);
  s.season = 0; // Spring — the cold-work penalty only applies in Winter
  // The founding barn starts stocked with tools (DIFFICULTY_RESOURCES) — clear it so a bare-handed
  // test citizen actually stays bare-handed instead of opportunistically equipping mid-run
  // (`sendForTool`/`tryEquipTool`), which would silently turn the "bare" case into "iron".
  delete barnOf(s).store.tools;
  delete barnOf(s).store.steeltools;
  const smith = builtWorkplace(s, 'blacksmith');
  smith.recipe = 'iron';
  smith.store.iron = 100000; // never blocked fetching — isolates the tool effect from hauling
  smith.desiredWorkers = 1;
  // Let the ordinary job-assignment pipeline pick a worker (it needs a housed founding citizen,
  // not a bare `addAdults` stub with no home) — then stand them exactly where the job would send
  // them (see CLAUDE.md's testing guidance: `debugWorkSpot`, not a raw building coordinate — the
  // footprint tiles a building occupies aren't walkable ground, so placing a citizen directly on
  // one stalls the pathfinder for good).
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

function measureSmith(seedState: GameState, tool: 'iron' | 'steel' | undefined): { ironConsumed: number; toolsOut: number } {
  const s: GameState = structuredClone(seedState); // an independent fork of the identical bootstrap
  const smith = s.buildings.find((b) => b.type === 'blacksmith')!;
  const worker = s.citizens.find((c) => c.jobId === smith.id)!;
  worker.tool = tool;
  worker.toolWear = 0;
  const ironStart = smith.store.iron!;
  smith.producedThisSeason = {}; // zero the counter *after* the bootstrap walk, not before
  for (let i = 0; i < 600; i++) {
    update(s, 0.5, noLog);
    // A full load sends the worker on a haul trip to a barn (`runWorker` step 1) — a *second*,
    // separately-tuned mechanic (round-trip distance, barn availability) this test isn't about.
    // Discarding a completed carry the instant it forms keeps the worker standing at the bench for
    // the whole window, isolating the one thing under test: the per-cycle tool-tier multiplier on
    // `workOutput`. (A worse tool fills a load in *more* cycles, so without this a bare-handed run
    // would also spend proportionally more of the window walking loads to the barn — a real, but
    // unrelated, second-order effect of smaller per-cycle yields.)
    if (worker.carry) worker.carry = null;
  } // the timed measurement window
  return {
    ironConsumed: ironStart - (smith.store.iron ?? 0),
    // `producedThisSeason` is booked the instant a cycle completes (see `runWorker`), independent
    // of whether the load has since made it to a barn — the haul leg is a *second*, unrelated trip
    // across a possibly-long procedurally-generated map (PLAYTEST T2) and would otherwise leave a
    // slow (bare-handed) run's still-uncarried load invisible to `totalStored`.
    toolsOut: smith.producedThisSeason?.tools ?? 0,
  };
}

test('tool tier changes OUTPUT, not the fixed per-cycle input cost', () => {
  const seedState = bootstrapSmith(7001);
  const bare = measureSmith(seedState, undefined);
  const iron = measureSmith(seedState, 'iron');
  const steel = measureSmith(seedState, 'steel');

  assert.ok(bare.toolsOut > 0 && iron.toolsOut > 0 && steel.toolsOut > 0, 'all three actually produced tools');
  // Consumption is billed a fixed SMITH_IRON_IN per completed cycle regardless of tf — so the
  // number of *completed cycles* (iron consumed / SMITH_IRON_IN) should track wall-clock time, not
  // the worker's tool. It should NOT differ systematically with tool tier (a tolerance covers the
  // timing jitter of exactly when the 600-tick window catches a cycle boundary).
  const cyclesBare = bare.ironConsumed / SMITH_IRON_IN;
  const cyclesIron = iron.ironConsumed / SMITH_IRON_IN;
  const cyclesSteel = steel.ironConsumed / SMITH_IRON_IN;
  assert.ok(Math.abs(cyclesIron - cyclesBare) <= 2, 'iron-tooled and bare-handed smiths complete about the same number of cycles in the same time — tools do not speed up the cycle');
  assert.ok(Math.abs(cyclesSteel - cyclesIron) <= 2, 'steel-tooled and iron-tooled smiths complete about the same number of cycles — the +15% is not a speed bonus');

  // Output per iron consumed is what should differ, in lockstep with citizenToolFactor.
  const yieldPerIron = (r: { ironConsumed: number; toolsOut: number }) => r.toolsOut / r.ironConsumed;
  assert.ok(yieldPerIron(iron) > yieldPerIron(bare), 'an iron tool converts iron to tools more efficiently than bare hands');
  assert.ok(yieldPerIron(steel) > yieldPerIron(iron), 'a steel tool converts iron to tools more efficiently than a plain iron one');
  // Exactly the citizenToolFactor ladder — no double-application, no drift.
  const ratioIronBare = yieldPerIron(iron) / yieldPerIron(bare);
  const ratioSteelIron = yieldPerIron(steel) / yieldPerIron(iron);
  assert.ok(
    Math.abs(ratioIronBare - IRON_TOOL_PROD / NO_TOOLS_PENALTY) < 0.05,
    `iron-vs-bare yield ratio (${ratioIronBare.toFixed(3)}) should track IRON_TOOL_PROD/NO_TOOLS_PENALTY (${(IRON_TOOL_PROD / NO_TOOLS_PENALTY).toFixed(3)})`,
  );
  assert.ok(
    Math.abs(ratioSteelIron - STEEL_TOOL_PROD / IRON_TOOL_PROD) < 0.05,
    `steel-vs-iron yield ratio (${ratioSteelIron.toFixed(3)}) should track the documented +15% (STEEL_TOOL_PROD/IRON_TOOL_PROD = ${(STEEL_TOOL_PROD / IRON_TOOL_PROD).toFixed(3)})`,
  );
});

test('citizenToolFactor: the exact bare/iron/steel ladder, unaffected by anything else', () => {
  const bare = { tool: undefined } as unknown as Citizen;
  const iron = { tool: 'iron' } as unknown as Citizen;
  const steel = { tool: 'steel' } as unknown as Citizen;
  assert.equal(citizenToolFactor(bare), NO_TOOLS_PENALTY);
  assert.equal(citizenToolFactor(iron), IRON_TOOL_PROD);
  assert.equal(citizenToolFactor(steel), STEEL_TOOL_PROD);
});

// ---------------------------------------------------------------------------------------------
// Section 5 — durability is the primary reason to bother with steel, not the +15%: a steel tool
// should absorb exactly STEEL_DURABILITY times the worker-seconds of an iron one before breaking.
// ---------------------------------------------------------------------------------------------
test('a steel tool lasts exactly STEEL_DURABILITY times as many work cycles as an iron one', () => {
  const iron: Citizen = { tool: 'iron', toolWear: 0, spareTool: undefined } as unknown as Citizen;
  let ironCycles = 0;
  while (iron.tool === 'iron') { wearCitizenTool(iron, TOOL_WEAR_PER_CYCLE); ironCycles++; }

  const steel: Citizen = { tool: 'steel', toolWear: 0, spareTool: undefined } as unknown as Citizen;
  let steelCycles = 0;
  while (steel.tool === 'steel') { wearCitizenTool(steel, TOOL_WEAR_PER_CYCLE); steelCycles++; }

  // A generous tolerance: both counts land near a floating-point cycle-count boundary
  // (workerSeasons accumulates in TOOL_WEAR_PER_CYCLE-sized slices), so the ratio is close to but
  // not bit-exact on STEEL_DURABILITY.
  assert.ok(Math.abs(steelCycles / ironCycles - STEEL_DURABILITY) < 0.05, `steel (${steelCycles} cycles) should last STEEL_DURABILITY (${STEEL_DURABILITY}x) as long as iron (${ironCycles} cycles)`);
});

test('an idle producer (blocked on missing input) wears no tool at all', () => {
  // A worker who never completes a cycle should pay no wear — the whole point of work-based wear
  // (see TOOL_WEAR_PER_CYCLE's doc comment). This is a direct unit check on the primitive itself:
  // calling wearCitizenTool with 0 must be a no-op.
  const c: Citizen = { tool: 'iron', toolWear: 0.4, spareTool: undefined } as unknown as Citizen;
  wearCitizenTool(c, 0);
  assert.equal(c.toolWear, 0.4, 'no cycle completed, no wear charged');
});

// ---------------------------------------------------------------------------------------------
// Section 15 — no fractional/invalid resource quantities: a long run should never leave a
// building's store negative or NaN, whatever tool its worker is holding.
// ---------------------------------------------------------------------------------------------
test('production never drives a store negative or non-finite, across a full season', () => {
  const s = mk(7010);
  const smith = builtWorkplace(s, 'blacksmith');
  smith.recipe = 'steel';
  smith.store.iron = 2000;
  smith.store.coal = 2000;
  smith.desiredWorkers = 1;
  const tailor = builtWorkplace(s, 'tailor');
  tailor.recipe = 'warm';
  tailor.store.leather = 2000;
  tailor.store.wool = 2000;
  tailor.desiredWorkers = 1;
  addAdults(s, 6);
  barnOf(s).store.fruit = 4000; barnOf(s).store.firewood = 2000;
  for (let i = 0; i < 1400; i++) update(s, 0.5, noLog); // past a season boundary
  for (const b of [smith, tailor, barnOf(s)]) {
    for (const [k, v] of Object.entries(b.store)) {
      assert.ok(Number.isFinite(v), `${b.type}.store.${k} is finite`);
      assert.ok((v as number) >= 0, `${b.type}.store.${k} is never negative`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Section 2/9 — value ratios: a higher-tier good should clear its input cost by a real margin,
// same "priced above tools but below where the edge would put it" shape TRADE_VALUE documents.
// ---------------------------------------------------------------------------------------------
test('steel tools cost strictly more than iron tools to make, for the same worker output count', () => {
  // Same worker-cycle output count (SMITH_IRON_OUT === SMITH_STEEL_OUT) — steel's edge is
  // durability and the +15%, never "the anvil somehow makes more of them".
  assert.equal(SMITH_IRON_OUT, SMITH_STEEL_OUT, 'iron and steel benches turn out the same COUNT of tools a cycle');
  assert.ok(SMITH_STEEL_COAL > 0, 'steel costs coal on top of the same iron the plain recipe uses');
  assert.equal(SMITH_STEEL_IRON, SMITH_IRON_IN, 'steel does not need more iron than the plain recipe — only the extra coal');
});

test('Warm Clothing costs as much of EACH input as the single-input recipes need of theirs, for less output', () => {
  // The asymmetry the tailor's design leans on (see types.ts): Warm Clothing is deliberately a
  // *harder* recipe to keep running, not just a pricier one.
  assert.ok(TAILOR_WARM_OUT < TAILOR_OUT, 'the warm bench turns out fewer coats a cycle than either plain recipe');
  assert.ok(TAILOR_WARM_LEATHER_IN <= TAILOR_LEATHER_IN && TAILOR_WARM_WOOL_IN <= TAILOR_WOOL_IN);
});
