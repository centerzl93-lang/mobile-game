import { test, expect, Page } from '@playwright/test';

// Famine (summer-only, farm output) and Flood (spring-only, water-proximity building damage) —
// the two disasters added alongside the existing Fire and Sickness. See CLAUDE.md for the design
// notes; these tests exercise the same `window.__village` debug hook the rest of the suite does.

async function open2d(page: Page): Promise<void> {
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

// A fixed seed so a same-seed A/B comparison (famine on vs off, flood on vs off) walks the exact
// same map and, since triggering either disaster by hand consumes no random draws of its own, the
// exact same RNG stream — any divergence in the outcome can only be the disaster's own effect.
const SEED = 20260824;

// Places a workplace by searching out from the barn for the first buildable tile (any rotation),
// then forces it straight to `built` so a test isn't also paying to wait out construction it isn't
// testing. Same shortcut `tests/newgame.spec.ts` uses for its fire-recovery specs.
const placeBuilt = `(g, type) => {
  const s = g.state;
  const barn = s.buildings.find((b) => b.type === 'barn');
  for (let r = 3; r < 30; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        for (let rot = 0; rot < 4; rot++) {
          if (!g.debugCanPlace(type, barn.x + dx, barn.y + dy, rot).ok) continue;
          const id = g.debugPlace(type, barn.x + dx, barn.y + dy, rot);
          if (id == null) continue;
          const b = s.buildings.find((o) => o.id === id);
          b.built = true;
          b.progress = g.debugBuildWork(type);
          return b;
        }
  throw new Error('no buildable site found for ' + type);
}`;

// A tight-radius variant of `placeBuilt`, for a *second* building that has to stay walkably
// reachable from the first (a spare barn a builder can actually shuttle materials from/to). The
// wide search above is happy to wander a village's whole map — fine when only one building's
// terrain matters, wrong the moment two of them have to be on the same side of a river.
const placeBuiltNearby = `(g, type) => {
  const s = g.state;
  const barn = s.buildings.find((b) => b.type === 'barn');
  for (let r = 3; r < 18; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        for (let rot = 0; rot < 4; rot++) {
          if (!g.debugCanPlace(type, barn.x + dx, barn.y + dy, rot).ok) continue;
          const id = g.debugPlace(type, barn.x + dx, barn.y + dy, rot);
          if (id == null) continue;
          const b = s.buildings.find((o) => o.id === id);
          b.built = true;
          b.progress = g.debugBuildWork(type);
          return b;
        }
  throw new Error('no nearby buildable site found for ' + type);
}`;

// Synthetic built field at the barn's spot, staffed so it harvests, with a preset growth — the
// same shortcut `tests/newgame.spec.ts`'s farm block uses (harvest is realised in `endSeason`
// without the worker needing to actually walk anywhere, so overlapping the barn's own tile is
// harmless here).
const mkFarm = `(crop, growth, w, h, workerIdx) => {
  const g = window.__village;
  const s = g.state;
  const barn = s.buildings.find((b) => b.type === 'barn');
  const f = { id: s.nextId++, type: 'farm', x: barn.x, y: barn.y, built: true, progress: 99,
    workers: [s.citizens[workerIdx].id], desiredWorkers: 1, growth, output: 'coal', recipe: 'iron',
    store: {}, crop, w, h };
  s.citizens[workerIdx].jobId = f.id;
  s.buildings.push(f);
  return f.id;
}`;

// A synthetic ranch with a breeding pair — herd growth is decided in `endSeason` off `animals`
// alone, with no terrain dependency, so this is a clean way to check famine leaves ranching alone.
const mkRanch = `(animals, w, h) => {
  const s = window.__village.state;
  const barn = s.buildings.find((b) => b.type === 'barn');
  const r = { id: s.nextId++, type: 'ranch', x: barn.x, y: barn.y, built: true, progress: 99,
    workers: [], desiredWorkers: 0, growth: 0, output: 'iron', recipe: 'iron', store: {},
    animals, w, h, breedProgress: 0 };
  s.buildings.push(r);
  return r.id;
}`;

// The first water tile on the map, scanning row-major.
const findWaterTile = `(s) => {
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++)
      if (s.tiles[y * s.w + x].type === 'water') return { x, y };
  throw new Error('no water tile on this map');
}`;

// A tile with no water at all within `radius` of it — genuinely out of a flood's reach, not just
// luckily unpicked. Sampled on a coarse grid rather than every tile, which is plenty on a 72×72 map.
const findFarTile = `(s, radius) => {
  for (let cy = 2; cy < s.h - 2; cy += 3) {
    for (let cx = 2; cx < s.w - 2; cx += 3) {
      let wet = false;
      for (let dy = -radius; dy <= radius && !wet; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
          if (s.tiles[y * s.w + x].type === 'water') { wet = true; break; }
        }
      }
      if (!wet) return { x: cx, y: cy };
    }
  }
  throw new Error('no tile far enough from water on this map');
}`;

test.describe('famine — summer-only farm shortfall', () => {
  test('famine can only trigger entering Summer, never Spring, Autumn or Winter', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true, undefined, 20260824);
      const s = g.state;
      const results: Record<number, boolean> = {};
      // Pinned low: guarantees the chance roll passes (and the following severity roll lands on
      // 'severe') whenever the season gate itself lets `famineSeason` past it.
      g.debugPinRandom(0.0);
      try {
        for (const season of [0, 1, 2, 3]) {
          s.famine = undefined;
          s.season = season;
          g.debugFamineSeason();
          results[season] = !!s.famine;
        }
      } finally {
        g.debugPinRandom(null);
      }
      return results;
    });
    expect(out[0], 'Spring').toBe(false);
    expect(out[1], 'Summer').toBe(true);
    expect(out[2], 'Autumn').toBe(false);
    expect(out[3], 'Winter').toBe(false);
  });

  test('a famine halves or quarters that year\'s harvest, then clears — next year is back to normal', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      const run = (severity: 'moderate' | 'severe' | null) => {
        // No seed needed — a synthetic field at the barn's own tile, no terrain involved.
        g.startNewGame('small', 'easy', false);
        const s = g.state;
        s.seeds = ['wheat'];
        const id = eval(mk)('wheat', 1, 4, 4, 0);
        if (severity) g.debugTriggerFamine(severity);
        const factor = g.debugFamineCropFactor();
        s.season = 1; // Summer → next endSeason enters Autumn and harvests
        g.debugEndSeason();
        const f = s.buildings.find((b: any) => b.id === id);
        const firstYield = f.store.grain ?? 0;
        const famineClearedAfter = !s.famine;
        // A second harvest, same field, no new famine (disasters are off) — recovery is automatic.
        f.store.grain = 0;
        f.growth = 1;
        s.season = 1;
        g.debugEndSeason();
        const secondYield = f.store.grain ?? 0;
        return {
          factor, firstYield, famineClearedAfter, secondYield,
          built: f.built, damaged: !!f.damaged, razed: !!f.razed,
        };
      };
      const base = run(null);
      const moderate = run('moderate');
      const severe = run('severe');
      return { base, moderate, severe };
    }, mkFarm);
    expect(out.base.factor).toBe(1);
    expect(out.base.firstYield).toBeGreaterThan(0);
    expect(out.moderate.factor).toBeCloseTo(0.5, 5);
    expect(out.severe.factor).toBeCloseTo(0.25, 5);
    expect(out.moderate.firstYield).toBeCloseTo(out.base.firstYield * 0.5, 5);
    expect(out.severe.firstYield).toBeCloseTo(out.base.firstYield * 0.25, 5);
    // The field itself is untouched — famine never destroys a farm.
    for (const r of [out.moderate, out.severe]) {
      expect(r.built).toBe(true);
      expect(r.damaged).toBe(false);
      expect(r.razed).toBe(false);
    }
    // Recovery is automatic: the flag clears itself the moment the harvest it threatened lands,
    // and the very next harvest comes in at the full, unpenalised amount.
    expect(out.moderate.famineClearedAfter).toBe(true);
    expect(out.severe.famineClearedAfter).toBe(true);
    expect(out.moderate.secondYield).toBeCloseTo(out.base.firstYield, 5);
    expect(out.severe.secondYield).toBeCloseTo(out.base.firstYield, 5);
  });

  test('famine does not touch fishing, hunting or gathering output', async ({ page }) => {
    test.slow();
    await open2d(page);
    const out = await page.evaluate(
      ([placeSrc, seed]) => {
        const g = (window as any).__village;
        const run = (famine: boolean) => {
          g.startNewGame('small', 'easy', false, undefined, seed);
          const s = g.state;
          for (const type of ['gatherer', 'fishing', 'hunting']) {
            const b = eval(placeSrc)(g, type);
            b.desiredWorkers = b.desiredWorkers ?? 3;
          }
          if (famine) g.debugTriggerFamine('severe');
          g.debugAdvance(300);
          return {
            fruit: g.debugTotalHeld('fruit'),
            fish: g.debugTotalHeld('fish'),
            venison: g.debugTotalHeld('venison'),
            leather: g.debugTotalHeld('leather'),
          };
        };
        const base = run(false);
        const withFamine = run(true);
        return { base, withFamine };
      },
      [placeBuilt, SEED] as const,
    );
    // Sanity: the setup actually produced something, so an exact match below is proving
    // equivalence, not two runs that both did nothing.
    expect(out.base.fruit + out.base.fish + out.base.venison).toBeGreaterThan(0);
    expect(out.withFamine).toEqual(out.base);
  });

  test('famine does not touch ranch breeding', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(
      ([mk, seed]) => {
        const g = (window as any).__village;
        const run = (famine: boolean) => {
          g.startNewGame('small', 'easy', false, undefined, seed);
          const id = eval(mk)(4, 4, 4);
          if (famine) g.debugTriggerFamine('severe');
          g.debugEndSeason();
          g.debugEndSeason();
          return g.state.buildings.find((b: any) => b.id === id).animals;
        };
        return { base: run(false), withFamine: run(true) };
      },
      [mkRanch, SEED] as const,
    );
    expect(out.withFamine).toBe(out.base);
  });

  test('famine never touches consumption or existing food reserves directly', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((seed) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, undefined, seed);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      const before = { ...barn.store };
      g.debugTriggerFamine('severe');
      // No farm exists in this village at all — if famine touched anything but a farm's harvest,
      // this would be the first place it would show up: the barn's stock changing for no reason.
      return { before, after: { ...barn.store } };
    }, SEED);
    expect(out.after).toEqual(out.before);
  });

  test('famine notifications name the disaster and, on harvest, name the effect', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      // No seed needed here either — same reasoning as the harvest test above.
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      s.seeds = ['wheat'];
      eval(mk)('wheat', 1, 4, 4, 0);
      g.debugTriggerFamine('moderate');
      const warned = (s.events ?? []).some((e: any) => /poor crops|difficult harvest/i.test(e.text));
      s.season = 1;
      g.debugEndSeason();
      const reported = (s.events ?? []).some((e: any) => /reduced farm production/i.test(e.text));
      return { warned, reported };
    }, mkFarm);
    expect(out.warned).toBe(true);
    expect(out.reported).toBe(true);
  });
});

test.describe('flood — spring-only, water-proximity building damage', () => {
  test('flood risk rises the closer a building sits to water, and drops to none past the radius', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(
      ([placeSrc, waterSrc, farSrc, seed]) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', false, undefined, seed);
        const s = g.state;
        const water = eval(waterSrc)(s);
        const radius = g.debugFloodRiskRadius();
        const far = eval(farSrc)(s, radius + 2);
        const atWater = eval(placeSrc)(g, 'house');
        atWater.x = water.x;
        atWater.y = water.y - 1 >= 0 ? water.y - 1 : water.y; // hugging the water's edge
        const farHouse = eval(placeSrc)(g, 'house');
        farHouse.x = far.x;
        farHouse.y = far.y;
        return {
          near: g.debugFloodRisk(atWater.id),
          far: g.debugFloodRisk(farHouse.id),
          radius,
        };
      },
      [placeBuilt, findWaterTile, findFarTile, SEED] as const,
    );
    expect(out.near.dist).toBeLessThanOrEqual(out.radius);
    expect(out.near.tier).not.toBeNull();
    expect(out.far.dist).toBeGreaterThan(out.radius);
    expect(out.far.tier).toBeNull();
  });

  test('flood can only trigger entering Spring, never Summer, Autumn or Winter', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(
      ([placeSrc, waterSrc, seed]) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', true, undefined, seed);
        const s = g.state;
        const water = eval(waterSrc)(s);
        const results: Record<number, boolean> = {};
        for (const season of [0, 1, 2, 3]) {
          g.startNewGame('small', 'easy', true, undefined, seed);
          const st = g.state;
          const b = eval(placeSrc)(g, 'house');
          b.x = water.x;
          b.y = Math.max(0, water.y - 1);
          st.season = season;
          g.debugPinRandom(0.0); // guarantees both the flood roll and every per-building roll
          try {
            g.debugFloodSeason();
          } finally {
            g.debugPinRandom(null);
          }
          results[season] = !!b.damaged;
        }
        return results;
      },
      [placeBuilt, findWaterTile, SEED] as const,
    );
    expect(out[0], 'Spring').toBe(true);
    expect(out[1], 'Summer').toBe(false);
    expect(out[2], 'Autumn').toBe(false);
    expect(out[3], 'Winter').toBe(false);
  });

  test('a flood can damage several riverside buildings at once while leaving distant ones alone', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(
      ([placeSrc, waterSrc, farSrc, seed]) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', true, undefined, seed);
        const s = g.state;
        const water = eval(waterSrc)(s);
        const radius = g.debugFloodRiskRadius();
        const riverside: any[] = [];
        for (let i = 0; i < 4; i++) {
          const b = eval(placeSrc)(g, 'house');
          b.x = water.x;
          b.y = Math.max(0, water.y - 1 - i); // a short row stepping back from the water
          riverside.push(b);
        }
        const far = eval(farSrc)(s, radius + 2);
        const distant = eval(placeSrc)(g, 'house');
        distant.x = far.x;
        distant.y = far.y;
        s.season = 0; // Spring
        g.debugPinRandom(0.0); // every roll (flood-at-all, and every per-building chance) succeeds
        try {
          g.debugFloodSeason();
        } finally {
          g.debugPinRandom(null);
        }
        return {
          damagedRiverside: riverside.filter((b) => b.damaged).length,
          distantDamaged: !!distant.damaged,
        };
      },
      [placeBuilt, findWaterTile, findFarTile, SEED] as const,
    );
    expect(out.damagedRiverside).toBeGreaterThan(1);
    expect(out.distantDamaged).toBe(false);
  });

  test('a flooded workplace stops producing and frees its workers; a flooded home evicts its residents', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(([placeSrc, seed]) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, undefined, seed);
      const s = g.state;
      const hut = eval(placeSrc)(g, 'gatherer');
      hut.desiredWorkers = 3;
      const house = s.buildings.find((b: any) => b.type === 'house' && b.built);
      g.debugAdvance(3); // long enough for assignHomesAndJobs to hire and house everyone it can
      const before = {
        staffed: hut.workers.length,
        resident: s.citizens.find((c: any) => c.homeId === house.id)?.id ?? null,
      };
      g.debugFloodDamage(hut.id);
      g.debugFloodDamage(house.id);
      const evictedWorkerIds = s.citizens.filter((c: any) => c.jobId === hut.id).map((c: any) => c.id);
      const evictedResidentIds = s.citizens.filter((c: any) => c.homeId === house.id).map((c: any) => c.id);
      // Give the sim a beat: nobody should drift back into either building while it's damaged.
      // No builders on hand — this test is about occupancy while damaged, not repair, and a fast
      // repair (small houses/huts cost little) could otherwise complete inside those few seconds.
      g.debugSetBuilders(0);
      g.debugAdvance(5);
      return {
        before,
        hutDamaged: !!hut.damaged,
        hutReason: hut.damageReason,
        houseDamaged: !!house.damaged,
        houseReason: house.damageReason,
        workersNow: hut.workers.length,
        evictedWorkerIds,
        evictedResidentIds,
        residentsNow: s.citizens.filter((c: any) => c.homeId === house.id).length,
        // The evicted resident is still a citizen of the village — homeless, not dead.
        formerResidentStillAlive: before.resident == null || s.citizens.some((c: any) => c.id === before.resident),
        hutStillStanding: hut.built && s.buildings.includes(hut),
        houseStillStanding: house.built && s.buildings.includes(house),
      };
    }, [placeBuilt, SEED] as const);
    expect(out.before.staffed).toBeGreaterThan(0);
    expect(out.hutDamaged).toBe(true);
    expect(out.hutReason).toBe('flood');
    expect(out.houseDamaged).toBe(true);
    expect(out.houseReason).toBe('flood');
    expect(out.workersNow).toBe(0);
    expect(out.evictedWorkerIds.length).toBe(0);
    expect(out.evictedResidentIds.length).toBe(0);
    expect(out.residentsNow).toBe(0);
    expect(out.formerResidentStillAlive).toBe(true);
    expect(out.hutStillStanding).toBe(true);
    expect(out.houseStillStanding).toBe(true);
  });

  test('a damaged barn keeps its stock — inaccessible while damaged, exactly restored on repair, never duplicated', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(([placeSrc, seed]) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, undefined, seed);
      const s = g.state;
      // A second barn so the village can keep functioning (larder shopping, consumption) while the
      // first sits damaged — otherwise there'd be nowhere for anything to be accessible *from*.
      // Placed close by (not the wide search the other tests use), and checked for a walkable
      // route back to the first — this test is about repair, not pathfinding across a river, so a
      // spare that landed across one (rare, but the map's own layout decides that, not this test)
      // is discarded and another tried.
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      let spare: any = null;
      // `debugApproach`'s second/third args are where a citizen is coming *from* — passing each
      // building's own corner (rather than the other building's position) can pick the door on
      // the far side, wrongly reading a barn as unreachable from its own near neighbour. Asking
      // each building for its approach from the *other* one is what a real haul actually walks —
      // and it's the same door a courier bound for `spare` would use, so it's also where the
      // citizens are teleported to below, rather than recomputing a (possibly different) approach
      // from the barn's own corner.
      let barnApproach: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 6 && !spare; attempt++) {
        const candidate = eval(placeSrc)(g, 'barn');
        const a = g.debugApproach(barn.id, candidate.x, candidate.y);
        const b = g.debugApproach(candidate.id, barn.x, barn.y);
        if (g.debugReachable(a.x, a.y, Math.floor(b.x), Math.floor(b.y))) {
          spare = candidate;
          barnApproach = a;
        }
      }
      if (!spare || !barnApproach) throw new Error('could not place a reachable spare barn');
      barn.store.wood = 400;
      barn.store.stone = 150;
      // The village's actual food (seeded onto the founding barn by `startNewGame`) has to stay
      // reachable somewhere, or damaging the barn holding it starves the whole population before
      // the repair this test is about ever gets a chance to run — a real and correct consequence
      // of a flood on a village with only one barn, just not the thing this particular test checks.
      for (const k of ['fruit', 'grain', 'fish', 'beef']) {
        spare.store[k] = barn.store[k] ?? 0;
        delete barn.store[k];
      }
      const before = { ...barn.store };
      const totalBefore = g.debugTotalHeld('wood');
      g.debugFloodDamage(barn.id);
      const totalRightAfter = g.debugTotalHeld('wood'); // still counted — nothing vanished
      // Inaccessible while damaged: a delivery meant for this barn cannot land in it.
      const before2 = g.debugTotalStored('stone');
      g.debugSetBuilders(4);
      g.debugAdvance(30);
      const stoneUnchanged = barn.store.stone === before.stone;
      g.debugSetBuilders(0);
      // Repair it, then confirm the same stock is sitting there — not doubled, not gone. `spare`
      // is stocked with exactly twice the repair bill so the builders have somewhere to fetch it
      // from; only the bill itself should ever leave `spare`'s shelves.
      const repairCost = g.debugRepairCost(barn.id);
      const spareBefore: Record<string, number> = { ...spare.store };
      for (const [k, amt] of Object.entries(repairCost)) {
        spare.store[k as any] = ((spare.store[k as any] as number) ?? 0) + (amt as number) * 2;
      }
      g.debugSetBuilders(4);
      // Stand everyone at the damaged barn's door on the `spare`-facing side (`barnApproach`,
      // established above) — the point being tested is whether repair works at all, not how far
      // the village's founding houses happened to scatter (same reasoning as the fire-recovery
      // specs in `newgame.spec.ts`).
      for (const c of s.citizens) {
        c.x = barnApproach.x;
        c.y = barnApproach.y;
      }
      let repaired = false;
      for (let i = 0; i < 4000 && !repaired; i++) {
        g.debugAdvance(0.2);
        repaired = !barn.damaged;
      }
      // Exactly the bill, taken from `spare` — not more (over-fetched), not less (a partial
      // repair that still finished), not left untouched (nothing paid at all).
      const spareSpent: Record<string, number> = {};
      for (const k of Object.keys(repairCost)) {
        spareSpent[k] = (spareBefore[k] ?? 0) + (repairCost as Record<string, number>)[k] * 2 - (spare.store[k] ?? 0);
      }
      return {
        totalBefore, totalRightAfter, stoneUnchanged, repaired, repairCost, spareSpent,
        storeAfterRepair: { wood: barn.store.wood, stone: barn.store.stone },
      };
    }, [placeBuiltNearby, SEED] as const);
    expect(out.totalRightAfter).toBe(out.totalBefore); // damage never deletes what was already stored
    expect(out.stoneUnchanged).toBe(true); // nor does it accept new deliveries while damaged
    expect(out.repaired).toBe(true);
    expect(out.storeAfterRepair.wood).toBe(400); // exactly what was there — not doubled, not gone
    expect(out.storeAfterRepair.stone).toBe(150);
    for (const k of Object.keys(out.repairCost)) {
      expect(out.spareSpent[k], k).toBe((out.repairCost as Record<string, number>)[k]);
    }
  });

  test('repairing flood damage costs a fraction of the build, and the building resumes on its own', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(([placeSrc, seed]) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, undefined, seed);
      const s = g.state;
      const hut = eval(placeSrc)(g, 'gatherer');
      hut.desiredWorkers = 3;
      g.debugAdvance(3);
      const staffedBefore = hut.workers.length;
      const buildCost = g.debugCost('gatherer');
      const repairCost = g.debugRepairCost(hut.id);
      g.debugFloodDamage(hut.id);
      g.debugSetBuilders(6);
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      for (const [k, amt] of Object.entries(repairCost)) {
        barn.store[k as any] = ((barn.store[k as any] as number) ?? 0) + (amt as number) * 2;
      }
      // Stand everyone at the hut — see the same note in the barn-repair test above.
      const spot = g.debugApproach(hut.id, hut.x, hut.y);
      for (const c of s.citizens) {
        c.x = spot.x;
        c.y = spot.y;
      }
      let repaired = false;
      for (let i = 0; i < 4000 && !repaired; i++) {
        g.debugAdvance(0.2);
        repaired = !hut.damaged;
      }
      const staffed = { count: 0 };
      for (let i = 0; i < 100 && staffed.count === 0; i++) {
        g.debugAdvance(0.2);
        staffed.count = hut.workers.length;
      }
      return {
        staffedBefore, buildCost, repairCost, repaired,
        stillBuilt: hut.built,
        damageReasonCleared: hut.damageReason === undefined,
        restaffed: staffed.count,
      };
    }, [placeBuilt, SEED] as const);
    expect(out.staffedBefore).toBeGreaterThan(0);
    expect(out.repaired).toBe(true);
    expect(out.stillBuilt).toBe(true);
    expect(out.damageReasonCleared).toBe(true);
    expect(out.restaffed).toBeGreaterThan(0);
    // 25–50% of the original build, per resource.
    for (const k of Object.keys(out.buildCost)) {
      const ratio = out.repairCost[k] / out.buildCost[k];
      expect(ratio, k).toBeGreaterThanOrEqual(0.24);
      expect(ratio, k).toBeLessThanOrEqual(0.5);
    }
  });

  test('flood does not destroy buildings outright — DAMAGED, never razed', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(([placeSrc, seed]) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, undefined, seed);
      const hut = eval(placeSrc)(g, 'gatherer');
      g.debugFloodDamage(hut.id);
      return { built: hut.built, razed: !!hut.razed, present: (window as any).__village.state.buildings.includes(hut) };
    }, [placeBuilt, SEED] as const);
    expect(out.built).toBe(true);
    expect(out.razed).toBe(false);
    expect(out.present).toBe(true);
  });

  test('flood notifications name the disaster and the damage', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(([placeSrc, seed]) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, undefined, seed);
      const s = g.state;
      const hut = eval(placeSrc)(g, 'gatherer');
      g.debugFloodDamage(hut.id);
      const named = (s.events ?? []).some((e: any) => /flood/i.test(e.text));
      return { named };
    }, [placeBuilt, SEED] as const);
    expect(out.named).toBe(true);
  });
});

test.describe('existing disaster mechanics keep working alongside famine and flood', () => {
  test('fire still ignites, damages and repairs the same way', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(([placeSrc, seed]) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, undefined, seed);
      const hut = eval(placeSrc)(g, 'gatherer');
      g.debugIgnite(hut.id);
      const burning = !!hut.fireTimer;
      // A doused fire, forced directly — this test is a sanity check that fire's own machinery
      // still runs after the flood/famine changes, not a re-test of the bucket brigade itself
      // (`tests/newgame.spec.ts` already covers that in depth).
      hut.fireWater = g.debugFireDouseTripsNeeded();
      g.debugPinRandom(0.99); // survive as damaged
      try {
        g.debugAdvance(g.debugFireBurnSeconds() + 1);
      } finally {
        g.debugPinRandom(null);
      }
      return { burning, damaged: hut.damaged, reason: hut.damageReason, built: hut.built };
    }, [placeBuilt, SEED] as const);
    expect(out.burning).toBe(true);
    expect(out.damaged).toBe(true);
    expect(out.reason).toBe('fire');
    expect(out.built).toBe(true);
  });

  test('sickness recovery still runs — the disease pipeline was not disturbed', async ({ page }) => {
    // A sanity check, not a re-test of the outbreak roll itself (`tests/newgame.spec.ts` already
    // covers that): a citizen made sick directly still gets a recovery roll, and medicine/hospital
    // treatment still applies, at the same season turn famine and flood now also run on.
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true, undefined, 20260824);
      const s = g.state;
      const c = s.citizens[0];
      c.sick = true;
      c.health = 50;
      g.debugPinRandom(0.0); // guarantees the recovery roll succeeds
      try {
        g.debugEndSeason();
      } finally {
        g.debugPinRandom(null);
      }
      return { recovered: !c.sick, healthRose: c.health > 50 };
    });
    expect(out.recovered).toBe(true);
    expect(out.healthRose).toBe(true);
  });
});
