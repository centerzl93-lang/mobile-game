/**
 * The Builders job row's denominator: the sum of every active construction project's own builder
 * requirement (`autoBuilderDemand`/`buildersWantedFor`), not a generic village-wide target. Pure
 * state math — no need to run `update()` at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { BUILDING_DEFS, autoBuilderDemand, buildersWantedFor } from '../src/types';
import type { GameState, Building, BuildingType } from '../src/types';

const mk = (seed: number, diff: any = 'normal') => newGame('small', diff, false, seed);

function findClear(s: GameState, w: number, h: number): { x: number; y: number } {
  const occ = (x: number, y: number) => s.buildings.some((b) => {
    const bw = b.w ?? BUILDING_DEFS[b.type].w, bh = b.h ?? BUILDING_DEFS[b.type].h;
    return x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y;
  });
  for (let r = 3; r < 30; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s.origin.x + dx, y = s.origin.y + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w && ok; xx++) {
            const t = s.tiles[(y + yy) * s.w + (x + xx)];
            if (!t || t.type !== 'grass') ok = false;
          }
        if (ok && !occ(x, y)) return { x, y };
      }
  throw new Error('no clear spot');
}

/** An unbuilt construction site of `type`, dropped straight onto the map. */
function siteOf(s: GameState, type: BuildingType): Building {
  const { x, y } = findClear(s, BUILDING_DEFS[type].w, BUILDING_DEFS[type].h);
  const b: Building = {
    id: s.nextId++, type, x, y, built: false, progress: 0, workers: [], desiredWorkers: 0,
    growth: 0, output: 'coal', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  return b;
}

test('a house alone asks for exactly its own builder requirement (2)', () => {
  const s = mk(4001);
  const base = autoBuilderDemand(s);
  assert.equal(buildersWantedFor('house'), 2, 'sanity: BUILDING_DEFS backs this figure');
  siteOf(s, 'house');
  assert.equal(autoBuilderDemand(s), base + 2);
});

test('two simultaneous projects sum their requirements: House (2) + Town Hall (4) = 6', () => {
  const s = mk(4002);
  const base = autoBuilderDemand(s);
  assert.equal(buildersWantedFor('townhall'), 4, 'sanity: BUILDING_DEFS backs this figure');
  const house = siteOf(s, 'house');
  const hall = siteOf(s, 'townhall');
  assert.equal(autoBuilderDemand(s), base + 6, 'the panel denominator sums both open sites');

  // Finishing the house drops it back to just the Town Hall's requirement.
  house.built = true;
  house.progress = BUILDING_DEFS.house.work;
  assert.equal(autoBuilderDemand(s), base + 4);

  // Finishing the Town Hall too removes it entirely — nothing left under construction.
  hall.built = true;
  hall.progress = BUILDING_DEFS.townhall.work;
  assert.equal(autoBuilderDemand(s), base);
});

test('a cancelled/never-placed site asks for nothing — the figure only counts real open work', () => {
  const s = mk(4003);
  const base = autoBuilderDemand(s);
  const house = siteOf(s, 'house');
  assert.equal(autoBuilderDemand(s), base + 2);
  // Removing the site (as `cancelConstruction` does) drops the demand immediately.
  s.buildings = s.buildings.filter((b) => b.id !== house.id);
  assert.equal(autoBuilderDemand(s), base);
});

test('demolition and rubble ask for builders too, distinctly from fresh construction', () => {
  const s = mk(4004);
  const base = autoBuilderDemand(s);
  const { x, y } = findClear(s, BUILDING_DEFS.house.w, BUILDING_DEFS.house.h);
  const finished: Building = {
    id: s.nextId++, type: 'house', x, y, built: true, progress: BUILDING_DEFS.house.work,
    workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', replant: false,
    animal: 'cattle', store: {},
  };
  s.buildings.push(finished);
  assert.equal(autoBuilderDemand(s), base, 'a finished building asks for nothing');
  finished.demolish = true;
  assert.equal(autoBuilderDemand(s), base + buildersWantedFor('house'), 'marking it for demolition asks for the same crew building it would have');
});
