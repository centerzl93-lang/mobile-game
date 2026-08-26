/**
 * Villager routing should pick the fastest route, not the shortest one — joining a road when
 * doing so actually saves time, and staying off it (or off to the side of it) when it wouldn't.
 * `findPath`'s A* now weighs each step by how long it actually takes to cross
 * (`pathSpeedMult`/`landStepCost` in `pathfind.ts`), not by plain distance.
 *
 * These build a fully flat, unobstructed test map (every tile grass, no buildings) so the
 * geometry is exact and hand-computable, then lay roads directly into `s.paths`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { findPath, Point } from '../src/game/pathfind';
import { pathSpeedMult } from '../src/game/paths';
import { PATH_NONE, PATH_STONE, PATH_DIRT } from '../src/types';
import type { GameState } from '../src/types';

/** A `newGame` map with every tile flattened to plain grass and no buildings in the way, so
 *  `isWalkable` is true everywhere and the only thing shaping a route is what's laid in `s.paths`. */
function flatState(seed = 1): GameState {
  const s = newGame('small', 'normal', false, seed);
  s.buildings = [];
  s.citizens = [];
  for (let i = 0; i < s.tiles.length; i++) s.tiles[i] = { type: 'grass', trees: 0 };
  for (let i = 0; i < s.paths.length; i++) s.paths[i] = PATH_NONE;
  s.navVersion = (s.navVersion ?? 0) + 1;
  return s;
}
function layRoad(s: GameState, kind: number, pts: { x: number; y: number }[]): void {
  for (const { x, y } of pts) s.paths[y * s.w + x] = kind;
}
/** Every tile on a straight run between two points, inclusive — for laying road segments. */
function line(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  let x = x0, y = y0;
  out.push({ x, y });
  while (x !== x1 || y !== y1) {
    if (x !== x1) x += dx;
    if (y !== y1) y += dy;
    out.push({ x, y });
  }
  return out;
}
/** The true time-cost of a returned route: the same per-tile weighting `landStepCost` applies,
 *  computed independently here so the test isn't just re-asserting the production code's own math. */
function routeCost(s: GameState, start: { x: number; y: number }, route: Point[]): number {
  let cost = 0;
  let px = start.x + 0.5, py = start.y + 0.5;
  for (const p of route) {
    const dist = Math.hypot(p.x - px, p.y - py);
    cost += dist / pathSpeedMult(s, Math.floor(p.x), Math.floor(p.y));
    px = p.x; py = p.y;
  }
  return cost;
}

test('a longer stone-road detour is chosen over a shorter walk across bare ground, when it is actually faster', () => {
  const s = flatState(101);
  const start = { x: 5, y: 5 };
  const goal = { x: 5, y: 35 };
  // Direct across bare ground: 30 tiles, cost 30. The alternative below is a 50-tile detour, but
  // at double speed on stone (`PATH_STONE_MULT` = 2) it costs 25 — genuinely faster despite being
  // two-thirds again as long.
  layRoad(s, PATH_STONE, [...line(5, 5, 15, 5), ...line(15, 5, 15, 35), ...line(15, 35, 5, 35)]);
  const route = findPath(s, start.x, start.y, goal.x, goal.y);
  assert.ok(route, 'a route exists');
  const cost = routeCost(s, start, route!);
  assert.ok(cost < 30, `the road route (${cost.toFixed(1)}) should beat the direct 30-cost walk`);
  assert.ok(cost < 27, `close to the hand-computed 25 for actually taking the road (got ${cost.toFixed(1)})`);
});

test('a villager well off to the side of a long road still joins it — the saved distance is worth the detour', () => {
  const s = flatState(102);
  const start = { x: 0, y: 5 };
  const goal = { x: 0, y: 50 };
  // Direct: 45 straight down bare ground, cost 45. Sidestepping 5 tiles onto a stone road,
  // riding it the same 45 tiles at half cost, then stepping 5 back off: 5 + 22.5 + 5 = 32.5.
  layRoad(s, PATH_STONE, line(5, 5, 5, 50));
  const route = findPath(s, start.x, start.y, goal.x, goal.y);
  assert.ok(route);
  const cost = routeCost(s, start, route!);
  assert.ok(cost < 45, `joining the road (${cost.toFixed(1)}) should beat walking straight down (45)`);
  assert.ok(cost < 35, `close to the hand-computed 32.5 for the sidestep-and-ride (got ${cost.toFixed(1)})`);
  // And it actually used the road, not merely found some other shortcut.
  const usedRoad = route!.some((p) => Math.floor(p.x) === 5 && s.paths[Math.floor(p.y) * s.w + 5] === PATH_STONE);
  assert.ok(usedRoad, 'the route actually rides the road rather than just passing near it');
});

test('a short, nearby road is skipped when the detour to reach it costs more than it saves', () => {
  const s = flatState(103);
  const start = { x: 0, y: 5 };
  const goal = { x: 0, y: 15 };
  // Direct: 10 straight down, cost 10. Detouring onto the same road as above (5 + 10/2 + 5 = 15)
  // costs more than it saves over such a short stretch — the goal here is well short of the road.
  layRoad(s, PATH_STONE, line(5, 0, 5, 20));
  const route = findPath(s, start.x, start.y, goal.x, goal.y);
  assert.ok(route);
  const cost = routeCost(s, start, route!);
  assert.ok(cost <= 10.5, `should walk straight down (10) rather than detour onto the road (got ${cost.toFixed(1)})`);
});

test('an unreachable (disconnected) road changes nothing — the direct route is still found', () => {
  const s = flatState(104);
  const start = { x: 0, y: 5 };
  const goal = { x: 0, y: 15 };
  // A short stone road exists, but it's a walled-off island — surrounded by water on all sides —
  // so nobody can ever actually reach it. It should be invisible to the route, not cause a stall
  // or a null result.
  for (let y = 4; y <= 11; y++) for (let x = 19; x <= 26; x++) s.tiles[y * s.w + x] = { type: 'water', trees: 0 };
  layRoad(s, PATH_STONE, line(21, 7, 21, 9));
  const route = findPath(s, start.x, start.y, goal.x, goal.y);
  assert.ok(route, 'still finds a route even with an unreachable road elsewhere on the map');
  const cost = routeCost(s, start, route!);
  assert.ok(cost <= 10.5, `unaffected by the road it can never reach (got ${cost.toFixed(1)})`);
});

test('with no roads at all, routing is unaffected — plain shortest-path, as before', () => {
  const s = flatState(105);
  const start = { x: 2, y: 2 };
  const goal = { x: 20, y: 9 };
  const route = findPath(s, start.x, start.y, goal.x, goal.y);
  assert.ok(route);
  const cost = routeCost(s, start, route!);
  // Octile distance: max(dx,dy) + (sqrt2-1)*min(dx,dy).
  const dx = 18, dy = 7;
  const octile = Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  assert.ok(Math.abs(cost - octile) < 0.05, `matches plain octile distance ${octile.toFixed(2)} (got ${cost.toFixed(2)})`);
});

test('offered a choice of roads, the cheaper (faster) one is the one actually used', () => {
  const s = flatState(106);
  const start = { x: 0, y: 10 };
  const goal = { x: 0, y: 55 };
  // A dirt detour (1.5x) at x=6: 6 + 45/1.5 + 6 = 42.
  layRoad(s, PATH_DIRT, line(6, 10, 6, 55));
  // A stone detour (2x) at x=14, further to walk to but much faster once on it: 14 + 45/2 + 14 = 50.5.
  // Deliberately the worse overall option this time, so the dirt one below is the real "cheaper of
  // two" — a stone road is not automatically the answer if reaching it costs too much.
  layRoad(s, PATH_STONE, line(14, 10, 14, 55));
  const route = findPath(s, start.x, start.y, goal.x, goal.y);
  assert.ok(route);
  const cost = routeCost(s, start, route!);
  assert.ok(cost < 43, `the cheaper dirt detour (~42) should win over the pricier stone one (~50.5); got ${cost.toFixed(1)}`);
  const usedDirt = route!.some((p) => Math.floor(p.x) === 6 && s.paths[Math.floor(p.y) * s.w + 6] === PATH_DIRT);
  assert.ok(usedDirt, 'the route actually rides the cheaper dirt road');
});
