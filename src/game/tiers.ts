/**
 * How far along a village is, and what that lets it build.
 *
 * A village passes through four tiers. Each one asks for a population, for certain trades to be
 * standing, and — at the top — for a body of schooled adults; each one opens a block of buildings
 * and roadworks. The point is pacing: a founding settlement should not be able to lay out a market
 * square, and the way to a Town Hall should run through a blacksmith and a tailor.
 *
 * The tier is *computed from the village as it stands*, never stored and never ratcheted. Lose the
 * population or let the blacksmith burn down and the tier goes with it, along with the right to
 * put up anything it opened. What is already built stays built — a tier gates what you may raise
 * next, not what you have.
 */

import { BUILD_ORDER, BUILDING_DEFS, BuildingType, GameState, isAdult } from '../types';
import type { PathTier } from './paths';

export type VillageTier = 'settlement' | 'hamlet' | 'village' | 'town';

/** Lowest to highest. Index into this is what "higher tier" means everywhere below. */
export const TIERS: VillageTier[] = ['settlement', 'hamlet', 'village', 'town'];

export interface TierReq {
  name: string;
  emoji: string;
  /** Villagers the settlement must hold. */
  pop: number;
  /** Trades that must be standing and finished. */
  needs: BuildingType[];
  /** Grown villagers who have been through school. */
  educated?: number;
}

export const TIER_META: Record<VillageTier, TierReq> = {
  settlement: { name: 'Settlement', emoji: '🏕️', pop: 0, needs: [] },
  hamlet: { name: 'Hamlet', emoji: '🏘️', pop: 20, needs: ['woodcutter'] },
  village: { name: 'Village', emoji: '🏞️', pop: 50, needs: ['blacksmith', 'tailor'] },
  town: { name: 'Town', emoji: '🏙️', pop: 100, needs: ['townhall', 'trading'], educated: 40 },
};

/**
 * The tier each building becomes available at.
 *
 * Exhaustive on purpose — `Record<BuildingType, …>` means a new building cannot be added without
 * deciding when the village earns it, which is exactly the decision that would otherwise be
 * forgotten until a player found a cathedral in a founding camp.
 */
export const BUILDING_TIER: Record<BuildingType, VillageTier> = {
  // Settlement: what a band of newcomers can put up with axes and their hands.
  house: 'settlement',
  barn: 'settlement',
  woodcutter: 'settlement',
  lumberyard: 'settlement',
  gatherer: 'settlement',
  hunting: 'settlement',
  fishing: 'settlement',
  herbalist: 'settlement',
  well: 'settlement',
  // Hamlet: stone and metal — quarrying, mining, and the trades that work what they bring back.
  quarry: 'hamlet',
  mine: 'hamlet',
  blacksmith: 'hamlet',
  tailor: 'hamlet',
  stonehouse: 'hamlet',
  shelter: 'hamlet',
  cemetery: 'hamlet',
  // Village: the institutions. Somewhere to govern, worship, heal, learn, trade and drink, and
  // the farmland that feeds a place too big to forage.
  townhall: 'village',
  chapel: 'village',
  hospital: 'village',
  school: 'village',
  market: 'village',
  tavern: 'village',
  trading: 'village',
  ranch: 'village',
  farm: 'village',
  // Town: what a place stops being a village to build. Learning past school, deep water, houses
  // for people with money, a church for thousands, fine goods, and stone raised for pride alone.
  university: 'town',
  port: 'town',
  grandhouse: 'town',
  cathedral: 'town',
  luxury: 'town',
  monument: 'town',
};

/** The tier each kind of roadway becomes available at. */
export const PATH_TIER_AT: Record<PathTier, VillageTier> = {
  dirt: 'settlement',
  bridge: 'settlement',
  stone: 'hamlet',
  stonebridge: 'hamlet',
  tunnel: 'hamlet',
};

/** Grown villagers who have been to school — the Town tier's own requirement. */
export function educatedAdults(s: GameState): number {
  let n = 0;
  for (const c of s.citizens) if (isAdult(c) && c.educated) n++;
  return n;
}

/** Does the village, as it stands right now, meet this tier's requirements? */
export function meetsTier(s: GameState, tier: VillageTier): boolean {
  const req = TIER_META[tier];
  if (s.citizens.length < req.pop) return false;
  if (req.educated !== undefined && educatedAdults(s) < req.educated) return false;
  for (const type of req.needs) {
    // Standing and finished. A building marked for demolition still counts: it is still there and
    // still working, and the order can be called off.
    if (!s.buildings.some((b) => b.built && !b.razed && b.type === type)) return false;
  }
  return true;
}

/**
 * Test hook: force the tier, the way `pinRandom` forces the die.
 *
 * Progression is the one rule that stands between a fresh village and most of the building list,
 * so a test about *anything else* needs a way past it.
 */
let pinned: VillageTier | null = null;
export function pinTier(t: VillageTier | null): void {
  pinned = t;
}

/** What the village counts as right now. */
export function villageTier(s: GameState): VillageTier {
  if (pinned) return pinned;
  let best: VillageTier = 'settlement';
  // Requirements accumulate: a village cannot skip a rung it does not meet, even if it somehow
  // satisfies the one above.
  for (const t of TIERS) {
    if (t === 'settlement' || meetsTier(s, t)) best = t;
    else break;
  }
  return best;
}

/** Is `tier` at least as far along as `need`? */
export function tierReaches(tier: VillageTier, need: VillageTier): boolean {
  return TIERS.indexOf(tier) >= TIERS.indexOf(need);
}

/** May the village put this building up yet? */
export function buildingUnlocked(s: GameState, type: BuildingType): boolean {
  return tierReaches(villageTier(s), BUILDING_TIER[type]);
}

/** May the village lay this kind of road yet? */
export function pathUnlocked(s: GameState, tier: PathTier): boolean {
  return tierReaches(villageTier(s), PATH_TIER_AT[tier]);
}

/** The next tier up, or null at the top. */
export function nextTier(tier: VillageTier): VillageTier | null {
  const i = TIERS.indexOf(tier);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

/**
 * The buildings a tier opens, in build-menu order.
 *
 * Derived from `BUILDING_TIER` rather than listed again, so the panel that tells the player what a
 * tier is worth cannot drift from the gate that actually enforces it.
 */
export function buildingsAt(tier: VillageTier): BuildingType[] {
  return BUILD_ORDER.filter((t) => BUILDING_TIER[t] === tier);
}

/** The roadworks a tier opens. */
export function pathsAt(tier: VillageTier): PathTier[] {
  return (Object.keys(PATH_TIER_AT) as PathTier[]).filter((t) => PATH_TIER_AT[t] === tier);
}

/** One line of a tier's requirements, and whether the village meets it. */
export interface TierCheck {
  label: string;
  /** Where the village stands against it — "62 / 50". Empty for a plain yes-or-no. */
  detail: string;
  met: boolean;
}

/**
 * A tier's requirements, spelled out against the village as it stands.
 *
 * The counterpart to `meetsTier`: same rules, but showing its working, so the player can see which
 * line is the one holding them back rather than being told only that they are not there yet.
 */
export function tierChecks(s: GameState, tier: VillageTier): TierCheck[] {
  const req = TIER_META[tier];
  const out: TierCheck[] = [];
  if (req.pop > 0) {
    out.push({
      label: 'Villagers',
      detail: `${s.citizens.length} / ${req.pop}`,
      met: s.citizens.length >= req.pop,
    });
  }
  if (req.educated !== undefined) {
    const n = educatedAdults(s);
    out.push({ label: 'Schooled adults', detail: `${n} / ${req.educated}`, met: n >= req.educated });
  }
  for (const type of req.needs) {
    out.push({
      label: BUILDING_DEFS[type].name,
      detail: '',
      met: s.buildings.some((b) => b.built && !b.razed && b.type === type),
    });
  }
  return out;
}
