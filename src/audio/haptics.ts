/**
 * The platform-independent haptic abstraction — CLAUDE.md "Haptics Architecture". Gameplay never
 * calls `navigator.vibrate` directly; it (indirectly, via `emitAudio`) fires a semantic
 * `AudioEvent`, and this file's own subscription to `audioBus` decides whether that maps to a
 * `HapticEvent` and, if haptics are enabled, plays a short pattern. See CLAUDE.md "Haptics and
 * Audio Should Be Separate" — this mapping is deliberately independent of `AUDIO_ASSET_MAP`: a
 * player can disable haptics without losing the matching sound, and the other way around.
 */
import { audioBus, type AudioEvent, type HapticEvent } from './events';
import { hapticsEnabled } from './settings';

/** Short, subtle vibration patterns (ms, on/off/on/off…) — CLAUDE.md: "Haptics should be subtle.
 *  Do not add long or annoying vibration patterns." */
const PATTERN: Record<HapticEvent, number[]> = {
  BUILDING: [15],
  ERROR: [20, 40, 20],
  WARNING: [15, 60, 15],
  ACHIEVEMENT: [10, 30, 10, 30, 20],
  TIER_ADVANCEMENT: [20, 40, 20, 40, 30],
};

/** Which semantic audio events also carry haptic feedback — a small, deliberately partial map (see
 *  CLAUDE.md's required set: Building/Error/Warning/Achievement/Tier advancement). Most events
 *  have no entry and simply never vibrate. */
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

export class HapticManager {
  private vibrate: (pattern: number[]) => boolean;
  private isEnabled: () => boolean;
  private unsubscribe?: () => void;

  constructor(opts?: { vibrate?: (pattern: number[]) => boolean; isEnabled?: () => boolean }) {
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

  trigger(event: HapticEvent): void {
    if (!this.isEnabled()) return;
    this.vibrate(PATTERN[event]);
  }
}

/** The shared instance — see `manager.ts`'s `audioManager` for the equivalent convention. */
export const hapticManager = new HapticManager();
