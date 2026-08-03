import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Optional glTF models, loaded at runtime from `public/models/` and described by
 * `public/models/manifest.json`. Everything is best-effort: if the manifest is absent or a
 * file fails, the renderer keeps its placeholder geometry, so the game never regresses. Drop
 * `.gltf` files (plus their `.bin`) in and list them in the manifest to see them in-game — see
 * models/README.md. Textures are referenced from `public/textures/`, not packed per model, so
 * every building shares one download of each material.
 */
export interface ModelManifest {
  /** buildingType -> model filename, e.g. { "house": "house.gltf" } */
  buildings?: Record<string, string>;
  /** tree model filenames (instanced on forest tiles) */
  trees?: string[];
  /** loose-stone model filenames (instanced where tiles carry stone) */
  rocks?: string[];
  /** one-off props that are not buildings, e.g. { "boat": "boat.gltf" } */
  props?: Record<string, string>;
}

export class ModelLibrary {
  /** Cache-buster so a redeployed model is not masked by the service worker's copy. */
  private v = `?v=${__ASSET_VERSION__}`;
  /**
   * The .gltf files reference a sibling .bin, and GLTFLoader resolves it against the model's
   * URL with the query string stripped — so the geometry would come back from the stale cache
   * even when the model itself did not. Stamp the version onto every /models/ request instead.
   * Textures live in /textures/ and are precached by the service worker, so they update anyway.
   */
  private manager = new THREE.LoadingManager().setURLModifier((url) =>
    url.includes('/models/') && !url.includes('?v=') ? url + this.v : url,
  );
  private loader = new GLTFLoader(this.manager);
  private base = import.meta.env.BASE_URL + 'models/';
  private templates = new Map<string, THREE.Object3D>(); // filename -> normalized template
  private buildingFile = new Map<string, string>(); // buildingType -> filename
  private propFile = new Map<string, string>(); // prop name -> filename
  treeFiles: string[] = [];
  rockFiles: string[] = [];
  loadedCount = 0;
  /** Fired whenever a model finishes loading, so the renderer can swap it in. */
  onLoad: (() => void) | null = null;

  /** Read the manifest and kick off loads. Silent when there's nothing to load. */
  async init(): Promise<void> {
    let manifest: ModelManifest | null = null;
    try {
      const res = await fetch(this.base + 'manifest.json' + this.v, { cache: 'no-cache' });
      if (res.ok) manifest = (await res.json()) as ModelManifest;
    } catch {
      /* no manifest -> pure placeholder mode */
    }
    if (!manifest) return;
    const files = new Set<string>();
    for (const [bt, file] of Object.entries(manifest.buildings ?? {})) {
      if (file) {
        this.buildingFile.set(bt, file);
        files.add(file);
      }
    }
    for (const [name, file] of Object.entries(manifest.props ?? {})) {
      if (file) {
        this.propFile.set(name, file);
        files.add(file);
      }
    }
    for (const f of manifest.trees ?? []) { this.treeFiles.push(f); files.add(f); }
    for (const f of manifest.rocks ?? []) { this.rockFiles.push(f); files.add(f); }
    for (const file of files) this.loadFile(file);
  }

  private loadFile(file: string): void {
    this.loader.load(
      this.base + file, // the loading manager stamps the cache-busting version on
      (gltf) => {
        this.templates.set(file, normalize(gltf.scene));
        this.loadedCount++;
        this.onLoad?.();
      },
      undefined,
      () => {
        /* a listed file failed to load — keep the placeholder for it */
      },
    );
  }

  template(file: string | undefined): THREE.Object3D | null {
    return file ? this.templates.get(file) ?? null : null;
  }

  /** A fresh, normalized clone of the model mapped to a building type, or null. */
  buildingClone(buildingType: string): THREE.Object3D | null {
    const tpl = this.template(this.buildingFile.get(buildingType));
    return tpl ? tpl.clone(true) : null;
  }

  /** A fresh, normalized clone of a named one-off prop (the merchant's boat), or null. */
  propClone(name: string): THREE.Object3D | null {
    const tpl = this.template(this.propFile.get(name));
    return tpl ? tpl.clone(true) : null;
  }

  firstTree(): THREE.Object3D | null {
    for (const f of this.treeFiles) { const t = this.templates.get(f); if (t) return t; }
    return null;
  }

  /**
   * Every tree species that has finished loading, in manifest order.
   *
   * The renderer keeps one instanced layer per species and picks between them by a hash of the
   * tile, so a wood mixes without anything being stored per tile. Order matters: it is what that
   * hash indexes into, so a species arriving late would reshuffle a forest mid-game. They are
   * only read once *all* of them are loaded (see `treesReady`).
   */
  allTrees(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const f of this.treeFiles) { const t = this.templates.get(f); if (t) out.push(t); }
    return out;
  }

  /** True once every species in the manifest is loaded, so the mix can be built in a stable order. */
  treesReady(): boolean {
    return this.treeFiles.length > 0 && this.treeFiles.every((f) => this.templates.has(f));
  }
  firstRock(): THREE.Object3D | null {
    for (const f of this.rockFiles) { const t = this.templates.get(f); if (t) return t; }
    return null;
  }

  /** Test hook: parse an in-memory glTF (JSON string or ArrayBuffer) and register it. */
  debugParse(key: string, data: string | ArrayBuffer, asBuilding?: string): Promise<void> {
    return new Promise((resolve) => {
      this.loader.parse(
        data,
        '',
        (gltf) => {
          this.templates.set(key, normalize(gltf.scene));
          if (asBuilding) this.buildingFile.set(asBuilding, key);
          this.loadedCount++;
          this.onLoad?.();
          resolve();
        },
        () => resolve(),
      );
    });
  }
}

/**
 * Center a model on its footprint, drop its base to y=0, and uniform-scale so its footprint
 * (the larger of width/depth) is 1 world unit. Callers then scale by the target tile size.
 * The normalized height is stashed on `userData.height`.
 */
function normalize(scene: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;
  const foot = Math.max(size.x, size.z) || 1;
  const s = 1 / foot;
  const group = new THREE.Group();
  group.scale.setScalar(s);
  group.add(scene);
  group.userData.height = size.y * s;
  return group;
}

/**
 * Renders many copies of a (possibly multi-part) model efficiently: one InstancedMesh per
 * sub-mesh, all driven by a shared per-instance world transform. Used for trees / rocks.
 */
export class InstancedModel {
  readonly meshes: THREE.InstancedMesh[] = [];
  private locals: THREE.Matrix4[] = [];
  private tmp = new THREE.Matrix4();

  constructor(template: THREE.Object3D, capacity: number) {
    template.updateWorldMatrix(true, true);
    template.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      const inst = new THREE.InstancedMesh(m.geometry, m.material as THREE.Material, Math.max(1, capacity));
      inst.count = 0;
      inst.frustumCulled = false;
      this.meshes.push(inst);
      this.locals.push(m.matrixWorld.clone());
    });
  }

  setAt(i: number, world: THREE.Matrix4): void {
    for (let k = 0; k < this.meshes.length; k++) {
      this.tmp.multiplyMatrices(world, this.locals[k]);
      this.meshes[k].setMatrixAt(i, this.tmp);
    }
  }
  setCount(n: number): void {
    for (const mm of this.meshes) mm.count = n;
  }
  update(): void {
    for (const mm of this.meshes) mm.instanceMatrix.needsUpdate = true;
  }
  addTo(scene: THREE.Object3D): void {
    for (const mm of this.meshes) scene.add(mm);
  }
  dispose(scene: THREE.Object3D): void {
    for (const mm of this.meshes) {
      scene.remove(mm);
      mm.dispose();
    }
    this.meshes.length = 0;
  }
}
