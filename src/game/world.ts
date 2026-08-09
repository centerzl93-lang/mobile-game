import { MAP_W, MAP_H, Tile, TileType, PATH_NONE, HARVEST_NONE, LOOSE_STONE_MIN, LOOSE_STONE_MAX, LOOSE_IRON_MIN, LOOSE_IRON_MAX, DEPOSIT_SPACING, DEPOSIT_CLUSTER_MIN, DEPOSIT_CLUSTER_MAX, DEPOSIT_FILL, DEPOSIT_WATER_MARGIN, STONE_CLUSTER_DENSITY, IRON_CLUSTER_DENSITY, FOREST_MOISTURE, START_CLEARING_RADIUS, FOOTHILL_RADIUS } from '../types';
import { mulberry32, newSeed } from './rng';

export function tileIndex(x: number, y: number): number {
  return y * MAP_W + x;
}

/** A fresh, empty path layer (one entry per tile). */
export function emptyPaths(): number[] {
  return new Array(MAP_W * MAP_H).fill(PATH_NONE);
}

/** A fresh, empty harvest-order layer (one entry per tile). */
export function emptyHarvest(): number[] {
  return new Array(MAP_W * MAP_H).fill(HARVEST_NONE);
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function getTile(tiles: Tile[], x: number, y: number): Tile | null {
  if (!inBounds(x, y)) return null;
  return tiles[tileIndex(x, y)];
}

/**
 * World x of the central river at row `y`. The river meanders down the map's middle, so we
 * pick the water tile nearest the horizontal centre (ignoring the edge lakes). Derived from the
 * actual tiles rather than the generator's noise, so a merchant boat can follow it on any seed.
 * Falls back to the map centre for the odd row that holds no central water.
 */
export function riverColumnX(tiles: Tile[], y: number): number {
  const yi = Math.max(0, Math.min(MAP_H - 1, Math.round(y)));
  const mid = MAP_W / 2;
  let bestX = mid;
  let bestD = Infinity;
  for (let x = 0; x < MAP_W; x++) {
    if (tiles[tileIndex(x, yi)].type !== 'water') continue;
    const d = Math.abs(x + 0.5 - mid);
    if (d < bestD) {
      bestD = d;
      bestX = x + 0.5;
    }
  }
  return bestX;
}

/**
 * Value-noise style generator. No dependencies — a seeded hash makes a given seed
 * reproducible. The map is mostly land: forest and rock clusters over grass, carved by a
 * meandering north–south river down the middle plus lakes bleeding off the left/right edges.
 * Loose stone is scattered on grass so villagers have something to hand-harvest.
 */
export function generateWorld(seed = newSeed()): Tile[] {
  const rand = mulberry32(seed);
  const elev = valueNoise(MAP_W, MAP_H, rand, 6);
  // Moisture drives where forest grows. A single low-frequency field spans about a tenth of the
  // map per blob, so a whole region could fall under the forest threshold at once and render as
  // one bald half — which is exactly what it did. Three octaves keep the broad damp/dry regions
  // but break them up locally, so a dry region becomes patchy woodland with clearings in it
  // rather than a bare plain.
  const moistBase = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0x9e3779b9), 7);
  const moistMid = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0x7f4a7c15), 17);
  const moistFine = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0x27d4eb2d), 33);
  const moist = new Float32Array(MAP_W * MAP_H);
  for (let i = 0; i < moist.length; i++) {
    moist[i] = moistBase[i] * 0.5 + moistMid[i] * 0.3 + moistFine[i] * 0.2;
  }
  // River centre-line meanders around the middle column (sine + slow noise), width ~2–3.
  const wobble = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0x2545f491), 3);
  const riverCx = (y: number): number => {
    const n = wobble[tileIndex(0, y)] - 0.5; // -0.5..0.5
    return MAP_W / 2 + Math.sin(y / 7) * 4 + n * 8;
  };
  // Half-width, so the river runs about 3.4 tiles across at its narrowest and 7.4 at its widest.
  // Wide enough to read as a real river from the camera — and wide enough that a bridge is a
  // decision rather than a formality.
  const riverHalf = (y: number): number => 2.7 + (wobble[tileIndex(MAP_W - 1, y)] - 0.5) * 2.03;

  // ---- Lakes -------------------------------------------------------------------------------
  // Water is most of what makes a map read as somewhere rather than as a field, and the maps got
  // half again bigger without gaining any. Three kinds now:
  //
  //  * one **central lake straddling the river**, so the river runs *into* it at the top and out
  //    of it at the bottom instead of crossing the whole map as one uniform ribbon. It sits on
  //    the meander line rather than at the map's centre, which is what makes the channel meet it
  //    head-on at both ends;
  //  * the two **edge lakes**, centred just off the map so they read as a larger body carrying on
  //    past the border;
  //  * a scatter of **inland lakes**, counted from the map's area — a large map gets a lake
  //    district, a small one keeps a pond or two.
  //
  // Every shore is wobbled. A bare ellipse reads as a stamped hole from the game camera, and with
  // a dozen of them on screen the repetition is the first thing you notice.
  interface Lake { cx: number; cy: number; rx: number; ry: number; wob: number; phase: number }
  const lake = (cx: number, cy: number, rx: number, ry: number): Lake => ({
    cx, cy, rx, ry, wob: 0.10 + rand() * 0.12, phase: rand() * Math.PI * 2,
  });

  const midY = MAP_H / 2;
  const lakes: Lake[] = [
    lake(riverCx(midY), midY, MAP_W * (0.11 + rand() * 0.04), MAP_H * (0.085 + rand() * 0.03)),
    lake(-2 + rand() * 3, MAP_H * (0.25 + rand() * 0.15), 8 + rand() * 3, 6 + rand() * 3),
    lake(MAP_W + 1 - rand() * 3, MAP_H * (0.6 + rand() * 0.15), 8 + rand() * 3, 6 + rand() * 3),
  ];
  // Sized in tiles, not as a fraction of the map, so a pond is the same pond on every map size
  // and a bigger world simply holds more of them. The count is linear in area for that reason —
  // what a player notices walking about is how *often* they meet water, which is a density, so
  // the number has to grow with the map or a large one reads as a drought. The ceiling is only a
  // guard against a pathological map size; at 192 tiles a side it is not reached.
  const inlandLakes = Math.max(2, Math.min(24, Math.round(((MAP_W * MAP_H) / 1000) * 0.55)));
  for (let n = 0; n < inlandLakes; n++) {
    const rx = 3 + rand() * 7;
    lakes.push(lake(
      MAP_W * (0.06 + rand() * 0.88),
      MAP_H * (0.06 + rand() * 0.88),
      rx,
      rx * (0.55 + rand() * 0.5),
    ));
  }

  const inLake = (x: number, y: number): boolean =>
    lakes.some((l) => {
      const dx = (x + 0.5 - l.cx) / l.rx;
      const dy = (y + 0.5 - l.cy) / l.ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 2.2) return false; // cheap reject, so the trig below runs only near a shore
      if (d2 === 0) return true;
      // Two harmonics: enough to break the outline into bays and headlands, few enough that the
      // shore stays a shore rather than becoming a starfish.
      const a = Math.atan2(dy, dx);
      const r = 1 + Math.sin(a * 3 + l.phase) * l.wob + Math.sin(a * 2 - l.phase * 1.7) * l.wob * 0.6;
      return d2 < r * r;
    });

  const tiles: Tile[] = new Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = tileIndex(x, y);
      const isRiver = Math.abs(x + 0.5 - riverCx(y)) <= riverHalf(y);
      let type: TileType;
      let trees = 0;
      if (isRiver || inLake(x, y)) {
        type = 'water';
      } else if (elev[i] > 0.68 && moistBase[i] < 0.6) {
        // Ranges follow the broad damp/dry regions, not the fine detail — otherwise tuning the
        // woodland would silently move the mountains too.
        type = 'stone'; // mountain — a wider, more prominent range than a bare peak
      } else if (moist[i] > FOREST_MOISTURE && elev[i] < 0.78) {
        // Generous, because every surface deposit clears the trees off its own tile — without
        // this the deposits alone strip the map back to open grass.
        type = 'forest'; // most of the map is woodland
        trees = 0.6 + moist[i] * 0.4;
      } else {
        type = 'grass';
      }
      tiles[i] = { type, trees };
    }
  }

  // Surface deposits go in after the landscape exists, as individual bounded outcrops. Both
  // passes share one keep-out mask — seeded with the shoreline margin, then extended around each
  // outcrop as it is placed — so stone and iron cannot chain into each other either.
  const area = (MAP_W * MAP_H) / 1000;
  // Iron goes first: it is the rarer of the two, and seeding the common one first left it
  // fenced out of almost the whole map — four iron tiles a world instead of fifty.
  const blocked = waterProximity(tiles, DEPOSIT_WATER_MARGIN);
  seedDeposits(tiles, rand, 'iron', Math.round(IRON_CLUSTER_DENSITY * area), blocked);
  seedDeposits(tiles, rand, 'stone', Math.round(STONE_CLUSTER_DENSITY * area), blocked);

  // Carve foothills: the low, buildable rocky band at each mountain's base. Any land tile
  // within FOOTHILL_RADIUS of a mountain (stone) tile becomes foothill (losing its trees /
  // loose stone). This gives mountains a visible base and the only ground mines can sit on.
  const mountainSrc: number[] = [];
  for (let i = 0; i < tiles.length; i++) if (tiles[i].type === 'stone') mountainSrc.push(i);
  for (const src of mountainSrc) {
    const sx = src % MAP_W;
    const sy = (src / MAP_W) | 0;
    for (let dy = -FOOTHILL_RADIUS; dy <= FOOTHILL_RADIUS; dy++) {
      for (let dx = -FOOTHILL_RADIUS; dx <= FOOTHILL_RADIUS; dx++) {
        const t = getTile(tiles, sx + dx, sy + dy);
        if (!t || (t.type !== 'grass' && t.type !== 'forest')) continue;
        t.type = 'foothill';
        t.trees = 0;
        delete t.stone;
        delete t.iron;
      }
    }
  }
  clearWaterMargin(tiles);
  return tiles;
}

/** Radius (Euclidean) of the plains patch we score candidate start tiles by. */
const START_PLAINS_RADIUS = 3;
/**
 * Tiles of clearance the founding site keeps from the map edge, when a site that far in exists.
 *
 * Without it the village can be founded two tiles from the border — measured on 2 of 12 small
 * worlds — which leaves nowhere to put the buildings that need room, and the biggest of them is
 * an 8x8 quarry. It is a preference rather than a rule: a map with no qualifying site still gets
 * a village rather than an exception.
 */
const START_EDGE_MARGIN = 8;

/**
 * Find a genuinely grassy spot to start the village on — one whose *core* (the barn footprint
 * plus a small spawn ring) is entirely grass, maximising the surrounding plains and preferring
 * locations near the map centre. This keeps the barn and villagers off the river/lakes so a new
 * game can never soft-lock on water. If no core is perfectly clear (pathological maps), we still
 * return the grassiest candidate found.
 */
export function findStartTile(tiles: Tile[]): { x: number; y: number } {
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  const R = START_PLAINS_RADIUS;
  const R2 = R * R;

  // Is the barn footprint (2x2 from the top-left corner) plus the immediate spawn ring (a
  // radius-2 disc around it) all grass? That's the region the barn + founders occupy.
  const coreIsGrass = (x: number, y: number): boolean => {
    for (let dy = -2; dy <= 3; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 8) continue; // ~radius-2 disc around the 2x2 footprint
        const t = getTile(tiles, x + dx, y + dy);
        if (!t || t.type !== 'grass') return false;
      }
    }
    return true;
  };

  // Count grass within START_PLAINS_RADIUS — how roomy the surrounding plains are.
  const plainsScore = (x: number, y: number): number => {
    let n = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R2) continue;
        const t = getTile(tiles, x + dx, y + dy);
        if (t && t.type === 'grass') n++;
      }
    }
    return n;
  };

  /**
   * Four running candidates, in descending order of what we would rather have: an all-grass core
   * with elbow room from the border, an all-grass core anywhere, the roomiest plains with elbow
   * room, the roomiest plains anywhere.
   *
   * Both tiers need the margin, not just the first. An all-grass core is genuinely scarce on a
   * small map — the founding clearing is carved *after* this runs, so it is choosing from raw
   * terrain that is only about a fifth open ground — and when none exists the whole decision
   * falls through to the plains score. Guarding only the top tier left that path unguarded,
   * which is why the village still landed two tiles from the border after the first attempt at
   * this.
   */
  // `clearStartArea` carves the founding clearing to grass afterwards and can fix woodland, rock
  // and loose deposits — the one thing it skips is water. So "no water in the core" is the real
  // requirement, and an all-grass core is only a preference on top of it.
  const coreIsDry = (x: number, y: number): boolean => {
    for (let dy = -2; dy <= 3; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 8) continue;
        const t = getTile(tiles, x + dx, y + dy);
        if (!t || t.type === 'water') return false;
      }
    }
    return true;
  };

  type Pick = { x: number; y: number; score: number; dist: number } | null;
  let coreInset: Pick = null;
  let coreAny: Pick = null;
  let openInset: Pick = null;
  let openAny: Pick = null;
  // Roomier plains win; ties break toward the centre of the map.
  const better = (a: Pick, score: number, dist: number): boolean =>
    !a || score > a.score || (score === a.score && dist < a.dist);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const score = plainsScore(x, y);
      const dist = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      const roomy =
        x >= START_EDGE_MARGIN && y >= START_EDGE_MARGIN &&
        x < MAP_W - START_EDGE_MARGIN && y < MAP_H - START_EDGE_MARGIN;
      if (coreIsDry(x, y)) {
        if (better(openAny, score, dist)) openAny = { x, y, score, dist };
        if (roomy && better(openInset, score, dist)) openInset = { x, y, score, dist };
      }
      if (!coreIsGrass(x, y)) continue;
      if (better(coreAny, score, dist)) coreAny = { x, y, score, dist };
      if (roomy && better(coreInset, score, dist)) coreInset = { x, y, score, dist };
    }
  }
  // Elbow room outranks a perfect core, because the clearing makes the core anyway and no amount
  // of clearing moves the map's edge. Water is the only disqualifier either way.
  const pick = coreInset ?? openInset ?? coreAny ?? openAny ?? { x: Math.floor(cx), y: Math.floor(cy) };
  return { x: pick.x, y: pick.y };
}

// ---- noise helpers ----

function valueNoise(w: number, h: number, rand: () => number, cells: number): Float32Array {
  // Random lattice, bilinearly interpolated and normalised to 0..1.
  const gw = cells + 1;
  const gh = cells + 1;
  const lattice = new Float32Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();

  const out = new Float32Array(w * h);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cells;
      const fy = (y / h) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);
      const a = lattice[y0 * gw + x0];
      const b = lattice[y0 * gw + x0 + 1];
      const c = lattice[(y0 + 1) * gw + x0];
      const d = lattice[(y0 + 1) * gw + x0 + 1];
      const top = a + (b - a) * tx;
      const bot = c + (d - c) * tx;
      const v = top + (bot - top) * ty;
      out[y * w + x] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range;
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}


/**
 * Scatter `count` bounded outcrops of one resource across the map.
 *
 * Each is grown from a single seed tile into an irregular footprint of at most
 * `DEPOSIT_CLUSTER_MAX` tiles, and then only `DEPOSIT_FILL` of that footprint actually carries
 * ore. Both parts matter: the cap stops one outcrop swallowing a quarter of the map, and the
 * partial fill leaves the woodland standing between the nodes, so rock reads as showing through
 * the trees instead of as a felled clearing.
 */
function seedDeposits(
  tiles: Tile[],
  rand: () => number,
  kind: 'stone' | 'iron',
  count: number,
  blocked: Uint8Array,
): void {
  const canHost = (i: number): boolean => {
    const t = tiles[i];
    if (t.type !== 'grass' && t.type !== 'forest') return false;
    return !blocked[i];
  };

  for (let c = 0; c < count; c++) {
    // Find somewhere to start. Give up on this cluster rather than search exhaustively — on a
    // map with little open ground, fewer outcrops is the right answer.
    let seed = -1;
    for (let tries = 0; tries < 60 && seed < 0; tries++) {
      const i = Math.floor(rand() * tiles.length);
      if (canHost(i)) seed = i;
    }
    if (seed < 0) continue;

    const target = DEPOSIT_CLUSTER_MIN + Math.floor(rand() * (DEPOSIT_CLUSTER_MAX - DEPOSIT_CLUSTER_MIN + 1));
    const region = growRegion(seed, target, rand, canHost);
    // Fence the whole footprint off before placing anything, so the next outcrop keeps its
    // distance whether or not a given tile in this one ended up carrying ore.
    for (const i of region) {
      const x = i % MAP_W;
      const y = (i / MAP_W) | 0;
      for (let dy = -DEPOSIT_SPACING; dy <= DEPOSIT_SPACING; dy++) {
        for (let dx = -DEPOSIT_SPACING; dx <= DEPOSIT_SPACING; dx++) {
          if (inBounds(x + dx, y + dy)) blocked[tileIndex(x + dx, y + dy)] = 1;
        }
      }
    }
    for (const i of region) {
      if (rand() > DEPOSIT_FILL) continue;
      const t = tiles[i];
      // One tile carries one resource, never trees and ore at once — the harvest layer holds a
      // single order per tile, so a tile with both would be unharvestable in one of the two ways.
      t.type = 'grass';
      t.trees = 0;
      if (kind === 'stone') t.stone = Math.round(LOOSE_STONE_MIN + rand() * (LOOSE_STONE_MAX - LOOSE_STONE_MIN));
      else t.iron = Math.round(LOOSE_IRON_MIN + rand() * (LOOSE_IRON_MAX - LOOSE_IRON_MIN));
    }
  }
}

/**
 * Grow a connected blob of up to `target` tiles from `seed`, taking a random tile off the
 * frontier each step. Picking randomly rather than breadth-first is what makes the outline
 * ragged; breadth-first growth produces a diamond.
 */
function growRegion(seed: number, target: number, rand: () => number, ok: (i: number) => boolean): number[] {
  const region = [seed];
  const claimed = new Set<number>([seed]);
  const frontier: number[] = [];
  const pushNeighbours = (i: number): void => {
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const j = tileIndex(nx, ny);
      if (!claimed.has(j) && ok(j)) frontier.push(j);
    }
  };
  pushNeighbours(seed);
  while (region.length < target && frontier.length > 0) {
    const k = Math.floor(rand() * frontier.length);
    const i = frontier[k];
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    if (claimed.has(i)) continue;
    claimed.add(i);
    region.push(i);
    pushNeighbours(i);
  }
  return region;
}

/** Mask of tiles within `margin` (Chebyshev) of a water tile. */
function waterProximity(tiles: Tile[], margin: number): Uint8Array {
  const near = new Uint8Array(tiles.length);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (tiles[tileIndex(x, y)].type !== 'water') continue;
      for (let dy = -margin; dy <= margin; dy++) {
        for (let dx = -margin; dx <= margin; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (inBounds(nx, ny)) near[tileIndex(nx, ny)] = 1;
        }
      }
    }
  }
  return near;
}

/**
 * Clear surface deposits off tiles near water.
 *
 * The bank slopes down into the water and the terrain shader blends sand well past the water's
 * edge, so a deposit close to shore stands on ground that has already begun dropping toward the
 * lake bed and renders as sitting on the beach. Rather than chase that per-prop, keep the whole
 * margin clear. `seedDeposits` already avoids it; this catches the tiles that *become* margin
 * when a later pass reshapes the map.
 */
function clearWaterMargin(tiles: Tile[]): void {
  const near = waterProximity(tiles, DEPOSIT_WATER_MARGIN);
  for (let i = 0; i < tiles.length; i++) {
    if (!near[i]) continue;
    delete tiles[i].stone;
    delete tiles[i].iron;
  }
}

/**
 * Open up the ground around the founding barn.
 *
 * Most of the map is woodland and rock now, so without this a new game can begin walled in by
 * trees with nowhere to build. The clearing is deliberately irregular — its radius wobbles with
 * angle — because a perfect circle of grass in the middle of a forest reads as a crop circle.
 * Water is never touched, so a riverbank start keeps its river.
 */
export function clearStartArea(tiles: Tile[], cx: number, cy: number): void {
  const r = START_CLEARING_RADIUS;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (!inBounds(x, y)) continue;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      // Wobble the edge with a couple of harmonics so the clearing has an organic outline.
      const a = Math.atan2(dy, dx);
      // Keep the wobble well above zero: the amplitudes must leave a guaranteed open core, or a
      // narrow lobe can land on the barn and the village starts boxed in after all.
      const edge = r * (0.80 + 0.12 * Math.sin(a * 3 + cx) + 0.08 * Math.sin(a * 5 - cy));
      if (dist > edge) continue;
      const t = tiles[tileIndex(x, y)];
      if (t.type === 'water') continue;
      t.type = 'grass';
      t.trees = 0;
      delete t.stone;
      delete t.iron;
    }
  }
  // Clearing can remove a mountain tile that a foothill was hugging, which would leave that
  // foothill orphaned — foothills exist only as the buildable skirt of a mountain, and mines
  // rely on that. Demote any foothill that just lost its mountain.
  for (let y = Math.floor(cy - r - 3); y <= Math.ceil(cy + r + 3); y++) {
    for (let x = Math.floor(cx - r - 3); x <= Math.ceil(cx + r + 3); x++) {
      if (!inBounds(x, y)) continue;
      const t = tiles[tileIndex(x, y)];
      if (t.type !== 'foothill') continue;
      let hasMountain = false;
      for (let dy = -FOOTHILL_RADIUS; dy <= FOOTHILL_RADIUS && !hasMountain; dy++) {
        for (let dx = -FOOTHILL_RADIUS; dx <= FOOTHILL_RADIUS && !hasMountain; dx++) {
          const n = getTile(tiles, x + dx, y + dy);
          if (n && n.type === 'stone') hasMountain = true;
        }
      }
      if (!hasMountain) { t.type = 'grass'; t.trees = 0; }
    }
  }
  clearWaterMargin(tiles);
}
