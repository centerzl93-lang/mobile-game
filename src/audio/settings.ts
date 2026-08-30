/**
 * Player audio/haptic preferences. Like `village-tips` (see `main.ts`), these follow the *player*,
 * not the village — plain `localStorage` keys, never written into a save (see CLAUDE.md "Save
 * compatibility": "Do NOT put unnecessary audio runtime state into village saves"). This file is
 * an extension of the settings surface `main.ts` already had for audio (it defined these same four
 * volume sliders and the haptics toggle before any audio system existed to read them — see the
 * pre-existing `AUDIO_MUSIC_KEY` etc. this file replaces) rather than a new one; the localStorage
 * key strings are unchanged so an existing player's saved slider positions still apply.
 *
 * Every reader is wrapped in try/catch: a private-browsing tab, a locked-down embed, or a Node test
 * environment can throw just *touching* `localStorage` (there is no global at all in `sim-tests/`),
 * and a missing/corrupt value must read as a sane default rather than crash audio init — see
 * CLAUDE.md "Audio failures must never break the simulation."
 */
const HAPTICS_KEY = 'village-haptics';
const MASTER_KEY = 'village-audio-master';
const MUSIC_KEY = 'village-audio-music';
/** The sfx bus fader. Key name kept as "notifications" — its original, pre-Phase-1 label — for
 *  backward compatibility with saved preferences. */
const SFX_KEY = 'village-audio-notifications';
/** The ambient bus fader. Key name kept as "village" (as in "village noises") for the same reason. */
const AMBIENT_KEY = 'village-audio-village';
/** An extra weight applied only to disaster stings on top of the sfx bus — see `decision.ts`'s
 *  `DISASTER_EVENTS` — so a player can make fires/floods stand out (or fade them down) without
 *  touching every other sfx. */
const DISASTER_KEY = 'village-audio-disaster';

const VOLUME_DEFAULT = 5; // 0..10 — matches the settings panel's existing slider range
const MASTER_DEFAULT = 8;

function readVolume(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const raw = Number(stored);
    return Number.isFinite(raw) && raw >= 0 && raw <= 10 ? raw : fallback;
  } catch {
    return fallback;
  }
}

function writeVolume(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // Storage unavailable (private mode, quota, non-browser test) — the setting just won't stick
    // this session. Never throw: a settings write must not be able to break the game.
  }
}

export interface AudioSettings {
  /** 0..10 sliders, matching the existing settings-panel range. */
  master: number;
  music: number;
  ambient: number;
  sfx: number;
  disasterWeight: number;
  haptics: boolean;
}

export function loadAudioSettings(): AudioSettings {
  return {
    master: readVolume(MASTER_KEY, MASTER_DEFAULT),
    music: readVolume(MUSIC_KEY, VOLUME_DEFAULT),
    ambient: readVolume(AMBIENT_KEY, VOLUME_DEFAULT),
    sfx: readVolume(SFX_KEY, VOLUME_DEFAULT),
    disasterWeight: readVolume(DISASTER_KEY, VOLUME_DEFAULT),
    haptics: hapticsEnabled(),
  };
}

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== 'off';
  } catch {
    return true; // default on
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off');
  } catch {
    /* see writeVolume */
  }
}

export function setMasterVolume(v: number): void {
  writeVolume(MASTER_KEY, v);
}
export function setMusicVolume(v: number): void {
  writeVolume(MUSIC_KEY, v);
}
export function setAmbientVolume(v: number): void {
  writeVolume(AMBIENT_KEY, v);
}
export function setSfxVolume(v: number): void {
  writeVolume(SFX_KEY, v);
}
export function setDisasterWeight(v: number): void {
  writeVolume(DISASTER_KEY, v);
}
