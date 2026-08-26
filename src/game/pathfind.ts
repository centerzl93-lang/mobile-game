import {
  GameState,
  MAP_W,
  MAP_H,
  PATH_BRIDGE,
  PATH_BRIDGE_STONE,
  PATH_TUNNEL,
  PATH_STONE_MULT,
  PATH_DIRT_MULT,
  PATH_BRIDGE_MULT,
  PATH_BRIDGE_STONE_MULT,
  PATH_TUNNEL_MULT,
  blocksMovement,
  footprintW,
  footprintH,
} from '../types';
import { tileIndex, inBounds } from './world';
import { pathSpeedMult, pathsConnected } from './paths';

/**
 * Which tiles a finished building stands on, rebuilt only when the village changes.
 *
 * Walls are checked on every neighbour expansion of every A* run, so this cannot be a scan of the
 * building list. `s.navVersion` already ticks whenever the walkable world changes — paths, and now
 * buildings going up or coming down — so it doubles as the cache key.
 */
let solidGrid: Uint8Array | null = null;
let solidFor: GameState | null = null;
let solidVersion = -1;
let solidCount = -1;
let solidSize = -1;

function solids(s: GameState): Uint8Array {
  const n = MAP_W * MAP_H;
  const version = s.navVersion ?? 0;
  // Keyed on the state object as well as the version: a new village starts its version at zero
  // again, and keying on the number alone would hand it the previous map's walls. The building
  // count catches anything that appends without touching the version.
  if (
    solidGrid &&
    solidFor === s &&
    solidVersion === version &&
    solidCount === s.buildings.length &&
    solidSize === n
  ) {
    return solidGrid;
  }
  const grid = solidGrid && solidSize === n ? solidGrid : new Uint8Array(n);
  grid.fill(0);
  for (const b of s.buildings) {
    if (!blocksMovement(b)) continue;
    const w = footprintW(b);
    const h = footprintH(b);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (inBounds(b.x + dx, b.y + dy)) grid[tileIndex(b.x + dx, b.y + dy)] = 1;
      }
    }
  }
  solidGrid = grid;
  solidFor = s;
  solidVersion = version;
  solidCount = s.buildings.length;
  solidSize = n;
  return grid;
}

/**
 * A tile can be walked if it is on the map and passable. Water and mountains (`stone`) block
 * movement on their own: water is crossed only over a built bridge, mountain only through a
 * driven tunnel. Foothills, grass and forest are walkable.
 *
 * A finished building's footprint is a wall: villagers go round it and in through its door. Fields
 * and pens are the exception (see `blocksMovement`), and so are sites still under construction —
 * a builder has to be able to walk onto one to raise it.
 */
export function isWalkable(s: GameState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  const idx = tileIndex(tx, ty);
  if (solids(s)[idx]) return false;
  const type = s.tiles[idx].type;
  if (type === 'stone') return s.paths[idx] === PATH_TUNNEL;
  if (type !== 'water') return true;
  return s.paths[idx] === PATH_BRIDGE || s.paths[idx] === PATH_BRIDGE_STONE;
}

export interface Point {
  x: number;
  y: number;
}

// 8-neighbour offsets; the diagonals come last so we can gate them on the two shared
// orthogonal tiles (no cutting a diagonal between two water corners).
const NEIGHBOURS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * A tile the merchant boat can float on: any water tile on the map. Boats route over this surface
 * the way villagers route over walkable land, so a trader follows the river and lakes to its berth
 * instead of cutting a straight line across the countryside. A bridge over the water doesn't stop a
 * boat — it sails under.
 */
export function isWater(s: GameState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  return s.tiles[tileIndex(tx, ty)].type === 'water';
}

/**
 * A* from tile (fx,fy) to tile (tx,ty) over walkable tiles, weighted by how long each tile
 * actually takes to cross rather than by plain distance — see {@link landStepCost}. A villager
 * therefore routes onto a road whenever doing so is genuinely faster, joining it early and
 * leaving late for a long, straight stretch, and ignoring a path that only shaves a tile or two
 * off a route that is mostly spent getting to and from it. It is *not* "always prefer a path":
 * with no speed gain over the distance involved, the plain-ground route wins exactly as before.
 * Returns a list of tile-centre waypoints (including the destination centre) or null if no route
 * exists. The start tile is not included. If the destination itself is unwalkable, there is no
 * path.
 */
export function findPath(s: GameState, fx: number, fy: number, tx: number, ty: number): Point[] | null {
  return astar(s, fx, fy, tx, ty, isWalkable, landStepCost, LAND_BEST_MULT);
}

/**
 * A* over water tiles, for the merchant boat. Same routing as {@link findPath} but the passable
 * surface is the river/lakes, so the boat threads the channel to its wharf and back out to sea
 * rather than teleporting across land. Null when no continuous water route exists (e.g. a berth on
 * an isolated pond); the caller then falls back to a direct approach. Plain distance cost — a path
 * tile is a road for feet, not for a hull, so it carries no speed bonus on the water.
 */
export function findWaterPath(s: GameState, fx: number, fy: number, tx: number, ty: number): Point[] | null {
  return astar(s, fx, fy, tx, ty, isWater);
}

/**
 * Time to cross from the tile a step starts on (`cx`,`cy`) to the one it lands on (`nx`,`ny`), in
 * the same units `dist` (1 or `Math.SQRT2`) is already in — a straight step onto a stone road
 * costs 1/2 instead of 1. Ordinarily keyed on the *destination* tile's own multiplier
 * (`pathSpeedMult`).
 *
 * The one exception is a diagonal hop between two built-road tiles that only touch at a bare
 * corner (`pathsConnected` says no): physically walkable, since the ground under both is still
 * plain and the general corner-cutting gate above only blocks a genuinely solid obstacle, but not
 * a ride on the road — two unconnected fragments of path don't hand a mover the speed bonus for
 * hopping the gap between them, so that one step prices at plain-ground speed instead.
 */
function landStepCost(s: GameState, cx: number, cy: number, nx: number, ny: number, dist: number): number {
  if (cx !== nx && cy !== ny && pathSpeedMult(s, cx, cy) > 1 && !pathsConnected(s, cx, cy, nx, ny)) {
    return dist;
  }
  return dist / pathSpeedMult(s, nx, ny);
}
/**
 * The fastest any tile can be crossed — every path type's own speed multiplier, at its highest
 * (`PATH_STONE_MULT`/`PATH_BRIDGE_STONE_MULT`, both the quickest surface a road reaches). Used to
 * scale the A* heuristic down to match `landStepCost`'s units: since no real route can beat this
 * best case, dividing the plain-distance estimate by it keeps the heuristic admissible (never
 * overestimates), which is what keeps the search provably optimal rather than merely greedy for
 * roads.
 */
const LAND_BEST_MULT = Math.max(
  PATH_STONE_MULT, PATH_DIRT_MULT, PATH_BRIDGE_MULT, PATH_BRIDGE_STONE_MULT, PATH_TUNNEL_MULT,
);

/**
 * The A* core shared by land ({@link findPath}) and water ({@link findWaterPath}) routing.
 * `passable` decides which tiles the mover may occupy; `stepCost` decides how long entering a
 * given tile actually takes (plain distance by default, for water); `bestMult` is the fastest any
 * step could possibly be, scaling the heuristic to match. Everything else (8-neighbour steps,
 * diagonal corner gating, octile heuristic, tile-centre waypoints) is identical for both surfaces.
 */
function astar(
  s: GameState,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  passable: (s: GameState, x: number, y: number) => boolean,
  stepCost: (s: GameState, cx: number, cy: number, nx: number, ny: number, dist: number) => number =
    (_s, _cx, _cy, _nx, _ny, dist) => dist,
  bestMult = 1,
): Point[] | null {
  fx |= 0; fy |= 0; tx |= 0; ty |= 0;
  if (!inBounds(fx, fy) || !passable(s, tx, ty)) return null;
  if (fx === tx && fy === ty) return [];

  const N = MAP_W * MAP_H;
  const start = tileIndex(fx, fy);
  const goal = tileIndex(tx, ty);
  const came = new Int32Array(N).fill(-1);
  const g = new Float32Array(N).fill(Infinity);
  const seen = new Uint8Array(N);
  g[start] = 0;

  // Small binary heap keyed by f = g + heuristic.
  const heap: number[] = [start];
  const fscore = new Float32Array(N).fill(Infinity);
  fscore[start] = octile(fx, fy, tx, ty) / bestMult;
  const less = (a: number, b: number) => fscore[a] < fscore[b];
  const push = (v: number) => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(heap[i], heap[p])) { [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } else break;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const cur = pop();
    if (cur === goal) return reconstruct(came, goal);
    if (seen[cur]) continue;
    seen[cur] = 1;
    const cx = cur % MAP_W;
    const cy = (cur / MAP_W) | 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!passable(s, nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        // Don't squeeze diagonally past a blocked orthogonal corner (e.g. round a headland).
        if (!passable(s, cx + dx, cy) || !passable(s, cx, cy + dy)) continue;
      }
      const ni = tileIndex(nx, ny);
      if (seen[ni]) continue;
      const dist = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const ng = g[cur] + stepCost(s, cx, cy, nx, ny, dist);
      if (ng < g[ni]) {
        came[ni] = cur;
        g[ni] = ng;
        fscore[ni] = ng + octile(nx, ny, tx, ty) / bestMult;
        push(ni);
      }
    }
  }
  return null;
}

/**
 * Label every tile with its walkable-connected-component id (water tiles get -2). Two land
 * tiles with the same non-negative label can reach each other; used for cheap reachability
 * checks so villagers don't chase targets across an unbridged river.
 */
export function labelComponents(s: GameState): Int32Array {
  const N = MAP_W * MAP_H;
  const label = new Int32Array(N).fill(-1);
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < N; start++) {
    if (label[start] !== -1) continue;
    const sx = start % MAP_W;
    const sy = (start / MAP_W) | 0;
    if (!isWalkable(s, sx, sy)) { label[start] = -2; continue; }
    label[start] = next;
    stack.length = 0;
    stack.push(start);
    while (stack.length) {
      const cur = stack.pop()!;
      const cx = cur % MAP_W;
      const cy = (cur / MAP_W) | 0;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isWalkable(s, nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!isWalkable(s, cx + dx, cy) || !isWalkable(s, cx, cy + dy))) continue;
        const ni = tileIndex(nx, ny);
        if (label[ni] !== -1) continue;
        label[ni] = next;
        stack.push(ni);
      }
    }
    next++;
  }
  return label;
}

function reconstruct(came: Int32Array, goal: number): Point[] {
  const out: Point[] = [];
  let cur = goal;
  while (cur !== -1) {
    out.push({ x: (cur % MAP_W) + 0.5, y: ((cur / MAP_W) | 0) + 0.5 });
    cur = came[cur];
  }
  out.pop(); // drop the start tile — the citizen is already there
  out.reverse();
  return out;
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}
