/**
 * Aggregated production-activity intensity — CLAUDE.md "Looping Activity Sounds": "attach a
 * separate continuously-running audio source to every villager" is exactly what this avoids. There
 * is no stored per-citizen audio state anywhere; `computeActivityCounts` reads the count live off
 * `GameState` the same way `villageTier`/a citizen's role are computed live rather than cached (see
 * CLAUDE.md "Compute, don't store, derived facts"), and `AudioManager.updateActivity` calls it once
 * per UI-refresh tick from `main.ts` — never from inside `simulation.ts` itself, so this file adds
 * zero coupling to the tick pipeline.
 */
import type { GameState } from '../types';
import type { AudioEvent } from './events';

/** The four activities `events.ts` documents as ambient-loop-only, never one-shot. */
export type ProductionActivity = Extract<AudioEvent, 'MINING' | 'WOODCUTTING' | 'BLACKSMITH' | 'CONSTRUCTION'>;

/** Which workplace building type feeds which activity's intensity. Builders (no `jobId`, doing
 *  `build` work) are counted separately below rather than through this table, since "construction"
 *  isn't a building type a citizen has a `jobId` at. */
const ACTIVITY_BUILDING: Record<string, ProductionActivity> = {
  mine: 'MINING',
  woodcutter: 'WOODCUTTING',
  blacksmith: 'BLACKSMITH',
};

const EMPTY_COUNTS: Record<ProductionActivity, number> = { MINING: 0, WOODCUTTING: 0, BLACKSMITH: 0, CONSTRUCTION: 0 };

/** How many villagers are mid-cycle at each production activity right now. */
export function computeActivityCounts(s: GameState): Record<ProductionActivity, number> {
  const counts: Record<ProductionActivity, number> = { ...EMPTY_COUNTS };
  if (s.citizens.length === 0) return counts;
  const buildingType = new Map<number, string>();
  for (const b of s.buildings) buildingType.set(b.id, b.type);
  for (const c of s.citizens) {
    if (c.task.kind === 'build') {
      counts.CONSTRUCTION++;
      continue;
    }
    if (c.task.kind !== 'work' || c.jobId === null) continue;
    const activity = ACTIVITY_BUILDING[buildingType.get(c.jobId) ?? ''];
    if (activity) counts[activity]++;
  }
  return counts;
}

/** Saturating 0..1 intensity: `saturateAt` active workers (or more) is "as busy as this ever
 *  sounds" — a mine with two miners is quieter than one with eight, but neither scales forever. */
export function intensityFor(count: number, saturateAt = 6): number {
  if (saturateAt <= 0) return count > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, count / saturateAt));
}
