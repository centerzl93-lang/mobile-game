import { GameState, Building, BuildingType, BUILDING_DEFS } from '../types';
import { getTile, inBounds } from './world';

export interface PlaceResult {
  ok: boolean;
  reason?: string;
}

/** Can a building of `type` be placed with its top-left corner at (x,y)? */
export function canPlace(s: GameState, type: BuildingType, x: number, y: number): PlaceResult {
  const def = BUILDING_DEFS[type];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty)) return { ok: false, reason: 'Off the map' };
      const t = getTile(s.tiles, tx, ty)!;
      if (t.type === 'water') return { ok: false, reason: 'Cannot build on water' };
      if (t.type === 'stone') return { ok: false, reason: 'Cannot build on rock' };
    }
  }
  // No overlap with existing buildings.
  for (const b of s.buildings) {
    const bd = BUILDING_DEFS[b.type];
    if (rectsOverlap(x, y, def.w, def.h, b.x, b.y, bd.w, bd.h)) {
      return { ok: false, reason: 'Overlaps a building' };
    }
  }
  if (s.resources.wood < def.woodCost) {
    return { ok: false, reason: `Need ${def.woodCost} wood` };
  }
  return { ok: true };
}

export function placeBuilding(
  s: GameState,
  type: BuildingType,
  x: number,
  y: number,
): Building | null {
  const check = canPlace(s, type, x, y);
  if (!check.ok) return null;
  const def = BUILDING_DEFS[type];
  s.resources.wood -= def.woodCost;
  const b: Building = {
    id: s.nextId++,
    type,
    x,
    y,
    built: false,
    progress: 0,
    workers: [],
    growth: 0,
  };
  s.buildings.push(b);
  return b;
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Count forest resource in the tiles surrounding a building (for yields). */
export function nearbyForest(s: GameState, b: Building, radius = 4): number {
  const def = BUILDING_DEFS[b.type];
  const cx = Math.floor(b.x + def.w / 2);
  const cy = Math.floor(b.y + def.h / 2);
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const t = getTile(s.tiles, cx + dx, cy + dy);
      if (t && t.type === 'forest') total += t.trees;
    }
  }
  return total;
}
