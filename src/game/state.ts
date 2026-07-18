import {
  GameState,
  Building,
  Citizen,
  BuildingType,
  BUILDING_DEFS,
  HOUSING_PER_HOUSE,
  BARN_CAPACITY,
  START_CITIZENS,
  START_RESOURCES,
  MERCHANT_VISIT_EVERY,
  ResourceKind,
} from '../types';
import { generateWorld, findStartTile, emptyPaths } from './world';

function makeBuilding(s: { nextId: number }, type: BuildingType, x: number, y: number, built: boolean): Building {
  const def = BUILDING_DEFS[type];
  return {
    id: s.nextId++,
    type,
    x,
    y,
    built,
    progress: built ? def.buildTime : 0,
    workers: [],
    desiredWorkers: def.jobs,
    growth: 0,
    output: 'coal',
    recipe: 'iron',
    store: {},
  };
}

export function newGame(seed?: number): GameState {
  const tiles = generateWorld(seed);
  const start = findStartTile(tiles);

  const state: GameState = {
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
    merchant: { present: false, timer: MERCHANT_VISIT_EVERY, stock: {} },
    pathProgress: 0,
  };

  // A starting barn holds the initial stockpile.
  const barn = makeBuilding(state, 'barn', start.x, start.y, true);
  for (const k of Object.keys(START_RESOURCES) as ResourceKind[]) {
    if (START_RESOURCES[k] > 0) barn.store[k] = START_RESOURCES[k];
  }
  state.buildings.push(barn);

  for (let i = 0; i < START_CITIZENS; i++) {
    state.citizens.push({
      id: state.nextId++,
      x: start.x + 2 + (Math.random() * 2 - 1),
      y: start.y + 2 + (Math.random() * 2 - 1),
      tx: start.x + 2,
      ty: start.y + 2,
      homeId: null,
      jobId: null,
      carry: null,
      task: { kind: 'idle' },
      timer: 0,
      age: 18 + Math.floor(Math.random() * 20),
    });
  }
  return state;
}

export function housingCapacity(s: GameState): number {
  let cap = 0;
  for (const b of s.buildings) if (b.built && b.type === 'house') cap += HOUSING_PER_HOUSE;
  return cap;
}

export function storageCap(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) if (b.built && b.type === 'barn') n += BARN_CAPACITY;
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
  const def = BUILDING_DEFS[b.type];
  return { x: b.x + def.w / 2, y: b.y + def.h / 2 };
}

export { makeBuilding };
