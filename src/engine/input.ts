import { Camera } from './camera';

interface PointerRec {
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export type InputMode = 'normal' | 'path' | 'marquee';

/**
 * Unified pointer input (touch + mouse) for a tile map.
 *  normal mode:  one-finger drag pans; quick tap fires onTap; two fingers pinch/pan.
 *  path mode:    one-finger drag paints (onPaint); two fingers pinch/pan.
 *  marquee mode: one-finger drag rubber-bands a rectangle (onMarqueeMove) committed on
 *                release (onMarqueeEnd); a second finger cancels it and pans/zooms.
 */
export class InputManager {
  private pointers = new Map<number, PointerRec>();
  private lastPinchDist = 0;
  private lastCenter: [number, number] | null = null;
  private marqueeStart: [number, number] | null = null;
  mode: InputMode = 'normal';
  onTap: (sx: number, sy: number) => void = () => {};
  onPaint: (sx: number, sy: number) => void = () => {};
  onMarqueeMove: (sx0: number, sy0: number, sx1: number, sy1: number) => void = () => {};
  onMarqueeEnd: (sx0: number, sy0: number, sx1: number, sy1: number) => void = () => {};
  onMarqueeCancel: () => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
  ) {
    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove, { passive: false });
    canvas.addEventListener('pointerup', this.onUp, { passive: false });
    canvas.addEventListener('pointercancel', this.onUp, { passive: false });
    canvas.addEventListener('pointerleave', this.onUp, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setMode(mode: InputMode): void {
    this.mode = mode;
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
      this.lastCenter = this.pinchCenter();
      if (this.marqueeStart) {
        this.marqueeStart = null;
        this.onMarqueeCancel(); // a second finger cancels the marquee and pans/zooms
      }
    } else if (this.pointers.size === 1 && this.mode === 'path') {
      this.onPaint(e.clientX, e.clientY);
    } else if (this.pointers.size === 1 && this.mode === 'marquee') {
      this.marqueeStart = [e.clientX, e.clientY];
      this.onMarqueeMove(e.clientX, e.clientY, e.clientX, e.clientY);
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
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 8) p.moved = true;

    if (this.pointers.size === 1) {
      if (this.mode === 'path') {
        this.onPaint(e.clientX, e.clientY);
      } else if (this.mode === 'marquee' && this.marqueeStart) {
        this.onMarqueeMove(this.marqueeStart[0], this.marqueeStart[1], e.clientX, e.clientY);
      } else {
        this.camera.panByPixels(dx, dy);
      }
    } else if (this.pointers.size === 2) {
      // Two fingers: pinch-zoom plus pan by the movement of their midpoint.
      const dist = this.pinchDist();
      const center = this.pinchCenter();
      if (this.lastCenter) {
        this.camera.panByPixels(center[0] - this.lastCenter[0], center[1] - this.lastCenter[1]);
      }
      if (this.lastPinchDist > 0) {
        const factor = dist / this.lastPinchDist;
        this.camera.zoomAt(factor, center[0], center[1], this.canvas.clientWidth, this.canvas.clientHeight);
      }
      this.lastPinchDist = dist;
      this.lastCenter = center;
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const wasTap = !p.moved && this.pointers.size === 1 && this.mode === 'normal';
    const finishMarquee = this.mode === 'marquee' && this.marqueeStart !== null && this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.lastPinchDist = 0;
      this.lastCenter = null;
    }
    if (finishMarquee) {
      const [s0, s1] = this.marqueeStart!;
      this.marqueeStart = null;
      this.onMarqueeEnd(s0, s1, p.x, p.y);
    }
    if (wasTap) this.onTap(p.startX, p.startY);
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
