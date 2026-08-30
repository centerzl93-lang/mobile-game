/**
 * Public entry point for `src/audio/`. `main.ts` (the browser-facing edge — see CLAUDE.md "Unity
 * migration architecture") imports from here; `src/game/simulation.ts` imports only `emitAudio`/
 * `AudioEvent` from `./events` directly, never anything in this file (nothing here is portable —
 * `initAudio` wires up the two Web-Audio/DOM-specific backends).
 */
export { audioBus, emitAudio } from './events';
export type { AudioEvent, HapticEvent, AudioEventPayload } from './events';
export { AudioManager, audioManager } from './manager';
export { HapticManager, hapticManager } from './haptics';
export {
  loadAudioSettings,
  hapticsEnabled,
  setHapticsEnabled,
  setMasterVolume,
  setMusicVolume,
  setAmbientVolume,
  setSfxVolume,
  setDisasterWeight,
  type AudioSettings,
} from './settings';

import { audioManager } from './manager';
import { hapticManager } from './haptics';

/**
 * Wire the audio/haptic backends to the shared semantic-event bus and arm the browser's autoplay-
 * restriction workaround. Call once, at startup. Never throws — every step already degrades to a
 * no-op on its own (an unavailable `AudioContext`, no `window`, no `navigator.vibrate`), so calling
 * this in an environment with none of them is a correct, silent no-op rather than an error.
 */
export function initAudio(): void {
  audioManager.install();
  hapticManager.install();
  audioManager.installAutoUnlock();
}
