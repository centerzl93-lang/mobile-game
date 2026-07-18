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

export type ResourceKind = 'food' | 'wood' | 'firewood' | 'stone' | 'coal';

export interface Resources {
  food: number;
  wood: number;
  firewood: number;
  stone: number;
  coal: number;
}

export const RESOURCE_ICON: Record<ResourceKind, string> = {
  food: '🌾',
  wood: '🪵',
  firewood: '🔥',
  stone: '🪨',
  coal: '⚫',
};

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export type BuildingType =
  | 'house'
  | 'gatherer'
  | 'farm'
  | 'lumberyard'
  | 'woodcutter'
  | 'quarry'
  | 'mine'
  | 'barn';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  emoji: string;
  w: number;
  h: number;
  /** Resources spent to place it. */
  cost: Partial<Record<ResourceKind, number>>;
  /** Max workers this building employs (0 = no jobs, e.g. house/barn). */
  jobs: number;
  /** Seconds of work to finish construction (by builders). */
  buildTime: number;
  desc: string;
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number; // top-left tile
  y: number;
  built: boolean;
  progress: number; // 0..buildTime
  workers: number[]; // citizen ids assigned to work here
  /** Accumulated field growth for farms (0..1). */
  growth: number;
}

export type CitizenState = 'toWork' | 'working' | 'toHome' | 'resting' | 'wander';

export interface Citizen {
  id: number;
  x: number; // world position in tile units (float)
  y: number;
  tx: number; // current move target
  ty: number;
  homeId: number | null;
  /** Building this villager works at; null means a builder/laborer. */
  jobId: number | null;
  state: CitizenState;
  timer: number; // seconds remaining in current state activity
  age: number; // years
}

export interface GameState {
  tiles: Tile[]; // length MAP_W * MAP_H
  buildings: Building[];
  citizens: Citizen[];
  resources: Resources;
  season: number; // index into SEASONS
  year: number;
  seasonTimer: number; // seconds elapsed in current season
  nextId: number;
  gameOver: boolean;
  everLived: boolean;
}

// ---- Time ----
export const SEASON_LENGTH = 20 * 60; // 20 real minutes per season at 1x speed

// ---- Housing / storage ----
export const HOUSING_PER_HOUSE = 4;
export const STORAGE_BASE = 80;
export const STORAGE_PER_BARN = 140;

// ---- Consumption (per season) ----
export const FOOD_PER_CITIZEN_PER_SEASON = 5;
/** Heat units each villager needs to survive winter. */
export const HEAT_PER_CITIZEN_WINTER = 4;
/** Heat value of fuels: firewood = 1 heat, coal = 2 heat (burns hotter/longer). */
export const FIREWOOD_HEAT = 1;
export const COAL_HEAT = 2;

// ---- Production (per assigned worker, per season, before local factors) ----
export const GATHER_FOOD_PER_SEASON = 15;
export const LUMBER_WOOD_PER_SEASON = 13;
export const WOODCUT_FIREWOOD_PER_SEASON = 18;
export const WOODCUT_WOOD_PER_SEASON = 11; // wood consumed to make that firewood
export const FARM_FOOD_PER_WORKER = 36; // at full growth, paid at autumn harvest
export const QUARRY_STONE_PER_SEASON = 9;
export const MINE_COAL_PER_SEASON = 7;

// ---- Starting stockpile / population ----
export const START_FOOD = 70;
export const START_WOOD = 55;
export const START_FIREWOOD = 30;
export const START_STONE = 0;
export const START_COAL = 0;
export const START_CITIZENS = 4;

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: {
    type: 'house',
    name: 'House',
    emoji: '🏠',
    w: 2,
    h: 2,
    cost: { wood: 12 },
    jobs: 0,
    buildTime: 6,
    desc: 'Homes up to 4 villagers and lets families grow.',
  },
  gatherer: {
    type: 'gatherer',
    name: 'Gatherer',
    emoji: '🧺',
    w: 2,
    h: 2,
    cost: { wood: 10 },
    jobs: 2,
    buildTime: 6,
    desc: 'Collects food from nearby forest all year round.',
  },
  farm: {
    type: 'farm',
    name: 'Field',
    emoji: '🌱',
    w: 3,
    h: 3,
    cost: { wood: 6 },
    jobs: 2,
    buildTime: 5,
    desc: 'Grows crops through the year; harvested each autumn.',
  },
  lumberyard: {
    type: 'lumberyard',
    name: 'Lumberyard',
    emoji: '🌲',
    w: 2,
    h: 2,
    cost: { wood: 12 },
    jobs: 2,
    buildTime: 6,
    desc: 'Foresters tend nearby woods and fell trees for wood (logs).',
  },
  woodcutter: {
    type: 'woodcutter',
    name: 'Woodcutter',
    emoji: '🪓',
    w: 2,
    h: 2,
    cost: { wood: 10 },
    jobs: 2,
    buildTime: 6,
    desc: 'Splits stockpiled wood into firewood to heat homes in winter.',
  },
  quarry: {
    type: 'quarry',
    name: 'Quarry',
    emoji: '⛏️',
    w: 2,
    h: 2,
    cost: { wood: 12 },
    jobs: 2,
    buildTime: 7,
    desc: 'Cuts stone from a nearby rocky outcrop. Build next to rock.',
  },
  mine: {
    type: 'mine',
    name: 'Coal Mine',
    emoji: '🕳️',
    w: 2,
    h: 2,
    cost: { wood: 14, stone: 10 },
    jobs: 2,
    buildTime: 8,
    desc: 'Digs coal from the mountains — a hotter winter fuel than firewood.',
  },
  barn: {
    type: 'barn',
    name: 'Barn',
    emoji: '🛖',
    w: 2,
    h: 2,
    cost: { wood: 16 },
    jobs: 0,
    buildTime: 6,
    desc: 'Raises how much of every resource you can store.',
  },
};

export const BUILD_ORDER: BuildingType[] = [
  'house',
  'gatherer',
  'farm',
  'lumberyard',
  'woodcutter',
  'quarry',
  'mine',
  'barn',
];
