/**
 * Building & activity sound effects — the aggregated, intermittent counterpart to a one-shot event
 * like `FIRE_STARTED`. CLAUDE.md "Looping Activity Sounds" ruled out "a separate continuously-
 * running audio source per villager"; this module also rules out the continuous-loop-at-variable-
 * volume design an earlier pass of this file tried (`activityLoop`/`setLoopIntensity` in
 * `manager.ts`'s history) — the actual requirement is intermittent work sounds (an axe blow, a
 * pause, another axe blow), not a bed that fades in and out. So this file does two jobs:
 *
 *   1. `computeActivitySnapshots` reads *live* `GameState` for "is this activity actually
 *      happening, where, and how much of it" — no stored per-citizen or per-building audio state,
 *      the same "compute, don't store, derived facts" rule the rest of the sim follows.
 *   2. `ActivitySoundScheduler` turns that snapshot into occasional, jittered, non-synchronized
 *      one-shot triggers — `AudioManager.updateActivity` just plays whatever it returns through the
 *      ordinary `playSfx` path (`decidePlay`/`ConcurrencyGate` already give each event its own
 *      cooldown, concurrency cap and distance attenuation; see `assets.ts`).
 *
 * Both halves are pure (`GameState`/a snapshot in, data out) and know nothing about `AudioContext`
 * — see CLAUDE.md "Unity migration architecture": a C# port reuses this file verbatim and only
 * swaps what `AudioManager` does with its output.
 */
import { isWorkplaceProducing } from '../game/simulation';
import { workCentre } from '../types';
import type { GameState } from '../types';
import type { AudioEvent } from './events';

/** The four building/activity sounds this module drives. */
export type ProductionActivity = Extract<AudioEvent, 'MINING' | 'WOODCUTTING' | 'BLACKSMITH' | 'CONSTRUCTION'>;

export const PRODUCTION_ACTIVITIES: readonly ProductionActivity[] = ['MINING', 'WOODCUTTING', 'BLACKSMITH', 'CONSTRUCTION'];

/** Which workplace building type(s) feed which activity — construction has no building type of its
 *  own (see below), so it isn't in this table. Woodcutting has two: a `lumberyard`'s foresters
 *  fell trees for wood out in their work circle (`CIRCLE_WORK`), and a `woodcutter` splits that
 *  stockpiled wood into firewood indoors (`BUILDING_DEFS.woodcutter`'s own description) — different
 *  buildings, same axe-on-wood sound, so both feed one activity's aggregate count/sources. */
const ACTIVITY_BUILDING: Partial<Record<string, ProductionActivity>> = {
  mine: 'MINING',
  lumberyard: 'WOODCUTTING',
  woodcutter: 'WOODCUTTING',
  blacksmith: 'BLACKSMITH',
};

/** One active source of an activity right now — a specific building (or construction site), where
 *  it is, and how many hands are on it. Lets the scheduler pick *which* mine rang out, not just
 *  "the mine sound" from nowhere. */
export interface ActivitySource {
  id: number;
  x: number;
  y: number;
  workers: number;
}

export interface ActivitySnapshot {
  /** Total active workers across every source — feeds `intensityFor`. */
  count: number;
  sources: ActivitySource[];
}

const emptySnapshot = (): ActivitySnapshot => ({ count: 0, sources: [] });

/**
 * Live activity sources for all four sounds, one pass over buildings + citizens.
 *
 * Mining/Woodcutting/Blacksmith: a building only counts while it is actually **producing** —
 * `isWorkplaceProducing` is the same Working/At-limit/Not-staffed distinction the inspect sheet
 * shows the player (`workplaceStatus`), not a re-derivation of "working" from scratch. A staffed
 * mine sitting at its stockpile cap, or one nobody is assigned to, contributes nothing here, same
 * as the sheet already tells the player it isn't producing right now.
 *
 * Construction: there is no "construction" building type to look up — instead every builder
 * currently committed to a site (`Citizen.buildSite`, set by `runBuilder`/`pickSite` for as long as
 * the commitment holds, construction/repair/demolition alike) is grouped by that site, so a site
 * with builders actually assigned to it sounds different from a site sitting untouched.
 */
export function computeActivitySnapshots(s: GameState): Record<ProductionActivity, ActivitySnapshot> {
  const result: Record<ProductionActivity, ActivitySnapshot> = {
    MINING: emptySnapshot(),
    WOODCUTTING: emptySnapshot(),
    BLACKSMITH: emptySnapshot(),
    CONSTRUCTION: emptySnapshot(),
  };

  for (const b of s.buildings) {
    const activity = ACTIVITY_BUILDING[b.type];
    if (!activity || !b.built || b.workers.length === 0) continue;
    if (!isWorkplaceProducing(s, b)) continue;
    const pos = workCentre(b);
    result[activity].sources.push({ id: b.id, x: pos.x, y: pos.y, workers: b.workers.length });
    result[activity].count += b.workers.length;
  }

  const crewBySite = new Map<number, number>();
  for (const c of s.citizens) {
    if (!c.builder || c.buildSite == null) continue;
    crewBySite.set(c.buildSite, (crewBySite.get(c.buildSite) ?? 0) + 1);
  }
  if (crewBySite.size > 0) {
    const byId = new Map(s.buildings.map((b) => [b.id, b] as const));
    for (const [siteId, workers] of crewBySite) {
      const site = byId.get(siteId);
      if (!site) continue; // finished/cancelled/razed the same tick a builder's commitment lapsed
      const pos = workCentre(site);
      result.CONSTRUCTION.sources.push({ id: site.id, x: pos.x, y: pos.y, workers });
      result.CONSTRUCTION.count += workers;
    }
  }

  return result;
}

/** Just the totals, for callers that only want "how busy" — kept alongside the richer snapshot
 *  above since it's a strict subset (and is what the existing sim-tests exercise directly). */
export function computeActivityCounts(s: GameState): Record<ProductionActivity, number> {
  const snapshots = computeActivitySnapshots(s);
  return {
    MINING: snapshots.MINING.count,
    WOODCUTTING: snapshots.WOODCUTTING.count,
    BLACKSMITH: snapshots.BLACKSMITH.count,
    CONSTRUCTION: snapshots.CONSTRUCTION.count,
  };
}

/** Saturating 0..1 intensity: `saturateAt` active workers (or more) is "as busy as this ever
 *  sounds" — a mine with two miners is quieter than one with eight, but neither scales forever. */
export function intensityFor(count: number, saturateAt = 6): number {
  if (saturateAt <= 0) return count > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, count / saturateAt));
}

/** How many active workers before an activity is "as busy as it ever sounds" — past this the
 *  trigger interval stops shrinking (diminishing returns, CLAUDE.md "Activity Intensity"). Tuned
 *  per activity: a blacksmith bench only ever seats a couple of hands, so it saturates fast; a big
 *  mine or forestry crew can run much larger before the sound stops getting busier. */
const SATURATE_AT: Record<ProductionActivity, number> = {
  MINING: 8,
  WOODCUTTING: 10,
  BLACKSMITH: 4,
  CONSTRUCTION: 6,
};

/** The trigger interval at zero/near-zero activity (quiet, occasional work) and at full saturation
 *  (as frequent as this activity is ever allowed to sound) — CLAUDE.md "1 miner → occasional quiet
 *  sound, 15 miners → noticeably active mine, but not unbearable." Blacksmith and construction sit
 *  higher-priority/more-distinctive per CLAUDE.md's hierarchy: blacksmith stays sparser even at
 *  full crew so its hammer stays a distinct event rather than background noise; construction is
 *  intentionally a bit busier so a big project reads as a hive of activity. */
const BASE_INTERVAL_MS: Record<ProductionActivity, number> = {
  MINING: 7000,
  WOODCUTTING: 6500,
  BLACKSMITH: 9000,
  CONSTRUCTION: 6000,
};
const MIN_INTERVAL_MS: Record<ProductionActivity, number> = {
  MINING: 2200,
  WOODCUTTING: 1800,
  BLACKSMITH: 3200,
  CONSTRUCTION: 1800,
};

/** +/- spread applied to every scheduled interval so several activities (or repeated triggers of
 *  the same one) never lock into a metronome — CLAUDE.md "Do not synchronize all woodcutters." */
const JITTER_FRACTION = 0.35;

function intervalFor(activity: ProductionActivity, activeWorkers: number): number {
  const t = intensityFor(activeWorkers, SATURATE_AT[activity]);
  const base = BASE_INTERVAL_MS[activity];
  const min = MIN_INTERVAL_MS[activity];
  return base - t * (base - min);
}

/** Pick one active source to "be" the sound that plays, weighted by crew size so a bustling mine is
 *  a bit more likely to be heard from than a one-miner seam beside it, without ever guaranteeing
 *  it — every source gets a chance. Returns `undefined` only when there are no sources at all
 *  (shouldn't happen when the caller already checked `count > 0`, but stays honest about the type). */
function pickSource(sources: ActivitySource[], rand: () => number): ActivitySource | undefined {
  if (sources.length === 0) return undefined;
  if (sources.length === 1) return sources[0];
  const total = sources.reduce((sum, src) => sum + src.workers, 0);
  if (total <= 0) return sources[(rand() * sources.length) | 0];
  let r = rand() * total;
  for (const src of sources) {
    r -= src.workers;
    if (r <= 0) return src;
  }
  return sources[sources.length - 1];
}

/** One activity sound due to play, and where — `x`/`y` are omitted only if somehow no source could
 *  be picked (the event still plays, just without positional attenuation). */
export interface ActivityTrigger {
  activity: ProductionActivity;
  x?: number;
  y?: number;
}

/**
 * Schedules intermittent, non-synchronized activity sounds from live worker counts.
 *
 * Deliberately not "every tick, if active, maybe play" (that couples the sound's rhythm to
 * simulation/UI-refresh frequency, which CLAUDE.md's Sound Event Scheduling section rules out) —
 * instead each activity books its own next-due time and only fires once that time is reached,
 * independent of how often `poll` itself is called. Pure aside from that one piece of state (the
 * next-due clock per activity), and takes an injectable `rand` the same way `pickMusicVariation`
 * does, so tests are deterministic without touching `Math.random`.
 */
export class ActivitySoundScheduler {
  private dueAt = new Map<ProductionActivity, number>();

  constructor(private rand: () => number = Math.random) {}

  /** Call on any cadence (`AudioManager.updateActivity` uses the 100ms UI-refresh tick); returns
   *  the activities that are due to sound right now, each with a chosen source position. */
  poll(snapshots: Record<ProductionActivity, ActivitySnapshot>, now: number): ActivityTrigger[] {
    const fires: ActivityTrigger[] = [];
    for (const activity of PRODUCTION_ACTIVITIES) {
      const snap = snapshots[activity];
      if (snap.count === 0) {
        // Work stopped (unstaffed, capped out, site finished/abandoned) — forget the schedule so
        // it fires promptly, not after a stale delay, the moment work resumes rather than making
        // the player wait out whatever interval was left over from before it went quiet.
        this.dueAt.delete(activity);
        continue;
      }
      let due = this.dueAt.get(activity);
      if (due === undefined) {
        due = now + this.jittered(intervalFor(activity, snap.count));
        this.dueAt.set(activity, due);
      }
      if (now >= due) {
        const source = pickSource(snap.sources, this.rand);
        fires.push({ activity, x: source?.x, y: source?.y });
        this.dueAt.set(activity, now + this.jittered(intervalFor(activity, snap.count)));
      }
    }
    return fires;
  }

  private jittered(ms: number): number {
    return ms * (1 - JITTER_FRACTION + this.rand() * JITTER_FRACTION * 2);
  }
}

/** Per-activity saturation point, exported so `AudioManager` can report a plain 0..1 "how busy is
 *  this activity right now" figure (`ambientIntensity`) using the exact same curve the scheduler
 *  itself paces off, rather than a second guess at what "saturated" means. */
export { SATURATE_AT as ACTIVITY_SATURATION };
