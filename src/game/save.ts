import { GameState, MAP_W, MAP_H } from '../types';

const KEY = 'little-village-save-v2';
const VERSION = 2;

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
    // Sanity check the shape so a corrupt save can't crash the game.
    if (!Array.isArray(s.tiles) || s.tiles.length !== MAP_W * MAP_H) return null;
    if (!Array.isArray(s.buildings) || !Array.isArray(s.citizens)) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
