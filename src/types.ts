// Shared types and tunable balance constants for Little Village.

export const TILE = 32; // base pixels per tile at zoom 1

// Map dimensions are mutable so New Game / Load can pick a size. They are exported as `let`
// so importers see the current value through ES-module live bindings — `setMapSize` must run
// before a world is generated or loaded (enforced in newGame / loadGame).
export let MAP_W = 48;
export let MAP_H = 48;

export type MapSize = 'small' | 'large';
/**
 * Map edge length in tiles per size.
 *
 * Two sizes, not three. The old 192-tile map was where per-tick simulation work, not space, ran
 * the show, and it asked the player to choose between three numbers when only two of them played
 * differently — so it is gone and the 144 that used to be Medium is now Large. Both are scaled up
 * by half against the sizes that shipped before the buildings were resized: the footprints are
 * roughly 2.25x the area they were (a 2x2 hut became 3x3, a 3x6 quarry became 8x8), so keeping
 * the old edge lengths would have left a village crowding itself out of a map it used to sit
 * comfortably in.
 */
export const MAP_SIZES: Record<MapSize, number> = { small: 72, large: 144 };

/** Starting difficulty chosen at New Game — governs the opening stockpile and starter houses. */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
export const DIFFICULTY_META: Record<Difficulty, { label: string; desc: string }> = {
  easy: { label: 'Easy', desc: '3 houses and a full stockpile to start' },
  normal: { label: 'Normal', desc: 'No houses, and no wood or stone to build with' },
  // "Half the fuel" was in here once, on a setting that starts with none either way.
  hard: { label: 'Hard', desc: 'No wood or stone, and half the food, tools and coats' },
};
/** Built houses granted at the start on Easy. */
export const EASY_START_HOUSES = 3;

/** Set the active map dimensions. Call before generating or loading a world. */
export function setMapSize(w: number, h: number): void {
  MAP_W = w;
  MAP_H = h;
}

// 'stone' = tall, impassable mountain rock. 'foothill' = the low, buildable rocky band at a
// mountain's base (the only place mines can be built).
export type TileType = 'grass' | 'forest' | 'water' | 'stone' | 'foothill';

export interface Tile {
  type: TileType;
  /** Amount of tree resource on a forest tile (0..1). Regrows slowly. */
  trees: number;
  /** Units of loose stone lying on this tile, harvestable by hand (0 = none). */
  stone?: number;
  /** Units of surface iron ore on this tile, harvestable by hand like loose stone. */
  iron?: number;
}

export type ResourceKind =
  | 'fruit'
  | 'grain'
  | 'corn'
  | 'potato'
  | 'rice'
  | 'barley'
  | 'carrot'
  | 'tomato'
  | 'onion'
  | 'pepper'
  | 'cabbage'
  | 'beans'
  | 'pumpkin'
  | 'apple'
  | 'grapes'
  | 'strawberry'
  | 'melon'
  | 'eggs'
  | 'fish'
  | 'beef'
  | 'venison'
  | 'mutton'
  | 'pork'
  | 'chicken'
  | 'milk'
  | 'wood'
  | 'firewood'
  | 'stone'
  | 'coal'
  | 'iron'
  | 'tools'
  // Steel tools are a *separate* barn good from plain (iron) tools: they last twice as long and
  // work a shade faster (see `STEEL_DURABILITY` / `STEEL_TOOL_PROD`). The HUD folds the two into a
  // single 🛠️ figure — a player watches "do we have tools" — but the barn, the smith and a
  // villager's own kit all keep them apart.
  | 'steeltools'
  | 'leather'
  | 'wool'
  | 'clothing'
  | 'cattle'
  | 'pigs'
  | 'chickens'
  | 'sheep'
  | 'medicine'
  | 'sand'
  | 'glass'
  | 'jewelry'
  | 'gold'
  | 'dye'
  | 'silk'
  // The fine bench's two goods: gold set in glass, and silk taken up in dye. Both are the top of
  // their chain — nothing consumes them but a merchant — and fine clothing doubles as a coat.
  | 'finejewelry'
  | 'fineclothes';

export type Resources = Record<ResourceKind, number>;

/** The distinct food types. A varied diet (more of these in stock) means better health. */
export const FOOD_KINDS: ResourceKind[] = [
  'fruit',
  'grain',
  'corn',
  'potato',
  'rice',
  'barley',
  'carrot',
  'tomato',
  'onion',
  'pepper',
  'cabbage',
  'beans',
  'pumpkin',
  'apple',
  'grapes',
  'strawberry',
  'melon',
  'eggs',
  'fish',
  'beef',
  'venison',
  'mutton',
  'pork',
  'chicken',
  'milk',
];

/**
 * Every resource, in display order — the list the barn sheet, the trade screen and the stockpile
 * panel all walk. Hand-maintained, and *not* derived from `ResourceKind`, so the compiler cannot
 * tell you when it is short: a kind missing from here simply never appears in the game while
 * typechecking perfectly. `tests/newgame.spec.ts` asserts it against `RESOURCE_ICON`, which is a
 * `Record<ResourceKind, …>` and therefore exhaustive by construction.
 */
export const RESOURCE_KINDS: ResourceKind[] = [
  'fruit',
  'grain',
  'corn',
  'potato',
  'rice',
  'barley',
  'carrot',
  'tomato',
  'onion',
  'pepper',
  'cabbage',
  'beans',
  'pumpkin',
  'apple',
  'grapes',
  'strawberry',
  'melon',
  'eggs',
  'fish',
  'beef',
  'venison',
  'mutton',
  'pork',
  'chicken',
  'milk',
  'wood',
  'firewood',
  'stone',
  'coal',
  'iron',
  'tools',
  'steeltools',
  'leather',
  'wool',
  'clothing',
  'cattle',
  'pigs',
  'sheep',
  'chickens',
  'medicine',
  'sand',
  'glass',
  'jewelry',
  'gold',
  'dye',
  'silk',
  'finejewelry',
  'fineclothes',
];

/**
 * Resources shown as their own HUD chip, in display order. The food types are aggregated into a
 * single 🍽️ chip that the HUD renders ahead of these.
 *
 * This is a deliberate short list, not "every non-food resource": a chip per kind overflowed the
 * top line on a phone. Intermediate goods (leather) and the livestock herds (cattle/pigs/chickens)
 * are left off — they are still readable in any barn's inspect sheet and in the trading post.
 */
export const HUD_RESOURCES: ResourceKind[] = [
  'wood',
  'stone',
  'iron',
  'coal',
  'tools',
  'clothing',
  'medicine',
  'firewood',
];

/**
 * The resources row, in HUD display order — the 🍽️ food total leads, then these. This is a fixed,
 * deliberately short list (not "every resource"): the building materials and personal necessities a
 * village watches constantly. Everything else (processed intermediates, livestock, luxuries) is left
 * off the top line entirely — still readable in any barn's inspect sheet, the trading post, and the
 * stockpile limits panel — so the HUD stays a glance, not a ledger.
 */
export const HUD_CORE: ResourceKind[] = ['wood', 'stone', 'iron', 'firewood', 'tools', 'clothing', 'medicine'];

/** Icon for the combined food total shown in the HUD. */
export const FOOD_ICON = '🍽️';

export const RESOURCE_ICON: Record<ResourceKind, string> = {
  fruit: '🍎',
  grain: '🌾',
  corn: '🌽',
  potato: '🥔',
  rice: '🍚',
  barley: '🌿',
  carrot: '🥕',
  tomato: '🍅',
  onion: '🧅',
  pepper: '🌶️',
  cabbage: '🥬',
  beans: '🫘',
  pumpkin: '🎃',
  apple: '🍏',
  grapes: '🍇',
  strawberry: '🍓',
  melon: '🍈',
  eggs: '🥚',
  fish: '🐟',
  beef: '🍖',
  venison: '🦌',
  mutton: '🥩',
  pork: '🥓',
  chicken: '🍗',
  milk: '🥛',
  wood: '🪵',
  firewood: '🔥',
  stone: '🪨',
  coal: '⚫',
  iron: '🔩',
  tools: '🛠️',
  steeltools: '⚒️',
  leather: '🟫',
  wool: '🧶',
  clothing: '🧥',
  cattle: '🐄',
  pigs: '🐖',
  chickens: '🐔',
  sheep: '🐑',
  medicine: '💊',
  sand: '⏳', glass: '🔷', jewelry: '💍', gold: '🪙', dye: '🎨', silk: '🧣',
  finejewelry: '👑', fineclothes: '👗',
};

/** Non-food resources that show a red "low" warning in the HUD (survival-critical). */
export const SURVIVAL_RESOURCES: ResourceKind[] = ['firewood', 'clothing'];

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

/**
 * Where the current season has got to, in thirds. Seasons run ten real minutes, long enough that
 * "Autumn" alone doesn't tell the player whether they have time to stock up before winter — so the
 * HUD reads Early Autumn → Autumn → Late Autumn.
 */
export type SeasonPhase = 'early' | 'mid' | 'late';

export function seasonPhaseOf(seasonTimer: number): SeasonPhase {
  const t = seasonTimer / SEASON_LENGTH;
  return t < 1 / 3 ? 'early' : t < 2 / 3 ? 'mid' : 'late';
}

/** Display name for the current moment in the year, e.g. `Late Autumn` (mid-season is unqualified). */
export function seasonLabel(s: { season: number; seasonTimer: number }): string {
  const name = SEASONS[s.season];
  const phase = seasonPhaseOf(s.seasonTimer);
  if (phase === 'early') return `Early ${name}`;
  if (phase === 'late') return `Late ${name}`;
  return name;
}

import type { VillageTier } from './game/tiers';

export type BuildingType =
  | 'house'
  | 'stonehouse'
  | 'shelter'
  | 'grandhouse'
  | 'university'
  | 'port'
  | 'cathedral'
  | 'luxury'
  | 'monument'
  | 'tavern'
  | 'chapel'
  | 'townhall'
  | 'cemetery'
  | 'gatherer'
  | 'farm'
  | 'fishing'
  | 'hunting'
  | 'ranch'
  | 'lumberyard'
  | 'woodcutter'
  | 'quarry'
  | 'mine'
  | 'blacksmith'
  | 'tailor'
  | 'trading'
  | 'school'
  | 'herbalist'
  | 'hospital'
  | 'well'
  | 'market'
  | 'barn';

export type MineOutput = 'coal' | 'iron';
export type SmithRecipe = 'iron' | 'steel';
/** What a tailor sews from: hides off the cattle and the hunt, or fleece off a sheep pen. */
export type TailorRecipe = 'leather' | 'wool';
/**
 * What bench the luxury workshop is running.
 *
 * Left open on purpose: the chain is meant to grow — fine jewellery, fine clothing, furniture —
 * and each of those is another member of this union and another arm of `converterInputs`, not a
 * new building or a new system.
 */
export type LuxuryRecipe = 'glass' | 'jewelry' | 'finejewelry' | 'fineclothes';

/**
 * What a farm grows. There are 16 varieties, each harvesting into its own food resource for
 * dietary variety. A crop can only be planted once the village owns its seed (see `GameState.seeds`)
 * — seeds are one-time unlocks bought from merchants (Easy starts with one random seed).
 */
export type Crop =
  | 'wheat'
  | 'corn'
  | 'potato'
  | 'rice'
  | 'barley'
  | 'carrot'
  | 'tomato'
  | 'onion'
  | 'pepper'
  | 'cabbage'
  | 'beans'
  | 'pumpkin'
  | 'apple'
  | 'grapes'
  | 'strawberry'
  | 'melon';
export const CROPS: Crop[] = [
  'wheat', 'corn', 'potato', 'rice', 'barley', 'carrot', 'tomato', 'onion',
  'pepper', 'cabbage', 'beans', 'pumpkin', 'apple', 'grapes', 'strawberry', 'melon',
];
export const CROP_META: Record<Crop, { label: string; emoji: string; food: ResourceKind; yieldMult: number }> = {
  wheat: { label: 'Wheat', emoji: '🌾', food: 'grain', yieldMult: 1 },
  corn: { label: 'Corn', emoji: '🌽', food: 'corn', yieldMult: 1 },
  potato: { label: 'Potato', emoji: '🥔', food: 'potato', yieldMult: 1.1 },
  rice: { label: 'Rice', emoji: '🍚', food: 'rice', yieldMult: 1 },
  barley: { label: 'Barley', emoji: '🌿', food: 'barley', yieldMult: 1 },
  carrot: { label: 'Carrot', emoji: '🥕', food: 'carrot', yieldMult: 1 },
  tomato: { label: 'Tomato', emoji: '🍅', food: 'tomato', yieldMult: 0.95 },
  onion: { label: 'Onion', emoji: '🧅', food: 'onion', yieldMult: 1 },
  pepper: { label: 'Pepper', emoji: '🌶️', food: 'pepper', yieldMult: 0.9 },
  cabbage: { label: 'Cabbage', emoji: '🥬', food: 'cabbage', yieldMult: 1 },
  beans: { label: 'Beans', emoji: '🫘', food: 'beans', yieldMult: 1 },
  pumpkin: { label: 'Pumpkin', emoji: '🎃', food: 'pumpkin', yieldMult: 1.1 },
  apple: { label: 'Apple', emoji: '🍏', food: 'apple', yieldMult: 0.85 },
  grapes: { label: 'Grapes', emoji: '🍇', food: 'grapes', yieldMult: 0.85 },
  strawberry: { label: 'Strawberry', emoji: '🍓', food: 'strawberry', yieldMult: 0.8 },
  melon: { label: 'Melon', emoji: '🍈', food: 'melon', yieldMult: 0.85 },
};

/** Trade value a merchant charges to sell a crop's seed (a permanent one-time unlock). */
export const SEED_COST = 30;
/** Distinct foods in stock that earn the full diet-variety health bonus (it saturates here). */
export const DIET_VARIETY_TARGET = 5;

/** What a ranch raises. Each animal has its own herd (a tradeable resource) and product mix. */
export type RanchAnimal = 'cattle' | 'pigs' | 'sheep' | 'chickens';
export const RANCH_ANIMALS: RanchAnimal[] = ['cattle', 'pigs', 'sheep', 'chickens'];
/**
 * What a herd gives, split by whether the animal has to die for it.
 *
 * `products` is the standing yield — what a rancher collects from living animals on an ordinary
 * work cycle, every season of the year: a fleece is shorn, a cow is milked, a hen is robbed of her
 * eggs. `butchered` is what the knife gets, and defaults to `products` when a herd makes no
 * distinction. Sheep are the reason the split exists: shearing does not kill a sheep, so a flock
 * clothes the village indefinitely without losing a head, and mutton only ever comes off one that
 * was culled or born past the pen's cap.
 */
export interface AnimalProduct {
  kind: ResourceKind;
  chance: number;
  mult: number;
}
export const ANIMAL_META: Record<
  RanchAnimal,
  {
    label: string; emoji: string; ideal: number; growth: number;
    products: AnimalProduct[];
    butchered?: AnimalProduct[];
  }
> = {
  // `chance` weights are cumulative-rolled; `mult` scales that product's load.
  //
  // Read each herd as a pair: what it gives while it is alive, and what it gives when it is not.
  // Hide is only ever the second kind — a skin comes off a carcass, so no pen produces leather
  // without something dying in it. What dies is usually not a decision: a pen at its cap keeps
  // breeding, and every birth with nowhere to go goes straight to the butcher (see `endSeason`),
  // so a full pen is a standing supply of meat and hide without the player culling anything.
  cattle: { label: 'Cattle', emoji: '🐄', ideal: 8, growth: 0.12,
    products: [{ kind: 'milk', chance: 1, mult: 1 }],
    // The big animal, and the one worth keeping for its hide: more leather per head than a pig.
    butchered: [{ kind: 'leather', chance: 0.5, mult: 1.4 }, { kind: 'beef', chance: 0.5, mult: 1 }] },
  // Pigs give nothing until they are killed — no milk, no fleece, no eggs. A pig pen is a meat
  // pen, and it pays out of the overflow rather than out of a daily round.
  pigs: { label: 'Pigs', emoji: '🐖', ideal: 8, growth: 0.18,
    products: [],
    butchered: [{ kind: 'pork', chance: 0.7, mult: 1.15 }, { kind: 'leather', chance: 0.3, mult: 0.7 }] },
  // The only herd whose standing yield and butcher's yield are different things. A sheep is shorn
  // and walks away, so wool comes in all year off the same animals; the pen turns into mutton only
  // when it is culled or breeds past its cap.
  sheep: { label: 'Sheep', emoji: '🐑', ideal: 10, growth: 0.15,
    products: [{ kind: 'wool', chance: 1, mult: 1 }],
    butchered: [{ kind: 'mutton', chance: 1, mult: 1 }] },
  chickens: { label: 'Chickens', emoji: '🐔', ideal: 12, growth: 0.25,
    products: [{ kind: 'eggs', chance: 1, mult: 1 }],
    butchered: [{ kind: 'chicken', chance: 1, mult: 0.6 }] },
};
// ---- Ranch sizing & husbandry (all customizable) ----
/** A pen is a square (or rectangle) between these tile dimensions, chosen at placement. */
export const RANCH_MIN = 4;
export const RANCH_MAX = 8;
/** Tiles each head of livestock needs — bigger animals need more room, so fewer fit a pen. */
export const ANIMAL_TILES: Record<RanchAnimal, number> = { cattle: 3, pigs: 2, sheep: 2, chickens: 1 };
/** Baseline births per season for a breeding herd. 0.55 × 2 ≥ 1 ⇒ the "≥1 per 2 seasons" floor. */
export const RANCH_BREED_PER_SEASON = 0.55;
/** Chance, each season, of one extra birth on top of the baseline. */
export const RANCH_BREED_BONUS_CHANCE = 0.2;
/** A herd must reach this size before Split is offered (moving half to another ranch). */
export const RANCH_SPLIT_MIN = 10;
/** Resource units produced per head sent to slaughter (culls + births over the cap). */
export const SLAUGHTER_YIELD = 3;
/**
 * Rancher-seconds of work to slaughter and dress one head, *per tile the animal occupies*. A cull
 * isn't free: the rancher has to catch, kill and butcher each beast, and a bigger animal is more
 * of all three — so the cost scales with the animal's size (`ANIMAL_TILES`). At this rate a chicken
 * (1 tile) is a few seconds' work and a cow (3) the best part of a full work-cycle, so pulling a
 * pen's limit down thins the herd steadily rather than all at once. See `cullOverCap`.
 */
export const CULL_WORK_PER_TILE = 6;

/** Rancher-seconds of work to cull one head from this pen, scaled by the animal's size. */
export function cullWorkPerHead(b: Building): number {
  return CULL_WORK_PER_TILE * ANIMAL_TILES[b.animal ?? 'cattle'];
}

/** Max head a ranch can hold, from its footprint and the animal's size. */
export function ranchCapacity(b: Building): number {
  const animal = b.animal ?? 'cattle';
  return Math.floor((footprintW(b) * footprintH(b)) / ANIMAL_TILES[animal]);
}

// ---- Player-sizable buildings (drag/step the footprint before building) ----
/** Building types whose footprint the player sets at placement, and the tile bounds allowed. */
export const SIZABLE: Partial<Record<BuildingType, { min: number; max: number }>> = {
  ranch: { min: RANCH_MIN, max: RANCH_MAX },
  farm: { min: RANCH_MIN, max: RANCH_MAX },
};

/**
 * What a building costs at the size it is actually being built.
 *
 * Fields and pens are dragged out between 4x4 and 8x8, and their yield already scales with the
 * area — a field four times the size reaps four times the harvest. The price did not, so the
 * biggest field cost exactly what the smallest did and there was no reason on earth to build a
 * small one. Fence and furrow scale with the ground they cover, so the cost does too.
 *
 * Everything else has one size and is returned unchanged.
 */
export function buildCost(
  type: BuildingType,
  w?: number,
  h?: number,
): Partial<Record<ResourceKind, number>> {
  const def = BUILDING_DEFS[type];
  if (!SIZABLE[type] || w === undefined || h === undefined) return { ...def.cost };
  const factor = (w * h) / (def.w * def.h);
  if (factor === 1) return { ...def.cost };
  const out: Partial<Record<ResourceKind, number>> = {};
  for (const k of Object.keys(def.cost) as ResourceKind[]) {
    // Rounded up: a bigger field should never come out cheaper per tile through rounding.
    out[k] = Math.ceil((def.cost[k] ?? 0) * factor);
  }
  return out;
}

/** What this building cost to raise, at the size it was actually raised. */
export function costOf(b: Placed): Partial<Record<ResourceKind, number>> {
  return buildCost(b.type, footprintW(b), footprintH(b));
}

// ---- Farming ----
/** Baseline field area (a 4×4 field) that `FARM_FOOD_PER_WORKER` is tuned against; harvest scales
 * with `footprint / FARM_BASE_AREA`, so a bigger field yields proportionally more. */
export const FARM_BASE_AREA = RANCH_MIN * RANCH_MIN;

/**
 * Per-crop visual design. Groundwork for differentiating what's growing in a field: each crop has a
 * distinct `color` and a reserved `model` slot for future art. Renderers read this via the design
 * hook; today they draw a generic field, so this is scaffolding for when real crop designs land.
 */
export interface CropDesign {
  /** Distinct tint for this crop (hex). Used by future per-crop field rendering. */
  color: number;
  /** Reserved: key of a future crop model/sprite set. Undefined ⇒ generic field. */
  model?: string;
}
export const CROP_DESIGN: Record<Crop, CropDesign> = {
  wheat: { color: 0xd8c15a },
  corn: { color: 0xf2cf4a },
  potato: { color: 0xc99a5e },
  rice: { color: 0xefe9d6 },
  barley: { color: 0xd8c98a },
  carrot: { color: 0xe0913a },
  tomato: { color: 0xd6483c },
  onion: { color: 0xc9a9d0 },
  pepper: { color: 0xd43f34 },
  cabbage: { color: 0x7fb05a },
  beans: { color: 0xa5794a },
  pumpkin: { color: 0xe08a34 },
  apple: { color: 0x8fc04a },
  grapes: { color: 0x8a5ac0 },
  strawberry: { color: 0xe0455a },
  melon: { color: 0x8fce6a },
};

/** The design for a crop (or a neutral fallback when a field has no crop). */
export function cropDesign(crop: Crop | undefined): CropDesign {
  return crop ? CROP_DESIGN[crop] : { color: 0x8a6a3c };
}

export type BuildCategory = 'housing' | 'food' | 'resources' | 'civic' | 'trade';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  emoji: string;
  category: BuildCategory;
  w: number;
  h: number;
  /** Resources spent to place it. */
  cost: Partial<Record<ResourceKind, number>>;
  /** Max workers this building employs (0 = no jobs, e.g. house/barn). */
  jobs: number;
  /**
   * Builder-work to finish construction, in work units — not seconds.
   *
   * A builder lays down `BUILD_WORK_RATE` of these per second while stood at the site, and can
   * only lay down `BUILDER_SHIFT_WORK` of them before knocking off (see `BUILDER_SHIFT_WORK`), so
   * this is the honest measure of how big a job a building is: a well is a morning's work and a
   * mine is a season's.
   */
  work: number;
  /**
   * Builders the village asks for while this is going up. Falls back to a guess from the footprint
   * (`buildersWantedFor`) when a building does not name one.
   */
  builders?: number;
  /** At least one border tile must be one of these types (terrain gating). */
  requiresAdjacent?: TileType[];
  /** At least one footprint tile must be one of these types (e.g. mines touch a foothill). */
  requiresTileAny?: TileType[];
  /**
   * The **back half** of the footprint — the rows at the far end, away from the door — must sit on
   * this terrain. A mine is cut *into* the hillside: its working face is dug back into a mountain's
   * foothills while its mouth opens onto level ground for the carts, so it is not enough for a
   * corner to clip the rock — the back of it has to be buried in the slope.
   */
  requiresBackHalf?: TileType;
  /**
   * Fraction of the footprint that must sit on water (a dock — e.g. the trading post reaches out
   * over the water for boats). The rest of the footprint must be on buildable land.
   */
  requiresWaterFraction?: number;
  /**
   * Rows at the **far end** — the end away from the door — that must be standing in water.
   *
   * `requiresWaterFraction` only counts water anywhere under the footprint, which lets a jetty be
   * built with the water off to one side and the dock itself high and dry. This says where the
   * water has to be: at the business end. The near rows still have to be land, so the building
   * always straddles a shoreline with its dock out over the water and its door back on the bank.
   */
  dockDepth?: number;
  /** Radius (tiles) of the circular work area, for forest-worked buildings. */
  workRadius?: number;
  /** Immune to fire — never ignites and fire never spreads to it (wells, stone-built barns). */
  fireproof?: boolean;
  /**
   * Doors, when one is not enough. A barn has big doors at both gable ends: the whole village
   * carries things in and out of it all day, and a single door meant every load queued at the
   * same corner of the plot however the building was turned. Two means a villager walks to
   * whichever end is nearer.
   */
  doors?: 2;
  desc: string;
}

/** Whether a building type can catch fire — fireproof types (wells, barns) never burn. */
export function isFireproof(type: BuildingType): boolean {
  return BUILDING_DEFS[type].fireproof === true;
}

/**
 * True while a building cannot work or house anyone — BURNING or DAMAGED. It stays `built` (and
 * so still stands, still blocks movement) either way; this is the one flag every occupancy/output
 * gate needs to add on top of the usual `b.built` check. See `staffWanted`, and the houses/shelters
 * filters in `assignHomesAndJobs`.
 */
export function disabledByFire(b: Building): boolean {
  return !!b.fireTimer || !!b.damaged;
}

/** Whether this type employs villagers, and so gets a name of its own and a job-board entry. */
export function isWorkplace(type: BuildingType): boolean {
  return BUILDING_DEFS[type].jobs > 0;
}

/** A building's display name: the player's, or its type name if it never got one. */
export function buildingName(b: Building): string {
  return b.name ?? BUILDING_DEFS[b.type].name;
}

/**
 * The next free name for a new building of `type` — "Fishing Hut 1", "Fishing Hut 2", and so on.
 * Picks the lowest unused index rather than counting existing buildings, so demolishing #1 and
 * building again reuses that number instead of climbing forever.
 */
export function nextBuildingName(existing: Building[], type: BuildingType): string {
  const base = BUILDING_DEFS[type].name;
  const taken = new Set(existing.filter((b) => b.type === type).map((b) => b.name));
  for (let n = 1; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface Building {
  id: number;
  type: BuildingType;
  /**
   * Player-facing name. Workplaces get one automatically at placement — "Fishing Hut 1", then
   * "Fishing Hut 2" — and the player can rename them, so a job board full of identical entries
   * becomes a list you can actually tell apart. Absent for buildings with no jobs.
   */
  name?: string;
  x: number; // top-left tile
  y: number;
  built: boolean;
  progress: number; // builder-work laid down so far, 0..buildWorkOf(type)
  workers: number[]; // citizen ids currently working here
  /** Player-set target number of workers (0..jobs). */
  desiredWorkers: number;
  /** Accumulated field growth for farms (0..1). */
  growth: number;
  /** Mine: whether it digs coal or iron. */
  output: MineOutput;
  /** Blacksmith: iron tools or steel tools. */
  /**
   * Which recipe a converter is set to. One field, two buildings: a blacksmith reads it as
   * `SmithRecipe`, a tailor as `TailorRecipe`. They never share a building, so they never
   * disagree about what the value means.
   */
  recipe: SmithRecipe | TailorRecipe | LuxuryRecipe;
  /**
   * Local inventory. Barn: its stock (cap BARN_CAPACITY). Producer: input/output
   * buffer. Construction site (built=false): materials delivered so far.
   */
  store: Partial<Record<ResourceKind, number>>;
  /**
   * Seconds of fire remaining while the building is BURNING (undefined = not on fire). A burning
   * building stays `built` and standing — it is a wall, not a hole — but is not `disabledByFire`'s
   * business alone: everything that gates on occupancy/output also checks this. See `processFires`.
   */
  fireTimer?: number;
  /**
   * Water deliveries landed on this fire so far, against `FIRE_DOUSE_TRIPS_NEEDED` — see
   * `runFirefighter`/`processFires`. Reset to `undefined` the moment the fire resolves either way;
   * meaningless while `fireTimer` is unset.
   */
  fireWater?: number;
  /**
   * DAMAGED: the building survived a fire (`fireTimer` ran out and it was not destroyed) but
   * cannot function until repaired. Builders repair it exactly as they raise a new site — see
   * `repairCostOf`/`repairWorkOf` — except the materials land in `repairStore`, not `store`, so a
   * partly-repaired workshop's leftover production stock is never mistaken for delivered repairs.
   */
  damaged?: boolean;
  /** Builder-work laid toward a repair so far, 0..`repairWorkOf(type)`. Meaningless unless `damaged`. */
  repairProgress?: number;
  /** Materials builders have delivered toward the current repair, against `repairCostOf`. */
  repairStore?: Partial<Record<ResourceKind, number>>;
  /**
   * Marked for demolition: builders will come and pull it down. It keeps working — housing its
   * residents, employing its workers — right up until it is actually razed, so marking a mistake
   * costs nothing until somebody swings a hammer.
   */
  demolish?: boolean;
  /** Seconds of tearing-down done, against `demoTimeOf(type)`. */
  demoProgress?: number;
  /**
   * The structure is down and what is left is a rubble pile: whatever it held plus the salvage off
   * its frame, sitting in `store` waiting for a builder to cart it to a barn. `built` is false, so
   * it is no longer a workplace, a home or a warehouse — but it is not a construction site either,
   * and every loop that walks unbuilt buildings has to say which of the two it means.
   */
  razed?: boolean;
  /**
   * What to raise on this spot once the rubble is gone. Set by an upgrade (a house becoming a
   * stone house): the old building is razed and carted off like any other, and then instead of the
   * plot going empty it becomes a construction site for this type.
   */
  upgradeTo?: BuildingType;
  /** Forester: plant saplings on grass in the work circle to grow a renewable forest. */
  replant?: boolean;
  /** Farm: which crop it grows (defaults to wheat). */
  crop?: Crop;
  /** Ranch: which animal it raises (defaults to cattle). */
  animal?: RanchAnimal;
  /**
   * Custom footprint (ranch only): the player-chosen pen size, 4..8. Undefined for every
   * other building, which keeps its fixed `BUILDING_DEFS` size. Read via `footprintW/H`.
   */
  w?: number;
  h?: number;
  /**
   * Quarter turns clockwise, 0..3, chosen at placement. A quarter turn swaps the footprint's
   * width and height and moves the door to the next face round — see `footprintW` and
   * `entranceTile`. Undefined means "as built", facing south.
   */
  rot?: 0 | 1 | 2 | 3;
  /** Ranch: head of livestock currently penned here. */
  animals?: number;
  /** Ranch: player-set cap on the herd (0..ranchCapacity). */
  maxAnimals?: number;
  /** Ranch: fractional accumulator toward the next birth (see breeding). */
  breedProgress?: number;
  /**
   * Ranch: rancher-seconds of slaughter work banked toward the next cull. When the herd stands
   * over `maxAnimals` (the player pulled the limit slider down) the rancher thins it by hand, one
   * head at a time; this is how far into the current kill they are. Zeroed whenever the pen is
   * back within its limit, so a part-done kill never carries over to a herd that is no longer over.
   */
  cullProgress?: number;
  /**
   * Trading post: player-set stock targets (resource -> desired units). The assigned
   * trader hauls goods from the barns up to these levels and returns any surplus.
   */
  orders?: Partial<Record<ResourceKind, number>>;
  /**
   * Whether the player wants this workplace operating. `false` is a deliberate shutdown: its
   * workers are let go to labour elsewhere and it produces nothing, but its `desiredWorkers` is
   * kept so flipping it back on restores the old staffing. Undefined/true means running as normal.
   *
   * This is a *different state* from unstaffed. An unstaffed building is enabled but short of hands;
   * a disabled one is switched off on purpose and asks for none. Only `staffWanted` reads it, so the
   * whole job system treats a disabled building as one that wants zero workers this moment — no
   * second workforce, just a gate on the one that already exists.
   */
  enabled?: boolean;
}

/** What a villager is doing right now in the logistics loop. */
export type TaskKind =
  | 'idle'
  | 'toFetch' // walking to a barn to pick up an input/material
  | 'toDeliver' // carrying a material to a construction site or workplace
  | 'toWork' // walking to the work area / workplace
  | 'work' // producing into `carry`
  | 'toDrop' // carrying output to a barn
  | 'build' // laboring at a construction site
  | 'toPath' // walking to a planned path tile
  | 'toLarder' // carrying household supplies home to stock the larder
  | 'toHouse' // a market vendor carrying groceries out to a household in the circle
  | 'wander';

export interface CitizenTask {
  kind: TaskKind;
  resource?: ResourceKind;
  targetId?: number; // building id
  ptx?: number; // path/target tile
  pty?: number;
}

export type Sex = 'm' | 'f';

export interface Citizen {
  id: number;
  /** Given name, assigned at birth/arrival (by sex). */
  name: string;
  x: number; // world position in tile units (float)
  y: number;
  tx: number; // current move target
  ty: number;
  homeId: number | null;
  /** Building this villager works at; null means a builder/laborer. */
  jobId: number | null;
  /** What this villager is carrying (single kind at a time). */
  carry: { kind: ResourceKind; amount: number } | null;
  /**
   * Output a worker has accumulated at their workplace but not yet picked up.
   *
   * One work cycle produces well under a full load, so without this a worker set off for the
   * barn after every cycle and spent most of the day walking. Work continues until `pending`
   * reaches a full load and it becomes a `carry`. Transient — not saved, so a reload costs a
   * villager at most one partial load.
   */
  pending?: { kind: ResourceKind; amount: number } | null;
  task: CitizenTask;
  timer: number; // seconds remaining in current work action
  sex: Sex;
  age: number; // years
  /**
   * The villager this one has paired with, or null/undefined if single. A couple is the core of a
   * household: they share a house, they are the only adults in it wherever housing allows, and only
   * a couple bears children. Partnerships are mutual — both citizens point at each other — and are
   * dissolved when one of them dies (`releaseLostPartners`).
   */
  partnerId?: number | null;
  /** Ids of the two villagers whose household this one was born into. Absent for founders/nomads. */
  parents?: [number, number];
  /**
   * Children this villager (as a mother) has borne, capped at `MAX_CHILDREN_PER_COUPLE`.
   *
   * Set on the woman of a couple, because she is in one household at a time and it is her count that
   * bounds a couple's family — a widow who re-partners does not get a fresh allowance. It drives the
   * declining per-child birth odds (`BIRTH_PARITY_FACTOR`) and the hard cap. Absent (treated as 0)
   * on founders, men, and any citizen from a save written before this existed.
   */
  childrenBorne?: number;
  health: number; // 0..100
  happiness: number; // 0..100
  educated: boolean; // attended school in the year before coming of age -> more productive
  /** Went on to university after school — more productive again, and longer-lived. */
  graduate?: boolean;
  /**
   * Sitting the university year right now: grown by every measure except that they are not working
   * yet, the same way `student` holds a school-age child out of the workforce for their last year.
   */
  undergrad?: boolean;
  /** Enrolled at a staffed school for the final year of childhood. Cleared on coming of age. */
  student?: boolean;
  /**
   * Seconds of schooling actually attended, accumulated while enrolled.
   *
   * Ageing is continuous, so "did they go to school?" can no longer be a snapshot taken at the
   * year boundary — that would let a school staffed for one tick educate a whole cohort, and a
   * school that lost its teacher an hour before a child's birthday un-educate one who had
   * attended all year. Time in class is counted instead, and `SCHOOL_ATTENDANCE` is how much of
   * the school year has to be sat.
   */
  schooling?: number;
  sick: boolean; // ill from a disease outbreak; can't work until recovered
  /** Seconds of leisure remaining; while > 0 the villager is on a break, not working. */
  rest?: number;
  /**
   * The tile in their work circle this villager is working this cycle — the tree they are felling,
   * the rock they are clearing, the patch they are foraging. Held across ticks so they walk to one
   * place and stay there rather than re-picking a destination every frame, and cleared when the
   * cycle finishes so the next one takes them somewhere new.
   */
  workAt?: { x: number; y: number };
  /**
   * Inside their workplace. Set while an indoor trade is actually working (see `worksIndoors`);
   * the renderer draws nobody who is indoors, so a smith at his anvil is out of sight rather than
   * loitering on the doorstep. Transient — never saved, recomputed as they work.
   */
  inside?: boolean;
  /**
   * Got a clothing ration at the last season turnover. Transient — recomputed each season in
   * `endSeason`, never saved. A clothed villager burns less firewood; an unclothed one risks
   * falling ill in winter.
   */
  clothed?: boolean;
  /**
   * The tool this villager is actually holding — `undefined` means bare hands. Unlike clothing
   * (a season's ration, billed and forgotten), a tool is a real, persistent item: this villager
   * keeps working with it, at the tier it names (`citizenToolFactor`), until it wears out
   * (`wearCitizenTool`) or they never had one to begin with. Saved like any other belonging, so a
   * reload doesn't strip a village of tools it had already handed out.
   */
  tool?: 'iron' | 'steel';
  /**
   * Wear accumulated on the tool this villager currently holds, in worker-seasons — see
   * `TOOL_WEAR_PER_CYCLE` / `TOOL_WEAR_PER_BUILD_WORK`. Reset to 0 whenever a new tool is picked
   * up; the tool breaks (and this resets again) once it reaches the tier's durability
   * (`STEEL_DURABILITY` for steel, 1 worker-season for iron). Meaningless while `tool` is unset.
   */
  toolWear?: number;
  /**
   * Seconds this villager has gone unfed. Death comes at STARVE_SECONDS, so a short gap while a
   * hauler restocks the larder is survivable. Transient — not saved.
   */
  starve?: number;
  /**
   * Seconds this villager has gone unheated in winter. Death comes at FREEZE_SECONDS, the same
   * grace the starvation clock gives. Only winter accumulates it. Transient — not saved.
   */
  chill?: number;
  /** Assigned to the Builders job this tick (recomputed every tick, not persisted). A builder has
   * jobId === null but constructs work buildings; a plain laborer (jobId null, builder false) does
   * not. */
  builder?: boolean;
  /**
   * Builder-work laid down in the current shift, against `BUILDER_SHIFT_WORK`.
   *
   * Only construction and demolition fill this — swinging a hammer, not carrying for one. A
   * builder who has run out of shift can still fetch materials to the site, which is what keeps a
   * half-rested crew from leaving a site with nothing delivered.
   */
  effort?: number;
  /**
   * Filled a bucket at a well and is walking it to a fire — see `runFirefighter`. `false`/absent
   * means the next thing a free adult responding to a fire does is walk to the well, not the fire.
   */
  waterLoad?: boolean;
  // ---- transient navigation state (not persisted; recomputed after load) ----
  route?: { x: number; y: number }[]; // cached A* waypoints toward the current destination
  routeI?: number; // index of the next waypoint to reach
  rdx?: number; // destination tile the cached route was computed for
  rdy?: number;
}

/** Children can't work; they take a housing slot and grow up at ADULT_AGE. */
export function isAdult(c: { age: number; student?: boolean; undergrad?: boolean }): boolean {
  // A student is old enough to work and does not: schooling buys one more year of childhood, so
  // between 12 and 16 an enrolled child is over `ADULT_AGE` and still not a worker. Every caller
  // asking "is this one of the workforce" needs that exclusion — before schooling could outlast
  // `ADULT_AGE`, being under it was the whole test.
  //
  // An undergraduate is the same bargain a year further on: sitting the university year rather
  // than working, and not yet keeping a house or starting a family either.
  return c.age >= ADULT_AGE && !c.student && !c.undergrad;
}

/**
 * A child currently *enrolled* — in its last year before working age, with a staffed school to
 * attend. Not an age band: a village with no school (or no teacher in it) has no students at all,
 * and its children go straight from child to adult.
 *
 * Students are still children mechanically — they can't work and they eat a child's ration. The
 * count exists to answer one question at a glance: how much of the next generation is being
 * schooled and about to join the workforce.
 */
export function isStudent(c: { age: number; student?: boolean }): boolean {
  return !!c.student && c.age < SCHOOL_LEAVING_AGE;
}

/** A child who is not enrolled — too young, or with no school to go to. */
export function isInfant(c: { age: number; student?: boolean }): boolean {
  return c.age < ADULT_AGE && !isStudent(c);
}

/** Whether a villager is inside the fertile age window and can father/bear a child. */
export function isFertile(c: { age: number }): boolean {
  return c.age >= FERTILE_MIN_AGE && c.age <= FERTILE_MAX_AGE;
}

/**
 * A *home*: somewhere a household lives. Plain and stone houses.
 *
 * Deliberately not the shelter. A home is where couples form and children are born, and the
 * shelter is a boarding house — eighteen bunks in one building would otherwise pair off strangers
 * wholesale and out-breed five houses at once, which would make it the only housing worth ever
 * building. Everything that is about *a roof and a hearth* rather than about a family asks
 * `isDwelling` instead.
 */
export function isHouse(type: BuildingType): boolean {
  return type === 'house' || type === 'stonehouse' || type === 'grandhouse';
}

/**
 * The housing ladder: each home rebuilds in place as the next one up — house → stone house → grand
 * house. A grand house is the top rung and has nothing above it; the shelter is a boarding house,
 * not a home, and is not on the ladder at all.
 *
 * This is only *which* type is next, not *whether* the village may build it yet. The rung a home
 * can climb to is gated by the settlement tier exactly as putting that type up new is (a settlement
 * cannot leap its houses to stone before it is a hamlet); that gate is `buildingUnlocked`, applied
 * where the upgrade is offered, so housing progression follows the tier like every other building.
 */
export const HOUSE_UPGRADE: Partial<Record<BuildingType, BuildingType>> = {
  house: 'stonehouse',
  stonehouse: 'grandhouse',
};

/** The boarding house: beds for villagers with nowhere else, and nothing more than beds. */
export function isShelter(type: BuildingType): boolean {
  return type === 'shelter';
}

/**
 * Anywhere villagers sleep — homes and the shelter alike.
 *
 * This is the one that governs hearths and larders: everyone who lives somewhere eats there, burns
 * fuel there, and loses their supplies back to the barns if it is pulled down.
 */
export function isDwelling(type: BuildingType): boolean {
  return isHouse(type) || isShelter(type);
}

/** How many villagers a given house type shelters. */
export function houseCapacityOf(type: BuildingType): number {
  if (type === 'stonehouse' || type === 'grandhouse') return STONE_HOUSE_CAPACITY;
  return HOUSING_PER_HOUSE;
}

/**
 * How much winter fuel a household in this kind of home burns, against a timber house.
 *
 * Masonry holds its heat; a grand house is double-skinned and glazed on top of that.
 */
export function heatFactorOf(type: BuildingType): number {
  if (type === 'grandhouse') return GRAND_HOUSE_HEAT_FACTOR;
  if (type === 'stonehouse') return STONE_HOUSE_HEAT_FACTOR;
  return 1;
}

/** How many villagers sleep in a dwelling of this type — beds, whether or not they are homes. */
export function dwellingCapacityOf(type: BuildingType): number {
  return isShelter(type) ? SHELTER_CAPACITY : houseCapacityOf(type);
}

/**
 * How far into construction a site stops being groundworks and starts being a frame.
 *
 * Construction reads in three stages rather than as one see-through silhouette that snaps to a
 * finished building: **site** (the ground opened up, footings laid, materials stacked), **frame**
 * (the building itself rising out of those footings, cut off at whatever height the work has
 * reached), then **done**. The silhouette is kept for the *placement preview* only, where it
 * means "this is what would go here" — which is the one place a transparent building is telling
 * the truth.
 */
export const BUILD_FRAMING_AT = 0.5;

/**
 * Tearing a building down takes this much of the time it took to put up. Pulling a house apart is
 * quicker than raising one, but it is not free — that is the whole point of demolition being a job
 * a builder has to walk to rather than something a menu does instantly.
 */
export const DEMO_WORK_FRACTION = 0.5;

export function demoWorkOf(type: BuildingType): number {
  return buildWorkOf(type) * DEMO_WORK_FRACTION;
}

/** How far a teardown has got, 0..1. */
export function demoFraction(b: Building): number {
  const total = demoWorkOf(b.type);
  if (total <= 0) return 1;
  const p = (b.demoProgress ?? 0) / total;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * When a teardown starts showing. Construction spends its first half as bare ground and raises the
 * frame over the second; demolition is the mirror of that, but weighted the other way — the
 * building stands whole while the roof and fittings come off, and then the frame comes down over
 * the long tail. Same three looks, run backwards, on a different clock.
 */
export const DEMO_FRAME_AT = 0.25;

/** Which of the three construction looks a building should be drawn with. */
export type BuildStage = 'site' | 'framing' | 'done';

export function buildStage(b: Building): BuildStage {
  if (b.razed) return 'site'; // rubble waiting to be carted off
  if (b.demolish && b.built) return demoFraction(b) >= DEMO_FRAME_AT ? 'framing' : 'done';
  if (b.built) return 'done';
  const total = buildWorkOf(b.type);
  return total > 0 && b.progress / total >= BUILD_FRAMING_AT ? 'framing' : 'site';
}

/**
 * How far the frame has risen, 0..1, across the framing stage — 0 the moment framing starts and
 * 1 as it finishes. Meaningless outside that stage.
 *
 * A teardown reads the same number the other way: 1 when the frame is still full height, falling
 * to 0 as the last of it comes down.
 */
export function framedFraction(b: Building): number {
  if (b.demolish && b.built) {
    const p = (demoFraction(b) - DEMO_FRAME_AT) / (1 - DEMO_FRAME_AT);
    return 1 - (p < 0 ? 0 : p > 1 ? 1 : p);
  }
  const total = buildWorkOf(b.type);
  if (total <= 0) return 1;
  const p = (b.progress / total - BUILD_FRAMING_AT) / (1 - BUILD_FRAMING_AT);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * How many builders an open construction site asks for.
 *
 * Two for an ordinary building, more for the ones that are genuinely a lot of work — sized off
 * the footprint, which is the honest measure of how much there is to put up. The point is that
 * the wanted count on the Job Board reads as *what the outstanding work needs*: place three
 * cottages and it asks for six, finish one and it drops back to four.
 */
export function buildersWantedFor(type: BuildingType): number {
  const d = BUILDING_DEFS[type];
  // A gang named on the building itself wins. Footprint is a decent guess and was the only rule
  // for a long time, but it says a monument on nine tiles is a two-man job and a port on
  // forty-five needs six, which is backwards: what a site takes is how much *building* there is,
  // not how much ground it covers.
  if (d.builders !== undefined) return d.builders;
  const area = d.w * d.h;
  return area >= 20 ? 4 : area >= 9 ? 3 : 2;
}

/**
 * Builders the village's outstanding work is asking for: construction sites, plus the roads that
 * have been confirmed but not yet laid.
 *
 * Roads count because builders are who lays them when nobody is idle. An employed villager will
 * only detour to a planned tile close to their workplace, so a road drawn across the far side of
 * the map is nobody's job unless somebody is free — and a fully staffed village has nobody free,
 * which left confirmed roads sitting unbuilt for good. One builder gets a road moving; long runs
 * ask for a couple more, and it stops at three so a big road plan cannot empty the workplaces.
 */
export function autoBuilderDemand(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) {
    // Rubble asks for one pair of hands to cart it off; a standing building marked for demolition
    // asks for as many as putting it up would have, and a site for the same again.
    if (b.razed) n += 1;
    else if (b.demolish || !b.built) n += buildersWantedFor(b.type);
  }
  const road = plannedRoadTiles(s);
  if (road > 0) n += Math.min(3, 1 + Math.floor(road / 15));
  return n;
}

/** Buildings of a type that can hold staff: standing or going up, but not rubble. */
export function tradePosts(s: GameState, type: BuildingType): Building[] {
  return s.buildings.filter((b) => b.type === type && !b.razed);
}

/**
 * Villagers put to a trade: what its buildings have been asked for, plus the overflow.
 *
 * This is the number the job board's stepper moves — how many of the village's people are
 * foresters — and it is not bounded by how many posts exist. Ask for four with two places and two
 * of them work as laborers until there is somewhere to put them.
 */
export function tradeStaff(s: GameState, type: BuildingType): number {
  let n = s.tradeExtra?.[type] ?? 0;
  for (const b of tradePosts(s, type)) n += b.desiredWorkers;
  return n;
}

/**
 * Posts a trade actually has: its *finished* buildings times the hands each one takes.
 *
 * This is the "wanted" on the board — not something the player sets, but what the village's own
 * buildings are asking for. Put up a second fishing hut and two more fishermen are wanted; pull
 * one down and the number falls again. A site still going up is not counted: it cannot employ
 * anybody yet.
 */
export function tradeCapacity(s: GameState, type: BuildingType): number {
  const jobs = BUILDING_DEFS[type].jobs;
  return tradePosts(s, type).reduce((n, b) => n + (b.built ? jobs : 0), 0);
}

/** Villagers actually posted to a building of this type right now. */
export function tradeWorking(s: GameState, type: BuildingType): number {
  const ids = new Set(tradePosts(s, type).map((b) => b.id));
  return s.citizens.reduce((n, c) => n + (c.jobId !== null && ids.has(c.jobId) ? 1 : 0), 0);
}

/**
 * Move the trade's wanted count by one, spreading the change across its buildings.
 *
 * Hiring fills the emptiest building first and laying off takes from the fullest, so a village
 * that asks for four foresters across two huts gets two and two rather than three and one. When
 * every post is spoken for the extra goes to `tradeExtra` and waits there — which is what lets a
 * trade be staffed before it has anywhere to work.
 */
export function setTradeWanted(s: GameState, type: BuildingType, delta: number): void {
  const jobs = BUILDING_DEFS[type].jobs;
  if (jobs <= 0) return;
  const extras = (s.tradeExtra ??= {});
  const posts = tradePosts(s, type);
  if (delta > 0) {
    let best: Building | null = null;
    for (const b of posts) {
      if (b.desiredWorkers >= jobs) continue;
      if (!best || b.desiredWorkers < best.desiredWorkers) best = b;
    }
    if (best) best.desiredWorkers++;
    else extras[type] = (extras[type] ?? 0) + 1;
    return;
  }
  // Give the overflow back first: it is the part of the ask nobody is doing.
  if ((extras[type] ?? 0) > 0) {
    extras[type] = (extras[type] ?? 0) - 1;
    if (extras[type]! <= 0) delete extras[type];
    return;
  }
  let worst: Building | null = null;
  for (const b of posts) {
    if (b.desiredWorkers <= 0) continue;
    if (!worst || b.desiredWorkers > worst.desiredWorkers) worst = b;
  }
  if (worst) worst.desiredWorkers--;
}

/**
 * Hand a building its opening staff out of the trade's overflow.
 *
 * A village that asked for two fishermen before it had a hut gets them the moment the hut is
 * finished, without having to go back to the board and say it again.
 */
export function drawFromTradeExtra(s: GameState, b: Building): void {
  const jobs = BUILDING_DEFS[b.type].jobs;
  const extras = s.tradeExtra;
  const waiting = extras?.[b.type] ?? 0;
  if (jobs <= 0 || waiting <= 0) return;
  const take = Math.min(jobs - b.desiredWorkers, waiting);
  if (take <= 0) return;
  b.desiredWorkers += take;
  extras![b.type] = waiting - take;
  if (extras![b.type]! <= 0) delete extras![b.type];
}

/** Road tiles the player has confirmed and nobody has laid yet (drawn-but-unconfirmed don't count). */
export function plannedRoadTiles(s: GameState): number {
  const pending = s.pendingPaths?.length ? new Set(s.pendingPaths) : null;
  let n = 0;
  for (let i = 0; i < s.paths.length; i++) {
    const v = s.paths[i];
    if (!isPlannedPath(v)) continue;
    if (pending?.has(i)) continue;
    n++;
  }
  return n;
}

/** A building's effective construction time in seconds (base time × the pace multiplier). */
export function buildWorkOf(type: BuildingType): number {
  return BUILDING_DEFS[type].work;
}

/**
 * Where a building's work circle is centred.
 *
 * Usually the middle of the footprint. A dock is the exception: a fishing hut is mostly jetty,
 * and the fish are off the end of it, so centring the circle on the hut puts half of it inland
 * over ground that will never hold a fish. The circle slides out toward the dock end instead.
 */
export function workCentre(b: Placed): { x: number; y: number } {
  const fw = footprintW(b);
  const fh = footprintH(b);
  const cx = b.x + fw / 2;
  const cy = b.y + fh / 2;
  const dock = BUILDING_DEFS[b.type].dockDepth;
  if (!dock) return { x: cx, y: cy };
  // The door is on the +Y face unrotated, so the dock is the -Y end; a quarter turn moves both.
  const reach = Math.max(fw, fh) / 2;
  switch (b.rot ?? 0) {
    case 1: return { x: cx + reach, y: cy };
    case 2: return { x: cx, y: cy + reach };
    case 3: return { x: cx - reach, y: cy };
    default: return { x: cx, y: cy - reach };
  }
}

/** Extra work-circle radius a building gains per worker beyond the first. */
export const WORK_RADIUS_PER_WORKER = 2;

/**
 * The current work-circle radius (tiles) of a building, or `undefined` if it has no work area.
 * Every work-circle building's circle expands with its worker target — a base radius at 1 worker,
 * growing by WORK_RADIUS_PER_WORKER for each additional worker up to its job cap.
 */
export function workRadiusOf(b: Pick<Building, 'type' | 'desiredWorkers'>): number | undefined {
  const def = BUILDING_DEFS[b.type];
  if (def.workRadius === undefined) return undefined;
  const workers = Math.max(1, Math.min(def.jobs, b.desiredWorkers));
  return def.workRadius + (workers - 1) * WORK_RADIUS_PER_WORKER;
}

/**
 * The work circle a building would have once it is fully staffed.
 *
 * What a placement ghost shows. Siting a forester or a fishing hut *is* the act of choosing which
 * trees or which water it will work, and showing the one-worker circle understated the reach of
 * every building the player was ever going to staff properly — you sited it against a circle it
 * would outgrow the moment it opened.
 */
export function fullWorkRadiusOf(type: BuildingType): number | undefined {
  const def = BUILDING_DEFS[type];
  if (def.workRadius === undefined) return undefined;
  return workRadiusOf({ type, desiredWorkers: def.jobs });
}

/**
 * The part of a building that decides where it sits: enough for the footprint and work-centre
 * helpers, and no more. A placement preview is one of these before it is ever a `Building`, so
 * the ghost the player is dragging measures its work circle by exactly the same rules.
 */
export type Placed = Pick<Building, 'type' | 'x' | 'y'> & Partial<Pick<Building, 'rot' | 'w' | 'h'>>;

/**
 * A building's footprint width *as it stands on the map*. Ranches carry a custom `w`; everything
 * else uses its def size — and a quarter turn (rot 1 or 3) swaps the two, so `b.x, b.y` is always
 * the top-left corner of the tiles actually occupied.
 */
export function footprintW(b: Placed): number {
  const d = BUILDING_DEFS[b.type];
  return (b.rot ?? 0) % 2 === 1 ? (b.h ?? d.h) : (b.w ?? d.w);
}
/** A building's footprint height (see `footprintW`). */
export function footprintH(b: Placed): number {
  const d = BUILDING_DEFS[b.type];
  return (b.rot ?? 0) % 2 === 1 ? (b.w ?? d.w) : (b.h ?? d.h);
}

/**
 * The tile a villager stands on to go in: the door, one tile *outside* the footprint, centred on
 * whichever face the building has been turned to present. Unrotated, every building faces south.
 *
 * This is a tile the world has to keep clear — see `canPlace`, which refuses both a site whose own
 * door would be blocked and a site that would block someone else's. A building whose door is
 * walled off is a building nobody can work in or live in.
 */
export function entranceTile(b: Building): { x: number; y: number } {
  return entranceAt(b.x, b.y, footprintW(b), footprintH(b), b.rot ?? 0);
}

/** Every door of a building, in the order they should be preferred. */
export function entranceTiles(b: Placed): { x: number; y: number }[] {
  return entrancesAt(b.x, b.y, footprintW(b), footprintH(b), b.rot ?? 0, b.type);
}

/**
 * `entranceTiles` for a footprint that isn't a building yet.
 *
 * A second door is simply the first one on the opposite face — a half turn of the same rule — so
 * a barn always has a way in from both ends whichever way round it was built.
 */
export function entrancesAt(
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
  type: BuildingType,
): { x: number; y: number }[] {
  const front = entranceAt(x, y, w, h, rot);
  if (BUILDING_DEFS[type].doors !== 2) return [front];
  return [front, entranceAt(x, y, w, h, (rot + 2) % 4)];
}

/** `entranceTile` for a footprint that isn't a building yet — what placement checks against. */
export function entranceAt(
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
): { x: number; y: number } {
  const midX = x + ((w - 1) >> 1);
  const midY = y + ((h - 1) >> 1);
  switch (rot) {
    case 1: return { x: x - 1, y: midY }; // turned a quarter: door on the west face
    case 2: return { x: midX, y: y - 1 }; // half turn: door on the north face
    case 3: return { x: x + w, y: midY }; // three quarters: door on the east face
    default: return { x: midX, y: y + h }; // as built: door on the south face
  }
}

/** Does this building have a door that has to stay reachable? Fields and pens do not. */
export function hasDoor(type: BuildingType): boolean {
  return !OPEN_FOOTPRINT.includes(type);
}

/**
 * Buildings villagers walk *through* rather than around: a field and a pen are open ground with a
 * fence, not a wall. Everything else is a solid structure once it is finished — an unfinished site
 * is still a patch of dirt with materials stacked on it, and blocking those would strand the
 * builders carrying to them.
 */
export const OPEN_FOOTPRINT: BuildingType[] = ['farm', 'ranch'];

/**
 * Buildings whose work happens out in the work circle, not at the building.
 *
 * A forester fells the trees in his circle and clears the rock out of it; a gatherer, a hunter and
 * a herbalist walk theirs. These villagers spend their day away from their hut and only come back
 * to drop a load off. Not every building with a `workRadius` belongs here — a fishing hut's circle
 * is water, and its worker stands on the jetty.
 */
export const CIRCLE_WORK: BuildingType[] = ['gatherer', 'hunting', 'lumberyard', 'herbalist'];

/**
 * Does this trade happen under a roof? A smith, a tailor, a woodcutter, a teacher and a miner are
 * all inside their building while they work, and are drawn as such — out of sight until they come
 * out with a load.
 *
 * Everything with a door except the circle trades and the fishing hut, whose jetty is the point of
 * it. A field and a pen have no door: they are open ground, and their workers are visible on them.
 */
/** How much a stockpile limit moves per tap of the stepper's small step; the big step is double this. */
export const LIMIT_STEP = 50;
export const LIMIT_STEP_BIG = LIMIT_STEP * 2;

/**
 * What a stockpile limit can be set on: a resource, or **`'food'` for every food kind at once**.
 *
 * Food is one category deliberately. A village does not want "1000 fish"; it wants a full larder,
 * and which of the twenty edible things fills it is the merchant's business and the seasons'. One
 * cap over the lot means a gatherer, a fisherman and a hunter all stand down together when the
 * village has enough to eat, instead of the player having to cap each of them and watch the total
 * drift past whatever they meant.
 */
export type LimitKey = ResourceKind | 'food';

/**
 * The stockpile a workplace's limit is judged against, or null if a cap can never stop it.
 *
 * Fields and pens are deliberately absent: a crop half-grown in the ground and a herd that needs
 * feeding are not work you can walk away from because the barn is full, so they keep working
 * whatever the food stocks say. Everything else has one product a limit can speak about — a
 * mine's depends on which seam it is set to, and the foraging trades all answer to `food`.
 */
export function limitedOutput(b: Building): LimitKey | null {
  switch (b.type) {
    case 'gatherer':
    case 'fishing':
    case 'hunting':
      return 'food';
    case 'lumberyard': return 'wood';
    case 'woodcutter': return 'firewood';
    case 'quarry': return 'stone';
    case 'mine': return b.output === 'iron' ? 'iron' : 'coal';
    // Iron and steel tools share one cap — the same "tools" figure the HUD already folds them
    // into (see `limitStock`) — so a smith on either recipe stands down together, not one seam of
    // the tool supply at a time. Steel tools carry no cap of their own.
    case 'blacksmith': return 'tools';
    case 'tailor': return 'clothing';
    case 'herbalist': return 'medicine';
    // The workshop is judged against whatever bench it is running — the recipe *is* the output
    // kind, so a cap on glass stands down a glassblower while a jeweller beside it keeps working.
    case 'luxury': return (b.recipe as LuxuryRecipe) ?? 'glass';
    default: return null;
  }
}

/**
 * Every stockpile a limit could actually act on — what the limits panel offers.
 *
 * A cap only means anything for a good the village *makes*: `atLimit` stands a producer down, so a
 * limit on gold, dye or silk — bought off a ship, made by nobody — would sit in the panel doing
 * nothing. The five luxury goods a town produces are here; the three it only buys are not.
 * `steeltools` is absent too, on purpose: it shares the `tools` cap (see `limitStock`) rather than
 * carrying a second one of its own, so the panel offers one "Tools" row, not two.
 */
export const LIMITABLE: LimitKey[] = [
  'food', 'wood', 'firewood', 'stone', 'coal', 'iron', 'tools', 'clothing', 'medicine',
  'sand', 'glass', 'jewelry', 'finejewelry', 'fineclothes',
];

/**
 * The caps a village is founded with, per difficulty.
 *
 * Starting at "no limits anywhere" meant every trade ran flat out until the player noticed and
 * went looking for the stockpile panel — usually after a woodcutter had turned half a forest into
 * firewood nobody could burn fast enough. These are deliberately loose: high enough that a village
 * has to be doing well to reach one, low enough that runaway production stops before it eats the
 * map. They are only applied to a *new* village; a save from before this had no caps on purpose,
 * and loading it should not quietly change what its huts are doing.
 *
 * The wood and firewood ceilings follow the opening stockpile rather than sitting at one number
 * for everyone. A cap the village is *already* over is a hut that stands down on its first day:
 * Easy opens with 660 wood and 600 firewood, so both of its ceilings are set above that, while
 * Normal and Hard open with neither and can bank a winter's fuel (roughly 160 for the founding
 * twelve) three times over before a woodcutter downs tools.
 *
 * Every limitable good gets a default now — the luxury chain (sand through fine goods) used to
 * open with no ceiling at all, which read as an omission rather than a choice, and left a new
 * town's first glassblower running unchecked until the player found the panel. 100 is a plain,
 * round starting cap: low enough that an early workshop can actually hit it and stand down, high
 * enough not to bite before there is a bench to run it on.
 */
const BASE_LIMITS: Partial<Record<LimitKey, number>> = {
  food: 2000,
  wood: 500,
  stone: 500,
  iron: 500,
  firewood: 500,
  medicine: 100,
  coal: 100,
  tools: 100,
  clothing: 100,
  sand: 100,
  glass: 100,
  jewelry: 100,
  finejewelry: 100,
  fineclothes: 100,
};
export const START_LIMITS: Record<Difficulty, Partial<Record<LimitKey, number>>> = {
  easy: { ...BASE_LIMITS, wood: 1000, firewood: 1000 },
  normal: { ...BASE_LIMITS },
  hard: { ...BASE_LIMITS },
};

/**
 * Rules of the game that have nowhere else to live, printed in the Codex under their own heading.
 *
 * These used to be paragraphs at the top of the panels they applied to, which meant re-reading
 * them every time the panel was opened and being pushed down the screen by them — a rule you learn
 * once does not belong above the controls you use constantly. The Codex is where a player goes to
 * find out how something works, so it is where they go now.
 */
export const CODEX_NOTES: { icon: string; title: string; body: string }[] = [
  {
    icon: '📦',
    title: 'Stockpile limits',
    body:
      'At its limit, a workplace stops producing and its workers turn to labouring — they keep the ' +
      'job and pick it back up when the stock drops. Fields and pens carry on regardless.',
  },
  {
    icon: '💥',
    title: 'Demolition',
    body:
      'Marking a building schedules it: builders come and pull it down, and it keeps working and ' +
      'housing its people until they do, so the order can be called off while the walls are up. ' +
      'What is salvaged, and whatever the building held, is carried to a barn by hand. Your last ' +
      'barn cannot be demolished.',
  },
  {
    icon: '⬆️',
    title: 'Upgrading a house',
    body:
      'A wooden house can be traded up to stone from its own panel. A builder razes it and raises ' +
      'the new one on the same spot; the household is out of doors until the roof is on.',
  },
];

/** Player-facing name and icon for a limit row. Food is a category, so it has its own. */
export const LIMIT_META: Record<LimitKey, { label: string; icon: string }> = {
  food: { label: 'Food', icon: '🍽️' },
} as Record<LimitKey, { label: string; icon: string }>;
for (const k of RESOURCE_KINDS) {
  LIMIT_META[k] = { label: k[0].toUpperCase() + k.slice(1), icon: RESOURCE_ICON[k] };
}
// The luxury goods read as two words, which the capitalise-the-key rule cannot know.
LIMIT_META.finejewelry.label = 'Fine jewellery';
LIMIT_META.fineclothes.label = 'Fine clothes';
LIMIT_META.jewelry.label = 'Jewellery';
// Steel tools read as two words too; plain tools stay "Tools" (the HUD's combined figure).
LIMIT_META.steeltools.label = 'Steel tools';

/**
 * Fraction of a resource's own stockpile limit below which the village calls it low — the level
 * that turns its HUD chip red.
 *
 * Measured against the limit rather than a hand-set number per resource, so the rule means the
 * same thing for every kind and moves with what the player asked the village to keep: raise the
 * cap on stone and "low on stone" quietly means more stone. A fifth of the cap: enough headroom
 * that a store the village is actively drawing on doesn't sit red while it is plainly well stocked.
 */
export const LOW_STOCK_FRACTION = 0.2;

/**
 * The tighter fraction that raises an on-screen warning, as opposed to merely reddening the chip.
 * Half the low mark: the chip warns the eye from a fifth of the cap, and only at a tenth — genuinely
 * running out — does the game interrupt with a line in the log.
 */
export const WARN_STOCK_FRACTION = 0.1;

export function worksIndoors(type: BuildingType): boolean {
  return hasDoor(type) && !CIRCLE_WORK.includes(type) && type !== 'fishing';
}
export function blocksMovement(b: Building): boolean {
  if (OPEN_FOOTPRINT.includes(b.type)) return false; // fields and pens are walked through, ever
  if (b.built) return true;
  // A rising site becomes a wall the moment its frame goes up (`buildStage` 'framing') rather than
  // waiting for completion: once the walls are visually there, villagers route around them. Before
  // that the footprint is still open dirt being cleared and hauled onto, and must stay walkable so
  // laborers can fell the trees on it and builders can carry materials in.
  return buildStage(b) === 'framing';
}

// Path layer values (per tile).
export const PATH_NONE = 0;
export const PATH_DIRT_PLAN = 1;
export const PATH_DIRT = 2;
export const PATH_STONE_PLAN = 3;
export const PATH_STONE = 4;
export const PATH_BRIDGE_PLAN = 5;
export const PATH_BRIDGE = 6; // a built bridge — the only walkable water tile
export const PATH_TUNNEL_PLAN = 7;
export const PATH_TUNNEL = 8; // a driven tunnel — the only walkable mountain tile
/**
 * A stone bridge: the masonry upgrade of a timber one, exactly as a stone road upgrades a track.
 *
 * Kept as new values rather than by re-using the timber ones, so every existing save's bridges
 * stay timber and stay standing. 9 and 10 have never been written by any build before this.
 */
export const PATH_BRIDGE_STONE_PLAN = 9;
export const PATH_BRIDGE_STONE = 10;

/**
 * Is this tile drawn but not yet laid?
 *
 * A predicate rather than the run of `!==` comparisons it replaces: the same list was written out
 * at four call sites, and adding the stone bridge to the path layer meant every one of them had
 * to be found and widened. One of them being missed is exactly the sort of silence that leaves a
 * tier planned forever with nobody to build it.
 */
export function isPlannedPath(v: number): boolean {
  return (
    v === PATH_DIRT_PLAN ||
    v === PATH_STONE_PLAN ||
    v === PATH_BRIDGE_PLAN ||
    v === PATH_BRIDGE_STONE_PLAN ||
    v === PATH_TUNNEL_PLAN
  );
}

/** A path tile that has actually been laid — not bare ground, not a plan still waiting on a builder. */
export function isBuiltPath(v: number): boolean {
  return v !== PATH_NONE && !isPlannedPath(v);
}

// Harvest layer values (per tile): what unemployed villagers should gather here.
export const HARVEST_NONE = 0;
export const HARVEST_WOOD = 1; // a marked forest tile (chop for wood, clear-cuts to grass)
export const HARVEST_STONE = 2; // a marked loose-stone tile
export const HARVEST_IRON = 3; // a marked surface iron-ore tile

/**
 * What a harvest drag is allowed to mark.
 *
 * Dragging a square used to take everything inside it, which is fine for clearing a plot and
 * wrong for everything else: a village that wants the iron out of a wood does not want the wood
 * felled to get at it, and one thinning trees for timber does not want its stone picked up and
 * hauled at the same time. Picking a kind first makes the drag say what it is for.
 */
export type HarvestKind = 'all' | 'trees' | 'stone' | 'iron' | 'clear';
export const HARVEST_KINDS: HarvestKind[] = ['all', 'trees', 'stone', 'iron', 'clear'];
export const HARVEST_KIND_META: Record<HarvestKind, { label: string; emoji: string; hint: string }> = {
  all: { label: 'Everything', emoji: '🪓', hint: 'trees, stone and iron' },
  trees: { label: 'Trees', emoji: '🌲', hint: 'trees only — stone and iron are left where they lie' },
  stone: { label: 'Stone', emoji: '🪨', hint: 'loose stone only — the trees are left standing' },
  iron: { label: 'Iron', emoji: '🔩', hint: 'surface iron only — the trees are left standing' },
  // The way back. An order given by dragging a square could only be taken back by waiting for
  // somebody to carry it out, which made a misplaced drag across half a wood permanent.
  clear: { label: 'Unmark', emoji: '🚫', hint: 'call off the orders inside the square' },
};

/** The single kind of goods a visiting merchant deals in. */
export type MerchantCategory =
  | 'basics'
  | 'seeds'
  | 'animals'
  | 'foods'
  | 'goods'
  // The four that keep a calendar. They come to the Port, one to a season, and are the only way
  // gold, dye and silk ever reach the town.
  | 'portgrain'
  | 'portluxury'
  | 'portindustrial'
  | 'portgeneral';
export const MERCHANT_CATEGORIES: MerchantCategory[] = ['basics', 'seeds', 'animals', 'foods', 'goods'];
/** The Port's four, and the season each keeps to. */
export const PORT_CATEGORIES: MerchantCategory[] = ['portgrain', 'portluxury', 'portindustrial', 'portgeneral'];
export const PORT_SEASON_MERCHANT: Record<Season, MerchantCategory> = {
  Spring: 'portgrain',
  Summer: 'portluxury',
  Autumn: 'portindustrial',
  Winter: 'portgeneral',
};
/**
 * Odds the season's merchant actually sails.
 *
 * Predictable enough to plan a year around, not so certain that the plan is free: seven winters in
 * ten the medicine ship comes, and the town that stocked nothing against the other three finds out
 * why it should have.
 */
export const PORT_ARRIVAL_CHANCE = 0.7;
/** What a merchant's own prices do to the book value, drawn when they sail. */
export const PORT_PRICE_MODS = [0.9, 1.0, 1.1] as const;

export interface Merchant {
  /**
   * away    — no merchant (traveling between visits).
   * arriving — a boat is sailing down the river toward the dock.
   * docked  — moored at the trading post; the player can trade.
   * leaving — the boat is sailing back downstream and off the map.
   */
  phase: 'away' | 'arriving' | 'docked' | 'leaving';
  /** Convenience mirror of `phase === 'docked'` — trading is only possible while docked. */
  present: boolean;
  /**
   * Seconds of moorage left before the boat departs on its own (set on docking). A timer rather
   * than a count of seasons, so a merchant that sails in mid-season still gets a full stay.
   */
  stayTimer: number;
  /** Seconds before another merchant may arrive — set on departure, so visits never run back to back. */
  cooldownTimer: number;
  /**
   * What this trader's own prices do to the book value, drawn once when they sail: 0.9, 1.0 or 1.1.
   * Applied to both sides, so a hard bargainer is dear to buy from *and* generous to sell to.
   */
  priceMod?: number;
  /** What this merchant deals in (null while away). */
  category: MerchantCategory | null;
  /** Goods for sale this visit: resource -> units remaining. */
  stock: Partial<Record<ResourceKind, number>>;
  /** Seeds category only: the (still-unowned) crop seeds on offer. */
  seedStock: Crop[];
  /**
   * Animated boat position on the water while arriving/docked/leaving (null when away), plus the
   * heading it is sailing on so the renderer can point the bow the right way. A boat that sails
   * across a lake to reach a wharf cannot keep the fixed downstream yaw it used to have.
   */
  boat: { x: number; y: number; h?: number } | null;
  /**
   * Remaining water-tile waypoints the boat is sailing through to its current goal (berth or the
   * sea exit), so it follows the river/lakes rather than crossing land. Computed on demand and
   * cleared at each phase change; absent/null means "recompute the route". Transient — a save
   * mid-voyage simply re-plans the same channel on load.
   */
  boatPath?: { x: number; y: number }[] | null;
}

/** A band of nomads awaiting the player's decision to let them settle or turn them away. */
export interface NomadOffer {
  count: number;
  /** How many of the band arrived ill (revealed softly to the player as a warning). */
  sick: number;
}

/**
 * One entry in the village chronicle. Stamped with the season it happened in so the player can
 * place it in time — the toast that announced it is long gone by the time they look.
 */
export interface GameEvent {
  text: string;
  /** 'info' | 'good' | 'bad' — mirrors the toast styling. */
  kind: 'info' | 'good' | 'bad';
  year: number;
  season: number;
}

/** Entries kept in the chronicle. Oldest fall off the end; it rides along in the save. */
export const EVENT_LOG_MAX = 250;

export interface GameState {
  /** Map dimensions this state was generated at (also restored on load). */
  w: number;
  h: number;
  /** Difficulty this game was started on (affects only the opening setup). */
  difficulty: Difficulty;
  /** Whether fire and disease outbreaks can occur (toggled at New Game). */
  disasters: boolean;
  /**
   * Whether a workplace opens its jobs the moment it is finished, instead of standing empty until
   * the player staffs it on the Job Board.
   *
   * Only about *newly created* jobs. A job left open by a worker dying is always refilled — that
   * is not automation, it is the village noticing a hole in its own workforce, and having to go
   * and re-hire by hand every time an elder passes is busywork rather than a decision. Builders
   * are outside this entirely: their count is derived from the open construction sites (see
   * `autoBuilderDemand`) and no workplace slot is involved.
   *
   * A player preference rather than a property of the village — it mirrors the Settings toggle
   * and is written onto the state so the simulation has one place to read it.
   */
  autoStaff?: boolean;
  tiles: Tile[]; // length w * h
  paths: number[]; // length w * h, PATH_* values
  buildings: Building[];
  citizens: Citizen[];
  season: number; // index into SEASONS
  year: number;
  seasonTimer: number; // seconds elapsed in current season
  nextId: number;
  gameOver: boolean;
  everLived: boolean;
  merchant: Merchant;
  /** Crops the village has unlocked (owns the seed for) and can plant. Empty ⇒ no field grows. */
  seeds: Crop[];
  /** A band of nomads awaiting an accept/reject decision, or null. */
  pendingNomads: NomadOffer | null;
  /** Harvest orders (per tile): HARVEST_* — trees/loose stone marked for gathering. */
  harvest: number[];
  /**
   * The village chronicle: newest first, capped at EVENT_LOG_MAX. Every message that flashes as a
   * toast is also filed here so the player can scroll back through what happened.
   */
  events?: GameEvent[];
  /** Fractional accumulator for how many planned path tiles are built. */
  pathProgress: number;
  /**
   * Path tiles drawn but not yet confirmed. They sit in `paths` as ordinary *plan* values so they
   * render as the dim outline a plan already does, but villagers skip them until the player
   * confirms — so a stray drag across the map can be cancelled instead of becoming work orders.
   */
  pendingPaths?: number[];
  /**
   * What each pending tile held before its plan went down, index-matched to `pendingPaths`.
   *
   * Cancelling restores these rather than clearing to bare ground, so drawing a stone upgrade
   * over an existing dirt road and then changing your mind leaves the dirt road there.
   */
  pendingPrev?: number[];
  /**
   * Built path tiles the player has marked to tear up. Like a demolition order on a building, the
   * road stays put and passable until a builder or free laborer reaches it and pulls it — at which
   * point its masonry (if any) is salvaged back to the barns. Indices into `paths`; empty/absent
   * means nothing is queued.
   */
  razePaths?: number[];
  /**
   * Tile indices left scorched by a building that burned down — a purely visual scar (see
   * `renderer3d.ts`/`renderer.ts`), never a gameplay effect. Added when fire destroys a building
   * (`markScorched`, fire only — an ordinary demolition leaves bare ground, not a burn scar) and
   * cleared the moment anything is built over the tile again (`placeBuilding`), which is what
   * makes it *temporary*: there is no timer, only "still empty" or "built over".
   */
  scorched?: number[];
  /** How many free adults the player wants assigned as Builders. Only Builders construct work
   * buildings; paths can be laid by any adult. Idle builders pitch in as laborers. */
  desiredBuilders: number;
  /**
   * Bumped whenever walkability changes (a bridge laid or a path/bridge cleared). The
   * simulation caches its per-tick reachability flood-fill and only recomputes when this
   * (or the state identity) changes — keeping per-tick nav ~O(1) on large maps.
   */
  navVersion?: number;
  /**
   * Set the tick a disaster breaks out (a building catches fire, a bridge burns, a sickness
   * starts spreading) and cleared the moment the frame loop notices it — see `Game.frame` and
   * `debugAdvanceAtSpeed`. The one thing every disaster shares is that the player should be
   * looking at it, not watching it happen at 10× while doing something else on the far side of
   * the map, so noticing this is what snaps the game speed back to 1×.
   */
  disasterAlert?: boolean;
  /**
   * The founding clearing — where the village was first pegged out.
   *
   * Idle villagers loiter near home, and someone with no home loiters here. They used to amble
   * around `centreOfVillage`, the *average* of every building's position, which drifts off into
   * empty ground the moment a quarry or a mine goes up on the far side of the map and drags the
   * whole population with it.
   */
  origin?: { x: number; y: number };
  /**
   * The player's own adjustment to the builder count, on top of what the open sites ask for.
   *
   * `desiredBuilders` is derived (`autoBuilderDemand` + this, clamped to the adult population) so
   * it cannot drift out of step with the work outstanding — an incremental "+2 on placement, -2
   * on completion" loses count the first time a site burns down or is demolished mid-build. This
   * holds the difference instead, so the stepper still works and still means something when there
   * is nothing being built (builders lay paths too).
   */
  builderExtra?: number;
  /**
   * Villagers wanted in a trade that has nowhere to put them — every building of that type is
   * already fully asked for, or there is no building of that type at all.
   *
   * The job board is per *profession*: a village says it wants four foresters, not that hut #2
   * wants its second pair of hands. What each building asks for is still its own
   * `desiredWorkers`, so a building's own panel can still be set by hand, and the trade's total is
   * their sum plus this. The overflow is real intent, not a rounding error — it is how "I want two
   * fishermen" survives having no fishing hut yet, and it is what a new hut of that type draws its
   * opening staff from. Nobody is employed by it: until there is a post, those villagers are
   * laborers like any other.
   */
  tradeExtra?: Partial<Record<BuildingType, number>>;

  /**
   * Which stocks the village has already been warned about, so "X is low" fires when it *becomes*
   * low rather than every season it stays that way.
   *
   * Without the latch a village that has never mined iron is told iron is low four times a year
   * forever, and the one warning that matters — the stock that just fell over the line — is buried
   * among the standing ones. Cleared per key the moment the stock recovers, which re-arms it.
   */
  lowWarned?: Partial<Record<LimitKey, boolean>>;

  /**
   * How fast ages ran when this village was last saved (`AGE_PER_YEAR`).
   *
   * Absent means a save from before age was uncoupled from the calendar, when childhood was the
   * four years from 0 to `ADULT_AGE`. There is no other way to tell: a child of 3 is a nearly
   * grown one on the old scale and an infant on this one, and the same number means both. The
   * loader reads it, rescales those children, and stamps it — see `save.ts`.
   */
  ageScale?: number;

  /**
   * The seed this village's map was carved from. Shareable: the same seed rebuilds the same world.
   */
  seed: number;
  /**
   * The simulation's random stream, as a single 32-bit integer (see `game/rng.ts`).
   *
   * Not the same thing as `seed`. The map is a pure function of the seed and is generated once;
   * this is the *running* state of everything the sim rolls for afterwards — births, deaths, fires,
   * disease, merchant arrivals, animal breeding. It is a plain number so it saves and restores with
   * the rest of the state, which is the point: a village put down and picked back up carries on the
   * same stream instead of re-rolling its luck from scratch.
   */
  rng: number;

  /**
   * How construction was measured when this village was last saved (`BUILD_WORK_RATE`).
   *
   * Absent means a save from when `progress` counted *seconds* against a `buildTime` of a handful
   * of them. It counts builder-work now and the scales differ per building — a house went from 12
   * to 40 — so the same number means a nearly finished house on one scale and a barely started
   * one on the other. The loader rescales each site by the fraction it had reached and stamps
   * this — see `save.ts`.
   */
  workScale?: number;
  /**
   * The books the Town Hall's clerks keep: one row per season, newest last, `LEDGER_SEASONS` long.
   *
   * Measured, never modelled. A forecast built by adding up what every worker *ought* to produce
   * would be a second copy of the simulation — forest density, herd sizes, tool wear, capped-out
   * workplaces, staffing gaps, walking time — and it would drift from the real economy the first
   * time either changed, which is exactly when the player needs it most. These are the totals that
   * actually happened.
   */
  ledger?: LedgerRow[];
  /**
   * The standing rules the player has enacted, in the order they were chosen. How many of them are
   * actually in force depends on the clerks — see `activePolicies`.
   */
  policies?: PolicyId[];
  /**
   * What the stores have given up so far this season, per resource — the accumulator behind each
   * row's `out`. Filled in by `consume`, which is the single way anything leaves the stores to be
   * used up, and cleared at every turnover.
   */
  spent?: Partial<Record<ResourceKind, number>>;
  /** Stock at the last turnover, so the next one can tell what changed. */
  lastTotals?: Partial<Record<ResourceKind, number>>;

  /** Bumped when a tile becomes / stops being forest (replanting or clear-cutting), so the
   * renderer knows to rebuild its tree layer to show the new/removed trees. */
  forestVersion?: number;
  /**
   * Seconds since households were last settled. Rehousing runs on this short cadence rather than
   * only at season turnover, so a couple moves into a house the moment it is finished instead of
   * waiting out the rest of the season.
   */
  rehouseTimer?: number;
  /** Seconds since the last low-stock warning sweep (see `warnLowStocks`). */
  warnTimer?: number;
  /**
   * Seconds since the last reproduction check. Births are rolled on a cadence rather than every
   * tick because deciding them means walking every house and pairing off its residents, which is
   * far too much to do sixty times a second — but a season holds hundreds of these, so from the
   * player's side children simply arrive whenever they arrive.
   */
  birthTimer?: number;
  /**
   * Player-set stockpile caps, per resource. Absent or 0 means no limit.
   *
   * A workplace whose output is at its cap stands down and its workers go back into the labour
   * pool — see `cappedOut`. It is a way to say "that is enough firewood, go and do something
   * else" without having to remember to re-staff the hut afterwards, because the moment the stock
   * falls back below the cap the job fills again on its own.
   */
  limits?: Partial<Record<LimitKey, number>>;
  /**
   * Villagers who have died so far this season. Old age used to be settled inside `endSeason`, so
   * the morale hit could be measured by the population dropping over that one call; now that
   * elders die whenever their time comes, the count has to be carried.
   */
  seasonDeaths?: number;
  /**
   * The tier the village was last told it had reached.
   *
   * The tier itself is never stored — it is read off the village every time it is asked for, so it
   * follows a population crash or a burnt-out blacksmith straight back down. This is only here to
   * notice a *change* worth announcing, and it starts as whatever the village already is, so
   * loading a going concern does not congratulate you on a tier you reached years ago.
   */
  tierSeen?: VillageTier;
  /**
   * Port trades settled. Kept as a bare tally rather than a reputation: standing with a fleet is a
   * system for later, and this is the number it would be built on.
   */
  portTradeCount?: number;
  /**
   * Lifetime tallies for this village, the raw material the achievement checks read. Absent on a
   * save from before achievements shipped — the migration seeds a fresh one (see `freshStats`).
   */
  stats?: VillageStats;
}

/**
 * The record an achievement check reads against, over and above what the live state already says.
 *
 * Two kinds of thing live here: *peaks and totals* the current state cannot recover (a village that
 * hit 300 people and crashed to 50 still earned the milestone), and *ledger-fed cumulatives* that
 * would be ruinous to recompute — how much has ever been produced, traded, or educated. Everything
 * a single glance at the state answers — how many are housed *now*, whether a cathedral stands —
 * stays out of here and is computed live.
 *
 * Saved with the village. Achievements themselves are global and permanent (kept outside any one
 * save); these are the per-village numbers those global unlocks are judged from.
 */
export interface VillageStats {
  /** Cumulative gross production per resource, accrued a season at a time off the ledger. */
  produced: Partial<Record<ResourceKind, number>>;
  peakPop: number;
  /** Most citizens with a home / a job / alive-and-schooled, at any one moment. */
  peakHoused: number;
  peakWorkers: number;
  peakEducatedAlive: number;
  /** Most food ever held at once (barns and larders). */
  peakFoodStored: number;
  /** Highest average happiness ever reached (0..100). */
  peakHappiness: number;
  /** Winters lived through. */
  wintersSurvived: number;
  /** Citizens who have finished schooling over the village's life (not the living count). */
  educatedEver: number;
  /** Trades settled through any post or port, and the luxury/trade-only flows through them. */
  tradesCompleted: number;
  merchantVisits: number;
  jewelryExported: number;
  luxuryExported: number;
  tradeOnlyImported: number;
  portTradeValue: number;
  /** Whether gold / dye / silk have ever been held, and ever been *bought* (traded for). */
  acquiredGold: boolean; acquiredDye: boolean; acquiredSilk: boolean;
  importedGold: boolean; importedDye: boolean; importedSilk: boolean;
  /** Building types ever commissioned (placed) and ever finished (built). */
  placedTypes: BuildingType[];
  builtTypes: BuildingType[];
  /** Highest tier index ever reached (into `TIERS`), and the year the city rung was first hit. */
  maxTier: number;
  cityYear: number | null;
  /** Whether the village has *ever* lost anyone to hunger or cold. */
  everFoodShortage: boolean;
  everFirewoodShortage: boolean;
  /** Consecutive-year streaks, rolled at each year's turn. */
  foodPositiveYears: number;
  firewoodPositiveYears: number;
  happy70Years: number;
  noShortageYears: number;
  /** How many whole years have finished clear of a food / firewood shortage (not necessarily in a row). */
  cleanFoodYears: number;
  cleanFirewoodYears: number;
  /** Ever had food, firewood, tools and clothing all in net-positive production in one season. */
  allFourProduced: boolean;
  /** This year's flags, cleared at the year turn (feed the streaks above). */
  yearFoodShortage: boolean;
  yearFirewoodShortage: boolean;
}

/** A brand-new village's tallies — every count at zero, every flag clear. */
export function freshStats(): VillageStats {
  return {
    produced: {},
    peakPop: 0, peakHoused: 0, peakWorkers: 0, peakEducatedAlive: 0,
    peakFoodStored: 0, peakHappiness: 0,
    wintersSurvived: 0, educatedEver: 0,
    tradesCompleted: 0, merchantVisits: 0,
    jewelryExported: 0, luxuryExported: 0, tradeOnlyImported: 0, portTradeValue: 0,
    acquiredGold: false, acquiredDye: false, acquiredSilk: false,
    importedGold: false, importedDye: false, importedSilk: false,
    placedTypes: [], builtTypes: [],
    maxTier: 0, cityYear: null,
    everFoodShortage: false, everFirewoodShortage: false,
    foodPositiveYears: 0, firewoodPositiveYears: 0, happy70Years: 0, noShortageYears: 0,
    cleanFoodYears: 0, cleanFirewoodYears: 0,
    allFourProduced: false,
    yearFoodShortage: false, yearFirewoodShortage: false,
  };
}

// ---- Time ----
export const SEASON_LENGTH = 10 * 60; // 10 real minutes per season at 1x speed
/** A full year of play, at 1x speed. Ageing is billed against this every tick. */
export const YEAR_LENGTH = SEASON_LENGTH * 4;

// ---- Housing / storage / logistics ----
/**
 * Villagers a plain house shelters. A household is one couple plus their children, so this is
 * really "a couple and up to six children" — the room to raise a family is what lets a village
 * grow, and at 4 a couple was full after two children and never bore another.
 */
export const HOUSING_PER_HOUSE = 8;
/**
 * Storage space, measured in the same wood-equivalent volume as carrying (`RESOURCE_VOLUME`):
 * a barn holds 5000 logs' worth of room, which is 20000 of a crop. Counting units instead would
 * mean a sack of grain took the same space as a log, which is the inconsistency volume fixed
 * for hauling. The numbers are unchanged, so bulky storage is exactly what it always was.
 */
export const BARN_CAPACITY = 5000;
export const MARKET_CAPACITY = 2000;
export const MARKET_STOCK_TARGET = 60; // per-resource amount a vendor keeps stocked
/**
 * The market's work circle at one vendor; `WORK_RADIUS_PER_WORKER` widens it to 12 at its full
 * three. It is the largest circle in the game on purpose — a market is not producing anything out
 * there, it is *delivering*, and the point of building one is that a whole quarter of the village
 * stops walking to the barn for its groceries.
 */
export const MARKET_RADIUS = 8;
/**
 * How much *space* a villager has in their arms for one trip, in wood-equivalents: a log is volume
 * 1, so this is the old "12 units" for timber and stone, and much more of anything compact.
 *
 * Carrying used to be a flat count of units, which made no sense across a table that runs from logs
 * to grain to medicine, and it throttled farming badly: a full field yields thousands of units of
 * crop, so at twelve-per-trip a harvest took years to bring in.
 */
export const CARRY_VOLUME = 12;

/**
 * Space one unit of each resource takes up. Deliberately set so nothing carries *worse* than it did
 * under the old flat count — bulky goods stay at volume 1 (twelve per trip, exactly as before) and
 * only compact goods gain. Crops at 0.25 mean 48 per trip, which is what makes a harvest haulable.
 */
export const RESOURCE_VOLUME: Record<ResourceKind, number> = {
  // Sand is quarried by the cartload. The fine goods are small, but volume is not only how much
  // fits in a barn — it is also what divides a load, and a worker holds their output back until
  // they have a *full* one. Jewellery comes off the bench one piece at a time, so at the 0.1 a
  // ring deserves by bulk a jeweller would have had to make a hundred and twenty of them before
  // carrying any to a barn. These are set by how many make a sensible trip.
  sand: 1, glass: 0.5, jewelry: 1, gold: 0.5, dye: 0.5, silk: 0.5,
  // Finer than the plain goods but not smaller in the barn — a coronet still needs its case and a
  // gown its press. Held to 1 so a full load is a sensible trip rather than a hundred pieces.
  finejewelry: 1, fineclothes: 1,
  // Crops and other foods: compact, and hauled in bulk from field to barn.
  fruit: 0.25, grain: 0.25, corn: 0.25, potato: 0.25, rice: 0.25, barley: 0.25,
  carrot: 0.25, tomato: 0.25, onion: 0.25, pepper: 0.25, cabbage: 0.25, beans: 0.25,
  pumpkin: 0.25, apple: 0.25, grapes: 0.25, strawberry: 0.25, melon: 0.25,
  eggs: 0.25, fish: 0.25, beef: 0.25, venison: 0.25, mutton: 0.25, pork: 0.25, chicken: 0.25, milk: 0.25,
  // Bulky raw materials — the volume-1 baseline.
  wood: 1, firewood: 1, stone: 1, coal: 1, iron: 1,
  // Worked goods: denser than raw material, so more fit in a load.
  tools: 0.5, steeltools: 0.5, leather: 0.5, wool: 0.5, clothing: 0.5,
  medicine: 0.25,
  // Livestock is driven, not carried, and a cow takes rather more room than a log.
  cattle: 4, pigs: 3, sheep: 2, chickens: 0.5,
};

/** How many whole units of `kind` fit in `volume` of carrying space (always at least one). */
export function carryLimit(kind: ResourceKind, volume: number = CARRY_VOLUME): number {
  return Math.max(1, Math.floor(volume / RESOURCE_VOLUME[kind]));
}
export const REFUND_FRACTION = 0.25; // fraction of build cost reclaimed on demolish
/**
 * Fraction of the materials *already delivered* to a construction site that is returned when the
 * player cancels it. Cancelling an unfinished site takes it away at once — unlike demolishing a
 * finished building, which salvages `REFUND_FRACTION` of the whole build cost — so this is metered
 * against what actually made it into the site's store, not the full recipe. The remainder is the
 * wastage of tearing pegged-out work back up.
 */
export const CANCEL_REFUND_FRACTION = 0.9;
/**
 * How often the HUD and any open panel are rebuilt, in milliseconds.
 *
 * Not once per animation frame: none of what they show — stock totals, worker counts, the season —
 * moves fast enough to be worth 60Hz when a season lasts ten minutes. Short enough that a tap on a
 * stepper still looks instant, because panels are redrawn from the frame loop and nowhere else.
 */
export const UI_REFRESH_MS = 100;

export const WORK_SECONDS = 8; // seconds of work to fill/convert one carry-load (slower pace)

/**
 * Units of a building's `work` one builder lays down per second stood at the site.
 *
 * At 1, a def's `work` reads directly as builder-seconds: a 40-work house is forty seconds of one
 * man's labour, or twenty of two. This is the dial for the pace of construction as a whole —
 * halve it and every building in the game takes twice as long without touching the table.
 */
export const BUILD_WORK_RATE = 1;

/**
 * Work one builder gets through before knocking off for a rest.
 *
 * This is what makes a building a *project* rather than a progress bar. A well (10 work) is one
 * short visit; a mine (240) is eight shifts, and with the walk home in the middle of each, where
 * the builders live starts to matter as much as how many there are. Construction is the one job
 * that happens away from a workplace, so it is the one where the commute is the player's problem
 * to solve — put housing near the site or watch the site stand idle half the day.
 */
export const BUILDER_SHIFT_WORK = 30;

/**
 * Seconds off between shifts, spent on the ordinary leisure round (tavern, chapel, else home).
 *
 * Longer than an ordinary break — a shift on a building site is harder work than a day at a
 * bench — and it reuses `Citizen.rest`, so a knocked-off builder walks the same route home as
 * anyone else on a break and a low larder still cuts it short.
 */
export const BUILDER_REST_SECONDS = 30;

// ---- Movement / paths ----
export const BASE_WALK_SPEED = 0.875; // villagers stroll — half the previous 1.75
export const PATH_DIRT_MULT = 1.5;
export const PATH_STONE_MULT = 2.0;
/**
 * Crossing a bridge. Timber is a plank walkway you pick your way over; masonry is a road that
 * happens to be above water, and matches `PATH_STONE_MULT` so a paved street does not slow to a
 * crawl the moment it reaches the river.
 */
export const PATH_BRIDGE_MULT = 1.25;
export const PATH_BRIDGE_STONE_MULT = 2.0;
export const STONE_PATH_COST = 1; // stone per stone-path tile
export const BRIDGE_WOOD_COST = 3; // wood per timber bridge tile
/** A stone bridge: less timber than the plank one, and the masonry that replaces it. */
export const BRIDGE_STONE_WOOD_COST = 2;
export const BRIDGE_STONE_STONE_COST = 4;
/**
 * Seasonal chance a standing timber bridge catches. Planks over water, far from any well, and
 * nobody living on them to notice — the one piece of infrastructure that can simply be lost.
 * Masonry does not burn, which is half the reason to build it.
 */
export const BRIDGE_FIRE_CHANCE = 0.04;
/**
 * A tunnel is the mountain counterpart of a bridge: the only way through rock that villagers
 * otherwise have to walk the whole length of a range to get around.
 *
 * It costs both timber and stone per tile — the timber props the roof, the stone lines it — and
 * is deliberately the most expensive thing in the paths menu. Driving one should be a decision
 * about whether a range is worth cutting through, not a default.
 */
export const TUNNEL_WOOD_COST = 6;
export const TUNNEL_STONE_COST = 4;
/** Underground and hand-cut: passable, but no faster than bare ground. */
export const PATH_TUNNEL_MULT = 1.0;
export const PATH_BUILD_TILES_PER_SEC = 0.6; // per free builder

// ---- Hand harvesting (unemployed villagers gathering marked wood / loose stone) ----
export const HARVEST_WOOD_PER_TREE = 20; // wood a full forest tile (trees=1) yields when cleared
export const LOOSE_STONE_MIN = 4; // units on a loose-stone deposit — small nodes, many of them
export const LOOSE_STONE_MAX = 10;
export const LOOSE_IRON_MIN = 3;
export const LOOSE_IRON_MAX = 8;

/**
 * Surface deposits are grown as individual bounded clusters, not thresholded out of a noise
 * field. Thresholding produced one contiguous outcrop of 149 tiles on a 48x48 map — a bald
 * quarter of the landscape, because a deposit clears the trees off its own tile.
 *
 * A cluster is a small irregular *footprint* grown from one seed, and only `DEPOSIT_FILL` of the
 * tiles in that footprint actually carry ore. The rest keep their woodland, so an outcrop reads
 * as rock showing through the trees rather than as a clearcut patch.
 */
export const DEPOSIT_CLUSTER_MIN = 5;
export const DEPOSIT_CLUSTER_MAX = 18; // hard cap on a single outcrop's footprint, in tiles
export const DEPOSIT_FILL = 0.5;
/** Clusters seeded per 1000 map tiles. Stone is the common one; iron is a find. */
export const STONE_CLUSTER_DENSITY = 34;
export const IRON_CLUSTER_DENSITY = 4;
/**
 * Tiles of clear ground kept between one outcrop and the next.
 *
 * Without this, capping each cluster achieves nothing in the tail: neighbouring clusters grow
 * into each other and chain, and the largest connected run still hit 95 tiles across 200 worlds.
 * Enforcing separation makes the cap actually bind.
 */
export const DEPOSIT_SPACING = 1;
/**
 * Chebyshev distance a deposit must keep from open water.
 *
 * One tile was not enough: the terrain shader blends sand well past the water's edge, so a
 * deposit two tiles out still renders sitting on the beach, and the ground under it has already
 * begun sloping toward the lake bed.
 */
export const DEPOSIT_WATER_MARGIN = 2;
/** Radius of open ground cleared around the founding barn so a village has room to grow. */
export const START_CLEARING_RADIUS = 9;
/**
 * Moisture (0..1) above which a tile grows woodland.
 *
 * The moisture field is a sum of three octaves, so its values bunch toward the middle of the
 * range — this threshold is read against that combined field, not against a single flat one.
 * Lower means more forest.
 */
export const FOREST_MOISTURE = 0.3;

// ---- Mountains & foothills ----
/**
 * How wide the buildable rocky skirt around each mountain is, in tiles.
 *
 * Three deep, not one: a mine is only allowed to stand where its back half (three rows of a 6×6)
 * can bury itself in the foothills, so a one-tile ring left nowhere to put one. A wider skirt also
 * reads better against the gentler mountains — the range comes down to the plain over a band of
 * broken ground rather than a cliff dropping straight onto grass.
 */
export const FOOTHILL_RADIUS = 3;

// ---- Consumption (per season) — sized for the per-trip hauling economy ----
/**
 * How long a villager can go completely unfed before they die, in seconds.
 *
 * Sized against SEASON_LENGTH: roughly a third of a season, so a household whose hauler is a
 * long walk from the barns survives the gap, while a village that has genuinely run out loses
 * people within the season rather than instantly at its boundary.
 */
export const STARVE_SECONDS = SEASON_LENGTH / 3;
/** How fast the starvation clock unwinds once a villager is eating again, per second. */
export const STARVE_RECOVERY = 2;

/**
 * How long a villager can go without heating *in winter* before they freeze, in seconds. The same
 * grace the starvation clock gives, for the same reason: a household waiting on a hauler should
 * not lose anyone, a village out of fuel should.
 */
export const FREEZE_SECONDS = SEASON_LENGTH / 3;
/** How fast the cold clock unwinds once a villager's hearth is lit again, per second. */
export const FREEZE_RECOVERY = 2;
/**
 * Cold is meant to be dangerous, not a guillotine. Everyone unheated crosses `FREEZE_SECONDS` at the
 * same moment, so a village that runs out of fuel used to lose its *whole* population in one frame —
 * the death spiral that leaves no time to react. These three soften the curve into a slope:
 *
 * - `FREEZE_DEATH_RATE` — once past the threshold, death is a per-second risk that ramps with how
 *   long a villager has been over it (`hazard = over/FREEZE_SECONDS × this`), not a cliff. Tuned so
 *   the first villager dies well after the threshold and the rest follow spread out, giving the
 *   player a visible warning — one funeral — with time to act before it becomes many.
 * - `COLD_WORK_MIN` — the slowest a chilled (but not yet freezing) villager works. Cold hands are
 *   slow hands, so a fuel shortage bites into production before it kills, and eases the moment the
 *   hearths are lit again.
 * - `COLD_HEALTH_DRAIN` — health lost per second while freezing, so the cold shows in the health
 *   readout (and in the ageing odds) as a mounting problem rather than appearing only as a corpse.
 */
export const FREEZE_DEATH_RATE = 0.007;
export const COLD_WORK_MIN = 0.6;
export const COLD_HEALTH_DRAIN = 0.04;

/**
 * How much slower a villager eats and burns fuel than the original tuning.
 *
 * The rates below read as "a season's ration" and are billed continuously, so dividing them here
 * slows the drain on the stores without changing the shape of anything: larder targets, the
 * "seasons banked" mood check and the low-stores warnings are all derived from the same two
 * numbers and scale with them. Production is untouched, so this is a straight loosening of the
 * survival pressure — one number to turn if it wants tightening again.
 */
export const CONSUMPTION_SLOWDOWN = 3;
/**
 * Food eaten per adult per season (a child eats `CHILD_FOOD_FACTOR` of it).
 *
 * Set *directly*, decoupled from `CONSUMPTION_SLOWDOWN`, because food and fuel want tuning apart:
 * the slowdown stays 3 for heat, but food is deliberately tighter than the 20 that divisor would
 * give. Measured production is ~142 food per worker per season, so one three-job food building (~426)
 * still feeds the founding twelve with room to spare — but its ceiling is ~12 adults, so the first
 * wave of births pushes a growing village past it and a *second* food building becomes the thing to
 * build before the opening food stock (1200) runs down. That is the intended pressure: food scales
 * with the village rather than being solved once by a single hut. Turning this up tightens it
 * further; down loosens it. (See PLAYTEST B6 for the balance work behind the number.)
 */
export const FOOD_PER_CITIZEN_PER_SEASON = 35;
export const HEAT_PER_CITIZEN_WINTER = 40 / CONSUMPTION_SLOWDOWN; // heat units; firewood = 1, coal = 2
export const FIREWOOD_HEAT = 1;
export const COAL_HEAT = 2;
/**
 * Coats worn out per villager over a *winter* season. Spring, autumn and summer are scaled down
 * by `SEASON_BURN`, so a year costs 2.05x this — averaging out to about one coat per villager per
 * season, which is the rule this is tuned to.
 *
 * At 2 the founding twelve get through their first year on the 48 coats they start with and
 * nothing over. A tailor makes `TAILOR_CLOTHING_OUT` (6) a worker a season, so two tailors' worth
 * of work covers a village of roughly this size — which is the point: coats are meant to be
 * scarce until the village is big enough to keep a tailor in leather.
 */
export const CLOTHING_PER_CITIZEN_WINTER = 2;
/**
 * Tools worn out by one worker-season of *actual labour* — one tool for a full season worked flat
 * out. This is the anchor the work-based wear rates below derive from; it is no longer billed
 * directly.
 *
 * Wear is charged as work is performed, not once a season by headcount: a producer wears a slice of
 * a tool each time they complete a work cycle, a builder as they lay construction-work. A worker who
 * stood idle all season (a smith with no iron, a woodcutter with no wood) completes no cycles and so
 * wears nothing — the flat old rule charged them a full tool regardless. Because the slices are
 * calibrated to sum to exactly this at full tilt, a fully-fed village pays the same tool bill it
 * always did; only idle time is now free, which quietly rewards keeping producers supplied.
 *
 * A village starts with 48 tools — twelve villagers' worth of a full year. A blacksmith turns out
 * `SMITH_IRON_TOOLS_OUT` (8) a worker a season, so one staffed smithy keeps about sixteen workers in
 * tools once they are all busy.
 */
export const TOOL_WEAR_PER_WORKER = 1;

/**
 * Tool wear charged when a producer completes one work cycle (`WORK_SECONDS` of labour). Derived so
 * that a worker cycling without pause for a whole season wears exactly `TOOL_WEAR_PER_WORKER` — the
 * old flat rate — while a blocked or commuting worker, who completes fewer cycles, wears less. Wear
 * is per *cycle*, not per unit produced, so an educated or steel-equipped worker (more output at the
 * same cadence) wears at the same pace: a tool wears from use, not from yield.
 */
export const TOOL_WEAR_PER_CYCLE = (TOOL_WEAR_PER_WORKER * WORK_SECONDS) / SEASON_LENGTH;

/**
 * Tool wear charged per unit of builder-work laid down (`BUILD_WORK_RATE` is 1 unit a second at the
 * site). Anchored to the same per-second-of-active-labour rate as a producer's cycle wear, so a
 * builder hammering flat out for a season wears about one tool, and a quiet build queue costs little.
 * Construction now draws on the tool supply the way every other trade does — a big build boom leans
 * on the barns' tools, not just their timber.
 */
export const TOOL_WEAR_PER_BUILD_WORK = TOOL_WEAR_PER_WORKER / SEASON_LENGTH;

/**
 * What one villager gets through in a season, for the goods where that is the real measure.
 *
 * A percentage of a cap says nothing useful about food or fuel: what matters is whether the
 * village can feed and heat the people it has. These floors sit under the fraction above — the
 * warning fires on whichever is higher — so a big cap cannot hide a village a season from
 * starving, and a small one does not cry wolf.
 */
export const PER_CITIZEN_SEASON_NEED: Partial<Record<LimitKey, number>> = {
  food: FOOD_PER_CITIZEN_PER_SEASON,
  firewood: HEAT_PER_CITIZEN_WINTER,
  clothing: CLOTHING_PER_CITIZEN_WINTER,
  tools: TOOL_WEAR_PER_WORKER,
};

/**
 * The tool ladder, as an output multiplier on every worker's labour. Bare hands are slower; an iron
 * tool is the baseline a trade is balanced around; steel is a real, if modest, step past it.
 *
 *   no tool  → 0.75  (`NO_TOOLS_PENALTY`)
 *   iron     → 1.00  (`IRON_TOOL_PROD`)
 *   steel    → 1.15  (`STEEL_TOOL_PROD`)
 *
 * `NO_TOOLS_PENALTY` was 0.6 (a 40% cut) until a playtest showed it acting as the single biggest
 * lever on survival rather than a modest one: since food, wood and firewood all draw on the same
 * villager-hours, a 40% cut to every non-farm trade doesn't just slow the trades it hits — it forces
 * a much bigger *share* of the workforce onto food to stand still, leaving too few hands for the
 * winter wood/firewood that food shortage was never supposed to compete with. Losing every tool in
 * the village should hurt and should make the case for a smith, not make the difference between a
 * bad season and an unrecoverable one. 0.75 matches `COLD_WORK_FACTOR` — the "going without, but
 * still working" tier this codebase already uses for an uncoated-but-warm villager — rather than
 * `COLD_WORK_MIN`'s crisis-grade 0.6, which is reserved for an actively freezing one. A quarter cut
 * raises the food-workforce share by 1/0.75 ≈ 1.33× instead of 1/0.6 ≈ 1.67×, which is the difference
 * between "tighten your belt" and "cascading collapse" for a village already running close to the
 * wire. See PLAYTEST.md B7.
 *
 * Steel's pull is deliberately *not* a doubling: its main draw is that it lasts twice as long
 * (`STEEL_DURABILITY`), so a village re-forges tools half as often. The +15% is the sweetener on
 * top, not the whole reason to bother — the reason is the coal-fed second mine it takes to make it.
 *
 * Applied **per villager**, not village-wide: each citizen holds (or doesn't hold) a real tool of
 * their own — `Citizen.tool` — picked up opportunistically from a barn's stock the next time they
 * pass through one (see `tryEquipTool`), and worn down by their own labour (`wearCitizenTool`)
 * until it breaks and they go bare-handed again until their next barn visit. A shortage is
 * therefore a *gradient* across the workforce (some villagers equipped, some not) rather than a
 * single village-wide switch that drops every trade at once the moment the last tool anywhere
 * breaks — the earlier village-wide model this ladder was designed against.
 */
export const NO_TOOLS_PENALTY = 0.75; // output multiplier for a villager holding no tool at all
export const IRON_TOOL_PROD = 1.0;
export const STEEL_TOOL_PROD = 1.15;
/** A steel tool wears out over this many worker-seasons — twice an iron tool's one. */
export const STEEL_DURABILITY = 2;

/**
 * What going without a winter coat does, now that it no longer kills. A villager kept warm by the
 * fire survives the winter uncoated — the fuel bill is what a coat was ever really about (see
 * `CLOTHED_HEAT_FACTOR`) — but they are cold and miserable for it:
 *
 * - `COLD_WORK_FACTOR` — output multiplier for an uncoated worker in winter. Numb hands work slower.
 * - `UNCLOTHED_HEALTH_PENALTY` / `UNCLOTHED_HAPPY_PENALTY` — how far their health and happiness
 *   *targets* fall while uncoated. Charged to the target, not docked outright, so they slide toward
 *   a lower level over the season and recover once dressed again rather than dropping like a stone.
 */
export const COLD_WORK_FACTOR = 0.75;
export const UNCLOTHED_HEALTH_PENALTY = 15;
export const UNCLOTHED_HAPPY_PENALTY = 12;

/**
 * Seasonal draw on firewood and clothing. Both are used *year-round*, not only over winter:
 * villagers still cook and still wear through clothes in summer. Winter is the anchor at 1.0 (so
 * winter costs exactly what it always did), spring and autumn are moderate, and summer is light.
 *
 * Firewood is billed against this rate every tick (`heat`), so the woodpile drains slowly in
 * summer and fast in winter rather than dropping in one lump at the turn of a season. Clothing is
 * still issued once a season — a garment wears out over months, not by the hour.
 *
 * Note this raises the *annual* firewood and clothing bill — previously only winter drew on them.
 */
export const SEASON_BURN: Record<Season, number> = {
  Winter: 1,
  Spring: 0.45,
  Autumn: 0.45,
  Summer: 0.15,
};

/**
 * Firewood multiplier for a villager who got a clothing ration this season. Being warmly dressed
 * means less fuel burned, so clothing production pays for itself twice over.
 */
export const CLOTHED_HEAT_FACTOR = 0.75;

// ---- Household larders (villagers keep their own supplies at home) ----
/**
 * Villagers stock food, firewood and medicine in the house they live in and draw on that before
 * the village barns. Anything sitting in a larder is committed to those residents, so it is
 * deliberately excluded from the barn totals the top-line HUD reports — the HUD number is what is
 * *free*, not what exists.
 *
 * A larder holds this many seasons' worth of supply per resident. Below 1 the barns remain the main
 * store and a household tops up between seasons; at 1 a house is self-sufficient for a full season
 * but its resident hauler spends most of that season fetching, which is a large economy shift.
 */
export const HOUSE_LARDER_SEASONS = 0.5;
export const HOUSE_FOOD_PER_RESIDENT = FOOD_PER_CITIZEN_PER_SEASON * HOUSE_LARDER_SEASONS;
export const HOUSE_FIREWOOD_PER_RESIDENT = HEAT_PER_CITIZEN_WINTER * HOUSE_LARDER_SEASONS;
/** Doses kept at home per resident — enough to treat a household through an outbreak. */
export const HOUSE_MEDICINE_PER_RESIDENT = 2;
/**
 * Warm clothing kept at home per resident — a season's worth, so a household that has been
 * supplied is dressed for the winter out of its own press.
 *
 * Clothing used to be issued straight from the barns and never went home. Keeping it in the
 * larder makes "is this family clothed?" a property of the household rather than of the village
 * average, which is what the renderer draws: a villager wears a coat when their home holds
 * clothing and goes without when it does not.
 */
export const HOUSE_CLOTHING_PER_RESIDENT = CLOTHING_PER_CITIZEN_WINTER * HOUSE_LARDER_SEASONS;
/**
 * Fraction of its target a larder must fall to before the household bothers restocking it.
 *
 * A household checks its goods in a fixed order, so without a threshold the first item to dip by
 * any amount monopolises every trip. Restocking in batches lets one errand run cover food, then
 * fuel, then medicine.
 */
export const LARDER_RESTOCK_AT = 0.6;
/**
 * The fraction below which a larder is not merely due a top-up but actually running out.
 *
 * A household under this sends every free resident to the barn instead of one, and the errand
 * outranks both paid work and a leisure break. Set well under `LARDER_RESTOCK_AT` so the ordinary
 * case is still one villager doing the shopping while everyone else keeps working — this is the
 * emergency, not the routine.
 */
export const LARDER_URGENT_AT = 0.25;
/** Most residents of one house that may be out on a grocery run at the same time. */
export const MAX_LARDER_SHOPPERS = 3;
/** Resources a household keeps at home, in the order a resident restocks them. */
export const LARDER_KINDS: ResourceKind[] = ['firewood', 'clothing', 'medicine'];

/**
 * Carrying space for a grocery run — a proper basket of provisions, rather than the single
 * work-load a labourer shifts.
 *
 * A household eats its whole larder every season, so its one shopper must haul that much again
 * just to break even; too small a basket and the larder sits near empty forever while still
 * costing a villager their working day.
 *
 * Kept at ×3 rather than trimmed once volume quadrupled food-per-load: firewood is a volume-1
 * good, so a smaller multiplier would have *reduced* how much fuel a shopper brings home per trip
 * and broken larder stocking for the one resource that has to be there before winter.
 */
export const LARDER_CARRY_VOLUME = CARRY_VOLUME * 3;

// ---- Demographics ----
/**
 * How many years a villager ages per year of the calendar.
 *
 * Age used to advance in step with the calendar, which forced a choice between ages that read
 * like ages and a village that grows inside a session — and it had picked neither: a villager was
 * a working adult at "4", could not have children until "6", and the founders were 20. Six years
 * of play, twenty-four seasons, before a newborn could have a child of its own.
 *
 * Uncoupling the two lets both be true. The ladder below is in human years and reads like one;
 * divide by this to get the play time. A child is grown in three years, or four with schooling.
 */
export const AGE_PER_YEAR = 4;
/**
 * The age childhood ends. A child neither works, keeps a house, nor starts a family before this —
 * they live with their parents until they come of age at sixteen, schooled or not.
 *
 * This used to be twelve, with only a schooled child staying on to sixteen. It is sixteen for
 * everyone now: growing up and leaving home is a fixed age, and school is a thing you do *during*
 * those years rather than the price of an extra few of them.
 */
export const ADULT_AGE = 16;
/**
 * Enrolment age: a child old enough to go to school, if the village has a staffed one.
 *
 * School fills the last years of childhood (twelve to sixteen) rather than buying extra ones — a
 * child comes of age at `ADULT_AGE` whether or not they attended. Enrolment is still what sets
 * `educated`, so a child has to actually sit in class, not merely grow up while a school stands
 * somewhere.
 */
export const SCHOOL_START_AGE = 12;
export const SCHOOL_LEAVING_AGE = 16;
/** A university year, and the age a student who sits it finally goes to work. */
export const UNIVERSITY_YEARS = 1;
export const UNIVERSITY_LEAVING_AGE = SCHOOL_LEAVING_AGE + UNIVERSITY_YEARS * AGE_PER_YEAR;
/** Study, in years of the calendar — `SCHOOL_START_AGE` to `SCHOOL_LEAVING_AGE` at `AGE_PER_YEAR`. */
export const SCHOOL_YEARS = (SCHOOL_LEAVING_AGE - SCHOOL_START_AGE) / AGE_PER_YEAR;
/** Fraction of the school years a child must actually sit to count as educated. */
export const SCHOOL_ATTENDANCE = 0.5;
export const START_ADULTS = 8; // founding adult villagers
export const START_CHILDREN = 4; // founding children
export const ADULT_MIN_AGE = 20; // founding adults' age range
export const ADULT_MAX_AGE = 29;
export const CHILD_MIN_AGE = 6; // founding children spawn in [CHILD_MIN_AGE, ADULT_AGE)

// ---- Leisure (villagers take occasional breaks from work) ----
/**
 * A season's entry in the Town Hall books.
 *
 * `net` is the change in the stores across the season, taken by comparing the totals themselves,
 * so it cannot drift. `out` is what was consumed out of them. What came *in* is `net + out` — a
 * derived figure rather than a third measurement, which is what makes the three reconcile exactly
 * instead of nearly.
 */
export interface LedgerRow {
  year: number;
  /** The season that just ended (index into `SEASONS`). */
  season: number;
  net: Partial<Record<ResourceKind, number>>;
  out: Partial<Record<ResourceKind, number>>;
}

/** Seasons of books the hall keeps — two years, enough to read a trend off. */
export const LEDGER_SEASONS = 8;

// ---- Policies (enacted at the Town Hall) ------------------------------------------------------
/**
 * A standing rule the village lives under. Every one is a trade: something gained paid for with
 * something given up, so enacting one is a decision rather than an upgrade.
 *
 * How many can stand at once is not a constant — it is how many clerks are actually working the
 * Town Hall, so a policy costs a pair of hands to keep as well as a price to run. Lose the clerk
 * and the rule lapses until someone takes the desk again.
 */
export type PolicyId = 'rationing' | 'longHours' | 'conservation' | 'openGates';

export const POLICIES: PolicyId[] = ['rationing', 'longHours', 'conservation', 'openGates'];

export const POLICY_META: Record<PolicyId, { label: string; emoji: string; gain: string; cost: string }> = {
  rationing: { label: 'Rationing', emoji: '🥣', gain: 'Eats 20% less food', cost: 'Happiness −8' },
  longHours: { label: 'Long Hours', emoji: '⏳', gain: 'Produces 12% more', cost: 'Health −6' },
  conservation: { label: 'Conservation', emoji: '🌱', gain: 'Woods regrow 50% faster', cost: 'Foresters fell 15% less' },
  openGates: { label: 'Open Gates', emoji: '🚪', gain: 'Twice as many newcomers', cost: 'Half again as likely to arrive sick' },
};

export const POLICY_RATION_FOOD = 0.8;
export const POLICY_RATION_HAPPY = 8;
export const POLICY_HOURS_PROD = 1.12;
export const POLICY_HOURS_HEALTH = 6;
export const POLICY_CONSERVE_REGROW = 1.5;
export const POLICY_CONSERVE_LUMBER = 0.85;
export const POLICY_GATES_IMMIGRATION = 2;
export const POLICY_GATES_SICK = 1.5;

/** A festival is an act, not a rule: paid for once, felt once. Needs a clerk to organise it. */
export const FESTIVAL_FOOD = 60;
export const FESTIVAL_HAPPY = 20;

/** True if `id` is one of the village's standing rules *and* a clerk is free to keep it. */
export function policyActive(
  s: { policies?: PolicyId[]; buildings: Building[] },
  id: PolicyId,
): boolean {
  return activePolicies(s).includes(id);
}

/**
 * The rules actually in force: those the player has enacted, capped by the clerks at their desks.
 *
 * Capped rather than culled on purpose. A hall that loses a clerk suspends its last rule instead
 * of forgetting the player ever chose it, so staffing the desk again brings the rule back rather
 * than making them go and find it.
 */
export function activePolicies(s: { policies?: PolicyId[]; buildings: Building[] }): PolicyId[] {
  const want = s.policies ?? [];
  if (want.length === 0) return [];
  return want.slice(0, policyCapacity(s));
}

/** How many rules the village can keep: one per clerk at work in a standing Town Hall. */
export function policyCapacity(s: { buildings: Building[] }): number {
  let n = 0;
  for (const b of s.buildings) {
    if (b.built && b.type === 'townhall') n += Math.min(b.workers.length, BUILDING_DEFS.townhall.jobs);
  }
  return n;
}

export const LEISURE_CHANCE_PER_SEC = 1 / 90; // ~one break per 90s of work
export const LEISURE_MIN_SECONDS = 12;
export const LEISURE_MAX_SECONDS = 24;
export const CHILD_FOOD_FACTOR = 0.5; // children eat this fraction of an adult ration
// ---- Reproduction ----
/**
 * Base chance a fertile household bears a child in a season, before the food-surplus and wellbeing
 * modifiers below. A household needs a fertile couple *and* room for the child.
 *
 * Sized against a year, which is four seasons: a household that merely *qualifies* — a season of
 * food banked and middling health and happiness — should still average about one child a year, and
 * a thriving one roughly two. The modifiers are therefore shallow (see BIRTH_SURPLUS_FLOOR and
 * BIRTH_WELLBEING_FLOOR): they are the difference between a growing village and a booming one, not
 * between growth and none. Falling under a season of food is what stops births outright.
 */
export const BIRTH_CHANCE = 0.5;
/**
 * Hard ceiling on how many children one couple raises. A family stops growing here however well-fed
 * and housed it is — the single strongest brake on a village turning exponential.
 */
export const MAX_CHILDREN_PER_COUPLE = 4;
/**
 * How the odds of the *next* child fall as a family fills, indexed by children already borne.
 *
 * A couple takes the first child readily and the fourth only rarely, so a village grows steadily
 * rather than every fertile pair running straight to the cap. These multiply the season's base
 * birth chance (`BIRTH_CHANCE` after its food/wellbeing modifiers), so the shape below is what the
 * player feels: first ~0.9, then 0.75, 0.5, 0.15 of the base rate, and nothing past four. The
 * fourth child is deliberately a long shot — most families settle at two or three.
 */
export const BIRTH_PARITY_FACTOR = [0.9, 0.75, 0.5, 0.15];
/** Share of the birth chance a household keeps with no food surplus beyond the one-season gate. */
export const BIRTH_SURPLUS_FLOOR = 0.7;
/** Share of the birth chance a household keeps at rock-bottom health and happiness. */
export const BIRTH_WELLBEING_FLOOR = 0.8;
/**
 * The fertile years. Villagers come of age at ADULT_AGE and can work, but only bear children inside
 * this window — below it they are too young, above it they stop (just before old age sets in).
 */
/**
 * Fertility opens at adulthood rather than years after it. The old gap — grown at 4, fertile at 6
 * — was two years in which a village had mouths it could not turn into more villagers, and it was
 * the single largest part of the wait between one generation and the next.
 */
export const FERTILE_MIN_AGE = ADULT_AGE;
export const FERTILE_MAX_AGE = 45;
/**
 * Seasons of food in store that earn the *full* fertility bonus. Below one season's worth no
 * household will bear a child at all; the bonus ramps from there up to this surplus.
 */
export const BIRTH_FOOD_SURPLUS_TARGET = 2;

export const OLD_AGE_START = 60; // old-age deaths begin at this age
export const MAX_AGE = 80; // by this age old-age death is near-certain each year
/**
 * What learning is worth at the bench.
 *
 * School is a quarter more work than none. A university year on top of it adds fifteen per cent
 * again — compounding, not replacing, because the second year is built on the first.
 */
export const EDUCATED_BONUS = 1.25;
export const GRADUATE_BONUS = EDUCATED_BONUS * 1.15;
/**
 * Years of life learning buys, and how much it softens the odds each year past that.
 *
 * A schooled villager knows what water to drink and when to rest; one who went further knows more
 * again. Modelled as both halves of the same thing the ageing roll already uses: old age starts
 * later, and having started, kills more slowly.
 */
export const EDUCATED_LONGEVITY_YEARS = 6;
export const GRADUATE_LONGEVITY_YEARS = 12;
export const EDUCATED_DEATH_FACTOR = 0.8;
export const GRADUATE_DEATH_FACTOR = 0.65;

export const START_HEALTH = 80;
export const START_HAPPINESS = 80;

// ---- Housing & amenities ----
export const STONE_HOUSE_CAPACITY = 10; // villagers a stone house shelters (a larger family still)
export const STONE_HOUSE_HEAT_FACTOR = 0.6; // stone-house residents need less winter fuel
/** Bunks in the boarding house — three storeys of them. */
export const SHELTER_CAPACITY = 18;
/**
 * Happiness lost by anyone sleeping in the shelter rather than a home of their own.
 *
 * A bed in a dormitory keeps a villager alive and nothing more. The penalty is what makes a
 * village housed in the boarding house visibly worse off than one with houses, so the pressure to
 * build proper homes is something the player feels rather than something the game announces.
 */
export const SHELTER_HAPPY = 12;
/**
 * How often a quarry load comes up sand instead of stone.
 *
 * A share of the same output rather than a second stream on top: sand is what a quarry digs
 * *instead of* stone that trip, so choosing to make glass costs the town masonry. A fifth is
 * enough to feed a workshop without gutting the stone supply.
 */
export const QUARRY_SAND_SHARE = 0.22;
/** A grand house is warmer again than a stone one — its household burns barely half the fuel. */
export const GRAND_HOUSE_HEAT_FACTOR = 0.45;
/** Happiness a grand house is worth to the people living in it, and to nobody else. */
export const GRAND_HOUSE_HAPPY = 10;
/**
 * Souls one priest can keep. A chapel has one; a cathedral three.
 *
 * Worship used to be a yes-or-no: build a chapel anywhere and the whole village felt it, however
 * many thousand of them there were. Capacity is what makes a cathedral worth its two hundred stone
 * — a town outgrows its chapel the same way it outgrows its barns.
 */
export const CONGREGATION_PER_PRIEST = 100;
/** Happiness a monument is worth to the whole town, for doing nothing whatsoever. */
export const HAPPY_MONUMENT = 15;
/** Students one teacher (or one professor) can take. */
export const STUDENTS_PER_TEACHER = 10;
export const HAPPY_TAVERN = 12; // happiness from a staffed, stocked tavern
export const HAPPY_CHAPEL = 10; // happiness from a chapel
export const HAPPY_CEMETERY = 8; // happiness from a cemetery
export const DEATH_UNREST = 10; // happiness hit when villagers die and there is no cemetery
export const TAVERN_GRAIN_PER_SEASON = 10; // grain a staffed tavern brews into ale each season

// ---- Immigration (nomads seeking a home) ----
export const IMMIGRATION_CHANCE = 0.25; // per-season chance when a food surplus draws newcomers
/**
 * Seasons of food the village must have banked before nomads think it worth joining.
 *
 * Tuned as an absolute quantity, not a multiple of the ration: it was 1.5 seasons when a season
 * cost 60 a head, and is 4.5 now that `CONSUMPTION_SLOWDOWN` has taken that to 20 — the same
 * larder, described against a smaller ration.
 */
export const NOMAD_SURPLUS_SEASONS = 4.5;
export const IMMIGRATION_MIN = 4; // fewest nomads in an arriving band
export const IMMIGRATION_MAX = 12; // most nomads in an arriving band
export const IMMIGRANT_SICK_CHANCE = 0.15; // chance a newcomer arrives already sick

// ---- Disease & fire ----
export const DISEASE_CHANCE = 0.06; // base chance per season of an outbreak
export const DISEASE_INFECT_FRACTION = 0.3; // share of the healthy who fall ill
export const SICK_RECOVER_BASE = 0.4; // per-season recovery chance, unaided
export const SICK_RECOVER_MEDICINE = 0.3; // bonus per dose of medicine administered
export const SICK_RECOVER_HOSPITAL = 0.2; // bonus if a staffed hospital exists
export const SICK_DEATH_CHANCE = 0.15; // per-season death chance while still sick
/** Doses a staffed hospital will spend on one patient in a season — a full course, each dose adding
 *  `SICK_RECOVER_MEDICINE` to the odds. Without a hospital a household manages a single dose. */
export const SICK_CURE_HOSPITAL_DOSES = 3;
/** No amount of medicine makes a cure certain — the odds are capped here. */
export const SICK_CURE_CHANCE_CAP = 0.95;
/**
 * A staffed hospital keeps the whole village a little healthier year-round, not only during an
 * outbreak: it draws `HOSPITAL_MEDICINE_PER_CITIZEN` of medicine a head each season and, for it,
 * lifts the health everyone settles at by up to `HOSPITAL_HEALTH_BONUS` (scaled by how much of that
 * medicine the stores could actually cover).
 */
export const HOSPITAL_HEALTH_BONUS = 10;
export const HOSPITAL_MEDICINE_PER_CITIZEN = 0.15;
export const MED_LOAD = 5; // medicine produced per herbalist work cycle (× forest)
export const FIRE_CHANCE = 0.05; // base chance per season a building ignites
/**
 * How many water deliveries a fire needs, from any well, before the building is even in the
 * running to survive. Below this it is an *untreated* fire — see `FIRE_SURVIVAL_CHANCE` below and
 * `runFirefighter`/`processFires` in `simulation.ts`, which is where the deliveries actually
 * happen: a villager round-trips between the nearest well to the fire and the fire itself, and how
 * many trips land before `FIRE_BURN_SECONDS` runs out is purely a function of how far that well is
 * and how many hands are free to make the trip. Wells no longer prevent ignition on their own —
 * this is the only thing distance to one now buys a village.
 */
export const FIRE_DOUSE_TRIPS_NEEDED = 3;
/**
 * How far (tiles) a villager will drop what they're doing — their job, their break, a laborer's
 * harvesting or road-laying — to go help fight a fire. This is deliberately not the free-labour
 * pool alone: a fire is the whole village's emergency, so any adult within reach responds,
 * employed or not (see `nearbyFire`/`runCitizen`). It is bounded so a mine on the far side of the
 * map does not empty itself over a cottage fire nobody there could reach in time anyway.
 */
export const FIRE_RESPONSE_RADIUS = 24;
/**
 * Chance a collapsing building sets a neighbour alight, by how far away the neighbour is.
 *
 * Rolled once per neighbour when a fire finishes burning, so a blaze in a tight row of houses can
 * chain — which is the point. `NEAR` covers buildings with one clear tile between them: a real
 * but slim risk, and the reason leaving gaps in a street is worth doing.
 */
export const FIRE_SPREAD_ADJACENT = 0.25;
export const FIRE_SPREAD_NEAR = 0.03;
/**
 * Multiplier on both catching fire and being caught, for buildings built of masonry.
 *
 * Stone houses previously burned exactly as readily as timber ones, which made the upgrade look
 * like a pure fuel saving. Halving both odds is what makes rebuilding a street in stone a
 * decision about fire as well as warmth.
 */
export const STONE_FIRE_FACTOR = 0.5;
/** Buildings whose walls are masonry — see STONE_FIRE_FACTOR. */
export const STONE_BUILT: BuildingType[] = ['stonehouse', 'chapel', 'townhall'];
export function isStoneBuilt(type: BuildingType): boolean {
  return STONE_BUILT.includes(type);
}
/**
 * How long a building spends BURNING before the outcome (survive/destroy) is decided.
 *
 * Tied to `SEASON_LENGTH` rather than picked out of the air: an eighth of a season is ~75 real
 * seconds at 1× — long enough that a player who is actually looking at the village (the game
 * itself drops back to 1× the moment anything catches — see `disasterAlert`) has time to notice
 * the 🔥, free up hands to fight it, and reassign whoever the building just let go — but short
 * enough that a fire is still a crisis, not a slow leak the player can ignore.
 */
export const FIRE_BURN_SECONDS = SEASON_LENGTH / 8;
/**
 * Chance a fire that got `FIRE_DOUSE_TRIPS_NEEDED` water in time survives as DAMAGED rather than
 * being destroyed outright. Masonry halves the destroy chance the same way it halves everything
 * else about fire — see `STONE_FIRE_FACTOR` — so a stone building is still more likely to come
 * through it than a timber one. An *untreated* fire (see `FIRE_DOUSE_TRIPS_NEEDED`) never reaches
 * this roll at all — it always burns down.
 */
export const FIRE_SURVIVAL_CHANCE = 0.55;
/** Floor on `fireIntensity` while a building is still burning — a fire is never drawn as fully
 *  out until it actually is; this is what keeps the very first frame from reading as unlit. */
export const FIRE_MIN_INTENSITY = 0.16;
/**
 * How large a fire reads right now, 0..1 — for the renderers only, no gameplay effect.
 *
 * Grows with how long it has burned (barely alight at ignition, largest just before it would
 * collapse), the same way a real fire spreads and climbs the longer it goes unanswered. A bucket
 * brigade runs the other way: every load of water landed (`fireWater`, against
 * `FIRE_DOUSE_TRIPS_NEEDED`) damps it back down, so a fire being fought visibly shrinks *before*
 * `processFires` actually resolves it — the flame dying down is the tell that it is being won,
 * not only the burn-down/survive result at the very end.
 */
export function fireIntensity(b: Building): number {
  if (!b.fireTimer) return 0;
  const age = 1 - Math.max(0, Math.min(1, b.fireTimer / FIRE_BURN_SECONDS));
  const doused = Math.min(1, (b.fireWater ?? 0) / FIRE_DOUSE_TRIPS_NEEDED);
  return Math.max(FIRE_MIN_INTENSITY, age) * (1 - doused);
}
/**
 * Repair reuses the ordinary construction pipeline (see `pickSite`/`runBuilder` in
 * `simulation.ts`), just against a smaller bill: a burnt-out shell needs new timbers and a roof,
 * not a whole new foundation. One dial for both the materials and the labour, the same way
 * `DEMO_WORK_FRACTION` is one dial for a teardown.
 */
export const REPAIR_FRACTION = 0.4;
export function repairWorkOf(type: BuildingType): number {
  return buildWorkOf(type) * REPAIR_FRACTION;
}
/** What repairing this building costs, at the size it was actually raised. Rounded up so a small
 *  repair never costs nothing. */
export function repairCostOf(b: Placed): Partial<Record<ResourceKind, number>> {
  const cost = costOf(b);
  const out: Partial<Record<ResourceKind, number>> = {};
  for (const k of Object.keys(cost) as ResourceKind[]) {
    out[k] = Math.max(1, Math.ceil((cost[k] ?? 0) * REPAIR_FRACTION));
  }
  return out;
}
/** How far a repair has got, 0..1. */
export function repairFraction(b: Building): number {
  const total = repairWorkOf(b.type);
  if (total <= 0) return 1;
  const p = (b.repairProgress ?? 0) / total;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

// ---- Production (per assigned worker, per season, before local factors) ----
export const GATHER_FOOD_PER_SEASON = 15;
export const FISH_FOOD_PER_SEASON = 16;
export const HUNT_FOOD_PER_SEASON = 10;
export const HUNT_LEATHER_PER_SEASON = 4;
/** The hide off every kill, as a fraction of a material work-load: hunting yields its venison and
 *  this leather together now, rather than one cut *or* the other, so the tailor always has hide. */
export const HUNT_HIDE_FRACTION = 0.4;
export const RANCH_FOOD_PER_SEASON = 12;
export const RANCH_LEATHER_PER_SEASON = 5;
export const LUMBER_WOOD_PER_SEASON = 13;
export const WOODCUT_FIREWOOD_PER_SEASON = 18;
export const WOODCUT_WOOD_PER_SEASON = 11;
export const FARM_FOOD_PER_WORKER = 320; // at full growth, paid at autumn harvest (hauled from the field)
export const QUARRY_STONE_PER_SEASON = 9;
export const MINE_COAL_PER_SEASON = 7;
export const MINE_IRON_PER_SEASON = 6;
// Blacksmith recipes (per worker per season): inputs consumed -> tools produced.
export const SMITH_IRON_IN = 6;
export const SMITH_IRON_TOOLS_OUT = 8;
export const SMITH_STEEL_IRON_IN = 6;
export const SMITH_STEEL_COAL_IN = 4;
export const SMITH_STEEL_TOOLS_OUT = 14; // steel: more tool-units per iron (lasts longer)
export const TAILOR_LEATHER_IN = 8;
export const TAILOR_CLOTHING_OUT = 6;

// ---- Starting stockpile / population ----
/**
 * Opening stockpile per difficulty, in the units the barn actually receives.
 *
 * These were formerly written at a third of their real size and multiplied by a
 * `STARTING_STOCK_SCALE` of 3 on the way in, which meant the table said 120 tools and the game
 * gave 360. The scale is folded in here now: what you read is what you get.
 *
 * **Food, tools and coats are the same on every difficulty** — 1200 food, 48 tools and 48 coats —
 * because they are tuned against the founding twelve rather than against difficulty (see
 * `TOOL_WEAR_PER_WORKER` and `CLOTHING_PER_CITIZEN_WINTER`: roughly a year's worth, so the first
 * winter is survivable and the second is not unless a blacksmith and a tailor are running).
 *
 * What difficulty changes is the leg-up: Easy hands over building materials, a winter's firewood,
 * a little medicine and `EASY_START_HOUSES` finished houses. **Normal and Hard start with no
 * firewood at all** — the game opens in Early Spring, only winter kills, and a coat plus a roof
 * carries a villager to the turn of the year, so the three seasons before it are the ones in which
 * houses have to go up and a woodcutter has to fill them. Nothing is handed over: no wood, no
 * stone, no medicine, no fuel.
 */
const SURVIVAL_START = {
  fruit: 300, grain: 300, fish: 300, beef: 300, // 1200 food all told
  tools: 48,
  clothing: 48,
} as const;
/**
 * Hard's cut, applied to everything `SURVIVAL_START` hands over.
 *
 * Hard and Normal were the same game — identical stock, identical limits, neither with houses —
 * while the difficulty picker promised Hard came with "half the food, fuel and tools". Two of the
 * three settings did nothing different. This is the half.
 *
 * It bites through the *second* year rather than the first: 600 food is still a comfortable three
 * seasons for the founding twelve, but 24 tools and 24 coats are half a year's wear rather than a
 * full one, so a blacksmith and a tailor stop being things to get round to eventually.
 */
const HARD_FACTOR = 0.5;
export const DIFFICULTY_RESOURCES: Record<Difficulty, Partial<Resources>> = {
  easy: { ...SURVIVAL_START, wood: 660, stone: 120, medicine: 50, firewood: 600 },
  normal: { ...SURVIVAL_START },
  hard: Object.fromEntries(
    Object.entries(SURVIVAL_START).map(([k, v]) => [k, Math.round(v * HARD_FACTOR)]),
  ) as Partial<Resources>,
};

// ---- Trade (barter by relative value; merchant keeps a margin) ----
export const TRADE_VALUE: Record<ResourceKind, number> = {
  // The luxury chain. Sand is worth barely carrying; every step after it multiplies.
  sand: 1,
  glass: 5,
  jewelry: 20,
  // Trade-only: no village makes these, they come off a ship.
  gold: 10,
  dye: 6,
  silk: 8,
  // The fine bench's own goods — the most valuable things a town can make. A finished jewel reset
  // with gold, and dyed silk worked into a gown, each worth well more than what went into it. Fine
  // clothes are dear to make (a whole dye and two silk, all bought off a ship), so they must clear
  // that cost by a real margin the way every other bench does — see the chain note below.
  finejewelry: 40,
  fineclothes: 34,
  fruit: 1,
  grain: 1,
  corn: 1,
  potato: 1,
  rice: 1,
  barley: 1,
  carrot: 1,
  tomato: 1,
  onion: 1,
  pepper: 1.5,
  cabbage: 1,
  beans: 1,
  pumpkin: 1,
  apple: 1.5,
  grapes: 1.5,
  strawberry: 1.5,
  melon: 1.5,
  eggs: 1.5,
  fish: 1,
  beef: 1.5,
  venison: 1.5,
  mutton: 1.5,
  pork: 1.5,
  chicken: 1.5,
  milk: 1,
  wood: 1,
  firewood: 1.5,
  stone: 2,
  coal: 3,
  iron: 4,
  tools: 8,
  // Dearer than iron tools: more iron went in, plus the coal to carburise it, and it lasts twice
  // as long. Priced above tools but below where the extra durability would put it, so a village
  // still gains by keeping steel for its own workers rather than forging it only to sell.
  steeltools: 14,
  leather: 3,
  wool: 2.5,
  clothing: 6,
  cattle: 20,
  pigs: 14,
  sheep: 16,
  chickens: 8,
  medicine: 5,
};
/**
 * Trades settle at parity: goods are worth what TRADE_VALUE says, both directions.
 *
 * There used to be a 0.8 here — a 25% cut that turned 12 medicine at ◈5 into ◈75 with no
 * explanation anywhere in the UI, which reads as the merchant being unable to multiply. If a
 * merchant's margin is ever wanted back it belongs in the prices themselves, where a player can
 * see it, not as an invisible divisor.
 */
export const MERCHANT_MARGIN = 1;
export const MERCHANT_STAY_SEASONS = 1; // how many seasons a docked merchant lingers before sailing off
/** Seasons of quiet water after a merchant leaves, before another may sail in. */
export const MERCHANT_COOLDOWN_SEASONS = 1;
/**
 * Expected merchant arrivals per season, rolled a slice at a time every tick so a boat can appear
 * early, mid or late in a season rather than only at a turnover.
 *
 * A built trading post is the only requirement. Staffing it is what moves goods in and out of the
 * post, not what summons a trader — a merchant sailing past has no way of knowing whether the
 * village has someone rostered on the dock today.
 */
export const MERCHANT_ARRIVAL_CHANCE = 0.5;

/**
 * What each kind of merchant carries, and roughly how much. A visiting merchant rolls one
 * category and stocks these goods. Tweak freely — the trade UI reads straight from here and
 * from TRADE_VALUE. The 'seeds' merchant is special: it offers crop-seed unlocks (see
 * `seedStock`) rather than resources, so its table is empty.
 */
export const MERCHANT_CATEGORY_STOCK: Record<MerchantCategory, Partial<Record<ResourceKind, number>>> = {
  basics: { wood: 150, stone: 120, coal: 100, iron: 80, firewood: 120 },
  seeds: {},
  animals: { cattle: 6, pigs: 8, sheep: 8, chickens: 12 },
  foods: { grain: 160, corn: 120, potato: 120, fish: 140, beef: 80, venison: 60, mutton: 70, pork: 70, chicken: 70, milk: 90, eggs: 80 },
  goods: { tools: 60, clothing: 60, leather: 90, wool: 80, medicine: 40 },
  // The Port's holds are deeper than a river boat's — larger quantities, and the imported goods
  // no village can make for itself. The luxury goods (gold/dye/silk) are the *only* feed for the
  // fine benches, and the luxury fleet calls just once a year — so its hold has to be deep enough
  // that a city can keep a fine bench busy on one visit, and the winter fleet carries a second,
  // smaller top-up so the top of the chain is not starved for eleven months of the twelve.
  portgrain: { grain: 400, corn: 320, barley: 260, rice: 240 },
  portluxury: { gold: 40, silk: 30, dye: 45 },
  portindustrial: { iron: 240, coal: 260, tools: 140 },
  portgeneral: { medicine: 120, gold: 16, silk: 12, dye: 18, tools: 80 },
};

/** Label + emoji for each merchant category (shown in the trade UI header). */
export const MERCHANT_CATEGORY_META: Record<MerchantCategory, { label: string; emoji: string }> = {
  basics: { label: 'Materials Trader', emoji: '🪵' },
  seeds: { label: 'Seed Merchant', emoji: '🌱' },
  animals: { label: 'Livestock Trader', emoji: '🐄' },
  foods: { label: 'Food Merchant', emoji: '🍞' },
  goods: { label: 'Goods Merchant', emoji: '🛠️' },
  portgrain: { label: 'Northern Grain Fleet', emoji: '🌾' },
  portluxury: { label: 'Eastern Luxury Fleet', emoji: '💎' },
  portindustrial: { label: 'Ironworks Convoy', emoji: '⚒️' },
  portgeneral: { label: 'Winter Supply Fleet', emoji: '🧭' },
};

/** Is this one of the Port's scheduled fleets, rather than a river trader? */
export function isPortMerchant(c: MerchantCategory | null): boolean {
  return c !== null && PORT_CATEGORIES.includes(c);
}

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: {
    type: 'house', name: 'House', emoji: '🏠', category: 'housing', w: 2, h: 2,
    cost: { wood: 16, stone: 8 }, jobs: 0, work: 40,
    desc: 'Homes up to 8 villagers — a couple and their children — and a household with room to spare is one that can grow.',
  },
  stonehouse: {
    type: 'stonehouse', name: 'Stone House', emoji: '🏡', category: 'housing', w: 2, h: 2,
    cost: { wood: 8, stone: 30 }, jobs: 0, work: 60,
    desc: 'A warm, sturdy home for up to 10. Masonry holds its heat, so a household here burns 40% less firewood through the winter, and it is half as likely to catch fire. A wooden house can be upgraded to one in place.',
  },
  shelter: {
    type: 'shelter', name: 'Shelter', emoji: '🛏️', category: 'housing', w: 3, h: 5,
    cost: { wood: 100, stone: 60 }, jobs: 0, work: 160,
    desc: 'A boarding house: three storeys of bunks for up to 18 villagers who have nowhere else. Nobody courts or raises a family here, and living in one wears on a villager — it is the roof you put over newcomers while their houses go up.',
  },
  grandhouse: {
    type: 'grandhouse', name: 'Grand House', emoji: '🏰', category: 'housing', w: 2, h: 2,
    cost: { wood: 50, stone: 70, iron: 20 }, jobs: 0, work: 120, builders: 2,
    desc: 'A fine town house for up to 10. Double-skinned walls and glazed windows: its household burns less fuel again than a stone house, and living somewhere this good is worth 10 happiness to everyone under its roof. A stone house can be upgraded to one in place.',
  },
  university: {
    type: 'university', name: 'University', emoji: '🎓', category: 'civic', w: 5, h: 5,
    cost: { wood: 60, stone: 80, iron: 30 }, jobs: 5, work: 180, builders: 4,
    desc: 'Higher learning. School-leavers go straight on for another year, and come out working faster still — and living longer. Each of its five professors can take ten students.',
  },
  port: {
    type: 'port', name: 'Port', emoji: '⚓', category: 'trade', w: 7, h: 5,
    cost: { wood: 100, stone: 100, iron: 40 }, jobs: 5, work: 260, builders: 3,
    requiresWaterFraction: 1 / 3,
    desc: 'A deep-water quay: bigger traders, calling more reliably, and the only source of gold, dye and silk. Its fleets keep a calendar — one to a season — so trade becomes something you can plan a year around rather than wait for.',
  },
  cathedral: {
    type: 'cathedral', name: 'Cathedral', emoji: '🕍', category: 'civic', w: 7, h: 7,
    cost: { wood: 120, stone: 200, iron: 50 }, jobs: 3, work: 360, builders: 6,
    desc: 'A great church for a town too large for its chapel. Each of its three priests can keep a congregation of a hundred — three hundred souls in all, where a chapel serves one.',
  },
  luxury: {
    type: 'luxury', name: 'Luxury Workshop', emoji: '💎', category: 'resources', w: 5, h: 4,
    cost: { wood: 70, stone: 80, iron: 40 }, jobs: 3, work: 180, builders: 3,
    desc: 'One bench at a time: glass from sand and coal, jewellery from glass and iron, or — with luxuries off a ship — fine jewellery from jewellery and gold, and fine clothes from dye and silk. Jewellery is the reason anyone wants the grit a quarry brings up; the fine goods are the most valuable things a town can make, and are only ever sold, never worn.',
  },
  monument: {
    type: 'monument', name: 'Monument', emoji: '🗿', category: 'civic', w: 3, h: 3,
    cost: { wood: 50, stone: 250, iron: 60 }, jobs: 0, work: 400, builders: 4,
    desc: 'Stone raised for no reason but pride. It does no work and houses nobody, and the whole town is 15 happier for standing in its shadow.',
  },
  gatherer: {
    type: 'gatherer', name: 'Gatherer', emoji: '🧺', category: 'food', w: 3, h: 3,
    cost: { wood: 48, stone: 12 }, jobs: 3, work: 70, workRadius: 6,
    desc: 'Collects food from forest in its work circle — more trees, more food.',
  },
  farm: {
    type: 'farm', name: 'Field', emoji: '🌱', category: 'food', w: 4, h: 4,
    cost: { wood: 40, stone: 24 }, jobs: 2, work: 80,
    desc: 'A fenced field for a chosen crop — you must own that crop\'s seed to plant it. Drag its size (4×4 up to 8×8) before building; a bigger field yields a bigger harvest, reaped each autumn.',
  },
  fishing: {
    type: 'fishing', name: 'Fishing Hut', emoji: '🎣', category: 'food', w: 3, h: 5,
    cost: { wood: 48, stone: 4 }, jobs: 3, work: 70, dockDepth: 2, workRadius: 4,
    desc: 'Catches fish from water in its work circle — more water and more workers, more fish. Its jetty must reach out over the water, so turn it until the dock end is wet and the door is on the bank.',
  },
  hunting: {
    type: 'hunting', name: 'Hunting Cabin', emoji: '🏹', category: 'food', w: 3, h: 3,
    cost: { wood: 32, stone: 8 }, jobs: 3, work: 50, workRadius: 6,
    desc: 'Hunts game in its work circle for food and leather — needs forest.',
  },
  ranch: {
    type: 'ranch', name: 'Ranch', emoji: '🐄', category: 'food', w: 4, h: 4,
    cost: { wood: 48, stone: 16 }, jobs: 2, work: 80,
    desc: 'A fenced pen for cattle, pigs, sheep or chickens. Drag its size (4×4 up to 8×8) before building — a bigger pen holds a bigger herd. Buy livestock from traders; they breed here. Each herd gives one thing alive and another dead: cows are milked, sheep shorn, hens robbed of eggs — pigs give nothing until the butcher. Hide only ever comes off a carcass, cattle yielding more of it than pigs. A pen at its cap keeps breeding, and every birth with nowhere to go goes to the butcher, so a full pen pays out on its own.',
  },
  lumberyard: {
    type: 'lumberyard', name: 'Forester', emoji: '🌲', category: 'resources', w: 3, h: 3,
    cost: { wood: 32, stone: 16 }, jobs: 3, work: 60, workRadius: 4,
    desc: 'Foresters fell trees for wood out in their work circle, and clear the loose rock and ore they find there. Toggle replanting to sow saplings and keep the woods renewable.',
  },
  woodcutter: {
    type: 'woodcutter', name: 'Woodcutter', emoji: '🪓', category: 'resources', w: 3, h: 3,
    cost: { wood: 24, stone: 4 }, jobs: 1, work: 30,
    desc: 'Splits stockpiled wood into firewood to heat homes in winter.',
  },
  quarry: {
    // A quarry digs its own pit, so it goes anywhere on buildable ground rather than having to
    // hug a mountainside. It is the largest works in the village — a fixed 8×8, not
    // player-sizable — and finding eight clear tiles a side is most of what placing one costs.
    type: 'quarry', name: 'Quarry', emoji: '⛏️', category: 'resources', w: 8, h: 8,
    cost: { wood: 100, stone: 180 }, jobs: 10, work: 220,
    desc: 'Cuts stone. A large pit that can be dug anywhere — but yields more against a rocky mountainside.',
  },
  mine: {
    type: 'mine', name: 'Mine', emoji: '🕳️', category: 'resources', w: 6, h: 6,
    cost: { wood: 120, stone: 180, iron: 48 }, jobs: 10, work: 240, requiresBackHalf: 'foothill',
    desc: 'Digs coal or iron — pick which in its own panel or on the job board. Its back half must be cut into a mountain\'s foothills, with the mouth on open ground — turn it so the door faces away from the slope.',
  },
  blacksmith: {
    type: 'blacksmith', name: 'Blacksmith', emoji: '⚒️', category: 'resources', w: 3, h: 3,
    cost: { wood: 40, stone: 30, iron: 40 }, jobs: 1, work: 90,
    desc: 'Forges tools from iron, or steel tools from iron + coal (lasts longer).',
  },
  tailor: {
    type: 'tailor', name: 'Tailor', emoji: '🧵', category: 'resources', w: 3, h: 3,
    cost: { wood: 40, stone: 24, iron: 20 }, jobs: 1, work: 80,
    desc: 'Sews warm clothing to keep villagers healthy in winter. Set it to work either hide — from cattle and the hunt — or fleece off a sheep pen; wool goes a little further per unit.',
  },
  trading: {
    type: 'trading', name: 'Trading Post', emoji: '🚢', category: 'trade', w: 5, h: 9,
    cost: { wood: 62, stone: 80, iron: 120 }, jobs: 2, work: 180, requiresWaterFraction: 1 / 3,
    desc: 'A dock for traders arriving by boat — part of it must reach out over the water. Staff it to move goods in and out; boats call either way.',
  },
  school: {
    type: 'school', name: 'School', emoji: '🏫', category: 'civic', w: 3, h: 4,
    cost: { wood: 30, stone: 16 }, jobs: 1, work: 60,
    desc: 'A teacher takes the children for their last year before adulthood. Attend half of it or more and they grow into skilled adults, who work faster for the rest of their lives.',
  },
  tavern: {
    type: 'tavern', name: 'Tavern', emoji: '🍺', category: 'civic', w: 4, h: 4,
    cost: { wood: 90, stone: 52, iron: 12 }, jobs: 1, work: 200,
    desc: 'A staffed alehouse brews grain into ale each season, keeping the village merry.',
  },
  townhall: {
    type: 'townhall', name: 'Town Hall', emoji: '🏛️', category: 'civic', w: 5, h: 5,
    cost: { wood: 124, stone: 84, iron: 84 }, jobs: 2, work: 180,
    desc: 'The seat of the village. Its clerks keep the books — a ledger of what every store gained and spent last season — and enact the policies the village lives under. Each clerk at work carries one policy, so a hall with one is a hall with one rule in force.',
  },
  chapel: {
    type: 'chapel', name: 'Chapel', emoji: '⛪', category: 'civic', w: 4, h: 5,
    cost: { wood: 100, stone: 60, iron: 40 }, jobs: 1, work: 140,
    desc: 'A place of worship and gathering that lifts the spirits of the whole village.',
  },
  cemetery: {
    type: 'cemetery', name: 'Cemetery', emoji: '🪦', category: 'civic', w: 2, h: 2,
    cost: { wood: 16, stone: 24 }, jobs: 0, work: 40,
    desc: 'A dignified resting place — villagers grieve less when the dead are honoured.',
  },
  herbalist: {
    type: 'herbalist', name: 'Herbalist', emoji: '🌿', category: 'civic', w: 3, h: 3,
    cost: { wood: 30, stone: 20 }, jobs: 1, work: 60, workRadius: 6,
    desc: 'Gathers wild herbs from the forest to brew medicine for the sick.',
  },
  hospital: {
    type: 'hospital', name: 'Hospital', emoji: '🏥', category: 'civic', w: 4, h: 5,
    cost: { wood: 62, stone: 52, iron: 30 }, jobs: 1, work: 120,
    desc: 'Doctors keep the village healthier year-round and treat the sick, spending medicine to do both — the ill recover faster and die less.',
  },
  well: {
    type: 'well', name: 'Well', emoji: '⛲', category: 'civic', w: 1, h: 1,
    cost: { wood: 16 }, jobs: 0, work: 10, fireproof: true,
    desc: 'Where a bucket brigade fills up to fight a fire. Does not stop a building catching, but the well nearest the blaze is where every trip starts — keep one within reach of anything that can burn, or a fire there goes untreated.',
  },
  market: {
    type: 'market', name: 'Market', emoji: '🛒', category: 'resources', w: 4, h: 4,
    cost: { wood: 100, stone: 58, iron: 62 }, jobs: 2, work: 140, workRadius: MARKET_RADIUS,
    desc: 'Stores goods like a barn (2000 units of space to a barn\'s 5000), and its vendors carry food, fuel and coats out to every home inside its circle, so households never have to leave work to shop. Two vendors reach the furthest.',
  },
  barn: {
    type: 'barn', name: 'Barn', emoji: '🛖', category: 'resources', w: 3, h: 4, doors: 2,
    cost: { wood: 48, stone: 12 }, jobs: 0, work: 80, fireproof: true,
    desc: 'The village store, and it cannot burn down. It holds 5000 units of space rather than 5000 items — a log takes one, a sack of grain a quarter, a cow four. Big doors at both ends, so a carrier walks to whichever is nearer. Tap it to see what is inside.',
  },
};

export const CATEGORY_ORDER: BuildCategory[] = ['housing', 'food', 'resources', 'civic', 'trade'];
export const CATEGORY_META: Record<BuildCategory, { label: string; emoji: string }> = {
  housing: { label: 'Housing', emoji: '🏠' },
  food: { label: 'Food', emoji: '🌾' },
  resources: { label: 'Resources', emoji: '🪵' },
  civic: { label: 'Civic', emoji: '🏫' },
  trade: { label: 'Trade', emoji: '🚢' },
};

export const BUILD_ORDER: BuildingType[] = [
  'house',
  'stonehouse',
  'grandhouse',
  'shelter',
  'gatherer',
  'farm',
  'fishing',
  'hunting',
  'ranch',
  'lumberyard',
  'woodcutter',
  'quarry',
  'mine',
  'blacksmith',
  'tailor',
  'luxury',
  'trading',
  'port',
  'school',
  'university',
  'tavern',
  'townhall',
  'chapel',
  'cathedral',
  'monument',
  'cemetery',
  'herbalist',
  'hospital',
  'well',
  'market',
  'barn',
];
