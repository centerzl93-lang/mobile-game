import { Camera } from '../engine/camera';
import {
  GameState,
  Tile,
  BUILDING_DEFS,
  BuildingType,
  ResourceKind,
  ADULT_AGE,
  MAP_W,
  MAP_H,
  PATH_DIRT,
  PATH_DIRT_PLAN,
  PATH_STONE,
  PATH_STONE_PLAN,
  PATH_BRIDGE,
  PATH_BRIDGE_PLAN,
  HARVEST_WOOD,
  HARVEST_STONE,
} from '../types';
import { tileIndex } from '../game/world';

export interface PlacementView {
  type: BuildingType | null;
  tx: number;
  ty: number;
  valid: boolean;
  /** True while in path-drawing mode (shows a hint reticle at screen centre). */
  pathTier?: 'dirt' | 'stone' | 'bridge' | null;
  selBuildingId?: number | null;
  selCitizenId?: number | null;
  /** Live harvest-marquee rectangle in world coords while dragging, else null. */
  marquee?: { x0: number; y0: number; x1: number; y1: number } | null;
}

const RES_DOT: Record<string, string> = {
  fruit: '#e05a6a', grain: '#e2c15a', fish: '#6fb0d0', meat: '#b5665a',
  wood: '#8a6a3c', firewood: '#d1642f', stone: '#a6a8af', coal: '#333',
  iron: '#9aa0aa', tools: '#c0c4cc', leather: '#8a5a3a', clothing: '#7bb0d8',
  livestock: '#d8b98a', medicine: '#c98fd8',
};

const BUILDING_COLORS: Record<BuildingType, string> = {
  house: '#b07a45',
  stonehouse: '#9a9089',
  tavern: '#b5893f',
  chapel: '#8f8fb0',
  cemetery: '#6a6a72',
  gatherer: '#5a8f4e',
  farm: '#9a8340',
  fishing: '#3f8f9a',
  hunting: '#7a5a3c',
  ranch: '#b58f52',
  lumberyard: '#3f7a3a',
  woodcutter: '#8a6a3c',
  quarry: '#8b8e95',
  mine: '#4a4a52',
  blacksmith: '#565059',
  tailor: '#9a5f92',
  trading: '#46708f',
  school: '#8f7d3f',
  herbalist: '#4f8a5a',
  hospital: '#b85a5a',
  well: '#5f7fa0',
  market: '#a07a3f',
  barn: '#6f6a4a',
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

    // Paths & bridges (over tiles, under buildings).
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const pv = s.paths[tileIndex(tx, ty)];
        if (!pv) continue;
        const [sx, sy] = this.camera.worldToScreen(tx, ty, w, h);
        const built = pv === PATH_DIRT || pv === PATH_STONE || pv === PATH_BRIDGE;
        ctx.globalAlpha = built ? 1 : 0.4;
        if (pv === PATH_BRIDGE || pv === PATH_BRIDGE_PLAN) {
          // Wooden deck spanning the whole water tile, with plank lines.
          ctx.fillStyle = '#7a5230';
          ctx.fillRect(sx, sy, p + 1, p + 1);
          if (p > 6) {
            ctx.strokeStyle = 'rgba(0,0,0,0.28)';
            ctx.lineWidth = 1;
            for (let k = 1; k < 3; k++) {
              ctx.beginPath();
              ctx.moveTo(sx, sy + (p * k) / 3);
              ctx.lineTo(sx + p, sy + (p * k) / 3);
              ctx.stroke();
            }
          }
        } else {
          const stone = pv === PATH_STONE || pv === PATH_STONE_PLAN;
          ctx.fillStyle = stone ? '#a6a8af' : '#6b5236';
          const inset = p * 0.16;
          roundRect(ctx, sx + inset, sy + inset, p - 2 * inset, p - 2 * inset, Math.max(2, p * 0.16));
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Harvest orders (marked trees / loose stone) — a tint + outline on each marked tile.
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const hv = s.harvest[tileIndex(tx, ty)];
        if (!hv) continue;
        const [sx, sy] = this.camera.worldToScreen(tx, ty, w, h);
        const wood = hv === HARVEST_WOOD;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = wood ? '#7ce07c' : '#d2d2dc';
        ctx.fillRect(sx, sy, p + 1, p + 1);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = wood ? 'rgba(120,220,120,0.9)' : 'rgba(210,210,220,0.95)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx + 1.5, sy + 1.5, p - 2, p - 2);
      }
    }

    // Faint work-radius rings for forest-worked buildings.
    for (const b of s.buildings) {
      const def = BUILDING_DEFS[b.type];
      if (!def.workRadius || !b.built) continue;
      const [sx, sy] = this.camera.worldToScreen(b.x + def.w / 2, b.y + def.h / 2, w, h);
      ctx.beginPath();
      ctx.arc(sx, sy, def.workRadius * p, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
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
        // Delivered-materials bar.
        const cost = def.cost;
        let need = 0;
        let have = 0;
        for (const k in cost) {
          const kind = k as ResourceKind;
          need += cost[kind] ?? 0;
          have += Math.min(cost[kind] ?? 0, b.store[kind] ?? 0);
        }
        const frac = need > 0 ? have / need : 0;
        ctx.fillStyle = '#00000066';
        ctx.fillRect(sx + 4, sy + bh - 6, bw - 8, 3);
        ctx.fillStyle = '#e2c15a';
        ctx.fillRect(sx + 4, sy + bh - 6, (bw - 8) * frac, 3);
      } else {
        ctx.fillStyle = BUILDING_COLORS[b.type];
        roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 5);
        ctx.fill();
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 1;
        ctx.stroke();
        this.glyph(def.emoji, sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.55);
        if (b.fireTimer) {
          ctx.fillStyle = 'rgba(224,84,32,0.45)';
          roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 5);
          ctx.fill();
          this.glyph('🔥', sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.6);
        }
        // Farm growth bar.
        if (b.type === 'farm' && b.growth > 0.02) {
          ctx.fillStyle = '#00000055';
          ctx.fillRect(sx + 4, sy + bh - 6, bw - 8, 3);
          ctx.fillStyle = '#8ed66b';
          ctx.fillRect(sx + 4, sy + bh - 6, (bw - 8) * b.growth, 3);
        }
        // Worker badge (staffing) on job buildings: green = full, amber = short.
        if (def.jobs > 0 && p > 12) {
          const label = `${b.workers.length}/${def.jobs}`;
          const fs = Math.max(8, Math.floor(p * 0.32));
          ctx.font = `${fs}px -apple-system, "Segoe UI", sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          const padX = 3;
          const tw = ctx.measureText(label).width;
          const bx = sx + 3;
          const by = sy + 3;
          const bhh = fs + 3;
          ctx.fillStyle =
            b.workers.length >= def.jobs ? 'rgba(30,70,34,0.9)' : 'rgba(120,80,24,0.9)';
          roundRect(ctx, bx, by, tw + padX * 2, bhh, 3);
          ctx.fill();
          ctx.fillStyle = '#eef3e8';
          ctx.fillText(label, bx + padX, by + 1);
        }
      }
      ctx.restore();
    }

    // Citizens.
    const cr = Math.max(2, p * 0.12);
    for (const c of s.citizens) {
      const [sx, sy] = this.camera.worldToScreen(c.x, c.y, w, h);
      const child = c.age < ADULT_AGE;
      const r = child ? cr * 0.6 : cr;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = child ? '#f7e6c8' : '#f4d9b0';
      ctx.fill();
      ctx.lineWidth = child ? 1 : 1.4;
      ctx.strokeStyle = c.sex === 'm' ? '#3f6d9c' : '#b0577f';
      ctx.stroke();
      if (c.carry) {
        ctx.beginPath();
        ctx.arc(sx, sy - cr * 1.7, Math.max(1.5, cr * 0.7), 0, Math.PI * 2);
        ctx.fillStyle = RES_DOT[c.carry.kind] ?? '#fff';
        ctx.fill();
      }
      if (c.sick) {
        ctx.beginPath();
        ctx.arc(sx + cr, sy - cr, Math.max(1.5, cr * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = '#d24a4a';
        ctx.fill();
      }
    }

    // Selection highlight (from the inspect panel).
    if (placement.selBuildingId != null) {
      const b = s.buildings.find((x) => x.id === placement.selBuildingId);
      if (b) {
        const def = BUILDING_DEFS[b.type];
        const [sx, sy] = this.camera.worldToScreen(b.x, b.y, w, h);
        ctx.strokeStyle = '#ffd76b';
        ctx.lineWidth = 2.5;
        roundRect(ctx, sx, sy, def.w * p, def.h * p, 5);
        ctx.stroke();
      }
    }
    if (placement.selCitizenId != null) {
      const c = s.citizens.find((x) => x.id === placement.selCitizenId);
      if (c) {
        const [sx, sy] = this.camera.worldToScreen(c.x, c.y, w, h);
        ctx.beginPath();
        ctx.arc(sx, sy, cr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd76b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Placement preview.
    if (placement.type) {
      const def = BUILDING_DEFS[placement.type];
      const [sx, sy] = this.camera.worldToScreen(placement.tx, placement.ty, w, h);
      ctx.save();
      // Bright work-radius ring while positioning a forest-worked building.
      if (def.workRadius) {
        const [cxp, cyp] = this.camera.worldToScreen(
          placement.tx + def.w / 2,
          placement.ty + def.h / 2,
          w,
          h,
        );
        ctx.beginPath();
        ctx.arc(cxp, cyp, def.workRadius * p, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = placement.valid ? '#5ad06a' : '#e0574a';
      roundRect(ctx, sx, sy, def.w * p, def.h * p, 4);
      ctx.fill();
      ctx.restore();
    }

    // Live harvest-marquee rectangle.
    if (placement.marquee) {
      const m = placement.marquee;
      const [ax, ay] = this.camera.worldToScreen(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), w, h);
      const [bx, by] = this.camera.worldToScreen(Math.max(m.x0, m.x1), Math.max(m.y0, m.y1), w, h);
      ctx.fillStyle = 'rgba(120,210,120,0.18)';
      ctx.fillRect(ax, ay, bx - ax, by - ay);
      ctx.strokeStyle = 'rgba(150,230,150,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(ax, ay, bx - ax, by - ay);
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
      case 'foothill':
        base = (tx + ty) % 2 === 0 ? '#8a7f68' : '#93886f';
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

    if (tile.type === 'grass' && (tile.stone ?? 0) > 0 && p > 6) {
      // A little cluster of loose boulders, harvestable by hand.
      const cx = sx + p / 2;
      const cy = sy + p / 2;
      const rr = Math.max(1.5, p * 0.12);
      ctx.fillStyle = '#9a9ca1';
      for (const [ox, oy] of [[-0.18, -0.08], [0.16, -0.16], [0.06, 0.18]] as [number, number][]) {
        ctx.beginPath();
        ctx.arc(cx + ox * p, cy + oy * p, rr, 0, Math.PI * 2);
        ctx.fill();
      }
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
