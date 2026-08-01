import {
  GameState,
  Building,
  Citizen,
  ResourceKind,
  footprintW,
  footprintH,
  BARN_CAPACITY,
  MARKET_CAPACITY,
  FOOD_KINDS,
  RESOURCE_VOLUME,
  LARDER_KINDS,
  LARDER_RESTOCK_AT,
  HOUSE_FOOD_PER_RESIDENT,
  HOUSE_FIREWOOD_PER_RESIDENT,
  HOUSE_CLOTHING_PER_RESIDENT,
  HOUSE_MEDICINE_PER_RESIDENT,
  CHILD_FOOD_FACTOR,
  STONE_HOUSE_HEAT_FACTOR,
  isAdult,
  isHouse,
} from '../types';

export interface Pos {
  x: number;
  y: number;
}

function center(b: Building): Pos {
  return { x: b.x + footprintW(b) / 2, y: b.y + footprintH(b) / 2 };
}

function dist2(a: Pos, b: Pos): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function capacityOf(b: Building): number {
  return b.type === 'market' ? MARKET_CAPACITY : BARN_CAPACITY;
}

/** All storage that goods can live in: barns and markets. */
export function storageNodes(s: GameState): Building[] {
  return s.buildings.filter((b) => b.built && (b.type === 'barn' || b.type === 'market'));
}

/** Space taken by what a building holds, in volume (see `RESOURCE_VOLUME`). */
export function barnLoad(b: Building): number {
  let n = 0;
  for (const k in b.store) {
    const kind = k as ResourceKind;
    n += (b.store[kind] ?? 0) * RESOURCE_VOLUME[kind];
  }
  return n;
}

/** Space left in a building, in volume. Use `unitsThatFit` to turn it into a number of units. */
export function barnFree(b: Building): number {
  return capacityOf(b) - barnLoad(b);
}

/** How many whole units of `kind` fit in `volume` of space. */
export function unitsThatFit(kind: ResourceKind, volume: number): number {
  return Math.max(0, Math.floor(volume / RESOURCE_VOLUME[kind]));
}

export function storageCapTotal(s: GameState): number {
  let n = 0;
  for (const b of storageNodes(s)) n += capacityOf(b);
  return n;
}

export function totalStored(s: GameState, kind: ResourceKind): number {
  let n = 0;
  for (const b of storageNodes(s)) n += b.store[kind] ?? 0;
  return n;
}

export function totalStoredAll(s: GameState): Record<ResourceKind, number> {
  const out = {} as Record<ResourceKind, number>;
  for (const b of storageNodes(s)) {
    for (const k in b.store) {
      const kind = k as ResourceKind;
      out[kind] = (out[kind] ?? 0) + (b.store[kind] ?? 0);
    }
  }
  return out;
}

export function freeCapacity(s: GameState): number {
  let n = 0;
  for (const b of storageNodes(s)) n += barnFree(b);
  return n;
}

/** Nearest storage node that holds at least 1 of `kind`. */
export function nearestBarnWith(s: GameState, pos: Pos, kind: ResourceKind): Building | null {
  return nearestHolding(storageNodes(s), pos, kind);
}

/** Nearest storage node with any free room. */
export function nearestBarnWithRoom(s: GameState, pos: Pos): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of storageNodes(s)) {
    if (barnFree(b) <= 0) continue;
    const d = dist2(center(b), pos);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Nearest *barn* (not a market) holding `kind` — used by market vendors restocking. */
export function nearestBarnOnlyWith(s: GameState, pos: Pos, kind: ResourceKind): Building | null {
  return nearestHolding(
    s.buildings.filter((b) => b.built && b.type === 'barn'),
    pos,
    kind,
  );
}

function nearestHolding(list: Building[], pos: Pos, kind: ResourceKind): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of list) {
    if ((b.store[kind] ?? 0) <= 0) continue;
    const d = dist2(center(b), pos);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Remove up to `amount` of `kind` starting from the nearest storage. Returns amount taken. */
export function takeNearest(s: GameState, pos: Pos, kind: ResourceKind, amount: number): number {
  let need = amount;
  const list = storageNodes(s)
    .filter((b) => (b.store[kind] ?? 0) > 0)
    .sort((a, b) => dist2(center(a), pos) - dist2(center(b), pos));
  for (const b of list) {
    if (need <= 0) break;
    const have = b.store[kind] ?? 0;
    const take = Math.min(have, need);
    b.store[kind] = have - take;
    if ((b.store[kind] ?? 0) <= 0) delete b.store[kind];
    need -= take;
  }
  return amount - need;
}

/** Add `amount` of `kind` into the nearest storage with room. Returns leftover not stored. */
export function addNearest(s: GameState, pos: Pos, kind: ResourceKind, amount: number): number {
  let left = amount;
  const list = storageNodes(s)
    .filter((b) => barnFree(b) > 0)
    .sort((a, b) => dist2(center(a), pos) - dist2(center(b), pos));
  for (const b of list) {
    if (left <= 0) break;
    // Room is volume; convert it to however many units of *this* kind will fit.
    const put = Math.min(unitsThatFit(kind, barnFree(b)), left);
    if (put <= 0) continue;
    b.store[kind] = (b.store[kind] ?? 0) + put;
    left -= put;
  }
  return left;
}

/** Non-spatial removal (eating/heating): take from any storage. Returns shortfall. */
export function consume(s: GameState, kind: ResourceKind, amount: number): number {
  let need = amount;
  for (const b of storageNodes(s)) {
    if (need <= 0) break;
    const have = b.store[kind] ?? 0;
    const take = Math.min(have, need);
    b.store[kind] = have - take;
    if ((b.store[kind] ?? 0) <= 0) delete b.store[kind];
    need -= take;
  }
  return need;
}

/** Total of all food types across storage. */
export function totalFood(s: GameState): number {
  let n = 0;
  for (const k of FOOD_KINDS) n += totalStored(s, k);
  return n;
}

/** Number of distinct food types currently in storage (0..4) — dietary variety. */
export function foodVarietyStored(s: GameState): number {
  let n = 0;
  for (const k of FOOD_KINDS) if (totalStored(s, k) > 0.5) n++;
  return n;
}

/** Eat `amount` of food, drawn across whatever food types exist. Returns shortfall. */
export function consumeFood(s: GameState, amount: number): number {
  let need = amount;
  for (const k of FOOD_KINDS) {
    if (need <= 0) break;
    need = consume(s, k, need);
  }
  return need;
}

// ---- Household larders ----------------------------------------------------------------------
// A house keeps its residents' own food, firewood and medicine. Larders are deliberately *not*
// `storageNodes`, so every village-wide total above (and therefore the top-line HUD, build costs,
// and trade) sees only what is free in the barns and markets — not what a household has already
// claimed. Consumption draws on a villager's own larder first and falls back to the barns.

/** Built houses, the only buildings that keep a larder. */
export function houseNodes(s: GameState): Building[] {
  return s.buildings.filter((b) => b.built && isHouse(b.type));
}

/** Who lives in this house. */
export function residentsOf(s: GameState, house: Building): Citizen[] {
  return s.citizens.filter((c) => c.homeId === house.id);
}

/** Total food (all kinds combined) a household wants on hand — children keep a smaller ration. */
export function larderFoodTarget(s: GameState, house: Building): number {
  let n = 0;
  for (const c of residentsOf(s, house)) {
    n += HOUSE_FOOD_PER_RESIDENT * (isAdult(c) ? 1 : CHILD_FOOD_FACTOR);
  }
  return n;
}

/** How much of a (non-food) larder resource a household wants on hand. */
export function larderTarget(s: GameState, house: Building, kind: ResourceKind): number {
  const residents = residentsOf(s, house).length;
  if (residents === 0) return 0;
  if (kind === 'firewood') {
    // Stone houses hold their heat, so their residents keep less fuel by the same factor they burn.
    const factor = house.type === 'stonehouse' ? STONE_HOUSE_HEAT_FACTOR : 1;
    return residents * HOUSE_FIREWOOD_PER_RESIDENT * factor;
  }
  if (kind === 'clothing') return residents * HOUSE_CLOTHING_PER_RESIDENT;
  if (kind === 'medicine') return residents * HOUSE_MEDICINE_PER_RESIDENT;
  return 0;
}

/** Food of every kind currently in this larder. */
export function larderFood(house: Building): number {
  let n = 0;
  for (const k of FOOD_KINDS) n += house.store[k] ?? 0;
  return n;
}

/** Sum of `kind` held across every household larder (excluded from the barn totals on purpose). */
export function totalInLarders(s: GameState, kind: ResourceKind): number {
  let n = 0;
  for (const h of houseNodes(s)) n += h.store[kind] ?? 0;
  return n;
}

/**
 * Everything the village can actually draw on: free barn/market stock plus what households have
 * already taken home. Survival warnings use this so a village with full larders and lean barns is
 * not told it is starving.
 */
export function totalAvailable(s: GameState, kind: ResourceKind): number {
  return totalStored(s, kind) + totalInLarders(s, kind);
}

/** Food across the barns *and* every larder — see `totalAvailable`. */
export function totalFoodAvailable(s: GameState): number {
  let n = totalFood(s);
  for (const h of houseNodes(s)) n += larderFood(h);
  return n;
}

/**
 * Distinct food types the village can actually eat, larders included. Diet variety drives health,
 * and villagers eat what is in their larder, so a barn-only count would under-report it.
 */
export function foodVarietyAvailable(s: GameState): number {
  let n = 0;
  for (const k of FOOD_KINDS) if (totalAvailable(s, k) > 0.5) n++;
  return n;
}

/** Take up to `amount` of `kind` out of one larder. Returns the shortfall. */
export function takeFromLarder(house: Building, kind: ResourceKind, amount: number): number {
  const have = house.store[kind] ?? 0;
  const take = Math.min(have, amount);
  if (take > 0) {
    house.store[kind] = have - take;
    if ((house.store[kind] ?? 0) <= 0.0001) delete house.store[kind];
  }
  return amount - take;
}

/** Eat `amount` from a larder, drawn across whatever food kinds it holds. Returns the shortfall. */
export function takeFoodFromLarder(house: Building, amount: number): number {
  let need = amount;
  for (const k of FOOD_KINDS) {
    if (need <= 0) break;
    need = takeFromLarder(house, k, need);
  }
  return need;
}

/**
 * The single most pressing gap in a household's larder, or null when it is stocked. Food comes
 * first (eaten every season), then fuel, then medicine.
 */
export function larderShortfall(
  s: GameState,
  house: Building,
): { kind: ResourceKind; amount: number } | null {
  // Restock a good only once it has fallen below a fraction of its target, then fill it right up.
  //
  // This threshold is load-bearing now that villagers eat continuously rather than in one lump at
  // the season boundary. Food is checked first, so with a hair-trigger gap it was *always* the
  // answer — the household's single shopper spent every trip fetching a few crumbs of food and
  // never reached firewood, clothing or medicine at all. Households froze with full pantries.
  const foodTarget = larderFoodTarget(s, house);
  const foodGap = foodTarget - larderFood(house);
  if (foodGap > 0.5 && larderFood(house) < foodTarget * LARDER_RESTOCK_AT) {
    // Pull whichever food the barns hold most of, so households end up with a varied larder.
    let best: ResourceKind | null = null;
    let bestHave = 0;
    for (const k of FOOD_KINDS) {
      const have = totalStored(s, k);
      if (have > bestHave) {
        bestHave = have;
        best = k;
      }
    }
    if (best) return { kind: best, amount: foodGap };
  }
  for (const kind of LARDER_KINDS) {
    const target = larderTarget(s, house, kind);
    const have = house.store[kind] ?? 0;
    if (have >= target * LARDER_RESTOCK_AT) continue;
    const gap = target - have;
    if (gap > 0.5 && totalStored(s, kind) > 0) return { kind, amount: gap };
  }
  return null;
}

/** Does storage hold at least the given cost across all nodes? */
export function canAffordCost(s: GameState, cost: Partial<Record<ResourceKind, number>>): boolean {
  for (const k in cost) {
    const kind = k as ResourceKind;
    if (totalStored(s, kind) < (cost[kind] ?? 0)) return false;
  }
  return true;
}

export { center as barnCenter };
