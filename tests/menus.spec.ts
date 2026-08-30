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

  test('a slot\'s title is the village\'s own name, set once at founding — there is no rename control', async ({ page }) => {
    await open(page);
    // Found a village through the real New Village screen so it carries the typed name, then hard
    // save it into slot 0.
    await page.click('#mm-new');
    await page.fill('#ng-name', 'Riverstead');
    await page.click('#ng-start');
    await page.waitForTimeout(150);
    await page.click('#btn-menu');
    await page.click('#pm-save');
    await page.click('#slot-0'); // empty → writes straight away
    await page.click('#pm-save'); // back to the save list

    // The slot's title is the village name, with no field anywhere to edit it.
    await expect(page.locator('#slot-0')).toContainText('Riverstead');
    await expect(page.locator('#slot-name-0')).toHaveCount(0);
    await expect(page.locator('.slot-row input')).toHaveCount(0);

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await page.click('#mm-load');
    // The name sticks through a reload, and still nothing to rename it with — on Load either.
    await expect(page.locator('#slot-0')).toContainText('Riverstead');
    await expect(page.locator('#slot-name-0')).toHaveCount(0);
    await expect(page.locator('.slot-row input')).toHaveCount(0);

    // An unnamed village falls back to "Manual Save N", not the old "Slot N".
    await expect(page.locator('#slot-1')).toContainText('Empty');
  });

  test('a slot can be deleted, taking its name with it', async ({ page }) => {
    page.on('dialog', (d) => d.accept()); // the delete asks first
    await open(page);
    await page.click('#mm-new');
    await page.fill('#ng-name', 'Doomed');
    await page.click('#ng-start');
    await page.waitForTimeout(150);
    await page.click('#btn-menu');
    await page.click('#pm-save');
    await page.click('#slot-0'); // writes slot 0, named "Doomed" automatically
    await page.click('#pm-save');
    await expect(page.locator('#slot-0')).toContainText('Doomed');

    await page.click('#slot-del-0');
    // The row goes back to being an empty slot.
    await expect(page.locator('#slot-0')).toContainText('Empty');
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

  test('Continue resumes the autosave slot; Load lists the manual hard saves plus the autosave', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 1001);            // a hard save in slot 0
      g.startNewGame('large', 'normal', true, g.debugAutosaveSlot(), 2002); // the game in progress
    });
    await reloadToMenu(page);

    // Both routes are offered: Continue for the autosave, Load for everything (hard saves + autosave).
    await expect(page.locator('#mm-continue')).toBeVisible();
    await expect(page.locator('#mm-load')).toBeVisible();

    await page.click('#mm-continue');
    await page.waitForTimeout(150);
    // Continue resumed the in-progress (autosave) village, not the hard save.
    expect(await page.evaluate(() => ({ seed: (window as any).__village.state.seed, w: (window as any).__village.state.w })))
      .toEqual({ seed: 2002, w: 144 });

    // The Load list shows the manual slot and, separately, the autosave — both loadable.
    await page.click('#btn-menu');
    await page.click('#pm-load');
    await expect(page.locator('#slot-0')).toContainText('people');
    await expect(page.locator('#slot-3')).toBeEnabled(); // the autosave row
    await expect(page.locator('#slot-3')).toContainText('people');
    // No delete control on the autosave row — deleting it would drop the running game.
    await expect(page.locator('#slot-del-3')).toHaveCount(0);

    // Loading the autosave row from the Load screen resumes the same village Continue does.
    await page.click('#slot-3');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__village.state.seed)).toBe(2002);
  });

  test('Save Game never lists the autosave — it is not a manual write target', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', true)); // autosave slot
    await page.click('#btn-menu');
    await page.click('#pm-save');
    await expect(page.locator('#slot-0')).toBeVisible();
    await expect(page.locator('#slot-1')).toBeVisible();
    await expect(page.locator('#slot-2')).toBeVisible();
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

  test('all four slots — three manual plus the autosave — can each be loaded from the Load screen', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 1001);
      g.startNewGame('small', 'normal', true, 1, 1002);
      g.startNewGame('small', 'normal', true, 2, 1003);
      g.startNewGame('small', 'normal', true, g.debugAutosaveSlot(), 1004);
    });
    await reloadToMenu(page);

    // The autosave must be checked first: loading a manual slot copies it into the autosave slot
    // (see `continueGame`), so checking slot 3 after any manual load would read the wrong village.
    for (const [row, seed] of [['#slot-3', 1004], ['#slot-0', 1001], ['#slot-1', 1002], ['#slot-2', 1003]] as const) {
      await page.click('#mm-load');
      await expect(page.locator(row)).toBeEnabled();
      await page.click(row);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => (window as any).__village.state.seed)).toBe(seed);
      await page.click('#btn-menu');
      await page.click('#pm-main');
    }
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

  test('overwriting a slot succeeds against a full store by reclaiming its own bytes', async ({ page }) => {
    await open(page);
    // Alpha lives in slot 0; Bravo is the live village we then hard-save over it.
    await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0, 1001);             // slot 0 = Alpha (seed 1001)
      g.startNewGame('small', 'normal', true, g.debugAutosaveSlot(), 2002); // live = Bravo (seed 2002)
    });

    // Simulate a near-full store: the *first* setItem for slot 0 throws QuotaExceededError, exactly
    // as a browser does when a slightly larger blob tips a full origin over. The real
    // `localStorage.removeItem` still works, so `saveGame`'s reclaim-then-retry can free slot 0's own
    // bytes and land the write on the second attempt.
    const wrote = await page.evaluate(() => {
      const g = (window as any).__village;
      const key = 'little-village-save-v12-slot0';
      const raw = Object.getPrototypeOf(localStorage);
      const realSet = raw.setItem.bind(localStorage);
      let thrown = false;
      localStorage.setItem = (k: string, v: string) => {
        if (k === key && !thrown) {
          thrown = true;
          const err: any = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return realSet(k, v);
      };
      try {
        return g.debugSaveSlot(0); // overwrite Alpha with the live Bravo
      } finally {
        localStorage.setItem = realSet; // restore so the rest of the harness is unaffected
      }
    });

    // The save reported success and slot 0 now holds Bravo — the overwrite survived the full store.
    expect(wrote).toBe(true);
    expect(await seedIn(page, 0)).toBe(2002);
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

// Phase 1 audio/haptics architecture (`src/audio/`) — see CLAUDE.md. These drive the real settings
// panel in a real Chromium (unlike `sim-tests/audio-*.test.ts`, which run headless in Node with no
// `AudioContext` at all), so they're the coverage for "audio init doesn't break the browser session"
// and "the settings surface reads/writes through `src/audio/settings.ts` correctly."
test.describe('audio settings', () => {
  async function setSlider(page: Page, id: string, value: string): Promise<void> {
    await page.evaluate(
      ({ id, value }) => {
        const el = document.getElementById(`set-${id}`) as HTMLInputElement;
        el.value = value;
        el.dispatchEvent(new Event('change'));
      },
      { id, value },
    );
  }

  test('Master volume slider is present, defaults sensibly, and persists', async ({ page }) => {
    await open(page);
    await page.click('#mm-settings');
    await expect(page.locator('#set-master')).toBeVisible();
    // See src/audio/settings.ts's MASTER_DEFAULT.
    expect(await page.evaluate(() => (document.getElementById('set-master') as HTMLInputElement).value)).toBe('8');
    await setSlider(page, 'master', '3');
    expect(await page.evaluate(() => localStorage.getItem('village-audio-master'))).toBe('3');
  });

  test('haptics toggle persists to the existing village-haptics key', async ({ page }) => {
    await open(page);
    await page.click('#mm-settings');
    await page.click('#set-haptics-off');
    expect(await page.evaluate(() => localStorage.getItem('village-haptics'))).toBe('off');
    await page.click('#set-haptics-on');
    expect(await page.evaluate(() => localStorage.getItem('village-haptics'))).toBe('on');
  });

  test('the game keeps running, muted or not, and audio init throws no page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page);
    // The very first click of `open()`'s own setup already exercised the autoplay-unlock listener
    // (`AudioManager.installAutoUnlock`) in a real browser — this test layers a full settings pass
    // and a real game tick on top of it.
    await page.click('#mm-settings');
    for (const id of ['master', 'music', 'notifications', 'village', 'disaster']) await setSlider(page, id, '0'); // fully muted
    await page.click('#set-haptics-off');
    await page.click('#set-back');
    await page.evaluate(() => (window as any).__village.startNewGame('small', 'normal', false, 0));
    await page.waitForTimeout(150); // a few real frames, so the UI-refresh tick's audio hooks run
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as any).__village.running)).toBe(true);
  });
});
