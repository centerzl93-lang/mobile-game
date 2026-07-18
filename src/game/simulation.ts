import {
  GameState,
  Building,
  Citizen,
  BUILDING_DEFS,
  SEASON_LENGTH,
  SEASONS,
  FOOD_PER_CITIZEN_PER_SEASON,
  FIREWOOD_PER_CITIZEN_WINTER,
  ResourceKind,
} from '../types';
import { storageCap, housingCapacity, buildingCenter } from './state';
import { nearbyForest } from './buildings';
import { getTile } from './world';

export type LogKind = 'info' | 'good' | 'bad';
export type LogFn = (msg: string, kind?: LogKind) => void;

// Production rates (per worker, per second).
const GATHER_RATE = 0.9;
const WOOD_RATE = 0.6;
const FIREWOOD_RATE = 0.5;
const FARM_YIELD = 26; // food per worker at a full-grown autumn harvest
const TREE_REGROW = 0.004; // per second, per forest tile
const WALK_SPEED = 2.6; // tiles per second

/** Advance the whole simulation by `dt` seconds (already scaled by game speed). */
export function update(s: GameState, dt: number, log: LogFn): void {
  if (s.gameOver) return;

  reconcileWorkers(s);
  advanceConstruction(s, dt, log);
  assignHomesAndJobs(s);
  produce(s, dt);
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
  for (const b of s.buildings) {
    b.workers = b.workers.filter((id) => alive.has(id));
  }
}

function advanceConstruction(s: GameState, dt: number, log: LogFn): void {
  // Builders = citizens without a job speed things up; base rate always applies.
  const idle = s.citizens.filter((c) => c.jobId === null).length;
  const speed = 1 + Math.min(idle, 4) * 0.25;
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
  // Homes: give every citizen a home if a house has room.
  const occ = new Map<number, number>();
  for (const c of s.citizens) {
    if (c.homeId !== null) occ.set(c.homeId, (occ.get(c.homeId) ?? 0) + 1);
  }
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

  // Jobs: fill open slots with unemployed citizens.
  const employed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) employed.add(id);
  const jobless = s.citizens.filter((c) => !employed.has(c.id));
  let ji = 0;
  for (const b of s.buildings) {
    if (!b.built) continue;
    const slots = BUILDING_DEFS[b.type].jobs;
    while (b.workers.length < slots && ji < jobless.length) {
      const c = jobless[ji++];
      b.workers.push(c.id);
      c.jobId = b.id;
    }
  }
  // Clear stale jobId for anyone not in a worker list.
  const stillEmployed = new Set<number>();
  for (const b of s.buildings) for (const id of b.workers) stillEmployed.add(id);
  for (const c of s.citizens) if (!stillEmployed.has(c.id)) c.jobId = null;
}

function produce(s: GameState, dt: number): void {
  const cap = storageCap(s);
  for (const b of s.buildings) {
    if (!b.built || b.workers.length === 0) continue;
    const w = b.workers.length;
    switch (b.type) {
      case 'gatherer': {
        const forest = Math.min(nearbyForest(s, b), 6) / 6; // 0..1
        add(s, 'food', w * GATHER_RATE * (0.35 + forest) * dt, cap);
        break;
      }
      case 'woodcutter': {
        const forest = Math.min(nearbyForest(s, b), 6) / 6;
        const factor = 0.25 + forest;
        add(s, 'wood', w * WOOD_RATE * factor * dt, cap);
        add(s, 'firewood', w * FIREWOOD_RATE * factor * dt, cap);
        depleteNearbyTrees(s, b, w * 0.02 * dt);
        break;
      }
      case 'farm': {
        // Crops mature through spring & summer, then wait for autumn harvest.
        const season = SEASONS[s.season];
        if (season === 'Spring' || season === 'Summer') {
          b.growth = Math.min(1, b.growth + dt / (SEASON_LENGTH * 1.6));
        }
        break;
      }
    }
  }
}

function endSeason(s: GameState, log: LogFn): void {
  s.season = (s.season + 1) % SEASONS.length;
  if (s.season === 0) {
    s.year++;
    log(`A new year begins — Year ${s.year}`, 'info');
  }
  const season = SEASONS[s.season];
  const cap = storageCap(s);

  // Autumn harvest: fields pay out based on how well they grew.
  if (season === 'Autumn') {
    let harvested = 0;
    for (const b of s.buildings) {
      if (b.built && b.type === 'farm' && b.workers.length > 0) {
        harvested += b.workers.length * FARM_YIELD * b.growth;
        b.growth = 0;
      }
    }
    if (harvested > 1) {
      add(s, 'food', harvested, cap);
      log(`Harvest brought in ${Math.round(harvested)} food`, 'good');
    }
  }

  const pop = s.citizens.length;
  if (pop === 0) return;

  // Food consumption every season.
  const foodNeed = pop * FOOD_PER_CITIZEN_PER_SEASON;
  s.resources.food -= foodNeed;
  if (s.resources.food < 0) {
    const starved = Math.min(pop, Math.ceil(-s.resources.food / FOOD_PER_CITIZEN_PER_SEASON));
    s.resources.food = 0;
    killCitizens(s, starved);
    log(`${starved} villager${starved > 1 ? 's' : ''} starved`, 'bad');
  }

  // Firewood consumption in winter only.
  if (season === 'Winter' && s.citizens.length > 0) {
    const pop2 = s.citizens.length;
    const woodNeed = pop2 * FIREWOOD_PER_CITIZEN_WINTER;
    s.resources.firewood -= woodNeed;
    if (s.resources.firewood < 0) {
      const froze = Math.min(pop2, Math.ceil(-s.resources.firewood / FIREWOOD_PER_CITIZEN_WINTER));
      s.resources.firewood = 0;
      killCitizens(s, froze);
      log(`${froze} villager${froze > 1 ? 's' : ''} froze in the cold`, 'bad');
    }
  }

  // Births / newcomers when there is comfort and room.
  const popNow = s.citizens.length;
  if (popNow > 0) {
    const freeHousing = housingCapacity(s) - popNow;
    const comfortable = s.resources.food > popNow * FOOD_PER_CITIZEN_PER_SEASON * 2;
    if (freeHousing >= 1 && comfortable) {
      const births = freeHousing >= 2 && s.resources.food > popNow * FOOD_PER_CITIZEN_PER_SEASON * 4 ? 2 : 1;
      for (let i = 0; i < births; i++) spawnCitizen(s);
      log(births > 1 ? `${births} villagers joined the village` : `A villager joined the village`, 'good');
    }
  }

  if (s.citizens.length === 0) {
    s.gameOver = true;
    log('Your village has died out.', 'bad');
  }
}

function killCitizens(s: GameState, n: number): void {
  for (let i = 0; i < n && s.citizens.length > 0; i++) {
    // Prefer removing the oldest so the village ages out gracefully.
    let idx = 0;
    for (let k = 1; k < s.citizens.length; k++) {
      if (s.citizens[k].age > s.citizens[idx].age) idx = k;
    }
    const [dead] = s.citizens.splice(idx, 1);
    for (const b of s.buildings) b.workers = b.workers.filter((id) => id !== dead.id);
  }
}

function spawnCitizen(s: GameState): void {
  const house = s.buildings.find(
    (b) => b.built && b.type === 'house' && countHome(s, b.id) < 4,
  );
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

function moveCitizens(s: GameState, dt: number): void {
  for (const c of s.citizens) {
    const dx = c.tx - c.x;
    const dy = c.ty - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.08) {
      const step = Math.min(dist, WALK_SPEED * dt);
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

  // Commute loop when employed: work -> home -> work.
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

  // Unemployed: wander around the village centre.
  const centre = centreOfVillage(s);
  c.tx = clampTile(centre.x + (Math.random() - 0.5) * 8);
  c.ty = clampTile(centre.y + (Math.random() - 0.5) * 8);
  c.state = 'wander';
  c.timer = 2 + Math.random() * 3;
}

function regrowForest(s: GameState, dt: number): void {
  // Cheap: nudge a small random sample of forest tiles back toward full.
  const n = s.tiles.length;
  const samples = 40;
  for (let i = 0; i < samples; i++) {
    const idx = (Math.random() * n) | 0;
    const t = s.tiles[idx];
    if (t.type === 'forest' && t.trees < 1) {
      t.trees = Math.min(1, t.trees + TREE_REGROW * dt * (n / samples) * 0.05);
    }
  }
}

function depleteNearbyTrees(s: GameState, b: Building, amount: number): void {
  const c = buildingCenter(b);
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  for (let dy = -4; dy <= 4 && amount > 0; dy++) {
    for (let dx = -4; dx <= 4 && amount > 0; dx++) {
      const t = getTile(s.tiles, cx + dx, cy + dy);
      if (t && t.type === 'forest' && t.trees > 0.05) {
        const take = Math.min(amount, t.trees - 0.05);
        t.trees -= take;
        amount -= take;
      }
    }
  }
}

function add(s: GameState, kind: ResourceKind, amount: number, cap: number): void {
  s.resources[kind] = Math.max(0, Math.min(cap, s.resources[kind] + amount));
}

function jitter(): number {
  return (Math.random() - 0.5) * 1.4;
}

function clampTile(v: number): number {
  return Math.max(0, Math.min(47.5, v));
}
