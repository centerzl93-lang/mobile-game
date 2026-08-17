/**
 * Achievements: eighty milestones, each a bronze/silver/gold/platinum feat, checked against the
 * living village and the lifetime tallies it carries (`GameState.stats`).
 *
 * Two design rules run through the list:
 *
 * - **Once earned, always earned.** The set of unlocked ids lives in `localStorage`, not in any one
 *   save, so it survives new games and reloads. A check only ever flips an achievement *on*; losing
 *   the population or burning down the cathedral never takes one back.
 * - **Peaks and totals over the live number.** A village that hit 300 people and crashed to 50 still
 *   earned "reach 300", so the milestone reads `stats.peakPop`, not `citizens.length`. Only the
 *   things a single glance genuinely settles — does a cathedral stand *now*, how many families live
 *   here *now* — read the live state.
 *
 * Difficulty is a judgement about how far into a village's life the feat sits: bronze is the first
 * hour, platinum is the endgame a long, careful game is required for.
 */

import {
  GameState,
  BuildingType,
  ResourceKind,
  FOOD_KINDS,
  BUILD_ORDER,
  VillageStats,
  freshStats,
  isInfant,
  isStudent,
  OLD_AGE_START,
  ADULT_AGE,
} from '../types';
import { villageTier, TIERS } from './tiers';
import { jobSlots } from './state';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Achievement {
  id: string;
  title: string;
  tier: AchievementTier;
  /** True once the village has earned it. Read against live state and `s.stats`. */
  done: (s: GameState) => boolean;
}

/** The medal shown first in each achievement bubble. */
export const TIER_MEDAL: Record<AchievementTier, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '💎',
};
/** Sort/hardness order, low to high. */
export const TIER_RANK: Record<AchievementTier, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

// ---- helpers the checks read through ----
const st = (s: GameState): VillageStats => s.stats ?? freshStats();
const produced = (s: GameState, k: ResourceKind): number => st(s).produced[k] ?? 0;
const producedFood = (s: GameState): number => FOOD_KINDS.reduce((n, k) => n + produced(s, k), 0);
const builtNow = (s: GameState, t: BuildingType): boolean =>
  s.buildings.some((b) => b.type === t && b.built && !b.razed);
/**
 * Has this building type ever been commissioned? Reads the **live** buildings first so a freshly
 * placed site counts the instant it is laid down — the achievement check runs on the 100ms UI clock,
 * but the persisted `placedTypes` tally is only stamped at season turnover, so a site placed
 * mid-season would otherwise wait up to a whole season (ten minutes) before "Build your first house"
 * and its siblings could fire. The persisted tally is still consulted as a fallback: it remembers a
 * type that was placed and later demolished in some past season, and survives save/load.
 */
const placedEver = (s: GameState, t: BuildingType): boolean =>
  s.buildings.some((b) => b.type === t) || st(s).placedTypes.includes(t);
const reached = (s: GameState, tier: 'town' | 'city'): boolean => st(s).maxTier >= TIERS.indexOf(tier);
const isCityNow = (s: GameState): boolean => villageTier(s) === 'city';

/** Occupied households: dwellings someone actually lives in. */
function families(s: GameState): number {
  const homes = new Set<number>();
  for (const c of s.citizens) if (c.homeId !== null) homes.add(c.homeId);
  return homes.size;
}

/** Does some household hold three generations at once — a child, a grown adult, and an elder? */
function threeGenerations(s: GameState): boolean {
  const bands = new Map<number, Set<number>>(); // homeId -> set of generation bands present
  for (const c of s.citizens) {
    if (c.homeId === null) continue;
    const band = c.age < ADULT_AGE ? 0 : c.age >= OLD_AGE_START ? 2 : 1;
    const set = bands.get(c.homeId) ?? new Set<number>();
    set.add(band);
    bands.set(c.homeId, set);
  }
  for (const set of bands.values()) if (set.size >= 3) return true;
  return false;
}

/** Every job slot in every finished workplace is filled, and there is real work to fill. */
function allJobsFilled(s: GameState): boolean {
  const { filled, total } = jobSlots(s);
  return total > 0 && filled >= total;
}

/** The trades whose staffing means the building is *making something*, not governing or selling. */
const PRODUCTION_TYPES: BuildingType[] = [
  'gatherer', 'farm', 'fishing', 'hunting', 'ranch', 'lumberyard', 'woodcutter',
  'quarry', 'mine', 'blacksmith', 'tailor', 'herbalist', 'luxury',
];
/** Every production trade has at least one finished, staffed building right now. */
function allProductionOperating(s: GameState): boolean {
  return PRODUCTION_TYPES.every((t) =>
    s.buildings.some((b) => b.type === t && b.built && !b.razed && b.workers.length > 0),
  );
}

/** No grown villager sitting idle: every adult works, builds, or is still at school. */
function allEmployedOrSchooled(s: GameState): boolean {
  if (s.citizens.length === 0) return false;
  return s.citizens.every((c) => isInfant(c) || isStudent(c) || c.jobId !== null || c.builder);
}

/** The goods a village makes for itself (trade-only gold/dye/silk and the raw livestock are out). */
const LOCAL_GOODS: ResourceKind[] = [
  'wood', 'firewood', 'stone', 'coal', 'iron', 'tools', 'leather', 'wool', 'clothing',
  'medicine', 'sand', 'glass', 'jewelry',
];
/** Has the village produced every local good, and food besides? */
function producedEveryLocal(s: GameState): boolean {
  return producedFood(s) > 0 && LOCAL_GOODS.every((k) => produced(s, k) > 0);
}

/** Has every buildable structure been finished at least once over the village's life? */
function builtEverything(s: GameState): boolean {
  return BUILD_ORDER.every((t) => st(s).builtTypes.includes(t));
}

// ---- the eighty ----
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'house1', title: 'Build your first house', tier: 'bronze', done: (s) => placedEver(s, 'house') },
  { id: 'pop10', title: 'Reach 10 population', tier: 'bronze', done: (s) => st(s).peakPop >= 10 },
  { id: 'pop25', title: 'Reach 25 population', tier: 'bronze', done: (s) => st(s).peakPop >= 25 },
  { id: 'pop50', title: 'Reach 50 population', tier: 'silver', done: (s) => st(s).peakPop >= 50 },
  { id: 'pop100', title: 'Reach 100 population', tier: 'silver', done: (s) => st(s).peakPop >= 100 },
  { id: 'pop150', title: 'Reach 150 population', tier: 'gold', done: (s) => st(s).peakPop >= 150 },
  { id: 'pop300', title: 'Reach 300 population', tier: 'platinum', done: (s) => st(s).peakPop >= 300 },
  { id: 'winter1', title: 'Survive your first winter', tier: 'bronze', done: (s) => st(s).wintersSurvived >= 1 },
  { id: 'winter5', title: 'Survive 5 winters', tier: 'bronze', done: (s) => st(s).wintersSurvived >= 5 },
  { id: 'winter10', title: 'Survive 10 winters', tier: 'silver', done: (s) => st(s).wintersSurvived >= 10 },
  { id: 'winter25', title: 'Survive 25 winters', tier: 'gold', done: (s) => st(s).wintersSurvived >= 25 },
  { id: 'winter50', title: 'Survive 50 winters', tier: 'platinum', done: (s) => st(s).wintersSurvived >= 50 },
  { id: 'food1k', title: 'Produce 1,000 food', tier: 'bronze', done: (s) => producedFood(s) >= 1000 },
  { id: 'foodstore5k', title: 'Store 5,000 food at once', tier: 'silver', done: (s) => st(s).peakFoodStored >= 5000 },
  { id: 'firewood1k', title: 'Produce 1,000 firewood', tier: 'bronze', done: (s) => produced(s, 'firewood') >= 1000 },
  { id: 'stone500', title: 'Produce 500 stone', tier: 'bronze', done: (s) => produced(s, 'stone') >= 500 },
  { id: 'iron500', title: 'Produce 500 iron', tier: 'silver', done: (s) => produced(s, 'iron') >= 500 },
  { id: 'tools500', title: 'Produce 500 tools', tier: 'silver', done: (s) => produced(s, 'tools') >= 500 },
  { id: 'clothing500', title: 'Produce 500 clothing', tier: 'silver', done: (s) => produced(s, 'clothing') >= 500 },
  { id: 'school1', title: 'Build your first school', tier: 'bronze', done: (s) => placedEver(s, 'school') },
  { id: 'educate25', title: 'Educate 25 citizens', tier: 'silver', done: (s) => st(s).educatedEver >= 25 },
  { id: 'educate100', title: 'Educate 100 citizens', tier: 'gold', done: (s) => st(s).educatedEver >= 100 },
  { id: 'quarry1', title: 'Build your first quarry', tier: 'bronze', done: (s) => placedEver(s, 'quarry') },
  { id: 'mine1', title: 'Build your first mine', tier: 'bronze', done: (s) => placedEver(s, 'mine') },
  { id: 'post1', title: 'Build your first trading post', tier: 'bronze', done: (s) => placedEver(s, 'trading') },
  { id: 'trade1', title: 'Complete your first trade', tier: 'bronze', done: (s) => st(s).tradesCompleted >= 1 },
  { id: 'trade25', title: 'Complete 25 trades', tier: 'silver', done: (s) => st(s).tradesCompleted >= 25 },
  { id: 'trade100', title: 'Complete 100 trades', tier: 'gold', done: (s) => st(s).tradesCompleted >= 100 },
  { id: 'workshop1', title: 'Build your first Luxury Workshop', tier: 'silver', done: (s) => placedEver(s, 'luxury') },
  { id: 'glass1', title: 'Produce your first Glass', tier: 'silver', done: (s) => produced(s, 'glass') >= 1 },
  { id: 'glass100', title: 'Produce 100 Glass', tier: 'gold', done: (s) => produced(s, 'glass') >= 100 },
  { id: 'jewel1', title: 'Produce your first Jewelry', tier: 'silver', done: (s) => produced(s, 'jewelry') >= 1 },
  { id: 'jewel100', title: 'Produce 100 Jewelry', tier: 'gold', done: (s) => produced(s, 'jewelry') >= 100 },
  { id: 'port1', title: 'Build your first Port', tier: 'gold', done: (s) => placedEver(s, 'port') },
  { id: 'ship1', title: 'Receive your first merchant ship', tier: 'bronze', done: (s) => st(s).merchantVisits >= 1 },
  { id: 'import1', title: 'Purchase your first trade-only resource', tier: 'silver', done: (s) => st(s).tradeOnlyImported >= 1 },
  { id: 'acquireGDS', title: 'Acquire Gold, Dye, and Silk', tier: 'gold', done: (s) => st(s).acquiredGold && st(s).acquiredDye && st(s).acquiredSilk },
  { id: 'university', title: 'Build a University', tier: 'gold', done: (s) => placedEver(s, 'university') },
  { id: 'cathedralBuild', title: 'Build a Cathedral', tier: 'gold', done: (s) => placedEver(s, 'cathedral') },
  { id: 'grandhouse', title: 'Build a Grand House', tier: 'silver', done: (s) => placedEver(s, 'grandhouse') },
  { id: 'monumentBuild', title: 'Build a Monument', tier: 'gold', done: (s) => placedEver(s, 'monument') },
  { id: 'town', title: 'Reach Town level', tier: 'silver', done: (s) => reached(s, 'town') },
  { id: 'city', title: 'Reach City level', tier: 'platinum', done: (s) => reached(s, 'city') },
  { id: 'food5yr', title: 'Positive food production for 5 consecutive years', tier: 'gold', done: (s) => st(s).foodPositiveYears >= 5 },
  { id: 'firewood5yr', title: 'Positive firewood production for 5 consecutive years', tier: 'gold', done: (s) => st(s).firewoodPositiveYears >= 5 },
  { id: 'allfour', title: 'Produce food, firewood, tools and clothing at once', tier: 'silver', done: (s) => st(s).allFourProduced },
  { id: 'educated50', title: 'Have 50 educated citizens alive at once', tier: 'gold', done: (s) => st(s).peakEducatedAlive >= 50 },
  { id: 'workers100', title: 'Have 100 citizens working simultaneously', tier: 'gold', done: (s) => st(s).peakWorkers >= 100 },
  { id: 'jobsfull', title: 'Have 100% of available jobs filled', tier: 'silver', done: allJobsFilled },
  { id: 'housed100', title: 'Have 100 citizens with a home', tier: 'gold', done: (s) => st(s).peakHoused >= 100 },
  { id: 'stone1k', title: 'Produce 1,000 stone', tier: 'silver', done: (s) => produced(s, 'stone') >= 1000 },
  { id: 'iron1k', title: 'Produce 1,000 iron', tier: 'gold', done: (s) => produced(s, 'iron') >= 1000 },
  { id: 'tools1k', title: 'Produce 1,000 tools', tier: 'gold', done: (s) => produced(s, 'tools') >= 1000 },
  { id: 'clothing1k', title: 'Produce 1,000 clothing', tier: 'gold', done: (s) => produced(s, 'clothing') >= 1000 },
  { id: 'cathedralDone', title: 'Complete a Cathedral', tier: 'gold', done: (s) => builtNow(s, 'cathedral') },
  { id: 'monumentDone', title: 'Complete a Monument', tier: 'gold', done: (s) => builtNow(s, 'monument') },
  { id: 'exportJewel100', title: 'Export 100 Jewelry', tier: 'gold', done: (s) => st(s).jewelryExported >= 100 },
  { id: 'exportLux500', title: 'Export 500 total luxury goods', tier: 'platinum', done: (s) => st(s).luxuryExported >= 500 },
  { id: 'import100', title: 'Import 100 total trade-only resources', tier: 'gold', done: (s) => st(s).tradeOnlyImported >= 100 },
  { id: 'portvalue10k', title: 'Move 10,000 trade value through your Port', tier: 'platinum', done: (s) => st(s).portTradeValue >= 10000 },
  { id: 'happy70', title: 'Reach 70% average happiness', tier: 'silver', done: (s) => st(s).peakHappiness >= 70 },
  { id: 'happy80', title: 'Reach 80% average happiness', tier: 'gold', done: (s) => st(s).peakHappiness >= 80 },
  { id: 'happy70_5yr', title: 'Hold 70%+ happiness for 5 consecutive years', tier: 'gold', done: (s) => st(s).happy70Years >= 5 },
  { id: 'cleanfood1', title: 'Survive a year without a food shortage', tier: 'bronze', done: (s) => st(s).cleanFoodYears >= 1 },
  { id: 'cleanfire1', title: 'Survive a year without a firewood shortage', tier: 'bronze', done: (s) => st(s).cleanFirewoodYears >= 1 },
  { id: 'noshort10', title: 'Survive 10 consecutive years without a shortage', tier: 'gold', done: (s) => st(s).noShortageYears >= 10 },
  { id: 'threegen', title: 'Three generations of a family living at once', tier: 'gold', done: threeGenerations },
  { id: 'families50', title: 'Have 50 families in your settlement', tier: 'silver', done: (s) => families(s) >= 50 },
  { id: 'families100', title: 'Have 100 families in your settlement', tier: 'gold', done: (s) => families(s) >= 100 },
  { id: 'year100', title: 'Survive 100 years', tier: 'platinum', done: (s) => s.year >= 100 },
  { id: 'buildall', title: 'Build every available building', tier: 'platinum', done: builtEverything },
  { id: 'produceall', title: 'Produce every locally available resource', tier: 'gold', done: producedEveryLocal },
  { id: 'tradeall', title: 'Trade for every trade-only resource', tier: 'gold', done: (s) => st(s).importedGold && st(s).importedDye && st(s).importedSilk },
  { id: 'prodall', title: 'Have every production building operating at once', tier: 'platinum', done: allProductionOperating },
  { id: 'allbusy', title: 'Have every citizen employed or in school', tier: 'gold', done: allEmployedOrSchooled },
  { id: 'city_happy', title: 'Reach City level with 70%+ happiness', tier: 'platinum', done: (s) => reached(s, 'city') && st(s).peakHappiness >= 70 },
  { id: 'city_nofood', title: 'Reach City level with no food shortage ever', tier: 'platinum', done: (s) => reached(s, 'city') && !st(s).everFoodShortage },
  { id: 'city_nofire', title: 'Reach City level with no firewood shortage ever', tier: 'platinum', done: (s) => reached(s, 'city') && !st(s).everFirewoodShortage },
  { id: 'pop500', title: 'Reach 500 population', tier: 'platinum', done: (s) => st(s).peakPop >= 500 },
  { id: 'city10yr', title: 'Play 10 years after reaching City level', tier: 'platinum', done: (s) => { const y = st(s).cityYear; return y !== null && s.year - y >= 10; } },
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

// ---- persistence: the global, permanent set of unlocked ids ----
const STORE_KEY = 'lv_achievements';

/** Load the unlocked-id set from localStorage. Never throws — a corrupt store reads as empty. */
export function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveUnlocked(set: Set<string>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...set]));
  } catch {
    /* storage full or blocked — the run still shows unlocks, they just will not persist */
  }
}

/**
 * Check every not-yet-earned achievement against the village, unlock the ones now met, persist the
 * set, and return the newly earned ones (in list order) so the caller can celebrate them.
 */
export function evaluateAchievements(s: GameState, unlocked: Set<string>): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) continue;
    let met = false;
    try {
      met = a.done(s);
    } catch {
      met = false; // a check must never take the game down with it
    }
    if (met) {
      unlocked.add(a.id);
      fresh.push(a);
    }
  }
  if (fresh.length > 0) saveUnlocked(unlocked);
  return fresh;
}

/** Test/debug helper: wipe the unlocked set. */
export function resetUnlocked(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}
