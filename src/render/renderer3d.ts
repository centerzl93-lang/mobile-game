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
const FOOTHILL_H = 0.5; // low rocky band at a mountain's base
const MOUNTAIN_BASE_H = 0.9; // shortest mountain (edge) block height
const MOUNTAIN_STEP_H = 0.6; // extra height per tile of depth into the mountain
const MOUNTAIN_MAX_H = 3.2; // tallest peak
const SNOWLINE_H = 1.8; // peaks above this get a permanent snow cap
const TOP = LAND_H; // y of the walkable surface props sit on
const TREE_MODEL_SIZE = 1.6; // world scale applied to a normalized (footprint=1) tree model
const ROCK_MODEL_SIZE = 0.9; // world scale applied to a normalized loose-stone model

const TILE_COLOR: Record<string, number> = {
  grass: 0x5b8f43,
  forest: 0x3f6f39,
  stone: 0x8b8e95,
  foothill: 0x8a7f68,
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

/** Buildings with a hearth/forge that puff chimney smoke while built. */
const SMOKE_BUILDINGS = new Set<BuildingType>([
  'house', 'stonehouse', 'tavern', 'blacksmith', 'tailor', 'woodcutter', 'hospital', 'herbalist',
]);

const SNOW_COLOR = new THREE.Color(0xeef3f7);

interface SeasonPalette {
  sky: number; fog: number; hemiSky: number; hemiGround: number; sun: number; sunI: number; snow: number;
}
// Indexed by GameState.season (Spring, Summer, Autumn, Winter).
const SEASON_PALETTE: SeasonPalette[] = [
  { sky: 0x9fd2e8, fog: 0x9fd2e8, hemiSky: 0xdcecff, hemiGround: 0x5a7d45, sun: 0xfff2da, sunI: 1.2, snow: 0 },
  { sky: 0x9fc6e0, fog: 0x9fc6e0, hemiSky: 0xe6f2ff, hemiGround: 0x4a6b34, sun: 0xfff3d0, sunI: 1.35, snow: 0 },
  { sky: 0xcabf9c, fog: 0xcabf9c, hemiSky: 0xf0e6cf, hemiGround: 0x6b5a2f, sun: 0xffd7a0, sunI: 1.1, snow: 0 },
  { sky: 0xd8e6ef, fog: 0xd3e0ea, hemiSky: 0xeaf2fb, hemiGround: 0x93a4af, sun: 0xe6eef8, sunI: 0.95, snow: 1 },
];

/**
 * Three.js renderer. Reads GameState each frame and syncs a scene of low-poly placeholder
 * geometry (instanced tile blocks, trees, paths, citizens; per-building boxes). Static layers
 * are rebuilt only when a cheap signature changes; citizens and the camera update every frame.
 */
export class Renderer3D {
  readonly scene = new THREE.Scene();
  ready = false;
  readonly models = new ModelLibrary();
  readonly tier: 'high' | 'low';

  private renderer: THREE.WebGLRenderer;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private treeInst: InstancedModel | null = null;
  private rockInst: InstancedModel | null = null;

  // Lighting + season atmosphere.
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private skyColor = new THREE.Color(0x9fc6e0);
  private fogColor = new THREE.Color(0x9fc6e0);
  private hemiSky = new THREE.Color(0xe6f2ff);
  private hemiGround = new THREE.Color(0x4a6b34);
  private sunColor = new THREE.Color(0xfff3d0);
  private sunIntensity = 1.35;
  snowNow = 0; // smoothed 0..1 snow amount (exposed for tests)
  private snowTarget = 0;
  private seasonInit = false;

  // Per-frame animation clock + effects.
  private lastTime = -1;
  private waterTime = 0;
  private smoke: THREE.Points | null = null;
  private smokeVel: Float32Array | null = null;
  private smokeLife: Float32Array | null = null;
  private emitters: number[][] = []; // [x,y,z] chimney positions
  private heads: THREE.InstancedMesh | null = null; // villager heads (high tier only)

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
  private mountainH: Float32Array | null = null; // per-tile mountain block height (0 = not a mountain)

  // Per-building objects (box mesh or cloned model) + reused overlays.
  private buildingMeshes = new Map<number, THREE.Object3D>();
  private ghost!: THREE.Mesh;
  private selRing!: THREE.Mesh;
  private marquee!: THREE.Mesh;

  // Cached signatures so we only rebuild a layer when its data changes.
  private sig = { land: -1, tree: -1, rock: -1, path: '', mark: '', bld: '' };
  private lastState: GameState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.tier = detectTier();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.tier === 'low' ? 1.5 : 2));
    if (this.tier === 'high') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.scene.background = this.skyColor;
    this.scene.fog = new THREE.Fog(this.fogColor, 60, 150);

    this.hemi = new THREE.HemisphereLight(0xe6f2ff, 0x4a6b34, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3d0, 1.35);
    this.sun.position.set(28, 46, 12);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    if (this.tier === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera;
      c.left = -30; c.right = 30; c.top = 30; c.bottom = -30;
      c.near = 1; c.far = 140;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }

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

  /** Tallest mountain block height in the current map (0 if none) — exposed for tests. */
  get maxPeak(): number {
    if (!this.mountainH) return 0;
    let m = 0;
    for (const v of this.mountainH) if (v > m) m = v;
    return m;
  }

  setSize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
  }

  /** Build the instanced layers for a freshly (re)loaded map. */
  private init(s: GameState): void {
    // Terrain: one block per land tile (water tiles are drawn by the water plane).
    this.landIdx = [];
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].type !== 'water') this.landIdx.push(i);
    this.mountainH = computeMountainHeights(s);
    const terrGeo = new THREE.BoxGeometry(1, 1, 1);
    terrGeo.translate(0, 0.5, 0); // base at y=0, grows upward with Y-scale
    this.terrain = new THREE.InstancedMesh(terrGeo, matte(), this.landIdx.length);
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = true;
    this.scene.add(this.terrain);

    // Trees on forest tiles (a simple two-cone pine).
    this.treeTiles = [];
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].type === 'forest') this.treeTiles.push(i);
    const coneGeo = new THREE.ConeGeometry(0.42, 1.1, 6);
    coneGeo.translate(0, 0.55, 0);
    this.trees = new THREE.InstancedMesh(coneGeo, matte(0x2f5a2a), Math.max(1, this.treeTiles.length));
    this.trees.count = this.treeTiles.length;
    this.trees.castShadow = true;
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

    // Citizens: capsule bodies (all tiers) + small heads (high tier), refreshed every frame.
    const capGeo = new THREE.CapsuleGeometry(0.16, 0.34, 3, 6);
    capGeo.translate(0, 0.33, 0);
    this.citizens = new THREE.InstancedMesh(capGeo, matte(0xffffff), 600);
    this.citizens.count = 0;
    this.citizens.castShadow = this.tier === 'high';
    this.scene.add(this.citizens);
    if (this.tier === 'high') {
      const headGeo = new THREE.SphereGeometry(0.13, 8, 6);
      this.heads = new THREE.InstancedMesh(headGeo, matte(0xffffff), 600);
      this.heads.count = 0;
      this.heads.castShadow = true;
      this.scene.add(this.heads);
    } else {
      this.heads = null;
    }

    // Water plane just beneath the land surface — subdivided so it can ripple.
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f6f9a, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0.1,
    });
    const waterGeo = new THREE.PlaneGeometry(MAP_W, MAP_H, MAP_W, MAP_H);
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(MAP_W / 2, 0.14, MAP_H / 2);
    this.water.receiveShadow = true;
    (this.water.geometry as THREE.PlaneGeometry).userData.base =
      (waterGeo.attributes.position.array as Float32Array).slice();
    this.scene.add(this.water);

    // Chimney smoke: one pooled Points cloud (high tier only).
    this.smoke = null;
    this.smokeVel = null;
    this.smokeLife = null;
    if (this.tier === 'high') this.initSmoke();

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
    const now = performance.now() / 1000;
    const dt = this.lastTime < 0 ? 0 : Math.min(0.05, now - this.lastTime);
    this.lastTime = now;

    cam.apply();
    this.applySeason(s, dt);
    this.trackSun(cam);
    this.syncTerrain(s);
    this.syncTrees(s);
    this.syncRocks(s);
    this.syncPaths(s);
    this.syncMarks(s);
    this.syncBuildings(s);
    this.syncCitizens(s, now);
    this.syncOverlays(s, placement);
    this.animate(dt, now);
    this.renderer.render(this.scene, cam.cam);
  }

  /** Keep the shadow-casting sun near the camera target so shadows stay crisp in view. */
  private trackSun(cam: Camera3D): void {
    const t = cam.target;
    this.sun.position.set(t.x + 26, 48, t.z + 14);
    this.sun.target.position.set(t.x, 0, t.z);
    this.sun.target.updateMatrixWorld();
  }

  /** Ease the sky/fog/light palette and snow amount toward the current season. */
  private applySeason(s: GameState, dt: number): void {
    const p = SEASON_PALETTE[s.season] ?? SEASON_PALETTE[0];
    const k = this.seasonInit ? Math.min(1, dt * 1.8) : 1; // snap on first frame, ease after
    this.seasonInit = true;
    this.skyColor.lerp(this.color.set(p.sky), k);
    this.fogColor.lerp(this.color.set(p.fog), k);
    this.hemiSky.lerp(this.color.set(p.hemiSky), k);
    this.hemiGround.lerp(this.color.set(p.hemiGround), k);
    this.sunColor.lerp(this.color.set(p.sun), k);
    this.sunIntensity += (p.sunI - this.sunIntensity) * k;
    this.snowTarget = p.snow;
    this.snowNow += (this.snowTarget - this.snowNow) * k;
    (this.scene.background as THREE.Color).copy(this.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.fogColor);
    this.hemi.color.copy(this.hemiSky);
    this.hemi.groundColor.copy(this.hemiGround);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = this.sunIntensity;
  }

  // ---- per-frame effects (water ripple, chimney smoke) ----
  private smokeAccum = 0;

  private animate(dt: number, _now: number): void {
    if (dt <= 0) return;
    this.animateWater(dt);
    if (this.tier === 'high') this.updateSmoke(dt);
  }

  private animateWater(dt: number): void {
    this.waterTime += dt * 1.2;
    const geo = this.water.geometry as THREE.PlaneGeometry;
    const base = geo.userData.base as Float32Array | undefined;
    if (!base) return;
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i];
      const y = base[i + 1];
      arr[i + 2] = Math.sin(x * 0.6 + this.waterTime) * 0.06 + Math.sin(y * 0.7 + this.waterTime * 1.3) * 0.05;
    }
    geo.attributes.position.needsUpdate = true;
    if (this.tier === 'high') geo.computeVertexNormals();
  }

  private initSmoke(): void {
    const CAP = 140;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(CAP * 3).fill(-999);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd2d5d9, size: 0.55, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true,
    });
    this.smoke = new THREE.Points(geo, mat);
    this.smoke.frustumCulled = false;
    this.smokeVel = new Float32Array(CAP * 3);
    this.smokeLife = new Float32Array(CAP);
    this.scene.add(this.smoke);
  }

  private updateSmoke(dt: number): void {
    if (!this.smoke || !this.smokeLife || !this.smokeVel || this.emitters.length === 0) return;
    const pos = this.smoke.geometry.attributes.position.array as Float32Array;
    const life = this.smokeLife;
    const vel = this.smokeVel;
    const CAP = life.length;
    for (let i = 0; i < CAP; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (life[i] <= 0) { pos[i * 3] = -999; pos[i * 3 + 1] = -999; pos[i * 3 + 2] = -999; }
    }
    this.smokeAccum += dt * this.emitters.length * 1.1;
    while (this.smokeAccum >= 1) {
      this.smokeAccum -= 1;
      const e = this.emitters[(Math.random() * this.emitters.length) | 0];
      for (let i = 0; i < CAP; i++) {
        if (life[i] > 0) continue;
        pos[i * 3] = e[0] + (Math.random() - 0.5) * 0.2;
        pos[i * 3 + 1] = e[1];
        pos[i * 3 + 2] = e[2] + (Math.random() - 0.5) * 0.2;
        vel[i * 3] = (Math.random() - 0.5) * 0.15;
        vel[i * 3 + 1] = 0.5 + Math.random() * 0.3;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
        life[i] = 2.5 + Math.random() * 1.5;
        break;
      }
    }
    this.smoke.geometry.attributes.position.needsUpdate = true;
  }

  // ---- terrain ----
  private syncTerrain(s: GameState): void {
    const snowQ = Math.round(this.snowNow * 8); // fold snow into the signature so it rebuilds
    let sig = snowQ;
    for (const i of this.landIdx) sig = (sig + tileKind(s.tiles[i].type) * (i + 1)) % 2147483647;
    if (sig === this.sig.land) return;
    this.sig.land = sig;
    const snow = this.snowNow;
    const mh = this.mountainH;
    let k = 0;
    for (const i of this.landIdx) {
      const t = s.tiles[i];
      const isMountain = t.type === 'stone';
      const h = isMountain ? (mh ? mh[i] : MOUNTAIN_BASE_H) : t.type === 'foothill' ? FOOTHILL_H : LAND_H;
      this.dummy.position.set((i % MAP_W) + 0.5, 0, ((i / MAP_W) | 0) + 0.5);
      this.dummy.scale.set(1, h, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.terrain.setMatrixAt(k, this.dummy.matrix);
      this.color.set(TILE_COLOR[t.type] ?? TILE_COLOR.grass);
      // Peaks wear a permanent snow cap; then every tile takes the seasonal snow tint.
      if (isMountain && h > SNOWLINE_H) {
        const cap = Math.min(1, (h - SNOWLINE_H) / (MOUNTAIN_MAX_H - SNOWLINE_H));
        this.color.lerp(SNOW_COLOR, cap * 0.85);
      }
      if (snow > 0.001) this.color.lerp(SNOW_COLOR, snow * (isMountain ? 0.35 : t.type === 'foothill' ? 0.7 : 0.85));
      this.terrain.setColorAt(k, this.color);
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
        this.enableShadows(obj);
        this.buildingMeshes.set(b.id, obj);
        this.scene.add(obj);
      }
      this.styleBuilding(obj, b.type, b.built, !!b.fireTimer);
    }

    // Chimney smoke emitters: hearth buildings that are built.
    this.emitters = [];
    for (const b of s.buildings) {
      if (!b.built || b.fireTimer || !SMOKE_BUILDINGS.has(b.type)) continue;
      const def = BUILDING_DEFS[b.type];
      this.emitters.push([b.x + def.w / 2, TOP + buildingHeight(b.type) + 0.25, b.y + def.h / 2]);
    }
  }

  private enableShadows(obj: THREE.Object3D): void {
    if (this.tier !== 'high') return;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as unknown as { isMesh?: boolean }).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
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
  private syncCitizens(s: GameState, now: number): void {
    const cap = (this.citizens.instanceMatrix.array.length / 16) | 0;
    const n = Math.min(s.citizens.length, cap);
    for (let i = 0; i < n; i++) {
      const c = s.citizens[i];
      const child = c.age < ADULT_AGE;
      const sc = child ? 0.62 : 1;
      // A little hop while walking so villagers read as moving, not sliding.
      const moving = Math.abs(c.tx - c.x) + Math.abs(c.ty - c.y) > 0.03;
      const bob = moving ? Math.abs(Math.sin(now * 6 + c.id)) * 0.06 : 0;
      const yaw = moving ? Math.atan2(c.tx - c.x, c.ty - c.y) : 0;
      this.dummy.position.set(c.x, TOP + bob, c.y);
      this.dummy.scale.set(sc, sc, sc);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.updateMatrix();
      this.citizens.setMatrixAt(i, this.dummy.matrix);
      const base = c.sick ? 0xd24a4a : c.sex === 'm' ? 0x9ec7f0 : 0xf0b9d2;
      this.citizens.setColorAt(i, this.color.set(base));
      if (this.heads) {
        this.dummy.position.set(c.x, TOP + bob + 0.62 * sc, c.y);
        this.dummy.scale.set(sc, sc, sc);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.heads.setMatrixAt(i, this.dummy.matrix);
        this.heads.setColorAt(i, this.color.set(0xf1c9a5));
      }
    }
    this.citizens.count = n;
    this.citizens.instanceMatrix.needsUpdate = true;
    if (this.citizens.instanceColor) this.citizens.instanceColor.needsUpdate = true;
    if (this.heads) {
      this.heads.count = n;
      this.heads.instanceMatrix.needsUpdate = true;
      if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    }
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
    if (this.heads) {
      this.scene.remove(this.heads);
      this.heads.geometry.dispose();
      (this.heads.material as THREE.Material).dispose();
      this.heads = null;
    }
    if (this.smoke) {
      this.scene.remove(this.smoke);
      this.smoke.geometry.dispose();
      (this.smoke.material as THREE.Material).dispose();
      this.smoke = null;
    }
    this.emitters = [];
    this.scene.remove(this.water);
    (this.water.material as THREE.Material).dispose();
    this.water.geometry.dispose();
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

/** Distinct small integer per tile kind, so terrain rebuilds when a tile's type changes. */
function tileKind(t: string): number {
  return t === 'forest' ? 2 : t === 'stone' ? 3 : t === 'foothill' ? 4 : 1;
}

/**
 * Height of each mountain (`stone`) tile: a multi-source BFS gives each stone tile its depth
 * (distance to the nearest non-mountain tile), so edges are low and interiors rise into peaks.
 * A per-tile hash adds irregularity. Non-mountain tiles get 0.
 */
function computeMountainHeights(s: GameState): Float32Array {
  const N = MAP_W * MAP_H;
  const depth = new Int16Array(N).fill(-1);
  const q: number[] = [];
  for (let i = 0; i < N; i++) {
    if (s.tiles[i].type !== 'stone') { depth[i] = 0; q.push(i); }
  }
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    const cx = cur % MAP_W;
    const cy = (cur / MAP_W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const ni = ny * MAP_W + nx;
        if (s.tiles[ni].type === 'stone' && depth[ni] < 0) {
          depth[ni] = depth[cur] + 1;
          q.push(ni);
        }
      }
    }
  }
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (s.tiles[i].type !== 'stone') continue;
    const hash = (((i * 2654435761) >>> 0) % 1000) / 1000; // 0..1 deterministic jitter
    const h = MOUNTAIN_BASE_H + (depth[i] - 1) * MOUNTAIN_STEP_H + hash * 0.5;
    out[i] = Math.min(MOUNTAIN_MAX_H, h);
  }
  return out;
}

/** Choose a graphics tier. `?gfx=low|high` overrides; otherwise weak/small phones get `low`. */
function detectTier(): 'high' | 'low' {
  const g = new URLSearchParams(location.search).get('gfx');
  if (g === 'low') return 'low';
  if (g === 'high') return 'high';
  const dpr = window.devicePixelRatio || 1;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 480;
  return coarse && dpr <= 1 && small ? 'low' : 'high';
}
