import { GameState, MAP_W, MAP_H, MapSize, setMapSize } from '../types';

// Legacy single-slot key (pre-slots). Migrated into slot 0 on first run, then left in place.
const LEGACY_KEY = 'little-village-save-v12';
const VERSION = 12;

/** Number of fixed save slots the player can use. */
export const SLOTS = 3;
const slotKey = (slot: number): string => `little-village-save-v12-slot${slot}`;
const LAST_SLOT_KEY = 'little-village-last-slot';
const MIGRATED_KEY = 'little-village-migrated';

interface SaveEnvelope {
  v: number;
  state: GameState;
}

/** Persist a game to a slot (default slot 0) and remember it as the most recently used. */
export function saveGame(s: GameState, slot = 0): void {
  try {
    const envelope: SaveEnvelope = { v: VERSION, state: s };
    localStorage.setItem(slotKey(slot), JSON.stringify(envelope));
    setLastSlot(slot);
  } catch {
    /* storage full or unavailable — ignore, game keeps running in memory */
  }
}

/** Load and validate the game in a slot, restoring its map size first. Null if empty/corrupt. */
export function loadGame(slot = 0): GameState | null {
  try {
    migrateLegacy();
    const raw = localStorage.getItem(slotKey(slot));
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

/** True if a slot holds a save. With no slot, true if *any* slot is occupied. */
export function hasSave(slot?: number): boolean {
  try {
    migrateLegacy();
    if (typeof slot === 'number') return localStorage.getItem(slotKey(slot)) != null;
    for (let i = 0; i < SLOTS; i++) if (localStorage.getItem(slotKey(i)) != null) return true;
    return false;
  } catch {
    return false;
  }
}

/** A cheap summary of a slot's save for the load/save list, or null if empty/corrupt. */
export function slotInfo(slot: number): { year: number; pop: number; size: MapSize } | null {
  try {
    migrateLegacy();
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const env = JSON.parse(raw) as SaveEnvelope;
    if (!env || env.v !== VERSION || !env.state) return null;
    const s = env.state;
    const w = typeof s.w === 'number' ? s.w : 48;
    const size: MapSize = w >= 192 ? 'large' : w >= 96 ? 'medium' : 'small';
    return { year: s.year ?? 1, pop: Array.isArray(s.citizens) ? s.citizens.length : 0, size };
  } catch {
    return null;
  }
}

/** The most recently used slot (for Continue), or null if none saved. */
export function lastSlot(): number | null {
  try {
    migrateLegacy();
    const raw = localStorage.getItem(LAST_SLOT_KEY);
    if (raw != null) {
      const i = Number(raw);
      if (Number.isInteger(i) && i >= 0 && i < SLOTS && localStorage.getItem(slotKey(i)) != null) return i;
    }
    for (let i = 0; i < SLOTS; i++) if (localStorage.getItem(slotKey(i)) != null) return i;
    return null;
  } catch {
    return null;
  }
}

/** Clear a single slot, or every slot when no slot is given. */
export function clearSave(slot?: number): void {
  try {
    if (typeof slot === 'number') {
      localStorage.removeItem(slotKey(slot));
      return;
    }
    for (let i = 0; i < SLOTS; i++) localStorage.removeItem(slotKey(i));
    localStorage.removeItem(LAST_SLOT_KEY);
    localStorage.removeItem(LEGACY_KEY);
    localStorage.setItem(MIGRATED_KEY, '1'); // don't resurrect the legacy save after a clear-all
  } catch {
    /* ignore */
  }
}

function setLastSlot(slot: number): void {
  try {
    localStorage.setItem(LAST_SLOT_KEY, String(slot));
  } catch {
    /* ignore */
  }
}

/**
 * Copy a pre-slots save into slot 0 the first time we run with slots. Runs once (guarded by a
 * flag) and never deletes the legacy key, so rolling back to the old build still finds the save.
 */
function migrateLegacy(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY) != null) return;
    localStorage.setItem(MIGRATED_KEY, '1');
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy == null) return;
    if (localStorage.getItem(slotKey(0)) == null) {
      localStorage.setItem(slotKey(0), legacy);
      if (localStorage.getItem(LAST_SLOT_KEY) == null) localStorage.setItem(LAST_SLOT_KEY, '0');
    }
  } catch {
    /* ignore */
  }
}
