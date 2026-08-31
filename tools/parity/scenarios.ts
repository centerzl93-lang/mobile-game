/**
 * Unity parity-harness scenarios (ROADMAP.md Phase 3).
 *
 * The simulation is fully deterministic (a seeded `mulberry32` stream, `src/game/rng.ts`), which
 * makes it the cheapest possible oracle for the C# port's correctness: given the same seed and the
 * same scripted action sequence, the port must land on the same `GameState` at every checkpoint.
 *
 * Each scenario here plays the same role `window.__village`'s `debug*` methods play for a human or a
 * Playwright test — `place()` below is exactly `debugCanPlace`/`debugPlace` (`canPlace`/`placeBuilding`
 * with `ignoreTier: true`), `advance()` is exactly `debugAdvance` (fixed 0.1s sub-steps) — but calls
 * the underlying `src/game/*` functions directly rather than going through a browser, the same
 * "pure simulation-in, assertions-on-GameState-out" style `sim-tests/` already uses (see CLAUDE.md's
 * Testing architecture section). No scenario here needs a renderer or `window.__village` to exist.
 *
 * `export-fixtures.ts` runs every scenario and writes each checkpoint's state as a golden-master
 * fixture; `sim-tests/parity-fixtures.test.ts` re-runs them and diffs against what's committed, so a
 * behavioural change to the simulation can't silently drift the fixtures — regenerating them
 * (`npm run parity:export`) is a deliberate step, not a side effect.
 */
import { newGame } from '../../src/game/state';
import {
  update,
  igniteBuilding,
  debugFloodDamageBuilding,
  debugTriggerFamine,
  type LogFn,
} from '../../src/game/simulation';
import { canPlace, placeBuilding } from '../../src/game/buildings';
import { addNearest } from '../../src/game/storage';
import { buildCost, BUILDING_DEFS, SEASON_LENGTH } from '../../src/types';
import type { Building, BuildingType, Difficulty, GameState, MapSize, ResourceKind } from '../../src/types';

const noLog: LogFn = () => {};

/** Exactly `debugAdvance`'s own loop (`src/main.ts`) — fixed 0.1s sub-steps, stops early on game over. */
export function advance(s: GameState, seconds: number, log: LogFn = noLog): void {
  const step = 0.1;
  for (let t = 0; t < seconds && !s.gameOver; t += step) update(s, step, log);
}

/**
 * Exactly `debugAfford` — `canPlace` also refuses a site the village could never pay for (the
 * materials must already be *somewhere* in storage, even though they aren't deducted until
 * delivery — see `canPlace`'s own comment), so a scripted "just place this" action mints the bill
 * into the nearest barn first, the same way a test does.
 */
function afford(s: GameState, type: BuildingType): void {
  const at = s.origin!;
  for (const [kind, amount] of Object.entries(buildCost(type)) as [ResourceKind, number][]) {
    addNearest(s, at, kind, amount);
  }
}

/**
 * Exactly the `debugCanPlace`/`debugPlace` pair (`ignoreTier: true`), plus the search a scripted
 * action needs to find *some* legal spot near the village without hand-coding map geometry per
 * scenario — spiral outward from the founding tile and place at the first tile/rotation `canPlace`
 * accepts. Terrain-gated buildings (a dock needing water) fall out of this the same way they would
 * for a player: the search just keeps going until it finds ground the building actually fits.
 */
export function place(s: GameState, type: BuildingType): Building {
  afford(s, type);
  const origin = s.origin!;
  for (let r = 1; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = origin.x + dx;
        const y = origin.y + dy;
        for (let rot = 0; rot <= 3; rot++) {
          const rotation = rot as 0 | 1 | 2 | 3;
          if (!canPlace(s, type, x, y, undefined, undefined, rotation, { ignoreTier: true }).ok) continue;
          const b = placeBuilding(s, type, x, y, undefined, undefined, rotation, { ignoreTier: true });
          if (b) return b;
        }
      }
    }
  }
  throw new Error(`parity scenario: no legal placement found for ${type}`);
}

/** `place()` a building and skip straight to finished — the hand-construct-a-`Building` technique
 *  `sim-tests/` already uses (e.g. `trade.test.ts`'s `builtBuilding`) for a scenario that wants a
 *  standing building without simulating the haul-and-build pipeline that got it there. */
function finishedBuilding(s: GameState, type: BuildingType): Building {
  const b = place(s, type);
  b.built = true;
  b.progress = BUILDING_DEFS[type].work;
  return b;
}

export interface ParityCheckpoint {
  /** Fixture file name for this checkpoint (no extension). */
  label: string;
  /** Seconds to advance, via `advance()`, since the previous checkpoint (or scenario start). */
  advanceSeconds: number;
}

export interface ParityScenario {
  name: string;
  seed: number;
  size: MapSize;
  difficulty: Difficulty;
  disasters: boolean;
  /** Scripted actions applied once, right after founding and before the first checkpoint's advance. */
  setup?: (s: GameState, log: LogFn) => void;
  checkpoints: ParityCheckpoint[];
}

export interface ParityResult {
  label: string;
  state: GameState;
}

/** Runs one scenario end to end, returning a `GameState` snapshot at each checkpoint in order. */
export function runScenario(scenario: ParityScenario): ParityResult[] {
  const s = newGame(scenario.size, scenario.difficulty, scenario.disasters, scenario.seed);
  scenario.setup?.(s, noLog);
  const results: ParityResult[] = [];
  for (const cp of scenario.checkpoints) {
    advance(s, cp.advanceSeconds);
    // `GameState` is already the exact shape `save.ts` serializes verbatim (see its own "the whole
    // state is written" rule) — round-tripping through JSON here is what makes each snapshot an
    // independent, plain-data fixture rather than a live reference later advances would mutate.
    results.push({ label: cp.label, state: JSON.parse(JSON.stringify(s)) });
  }
  return results;
}

export const PARITY_SCENARIOS: ParityScenario[] = [
  // The simplest possible oracle: world gen + founding, nothing else. Pins down map generation and
  // the starting village (`foundVillage`) being a pure function of the seed.
  {
    name: 'founding',
    seed: 1001,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    checkpoints: [{ label: 't0', advanceSeconds: 0 }],
  },

  // Construction, hauling and consumption over a year: a few sites are placed once, then builders/
  // laborers/producers do the rest across four season checkpoints with no further scripted input.
  {
    name: 'early-growth',
    seed: 2002,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    setup: (s) => {
      place(s, 'woodcutter');
      place(s, 'house');
      place(s, 'well');
    },
    checkpoints: [
      { label: 'season-1', advanceSeconds: SEASON_LENGTH },
      { label: 'season-2', advanceSeconds: SEASON_LENGTH },
      { label: 'season-3', advanceSeconds: SEASON_LENGTH },
      { label: 'season-4', advanceSeconds: SEASON_LENGTH },
    ],
  },

  // A full calendar year of pure organic play from the founding village alone — no scripted
  // buildings — checkpointed every season so the calendar/tier/ledger machinery is pinned down too.
  {
    name: 'full-year',
    seed: 3003,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    checkpoints: [
      { label: 'spring', advanceSeconds: SEASON_LENGTH },
      { label: 'summer', advanceSeconds: SEASON_LENGTH },
      { label: 'autumn', advanceSeconds: SEASON_LENGTH },
      { label: 'winter', advanceSeconds: SEASON_LENGTH },
    ],
  },

  // The shared DAMAGED/BURNING state machine, forced deterministically rather than left to the
  // season rolls (`fireSeason`/`diseaseSeason`/`floodSeason`, all chance-gated and, for
  // flood/famine, season-gated too) — the same direct-set debug hooks a human uses from the
  // console: `igniteBuilding` is `debugIgnite`, `debugFloodDamageBuilding` is `debugFloodDamage`,
  // `debugTriggerFamine` sets a famine directly, bypassing famine's Summer-only gate so the
  // scenario doesn't need to advance a season first. Disease has no equivalent direct-set hook, so
  // a few citizens are hand-marked `sick` — the same technique `sim-tests/` already uses elsewhere
  // for a scenario chance shouldn't gate.
  {
    name: 'disasters',
    seed: 4004,
    size: 'small',
    difficulty: 'normal',
    disasters: true,
    setup: (s, log) => {
      // Founding stands only a barn, which is fireproof (`isFireproof`) — a house is raised (and
      // marked finished, see `finishedBuilding`) so there's a flammable target to ignite at all.
      const house = finishedBuilding(s, 'house');
      igniteBuilding(s, house, log);
      for (const c of s.citizens.slice(0, 3)) c.sick = true;
      const barn = s.buildings.find((b) => b.type === 'barn')!;
      debugFloodDamageBuilding(s, barn, log);
      debugTriggerFamine(s, 'severe', log);
    },
    checkpoints: [
      { label: 'immediately-after', advanceSeconds: 0 },
      { label: 'season-1', advanceSeconds: SEASON_LENGTH },
    ],
  },

  // A Trading Post from founding, then two seasons of organic river-merchant barter.
  {
    name: 'trade',
    seed: 5005,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    setup: (s) => {
      place(s, 'trading');
    },
    checkpoints: [
      { label: 'season-1', advanceSeconds: SEASON_LENGTH },
      { label: 'season-2', advanceSeconds: SEASON_LENGTH },
    ],
  },
];
