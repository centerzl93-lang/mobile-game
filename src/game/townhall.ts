/**
 * Town Hall dashboard: one query function that reads the live village and hands back everything
 * the Town Hall UI draws — the books, production, population, and the standing rules — as plain
 * data. No DOM, no Three.js, nothing UI-specific: `main.ts` calls `townHallDashboard` once a frame
 * and hands the result straight to `ui.ts`, which only ever renders it (see the "Unity migration
 * architecture" note in CLAUDE.md — this file is Category A, reusable as-is).
 *
 * Every figure here is either read straight off `GameState` or off the existing ledger
 * (`ledgerFor`, `s.ledger`, `s.popHistory`) — nothing is modelled from a nominal production rate.
 * See the doc comments on `Building.producedThisSeason` and `ledgerFor` for why: a formula built
 * from a worker count would have to relearn every blocker (a missing input, sickness, a stockpile
 * cap) that the simulation already accounts for, and would drift from it the moment either changed.
 */
import {
  activePolicies,
  BUILDING_DEFS,
  Building,
  BuildingType,
  FESTIVAL_FOOD,
  FOOD_ICON,
  FOOD_KINDS,
  GameState,
  HUD_CORE,
  LimitKey,
  PolicyId,
  POLICIES,
  POLICY_META,
  policyCapacity,
  PopHistoryRow,
  RESOURCE_CATEGORY,
  RESOURCE_CATEGORY_META,
  RESOURCE_ICON,
  RESOURCE_KINDS,
  ResourceCategory,
  ResourceKind,
  SEASONS,
  isAdult,
  isInfant,
  isStudent,
} from '../types';
import { ledgerFor } from './simulation';
import { totalAvailable, totalFoodAvailable } from './storage';

/** Building types that turn worker-hours into a stored resource (mirrors the case list in
 *  `workOutput`, simulation.ts) — the set the Production tab's by-building list draws from. */
const PRODUCER_BUILDING_TYPES: ReadonlySet<BuildingType> = new Set<BuildingType>([
  'gatherer', 'fishing', 'hunting', 'ranch', 'lumberyard', 'herbalist',
  'quarry', 'mine', 'woodcutter', 'blacksmith', 'luxury', 'tailor', 'farm',
]);

/** How many of the by-building production rows to show — enough for a mid-size village to see
 *  every trade at a glance, short of turning the tab into a villager-by-villager ledger. */
const MAX_BUILDING_ROWS = 10;

export interface ChartSeries {
  seasonLabels: string[];
  values: number[];
}

export interface InventoryRow {
  /** A single resource, or `'food'` for the one row that folds all 25 food kinds together — the
   *  same aggregation the HUD's own 🍽️ chip does (see `HUD_CORE`/`FOOD_ICON`). */
  kind: LimitKey;
  icon: string;
  label: string;
  category: ResourceCategory;
  stock: number;
  /** Player-set stockpile cap, if one is set on this kind (see `LIMITABLE`) — `null` means none. */
  cap: number | null;
  /** Last season's net change (production minus consumption). */
  net: number;
  trend: ChartSeries;
}

export interface ProductionCategoryRow {
  category: ResourceCategory;
  icon: string;
  label: string;
  /** Last season's gross output (production before consumption) summed across the category. */
  perSeason: number;
  trend: ChartSeries;
}

export interface BuildingProductionRow {
  id: number;
  name: string;
  emoji: string;
  workers: number;
  jobs: number;
  /** What it made last season — empty when staffed but blocked (the bottleneck the tab exists to
   *  surface), one or two entries otherwise (a ranch can yield more than one product). */
  produced: { kind: ResourceKind; icon: string; amount: number }[];
}

export interface PopulationSummary {
  total: number;
  children: number;
  students: number;
  adults: number;
  workers: number;
  builders: number;
  /** Idle adults — neither employed nor building — the same figure the Job Board's "free" count
   *  reads (`isAdult && jobId === null && !builder`). */
  available: number;
  sick: number;
}

export interface GrowthSummary {
  births: number;
  deaths: number;
  immigrants: number;
  /** `births + immigrants - deaths`, summed over the rows closed so far this year. */
  netThisYear: number;
  popTrend: ChartSeries;
  birthsTrend: ChartSeries;
  deathsTrend: ChartSeries;
  immigrantsTrend: ChartSeries;
}

export interface PolicyCard {
  id: PolicyId;
  emoji: string;
  label: string;
  gain: string;
  cost: string;
  enacted: boolean;
  active: boolean;
  /** Set only for an enacted-but-lapsed policy: why it isn't in force right now. */
  lapsedReason?: string;
}

export interface TownHallDashboard {
  season: string;
  year: number;
  /** Clerks actually at their desks right now. */
  clerks: number;
  /** The hall's desks, built or not (`BUILDING_DEFS.townhall.jobs`) — clerks is capped at this. */
  clerkJobs: number;
  /** Standing rules the clerks can currently keep — one per clerk. */
  capacity: number;
  policies: PolicyCard[];
  /** `policies` filtered to the ones actually in force — what "ACTIVE POLICIES" headlines. */
  activeEffects: PolicyCard[];
  canFestival: boolean;
  festivalReason?: string;
  inventory: InventoryRow[];
  production: ProductionCategoryRow[];
  buildingProduction: BuildingProductionRow[];
  buildingProductionTruncated: boolean;
  population: PopulationSummary;
  growth: GrowthSummary;
}

function shortSeason(row: { year: number; season: number }): string {
  return `${SEASONS[row.season].slice(0, 2)} Y${row.year}`;
}

/** The stockpile cap that applies to `kind`, if the player set one — `steeltools` shares the
 *  `tools` cap rather than carrying its own (see `limitStock` in simulation.ts). */
function capFor(s: GameState, kind: ResourceKind): number | null {
  const key: LimitKey = kind === 'steeltools' ? 'tools' : (kind as LimitKey);
  const v = s.limits?.[key];
  return v && v > 0 ? v : null;
}

function inventoryRows(s: GameState): InventoryRow[] {
  const ledger = s.ledger ?? [];
  const seasonLabels = ledger.map(shortSeason);
  // One row for every food kind would bury wood/tools/clothing under two dozen crops — the HUD
  // folds them into a single 🍽️ chip for the same reason (see `HUD_CORE`'s doc comment), so the
  // dashboard's inventory leads with the same aggregate rather than inventing a different cut.
  const foodTrend = ledger.map((row) => FOOD_KINDS.reduce((sum, k) => sum + (row.net[k] ?? 0), 0));
  const foodCap = s.limits?.food;
  const rows: InventoryRow[] = [
    {
      kind: 'food',
      icon: FOOD_ICON,
      label: 'Food',
      category: 'food',
      stock: totalFoodAvailable(s),
      cap: foodCap && foodCap > 0 ? foodCap : null,
      net: foodTrend.length > 0 ? foodTrend[foodTrend.length - 1] : 0,
      trend: { seasonLabels, values: foodTrend },
    },
  ];
  for (const kind of RESOURCE_KINDS) {
    if (FOOD_KINDS.includes(kind)) continue;
    // The current stock is read straight off the barns/larders, never off the ledger — a brand-new
    // village has real starting stock before its first season has ever closed, and `ledgerFor`
    // returns null until then. The ledger only ever supplies the season-over-season trend.
    const stock = totalAvailable(s, kind);
    const row = ledgerFor(s, kind);
    // Always show the HUD's own core resources (even at zero, like the HUD itself), plus anything
    // else the village currently holds or moved last season — a fixed dump of all 48 kinds would
    // bury the handful that matter under a wall of zeroes.
    const meaningful = stock > 0.01 || Math.abs(row?.net ?? 0) > 0.01;
    if (!HUD_CORE.includes(kind) && !meaningful) continue;
    rows.push({
      kind,
      icon: RESOURCE_ICON[kind],
      label: kind[0].toUpperCase() + kind.slice(1),
      category: RESOURCE_CATEGORY[kind],
      stock,
      cap: capFor(s, kind),
      net: row?.net ?? 0,
      trend: { seasonLabels, values: row?.trend ?? [] },
    });
  }
  return rows;
}

const PRODUCTION_CATEGORY_ORDER: ResourceCategory[] = [
  'food', 'materials', 'fuel', 'tools', 'clothing', 'medicine', 'luxury', 'livestock',
];

function productionRows(s: GameState): ProductionCategoryRow[] {
  const ledger = s.ledger ?? [];
  const kindsByCategory = new Map<ResourceCategory, ResourceKind[]>();
  for (const kind of RESOURCE_KINDS) {
    const cat = RESOURCE_CATEGORY[kind];
    let list = kindsByCategory.get(cat);
    if (!list) kindsByCategory.set(cat, (list = []));
    list.push(kind);
  }
  const rows: ProductionCategoryRow[] = [];
  for (const category of PRODUCTION_CATEGORY_ORDER) {
    const kinds = kindsByCategory.get(category) ?? [];
    // Gross production per season: net change plus what was spent, summed across the category —
    // "how much did the village make", independent of how much it also used up.
    const grossOf = (row: (typeof ledger)[number]) =>
      kinds.reduce((sum, k) => sum + (row.net[k] ?? 0) + (row.out[k] ?? 0), 0);
    const values = ledger.map(grossOf);
    const perSeason = values.length > 0 ? values[values.length - 1] : 0;
    // Only a category the village has actually touched — a village with no luxury workshop yet
    // has nothing to say about luxury goods, and an empty row would just be noise.
    if (perSeason < 0.01 && values.every((v) => v < 0.01)) continue;
    rows.push({
      category,
      icon: RESOURCE_CATEGORY_META[category].icon,
      label: RESOURCE_CATEGORY_META[category].label,
      perSeason,
      trend: { seasonLabels: ledger.map(shortSeason), values },
    });
  }
  return rows;
}

function buildingProductionRows(s: GameState): { rows: BuildingProductionRow[]; truncated: boolean } {
  const candidates = s.buildings.filter(
    (b) => b.built && !b.demolish && PRODUCER_BUILDING_TYPES.has(b.type) && (b.workers.length > 0 || hasProduced(b)),
  );
  const withTotal = candidates.map((b) => ({
    b,
    total: Object.values(b.lastSeasonProduced ?? {}).reduce((n, v) => n + (v ?? 0), 0),
  }));
  // Busiest trades first — a village checking for bottlenecks wants its biggest jobs up top, and
  // a staffed-but-idle building (total 0) still sorts to the bottom rather than vanishing.
  withTotal.sort((a, b) => b.total - a.total || a.b.id - b.b.id);
  const truncated = withTotal.length > MAX_BUILDING_ROWS;
  const rows: BuildingProductionRow[] = withTotal.slice(0, MAX_BUILDING_ROWS).map(({ b }) => {
    const def = BUILDING_DEFS[b.type];
    const produced = Object.entries(b.lastSeasonProduced ?? {})
      .filter(([, amount]) => (amount ?? 0) > 0.01)
      .sort((a, c) => (c[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 2)
      .map(([kind, amount]) => ({ kind: kind as ResourceKind, icon: RESOURCE_ICON[kind as ResourceKind], amount: amount ?? 0 }));
    return {
      id: b.id,
      name: b.name ?? def.name,
      emoji: def.emoji,
      workers: b.workers.length,
      jobs: def.jobs,
      produced,
    };
  });
  return { rows, truncated };
}

function hasProduced(b: Building): boolean {
  const p = b.lastSeasonProduced;
  return !!p && Object.values(p).some((v) => (v ?? 0) > 0.01);
}

function populationSummary(s: GameState): PopulationSummary {
  let children = 0, students = 0, workers = 0, builders = 0, available = 0, sick = 0;
  for (const c of s.citizens) {
    if (isInfant(c)) children++;
    else if (isStudent(c)) students++;
    if (c.sick) sick++;
    if (c.jobId !== null) workers++;
    else if (c.builder) builders++;
    else if (isAdult(c)) available++;
  }
  const total = s.citizens.length;
  return { total, children, students, adults: total - children - students, workers, builders, available, sick };
}

function trend(rows: PopHistoryRow[], pick: (r: PopHistoryRow) => number): ChartSeries {
  return { seasonLabels: rows.map(shortSeason), values: rows.map(pick) };
}

function growthSummary(s: GameState): GrowthSummary {
  const rows = s.popHistory ?? [];
  const thisYear = rows.filter((r) => r.year === s.year);
  const births = thisYear.reduce((n, r) => n + r.births, 0);
  const deaths = thisYear.reduce((n, r) => n + r.deaths, 0);
  const immigrants = thisYear.reduce((n, r) => n + r.immigrants, 0);
  return {
    births, deaths, immigrants,
    netThisYear: births + immigrants - deaths,
    popTrend: trend(rows, (r) => r.pop),
    birthsTrend: trend(rows, (r) => r.births),
    deathsTrend: trend(rows, (r) => r.deaths),
    immigrantsTrend: trend(rows, (r) => r.immigrants),
  };
}

function policyCards(s: GameState): PolicyCard[] {
  const enacted = s.policies ?? [];
  const active = activePolicies(s);
  const capacity = policyCapacity(s);
  return POLICIES.map((id) => {
    const isEnacted = enacted.includes(id);
    const isActive = active.includes(id);
    let lapsedReason: string | undefined;
    if (isEnacted && !isActive) {
      const idx = enacted.indexOf(id);
      const shortfall = idx + 1 - capacity;
      lapsedReason = capacity < 1
        ? 'Needs a clerk at the Town Hall'
        : `Needs ${shortfall} more clerk${shortfall > 1 ? 's' : ''}`;
    }
    return { id, ...POLICY_META[id], enacted: isEnacted, active: isActive, lapsedReason };
  });
}

export function townHallDashboard(s: GameState): TownHallDashboard {
  const capacity = policyCapacity(s);
  const hall = s.buildings.find((b) => b.type === 'townhall' && b.built);
  const clerks = hall ? Math.min(hall.workers.length, BUILDING_DEFS.townhall.jobs) : 0;
  const hasFood = totalFoodAvailable(s) >= FESTIVAL_FOOD;
  const canFestival = capacity >= 1 && hasFood;
  const policies = policyCards(s);
  const { rows: buildingProduction, truncated } = buildingProductionRows(s);
  return {
    season: SEASONS[s.season],
    year: s.year,
    clerks,
    clerkJobs: BUILDING_DEFS.townhall.jobs,
    capacity,
    policies,
    activeEffects: policies.filter((p) => p.active),
    canFestival,
    festivalReason: canFestival
      ? undefined
      : capacity < 1
        ? 'Needs a clerk at the Town Hall'
        : `Needs ${FESTIVAL_FOOD} food banked`,
    inventory: inventoryRows(s),
    production: productionRows(s),
    buildingProduction,
    buildingProductionTruncated: truncated,
    population: populationSummary(s),
    growth: growthSummary(s),
  };
}
