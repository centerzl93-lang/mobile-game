import { Camera } from '../engine/camera';
import {
  GameState,
  Building,
  Tile,
  BUILDING_DEFS,
  costOf,
  BuildingType,
  workRadiusOf,
  fullWorkRadiusOf,
  footprintW,
  footprintH,
  ranchCapacity,
  ANIMAL_META,
  CROP_META,
  ResourceKind,
  ADULT_AGE,
  MAP_W,
  MAP_H,
  PATH_DIRT,
  PATH_DIRT_PLAN,
  PATH_STONE,
  PATH_STONE_PLAN,
  PATH_BRIDGE,
  PATH_BRIDGE_STONE_PLAN,
  PATH_BRIDGE_STONE,
  PATH_BRIDGE_PLAN,
  HARVEST_WOOD,
  HARVEST_STONE,
  fireIntensity,
} from '../types';
import { tileIndex } from '../game/world';

export interface PlacementView {
  type: BuildingType | null;
  tx: number;
  ty: number;
  /** Footprint of the ghost being placed (for the sized ranch); defaults to the def size. */
  pw?: number;
  ph?: number;
  /** Quarter turns clockwise the ghost is being placed at (see `Building.rot`). */
  prot?: 0 | 1 | 2 | 3;
  valid: boolean;
  /**
   * Placeable, but its door can't be reached from the village — a soft-lock waiting to happen.
   * Drawn yellow rather than green, with an "Unreachable" tag, but still allowed (see
   * `placementReachable`). Only meaningful when `valid` is true.
   */
  warn?: boolean;
  /** True while in path-drawing mode (shows a hint reticle at screen centre). */
  pathTier?: 'dirt' | 'stone' | 'bridge' | 'stonebridge' | 'tunnel' | null;
  selBuildingId?: number | null;
  selCitizenId?: number | null;
  /** Live harvest-marquee rectangle in world coords while dragging, else null. */
  marquee?: { x0: number; y0: number; x1: number; y1: number } | null;
}

const RES_DOT: Record<string, string> = {
  fruit: '#e05a6a', grain: '#e2c15a', eggs: '#f2e4b0',
  corn: '#f2cf4a', potato: '#c99a5e', rice: '#efe9d6', barley: '#d8c98a',
  carrot: '#e0913a', tomato: '#d6483c', onion: '#c9a9d0', pepper: '#d43f34',
  cabbage: '#7fb05a', beans: '#a5794a', pumpkin: '#e08a34',
  apple: '#8fc04a', grapes: '#8a5ac0', strawberry: '#e0455a', melon: '#8fce6a',
  fish: '#6fb0d0', beef: '#b5665a', venison: '#8f5a48',
  wood: '#8a6a3c', firewood: '#d1642f', stone: '#a6a8af', coal: '#333',
  iron: '#9aa0aa', tools: '#c0c4cc', leather: '#8a5a3a', clothing: '#7bb0d8',
  cattle: '#d8b98a', pigs: '#e0a6b0', chickens: '#e6d28a', medicine: '#c98fd8',
};

const BUILDING_COLORS: Record<BuildingType, string> = {
  house: '#b07a45',
  stonehouse: '#9a9089',
  shelter: '#8f7a5e',
  grandhouse: '#b8a06a',
  university: '#7f6fb0',
  port: '#3f6a8f',
  cathedral: '#a8a0c8',
  luxury: '#c07fa8',
  monument: '#9a9aa2',
  tavern: '#b5893f',
  chapel: '#8f8fb0',
  townhall: '#a8b0c4',
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
        const built = pv === PATH_DIRT || pv === PATH_STONE || pv === PATH_BRIDGE || pv === PATH_BRIDGE_STONE;
        ctx.globalAlpha = built ? 1 : 0.4;
        if (pv === PATH_BRIDGE || pv === PATH_BRIDGE_PLAN || pv === PATH_BRIDGE_STONE || pv === PATH_BRIDGE_STONE_PLAN) {
          // A deck spanning the whole water tile: planks for timber, courses of ashlar for stone.
          const masonry = pv === PATH_BRIDGE_STONE || pv === PATH_BRIDGE_STONE_PLAN;
          ctx.fillStyle = masonry ? '#9a9ca4' : '#7a5230';
          ctx.fillRect(sx, sy, p + 1, p + 1);
          if (p > 6) {
            ctx.strokeStyle = masonry ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.28)';
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

    // Roads queued for teardown — a red wash so a marked stretch reads at a glance while it waits
    // on a builder. The road itself is still drawn above; this only overlays the ones marked.
    if (s.razePaths) {
      for (const idx of s.razePaths) {
        const tx = idx % MAP_W;
        const ty = (idx / MAP_W) | 0;
        if (tx < minX || tx > maxX || ty < minY || ty > maxY || !s.paths[idx]) continue;
        const [sx, sy] = this.camera.worldToScreen(tx, ty, w, h);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ff6f5b';
        ctx.fillRect(sx, sy, p + 1, p + 1);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,90,70,0.95)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx + 1.5, sy + 1.5, p - 2, p - 2);
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

    // Burn scars left by fire-destroyed buildings — bare, dark ground; gone the moment something
    // is built over the tile again (see `GameState.scorched`).
    if (s.scorched) {
      ctx.fillStyle = 'rgba(18,15,13,0.55)';
      for (const idx of s.scorched) {
        const tx = idx % MAP_W;
        const ty = (idx / MAP_W) | 0;
        if (tx < minX || tx > maxX || ty < minY || ty > maxY) continue;
        const [sx, sy] = this.camera.worldToScreen(tx, ty, w, h);
        ctx.fillRect(sx, sy, p + 1, p + 1);
      }
    }

    // Faint work-radius rings for forest-worked buildings.
    for (const b of s.buildings) {
      const def = BUILDING_DEFS[b.type];
      if (!def.workRadius || !b.built) continue;
      const [sx, sy] = this.camera.worldToScreen(b.x + footprintW(b) / 2, b.y + footprintH(b) / 2, w, h);
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
      const bw = footprintW(b) * p;
      const bh = footprintH(b) * p;
      ctx.save();
      if (b.razed) {
        // Rubble: the plot with the salvage still on it, waiting for a cart.
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#6b6152';
        roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        this.glyph('🧱', sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.5);
      } else if (!b.built) {
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
        const cost = costOf(b);
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
      } else if (b.type === 'ranch') {
        this.drawRanch(ctx, b, sx, sy, bw, bh, p);
      } else if (b.type === 'farm') {
        this.drawFarm(ctx, b, sx, sy, bw, bh, p);
      } else {
        ctx.fillStyle = BUILDING_COLORS[b.type];
        roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 5);
        ctx.fill();
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 1;
        ctx.stroke();
        this.glyph(def.emoji, sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.55);
        if (b.fireTimer) {
          // Small at ignition, growing the longer it burns — and shrinking back down as a bucket
          // brigade lands water on it, the same "catching" vs. "being put out" the 3D flame shows.
          const intensity = fireIntensity(b);
          ctx.fillStyle = `rgba(224,84,32,${(0.15 + 0.35 * intensity).toFixed(2)})`;
          roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 5);
          ctx.fill();
          this.glyph('🔥', sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * (0.3 + 0.35 * intensity));
        } else if (b.damaged) {
          ctx.fillStyle = 'rgba(120,90,40,0.4)';
          roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 5);
          ctx.fill();
          this.glyph('⚠️', sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.55);
        }
        // Marked for demolition: say so on the map, or the order is invisible until a builder
        // happens to walk over and start swinging.
        if (b.demolish) {
          ctx.fillStyle = 'rgba(224,106,90,0.35)';
          roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 5);
          ctx.fill();
          this.glyph(b.upgradeTo ? '⬆️' : '💥', sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.5);
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

    // Merchant boat, sailing the river to/from the dock.
    if (s.merchant.boat) {
      const [bx, by] = this.camera.worldToScreen(s.merchant.boat.x, s.merchant.boat.y, w, h);
      const hull = Math.max(6, p * 0.9);
      ctx.save();
      ctx.translate(bx, by);
      // Hull.
      ctx.beginPath();
      ctx.moveTo(-hull * 0.5, -hull * 0.12);
      ctx.lineTo(hull * 0.5, -hull * 0.12);
      ctx.lineTo(hull * 0.32, hull * 0.28);
      ctx.lineTo(-hull * 0.32, hull * 0.28);
      ctx.closePath();
      ctx.fillStyle = '#6b4a2b';
      ctx.fill();
      ctx.strokeStyle = '#3f2b18';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Mast + sail.
      ctx.beginPath();
      ctx.moveTo(0, -hull * 0.12);
      ctx.lineTo(0, -hull * 0.8);
      ctx.strokeStyle = '#3f2b18';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -hull * 0.75);
      ctx.lineTo(hull * 0.34, -hull * 0.34);
      ctx.lineTo(0, -hull * 0.2);
      ctx.closePath();
      ctx.fillStyle = '#eae3d2';
      ctx.fill();
      ctx.strokeStyle = '#c7bda3';
      ctx.stroke();
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
        const [sx, sy] = this.camera.worldToScreen(b.x, b.y, w, h);
        ctx.strokeStyle = '#ffd76b';
        ctx.lineWidth = 2.5;
        roundRect(ctx, sx, sy, footprintW(b) * p, footprintH(b) * p, 5);
        ctx.stroke();
        // Work-area circle for forest-worked buildings. A site still under construction shows the
        // full reach it will have once staffed, matching the circle drawn while placing it.
        const wr = b.built ? workRadiusOf(b) : fullWorkRadiusOf(b.type);
        if (wr) {
          const [ccx, ccy] = this.camera.worldToScreen(b.x + footprintW(b) / 2, b.y + footprintH(b) / 2, w, h);
          ctx.beginPath();
          ctx.arc(ccx, ccy, wr * p, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(122,224,106,0.85)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
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
      // The ghost is drawn at its turned size, matching the tiles the placement check tested.
      const rot = placement.prot ?? 0;
      const bw = placement.pw ?? def.w;
      const bh = placement.ph ?? def.h;
      const pw = rot % 2 === 1 ? bh : bw;
      const ph = rot % 2 === 1 ? bw : bh;
      const [sx, sy] = this.camera.worldToScreen(placement.tx, placement.ty, w, h);
      ctx.save();
      // Bright work-radius ring while positioning a forest-worked building.
      if (def.workRadius) {
        const [cxp, cyp] = this.camera.worldToScreen(
          placement.tx + pw / 2,
          placement.ty + ph / 2,
          w,
          h,
        );
        ctx.beginPath();
        // Fully staffed, not the one-worker circle — see `fullWorkRadiusOf`.
        ctx.arc(cxp, cyp, fullWorkRadiusOf(placement.type)! * p, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 0.5;
      // Green go, red no, amber go-but-unreachable — matching the 3D ghost tint.
      ctx.fillStyle = !placement.valid ? '#e0574a' : placement.warn ? '#e0b84a' : '#5ad06a';
      roundRect(ctx, sx, sy, pw * p, ph * p, 4);
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

  /** A ranch: a fenced pen (grassy fill + rail border) with a corner shed and its herd inside. */
  private drawRanch(ctx: CanvasRenderingContext2D, b: Building, sx: number, sy: number, bw: number, bh: number, p: number): void {
    const animal = b.animal ?? 'cattle';
    const count = Math.floor(b.animals ?? 0);
    // Pen ground.
    ctx.fillStyle = '#6f7a3f';
    roundRect(ctx, sx + 1, sy + 1, bw - 2, bh - 2, 4);
    ctx.fill();
    // Fence rail around the plot.
    ctx.strokeStyle = '#a4813f';
    ctx.lineWidth = Math.max(1.5, p * 0.09);
    roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 4);
    ctx.stroke();
    // Corner shed (top-left 1×1 tile).
    ctx.fillStyle = BUILDING_COLORS.ranch;
    roundRect(ctx, sx + 2, sy + 2, p - 3, p - 3, 3);
    ctx.fill();
    if (p > 10) this.glyph('🏚️', sx + (p - 1) / 2, sy + (p - 1) / 2, p * 0.5);
    // Herd: scatter a few animal glyphs across the pen (never on the shed tile).
    if (p > 8 && count > 0) {
      const emoji = ANIMAL_META[animal].emoji;
      const shown = Math.min(count, 8);
      for (let i = 0; i < shown; i++) {
        const gx = sx + p + ((i * 2 + 1) % Math.max(1, Math.floor(bw / p) - 1) + 0.5) * p * 0.9;
        const gy = sy + p * 0.6 + (Math.floor(i / 3) + 0.5) * p * 0.9;
        if (gx < sx + bw - p * 0.3 && gy < sy + bh - p * 0.3) this.glyph(emoji, gx, gy, p * 0.55);
      }
    }
    // Head-count badge.
    if (p > 12) {
      const label = `${count}/${ranchCapacity(b)}`;
      const fs = Math.max(8, Math.floor(p * 0.32));
      ctx.font = `${fs}px -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const tw = ctx.measureText(label).width;
      const bx = sx + bw - tw - 8;
      const by = sy + bh - fs - 6;
      ctx.fillStyle = 'rgba(30,50,20,0.85)';
      roundRect(ctx, bx, by, tw + 6, fs + 3, 3);
      ctx.fill();
      ctx.fillStyle = '#eef3e8';
      ctx.fillText(label, bx + 3, by + 1);
    }
  }

  /** A field: tilled soil + furrows inside a fence, with a growth bar and the crop marker. */
  private drawFarm(ctx: CanvasRenderingContext2D, b: Building, sx: number, sy: number, bw: number, bh: number, p: number): void {
    // Tilled soil. NOTE: generic for every crop for now — per-crop designs plug in here later via
    // cropDesign(b.crop) / CROP_DESIGN once real crop art exists.
    ctx.fillStyle = '#7a5a34';
    roundRect(ctx, sx + 1, sy + 1, bw - 2, bh - 2, 4);
    ctx.fill();
    // Furrow lines.
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    const rows = Math.max(2, Math.round(bh / p));
    for (let i = 1; i < rows; i++) {
      const yy = sy + (i / rows) * bh;
      ctx.beginPath();
      ctx.moveTo(sx + 3, yy);
      ctx.lineTo(sx + bw - 3, yy);
      ctx.stroke();
    }
    // Fence rail around the plot.
    ctx.strokeStyle = '#a4813f';
    ctx.lineWidth = Math.max(1.5, p * 0.09);
    roundRect(ctx, sx + 2, sy + 2, bw - 4, bh - 4, 4);
    ctx.stroke();
    // Crop marker.
    if (p > 10 && b.crop) this.glyph(CROP_META[b.crop].emoji, sx + bw / 2, sy + bh / 2, Math.min(bw, bh) * 0.42);
    // Growth bar along the bottom.
    if ((b.growth ?? 0) > 0.02) {
      ctx.fillStyle = '#00000055';
      ctx.fillRect(sx + 4, sy + bh - 6, bw - 8, 3);
      ctx.fillStyle = '#8ed66b';
      ctx.fillRect(sx + 4, sy + bh - 6, (bw - 8) * (b.growth ?? 0), 3);
    }
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
