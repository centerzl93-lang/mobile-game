import { test, expect, Page } from '@playwright/test';

// Four gameplay adjustments, driven through the real app + `window.__village`:
//  - a dragged path marks nothing for harvest until it is confirmed;
//  - a store reads "low" under a fifth of its cap but only warns under a tenth;
//  - a winter without warm clothes costs health, cheer and a slower shift, but no longer kills.
// (The fourth — builders are never auto-assigned — lives beside the other builder tests in
// newgame.spec.ts.)
async function open(page: Page): Promise<void> {
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

test.describe('paths: harvest waits for confirmation', () => {
  test('dragging a route marks nothing; confirming queues the wood; cancelling leaves it', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      // A fresh village and the nearest treed tile to its barn.
      const forestByBarn = () => {
        g.startNewGame('small', 'easy', true);
        const s = g.state;
        const W = s.w;
        const barn = s.buildings.find((b: any) => b.type === 'barn');
        for (let r = 2; r < 25; r++)
          for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
              const x = barn.x + dx, y = barn.y + dy;
              if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
              const t = s.tiles[y * W + x];
              if (t.type === 'forest' && t.trees > 0.1) return { s, idx: y * W + x, x, y };
            }
        return null;
      };

      const a = forestByBarn()!;
      const planned = g.debugPaintPath('dirt', a.x, a.y); // the drag preview: plan + mark pending
      const duringDrag = a.s.harvest[a.idx];
      g.debugConfirmPaths();
      const afterConfirm = a.s.harvest[a.idx];

      const b = forestByBarn()!;
      g.debugPaintPath('dirt', b.x, b.y);
      g.debugCancelPaths();
      const afterCancel = b.s.harvest[b.idx];

      return { planned, duringDrag, afterConfirm, afterCancel };
    });
    expect(out.planned).toBe(true);
    expect(out.duringDrag, 'a route being dragged marks nothing for harvest').toBe(0);
    expect(out.afterConfirm, 'confirming the road queues the wood beneath it').toBeGreaterThan(0);
    expect(out.afterCancel, 'a cancelled route leaves the trees untouched').toBe(0);
  });
});

test.describe('low stock: a fifth reddens, a tenth warns', () => {
  test('a store low but not critical reddens its chip without a warning; critical warns once', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', false);
      g.ui.hideOverlay();
      const s = g.state;
      s.limits = s.limits || {};
      s.limits.stone = 100;
      // Free stone lives in the barns; put an exact amount in one and clear it everywhere else.
      const setStone = (n: number) => {
        for (const b of s.buildings) if (b.store) b.store.stone = 0;
        const barn = s.buildings.find((b: any) => b.type === 'barn');
        barn.store = barn.store || {};
        barn.store.stone = n;
      };
      const warns = () => (s.events ?? []).filter((e: any) => /Stone is low/.test(e.text)).length;

      setStone(15); // 15% of cap
      g.debugAdvance(6);
      const at15 = { ...g.debugStockState('stone'), warned: warns() };

      setStone(5); // 5% of cap
      g.debugAdvance(6);
      const at5 = { ...g.debugStockState('stone'), warned: warns() };

      setStone(50); // comfortable again
      g.debugAdvance(6);
      const at50 = g.debugStockState('stone');

      return { at15, at5, at50 };
    });
    // A fifth of the cap: the chip is red, but the log stays quiet.
    expect(out.at15.low, '15% of cap reads low').toBe(true);
    expect(out.at15.critical, '15% is not yet critical').toBe(false);
    expect(out.at15.warned, 'and raises no warning').toBe(0);
    // A tenth: still low, now critical, and it says so — once.
    expect(out.at5.low).toBe(true);
    expect(out.at5.critical, '5% is critical').toBe(true);
    expect(out.at5.warned, 'and warns exactly once').toBe(1);
    // Half full: neither.
    expect(out.at50.low, '50% is comfortably stocked').toBe(false);
    expect(out.at50.critical).toBe(false);
  });
});

test.describe('winter clothing: a cost, not a killer', () => {
  test('no coats plus ample fuel: nobody dies, but health and cheer suffer', { tag: '@slow' }, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const run = async (clothed: boolean) =>
      page.evaluate((clothedIn) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', false);
        const s = g.state;
        const FOODS = ['berries', 'fish', 'mutton', 'beef', 'bread', 'eggs', 'vegetables', 'fruit'];
        // Every building kept flush with fuel and food so the only variable is the coat: nobody
        // freezes and nobody starves either way. Clothing is either abundant or entirely absent.
        const stock = () => {
          for (const b of s.buildings) {
            b.store = b.store || {};
            b.store.firewood = 99999;
            b.store.coal = 0;
            for (const f of FOODS) b.store[f] = 9999;
            b.store.clothing = clothedIn ? 99999 : 0;
            b.store.fineclothes = 0;
          }
        };
        stock();
        const pop0 = s.citizens.length;
        // Several seasons, re-stocking around each turn so the shortfall is only ever clothing.
        for (let i = 0; i < 8; i++) {
          stock();
          g.debugAdvance(120);
          stock();
          g.debugEndSeason();
        }
        return {
          pop0,
          pop1: s.citizens.length,
          health: g.debugAvgHealth(),
          happy: g.debugAvgHappiness(),
          clothingDeaths: (s.events ?? []).filter((e: any) => /fell ill without warm clothing/.test(e.text)).length,
          froze: (s.events ?? []).filter((e: any) => /froze in the cold/.test(e.text)).length,
        };
      }, clothed);

    const warm = await run(true);
    const cold = await run(false);

    // The old death-by-coat is gone entirely, for both runs.
    expect(warm.clothingDeaths).toBe(0);
    expect(cold.clothingDeaths).toBe(0);
    // With fuel to spare, the uncoated village survives its winters.
    expect(cold.froze, 'ample fuel — nobody freezes even uncoated').toBe(0);
    expect(cold.pop1, 'the uncoated village lives on').toBeGreaterThan(0);
    // But it pays in health and morale against the warmly-dressed one.
    expect(cold.health, 'uncoated is less healthy').toBeLessThan(warm.health - 4);
    expect(cold.happy, 'uncoated is less happy').toBeLessThan(warm.happy - 4);
  });
});

test.describe('hunting yields hide as well as meat', () => {
  test('every hunt brings back venison and a leather byproduct', { tag: '@slow' }, async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', true, 0, 4242);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      // Drop a hunting cabin on the first spot that will take it, and stand it up staffed.
      let id: number | null = null;
      for (let r = 3; r < 25 && id == null; r++)
        for (let dy = -r; dy <= r && id == null; dy++)
          for (let dx = -r; dx <= r && id == null; dx++)
            if (g.debugCanPlace('hunting', barn.x + dx, barn.y + dy).ok)
              id = g.debugPlace('hunting', barn.x + dx, barn.y + dy);
      const hut = s.buildings.find((b: any) => b.id === id);
      hut.built = true;
      hut.progress = 999;
      hut.desiredWorkers = g.debugJobCount('hunting');
      const leather0 = g.debugTotalStored('leather');
      const venison0 = g.debugTotalStored('venison');
      for (let i = 0; i < 2500; i++) g.debugAdvance(0.5);
      return {
        placed: id != null,
        madeVenison: Math.round(g.debugTotalStored('venison') - venison0),
        madeLeather: Math.round(g.debugTotalStored('leather') - leather0),
      };
    });
    expect(out.placed).toBe(true);
    expect(out.madeVenison, 'the hunt brings home meat').toBeGreaterThan(0);
    expect(out.madeLeather, 'and the hide off it, as leather for the tailor').toBeGreaterThan(0);
  });
});

test.describe('the hospital spends medicine on health', () => {
  // Placement of the 4x5 hospital is fussy on a random map, so these build it into the state
  // directly and staff it — the mechanics under test are the medicine spend and the cure, not siting.
  test('a staffed hospital keeps the village healthier, drawing on the medicine store', async ({ page }) => {
    await open(page);
    const run = async (withHospital: boolean) =>
      page.evaluate((withH) => {
        const g = (window as any).__village;
        g.startNewGame('small', 'easy', false, 0, 4242);
        const s = g.state;
        const barn = s.buildings.find((b: any) => b.type === 'barn');
        barn.store.medicine = 500;
        barn.store.grain = 5000;
        barn.store.berries = 5000;
        let hosp: any = null;
        if (withH) {
          hosp = { id: s.nextId++, type: 'hospital', x: barn.x, y: barn.y, built: true, progress: 999,
            workers: [s.citizens[0].id], desiredWorkers: 1, growth: 0, store: {} };
          s.citizens[0].jobId = hosp.id;
          s.buildings.push(hosp);
        }
        for (const c of s.citizens) c.health = 50;
        const med0 = g.debugTotalStored('medicine');
        for (let i = 0; i < 8; i++) { if (hosp) hosp.workers = [s.citizens[0].id]; g.debugEndSeason(); }
        return { health: g.debugAvgHealth(), medUsed: med0 - g.debugTotalStored('medicine') };
      }, withHospital);
    const withH = await run(true);
    const withoutH = await run(false);
    expect(withH.health, 'the hospital lifts the health ceiling').toBeGreaterThan(withoutH.health + 3);
    expect(withH.medUsed, 'and it spends medicine to do it').toBeGreaterThan(0);
    expect(withoutH.medUsed, 'no hospital, no upkeep spend').toBe(0);
  });

  test('a staffed hospital administers a full course, curing more of the sick', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, 0, 4242);
      const s = g.state;
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      barn.store.medicine = 500;
      barn.store.grain = 5000;
      const hosp = {
        id: s.nextId++, type: 'hospital', x: barn.x, y: barn.y, built: true, progress: 999,
        workers: [s.citizens[0].id], desiredWorkers: 1, growth: 0, store: {},
      };
      s.citizens[0].jobId = hosp.id;
      s.buildings.push(hosp);
      const sickIds = s.citizens.slice(0, 6).map((c: any) => { c.sick = true; c.homeId = null; return c.id; });
      const med0 = g.debugTotalStored('medicine');
      hosp.workers = [s.citizens[0].id];
      g.debugEndSeason();
      return {
        stillSick: s.citizens.filter((c: any) => sickIds.includes(c.id) && c.sick).length,
        alive: s.citizens.filter((c: any) => sickIds.includes(c.id)).length,
        medUsed: Math.round(med0 - g.debugTotalStored('medicine')),
      };
    });
    // With a hospital pouring a full course into each patient, the ward clears and nobody dies...
    expect(out.stillSick, 'the ward clears').toBe(0);
    expect(out.alive, 'nobody dies of it').toBe(6);
    // ...and that costs several doses each, not one.
    expect(out.medUsed, 'a full course, more than a single dose per patient').toBeGreaterThan(6);
  });
});
