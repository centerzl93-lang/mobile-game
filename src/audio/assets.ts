/**
 * The event-to-asset mapping layer (CLAUDE.md "Event-to-Audio Mapping"). Gameplay code knows "a
 * merchant arrived" (`emitAudio('MERCHANT_ARRIVAL')`); this table is the only place in the codebase
 * that knows which files that means, how many can overlap, and how often it can retrigger. Phase 2
 * fills in `variations` — everything else about the architecture is already load-bearing without a
 * single audio file existing yet: `AudioManager.playSfx` treats an empty `variations` array as "no
 * asset for this event," which is exactly the "graceful missing-asset" behaviour CLAUDE.md asks
 * for, not a special case bolted on afterwards.
 *
 * Every `AudioEvent` gets a row (an exhaustive `Record`, same convention as `BUILDING_DEFS` in
 * `src/types.ts`) so adding a new event without registering it is a compile error, not a silent
 * gap — see CLAUDE.md "Table-driven and exhaustive."
 */
import type { AudioEvent } from './events';
import type { VillageTier } from '../game/tiers';

export type AudioCategory = 'music' | 'ambient' | 'sfx';

export interface AudioAssetDef {
  category: AudioCategory;
  /**
   * Candidate file paths, relative to the PWA base path (see `AUDIO_BASE_PATH`). One is picked at
   * random on each play — see CLAUDE.md "Support Variations" — so ten woodcutters finishing a
   * cycle in the same tick don't all sound identical. Empty until Phase 2 records real audio; an
   * empty array is the documented "not implemented yet" state, not an error.
   */
  variations: string[];
  /** True for a sustained loop (ambient layers, production activity) rather than a one-shot. */
  loop?: boolean;
  /** Simultaneous instances of *this event* allowed at once, on top of the shared per-category cap
   *  in `manager.ts`'s `CATEGORY_MAX_CONCURRENT` — see CLAUDE.md "Sound Concurrency". Default 4. */
  maxConcurrent?: number;
  /** Minimum time between two plays of this exact event, in ms — absorbs a burst into one audible
   *  hit instead of a stack. Default 150ms. */
  cooldownMs?: number;
  /** The semantic asset folder this event's files belong in — see CLAUDE.md "Audio Asset
   *  Architecture": organised by category (ui/buildings/merchants/achievements/events), not by the
   *  individual gameplay system that raises the event. Documentation only; `variations` above is
   *  what `AudioManager` actually loads from. */
  dir: 'music' | 'ambient' | 'buildings' | 'events' | 'merchants' | 'achievements' | 'ui';
}

/** Base path (relative to the app's `/mobile-game/` root) every asset path in this file is
 *  resolved against — mirrors `public/`'s existing convention for `models/`/`icons/`/`textures/`. */
export const AUDIO_BASE_PATH = 'audio/';

const sfx = (dir: AudioAssetDef['dir'], overrides: Partial<AudioAssetDef> = {}): AudioAssetDef => ({
  category: 'sfx',
  variations: [],
  dir,
  ...overrides,
});

const activityLoop = (): AudioAssetDef => ({
  category: 'ambient',
  variations: [],
  loop: true,
  dir: 'buildings',
});

export const AUDIO_ASSET_MAP: Record<AudioEvent, AudioAssetDef> = {
  // ---- UI / Interaction — short, frequent, low priority: tight cooldown, roomy concurrency.
  BUILDING_PLACED: sfx('ui', { maxConcurrent: 3, cooldownMs: 80 }),
  INVALID_ACTION: sfx('ui', { maxConcurrent: 2, cooldownMs: 200 }),
  BUTTON_CONFIRM: sfx('ui', { maxConcurrent: 3, cooldownMs: 80 }),
  BUTTON_ERROR: sfx('ui', { maxConcurrent: 2, cooldownMs: 200 }),

  // ---- Construction — one building finishes/breaks/mends at a time in practice; a small cooldown
  // still guards the (rare) case several sites complete the same tick.
  CONSTRUCTION_STARTED: sfx('buildings', { maxConcurrent: 3, cooldownMs: 300 }),
  CONSTRUCTION_COMPLETED: sfx('buildings', { maxConcurrent: 3, cooldownMs: 300 }),
  BUILDING_DAMAGED: sfx('buildings', { maxConcurrent: 3, cooldownMs: 300 }),
  BUILDING_REPAIRED: sfx('buildings', { maxConcurrent: 3, cooldownMs: 300 }),

  // ---- Production activity loops — see `events.ts`'s note: never one-shot, always driven by
  // `activity.ts`'s live worker counts through `AudioManager.setAmbientIntensity`.
  MINING: activityLoop(),
  WOODCUTTING: activityLoop(),
  BLACKSMITH: activityLoop(),
  CONSTRUCTION: activityLoop(),

  // ---- Disasters — rare, important, deliberately allowed to overlap a little (a fire *and* a
  // sickness can both be true) but still cooled down against retriggering mid-event.
  WARNING: sfx('events', { maxConcurrent: 2, cooldownMs: 2000 }),
  FIRE_STARTED: sfx('events', { maxConcurrent: 2, cooldownMs: 500 }),
  FLOOD_STARTED: sfx('events', { maxConcurrent: 1, cooldownMs: 2000 }),
  FAMINE_STARTED: sfx('events', { maxConcurrent: 1, cooldownMs: 2000 }),
  SICKNESS_EVENT: sfx('events', { maxConcurrent: 1, cooldownMs: 2000 }),

  // ---- Trading
  MERCHANT_BOAT: sfx('merchants', { maxConcurrent: 2, cooldownMs: 1000 }),
  MERCHANT_BELL: sfx('merchants', { maxConcurrent: 2, cooldownMs: 1000 }),
  MERCHANT_ARRIVAL: sfx('merchants', { maxConcurrent: 2, cooldownMs: 1000 }),
  TRADE_COMPLETED: sfx('merchants', { maxConcurrent: 3, cooldownMs: 150 }),

  // ---- Progression — rare and always worth hearing in full.
  TIER_ADVANCED: sfx('events', { maxConcurrent: 1, cooldownMs: 1000 }),
  ACHIEVEMENT_EARNED: sfx('achievements', { maxConcurrent: 4, cooldownMs: 50 }),
};

/**
 * Progression-tier background music (CLAUDE.md "Music Architecture"). Keyed by `VillageTier`
 * rather than `AudioEvent`: the music system doesn't react to a one-shot occurrence, it tracks
 * "what tier is the village at right now" — see `AudioManager.playMusicForTier`, which is a no-op
 * when the tier hasn't actually changed so `endSeason`/the UI-refresh loop can call it every tick
 * without restarting the track.
 */
export const MUSIC_TRACKS: Record<VillageTier, AudioAssetDef> = {
  settlement: { category: 'music', variations: [], loop: true, dir: 'music' },
  hamlet: { category: 'music', variations: [], loop: true, dir: 'music' },
  village: { category: 'music', variations: [], loop: true, dir: 'music' },
  town: { category: 'music', variations: [], loop: true, dir: 'music' },
  city: { category: 'music', variations: [], loop: true, dir: 'music' },
};

/** Layered environmental ambience (CLAUDE.md "Ambient Audio Architecture") — independent of the
 *  production-activity loops above and of each other; several can play at once
 *  (`AudioManager.setAmbientIntensity` per layer). Not driven by anything yet in Phase 1 — see the
 *  implementation report's "Remaining Work" for how each would eventually be fed (e.g. `water`
 *  scaled by proximity to the river, `wind`/`birds` always on at a low level, `village` scaled by
 *  population). */
export type AmbientLayer = 'water' | 'wind' | 'forest' | 'birds' | 'village';

export const AMBIENT_LAYER_DEFS: Record<AmbientLayer, AudioAssetDef> = {
  water: { category: 'ambient', variations: [], loop: true, dir: 'ambient' },
  wind: { category: 'ambient', variations: [], loop: true, dir: 'ambient' },
  forest: { category: 'ambient', variations: [], loop: true, dir: 'ambient' },
  birds: { category: 'ambient', variations: [], loop: true, dir: 'ambient' },
  village: { category: 'ambient', variations: [], loop: true, dir: 'ambient' },
};
