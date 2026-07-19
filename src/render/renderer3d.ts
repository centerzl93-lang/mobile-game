import * as THREE from 'three';
import {
  GameState,
  Tile,
  BUILDING_DEFS,
  BuildingType,
  MAP_W,
  MAP_H,
  ADULT_AGE,
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
import { Camera3D } from '../engine/camera3d';
import type { PlacementView } from './renderer';
import { ModelLibrary, InstancedModel } from './models';

const LAND_H = 0.3; // height of a normal land tile block
const STONE_H = 0.6; // rocky mountainside stands taller
const TOP = LAND_H; // y of the walkable surface props sit on
const TREE_MODEL_SIZE = 1.6; // world scale applied to a normalized (footprint=1) tree model
const ROCK_MODEL_SIZE = 0.9; // world scale applied to a normalized loose-stone model

const TILE_COLOR: Record<string, number> = {
  grass: 0x5b8f43,
  forest: 0x3f6f39,
  stone: 0x8b8e95,
};

const BUILDING_COLORS: Record<BuildingType, number> = {
  house: 0xb07a45, stonehouse: 0x9a9089, tavern: 0xb5893f, chapel: 0x8f8fb0, cemetery: 0x6a6a72,
  gatherer: 0x5a8f4e, farm: 0x9a8340, fishing: 0x3f8f9a, hunting: 0x7a5a3c, ranch: 0xb58f52,
  lumberyard: 0x3f7a3a, woodcutter: 0x8a6a3c, quarry: 0x8b8e95, mine: 0x4a4a52, blacksmith: 0x565059,
  tailor: 0x9a5f92, trading: 0x46708f, school: 0x8f7d3f, herbalist: 0x4f8a5a, hospital: 0xb85a5a,
  well: 0x5f7fa0, market: 0xa07a3f, barn: 0x6f6a4a,
};

function buildingHeight(t: BuildingType): number {
  switch (t) {
    case 'well': return 0.7;
    case 'cemetery': return 0.6;
    case 'farm': return 0.5;
    case 'barn': case 'market': case 'trading': return 1.1;
    case 'chapel': return 2.2;
    default: return 1.4;
  }
}

/**
 * Three.js renderer. Reads GameState each frame and syncs a scene of low-poly placeholder
 * geometry (instanced tile blocks, trees, paths, citizens; per-building boxes). Static layers
 * are rebuilt only when a cheap signature changes; citizens and the camera update every frame.
 */
export class Renderer3D {
  readonly scene = new THREE.Scene();
  ready = false;
  readonly models = new ModelLibrary();

  private renderer: THREE.WebGLRenderer;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private treeInst: InstancedModel | null = null;
  private rockInst: InstancedModel | null = null;

  // Instanced static/dynamic layers.
  private terrain!: THREE.InstancedMesh;
  private landIdx: number[] = [];
  private trees!: THREE.InstancedMesh;
  private treeTiles: number[] = [];
  private rocks!: THREE.InstancedMesh;
  private rockTiles: number[] = [];
  private paths!: THREE.InstancedMesh;
  private marks!: THREE.InstancedMesh;
  private citizens!: THREE.InstancedMesh;
  private water!: THREE.Mesh;

  // Per-building objects (box mesh or cloned model) + reused overlays.
  private buildingMeshes = new Map<number, THREE.Object3D>();
  private ghost!: THREE.Mesh;
  private selRing!: THREE.Mesh;
  private marquee!: THREE.Mesh;

  // Cached signatures so we only rebuild a layer when its data changes.
  private sig = { land: -1, tree: -1, rock: -1, path: '', mark: '', bld: '' };
  private lastState: GameState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color(0x9fc6e0);
    this.scene.fog = new THREE.Fog(0x9fc6e0, 60, 140);

    const hemi = new THREE.HemisphereLight(0xdcecff, 0x486b3f, 1.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2da, 1.15);
    sun.position.set(MAP_W * 0.7, 60, MAP_H * 0.3);
    this.scene.add(sun);

    // Load optional glTF models; when one arrives, invalidate the affected layers so the
    // next frame swaps the placeholder for the real model.
    this.models.onLoad = () => {
      this.sig.bld = '~'; // force building rebuild
      this.sig.tree = -2;
      this.sig.rock = -2;
    };
    void this.models.init();
  }

  get object(): THREE.WebGLRenderer { return this.renderer; }

  setSize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
  }

  /** Build the instanced layers for a freshly (re)loaded map. */
  private init(s: GameState): void {
    // Terrain: one block per land tile (water tiles are drawn by the water plane).
    this.landIdx = [];
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].type !== 'water') this.landIdx.push(i);
    const terrGeo = new THREE.BoxGeometry(1, 1, 1);
    terrGeo.translate(0, 0.5, 0); // base at y=0, grows upward with Y-scale
    this.terrain = new THREE.InstancedMesh(terrGeo, matte(), this.landIdx.length);
    this.scene.add(this.terrain);

    // Trees on forest tiles (a simple two-cone pine).
    this.treeTiles = [];
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].type === 'forest') this.treeTiles.push(i);
    const coneGeo = new THREE.ConeGeometry(0.42, 1.1, 6);
    coneGeo.translate(0, 0.55, 0);
    this.trees = new THREE.InstancedMesh(coneGeo, matte(0x2f5a2a), Math.max(1, this.treeTiles.length));
    this.trees.count = this.treeTiles.length;
    this.scene.add(this.trees);

    // Loose-stone deposits.
    this.rockTiles = [];
    for (let i = 0; i < s.tiles.length; i++) if ((s.tiles[i].stone ?? 0) > 0) this.rockTiles.push(i);
    const rockGeo = new THREE.DodecahedronGeometry(0.22);
    this.rocks = new THREE.InstancedMesh(rockGeo, matte(0x9a9ca1), Math.max(1, this.rockTiles.length));
    this.rocks.count = this.rockTiles.length;
    this.scene.add(this.rocks);

    // Paths / bridges and harvest marks: flat quads covering a whole map's worth of tiles.
    const flat = new THREE.BoxGeometry(0.96, 0.06, 0.96);
    this.paths = new THREE.InstancedMesh(flat, matte(0xffffff), MAP_W * MAP_H);
    this.paths.count = 0;
    this.scene.add(this.paths);
    const flat2 = new THREE.BoxGeometry(1, 0.04, 1);
    const markMat = matte(0xffffff);
    markMat.transparent = true;
    markMat.opacity = 0.5;
    this.marks = new THREE.InstancedMesh(flat2, markMat, MAP_W * MAP_H);
    this.marks.count = 0;
    this.scene.add(this.marks);

    // Citizens: capsule instances, refreshed every frame.
    const capGeo = new THREE.CapsuleGeometry(0.16, 0.34, 3, 6);
    capGeo.translate(0, 0.33, 0);
    this.citizens = new THREE.InstancedMesh(capGeo, matte(0xffffff), 600);
    this.citizens.count = 0;
    this.scene.add(this.citizens);

    // Water plane just beneath the land surface.
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f6f9a, transparent: true, opacity: 0.82, roughness: 0.4 });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(MAP_W / 2, 0.14, MAP_H / 2);
    this.scene.add(this.water);

    // Reusable overlays.
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x5ad06a, transparent: true, opacity: 0.5 }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.selRing = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd76b }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.marquee = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x9ae69a, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    this.marquee.rotation.x = -Math.PI / 2;
    this.marquee.visible = false;
    this.scene.add(this.marquee);

    this.sig = { land: -1, tree: -1, rock: -1, path: '', mark: '', bld: '' };
    this.ready = true;
  }

  render(s: GameState, cam: Camera3D, placement: PlacementView): void {
    if (!this.ready || s !== this.lastState) {
      // (Re)initialise on first frame or when a new map/state is loaded.
      this.teardown();
      this.init(s);
      this.lastState = s;
    }
    cam.apply();
    this.syncTerrain(s);
    this.syncTrees(s);
    this.syncRocks(s);
    this.syncPaths(s);
    this.syncMarks(s);
    this.syncBuildings(s);
    this.syncCitizens(s);
    this.syncOverlays(s, placement);
    this.renderer.render(this.scene, cam.cam);
  }

  // ---- terrain ----
  private syncTerrain(s: GameState): void {
    let sig = 0;
    for (const i of this.landIdx) sig = (sig + (s.tiles[i].type === 'forest' ? 2 : s.tiles[i].type === 'stone' ? 3 : 1) * (i + 1)) % 2147483647;
    if (sig === this.sig.land) return;
    this.sig.land = sig;
    let k = 0;
    for (const i of this.landIdx) {
      const t = s.tiles[i];
      const h = t.type === 'stone' ? STONE_H : LAND_H;
      this.dummy.position.set((i % MAP_W) + 0.5, 0, ((i / MAP_W) | 0) + 0.5);
      this.dummy.scale.set(1, h, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.terrain.setMatrixAt(k, this.dummy.matrix);
      this.terrain.setColorAt(k, this.color.set(TILE_COLOR[t.type] ?? TILE_COLOR.grass));
      k++;
    }
    this.terrain.instanceMatrix.needsUpdate = true;
    if (this.terrain.instanceColor) this.terrain.instanceColor.needsUpdate = true;
  }

  // ---- trees ----
  private syncTrees(s: GameState): void {
    // Upgrade to a model the first frame one is available (hide the cone fallback).
    const tpl = this.models.firstTree();
    if (tpl && !this.treeInst) {
      this.treeInst = new InstancedModel(tpl, this.treeTiles.length || 1);
      this.treeInst.addTo(this.scene);
      this.trees.count = 0;
      this.sig.tree = -3;
    }
    let sig = 0;
    for (const i of this.treeTiles) sig = (sig + (s.tiles[i].type === 'forest' ? Math.round(s.tiles[i].trees * 8) + 1 : 0) * (i + 1)) % 2147483647;
    if (sig === this.sig.tree) return;
    this.sig.tree = sig;
    let k = 0;
    for (const i of this.treeTiles) {
      const t = s.tiles[i];
      const live = t.type === 'forest' && t.trees > 0.05;
      if (this.treeInst) {
        const sc = live ? (0.7 + t.trees * 0.8) * TREE_MODEL_SIZE : 0.0001;
        this.dummy.position.set((i % MAP_W) + 0.5, live ? TOP : -5, ((i / MAP_W) | 0) + 0.5);
        this.dummy.scale.set(sc, sc, sc);
        this.dummy.rotation.set(0, (i % 8) * 0.78, 0);
        this.dummy.updateMatrix();
        this.treeInst.setAt(k, this.dummy.matrix);
      } else {
        const sc = live ? 0.5 + t.trees * 0.9 : 0;
        this.dummy.position.set((i % MAP_W) + 0.5, live ? TOP : -5, ((i / MAP_W) | 0) + 0.5);
        this.dummy.scale.set(sc, sc, sc);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.trees.setMatrixAt(k, this.dummy.matrix);
      }
      k++;
    }
    if (this.treeInst) {
      this.treeInst.setCount(this.treeTiles.length);
      this.treeInst.update();
    } else {
      this.trees.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- loose stone ----
  private syncRocks(s: GameState): void {
    const tpl = this.models.firstRock();
    if (tpl && !this.rockInst) {
      this.rockInst = new InstancedModel(tpl, this.rockTiles.length || 1);
      this.rockInst.addTo(this.scene);
      this.rocks.count = 0;
      this.sig.rock = -3;
    }
    let sig = 0;
    for (const i of this.rockTiles) sig = (sig + ((s.tiles[i].stone ?? 0) > 0 ? 1 : 0) * (i + 1)) % 2147483647;
    if (sig === this.sig.rock) return;
    this.sig.rock = sig;
    let k = 0;
    for (const i of this.rockTiles) {
      const has = (s.tiles[i].stone ?? 0) > 0;
      if (this.rockInst) {
        const sc = has ? ROCK_MODEL_SIZE : 0.0001;
        this.dummy.position.set((i % MAP_W) + 0.5, has ? TOP : -5, ((i / MAP_W) | 0) + 0.5);
        this.dummy.scale.set(sc, sc, sc);
        this.dummy.rotation.set(0, (i % 6) * 1.05, 0);
        this.dummy.updateMatrix();
        this.rockInst.setAt(k, this.dummy.matrix);
      } else {
        this.dummy.position.set((i % MAP_W) + 0.5, has ? TOP + 0.1 : -5, ((i / MAP_W) | 0) + 0.5);
        this.dummy.scale.set(has ? 1 : 0.0001, has ? 1 : 0.0001, has ? 1 : 0.0001);
        this.dummy.rotation.set(0, i * 1.1, 0);
        this.dummy.updateMatrix();
        this.rocks.setMatrixAt(k, this.dummy.matrix);
      }
      k++;
    }
    if (this.rockInst) {
      this.rockInst.setCount(this.rockTiles.length);
      this.rockInst.update();
    } else {
      this.rocks.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- paths & bridges ----
  private syncPaths(s: GameState): void {
    let sig = '';
    for (let i = 0; i < s.paths.length; i++) if (s.paths[i]) sig += i + ':' + s.paths[i] + ';';
    if (sig === this.sig.path) return;
    this.sig.path = sig;
    let k = 0;
    for (let i = 0; i < s.paths.length; i++) {
      const v = s.paths[i];
      if (!v) continue;
      const bridge = v === PATH_BRIDGE || v === PATH_BRIDGE_PLAN;
      const built = v === PATH_DIRT || v === PATH_STONE || v === PATH_BRIDGE;
      const col = bridge ? 0x7a5230 : v === PATH_STONE || v === PATH_STONE_PLAN ? 0xa6a8af : 0x6b5236;
      this.dummy.position.set((i % MAP_W) + 0.5, (bridge ? 0.14 : TOP) + 0.03, ((i / MAP_W) | 0) + 0.5);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.paths.setMatrixAt(k, this.dummy.matrix);
      this.paths.setColorAt(k, this.color.set(col).multiplyScalar(built ? 1 : 0.6));
      k++;
    }
    this.paths.count = k;
    this.paths.instanceMatrix.needsUpdate = true;
    if (this.paths.instanceColor) this.paths.instanceColor.needsUpdate = true;
  }

  // ---- harvest marks ----
  private syncMarks(s: GameState): void {
    let sig = '';
    for (let i = 0; i < s.harvest.length; i++) if (s.harvest[i]) sig += i + ':' + s.harvest[i] + ';';
    if (sig === this.sig.mark) return;
    this.sig.mark = sig;
    let k = 0;
    for (let i = 0; i < s.harvest.length; i++) {
      const hv = s.harvest[i];
      if (!hv) continue;
      this.dummy.position.set((i % MAP_W) + 0.5, TOP + 0.06, ((i / MAP_W) | 0) + 0.5);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.marks.setMatrixAt(k, this.dummy.matrix);
      this.marks.setColorAt(k, this.color.set(hv === HARVEST_WOOD ? 0x7ce07c : 0xd2d2dc));
      k++;
    }
    this.marks.count = k;
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
  }

  // ---- buildings ----
  private syncBuildings(s: GameState): void {
    let sig = '';
    for (const b of s.buildings) sig += b.id + ':' + (b.built ? 1 : 0) + ':' + (b.fireTimer ? 1 : 0) + ';';
    if (sig === this.sig.bld) return;
    this.sig.bld = sig;

    const alive = new Set(s.buildings.map((b) => b.id));
    for (const [id, obj] of this.buildingMeshes) {
      if (!alive.has(id)) {
        this.disposeBuilding(obj);
        this.buildingMeshes.delete(id);
      }
    }
    for (const b of s.buildings) {
      const def = BUILDING_DEFS[b.type];
      const wantModel = !!this.models.buildingClone(b.type); // model available for this type?
      let obj = this.buildingMeshes.get(b.id);
      // Recreate if missing or if the desired kind (model vs box) changed since last build.
      if (!obj || !!obj.userData.model !== wantModel) {
        if (obj) {
          this.disposeBuilding(obj);
          this.buildingMeshes.delete(b.id);
        }
        obj = wantModel ? this.makeBuildingModel(b.type) : this.makeBuildingBox(b.type);
        obj.position.set(b.x + def.w / 2, TOP, b.y + def.h / 2);
        this.buildingMeshes.set(b.id, obj);
        this.scene.add(obj);
      }
      this.styleBuilding(obj, b.type, b.built, !!b.fireTimer);
    }
  }

  private makeBuildingBox(type: BuildingType): THREE.Object3D {
    const def = BUILDING_DEFS[type];
    const h = buildingHeight(type);
    const geo = new THREE.BoxGeometry(def.w * 0.9, h, def.h * 0.9);
    geo.translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }));
    mesh.userData.model = false;
    return mesh;
  }

  private makeBuildingModel(type: BuildingType): THREE.Object3D {
    const def = BUILDING_DEFS[type];
    const clone = this.models.buildingClone(type)!; // footprint normalized to 1×1
    const k = Math.min(def.w, def.h) * 0.95; // scale up to the tile footprint, keep aspect
    clone.scale.multiplyScalar(k);
    clone.userData.model = true;
    return clone;
  }

  /** Apply built / construction / fire appearance to whichever object represents a building. */
  private styleBuilding(obj: THREE.Object3D, type: BuildingType, built: boolean, fire: boolean): void {
    const isModel = !!obj.userData.model;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat || Array.isArray(mat)) return;
      // Box meshes get the flat building color; model meshes keep their own textures/colors.
      if (!isModel && mat.color) mat.color.set(BUILDING_COLORS[type]);
      if (fire) {
        mat.emissive?.set(0x812c10);
        mat.transparent = false;
        mat.opacity = 1;
      } else {
        mat.emissive?.set(0x000000);
        mat.transparent = !built;
        mat.opacity = built ? 1 : 0.5;
      }
      mat.needsUpdate = true;
    });
  }

  private disposeBuilding(obj: THREE.Object3D): void {
    this.scene.remove(obj);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  // ---- citizens ----
  private syncCitizens(s: GameState): void {
    const cap = (this.citizens.instanceMatrix.array.length / 16) | 0;
    const n = Math.min(s.citizens.length, cap);
    for (let i = 0; i < n; i++) {
      const c = s.citizens[i];
      const child = c.age < ADULT_AGE;
      const sc = child ? 0.62 : 1;
      this.dummy.position.set(c.x, TOP, c.y);
      this.dummy.scale.set(sc, sc, sc);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.citizens.setMatrixAt(i, this.dummy.matrix);
      const base = c.sick ? 0xd24a4a : c.sex === 'm' ? 0x9ec7f0 : 0xf0b9d2;
      this.citizens.setColorAt(i, this.color.set(base));
    }
    this.citizens.count = n;
    this.citizens.instanceMatrix.needsUpdate = true;
    if (this.citizens.instanceColor) this.citizens.instanceColor.needsUpdate = true;
  }

  // ---- overlays (placement ghost, selection ring, marquee) ----
  private syncOverlays(s: GameState, pv: PlacementView): void {
    if (pv.type) {
      const def = BUILDING_DEFS[pv.type];
      const h = buildingHeight(pv.type);
      this.ghost.visible = true;
      this.ghost.scale.set(def.w * 0.9, h, def.h * 0.9);
      this.ghost.position.set(pv.tx + def.w / 2, TOP + h / 2, pv.ty + def.h / 2);
      (this.ghost.material as THREE.MeshStandardMaterial).color.set(pv.valid ? 0x5ad06a : 0xe0574a);
    } else {
      this.ghost.visible = false;
    }

    let selPos: { x: number; y: number; r: number } | null = null;
    if (pv.selBuildingId != null) {
      const b = s.buildings.find((x) => x.id === pv.selBuildingId);
      if (b) { const d = BUILDING_DEFS[b.type]; selPos = { x: b.x + d.w / 2, y: b.y + d.h / 2, r: Math.max(d.w, d.h) * 0.6 }; }
    } else if (pv.selCitizenId != null) {
      const c = s.citizens.find((x) => x.id === pv.selCitizenId);
      if (c) selPos = { x: c.x, y: c.y, r: 0.5 };
    }
    if (selPos) {
      this.selRing.visible = true;
      this.selRing.position.set(selPos.x, TOP + 0.1, selPos.y);
      this.selRing.scale.setScalar(selPos.r);
    } else {
      this.selRing.visible = false;
    }

    if (pv.marquee) {
      const m = pv.marquee;
      const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1);
      const y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
      this.marquee.visible = true;
      this.marquee.scale.set(Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0), 1);
      this.marquee.position.set((x0 + x1) / 2, TOP + 0.09, (y0 + y1) / 2);
    } else {
      this.marquee.visible = false;
    }
  }

  /** Drop the instanced layers and building meshes (called before rebuilding on a new map). */
  private teardown(): void {
    if (!this.ready) return;
    for (const m of [this.terrain, this.trees, this.rocks, this.paths, this.marks, this.citizens]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.treeInst?.dispose(this.scene);
    this.treeInst = null;
    this.rockInst?.dispose(this.scene);
    this.rockInst = null;
    this.scene.remove(this.water);
    for (const [, obj] of this.buildingMeshes) this.disposeBuilding(obj);
    this.buildingMeshes.clear();
    for (const o of [this.ghost, this.selRing, this.marquee]) this.scene.remove(o);
    this.sig = { land: -1, tree: -1, rock: -1, path: '', mark: '', bld: '' };
    this.ready = false;
  }
}

function matte(color = 0xffffff): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
}
