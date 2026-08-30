/**
 * The semantic audio/haptic event vocabulary — the one thing gameplay code (`src/game/*.ts`,
 * `src/main.ts`) is allowed to know about the audio system. Nothing in this file touches
 * `AudioContext`, `THREE.*`, `<audio>`, or `navigator.vibrate` — it is pure data plus a tiny
 * pub/sub emitter, so `src/game/simulation.ts` can raise `FIRE_STARTED` the same way it already
 * calls `log(...)`, without ever importing the Web Audio backend that actually plays a sound.
 *
 *     Simulation ──emit──▶ AudioEvent ──▶ AudioManager (src/audio/manager.ts)
 *                                     └──▶ HapticManager (src/audio/haptics.ts)
 *
 * See CLAUDE.md "Unity migration architecture" — this module is Category A/B: the event names and
 * the emitter are the portable contract; only the two subscribers on the far end are Web-Audio-
 * specific and get swapped for a Unity backend wholesale.
 *
 * Every identifier below corresponds to a real moment in the game as it stands today, or to a
 * system this file's own module doc names as coming soon (the four `ProductionActivity` ids —
 * see `activity.ts`). Nothing here is invented for a system that doesn't exist. Not every event is
 * wired to a call site yet in Phase 1 (see CLAUDE.md/PHASE1 report's "Remaining Work") — the union
 * being exhaustive in `assets.ts` is what stops one from being silently forgotten later.
 */

/** UI/interaction, construction, disaster, trading and progression moments — see the module doc.
 *  `MINING`/`WOODCUTTING`/`BLACKSMITH`/`CONSTRUCTION` are the exception: those four are never
 *  `emit`-ted through the bus below. `AudioManager.updateActivity` reads `activity.ts`'s live
 *  worker counts each tick and plays each one as an ordinary intermittent one-shot through
 *  `playSfx` on its own schedule (`ActivitySoundScheduler`) — not pushed onto the bus by gameplay,
 *  and not a continuous loop either; see CLAUDE.md "Building & Activity Sound Effects". `BIRD_CALL`
 *  is a second exception in the same spirit: it's a one-shot, but nothing in gameplay ever `emit`s
 *  it either — `AudioManager.updateEnvironment` fires it itself on a randomized schedule
 *  (`birds.ts`), reusing the ordinary one-shot playback path so bird calls get muting/volume/
 *  missing-asset handling for free. All of these stay in this union so `assets.ts`'s asset table is
 *  one single exhaustive `Record<AudioEvent, …>`, not several parallel tables. */
export type AudioEvent =
  // UI / Interaction
  | 'BUILDING_PLACED'
  | 'INVALID_ACTION'
  | 'BUTTON_CONFIRM'
  | 'BUTTON_ERROR'
  // Construction
  | 'CONSTRUCTION_STARTED'
  | 'CONSTRUCTION_COMPLETED'
  | 'BUILDING_DAMAGED'
  | 'BUILDING_REPAIRED'
  // Production activity loops — see the doc note above
  | 'MINING'
  | 'WOODCUTTING'
  | 'BLACKSMITH'
  | 'CONSTRUCTION'
  // Ambient — self-scheduled, see the doc note above
  | 'BIRD_CALL'
  // Disasters
  | 'WARNING'
  | 'FIRE_STARTED'
  | 'FLOOD_STARTED'
  | 'FAMINE_STARTED'
  | 'SICKNESS_EVENT'
  // Trading
  | 'MERCHANT_BOAT'
  | 'MERCHANT_BELL'
  | 'MERCHANT_ARRIVAL'
  | 'TRADE_COMPLETED'
  // Progression
  | 'TIER_ADVANCED'
  | 'ACHIEVEMENT_EARNED';

/**
 * The haptics vocabulary is deliberately smaller than `AudioEvent` and lives on its own — see
 * CLAUDE.md "Haptics and Audio Should Be Separate". `haptics.ts` maps a handful of `AudioEvent`s
 * onto these, but a player can turn haptics off without losing the matching sound, or the other
 * way around: neither system's mapping table refers to the other's asset/pattern.
 */
export type HapticEvent = 'BUILDING' | 'ERROR' | 'WARNING' | 'ACHIEVEMENT' | 'TIER_ADVANCEMENT';

/**
 * Optional context an emitter can attach. `x`/`y` are tile-space world coordinates (the same units
 * `Building.x`/`Citizen.x` already use) for the distance-attenuation interface in `spatial.ts` —
 * see CLAUDE.md "Distance / Spatial Audio Architecture". `volume` is a 0..1 multiplier on top of
 * whatever the event's own category volume resolves to, for the rare case an emitter has its own
 * opinion (e.g. a bigger fire burning louder than a small one) — most emitters omit it.
 */
export interface AudioEventPayload {
  x?: number;
  y?: number;
  volume?: number;
}

type AudioEventListener = (event: AudioEvent, payload: AudioEventPayload) => void;

/**
 * A minimal synchronous pub/sub bus — the "Game Event" box in the module-doc diagram. Kept this
 * small on purpose: CLAUDE.md's "Rules for modifying existing systems" says use an existing event
 * bus rather than build a second one, and the closest thing this codebase already has is the
 * `LogFn` chronicle callback threaded through `update()`. That callback narrates *messages* for
 * the player (`recordEvent`/the History panel) — it is not typed for "which of 21 semantic things
 * just happened", and widening it would mean every one of `simulation.ts`'s ~40 `log`-taking
 * functions grows a second parameter whether or not it ever fires an audio event. A dedicated bus
 * with its own small, purpose-built emitter is the smaller, more honest diff.
 */
export class AudioEventBus {
  private listeners = new Set<AudioEventListener>();

  /** Subscribe; returns an unsubscribe function. */
  on(fn: AudioEventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  off(fn: AudioEventListener): void {
    this.listeners.delete(fn);
  }

  /** Never throws outward — a broken subscriber (a bug in the audio backend) must not break the
   *  simulation or UI code that raised the event. See CLAUDE.md "Audio failures must never break
   *  the simulation." */
  emit(event: AudioEvent, payload: AudioEventPayload = {}): void {
    for (const fn of this.listeners) {
      try {
        fn(event, payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[audio] listener for ${event} threw`, err);
      }
    }
  }
}

/** The one shared instance. Gameplay imports `emitAudio`; the audio/haptic backends subscribe to
 *  `audioBus` directly (`manager.ts`/`haptics.ts` `install()`). */
export const audioBus = new AudioEventBus();

export const emitAudio = (event: AudioEvent, payload?: AudioEventPayload): void => audioBus.emit(event, payload);
