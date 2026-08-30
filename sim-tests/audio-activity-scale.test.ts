/**
 * The mandatory "Large Village Test" for building/activity sound effects: a village with far more
 * miners/woodcutters/blacksmiths/builders than any real playthrough reaches must still sound like a
 * busy village, not a wall of noise — CLAUDE.md "A larger village sounds busier. Not: a larger
 * village becomes unbearably loud." `ActivitySoundScheduler` is exercised directly (no `AudioContext`
 * needed) against hand-built snapshots standing in for a huge village, so this runs in plain Node.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivitySoundScheduler, PRODUCTION_ACTIVITIES, type ActivitySnapshot, type ProductionActivity } from '../src/audio/activity';

/** A snapshot with `n` identical-weight sources totalling `n * workersEach` active workers. */
function crowdedSnapshot(n: number, workersEach = 1): ActivitySnapshot {
  const sources = Array.from({ length: n }, (_, i) => ({ id: i, x: i, y: 0, workers: workersEach }));
  return { count: n * workersEach, sources };
}

function allSnapshots(count: number): Record<ProductionActivity, ActivitySnapshot> {
  const snap = crowdedSnapshot(count);
  return { MINING: snap, WOODCUTTING: snap, BLACKSMITH: snap, CONSTRUCTION: snap };
}

/** How many triggers fire across a simulated `durationMs` window, polling every `stepMs`. */
function runFor(scheduler: ActivitySoundScheduler, snapshots: Record<ProductionActivity, ActivitySnapshot>, durationMs: number, stepMs = 100) {
  const counts: Record<ProductionActivity, number> = { MINING: 0, WOODCUTTING: 0, BLACKSMITH: 0, CONSTRUCTION: 0 };
  for (let t = 0; t <= durationMs; t += stepMs) {
    for (const trigger of scheduler.poll(snapshots, t)) counts[trigger.activity]++;
  }
  return counts;
}

test('scale: an absurdly large village (40 miners, 60 woodcutters, 30 smiths, 30 builders) never produces more than a handful of sounds a minute per activity', () => {
  const scheduler = new ActivitySoundScheduler(() => 0.5);
  const snapshots: Record<ProductionActivity, ActivitySnapshot> = {
    MINING: crowdedSnapshot(5, 8), // 5 mines, 8 miners each = 40
    WOODCUTTING: crowdedSnapshot(8, 8), // 64
    BLACKSMITH: crowdedSnapshot(10, 3), // 30
    CONSTRUCTION: crowdedSnapshot(6, 5), // 30 builders across 6 sites
  };
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const counts = runFor(scheduler, snapshots, TEN_MINUTES_MS);
  for (const activity of PRODUCTION_ACTIVITIES) {
    // Even fully saturated, no activity should be scheduled more than roughly once every couple of
    // seconds — comfortably under 400 triggers in 10 minutes (600s / 1.5s floor ≈ 400) for every one
    // of the four, regardless of how many hundreds of workers feed it.
    assert.ok(counts[activity] < 450, `${activity} fired ${counts[activity]} times in 10 minutes — far too chatty for a single event`);
    assert.ok(counts[activity] > 0, `${activity} should still be audible at all with this much active work`);
  }
});

test('scale: doubling worker count past saturation does not increase trigger frequency (diminishing returns)', () => {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  const modest = new ActivitySoundScheduler(() => 0.5);
  const huge = new ActivitySoundScheduler(() => 0.5);
  // MINING saturates at 8 active workers (see `activity.ts`'s SATURATE_AT) — 10 and 200 should
  // schedule identically since both are already "as busy as it ever sounds."
  const modestCounts = runFor(modest, allSnapshots(10), FIVE_MINUTES_MS);
  const hugeCounts = runFor(huge, allSnapshots(200), FIVE_MINUTES_MS);
  for (const activity of PRODUCTION_ACTIVITIES) {
    assert.equal(hugeCounts[activity], modestCounts[activity], `${activity} should schedule identically once saturated, whether 10 or 200 workers are active`);
  }
});

test('scale: a single poll never returns more than one trigger per activity', () => {
  const scheduler = new ActivitySoundScheduler(() => 0.99); // shortest possible intervals every time
  const snapshots = allSnapshots(500);
  for (let t = 0; t < 20000; t += 50) {
    const triggers = scheduler.poll(snapshots, t);
    const seen = new Set(triggers.map((tr) => tr.activity));
    assert.equal(seen.size, triggers.length, 'no activity should ever fire twice in the same poll');
    assert.ok(triggers.length <= PRODUCTION_ACTIVITIES.length);
  }
});
