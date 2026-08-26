/**
 * Headless simulation tests for the two-tier clothing system: Regular Clothing (leather OR wool)
 * and Warm Clothing (leather AND wool, twice the fuel benefit worn).
 *
 * Same shape as `stability.test.ts` — drives `update`/`debugEndSeason` directly in Node, no
 * browser or renderer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { update, debugEndSeason, limitStock, atLimit } from '../src/game/simulation';
import { totalStored } from '../src/game/storage';
import {
  BUILDING_DEFS, CLOTHED_HEAT_FACTOR, WARM_CLOTHED_HEAT_FACTOR,
} from '../src/types';
import type { GameState, Building, BuildingType, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number, diff: any = 'normal') => newGame('small', diff, false, seed);
const barnOf = (s: GameState) => s.buildings.find((b) => b.type === 'barn')!;

function addAdults(s: GameState, n: number) {
  for (let i = 0; i < n; i++)
    s.citizens.push({
      id: s.nextId++, name: 'X', x: s.origin.x, y: s.origin.y, tx: s.origin.x, ty: s.origin.y,
      homeId: null, jobId: null, carry: null, task: { kind: 'idle' }, timer: 0,
      sex: i % 2 ? 'm' : 'f', age: 25, health: 80, happiness: 80, educated: false, sick: false,
    } as Citizen);
}

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

/** A finished, staffable workplace/dwelling — bypasses construction entirely. */
function builtWorkplace(s: GameState, type: BuildingType): Building {
  const { x, y } = findClear(s, BUILDING_DEFS[type].w, BUILDING_DEFS[type].h);
  const b: Building = {
    id: s.nextId++, type, x, y, built: true, progress: BUILDING_DEFS[type].work, workers: [],
    desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'leather', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  s.navVersion = (s.navVersion ?? 0) + 1;
  return b;
}

// ---------------------------------------------------------------------------------------------
// Tailor production
// ---------------------------------------------------------------------------------------------
// A tailor's output is carried off to the nearest barn the moment a worker fills a load (see
// `Citizen.pending` → `carry`), so these check the village's total stock, not the building's own
// input buffer — the same reason the barn total, not the workshop, is what a player watches.
test('tailor: sews Regular Clothing from leather alone', () => {
  const s = mk(1001);
  barnOf(s).store.fruit = 4000; barnOf(s).store.firewood = 2000;
  addAdults(s, 4);
  const tailor = builtWorkplace(s, 'tailor');
  tailor.recipe = 'leather';
  tailor.store.leather = 500;
  tailor.desiredWorkers = 1;
  const startClothing = totalStored(s, 'clothing'); // the founding village starts with some
  for (let i = 0; i < 800; i++) update(s, 0.5, noLog);
  assert.ok(totalStored(s, 'clothing') > startClothing, 'produced some Regular Clothing');
  assert.equal(totalStored(s, 'warmclothing'), 0, 'no Warm Clothing from the leather recipe');
  assert.ok((tailor.store.leather ?? 0) < 500, 'leather was consumed');
});

test('tailor: sews Regular Clothing from wool alone', () => {
  const s = mk(1002);
  barnOf(s).store.fruit = 4000; barnOf(s).store.firewood = 2000;
  addAdults(s, 4);
  const tailor = builtWorkplace(s, 'tailor');
  tailor.recipe = 'wool';
  tailor.store.wool = 500;
  tailor.desiredWorkers = 1;
  const startClothing = totalStored(s, 'clothing');
  for (let i = 0; i < 800; i++) update(s, 0.5, noLog);
  assert.ok(totalStored(s, 'clothing') > startClothing, 'produced some Regular Clothing');
  assert.equal(totalStored(s, 'warmclothing'), 0, 'no Warm Clothing from the wool recipe');
  assert.ok((tailor.store.wool ?? 0) < 500, 'wool was consumed');
});

test('tailor: the warm recipe needs BOTH leather and wool, and sews only Warm Clothing', () => {
  const s = mk(1003);
  barnOf(s).store.fruit = 4000; barnOf(s).store.firewood = 2000;
  addAdults(s, 4);
  const tailor = builtWorkplace(s, 'tailor');
  tailor.recipe = 'warm';
  tailor.desiredWorkers = 1;
  const startClothing = totalStored(s, 'clothing');
  // Leather only — the recipe must not fire without wool too.
  tailor.store.leather = 500;
  for (let i = 0; i < 200; i++) update(s, 0.5, noLog);
  assert.equal(totalStored(s, 'warmclothing'), 0, 'no Warm Clothing without wool on hand');
  assert.equal(tailor.store.leather, 500, 'leather-only stock is untouched — the recipe needs both');

  // Now give it wool too.
  tailor.store.wool = 500;
  for (let i = 0; i < 800; i++) update(s, 0.5, noLog);
  assert.ok(totalStored(s, 'warmclothing') > 0, 'sews Warm Clothing once both inputs are on hand');
  assert.equal(totalStored(s, 'clothing'), startClothing, 'the warm bench never produces plain Regular Clothing');
  assert.ok((tailor.store.leather ?? 0) < 500, 'leather was consumed');
  assert.ok((tailor.store.wool ?? 0) < 500, 'wool was consumed too — both inputs spent together');
});

// ---------------------------------------------------------------------------------------------
// Household issuance & the heat benefit
// ---------------------------------------------------------------------------------------------
function homeFor(s: GameState, c: Citizen, store: Building['store']): Building {
  const house = builtWorkplace(s, 'house');
  house.store = { ...store };
  c.homeId = house.id;
  return house;
}

test('a household with both tiers in its larder is issued Warm Clothing, not Regular', () => {
  const s = mk(2001);
  addAdults(s, 1);
  const c = s.citizens[s.citizens.length - 1]; // the founding villagers already have homes/state
  const house = homeFor(s, c, { clothing: 1000, warmclothing: 1000, firewood: 1000, fruit: 1000 });
  debugEndSeason(s, noLog);
  assert.equal(c.warmClothed, true, 'issued Warm Clothing when the larder holds both');
  assert.equal(c.clothed, true);
  assert.equal(house.store.clothing, 1000, 'the Regular Clothing in the larder was left untouched');
  assert.ok((house.store.warmclothing ?? 0) < 1000, 'the Warm Clothing in the larder was drawn on instead');
});

test('a household with only Regular Clothing is issued that, and reads as clothed but not warm', () => {
  const s = mk(2002);
  addAdults(s, 1);
  const c = s.citizens[s.citizens.length - 1];
  homeFor(s, c, { clothing: 1000, firewood: 1000, fruit: 1000 });
  debugEndSeason(s, noLog);
  assert.equal(c.clothed, true);
  assert.equal(c.warmClothed, false, 'Regular Clothing does not count as the warm tier');
});

test('Warm Clothing halves winter fuel spend, Regular Clothing only cuts a quarter — exactly 2x the benefit', () => {
  const s = mk(2003);
  // Only these three citizens — the founding population is cleared so nobody else can be rehoused
  // into (and draw fuel from) the three test houses mid-tick, which would confound the comparison.
  // Same sex on all three so the household-pairing sweep (`formCouples`) leaves them single and in
  // the houses they were put in, rather than moving one in with another.
  s.citizens = [];
  addAdults(s, 3);
  const [bare, regular, warm] = s.citizens;
  for (const c of [bare, regular, warm]) c.sex = 'f';
  const hBare = homeFor(s, bare, { firewood: 100000, fruit: 1000 });
  const hRegular = homeFor(s, regular, { firewood: 100000, fruit: 1000 });
  const hWarm = homeFor(s, warm, { firewood: 100000, fruit: 1000 });
  // Set the flags directly, as `endSeason` would have — isolates the heat-factor math from the
  // issuance/larder logic already covered above.
  bare.clothed = false; bare.warmClothed = false;
  regular.clothed = true; regular.warmClothed = false;
  warm.clothed = true; warm.warmClothed = true;
  s.season = 3; // Winter — SEASON_BURN is 1.0, the un-scaled rate
  update(s, 5, noLog); // short tick: nowhere near a season boundary, flags stay put

  const consumed = (h: Building) => 100000 - (h.store.firewood ?? 0);
  const cBare = consumed(hBare), cRegular = consumed(hRegular), cWarm = consumed(hWarm);
  assert.ok(cBare > 0, 'the uncoated baseline actually burned fuel');
  const savingsRegular = cBare - cRegular;
  const savingsWarm = cBare - cWarm;
  assert.ok(savingsRegular > 0 && savingsWarm > 0, 'both coats saved fuel over the bare baseline');
  assert.ok(
    Math.abs(savingsWarm / savingsRegular - 2) < 0.01,
    `Warm Clothing's fuel saving (${savingsWarm}) should be exactly 2x Regular's (${savingsRegular})`,
  );
  // And the underlying constants agree, independent of any particular tick's arithmetic.
  assert.ok(
    Math.abs((1 - WARM_CLOTHED_HEAT_FACTOR) / (1 - CLOTHED_HEAT_FACTOR) - 2) < 1e-9,
    'WARM_CLOTHED_HEAT_FACTOR is derived to be exactly double the Regular saving',
  );
});

// ---------------------------------------------------------------------------------------------
// Stockpile cap
// ---------------------------------------------------------------------------------------------
test('the clothing stockpile cap folds Regular and Warm together, like tools/steeltools', () => {
  const s = mk(3001);
  const barn = barnOf(s);
  s.limits = { ...(s.limits ?? {}), clothing: 100 };
  barn.store.clothing = 40;
  barn.store.warmclothing = 40;
  assert.equal(limitStock(s, 'clothing'), 80, 'both tiers count toward the one figure');
  assert.equal(atLimit(s, 'clothing'), false);
  barn.store.warmclothing = 70;
  assert.equal(limitStock(s, 'clothing'), 110);
  assert.equal(atLimit(s, 'clothing'), true, 'the combined stock trips the shared cap');
});
