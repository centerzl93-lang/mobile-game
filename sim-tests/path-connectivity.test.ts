/**
 * Two path tiles that only touch at a corner are not one connected road — `pathsConnected` in
 * `paths.ts` is the shared definition, and `findPath`'s A* (`pathfind.ts`) is the one place that
 * definition actually changes behaviour: a diagonal hop between two corner-only road tiles gets
 * no ride-the-road speed credit, the same as if neither tile were a road at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { findPath, Point } from '../src/game/pathfind';
import { pathsConnected, pathSpeedMult } from '../src/game/paths';
import { PATH_NONE, PATH_STONE } from '../src/types';
import type { GameState } from '../src/types';

function flatState(seed = 1): GameState {
  const s = newGame('small', 'normal', false, seed);
  s.buildings = [];
  s.citizens = [];
  for (let i = 0; i < s.tiles.length; i++) s.tiles[i] = { type: 'grass', trees: 0 };
  for (let i = 0; i < s.paths.length; i++) s.paths[i] = PATH_NONE;
  s.navVersion = (s.navVersion ?? 0) + 1;
  return s;
}
/**
 * The time-cost of a returned route, computed independently of `landStepCost` but honouring the
 * same corner rule via the separately-tested `pathsConnected` — a diagonal hop between two road
 * tiles only earns the speed bonus when they're genuinely connected, not merely both present.
 */
function routeCost(s: GameState, start: { x: number; y: number }, route: Point[]): number {
  let cost = 0;
  let px = start.x, py = start.y;
  for (const p of route) {
    const nx = Math.floor(p.x), ny = Math.floor(p.y);
    const dist = Math.hypot(p.x - (px + 0.5), p.y - (py + 0.5));
    const diagonalCornerCut = nx !== px && ny !== py && pathSpeedMult(s, px, py) > 1 && !pathsConnected(s, px, py, nx, ny);
    cost += diagonalCornerCut ? dist : dist / pathSpeedMult(s, nx, ny);
    px = nx; py = ny;
  }
  return cost;
}

test('side-to-side (orthogonal) road tiles are connected', () => {
  const s = flatState(201);
  s.paths[10 * s.w + 10] = PATH_STONE;
  s.paths[10 * s.w + 11] = PATH_STONE; // due east — a shared full edge
  assert.equal(pathsConnected(s, 10, 10, 11, 10), true);
});

test('diagonal road tiles with the corner filled in are connected', () => {
  const s = flatState(202);
  s.paths[10 * s.w + 10] = PATH_STONE;
  s.paths[11 * s.w + 11] = PATH_STONE; // south-east corner
  s.paths[10 * s.w + 11] = PATH_STONE; // fills the corner between them
  assert.equal(pathsConnected(s, 10, 10, 11, 11), true);
});

test('diagonal road tiles touching only at a bare corner are NOT connected', () => {
  const s = flatState(203);
  // [PATH][    ]
  // [    ][PATH]  — the INVALID diagram from the spec: nothing fills either corner tile.
  s.paths[10 * s.w + 10] = PATH_STONE;
  s.paths[11 * s.w + 11] = PATH_STONE;
  assert.equal(pathsConnected(s, 10, 10, 11, 11), false);
  assert.equal(pathsConnected(s, 11, 11, 10, 10), false, 'symmetric — order does not matter');
});

test('tiles more than one step apart are never "connected" by this check', () => {
  const s = flatState(204);
  s.paths[10 * s.w + 10] = PATH_STONE;
  s.paths[10 * s.w + 13] = PATH_STONE;
  assert.equal(pathsConnected(s, 10, 10, 13, 10), false);
});

test('pathfinding gets no speed credit for cutting between two corner-only road tiles', () => {
  const s = flatState(205);
  // Two isolated road tiles that only touch at a corner, sitting on the direct diagonal line
  // between start and goal — the shortest possible route already runs straight across them.
  s.paths[10 * s.w + 10] = PATH_STONE;
  s.paths[11 * s.w + 11] = PATH_STONE;
  const start = { x: 9, y: 9 };
  const goal = { x: 12, y: 12 };
  const route = findPath(s, start.x, start.y, goal.x, goal.y);
  assert.ok(route);
  const cost = routeCost(s, start, route!);
  // Three diagonal steps of plain distance sqrt2 each: the first (open ground onto the first road
  // tile) and last (off the second road tile onto open ground) are ordinary, valid joins and earn
  // the full speed bonus; only the middle step — hopping corner-to-corner between the two road
  // tiles themselves, with neither flanking corner filled in — gets no credit. So the true cost is
  // (sqrt2/2) + sqrt2 + sqrt2, strictly between "every step discounted" (3*sqrt2/2) and "no road
  // anywhere" (3*sqrt2) — the corner-cut denies credit for exactly the one edge in question, not
  // the whole route.
  const expected = Math.SQRT2 / 2 + Math.SQRT2 + Math.SQRT2;
  const plain = 3 * Math.SQRT2;
  assert.ok(cost < plain - 0.1, `the two legitimate road joins still earn their own credit (${cost.toFixed(3)} < ${plain.toFixed(3)})`);
  assert.ok(
    Math.abs(cost - expected) < 0.01,
    `only the corner-cut edge itself should be denied credit — cost (${cost.toFixed(3)}) should match ${expected.toFixed(3)}`,
  );
});

test('the same two tiles DO earn the speed bonus once the corner between them is filled in', () => {
  const s = flatState(206);
  s.paths[10 * s.w + 10] = PATH_STONE;
  s.paths[11 * s.w + 11] = PATH_STONE;
  s.paths[10 * s.w + 11] = PATH_STONE; // fills the corner — now a real, connected road
  const start = { x: 9, y: 9 };
  const goal = { x: 12, y: 12 };
  const route = findPath(s, start.x, start.y, goal.x, goal.y);
  assert.ok(route);
  const cost = routeCost(s, start, route!);
  const plain = 3 * Math.SQRT2;
  assert.ok(cost < plain - 0.1, `filling the corner should earn a real speed-up (got ${cost.toFixed(3)}, plain is ${plain.toFixed(3)})`);
});

test('visuals read the same per-tile path value pathfinding does — nothing to fall out of sync', () => {
  // The renderer draws every path tile as its own independent slab keyed off `s.paths[i]`
  // (`syncPaths` in `renderer3d.ts`) — there is no separate "joined road" mesh state computed
  // from neighbours that could disagree with `pathsConnected`. A corner-only pair simply renders
  // as two disconnected tiles, which is already the correct picture.
  const s = flatState(207);
  s.paths[10 * s.w + 10] = PATH_STONE;
  s.paths[11 * s.w + 11] = PATH_STONE;
  assert.equal(pathSpeedMult(s, 10, 10), pathSpeedMult(s, 11, 11), 'each tile carries its own speed/visual value independently');
  assert.equal(pathsConnected(s, 10, 10, 11, 11), false, 'and the connectivity check both pathfinding and any future visual joint would read agrees: not connected');
});
