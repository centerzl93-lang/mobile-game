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
