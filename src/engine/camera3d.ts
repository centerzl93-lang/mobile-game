import * as THREE from 'three';
import { MAP_W, MAP_H } from '../types';

/**
 * RTS/orbit camera for the 3D scene. A ground `target` on the XZ plane is viewed from a
 * fixed pitch at an adjustable `distance` (zoom) and `yaw`. World units == tiles, so tile
 * (tx,ty) sits at world (tx, 0, ty); a citizen at sim (c.x,c.y) is world (c.x, y, c.y).
 *
 * It deliberately mirrors the method names the existing InputManager calls on the old 2D
 * Camera (`panByPixels`, `zoomAt`) so input handling needs no changes, plus `screenToTile`
 * which replaces the old `screenToWorld`.
 */
export class Camera3D {
  readonly cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2);
  distance = 34;
  yaw = Math.PI * 0.25; // look toward the map at a pleasant diagonal
  pitch = 0.95; // radians above the horizon (~54°); fixed in the slice

  minDist = 7;
  maxDist = 85;

  private w = 1;
  private h = 1;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();

  constructor() {
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
    this.apply();
  }

  setAspect(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.cam.aspect = this.w / this.h;
    this.cam.updateProjectionMatrix();
    this.apply();
  }

  /** Recompute the camera transform from target/distance/yaw/pitch. */
  apply(): void {
    const r = this.distance * Math.cos(this.pitch);
    const hgt = this.distance * Math.sin(this.pitch);
    this.cam.position.set(
      this.target.x + r * Math.sin(this.yaw),
      hgt,
      this.target.z + r * Math.cos(this.yaw),
    );
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this.target);
  }

  /** Drag-pan the ground target by a screen-pixel delta (finger tracks the world). */
  panByPixels(dx: number, dy: number): void {
    const wpp = this.worldPerPixel();
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const kFwd = 1 / Math.max(0.3, Math.sin(this.pitch)); // foreshortening on the tilt axis
    this.target.x -= rx * dx * wpp + fx * dy * wpp * kFwd;
    this.target.z -= rz * dx * wpp + fz * dy * wpp * kFwd;
    this.clampTarget();
    this.apply();
  }

  /** Rotate the view around its ground target by `delta` radians (from a two-finger twist). */
  rotateBy(delta: number): void {
    this.yaw += delta;
    this.apply();
  }

  /** Dolly zoom keeping the ground point under (sx,sy) roughly anchored. factor>1 zooms in. */
  zoomAt(factor: number, sx: number, sy: number, _w: number, _h: number): void {
    const before = this.screenToGround(sx, sy);
    this.distance = clamp(this.distance / factor, this.minDist, this.maxDist);
    this.apply();
    const after = this.screenToGround(sx, sy);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
      this.clampTarget();
      this.apply();
    }
  }

  /** Ray-cast a screen point onto the ground plane; returns tile coords [x,y] (y = world z). */
  screenToTile(sx: number, sy: number, w: number, h: number): [number, number] {
    const p = this.screenToGround(sx, sy, w, h);
    if (!p) {
      // Looking at the horizon/sky — fall back to the current target tile.
      return [this.target.x, this.target.z];
    }
    return [p.x, p.z];
  }

  /** Tile under the screen centre — used for the build-placement reticle. */
  centerTile(): [number, number] {
    return this.screenToTile(this.w / 2, this.h / 2, this.w, this.h);
  }

  /** Snap the view onto a tile position (used when starting/centering a game). */
  focus(tx: number, ty: number): void {
    this.target.set(tx, 0, ty);
    this.clampTarget();
    this.apply();
  }

  private screenToGround(sx: number, sy: number, w = this.w, h = this.h): THREE.Vector3 | null {
    const ndcX = (sx / w) * 2 - 1;
    const ndcY = -((sy / h) * 2 - 1);
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cam);
    const p = this.ray.ray.intersectPlane(this.ground, this.hit);
    return p ? p.clone() : null;
  }

  private worldPerPixel(): number {
    const vFov = (this.cam.fov * Math.PI) / 180;
    return (2 * this.distance * Math.tan(vFov / 2)) / this.h;
  }

  private clampTarget(): void {
    this.target.x = clamp(this.target.x, 0, MAP_W);
    this.target.z = clamp(this.target.z, 0, MAP_H);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
