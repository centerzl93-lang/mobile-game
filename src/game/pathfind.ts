import { GameState, MAP_W, MAP_H, PATH_BRIDGE, PATH_TUNNEL } from '../types';
import { tileIndex, inBounds } from './world';

/**
 * A tile can be walked if it is on the map and passable. Water and mountains (`stone`) block
 * movement on their own: water is crossed only over a built bridge, mountain only through a
 * driven tunnel. Foothills, grass and forest are walkable.
 */
export function isWalkable(s: GameState, tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  const idx = tileIndex(tx, ty);
  const type = s.tiles[idx].type;
  if (type === 'stone') return s.paths[idx] === PATH_TUNNEL;
  if (type !== 'water') return true;
  return s.paths[idx] === PATH_BRIDGE;
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
 * A* from tile (fx,fy) to tile (tx,ty) over walkable tiles. Returns a list of tile-centre
 * waypoints (including the destination centre) or null if no route exists. The start tile is
 * not included. If the destination itself is unwalkable, there is no path.
 */
export function findPath(s: GameState, fx: number, fy: number, tx: number, ty: number): Point[] | null {
  fx |= 0; fy |= 0; tx |= 0; ty |= 0;
  if (!inBounds(fx, fy) || !isWalkable(s, tx, ty)) return null;
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
  fscore[start] = octile(fx, fy, tx, ty);
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
      if (!isWalkable(s, nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        // Don't squeeze diagonally past a blocked orthogonal corner (e.g. round water).
        if (!isWalkable(s, cx + dx, cy) || !isWalkable(s, cx, cy + dy)) continue;
      }
      const ni = tileIndex(nx, ny);
      if (seen[ni]) continue;
      const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const ng = g[cur] + step;
      if (ng < g[ni]) {
        came[ni] = cur;
        g[ni] = ng;
        fscore[ni] = ng + octile(nx, ny, tx, ty);
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
