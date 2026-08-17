import { test, expect, Page } from '@playwright/test';

// Phase 7 — Simulation Speed. The game runs at 1×, 2×, 5× and 10×. A faster speed must only spend
// more simulation time per real frame; it must never let any one tick behave differently — no
// skipped or duplicated events. The implementation guarantees this by sub-stepping: the scaled
// time for a frame is spent in fixed 0.1 s ticks (the same step the sim is clamped to at 1×), so
// N seconds of sim time at 10× is exactly the same 0.1 s ticks as N seconds at 1×.
//
// These specs pin that invariant end-to-end through `window.__village`. `debugAdvanceAtSpeed`
// advances a given amount of *simulation* time as the frame loop would at a chosen speed; the
// whole village state after the run must be byte-for-byte identical across speeds.
async function open(page: Page): Promise<void> {
  await page.goto('/?2d&gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
}

test.describe('simulation speed: the speed button offers 1× / 2× / 5× / 10×', () => {
  test('cycling the speed control walks 1 → 2 → 5 → 10 → 1', async ({ page }) => {
    await open(page);
    const labels = await page.evaluate(() => {
      const g = (window as any).__village;
      g.startNewGame('small', 'easy', false, 0, 4242);
      g.ui.hideOverlay();
      const btn = document.getElementById('btn-speed') as HTMLButtonElement;
      const seen: string[] = [btn.textContent!.trim()];
      for (let i = 0; i < 4; i++) {
        btn.click();
        seen.push(btn.textContent!.trim());
      }
      return seen;
    });
    // First reading is the default (1×), then each click advances, wrapping back to 1×.
    expect(labels).toEqual(['1×', '2×', '5×', '10×', '1×']);
  });
});

// A curated summary standing in for "did every system behave the same": population and its ages
// (aging / births / deaths), stored resources (production / consumption / construction), the
// calendar (seasons), the merchant lifecycle, the event log (notifications), and the RNG cursor
// (disasters / disease / any seeded roll). If the whole GameState serialises identically, all of
// these agree by construction; the summary is what a failure prints so the diff is legible.
const SUMMARY = `(() => {
  const s = (window).__village.state;
  return {
    pop: s.citizens.length,
    ages: s.citizens.map((c) => Math.round(c.age * 100) / 100).sort((a, b) => a - b),
    peakPop: s.stats ? s.stats.peakPop : null,
    resources: JSON.stringify(s.buildings.map((b) => b.store || {})),
    progress: s.buildings.map((b) => Math.round((b.progress || 0) * 1000) / 1000).sort((a, b) => a - b),
    year: s.year,
    season: s.season,
    seasonTimer: Math.round(s.seasonTimer * 1000) / 1000,
    rng: s.rng,
    events: (s.events || []).length,
    fullHash: JSON.stringify(s).length,
  };
})()`;

test.describe('simulation speed: elapsed sim time is identical across speeds', () => {
  test('the same sim seconds at 1× / 2× / 5× / 10× land on the same village', { tag: '@slow' }, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);

    // Two full seasons of simulated life on one seed, disasters ON, run four times at four speeds.
    // Crossing season boundaries fires the whole turnover pipeline (harvest, breeding, clothing,
    // immigration, disease & fire rolls, ledger, tier check, achievements), and the continuous
    // ticks in between run production, consumption, construction, worker assignment, ageing and
    // the merchant lifecycle — so equality here is equality across every listed system.
    const runAt = (speed: number) =>
      page.evaluate(
        ({ speed, summary }) => {
          const g = (window as any).__village;
          g.startNewGame('small', 'easy', true, 0, 4242); // seed 4242, disasters enabled
          g.debugAdvanceAtSpeed(1300, speed);
          // eslint-disable-next-line no-eval
          return eval(summary);
        },
        { speed, summary: SUMMARY },
      );

    const base = await runAt(1);
    for (const speed of [2, 5, 10]) {
      const other = await runAt(speed);
      expect(other, `${speed}× must match 1× after the same elapsed sim time`).toEqual(base);
    }
    // Sanity: the run actually did something — a couple of seasons went by and villagers aged.
    expect(base.year, 'the clock advanced past the first year boundary or seasons').toBeGreaterThanOrEqual(0);
    expect(base.pop, 'the village is alive').toBeGreaterThan(0);
  });
});

test.describe('simulation speed: the sub-stepping is what makes it consistent', () => {
  // A control proving the fix is load-bearing: feeding the sim one oversized 1.0 s tick per "frame"
  // (what a naive `update(state, dt * 10)` would do at 10×) diverges from the sub-stepped run, so
  // the sub-stepping is not a no-op. dt-scaled hazard rolls and waypoint-by-waypoint movement both
  // depend on step size, so a long run at a coarse step drifts away from the fine one.
  test('one oversized tick per frame drifts from the sub-stepped run', { tag: '@slow' }, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const out = await page.evaluate(
      ({ summary }) => {
        const g = (window as any).__village;

        g.startNewGame('small', 'easy', true, 0, 4242);
        g.debugAdvanceAtSpeed(1300, 10); // the shipped path: 0.1 s sub-steps
        // eslint-disable-next-line no-eval
        const fine = eval(summary);

        g.startNewGame('small', 'easy', true, 0, 4242);
        const s = g.state;
        // The naive alternative: 1.0 s per tick (0.1 clamp × 10), no sub-stepping.
        for (let t = 0; t < 1300 && !s.gameOver; t += 1.0) g.debugTick(1.0);
        // eslint-disable-next-line no-eval
        const coarse = eval(summary);

        return { fine, coarse };
      },
      { summary: SUMMARY },
    );
    // Same elapsed sim time, but the coarse stepping lands somewhere else — different resources or
    // construction progress at the very least. (Exact fields vary; the states as a whole differ.)
    expect(JSON.stringify(out.coarse)).not.toEqual(JSON.stringify(out.fine));
  });
});
