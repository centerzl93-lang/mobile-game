import { test, expect, Page } from '@playwright/test';

// These tests drive the real game via its `window.__village` debug hook — the same hook the
// scratchpad drivers use. `?gfx=low` keeps the WebGL scene cheap enough for headless CI.
const W = 48;
const H = 48;

/** Load the app and start a fresh Small (48×48) game. */
async function startSmall(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  (page as unknown as { _errors: string[] })._errors = errors;
  await page.goto('/?gfx=low', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__village, undefined, { timeout: 10_000 });
  await page.evaluate(() => (window as any).__village.startNewGame('small'));
  await page.waitForTimeout(300);
}

test.describe('world generation, placement & pathfinding', () => {
  test('mountains, foothills, and a grass-majority map with water', async ({ page }) => {
    await startSmall(page);
    const gen = await page.evaluate(([W, H]) => {
      const s = (window as any).__village.state;
      const T = s.tiles;
      const count: Record<string, number> = { grass: 0, forest: 0, water: 0, stone: 0, foothill: 0 };
      for (const t of T) count[t.type]++;
      const idx = (x: number, y: number) => y * W + x;
      const near = (x: number, y: number, type: string, r: number) => {
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (T[idx(nx, ny)].type === type) return true;
          }
        return false;
      };
      let orphanFoothill = 0, foothillHasStone = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (T[idx(x, y)].type !== 'foothill') continue;
          if (near(x, y, 'stone', 1)) foothillHasStone++; else orphanFoothill++;
        }
      const barn = s.buildings.find((b: any) => b.type === 'barn');
      return { count, orphanFoothill, foothillHasStone, startType: barn ? T[idx(barn.x, barn.y)].type : 'none' };
    }, [W, H] as const);

    expect(gen.count.stone, JSON.stringify(gen.count)).toBeGreaterThan(20);
    expect(gen.count.foothill).toBeGreaterThan(10);
    expect(gen.orphanFoothill).toBe(0);
    expect(gen.foothillHasStone).toBeGreaterThan(0);
    expect(gen.count.grass).toBeGreaterThan(gen.count.stone + gen.count.foothill);
    expect(gen.count.water).toBeGreaterThan(50);
    expect(gen.startType).toBe('grass');
  });

  test('mountains rise into tall peaks', async ({ page }) => {
    await startSmall(page);
    const peak = await page.evaluate(() => (window as any).__village.renderer.maxPeak);
    expect(peak).toBeGreaterThan(1.5);
  });

  test('mines require foothills; quarries go anywhere there is room', async ({ page }) => {
    await startSmall(page);
    const place = await page.evaluate(([W, H]) => {
      const g = (window as any).__village, T = g.state.tiles;
      const idx = (x: number, y: number) => y * W + x;
      const is = (x: number, y: number, t: string) => x >= 0 && y >= 0 && x < W && y < H && T[idx(x, y)].type === t;
      const buildable2x2 = (x: number, y: number) => {
        let footTiles = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const ty = T[idx(x + dx, y + dy)].type;
            if (ty === 'water' || ty === 'stone') return false;
            if (ty === 'foothill') footTiles++;
          }
        return footTiles > 0;
      };
      let foot: number[] | null = null, grassAway: number[] | null = null, mountain: number[] | null = null;
      for (let y = 1; y < H - 2 && !foot; y++) for (let x = 1; x < W - 2; x++) if (buildable2x2(x, y)) { foot = [x, y]; break; }
      const nearStone = (x: number, y: number, r: number) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (is(x + dx, y + dy, 'stone')) return true; return false; };
      for (let y = 1; y < H - 2 && !grassAway; y++) for (let x = 1; x < W - 2; x++) if (is(x, y, 'grass') && is(x + 1, y, 'grass') && is(x, y + 1, 'grass') && is(x + 1, y + 1, 'grass') && !nearStone(x, y, 4)) { grassAway = [x, y]; break; }
      for (let y = 0; y < H && !mountain; y++) for (let x = 0; x < W; x++) if (is(x, y, 'stone')) { mountain = [x, y]; break; }
      const cp = (t: string, xy: number[] | null) => (xy ? g.debugCanPlace(t, xy[0], xy[1]) : { ok: null });
      // The quarry is a fixed 3×6 pit that no longer needs a mountainside, so look for open ground
      // well clear of any rock — the case that used to be refused.
      let quarryOpen: number[] | null = null;
      const clearRect = (x: number, y: number, w: number, h: number) => {
        for (let dy = 0; dy < h; dy++)
          for (let dx = 0; dx < w; dx++) if (!is(x + dx, y + dy, 'grass')) return false;
        return true;
      };
      for (let y = 1; y < H - 7 && !quarryOpen; y++)
        for (let x = 1; x < W - 4; x++)
          if (clearRect(x, y, 3, 6) && !nearStone(x, y, 6)) { quarryOpen = [x, y]; break; }
      return {
        foot, grassAway, mountain, quarryOpen,
        mineOnFoot: cp('mine', foot), mineOnGrass: cp('mine', grassAway), mineOnMountain: cp('mine', mountain),
        quarryOnOpenGround: cp('quarry', quarryOpen), quarryOnMountain: cp('quarry', mountain),
        houseOnFoot: cp('house', foot),
      };
    }, [W, H] as const);

    expect(place.foot).not.toBeNull();
    expect(place.mineOnFoot.ok).toBe(true);
    expect(place.mineOnGrass.ok).toBe(false);
    expect(place.mineOnMountain.ok).toBe(false);
    expect(place.houseOnFoot.ok).toBe(true);
    // A quarry sinks its own pit: open ground far from any rock is fine now.
    expect(place.quarryOpen).not.toBeNull();
    expect(place.quarryOnOpenGround.ok).toBe(true);
    // It still cannot be cut into solid mountain rock.
    expect(place.quarryOnMountain.ok).toBe(false);
  });

  test('a route never crosses a mountain tile', async ({ page }) => {
    await startSmall(page);
    const nav = await page.evaluate(([W, H]) => {
      const g = (window as any).__village, T = g.state.tiles;
      const idx = (x: number, y: number) => y * W + x;
      const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && T[idx(x, y)].type !== 'stone' && T[idx(x, y)].type !== 'water';
      const findWalk = (fx: number, fy: number, sx: number, sy: number) => { let x = fx, y = fy; for (let k = 0; k < 12; k++) { x += sx; y += sy; if (walk(x, y)) return [x, y]; } return null; };
      // Scan mountains for one with a walkable tile on each side, so we exercise a real detour.
      let tested = 0, stoneInPath = 0;
      for (let i = 0; i < T.length; i++) {
        if (T[i].type !== 'stone') continue;
        const mx = i % W, my = (i / W) | 0;
        const a = findWalk(mx, my, -1, 0);
        const b = findWalk(mx, my, 1, 0);
        if (!a || !b) continue;
        const path = g.debugPath(a[0], a[1], b[0], b[1]);
        if (!path) continue; // endpoints in different components — not a detour case
        tested++;
        for (const p of path) if (T[idx(Math.floor(p.x), Math.floor(p.y))].type === 'stone') stoneInPath++;
        if (tested >= 3) break; // a few representative crossings is enough
      }
      return { tested, stoneInPath };
    }, [W, H] as const);
    expect(nav.tested).toBeGreaterThan(0);
    expect(nav.stoneInPath).toBe(0);
  });

  test('no console or WebGL errors during play', async ({ page }) => {
    await startSmall(page);
    await page.evaluate(() => (window as any).__village.debugAdvance(20));
    await page.waitForTimeout(400);
    expect((page as unknown as { _errors: string[] })._errors).toEqual([]);
  });
});
