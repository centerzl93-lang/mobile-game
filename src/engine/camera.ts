import { TILE, MAP_W, MAP_H } from '../types';

/**
 * Camera maps world tile-coordinates to screen pixels.
 * `x`,`y` are the tile coordinates at the centre of the viewport.
 */
export class Camera {
  x = MAP_W / 2;
  y = MAP_H / 2;
  zoom = 1;
  minZoom = 0.4;
  maxZoom = 2.4;

  get pxPerTile(): number {
    return TILE * this.zoom;
  }

  worldToScreen(wx: number, wy: number, canvasW: number, canvasH: number): [number, number] {
    const p = this.pxPerTile;
    return [(wx - this.x) * p + canvasW / 2, (wy - this.y) * p + canvasH / 2];
  }

  screenToWorld(sx: number, sy: number, canvasW: number, canvasH: number): [number, number] {
    const p = this.pxPerTile;
    return [(sx - canvasW / 2) / p + this.x, (sy - canvasH / 2) / p + this.y];
  }

  panByPixels(dx: number, dy: number): void {
    const p = this.pxPerTile;
    this.x -= dx / p;
    this.y -= dy / p;
    this.clamp();
  }

  /** Zoom keeping the given screen point anchored under the finger/cursor. */
  zoomAt(factor: number, sx: number, sy: number, canvasW: number, canvasH: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy, canvasW, canvasH);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    // Re-centre so (wx,wy) stays under (sx,sy).
    const p = this.pxPerTile;
    this.x = wx - (sx - canvasW / 2) / p;
    this.y = wy - (sy - canvasH / 2) / p;
    this.clamp();
  }

  private clamp(): void {
    this.x = clamp(this.x, 0, MAP_W);
    this.y = clamp(this.y, 0, MAP_H);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
