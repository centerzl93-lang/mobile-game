/**
 * The Web Audio backend — CLAUDE.md "Create a Central Audio System". This is the one file in
 * `src/audio/` that is genuinely Category D (CLAUDE.md "Unity migration architecture": web-
 * specific, needs a native replacement) — everything it depends on (`events.ts`, `assets.ts`,
 * `decision.ts`, `concurrency.ts`, `activity.ts`) is portable, so a Unity port replaces only this
 * file (and `haptics.ts`) behind the same public surface.
 *
 * Nothing here is ever allowed to throw out to a caller: a missing `AudioContext` (Node, an old
 * browser), a blocked autoplay policy, a 404'd asset, or a decode failure all degrade to "nothing
 * is heard" — never a crashed frame loop. See CLAUDE.md "Audio failures must never break the
 * simulation" and "The game must remain fully playable without audio."
 */
import { audioBus, type AudioEvent, type AudioEventPayload } from './events';
import { AUDIO_ASSET_MAP, MUSIC_TRACKS, AMBIENT_LAYER_DEFS, AUDIO_BASE_PATH, type AudioAssetDef, type AudioCategory, type AmbientLayer } from './assets';
import { ConcurrencyGate } from './concurrency';
import { decidePlay } from './decision';
import { loadAudioSettings, type AudioSettings } from './settings';
import { computeActivityCounts, intensityFor, type ProductionActivity } from './activity';
import { EnvironmentSampler, seasonOf, windIntensity } from './environment';
import { nextBirdCallAt } from './birds';
import type { VillageTier } from '../game/tiers';
import type { GameState } from '../types';

type ContextFactory = () => AudioContext | null;
type BufferLoader = (ctx: AudioContext, url: string) => Promise<AudioBuffer | null>;

const MUSIC_CROSSFADE_S = 2.5;
const AMBIENT_RAMP_S = 1.5;
const VOLUME_RAMP_S = 0.05;

function defaultContextFactory(): AudioContext | null {
  try {
    const Ctor: typeof AudioContext | undefined =
      (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null; // e.g. Node/sim-tests, or a browser that refuses construction outright
  }
}

async function defaultBufferLoader(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${AUDIO_BASE_PATH}${url}`);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    return await ctx.decodeAudioData(data);
  } catch {
    return null; // 404, network error, unsupported codec, decode failure — all the same to a caller
  }
}

interface LoopNode {
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  intensity: number;
}

export class AudioManager {
  private ctxFactory: ContextFactory;
  private loadBuffer: BufferLoader;
  private ctx: AudioContext | null = null;
  /** Flips to false the first time context creation is actually attempted and fails — after that,
   *  every public method is a guaranteed no-op rather than retrying every call. */
  available = true;

  private masterGain: GainNode | null = null;
  private categoryGain: Partial<Record<AudioCategory, GainNode>> = {};

  private settings: AudioSettings;
  private muted = false;
  private gate = new ConcurrencyGate();
  private bufferCache = new Map<string, Promise<AudioBuffer | null>>();

  private ambient = new Map<string, LoopNode>();
  /** The intensity last requested for each loop key, tracked independently of whether an
   *  `AudioContext`/asset is actually available yet — see `setLoopIntensity`. Lets a caller (or a
   *  test) read back "what did I ask for" even with audio unavailable. */
  private intensities = new Map<string, number>();
  /** Throttles the expensive half of `updateEnvironment` (the terrain scan) — see
   *  `EnvironmentSampler`. */
  private envSampler = new EnvironmentSampler();
  /** Clock time (same units as `updateEnvironment`'s `now`) the next bird call is due. Starts at 0
   *  so the very first call is always "due" — a quiet village doesn't wait out a full interval
   *  before its first chirp. */
  private nextBirdAt = 0;
  private musicTier: VillageTier | null = null;
  private musicNode: { gain: GainNode; source: AudioBufferSourceNode } | null = null;
  /** The last music variation actually started — see `pickMusicVariation`. */
  private lastMusicVariation: string | null = null;

  private listener: { x: number; y: number } | undefined;
  private unsubscribeBus?: () => void;

  constructor(opts?: { contextFactory?: ContextFactory; loadBuffer?: BufferLoader }) {
    this.ctxFactory = opts?.contextFactory ?? defaultContextFactory;
    this.loadBuffer = opts?.loadBuffer ?? defaultBufferLoader;
    this.settings = loadAudioSettings();
  }

  /** Subscribe to the shared semantic-event bus — the one integration point simulation/UI code
   *  needs (see CLAUDE.md's Simulation → Game Event → Audio Manager pipeline). Every subscribed
   *  event is played as a one-shot sfx; the four production-activity ids are never emitted onto the
   *  bus (see `events.ts`) so they never reach here — `updateActivity` drives those separately. */
  install(): void {
    this.unsubscribeBus?.();
    this.unsubscribeBus = audioBus.on((event, payload) => this.playSfx(event, payload));
  }

  uninstall(): void {
    this.unsubscribeBus?.();
    this.unsubscribeBus = undefined;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (!this.available) return null;
    const ctx = this.ctxFactory();
    if (!ctx) {
      this.available = false;
      return null;
    }
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);
    for (const cat of ['music', 'ambient', 'sfx'] as AudioCategory[]) {
      const g = ctx.createGain();
      g.connect(this.masterGain);
      this.categoryGain[cat] = g;
    }
    this.applyVolumes();
    return ctx;
  }

  /** Resume/create the `AudioContext`. Call from the player's first tap/click/keypress — browsers
   *  refuse to make sound before one (CLAUDE.md "Browser/Mobile Audio Restrictions"). Idempotent
   *  and safe to call speculatively. */
  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /**
   * Arms one-time listeners for the first pointer/keyboard interaction anywhere on the page and
   * unlocks audio then, so no call site elsewhere has to thread "was there a gesture yet?" through
   * placement/menu code. A no-op with no `window` (Node tests, SSR) — see CLAUDE.md's required
   * "gracefully do nothing" cases.
   */
  installAutoUnlock(): void {
    if (typeof window === 'undefined') return;
    const handler = () => {
      this.unlock();
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchend', handler);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    window.addEventListener('touchend', handler, { once: true });
  }

  /**
   * Suspend/resume the shared `AudioContext` with the tab/app's own visibility — CLAUDE.md "Pause
   * / Resume": a backgrounded browser tab or a mobile app losing focus should not keep an
   * `AudioContext` running (most browsers suspend it for you, but iOS Safari/PWA reliably does not,
   * and it costs nothing to be explicit rather than assume). A no-op with no `document` (Node
   * tests, SSR); like `installAutoUnlock`, this only ever touches the *existing* context — it never
   * creates one, so backgrounding a tab before the first gesture stays a correct no-op rather than
   * an unlock the player never asked for. `resume()`/`suspend()` both reject quietly on a context
   * that isn't there yet or is already in the target state — swallowed the same way `unlock()`
   * already swallows a rejected `resume()`, since neither the simulation nor the UI can do anything
   * useful with that rejection.
   */
  installVisibilityHandling(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return; // nothing to suspend/resume before the first unlock
      if (document.hidden) {
        this.ctx.suspend().catch(() => {});
      } else {
        this.ctx.resume().catch(() => {});
      }
    });
  }

  /** Where spatial attenuation (`decidePlay`) measures distance from — see CLAUDE.md "Distance /
   *  Spatial Audio Architecture". Not wired to the camera in Phase 1 (see the implementation
   *  report's Remaining Work); every positioned sfx is full volume until a caller sets this. */
  setListenerPosition(x: number, y: number): void {
    this.listener = { x, y };
  }

  setMasterVolume(v: number): void {
    this.settings.master = v;
    this.applyVolumes();
  }
  setMusicVolume(v: number): void {
    this.settings.music = v;
    this.applyVolumes();
  }
  setAmbientVolume(v: number): void {
    this.settings.ambient = v;
    this.applyVolumes();
  }
  setSfxVolume(v: number): void {
    this.settings.sfx = v;
    this.applyVolumes();
  }
  setDisasterWeight(v: number): void {
    this.settings.disasterWeight = v;
  }
  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.settings.master / 10, now, VOLUME_RAMP_S);
    this.categoryGain.music?.gain.setTargetAtTime(this.settings.music / 10, now, VOLUME_RAMP_S);
    this.categoryGain.ambient?.gain.setTargetAtTime(this.settings.ambient / 10, now, VOLUME_RAMP_S);
    this.categoryGain.sfx?.gain.setTargetAtTime(this.settings.sfx / 10, now, VOLUME_RAMP_S);
  }

  private snapshot() {
    return {
      master: this.settings.master,
      music: this.settings.music,
      ambient: this.settings.ambient,
      sfx: this.settings.sfx,
      disasterWeight: this.settings.disasterWeight,
      muted: this.muted,
    };
  }

  /**
   * One-shot sound for a semantic event — never throws. A missing asset, a locked/unavailable
   * context, or a throttled burst all just mean nothing is heard this call (see `decidePlay`).
   * Called automatically for every event on the bus once `install()` has run; also safe to call
   * directly.
   */
  playSfx(event: AudioEvent, payload: AudioEventPayload = {}): void {
    const decision = decidePlay(event, payload, this.snapshot(), this.gate, nowMs(), this.listener);
    if (!decision.play || !decision.def || !decision.variation) return;
    const ctx = this.ensureContext();
    const bus = ctx ? this.categoryGain[decision.def.category] : undefined;
    if (!ctx || !bus) {
      for (const k of decision.releaseKeys) this.gate.release(k);
      return;
    }
    const variation = decision.variation;
    const gainValue = decision.gain;
    this.resolveBuffer(ctx, variation).then((buffer) => {
      if (!buffer) {
        for (const k of decision.releaseKeys) this.gate.release(k);
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      source.connect(gain).connect(bus);
      source.onended = () => {
        for (const k of decision.releaseKeys) this.gate.release(k);
      };
      source.start();
    });
  }

  private resolveBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(url);
    if (cached) return cached;
    // Cache the promise (failure included) immediately, so two overlapping plays of a not-yet-
    // loaded event share one fetch, and a 404 is fetched once, not on every subsequent play.
    const p = this.loadBuffer(ctx, url).catch(() => null);
    this.bufferCache.set(url, p);
    return p;
  }

  /**
   * Feed live production-activity worker counts into their ambient loops — see CLAUDE.md "Looping
   * Activity Sounds". Called once per UI-refresh tick from `main.ts`, never from `simulation.ts`
   * itself (see `activity.ts`'s doc); cheap enough at that cadence (a single pass over citizens).
   */
  updateActivity(state: GameState): void {
    const counts = computeActivityCounts(state);
    for (const key of Object.keys(counts) as ProductionActivity[]) {
      this.setLoopIntensity(key, AUDIO_ASSET_MAP[key], intensityFor(counts[key]));
    }
  }

  /** Layered environmental ambience (water/wind/forest/village) — CLAUDE.md "Ambient Audio
   *  Architecture". Driven automatically by `updateEnvironment` below; exposed directly too (a
   *  caller — or a test — can set one on its own opinion, e.g. `setAmbientLayer('water', 0.6)`). */
  setAmbientLayer(layer: AmbientLayer, intensity: number): void {
    this.setLoopIntensity(layer, AMBIENT_LAYER_DEFS[layer], intensity);
  }

  /**
   * The ambient environment tick — CLAUDE.md "Ambient Audio Architecture": water/forest/village
   * from `environment.ts`'s live terrain+population metrics, wind from a low seasonal bed, plus the
   * occasional one-shot `BIRD_CALL` on `birds.ts`'s randomized schedule. Meant to be called from
   * the same cadence as `updateActivity`/`playMusicForTier` (`main.ts`'s 100ms UI-refresh tick) —
   * the terrain scan itself is throttled by `envSampler` (a few seconds' cadence), so calling this
   * every 100ms never re-walks the map every 100ms. Never throws: every layer already degrades to
   * "remembered but silent" when the context or the asset isn't there yet (`setLoopIntensity`).
   */
  updateEnvironment(state: GameState, now = nowMs()): void {
    const metrics = this.envSampler.sample(state, now);
    this.setAmbientLayer('water', metrics.water);
    this.setAmbientLayer('forest', metrics.forest);
    this.setAmbientLayer('village', metrics.village);
    this.setAmbientLayer('wind', windIntensity(state));

    if (now >= this.nextBirdAt) {
      this.nextBirdAt = nextBirdCallAt(now, seasonOf(state));
      // Reuses the ordinary one-shot path (mute/ambient-volume/missing-asset handling included) —
      // see `events.ts`'s note on `BIRD_CALL` never being `emit`-ted onto the bus.
      this.playSfx('BIRD_CALL');
    }
  }

  /** When the next bird call is due — for tests/inspection, same convention as
   *  `currentMusicTier()`/`ambientIntensity()`. */
  nextBirdCallTime(): number {
    return this.nextBirdAt;
  }

  /** The intensity last requested for `key` (an `AmbientLayer` or `ProductionActivity` id),
   *  whether or not audio is actually available — see `intensities` above. */
  ambientIntensity(key: string): number {
    return this.intensities.get(key) ?? 0;
  }

  stopAmbient(key: string): void {
    const entry = this.ambient.get(key);
    if (!entry) return;
    try {
      entry.source?.stop();
    } catch {
      /* already stopped */
    }
    this.ambient.delete(key);
  }

  private setLoopIntensity(key: string, def: AudioAssetDef, intensity: number): void {
    const clamped = Math.max(0, Math.min(1, intensity));
    this.intensities.set(key, clamped);
    const ctx = this.ensureContext();
    const bus = ctx ? this.categoryGain[def.category] : undefined;
    let entry = this.ambient.get(key);
    if (!ctx || !bus || def.variations.length === 0) {
      // Nothing to play yet (no context, or no asset registered for this layer/activity) — the
      // intensity is still remembered above, so a later `unlock()`/Phase-2 asset drop picks up
      // from where it left off without a caller having to re-set it.
      if (entry) entry.intensity = clamped;
      return;
    }
    if (!entry) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(bus);
      entry = { gain, source: null, intensity: 0 };
      this.ambient.set(key, entry);
      this.resolveBuffer(ctx, def.variations[0]).then((buffer) => {
        const live = this.ambient.get(key);
        if (!buffer || !live || live !== entry) return; // superseded/stopped while loading
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(entry!.gain);
        source.start();
        entry!.source = source;
      });
    }
    entry.intensity = clamped;
    entry.gain.gain.setTargetAtTime(clamped, ctx.currentTime, AMBIENT_RAMP_S / 3);
  }

  /** The tier the music system last switched to (or `null` before the first call) — for the UI/
   *  tests to read back; `playMusicForTier` is the only thing that changes it. */
  currentMusicTier(): VillageTier | null {
    return this.musicTier;
  }

  /**
   * Switch (crossfade) to `tier`'s music track — a no-op if the village is already on that tier's
   * music, so calling this every frame/season-turn never restarts the track (a required behaviour
   * — see CLAUDE.md "Preventing unnecessary restart when the tier hasn't changed").
   */
  playMusicForTier(tier: VillageTier): void {
    if (this.musicTier === tier) return;
    this.musicTier = tier;
    const ctx = this.ensureContext();
    const def = MUSIC_TRACKS[tier];

    const prev = this.musicNode;
    this.musicNode = null;
    if (prev && ctx) {
      prev.gain.gain.setTargetAtTime(0, ctx.currentTime, MUSIC_CROSSFADE_S / 3);
      const staleSource = prev.source;
      setTimeout(() => {
        try {
          staleSource.stop();
        } catch {
          /* already stopped */
        }
      }, MUSIC_CROSSFADE_S * 1000 + 200);
    }

    if (!ctx || def.variations.length === 0) return;
    const bus = this.categoryGain.music;
    if (!bus) return;
    // CLAUDE.md "Music Randomization": "avoid selecting the same track repeatedly if multiple
    // tracks are available." Only matters once a tier ever gets a second track (today: none do) —
    // with one variation, or none picked yet, this is exactly the old plain random pick.
    const pick = pickMusicVariation(def.variations, this.lastMusicVariation);
    this.lastMusicVariation = pick;
    this.resolveBuffer(ctx, pick).then((buffer) => {
      if (!buffer || this.musicTier !== tier) return; // superseded by another tier change mid-load
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain).connect(bus);
      source.start();
      gain.gain.setTargetAtTime(1, ctx.currentTime, MUSIC_CROSSFADE_S / 3);
      this.musicNode = { gain, source };
    });
  }

  stopMusic(): void {
    this.musicTier = null;
    if (this.musicNode) {
      try {
        this.musicNode.source.stop();
      } catch {
        /* already stopped */
      }
      this.musicNode = null;
    }
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Pick a music track, avoiding an immediate repeat of `last` when more than one variation exists —
 * CLAUDE.md "Music Randomization": "avoid selecting the same track repeatedly," stopping short of
 * the "complex playlist management" it explicitly says not to build (no history, no shuffle bag,
 * just "not the one that's already playing"). A single-variation tier (every one of them, until
 * Phase 2 audio files actually ship) or a tier with nothing picked yet falls back to a plain random
 * pick — there is nothing to avoid repeating.
 */
export function pickMusicVariation(variations: string[], last: string | null, rand: () => number = Math.random): string {
  if (variations.length <= 1 || last === null) return variations[(rand() * variations.length) | 0];
  const others = variations.filter((v) => v !== last);
  return others.length > 0 ? others[(rand() * others.length) | 0] : variations[0];
}

/** The shared instance — one `AudioContext` for the whole app, same convention as the shared
 *  `audioBus`. `main.ts` calls `install()`/`installAutoUnlock()` once at startup (see `index.ts`'s
 *  `initAudio`). */
export const audioManager = new AudioManager();
