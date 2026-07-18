import {
  GameState,
  Building,
  Citizen,
  BUILDING_DEFS,
  SEASON_LENGTH,
  SEASONS,
  FOOD_PER_CITIZEN_PER_SEASON,
  HEAT_PER_CITIZEN_WINTER,
  FIREWOOD_HEAT,
  COAL_HEAT,
  CLOTHING_PER_CITIZEN_WINTER,
  TOOL_WEAR_PER_WORKER,
  NO_TOOLS_PENALTY,
  SICKNESS_CHANCE,
  GATHER_FOOD_PER_SEASON,
  FISH_FOOD_PER_SEASON,
  HUNT_FOOD_PER_SEASON,
  HUNT_LEATHER_PER_SEASON,
  RANCH_FOOD_PER_SEASON,
  RANCH_LEATHER_PER_SEASON,
  RANCH_LIVESTOCK_IDEAL,
  LIVESTOCK_GROWTH_PER_SEASON,
  LUMBER_WOOD_PER_SEASON,
  WOODCUT_FIREWOOD_PER_SEASON,
  WOODCUT_WOOD_PER_SEASON,
  FARM_FOOD_PER_WORKER,
  QUARRY_STONE_PER_SEASON,
  MINE_COAL_PER_SEASON,
  MINE_IRON_PER_SEASON,
  SMITH_IRON_IN,
  SMITH_IRON_TOOLS_OUT,
  SMITH_STEEL_IRON_IN,
  SMITH_STEEL_COAL_IN,
  SMITH_STEEL_TOOLS_OUT,
  TAILOR_LEATHER_IN,
  TAILOR_CLOTHING_OUT,
  BASE_WALK_SPEED,
  PATH_DIRT_PLAN,
  PATH_DIRT,
  PATH_STONE,
  PATH_BUILD_TILES_PER_SEC,
  TRADE_VALUE,
  MERCHANT_MARGIN,
  MERCHANT_VISIT_EVERY,
  ResourceKind,
} from '../types';
import { storageCap, housingCapacity, buildingCenter } from './state';
import { forestInCircle, nearbyStone, nearbyWater } from './buildings';
import { getTile } from './world';
import { pathSpeedMult, nextPlannedPath } from './paths';

export type LogKind = 'info' | 'good' | 'bad';
export type LogFn = (msg: string, kind?: LogKind) => void;

// Local-resource "ideal" amounts: yields scale from MIN_FACTOR up to 1.
const FOREST_CIRCLE_IDEAL = 24;
const WATER_IDEAL = 8;
const STONE_IDEAL = 6;
const MIN_FACTOR = 0.15;

const TREE_REGROW = 0.02;
const LUMBER_DEPLETE = 0.06;

/** Advance the whole simulation by `dt` seconds (already scaled by game speed). */
export function update(s: GameState, dt: number, log: LogFn): void {
  if (s.gameOver) return;

  reconcileWorkers(s);
  advanceConstruction(s, dt, log);
  assignHomesAndJobs(s);
  produce(s, dt);
  buildPaths(s, dt);
  regrowForest(s, dt);
  moveCitizens(s, dt);

  s.seasonTimer += dt;
  if (s.seasonTimer >= SEASON_LENGTH) {
    s.seasonTimer -= SEASON_LENGTH;
    endSeason(s, log);
  }
}

function reconcileWorkers(s: GameState): void {
  const alive = new Set(s.citizens.map((c) => c.id));
  for (const b of s.buildings) b.workers = b.workers.filter((id) => alive.has(id));
}

// ---- Jobs / builders --------------------------------------------------------

function advanceConstruction(s: GameState, dt: number, log: LogFn): void {
  const builders = s.citizens.filter((c) => c.jobId === null).length;
  const speed = 0.4 + Math.min(builders, 5) * 0.4;
  for (const b of s.buildings) {
    if (b.built) continue;
    b.progress += dt * speed;
    if (b.progress >= BUILDING_DEFS[b.type].buildTime) {
      b.built = true;
      log(`${BUILDING_DEFS[b.type].name} built`, 'good');
    }
  }
}

function assignHomesAndJobs(s: GameState): void {
  // Normalise any building missing a target (robust to older saves).
  for (const b of s.buildings) {
    if (typeof b.desiredWorkers !== 'number') b.desiredWorkers = BUILDING_DEFS[b.type].jobs;
  }

  // Homes.
  const occ = new Map<number, number>();
  for (const c of s.citizens) if (c.homeId !== null) occ.set(c.homeId, (occ.get(c.homeId) ?? 0) + 1);
  const houses = s.buildings.filter((b) => b.built && b.type === 'house');
  for (const c of s.citizens) {
    if (c.homeId !== null) continue;
    for (const h of houses) {
      if ((occ.get(h.id) ?? 0) < 4) {
        c.homeId = h.id;
        occ.set(h.id, (occ.get(h.id) ?? 0) + 1);
        break;
      }
    }
  }

  const byId = new Map(s.citizens.map((c) => [c.id, c]));
  // Free workers above each building's desired target.
  for (const b of s.buildings) {
    const target = b.built ? Math.min(BUILDING_DEFS[b.type].jobs, b.desiredWorkers) : 0;
    while (b.workers.length > target) {
      const id = b.workers.pop()!;
      const c = byId.get(id);
      if (c) c.jobId = null;
    }
  }
  // Fill open slots from the current builder pool.
  const employed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) employed.add(id);
  const avail = s.citizens.filter((c) => !employed.has(c.id));
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
  // Anyone not employed is a builder.
  const stillEmployed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) stillEmployed.add(id);
  for (const c of s.citizens) if (!stillEmployed.has(c.id)) c.jobId = null;
}

// ---- Production -------------------------------------------------------------

function circleFactor(s: GameState, b: Building): number {
  return clamp(forestInCircle(s, b) / FOREST_CIRCLE_IDEAL, MIN_FACTOR, 1);
}
function waterFactor(s: GameState, b: Building): number {
  return clamp(nearbyWater(s, b) / WATER_IDEAL, MIN_FACTOR, 1);
}
function stoneFactor(s: GameState, b: Building): number {
  const def = BUILDING_DEFS[b.type];
  return clamp(nearbyStone(s, def, b.x, b.y) / STONE_IDEAL, MIN_FACTOR, 1);
}

function produce(s: GameState, dt: number): void {
  const cap = storageCap(s);
  const per = dt / SEASON_LENGTH;

  // Tools help all labour; when the stockpile is empty, output is penalised.
  const toolFactor = s.resources.tools > 0 ? 1 : NO_TOOLS_PENALTY;
  let employed = 0;
  for (const b of s.buildings) if (b.built) employed += b.workers.length;
  s.resources.tools = Math.max(0, s.resources.tools - employed * TOOL_WEAR_PER_WORKER * per);

  for (const b of s.buildings) {
    if (!b.built || b.workers.length === 0) continue;
    const w = b.workers.length;
    const tf = toolFactor;
    switch (b.type) {
      case 'gatherer':
        add(s, 'food', GATHER_FOOD_PER_SEASON * w * circleFactor(s, b) * tf * per, cap);
        break;
      case 'fishing':
        add(s, 'food', FISH_FOOD_PER_SEASON * w * waterFactor(s, b) * tf * per, cap);
        break;
      case 'hunting': {
        const f = circleFactor(s, b);
        add(s, 'food', HUNT_FOOD_PER_SEASON * w * f * tf * per, cap);
        add(s, 'leather', HUNT_LEATHER_PER_SEASON * w * f * tf * per, cap);
        break;
      }
      case 'ranch': {
        const herd = Math.min(1, s.resources.livestock / RANCH_LIVESTOCK_IDEAL);
        if (herd > 0) {
          add(s, 'food', RANCH_FOOD_PER_SEASON * w * herd * tf * per, cap);
          add(s, 'leather', RANCH_LEATHER_PER_SEASON * w * herd * tf * per, cap);
        }
        break;
      }
      case 'lumberyard': {
        const f = circleFactor(s, b);
        add(s, 'wood', LUMBER_WOOD_PER_SEASON * w * f * tf * per, cap);
        depleteCircleTrees(s, b, LUMBER_DEPLETE * w * f * dt);
        tendCircle(s, b, dt);
        break;
      }
      case 'woodcutter': {
        const want = WOODCUT_WOOD_PER_SEASON * w * per;
        const r = ratio(s.resources.wood, want);
        if (r > 0) {
          s.resources.wood -= want * r;
          add(s, 'firewood', WOODCUT_FIREWOOD_PER_SEASON * w * r * tf * per, cap);
        }
        break;
      }
      case 'quarry':
        add(s, 'stone', QUARRY_STONE_PER_SEASON * w * stoneFactor(s, b) * tf * per, cap);
        break;
      case 'mine': {
        const kind: ResourceKind = b.output === 'iron' ? 'iron' : 'coal';
        const rate = b.output === 'iron' ? MINE_IRON_PER_SEASON : MINE_COAL_PER_SEASON;
        add(s, kind, rate * w * stoneFactor(s, b) * tf * per, cap);
        break;
      }
      case 'blacksmith': {
        if (b.recipe === 'steel') {
          const ironWant = SMITH_STEEL_IRON_IN * w * per;
          const coalWant = SMITH_STEEL_COAL_IN * w * per;
          const r = Math.min(ratio(s.resources.iron, ironWant), ratio(s.resources.coal, coalWant));
          if (r > 0) {
            s.resources.iron -= ironWant * r;
            s.resources.coal -= coalWant * r;
            add(s, 'tools', SMITH_STEEL_TOOLS_OUT * w * r * tf * per, cap);
          }
        } else {
          const ironWant = SMITH_IRON_IN * w * per;
          const r = ratio(s.resources.iron, ironWant);
          if (r > 0) {
            s.resources.iron -= ironWant * r;
            add(s, 'tools', SMITH_IRON_TOOLS_OUT * w * r * tf * per, cap);
          }
        }
        break;
      }
      case 'tailor': {
        const want = TAILOR_LEATHER_IN * w * per;
        const r = ratio(s.resources.leather, want);
        if (r > 0) {
          s.resources.leather -= want * r;
          add(s, 'clothing', TAILOR_CLOTHING_OUT * w * r * tf * per, cap);
        }
        break;
      }
      case 'farm': {
        const season = SEASONS[s.season];
        if (season === 'Spring' || season === 'Summer') {
          b.growth = Math.min(1, b.growth + dt / (SEASON_LENGTH * 1.6));
        }
        break;
      }
    }
  }
}

// ---- Paths: builders complete planned tiles ---------------------------------

function buildPaths(s: GameState, dt: number): void {
  const builders = s.citizens.filter((c) => c.jobId === null).length;
  if (builders === 0) return;
  s.pathProgress += PATH_BUILD_TILES_PER_SEC * builders * dt;
  while (s.pathProgress >= 1) {
    const idx = nextPlannedPath(s);
    if (idx < 0) {
      s.pathProgress = 0;
      break;
    }
    s.paths[idx] = s.paths[idx] === PATH_DIRT_PLAN ? PATH_DIRT : PATH_STONE;
    s.pathProgress -= 1;
  }
}

// ---- Season turnover --------------------------------------------------------

function endSeason(s: GameState, log: LogFn): void {
  s.season = (s.season + 1) % SEASONS.length;
  if (s.season === 0) {
    s.year++;
    log(`A new year begins — Year ${s.year}`, 'info');
  }
  const season = SEASONS[s.season];
  const cap = storageCap(s);

  if (season === 'Autumn') {
    let harvested = 0;
    for (const b of s.buildings) {
      if (b.built && b.type === 'farm' && b.workers.length > 0) {
        harvested += b.workers.length * FARM_FOOD_PER_WORKER * b.growth;
        b.growth = 0;
      }
    }
    if (harvested > 1) {
      add(s, 'food', harvested, cap);
      log(`Harvest brought in ${Math.round(harvested)} food`, 'good');
    }
  }

  // Livestock breeds if a ranch is keeping them.
  if (s.resources.livestock > 0 && s.buildings.some((b) => b.built && b.type === 'ranch')) {
    s.resources.livestock = Math.min(cap, s.resources.livestock * (1 + LIVESTOCK_GROWTH_PER_SEASON));
  }

  let pop = s.citizens.length;
  if (pop === 0) return;

  // Food.
  const foodNeed = pop * FOOD_PER_CITIZEN_PER_SEASON;
  s.resources.food -= foodNeed;
  if (s.resources.food < 0) {
    const starved = Math.min(pop, Math.ceil(-s.resources.food / FOOD_PER_CITIZEN_PER_SEASON));
    s.resources.food = 0;
    killCitizens(s, starved);
    log(`${starved} villager${starved > 1 ? 's' : ''} starved`, 'bad');
  }

  // Winter: heating (firewood then coal), then cold-sickness for the unclothed.
  if (season === 'Winter' && s.citizens.length > 0) {
    let heatNeed = s.citizens.length * HEAT_PER_CITIZEN_WINTER;
    const burnWood = Math.min(s.resources.firewood, heatNeed / FIREWOOD_HEAT);
    s.resources.firewood -= burnWood;
    heatNeed -= burnWood * FIREWOOD_HEAT;
    if (heatNeed > 0 && s.resources.coal > 0) {
      const burnCoal = Math.min(s.resources.coal, Math.ceil(heatNeed / COAL_HEAT));
      s.resources.coal -= burnCoal;
      heatNeed -= burnCoal * COAL_HEAT;
    }
    if (heatNeed > 0.001) {
      const froze = Math.min(s.citizens.length, Math.ceil(heatNeed / HEAT_PER_CITIZEN_WINTER));
      killCitizens(s, froze);
      log(`${froze} villager${froze > 1 ? 's' : ''} froze in the cold`, 'bad');
    }

    // Clothing: worn out over winter; the unclothed may fall ill.
    const survivors = s.citizens.length;
    const clothed = Math.min(s.resources.clothing, survivors);
    s.resources.clothing = Math.max(0, s.resources.clothing - clothed);
    const unclothed = survivors - clothed;
    let sick = 0;
    for (let k = 0; k < unclothed; k++) if (Math.random() < SICKNESS_CHANCE) sick++;
    if (sick > 0) {
      killCitizens(s, sick);
      log(`${sick} villager${sick > 1 ? 's' : ''} fell ill without warm clothing`, 'bad');
    }
  }

  // Births.
  pop = s.citizens.length;
  if (pop > 0) {
    const freeHousing = housingCapacity(s) - pop;
    const comfortable = s.resources.food > pop * FOOD_PER_CITIZEN_PER_SEASON * 2;
    if (freeHousing >= 1 && comfortable) {
      const births =
        freeHousing >= 2 && s.resources.food > pop * FOOD_PER_CITIZEN_PER_SEASON * 4 ? 2 : 1;
      for (let i = 0; i < births; i++) spawnCitizen(s);
      log(births > 1 ? `${births} villagers joined the village` : `A villager joined the village`, 'good');
    }
  }

  updateMerchant(s, log);

  if (s.citizens.length === 0) {
    s.gameOver = true;
    log('Your village has died out.', 'bad');
  }
}

// ---- Merchant / trading -----------------------------------------------------

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
      m.timer = 1; // stays for one season
      m.stock = {
        livestock: 6,
        iron: 24,
        coal: 24,
        tools: 12,
        food: 40,
        clothing: 10,
      };
      log('A merchant has docked — barter at the trading post', 'good');
    }
  }
}

export interface TradeResult {
  ok: boolean;
  reason?: string;
  gave?: number;
}

/**
 * Barter `getQty` of `get` from the merchant, paying in `give` by relative value
 * (the merchant keeps a margin). Returns how much `give` was spent.
 */
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
  const getValue = TRADE_VALUE[get] * getQty;
  const giveQty = Math.ceil(getValue / MERCHANT_MARGIN / TRADE_VALUE[give]);
  if (s.resources[give] < giveQty) return { ok: false, reason: `Need ${giveQty} ${give}` };
  const cap = storageCap(s);
  s.resources[give] -= giveQty;
  s.resources[get] = Math.min(cap, s.resources[get] + getQty);
  m.stock[get] = stock - getQty;
  return { ok: true, gave: giveQty };
}

/** How much `give` it costs to obtain `qty` of `get` right now. */
export function tradeCost(give: ResourceKind, get: ResourceKind, qty: number): number {
  return Math.ceil((TRADE_VALUE[get] * qty) / MERCHANT_MARGIN / TRADE_VALUE[give]);
}

// ---- Population helpers -----------------------------------------------------

function killCitizens(s: GameState, n: number): void {
  for (let i = 0; i < n && s.citizens.length > 0; i++) {
    let idx = 0;
    for (let k = 1; k < s.citizens.length; k++) if (s.citizens[k].age > s.citizens[idx].age) idx = k;
    const [dead] = s.citizens.splice(idx, 1);
    for (const b of s.buildings) b.workers = b.workers.filter((id) => id !== dead.id);
  }
}

function spawnCitizen(s: GameState): void {
  const house = s.buildings.find((b) => b.built && b.type === 'house' && countHome(s, b.id) < 4);
  const at = house ? buildingCenter(house) : centreOfVillage(s);
  s.citizens.push({
    id: s.nextId++,
    x: at.x + (Math.random() - 0.5),
    y: at.y + (Math.random() - 0.5),
    tx: at.x,
    ty: at.y,
    homeId: house ? house.id : null,
    jobId: null,
    state: 'wander',
    timer: Math.random() * 2,
    age: 1,
  });
}

function countHome(s: GameState, homeId: number): number {
  let n = 0;
  for (const c of s.citizens) if (c.homeId === homeId) n++;
  return n;
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

// ---- Movement ---------------------------------------------------------------

function moveCitizens(s: GameState, dt: number): void {
  for (const c of s.citizens) {
    const dx = c.tx - c.x;
    const dy = c.ty - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.08) {
      const speed = BASE_WALK_SPEED * pathSpeedMult(s, c.x, c.y);
      const step = Math.min(dist, speed * dt);
      c.x += (dx / dist) * step;
      c.y += (dy / dist) * step;
    } else {
      c.timer -= dt;
      if (c.timer <= 0) pickNextTarget(s, c);
    }
  }
}

function pickNextTarget(s: GameState, c: Citizen): void {
  const job = c.jobId !== null ? s.buildings.find((b) => b.id === c.jobId) : null;
  const home = c.homeId !== null ? s.buildings.find((b) => b.id === c.homeId) : null;

  if (job && job.built) {
    if (c.state === 'working') {
      const h = home ? buildingCenter(home) : centreOfVillage(s);
      c.tx = h.x + jitter();
      c.ty = h.y + jitter();
      c.state = 'toHome';
      c.timer = 3 + Math.random() * 3;
    } else {
      const w = buildingCenter(job);
      c.tx = w.x + jitter();
      c.ty = w.y + jitter();
      c.state = 'working';
      c.timer = 3 + Math.random() * 4;
    }
    return;
  }

  const site = s.buildings.find((b) => !b.built);
  const target = site ? buildingCenter(site) : centreOfVillage(s);
  const spread = site ? 2.5 : 8;
  c.tx = clampTile(target.x + (Math.random() - 0.5) * spread);
  c.ty = clampTile(target.y + (Math.random() - 0.5) * spread);
  c.state = 'wander';
  c.timer = 2 + Math.random() * 3;
}

// ---- Forest upkeep ----------------------------------------------------------

function regrowForest(s: GameState, dt: number): void {
  const n = s.tiles.length;
  const samples = 40;
  for (let i = 0; i < samples; i++) {
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

// ---- helpers ----------------------------------------------------------------

function add(s: GameState, kind: ResourceKind, amount: number, cap: number): void {
  s.resources[kind] = Math.max(0, Math.min(cap, s.resources[kind] + amount));
}

function ratio(have: number, want: number): number {
  return want > 0 ? Math.min(1, have / want) : 0;
}

function jitter(): number {
  return (Math.random() - 0.5) * 1.4;
}

function clampTile(v: number): number {
  return Math.max(0, Math.min(47.5, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
