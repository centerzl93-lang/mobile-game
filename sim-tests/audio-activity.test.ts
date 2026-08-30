/**
 * Building & activity sound effects (`src/audio/activity.ts`) — live activity detection
 * (`computeActivitySnapshots`/`computeActivityCounts`) and the intermittent trigger scheduler
 * (`ActivitySoundScheduler`). Detection is exercised against real `newGame()` state (buildings and
 * citizens carrying every field `workplaceStatus`/`runBuilder` actually read), not hand-picked
 * `task.kind` fixtures, so a fix to the underlying "is this producing" logic can't silently drift
 * out of sync with what `computeActivitySnapshots` assumes.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeActivityCounts,
  computeActivitySnapshots,
  intensityFor,
  ActivitySoundScheduler,
  type ActivitySnapshot,
  type ProductionActivity,
} from '../src/audio/activity';
import { newGame, makeCitizen } from '../src/game/state';
import { BUILDING_DEFS } from '../src/types';
import type { GameState, Building, BuildingType, Citizen } from '../src/types';

const mk = (seed: number) => newGame('small', 'normal', false, seed);

/**
 * A `w`x`h` patch of unclaimed tiles near the village origin — bounds and building-overlap only,
 * not a terrain check. Terrain gating (`canPlace`'s `requiresBackHalf`/`requiresWaterFraction`) is
 * a *placement*-time rule; nothing this file exercises (`workplaceStatus`, `isWorkplaceProducing`,
 * `computeActivitySnapshots`) reads terrain at all, so a plain grass-or-not search would fail to
 * find room for a mine on some seeds for no reason relevant to what's under test here.
 */
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
        if (x < 0 || y < 0 || x + w >= s.w || y + h >= s.h) continue;
        if (!occ(x, y)) return { x, y };
      }
  throw new Error('no clear spot');
}

/** A finished, workable building of `type` — staffed with `workerIds` if given. */
function mkBuilt(s: GameState, type: BuildingType, workerIds: number[] = []): Building {
  const { x, y } = findClear(s, BUILDING_DEFS[type].w, BUILDING_DEFS[type].h);
  const b: Building = {
    id: s.nextId++, type, x, y, built: true, progress: BUILDING_DEFS[type].work,
    workers: workerIds, desiredWorkers: Math.max(workerIds.length, 1), growth: 0,
    output: 'iron', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  return b;
}

/** An unbuilt construction site of `type`. */
function mkSite(s: GameState, type: BuildingType): Building {
  const { x, y } = findClear(s, BUILDING_DEFS[type].w, BUILDING_DEFS[type].h);
  const b: Building = {
    id: s.nextId++, type, x, y, built: false, progress: 0, workers: [], desiredWorkers: 0,
    growth: 0, output: 'iron', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  return b;
}

/** An adult citizen, employed at `jobId` (or a free builder if `jobId` is null). */
function mkWorker(s: GameState, jobId: number | null): Citizen {
  const c = makeCitizen(s, 'm', 30, s.origin.x, s.origin.y);
  c.jobId = jobId;
  s.citizens.push(c);
  return c;
}

/** A free builder currently committed to `siteId` — see `Citizen.buildSite`. */
function mkBuilder(s: GameState, siteId: number): Citizen {
  const c = mkWorker(s, null);
  c.builder = true;
  c.buildSite = siteId;
  return c;
}

test('activity: an empty village reports zero for every activity', () => {
  const s = mk(9001);
  s.citizens = [];
  s.buildings = s.buildings.filter((b) => b.type === 'barn'); // keep just the founding barn
  assert.deepEqual(computeActivityCounts(s), { MINING: 0, WOODCUTTING: 0, BLACKSMITH: 0, CONSTRUCTION: 0 });
});

test('activity: a staffed, built mine with nobody capped counts toward MINING', () => {
  const s = mk(9002);
  const mine = mkBuilt(s, 'mine');
  const w = mkWorker(s, mine.id);
  mine.workers = [w.id];
  const counts = computeActivityCounts(s);
  assert.equal(counts.MINING, 1);
  assert.equal(counts.WOODCUTTING, 0);
});

test('activity: a staffed lumberyard (foresters felling trees) counts toward WOODCUTTING', () => {
  const s = mk(90021);
  const yard = mkBuilt(s, 'lumberyard');
  yard.workers = [mkWorker(s, yard.id).id, mkWorker(s, yard.id).id];
  assert.equal(computeActivityCounts(s).WOODCUTTING, 2);
});

test('activity: a woodcutter (splits stockpiled wood into firewood) also feeds WOODCUTTING — but only once it has wood to split', () => {
  const s = mk(90022);
  const cutter = mkBuilt(s, 'woodcutter');
  cutter.workers = [mkWorker(s, cutter.id).id];
  assert.equal(computeActivityCounts(s).WOODCUTTING, 0, 'no wood in any barn yet — nothing to split');
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  barn.store.wood = 40;
  assert.equal(computeActivityCounts(s).WOODCUTTING, 1);
});

test('activity: a lumberyard and a woodcutter both contribute sources to the same WOODCUTTING aggregate', () => {
  const s = mk(90023);
  const yard = mkBuilt(s, 'lumberyard');
  yard.workers = [mkWorker(s, yard.id).id];
  const cutter = mkBuilt(s, 'woodcutter');
  cutter.workers = [mkWorker(s, cutter.id).id];
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  barn.store.wood = 40;
  const snap = computeActivitySnapshots(s).WOODCUTTING;
  assert.equal(snap.count, 2);
  assert.equal(snap.sources.length, 2);
  assert.deepEqual(new Set(snap.sources.map((src) => src.id)), new Set([yard.id, cutter.id]));
});

test('activity: an unstaffed mine (built, no workers) contributes nothing', () => {
  const s = mk(9003);
  mkBuilt(s, 'mine', []); // workers: [] — "Not staffed"
  assert.equal(computeActivityCounts(s).MINING, 0);
});

test('activity: an unbuilt mine (still a site) contributes nothing to MINING', () => {
  const s = mk(9004);
  const site = mkSite(s, 'mine');
  const w = mkWorker(s, site.id);
  site.workers = [w.id];
  // A site isn't `built`, so it can never be "producing" — a placed-but-unfinished mine is silent
  // until it's actually raised, which is exactly what CLAUDE.md asks for construction/production
  // audio to respect.
  assert.equal(computeActivityCounts(s).MINING, 0);
});

test('activity: a mine at its player-set stockpile limit stops counting, even fully staffed', () => {
  const s = mk(9005);
  const mine = mkBuilt(s, 'mine'); // output: 'iron' → limitedOutput is 'iron'
  const w = mkWorker(s, mine.id);
  mine.workers = [w.id];
  assert.equal(computeActivityCounts(s).MINING, 1, 'sanity: producing before the limit is set');
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  barn.store.iron = 500;
  s.limits = { iron: 100 };
  assert.equal(computeActivityCounts(s).MINING, 0, 'at the player\'s cap, the mine has stood down');
});

test('activity: a disabled (fire/damaged/switched-off) mine contributes nothing', () => {
  const s = mk(9006);
  const mine = mkBuilt(s, 'mine');
  const w = mkWorker(s, mine.id);
  mine.workers = [w.id];
  mine.enabled = false;
  assert.equal(computeActivityCounts(s).MINING, 0);
  mine.enabled = true;
  mine.damaged = true;
  assert.equal(computeActivityCounts(s).MINING, 0);
});

test('activity: a blacksmith out of iron village-wide (nothing in any barn) contributes nothing', () => {
  const s = mk(9007);
  const smith = mkBuilt(s, 'blacksmith'); // recipe: 'iron' — needs iron stock somewhere
  const w = mkWorker(s, smith.id);
  smith.workers = [w.id];
  for (const b of s.buildings) if (b.type === 'barn') delete b.store.iron;
  assert.equal(computeActivityCounts(s).BLACKSMITH, 0);
});

test('activity: a blacksmith with iron in the barns and workers on the floor counts toward BLACKSMITH', () => {
  const s = mk(9008);
  const smith = mkBuilt(s, 'blacksmith');
  const w1 = mkWorker(s, smith.id);
  const w2 = mkWorker(s, smith.id);
  smith.workers = [w1.id, w2.id];
  smith.desiredWorkers = 2;
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  barn.store.iron = 50;
  assert.equal(computeActivityCounts(s).BLACKSMITH, 2);
});

test('activity: builders committed to an open site count toward CONSTRUCTION; a bare site with none does not', () => {
  const s = mk(9009);
  const empty = computeActivityCounts(s);
  const site = mkSite(s, 'house');
  assert.equal(computeActivityCounts(s).CONSTRUCTION, empty.CONSTRUCTION, 'a site with no crew assigned is silent');
  mkBuilder(s, site.id);
  mkBuilder(s, site.id);
  assert.equal(computeActivityCounts(s).CONSTRUCTION, empty.CONSTRUCTION + 2);
});

test('activity: construction stops the instant its site is gone (finished/cancelled), regardless of stale buildSite', () => {
  const s = mk(9010);
  const site = mkSite(s, 'house');
  const c = mkBuilder(s, site.id);
  assert.equal(computeActivitySnapshots(s).CONSTRUCTION.count, 1);
  s.buildings = s.buildings.filter((b) => b.id !== site.id); // cancelled/razed
  assert.equal(c.buildSite, site.id, 'the citizen record itself is stale until `runBuilder` next runs');
  assert.equal(computeActivitySnapshots(s).CONSTRUCTION.count, 0, 'but the snapshot never counts a site that no longer exists');
});

test('activity: a laborer with no buildSite (jobId null, builder false) is not counted as constructing', () => {
  const s = mk(9011);
  const empty = computeActivityCounts(s).CONSTRUCTION;
  mkWorker(s, null); // a laborer: no job, and never marked `builder`/`buildSite`
  assert.equal(computeActivityCounts(s).CONSTRUCTION, empty);
});

test('activity: several activities are read independently in one pass', () => {
  const s = mk(9012);
  const mine = mkBuilt(s, 'mine');
  const wood = mkBuilt(s, 'lumberyard');
  const site = mkSite(s, 'house');
  mine.workers = [mkWorker(s, mine.id).id, mkWorker(s, mine.id).id];
  wood.workers = [mkWorker(s, wood.id).id];
  mkBuilder(s, site.id);
  const counts = computeActivityCounts(s);
  assert.equal(counts.MINING, 2);
  assert.equal(counts.WOODCUTTING, 1);
  assert.equal(counts.CONSTRUCTION, 1);
});

test('snapshot: an active source carries the building\'s own position and crew size', () => {
  const s = mk(9013);
  const mine = mkBuilt(s, 'mine');
  mine.workers = [mkWorker(s, mine.id).id, mkWorker(s, mine.id).id];
  const snap = computeActivitySnapshots(s).MINING;
  assert.equal(snap.sources.length, 1);
  assert.equal(snap.sources[0].id, mine.id);
  assert.equal(snap.sources[0].workers, 2);
  assert.ok(Number.isFinite(snap.sources[0].x) && Number.isFinite(snap.sources[0].y));
});

test('intensityFor: zero workers is silent, saturateAt or more is full intensity', () => {
  assert.equal(intensityFor(0), 0);
  assert.equal(intensityFor(6), 1);
  assert.equal(intensityFor(12), 1); // clamped, not > 1
});

test('intensityFor: scales linearly between zero and saturation', () => {
  assert.equal(intensityFor(3, 6), 0.5);
  assert.equal(intensityFor(1, 4), 0.25);
});

// ---- ActivitySoundScheduler ----

function snapshots(overrides: Partial<Record<ProductionActivity, ActivitySnapshot>>): Record<ProductionActivity, ActivitySnapshot> {
  const empty: ActivitySnapshot = { count: 0, sources: [] };
  return { MINING: { ...empty }, WOODCUTTING: { ...empty }, BLACKSMITH: { ...empty }, CONSTRUCTION: { ...empty }, ...overrides };
}

test('scheduler: an inactive activity never fires', () => {
  const sched = new ActivitySoundScheduler(() => 0.5);
  assert.deepEqual(sched.poll(snapshots({}), 0), []);
  assert.deepEqual(sched.poll(snapshots({}), 100000), []);
});

test('scheduler: an active activity fires eventually, but not on the very first poll', () => {
  const sched = new ActivitySoundScheduler(() => 0.5);
  const snap = snapshots({ MINING: { count: 3, sources: [{ id: 1, x: 5, y: 5, workers: 3 }] } });
  const first = sched.poll(snap, 0);
  assert.deepEqual(first, [], 'the schedule books a future due time rather than firing immediately');
  const later = sched.poll(snap, 60000); // comfortably past any configured interval
  assert.equal(later.length, 1);
  assert.equal(later[0].activity, 'MINING');
  assert.equal(later[0].x, 5);
  assert.equal(later[0].y, 5);
});

test('scheduler: does not fire again before its own interval elapses', () => {
  const sched = new ActivitySoundScheduler(() => 0.5);
  const snap = snapshots({ WOODCUTTING: { count: 1, sources: [{ id: 1, x: 0, y: 0, workers: 1 }] } });
  sched.poll(snap, 0);
  const due = sched.poll(snap, 60000);
  assert.equal(due.length, 1);
  const tooSoon = sched.poll(snap, 60001); // 1ms later — nowhere near the next interval
  assert.deepEqual(tooSoon, []);
});

test('scheduler: work stopping and resuming re-arms promptly rather than waiting out a stale interval', () => {
  const sched = new ActivitySoundScheduler(() => 0.99); // push intervals to their longest each time
  const active = snapshots({ BLACKSMITH: { count: 1, sources: [{ id: 1, x: 0, y: 0, workers: 1 }] } });
  sched.poll(active, 0); // books a long interval
  assert.deepEqual(sched.poll(snapshots({}), 500), [], 'work stopped — nothing fires while idle');
  // Work resumes; the stale long-interval booking must not still be in effect.
  const resumed = sched.poll(active, 501);
  assert.deepEqual(resumed, [], 'a fresh interval is booked, not fired on the very same poll');
  const later = sched.poll(active, 600000);
  assert.equal(later.length, 1);
});

test('scheduler: several sources for one activity — the chosen one is always a real source', () => {
  const rand = (() => {
    const seq = [0.1, 0.9, 0.4, 0.6];
    let i = 0;
    return () => seq[i++ % seq.length];
  })();
  const sched = new ActivitySoundScheduler(rand);
  const sources = [{ id: 1, x: 1, y: 1, workers: 1 }, { id: 2, x: 2, y: 2, workers: 5 }];
  const snap = snapshots({ MINING: { count: 6, sources } });
  sched.poll(snap, 0);
  for (let t = 60000; t < 600000; t += 60000) {
    for (const trigger of sched.poll(snap, t)) {
      const match = sources.find((src) => src.x === trigger.x && src.y === trigger.y);
      assert.ok(match, `trigger position ${trigger.x},${trigger.y} must belong to a real source`);
    }
  }
});

test('scheduler: independent activities do not fire in lockstep', () => {
  let calls = 0;
  const sched = new ActivitySoundScheduler(() => {
    calls++;
    return (calls % 7) / 7; // varied but deterministic
  });
  const snap = snapshots({
    MINING: { count: 2, sources: [{ id: 1, x: 0, y: 0, workers: 2 }] },
    WOODCUTTING: { count: 2, sources: [{ id: 2, x: 1, y: 1, workers: 2 }] },
  });
  sched.poll(snap, 0);
  const fireTimes: Record<string, number[]> = { MINING: [], WOODCUTTING: [] };
  for (let t = 500; t < 120000; t += 500) {
    for (const trigger of sched.poll(snap, t)) fireTimes[trigger.activity].push(t);
  }
  assert.ok(fireTimes.MINING.length > 0 && fireTimes.WOODCUTTING.length > 0, 'both activities actually fired');
  assert.notDeepEqual(fireTimes.MINING, fireTimes.WOODCUTTING, 'independently-jittered schedules should not land on identical ticks');
});
