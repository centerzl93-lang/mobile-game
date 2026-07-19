import {
  GameState,
  PATH_NONE,
  PATH_DIRT,
  PATH_DIRT_PLAN,
  PATH_STONE,
  PATH_STONE_PLAN,
  PATH_BRIDGE,
  PATH_BRIDGE_PLAN,
  PATH_DIRT_MULT,
  PATH_STONE_MULT,
  PATH_BRIDGE_MULT,
  STONE_PATH_COST,
  BRIDGE_WOOD_COST,
} from '../types';
import { tileIndex, inBounds, getTile } from './world';
import { totalStored } from './storage';

export type PathTier = 'dirt' | 'stone' | 'bridge';

/**
 * Plan a path tile of the given tier. Returns true if a tile was newly planned.
 * Dirt/stone go on land (stone costs stone); bridges go on water (cost wood) so villagers
 * can cross. Tiles cannot be planned over an existing equal-or-better path of that kind.
 */
export function planPath(s: GameState, tx: number, ty: number, tier: PathTier): boolean {
  if (!inBounds(tx, ty)) return false;
  const t = getTile(s.tiles, tx, ty)!;
  const idx = tileIndex(tx, ty);
  const cur = s.paths[idx];
  if (tier === 'bridge') {
    if (t.type !== 'water') return false; // bridges only span water
    if (cur === PATH_BRIDGE || cur === PATH_BRIDGE_PLAN) return false;
    if (totalStored(s, 'wood') < BRIDGE_WOOD_COST) return false;
    s.paths[idx] = PATH_BRIDGE_PLAN;
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

/** Movement multiplier from a built path at a world position (1 = bare ground). */
export function pathSpeedMult(s: GameState, x: number, y: number): number {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(tx, ty)) return 1;
  const v = s.paths[tileIndex(tx, ty)];
  if (v === PATH_STONE) return PATH_STONE_MULT;
  if (v === PATH_DIRT) return PATH_DIRT_MULT;
  if (v === PATH_BRIDGE) return PATH_BRIDGE_MULT;
  return 1;
}

/** Index of the next planned path tile, or -1 if none remain. */
export function nextPlannedPath(s: GameState): number {
  for (let i = 0; i < s.paths.length; i++) {
    if (s.paths[i] === PATH_DIRT_PLAN || s.paths[i] === PATH_STONE_PLAN) return i;
  }
  return -1;
}
