import { test, expect, Page } from '@playwright/test';

/**
 * Save/load reliability. Everything is driven through the real app and `window.__village`, using the
 * debug hooks that round-trip the village through `localStorage` the same way autosave and Continue
 * do (`debugSaveSlot`, `debugLoadSlot`) plus the raw-slot accessors that let a test downgrade a real
 * save to an older format and load it back through the migration path (`debugRawSlot`,
 * `debugWriteRawSlot`).
 *
 * The cases the plan calls for: a new save; a save/load round-trip; autosave (its cadence and, more
 * importantly, that it refuses to overwrite a good save with an unsound one); loading an older save;
 * saving after loading an older save; and loading that newly-migrated save — advancing a whole season
 * to prove the migrated stats never turn to NaN at turnover. Case 7 guards the specific `workScale`
 * regression (a first load must not rescale construction that is already current).
 *
 * Where a test needs to prove a load actually read from disk (rather than reusing what was already in
 * memory), it stamps the saved village with a distinctive marker and asserts *that* survives — a bare
 * "population is still 12" would pass even against a coincidentally-identical fresh game.
 */
async function open2d(page: Page): Promise<void> {
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

// A season is 600s; step just past one so `endSeason` runs exactly once.
const PAST_A_SEASON = 605;

test.describe('save/load reliability', () => {
  test('1. a new game writes a well-formed, current-version save; loading it back rebuilds a sound village', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 12345);
      // Let villagers move / accumulate partial loads before the snapshot.
      g.debugAdvance(20);
      const wrote = g.debugSaveSlot(0);
      const env = JSON.parse(g.debugRawSlot(0));

      // Load it back into a *different* clobbered game to prove the reload reads from disk, then
      // advance a little so anything rebuilt after load (the nav cache) is exercised without throwing.
      const savedSeed = env.state.seed;
      g.startNewGame('small', 'normal', true, 1, 67890);
      const loaded = g.debugLoadSlot(0);
      g.debugAdvance(5);
      const s = g.state;
      // No citizen field the sim relies on came back NaN.
      let citizenNaN = false;
      for (const c of s.citizens) {
        for (const k of ['x', 'y', 'age', 'health', 'happiness'] as const) {
          if (typeof c[k] === 'number' && Number.isNaN(c[k])) citizenNaN = true;
        }
      }
      return {
        wrote,
        version: env.v,
        pop: env.state.citizens.length,
        hasBarn: env.state.buildings.some((b: any) => b.type === 'barn'),
        hasStats: !!env.state.stats && typeof env.state.stats.peakPop === 'number',
        seedNum: typeof env.state.seed === 'number' && typeof env.state.rng === 'number',
        loaded,
        loadedSeed: s.seed,
        savedSeed,
        loadedPop: s.citizens.length,
        citizenNaN,
        gameOver: s.gameOver,
      };
    });
    expect(out.wrote).toBe(true);
    expect(out.version).toBe(14);
    expect(out.pop).toBeGreaterThan(0);
    expect(out.hasBarn).toBe(true);
    expect(out.hasStats).toBe(true);
    expect(out.seedNum).toBe(true);
    expect(out.loaded).toBe(true);
    expect(out.loadedSeed).toBe(out.savedSeed);  // the reload is the saved village, not the clobber
    expect(out.loadedSeed).not.toBe(67890);
    expect(out.loadedPop).toBe(out.pop);
    expect(out.citizenNaN).toBe(false);          // round-trip left citizens sound
    expect(out.gameOver).toBe(false);            // and it keeps running after load
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
      const site = siteId != null ? s.buildings.find((b: any) => b.id === siteId) : null;
      if (site) site.progress = 3.5; // caught mid-construction
      const unbuiltHousesBefore = s.buildings.filter((b: any) => b.type === 'house' && !b.built).length;

      // Varied, deterministic state across every category the plan lists.
      s.year = 7; s.season = 2; s.seasonTimer = 123;
      barn.store.wood = 999; barn.store.iron = 40; barn.store.stone = 17;
      s.portTradeCount = 5;
      s.merchant.phase = 'docked'; s.merchant.present = true; s.merchant.stayTimer = 200;
      s.merchant.category = 'goods'; s.merchant.stock = { iron: 10 };
      s.stats.peakPop = 42; s.stats.tradesCompleted = 9; s.stats.maxTier = 3;
      s.tierSeen = 'village';

      // A stable, persistent-only fingerprint of every citizen, sorted by id.
      const fingerprint = (cs: any[]) => cs
        .map((c) => ({ id: c.id, age: c.age, sex: c.sex, name: c.name, homeId: c.homeId, jobId: c.jobId, x: c.x, y: c.y, health: c.health, happiness: c.happiness }))
        .sort((a, b) => a.id - b.id);

      const snap = {
        pop: s.citizens.length,
        citizens: fingerprint(s.citizens),
        buildings: s.buildings.length,
        siteId,
        siteProgress: site?.progress,
        store: { ...barn.store },
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
      const loadedBarn = t.buildings.find((b: any) => b.type === 'barn');
      const loadedSite = snap.siteId != null ? t.buildings.find((b: any) => b.id === snap.siteId) : null;
      const now = {
        pop: t.citizens.length,
        citizens: fingerprint(t.citizens),
        buildings: t.buildings.length,
        siteProgress: loadedSite?.progress,
        siteBuilt: loadedSite?.built,
        unbuiltHouses: t.buildings.filter((b: any) => b.type === 'house' && !b.built).length,
        store: { ...loadedBarn.store },
        year: t.year, season: t.season, seasonTimer: t.seasonTimer,
        portTradeCount: t.portTradeCount,
        merchantPhase: t.merchant.phase, merchantStay: t.merchant.stayTimer,
        merchantStock: t.merchant.stock.iron,
        peakPop: t.stats.peakPop, tradesCompleted: t.stats.tradesCompleted, maxTier: t.stats.maxTier,
        tierSeen: t.tierSeen,
        seed: t.seed, rng: t.rng,
      };
      return { loaded, snap, now, unbuiltHousesBefore };
    });
    expect(out.loaded).toBe(true);
    // The site was actually created and is the single unbuilt house on both sides.
    expect(out.snap.siteId).not.toBeNull();
    expect(out.unbuiltHousesBefore).toBe(1);
    expect(out.now.unbuiltHouses).toBe(1);
    // Compare category by category so a failure names what drifted.
    expect(out.now.pop).toBe(out.snap.pop);                               // population
    expect(out.now.citizens).toEqual(out.snap.citizens);                  // every persistent citizen field
    expect(out.now.buildings).toBe(out.snap.buildings);                   // buildings
    expect(out.now.siteProgress).toBeCloseTo(out.snap.siteProgress, 5);   // construction
    expect(out.now.siteBuilt).toBe(false);
    expect(out.now.store).toEqual(out.snap.store);                        // resources (whole barn)
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
    expect(out.now.seed).not.toBe(99999);                               // ...and not the clobber
    expect(out.now.rng).toBe(out.snap.rng);
  });

  test('3. autosave runs on a five-minute cadence and never overwrites a good save with an unsound state', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 7);
      // A distinctive marker so "the good save survived" cannot pass against a coincidental fresh game.
      const barn = g.state.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 31415;
      const goodPop = g.state.citizens.length;
      const wroteGood = g.debugSaveSlot(0);
      const rawGood = g.debugRawSlot(0);

      // Several ways a mid-tick bug could hand autosave an unsound state — each must be refused, and
      // each must leave the on-disk bytes byte-for-byte unchanged.
      g.state.tiles = g.state.tiles.slice(0, 10);       // wrong-length tile array
      const wroteBadTiles = g.debugSaveSlot(0);
      const rawAfterTiles = g.debugRawSlot(0);

      g.debugLoadSlot(0);                                // restore the good state, then break it differently
      g.state.merchant = undefined;                     // missing merchant
      const wroteBadMerchant = g.debugSaveSlot(0);
      const rawAfterMerchant = g.debugRawSlot(0);

      g.debugLoadSlot(0);
      g.state.pathProgress = 'nope';                    // non-numeric scalar
      const wroteBadPath = g.debugSaveSlot(0);
      const rawAfterPath = g.debugRawSlot(0);

      // End to end: clobber into another slot, then load slot 0 and confirm the marker survived.
      g.startNewGame('small', 'normal', true, 1, 999);
      const loaded = g.debugLoadSlot(0);
      const loadedBarn = g.state.buildings.find((b: any) => b.type === 'barn');
      return {
        cadence: g.debugAutosaveSeconds(),
        wroteGood, wroteBadTiles, wroteBadMerchant, wroteBadPath,
        unchangedTiles: rawAfterTiles === rawGood,
        unchangedMerchant: rawAfterMerchant === rawGood,
        unchangedPath: rawAfterPath === rawGood,
        loaded, popAfter: g.state.citizens.length, goodPop,
        markerAfter: loadedBarn.store.wood,
      };
    });
    expect(out.cadence).toBe(300);            // five minutes
    expect(out.wroteGood).toBe(true);
    expect(out.wroteBadTiles).toBe(false);    // guard refused each unsound shape...
    expect(out.wroteBadMerchant).toBe(false);
    expect(out.wroteBadPath).toBe(false);
    expect(out.unchangedTiles).toBe(true);    // ...and never touched the good bytes on disk
    expect(out.unchangedMerchant).toBe(true);
    expect(out.unchangedPath).toBe(true);
    expect(out.loaded).toBe(true);
    expect(out.popAfter).toBe(out.goodPop);
    expect(out.markerAfter).toBe(31415);      // the specific good save survived, not just any 12-pop game
  });

  test('4. an older save loads and then simulates: v12 seed/merchant migration and v13 stats backfill both run', async ({ page }) => {
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

      // The migrated village must not just load — it must run. Advance past a season so `endSeason`
      // touches the freshly-seeded stats, and confirm nothing threw and nothing went NaN.
      g.debugAdvance(605);
      const nanStats: string[] = [];
      for (const [k, v] of Object.entries(s.stats)) {
        if (typeof v === 'number' && Number.isNaN(v)) nanStats.push(k);
      }
      return {
        loaded,
        seedNum: typeof s.seed === 'number' && typeof s.rng === 'number',
        merchantPhase: s.merchant.phase,                       // old shape upgraded
        merchantHasBoatField: 'boat' in s.merchant,
        merchantStayNum: typeof s.merchant.stayTimer === 'number' && Number.isFinite(s.merchant.stayTimer),
        statsOk: !!s.stats && typeof s.stats.peakPop === 'number' && typeof s.stats.produced === 'object',
        limitsOk: !!s.limits && typeof s.limits === 'object',
        seedsGrantedAll: Array.isArray(s.seeds) && s.seeds.length > 0, // pre-gate saves get every crop
        nextIdOk: s.nextId > maxId,                            // clamped ahead of every id
        nanStats,
      };
    });
    expect(out.loaded).toBe(true);
    expect(out.seedNum).toBe(true);
    expect(out.merchantPhase).toMatch(/away|arriving|docked|leaving/);
    expect(out.merchantHasBoatField).toBe(true);
    expect(out.merchantStayNum).toBe(true);       // no docked-ghost with a bad timer
    expect(out.statsOk).toBe(true);
    expect(out.limitsOk).toBe(true);
    expect(out.seedsGrantedAll).toBe(true);
    expect(out.nextIdOk).toBe(true);
    expect(out.nanStats).toEqual([]);
  });

  test('5. saving after loading an older save re-stamps it to the current version and reloads intact', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 8080);
      g.debugAdvance(10);
      // A marker so we can prove the re-saved, reloaded village is this one.
      const barn = g.state.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 2718;
      const pop0 = g.state.citizens.length;
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

      // And load the re-stamped save one more time into a clobbered game — it must round-trip cleanly.
      g.startNewGame('small', 'normal', true, 1, 424242);
      const reloaded = g.debugLoadSlot(0);
      const r = g.state;
      return {
        loaded, wrote,
        version: after.v,                                       // re-stamped to current
        statsOnDisk: !!after.state.stats && typeof after.state.stats.peakPop === 'number',
        limitsOnDisk: !!after.state.limits && typeof after.state.limits === 'object',
        reloaded,
        reloadedPop: r.citizens.length, pop0,
        reloadedMarker: r.buildings.find((b: any) => b.type === 'barn').store.wood,
        reloadedStats: !!r.stats && typeof r.stats.peakPop === 'number',
      };
    });
    expect(out.loaded).toBe(true);
    expect(out.wrote).toBe(true);
    expect(out.version).toBe(14);
    expect(out.statsOnDisk).toBe(true);
    expect(out.limitsOnDisk).toBe(true);
    expect(out.reloaded).toBe(true);
    expect(out.reloadedPop).toBe(out.pop0);
    expect(out.reloadedMarker).toBe(2718);        // it is the same migrated village, off disk
    expect(out.reloadedStats).toBe(true);
  });

  test('@slow 6. the newly-migrated save loads and survives a full season with stats advancing and no NaN', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((pastSeason) => {
      const g = (window as any).__village;
      // Disasters off so a stray fire/plague can't wipe the village and make the "stats advanced"
      // assertion flaky — the point here is the migrated stats math, not survival odds.
      g.startNewGame('small', 'normal', false, 0, 31337);
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
        peakPop: s.stats.peakPop,                       // must have advanced off 0 at turnover
        producedIsObj: !!s.stats.produced && typeof s.stats.produced === 'object',
        wintersIsNum: typeof s.stats.wintersSurvived === 'number' && !Number.isNaN(s.stats.wintersSurvived),
      };
    }, PAST_A_SEASON);
    expect(out.reloaded).toBe(true);
    expect(out.pop).toBeGreaterThan(0);
    expect(out.nanKeys).toEqual([]);          // no stats field became NaN at turnover
    expect(out.peakPop).toBeGreaterThanOrEqual(1); // endSeason actually ran Math.max on merged stats
    expect(out.producedIsObj).toBe(true);
    expect(out.wintersIsNum).toBe(true);
  });

  test('7. construction progress is stable across loads (workScale is stamped, never rescaled)', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true, 0, 2024);
      const s = g.state;

      // Stand up a partly-built site.
      let siteId: number | null = null;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      for (let r = 1; r < 25 && siteId == null; r++)
        for (let dy = -r; dy <= r && siteId == null; dy++)
          for (let dx = -r; dx <= r && siteId == null; dx++) {
            const x = barn.x + dx, y = barn.y + dy;
            if (g.debugCanPlace('house', x, y).ok) siteId = g.debugPlace('house', x, y);
          }
      const site = siteId != null ? s.buildings.find((b: any) => b.id === siteId) : null;
      const set = 7.25;
      if (site) site.progress = set;
      g.debugSaveSlot(0);

      // First load: a new game never stamped `workScale` would run the legacy seconds→work rescaler
      // here and inflate `progress`. With the stamp, it comes back exactly as saved.
      g.debugLoadSlot(0);
      const p1 = g.state.buildings.find((b: any) => b.id === siteId)?.progress;
      // Second round-trip: still stable (idempotent).
      g.debugSaveSlot(0);
      g.debugLoadSlot(0);
      const p2 = g.state.buildings.find((b: any) => b.id === siteId)?.progress;
      return { siteId, set, p1, p2 };
    });
    expect(out.siteId).not.toBeNull();
    expect(out.p1).toBeCloseTo(out.set, 5);   // not rescaled on the very first load
    expect(out.p2).toBeCloseTo(out.set, 5);   // and stable across a second round-trip
  });
});
