import {
  GameState,
  Building,
  BuildingType,
  BUILDING_DEFS,
  ResourceKind,
  TileType,
  REFUND_FRACTION,
  workRadiusOf,
  footprintW,
  footprintH,
  ranchCapacity,
  SIZABLE,
  HARVEST_WOOD,
  HARVEST_STONE,
  isWorkplace,
  nextBuildingName,
} from '../types';
import { getTile, inBounds, tileIndex } from './world';
import { totalStored, addNearest } from './storage';
import { clearPathsUnder } from './paths';

export interface PlaceResult {
  ok: boolean;
  reason?: string;
}

/**
 * Can a building of `type` be placed with its top-left corner at (x,y)? `w`/`h` override the
 * def footprint (used for the player-sized ranch); they default to the def size.
 */
export function canPlace(s: GameState, type: BuildingType, x: number, y: number, w?: number, h?: number): PlaceResult {
  const def = BUILDING_DEFS[type];
  const fw = w ?? def.w;
  const fh = h ?? def.h;
  const allowsWater = def.requiresWaterFraction !== undefined; // a dock may sit partly on water
  let waterTiles = 0;
  let landTiles = 0;
  for (let dy = 0; dy < fh; dy++) {
    for (let dx = 0; dx < fw; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(tx, ty)) return { ok: false, reason: 'Off the map' };
      const t = getTile(s.tiles, tx, ty)!;
      if (t.type === 'stone') return { ok: false, reason: 'Cannot build on rock' };
      if (t.type === 'water') {
        if (!allowsWater) return { ok: false, reason: 'Cannot build on water' };
        waterTiles++;
      } else {
        landTiles++;
      }
    }
  }
  // Docks: enough of the footprint over water, and the rest anchored on land.
  if (allowsWater) {
    const need = Math.ceil(fw * fh * def.requiresWaterFraction!);
    if (waterTiles < need) return { ok: false, reason: 'Part of it must reach over the water' };
    if (landTiles === 0) return { ok: false, reason: 'It must also touch the shore' };
  }
  // No overlap with existing buildings.
  for (const b of s.buildings) {
    if (rectsOverlap(x, y, fw, fh, b.x, b.y, footprintW(b), footprintH(b))) {
      return { ok: false, reason: 'Overlaps a building' };
    }
  }
  // Terrain gating: at least one border tile of a required type.
  if (def.requiresAdjacent && !borderHasType(s, { w: fw, h: fh }, x, y, def.requiresAdjacent)) {
    const label = def.requiresAdjacent.includes('water') ? 'water' : 'rock';
    return { ok: false, reason: `Must be built next to ${label}` };
  }
  // Footprint gating: at least one tile under the building must be an allowed type
  // (mines must touch a foothill, i.e. sit right at a mountain's base).
  if (def.requiresTileAny) {
    let has = false;
    for (let dy = 0; dy < fh && !has; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        const t = getTile(s.tiles, x + dx, y + dy)!;
        if (def.requiresTileAny.includes(t.type)) { has = true; break; }
      }
    }
    if (!has) {
      const foot = def.requiresTileAny.includes('foothill');
      return { ok: false, reason: foot ? "Must be placed in a mountain's foothills" : 'Wrong ground here' };
    }
  }
  // Materials must exist in storage (consumed later, on delivery — not now).
  for (const [kind, amount] of Object.entries(def.cost) as [ResourceKind, number][]) {
    if (totalStored(s, kind) < amount) {
      return { ok: false, reason: `Need ${amount} ${kind} in storage` };
    }
  }
  return { ok: true };
}

export function placeBuilding(
  s: GameState,
  type: BuildingType,
  x: number,
  y: number,
  w?: number,
  h?: number,
): Building | null {
  const check = canPlace(s, type, x, y, w, h);
  if (!check.ok) return null;
  // No deduction — builders haul the materials to the site during construction.
  const b: Building = {
    id: s.nextId++,
    type,
    x,
    y,
    built: false,
    progress: 0,
    workers: [],
    desiredWorkers: 0, // start unstaffed — the player assigns workers with the stepper
    growth: 0,
    output: 'coal',
    recipe: 'iron',
    replant: type === 'lumberyard', // new Foresters replant by default
    crop: s.seeds[0], // default to a crop the village can plant (undefined if it owns no seeds)
    animal: 'cattle',
    store: {},
  };
  // Workplaces get a numbered name so the job board and inspect sheet can tell them apart.
  if (isWorkplace(type)) b.name = nextBuildingName(s.buildings, type);
  // Player-sizable buildings (ranch, field) carry their chosen footprint.
  if (SIZABLE[type]) {
    b.w = w ?? BUILDING_DEFS[type].w;
    b.h = h ?? BUILDING_DEFS[type].h;
  }
  // A ranch also tracks its own herd.
  if (type === 'ranch') {
    b.animals = 0;
    b.maxAnimals = ranchCapacity(b);
    b.breedProgress = 0;
  }
  s.buildings.push(b);
  // Trees or loose stone sitting under the footprint must be cleared before builders can raise
  // the building — mark them so the workforce (laborers / builders) hand-harvests them first.
  markFootprintHarvest(s, b);
  // A path under the footprint is torn up: the tile belongs to the building now. (Planning a path
  // over an existing building is refused outright — see `planPath`.)
  clearPathsUnder(s, b.x, b.y, footprintW(b), footprintH(b));
  return b;
}

/** Mark any trees / loose stone under a building's footprint for harvesting. */
function markFootprintHarvest(s: GameState, b: Building): void {
  const fw = footprintW(b);
  const fh = footprintH(b);
  for (let dy = 0; dy < fh; dy++) {
    for (let dx = 0; dx < fw; dx++) {
      const tx = b.x + dx;
      const ty = b.y + dy;
      const t = getTile(s.tiles, tx, ty);
      if (!t) continue;
      if (t.type === 'forest' && t.trees > 0.05) s.harvest[tileIndex(tx, ty)] = HARVEST_WOOD;
      else if ((t.stone ?? 0) > 0) s.harvest[tileIndex(tx, ty)] = HARVEST_STONE;
    }
  }
}

/**
 * True once a building's footprint is free of trees and loose stone. Construction is gated on
 * this — resources under the site are hand-harvested first (see `markFootprintHarvest`).
 */
export function footprintClear(s: GameState, b: Building): boolean {
  const fw = footprintW(b);
  const fh = footprintH(b);
  for (let dy = 0; dy < fh; dy++) {
    for (let dx = 0; dx < fw; dx++) {
      const t = getTile(s.tiles, b.x + dx, b.y + dy);
      if (!t) continue;
      if (t.type === 'forest' && t.trees > 0.05) return false;
      if ((t.stone ?? 0) > 0) return false;
    }
  }
  return true;
}

/** True if storage holds the materials to start this building. */
export function canAfford(s: GameState, type: BuildingType): boolean {
  const def = BUILDING_DEFS[type];
  for (const [kind, amount] of Object.entries(def.cost) as [ResourceKind, number][]) {
    if (totalStored(s, kind) < amount) return false;
  }
  return true;
}

/**
 * Remove a building, returning REFUND_FRACTION of its build cost (rounded down) to
 * storage. A barn's own contents are spilled into the remaining barns first.
 */
export function demolishBuilding(s: GameState, b: Building): void {
  const def = BUILDING_DEFS[b.type];
  const at = { x: b.x + footprintW(b) / 2, y: b.y + footprintH(b) / 2 };
  const idx = s.buildings.indexOf(b);
  if (idx >= 0) s.buildings.splice(idx, 1); // remove first so its own space isn't a target
  for (const k in b.store) {
    const kind = k as ResourceKind;
    const amt = b.store[kind] ?? 0;
    if (amt > 0) addNearest(s, at, kind, amt);
  }
  for (const [kind, amount] of Object.entries(def.cost) as [ResourceKind, number][]) {
    const refund = Math.floor(amount * REFUND_FRACTION);
    if (refund > 0) addNearest(s, at, kind, refund);
  }
  for (const c of s.citizens) {
    if (c.jobId === b.id) c.jobId = null;
    if (c.homeId === b.id) c.homeId = null;
  }
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
  return { cx: b.x + footprintW(b) / 2, cy: b.y + footprintH(b) / 2 };
}

/** Sum of forest tree-resource within a building's circular work radius. */
export function forestInCircle(s: GameState, b: Building): number {
  const r = workRadiusOf(b) ?? 4;
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

/** Count of water tiles within a building's circular work radius (drives fishing-hut yield). */
export function nearbyWater(s: GameState, b: Building, radius = 3): number {
  const { cx, cy } = buildingCenterTile(b);
  let total = 0;
  const r2 = radius * radius;
  for (let ty = Math.floor(cy - radius); ty <= Math.ceil(cy + radius); ty++) {
    for (let tx = Math.floor(cx - radius); tx <= Math.ceil(cx + radius); tx++) {
      const ddx = tx + 0.5 - cx;
      const ddy = ty + 0.5 - cy;
      if (ddx * ddx + ddy * ddy > r2) continue;
      const t = getTile(s.tiles, tx, ty);
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
