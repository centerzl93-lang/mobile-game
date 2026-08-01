import { MAP_W, MAP_H, Tile, TileType, PATH_NONE, HARVEST_NONE, LOOSE_STONE_MIN, LOOSE_STONE_MAX, LOOSE_IRON_MIN, LOOSE_IRON_MAX, STONE_CLUSTER_THRESHOLD, IRON_CLUSTER_THRESHOLD, FOREST_DEPOSIT_EXTRA, FOREST_MOISTURE, START_CLEARING_RADIUS, FOOTHILL_RADIUS } from '../types';

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
export function generateWorld(seed = Math.floor(Math.random() * 1e9)): Tile[] {
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
  // Separate noise fields for the surface deposits, so stone and iron form their own patches
  // rather than appearing wherever a uniform random roll happens to land.
  const stoneField = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0x85ebca6b), 9);
  const ironField = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0xc2b2ae35), 11);

  // River centre-line meanders around the middle column (sine + slow noise), width ~2–3.
  const wobble = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0x2545f491), 3);
  const riverCx = (y: number): number => {
    const n = wobble[tileIndex(0, y)] - 0.5; // -0.5..0.5
    return MAP_W / 2 + Math.sin(y / 7) * 4 + n * 8;
  };
  const riverHalf = (y: number): number => 1.8 + (wobble[tileIndex(MAP_W - 1, y)] - 0.5) * 1.35; // ~1.1..2.5 (≈50% wider)

  // Two lakes centred just past the left and right edges so they continue off-map.
  const lakes = [
    { cx: -2 + rand() * 3, cy: MAP_H * (0.25 + rand() * 0.15), rx: 8 + rand() * 3, ry: 6 + rand() * 3 },
    { cx: MAP_W + 1 - rand() * 3, cy: MAP_H * (0.6 + rand() * 0.15), rx: 8 + rand() * 3, ry: 6 + rand() * 3 },
  ];
  const inLake = (x: number, y: number): boolean =>
    lakes.some((l) => ((x - l.cx) / l.rx) ** 2 + ((y - l.cy) / l.ry) ** 2 < 1);

  const tiles: Tile[] = new Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = tileIndex(x, y);
      const isRiver = Math.abs(x + 0.5 - riverCx(y)) <= riverHalf(y);
      let type: TileType;
      let trees = 0;
      let stone: number | undefined;
      let iron: number | undefined;
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
      // Surface deposits sit in noise clusters, and an outcrop in the woods clears the trees off
      // its own tile: one tile carries one resource, never trees and ore at once. That keeps them
      // scattered through the forest — as small natural clearings — without stacking two harvests
      // on a tile whose harvest layer can only hold one order.
      if (type === 'grass' || type === 'forest') {
        const extra = type === 'forest' ? FOREST_DEPOSIT_EXTRA : 0;
        if (stoneField[i] > STONE_CLUSTER_THRESHOLD + extra) {
          stone = Math.round(LOOSE_STONE_MIN + rand() * (LOOSE_STONE_MAX - LOOSE_STONE_MIN));
        } else if (ironField[i] > IRON_CLUSTER_THRESHOLD + extra) {
          iron = Math.round(LOOSE_IRON_MIN + rand() * (LOOSE_IRON_MAX - LOOSE_IRON_MIN));
        }
        if (stone !== undefined || iron !== undefined) {
          type = 'grass';
          trees = 0;
        }
      }
      const tile: Tile = { type, trees };
      if (stone !== undefined) tile.stone = stone;
      if (iron !== undefined) tile.iron = iron;
      tiles[i] = tile;
    }
  }

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

  let best: { x: number; y: number } | null = null;
  let bestClearScore = -1;
  let bestClearDist = Infinity;
  let fallback: { x: number; y: number } = { x: Math.floor(cx), y: Math.floor(cy) };
  let fallbackScore = -1;

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const score = plainsScore(x, y);
      if (score > fallbackScore) {
        fallbackScore = score;
        fallback = { x, y };
      }
      if (!coreIsGrass(x, y)) continue;
      const dist = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      // Prefer the roomiest plains; tie-break toward the centre of the map.
      if (score > bestClearScore || (score === bestClearScore && dist < bestClearDist)) {
        bestClearScore = score;
        bestClearDist = dist;
        best = { x, y };
      }
    }
  }
  return best ?? fallback;
}

// ---- noise helpers ----
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
 * Clear surface deposits off tiles that touch water.
 *
 * The bank slopes down into the water, so a deposit on a waterside tile stands on ground that has
 * already dropped below the water plane and reads as floating on the river. Rather than chase
 * that per-prop, keep the margin itself clear.
 */
function clearWaterMargin(tiles: Tile[]): void {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tiles[tileIndex(x, y)];
      if ((t.stone ?? 0) <= 0 && (t.iron ?? 0) <= 0) continue;
      let nearWater = false;
      for (let dy = -1; dy <= 1 && !nearWater; dy++) {
        for (let dx = -1; dx <= 1 && !nearWater; dx++) {
          const n = getTile(tiles, x + dx, y + dy);
          if (n && n.type === 'water') nearWater = true;
        }
      }
      if (nearWater) {
        delete t.stone;
        delete t.iron;
      }
    }
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
