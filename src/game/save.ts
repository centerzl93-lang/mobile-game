import {
  AGE_PER_YEAR,
  GameState, MAP_W, MAP_H, MapSize, setMapSize, CROPS, RANCH_MIN, ranchCapacity, EVENT_LOG_MAX,
  isWorkplace, nextBuildingName, SEASON_LENGTH, Building,
  buildWorkOf, BUILD_WORK_RATE, freshStats,
} from '../types';
import { randomName } from './names';
import { newSeed } from './rng';

/**
 * Construction times as they were before builder-work replaced them, in the raw units the old
 * defs carried — multiplied by `LEGACY_BUILD_TIME_SCALE` to get the seconds a site actually took.
 *
 * Frozen on purpose: it exists only to read old saves, so it must keep saying what the game used
 * to do however the live table moves. Nothing outside the migration below may use it.
 */
const LEGACY_BUILD_TIME: Record<string, number> = {
  house: 6, stonehouse: 8, gatherer: 6, farm: 5, fishing: 6, hunting: 6, ranch: 7,
  lumberyard: 6, woodcutter: 6, quarry: 14, mine: 8, blacksmith: 7, tailor: 6, trading: 8,
  school: 7, tavern: 7, chapel: 8, cemetery: 6, herbalist: 6, hospital: 8, well: 4,
  market: 8, barn: 6,
};
const LEGACY_BUILD_TIME_SCALE = 2;

// Legacy single-slot key (pre-slots). Migrated into slot 0 on first run, then left in place.
const LEGACY_KEY = 'little-village-save-v12';

/**
 * The format the game writes today.
 *
 * **Bumping this is now safe**, which it very much was not before: `loadGame` used to demand
 * `env.v === VERSION` and return null otherwise, so raising the number silently threw away every
 * save on every device — the game would simply offer a new village. That is why every change to
 * the state's shape so far has been smuggled in as a "is this field missing?" test rather than a
 * version bump, and why the slot keys still say v12: the number was unusable, so nothing dared
 * touch it.
 *
 * To change the shape of a save now: bump this, and add a step to `MIGRATIONS` keyed by the
 * version it upgrades *from*.
 */
const VERSION = 14;

/**
 * The oldest envelope the loader will still take. Below this a save is too old to reason about and
 * is refused rather than guessed at.
 */
const MIN_VERSION = 12;

/**
 * One step per version, keyed by the version it upgrades **from**. Each mutates the state in place
 * to the shape the next version expects, and the loader walks them in order, so a v12 save passes
 * through every step between there and `VERSION`.
 *
 * Keep each step narrow and never make it reach for a live constant that might move underneath it
 * — a migration has to keep describing the change it made, not the game as it is today.
 * `LEGACY_BUILD_TIME` above is the example to follow.
 */
const MIGRATIONS: Record<number, (s: GameState) => void> = {
  // v12 → v13: the simulation got a seeded random stream. Saves before it have neither number, and
  // there is no recovering the map's original seed, so record one this village will report from
  // here on and open a stream from it. The field-presence checks in `loadGame` handle the older
  // shapes that were also written as v12.
  12: (s) => {
    if (typeof s.seed !== 'number') s.seed = newSeed();
    if (typeof s.rng !== 'number') s.rng = (s.seed ^ 0x5bf03635) | 0;
  },
  // v13 → v14: the achievement tallies arrived. An old village has no history to reconstruct — its
  // lifetime totals are gone — so it starts a fresh set of tallies from where it stands. Milestones
  // it has already earned (a big population, a cathedral) are still checked live, so most re-unlock
  // at once; the cumulative ones (produce N, survive N winters) simply start counting from now.
  13: (s) => {
    if (!s.stats) s.stats = freshStats();
  },
};

/**
 * Bring a save envelope up to `VERSION`, or return null if it cannot be.
 *
 * Refuses saves from the future (a newer build wrote them; this one cannot know what changed) and
 * from before `MIN_VERSION`.
 */
function migrateEnvelope(env: SaveEnvelope): GameState | null {
  if (!env || typeof env.v !== 'number' || !env.state) return null;
  if (env.v > VERSION || env.v < MIN_VERSION) return null;
  for (let v = env.v; v < VERSION; v++) MIGRATIONS[v]?.(env.state);
  env.v = VERSION;
  return env.state;
}

/** Number of fixed save slots the player can use. */
export const SLOTS = 3;
const slotKey = (slot: number): string => `little-village-save-v12-slot${slot}`;
/**
 * A slot's player-given name, kept beside the save rather than inside it.
 *
 * The game autosaves over the slot every few seconds, so a name stored in the envelope would have
 * to be read back and re-attached on every one of those writes to survive — and would be lost the
 * moment a save was written by any path that forgot. Beside it, the name is written once when the
 * player types it and is untouched by anything else.
 */
const slotNameKey = (slot: number): string => `little-village-save-v12-slot${slot}-name`;
const LAST_SLOT_KEY = 'little-village-last-slot';
const MIGRATED_KEY = 'little-village-migrated';

/** Longest slot name the player can set. Matches the building-rename field. */
export const SLOT_NAME_MAX = 24;

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
    const s = migrateEnvelope(env);
    if (!s) return null;
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
    // Saves from before idle villagers had somewhere to loiter: fall back to the first barn,
    // which is where the village was founded.
    if (!s.origin || typeof s.origin.x !== 'number') {
      const first = (s.buildings ?? []).find((b: Building) => b.type === 'barn') ?? (s.buildings ?? [])[0];
      s.origin = first ? { x: first.x + 1, y: first.y + 1 } : { x: w / 2, y: h / 2 };
    }
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
    for (const c of s.citizens) if (!c.name) c.name = randomName(c.sex, s);
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
    // Ages used to advance in step with the calendar, with childhood the four years from 0 to
    // adulthood. A save from before that carries no `ageScale`, and its children's ages mean
    // something different from the same numbers now — a 3 was a child about to start work, and
    // here it is an infant with nine years to go. Stretch them across the new childhood so they
    // keep the growing up they had already done. Adults need nothing: 20 to 29 reads the same
    // either way, and they simply live longer in seasons than they would have.
    if (typeof s.ageScale !== 'number') {
      const OLD_ADULT_AGE = 4;
      // Childhood ran 0..12 when this migration was written — frozen here, not read from the live
      // `ADULT_AGE`, which has since moved to 16. A migration must keep describing the change it
      // made, so an ancient save is stretched onto the same 0..12 childhood it always was.
      const CHILDHOOD_SPAN = 12;
      for (const c of s.citizens) {
        if (c.age < OLD_ADULT_AGE) c.age *= CHILDHOOD_SPAN / OLD_ADULT_AGE;
      }
      s.ageScale = AGE_PER_YEAR;
    }

    // Construction used to be counted in seconds: `progress` ran up to a `buildTime` of six or
    // eight of them. It counts builder-work now, and the two scales differ per building — a house
    // was 12 and is 40 — so a raw number carried across would read as a site barely begun. Move
    // each one over at the fraction it had actually reached.
    if (typeof s.workScale !== 'number') {
      for (const b of s.buildings) {
        const total = buildWorkOf(b.type);
        if (b.built) {
          b.progress = total; // standing buildings are simply done, however they were measured
          continue;
        }
        const was = (LEGACY_BUILD_TIME[b.type] ?? 6) * LEGACY_BUILD_TIME_SCALE;
        const frac = was > 0 ? Math.min(1, Math.max(0, (b.progress ?? 0) / was)) : 0;
        b.progress = frac * total;
        // A teardown in flight is the same fraction of a job half the size, so it rescales by the
        // same ratio rather than needing its own table.
        if (typeof b.demoProgress === 'number') b.demoProgress *= total / (was || total);
      }
      s.workScale = BUILD_WORK_RATE;
    }

    // Seeds (crop unlocks) were added after this format shipped. Saves without them predate the
    // gate, when every field could grow — grant all crops so old farms keep working.
    if (!Array.isArray(s.seeds)) s.seeds = [...CROPS];
    // Drop crop selections that are no longer valid varieties (e.g. the old 'vegetables'/'fruit').
    for (const b of s.buildings) {
      if (b.crop && !CROPS.includes(b.crop)) b.crop = undefined;
    }
    // Migrate the old single 'livestock' herd into 'cattle' (per-animal herds), and the old
    // catch-all 'meat' into 'beef' — every cut carries its own name now, and nothing produces the
    // generic kind any more, so a save left holding it would show a row that could never refill.
    const RENAMED: [string, string][] = [['livestock', 'cattle'], ['meat', 'beef']];
    const rename = (bag: Record<string, number> | undefined): void => {
      if (!bag) return;
      for (const [from, to] of RENAMED) {
        if (!bag[from]) continue;
        bag[to] = (bag[to] ?? 0) + bag[from];
        delete bag[from];
      }
    };
    for (const b of s.buildings) {
      rename(b.store as Record<string, number>);
      rename(b.orders as Record<string, number> | undefined);
    }
    rename(s.merchant.stock as Record<string, number> | undefined);
    rename(s.limits as Record<string, number> | undefined);
    // A villager caught mid-haul with a load of the old kind.
    for (const c of s.citizens) {
      const carry = c.carry as { kind: string; amount: number } | null;
      if (!carry) continue;
      const to = RENAMED.find(([from]) => from === carry.kind)?.[1];
      if (to) carry.kind = to as typeof carry.kind;
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
    // Merchant timing moved off the season boundary: the stay and the post-departure gap are now
    // counted in seconds, so a boat can arrive and leave part-way through a season. Convert the
    // old per-season counters rather than dropping a docked merchant on the floor.
    if (typeof m.stayTimer !== 'number') {
      m.stayTimer = ((m.seasonsLeft as number) ?? 0) * SEASON_LENGTH;
      delete m.seasonsLeft;
    }
    if (typeof m.cooldownTimer !== 'number') {
      m.cooldownTimer = m.cooldown === true ? SEASON_LENGTH : 0;
      delete m.cooldown;
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

/**
 * The name the player gave a slot, or null if they never named it (the list shows "Slot N" then).
 * Trimmed and length-capped on the way in, so a name is either something readable or absent.
 */
export function slotName(slot: number): string | null {
  try {
    const raw = localStorage.getItem(slotNameKey(slot));
    const name = raw?.trim().slice(0, SLOT_NAME_MAX) ?? '';
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

/** Name a slot, or clear the name back to the default by passing an empty one. */
export function setSlotName(slot: number, name: string): void {
  try {
    const clean = name.trim().slice(0, SLOT_NAME_MAX);
    if (clean.length > 0) localStorage.setItem(slotNameKey(slot), clean);
    else localStorage.removeItem(slotNameKey(slot));
  } catch {
    /* storage full or unavailable — the village is unaffected, it just keeps its default name */
  }
}

/** A cheap summary of a slot's save for the load/save list, or null if empty/corrupt. */
export function slotInfo(slot: number): { year: number; pop: number; size: MapSize; name: string | null } | null {
  try {
    migrateLegacy();
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const env = JSON.parse(raw) as SaveEnvelope;
    const s = migrateEnvelope(env);
    if (!s) return null;
    const w = typeof s.w === 'number' ? s.w : 48;
    // Anything wider than Small is Large now, including saves made on the retired 192 map.
    const size: MapSize = w > 72 ? 'large' : 'small';
    return {
      year: s.year ?? 1,
      pop: Array.isArray(s.citizens) ? s.citizens.length : 0,
      size,
      name: slotName(slot),
    };
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
      localStorage.removeItem(slotNameKey(slot)); // an empty slot is not a named one
      return;
    }
    for (let i = 0; i < SLOTS; i++) {
      localStorage.removeItem(slotKey(i));
      localStorage.removeItem(slotNameKey(i));
    }
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
