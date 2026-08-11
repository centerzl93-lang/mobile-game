import { test, expect, Page } from '@playwright/test';

// The achievement ledger, the live-unlock celebration, and the global (localStorage) unlocked set,
// driven through the real app + the `window.__village` hook. `?2d&gfx=low` runs the flat renderer:
// the 3D view rasterises in software here at ~2fps, which blows menu-click budgets (see menus.spec).
async function open(page: Page): Promise<void> {
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

test.describe('achievements ledger', () => {
  test('opens from the pause menu with a running count and eighty medalled bubbles', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', true, 0));
    await page.waitForTimeout(80);

    await page.click('#btn-menu');
    await page.click('#pm-achievements');

    // The count header, one bubble per achievement, and a medal leading each bubble.
    await expect(page.locator('.ach-count')).toContainText('/ 80');
    await expect(page.locator('.ach-bubble')).toHaveCount(80);
    await expect(page.locator('.ach-bubble').first().locator('.ach-medal')).not.toBeEmpty();

    // Back returns to the pause menu it was opened from.
    await page.click('#ach-back');
    await expect(page.locator('#pm-resume')).toBeVisible();
  });

  test('earned achievements light green and are counted; the rest stay locked', async ({ page }) => {
    await open(page);
    const shown = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      // Pretend three feats are already in the global set, then draw the ledger.
      for (const id of ['house1', 'pop10', 'winter1']) g.unlockedAchievements.add(id);
      g.openAchievements(() => {});
      return {
        count: document.querySelector('.ach-count')!.textContent,
        earned: document.querySelectorAll('.ach-bubble.earned').length,
        ticks: [...document.querySelectorAll('.ach-bubble.earned .ach-tick')].filter((e) => e.textContent!.trim() === '✓').length,
        total: document.querySelectorAll('.ach-bubble').length,
      };
    });
    expect(shown.count).toContain('3 / 80');
    expect(shown.earned).toBe(3);
    expect(shown.ticks).toBe(3); // every earned bubble carries the check
    expect(shown.total).toBe(80);
  });

  test('crossing a threshold unlocks it live, celebrates it, and persists it', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      // Drive the peak-population tally past 300 and run the same check the game runs on its clock.
      g.state.stats.peakPop = 300;
      g.checkAchievements();
      const pop = document.getElementById('ach-pop');
      const stored = JSON.parse(localStorage.getItem('lv_achievements') || '[]');
      return {
        unlocked300: g.unlockedAchievements.has('pop300'),
        unlocked10: g.unlockedAchievements.has('pop10'),
        popupExists: !!pop,
        popupTitle: pop ? pop.querySelector('.ach-pop-title')!.textContent : null,
        popupHead: pop ? pop.querySelector('.ach-pop-head')!.textContent : null,
        storedHas300: stored.includes('pop300'),
      };
    });
    // Every population rung up to 300 unlocks at once.
    expect(out.unlocked300).toBe(true);
    expect(out.unlocked10).toBe(true);
    // A celebration is on screen, with the unlocked-achievement chrome and a real title.
    expect(out.popupExists).toBe(true);
    expect(out.popupHead).toContain('Achievement unlocked');
    expect((out.popupTitle || '').length).toBeGreaterThan(0);
    // And it is written to the global store, not just the run.
    expect(out.storedHas300).toBe(true);
  });

  test('the unlocked set is global: it survives a reload into a brand new village', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      g.state.stats.wintersSurvived = 50;
      g.checkAchievements(); // unlocks winter1/5/10/25/50, writes them to localStorage
    });
    // A fresh page, a fresh game object — the set is reloaded from localStorage on construction.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    const kept = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      g.openAchievements(() => {});
      return {
        has50: g.unlockedAchievements.has('winter50'),
        has1: g.unlockedAchievements.has('winter1'),
        count: document.querySelector('.ach-count')!.textContent,
      };
    });
    expect(kept.has50).toBe(true);
    expect(kept.has1).toBe(true);
    expect(kept.count).not.toContain('0 / 80'); // the reloaded set shows in the header
  });
});

test.describe('save migration', () => {
  test('a v13 save with no stats gains a fresh tally set on load', async ({ page }) => {
    await open(page);
    // Make and persist a real (v14) save, then rewind its envelope to v13 and strip the stats the
    // v13→v14 step is meant to restore — the exact shape an old device's save has.
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      g.persist();
      const key = 'little-village-save-v12-slot0';
      const env = JSON.parse(localStorage.getItem(key)!);
      env.v = 13;
      delete env.state.stats;
      localStorage.setItem(key, JSON.stringify(env));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    const migrated = await page.evaluate(() => {
      const st = (window as any).__village.state.stats;
      return {
        running: (window as any).__village.running,
        hasStats: !!st && typeof st === 'object',
        hasPlaced: !!st && Array.isArray(st.placedTypes),
        hasProduced: !!st && typeof st.produced === 'object',
      };
    });
    expect(migrated.running).toBe(true);
    expect(migrated.hasStats).toBe(true);
    expect(migrated.hasPlaced).toBe(true);
    expect(migrated.hasProduced).toBe(true);
  });
});
