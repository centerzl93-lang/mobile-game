import {
  GameState,
  Building,
  BuildingType,
  BuildingDef,
  BUILDING_DEFS,
  ResourceKind,
  TileType,
} from '../types';
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
  // Terrain gating: at least one border tile of a required type.
  if (def.requiresAdjacent && !borderHasType(s, def, x, y, def.requiresAdjacent)) {
    const label = def.requiresAdjacent.includes('water') ? 'water' : 'rock';
    return { ok: false, reason: `Must be built next to ${label}` };
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
    desiredWorkers: def.jobs, // fully staffed by default; player can dial down
    growth: 0,
    output: 'coal',
    recipe: 'iron',
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
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Do any tiles just outside the footprint match one of the given types? */
function borderHasType(
  s: GameState,
  def: { w: number; h: number },
  x: number,
  y: number,
  types: TileType[],
): boolean {
  for (let dx = -1; dx <= def.w; dx++) {
    for (let dy = -1; dy <= def.h; dy++) {
      const inside = dx >= 0 && dx < def.w && dy >= 0 && dy < def.h;
      if (inside) continue;
      const t = getTile(s.tiles, x + dx, y + dy);
      if (t && types.includes(t.type)) return true;
    }
  }
  return false;
}

export function buildingCenterTile(b: Building): { cx: number; cy: number } {
  const def = BUILDING_DEFS[b.type];
  return { cx: b.x + def.w / 2, cy: b.y + def.h / 2 };
}

/** Sum of forest tree-resource within a building's circular work radius. */
export function forestInCircle(s: GameState, b: Building): number {
  const def = BUILDING_DEFS[b.type];
  const r = def.workRadius ?? 4;
  const { cx, cy } = buildingCenterTile(b);
  let total = 0;
  const r2 = r * r;
  for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r); ty++) {
    for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
      const ddx = tx + 0.5 - cx;
      const ddy = ty + 0.5 - cy;
      if (ddx * ddx + ddy * ddy > r2) continue;
      const t = getTile(s.tiles, tx, ty);
      if (t && t.type === 'forest') total += t.trees;
    }
  }
  return total;
}

/** Count of water tiles adjacent to a fishing hut / trading post footprint. */
export function nearbyWater(s: GameState, b: Building, radius = 3): number {
  const { cx, cy } = buildingCenterTile(b);
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const t = getTile(s.tiles, Math.floor(cx) + dx, Math.floor(cy) + dy);
      if (t && t.type === 'water') total += 1;
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
  const cx = Math.floor(x + def.w / 2);
  const cy = Math.floor(y + def.h / 2);
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const t = getTile(s.tiles, cx + dx, cy + dy);
      if (t && t.type === 'stone') total += 1;
    }
  }
  return total;
}
