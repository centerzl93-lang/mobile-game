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
    // Normal: no houses, and no building materials at all — wood and stone must be gathered.
    expect(d.normal.houses).toBe(0);
    expect(d.normal.store.wood ?? 0).toBe(0);
    expect(d.normal.store.stone ?? 0).toBe(0);
    expect(d.normal.store.medicine ?? 0).toBe(0);
    expect(d.normal.store.coal ?? 0).toBe(0);
    expect(d.normal.store.firewood).toBe(300);
    // Hard: no wood or stone either, and half of everything else Normal gets.
    expect(d.hard.store.wood ?? 0).toBe(0);
    expect(d.hard.store.stone ?? 0).toBe(0);
    expect(d.hard.store.firewood).toBe(150);
    expect(d.hard.store.tools).toBe(90);
    expect(d.hard.store.grain).toBe(d.normal.store.grain / 2);
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
      // Normal starts with no building materials, and this test is about *seeds*, not
      // affordability — stock the timber a field costs so placement isn't the thing that fails.
      const barn0 = s.buildings.find((b: any) => b.type === 'barn');
      barn0.store.wood = (barn0.store.wood ?? 0) + 200;
      const farm = place('farm');
      const out: any = { placed: farm != null, seedCount: s.seeds.length, farmCrop: farm && farm.crop };
      if (farm) { farm.built = true; farm.progress = 99; g.inspectSel = { kind: 'building', id: farm.id }; g.refreshInspect(); const el = document.getElementById('inspect')!; out.text = el.innerText; out.toggleBtns = el.querySelectorAll('.jr-toggle button').length; }
      return out;
    });
    expect(res.placed).toBe(true);
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
      // No fires: this measures breeding over two seasons, and a fire taking the pen leaves the
      // test holding a detached building whose herd never grows.
      s.disasters = false;
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
  // Searches the whole map, not just a radius around the barn: a gatherer needs forest nearby, and
  // on an unlucky map there is none within 16 tiles. Returning null there made every test using
  // this helper dereference undefined and fail at random.
  const placeGatherer = `() => {
    const g = window.__village;
    const s = g.state;
    const barn = s.buildings.find((b) => b.type === 'barn');
    for (let r = 2; r < Math.max(s.w, s.h); r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = barn.x + dx, y = barn.y + dy;
          if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
          if (g.debugCanPlace('gatherer', x, y).ok) {
            const id = g.debugPlace('gatherer', x, y);
            if (id != null) return id;
          }
        }
    throw new Error('no placeable gatherer site anywhere on this map');
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
    // An unbuilt site reads as "under construction", or "clearing land" when trees or loose stone
    // still sit under its footprint. Either proves the unbuilt site is listed.
    expect(text).toMatch(/under construction|clearing land/);
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

test.describe('available workers count', () => {
  // The HUD chip that used to show this was removed; the count now lives on the job board, which
  // is where the player assigns workers anyway. The rule under test is unchanged: children have
  // no job but cannot work, so they must not be counted as available labour.
  test('the job board counts free laborers as adults only, never children', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', true));
    await page.click('#btn-jobs');
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      const ADULT_AGE = 4;
      const s = g.state;
      g.ui.refreshPanels(s); // populate the just-opened board deterministically
      const line = [...document.querySelectorAll('#jobboard .summary')]
        .map((e) => e.textContent ?? '')
        .find((t) => t.includes('Laborers')) ?? '';
      return {
        shown: Number(line.replace(/[^0-9]/g, '')),
        adults: s.citizens.filter((c: any) => c.age >= ADULT_AGE).length,
        children: s.citizens.filter((c: any) => c.age < ADULT_AGE).length,
        // The unfiltered pool (the old, buggy count) would include the jobless children.
        joblessPool: s.citizens.filter((c: any) => c.jobId === null && !c.builder).length,
      };
    });
    expect(out.children).toBeGreaterThan(0);
    expect(out.shown).toBe(out.adults);
    expect(out.joblessPool).toBe(out.adults + out.children);
    expect(out.shown).toBeLessThan(out.joblessPool);
  });
});

test.describe('fireproof buildings', () => {
  test('barns (and wells) never catch fire, unlike houses', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true); // 3 houses + a barn, no wells nearby to douse
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      const house = s.buildings.find((b: any) => b.type === 'house');
      g.debugIgnite(barn.id);
      const barnBurning = !!barn.fireTimer;
      g.debugIgnite(house.id);
      const houseBurning = !!house.fireTimer;
      return { barnBurning, houseBurning };
    });
    expect(out.barnBurning).toBe(false);
    expect(out.houseBurning).toBe(true);
  });
});

test.describe('clearing land before building', () => {
  // Find a spot near the barn where a fresh barn can be placed; returns [x,y] or [-1,-1].
  // Searches the whole map and fails loudly. Returning a sentinel [-1,-1] when no site was found
  // within a fixed radius made callers index off the edge of the tile array at random.
  const findSpot = `(g) => {
    const s = g.state;
    const barn = s.buildings.find((b) => b.type === 'barn');
    for (let r = 2; r < Math.max(s.w, s.h); r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = barn.x + dx, y = barn.y + dy;
          if (x < 0 || y < 0 || x >= s.w - 1 || y >= s.h - 1) continue;
          if (g.debugCanPlace('barn', x, y).ok) return [x, y];
        }
    throw new Error('no placeable barn site anywhere on this map');
  }`;

  test('trees under a footprint are marked, gate construction, then get cleared', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((findSpotSrc) => {
      const g = (window as any).__village;
      const HARVEST_WOOD = 1;
      g.startNewGame('small', 'easy', true); // full wood stockpile in the barn
      const s = g.state;
      const [px, py] = eval(findSpotSrc)(g);
      // Plant trees across the whole 2×2 footprint before placing. Trees and loose stone are
      // mutually exclusive per tile in the real map, so clear any seeded stone as we do it.
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const t = s.tiles[(py + dy) * s.w + (px + dx)];
          t.type = 'forest';
          t.trees = 0.3;
          t.stone = 0;
        }
      const id = g.debugPlace('barn', px, py);
      const b = s.buildings.find((x: any) => x.id === id);
      // Placement marks every treed footprint tile for harvesting.
      let marked = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          if (s.harvest[(py + dy) * s.w + (px + dx)] === HARVEST_WOOD) marked++;
      const treesLeft = () => {
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const t = s.tiles[(py + dy) * s.w + (px + dx)];
            if (t.type === 'forest' && t.trees > 0.05) return true;
          }
        return false;
      };
      // Drive the workforce; construction must not progress while any trees remain.
      g.debugSetBuilders(6);
      let violated = false;
      for (let step = 0; step < 160 && !b.built; step++) {
        g.debugAdvance(5);
        if (treesLeft() && b.progress > 0) violated = true;
      }
      return { placed: id != null, marked, violated, cleared: !treesLeft(), built: b.built };
    }, findSpot);
    expect(out.placed).toBe(true);
    expect(out.marked).toBe(4);
    expect(out.violated).toBe(false);
    expect(out.cleared).toBe(true);
    expect(out.built).toBe(true);
  });

  test('loose stone under a footprint is marked for harvest', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((findSpotSrc) => {
      const g = (window as any).__village;
      const HARVEST_STONE = 2;
      g.startNewGame('small', 'easy', true);
      const s = g.state;
      const [px, py] = eval(findSpotSrc)(g);
      // Scatter loose stone on the footprint (the tiles stay grass — stone is a surface deposit).
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) s.tiles[(py + dy) * s.w + (px + dx)].stone = 10;
      const id = g.debugPlace('barn', px, py);
      let marked = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          if (s.harvest[(py + dy) * s.w + (px + dx)] === HARVEST_STONE) marked++;
      return { placed: id != null, marked };
    }, findSpot);
    expect(out.placed).toBe(true);
    expect(out.marked).toBe(4);
  });
});

test.describe('camera rotate buttons', () => {
  // These assert the *mechanism* (a held button turns the view a bit more on every animation
  // frame) rather than a wall-clock turn rate: headless Chromium schedules rAF slowly and
  // irregularly, so "hold 600ms ⇒ turned 0.47rad" is inherently flaky here.

  /** Resolve once `n` more animation frames have run on the page. */
  function frames(page: Page, n: number): Promise<void> {
    return page.evaluate(
      (count) =>
        new Promise<void>((res) => {
          let i = 0;
          const tick = () => (++i >= count ? res() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
      n,
    );
  }

  /** Press and hold the centre of a rotate button (caller releases with `page.mouse.up`). */
  async function press(page: Page, selector: string): Promise<void> {
    const box = (await page.locator(selector).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  }

  test('holding a top-corner button turns the 3D view continuously, and releasing stops it', async ({ page }) => {
    await open(page); // default 3D camera (no ?2d)
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', true));
    const yaw = () => page.evaluate(() => (window as any).__village.camera.yaw);
    const dir = () => page.evaluate(() => (window as any).__village.rotateDir);

    // Pressing latches the direction; the old behaviour jumped a fixed step and latched nothing.
    await press(page, '#btn-rot-right');
    expect(await dir()).toBe(1);

    // The view keeps turning the same way frame after frame while the button stays down.
    const a = await yaw();
    await frames(page, 3);
    const b = await yaw();
    await frames(page, 3);
    const c = await yaw();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);

    // Releasing unlatches and the view comes to rest instead of spinning on.
    await page.mouse.up();
    expect(await dir()).toBe(0);
    const rest = await yaw();
    await frames(page, 4);
    expect(await yaw()).toBeCloseTo(rest, 6);
  });

  test('the two buttons turn the view opposite ways', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', true));
    const yaw = () => page.evaluate(() => (window as any).__village.camera.yaw);

    // ↻ (right) increases yaw; ↺ (left) decreases it. Yaw runs +Z→+X and the camera orbits
    // opposite to the apparent scene motion, so a falling yaw reads as the village turning
    // counter-clockwise — matching the ↺ glyph.
    await press(page, '#btn-rot-right');
    const r0 = await yaw();
    await frames(page, 3);
    const r1 = await yaw();
    await page.mouse.up();
    expect(r1).toBeGreaterThan(r0);

    await press(page, '#btn-rot-left');
    const l0 = await yaw();
    await frames(page, 3);
    const l1 = await yaw();
    await page.mouse.up();
    expect(l1).toBeLessThan(l0);
  });
});

test.describe('inspect sheet close button', () => {
  test('the × drops the selection instead of the sheet reopening on the next frame', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', true));
    await page.evaluate(() => {
      const g = (window as any).__village;
      const barn = g.state.buildings.find((b: any) => b.type === 'barn');
      g.inspectSel = { kind: 'building', id: barn.id };
      g.refreshInspect();
    });
    await expect(page.locator('#inspect')).toBeVisible();

    await page.click('#insp-close');
    // The frame loop re-renders the sheet every frame while a selection is live, which is what
    // made the × look dead; wait several frames to prove it now stays shut.
    await page.waitForTimeout(300);
    await expect(page.locator('#inspect')).toBeHidden();
    expect(await page.evaluate(() => (window as any).__village.inspectSel)).toBeNull();
  });

  test('switching to another tool also drops the selection', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', true));
    await page.evaluate(() => {
      const g = (window as any).__village;
      const barn = g.state.buildings.find((b: any) => b.type === 'barn');
      g.inspectSel = { kind: 'building', id: barn.id };
      g.refreshInspect();
    });
    await expect(page.locator('#inspect')).toBeVisible();
    await page.click('.tool-btn[data-tool="demolish"]');
    await page.waitForTimeout(300);
    await expect(page.locator('#inspect')).toBeHidden();
    expect(await page.evaluate(() => (window as any).__village.inspectSel)).toBeNull();
  });
});

test.describe('hint bar layering', () => {
  test('the hint stays visible and clear of the build pop-out', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', true));
    await page.click('.tool-btn[data-tool="housing"]');
    await page.locator('.build-btn').first().click();
    await expect(page.locator('#hint')).toBeVisible();

    const geo = await page.evaluate(() => {
      const h = document.getElementById('hint')!.getBoundingClientRect();
      const p = document.getElementById('popout')!.getBoundingClientRect();
      const mid = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2);
      return { hintBottom: h.bottom, popoutTop: p.top, topmostAtHintCentre: (mid as HTMLElement | null)?.id ?? '' };
    });
    // Sits above the pop-out rather than overlapping it, and nothing is painted over it.
    expect(geo.hintBottom).toBeLessThanOrEqual(geo.popoutTop);
    expect(geo.topmostAtHintCentre).toBe('hint');
  });
});

test.describe('top-line HUD', () => {
  test('carries one chip per headline resource and nothing else', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', true));
    const icons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#stat-resources .stat .ico')).map((e) => e.textContent),
    );
    // The 🍽️ food aggregate, then the eight headline resources in display order. Leather and the
    // livestock herds are deliberately absent — they crowded the line and live in the barn sheet.
    expect(icons).toEqual(['🍽️', '🪵', '🪨', '🔩', '⚫', '🛠️', '🧥', '💊', '🔥']);
  });

  test('the season chip names which third of the season it is', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', true));
    // Pin the season to Autumn and sample the HUD at each third (seasons run 600s).
    const labelAt = (seasonTimer: number) =>
      page.evaluate((t) => {
        const g = (window as any).__village;
        g.state.season = 2; // Autumn
        g.state.seasonTimer = t;
        g.ui.updateHud(g.state, 1, false);
        return document.querySelector('#stat-season .val')!.textContent;
      }, seasonTimer);

    expect(await labelAt(10)).toBe('Early Autumn · Yr 1');
    expect(await labelAt(300)).toBe('Autumn · Yr 1');
    expect(await labelAt(560)).toBe('Late Autumn · Yr 1');
  });
});

test.describe('household larders', () => {
  test('residents stock their own house with food, firewood and medicine', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false); // easy starts with houses and a full stockpile
      const s = g.state;
      // Long enough for each household's shopper to run its trips to the barns and back.
      for (let i = 0; i < 2400; i++) g.debugAdvance(0.1);
      const FOODS = ['fruit', 'grain', 'corn', 'potato', 'rice', 'barley', 'carrot', 'tomato', 'onion',
        'pepper', 'cabbage', 'beans', 'pumpkin', 'apple', 'grapes', 'strawberry', 'melon', 'eggs', 'fish', 'meat'];
      return s.buildings
        .filter((b: any) => b.type === 'house' && b.built)
        .map((h: any) => ({
          adults: s.citizens.filter((c: any) => c.homeId === h.id && c.age >= 4).length,
          food: FOODS.reduce((n: number, k: string) => n + (h.store[k] ?? 0), 0),
          firewood: h.store.firewood ?? 0,
          medicine: h.store.medicine ?? 0,
        }));
    });
    // Every household with an adult to run the errands ends up stocked. Targets are per resident
    // (HOUSE_LARDER_SEASONS = 0.5 ⇒ 30 food and 20 firewood each, 2 medicine each).
    const staffed = out.filter((h: any) => h.adults > 0);
    expect(staffed.length).toBeGreaterThan(0);
    for (const h of staffed) {
      expect(h.food).toBeGreaterThan(0);
      expect(h.firewood).toBeGreaterThan(0);
      expect(h.medicine).toBeGreaterThan(0);
    }
  });

  test('larder stock is excluded from the top-line HUD', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const FOODS = ['fruit', 'grain', 'corn', 'potato', 'rice', 'barley', 'carrot', 'tomato', 'onion',
        'pepper', 'cabbage', 'beans', 'pumpkin', 'apple', 'grapes', 'strawberry', 'melon', 'eggs', 'fish', 'meat'];
      const barnFood = () =>
        s.buildings
          .filter((b: any) => b.built && (b.type === 'barn' || b.type === 'market'))
          .reduce((n: number, b: any) => n + FOODS.reduce((m: number, k: string) => m + (b.store[k] ?? 0), 0), 0);
      const house = s.buildings.find((b: any) => b.type === 'house' && b.built);
      house.store.grain = (house.store.grain ?? 0) + 500; // park 500 food in a larder
      g.ui.updateHud(s, 1, false);
      const chip = document.querySelector('#stat-resources .stat .val')!.textContent;
      return { chip, barnFood: Math.floor(barnFood()) };
    });
    // The chip reports what is *free* in the barns; the 500 committed to a household is not counted.
    expect(out.chip).toBe(String(out.barnFood));
  });

  test('villagers eat and heat from their own larder before the barns', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 60; i++) g.debugAdvance(0.1); // assign homes
      const house = s.buildings
        .filter((b: any) => b.type === 'house' && b.built)
        .map((b: any) => ({ b, adults: s.citizens.filter((c: any) => c.homeId === b.id && c.age >= 4).length }))
        .sort((x: any, y: any) => y.adults - x.adults)[0];
      // Barns hold nothing, so anything consumed must have come out of the larder. Only this
      // household remains, so no *other* villager's shortfall can take its residents down with it.
      s.citizens = s.citizens.filter((c: any) => c.homeId === house.b.id);
      // And every other house, so rehousing (which now runs every couple of seconds) can't move a
      // surplus adult out of the stocked household into an empty one with no larder.
      s.buildings = s.buildings.filter(
        (b: any) => b.id === house.b.id || (b.type !== 'house' && b.type !== 'stonehouse'),
      );
      // Clothing is village-wide, not a larder item, so leave it stocked — otherwise winter
      // illness for the unclothed would confound what we're measuring (food and fuel).
      for (const b of s.buildings) if (b.type === 'barn' || b.type === 'market') b.store = { clothing: 1e6 };
      house.b.store = { grain: 1000, firewood: 1000 };
      s.season = 2; // crossing the boundary from Autumn enters Winter, the heaviest draw
      s.seasonTimer = 0;
      const before = { grain: house.b.store.grain, firewood: house.b.store.firewood };
      const residentIds = s.citizens.map((c: any) => c.id);
      g.debugAdvance(610);
      const alive = new Set(s.citizens.map((c: any) => c.id));
      return {
        residents: residentIds.length,
        // Survivors by id — the household may also gain a newborn, which is not a death.
        survivors: residentIds.filter((id: number) => alive.has(id)).length,
        ateFromLarder: before.grain - (house.b.store.grain ?? 0),
        burnedFromLarder: before.firewood - (house.b.store.firewood ?? 0),
      };
    });
    expect(out.ateFromLarder).toBeGreaterThan(0);
    expect(out.burnedFromLarder).toBeGreaterThan(0);
    // A stocked household rides out a season that leaves the barns bare — nobody starves or freezes.
    expect(out.survivors).toBe(out.residents);
  });

  test('a shortage takes the villagers who went without, not a stocked household', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
      const houses = s.buildings
        .filter((b: any) => b.type === 'house' && b.built)
        .map((b: any) => ({ b, residents: s.citizens.filter((c: any) => c.homeId === b.id) }))
        .filter((h: any) => h.residents.length > 0);
      // One household keeps a full larder; the barns are emptied so every other house goes hungry.
      const stocked = houses[0];
      // Trim the stocked house to its couple. Households are settled every couple of seconds now,
      // so any *surplus* adult there would be moved out mid-season — into a house with no larder,
      // where they would starve, and the test would read that as the larder having failed.
      const stockedAdults = stocked.residents.filter((c: any) => c.age >= 4);
      const keepM = stockedAdults.find((c: any) => c.sex === 'm');
      const keepF = stockedAdults.find((c: any) => c.sex === 'f');
      const surplus = new Set(
        stockedAdults.filter((c: any) => c !== keepM && c !== keepF).map((c: any) => c.id),
      );
      s.citizens = s.citizens.filter((c: any) => !surplus.has(c.id));
      stocked.residents = stocked.residents.filter((c: any) => !surplus.has(c.id));
      // Clothing is village-wide, not a larder item, so leave it stocked — otherwise winter
      // illness for the unclothed would confound what we're measuring (food and fuel).
      for (const b of s.buildings) if (b.type === 'barn' || b.type === 'market') b.store = { clothing: 1e6 };
      for (const h of houses) h.b.store = {};
      stocked.b.store = { grain: 1e6, firewood: 1e6 };
      const stockedIds = stocked.residents.map((c: any) => c.id);
      s.season = 2; // enter Winter
      s.seasonTimer = 0;
      g.debugAdvance(610);
      const alive = new Set(s.citizens.map((c: any) => c.id));
      return {
        stockedCount: stockedIds.length,
        stockedAlive: stockedIds.filter((id: number) => alive.has(id)).length,
        otherCount: s.citizens.length,
        died: 12 - s.citizens.length,
      };
    });
    expect(out.died).toBeGreaterThan(0); // the unstocked households did suffer
    expect(out.stockedAlive).toBe(out.stockedCount); // but not the one that kept a larder
  });
});

test.describe('seasonal firewood and clothing burn', () => {
  /**
   * Firewood drawn by one household over a single season turnover. `endSeason` advances the season
   * and *then* bills for it, so `fromSeason` is the season before the one being measured.
   * The household holds all the food and fuel and the barns hold none, so the figure is purely
   * this household's heating and nothing can refill mid-measurement.
   */
  async function burnEntering(page: Page, fromSeason: number, dressed: boolean) {
    return page.evaluate(
      ({ fromSeason, dressed }) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', false);
        const s = g.state;
        for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
        const picked = s.buildings
          .filter((b: any) => b.type === 'house' && b.built)
          .map((b: any) => ({ b, adults: s.citizens.filter((c: any) => c.homeId === b.id && c.age >= 4).length }))
          .sort((x: any, y: any) => y.adults - x.adults)[0];
        // Reduce the village to this one household so no other consumption is in the figure, and
        // put everyone at a settled adult age. Otherwise entering Spring rolls the year over,
        // children come of age and are rehoused *before* consumption is billed, and the per-head
        // figure is computed against a household that no longer has those residents.
        s.citizens = s.citizens.filter((c: any) => c.homeId === picked.b.id);
        for (const c of s.citizens) c.age = 25;
        // Take away every other house too. Households are now settled every couple of seconds, so
        // any spare house is somewhere a surplus adult would move to — out of the household being
        // measured, and into one with no larder.
        s.buildings = s.buildings.filter(
          (b: any) => b.id === picked.b.id || (b.type !== 'house' && b.type !== 'stonehouse'),
        );
        for (const b of s.buildings) {
          if (b.type === 'barn' || b.type === 'market') b.store = dressed ? { clothing: 1e6 } : {};
        }
        picked.b.store = { firewood: 1e6, grain: 1e6 };
        s.season = fromSeason;
        s.seasonTimer = 0;
        const fw0 = picked.b.store.firewood;
        // Captured *before* the turnover: consumption bills whoever lives here at that moment, and
        // `rehouseVillagers` then moves surplus adults out to the houses this setup just emptied.
        // Counting residents afterwards undercounts the denominator and inflates the per-head figure.
        const residents = s.citizens.filter((c: any) => c.homeId === picked.b.id);
        g.debugAdvance(610);
        const burned = fw0 - (picked.b.store.firewood ?? 0);
        return {
          adults: residents.filter((c: any) => c.age >= 4).length,
          children: residents.filter((c: any) => c.age < 4).length,
          clothed: residents.filter((c: any) => c.clothed).length,
          burned,
          // Normalised per head: each measurement run regenerates the map, so the chosen household
          // can differ in size between runs and the raw totals are not directly comparable.
          perResident: residents.length > 0 ? burned / residents.length : 0,
        };
      },
      { fromSeason, dressed },
    );
  }

  test('firewood burns year-round: winter heaviest, summer lightest', async ({ page }) => {
    await open(page);
    // Seasons index Spring0 Summer1 Autumn2 Winter3; pass the season *before* the one measured.
    const winter = await burnEntering(page, 2, true);
    const spring = await burnEntering(page, 3, true);
    const summer = await burnEntering(page, 0, true);
    const autumn = await burnEntering(page, 1, true);

    // Used in every season, never zero — the old model only charged for winter.
    for (const r of [winter, spring, summer, autumn]) expect(r.burned).toBeGreaterThan(0);
    // Winter > spring/autumn > summer, with the shoulder seasons matched. Compared per head, since
    // each run regenerates the map and the household picked can differ in size.
    expect(winter.perResident).toBeGreaterThan(spring.perResident);
    expect(spring.perResident).toBeCloseTo(autumn.perResident, 5);
    expect(autumn.perResident).toBeGreaterThan(summer.perResident);
  });

  test('a clothed villager burns less firewood than an unclothed one', async ({ page }) => {
    await open(page);
    const dressed = await burnEntering(page, 3, true);
    const undressed = await burnEntering(page, 3, false);
    expect(dressed.clothed).toBe(dressed.adults + dressed.children);
    expect(undressed.clothed).toBe(0);
    // CLOTHED_HEAT_FACTOR = 0.75, compared per head for the reason above.
    expect(dressed.perResident).toBeCloseTo(undressed.perResident * 0.75, 5);
  });
});

test.describe('villager breeding', () => {
  /** HOUSING_PER_HOUSE — a plain house shelters this many (one couple plus their children). */
  const houseCapacityForTest = 8;

  /**
   * Run `seasons` season turnovers under deliberately generous conditions — spare housing, barns
   * kept full, disasters off — so what the run measures is the breeding rules and not famine,
   * fire or plague.
   */
  async function growUnderIdealConditions(page: Page, seasons: number, extraHouses = 10) {
    return page.evaluate(
      ({ seasons, extraHouses }) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', false);
        const s = g.state;
        for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
        const barn = s.buildings.find((b: any) => b.type === 'barn');
        let added = 0;
        for (let r = 3; r < 20 && added < extraHouses; r++)
          for (let dy = -r; dy <= r && added < extraHouses; dy++)
            for (let dx = -r; dx <= r && added < extraHouses; dx++) {
              const id = g.debugCanPlace('house', barn.x + dx, barn.y + dy).ok
                ? g.debugPlace('house', barn.x + dx, barn.y + dy)
                : null;
              if (id != null) {
                const h = s.buildings.find((b: any) => b.id === id);
                h.built = true;
                h.progress = 9999;
                added++;
              }
            }
        const startPop = s.citizens.length;
        for (let n = 0; n < seasons; n++) {
          for (const b of s.buildings) {
            if (b.type !== 'barn') continue;
            for (const k of ['grain', 'fruit', 'meat', 'fish', 'eggs']) b.store[k] = 1e5;
            for (const k of ['clothing', 'firewood', 'medicine', 'tools']) b.store[k] = 1e5;
          }
          g.debugAdvance(610);
          if (s.gameOver) break;
        }
        const houses = s.buildings.filter((b: any) => b.built && b.type === 'house');
        const byId = new Map(s.citizens.map((c: any) => [c.id, c]));
        const kin = (a: any, b: any) =>
          (a.parents && b.parents && a.parents.some((i: number) => b.parents.includes(i))) ||
          a.parents?.includes(b.id) ||
          b.parents?.includes(a.id);

        let brokenLinks = 0;
        let couplesLivingApart = 0;
        let kinPairs = 0;
        let partnered = 0;
        for (const c of s.citizens as any[]) {
          if (c.partnerId == null) continue;
          const p: any = byId.get(c.partnerId);
          if (!p || p.partnerId !== c.id) {
            brokenLinks++;
            continue;
          }
          partnered++;
          if (p.homeId !== c.homeId) couplesLivingApart++;
          if (kin(c, p)) kinPairs++;
        }
        // A house should never be home to two separate couples.
        const housesWithTwoCouples = houses.filter((h: any) => {
          const adults = s.citizens.filter((c: any) => c.homeId === h.id && c.age >= 4);
          const pairs = new Set<string>();
          for (const a of adults as any[]) {
            if (a.partnerId != null && adults.some((o: any) => o.id === a.partnerId)) {
              pairs.add([a.id, a.partnerId].sort().join('-'));
            }
          }
          return pairs.size > 1;
        }).length;
        const children = s.citizens.filter((c: any) => c.age < 4 && c.parents);
        const childrenWithAParent = children.filter((c: any) =>
          s.citizens.some((p: any) => c.parents.includes(p.id) && p.homeId === c.homeId),
        ).length;
        // Every child — founding children and orphans included — must live with a grown-up.
        const allChildren = s.citizens.filter((c: any) => c.age < 4);
        const childrenWithNoAdultAtHome = allChildren.filter(
          (c: any) => !s.citizens.some((o: any) => o.homeId === c.homeId && o.age >= 4),
        ).length;
        const homelessChildren = allChildren.filter((c: any) => c.homeId === null).length;
        const childrenPerHouse = houses.map(
          (h: any) => s.citizens.filter((c: any) => c.homeId === h.id && c.age < 4).length,
        );
        const singles = s.citizens.filter((c: any) => c.age >= 4 && c.partnerId == null);
        // Houses that hold a resident couple — only these are households that can bear children.
        const households = houses.filter((h: any) => {
          const adults = s.citizens.filter((c: any) => c.homeId === h.id && c.age >= 4);
          return adults.some((a: any) => a.partnerId != null && adults.some((o: any) => o.id === a.partnerId));
        }).length;

        return {
          addedHouses: added,
          startPop,
          endPop: s.citizens.length,
          years: s.year,
          couples: partnered / 2,
          households,
          couplesAwaitingAHome: partnered / 2 - households,
          singleAdults: singles.length,
          // Singles who *could* have paired: someone of the opposite sex, also single, not kin.
          // Leftovers with no eligible match (an odd sex balance, or only siblings left) are fine.
          pairableSinglesLeft: singles.filter((a: any) =>
            singles.some((b: any) => b.id !== a.id && b.sex !== a.sex && !kin(a, b)),
          ).length,
          housingPrompt: (s.events ?? []).find((e: any) => e.text.includes('waiting for a home'))?.text ?? '',
          brokenLinks,
          couplesLivingApart,
          kinPairs,
          housesWithTwoCouples,
          children: children.length,
          childrenWithAParent,
          allChildren: allChildren.length,
          childrenWithNoAdultAtHome,
          homelessChildren,
          maxChildrenInOneHouse: Math.max(0, ...childrenPerHouse),
          // Adults per household, to check rehousing settled them into couples.
          adultsPerHouse: houses
            .map((h: any) => s.citizens.filter((c: any) => c.homeId === h.id && c.age >= 4).length)
            .filter((n: number) => n > 0),
        };
      },
      { seasons, extraHouses },
    );
  }

  test('the village grows when it has housing, food and good spirits', async ({ page }) => {
    test.setTimeout(120_000); // simulating whole years tick-by-tick is not quick
    await open(page);
    const out = await growUnderIdealConditions(page, 12); // 3 years
    expect(out.addedHouses).toBe(10);
    expect(out.startPop).toBe(12);
    // Previously this sat dead flat at the founding 12: every starter house held four adults, so no
    // household ever had room for a child, and grown children never moved out to form new ones.
    expect(out.endPop).toBeGreaterThan(out.startPop * 1.5);
  });

  test('households settle into one couple with room for their children', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const out = await growUnderIdealConditions(page, 12);

    // A household is one couple plus their children. With spare houses to move into, no house
    // should be left holding a third adult, and none should hold two separate couples.
    for (const n of out.adultsPerHouse) expect(n).toBeLessThanOrEqual(2);
    expect(out.housesWithTwoCouples).toBe(0);

    // Partnerships are mutual, and a couple always shares a home.
    expect(out.couples).toBeGreaterThan(0);
    expect(out.brokenLinks).toBe(0);
    expect(out.couplesLivingApart).toBe(0);

    // Nobody pairs with a sibling or a parent — which is what would happen if two grown children
    // still waiting for a house of their own were simply matched by sex.
    expect(out.kinPairs).toBe(0);

    // Children live with their parents until they come of age.
    expect(out.children).toBeGreaterThan(0);
    expect(out.childrenWithAParent).toBe(out.children);
  });

  test('every child lives with an adult, and children are spread across households', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const out = await growUnderIdealConditions(page, 12);

    // The founding children have no recorded parents. They used to be dropped into whichever house
    // came first in the list — all four together, in a house with no adult in it, which then never
    // became a household and never grew. Neither is allowed now.
    expect(out.allChildren).toBeGreaterThan(0);
    expect(out.childrenWithNoAdultAtHome).toBe(0);
    expect(out.homelessChildren).toBe(0);

    // And no single house hoards them while other households sit childless.
    expect(out.maxChildrenInOneHouse).toBeLessThanOrEqual(houseCapacityForTest - 2);
  });

  test('children still live with an adult when housing is tight', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const out = await growUnderIdealConditions(page, 16, 0); // only the starter houses
    expect(out.allChildren).toBeGreaterThan(0);
    expect(out.childrenWithNoAdultAtHome).toBe(0);
    expect(out.homelessChildren).toBe(0);
  });

  test('with no spare housing adults still pair up, silently', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    // Same generous conditions, but *no* extra houses: the only limit is somewhere to live.
    const out = await growUnderIdealConditions(page, 12, 0);
    expect(out.addedHouses).toBe(0);

    // Villagers pair off anyway rather than waiting for a house to become free. Anyone still
    // single has no eligible match left (an odd sex balance, or only siblings remaining).
    expect(out.couples).toBeGreaterThan(0);
    expect(out.pairableSinglesLeft).toBe(0);
    expect(out.kinPairs).toBe(0);
    expect(out.brokenLinks).toBe(0);

    // More couples than houses that hold a household ⇒ some have no home of their own, and only a
    // household bears children, so the shortage is what caps growth.
    expect(out.couples).toBeGreaterThan(out.households);
    expect(out.couplesAwaitingAHome).toBeGreaterThan(0);

    // The game does not say so. Working out that houses are the bottleneck is the player's job —
    // the state is discoverable on a villager's own sheet, but nothing announces it.
    expect(out.housingPrompt).toBe('');
  });

  test('no births while the village has under a season of food banked', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
      const startPop = s.citizens.length;
      for (let n = 0; n < 8; n++) {
        // Just enough to eat, never a surplus — plus fuel and clothing so nobody dies either.
        for (const b of s.buildings) {
          if (b.type !== 'barn' && b.type !== 'market') continue;
          b.store = { clothing: 1e5, firewood: 1e5, tools: 1e5 };
        }
        for (const h of s.buildings) if (h.type === 'house') h.store = { grain: 400, firewood: 1e4 };
        g.debugAdvance(610);
        if (s.gameOver) break;
      }
      return { startPop, endPop: s.citizens.length, born: s.citizens.filter((c: any) => c.age < 1).length };
    });
    expect(out.born).toBe(0);
    expect(out.endPop).toBeLessThanOrEqual(out.startPop);
  });

  test('villagers past the fertile window stop bearing children', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
      // Age every adult past FERTILE_MAX_AGE (34) but short of OLD_AGE_START deaths mattering.
      for (const c of s.citizens) c.age = 34.5;
      const startPop = s.citizens.length;
      for (let n = 0; n < 4; n++) {
        for (const b of s.buildings) {
          if (b.type !== 'barn') continue;
          for (const k of ['grain', 'fruit', 'meat', 'clothing', 'firewood', 'tools']) b.store[k] = 1e5;
        }
        g.debugAdvance(610);
        if (s.gameOver) break;
      }
      return { startPop, newborns: s.citizens.filter((c: any) => c.age < 1).length };
    });
    expect(out.newborns).toBe(0);
  });
});

test.describe('paths and placement', () => {
  test('a path cannot be planned under a building', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // A tile squarely inside the barn's footprint, and one clear of every building.
      const onBarn = g.debugPlanPath('dirt', barn.x, barn.y);
      let free: { x: number; y: number } | null = null;
      for (let r = 3; r < 15 && !free; r++)
        for (let dy = -r; dy <= r && !free; dy++)
          for (let dx = -r; dx <= r && !free; dx++) {
            const x = barn.x + dx, y = barn.y + dy;
            const t = s.tiles[y * s.w + x];
            const covered = s.buildings.some((b: any) =>
              x >= b.x && x < b.x + (b.w ?? 2) && y >= b.y && y < b.y + (b.h ?? 2));
            if (t && t.type === 'grass' && !covered) free = { x, y };
          }
      const onFree = free ? g.debugPlanPath('dirt', free.x, free.y) : null;
      return { onBarn, onFree };
    });
    expect(out.onBarn).toBe(false); // refused: the barn's tile is not available
    expect(out.onFree).toBe(true); // control — open ground still accepts a path
  });

  test('placing a building over a path tears the path up', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // Find somewhere a house fits, lay dirt path across its whole footprint, then build there.
      let spot: { x: number; y: number } | null = null;
      for (let r = 3; r < 18 && !spot; r++)
        for (let dy = -r; dy <= r && !spot; dy++)
          for (let dx = -r; dx <= r && !spot; dx++) {
            const x = barn.x + dx, y = barn.y + dy;
            if (g.debugCanPlace('house', x, y).ok) spot = { x, y };
          }
      if (!spot) return { error: 'no spot' };
      const idx = (x: number, y: number) => y * s.w + x;
      let planned = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) if (g.debugPlanPath('dirt', spot.x + dx, spot.y + dy)) planned++;
      // Mark them built outright so we're testing removal of a real path, not a plan.
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.paths[idx(spot.x + dx, spot.y + dy)] = 2;
      const before = [0, 1].flatMap((dy) => [0, 1].map((dx) => s.paths[idx(spot!.x + dx, spot!.y + dy)]));
      const id = g.debugPlace('house', spot.x, spot.y);
      const after = [0, 1].flatMap((dy) => [0, 1].map((dx) => s.paths[idx(spot!.x + dx, spot!.y + dy)]));
      return { planned, placed: id != null, before, after };
    });
    expect(out.placed).toBe(true);
    expect(out.planned).toBe(4);
    expect(out.before).toEqual([2, 2, 2, 2]); // PATH_DIRT on all four tiles
    expect(out.after).toEqual([0, 0, 0, 0]); // PATH_NONE — torn up by the building
  });

  test('trees do not grow on a path, and paving one clears the trees', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // Several nearby forest tiles with real trees on them, nearest first. Planning a batch rather
      // than a single tile keeps the test off the mercy of one unlucky pick — a given tile can sit
      // across a river where no villager can reach it, and would never get paved.
      const candidates: number[] = [];
      for (let r = 3; r < 20 && candidates.length < 8; r++)
        for (let dy = -r; dy <= r && candidates.length < 8; dy++)
          for (let dx = -r; dx <= r && candidates.length < 8; dx++) {
            const x = barn.x + dx, y = barn.y + dy;
            if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
            const i = y * s.w + x;
            const t = s.tiles[i];
            if (t && t.type === 'forest' && t.trees > 0.5 && !candidates.includes(i)) candidates.push(i);
          }
      if (candidates.length === 0) return { error: 'no forest tiles nearby' };

      // Wood anywhere — barns, buildings, and villagers' arms. Sampling barns alone is racy: a
      // load cleared off a tile can still be walking to the barn when the measurement is taken.
      const woodAnywhere = () =>
        s.buildings.reduce((n: number, b: any) => n + (b.store.wood ?? 0), 0) +
        s.citizens.reduce((n: number, c: any) => n + (c.carry?.kind === 'wood' ? c.carry.amount : 0), 0);
      const woodBefore = woodAnywhere();
      for (const i of candidates) s.paths[i] = 1; // PATH_DIRT_PLAN — villagers lay them for real
      g.debugSetBuilders(4);

      // Stand a villager on each planned tile. This test is about what *paving* does to the
      // ground, not about pathfinding or walking speed: left to walk there on their own, on an
      // unlucky map every candidate can sit across a river, nothing gets paved inside the step
      // budget, and the test fails for a reason it isn't testing.
      const adults = s.citizens.filter((c: any) => c.age >= 4);
      candidates.forEach((i: number, n: number) => {
        const w = adults[n % adults.length];
        if (!w) return;
        const x = (i % s.w) + 0.5;
        const y = Math.floor(i / s.w) + 0.5;
        w.x = x; w.y = y; w.tx = x; w.ty = y; w.route = undefined; w.carry = null;
      });
      for (let n = 0; n < 4000; n++) g.debugAdvance(0.1);

      const paved = candidates.filter((i) => s.paths[i] === 2); // PATH_DIRT
      const afterPaving = paved.map((i) => ({ type: s.tiles[i].type, trees: s.tiles[i].trees }));
      const woodGained = woodAnywhere() - woodBefore;
      // Run on a long while and confirm nothing grows back on the paved tiles.
      for (let n = 0; n < 3000; n++) g.debugAdvance(0.1);
      const regrew = paved.map((i) => ({ type: s.tiles[i].type, trees: s.tiles[i].trees }));
      return { candidates: candidates.length, pavedCount: paved.length, afterPaving, regrew, woodGained };
    });
    expect(out.error).toBeUndefined();
    expect(out.pavedCount).toBeGreaterThan(0);
    // Paving cleared the trees on every tile that got laid...
    for (const t of out.afterPaving) {
      expect(t.type).toBe('grass');
      expect(t.trees).toBe(0);
    }
    // ...and credited the wood rather than destroying it.
    expect(out.woodGained).toBeGreaterThan(0);
    // They stay clear — neither natural regrowth nor a forester replants in the road.
    for (const t of out.regrew) {
      expect(t.type).toBe('grass');
      expect(t.trees).toBe(0);
    }
  });
});

test.describe('quarry', () => {
  test('cuts stone at full rate on open ground far from any rock', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      let s = g.state;
      const idx = (x: number, y: number) => y * s.w + x;
      const isGrass = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < s.w && y < s.h && s.tiles[idx(x, y)].type === 'grass';
      const nearRock = (x: number, y: number, r: number) => {
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const tx = x + dx, ty = y + dy;
            if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) continue;
            if (s.tiles[idx(tx, ty)].type === 'stone') return true;
          }
        return false;
      };
      // Open grass with no rock within 6 tiles — the placement the old mountainside rule refused.
      // Searched outward from the barn so the pit lands within walking distance of the workforce;
      // scanning from the map origin instead can strand it half a map away and nothing gets mined.
      // A 3x6 stone-free clearing near the barn is genuinely scarce: surface deposits clear the
      // trees off their own tile, so the map has plenty of grass but little of it contiguous and
      // clear of rock. Try a few worlds rather than assert on one lucky seed — the claim under
      // test is the quarry's *rate* on open ground, not that every world offers a site.
      let barn = s.buildings.find((b: any) => b.type === 'barn');
      let spot: number[] | null = null;
      for (let world = 0; world < 8 && !spot; world++) {
        if (world > 0) {
          g.startNewGame('small', 'easy', false);
          s = g.state; // isGrass/nearRock close over `s`, so it must follow the new world
          barn = s.buildings.find((b: any) => b.type === 'barn');
        }
        for (let r = 3; r < 22 && !spot; r++)
          for (let dy = -r; dy <= r && !spot; dy++)
            for (let dx = -r; dx <= r; dx++) {
              const x = barn.x + dx, y = barn.y + dy;
              let clear = true;
              for (let cy = 0; cy < 6 && clear; cy++)
                for (let cx = 0; cx < 3; cx++) if (!isGrass(x + cx, y + cy)) { clear = false; break; }
              if (clear && !nearRock(x, y, 6) && g.debugCanPlace('quarry', x, y).ok) { spot = [x, y]; break; }
            }
      }
      if (!spot) return { error: 'nowhere clear to place a quarry' };

      const id = g.debugPlace('quarry', spot[0], spot[1]);
      const q = s.buildings.find((b: any) => b.id === id);
      // Finish it outright and staff it, then let it work.
      q.built = true;
      q.progress = 99999;
      q.desiredWorkers = 4;
      for (let i = 0; i < 20; i++) g.debugAdvance(0.1); // let the workers get assigned

      // Total stone anywhere, so the figure doesn't depend on a hauling round-trip completing.
      const stoneEverywhere = () =>
        s.buildings.reduce((n: number, b: any) => n + (b.store.stone ?? 0), 0) +
        s.citizens.reduce((n: number, c: any) => n + (c.carry?.kind === 'stone' ? c.carry.amount : 0), 0);
      const before = stoneEverywhere();

      // Stand the workers in the pit. This test is about the *yield rule* inland, not pathfinding:
      // the nearest qualifying site can sit across a river, and then nobody ever arrives and the
      // test fails for a reason it isn't testing.
      const cx = q.x + 1.5;
      const cy = q.y + 3;
      for (const wid of q.workers) {
        const w = s.citizens.find((c: any) => c.id === wid);
        if (w) { w.x = cx; w.y = cy; w.tx = cx; w.ty = cy; w.route = undefined; }
      }
      for (let i = 0; i < 3000; i++) g.debugAdvance(0.1);
      return {
        placed: id != null,
        // Static footprint: only the ranch and farm carry a per-instance w/h.
        perInstanceSize: q.w !== undefined || q.h !== undefined,
        workers: q.workers.length,
        stoneMined: stoneEverywhere() - before,
      };
    });
    expect(out.error).toBeUndefined();
    expect(out.placed).toBe(true);
    expect(out.perInstanceSize).toBe(false);
    expect(out.workers).toBeGreaterThan(0);
    // Inland is no longer a 15%-output penalty box — the pit works at its base rate.
    expect(out.stoneMined).toBeGreaterThan(0);
  });
});

test.describe('volume-based hauling', () => {
  test('a load is 12 logs but 48 of a crop, and a full field is brought in within a season', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
      const barn = s.buildings.find((b: any) => b.type === 'barn');

      // A field close to the barn, staffed, holding a full 8×8 autumn harvest. The *size* of the
      // field is irrelevant — the harvest is set directly below — so a small one is used, because
      // an 8×8 needs a large clear area that is often only found far away or across water, where
      // the workers can pick a load up and then never reach a barn to put it down.
      g.sizeW = 4;
      g.sizeH = 4;
      let id: number | null = null;
      for (let r = 2; r < 12 && id == null; r++)
        for (let dy = -r; dy <= r && id == null; dy++)
          for (let dx = -r; dx <= r && id == null; dx++)
            if (g.debugCanPlace('farm', barn.x + dx, barn.y + dy).ok) id = g.debugPlace('farm', barn.x + dx, barn.y + dy);
      if (id == null) return { error: 'no field spot' };
      const f = s.buildings.find((b: any) => b.id === id);
      f.built = true;
      f.progress = 9999;
      f.desiredWorkers = 2;
      f.crop = 'wheat';
      if (!s.seeds.includes('wheat')) s.seeds.push('wheat');
      const HARVEST = 2560; // roughly what an 8×8 field yields with two workers
      f.store.grain = HARVEST;
      for (let i = 0; i < 40; i++) g.debugAdvance(0.1); // staff it

      // Stand the workers in the field. This measures how much fits in a pair of arms, not how
      // long it takes to walk somewhere: on an unlucky map the field lands across a river, nobody
      // ever arrives, and no load is ever picked up.
      const cx = f.x + 2;
      const cy = f.y + 2;
      for (const wid of f.workers as number[]) {
        const w = s.citizens.find((c: any) => c.id === wid);
        if (w) { w.x = cx; w.y = cy; w.tx = cx; w.ty = cy; w.route = undefined; }
      }

      // Biggest *work* load seen of each kind. Grocery runs are excluded: a household basket is
      // deliberately a bigger allowance (LARDER_CARRY_VOLUME) and would mask the work limit.
      const biggest: Record<string, number> = {};
      for (let i = 0; i < 6000; i++) {
        g.debugAdvance(0.1);
        for (const c of s.citizens as any[]) {
          if (!c.carry || c.task?.kind === 'toLarder') continue;
          biggest[c.carry.kind] = Math.max(biggest[c.carry.kind] ?? 0, c.carry.amount);
        }
      }
      return {
        harvest: HARVEST,
        leftInField: f.store.grain ?? 0,
        biggestGrainLoad: biggest.grain ?? 0,
        biggestWoodLoad: biggest.wood ?? 0,
      };
    });
    expect(out.error).toBeUndefined();
    // Volume 0.25 for a crop against volume 1 for timber: 48 vs 12 in the same pair of arms.
    expect(out.biggestGrainLoad).toBeGreaterThan(12);
    expect(out.biggestGrainLoad).toBeLessThanOrEqual(48);
    if (out.biggestWoodLoad! > 0) expect(out.biggestWoodLoad).toBeLessThanOrEqual(12);
    // The harvest is cleared out of the field rather than sitting there for years.
    expect(out.leftInField).toBeLessThan(out.harvest! * 0.5);
  });
});

test.describe('storage by volume', () => {
  test('a barn holds four times as much grain as wood, and reports space used', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      const sheet = () => {
        g.inspectSel = { kind: 'building', id: barn.id };
        g.refreshInspect();
        return document.getElementById('inspect')!.innerText.replace(/\n/g, ' | ');
      };
      barn.store = { wood: 100 };
      const wood = sheet();
      barn.store = { grain: 100 };
      const grain = sheet();
      // Fill it right up with grain and see how many units that took.
      barn.store = {};
      const at = { x: barn.x, y: barn.y };
      let put = 0;
      for (let i = 0; i < 400; i++) put += 100 - g.debugAddNearest(at, 'grain', 100);
      return { wood, grain, grainHeld: barn.store.grain ?? 0, put };
    });
    // 100 logs fill 100 of the barn's space; 100 sacks of grain fill only 25.
    expect(out.wood).toMatch(/100 \/ 5000 \(100 items\)/);
    expect(out.grain).toMatch(/25 \/ 5000 \(100 items\)/);
    // So a 5000-space barn takes 20000 units of grain, not 5000.
    expect(out.grainHeld).toBe(20000);
  });
});

test.describe('workplace names', () => {
  test('workplaces are numbered as they are built, renameable, and blank restores the default', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      const ids: number[] = [];
      for (let r = 3; r < 20 && ids.length < 3; r++)
        for (let dy = -r; dy <= r && ids.length < 3; dy++)
          for (let dx = -r; dx <= r && ids.length < 3; dx++)
            if (g.debugCanPlace('woodcutter', barn.x + dx, barn.y + dy).ok) {
              const id = g.debugPlace('woodcutter', barn.x + dx, barn.y + dy);
              if (id != null) ids.push(id);
            }
      if (ids.length < 3) return { error: 'could not place three woodcutters' };
      const nameOf = (id: number) => s.buildings.find((b: any) => b.id === id)?.name;
      const auto = ids.map(nameOf);
      g.renameBuilding(ids[0], 'North Mill');
      const renamed = nameOf(ids[0]);
      g.renameBuilding(ids[0], '   '); // blank must not leave it nameless
      const blanked = nameOf(ids[0]);
      // The inspect sheet offers an editable field, and titles the sheet with the name.
      g.renameBuilding(ids[0], 'North Mill');
      g.inspectSel = { kind: 'building', id: ids[0] };
      g.refreshInspect();
      const field = document.getElementById('insp-name') as HTMLInputElement | null;
      return {
        auto,
        renamed,
        blanked,
        fieldValue: field?.value ?? null,
        title: document.querySelector('.inv-head')?.textContent ?? '',
        barnHasName: (barn.name ?? null) !== null,
      };
    });
    expect(out.error).toBeUndefined();
    expect(out.auto).toEqual(['Woodcutter 1', 'Woodcutter 2', 'Woodcutter 3']);
    expect(out.renamed).toBe('North Mill');
    // Freeing "Woodcutter 1" makes it the lowest unused number again, so blank reclaims it.
    expect(out.blanked).toBe('Woodcutter 1');
    expect(out.fieldValue).toBe('North Mill');
    expect(out.title).toContain('North Mill');
    // A barn employs nobody, so it gets no name of its own.
    expect(out.barnHasName).toBe(false);
  });
});

test.describe('job board', () => {
  test('lists every job from the start, including ones not built yet', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    await page.click('#btn-jobs');
    await expect(page.locator('#jobboard .job-row').first()).toBeVisible();
    const board = await page.evaluate(() => {
      const el = document.getElementById('jobboard')!;
      return {
        muted: el.querySelectorAll('.job-row.muted').length,
        hasSection: !!el.querySelector('.jb-section'),
        text: el.innerText,
      };
    });
    // Nothing is built on a fresh map, so every workplace shows under "Not built yet".
    expect(board.hasSection).toBe(true);
    expect(board.muted).toBeGreaterThan(8);
    for (const job of ['Gatherer', 'Fishing Hut', 'Blacksmith', 'Market']) {
      expect(board.text).toContain(job);
    }
  });
});

test.describe('top HUD', () => {
  test('no population or laborer chip', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('#hud-people .stat')].map((e) => e.id),
    );
    expect(ids).not.toContain('stat-pop');
    expect(ids).not.toContain('stat-builders');
    // The rest of the people row is untouched.
    expect(ids).toEqual(['stat-ages', 'stat-health', 'stat-happy', 'stat-sick', 'stat-season']);
  });
});

test.describe('toolbar', () => {
  test('has no Inspect button, and closing a category returns to inspecting', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    const tools = await page.evaluate(() =>
      [...document.querySelectorAll('#toolbar .tool-btn')].map((e) => (e as HTMLElement).dataset.tool),
    );
    expect(tools).not.toContain('inspect');

    // Opening a category shows its pop-out; closing it leaves no tool active, which *is* inspect.
    await page.click('.tool-btn[data-tool="housing"]');
    await expect(page.locator('#popout')).toBeVisible();
    await page.click('.tool-btn[data-tool="housing"]');
    await expect(page.locator('#popout')).toBeHidden();
    const active = await page.evaluate(() =>
      [...document.querySelectorAll('#toolbar .tool-btn.active')].map((e) => (e as HTMLElement).dataset.tool),
    );
    expect(active).toEqual([]);
  });

  test('demolish toggles off again', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    await page.click('.tool-btn[data-tool="demolish"]');
    expect(await page.evaluate(() => (window as any).__village.demolish)).toBe(true);
    await page.click('.tool-btn[data-tool="demolish"]');
    expect(await page.evaluate(() => (window as any).__village.demolish)).toBe(false);
  });
});

test.describe('confirm before it happens', () => {
  test('drawn paths wait for confirmation, and villagers ignore them until then', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    const drawn = await page.evaluate(() => {
      const g = (window as any).__village;
      const s = g.state;
      s.paths.fill(0);
      s.pendingPaths = [];
      g.onSelectPath('dirt');
      // Paint a run of tiles near the barn. Painting at map coordinates rather than screen
      // coordinates keeps the test off the camera and the map seed — a fixed pixel row lands
      // wherever the world happens to put it, which on an unlucky map is open water.
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      const painted: number[] = [];
      for (let r = 2; r < 12 && painted.length < 6; r++)
        for (let dy = -r; dy <= r && painted.length < 6; dy++)
          for (let dx = -r; dx <= r && painted.length < 6; dx++) {
            const x = barn.x + dx, y = barn.y + dy;
            if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
            const i = y * s.w + x;
            if (painted.includes(i)) continue;
            if (g.debugPaintPath('dirt', x, y)) painted.push(i);
          }
      return { painted, pending: s.pendingPaths.length, planned: s.paths.filter((v: number) => v === 1).length };
    });
    expect(drawn.pending).toBeGreaterThan(0);
    expect(drawn.planned).toBe(drawn.pending); // drawn tiles show as plans, so they are visible

    await expect(page.locator('#confirm')).toBeVisible();
    await expect(page.locator('#confirm')).toContainText('drawn');

    // Nothing gets laid while the decision is outstanding.
    const whilePending = await page.evaluate(() => {
      const g = (window as any).__village;
      g.debugSetBuilders(4);
      for (let i = 0; i < 2000; i++) g.debugAdvance(0.1);
      return g.state.paths.filter((v: number) => v === 2).length;
    });
    expect(whilePending).toBe(0);

    // Confirming releases them to the builders. Stand a villager on each tile first: this is
    // testing that confirmation unblocks the work, not how long anyone takes to walk there.
    await page.click('#cf-ok');
    const after = await page.evaluate((painted: number[]) => {
      const g = (window as any).__village;
      const s = g.state;
      const adults = s.citizens.filter((c: any) => c.age >= 4);
      painted.forEach((i: number, n: number) => {
        const w = adults[n % adults.length];
        if (!w) return;
        const x = (i % s.w) + 0.5;
        const y = Math.floor(i / s.w) + 0.5;
        w.x = x; w.y = y; w.tx = x; w.ty = y; w.route = undefined; w.carry = null;
      });
      for (let i = 0; i < 3000; i++) g.debugAdvance(0.1);
      return { built: s.paths.filter((v: number) => v === 2).length, pending: s.pendingPaths.length };
    }, drawn.painted);
    expect(after.pending).toBe(0);
    expect(after.built).toBeGreaterThan(0);
  });

  test('cancelling a drawn path clears it back to bare ground', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    const drew = await page.evaluate(() => {
      const g = (window as any).__village;
      const s = g.state;
      s.paths.fill(0);
      s.pendingPaths = [];
      g.onSelectPath('dirt');
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      for (let r = 2; r < 12 && s.pendingPaths.length < 6; r++)
        for (let dy = -r; dy <= r && s.pendingPaths.length < 6; dy++)
          for (let dx = -r; dx <= r && s.pendingPaths.length < 6; dx++)
            g.debugPaintPath('dirt', barn.x + dx, barn.y + dy);
      return s.pendingPaths.length;
    });
    expect(drew).toBeGreaterThan(0);
    await expect(page.locator('#confirm')).toBeVisible();
    await page.click('#cf-cancel');
    const after = await page.evaluate(() => ({
      planned: (window as any).__village.state.paths.filter((v: number) => v !== 0).length,
      pending: (window as any).__village.state.pendingPaths.length,
    }));
    expect(after.planned).toBe(0);
    expect(after.pending).toBe(0);
    await expect(page.locator('#confirm')).toBeHidden();
  });

  test('demolition waits for confirmation; cancelling leaves the building standing', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    const picked = await page.evaluate(() => {
      const g = (window as any).__village;
      const house = g.state.buildings.find((b: any) => b.type === 'house');
      g.onSetDemolish(true);
      g.demolishAt(house.x + 0.5, house.y + 0.5);
      return { id: house.id, stillThere: g.state.buildings.some((b: any) => b.id === house.id) };
    });
    // Selecting must not destroy anything — a mis-tap costs nothing.
    expect(picked.stillThere).toBe(true);
    await expect(page.locator('#confirm')).toContainText('Demolish');

    await page.click('#cf-cancel');
    expect(
      await page.evaluate((id) => (window as any).__village.state.buildings.some((b: any) => b.id === id), picked.id),
    ).toBe(true);

    // Re-select and confirm: now it goes.
    await page.evaluate((id) => {
      const g = (window as any).__village;
      const b = g.state.buildings.find((x: any) => x.id === id);
      g.demolishAt(b.x + 0.5, b.y + 0.5);
    }, picked.id);
    await page.click('#cf-ok');
    expect(
      await page.evaluate((id) => (window as any).__village.state.buildings.some((b: any) => b.id === id), picked.id),
    ).toBe(false);
  });
});

test.describe('prompt rehousing', () => {
  test('a couple moves into a new house within seconds, not at the next season', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 200; i++) g.debugAdvance(0.1); // let households settle
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      let id: number | null = null;
      for (let r = 3; r < 20 && id == null; r++)
        for (let dy = -r; dy <= r && id == null; dy++)
          for (let dx = -r; dx <= r && id == null; dx++)
            if (g.debugCanPlace('house', barn.x + dx, barn.y + dy).ok) id = g.debugPlace('house', barn.x + dx, barn.y + dy);
      if (id == null) return { error: 'no house spot' };
      const h = s.buildings.find((b: any) => b.id === id);
      h.built = true;
      h.progress = 9999;
      // Advance a second at a time and see how long the new house stands empty.
      for (let t = 1; t <= 60; t++) {
        g.debugAdvance(1);
        if (s.citizens.some((c: any) => c.homeId === id)) return { secondsToOccupy: t };
      }
      return { secondsToOccupy: null };
    });
    expect(out.error).toBeUndefined();
    // Seasons are 600s; rehousing used to happen only at the turnover, so this could take one.
    expect(out.secondsToOccupy).not.toBeNull();
    expect(out.secondsToOccupy!).toBeLessThan(10);
  });
});

test.describe('build stamp', () => {
  test('the main menu shows an incrementing version, commit and date', async ({ page }) => {
    await open(page);
    const stamp = await page.evaluate(() => document.getElementById('mm-build')?.textContent ?? '');
    // e.g. "v0.1.48 · 7b6dfc7 · 2026-07-27". The patch is the commit count, so it rises with every
    // push; a '?' there means the build ran against a shallow clone and the number can't be trusted.
    expect(stamp).toMatch(/^v\d+\.\d+\.\d+ · [0-9a-f]{7,} · \d{4}-\d{2}-\d{2}$/);
  });
});

test.describe('village history', () => {
  test('events are recorded newest-first with the season they happened in', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      const s = g.state;
      for (let i = 0; i < 5; i++) g.debugAdvance(610); // ~5 season turnovers
      const e = s.events;
      return {
        count: e.length,
        // Newest first: the head entry is at or after the tail entry in game time.
        headTime: e.length ? e[0].year * 4 + e[0].season : 0,
        tailTime: e.length ? e[e.length - 1].year * 4 + e[e.length - 1].season : 0,
        stamped: e.every((x: any) => typeof x.year === 'number' && typeof x.season === 'number'),
        kinds: [...new Set(e.map((x: any) => x.kind))].sort(),
      };
    });
    expect(out.count).toBeGreaterThan(0);
    expect(out.headTime).toBeGreaterThanOrEqual(out.tailTime);
    expect(out.stamped).toBe(true);
    for (const k of out.kinds) expect(['info', 'good', 'bad']).toContain(k);
  });

  test('the History panel lists them grouped by season, and × closes it', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      for (let i = 0; i < 5; i++) g.debugAdvance(610);
    });
    await expect(page.locator('#history')).toBeHidden();
    await page.click('#btn-history');
    await expect(page.locator('#history')).toBeVisible();
    // Contents are rendered by `refreshPanels` on the next animation frame, not by the click.
    await expect(page.locator('#history .hist-row').first()).toBeVisible();

    const dom = await page.evaluate(() => {
      const h = document.getElementById('history')!;
      return {
        seasons: h.querySelectorAll('.hist-season').length,
        rows: h.querySelectorAll('.hist-row').length,
        firstSeasonHeading: h.querySelector('.hist-season')?.textContent ?? '',
      };
    });
    expect(dom.rows).toBeGreaterThan(0);
    expect(dom.seasons).toBeGreaterThan(0);
    expect(dom.firstSeasonHeading).toMatch(/^(Spring|Summer|Autumn|Winter) · Yr \d+$/);

    await page.click('#hist-close');
    await expect(page.locator('#history')).toBeHidden();
  });

  test('the chronicle survives a save and reload', async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      for (let i = 0; i < 3; i++) g.debugAdvance(610);
      g.persist();
      return { count: g.state.events.length, newest: g.state.events[0]?.text ?? '' };
    });
    expect(before.count).toBeGreaterThan(0);

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.click('#mm-continue');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
      const g = (window as any).__village;
      return { count: g.state.events.length, newest: g.state.events[0]?.text ?? '' };
    });
    expect(after.count).toBe(before.count);
    expect(after.newest).toBe(before.newest);
  });

  test('the chronicle is capped so it cannot grow without bound', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      // Push well past the cap through the real logging path.
      for (let i = 0; i < 400; i++) g.log(`filler ${i}`, 'info');
      return { count: s.events.length, newestIsLast: s.events[0].text === 'filler 399' };
    });
    expect(out.count).toBe(250); // EVENT_LOG_MAX
    expect(out.newestIsLast).toBe(true);
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
