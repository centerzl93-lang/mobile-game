import { Camera } from '../engine/camera';
import {
  GameState,
  Tile,
  BUILDING_DEFS,
  BuildingType,
  MAP_W,
  MAP_H,
} from '../types';
import { tileIndex } from '../game/world';

export interface PlacementView {
  type: BuildingType | null;
  tx: number;
  ty: number;
  valid: boolean;
}

const BUILDING_COLORS: Record<BuildingType, string> = {
  house: '#b07a45',
  gatherer: '#5a8f4e',
  woodcutter: '#8a6a3c',
  farm: '#9a8340',
  barn: '#7a5a86',
};

export class Renderer {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private camera: Camera,
  ) {}

  draw(s: GameState, w: number, h: number, placement: PlacementView): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    // Sea backdrop.
    ctx.fillStyle = '#1d4d63';
    ctx.fillRect(0, 0, w, h);

    const p = this.camera.pxPerTile;

    // Visible tile bounds.
    const [wx0, wy0] = this.camera.screenToWorld(0, 0, w, h);
    const [wx1, wy1] = this.camera.screenToWorld(w, h, w, h);
    const minX = Math.max(0, Math.floor(wx0) - 1);
    const minY = Math.max(0, Math.floor(wy0) - 1);
    const maxX = Math.min(MAP_W - 1, Math.ceil(wx1) + 1);
    const maxY = Math.min(MAP_H - 1, Math.ceil(wy1) + 1);

    // Tiles.
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const tile = s.tiles[tileIndex(tx, ty)];
        const [sx, sy] = this.camera.worldToScreen(tx, ty, w, h);
        this.drawTile(tile, tx, ty, sx, sy, p);
      }
    }

    // Buildings.
    for (const b of s.buildings) {
      const def = BUILDING_DEFS[b.type];
      const [sx, sy] = this.camera.worldToScreen(b.x, b.y, w, h);
      const bw = def.w * p;
      const bh = def.h * p;
      ctx.save();
      if (!b.built) {
        // Construction: dashed outline + partial fill.
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = BUILDING_COLORS[b.type];
        roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = '#ffffff88';
        ctx.lineWidth = 1.5;
        roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 4);
        ctx.stroke();
        ctx.setLineDash([]);
        this.glyph('🔨', sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.5);
      } else {
        ctx.fillStyle = BUILDING_COLORS[b.type];
        roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 5);
        ctx.fill();
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 1;
        ctx.stroke();
        this.glyph(def.emoji, sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.55);
        // Farm growth bar.
        if (b.type === 'farm' && b.growth > 0.02) {
          ctx.fillStyle = '#00000055';
          ctx.fillRect(sx + 4, sy + bh - 6, bw - 8, 3);
          ctx.fillStyle = '#8ed66b';
          ctx.fillRect(sx + 4, sy + bh - 6, (bw - 8) * b.growth, 3);
        }
      }
      ctx.restore();
    }

    // Citizens.
    const cr = Math.max(2, p * 0.12);
    for (const c of s.citizens) {
      const [sx, sy] = this.camera.worldToScreen(c.x, c.y, w, h);
      ctx.beginPath();
      ctx.arc(sx, sy, cr, 0, Math.PI * 2);
      ctx.fillStyle = '#f4d9b0';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#5b3d24';
      ctx.stroke();
    }

    // Placement preview.
    if (placement.type) {
      const def = BUILDING_DEFS[placement.type];
      const [sx, sy] = this.camera.worldToScreen(placement.tx, placement.ty, w, h);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = placement.valid ? '#5ad06a' : '#e0574a';
      roundRect(ctx, sx, sy, def.w * p, def.h * p, 4);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawTile(tile: Tile, tx: number, ty: number, sx: number, sy: number, p: number): void {
    const ctx = this.ctx;
    const size = p + 1; // overlap to avoid seams
    let base: string;
    switch (tile.type) {
      case 'water':
        base = (tx + ty) % 2 === 0 ? '#2b6a86' : '#2f7290';
        break;
      case 'stone':
        base = (tx + ty) % 2 === 0 ? '#7c7e84' : '#868890';
        break;
      case 'forest':
        base = '#3f6f39';
        break;
      default: {
        // subtle grass variation
        const v = ((tx * 73856093) ^ (ty * 19349663)) & 3;
        base = ['#4f8043', '#548645', '#4b7a3f', '#57894a'][v];
      }
    }
    ctx.fillStyle = base;
    ctx.fillRect(sx, sy, size, size);

    if (tile.type === 'forest' && p > 6) {
      // A little pine whose size tracks remaining trees.
      const s2 = p * (0.3 + tile.trees * 0.4);
      const cx = sx + p / 2;
      const cy = sy + p / 2;
      ctx.fillStyle = '#274d24';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s2 * 0.6);
      ctx.lineTo(cx - s2 * 0.45, cy + s2 * 0.35);
      ctx.lineTo(cx + s2 * 0.45, cy + s2 * 0.35);
      ctx.closePath();
      ctx.fill();
    }
  }

  private glyph(ch: string, cx: number, cy: number, size: number): void {
    const ctx = this.ctx;
    ctx.font = `${Math.max(8, Math.floor(size))}px -apple-system, "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, cx, cy);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
