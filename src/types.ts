// Shared types and tunable balance constants for Little Village.

export const TILE = 32; // base pixels per tile at zoom 1
export const MAP_W = 48;
export const MAP_H = 48;

// 'stone' = tall, impassable mountain rock. 'foothill' = the low, buildable rocky band at a
// mountain's base (the only place mines can be built).
export type TileType = 'grass' | 'forest' | 'water' | 'stone' | 'foothill';

export interface Tile {
  type: TileType;
  /** Amount of tree resource on a forest tile (0..1). Regrows slowly. */
  trees: number;
  /** Units of loose stone lying on this tile, harvestable by hand (0 = none). */
  stone?: number;
}

export type ResourceKind =
  | 'fruit'
  | 'grain'
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
  | 'livestock'
  | 'medicine';

export type Resources = Record<ResourceKind, number>;

/** The distinct food types. A varied diet (more of these in stock) means better health. */
export const FOOD_KINDS: ResourceKind[] = ['fruit', 'grain', 'fish', 'meat'];

export const RESOURCE_KINDS: ResourceKind[] = [
  'fruit',
  'grain',
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
  'livestock',
  'medicine',
];

/** Resources shown as their own HUD chip — the food types are aggregated separately. */
export const HUD_RESOURCES: ResourceKind[] = RESOURCE_KINDS.filter((k) => !FOOD_KINDS.includes(k));

/** Icon for the combined food total shown in the HUD. */
export const FOOD_ICON = '🍽️';

export const RESOURCE_ICON: Record<ResourceKind, string> = {
  fruit: '🍎',
  grain: '🌾',
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
  livestock: '🐄',
  medicine: '💊',
};

/** Non-food resources that show a red "low" warning in the HUD (survival-critical). */
export const SURVIVAL_RESOURCES: ResourceKind[] = ['firewood', 'clothing'];

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

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
  /** Every footprint tile must be one of these types (e.g. mines only on foothills). */
  requiresTile?: TileType[];
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
  /** Seconds of fire remaining while burning down (undefined = not on fire). */
  fireTimer?: number;
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

export type Sex = 'm' | 'f';

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
  sex: Sex;
  age: number; // years
  health: number; // 0..100
  happiness: number; // 0..100
  educated: boolean; // grew up with a staffed school -> more productive
  sick: boolean; // ill from a disease outbreak; can't work until recovered
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

/** House-type buildings that shelter villagers (plain and stone houses). */
export function isHouse(type: BuildingType): boolean {
  return type === 'house' || type === 'stonehouse';
}

/** How many villagers a given house type shelters. */
export function houseCapacityOf(type: BuildingType): number {
  return type === 'stonehouse' ? STONE_HOUSE_CAPACITY : HOUSING_PER_HOUSE;
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

export interface Merchant {
  present: boolean;
  /** Seasons until the merchant leaves (if present) or next arrives. */
  timer: number;
  /** What the merchant will trade this visit: resource -> units remaining. */
  stock: Partial<Record<ResourceKind, number>>;
}

/** A band of nomads awaiting the player's decision to let them settle or turn them away. */
export interface NomadOffer {
  count: number;
  /** How many of the band arrived ill (revealed softly to the player as a warning). */
  sick: number;
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
  /** A band of nomads awaiting an accept/reject decision, or null. */
  pendingNomads: NomadOffer | null;
  /** Harvest orders (per tile): HARVEST_* — trees/loose stone marked for gathering. */
  harvest: number[];
  /** Fractional accumulator for how many planned path tiles are built. */
  pathProgress: number;
}

// ---- Time ----
export const SEASON_LENGTH = 10 * 60; // 10 real minutes per season at 1x speed

// ---- Housing / storage / logistics ----
export const HOUSING_PER_HOUSE = 4;
export const BARN_CAPACITY = 5000; // total units a single barn can hold
export const MARKET_CAPACITY = 2000; // total units a market holds
export const MARKET_STOCK_TARGET = 60; // per-resource amount a vendor keeps stocked
export const CARRY_CAP = 12; // units a villager carries per trip
export const REFUND_FRACTION = 0.25; // fraction of build cost reclaimed on demolish
export const WORK_SECONDS = 4; // seconds of work to fill/convert one carry-load
export const BUILD_SECONDS_PER_UNIT = 0.5; // on-site labor seconds per unit of construction

// ---- Movement / paths ----
export const BASE_WALK_SPEED = 1.75; // ~33% slower than the old 2.6
export const PATH_DIRT_MULT = 1.5;
export const PATH_STONE_MULT = 2.0;
export const PATH_BRIDGE_MULT = 1.5; // crossing a built bridge (like a dirt path)
export const STONE_PATH_COST = 1; // stone per stone-path tile
export const BRIDGE_WOOD_COST = 3; // wood per bridge tile
export const PATH_BUILD_TILES_PER_SEC = 0.6; // per free builder

// ---- Hand harvesting (unemployed villagers gathering marked wood / loose stone) ----
export const HARVEST_WOOD_PER_TREE = 20; // wood a full forest tile (trees=1) yields when cleared
export const LOOSE_STONE_MIN = 8; // units on a loose-stone deposit
export const LOOSE_STONE_MAX = 20;
export const LOOSE_STONE_COVERAGE = 0.05; // fraction of grass tiles seeded with loose stone

// ---- Mountains & foothills ----
export const FOOTHILL_RADIUS = 2; // land tiles within this Chebyshev distance of a mountain become foothills

// ---- Consumption (per season) — sized for the per-trip hauling economy ----
export const FOOD_PER_CITIZEN_PER_SEASON = 60;
export const HEAT_PER_CITIZEN_WINTER = 40; // heat units; firewood = 1, coal = 2
export const FIREWOOD_HEAT = 1;
export const COAL_HEAT = 2;
export const CLOTHING_PER_CITIZEN_WINTER = 5; // clothing worn out over winter
export const TOOL_WEAR_PER_WORKER = 4; // tools consumed per employed worker per season
export const NO_TOOLS_PENALTY = 0.6; // output multiplier when the tool stockpile is empty
export const SICKNESS_CHANCE = 0.5; // chance an unclothed villager sickens in winter

// ---- Demographics ----
export const ADULT_AGE = 4; // children become working adults at this age (years)
export const CHILD_FOOD_FACTOR = 0.5; // children eat this fraction of an adult ration
export const BIRTH_CHANCE = 0.35; // base chance per qualifying house, per season
export const OLD_AGE_START = 35; // old-age deaths begin at this age
export const MAX_AGE = 48; // by this age old-age death is near-certain each year
export const EDUCATED_BONUS = 1.3; // production multiplier for educated workers
export const START_HEALTH = 80;
export const START_HAPPINESS = 80;

// ---- Housing & amenities ----
export const STONE_HOUSE_CAPACITY = 5; // villagers a stone house shelters
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
  fruit: 120,
  grain: 120,
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
  livestock: 0,
  medicine: 40,
};
export const START_CITIZENS = 4;

// ---- Trade (barter by relative value; merchant keeps a margin) ----
export const TRADE_VALUE: Record<ResourceKind, number> = {
  fruit: 1,
  grain: 1,
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
  livestock: 20,
  medicine: 5,
};
export const MERCHANT_MARGIN = 0.8; // you receive 80% of the value you hand over
export const MERCHANT_VISIT_EVERY = 2; // seasons between arrivals (needs a trading post)

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
    cost: { wood: 14, stone: 10 }, jobs: 2, buildTime: 8, requiresTile: ['foothill'],
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
    cost: { wood: 20, stone: 10 }, jobs: 1, buildTime: 8, requiresAdjacent: ['water'],
    desc: 'Merchants dock here to barter goods — and to sell you livestock.',
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
    cost: { wood: 6, stone: 8 }, jobs: 0, buildTime: 4,
    desc: 'Provides water to fight fires. Buildings nearby rarely burn down.',
  },
  market: {
    type: 'market', name: 'Market', emoji: '🛒', category: 'resources', w: 3, h: 2,
    cost: { wood: 22, stone: 10 }, jobs: 2, buildTime: 8,
    desc: 'Vendors keep a bit of every good in stock here, so nearby homes and workshops fetch and deliver locally instead of hiking to a distant barn.',
  },
  barn: {
    type: 'barn', name: 'Barn', emoji: '🛖', category: 'resources', w: 2, h: 2,
    cost: { wood: 16 }, jobs: 0, buildTime: 6,
    desc: 'Stores up to 5000 goods. Tap it to see what is inside.',
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
