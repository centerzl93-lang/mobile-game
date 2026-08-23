import { BUILDING_TIER, TIER_META, buildingUnlocked } from './tiers';
import {
  GameState,
  Building,
  BuildingType,
  BUILDING_DEFS,
  costOf,
  buildCost,
  ResourceKind,
  TileType,
  REFUND_FRACTION,
  CANCEL_REFUND_FRACTION,
  workRadiusOf,
  workCentre,
  footprintW,
  footprintH,
  ranchCapacity,
  SIZABLE,
  HARVEST_WOOD,
  HARVEST_STONE,
  HARVEST_IRON,
  isWorkplace,
  nextBuildingName,
  entranceAt,
  entrancesAt,
  entranceTile,
  entranceTiles,
  hasDoor,
} from '../types';
import { getTile, inBounds, tileIndex } from './world';
import { isWalkable } from './pathfind';
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
export function canPlace(
  s: GameState,
  type: BuildingType,
  x: number,
  y: number,
  w?: number,
  h?: number,
  rot: number = 0,
  opts: { ignoreTier?: boolean } = {},
): PlaceResult {
  const def = BUILDING_DEFS[type];
  // Progression first, because it is the answer that has nothing to do with the ground: a village
  // that has not earned a building cannot put one anywhere. `ignoreTier` is for the debug hooks,
  // which mean "place this regardless of how far along the village is".
  if (!opts.ignoreTier && !buildingUnlocked(s, type)) {
    return { ok: false, reason: `Unlocks at ${TIER_META[BUILDING_TIER[type]].name}` };
  }
  const baseW = w ?? def.w;
  const baseH = h ?? def.h;
  // A quarter turn swaps the footprint, so everything below works in map space.
  const fw = rot % 2 === 1 ? baseH : baseW;
  const fh = rot % 2 === 1 ? baseW : baseH;
  // The two ways a building is allowed to stand in water: a wharf that just needs enough of its
  // footprint wet, or a jetty that has to reach out over the water from a specific end.
  const allowsWater = def.requiresWaterFraction !== undefined || def.dockDepth !== undefined;
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
  // A jetty has to reach *out* over the water: the far rows (away from the door) must be wet and
  // the near ones dry. Counting water anywhere under the footprint, the way
  // `requiresWaterFraction` does, happily allows a dock built along a bank with its landing high
  // and dry and the water off to one side.
  if (def.dockDepth) {
    const turn = ((rot % 4) + 4) % 4;
    let wet = 0;
    let dry = 0;
    for (let dy = 0; dy < fh; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        // Distance from the far end, measured along whichever axis the building has been turned to.
        const depth = turn === 1 ? fw - 1 - dx : turn === 2 ? fh - 1 - dy : turn === 3 ? dx : dy;
        const t = getTile(s.tiles, x + dx, y + dy)!;
        if (depth < def.dockDepth) {
          if (t.type === 'water') wet++;
        } else if (t.type !== 'water') dry++;
      }
    }
    const dockTiles = def.dockDepth * (turn % 2 === 1 ? fh : fw);
    if (wet < Math.ceil(dockTiles * 0.6)) {
      return { ok: false, reason: 'Its jetty must reach out over the water — turn it toward the shore' };
    }
    if (dry === 0) return { ok: false, reason: 'It must also stand on the bank' };
  }
  // Docks: enough of the footprint over water, and the rest anchored on land.
  if (def.requiresWaterFraction !== undefined) {
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
  // Back-half gating: the rows at the far end (away from the door) must sit on a required terrain.
  // A mine is dug *into* the slope — its working face buried in the foothills, its mouth open to the
  // carts — so a single clipped corner is not enough; the whole back of it has to be in the rock.
  if (def.requiresBackHalf) {
    const turn = ((rot % 4) + 4) % 4;
    const span = turn % 2 === 1 ? fw : fh; // tiles deep along the door axis
    const backRows = Math.floor(span / 2);
    let back = 0;
    let onIt = 0;
    for (let dy = 0; dy < fh; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        // Distance from the far end (0 = backmost row) — the dock's measure, reused.
        const depth = turn === 1 ? fw - 1 - dx : turn === 2 ? fh - 1 - dy : turn === 3 ? dx : dy;
        if (depth >= backRows) continue;
        back++;
        if (getTile(s.tiles, x + dx, y + dy)!.type === def.requiresBackHalf) onIt++;
      }
    }
    if (back === 0 || onIt < back) {
      const foot = def.requiresBackHalf === 'foothill';
      return {
        ok: false,
        reason: foot
          ? "Its back must be cut into a mountain's foothills — back it against the slope"
          : 'Its back must sit on the right ground',
      };
    }
  }
  // Doors, both ways. Villagers walk around a finished building and in through its door, so a
  // door opening onto water, rock or another building's wall is a building nobody can reach —
  // and a site dropped across someone else's door strands them just as surely. Turning the
  // building is the fix for both, which is what the rotate control is for.
  if (hasDoor(type)) {
    // One way in is enough. A barn has a door at each end, and being backed onto a cliff at one
    // of them is fine so long as the other opens onto ground somebody can stand on.
    const doors = entrancesAt(x, y, fw, fh, rot, type);
    if (!doors.some((d) => isWalkable(s, d.x, d.y))) {
      return { ok: false, reason: 'Its door would be blocked — turn it to face open ground' };
    }
  }
  for (const b of s.buildings) {
    if (!hasDoor(b.type)) continue;
    // Same rule from the other side, and it protects *every* door, not just the last one left.
    //
    // Letting a site take one of a barn's two doors so long as the other was `isWalkable` looked
    // generous and killed villages: walkable is not the same as *reachable*. A barn backed against
    // its own buildings had a spare door standing on perfectly good grass that nothing could path
    // to, the one usable door got built over, and the village then starved and froze solid beside
    // a full barn nobody could get into. Two doors are two tiles that stay clear.
    const covers = (e: { x: number; y: number }): boolean =>
      e.x >= x && e.x < x + fw && e.y >= y && e.y < y + fh;
    if (entranceTiles(b).some(covers)) {
      return { ok: false, reason: `Would block the ${BUILDING_DEFS[b.type].name}'s door` };
    }
  }
  // Materials must exist in storage (consumed later, on delivery — not now). Priced at the size
  // actually being dragged out, so an 8x8 field is checked against an 8x8 field's bill.
  for (const [kind, amount] of Object.entries(buildCost(type, fw, fh)) as [ResourceKind, number][]) {
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
  rot: 0 | 1 | 2 | 3 = 0,
  opts: { ignoreTier?: boolean } = {},
): Building | null {
  const check = canPlace(s, type, x, y, w, h, rot, opts);
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
    // A blacksmith opens on iron, a tailor on leather — the input each can get without a
    // dedicated pen behind it. One field, two meanings; see `Building.recipe`.
    recipe: type === 'tailor' ? 'leather' : 'iron',
    replant: type === 'lumberyard', // new Foresters replant by default
    crop: s.seeds[0], // default to a crop the village can plant (undefined if it owns no seeds)
    animal: 'cattle',
    store: {},
  };
  if (rot) b.rot = rot; // left undefined when unturned, so saves and signatures stay quiet
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
      else if ((t.iron ?? 0) > 0) s.harvest[tileIndex(tx, ty)] = HARVEST_IRON;
    }
  }
}

/**
 * True once a building's footprint is free of trees and surface deposits. Construction is gated on
 * this — resources under the site are hand-harvested first (see `markFootprintHarvest`).
 */
export function footprintClear(s: GameState, b: Building): boolean {
  const left = footprintToClear(s, b);
  return left.trees + left.stone + left.iron === 0;
}

/**
 * Tiles under a site still holding something that has to come off before building can start,
 * counted by what is on them.
 *
 * A site can sit at 0% for a long time while the village hand-clears a wood off it, and from the
 * outside that is indistinguishable from a site nobody has been assigned to. The inspect sheet
 * shows these counts so "why is nothing happening here" has an answer on the sheet itself.
 *
 * Counted in *tiles*, not in resource units: a tile is one trip for whoever clears it, which is
 * the number that tells the player how much work is left.
 */
export function footprintToClear(s: GameState, b: Building): { trees: number; stone: number; iron: number } {
  const fw = footprintW(b);
  const fh = footprintH(b);
  const out = { trees: 0, stone: 0, iron: 0 };
  for (let dy = 0; dy < fh; dy++) {
    for (let dx = 0; dx < fw; dx++) {
      const t = getTile(s.tiles, b.x + dx, b.y + dy);
      if (!t) continue;
      if (t.type === 'forest' && t.trees > 0.05) out.trees++;
      if ((t.stone ?? 0) > 0) out.stone++;
      if ((t.iron ?? 0) > 0) out.iron++;
    }
  }
  return out;
}

/** True if storage holds the materials to start this building. */
export function canAfford(s: GameState, type: BuildingType, w?: number, h?: number): boolean {
  for (const [kind, amount] of Object.entries(buildCost(type, w, h)) as [ResourceKind, number][]) {
    if (totalStored(s, kind) < amount) return false;
  }
  return true;
}

/**
 * Can this building be pulled down at all?
 *
 * Only one rule: the village may not demolish its last barn. Everything a village owns lives in a
 * barn, and taking the final one away has no sane outcome — the goods have nowhere to be carted
 * to, the salvage from the barn itself included, so the demolition could never finish. A second
 * barn standing (and not itself marked) is enough.
 */
export function canDemolish(s: GameState, b: Building): boolean {
  if (b.type !== 'barn') return true;
  return s.buildings.some((o) => o !== b && o.type === 'barn' && o.built && !o.demolish);
}

/**
 * Mark a building for demolition. Builders do the actual work — see `runBuilder`.
 *
 * A construction site is the exception: there is no structure to tear down, so cancelling one
 * takes it away at once and returns most of what has already been delivered to it (see
 * `cancelConstruction`). Returns false when the building may not be demolished at all.
 */
export function markDemolish(s: GameState, b: Building, upgradeTo?: BuildingType): boolean {
  if (!canDemolish(s, b)) return false;
  if (!b.built) {
    if (b.razed) return false; // already rubble; the haulers are on their way
    cancelConstruction(s, b);
    return true;
  }
  b.demolish = true;
  b.demoProgress = b.demoProgress ?? 0;
  if (upgradeTo) b.upgradeTo = upgradeTo;
  return true;
}

/** Call the whole thing off, so long as the walls are still standing. */
export function cancelDemolish(b: Building): void {
  if (b.razed) return; // too late — there is nothing left to save
  b.demolish = false;
  b.demoProgress = 0;
  b.upgradeTo = undefined;
}

/**
 * The structure comes down. What is salvaged off it — `REFUND_FRACTION` of the build cost — is
 * added to whatever it was already holding, and the lot is left in place as a rubble pile for
 * builders to cart to a barn. Nothing teleports: a demolished barn's grain has to be carried out
 * of it by hand, same as the timber off its own roof.
 *
 * Workers and residents are turned out here rather than at marking, so a building keeps doing its
 * job right up to the moment it stops existing.
 */
export function razeBuilding(s: GameState, b: Building): void {
  // A building razed mid-repair (either the fire that damaged it destroyed a neighbour's rebuild
  // attempt, or the player just demolished a damaged building instead of fixing it) has whatever
  // its builders already delivered sitting in `repairStore` — fold that into the rubble pile too,
  // rather than letting it quietly vanish.
  if (b.repairStore) {
    for (const [kind, amount] of Object.entries(b.repairStore) as [ResourceKind, number][]) {
      if (amount > 0) b.store[kind] = (b.store[kind] ?? 0) + amount;
    }
    b.repairStore = {};
  }
  b.damaged = false;
  b.repairProgress = 0;
  for (const [kind, amount] of Object.entries(costOf(b)) as [ResourceKind, number][]) {
    const refund = Math.floor(amount * REFUND_FRACTION);
    if (refund > 0) b.store[kind] = (b.store[kind] ?? 0) + refund;
  }
  b.built = false;
  b.razed = true;
  b.demolish = true;
  b.demoProgress = 0;
  // The village still wants those hands in that trade — it has just lost the place to put them.
  // Handing the count back to the overflow keeps the ask alive for the next building of the type,
  // rather than silently shrinking the village's plans every time something is pulled down.
  if (b.desiredWorkers > 0) {
    const extras = (s.tradeExtra ??= {});
    extras[b.type] = (extras[b.type] ?? 0) + b.desiredWorkers;
    b.desiredWorkers = 0;
  }
  b.workers = [];
  for (const c of s.citizens) {
    if (c.jobId === b.id) c.jobId = null;
    if (c.homeId === b.id) c.homeId = null;
  }
  s.navVersion = (s.navVersion ?? 0) + 1; // its walls are gone; routes through it open up
  if (rubbleEmpty(b)) clearRubble(s, b); // nothing worth carrying — the plot is free already
}

/** Is there anything left in the rubble worth a trip to the barn? */
export function rubbleEmpty(b: Building): boolean {
  for (const k in b.store) if ((b.store[k as ResourceKind] ?? 0) > 0.01) return false;
  return true;
}

/**
 * The last of the salvage has gone. Either the plot goes back to open ground, or — when this was
 * an upgrade — the same plot becomes the construction site for what replaces it, so the new
 * building lands exactly where the old one stood without the player having to re-site it.
 */
export function clearRubble(s: GameState, b: Building): void {
  if (b.upgradeTo) {
    b.type = b.upgradeTo;
    b.upgradeTo = undefined;
    b.razed = false;
    b.demolish = false;
    b.demoProgress = 0;
    b.built = false;
    b.progress = 0;
    b.store = {};
    b.desiredWorkers = 0;
    s.navVersion = (s.navVersion ?? 0) + 1;
    return;
  }
  const idx = s.buildings.indexOf(b);
  if (idx >= 0) s.buildings.splice(idx, 1);
  s.navVersion = (s.navVersion ?? 0) + 1;
}

/**
 * Cancel an unfinished construction site outright, returning `CANCEL_REFUND_FRACTION` of the
 * materials *already delivered* to it (rounded down) to the nearest storage. The rest is wastage.
 *
 * A site is not a structure: there are no walls to pull down over time, so — unlike a finished
 * building's demolition, which builders carry out — this takes the site away on the spot. The
 * refund is metered against what actually reached the site's store, never the full recipe, because
 * only the delivered materials existed to lose. Any builder still hauling toward the site or
 * standing on it simply finds no site next tick: `pickSite`/`nearestUnbuiltNeeding` stop offering
 * it, so a carried load returns to a barn and the crew re-picks — the tasks cancel themselves once
 * the site is gone. Pre-assigned staff and the plot's reachability are settled here.
 *
 * Only valid for a site that is still an open plot (`!built && !razed`).
 */
export function cancelConstruction(s: GameState, b: Building): void {
  const at = { x: b.x + footprintW(b) / 2, y: b.y + footprintH(b) / 2 };
  const idx = s.buildings.indexOf(b);
  if (idx >= 0) s.buildings.splice(idx, 1); // remove first so its own space isn't a target
  // Return most of what was delivered; the 10% not refunded is the wastage of undoing the work.
  for (const k in b.store) {
    const kind = k as ResourceKind;
    const delivered = b.store[kind] ?? 0;
    const refund = Math.floor(delivered * CANCEL_REFUND_FRACTION);
    if (refund > 0) addNearest(s, at, kind, refund);
  }
  // Release any hands tied to the site. A plot has no residents and its builders are global rather
  // than posted here, but a pre-staffed workplace carries a standing order — hand it back to the
  // trade overflow (as `razeBuilding` does) so cancelling the site does not silently shrink the
  // village's plans for that trade.
  if (b.desiredWorkers > 0) {
    const extras = (s.tradeExtra ??= {});
    extras[b.type] = (extras[b.type] ?? 0) + b.desiredWorkers;
    b.desiredWorkers = 0;
  }
  for (const c of s.citizens) {
    if (c.jobId === b.id) c.jobId = null;
    if (c.homeId === b.id) c.homeId = null;
  }
  s.navVersion = (s.navVersion ?? 0) + 1; // builders walked over the plot; routing is unchanged, but keep labels fresh
}

/**
 * Remove a building, returning REFUND_FRACTION of its build cost (rounded down) to
 * storage. A barn's own contents are spilled into the remaining barns first.
 *
 * This is the *instant* removal for a building lost to something other than a demolition order
 * (nothing is standing to be torn down over time). A player cancelling a construction site goes
 * through `cancelConstruction`; a player-ordered demolition of a finished building goes through
 * `markDemolish` and is carried out by builders.
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
  for (const [kind, amount] of Object.entries(costOf(b)) as [ResourceKind, number][]) {
    const refund = Math.floor(amount * REFUND_FRACTION);
    if (refund > 0) addNearest(s, at, kind, refund);
  }
  for (const c of s.citizens) {
    if (c.jobId === b.id) c.jobId = null;
    if (c.homeId === b.id) c.homeId = null;
  }
  s.navVersion = (s.navVersion ?? 0) + 1; // its walls are gone; routes through it open up
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
  // `workCentre` is the footprint centre for everything except a dock, whose circle slides out
  // over the water — see the note there.
  const c = workCentre(b);
  return { cx: c.x, cy: c.y };
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

/**
 * Count of rock tiles surrounding a footprint (drives quarry/mine yields).
 *
 * `radius` is measured out from the footprint's **edge**, not from its centre. It used to be a
 * fixed box around the centre, which was the same thing while every workplace was 2x2 — but an
 * 8x8 quarry's centre is four tiles from its own wall, so a centre-anchored radius of 4 scanned
 * nothing but the pit itself. No tile under a building can be rock (`canPlace` refuses it), so
 * that would have read zero rock everywhere: the mountainside bonus unreachable, and the mine —
 * which multiplies its yield by this — pinned at its floor no matter where it was dug.
 */
export function nearbyStone(
  s: GameState,
  def: { w: number; h: number },
  x: number,
  y: number,
  radius = 4,
): number {
  let total = 0;
  for (let ty = y - radius; ty < y + def.h + radius; ty++) {
    for (let tx = x - radius; tx < x + def.w + radius; tx++) {
      const t = getTile(s.tiles, tx, ty);
      if (t && t.type === 'stone') total += 1;
    }
  }
  return total;
}
