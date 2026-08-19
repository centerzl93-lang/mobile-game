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

  test('New Game → one setup screen → Large starts a 144 game', async ({ page }) => {
    await open(page);
    await page.click('#mm-new');
    await page.click('#ng-size-large');
    await page.click('#ng-diff-normal');
    await page.click('#ng-start'); // every setting on one card, then Start
    await page.waitForTimeout(150);
    const started = await page.evaluate(() => ({ w: (window as any).__village.state.w, running: (window as any).__village.running, hidden: document.getElementById('overlay')!.classList.contains('hidden') }));
    expect(started.w).toBe(144);
    expect(started.running).toBe(true);
    expect(started.hidden).toBe(true);
  });
});

test.describe('save slots', () => {
  test('a game in progress round-trips through reload + Continue (autosave slot)', async ({ page }) => {
    await open(page);
    // A new game founds into the autosave slot; Continue resumes it after a reload.
    await page.evaluate(() => (window as any).__village.startNewGame('large', 'normal', true));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await expect(page.locator('#mm-continue')).toBeVisible();
    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    const loaded = await page.evaluate(() => ({ w: (window as any).__village.state.w, running: (window as any).__village.running }));
    expect(loaded.w).toBe(144);
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

  test('a hard-save slot can be deleted mid-game; the live game autosaves elsewhere and survives', async ({ page }) => {
    page.on('dialog', (d) => d.accept()); // the delete asks first
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', true)); // autosave slot
    // Hard-save it to slot 0, then delete that snapshot from the Save list.
    await page.click('#btn-menu');
    await page.click('#pm-save');
    await page.click('#slot-0'); // writes slot 0 (empty → no confirm)
    await page.click('#pm-save'); // back to the save list
    await page.click('#slot-del-0');
    await page.waitForTimeout(100);

    // The snapshot is gone, but the live game is untouched — it never lived in a manual slot.
    await expect(page.locator('#slot-0')).toContainText('Empty');
    expect(await page.evaluate(() => localStorage.getItem('little-village-save-v12-slot0'))).toBeNull();
    expect(await page.evaluate(() => (window as any).__village.running)).toBe(true);
    // The autosave slot still holds the running village.
    expect(await page.evaluate(() => localStorage.getItem('little-village-save-v12-slot3'))).not.toBeNull();
  });
});

test.describe('autosave slot vs manual save slots', () => {
  const slotKey = (n: number) => `little-village-save-v12-slot${n}`;
  const AUTO = 3; // the dedicated autosave slot (SLOTS is 3, so manual slots are 0..2)

  async function reloadToMenu(page: Page): Promise<void> {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
  }
  const rawSlot = (page: Page, n: number) => page.evaluate((k) => localStorage.getItem(k), slotKey(n));
  const seedIn = (page: Page, n: number) =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.seed, slotKey(n));

  // Seed the three manual slots directly with distinct villages (no autosave written).
  async function fillManualSlots(page: Page): Promise<void> {
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 1001);
      g.startNewGame('small', 'normal', true, 1, 1002);
      g.startNewGame('large', 'normal', true, 2, 1003);
    });
  }

  test('the autosave slot is the 4th slot, distinct from the 3 manual slots', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => (window as any).__village.debugAutosaveSlot())).toBe(AUTO);
  });

  test('a new game founds into the autosave slot and never touches the manual slots — even when all 3 are full', async ({ page }) => {
    await open(page);
    await fillManualSlots(page);
    await reloadToMenu(page);
    const before = [await rawSlot(page, 0), await rawSlot(page, 1), await rawSlot(page, 2)];

    await page.click('#mm-new');
    await page.fill('#ng-seed', '5005');
    await page.click('#ng-start');
    await page.waitForTimeout(150);

    // The game started, with no overwrite prompt, and it lives in the autosave slot.
    await expect(page.locator('#ow-confirm')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__village.running)).toBe(true);
    expect(await seedIn(page, AUTO)).toBe(5005);
    // Every manual hard save is byte-for-byte untouched.
    expect([await rawSlot(page, 0), await rawSlot(page, 1), await rawSlot(page, 2)]).toEqual(before);
  });

  test('autosave writes only to the autosave slot, never the manual slots', async ({ page }) => {
    await open(page);
    await fillManualSlots(page);
    await reloadToMenu(page);
    const before = [await rawSlot(page, 0), await rawSlot(page, 1), await rawSlot(page, 2)];

    await page.click('#mm-new');
    await page.fill('#ng-seed', '6006');
    await page.click('#ng-start');
    await page.waitForTimeout(100);
    // Drive an autosave the way the frame loop does.
    await page.evaluate(() => { const g = (window as any).__village; g.debugAdvance(5); g.persist(); });

    expect(await seedIn(page, AUTO)).toBe(6006);
    expect([await rawSlot(page, 0), await rawSlot(page, 1), await rawSlot(page, 2)]).toEqual(before);
  });

  test('Continue resumes the autosave slot; Load lists only the manual hard saves', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 1001);            // a hard save in slot 0
      g.startNewGame('large', 'normal', true, g.debugAutosaveSlot(), 2002); // the game in progress
    });
    await reloadToMenu(page);

    // Both routes are offered and independent: Continue for the autosave, Load for the hard save.
    await expect(page.locator('#mm-continue')).toBeVisible();
    await expect(page.locator('#mm-load')).toBeVisible();

    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    // Continue resumed the in-progress (autosave) village, not the hard save.
    expect(await page.evaluate(() => ({ seed: (window as any).__village.state.seed, w: (window as any).__village.state.w })))
      .toEqual({ seed: 2002, w: 144 });

    // The Load list shows the manual slots only — there is no row for the autosave slot.
    await page.click('#btn-menu');
    await page.click('#pm-load');
    await expect(page.locator('#slot-0')).toContainText('people');
    await expect(page.locator('#slot-3')).toHaveCount(0);
  });

  test('loading a hard save makes it the live game and the new autosave', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 1001);            // slot 0 = Alpha (small)
      g.startNewGame('large', 'normal', true, g.debugAutosaveSlot(), 2002); // autosave = Bravo (large)
    });
    await reloadToMenu(page);

    await page.click('#mm-load');
    await page.click('#slot-0'); // load Alpha
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__village.state.seed)).toBe(1001);

    // Loading copied Alpha into the autosave slot, so Continue now resumes Alpha, not Bravo.
    await reloadToMenu(page);
    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__village.state.seed)).toBe(1001);
  });

  test('manual Save to an empty slot writes it with no confirmation', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', true)); // autosave slot
    await page.click('#btn-menu');
    await page.click('#pm-save');
    await expect(page.locator('#ow-confirm')).toHaveCount(0);
    await page.click('#slot-1'); // empty → straight to disk
    await expect(page.locator('#pm-resume')).toBeVisible(); // saving returns to the pause menu
    expect(await rawSlot(page, 1)).not.toBeNull();
  });

  test('manual Save over an occupied slot asks first; Cancel leaves the hard save untouched', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 1001);             // slot 0 = Alpha
      localStorage.setItem('little-village-save-v12-slot0-name', 'Alpha');
      g.startNewGame('small', 'normal', true, g.debugAutosaveSlot(), 2002); // live = Bravo
    });
    const slot0Before = await rawSlot(page, 0);

    await page.click('#btn-menu');
    await page.click('#pm-save');
    await page.click('#slot-0'); // occupied by Alpha
    await expect(page.locator('#ow-confirm')).toBeVisible();
    await expect(page.locator('.menu-card')).toContainText('Alpha');
    await expect(page.locator('.menu-card')).toContainText('people');
    await expect(page.locator('.menu-card')).toContainText('permanently replaced');

    await page.click('#ow-cancel');
    await expect(page.locator('.menu-card h2')).toContainText('Save Game'); // back at the save list
    expect(await rawSlot(page, 0)).toBe(slot0Before); // Alpha untouched
  });

  test('manual Save over an occupied slot, confirmed, replaces that slot with the live village', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 1001);             // slot 0 = Alpha
      localStorage.setItem('little-village-save-v12-slot0-name', 'Alpha');
      g.startNewGame('small', 'normal', true, g.debugAutosaveSlot(), 2002); // live = Bravo (seed 2002)
    });

    await page.click('#btn-menu');
    await page.click('#pm-save');
    await page.click('#slot-0');
    await page.click('#ow-confirm');
    await expect(page.locator('#pm-resume')).toBeVisible(); // saving returns to the pause menu

    // Slot 0 now holds Bravo, and the replaced village's name is gone with it.
    expect(await seedIn(page, 0)).toBe(2002);
    expect(await page.evaluate(() => localStorage.getItem('little-village-save-v12-slot0-name'))).toBeNull();
  });
});

test.describe('pause menu', () => {
  test('opens & pauses; Resume, Save-to-slot, Settings, Achievements, Main Menu all work', { tag: '@slow' }, async ({ page }) => {
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

    // Save → slot picker → Slot 2 (empty) writes and returns to the pause menu.
    await page.click('#btn-menu');
    await page.click('#pm-save');
    await expect(page.locator('#slot-1')).toBeVisible();
    await page.click('#slot-1');
    await expect(page.locator('#pm-resume')).toBeVisible(); // saving returns to the pause menu
    expect(await page.evaluate(() => localStorage.getItem('little-village-save-v12-slot1') != null)).toBe(true);

    // Settings screen is reachable from the (still-open) pause menu, and Back returns to it.
    await page.click('#pm-settings');
    await expect(page.locator('#set-gfx-low')).toBeVisible();
    await page.click('#set-back');

    // Achievements → the ledger (New Game's old slot) → Back returns to the still-open pause menu.
    await page.click('#pm-achievements');
    await expect(page.locator('#ach-back')).toBeVisible();
    await expect(page.locator('.ach-count')).toContainText('/ 80');
    await page.click('#ach-back');
    await expect(page.locator('#pm-resume')).toBeVisible();

    // New Game no longer lives in the pause menu — it moved to the title screen.
    await expect(page.locator('#pm-new')).toHaveCount(0);

    // Main Menu returns to the title, idle.
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
