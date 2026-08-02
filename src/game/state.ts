import {
  GameState,
  Building,
  Citizen,
  BuildingType,
  Sex,
  BUILDING_DEFS,
  footprintW,
  footprintH,
  ranchCapacity,
  SIZABLE,
  isHouse,
  houseCapacityOf,
  BARN_CAPACITY,
  MARKET_CAPACITY,
  START_HEALTH,
  START_HAPPINESS,
  ResourceKind,
  MapSize,
  MAP_SIZES,
  MAP_W,
  MAP_H,
  setMapSize,
  Difficulty,
  CROPS,
  DIFFICULTY_RESOURCES,
  STARTING_STOCK_SCALE,
  EASY_START_HOUSES,
  START_ADULTS,
  START_CHILDREN,
  ADULT_MIN_AGE,
  ADULT_MAX_AGE,
  CHILD_MIN_AGE,
  ADULT_AGE,
} from '../types';
import { generateWorld, findStartTile, getTile, emptyPaths, emptyHarvest, clearStartArea } from './world';
import { randomName } from './names';

export function makeCitizen(s: { nextId: number }, sex: Sex, age: number, x: number, y: number): Citizen {
  return {
    id: s.nextId++,
    name: randomName(sex),
    x,
    y,
    tx: x,
    ty: y,
    homeId: null,
    jobId: null,
    carry: null,
    task: { kind: 'idle' },
    timer: 0,
    sex,
    age,
    health: START_HEALTH,
    happiness: START_HAPPINESS,
    educated: false,
    sick: false,
  };
}

function makeBuilding(s: { nextId: number }, type: BuildingType, x: number, y: number, built: boolean): Building {
  const def = BUILDING_DEFS[type];
  const b: Building = {
    id: s.nextId++,
    type,
    x,
    y,
    built,
    progress: built ? def.buildTime : 0,
    workers: [],
    desiredWorkers: 0, // start unstaffed — the player assigns workers with the stepper
    growth: 0,
    output: 'coal',
    recipe: 'iron',
    replant: type === 'lumberyard', // new Foresters replant by default
    animal: 'cattle',
    store: {},
  };
  if (SIZABLE[type]) {
    b.w = def.w;
    b.h = def.h;
  }
  if (type === 'ranch') {
    b.animals = 0;
    b.maxAnimals = ranchCapacity(b);
    b.breedProgress = 0;
  }
  return b;
}

export function newGame(
  size: MapSize = 'small',
  difficulty: Difficulty = 'normal',
  disasters = true,
  seed?: number,
): GameState {
  const dim = MAP_SIZES[size];
  setMapSize(dim, dim); // must run before generateWorld so the world fills the chosen size
  const tiles = generateWorld(seed);
  const start = findStartTile(tiles);

  const state: GameState = {
    w: MAP_W,
    h: MAP_H,
    difficulty,
    disasters,
    tiles,
    paths: emptyPaths(),
    buildings: [],
    citizens: [],
    season: 0,
    year: 1,
    seasonTimer: 0,
    nextId: 1,
    gameOver: false,
    everLived: true,
    merchant: { phase: 'away', present: false, stayTimer: 0, cooldownTimer: 0, category: null, stock: {}, seedStock: [], boat: null },
    pendingNomads: null,
    harvest: emptyHarvest(),
    events: [], // the village chronicle starts blank and fills as things happen
    pathProgress: 0,
    pendingPaths: [], // drawn-but-unconfirmed path tiles
    desiredBuilders: 0, // no builders until the player assigns them on the Job Board
    // Crops the village can plant. Easy starts with one random seed; Normal/Hard start with none
    // and must buy seeds from a merchant before any field will grow.
    seeds: difficulty === 'easy' ? [CROPS[Math.floor(Math.random() * CROPS.length)]] : [],
  };

  // A starting barn holds the opening stockpile for the chosen difficulty, scaled up for the
  // larger founding population so the village isn't starving on day one.
  // Most of the map is woodland and rock, so open a clearing before founding the village.
  clearStartArea(state.tiles, start.x + 1, start.y + 1);
  const barn = makeBuilding(state, 'barn', start.x, start.y, true);
  const stock = DIFFICULTY_RESOURCES[difficulty];
  for (const k of Object.keys(stock) as ResourceKind[]) {
    const amt = (stock[k] ?? 0) * STARTING_STOCK_SCALE;
    if (amt > 0) barn.store[k] = amt;
  }
  state.buildings.push(barn);

  // Easy grants a few built houses on the surrounding plains.
  if (difficulty === 'easy') placeStartHouses(state, start, EASY_START_HOUSES);

  const spawn = (sex: Sex, age: number) => {
    const spot = grassSpawnNear(state, start.x + 1, start.y + 1);
    state.citizens.push(makeCitizen(state, sex, age, spot.x, spot.y));
  };
  // Founding adults (20–29), balanced men/women so couples can form.
  for (let i = 0; i < START_ADULTS; i++) {
    const sex: Sex = i % 2 === 0 ? 'm' : 'f';
    spawn(sex, ADULT_MIN_AGE + Math.floor(Math.random() * (ADULT_MAX_AGE - ADULT_MIN_AGE + 1)));
  }
  // Founding children (age 3 up to — but not reaching — adulthood, so they read as "3–4").
  for (let i = 0; i < START_CHILDREN; i++) {
    spawn(Math.random() < 0.5 ? 'm' : 'f', CHILD_MIN_AGE + Math.random() * (ADULT_AGE - CHILD_MIN_AGE));
  }
  return state;
}

/** A grass point (with a little jitter) near (x,y) for spawning a founder — never on water. */
function grassSpawnNear(s: GameState, x: number, y: number): { x: number; y: number } {
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = getTile(s.tiles, x + dx, y + dy);
        if (t && t.type === 'grass') {
          return { x: x + dx + 0.2 + Math.random() * 0.6, y: y + dy + 0.2 + Math.random() * 0.6 };
        }
      }
    }
  }
  return { x: x + 0.5, y: y + 0.5 };
}

/**
 * Place up to `count` built 2x2 houses on grass near the barn, without overlapping other
 * buildings. Scans outward rings, so it degrades gracefully (places fewer) on a cramped map.
 */
function placeStartHouses(s: GameState, start: { x: number; y: number }, count: number): void {
  const fits = (x: number, y: number): boolean => {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const t = getTile(s.tiles, x + dx, y + dy);
        if (!t || t.type !== 'grass') return false;
      }
    }
    for (const b of s.buildings) {
      if (x < b.x + footprintW(b) && x + 2 > b.x && y < b.y + footprintH(b) && y + 2 > b.y) return false;
    }
    return true;
  };
  let placed = 0;
  for (let r = 2; r <= 8 && placed < count; r++) {
    for (let dy = -r; dy <= r && placed < count; dy++) {
      for (let dx = -r; dx <= r && placed < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // only the new ring each pass
        const x = start.x + dx;
        const y = start.y + dy;
        if (!fits(x, y)) continue;
        const house = makeBuilding(s, 'house', x, y, true);
        s.buildings.push(house);
        placed++;
      }
    }
  }
}

export function housingCapacity(s: GameState): number {
  let cap = 0;
  for (const b of s.buildings) if (b.built && isHouse(b.type)) cap += houseCapacityOf(b.type);
  return cap;
}

export function storageCap(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) {
    if (!b.built) continue;
    if (b.type === 'barn') n += BARN_CAPACITY;
    else if (b.type === 'market') n += MARKET_CAPACITY;
  }
  return n;
}

export function jobSlots(s: GameState): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const b of s.buildings) {
    if (!b.built) continue;
    total += b.desiredWorkers;
    filled += Math.min(b.workers.length, b.desiredWorkers);
  }
  return { filled, total };
}

export function buildingCenter(b: Building): { x: number; y: number } {
  return { x: b.x + footprintW(b) / 2, y: b.y + footprintH(b) / 2 };
}

export { makeBuilding };
