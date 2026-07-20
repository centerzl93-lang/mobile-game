import { MAP_W, MAP_H, Tile, TileType, PATH_NONE, HARVEST_NONE, LOOSE_STONE_MIN, LOOSE_STONE_MAX, LOOSE_STONE_COVERAGE, FOOTHILL_RADIUS } from '../types';

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
 * Value-noise style generator. No dependencies — a seeded hash makes a given seed
 * reproducible. The map is mostly land: forest and rock clusters over grass, carved by a
 * meandering north–south river down the middle plus lakes bleeding off the left/right edges.
 * Loose stone is scattered on grass so villagers have something to hand-harvest.
 */
export function generateWorld(seed = Math.floor(Math.random() * 1e9)): Tile[] {
  const rand = mulberry32(seed);
  const elev = valueNoise(MAP_W, MAP_H, rand, 6);
  const moist = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0x9e3779b9), 5);

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
      if (isRiver || inLake(x, y)) {
        type = 'water';
      } else if (elev[i] > 0.78 && moist[i] < 0.55) {
        type = 'stone'; // mountain peak — smaller footprint, only the highest ground
      } else if (moist[i] > 0.5 && elev[i] < 0.7) {
        type = 'forest';
        trees = 0.6 + moist[i] * 0.4;
      } else {
        type = 'grass';
        // Scatter loose-stone deposits on some grass, in small clusters.
        if (rand() < LOOSE_STONE_COVERAGE) {
          stone = Math.round(LOOSE_STONE_MIN + rand() * (LOOSE_STONE_MAX - LOOSE_STONE_MIN));
        }
      }
      tiles[i] = stone !== undefined ? { type, trees, stone } : { type, trees };
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
      }
    }
  }
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
