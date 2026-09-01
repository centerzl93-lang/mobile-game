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
  basketTrade,
  igniteBuilding,
  debugFloodDamageBuilding,
  debugTriggerFamine,
  type LogFn,
} from '../../src/game/simulation';
import { canPlace, placeBuilding } from '../../src/game/buildings';
import { addNearest } from '../../src/game/storage';
import { tileIndex } from '../../src/game/world';
import {
  buildCost,
  BUILDING_DEFS,
  PATH_DIRT,
  PATH_DIRT_PLAN,
  PATH_STONE,
  PATH_STONE_PLAN,
  ranchCapacity,
  SEASON_LENGTH,
} from '../../src/types';
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

  // Staffed producers of every kind: a gatherer and a forester work their circles, a shepherd
  // works an over-full pen, and a blacksmith and a tailor convert stockpiled inputs. Exercises
  // `runWorker`'s circle-work path (`workSpot`/`scatteredCircleSpots`), `workOutput` for
  // `gatherer`/`lumberyard`/`ranch`/`blacksmith`/`tailor`, the terrain factors
  // (`factorCircle`/`forestInCircle`), forester replanting (`plantCircle`/`tendCircle`/
  // `depleteCircleTrees`), the over-cap cull (`cullOverCap`/`butcherProducts`), the converter
  // input pipeline (`converterInputs`/`firstMissingInput`/`consumeStore` + the fetch-an-input leg),
  // and the produced-load haul back to the barns — none of which any other scenario reaches,
  // because none of them staffs a workplace.
  {
    name: 'production',
    seed: 6006,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    setup: (s) => {
      const origin = s.origin!;
      const gatherer = finishedBuilding(s, 'gatherer');
      gatherer.desiredWorkers = 2;
      const lumberyard = finishedBuilding(s, 'lumberyard');
      lumberyard.desiredWorkers = 2;
      const ranch = finishedBuilding(s, 'ranch');
      ranch.animal = 'sheep';
      // Above the pen's cap on purpose, so the shepherd thins the flock (`cullOverCap`) before
      // settling into the daily round of shearing.
      ranch.animals = ranchCapacity(ranch) + 3;
      ranch.maxAnimals = ranchCapacity(ranch);
      ranch.desiredWorkers = 1;
      const blacksmith = finishedBuilding(s, 'blacksmith');
      blacksmith.desiredWorkers = 1;
      addNearest(s, origin, 'iron', 120);
      const tailor = finishedBuilding(s, 'tailor');
      tailor.desiredWorkers = 1;
      addNearest(s, origin, 'leather', 120);
    },
    checkpoints: [
      { label: 'season-1', advanceSeconds: SEASON_LENGTH },
      { label: 'season-2', advanceSeconds: SEASON_LENGTH },
    ],
  },

  // Roadworks: idle villagers lay planned dirt and stone paths and pull up a pair of pre-built
  // ones. Exercises `buildPath` (the nearest-plan scan, the per-tier material draw), `tearDownPath`
  // (the masonry salvage), and `clearGroundForPath` (a path routed over a forest tile fells the
  // tree; over a loose deposit hauls the stone off). The path plans are written straight onto
  // `s.paths` — this tests the laying, not the planning UI (`planPath`/`confirmPendingPaths`).
  {
    name: 'paving',
    seed: 8008,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    setup: (s) => {
      const o = s.origin!;
      addNearest(s, o, 'stone', 30);
      // A straight run of dirt plan, east of the barn, over open ground.
      for (let k = 0; k < 6; k++) s.paths[tileIndex(o.x - 3 + k, o.y + 4)] = PATH_DIRT_PLAN;
      // Force a forest tile and a loose-stone deposit onto the run so `clearGroundForPath` has
      // something to clear on both branches.
      const ft = s.tiles[tileIndex(o.x - 1, o.y + 4)];
      ft.type = 'forest';
      ft.trees = 0.8;
      s.tiles[tileIndex(o.x, o.y + 4)].stone = 3;
      // A stone plan segment — the builder consumes a unit of stored stone per tile laid.
      for (let k = 0; k < 3; k++) s.paths[tileIndex(o.x + 3 + k, o.y + 4)] = PATH_STONE_PLAN;
      // A pre-laid dirt + stone road north of the barn, both queued for teardown.
      const razeDirt = tileIndex(o.x - 3, o.y - 4);
      const razeStone = tileIndex(o.x - 2, o.y - 4);
      s.paths[razeDirt] = PATH_DIRT;
      s.paths[razeStone] = PATH_STONE;
      s.razePaths = [razeDirt, razeStone];
    },
    checkpoints: [
      { label: 'season-1', advanceSeconds: SEASON_LENGTH },
      { label: 'season-2', advanceSeconds: SEASON_LENGTH },
    ],
  },

  // Player-initiated barter: a Port fleet is hand-docked at a trading post and two `basketTrade`
  // baskets are settled in setup. Exercises the value math (`offerValue`/`purchaseValue`/
  // `requiredValue`/`sumValue`), `merchantBerth`, the stock/inventory checks, a seed unlock, and
  // the achievement-stat tally (`tradesCompleted`, `luxuryExported`, `tradeOnlyImported`,
  // `imported{Gold,Silk}`, `portTradeValue`, `portTradeCount`). The merchant is hand-docked (no
  // boat, stayTimer well past both checkpoints) — this tests the trade, not the arrival.
  {
    name: 'bartering',
    seed: 1010,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    setup: (s) => {
      const post = finishedBuilding(s, 'trading');
      post.store = { wood: 3000, jewelry: 20 };
      const m = s.merchant;
      m.phase = 'docked';
      m.present = true;
      m.category = 'portluxury';
      m.viaPort = true;
      m.priceMod = 1.1;
      m.stock = { gold: 30, silk: 10 };
      m.seedStock = ['wheat', 'corn'];
      m.stayTimer = 10 * SEASON_LENGTH;
      basketTrade(s, { give: { wood: 2500, jewelry: 15 }, get: { gold: 20, silk: 5 }, buySeeds: ['wheat'] });
      basketTrade(s, { give: { wood: 300 }, get: { gold: 5 }, buySeeds: [] });
    },
    checkpoints: [
      { label: 'immediately-after', advanceSeconds: 0 },
      { label: 'season-1', advanceSeconds: SEASON_LENGTH },
    ],
  },

  // A Port and a scheduled fleet: a "return next year" request is pre-seeded for the coming
  // season, so `portSeason` fulfils it deterministically (no reliance on the 0.7 arrival roll),
  // launches a Port merchant (`spawnPortMerchant` — `viaPort`, a `PORT_PRICE_MODS` haggle, varied
  // quantities), and `updateMerchantBoat` sails it up to the harbour and docks it.
  {
    name: 'harbour',
    seed: 9009,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    setup: (s) => {
      finishedBuilding(s, 'port');
      // The first `endSeason` rolls the calendar to Summer/year 1 before `portSeason` runs, so
      // reserve that season. Written straight onto `s.portRequests` (the scenario tests the
      // scheduler, not the docked-merchant `requestMerchantReturn` UI call).
      s.portRequests = [{ category: 'portluxury', season: 'Summer', year: 1 }];
    },
    checkpoints: [
      { label: 'season-1', advanceSeconds: SEASON_LENGTH },
      { label: 'season-2', advanceSeconds: SEASON_LENGTH },
    ],
  },

  // The logistics buildings and their keepers: a market vendor hauls groceries up from the barns
  // and delivers them to a household, and a trading-post keeper matches the post's inventory to
  // the player's stock orders. Exercises `runVendor`/`marketErrand`/`larderShortfall` and
  // `runTrader` — the `runWorker` branches for `market`/`trading`, which have no `workOutput` of
  // their own.
  {
    name: 'services',
    seed: 7007,
    size: 'small',
    difficulty: 'normal',
    disasters: false,
    setup: (s) => {
      const origin = s.origin!;
      finishedBuilding(s, 'house');
      const market = finishedBuilding(s, 'market');
      market.desiredWorkers = 1;
      addNearest(s, origin, 'fruit', 150);
      addNearest(s, origin, 'grain', 150);

      const trading = finishedBuilding(s, 'trading');
      trading.desiredWorkers = 1;
      trading.orders = { wood: 40 } as Partial<Record<ResourceKind, number>>;
      addNearest(s, origin, 'wood', 80);
    },
    checkpoints: [
      { label: 'season-1', advanceSeconds: SEASON_LENGTH },
      { label: 'season-2', advanceSeconds: SEASON_LENGTH },
    ],
  },
];
