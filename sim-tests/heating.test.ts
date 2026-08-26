/**
 * Headless simulation tests for winter heating: how housing quality and clothing tier combine to
 * set a household's firewood bill, and how that combination is expected to behave as the village
 * grows.
 *
 * `heat()` (simulation.ts) bills `HEAT_PER_CITIZEN_WINTER * rate * wallFactor * clothFactor *
 * fuelFactor` continuously, every tick — the same multiplicative shape `eat()` uses for food
 * (`householdFoodFactor`) and the builders/workers use for policy bonuses. `wallFactor` comes from
 * `heatFactorOf(house.type)`, the same helper `storage.ts` already used to size a household's
 * firewood larder target (`houseFuelPerSeason`/`larderTarget`) — these tests exist because that
 * helper was wired into the larder target but not into `heat()` itself, so a Grand House's
 * advertised fuel saving (see its `desc` in `BUILDING_DEFS`) was never actually applied to
 * consumption. `heatFactorOf` is the one housing-efficiency figure both paths now read.
 *
 * `fuelFactor` also folds in `difficultyHeatFactor` (`DIFFICULTY_HEAT_FACTOR`) — Hard's own
 * ongoing cut to heating demand, Easy's own ongoing discount, on top of (not instead of) their
 * different starting stockpiles. The chosen values were picked from a balance sweep (see the
 * "difficulty" tests below and the balance report) rather than by feel.
 *
 * Same shape as `clothing.test.ts` — drives `update` directly in Node, no browser or renderer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { update } from '../src/game/simulation';
import { houseFuelPerSeason } from '../src/game/storage';
import {
  BUILDING_DEFS, HEAT_PER_CITIZEN_WINTER, FIREWOOD_HEAT, SEASON_BURN,
  STONE_HOUSE_HEAT_FACTOR, GRAND_HOUSE_HEAT_FACTOR, CLOTHED_HEAT_FACTOR, WARM_CLOTHED_HEAT_FACTOR,
  heatFactorOf, DIFFICULTY_HEAT_FACTOR,
} from '../src/types';
import type { GameState, Building, BuildingType, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number, diff: any = 'normal') => newGame('small', diff, false, seed);

function addAdults(s: GameState, n: number, sex: 'm' | 'f' = 'f') {
  for (let i = 0; i < n; i++)
    s.citizens.push({
      id: s.nextId++, name: 'X', x: s.origin.x, y: s.origin.y, tx: s.origin.x, ty: s.origin.y,
      homeId: null, jobId: null, carry: null, task: { kind: 'idle' }, timer: 0,
      sex, age: 25, health: 80, happiness: 80, educated: false, sick: false,
    } as Citizen);
}

function findClear(s: GameState, w: number, h: number): { x: number; y: number } {
  const occ = (x: number, y: number) => s.buildings.some((b) => {
    const bw = b.w ?? BUILDING_DEFS[b.type].w, bh = b.h ?? BUILDING_DEFS[b.type].h;
    return x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y;
  });
  for (let r = 3; r < 40; r++)
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

/** A finished house, standing in for construction, with an explicit larder. */
function builtHouse(s: GameState, type: BuildingType, store: Building['store'] = {}): Building {
  const { x, y } = findClear(s, BUILDING_DEFS[type].w, BUILDING_DEFS[type].h);
  const b: Building = {
    id: s.nextId++, type, x, y, built: true, progress: BUILDING_DEFS[type].work, workers: [],
    desiredWorkers: 0, growth: 0, store: { firewood: 1e6, fruit: 1e6, ...store },
  };
  s.buildings.push(b);
  s.navVersion = (s.navVersion ?? 0) + 1;
  return b;
}

/** One citizen, alone in a fresh house of `type`, with clothing flags set directly (bypassing
 * issuance so the housing/clothing math is isolated from the season-boundary larder logic already
 * covered by `clothing.test.ts`). */
function citizenIn(s: GameState, type: BuildingType, clothed: boolean, warmClothed: boolean): { c: Citizen; h: Building } {
  addAdults(s, 1);
  const c = s.citizens[s.citizens.length - 1];
  const h = builtHouse(s, type);
  c.homeId = h.id;
  c.clothed = clothed;
  c.warmClothed = warmClothed;
  return { c, h };
}

/** Firewood a household's larder lost over one `update` call, in a season where SEASON_BURN
 * is exactly 1 (winter) so the reading is the un-scaled per-tick rate. */
function burned(s: GameState, h: Building, dt: number): number {
  const before = h.store.firewood ?? 0;
  s.season = 3; // Winter
  update(s, dt, noLog);
  return before - (h.store.firewood ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Base demand
// ---------------------------------------------------------------------------------------------
test('base firewood demand: a bare, uncoated citizen in a wooden house burns the full rate', () => {
  const s = mk(4001);
  s.citizens = [];
  const { h } = citizenIn(s, 'house', false, false);
  const dt = 5;
  const got = burned(s, h, dt);
  const rate = (dt / 600) * SEASON_BURN.Winter; // SEASON_LENGTH is 600s
  const expected = HEAT_PER_CITIZEN_WINTER * rate; // wallFactor=1, clothFactor=1, fuelFactor=1
  assert.ok(Math.abs(got - expected) < 1e-6, `expected ${expected}, got ${got}`);
});

// ---------------------------------------------------------------------------------------------
// Housing efficiency
// ---------------------------------------------------------------------------------------------
test('a stone house burns exactly STONE_HOUSE_HEAT_FACTOR of a wooden house, uncoated', () => {
  const s = mk(4002);
  s.citizens = [];
  const { h: hHouse } = citizenIn(s, 'house', false, false);
  const { h: hStone } = citizenIn(s, 'stonehouse', false, false);
  const dt = 5;
  const cHouse = burned(s, hHouse, dt);
  const cStone = burned(s, hStone, dt);
  assert.ok(cHouse > 0 && cStone > 0);
  assert.ok(
    Math.abs(cStone / cHouse - STONE_HOUSE_HEAT_FACTOR) < 1e-6,
    `stone house should burn ${STONE_HOUSE_HEAT_FACTOR}x a wooden house's fuel, got ${cStone / cHouse}`,
  );
});

test('a grand house burns exactly GRAND_HOUSE_HEAT_FACTOR of a wooden house, and less than a stone house', () => {
  const s = mk(4003);
  s.citizens = [];
  const { h: hHouse } = citizenIn(s, 'house', false, false);
  const { h: hStone } = citizenIn(s, 'stonehouse', false, false);
  const { h: hGrand } = citizenIn(s, 'grandhouse', false, false);
  const dt = 5;
  const cHouse = burned(s, hHouse, dt);
  const cStone = burned(s, hStone, dt);
  const cGrand = burned(s, hGrand, dt);
  assert.ok(
    Math.abs(cGrand / cHouse - GRAND_HOUSE_HEAT_FACTOR) < 1e-6,
    `grand house should burn ${GRAND_HOUSE_HEAT_FACTOR}x a wooden house's fuel, got ${cGrand / cHouse}`,
  );
  assert.ok(
    cGrand < cStone,
    `a grand house (${cGrand}) should burn less firewood than a stone house (${cStone}), matching its desc`,
  );
  assert.equal(heatFactorOf('house'), 1);
  assert.equal(heatFactorOf('stonehouse'), STONE_HOUSE_HEAT_FACTOR);
  assert.equal(heatFactorOf('grandhouse'), GRAND_HOUSE_HEAT_FACTOR);
});

// ---------------------------------------------------------------------------------------------
// Clothing efficiency (housing held constant) — a companion to clothing.test.ts's own coverage,
// checked here against the same wooden-house baseline the housing tests above use.
// ---------------------------------------------------------------------------------------------
test('clothing cuts firewood the same way in a wooden house: Regular a quarter, Warm exactly double that', () => {
  const s = mk(4004);
  s.citizens = [];
  const { h: hBare } = citizenIn(s, 'house', false, false);
  const { h: hRegular } = citizenIn(s, 'house', true, false);
  const { h: hWarm } = citizenIn(s, 'house', true, true);
  const dt = 5;
  const cBare = burned(s, hBare, dt);
  const cRegular = burned(s, hRegular, dt);
  const cWarm = burned(s, hWarm, dt);
  assert.ok(Math.abs(cRegular / cBare - CLOTHED_HEAT_FACTOR) < 1e-6);
  assert.ok(Math.abs(cWarm / cBare - WARM_CLOTHED_HEAT_FACTOR) < 1e-6);
});

// ---------------------------------------------------------------------------------------------
// Housing x clothing interaction — the two modifiers must multiply, not stack additively or
// double-count each other.
// ---------------------------------------------------------------------------------------------
test('housing and clothing stack multiplicatively: a warmly-dressed grand household burns wallFactor x clothFactor of baseline', () => {
  const s = mk(4005);
  s.citizens = [];
  const { h: hBase } = citizenIn(s, 'house', false, false);
  const { h: hBest } = citizenIn(s, 'grandhouse', true, true);
  const dt = 5;
  const cBase = burned(s, hBase, dt);
  const cBest = burned(s, hBest, dt);
  const expectedRatio = GRAND_HOUSE_HEAT_FACTOR * WARM_CLOTHED_HEAT_FACTOR;
  assert.ok(
    Math.abs(cBest / cBase - expectedRatio) < 1e-6,
    `combined saving should be exactly the product of the two factors (${expectedRatio}), got ${cBest / cBase}`,
  );
  // And it is a real, bounded saving — not zero. A fully-invested household still needs firewood.
  assert.ok(cBest > 0, 'a grand house with warm clothing still burns some firewood — heating is never free');
  assert.ok(cBest < cBase, 'the combined household burns meaningfully less than the baseline');
});

// ---------------------------------------------------------------------------------------------
// No double-counting: the live per-tick burn and the larder-target estimate must agree, since
// both now read the housing factor from the same `heatFactorOf` helper.
// ---------------------------------------------------------------------------------------------
test('the live heat() burn rate matches houseFuelPerSeason\'s estimate for the same household', () => {
  const s = mk(4006);
  s.citizens = [];
  addAdults(s, 3, 'f'); // same sex so formCouples leaves them where they are put
  const h = builtHouse(s, 'grandhouse');
  for (const c of s.citizens) { c.homeId = h.id; c.clothed = true; c.warmClothed = true; }
  s.season = 3; // Winter
  const estimatedPerSeason = houseFuelPerSeason(s, h); // firewood units for the whole season
  const dt = 10;
  const got = burned(s, h, dt);
  const expected = estimatedPerSeason * (dt / 600); // 600 = SEASON_LENGTH, Winter burn is 1.0
  assert.ok(
    Math.abs(got - expected) < 1e-6,
    `live consumption (${got}) should match the larder-target rate (${expected}) — one heating model, not two`,
  );
});

// ---------------------------------------------------------------------------------------------
// Population scaling vs efficiency: growth raises total demand, efficiency lowers the per-citizen
// rate — and the two are independent of each other.
// ---------------------------------------------------------------------------------------------
test('firewood demand scales linearly with headcount at a fixed housing/clothing tier', () => {
  const s = mk(4007);
  s.citizens = [];
  const { h: h1 } = citizenIn(s, 'house', false, false);
  addAdults(s, 1, 'f');
  s.citizens[s.citizens.length - 1].homeId = h1.id; // a second bare citizen in the same house
  const dt = 5;
  const c1 = burned(s, h1, dt);

  const s2 = mk(4007);
  s2.citizens = [];
  const { h: h4 } = citizenIn(s2, 'house', false, false);
  for (let i = 0; i < 3; i++) {
    addAdults(s2, 1, 'f');
    s2.citizens[s2.citizens.length - 1].homeId = h4.id;
  }
  const c4 = burned(s2, h4, dt);
  assert.ok(Math.abs(c4 / c1 - 2) < 0.01, `4 citizens should burn 2x what 2 do, got ratio ${c4 / c1}`);
});

test('scenario: a larger, well-invested village burns less firewood per citizen than a smaller, basic one', () => {
  // Scenario C: larger population, basic housing, no clothing.
  const sC = mk(4008);
  sC.citizens = [];
  const housesC: Building[] = [];
  for (let i = 0; i < 6; i++) {
    addAdults(sC, 1, 'f');
    const h = builtHouse(sC, 'house');
    sC.citizens[sC.citizens.length - 1].homeId = h.id;
    housesC.push(h);
  }
  const dt = 5;
  const totalC = housesC.reduce((sum, h) => sum + burned(sC, h, dt), 0);
  const perCitizenC = totalC / 6;

  // Scenario D: same population, grand houses, warm clothing.
  const sD = mk(4009);
  sD.citizens = [];
  const housesD: Building[] = [];
  for (let i = 0; i < 6; i++) {
    addAdults(sD, 1, 'f');
    const h = builtHouse(sD, 'grandhouse');
    const c = sD.citizens[sD.citizens.length - 1];
    c.homeId = h.id; c.clothed = true; c.warmClothed = true;
    housesD.push(h);
  }
  const totalD = housesD.reduce((sum, h) => sum + burned(sD, h, dt), 0);
  const perCitizenD = totalD / 6;

  assert.ok(
    perCitizenD < perCitizenC * (GRAND_HOUSE_HEAT_FACTOR * WARM_CLOTHED_HEAT_FACTOR + 0.01),
    `Scenario D (${perCitizenD}/citizen) should reflect the full housing+clothing saving over Scenario C (${perCitizenC}/citizen)`,
  );
  assert.ok(perCitizenD > 0, 'Scenario D is not free to heat — investment reduces demand, it does not eliminate it');
});

// ---------------------------------------------------------------------------------------------
// Difficulty: Hard's ongoing heating cut, on top of Hard's smaller starting stockpile
// (`DIFFICULTY_RESOURCES`) — see `DIFFICULTY_HEAT_FACTOR`. Deliberately a gentle multiplier
// (1.05–1.5 tested, 1.15 shipped) rather than anything near `HARD_FACTOR`'s 0.5: a stress test
// (`newgame`-style village, marginal woodcutter staffing, 3 simulated years) found the shipped
// 1.15 keeps a tight Hard village hard but survivable, while a 1.5 candidate was the first to
// actually cost a marginal village a life — see the balance report for the full sweep. Easy's own
// discount (0.9 shipped) is checked for the same non-triviality: a modestly-invested Easy village
// (house + Regular clothing only, not the maxed Grand House + Warm Clothing) should still be worth
// managing, not comfortably self-sufficient from a single coat.
// ---------------------------------------------------------------------------------------------
test('Hard burns more firewood than Normal, Easy less, for the identical household', () => {
  const mkOne = (diff: 'normal' | 'hard' | 'easy') => {
    const s = mk(4010, diff);
    s.citizens = [];
    const { h } = citizenIn(s, 'stonehouse', true, false);
    return { s, h };
  };
  const dt = 5;
  const { s: sN, h: hN } = mkOne('normal');
  const { s: sHd, h: hHd } = mkOne('hard');
  const { s: sE, h: hE } = mkOne('easy');
  const burnedNormal = burned(sN, hN, dt);
  const burnedHard = burned(sHd, hHd, dt);
  const burnedEasy = burned(sE, hE, dt);
  assert.ok(burnedHard > burnedNormal, 'Hard should burn more firewood than Normal for the same household');
  assert.ok(burnedEasy < burnedNormal, 'Easy should burn less firewood than Normal for the same household');
  assert.ok(
    Math.abs(burnedHard / burnedNormal - DIFFICULTY_HEAT_FACTOR.hard) < 1e-6,
    `Hard's burn should be exactly DIFFICULTY_HEAT_FACTOR.hard (${DIFFICULTY_HEAT_FACTOR.hard})x Normal's, got ${burnedHard / burnedNormal}`,
  );
  assert.ok(
    Math.abs(burnedEasy / burnedNormal - DIFFICULTY_HEAT_FACTOR.easy) < 1e-6,
    `Easy's burn should be exactly DIFFICULTY_HEAT_FACTOR.easy (${DIFFICULTY_HEAT_FACTOR.easy})x Normal's, got ${burnedEasy / burnedNormal}`,
  );
});

test('the shipped difficulty factors stay inside the tested "meaningfully different, not game-breaking" range', () => {
  // Pinned against the balance sweep: 1.05-1.5 tested for Hard (1.5 was the first to cost a
  // marginal village a life; 1.05 was barely distinguishable from Normal at a tight staffing
  // level), 0.95-0.75 for Easy (0.75 was the first to make even a minimally-invested household
  // comfortably self-sufficient). The shipped values sit inside that range, not at either edge.
  assert.ok(DIFFICULTY_HEAT_FACTOR.hard > 1, 'Hard must burn strictly more than Normal to mean anything');
  assert.ok(DIFFICULTY_HEAT_FACTOR.hard >= 1.1 && DIFFICULTY_HEAT_FACTOR.hard <= 1.3, 'Hard should sit in the tested "meaningfully harder, not fatal-by-itself" band');
  assert.ok(DIFFICULTY_HEAT_FACTOR.easy < 1, 'Easy must burn strictly less than Normal to mean anything');
  assert.ok(DIFFICULTY_HEAT_FACTOR.easy >= 0.85 && DIFFICULTY_HEAT_FACTOR.easy <= 0.95, 'Easy should sit in the tested "meaningfully easier, not free" band');
  assert.equal(DIFFICULTY_HEAT_FACTOR.normal, 1, 'Normal is the fixed reference point every other difficulty is measured against');
});

test('the household firewood larder target agrees with live consumption on every difficulty, not just Normal', () => {
  for (const diff of ['normal', 'hard', 'easy'] as const) {
    const s = mk(4011, diff);
    s.citizens = [];
    // A single resident — Easy's EASY_START_HOUSES leaves more than one house standing, which
    // wakes rehouseVillagers's "no couple here? keep one man and one woman" reshuffle and would
    // relocate a second same-sex citizen mid-test. One resident sidesteps that entirely.
    addAdults(s, 1, 'f');
    const h = builtHouse(s, 'grandhouse');
    for (const c of s.citizens) { c.homeId = h.id; c.clothed = true; c.warmClothed = true; }
    s.season = 3; // Winter
    const estimatedPerSeason = houseFuelPerSeason(s, h);
    const dt = 10;
    const got = burned(s, h, dt);
    const expected = estimatedPerSeason * (dt / 600);
    assert.ok(
      Math.abs(got - expected) < 1e-6,
      `[${diff}] live consumption (${got}) should match the larder-target rate (${expected}) — the difficulty cut must not be applied on one side only`,
    );
  }
});
