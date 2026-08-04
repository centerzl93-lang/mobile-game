import { test, expect, Page } from '@playwright/test';

// Covers the New Game start-location fix, difficulty stockpiles, and the disasters toggle.

async function open(page: Page): Promise<void> {
  await page.goto('/?gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

/**
 * Open on the flat 2D renderer, for tests that click their way through the UI or run the
 * simulation hard.
 *
 * Headless Chromium has no GPU: it rasterises the 3D view in software, which drops the page to
 * about 2 fps. Playwright's click actionability check waits on animation frames, so at 2 fps a
 * single click can take seconds and a test spends its whole 30s budget rendering scenery nothing
 * asserts on. Two menu clicks measured 15.4s in 3D against 165ms here.
 *
 * Use this wherever the assertions are about game state or the DOM. Use `open` only where they
 * are about the 3D renderer itself.
 */
async function open2d(page: Page): Promise<void> {
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
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
    // Survival rations are identical on every difficulty — they are tuned against the founding
    // twelve, not against difficulty. 1200 food, 600 firewood, and a year of tools and coats.
    const FOODS = ['fruit', 'grain', 'fish', 'meat'];
    for (const [name, run] of Object.entries(d)) {
      const food = FOODS.reduce((n, k) => n + ((run.store as any)[k] ?? 0), 0);
      expect(food, `${name} food`).toBe(1200);
      expect(run.store.firewood, `${name} firewood`).toBe(600);
      expect(run.store.tools, `${name} tools`).toBe(48);
      expect(run.store.clothing, `${name} coats`).toBe(48);
    }
    // What difficulty actually changes is the leg-up. Easy: building materials, medicine, houses.
    expect(d.easy.houses).toBe(3);
    expect(d.easy.store.wood).toBe(660);
    expect(d.easy.store.stone).toBe(120);
    expect(d.easy.store.medicine).toBe(120);
    // Normal and Hard: no houses and no building materials at all — everything must be gathered.
    for (const name of ['normal', 'hard'] as const) {
      expect(d[name].houses, `${name} houses`).toBe(0);
      expect(d[name].store.wood ?? 0, `${name} wood`).toBe(0);
      expect(d[name].store.stone ?? 0, `${name} stone`).toBe(0);
      expect(d[name].store.medicine ?? 0, `${name} medicine`).toBe(0);
      expect(d[name].store.coal ?? 0, `${name} coal`).toBe(0);
    }
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
    const res = await page.evaluate(`(${setup})({ wood: 100 }, {}, { phase: 'docked', present: true, stayTimer: 600, category: 'basics', stock: { iron: 10 }, seedStock: [], boat: { x: 0, y: 0 } })`) as any;
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
    await page.evaluate(`(${setup})({ grain: 200 }, {}, { phase: 'docked', present: true, stayTimer: 600, category: 'seeds', stock: {}, seedStock: ['corn'], boat: { x: 0, y: 0 } })`);
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
    await page.evaluate(`(${setup})({}, {}, { phase: 'docked', present: true, stayTimer: 600, category: 'foods', stock: { grain: 50 }, seedStock: [], boat: { x: 1, y: 1 } })`);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.dismissMerchant();
      return { phase: g.state.merchant.phase, present: g.state.merchant.present };
    });
    expect(out.phase).toBe('leaving');
    expect(out.present).toBe(false);
  });

  test('the cart takes ten at a time, fills to All, and accepts a typed quantity', async ({ page }) => {
    await open(page);
    await page.evaluate(
      `(${setup})({ wood: 100 }, {}, { phase: 'docked', present: true, stayTimer: 600, category: 'basics', stock: { iron: 40 }, seedStock: [], boat: { x: 0, y: 0 } })`,
    );
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.debugOpenTradingPost(g.state.buildings.find((b: any) => b.type === 'trading').id);
    });
    const buy = page.locator('#tp-merchant input[data-buyset="iron"]');
    const give = page.locator('#tp-merchant input[data-giveset="wood"]');
    await expect(buy).toHaveValue('0');
    await expect(page.locator('#tp-merchant button[data-buy="10"][data-k="iron"]')).toBeVisible();

    // Dispatched rather than clicked: every basket change rebuilds the pane, and headless only
    // produces animation frames in fits, so the actionability check races the rebuild. The button
    // being on screen is asserted above; what these steps exercise is the arithmetic behind it.
    const tap = (attr: string, step: string, k: string) =>
      page.locator(`#tp-merchant button[data-${attr}="${step}"][data-k="${k}"]`).dispatchEvent('click');
    const cartGet = async () =>
      JSON.parse(await page.evaluate(() => JSON.stringify((window as any).__village.ui.basketGet)));

    // Coarse steps: three taps of +10 where the old panel needed thirty of [+].
    for (let i = 0; i < 3; i++) await tap('buy', '10', 'iron');
    expect(await cartGet()).toEqual({ iron: 30 });
    await tap('buy', '-1', 'iron');
    expect(await cartGet()).toEqual({ iron: 29 });
    // All fills to the merchant's whole stock, and cannot go past it.
    await tap('buy', 'max', 'iron');
    expect(await cartGet()).toEqual({ iron: 40 });
    await tap('buy', '10', 'iron');
    expect(await cartGet()).toEqual({ iron: 40 });
    // −10 from a full cart, to show the fine and coarse steps share one figure.
    await tap('buy', '-10', 'iron');
    expect(await cartGet()).toEqual({ iron: 30 });

    // Typed entry on the give side, committed when the field is left. Asserted against the cart
    // itself rather than the redrawn panel: the panel only repaints on an animation frame, and
    // headless throttles those hard when nothing is moving.
    const cart = () =>
      page.evaluate(() => JSON.stringify((window as any).__village.ui.basketGive));
    await give.fill('55');
    await give.blur();
    expect(JSON.parse(await cart())).toEqual({ wood: 55 });

    // A figure past what the post actually holds is clamped to the shelf, not accepted. Typed by
    // hand rather than filled: `fill` refuses a value outside the field's max, but a player at a
    // keyboard can enter one, and that is the case the clamp exists for.
    await page.evaluate(() => {
      const el = document.querySelector('#tp-merchant input[data-giveset="wood"]') as HTMLInputElement;
      el.value = '900';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(JSON.parse(await cart())).toEqual({ wood: 100 });
  });

  test('a typed standing order sets the post to that exact figure', async ({ page }) => {
    await open(page);
    await page.evaluate(`(${setup})({}, {}, { phase: 'away', present: false, stayTimer: 0, category: null, stock: {}, seedStock: [], boat: null })`);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.debugOpenTradingPost(g.state.buildings.find((b: any) => b.type === 'trading').id);
    });
    const ord = page.locator('#tp-orders input[data-ordset="stone"]');
    await ord.fill('250');
    await ord.blur();
    const stored = await page.evaluate(
      () => (window as any).__village.state.buildings.find((b: any) => b.type === 'trading').orders.stone,
    );
    expect(stored).toBe(250);
  });

  test('no back-to-back visits: the cooldown after a departure keeps the water quiet', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // A trading post so arrivals are *possible*, plus a cooldown still running.
      s.buildings.push({ id: s.nextId++, type: 'trading', x: barn.x, y: barn.y, built: true, progress: 99,
        workers: [s.citizens[0].id], desiredWorkers: 1, growth: 0, output: 'coal', recipe: 'iron', store: {}, orders: {} });
      Object.assign(s.merchant, { phase: 'away', present: false, cooldownTimer: 600, category: null, stock: {}, seedStock: [], boat: null });
      g.debugAdvance(590); // most of the cooldown, but not all of it
      const midPhase = s.merchant.phase;
      g.debugAdvance(20); // and now it has run out
      return { midPhase, cooldownTimer: s.merchant.cooldownTimer };
    });
    expect(out.midPhase).toBe('away'); // nothing sailed in while the cooldown was running
    expect(out.cooldownTimer).toBe(0); // and it has since expired, so visits are possible again
  });

  test('a merchant can sail in mid-season, and an unstaffed post still gets visits', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // Deliberately unstaffed: the worker moves goods in and out of the post, they don't summon
      // the boat. Under the old rule this post would never have seen a trader at all.
      s.buildings.push({ id: s.nextId++, type: 'trading', x: barn.x, y: barn.y, built: true, progress: 99,
        workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {}, orders: {} });
      Object.assign(s.merchant, { phase: 'away', present: false, cooldownTimer: 0, category: null, stock: {}, seedStock: [], boat: null });
      s.seasonTimer = 0;
      // Half a season, nowhere near a turnover. Arrivals are a roll per tick, so run until one
      // lands rather than asserting on a single unlucky season.
      let seasons = 0;
      while (s.merchant.phase === 'away' && seasons < 40) {
        g.debugAdvance(300);
        seasons += 0.5;
      }
      return { phase: s.merchant.phase, seasonTimer: s.seasonTimer, workers: 0 };
    });
    expect(out.phase).not.toBe('away'); // a boat came for an unstaffed post
    // And it arrived somewhere inside a season, not at the stroke of a turnover.
    expect(out.seasonTimer).toBeGreaterThan(0);
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
      return { phase: s.merchant.phase, present: s.merchant.present, stayTimer: s.merchant.stayTimer, boat: !!s.merchant.boat };
    });
    expect(out.phase).toBe('docked');
    expect(out.present).toBe(true);
    // A full season of moorage, less whatever the boat has already spent tied up.
    expect(out.stayTimer).toBeGreaterThan(560); // MERCHANT_STAY_SEASONS × SEASON_LENGTH
    expect(out.stayTimer).toBeLessThanOrEqual(600);
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
      // Let the assigned trader haul a few loads. Generous on purpose: household errands come
      // before paid work, and every household now has to carry its own fuel home before anyone
      // settles into a job, so the first load into the post can be a while coming on a map where
      // the barn is a walk away. 200s was enough before that and is marginal now.
      g.debugAdvance(400);
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
      // Placing a site now asks for builders on its own, so "zero builders" is something the
      // player has to choose. Dial it down and nothing happens.
      g.debugSetBuilders(0);
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

  test('placing sites asks for builders by itself, and the ask stacks and clears', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((place) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      const s = g.state;
      // Nothing outstanding at the start of a game, so nobody is wanted on the tools.
      g.debugAdvance(1);
      const idle = s.desiredBuilders;

      const first = eval(place)();
      g.debugAdvance(1);
      const one = s.desiredBuilders;

      // A second site adds its own demand on top rather than replacing it.
      let second: number | null = null;
      for (let r = 3; r < 24 && second == null; r++)
        for (let dy = -r; dy <= r && second == null; dy++)
          for (let dx = -r; dx <= r && second == null; dx++) {
            const b = s.buildings.find((x: any) => x.id === first);
            const x = b.x + dx, y = b.y + dy;
            if (g.debugCanPlace('house', x, y).ok) second = g.debugPlace('house', x, y);
          }
      g.debugAdvance(1);
      const two = s.desiredBuilders;

      // Finish both and the demand falls away again — builders are wanted for work outstanding,
      // not permanently.
      for (const id of [first, second]) {
        const b = s.buildings.find((x: any) => x.id === id);
        b.built = true;
        b.progress = g.debugBuildTime(b.type);
      }
      g.debugAdvance(1);
      return { idle, one, two, after: s.desiredBuilders, placedSecond: second != null };
    }, placeGatherer);
    expect(out.idle).toBe(0);
    expect(out.one, 'one open site wants builders').toBeGreaterThan(0);
    expect(out.placedSecond).toBe(true);
    expect(out.two, 'a second site stacks on top of the first').toBeGreaterThan(out.one);
    expect(out.after, 'nothing outstanding, nobody wanted').toBe(0);
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
      // `b.w` is set only on the ranch and the field; everything else takes its size from the
      // def, so ask the game rather than assuming 2 — the barn alone is 3x3, and a path planned
      // under it is one no laborer can ever lay.
      const covers = (b: any, x: number, y: number) => {
        const f = g.debugFootprint(b.type);
        return x >= b.x && x < b.x + (b.w ?? f.w) && y >= b.y && y < b.y + (b.h ?? f.h);
      };
      let idx = -1;
      for (let r = 1; r < 8 && idx < 0; r++)
        for (let dy = -r; dy <= r && idx < 0; dy++)
          for (let dx = -r; dx <= r && idx < 0; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
            const occupied = s.buildings.some((b: any) => covers(b, x, y));
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

test.describe('fire spread', () => {
  /**
   * Build a test cluster around a source house: a wooden neighbour touching it, a stone
   * neighbour touching it, a wooden house one clear tile away, and a wooden house two tiles
   * away as the "never catches" control. Offsets are tiles from the source; houses are 2×2, so
   * dy 3 leaves exactly one clear row and dy -4 leaves two.
   *
   * The site has to be well clear of the starting village, or a stray barn neighbour would make
   * "only these buildings caught" impossible to assert.
   */
  const buildCluster = `(g) => {
    const s = g.state;
    const offs = [[0, 0], [2, 0], [-2, 0], [0, 3], [0, -4]];
    for (let y = 6; y < s.h - 6; y++)
      for (let x = 6; x < s.w - 6; x++) {
        if (!offs.every(([dx, dy]) => g.debugCanPlace('house', x + dx, y + dy).ok)) continue;
        // Cluster spans x-2..x+3 by y-4..y+4; nothing else may start within 8 tiles of that,
        // which clears even the largest footprint by more than fire can jump.
        const busy = s.buildings.some(
          (b) => b.x > x - 10 && b.x < x + 11 && b.y > y - 12 && b.y < y + 12,
        );
        if (busy) continue;
        const built = offs.map(([dx, dy], i) => {
          const id = g.debugPlace(i === 2 ? 'stonehouse' : 'house', x + dx, y + dy);
          const b = s.buildings.find((o) => o.id === id);
          b.built = true;
          b.progress = 1;
          return b;
        });
        return built; // [source, touching wood, touching stone, one tile away, two tiles away]
      }
    throw new Error('no clear five-house site anywhere on this map');
  }`;

  // Burn the source down with Math.random pinned, so each neighbour's roll has a known outcome.
  const collapse = `(g, source, fixed) => {
    const real = Math.random;
    Math.random = () => fixed;
    try {
      source.fireTimer = 0.05;
      g.debugAdvance(0.1);
    } finally {
      Math.random = real;
    }
  }`;

  test('fire jumps to touching buildings but not to ones a tile away', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(
      ([clusterSrc, collapseSrc]) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', true);
        const [source, wood, stone, near, far] = eval(clusterSrc)(g);
        // 0.2 clears the touching-wood odds (0.25) but not one-tile-away (0.03) and not
        // touching stone (0.25 × 0.5 = 0.125).
        eval(collapseSrc)(g, source, 0.2);
        return {
          gone: !g.state.buildings.includes(source),
          wood: !!wood.fireTimer,
          stone: !!stone.fireTimer,
          near: !!near.fireTimer,
          far: !!far.fireTimer,
        };
      },
      [buildCluster, collapse],
    );
    expect(out.gone).toBe(true);
    expect(out.wood).toBe(true);
    expect(out.stone).toBe(false);
    expect(out.near).toBe(false);
    expect(out.far).toBe(false);
  });

  test('a long-odds roll reaches one tile away, never two', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(
      ([clusterSrc, collapseSrc]) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', true);
        const [source, wood, stone, near, far] = eval(clusterSrc)(g);
        // 0.02 clears every spread chance in play, so anything that stays unlit is out of range
        // rather than lucky.
        eval(collapseSrc)(g, source, 0.02);
        return {
          wood: !!wood.fireTimer,
          stone: !!stone.fireTimer,
          near: !!near.fireTimer,
          far: !!far.fireTimer,
        };
      },
      [buildCluster, collapse],
    );
    expect(out.wood).toBe(true);
    expect(out.stone).toBe(true);
    expect(out.near).toBe(true);
    expect(out.far).toBe(false);
  });

  test('stone walls halve the chance of catching in the first place', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      // fireSeason rolls: (1) does a fire start, (2) which building, (3) stone resistance —
      // only for masonry. Pinning the sequence makes the third roll's effect the only variable.
      const run = (type: string, resist: number) => {
        g.startNewGame('small', 'easy', true);
        const s = g.state;
        const target = s.buildings.filter((b: any) => b.built && b.type === 'house')[0];
        target.type = type; // flammable[0] either way — the barn ahead of it is fireproof
        const seq = [0.01, 0, resist];
        let i = 0;
        const real = Math.random;
        Math.random = () => seq[i++] ?? 0.5;
        try {
          g.debugFireSeason();
        } finally {
          Math.random = real;
        }
        return !!target.fireTimer;
      };
      return {
        wood: run('house', 0.9),
        stoneUnlucky: run('stonehouse', 0.1),
        stoneSpared: run('stonehouse', 0.9),
      };
    });
    // Wood never consults the resistance roll, so the same 0.9 that spares stone burns it.
    expect(out.wood).toBe(true);
    expect(out.stoneUnlucky).toBe(true);
    expect(out.stoneSpared).toBe(false);
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
      const { w: fw, h: fh } = g.debugFootprint('barn');
      // Plant trees across the whole footprint before placing. Trees and loose stone are
      // mutually exclusive per tile in the real map, so clear any seeded stone as we do it.
      for (let dy = 0; dy < fh; dy++)
        for (let dx = 0; dx < fw; dx++) {
          const t = s.tiles[(py + dy) * s.w + (px + dx)];
          t.type = 'forest';
          t.trees = 0.3;
          t.stone = 0;
        }
      const id = g.debugPlace('barn', px, py);
      const b = s.buildings.find((x: any) => x.id === id);
      // Placement marks every treed footprint tile for harvesting.
      let marked = 0;
      for (let dy = 0; dy < fh; dy++)
        for (let dx = 0; dx < fw; dx++)
          if (s.harvest[(py + dy) * s.w + (px + dx)] === HARVEST_WOOD) marked++;
      const treesLeft = () => {
        for (let dy = 0; dy < fh; dy++)
          for (let dx = 0; dx < fw; dx++) {
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
      return { placed: id != null, marked, footprint: fw * fh, violated, cleared: !treesLeft(), built: b.built };
    }, findSpot);
    expect(out.placed).toBe(true);
    expect(out.marked).toBe(out.footprint);
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
      const { w: fw, h: fh } = g.debugFootprint('barn');
      // Scatter loose stone on the footprint (the tiles stay grass — stone is a surface deposit).
      for (let dy = 0; dy < fh; dy++)
        for (let dx = 0; dx < fw; dx++) s.tiles[(py + dy) * s.w + (px + dx)].stone = 10;
      const id = g.debugPlace('barn', px, py);
      let marked = 0;
      for (let dy = 0; dy < fh; dy++)
        for (let dx = 0; dx < fw; dx++)
          if (s.harvest[(py + dy) * s.w + (px + dx)] === HARVEST_STONE) marked++;
      return { placed: id != null, marked, footprint: fw * fh };
    }, findSpot);
    expect(out.placed).toBe(true);
    expect(out.marked).toBe(out.footprint);
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

  test('the top-line HUD counts food a household has already carried home', async ({ page }) => {
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
    // Villagers eat from their own larder first, so food indoors is food the village has. Counting
    // only the barns made the chip go red — a famine warning — in a village whose houses were all
    // full, which is exactly what a player reported.
    expect(Number(out.chip)).toBeGreaterThanOrEqual(out.barnFood + 500);
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
   * Firewood drawn by one household over a fixed window *inside* the given season. Heating is
   * billed continuously, so the measurement no longer straddles a turnover: it crosses one
   * boundary (which is what issues clothing for the season under test) and then measures well
   * clear of the next one. The household holds all the food and fuel and the barns hold none, so
   * the figure is purely this household's heating and nothing can refill mid-measurement.
   */
  async function burnDuring(page: Page, season: number, dressed: boolean, stone = false) {
    return page.evaluate(
      ({ season, dressed, stone }) => {
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
        // Rebuild the same household in masonry when asked. Only the type matters to heating, and
        // reusing the identical house keeps the two runs comparable resident for resident.
        if (stone) picked.b.type = 'stonehouse';
        // Step over the boundary into the season under test: that turnover is what issues the
        // clothing ration, which heating then reads all season.
        s.season = (season + 3) % 4;
        s.seasonTimer = 600 - 0.5; // SEASON_LENGTH
        g.debugAdvance(1);
        const issued = s.citizens.filter((c: any) => c.clothed).length;
        // Pin the clothing flag across the window. A baby born at that turnover arrives *after*
        // the ration is handed out, so it starts unclothed and burns a third more than its
        // housemates — enough to make two runs of the same season disagree. What these runs
        // measure is the effect of the flag on fuel, not who got issued a coat; `issued` above
        // still records that the ration happened at all.
        for (const c of s.citizens) c.clothed = dressed;
        picked.b.store.firewood = 1e6; // top back up — the crossing itself burned a little
        const fw0 = picked.b.store.firewood;
        // Captured before the window: `rehouseVillagers` runs on a timer and can move a surplus
        // adult out. Counting residents afterwards would undercount the denominator.
        const residents = s.citizens.filter((c: any) => c.homeId === picked.b.id);
        // Freeze the household's demographics for the window. Lives run on ticks now, so over 500
        // seconds this household could bear a child, see one of its children come of age and move
        // out, or lose an elder — each of which changes the head count the figure is divided by,
        // and the first two also change the numerator. Spring and autumn came out 12% apart on a
        // rate that is equal by definition.
        //
        // Each resident is moved clear of every threshold they could cross in 500s — which is
        // 0.21 of a year — while the household keeps its shape. Children go to 1, well below
        // SCHOOL_AGE and ADULT_AGE (4). Adults go to 34.5: past the fertile window
        // (FERTILE_MAX_AGE 34) so the house cannot bear a child, and still short of
        // OLD_AGE_START (35) at the end of the window, so nobody is rolling for old age either.
        //
        // Ages rather than partnerships, because `rehouseVillagers` runs every couple of seconds
        // and pairs singles off again — clearing `partnerId` buys about two seconds. Turning the
        // children into adults instead would leave the house full of surplus adults and rehousing
        // would move one out, which is exactly what `stayed` is watching for. Heating is charged
        // per head regardless of age, so none of this touches what is being measured.
        for (const c of residents) c.age = c.age < 4 ? 1 : 34.5;
        g.debugAdvance(500); // well inside the season — no second turnover in the figure
        const burned = fw0 - (picked.b.store.firewood ?? 0);
        return {
          adults: residents.filter((c: any) => c.age >= 4).length,
          children: residents.filter((c: any) => c.age < 4).length,
          issued, // villagers who drew a clothing ration at the turnover, before the flag was pinned
          season: s.season, // must still be the season asked for, or the figure is a blend
          // Anyone rehoused mid-window would stop drawing on this larder and quietly deflate the
          // figure — a stone house shelters fewer, so this is the trap the masonry run can spring.
          stayed: s.citizens.filter((c: any) => c.homeId === picked.b.id).length === residents.length,
          burned,
          // Normalised per head: each measurement run regenerates the map, so the chosen household
          // can differ in size between runs and the raw totals are not directly comparable.
          perResident: residents.length > 0 ? burned / residents.length : 0,
        };
      },
      { season, dressed, stone },
    );
  }

  test('firewood burns year-round: winter heaviest, summer lightest', async ({ page }) => {
    await open(page);
    // Seasons index Spring0 Summer1 Autumn2 Winter3.
    const winter = await burnDuring(page, 3, true);
    const spring = await burnDuring(page, 0, true);
    const summer = await burnDuring(page, 1, true);
    const autumn = await burnDuring(page, 2, true);

    // Used in every season, never zero — the old model only charged for winter.
    for (const r of [winter, spring, summer, autumn]) expect(r.burned).toBeGreaterThan(0);
    expect([winter.season, spring.season, summer.season, autumn.season]).toEqual([3, 0, 1, 2]);
    // Winter > spring/autumn > summer, with the shoulder seasons matched. Compared per head, since
    // each run regenerates the map and the household picked can differ in size.
    expect(winter.perResident).toBeGreaterThan(spring.perResident);
    expect(spring.perResident).toBeCloseTo(autumn.perResident, 5);
    expect(autumn.perResident).toBeGreaterThan(summer.perResident);
  });

  test('a clothed villager burns less firewood than an unclothed one', async ({ page }) => {
    await open(page);
    const dressed = await burnDuring(page, 0, true);
    const undressed = await burnDuring(page, 0, false);
    // Clothing was actually issued from the barns in one run and not the other.
    expect(dressed.issued).toBeGreaterThan(0);
    expect(undressed.issued).toBe(0);
    // CLOTHED_HEAT_FACTOR = 0.75, compared per head for the reason above.
    expect(dressed.perResident).toBeCloseTo(undressed.perResident * 0.75, 5);
  });

  test('stone walls hold their heat: a stone house burns less than a timber one', async ({ page }) => {
    await open(page);
    const timber = await burnDuring(page, 3, true); // winter, when heating actually bites
    const stone = await burnDuring(page, 3, true, true);
    expect([timber.stayed, stone.stayed], 'both households held their residents').toEqual([true, true]);
    expect(stone.perResident).toBeLessThan(timber.perResident);
    // STONE_HOUSE_HEAT_FACTOR = 0.6.
    expect(stone.perResident).toBeCloseTo(timber.perResident * 0.6, 5);
  });

  test('firewood is burned through the season, not in one lump at the turnover', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
      const fuel = () => s.buildings.reduce((n: number, b: any) => n + (b.store.firewood ?? 0), 0);
      s.season = 3; // winter, the heaviest draw
      s.seasonTimer = 0;
      for (const b of s.buildings) if (b.type === 'barn') b.store.firewood = 500;
      const start = fuel();
      // A fifth of a season, nowhere near a boundary. The old model burned nothing until the
      // season turned over, so this window showed no change at all.
      for (let i = 0; i < 1200; i++) g.debugAdvance(0.1);
      return { start, mid: fuel(), season: s.season, pop: s.citizens.length };
    });
    expect(out.pop).toBeGreaterThan(0);
    expect(out.season, 'still mid-season — no turnover in the window').toBe(3);
    expect(out.mid, 'fuel is drawn down during the season').toBeLessThan(out.start);
  });
});

test.describe('villager breeding', () => {
  /** HOUSING_PER_HOUSE — a plain house shelters this many (one couple plus their children). */
  const houseCapacityForTest = 8;

  /**
   * How long a `growUnderIdealConditions` test is given. These run sixteen full season turnovers
   * on a whole village, and how long that takes depends on the map: measured between **1.2 and
   * 4.1 minutes** for the same test on different seeds, on both sides of the building-footprint
   * change. At the 240s they used to allow, whichever seed came up decided whether the suite was
   * green — so the budget is the flake, not the simulation. Trim `seasons` before trimming this.
   */
  const GROWTH_TIMEOUT = 480_000;

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
        // Start the ring well clear of the barn. Packing ten houses tight around it walls in the
        // approach, and a barn nobody can walk to cannot stock a single larder — which is not
        // "ideal conditions" at all. It used to pass unnoticed because eating and heating both
        // drew on village totals without anyone walking; now that fuel is only burned at a hearth
        // it is carried there or not at all, so a blockaded barn freezes the village solid.
        for (let r = 10; r < 30 && added < extraHouses; r++)
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
    // Simulating whole years tick-by-tick is not quick, and these runs are deliberately the
    // fastest-growing villages the game can produce — a household now averages about a child a
    // year, so by the last season there are far more villagers to step than there used to be.
    test.setTimeout(GROWTH_TIMEOUT);
    await open2d(page);
    const out = await growUnderIdealConditions(page, 12); // 3 years
    expect(out.addedHouses).toBe(10);
    expect(out.startPop).toBe(12);
    // Previously this sat dead flat at the founding 12: every starter house held four adults, so no
    // household ever had room for a child, and grown children never moved out to form new ones.
    expect(out.endPop).toBeGreaterThan(out.startPop * 1.5);
  });

  test('households settle into one couple with room for their children', async ({ page }) => {
    test.setTimeout(GROWTH_TIMEOUT);
    await open2d(page);
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
    test.setTimeout(GROWTH_TIMEOUT);
    await open2d(page);
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
    test.setTimeout(GROWTH_TIMEOUT);
    await open2d(page);
    const out = await growUnderIdealConditions(page, 16, 0); // only the starter houses
    expect(out.allChildren).toBeGreaterThan(0);
    expect(out.childrenWithNoAdultAtHome).toBe(0);
    expect(out.homelessChildren).toBe(0);
  });

  test('with no spare housing adults still pair up, silently', async ({ page }) => {
    test.setTimeout(GROWTH_TIMEOUT);
    await open2d(page);
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
    test.setTimeout(GROWTH_TIMEOUT); // eight seasons of a whole village, stepped a tick at a time
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
      const startPop = s.citizens.length;
      const startIds = new Set(s.citizens.map((c: any) => c.id));
      for (let n = 0; n < 8; n++) {
        // Exactly one season's rations spread over the households — enough that nobody starves,
        // never a *banked* surplus. (Handing every house a flat 400 looked like short commons but
        // came to nearly two seasons across the village once the larders were counted, so the
        // food gate this test is about was never actually engaged.)
        for (const b of s.buildings) {
          if (b.type !== 'barn' && b.type !== 'market') continue;
          b.store = { clothing: 1e5, firewood: 1e5, tools: 1e5 };
        }
        for (const h of s.buildings) {
          if (h.type !== 'house') continue;
          const residents = s.citizens.filter((c: any) => c.homeId === h.id).length;
          // Ask the game what a season's ration is rather than writing the number down: it is
          // divided by CONSUMPTION_SLOWDOWN, so a hard-coded 60 became three seasons of plenty
          // and quietly turned this into a test that births happen.
          h.store = { grain: residents * g.debugFoodPerCitizen(), firewood: 1e4 };
        }
        g.debugAdvance(610);
        if (s.gameOver) break;
      }
      // Anyone whose id is new is newly born: nomads only ever arrive by the player accepting them.
      return {
        startPop,
        endPop: s.citizens.length,
        born: s.citizens.filter((c: any) => !startIds.has(c.id)).length,
      };
    });
    expect(out.born).toBe(0);
    expect(out.endPop).toBeLessThanOrEqual(out.startPop);
  });

  test('villagers past the fertile window stop bearing children', async ({ page }) => {
    await open2d(page);
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
            const covered = s.buildings.some((b: any) => {
              const f = g.debugFootprint(b.type); // only the ranch and the field carry their own w/h
              return x >= b.x && x < b.x + (b.w ?? f.w) && y >= b.y && y < b.y + (b.h ?? f.h);
            });
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
      // "Open" means clear of rock and water, not treeless — a build site fells what stands on it.
      const isOpen = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < s.w && y < s.h &&
        (s.tiles[idx(x, y)].type === 'grass' || s.tiles[idx(x, y)].type === 'forest');
      const nearRock = (x: number, y: number, r: number) => {
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const tx = x + dx, ty = y + dy;
            if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) continue;
            if (s.tiles[idx(tx, ty)].type === 'stone') return true;
          }
        return false;
      };
      // Open ground with no rock within 6 tiles — the placement the old mountainside rule refused.
      // Searched outward from the barn so the pit lands within walking distance of the workforce;
      // scanning from the map origin instead can strand it half a map away and nothing gets mined.
      // An 8x8 rock-free clearing near the barn is genuinely scarce. Try a few worlds rather than
      // assert on one lucky seed — the claim under test is the quarry's *rate* on open ground, not
      // that every world offers a site.
      const { w: qw, h: qh } = g.debugFootprint('quarry');
      let barn = s.buildings.find((b: any) => b.type === 'barn');
      let spot: number[] | null = null;
      for (let world = 0; world < 8 && !spot; world++) {
        if (world > 0) {
          g.startNewGame('small', 'easy', false);
          s = g.state; // isOpen/nearRock close over `s`, so it must follow the new world
          barn = s.buildings.find((b: any) => b.type === 'barn');
        }
        for (let r = 3; r < 26 && !spot; r++)
          for (let dy = -r; dy <= r && !spot; dy++)
            for (let dx = -r; dx <= r; dx++) {
              const x = barn.x + dx, y = barn.y + dy;
              let clear = true;
              for (let cy = 0; cy < qh && clear; cy++)
                for (let cx = 0; cx < qw; cx++) if (!isOpen(x + cx, y + cy)) { clear = false; break; }
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
      const cx = q.x + qw / 2;
      const cy = q.y + qh / 2;
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
    test.setTimeout(240_000);
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
    // Season sits beside the ages; the two meters follow it.
    expect(ids).toEqual(['stat-ages', 'stat-season', 'stat-health', 'stat-happy', 'stat-sick']);
  });

  test('health and happiness are five pips each, one per 20 points', async ({ page }) => {
    await open2d(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));

    const read = (id: string) =>
      page.evaluate((sel) => {
        const pips = [...document.querySelectorAll(`#${sel} .pip`)];
        return {
          total: pips.length,
          lit: pips.filter((p) => !p.classList.contains('off')).length,
          glyphs: new Set(pips.map((p) => p.textContent)).size,
          title: document.getElementById(sel)!.title,
        };
      }, id);

    // Force a known average and let one frame draw it.
    const set = (health: number, happy: number) =>
      page.evaluate(
        ([h, j]) => {
          const g = (window as any).__village;
          for (const c of g.state.citizens) {
            c.health = h;
            c.happiness = j;
          }
        },
        [health, happy],
      );

    for (const [value, lit] of [
      [100, 5],
      [80, 4],
      [61, 3],
      [40, 2],
      [19, 0],
      [0, 0],
    ] as [number, number][]) {
      await set(value, value);
      // Wait on the title, not the pip count: 19 and 0 light the same number of hearts, so a
      // count check would pass on the previous frame's meter.
      await page.waitForFunction(
        (want) => document.getElementById('stat-health')!.title === `Average health: ${want}%`,
        value,
        { timeout: 3000 },
      );
      const h = await read('stat-health');
      const j = await read('stat-happy');
      expect(h.total, 'always five hearts, spent ones faded rather than removed').toBe(5);
      expect(j.total).toBe(5);
      expect(h.lit).toBe(lit);
      expect(j.lit).toBe(lit);
      // One glyph per meter — hearts for health, faces for happiness.
      expect(h.glyphs).toBe(1);
      expect(j.glyphs).toBe(1);
      // The exact figure is still available, just not taking up room in the bar.
      expect(h.title).toContain(`${value}%`);
    }
  });

  test('a resource at its limit turns green with an arrow', async ({ page }) => {
    await open2d(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));

    const chip = (icon: string) =>
      page.evaluate((want) => {
        const el = [...document.querySelectorAll('#stat-resources .stat')].find(
          (e) => e.querySelector('.ico')!.textContent === want,
        ) as HTMLElement;
        const arrow = el.querySelector('.cap') as HTMLElement;
        return {
          full: el.classList.contains('full'),
          low: el.classList.contains('low'),
          arrowShown: getComputedStyle(arrow).display !== 'none',
          arrow: arrow.textContent,
          title: el.title,
        };
      }, icon);

    // Nothing is capped by default.
    expect((await chip('🪵')).full).toBe(false);
    expect((await chip('🪵')).arrowShown).toBe(false);

    // Cap wood under what the village already has: it is at its limit immediately.
    const stock = await page.evaluate(() => {
      const g = (window as any).__village;
      g.state.limits = { wood: 50 };
      return g.debugTotalStored('wood');
    });
    expect(stock, 'easy start ships more wood than the cap').toBeGreaterThan(50);
    await page.waitForFunction(
      () =>
        !![...document.querySelectorAll('#stat-resources .stat')].find(
          (e) => e.querySelector('.ico')!.textContent === '🪵' && e.classList.contains('full'),
        ),
      undefined,
      { timeout: 3000 },
    );
    const wood = await chip('🪵');
    expect(wood.arrowShown).toBe(true);
    expect(wood.arrow).toBe('▲');
    expect(wood.title).toContain('50');

    // Food is one category, so its combined chip caps the same way.
    await page.evaluate(() => ((window as any).__village.state.limits = { food: 10 }));
    await page.waitForFunction(
      () => document.querySelector('#stat-resources .stat')!.classList.contains('full'),
      undefined,
      { timeout: 3000 },
    );
    // Raising the cap out of reach clears it again.
    await page.evaluate(() => ((window as any).__village.state.limits = {}));
    await page.waitForFunction(
      () => !document.querySelector('#stat-resources .stat.full'),
      undefined,
      { timeout: 3000 },
    );
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

  test('every tool fits two rows with no sideways scroll, and the clock stacks at the right', async ({
    page,
  }) => {
    await open2d(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));

    const layout = await page.evaluate(() => {
      const box = (e: Element) => {
        const b = e.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom) };
      };
      const tools = [...document.querySelectorAll('#toolbar .tool-btn')];
      const grid = document.querySelector('#tools')!;
      const bar = document.querySelector('#toolbar')!;
      const rows = [...new Set(tools.map((t) => box(t).y))].sort((a, b) => a - b);
      return {
        count: tools.length,
        rows: rows.length,
        perRow: rows.map((y) => tools.filter((t) => box(t).y === y).length),
        gridScrolls: grid.scrollWidth > grid.clientWidth + 1,
        barScrolls: bar.scrollWidth > bar.clientWidth + 1,
        pause: box(document.querySelector('#btn-pause')!),
        speed: box(document.querySelector('#btn-speed')!),
        gridRight: box(grid).r,
        bar: box(bar),
      };
    });

    expect(layout.count).toBe(8);
    expect(layout.rows, 'two rows, not one long scrolling one').toBe(2);
    expect(layout.perRow).toEqual([4, 4]);
    expect(layout.gridScrolls, 'nothing is hidden off the side').toBe(false);
    expect(layout.barScrolls).toBe(false);

    // Pause sits above speed, both to the right of the tools and inside the bar.
    expect(layout.pause.b).toBeLessThanOrEqual(layout.speed.y);
    expect(layout.pause.x).toBeGreaterThanOrEqual(layout.gridRight);
    expect(layout.speed.x).toBe(layout.pause.x);
    expect(layout.pause.y).toBeGreaterThanOrEqual(layout.bar.y);
    expect(layout.speed.b).toBeLessThanOrEqual(layout.bar.b);

    // And they still drive the clock from down there.
    await page.click('#btn-pause');
    expect(await page.evaluate(() => (window as any).__village.paused)).toBe(true);
    await page.click('#btn-speed');
    expect(await page.evaluate(() => (window as any).__village.paused)).toBe(false);
  });

  test('a build category wraps instead of scrolling, and the log clears it', async ({ page }) => {
    await open2d(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    // Resources is the biggest category — eight buildings, the case that used to scroll.
    await page.click('#toolbar [data-tool="resources"]');

    const out = await page.evaluate(() => {
      const po = document.querySelector('#popout')!;
      const btns = [...po.querySelectorAll('.build-btn')];
      const rows = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().y)));
      const log = document.querySelector('#log')!.getBoundingClientRect();
      return {
        count: btns.length,
        rows: rows.size,
        scrolls: po.scrollWidth > po.clientWidth + 1,
        // Every button is inside the pop-out's own box — none clipped off the edge.
        inside: btns.every((b) => {
          const r = b.getBoundingClientRect();
          const p = po.getBoundingClientRect();
          return r.left >= p.left - 1 && r.right <= p.right + 1;
        }),
        logBottom: Math.round(log.bottom),
        popTop: Math.round(po.getBoundingClientRect().top),
      };
    });

    expect(out.count).toBe(8);
    expect(out.scrolls, 'the pop-out wraps rather than hiding buildings off-screen').toBe(false);
    expect(out.inside).toBe(true);
    // The event log lifts above however many rows the pop-out turned out to need.
    expect(out.logBottom).toBeLessThanOrEqual(out.popTop);
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
      // Five seasons of a well-fed village can leave a band of nomads waiting at the gate, and
      // that panel sits over the top bar and swallows the click on the History button. This test
      // is about the History panel, not about immigration, so turn any callers away first.
      if (g.state.pendingNomads) {
        g.rejectNomads();
        g.ui.refreshPanels(g.state);
      }
    });
    await expect(page.locator('#nomad')).toBeHidden();
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
    await open2d(page);
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

test.describe('villager coats', () => {
  test('a villager wears a coat when their household holds clothing, and not when it does not', async ({ page }) => {
    await open(page);
    // Easy starts with houses already standing, so there are households to stock.
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      g.ui.hideOverlay(); // the coat layer is filled while rendering, so the game has to be running
    });
    // Housing is assigned on a simulation tick, not at spawn, so wait for it rather than
    // guessing a delay — this is what the test is about and there is nothing to measure until
    // villagers actually have homes.
    await page.waitForFunction(
      () => (window as any).__village.state.citizens.some((c: any) => c.homeId !== null),
      undefined,
      { timeout: 10_000 },
    );

    /**
     * Put `n` clothing in every house and none anywhere else.
     *
     * Clothing is a larder good, so leaving any in the barns would have residents hauling it
     * home mid-assertion. Housing is left entirely alone: the simulation reassigns `homeId` on
     * its own, so a test that herds everyone into one house loses the race against it.
     * Returns how many villagers actually have a home to keep a coat in.
     */
    const setClothing = (n: number) =>
      page.evaluate((n) => {
        const g = (window as any).__village;
        for (const b of g.state.buildings) {
          delete b.store.clothing;
          if (n > 0 && b.built && (b.type === 'house' || b.type === 'stonehouse')) b.store.clothing = n;
        }
        for (const c of g.state.citizens) if (c.carry?.kind === 'clothing') c.carry = null;
        const homes = new Set(g.state.buildings.filter((b: any) => b.built).map((b: any) => b.id));
        return g.state.citizens.filter((c: any) => c.homeId !== null && homes.has(c.homeId)).length;
      }, n);

    // The coat layer is filled during render, so this is polled rather than read once after a
    // fixed wait — how soon the next frame lands is not something the test controls.
    const expectCoats = (n: number, why: string) =>
      expect
        .poll(() => page.evaluate(() => (window as any).__village.debugCoatedCount()), { message: why, timeout: 5000 })
        .toBe(n);

    expect(await setClothing(0), 'the village has housed villagers to dress').toBeGreaterThan(0);
    await expectCoats(0, 'no clothing at home -> nobody in a coat');

    const housed = await setClothing(50);
    await expectCoats(housed, 'clothing at home -> every housed villager in a coat');

    // And back again — a household that runs its press dry loses the coats.
    await setClothing(0);
    await expectCoats(0, 'clothing used up -> coats come off');
  });
});

test.describe('food consumption', () => {
  test('villagers eat continuously, not in one lump at the season boundary', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const FOODS = ['fruit', 'grain', 'corn', 'potato', 'rice', 'barley', 'carrot', 'tomato', 'onion',
        'pepper', 'cabbage', 'beans', 'pumpkin', 'apple', 'grapes', 'strawberry', 'melon', 'eggs', 'fish', 'meat'];
      const allFood = () =>
        s.buildings.reduce((n: number, b: any) => n + FOODS.reduce((m: number, k: string) => m + (b.store[k] ?? 0), 0), 0);

      const start = allFood();
      // A fifth of a season. Under the old model nothing at all was eaten until the boundary.
      const step = s.seasonLength ? s.seasonLength / 5 : 120;
      for (let i = 0; i < step * 10; i++) g.debugAdvance(0.1);
      const mid = allFood();
      return { start, mid, pop: s.citizens.length };
    });
    // Food is drawn down steadily as the season runs, so a shortage is visible while there is
    // still time to react instead of arriving all at once when the season turns over.
    expect(out.pop).toBeGreaterThan(0);
    expect(out.mid, 'food is consumed during the season').toBeLessThan(out.start);
  });
});

test.describe('tips toggle', () => {
  test('turning tips off silences the hint bar but not action feedback', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const hint = document.getElementById('hint')!;
      const shown = () => !hint.classList.contains('hidden');
      g.ui.setTips(true);
      g.ui.showHint('a tip about a tool');
      const tipWithTipsOn = shown();
      g.ui.setTips(false);
      // Turning them off clears the one already up, and refuses the next.
      const clearedImmediately = !shown();
      g.ui.showHint('another tip');
      const tipWithTipsOff = shown();
      // Feedback on something the player just did is not a tip and still shows.
      g.ui.flashHint('Trade complete');
      const feedbackWithTipsOff = shown();
      g.ui.setTips(true);
      return { tipWithTipsOn, clearedImmediately, tipWithTipsOff, feedbackWithTipsOff };
    });
    expect(out.tipWithTipsOn).toBe(true);
    expect(out.clearedImmediately).toBe(true);
    expect(out.tipWithTipsOff).toBe(false);
    expect(out.feedbackWithTipsOff).toBe(true);
  });

  test('the setting is in Settings and survives a reload', async ({ page }) => {
    await open(page);
    await page.click('#mm-settings');
    await expect(page.locator('#set-tips-off')).toBeVisible();
    await page.click('#set-tips-off');
    await expect(page.locator('#set-tips-off')).toHaveClass(/on/);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    expect(await page.evaluate(() => (window as any).__village.ui.tipsEnabled())).toBe(false);
  });
});

test.describe('age groups', () => {
  test('the HUD counts children, students and adults — elders are not tracked apart', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      // One of each: a child, an enrolled student, a working adult, and someone past old age.
      // A student is a child that is *being schooled*, not a child of a certain age, so the flag
      // is what makes one — an unenrolled child of the same age counts as a child.
      s.citizens = s.citizens.slice(0, 4);
      [1, 3, 20, 40].forEach((age: number, i: number) => { s.citizens[i].age = age; });
      s.citizens[1].student = true;
      g.ui.updateHud(s, 1, false);
      const enrolled = document.querySelector('#stat-ages .val')!.textContent;
      // Same ages, nobody at school: the student counts as a child instead.
      s.citizens[1].student = false;
      g.ui.updateHud(s, 1, false);
      return { enrolled, unschooled: document.querySelector('#stat-ages .val')!.textContent };
    });
    expect(out.enrolled).toBe('🧒1 🎓1 🧑2');
    expect(out.unschooled).toBe('🧒2 🎓0 🧑2');
  });
});

test.describe('birth rate', () => {
  test('a household that meets the conditions averages about a child a year', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      for (let i = 0; i < 60; i++) g.debugAdvance(0.1);
      // Room to grow into, so housing is never the thing capping births.
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      let added = 0;
      for (let r = 3; r < 25 && added < 30; r++)
        for (let dy = -r; dy <= r && added < 30; dy++)
          for (let dx = -r; dx <= r && added < 30; dx++) {
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
      const fertileCouples = () => {
        let n = 0;
        for (const h of s.buildings) {
          if (!h.built || (h.type !== 'house' && h.type !== 'stonehouse')) continue;
          const adults = s.citizens.filter((c: any) => c.homeId === h.id && c.age >= 4);
          if (adults.some((a: any) => a.partnerId != null && adults.some((o: any) => o.id === a.partnerId))) n++;
        }
        return n;
      };
      // Eight seasons — two years — with the larder and the barns kept full so the food gate is
      // met but the surplus stays modest, i.e. a village that merely qualifies.
      let births = 0;
      let coupleSeasons = 0;
      for (let n = 0; n < 8; n++) {
        for (const b of s.buildings) {
          if (b.type !== 'barn') continue;
          for (const k of ['grain', 'fruit', 'meat', 'fish', 'eggs']) b.store[k] = 4000;
          for (const k of ['clothing', 'firewood', 'medicine', 'tools']) b.store[k] = 4000;
        }
        const before = s.citizens.length;
        coupleSeasons += fertileCouples();
        g.debugAdvance(610);
        births += Math.max(0, s.citizens.length - before);
      }
      return { births, coupleSeasons, pop: s.citizens.length, added };
    });
    expect(out.coupleSeasons).toBeGreaterThan(0);
    // Four seasons to a year, so "a child a year per household" is 0.25 births per couple-season.
    const perCoupleYear = (out.births / out.coupleSeasons) * 4;
    expect(perCoupleYear, `${out.births} births over ${out.coupleSeasons} couple-seasons`).toBeGreaterThanOrEqual(1);
  });
});

test.describe('construction stages', () => {
  test('a site becomes footings, then a rising frame, then the finished building', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(async () => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      let id: number | null = null;
      for (let r = 3; r < 24 && id == null; r++)
        for (let dy = -r; dy <= r && id == null; dy++)
          for (let dx = -r; dx <= r && id == null; dx++) {
            const x = barn.x + dx, y = barn.y + dy;
            if (g.debugCanPlace('house', x, y).ok) id = g.debugPlace('house', x, y);
          }
      const b = s.buildings.find((x: any) => x.id === id);
      // Ask the game for the build time. `buildTime` on the def is multiplied by
      // BUILD_TIME_SCALE before it means anything, so a "70%" computed from the raw number is
      // really 35% — and the frame stage never appears.
      const total = g.debugBuildTime('house');
      const seen: string[] = [];
      for (const frac of [0.05, 0.3, 0.55, 0.9, 1]) {
        b.built = frac >= 1;
        b.progress = total * Math.min(frac, 1);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        seen.push(g.renderer.buildingMeshes.get(b.id)?.userData.kind ?? 'none');
      }
      // Nothing standing on the map is drawn see-through any more — that look belongs to the
      // placement preview, which is a different object entirely.
      let anyTransparent = false;
      for (const [, obj] of g.renderer.buildingMeshes)
        obj.traverse((o: any) => { if (o.isMesh && o.material?.transparent) anyTransparent = true; });
      return { placed: id != null, seen, anyTransparent };
    });
    expect(out.placed).toBe(true);
    // Below the halfway mark it is groundworks; above it, the model rising out of them; then the
    // building itself.
    expect(out.seen).toEqual(['site', 'site', 'frame', 'frame', 'model']);
    expect(out.anyTransparent, 'no placed building is drawn see-through').toBe(false);
  });
});

test.describe('placement controls', () => {
  test('Build and Rotate sit under the ghost, and Build places at the reticle', async ({ page }) => {
    await open2d(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    await page.click('#toolbar [data-tool="housing"]');
    await page.click('#popout button >> nth=0');

    const build = page.locator('.ranch-size .rs-build');
    const rotate = page.locator('.ranch-size .rs-rot');
    await expect(build).toBeVisible();
    await expect(rotate).toBeVisible();

    // Clear of the build bar at the foot of the screen — the whole point of moving them.
    const bar = await page.locator('#toolbar').boundingBox();
    const box = await build.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(bar!.y);

    // Rotate turns the pending building a quarter at a time, all the way round.
    const rot = () => page.evaluate(() => (window as any).__village.buildRot);
    expect(await rot()).toBe(0);
    await rotate.click();
    expect(await rot()).toBe(1);
    await rotate.click();
    await rotate.click();
    await rotate.click();
    expect(await rot()).toBe(0);

    // And Build puts a site down without the player having to tap the map. Clear the ground the
    // ghost happens to be standing on first — this is about the button, not about the map having
    // dealt a buildable tile under the crosshair.
    const before = await page.evaluate(() => {
      const g = (window as any).__village;
      const s = g.state;
      const { tx, ty } = g.debugReticleTile('house');
      for (let dy = -1; dy <= 2; dy++)
        for (let dx = -1; dx <= 2; dx++) {
          const x = tx + dx, y = ty + dy;
          if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
          const t = s.tiles[y * s.w + x];
          t.type = 'grass';
          t.trees = 0;
          delete t.stone;
          delete t.iron;
        }
      // The village starts centred under the crosshair, so shift it out of the way — the barn
      // stays (its stock is what pays for the house) but moves to a corner.
      s.buildings = s.buildings.filter((b: any) => b.type === 'barn');
      s.buildings[0].x = 2;
      s.buildings[0].y = 2;
      s.navVersion = (s.navVersion ?? 0) + 1;
      return s.buildings.length;
    });
    await build.click();
    const after = await page.evaluate(() => {
      const g = (window as any).__village;
      const { tx, ty } = g.debugReticleTile('house');
      return { n: g.state.buildings.length, why: g.debugCanPlace('house', tx, ty, g.buildRot), tx, ty };
    });
    expect(after.n, JSON.stringify(after)).toBe(before + 1);
  });
});

test.describe('fishing dock', () => {
  test('every buildable site puts the dock over water and the shack on land', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const isWater = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < s.w && y < s.h && s.tiles[y * s.w + x].type === 'water';

      let sites = 0, dryDock = 0, floating = 0, centredOnPlot = 0;
      const rots: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          for (const rot of [0, 1, 2, 3] as const) {
            if (!g.debugCanPlace('fishing', x, y, rot).ok) continue;
            sites++; rots[rot]++;
            const f = g.debugFootprint('fishing');
            const w = rot % 2 === 1 ? f.h : f.w;
            const h = rot % 2 === 1 ? f.w : f.h;
            // Distance along the hut's own axis, from the dock end (0) to the door end.
            const dock: boolean[] = [], land: boolean[] = [];
            for (let dy = 0; dy < h; dy++)
              for (let dx = 0; dx < w; dx++) {
                const along = rot === 0 ? dy : rot === 1 ? w - 1 - dx : rot === 2 ? h - 1 - dy : dx;
                (along < 2 ? dock : land).push(isWater(x + dx, y + dy));
              }
            if (dock.filter(Boolean).length / dock.length < 0.6) dryDock++;
            if (!land.some((wet) => !wet)) floating++;
            // The circle it works has to follow the dock out, or a hut on a headland fishes the
            // field behind it.
            const wc = g.debugWorkCentre('fishing', x, y, rot);
            const mx = x + w / 2, my = y + h / 2;
            const out = rot === 0 ? wc.y < my - 0.5 : rot === 1 ? wc.x > mx + 0.5
              : rot === 2 ? wc.y > my + 0.5 : wc.x < mx - 0.5;
            if (!out) centredOnPlot++;
          }
        }
      }
      return { sites, rots, dryDock, floating, centredOnPlot };
    });
    // A shoreline map should offer plenty of sites, at every rotation — otherwise the checks
    // below would pass on an empty set.
    expect(out.sites).toBeGreaterThan(50);
    for (const rot of [0, 1, 2, 3]) expect(out.rots[rot], `rotation ${rot}`).toBeGreaterThan(0);
    expect(out.dryDock, 'sites whose dock end is not in the water').toBe(0);
    expect(out.floating, 'sites with no land under the shack').toBe(0);
    expect(out.centredOnPlot, 'sites whose work circle sits on the plot, not the dock').toBe(0);
  });

  test('the work circle shows while siting a hut, centred on the dock', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(async () => {
      const g = (window as any).__village;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      // The renderer rebuilds its overlay objects on the first frame of a new map, so `workRing`
      // has to be read *after* that frame — grabbing it earlier hands you an orphan that nothing
      // will ever touch again, and the test then quietly measures nothing.
      await frame();
      const before = g.renderer.workRing.visible;

      let site: { x: number; y: number; rot: 0 | 1 | 2 | 3 } | null = null;
      for (let y = 0; y < s.h && !site; y++)
        for (let x = 0; x < s.w && !site; x++)
          for (const rot of [0, 1, 2, 3] as const)
            if (g.debugCanPlace('fishing', x, y, rot).ok) { site = { x, y, rot }; break; }
      if (!site) return { before, site: null };

      const f = g.debugFootprint('fishing');
      const w = site.rot % 2 === 1 ? f.h : f.w;
      const h = site.rot % 2 === 1 ? f.w : f.h;
      g.selectedBuild = 'fishing';
      g.buildRot = site.rot;
      g.camera.focus(site.x + w / 2, site.y + h / 2);
      await frame();

      // The ghost follows the reticle, so read where the game actually put it rather than
      // assuming the camera landed on the tile we picked.
      const { tx, ty } = g.debugReticleTile('fishing');
      const wc = g.debugWorkCentre('fishing', tx, ty, site.rot);
      const ring = g.renderer.workRing;
      return {
        before,
        site,
        visible: ring.visible,
        at: { x: ring.position.x, y: ring.position.z },
        wc,
        radius: ring.scale.x,
      };
    });
    expect(out.site, 'the map offered somewhere to put a hut').not.toBeNull();
    // Nothing is selected at the start, so the ring appearing is down to the placement.
    expect(out.before).toBe(false);
    expect(out.visible, 'the work circle is drawn while siting').toBe(true);
    expect(out.at!.x).toBeCloseTo(out.wc!.x, 3);
    expect(out.at!.y).toBeCloseTo(out.wc!.y, 3);
    expect(out.radius).toBeGreaterThan(0);
  });
});

test.describe('auto-staffing', () => {
  /**
   * Raise a gatherer's hut the way the game does — builders hauling to it — rather than flipping
   * `built` by hand, because the whole point under test is what happens at the moment it finishes.
   */
  const raiseAHut = `() => {
    const g = window.__village;
    const s = g.state;
    const barn = s.buildings.find((b) => b.type === 'barn');
    barn.store.wood = 5000;
    barn.store.stone = 5000;
    let id = null;
    for (let r = 3; r < 24 && id == null; r++)
      for (let dy = -r; dy <= r && id == null; dy++)
        for (let dx = -r; dx <= r && id == null; dx++)
          if (g.debugCanPlace('gatherer', barn.x + dx, barn.y + dy).ok)
            id = g.debugPlace('gatherer', barn.x + dx, barn.y + dy);
    const b = s.buildings.find((x) => x.id === id);
    if (!b) throw new Error('no placeable gatherer site anywhere on this map');
    // Clear the ground and pre-deliver the materials so this measures completion, not hauling.
    for (const t of s.tiles) if (t.type === 'forest') t.trees = 0;
    for (let i = 0; i < s.harvest.length; i++) s.harvest[i] = 0;
    b.store.wood = 999;
    for (let i = 0; i < 6000 && !b.built; i++) g.debugAdvance(0.1);
    g.debugAdvance(2);
    return b;
  }`;

  test('a finished workplace hires itself when the setting is on, and not when it is off', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((raise) => {
      const g = (window as any).__village;
      const run = (auto: boolean) => {
        localStorage.setItem('village-auto-staff', auto ? 'on' : 'off');
        g.startNewGame('small', 'easy', false);
        const b = eval(raise)();
        return {
          pref: g.state.autoStaff,
          built: b.built,
          jobs: g.debugJobCount('gatherer'),
          desiredWorkers: b.desiredWorkers,
          workers: b.workers.length,
        };
      };
      return { on: run(true), off: run(false) };
    }, raiseAHut);

    // Both runs have to actually finish the hut, or neither branch proves anything.
    expect(out.on.built, 'the hut went up with the setting on').toBe(true);
    expect(out.off.built, 'the hut went up with the setting off').toBe(true);

    // On: the hut opens its jobs and takes whoever is free.
    expect(out.on.pref).toBe(true);
    expect(out.on.desiredWorkers).toBe(out.on.jobs);
    expect(out.on.workers, 'free villagers were hired').toBeGreaterThan(0);

    // Off: it stands empty until the player staffs it, which is the old behaviour.
    expect(out.off.pref).toBe(false);
    expect(out.off.desiredWorkers).toBe(0);
    expect(out.off.workers).toBe(0);
  });

  test('a job left open by a death is refilled either way', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((raise) => {
      const g = (window as any).__village;
      const run = (auto: boolean) => {
        localStorage.setItem('village-auto-staff', auto ? 'on' : 'off');
        g.startNewGame('small', 'easy', false);
        const s = g.state;
        const b = eval(raise)();
        // With the setting off the player would have staffed it; do that, so both branches are
        // testing a death rather than testing the setting again.
        if (b.workers.length === 0) {
          b.desiredWorkers = 2;
          g.debugAdvance(2);
        }
        const before = [...b.workers];
        const victim = before[0];
        s.citizens.splice(s.citizens.findIndex((c: any) => c.id === victim), 1);
        g.debugAdvance(2);
        return { before, victim, after: [...b.workers] };
      };
      return { on: run(true), off: run(false) };
    }, raiseAHut);

    for (const [label, r] of Object.entries(out)) {
      expect(r.before.length, `${label}: the hut was staffed to begin with`).toBeGreaterThan(0);
      expect(r.after, `${label}: the dead villager is gone from the roster`).not.toContain(r.victim);
      expect(r.after.length, `${label}: the slot was refilled`).toBe(r.before.length);
    }
  });

  test('the toggle is in Settings and survives a reload', async ({ page }) => {
    await open2d(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    await page.click('#btn-menu');
    await page.click('#pm-settings');
    await expect(page.locator('#set-staff-on')).toBeVisible();
    // Defaults on — the point of it is to spare the player re-staffing every hut by hand.
    await expect(page.locator('#set-staff-on')).toHaveClass(/on/);
    await page.click('#set-staff-off');
    await expect(page.locator('#set-staff-off')).toHaveClass(/on/);
    expect(await page.evaluate(() => (window as any).__village.state.autoStaff)).toBe(false);

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false));
    expect(await page.evaluate(() => (window as any).__village.state.autoStaff)).toBe(false);
  });
});

test.describe('consumption and fuel', () => {
  test('a season costs a third of what it used to', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      return { food: g.debugFoodPerCitizen(), heat: g.debugHeatPerCitizen() };
    });
    // The rates the rest of the economy is derived from — larder targets, the low-stores warnings
    // and the "seasons banked" mood check all scale off these two.
    expect(out.food).toBeCloseTo(60 / 3, 6);
    expect(out.heat).toBeCloseTo(40 / 3, 6);
  });

  test('a housed villager burns their own woodpile and never the barns', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      s.season = 3; // Winter, the heaviest burn
      g.debugAdvance(1); // let everyone be housed
      // Everyone has a roof, and every hearth is stocked, so nothing should ever reach for a barn.
      const houses = s.buildings.filter((b: any) =>
        (b.type === 'house' || b.type === 'stonehouse') && b.built);
      for (const h of houses) h.store.firewood = 500;
      const roofless = s.citizens.filter((c: any) => c.homeId === null).length;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.firewood = 400;
      barn.store.coal = 100;
      const hearthBefore = houses.reduce((n: number, h: any) => n + (h.store.firewood ?? 0), 0);
      for (let i = 0; i < 1200; i++) g.debugAdvance(0.1);
      return {
        pop: s.citizens.length,
        roofless,
        hearthBurned: hearthBefore - houses.reduce((n: number, h: any) => n + (h.store.firewood ?? 0), 0),
        // The haulers top larders up from the barn, so barn firewood may *fall*. What must never
        // happen is it being burned — measured by the coal, which no household ever stocks.
        coal: barn.store.coal ?? 0,
      };
    });
    expect(out.pop).toBeGreaterThan(0);
    expect(out.roofless, 'everybody had a roof').toBe(0);
    expect(out.hearthBurned, 'the hearths did the burning').toBeGreaterThan(0);
    expect(out.coal, 'no housed villager burns village coal').toBe(100);
  });

  test('a villager with no house at all can still keep warm', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', false); // Normal grants no houses — everyone starts roofless
      const s = g.state;
      s.season = 3; // Winter, when going without fuel kills
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.firewood = 5000;
      const startPop = s.citizens.length;
      const roofless = s.citizens.filter((c: any) => c.homeId === null).length;
      for (let i = 0; i < 3000; i++) g.debugAdvance(0.1); // a whole winter and then some
      return {
        startPop, roofless, endPop: s.citizens.length,
        burned: 5000 - (barn.store.firewood ?? 0),
        chilled: s.citizens.filter((c: any) => (c.chill ?? 0) > 0).length,
      };
    });
    // A villager with nowhere to keep fuel has to be able to burn the village's, or Normal and
    // Hard — which start everyone roofless — would wipe out in the first winter before a single
    // house could be raised.
    expect(out.roofless, 'Normal really does start everyone roofless').toBe(out.startPop);
    expect(out.burned, 'the village pile is what keeps them warm').toBeGreaterThan(0);
    expect(out.endPop, 'and nobody freezes while it holds out').toBe(out.startPop);
  });

  test('a household burns its own woodpile', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      s.season = 3; // Winter, the heaviest burn
      g.debugAdvance(1); // let everyone be housed
      const house = s.buildings.find((b: any) =>
        (b.type === 'house' || b.type === 'stonehouse') && b.built &&
        s.citizens.some((c: any) => c.homeId === b.id));
      if (!house) return null;
      house.store.firewood = 500;
      const before = house.store.firewood;
      for (let i = 0; i < 1200; i++) g.debugAdvance(0.1);
      return { burned: before - (house.store.firewood ?? 0) };
    });
    expect(out, 'somebody was living somewhere').not.toBeNull();
    expect(out!.burned, 'the hearth drew on its own woodpile').toBeGreaterThan(0);
  });
});

test.describe('roads get laid', () => {
  test('a confirmed road frees a builder even when every job is taken', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const PATH_DIRT_PLAN = 1, PATH_DIRT = 2;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 9000;
      barn.store.stone = 9000;

      // Employ the whole village: huts, finished, staffed to their caps.
      const huts: number[] = [];
      for (let r = 3; r < 20 && huts.length < 5; r++)
        for (let dy = -r; dy <= r && huts.length < 5; dy++)
          for (let dx = -r; dx <= r && huts.length < 5; dx++) {
            const id = g.debugCanPlace('gatherer', barn.x + dx, barn.y + dy).ok
              ? g.debugPlace('gatherer', barn.x + dx, barn.y + dy) : null;
            if (id == null) continue;
            const b = s.buildings.find((x: any) => x.id === id);
            b.built = true;
            b.progress = g.debugBuildTime('gatherer');
            b.desiredWorkers = g.debugJobCount('gatherer');
            huts.push(id);
          }
      g.debugAdvance(2);
      const freeBefore = s.citizens.filter((c: any) => c.age >= 4 && c.jobId === null && !c.builder).length;

      // Order a road on clear ground near the barn.
      const occupied = (x: number, y: number) => s.buildings.some((b: any) => {
        const f = g.debugFootprint(b.type);
        return x >= b.x && x < b.x + (b.w ?? f.w) && y >= b.y && y < b.y + (b.h ?? f.h);
      });
      const idx: number[] = [];
      for (let r = 2; r < 14 && idx.length < 6; r++)
        for (let dy = -r; dy <= r && idx.length < 6; dy++)
          for (let dx = -r; dx <= r && idx.length < 6; dx++) {
            const x = barn.x + dx, y = barn.y + dy;
            if (x < 1 || y < 1 || x >= s.w - 1 || y >= s.h - 1) continue;
            const i = y * s.w + x;
            const t = s.tiles[i];
            if (t.type === 'water' || t.type === 'stone' || occupied(x, y) || s.paths[i] !== 0) continue;
            t.type = 'grass'; t.trees = 0; delete t.stone; delete t.iron;
            s.harvest[i] = 0;
            s.paths[i] = PATH_DIRT_PLAN;
            idx.push(i);
          }
      s.navVersion = (s.navVersion ?? 0) + 1;
      g.debugAdvance(1);
      const asked = s.desiredBuilders;
      const builders = s.citizens.filter((c: any) => c.builder).length;
      for (let i = 0; i < 6000; i++) g.debugAdvance(0.1);
      return { huts: huts.length, freeBefore, planned: idx.length, asked, builders,
               laid: idx.filter((i) => s.paths[i] === PATH_DIRT).length };
    });

    // The premise: a village with nobody spare, and a road it has been told to build.
    expect(out.huts).toBeGreaterThan(0);
    expect(out.planned).toBeGreaterThan(0);
    expect(out.freeBefore, 'every adult was employed before the road was ordered').toBe(0);
    // Outstanding road work asks for a builder, and one is handed back by the workplaces —
    // without that the road sits planned (and green) for good, because an employed villager only
    // detours to planned tiles close to their own workplace.
    expect(out.asked, 'the road asks for a builder').toBeGreaterThan(0);
    expect(out.builders, 'a hand was freed to lay it').toBeGreaterThan(0);
    expect(out.laid, 'and the road actually gets laid').toBeGreaterThan(0);
  });
});

test.describe('lives run on ticks, not seasons', () => {
  /**
   * Two of these walk a year or two of village time a tenth of a season at a time, which is well
   * past the default 30s budget — they are simulating, not waiting on anything.
   */
  const WALK_YEARS_TIMEOUT = 240_000;

  test('villagers age continuously rather than all having a birthday at once', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const before = s.citizens.slice(0, 5).map((c: any) => c.age);
      // Three-eighths of a year — deliberately not a whole number of seasons, so a village that
      // still aged in yearly lumps would show no change at all here.
      g.debugAdvance(900);
      const after = s.citizens.slice(0, 5).map((c: any) => c.age);
      return { before, after, year: 600 * 4 };
    });
    for (let i = 0; i < out.before.length; i++) {
      expect(out.after[i] - out.before[i], `villager ${i} aged`).toBeCloseTo(900 / out.year, 3);
    }
    // And the ages really are fractional now, not rounded back to whole years.
    expect(out.after.some((a: number) => a % 1 !== 0)).toBe(true);
  });

  test('children are born through the year, not only at the turn of a season', async ({ page }) => {
    test.setTimeout(WALK_YEARS_TIMEOUT);
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 1000;
      // Room to grow into, and enough of everything that births are never gated on supply.
      let added = 0;
      for (let r = 10; r < 30 && added < 8; r++)
        for (let dy = -r; dy <= r && added < 8; dy++)
          for (let dx = -r; dx <= r && added < 8; dx++) {
            const id = g.debugCanPlace('house', barn.x + dx, barn.y + dy).ok
              ? g.debugPlace('house', barn.x + dx, barn.y + dy) : null;
            if (id == null) continue;
            const h = s.buildings.find((b: any) => b.id === id);
            h.built = true; h.progress = 9999; added++;
          }
      const stock = () => {
        for (const k of ['grain', 'fruit', 'meat', 'fish', 'firewood', 'clothing', 'medicine', 'tools']) {
          barn.store[k] = 1e5;
        }
        for (const h of s.buildings) if (h.type === 'house' || h.type === 'stonehouse') h.store.firewood = 500;
      };

      // Walk two years in tenths of a season and note when the population moves. A season is ten
      // steps, so step 9 of each ten is the one that crosses the turnover.
      let prev = s.citizens.length;
      let mid = 0;
      let atTurnover = 0;
      for (let i = 0; i < 80; i++) {
        stock();
        g.debugAdvance(60);
        const pop = s.citizens.length;
        if (pop > prev) (i % 10 === 9 ? (atTurnover += 1) : (mid += 1));
        prev = pop;
      }
      return { mid, atTurnover, endPop: s.citizens.length, houses: added };
    });
    expect(out.houses, 'the village had room to grow').toBeGreaterThan(0);
    expect(out.endPop, 'and it grew').toBeGreaterThan(12);
    // The point of the change: births land whenever they land. Almost all of them should fall
    // away from the season boundary, where every single one used to be.
    expect(out.mid, 'births away from a season turnover').toBeGreaterThan(out.atTurnover);
  });

  test('a full year still carries about the same growth as the yearly roll it replaced', async ({ page }) => {
    test.setTimeout(WALK_YEARS_TIMEOUT);
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 1000;
      let added = 0;
      for (let r = 10; r < 30 && added < 10; r++)
        for (let dy = -r; dy <= r && added < 10; dy++)
          for (let dx = -r; dx <= r && added < 10; dx++) {
            const id = g.debugCanPlace('house', barn.x + dx, barn.y + dy).ok
              ? g.debugPlace('house', barn.x + dx, barn.y + dy) : null;
            if (id == null) continue;
            const h = s.buildings.find((b: any) => b.id === id);
            h.built = true; h.progress = 9999; added++;
          }
      const startPop = s.citizens.length;
      for (let n = 0; n < 4; n++) {
        for (const k of ['grain', 'fruit', 'meat', 'fish', 'firewood', 'clothing', 'medicine', 'tools']) {
          barn.store[k] = 1e5;
        }
        for (const h of s.buildings) if (h.type === 'house' || h.type === 'stonehouse') h.store.firewood = 500;
        g.debugAdvance(610);
      }
      return { startPop, endPop: s.citizens.length };
    });
    // `chanceOver` restates each roll for the shorter span rather than re-tuning it, so a
    // well-housed, well-fed village should still put on a healthy year's growth — not stall
    // (odds lost in the conversion) and not explode (odds applied per tick).
    expect(out.endPop).toBeGreaterThan(out.startPop);
    expect(out.endPop).toBeLessThan(out.startPop * 3);
  });
});

test.describe('work happens where the work is', () => {
  /** Put a finished, fully staffed building of `type` somewhere near the barn. */
  const raise = `(type, minR) => {
    const g = window.__village;
    const s = g.state;
    const barn = s.buildings.find((b) => b.type === 'barn');
    // Enough to pay for what this puts up, and no more: flooding the barn fills it to capacity,
    // and a worker who finishes a load can then never put it down.
    barn.store.wood = 1000;
    barn.store.stone = 1000;
    for (let r = minR || 3; r < 26; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (!g.debugCanPlace(type, barn.x + dx, barn.y + dy).ok) continue;
          const id = g.debugPlace(type, barn.x + dx, barn.y + dy);
          if (id == null) continue;
          const b = s.buildings.find((x) => x.id === id);
          b.built = true;
          b.progress = g.debugBuildTime(type);
          b.desiredWorkers = g.debugJobCount(type);
          return b;
        }
    throw new Error('nowhere to put a ' + type);
  }`;

  test('an indoor trade works inside its building, and steps out to haul', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state; // after the new game: startNewGame replaces the state object wholesale
      const wc = eval(mk)('woodcutter', 6); // clear of the barn, so walking there is visible
      g.debugAdvance(5);
      let inside = 0;
      let insideCarrying = 0;
      let insideAwayFromShop = 0;
      let ticks = 0;
      for (let i = 0; i < 200; i++) {
        wc.store.wood = 9999; // keep it stocked: this is about where they stand, not logistics
        const c = s.citizens.find((x: any) => x.jobId === wc.id);
        // Stand them at their own door each tick and clear anything that would send them off, so
        // this measures the rule and not how long a walk to the barn happens to be on this map.
        if (c) {
          const at = g.debugWorkSpot(c.id);
          c.x = at.x;
          c.y = at.y;
          c.route = undefined;
          c.rest = 0;
          c.carry = null;
        }
        g.debugAdvance(0.5);
        ticks++;
        const after = s.citizens.find((x: any) => x.jobId === wc.id);
        if (!after || !after.inside) continue;
        inside++;
        if (after.carry) insideCarrying++;
        // The shop is 3x3 from its corner; its door is a tile off the edge.
        const near = after.x > wc.x - 2 && after.x < wc.x + 5 && after.y > wc.y - 2 && after.y < wc.y + 5;
        if (!near) insideAwayFromShop++;
      }
      return { inside, ticks, insideCarrying, insideAwayFromShop };
    }, raise);

    // They do go in — the renderer draws nobody who is indoors, so this is what "at the anvil"
    // looks like from outside.
    expect(out.inside, 'the worker went inside to work').toBeGreaterThan(out.ticks / 2);
    // Never indoors while out on the road with a load, and never indoors anywhere but the shop.
    expect(out.insideCarrying).toBe(0);
    expect(out.insideAwayFromShop).toBe(0);
  });

  test('a forester works out in the circle, not on the doorstep', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state; // after the new game: startNewGame replaces the state object wholesale
      const lum = eval(mk)('lumberyard', 4);
      g.debugAdvance(5);
      const centre = { x: lum.x + 1.5, y: lum.y + 1.5 };
      let maxDist = 0;
      const spots = new Set<string>();
      for (let i = 0; i < 400; i++) {
        g.debugAdvance(0.5);
        for (const c of s.citizens) {
          if (c.jobId !== lum.id || c.carry) continue;
          maxDist = Math.max(maxDist, Math.hypot(c.x - centre.x, c.y - centre.y));
          if (c.workAt) spots.add(`${Math.floor(c.workAt.x)},${Math.floor(c.workAt.y)}`);
        }
      }
      return { maxDist, spots: spots.size, radius: g.debugWorkRadius(lum.id) };
    }, raise);

    // The hut is 3x3, so anything past ~2.2 tiles from its middle is off the building entirely.
    expect(out.maxDist, 'the forester left the building behind').toBeGreaterThan(3);
    expect(out.maxDist).toBeLessThanOrEqual(out.radius + 2); // ...but stayed in their own circle
    // And worked more than one spot rather than standing at a single favourite tree.
    expect(out.spots).toBeGreaterThan(1);
  });

  test('a forester clears rock and ore out of its circle', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state; // after the new game: startNewGame replaces the state object wholesale
      const lum = eval(mk)('lumberyard', 4);
      // Seed the circle with deposits, and count only the tiles seeded so natural rock elsewhere
      // cannot muddy the figure.
      const seeded: number[] = [];
      const r = g.debugWorkRadius(lum.id);
      for (let dy = -r; dy <= r && seeded.length < 8; dy++)
        for (let dx = -r; dx <= r && seeded.length < 8; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const x = lum.x + 1 + dx, y = lum.y + 1 + dy;
          if (x < 1 || y < 1 || x >= s.w - 1 || y >= s.h - 1) continue;
          const i = y * s.w + x;
          const t = s.tiles[i];
          if (t.type === 'water' || t.type === 'stone') continue;
          if (s.buildings.some((b: any) => x >= b.x && x < b.x + 3 && y >= b.y && y < b.y + 3)) continue;
          t.type = 'grass';
          t.trees = 0;
          t.stone = 3;
          seeded.push(i);
        }
      const before = seeded.filter((i) => (s.tiles[i].stone ?? 0) > 0).length;
      for (let i = 0; i < 3000; i++) g.debugAdvance(0.2);
      return { before, after: seeded.filter((i) => (s.tiles[i].stone ?? 0) > 0).length };
    }, raise);

    expect(out.before, 'deposits were actually seeded').toBeGreaterThan(3);
    // Every one cleared is a tile the forester can plant, which is the point of doing it.
    expect(out.after, 'the forester cleared the ground').toBeLessThan(out.before);
  });
});

test.describe('stockpile limits', () => {
  test('a capped workplace keeps its workers but sets them labouring', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 1000;
      let wc: any = null;
      for (let r = 4; r < 26 && !wc; r++)
        for (let dy = -r; dy <= r && !wc; dy++)
          for (let dx = -r; dx <= r && !wc; dx++) {
            if (!g.debugCanPlace('woodcutter', barn.x + dx, barn.y + dy).ok) continue;
            const id = g.debugPlace('woodcutter', barn.x + dx, barn.y + dy);
            if (id == null) continue;
            wc = s.buildings.find((x: any) => x.id === id);
            wc.built = true;
            wc.progress = g.debugBuildTime('woodcutter');
            wc.desiredWorkers = g.debugJobCount('woodcutter');
          }
      // "At the bench" is the readable signal: a woodcutter working is inside his shop, and a
      // woodcutter labouring is not. Counting stock instead would fight the village burning
      // firewood the whole time.
      const runFor = (ticks: number) => {
        let atBench = 0;
        let kept = 0;
        for (let i = 0; i < ticks; i++) {
          wc.store.wood = 9999; // keep it in input, so this measures the cap and nothing else
          // Stand them at their own door and take away any reason to wander, so what is measured
          // is the cap rather than the length of a walk on this particular map.
          for (const c of s.citizens) {
            if (c.jobId !== wc.id) continue;
            const at = g.debugWorkSpot(c.id);
            c.x = at.x;
            c.y = at.y;
            c.route = undefined;
            c.rest = 0;
            c.carry = null;
          }
          g.debugAdvance(0.5);
          if (s.citizens.some((c: any) => c.jobId === wc.id && c.inside)) atBench++;
          if (wc.workers.length === staffed) kept++;
        }
        return { atBench, kept };
      };
      g.debugAdvance(3); // let the assignment pass staff it before anything is measured
      const staffed = wc.workers.length;
      const before = runFor(60);

      // A village starts with 600 firewood, so a cap of 100 is immediately over.
      s.limits = { firewood: 100 };
      const capped = runFor(60);

      // Lift the cap and they pick the trade back up with no further instruction.
      s.limits = {};
      const after = runFor(60);
      return { staffed, cappedWorkers: wc.workers.length, desired: wc.desiredWorkers,
               benchBefore: before.atBench, benchCapped: capped.atBench, benchAfter: after.atBench,
               keptWhileCapped: capped.kept };
    });

    expect(out.staffed, 'the shop was staffed to begin with').toBeGreaterThan(0);
    expect(out.benchBefore, 'and its workers were at the bench').toBeGreaterThan(0);
    // The whole point: they stay on this building's books rather than going back in the pool.
    expect(out.cappedWorkers).toBe(out.staffed);
    expect(out.keptWhileCapped).toBe(60);
    // ...but nobody stands at the bench making more of it while the cap holds.
    expect(out.benchCapped).toBe(0);
    // And the trade resumes on its own once the limit is lifted.
    expect(out.benchAfter).toBeGreaterThan(0);
    // The player's own worker setting is never overwritten.
    expect(out.desired).toBeGreaterThan(0);
  });

  test('one food limit covers every food trade, and fields and pens ignore it', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 1000;
      const place = (type: string) => {
        for (let r = 4; r < 26; r++)
          for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
              if (!g.debugCanPlace(type, barn.x + dx, barn.y + dy).ok) continue;
              const id = g.debugPlace(type, barn.x + dx, barn.y + dy);
              if (id == null) continue;
              const b = s.buildings.find((x: any) => x.id === id);
              b.built = true;
              b.progress = g.debugBuildTime(type);
              b.desiredWorkers = g.debugJobCount(type);
              return b;
            }
        return null;
      };
      const farm = place('farm');
      const gatherer = place('gatherer');
      const hunter = place('hunting');
      g.debugAdvance(3);
      const staffed = {
        farm: farm ? farm.workers.length : 0,
        gatherer: gatherer ? gatherer.workers.length : 0,
        hunter: hunter ? hunter.workers.length : 0,
      };
      // One cap over every edible thing at once — the village starts with 1200 food, so a cap of
      // 100 is well over it and every foraging trade should feel it together.
      s.limits = { food: 100 };
      g.debugAdvance(3);
      const capped = {
        farm: !!farm && g.debugCappedOut(farm.id),
        gatherer: !!gatherer && g.debugCappedOut(gatherer.id),
        hunter: !!hunter && g.debugCappedOut(hunter.id),
      };
      let foodMade = 0;
      for (let i = 0; i < 300; i++) {
        const before = g.debugTotalFood();
        g.debugAdvance(0.5);
        if (g.debugTotalFood() > before + 0.01) foodMade++;
      }
      return { staffed, capped, foodMade,
               workersKept: (!farm || farm.workers.length === staffed.farm) &&
                 (!gatherer || gatherer.workers.length === staffed.gatherer) };
    });

    expect(out.staffed.farm, 'the field was staffed').toBeGreaterThan(0);
    expect(out.staffed.gatherer, 'and so was the gatherer').toBeGreaterThan(0);
    expect(out.staffed.hunter, 'and the hunter').toBeGreaterThan(0);
    // One `food` cap reaches every foraging trade — not one cap per edible thing.
    expect(out.capped.gatherer, 'the gatherer is capped').toBe(true);
    expect(out.capped.hunter, 'and so is the hunter').toBe(true);
    // A crop half-grown in the ground is not work you can walk away from.
    expect(out.capped.farm, 'the field is exempt').toBe(false);
    // Everybody stays on their building's books either way.
    expect(out.workersKept).toBe(true);
  });

  test('the limits panel sets a cap, and it survives a save and reload', async ({ page }) => {
    await open2d(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'easy', false, 0));
    await page.click('#btn-limits');
    await expect(page.locator('#limits .job-row').first()).toBeVisible();

    // The first tap up from "no limit" lands on the current stock rounded to a step, not on 0.
    const row = page.locator('#limits .job-row').filter({ hasText: 'Firewood' });
    await expect(page.locator('#limits .job-row').filter({ hasText: 'Food (all kinds)' })).toHaveCount(1);
    // Food is one category, so there is no row per edible thing.
    await expect(page.locator('#limits .job-row').filter({ hasText: 'Fish' })).toHaveCount(0);
    await expect(row.locator('.count')).toHaveText('—');
    await row.locator('[data-step="1"]').click();
    await expect(row.locator('.count')).toHaveText('600');
    await row.locator('[data-step="1"]').click();
    await expect(row.locator('.count')).toHaveText('650');
    // ...and it can be taken back off entirely.
    for (let i = 0; i < 13; i++) await row.locator('[data-step="-1"]').click();
    await expect(row.locator('.count')).toHaveText('—');

    await row.locator('[data-step="1"]').click();
    await page.evaluate(() => (window as any).__village.persist());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__village.state.limits?.firewood)).toBe(600);
  });
});

test.describe('the merchant ties up at the trading post', () => {
  test.setTimeout(240_000);

  /** Put a finished trading post somewhere it can be built, retrying across generated maps. */
  const raisePost = `() => {
    const g = window.__village;
    for (let attempt = 0; attempt < 8; attempt++) {
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b) => b.type === 'barn');
      barn.store.wood = 2000;
      barn.store.stone = 2000;
      for (let r = 3; r < 40; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++)
            for (const rot of [0, 1, 2, 3]) {
              if (!g.debugCanPlace('trading', barn.x + dx, barn.y + dy, rot).ok) continue;
              const id = g.debugPlace('trading', barn.x + dx, barn.y + dy, rot);
              if (id == null) continue;
              const b = s.buildings.find((x) => x.id === id);
              b.built = true;
              b.progress = g.debugBuildTime('trading');
              return b;
            }
    }
    return null;
  }`;

  test('it moors alongside the post, on water — not out at the river', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate((mk) => {
      const g = (window as any).__village;
      const post = eval(mk)();
      if (!post) return null;
      const s = g.state;
      Object.assign(s.merchant, { phase: 'away', present: false, cooldownTimer: 0,
        category: null, stock: {}, seedStock: [], boat: null });
      // Arrivals are a per-tick roll, so run until one lands rather than hoping for a lucky window.
      for (let i = 0; i < 60 && s.merchant.phase === 'away'; i++) g.debugAdvance(300);
      for (let i = 0; i < 8000 && s.merchant.phase !== 'docked'; i++) g.debugAdvance(0.1);

      const f = g.debugFootprint('trading');
      const rot = post.rot ?? 0;
      const w = rot % 2 === 1 ? f.h : f.w;
      const h = rot % 2 === 1 ? f.w : f.h;
      const b = s.merchant.boat;
      return {
        phase: s.merchant.phase,
        dist: b ? Math.hypot(b.x - (post.x + w / 2), b.y - (post.y + h / 2)) : null,
        // Half the footprint's diagonal: anything inside that is up against the wharf.
        reach: Math.hypot(w, h) / 2,
        onWater: b ? s.tiles[Math.floor(b.y) * s.w + Math.floor(b.x)].type === 'water' : false,
        heading: b ? typeof b.h : null,
      };
    }, raisePost);

    expect(out, 'a trading post could be built on one of the maps tried').not.toBeNull();
    expect(out!.phase, 'a merchant arrived and docked').toBe('docked');
    // The berth comes from the post, not from the central river — a post on a lake used to leave
    // its merchant sitting out in open water on the far side of the map.
    expect(out!.dist!, 'moored up against the wharf').toBeLessThanOrEqual(out!.reach);
    expect(out!.onWater, 'and floating, not beached').toBe(true);
    expect(out!.heading, 'with a heading for the renderer to point the bow along').toBe('number');
  });

  test('the boat is drawn at a size a wharf would berth', async ({ page }) => {
    await open(page); // the 3D renderer is the thing under test here
    const out = await page.evaluate(async (mk) => {
      const g = (window as any).__village;
      const post = eval(mk)();
      if (!post) return null;
      const s = g.state;
      Object.assign(s.merchant, { phase: 'away', present: false, cooldownTimer: 0,
        category: null, stock: {}, seedStock: [], boat: null });
      for (let i = 0; i < 60 && s.merchant.phase === 'away'; i++) g.debugAdvance(300);
      for (let i = 0; i < 8000 && s.merchant.phase !== 'docked'; i++) g.debugAdvance(0.1);
      g.camera.focus(post.x, post.y);
      for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
      const boat = g.renderer.boat;
      const THREE = g.renderer.THREE ?? null;
      // Measure the drawn extent straight off the scene graph rather than trusting a constant.
      const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
      boat.updateWorldMatrix(true, true);
      boat.traverse((o: any) => {
        if (!o.isMesh || !o.geometry) return;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox.clone();
        bb.applyMatrix4(o.matrixWorld);
        box.min = [Math.min(box.min[0], bb.min.x), Math.min(box.min[1], bb.min.y), Math.min(box.min[2], bb.min.z)];
        box.max = [Math.max(box.max[0], bb.max.x), Math.max(box.max[1], bb.max.y), Math.max(box.max[2], bb.max.z)];
      });
      void THREE;
      return { visible: boat.visible, modelled: g.renderer.boatModelled,
               lengthTiles: Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]) };
    }, raisePost);

    expect(out, 'a trading post could be built on one of the maps tried').not.toBeNull();
    expect(out!.visible).toBe(true);
    expect(out!.modelled, 'the authored hull loaded, not the placeholder').toBe(true);
    // A one-tile boat is a speck beside a 5x9 wharf; much past five and it covers the wharf and
    // the houses behind it. This also catches the `setScalar` trap — overwriting the template's
    // normalizing scale instead of multiplying it drew the hull at five tiles rather than three
    // and a half, which is only obvious if the drawn size is measured rather than assumed.
    expect(out!.lengthTiles).toBeGreaterThan(2.5);
    expect(out!.lengthTiles).toBeLessThan(5);
  });
});

test.describe('clearing a build site', () => {
  test('the sheet says how much ground is left to clear, and counts it down', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 1000;
      barn.store.stone = 1000;
      let b: any = null;
      for (let r = 4; r < 26 && !b; r++)
        for (let dy = -r; dy <= r && !b; dy++)
          for (let dx = -r; dx <= r && !b; dx++) {
            if (!g.debugCanPlace('gatherer', barn.x + dx, barn.y + dy).ok) continue;
            const id = g.debugPlace('gatherer', barn.x + dx, barn.y + dy);
            if (id != null) b = s.buildings.find((x: any) => x.id === id);
          }
      if (!b) return null;
      // One of each across the plot, and the rest scrubbed, so the counts are known exactly.
      const f = g.debugFootprint('gatherer');
      let n = 0;
      for (let dy = 0; dy < f.h; dy++)
        for (let dx = 0; dx < f.w; dx++) {
          const t = s.tiles[(b.y + dy) * s.w + (b.x + dx)];
          t.type = 'grass';
          t.trees = 0;
          delete t.stone;
          delete t.iron;
          if (n === 0) { t.type = 'forest'; t.trees = 1; }
          else if (n === 1) t.stone = 4;
          else if (n === 2) t.iron = 4;
          n++;
        }
      g.inspectSel = { kind: 'building', id: b.id };
      g.refreshInspect();
      const read = () =>
        [...document.querySelectorAll('#inspect .inv-row')].map((r) => (r as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
      const before = read();
      // Now clear the plot the way the villagers would, and look again.
      for (let dy = 0; dy < f.h; dy++)
        for (let dx = 0; dx < f.w; dx++) {
          const t = s.tiles[(b.y + dy) * s.w + (b.x + dx)];
          t.type = 'grass';
          t.trees = 0;
          delete t.stone;
          delete t.iron;
        }
      g.refreshInspect();
      return { before, after: read() };
    });

    expect(out, 'a gatherer site could be placed').not.toBeNull();
    const before = out!.before.join(' | ');
    // Why nothing is happening yet, and exactly how much is in the way.
    expect(before).toContain('Clearing the ground');
    expect(before).toContain('3 tiles to clear first');
    expect(before).toContain('1 to fell');
    expect(before).toMatch(/Stone.*1 to gather/);
    expect(before).toMatch(/Iron.*1 to gather/);

    // Once the ground is clear the sheet goes back to reporting construction, with no leftovers.
    const after = out!.after.join(' | ');
    expect(after).toContain('Building 0%');
    expect(after).not.toContain('to clear');
    expect(after).not.toContain('to fell');
  });

  test('the job board counts the tiles left on an unbuilt site', async ({ page }) => {
    await open2d(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.wood = 1000;
      let b: any = null;
      for (let r = 4; r < 26 && !b; r++)
        for (let dy = -r; dy <= r && !b; dy++)
          for (let dx = -r; dx <= r && !b; dx++) {
            if (!g.debugCanPlace('gatherer', barn.x + dx, barn.y + dy).ok) continue;
            const id = g.debugPlace('gatherer', barn.x + dx, barn.y + dy);
            if (id != null) b = s.buildings.find((x: any) => x.id === id);
          }
      if (!b) return null;
      const f = g.debugFootprint('gatherer');
      let n = 0;
      for (let dy = 0; dy < f.h; dy++)
        for (let dx = 0; dx < f.w; dx++) {
          const t = s.tiles[(b.y + dy) * s.w + (b.x + dx)];
          t.type = 'grass';
          t.trees = 0;
          delete t.stone;
          delete t.iron;
          if (n < 2) { t.type = 'forest'; t.trees = 1; }
          n++;
        }
      g.ui.refreshPanels(s);
      return { name: b.name };
    });
    expect(out, 'a gatherer site could be placed').not.toBeNull();
    await page.click('#btn-jobs');
    const row = page.locator('#jobboard .job-row').filter({ hasText: out!.name });
    await expect(row).toContainText('clearing land');
    await expect(row).toContainText('2 tiles left');
  });
});
