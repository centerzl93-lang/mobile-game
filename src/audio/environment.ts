/**
 * Environmental ambience inputs — the "how loud should each layer be right now" half of the
 * Ambient Audio system (`AudioManager.updateEnvironment` in `manager.ts` is the other half: it
 * takes these numbers and actually ramps the loops). Same shape as `activity.ts`: pure functions
 * reading straight off live `GameState` — terrain (`tiles`), the founding clearing (`origin`),
 * population and built buildings — rather than storing a cached fact anywhere on the state itself
 * (CLAUDE.md "Compute, don't store, derived facts"). Nothing here touches `AudioContext` or
 * `THREE.*`, so — per CLAUDE.md's "Unity migration architecture" — this file is Category A/B,
 * portable to a Unity backend verbatim; only `manager.ts`'s use of the numbers is Category D.
 */
import type { Building, Citizen, GameState, Season, Tile } from '../types';
import { SEASONS } from '../types';
import { intensityFor } from './activity';

export interface EnvironmentMetrics {
  /** 0..1 — how much open water sits near the settlement (a riverside/lakeside village reads high,
   *  one built inland reads at or near zero). */
  water: number;
  /** 0..1 — how wooded the settlement's immediate surroundings are. */
  forest: number;
  /** 0..1 — how much settlement presence there is: population plus what's actually been built,
   *  not raw headcount (CLAUDE.md "do not make population directly map to linear volume"). */
  village: number;
}

/** How far out from the settlement's centre to look for water/forest, in tiles. A fixed physical
 *  distance rather than a fraction of the map — "does the village *hear* a river" doesn't get
 *  harder to satisfy just because the map is the large size. */
const SAMPLE_RADIUS_TILES = 14;
/** Stride across the sample square — CLAUDE.md "Ambient Performance": a coarse grid is plenty for
 *  a mix decision, not a rendering pass, and keeps a sample under ~100 tiles even at the radius
 *  above. */
const SAMPLE_STEP = 2;

/** Fraction of sampled tiles that reads as "clearly near water"/"clearly wooded" — i.e. the point
 *  each metric saturates to 1. A river only ever fills a slice of the tiles around a village (it's
 *  a ribbon, not a lake shore), so this is deliberately a low bar; forest can plausibly surround a
 *  village on every side, so it needs a denser stand before it maxes out. */
const WATER_SATURATE_FRACTION = 0.12;
const FOREST_SATURATE_FRACTION = 0.3;

/** Population + built-building count this reads as "as busy as this ever sounds" — comfortably
 *  below a Town's own 100-population gate, so Town and City both sit near the ceiling rather than
 *  the ambience continuing to climb into a wall of noise at City scale (CLAUDE.md "large settlement
 *  remains performant/does not produce excessive audio"). */
const VILLAGE_SATURATE_ACTIVITY = 130;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** The season live state is in right now, defaulting sanely for a partial/malformed state (a test
 *  fixture, an old save mid-migration) rather than throwing — audio must never be the thing that
 *  crashes on a state shape it wasn't quite expecting. */
export function seasonOf(s: GameState): Season {
  return SEASONS[s.season ?? 0] ?? 'Spring';
}

/**
 * Where "the settlement" is, for environment sampling. Prefers `s.origin` — the founding clearing
 * — over the mean of every building's position for the same reason `loiterPoint` in
 * `simulation.ts` does: a quarry or mine raised at the far edge of the map would otherwise drag the
 * sampling point away from where everyone actually lives. Falls back to the mean building position,
 * then the map centre, for a state that predates `origin` or has nothing built yet.
 */
function settlementCentre(s: GameState): { x: number; y: number } {
  if (s.origin) return s.origin;
  const buildings = s.buildings ?? [];
  if (buildings.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const b of buildings) {
      sx += b.x;
      sy += b.y;
    }
    return { x: sx / buildings.length, y: sy / buildings.length };
  }
  return { x: (s.w ?? 72) / 2, y: (s.h ?? 72) / 2 };
}

/** Fraction of a coarse sample grid around `(cx, cy)` that is water/forest. Bounded to
 *  `SAMPLE_RADIUS_TILES` and strided by `SAMPLE_STEP` — CLAUDE.md "Avoid scanning the entire map
 *  every frame" — so this stays cheap regardless of map size, and `EnvironmentSampler` below only
 *  ever calls it a few times a minute besides. */
function terrainDensity(s: GameState, cx: number, cy: number): { water: number; forest: number } {
  const tiles: Tile[] | undefined = s.tiles;
  const w = s.w;
  const h = s.h;
  if (!tiles || !tiles.length || !w || !h) return { water: 0, forest: 0 };

  let waterN = 0;
  let forestN = 0;
  let total = 0;
  const x0 = Math.max(0, Math.floor(cx - SAMPLE_RADIUS_TILES));
  const x1 = Math.min(w - 1, Math.ceil(cx + SAMPLE_RADIUS_TILES));
  const y0 = Math.max(0, Math.floor(cy - SAMPLE_RADIUS_TILES));
  const y1 = Math.min(h - 1, Math.ceil(cy + SAMPLE_RADIUS_TILES));
  for (let y = y0; y <= y1; y += SAMPLE_STEP) {
    for (let x = x0; x <= x1; x += SAMPLE_STEP) {
      if (Math.hypot(x - cx, y - cy) > SAMPLE_RADIUS_TILES) continue;
      const t = tiles[y * w + x];
      if (!t) continue;
      total++;
      if (t.type === 'water') waterN++;
      else if (t.type === 'forest') forestN++;
    }
  }
  if (total === 0) return { water: 0, forest: 0 };
  return { water: waterN / total, forest: forestN / total };
}

/** How much presence the settlement itself has right now — population plus what's actually
 *  standing, run through the same saturating curve `activity.ts` uses for worker counts, so a
 *  Hamlet and a City don't share one linear scale that makes the City deafening. */
function villageActivity(citizens: Citizen[] | undefined, buildings: Building[] | undefined): number {
  const built = (buildings ?? []).filter((b) => b.built && !b.razed).length;
  const score = (citizens?.length ?? 0) + built;
  return intensityFor(score, VILLAGE_SATURATE_ACTIVITY);
}

/**
 * The live ambient mix for the village as it stands right now. Pure and uncached — see
 * `EnvironmentSampler` for the throttle a caller should put in front of this in a live loop; this
 * function itself is what `sim-tests/` exercises directly against hand-built fixtures.
 */
export function computeEnvironmentMetrics(s: GameState): EnvironmentMetrics {
  const centre = settlementCentre(s);
  const density = terrainDensity(s, centre.x, centre.y);
  // A bare winter canopy reads quieter than the same wood in leaf — CLAUDE.md "Forest ambience can
  // vary seasonally" — kept to this one multiplier rather than a full seasonal model.
  const forestSeasonal = seasonOf(s) === 'Winter' ? 0.7 : 1;
  return {
    water: clamp01(density.water / WATER_SATURATE_FRACTION),
    forest: clamp01((density.forest / FOREST_SATURATE_FRACTION) * forestSeasonal),
    village: villageActivity(s.citizens, s.buildings),
  };
}

/** A low, mostly-flat wind bed — CLAUDE.md "Wind Ambient": "very low volume, continuous... avoid
 *  obvious repetitive looping." There's no weather system to react to yet, so the one extension
 *  point this phase adds is seasonal: a bit more noticeable in Winter (CLAUDE.md "Wind can become
 *  somewhat more noticeable in winter"), unchanged the rest of the year. */
export function windIntensity(s: GameState): number {
  const base = 0.35;
  return seasonOf(s) === 'Winter' ? Math.min(1, base + 0.25) : base;
}

/** How often `EnvironmentSampler.sample` actually re-walks the terrain grid. CLAUDE.md "Ambient
 *  Performance": "prefer cached environment metrics... periodic recalculation." A village's
 *  surroundings only change on the timescale of felling/replanting a forest or raising a building,
 *  so a few seconds of staleness is never audible as a jump. */
const RECOMPUTE_INTERVAL_MS = 4000;

/**
 * Throttles `computeEnvironmentMetrics` to at most once per `RECOMPUTE_INTERVAL_MS`, so a caller on
 * a fast tick (`AudioManager.updateEnvironment`, called from `main.ts`'s 100ms UI-refresh loop) can
 * call `sample` every time without re-walking the terrain grid every time. Holds no `GameState` of
 * its own between calls — just the last result and when it was taken.
 */
export class EnvironmentSampler {
  private cached: EnvironmentMetrics = { water: 0, forest: 0, village: 0 };
  private lastAt = -Infinity;

  sample(s: GameState, nowMs: number): EnvironmentMetrics {
    if (nowMs - this.lastAt >= RECOMPUTE_INTERVAL_MS) {
      this.cached = computeEnvironmentMetrics(s);
      this.lastAt = nowMs;
    }
    return this.cached;
  }

  /** Test/debug hook: force the next `sample` to recompute regardless of the clock. */
  invalidate(): void {
    this.lastAt = -Infinity;
  }
}
