/**
 * The shape of a bridge: where its deck rides, and where the arch springs from underneath.
 *
 * Bridges used to be a flat lid laid on the water — a road that changed texture at the bank and
 * carried on at surface level. That reads as a causeway, not a bridge, and the merchant's boat
 * sailed straight through it. An arch fixes both: the deck rises to a crown in the middle of the
 * crossing, the masonry below it curves down to the water at each end, and the opening left in
 * between is what the boat passes through.
 *
 * Kept apart from the renderer because it is arithmetic, not drawing: the same numbers place the
 * deck, place the arch ring under it, put villagers on top of the deck rather than through it,
 * and tell the boat when to strike its rig. A test can check them without a canvas.
 */

import { MAP_W, MAP_H, PATH_BRIDGE, PATH_BRIDGE_PLAN, PATH_BRIDGE_STONE, PATH_BRIDGE_STONE_PLAN } from '../types';

/** The water plane the arch springs from. Matches the renderer's water height. */
export const BRIDGE_WATER_Y = 0.14;
/** Bank level: the height of the road the crossing joins at either end. */
export const BRIDGE_BANK_Y = 0.33;

/**
 * The height the deck must reach at its crown for the merchant's boat to pass beneath.
 *
 * Measured, not guessed. The boat model is 3.5 tiles long normalized against a 2.362-unit
 * footprint, so it draws at 1.482x its authored size; its hull and deck cargo stand 0.743 units
 * tall, which is 1.10 in the world, and it floats with its keel at 0.16. That puts the top of its
 * cargo at 1.26. Add the crown thickness of the arch ring and a little daylight for the roll the
 * boat rides on the swell, and the deck has to be here.
 *
 * The mast is another matter — it stands as tall as a house, and no arch a villager could walk
 * over would ever clear it. The boat lowers it instead (see `BRIDGE_STRIKE_RANGE`).
 */
export const BRIDGE_CROWN_Y = 1.48;
/**
 * Thickness of the masonry between the road and the opening at the crown of the arch.
 *
 * Enough to read as masonry carrying a road. A thinner ring drew a graceful line and looked like
 * something you would not walk a loaded cart over.
 */
export const BRIDGE_RING = 0.16;
/** Top of the merchant boat's hull and deck cargo above the water, with its rig struck. */
export const BOAT_LADEN_TOP = 1.27;
/** Half the deck slab's thickness — the deck is drawn as a box centred on its height. */
export const BRIDGE_DECK_HALF = 0.03;

/**
 * How much taller a wide crossing rides than a narrow one, per tile of span.
 *
 * The rise scales with the span so a broad river gets a grand arch and a narrow one does not
 * become a needle — but never below the floor that lets the boat through, which is what makes a
 * short crossing a steep-backed packhorse bridge rather than a flat one.
 */
export const BRIDGE_RISE_PER_TILE = 0.16;
/** Ceiling on the rise, so an estuary crossing does not turn into a viaduct. */
export const BRIDGE_MAX_RISE = 2.2;
/** The gentlest arch a crossing gets: enough to read as arched, on a plank over a brook. */
export const BRIDGE_MIN_RISE = 0.25;
/**
 * The narrowest gap the merchant's boat could pass through, in tiles — a little over its beam.
 *
 * Below it the clearance floor is dropped, because a crossing this narrow is not a crossing the
 * boat could ever squeeze through however high it were built. Without the exception a one-tile
 * bridge came out as a flat slab a metre over the water with a step at each end: the crown of a
 * sine is level, so a single-tile span has no pitch to ramp down on and the whole rise lands on
 * the abutment. A footbridge over a brook is not the thing the rule was written for.
 */
export const BOAT_BEAM_TILES = 1.3;

/** Is this path value a bridge of either tier, planned or built? */
export function isBridgeValue(v: number): boolean {
  return v === PATH_BRIDGE || v === PATH_BRIDGE_PLAN || v === PATH_BRIDGE_STONE || v === PATH_BRIDGE_STONE_PLAN;
}

/**
 * The fraction of the full rise the highest *tile* on a span actually reaches.
 *
 * The arch is a sine over the crossing and the deck is drawn as one box per tile, sampled at the
 * tile's centre — so on an even span no tile sits at the crown and the tallest pair fall short of
 * it. Sizing the rise against the theoretical crown therefore built a two-tile bridge 30% lower
 * than asked and the boat clipped it. This is what the tiles really reach.
 */
export function peakFactor(span: number): number {
  if (span <= 0) return 1;
  return span % 2 === 1 ? 1 : Math.cos(Math.PI / (2 * span));
}

/** Where along the crossing the highest tile's centre falls. */
export function peakT(span: number): number {
  if (span <= 0) return 0.5;
  return (Math.floor((span - 1) / 2) + 0.5) / span;
}

/** Can the merchant's boat fit through a gap this wide at all? */
export function navigableSpan(span: number): boolean {
  return span >= BOAT_BEAM_TILES;
}

/** How far the deck climbs above bank level over a crossing this many tiles wide. */
export function spanRise(span: number): number {
  const floor = navigableSpan(span)
    ? (BRIDGE_CROWN_Y - BRIDGE_BANK_Y) / peakFactor(span)
    : BRIDGE_MIN_RISE;
  return Math.min(BRIDGE_MAX_RISE, Math.max(floor, span * BRIDGE_RISE_PER_TILE));
}

/**
 * Deck height at `t` along a crossing, where t runs 0..1 from bank to bank.
 *
 * A sine, so the deck leaves and meets the banks level rather than at a corner — the ends of the
 * curve are flat, which is what lets the first and last slabs sit down onto the road.
 */
export function deckY(t: number, span: number): number {
  return BRIDGE_BANK_Y + spanRise(span) * Math.sin(Math.PI * t);
}

/** Rate of climb at `t`, in world units per tile of span — the pitch each deck slab is laid at. */
export function deckSlope(t: number, span: number): number {
  if (span <= 0) return 0;
  return (spanRise(span) * Math.PI * Math.cos(Math.PI * t)) / span;
}

/**
 * How far in from each bank the arch springs, as a fraction of the crossing.
 *
 * Everything outside it is pier: solid masonry standing in the water. Inside it the ring is thin
 * and the whole height below is open. Without this the soffit rose from the water gradually along
 * the entire span and the bridge came out as a dam with a curved top — masonry all the way down
 * at every tile, and no arch to see. One pier's worth at each end is what makes the opening read.
 */
export function archSpring(span: number): number {
  // Roughly a tile of pier at each end, but never past the highest tile: the crown is where the
  // boat goes through, so the ring has to have opened out by the time it gets there. On a two-tile
  // crossing that leaves no pier at all, which is right — a short arch springs from the banks.
  return Math.min(peakT(span), Math.max(0.14, 0.9 / Math.max(1, span)));
}

/**
 * Underside of the bridge at `t`: the arch's intrados, and the ceiling of the opening.
 *
 * Sits at water level at the bank, climbs through the pier, and then runs a fixed thickness under
 * the deck for the whole open middle of the span — so the opening's ceiling follows the same
 * curve the road does, which is what an arch ring is.
 */
export function soffitY(t: number, span: number): number {
  const spring = archSpring(span);
  const shape = Math.min(1, Math.sin(Math.PI * t) / Math.sin(Math.PI * spring));
  const under = deckY(t, span) - BRIDGE_DECK_HALF - BRIDGE_RING;
  return BRIDGE_WATER_Y + (under - BRIDGE_WATER_Y) * Math.max(0, shape);
}

/** Per-tile bridge geometry, indexed by tile. Zero everywhere there is no bridge. */
export interface BridgeDeck {
  /** Height of the middle of the deck slab. */
  y: Float32Array;
  /** Underside of the arch: the top of the opening the boat passes through. */
  soffit: Float32Array;
  /** Climb per tile along the run, for the pitch the slab is laid at. */
  slope: Float32Array;
  /** 1 where the crossing runs east-west, 0 where it runs north-south. */
  alongX: Uint8Array;
  /** How many tiles wide the crossing this tile belongs to is; 0 off a bridge. */
  span: Uint8Array;
}

/**
 * Measure every crossing on the map.
 *
 * A tile's run is found by walking out from it in both directions, along each axis, and taking
 * the longer of the two — which needs no grouping pass and gives a bridge that crosses another
 * bridge the profile of whichever span is the real crossing.
 */
export function bridgeDeck(paths: number[]): BridgeDeck {
  const n = MAP_W * MAP_H;
  const out: BridgeDeck = {
    y: new Float32Array(n),
    soffit: new Float32Array(n),
    slope: new Float32Array(n),
    alongX: new Uint8Array(n),
    span: new Uint8Array(n),
  };
  const bridge = (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < MAP_W && z < MAP_H && isBridgeValue(paths[z * MAP_W + x]);

  for (let i = 0; i < n && i < paths.length; i++) {
    if (!isBridgeValue(paths[i])) continue;
    const x = i % MAP_W;
    const z = (i / MAP_W) | 0;

    let bestLen = 0;
    let bestAt = 0;
    let bestX = 1;
    for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
      let back = 0;
      while (bridge(x - dx * (back + 1), z - dz * (back + 1))) back++;
      let fwd = 0;
      while (bridge(x + dx * (fwd + 1), z + dz * (fwd + 1))) fwd++;
      const len = back + fwd + 1;
      if (len > bestLen) {
        bestLen = len;
        bestAt = back;
        bestX = dx;
      }
    }

    const t = (bestAt + 0.5) / bestLen;
    out.y[i] = deckY(t, bestLen);
    out.soffit[i] = soffitY(t, bestLen);
    out.slope[i] = deckSlope(t, bestLen);
    out.alongX[i] = bestX;
    out.span[i] = Math.min(255, bestLen);
  }
  return out;
}

/**
 * How close the boat gets to a crossing before it strikes its rig, in tiles.
 *
 * Far enough out that the mast is already down by the time the bow reaches the arch, and that it
 * reads as the crew doing something rather than as the mast blinking away.
 */
export const BRIDGE_STRIKE_RANGE = 4;
/** Seconds the rig takes to come down or go back up. */
export const BRIDGE_STRIKE_SECONDS = 2.5;

/** Is there a bridge within striking range of this point? */
export function bridgeNear(paths: number[], x: number, z: number, range = BRIDGE_STRIKE_RANGE): boolean {
  const x0 = Math.max(0, Math.floor(x - range));
  const x1 = Math.min(MAP_W - 1, Math.floor(x + range));
  const z0 = Math.max(0, Math.floor(z - range));
  const z1 = Math.min(MAP_H - 1, Math.floor(z + range));
  for (let tz = z0; tz <= z1; tz++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isBridgeValue(paths[tz * MAP_W + tx])) return true;
    }
  }
  return false;
}
