import {
  GameState,
  Building,
  ResourceKind,
  BUILDING_DEFS,
  BARN_CAPACITY,
  MARKET_CAPACITY,
  FOOD_KINDS,
} from '../types';

export interface Pos {
  x: number;
  y: number;
}

function center(b: Building): Pos {
  const def = BUILDING_DEFS[b.type];
  return { x: b.x + def.w / 2, y: b.y + def.h / 2 };
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

export function barnLoad(b: Building): number {
  let n = 0;
  for (const k in b.store) n += b.store[k as ResourceKind] ?? 0;
  return n;
}

export function barnFree(b: Building): number {
  return capacityOf(b) - barnLoad(b);
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
    const room = barnFree(b);
    const put = Math.min(room, left);
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

/** Does storage hold at least the given cost across all nodes? */
export function canAffordCost(s: GameState, cost: Partial<Record<ResourceKind, number>>): boolean {
  for (const k in cost) {
    const kind = k as ResourceKind;
    if (totalStored(s, kind) < (cost[kind] ?? 0)) return false;
  }
  return true;
}

export { center as barnCenter };
