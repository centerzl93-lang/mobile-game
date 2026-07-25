import {
  GameState,
  Building,
  Citizen,
  ResourceKind,
  BUILDING_DEFS,
  buildTimeOf,
  workRadiusOf,
  MAP_W,
  MAP_H,
  SEASON_LENGTH,
  SEASONS,
  Season,
  BASE_WALK_SPEED,
  CARRY_CAP,
  WORK_SECONDS,
  LEISURE_CHANCE_PER_SEC,
  LEISURE_MIN_SECONDS,
  LEISURE_MAX_SECONDS,
  PATH_DIRT_PLAN,
  PATH_STONE_PLAN,
  PATH_DIRT,
  PATH_STONE,
  PATH_BRIDGE,
  PATH_BRIDGE_PLAN,
  BRIDGE_WOOD_COST,
  HARVEST_NONE,
  HARVEST_WOOD,
  HARVEST_STONE,
  HARVEST_WOOD_PER_TREE,
  FOOD_PER_CITIZEN_PER_SEASON,
  HEAT_PER_CITIZEN_WINTER,
  FIREWOOD_HEAT,
  COAL_HEAT,
  CLOTHING_PER_CITIZEN_WINTER,
  TOOL_WEAR_PER_WORKER,
  NO_TOOLS_PENALTY,
  SICKNESS_CHANCE,
  FARM_FOOD_PER_WORKER,
  CROP_META,
  ANIMAL_META,
  RanchAnimal,
  ranchCapacity,
  RANCH_BREED_PER_SEASON,
  RANCH_BREED_BONUS_CHANCE,
  RANCH_SPLIT_MIN,
  SLAUGHTER_YIELD,
  FARM_BASE_AREA,
  footprintW,
  footprintH,
  Crop,
  CROPS,
  SEED_COST,
  TRADE_VALUE,
  MERCHANT_MARGIN,
  MERCHANT_STAY_SEASONS,
  MERCHANT_ARRIVAL_CHANCE,
  MERCHANT_CATEGORIES,
  MERCHANT_CATEGORY_STOCK,
  MERCHANT_CATEGORY_META,
  DIET_VARIETY_TARGET,
  CHILD_FOOD_FACTOR,
  BIRTH_CHANCE,
  ADULT_AGE,
  OLD_AGE_START,
  MAX_AGE,
  EDUCATED_BONUS,
  isHouse,
  houseCapacityOf,
  STONE_HOUSE_HEAT_FACTOR,
  HAPPY_TAVERN,
  HAPPY_CHAPEL,
  HAPPY_CEMETERY,
  DEATH_UNREST,
  TAVERN_GRAIN_PER_SEASON,
  IMMIGRATION_CHANCE,
  IMMIGRATION_MIN,
  IMMIGRATION_MAX,
  IMMIGRANT_SICK_CHANCE,
  DISEASE_CHANCE,
  DISEASE_INFECT_FRACTION,
  SICK_RECOVER_BASE,
  SICK_RECOVER_MEDICINE,
  SICK_RECOVER_HOSPITAL,
  SICK_DEATH_CHANCE,
  MED_LOAD,
  FIRE_CHANCE,
  WELL_RADIUS,
  WELL_DOUSE_CHANCE,
  FIRE_SPREAD_CHANCE,
  FIRE_BURN_SECONDS,
  MARKET_STOCK_TARGET,
  RESOURCE_KINDS,
  BuildingType,
  SEASON_BURN,
  CLOTHED_HEAT_FACTOR,
  isAdult,
  isFireproof,
} from '../types';
import { housingCapacity, buildingCenter, makeCitizen } from './state';
import { forestInCircle, nearbyStone, nearbyWater, footprintClear } from './buildings';
import { getTile, tileIndex, inBounds, riverColumnX } from './world';
import { pathSpeedMult } from './paths';
import { findPath, isWalkable, labelComponents } from './pathfind';
import {
  totalStored,
  addNearest,
  takeNearest,
  consume,
  nearestBarnWith,
  nearestBarnWithRoom,
  nearestBarnOnlyWith,
  barnFree,
  totalFood,
  consumeFood,
  foodVarietyAvailable,
  larderShortfall,
  takeFromLarder,
  takeFoodFromLarder,
  totalAvailable,
  totalFoodAvailable,
} from './storage';

export type LogKind = 'info' | 'good' | 'bad';
export type LogFn = (msg: string, kind?: LogKind) => void;

// Local balance for the per-trip economy.
const FOREST_CIRCLE_IDEAL = 24;
const WATER_IDEAL = 14; // water tiles in the fishing circle for full yield (circle scales with workers)
const STONE_IDEAL = 6;
const MIN_FACTOR = 0.15;
const TREE_REGROW = 0.02;

const LOAD_FOOD = 8; // food produced per work cycle (before factor)
const LOAD_MAT = 6; // raw material produced per work cycle (before factor)
// Converter recipes: inputs consumed and output produced per cycle.
const WCUT_WOOD_IN = 6, WCUT_FW_OUT = 8;
const SMITH_IRON_IN = 4, SMITH_IRON_OUT = 5;
const SMITH_STEEL_IRON = 4, SMITH_STEEL_COAL = 3, SMITH_STEEL_OUT = 8;
const TAILOR_IN = 5, TAILOR_OUT = 4;

const ARRIVE = 0.25; // tile distance considered "arrived"

// Walkable-connectivity labels; two tiles with the same non-negative label are mutually
// reachable. Cached across ticks and recomputed only when walkability changes (a new state
// identity, or a bumped navVersion) — the O(N) flood fill would otherwise dominate on Large maps.
let navLabels: Int32Array | null = null;
let navLabelsFor: GameState | null = null;
let navLabelsVersion = -1;

function ensureNavLabels(s: GameState): void {
  const version = s.navVersion ?? 0;
  if (navLabels && navLabelsFor === s && navLabelsVersion === version) return;
  navLabels = labelComponents(s);
  navLabelsFor = s;
  navLabelsVersion = version;
}

/** Is the destination tile in the same walkable component as the citizen? */
function reachableTile(c: Citizen, tx: number, ty: number): boolean {
  if (!navLabels || !inBounds(tx, ty)) return false;
  const from = navLabels[tileIndex(Math.floor(c.x), Math.floor(c.y))];
  const to = navLabels[tileIndex(tx, ty)];
  return from >= 0 && from === to;
}

export function update(s: GameState, dt: number, log: LogFn): void {
  if (s.gameOver) return;
  routeBudget = 0;
  ensureNavLabels(s); // walkable connectivity, recomputed only when it actually changed
  reconcileWorkers(s);
  assignHomesAndJobs(s);
  const toolFactor = totalStored(s, 'tools') > 0 ? 1 : NO_TOOLS_PENALTY;
  for (const c of s.citizens) runCitizen(s, c, dt, toolFactor);
  processFires(s, dt, log);
  regrowForest(s, dt);
  updateMerchantBoat(s, dt, log);

  s.seasonTimer += dt;
  if (s.seasonTimer >= SEASON_LENGTH) {
    s.seasonTimer -= SEASON_LENGTH;
    endSeason(s, log);
  }
}

// ---- jobs ----
function reconcileWorkers(s: GameState): void {
  const alive = new Set(s.citizens.map((c) => c.id));
  for (const b of s.buildings) b.workers = b.workers.filter((id) => alive.has(id));
}

function assignHomesAndJobs(s: GameState): void {
  for (const b of s.buildings) {
    if (typeof b.desiredWorkers !== 'number') b.desiredWorkers = BUILDING_DEFS[b.type].jobs;
  }
  // Homes. Track occupancy and which adult sexes each house already holds so we can
  // bias homeless adults toward forming couples.
  const occ = new Map<number, number>();
  const hasM = new Set<number>();
  const hasF = new Set<number>();
  const houses = s.buildings.filter((b) => b.built && isHouse(b.type));
  for (const c of s.citizens) {
    if (c.homeId === null) continue;
    occ.set(c.homeId, (occ.get(c.homeId) ?? 0) + 1);
    if (isAdult(c)) (c.sex === 'm' ? hasM : hasF).add(c.homeId);
  }
  for (const c of s.citizens) {
    if (c.homeId !== null) continue;
    let target: Building | null = null;
    if (isAdult(c)) {
      const wantSet = c.sex === 'm' ? hasF : hasM; // a house holding the opposite sex
      for (const h of houses) if ((occ.get(h.id) ?? 0) < houseCapacityOf(h.type) && wantSet.has(h.id)) { target = h; break; }
    }
    if (!target) for (const h of houses) if ((occ.get(h.id) ?? 0) < houseCapacityOf(h.type)) { target = h; break; }
    if (target) {
      c.homeId = target.id;
      occ.set(target.id, (occ.get(target.id) ?? 0) + 1);
      if (isAdult(c)) (c.sex === 'm' ? hasM : hasF).add(target.id);
    }
  }

  const byId = new Map(s.citizens.map((c) => [c.id, c]));
  for (const b of s.buildings) {
    const target = b.built ? Math.min(BUILDING_DEFS[b.type].jobs, b.desiredWorkers) : 0;
    while (b.workers.length > target) {
      const id = b.workers.pop()!;
      const c = byId.get(id);
      if (c) c.jobId = null;
    }
  }
  const employed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) employed.add(id);
  // Only adults can be hired.
  const avail = s.citizens.filter((c) => !employed.has(c.id) && isAdult(c));
  let i = 0;
  for (const b of s.buildings) {
    if (!b.built) continue;
    const target = Math.min(BUILDING_DEFS[b.type].jobs, b.desiredWorkers);
    while (b.workers.length < target && i < avail.length) {
      const c = avail[i++];
      b.workers.push(c.id);
      c.jobId = b.id;
    }
  }
  const stillEmployed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) stillEmployed.add(id);
  for (const c of s.citizens) if (!stillEmployed.has(c.id)) c.jobId = null;

  // Builders are a global job (no building): tag the first N free adults as builders so only they
  // construct work buildings. Buildings fill first (above), builders take the leftover idle pool;
  // everyone else — employed, children, and surplus laborers — is not a builder.
  const wantBuilders = Math.max(0, s.desiredBuilders ?? 0);
  let builderN = 0;
  for (const c of s.citizens) {
    c.builder = isAdult(c) && c.jobId === null && builderN < wantBuilders;
    if (c.builder) builderN++;
  }
}

// ---- movement ----
// A* recompute budget per update tick — routes are only recomputed when a citizen's
// destination tile changes, so this cap is rarely approached.
let routeBudget = 0;
const ROUTE_BUDGET_MAX = 80;
const WAYPOINT_ARRIVE = 0.18;
/** How close (in tiles) a planned path must be before an *employed* worker will detour to lay it.
 * Free adults (laborers / idle builders) lay paths anywhere; this only bounds busy workers so a
 * distant path network doesn't strip farms and mines of their staff. */
const NEAR_PATH_RADIUS = 6;

/**
 * Move a citizen toward (c.tx, c.ty) along a water-avoiding route, returning true once the
 * final target is reached. Villagers cannot cross water except over built bridges; an
 * unreachable target simply never arrives (the caller can pick other work).
 */
function stepTo(s: GameState, c: Citizen, dt: number): boolean {
  const destTx = Math.floor(c.tx);
  const destTy = Math.floor(c.ty);
  if (c.route === undefined || c.rdx !== destTx || c.rdy !== destTy) {
    if (routeBudget >= ROUTE_BUDGET_MAX) return false; // try again next tick
    routeBudget++;
    const path = findPath(s, Math.floor(c.x), Math.floor(c.y), destTx, destTy);
    c.route = path ?? [];
    c.routeI = 0;
    c.rdx = destTx;
    c.rdy = destTy;
    if (path === null) {
      // Unreachable: mark so we don't recompute every frame; caller moves on.
      c.route = undefined;
      c.rdx = -1;
      c.rdy = -1;
      return false;
    }
  }
  const route = c.route;
  let i = c.routeI ?? 0;
  // Aim at the next waypoint, or the exact target once waypoints are exhausted.
  let px = c.tx;
  let py = c.ty;
  if (i < route.length) {
    px = route[i].x;
    py = route[i].y;
  }
  const dx = px - c.x;
  const dy = py - c.y;
  const d = Math.hypot(dx, dy);
  const thresh = i < route.length ? WAYPOINT_ARRIVE : ARRIVE;
  if (d <= thresh) {
    if (i < route.length) {
      c.routeI = i + 1;
      return false;
    }
    return true;
  }
  const speed = BASE_WALK_SPEED * pathSpeedMult(s, c.x, c.y);
  const step = Math.min(d, speed * dt);
  c.x += (dx / d) * step;
  c.y += (dy / d) * step;
  return false;
}

function goTo(c: Citizen, p: { x: number; y: number }): void {
  c.tx = p.x;
  c.ty = p.y;
}

/**
 * A walkable tile to stand at to interact with a building. Usually its centre, but for a dock
 * whose centre falls on water (e.g. the trading post) this returns the nearest walkable footprint
 * tile, then a walkable neighbour — so builders and workers can actually reach it.
 */
function buildingApproach(s: GameState, b: Building): { x: number; y: number } {
  const c = buildingCenter(b);
  if (isWalkable(s, Math.floor(c.x), Math.floor(c.y))) return c;
  const fw = footprintW(b);
  const fh = footprintH(b);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const consider = (tx: number, ty: number) => {
    if (!isWalkable(s, tx, ty)) return;
    const d = (tx + 0.5 - c.x) ** 2 + (ty + 0.5 - c.y) ** 2;
    if (d < bestD) { bestD = d; best = { x: tx + 0.5, y: ty + 0.5 }; }
  };
  for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) consider(b.x + dx, b.y + dy);
  if (best) return best;
  for (let dx = -1; dx <= fw; dx++) { consider(b.x + dx, b.y - 1); consider(b.x + dx, b.y + fh); }
  for (let dy = 0; dy < fh; dy++) { consider(b.x - 1, b.y + dy); consider(b.x + fw, b.y + dy); }
  return best ?? c;
}

// ---- per-citizen behaviour ----
function runCitizen(s: GameState, c: Citizen, dt: number, toolFactor: number): void {
  if (!isAdult(c) || c.sick) {
    wander(s, c, dt); // children play; the sick rest — neither can work or haul
    return;
  }
  // Villagers don't toil non-stop — every so often an adult takes a break (never mid-haul, so no
  // load is stranded) to visit a tavern/chapel or head home before returning to work.
  if ((c.rest ?? 0) > 0) {
    leisure(s, c, dt);
    return;
  }
  if (!c.carry && Math.random() < dt * LEISURE_CHANCE_PER_SEC) {
    c.rest = LEISURE_MIN_SECONDS + Math.random() * (LEISURE_MAX_SECONDS - LEISURE_MIN_SECONDS);
    leisure(s, c, dt);
    return;
  }
  // Household supplies come before paid work: a villager whose larder has run down fetches food,
  // fuel and medicine home first. This must run *ahead* of the job dispatch — `runWorker` treats
  // any `c.carry` as production to be hauled to a barn and would carry the groceries straight back.
  if (stockLarder(s, c, dt)) return;
  const job = c.jobId !== null ? s.buildings.find((b) => b.id === c.jobId) : null;
  if (job && job.built) {
    // Paths can be laid by any adult: an employed worker not mid-haul detours to a *nearby*
    // planned path before returning to their workplace.
    if (!c.carry && buildPath(s, c, dt, NEAR_PATH_RADIUS * NEAR_PATH_RADIUS)) return;
    runWorker(s, c, job, dt, toolFactor);
  } else runBuilder(s, c, dt);
}

/**
 * The household's designated shopper. A resident tops their own house's larder up from the barns:
 * walk to a barn holding what is short, take a load, carry it home, stock it.
 *
 * Only one resident per house runs errands at a time (`larderHauler`), so a household never pulls
 * its whole workforce off the job, and the errand only starts once something is actually short.
 * Because consumption happens in one lump at season turnover, the shopper does a burst of trips
 * after each season and then goes back to work.
 *
 * Returns true while it is handling this tick, so the caller skips the villager's normal work.
 */
function stockLarder(s: GameState, c: Citizen, dt: number): boolean {
  const home = c.homeId !== null ? s.buildings.find((b) => b.id === c.homeId) : null;

  // Second leg: carrying supplies home. `task.kind` marks the load as groceries rather than
  // production so nothing else claims it.
  if (c.task.kind === 'toLarder') {
    if (!home || !home.built || !c.carry) {
      // Home burned down or was demolished mid-errand — release the load to the normal loop,
      // which hauls it back to a barn rather than losing it.
      c.task = { kind: 'idle' };
      return false;
    }
    goTo(c, buildingCenter(home));
    if (stepTo(s, c, dt)) {
      home.store[c.carry.kind] = (home.store[c.carry.kind] ?? 0) + c.carry.amount;
      c.carry = null;
      c.task = { kind: 'idle' };
    }
    return true;
  }

  if (c.carry) return false; // already carrying production — not our errand
  if (!home || !home.built) return false;
  if (!larderHauler(s, home, c)) return false;
  const want = larderShortfall(s, home);
  if (!want) return false;
  const barn = nearestBarnOnlyWith(s, buildingCenter(home), want.kind);
  if (!barn) return false;

  // First leg: fetch a load from the barn.
  goTo(c, buildingCenter(barn));
  if (stepTo(s, c, dt)) {
    const take = Math.min(CARRY_CAP, want.amount, barn.store[want.kind] ?? 0);
    if (take > 0) {
      barn.store[want.kind] = (barn.store[want.kind] ?? 0) - take;
      if ((barn.store[want.kind] ?? 0) <= 0) delete barn.store[want.kind];
      c.carry = { kind: want.kind, amount: take };
      c.task = { kind: 'toLarder' };
    }
  }
  return true;
}

/** Whether `c` is the resident currently running their household's errands (the lowest-id able adult). */
function larderHauler(s: GameState, home: Building, c: Citizen): boolean {
  if (!isAdult(c) || c.sick) return false;
  let best: Citizen | null = null;
  for (const r of s.citizens) {
    if (r.homeId !== home.id || !isAdult(r) || r.sick) continue;
    if (!best || r.id < best.id) best = r;
  }
  return best !== null && best.id === c.id;
}

/** Spend a leisure break: amble to a tavern/chapel/home and idle there until the break ends. */
function leisure(s: GameState, c: Citizen, dt: number): void {
  c.rest = (c.rest ?? 0) - dt;
  const dest = leisureDestination(s, c);
  if (dest) {
    goTo(c, dest);
    stepTo(s, c, dt);
  } else {
    wander(s, c, dt);
  }
}

/** Where a villager on a break heads: nearest staffed tavern, then chapel, then their home. */
function leisureDestination(s: GameState, c: Citizen): { x: number; y: number } | null {
  const nearestBuilt = (pred: (b: Building) => boolean): { x: number; y: number } | null => {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const b of s.buildings) {
      if (!b.built || !pred(b)) continue;
      const p = buildingApproach(s, b);
      if (!reachableTile(c, Math.floor(p.x), Math.floor(p.y))) continue;
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };
  return (
    nearestBuilt((b) => b.type === 'tavern' && b.workers.length > 0) ??
    nearestBuilt((b) => b.type === 'chapel') ??
    nearestBuilt((b) => b.id === c.homeId)
  );
}

// ---- workers (production logistics) ----
function converterInputs(b: Building): [ResourceKind, number][] {
  switch (b.type) {
    case 'woodcutter':
      return [['wood', WCUT_WOOD_IN]];
    case 'blacksmith':
      return b.recipe === 'steel'
        ? [['iron', SMITH_STEEL_IRON], ['coal', SMITH_STEEL_COAL]]
        : [['iron', SMITH_IRON_IN]];
    case 'tailor':
      return [['leather', TAILOR_IN]];
    default:
      return [];
  }
}

function firstMissingInput(b: Building): ResourceKind | null {
  for (const [kind, amt] of converterInputs(b)) {
    if ((b.store[kind] ?? 0) < amt) return kind;
  }
  return null;
}

function runWorker(s: GameState, c: Citizen, b: Building, dt: number, toolFactor: number): void {
  if (b.type === 'market') {
    runVendor(s, c, b, dt);
    return;
  }
  if (b.type === 'trading') {
    runTrader(s, c, b, dt);
    return;
  }
  if (b.type === 'ranch' && penFromStorage(s, c, b, dt)) return;
  // 1. Carrying output? Haul it to the nearest barn with room.
  if (c.carry) {
    const barn = nearestBarnWithRoom(s, { x: c.x, y: c.y });
    if (!barn) {
      goTo(c, buildingApproach(s, b));
      stepTo(s, c, dt);
      return;
    }
    goTo(c, buildingCenter(barn));
    if (stepTo(s, c, dt)) {
      const left = addNearest(s, { x: c.x, y: c.y }, c.carry.kind, c.carry.amount);
      c.carry = left > 0 ? { kind: c.carry.kind, amount: left } : null;
    }
    return;
  }

  // 2. Converter missing an input? Fetch it from the nearest barn that has it.
  const missing = firstMissingInput(b);
  if (missing) {
    if (totalStored(s, missing) <= 0) {
      goTo(c, buildingApproach(s, b)); // wait at the shop
      stepTo(s, c, dt);
      c.timer = 0;
      return;
    }
    const barn = nearestBarnWith(s, buildingCenter(b), missing);
    if (barn) {
      goTo(c, buildingCenter(barn));
      if (stepTo(s, c, dt)) {
        const inputs = converterInputs(b);
        const need = inputs.find(([k]) => k === missing)![1];
        const want = Math.min(CARRY_CAP, need - (b.store[missing] ?? 0), barn.store[missing] ?? 0);
        if (want > 0) {
          barn.store[missing] = (barn.store[missing] ?? 0) - want;
          if ((barn.store[missing] ?? 0) <= 0) delete barn.store[missing];
          b.store[missing] = (b.store[missing] ?? 0) + want;
        }
      }
    }
    return;
  }

  // 3. Work at the building; on completion, fill carry with a produced load.
  goTo(c, buildingApproach(s, b));
  if (stepTo(s, c, dt)) {
    c.timer += dt;
    if (c.timer >= WORK_SECONDS) {
      c.timer = 0;
      const out = workOutput(s, b, dt, toolFactor);
      if (out && out.amount > 0.01) {
        // Healthier, happier, and educated workers produce more.
        const wellbeing = (0.7 + 0.3 * (c.health / 100)) * (0.85 + 0.15 * (c.happiness / 100));
        const prod = wellbeing * (c.educated ? EDUCATED_BONUS : 1);
        c.carry = { kind: out.kind, amount: Math.min(CARRY_CAP, out.amount * prod) };
      }
    }
  }
}

/** Market vendor: ferry a bit of every good from barns into the market stall. */
function runVendor(s: GameState, c: Citizen, b: Building, dt: number): void {
  if (c.carry) {
    goTo(c, buildingCenter(b));
    if (stepTo(s, c, dt)) {
      const put = Math.min(c.carry.amount, barnFree(b));
      if (put > 0) b.store[c.carry.kind] = (b.store[c.carry.kind] ?? 0) + put;
      c.carry.amount -= put;
      if (c.carry.amount > 0.01) {
        const left = addNearest(s, { x: c.x, y: c.y }, c.carry.kind, c.carry.amount);
        c.carry = left > 0 ? { kind: c.carry.kind, amount: left } : null;
      } else c.carry = null;
    }
    return;
  }
  // Find a good the market is short on that a barn can supply.
  let want: { kind: (typeof RESOURCE_KINDS)[number]; barn: Building } | null = null;
  for (const k of RESOURCE_KINDS) {
    if ((b.store[k] ?? 0) >= MARKET_STOCK_TARGET) continue;
    const barn = nearestBarnOnlyWith(s, buildingCenter(b), k);
    if (barn) {
      want = { kind: k, barn };
      break;
    }
  }
  if (!want) {
    goTo(c, buildingCenter(b));
    stepTo(s, c, dt);
    return;
  }
  goTo(c, buildingCenter(want.barn));
  if (stepTo(s, c, dt)) {
    const need = MARKET_STOCK_TARGET - (b.store[want.kind] ?? 0);
    const take = Math.min(CARRY_CAP, need, want.barn.store[want.kind] ?? 0);
    if (take > 0) {
      want.barn.store[want.kind] = (want.barn.store[want.kind] ?? 0) - take;
      if ((want.barn.store[want.kind] ?? 0) <= 0) delete want.barn.store[want.kind];
      c.carry = { kind: want.kind, amount: take };
    }
  }
}

const PEN_PER_TRIP = 4; // head of livestock a rancher walks in from the barn per trip

/**
 * A rancher restocking the pen: if the ranch is below its cap and the matching livestock sits
 * in a barn, fetch some and pen them (resource → headcount). Returns true when it handled this
 * tick (so the worker tends the herd instead of producing). Skipped while carrying output.
 */
function penFromStorage(s: GameState, c: Citizen, b: Building, dt: number): boolean {
  if (c.carry) return false;
  const animal = b.animal ?? 'cattle';
  const cap = Math.min(b.maxAnimals ?? ranchCapacity(b), ranchCapacity(b));
  const room = cap - (b.animals ?? 0);
  if (room <= 0) return false;
  const barn = nearestBarnOnlyWith(s, buildingCenter(b), animal);
  if (!barn) return false;
  goTo(c, buildingCenter(barn));
  if (stepTo(s, c, dt)) {
    const take = Math.min(PEN_PER_TRIP, room, Math.floor(barn.store[animal] ?? 0));
    if (take > 0) {
      barn.store[animal] = (barn.store[animal] ?? 0) - take;
      if ((barn.store[animal] ?? 0) <= 0) delete barn.store[animal];
      b.animals = (b.animals ?? 0) + take;
    }
  }
  return true;
}

/**
 * Trading-post keeper: keep the post's own inventory matched to the player's stock orders,
 * hauling shortfalls up from the barns and returning any surplus back to them. Trades draw
 * only from this inventory, so the player pre-stocks the post through these orders.
 */
function runTrader(s: GameState, c: Citizen, b: Building, dt: number): void {
  const orders = b.orders ?? {};
  b.store = b.store ?? {};

  // Drop whatever we're carrying: into the post if it's still wanted there, else back to a barn.
  if (c.carry) {
    const k = c.carry.kind;
    const room = (orders[k] ?? 0) - (b.store[k] ?? 0);
    if (room > 0) {
      goTo(c, buildingCenter(b));
      if (stepTo(s, c, dt)) {
        const put = Math.min(c.carry.amount, room);
        if (put > 0) b.store[k] = (b.store[k] ?? 0) + put;
        c.carry.amount -= put;
        if (c.carry.amount > 0.01) {
          const left = addNearest(s, { x: c.x, y: c.y }, k, c.carry.amount);
          c.carry = left > 0 ? { kind: k, amount: left } : null;
        } else c.carry = null;
      }
    } else {
      const barn = nearestBarnWithRoom(s, { x: c.x, y: c.y });
      if (!barn) {
        goTo(c, buildingCenter(b));
        stepTo(s, c, dt);
        return;
      }
      goTo(c, buildingCenter(barn));
      if (stepTo(s, c, dt)) {
        const left = addNearest(s, { x: c.x, y: c.y }, k, c.carry.amount);
        c.carry = left > 0 ? { kind: k, amount: left } : null;
      }
    }
    return;
  }

  // Errand 1: fetch an under-stocked ordered good from the nearest barn that has it.
  for (const k of RESOURCE_KINDS) {
    const need = (orders[k] ?? 0) - (b.store[k] ?? 0);
    if (need <= 0) continue;
    const barn = nearestBarnOnlyWith(s, buildingCenter(b), k);
    if (!barn) continue;
    goTo(c, buildingCenter(barn));
    if (stepTo(s, c, dt)) {
      const take = Math.min(CARRY_CAP, need, barn.store[k] ?? 0);
      if (take > 0) {
        barn.store[k] = (barn.store[k] ?? 0) - take;
        if ((barn.store[k] ?? 0) <= 0) delete barn.store[k];
        c.carry = { kind: k, amount: take };
      }
    }
    return;
  }

  // Errand 2: clear a surplus (post holds more than ordered, e.g. goods just bought) to the barns.
  for (const k of RESOURCE_KINDS) {
    const surplus = (b.store[k] ?? 0) - (orders[k] ?? 0);
    if (surplus <= 0.01) continue;
    goTo(c, buildingCenter(b));
    if (stepTo(s, c, dt)) {
      const take = Math.min(CARRY_CAP, surplus);
      b.store[k] = (b.store[k] ?? 0) - take;
      if ((b.store[k] ?? 0) <= 0) delete b.store[k];
      c.carry = { kind: k, amount: take };
    }
    return;
  }

  // Nothing to move — mind the post.
  goTo(c, buildingCenter(b));
  stepTo(s, c, dt);
}

function factorCircle(s: GameState, b: Building): number {
  return clamp(forestInCircle(s, b) / FOREST_CIRCLE_IDEAL, MIN_FACTOR, 1);
}
function factorWater(s: GameState, b: Building): number {
  // Count water within the (worker-scaled) work circle, so more water and more workers = more fish.
  return clamp(nearbyWater(s, b, workRadiusOf(b) ?? 3) / WATER_IDEAL, MIN_FACTOR, 1);
}
function factorStone(s: GameState, b: Building): number {
  return clamp(nearbyStone(s, BUILDING_DEFS[b.type], b.x, b.y) / STONE_IDEAL, MIN_FACTOR, 1);
}

/** One work cycle's output, consuming converter inputs from the building's store. */
function workOutput(
  s: GameState,
  b: Building,
  dt: number,
  tf: number,
): { kind: ResourceKind; amount: number } | null {
  switch (b.type) {
    case 'gatherer':
      return { kind: 'fruit', amount: LOAD_FOOD * factorCircle(s, b) * tf };
    case 'fishing':
      return { kind: 'fish', amount: LOAD_FOOD * factorWater(s, b) * tf };
    case 'hunting': {
      const f = factorCircle(s, b) * tf;
      return Math.random() < 0.7
        ? { kind: 'meat', amount: LOAD_FOOD * f }
        : { kind: 'leather', amount: LOAD_MAT * f };
    }
    case 'ranch': {
      const animal = b.animal ?? 'cattle';
      const meta = ANIMAL_META[animal];
      // Products scale with this pen's own herd (fraction of its capacity).
      const herd = Math.min(1, (b.animals ?? 0) / Math.max(1, ranchCapacity(b)));
      if ((b.animals ?? 0) <= 0) return null;
      const f = herd * tf;
      // Pick a product from this animal's weighted mix.
      let roll = Math.random();
      for (const p of meta.products) {
        if (roll < p.chance) {
          const base = p.kind === 'meat' || p.kind === 'eggs' ? LOAD_FOOD : LOAD_MAT;
          return { kind: p.kind, amount: base * p.mult * f };
        }
        roll -= p.chance;
      }
      const last = meta.products[meta.products.length - 1];
      const base = last.kind === 'meat' || last.kind === 'eggs' ? LOAD_FOOD : LOAD_MAT;
      return { kind: last.kind, amount: base * last.mult * f };
    }
    case 'lumberyard': {
      if (b.replant ?? true) plantCircle(s, b); // sow saplings on grass so the forest renews
      const f = factorCircle(s, b);
      depleteCircleTrees(s, b, 0.25 * f);
      tendCircle(s, b, WORK_SECONDS);
      return { kind: 'wood', amount: LOAD_MAT * f * tf };
    }
    case 'herbalist':
      return { kind: 'medicine', amount: MED_LOAD * factorCircle(s, b) * tf };
    case 'quarry':
      return { kind: 'stone', amount: LOAD_MAT * factorStone(s, b) * tf };
    case 'mine': {
      const f = factorStone(s, b) * tf;
      return b.output === 'iron'
        ? { kind: 'iron', amount: LOAD_MAT * 0.8 * f }
        : { kind: 'coal', amount: LOAD_MAT * f };
    }
    case 'woodcutter':
      return consumeStore(b, [['wood', WCUT_WOOD_IN]]) ? { kind: 'firewood', amount: WCUT_FW_OUT * tf } : null;
    case 'blacksmith':
      if (b.recipe === 'steel') {
        return consumeStore(b, [['iron', SMITH_STEEL_IRON], ['coal', SMITH_STEEL_COAL]])
          ? { kind: 'tools', amount: SMITH_STEEL_OUT * tf }
          : null;
      }
      return consumeStore(b, [['iron', SMITH_IRON_IN]]) ? { kind: 'tools', amount: SMITH_IRON_OUT * tf } : null;
    case 'tailor':
      return consumeStore(b, [['leather', TAILOR_IN]]) ? { kind: 'clothing', amount: TAILOR_OUT * tf } : null;
    case 'farm': {
      if (!b.crop) return null; // an unseeded field grows nothing
      const food = CROP_META[b.crop].food;
      const have = b.store[food] ?? 0;
      if (have <= 0) return null;
      const take = Math.min(CARRY_CAP, have);
      b.store[food] = have - take;
      if ((b.store[food] ?? 0) <= 0) delete b.store[food];
      return { kind: food, amount: take };
    }
  }
  return null;
}

function consumeStore(b: Building, inputs: [ResourceKind, number][]): boolean {
  for (const [k, amt] of inputs) if ((b.store[k] ?? 0) < amt) return false;
  for (const [k, amt] of inputs) {
    b.store[k] = (b.store[k] ?? 0) - amt;
    if ((b.store[k] ?? 0) <= 0) delete b.store[k];
  }
  return true;
}

// ---- builders (construction + path logistics) ----
interface SiteAction {
  site: Building;
  action: 'fetch' | 'build';
  kind?: ResourceKind;
}

function pickSite(s: GameState, c: Citizen): SiteAction | null {
  let best: SiteAction | null = null;
  let bestD = Infinity;
  for (const b of s.buildings) {
    if (b.built) continue;
    const cost = BUILDING_DEFS[b.type].cost;
    let fetchKind: ResourceKind | null = null;
    let fully = true;
    for (const k in cost) {
      const kind = k as ResourceKind;
      if ((b.store[kind] ?? 0) < (cost[kind] ?? 0)) {
        fully = false;
        if (totalStored(s, kind) > 0 && fetchKind === null) fetchKind = kind;
      }
    }
    // Materials are all delivered, but don't raise the building until any trees / loose stone
    // under its footprint have been harvested away (the free-adult workforce clears them).
    const action: SiteAction | null = fully
      ? footprintClear(s, b)
        ? { site: b, action: 'build' }
        : null
      : fetchKind
        ? { site: b, action: 'fetch', kind: fetchKind }
        : null;
    if (!action) continue;
    const p = buildingApproach(s, b);
    if (!reachableTile(c, Math.floor(p.x), Math.floor(p.y))) continue;
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = action;
    }
  }
  return best;
}

function runBuilder(s: GameState, c: Citizen, dt: number): void {
  // Deliver carried material to a site that needs it, else return it to a barn.
  if (c.carry) {
    const kind = c.carry.kind;
    // Only builders supply construction sites; a laborer just stashes whatever it's carrying.
    const site = c.builder ? nearestUnbuiltNeeding(s, c, kind) : null;
    if (site) {
      goTo(c, buildingApproach(s, site));
      if (stepTo(s, c, dt)) {
        const cost = BUILDING_DEFS[site.type].cost;
        const need = (cost[kind] ?? 0) - (site.store[kind] ?? 0);
        const put = Math.min(c.carry.amount, Math.max(0, need));
        site.store[kind] = (site.store[kind] ?? 0) + put;
        c.carry.amount -= put;
        if (c.carry.amount <= 0.01) c.carry = null;
      }
      return;
    }
    const barn = nearestBarnWithRoom(s, { x: c.x, y: c.y });
    if (barn) {
      goTo(c, buildingCenter(barn));
      if (stepTo(s, c, dt)) {
        const left = addNearest(s, { x: c.x, y: c.y }, kind, c.carry.amount);
        c.carry = left > 0 ? { kind, amount: left } : null;
      }
    } else {
      c.carry = null; // nowhere to put it; drop
    }
    return;
  }

  // Only Builders construct work buildings — find a construction site to work.
  const pick = c.builder ? pickSite(s, c) : null;
  if (pick) {
    if (pick.action === 'fetch') {
      const kind = pick.kind!;
      const barn = nearestBarnWith(s, buildingCenter(pick.site), kind);
      if (barn) {
        goTo(c, buildingCenter(barn));
        if (stepTo(s, c, dt)) {
          const cost = BUILDING_DEFS[pick.site.type].cost;
          const need = (cost[kind] ?? 0) - (pick.site.store[kind] ?? 0);
          const want = Math.min(CARRY_CAP, need, barn.store[kind] ?? 0);
          if (want > 0) {
            barn.store[kind] = (barn.store[kind] ?? 0) - want;
            if ((barn.store[kind] ?? 0) <= 0) delete barn.store[kind];
            c.carry = { kind, amount: want };
          }
        }
      }
      return;
    }
    // build: stand at the site and labour.
    goTo(c, buildingApproach(s, pick.site));
    if (stepTo(s, c, dt)) {
      pick.site.progress += dt;
      if (pick.site.progress >= buildTimeOf(pick.site.type)) {
        finishConstruction(pick.site);
      }
    }
    return;
  }

  // Any free adult (a laborer, or a builder with no site): gather a marked harvest tile if reachable.
  const hIdx = pickHarvest(s, c);
  if (hIdx >= 0) {
    runHarvest(s, c, hIdx, dt);
    return;
  }

  // Else build a planned path/bridge, else wander.
  if (!buildPath(s, c, dt)) wander(s, c, dt);
}

// ---- harvest orders (hand-gathering marked wood / loose stone) ----

/** Mark every harvestable tile (trees / loose stone) inside a tile rectangle. */
export function markHarvestRect(s: GameState, x0: number, y0: number, x1: number, y1: number): number {
  const lx = Math.max(0, Math.min(x0, x1));
  const hx = Math.min(MAP_W - 1, Math.max(x0, x1));
  const ly = Math.max(0, Math.min(y0, y1));
  const hy = Math.min(MAP_H - 1, Math.max(y0, y1));
  let marked = 0;
  for (let ty = ly; ty <= hy; ty++) {
    for (let tx = lx; tx <= hx; tx++) {
      const i = tileIndex(tx, ty);
      const t = s.tiles[i];
      if (t.type === 'forest' && t.trees > 0.05) {
        s.harvest[i] = HARVEST_WOOD;
        marked++;
      } else if ((t.stone ?? 0) > 0) {
        s.harvest[i] = HARVEST_STONE;
        marked++;
      }
    }
  }
  return marked;
}

/** Nearest reachable tile with a live harvest order, or -1. Clears stale (depleted) marks. */
function pickHarvest(s: GameState, c: Citizen): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < s.harvest.length; i++) {
    const h = s.harvest[i];
    if (h !== HARVEST_WOOD && h !== HARVEST_STONE) continue;
    const t = s.tiles[i];
    if (h === HARVEST_WOOD && t.trees <= 0.05) { s.harvest[i] = HARVEST_NONE; continue; }
    if (h === HARVEST_STONE && (t.stone ?? 0) <= 0) { s.harvest[i] = HARVEST_NONE; continue; }
    const tx = i % MAP_W;
    const ty = (i / MAP_W) | 0;
    if (!reachableTile(c, tx, ty)) continue;
    const d = (tx + 0.5 - c.x) ** 2 + (ty + 0.5 - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Walk to a marked tile and, on arrival, fill a carry-load of wood or stone from it. */
function runHarvest(s: GameState, c: Citizen, idx: number, dt: number): void {
  const tx = idx % MAP_W;
  const ty = (idx / MAP_W) | 0;
  c.tx = tx + 0.5;
  c.ty = ty + 0.5;
  if (!stepTo(s, c, dt)) return;
  c.timer += dt;
  if (c.timer < WORK_SECONDS) return;
  c.timer = 0;
  const t = s.tiles[idx];
  if (s.harvest[idx] === HARVEST_WOOD) {
    const woodAvail = t.trees * HARVEST_WOOD_PER_TREE;
    const take = Math.min(CARRY_CAP, woodAvail);
    if (take > 0.01) {
      t.trees = Math.max(0, t.trees - take / HARVEST_WOOD_PER_TREE);
      c.carry = { kind: 'wood', amount: take };
    }
    if (t.trees <= 0.05) {
      t.trees = 0;
      t.type = 'grass'; // clear-cut to open ground
      s.harvest[idx] = HARVEST_NONE;
      s.forestVersion = (s.forestVersion ?? 0) + 1; // a forest tile is gone — refresh the render layer
    }
  } else if (s.harvest[idx] === HARVEST_STONE) {
    const avail = t.stone ?? 0;
    const take = Math.min(CARRY_CAP, avail);
    if (take > 0.01) {
      t.stone = avail - take;
      c.carry = { kind: 'stone', amount: take };
    }
    if ((t.stone ?? 0) <= 0) {
      t.stone = 0;
      s.harvest[idx] = HARVEST_NONE;
    }
  }
}

function nearestUnbuiltNeeding(s: GameState, c: Citizen, kind: ResourceKind): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of s.buildings) {
    if (b.built) continue;
    const cost = BUILDING_DEFS[b.type].cost;
    if ((b.store[kind] ?? 0) >= (cost[kind] ?? 0)) continue;
    const p = buildingApproach(s, b);
    if (!reachableTile(c, Math.floor(p.x), Math.floor(p.y))) continue;
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function finishConstruction(b: Building): void {
  const cost = BUILDING_DEFS[b.type].cost;
  for (const k in cost) {
    const kind = k as ResourceKind;
    b.store[kind] = (b.store[kind] ?? 0) - (cost[kind] ?? 0);
    if ((b.store[kind] ?? 0) <= 0.001) delete b.store[kind];
  }
  b.built = true;
  b.progress = BUILDING_DEFS[b.type].buildTime;
}

/** A reachable, walkable 4-neighbour of (tx,ty) the builder can stand on to work — or null. */
function adjacentStand(s: GameState, c: Citizen, tx: number, ty: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (!isWalkable(s, nx, ny) || !reachableTile(c, nx, ny)) continue;
    const d = (nx + 0.5 - c.x) ** 2 + (ny + 0.5 - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: nx + 0.5, y: ny + 0.5 };
    }
  }
  return best;
}

/** Lay the nearest reachable planned path/bridge. `maxD2` caps how far (squared tiles) the citizen
 * will travel to reach one — used to keep busy workers from crossing the map for a distant path;
 * the labor pool passes no cap. Returns false when there's nothing (in range) to build. */
function buildPath(s: GameState, c: Citizen, dt: number, maxD2 = Infinity): boolean {
  let bestIdx = -1;
  let bestD = Infinity;
  let bestStand: { x: number; y: number } | null = null;
  for (let i = 0; i < s.paths.length; i++) {
    const v = s.paths[i];
    const tx = i % MAP_W;
    const ty = (i / MAP_W) | 0;
    let stand: { x: number; y: number } | null = null;
    if (v === PATH_DIRT_PLAN || v === PATH_STONE_PLAN) {
      if (!reachableTile(c, tx, ty)) continue; // stand on the land tile itself
      stand = { x: tx + 0.5, y: ty + 0.5 };
    } else if (v === PATH_BRIDGE_PLAN) {
      stand = adjacentStand(s, c, tx, ty); // bridges are laid from a walkable neighbour
      if (!stand) continue;
    } else {
      continue;
    }
    const d = (tx + 0.5 - c.x) ** 2 + (ty + 0.5 - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
      bestStand = stand;
    }
  }
  if (bestIdx < 0 || !bestStand || bestD > maxD2) return false;
  const tx = bestIdx % MAP_W;
  const ty = (bestIdx / MAP_W) | 0;
  c.tx = bestStand.x;
  c.ty = bestStand.y;
  if (stepTo(s, c, dt)) {
    const v = s.paths[bestIdx];
    if (v === PATH_STONE_PLAN) {
      if (takeNearest(s, { x: tx, y: ty }, 'stone', 1) >= 1) s.paths[bestIdx] = PATH_STONE;
    } else if (v === PATH_BRIDGE_PLAN) {
      if (totalStored(s, 'wood') >= BRIDGE_WOOD_COST) {
        takeNearest(s, bestStand, 'wood', BRIDGE_WOOD_COST);
        s.paths[bestIdx] = PATH_BRIDGE;
        s.navVersion = (s.navVersion ?? 0) + 1; // a new bridge changed walkability
      }
    } else {
      s.paths[bestIdx] = PATH_DIRT;
    }
  }
  return true;
}

function wander(s: GameState, c: Citizen, dt: number): void {
  // Re-pick on a timer (not only on arrival) so an unreachable spot never freezes a villager.
  c.timer -= dt;
  if (c.timer <= 0) {
    const centre = centreOfVillage(s);
    let set = false;
    for (let k = 0; k < 6; k++) {
      const tx = clampTile(centre.x + (Math.random() - 0.5) * 8);
      const ty = clampTile(centre.y + (Math.random() - 0.5) * 8);
      if (reachableTile(c, Math.floor(tx), Math.floor(ty))) {
        c.tx = tx;
        c.ty = ty;
        set = true;
        break;
      }
    }
    if (!set) {
      c.tx = c.x;
      c.ty = c.y;
    }
    c.timer = 2 + Math.random() * 3;
  }
  stepTo(s, c, dt);
}

// ---- season turnover ----
function endSeason(s: GameState, log: LogFn): void {
  const popStart = s.citizens.length; // for tallying deaths (affects morale)
  s.season = (s.season + 1) % SEASONS.length;
  if (s.season === 0) {
    s.year++;
    log(`A new year begins — Year ${s.year}`, 'info');
    // Everyone ages a year. Children coming of age are educated if a school is staffed.
    const schoolStaffed = s.buildings.some((b) => b.built && b.type === 'school' && b.workers.length > 0);
    for (const c of s.citizens) {
      const wasChild = c.age < ADULT_AGE;
      c.age += 1;
      if (wasChild && c.age >= ADULT_AGE) c.educated = schoolStaffed;
    }
    // Old age: from OLD_AGE_START the yearly death chance ramps up, worse if unhealthy.
    const dying: Citizen[] = [];
    for (const c of s.citizens) {
      if (c.age < OLD_AGE_START) continue;
      const base = clamp((c.age - OLD_AGE_START) / (MAX_AGE - OLD_AGE_START), 0, 1);
      if (Math.random() < Math.min(1, base * (1 + (1 - c.health / 100)))) dying.push(c);
    }
    for (const c of dying) removeCitizen(s, c);
    if (dying.length > 0) log(`${dying.length} elder${dying.length > 1 ? 's' : ''} died of old age`, 'info');
  }
  const season = SEASONS[s.season];

  // Farms grow through spring/summer; deposit the chosen crop's harvest into their store at autumn.
  for (const b of s.buildings) {
    // A field only grows a crop the village has the seed for; otherwise it lies fallow.
    if (b.built && b.type === 'farm' && b.crop && s.seeds.includes(b.crop)) {
      if (season === 'Spring' || season === 'Summer') b.growth = Math.min(1, b.growth + 0.5);
      if (season === 'Autumn' && b.workers.length > 0) {
        const crop = CROP_META[b.crop];
        // A bigger field yields proportionally more (area relative to the 4×4 baseline).
        const areaFactor = (footprintW(b) * footprintH(b)) / FARM_BASE_AREA;
        const yield_ = b.workers.length * FARM_FOOD_PER_WORKER * b.growth * crop.yieldMult * areaFactor;
        if (yield_ > 1) {
          b.store[crop.food] = (b.store[crop.food] ?? 0) + yield_;
          log(`A field yielded ${Math.round(yield_)} ${crop.label.toLowerCase()} to harvest`, 'good');
        }
        b.growth = 0;
      }
    }
  }

  // Each ranch breeds its own penned herd toward the player's cap; births beyond it are
  // slaughtered for resources. A breeding pair (2+) yields at least one calf every two seasons.
  for (const b of s.buildings) {
    if (!b.built || b.type !== 'ranch') continue;
    if ((b.animals ?? 0) < 2) continue;
    let progress = (b.breedProgress ?? 0) + RANCH_BREED_PER_SEASON;
    if (Math.random() < RANCH_BREED_BONUS_CHANCE) progress += 1;
    let births = Math.floor(progress);
    b.breedProgress = progress - births;
    if (births <= 0) continue;
    const cap = Math.min(b.maxAnimals ?? ranchCapacity(b), ranchCapacity(b));
    const room = Math.max(0, cap - (b.animals ?? 0));
    const kept = Math.min(births, room);
    b.animals = (b.animals ?? 0) + kept;
    const excess = births - kept;
    if (excess > 0) butcherProducts(s, b, excess); // births over the cap → straight to the butcher
  }

  let pop = s.citizens.length;
  if (pop === 0) return;

  // Tools wear from labour.
  let employed = 0;
  for (const b of s.buildings) if (b.built) employed += b.workers.length;
  consume(s, 'tools', employed * TOOL_WEAR_PER_WORKER);

  // A villager's own home, for larder-first consumption below.
  const homeById = new Map<number, Building>();
  for (const b of s.buildings) if (b.built && isHouse(b.type)) homeById.set(b.id, b);
  const homeOf = (c: Citizen): Building | undefined =>
    c.homeId !== null ? homeById.get(c.homeId) : undefined;

  // Food — adults eat a full ration, children half. Each villager eats out of their own household
  // larder first and only falls back to the village barns once it runs dry, so a stocked house
  // rides out a bad season that would otherwise have starved its residents.
  let shortFood = 0;
  const hungry: Citizen[] = [];
  for (const c of s.citizens) {
    let need = FOOD_PER_CITIZEN_PER_SEASON * (isAdult(c) ? 1 : CHILD_FOOD_FACTOR);
    const home = homeOf(c);
    if (home) need = takeFoodFromLarder(home, need);
    if (need > 0) need = consumeFood(s, need);
    if (need > 0.001) hungry.push(c); // went without — the pool starvation draws from
    shortFood += need;
  }
  if (shortFood > 0) {
    const starved = Math.min(hungry.length, Math.ceil(shortFood / FOOD_PER_CITIZEN_PER_SEASON));
    killFrom(s, hungry, starved);
    if (starved > 0) log(`${starved} villager${starved > 1 ? 's' : ''} starved`, 'bad');
  }

  // Clothing and firewood are used every season, at a seasonal rate (winter heaviest, summer
  // lightest). Clothing is issued first because being warmly dressed cuts the fuel a villager
  // needs — `c.clothed` is transient, recomputed here each season and never saved.
  const burn = SEASON_BURN[season];
  if (s.citizens.length > 0) {
    const clothEach = CLOTHING_PER_CITIZEN_WINTER * burn;
    const unclothed: Citizen[] = [];
    for (const c of s.citizens) {
      // Clothing stays a village-wide store: it is issued from the barns, not kept in larders.
      c.clothed = clothEach <= 0 || consume(s, 'clothing', clothEach) <= 0.001;
      if (!c.clothed) unclothed.push(c);
    }

    // Heat: firewood from the villager's own larder first, then firewood and coal from the barns.
    let heatShort = 0;
    const cold: Citizen[] = [];
    for (const c of s.citizens) {
      const home = homeOf(c);
      const stoneFactor = home?.type === 'stonehouse' ? STONE_HOUSE_HEAT_FACTOR : 1;
      const clothFactor = c.clothed ? CLOTHED_HEAT_FACTOR : 1;
      const want = HEAT_PER_CITIZEN_WINTER * burn * stoneFactor * clothFactor; // heat units
      let need = want;
      if (home) {
        const fromLarder = Math.min(need / FIREWOOD_HEAT, home.store['firewood'] ?? 0);
        if (fromLarder > 0) {
          takeFromLarder(home, 'firewood', fromLarder);
          need -= fromLarder * FIREWOOD_HEAT;
        }
      }
      if (need > 0) {
        // Fall back to the village fuel pile for this villager's remaining need, so whether they
        // end up cold depends on their own larder plus what is left in the barns — not on a
        // village-wide average.
        need = consume(s, 'firewood', need / FIREWOOD_HEAT) * FIREWOOD_HEAT;
        if (need > 0) need = consume(s, 'coal', need / COAL_HEAT) * COAL_HEAT;
      }
      if (need > 0.001) cold.push(c);
      heatShort += need;
    }

    // Only a winter shortfall is lethal — going short of fuel in summer is uncomfortable, not fatal.
    if (season === 'Winter') {
      if (heatShort > 0.001) {
        const froze = Math.min(cold.length, Math.ceil(heatShort / HEAT_PER_CITIZEN_WINTER));
        killFrom(s, cold, froze);
        if (froze > 0) log(`${froze} villager${froze > 1 ? 's' : ''} froze in the cold`, 'bad');
      }
      // Only the villagers who actually went without warm clothing are at risk.
      const sickChance = Math.min(1, SICKNESS_CHANCE * (1 + (1 - avgHealth(s) / 100)));
      const fallen: Citizen[] = [];
      for (const c of unclothed) if (Math.random() < sickChance) fallen.push(c);
      if (fallen.length > 0) {
        killFrom(s, fallen, fallen.length);
        log(`${fallen.length} villager${fallen.length > 1 ? 's' : ''} fell ill without warm clothing`, 'bad');
      }
    }
  }

  // Proactive survival hints — warn the player *before* the shortfall bites, once per season
  // (endSeason is the natural throttle). These ride the existing event log; no new UI.
  warnOfShortfalls(s, season, log);

  diseaseSeason(s, log);
  fireSeason(s, log);

  // Tally deaths so far this season (old age, starvation, cold, illness) — they weigh
  // on morale unless the village keeps a cemetery.
  const deaths = Math.max(0, popStart - s.citizens.length);

  // Nomad immigration: with spare housing and a comfortable food surplus, a band of
  // wanderers may ask to settle. A few can arrive already sick.
  immigrate(s, log);

  // Taverns brew stored grain into ale, cheering the village (staffed only).
  let tavernActive = false;
  for (const b of s.buildings) {
    if (b.built && b.type === 'tavern' && b.workers.length > 0) {
      if (consume(s, 'grain', TAVERN_GRAIN_PER_SEASON) === 0) tavernActive = true;
    }
  }

  // Reproduction: a house with an adult man + woman, spare room, and enough food
  // stored may bear a child. Happier villages breed faster.
  if (s.citizens.length > 0 && totalFood(s) > s.citizens.length * FOOD_PER_CITIZEN_PER_SEASON) {
    const chance = BIRTH_CHANCE * (0.4 + 0.6 * (avgHappiness(s) / 100));
    let born = 0;
    for (const h of s.buildings) {
      if (!h.built || !isHouse(h.type)) continue;
      const residents = s.citizens.filter((c) => c.homeId === h.id);
      if (residents.length >= houseCapacityOf(h.type)) continue;
      const man = residents.some((c) => isAdult(c) && c.sex === 'm');
      const woman = residents.some((c) => isAdult(c) && c.sex === 'f');
      if (man && woman && Math.random() < chance) {
        spawnChild(s, h);
        born++;
      }
    }
    if (born > 0) log(born > 1 ? `${born} children were born` : `A child was born`, 'good');
  }

  // Well-being drifts toward conditions (food/variety -> health; space/goods/amenities -> happiness).
  updateWellbeing(s, shortFood > 0, deaths, tavernActive);

  updateMerchant(s, log);

  if (s.citizens.length === 0) {
    s.gameOver = true;
    log('Your village has died out.', 'bad');
  }
}

/**
 * Emit proactive, one-off warnings so the player can react before a shortfall kills anyone.
 * Called once per season from endSeason (the throttle). Reads current stores after this season's
 * consumption, so a warning means "you are short for what's coming next".
 */
function warnOfShortfalls(s: GameState, season: Season, log: LogFn): void {
  const pop = s.citizens.length;
  if (pop === 0) return;

  // These count what the village can actually reach — barn stock *plus* what households have
  // already carried home — so a village with full larders and lean barns isn't told it is starving.

  // Entering Autumn: the player has one season to stock fuel and clothing for Winter.
  if (season === 'Autumn') {
    const heatHave =
      totalAvailable(s, 'firewood') * FIREWOOD_HEAT + totalAvailable(s, 'coal') * COAL_HEAT;
    if (heatHave < pop * HEAT_PER_CITIZEN_WINTER) {
      log('❄️ Winter is coming and fuel is low — stock firewood or coal', 'bad');
    }
    if (totalAvailable(s, 'clothing') < pop * CLOTHING_PER_CITIZEN_WINTER) {
      log('🧥 Winter is coming and warm clothing is short', 'bad');
    }
  }

  // Any season: less than a full season of food left across the barns and larders.
  if (totalFoodAvailable(s) < pop * FOOD_PER_CITIZEN_PER_SEASON) {
    log('🍽️ Food stores are running low', 'bad');
  }
}

// ---- merchant ----

/** The built trading post, if any (goods are traded through its own inventory). */
export function tradingPost(s: GameState): Building | null {
  return s.buildings.find((b) => b.built && b.type === 'trading') ?? null;
}

const BOAT_SPEED = 5; // tiles per second the merchant boat travels along the river

/**
 * Seasonal merchant bookkeeping (called once per season from endSeason). Handles departure
 * after the allotted stay and rolls for a new arrival. Arrivals are probabilistic and never
 * back-to-back: the season immediately after a departure is a guaranteed gap.
 */
function updateMerchant(s: GameState, log: LogFn): void {
  const m = s.merchant;

  // A docked merchant counts down its stay, then casts off.
  if (m.phase === 'docked') {
    m.seasonsLeft -= 1;
    if (m.seasonsLeft <= 0) {
      m.phase = 'leaving';
      m.present = false;
    }
    return;
  }

  // Only roll for a fresh arrival when fully away (never while a boat is still sailing).
  if (m.phase !== 'away') return;

  // The season after a departure is always merchant-free — no back-to-back visits.
  if (m.cooldown) {
    m.cooldown = false;
    return;
  }

  const hasPost = s.buildings.some((b) => b.built && b.type === 'trading' && b.workers.length > 0);
  if (hasPost && Math.random() < MERCHANT_ARRIVAL_CHANCE) spawnMerchant(s, log);
}

/** Roll a merchant category, stock its goods, and launch its boat from the top of the river. */
function spawnMerchant(s: GameState, log: LogFn): void {
  const m = s.merchant;
  let cats = MERCHANT_CATEGORIES.slice();
  // A seed merchant has nothing to sell once every crop is unlocked — drop it then.
  if (CROPS.every((c) => s.seeds.includes(c))) cats = cats.filter((c) => c !== 'seeds');
  const category = cats[Math.floor(Math.random() * cats.length)];

  m.category = category;
  m.stock = {};
  m.seedStock = [];
  if (category === 'seeds') {
    m.seedStock = CROPS.filter((c) => !s.seeds.includes(c));
  } else {
    for (const [k, qty] of Object.entries(MERCHANT_CATEGORY_STOCK[category]) as [ResourceKind, number][]) {
      m.stock[k] = qty;
    }
  }
  m.phase = 'arriving';
  m.present = false;
  m.boat = { x: riverColumnX(s.tiles, 0), y: 0 };
  const meta = MERCHANT_CATEGORY_META[category];
  log(`${meta.emoji} A ${meta.label.toLowerCase()}'s boat is sailing in`, 'info');
}

/** Per-tick boat motion: sail in to the dock, hold there, then sail off downstream. */
function updateMerchantBoat(s: GameState, dt: number, log: LogFn): void {
  const m = s.merchant;
  if (!m.boat) return;
  const post = tradingPost(s);

  if (m.phase === 'arriving') {
    if (!post) {
      // Trading post demolished mid-approach — turn the boat around.
      m.phase = 'leaving';
      m.present = false;
      return;
    }
    const dockY = buildingCenter(post).y;
    if (moveBoatTo(s, m.boat, dockY, dt)) {
      m.phase = 'docked';
      m.present = true;
      m.seasonsLeft = MERCHANT_STAY_SEASONS;
      const meta = m.category ? MERCHANT_CATEGORY_META[m.category] : { emoji: '⚓', label: 'merchant' };
      log(`${meta.emoji} A ${meta.label.toLowerCase()} has docked — trade at the post`, 'good');
    }
  } else if (m.phase === 'docked') {
    // Hold station beside the dock.
    if (post) {
      const dockY = buildingCenter(post).y;
      m.boat.y = dockY;
      m.boat.x = riverColumnX(s.tiles, dockY);
    }
  } else if (m.phase === 'leaving') {
    m.present = false;
    if (moveBoatTo(s, m.boat, MAP_H + 2, dt)) {
      m.phase = 'away';
      m.boat = null;
      m.stock = {};
      m.seedStock = [];
      m.category = null;
      m.cooldown = true; // guarantees next season has no merchant
      log('⛵ The merchant sailed away', 'info');
    }
  }
}

/** Move the boat toward river row `goalY`, tracking the river's x. Returns true once arrived. */
function moveBoatTo(s: GameState, boat: { x: number; y: number }, goalY: number, dt: number): boolean {
  const step = BOAT_SPEED * dt;
  const dy = goalY - boat.y;
  boat.y = Math.abs(dy) <= step ? goalY : boat.y + Math.sign(dy) * step;
  boat.x = riverColumnX(s.tiles, boat.y);
  return Math.abs(goalY - boat.y) < 0.01;
}

/** End a merchant visit early at the player's request. */
export function dismissMerchant(s: GameState): void {
  const m = s.merchant;
  if (m.phase === 'docked' || m.phase === 'arriving') {
    m.phase = 'leaving';
    m.present = false;
  }
}

export interface TradeResult {
  ok: boolean;
  reason?: string;
  gave?: number;
}

/**
 * A value-matching trade. `give` goods are drawn from the trading post's own inventory; `get`
 * goods (and `buySeeds` unlocks) come from the docked merchant. The player must offer at least
 * the required value (the merchant keeps MERCHANT_MARGIN's cut).
 */
export interface TradeBasket {
  give: Partial<Record<ResourceKind, number>>;
  get: Partial<Record<ResourceKind, number>>;
  buySeeds: Crop[];
}

function sumValue(goods: Partial<Record<ResourceKind, number>>): number {
  let v = 0;
  for (const k in goods) v += TRADE_VALUE[k as ResourceKind] * (goods[k as ResourceKind] ?? 0);
  return v;
}

/** Total value the player is offering (the give side). */
export function offerValue(b: TradeBasket): number {
  return sumValue(b.give);
}

/** Total value of the goods being bought (the get side plus any seed unlocks). */
export function purchaseValue(b: TradeBasket): number {
  return sumValue(b.get) + b.buySeeds.length * SEED_COST;
}

/** Minimum offer value needed to buy the basket (purchase value grossed up by the merchant's cut). */
export function requiredValue(b: TradeBasket): number {
  return purchaseValue(b) / MERCHANT_MARGIN;
}

export function basketTrade(s: GameState, basket: TradeBasket): TradeResult {
  const m = s.merchant;
  if (!m.present) return { ok: false, reason: 'No merchant docked' };
  const post = tradingPost(s);
  if (!post) return { ok: false, reason: 'No trading post' };
  post.store = post.store ?? {};

  // Something must actually be bought.
  if (purchaseValue(basket) <= 0) return { ok: false, reason: 'Nothing selected to buy' };

  // Buy side within the merchant's stock / seed offer.
  for (const [k, qty] of Object.entries(basket.get) as [ResourceKind, number][]) {
    if (!qty || qty <= 0) continue;
    if ((m.stock[k] ?? 0) < qty) return { ok: false, reason: `Merchant is out of ${k}` };
  }
  for (const crop of basket.buySeeds) {
    if (!m.seedStock.includes(crop)) return { ok: false, reason: 'That seed is not on offer' };
    if (s.seeds.includes(crop)) return { ok: false, reason: 'Seed already owned' };
  }
  // Give side must be sitting in the post inventory.
  for (const [k, qty] of Object.entries(basket.give) as [ResourceKind, number][]) {
    if (!qty || qty <= 0) continue;
    if ((post.store[k] ?? 0) < qty) return { ok: false, reason: `Post has too little ${k}` };
  }
  // Values must match (offer ≥ required).
  const have = offerValue(basket);
  if (have + 1e-6 < requiredValue(basket)) return { ok: false, reason: 'Offer value too low' };

  // Settle: spend the give goods, receive the bought goods (both in the post inventory), unlock seeds.
  for (const [k, qty] of Object.entries(basket.give) as [ResourceKind, number][]) {
    if (!qty || qty <= 0) continue;
    post.store[k] = (post.store[k] ?? 0) - qty;
    if ((post.store[k] ?? 0) <= 1e-6) delete post.store[k];
  }
  for (const [k, qty] of Object.entries(basket.get) as [ResourceKind, number][]) {
    if (!qty || qty <= 0) continue;
    post.store[k] = (post.store[k] ?? 0) + qty;
    m.stock[k] = (m.stock[k] ?? 0) - qty;
    if ((m.stock[k] ?? 0) <= 1e-6) delete m.stock[k];
  }
  for (const crop of basket.buySeeds) {
    s.seeds.push(crop);
    m.seedStock = m.seedStock.filter((c) => c !== crop);
  }
  return { ok: true, gave: Math.round(have) };
}

// ---- ranch management ----

/**
 * Deposit the meat/leather/eggs from slaughtering `n` head into storage. This does NOT touch the
 * pen's headcount — callers decide whether those `n` were existing animals (a cull) or over-cap
 * births that never joined the herd.
 */
function butcherProducts(s: GameState, b: Building, n: number): void {
  if (n <= 0) return;
  const animal = b.animal ?? 'cattle';
  const at = buildingCenter(b);
  for (const p of ANIMAL_META[animal].products) {
    const amount = n * SLAUGHTER_YIELD * p.chance * p.mult;
    if (amount > 0) addNearest(s, at, p.kind, amount);
  }
}

/** Cull the whole ranch — slaughter every animal for resources. */
export function cullRanch(s: GameState, b: Building): void {
  butcherProducts(s, b, b.animals ?? 0);
  b.animals = 0;
  b.breedProgress = 0;
}

/** Built ranches (other than `from`) raising the same animal that still have room for more. */
export function eligibleRanchTargets(s: GameState, from: Building): Building[] {
  const animal = from.animal ?? 'cattle';
  return s.buildings.filter(
    (b) =>
      b !== from &&
      b.built &&
      b.type === 'ranch' &&
      (b.animal ?? 'cattle') === animal &&
      (b.animals ?? 0) < Math.min(b.maxAnimals ?? ranchCapacity(b), ranchCapacity(b)),
  );
}

/** Move up to `n` head from `from` to `to`, bounded by the destination's remaining room. */
function moveAnimals(from: Building, to: Building, n: number): number {
  const room = Math.min(to.maxAnimals ?? ranchCapacity(to), ranchCapacity(to)) - (to.animals ?? 0);
  const moved = Math.max(0, Math.min(n, from.animals ?? 0, room));
  from.animals = (from.animals ?? 0) - moved;
  to.animals = (to.animals ?? 0) + moved;
  return moved;
}

/** Split ~half of a large herd (≥ RANCH_SPLIT_MIN) into another eligible ranch. */
export function splitRanch(s: GameState, from: Building, to: Building): { ok: boolean; reason?: string; moved?: number } {
  if ((from.animals ?? 0) < RANCH_SPLIT_MIN) return { ok: false, reason: `Need ${RANCH_SPLIT_MIN}+ to split` };
  if (!eligibleRanchTargets(s, from).includes(to)) return { ok: false, reason: 'That ranch cannot take them' };
  const moved = moveAnimals(from, to, Math.floor((from.animals ?? 0) / 2));
  return moved > 0 ? { ok: true, moved } : { ok: false, reason: 'No room in that ranch' };
}

/** Transfer the whole herd into another ranch that can hold it. */
export function transferRanch(s: GameState, from: Building, to: Building): { ok: boolean; reason?: string; moved?: number } {
  if (!eligibleRanchTargets(s, from).includes(to)) return { ok: false, reason: 'That ranch cannot take them' };
  const room = Math.min(to.maxAnimals ?? ranchCapacity(to), ranchCapacity(to)) - (to.animals ?? 0);
  if (room < (from.animals ?? 0)) return { ok: false, reason: 'Not enough room there' };
  const moved = moveAnimals(from, to, from.animals ?? 0);
  return { ok: true, moved };
}

// ---- population helpers ----
function killCitizens(s: GameState, n: number): void {
  killFrom(s, s.citizens, n);
}

/**
 * Take `n` villagers from `candidates`, eldest first — the frail go before the young.
 *
 * Shortages pick their victims from the villagers who actually went without: a household that
 * stocked its larder keeps its residents alive through a season that empties the barns, which is
 * the whole point of keeping supplies at home. Passing the full population back gives the old
 * village-wide behaviour (used for things nobody can stockpile against, like winter illness).
 */
function killFrom(s: GameState, candidates: Citizen[], n: number): void {
  const pool = candidates.filter((c) => s.citizens.includes(c));
  pool.sort((a, b) => b.age - a.age);
  for (let i = 0; i < n && i < pool.length; i++) removeCitizen(s, pool[i]);
}

function removeCitizen(s: GameState, c: Citizen): void {
  const idx = s.citizens.indexOf(c);
  if (idx < 0) return;
  s.citizens.splice(idx, 1);
  for (const b of s.buildings) b.workers = b.workers.filter((id) => id !== c.id);
}

/** A new child, born into `house`. */
function spawnChild(s: GameState, house: Building): void {
  const at = buildingCenter(house);
  const c = makeCitizen(s, Math.random() < 0.5 ? 'm' : 'f', 0, at.x + (Math.random() - 0.5), at.y + (Math.random() - 0.5));
  c.homeId = house.id;
  s.citizens.push(c);
}

function centreOfVillage(s: GameState): { x: number; y: number } {
  if (s.buildings.length === 0) {
    if (s.citizens.length > 0) return { x: s.citizens[0].x, y: s.citizens[0].y };
    return { x: 24, y: 24 };
  }
  let x = 0;
  let y = 0;
  for (const b of s.buildings) {
    const c = buildingCenter(b);
    x += c.x;
    y += c.y;
  }
  return { x: x / s.buildings.length, y: y / s.buildings.length };
}

// ---- well-being (health & happiness) ----
export function avgHealth(s: GameState): number {
  if (s.citizens.length === 0) return 100;
  let t = 0;
  for (const c of s.citizens) t += c.health;
  return t / s.citizens.length;
}

export function avgHappiness(s: GameState): number {
  if (s.citizens.length === 0) return 100;
  let t = 0;
  for (const c of s.citizens) t += c.happiness;
  return t / s.citizens.length;
}

function updateWellbeing(s: GameState, foodShort: boolean, deaths: number, tavernActive: boolean): void {
  const pop = s.citizens.length;
  if (pop === 0) return;
  const variety = foodVarietyAvailable(s); // distinct food types in the barns and larders
  // The variety bonus saturates at DIET_VARIETY_TARGET distinct foods (there are many crops now).
  const healthTarget = clamp(
    40 + 60 * (Math.min(variety, DIET_VARIETY_TARGET) / DIET_VARIETY_TARGET) - (foodShort ? 30 : 0),
    0,
    100,
  );
  const headroom = housingCapacity(s) - pop > 0;
  const clothed = totalAvailable(s, 'clothing') >= pop;
  const comfortable = totalFoodAvailable(s) > pop * FOOD_PER_CITIZEN_PER_SEASON;
  const chapel = s.buildings.some((b) => b.built && b.type === 'chapel');
  const cemetery = s.buildings.some((b) => b.built && b.type === 'cemetery');
  // Basics can reach 75; amenities carry the village the rest of the way.
  let happyTarget = 40 + (headroom ? 10 : 0) + (clothed ? 10 : 0) + (comfortable ? 15 : 0);
  if (tavernActive) happyTarget += HAPPY_TAVERN;
  if (chapel) happyTarget += HAPPY_CHAPEL;
  if (cemetery) happyTarget += HAPPY_CEMETERY;
  if (deaths > 0 && !cemetery) happyTarget -= DEATH_UNREST; // grief when the dead lie unhonoured
  happyTarget = clamp(happyTarget, 0, 100);
  for (const c of s.citizens) {
    c.health += (healthTarget - c.health) * 0.25;
    c.happiness += (happyTarget - c.happiness) * 0.25;
  }
}

/**
 * A comfortable food surplus occasionally draws a band of nomads to the village gate.
 * They don't move in on their own — the player must accept or turn them away — and they
 * come whether or not there is spare housing.
 */
function immigrate(s: GameState, log: LogFn): void {
  if (s.pendingNomads) return; // an offer is already awaiting the player's decision
  const pop = s.citizens.length;
  if (pop === 0) return;
  if (totalFood(s) <= pop * FOOD_PER_CITIZEN_PER_SEASON * 1.5) return; // need a comfortable surplus
  if (Math.random() >= IMMIGRATION_CHANCE) return;

  const count = IMMIGRATION_MIN + Math.floor(Math.random() * (IMMIGRATION_MAX - IMMIGRATION_MIN + 1));
  let sick = 0;
  for (let i = 0; i < count; i++) if (Math.random() < IMMIGRANT_SICK_CHANCE) sick++;
  s.pendingNomads = { count, sick };
  log(`${count} nomads ask to join your village`, 'info');
}

/** Player accepted the waiting nomads — settle them (some may be sick). */
export function acceptNomads(s: GameState, log: LogFn): void {
  const offer = s.pendingNomads;
  if (!offer) return;
  s.pendingNomads = null;
  const centre = centreOfVillage(s);
  let placedSick = 0;
  for (let i = 0; i < offer.count; i++) {
    const age = Math.floor(ADULT_AGE + 2 + Math.random() * (OLD_AGE_START - ADULT_AGE - 4));
    const c = makeCitizen(
      s,
      Math.random() < 0.5 ? 'm' : 'f',
      age,
      centre.x + (Math.random() - 0.5) * 2,
      centre.y + (Math.random() - 0.5) * 2,
    );
    if (placedSick < offer.sick) {
      c.sick = true;
      placedSick++;
    }
    s.citizens.push(c);
  }
  log(`${offer.count} nomad${offer.count > 1 ? 's' : ''} settled in your village`, 'good');
  if (offer.sick > 0) log(`${offer.sick} newcomer${offer.sick > 1 ? 's' : ''} arrived sick`, 'bad');
}

/** Player turned the waiting nomads away. */
export function rejectNomads(s: GameState, log: LogFn): void {
  if (!s.pendingNomads) return;
  s.pendingNomads = null;
  log('You turned the nomads away', 'info');
}

// ---- disease & fire ----
function dist2c(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function diseaseSeason(s: GameState, log: LogFn): void {
  const pop = s.citizens.length;
  if (pop === 0) return;

  // Outbreak: infect a share of the healthy (likelier when the village is unwell). Skipped when
  // disasters are turned off — but the recovery loop below still runs so villagers who arrived
  // sick with a nomad band can heal.
  if (s.disasters && pop >= 4 && Math.random() < DISEASE_CHANCE) {
    const healthy = s.citizens.filter((c) => !c.sick);
    healthy.sort(() => Math.random() - 0.5);
    const n = Math.min(healthy.length, Math.max(1, Math.floor(healthy.length * DISEASE_INFECT_FRACTION)));
    for (let i = 0; i < n; i++) healthy[i].sick = true;
    if (n > 0) log('A sickness spreads through the village', 'bad');
  }

  // Treat the sick: medicine and a staffed hospital speed recovery.
  const hospital = s.buildings.some((b) => b.built && b.type === 'hospital' && b.workers.length > 0);
  let died = 0;
  for (const c of [...s.citizens]) {
    if (!c.sick) continue;
    let chance = SICK_RECOVER_BASE + (c.health / 100) * 0.2;
    // Reach for the medicine kept at home first, then the village stock.
    const home = c.homeId !== null ? s.buildings.find((b) => b.id === c.homeId) : null;
    if (home && (home.store['medicine'] ?? 0) >= 1) {
      takeFromLarder(home, 'medicine', 1);
      chance += SICK_RECOVER_MEDICINE;
    } else if (totalStored(s, 'medicine') >= 1) {
      consume(s, 'medicine', 1);
      chance += SICK_RECOVER_MEDICINE;
    }
    if (hospital) chance += SICK_RECOVER_HOSPITAL;
    if (Math.random() < chance) {
      c.sick = false;
      c.health = Math.min(100, c.health + 15);
    } else {
      c.health -= 15;
      if (c.health <= 0 || Math.random() < SICK_DEATH_CHANCE) {
        removeCitizen(s, c);
        died++;
      }
    }
  }
  if (died > 0) log(`${died} villager${died > 1 ? 's' : ''} died of illness`, 'bad');
}

function fireSeason(s: GameState, log: LogFn): void {
  if (!s.disasters) return; // disasters toggled off — no fires ignite
  const flammable = s.buildings.filter((b) => b.built && !isFireproof(b.type) && !b.fireTimer);
  if (flammable.length === 0) return;
  if (Math.random() < FIRE_CHANCE) tryIgnite(s, flammable[(Math.random() * flammable.length) | 0], log, true);
}

/** Testing/debug: attempt to set a building alight (respecting well protection). */
export function igniteBuilding(s: GameState, b: Building, log: LogFn): void {
  tryIgnite(s, b, log, true);
}

function tryIgnite(s: GameState, b: Building, log: LogFn, announce: boolean): void {
  if (b.fireTimer || isFireproof(b.type)) return;
  const c = buildingCenter(b);
  const wellNear = s.buildings.some(
    (w) => w.built && w.type === 'well' && dist2c(buildingCenter(w), c) <= WELL_RADIUS * WELL_RADIUS,
  );
  if (wellNear && Math.random() < WELL_DOUSE_CHANCE) {
    if (announce) log('A well doused a fire before it spread', 'info');
    return;
  }
  b.fireTimer = FIRE_BURN_SECONDS;
  log(`🔥 Fire! The ${BUILDING_DEFS[b.type].name} is burning`, 'bad');
}

function processFires(s: GameState, dt: number, log: LogFn): void {
  for (const b of [...s.buildings]) {
    if (!b.fireTimer) continue;
    b.fireTimer -= dt;
    if (b.fireTimer <= 0) {
      const name = BUILDING_DEFS[b.type].name;
      const neighbours = adjacentBuildings(s, b);
      removeBuilding(s, b);
      log(`The ${name} burned down`, 'bad');
      for (const n of neighbours) if (Math.random() < FIRE_SPREAD_CHANCE) tryIgnite(s, n, log, false);
    }
  }
}

function adjacentBuildings(s: GameState, b: Building): Building[] {
  const bw = footprintW(b);
  const bh = footprintH(b);
  const out: Building[] = [];
  for (const o of s.buildings) {
    if (o === b || !o.built || isFireproof(o.type) || o.fireTimer) continue;
    if (b.x - 1 < o.x + footprintW(o) && b.x + bw + 1 > o.x && b.y - 1 < o.y + footprintH(o) && b.y + bh + 1 > o.y) out.push(o);
  }
  return out;
}

function removeBuilding(s: GameState, b: Building): void {
  const idx = s.buildings.indexOf(b);
  if (idx >= 0) s.buildings.splice(idx, 1);
  // A demolished house's larder isn't destroyed — the household's supplies go back to the barns
  // (which the residents will then re-fetch to whichever house they move into).
  if (isHouse(b.type)) {
    const at = buildingCenter(b);
    for (const k in b.store) {
      const kind = k as ResourceKind;
      const amount = b.store[kind] ?? 0;
      if (amount > 0) addNearest(s, at, kind, amount);
    }
    b.store = {};
  }
  for (const c of s.citizens) {
    if (c.jobId === b.id) c.jobId = null;
    if (c.homeId === b.id) c.homeId = null;
  }
}

// ---- forest upkeep ----
function regrowForest(s: GameState, dt: number): void {
  const n = s.tiles.length;
  for (let i = 0; i < 40; i++) {
    const idx = (Math.random() * n) | 0;
    const t = s.tiles[idx];
    if (t.type === 'forest' && t.trees < 1) t.trees = Math.min(1, t.trees + TREE_REGROW * dt * 0.02);
  }
}

function circleTiles(s: GameState, b: Building, fn: (t: { trees: number }) => void): void {
  const r = workRadiusOf(b) ?? 4;
  const cx = b.x + footprintW(b) / 2;
  const cy = b.y + footprintH(b) / 2;
  const r2 = r * r;
  for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r); ty++) {
    for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
      const ddx = tx + 0.5 - cx;
      const ddy = ty + 0.5 - cy;
      if (ddx * ddx + ddy * ddy > r2) continue;
      const t = getTile(s.tiles, tx, ty);
      if (t && t.type === 'forest') fn(t);
    }
  }
}

function tendCircle(s: GameState, b: Building, dt: number): void {
  circleTiles(s, b, (t) => {
    if (t.trees < 1) t.trees = Math.min(1, t.trees + TREE_REGROW * dt * 0.5);
  });
}

/** True if any building's footprint covers tile (tx,ty). */
function tileUnderBuilding(s: GameState, tx: number, ty: number): boolean {
  for (const b of s.buildings) {
    if (tx >= b.x && tx < b.x + footprintW(b) && ty >= b.y && ty < b.y + footprintH(b)) return true;
  }
  return false;
}

/** Sow a few saplings on plain grass in the work circle, growing new forest to harvest later. */
function plantCircle(s: GameState, b: Building): void {
  const r = workRadiusOf(b) ?? 4;
  const cx = b.x + footprintW(b) / 2;
  const cy = b.y + footprintH(b) / 2;
  const r2 = r * r;
  let planted = 0;
  for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r) && planted < 2; ty++) {
    for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r) && planted < 2; tx++) {
      const ddx = tx + 0.5 - cx;
      const ddy = ty + 0.5 - cy;
      if (ddx * ddx + ddy * ddy > r2) continue;
      const t = getTile(s.tiles, tx, ty);
      if (!t || t.type !== 'grass' || (t.stone ?? 0) > 0) continue;
      if (tileUnderBuilding(s, tx, ty)) continue;
      t.type = 'forest';
      t.trees = 0.12; // a young sapling; tendCircle grows it toward maturity
      planted++;
      s.forestVersion = (s.forestVersion ?? 0) + 1; // a new forest tile — refresh the render layer
    }
  }
}

function depleteCircleTrees(s: GameState, b: Building, amount: number): void {
  circleTiles(s, b, (t) => {
    if (amount <= 0) return;
    if (t.trees > 0.05) {
      const take = Math.min(amount, t.trees - 0.05);
      t.trees -= take;
      amount -= take;
    }
  });
}

function clampTile(v: number): number {
  return Math.max(0, Math.min(47.5, v));
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
