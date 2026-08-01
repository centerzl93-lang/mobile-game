import {
  GameState,
  PATH_NONE,
  PATH_DIRT,
  PATH_DIRT_PLAN,
  PATH_STONE,
  PATH_STONE_PLAN,
  PATH_BRIDGE,
  PATH_BRIDGE_PLAN,
  PATH_TUNNEL,
  PATH_TUNNEL_PLAN,
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
} from '../types';
import { tileIndex, inBounds, getTile } from './world';
import { totalStored } from './storage';

export type PathTier = 'dirt' | 'stone' | 'bridge' | 'tunnel';

/**
 * Plan a path tile of the given tier. Returns true if a tile was newly planned.
 * Dirt/stone go on land (stone costs stone); bridges go on water (cost wood) so villagers
 * can cross. Tiles cannot be planned over an existing equal-or-better path of that kind,
 * nor under a building — a path is a surface, so nothing may share its tile.
 */
export function planPath(s: GameState, tx: number, ty: number, tier: PathTier): boolean {
  if (!inBounds(tx, ty)) return false;
  const t = getTile(s.tiles, tx, ty)!;
  const idx = tileIndex(tx, ty);
  const cur = s.paths[idx];
  if (tileHasBuilding(s, tx, ty)) return false; // paths don't run underneath buildings
  if (tier === 'bridge') {
    if (t.type !== 'water') return false; // bridges only span water
    if (cur === PATH_BRIDGE || cur === PATH_BRIDGE_PLAN) return false;
    if (totalStored(s, 'wood') < BRIDGE_WOOD_COST) return false;
    s.paths[idx] = PATH_BRIDGE_PLAN;
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
  if (cur !== PATH_NONE) return false;
  s.paths[idx] = PATH_DIRT_PLAN;
  return true;
}

/**
 * Mark a freshly planned tile as awaiting the player's confirmation. Villagers ignore pending
 * tiles (`buildPath`), so a drag can be reviewed and cancelled before it becomes work orders.
 */
export function markPending(s: GameState, tx: number, ty: number): void {
  const idx = tileIndex(tx, ty);
  const pending = (s.pendingPaths ??= []);
  if (!pending.includes(idx)) pending.push(idx);
}

/** How many drawn-but-unconfirmed path tiles are waiting. */
export function pendingPathCount(s: GameState): number {
  return s.pendingPaths?.length ?? 0;
}

/** Accept the drawn tiles: they stay planned, and villagers may now lay them. */
export function confirmPendingPaths(s: GameState): number {
  const n = pendingPathCount(s);
  s.pendingPaths = [];
  return n;
}

/** Discard the drawn tiles, clearing any that are still only planned back to bare ground. */
export function cancelPendingPaths(s: GameState): number {
  const pending = s.pendingPaths ?? [];
  let cleared = 0;
  for (const idx of pending) {
    const v = s.paths[idx];
    // Only un-plan: a tile a villager already finished while this sat pending stays built.
    if (v === PATH_DIRT_PLAN || v === PATH_STONE_PLAN || v === PATH_BRIDGE_PLAN || v === PATH_TUNNEL_PLAN) {
      s.paths[idx] = PATH_NONE;
      cleared++;
    }
  }
  s.pendingPaths = [];
  return cleared;
}

/**
 * Tiers laid as a single span across an obstacle rather than painted tile by tile.
 *
 * A bridge or a tunnel is one crossing, not a freehand scribble — the player drags a straight
 * line from one bank or hillside to the other and only the tiles actually over water or inside
 * the rock get planned (`planPath` refuses the rest).
 */
export function isSpanTier(tier: PathTier): boolean {
  return tier === 'bridge' || tier === 'tunnel';
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
 * Used while dragging a span: the whole line is re-planned on every pointer move, so the
 * previous frame's line has to be taken back first. Only *planned* tiles are cleared — a tile a
 * villager already finished stays built.
 */
export function unplanTiles(s: GameState, indices: number[]): void {
  if (indices.length === 0) return;
  const drop = new Set(indices);
  for (const idx of indices) {
    const v = s.paths[idx];
    if (v === PATH_DIRT_PLAN || v === PATH_STONE_PLAN || v === PATH_BRIDGE_PLAN || v === PATH_TUNNEL_PLAN) {
      s.paths[idx] = PATH_NONE;
    }
  }
  if (s.pendingPaths) s.pendingPaths = s.pendingPaths.filter((i) => !drop.has(i));
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
      const wasCrossing = s.paths[idx] === PATH_BRIDGE || s.paths[idx] === PATH_TUNNEL;
      s.paths[idx] = PATH_NONE;
      cleared++;
      if (wasCrossing) s.navVersion = (s.navVersion ?? 0) + 1;
    }
  }
  return cleared;
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
