/**
 * Headless regression tests for the merchant/trading redesign: no dedicated Seed Merchant,
 * randomized Trading Post inventories, permanent seed unlocks at their new price, livestock
 * pricing, the Port's expanded random merchant pool with player-requested returns, and save
 * compatibility with the pre-redesign shape.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { update, basketTrade, requestMerchantReturn, berthReachesOpenWater } from '../src/game/simulation';
import { saveGame, loadGame, rawSlot, writeRawSlot } from '../src/game/save';
import { canPlace } from '../src/game/buildings';
import { pinRandom } from '../src/game/rng';
import {
  BUILDING_DEFS,
  TRADE_VALUE,
  SEED_COST,
  MERCHANT_CATEGORIES,
  MERCHANT_CATEGORY_STOCK,
  MERCHANT_ITEM_COUNT,
  SEED_OFFER_COUNT,
  PORT_MERCHANT_POOL,
  PORT_CATEGORIES,
  PORT_REQUEST_MAX,
  PORT_QUANTITY_VARIANCE,
  CROPS,
  RANCH_ANIMALS,
  SEASONS,
  SEASON_LENGTH,
} from '../src/types';
import type { GameState, Building, ResourceKind, Crop, MerchantCategory } from '../src/types';

const noLog = () => {};
const mk = (seed: number) => newGame('small', 'normal', false, seed);

/** Advance the simulation `seconds` of sim-time in fixed, moderate steps — fast, but never one
 *  giant single-tick jump (the game itself never takes one either; see `Game.debugAdvance`). */
function advance(s: GameState, seconds: number): void {
  const step = 3;
  for (let t = 0; t < seconds; t += step) update(s, step, noLog);
}

/** A built, water-connected Trading Post at the founding barn's own spot — reliably reachable by
 *  boat, the same trick every existing merchant/harbour test in the suite already relies on. */
function riverPost(s: GameState, extra?: Partial<Building>): Building {
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  const b = {
    id: s.nextId++, type: 'trading', x: barn.x, y: barn.y, built: true, progress: 99,
    workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {}, orders: {},
    ...extra,
  } as Building;
  s.buildings.push(b);
  return b;
}

/**
 * A spot near the founding barn where a Port (7×5) both `canPlace`s and has a berth reaching open
 * water — the same two-part check the real placement UI and the Playwright suite's own `raisePost`
 * helper make. Unlike the Trading Post (5×9), the Port's footprint doesn't reliably fit a small
 * map's river from the barn's own corner, hence the search rather than a fixed offset.
 */
function findPortSpot(s: GameState): { x: number; y: number; rot: number } | null {
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  const def = BUILDING_DEFS.port;
  for (let r = 3; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        for (const rot of [0, 1, 2, 3] as const) {
          const x = barn.x + dx;
          const y = barn.y + dy;
          if (!canPlace(s, 'port', x, y, def.w, def.h, rot, { ignoreTier: true }).ok) continue;
          if (!berthReachesOpenWater(s, { type: 'port', x, y, rot } as Building)) continue;
          return { x, y, rot };
        }
      }
    }
  }
  return null;
}

/**
 * A fresh state with a built, water-connected Port already standing. Tries a handful of seeds
 * derived from `seed` — the same "retry across generated worlds" pattern PLAYTEST.md's P1 and the
 * Playwright quarry/harbour specs already use — since not every map's river gives the Port's
 * larger footprint a fitting bank near the founding spot.
 */
function mkWithPort(seed: number, extra?: Partial<Building>): { s: GameState; post: Building } {
  for (let attempt = 0; attempt < 12; attempt++) {
    const s = mk(seed + attempt * 7919);
    // canPlace also checks affordability — a fresh village's starting stock is nowhere near a
    // Port's cost, and that would read as "no site found" here just as wrongly as an unreachable
    // river would. Stock the barn past any building's cost before searching.
    const barn = s.buildings.find((b) => b.type === 'barn')!;
    barn.store.wood = 5000;
    barn.store.stone = 5000;
    barn.store.iron = 5000;
    // Port tests run many simulated years on a lone citizen (see below) with nobody assigned to
    // cut firewood; a normal-difficulty start otherwise has none at all, and a winter without it
    // is a dead village a few turns in — which would silently truncate a "collect many visits"
    // loop at whatever turn population hit zero. A deep stockpile keeps the household larder fed
    // for the whole run without a woodcutter ever needing to be staffed.
    barn.store.firewood = 5000;
    const spot = findPortSpot(s);
    if (!spot) continue;
    const b = {
      id: s.nextId++, type: 'port', x: spot.x, y: spot.y, rot: spot.rot, built: true, progress: 99,
      workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {}, orders: {},
      ...extra,
    } as Building;
    s.buildings.push(b);
    return { s, post: b };
  }
  throw new Error(`no water-connected Port site found within 12 attempts from seed ${seed}`);
}

/**
 * Reset the merchant to an away, no-cooldown state so the next roll starts clean, and wave off
 * any nomad band — with `s.citizens` emptied for speed, a food "surplus" is trivially satisfied
 * and immigration would otherwise roll a band that then blocks every Port/river arrival until the
 * player answers it, which these tests never do.
 */
function clearMerchant(s: GameState): void {
  Object.assign(s.merchant, {
    phase: 'away', present: false, cooldownTimer: 0, category: null, viaPort: false,
    stock: {}, seedStock: [], boat: null,
  });
  s.pendingNomads = null;
}

/**
 * Collect `count` river (Trading Post) visits by rolling from a clean 'away' state each time and
 * waiting for the next arrival. No citizens (nobody to feed/haul) and a generous step keep this
 * fast; the arrival check alone is more than enough budget-wise given `MERCHANT_ARRIVAL_CHANCE`.
 */
function collectRiverVisits(s: GameState, count: number): { category: MerchantCategory; stock: Partial<Record<ResourceKind, number>>; seedStock: Crop[] }[] {
  const out: { category: MerchantCategory; stock: Partial<Record<ResourceKind, number>>; seedStock: Crop[] }[] = [];
  for (let i = 0; i < count; i++) {
    clearMerchant(s);
    for (let step = 0; step < 4000 && s.merchant.phase === 'away'; step++) advance(s, 3);
    assert.notEqual(s.merchant.phase, 'away', 'a river visit rolled in within budget');
    out.push({
      category: s.merchant.category!,
      stock: { ...s.merchant.stock },
      seedStock: [...s.merchant.seedStock],
    });
  }
  return out;
}

/**
 * Collect Port visits by pushing through `turns` season turnovers, clearing the merchant slot
 * before each so a lingering visit never blocks the next roll. Only turnovers that actually
 * produced a Port visit (`viaPort`) are returned.
 */
function collectPortVisits(s: GameState, turns: number): { category: MerchantCategory; stock: Partial<Record<ResourceKind, number>>; season: string }[] {
  const out: { category: MerchantCategory; stock: Partial<Record<ResourceKind, number>>; season: string }[] = [];
  for (let i = 0; i < turns; i++) {
    clearMerchant(s);
    // Start each turn from a known point in the season so one `advance` call crosses exactly one
    // boundary — otherwise a call that happened to start near the end of a season could cross two,
    // and the season label below would name the wrong one.
    s.seasonTimer = 0;
    advance(s, SEASON_LENGTH + 10);
    if (s.merchant.viaPort && s.merchant.category) {
      out.push({
        category: s.merchant.category,
        stock: { ...s.merchant.stock },
        season: SEASONS[(s.season + SEASONS.length - 1) % SEASONS.length], // the season that just turned
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Trading Post: randomized inventories, no dedicated Seed Merchant
// ---------------------------------------------------------------------------------------------

test('trading post: there is no dedicated Seed Merchant among the categories', () => {
  assert.deepEqual(MERCHANT_CATEGORIES, ['basics', 'animals', 'foods', 'goods']);
  assert.ok(!MERCHANT_CATEGORIES.includes('seeds' as unknown as MerchantCategory));
});

test('trading post: repeated river visits never roll a seed-only category', () => {
  const s = mk(101);
  riverPost(s);
  const visits = collectRiverVisits(s, 24);
  for (const v of visits) {
    assert.ok((['basics', 'animals', 'foods', 'goods'] as MerchantCategory[]).includes(v.category));
  }
});

test('trading post: Materials Merchant offers 2–5 distinct materials, at their exact table quantity', () => {
  const s = mk(102);
  riverPost(s);
  const visits = collectRiverVisits(s, 30).filter((v) => v.category === 'basics');
  assert.ok(visits.length > 0, 'sanity: at least one basics visit rolled in the sample');
  const [min, max] = MERCHANT_ITEM_COUNT.basics;
  for (const v of visits) {
    const kinds = Object.keys(v.stock) as ResourceKind[];
    assert.ok(kinds.length >= min && kinds.length <= max, `${kinds.length} items within [${min},${max}]`);
    for (const k of kinds) {
      assert.ok(k in MERCHANT_CATEGORY_STOCK.basics, `${k} is in the basics pool`);
      // River visits use the table figure exactly — no Port-style quantity variance.
      assert.equal(v.stock[k], MERCHANT_CATEGORY_STOCK.basics[k]);
    }
  }
});

test('trading post: Livestock Merchant offers 1–2 distinct livestock types', () => {
  const s = mk(103);
  riverPost(s);
  const visits = collectRiverVisits(s, 30).filter((v) => v.category === 'animals');
  assert.ok(visits.length > 0, 'sanity: at least one animals visit rolled in the sample');
  const [min, max] = MERCHANT_ITEM_COUNT.animals;
  for (const v of visits) {
    const kinds = Object.keys(v.stock) as ResourceKind[];
    assert.ok(kinds.length >= min && kinds.length <= max, `${kinds.length} items within [${min},${max}]`);
    for (const k of kinds) assert.ok((RANCH_ANIMALS as string[]).includes(k));
    // Never every animal at once — the whole point is a visit doesn't guarantee full choice.
    assert.ok(kinds.length < RANCH_ANIMALS.length);
  }
});

test('trading post: Goods Merchant offers 3–4 distinct goods, and leather is 30 (not 90) when it appears', () => {
  const s = mk(104);
  riverPost(s);
  const visits = collectRiverVisits(s, 40).filter((v) => v.category === 'goods');
  assert.ok(visits.length > 0, 'sanity: at least one goods visit rolled in the sample');
  const [min, max] = MERCHANT_ITEM_COUNT.goods;
  let sawLeather = false;
  for (const v of visits) {
    const kinds = Object.keys(v.stock) as ResourceKind[];
    assert.ok(kinds.length >= min && kinds.length <= max, `${kinds.length} items within [${min},${max}]`);
    if ('leather' in v.stock) {
      sawLeather = true;
      assert.equal(v.stock.leather, 30, 'leather is never guaranteed, but 30 when it shows up');
    }
  }
  assert.ok(sawLeather, 'sanity: leather showed up at least once across the sample');
  assert.equal(MERCHANT_CATEGORY_STOCK.goods.leather, 30);
});

test('trading post: Food Merchant offers 3–4 distinct foods, independent of its 1–2 seed offer', () => {
  const s = mk(105);
  riverPost(s);
  const visits = collectRiverVisits(s, 30).filter((v) => v.category === 'foods');
  assert.ok(visits.length > 0, 'sanity: at least one foods visit rolled in the sample');
  const [fmin, fmax] = MERCHANT_ITEM_COUNT.foods;
  const [smin, smax] = SEED_OFFER_COUNT;
  let sawOneSeed = false;
  let sawTwoSeeds = false;
  for (const v of visits) {
    const kinds = Object.keys(v.stock) as ResourceKind[];
    assert.ok(kinds.length >= fmin && kinds.length <= fmax, `${kinds.length} foods within [${fmin},${fmax}]`);
    for (const k of kinds) assert.ok(k in MERCHANT_CATEGORY_STOCK.foods);
    // The seed offer is independent — every food count should appear alongside every seed count.
    assert.ok(v.seedStock.length >= smin && v.seedStock.length <= smax);
    assert.equal(new Set(v.seedStock).size, v.seedStock.length, 'no duplicate seed in one offer');
    for (const c of v.seedStock) assert.ok(CROPS.includes(c));
    if (v.seedStock.length === 1) sawOneSeed = true;
    if (v.seedStock.length === 2) sawTwoSeeds = true;
  }
  assert.ok(sawOneSeed && sawTwoSeeds, 'both 1 and 2 seeds were offered across the sample');
});

test('trading post: a fast deterministic sanity check — pinning the roll produces a well-formed offer', () => {
  const s = mk(106);
  riverPost(s);
  // rand()=0 for the whole tick: the arrival check passes immediately (0 < anything positive),
  // and every subsequent roll inside spawnMerchant lands on index 0 of whatever remains — still a
  // structurally valid, duplicate-free offer, just a deterministic one.
  pinRandom(0);
  try {
    advance(s, 1);
  } finally {
    pinRandom(null);
  }
  assert.equal(s.merchant.category, 'basics');
  assert.equal(s.merchant.viaPort, false);
  const [min, max] = MERCHANT_ITEM_COUNT.basics;
  const kinds = Object.keys(s.merchant.stock);
  assert.ok(kinds.length >= min && kinds.length <= max);
});

// ---------------------------------------------------------------------------------------------
// Seeds: permanence, and the new price
// ---------------------------------------------------------------------------------------------

test('seeds: price is 2000 for every seed type, via the one flat SEED_COST', () => {
  assert.equal(SEED_COST, 2000);
});

test('seeds: buying one through the Food Merchant is a real 2000-value trade', () => {
  const s = mk(107);
  const post = riverPost(s, { store: { wood: 2100 } });
  Object.assign(s.merchant, {
    phase: 'docked', present: true, stayTimer: 600, priceMod: 1, category: 'foods', viaPort: false,
    stock: {}, seedStock: ['corn'], boat: { x: 0, y: 0 },
  });
  const short = basketTrade(s, { give: { wood: 1999 }, get: {}, buySeeds: ['corn'] });
  assert.equal(short.ok, false, 'under the 2000 value is refused');
  const paid = basketTrade(s, { give: { wood: 2000 }, get: {}, buySeeds: ['corn'] });
  assert.equal(paid.ok, true);
  assert.equal(s.seeds.includes('corn'), true, 'permanent unlock');
  assert.equal(post.store.wood, 100);
});

test('seeds: a purchased seed never reappears in a future Food Merchant offer', () => {
  const s = mk(108);
  riverPost(s);
  s.seeds = ['wheat', 'corn']; // pretend these were already bought
  const visits = collectRiverVisits(s, 30).filter((v) => v.category === 'foods');
  assert.ok(visits.length > 0);
  for (const v of visits) {
    assert.ok(!v.seedStock.includes('wheat'));
    assert.ok(!v.seedStock.includes('corn'));
  }
});

test('seeds: once every crop is purchased, the Food Merchant offers food but no seeds at all', () => {
  const s = mk(109);
  riverPost(s);
  s.seeds = [...CROPS];
  const visits = collectRiverVisits(s, 20).filter((v) => v.category === 'foods');
  assert.ok(visits.length > 0);
  for (const v of visits) {
    assert.equal(v.seedStock.length, 0);
    const [fmin, fmax] = MERCHANT_ITEM_COUNT.foods;
    const kinds = Object.keys(v.stock);
    assert.ok(kinds.length >= fmin && kinds.length <= fmax, 'the food side is untouched by an empty seed pool');
  }
});

// ---------------------------------------------------------------------------------------------
// Livestock: per-animal pricing
// ---------------------------------------------------------------------------------------------

test('livestock: chicken 400, pig 600, sheep 600, cow (cattle) 800', () => {
  assert.equal(TRADE_VALUE.chickens, 400);
  assert.equal(TRADE_VALUE.pigs, 600);
  assert.equal(TRADE_VALUE.sheep, 600);
  assert.equal(TRADE_VALUE.cattle, 800);
});

test('livestock: prices are per animal, not per shipment — three cows cost 3× a cow', () => {
  const s = mk(110);
  const post = riverPost(s, { store: { wood: 2400 } });
  Object.assign(s.merchant, {
    phase: 'docked', present: true, stayTimer: 600, priceMod: 1, category: 'animals', viaPort: false,
    stock: { cattle: 6 }, seedStock: [], boat: { x: 0, y: 0 },
  });
  const short = basketTrade(s, { give: { wood: 2399 }, get: { cattle: 3 }, buySeeds: [] });
  assert.equal(short.ok, false);
  const paid = basketTrade(s, { give: { wood: 2400 }, get: { cattle: 3 }, buySeeds: [] });
  assert.equal(paid.ok, true);
  assert.equal(post.store.cattle, 3);
});

// ---------------------------------------------------------------------------------------------
// Port: the expanded, randomized merchant pool
// ---------------------------------------------------------------------------------------------

test('port: the merchant pool is the four Trading Post categories plus the four specialised fleets', () => {
  assert.equal(PORT_MERCHANT_POOL.length, 8);
  for (const c of MERCHANT_CATEGORIES) assert.ok(PORT_MERCHANT_POOL.includes(c));
  for (const c of PORT_CATEGORIES) assert.ok(PORT_MERCHANT_POOL.includes(c));
});

test('port: a Trading Post category can call at the Port, tagged as a Port visit', () => {
  const { s } = mkWithPort(111);
  s.citizens = s.citizens.slice(0, 1); // endSeason (and so portSeason) skips entirely at pop 0
  const visits = collectPortVisits(s, 60);
  assert.ok(visits.length > 0, 'sanity: at least one Port visit rolled across the sample');
  const sawTradingPostStyle = visits.some((v) => (MERCHANT_CATEGORIES as MerchantCategory[]).includes(v.category));
  assert.ok(sawTradingPostStyle, 'a basics/animals/foods/goods visit showed up at the harbour');
  for (const v of visits) assert.ok(PORT_MERCHANT_POOL.includes(v.category));
});

test('port: seasons are drawn at random, not permanently bound to one category', () => {
  const { s } = mkWithPort(112);
  s.citizens = s.citizens.slice(0, 1); // endSeason (and so portSeason) skips entirely at pop 0
  const visits = collectPortVisits(s, 80);
  const bySeason = new Map<string, Set<MerchantCategory>>();
  for (const v of visits) {
    if (!bySeason.has(v.season)) bySeason.set(v.season, new Set());
    bySeason.get(v.season)!.add(v.category);
  }
  const varied = [...bySeason.values()].some((set) => set.size > 1);
  assert.ok(varied, 'at least one season saw more than one category across different years');
});

test('port: quantities vary within the configured band, not fixed to the table figure', () => {
  const { s } = mkWithPort(113);
  s.citizens = s.citizens.slice(0, 1); // endSeason (and so portSeason) skips entirely at pop 0
  const visits = collectPortVisits(s, 60);
  assert.ok(visits.length > 0);
  let sawVariance = false;
  for (const v of visits) {
    for (const [k, qty] of Object.entries(v.stock) as [ResourceKind, number][]) {
      const base = MERCHANT_CATEGORY_STOCK[v.category][k]!;
      const lo = Math.floor(base * (1 - PORT_QUANTITY_VARIANCE)) - 1; // rounding slack
      const hi = Math.ceil(base * (1 + PORT_QUANTITY_VARIANCE)) + 1;
      assert.ok(qty >= lo && qty <= hi, `${k} ${qty} within a ±${PORT_QUANTITY_VARIANCE * 100}% band of ${base}`);
      if (qty !== base) sawVariance = true;
    }
  }
  assert.ok(sawVariance, 'at least one item actually differed from its table figure across the sample');
});

// ---------------------------------------------------------------------------------------------
// Port: player-requested returns
// ---------------------------------------------------------------------------------------------

function dockPortMerchant(s: GameState, category: MerchantCategory): void {
  Object.assign(s.merchant, {
    phase: 'docked', present: true, stayTimer: 600, priceMod: 1, category, viaPort: true,
    stock: {}, seedStock: [], boat: { x: 0, y: 0 },
  });
}

test('port requests: a docked Port merchant can be asked to return next year, in a chosen season', () => {
  const { s } = mkWithPort(114);
  dockPortMerchant(s, 'portluxury');
  const r = requestMerchantReturn(s, 'Spring');
  assert.equal(r.ok, true);
  assert.equal(s.portRequests?.length, 1);
  assert.deepEqual(s.portRequests?.[0], { category: 'portluxury', season: 'Spring', year: s.year + 1 });
});

test('port requests: a river-style category can be requested too — any Port visit qualifies', () => {
  const { s } = mkWithPort(115);
  dockPortMerchant(s, 'foods');
  const r = requestMerchantReturn(s, 'Winter');
  assert.equal(r.ok, true);
  assert.equal(s.portRequests?.[0].category, 'foods');
});

test('port requests: refused with no Port merchant docked (away, or a river trader at the post)', () => {
  const { s } = mkWithPort(116);
  clearMerchant(s);
  assert.equal(requestMerchantReturn(s, 'Spring').ok, false);
  Object.assign(s.merchant, { phase: 'docked', present: true, category: 'basics', viaPort: false, stock: {}, seedStock: [], boat: { x: 0, y: 0 } });
  assert.equal(requestMerchantReturn(s, 'Spring').ok, false, 'a river trader is not a Port merchant');
});

test(`port requests: at most ${PORT_REQUEST_MAX} may stand at once`, () => {
  const { s } = mkWithPort(117);
  dockPortMerchant(s, 'portindustrial');
  assert.equal(requestMerchantReturn(s, 'Spring').ok, true);
  assert.equal(requestMerchantReturn(s, 'Summer').ok, true);
  assert.equal(s.portRequests?.length, PORT_REQUEST_MAX);
  const third = requestMerchantReturn(s, 'Autumn');
  assert.equal(third.ok, false);
  assert.equal(s.portRequests?.length, PORT_REQUEST_MAX, 'the third request never lands');
});

test('port requests: the same season cannot be double-booked for the same target year', () => {
  const { s } = mkWithPort(118);
  dockPortMerchant(s, 'portgrain');
  assert.equal(requestMerchantReturn(s, 'Spring').ok, true);
  const dup = requestMerchantReturn(s, 'Spring');
  assert.equal(dup.ok, false);
  assert.equal(s.portRequests?.length, 1);
});

test('port requests: a due request is fulfilled exactly, guaranteed, and then frees its slot', () => {
  const { s } = mkWithPort(119);
  s.citizens = s.citizens.slice(0, 1); // endSeason (and so portSeason) skips entirely at pop 0
  const nextIdx = (s.season + 1) % SEASONS.length;
  const nextYear = nextIdx === 0 ? s.year + 1 : s.year;
  s.portRequests = [{ category: 'portluxury', season: SEASONS[nextIdx], year: nextYear }];
  clearMerchant(s);
  advance(s, SEASON_LENGTH + 10);
  assert.equal(s.merchant.category, 'portluxury', 'the requested category arrived, not a random roll');
  assert.equal(s.merchant.viaPort, true);
  assert.equal(s.portRequests?.length, 0, 'the fulfilled request freed its slot');
});

test('port requests: an unrequested season keeps rolling at random — a request never crowds out the others', () => {
  const { s } = mkWithPort(120);
  s.citizens = s.citizens.slice(0, 1); // endSeason (and so portSeason) skips entirely at pop 0
  // Reserve one season two years out — well past the short sample below, so it can never come due
  // and the "untouched" assertion at the end can't be a race against its own fulfilment.
  const farIdx = (s.season + 2) % SEASONS.length;
  const farYear = s.year + 2;
  s.portRequests = [{ category: 'portluxury', season: SEASONS[farIdx], year: farYear }];
  const visits = collectPortVisits(s, 6); // 1.5 years — short of the 2-year-out reservation
  const categories = new Set(visits.map((v) => v.category));
  assert.ok(categories.size > 1 || visits.length <= 1, 'the un-reserved seasons still show real variety');
  assert.equal(s.portRequests?.length, 1, 'the standing request is untouched by ordinary random turns');
});

// ---------------------------------------------------------------------------------------------
// Save compatibility
// ---------------------------------------------------------------------------------------------

function installFakeLocalStorage(): void {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() { return data.size; },
  } as Storage;
}

test('save/load: purchased seeds and livestock survive a round trip, and are not recreated', () => {
  installFakeLocalStorage();
  const s = mk(121);
  s.seeds = ['wheat', 'corn'];
  const ranch = { id: s.nextId++, type: 'ranch', x: s.origin.x, y: s.origin.y, built: true,
    progress: 99, workers: [], desiredWorkers: 0, growth: 0, store: {}, animal: 'cattle',
    animals: 5, breedProgress: 0.3 } as unknown as Building;
  s.buildings.push(ranch);
  assert.ok(saveGame(s, 5));
  const loaded = loadGame(5);
  assert.ok(loaded);
  assert.deepEqual([...loaded!.seeds].sort(), ['corn', 'wheat']);
  const loadedRanch = loaded!.buildings.find((b) => b.type === 'ranch')!;
  assert.equal(loadedRanch.animals, 5);
  assert.equal(loadedRanch.breedProgress, 0.3);
  // Rolling the Food Merchant against the reloaded state must still respect the unlocked seeds.
  riverPost(loaded!);
  const visits = collectRiverVisits(loaded!, 15).filter((v) => v.category === 'foods');
  for (const v of visits) {
    assert.ok(!v.seedStock.includes('wheat'));
    assert.ok(!v.seedStock.includes('corn'));
  }
});

test('save/load: a pre-redesign (v14) save with a docked Seed Merchant migrates to a clean, awaysafe state', () => {
  installFakeLocalStorage();
  const s = mk(122);
  assert.ok(saveGame(s, 6), 'write a current save to seed the raw envelope from');
  const raw = rawSlot(6);
  assert.ok(raw);
  const env = JSON.parse(raw!) as { v: number; state: GameState };
  env.v = 14;
  (env.state.merchant as unknown as Record<string, unknown>) = {
    phase: 'docked', present: true, stayTimer: 300, cooldownTimer: 0, priceMod: 1,
    category: 'seeds', stock: {}, seedStock: ['corn', 'wheat'], boat: { x: 1, y: 1 },
  };
  delete (env.state as Partial<GameState>).portRequests;
  writeRawSlot(6, JSON.stringify(env));

  const loaded = loadGame(6);
  assert.ok(loaded);
  assert.equal(loaded!.merchant.phase, 'away', 'the old seed-merchant visit is not carried over');
  assert.equal(loaded!.merchant.category, null);
  assert.equal(loaded!.merchant.seedStock.length, 0);
  assert.deepEqual(loaded!.portRequests, [], 'a save with no request history defaults to none');
});

test('save/load: a pre-redesign save with an in-flight Port fleet keeps sailing to the Port, not the post', () => {
  installFakeLocalStorage();
  const s = mk(123);
  assert.ok(saveGame(s, 9));
  const raw = rawSlot(9);
  const env = JSON.parse(raw!) as { v: number; state: GameState };
  env.v = 14;
  (env.state.merchant as unknown as Record<string, unknown>) = {
    phase: 'arriving', present: false, stayTimer: 0, cooldownTimer: 0, priceMod: 1,
    category: 'portindustrial', stock: { iron: 240 }, seedStock: [], boat: { x: 2, y: 2 },
  };
  delete (env.state as Partial<GameState>).portRequests;
  writeRawSlot(9, JSON.stringify(env));

  const loaded = loadGame(9);
  assert.ok(loaded);
  assert.equal(loaded!.merchant.category, 'portindustrial', 'an in-flight fleet is not reset, only tagged');
  assert.equal(loaded!.merchant.viaPort, true, 'its old category correctly implies the Port venue');
  assert.deepEqual(loaded!.portRequests, []);
});
