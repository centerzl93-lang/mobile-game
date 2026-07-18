import { Camera } from './camera';

interface PointerRec {
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * Unified pointer input (touch + mouse) for a tile map:
 *  - one pointer drag  -> pan
 *  - two pointer pinch -> zoom
 *  - quick tap (little movement) -> onTap(screenX, screenY)
 */
export class InputManager {
  private pointers = new Map<number, PointerRec>();
  private lastPinchDist = 0;
  onTap: (sx: number, sy: number) => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
  ) {
    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove, { passive: false });
    canvas.addEventListener('pointerup', this.onUp, { passive: false });
    canvas.addEventListener('pointercancel', this.onUp, { passive: false });
    canvas.addEventListener('pointerleave', this.onUp, { passive: false });
    // Block context menu / scroll gestures on the canvas.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });
    if (this.pointers.size === 2) {
      this.lastPinchDist = this.pinchDist();
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 8) {
      p.moved = true;
    }

    if (this.pointers.size === 1) {
      this.camera.panByPixels(dx, dy);
    } else if (this.pointers.size === 2) {
      const dist = this.pinchDist();
      if (this.lastPinchDist > 0) {
        const factor = dist / this.lastPinchDist;
        const [cx, cy] = this.pinchCenter();
        this.camera.zoomAt(factor, cx, cy, this.canvas.clientWidth, this.canvas.clientHeight);
      }
      this.lastPinchDist = dist;
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const wasTap = !p.moved && this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinchDist = 0;
    if (wasTap) {
      this.onTap(p.startX, p.startY);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.camera.zoomAt(factor, e.clientX, e.clientY, this.canvas.clientWidth, this.canvas.clientHeight);
  };

  private pinchDist(): number {
    const pts = [...this.pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private pinchCenter(): [number, number] {
    const pts = [...this.pointers.values()];
    return [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
  }
}
