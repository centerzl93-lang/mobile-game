import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  GameState,
  Building,
  Placed,
  Tile,
  BUILDING_DEFS,
  BuildingType,
  workRadiusOf,
  workCentre,
  footprintW,
  footprintH,
  buildStage,
  framedFraction,
  entranceAt,
  MAP_W,
  MAP_H,
  ADULT_AGE,
  isHouse,
  PATH_DIRT,
  PATH_DIRT_PLAN,
  PATH_STONE,
  PATH_STONE_PLAN,
  PATH_BRIDGE,
  PATH_BRIDGE_PLAN,
  PATH_TUNNEL,
  PATH_TUNNEL_PLAN,
  PATH_NONE,
  HARVEST_WOOD,
  HARVEST_STONE,
} from '../types';
import { tileIndex, inBounds } from '../game/world';
import { Camera3D } from '../engine/camera3d';
import type { PlacementView } from './renderer';
import { ModelLibrary, InstancedModel } from './models';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bodyGeometry, skinGeometry, hairGeometry, legGeometry, coatGeometry, HEAD_Y, HIP_Y, LEG_X } from './villager';

const LAND_H = 0.3; // height of a normal land tile block
const WATER_BED_H = 0.02; // lake/river floor, kept below the water plane at y = 0.14
/** Tiles per water-plane segment. The swell's wavelength is ~10 tiles; this only has to sample it. */
const WATER_SEG = 2;
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
// Where the permanent snow starts, and where it is fully white. Both are set against the heights
// the generator actually produces — peaks come out around 6.7 to 8.9 — rather than the theoretical
// MOUNTAIN_MAX_H ceiling, which nothing ever reaches.
const SNOWLINE_H = 4.6;
const SNOWCAP_FULL_H = 7.6;
const TOP = LAND_H; // y of the walkable surface props sit on
const TREE_MODEL_SIZE = 0.55; // world scale for a normalized (footprint=1) tree model — see tools/models/pine.py
/**
 * How many tiles long the merchant's boat is.
 *
 * Models arrive normalized to a one-tile footprint, and the boat was being drawn at exactly that —
 * a speck alongside a 5x9 trading post, which is a wharf big enough to berth a real vessel.
 *
 * Three and a half tiles is the length that reads: clearly a bigger thing than a two-tile cottage,
 * and comfortably berthed at a nine-tile quay. Two was still a rowing boat; five swamped the wharf
 * and the houses behind it.
 */
const BOAT_SIZE = 3.5;
const ROCK_MODEL_SIZE = 0.52; // world scale applied to a normalized loose-stone model
/**
 * Props drawn per resource tile.
 *
 * One prop per tile is what makes a resource field read as polka dots on a grid however much the
 * position is jittered — real ground has outcrops of several stones together and stands of
 * overlapping trees. Trees are the expensive one, so a large map keeps a single tree per tile:
 * at ~18k forest tiles a second pass would cost millions of triangles.
 */
/**
 * Loose stone draws **one** rock per tile.
 *
 * This used to claim 5, but `syncRocks` only ever wrote one matrix per tile — so four fifths of
 * the instances kept the zero matrix, drew as degenerate triangles, and cost 570k triangles a
 * frame on a medium map for nothing anyone could see. The count now matches what is written.
 *
 * If loose stone should read denser, the fix is to write the extra matrices (nest the loop the
 * way `syncIron` does, scattering within the tile) and raise this together with it — not to raise
 * this alone, which is the state that produced the waste.
 */
const rocksPerTile = () => 1;
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

/**
 * Yaw for a building turned `rot` quarter turns clockwise, so its modelled door ends up on the
 * face villagers actually walk to.
 *
 * Two conversions stack here. The models put their door on Blender's +Y face (`door(...)` in
 * tools/models), and the glTF export maps Blender (x, y, z) to (x, z, −y) — so in the loaded model
 * the door faces −Z. Tile +y is world +z, which makes −Z *north*, while `entranceTile` at rot 0
 * puts the door tile to the south. Hence the half turn on top of the quarter turns: without it
 * every building would be drawn with its door on the opposite side from the one being walked to.
 *
 * The quarter turns are negative because a rotation about Y sends local −Z to (−sin θ, −cos θ),
 * and rot 1 has to land that on −x (west).
 */
/**
 * The "this is the front" arrow: a flat shaft and head lying on the ground, built pointing along
 * local +Z so a yaw of `-rot * π/2` aims it out of whichever face the door is on.
 *
 * Basic (unlit) materials on purpose — it is a marker, not scenery, and it has to stay legible
 * against grass, snow and shadow alike.
 */
function makeFaceArrow(): THREE.Group {
  const g = new THREE.Group();
  // Drawn twice: a dark shape first, then a bright one a hair above and slightly smaller. Grass,
  // snow and shadow are all in play under this thing, and a single flat colour disappears into
  // one of them whichever colour you pick.
  const layer = (color: number, scale: number, y: number): THREE.Group => {
    const l = new THREE.Group();
    // Drawn over everything: at an oblique camera a door on the far side of the building would
    // otherwise be hidden by the building itself, which is exactly when you most want to see it.
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.24 * scale, 0.02, 0.6 * scale), mat);
    shaft.position.set(0, y, 0.02);
    l.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.3 * scale, 0.5 * scale, 3), mat);
    head.rotation.x = Math.PI / 2; // lay the cone flat, tip along +Z
    head.position.set(0, y, 0.58 * scale);
    l.add(head);
    return l;
  };
  g.add(layer(0x14301a, 1.25, 0));
  g.add(layer(0xa8ffb4, 1, 0.012));
  g.renderOrder = 20;
  g.traverse((o) => { o.renderOrder = 20; });
  return g;
}

function buildingYaw(rot: number): number {
  return Math.PI - rot * (Math.PI / 2);
}

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


// Instanced-mesh capacity for villagers — sized for a busy Large map's population.
const CITIZEN_CAP = 1200;

/**
 * The village wardrobe. Each entry is one villager "look": a tunic, the coat worn over it when
 * the household has clothing, and a hair colour.
 *
 * A villager's look is picked by hashing their id, so it is stable for life — the child you
 * watched growing up is recognisably the same person as an adult, which is the point of having
 * variants at all. Adults and children draw from this same table; only their proportions differ.
 *
 * The tunic colours are muted earths and plant dyes on purpose. These are villagers who spin and
 * dye their own cloth, and a saturated palette at this scale reads as a scatter of confetti when
 * a hundred of them are on screen.
 */
interface Outfit {
  tunic: number;
  /** Hose/leggings. Always darker than the tunic — undyed or overdyed cloth got the hard wear. */
  legs: number;
  coat: number;
  hair: number;
}
const OUTFITS: Outfit[] = [
  { tunic: 0x8a6a45, legs: 0x4c3a24, coat: 0x5f4526, hair: 0x2b1d12 }, // undyed brown / dark oak
  { tunic: 0x6d7f5a, legs: 0x3d4433, coat: 0x47543a, hair: 0x5a3a20 }, // weld green / moss
  { tunic: 0x8a5a52, legs: 0x4a352f, coat: 0x5d3a33, hair: 0x8a6a3a }, // madder red / oxblood
  { tunic: 0x5b7188, legs: 0x37424e, coat: 0x3b4c5e, hair: 0x3a3a3a }, // woad blue / slate
  { tunic: 0xb0a184, legs: 0x6d6047, coat: 0x7d7057, hair: 0xa8834f }, // bleached linen / flax
  { tunic: 0x7a6288, legs: 0x453a52, coat: 0x50405c, hair: 0x4a3020 }, // logwood purple / plum
];
/** Skin tones, chosen by a second, independent hash so looks are not locked to one complexion. */
const SKIN_TONES = [0xf1c9a5, 0xe3b489, 0xc8925f, 0xa9714a, 0x855235];
/** A sick villager is tinted toward this regardless of their outfit, so illness stays readable. */
const SICK_TINT = 0xd24a4a;

/**
 * Deterministic small hash of a villager id. Two different salts give two independent choices
 * (outfit and skin) from the same id without correlating them.
 */
function lookIndex(id: number, salt: number, n: number): number {
  return (Math.imul(id ^ salt, 2654435761) >>> 8) % n;
}

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
  /**
   * One instanced layer per tree species, in manifest order. A tree picks its species from a hash
   * of its tile and index, so a wood mixes without anything being stored per tile — and because
   * the hash is stable, the same tree is the same species every frame and across a save.
   */
  private treeInsts: InstancedModel[] = [];
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
  /** Per-vertex snow cover, 0..1 — a permanent cap on the peaks plus whatever winter adds. */
  private terrSnow!: THREE.BufferAttribute;
  /** Per-vertex ground height, indexed by vertex row-major over the (w+1)x(h+1) grid. */
  private terrHeight: Float32Array = new Float32Array(0);
  private trees!: THREE.InstancedMesh;
  private treeTiles: number[] = [];
  private rocks!: THREE.InstancedMesh;
  private rockTiles: number[] = [];
  private ironNodes!: THREE.InstancedMesh;
  private ironTiles: number[] = [];
  private marks!: THREE.InstancedMesh;
  /** One instanced surface per path kind, so each can carry its own texture. */
  private pathLayers: Record<PathSurface, THREE.InstancedMesh> = {} as Record<PathSurface, THREE.InstancedMesh>;
  private portals!: THREE.InstancedMesh;
  private bores!: THREE.InstancedMesh;
  private citizens!: THREE.InstancedMesh;
  private hair!: THREE.InstancedMesh | null;
  /** Left and right leg, instanced separately so each can swing on its own transform. */
  private legs!: [THREE.InstancedMesh, THREE.InstancedMesh];
  private coats!: THREE.InstancedMesh | null;
  private water!: THREE.Mesh;
  private mountainH: Float32Array | null = null; // per-tile mountain block height (0 = not a mountain)

  // Per-building objects (box mesh or cloned model) + reused overlays.
  private buildingMeshes = new Map<number, THREE.Object3D>();
  private ghost!: THREE.Group;
  /** Ground arrow on the door tile of the pending building, pointing out from its front. */
  private faceArrow!: THREE.Group;
  /** Which building type (and footprint) the ghost currently holds a silhouette for. */
  private ghostKey = '';
  /** Hash of which tiles carry a finished tunnel — a change means the terrain must be recut. */
  private tunnelSig = 0;
  /** Per tile: how many tunnel tiles in from the nearest mouth, or -1 if not a finished tunnel. */
  private tunnelDepth: Int16Array | null = null;
  private selRing!: THREE.Mesh;
  private workRing!: THREE.Group; // ground circle (fill + outline) for a selected building's work radius
  private marquee!: THREE.Mesh;
  private boat!: THREE.Group; // merchant boat, shown while sailing to/from the dock
  /** True once the authored boat model has replaced the placeholder hull. */
  private boatModelled = false;

  // Cached signatures so we only rebuild a layer when its data changes.
  private sig = { land: -1, tree: -1, rock: -1, iron: -1, path: -1, mark: -1, bld: '' };
  /**
   * The scatter props (trees, loose stone, ore) are drawn only near the camera.
   *
   * Measured on a medium map: at the default zoom **27%** of forest tiles are on screen, and 9%
   * when zoomed in — the rest were being submitted every frame for a camera that could not see
   * them. `InstancedMesh` cannot cull per instance (its bounding volume covers the whole map, so
   * `frustumCulled` is off), which is why this is done by hand.
   *
   * A radius around the camera *target* rather than the view frustum, deliberately: it is
   * rotation-invariant, so turning the view costs nothing, and panning only rebuilds once the
   * camera has moved a whole cell. Sized to comfortably contain what the frustum can reach at a
   * given zoom — over-drawing a margin of trees is free, popping one in is not.
   */
  private viewCx = 0;
  private viewCz = 0;
  private viewR = 1e9;
  private viewKey = -1;
  private forestVer = -1; // last-seen GameState.forestVersion (rebuild trees when it changes)
  private lastState: GameState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.tier = detectTier();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // The framing stage cuts a half-built model off at the height the work has reached, with a
    // per-material clipping plane. Only materials that ask for one pay for this.
    this.renderer.localClippingEnabled = true;
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
    const rockGeo = new THREE.DodecahedronGeometry(0.20);
    this.rocks = new THREE.InstancedMesh(rockGeo, matte(0x9a9ca1), Math.max(1, this.rockTiles.length * rocksPerTile()));
    this.rocks.count = this.rockTiles.length * rocksPerTile();
    this.scene.add(this.rocks);

    // Surface iron ore: same hand-harvested deposit as loose stone, but rust-coloured and
    // slightly craggier so a player can tell the two apart at a glance from the play camera.
    this.ironTiles = [];
    for (let i = 0; i < s.tiles.length; i++) if ((s.tiles[i].iron ?? 0) > 0) this.ironTiles.push(i);
    const ironGeo = new THREE.OctahedronGeometry(0.22);
    const ironMat = matte(0xffffff, 0.7);
    // Iron is drawn from a primitive rather than an authored model, so it takes the ore texture
    // here instead of through the Blender pipeline the other props use.
    new THREE.TextureLoader().load(
      import.meta.env.BASE_URL + 'textures/mat_ore.png',
      (t) => { t.colorSpace = THREE.SRGBColorSpace; ironMat.map = t; ironMat.needsUpdate = true; },
      undefined,
      () => { ironMat.color.set(0x9c5f3a); ironMat.needsUpdate = true; },
    );
    this.ironNodes = new THREE.InstancedMesh(ironGeo, ironMat, Math.max(1, this.ironTiles.length * ironPerTile()));
    this.ironNodes.count = this.ironTiles.length * ironPerTile();
    this.ironNodes.castShadow = true;
    this.scene.add(this.ironNodes);

    // Paths: one instanced layer per surface, so each can carry its own texture.
    //
    // A tile is a full 1x1 quad with a hair of overlap — the old 0.96 quads left a bare strip of
    // ground between every pair, which is what made a road read as a dotted line of separate
    // squares rather than as one continuous surface.
    for (const [key, tex, tint] of [
      ['dirt', 'path_dirt', 0xffffff],
      ['stone', 'path_stone', 0xffffff],
      ['bridge', 'path_plank', 0xffffff],
      // A tunnel's floor is the same lining stone as its walls, kept dark: it is underground.
      ['tunnel', 'path_stone', 0x8d8f96],
    ] as [PathSurface, string, number][]) {
      const mat = matte(tint, 0.95);
      new THREE.TextureLoader().load(
        import.meta.env.BASE_URL + `textures/mat_${tex}.png`,
        (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; mat.map = t; mat.needsUpdate = true; },
        undefined,
        () => { /* untextured paths still show as coloured ground */ },
      );
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.06, 1.02), mat, MAP_W * MAP_H);
      m.count = 0;
      // Instanced layers whose instances change (paths drawn, tiles marked, villagers moving) must
      // skip frustum culling: Three culls the whole InstancedMesh by a bounding volume that doesn't
      // track live instance matrices, so a stale volume makes the layer pop in/out with the camera.
      m.frustumCulled = false;
      m.receiveShadow = this.tier === 'high';
      this.scene.add(m);
      this.pathLayers[key] = m;
    }
    // Tunnel portals: the timbered mouth where a tunnel meets open air. Drawn separately because
    // it is a standing structure, not a surface, and only the end tiles get one.
    const portalMat = matte(0x8a6a45, 0.9);
    new THREE.TextureLoader().load(
      import.meta.env.BASE_URL + 'textures/mat_timber.png',
      (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; portalMat.map = t; portalMat.needsUpdate = true; },
      undefined,
      () => { /* untextured timber still reads as timber by its colour */ },
    );
    this.portals = new THREE.InstancedMesh(portalGeometry(), portalMat, 256);
    this.portals.count = 0;
    this.portals.frustumCulled = false;
    this.portals.castShadow = this.tier === 'high';
    this.scene.add(this.portals);
    // Near-black and unlit-looking, so the opening reads as depth rather than as a dark wall.
    this.bores = new THREE.InstancedMesh(boreGeometry(), matte(0x0b0c0f, 1), 256);
    this.bores.count = 0;
    this.bores.frustumCulled = false;
    this.scene.add(this.bores);
    const flat2 = new THREE.BoxGeometry(1, 0.04, 1);
    const markMat = matte(0xffffff);
    markMat.transparent = true;
    markMat.opacity = 0.5;
    this.marks = new THREE.InstancedMesh(flat2, markMat, MAP_W * MAP_H);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.scene.add(this.marks);

    // Citizens: a figure assembled from separately-instanced body parts (see render/villager.ts).
    // Instancing is non-negotiable at these populations, and one instanced mesh carries only one
    // colour and one transform — which is why villagers were a tinted capsule. A mesh per part
    // gives each of them its own colour, and the legs their own transforms so they can walk.
    //
    // Variety comes from OUTFITS, indexed by a stable hash of the villager's id, so a child keeps
    // the same colouring when they grow up.
    const woolMat = matte(0xffffff, 0.92);
    this.loadVillagerTexture(woolMat, 2.2);
    this.citizens = new THREE.InstancedMesh(bodyGeometry(), woolMat, CITIZEN_CAP);
    this.citizens.count = 0;
    this.citizens.castShadow = this.tier === 'high';
    this.citizens.frustumCulled = false;
    this.scene.add(this.citizens);

    const mkLayer = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = false) => {
      const m = new THREE.InstancedMesh(geo, mat, CITIZEN_CAP);
      m.count = 0;
      m.castShadow = shadow;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    // Legs are drawn on every tier: without them a villager slides rather than walks, and that
    // reads worse than any amount of missing surface detail.
    // Only the torso casts a shadow. Each shadow-casting layer is a whole extra pass over the
    // light's depth map, and six of them measured 25% slower per frame with 400 villagers than
    // the two-capsule figure they replaced; the legs, head and coat sit inside the body's own
    // shadow at this scale anyway.
    const legMat = matte(0xffffff, 0.9);
    this.loadVillagerTexture(legMat, 2.6);
    this.legs = [mkLayer(legGeometry(), legMat), mkLayer(legGeometry(), legMat)];
    // Head and hands are drawn on every tier too — the body has a neck, and a headless villager
    // is not a graceful degradation.
    this.heads = mkLayer(skinGeometry(), matte(0xffffff, 0.72));
    // Coats are drawn on every tier: whether a household has warm clothing is information the
    // player acts on, not decoration, and it should not disappear on a weaker device. Its own
    // running count, because the coated villagers are an arbitrary subset — instance i in this
    // layer is not citizen i.
    const coatMat = matte(0xffffff, 0.94);
    this.loadVillagerTexture(coatMat, 1.7);
    this.coats = mkLayer(coatGeometry(), coatMat);
    // Hair is the one part that is purely cosmetic, so it is the one part the low tier drops.
    this.hair = this.tier === 'high' ? mkLayer(hairGeometry(), matte(0xffffff, 0.85)) : null;

    // Water plane just beneath the land surface — subdivided so it can ripple.
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f6f9a, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0.1,
    });
    // One vertex per WATER_SEG tiles, not per tile. The swell is two sine waves about ten tiles
    // long with an amplitude of 0.03, so a vertex every other tile still gives five samples per
    // wave — while a per-tile grid cost 41k triangles on a medium map and re-ran the ripple and
    // `computeVertexNormals` over 21k vertices on every single frame.
    const wsegX = Math.max(1, Math.round(MAP_W / WATER_SEG));
    const wsegY = Math.max(1, Math.round(MAP_H / WATER_SEG));
    const waterGeo = new THREE.PlaneGeometry(MAP_W, MAP_H, wsegX, wsegY);
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
    // The placement ghost is a container: `syncOverlays` swaps the actual building's silhouette
    // into it as the player changes what they are placing, so what you drag around the map is the
    // shape you are about to get rather than a featureless block.
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    // Which way is the front. Positioned in *world* space on the tile `entranceAt` picks, rather
    // than parented to the turned ghost — that way it can only ever point where villagers will
    // actually walk in, whatever convention the model happens to have been authored with.
    this.faceArrow = makeFaceArrow();
    this.faceArrow.visible = false;
    this.scene.add(this.faceArrow);
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

    this.sig = { land: -1, tree: -1, rock: -1, iron: -1, path: -1, mark: -1, bld: '' };
    this.tunnelSig = tunnelSignature(s);
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
    this.updateViewRegion(cam);
    this.applySeason(s, dt);
    this.trackSun(cam);
    // A finished tunnel lowers the rock it runs through, so the terrain mesh has to be rebuilt
    // when one appears or is demolished. Cheap to check and rare to fire.
    const tsig = tunnelSignature(s);
    if (tsig !== this.tunnelSig) {
      this.tunnelSig = tsig;
      this.terrain.geometry.dispose();
      this.terrain.geometry = this.makeTerrainGeometry(s);
      this.sig.land = -1; // force the colour pass to re-run over the new vertices
    }
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

  /**
   * Recompute which patch of map the scatter props are drawn over.
   *
   * Both the centre and the radius are quantised, so drifting the camera a few tiles or nudging
   * the zoom does not rebuild anything; `viewKey` changes only when the region really moves, and
   * the sync passes fold it into their signatures to know when to redraw.
   */
  private updateViewRegion(cam: Camera3D): void {
    const CELL = 6; // tiles of camera movement before the region is recut
    const cx = Math.round(cam.target.x / CELL) * CELL;
    const cz = Math.round(cam.target.z / CELL) * CELL;
    // How far the frustum reaches across the ground, measured rather than guessed: sweeping the
    // ground plane at every zoom and yaw, the furthest on-screen point sits at almost exactly
    // 1.7x the camera distance (8 tiles out at distance 7, 144 at distance 85). The +8 covers
    // the centre's own quantisation, and the radius rounds *up* to the cell so that rounding can
    // only ever add margin. An earlier 1.5x guess fitted the middle of the range and cut 33
    // on-screen tiles at full zoom-out.
    const r = Math.ceil((cam.distance * 1.7 + 8) / CELL) * CELL;
    this.viewCx = cx;
    this.viewCz = cz;
    this.viewR = r;
    this.viewKey = (cx * 73856093) ^ (cz * 19349663) ^ (r * 83492791);
  }

  /** Is this tile inside the patch the scatter props are drawn over? */
  private inView(tx: number, tz: number): boolean {
    const dx = tx - this.viewCx;
    const dz = tz - this.viewCz;
    return dx * dx + dz * dz <= this.viewR * this.viewR;
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
  private tileHeight(t: Tile, i: number, s?: GameState): number {
    if (t.type === 'water') return WATER_BED_H;
    if (t.type === 'stone') {
      // A tunnel is a bore, not a cutting: the rock over it stays. Only the first two tiles at
      // each end are excavated, which carves the approach the portal stands in — the mountain
      // itself then rises straight off the back of that recess, so the road visibly runs into the
      // hillside and stops. (Mountains here are a smooth heightfield with no vertical faces, so
      // without this recess there is nowhere for a mouth to be; with it, there is.)
      if (s && s.paths[i] === PATH_TUNNEL && this.tunnelDepth && this.tunnelDepth[i] >= 0 &&
          this.tunnelDepth[i] < TUNNEL_MOUTH_TILES) {
        return FOOTHILL_H;
      }
      return this.mountainH ? this.mountainH[i] : MOUNTAIN_BASE_H;
    }
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
    this.tunnelDepth = tunnelMouthDepth(s); // the heights below depend on it
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
        dryH[i] = t.type === 'water' ? LAND_H : this.tileHeight(t, i, s);
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
    // Snow is its own attribute rather than part of the vertex colour: vertex colour *multiplies*
    // the surface texture, so it can only ever darken it — lerping white toward white did nothing,
    // which is why capped peaks never actually looked capped. This rides through to the fragment
    // and replaces the sampled colour instead.
    this.terrSnow = new THREE.BufferAttribute(new Float32Array(pos.count), 1);
    geo.setAttribute('aSnow', this.terrSnow);
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
      shader.vertexShader =
        `attribute vec4 aSurf;\nattribute float aSnow;\nvarying vec4 vSurf;\nvarying float vSnow;\nvarying vec2 vGroundUv;\n` +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vSurf = aSurf;
        vSnow = aSnow;
        vGroundUv = position.xz;`,
      );
      shader.fragmentShader =
        `uniform sampler2D uGrass;\nuniform sampler2D uDirt;\nuniform sampler2D uRock;\nuniform sampler2D uSand;\nuniform float uTexScale;\nvarying vec4 vSurf;\nvarying float vSnow;\nvarying vec2 vGroundUv;\n` +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec2 gUv = vGroundUv * uTexScale;
        vec4 w = vSurf / max(0.001, vSurf.x + vSurf.y + vSurf.z + vSurf.w);
        // Rock covers whole mountain ranges at a stretch, so a single tiling sample reads as a
        // grid the moment you look at a peak. Sample it twice — once at the base scale, once
        // larger and turned off-axis — and cross-fade between them on a slow, non-repeating
        // wave. Choosing mostly one or the other (rather than averaging the two) keeps the
        // contrast that makes it look like rock instead of grey mush.
        vec2 rockA = gUv;
        vec2 rockB = mat2(0.8, -0.6, 0.6, 0.8) * gUv * 0.41;
        float rockMix = 0.5 + 0.5 * sin(gUv.x * 0.21 + sin(gUv.y * 0.17) * 2.3);
        vec4 rock = mix(texture2D(uRock, rockA), texture2D(uRock, rockB), rockMix);
        vec4 blended =
          texture2D(uGrass, gUv) * w.x +
          texture2D(uDirt, gUv) * w.y +
          rock * w.z +
          texture2D(uSand, gUv) * w.w;
        diffuseColor *= blended;
        // Snow lies *over* the surface rather than tinting it, with a little of the rock's own
        // shading showing through so a cap still reads as lying on rough ground.
        vec3 snowRgb = vec3(0.95, 0.965, 0.99) * (0.88 + 0.12 * blended.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, snowRgb, clamp(vSnow, 0.0, 1.0));`,
      );
      // One normal map serves the whole ground, and it is derived from the *grass* texture. On
      // flat fields that is fine; on a mountainside it stamps grass-shaped relief over stone and
      // lights it from every angle at once, which is most of what makes a peak look busy. Fade
      // the perturbation out as rock takes over and let the mesh's own shape do the work.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, clamp(w.z, 0.0, 1.0) * 0.85));`,
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
    const snowAmt = this.terrSnow.array as Float32Array;
    for (let k = 0; k < this.terrHeight.length; k++) {
      const h = this.terrHeight[k];
      const vx = k % vw;
      const vy = (k / vw) | 0;
      // Cheap per-vertex hash, used twice below: to ripple the snowline and to vary brightness.
      const jitter = (((vx * 73856093) ^ (vy * 19349663)) % 100) / 100;
      this.color.setRGB(1, 1, 1);
      // Permanent snow cap. The line wanders by a third of a tile of height from vertex to vertex
      // so the cap has a ragged edge rather than sitting on a perfect contour ring, and it reaches
      // full white by SNOWCAP_FULL_H — which is where real peaks top out, not the theoretical
      // ceiling. Ramping to a ceiling the terrain never reaches was why big mountains came out
      // grey with a faint pale tip instead of capped.
      const line = SNOWLINE_H + (jitter - 0.5) * 0.7;
      const cap = h > line ? Math.min(1, (h - line) / Math.max(0.5, SNOWCAP_FULL_H - line)) : 0;
      // Winter lies on everything; the cap is what survives the rest of the year.
      const winter = snow > 0.001 ? snow * (h > FOOTHILL_H ? 0.55 : 0.85) : 0;
      snowAmt[k] = Math.max(cap, winter);
      // A touch of per-vertex brightness variation so broad fields are not one flat value.
      this.color.multiplyScalar(0.93 + jitter * 0.07);
      colors[k * 3] = this.color.r;
      colors[k * 3 + 1] = this.color.g;
      colors[k * 3 + 2] = this.color.b;
    }
    this.terrain.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrSnow.needsUpdate = true;
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
    this.trees.count = this.treeInsts.length > 0 ? 0 : this.treeTiles.length * treesPerTile();
    this.trees.castShadow = true;
    this.scene.add(this.trees);
    // Rebuild the model instances at the new capacity if models are in use. Each species is sized
    // for the whole forest: the mix is by hash, so any one of them could in principle draw most of
    // it, and an under-sized layer would silently drop trees.
    if (this.treeInsts.length > 0) this.buildTreeInstances(cap);
    this.forestVer = s.forestVersion ?? 0;
    this.sig.tree = -4; // force a redraw of the new tile set
  }

  /**
   * (Re)build one instanced layer per tree species at the given capacity.
   *
   * Every species is sized for the whole forest rather than its expected share: the mix is by
   * hash, and on a small wood it could easily deal one species most of the tiles. An under-sized
   * layer would silently stop drawing past its capacity, which reads as trees flickering out.
   */
  private buildTreeInstances(cap: number): void {
    for (const t of this.treeInsts) t.dispose(this.scene);
    this.treeInsts = [];
    for (const tpl of this.models.allTrees()) {
      const inst = new InstancedModel(tpl, cap);
      inst.addTo(this.scene);
      this.treeInsts.push(inst);
    }
  }

  private syncTrees(s: GameState): void {
    if ((s.forestVersion ?? 0) !== this.forestVer) this.rebuildTreeLayer(s);
    // Upgrade to models the first frame every species is available, so the mix is built in a
    // stable order and a late arrival cannot reshuffle a forest mid-game. Until then the cone
    // fallback stands in.
    if (this.treeInsts.length === 0 && this.models.treesReady()) {
      this.buildTreeInstances(this.treeTiles.length * treesPerTile() || 1);
      this.trees.count = 0;
      this.sig.tree = -3;
    }
    let sig = this.viewKey;
    for (const i of this.treeTiles) sig = (sig + (s.tiles[i].type === 'forest' ? Math.round(s.tiles[i].trees * 8) + 1 : 0) * (i + 1)) % 2147483647;
    if (sig === this.sig.tree) return;
    this.sig.tree = sig;
    let k = 0;
    // Each species layer packs its own instances from 0, so they need a write cursor apiece.
    const spCount = new Array(this.treeInsts.length).fill(0) as number[];
    for (const i of this.treeTiles) {
      const t = s.tiles[i];
      if (!this.inView(i % MAP_W, (i / MAP_W) | 0)) continue;
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
        if (this.treeInsts.length > 0) {
          const sc = live ? (0.7 + t.trees * 0.8) * TREE_MODEL_SIZE * vary : 0.0001;
          this.dummy.position.set(tx, gy, tz);
          this.dummy.scale.set(sc, sc, sc);
          this.dummy.rotation.set(0, this.tileRand(i, salt + 0x43) * 6.283, 0);
          this.dummy.updateMatrix();
          // Which species this tree is. A separate salt from the position jitter, so moving a
          // tree within its tile never changes what kind of tree it is.
          const sp = Math.floor(this.tileRand(i, salt + 0x77) * this.treeInsts.length) % this.treeInsts.length;
          this.treeInsts[sp].setAt(spCount[sp]++, this.dummy.matrix);
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
    if (this.treeInsts.length > 0) {
      for (let sp = 0; sp < this.treeInsts.length; sp++) {
        this.treeInsts[sp].setCount(spCount[sp]); // only what was written — the rest is out of view
        this.treeInsts[sp].update();
      }
    } else {
      this.trees.count = k;
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
    // Gated like the trees and the stone. This used to rewrite every ore matrix and re-upload the
    // whole instance buffer on every frame, for a layer that only changes when a deposit is dug
    // out or the camera moves.
    let sig = this.viewKey;
    for (const i of this.ironTiles) sig = (sig + ((s.tiles[i].iron ?? 0) > 0 ? 1 : 0) * (i + 1)) % 2147483647;
    if (sig === this.sig.iron) return;
    this.sig.iron = sig;
    let k = 0;
    for (const i of this.ironTiles) {
      if (!this.inView(i % MAP_W, (i / MAP_W) | 0)) continue;
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
    this.ironNodes.count = k;
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
    let sig = this.viewKey;
    for (const i of this.rockTiles) sig = (sig + ((s.tiles[i].stone ?? 0) > 0 ? 1 : 0) * (i + 1)) % 2147483647;
    if (sig === this.sig.rock) return;
    this.sig.rock = sig;
    let k = 0;
    for (const i of this.rockTiles) {
      if (!this.inView(i % MAP_W, (i / MAP_W) | 0)) continue;
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
      this.rockInst.setCount(k);
      this.rockInst.update();
    } else {
      this.rocks.count = k;
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

    const n: Record<PathSurface, number> = { dirt: 0, stone: 0, bridge: 0, tunnel: 0 };
    let portals = 0;
    const built = (v: number) => v === PATH_DIRT || v === PATH_STONE || v === PATH_BRIDGE || v === PATH_TUNNEL;
    for (let i = 0; i < s.paths.length; i++) {
      const v = s.paths[i];
      if (!v) continue;
      const x = i % MAP_W;
      const z = (i / MAP_W) | 0;
      let surf: PathSurface;
      let y: number;
      if (v === PATH_BRIDGE || v === PATH_BRIDGE_PLAN) {
        surf = 'bridge';
        y = 0.14 + 0.03; // decking sits just over the water plane
      } else if (v === PATH_TUNNEL || v === PATH_TUNNEL_PLAN) {
        surf = 'tunnel';
        // A planned tunnel has to be visible while it is still solid rock, so its marker rides on
        // the mountain surface. A finished one is a floor at ground level, inside the hill — which
        // is exactly where a villager walking through it should be.
        y = v === PATH_TUNNEL ? FOOTHILL_H + 0.03 : this.groundAt(x + 0.5, z + 0.5) + 0.05;
        // Deep tiles are inside solid rock — their roadway would never be seen, and drawing it
        // only risks poking through the mountain on a steep slope.
        if (v === PATH_TUNNEL && this.tunnelDepth && this.tunnelDepth[i] >= TUNNEL_MOUTH_TILES) continue;
      } else {
        surf = v === PATH_STONE || v === PATH_STONE_PLAN ? 'stone' : 'dirt';
        y = TOP + 0.03;
      }
      const layer = this.pathLayers[surf];
      const k = n[surf]++;
      this.dummy.position.set(x + 0.5, y, z + 0.5);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      layer.setMatrixAt(k, this.dummy.matrix);
      // Planned-but-unlaid tiles go green — the same "this is going here" signal the placement
      // ghost uses, and far easier to pick out against dirt and rock than a dimmed version of the
      // finished surface was.
      // A wash rather than a flat fill: the surface's own texture still shows through, so a
      // planned road reads as "this road, not yet laid" instead of as a green tile.
      layer.setColorAt(k, built(v) ? this.color.set(0xffffff) : this.color.set(PLAN_TINT));

      // A finished tunnel gets a timbered portal wherever it opens onto something that is not
      // more tunnel — the only part of it visible from outside the mountain.
      if (v === PATH_TUNNEL && portals < 256) {
        // Rotating by yaw about Y sends local +Z to world (sin yaw, cos yaw), and the geometry is
        // built with +Z pointing out of the hillside — so yaw must map +Z onto (dx, dz), the
        // direction of the open ground. The table was previously off by a half turn, which built
        // every portal back to front: the gallery ran into the rock and the dark bore hung out in
        // the open air. Symmetrical arches hid it; a mineshaft adit does not.
        for (const [dx, dz, yaw] of [[1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, 1, 0], [0, -1, Math.PI]] as const) {
          if (portals >= 256) break;
          const nx = x + dx;
          const nz = z + dz;
          if (!inBounds(nx, nz)) continue;
          // A mouth is the *end of the bore*, facing along it: open ground ahead, and the tunnel
          // itself continuing behind. The axis has to come from the tunnel tiles, not from the
          // rock — testing "rock behind" put a portal on every exposed flank, so a tunnel through
          // a narrow or diagonal range grew a row of them along its side instead of one at each
          // end. A single-tile bore has nothing behind it, so it is a mouth both ways.
          if (s.tiles[tileIndex(nx, nz)].type === 'stone') continue;
          const bx = x - dx;
          const bz = z - dz;
          const behindIsTunnel = inBounds(bx, bz) && s.paths[tileIndex(bx, bz)] === PATH_TUNNEL;
          if (!behindIsTunnel && !isLoneTunnel(s, x, z)) continue;
          // Anchored on the outer edge of the tile and turned to face out of the hillside, so the
          // approach walls run back along the excavated tiles behind it.
          // Sit it on the lower of the recess floor and the ground just outside, so a mouth that
          // opens onto a riverbank or a falling slope does not leave the portal hanging in air.
          const outside = Math.min(FOOTHILL_H, this.groundAt(nx + 0.5, nz + 0.5));
          // Anchored on the rock face — the edge of the mouth tile that meets open ground. The
          // gallery then stands a tile proud of it and the timbering runs back through the
          // excavated approach behind.
          this.dummy.position.set(x + 0.5 + dx * 0.5, outside, z + 0.5 + dz * 0.5);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.rotation.set(0, yaw, 0);
          this.dummy.updateMatrix();
          this.portals.setMatrixAt(portals, this.dummy.matrix);
          this.bores.setMatrixAt(portals, this.dummy.matrix);
          portals++;
        }
      }
    }
    for (const key of ['dirt', 'stone', 'bridge', 'tunnel'] as PathSurface[]) {
      const layer = this.pathLayers[key];
      layer.count = n[key];
      layer.instanceMatrix.needsUpdate = true;
      if (layer.instanceColor) layer.instanceColor.needsUpdate = true;
    }
    this.portals.count = portals;
    this.portals.instanceMatrix.needsUpdate = true;
    this.bores.count = portals;
    this.bores.instanceMatrix.needsUpdate = true;
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
    for (const b of s.buildings) {
      // The frame's height is quantised into steps: it has to move as the work goes on, but not
      // rebuild this whole pass on every frame of a build.
      const stage = buildStage(b);
      const step = stage === 'framing' ? Math.round(framedFraction(b) * 12) : 0;
      // `demolish` is in the signature as well as the stage: a building that has been marked but
      // not started on looks exactly like one that has not, and the mark is what the player wants
      // to see. `type` too — an upgrade changes it in place, on the same building id.
      sig += b.id + ':' + b.type + ':' + stage + ':' + step + ':' + (b.fireTimer ? 1 : 0) +
        ':' + (b.demolish ? 1 : 0) + ':' + (b.rot ?? 0) + ';';
    }
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
      const fw = footprintW(b);
      const fh = footprintH(b);
      const stage = buildStage(b);
      // A ranch is a variable-size pen (model-less); everything else uses its model or a box.
      // Ranch and field are always drawn as fenced plots, never a model.
      const hasModel = b.type !== 'ranch' && b.type !== 'farm' && !!this.models.buildingClone(b.type);
      // What this building is drawn *as* right now. Groundworks first, then the model rising out
      // of them, then the building. Plots and box fallbacks have no frame stage — there is no
      // model to raise — so they go from site straight to finished.
      const kind = stage === 'site' ? 'site'
        : !hasModel ? 'plot'
        : stage === 'framing' ? 'frame'
        : 'model';
      let obj = this.buildingMeshes.get(b.id);
      if (!obj || obj.userData.kind !== kind) {
        if (obj) {
          this.disposeBuilding(obj);
          this.buildingMeshes.delete(b.id);
        }
        obj = kind === 'site' ? this.makeBuildingSite(fw, fh)
          : kind === 'frame' ? this.makeBuildingFrame(b.type, fw, fh)
          : kind === 'model' ? this.makeBuildingModel(b.type)
          : this.makeBuildingBox(b);
        obj.userData.kind = kind;
        obj.position.set(b.x + fw / 2, TOP, b.y + fh / 2);
        // A model is authored facing south; turning it is what puts its door on the face the
        // simulation is routing villagers to. The site pad, the box fallback and the fenced plot
        // are all built at the rotated size already, so only the model and the frame turn.
        if (kind === 'model' || kind === 'frame') obj.rotation.y = buildingYaw(b.rot ?? 0);
        this.enableShadows(obj);
        this.buildingMeshes.set(b.id, obj);
        this.scene.add(obj);
      }
      if (kind === 'frame') this.updateFrameClip(obj, framedFraction(b));
      // A condemned building glows the same way a burning one does, in a colder colour: whatever
      // is standing there is coming down, and that has to read from across the map.
      this.styleBuilding(obj, b.type, !!b.fireTimer, !!b.demolish);
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

  /**
   * A building site: the ground opened up, stone footings laid round the edge, corner stakes and
   * the materials waiting to go into it.
   *
   * Procedural from the footprint rather than an authored model per building, because what a site
   * looks like barely depends on what is going up on it — and 23 buildings x 2 extra stages is a
   * lot of Blender for a stage that lasts a few seconds.
   */
  private makeBuildingSite(fw: number, fh: number): THREE.Object3D {
    const group = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      group.add(m);
      return m;
    };
    const soil = new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 1 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x8e8d86, roughness: 0.95 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x7a5535, roughness: 0.9 });

    // Turned earth across the plot, a little proud of the terrain so it has an edge.
    add(new THREE.BoxGeometry(fw - 0.1, 0.09, fh - 0.1), soil, 0, 0.045, 0);
    // Footing courses round the perimeter — the outline of what is coming.
    const fh1 = 0.22;
    const t = 0.26;
    add(new THREE.BoxGeometry(fw - 0.1, fh1, t), stone, 0, fh1 / 2, -fh / 2 + t / 2 + 0.05);
    add(new THREE.BoxGeometry(fw - 0.1, fh1, t), stone, 0, fh1 / 2, fh / 2 - t / 2 - 0.05);
    add(new THREE.BoxGeometry(t, fh1, fh - 0.1 - t * 2), stone, -fw / 2 + t / 2 + 0.05, fh1 / 2, 0);
    add(new THREE.BoxGeometry(t, fh1, fh - 0.1 - t * 2), stone, fw / 2 - t / 2 - 0.05, fh1 / 2, 0);
    // Corner stakes, so the plot reads as pegged out even on a big footprint.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(new THREE.BoxGeometry(0.1, 0.62, 0.1), timber,
          sx * (fw / 2 - 0.18), 0.31, sz * (fh / 2 - 0.18));
      }
    }
    // Materials stacked on the pad, scaled so a big plot does not look under-supplied.
    const piles = Math.max(1, Math.min(4, Math.round(Math.min(fw, fh) / 1.6)));
    for (let i = 0; i < piles; i++) {
      const px = (i - (piles - 1) / 2) * 0.8;
      add(new THREE.BoxGeometry(0.5, 0.2, 0.42), timber, px, 0.19, fh / 2 - 0.75);
      add(new THREE.BoxGeometry(0.42, 0.16, 0.36), stone, px * 0.7, 0.17, -fh / 2 + 0.8);
    }
    group.userData.model = false;
    group.userData.site = true; // styleBuilding leaves the site's own earth/stone colours alone
    return group;
  }

  private makeBuildingModel(type: BuildingType): THREE.Object3D {
    const def = BUILDING_DEFS[type];
    const clone = this.models.buildingClone(type)!; // longest footprint axis normalized to 1
    // Scale by the *longer* side of the plot. Models are authored to their building's footprint
    // aspect, so this fills the plot; using the shorter side left every non-square building
    // (the 3×2 dock and market, the 3×6 quarry) sitting in a plot two-thirds empty.
    const k = Math.max(def.w, def.h) * 0.95;
    clone.scale.multiplyScalar(k);
    // `Object3D.clone()` copies the tree but *shares* materials with the template, and
    // `styleBuilding` writes to them: it sets `transparent`/`opacity`/`depthWrite` per building
    // to tell a finished one from a site. Shared, that means the last building of a type styled
    // in the loop decides how every one of them looks — so a single house under construction
    // rendered every finished house as glass too. Each building gets its own materials.
    // Geometry stays shared: nothing writes to it, and it is the expensive half.
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      m.material = Array.isArray(m.material)
        ? m.material.map((x) => x.clone())
        : (m.material as THREE.Material).clone();
      m.userData.sharedGeo = true; // geometry belongs to the loader's template, not to us
    });
    clone.userData.model = true;
    // How tall this building stands once placed — `normalize` measured it with the footprint at
    // 1, so it scales with the plot the same way the model does. The frame stage clips against it.
    clone.userData.worldHeight = ((clone.userData.height as number) ?? 1) * k;
    return clone;
  }

  /**
   * A building part-way up: the real model, cut off at the height the work has reached, standing
   * in a cage of scaffold poles.
   *
   * Clipping rather than a separate half-built model, so every building gets the stage for free
   * and the shape you watch rising is the shape you end up with. The cut faces are drawn
   * double-sided — a one-sided wall sliced across reads as a hole in the building, not as a wall
   * that has not been finished.
   */
  private makeBuildingFrame(type: BuildingType, fw: number, fh: number): THREE.Object3D {
    const group = new THREE.Group();
    const model = this.makeBuildingModel(type);
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        mat.clippingPlanes = [plane];
        mat.clipShadows = true;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      }
    });
    group.add(model);

    // Scaffolding: uprights at the corners with a rail round them, tall enough to stand above
    // the cut so the building reads as still being worked on rather than simply short.
    const pole = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.95 });
    const poleH = 1.0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, poleH, 0.09), pole);
        p.position.set(sx * (fw / 2 - 0.22), poleH / 2, sz * (fh / 2 - 0.22));
        group.add(p);
      }
    }
    group.userData.model = true; // keep the model's own textures through styleBuilding
    group.userData.frame = { plane, height: (model.userData.worldHeight as number) ?? 1 };
    return group;
  }

  /** Raise the frame's cut to wherever the work has got to (0..1 of the finished height). */
  private updateFrameClip(obj: THREE.Object3D, frac: number): void {
    const f = obj.userData.frame as { plane: THREE.Plane; height: number } | undefined;
    if (!f) return;
    // Never nothing and never quite everything: at the start there is a course of walling to see,
    // and at the end the roof is still visibly missing until the build actually completes.
    const cut = 0.18 + 0.74 * frac;
    f.plane.constant = obj.position.y + f.height * cut;
    // The scaffold keeps pace with the walls, always a little above them. The poles are unit-tall
    // and centred on their own middle, so growing one means moving it up by half as much again —
    // scaling alone would sink it through the ground.
    const poleH = Math.max(0.6, f.height * cut + 0.35);
    for (const child of obj.children) {
      if (!(child as THREE.Mesh).isMesh) continue; // the model itself is a Group
      child.scale.y = poleH;
      child.position.y = poleH / 2;
    }
  }

  /**
   * Apply the flat colour (box fallbacks only) and the burning tint.
   *
   * Nothing standing on the map is drawn see-through any more. A site under construction used to
   * be the finished building's silhouette in glass, which is what made a half-built village look
   * like a village of ghosts — and, while materials were shared between buildings of a type, made
   * the *finished* ones look like ghosts too. Construction now has its own three looks
   * (`makeBuildingSite`, `makeBuildingFrame`, then the model), and the glass silhouette is kept
   * for the placement preview alone, where see-through is the honest reading: it is not there yet.
   */
  private styleBuilding(
    obj: THREE.Object3D,
    type: BuildingType,
    fire: boolean,
    condemned = false,
  ): void {
    const isModel = !!obj.userData.model;
    const ownColours = !!obj.userData.ranch || !!obj.userData.site; // pen and site keep their own
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat || Array.isArray(mat)) return;
      // Box meshes get the flat building color; model meshes keep their own textures/colors.
      if (!isModel && !ownColours && mat.color) mat.color.set(BUILDING_COLORS[type]);
      mat.emissive?.set(fire ? 0x812c10 : condemned ? 0x4a1410 : 0x000000);
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.needsUpdate = true;
    });
  }

  private disposeBuilding(obj: THREE.Object3D): void {
    this.scene.remove(obj);
    // A model building shares its geometry with the loader's template — releasing that on
    // demolition would pull the mesh out from under every other building of the same type, and
    // out of the template every future one is cloned from. Its materials are its own (see
    // `makeBuildingModel`) and do need releasing. A box or a fenced plot owns both.
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      // Marked per mesh rather than per building: a frame group mixes the template's geometry
      // (shared, never ours to release) with its own scaffold poles (ours).
      if (!m.userData.sharedGeo) m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  // ---- citizens ----
  /**
   * Which households have warm clothing in store, rebuilt each frame.
   *
   * Cheaper than it looks — a house is one map entry, and this is a few hundred at most, against
   * the thousand-odd villagers that would each otherwise scan the building list.
   */
  private clothedHomes(s: GameState): Set<number> {
    const out = new Set<number>();
    for (const b of s.buildings) {
      if (b.built && isHouse(b.type) && (b.store['clothing'] ?? 0) > 0) out.add(b.id);
    }
    return out;
  }

  private syncCitizens(s: GameState, now: number): void {
    const cap = (this.citizens.instanceMatrix.array.length / 16) | 0;
    const n = Math.min(s.citizens.length, cap);
    const warmHomes = this.coats ? this.clothedHomes(s) : null;
    let coated = 0;
    for (let i = 0; i < n; i++) {
      const c = s.citizens[i];
      const child = c.age < ADULT_AGE;
      // A villager working an indoor trade is *in* the workshop, so nothing is drawn for them.
      // Scaled away rather than skipped: every layer below indexes by `i`, and leaving the slot
      // out would shift everyone after them onto the wrong body.
      const sc = c.inside ? 0.0001 : child ? 0.62 : 1;
      const fit = OUTFITS[lookIndex(c.id, 0x9e3779b9, OUTFITS.length)];
      const moving = Math.abs(c.tx - c.x) + Math.abs(c.ty - c.y) > 0.03;
      // A small rise and fall on each stride, in step with the legs below (hence the doubled
      // frequency — the body bobs once per footfall, the legs swing once per full cycle).
      const stride = now * 5.2 + c.id;
      const bob = moving ? Math.abs(Math.sin(stride)) * 0.022 : 0;
      const yaw = moving ? Math.atan2(c.tx - c.x, c.ty - c.y) : 0;
      const y0 = TOP + bob;

      // Everything above the hips shares one transform; only the legs move independently.
      this.dummy.position.set(c.x, y0, c.y);
      this.dummy.scale.set(sc, sc, sc);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.updateMatrix();
      this.citizens.setMatrixAt(i, this.dummy.matrix);
      this.citizens.setColorAt(i, this.color.set(c.sick ? SICK_TINT : fit.tunic));

      // Legs swing about the hip, a half cycle out of phase with each other.
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      for (let k = 0; k < 2; k++) {
        const swing = moving ? Math.sin(stride + k * Math.PI) * 0.42 : 0;
        const dx = (k === 0 ? -LEG_X : LEG_X) * sc;
        this.dummy.position.set(c.x + dx * cos, y0 + HIP_Y * sc, c.y - dx * sin);
        this.dummy.scale.set(sc, sc, sc);
        // YXZ so the yaw is applied first and the swing then happens in the villager's own
        // forward plane — with the default XYZ order a turned villager kicks sideways.
        this.dummy.rotation.set(swing, yaw, 0, 'YXZ');
        this.dummy.updateMatrix();
        this.legs[k].setMatrixAt(i, this.dummy.matrix);
        this.legs[k].setColorAt(i, this.color.set(c.sick ? SICK_TINT : fit.legs));
      }
      this.dummy.rotation.order = 'XYZ'; // restore the default for every other user of the dummy

      // Children get a proportionally larger head, which is most of what makes a scaled-down
      // adult read as a child rather than as a distant one.
      const headScale = sc * (child ? 1.22 : 1);
      // The head geometry is authored at its true height, so scaling it up for a child would also
      // lift it off the neck — position it explicitly and let the scale act about that point.
      const headY = y0 + HEAD_Y * sc;
      if (this.heads) {
        this.dummy.position.set(c.x, headY - HEAD_Y * headScale, c.y);
        this.dummy.scale.set(headScale, headScale, headScale);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.updateMatrix();
        this.heads.setMatrixAt(i, this.dummy.matrix);
        this.heads.setColorAt(i, this.color.set(SKIN_TONES[lookIndex(c.id, 0x85ebca6b, SKIN_TONES.length)]));
      }
      if (this.hair) {
        this.dummy.position.set(c.x, headY - HEAD_Y * headScale, c.y);
        this.dummy.scale.set(headScale, headScale, headScale);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.updateMatrix();
        this.hair.setMatrixAt(i, this.dummy.matrix);
        this.hair.setColorAt(i, this.color.set(fit.hair));
      }
      // The coat is the visible answer to "does this household have clothing?". A villager with
      // no home at all (a newcomer yet to be housed) has nowhere to keep a coat, so goes without.
      if (this.coats && warmHomes && c.homeId !== null && warmHomes.has(c.homeId)) {
        this.dummy.position.set(c.x, y0, c.y);
        this.dummy.scale.set(sc, sc, sc);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.updateMatrix();
        this.coats.setMatrixAt(coated, this.dummy.matrix);
        this.coats.setColorAt(coated, this.color.set(c.sick ? SICK_TINT : fit.coat));
        coated++;
      }
    }
    this.citizens.count = n;
    this.citizens.instanceMatrix.needsUpdate = true;
    if (this.citizens.instanceColor) this.citizens.instanceColor.needsUpdate = true;
    for (const layer of [this.heads, this.hair, this.legs[0], this.legs[1]] as (THREE.InstancedMesh | null)[]) {
      if (!layer) continue;
      layer.count = n;
      layer.instanceMatrix.needsUpdate = true;
      if (layer.instanceColor) layer.instanceColor.needsUpdate = true;
    }
    if (this.coats) {
      this.coats.count = coated;
      this.coats.instanceMatrix.needsUpdate = true;
      if (this.coats.instanceColor) this.coats.instanceColor.needsUpdate = true;
    }
  }

  /**
   * How many villagers are currently drawn wearing a coat.
   *
   * Exposed for tests: the coat is the visible answer to "does this household hold clothing?",
   * and that link between simulation state and what is on screen is worth pinning down.
   */
  coatedCount(): number {
    return this.coats ? this.coats.count : 0;
  }

  /**
   * Put the woven-wool map on a villager garment material.
   *
   * Best-effort like the other runtime textures: if it fails to load the material keeps its flat
   * per-instance colour, so villagers never vanish over a missing file. `repeat` is in texture
   * units across the whole garment — the tunic takes more repeats than the coat so the weave
   * stays the same physical size on both.
   */
  private loadVillagerTexture(mat: THREE.MeshStandardMaterial, repeat: number): void {
    new THREE.TextureLoader().load(
      import.meta.env.BASE_URL + 'textures/mat_wool.png',
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        mat.map = t;
        mat.needsUpdate = true;
      },
      undefined,
      () => {
        /* no weave — the instance colour alone still reads as a clothed villager */
      },
    );
  }

  // ---- overlays (placement ghost, selection ring, marquee) ----
  private syncOverlays(s: GameState, pv: PlacementView): void {
    if (pv.type) {
      const def = BUILDING_DEFS[pv.type];
      const pw = pv.pw ?? def.w;
      const ph = pv.ph ?? def.h;
      const rot = pv.prot ?? 0;
      const key = `${pv.type}:${pw}x${ph}`;
      if (key !== this.ghostKey) {
        this.ghostKey = key;
        for (const child of [...this.ghost.children]) {
          this.ghost.remove(child);
          disposeTree(child);
        }
        this.ghost.add(this.makeGhostShape(pv.type, pw, ph));
      }
      this.ghost.visible = true;
      // The silhouette is built unturned, so turning the group is what makes its extent match the
      // rotated footprint the placement check is using.
      this.ghost.rotation.y = buildingYaw(rot);
      const fw = rot % 2 === 1 ? ph : pw;
      const fh = rot % 2 === 1 ? pw : ph;
      this.ghost.position.set(pv.tx + fw / 2, TOP, pv.ty + fh / 2);
      // The arrow sits on the door tile and points away from the building, so the silhouette
      // reads as having a front rather than being a symmetrical lump.
      const door = entranceAt(pv.tx, pv.ty, fw, fh, rot);
      this.faceArrow.visible = true;
      this.faceArrow.position.set(door.x + 0.5, TOP + 0.05, door.y + 0.5);
      this.faceArrow.rotation.y = -rot * (Math.PI / 2);
      // Green means it will go here, red means it will not. The tint is applied over the
      // silhouette rather than replacing it, so the building stays recognisable either way.
      this.ghost.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && !Array.isArray(m) && m.emissive) m.emissive.set(pv.valid ? 0x1d5c26 : 0x6b1a12);
      });
    } else {
      this.ghost.visible = false;
      this.faceArrow.visible = false;
    }

    let selPos: { x: number; y: number; r: number } | null = null;
    let workCircle: { x: number; y: number; r: number } | null = null;
    if (pv.selBuildingId != null) {
      const b = s.buildings.find((x) => x.id === pv.selBuildingId);
      if (b) {
        const bw = footprintW(b);
        const bh = footprintH(b);
        selPos = { x: b.x + bw / 2, y: b.y + bh / 2, r: Math.max(bw, bh) * 0.6 };
        const wr = workRadiusOf(b);
        if (wr && b.built) {
          const wc = workCentre(b);
          workCircle = { x: wc.x, y: wc.y, r: wr };
        }
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
    // While siting a building, show the circle it would work — you are choosing where the trees
    // or the fish are, and picking that spot blind and finding out afterwards is the whole
    // difficulty of placing a forester or a fishing hut.
    if (!workCircle && pv.type) {
      const d = BUILDING_DEFS[pv.type];
      if (d.workRadius !== undefined) {
        const ghost: Placed = {
          type: pv.type, x: pv.tx, y: pv.ty, rot: pv.prot ?? 0,
          ...(pv.pw !== undefined ? { w: pv.pw, h: pv.ph } : {}),
        };
        const wc = workCentre(ghost);
        // A fresh site starts on one worker, so show the radius that single worker covers.
        workCircle = { x: wc.x, y: wc.y, r: d.workRadius };
      }
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

  /**
   * The translucent shape shown while placing `type`.
   *
   * Uses the building's own model wherever one exists, so the player is dragging the silhouette
   * of the thing they are about to build. Ranches and fields have no model — they are
   * player-sized fenced plots — so they get their plot outline instead, at the size being dragged.
   */
  private makeGhostShape(type: BuildingType, pw: number, ph: number): THREE.Object3D {
    const model = this.models.buildingClone(type);
    let shape: THREE.Object3D;
    if (model && type !== 'ranch' && type !== 'farm') {
      model.scale.multiplyScalar(Math.max(pw, ph) * 0.95);
      shape = model;
    } else {
      shape = this.makeFencedPlot(pw, ph, { shed: type === 'ranch', ground: type === 'ranch' ? 0x6f7a3f : 0x7a5a34 });
    }
    // Ghost materials are cloned so tinting the preview never bleeds into the real buildings,
    // which share the model's materials through `clone(true)`.
    shape.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!src || Array.isArray(src)) return;
      const m = src.clone();
      m.transparent = true;
      m.opacity = GHOST_OPACITY;
      m.depthWrite = false; // or the near faces punch holes in the far ones through the glass
      mesh.material = m;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return shape;
  }

  /** Drop the instanced layers and building meshes (called before rebuilding on a new map). */
  /** Position and show the merchant boat while it's on the water. */
  private syncBoat(s: GameState): void {
    const b = s.merchant.boat;
    if (!b) {
      this.boat.visible = false;
      return;
    }
    // Swap the placeholder for the real vessel the first time the model turns up. Models load
    // asynchronously, so this cannot be done once at startup.
    if (!this.boatModelled) {
      const model = this.models.propClone('boat');
      if (model) {
        this.boatModelled = true;
        for (const child of [...this.boat.children]) {
          this.boat.remove(child);
          disposeTree(child);
        }
        // Authored bow-along-+Y like every building, so it needs the same half turn to sit the
        // right way round in its group; the group itself is then turned to the heading it sails.
        model.rotation.y = buildingYaw(0);
        // *Multiply*, never set: the template's own scale is what normalizes it to one tile, and
        // overwriting that makes the boat BOAT_SIZE times its raw authored size instead — which
        // came out at five tiles rather than two.
        model.scale.multiplyScalar(BOAT_SIZE);
        this.boat.add(model);
        this.enableShadows(this.boat);
      }
    }
    this.boat.visible = true;
    this.boat.position.set(b.x, 0.16, b.y);
    // A little roll and pitch on the same swell the water is riding, so a moored boat is not a
    // static prop sitting on a moving surface — and a yaw from the course it is steering, since
    // it no longer only ever sails downstream.
    const t = this.waterTime;
    this.boat.rotation.set(Math.sin(t * 1.5) * 0.035, b.h ?? 0, Math.sin(t * 2.1 + 1) * 0.05);
  }

  private teardown(): void {
    if (!this.ready) return;
    const pathMeshes = Object.values(this.pathLayers);
    // Every villager body part is its own layer now, and the head always existed — all of them
    // have to be released here or a new map leaks the old map's meshes.
    const villagerMeshes = [this.citizens, this.heads, this.hair, this.coats, ...(this.legs ?? [])]
      .filter((m): m is THREE.InstancedMesh => !!m);
    // `ironNodes` belongs in this list as much as `rocks` does. Leaving it out left every old
    // map's ore chunks in the scene, still at the positions they were given for *that* terrain —
    // so a new game drew its own deposits plus every previous game's, scattered over ground that
    // had since become forest, mountain or lake. It surfaced as ore floating on open water,
    // because water is the one surface where a stray chunk is unmistakable.
    for (const m of [this.terrain, this.trees, this.rocks, this.ironNodes, ...pathMeshes, this.portals, this.bores, this.marks, ...villagerMeshes]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    for (const t of this.treeInsts) t.dispose(this.scene);
    this.treeInsts = [];
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
    // The facing arrow is rebuilt by `init`, so the old one has to go with the rest of the map.
    // It draws with `depthTest: false` — a leaked one is not merely still there, it is still
    // there *through the terrain*, pointing at a door on a map that no longer exists.
    this.scene.remove(this.faceArrow);
    this.faceArrow.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.sig = { land: -1, tree: -1, rock: -1, iron: -1, path: -1, mark: -1, bld: '' };
    this.ready = false;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** The four path surfaces, each drawn by its own instanced layer with its own texture. */
type PathSurface = 'dirt' | 'stone' | 'bridge' | 'tunnel';

/**
 * How solid a building looks before it exists — both the placement ghost and a site under
 * construction. Low enough to read as "not there yet", high enough that the silhouette is still
 * legible against grass.
 */
const GHOST_OPACITY = 0.42;

/** Tint for a path, bridge or tunnel tile that is drawn but not yet built. */
const PLAN_TINT = 0x7fe08c;

/**
 * How deep each finished-tunnel tile sits, counted in tiles from the nearest mouth.
 *
 * A breadth-first walk outward from every tunnel tile that touches open ground. The first
 * `TUNNEL_MOUTH_TILES` of each end are excavated into an approach; everything deeper keeps the
 * mountain over it, which is what makes the road read as running *into* the hill rather than
 * through a notch cut across it. -1 marks a tile that is not a finished tunnel.
 */
function tunnelMouthDepth(s: GameState): Int16Array {
  const depth = new Int16Array(MAP_W * MAP_H).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < s.paths.length; i++) {
    if (s.paths[i] !== PATH_TUNNEL) continue;
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!inBounds(x + dx, y + dy)) continue;
      // Open ground next door means this tile is a mouth.
      if (s.tiles[tileIndex(x + dx, y + dy)].type !== 'stone') {
        depth[i] = 0;
        queue.push(i);
        break;
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const j = tileIndex(nx, ny);
      if (s.paths[j] !== PATH_TUNNEL || depth[j] !== -1) continue;
      depth[j] = depth[i] + 1;
      queue.push(j);
    }
  }
  // A tunnel with no mouth at all (fully enclosed) is still a tunnel; treat it as deep rock.
  for (let i = 0; i < s.paths.length; i++) {
    if (s.paths[i] === PATH_TUNNEL && depth[i] === -1) depth[i] = TUNNEL_MOUTH_TILES;
  }
  return depth;
}

/** A tunnel tile with no tunnel neighbours — a bore one tile long, open at both ends. */
function isLoneTunnel(s: GameState, x: number, z: number): boolean {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (inBounds(x + dx, z + dz) && s.paths[tileIndex(x + dx, z + dz)] === PATH_TUNNEL) return false;
  }
  return true;
}

/** Rolling hash of the finished-tunnel tiles, to notice when the mountain needs recutting. */
function tunnelSignature(s: GameState): number {
  let sig = 0;
  for (let i = 0; i < s.paths.length; i++) {
    if (s.paths[i] === PATH_TUNNEL) sig = (Math.imul(sig, 31) + i + 1) >>> 0;
  }
  return sig;
}

/** Release every geometry and material under an object (used when swapping the ghost's shape). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
    m.geometry?.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

/**
 * Tiles excavated at each end of a tunnel to form its approach. Two is the useful minimum: one
 * gives the portal nowhere to stand, and three starts to read as a cutting again.
 */
const TUNNEL_MOUTH_TILES = 2;

/** How far the timbered adit stands proud of the hillside, in tiles. */
const TUNNEL_PORTAL_OUT = 1;

/**
 * The mouth of a tunnel: a timbered adit, like a mineshaft head.
 *
 * Built facing -Z (into the hillside) and anchored on the rock face, so an instance's yaw points
 * it out of the mountain. It runs `TUNNEL_PORTAL_OUT` of a tile *outward* onto the open ground —
 * a covered gallery of props standing proud of the slope, which is what makes the entrance
 * readable from the play camera — and `TUNNEL_MOUTH_TILES` back the other way into the excavated
 * approach, so the timbering visibly continues into the dark rather than stopping at a facade.
 *
 * Timber rather than dressed stone: this is a working bore driven by the same people who prop a
 * mine, not a piece of civic architecture.
 */
function portalGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const outer = TUNNEL_PORTAL_OUT;
  // Runs past the excavated approach and on into the rock, so the timbering does not stop at a
  // facade — it continues into the dark, and the terrain hides the rest.
  const inner = -(TUNNEL_MOUTH_TILES + 0.6);
  const len = outer - inner;
  const midZ = (outer + inner) / 2;
  const H = 0.92;   // clear height inside
  const HW = 0.42;  // half the clear width
  const T = 0.16;   // timber thickness

  // Solid boarded sides and roof: one continuous box, not a run of separate ribs. Gaps between
  // ribs let daylight through the tunnel from above, which read as a slatted fence rather than
  // as something you could walk into.
  for (const sx of [-1, 1]) {
    const wall = new THREE.BoxGeometry(T, H, len);
    wall.translate(sx * (HW + T / 2), H / 2, midZ);
    parts.push(wall);
  }
  const roof = new THREE.BoxGeometry(HW * 2 + T * 2 + 0.06, T, len);
  roof.translate(0, H + T / 2, midZ);
  parts.push(roof);

  // A header board over the opening, standing a little proud of the roof — the one piece of
  // silhouette that says "entrance" from directly above.
  const head = new THREE.BoxGeometry(HW * 2 + T * 2 + 0.24, 0.3, 0.2);
  head.translate(0, H + 0.28, outer - 0.02);
  parts.push(head);
  // Corner posts at the mouth, so the end of the box reads as framed rather than sawn off.
  for (const sx of [-1, 1]) {
    const post = new THREE.BoxGeometry(T + 0.06, H + 0.16, 0.2);
    post.translate(sx * (HW + T / 2), (H + 0.16) / 2, outer - 0.02);
    parts.push(post);
  }
  return mergeGeometries(parts, false)!;
}

/**
 * The dark bore behind a portal, drawn as its own layer so it can be black while the portal is
 * dressed stone. Shares the portal's transform exactly.
 */
function boreGeometry(): THREE.BufferGeometry {
  // Placement here is exact, and it was wrong twice. The first TUNNEL_MOUTH_TILES of the bore are
  // *excavated* — open air inside the approach — so a box anywhere in that span is in plain sight
  // from the side. It has to begin past the recess, where the rock actually resumes, plus a margin
  // for the fact that the terrain ramps back up to full mountain height over a sub-tile slope
  // rather than a vertical wall. Then it is invisible from every angle except straight down the
  // tunnel, which is exactly when the player should see it.
  //
  // Kept shallow for the opposite reason: a deep box punches out the far side of any range only
  // two or three tiles thick, which is most of them.
  const D = 0.4;
  const g = new THREE.BoxGeometry(0.78, 0.86, D);
  g.translate(0, 0.43, -(TUNNEL_MOUTH_TILES + 0.35 + D / 2));
  return g;
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
