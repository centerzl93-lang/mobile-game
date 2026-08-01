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
  STARVE_SECONDS,
  STARVE_RECOVERY,
  SEASONS,
  Season,
  BASE_WALK_SPEED,
  carryLimit,
  LARDER_CARRY_VOLUME,
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
  PATH_TUNNEL,
  PATH_TUNNEL_PLAN,
  TUNNEL_WOOD_COST,
  TUNNEL_STONE_COST,
  BRIDGE_WOOD_COST,
  HARVEST_NONE,
  PATH_NONE,
  EVENT_LOG_MAX,
  HARVEST_WOOD,
  HARVEST_STONE,
  HARVEST_IRON,
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
  BIRTH_FOOD_SURPLUS_TARGET,
  isFertile,
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
import { pathSpeedMult, hasPath } from './paths';
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
  unitsThatFit,
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

/**
 * File a message in the village chronicle, newest first, stamped with the current season.
 * Called for every logged message so the scrollback matches what the toasts announced.
 */
export function recordEvent(s: GameState, text: string, kind: LogKind = 'info'): void {
  const events = (s.events ??= []);
  events.unshift({ text, kind, year: s.year, season: s.season });
  if (events.length > EVENT_LOG_MAX) events.length = EVENT_LOG_MAX;
}

// Local balance for the per-trip economy.
const FOREST_CIRCLE_IDEAL = 24;
const WATER_IDEAL = 14; // water tiles in the fishing circle for full yield (circle scales with workers)
const STONE_IDEAL = 6;
/** Extra quarry output when its pit is cut into a rocky mountainside (0.5 = up to +50%). */
const QUARRY_ROCK_BONUS = 0.5;
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
/**
 * Seconds of game time between household settlements. Short enough that finishing a house is
 * followed almost immediately by a couple moving in, long enough that the census work
 * (`rehouseVillagers` walks buildings × citizens a few times) is nowhere near per-tick cost.
 */
const REHOUSE_INTERVAL = 2;

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

  // Settle households on a short cadence, not just at season turnover: a couple with nowhere to
  // live should move into a house as soon as it is finished, and a villager coming of age or
  // widowed shouldn't wait out the rest of the season for the village to notice.
  s.rehouseTimer = (s.rehouseTimer ?? 0) + dt;
  if (s.rehouseTimer >= REHOUSE_INTERVAL) {
    s.rehouseTimer = 0;
    rehouseVillagers(s);
  }

  eat(s, dt, log);

  s.seasonTimer += dt;
  if (s.seasonTimer >= SEASON_LENGTH) {
    s.seasonTimer -= SEASON_LENGTH;
    endSeason(s, log);
  }
}

/**
 * Villagers eat, a little every tick.
 *
 * Food used to be deducted in one lump at the season boundary, which made hunger invisible until
 * it was fatal: the stores looked fine all season, then a quarter of a year's rations vanished in
 * one frame and someone died on the spot. Draining continuously means the larders empty
 * gradually, the household hauler tops them up from the barns as they run down, and a shortage
 * shows up as a falling counter well before anyone is at risk.
 *
 * Each villager eats from their own larder first and only then from the barns. Going without
 * accumulates in `starve` rather than killing outright — a villager has to be unfed for
 * STARVE_SECONDS before they die, so a brief gap while a hauler is walking is survivable and a
 * genuine famine is not.
 */
function eat(s: GameState, dt: number, log: LogFn): void {
  if (s.citizens.length === 0) return;
  const rate = dt / SEASON_LENGTH; // fraction of a season's ration owed this tick
  const homeById = new Map<number, Building>();
  for (const b of s.buildings) if (b.built && isHouse(b.type)) homeById.set(b.id, b);

  const starved: Citizen[] = [];
  for (const c of s.citizens) {
    let need = FOOD_PER_CITIZEN_PER_SEASON * (isAdult(c) ? 1 : CHILD_FOOD_FACTOR) * rate;
    const home = c.homeId !== null ? homeById.get(c.homeId) : undefined;
    if (home) need = takeFoodFromLarder(home, need);
    if (need > 0.000001) need = consumeFood(s, need);
    if (need > 0.000001) {
      c.starve = (c.starve ?? 0) + dt;
      if (c.starve >= STARVE_SECONDS) starved.push(c);
    } else if (c.starve) {
      // Fed again: recover, but not instantly — a villager who nearly starved stays vulnerable.
      c.starve = Math.max(0, c.starve - dt * STARVE_RECOVERY);
    }
  }
  if (starved.length > 0) {
    killFrom(s, starved, starved.length);
    log(`${starved.length} villager${starved.length > 1 ? 's' : ''} starved`, 'bad');
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
  // Homes for anyone without one — newcomers, and anyone whose house burned down or was
  // demolished. Household *shape* (couples, who lives with whom) is settled once a season by
  // `rehouseVillagers`; this only finds a roof for the roofless.
  const houses = s.buildings.filter((b) => b.built && isHouse(b.type));
  const occupancy = () => {
    const occ = new Map<number, number>();
    for (const c of s.citizens) if (c.homeId !== null) occ.set(c.homeId, (occ.get(c.homeId) ?? 0) + 1);
    return occ;
  };
  for (const c of s.citizens) {
    if (c.homeId !== null) continue;
    if (isAdult(c)) {
      // A partner already housed? Move in with them — a couple shares a home.
      const partner = partnerOf(s, c);
      const occ = occupancy();
      if (partner?.homeId != null) {
        const home = houses.find((h) => h.id === partner.homeId);
        if (home && (occ.get(home.id) ?? 0) < houseCapacityOf(home.type)) {
          c.homeId = home.id;
          continue;
        }
      }
      // Otherwise the normal preference order, crowding in as a last resort rather than sleeping out.
      placeAdult(s, c, houses, true);
      continue;
    }
    placeChild(s, c, houses);
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

  // First leg: fetch a load from the barn. Groceries come home by the basket
  // (LARDER_CARRY_VOLUME), not the single work-load a labourer shifts.
  goTo(c, buildingCenter(barn));
  if (stepTo(s, c, dt)) {
    const take = Math.min(carryLimit(want.kind, LARDER_CARRY_VOLUME), want.amount, barn.store[want.kind] ?? 0);
    if (take > 0) {
      barn.store[want.kind] = (barn.store[want.kind] ?? 0) - take;
      if ((barn.store[want.kind] ?? 0) <= 0) delete barn.store[want.kind];
      c.carry = { kind: want.kind, amount: take };
      c.task = { kind: 'toLarder' };
    }
  }
  return true;
}

/**
 * Whether `c` is the resident currently running their household's errands.
 *
 * Idle hands go first: an unemployed laborer is preferred over a builder, and both over someone
 * holding down a job. Picking purely by id would hand the shopping to whoever happened to be
 * lowest-numbered — often a villager staffing a workplace, who then abandons their post for the
 * errand while an idle housemate stands around.
 */
function larderHauler(s: GameState, home: Building, c: Citizen): boolean {
  if (!isAdult(c) || c.sick) return false;
  // 0 = free laborer, 1 = builder, 2 = employed. Lower is a better candidate.
  const rank = (r: Citizen): number => (r.jobId !== null ? 2 : r.builder ? 1 : 0);
  let best: Citizen | null = null;
  for (const r of s.citizens) {
    if (r.homeId !== home.id || !isAdult(r) || r.sick) continue;
    if (!best || rank(r) < rank(best) || (rank(r) === rank(best) && r.id < best.id)) best = r;
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
        const want = Math.min(carryLimit(missing), need - (b.store[missing] ?? 0), barn.store[missing] ?? 0);
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
        const limit = carryLimit(out.kind);
        // Keep working until the load is full, rather than setting off with whatever one cycle
        // produced. A single cycle yields well under a full load, so workers were walking the
        // round trip to the barn with a third of a load — most of a forester's day spent
        // commuting. `pending` accumulates across cycles and only becomes a carry when it is
        // full, at which point the delivery branch above takes over.
        const made = Math.min(limit, out.amount * prod);
        const held = c.pending && c.pending.kind === out.kind ? c.pending.amount : 0;
        const total = Math.min(limit, held + made);
        if (total >= limit - 0.01) {
          c.pending = null;
          c.carry = { kind: out.kind, amount: total };
        } else {
          c.pending = { kind: out.kind, amount: total };
        }
      }
    }
  }
}

/** Market vendor: ferry a bit of every good from barns into the market stall. */
function runVendor(s: GameState, c: Citizen, b: Building, dt: number): void {
  if (c.carry) {
    goTo(c, buildingCenter(b));
    if (stepTo(s, c, dt)) {
      // Free room is volume; how many units that is depends on what is being put down.
      const put = Math.min(c.carry.amount, unitsThatFit(c.carry.kind, barnFree(b)));
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
    const take = Math.min(carryLimit(want.kind), need, want.barn.store[want.kind] ?? 0);
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
      const take = Math.min(carryLimit(k), need, barn.store[k] ?? 0);
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
      const take = Math.min(carryLimit(k), surplus);
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

/**
 * Quarry output multiplier: 1.0 anywhere, rising to 1 + QUARRY_ROCK_BONUS when the pit is cut into
 * a mountainside. Unlike a mine (which must reach a seam in the foothills) a quarry only needs
 * ground, so being inland costs it nothing — it just doesn't get the bonus.
 */
function quarryRichness(s: GameState, b: Building): number {
  const rock = clamp(nearbyStone(s, BUILDING_DEFS[b.type], b.x, b.y) / STONE_IDEAL, 0, 1);
  return 1 + QUARRY_ROCK_BONUS * rock;
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
      // Rock nearby is a *bonus*, not a requirement — a quarry sunk in open ground still works at
      // its base rate. (Using factorStone here would drop an inland quarry to MIN_FACTOR, which
      // would make "buildable anywhere" a lie.)
      return { kind: 'stone', amount: LOAD_MAT * quarryRichness(s, b) * tf };
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
      const take = Math.min(carryLimit(food), have);
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
          const want = Math.min(carryLimit(kind), need, barn.store[kind] ?? 0);
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
      } else if ((t.iron ?? 0) > 0) {
        s.harvest[i] = HARVEST_IRON;
        marked++;
      }
    }
  }
  return marked;
}

/**
 * Tiles whose harvest order is holding up construction: anything inside an unbuilt building's
 * footprint, or under a path the player has drawn.
 *
 * These jump the queue in `pickHarvest`. Without it a villager sent to clear a build site would
 * wander off to whichever marked tree happened to be nearest, and a site could sit blocked
 * indefinitely while its own timber went un-felled — a building the player has paid for and
 * ordered should not wait behind scenery.
 */
function blockingHarvest(s: GameState): Set<number> {
  const out = new Set<number>();
  for (const b of s.buildings) {
    if (b.built) continue;
    const fw = footprintW(b);
    const fh = footprintH(b);
    for (let dy = 0; dy < fh; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        if (!inBounds(tx, ty)) continue;
        const i = tileIndex(tx, ty);
        if (s.harvest[i] !== HARVEST_NONE) out.add(i);
      }
    }
  }
  for (let i = 0; i < s.paths.length; i++) {
    const v = s.paths[i];
    if (v !== PATH_DIRT_PLAN && v !== PATH_STONE_PLAN) continue;
    if (s.harvest[i] !== HARVEST_NONE) out.add(i);
  }
  return out;
}

/**
 * Nearest reachable tile with a live harvest order, or -1. Clears stale (depleted) marks.
 *
 * Tiles that are blocking construction win outright over ordinary marked ground, however far
 * away they are; distance only breaks ties within each class.
 */
export function pickHarvestFor(s: GameState, c: Citizen): number {
  return pickHarvest(s, c);
}

function pickHarvest(s: GameState, c: Citizen): number {
  let best = -1;
  let bestD = Infinity;
  let bestBlocking = false;
  const blocking = blockingHarvest(s);
  for (let i = 0; i < s.harvest.length; i++) {
    const h = s.harvest[i];
    if (h !== HARVEST_WOOD && h !== HARVEST_STONE && h !== HARVEST_IRON) continue;
    const t = s.tiles[i];
    if (h === HARVEST_WOOD && t.trees <= 0.05) { s.harvest[i] = HARVEST_NONE; continue; }
    if (h === HARVEST_STONE && (t.stone ?? 0) <= 0) { s.harvest[i] = HARVEST_NONE; continue; }
    if (h === HARVEST_IRON && (t.iron ?? 0) <= 0) { s.harvest[i] = HARVEST_NONE; continue; }
    const tx = i % MAP_W;
    const ty = (i / MAP_W) | 0;
    if (!reachableTile(c, tx, ty)) continue;
    const d = (tx + 0.5 - c.x) ** 2 + (ty + 0.5 - c.y) ** 2;
    const isBlocking = blocking.has(i);
    if (isBlocking && !bestBlocking) {
      // First blocking tile seen: it beats anything found so far regardless of distance.
      bestBlocking = true;
      bestD = d;
      best = i;
    } else if (isBlocking === bestBlocking && d < bestD) {
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
    const take = Math.min(carryLimit('wood'), woodAvail);
    if (take > 0.01) {
      t.trees = Math.max(0, t.trees - take / HARVEST_WOOD_PER_TREE);
      c.carry = { kind: 'wood', amount: take };
    }
    if (t.trees <= 0.05) {
      t.trees = 0;
      t.type = 'grass'; // clear-cut to open ground
      // A tile can hold trees *and* a surface deposit, but the harvest layer stores one order per
      // tile and wood takes precedence while the trees stand. Once they are down, roll the order
      // straight on to whatever is underneath instead of dropping it — otherwise ore in the woods
      // is silently unharvestable and the player has to notice and re-mark it.
      s.harvest[idx] =
        (t.stone ?? 0) > 0 ? HARVEST_STONE : (t.iron ?? 0) > 0 ? HARVEST_IRON : HARVEST_NONE;
      s.forestVersion = (s.forestVersion ?? 0) + 1; // a forest tile is gone — refresh the render layer
    }
  } else if (s.harvest[idx] === HARVEST_STONE) {
    const avail = t.stone ?? 0;
    const take = Math.min(carryLimit('stone'), avail);
    if (take > 0.01) {
      t.stone = avail - take;
      c.carry = { kind: 'stone', amount: take };
    }
    if ((t.stone ?? 0) <= 0) {
      t.stone = 0;
      s.harvest[idx] = HARVEST_NONE;
    }
  } else if (s.harvest[idx] === HARVEST_IRON) {
    // Surface ore works exactly like loose stone: dug by hand, no mine required.
    const avail = t.iron ?? 0;
    const take = Math.min(carryLimit('iron'), avail);
    if (take > 0.01) {
      t.iron = avail - take;
      c.carry = { kind: 'iron', amount: take };
    }
    if ((t.iron ?? 0) <= 0) {
      t.iron = 0;
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
  // Tiles the player has drawn but not yet confirmed are not work orders yet. Built as a Set
  // because this scans every tile on the map, for every villager, every tick.
  const pending = s.pendingPaths?.length ? new Set(s.pendingPaths) : null;
  for (let i = 0; i < s.paths.length; i++) {
    if (pending?.has(i)) continue;
    const v = s.paths[i];
    const tx = i % MAP_W;
    const ty = (i / MAP_W) | 0;
    let stand: { x: number; y: number } | null = null;
    if (v === PATH_DIRT_PLAN || v === PATH_STONE_PLAN) {
      if (!reachableTile(c, tx, ty)) continue; // stand on the land tile itself
      // Wait for anything growing here to be harvested first. Paving used to delete the trees
      // and deposits it covered, so routing a road through the woods destroyed the timber
      // instead of collecting it. `planPath` queues the order; this waits for it.
      if (s.harvest[i] !== HARVEST_NONE) continue;
      stand = { x: tx + 0.5, y: ty + 0.5 };
    } else if (v === PATH_BRIDGE_PLAN || v === PATH_TUNNEL_PLAN) {
      // Bridges and tunnels are worked from a walkable neighbour — the tile itself is water or
      // solid rock until the moment it is finished.
      stand = adjacentStand(s, c, tx, ty);
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
      if (takeNearest(s, { x: tx, y: ty }, 'stone', 1) >= 1) {
        s.paths[bestIdx] = PATH_STONE;
        clearGroundForPath(s, tx, ty);
      }
    } else if (v === PATH_BRIDGE_PLAN) {
      if (totalStored(s, 'wood') >= BRIDGE_WOOD_COST) {
        takeNearest(s, bestStand, 'wood', BRIDGE_WOOD_COST);
        s.paths[bestIdx] = PATH_BRIDGE;
        s.navVersion = (s.navVersion ?? 0) + 1; // a new bridge changed walkability
      }
    } else if (v === PATH_TUNNEL_PLAN) {
      // Timber to prop the roof and stone to line it — both, or the tile stays unworked.
      if (totalStored(s, 'wood') >= TUNNEL_WOOD_COST && totalStored(s, 'stone') >= TUNNEL_STONE_COST) {
        takeNearest(s, bestStand, 'wood', TUNNEL_WOOD_COST);
        takeNearest(s, bestStand, 'stone', TUNNEL_STONE_COST);
        s.paths[bestIdx] = PATH_TUNNEL;
        s.navVersion = (s.navVersion ?? 0) + 1; // a new tunnel changed walkability
      }
    } else {
      s.paths[bestIdx] = PATH_DIRT;
      clearGroundForPath(s, tx, ty);
    }
  }
  return true;
}

/**
 * Clear a newly laid path tile of trees and loose stone. Paving is what removes them — a wood
 * cannot grow in the road, and `regrowForest`/`plantCircle` won't put one back. The materials
 * aren't destroyed: whoever laid the path hauls them off to the barns.
 */
function clearGroundForPath(s: GameState, tx: number, ty: number): void {
  const t = getTile(s.tiles, tx, ty);
  if (!t) return;
  const at = { x: tx + 0.5, y: ty + 0.5 };
  if (t.type === 'forest') {
    const wood = t.trees * HARVEST_WOOD_PER_TREE;
    t.type = 'grass';
    t.trees = 0;
    s.forestVersion = (s.forestVersion ?? 0) + 1; // the tree layer needs rebuilding
    if (wood > 0.5) addNearest(s, at, 'wood', wood);
  }
  if ((t.stone ?? 0) > 0) {
    addNearest(s, at, 'stone', t.stone!);
    delete t.stone;
  }
  if ((t.iron ?? 0) > 0) {
    addNearest(s, at, 'iron', t.iron!);
    delete t.iron;
  }
  // Any harvest order on the tile is moot now that it is paved.
  s.harvest[tileIndex(tx, ty)] = HARVEST_NONE;
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
    const cameOfAge: Citizen[] = [];
    for (const c of s.citizens) {
      const wasChild = c.age < ADULT_AGE;
      c.age += 1;
      if (wasChild && c.age >= ADULT_AGE) {
        c.educated = schoolStaffed;
        cameOfAge.push(c);
      }
    }
    // New adults leave the family home for a house of their own where one is free. This is what
    // keeps a village growing: without it grown children occupy their parents' house for life, the
    // family home never has room for another child, and the population plateaus at whatever the
    // founding houses held.
    const houses = s.buildings.filter((b) => b.built && isHouse(b.type));
    for (const c of cameOfAge) placeAdult(s, c, houses);
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

  // Food is *not* taken here. Villagers eat continuously (`eat`, called every tick) rather than
  // in one lump at the boundary — a season's worth vanishing from the stores in a single frame
  // is what made a village look comfortable all season and then starve someone the instant it
  // turned over, with no chance to react.
  const shortFood = totalFoodAvailable(s) <= 0 ? 1 : 0;

  // Clothing and firewood are used every season, at a seasonal rate (winter heaviest, summer
  // lightest). Clothing is issued first because being warmly dressed cuts the fuel a villager
  // needs — `c.clothed` is transient, recomputed here each season and never saved.
  const burn = SEASON_BURN[season];
  if (s.citizens.length > 0) {
    const clothEach = CLOTHING_PER_CITIZEN_WINTER * burn;
    const unclothed: Citizen[] = [];
    for (const c of s.citizens) {
      // Out of the household's own press first, then the barns — the same larder-first rule food
      // and fuel follow. It also makes what the renderer draws honest: a villager wears a coat
      // when their home holds clothing, and that is the clothing they are actually issued.
      let need = clothEach;
      const home = homeOf(c);
      if (home && need > 0) {
        const fromLarder = Math.min(need, home.store['clothing'] ?? 0);
        if (fromLarder > 0) {
          takeFromLarder(home, 'clothing', fromLarder);
          need -= fromLarder;
        }
      }
      if (need > 0) need = consume(s, 'clothing', need);
      c.clothed = need <= 0.001;
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

  // Settle households into couples with room to spare before deciding who bears a child.
  rehouseVillagers(s);

  // Reproduction. A household bears a child when three things line up:
  //   1. it is home to a *couple* — a partnered pair who both live here and are both inside the
  //      fertile age window (a pair of housemates who never paired off does not count),
  //   2. it has room under its housing capacity for the child, and
  //   3. the village has more than one season of food banked.
  // The chance then scales with how deep that food surplus runs and with average health and
  // happiness, so a well-fed, content village grows markedly faster than one scraping by.
  //
  // Food counts the larders as well as the barns: households take their supplies home, so a
  // barn-only measure would read as famine in a perfectly comfortable village and stop all births.
  if (s.citizens.length > 0) {
    const seasonsBanked = totalFoodAvailable(s) / (s.citizens.length * FOOD_PER_CITIZEN_PER_SEASON);
    if (seasonsBanked > 1) {
      const surplus = clamp((seasonsBanked - 1) / (BIRTH_FOOD_SURPLUS_TARGET - 1), 0, 1);
      const wellbeing = 0.5 * (avgHealth(s) / 100) + 0.5 * (avgHappiness(s) / 100);
      const chance = BIRTH_CHANCE * (0.35 + 0.65 * surplus) * (0.5 + 0.5 * wellbeing);
      let born = 0;
      for (const h of s.buildings) {
        if (!h.built || !isHouse(h.type)) continue;
        if (residentsOf(s, h).length >= houseCapacityOf(h.type)) continue;
        const couple = householdCouple(s, h);
        if (!couple || !isFertile(couple[0]) || !isFertile(couple[1])) continue;
        if (Math.random() < chance) {
          spawnChild(s, h, couple);
          born++;
        }
      }
      if (born > 0) log(born > 1 ? `${born} children were born` : `A child was born`, 'good');
    }
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

  // Deliberately *not* warned about: couples with no home of their own. A housing shortage is for
  // the player to notice and diagnose — the signs are all there (population stops growing, a
  // villager's sheet shows a partner and no shared home) without the game naming the problem.
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
  // Widow the partner immediately so they can pair again at the next turnover.
  for (const o of s.citizens) if (o.partnerId === c.id) o.partnerId = null;
}

// ---- households ------------------------------------------------------------------------------
// A household is one couple plus their children. Adults pair off, a couple keeps a house to
// themselves wherever housing allows, and the children they bear live with them until they come of
// age and leave to start households of their own. Everything below maintains that shape.

/** Everyone living in `house`. */
function residentsOf(s: GameState, house: Building): Citizen[] {
  return s.citizens.filter((c) => c.homeId === house.id);
}

/** A villager's partner, if they have one who is still alive. */
function partnerOf(s: GameState, c: Citizen): Citizen | null {
  if (c.partnerId == null) return null;
  return s.citizens.find((o) => o.id === c.partnerId) ?? null;
}

/** Drop partnerships whose other half has died, so the widowed can pair again. */
function releaseLostPartners(s: GameState): void {
  const living = new Set(s.citizens.map((c) => c.id));
  for (const c of s.citizens) {
    if (c.partnerId == null) continue;
    const partner = s.citizens.find((o) => o.id === c.partnerId);
    // Also breaks a one-sided link, which a corrupt or hand-edited save could carry.
    if (!partner || !living.has(partner.id) || partner.partnerId !== c.id) c.partnerId = null;
  }
}

/**
 * The couple whose household this is: a partnered pair who both live here. Null when the house
 * holds no established couple yet.
 */
function householdCouple(s: GameState, house: Building): [Citizen, Citizen] | null {
  const adults = residentsOf(s, house).filter(isAdult);
  for (const a of adults) {
    const partner = partnerOf(s, a);
    if (partner && partner.homeId === house.id) return a.sex === 'm' ? [a, partner] : [partner, a];
  }
  return null;
}

/** Occupancy, adults and children per house, recomputed fresh (moves invalidate it). */
function censusHouses(s: GameState): {
  occupancy: Map<number, number>;
  adultsIn: Map<number, Citizen[]>;
  childrenIn: Map<number, number>;
} {
  const occupancy = new Map<number, number>();
  const adultsIn = new Map<number, Citizen[]>();
  const childrenIn = new Map<number, number>();
  for (const o of s.citizens) {
    if (o.homeId === null) continue;
    occupancy.set(o.homeId, (occupancy.get(o.homeId) ?? 0) + 1);
    if (isAdult(o)) adultsIn.set(o.homeId, [...(adultsIn.get(o.homeId) ?? []), o]);
    else childrenIn.set(o.homeId, (childrenIn.get(o.homeId) ?? 0) + 1);
  }
  return { occupancy, adultsIn, childrenIn };
}

/**
 * Move an adult into whichever house best advances the village, in strict preference order:
 *
 *   1. their partner's home, when the partner keeps it alone and there is room — reuniting a
 *      couple always beats claiming new ground;
 *   2. **an empty house** — the household they can actually raise a family in;
 *   3. for someone still single only, a house holding one lone unpartnered non-kin adult of the
 *      opposite sex, so the two of them become a couple;
 *   4. (only when `allowCrowding`) any house with room at all.
 *
 * Empty houses come before joining a lone single deliberately: an adult wants a place of their own
 * to pair up in, and sending a *partnered* villager to move in with some unrelated single would
 * strand two half-households under one roof while both partners live elsewhere. Tier 3 is
 * therefore gated on the mover actually being unpartnered.
 *
 * Tier 4 is off by default and reserved for villagers with nowhere to live at all. Without that
 * restriction a surplus adult in a village with no spare house would shuffle into some other
 * household every season, be surplus there too, and move again forever.
 *
 * Returns true if the villager moved.
 */
function placeAdult(s: GameState, c: Citizen, houses: Building[], allowCrowding = false): boolean {
  const { occupancy, adultsIn } = censusHouses(s);
  const elsewhere = houses.filter((h) => h.id !== c.homeId);
  const hasRoom = (h: Building) => (occupancy.get(h.id) ?? 0) < houseCapacityOf(h.type);
  const partner = partnerOf(s, c);

  const target =
    (partner
      ? elsewhere.find((h) => {
          if (h.id !== partner.homeId || !hasRoom(h)) return false;
          const adults = adultsIn.get(h.id) ?? [];
          return adults.length === 1 && adults[0] === partner;
        })
      : undefined) ??
    elsewhere.find((h) => (occupancy.get(h.id) ?? 0) === 0) ??
    (partner
      ? undefined
      : elsewhere.find((h) => {
          if (!hasRoom(h)) return false;
          const adults = adultsIn.get(h.id) ?? [];
          return (
            adults.length === 1 &&
            adults[0].sex !== c.sex &&
            adults[0].partnerId == null &&
            !areCloseKin(c, adults[0])
          );
        })) ??
    (allowCrowding ? elsewhere.find(hasRoom) : undefined);
  if (!target) return false;
  c.homeId = target.id;
  return true;
}

/**
 * Find a home for a child. A child must always live with at least one adult, so houses with no
 * adult are never candidates — a house full of nothing but children raises nobody, bears nobody,
 * and simply parks a chunk of the village's housing where it can do no good.
 *
 * Preference is a parent's household, then whichever qualifying household has the fewest children,
 * so orphans and founding children spread across the village instead of all piling into whichever
 * house happened to come first in the list.
 *
 * Returns true if the child now has a home.
 */
function placeChild(s: GameState, c: Citizen, houses: Building[]): boolean {
  const { occupancy, adultsIn, childrenIn } = censusHouses(s);
  const eligible = houses.filter(
    (h) =>
      (occupancy.get(h.id) ?? 0) < houseCapacityOf(h.type) && (adultsIn.get(h.id)?.length ?? 0) > 0,
  );
  if (eligible.length === 0) return false;
  const withAParent = eligible.find((h) =>
    s.citizens.some((p) => c.parents?.includes(p.id) && p.homeId === h.id),
  );
  const target =
    withAParent ??
    eligible.reduce((best, h) => ((childrenIn.get(h.id) ?? 0) < (childrenIn.get(best.id) ?? 0) ? h : best));
  if (target.id === c.homeId) return true;
  c.homeId = target.id;
  return true;
}

/**
 * Enforce "every child lives with an adult". Children orphaned by fire or old age, and the founding
 * children who have no recorded parents, can otherwise end up in a house with no grown-up in it —
 * which then never becomes a household and never grows.
 */
function placeChildrenWithAdults(s: GameState, houses: Building[]): void {
  for (const c of s.citizens) {
    if (isAdult(c)) continue;
    if (c.homeId !== null) {
      const hasAdult = s.citizens.some((o) => o.homeId === c.homeId && isAdult(o));
      if (hasAdult) continue; // already in a proper household
    }
    placeChild(s, c, houses);
  }
}

/**
 * Settle households into couples with room to raise a family. Runs once a season, before births.
 *
 * Any adult who is not half of their household's couple moves out if somewhere better exists —
 * a grown child still at home, a spare adult from the founding setup, a widow(er) sharing with
 * another family. Couples are never split: the pair is what defines the household, so a partner is
 * never the one asked to leave. Children are never moved at all; they stay with their parents until
 * they come of age.
 *
 * Relocating leaves a villager's share of the old larder behind; the household they join restocks
 * from the barns, so nothing is lost, it just gets re-fetched.
 */
function rehouseVillagers(s: GameState): void {
  releaseLostPartners(s);
  const houses = s.buildings.filter((b) => b.built && isHouse(b.type));

  // Pair first, so the moves below are made on behalf of couples that already exist, then get
  // those couples under one roof wherever a house allows it.
  //
  // Note this runs even with *no* houses at all — Normal and Hard start that way. Bailing out
  // early here meant nobody paired until the player happened to build, so a village could sit
  // as a crowd of singles with no couples formed and ready to move in.
  formCouples(s, houses);
  houseCouplesTogether(s, houses);

  if (houses.length > 1) {
    const movers: Citizen[] = [];
    for (const h of houses) {
      const adults = residentsOf(s, h).filter(isAdult);
      if (adults.length <= 1) continue;
      const couple = householdCouple(s, h);
      if (couple) {
        // An established couple owns this house; every other adult is a lodger and should leave.
        for (const a of adults) if (a !== couple[0] && a !== couple[1]) movers.push(a);
      } else {
        // No couple living here — keep one man and one woman, move the rest on.
        const keepM = adults.find((a) => a.sex === 'm');
        const keepF = adults.find((a) => a.sex === 'f');
        for (const a of adults) if (a !== keepM && a !== keepF) movers.push(a);
      }
    }
    for (const c of movers) placeAdult(s, c, houses);
    // A lodger who moved into a place of their own can now bring their partner over.
    houseCouplesTogether(s, houses);
  }

  // Last, because every move above can leave children behind: no child is left in a house with no
  // adult in it. Runs even with a single house, hence outside the block.
  placeChildrenWithAdults(s, houses);
}

/**
 * Close family, who never pair with each other: siblings (sharing a parent) and a parent with
 * their own child. Without this, two grown children still living at home — which happens whenever
 * the village has no spare house for them to move into — would pair off with each other.
 */
function areCloseKin(a: Citizen, b: Citizen): boolean {
  if (a.parents && b.parents && a.parents.some((id) => b.parents!.includes(id))) return true;
  return a.parents?.includes(b.id) === true || b.parents?.includes(a.id) === true;
}

/** Unpartnered adults, fertile first then oldest first — a stable, non-random matching order. */
function singleAdults(list: Citizen[]): Citizen[] {
  return list
    .filter((c) => isAdult(c) && c.partnerId == null)
    .sort((a, b) => Number(isFertile(b)) - Number(isFertile(a)) || b.age - a.age);
}

/**
 * Match up the men and women in `pool`, skipping close kin. `limit` caps how many pairs form —
 * one, when matching inside a single house, since a house is home to exactly one household.
 */
function matchWithin(pool: Citizen[], limit = Infinity): number {
  const women = pool.filter((c) => c.sex === 'f');
  let made = 0;
  for (const man of pool) {
    if (made >= limit) break;
    if (man.sex !== 'm' || man.partnerId != null) continue;
    const match = women.find((w) => w.partnerId == null && !areCloseKin(man, w));
    if (!match) continue;
    man.partnerId = match.id;
    match.partnerId = man.id;
    made++;
  }
  return made;
}

/**
 * Pair off unpartnered adults — housemates first, then across the whole village.
 *
 * Pairing deliberately does *not* wait for housing. A couple with nowhere to live still forms; they
 * simply cannot set up a household or bear children until a house is free for them. So the moment
 * the player builds, a waiting couple moves straight in and the village starts growing again —
 * whereas if pairing waited for a vacancy there would be a further season's lag every time.
 *
 * The game says nothing about this; noticing that houses are the bottleneck is left to the player.
 *
 * Close kin are never matched, so grown siblings stuck at home don't pair with each other.
 */
function formCouples(s: GameState, houses: Building[]): void {
  // Housemates first: a pair already under one roof becomes a household immediately. At most one
  // pair per house, and none where a household already lives — otherwise a house holding four
  // singles would form two couples inside it, and the second would have no home of its own.
  for (const h of houses) {
    if (householdCouple(s, h)) continue;
    matchWithin(singleAdults(residentsOf(s, h)), 1);
  }
  // Then everyone still single, wherever they live. These couples have no home together yet.
  matchWithin(singleAdults(s.citizens));
}

/**
 * Move newly formed couples in together where a house allows it: into one partner's home when they
 * live there alone, otherwise into an empty house. A couple is never moved into a house that
 * already has a household — one couple per house holds.
 *
 * Couples with nowhere to go stay paired but apart. They do not bear children (a birth needs the
 * couple resident in the same house), which is exactly the pressure to build.
 */
function houseCouplesTogether(s: GameState, houses: Building[]): void {
  for (const c of s.citizens) {
    if (c.sex !== 'm') continue; // handle each couple once, from the man's side
    const partner = partnerOf(s, c);
    if (!partner || partner.homeId === c.homeId) continue;

    const occupancy = new Map<number, number>();
    const adultsIn = new Map<number, Citizen[]>();
    for (const o of s.citizens) {
      if (o.homeId === null) continue;
      occupancy.set(o.homeId, (occupancy.get(o.homeId) ?? 0) + 1);
      if (isAdult(o)) adultsIn.set(o.homeId, [...(adultsIn.get(o.homeId) ?? []), o]);
    }
    // A home one of them already keeps alone, with room for the other to move in.
    const soleOccupant = (who: Citizen, other: Citizen) => {
      if (who.homeId === null) return undefined;
      const h = houses.find((x) => x.id === who.homeId);
      if (!h) return undefined;
      const adults = adultsIn.get(h.id) ?? [];
      if (adults.length !== 1 || adults[0] !== who) return undefined;
      const incoming = other.homeId === h.id ? 0 : 1;
      return (occupancy.get(h.id) ?? 0) + incoming <= houseCapacityOf(h.type) ? h : undefined;
    };
    const target =
      soleOccupant(c, partner) ??
      soleOccupant(partner, c) ??
      houses.find((h) => (occupancy.get(h.id) ?? 0) === 0 && houseCapacityOf(h.type) >= 2);
    if (!target) continue;
    c.homeId = target.id;
    partner.homeId = target.id;
  }
}

/**
 * Whether this villager is half of a couple that has not got a household of its own — either they
 * live apart, or they share a house whose household is somebody else's. Such a couple cannot bear
 * children (a birth comes from the house's own couple).
 *
 * Used only by the villager's own inspect sheet. The game never announces this: working out that
 * the village has stopped growing for want of houses is left to the player, so the fact is there
 * to be found rather than pushed at them.
 */
export function coupleNeedsAHome(s: GameState, c: Citizen): boolean {
  const partner = partnerOf(s, c);
  if (!partner) return false;
  if (c.homeId === null || partner.homeId !== c.homeId) return true;
  const home = s.buildings.find((b) => b.id === c.homeId);
  if (!home) return true;
  const couple = householdCouple(s, home);
  return !couple || (couple[0].id !== c.id && couple[1].id !== c.id);
}

/** A new child, born to `couple` and raised in their house until they come of age. */
function spawnChild(s: GameState, house: Building, couple: [Citizen, Citizen]): void {
  const at = buildingCenter(house);
  const c = makeCitizen(s, Math.random() < 0.5 ? 'm' : 'f', 0, at.x + (Math.random() - 0.5), at.y + (Math.random() - 0.5));
  c.homeId = house.id;
  c.parents = [couple[0].id, couple[1].id];
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
  // Needs a comfortable surplus. Counts larders too — see the reproduction block.
  if (totalFoodAvailable(s) <= pop * FOOD_PER_CITIZEN_PER_SEASON * 1.5) return;
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
    // Nothing grows back through a path — it is trodden or paved surface.
    if (s.paths[idx] !== PATH_NONE) continue;
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
      if (!t || t.type !== 'grass' || (t.stone ?? 0) > 0 || (t.iron ?? 0) > 0) continue;
      if (tileUnderBuilding(s, tx, ty)) continue;
      if (hasPath(s, tx, ty)) continue; // foresters don't plant saplings in the road
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
