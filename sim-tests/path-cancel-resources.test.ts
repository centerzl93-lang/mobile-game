/**
 * Cancelling a planned (not-yet-built) path must release the harvest order it placed on its own
 * tile — `confirmPendingPaths`/`markGroundHarvest` in `paths.ts` marks whatever a confirmed dirt
 * or stone path covers (a tree, loose stone, surface ore) so the ground gets hand-cleared before
 * a builder lays the road, exactly the way `markFootprintHarvest` does for a building site.
 * `markPathRaze`'s "cancel a still-planned tile outright" branch used to clear the path itself
 * without ever clearing that harvest mark, so a laborer kept chasing wood/stone for a road that no
 * longer existed and the tile could never again be treated as ordinary, unreserved ground.
 *
 * Mirrors `clearFootprintHarvest`'s reasoning for a cancelled building site (`buildings.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { placeBuilding } from '../src/game/buildings';
import {
  planPath,
  markPending,
  confirmPendingPaths,
  markPathRaze,
  demolishPathRect,
} from '../src/game/paths';
import { update, pickHarvestFor } from '../src/game/simulation';
import { PATH_NONE, PATH_DIRT_PLAN, HARVEST_NONE, HARVEST_WOOD, HARVEST_STONE } from '../src/types';
import type { GameState, Citizen, Building } from '../src/types';

const noLog = () => {};

/** A bare map: all grass, no paths, no harvest orders, no buildings/citizens — tests plant
 *  exactly the forest/stone tiles and path plans they need. */
function flatState(seed: number): GameState {
  const s = newGame('small', 'normal', false, seed);
  s.buildings = [];
  s.citizens = [];
  for (let i = 0; i < s.tiles.length; i++) s.tiles[i] = { type: 'grass', trees: 0 };
  for (let i = 0; i < s.paths.length; i++) s.paths[i] = PATH_NONE;
  for (let i = 0; i < s.harvest.length; i++) s.harvest[i] = HARVEST_NONE;
  s.navVersion = (s.navVersion ?? 0) + 1;
  return s;
}

const idx = (s: GameState, x: number, y: number) => y * s.w + x;

/** Draw, then confirm, a single dirt or stone path tile — the same two-step flow the UI drives
 *  (`markPending` before `confirmPendingPaths`), which is what actually queues the ground harvest. */
function planAndConfirm(s: GameState, x: number, y: number, tier: 'dirt' | 'stone' = 'dirt'): void {
  const ok = planPath(s, x, y, tier, { ignoreTier: true });
  assert.ok(ok, `planPath should succeed at (${x},${y})`);
  markPending(s, x, y, PATH_NONE);
  const n = confirmPendingPaths(s);
  assert.equal(n, 1);
}

/** A built barn, stocked well past any road's material cost, so `planPath` never fails for want
 *  of stone/wood in stores that this test isn't about. */
function stockedBarn(s: GameState, x: number, y: number): Building {
  const b: Building = {
    id: s.nextId++, type: 'barn', x, y, built: true, progress: 80, workers: [],
    desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', replant: false, animal: 'cattle',
    store: { stone: 9999, wood: 9999 },
  };
  s.buildings.push(b);
  s.navVersion = (s.navVersion ?? 0) + 1;
  return b;
}

function citizenAt(s: GameState, x: number, y: number): Citizen {
  return {
    id: s.nextId++, name: 'X', x, y, tx: x, ty: y,
    homeId: null, jobId: null, carry: null, task: { kind: 'idle' }, timer: 0,
    sex: 'f', age: 25, health: 80, happiness: 80, educated: false, sick: false,
  } as Citizen;
}

test('confirming a path over a forest tile marks it for wood harvest', () => {
  const s = flatState(9001);
  s.tiles[idx(s, 10, 10)] = { type: 'forest', trees: 1 };
  planAndConfirm(s, 10, 10, 'dirt');
  assert.equal(s.paths[idx(s, 10, 10)], PATH_DIRT_PLAN);
  assert.equal(s.harvest[idx(s, 10, 10)], HARVEST_WOOD);
});

test('cancelling that plan before a builder touches it releases the wood reservation', () => {
  const s = flatState(9002);
  s.tiles[idx(s, 10, 10)] = { type: 'forest', trees: 1 };
  planAndConfirm(s, 10, 10, 'dirt');
  assert.equal(s.harvest[idx(s, 10, 10)], HARVEST_WOOD, 'sanity: reserved before cancelling');

  const result = markPathRaze(s, idx(s, 10, 10));
  assert.equal(result, 'unplanned');
  assert.equal(s.paths[idx(s, 10, 10)], PATH_NONE, 'the plan itself is gone');
  assert.equal(
    s.harvest[idx(s, 10, 10)], HARVEST_NONE,
    'no stale HARVEST_WOOD mark should outlive the cancelled path',
  );
});

test('cancelling a planned stone path releases its loose-stone reservation the same way', () => {
  const s = flatState(9003);
  stockedBarn(s, 0, 0);
  s.tiles[idx(s, 12, 10)] = { type: 'grass', trees: 0, stone: 5 };
  planAndConfirm(s, 12, 10, 'stone');
  assert.equal(s.harvest[idx(s, 12, 10)], HARVEST_STONE);

  markPathRaze(s, idx(s, 12, 10));
  assert.equal(s.harvest[idx(s, 12, 10)], HARVEST_NONE);
  // The stone itself was never touched — only the reservation to fetch it is released.
  assert.equal(s.tiles[idx(s, 12, 10)].stone, 5);
});

test('cancelling via the marquee (demolishPathRect) releases every tile it un-plans', () => {
  const s = flatState(9004);
  stockedBarn(s, 0, 0);
  s.tiles[idx(s, 10, 10)] = { type: 'forest', trees: 1 };
  s.tiles[idx(s, 11, 10)] = { type: 'forest', trees: 1 };
  s.tiles[idx(s, 12, 10)] = { type: 'grass', trees: 0, stone: 3 };
  planAndConfirm(s, 10, 10, 'dirt');
  planAndConfirm(s, 11, 10, 'dirt');
  planAndConfirm(s, 12, 10, 'stone');
  assert.equal(s.harvest[idx(s, 10, 10)], HARVEST_WOOD);
  assert.equal(s.harvest[idx(s, 11, 10)], HARVEST_WOOD);
  assert.equal(s.harvest[idx(s, 12, 10)], HARVEST_STONE);

  const removed = demolishPathRect(s, 10, 10, 12, 10);
  assert.equal(removed, 3);
  for (const [x, y] of [[10, 10], [11, 10], [12, 10]]) {
    assert.equal(s.paths[idx(s, x, y)], PATH_NONE);
    assert.equal(s.harvest[idx(s, x, y)], HARVEST_NONE, `(${x},${y}) should no longer be reserved`);
  }
});

test('a villager can no longer be sent after a cancelled path\'s wood — and can once the tile is marked again', () => {
  const s = flatState(9005);
  s.tiles[idx(s, 10, 10)] = { type: 'forest', trees: 1 };
  planAndConfirm(s, 10, 10, 'dirt');
  const c = citizenAt(s, 10, 10);
  s.citizens.push(c);
  // Prime the shared walkable-connectivity cache `pickHarvestFor` relies on — normally kept fresh
  // by `update`'s per-tick pipeline (`ensureNavLabels`), which nothing else in this test runs.
  update(s, 0, noLog);
  assert.equal(pickHarvestFor(s, c), idx(s, 10, 10), 'sanity: the standing plan is a live order');

  markPathRaze(s, idx(s, 10, 10));
  assert.equal(pickHarvestFor(s, c), -1, 'nothing left to fetch once the road is cancelled');

  // The tile is genuinely ordinary ground again: re-planning a road over it re-reserves it exactly
  // as if it had never been touched, rather than the mark being stuck in some half-cleared state.
  planAndConfirm(s, 10, 10, 'dirt');
  assert.equal(s.harvest[idx(s, 10, 10)], HARVEST_WOOD);
  assert.equal(pickHarvestFor(s, c), idx(s, 10, 10));
});

test('cancelling one planned path leaves a second, still-active planned path untouched', () => {
  const s = flatState(9006);
  s.tiles[idx(s, 10, 10)] = { type: 'forest', trees: 1 }; // will be cancelled
  s.tiles[idx(s, 20, 10)] = { type: 'forest', trees: 1 }; // stays planned
  planAndConfirm(s, 10, 10, 'dirt');
  planAndConfirm(s, 20, 10, 'dirt');

  markPathRaze(s, idx(s, 10, 10));

  assert.equal(s.harvest[idx(s, 10, 10)], HARVEST_NONE, 'the cancelled tile is released');
  assert.equal(s.paths[idx(s, 20, 10)], PATH_DIRT_PLAN, 'the other road is still planned');
  assert.equal(
    s.harvest[idx(s, 20, 10)], HARVEST_WOOD,
    'a different, still-legitimate reservation must not be swept up by an unrelated cancel',
  );
});

test('cancelling a planned path does not release a building site\'s own footprint reservation', () => {
  const s = flatState(9007);
  stockedBarn(s, 0, 0);
  s.tiles[idx(s, 30, 30)] = { type: 'forest', trees: 1 }; // under the well's footprint
  s.tiles[idx(s, 10, 10)] = { type: 'forest', trees: 1 }; // under the unrelated path plan
  const well = placeBuilding(s, 'well', 30, 30, undefined, undefined, 0, { ignoreTier: true });
  assert.ok(well, 'sanity: the well site was placed');
  assert.equal(s.harvest[idx(s, 30, 30)], HARVEST_WOOD, 'sanity: the site reserved its own footprint');

  planAndConfirm(s, 10, 10, 'dirt');
  markPathRaze(s, idx(s, 10, 10));

  assert.equal(s.harvest[idx(s, 10, 10)], HARVEST_NONE, 'the cancelled path released its own tile');
  assert.equal(
    s.harvest[idx(s, 30, 30)], HARVEST_WOOD,
    'the still-active building site keeps its own, unrelated reservation',
  );
});

test('cancelling a path releases the reservation even after partial hand-harvesting', () => {
  const s = flatState(9008);
  s.tiles[idx(s, 10, 10)] = { type: 'forest', trees: 1 };
  planAndConfirm(s, 10, 10, 'dirt');
  // Simulate a laborer having already chopped some of the tree without finishing the tile —
  // still above the 0.05 threshold `pickHarvest` clears at, so the order is still outstanding.
  s.tiles[idx(s, 10, 10)].trees = 0.4;
  assert.equal(s.harvest[idx(s, 10, 10)], HARVEST_WOOD, 'sanity: still marked mid-harvest');

  markPathRaze(s, idx(s, 10, 10));
  assert.equal(s.harvest[idx(s, 10, 10)], HARVEST_NONE, 'released even though work was already underway');
  // What was already chopped stays chopped — cancelling un-reserves the tile, it does not undo
  // wood already collected.
  assert.equal(s.tiles[idx(s, 10, 10)].trees, 0.4);
});
