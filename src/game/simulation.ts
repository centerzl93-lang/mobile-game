import {
  GameState,
  Building,
  Citizen,
  ResourceKind,
  BUILDING_DEFS,
  MAP_W,
  SEASON_LENGTH,
  SEASONS,
  BASE_WALK_SPEED,
  CARRY_CAP,
  WORK_SECONDS,
  PATH_DIRT_PLAN,
  PATH_STONE_PLAN,
  PATH_DIRT,
  PATH_STONE,
  FOOD_PER_CITIZEN_PER_SEASON,
  HEAT_PER_CITIZEN_WINTER,
  FIREWOOD_HEAT,
  COAL_HEAT,
  CLOTHING_PER_CITIZEN_WINTER,
  TOOL_WEAR_PER_WORKER,
  NO_TOOLS_PENALTY,
  SICKNESS_CHANCE,
  RANCH_LIVESTOCK_IDEAL,
  LIVESTOCK_GROWTH_PER_SEASON,
  FARM_FOOD_PER_WORKER,
  TRADE_VALUE,
  MERCHANT_MARGIN,
  MERCHANT_VISIT_EVERY,
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
  isAdult,
} from '../types';
import { housingCapacity, buildingCenter, makeCitizen } from './state';
import { forestInCircle, nearbyStone, nearbyWater } from './buildings';
import { getTile } from './world';
import { pathSpeedMult } from './paths';
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
  foodVarietyStored,
} from './storage';

export type LogKind = 'info' | 'good' | 'bad';
export type LogFn = (msg: string, kind?: LogKind) => void;

// Local balance for the per-trip economy.
const FOREST_CIRCLE_IDEAL = 24;
const WATER_IDEAL = 8;
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

export function update(s: GameState, dt: number, log: LogFn): void {
  if (s.gameOver) return;
  reconcileWorkers(s);
  assignHomesAndJobs(s);
  const toolFactor = totalStored(s, 'tools') > 0 ? 1 : NO_TOOLS_PENALTY;
  for (const c of s.citizens) runCitizen(s, c, dt, toolFactor);
  processFires(s, dt, log);
  regrowForest(s, dt);

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
}

// ---- movement ----
function stepTo(s: GameState, c: Citizen, dt: number): boolean {
  const dx = c.tx - c.x;
  const dy = c.ty - c.y;
  const d = Math.hypot(dx, dy);
  if (d <= ARRIVE) return true;
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

// ---- per-citizen behaviour ----
function runCitizen(s: GameState, c: Citizen, dt: number, toolFactor: number): void {
  if (!isAdult(c) || c.sick) {
    wander(s, c, dt); // children play; the sick rest — neither can work or haul
    return;
  }
  const job = c.jobId !== null ? s.buildings.find((b) => b.id === c.jobId) : null;
  if (job && job.built) runWorker(s, c, job, dt, toolFactor);
  else runBuilder(s, c, dt);
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
  // 1. Carrying output? Haul it to the nearest barn with room.
  if (c.carry) {
    const barn = nearestBarnWithRoom(s, { x: c.x, y: c.y });
    if (!barn) {
      goTo(c, buildingCenter(b));
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
      goTo(c, buildingCenter(b)); // wait at the shop
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
  goTo(c, buildingCenter(b));
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

function factorCircle(s: GameState, b: Building): number {
  return clamp(forestInCircle(s, b) / FOREST_CIRCLE_IDEAL, MIN_FACTOR, 1);
}
function factorWater(s: GameState, b: Building): number {
  return clamp(nearbyWater(s, b) / WATER_IDEAL, MIN_FACTOR, 1);
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
      const herd = Math.min(1, totalStored(s, 'livestock') / RANCH_LIVESTOCK_IDEAL);
      if (herd <= 0) return null;
      const f = herd * tf;
      return Math.random() < 0.7
        ? { kind: 'meat', amount: LOAD_FOOD * f }
        : { kind: 'leather', amount: LOAD_MAT * f };
    }
    case 'lumberyard': {
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
      const have = b.store.grain ?? 0;
      if (have <= 0) return null;
      const take = Math.min(CARRY_CAP, have);
      b.store.grain = have - take;
      if ((b.store.grain ?? 0) <= 0) delete b.store.grain;
      return { kind: 'grain', amount: take };
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
    const action: SiteAction | null = fully
      ? { site: b, action: 'build' }
      : fetchKind
        ? { site: b, action: 'fetch', kind: fetchKind }
        : null;
    if (!action) continue;
    const p = buildingCenter(b);
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
    const site = nearestUnbuiltNeeding(s, c, kind);
    if (site) {
      goTo(c, buildingCenter(site));
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

  // Find a construction site to work.
  const pick = pickSite(s, c);
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
    goTo(c, buildingCenter(pick.site));
    if (stepTo(s, c, dt)) {
      pick.site.progress += dt;
      if (pick.site.progress >= BUILDING_DEFS[pick.site.type].buildTime) {
        finishConstruction(pick.site);
      }
    }
    return;
  }

  // No sites: build a planned path if any, else wander.
  if (!buildPath(s, c, dt)) wander(s, c, dt);
}

function nearestUnbuiltNeeding(s: GameState, c: Citizen, kind: ResourceKind): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of s.buildings) {
    if (b.built) continue;
    const cost = BUILDING_DEFS[b.type].cost;
    if ((b.store[kind] ?? 0) >= (cost[kind] ?? 0)) continue;
    const p = buildingCenter(b);
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

function buildPath(s: GameState, c: Citizen, dt: number): boolean {
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < s.paths.length; i++) {
    const v = s.paths[i];
    if (v !== PATH_DIRT_PLAN && v !== PATH_STONE_PLAN) continue;
    const tx = i % MAP_W;
    const ty = (i / MAP_W) | 0;
    const d = (tx + 0.5 - c.x) ** 2 + (ty + 0.5 - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return false;
  const tx = bestIdx % MAP_W;
  const ty = (bestIdx / MAP_W) | 0;
  c.tx = tx + 0.5;
  c.ty = ty + 0.5;
  if (stepTo(s, c, dt)) {
    const v = s.paths[bestIdx];
    if (v === PATH_STONE_PLAN) {
      if (takeNearest(s, { x: tx, y: ty }, 'stone', 1) >= 1) s.paths[bestIdx] = PATH_STONE;
    } else {
      s.paths[bestIdx] = PATH_DIRT;
    }
  }
  return true;
}

function wander(s: GameState, c: Citizen, dt: number): void {
  if (stepTo(s, c, dt)) {
    c.timer -= dt;
    if (c.timer <= 0) {
      const centre = centreOfVillage(s);
      c.tx = clampTile(centre.x + (Math.random() - 0.5) * 8);
      c.ty = clampTile(centre.y + (Math.random() - 0.5) * 8);
      c.timer = 2 + Math.random() * 3;
    }
  }
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

  // Farms grow through spring/summer; deposit the harvest into their store at autumn.
  for (const b of s.buildings) {
    if (b.built && b.type === 'farm') {
      if (season === 'Spring' || season === 'Summer') b.growth = Math.min(1, b.growth + 0.5);
      if (season === 'Autumn' && b.workers.length > 0) {
        const yield_ = b.workers.length * FARM_FOOD_PER_WORKER * b.growth;
        if (yield_ > 1) {
          b.store.grain = (b.store.grain ?? 0) + yield_;
          log(`A field yielded ${Math.round(yield_)} grain to harvest`, 'good');
        }
        b.growth = 0;
      }
    }
  }

  // Livestock breeds if a ranch keeps them.
  const herd = totalStored(s, 'livestock');
  if (herd > 0 && s.buildings.some((b) => b.built && b.type === 'ranch')) {
    addNearest(s, centreOfVillage(s), 'livestock', herd * LIVESTOCK_GROWTH_PER_SEASON);
  }

  let pop = s.citizens.length;
  if (pop === 0) return;

  // Tools wear from labour.
  let employed = 0;
  for (const b of s.buildings) if (b.built) employed += b.workers.length;
  consume(s, 'tools', employed * TOOL_WEAR_PER_WORKER);

  // Food — adults eat a full ration, children half.
  const adults = s.citizens.filter(isAdult).length;
  const children = s.citizens.length - adults;
  const foodNeed = (adults + children * CHILD_FOOD_FACTOR) * FOOD_PER_CITIZEN_PER_SEASON;
  const shortFood = consumeFood(s, foodNeed);
  if (shortFood > 0) {
    const starved = Math.min(pop, Math.ceil(shortFood / FOOD_PER_CITIZEN_PER_SEASON));
    killCitizens(s, starved);
    log(`${starved} villager${starved > 1 ? 's' : ''} starved`, 'bad');
  }

  // Winter: heat (firewood then coal), then cold-sickness for the unclothed.
  if (season === 'Winter' && s.citizens.length > 0) {
    // Each villager needs heat; those living in a stone house need much less.
    const stoneHomes = new Set(
      s.buildings.filter((b) => b.built && b.type === 'stonehouse').map((b) => b.id),
    );
    let heatNeed = 0;
    for (const c of s.citizens) {
      const factor = c.homeId !== null && stoneHomes.has(c.homeId) ? STONE_HOUSE_HEAT_FACTOR : 1;
      heatNeed += HEAT_PER_CITIZEN_WINTER * factor;
    }
    // firewood is 1 heat each; consume() returns the shortfall (heat still needed).
    let remaining = consume(s, 'firewood', heatNeed) * FIREWOOD_HEAT;
    if (remaining > 0) {
      const coalNeeded = Math.ceil(remaining / COAL_HEAT);
      remaining = consume(s, 'coal', coalNeeded) * COAL_HEAT;
    }
    if (remaining > 0.001) {
      const froze = Math.min(s.citizens.length, Math.ceil(remaining / HEAT_PER_CITIZEN_WINTER));
      killCitizens(s, froze);
      log(`${froze} villager${froze > 1 ? 's' : ''} froze in the cold`, 'bad');
    }

    const survivors = s.citizens.length;
    const clothShort = consume(s, 'clothing', survivors * CLOTHING_PER_CITIZEN_WINTER);
    const unclothed = Math.floor(clothShort / CLOTHING_PER_CITIZEN_WINTER);
    const sickChance = Math.min(1, SICKNESS_CHANCE * (1 + (1 - avgHealth(s) / 100)));
    let sick = 0;
    for (let k = 0; k < unclothed; k++) if (Math.random() < sickChance) sick++;
    if (sick > 0) {
      killCitizens(s, sick);
      log(`${sick} villager${sick > 1 ? 's' : ''} fell ill without warm clothing`, 'bad');
    }
  }

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

// ---- merchant ----
function updateMerchant(s: GameState, log: LogFn): void {
  const m = s.merchant;
  const hasPost = s.buildings.some((b) => b.built && b.type === 'trading' && b.workers.length > 0);
  if (m.present) {
    m.timer -= 1;
    if (m.timer <= 0) {
      m.present = false;
      m.stock = {};
      m.timer = MERCHANT_VISIT_EVERY;
      log('The merchant sailed away', 'info');
    }
  } else if (hasPost) {
    m.timer -= 1;
    if (m.timer <= 0) {
      m.present = true;
      m.timer = 1;
      m.stock = { livestock: 6, iron: 120, coal: 120, tools: 80, grain: 120, fish: 80, clothing: 80 };
      log('A merchant has docked — barter at the trading post', 'good');
    }
  }
}

export interface TradeResult {
  ok: boolean;
  reason?: string;
  gave?: number;
}

export function tradeWithMerchant(
  s: GameState,
  give: ResourceKind,
  get: ResourceKind,
  getQty: number,
): TradeResult {
  const m = s.merchant;
  if (!m.present) return { ok: false, reason: 'No merchant here' };
  if (give === get) return { ok: false, reason: 'Pick two different goods' };
  const stock = m.stock[get] ?? 0;
  if (getQty <= 0 || stock < getQty) return { ok: false, reason: 'Not enough in stock' };
  const giveQty = Math.ceil((TRADE_VALUE[get] * getQty) / MERCHANT_MARGIN / TRADE_VALUE[give]);
  if (totalStored(s, give) < giveQty) return { ok: false, reason: `Need ${giveQty} ${give}` };
  const post = s.buildings.find((b) => b.built && b.type === 'trading');
  const pos = post ? buildingCenter(post) : centreOfVillage(s);
  takeNearest(s, pos, give, giveQty);
  addNearest(s, pos, get, getQty);
  m.stock[get] = stock - getQty;
  return { ok: true, gave: giveQty };
}

export function tradeCost(give: ResourceKind, get: ResourceKind, qty: number): number {
  return Math.ceil((TRADE_VALUE[get] * qty) / MERCHANT_MARGIN / TRADE_VALUE[give]);
}

// ---- population helpers ----
function killCitizens(s: GameState, n: number): void {
  for (let i = 0; i < n && s.citizens.length > 0; i++) {
    let idx = 0;
    for (let k = 1; k < s.citizens.length; k++) if (s.citizens[k].age > s.citizens[idx].age) idx = k;
    removeCitizen(s, s.citizens[idx]);
  }
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
  const variety = foodVarietyStored(s); // distinct food types in stock (0..4)
  const healthTarget = clamp(40 + 15 * variety - (foodShort ? 30 : 0), 0, 100);
  const headroom = housingCapacity(s) - pop > 0;
  const clothed = totalStored(s, 'clothing') >= pop;
  const comfortable = totalFood(s) > pop * FOOD_PER_CITIZEN_PER_SEASON;
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

/** Nomads occasionally settle when there is spare housing and a food surplus. */
function immigrate(s: GameState, log: LogFn): void {
  const pop = s.citizens.length;
  if (pop === 0) return;
  const room = housingCapacity(s) - pop;
  if (room < IMMIGRATION_MIN) return;
  if (totalFood(s) <= pop * FOOD_PER_CITIZEN_PER_SEASON * 1.5) return; // need a comfortable surplus
  if (Math.random() >= IMMIGRATION_CHANCE) return;

  const band = IMMIGRATION_MIN + Math.floor(Math.random() * (IMMIGRATION_MAX - IMMIGRATION_MIN + 1));
  const n = Math.min(room, band);
  const centre = centreOfVillage(s);
  let sick = 0;
  for (let i = 0; i < n; i++) {
    const age = Math.floor(ADULT_AGE + 2 + Math.random() * (OLD_AGE_START - ADULT_AGE - 4));
    const c = makeCitizen(
      s,
      Math.random() < 0.5 ? 'm' : 'f',
      age,
      centre.x + (Math.random() - 0.5) * 2,
      centre.y + (Math.random() - 0.5) * 2,
    );
    if (Math.random() < IMMIGRANT_SICK_CHANCE) {
      c.sick = true;
      sick++;
    }
    s.citizens.push(c);
  }
  log(`${n} nomad${n > 1 ? 's' : ''} settled in your village`, 'good');
  if (sick > 0) log(`${sick} newcomer${sick > 1 ? 's' : ''} arrived sick`, 'bad');
}

// ---- disease & fire ----
function dist2c(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function diseaseSeason(s: GameState, log: LogFn): void {
  const pop = s.citizens.length;
  if (pop === 0) return;

  // Outbreak: infect a share of the healthy (likelier when the village is unwell).
  if (pop >= 4 && Math.random() < DISEASE_CHANCE) {
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
    if (totalStored(s, 'medicine') >= 1) {
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
  const flammable = s.buildings.filter((b) => b.built && b.type !== 'well' && !b.fireTimer);
  if (flammable.length === 0) return;
  if (Math.random() < FIRE_CHANCE) tryIgnite(s, flammable[(Math.random() * flammable.length) | 0], log, true);
}

/** Testing/debug: attempt to set a building alight (respecting well protection). */
export function igniteBuilding(s: GameState, b: Building, log: LogFn): void {
  tryIgnite(s, b, log, true);
}

function tryIgnite(s: GameState, b: Building, log: LogFn, announce: boolean): void {
  if (b.fireTimer || b.type === 'well') return;
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
  const bd = BUILDING_DEFS[b.type];
  const out: Building[] = [];
  for (const o of s.buildings) {
    if (o === b || !o.built || o.type === 'well' || o.fireTimer) continue;
    const od = BUILDING_DEFS[o.type];
    if (b.x - 1 < o.x + od.w && b.x + bd.w + 1 > o.x && b.y - 1 < o.y + od.h && b.y + bd.h + 1 > o.y) out.push(o);
  }
  return out;
}

function removeBuilding(s: GameState, b: Building): void {
  const idx = s.buildings.indexOf(b);
  if (idx >= 0) s.buildings.splice(idx, 1);
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
  const def = BUILDING_DEFS[b.type];
  const r = def.workRadius ?? 4;
  const cx = b.x + def.w / 2;
  const cy = b.y + def.h / 2;
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
