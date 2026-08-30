import { test, expect, Page } from '@playwright/test';

// Drives the real placement UI (toolbar → popout → Build/Rotate) and the settings panel, with
// `navigator.vibrate` stubbed to record every call — see CLAUDE.md "Haptics architecture". Runs on
// the flat 2D renderer for the same reason every other click-driven spec does (see `newgame.spec.ts`'s
// `open2d` doc comment): headless Chromium software-rasterises the 3D view at ~2 fps, which blows a
// click-heavy test's time budget for no reason relevant to what's under test here.

/** Stubs `navigator.vibrate` *before* any page script runs (haptics installs on first load), and
 *  collects every call's pattern into `window.__vibrateCalls` so the test can read it back. */
async function openWithVibrateSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__vibrateCalls = [];
    Object.defineProperty(window.navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => {
        (window as any).__vibrateCalls.push(pattern);
        return true;
      },
    });
  });
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

const vibrateCount = (page: Page) => page.evaluate(() => (window as any).__vibrateCalls.length);
const vibrateCalls = (page: Page) => page.evaluate(() => (window as any).__vibrateCalls) as Promise<number[][]>;
/** Clears the spy's log. Used after setup so an achievement earned incidentally along the way
 *  (e.g. a fresh village's very first low-stock warning, or founding-related achievements — the
 *  achievement checker runs on the ordinary UI clock, not tied to anything this file drives) never
 *  pollutes a count the test cares about. */
const resetVibrateSpy = (page: Page) => page.evaluate(() => { (window as any).__vibrateCalls.length = 0; });

// See `src/audio/haptics.ts`'s `PATTERN` table — kept in sync here so a test can tell *which*
// semantic haptic fired without reaching into module internals from a browser page.
const BUILDING_PATTERN = [25];
const ERROR_PATTERN = [15];

/**
 * Clears a generous patch of ground around the reticle and moves the starting barn out of the
 * way — the same setup `newgame.spec.ts`'s "Build and Rotate sit under the ghost" test uses, so
 * placement always finds a legal, reachable spot — then arms House **pinned**, the same state a
 * long-press on the toolbar button leaves behind (see that file's "holding a build button pins it"
 * test). Pinned keeps `.rs-build`/`.rs-rot` in the DOM across repeat placements instead of the
 * pop-out closing after one, which the rate-limiting test needs to mash the button several times.
 */
async function setUpHousePlacement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__village;
    g.startNewGame('small', 'easy', false);
    const s = g.state;
    const { tx, ty } = g.debugReticleTile('house');
    for (let dy = -1; dy <= 6; dy++)
      for (let dx = -1; dx <= 6; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
        const t = s.tiles[y * s.w + x];
        t.type = 'grass';
        t.trees = 0;
        delete t.stone;
        delete t.iron;
      }
    s.buildings = s.buildings.filter((b: any) => b.type === 'barn');
    s.buildings[0].x = 2;
    s.buildings[0].y = 2;
    s.navVersion = (s.navVersion ?? 0) + 1;
    g.onSelectBuild('house', true);
  });
  await expect(page.locator('.ranch-size .rs-build')).toBeVisible();
}

test.describe('haptics', () => {
  test('preview, panning and rotation never vibrate — only confirming a placement does', async ({ page }) => {
    await openWithVibrateSpy(page);
    await setUpHousePlacement(page);
    await resetVibrateSpy(page); // clear any incidental startup achievement/warning haptic

    // Panning the reticle around and rotating the ghost are exactly the moments CLAUDE.md says
    // must stay silent — only the actual Build confirmation should feel like anything.
    await page.evaluate(() => (window as any).__village.camera.focus(5, 5));
    await page.evaluate(() => (window as any).__village.camera.focus(8, 3));
    const rotate = page.locator('.ranch-size .rs-rot');
    await rotate.click();
    await rotate.click();
    expect(await vibrateCount(page)).toBe(0);

    await page.click('.ranch-size .rs-build');
    // This is also the village's first house, which legitimately earns "Build your first house"
    // (its own ACHIEVEMENT haptic) in the same beat — assert the BUILDING haptic specifically
    // fired, rather than a raw count that a second, equally-valid haptic would throw off.
    expect(await vibrateCalls(page)).toContainEqual(BUILDING_PATTERN);
  });

  test('rapid repeated invalid placement attempts are rate-limited, not one buzz per tap', async ({ page }) => {
    await openWithVibrateSpy(page);
    await setUpHousePlacement(page);
    await resetVibrateSpy(page);

    // First placement lands and is valid.
    await page.click('.ranch-size .rs-build');
    expect(await vibrateCalls(page)).toContainEqual(BUILDING_PATTERN);

    // The reticle hasn't moved, so the plot it just filled is now occupied: every further tap on
    // the same spot is an invalid placement. A player mashing the button must not feel one ERROR
    // buzz per tap.
    for (let i = 0; i < 6; i++) await page.click('.ranch-size .rs-build');
    const errorCalls = (await vibrateCalls(page)).filter((p) => JSON.stringify(p) === JSON.stringify(ERROR_PATTERN));
    expect(errorCalls.length).toBeLessThan(6);
    expect(errorCalls.length).toBeGreaterThan(0); // still felt *something* — not swallowed entirely
  });

  test('disabling haptics in Settings stops vibration; placement still works', async ({ page }) => {
    await openWithVibrateSpy(page);
    await page.click('#mm-settings');
    await page.click('#set-haptics-off');
    await page.click('#set-back');
    await setUpHousePlacement(page);

    const before = await page.evaluate(() => (window as any).__village.state.buildings.length);
    await page.click('.ranch-size .rs-build');
    const after = await page.evaluate(() => (window as any).__village.state.buildings.length);

    expect(after, 'gameplay is unaffected by the haptics setting').toBe(before + 1);
    expect(await vibrateCount(page), 'no vibration once haptics are off').toBe(0);
  });

  test('an unsupported navigator.vibrate never breaks placement or throws page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: undefined });
    });
    await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
    await setUpHousePlacement(page);

    const before = await page.evaluate(() => (window as any).__village.state.buildings.length);
    await page.click('.ranch-size .rs-build');
    const after = await page.evaluate(() => (window as any).__village.state.buildings.length);

    expect(after).toBe(before + 1);
    expect(errors).toEqual([]);
  });
});
