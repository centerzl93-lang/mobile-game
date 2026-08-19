/**
 * Headless regression tests for merchant/trading-post livestock delivery.
 *
 * A river trader only needs a *built* trading post to call — staffing is optional. The bug these
 * pin down: livestock bought at an *unstaffed* post was stranded in the post's inventory forever,
 * because the post keeper (the only thing that carted a purchase out to the barns) never ran, and
 * the rancher only ever fetched livestock from barns. A bought herd therefore never reached its
 * ranch. Now a bought herd is left standing in the post/port pen and the rancher hauls it home
 * directly (`penFromStorage` → `nearestStockWith`), keeper or no keeper.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { update, basketTrade } from '../src/game/simulation';
import { BUILDING_DEFS, TRADE_VALUE } from '../src/types';
import type { GameState, Building, BuildingType, ResourceKind, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number) => newGame('small', 'normal', false, seed);

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

function builtBuilding(s: GameState, type: BuildingType, extra?: Partial<Building>): Building {
  const w = extra?.w ?? BUILDING_DEFS[type].w, h = extra?.h ?? BUILDING_DEFS[type].h;
  const { x, y } = findClear(s, w, h);
  const b = {
    id: s.nextId++, type, x, y, built: true, progress: BUILDING_DEFS[type].work, workers: [],
    desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', replant: false,
    animal: 'cattle', store: {}, ...extra,
  } as Building;
  s.buildings.push(b);
  return b;
}

function addAdults(s: GameState, n: number) {
  for (let i = 0; i < n; i++)
    s.citizens.push({
      id: s.nextId++, name: 'X', x: s.origin.x, y: s.origin.y, tx: s.origin.x, ty: s.origin.y,
      homeId: null, jobId: null, carry: null, task: { kind: 'idle' }, timer: 0,
      sex: i % 2 ? 'm' : 'f', age: 25, health: 80, happiness: 80, educated: false, sick: false,
    } as Citizen);
}

const barnCattle = (s: GameState) =>
  s.buildings.filter((b) => b.type === 'barn').reduce((n, b) => n + (b.store.cattle ?? 0), 0);

/** Dock a merchant selling `stock` and buy `get` for `wood` pre-stocked in the post. */
function buy(s: GameState, post: Building, get: Partial<Record<ResourceKind, number>>) {
  s.merchant.present = true;
  (s.merchant as unknown as { category: string }).category = 'animals';
  s.merchant.stock = { ...get } as GameState['merchant']['stock'];
  s.merchant.priceMod = 1;
  let value = 0;
  for (const [k, q] of Object.entries(get)) value += TRADE_VALUE[k as ResourceKind] * (q ?? 0);
  const wood = Math.ceil(value / TRADE_VALUE.wood) + 4;
  post.store.wood = (post.store.wood ?? 0) + wood;
  return basketTrade(s, { give: { wood }, get, buySeeds: [] } as never);
}

// ---------------------------------------------------------------------------------------------
test('trade: livestock bought at an unstaffed post is hauled home by the rancher', () => {
  const s = mk(12345);
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  barn.store.fruit = 4000; // no starvation pressure
  addAdults(s, 12);
  const post = builtBuilding(s, 'trading', { desiredWorkers: 0 }); // unstaffed on purpose
  const ranch = builtBuilding(s, 'ranch', {
    animal: 'cattle', animals: 0, desiredWorkers: BUILDING_DEFS['ranch'].jobs,
  });

  const res = buy(s, post, { cattle: 6 });
  assert.ok((res as { ok: boolean }).ok, 'the trade settles');

  // The herd stays standing in the post's pen — the keeper is not the delivery path.
  assert.equal(post.store.cattle ?? 0, 6, 'the herd waits in the post inventory');
  assert.equal(barnCattle(s), 0, 'nothing is carted off to a barn');

  // The rancher walks to the post and drives the herd home, no keeper ever involved. The ranch
  // fills to its cap; whatever the pen can't hold stays standing in the post (no head vanishes).
  for (let t = 0; t < 600; t += 0.2) update(s, 0.2, noLog);
  assert.ok((ranch.animals ?? 0) >= 5, `ranch penned the herd (${ranch.animals})`);
  assert.equal(
    (ranch.animals ?? 0) + (post.store.cattle ?? 0), 6,
    'every head accounted for — penned or still standing in the post, none lost',
  );
  assert.equal(barnCattle(s), 0, 'the rancher drove them from the post, not via a barn');
  assert.equal(s.citizens.filter((c) => c.jobId === post.id).length, 0, 'post stayed unstaffed');
});

test('trade: a staffed post keeper leaves bought livestock standing (does not haul it to barns)', () => {
  const s = mk(12345);
  addAdults(s, 6);
  const post = builtBuilding(s, 'trading', { desiredWorkers: BUILDING_DEFS['trading'].jobs });
  const res = buy(s, post, { cattle: 6 });
  assert.ok((res as { ok: boolean }).ok, 'the trade settles');
  // Run a while: with no ranch to fetch them, a keeper must still leave the animals in the post.
  for (let t = 0; t < 300; t += 0.2) update(s, 0.2, noLog);
  assert.equal(post.store.cattle ?? 0, 6, 'the keeper leaves the herd in the post');
  assert.equal(barnCattle(s), 0, 'no livestock carted to a barn');
});
