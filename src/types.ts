// Shared types and tunable balance constants for Little Village.

export const TILE = 32; // base pixels per tile at zoom 1

// Map dimensions are mutable so New Game / Load can pick a size. They are exported as `let`
// so importers see the current value through ES-module live bindings — `setMapSize` must run
// before a world is generated or loaded (enforced in newGame / loadGame).
export let MAP_W = 48;
export let MAP_H = 48;

export type MapSize = 'small' | 'medium' | 'large';
/** Side length (tiles) for each selectable map size. Medium/Large double each side. */
export const MAP_SIZES: Record<MapSize, number> = { small: 48, medium: 96, large: 192 };

/** Starting difficulty chosen at New Game — governs the opening stockpile and starter houses. */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
export const DIFFICULTY_META: Record<Difficulty, { label: string; desc: string }> = {
  easy: { label: 'Easy', desc: '3 houses and a full stockpile to start' },
  normal: { label: 'Normal', desc: 'No houses, and no wood or stone to build with' },
  hard: { label: 'Hard', desc: 'No wood or stone, and half the food, fuel and tools' },
};
/** Built houses granted at the start on Easy. */
export const EASY_START_HOUSES = 3;

/** Set the active map dimensions. Call before generating or loading a world. */
export function setMapSize(w: number, h: number): void {
  MAP_W = w;
  MAP_H = h;
}

// 'stone' = tall, impassable mountain rock. 'foothill' = the low, buildable rocky band at a
// mountain's base (the only place mines can be built).
export type TileType = 'grass' | 'forest' | 'water' | 'stone' | 'foothill';

export interface Tile {
  type: TileType;
  /** Amount of tree resource on a forest tile (0..1). Regrows slowly. */
  trees: number;
  /** Units of loose stone lying on this tile, harvestable by hand (0 = none). */
  stone?: number;
  /** Units of surface iron ore on this tile, harvestable by hand like loose stone. */
  iron?: number;
}

export type ResourceKind =
  | 'fruit'
  | 'grain'
  | 'corn'
  | 'potato'
  | 'rice'
  | 'barley'
  | 'carrot'
  | 'tomato'
  | 'onion'
  | 'pepper'
  | 'cabbage'
  | 'beans'
  | 'pumpkin'
  | 'apple'
  | 'grapes'
  | 'strawberry'
  | 'melon'
  | 'eggs'
  | 'fish'
  | 'meat'
  | 'wood'
  | 'firewood'
  | 'stone'
  | 'coal'
  | 'iron'
  | 'tools'
  | 'leather'
  | 'clothing'
  | 'cattle'
  | 'pigs'
  | 'chickens'
  | 'medicine';

export type Resources = Record<ResourceKind, number>;

/** The distinct food types. A varied diet (more of these in stock) means better health. */
export const FOOD_KINDS: ResourceKind[] = [
  'fruit',
  'grain',
  'corn',
  'potato',
  'rice',
  'barley',
  'carrot',
  'tomato',
  'onion',
  'pepper',
  'cabbage',
  'beans',
  'pumpkin',
  'apple',
  'grapes',
  'strawberry',
  'melon',
  'eggs',
  'fish',
  'meat',
];

export const RESOURCE_KINDS: ResourceKind[] = [
  'fruit',
  'grain',
  'corn',
  'potato',
  'rice',
  'barley',
  'carrot',
  'tomato',
  'onion',
  'pepper',
  'cabbage',
  'beans',
  'pumpkin',
  'apple',
  'grapes',
  'strawberry',
  'melon',
  'eggs',
  'fish',
  'meat',
  'wood',
  'firewood',
  'stone',
  'coal',
  'iron',
  'tools',
  'leather',
  'clothing',
  'cattle',
  'pigs',
  'chickens',
  'medicine',
];

/**
 * Resources shown as their own HUD chip, in display order. The food types are aggregated into a
 * single 🍽️ chip that the HUD renders ahead of these.
 *
 * This is a deliberate short list, not "every non-food resource": a chip per kind overflowed the
 * top line on a phone. Intermediate goods (leather) and the livestock herds (cattle/pigs/chickens)
 * are left off — they are still readable in any barn's inspect sheet and in the trading post.
 */
export const HUD_RESOURCES: ResourceKind[] = [
  'wood',
  'stone',
  'iron',
  'coal',
  'tools',
  'clothing',
  'medicine',
  'firewood',
];

/** Icon for the combined food total shown in the HUD. */
export const FOOD_ICON = '🍽️';

export const RESOURCE_ICON: Record<ResourceKind, string> = {
  fruit: '🍎',
  grain: '🌾',
  corn: '🌽',
  potato: '🥔',
  rice: '🍚',
  barley: '🌿',
  carrot: '🥕',
  tomato: '🍅',
  onion: '🧅',
  pepper: '🌶️',
  cabbage: '🥬',
  beans: '🫘',
  pumpkin: '🎃',
  apple: '🍏',
  grapes: '🍇',
  strawberry: '🍓',
  melon: '🍈',
  eggs: '🥚',
  fish: '🐟',
  meat: '🍖',
  wood: '🪵',
  firewood: '🔥',
  stone: '🪨',
  coal: '⚫',
  iron: '🔩',
  tools: '🛠️',
  leather: '🟫',
  clothing: '🧥',
  cattle: '🐄',
  pigs: '🐖',
  chickens: '🐔',
  medicine: '💊',
};

/** Non-food resources that show a red "low" warning in the HUD (survival-critical). */
export const SURVIVAL_RESOURCES: ResourceKind[] = ['firewood', 'clothing'];

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

/**
 * Where the current season has got to, in thirds. Seasons run ten real minutes, long enough that
 * "Autumn" alone doesn't tell the player whether they have time to stock up before winter — so the
 * HUD reads Early Autumn → Autumn → Late Autumn.
 */
export type SeasonPhase = 'early' | 'mid' | 'late';

export function seasonPhaseOf(seasonTimer: number): SeasonPhase {
  const t = seasonTimer / SEASON_LENGTH;
  return t < 1 / 3 ? 'early' : t < 2 / 3 ? 'mid' : 'late';
}

/** Display name for the current moment in the year, e.g. `Late Autumn` (mid-season is unqualified). */
export function seasonLabel(s: { season: number; seasonTimer: number }): string {
  const name = SEASONS[s.season];
  const phase = seasonPhaseOf(s.seasonTimer);
  if (phase === 'early') return `Early ${name}`;
  if (phase === 'late') return `Late ${name}`;
  return name;
}

export type BuildingType =
  | 'house'
  | 'stonehouse'
  | 'tavern'
  | 'chapel'
  | 'cemetery'
  | 'gatherer'
  | 'farm'
  | 'fishing'
  | 'hunting'
  | 'ranch'
  | 'lumberyard'
  | 'woodcutter'
  | 'quarry'
  | 'mine'
  | 'blacksmith'
  | 'tailor'
  | 'trading'
  | 'school'
  | 'herbalist'
  | 'hospital'
  | 'well'
  | 'market'
  | 'barn';

export type MineOutput = 'coal' | 'iron';
export type SmithRecipe = 'iron' | 'steel';

/**
 * What a farm grows. There are 16 varieties, each harvesting into its own food resource for
 * dietary variety. A crop can only be planted once the village owns its seed (see `GameState.seeds`)
 * — seeds are one-time unlocks bought from merchants (Easy starts with one random seed).
 */
export type Crop =
  | 'wheat'
  | 'corn'
  | 'potato'
  | 'rice'
  | 'barley'
  | 'carrot'
  | 'tomato'
  | 'onion'
  | 'pepper'
  | 'cabbage'
  | 'beans'
  | 'pumpkin'
  | 'apple'
  | 'grapes'
  | 'strawberry'
  | 'melon';
export const CROPS: Crop[] = [
  'wheat', 'corn', 'potato', 'rice', 'barley', 'carrot', 'tomato', 'onion',
  'pepper', 'cabbage', 'beans', 'pumpkin', 'apple', 'grapes', 'strawberry', 'melon',
];
export const CROP_META: Record<Crop, { label: string; emoji: string; food: ResourceKind; yieldMult: number }> = {
  wheat: { label: 'Wheat', emoji: '🌾', food: 'grain', yieldMult: 1 },
  corn: { label: 'Corn', emoji: '🌽', food: 'corn', yieldMult: 1 },
  potato: { label: 'Potato', emoji: '🥔', food: 'potato', yieldMult: 1.1 },
  rice: { label: 'Rice', emoji: '🍚', food: 'rice', yieldMult: 1 },
  barley: { label: 'Barley', emoji: '🌿', food: 'barley', yieldMult: 1 },
  carrot: { label: 'Carrot', emoji: '🥕', food: 'carrot', yieldMult: 1 },
  tomato: { label: 'Tomato', emoji: '🍅', food: 'tomato', yieldMult: 0.95 },
  onion: { label: 'Onion', emoji: '🧅', food: 'onion', yieldMult: 1 },
  pepper: { label: 'Pepper', emoji: '🌶️', food: 'pepper', yieldMult: 0.9 },
  cabbage: { label: 'Cabbage', emoji: '🥬', food: 'cabbage', yieldMult: 1 },
  beans: { label: 'Beans', emoji: '🫘', food: 'beans', yieldMult: 1 },
  pumpkin: { label: 'Pumpkin', emoji: '🎃', food: 'pumpkin', yieldMult: 1.1 },
  apple: { label: 'Apple', emoji: '🍏', food: 'apple', yieldMult: 0.85 },
  grapes: { label: 'Grapes', emoji: '🍇', food: 'grapes', yieldMult: 0.85 },
  strawberry: { label: 'Strawberry', emoji: '🍓', food: 'strawberry', yieldMult: 0.8 },
  melon: { label: 'Melon', emoji: '🍈', food: 'melon', yieldMult: 0.85 },
};

/** Trade value a merchant charges to sell a crop's seed (a permanent one-time unlock). */
export const SEED_COST = 30;
/** Distinct foods in stock that earn the full diet-variety health bonus (it saturates here). */
export const DIET_VARIETY_TARGET = 5;

/** What a ranch raises. Each animal has its own herd (a tradeable resource) and product mix. */
export type RanchAnimal = 'cattle' | 'pigs' | 'chickens';
export const RANCH_ANIMALS: RanchAnimal[] = ['cattle', 'pigs', 'chickens'];
export const ANIMAL_META: Record<
  RanchAnimal,
  { label: string; emoji: string; ideal: number; growth: number; products: { kind: ResourceKind; chance: number; mult: number }[] }
> = {
  // `chance` weights are cumulative-rolled; `mult` scales that product's load.
  cattle: { label: 'Cattle', emoji: '🐄', ideal: 8, growth: 0.12, products: [
    { kind: 'meat', chance: 0.7, mult: 1 }, { kind: 'leather', chance: 0.3, mult: 1 },
  ] },
  pigs: { label: 'Pigs', emoji: '🐖', ideal: 8, growth: 0.18, products: [
    { kind: 'meat', chance: 0.9, mult: 1.15 }, { kind: 'leather', chance: 0.1, mult: 1 },
  ] },
  chickens: { label: 'Chickens', emoji: '🐔', ideal: 12, growth: 0.25, products: [
    { kind: 'eggs', chance: 0.6, mult: 1 }, { kind: 'meat', chance: 0.4, mult: 0.6 },
  ] },
};

// ---- Ranch sizing & husbandry (all customizable) ----
/** A pen is a square (or rectangle) between these tile dimensions, chosen at placement. */
export const RANCH_MIN = 4;
export const RANCH_MAX = 8;
/** Tiles each head of livestock needs — bigger animals need more room, so fewer fit a pen. */
export const ANIMAL_TILES: Record<RanchAnimal, number> = { cattle: 3, pigs: 2, chickens: 1 };
/** Baseline births per season for a breeding herd. 0.55 × 2 ≥ 1 ⇒ the "≥1 per 2 seasons" floor. */
export const RANCH_BREED_PER_SEASON = 0.55;
/** Chance, each season, of one extra birth on top of the baseline. */
export const RANCH_BREED_BONUS_CHANCE = 0.2;
/** A herd must reach this size before Split is offered (moving half to another ranch). */
export const RANCH_SPLIT_MIN = 10;
/** Resource units produced per head sent to slaughter (culls + births over the cap). */
export const SLAUGHTER_YIELD = 3;

/** Max head a ranch can hold, from its footprint and the animal's size. */
export function ranchCapacity(b: Building): number {
  const animal = b.animal ?? 'cattle';
  return Math.floor((footprintW(b) * footprintH(b)) / ANIMAL_TILES[animal]);
}

// ---- Player-sizable buildings (drag/step the footprint before building) ----
/** Building types whose footprint the player sets at placement, and the tile bounds allowed. */
export const SIZABLE: Partial<Record<BuildingType, { min: number; max: number }>> = {
  ranch: { min: RANCH_MIN, max: RANCH_MAX },
  farm: { min: RANCH_MIN, max: RANCH_MAX },
};

// ---- Farming ----
/** Baseline field area (a 4×4 field) that `FARM_FOOD_PER_WORKER` is tuned against; harvest scales
 * with `footprint / FARM_BASE_AREA`, so a bigger field yields proportionally more. */
export const FARM_BASE_AREA = RANCH_MIN * RANCH_MIN;

/**
 * Per-crop visual design. Groundwork for differentiating what's growing in a field: each crop has a
 * distinct `color` and a reserved `model` slot for future art. Renderers read this via the design
 * hook; today they draw a generic field, so this is scaffolding for when real crop designs land.
 */
export interface CropDesign {
  /** Distinct tint for this crop (hex). Used by future per-crop field rendering. */
  color: number;
  /** Reserved: key of a future crop model/sprite set. Undefined ⇒ generic field. */
  model?: string;
}
export const CROP_DESIGN: Record<Crop, CropDesign> = {
  wheat: { color: 0xd8c15a },
  corn: { color: 0xf2cf4a },
  potato: { color: 0xc99a5e },
  rice: { color: 0xefe9d6 },
  barley: { color: 0xd8c98a },
  carrot: { color: 0xe0913a },
  tomato: { color: 0xd6483c },
  onion: { color: 0xc9a9d0 },
  pepper: { color: 0xd43f34 },
  cabbage: { color: 0x7fb05a },
  beans: { color: 0xa5794a },
  pumpkin: { color: 0xe08a34 },
  apple: { color: 0x8fc04a },
  grapes: { color: 0x8a5ac0 },
  strawberry: { color: 0xe0455a },
  melon: { color: 0x8fce6a },
};

/** The design for a crop (or a neutral fallback when a field has no crop). */
export function cropDesign(crop: Crop | undefined): CropDesign {
  return crop ? CROP_DESIGN[crop] : { color: 0x8a6a3c };
}

export type BuildCategory = 'housing' | 'food' | 'resources' | 'civic' | 'trade';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  emoji: string;
  category: BuildCategory;
  w: number;
  h: number;
  /** Resources spent to place it. */
  cost: Partial<Record<ResourceKind, number>>;
  /** Max workers this building employs (0 = no jobs, e.g. house/barn). */
  jobs: number;
  /** Seconds of work to finish construction (by builders). */
  buildTime: number;
  /** At least one border tile must be one of these types (terrain gating). */
  requiresAdjacent?: TileType[];
  /** At least one footprint tile must be one of these types (e.g. mines touch a foothill). */
  requiresTileAny?: TileType[];
  /**
   * Fraction of the footprint that must sit on water (a dock — e.g. the trading post reaches out
   * over the water for boats). The rest of the footprint must be on buildable land.
   */
  requiresWaterFraction?: number;
  /** Radius (tiles) of the circular work area, for forest-worked buildings. */
  workRadius?: number;
  /** Immune to fire — never ignites and fire never spreads to it (wells, stone-built barns). */
  fireproof?: boolean;
  desc: string;
}

/** Whether a building type can catch fire — fireproof types (wells, barns) never burn. */
export function isFireproof(type: BuildingType): boolean {
  return BUILDING_DEFS[type].fireproof === true;
}

/** Whether this type employs villagers, and so gets a name of its own and a job-board entry. */
export function isWorkplace(type: BuildingType): boolean {
  return BUILDING_DEFS[type].jobs > 0;
}

/** A building's display name: the player's, or its type name if it never got one. */
export function buildingName(b: Building): string {
  return b.name ?? BUILDING_DEFS[b.type].name;
}

/**
 * The next free name for a new building of `type` — "Fishing Hut 1", "Fishing Hut 2", and so on.
 * Picks the lowest unused index rather than counting existing buildings, so demolishing #1 and
 * building again reuses that number instead of climbing forever.
 */
export function nextBuildingName(existing: Building[], type: BuildingType): string {
  const base = BUILDING_DEFS[type].name;
  const taken = new Set(existing.filter((b) => b.type === type).map((b) => b.name));
  for (let n = 1; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface Building {
  id: number;
  type: BuildingType;
  /**
   * Player-facing name. Workplaces get one automatically at placement — "Fishing Hut 1", then
   * "Fishing Hut 2" — and the player can rename them, so a job board full of identical entries
   * becomes a list you can actually tell apart. Absent for buildings with no jobs.
   */
  name?: string;
  x: number; // top-left tile
  y: number;
  built: boolean;
  progress: number; // 0..buildTime
  workers: number[]; // citizen ids currently working here
  /** Player-set target number of workers (0..jobs). */
  desiredWorkers: number;
  /** Accumulated field growth for farms (0..1). */
  growth: number;
  /** Mine: whether it digs coal or iron. */
  output: MineOutput;
  /** Blacksmith: iron tools or steel tools. */
  recipe: SmithRecipe;
  /**
   * Local inventory. Barn: its stock (cap BARN_CAPACITY). Producer: input/output
   * buffer. Construction site (built=false): materials delivered so far.
   */
  store: Partial<Record<ResourceKind, number>>;
  /** Seconds of fire remaining while burning down (undefined = not on fire). */
  fireTimer?: number;
  /** Forester: plant saplings on grass in the work circle to grow a renewable forest. */
  replant?: boolean;
  /** Farm: which crop it grows (defaults to wheat). */
  crop?: Crop;
  /** Ranch: which animal it raises (defaults to cattle). */
  animal?: RanchAnimal;
  /**
   * Custom footprint (ranch only): the player-chosen pen size, 4..8. Undefined for every
   * other building, which keeps its fixed `BUILDING_DEFS` size. Read via `footprintW/H`.
   */
  w?: number;
  h?: number;
  /** Ranch: head of livestock currently penned here. */
  animals?: number;
  /** Ranch: player-set cap on the herd (0..ranchCapacity). */
  maxAnimals?: number;
  /** Ranch: fractional accumulator toward the next birth (see breeding). */
  breedProgress?: number;
  /**
   * Trading post: player-set stock targets (resource -> desired units). The assigned
   * trader hauls goods from the barns up to these levels and returns any surplus.
   */
  orders?: Partial<Record<ResourceKind, number>>;
}

/** What a villager is doing right now in the logistics loop. */
export type TaskKind =
  | 'idle'
  | 'toFetch' // walking to a barn to pick up an input/material
  | 'toDeliver' // carrying a material to a construction site or workplace
  | 'toWork' // walking to the work area / workplace
  | 'work' // producing into `carry`
  | 'toDrop' // carrying output to a barn
  | 'build' // laboring at a construction site
  | 'toPath' // walking to a planned path tile
  | 'toLarder' // carrying household supplies home to stock the larder
  | 'wander';

export interface CitizenTask {
  kind: TaskKind;
  resource?: ResourceKind;
  targetId?: number; // building id
  ptx?: number; // path/target tile
  pty?: number;
}

export type Sex = 'm' | 'f';

export interface Citizen {
  id: number;
  /** Given name, assigned at birth/arrival (by sex). */
  name: string;
  x: number; // world position in tile units (float)
  y: number;
  tx: number; // current move target
  ty: number;
  homeId: number | null;
  /** Building this villager works at; null means a builder/laborer. */
  jobId: number | null;
  /** What this villager is carrying (single kind at a time). */
  carry: { kind: ResourceKind; amount: number } | null;
  task: CitizenTask;
  timer: number; // seconds remaining in current work action
  sex: Sex;
  age: number; // years
  /**
   * The villager this one has paired with, or null/undefined if single. A couple is the core of a
   * household: they share a house, they are the only adults in it wherever housing allows, and only
   * a couple bears children. Partnerships are mutual — both citizens point at each other — and are
   * dissolved when one of them dies (`releaseLostPartners`).
   */
  partnerId?: number | null;
  /** Ids of the two villagers whose household this one was born into. Absent for founders/nomads. */
  parents?: [number, number];
  health: number; // 0..100
  happiness: number; // 0..100
  educated: boolean; // grew up with a staffed school -> more productive
  sick: boolean; // ill from a disease outbreak; can't work until recovered
  /** Seconds of leisure remaining; while > 0 the villager is on a break, not working. */
  rest?: number;
  /**
   * Got a clothing ration at the last season turnover. Transient — recomputed each season in
   * `endSeason`, never saved. A clothed villager burns less firewood; an unclothed one risks
   * falling ill in winter.
   */
  clothed?: boolean;
  /** Assigned to the Builders job this tick (recomputed every tick, not persisted). A builder has
   * jobId === null but constructs work buildings; a plain laborer (jobId null, builder false) does
   * not. */
  builder?: boolean;
  // ---- transient navigation state (not persisted; recomputed after load) ----
  route?: { x: number; y: number }[]; // cached A* waypoints toward the current destination
  routeI?: number; // index of the next waypoint to reach
  rdx?: number; // destination tile the cached route was computed for
  rdy?: number;
}

/** Children can't work; they take a housing slot and grow up at ADULT_AGE. */
export function isAdult(c: { age: number }): boolean {
  return c.age >= ADULT_AGE;
}

/** Whether a villager is inside the fertile age window and can father/bear a child. */
export function isFertile(c: { age: number }): boolean {
  return c.age >= FERTILE_MIN_AGE && c.age <= FERTILE_MAX_AGE;
}

/** House-type buildings that shelter villagers (plain and stone houses). */
export function isHouse(type: BuildingType): boolean {
  return type === 'house' || type === 'stonehouse';
}

/** How many villagers a given house type shelters. */
export function houseCapacityOf(type: BuildingType): number {
  return type === 'stonehouse' ? STONE_HOUSE_CAPACITY : HOUSING_PER_HOUSE;
}

/** A building's effective construction time in seconds (base time × the pace multiplier). */
export function buildTimeOf(type: BuildingType): number {
  return BUILDING_DEFS[type].buildTime * BUILD_TIME_SCALE;
}

/** Extra work-circle radius a building gains per worker beyond the first. */
export const WORK_RADIUS_PER_WORKER = 2;

/**
 * The current work-circle radius (tiles) of a building, or `undefined` if it has no work area.
 * Every work-circle building's circle expands with its worker target — a base radius at 1 worker,
 * growing by WORK_RADIUS_PER_WORKER for each additional worker up to its job cap.
 */
export function workRadiusOf(b: Building): number | undefined {
  const def = BUILDING_DEFS[b.type];
  if (def.workRadius === undefined) return undefined;
  const workers = Math.max(1, Math.min(def.jobs, b.desiredWorkers));
  return def.workRadius + (workers - 1) * WORK_RADIUS_PER_WORKER;
}

/** A building's footprint width. Ranches carry a custom `w`; everything else uses its def size. */
export function footprintW(b: Building): number {
  return b.w ?? BUILDING_DEFS[b.type].w;
}
/** A building's footprint height (see `footprintW`). */
export function footprintH(b: Building): number {
  return b.h ?? BUILDING_DEFS[b.type].h;
}

// Path layer values (per tile).
export const PATH_NONE = 0;
export const PATH_DIRT_PLAN = 1;
export const PATH_DIRT = 2;
export const PATH_STONE_PLAN = 3;
export const PATH_STONE = 4;
export const PATH_BRIDGE_PLAN = 5;
export const PATH_BRIDGE = 6; // a built bridge — the only walkable water tile

// Harvest layer values (per tile): what unemployed villagers should gather here.
export const HARVEST_NONE = 0;
export const HARVEST_WOOD = 1; // a marked forest tile (chop for wood, clear-cuts to grass)
export const HARVEST_STONE = 2; // a marked loose-stone tile
export const HARVEST_IRON = 3; // a marked surface iron-ore tile

/** The single kind of goods a visiting merchant deals in. */
export type MerchantCategory = 'basics' | 'seeds' | 'animals' | 'foods' | 'goods';
export const MERCHANT_CATEGORIES: MerchantCategory[] = ['basics', 'seeds', 'animals', 'foods', 'goods'];

export interface Merchant {
  /**
   * away    — no merchant (traveling between visits).
   * arriving — a boat is sailing down the river toward the dock.
   * docked  — moored at the trading post; the player can trade.
   * leaving — the boat is sailing back downstream and off the map.
   */
  phase: 'away' | 'arriving' | 'docked' | 'leaving';
  /** Convenience mirror of `phase === 'docked'` — trading is only possible while docked. */
  present: boolean;
  /** Seasons of moorage left before the boat departs on its own (set on docking). */
  seasonsLeft: number;
  /** True the season after a merchant leaves — blocks a back-to-back arrival. */
  cooldown: boolean;
  /** What this merchant deals in (null while away). */
  category: MerchantCategory | null;
  /** Goods for sale this visit: resource -> units remaining. */
  stock: Partial<Record<ResourceKind, number>>;
  /** Seeds category only: the (still-unowned) crop seeds on offer. */
  seedStock: Crop[];
  /** Animated boat position on the water while arriving/docked/leaving (null when away). */
  boat: { x: number; y: number } | null;
}

/** A band of nomads awaiting the player's decision to let them settle or turn them away. */
export interface NomadOffer {
  count: number;
  /** How many of the band arrived ill (revealed softly to the player as a warning). */
  sick: number;
}

/**
 * One entry in the village chronicle. Stamped with the season it happened in so the player can
 * place it in time — the toast that announced it is long gone by the time they look.
 */
export interface GameEvent {
  text: string;
  /** 'info' | 'good' | 'bad' — mirrors the toast styling. */
  kind: 'info' | 'good' | 'bad';
  year: number;
  season: number;
}

/** Entries kept in the chronicle. Oldest fall off the end; it rides along in the save. */
export const EVENT_LOG_MAX = 250;

export interface GameState {
  /** Map dimensions this state was generated at (also restored on load). */
  w: number;
  h: number;
  /** Difficulty this game was started on (affects only the opening setup). */
  difficulty: Difficulty;
  /** Whether fire and disease outbreaks can occur (toggled at New Game). */
  disasters: boolean;
  tiles: Tile[]; // length w * h
  paths: number[]; // length w * h, PATH_* values
  buildings: Building[];
  citizens: Citizen[];
  season: number; // index into SEASONS
  year: number;
  seasonTimer: number; // seconds elapsed in current season
  nextId: number;
  gameOver: boolean;
  everLived: boolean;
  merchant: Merchant;
  /** Crops the village has unlocked (owns the seed for) and can plant. Empty ⇒ no field grows. */
  seeds: Crop[];
  /** A band of nomads awaiting an accept/reject decision, or null. */
  pendingNomads: NomadOffer | null;
  /** Harvest orders (per tile): HARVEST_* — trees/loose stone marked for gathering. */
  harvest: number[];
  /**
   * The village chronicle: newest first, capped at EVENT_LOG_MAX. Every message that flashes as a
   * toast is also filed here so the player can scroll back through what happened.
   */
  events?: GameEvent[];
  /** Fractional accumulator for how many planned path tiles are built. */
  pathProgress: number;
  /**
   * Path tiles drawn but not yet confirmed. They sit in `paths` as ordinary *plan* values so they
   * render as the dim outline a plan already does, but villagers skip them until the player
   * confirms — so a stray drag across the map can be cancelled instead of becoming work orders.
   */
  pendingPaths?: number[];
  /** How many free adults the player wants assigned as Builders. Only Builders construct work
   * buildings; paths can be laid by any adult. Idle builders pitch in as laborers. */
  desiredBuilders: number;
  /**
   * Bumped whenever walkability changes (a bridge laid or a path/bridge cleared). The
   * simulation caches its per-tick reachability flood-fill and only recomputes when this
   * (or the state identity) changes — keeping per-tick nav ~O(1) on large maps.
   */
  navVersion?: number;
  /** Bumped when a tile becomes / stops being forest (replanting or clear-cutting), so the
   * renderer knows to rebuild its tree layer to show the new/removed trees. */
  forestVersion?: number;
  /**
   * Seconds since households were last settled. Rehousing runs on this short cadence rather than
   * only at season turnover, so a couple moves into a house the moment it is finished instead of
   * waiting out the rest of the season.
   */
  rehouseTimer?: number;
}

// ---- Time ----
export const SEASON_LENGTH = 10 * 60; // 10 real minutes per season at 1x speed

// ---- Housing / storage / logistics ----
/**
 * Villagers a plain house shelters. A household is one couple plus their children, so this is
 * really "a couple and up to six children" — the room to raise a family is what lets a village
 * grow, and at 4 a couple was full after two children and never bore another.
 */
export const HOUSING_PER_HOUSE = 8;
/**
 * Storage space, measured in the same wood-equivalent volume as carrying (`RESOURCE_VOLUME`):
 * a barn holds 5000 logs' worth of room, which is 20000 of a crop. Counting units instead would
 * mean a sack of grain took the same space as a log, which is the inconsistency volume fixed
 * for hauling. The numbers are unchanged, so bulky storage is exactly what it always was.
 */
export const BARN_CAPACITY = 5000;
export const MARKET_CAPACITY = 2000;
export const MARKET_STOCK_TARGET = 60; // per-resource amount a vendor keeps stocked
/**
 * How much *space* a villager has in their arms for one trip, in wood-equivalents: a log is volume
 * 1, so this is the old "12 units" for timber and stone, and much more of anything compact.
 *
 * Carrying used to be a flat count of units, which made no sense across a table that runs from logs
 * to grain to medicine, and it throttled farming badly: a full field yields thousands of units of
 * crop, so at twelve-per-trip a harvest took years to bring in.
 */
export const CARRY_VOLUME = 12;

/**
 * Space one unit of each resource takes up. Deliberately set so nothing carries *worse* than it did
 * under the old flat count — bulky goods stay at volume 1 (twelve per trip, exactly as before) and
 * only compact goods gain. Crops at 0.25 mean 48 per trip, which is what makes a harvest haulable.
 */
export const RESOURCE_VOLUME: Record<ResourceKind, number> = {
  // Crops and other foods: compact, and hauled in bulk from field to barn.
  fruit: 0.25, grain: 0.25, corn: 0.25, potato: 0.25, rice: 0.25, barley: 0.25,
  carrot: 0.25, tomato: 0.25, onion: 0.25, pepper: 0.25, cabbage: 0.25, beans: 0.25,
  pumpkin: 0.25, apple: 0.25, grapes: 0.25, strawberry: 0.25, melon: 0.25,
  eggs: 0.25, fish: 0.25, meat: 0.25,
  // Bulky raw materials — the volume-1 baseline.
  wood: 1, firewood: 1, stone: 1, coal: 1, iron: 1,
  // Worked goods: denser than raw material, so more fit in a load.
  tools: 0.5, leather: 0.5, clothing: 0.5,
  medicine: 0.25,
  // Livestock is driven, not carried, and a cow takes rather more room than a log.
  cattle: 4, pigs: 3, chickens: 0.5,
};

/** How many whole units of `kind` fit in `volume` of carrying space (always at least one). */
export function carryLimit(kind: ResourceKind, volume: number = CARRY_VOLUME): number {
  return Math.max(1, Math.floor(volume / RESOURCE_VOLUME[kind]));
}
export const REFUND_FRACTION = 0.25; // fraction of build cost reclaimed on demolish
export const WORK_SECONDS = 8; // seconds of work to fill/convert one carry-load (slower pace)
export const BUILD_SECONDS_PER_UNIT = 0.5; // on-site labor seconds per unit of construction
/** Multiplier on every building's construction time — raising buildings takes this much longer. */
export const BUILD_TIME_SCALE = 2;

// ---- Movement / paths ----
export const BASE_WALK_SPEED = 0.875; // villagers stroll — half the previous 1.75
export const PATH_DIRT_MULT = 1.5;
export const PATH_STONE_MULT = 2.0;
export const PATH_BRIDGE_MULT = 1.5; // crossing a built bridge (like a dirt path)
export const STONE_PATH_COST = 1; // stone per stone-path tile
export const BRIDGE_WOOD_COST = 3; // wood per bridge tile
export const PATH_BUILD_TILES_PER_SEC = 0.6; // per free builder

// ---- Hand harvesting (unemployed villagers gathering marked wood / loose stone) ----
export const HARVEST_WOOD_PER_TREE = 20; // wood a full forest tile (trees=1) yields when cleared
export const LOOSE_STONE_MIN = 4; // units on a loose-stone deposit — small nodes, many of them
export const LOOSE_STONE_MAX = 10;
export const LOOSE_STONE_COVERAGE = 0.05; // unused: deposits are now placed in noise clusters
// Surface deposits are seeded in clusters rather than sprinkled evenly, so prospecting for a
// good patch of ground is a real decision instead of uniform background noise.
export const STONE_CLUSTER_THRESHOLD = 0.46; // cluster-noise level above which loose stone appears
/**
 * Extra cluster-noise a deposit needs to claim a *forest* tile.
 *
 * A deposit clears the trees off its own tile, so on woodland each one costs a tree. Using the
 * open-ground threshold everywhere stripped the map back to grass — deposits are common in the
 * open and only occasional clearings in the woods.
 */
export const FOREST_DEPOSIT_EXTRA = 0.30;
export const IRON_CLUSTER_THRESHOLD = 0.58; // iron is rarer, so it needs a stronger cluster
export const LOOSE_IRON_MIN = 3;
export const LOOSE_IRON_MAX = 8;
/** Radius of open ground cleared around the founding barn so a village has room to grow. */
export const START_CLEARING_RADIUS = 9;
/**
 * Moisture (0..1) above which a tile grows woodland.
 *
 * The moisture field is a sum of three octaves, so its values bunch toward the middle of the
 * range — this threshold is read against that combined field, not against a single flat one.
 * Lower means more forest.
 */
export const FOREST_MOISTURE = 0.3;

// ---- Mountains & foothills ----
export const FOOTHILL_RADIUS = 1; // one-tile foothill ring hugging the edge of each mountain

// ---- Consumption (per season) — sized for the per-trip hauling economy ----
export const FOOD_PER_CITIZEN_PER_SEASON = 60;
export const HEAT_PER_CITIZEN_WINTER = 40; // heat units; firewood = 1, coal = 2
export const FIREWOOD_HEAT = 1;
export const COAL_HEAT = 2;
export const CLOTHING_PER_CITIZEN_WINTER = 5; // clothing worn out over winter
export const TOOL_WEAR_PER_WORKER = 4; // tools consumed per employed worker per season
export const NO_TOOLS_PENALTY = 0.6; // output multiplier when the tool stockpile is empty
export const SICKNESS_CHANCE = 0.5; // chance an unclothed villager sickens in winter

/**
 * Seasonal draw on firewood and clothing. Both are used *year-round*, not only over winter:
 * villagers still cook and still wear through clothes in summer. Winter is the anchor at 1.0 (so
 * winter costs exactly what it always did), spring and autumn are moderate, and summer is light.
 *
 * Note this raises the *annual* firewood and clothing bill — previously only winter drew on them.
 */
export const SEASON_BURN: Record<Season, number> = {
  Winter: 1,
  Spring: 0.45,
  Autumn: 0.45,
  Summer: 0.15,
};

/**
 * Firewood multiplier for a villager who got a clothing ration this season. Being warmly dressed
 * means less fuel burned, so clothing production pays for itself twice over.
 */
export const CLOTHED_HEAT_FACTOR = 0.75;

// ---- Household larders (villagers keep their own supplies at home) ----
/**
 * Villagers stock food, firewood and medicine in the house they live in and draw on that before
 * the village barns. Anything sitting in a larder is committed to those residents, so it is
 * deliberately excluded from the barn totals the top-line HUD reports — the HUD number is what is
 * *free*, not what exists.
 *
 * A larder holds this many seasons' worth of supply per resident. Below 1 the barns remain the main
 * store and a household tops up between seasons; at 1 a house is self-sufficient for a full season
 * but its resident hauler spends most of that season fetching, which is a large economy shift.
 */
export const HOUSE_LARDER_SEASONS = 0.5;
export const HOUSE_FOOD_PER_RESIDENT = FOOD_PER_CITIZEN_PER_SEASON * HOUSE_LARDER_SEASONS;
export const HOUSE_FIREWOOD_PER_RESIDENT = HEAT_PER_CITIZEN_WINTER * HOUSE_LARDER_SEASONS;
/** Doses kept at home per resident — enough to treat a household through an outbreak. */
export const HOUSE_MEDICINE_PER_RESIDENT = 2;
/** Resources a household keeps at home, in the order a resident restocks them. */
export const LARDER_KINDS: ResourceKind[] = ['firewood', 'medicine'];

/**
 * Carrying space for a grocery run — a proper basket of provisions, rather than the single
 * work-load a labourer shifts.
 *
 * A household eats its whole larder every season, so its one shopper must haul that much again
 * just to break even; too small a basket and the larder sits near empty forever while still
 * costing a villager their working day.
 *
 * Kept at ×3 rather than trimmed once volume quadrupled food-per-load: firewood is a volume-1
 * good, so a smaller multiplier would have *reduced* how much fuel a shopper brings home per trip
 * and broken larder stocking for the one resource that has to be there before winter.
 */
export const LARDER_CARRY_VOLUME = CARRY_VOLUME * 3;

// ---- Demographics ----
export const ADULT_AGE = 4; // children become working adults at this age (years)
export const START_ADULTS = 8; // founding adult villagers
export const START_CHILDREN = 4; // founding children
export const ADULT_MIN_AGE = 20; // founding adults' age range
export const ADULT_MAX_AGE = 29;
export const CHILD_MIN_AGE = 3; // founding children spawn in [CHILD_MIN_AGE, ADULT_AGE)

// ---- Leisure (villagers take occasional breaks from work) ----
export const LEISURE_CHANCE_PER_SEC = 1 / 90; // ~one break per 90s of work
export const LEISURE_MIN_SECONDS = 12;
export const LEISURE_MAX_SECONDS = 24;
export const CHILD_FOOD_FACTOR = 0.5; // children eat this fraction of an adult ration
// ---- Reproduction ----
/**
 * Base chance a fertile household bears a child in a season, before the food-surplus and wellbeing
 * modifiers below. A household needs a fertile couple *and* room for the child.
 */
export const BIRTH_CHANCE = 0.55;
/**
 * The fertile years. Villagers come of age at ADULT_AGE and can work, but only bear children inside
 * this window — below it they are too young, above it they stop (just before old age sets in).
 */
export const FERTILE_MIN_AGE = 6;
export const FERTILE_MAX_AGE = 34;
/**
 * Seasons of food in store that earn the *full* fertility bonus. Below one season's worth no
 * household will bear a child at all; the bonus ramps from there up to this surplus.
 */
export const BIRTH_FOOD_SURPLUS_TARGET = 2;

export const OLD_AGE_START = 35; // old-age deaths begin at this age
export const MAX_AGE = 48; // by this age old-age death is near-certain each year
export const EDUCATED_BONUS = 1.3; // production multiplier for educated workers
export const START_HEALTH = 80;
export const START_HAPPINESS = 80;

// ---- Housing & amenities ----
export const STONE_HOUSE_CAPACITY = 10; // villagers a stone house shelters (a larger family still)
export const STONE_HOUSE_HEAT_FACTOR = 0.6; // stone-house residents need less winter fuel
export const HAPPY_TAVERN = 12; // happiness from a staffed, stocked tavern
export const HAPPY_CHAPEL = 10; // happiness from a chapel
export const HAPPY_CEMETERY = 8; // happiness from a cemetery
export const DEATH_UNREST = 10; // happiness hit when villagers die and there is no cemetery
export const TAVERN_GRAIN_PER_SEASON = 10; // grain a staffed tavern brews into ale each season

// ---- Immigration (nomads seeking a home) ----
export const IMMIGRATION_CHANCE = 0.25; // per-season chance when a food surplus draws newcomers
export const IMMIGRATION_MIN = 4; // fewest nomads in an arriving band
export const IMMIGRATION_MAX = 12; // most nomads in an arriving band
export const IMMIGRANT_SICK_CHANCE = 0.15; // chance a newcomer arrives already sick

// ---- Disease & fire ----
export const DISEASE_CHANCE = 0.06; // base chance per season of an outbreak
export const DISEASE_INFECT_FRACTION = 0.3; // share of the healthy who fall ill
export const SICK_RECOVER_BASE = 0.4; // per-season recovery chance, unaided
export const SICK_RECOVER_MEDICINE = 0.3; // bonus if a dose of medicine is on hand
export const SICK_RECOVER_HOSPITAL = 0.2; // bonus if a staffed hospital exists
export const SICK_DEATH_CHANCE = 0.15; // per-season death chance while still sick
export const MED_LOAD = 5; // medicine produced per herbalist work cycle (× forest)
export const FIRE_CHANCE = 0.05; // base chance per season a building ignites
export const WELL_RADIUS = 6; // wells protect buildings within this radius
export const WELL_DOUSE_CHANCE = 0.85; // chance a nearby well stops a fire
export const FIRE_SPREAD_CHANCE = 0.3; // chance fire jumps to an adjacent building
export const FIRE_BURN_SECONDS = 8; // how long a building burns before collapsing

// ---- Production (per assigned worker, per season, before local factors) ----
export const GATHER_FOOD_PER_SEASON = 15;
export const FISH_FOOD_PER_SEASON = 16;
export const HUNT_FOOD_PER_SEASON = 10;
export const HUNT_LEATHER_PER_SEASON = 4;
export const RANCH_FOOD_PER_SEASON = 12;
export const RANCH_LEATHER_PER_SEASON = 5;
export const LUMBER_WOOD_PER_SEASON = 13;
export const WOODCUT_FIREWOOD_PER_SEASON = 18;
export const WOODCUT_WOOD_PER_SEASON = 11;
export const FARM_FOOD_PER_WORKER = 320; // at full growth, paid at autumn harvest (hauled from the field)
export const QUARRY_STONE_PER_SEASON = 9;
export const MINE_COAL_PER_SEASON = 7;
export const MINE_IRON_PER_SEASON = 6;
// Blacksmith recipes (per worker per season): inputs consumed -> tools produced.
export const SMITH_IRON_IN = 6;
export const SMITH_IRON_TOOLS_OUT = 8;
export const SMITH_STEEL_IRON_IN = 6;
export const SMITH_STEEL_COAL_IN = 4;
export const SMITH_STEEL_TOOLS_OUT = 14; // steel: more tool-units per iron (lasts longer)
export const TAILOR_LEATHER_IN = 8;
export const TAILOR_CLOTHING_OUT = 6;

// ---- Starting stockpile / population ----
export const START_RESOURCES: Resources = {
  fruit: 120,
  grain: 120,
  corn: 0,
  potato: 0,
  rice: 0,
  barley: 0,
  carrot: 0,
  tomato: 0,
  onion: 0,
  pepper: 0,
  cabbage: 0,
  beans: 0,
  pumpkin: 0,
  apple: 0,
  grapes: 0,
  strawberry: 0,
  melon: 0,
  eggs: 0,
  fish: 90,
  meat: 90,
  wood: 220,
  firewood: 200,
  stone: 40,
  coal: 0,
  iron: 0,
  tools: 120,
  leather: 0,
  clothing: 80,
  cattle: 0,
  pigs: 0,
  chickens: 0,
  medicine: 40,
};

/**
 * Opening stockpile per difficulty. Easy is the full `START_RESOURCES` (and also grants
 * `EASY_START_HOUSES` houses). Normal is half of the basics only — food, wood, stone, firewood,
 * clothing, tools. Hard is the same as Normal minus wood and stone.
 */
/** Opening stockpiles are multiplied by this, matching the founding population (4 → 12). */
export const STARTING_STOCK_SCALE = 3;
export const DIFFICULTY_RESOURCES: Record<Difficulty, Partial<Resources>> = {
  easy: { ...START_RESOURCES },
  // Neither Normal nor Hard grants building materials: wood and stone must be gathered before
  // anything can be raised. Hard differs by starting on shorter rations of everything else.
  normal: { fruit: 60, grain: 60, fish: 45, meat: 45, firewood: 100, clothing: 40, tools: 60 },
  hard: { fruit: 30, grain: 30, fish: 25, meat: 25, firewood: 50, clothing: 20, tools: 30 },
};

// ---- Trade (barter by relative value; merchant keeps a margin) ----
export const TRADE_VALUE: Record<ResourceKind, number> = {
  fruit: 1,
  grain: 1,
  corn: 1,
  potato: 1,
  rice: 1,
  barley: 1,
  carrot: 1,
  tomato: 1,
  onion: 1,
  pepper: 1.5,
  cabbage: 1,
  beans: 1,
  pumpkin: 1,
  apple: 1.5,
  grapes: 1.5,
  strawberry: 1.5,
  melon: 1.5,
  eggs: 1.5,
  fish: 1,
  meat: 1.5,
  wood: 1,
  firewood: 1.5,
  stone: 2,
  coal: 3,
  iron: 4,
  tools: 8,
  leather: 3,
  clothing: 6,
  cattle: 20,
  pigs: 14,
  chickens: 8,
  medicine: 5,
};
export const MERCHANT_MARGIN = 0.8; // you must offer value ≥ goods' value / margin (merchant's cut); 1 = exact parity
export const MERCHANT_STAY_SEASONS = 1; // how many seasons a docked merchant lingers before sailing off
export const MERCHANT_ARRIVAL_CHANCE = 0.5; // per-season chance a merchant appears (staffed post, not just departed)

/**
 * What each kind of merchant carries, and roughly how much. A visiting merchant rolls one
 * category and stocks these goods. Tweak freely — the trade UI reads straight from here and
 * from TRADE_VALUE. The 'seeds' merchant is special: it offers crop-seed unlocks (see
 * `seedStock`) rather than resources, so its table is empty.
 */
export const MERCHANT_CATEGORY_STOCK: Record<MerchantCategory, Partial<Record<ResourceKind, number>>> = {
  basics: { wood: 150, stone: 120, coal: 100, iron: 80, firewood: 120 },
  seeds: {},
  animals: { cattle: 6, pigs: 8, chickens: 12 },
  foods: { grain: 160, corn: 120, potato: 120, fish: 140, meat: 80, eggs: 80 },
  goods: { tools: 60, clothing: 60, leather: 90, medicine: 40 },
};

/** Label + emoji for each merchant category (shown in the trade UI header). */
export const MERCHANT_CATEGORY_META: Record<MerchantCategory, { label: string; emoji: string }> = {
  basics: { label: 'Materials Trader', emoji: '🪵' },
  seeds: { label: 'Seed Merchant', emoji: '🌱' },
  animals: { label: 'Livestock Trader', emoji: '🐄' },
  foods: { label: 'Food Merchant', emoji: '🍞' },
  goods: { label: 'Goods Merchant', emoji: '🛠️' },
};

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: {
    type: 'house', name: 'House', emoji: '🏠', category: 'housing', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 0, buildTime: 6,
    desc: 'Homes up to 4 villagers and lets families grow.',
  },
  stonehouse: {
    type: 'stonehouse', name: 'Stone House', emoji: '🏡', category: 'housing', w: 2, h: 2,
    cost: { wood: 8, stone: 16 }, jobs: 0, buildTime: 8,
    desc: 'A warm, sturdy home for up to 5 — residents burn much less fuel in winter.',
  },
  gatherer: {
    type: 'gatherer', name: 'Gatherer', emoji: '🧺', category: 'food', w: 2, h: 2,
    cost: { wood: 10 }, jobs: 2, buildTime: 6, workRadius: 6,
    desc: 'Collects food from forest in its work circle — more trees, more food.',
  },
  farm: {
    type: 'farm', name: 'Field', emoji: '🌱', category: 'food', w: 4, h: 4,
    cost: { wood: 6 }, jobs: 2, buildTime: 5,
    desc: 'A fenced field for a chosen crop — you must own that crop\'s seed to plant it. Drag its size (4×4 up to 8×8) before building; a bigger field yields a bigger harvest, reaped each autumn.',
  },
  fishing: {
    type: 'fishing', name: 'Fishing Hut', emoji: '🎣', category: 'food', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, requiresAdjacent: ['water'], workRadius: 4,
    desc: 'Catches fish from water in its work circle — more water and more workers, more fish. Must be built on the shoreline.',
  },
  hunting: {
    type: 'hunting', name: 'Hunting Cabin', emoji: '🏹', category: 'food', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, workRadius: 6,
    desc: 'Hunts game in its work circle for food and leather — needs forest.',
  },
  ranch: {
    type: 'ranch', name: 'Ranch', emoji: '🐄', category: 'food', w: 4, h: 4,
    cost: { wood: 16 }, jobs: 2, buildTime: 7,
    desc: 'A fenced pen for cattle, pigs, or chickens. Drag its size (4×4 up to 8×8) before building — a bigger pen holds a bigger herd. Buy livestock from traders; they breed here.',
  },
  lumberyard: {
    type: 'lumberyard', name: 'Forester', emoji: '🌲', category: 'resources', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 3, buildTime: 6, workRadius: 4,
    desc: 'Foresters fell trees for wood in their work circle — the circle grows with each worker (up to 3). Toggle replanting to sow and grow a renewable forest.',
  },
  woodcutter: {
    type: 'woodcutter', name: 'Woodcutter', emoji: '🪓', category: 'resources', w: 2, h: 2,
    cost: { wood: 10 }, jobs: 2, buildTime: 6,
    desc: 'Splits stockpiled wood into firewood to heat homes in winter.',
  },
  quarry: {
    // A quarry digs its own pit, so it goes anywhere on buildable ground rather than having to
    // hug a mountainside. It is a big fixed 3×6 works — not player-sizable — and its cost and
    // build time are scaled up from the old 2×2 version to match the footprint.
    type: 'quarry', name: 'Quarry', emoji: '⛏️', category: 'resources', w: 3, h: 6,
    cost: { wood: 30 }, jobs: 4, buildTime: 14,
    desc: 'Cuts stone. A large pit that can be dug anywhere — but yields more against a rocky mountainside.',
  },
  mine: {
    type: 'mine', name: 'Mine', emoji: '🕳️', category: 'resources', w: 2, h: 2,
    cost: { wood: 14, stone: 10 }, jobs: 2, buildTime: 8, requiresTileAny: ['foothill'],
    desc: 'Digs coal or iron. Must be dug into a mountain\'s foothills (toggle coal/iron in the job board).',
  },
  blacksmith: {
    type: 'blacksmith', name: 'Blacksmith', emoji: '⚒️', category: 'resources', w: 2, h: 2,
    cost: { wood: 14, stone: 8 }, jobs: 2, buildTime: 7,
    desc: 'Forges tools from iron, or steel tools from iron + coal (lasts longer).',
  },
  tailor: {
    type: 'tailor', name: 'Tailor', emoji: '🧵', category: 'resources', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 2, buildTime: 6,
    desc: 'Sews warm clothing from leather to keep villagers healthy in winter.',
  },
  trading: {
    type: 'trading', name: 'Trading Post', emoji: '🚢', category: 'trade', w: 3, h: 2,
    cost: { wood: 20, stone: 10 }, jobs: 1, buildTime: 8, requiresWaterFraction: 1 / 3,
    desc: 'A dock for traders arriving by boat — part of it must reach out over the water.',
  },
  school: {
    type: 'school', name: 'School', emoji: '🏫', category: 'civic', w: 2, h: 2,
    cost: { wood: 16, stone: 10 }, jobs: 1, buildTime: 7,
    desc: 'A teacher educates the children; kids who grow up here become skilled, more productive adults.',
  },
  tavern: {
    type: 'tavern', name: 'Tavern', emoji: '🍺', category: 'civic', w: 2, h: 2,
    cost: { wood: 16, stone: 6 }, jobs: 1, buildTime: 7,
    desc: 'A staffed alehouse brews grain into ale each season, keeping the village merry.',
  },
  chapel: {
    type: 'chapel', name: 'Chapel', emoji: '⛪', category: 'civic', w: 2, h: 2,
    cost: { wood: 14, stone: 14 }, jobs: 0, buildTime: 8,
    desc: 'A place of worship and gathering that lifts the spirits of the whole village.',
  },
  cemetery: {
    type: 'cemetery', name: 'Cemetery', emoji: '🪦', category: 'civic', w: 2, h: 2,
    cost: { wood: 6, stone: 8 }, jobs: 0, buildTime: 6,
    desc: 'A dignified resting place — villagers grieve less when the dead are honoured.',
  },
  herbalist: {
    type: 'herbalist', name: 'Herbalist', emoji: '🌿', category: 'civic', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, workRadius: 6,
    desc: 'Gathers wild herbs from the forest to brew medicine for the sick.',
  },
  hospital: {
    type: 'hospital', name: 'Hospital', emoji: '🏥', category: 'civic', w: 2, h: 2,
    cost: { wood: 16, stone: 12 }, jobs: 2, buildTime: 8,
    desc: 'Doctors treat the sick during outbreaks — the ill recover faster and die less.',
  },
  well: {
    type: 'well', name: 'Well', emoji: '⛲', category: 'civic', w: 1, h: 1,
    cost: { wood: 6, stone: 8 }, jobs: 0, buildTime: 4, fireproof: true,
    desc: 'Provides water to fight fires. Buildings nearby rarely burn down.',
  },
  market: {
    type: 'market', name: 'Market', emoji: '🛒', category: 'resources', w: 3, h: 2,
    cost: { wood: 22, stone: 10 }, jobs: 2, buildTime: 8,
    desc: 'Vendors keep a bit of every good in stock here, so nearby homes and workshops fetch and deliver locally instead of hiking to a distant barn.',
  },
  barn: {
    type: 'barn', name: 'Barn', emoji: '🛖', category: 'resources', w: 2, h: 2,
    cost: { wood: 16 }, jobs: 0, buildTime: 6, fireproof: true,
    desc: 'Stores up to 5000 goods, safe from fire. Tap it to see what is inside.',
  },
};

export const CATEGORY_ORDER: BuildCategory[] = ['housing', 'food', 'resources', 'civic', 'trade'];
export const CATEGORY_META: Record<BuildCategory, { label: string; emoji: string }> = {
  housing: { label: 'Housing', emoji: '🏠' },
  food: { label: 'Food', emoji: '🌾' },
  resources: { label: 'Resources', emoji: '🪵' },
  civic: { label: 'Civic', emoji: '🏫' },
  trade: { label: 'Trade', emoji: '🚢' },
};

export const BUILD_ORDER: BuildingType[] = [
  'house',
  'stonehouse',
  'gatherer',
  'farm',
  'fishing',
  'hunting',
  'ranch',
  'lumberyard',
  'woodcutter',
  'quarry',
  'mine',
  'blacksmith',
  'tailor',
  'trading',
  'school',
  'tavern',
  'chapel',
  'cemetery',
  'herbalist',
  'hospital',
  'well',
  'market',
  'barn',
];
