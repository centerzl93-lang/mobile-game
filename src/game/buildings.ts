import { GameState, Building, BuildingType, BUILDING_DEFS, ResourceKind } from '../types';
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
  // Quarries and mines must sit next to rock to have anything to dig.
  if ((type === 'quarry' || type === 'mine') && nearbyStone(s, def, x, y) < 1) {
    return { ok: false, reason: 'Must be built next to rock' };
  }
  // Enough of every resource in the cost.
  for (const [kind, amount] of Object.entries(def.cost) as [ResourceKind, number][]) {
    if (s.resources[kind] < amount) {
      return { ok: false, reason: `Need ${amount} ${kind}` };
    }
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
  for (const [kind, amount] of Object.entries(def.cost) as [ResourceKind, number][]) {
    s.resources[kind] -= amount;
  }
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

/** True if the stockpile can afford to place this building right now. */
export function canAfford(s: GameState, type: BuildingType): boolean {
  const def = BUILDING_DEFS[type];
  for (const [kind, amount] of Object.entries(def.cost) as [ResourceKind, number][]) {
    if (s.resources[kind] < amount) return false;
  }
  return true;
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

function centerTile(x: number, y: number, w: number, h: number): { cx: number; cy: number } {
  return { cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
}

/** Total forest-resource in tiles surrounding a building (drives wood/food yields). */
export function nearbyForest(s: GameState, b: Building, radius = 4): number {
  const def = BUILDING_DEFS[b.type];
  const { cx, cy } = centerTile(b.x, b.y, def.w, def.h);
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const t = getTile(s.tiles, cx + dx, cy + dy);
      if (t && t.type === 'forest') total += t.trees;
    }
  }
  return total;
}

/** Count of rock tiles surrounding a footprint (drives quarry/mine yields). */
export function nearbyStone(
  s: GameState,
  def: { w: number; h: number },
  x: number,
  y: number,
  radius = 4,
): number {
  const { cx, cy } = centerTile(x, y, def.w, def.h);
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const t = getTile(s.tiles, cx + dx, cy + dy);
      if (t && t.type === 'stone') total += 1;
    }
  }
  return total;
}
