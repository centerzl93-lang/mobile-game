/**
 * Integration coverage for `Citizen.activity` — the villager job animation system's link between
 * simulation job state and the renderer's per-job work animation (see its doc comment in
 * `types.ts`, and `render/villagerAnim.ts`/`render/renderer3d.ts` for what the renderer does with
 * it). Drives `update()` directly in Node — no browser, no renderer — on a fully flattened map, the
 * same approach `builder-work-crew.test.ts` uses, so reachability and route timing depend only on
 * what each test places, never on seeded terrain.
 *
 * These tests only assert on `Citizen.activity`/`inside` — the classification step in
 * `render/villagerAnim.ts` that turns `activity` into pose numbers is covered on its own, without a
 * simulation, in `villager-anim-pose.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, makeCitizen } from '../src/game/state';
import { update } from '../src/game/simulation';
import { BUILDING_DEFS, costOf, PATH_NONE, HARVEST_NONE } from '../src/types';
import type { GameState, Building, BuildingType, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number) => newGame('small', 'normal', false, seed);

/** Flatten the whole map to plain, walkable grass with no paths/harvest orders/trees in the way —
 *  see `builder-work-crew.test.ts`'s copy of this helper for why: exact reachability, independent
 *  of seeded terrain. A lumberyard forester's `Citizen.activity` is set the instant they arrive at
 *  a work spot in their circle regardless of whether the circle has anything left to fell (see
 *  `simulation.ts`'s `runWorker`: `activity` is set before the cycle's own output check runs), so a
 *  treeless flattened map is not a problem for what these tests actually assert on. */
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
    animal: 'cattle', store: { wood: 5000, stone: 5000, iron: 5000, tools: 200, fruit: 4000, firewood: 4000 },
  };
  s.buildings.push(b);
  return b;
}

function builtWorkplace(s: GameState, type: BuildingType, x: number, y: number): Building {
  const b: Building = {
    id: s.nextId++, type, x, y, built: true, progress: BUILDING_DEFS[type].work, workers: [],
    desiredWorkers: 1, growth: 0, output: 'iron', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  return b;
}

/** An unbuilt construction site with every material already delivered, so a builder goes straight
 *  to laying build-work rather than first hauling from the barn — the fetch leg is `runBuilder`'s
 *  own business and is not what these tests are about. */
function fundedSite(s: GameState, type: BuildingType, x: number, y: number): Building {
  const b: Building = {
    id: s.nextId++, type, x, y, built: false, progress: 0, workers: [], desiredWorkers: 0,
    growth: 0, output: 'coal', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  b.store = { ...costOf(b) };
  s.buildings.push(b);
  return b;
}

function addWorker(s: GameState, jobId: number | null, x: number, y: number, builder = false): Citizen {
  const c = makeCitizen(s, 'm', 30, x, y);
  c.jobId = jobId;
  if (builder) {
    c.builder = true;
    s.desiredBuilders = (s.desiredBuilders ?? 0) + 1;
  }
  s.citizens.push(c);
  return c;
}

/** Ticks `update()` one second at a time (well within the 0.1s per-frame clamp real play uses, but
 *  sim-tests elsewhere use whole-second steps too — `pred` only ever inspects state between whole
 *  ticks) until `pred` holds or `maxTicks` is reached, returning whether it held. */
function runUntil(s: GameState, pred: () => boolean, maxTicks = 300): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (pred()) return true;
    update(s, 1, noLog);
  }
  return pred();
}

test('a lumberyard forester gets `activity: woodcutting` once they reach their work spot, not before', () => {
  const s = mk(11001);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  s.desiredBuilders = 0; // newGame seeds a founding-village default; these fixtures set their own crew explicitly
  s.limits = {}; // the difficulty's starting stockpile caps would otherwise read the barn's seeded stock as already at limit
  const yard = builtWorkplace(s, 'lumberyard', 20, 20);
  const c = addWorker(s, yard.id, 5, 5);
  yard.workers = [c.id];

  assert.notEqual(c.activity, 'woodcutting', 'not yet arrived — no swing before the walk is over');
  const arrived = runUntil(s, () => c.activity === 'woodcutting');
  assert.ok(arrived, 'the forester should eventually stand at a spot in the circle and start felling');
  assert.equal(c.inside, false, 'a lumberyard forester works outdoors and stays visible');
  // Held, not a one-tick flicker: it should still be set a few ticks later while they keep cycling.
  update(s, 1, noLog);
  assert.equal(c.activity, 'woodcutting');
});

test('a mine worker is visible (not scaled away as an indoor trade) and gets `activity: mining`', () => {
  const s = mk(11002);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  s.desiredBuilders = 0; // newGame seeds a founding-village default; these fixtures set their own crew explicitly
  s.limits = {}; // the difficulty's starting stockpile caps would otherwise read the barn's seeded stock as already at limit
  barnAt(s, 20, 30);
  const mine = builtWorkplace(s, 'mine', 20, 20);
  mine.output = 'iron';
  const c = addWorker(s, mine.id, 5, 5);
  mine.workers = [c.id];

  const arrived = runUntil(s, () => c.activity === 'mining');
  assert.ok(arrived, 'the miner should reach the mine and start swinging a pickaxe');
  assert.equal(c.inside, false, 'the mine is the deliberate exception — see `worksIndoors` in types.ts');
});

test('a fishing hut worker gets `activity: fishing` at the jetty', () => {
  const s = mk(11003);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  s.desiredBuilders = 0; // newGame seeds a founding-village default; these fixtures set their own crew explicitly
  s.limits = {}; // the difficulty's starting stockpile caps would otherwise read the barn's seeded stock as already at limit
  const hut = builtWorkplace(s, 'fishing', 20, 20);
  const c = addWorker(s, hut.id, 5, 5);
  hut.workers = [c.id];

  const arrived = runUntil(s, () => c.activity === 'fishing');
  assert.ok(arrived, 'the fisherman should reach the jetty and start fishing');
  assert.equal(c.inside, false);
});

test('a builder gets `activity: building` while actually laying build-work, not while walking to the site', () => {
  const s = mk(11004);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  s.desiredBuilders = 0; // newGame seeds a founding-village default; these fixtures set their own crew explicitly
  s.limits = {}; // the difficulty's starting stockpile caps would otherwise read the barn's seeded stock as already at limit
  const site = fundedSite(s, 'well', 20, 20); // fully materialed — no fetch leg to wait through
  const c = addWorker(s, null, 5, 5, true);

  assert.notEqual(c.activity, 'building', 'still walking over — nothing to animate yet');
  const arrived = runUntil(s, () => c.activity === 'building');
  assert.ok(arrived, 'the builder should reach the site and start hammering');
  assert.equal(c.buildSite, site.id);

  // Finishing the build clears the animation — `activity` is reset every tick and this specific
  // site no longer has any labour left to lay.
  const finished = runUntil(s, () => site.built === true, 600);
  assert.ok(finished, 'sanity: the site should actually finish within this budget');
  update(s, 1, noLog);
  assert.notEqual(c.activity, 'building', 'nothing left to build here — the swing must stop');
});

test('cancelling a construction site clears the builder\'s animation the same tick it stops being real', () => {
  const s = mk(11005);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  s.desiredBuilders = 0; // newGame seeds a founding-village default; these fixtures set their own crew explicitly
  s.limits = {}; // the difficulty's starting stockpile caps would otherwise read the barn's seeded stock as already at limit
  const site = fundedSite(s, 'well', 20, 20);
  const c = addWorker(s, null, 19, 19, true); // start right beside it — no walk to wait through
  assert.ok(runUntil(s, () => c.activity === 'building', 250), 'sanity: it should start hammering almost immediately');

  // Cancelling removes the site outright (`cancelConstruction`'s actual effect on `s.buildings`)
  // without this test needing to pull in the placement/UI machinery around it.
  s.buildings = s.buildings.filter((b) => b.id !== site.id);
  update(s, 1, noLog);
  assert.notEqual(c.activity, 'building', 'the site is gone — nothing to swing a hammer at');
});

test('losing the job (laid off) clears a mine worker\'s animation — reassignment is not a stale flag', () => {
  const s = mk(11006);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  s.desiredBuilders = 0; // newGame seeds a founding-village default; these fixtures set their own crew explicitly
  s.limits = {}; // the difficulty's starting stockpile caps would otherwise read the barn's seeded stock as already at limit
  barnAt(s, 20, 30);
  const mine = builtWorkplace(s, 'mine', 20, 20);
  const c = addWorker(s, mine.id, 19, 19); // start right beside it
  mine.workers = [c.id];
  assert.ok(runUntil(s, () => c.activity === 'mining', 250), 'sanity: it should start almost immediately');

  // Dial the mine's staffing down to zero, the way a player actually lays someone off — just
  // clearing `jobId`/`workers` by hand would be undone on the very next tick, since
  // `assignHomesAndJobs` re-hires any free adult into a workplace still asking for staff.
  mine.desiredWorkers = 0;
  update(s, 1, noLog);
  assert.equal(c.jobId, null, 'sanity: the mine actually let them go');
  assert.notEqual(c.activity, 'mining', 'no longer this villager\'s job — the pickaxe stops');
});

test('the mine burning down (removed from the map) clears the animation, not just the job link', () => {
  const s = mk(11007);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  s.desiredBuilders = 0; // newGame seeds a founding-village default; these fixtures set their own crew explicitly
  s.limits = {}; // the difficulty's starting stockpile caps would otherwise read the barn's seeded stock as already at limit
  barnAt(s, 20, 30);
  const mine = builtWorkplace(s, 'mine', 20, 20);
  const c = addWorker(s, mine.id, 19, 19);
  mine.workers = [c.id];
  assert.ok(runUntil(s, () => c.activity === 'mining', 250));

  s.buildings = s.buildings.filter((b) => b.id !== mine.id); // razed
  update(s, 1, noLog);
  assert.notEqual(c.activity, 'mining');
});

test('an interrupted worker (a fire breaks out nearby) drops the work animation for the errand', () => {
  const s = mk(11008);
  flatten(s);
  s.buildings = [];
  s.citizens = [];
  s.desiredBuilders = 0; // newGame seeds a founding-village default; these fixtures set their own crew explicitly
  s.limits = {}; // the difficulty's starting stockpile caps would otherwise read the barn's seeded stock as already at limit
  const barn = barnAt(s, 20, 30);
  builtWorkplace(s, 'well', 26, 26); // so the bucket brigade has somewhere to draw water from — clear of the barn's own footprint
  const mine = builtWorkplace(s, 'mine', 20, 20);
  const c = addWorker(s, mine.id, 19, 19);
  mine.workers = [c.id];
  assert.ok(runUntil(s, () => c.activity === 'mining', 250));

  // A real fire, not a hand-set flag: `runFirefighter` only actually takes over
  // (`nearbyFire`/`burningNeedingWater`) when there is a genuine blaze within
  // `FIRE_RESPONSE_RADIUS` for it to find. Set directly on the barn — a building whose door this
  // fixture already knows is reachable — rather than a freshly-placed one, so this is purely a test
  // of the citizen's response, not of a new building's own approach-tile plumbing. Barns are
  // ordinarily fireproof; setting `fireTimer` by hand bypasses that the same way `tryIgnite` never
  // runs in this test, which is exactly what isolates the behaviour under test.
  barn.fireTimer = 60;
  update(s, 1, noLog);
  assert.notEqual(c.activity, 'mining', 'fighting a fire takes priority — no pickaxe mid-errand');
});
