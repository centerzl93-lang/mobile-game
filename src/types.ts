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

export type ResourceKind = 'food' | 'wood' | 'firewood';

export interface Resources {
  food: number;
  wood: number;
  firewood: number;
}

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export type BuildingType =
  | 'house'
  | 'gatherer'
  | 'woodcutter'
  | 'farm'
  | 'barn';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  emoji: string;
  w: number;
  h: number;
  woodCost: number;
  /** Max workers this building employs (0 = no jobs, e.g. house/barn). */
  jobs: number;
  /** Seconds of work to finish construction. */
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

// ---- Balance constants ----
export const SEASON_LENGTH = 24; // seconds per season at 1x speed
export const HOUSING_PER_HOUSE = 4;
export const STORAGE_BASE = 60;
export const STORAGE_PER_BARN = 120;
export const FOOD_PER_CITIZEN_PER_SEASON = 5;
export const FIREWOOD_PER_CITIZEN_WINTER = 4;
export const START_FOOD = 60;
export const START_WOOD = 45;
export const START_FIREWOOD = 24;
export const START_CITIZENS = 4;

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: {
    type: 'house',
    name: 'House',
    emoji: '🏠',
    w: 2,
    h: 2,
    woodCost: 12,
    jobs: 0,
    buildTime: 5,
    desc: 'Homes up to 4 villagers and lets families grow.',
  },
  gatherer: {
    type: 'gatherer',
    name: 'Gatherer',
    emoji: '🧺',
    w: 2,
    h: 2,
    woodCost: 10,
    jobs: 2,
    buildTime: 5,
    desc: 'Collects food from nearby forest all year round.',
  },
  woodcutter: {
    type: 'woodcutter',
    name: 'Woodcutter',
    emoji: '🪓',
    w: 2,
    h: 2,
    woodCost: 8,
    jobs: 2,
    buildTime: 5,
    desc: 'Fells nearby trees for wood and splits firewood.',
  },
  farm: {
    type: 'farm',
    name: 'Field',
    emoji: '🌱',
    w: 3,
    h: 3,
    woodCost: 6,
    jobs: 2,
    buildTime: 4,
    desc: 'Grows crops through the year; harvested each autumn.',
  },
  barn: {
    type: 'barn',
    name: 'Barn',
    emoji: '🛖',
    w: 2,
    h: 2,
    woodCost: 14,
    jobs: 0,
    buildTime: 5,
    desc: 'Raises how much food, wood and firewood you can store.',
  },
};

export const BUILD_ORDER: BuildingType[] = [
  'house',
  'gatherer',
  'woodcutter',
  'farm',
  'barn',
];
