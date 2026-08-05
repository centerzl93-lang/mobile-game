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
  hard: { label: 'Hard', desc: 'No wood or stone, and half the food, fuel and tools' },
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
  | 'meat'
  | 'wood'
  | 'firewood'
  | 'stone'
  | 'coal'
  | 'iron'
  | 'tools'
  | 'leather'
  | 'clothing'
  | 'cattle'
  | 'pigs'
  | 'chickens'
  | 'medicine';

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
  'meat',
];

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
  'meat',
  'wood',
  'firewood',
  'stone',
  'coal',
  'iron',
  'tools',
  'leather',
  'clothing',
  'cattle',
  'pigs',
  'chickens',
  'medicine',
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
  meat: '🍖',
  wood: '🪵',
  firewood: '🔥',
  stone: '🪨',
  coal: '⚫',
  iron: '🔩',
  tools: '🛠️',
  leather: '🟫',
  clothing: '🧥',
  cattle: '🐄',
  pigs: '🐖',
  chickens: '🐔',
  medicine: '💊',
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

export type BuildingType =
  | 'house'
  | 'stonehouse'
  | 'tavern'
  | 'chapel'
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
export type RanchAnimal = 'cattle' | 'pigs' | 'chickens';
export const RANCH_ANIMALS: RanchAnimal[] = ['cattle', 'pigs', 'chickens'];
export const ANIMAL_META: Record<
  RanchAnimal,
  { label: string; emoji: string; ideal: number; growth: number; products: { kind: ResourceKind; chance: number; mult: number }[] }
> = {
  // `chance` weights are cumulative-rolled; `mult` scales that product's load.
  cattle: { label: 'Cattle', emoji: '🐄', ideal: 8, growth: 0.12, products: [
    { kind: 'meat', chance: 0.7, mult: 1 }, { kind: 'leather', chance: 0.3, mult: 1 },
  ] },
  pigs: { label: 'Pigs', emoji: '🐖', ideal: 8, growth: 0.18, products: [
    { kind: 'meat', chance: 0.9, mult: 1.15 }, { kind: 'leather', chance: 0.1, mult: 1 },
  ] },
  chickens: { label: 'Chickens', emoji: '🐔', ideal: 12, growth: 0.25, products: [
    { kind: 'eggs', chance: 0.6, mult: 1 }, { kind: 'meat', chance: 0.4, mult: 0.6 },
  ] },
};

// ---- Ranch sizing & husbandry (all customizable) ----
/** A pen is a square (or rectangle) between these tile dimensions, chosen at placement. */
export const RANCH_MIN = 4;
export const RANCH_MAX = 8;
/** Tiles each head of livestock needs — bigger animals need more room, so fewer fit a pen. */
export const ANIMAL_TILES: Record<RanchAnimal, number> = { cattle: 3, pigs: 2, chickens: 1 };
/** Baseline births per season for a breeding herd. 0.55 × 2 ≥ 1 ⇒ the "≥1 per 2 seasons" floor. */
export const RANCH_BREED_PER_SEASON = 0.55;
/** Chance, each season, of one extra birth on top of the baseline. */
export const RANCH_BREED_BONUS_CHANCE = 0.2;
/** A herd must reach this size before Split is offered (moving half to another ranch). */
export const RANCH_SPLIT_MIN = 10;
/** Resource units produced per head sent to slaughter (culls + births over the cap). */
export const SLAUGHTER_YIELD = 3;

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
  /** Seconds of work to finish construction (by builders). */
  buildTime: number;
  /** At least one border tile must be one of these types (terrain gating). */
  requiresAdjacent?: TileType[];
  /** At least one footprint tile must be one of these types (e.g. mines touch a foothill). */
  requiresTileAny?: TileType[];
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
  desc: string;
}

/** Whether a building type can catch fire — fireproof types (wells, barns) never burn. */
export function isFireproof(type: BuildingType): boolean {
  return BUILDING_DEFS[type].fireproof === true;
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
  progress: number; // 0..buildTime
  workers: number[]; // citizen ids currently working here
  /** Player-set target number of workers (0..jobs). */
  desiredWorkers: number;
  /** Accumulated field growth for farms (0..1). */
  growth: number;
  /** Mine: whether it digs coal or iron. */
  output: MineOutput;
  /** Blacksmith: iron tools or steel tools. */
  recipe: SmithRecipe;
  /**
   * Local inventory. Barn: its stock (cap BARN_CAPACITY). Producer: input/output
   * buffer. Construction site (built=false): materials delivered so far.
   */
  store: Partial<Record<ResourceKind, number>>;
  /** Seconds of fire remaining while burning down (undefined = not on fire). */
  fireTimer?: number;
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
   * Trading post: player-set stock targets (resource -> desired units). The assigned
   * trader hauls goods from the barns up to these levels and returns any surplus.
   */
  orders?: Partial<Record<ResourceKind, number>>;
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
  health: number; // 0..100
  happiness: number; // 0..100
  educated: boolean; // attended school in the year before coming of age -> more productive
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
  // ---- transient navigation state (not persisted; recomputed after load) ----
  route?: { x: number; y: number }[]; // cached A* waypoints toward the current destination
  routeI?: number; // index of the next waypoint to reach
  rdx?: number; // destination tile the cached route was computed for
  rdy?: number;
}

/** Children can't work; they take a housing slot and grow up at ADULT_AGE. */
export function isAdult(c: { age: number }): boolean {
  return c.age >= ADULT_AGE;
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
  return !!c.student && c.age < ADULT_AGE;
}

/** A child who is not enrolled — too young, or with no school to go to. */
export function isInfant(c: { age: number; student?: boolean }): boolean {
  return c.age < ADULT_AGE && !isStudent(c);
}

/** Whether a villager is inside the fertile age window and can father/bear a child. */
export function isFertile(c: { age: number }): boolean {
  return c.age >= FERTILE_MIN_AGE && c.age <= FERTILE_MAX_AGE;
}

/** House-type buildings that shelter villagers (plain and stone houses). */
export function isHouse(type: BuildingType): boolean {
  return type === 'house' || type === 'stonehouse';
}

/** How many villagers a given house type shelters. */
export function houseCapacityOf(type: BuildingType): number {
  return type === 'stonehouse' ? STONE_HOUSE_CAPACITY : HOUSING_PER_HOUSE;
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
export const DEMO_TIME_FRACTION = 0.5;

export function demoTimeOf(type: BuildingType): number {
  return buildTimeOf(type) * DEMO_TIME_FRACTION;
}

/** How far a teardown has got, 0..1. */
export function demoFraction(b: Building): number {
  const total = demoTimeOf(b.type);
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
  const total = buildTimeOf(b.type);
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
  const total = buildTimeOf(b.type);
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

/** Villagers the village has asked for in a trade: what its buildings want, plus the overflow. */
export function tradeWanted(s: GameState, type: BuildingType): number {
  let n = s.tradeExtra?.[type] ?? 0;
  for (const b of tradePosts(s, type)) n += b.desiredWorkers;
  return n;
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
    if (v !== PATH_DIRT_PLAN && v !== PATH_STONE_PLAN && v !== PATH_BRIDGE_PLAN && v !== PATH_TUNNEL_PLAN) continue;
    if (pending?.has(i)) continue;
    n++;
  }
  return n;
}

/** A building's effective construction time in seconds (base time × the pace multiplier). */
export function buildTimeOf(type: BuildingType): number {
  return BUILDING_DEFS[type].buildTime * BUILD_TIME_SCALE;
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
/** How much a stockpile limit moves per tap of the stepper. */
export const LIMIT_STEP = 50;

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
    case 'blacksmith': return 'tools';
    case 'tailor': return 'clothing';
    case 'herbalist': return 'medicine';
    default: return null;
  }
}

/** Every stockpile a limit could actually act on — what the limits panel offers. */
export const LIMITABLE: LimitKey[] = [
  'food', 'wood', 'firewood', 'stone', 'coal', 'iron', 'tools', 'clothing', 'medicine',
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
  food: { label: 'Food (all kinds)', icon: '🍽️' },
} as Record<LimitKey, { label: string; icon: string }>;
for (const k of RESOURCE_KINDS) {
  LIMIT_META[k] = { label: k[0].toUpperCase() + k.slice(1), icon: RESOURCE_ICON[k] };
}

export function worksIndoors(type: BuildingType): boolean {
  return hasDoor(type) && !CIRCLE_WORK.includes(type) && type !== 'fishing';
}
export function blocksMovement(b: Building): boolean {
  return b.built && !OPEN_FOOTPRINT.includes(b.type);
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
export type HarvestKind = 'all' | 'trees' | 'stone' | 'iron';
export const HARVEST_KINDS: HarvestKind[] = ['all', 'trees', 'stone', 'iron'];
export const HARVEST_KIND_META: Record<HarvestKind, { label: string; emoji: string; hint: string }> = {
  all: { label: 'Everything', emoji: '🪓', hint: 'trees, stone and iron' },
  trees: { label: 'Trees', emoji: '🌲', hint: 'trees only — stone and iron are left where they lie' },
  stone: { label: 'Stone', emoji: '🪨', hint: 'loose stone only — the trees are left standing' },
  iron: { label: 'Iron', emoji: '🔩', hint: 'surface iron only — the trees are left standing' },
};

/** The single kind of goods a visiting merchant deals in. */
export type MerchantCategory = 'basics' | 'seeds' | 'animals' | 'foods' | 'goods';
export const MERCHANT_CATEGORIES: MerchantCategory[] = ['basics', 'seeds', 'animals', 'foods', 'goods'];

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
  /** Bumped when a tile becomes / stops being forest (replanting or clear-cutting), so the
   * renderer knows to rebuild its tree layer to show the new/removed trees. */
  forestVersion?: number;
  /**
   * Seconds since households were last settled. Rehousing runs on this short cadence rather than
   * only at season turnover, so a couple moves into a house the moment it is finished instead of
   * waiting out the rest of the season.
   */
  rehouseTimer?: number;
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
  // Crops and other foods: compact, and hauled in bulk from field to barn.
  fruit: 0.25, grain: 0.25, corn: 0.25, potato: 0.25, rice: 0.25, barley: 0.25,
  carrot: 0.25, tomato: 0.25, onion: 0.25, pepper: 0.25, cabbage: 0.25, beans: 0.25,
  pumpkin: 0.25, apple: 0.25, grapes: 0.25, strawberry: 0.25, melon: 0.25,
  eggs: 0.25, fish: 0.25, meat: 0.25,
  // Bulky raw materials — the volume-1 baseline.
  wood: 1, firewood: 1, stone: 1, coal: 1, iron: 1,
  // Worked goods: denser than raw material, so more fit in a load.
  tools: 0.5, leather: 0.5, clothing: 0.5,
  medicine: 0.25,
  // Livestock is driven, not carried, and a cow takes rather more room than a log.
  cattle: 4, pigs: 3, chickens: 0.5,
};

/** How many whole units of `kind` fit in `volume` of carrying space (always at least one). */
export function carryLimit(kind: ResourceKind, volume: number = CARRY_VOLUME): number {
  return Math.max(1, Math.floor(volume / RESOURCE_VOLUME[kind]));
}
export const REFUND_FRACTION = 0.25; // fraction of build cost reclaimed on demolish
export const WORK_SECONDS = 8; // seconds of work to fill/convert one carry-load (slower pace)
export const BUILD_SECONDS_PER_UNIT = 0.5; // on-site labor seconds per unit of construction
/** Multiplier on every building's construction time — raising buildings takes this much longer. */
export const BUILD_TIME_SCALE = 2;

// ---- Movement / paths ----
export const BASE_WALK_SPEED = 0.875; // villagers stroll — half the previous 1.75
export const PATH_DIRT_MULT = 1.5;
export const PATH_STONE_MULT = 2.0;
export const PATH_BRIDGE_MULT = 1.5; // crossing a built bridge (like a dirt path)
export const STONE_PATH_COST = 1; // stone per stone-path tile
export const BRIDGE_WOOD_COST = 3; // wood per bridge tile
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
export const FOOTHILL_RADIUS = 1; // one-tile foothill ring hugging the edge of each mountain

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
 * How much slower a villager eats and burns fuel than the original tuning.
 *
 * The rates below read as "a season's ration" and are billed continuously, so dividing them here
 * slows the drain on the stores without changing the shape of anything: larder targets, the
 * "seasons banked" mood check and the low-stores warnings are all derived from the same two
 * numbers and scale with them. Production is untouched, so this is a straight loosening of the
 * survival pressure — one number to turn if it wants tightening again.
 */
export const CONSUMPTION_SLOWDOWN = 3;
export const FOOD_PER_CITIZEN_PER_SEASON = 60 / CONSUMPTION_SLOWDOWN;
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
 * Tools consumed per employed worker per season — one tool, one season's work.
 *
 * A village starts with 48, which is twelve villagers' worth of a full year. Only working adults
 * wear tools out, so the founding eight actually get about six seasons from it; the margin closes
 * as the village grows and every new worker adds four tools a year to the bill. A blacksmith
 * turns out `SMITH_IRON_TOOLS_OUT` (8) a worker a season, so one staffed smithy keeps about
 * sixteen workers in tools — the village has to reach that before the opening stock runs dry.
 */
export const TOOL_WEAR_PER_WORKER = 1;
export const NO_TOOLS_PENALTY = 0.6; // output multiplier when the tool stockpile is empty
export const SICKNESS_CHANCE = 0.5; // chance an unclothed villager sickens in winter

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
 * A household has one shopper and checks its goods in a fixed order, so without a threshold the
 * first item to dip by any amount monopolises every trip. Restocking in batches lets one errand
 * run cover food, then fuel, then medicine.
 */
export const LARDER_RESTOCK_AT = 0.6;
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
export const ADULT_AGE = 4; // children become working adults at this age (years)
/**
 * Age from which a child can be enrolled: the last year before working age.
 *
 * Schooling is one year, taken immediately before adulthood, and only where a staffed school
 * exists — see `isStudent`. Enrolment is what sets `educated`, so a child has to actually attend
 * rather than merely happen to come of age while a school stands somewhere.
 */
export const SCHOOL_AGE = ADULT_AGE - 1;
/** Fraction of the school year a child must actually sit to count as educated. */
export const SCHOOL_ATTENDANCE = 0.5;
export const START_ADULTS = 8; // founding adult villagers
export const START_CHILDREN = 4; // founding children
export const ADULT_MIN_AGE = 20; // founding adults' age range
export const ADULT_MAX_AGE = 29;
export const CHILD_MIN_AGE = 3; // founding children spawn in [CHILD_MIN_AGE, ADULT_AGE)

// ---- Leisure (villagers take occasional breaks from work) ----
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
/** Share of the birth chance a household keeps with no food surplus beyond the one-season gate. */
export const BIRTH_SURPLUS_FLOOR = 0.7;
/** Share of the birth chance a household keeps at rock-bottom health and happiness. */
export const BIRTH_WELLBEING_FLOOR = 0.8;
/**
 * The fertile years. Villagers come of age at ADULT_AGE and can work, but only bear children inside
 * this window — below it they are too young, above it they stop (just before old age sets in).
 */
export const FERTILE_MIN_AGE = 6;
export const FERTILE_MAX_AGE = 34;
/**
 * Seasons of food in store that earn the *full* fertility bonus. Below one season's worth no
 * household will bear a child at all; the bonus ramps from there up to this surplus.
 */
export const BIRTH_FOOD_SURPLUS_TARGET = 2;

export const OLD_AGE_START = 35; // old-age deaths begin at this age
export const MAX_AGE = 48; // by this age old-age death is near-certain each year
export const EDUCATED_BONUS = 1.3; // production multiplier for educated workers
export const START_HEALTH = 80;
export const START_HAPPINESS = 80;

// ---- Housing & amenities ----
export const STONE_HOUSE_CAPACITY = 10; // villagers a stone house shelters (a larger family still)
export const STONE_HOUSE_HEAT_FACTOR = 0.6; // stone-house residents need less winter fuel
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
export const SICK_RECOVER_MEDICINE = 0.3; // bonus if a dose of medicine is on hand
export const SICK_RECOVER_HOSPITAL = 0.2; // bonus if a staffed hospital exists
export const SICK_DEATH_CHANCE = 0.15; // per-season death chance while still sick
export const MED_LOAD = 5; // medicine produced per herbalist work cycle (× forest)
export const FIRE_CHANCE = 0.05; // base chance per season a building ignites
export const WELL_RADIUS = 6; // wells protect buildings within this radius
export const WELL_DOUSE_CHANCE = 0.85; // chance a nearby well stops a fire
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
export const STONE_BUILT: BuildingType[] = ['stonehouse', 'chapel'];
export function isStoneBuilt(type: BuildingType): boolean {
  return STONE_BUILT.includes(type);
}
export const FIRE_BURN_SECONDS = 8; // how long a building burns before collapsing

// ---- Production (per assigned worker, per season, before local factors) ----
export const GATHER_FOOD_PER_SEASON = 15;
export const FISH_FOOD_PER_SEASON = 16;
export const HUNT_FOOD_PER_SEASON = 10;
export const HUNT_LEATHER_PER_SEASON = 4;
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
  fruit: 300, grain: 300, fish: 300, meat: 300, // 1200 food all told
  tools: 48,
  clothing: 48,
} as const;
export const DIFFICULTY_RESOURCES: Record<Difficulty, Partial<Resources>> = {
  easy: { ...SURVIVAL_START, wood: 660, stone: 120, medicine: 50, firewood: 600 },
  normal: { ...SURVIVAL_START },
  hard: { ...SURVIVAL_START },
};

// ---- Trade (barter by relative value; merchant keeps a margin) ----
export const TRADE_VALUE: Record<ResourceKind, number> = {
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
  meat: 1.5,
  wood: 1,
  firewood: 1.5,
  stone: 2,
  coal: 3,
  iron: 4,
  tools: 8,
  leather: 3,
  clothing: 6,
  cattle: 20,
  pigs: 14,
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
  animals: { cattle: 6, pigs: 8, chickens: 12 },
  foods: { grain: 160, corn: 120, potato: 120, fish: 140, meat: 80, eggs: 80 },
  goods: { tools: 60, clothing: 60, leather: 90, medicine: 40 },
};

/** Label + emoji for each merchant category (shown in the trade UI header). */
export const MERCHANT_CATEGORY_META: Record<MerchantCategory, { label: string; emoji: string }> = {
  basics: { label: 'Materials Trader', emoji: '🪵' },
  seeds: { label: 'Seed Merchant', emoji: '🌱' },
  animals: { label: 'Livestock Trader', emoji: '🐄' },
  foods: { label: 'Food Merchant', emoji: '🍞' },
  goods: { label: 'Goods Merchant', emoji: '🛠️' },
};

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: {
    type: 'house', name: 'House', emoji: '🏠', category: 'housing', w: 2, h: 2,
    cost: { wood: 12 }, jobs: 0, buildTime: 6,
    desc: 'Homes up to 8 villagers — a couple and their children — and a household with room to spare is one that can grow.',
  },
  stonehouse: {
    type: 'stonehouse', name: 'Stone House', emoji: '🏡', category: 'housing', w: 2, h: 2,
    cost: { wood: 8, stone: 16 }, jobs: 0, buildTime: 8,
    desc: 'A warm, sturdy home for up to 10. Masonry holds its heat, so a household here burns 40% less firewood through the winter, and it is half as likely to catch fire. A wooden house can be upgraded to one in place.',
  },
  gatherer: {
    type: 'gatherer', name: 'Gatherer', emoji: '🧺', category: 'food', w: 3, h: 3,
    cost: { wood: 10 }, jobs: 2, buildTime: 6, workRadius: 6,
    desc: 'Collects food from forest in its work circle — more trees, more food.',
  },
  farm: {
    type: 'farm', name: 'Field', emoji: '🌱', category: 'food', w: 4, h: 4,
    cost: { wood: 6 }, jobs: 2, buildTime: 5,
    desc: 'A fenced field for a chosen crop — you must own that crop\'s seed to plant it. Drag its size (4×4 up to 8×8) before building; a bigger field yields a bigger harvest, reaped each autumn.',
  },
  fishing: {
    type: 'fishing', name: 'Fishing Hut', emoji: '🎣', category: 'food', w: 3, h: 5,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, dockDepth: 2, workRadius: 4,
    desc: 'Catches fish from water in its work circle — more water and more workers, more fish. Its jetty must reach out over the water, so turn it until the dock end is wet and the door is on the bank.',
  },
  hunting: {
    type: 'hunting', name: 'Hunting Cabin', emoji: '🏹', category: 'food', w: 3, h: 3,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, workRadius: 6,
    desc: 'Hunts game in its work circle for food and leather — needs forest.',
  },
  ranch: {
    type: 'ranch', name: 'Ranch', emoji: '🐄', category: 'food', w: 4, h: 4,
    cost: { wood: 16 }, jobs: 2, buildTime: 7,
    desc: 'A fenced pen for cattle, pigs, or chickens. Drag its size (4×4 up to 8×8) before building — a bigger pen holds a bigger herd. Buy livestock from traders; they breed here.',
  },
  lumberyard: {
    type: 'lumberyard', name: 'Forester', emoji: '🌲', category: 'resources', w: 3, h: 3,
    cost: { wood: 12 }, jobs: 3, buildTime: 6, workRadius: 4,
    desc: 'Foresters fell trees for wood out in their work circle, and clear the loose rock and ore they find there. Toggle replanting to sow saplings and keep the woods renewable.',
  },
  woodcutter: {
    type: 'woodcutter', name: 'Woodcutter', emoji: '🪓', category: 'resources', w: 3, h: 3,
    cost: { wood: 10 }, jobs: 2, buildTime: 6,
    desc: 'Splits stockpiled wood into firewood to heat homes in winter.',
  },
  quarry: {
    // A quarry digs its own pit, so it goes anywhere on buildable ground rather than having to
    // hug a mountainside. It is the largest works in the village — a fixed 8×8, not
    // player-sizable — and finding eight clear tiles a side is most of what placing one costs.
    type: 'quarry', name: 'Quarry', emoji: '⛏️', category: 'resources', w: 8, h: 8,
    cost: { wood: 30 }, jobs: 4, buildTime: 14,
    desc: 'Cuts stone. A large pit that can be dug anywhere — but yields more against a rocky mountainside.',
  },
  mine: {
    type: 'mine', name: 'Mine', emoji: '🕳️', category: 'resources', w: 6, h: 6,
    cost: { wood: 14, stone: 10 }, jobs: 2, buildTime: 8, requiresTileAny: ['foothill'],
    desc: 'Digs coal or iron — pick which in its own panel or on the job board. Part of it must be cut into a mountain\'s foothills.',
  },
  blacksmith: {
    type: 'blacksmith', name: 'Blacksmith', emoji: '⚒️', category: 'resources', w: 3, h: 3,
    cost: { wood: 14, stone: 8 }, jobs: 2, buildTime: 7,
    desc: 'Forges tools from iron, or steel tools from iron + coal (lasts longer).',
  },
  tailor: {
    type: 'tailor', name: 'Tailor', emoji: '🧵', category: 'resources', w: 3, h: 3,
    cost: { wood: 12 }, jobs: 2, buildTime: 6,
    desc: 'Sews warm clothing from leather to keep villagers healthy in winter.',
  },
  trading: {
    type: 'trading', name: 'Trading Post', emoji: '🚢', category: 'trade', w: 5, h: 9,
    cost: { wood: 20, stone: 10 }, jobs: 1, buildTime: 8, requiresWaterFraction: 1 / 3,
    desc: 'A dock for traders arriving by boat — part of it must reach out over the water. Staff it to move goods in and out; boats call either way.',
  },
  school: {
    type: 'school', name: 'School', emoji: '🏫', category: 'civic', w: 3, h: 4,
    cost: { wood: 16, stone: 10 }, jobs: 1, buildTime: 7,
    desc: 'A teacher takes the children for their last year before adulthood. Attend half of it or more and they grow into skilled adults, who work faster for the rest of their lives.',
  },
  tavern: {
    type: 'tavern', name: 'Tavern', emoji: '🍺', category: 'civic', w: 4, h: 4,
    cost: { wood: 16, stone: 6 }, jobs: 1, buildTime: 7,
    desc: 'A staffed alehouse brews grain into ale each season, keeping the village merry.',
  },
  chapel: {
    type: 'chapel', name: 'Chapel', emoji: '⛪', category: 'civic', w: 4, h: 5,
    cost: { wood: 14, stone: 14 }, jobs: 0, buildTime: 8,
    desc: 'A place of worship and gathering that lifts the spirits of the whole village.',
  },
  cemetery: {
    type: 'cemetery', name: 'Cemetery', emoji: '🪦', category: 'civic', w: 2, h: 2,
    cost: { wood: 6, stone: 8 }, jobs: 0, buildTime: 6,
    desc: 'A dignified resting place — villagers grieve less when the dead are honoured.',
  },
  herbalist: {
    type: 'herbalist', name: 'Herbalist', emoji: '🌿', category: 'civic', w: 3, h: 3,
    cost: { wood: 12 }, jobs: 2, buildTime: 6, workRadius: 6,
    desc: 'Gathers wild herbs from the forest to brew medicine for the sick.',
  },
  hospital: {
    type: 'hospital', name: 'Hospital', emoji: '🏥', category: 'civic', w: 4, h: 5,
    cost: { wood: 16, stone: 12 }, jobs: 2, buildTime: 8,
    desc: 'Doctors treat the sick during outbreaks — the ill recover faster and die less.',
  },
  well: {
    type: 'well', name: 'Well', emoji: '⛲', category: 'civic', w: 1, h: 1,
    cost: { wood: 6, stone: 8 }, jobs: 0, buildTime: 4, fireproof: true,
    desc: 'Provides water to fight fires. Buildings nearby rarely burn down.',
  },
  market: {
    type: 'market', name: 'Market', emoji: '🛒', category: 'resources', w: 4, h: 4,
    cost: { wood: 22, stone: 10 }, jobs: 3, buildTime: 8, workRadius: MARKET_RADIUS,
    desc: 'Stores goods like a barn (2000 units of space to a barn\'s 5000), and its vendors carry food, fuel and coats out to every home inside its circle, so households never have to leave work to shop. Three vendors reach the furthest.',
  },
  barn: {
    type: 'barn', name: 'Barn', emoji: '🛖', category: 'resources', w: 3, h: 3,
    cost: { wood: 16 }, jobs: 0, buildTime: 6, fireproof: true,
    desc: 'The village store, and it cannot burn down. It holds 5000 units of space rather than 5000 items — a log takes one, a sack of grain a quarter, a cow four. Tap it to see what is inside.',
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
  'trading',
  'school',
  'tavern',
  'chapel',
  'cemetery',
  'herbalist',
  'hospital',
  'well',
  'market',
  'barn',
];
