import {
  GameState,
  Tile,
  HARVEST_NONE,
  PATH_NONE,
  PATH_DIRT,
  PATH_DIRT_PLAN,
  PATH_STONE,
  PATH_STONE_PLAN,
  PATH_BRIDGE,
  BRIDGE_STONE_STONE_COST,
  BRIDGE_STONE_WOOD_COST,
  PATH_BRIDGE_STONE_MULT,
  PATH_BRIDGE_STONE_PLAN,
  PATH_BRIDGE_STONE,
  PATH_BRIDGE_PLAN,
  PATH_TUNNEL,
  PATH_TUNNEL_PLAN,
  isPlannedPath,
  PATH_DIRT_MULT,
  PATH_STONE_MULT,
  PATH_BRIDGE_MULT,
  PATH_TUNNEL_MULT,
  STONE_PATH_COST,
  BRIDGE_WOOD_COST,
  TUNNEL_WOOD_COST,
  TUNNEL_STONE_COST,
  footprintW,
  footprintH,
  MAP_W,
  MAP_H,
} from '../types';
import { pathUnlocked } from './tiers';
import { tileIndex, inBounds, getTile } from './world';
import { HARVEST_WOOD, HARVEST_STONE, HARVEST_IRON } from '../types';
import { totalStored } from './storage';

export type PathTier = 'dirt' | 'stone' | 'bridge' | 'stonebridge' | 'tunnel';

/**
 * Plan a path tile of the given tier. Returns true if a tile was newly planned.
 * Dirt/stone go on land (stone costs stone); bridges go on water (cost wood) so villagers
 * can cross. Tiles cannot be planned over an existing equal-or-better path of that kind,
 * nor under a building — a path is a surface, so nothing may share its tile.
 */
export function planPath(
  s: GameState,
  tx: number,
  ty: number,
  tier: PathTier,
  opts: { ignoreTier?: boolean } = {},
): boolean {
  // The village has not earned this kind of roadway yet. `ignoreTier` is for the debug hooks,
  // which mean "lay this regardless of how far along the village is" — the same contract
  // `debugPlace` keeps for buildings.
  if (!opts.ignoreTier && !pathUnlocked(s, tier)) return false;
  if (!inBounds(tx, ty)) return false;
  const t = getTile(s.tiles, tx, ty)!;
  const idx = tileIndex(tx, ty);
  const cur = s.paths[idx];
  if (tileHasBuilding(s, tx, ty)) return false; // paths don't run underneath buildings
  if (tier === 'bridge' || tier === 'stonebridge') {
    if (t.type !== 'water') return false; // bridges only span water
    const stone = tier === 'stonebridge';
    // Already this tier (or planned as it) — nothing to do. The *other* tier is allowed over the
    // top, which is what makes a timber crossing upgradeable to masonry and back again, exactly
    // as a track can be paved and a paved street returned to a track.
    if (stone ? cur === PATH_BRIDGE_STONE || cur === PATH_BRIDGE_STONE_PLAN : cur === PATH_BRIDGE || cur === PATH_BRIDGE_PLAN) {
      return false;
    }
    if (stone) {
      if (totalStored(s, 'wood') < BRIDGE_STONE_WOOD_COST) return false;
      if (totalStored(s, 'stone') < BRIDGE_STONE_STONE_COST) return false;
    } else if (totalStored(s, 'wood') < BRIDGE_WOOD_COST) {
      return false;
    }
    s.paths[idx] = stone ? PATH_BRIDGE_STONE_PLAN : PATH_BRIDGE_PLAN;
    return true;
  }
  if (tier === 'tunnel') {
    if (t.type !== 'stone') return false; // tunnels only bore through mountain
    if (cur === PATH_TUNNEL || cur === PATH_TUNNEL_PLAN) return false;
    if (totalStored(s, 'wood') < TUNNEL_WOOD_COST) return false;
    if (totalStored(s, 'stone') < TUNNEL_STONE_COST) return false;
    s.paths[idx] = PATH_TUNNEL_PLAN;
    return true;
  }
  if (t.type === 'water' || t.type === 'stone') return false;
  if (tier === 'stone') {
    if (cur === PATH_STONE || cur === PATH_STONE_PLAN) return false;
    // Stone is consumed by the builder when the tile is laid; just require some exists.
    if (totalStored(s, 'stone') < STONE_PATH_COST) return false;
    s.paths[idx] = PATH_STONE_PLAN;
    return true;
  }
  // Dirt goes on bare ground, and also *over* a stone road — downgrading a paved street back to
  // a track was impossible without demolishing it tile by tile first.
  if (cur !== PATH_NONE && cur !== PATH_STONE && cur !== PATH_STONE_PLAN) return false;
  s.paths[idx] = PATH_DIRT_PLAN;
  return true;
}

/**
 * Mark whatever is growing or lying on a tile for harvest before a path is laid over it.
 *
 * Paving used to simply delete the trees and deposits it covered. Routing a road through the
 * woods therefore destroyed the timber instead of collecting it, and the player had no way to
 * ask for it first. Now confirming a path queues the harvest, and `buildPath` waits for it —
 * the same rule buildings already follow through `footprintClear`.
 *
 * This runs on *confirm*, not while the route is being dragged: a drag re-plans the whole stroke
 * every pointer move and can be cancelled or steered elsewhere, so marking on plan sent gatherers
 * off to fell a wood the player was still deciding whether to route around.
 */
function markGroundHarvest(s: GameState, idx: number, t: Tile): void {
  if (s.harvest[idx] !== HARVEST_NONE) return; // an order is already outstanding here
  if (t.type === 'forest' && t.trees > 0.05) s.harvest[idx] = HARVEST_WOOD;
  else if ((t.stone ?? 0) > 0) s.harvest[idx] = HARVEST_STONE;
  else if ((t.iron ?? 0) > 0) s.harvest[idx] = HARVEST_IRON;
}

/**
 * Mark a freshly planned tile as awaiting the player's confirmation. Villagers ignore pending
 * tiles (`buildPath`), so a drag can be reviewed and cancelled before it becomes work orders.
 */
export function markPending(s: GameState, tx: number, ty: number, prev = PATH_NONE): void {
  const idx = tileIndex(tx, ty);
  const pending = (s.pendingPaths ??= []);
  const prevs = (s.pendingPrev ??= []);
  if (pending.includes(idx)) return;
  pending.push(idx);
  // What this tile held before the plan went on it. Cancelling a stone path drawn over an
  // existing dirt one used to clear the tile to bare ground — the player lost a road they had
  // already built by changing their mind about upgrading it.
  prevs.push(prev);
}

/** How many drawn-but-unconfirmed path tiles are waiting. */
export function pendingPathCount(s: GameState): number {
  return s.pendingPaths?.length ?? 0;
}

/** Accept the drawn tiles: they stay planned, and villagers may now lay them. */
export function confirmPendingPaths(s: GameState): number {
  const pending = s.pendingPaths ?? [];
  const n = pending.length;
  // Only now that the route is accepted do we queue the harvest of anything it covers — trees,
  // loose stone, ore. Marking it while the stroke was still being dragged (as `planPath` used to)
  // sent gatherers after a road the player might yet cancel or re-route.
  for (const idx of pending) {
    const v = s.paths[idx];
    if (v !== PATH_DIRT_PLAN && v !== PATH_STONE_PLAN) continue; // land paths only; a bridge/tunnel has nothing to reap
    const t = getTile(s.tiles, idx % MAP_W, (idx / MAP_W) | 0);
    if (t) markGroundHarvest(s, idx, t);
  }
  s.pendingPaths = [];
  s.pendingPrev = [];
  return n;
}

/** Discard the drawn tiles, clearing any that are still only planned back to bare ground. */
export function cancelPendingPaths(s: GameState): number {
  const pending = s.pendingPaths ?? [];
  const prevs = s.pendingPrev ?? [];
  let cleared = 0;
  for (let k = 0; k < pending.length; k++) {
    const idx = pending[k];
    const v = s.paths[idx];
    // Only un-plan: a tile a villager already finished while this sat pending stays built.
    if (isPlannedPath(v)) {
      // Put back whatever was there before, so cancelling an upgrade leaves the old road intact
      // rather than scrubbing the tile to bare ground.
      s.paths[idx] = prevs[k] ?? PATH_NONE;
      cleared++;
    }
  }
  s.pendingPaths = [];
  s.pendingPrev = [];
  return cleared;
}

/**
 * Ground a road of this tier could run over — for *routing*, which is a looser question than
 * whether a tile can be newly planned.
 *
 * A tile that already carries this road is perfectly good to route along; `planPath` will decline
 * to re-plan it and the stroke simply has a gap where the road already exists. Bridges and tunnels
 * count too: a crossing that has already been built is the obvious way through, and a road drawn
 * from one bank to the other should follow it rather than refuse to cross.
 */
function routable(s: GameState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  if (tileHasBuilding(s, tx, ty)) return false;
  const t = getTile(s.tiles, tx, ty)!;
  const cur = s.paths[tileIndex(tx, ty)];
  if (t.type === 'water')
    return (
      cur === PATH_BRIDGE ||
      cur === PATH_BRIDGE_PLAN ||
      cur === PATH_BRIDGE_STONE ||
      cur === PATH_BRIDGE_STONE_PLAN
    );
  if (t.type === 'stone') return cur === PATH_TUNNEL || cur === PATH_TUNNEL_PLAN;
  return true;
}

/** Cost of stepping onto a tile: paved ground is cheap, so a route joins up existing roads. */
function tileCost(s: GameState, tx: number, ty: number): number {
  return s.paths[tileIndex(tx, ty)] === PATH_NONE ? 1 : ROAD_REUSE;
}

/**
 * What a turn costs, relative to a tile of open ground.
 *
 * Without it the router is free to stagger diagonally across a field — every zig-zag between two
 * points is the same length as the L that goes round, and A* returns whichever it happened to
 * expand first. Charging for a change of direction breaks the tie towards long straight runs and
 * a couple of deliberate corners, which is what a road looks like. It is well under the cost of a
 * tile, so it never sends a route the long way round to save a bend.
 */
const TURN_COST = 0.45;
/** Multiplier on a tile that already carries any road, so routes prefer to reuse what is there. */
const ROAD_REUSE = 0.35;

/**
 * The route a road should take between two tiles: the cheapest way across ground it can be laid
 * on, preferring straight runs and existing roads. Includes both ends. Null when there is no way
 * through (or the finger is over water, rock or a building).
 *
 * This is a separate search from `findPath`, which answers a different question — that one is
 * about where a villager can *walk*, this one about where a road can *go*, and the two differ on
 * every tile of forest, every unbuilt bridge and every stretch of open water.
 */
export function routePath(
  s: GameState,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): { x: number; y: number }[] | null {
  fx |= 0;
  fy |= 0;
  tx |= 0;
  ty |= 0;
  if (!routable(s, fx, fy) || !routable(s, tx, ty)) return null;
  if (fx === tx && fy === ty) return [{ x: fx, y: fy }];

  const N = MAP_W * MAP_H;
  const start = tileIndex(fx, fy);
  const goal = tileIndex(tx, ty);
  const came = new Int32Array(N).fill(-1);
  const dir = new Int8Array(N).fill(-1); // which of NEIGHBOURS8 arrived here, for the turn charge
  const g = new Float32Array(N).fill(Infinity);
  const seen = new Uint8Array(N);
  const f = new Float32Array(N).fill(Infinity);
  g[start] = 0;
  f[start] = 0;

  const heap: number[] = [start];
  const push = (v: number): void => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[i]] < f[heap[p]]) {
        [heap[i], heap[p]] = [heap[p], heap[i]];
        i = p;
      } else break;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const cur = pop();
    if (cur === goal) break;
    if (seen[cur]) continue;
    seen[cur] = 1;
    const cx = cur % MAP_W;
    const cy = (cur / MAP_W) | 0;
    for (let d = 0; d < NEIGHBOURS8.length; d++) {
      const [dx, dy] = NEIGHBOURS8[d];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!routable(s, nx, ny)) continue;
      // No squeezing diagonally through a gap between two blocked tiles.
      if (dx !== 0 && dy !== 0 && (!routable(s, cx + dx, cy) || !routable(s, cx, cy + dy))) continue;
      const ni = tileIndex(nx, ny);
      if (seen[ni]) continue;
      const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const turn = dir[cur] >= 0 && dir[cur] !== d ? TURN_COST : 0;
      const ng = g[cur] + step * tileCost(s, nx, ny) + turn;
      if (ng < g[ni]) {
        came[ni] = cur;
        dir[ni] = d as unknown as number;
        g[ni] = ng;
        f[ni] = ng + Math.hypot(nx - tx, ny - ty);
        push(ni);
      }
    }
  }
  if (came[goal] < 0) return null;
  const out: { x: number; y: number }[] = [];
  for (let at = goal; at >= 0; at = came[at]) {
    out.push({ x: at % MAP_W, y: (at / MAP_W) | 0 });
    if (at === start) break;
  }
  return out.reverse();
}

const NEIGHBOURS8: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Tiers laid as a single span across an obstacle rather than painted tile by tile.
 *
 * A bridge or a tunnel is one crossing, not a freehand scribble — the player drags a straight
 * line from one bank or hillside to the other and only the tiles actually over water or inside
 * the rock get planned (`planPath` refuses the rest).
 */
export function isSpanTier(tier: PathTier): boolean {
  return tier === 'bridge' || tier === 'stonebridge' || tier === 'tunnel';
}

/**
 * Tiles on the straight line from (x0,y0) to (x1,y1), snapped to whichever axis the drag has
 * travelled furthest along.
 *
 * Snapping rather than following the pointer exactly: a crossing that wanders diagonally is
 * both harder to aim and more expensive than the player intended, and a bridge should look like
 * something an engineer laid out.
 */
export function spanLine(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const step = dx >= 0 ? 1 : -1;
    for (let x = x0; x !== x1 + step; x += step) out.push({ x, y: y0 });
  } else {
    const step = dy >= 0 ? 1 : -1;
    for (let y = y0; y !== y1 + step; y += step) out.push({ x: x0, y });
  }
  return out;
}

/**
 * Un-plan the given tiles, dropping them from the pending list too.
 *
 * Used while dragging: the whole stroke is re-planned on every pointer move, so the previous
 * frame's route has to be taken back first. Only *planned* tiles are cleared — a tile a villager
 * already finished stays built — and each one goes back to whatever it held before the plan went
 * on it, so re-routing a stone road away from a dirt one does not scrub the dirt.
 *
 * `pendingPaths` and `pendingPrev` are parallel arrays, so they have to be filtered together;
 * dropping an entry from one alone would leave every later tile paired with the wrong history.
 */
export function unplanTiles(s: GameState, indices: number[]): void {
  if (indices.length === 0) return;
  const drop = new Set(indices);
  const pending = s.pendingPaths ?? [];
  const prevs = s.pendingPrev ?? [];
  const prevOf = new Map<number, number>();
  for (let k = 0; k < pending.length; k++) {
    if (drop.has(pending[k])) prevOf.set(pending[k], prevs[k] ?? PATH_NONE);
  }
  for (const idx of indices) {
    const v = s.paths[idx];
    if (isPlannedPath(v)) {
      s.paths[idx] = prevOf.get(idx) ?? PATH_NONE;
    }
  }
  const keptPaths: number[] = [];
  const keptPrev: number[] = [];
  for (let k = 0; k < pending.length; k++) {
    if (drop.has(pending[k])) continue;
    keptPaths.push(pending[k]);
    keptPrev.push(prevs[k] ?? PATH_NONE);
  }
  s.pendingPaths = keptPaths;
  s.pendingPrev = keptPrev;
}

/** Whether any building's footprint covers this tile. */
function tileHasBuilding(s: GameState, tx: number, ty: number): boolean {
  for (const b of s.buildings) {
    if (tx >= b.x && tx < b.x + footprintW(b) && ty >= b.y && ty < b.y + footprintH(b)) return true;
  }
  return false;
}

/** Whether this tile carries a path or bridge — planned or built. */
export function hasPath(s: GameState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  return s.paths[tileIndex(tx, ty)] !== PATH_NONE;
}

/**
 * Clear every path tile under a rectangle, planned or built. Placing a building over a path
 * removes the path rather than leaving it buried: the tile now belongs to the building.
 * Returns how many tiles were cleared.
 */
export function clearPathsUnder(s: GameState, x: number, y: number, w: number, h: number): number {
  let cleared = 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty)) continue;
      const idx = tileIndex(tx, ty);
      if (s.paths[idx] === PATH_NONE) continue;
      // Bridges and tunnels are the only walkable water and mountain tiles, so removing one
      // changes connectivity.
      const wasCrossing =
        s.paths[idx] === PATH_BRIDGE || s.paths[idx] === PATH_BRIDGE_STONE || s.paths[idx] === PATH_TUNNEL;
      s.paths[idx] = PATH_NONE;
      dropPathRaze(s, idx); // a teardown order on this tile is moot now the building took it
      cleared++;
      if (wasCrossing) s.navVersion = (s.navVersion ?? 0) + 1;
    }
  }
  return cleared;
}

/**
 * Mark a single path tile for teardown, or cancel it outright if it was only ever a plan.
 *
 * A standing road is queued (`'razed'`) and keeps carrying villagers until a builder or free
 * laborer reaches it and pulls it up — the same "mark now, work later" a building demolition uses.
 * A plan not yet laid has nothing to tear down, so it is simply un-drawn (`'unplanned'`). Bare
 * ground is `'none'`.
 */
export function markPathRaze(s: GameState, idx: number): 'razed' | 'unplanned' | 'none' {
  const v = s.paths[idx];
  if (v === PATH_NONE) return 'none';
  if (isPlannedPath(v)) {
    // A never-laid order: cancel it on the spot. No work, nothing to salvage.
    s.paths[idx] = PATH_NONE;
    dropPathRaze(s, idx);
    return 'unplanned';
  }
  (s.razePaths ??= []);
  if (!s.razePaths.includes(idx)) s.razePaths.push(idx);
  return 'razed';
}

/** Drop a tile from the raze queue, if present. Called when the teardown is finished or undone. */
export function dropPathRaze(s: GameState, idx: number): void {
  const q = s.razePaths;
  if (!q) return;
  const k = q.indexOf(idx);
  if (k >= 0) q.splice(k, 1);
}

/** How many built path tiles are queued for teardown. */
export function pathRazeCount(s: GameState): number {
  return s.razePaths?.length ?? 0;
}

/** Whether a tile is queued for teardown (for the renderer's warning tint). */
export function isRazing(s: GameState, idx: number): boolean {
  return !!s.razePaths && s.razePaths.includes(idx);
}

/**
 * Mark every path tile in a rectangle for teardown. Returns how many tiles were queued or cancelled.
 *
 * The counterpart to the harvest marquee: taking a road out one tile at a time was tedious enough
 * that players simply left roads they no longer wanted. Nothing is torn up here — a builder or free
 * laborer does the pulling, so a road stays passable until then.
 */
export function demolishPathRect(s: GameState, x0: number, y0: number, x1: number, y1: number): number {
  const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) };
  const hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
  let marked = 0;
  for (let y = lo.y; y <= hi.y; y++) {
    for (let x = lo.x; x <= hi.x; x++) {
      if (!inBounds(x, y)) continue;
      if (markPathRaze(s, tileIndex(x, y)) !== 'none') marked++;
    }
  }
  return marked;
}

/**
 * Whether two adjacent tiles of *built* road (not merely planned) form a real, ridable join
 * rather than two stretches that happen to touch at a bare corner.
 *
 * An orthogonal pair always counts — they share a full edge. A diagonal pair only counts when at
 * least one of the two tiles that would fill the corner between them is *also* built road: the
 * same "don't cut a blocked corner" shape the pathfinder already applies to solid obstacles
 * (`astar`'s corner gate in `pathfind.ts`), turned around to gate the road network's own
 * continuity instead of an obstacle's. Two road tiles at opposite corners of a 2×2 square, with
 * bare ground on the other two, are not one joined road — see `landStepCost`, which is where this
 * stops a diagonal hop between them from earning the ride-the-road speed bonus.
 *
 * Only tiles `dx`/`dy` apart by at most one count as "adjacent" at all; anything further apart is
 * never connected by this check regardless of what lies between.
 */
export function pathsConnected(s: GameState, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax, dy = by - ay;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
  if (pathSpeedMult(s, ax, ay) <= 1 || pathSpeedMult(s, bx, by) <= 1) return false;
  if (dx === 0 || dy === 0) return true; // orthogonal: a shared full edge is always a real join
  // Diagonal: only a real join if a built road fills in one of the two corner-sharing tiles.
  return pathSpeedMult(s, ax + dx, ay) > 1 || pathSpeedMult(s, ax, ay + dy) > 1;
}

/** Movement multiplier from a built path at a world position (1 = bare ground). */
export function pathSpeedMult(s: GameState, x: number, y: number): number {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(tx, ty)) return 1;
  const v = s.paths[tileIndex(tx, ty)];
  if (v === PATH_STONE) return PATH_STONE_MULT;
  if (v === PATH_DIRT) return PATH_DIRT_MULT;
  if (v === PATH_BRIDGE) return PATH_BRIDGE_MULT;
  if (v === PATH_BRIDGE_STONE) return PATH_BRIDGE_STONE_MULT;
  if (v === PATH_TUNNEL) return PATH_TUNNEL_MULT;
  return 1;
}

/** Index of the next planned path tile, or -1 if none remain. */
export function nextPlannedPath(s: GameState): number {
  for (let i = 0; i < s.paths.length; i++) {
    if (s.paths[i] === PATH_DIRT_PLAN || s.paths[i] === PATH_STONE_PLAN) return i;
  }
  return -1;
}
