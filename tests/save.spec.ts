import { test, expect, Page } from '@playwright/test';

/**
 * Save/load reliability. Everything is driven through the real app and `window.__village`, using the
 * debug hooks that round-trip the village through `localStorage` the same way autosave and Continue
 * do (`debugSaveSlot`, `debugLoadSlot`) plus the raw-slot accessors that let a test downgrade a real
 * save to an older format and load it back through the migration path (`debugRawSlot`,
 * `debugWriteRawSlot`).
 *
 * The six cases the plan calls for: a new save; a save/load round-trip; autosave (its cadence and,
 * more importantly, that it refuses to overwrite a good save with an unsound one); loading an older
 * save; saving after loading an older save; and loading that newly-migrated save — advancing a whole
 * season on it to prove the migrated stats never turn to NaN at turnover.
 */
async function open2d(page: Page): Promise<void> {
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

// A season is 600s; step just past one so `endSeason` runs exactly once.
const PAST_A_SEASON = 605;

test.describe('save/load reliability', () => {
  test('1. a new game writes a well-formed, current-version save with no transient fields', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 12345);
      // Let villagers move so they pick up cached routes / partial loads — the transient state that
      // must NOT be written to disk.
      g.debugAdvance(20);
      const wrote = g.debugSaveSlot(0);
      const env = JSON.parse(g.debugRawSlot(0));
      const transient = ['pending', 'inside', 'clothed', 'starve', 'chill',
        'builder', 'effort', 'workAt', 'rest', 'route', 'routeI', 'rdx', 'rdy'];
      const anyTransient = env.state.citizens.some((c: any) => transient.some((k) => k in c));
      return {
        wrote,
        version: env.v,
        pop: env.state.citizens.length,
        hasBarn: env.state.buildings.some((b: any) => b.type === 'barn'),
        hasStats: !!env.state.stats && typeof env.state.stats.peakPop === 'number',
        seedNum: typeof env.state.seed === 'number' && typeof env.state.rng === 'number',
        anyTransient,
      };
    });
    expect(out.wrote).toBe(true);
    expect(out.version).toBe(14);
    expect(out.pop).toBeGreaterThan(0);
    expect(out.hasBarn).toBe(true);
    expect(out.hasStats).toBe(true);
    expect(out.seedNum).toBe(true);
    expect(out.anyTransient).toBe(false); // transient per-citizen fields stripped on save
  });

  test('2. save/load round-trips population, buildings, resources, construction, progression, merchant/port and the calendar', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true, 0, 4242);
      const s = g.state;

      // A construction site: place a house on the first spot that will take one, leave it partly built.
      let siteId: number | null = null;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      for (let r = 1; r < 25 && siteId == null; r++)
        for (let dy = -r; dy <= r && siteId == null; dy++)
          for (let dx = -r; dx <= r && siteId == null; dx++) {
            const x = barn.x + dx, y = barn.y + dy;
            if (g.debugCanPlace('house', x, y).ok) siteId = g.debugPlace('house', x, y);
          }
      const site = s.buildings.find((b: any) => b.id === siteId);
      site.progress = 3.5; // caught mid-construction

      // Varied, deterministic state across every category the plan lists.
      s.year = 7; s.season = 2; s.seasonTimer = 123;
      barn.store.wood = 999; barn.store.iron = 40;
      s.portTradeCount = 5;
      s.merchant.phase = 'docked'; s.merchant.present = true; s.merchant.stayTimer = 200;
      s.merchant.category = 'goods'; s.merchant.stock = { iron: 10 };
      s.stats.peakPop = 42; s.stats.tradesCompleted = 9; s.stats.maxTier = 3;
      s.tierSeen = 'village';

      const snap = {
        pop: s.citizens.length,
        citizenIds: s.citizens.map((c: any) => c.id).sort((a: number, b: number) => a - b),
        buildings: s.buildings.length,
        siteProgress: site.progress,
        siteBuilt: site.built,
        wood: barn.store.wood, iron: barn.store.iron,
        year: s.year, season: s.season, seasonTimer: s.seasonTimer,
        portTradeCount: s.portTradeCount,
        merchantPhase: s.merchant.phase, merchantStay: s.merchant.stayTimer,
        merchantStock: s.merchant.stock.iron,
        peakPop: s.stats.peakPop, tradesCompleted: s.stats.tradesCompleted, maxTier: s.stats.maxTier,
        tierSeen: s.tierSeen,
        seed: s.seed, rng: s.rng,
      };

      g.debugSaveSlot(0);
      // Clobber the live state with a *different* village (into another slot, since starting a game
      // autosaves its own slot), then load slot 0 back to prove the reload reads from disk rather
      // than reusing what was in memory.
      g.startNewGame('small', 'normal', true, 1, 99999);
      const loaded = g.debugLoadSlot(0);
      const t = g.state;
      const loadedSite = t.buildings.find((b: any) => b.type === 'house' && !b.built);
      const now = {
        pop: t.citizens.length,
        citizenIds: t.citizens.map((c: any) => c.id).sort((a: number, b: number) => a - b),
        buildings: t.buildings.length,
        siteProgress: loadedSite?.progress,
        siteBuilt: loadedSite?.built,
        wood: t.buildings.find((b: any) => b.type === 'barn').store.wood,
        iron: t.buildings.find((b: any) => b.type === 'barn').store.iron,
        year: t.year, season: t.season, seasonTimer: t.seasonTimer,
        portTradeCount: t.portTradeCount,
        merchantPhase: t.merchant.phase, merchantStay: t.merchant.stayTimer,
        merchantStock: t.merchant.stock.iron,
        peakPop: t.stats.peakPop, tradesCompleted: t.stats.tradesCompleted, maxTier: t.stats.maxTier,
        tierSeen: t.tierSeen,
        seed: t.seed, rng: t.rng,
      };
      return { loaded, snap, now };
    });
    expect(out.loaded).toBe(true);
    // Compare category by category so a failure names what drifted.
    expect(out.now.pop).toBe(out.snap.pop);                               // population
    expect(out.now.citizenIds).toEqual(out.snap.citizenIds);
    expect(out.now.buildings).toBe(out.snap.buildings);                   // buildings
    expect(out.now.siteProgress).toBeCloseTo(out.snap.siteProgress, 5);   // construction
    expect(out.now.siteBuilt).toBe(false);
    expect(out.now.wood).toBe(out.snap.wood);                             // resources
    expect(out.now.iron).toBe(out.snap.iron);
    expect(out.now.year).toBe(out.snap.year);                            // seasons/years
    expect(out.now.season).toBe(out.snap.season);
    expect(out.now.seasonTimer).toBeCloseTo(out.snap.seasonTimer, 5);
    expect(out.now.portTradeCount).toBe(out.snap.portTradeCount);        // port state
    expect(out.now.merchantPhase).toBe(out.snap.merchantPhase);          // merchant state
    expect(out.now.merchantStay).toBeCloseTo(out.snap.merchantStay, 5);
    expect(out.now.merchantStock).toBe(out.snap.merchantStock);
    expect(out.now.peakPop).toBe(out.snap.peakPop);                      // progression / stats
    expect(out.now.tradesCompleted).toBe(out.snap.tradesCompleted);
    expect(out.now.maxTier).toBe(out.snap.maxTier);
    expect(out.now.tierSeen).toBe(out.snap.tierSeen);
    expect(out.now.seed).toBe(out.snap.seed);                            // determinism
    expect(out.now.rng).toBe(out.snap.rng);
  });

  test('3. autosave runs on a five-minute cadence and never overwrites a good save with an unsound state', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 7);
      const goodPop = g.state.citizens.length;
      const wroteGood = g.debugSaveSlot(0); // the good save autosave would write

      // Now corrupt the in-memory state the way a mid-tick bug might, and try to save over the slot.
      g.state.tiles = g.state.tiles.slice(0, 10); // wrong length ⇒ structurally unsound
      const wroteBad = g.debugSaveSlot(0);

      // The on-disk save must still be the good one: start a fresh game in another slot (which
      // autosaves *its* slot, not slot 0), then load slot 0 back.
      g.startNewGame('small', 'normal', true, 1, 999);
      const loaded = g.debugLoadSlot(0);
      return {
        cadence: g.debugAutosaveSeconds(),
        wroteGood, wroteBad,
        loaded, popAfter: g.state.citizens.length, goodPop,
      };
    });
    expect(out.cadence).toBe(300);       // five minutes
    expect(out.wroteGood).toBe(true);
    expect(out.wroteBad).toBe(false);    // the guard refused the unsound state
    expect(out.loaded).toBe(true);
    expect(out.popAfter).toBe(out.goodPop); // the good save survived intact
  });

  test('4. an older save loads: v12 seed/merchant migration and v13 stats backfill both run', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 555);
      g.debugAdvance(10);
      g.debugSaveSlot(0);

      // Downgrade the stored envelope to a v12-era shape: no seeded RNG, the old merchant object,
      // no lifetime stats, no stockpile caps, and a broken id counter.
      const env = JSON.parse(g.debugRawSlot(0));
      env.v = 12;
      delete env.state.seed;
      delete env.state.rng;
      delete env.state.ageScale;
      delete env.state.workScale;
      delete env.state.stats;
      delete env.state.limits;
      delete env.state.seeds;
      env.state.merchant = { present: true, timer: 1, stock: { iron: 5 } }; // pre-boat shape
      env.state.nextId = 0; // impossibly low
      g.debugWriteRawSlot(0, JSON.stringify(env));

      const loaded = g.debugLoadSlot(0);
      const s = g.state;
      let maxId = 0;
      for (const b of s.buildings) maxId = Math.max(maxId, b.id);
      for (const c of s.citizens) maxId = Math.max(maxId, c.id);
      return {
        loaded,
        seedNum: typeof s.seed === 'number' && typeof s.rng === 'number',
        merchantPhase: s.merchant.phase,                       // old shape upgraded
        merchantHasBoatField: 'boat' in s.merchant,
        statsOk: !!s.stats && typeof s.stats.peakPop === 'number' && typeof s.stats.produced === 'object',
        limitsOk: !!s.limits && typeof s.limits === 'object',
        seedsOk: Array.isArray(s.seeds),                       // granted all crops by migration
        nextIdOk: s.nextId > maxId,                            // clamped ahead of every id
      };
    });
    expect(out.loaded).toBe(true);
    expect(out.seedNum).toBe(true);
    expect(out.merchantPhase).toMatch(/away|arriving|docked|leaving/);
    expect(out.merchantHasBoatField).toBe(true);
    expect(out.statsOk).toBe(true);
    expect(out.limitsOk).toBe(true);
    expect(out.seedsOk).toBe(true);
    expect(out.nextIdOk).toBe(true);
  });

  test('5. saving after loading an older save re-stamps it to the current version with a full state', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 8080);
      g.debugAdvance(10);
      g.debugSaveSlot(0);

      // Make it look like an older save that predates stats + caps, then load it (which migrates).
      const env = JSON.parse(g.debugRawSlot(0));
      env.v = 13;
      delete env.state.stats;
      delete env.state.limits;
      g.debugWriteRawSlot(0, JSON.stringify(env));
      const loaded = g.debugLoadSlot(0);

      // Now save the migrated village back and read what actually hit the disk.
      const wrote = g.debugSaveSlot(0);
      const after = JSON.parse(g.debugRawSlot(0));
      return {
        loaded, wrote,
        version: after.v,                                       // re-stamped to current
        statsOnDisk: !!after.state.stats && typeof after.state.stats.peakPop === 'number',
        limitsOnDisk: !!after.state.limits && typeof after.state.limits === 'object',
        pop: after.state.citizens.length,
      };
    });
    expect(out.loaded).toBe(true);
    expect(out.wrote).toBe(true);
    expect(out.version).toBe(14);
    expect(out.statsOnDisk).toBe(true);
    expect(out.limitsOnDisk).toBe(true);
    expect(out.pop).toBeGreaterThan(0);
  });

  test('@slow 6. the newly-migrated save loads and survives a full season with no NaN in its stats', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((pastSeason) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 31337);
      g.debugAdvance(10);
      g.debugSaveSlot(0);

      // Downgrade to a pre-stats save, load (migrates), re-save, then load the migrated save again.
      const env = JSON.parse(g.debugRawSlot(0));
      env.v = 13;
      delete env.state.stats;
      g.debugWriteRawSlot(0, JSON.stringify(env));
      g.debugLoadSlot(0);
      g.debugSaveSlot(0);
      const reloaded = g.debugLoadSlot(0);

      // Advance a whole season so `endSeason` drives every stats peak (Math.max) and counter (++).
      // A field left undefined by the old save would turn to NaN here; the freshStats merge prevents it.
      g.debugAdvance(pastSeason);
      const s = g.state;
      const nanKeys: string[] = [];
      for (const [k, v] of Object.entries(s.stats)) {
        if (typeof v === 'number' && Number.isNaN(v)) nanKeys.push(k);
      }
      return {
        reloaded,
        pop: s.citizens.length,
        nanKeys,
        peakPopIsNum: typeof s.stats.peakPop === 'number' && !Number.isNaN(s.stats.peakPop),
        wintersIsNum: typeof s.stats.wintersSurvived === 'number' && !Number.isNaN(s.stats.wintersSurvived),
      };
    }, PAST_A_SEASON);
    expect(out.reloaded).toBe(true);
    expect(out.pop).toBeGreaterThan(0);
    expect(out.nanKeys).toEqual([]);      // no stats field became NaN at turnover
    expect(out.peakPopIsNum).toBe(true);
    expect(out.wintersIsNum).toBe(true);
  });
});
