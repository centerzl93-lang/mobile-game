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
    // Easy: full stock + 3 houses.
    expect(d.easy.houses).toBe(3);
    expect(d.easy.store.wood).toBe(220);
    expect(d.easy.store.medicine).toBe(40);
    // Normal: no houses, halved basics, no non-basics.
    expect(d.normal.houses).toBe(0);
    expect(d.normal.store.wood).toBe(110);
    expect(d.normal.store.stone).toBe(20);
    expect(d.normal.store.medicine ?? 0).toBe(0);
    expect(d.normal.store.coal ?? 0).toBe(0);
    // Hard: no wood or stone, but keeps food/firewood/tools.
    expect(d.hard.store.wood ?? 0).toBe(0);
    expect(d.hard.store.stone ?? 0).toBe(0);
    expect(d.hard.store.firewood).toBe(100);
    expect(d.hard.store.tools).toBe(60);
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
