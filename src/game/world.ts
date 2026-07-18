import { MAP_W, MAP_H, Tile, TileType, PATH_NONE } from '../types';

export function tileIndex(x: number, y: number): number {
  return y * MAP_W + x;
}

/** A fresh, empty path layer (one entry per tile). */
export function emptyPaths(): number[] {
  return new Array(MAP_W * MAP_H).fill(PATH_NONE);
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function getTile(tiles: Tile[], x: number, y: number): Tile | null {
  if (!inBounds(x, y)) return null;
  return tiles[tileIndex(x, y)];
}

/**
 * Value-noise style generator with a couple of octaves. No dependencies —
 * uses a seeded hash so a given seed always produces the same island.
 */
export function generateWorld(seed = Math.floor(Math.random() * 1e9)): Tile[] {
  const rand = mulberry32(seed);
  const grid = new Float32Array(MAP_W * MAP_H);
  const moist = new Float32Array(MAP_W * MAP_H);

  const elev = valueNoise(MAP_W, MAP_H, rand, 6);
  const m = valueNoise(MAP_W, MAP_H, mulberry32(seed ^ 0x9e3779b9), 5);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = elev[i];
    moist[i] = m[i];
  }

  const tiles: Tile[] = new Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = tileIndex(x, y);
      // Radial falloff so edges are water -> gives an island the camera stays on.
      const nx = (x / MAP_W) * 2 - 1;
      const ny = (y / MAP_H) * 2 - 1;
      const dist = Math.sqrt(nx * nx + ny * ny);
      const e = grid[i] - dist * 0.55;

      let type: TileType;
      let trees = 0;
      if (e < 0.02) {
        type = 'water';
      } else if (e > 0.62 && moist[i] < 0.45) {
        type = 'stone';
      } else if (moist[i] > 0.52 && e < 0.5) {
        type = 'forest';
        trees = 0.6 + moist[i] * 0.4;
      } else {
        type = 'grass';
      }
      tiles[i] = { type, trees };
    }
  }
  return tiles;
}

/** Find a buildable grass patch near the map centre to start the village on. */
export function findStartTile(tiles: Tile[]): { x: number; y: number } {
  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);
  for (let r = 0; r < Math.max(MAP_W, MAP_H); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const t = getTile(tiles, x, y);
        if (t && t.type === 'grass') return { x, y };
      }
    }
  }
  return { x: cx, y: cy };
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
