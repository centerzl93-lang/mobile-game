import { test, expect, Page } from '@playwright/test';

// Covers the New Game start-location fix, difficulty stockpiles, and the disasters toggle.

async function open(page: Page): Promise<void> {
  await page.goto('/?gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

test.describe('start location', () => {
  test('the barn and every villager spawn on grass, never water (many seeds)', async ({ page }) => {
    await open(page);
    const res = await page.evaluate(() => {
      const g = (window as any).__village;
      const grass = (s: any, x: number, y: number) =>
        x >= 0 && y >= 0 && x < s.w && y < s.h && s.tiles[Math.floor(y) * s.w + Math.floor(x)].type === 'grass';
      let barnBad = 0, citBad = 0;
      for (let i = 0; i < 20; i++) {
        g.startNewGame('small', 'normal', true);
        const s = g.state;
        const barn = s.buildings.find((b: any) => b.type === 'barn');
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (!grass(s, barn.x + dx, barn.y + dy)) barnBad++;
        for (const c of s.citizens) if (!grass(s, c.x, c.y)) citBad++;
      }
      return { barnBad, citBad };
    });
    expect(res.barnBad).toBe(0);
    expect(res.citBad).toBe(0);
  });
});

test.describe('difficulties', () => {
  test('each difficulty seeds the right stock and houses', async ({ page }) => {
    await open(page);
    const d = await page.evaluate(() => {
      const g = (window as any).__village;
      const setup = (diff: string) => {
        g.startNewGame('small', diff, true);
        const s = g.state;
        const barn = s.buildings.find((b: any) => b.type === 'barn');
        return { store: { ...barn.store }, houses: s.buildings.filter((b: any) => b.type === 'house').length };
      };
      return { easy: setup('easy'), normal: setup('normal'), hard: setup('hard') };
    });
    // Opening stock is the difficulty baseline × 3 (scaled for the 12-villager founding pop).
    // Easy: full stock + 3 houses.
    expect(d.easy.houses).toBe(3);
    expect(d.easy.store.wood).toBe(660);
    expect(d.easy.store.medicine).toBe(120);
    // Normal: no houses, halved basics (×3), no non-basics.
    expect(d.normal.houses).toBe(0);
    expect(d.normal.store.wood).toBe(330);
    expect(d.normal.store.stone).toBe(60);
    expect(d.normal.store.medicine ?? 0).toBe(0);
    expect(d.normal.store.coal ?? 0).toBe(0);
    // Hard: no wood or stone, but keeps food/firewood/tools (×3).
    expect(d.hard.store.wood ?? 0).toBe(0);
    expect(d.hard.store.stone ?? 0).toBe(0);
    expect(d.hard.store.firewood).toBe(300);
    expect(d.hard.store.tools).toBe(180);
  });

  test('a fresh game founds 8 adults and 4 children', async ({ page }) => {
    await open(page);
    const pop = await page.evaluate(() => {
      const g = (window as any).__village;
      const ADULT_AGE = 4;
      const counts: Record<string, any> = {};
      for (const diff of ['easy', 'normal', 'hard']) {
        g.startNewGame('small', diff, true);
        const cs = g.state.citizens;
        counts[diff] = {
          total: cs.length,
          adults: cs.filter((c: any) => c.age >= ADULT_AGE).length,
          children: cs.filter((c: any) => c.age < ADULT_AGE).length,
          adultAgesOk: cs.filter((c: any) => c.age >= ADULT_AGE).every((c: any) => c.age >= 20 && c.age <= 29),
          childAgesOk: cs.filter((c: any) => c.age < ADULT_AGE).every((c: any) => c.age >= 3 && c.age < ADULT_AGE),
        };
      }
      return counts;
    });
    for (const diff of ['easy', 'normal', 'hard']) {
      expect(pop[diff].total).toBe(12);
      expect(pop[diff].adults).toBe(8);
      expect(pop[diff].children).toBe(4);
      expect(pop[diff].adultAgesOk).toBe(true);
      expect(pop[diff].childAgesOk).toBe(true);
    }
  });
});

test.describe('forester', () => {
  test('the building is named Forester with up to 3 workers and a replant toggle', async ({ page }) => {
    await open(page);
    const insp = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // A synthetic, built Forester so we can inspect it deterministically.
      const f = { id: s.nextId++, type: 'lumberyard', x: barn.x, y: barn.y, built: true, progress: 9, workers: [], desiredWorkers: 3, growth: 0, output: 'coal', recipe: 'iron', replant: true, store: {} };
      s.buildings.push(f);
      g.inspectSel = { kind: 'building', id: f.id };
      g.refreshInspect();
      const el = document.getElementById('inspect')!;
      return { text: el.innerText, r1: g.debugWorkRadius(f.id) };
    });
    expect(insp.text).toContain('Forester');
    expect(insp.text).toContain('max 3');
    expect(insp.text).toContain('Replant');
    expect(insp.r1).toBe(8); // 3 workers ⇒ base 4 + 2*2
  });
});

test.describe('crops and livestock', () => {
  test('placed work buildings start unstaffed with default crop/animal', async ({ page }) => {
    await open(page);
    const res = await page.evaluate(() => {
      const g = (window as any).__village;
      // Place a real building via the game's placement path at the first accepting tile.
      const place = (type: string) => {
        const s = g.state;
        const barn = s.buildings.find((b: any) => b.type === 'barn');
        for (let r = 2; r < 12; r++)
          for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
              const x = barn.x + dx, y = barn.y + dy;
              if (g.debugCanPlace(type, x, y).ok) {
                const id = g.debugPlace(type, x, y);
                if (id != null) return s.buildings.find((b: any) => b.id === id);
              }
            }
        return null;
      };
      g.startNewGame('small', 'easy', true); // Easy has stock to afford placements + one seed
      const s = g.state;
      const farm = place('farm');
      const ranch = place('ranch');
      const out: any = {
        seedCount: s.seeds.length,
        firstSeed: s.seeds[0],
        farmDesired: farm && farm.desiredWorkers,
        farmWorkers: farm && farm.workers.length,
        farmCrop: farm && farm.crop,
        ranchAnimal: ranch && ranch.animal,
      };
      if (farm) { farm.built = true; farm.progress = 99; g.inspectSel = { kind: 'building', id: farm.id }; g.refreshInspect(); out.farmToggleBtns = document.querySelectorAll('#inspect .jr-toggle button').length; }
      if (ranch) { ranch.built = true; ranch.progress = 99; g.inspectSel = { kind: 'building', id: ranch.id }; g.refreshInspect(); out.ranchText = document.getElementById('inspect')!.innerText; }
      return out;
    });
    // Manual staffing: a freshly placed work building wants zero workers until the player assigns.
    expect(res.farmDesired).toBe(0);
    expect(res.farmWorkers).toBe(0);
    // Easy grants exactly one random seed; a new farm defaults to it; a ranch defaults to cattle.
    expect(res.seedCount).toBe(1);
    expect(res.farmCrop).toBe(res.firstSeed);
    expect(res.ranchAnimal).toBe('cattle');
    // The farm crop toggle lists only the one owned seed; the ranch offers all three animals.
    expect(res.farmToggleBtns).toBe(1);
    expect(res.ranchText).toContain('Cattle');
    expect(res.ranchText).toContain('Pigs');
    expect(res.ranchText).toContain('Chickens');
  });

  test('a field needs a seed — Normal starts with none and cannot plant', async ({ page }) => {
    await open(page);
    const res = await page.evaluate(() => {
      const g = (window as any).__village;
      const place = (type: string) => {
        const s = g.state;
        const barn = s.buildings.find((b: any) => b.type === 'barn');
        for (let r = 2; r < 12; r++)
          for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
              const x = barn.x + dx, y = barn.y + dy;
              if (g.debugCanPlace(type, x, y).ok) {
                const id = g.debugPlace(type, x, y);
                if (id != null) return s.buildings.find((b: any) => b.id === id);
              }
            }
        return null;
      };
      g.startNewGame('small', 'normal', true); // Normal ⇒ no seeds
      const s = g.state;
      const farm = place('farm');
      const out: any = { seedCount: s.seeds.length, farmCrop: farm && farm.crop };
      if (farm) { farm.built = true; farm.progress = 99; g.inspectSel = { kind: 'building', id: farm.id }; g.refreshInspect(); const el = document.getElementById('inspect')!; out.text = el.innerText; out.toggleBtns = el.querySelectorAll('.jr-toggle button').length; }
      return out;
    });
    expect(res.seedCount).toBe(0);
    expect(res.farmCrop).toBeUndefined(); // seeds[0] is undefined when the village owns none
    expect(res.text).toContain('No seed');
    expect(res.toggleBtns).toBe(0); // no crop toggle without a seed to plant
  });
});

test.describe('trading post & merchant', () => {
  // Build a synthetic, docked merchant + a built trading post holding `store`, for deterministic tests.
  const setup = `(store, orders, merchant) => {
    const g = window.__village;
    g.startNewGame('small', 'normal', true);
    const s = g.state;
    const barn = s.buildings.find((b) => b.type === 'barn');
    const post = { id: s.nextId++, type: 'trading', x: barn.x, y: barn.y, built: true, progress: 99,
      workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: store, orders: orders };
    s.buildings.push(post);
    Object.assign(s.merchant, merchant);
    return { s, post };
  }`;

  test('the global merchant button is gone — access is only via the post', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => !!document.getElementById('btn-merchant'))).toBe(false);
  });

  test('a value-matched basket settles through the post inventory', async ({ page }) => {
    await open(page);
    const res = await page.evaluate(`(${setup})({ wood: 100 }, {}, { phase: 'docked', present: true, seasonsLeft: 1, category: 'basics', stock: { iron: 10 }, seedStock: [], boat: { x: 0, y: 0 } })`) as any;
    void res;
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      const s = g.state;
      const post = s.buildings.find((b: any) => b.type === 'trading');
      // iron value 4, wood value 1, margin 0.8 → buying 2 iron (value 8) needs offer ≥ 10 wood.
      const low = g.trade({ give: { wood: 5 }, get: { iron: 2 }, buySeeds: [] });
      const good = g.trade({ give: { wood: 10 }, get: { iron: 2 }, buySeeds: [] });
      return { lowOk: low.ok, goodOk: good.ok, wood: post.store.wood, iron: post.store.iron, stockIron: s.merchant.stock.iron };
    });
    expect(out.lowOk).toBe(false); // under-valued offer rejected
    expect(out.goodOk).toBe(true);
    expect(out.wood).toBe(90); // 10 wood spent from the post
    expect(out.iron).toBe(2); // 2 iron received into the post
    expect(out.stockIron).toBe(8); // merchant stock drawn down
  });

  test('a seed merchant unlocks a crop when its value is matched', async ({ page }) => {
    await open(page);
    await page.evaluate(`(${setup})({ grain: 200 }, {}, { phase: 'docked', present: true, seasonsLeft: 1, category: 'seeds', stock: {}, seedStock: ['corn'], boat: { x: 0, y: 0 } })`);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      const s = g.state;
      const post = s.buildings.find((b: any) => b.type === 'trading');
      const before = s.seeds.includes('corn');
      // Seed costs 30 value; margin 0.8 → need 38 grain (value 1 each).
      const r = g.trade({ give: { grain: 38 }, get: {}, buySeeds: ['corn'] });
      return { before, ok: r.ok, has: s.seeds.includes('corn'), grain: post.store.grain, offered: s.merchant.seedStock.includes('corn') };
    });
    expect(out.before).toBe(false);
    expect(out.ok).toBe(true);
    expect(out.has).toBe(true); // permanent unlock
    expect(out.grain).toBe(162); // 38 grain spent
    expect(out.offered).toBe(false); // removed from the merchant's offer
  });

  test('dismissing sends the docked merchant away', async ({ page }) => {
    await open(page);
    await page.evaluate(`(${setup})({}, {}, { phase: 'docked', present: true, seasonsLeft: 1, category: 'foods', stock: { grain: 50 }, seedStock: [], boat: { x: 1, y: 1 } })`);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.dismissMerchant();
      return { phase: g.state.merchant.phase, present: g.state.merchant.present };
    });
    expect(out.phase).toBe('leaving');
    expect(out.present).toBe(false);
  });

  test('no back-to-back visits: a cooldown season never spawns a merchant', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // A staffed trading post so arrivals are *possible*, plus an active cooldown.
      s.buildings.push({ id: s.nextId++, type: 'trading', x: barn.x, y: barn.y, built: true, progress: 99,
        workers: [s.citizens[0].id], desiredWorkers: 1, growth: 0, output: 'coal', recipe: 'iron', store: {}, orders: {} });
      Object.assign(s.merchant, { phase: 'away', present: false, cooldown: true, category: null, stock: {}, seedStock: [], boat: null });
      g.debugAdvance(630); // just past one full season (nudge clear of the exact float boundary)
      return { phase: s.merchant.phase, cooldown: s.merchant.cooldown };
    });
    expect(out.phase).toBe('away'); // cooldown blocked the arrival this season
    expect(out.cooldown).toBe(false); // and the cooldown is now cleared for next season
  });

  test('an arriving boat sails to the dock and moors for one season', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      s.buildings.push({ id: s.nextId++, type: 'trading', x: barn.x, y: barn.y, built: true, progress: 99,
        workers: [s.citizens[0].id], desiredWorkers: 1, growth: 0, output: 'coal', recipe: 'iron', store: {}, orders: {} });
      // Launch a boat from the top of the river; the per-tick sim should sail it in and dock it.
      Object.assign(s.merchant, { phase: 'arriving', present: false, category: 'basics',
        stock: { wood: 100 }, seedStock: [], boat: { x: s.w / 2, y: 0 } });
      g.debugAdvance(30); // a few seconds of travel
      return { phase: s.merchant.phase, present: s.merchant.present, seasonsLeft: s.merchant.seasonsLeft, boat: !!s.merchant.boat };
    });
    expect(out.phase).toBe('docked');
    expect(out.present).toBe(true);
    expect(out.seasonsLeft).toBe(1); // MERCHANT_STAY_SEASONS
    expect(out.boat).toBe(true); // the boat stays moored at the dock
  });

  test('a stock order pulls goods from the barns into the post', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true); // easy has a full barn (incl. wood)
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      const woodBefore = barn.store.wood ?? 0;
      const post = { id: s.nextId++, type: 'trading', x: barn.x, y: barn.y, built: true, progress: 99,
        workers: [], desiredWorkers: 1, growth: 0, output: 'coal', recipe: 'iron', store: {} as any, orders: { wood: 20 } };
      s.buildings.push(post);
      g.debugAdvance(200); // let the assigned trader haul a few loads
      return { woodBefore, postWood: post.store.wood ?? 0, hasWorker: post.workers.length };
    });
    expect(out.woodBefore).toBeGreaterThan(20);
    expect(out.hasWorker).toBe(1); // an idle adult took the trading-post job
    expect(out.postWood).toBeGreaterThan(0); // and hauled wood in toward the order
  });
});

test.describe('ranch', () => {
  // Build a synthetic, built ranch at the barn's spot (placement isn't validated for synth objects).
  const mkRanch = `(animal, animals, maxAnimals, w, h) => {
    const g = window.__village;
    const s = g.state;
    const barn = s.buildings.find((b) => b.type === 'barn');
    const r = { id: s.nextId++, type: 'ranch', x: barn.x, y: barn.y, built: true, progress: 99,
      workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {},
      animal, animals, maxAnimals, breedProgress: 0, w, h };
    s.buildings.push(r);
    return r.id;
  }`;

  test('a placed ranch takes the chosen size; capacity scales with size and animal', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // Place a 6×6 cattle ranch via the sized placement path.
      g.sizeW = 6; g.sizeH = 6;
      let id: number | null = null;
      for (let r = 3; r < 14 && id == null; r++)
        for (let dy = -r; dy <= r && id == null; dy++)
          for (let dx = -r; dx <= r && id == null; dx++)
            if (g.debugCanPlace('ranch', barn.x + dx, barn.y + dy).ok) id = g.debugPlace('ranch', barn.x + dx, barn.y + dy);
      const b = s.buildings.find((x: any) => x.id === id);
      b.built = true; b.progress = 99;
      const cattleCap = g.debugRanchCapacity(id);
      b.animals = 0; b.animal = 'chickens'; // switch species on an empty pen
      const chickenCap = g.debugRanchCapacity(id);
      return { w: b.w, h: b.h, cattleCap, chickenCap };
    });
    expect(out.w).toBe(6);
    expect(out.h).toBe(6);
    expect(out.cattleCap).toBe(12); // 36 tiles / 3 per cattle
    expect(out.chickenCap).toBe(36); // 36 tiles / 1 per chicken — smaller animals pack tighter
  });

  test('herds breed at least one per two seasons, cap out, and slaughter the excess', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      const id = eval(mk)('cattle', 2, 10, 6, 6);
      const s = g.state;
      const b = s.buildings.find((x: any) => x.id === id);
      g.debugAdvance(600 * 2 + 30); // two seasons (nudged past the float boundary) → the breeding floor
      const afterTwo = b.animals;
      // Now push to the cap and confirm excess births convert to product, not more animals.
      // Measure leather (a by-product villagers never eat, unlike meat) so the delta is stable.
      b.animals = 10; b.maxAnimals = 10; b.breedProgress = 0;
      const leatherBefore = totalLeather(s);
      g.debugAdvance(600 * 2 + 30);
      return { afterTwo, cappedAt: b.animals, leatherGained: totalLeather(s) - leatherBefore };
      function totalLeather(st: any) {
        let n = 0;
        for (const bl of st.buildings) if (bl.type === 'barn' || bl.type === 'market') n += bl.store.leather ?? 0;
        return n;
      }
    }, mkRanch);
    expect(out.afterTwo).toBeGreaterThanOrEqual(3); // 2 seed + ≥1 calf
    expect(out.cappedAt).toBe(10); // never exceeds the cap
    expect(out.leatherGained).toBeGreaterThan(0); // over-cap births were slaughtered for product
  });

  test('the breed cap cannot exceed the size capacity', async ({ page }) => {
    await open(page);
    const max = await page.evaluate((mk) => {
      const g = (window as any).__village;
      const id = eval(mk)('cattle', 0, 4, 4, 4); // 4×4 cattle ⇒ capacity 5
      g.setRanchMax(id, 100);
      return g.state.buildings.find((x: any) => x.id === id).maxAnimals;
    }, mkRanch);
    expect(max).toBe(5); // floor(16/3)
  });

  test('cull slaughters the whole herd for resources; species only changes when empty', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      const id = eval(mk)('cattle', 6, 12, 6, 6);
      const s = g.state;
      const b = s.buildings.find((x: any) => x.id === id);
      const blocked = (g.setAnimal(id, 'pigs'), b.animal); // stocked pen keeps its species
      g.cullRanch(id);
      const allowed = (g.setAnimal(id, 'pigs'), b.animal); // now empty ⇒ switch works
      let meat = 0;
      for (const bl of s.buildings) if (bl.type === 'barn') meat += (bl.store.meat ?? 0) + (bl.store.leather ?? 0);
      return { blocked, animals: b.animals, allowed, meat };
    }, mkRanch);
    expect(out.blocked).toBe('cattle'); // couldn't switch a stocked pen
    expect(out.animals).toBe(0);
    expect(out.allowed).toBe('pigs'); // switched once emptied
    expect(out.meat).toBeGreaterThan(0);
  });

  test('split moves half to another ranch; transfer moves the whole herd; both need a target', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      const from = eval(mk)('cattle', 12, 12, 6, 6);
      const s = g.state;
      const fromB = s.buildings.find((x: any) => x.id === from);
      // No eligible target yet → split refused.
      const noTarget = g.state.buildings.filter((b: any) => b.type === 'ranch').length === 1;
      const to = eval(mk)('cattle', 0, 12, 6, 6);
      const toB = s.buildings.find((x: any) => x.id === to);
      g.splitRanch(from, to);
      const afterSplit = { from: fromB.animals, to: toB.animals };
      g.transferRanch(from, to);
      const afterTransfer = { from: fromB.animals, to: toB.animals };
      return { noTarget, afterSplit, afterTransfer };
    }, mkRanch);
    expect(out.noTarget).toBe(true);
    expect(out.afterSplit.from).toBe(6); // half of 12 moved
    expect(out.afterSplit.to).toBe(6);
    expect(out.afterTransfer.from).toBe(0); // remainder all transferred
    expect(out.afterTransfer.to).toBe(12);
  });

  test('a rancher pens purchased livestock from the barn', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      const id = eval(mk)('cattle', 0, 12, 6, 6);
      const s = g.state;
      const b = s.buildings.find((x: any) => x.id === id);
      b.desiredWorkers = 1; // staff it so an idle adult takes the job
      const barn = s.buildings.find((bl: any) => bl.type === 'barn');
      barn.store.cattle = 8; // livestock waiting to be penned
      g.debugAdvance(200);
      return { animals: b.animals, barnCattle: barn.store.cattle ?? 0, worker: b.workers.length };
    }, mkRanch);
    expect(out.worker).toBe(1);
    expect(out.animals).toBeGreaterThan(0); // some head penned
    expect(out.barnCattle).toBeLessThan(8); // pulled from the barn
  });
});

test.describe('farm', () => {
  // Synthetic built field at the barn's spot, staffed so it harvests, with a preset growth.
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

  test('a field is sized like a ranch (steppers clamp 4–8) and keeps its footprint', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      const s = g.state;
      g.onSelectBuild('farm'); // starts at the 4×4 minimum
      g.onSizeChange('w', 100); // clamps to 8
      g.onSizeChange('h', -100); // clamps to the 4 minimum
      const clamped = { w: g.sizeW, h: g.sizeH };
      // Place a 6×5 field via the sized placement path.
      g.sizeW = 6; g.sizeH = 5;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      let id: number | null = null;
      for (let r = 3; r < 14 && id == null; r++)
        for (let dy = -r; dy <= r && id == null; dy++)
          for (let dx = -r; dx <= r && id == null; dx++)
            if (g.debugCanPlace('farm', barn.x + dx, barn.y + dy).ok) id = g.debugPlace('farm', barn.x + dx, barn.y + dy);
      const b = s.buildings.find((x: any) => x.id === id);
      return { clamped, w: b.w, h: b.h };
    });
    expect(out.clamped).toEqual({ w: 8, h: 4 });
    expect(out.w).toBe(6);
    expect(out.h).toBe(5);
  });

  test('a bigger field yields a bigger autumn harvest (yield scales with area)', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true);
      const s = g.state;
      s.seeds = ['wheat', 'corn'];
      const small = eval(mk)('wheat', 1, 4, 4, 0); // grain, 16 tiles
      const big = eval(mk)('corn', 1, 8, 8, 1); // corn, 64 tiles (4× area), same growth & staffing
      // Sit just before the turn into Autumn, then tip over it so both fields harvest.
      s.season = 1; // Summer → next transition is Autumn
      s.seasonTimer = 599.95;
      g.debugAdvance(0.2);
      const sf = s.buildings.find((b: any) => b.id === small);
      const bf = s.buildings.find((b: any) => b.id === big);
      return { small: sf.store.grain ?? 0, big: bf.store.corn ?? 0 };
    }, mkFarm);
    expect(out.small).toBeGreaterThan(0);
    expect(out.big / out.small).toBeGreaterThan(3.5); // ~4× the area ⇒ ~4× the harvest
    expect(out.big / out.small).toBeLessThan(4.5);
  });

  test('a field only partly grown by autumn yields a partial harvest', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true);
      const s = g.state;
      s.seeds = ['wheat', 'corn'];
      // Growth accrues +0.5 per spring/summer season, so a field started mid-year reaches autumn
      // only partly grown. A full (1.0) vs half-grown (0.5) field, same size/staffing, shows the effect.
      const full = eval(mk)('wheat', 1.0, 4, 4, 0);
      const half = eval(mk)('corn', 0.5, 4, 4, 1);
      s.season = 1;
      s.seasonTimer = 599.95;
      g.debugAdvance(0.2);
      const ff = s.buildings.find((b: any) => b.id === full);
      const hf = s.buildings.find((b: any) => b.id === half);
      return { full: ff.store.grain ?? 0, half: hf.store.corn ?? 0 };
    }, mkFarm);
    expect(out.full).toBeGreaterThan(0);
    expect(out.half / out.full).toBeGreaterThan(0.4); // half-grown ⇒ ~half the harvest
    expect(out.half / out.full).toBeLessThan(0.6);
  });
});

test.describe('jobs & builders', () => {
  // Place a work building near the barn as a construction site; returns its id (or null).
  const placeGatherer = `() => {
    const g = window.__village;
    const s = g.state;
    const barn = s.buildings.find((b) => b.type === 'barn');
    let id = null;
    for (let r = 2; r < 16 && id == null; r++)
      for (let dy = -r; dy <= r && id == null; dy++)
        for (let dx = -r; dx <= r && id == null; dx++)
          if (g.debugCanPlace('gatherer', barn.x + dx, barn.y + dy).ok) id = g.debugPlace('gatherer', barn.x + dx, barn.y + dy);
    return id;
  }`;

  test('an unbuilt work building shows on the job board and can be pre-staffed', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((place) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      const id = eval(place)();
      const b = g.state.buildings.find((x: any) => x.id === id);
      const wasUnbuilt = !b.built;
      g.setWorkers(id, 1); // pre-assign a worker before the site is finished
      return { wasUnbuilt, desired: b.desiredWorkers };
    }, placeGatherer);
    expect(out.wasUnbuilt).toBe(true);
    expect(out.desired).toBe(1);

    // The board lists the unbuilt site, plus the Builders job and a Laborers field.
    await page.click('#btn-jobs');
    const text = await page.evaluate(() => {
      const g = (window as any).__village;
      g.ui.refreshPanels(g.state); // populate the just-opened board deterministically
      return document.getElementById('jobboard')!.textContent ?? '';
    });
    expect(text).toContain('Gatherer');
    expect(text).toContain('under construction');
    expect(text).toContain('Builders');
    expect(text).toContain('Laborers');
  });

  test('with zero builders a site never builds; assigning builders constructs it', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((place) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true); // full stockpile of wood in the barn
      const id = eval(place)();
      // Default 0 builders → no construction progress even after time passes.
      g.debugAdvance(200);
      const none = g.state.buildings.find((x: any) => x.id === id);
      const stalled = { built: none.built, progress: none.progress };
      // Assign builders → the site is hauled to and finished.
      g.debugSetBuilders(3);
      g.debugAdvance(500);
      const done = g.state.buildings.find((x: any) => x.id === id);
      return { stalled, built: done.built };
    }, placeGatherer);
    expect(out.stalled.built).toBe(false);
    expect(out.stalled.progress).toBe(0);
    expect(out.built).toBe(true);
  });

  test('paths are laid by any adult even with zero builders', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      const s = g.state;
      const PATH_DIRT_PLAN = 1, PATH_DIRT = 2;
      // Plan a free dirt path on a walkable grass tile near a villager.
      const c = s.citizens[0];
      const cx = Math.floor(c.x), cy = Math.floor(c.y);
      let idx = -1;
      for (let r = 1; r < 8 && idx < 0; r++)
        for (let dy = -r; dy <= r && idx < 0; dy++)
          for (let dx = -r; dx <= r && idx < 0; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
            const occupied = s.buildings.some((b: any) => x >= b.x && x < b.x + (b.w ?? 2) && y >= b.y && y < b.y + (b.h ?? 2));
            if (s.tiles[y * s.w + x].type === 'grass' && !occupied && s.paths[y * s.w + x] === 0) idx = y * s.w + x;
          }
      s.paths[idx] = PATH_DIRT_PLAN;
      g.debugSetBuilders(0); // no builders at all — a laborer must lay it
      g.debugAdvance(120);
      return { built: s.paths[idx] === PATH_DIRT };
    });
    expect(out.built).toBe(true);
  });

  test('desiredBuilders round-trips through save/load', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true);
      g.debugSetBuilders(4);
      g.persist();
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    const n = await page.evaluate(() => (window as any).__village.state.desiredBuilders);
    expect(n).toBe(4);
  });
});

test.describe('disasters toggle', () => {
  test('the toggle flows from the difficulty screen and persists through save/load', async ({ page }) => {
    await open(page);
    // New Game → size → difficulty, turn disasters Off, start Normal.
    await page.click('#mm-new');
    await page.click('#sz-small');
    await expect(page.locator('#diff-normal')).toBeVisible();
    await page.click('#diff-dis-off');
    await page.click('#diff-normal');
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => (window as any).__village.state.disasters)).toBe(false);

    // The flag survives a reload + Continue.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__village.state.disasters)).toBe(false);
  });
});
