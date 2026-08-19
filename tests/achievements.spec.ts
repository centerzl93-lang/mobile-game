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

  // Placement scan shared by the tests below: a `normal` village opens with only a barn, so a test
  // that needs a house on the map lays one on the first valid spot ringing out from the clearing.
  const PLACE_HOUSE = `(() => {
    const g = window.__village, s = g.state;
    const barn = s.buildings.find((b) => b.type === 'barn');
    // A site is free to place, but placement still checks the materials exist in storage. A lean
    // normal-difficulty barn can't afford a house, so stock it before scanning for a spot.
    barn.store.wood = (barn.store.wood || 0) + 500;
    barn.store.stone = (barn.store.stone || 0) + 500;
    for (let r = 2; r < 16; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = barn.x + dx, y = barn.y + dy;
          if (g.debugCanPlace('house', x, y).ok && g.debugPlace('house', x, y) !== null) return true;
        }
    return false;
  })()`;

  test('placing a house unlocks "Build your first house" on the next clock tick, off the live village', async ({ page }) => {
    // Regression: `checkAchievements` runs on the 100ms UI clock, but the persisted `placedTypes`
    // tally is only stamped at season turnover. Reading only that tally left "Build your first house"
    // locked for up to a whole season (ten real minutes) after the house was actually placed. The
    // check must read the *live* buildings so the site counts the instant it is laid down.
    await open(page);
    const out = await page.evaluate((placeHouse) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      g.unlockedAchievements.clear(); // ignore anything a prior test persisted
      localStorage.removeItem('lv_achievements');

      const before = g.unlockedAchievements.has('house1'); // a normal village has no house yet
      const placed = (0, eval)(placeHouse);
      const hasHouseNow = g.state.buildings.some((b: any) => b.type === 'house');
      const tallyEmptyOfHouse = !(g.state.stats.placedTypes ?? []).includes('house');
      g.checkAchievements(); // the same call the frame loop makes — no season has turned over
      return {
        before,
        placed,
        hasHouseNow,
        tallyEmptyOfHouse,
        unlockedHouse1: g.unlockedAchievements.has('house1'),
        storedHouse1: JSON.parse(localStorage.getItem('lv_achievements') || '[]').includes('house1'),
      };
    }, PLACE_HOUSE);
    expect(out.before).toBe(false); // locked before the house was placed
    expect(out.placed).toBe(true); // the house found a home
    expect(out.hasHouseNow).toBe(true); // it is on the live map
    expect(out.tallyEmptyOfHouse).toBe(true); // …but the season-turnover tally hasn't recorded it
    expect(out.unlockedHouse1).toBe(true); // and it fires anyway, from the live read
    expect(out.storedHouse1).toBe(true); // and is persisted immediately
  });

  test('an already-earned achievement does not fire, celebrate, or persist a second time', async ({ page }) => {
    await open(page);
    const out = await page.evaluate((placeHouse) => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      g.unlockedAchievements.clear();
      localStorage.removeItem('lv_achievements');
      (0, eval)(placeHouse); // stand a house so house1 is genuinely earned

      g.checkAchievements(); // first pass unlocks house1 (and any other opening feats)
      const sizeAfterFirst = g.unlockedAchievements.size;
      const storedAfterFirst = JSON.parse(localStorage.getItem('lv_achievements') || '[]');
      document.querySelector('.ach-pop')?.remove(); // clear the celebration the first pass raised

      g.checkAchievements(); // nothing new is true — this must be a no-op
      const sizeAfterSecond = g.unlockedAchievements.size;
      const storedAfterSecond = JSON.parse(localStorage.getItem('lv_achievements') || '[]');
      return {
        hadHouse1: g.unlockedAchievements.has('house1'),
        sizeAfterFirst,
        sizeAfterSecond,
        // the id is stored exactly once, never duplicated
        house1Count: storedAfterSecond.filter((x: string) => x === 'house1').length,
        // no fresh celebration popup was raised on the second pass
        noNewPopup: !document.querySelector('.ach-pop'),
        storedStable: JSON.stringify(storedAfterFirst.sort()) === JSON.stringify(storedAfterSecond.sort()),
      };
    }, PLACE_HOUSE);
    expect(out.hadHouse1).toBe(true);
    expect(out.sizeAfterSecond).toBe(out.sizeAfterFirst); // no growth on the repeat pass
    expect(out.house1Count).toBe(1); // stored once, not appended again
    expect(out.noNewPopup).toBe(true); // no re-celebration
    expect(out.storedStable).toBe(true);
  });

  test('the tally is a save/load fallback: a type only in placedTypes still counts', async ({ page }) => {
    // A building placed and demolished in a past season is gone from the live list but remembered in
    // the persisted `placedTypes` tally (which rides along in the save). Its achievement must stay
    // reachable from that tally alone.
    await open(page);
    const out = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'normal', true, 0);
      g.unlockedAchievements.clear();
      localStorage.removeItem('lv_achievements');

      // No monument stands, but the tally remembers one was raised once.
      const monumentNow = g.state.buildings.some((b: any) => b.type === 'monument');
      if (!g.state.stats.placedTypes.includes('monument')) g.state.stats.placedTypes.push('monument');
      g.checkAchievements();
      return {
        monumentNow,
        unlockedFromTally: g.unlockedAchievements.has('monumentBuild'),
      };
    });
    expect(out.monumentNow).toBe(false); // nothing stands
    expect(out.unlockedFromTally).toBe(true); // the persisted tally alone earns it
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
      g.startNewGame('small', 'normal', true);
      g.persist();
      // Continue resumes the autosave slot, so downgrade that slot's envelope (the one it loads).
      const key = `little-village-save-v12-slot${g.debugAutosaveSlot()}`;
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
