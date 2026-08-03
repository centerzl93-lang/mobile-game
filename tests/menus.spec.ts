import { test, expect, Page } from '@playwright/test';

// Drives the menus, map sizes, and save slots through the real app + `window.__village` hook.

// Each test runs in an isolated context, so localStorage starts empty — no manual clearing
// needed (and clearing on every navigation would wipe saves the reload-based tests rely on).
// `?2d` runs the flat fallback renderer. Nothing in this file is about the 3D view — it drives
// menus, map sizes and save slots, all of which are DOM and game state — and the 3D view is
// ruinous here: headless Chromium rasterises it in software (SwiftShader), which drops the page
// to ~2 fps. Playwright's click actionability check waits on animation frames, so at 2 fps a
// single menu click takes seconds and a whole sequence of them blows the test's 30s budget.
// Measured on this box: two menu clicks take 15.4s in 3D and 165ms in 2D.
async function open(page: Page): Promise<void> {
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

test.describe('map sizes', () => {
  test('each size generates the right dimensions', async ({ page }) => {
    await open(page);
    const dims = await page.evaluate(() => {
      const g = (window as any).__village;
      const out: Record<string, any> = {};
      for (const size of ['small', 'large']) {
        g.startNewGame(size);
        const s = g.state;
        out[size] = { w: s.w, tiles: s.tiles.length, paths: s.paths.length, running: g.running };
      }
      return out;
    });
    expect(dims.small.w).toBe(72);
    expect(dims.small.tiles).toBe(72 * 72);
    expect(dims.large.w).toBe(144);
    expect(dims.large.tiles).toBe(144 * 144);
    expect(dims.large.paths).toBe(144 * 144);
    expect(dims.large.running).toBe(true);
  });
});

test.describe('main menu', () => {
  test('opens idle with New Game and no Continue when there is no save', async ({ page }) => {
    await open(page);
    const overlayShown = await page.evaluate(() => !document.getElementById('overlay')!.classList.contains('hidden'));
    const running = await page.evaluate(() => (window as any).__village.running);
    expect(overlayShown).toBe(true);
    expect(running).toBe(false);
    await expect(page.locator('#mm-new')).toBeVisible();
    await expect(page.locator('#mm-continue')).toHaveCount(0);
    expect(await page.evaluate(() => (document.getElementById('mm-account') as HTMLButtonElement).disabled)).toBe(true);
  });

  test('New Game → size select → difficulty → Large starts a 144 game', async ({ page }) => {
    await open(page);
    await page.click('#mm-new');
    await page.click('#sz-large');
    await page.click('#diff-normal'); // difficulty screen now sits between size and start
    await page.waitForTimeout(150);
    const started = await page.evaluate(() => ({ w: (window as any).__village.state.w, running: (window as any).__village.running, hidden: document.getElementById('overlay')!.classList.contains('hidden') }));
    expect(started.w).toBe(144);
    expect(started.running).toBe(true);
    expect(started.hidden).toBe(true);
  });
});

test.describe('save slots', () => {
  test('a game saved to a slot round-trips through reload + Continue', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('large', 'normal', true, 1)); // slot 2, persists
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await expect(page.locator('#mm-continue')).toBeVisible();
    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    const loaded = await page.evaluate(() => ({ w: (window as any).__village.state.w, slot: (window as any).__village.currentSlot, running: (window as any).__village.running }));
    expect(loaded.w).toBe(144);
    expect(loaded.slot).toBe(1);
    expect(loaded.running).toBe(true);
  });

  test('Load Game lists occupied slots and resumes the chosen one', async ({ page }) => {
    await open(page);
    // Put a small game in slot 0 and a large game in slot 2.
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', true, 0));
    await page.evaluate(() => (window as any).__village.startNewGame('large', 'normal', true, 2));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.click('#mm-load');
    await expect(page.locator('#slot-0')).toBeEnabled();
    await expect(page.locator('#slot-1')).toBeDisabled(); // empty
    await expect(page.locator('#slot-2')).toBeEnabled();
    await page.click('#slot-2');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__village.state.w)).toBe(144);
  });

  test('a slot can be named, and the name sticks through a reload', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', true, 0));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });

    await page.click('#mm-load');
    // An occupied slot is titled "Slot 1" until it is named; an empty one carries no controls.
    await expect(page.locator('#slot-0')).toContainText('Slot 1');
    await expect(page.locator('#slot-name-1')).toHaveCount(0);
    await expect(page.locator('#slot-del-1')).toHaveCount(0);

    await page.fill('#slot-name-0', 'Riverstead');
    await page.press('#slot-name-0', 'Enter');
    // The list redraws so the row title follows the field.
    await expect(page.locator('#slot-0')).toContainText('Riverstead');
    await expect(page.locator('#slot-0')).toContainText('12 people');

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.click('#mm-load');
    await expect(page.locator('#slot-0')).toContainText('Riverstead');
    await expect(page.locator('#slot-name-0')).toHaveValue('Riverstead');

    // Clearing the field puts the default back rather than leaving a blank row.
    await page.fill('#slot-name-0', '');
    await page.press('#slot-name-0', 'Enter');
    await expect(page.locator('#slot-0')).toContainText('Slot 1');
  });

  test('a slot can be deleted, taking its name with it', async ({ page }) => {
    page.on('dialog', (d) => d.accept()); // the delete asks first
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      g.startNewGame('large', 'normal', true, 1);
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });

    await page.click('#mm-load');
    await page.fill('#slot-name-0', 'Doomed');
    await page.press('#slot-name-0', 'Enter');
    await expect(page.locator('#slot-0')).toContainText('Doomed');

    await page.click('#slot-del-0');
    // The row goes back to being an empty slot, and the other save is untouched.
    await expect(page.locator('#slot-0')).toContainText('Empty');
    await expect(page.locator('#slot-0')).toBeDisabled();
    await expect(page.locator('#slot-1')).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('little-village-save-v12-slot0'))).toBeNull();
    // The name is gone too — a slot reused later must not inherit the last village's name.
    expect(await page.evaluate(() => localStorage.getItem('little-village-save-v12-slot0-name'))).toBeNull();
  });

  test('the village you are playing cannot be deleted out from under you', async ({ page }) => {
    let asked = false;
    page.on('dialog', (d) => { asked = true; d.accept(); });
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', true, 0));
    await page.evaluate(() => (window as any).__village.persist());

    // Reach the slot list from the pause menu, i.e. mid-game, and try to delete the live slot.
    await page.click('#btn-menu');
    await page.click('#pm-save');
    await expect(page.locator('#slot-del-0')).toBeVisible();
    await page.click('#slot-del-0');
    await page.waitForTimeout(100);

    // Refused outright — the next autosave would put it straight back, so it is not even asked.
    expect(asked, 'no confirmation was raised').toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('little-village-save-v12-slot0'))).not.toBeNull();
    await expect(page.locator('#hint')).toContainText('village you are playing');
  });
});

test.describe('pause menu', () => {
  test('opens & pauses; Resume, Save-to-slot, Settings, New Game, Main Menu all work', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', true, 0));
    await page.waitForTimeout(100);

    await page.click('#btn-menu');
    await expect(page.locator('#pm-resume')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__village.paused)).toBe(true);

    await page.click('#pm-resume');
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => (window as any).__village.paused)).toBe(false);
    expect(await page.evaluate(() => document.getElementById('overlay')!.classList.contains('hidden'))).toBe(true);

    // Save → slot picker → Slot 2 writes and returns to the pause menu.
    await page.click('#btn-menu');
    await page.click('#pm-save');
    await expect(page.locator('#slot-1')).toBeVisible();
    await page.click('#slot-1');
    await expect(page.locator('#pm-resume')).toBeVisible(); // saving returns to the pause menu
    expect(await page.evaluate(() => localStorage.getItem('little-village-save-v12-slot1') != null)).toBe(true);
    expect(await page.evaluate(() => (window as any).__village.currentSlot)).toBe(1);

    // Settings screen is reachable from the (still-open) pause menu, and Back returns to it.
    await page.click('#pm-settings');
    await expect(page.locator('#set-gfx-low')).toBeVisible();
    await page.click('#set-back');

    // New Game → size select → difficulty.
    await page.click('#pm-new');
    await expect(page.locator('#sz-small')).toBeVisible();
    await page.click('#sz-large');
    await page.click('#diff-easy');
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => (window as any).__village.state.w)).toBe(144);

    // Main Menu returns to the title, idle.
    await page.click('#btn-menu');
    await page.click('#pm-main');
    await expect(page.locator('#mm-new')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__village.running)).toBe(false);
  });
});

test.describe('settings', () => {
  test('graphics selection persists to localStorage', async ({ page }) => {
    await open(page);
    await page.click('#mm-settings');
    await page.click('#set-gfx-low');
    expect(await page.evaluate(() => localStorage.getItem('village-gfx'))).toBe('low');
    await page.click('#set-gfx-high');
    expect(await page.evaluate(() => localStorage.getItem('village-gfx'))).toBe('high');
    await page.click('#set-gfx-auto');
    expect(await page.evaluate(() => localStorage.getItem('village-gfx'))).toBeNull();
  });
});
