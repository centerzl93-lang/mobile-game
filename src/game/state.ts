import {
  GameState,
  Building,
  Citizen,
  BuildingType,
  Sex,
  BUILDING_DEFS,
  footprintW,
  footprintH,
  entranceAt,
  entranceTiles,
  hasDoor,
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
  START_LIMITS,
  EASY_START_HOUSES,
  START_ADULTS,
  START_CHILDREN,
  ADULT_MIN_AGE,
  ADULT_MAX_AGE,
  CHILD_MIN_AGE,
  ADULT_AGE,
  AGE_PER_YEAR,
  BUILD_WORK_RATE,
  freshStats,
  Tile,
  DEFAULT_BUILDER_COUNT,
} from '../types';
import { generateWorld, findStartTile, getTile, emptyPaths, emptyHarvest, clearStartArea } from './world';
import { randomName } from './names';
import { HasRng, rand, randInt, randRange, newSeed } from './rng';

export function makeCitizen(s: { nextId: number } & HasRng, sex: Sex, age: number, x: number, y: number): Citizen {
  return {
    id: s.nextId++,
    name: randomName(sex, s),
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
    progress: built ? def.work : 0,
    workers: [],
    desiredWorkers: 0, // start unstaffed — the player assigns workers with the stepper
    growth: 0,
    // A mine opens on coal, a quarry on stone — the ordinary, always-useful seam rather than the
    // one that takes a deliberate choice to dig instead.
    output: type === 'quarry' ? 'stone' : 'coal',
    // A blacksmith opens on iron, a tailor on leather — the input each can get without a
    // dedicated pen behind it.
    recipe: type === 'tailor' ? 'leather' : 'iron',
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

/**
 * Generate the map and the bare, population-less `GameState` around it — everything `newGame`
 * needs before it can pick (or the player can choose) where to found the village. `origin` is a
 * placeholder (the map's centre) until `foundVillage` sites the barn; nothing reads it before
 * then, since there are no citizens yet to keep to it.
 *
 * Split out of `newGame` so manual placement (the New Village screen's "Choose starting spot"
 * toggle) can show the player a real, generated map to plant their barn on instead of the one
 * `findStartTile` would have picked for them.
 */
export function newGameWorld(
  size: MapSize = 'small',
  difficulty: Difficulty = 'normal',
  disasters = true,
  seed?: number,
): GameState {
  const dim = MAP_SIZES[size];
  setMapSize(dim, dim); // must run before generateWorld so the world fills the chosen size
  // One seed carves the map and opens the simulation's stream, so a village is reproducible end to
  // end from a single number. The stream starts somewhere else in the sequence than the map did
  // (`^ 0x5bf03635`) so the two are not correlated — the founding roll should not be a function of
  // where the river went.
  const worldSeed = seed ?? newSeed();
  const tiles = generateWorld(worldSeed);
  const roll: HasRng = { rng: (worldSeed ^ 0x5bf03635) | 0 };

  return {
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
    desiredBuilders: 0, // set once `foundVillage` has founders to assign
    origin: { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H / 2) },
    // Crops the village can plant. Easy starts with one random seed; Normal/Hard start with none
    // and must buy seeds from a merchant before any field will grow.
    seeds: difficulty === 'easy' ? [CROPS[randInt(roll, CROPS.length)]] : [],
    // Loose caps from the start, so nothing runs flat out unwatched — and pitched at what this
    // difficulty was handed, so no hut stands down on its first day. Copied, not shared: the
    // player edits these in the stockpile panel and two villages must not move together.
    limits: { ...START_LIMITS[difficulty] },
    ageScale: AGE_PER_YEAR,
    // Stamp the construction scale the same way `ageScale` is stamped, so the loader knows this save
    // already counts builder-work and never runs the legacy seconds→work rescaler over it. Without
    // this, the first save/load of any new game would rescale every in-progress site's `progress`
    // as if it were old-style seconds, inflating construction that is genuinely current.
    workScale: BUILD_WORK_RATE,
    seed: worldSeed,
    rng: roll.rng,
    stats: freshStats(),
  };
}

/**
 * Can the barn's footprint sit with its top-left corner at (x, y)? The only real constraint is
 * water — `clearStartArea` flattens forest, rock and loose deposits under the founding clearing,
 * so anything short of water is fair game once the village lands there. Used to validate manual
 * placement; the automatic flow never needs to ask, since `findStartTile` already avoids water.
 */
export function canFoundBarnAt(tiles: Tile[], x: number, y: number): boolean {
  const def = BUILDING_DEFS.barn;
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const t = getTile(tiles, x + dx, y + dy);
      if (!t || t.type === 'water') return false;
    }
  }
  return true;
}

/**
 * Found the village with the barn's top-left corner at (x, y): open a clearing around it, stock
 * the barn for the state's difficulty, plant Easy's starter houses, and spawn the founding
 * population nearby. Shared by the automatic flow (`newGame`, which picks (x, y) itself via
 * `findStartTile`) and manual placement, which lets the player pick it instead.
 */
export function foundVillage(state: GameState, x: number, y: number): void {
  // Where the village was founded. Idle villagers keep to it rather than drifting toward the
  // shifting average of every building on the map.
  state.origin = { x: x + 1, y: y + 1 };
  // Most of the map is woodland and rock, so open a clearing before founding the village.
  clearStartArea(state.tiles, x + 1, y + 1);
  // A starting barn holds the opening stockpile for the chosen difficulty, scaled up for the
  // larger founding population so the village isn't starving on day one.
  const barn = makeBuilding(state, 'barn', x, y, true);
  const stock = DIFFICULTY_RESOURCES[state.difficulty];
  for (const k of Object.keys(stock) as ResourceKind[]) {
    const amt = stock[k] ?? 0;
    if (amt > 0) barn.store[k] = amt;
  }
  state.buildings.push(barn);

  // Easy grants a few built houses on the surrounding plains.
  if (state.difficulty === 'easy') placeStartHouses(state, { x, y }, EASY_START_HOUSES);

  const spawn = (sex: Sex, age: number) => {
    const spot = grassSpawnNear(state, x + 1, y + 1);
    state.citizens.push(makeCitizen(state, sex, age, spot.x, spot.y));
  };
  // Founding adults (20–29), balanced men/women so couples can form.
  for (let i = 0; i < START_ADULTS; i++) {
    const sex: Sex = i % 2 === 0 ? 'm' : 'f';
    spawn(sex, ADULT_MIN_AGE + randInt(state, ADULT_MAX_AGE - ADULT_MIN_AGE + 1));
  }
  // Founding children, from `CHILD_MIN_AGE` up to but not reaching adulthood — old enough to be
  // at school if the village ever builds one.
  for (let i = 0; i < START_CHILDREN; i++) {
    spawn(rand(state) < 0.5 ? 'm' : 'f', randRange(state, CHILD_MIN_AGE, ADULT_AGE));
  }
  // A couple of founders go straight to construction rather than the harvest gangs — see
  // `DEFAULT_BUILDER_COUNT`.
  state.desiredBuilders = Math.min(DEFAULT_BUILDER_COUNT, START_ADULTS);
}

export function newGame(
  size: MapSize = 'small',
  difficulty: Difficulty = 'normal',
  disasters = true,
  seed?: number,
): GameState {
  const state = newGameWorld(size, difficulty, disasters, seed);
  const start = findStartTile(state.tiles);
  foundVillage(state, start.x, start.y);
  return state;
}

/** A grass point (with a little jitter) near (x,y) for spawning a founder — never on water. */
function grassSpawnNear(s: GameState, x: number, y: number): { x: number; y: number } {
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = getTile(s.tiles, x + dx, y + dy);
        if (t && t.type === 'grass') {
          return { x: x + dx + 0.2 + rand(s) * 0.6, y: y + dy + 0.2 + rand(s) * 0.6 };
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
    // Doors, the same rule the player's own placements follow: villagers walk around a house and
    // in through its door, so the founding village must not wall its own front steps in.
    const door = entranceAt(x, y, 2, 2, 0);
    const doorTile = getTile(s.tiles, door.x, door.y);
    if (!doorTile || doorTile.type === 'water' || doorTile.type === 'stone') return false;
    for (const b of s.buildings) {
      if (door.x >= b.x && door.x < b.x + footprintW(b) && door.y >= b.y && door.y < b.y + footprintH(b)) {
        return false;
      }
      if (!hasDoor(b.type)) continue;
      // Every door, not just the front one: the founding barn opens at both ends and a starter
      // house parked on the back one would waste half of it before the first winter.
      for (const e of entranceTiles(b)) {
        if (e.x >= x && e.x < x + 2 && e.y >= y && e.y < y + 2) return false;
      }
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
