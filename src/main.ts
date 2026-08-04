import './style.css';
import { Camera } from './engine/camera';
import { Camera3D } from './engine/camera3d';
import { InputManager } from './engine/input';
import { Renderer, PlacementView } from './render/renderer';
import { Renderer3D } from './render/renderer3d';
import { UI, PathTier } from './ui/ui';
import {
  GameState,
  Building,
  Citizen,
  BuildingType,
  BUILDING_DEFS,
  BUILD_ORDER,
  buildTimeOf,
  autoBuilderDemand,
  FOOD_PER_CITIZEN_PER_SEASON,
  HEAT_PER_CITIZEN_WINTER,
  workRadiusOf,
  workCentre,
  footprintW,
  footprintH,
  ranchCapacity,
  SIZABLE,
  RANCH_SPLIT_MIN,
  isHouse,
  isWorkplace,
  buildingName,
  nextBuildingName,
  houseCapacityOf,
  STONE_HOUSE_HEAT_FACTOR,
  Crop,
  RanchAnimal,
  CROP_META,
  RANCH_ANIMALS,
  ANIMAL_META,
  MapSize,
  Difficulty,
  MAP_W,
  MAP_H,
  MineOutput,
  SmithRecipe,
  ResourceKind,
  RESOURCE_ICON,
  LARDER_KINDS,
  LIMIT_STEP,
  LimitKey,
  carryLimit,
  RESOURCE_KINDS,
  ADULT_AGE,
  PATH_NONE,
  PATH_STONE,
  PATH_STONE_PLAN,
  PATH_BRIDGE,
} from './types';
import { newGame } from './game/state';
import {
  update,
  LogKind,
  recordEvent,
  basketTrade,
  dismissMerchant,
  TradeBasket,
  TradeResult,
  cullRanch,
  splitRanch,
  transferRanch,
  eligibleRanchTargets,
  igniteBuilding,
  fireSeason,
  acceptNomads,
  rejectNomads,
  markHarvestRect,
  coupleNeedsAHome,
  pickHarvestFor,
  limitStock,
  cappedOut,
  debugWorkSpotFor,
} from './game/simulation';
import { canPlace, placeBuilding, canAfford, demolishBuilding, footprintClear, footprintToClear } from './game/buildings';
import { findPath } from './game/pathfind';
import { tileIndex, inBounds } from './game/world';
import {
  addNearest,
  totalStored,
  barnLoad,
  capacityOf,
  houseFuelPerSeason,
  larderFood,
  larderFoodTarget,
  larderTarget,
} from './game/storage';
import {
  planPath, markPending, pendingPathCount, confirmPendingPaths, cancelPendingPaths,
  isSpanTier, spanLine, unplanTiles, demolishPathRect,
} from './game/paths';
import { saveGame, loadGame, hasSave, clearSave, slotInfo, slotName, setSlotName, lastSlot, SLOTS } from './game/save';
import { InspectRow, InspectControls } from './ui/ui';

/** Where the tips preference lives. Kept out of the save so it follows the player, not a village. */
const TIPS_KEY = 'village-tips';

/**
 * Where the auto-staffing preference lives. Like tips, it follows the player rather than the
 * village, and is copied onto each game's state so the simulation reads it from one place.
 * Defaults on: the point of it is to spare the player re-staffing every hut by hand.
 */
const AUTO_STAFF_KEY = 'village-auto-staff';
const autoStaffPref = (): boolean => localStorage.getItem(AUTO_STAFF_KEY) !== 'off';

const SPEEDS = [1, 2, 3];
/**
 * Yaw speed (radians/sec) while a corner rotate button is held — 45°/s, so a full turn takes
 * eight seconds of holding. Rotation is continuous (not a per-tap jump) so the direction of
 * travel is legible: a discrete jump teleports the scene and reads as an arbitrary flip.
 */
const ROTATE_SPEED = Math.PI / 4;

class Game {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  /** `?2d` in the URL keeps the legacy flat renderer for side-by-side/rollback. */
  use2d = new URLSearchParams(location.search).has('2d');
  camera: Camera | Camera3D;
  renderer: Renderer | Renderer3D;
  private ctx?: CanvasRenderingContext2D;
  ui: UI;
  input: InputManager;

  state: GameState;
  running = false;
  paused = false;
  /** Save slot the current game reads from and autosaves to. */
  currentSlot = 0;
  speedIndex = 0;
  selectedBuild: BuildingType | null = null;
  /** Player-chosen footprint (tiles) while a sizable building (ranch/field) is selected. */
  sizeW = 4;
  sizeH = 4;
  /** Quarter turns clockwise the pending building will be placed at (see `Building.rot`). */
  buildRot: 0 | 1 | 2 | 3 = 0;
  selectedPath: PathTier | null = null;
  demolish = false;
  harvestMode = false;
  /** Live harvest-marquee rectangle in world coords while dragging, else null. */
  marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
  inspectSel: { kind: 'building' | 'citizen'; id: number } | null = null;
  /** Held rotate button: -1 = counter-clockwise, +1 = clockwise, 0 = released. */
  rotateDir: -1 | 0 | 1 = 0;
  /**
   * Demolition picked but not yet confirmed — nothing is destroyed until the player says so.
   * A list, because a demolish drag can enclose several buildings at once.
   */
  pendingDemolish: { kind: 'building' | 'path'; ids: number[]; label: string } | null = null;

  dpr = 1;
  cw = 0;
  ch = 0;
  lastTime = 0;
  saveAccum = 0;

  constructor() {
    if (this.use2d) {
      const cam = new Camera();
      this.ctx = this.canvas.getContext('2d')!;
      this.camera = cam;
      this.renderer = new Renderer(this.ctx, cam);
    } else {
      const cam = new Camera3D();
      this.camera = cam;
      this.renderer = new Renderer3D(this.canvas);
    }
    this.state = newGame();
    this.ui = new UI({
      onSelectBuild: (t) => this.onSelectBuild(t),
      onSelectPath: (tier) => this.onSelectPath(tier),
      onSetDemolish: (a) => this.onSetDemolish(a),
      onPauseToggle: () => this.togglePause(),
      onSpeedCycle: () => this.cycleSpeed(),
      onNewGame: () => this.openSizeSelect(),
      onOpenMenu: () => this.openPauseMenu(),
      onSetWorkers: (id, d) => this.setWorkers(id, d),
      onRenameBuilding: (id, name) => this.renameBuilding(id, name),
      onSetBuilders: (d) => this.setBuilders(d),
      onSetLimit: (kind, d) => this.setLimit(kind, d),
      onSetMineOutput: (id, o) => this.setMineOutput(id, o),
      onSetSmithRecipe: (id, r) => this.setSmithRecipe(id, r),
      onSetForesterReplant: (id, on) => this.setForesterReplant(id, on),
      onSetCrop: (id, crop) => this.setCrop(id, crop),
      onSetAnimal: (id, animal) => this.setAnimal(id, animal),
      onSizeChange: (dim, delta) => this.onSizeChange(dim, delta),
      onRotateBuild: () => this.onRotateBuild(),
      onPlaceBuild: () => this.placeAtReticle(),
      onSetRanchMax: (id, delta) => this.setRanchMax(id, delta),
      onCullRanch: (id) => this.cullRanch(id),
      onSplitRanch: (from, to) => this.splitRanch(from, to),
      onTransferRanch: (from, to) => this.transferRanch(from, to),
      onSetTradeOrder: (id, kind, delta) => this.setTradeOrder(id, kind, delta),
      onSetTradeOrderTo: (id, kind, value) => this.setTradeOrder(id, kind, value, true),
      onBasketTrade: (basket) => this.trade(basket),
      onDismissMerchant: () => this.dismissMerchant(),
      onAcceptNomads: () => this.acceptNomads(),
      onRejectNomads: () => this.rejectNomads(),
      onSelectHarvest: (a) => this.onSelectHarvest(a),
      onCloseInspect: () => this.clearInspect(),
      onRotate: (dir) => this.rotateView(dir),
    });
    // Rotation only applies to the 3D view; hide the buttons in the flat 2D fallback.
    if (this.use2d) this.ui.hideRotateButtons();
    // Tips default on for a first-time player and stay off once turned off, across villages.
    this.ui.setTips(localStorage.getItem(TIPS_KEY) !== 'off');
    this.input = new InputManager(this.canvas, this.camera);
    this.input.onTap = (sx, sy) => this.onTap(sx, sy);
    this.input.onPaint = (sx, sy) => this.onPaint(sx, sy);
    this.input.onPaintStart = (sx, sy) => this.onPaintStart(sx, sy);
    this.input.onPaintEnd = () => this.onPaintEnd();
    this.input.onMarqueeMove = (a, b, c, d) => this.onMarqueeMove(a, b, c, d);
    this.input.onMarqueeEnd = (a, b, c, d) => this.onMarqueeEnd(a, b, c, d);
    this.input.onMarqueeCancel = () => { this.marquee = null; };

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persist();
    });
    this.resize();

    // Open on the main menu. The default (small) map generated above renders as an idle
    // backdrop behind it because `running` is false; picking New Game / Continue starts play.
    this.centreOnVillage();
    this.openMainMenu();

    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * Match the drawing buffer to the canvas's real box, if it has changed.
   *
   * Called every frame rather than only from a `resize` event, because on iOS a rotation fires
   * `resize` *before* the layout has settled: the handler reads the old width and height, sizes
   * the buffer to a portrait shape, and no further event ever arrives to correct it. The buffer
   * then stretches to fill a landscape canvas — which is the distortion — and rotating back
   * leaves it just as wrong, because that event is stale too. Measuring on the frame we are about
   * to draw needs no event at all, so there is nothing to arrive too early.
   *
   * Cheap enough to do unconditionally: two layout reads, and everything below is skipped unless
   * the box actually moved.
   */
  private resize(): void {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    // A hidden canvas (tab switch, iOS rotation mid-flight) reports 0; keep the last good size
    // rather than baking a degenerate 0-aspect projection we would have to recover from.
    if (cw <= 0 || ch <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cw === this.cw && ch === this.ch && dpr === this.dpr) return;
    this.cw = cw;
    this.ch = ch;
    this.dpr = dpr;
    if (this.use2d) {
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
    } else {
      (this.renderer as Renderer3D).setSize(cw, ch);
      (this.camera as Camera3D).setAspect(cw, ch);
    }
  }

  private centreOnVillage(): void {
    const cs = this.state.citizens;
    let x = MAP_W / 2;
    let y = MAP_H / 2;
    if (cs.length > 0) {
      x = 0;
      y = 0;
      for (const c of cs) {
        x += c.x;
        y += c.y;
      }
      x /= cs.length;
      y /= cs.length;
    }
    this.camera.focus(x, y);
  }

  /**
   * Begin/end a continuous camera rotation (a no-op for the flat 2D camera). The button is held:
   * `dir` is latched here and applied every frame in `frame` until released.
   *
   * Direction convention — the **scene** turns the way the button's arrow points. The 3D camera
   * orbits opposite to the scene, so ↺ (dir -1) *decreases* yaw: at yaw 0 the camera sits south of
   * its target, and lowering yaw swings it clockwise around the target, which reads on screen as
   * the village turning counter-clockwise.
   */
  private rotateView(dir: -1 | 0 | 1): void {
    this.rotateDir = dir;
  }

  private onSelectBuild(t: BuildingType | null): void {
    this.selectedBuild = t;
    this.selectedPath = null;
    this.demolish = false;
    this.clearInspect();
    this.input.setMode('normal');
    // A fresh sizable building (ranch/field) starts at its minimum; show the resize widget.
    const sz = t ? SIZABLE[t] : undefined;
    if (t && sz) {
      this.sizeW = sz.min;
      this.sizeH = sz.min;
    }
    this.buildRot = 0; // every new selection starts facing south
    if (t) this.showPlaceWidget(t);
    else this.ui.hideSizeWidget();
  }

  /** The placement widget for the currently selected building: rotation, and size when sizable. */
  private showPlaceWidget(type: BuildingType): void {
    const sz = SIZABLE[type];
    this.ui.showPlaceWidget(
      BUILDING_DEFS[type].name,
      this.buildRot,
      sz ? { w: this.sizeW, h: this.sizeH, min: sz.min, max: sz.max } : null,
    );
  }

  /** Turn the pending building a quarter turn clockwise, moving its door to the next face. */
  private onRotateBuild(): void {
    const type = this.selectedBuild;
    if (!type) return;
    this.buildRot = ((this.buildRot + 1) % 4) as 0 | 1 | 2 | 3;
    this.showPlaceWidget(type);
  }

  /** Resize the pending footprint of the selected sizable building (clamped to its bounds). */
  private onSizeChange(dim: 'w' | 'h', delta: number): void {
    const type = this.selectedBuild;
    const sz = type ? SIZABLE[type] : undefined;
    if (!type || !sz) return;
    const clamp = (v: number) => Math.max(sz.min, Math.min(sz.max, v));
    if (dim === 'w') this.sizeW = clamp(this.sizeW + delta);
    else this.sizeH = clamp(this.sizeH + delta);
    this.showPlaceWidget(type);
  }

  private onSelectPath(tier: PathTier | null): void {
    this.selectedPath = tier;
    this.selectedBuild = null;
    this.demolish = false;
    this.clearInspect();
    this.ui.hideSizeWidget();
    this.input.setMode(tier ? 'path' : 'normal');
  }

  private onSetDemolish(active: boolean): void {
    this.demolish = active;
    if (!active) this.pendingDemolish = null; // leaving the tool drops any un-confirmed target
    if (active) {
      this.selectedBuild = null;
      this.selectedPath = null;
      this.harvestMode = false;
      this.clearInspect();
      this.ui.hideSizeWidget();
      // Marquee mode, like harvesting: a drag pulls up a whole run of road at once. A tap still
      // falls through to picking a single building or path tile, so nothing is lost.
      this.input.setMode('marquee');
    } else {
      this.input.setMode('normal');
    }
  }

  private onSelectHarvest(active: boolean): void {
    this.harvestMode = active;
    this.marquee = null;
    if (active) {
      this.selectedBuild = null;
      this.selectedPath = null;
      this.demolish = false;
      this.clearInspect();
      this.ui.hideSizeWidget();
    }
    this.input.setMode(active ? 'marquee' : 'normal');
  }

  private onMarqueeMove(sx0: number, sy0: number, sx1: number, sy1: number): void {
    if (!this.harvestMode && !this.demolish) return;
    const [wx0, wy0] = this.camera.screenToTile(sx0, sy0, this.cw, this.ch);
    const [wx1, wy1] = this.camera.screenToTile(sx1, sy1, this.cw, this.ch);
    this.marquee = { x0: wx0, y0: wy0, x1: wx1, y1: wy1 };
  }

  private onMarqueeEnd(sx0: number, sy0: number, sx1: number, sy1: number): void {
    this.marquee = null;
    if (!this.running || this.state.gameOver) return;
    if (this.demolish) {
      const [dx0, dy0] = this.camera.screenToTile(sx0, sy0, this.cw, this.ch);
      const [dx1, dy1] = this.camera.screenToTile(sx1, sy1, this.cw, this.ch);
      const x0 = Math.floor(Math.min(dx0, dx1));
      const y0 = Math.floor(Math.min(dy0, dy1));
      const x1 = Math.floor(Math.max(dx0, dx1));
      const y1 = Math.floor(Math.max(dy0, dy1));
      // Buildings the square encloses *completely*. Requiring the whole footprint keeps a drag
      // that happens to clip a neighbour's corner from taking it too — with an 8x8 quarry about,
      // a partial overlap is far too easy to make by accident.
      const caught = this.state.buildings.filter((b) => {
        const bw = footprintW(b);
        const bh = footprintH(b);
        return b.x >= x0 && b.y >= y0 && b.x + bw - 1 <= x1 && b.y + bh - 1 <= y1;
      });
      // Ripping up road is cheap and instantly reversible by drawing it again, so unlike
      // demolishing a building it does not need a confirmation step.
      const removed = demolishPathRect(this.state, x0, y0, x1, y1);
      if (caught.length > 0) {
        this.pendingDemolish = {
          kind: 'building',
          ids: caught.map((b) => b.id),
          label: caught.length === 1 ? buildingName(caught[0]) : `${caught.length} buildings`,
        };
        // Ring a single target so it is obvious which one is about to go.
        if (caught.length === 1) {
          this.inspectSel = { kind: 'building', id: caught[0].id };
          this.refreshInspect();
        }
      } else {
        this.ui.flashHint(removed > 0 ? `Removed ${removed} path tile${removed > 1 ? 's' : ''}` : 'Nothing there to demolish');
      }
      if (removed > 0) this.persist();
      return;
    }
    if (!this.harvestMode) return;
    const [wx0, wy0] = this.camera.screenToTile(sx0, sy0, this.cw, this.ch);
    const [wx1, wy1] = this.camera.screenToTile(sx1, sy1, this.cw, this.ch);
    const n = markHarvestRect(
      this.state,
      Math.floor(wx0), Math.floor(wy0), Math.floor(wx1), Math.floor(wy1),
    );
    this.ui.flashHint(n > 0 ? `Marked ${n} tile${n > 1 ? 's' : ''} for harvest` : 'No trees or loose stone there');
    if (n > 0) this.persist();
  }

  private clearInspect(): void {
    this.inspectSel = null;
    this.ui.hideInspect();
  }

  private setWorkers(id: number, delta: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b) return;
    const max = BUILDING_DEFS[b.type].jobs;
    b.desiredWorkers = Math.max(0, Math.min(max, b.desiredWorkers + delta));
    this.persist();
  }

  /**
   * Rename a workplace. Blank restores the automatic default ("Fishing Hut 2"), so clearing the
   * field can't leave a building with no name at all.
   */
  private renameBuilding(id: number, name: string): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b || !isWorkplace(b.type)) return;
    const trimmed = name.trim().slice(0, 24);
    b.name = trimmed || nextBuildingName(this.state.buildings.filter((x) => x !== b), b.type);
    this.persist();
  }

  /**
   * Nudge a resource's stockpile cap. Zero means no limit, and the first tap down from no limit
   * lands on the current stock rounded up to a step rather than on some arbitrary number — a cap
   * you set while looking at the panel should be about where the stock is now.
   */
  private setLimit(key: LimitKey, delta: number): void {
    const limits = (this.state.limits ??= {});
    const cur = limits[key] ?? 0;
    let next: number;
    if (cur === 0 && delta > 0) {
      next = Math.max(LIMIT_STEP, Math.ceil(limitStock(this.state, key) / LIMIT_STEP) * LIMIT_STEP);
    } else {
      next = Math.max(0, cur + delta * LIMIT_STEP);
    }
    if (next > 0) limits[key] = next;
    else delete limits[key];
    this.persist();
  }

  /** Adjust the global Builders target (clamped to the number of adults). */
  private setBuilders(delta: number): void {
    const adults = this.state.citizens.reduce((n, c) => n + (c.age >= ADULT_AGE ? 1 : 0), 0);
    // The stepper moves the player's own offset; the total is derived from that plus whatever
    // the open sites are asking for (see `autoBuilderDemand`). Clamped so it can be dialled down
    // to nobody but not below, however many sites are open.
    const extra = (this.state.builderExtra ?? 0) + delta;
    const floor = -autoBuilderDemand(this.state);
    this.state.builderExtra = Math.max(floor, Math.min(adults, extra));
    this.persist();
  }

  private setMineOutput(id: number, output: MineOutput): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (b) {
      b.output = output;
      this.persist();
    }
  }

  private setSmithRecipe(id: number, recipe: SmithRecipe): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (b) {
      b.recipe = recipe;
      this.persist();
    }
  }

  private setForesterReplant(id: number, on: boolean): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (b) {
      b.replant = on;
      this.persist();
    }
  }

  private setCrop(id: number, crop: Crop): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (b) {
      b.crop = crop;
      this.persist();
    }
  }

  private setAnimal(id: number, animal: RanchAnimal): void {
    const b = this.state.buildings.find((x) => x.id === id);
    // Only an empty pen can switch species; a stocked one keeps its herd.
    if (b && (b.animals ?? 0) === 0) {
      b.animal = animal;
      b.maxAnimals = ranchCapacity(b); // capacity depends on the animal's size
      this.persist();
      if (this.inspectSel) this.refreshInspect();
    }
  }

  /** Set a ranch's desired herd cap (clamped 0..capacity). */
  private setRanchMax(id: number, delta: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b || b.type !== 'ranch') return;
    b.maxAnimals = Math.max(0, Math.min(ranchCapacity(b), (b.maxAnimals ?? ranchCapacity(b)) + delta));
    this.persist();
    if (this.inspectSel) this.refreshInspect();
  }

  private cullRanch(id: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b || b.type !== 'ranch') return;
    cullRanch(this.state, b);
    this.ui.flashHint('Herd sent to slaughter');
    this.persist();
    if (this.inspectSel) this.refreshInspect();
  }

  private splitRanch(fromId: number, toId: number): void {
    const from = this.state.buildings.find((x) => x.id === fromId);
    const to = this.state.buildings.find((x) => x.id === toId);
    if (!from || !to) return;
    const r = splitRanch(this.state, from, to);
    this.ui.flashHint(r.ok ? `Moved ${r.moved} head to the other ranch` : r.reason ?? 'Cannot split');
    if (r.ok) this.persist();
    if (this.inspectSel) this.refreshInspect();
  }

  private transferRanch(fromId: number, toId: number): void {
    const from = this.state.buildings.find((x) => x.id === fromId);
    const to = this.state.buildings.find((x) => x.id === toId);
    if (!from || !to) return;
    const r = transferRanch(this.state, from, to);
    this.ui.flashHint(r.ok ? `Transferred ${r.moved} head` : r.reason ?? 'Cannot transfer');
    if (r.ok) this.persist();
    if (this.inspectSel) this.refreshInspect();
  }

  private trade(basket: TradeBasket): TradeResult {
    const r = basketTrade(this.state, basket);
    if (r.ok) {
      this.log('Trade complete', 'good');
      this.persist();
    }
    return r;
  }

  private dismissMerchant(): void {
    dismissMerchant(this.state);
    this.persist();
  }

  /** Adjust a trading post's standing order — by `amount`, or to it when `absolute` is set. Clamped at zero. */
  private setTradeOrder(buildingId: number, kind: ResourceKind, amount: number, absolute = false): void {
    const b = this.state.buildings.find((x) => x.id === buildingId);
    if (!b) return;
    b.orders = b.orders ?? {};
    if (!Number.isFinite(amount)) return; // a typed field can hand us NaN
    const next = Math.max(0, absolute ? Math.floor(amount) : (b.orders[kind] ?? 0) + amount);
    if (next === 0) delete b.orders[kind];
    else b.orders[kind] = next;
    this.persist();
  }

  private acceptNomads(): void {
    acceptNomads(this.state, this.log);
    this.persist();
  }

  private rejectNomads(): void {
    rejectNomads(this.state, this.log);
    this.persist();
  }

  /** Where a bridge/tunnel drag is anchored, and the tiles that stroke has planned so far. */
  private spanStart: { x: number; y: number } | null = null;
  private spanTiles: number[] = [];

  private onPaintStart(sx: number, sy: number): void {
    if (!this.selectedPath || !this.running || this.state.gameOver) return;
    const [wx, wy] = this.camera.screenToTile(sx, sy, this.cw, this.ch);
    this.spanStart = { x: Math.floor(wx), y: Math.floor(wy) };
    this.spanTiles = [];
    this.onPaint(sx, sy);
  }

  private onPaintEnd(): void {
    this.spanStart = null;
    this.spanTiles = [];
  }

  private onPaint(sx: number, sy: number): void {
    if (!this.selectedPath || !this.running || this.state.gameOver) return;
    const [wx, wy] = this.camera.screenToTile(sx, sy, this.cw, this.ch);
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    // Drawn tiles are held pending until the player confirms, so a stray drag can be undone.
    if (!isSpanTier(this.selectedPath) || !this.spanStart) {
      const prev = inBounds(tx, ty) ? this.state.paths[tileIndex(tx, ty)] : PATH_NONE;
      if (planPath(this.state, tx, ty, this.selectedPath)) markPending(this.state, tx, ty, prev);
      return;
    }
    // A bridge or tunnel is one crossing: the player drags a straight line from bank to bank (or
    // hillside to hillside) and the whole line is re-planned on every move, so the preview
    // follows the pointer instead of leaving a trail of every tile it passed over. Only the
    // tiles actually over water / inside the rock take — `planPath` refuses the rest — which is
    // what lets the drag start and end on ordinary ground.
    unplanTiles(this.state, this.spanTiles);
    this.spanTiles = [];
    for (const p of spanLine(this.spanStart.x, this.spanStart.y, tx, ty)) {
      const prev = inBounds(p.x, p.y) ? this.state.paths[tileIndex(p.x, p.y)] : PATH_NONE;
      if (!planPath(this.state, p.x, p.y, this.selectedPath)) continue;
      markPending(this.state, p.x, p.y, prev);
      this.spanTiles.push(tileIndex(p.x, p.y));
    }
  }

  /** Accept the drawn path tiles — villagers can now lay them. */
  private confirmPaths(): void {
    const n = confirmPendingPaths(this.state);
    if (n > 0) this.ui.flashHint(`${n} path tile${n > 1 ? 's' : ''} queued for the builders`);
    this.persist();
  }

  /** Throw the drawn path tiles away, clearing them back to bare ground. */
  private cancelPaths(): void {
    cancelPendingPaths(this.state);
    this.persist();
  }

  /** Carry out the selected demolition. */
  private confirmDemolish(): void {
    const target = this.pendingDemolish;
    this.pendingDemolish = null;
    if (!target) return;
    if (target.kind === 'building') {
      let n = 0;
      let last = '';
      for (const id of target.ids) {
        const b = this.state.buildings.find((x) => x.id === id);
        if (!b) continue;
        last = buildingName(b);
        demolishBuilding(this.state, b);
        n++;
      }
      if (n === 1) this.ui.log(`${last} demolished`, 'info');
      else if (n > 1) this.ui.log(`${n} buildings demolished`, 'info');
    } else {
      const idx = target.ids[0];
      const v = this.state.paths[idx];
      const wasStone = v === PATH_STONE || v === PATH_STONE_PLAN;
      const wasBridge = v === PATH_BRIDGE;
      this.state.paths[idx] = PATH_NONE;
      const tx = idx % MAP_W;
      const ty = Math.floor(idx / MAP_W);
      if (wasStone) addNearest(this.state, { x: tx, y: ty }, 'stone', 0.25);
      if (wasBridge) this.state.navVersion = (this.state.navVersion ?? 0) + 1; // walkability changed
    }
    this.clearInspect();
    this.persist();
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.ui.updateHud(this.state, SPEEDS[this.speedIndex], this.paused);
  }

  private cycleSpeed(): void {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    this.paused = false;
    this.ui.updateHud(this.state, SPEEDS[this.speedIndex], this.paused);
  }

  /** Start a fresh game in a slot. Directly startable (difficulty-select + headless drivers). */
  startNewGame(size: MapSize = 'small', difficulty: Difficulty = 'normal', disasters = true, slot = 0): void {
    this.currentSlot = slot;
    this.state = newGame(size, difficulty, disasters);
    this.state.autoStaff = autoStaffPref();
    this.centreOnVillage();
    this.paused = false;
    this.selectedBuild = null;
    this.selectedPath = null;
    this.demolish = false;
    this.clearInspect();
    this.input.setMode('normal');
    this.ui.clearSelection();
    this.ui.hideOverlay();
    this.running = true;
    this.persist();
    this.ui.log('A fresh village begins', 'good');
  }

  // ---- menu flow ----
  /** The title screen: New Game, Continue / Load (if a save exists), Settings. */
  private openMainMenu(): void {
    this.running = false;
    this.paused = false;
    this.ui.showMainMenu({
      hasSave: hasSave(),
      onNew: () => this.openSizeSelect(),
      onContinue: () => this.continueGame(),
      onLoad: () => this.openSlotSelect('load', () => this.openMainMenu()),
      onCodex: () => this.openCodex(() => this.openMainMenu()),
      onSettings: () => this.openSettings(() => this.openMainMenu()),
    });
  }

  /** The building reference. `back` returns to whichever menu opened it. */
  private openCodex(back: () => void): void {
    this.ui.showCodex({ onBack: back });
  }

  /** Map-size chooser, reachable from the main menu or the pause menu's New Game. */
  private openSizeSelect(): void {
    const cameFromGame = this.running;
    this.running = false;
    this.ui.showSizeSelect({
      onPick: (size) => this.openDifficultySelect(size),
      onBack: () => (cameFromGame ? this.openPauseMenu() : this.openMainMenu()),
    });
  }

  /** Difficulty chooser with the disasters toggle — the last step before a game starts. */
  private newGameDisasters = true;
  private openDifficultySelect(size: MapSize): void {
    this.running = false;
    this.ui.showDifficultySelect({
      disasters: this.newGameDisasters,
      onToggleDisasters: (on) => {
        this.newGameDisasters = on;
        this.openDifficultySelect(size); // re-render with the new toggle state
      },
      onPick: (difficulty) => this.startNewGame(size, difficulty, this.newGameDisasters, this.firstEmptySlot()),
      onBack: () => this.openSizeSelect(),
    });
  }

  /** First unoccupied slot for a new game (falls back to slot 0 when every slot is full). */
  private firstEmptySlot(): number {
    for (let i = 0; i < SLOTS; i++) if (!hasSave(i)) return i;
    return 0;
  }

  /** Slot picker for loading or saving. `back` returns to whichever menu opened it. */
  private openSlotSelect(mode: 'load' | 'save', back: () => void): void {
    const slots = Array.from({ length: SLOTS }, (_, i) => ({ index: i, info: slotInfo(i) }));
    const label = (slot: number): string => slotName(slot) ?? `Slot ${slot + 1}`;
    this.ui.showSlotSelect({
      mode,
      slots,
      onPick: (slot) => {
        if (mode === 'load') {
          this.continueGame(slot);
        } else {
          this.currentSlot = slot;
          this.persist();
          this.ui.flashHint(`Saved to ${label(slot)}`);
          this.openPauseMenu();
        }
      },
      onRename: (slot, name) => {
        if (name.trim() === (slotName(slot) ?? '')) return; // blur with nothing typed
        setSlotName(slot, name);
        this.openSlotSelect(mode, back); // redraw so the row title follows the field
      },
      onDelete: (slot) => {
        // Deleting the village you are playing would be undone by the next autosave a few seconds
        // later, which looks like the delete silently failing. Say so instead of pretending.
        if (this.running && slot === this.currentSlot) {
          this.ui.flashHint('That is the village you are playing — it would be saved again straight away');
          return;
        }
        if (!confirm(`Delete ${label(slot)}? This cannot be undone.`)) return;
        clearSave(slot);
        this.ui.flashHint(`${label(slot)} deleted`);
        this.openSlotSelect(mode, back);
      },
      onBack: back,
    });
  }

  /** Settings: graphics tier (applies on reload) and clear-all-saves. `back` returns to caller. */
  private openSettings(back: () => void): void {
    this.ui.showSettings({
      gfx: (localStorage.getItem('village-gfx') as 'low' | 'high' | null) ?? 'auto',
      tips: this.ui.tipsEnabled(),
      autoStaff: autoStaffPref(),
      onSetGfx: (g) => {
        if (g === 'auto') localStorage.removeItem('village-gfx');
        else localStorage.setItem('village-gfx', g);
      },
      onSetTips: (on) => {
        this.ui.setTips(on);
        localStorage.setItem(TIPS_KEY, on ? 'on' : 'off');
      },
      onSetAutoStaff: (on) => {
        localStorage.setItem(AUTO_STAFF_KEY, on ? 'on' : 'off');
        // Takes effect on the next building to finish. Deliberately not persisted: Settings is
        // reachable from the main menu, where `state` is only the idle backdrop village, and
        // saving that would write it over whatever is really in the slot. The preference is
        // re-applied from storage every time a game is started or loaded.
        this.state.autoStaff = on;
      },
      onClearSaves: () => {
        clearSave();
        this.ui.flashHint('All saves cleared');
      },
      onReload: () => location.reload(),
      onBack: back,
    });
  }

  /** Load a slot's village and resume play. Falls back to the main menu if no valid save. */
  private continueGame(slot?: number): void {
    const target = typeof slot === 'number' ? slot : lastSlot();
    const saved = target != null ? loadGame(target) : null;
    if (saved == null || target == null) {
      this.ui.flashHint('No saved village to load');
      this.openMainMenu();
      return;
    }
    this.currentSlot = target;
    this.state = saved;
    // The preference belongs to the player, not the village, so a loaded save adopts whatever is
    // set now rather than whatever was set when it was saved.
    this.state.autoStaff = autoStaffPref();
    this.centreOnVillage();
    this.paused = false;
    this.clearInspect();
    this.ui.clearSelection();
    this.ui.hideOverlay();
    this.running = saved.citizens.length > 0 && !saved.gameOver;
    this.ui.log('Welcome back to your village', 'good');
  }

  /** In-game pause menu: Resume, Save, Load, Settings, New Game, Main Menu. */
  private openPauseMenu(): void {
    this.paused = true;
    this.ui.showPauseMenu({
      onResume: () => {
        this.paused = false;
        this.ui.hideOverlay();
      },
      onSave: () => this.openSlotSelect('save', () => this.openPauseMenu()),
      onLoad: () => this.openSlotSelect('load', () => this.openPauseMenu()),
      onCodex: () => this.openCodex(() => this.openPauseMenu()),
      onSettings: () => this.openSettings(() => this.openPauseMenu()),
      onNewGame: () => this.openSizeSelect(),
      onMainMenu: () => this.openMainMenu(),
    });
  }

  private onTap(sx: number, sy: number): void {
    if (!this.running || this.state.gameOver) return;
    if (this.selectedBuild) {
      this.placeAtReticle();
      return;
    }
    const [wx, wy] = this.camera.screenToTile(sx, sy, this.cw, this.ch);
    if (this.demolish) {
      this.demolishAt(wx, wy);
      return;
    }
    this.inspectAt(wx, wy);
  }

  /** Placement uses a centre-screen reticle: pan to aim, tap to place. */
  private placeAtReticle(): void {
    if (!this.selectedBuild) return;
    const { tx, ty } = this.reticleTile(this.selectedBuild);
    const { w, h } = this.placeSize(this.selectedBuild);
    const check = canPlace(this.state, this.selectedBuild, tx, ty, w, h, this.buildRot);
    if (!check.ok) {
      this.ui.flashHint(check.reason ?? 'Cannot build here');
      return;
    }
    const placed = placeBuilding(this.state, this.selectedBuild, tx, ty, w, h, this.buildRot);
    const name = BUILDING_DEFS[this.selectedBuild].name;
    const needsClearing = placed !== null && !footprintClear(this.state, placed);
    this.ui.log(
      needsClearing
        ? `${name} site marked — clear the trees and stone under it first`
        : this.state.desiredBuilders > 0
          ? `${name} site marked — builders will haul materials`
          : `${name} site marked — assign Builders on the Job Board to construct it`,
      'info',
    );
    this.persist();
    if (!canAfford(this.state, this.selectedBuild)) {
      this.selectedBuild = null;
      this.ui.clearSelection();
      this.ui.hideSizeWidget();
      this.ui.flashHint('Not enough materials in storage for another');
    }
  }

  private buildingAt(wx: number, wy: number): Building | null {
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    for (const b of this.state.buildings) {
      if (tx >= b.x && tx < b.x + footprintW(b) && ty >= b.y && ty < b.y + footprintH(b)) return b;
    }
    return null;
  }

  private citizenAt(wx: number, wy: number): Citizen | null {
    let best: Citizen | null = null;
    let bd = 0.7 * 0.7;
    for (const c of this.state.citizens) {
      const dd = (c.x - wx) ** 2 + (c.y - wy) ** 2;
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    return best;
  }

  /**
   * Pick a demolition target. Nothing is destroyed here — the choice waits on the confirm bar,
   * so a mis-tap in demolish mode costs a building only if the player says so twice.
   *
   * Un-marking a harvest order is exempt: it destroys nothing and is trivially redone.
   */
  private demolishAt(wx: number, wy: number): void {
    const b = this.buildingAt(wx, wy);
    if (b) {
      this.pendingDemolish = { kind: 'building', ids: [b.id], label: buildingName(b) };
      this.inspectSel = { kind: 'building', id: b.id }; // ring it so the target is obvious
      this.refreshInspect();
      return;
    }
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    const idx = ty * MAP_W + tx;
    if (idx < 0 || idx >= this.state.paths.length) return;
    if (this.state.paths[idx] !== PATH_NONE) {
      this.pendingDemolish = { kind: 'path', ids: [idx], label: 'this path tile' };
    } else if (this.state.harvest[idx] !== 0) {
      this.state.harvest[idx] = 0; // un-mark a harvest order — nothing is lost, so no confirmation
      this.persist();
    }
  }

  private inspectAt(wx: number, wy: number): void {
    const c = this.citizenAt(wx, wy);
    if (c) {
      this.inspectSel = { kind: 'citizen', id: c.id };
      this.refreshInspect();
      return;
    }
    const b = this.buildingAt(wx, wy);
    if (b) {
      this.inspectSel = { kind: 'building', id: b.id };
      this.refreshInspect();
      return;
    }
    this.clearInspect();
  }

  private refreshInspect(): void {
    if (!this.inspectSel) return;
    const rows: InspectRow[] = [];
    if (this.inspectSel.kind === 'building') {
      const b = this.state.buildings.find((x) => x.id === this.inspectSel!.id);
      if (!b) return this.clearInspect();
      const def = BUILDING_DEFS[b.type];
      if (!b.built) {
        // Ground first: while anything is still standing on the plot, no construction happens at
        // all, and a site stuck at 0% otherwise looks like one nobody has been assigned to.
        const left = footprintToClear(this.state, b);
        const clearing = left.trees + left.stone + left.iron;
        rows.push({
          label: 'Status',
          value: clearing > 0
            ? 'Clearing the ground'
            : `Building ${Math.floor((b.progress / buildTimeOf(b.type)) * 100)}%`,
        });
        if (clearing > 0) {
          rows.push({ label: '—', value: `${clearing} tile${clearing > 1 ? 's' : ''} to clear first` });
          if (left.trees > 0) rows.push({ label: '🌲 Trees', value: `${left.trees} to fell` });
          if (left.stone > 0) rows.push({ label: `${RESOURCE_ICON.stone} Stone`, value: `${left.stone} to gather` });
          if (left.iron > 0) rows.push({ label: `${RESOURCE_ICON.iron} Iron`, value: `${left.iron} to gather` });
        }
        for (const [k, amt] of Object.entries(def.cost) as [ResourceKind, number][]) {
          rows.push({ label: `${RESOURCE_ICON[k]} ${k}`, value: `${Math.floor(b.store[k] ?? 0)}/${amt} delivered` });
        }
      } else {
        if (def.jobs > 0) rows.push({ label: 'Workers', value: `${b.workers.length}/${b.desiredWorkers}` });
        if (isHouse(b.type)) {
          const residents = this.state.citizens.filter((c) => c.homeId === b.id);
          rows.push({ label: 'Residents', value: `${residents.length}/${houseCapacityOf(b.type)}` });
          if (residents.length === 0) {
            rows.push({ label: '—', value: 'Nobody lives here yet' });
          } else {
            for (const r of residents) {
              const face = r.age < ADULT_AGE ? '🧒' : r.sex === 'm' ? '👨' : '👩';
              const note = r.age < ADULT_AGE ? 'child' : `${Math.floor(r.age)} yr`;
              rows.push({ label: `${face} ${r.name}`, value: note });
            }
            // The household larder: supplies these residents have carried home and will draw on
            // before the village barns. Held stock is excluded from the top-line HUD by design,
            // so this sheet is where the player accounts for it.
            const foodTarget = larderFoodTarget(this.state, b);
            rows.push({
              label: '🍽️ Larder food',
              value: `${Math.floor(larderFood(b))} / ${Math.round(foodTarget)}`,
            });
            for (const kind of LARDER_KINDS) {
              const target = larderTarget(this.state, b, kind);
              if (target <= 0) continue;
              rows.push({
                label: `${RESOURCE_ICON[kind]} Larder ${kind}`,
                value: `${Math.floor(b.store[kind] ?? 0)} / ${Math.round(target)}`,
              });
            }
            // What the hearth actually costs at this time of year. Heating is drawn continuously,
            // so this is the season's total burn rate — heaviest in winter, barely anything in
            // summer, and lower again behind stone walls.
            rows.push({
              label: '🔥 Heating',
              value:
                `${(Math.round(houseFuelPerSeason(this.state, b) * 10) / 10)} wood/season` +
                (b.type === 'stonehouse'
                  ? ` (insulated −${Math.round((1 - STONE_HOUSE_HEAT_FACTOR) * 100)}%)`
                  : ''),
            });
          }
        }
        if (b.type === 'mine') rows.push({ label: 'Digging', value: b.output });
        if (b.type === 'blacksmith') rows.push({ label: 'Forging', value: `${b.recipe} tools` });
        if (b.type === 'farm') {
          rows.push({ label: 'Crop', value: b.crop ? `${CROP_META[b.crop].emoji} ${CROP_META[b.crop].label}` : '🌱 No seed — buy from a trader' });
          rows.push({ label: 'Field', value: `${footprintW(b)}×${footprintH(b)}` });
          rows.push({ label: 'Growth', value: `${Math.round((b.growth ?? 0) * 100)}%` });
        }
        if (b.type === 'ranch') {
          const a = ANIMAL_META[b.animal ?? 'cattle'];
          rows.push({ label: 'Raising', value: `${a.emoji} ${a.label}` });
          rows.push({ label: 'Herd', value: `${Math.floor(b.animals ?? 0)} / ${ranchCapacity(b)} (${footprintW(b)}×${footprintH(b)})` });
          rows.push({ label: 'Breed up to', value: `${b.maxAnimals ?? ranchCapacity(b)}` });
        }
        if (b.type === 'barn' || b.type === 'market') {
          // Space used, not a unit count: a sack of grain takes a quarter of a log's room, so a
          // barn holds four times as much of it. `units` is what is actually on the shelves.
          let units = 0;
          for (const k of RESOURCE_KINDS) units += b.store[k] ?? 0;
          rows.push({
            label: 'Space used',
            value: `${Math.round(barnLoad(b))} / ${capacityOf(b)} (${Math.floor(units)} items)`,
          });
        }
        // Houses already report their larder above, against its targets — skip the raw dump so the
        // sheet doesn't list the same supplies twice.
        if (!isHouse(b.type)) {
          for (const k of RESOURCE_KINDS) {
            const v = b.store[k] ?? 0;
            if (v > 0.5) rows.push({ label: `${RESOURCE_ICON[k]} ${k}`, value: `${Math.floor(v)}` });
          }
        }
      }
      // Interactive controls: set workers and building-specific toggles right from the sheet.
      let controls: InspectControls | undefined;
      if (isWorkplace(b.type)) {
        // Renameable from the moment it is placed — the site is on the job board straight away.
        controls = { buildingId: b.id, rename: buildingName(b) };
      }
      if (b.built && def.jobs > 0) {
        controls = { ...controls, buildingId: b.id, workers: { value: b.desiredWorkers, max: def.jobs } };
        if (b.type === 'mine') {
          controls.toggle = { group: 'mine', options: [
            { v: 'coal', label: 'Coal', on: b.output === 'coal' },
            { v: 'iron', label: 'Iron', on: b.output === 'iron' },
          ] };
        } else if (b.type === 'blacksmith') {
          controls.toggle = { group: 'smith', options: [
            { v: 'iron', label: 'Iron', on: b.recipe === 'iron' },
            { v: 'steel', label: 'Steel', on: b.recipe === 'steel' },
          ] };
        } else if (b.type === 'lumberyard') {
          const on = b.replant ?? true;
          controls.toggle = { group: 'forester', options: [
            { v: 'on', label: '🌱 Replant', on },
            { v: 'off', label: 'Fell only', on: !on },
          ] };
        } else if (b.type === 'farm') {
          // Only crops the village owns the seed for can be planted.
          const owned = this.state.seeds;
          if (owned.length > 0) {
            controls.toggle = { group: 'crop', options: owned.map((c) => ({ v: c, label: `${CROP_META[c].emoji} ${CROP_META[c].label}`, on: b.crop === c })) };
          }
        } else if (b.type === 'ranch') {
          const cur = b.animal ?? 'cattle';
          const empty = (b.animals ?? 0) === 0;
          // Species can only change on an empty pen (a stocked herd stays put).
          if (empty) {
            controls.toggle = { group: 'animal', options: RANCH_ANIMALS.map((a) => ({ v: a, label: `${ANIMAL_META[a].emoji} ${ANIMAL_META[a].label}`, on: cur === a })) };
          }
          const targets = eligibleRanchTargets(this.state, b).map((t) => ({
            id: t.id,
            label: `Ranch #${t.id} · ${Math.floor(t.animals ?? 0)}/${ranchCapacity(t)}`,
          }));
          controls.ranch = {
            animals: Math.floor(b.animals ?? 0),
            capacity: ranchCapacity(b),
            max: b.maxAnimals ?? ranchCapacity(b),
            canSplit: (b.animals ?? 0) >= RANCH_SPLIT_MIN && targets.length > 0,
            canTransfer: (b.animals ?? 0) > 0 && targets.length > 0,
            targets,
          };
        } else if (b.type === 'trading') {
          controls.tradingPost = { merchantDocked: this.state.merchant.present };
        }
      }
      // Workplaces show their own name (renameable); everything else shows its type.
      this.ui.showInspect(`${def.emoji} ${buildingName(b)}`, rows, controls);
    } else {
      const c = this.state.citizens.find((x) => x.id === this.inspectSel!.id);
      if (!c) return this.clearInspect();
      const adult = c.age >= ADULT_AGE;
      const job = c.jobId !== null ? this.state.buildings.find((b) => b.id === c.jobId) : null;
      const home = c.homeId !== null ? this.state.buildings.find((b) => b.id === c.homeId) : null;
      rows.push({ label: 'Sex', value: c.sex === 'm' ? '♂ Male' : '♀ Female' });
      rows.push({ label: 'Home', value: home ? `${BUILDING_DEFS[home.type].name} #${home.id}` : 'Homeless' });
      rows.push({ label: 'Stage', value: adult ? 'Adult' : `Child · grows up at ${ADULT_AGE}` });
      rows.push({ label: 'Age', value: `${Math.floor(c.age)} yr` });
      rows.push({ label: 'Health', value: `❤️ ${Math.round(c.health)}%${c.sick ? ' · 🤒 sick' : ''}` });
      rows.push({ label: 'Happiness', value: `😊 ${Math.round(c.happiness)}%` });
      // Family: who they paired with and who lives under their roof, so the household model the
      // simulation runs on is legible rather than implicit.
      if (adult) {
        const partner = c.partnerId != null ? this.state.citizens.find((o) => o.id === c.partnerId) : null;
        // Flag a couple without a household of their own — living apart, or lodging in someone
        // else's house. They can't start a family until a house is free, so this is the player's
        // cue that building one turns them into a growing household.
        const apart = coupleNeedsAHome(this.state, c);
        rows.push({
          label: 'Partner',
          value: partner
            ? `${partner.sex === 'm' ? '👨' : '👩'} ${partner.name}${apart ? ' · 🏠 needs a home' : ''}`
            : 'Single',
        });
        const children = this.state.citizens.filter((o) => o.parents?.includes(c.id));
        if (children.length > 0) {
          const athome = children.filter((o) => o.homeId === c.homeId && o.age < ADULT_AGE).length;
          rows.push({
            label: 'Children',
            value: `${children.length}${athome > 0 ? ` (${athome} at home)` : ''}`,
          });
        }
      } else if (c.parents) {
        const parents = this.state.citizens.filter((o) => c.parents!.includes(o.id));
        if (parents.length > 0) {
          rows.push({ label: 'Parents', value: parents.map((p) => p.name).join(' & ') });
        }
      }
      if (adult) rows.push({ label: 'Schooling', value: c.educated ? 'Educated (+30% work)' : 'Uneducated' });
      if (adult) rows.push({ label: 'Work', value: job ? `${BUILDING_DEFS[job.type].name} worker` : 'Builder / laborer' });
      rows.push({
        label: 'Carrying',
        // Against the per-kind limit, so it's clear a load is 12 logs but 48 of a crop.
        value: c.carry
          ? `${RESOURCE_ICON[c.carry.kind]} ${Math.floor(c.carry.amount)}/${carryLimit(c.carry.kind)} ${c.carry.kind}`
          : 'nothing',
      });
      const face = !adult ? '🧒' : c.sex === 'm' ? '👨' : '👩';
      this.ui.showInspect(`${face} ${c.name}`, rows);
    }
  }

  /** Debug/testing helper: try to set a building on fire. */
  debugIgnite(id: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (b) igniteBuilding(this.state, b, this.log);
  }

  /** Debug/testing helper: the tile the placement ghost is standing on right now. */
  debugReticleTile(type: BuildingType): { tx: number; ty: number } {
    return this.reticleTile(type);
  }

  /** Debug/testing helper: open the trading post sheet without tapping the building. */
  debugOpenTradingPost(id: number): void {
    this.ui.openTradingPost(id);
  }

  /** Debug/testing helper: run the once-per-season fire roll without waiting for a season. */
  debugFireSeason(): void {
    fireSeason(this.state, this.log);
  }

  /** Debug/testing helper: run the simulation forward by `seconds` in fixed steps. */
  debugAdvance(seconds: number): void {
    const step = 0.1;
    for (let t = 0; t < seconds && !this.state.gameOver; t += step) {
      update(this.state, step, this.log);
    }
  }

  /**
   * Debug/testing helper: the footprint a placement would use, in tiles.
   *
   * Tests that lay out a site need the size, and hard-coding it in the spec means every
   * footprint change breaks a test for a reason that has nothing to do with what it asserts.
   * Ask the game instead.
   */
  debugFootprint(type: BuildingType): { w: number; h: number } {
    return this.placeSize(type);
  }

  /**
   * Debug/testing helper: seconds of work a building takes to put up.
   *
   * Same reasoning as `debugFootprint` — `buildTime` in the def is multiplied by
   * `BUILD_TIME_SCALE` before it means anything, and a test that sets `progress` from the raw
   * number lands at half the fraction it thinks it does.
   */
  debugBuildTime(type: BuildingType): number {
    return buildTimeOf(type);
  }

  /** Debug/testing helper: every buildable type, named, in build-menu order. */
  debugBuildNames(): string[] {
    return BUILD_ORDER.map((t) => BUILDING_DEFS[t].name);
  }

  /**
   * Debug/testing helper: the tile a building would work *from*.
   *
   * For most buildings this is the middle of the plot, but a fishing hut works off the end of
   * its dock — so a test that assumes the centre would measure the water from the wrong tile.
   */
  debugWorkCentre(type: BuildingType, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): { x: number; y: number } {
    const { w, h } = this.placeSize(type);
    return workCentre({ type, x, y, rot, w, h });
  }

  /**
   * Debug/testing helpers: the tuned consumption rates.
   *
   * Both are divided by `CONSUMPTION_SLOWDOWN`, so a test that hard-codes the pre-slowdown
   * figures would be measuring the old game rather than this one.
   */
  debugFoodPerCitizen(): number {
    return FOOD_PER_CITIZEN_PER_SEASON;
  }
  debugHeatPerCitizen(): number {
    return HEAT_PER_CITIZEN_WINTER;
  }

  /**
   * Debug/testing helper: where a villager's job would have them stand for a cycle of work.
   *
   * Tests that care about *what* a worker does, not how far they had to walk to do it, put them
   * here first — otherwise every such test is really measuring the distance to the barn on
   * whatever map was generated.
   */
  debugWorkSpot(citizenId: number): { x: number; y: number } {
    const c = this.state.citizens.find((x) => x.id === citizenId)!;
    const b = this.state.buildings.find((x) => x.id === c.jobId)!;
    return debugWorkSpotFor(this.state, c, b);
  }

  /** Debug/testing helper: the village total of one resource, as the limits rule measures it. */
  debugTotalStored(kind: ResourceKind): number {
    return totalStored(this.state, kind);
  }

  /** Debug/testing helper: food across every edible kind — what a `food` limit is judged against. */
  debugTotalFood(): number {
    return limitStock(this.state, 'food');
  }

  /** Debug/testing helper: is this building's product at its stockpile limit? */
  debugCappedOut(id: number): boolean {
    const b = this.state.buildings.find((x) => x.id === id);
    return !!b && cappedOut(this.state, b);
  }

  /** Debug/testing helper: how many workers a building type can employ. */
  debugJobCount(type: BuildingType): number {
    return BUILDING_DEFS[type].jobs;
  }

  /** Debug/testing helper: check a placement at a tile (uses the current ranch size). */
  debugCanPlace(type: BuildingType, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): { ok: boolean; reason?: string } {
    const { w, h } = this.placeSize(type);
    return canPlace(this.state, type, x, y, w, h, rot);
  }

  /** Debug/testing helper: place a building (as a construction site) at a tile. */
  debugPlace(type: BuildingType, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): number | null {
    const { w, h } = this.placeSize(type);
    const b = placeBuilding(this.state, type, x, y, w, h, rot);
    return b ? b.id : null;
  }

  /** Debug/testing helper: mark a rectangle for hand-harvesting, as the drag-select does. */
  debugHarvestRect(x0: number, y0: number, x1: number, y1: number): number {
    return markHarvestRect(this.state, x0, y0, x1, y1);
  }

  /** Debug/testing helper: push goods into the nearest storage; returns what wouldn't fit. */
  debugAddNearest(at: { x: number; y: number }, kind: ResourceKind, amount: number): number {
    return addNearest(this.state, at, kind, amount);
  }

  /** Debug/testing helper: plan a path tile directly, bypassing the drag-paint input path. */
  debugPlanPath(tier: PathTier, x: number, y: number): boolean {
    return planPath(this.state, x, y, tier);
  }

  /**
   * Debug/testing helper: paint a path tile at a known map position — the same plan-then-hold-
   * pending pair `onPaint` performs, minus the screen-to-tile conversion. Tests use this so they
   * exercise the real pending flow without depending on where the camera happens to be looking.
   */
  debugPaintPath(tier: PathTier, x: number, y: number): boolean {
    // Capture what the tile held first: `markPending` needs it so a cancelled upgrade restores
    // the road underneath instead of clearing the tile.
    const prev = inBounds(x, y) ? this.state.paths[tileIndex(x, y)] : PATH_NONE;
    if (!planPath(this.state, x, y, tier)) return false;
    markPending(this.state, x, y, prev);
    return true;
  }

  /**
   * Debug/testing helper: pin the global Builders target to exactly `n`.
   *
   * `desiredBuilders` is derived each tick from what the open sites ask for plus the player's
   * offset, so writing it directly would be overwritten on the next update. This sets the offset
   * that *produces* `n` instead, which keeps the helper meaning what it always meant — including
   * `debugSetBuilders(0)` for "nobody builds", now that placing a site asks for builders by
   * itself.
   */
  debugSetBuilders(n: number): void {
    const want = Math.max(0, n);
    this.state.builderExtra = want - autoBuilderDemand(this.state);
    this.state.desiredBuilders = want;
  }

  /** Debug/testing helper: a ranch's current head capacity (from its size + animal). */
  debugRanchCapacity(id: number): number | undefined {
    const b = this.state.buildings.find((x) => x.id === id);
    return b ? ranchCapacity(b) : undefined;
  }

  /** Debug/testing helper: the current work-circle radius of a building (undefined if none). */
  debugWorkRadius(id: number): number | undefined {
    const b = this.state.buildings.find((x) => x.id === id);
    return b ? workRadiusOf(b) : undefined;
  }

  /** Debug/testing helper: how many villagers are drawn in a coat this frame (3D only). */
  debugCoatedCount(): number {
    const r = this.renderer as Renderer3D;
    return typeof r.coatedCount === 'function' ? r.coatedCount() : 0;
  }

  /** Debug/testing helper: discard the drawn (unconfirmed) path tiles. */
  debugCancelPaths(): void {
    this.cancelPaths();
  }

  /** Debug/testing helper: rip up every path tile in a rectangle. */
  debugDemolishPathRect(x0: number, y0: number, x1: number, y1: number): number {
    return demolishPathRect(this.state, x0, y0, x1, y1);
  }

  /** Debug/testing helper: which tile a villager would go and harvest next (-1 for none). */
  debugPickHarvest(citizenId: number): number {
    const c = this.state.citizens.find((x) => x.id === citizenId);
    return c ? pickHarvestFor(this.state, c) : -1;
  }

  /** Debug/testing helper: route between tiles, returns waypoint tiles or null. */
  debugPath(fx: number, fy: number, tx: number, ty: number): { x: number; y: number }[] | null {
    return findPath(this.state, fx, fy, tx, ty);
  }

  /** Footprint the ghost/placement uses for `type` (the player-sized dims for ranch/field). */
  private placeSize(type: BuildingType): { w: number; h: number } {
    if (SIZABLE[type]) return { w: this.sizeW, h: this.sizeH };
    const def = BUILDING_DEFS[type];
    return { w: def.w, h: def.h };
  }

  private reticleTile(type: BuildingType): { tx: number; ty: number } {
    const { w, h } = this.placeSize(type);
    // Centre the *turned* footprint under the reticle, or a rotated 3x2 would sit off to one side
    // of the crosshair the player is aiming with.
    const fw = this.buildRot % 2 === 1 ? h : w;
    const fh = this.buildRot % 2 === 1 ? w : h;
    const [cx, cy] = this.camera.centerTile();
    return {
      tx: Math.round(cx - fw / 2),
      ty: Math.round(cy - fh / 2),
    };
  }

  /**
   * Show whichever decision is outstanding — drawn path tiles, or a picked demolition. Both are
   * held rather than applied, so this bar is the only way either actually happens.
   */
  private refreshConfirmBar(): void {
    const pending = pendingPathCount(this.state);
    if (pending > 0) {
      this.ui.showConfirm(
        `${pending} path tile${pending > 1 ? 's' : ''} drawn`,
        'Place',
        () => this.confirmPaths(),
        () => this.cancelPaths(),
      );
      return;
    }
    if (this.pendingDemolish) {
      this.ui.showConfirm(
        `Demolish ${this.pendingDemolish.label}?`,
        'Demolish',
        () => this.confirmDemolish(),
        () => {
          this.pendingDemolish = null;
          this.clearInspect();
        },
      );
      return;
    }
    this.ui.hideConfirm();
  }

  private persist(): void {
    saveGame(this.state, this.currentSlot);
  }

  /**
   * The single logging entry point. Every message both flashes as a toast and is filed in the
   * village chronicle (`state.events`), which the History panel scrolls back through and which
   * rides along in the save.
   */
  private log = (msg: string, kind: LogKind = 'info') => {
    recordEvent(this.state, msg, kind);
    this.ui.log(msg, kind);
  };

  private frame(t: number): void {
    // Before anything is drawn: the canvas may have changed shape since the last frame (a phone
    // rotating is the case that matters) and no event we could have listened for reports that
    // reliably. `resize` returns immediately when nothing moved.
    this.resize();

    const dtMs = this.lastTime ? t - this.lastTime : 16;
    this.lastTime = t;
    let dt = Math.min(dtMs / 1000, 0.1); // clamp to avoid huge catch-up steps

    // Camera rotation runs off real time, not the sim clock, so holding a rotate button turns the
    // view at the same rate whether the game is paused or running at 3×.
    if (this.rotateDir !== 0) this.camera.rotateBy?.(this.rotateDir * ROTATE_SPEED * dt);

    if (this.running && !this.paused && !this.state.gameOver) {
      const scaled = dt * SPEEDS[this.speedIndex];
      const wasOver = this.state.gameOver;
      update(this.state, scaled, this.log);
      this.saveAccum += dt;
      if (this.saveAccum > 5) {
        this.saveAccum = 0;
        this.persist();
      }
      if (this.state.gameOver && !wasOver) {
        this.persist();
        this.ui.showGameOver(this.state, () => this.openSizeSelect(), () => this.openMainMenu());
      }
    }

    // Build placement preview at the centre reticle.
    const placement: PlacementView = {
      type: null,
      tx: 0,
      ty: 0,
      valid: false,
      pathTier: this.selectedPath,
      selBuildingId: this.inspectSel?.kind === 'building' ? this.inspectSel.id : null,
      selCitizenId: this.inspectSel?.kind === 'citizen' ? this.inspectSel.id : null,
      marquee: this.marquee,
    };
    if (this.selectedBuild && this.running && !this.state.gameOver) {
      const { tx, ty } = this.reticleTile(this.selectedBuild);
      const { w, h } = this.placeSize(this.selectedBuild);
      placement.type = this.selectedBuild;
      placement.tx = tx;
      placement.ty = ty;
      placement.pw = w;
      placement.ph = h;
      placement.prot = this.buildRot;
      placement.valid = canPlace(this.state, this.selectedBuild, tx, ty, w, h, this.buildRot).ok;
    }

    if (this.use2d) {
      this.ctx!.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      (this.renderer as Renderer).draw(this.state, this.cw, this.ch, placement);
    } else {
      (this.renderer as Renderer3D).render(this.state, this.camera as Camera3D, placement);
    }
    this.ui.updateHud(this.state, SPEEDS[this.speedIndex], this.paused);
    this.ui.refreshPanels(this.state);
    this.refreshConfirmBar();
    if (this.inspectSel) this.refreshInspect();

    requestAnimationFrame((next) => this.frame(next));
  }
}

const game = new Game();
// Debug hook: lets you inspect/tinker from the browser console (e.g. window.__village.state).
(window as unknown as { __village: Game }).__village = game;
