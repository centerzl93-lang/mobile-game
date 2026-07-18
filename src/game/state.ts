import {
  GameState,
  Building,
  Citizen,
  BUILDING_DEFS,
  HOUSING_PER_HOUSE,
  STORAGE_BASE,
  STORAGE_PER_BARN,
  START_CITIZENS,
  START_COAL,
  START_FIREWOOD,
  START_FOOD,
  START_STONE,
  START_WOOD,
} from '../types';
import { generateWorld, findStartTile } from './world';

export function newGame(seed?: number): GameState {
  const tiles = generateWorld(seed);
  const start = findStartTile(tiles);

  const state: GameState = {
    tiles,
    buildings: [],
    citizens: [],
    resources: {
      food: START_FOOD,
      wood: START_WOOD,
      firewood: START_FIREWOOD,
      stone: START_STONE,
      coal: START_COAL,
    },
    season: 0,
    year: 1,
    seasonTimer: 0,
    nextId: 1,
    gameOver: false,
    everLived: true,
  };

  // Seed a few villagers milling around the starting clearing.
  for (let i = 0; i < START_CITIZENS; i++) {
    const c: Citizen = {
      id: state.nextId++,
      x: start.x + (Math.random() * 2 - 1),
      y: start.y + (Math.random() * 2 - 1),
      tx: start.x,
      ty: start.y,
      homeId: null,
      jobId: null,
      state: 'wander',
      timer: Math.random() * 2,
      age: 18 + Math.floor(Math.random() * 20),
    };
    state.citizens.push(c);
  }
  return state;
}

export function housingCapacity(s: GameState): number {
  let cap = 0;
  for (const b of s.buildings) {
    if (b.built && b.type === 'house') cap += HOUSING_PER_HOUSE;
  }
  return cap;
}

export function storageCap(s: GameState): number {
  let cap = STORAGE_BASE;
  for (const b of s.buildings) {
    if (b.built && b.type === 'barn') cap += STORAGE_PER_BARN;
  }
  return cap;
}

export function jobSlots(s: GameState): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const b of s.buildings) {
    if (!b.built) continue;
    const def = BUILDING_DEFS[b.type];
    total += def.jobs;
    filled += Math.min(b.workers.length, def.jobs);
  }
  return { filled, total };
}

export function buildingCenter(b: Building): { x: number; y: number } {
  const def = BUILDING_DEFS[b.type];
  return { x: b.x + def.w / 2, y: b.y + def.h / 2 };
}
