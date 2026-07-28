import {
  GameState, MAP_W, MAP_H, MapSize, setMapSize, CROPS, RANCH_MIN, ranchCapacity, EVENT_LOG_MAX,
  isWorkplace, nextBuildingName,
} from '../types';
import { randomName } from './names';

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
    // Default fields added after this save format shipped, so older saves keep working.
    if (typeof s.disasters !== 'boolean') s.disasters = true;
    // Builders became an explicit assignable job. Older saves had every idle adult construct;
    // default to none so the player opts in (matches new games).
    if (typeof s.desiredBuilders !== 'number') s.desiredBuilders = 0;
    // Drawn-but-unconfirmed path tiles; older saves simply have none outstanding.
    if (!Array.isArray(s.pendingPaths)) s.pendingPaths = [];
    // The village chronicle was added after this format shipped; older saves simply start empty
    // and begin recording from the moment they are loaded.
    if (!Array.isArray(s.events)) s.events = [];
    else if (s.events.length > EVENT_LOG_MAX) s.events.length = EVENT_LOG_MAX;
    if (s.difficulty !== 'easy' && s.difficulty !== 'normal' && s.difficulty !== 'hard') s.difficulty = 'normal';
    // Sanity check the shape so a corrupt save can't crash the game.
    if (!Array.isArray(s.tiles) || s.tiles.length !== MAP_W * MAP_H) return null;
    if (!Array.isArray(s.buildings) || !Array.isArray(s.citizens)) return null;
    if (!Array.isArray(s.paths) || s.paths.length !== MAP_W * MAP_H) return null;
    if (!Array.isArray(s.harvest) || s.harvest.length !== MAP_W * MAP_H) return null;
    if (!s.merchant || typeof s.pathProgress !== 'number') return null;
    // Backfill names for citizens saved before villagers had names.
    for (const c of s.citizens) if (!c.name) c.name = randomName(c.sex);
    // Partnerships and parentage came in after this format shipped. Saves without them load as a
    // village of singles and pair off at the next season turnover. Drop any link that isn't
    // mutual or points at someone who is gone, so a stale id can't wedge the household logic.
    const byId = new Map(s.citizens.map((c) => [c.id, c]));
    for (const c of s.citizens) {
      if (c.partnerId == null) continue;
      const partner = byId.get(c.partnerId);
      if (!partner || partner.partnerId !== c.id || partner.id === c.id) c.partnerId = null;
    }
    for (const c of s.citizens) {
      if (c.parents && (c.parents.length !== 2 || c.parents.some((id) => typeof id !== 'number'))) {
        c.parents = undefined;
      }
    }
    // Seeds (crop unlocks) were added after this format shipped. Saves without them predate the
    // gate, when every field could grow — grant all crops so old farms keep working.
    if (!Array.isArray(s.seeds)) s.seeds = [...CROPS];
    // Drop crop selections that are no longer valid varieties (e.g. the old 'vegetables'/'fruit').
    for (const b of s.buildings) {
      if (b.crop && !CROPS.includes(b.crop)) b.crop = undefined;
    }
    // Migrate the old single 'livestock' herd into 'cattle' (per-animal herds).
    for (const b of s.buildings) {
      const store = b.store as Record<string, number>;
      if (store.livestock) {
        store.cattle = (store.cattle ?? 0) + store.livestock;
        delete store.livestock;
      }
    }
    if (s.merchant.stock) {
      const ms = s.merchant.stock as Record<string, number>;
      if (ms.livestock) { ms.cattle = (ms.cattle ?? 0) + ms.livestock; delete ms.livestock; }
    }
    // The merchant grew a boat, categories, and a stay counter. Upgrade the old
    // { present, timer, stock } shape so a mid-game save loads without a docked ghost merchant.
    const m = s.merchant as unknown as Record<string, unknown>;
    if (typeof m.phase !== 'string') {
      const wasPresent = m.present === true;
      m.phase = wasPresent ? 'docked' : 'away';
      m.seasonsLeft = wasPresent ? 1 : 0;
      m.cooldown = false;
      m.category = wasPresent ? 'goods' : null;
      if (!m.stock || typeof m.stock !== 'object') m.stock = {};
      m.seedStock = [];
      m.boat = null;
    }
    if (!Array.isArray(s.merchant.seedStock)) s.merchant.seedStock = [];
    // Trading posts gained a player-set stock-order table.
    for (const b of s.buildings) if (b.type === 'trading' && !b.orders) b.orders = {};
    // Workplaces gained names after this format shipped; number the ones that predate it, in the
    // order they were built, so an old save reads the same as a new game would.
    for (const b of s.buildings) {
      if (isWorkplace(b.type) && !b.name) b.name = nextBuildingName(s.buildings, b.type);
    }
    // Ranches became sizable pens with per-ranch herds. Old ranches had no footprint or headcount:
    // default them to the minimum size, an empty pen, and a cap at that size's capacity.
    for (const b of s.buildings) {
      if (b.type !== 'ranch') continue;
      if (typeof b.w !== 'number') b.w = RANCH_MIN;
      if (typeof b.h !== 'number') b.h = RANCH_MIN;
      if (typeof b.animals !== 'number') b.animals = 0;
      if (typeof b.breedProgress !== 'number') b.breedProgress = 0;
      if (typeof b.maxAnimals !== 'number') b.maxAnimals = ranchCapacity(b);
    }
    // Fields became sizable too; default legacy 3×3 farms to the minimum footprint.
    for (const b of s.buildings) {
      if (b.type !== 'farm') continue;
      if (typeof b.w !== 'number') b.w = RANCH_MIN;
      if (typeof b.h !== 'number') b.h = RANCH_MIN;
    }
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
