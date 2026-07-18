// Shared types and tunable balance constants for Little Village.

export const TILE = 32; // base pixels per tile at zoom 1
export const MAP_W = 48;
export const MAP_H = 48;

export type TileType = 'grass' | 'forest' | 'water' | 'stone';

export interface Tile {
  type: TileType;
  /** Amount of tree resource on a forest tile (0..1). Regrows slowly. */
  trees: number;
}

export type ResourceKind =
  | 'food'
  | 'wood'
  | 'firewood'
  | 'stone'
  | 'coal'
  | 'iron'
  | 'tools'
  | 'leather'
  | 'clothing'
  | 'livestock';

export type Resources = Record<ResourceKind, number>;

export const RESOURCE_KINDS: ResourceKind[] = [
  'food',
  'wood',
  'firewood',
  'stone',
  'coal',
  'iron',
  'tools',
  'leather',
  'clothing',
  'livestock',
];

export const RESOURCE_ICON: Record<ResourceKind, string> = {
  food: '🌾',
  wood: '🪵',
  firewood: '🔥',
  stone: '🪨',
  coal: '⚫',
  iron: '🔩',
  tools: '🛠️',
  leather: '🟫',
  clothing: '🧥',
  livestock: '🐄',
};

/** Resources that show a red "low" warning in the HUD (survival-critical). */
export const SURVIVAL_RESOURCES: ResourceKind[] = ['food', 'firewood', 'clothing'];

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export type BuildingType =
  | 'house'
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
  | 'barn';

export type MineOutput = 'coal' | 'iron';
export type SmithRecipe = 'iron' | 'steel';

export type BuildCategory = 'housing' | 'food' | 'resources' | 'trade';

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
  /** Radius (tiles) of the circular work area, for forest-worked buildings. */
  workRadius?: number;
  desc: string;
}

export interface Building {
  id: number;
  type: BuildingType;
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
  | 'wander';

export interface CitizenTask {
  kind: TaskKind;
  resource?: ResourceKind;
  targetId?: number; // building id
  ptx?: number; // path/target tile
  pty?: number;
}

export interface Citizen {
  id: number;
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
  age: number; // years
}

// Path layer values (per tile).
export const PATH_NONE = 0;
export const PATH_DIRT_PLAN = 1;
export const PATH_DIRT = 2;
export const PATH_STONE_PLAN = 3;
export const PATH_STONE = 4;

export interface Merchant {
  present: boolean;
  /** Seasons until the merchant leaves (if present) or next arrives. */
  timer: number;
  /** What the merchant will trade this visit: resource -> units remaining. */
  stock: Partial<Record<ResourceKind, number>>;
}

export interface GameState {
  tiles: Tile[]; // length MAP_W * MAP_H
  paths: number[]; // length MAP_W * MAP_H, PATH_* values
  buildings: Building[];
  citizens: Citizen[];
  season: number; // index into SEASONS
  year: number;
  seasonTimer: number; // seconds elapsed in current season
  nextId: number;
  gameOver: boolean;
  everLived: boolean;
  merchant: Merchant;
  /** Fractional accumulator for how many planned path tiles are built. */
  pathProgress: number;
}

// ---- Time ----
export const SEASON_LENGTH = 20 * 60; // 20 real minutes per season at 1x speed

// ---- Housing / storage / logistics ----
export const HOUSING_PER_HOUSE = 4;
export const BARN_CAPACITY = 5000; // total units a single barn can hold
export const CARRY_CAP = 12; // units a villager carries per trip
export const REFUND_FRACTION = 0.25; // fraction of build cost reclaimed on demolish
export const WORK_SECONDS = 4; // seconds of work to fill/convert one carry-load
export const BUILD_SECONDS_PER_UNIT = 0.5; // on-site labor seconds per unit of construction

// ---- Movement / paths ----
export const BASE_WALK_SPEED = 1.75; // ~33% slower than the old 2.6
export const PATH_DIRT_MULT = 1.5;
export const PATH_STONE_MULT = 2.0;
export const STONE_PATH_COST = 1; // stone per stone-path tile
export const PATH_BUILD_TILES_PER_SEC = 0.6; // per free builder

// ---- Consumption (per season) — sized for the per-trip hauling economy ----
export const FOOD_PER_CITIZEN_PER_SEASON = 60;
export const HEAT_PER_CITIZEN_WINTER = 40; // heat units; firewood = 1, coal = 2
export const FIREWOOD_HEAT = 1;
export const COAL_HEAT = 2;
export const CLOTHING_PER_CITIZEN_WINTER = 5; // clothing worn out over winter
export const TOOL_WEAR_PER_WORKER = 4; // tools consumed per employed worker per season
export const NO_TOOLS_PENALTY = 0.6; // output multiplier when the tool stockpile is empty
export const SICKNESS_CHANCE = 0.5; // chance an unclothed villager sickens in winter

// ---- Production (per assigned worker, per season, before local factors) ----
export const GATHER_FOOD_PER_SEASON = 15;
export const FISH_FOOD_PER_SEASON = 16;
export const HUNT_FOOD_PER_SEASON = 10;
export const HUNT_LEATHER_PER_SEASON = 4;
export const RANCH_FOOD_PER_SEASON = 12;
export const RANCH_LEATHER_PER_SEASON = 5;
export const RANCH_LIVESTOCK_IDEAL = 8; // herd size for full output
export const LIVESTOCK_GROWTH_PER_SEASON = 0.12; // herd breeds ~12%/season per ranch
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
  food: 400,
  wood: 220,
  firewood: 200,
  stone: 40,
  coal: 0,
  iron: 0,
  tools: 120,
  leather: 0,
  clothing: 80,
  livestock: 0,
};
export const START_CITIZENS = 4;

// ---- Trade (barter by relative value; merchant keeps a margin) ----
export const TRADE_VALUE: Record<ResourceKind, number> = {
  food: 1,
  wood: 1,
  firewood: 1.5,
  stone: 2,
  coal: 3,
  iron: 4,
  tools: 8,
  leather: 3,
  clothing: 6,
  livestock: 20,
};
export const MERCHANT_MARGIN = 0.8; // you receive 80% of the value you hand over
export const MERCHANT_VISIT_EVERY = 2; // seasons between arrivals (needs a trading post)

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: {
    type: 'house', name: 'House', emoji: '🏠', category: 'housing', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 0, buildTime: 6,
    desc: 'Homes up to 4 villagers and lets families grow.',
  },
  gatherer: {
    type: 'gatherer', name: 'Gatherer', emoji: '🧺', category: 'food', w: 2, h: 2,
    cost: { wood: 10 }, jobs: 2, buildTime: 6, workRadius: 6,
    desc: 'Collects food from forest in its work circle — more trees, more food.',
  },
  farm: {
    type: 'farm', name: 'Field', emoji: '🌱', category: 'food', w: 3, h: 3,
    cost: { wood: 6 }, jobs: 2, buildTime: 5,
    desc: 'Grows crops through the year; harvested each autumn.',
  },
  fishing: {
    type: 'fishing', name: 'Fishing Hut', emoji: '🎣', category: 'food', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, requiresAdjacent: ['water'],
    desc: 'Catches fish. Must be built on the shoreline (next to water).',
  },
  hunting: {
    type: 'hunting', name: 'Hunting Cabin', emoji: '🏹', category: 'food', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, workRadius: 6,
    desc: 'Hunts game in its work circle for food and leather — needs forest.',
  },
  ranch: {
    type: 'ranch', name: 'Ranch', emoji: '🐄', category: 'food', w: 3, h: 3,
    cost: { wood: 16 }, jobs: 2, buildTime: 7,
    desc: 'Raises livestock for food and leather. Buy animals from traders.',
  },
  lumberyard: {
    type: 'lumberyard', name: 'Lumberyard', emoji: '🌲', category: 'resources', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, workRadius: 5,
    desc: 'Foresters tend and fell trees for wood within their work circle.',
  },
  woodcutter: {
    type: 'woodcutter', name: 'Woodcutter', emoji: '🪓', category: 'resources', w: 2, h: 2,
    cost: { wood: 10 }, jobs: 2, buildTime: 6,
    desc: 'Splits stockpiled wood into firewood to heat homes in winter.',
  },
  quarry: {
    type: 'quarry', name: 'Quarry', emoji: '⛏️', category: 'resources', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 2, buildTime: 7, requiresAdjacent: ['stone'],
    desc: 'Cuts stone. Must be built against a rocky mountainside.',
  },
  mine: {
    type: 'mine', name: 'Mine', emoji: '🕳️', category: 'resources', w: 2, h: 2,
    cost: { wood: 14, stone: 10 }, jobs: 2, buildTime: 8, requiresAdjacent: ['stone'],
    desc: 'Digs coal or iron from the mountainside (toggle in the job board).',
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
    cost: { wood: 20, stone: 10 }, jobs: 1, buildTime: 8, requiresAdjacent: ['water'],
    desc: 'Merchants dock here to barter goods — and to sell you livestock.',
  },
  barn: {
    type: 'barn', name: 'Barn', emoji: '🛖', category: 'resources', w: 2, h: 2,
    cost: { wood: 16 }, jobs: 0, buildTime: 6,
    desc: 'Stores up to 5000 goods. Tap it to see what is inside.',
  },
};

export const CATEGORY_ORDER: BuildCategory[] = ['housing', 'food', 'resources', 'trade'];
export const CATEGORY_META: Record<BuildCategory, { label: string; emoji: string }> = {
  housing: { label: 'Housing', emoji: '🏠' },
  food: { label: 'Food', emoji: '🌾' },
  resources: { label: 'Resources', emoji: '🪵' },
  trade: { label: 'Trade', emoji: '🚢' },
};

export const BUILD_ORDER: BuildingType[] = [
  'house',
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
  'barn',
];
