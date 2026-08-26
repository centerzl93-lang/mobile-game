import {
  AGE_PER_YEAR,
  GameState, MAP_W, MAP_H, MapSize, setMapSize, CROPS, RANCH_MIN, ranchCapacity, EVENT_LOG_MAX,
  isWorkplace, nextBuildingName, SEASON_LENGTH, Building, VillageStats,
  buildWorkOf, BUILD_WORK_RATE, freshStats,
} from '../types';
import { randomName } from './names';
import { newSeed } from './rng';

/**
 * Serialise a state into a save envelope.
 *
 * The **whole** state is written, transient-looking per-citizen fields included. It is tempting to
 * strip the recomputable ones (the A* route cache, a worker's partial `pending` load, the survival
 * counters) to shrink the blob, but a save must reproduce the *running* village exactly: dropping
 * `pending` loses real in-flight resources, and even dropping the pure nav cache shifts a villager's
 * path timing on reload just enough to diverge the shared RNG stream from an uninterrupted run. The
 * determinism spec in `tests/newgame.spec.ts` ("survives a save and load") pins that guarantee, so
 * nothing is stripped here — the size is the price of an exact resume.
 */
function serialize(s: GameState): string {
  const envelope: SaveEnvelope = { v: VERSION, state: s };
  return JSON.stringify(envelope);
}

/**
 * Whether a state is structurally sound enough to write over an existing save.
 *
 * This is the guard that keeps autosave from replacing a good save with a half-built or corrupt one
 * (a state caught mid-construction by a bug, or one whose arrays came out the wrong length). It is
 * the same shape check `loadGame` applies on the way back in, run here on the way out so a state
 * that could never load is never written in the first place. Lengths are checked against the state's
 * own `w`/`h` rather than the module's live `MAP_W`/`MAP_H`, so it is correct regardless of which
 * map size is currently active.
 */
function validState(s: GameState): boolean {
  if (!s || typeof s.w !== 'number' || typeof s.h !== 'number') return false;
  const n = s.w * s.h;
  if (!Array.isArray(s.tiles) || s.tiles.length !== n) return false;
  if (!Array.isArray(s.paths) || s.paths.length !== n) return false;
  if (!Array.isArray(s.harvest) || s.harvest.length !== n) return false;
  if (!Array.isArray(s.buildings) || !Array.isArray(s.citizens)) return false;
  if (!s.merchant || typeof s.pathProgress !== 'number') return false;
  if (typeof s.seed !== 'number' || typeof s.rng !== 'number') return false;
  return true;
}

/**
 * Merge a loaded (possibly older, possibly partial) stats object onto a fresh full one, so every
 * `VillageStats` field is present with a sensible zero/false/empty default.
 *
 * This is the structural safety net for adding stats fields: `endSeason` advances peaks with
 * `Math.max(st.field, v)` and counters with `st.field++`, and a field left `undefined` by an older
 * save would turn to `NaN` on the first turnover and stay `NaN` forever — silently making the
 * achievements that read it unwinnable. Starting from `freshStats()` and layering the saved values
 * on top guarantees a field added later is a real `0`/`false`/`[]` on every existing save, not a
 * hole. `produced` is merged one level down for the same reason.
 */
function mergeStats(saved: Partial<VillageStats> | undefined): VillageStats {
  const base = freshStats();
  if (!saved || typeof saved !== 'object') return base;
  const produced = (saved.produced && typeof saved.produced === 'object')
    ? { ...base.produced, ...saved.produced }
    : base.produced;
  const placedTypes = Array.isArray(saved.placedTypes) ? saved.placedTypes : base.placedTypes;
  const builtTypes = Array.isArray(saved.builtTypes) ? saved.builtTypes : base.builtTypes;
  return { ...base, ...saved, produced, placedTypes, builtTypes };
}

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

/** Number of manual (player-controlled hard-save) slots. */
export const SLOTS = 3;
/**
 * The dedicated autosave slot — a fourth slot the running game continuously writes to, kept apart
 * from the manual slots so autosave can never overwrite a hard save. It is not part of the `SLOTS`
 * count, so every `for (i < SLOTS)` loop (the Save/Load lists, "any save?", clear-all's per-slot
 * sweep) walks only the manual slots and leaves the autosave slot alone. Continue resumes it.
 */
export const AUTOSAVE_SLOT = SLOTS;
const slotKey = (slot: number): string => `little-village-save-v12-slot${slot}`;
/**
 * A slot's display name — the village's own name, typed once on the New Village screen — kept
 * beside the save rather than inside it.
 *
 * The game autosaves over the slot every few seconds, so a name stored in the envelope would have
 * to be read back and re-attached on every one of those writes to survive — and would be lost the
 * moment a save was written by any path that forgot. Beside it, the name is written once at
 * founding and carried onto a slot whenever that village is saved or loaded into it (see
 * `saveToSlot`/`continueGame` in `main.ts`); there is no separate per-slot rename in the UI, so
 * nothing else ever touches this key.
 */
const slotNameKey = (slot: number): string => `little-village-save-v12-slot${slot}-name`;
const LAST_SLOT_KEY = 'little-village-last-slot';
const MIGRATED_KEY = 'little-village-migrated';

/** Longest village name a player can type on the New Village screen. */
export const SLOT_NAME_MAX = 24;

interface SaveEnvelope {
  v: number;
  state: GameState;
}

/**
 * Write `data` to `key`, reclaiming the key's own existing bytes if the store is full.
 *
 * A plain `setItem` over an occupied key can still throw `QuotaExceededError`: the browser measures
 * the write against the whole origin's quota, and a new blob a shade larger than the one it replaces
 * can tip a near-full store over even though the *net* growth is tiny. That is exactly the
 * "overwrite silently fails" the player sees — a manual save over an existing slot, or the autosave
 * over its own previous snapshot, refusing for want of a few bytes it is about to free anyway.
 *
 * So on a failed write we drop the key first (its old bytes are being replaced regardless) and retry
 * once: an overwrite then only has to fit in the space its predecessor already held, which it does
 * by construction for a save of similar size. This is what makes "a save always overwrites the one
 * it replaces" hold even against a full store. The remove is skipped on the first attempt so a write
 * that fits never throws its predecessor away needlessly, and if the retry still fails (a genuinely
 * larger blob with no headroom anywhere) we report it rather than pretend it worked.
 */
function writeSlot(key: string, data: string): boolean {
  try {
    localStorage.setItem(key, data);
    return true;
  } catch {
    // Reclaim this key's space — we are overwriting it — and try once more.
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, data);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Persist a game to a slot (default slot 0) and remember it as the most recently used.
 *
 * Returns whether the write actually happened, so a caller (autosave) can notice storage that has
 * gone full or unavailable and tell the player, rather than silently dropping every save from here
 * on. A structurally unsound state is refused **before** the write, so a transient bug that corrupts
 * the in-memory state can never overwrite a good save on disk with an unloadable one. The write goes
 * through `writeSlot`, so overwriting an existing save (a manual slot, or the rolling autosave slot)
 * reuses that save's own space and does not fail against a near-full store.
 */
export function saveGame(s: GameState, slot = 0): boolean {
  if (!validState(s)) return false;
  let data: string;
  try {
    data = serialize(s);
  } catch {
    return false; // a state that will not even stringify is not writable
  }
  if (!writeSlot(slotKey(slot), data)) return false;
  setLastSlot(slot);
  return true;
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
    // Lifetime tallies: layer whatever the save carries onto a fresh full set, so every field is
    // present even on a save written before that field existed (see `mergeStats`). The v13→v14
    // migration seeds one when there is none at all; this backfills any fields added since.
    s.stats = mergeStats(s.stats);
    // Stockpile caps default to "no limits" (an empty table) when absent — the same thing 0 means
    // per key — so a save from before caps existed keeps running everything flat out, unchanged.
    if (!s.limits || typeof s.limits !== 'object') s.limits = {};
    // Keep the id counter ahead of every id already in the save, so the next villager or building
    // spawned after a load can never collide with an existing one (a collision wedges households
    // and logistics, which key off ids). Harmless when the save is already consistent.
    let maxId = 0;
    for (const b of s.buildings) if (b.id > maxId) maxId = b.id;
    for (const c of s.citizens) if (c.id > maxId) maxId = c.id;
    if (typeof s.nextId !== 'number' || s.nextId <= maxId) s.nextId = maxId + 1;
    return s;
  } catch {
    return null;
  }
}

/**
 * Test/debug only: the raw stored envelope bytes for a slot, straight from storage with no
 * migration applied. Paired with `writeRawSlot` so a test can read a real save, downgrade it to an
 * older format, and put it back to exercise the migration path.
 */
export function rawSlot(slot = 0): string | null {
  try {
    return localStorage.getItem(slotKey(slot));
  } catch {
    return null;
  }
}

/** Test/debug only: overwrite a slot's raw stored bytes (e.g. to inject an older-format save). */
export function writeRawSlot(slot: number, raw: string): void {
  try {
    localStorage.setItem(slotKey(slot), raw);
  } catch {
    /* ignore */
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
 * The village name stamped on a slot, or null if none is stamped (the list falls back to "Manual
 * Save N" / "Autosave" then). Trimmed and length-capped on the way in, so a name is either
 * something readable or absent.
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

/**
 * Stamp a slot with a village's name, or clear it back to the default by passing an empty one.
 * Called only from the game (a new village founding, a hard save, a load) — never from a player-
 * facing rename control, which the UI does not offer.
 */
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
    // Clear-all means everything, so the autosave slot goes too (it is outside the SLOTS loop).
    localStorage.removeItem(slotKey(AUTOSAVE_SLOT));
    localStorage.removeItem(slotNameKey(AUTOSAVE_SLOT));
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
