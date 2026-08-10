import {
  GameState,
  Building,
  Tile,
  Citizen,
  ResourceKind,
  BUILDING_DEFS,
  buildWorkOf,
  costOf,
  PolicyId,
  policyCapacity,
  FESTIVAL_FOOD,
  FESTIVAL_HAPPY,
  policyActive,
  activePolicies,
  POLICY_RATION_FOOD,
  POLICY_RATION_HAPPY,
  POLICY_HOURS_PROD,
  POLICY_HOURS_HEALTH,
  POLICY_CONSERVE_REGROW,
  POLICY_CONSERVE_LUMBER,
  POLICY_GATES_IMMIGRATION,
  POLICY_GATES_SICK,
  LedgerRow,
  LEDGER_SEASONS,
  BUILD_WORK_RATE,
  BUILDER_SHIFT_WORK,
  BUILDER_REST_SECONDS,
  drawFromTradeExtra,
  demoWorkOf,
  autoBuilderDemand,
  workRadiusOf,
  MAP_W,
  MAP_H,
  SEASON_LENGTH,
  STARVE_SECONDS,
  STARVE_RECOVERY,
  FREEZE_SECONDS,
  FREEZE_RECOVERY,
  SEASONS,
  Season,
  BASE_WALK_SPEED,
  carryLimit,
  LARDER_CARRY_VOLUME,
  LARDER_KINDS,
  LARDER_URGENT_AT,
  MAX_LARDER_SHOPPERS,
  FOOD_KINDS,
  WORK_SECONDS,
  LEISURE_CHANCE_PER_SEC,
  LEISURE_MIN_SECONDS,
  LEISURE_MAX_SECONDS,
  PATH_DIRT_PLAN,
  PATH_STONE_PLAN,
  PATH_DIRT,
  PATH_STONE,
  PATH_BRIDGE,
  BRIDGE_FIRE_CHANCE,
  BRIDGE_STONE_STONE_COST,
  BRIDGE_STONE_WOOD_COST,
  PATH_BRIDGE_STONE_PLAN,
  PATH_BRIDGE_STONE,
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
  HarvestKind,
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
  MERCHANT_COOLDOWN_SEASONS,
  MERCHANT_ARRIVAL_CHANCE,
  MERCHANT_CATEGORIES,
  MERCHANT_CATEGORY_STOCK,
  MERCHANT_CATEGORY_META,
  DIET_VARIETY_TARGET,
  CHILD_FOOD_FACTOR,
  BIRTH_CHANCE,
  BIRTH_SURPLUS_FLOOR,
  BIRTH_WELLBEING_FLOOR,
  BIRTH_FOOD_SURPLUS_TARGET,
  isFertile,
  entranceTile,
  entranceTiles,
  hasDoor,
  limitedOutput,
  LimitKey,
  LOW_STOCK_FRACTION,
  PER_CITIZEN_SEASON_NEED,
  HUD_RESOURCES,
  LIMIT_META,
  worksIndoors,
  CIRCLE_WORK,
  ADULT_AGE,
  SCHOOL_START_AGE,
  SCHOOL_LEAVING_AGE,
  SCHOOL_YEARS,
  AGE_PER_YEAR,
  SCHOOL_ATTENDANCE,
  YEAR_LENGTH,
  OLD_AGE_START,
  MAX_AGE,
  EDUCATED_BONUS,
  isHouse,
  isShelter,
  isDwelling,
  dwellingCapacityOf,
  SHELTER_HAPPY,
  isWorkplace,
  houseCapacityOf,
  STONE_HOUSE_HEAT_FACTOR,
  HAPPY_TAVERN,
  HAPPY_CHAPEL,
  HAPPY_CEMETERY,
  DEATH_UNREST,
  TAVERN_GRAIN_PER_SEASON,
  IMMIGRATION_CHANCE,
  NOMAD_SURPLUS_SEASONS,
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
  FIRE_SPREAD_ADJACENT,
  FIRE_SPREAD_NEAR,
  STONE_FIRE_FACTOR,
  isStoneBuilt,
  FIRE_BURN_SECONDS,
  MARKET_STOCK_TARGET,
  RESOURCE_KINDS,
  BuildingType,
  SEASON_BURN,
  CLOTHED_HEAT_FACTOR,
  isAdult,
  isFireproof,
} from '../types';
import { TIERS, TIER_META, villageTier } from './tiers';
import { housingCapacity, buildingCenter, makeCitizen } from './state';
import {
  forestInCircle,
  nearbyStone,
  nearbyWater,
  footprintClear,
  razeBuilding,
  clearRubble,
  rubbleEmpty,
} from './buildings';
import { getTile, tileIndex, inBounds, riverColumnX } from './world';
import { pathSpeedMult, hasPath } from './paths';
import { findPath, isWalkable, labelComponents } from './pathfind';
import { rand } from './rng';
import {
  totalStored,
  totalStoredAll,
  totalHeldAll,
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
  larderShortfalls,
  larderFood,
  larderFoodTarget,
  larderTarget,
  takeFromLarder,
  takeFoodFromLarder,
  totalAvailable,
  totalFood,
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
// Two ways to a coat. Wool goes further than hide per unit — a fleece is spun and woven, a hide
// is cut around — but a pen of sheep is the real difference: see `ANIMAL_META`.
const TAILOR_LEATHER_IN = 5, TAILOR_WOOL_IN = 4, TAILOR_OUT = 4;

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
  return reachableFrom(c, tx, ty);
}

/** `reachableTile` for any position, not just a villager's. */
function reachableFrom(p: { x: number; y: number }, tx: number, ty: number): boolean {
  if (!navLabels || !inBounds(tx, ty)) return false;
  const from = navLabels[tileIndex(Math.floor(p.x), Math.floor(p.y))];
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
  // Long Hours rides along with the tool factor because they are the same kind of number: how
  // well a pair of hands is working, as opposed to what the building around them is for. Renamed
  // from `toolFactor` on the way through, since it is no longer only about tools.
  const workFactor = toolFactor * (policyActive(s, 'longHours') ? POLICY_HOURS_PROD : 1);
  for (const c of s.citizens) runCitizen(s, c, dt, workFactor);
  processFires(s, dt, log);
  regrowForest(s, dt);
  updateMerchant(s, dt, log);
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
  heat(s, dt, log);
  lives(s, dt, log);

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
  for (const b of s.buildings) if (b.built && isDwelling(b.type)) homeById.set(b.id, b);

  const starved: Citizen[] = [];
  for (const c of s.citizens) {
    let need =
      FOOD_PER_CITIZEN_PER_SEASON *
      (isAdult(c) ? 1 : CHILD_FOOD_FACTOR) *
      rate *
      (policyActive(s, 'rationing') ? POLICY_RATION_FOOD : 1);
    const home = c.homeId !== null ? homeById.get(c.homeId) : undefined;
    if (home) need = takeFoodFromLarder(s, home, need);
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

/**
 * Households burn fuel, a little every tick, at the rate the current season calls for.
 *
 * Same reasoning as `eat`: a season's heating taken in one lump at the boundary meant a larder
 * that looked comfortable all season lost a third of itself in a single frame, and the drop
 * landed under whichever season had just *begun* rather than the one that had been lived through.
 * Charging it continuously means summer really is cheap hour by hour, winter really is expensive,
 * and the household hauler tops the woodpile up as it runs down instead of chasing a cliff.
 *
 * Three things cut a villager's fuel bill: the season (SEASON_BURN), a warm coat
 * (CLOTHED_HEAT_FACTOR, decided at the season boundary and read here all season), and living
 * behind stone walls (STONE_HOUSE_HEAT_FACTOR) — masonry holds its heat, so a stone house both
 * burns less and keeps a smaller woodpile.
 */
function heat(s: GameState, dt: number, log: LogFn): void {
  if (s.citizens.length === 0) return;
  const season = SEASONS[s.season];
  const rate = (dt / SEASON_LENGTH) * SEASON_BURN[season]; // fraction of a winter's heating owed
  const homeById = new Map<number, Building>();
  for (const b of s.buildings) if (b.built && isDwelling(b.type)) homeById.set(b.id, b);

  const froze: Citizen[] = [];
  for (const c of s.citizens) {
    const home = c.homeId !== null ? homeById.get(c.homeId) : undefined;
    const stoneFactor = home?.type === 'stonehouse' ? STONE_HOUSE_HEAT_FACTOR : 1;
    const clothFactor = c.clothed ? CLOTHED_HEAT_FACTOR : 1;
    let need = HEAT_PER_CITIZEN_WINTER * rate * stoneFactor * clothFactor; // heat units
    // Fuel is burned where it is kept: in the hearth of the house the villager lives in. A housed
    // villager has no fall-back to the village fuel pile — a barn is a woodshed, not a fire, and
    // letting everyone draw on it directly meant the stockpile drained on its own while the houses
    // it was meant to supply stood cold. Carrying wood home is the only way a household spends it,
    // so a well-stocked barn beside an unstocked house keeps nobody warm.
    //
    // Someone with *no* house is the exception, and has to be: they have nowhere to keep fuel, so
    // the rule would mean they can never have a fire at all. Normal and Hard start every villager
    // roofless — that is the whole difficulty — and without this they all freeze in the first
    // winter beside a full woodpile, with the village wiped out before a single house is up. They
    // camp round the village pile instead until somebody roofs them.
    if (home) {
      for (const [kind, heat] of [['firewood', FIREWOOD_HEAT], ['coal', COAL_HEAT]] as const) {
        if (need <= 0.000001) break;
        const fromLarder = Math.min(need / heat, home.store[kind] ?? 0);
        if (fromLarder > 0) {
          takeFromLarder(s, home, kind, fromLarder);
          need -= fromLarder * heat;
        }
      }
    } else if (need > 0.000001) {
      need = consume(s, 'firewood', need / FIREWOOD_HEAT) * FIREWOOD_HEAT;
      if (need > 0.000001) need = consume(s, 'coal', need / COAL_HEAT) * COAL_HEAT;
    }
    // Only winter kills. Going short of fuel in summer is uncomfortable, not fatal, and an
    // unheated villager has to stay unheated for FREEZE_SECONDS before they die — a gap while a
    // hauler is walking is survivable, a genuine fuel crisis is not.
    if (need > 0.000001 && season === 'Winter') {
      c.chill = (c.chill ?? 0) + dt;
      if (c.chill >= FREEZE_SECONDS) froze.push(c);
    } else if (c.chill) {
      c.chill = Math.max(0, c.chill - dt * FREEZE_RECOVERY);
    }
  }
  if (froze.length > 0) {
    killFrom(s, froze, froze.length);
    log(`${froze.length} villager${froze.length > 1 ? 's' : ''} froze in the cold`, 'bad');
  }
}

/** How many workers a building should be holding: the player's setting, capped by the job count. */
function staffWanted(s: GameState, b: Building): number {
  if (!b.built) return 0;
  return Math.min(BUILDING_DEFS[b.type].jobs, b.desiredWorkers);
}

/** What the village has stored of whatever a limit is set on — food being every edible kind. */
export function limitStock(s: GameState, key: LimitKey): number {
  return key === 'food' ? totalFood(s) : totalStored(s, key);
}

/** Has this stock reached the limit the player set on it? No limit set is never "at" one. */
export function atLimit(s: GameState, key: LimitKey): boolean {
  const cap = s.limits?.[key] ?? 0;
  return cap > 0 && limitStock(s, key) >= cap;
}

/**
 * How little of this the village must hold before it counts as running low.
 *
 * The higher of a share of its own cap (`LOW_STOCK_FRACTION`) and what the population gets through
 * in a season (`PER_CITIZEN_SEASON_NEED`), so the rule reads the same for every resource while
 * still meaning something for the ones that are actually eaten and burned.
 */
export function lowStockMark(s: GameState, key: LimitKey): number {
  const byCap = (s.limits?.[key] ?? 0) * LOW_STOCK_FRACTION;
  const byNeed = s.citizens.length * (PER_CITIZEN_SEASON_NEED[key] ?? 0);
  return Math.max(byCap, byNeed);
}

/**
 * Is the village running low on this?
 *
 * Deliberately counts only what is **free in the barns and markets** (`limitStock`), not what
 * households have already carried home. A larder is spoken for — it is that family's winter, not
 * stock the village can build with, trade away or send to anyone else — so a store that reads
 * healthy only because it is sitting in people's houses is exactly the case worth warning about.
 */
export function isLowStock(s: GameState, key: LimitKey): boolean {
  const mark = lowStockMark(s, key);
  return mark > 0 && limitStock(s, key) < mark && !atLimit(s, key);
}

/**
 * Is this workplace's product at or over the limit the player set for it?
 *
 * A capped workplace keeps its workers — they stay on its books and are not offered to anything
 * else — but they spend the time labouring instead: hauling, clearing marked ground, laying the
 * roads that have been drawn. The moment the stock falls back under the cap they pick their trade
 * straight back up, with nobody needing to re-staff anything.
 */
export function cappedOut(s: GameState, b: Building): boolean {
  const key = limitedOutput(b);
  return !!key && atLimit(s, key);
}

// ---- lives (ageing, schooling, old age, births) ----

/** How often births are considered, in seconds. See `GameState.birthTimer`. */
const BIRTH_INTERVAL = 5;

/**
 * Convert a probability quoted over one span of time into the equivalent over another.
 *
 * A 40% chance per year is *not* four 40% chances per season, and it is certainly not 0.4 × dt.
 * `1 - (1 - p) ^ (part / whole)` is the figure that leaves the odds over the original span exactly
 * as they were, which is what lets these rolls move from the season boundary to a tick without
 * quietly retuning the game.
 */
function chanceOver(p: number, part: number, whole: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 1 - Math.pow(1 - p, part / whole);
}

/**
 * Villagers get older, go to school, come of age, grow old and are born — a little every tick.
 *
 * All of this used to land in one lump at the turn of the year: the whole village had a birthday
 * together, every child who was going to grow up did so in the same frame, every elder who was
 * going to die died in that frame, and every household that was going to bear a child bore it
 * then. A village therefore stood completely still for four seasons and lurched once. Spreading it
 * over the ticks costs nothing and means a birthday, a child or a funeral can fall on any day.
 *
 * The odds are preserved rather than re-tuned: `chanceOver` restates each roll's probability for
 * the shorter span, so a year of play still carries the same expected number of births and deaths
 * as the single yearly roll it replaces.
 */
function lives(s: GameState, dt: number, log: LogFn): void {
  if (s.citizens.length === 0) return;
  const schoolStaffed = s.buildings.some((b) => b.built && b.type === 'school' && b.workers.length > 0);
  const years = dt / YEAR_LENGTH;

  const cameOfAge: Citizen[] = [];
  const dying: Citizen[] = [];
  for (const c of s.citizens) {
    const wasChild = !isAdult(c);
    c.age += years * AGE_PER_YEAR;
    if (wasChild) {
      // Enrolment, and the one place adulthood is not a fixed age. A child at a staffed school
      // keeps growing up to `SCHOOL_LEAVING_AGE`; one without goes to work at `ADULT_AGE`.
      const canAttend = schoolStaffed && c.age >= SCHOOL_START_AGE && c.age < SCHOOL_LEAVING_AGE;
      if (c.student || c.age < ADULT_AGE) {
        // Already enrolled, or still young enough to enrol. A school that loses its teacher turns
        // its pupils back into children — and any of them already past `ADULT_AGE` go straight to
        // work below, with whatever schooling they managed to sit.
        c.student = canAttend;
      }
      // Past `ADULT_AGE` with no school to be at: that childhood is over and cannot be extended
      // by a school built afterwards.
      if (c.student) c.schooling = (c.schooling ?? 0) + dt;
      const leavingAge = c.student ? SCHOOL_LEAVING_AGE : ADULT_AGE;
      if (c.age >= leavingAge) {
        c.educated = (c.schooling ?? 0) >= YEAR_LENGTH * SCHOOL_YEARS * SCHOOL_ATTENDANCE;
        c.student = false;
        cameOfAge.push(c);
      }
      continue;
    }
    // Old age: past OLD_AGE_START the yearly odds of dying climb toward certain at MAX_AGE, and
    // climb faster for the unwell.
    if (c.age < OLD_AGE_START) continue;
    const base = clamp((c.age - OLD_AGE_START) / (MAX_AGE - OLD_AGE_START), 0, 1);
    const perYear = Math.min(1, base * (1 + (1 - c.health / 100)));
    if (rand(s) < chanceOver(perYear, dt, YEAR_LENGTH)) dying.push(c);
  }

  // New adults leave the family home for a house of their own where one is free. This is what
  // keeps a village growing: without it grown children occupy their parents' house for life, the
  // family home never has room for another child, and the population plateaus at whatever the
  // founding houses held.
  if (cameOfAge.length > 0) {
    const houses = s.buildings.filter((b) => b.built && !b.demolish && isHouse(b.type));
    for (const c of cameOfAge) placeAdult(s, c, houses);
  }
  if (dying.length > 0) {
    for (const c of dying) removeCitizen(s, c);
    s.seasonDeaths = (s.seasonDeaths ?? 0) + dying.length;
    log(`${dying.length} elder${dying.length > 1 ? 's' : ''} died of old age`, 'info');
  }

  s.birthTimer = (s.birthTimer ?? 0) + dt;
  if (s.birthTimer >= BIRTH_INTERVAL) {
    births(s, s.birthTimer, log);
    s.birthTimer = 0;
  }

  if (s.citizens.length === 0) {
    s.gameOver = true;
    log('Your village has died out.', 'bad');
  }
}

/**
 * Reproduction. A household bears a child when three things line up:
 *   1. it is home to a *couple* — a partnered pair who both live here and are both inside the
 *      fertile age window (a pair of housemates who never paired off does not count),
 *   2. it has room under its housing capacity for the child, and
 *   3. the village has more than one season of food banked.
 * The chance then scales with how deep that food surplus runs and with average health and
 * happiness, so a well-fed, content village grows markedly faster than one scraping by.
 *
 * Food counts the larders as well as the barns: households take their supplies home, so a
 * barn-only measure would read as famine in a perfectly comfortable village and stop all births.
 *
 * `elapsed` is the span this roll covers — `BIRTH_CHANCE` is quoted per season and restated for it.
 */
function births(s: GameState, elapsed: number, log: LogFn): void {
  const seasonsBanked = totalFoodAvailable(s) / (s.citizens.length * FOOD_PER_CITIZEN_PER_SEASON);
  if (seasonsBanked <= 1) return;
  const surplus = clamp((seasonsBanked - 1) / (BIRTH_FOOD_SURPLUS_TARGET - 1), 0, 1);
  const wellbeing = 0.5 * (avgHealth(s) / 100) + 0.5 * (avgHappiness(s) / 100);
  const perSeason =
    BIRTH_CHANCE *
    (BIRTH_SURPLUS_FLOOR + (1 - BIRTH_SURPLUS_FLOOR) * surplus) *
    (BIRTH_WELLBEING_FLOOR + (1 - BIRTH_WELLBEING_FLOOR) * wellbeing);
  const chance = chanceOver(perSeason, elapsed, SEASON_LENGTH);
  let born = 0;
  for (const h of s.buildings) {
    if (!h.built || !isHouse(h.type)) continue;
    if (residentsOf(s, h).length >= houseCapacityOf(h.type)) continue;
    const couple = householdCouple(s, h);
    if (!couple || !isFertile(couple[0]) || !isFertile(couple[1])) continue;
    if (rand(s) < chance) {
      spawnChild(s, h, couple);
      born++;
    }
  }
  if (born > 0) log(born > 1 ? `${born} children were born` : `A child was born`, 'good');
}

// ---- jobs ----
/** Adults not currently holding a workplace job — the pool builders and laborers come from. */
function countFreeAdults(s: GameState): number {
  const employed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) employed.add(id);
  let n = 0;
  for (const c of s.citizens) if (isAdult(c) && !employed.has(c.id)) n++;
  return n;
}

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
  // A condemned house is not somewhere to move anyone into: its residents are about to be turned
  // out as it is. It keeps the ones it already has until the walls come down.
  const houses = s.buildings.filter((b) => b.built && !b.demolish && isHouse(b.type));
  const shelters = s.buildings.filter((b) => b.built && !b.demolish && isShelter(b.type));
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
      // Otherwise the normal preference order, crowding in as a last resort rather than sleeping
      // out — and a bunk in the boarding house behind even that.
      if (!placeAdult(s, c, houses, true)) placeInShelter(s, c, shelters);
      continue;
    }
    if (!placeChild(s, c, houses)) placeInShelter(s, c, shelters);
  }

  const byId = new Map(s.citizens.map((c) => [c.id, c]));
  for (const b of s.buildings) {
    const target = staffWanted(s, b);
    while (b.workers.length > target) {
      const id = b.workers.pop()!;
      const c = byId.get(id);
      if (c) c.jobId = null;
    }
  }
  // How many builders the village wants: what the outstanding work is asking for — sites to raise
  // and roads to lay — plus whatever the player has dialled on top (or taken off). Derived every
  // tick rather than nudged up and down on each placement, so it cannot fall out of step with the
  // work actually outstanding.
  const adults = s.citizens.reduce((n, c) => n + (isAdult(c) ? 1 : 0), 0);
  s.desiredBuilders = Math.max(0, Math.min(adults, autoBuilderDemand(s) + (s.builderExtra ?? 0)));

  // If the workplaces have already taken everyone, hand some back. Trimming above only releases
  // workers the player has dialled *down*; without this a village that filled every job before
  // the work was ordered can never staff it — the road is drawn, the site is pegged out, and
  // nobody is ever free again. Later workplaces give up their staff first, so the oldest and
  // usually most-established ones keep running.
  let shortfall = s.desiredBuilders - countFreeAdults(s);
  for (let bi = s.buildings.length - 1; bi >= 0 && shortfall > 0; bi--) {
    const b = s.buildings[bi];
    while (b.workers.length > 0 && shortfall > 0) {
      const c = byId.get(b.workers.pop()!);
      if (c) c.jobId = null;
      shortfall--;
    }
  }

  const employed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) employed.add(id);
  // Only adults can be hired.
  const avail = s.citizens.filter((c) => !employed.has(c.id) && isAdult(c));
  // Outstanding work is held back from the hiring pool before the workplaces pick it over.
  //
  // Workplaces used to take everyone and builders got whatever was left, which was fine while a
  // new building started unstaffed and the player left slack by hand. Now that a finished
  // workplace can hire itself up to its cap, "whatever was left" is routinely nobody — and a
  // village with no builders never raises another building, never lays a road, and never notices
  // it has stopped. Reserving the builders first means the work the player has actually ordered
  // always has hands on it; when nothing is outstanding the reserve is zero and every job fills.
  const hireable = Math.max(0, avail.length - s.desiredBuilders);
  let i = 0;
  for (const b of s.buildings) {
    if (!b.built) continue;
    const target = staffWanted(s, b);
    while (b.workers.length < target && i < hireable) {
      const c = avail[i++];
      b.workers.push(c.id);
      c.jobId = b.id;
    }
  }
  const stillEmployed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) stillEmployed.add(id);
  for (const c of s.citizens) if (!stillEmployed.has(c.id)) c.jobId = null;

  // Builders are a global job (no building): tag the first N free adults as builders so only they
  // construct work buildings. Everyone else — employed, children, and surplus laborers — is not.
  const wantBuilders = s.desiredBuilders;
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
function buildingApproach(
  s: GameState,
  b: Building,
  from?: { x: number; y: number },
): { x: number; y: number } {
  // The door first: a finished building is walked around, not through, and this is the tile
  // placement guaranteed would stay clear. A barn has one at each end, so `from` — whoever is
  // walking there — picks the near one; without it the front door is the answer, which is what
  // every placement and layout check wants.
  if (hasDoor(b.type)) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    let bestReach = false;
    for (const e of entranceTiles(b)) {
      if (!isWalkable(s, e.x, e.y)) continue;
      const p = { x: e.x + 0.5, y: e.y + 0.5 };
      if (!from) return p;
      // A door you can *get to* beats a nearer one you cannot, however much nearer it is.
      // Choosing on distance alone sent every household north of a barn to the door on the far
      // side of it — walkable grass with no route to it — where they queued for good while the
      // barn stood full and the village starved and froze around them.
      const reach = reachableFrom(from, e.x, e.y);
      const d = (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
      if (!best || (reach && !bestReach) || (reach === bestReach && d < bestD)) {
        bestD = d;
        bestReach = reach;
        best = p;
      }
    }
    if (best) return best;
  }
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

/**
 * Step a villager out of a wall.
 *
 * A finished building blocks its tiles, and a villager can end up inside one either by standing on
 * a site as it is completed or by being spawned there. Left alone they are stuck for good: their
 * own tile has no connectivity label, so `reachableTile` refuses every destination and they never
 * pick up work again. Nudging them to the nearest open tile costs one visible half-step and is
 * cheap to check — the common case is a single array lookup.
 */
function stepOutOfWalls(s: GameState, c: Citizen): void {
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  if (isWalkable(s, cx, cy)) return;
  for (let r = 1; r <= 4; r++) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isWalkable(s, cx + dx, cy + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { x: cx + dx + 0.5, y: cy + dy + 0.5 }; }
      }
    }
    if (best) {
      c.x = best.x;
      c.y = best.y;
      c.route = undefined; // the cached route started from inside the wall
      return;
    }
  }
}

// ---- per-citizen behaviour ----
function runCitizen(s: GameState, c: Citizen, dt: number, workFactor: number): void {
  stepOutOfWalls(s, c);
  // Out of the building unless this tick puts them back at their bench, so a worker who breaks off
  // to haul, shop or rest reappears rather than staying invisible on the doorstep.
  c.inside = false;
  if (!isAdult(c) || c.sick) {
    wander(s, c, dt); // children play; the sick rest — neither can work or haul
    return;
  }
  // A house that is nearly out of food or fuel outranks a night at the tavern, and cuts a break
  // already under way short. Nothing else interrupts leisure — this is the one thing that should.
  const urgent = homeNeedsStocking(s, c);
  if (urgent) c.rest = 0;
  // Villagers don't toil non-stop — every so often an adult takes a break (never mid-haul, so no
  // load is stranded) to visit a tavern/chapel or head home before returning to work.
  if ((c.rest ?? 0) > 0) {
    leisure(s, c, dt);
    return;
  }
  if (!urgent && !c.carry && rand(s) < dt * LEISURE_CHANCE_PER_SEC) {
    c.rest = LEISURE_MIN_SECONDS + rand(s) * (LEISURE_MAX_SECONDS - LEISURE_MIN_SECONDS);
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
    // The village has all it wants of what this place makes, so its workers turn their hand to
    // labouring until it needs some more. They keep the job — nothing else can hire them and they
    // resume the moment the stock drops — they simply do not stand at a bench making more of it.
    // A load already in hand is still delivered first, which `runWorker` handles.
    if (!c.carry && cappedOut(s, job)) {
      runBuilder(s, c, dt);
      return;
    }
    runWorker(s, c, job, dt, workFactor);
  } else runBuilder(s, c, dt);
}

/**
 * The household's designated shopper. A resident tops their own house's larder up from the barns:
 * walk to a barn holding what is short, take a load, carry it home, stock it.
 *
 * *Any* free adult of the house may go (`larderHauler`), rather than one villager holding the job
 * for good. The fixed designation was a village-killer: it went to the best-ranked resident, and
 * the best-ranked resident is an unemployed laborer — who is exactly the villager a construction
 * site keeps permanently loaded with materials. A shopper who is always carrying never shops, and
 * because they still held the designation nobody else could either, so every household but one
 * went cold with the barns full. Whoever is free goes instead, and the household stays fed.
 *
 * How many may go at once scales with how short the house is: a routine top-up sends one, so a
 * household never pulls its whole workforce off the job, while a larder near empty sends everyone
 * free. Because consumption happens in one lump at season turnover, that means a burst of trips
 * after each season and then back to work.
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
    goTo(c, buildingApproach(s, home, c));
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
  // Housemates out at the same time fetch *different* things. Which one this villager gets is
  // their position in the household against the ranked list of gaps — no shared claim to go stale
  // and deadlock, and no state to keep: two residents of a house with an empty pantry and an empty
  // woodpile come back with one of each. Sending both for food (the first gap on the list) is what
  // froze large households solid, because a big household eats a basket the moment it lands.
  const wants = larderShortfalls(s, home);
  if (wants.length === 0) return false;
  const mates = s.citizens.filter((r) => r.homeId === home.id && isAdult(r) && !r.sick);
  const slot = Math.max(0, mates.findIndex((r) => r.id === c.id));
  const want = wants[slot % wants.length];
  const barn = nearestBarnOnlyWith(s, buildingCenter(home), want.kind);
  if (!barn) return false;

  // First leg: fetch a load from the barn. Groceries come home by the basket
  // (LARDER_CARRY_VOLUME), not the single work-load a labourer shifts.
  goTo(c, buildingApproach(s, barn, c));
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
 * Whether `c` may set off on their household's errands this tick.
 *
 * Any adult of the house can go. What is rationed is how many go *at once*: a household that is
 * merely topping up sends one villager and the rest stay at work, and one that is nearly out sends
 * everybody who is free. `larderUrgency` is that dial.
 *
 * This deliberately does not pick a single villager and stick with them. Doing so cost the village
 * its life — see `stockLarder`. Whoever is free and closest to hand goes, and if the one who set
 * off gets tied up, the next free housemate picks the errand up on the following tick.
 */
function larderHauler(s: GameState, home: Building, c: Citizen): boolean {
  if (!isAdult(c) || c.sick) return false;
  const allowed = larderUrgency(s, home) === 'low' ? MAX_LARDER_SHOPPERS : 1;
  let going = 0;
  for (const r of s.citizens) {
    if (r.id === c.id || r.homeId !== home.id) continue;
    if (r.task.kind === 'toLarder') going++;
  }
  return going < allowed;
}

/**
 * How badly a household needs a trip to the barn: 'low' once a larder has fallen to
 * `LARDER_URGENT_AT` of what it should hold, 'ok' otherwise.
 *
 * Drives two things — how many residents may shop at once, and whether the errand outranks paid
 * work and a leisure break. A village whose houses are nearly empty going into winter cannot
 * afford anyone standing at a bench or sitting in the tavern.
 */
function larderUrgency(s: GameState, home: Building): 'ok' | 'low' {
  if (larderFood(home) < larderFoodTarget(s, home) * LARDER_URGENT_AT) return 'low';
  for (const kind of LARDER_KINDS) {
    const target = larderTarget(s, home, kind);
    if (target > 0.5 && (home.store[kind] ?? 0) < target * LARDER_URGENT_AT) return 'low';
  }
  return 'ok';
}

/** Whether this villager's own household is running short — checked before work and before rest. */
function homeNeedsStocking(s: GameState, c: Citizen): boolean {
  if (c.homeId === null || c.carry) return false;
  const home = s.buildings.find((b) => b.id === c.homeId);
  if (!home || !home.built) return false;
  return larderUrgency(s, home) === 'low' && larderShortfall(s, home) !== null;
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
      const p = buildingApproach(s, b, c);
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
      return b.recipe === 'wool' ? [['wool', TAILOR_WOOL_IN]] : [['leather', TAILOR_LEATHER_IN]];
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

function runWorker(s: GameState, c: Citizen, b: Building, dt: number, workFactor: number): void {
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
      goTo(c, buildingApproach(s, b, c));
      stepTo(s, c, dt);
      return;
    }
    goTo(c, buildingApproach(s, barn, c));
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
      goTo(c, buildingApproach(s, b, c)); // wait at the shop
      stepTo(s, c, dt);
      c.timer = 0;
      return;
    }
    const barn = nearestBarnWith(s, buildingCenter(b), missing);
    if (barn) {
      goTo(c, buildingApproach(s, barn, c));
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

  // 3. Go where the work actually is, and on completion fill carry with a produced load.
  //
  // For most trades that is the building itself — and for the indoor ones, inside it. For a
  // forester, gatherer, hunter or herbalist it is a tile out in their work circle: the tree they
  // are felling or the patch they are foraging, held in `c.workAt` for the length of the cycle so
  // they walk to one place and stay there.
  const spot = workSpot(s, c, b);
  goTo(c, spot);
  if (stepTo(s, c, dt)) {
    c.inside = worksIndoors(b.type);
    c.timer += dt;
    if (c.timer >= WORK_SECONDS) {
      c.timer = 0;
      const out = workOutput(s, b, dt, workFactor, c);
      c.workAt = undefined; // next cycle picks somewhere new
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
          // The load is made up, so they are on their way out with it rather than still at the
          // bench. Without this they stay flagged indoors for the tick that fills the carry — a
          // villager who is both inside and holding a load, which the renderer draws as nobody at
          // all. It was always possible and always a one-tick blink; it simply got likelier once
          // workers stopped breaking off so often.
          c.inside = false;
        } else {
          c.pending = { kind: out.kind, amount: total };
        }
      }
    }
  }
}

/**
 * Where this villager stands to do a cycle of their job.
 *
 * Most trades are done at the building — and `stepTo` arriving there is what sets `c.inside` for
 * the ones done under a roof. The circle trades are the exception: their work is out among the
 * trees, so they pick a tile, walk to it, and hold it in `c.workAt` until the cycle completes.
 *
 * A forester takes rock and ore out of his circle before he takes wood, because every deposit
 * cleared is another tile that can be planted. Everyone else simply works wherever the yield is —
 * standing timber for a gatherer or a hunter, and failing that anywhere in the circle at all, so a
 * worked-out wood still has its people walking it rather than queueing at the door.
 */
export function debugWorkSpotFor(s: GameState, c: Citizen, b: Building): { x: number; y: number } {
  return workSpot(s, c, b);
}

/**
 * Debug/testing helper: could someone standing at `from` walk to this tile?
 *
 * The connectivity labels are rebuilt here rather than assumed, so a test can ask the question
 * before it has advanced the clock even once.
 */
export function debugReachable(
  s: GameState,
  from: { x: number; y: number },
  tx: number,
  ty: number,
): boolean {
  ensureNavLabels(s);
  return reachableFrom(from, tx, ty);
}

/** Debug/testing helper: the tile someone standing at `from` would walk to for `b`. */
export function debugApproach(
  s: GameState,
  b: Building,
  from?: { x: number; y: number },
): { x: number; y: number } {
  return buildingApproach(s, b, from);
}

function workSpot(s: GameState, c: Citizen, b: Building): { x: number; y: number } {
  if (!CIRCLE_WORK.includes(b.type)) return buildingApproach(s, b, c);
  if (c.workAt && reachableTile(c, Math.floor(c.workAt.x), Math.floor(c.workAt.y))) return c.workAt;

  const pickFrom = (pred: (t: Tile, tx: number, ty: number) => boolean): { x: number; y: number } | null => {
    for (const [tx, ty] of scatteredCircleSpots(s, b, pred)) {
      if (!isWalkable(s, tx, ty) || !reachableTile(c, tx, ty)) continue;
      return { x: tx + 0.5, y: ty + 0.5 };
    }
    return null;
  };

  let spot: { x: number; y: number } | null = null;
  if (b.type === 'lumberyard') {
    spot = pickFrom((t) => (t.stone ?? 0) > 0 || (t.iron ?? 0) > 0);
  }
  spot ??= pickFrom((t) => t.type === 'forest' && t.trees > 0.05);
  spot ??= pickFrom(() => true);
  c.workAt = spot ?? buildingApproach(s, b, c);
  return c.workAt;
}

/**
 * A household inside the market's circle that the stall can supply, and what to take them.
 *
 * First match rather than nearest: a household drops out of the search the moment its larder is
 * back over `LARDER_RESTOCK_AT`, so service rotates on its own and the scan can stop at the first
 * hit instead of measuring every home in the circle on every tick.
 *
 * `larderShortfall` answers with what the *village* can supply, which is not always what is on
 * this stall's shelves. If the named good is not here, food falls back to whatever food the market
 * does hold — a household short of bread will take apples — and anything else is left for the
 * restocking leg to fetch in from a barn.
 */
function marketErrand(
  s: GameState,
  b: Building,
): { house: Building; kind: ResourceKind; amount: number } | null {
  const r = workRadiusOf(b) ?? 0;
  if (r <= 0) return null;
  const centre = buildingCenter(b);
  for (const h of s.buildings) {
    if (!h.built || !isDwelling(h.type)) continue;
    const hc = buildingCenter(h);
    if ((hc.x - centre.x) ** 2 + (hc.y - centre.y) ** 2 > r * r) continue;
    const want = larderShortfall(s, h);
    if (!want) continue;
    let kind = want.kind;
    if ((b.store[kind] ?? 0) <= 0) {
      if (!FOOD_KINDS.includes(kind)) continue;
      let alt: ResourceKind | null = null;
      for (const k of FOOD_KINDS) if ((b.store[k] ?? 0) > (alt ? (b.store[alt] ?? 0) : 0)) alt = k;
      if (!alt) continue;
      kind = alt;
    }
    return { house: h, kind, amount: want.amount };
  }
  return null;
}

/**
 * Market vendor: carry groceries out to the homes in the circle, and keep the stall stocked from
 * the barns so there is something to carry.
 *
 * Delivery comes first. A market that only held goods was a shortcut for households doing their
 * own shopping; a market that *delivers* is the reason to build one — every home inside the circle
 * stops sending a worker off to queue at a barn, and the further the circle reaches (two vendors
 * take it to `MARKET_RADIUS` + 2 per extra worker) the more of the village that covers.
 */
function runVendor(s: GameState, c: Citizen, b: Building, dt: number): void {
  // Second leg of a delivery: groceries in hand, walking them to the door.
  if (c.task.kind === 'toHouse' && c.carry) {
    const house = s.buildings.find((h) => h.id === c.task.targetId);
    if (house?.built) {
      goTo(c, buildingApproach(s, house, c));
      if (stepTo(s, c, dt)) {
        house.store[c.carry.kind] = (house.store[c.carry.kind] ?? 0) + c.carry.amount;
        c.carry = null;
        c.task = { kind: 'idle' };
      }
      return;
    }
    c.task = { kind: 'idle' }; // house gone mid-errand — the load goes back on the shelf below
  }
  if (c.carry) {
    goTo(c, buildingApproach(s, b, c));
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
  // Groceries for a household inside the circle: load up at the stall, walk them to the door.
  const errand = marketErrand(s, b);
  if (errand) {
    goTo(c, buildingApproach(s, b, c));
    if (stepTo(s, c, dt)) {
      const take = Math.min(
        carryLimit(errand.kind, LARDER_CARRY_VOLUME),
        errand.amount,
        b.store[errand.kind] ?? 0,
      );
      if (take > 0) {
        b.store[errand.kind] = (b.store[errand.kind] ?? 0) - take;
        if ((b.store[errand.kind] ?? 0) <= 0) delete b.store[errand.kind];
        c.carry = { kind: errand.kind, amount: take };
        c.task = { kind: 'toHouse', targetId: errand.house.id };
      }
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
    goTo(c, buildingApproach(s, b, c));
    stepTo(s, c, dt);
    return;
  }
  goTo(c, buildingApproach(s, want.barn, c));
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
  goTo(c, buildingApproach(s, barn, c));
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
      goTo(c, buildingApproach(s, b, c));
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
        goTo(c, buildingApproach(s, b, c));
        stepTo(s, c, dt);
        return;
      }
      goTo(c, buildingApproach(s, barn, c));
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
    goTo(c, buildingApproach(s, barn, c));
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
    goTo(c, buildingApproach(s, b, c));
    if (stepTo(s, c, dt)) {
      const take = Math.min(carryLimit(k), surplus);
      b.store[k] = (b.store[k] ?? 0) - take;
      if ((b.store[k] ?? 0) <= 0) delete b.store[k];
      c.carry = { kind: k, amount: take };
    }
    return;
  }

  // Nothing to move — mind the post.
  goTo(c, buildingApproach(s, b, c));
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
  c?: Citizen,
): { kind: ResourceKind; amount: number } | null {
  switch (b.type) {
    case 'gatherer':
      return { kind: 'fruit', amount: LOAD_FOOD * factorCircle(s, b) * tf };
    case 'fishing':
      return { kind: 'fish', amount: LOAD_FOOD * factorWater(s, b) * tf };
    case 'hunting': {
      const f = factorCircle(s, b) * tf;
      // Game off the hunt, and the hide that comes with it — the one leather that is not a
      // ranch's, and still only ever off something killed.
      return rand(s) < 0.7
        ? { kind: 'venison', amount: LOAD_FOOD * f }
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
      // Food comes off a pen by the basket, materials by the work-load. Asked of `FOOD_KINDS`
      // rather than listed by hand, so a new animal's produce is sized right without anyone
      // remembering to extend a condition — mutton would otherwise have been hauled as if it
      // were a hide.
      const loadFor = (k: ResourceKind): number => (FOOD_KINDS.includes(k) ? LOAD_FOOD : LOAD_MAT);
      // A herd with nothing to give while it lives — pigs — puts its rancher to work with no load
      // to show for the cycle. The pen still pays, out of the butcher (see `endSeason`), just not
      // through this hand.
      if (meta.products.length === 0) return null;
      let roll = rand(s);
      for (const p of meta.products) {
        if (roll < p.chance) return { kind: p.kind, amount: loadFor(p.kind) * p.mult * f };
        roll -= p.chance;
      }
      const last = meta.products[meta.products.length - 1];
      return { kind: last.kind, amount: loadFor(last.kind) * last.mult * f };
    }
    case 'lumberyard': {
      if (b.replant ?? true) plantCircle(s, b); // sow saplings on grass so the forest renews
      tendCircle(s, b, WORK_SECONDS);
      // Standing on rock or ore? That is what this cycle was for: clearing it is what makes the
      // tile plantable, and the forester carries the haul back like any other load.
      const here = c && getTile(s.tiles, Math.floor(c.x), Math.floor(c.y));
      if (here && ((here.stone ?? 0) > 0 || (here.iron ?? 0) > 0)) {
        const iron = (here.iron ?? 0) > 0;
        const got = iron ? (here.iron ?? 0) : (here.stone ?? 0);
        delete here.iron;
        delete here.stone;
        s.forestVersion = (s.forestVersion ?? 0) + 1; // the prop layers have to drop it
        return { kind: iron ? 'iron' : 'stone', amount: Math.max(LOAD_MAT * 0.5, got) * tf };
      }
      const f = factorCircle(s, b);
      // Fell the tree he actually walked to, and only spread the cut over the circle when he is
      // not standing at one — otherwise the wood thins evenly around a man chopping in one spot.
      if (here && here.type === 'forest' && here.trees > 0.05) {
        here.trees = Math.max(0.05, here.trees - 0.25 * f);
      } else {
        depleteCircleTrees(s, b, 0.25 * f);
      }
      return {
        kind: 'wood',
        amount: LOAD_MAT * f * tf * (policyActive(s, 'conservation') ? POLICY_CONSERVE_LUMBER : 1),
      };
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
      if (b.recipe === 'wool') {
        return consumeStore(b, [['wool', TAILOR_WOOL_IN]]) ? { kind: 'clothing', amount: TAILOR_OUT * tf } : null;
      }
      return consumeStore(b, [['leather', TAILOR_LEATHER_IN]]) ? { kind: 'clothing', amount: TAILOR_OUT * tf } : null;
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
  action: 'fetch' | 'build' | 'raze' | 'salvage';
  kind?: ResourceKind;
}

function pickSite(s: GameState, c: Citizen): SiteAction | null {
  let best: SiteAction | null = null;
  let bestD = Infinity;
  for (const b of s.buildings) {
    let action: SiteAction | null = null;
    if (b.razed) {
      // Rubble: cart the salvage off, one load at a time, until there is nothing left.
      let kind: ResourceKind | null = null;
      for (const k in b.store) {
        if ((b.store[k as ResourceKind] ?? 0) > 0.01) {
          kind = k as ResourceKind;
          break;
        }
      }
      action = kind ? { site: b, action: 'salvage', kind } : null;
    } else if (b.demolish) {
      action = { site: b, action: 'raze' };
    } else if (!b.built) {
      const cost = costOf(b);
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
      action = fully
        ? footprintClear(s, b)
          ? { site: b, action: 'build' }
          : null
        : fetchKind
          ? { site: b, action: 'fetch', kind: fetchKind }
          : null;
    }
    if (!action) continue;
    const p = buildingApproach(s, b, c);
    if (!reachableTile(c, Math.floor(p.x), Math.floor(p.y))) continue;
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = action;
    }
  }
  return best;
}

/**
 * One tick of a builder's labour: the work it puts into the site, metered against their shift.
 *
 * A builder can only lay down `BUILDER_SHIFT_WORK` before knocking off, so this returns the work
 * actually done — which is less than a full tick's worth on the tick that runs them out — and
 * books the rest that follows. The rest goes through `Citizen.rest`, the same field an ordinary
 * break uses, so a spent builder walks the usual leisure round and `runCitizen` picks the shift up
 * again afterwards. Deliberately *not* capped to the site's remaining work: a builder who lands
 * the last blow on a house has still done a shift's labour and should knock off having done it.
 */
function labour(c: Citizen, dt: number): number {
  const left = BUILDER_SHIFT_WORK - (c.effort ?? 0);
  const done = Math.min(dt * BUILD_WORK_RATE, Math.max(0, left));
  c.effort = (c.effort ?? 0) + done;
  if (c.effort >= BUILDER_SHIFT_WORK) {
    c.effort = 0;
    c.rest = BUILDER_REST_SECONDS;
  }
  return done;
}

function runBuilder(s: GameState, c: Citizen, dt: number): void {
  // Deliver carried material to a site that needs it, else return it to a barn.
  if (c.carry) {
    const kind = c.carry.kind;
    // Only builders supply construction sites; a laborer just stashes whatever it's carrying.
    const site = c.builder ? nearestUnbuiltNeeding(s, c, kind) : null;
    if (site) {
      goTo(c, buildingApproach(s, site, c));
      if (stepTo(s, c, dt)) {
        const cost = costOf(site);
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
      goTo(c, buildingApproach(s, barn, c));
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
        goTo(c, buildingApproach(s, barn, c));
        if (stepTo(s, c, dt)) {
          const cost = costOf(pick.site);
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
    if (pick.action === 'raze') {
      // Stand at the building and pull it down. No materials to fetch first — that is the one way
      // demolition is not construction run backwards.
      goTo(c, buildingApproach(s, pick.site, c));
      if (stepTo(s, c, dt)) {
        pick.site.demoProgress = (pick.site.demoProgress ?? 0) + labour(c, dt);
        if (pick.site.demoProgress >= demoWorkOf(pick.site.type)) razeBuilding(s, pick.site);
      }
      return;
    }
    if (pick.action === 'salvage') {
      // Load up from the rubble; the carry branch above walks it to a barn (or straight to a site
      // that needs it). The plot clears the moment the pile is empty.
      const kind = pick.kind!;
      goTo(c, buildingApproach(s, pick.site, c));
      if (stepTo(s, c, dt)) {
        const take = Math.min(carryLimit(kind), pick.site.store[kind] ?? 0);
        if (take > 0) {
          pick.site.store[kind] = (pick.site.store[kind] ?? 0) - take;
          if ((pick.site.store[kind] ?? 0) <= 0.01) delete pick.site.store[kind];
          c.carry = { kind, amount: take };
        }
        if (rubbleEmpty(pick.site)) clearRubble(s, pick.site);
      }
      return;
    }
    // build: stand at the site and labour.
    goTo(c, buildingApproach(s, pick.site, c));
    if (stepTo(s, c, dt)) {
      pick.site.progress += labour(c, dt);
      if (pick.site.progress >= buildWorkOf(pick.site.type)) {
        finishConstruction(s, pick.site);
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

/**
 * Mark the harvestable tiles inside a rectangle, of the kind the player asked for.
 *
 * A tile can hold only one order, and trees are checked first, so on `all` a wooded tile that also
 * carries ore is marked for felling — the trees have to come off it before the ore can be reached
 * anyway. Asking for `iron` marks that same tile for the ore and leaves the trees standing, which
 * is the whole point of being able to choose.
 */
export function markHarvestRect(
  s: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  want: HarvestKind = 'all',
): number {
  const lx = Math.max(0, Math.min(x0, x1));
  const hx = Math.min(MAP_W - 1, Math.max(x0, x1));
  const ly = Math.max(0, Math.min(y0, y1));
  const hy = Math.min(MAP_H - 1, Math.max(y0, y1));
  const wants = (k: HarvestKind): boolean => want === 'all' || want === k;
  let marked = 0;
  for (let ty = ly; ty <= hy; ty++) {
    for (let tx = lx; tx <= hx; tx++) {
      const i = tileIndex(tx, ty);
      const t = s.tiles[i];
      const order =
        wants('trees') && t.type === 'forest' && t.trees > 0.05
          ? HARVEST_WOOD
          : wants('stone') && (t.stone ?? 0) > 0
            ? HARVEST_STONE
            : wants('iron') && (t.iron ?? 0) > 0
              ? HARVEST_IRON
              : HARVEST_NONE;
      if (order === HARVEST_NONE) continue;
      s.harvest[i] = order;
      marked++;
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
    const cost = costOf(b);
    if ((b.store[kind] ?? 0) >= (cost[kind] ?? 0)) continue;
    const p = buildingApproach(s, b, c);
    if (!reachableTile(c, Math.floor(p.x), Math.floor(p.y))) continue;
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function finishConstruction(s: GameState, b: Building): void {
  const cost = costOf(b);
  for (const k in cost) {
    const kind = k as ResourceKind;
    b.store[kind] = (b.store[kind] ?? 0) - (cost[kind] ?? 0);
    if ((b.store[kind] ?? 0) <= 0.001) delete b.store[kind];
  }
  b.built = true;
  b.progress = BUILDING_DEFS[b.type].work;
  // Open its jobs, if the player has asked for that. `assignHomesAndJobs` hires whoever is free
  // on the next tick and picks up the rest as laborers come free, so a hut finished with nobody
  // spare still fills itself later rather than waiting to be noticed.
  // Staff it from whatever the trade was already asking for and had nowhere to put, then — if
  // the player wants new workplaces to open themselves — fill the rest of its posts.
  drawFromTradeExtra(s, b);
  if (s.autoStaff && isWorkplace(b.type)) b.desiredWorkers = BUILDING_DEFS[b.type].jobs;
  // A finished building is a wall villagers must walk around, so routes and reachability have to
  // be recomputed — while it was a site they walked straight over it.
  s.navVersion = (s.navVersion ?? 0) + 1;
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
    } else if (v === PATH_BRIDGE_PLAN || v === PATH_BRIDGE_STONE_PLAN || v === PATH_TUNNEL_PLAN) {
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
    } else if (v === PATH_BRIDGE_STONE_PLAN) {
      // Both materials, or the tile stays unworked — the same rule a tunnel follows.
      if (totalStored(s, 'wood') >= BRIDGE_STONE_WOOD_COST && totalStored(s, 'stone') >= BRIDGE_STONE_STONE_COST) {
        takeNearest(s, bestStand, 'wood', BRIDGE_STONE_WOOD_COST);
        takeNearest(s, bestStand, 'stone', BRIDGE_STONE_STONE_COST);
        s.paths[bestIdx] = PATH_BRIDGE_STONE;
        s.navVersion = (s.navVersion ?? 0) + 1;
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

/**
 * Where a villager with nothing to do hangs about: their own doorstep if they have one, else the
 * founding clearing.
 *
 * Not `centreOfVillage` — that is the mean position of every building, so putting a quarry or a
 * mine out at the edge of the map walks the whole idle population halfway there, into open
 * ground nobody lives in.
 */
function loiterPoint(s: GameState, c: Citizen): { x: number; y: number } {
  const home = c.homeId !== null ? s.buildings.find((b) => b.id === c.homeId) : null;
  if (home) return buildingCenter(home);
  if (s.origin) return s.origin;
  return centreOfVillage(s);
}

function wander(s: GameState, c: Citizen, dt: number): void {
  // Re-pick on a timer (not only on arrival) so an unreachable spot never freezes a villager.
  c.timer -= dt;
  if (c.timer <= 0) {
    const centre = loiterPoint(s, c);
    let set = false;
    for (let k = 0; k < 6; k++) {
      const tx = clampTile(centre.x + (rand(s) - 0.5) * 8);
      const ty = clampTile(centre.y + (rand(s) - 0.5) * 8);
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
    c.timer = 2 + rand(s) * 3;
  }
  stepTo(s, c, dt);
}

// ---- season turnover ----
/**
 * Close the season's books: what the stores hold now against what they held a season ago.
 *
 * Runs at the very *end* of the turnover, after the harvest is in and the village has eaten,
 * burned and worn out its share. Closing at the start looked tidier and was wrong: the baseline
 * it left was the stock *before* that turnover's consumption, while anyone reading the stores a
 * moment later saw the stock after it — so every row was short by one turnover's eating. It
 * surfaced as a season of coats going missing between the books and the barn.
 */
function closeLedger(s: GameState): void {
  // Everything the village *holds*, larders included — see `totalHeldAll`. Kept on the stores
  // alone, a household walking home with a sack read as the village losing it.
  const now = totalHeldAll(s);
  const prev = s.lastTotals;
  const out = s.spent ?? {};
  if (prev) {
    const net: Partial<Record<ResourceKind, number>> = {};
    // Every resource either side has seen, so a stock that ran out still gets its final row.
    for (const k of new Set([...Object.keys(now), ...Object.keys(prev), ...Object.keys(out)])) {
      const kind = k as ResourceKind;
      const d = (now[kind] ?? 0) - (prev[kind] ?? 0);
      if (d !== 0 || (out[kind] ?? 0) !== 0) net[kind] = d;
    }
    const rows = (s.ledger ??= []);
    rows.push({ year: s.year, season: s.season, net, out: { ...out } });
    if (rows.length > LEDGER_SEASONS) rows.splice(0, rows.length - LEDGER_SEASONS);
  }
  s.lastTotals = now;
  s.spent = {};
}

/**
 * What the books say about one resource: last season's flow, and how long the stock lasts at it.
 *
 * `inn` is derived (`net + out`) rather than measured separately, so the three figures always
 * reconcile — a ledger whose columns did not add up would be worse than no ledger.
 */
/**
 * Enact or repeal a standing rule, returning whether the village now lives under it.
 *
 * Enacting beyond the clerks is refused rather than silently queued: a rule the player thinks is
 * in force but is not would be worse than a button that declines. Repealing always works, and
 * keeps the order of the rest so nothing else lapses as a side effect.
 */
export function setPolicy(s: GameState, id: PolicyId, on: boolean): boolean {
  const list = (s.policies ??= []);
  const at = list.indexOf(id);
  if (!on) {
    if (at >= 0) list.splice(at, 1);
    return false;
  }
  if (at >= 0) return policyActive(s, id);
  if (list.length >= policyCapacity(s)) return false; // no clerk free to keep it
  list.push(id);
  return true;
}

/**
 * Throw a festival: a night the village pays for in food and remembers in good spirits.
 *
 * An act rather than a rule, so it holds no clerk's desk afterwards — but it takes one to
 * organise, and it takes the food up front. Returns false if either is missing.
 */
export function holdFestival(s: GameState, log?: LogFn): boolean {
  if (policyCapacity(s) < 1) return false;
  if (totalFoodAvailable(s) < FESTIVAL_FOOD) return false;
  let need = FESTIVAL_FOOD;
  for (const k of FOOD_KINDS) {
    if (need <= 0) break;
    need = consume(s, k, need);
  }
  for (const c of s.citizens) c.happiness = Math.min(100, c.happiness + FESTIVAL_HAPPY);
  log?.('The village held a festival', 'good');
  return true;
}

export function ledgerFor(
  s: GameState,
  kind: ResourceKind,
): { inn: number; out: number; net: number; stock: number; seasonsLeft: number | null; trend: number[] } | null {
  const rows = s.ledger ?? [];
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  const out = last.out[kind] ?? 0;
  const net = last.net[kind] ?? 0;
  const stock = totalAvailable(s, kind);
  // Only a village that is *losing* this resource has a number of seasons left; one that is
  // holding steady or growing has none, and saying "999 seasons" would be noise.
  const seasonsLeft = net < -0.0001 ? Math.max(0, stock / -net) : null;
  return { inn: net + out, out, net, stock, seasonsLeft, trend: rows.map((r) => r.net[kind] ?? 0) };
}

function endSeason(s: GameState, log: LogFn): void {
  const popStart = s.citizens.length; // for tallying deaths (affects morale)
  s.season = (s.season + 1) % SEASONS.length;
  // Ageing, schooling, coming of age, old age and births all run continuously now — see `lives`.
  // The calendar still turns here; only the announcement is left.
  if (s.season === 0) {
    s.year++;
    log(`A new year begins — Year ${s.year}`, 'info');
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
    if (rand(s) < RANCH_BREED_BONUS_CHANCE) progress += 1;
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
  for (const b of s.buildings) if (b.built && isDwelling(b.type)) homeById.set(b.id, b);
  const homeOf = (c: Citizen): Building | undefined =>
    c.homeId !== null ? homeById.get(c.homeId) : undefined;

  // Neither food nor fuel is taken here. Villagers eat and heat continuously (`eat` and `heat`,
  // called every tick) rather than in one lump at the boundary — a season's worth vanishing from
  // the stores in a single frame is what made a village look comfortable all season and then
  // starve or freeze someone the instant it turned over, with no chance to react.
  const shortFood = totalFoodAvailable(s) <= 0 ? 1 : 0;

  // Clothing *is* a seasonal issue: a garment wears out over a season rather than being burned
  // by the hour, and the ration is what `heat` then reads all season long — a warmly dressed
  // villager needs less fuel. `c.clothed` is transient, recomputed here each season, never saved.
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
          takeFromLarder(s, home, 'clothing', fromLarder);
          need -= fromLarder;
        }
      }
      if (need > 0) need = consume(s, 'clothing', need);
      c.clothed = need <= 0.001;
      if (!c.clothed) unclothed.push(c);
    }

    // Heat is billed by `heat` every tick, not here — see the note at the top of this block.
    // Freezing to death is likewise continuous, so only the clothing risk is settled at the
    // boundary.
    if (season === 'Winter') {
      // Only the villagers who actually went without warm clothing are at risk.
      const sickChance = Math.min(1, SICKNESS_CHANCE * (1 + (1 - avgHealth(s) / 100)));
      const fallen: Citizen[] = [];
      for (const c of unclothed) if (rand(s) < sickChance) fallen.push(c);
      if (fallen.length > 0) {
        killFrom(s, fallen, fallen.length);
        log(`${fallen.length} villager${fallen.length > 1 ? 's' : ''} fell ill without warm clothing`, 'bad');
      }
    }
  }

  // Proactive survival hints — warn the player *before* the shortfall bites, once per season
  // (endSeason is the natural throttle). These ride the existing event log; no new UI.
  warnOfShortfalls(s, season, log);

  announceTier(s, log);
  diseaseSeason(s, log);
  fireSeason(s, log);
  bridgeFireSeason(s, log);

  // Tally deaths so far this season (old age, starvation, cold, illness) — they weigh
  // on morale unless the village keeps a cemetery.
  //
  // Two sources, because they happen at different times: whatever `endSeason` itself has just
  // killed (illness, fire), measured by the drop across this call, plus the elders `lives` saw
  // off during the season, which is carried in `seasonDeaths` — old age used to be settled here
  // and would otherwise stop counting toward morale entirely.
  const deaths = Math.max(0, popStart - s.citizens.length) + (s.seasonDeaths ?? 0);
  s.seasonDeaths = 0;

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

  // Settle households into couples with room to spare — `births` reads the result every few
  // seconds, so a pair who move in together can start a family without waiting for the year out.
  rehouseVillagers(s);

  // Well-being drifts toward conditions (food/variety -> health; space/goods/amenities -> happiness).
  updateWellbeing(s, shortFood > 0, deaths, tavernActive);

  closeLedger(s); // last, so a row covers everything this turnover did

  if (s.citizens.length === 0) {
    s.gameOver = true;
    log('Your village has died out.', 'bad');
  }
}

/**
 * Stocks the village warns about, in the order the HUD shows them: the combined food total, then
 * each resource with a chip. Everything else (leather, livestock, individual crops) is readable on
 * a barn's own sheet and would only crowd the log.
 */
const WARN_STOCKS: LimitKey[] = ['food', ...HUD_RESOURCES];

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

  // Any season, every resource, one line each and always the same shape: the player learns to read
  // "X is low" once rather than a different sentence per good. Judged on what is free in the barns
  // (see `isLowStock`), so goods sitting in household larders do not paper over an empty store.
  //
  // Firewood and clothing are skipped in Autumn because the two warnings just above already name
  // them, with the timing that actually matters — the same shortfall twice in one season is noise.
  s.lowWarned ??= {};
  for (const key of WARN_STOCKS) {
    const low = isLowStock(s, key);
    if (!low) {
      delete s.lowWarned[key]; // recovered — say so again if it falls back
      continue;
    }
    if (s.lowWarned[key]) continue; // already told them, and nothing has changed
    s.lowWarned[key] = true;
    if (season === 'Autumn' && (key === 'firewood' || key === 'clothing')) continue;
    log(`${LIMIT_META[key].icon} ${LIMIT_META[key].label} is low`, 'bad');
  }

  // Fuel the village owns but cannot deliver. Fuel is only burned in a hearth now, so a household
  // whose hauler cannot reach a barn — walled in behind new buildings, or cut off across a river —
  // goes cold beside a full woodpile, and in winter that kills. The stock warnings above all read
  // village totals and would say everything is fine, so this is the only sign the player would get.
  const roofed = s.buildings.filter((b) => b.built && isDwelling(b.type) && residentsOf(s, b).length > 0);
  const cold = roofed.filter((b) => (b.store['firewood'] ?? 0) <= 0 && (b.store['coal'] ?? 0) <= 0);
  const villageFuel = totalStored(s, 'firewood') + totalStored(s, 'coal');
  if (villageFuel > 0 && cold.length > 0 && cold.length >= roofed.length / 2) {
    log(`🪵 ${cold.length} household${cold.length > 1 ? 's have' : ' has'} no fuel at home — the barns are stocked but nobody is carrying it`, 'bad');
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
 * Merchant bookkeeping, every tick. Counts down a docked merchant's stay and rolls for new
 * arrivals; visits are never back to back, since a departure sets a cooldown.
 *
 * This used to run once per season from `endSeason`, which meant every boat in the game appeared
 * at the stroke of a turnover and never a moment else. Rolling a slice of the chance each tick
 * keeps the same expected rate — MERCHANT_ARRIVAL_CHANCE arrivals per season — while letting a
 * trader turn up early, mid or late.
 *
 * A built trading post is all it takes. The worker on the post moves goods in and out of it; they
 * are not what brings the boat, so an unstaffed post still gets visits and the player can trade
 * whatever stock is already sitting there.
 */
function updateMerchant(s: GameState, dt: number, log: LogFn): void {
  const m = s.merchant;

  // A docked merchant counts down its stay, then casts off.
  if (m.phase === 'docked') {
    m.stayTimer -= dt;
    if (m.stayTimer <= 0) {
      m.phase = 'leaving';
      m.present = false;
    }
    return;
  }

  // Only roll for a fresh arrival when fully away (never while a boat is still sailing).
  if (m.phase !== 'away') return;

  if (m.cooldownTimer > 0) {
    m.cooldownTimer = Math.max(0, m.cooldownTimer - dt);
    return;
  }

  if (!s.buildings.some((b) => b.built && b.type === 'trading')) return;
  if (rand(s) < MERCHANT_ARRIVAL_CHANCE * (dt / SEASON_LENGTH)) spawnMerchant(s, log);
}

/** Roll a merchant category, stock its goods, and launch its boat from the top of the river. */
function spawnMerchant(s: GameState, log: LogFn): void {
  const m = s.merchant;
  let cats = MERCHANT_CATEGORIES.slice();
  // A seed merchant has nothing to sell once every crop is unlocked — drop it then.
  if (CROPS.every((c) => s.seeds.includes(c))) cats = cats.filter((c) => c !== 'seeds');
  const category = cats[Math.floor(rand(s) * cats.length)];

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
  const post = tradingPost(s);
  m.boat = post ? boatEntry(s, dockSpot(s, post)) : { x: riverColumnX(s.tiles, 0), y: 0 };
  const meta = MERCHANT_CATEGORY_META[category];
  log(`${meta.emoji} A ${meta.label.toLowerCase()}'s boat is sailing in`, 'info');
}

/**
 * Where the merchant's boat ties up: the water tile just off the trading post's quay.
 *
 * It used to moor at `riverColumnX(dockY)` — the *central river's* column at the post's row —
 * whatever water the post was actually built on. A post on a lake therefore had its merchant sit
 * out in open water on the far side of the map, which is what "it doesn't dock at the trading
 * post" looks like. The berth is now found from the post itself: the water tile nearest its middle,
 * preferring one just outside the footprint so the boat lies alongside the wharf rather than on it.
 */
function dockSpot(s: GameState, post: Building): { x: number; y: number } {
  const c = buildingCenter(post);
  const fw = footprintW(post);
  const fh = footprintH(post);
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  // A ring around the footprint, then the footprint itself as a fallback for a post whose wharf
  // covers all the water it touches.
  for (const outside of [true, false]) {
    for (let dy = -1; dy <= fh; dy++) {
      for (let dx = -1; dx <= fw; dx++) {
        const onEdge = dx < 0 || dy < 0 || dx >= fw || dy >= fh;
        if (onEdge !== outside) continue;
        const tx = post.x + dx;
        const ty = post.y + dy;
        const t = getTile(s.tiles, tx, ty);
        if (!t || t.type !== 'water') continue;
        const d = (tx + 0.5 - c.x) ** 2 + (ty + 0.5 - c.y) ** 2;
        if (d < bestScore) {
          bestScore = d;
          best = { x: tx + 0.5, y: ty + 0.5 };
        }
      }
    }
    if (best) return best;
  }
  // No water at all around the post (it should not have been placeable): fall back to the river.
  return { x: riverColumnX(s.tiles, c.y), y: c.y };
}

/**
 * Where a boat enters and leaves the map: the edge water tile closest to the berth.
 *
 * Sailing in from the top of the river regardless of where the post is meant a boat bound for a
 * lake on the far side started its run in the wrong body of water entirely. Coming in from the
 * nearest edge keeps the crossing over the water the post is actually on, most of the time.
 */
function boatEntry(s: GameState, to: { x: number; y: number }): { x: number; y: number } {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const consider = (tx: number, ty: number) => {
    const t = getTile(s.tiles, tx, ty);
    if (!t || t.type !== 'water') return;
    const d = (tx + 0.5 - to.x) ** 2 + (ty + 0.5 - to.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x: tx + 0.5, y: ty + 0.5 };
    }
  };
  for (let x = 0; x < MAP_W; x++) {
    consider(x, 0);
    consider(x, MAP_H - 1);
  }
  for (let y = 0; y < MAP_H; y++) {
    consider(0, y);
    consider(MAP_W - 1, y);
  }
  return best ?? { x: riverColumnX(s.tiles, 0), y: 0 };
}

/** Per-tick boat motion: sail in to the dock, hold there, then sail back out to sea. */
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
    if (moveBoatTo(m.boat, dockSpot(s, post), dt)) {
      m.phase = 'docked';
      m.present = true;
      m.stayTimer = MERCHANT_STAY_SEASONS * SEASON_LENGTH;
      const meta = m.category ? MERCHANT_CATEGORY_META[m.category] : { emoji: '⚓', label: 'merchant' };
      log(`${meta.emoji} A ${meta.label.toLowerCase()} has docked — trade at the post`, 'good');
    }
  } else if (m.phase === 'docked') {
    // Hold station alongside the quay. Recomputed rather than remembered so a post that is
    // rebuilt or resized under the merchant does not leave it moored to nothing.
    if (post) {
      const berth = dockSpot(s, post);
      m.boat.x = berth.x;
      m.boat.y = berth.y;
    }
  } else if (m.phase === 'leaving') {
    m.present = false;
    const out = boatEntry(s, m.boat);
    if (moveBoatTo(m.boat, { x: out.x, y: out.y }, dt)) {
      m.phase = 'away';
      m.boat = null;
      m.stock = {};
      m.seedStock = [];
      m.category = null;
      m.cooldownTimer = MERCHANT_COOLDOWN_SEASONS * SEASON_LENGTH; // no back-to-back visits
      log('⛵ The merchant sailed away', 'info');
    }
  }
}

/**
 * Sail the boat toward a point, turning the bow onto the course. Returns true once it arrives.
 *
 * Straight-line across the water rather than following the river column, because the berth is now
 * wherever the trading post is and the river may have nothing to do with it.
 */
function moveBoatTo(boat: { x: number; y: number; h?: number }, goal: { x: number; y: number }, dt: number): boolean {
  const dx = goal.x - boat.x;
  const dy = goal.y - boat.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.01) boat.h = Math.atan2(dx, dy);
  const step = BOAT_SPEED * dt;
  if (d <= step) {
    boat.x = goal.x;
    boat.y = goal.y;
    return true;
  }
  boat.x += (dx / d) * step;
  boat.y += (dy / d) * step;
  return false;
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
  const meta = ANIMAL_META[animal];
  // What the knife gets, which is not always what the herd gives. Killing a sheep does not
  // produce a fleece — that comes off it alive — so a culled flock yields mutton and nothing else.
  for (const p of meta.butchered ?? meta.products) {
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
/**
 * A bunk in the boarding house, for a villager no home has room for.
 *
 * The last resort and nothing more: no preference order, no pairing, no household. Whoever ends up
 * here is walked back out into a house by `rehouseVillagers` as soon as one has space.
 *
 * A child follows whichever bunk their parent is on, so a family turned away from the houses stays
 * together rather than being scattered across two shelters.
 */
function placeInShelter(s: GameState, c: Citizen, shelters: Building[]): boolean {
  if (shelters.length === 0) return false;
  const occ = new Map<number, number>();
  for (const o of s.citizens) if (o.homeId !== null) occ.set(o.homeId, (occ.get(o.homeId) ?? 0) + 1);
  const hasRoom = (b: Building) => (occ.get(b.id) ?? 0) < dwellingCapacityOf(b.type);
  const withKin = shelters.find(
    (b) =>
      hasRoom(b) &&
      s.citizens.some(
        (o) => o.homeId === b.id && (c.parents?.includes(o.id) || o.id === c.partnerId),
      ),
  );
  const target = withKin ?? shelters.find(hasRoom);
  if (!target) return false;
  c.homeId = target.id;
  return true;
}

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
  // Condemned houses are left out of the shuffle for the same reason as above: moving a couple
  // into one would only make them homeless again when the builders arrive.
  const houses = s.buildings.filter((b) => b.built && !b.demolish && isHouse(b.type));

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

  // Anyone still on a bunk moves into a house the moment one has room. The shelter is a roof to
  // put over newcomers while their houses go up, not somewhere anyone is meant to stay, so the
  // move out is the village's doing rather than the player's — and crowding in with another
  // household still beats a dormitory.
  for (const c of s.citizens) {
    if (!isAdult(c) || c.homeId === null) continue;
    const home = s.buildings.find((b) => b.id === c.homeId);
    if (!home || !isShelter(home.type)) continue;
    const partner = partnerOf(s, c);
    placeAdult(s, c, houses, true);
    // A couple leaves together: a partner left behind on a bunk would just be walked back over
    // at the next sweep, and splitting them up is the one thing rehousing never does.
    if (partner && c.homeId !== home.id) placeAdult(s, partner, houses, true);
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
  const c = makeCitizen(s, rand(s) < 0.5 ? 'm' : 'f', 0, at.x + (rand(s) - 0.5), at.y + (rand(s) - 0.5));
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
  // What the standing rules cost. Charged against the *targets* rather than docked from the
  // running figures, so a policy settles the village at a lower level instead of grinding it down
  // a little more every season it stays in force.
  if (policyActive(s, 'rationing')) happyTarget -= POLICY_RATION_HAPPY;
  const healthPenalty = policyActive(s, 'longHours') ? POLICY_HOURS_HEALTH : 0;
  happyTarget = clamp(happyTarget, 0, 100);
  const healthAim = clamp(healthTarget - healthPenalty, 0, 100);
  // Sleeping on a bunk is charged to the villager, not to the village: the shelter's residents
  // settle lower than everyone else, and the rest of the village is no worse off for the building
  // existing. `housingCapacity` counts homes only, so the headroom bonus above is already out of
  // reach for a village whose only spare beds are in the boarding house.
  const bunks = new Set(
    s.buildings.filter((b) => b.built && isShelter(b.type)).map((b) => b.id),
  );
  for (const c of s.citizens) {
    const aim = c.homeId !== null && bunks.has(c.homeId) ? happyTarget - SHELTER_HAPPY : happyTarget;
    c.health += (healthAim - c.health) * 0.25;
    c.happiness += (clamp(aim, 0, 100) - c.happiness) * 0.25;
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
  //
  // The multiple is 4.5 seasons rather than the 1.5 it used to be purely to hold the bar still
  // when the ration was cut by `CONSUMPTION_SLOWDOWN`: 1.5 seasons of the old ration and 4.5 of
  // the new one are the same amount of food. Left at 1.5 a founding village cleared it three
  // times over on day one, and nomads knocked every single season from the start.
  if (totalFoodAvailable(s) <= pop * FOOD_PER_CITIZEN_PER_SEASON * NOMAD_SURPLUS_SEASONS) return;
  const gates = policyActive(s, 'openGates');
  if (rand(s) >= IMMIGRATION_CHANCE * (gates ? POLICY_GATES_IMMIGRATION : 1)) return;

  const count = IMMIGRATION_MIN + Math.floor(rand(s) * (IMMIGRATION_MAX - IMMIGRATION_MIN + 1));
  let sick = 0;
  const sickChance = IMMIGRANT_SICK_CHANCE * (gates ? POLICY_GATES_SICK : 1);
  for (let i = 0; i < count; i++) if (rand(s) < sickChance) sick++;
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
    const age = Math.floor(ADULT_AGE + 2 + rand(s) * (OLD_AGE_START - ADULT_AGE - 4));
    const c = makeCitizen(
      s,
      rand(s) < 0.5 ? 'm' : 'f',
      age,
      centre.x + (rand(s) - 0.5) * 2,
      centre.y + (rand(s) - 0.5) * 2,
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
  if (s.disasters && pop >= 4 && rand(s) < DISEASE_CHANCE) {
    const healthy = s.citizens.filter((c) => !c.sick);
    healthy.sort(() => rand(s) - 0.5);
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
      takeFromLarder(s, home, 'medicine', 1);
      chance += SICK_RECOVER_MEDICINE;
    } else if (totalStored(s, 'medicine') >= 1) {
      consume(s, 'medicine', 1);
      chance += SICK_RECOVER_MEDICINE;
    }
    if (hospital) chance += SICK_RECOVER_HOSPITAL;
    if (rand(s) < chance) {
      c.sick = false;
      c.health = Math.min(100, c.health + 15);
    } else {
      c.health -= 15;
      if (c.health <= 0 || rand(s) < SICK_DEATH_CHANCE) {
        removeCitizen(s, c);
        died++;
      }
    }
  }
  if (died > 0) log(`${died} villager${died > 1 ? 's' : ''} died of illness`, 'bad');
}

export function fireSeason(s: GameState, log: LogFn): void {
  if (!s.disasters) return; // disasters toggled off — no fires ignite
  const flammable = s.buildings.filter((b) => b.built && !isFireproof(b.type) && !b.fireTimer);
  if (flammable.length === 0) return;
  if (rand(s) >= FIRE_CHANCE) return;
  const b = flammable[(rand(s) * flammable.length) | 0];
  // Masonry is half as likely to be the building that goes up. Picking the candidate first and
  // then rolling its resistance keeps the village-wide fire rate unchanged while shifting which
  // buildings bear it — a village that rebuilds in stone sees fewer fires, not differently
  // distributed ones.
  if (isStoneBuilt(b.type) && rand(s) >= STONE_FIRE_FACTOR) return;
  tryIgnite(s, b, log, true);
}

/**
 * Say so when the village grows into a new tier — or slips out of one.
 *
 * Checked at the season turn rather than every tick: the tier follows the village live, and a
 * village hovering on fifty people would otherwise announce itself every time somebody was born or
 * died. Once a season is the cadence a player can actually read.
 */
function announceTier(s: GameState, log: LogFn): void {
  const now = villageTier(s);
  const before = s.tierSeen;
  s.tierSeen = now;
  if (before === undefined || before === now) return; // a fresh village is simply what it is
  if (TIERS.indexOf(now) > TIERS.indexOf(before)) {
    log(`${TIER_META[now].emoji} Your ${TIER_META[before].name.toLowerCase()} has grown into a ${TIER_META[now].name.toLowerCase()}`, 'good');
  } else {
    log(`${TIER_META[now].emoji} Your ${TIER_META[before].name.toLowerCase()} has fallen back to a ${TIER_META[now].name.toLowerCase()}`, 'bad');
  }
}

/**
 * A timber bridge burns down, taking the crossing with it.
 *
 * Rolled separately from the buildings' fire, because a bridge is not a building: nobody lives on
 * it to notice, it stands over water far from any well, and losing one does something no burnt
 * house does — it cuts the map in half again until somebody rebuilds. That is the whole reason a
 * stone bridge is worth its masonry, so masonry is simply not a candidate here.
 *
 * The tile goes straight back to open water rather than smouldering: there is nothing left to
 * stand on the moment the deck is gone.
 */
export function bridgeFireSeason(s: GameState, log: LogFn): void {
  if (!s.disasters) return;
  const timber: number[] = [];
  for (let i = 0; i < s.paths.length; i++) if (s.paths[i] === PATH_BRIDGE) timber.push(i);
  if (timber.length === 0) return;
  if (rand(s) >= BRIDGE_FIRE_CHANCE) return;
  const idx = timber[(rand(s) * timber.length) | 0];
  s.paths[idx] = PATH_NONE;
  s.navVersion = (s.navVersion ?? 0) + 1; // the crossing is gone; routes have to be recomputed
  log('A timber bridge burned down', 'bad');
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
  if (wellNear && rand(s) < WELL_DOUSE_CHANCE) {
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
      for (const { building: n, gap } of neighbours) {
        let chance = gap === 0 ? FIRE_SPREAD_ADJACENT : FIRE_SPREAD_NEAR;
        if (isStoneBuilt(n.type)) chance *= STONE_FIRE_FACTOR;
        if (rand(s) < chance) tryIgnite(s, n, log, false);
      }
    }
  }
}

/**
 * Buildings close enough for fire to jump to, with the clear gap between the two footprints.
 *
 * `gap` is 0 for footprints that touch or overlap and 1 for a single clear tile between them;
 * anything further is not returned. The two carry very different odds, so the distance has to
 * come back with the building rather than being flattened into one "adjacent" bucket.
 */
function adjacentBuildings(s: GameState, b: Building): { building: Building; gap: number }[] {
  const bw = footprintW(b);
  const bh = footprintH(b);
  const out: { building: Building; gap: number }[] = [];
  for (const o of s.buildings) {
    if (o === b || !o.built || isFireproof(o.type) || o.fireTimer) continue;
    // Separation along each axis: 0 when the spans touch or overlap, otherwise the clear tiles
    // between them. The gap between two rectangles is the larger of the two.
    const dx = Math.max(0, Math.max(b.x - (o.x + footprintW(o)), o.x - (b.x + bw)));
    const dy = Math.max(0, Math.max(b.y - (o.y + footprintH(o)), o.y - (b.y + bh)));
    const gap = Math.max(dx, dy);
    if (gap <= 1) out.push({ building: o, gap });
  }
  return out;
}

function removeBuilding(s: GameState, b: Building): void {
  const idx = s.buildings.indexOf(b);
  if (idx >= 0) s.buildings.splice(idx, 1);
  s.navVersion = (s.navVersion ?? 0) + 1; // its walls are gone; routes through it open up
  // A demolished house's larder isn't destroyed — the household's supplies go back to the barns
  // (which the residents will then re-fetch to whichever house they move into).
  if (isDwelling(b.type)) {
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
  if (policyActive(s, 'conservation')) dt *= POLICY_CONSERVE_REGROW;
  for (let i = 0; i < 40; i++) {
    const idx = (rand(s) * n) | 0;
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

/**
 * Every tile in a building's work circle that passes `pred`, in a shuffled order.
 *
 * The order is the point. Scanning the circle row by row and taking the first match makes a
 * forester plant and fell along a marching front: a straight edge of stumps eating across the
 * wood, and saplings appearing in tidy rows behind it. Foresters work a patch of forest, not a
 * lawn — picking at random is what makes the wood look worked rather than mown.
 */
/** `scatteredCircleTiles`, but yielding the tile coordinates — what `workSpot` needs to walk to. */
function scatteredCircleSpots(
  s: GameState,
  b: Building,
  pred: (t: Tile, tx: number, ty: number) => boolean,
): [number, number][] {
  const r = workRadiusOf(b) ?? 4;
  const cx = b.x + footprintW(b) / 2;
  const cy = b.y + footprintH(b) / 2;
  const r2 = r * r;
  const out: [number, number][] = [];
  for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r); ty++) {
    for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
      const ddx = tx + 0.5 - cx;
      const ddy = ty + 0.5 - cy;
      if (ddx * ddx + ddy * ddy > r2) continue;
      const t = getTile(s.tiles, tx, ty);
      if (t && pred(t, tx, ty)) out.push([tx, ty]);
    }
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function scatteredCircleTiles(s: GameState, b: Building, pred: (t: Tile, tx: number, ty: number) => boolean): Tile[] {
  const r = workRadiusOf(b) ?? 4;
  const cx = b.x + footprintW(b) / 2;
  const cy = b.y + footprintH(b) / 2;
  const r2 = r * r;
  const out: Tile[] = [];
  for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r); ty++) {
    for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
      const ddx = tx + 0.5 - cx;
      const ddy = ty + 0.5 - cy;
      if (ddx * ddx + ddy * ddy > r2) continue;
      const t = getTile(s.tiles, tx, ty);
      if (t && pred(t, tx, ty)) out.push(t);
    }
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Sow a few saplings on plain grass in the work circle, growing new forest to harvest later. */
function plantCircle(s: GameState, b: Building): void {
  const open = scatteredCircleTiles(s, b, (t, tx, ty) =>
    t.type === 'grass' && (t.stone ?? 0) <= 0 && (t.iron ?? 0) <= 0 &&
    !tileUnderBuilding(s, tx, ty) &&
    !hasPath(s, tx, ty)); // foresters don't plant saplings in the road
  for (const t of open.slice(0, 2)) {
    t.type = 'forest';
    t.trees = 0.12; // a young sapling; tendCircle grows it toward maturity
    s.forestVersion = (s.forestVersion ?? 0) + 1; // a new forest tile — refresh the render layer
  }
}

function depleteCircleTrees(s: GameState, b: Building, amount: number): void {
  // Shuffled, so a stand thins unevenly instead of being shaved off one row at a time.
  for (const t of scatteredCircleTiles(s, b, (t) => t.type === 'forest' && t.trees > 0.05)) {
    if (amount <= 0) break;
    const take = Math.min(amount, t.trees - 0.05);
    t.trees -= take;
    amount -= take;
  }
}

function clampTile(v: number): number {
  return Math.max(0, Math.min(47.5, v));
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
