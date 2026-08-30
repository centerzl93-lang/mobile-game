/**
 * The platform-independent haptic abstraction — CLAUDE.md "Haptics Architecture". Gameplay never
 * calls `navigator.vibrate` directly; it (indirectly, via `emitAudio`) fires a semantic
 * `AudioEvent`, and this file's own subscription to `audioBus` decides whether that maps to a
 * `HapticEvent` and, if haptics are enabled and not on cooldown, plays a short pattern. See
 * CLAUDE.md "Haptics and Audio Should Be Separate" — this mapping is deliberately independent of
 * `AUDIO_ASSET_MAP`: a player can disable haptics without losing the matching sound, and the other
 * way around.
 */
import { audioBus, type AudioEvent, type HapticEvent } from './events';
import { hapticsEnabled } from './settings';

/**
 * Short, subtle vibration patterns (ms, on/off/on/off…) — CLAUDE.md: "Haptics should be subtle. Do
 * not add long or annoying vibration patterns." Also encodes the required intensity hierarchy
 * (strongest → weakest: Tier Advancement, Achievement, Warning, Building, Error) as more/longer
 * pulses — the Vibration API this backend targets has no separate amplitude control, so "stronger"
 * here means "a longer, busier pattern," per CLAUDE.md's "use sensible duration/pattern differences"
 * fallback. Every pattern still sums well under a quarter-second — see the sim-tests' "patterns are
 * short" and "intensity hierarchy" specs, which pin both properties down.
 */
const PATTERN: Record<HapticEvent, number[]> = {
  ERROR: [15],
  BUILDING: [25],
  WARNING: [15, 50, 15],
  ACHIEVEMENT: [15, 30, 15, 30, 25],
  TIER_ADVANCEMENT: [20, 35, 20, 35, 25, 35, 35],
};

/** Which semantic audio events also carry haptic feedback — a small, deliberately partial map (see
 *  CLAUDE.md's required set: Building/Error/Warning/Achievement/Tier advancement). Most events
 *  have no entry and simply never vibrate. Deliberately excludes `BUILDING_DAMAGED`/
 *  `BUILDING_REPAIRED` — those are the audio layer's *per-building* cue; the disaster that caused
 *  the damage already fired its own one-shot `WARNING` haptic (`FIRE_STARTED` et al. below), and
 *  turning every damaged building into its own buzz would mean one flood damaging four buildings
 *  bites four times (CLAUDE.md "Do not make every individual building damaged by a disaster
 *  trigger a vibration"). */
const HAPTIC_FOR_EVENT: Partial<Record<AudioEvent, HapticEvent>> = {
  BUILDING_PLACED: 'BUILDING',
  CONSTRUCTION_COMPLETED: 'BUILDING',
  INVALID_ACTION: 'ERROR',
  BUTTON_ERROR: 'ERROR',
  WARNING: 'WARNING',
  FIRE_STARTED: 'WARNING',
  FLOOD_STARTED: 'WARNING',
  FAMINE_STARTED: 'WARNING',
  SICKNESS_EVENT: 'WARNING',
  ACHIEVEMENT_EARNED: 'ACHIEVEMENT',
  TIER_ADVANCED: 'TIER_ADVANCEMENT',
};

/**
 * Minimum time between two triggers of the *same* `HapticEvent`, in ms — CLAUDE.md "Error Rate
 * Limiting" (mandatory): a player mashing a disabled action or an invalid placement spot must not
 * feel a vibration on every tap, and several achievements or disaster warnings landing in the same
 * tick (`checkAchievements` loops newly-earned achievements; `warnLowStocks` can cross several
 * stocks' thresholds in one sweep) must not become "buzz buzz buzz buzz."
 *
 * A plain last-fired timestamp per event — not `concurrency.ts`'s `ConcurrencyGate` — is the right
 * tool here: that machinery tracks *concurrent audio instances in flight*, each acquired and later
 * `release()`d when its buffer finishes playing. A vibration is a single fire-and-forget platform
 * call with no "finished playing" moment to release on, so the only thing worth gating is "how
 * recently did this fire" — a cooldown with no concurrency limit at all. This mirrors the audio
 * side's own per-event `cooldownMs` (`assets.ts`) as an independent policy, since a player can want
 * the sound but not the buzz (or the other way around) at the same cadence.
 */
const MIN_INTERVAL_MS: Record<HapticEvent, number> = {
  ERROR: 400,
  BUILDING: 200,
  WARNING: 1500,
  ACHIEVEMENT: 500,
  TIER_ADVANCEMENT: 3000,
};

export class HapticManager {
  private vibrate: (pattern: number[]) => boolean;
  private isEnabled: () => boolean;
  private now: () => number;
  private unsubscribe?: () => void;
  /** Last time (in `now()`'s units) each event actually fired — see `MIN_INTERVAL_MS`. Absent
   *  entries have never fired, so their first trigger always goes through. */
  private lastFiredAt = new Map<HapticEvent, number>();

  constructor(opts?: { vibrate?: (pattern: number[]) => boolean; isEnabled?: () => boolean; now?: () => number }) {
    this.vibrate =
      opts?.vibrate ??
      ((pattern) => {
        try {
          return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
            ? navigator.vibrate(pattern)
            : false; // unsupported environment (desktop browser, iOS Safari, Node) — gracefully do nothing
        } catch {
          return false;
        }
      });
    this.isEnabled = opts?.isEnabled ?? hapticsEnabled;
    this.now = opts?.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  /** Subscribe to the shared audio bus so a haptic fires from exactly the same semantic events
   *  audio does, without either system importing the other. */
  install(): void {
    this.unsubscribe?.();
    this.unsubscribe = audioBus.on((event) => {
      const haptic = HAPTIC_FOR_EVENT[event];
      if (haptic) this.trigger(haptic);
    });
  }

  uninstall(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /** Fire `event`'s pattern — unless haptics are off, or this exact event fired too recently
   *  (`MIN_INTERVAL_MS`). A rate-limited call is a silent no-op, same as a disabled/unsupported one
   *  — nothing for a caller to check or handle. */
  trigger(event: HapticEvent): void {
    if (!this.isEnabled()) return;
    const now = this.now();
    const last = this.lastFiredAt.get(event);
    if (last !== undefined && now - last < MIN_INTERVAL_MS[event]) return;
    this.lastFiredAt.set(event, now);
    this.vibrate(PATTERN[event]);
  }
}

/** The shared instance — see `manager.ts`'s `audioManager` for the equivalent convention. */
export const hapticManager = new HapticManager();
