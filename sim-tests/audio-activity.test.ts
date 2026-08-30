/**
 * `computeActivityCounts`/`intensityFor` (`src/audio/activity.ts`) — the live, uncached worker
 * counts that drive production-activity ambience (CLAUDE.md "Looping Activity Sounds": "Number of
 * active miners → Mine activity intensity"). Built on plain `{citizens, buildings}` fixtures rather
 * than a full simulated village — this module only ever reads those two arrays.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeActivityCounts, intensityFor } from '../src/audio/activity';
import type { GameState, Citizen, Building } from '../src/types';

function mkCitizen(id: number, jobId: number | null, taskKind: string): Citizen {
  return { id, jobId, task: { kind: taskKind } } as unknown as Citizen;
}
function mkBuilding(id: number, type: string): Building {
  return { id, type } as unknown as Building;
}
function mkState(citizens: Citizen[], buildings: Building[]): GameState {
  return { citizens, buildings } as unknown as GameState;
}

test('activity: an empty village reports zero for every activity', () => {
  const counts = computeActivityCounts(mkState([], []));
  assert.deepEqual(counts, { MINING: 0, WOODCUTTING: 0, BLACKSMITH: 0, CONSTRUCTION: 0 });
});

test('activity: a worker mid-cycle at a mine counts toward MINING', () => {
  const buildings = [mkBuilding(1, 'mine')];
  const citizens = [mkCitizen(1, 1, 'work')];
  const counts = computeActivityCounts(mkState(citizens, buildings));
  assert.equal(counts.MINING, 1);
  assert.equal(counts.WOODCUTTING, 0);
});

test('activity: a worker walking to/from work does not count — only `task.kind === "work"` does', () => {
  const buildings = [mkBuilding(1, 'mine')];
  const citizens = [mkCitizen(1, 1, 'toWork'), mkCitizen(2, 1, 'toDrop')];
  const counts = computeActivityCounts(mkState(citizens, buildings));
  assert.equal(counts.MINING, 0);
});

test('activity: a builder (no jobId, task "build") counts toward CONSTRUCTION regardless of building type', () => {
  const citizens = [mkCitizen(1, null, 'build'), mkCitizen(2, null, 'build')];
  const counts = computeActivityCounts(mkState(citizens, []));
  assert.equal(counts.CONSTRUCTION, 2);
});

test('activity: several workplaces feed several activities independently, in one pass', () => {
  const buildings = [mkBuilding(1, 'mine'), mkBuilding(2, 'woodcutter'), mkBuilding(3, 'blacksmith'), mkBuilding(4, 'farm')];
  const citizens = [
    mkCitizen(1, 1, 'work'),
    mkCitizen(2, 1, 'work'),
    mkCitizen(3, 2, 'work'),
    mkCitizen(4, 3, 'work'),
    mkCitizen(5, 4, 'work'), // a farmer — not one of the four ambient-loop activities, ignored
  ];
  const counts = computeActivityCounts(mkState(citizens, buildings));
  assert.equal(counts.MINING, 2);
  assert.equal(counts.WOODCUTTING, 1);
  assert.equal(counts.BLACKSMITH, 1);
});

test('activity: a citizen whose job points at a demolished/missing building is simply not counted', () => {
  const citizens = [mkCitizen(1, 999, 'work')]; // no building 999
  const counts = computeActivityCounts(mkState(citizens, []));
  assert.deepEqual(counts, { MINING: 0, WOODCUTTING: 0, BLACKSMITH: 0, CONSTRUCTION: 0 });
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
