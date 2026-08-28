/**
 * Regression tests for the builder "work crew" glitch: under concurrent construction, several
 * builders would converge on a shared, unrelated tile and glitch back and forth between sites
 * instead of steadily working the one they had picked, while still reading as "on the build crew".
 *
 * Root cause: which construction site a builder was fetching for or delivering to
 * (`pickSite`/`nearestSiteNeeding` in `simulation.ts`) was recomputed from scratch, with nothing
 * remembered between ticks. With one builder and one open site that is harmless — the answer never
 * changes. With several sites open at once and several builders working them, the "nearest,
 * still-short" answer flickers tick to tick as each builder's own delivery changes which site looks
 * neediest, and a builder mid-walk — with no memory of its own commitment — would reverse course to
 * chase the flicker, sometimes several builders at once, converging on and abandoning the same spot
 * together. `Citizen.buildSite` now pins a builder to its site until the assignment is genuinely no
 * longer valid (see its doc comment in `types.ts` and `currentSiteAction` in `simulation.ts`).
 *
 * Sites are built as `mine`s rather than `house`s deliberately: a finished house would immediately
 * re-home these (otherwise homeless) test citizens, and a fresh household's own larder errands
 * (`stockLarder`) pre-empt the Builders job entirely — a real, unrelated interaction, not the bug
 * under test here. A `mine` never houses anyone, so the crew stays on construction duty throughout.
 *
 * These drive `update()` directly in Node — no browser, no renderer — on a fully flattened map, so
 * reachability and route timing depend only on what each test places, never on seeded terrain.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, makeCitizen } from '../src/game/state';
import { update } from '../src/game/simulation';
import { cancelConstruction } from '../src/game/buildings';
import { BUILDING_DEFS, PATH_NONE, HARVEST_NONE, SEASON_LENGTH } from '../src/types';
import type { GameState, Building, BuildingType, ResourceKind, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number) => newGame('small', 'normal', false, seed);

/** Long enough to absorb an ordinary leisure break (max `LEISURE_MAX_SECONDS`, 24s) or a builder's
 *  post-shift rest (`BUILDER_REST_SECONDS`, 30s) landing right on a check — neither is the bug this
 *  file is about, and both are transient, so a release/reassignment check waits this long before
 *  asserting rather than catching a citizen mid-break. */
const SETTLE_SECONDS = 60;

/**
 * Whether `c` is (or, this very tick, still counted as) on a break. `runCitizen` decides whether to
 * run `leisure()` or the normal task dispatch from `c.rest` *before* the tick's own countdown runs,
 * so on the exact tick a break ends, `leisure()` still fires (and skips `runBuilder` entirely) even
 * though `c.rest` reads slightly negative by the time this checks it afterwards. The small negative
 * margin covers that one-tick lag rather than misreading it as a stuck assignment.
 */
function onBreak(c: Citizen): boolean {
  return (c.rest ?? 0) > -0.3;
}

/** Flatten the whole map to plain, walkable grass with no paths/harvest orders in the way, so every
 *  test's reachability and route geometry is exact rather than at the mercy of seeded terrain. */
function flatten(s: GameState): void {
  for (let i = 0; i < s.tiles.length; i++) s.tiles[i] = { type: 'grass', trees: 0 };
  for (let i = 0; i < s.paths.length; i++) s.paths[i] = PATH_NONE;
  for (let i = 0; i < s.harvest.length; i++) s.harvest[i] = HARVEST_NONE;
  s.navVersion = (s.navVersion ?? 0) + 1;
}

function barnAt(s: GameState, x: number, y: number): Building {
  const b: Building = {
    id: s.nextId++, type: 'barn', x, y, built: true, progress: BUILDING_DEFS.barn.work,
    workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', replant: false,
    animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  return b;
}

/** An unbuilt construction site of `type` at an exact spot, with nothing delivered to it yet — a
 *  builder must haul every bit of it from the barn before laying any build-work. */
function openSite(s: GameState, type: BuildingType, x: number, y: number): Building {
  const b: Building = {
    id: s.nextId++, type, x, y, built: false, progress: 0, workers: [], desiredWorkers: 0,
    growth: 0, output: 'coal', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  return b;
}

function addBuilders(s: GameState, n: number, x: number, y: number): Citizen[] {
  const made: Citizen[] = [];
  for (let i = 0; i < n; i++) {
    const c = makeCitizen(s, i % 2 ? 'm' : 'f', 25, x, y);
    s.citizens.push(c);
    made.push(c);
  }
  s.desiredBuilders = (s.desiredBuilders ?? 0) + n;
  return made;
}

/** Two open construction sites (mines) far apart, a barn stocked with everything either could need
 *  sitting between them, and `n` builders starting right at the barn — so all of them have a
 *  genuine choice to make, rather than one site being trivially nearest to everyone from the start. */
function twoSiteScenario(seed: number, builders: number) {
  const s = mk(seed);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  const barn = barnAt(s, 36, 36);
  barn.store = { wood: 5000, stone: 5000, iron: 5000, tools: 400, fruit: 4000, firewood: 4000 };
  const mineA = openSite(s, 'mine', 6, 6);
  const mineB = openSite(s, 'mine', 60, 60);
  const crew = addBuilders(s, builders, 36, 37);
  return { s, barn, mineA, mineB, crew };
}

/** Every citizen currently on the build crew must have a real, still-open job to show for it: a
 *  building that still exists and is either mid-construction/repair, being torn down, or a rubble
 *  pile still holding salvage. A dangling `buildSite` (removed, finished, or otherwise closed
 *  building) is exactly the "on the build crew but not near or working on any site" bug. */
function assertValidAssignments(s: GameState, label: string): void {
  for (const c of s.citizens) {
    if (!c.builder || c.buildSite == null) continue;
    // A citizen on an ordinary leisure break (`c.rest`, unrelated to this bug — every adult takes
    // one occasionally) skips the whole task-dispatch loop, `runBuilder` included, until the break
    // ends — see `runCitizen`. Its `buildSite` is frozen, not stale-forever: the very next tick
    // after the break ends re-validates it like any other tick. Checking mid-break would be
    // asserting a guarantee the game never made ("valid *while on a break*, too"), not the one this
    // suite is about (released once genuinely invalid, rather than left dangling for good).
    if (onBreak(c)) continue;
    const b = s.buildings.find((x) => x.id === c.buildSite);
    assert.ok(b, `${label}: builder ${c.id} points at building id ${c.buildSite}, which no longer exists`);
    if (!b) continue;
    const open = b.razed
      ? Object.values(b.store).some((v) => (v ?? 0) > 0.01) // rubble still worth a trip
      : b.demolish || b.damaged || !b.built; // being torn down, under repair, or still a site
    assert.ok(open, `${label}: builder ${c.id} is assigned to building ${b.id} (${b.type}), which is neither open, being torn down, nor salvageable`);
  }
}

/** A builder's current movement target should be somewhere that actually matters — the barn or one
 *  of the two real sites — never an arbitrary tile with no relation to any of them. */
function nearAnyOf(px: number, py: number, spots: { x: number; y: number; w: number; h: number }[], margin = 3): boolean {
  return spots.some((s) => px >= s.x - margin && px <= s.x + s.w + margin && py >= s.y - margin && py <= s.y + s.h + margin);
}

test('multiple construction sites: builders service both concurrently and both finish', () => {
  const { s, mineA, mineB } = twoSiteScenario(9001, 8);
  let t = 0;
  for (; t < 4 * SEASON_LENGTH && !(mineA.built && mineB.built); t += 0.2) update(s, 0.2, noLog);
  assert.ok(mineA.built, `mine A finished (t=${t.toFixed(0)}s)`);
  assert.ok(mineB.built, `mine B finished (t=${t.toFixed(0)}s)`);
});

test('assignment validity: a builder on the crew always has a real, open job', () => {
  const { s, mineA, mineB, crew } = twoSiteScenario(9002, 8);
  let t = 0;
  for (; t < 4 * SEASON_LENGTH && !(mineA.built && mineB.built); t += 0.2) {
    update(s, 0.2, noLog);
    // Sampled, not every single tick — this is an invariant check, not a perf-sensitive hot path,
    // but thousands of ticks' worth of full assertions would swamp the test for no extra signal.
    if (Math.round(t * 5) % 25 === 0) assertValidAssignments(s, `t=${t.toFixed(0)}s`);
  }
  assert.ok(mineA.built && mineB.built, 'both mines finished over the course of the run');
  // One more tick: the loop above stops the instant both mines finish, mid-tick from the point of
  // view of whichever citizen didn't happen to run last — give reassignment a moment to catch up
  // before checking, same as every other release check in this file.
  update(s, 0.2, noLog);
  assertValidAssignments(s, 'end of run');
  assert.equal(crew.filter((c) => c.builder).length, crew.length, 'sanity: the whole crew is still on the Builders job');
});

test("a builder's destination is always the barn or one of the two real sites, never an unrelated tile", () => {
  const { s, mineA, mineB, barn, crew } = twoSiteScenario(9003, 8);
  const spots = [
    { x: barn.x, y: barn.y, w: BUILDING_DEFS.barn.w, h: BUILDING_DEFS.barn.h },
    { x: mineA.x, y: mineA.y, w: BUILDING_DEFS.mine.w, h: BUILDING_DEFS.mine.h },
    { x: mineB.x, y: mineB.y, w: BUILDING_DEFS.mine.w, h: BUILDING_DEFS.mine.h },
  ];
  let t = 0;
  for (; t < 3 * SEASON_LENGTH && !(mineA.built && mineB.built); t += 0.2) {
    update(s, 0.2, noLog);
    for (const c of crew) {
      // A citizen on an ordinary leisure break heads for a tavern/chapel spot, not a construction
      // site — that's the unrelated leisure system (see `assertValidAssignments`), not this bug.
      if (!c.builder || onBreak(c)) continue;
      assert.ok(
        nearAnyOf(c.tx, c.ty, spots),
        `t=${t.toFixed(0)}s: builder ${c.id} is headed to (${c.tx.toFixed(1)}, ${c.ty.toFixed(1)}) — not the barn or either site`,
      );
    }
  }
});

test('builders do not reassign sites every tick while their job is still valid (oscillation regression)', () => {
  const { s, mineA, mineB, crew } = twoSiteScenario(9004, 6);
  const prev = new Map<number, number | undefined>();
  const changes = new Map<number, number>();
  for (const c of crew) prev.set(c.id, c.buildSite);
  let ticks = 0;
  for (let t = 0; t < 4 * SEASON_LENGTH && !(mineA.built && mineB.built); t += 0.2) {
    update(s, 0.2, noLog);
    ticks++;
    for (const c of crew) {
      const before = prev.get(c.id);
      if (before !== c.buildSite) {
        changes.set(c.id, (changes.get(c.id) ?? 0) + 1);
        prev.set(c.id, c.buildSite);
      }
    }
  }
  assert.ok(mineA.built && mineB.built, 'both mines still finish');
  for (const c of crew) {
    const n = changes.get(c.id) ?? 0;
    // A handful of *legitimate* reassignments is expected (the initial pick; a second one if a
    // builder's original site finishes, or runs dry, before the other does; occasionally a third
    // if that happens more than once over the whole run). Per-tick thrash would show up as dozens
    // to hundreds of changes across thousands of ticks — this bounds it far below that.
    assert.ok(n <= 6, `builder ${c.id} changed its site assignment ${n} times over ${ticks} ticks — thrashing, not settling on a job`);
  }
});

test('finishing one of several concurrent sites releases its builders rather than leaving them referencing it', () => {
  const { s, mineA, mineB, crew } = twoSiteScenario(9005, 8);
  // Give mine A a head start so it is reliably the first to finish, well ahead of mine B.
  for (const [k, amt] of Object.entries(BUILDING_DEFS.mine.cost)) mineA.store[k as ResourceKind] = amt as number;
  let t = 0;
  for (; t < SEASON_LENGTH && !mineA.built; t += 0.2) update(s, 0.2, noLog);
  assert.ok(mineA.built, `mine A finished first (t=${t.toFixed(0)}s)`);
  for (let i = 0; i < SETTLE_SECONDS / 0.2; i++) update(s, 0.2, noLog); // let assignment catch up
  for (const c of crew) {
    if (onBreak(c)) continue; // mid-break — see `assertValidAssignments`
    assert.notEqual(c.buildSite, mineA.id, `builder ${c.id} still references the now-finished mine A`);
  }
  // Its builders are not stranded either — they carry on and finish mine B.
  for (; t < 4 * SEASON_LENGTH && !mineB.built; t += 0.2) update(s, 0.2, noLog);
  assert.ok(mineB.built, `mine B also finishes once mine A no longer needs anyone (t=${t.toFixed(0)}s)`);
});

test('cancelling an open site releases its builders rather than leaving them referencing a building that no longer exists', () => {
  const { s, mineA, mineB, crew } = twoSiteScenario(9006, 8);
  let t = 0;
  for (; t < 20; t += 0.2) update(s, 0.2, noLog); // let assignments settle onto both sites first
  const onA = crew.filter((c) => c.buildSite === mineA.id);
  assert.ok(onA.length > 0, 'sanity: at least one builder had already committed to mine A');
  cancelConstruction(s, mineA);
  for (let i = 0; i < SETTLE_SECONDS / 0.2; i++) update(s, 0.2, noLog);
  for (const c of onA) {
    if (onBreak(c)) continue; // mid-break — see `assertValidAssignments`
    assert.notEqual(c.buildSite, mineA.id, `builder ${c.id} still references the cancelled site`);
  }
  assertValidAssignments(s, 'after cancellation settles');
  // The released hands are not stranded — mine B still gets built.
  for (; t < 4 * SEASON_LENGTH && !mineB.built; t += 0.2) update(s, 0.2, noLog);
  assert.ok(mineB.built, `mine B still finishes after mine A is cancelled (t=${t.toFixed(0)}s)`);
});

test('regression: a single open site with a single crew is unaffected by the sticky assignment', () => {
  const s = mk(9007);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  const barn = barnAt(s, 36, 36);
  barn.store = { wood: 5000, stone: 5000, iron: 5000, tools: 400, fruit: 4000, firewood: 4000 };
  const mine = openSite(s, 'mine', 40, 40);
  addBuilders(s, 6, 36, 37);
  let t = 0;
  for (; t < 2 * SEASON_LENGTH && !mine.built; t += 0.2) update(s, 0.2, noLog);
  assert.ok(mine.built, `a lone site with ample builders still finishes (t=${t.toFixed(0)}s)`);
});
