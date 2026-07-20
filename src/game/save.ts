import { GameState, MAP_W, MAP_H, setMapSize } from '../types';

const KEY = 'little-village-save-v12';
const VERSION = 12;

interface SaveEnvelope {
  v: number;
  state: GameState;
}

export function saveGame(s: GameState): void {
  try {
    const envelope: SaveEnvelope = { v: VERSION, state: s };
    localStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    /* storage full or unavailable — ignore, game keeps running in memory */
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as SaveEnvelope;
    if (!env || env.v !== VERSION || !env.state) return null;
    const s = env.state;
    // Restore the map dimensions this save was made at before validating lengths, so a
    // Medium/Large save is checked against its own size (older saves default to 48).
    const w = typeof s.w === 'number' ? s.w : 48;
    const h = typeof s.h === 'number' ? s.h : 48;
    setMapSize(w, h);
    s.w = w;
    s.h = h;
    // Sanity check the shape so a corrupt save can't crash the game.
    if (!Array.isArray(s.tiles) || s.tiles.length !== MAP_W * MAP_H) return null;
    if (!Array.isArray(s.buildings) || !Array.isArray(s.citizens)) return null;
    if (!Array.isArray(s.paths) || s.paths.length !== MAP_W * MAP_H) return null;
    if (!Array.isArray(s.harvest) || s.harvest.length !== MAP_W * MAP_H) return null;
    if (!s.merchant || typeof s.pathProgress !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}

/** True if a save exists in storage (used to show the menu's Continue button). */
export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
