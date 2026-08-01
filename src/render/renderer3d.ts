import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  GameState,
  Building,
  Tile,
  BUILDING_DEFS,
  BuildingType,
  workRadiusOf,
  footprintW,
  footprintH,
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
const WATER_BED_H = 0.02; // lake/river floor, kept below the water plane at y = 0.14
/** Terrain vertices per tile edge. See makeTerrainGeometry — 1 breaks narrow rivers apart. */
const TERRAIN_RES = 2;
/** Wetness at which the ground has dropped to the waterline, and at which it reaches full depth. */
const WET_SHORE = 0.42;
const WET_DEEP = 0.85;
/** Wetness where the sand margin starts fading in, a little inland of the shore. */
const SAND_START = 0.06;
const FOOTHILL_H = 0.5; // low rocky band at a mountain's base
const MOUNTAIN_BASE_H = 1.8; // shortest mountain (edge) height
const MOUNTAIN_STEP_H = 2.2; // extra height per tile of depth into the mountain
const MOUNTAIN_MAX_H = 11.0; // tallest peak
const SNOWLINE_H = 6.0; // peaks above this get a permanent snow cap
const TOP = LAND_H; // y of the walkable surface props sit on
const TREE_MODEL_SIZE = 0.55; // world scale for a normalized (footprint=1) tree model — see tools/models/pine.py
const ROCK_MODEL_SIZE = 0.34; // world scale applied to a normalized loose-stone model
/**
 * Props drawn per resource tile.
 *
 * One prop per tile is what makes a resource field read as polka dots on a grid however much the
 * position is jittered — real ground has outcrops of several stones together and stands of
 * overlapping trees. Trees are the expensive one, so a large map keeps a single tree per tile:
 * at ~18k forest tiles a second pass would cost millions of triangles.
 */
const rocksPerTile = () => 5;
const ironPerTile = () => 4;
// Trees are much heavier than the ore chunks, and their count scales with map area, so the
// largest map keeps one per tile. Medium is unchanged: a stability-check timeout in the headless
// suite looked like it was caused by this, but the same test fails on the commit before it, so
// the density is not what pushed it over.
const treesPerTile = () => (MAP_W > 96 ? 1 : 2);

// The ground atlas supplies each surface's colour now, so these are near-white multipliers
// that only carry a slight per-type bias. A flat green here would double up with the texture.
const TILE_COLOR: Record<string, number> = {
  grass: 0xffffff,
  forest: 0xe8efe4,
  stone: 0xffffff,
  foothill: 0xfaf6ee,
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

// Instanced-mesh capacity for villagers — sized for a busy Large map's population.
const CITIZEN_CAP = 1200;

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
  private terrain!: THREE.Mesh;
  private landIdx: number[] = [];
  /** Per-vertex surface weights (grass, dirt, rock) driving the terrain texture blend. */
  private terrSurf!: THREE.BufferAttribute;
  /** Per-vertex ground height, indexed by vertex row-major over the (w+1)x(h+1) grid. */
  private terrHeight: Float32Array = new Float32Array(0);
  private trees!: THREE.InstancedMesh;
  private treeTiles: number[] = [];
  private rocks!: THREE.InstancedMesh;
  private rockTiles: number[] = [];
  private ironNodes!: THREE.InstancedMesh;
  private ironTiles: number[] = [];
  private paths!: THREE.InstancedMesh;
  private marks!: THREE.InstancedMesh;
  private citizens!: THREE.InstancedMesh;
  private water!: THREE.Mesh;
  private mountainH: Float32Array | null = null; // per-tile mountain block height (0 = not a mountain)

  // Per-building objects (box mesh or cloned model) + reused overlays.
  private buildingMeshes = new Map<number, THREE.Object3D>();
  private ghost!: THREE.Mesh;
  private selRing!: THREE.Mesh;
  private workRing!: THREE.Group; // ground circle (fill + outline) for a selected building's work radius
  private marquee!: THREE.Mesh;
  private boat!: THREE.Group; // merchant boat, shown while sailing to/from the dock

  // Cached signatures so we only rebuild a layer when its data changes.
  private sig = { land: -1, tree: -1, rock: -1, path: -1, mark: -1, bld: '' };
  private forestVer = -1; // last-seen GameState.forestVersion (rebuild trees when it changes)
  private lastState: GameState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.tier = detectTier();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.tier === 'low' ? 1.5 : 2));
    // Filmic tone mapping. Without it the raw linear output clips highlights to flat white and
    // leaves midtones washed out, which reads as "cartoon" no matter how good the models are.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    if (this.tier === 'high') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // A generated environment so PBR materials have something to reflect. Without it a
      // MeshStandardMaterial gets zero ambient specular and every surface looks like paper.
      // Measured at ~34% of frame time, so the low tier does without and leans on the lights.
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.35;
      pmrem.dispose();
    }
    this.scene.background = this.skyColor;
    this.scene.fog = new THREE.Fog(this.fogColor, 60, 150);

    // Sky fill is deliberately weak against a strong sun: a bright hemisphere light lifts the
    // shadow side to nearly the same value as the lit side, which flattens every form it touches.
    this.hemi = new THREE.HemisphereLight(0xe6f2ff, 0x4a6b34, 0.42);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3d0, 2.4);
    // Lower and more to the side than a noon sun, so roof planes separate and walls catch a rake.
    this.sun.position.set(34, 30, 20);
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
    // Terrain: one continuous height-field mesh over the whole map (the water plane draws on
    // top of the sunken water tiles).
    this.landIdx = [];
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].type !== 'water') this.landIdx.push(i);
    this.mountainH = computeMountainHeights(s);
    this.terrain = new THREE.Mesh(this.makeTerrainGeometry(s), this.makeTerrainMaterial());
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = true;
    this.scene.add(this.terrain);

    // Trees on forest tiles (a simple two-cone pine).
    this.treeTiles = [];
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].type === 'forest') this.treeTiles.push(i);
    this.forestVer = s.forestVersion ?? 0;
    const coneGeo = new THREE.ConeGeometry(0.42, 1.1, 6);
    coneGeo.translate(0, 0.55, 0);
    this.trees = new THREE.InstancedMesh(coneGeo, matte(0x2f5a2a), Math.max(1, this.treeTiles.length));
    this.trees.count = this.treeTiles.length;
    this.trees.castShadow = true;
    this.scene.add(this.trees);

    // Loose-stone deposits.
    this.rockTiles = [];
    for (let i = 0; i < s.tiles.length; i++) if ((s.tiles[i].stone ?? 0) > 0) this.rockTiles.push(i);
    const rockGeo = new THREE.DodecahedronGeometry(0.13);
    this.rocks = new THREE.InstancedMesh(rockGeo, matte(0x9a9ca1), Math.max(1, this.rockTiles.length * rocksPerTile()));
    this.rocks.count = this.rockTiles.length * rocksPerTile();
    this.scene.add(this.rocks);

    // Surface iron ore: same hand-harvested deposit as loose stone, but rust-coloured and
    // slightly craggier so a player can tell the two apart at a glance from the play camera.
    this.ironTiles = [];
    for (let i = 0; i < s.tiles.length; i++) if ((s.tiles[i].iron ?? 0) > 0) this.ironTiles.push(i);
    const ironGeo = new THREE.OctahedronGeometry(0.15);
    this.ironNodes = new THREE.InstancedMesh(ironGeo, matte(0x9c5f3a, 0.65), Math.max(1, this.ironTiles.length * ironPerTile()));
    this.ironNodes.count = this.ironTiles.length * ironPerTile();
    this.ironNodes.castShadow = true;
    this.scene.add(this.ironNodes);

    // Paths / bridges and harvest marks: flat quads covering a whole map's worth of tiles.
    const flat = new THREE.BoxGeometry(0.96, 0.06, 0.96);
    this.paths = new THREE.InstancedMesh(flat, matte(0xffffff), MAP_W * MAP_H);
    this.paths.count = 0;
    // Instanced layers whose instances change (paths drawn, tiles marked, villagers moving) must skip
    // frustum culling: Three culls the whole InstancedMesh by a bounding volume that doesn't track
    // live instance matrices, so a stale volume makes the entire layer pop in/out as the camera moves.
    this.paths.frustumCulled = false;
    this.scene.add(this.paths);
    const flat2 = new THREE.BoxGeometry(1, 0.04, 1);
    const markMat = matte(0xffffff);
    markMat.transparent = true;
    markMat.opacity = 0.5;
    this.marks = new THREE.InstancedMesh(flat2, markMat, MAP_W * MAP_H);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.scene.add(this.marks);

    // Citizens: capsule bodies (all tiers) + small heads (high tier), refreshed every frame.
    const capGeo = new THREE.CapsuleGeometry(0.16, 0.34, 3, 6);
    capGeo.translate(0, 0.33, 0);
    this.citizens = new THREE.InstancedMesh(capGeo, matte(0xffffff), CITIZEN_CAP);
    this.citizens.count = 0;
    this.citizens.castShadow = this.tier === 'high';
    this.citizens.frustumCulled = false;
    this.scene.add(this.citizens);
    if (this.tier === 'high') {
      const headGeo = new THREE.SphereGeometry(0.13, 8, 6);
      this.heads = new THREE.InstancedMesh(headGeo, matte(0xffffff), CITIZEN_CAP);
      this.heads.count = 0;
      this.heads.castShadow = true;
      this.heads.frustumCulled = false;
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
    // Work-area circle: a faint fill disc + a crisp outline ring, both unit-radius and scaled to fit.
    this.workRing = new THREE.Group();
    const workFill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: 0x6fe06f, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    const workEdge = new THREE.Mesh(
      new THREE.RingGeometry(0.965, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0x8aff6a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.workRing.add(workFill, workEdge);
    this.workRing.rotation.x = -Math.PI / 2;
    this.workRing.visible = false;
    this.scene.add(this.workRing);
    this.marquee = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x9ae69a, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    this.marquee.rotation.x = -Math.PI / 2;
    this.marquee.visible = false;
    this.scene.add(this.marquee);

    // Merchant boat: a little hull with a mast and sail, floating on the water.
    this.boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.8), matte(0x6b4a2b));
    hull.position.y = 0.2;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), matte(0x3f2b18));
    mast.position.y = 0.9;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0xeae3d2, roughness: 1, side: THREE.DoubleSide }));
    sail.position.set(0, 0.95, 0);
    sail.rotation.y = Math.PI / 2;
    this.boat.add(hull, mast, sail);
    this.boat.visible = false;
    this.scene.add(this.boat);

    this.sig = { land: -1, tree: -1, rock: -1, path: -1, mark: -1, bld: '' };
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
    this.syncIron(s);
    this.syncPaths(s);
    this.syncMarks(s);
    this.syncBuildings(s);
    this.syncCitizens(s, now);
    this.syncBoat(s);
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
    this.waterTime += dt * 0.6; // half speed; combined with half amplitude the swell reads ~25%
    const geo = this.water.geometry as THREE.PlaneGeometry;
    const base = geo.userData.base as Float32Array | undefined;
    if (!base) return;
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i];
      const y = base[i + 1];
      arr[i + 2] = Math.sin(x * 0.6 + this.waterTime) * 0.03 + Math.sin(y * 0.7 + this.waterTime * 1.3) * 0.025;
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
  /**
   * Per-tile ground height. Flat land stays at exactly LAND_H so that everything placed at TOP —
   * buildings, trees, villagers — still sits on the surface without sampling the mesh.
   */
  private tileHeight(t: Tile, i: number): number {
    if (t.type === 'water') return WATER_BED_H;
    if (t.type === 'stone') return this.mountainH ? this.mountainH[i] : MOUNTAIN_BASE_H;
    if (t.type === 'foothill') return FOOTHILL_H;
    return LAND_H;
  }

  /**
   * The terrain as one continuous height-field mesh, subdivided finer than the tile grid.
   *
   * TERRAIN_RES matters more than it looks. With one vertex per tile corner, almost every vertex
   * along a two-tile-wide river also touches dry land, so any rule that keeps banks above the
   * water plane necessarily lifts the river bed with them — the river then survives only where
   * four water tiles happen to meet and renders as a chain of disconnected pools. Subdividing
   * gives narrow water interior vertices of its own, so a river can sit below the plane along its
   * whole length while the banks either side stay above it.
   *
   * Height comes from a smoothly interpolated "wetness" field rather than from tile types
   * directly, which is also what turns the shoreline from a stepped tile boundary into a bank
   * that slopes into the water.
   */
  private makeTerrainGeometry(s: GameState): THREE.BufferGeometry {
    const R = TERRAIN_RES;
    const vw = MAP_W * R + 1;
    const vh = MAP_H * R + 1;
    const tileAt = (x: number, y: number) =>
      s.tiles[Math.min(MAP_H - 1, Math.max(0, y)) * MAP_W + Math.min(MAP_W - 1, Math.max(0, x))];
    const tileIdx = (x: number, y: number) =>
      Math.min(MAP_H - 1, Math.max(0, y)) * MAP_W + Math.min(MAP_W - 1, Math.max(0, x));

    // Per-tile dry height and wetness, sampled bilinearly between tile centres below.
    const dryH = new Float32Array(MAP_W * MAP_H);
    const wetT = new Float32Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const t = s.tiles[i];
        wetT[i] = t.type === 'water' ? 1 : 0;
        dryH[i] = t.type === 'water' ? LAND_H : this.tileHeight(t, i);
      }
    }
    // Round off the tile staircase before sampling. The water mask is quantised to whole tiles,
    // so bilinear interpolation alone still traces a zigzag along the bank; one gentle blur of the
    // mask turns that into a curve. Weighted toward the centre so a narrow river keeps enough
    // wetness at its middle to stay below the water plane.
    const blurred = new Float32Array(wetT);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        let sum = 0;
        let wsum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 1.4 : 0.6;
            sum += wetT[tileIdx(x + dx, y + dy)] * w;
            wsum += w;
          }
        }
        blurred[y * MAP_W + x] = sum / wsum;
      }
    }
    wetT.set(blurred);

    const bilinear = (f: Float32Array, px: number, pz: number) => {
      // Sample about tile centres, which sit at (x+0.5, y+0.5).
      const fx = px - 0.5;
      const fz = pz - 0.5;
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const tx = fx - x0;
      const tz = fz - z0;
      const a = f[tileIdx(x0, z0)];
      const b = f[tileIdx(x0 + 1, z0)];
      const c = f[tileIdx(x0, z0 + 1)];
      const d = f[tileIdx(x0 + 1, z0 + 1)];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    };

    const height = new Float32Array(vw * vh);
    const wetness = new Float32Array(vw * vh);
    for (let vy = 0; vy < vh; vy++) {
      for (let vx = 0; vx < vw; vx++) {
        const px = vx / R;
        const pz = vy / R;
        const wet = bilinear(wetT, px, pz);
        const dry = bilinear(dryH, px, pz);
        // Ease across the waterline so the bank is a ramp, not a cliff, and so the midpoint of
        // the transition still sits above the water plane and keeps the shore dry.
        const k = clamp01((wet - WET_SHORE) / (WET_DEEP - WET_SHORE));
        let e = k * k * (3 - 2 * k);
        // High ground meets water as a cliff, not a beach. Without this the blurred water mask
        // erodes any mountain standing on a shoreline, carving chunks out of coastal ranges.
        e *= 1 - clamp01((dry - LAND_H) / (MOUNTAIN_BASE_H - LAND_H)) * 0.85;
        const kk = vy * vw + vx;
        height[kk] = dry + (WATER_BED_H - dry) * e;
        wetness[kk] = wet;
      }
    }
    this.terrHeight = height;

    const geo = new THREE.PlaneGeometry(MAP_W, MAP_H, MAP_W * R, MAP_H * R);
    geo.rotateX(-Math.PI / 2);
    geo.translate(MAP_W / 2, 0, MAP_H / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const surf = new Float32Array(pos.count * 4);
    for (let k = 0; k < vw * vh; k++) {
      const h = height[k];
      pos.setY(k, h);
      // Surface mix. Rock climbs in above the foothill band, dirt covers the foothills, and a
      // sand margin follows the waterline — widest right at the shore and gone a little inland.
      const rockW = clamp01((h - FOOTHILL_H) / (MOUNTAIN_BASE_H - FOOTHILL_H));
      const dirtW = clamp01((h - LAND_H) / (FOOTHILL_H - LAND_H)) * (1 - rockW);
      const sandW = clamp01((wetness[k] - SAND_START) / (WET_SHORE - SAND_START)) * (1 - rockW);
      const grassW = Math.max(0, 1 - rockW - dirtW - sandW);
      surf[k * 4] = grassW;
      surf[k * 4 + 1] = dirtW;
      surf[k * 4 + 2] = rockW;
      surf[k * 4 + 3] = sandW;
    }
    this.terrSurf = new THREE.BufferAttribute(surf, 4);
    geo.setAttribute('aSurf', this.terrSurf);
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }


  /**
   * The terrain material: three tiling surface textures blended per-vertex.
   *
   * Each surface is its own repeating texture rather than a cell in an atlas, because blending
   * inside an atlas needs fract() on the UVs and its derivative discontinuity tears mipmaps
   * along every seam. UVs come from world XZ so the texture scale is independent of map size.
   */
  private makeTerrainMaterial(): THREE.MeshStandardMaterial {
    const loader = new THREE.TextureLoader();
    const base = import.meta.env.BASE_URL + 'textures/';
    const mat = matte(0xffffff, 0.95);
    const load = (file: string, srgb: boolean, onto: (t: THREE.Texture) => void) =>
      loader.load(base + file, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.tier === 'high' ? 4 : 1;
        onto(t);
        mat.needsUpdate = true;
      }, undefined, () => { /* best-effort: no texture just means untextured ground */ });

    const uniforms = {
      uGrass: { value: null as THREE.Texture | null },
      uDirt: { value: null as THREE.Texture | null },
      uRock: { value: null as THREE.Texture | null },
      uSand: { value: null as THREE.Texture | null },
      uTexScale: { value: 0.5 }, // one texture repeat every two tiles
    };
    load('grass.png', true, (t) => { uniforms.uGrass.value = t; mat.map = t; });
    load('dirt.png', true, (t) => { uniforms.uDirt.value = t; });
    load('rock.png', true, (t) => { uniforms.uRock.value = t; });
    load('sand.png', true, (t) => { uniforms.uSand.value = t; });
    load('ground_n.png', false, (t) => { mat.normalMap = t; mat.normalScale.set(0.6, 0.6); });

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `attribute vec4 aSurf;\nvarying vec4 vSurf;\nvarying vec2 vGroundUv;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vSurf = aSurf;
        vGroundUv = position.xz;`,
      );
      shader.fragmentShader =
        `uniform sampler2D uGrass;\nuniform sampler2D uDirt;\nuniform sampler2D uRock;\nuniform sampler2D uSand;\nuniform float uTexScale;\nvarying vec4 vSurf;\nvarying vec2 vGroundUv;\n` +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec2 gUv = vGroundUv * uTexScale;
        vec4 w = vSurf / max(0.001, vSurf.x + vSurf.y + vSurf.z + vSurf.w);
        vec4 blended =
          texture2D(uGrass, gUv) * w.x +
          texture2D(uDirt, gUv) * w.y +
          texture2D(uRock, gUv) * w.z +
          texture2D(uSand, gUv) * w.w;
        diffuseColor *= blended;`,
      );
    };
    return mat;
  }

  /**
   * Keep the terrain in step with the world. The mesh's shape is static for a given map, so this
   * only rebuilds when the tile layout actually changes (clear-cutting a forest, say), and
   * otherwise just retints for snow.
   */
  private syncTerrain(s: GameState): void {
    const snowQ = Math.round(this.snowNow * 8); // fold snow into the signature so it retints
    let sig = snowQ;
    for (const i of this.landIdx) sig = (sig + tileKind(s.tiles[i].type) * (i + 1)) % 2147483647;
    if (sig === this.sig.land) return;
    this.sig.land = sig;
    // Snow washes the whole surface toward white; peaks keep a permanent cap above the snowline.
    const snow = this.snowNow;
    const vw = MAP_W * TERRAIN_RES + 1;
    const colors = new Float32Array(this.terrHeight.length * 3);
    for (let k = 0; k < this.terrHeight.length; k++) {
      const h = this.terrHeight[k];
      this.color.setRGB(1, 1, 1);
      if (h > SNOWLINE_H) {
        const cap = Math.min(1, (h - SNOWLINE_H) / (MOUNTAIN_MAX_H - SNOWLINE_H));
        this.color.lerp(SNOW_COLOR, cap * 0.85);
      }
      if (snow > 0.001) this.color.lerp(SNOW_COLOR, snow * (h > FOOTHILL_H ? 0.35 : 0.85));
      // A touch of per-vertex brightness variation so broad fields are not one flat value.
      const vx = k % vw;
      const vy = (k / vw) | 0;
      this.color.multiplyScalar(0.93 + (((vx * 73856093) ^ (vy * 19349663)) % 100) / 100 * 0.07);
      colors[k * 3] = this.color.r;
      colors[k * 3 + 1] = this.color.g;
      colors[k * 3 + 2] = this.color.b;
    }
    this.terrain.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (this.terrain.material as THREE.MeshStandardMaterial).vertexColors = true;
    (this.terrain.material as THREE.MeshStandardMaterial).needsUpdate = true;
  }

  // ---- trees ----
  /** Rescan the forest tiles and re-size the tree meshes — called when the forest set changes
   *  (replanting or clear-cutting), so newly-grown / felled trees appear or disappear. */
  private rebuildTreeLayer(s: GameState): void {
    this.treeTiles = [];
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].type === 'forest') this.treeTiles.push(i);
    const cap = Math.max(1, this.treeTiles.length * treesPerTile());
    // Rebuild the cone fallback mesh at the new capacity.
    this.scene.remove(this.trees);
    const geo = this.trees.geometry;
    (this.trees.material as THREE.Material).dispose();
    this.trees = new THREE.InstancedMesh(geo, matte(0x2f5a2a), cap);
    this.trees.count = this.treeInst ? 0 : this.treeTiles.length * treesPerTile();
    this.trees.castShadow = true;
    this.scene.add(this.trees);
    // Rebuild the model instances at the new capacity if models are in use.
    if (this.treeInst) {
      const tpl = this.models.firstTree();
      this.treeInst.dispose(this.scene);
      this.treeInst = tpl ? new InstancedModel(tpl, cap) : null;
      this.treeInst?.addTo(this.scene);
    }
    this.forestVer = s.forestVersion ?? 0;
    this.sig.tree = -4; // force a redraw of the new tile set
  }

  private syncTrees(s: GameState): void {
    if ((s.forestVersion ?? 0) !== this.forestVer) this.rebuildTreeLayer(s);
    // Upgrade to a model the first frame one is available (hide the cone fallback).
    const tpl = this.models.firstTree();
    if (tpl && !this.treeInst) {
      this.treeInst = new InstancedModel(tpl, this.treeTiles.length * treesPerTile() || 1);
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
      // A stand of trees per tile, spread across the whole cell at mixed sizes, so canopies
      // overlap between neighbours instead of each tile showing one spire on a lattice.
      const per = treesPerTile();
      for (let n = 0; n < per; n++) {
        const salt = 0x8f + n * 0x61;
        const tx = (i % MAP_W) + 0.5 + (this.tileRand(i, salt) - 0.5) * 0.92;
        const tz = ((i / MAP_W) | 0) + 0.5 + (this.tileRand(i, salt + 0x1d) - 0.5) * 0.92;
        const vary = 0.7 + this.tileRand(i, salt + 0x2f) * 0.6;
        const gy = live ? this.groundAt(tx, tz) : -5;
        if (this.treeInst) {
          const sc = live ? (0.7 + t.trees * 0.8) * TREE_MODEL_SIZE * vary : 0.0001;
          this.dummy.position.set(tx, gy, tz);
          this.dummy.scale.set(sc, sc, sc);
          this.dummy.rotation.set(0, this.tileRand(i, salt + 0x43) * 6.283, 0);
          this.dummy.updateMatrix();
          this.treeInst.setAt(k, this.dummy.matrix);
        } else {
          const sc = live ? (0.5 + t.trees * 0.9) * vary : 0;
          this.dummy.position.set(tx, gy, tz);
          this.dummy.scale.set(sc, sc, sc);
          this.dummy.rotation.set(0, this.tileRand(i, salt + 0x43) * 6.283, 0);
          this.dummy.updateMatrix();
          this.trees.setMatrixAt(k, this.dummy.matrix);
        }
        k++;
      }
    }
    if (this.treeInst) {
      this.treeInst.setCount(this.treeTiles.length * treesPerTile());
      this.treeInst.update();
    } else {
      this.trees.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- loose stone ----
  /** A stable pseudo-random offset in -0.42..0.42 for scattering a prop within its tile. */
  private tileJitter(i: number, salt: number): number {
    return ((Math.imul(i ^ salt, 2654435761) >>> 8) % 1000) / 1000 * 0.84 - 0.42;
  }

  /** A stable pseudo-random value in 0..1 from a tile index and a salt. */
  private tileRand(i: number, salt: number): number {
    return ((Math.imul(i ^ salt, 374761393) >>> 8) % 1000) / 1000;
  }

  /**
   * Ground height at a world position, sampled from the terrain height field.
   *
   * Props used to be drawn at a constant TOP, which is only correct on flat ground at exactly
   * LAND_H. On a shore that slopes into the water that left them hanging over the surface, and on
   * a foothill it buried or floated them.
   */
  private groundAt(px: number, pz: number): number {
    const R = TERRAIN_RES;
    const vw = MAP_W * R + 1;
    const vh = MAP_H * R + 1;
    if (this.terrHeight.length !== vw * vh) return TOP;
    const gx = Math.min(vw - 1, Math.max(0, Math.round(px * R)));
    const gz = Math.min(vh - 1, Math.max(0, Math.round(pz * R)));
    return this.terrHeight[gz * vw + gx];
  }

  /** Place the surface iron deposits; a depleted tile drops out of view like a spent rock. */
  private syncIron(s: GameState): void {
    let k = 0;
    for (const i of this.ironTiles) {
      const has = (s.tiles[i].iron ?? 0) > 0;
      // Seed a tight cluster: the whole group sits somewhere in the tile, and the chunks huddle
      // around that point rather than spreading evenly, so it reads as one seam of ore.
      const cx = (i % MAP_W) + 0.5 + this.tileJitter(i, 0x51) * 0.6;
      const cz = ((i / MAP_W) | 0) + 0.5 + this.tileJitter(i, 0x9d) * 0.6;
      for (let n = 0; n < ironPerTile(); n++) {
        const salt = 0x51 + n * 0x3b;
        const ix = cx + (this.tileRand(i, salt) - 0.5) * 0.62;
        const iz = cz + (this.tileRand(i, salt + 0x17) - 0.5) * 0.62;
        const isc = 0.45 + this.tileRand(i, salt + 0x29) * 0.75;
        this.dummy.position.set(ix, has ? this.groundAt(ix, iz) + 0.02 : -5, iz);
        this.dummy.scale.set(isc, isc * 0.75, isc);
        this.dummy.rotation.set(0, this.tileRand(i, salt + 0x41) * 6.283, 0);
        this.dummy.updateMatrix();
        this.ironNodes.setMatrixAt(k, this.dummy.matrix);
        k++;
      }
    }
    this.ironNodes.instanceMatrix.needsUpdate = true;
  }

  private syncRocks(s: GameState): void {
    const tpl = this.models.firstRock();
    if (tpl && !this.rockInst) {
      this.rockInst = new InstancedModel(tpl, this.rockTiles.length * rocksPerTile() || 1);
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
        // Vary the size as well as the position: identical props on a lattice is what reads as
        // "planted in rows", and scatter alone does not break it.
        const sc = has ? ROCK_MODEL_SIZE * (0.65 + this.tileRand(i, 0x5b) * 0.7) : 0.0001;
        const rx = (i % MAP_W) + 0.5 + this.tileJitter(i, 0x2f);
        const rz = ((i / MAP_W) | 0) + 0.5 + this.tileJitter(i, 0xb7);
        this.dummy.position.set(rx, has ? this.groundAt(rx, rz) : -5, rz);
        this.dummy.scale.set(sc, sc, sc);
        this.dummy.rotation.set(0, this.tileRand(i, 0x11) * 6.283, 0);
        this.dummy.updateMatrix();
        this.rockInst.setAt(k, this.dummy.matrix);
      } else {
        const fx = (i % MAP_W) + 0.5 + this.tileJitter(i, 0x2f);
        const fz = ((i / MAP_W) | 0) + 0.5 + this.tileJitter(i, 0xb7);
        this.dummy.position.set(fx, has ? this.groundAt(fx, fz) + 0.1 : -5, fz);
        this.dummy.scale.set(has ? 1 : 0.0001, has ? 1 : 0.0001, has ? 1 : 0.0001);
        this.dummy.rotation.set(0, i * 1.1, 0);
        this.dummy.updateMatrix();
        this.rocks.setMatrixAt(k, this.dummy.matrix);
      }
      k++;
    }
    if (this.rockInst) {
      this.rockInst.setCount(this.rockTiles.length * rocksPerTile());
      this.rockInst.update();
    } else {
      this.rocks.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- paths & bridges ----
  private syncPaths(s: GameState): void {
    // Rolling numeric hash over set tiles — sub-millisecond even at 37k tiles (Large map).
    let sig = 0;
    for (let i = 0; i < s.paths.length; i++) if (s.paths[i]) sig = (Math.imul(sig, 31) + (i + 1) * s.paths[i]) >>> 0;
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
    let sig = 0;
    for (let i = 0; i < s.harvest.length; i++) if (s.harvest[i]) sig = (Math.imul(sig, 31) + (i + 1) * s.harvest[i]) >>> 0;
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
      // A ranch is a variable-size pen (model-less); everything else uses its model or a box.
      // Ranch and field are always drawn as fenced plots, never a model.
      const wantModel = b.type !== 'ranch' && b.type !== 'farm' && !!this.models.buildingClone(b.type);
      let obj = this.buildingMeshes.get(b.id);
      // Recreate if missing or if the desired kind (model vs box) changed since last build.
      if (!obj || !!obj.userData.model !== wantModel) {
        if (obj) {
          this.disposeBuilding(obj);
          this.buildingMeshes.delete(b.id);
        }
        obj = wantModel ? this.makeBuildingModel(b.type) : this.makeBuildingBox(b);
        obj.position.set(b.x + footprintW(b) / 2, TOP, b.y + footprintH(b) / 2);
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
      this.emitters.push([b.x + footprintW(b) / 2, TOP + buildingHeight(b.type) + 0.25, b.y + footprintH(b) / 2]);
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

  private makeBuildingBox(b: Building): THREE.Object3D {
    const fw = footprintW(b);
    const fh = footprintH(b);
    if (b.type === 'ranch') return this.makeFencedPlot(fw, fh, { shed: true, ground: 0x6f7a3f });
    if (b.type === 'farm') return this.makeFencedPlot(fw, fh, { shed: false, ground: 0x7a5a34 });
    const h = buildingHeight(b.type);
    const geo = new THREE.BoxGeometry(fw * 0.9, h, fh * 0.9);
    geo.translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }));
    mesh.userData.model = false;
    return mesh;
  }

  /**
   * A fenced plot: a low ground slab (pen grass or tilled soil) with thin fence rails around the
   * border, optionally a corner shed. Used for both the ranch (with shed) and the field (without).
   */
  private makeFencedPlot(fw: number, fh: number, opts: { shed: boolean; ground: number }): THREE.Object3D {
    const group = new THREE.Group();
    // Ground slab covering the plot (the tilled soil / pen floor).
    const slabH = 0.12;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(fw - 0.1, slabH, fh - 0.1),
      new THREE.MeshStandardMaterial({ color: opts.ground, roughness: 1 }),
    );
    slab.position.y = slabH / 2;
    group.add(slab);
    // Corner shed (top-left 1×1 tile), centred within the group whose origin is the plot centre.
    if (opts.shed) {
      const shedH = 1.2;
      const shedMat = new THREE.MeshStandardMaterial({ color: BUILDING_COLORS.ranch, roughness: 1 });
      const shed = new THREE.Mesh(new THREE.BoxGeometry(0.85, shedH, 0.85), shedMat);
      shed.position.set(-fw / 2 + 0.5, shedH / 2, -fh / 2 + 0.5);
      group.add(shed);
    }
    // Fence rails: a thin low bar along each of the four sides.
    const railH = 0.4;
    const railMat = new THREE.MeshStandardMaterial({ color: 0xa4813f, roughness: 1 });
    const hbar = () => new THREE.BoxGeometry(fw - 0.1, railH, 0.12);
    const vbar = () => new THREE.BoxGeometry(0.12, railH, fh - 0.1);
    const north = new THREE.Mesh(hbar(), railMat); north.position.set(0, railH / 2, -fh / 2 + 0.06);
    const south = new THREE.Mesh(hbar(), railMat); south.position.set(0, railH / 2, fh / 2 - 0.06);
    const west = new THREE.Mesh(vbar(), railMat); west.position.set(-fw / 2 + 0.06, railH / 2, 0);
    const east = new THREE.Mesh(vbar(), railMat); east.position.set(fw / 2 - 0.06, railH / 2, 0);
    group.add(north, south, west, east);
    group.userData.model = false;
    group.userData.ranch = true; // reuse the ranch flag so styleBuilding leaves the plot's own colours
    return group;
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
    const isRanch = !!obj.userData.ranch; // the pen keeps its own shed/rail colours
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat || Array.isArray(mat)) return;
      // Box meshes get the flat building color; model meshes keep their own textures/colors.
      if (!isModel && !isRanch && mat.color) mat.color.set(BUILDING_COLORS[type]);
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
      const pw = pv.pw ?? def.w;
      const ph = pv.ph ?? def.h;
      const h = buildingHeight(pv.type);
      this.ghost.visible = true;
      this.ghost.scale.set(pw * 0.9, h, ph * 0.9);
      this.ghost.position.set(pv.tx + pw / 2, TOP + h / 2, pv.ty + ph / 2);
      (this.ghost.material as THREE.MeshStandardMaterial).color.set(pv.valid ? 0x5ad06a : 0xe0574a);
    } else {
      this.ghost.visible = false;
    }

    let selPos: { x: number; y: number; r: number } | null = null;
    let workCircle: { x: number; y: number; r: number } | null = null;
    if (pv.selBuildingId != null) {
      const b = s.buildings.find((x) => x.id === pv.selBuildingId);
      if (b) {
        const d = BUILDING_DEFS[b.type];
        selPos = { x: b.x + d.w / 2, y: b.y + d.h / 2, r: Math.max(d.w, d.h) * 0.6 };
        const wr = workRadiusOf(b);
        if (wr && b.built) workCircle = { x: b.x + d.w / 2, y: b.y + d.h / 2, r: wr };
      }
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
    if (workCircle) {
      this.workRing.visible = true;
      this.workRing.position.set(workCircle.x, TOP + 0.05, workCircle.y);
      this.workRing.scale.set(workCircle.r, workCircle.r, 1);
    } else {
      this.workRing.visible = false;
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
  /** Position and show the merchant boat while it's on the water. */
  private syncBoat(s: GameState): void {
    const b = s.merchant.boat;
    if (!b) {
      this.boat.visible = false;
      return;
    }
    this.boat.visible = true;
    this.boat.position.set(b.x, 0.16, b.y);
  }

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
    for (const o of [this.ghost, this.selRing, this.workRing, this.marquee, this.boat]) this.scene.remove(o);
    this.sig = { land: -1, tree: -1, rock: -1, path: -1, mark: -1, bld: '' };
    this.ready = false;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function matte(color = 0xffffff, roughness = 0.9): THREE.MeshStandardMaterial {
  // Not fully rough: a little specular response is what separates a surface from a paper cutout.
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
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

/**
 * Choose a graphics tier. Precedence: `?gfx=low|high` URL override (for testing) → the player's
 * saved Settings preference (`localStorage 'village-gfx'`) → auto-detect (weak/small phones get
 * `low`).
 */
function detectTier(): 'high' | 'low' {
  const g = new URLSearchParams(location.search).get('gfx');
  if (g === 'low') return 'low';
  if (g === 'high') return 'high';
  try {
    const saved = localStorage.getItem('village-gfx');
    if (saved === 'low') return 'low';
    if (saved === 'high') return 'high';
  } catch {
    /* ignore storage errors — fall through to auto-detect */
  }
  const dpr = window.devicePixelRatio || 1;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 480;
  return coarse && dpr <= 1 && small ? 'low' : 'high';
}
