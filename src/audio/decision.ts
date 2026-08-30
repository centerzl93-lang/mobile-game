/**
 * The pure "should this play, and how loud" policy for one-shot sfx — deliberately factored out of
 * `manager.ts` so every rule in CLAUDE.md's "Sound Concurrency"/"Settings"/"Ambient" sections
 * (missing asset, muted category, master at zero, disaster weighting, distance falloff, per-event
 * and per-category throttling) is a plain function of data in, data out. No `AudioContext`, no
 * buffers, no timers — so it is exercised directly in `sim-tests/` without a browser, and the parts
 * of `AudioManager` that *do* need a browser (`manager.ts`) are reduced to "if `decidePlay` says
 * yes, load the buffer and start a source."
 */
import type { AudioEvent, AudioEventPayload } from './events';
import { AUDIO_ASSET_MAP, type AudioAssetDef, type AudioCategory } from './assets';
import { ConcurrencyGate } from './concurrency';
import { attenuationFor } from './spatial';

/** A plain snapshot of the current volume/mute state — `AudioManager` builds one from
 *  `AudioSettings` (`settings.ts`) each call; tests build one by hand. */
export interface AudioSettingsSnapshot {
  /** 0..10 */
  master: number;
  music: number;
  ambient: number;
  sfx: number;
  disasterWeight: number;
  muted: boolean;
}

export type PlayReason = 'ok' | 'no-asset' | 'muted' | 'throttled';

export interface PlayDecision {
  play: boolean;
  reason: PlayReason;
  def?: AudioAssetDef;
  /** Final linear gain (0..1) to apply to the source, already folding in master/category/disaster
   *  weighting and distance attenuation. Meaningless when `play` is false. */
  gain: number;
  /** The chosen file, when `play` is true. */
  variation?: string;
  /** Concurrency-gate keys this decision acquired — the caller must `gate.release()` each of these
   *  exactly once, whether or not playback actually starts (a failed buffer load still releases). */
  releaseKeys: string[];
}

/** Events whose volume is additionally scaled by the player's "disaster noises" slider — see
 *  `settings.ts`'s `DISASTER_KEY`. Kept as an explicit list rather than a `category`, since these
 *  are still ordinary `sfx`-bus events for every other purpose (muting sfx entirely still mutes
 *  them). */
const DISASTER_EVENTS = new Set<AudioEvent>(['WARNING', 'FIRE_STARTED', 'FLOOD_STARTED', 'FAMINE_STARTED', 'SICKNESS_EVENT']);

/** How many sounds from one *category* may be in flight at once, on top of each individual event's
 *  own `maxConcurrent` in `assets.ts` — see CLAUDE.md "Maximum simultaneous instances per sound
 *  category". Deliberately generous for `ambient` (several layers legitimately loop together) and
 *  tight for `music` (exactly one track, ever — a crossfade briefly overlaps two, hence 2 not 1). */
export const CATEGORY_MAX_CONCURRENT: Record<AudioCategory, number> = { music: 2, ambient: 8, sfx: 6 };

function busVolume(category: AudioCategory, settings: AudioSettingsSnapshot): number {
  if (category === 'music') return settings.music;
  if (category === 'ambient') return settings.ambient;
  return settings.sfx;
}

function defaultPickVariation(variations: string[]): string | undefined {
  if (variations.length === 0) return undefined;
  return variations[(Math.random() * variations.length) | 0];
}

/**
 * Decide whether `event` should play right now, and at what gain. Always books (and, on any
 * rejection, immediately releases) whatever concurrency slots it touched, so a caller never has to
 * special-case "did this acquire anything" — just release `releaseKeys` once playback ends (or at
 * once, if `play` is false).
 */
export function decidePlay(
  event: AudioEvent,
  payload: AudioEventPayload,
  settings: AudioSettingsSnapshot,
  gate: ConcurrencyGate,
  now: number,
  listener?: { x: number; y: number },
  assetMap: Record<AudioEvent, AudioAssetDef> = AUDIO_ASSET_MAP,
  pickVariation: (variations: string[]) => string | undefined = defaultPickVariation,
): PlayDecision {
  const def = assetMap[event];
  if (!def || def.variations.length === 0) return { play: false, reason: 'no-asset', gain: 0, def, releaseKeys: [] };
  if (settings.muted || settings.master <= 0) return { play: false, reason: 'muted', gain: 0, def, releaseKeys: [] };

  let gain = (payload.volume ?? 1) * (settings.master / 10) * (busVolume(def.category, settings) / 10);
  if (DISASTER_EVENTS.has(event)) gain *= settings.disasterWeight / 10;
  if (payload.x !== undefined && payload.y !== undefined) {
    gain *= attenuationFor({ x: payload.x, y: payload.y }, listener, SPATIAL_RADIUS_TILES);
  }
  if (gain <= 0) return { play: false, reason: 'muted', gain: 0, def, releaseKeys: [] };

  const eventKey = `evt:${event}`;
  if (!gate.tryAcquire(eventKey, now, { maxConcurrent: def.maxConcurrent ?? 4, cooldownMs: def.cooldownMs ?? 150 })) {
    return { play: false, reason: 'throttled', gain: 0, def, releaseKeys: [] };
  }
  const catKey = `cat:${def.category}`;
  if (!gate.tryAcquire(catKey, now, { maxConcurrent: CATEGORY_MAX_CONCURRENT[def.category], cooldownMs: 0 })) {
    gate.release(eventKey);
    return { play: false, reason: 'throttled', gain: 0, def, releaseKeys: [] };
  }

  return { play: true, reason: 'ok', def, gain, variation: pickVariation(def.variations), releaseKeys: [eventKey, catKey] };
}

/** Sfx beyond this many tiles from the listener are inaudible — see `spatial.ts`. A UI/village-wide
 *  event that carries no `x`/`y` skips attenuation entirely (see `decidePlay` above), so this only
 *  bounds the ones that opted into a world position. */
const SPATIAL_RADIUS_TILES = 24;
