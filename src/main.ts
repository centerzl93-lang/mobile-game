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
  demoFraction,
  setTradeWanted,
  tradeStaff,
  tradeCapacity,
  tradeWorking,
  BARN_CAPACITY,
  HarvestKind,
  HARVEST_KIND_META,
  MARKET_CAPACITY,
  buildWorkOf,
  buildCost,
  costOf,
  repairCostOf,
  repairFraction,
  repairWorkOf,
  FIRE_BURN_SECONDS,
  FIRE_DOUSE_TRIPS_NEEDED,
  FIRE_RESPONSE_RADIUS,
  fireIntensity,
  FESTIVAL_FOOD,
  POLICY_META,
  POLICIES,
  policyCapacity,
  activePolicies,
  PolicyId,
  UI_REFRESH_MS,
  REFUND_FRACTION,
  BUILDER_SHIFT_WORK,
  FOOD_PER_CITIZEN_PER_SEASON,
  HEAT_PER_CITIZEN_WINTER,
  workRadiusOf,
  fullWorkRadiusOf,
  buildersWantedFor,
  QUARRY_SAND_SHARE,
  PORT_ARRIVAL_CHANCE,
  PORT_PRICE_MODS,
  MERCHANT_CATEGORY_STOCK,
  MerchantCategory,
  TRADE_VALUE,
  Season,
  SEASONS,
  CONGREGATION_PER_PRIEST,
  STUDENTS_PER_TEACHER,
  EDUCATED_BONUS,
  GRADUATE_BONUS,
  EDUCATED_LONGEVITY_YEARS,
  GRADUATE_LONGEVITY_YEARS,
  OLD_AGE_START,
  workCentre,
  footprintW,
  footprintH,
  ranchCapacity,
  cullWorkPerHead,
  SIZABLE,
  RANCH_SPLIT_MIN,
  isHouse,
  HOUSE_UPGRADE,
  isDwelling,
  dwellingCapacityOf,
  SHELTER_CAPACITY,
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
  TailorRecipe,
  LuxuryRecipe,
  ResourceKind,
  RESOURCE_ICON,
  NO_TOOLS_PENALTY,
  LARDER_KINDS,
  LIMIT_STEP,
  LimitKey,
  LIMITABLE,
  carryLimit,
  RESOURCE_KINDS,
  ADULT_AGE,
  PATH_NONE,
  PATH_DIRT,
  PATH_STONE,
  PATH_TUNNEL,
  PATH_BRIDGE,
  PATH_BRIDGE_STONE,
  entranceTiles,
} from './types';
import { newGame, housingCapacity } from './game/state';
import { VillageTier, buildingUnlocked, pathUnlocked, pinTier, villageTier } from './game/tiers';
import { pinRandom, newSeed } from './game/rng';
import {
  update,
  ledgerFor,
  setPolicy,
  holdFestival,
  LogKind,
  recordEvent,
  basketTrade,
  merchantBerth,
  berthReachesOpenWater,
  placementReachable,
  dismissMerchant,
  TradeBasket,
  TradeResult,
  cullRanch,
  splitRanch,
  transferRanch,
  eligibleRanchTargets,
  igniteBuilding,
  fireSeason,
  bridgeFireSeason,
  acceptNomads,
  rejectNomads,
  markHarvestRect,
  coupleNeedsAHome,
  pickHarvestFor,
  limitStock,
  isLowStock,
  isCriticalStock,
  cappedOut,
  workplaceStatus,
  citizenToolFactor,
  wearCitizenTool,
  debugWorkSpotFor,
  debugApproach,
  debugReachable,
  avgHealth,
  avgHappiness,
  debugConverterInputs,
  debugEndSeason,
} from './game/simulation';
import {
  canPlace,
  placeBuilding,
  canAfford,
  demolishBuilding,
  markDemolish,
  cancelDemolish,
  canDemolish,
  footprintClear,
  footprintToClear,
} from './game/buildings';
import { findPath, isWalkable } from './game/pathfind';
import { bridgeDeck, BOAT_LADEN_TOP, BRIDGE_BANK_Y } from './render/bridges';
import { tileIndex, inBounds } from './game/world';
import {
  addNearest,
  totalStored,
  totalFoodAvailable,
  totalHeldAll,
  barnLoad,
  capacityOf,
  houseFuelPerSeason,
  larderFood,
  larderFoodTarget,
  larderTarget,
} from './game/storage';
import {
  planPath, markPending, pendingPathCount, confirmPendingPaths, cancelPendingPaths,
  isSpanTier, spanLine, routePath, unplanTiles, demolishPathRect, pathSpeedMult,
  markPathRaze, isRazing, dropPathRaze,
} from './game/paths';
import { saveGame, loadGame, hasSave, clearSave, slotInfo, slotName, setSlotName, SLOTS, AUTOSAVE_SLOT, rawSlot, writeRawSlot } from './game/save';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_COUNT,
  TIER_MEDAL,
  loadUnlocked,
  evaluateAchievements,
} from './game/achievements';
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

const SPEEDS = [1, 2, 5, 10];
/**
 * The largest simulation step, in seconds, that `update()` is ever handed in a single call. This
 * is the same 0.1 s the per-frame `dt` is clamped to at 1× (see `frame`), and the sim is written
 * and tested against steps of that size. Higher speeds don't hand the sim a proportionally bigger
 * step — a 1.0 s tick at 10× would behave differently from ten 0.1 s ticks at 1× (dt-scaled
 * hazard rolls like the freeze-death chance are not step-size invariant, and per-tick logistics
 * such as waypoint-by-waypoint movement can only advance one waypoint per call). Instead the
 * scaled time for the frame is spent in fixed sub-steps of at most this size, so ten seconds of
 * sim time at 10× is exactly ten seconds of the same 0.1 s ticks the game runs at 1×. Speed
 * changes elapsed sim time, never how any one tick behaves.
 */
const SIM_MAX_STEP = 0.1;
/**
 * Yaw speed (radians/sec) while a corner rotate button is held — 45°/s, so a full turn takes
 * eight seconds of holding. Rotation is continuous (not a per-tap jump) so the direction of
 * travel is legible: a discrete jump teleports the scene and reads as an arbitrary flip.
 */
const ROTATE_SPEED = Math.PI / 4;

/**
 * How often autosave writes the current slot, in real seconds. Five minutes: frequent enough that a
 * closed tab loses little, infrequent enough that it is not rewriting a multi-megabyte blob every
 * few seconds on the large map. Counted on the real clock (`saveAccum`), not the sim clock, so it is
 * the same wall-clock cadence at any game speed. Manual saves and the game-over write are separate
 * and immediate.
 */
const AUTOSAVE_SECONDS = 300;

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
  /** What a harvest drag marks: everything, or only trees / stone / iron. */
  harvestKind: HarvestKind = 'all';
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
      onTogglePolicy: (id) => {
        const on = !(this.state.policies ?? []).includes(id);
        setPolicy(this.state, id, on);
        this.refreshInspect();
      },
      onFestival: () => {
        holdFestival(this.state, this.log);
        this.refreshInspect();
      },
      onSetDemolish: (a) => this.onSetDemolish(a),
      onPauseToggle: () => this.togglePause(),
      onSpeedCycle: () => this.cycleSpeed(),
      onNewGame: () => this.openNewGameSetup(true),
      onOpenMenu: () => this.openPauseMenu(),
      onSetWorkers: (id, d) => this.setWorkers(id, d),
      onSetTradeWorkers: (type, d) => this.setTradeWorkers(type, d),
      onDemolishBuilding: (id, on) => this.setBuildingDemolish(id, on),
      onUpgradeBuilding: (id) => this.upgradeBuilding(id),
      onRenameBuilding: (id, name) => this.renameBuilding(id, name),
      onSetBuilders: (d) => this.setBuilders(d),
      onSetLimit: (kind, d) => this.setLimit(kind, d),
      onSetMineOutput: (id, o) => this.setMineOutput(id, o),
      onSetSmithRecipe: (id, r) => this.setSmithRecipe(id, r),
      onSetTailorRecipe: (id, r) => this.setTailorRecipe(id, r),
      onSetLuxuryRecipe: (id, r) => this.setLuxuryRecipe(id, r),
      onSetForesterReplant: (id, on) => this.setForesterReplant(id, on),
      onSetBuildingEnabled: (id, on) => this.setBuildingEnabled(id, on),
      onSetCrop: (id, crop) => this.setCrop(id, crop),
      onSetAnimal: (id, animal) => this.setAnimal(id, animal),
      onSizeChange: (dim, delta) => this.onSizeChange(dim, delta),
      onRotateBuild: () => this.onRotateBuild(),
      onPlaceBuild: () => this.placeAtReticle(),
      onSetRanchMax: (id, delta) => this.setRanchMax(id, delta),
      onSetRanchMaxTo: (id, value) => this.setRanchMaxTo(id, value),
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
    // Changing tier, or putting the tool down, starts the next road from scratch — an anchor
    // planted for a dirt track is not where the player meant to begin a tunnel.
    if (tier !== this.selectedPath) {
      this.cancelPaths();
    }
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

  private onSelectHarvest(kind: HarvestKind | null): void {
    const active = kind !== null;
    this.harvestMode = active;
    if (kind) this.harvestKind = kind;
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
      this.harvestKind,
    );
    const meta = HARVEST_KIND_META[this.harvestKind];
    const erasing = this.harvestKind === 'clear';
    this.ui.flashHint(
      n > 0
        ? erasing
          ? `Called off ${n} order${n > 1 ? 's' : ''}`
          : `Marked ${n} tile${n > 1 ? 's' : ''} for harvest`
        : erasing
          ? 'No orders in that square'
          : `Nothing to take there — this drag marks ${meta.hint}`,
    );
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
   * Nudge a resource's stockpile cap. `delta` is in units of `LIMIT_STEP` — the panel's single
   * chevron passes ±1, the double one ±2, so this one multiply covers both step sizes. Zero means
   * no limit, and the first tap up from no limit lands on the current stock rounded up to a step
   * rather than on some arbitrary number — a cap you set while looking at the panel should be
   * about where the stock is now.
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

  /** Adjust the global Builders target (clamped between nobody and every adult). */
  private setBuilders(delta: number): void {
    const adults = this.state.citizens.reduce((n, c) => n + (c.age >= ADULT_AGE ? 1 : 0), 0);
    // Builders are assigned by hand and stay put — the game never conscripts them for outstanding
    // work the way it once did — so the stepper moves the target itself, plain and simple.
    this.state.desiredBuilders = Math.max(0, Math.min(adults, (this.state.desiredBuilders ?? 0) + delta));
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

  private setLuxuryRecipe(id: number, recipe: LuxuryRecipe): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (b && b.type === 'luxury') {
      b.recipe = recipe;
      this.refreshInspect();
      this.persist();
    }
  }

  private setTailorRecipe(id: number, recipe: TailorRecipe): void {
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

  private setBuildingEnabled(id: number, on: boolean): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (b) {
      // Store the flag only when it is off, so a running building carries no extra field and old
      // saves (no flag) read as enabled. The next `assignHomesAndJobs` releases or re-hires its
      // workers; `desiredWorkers` is left alone so the staffing is restored when it comes back on.
      if (on) delete b.enabled;
      else b.enabled = false;
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

  /**
   * Move a profession's wanted count. The job board is per trade, so this spreads the change over
   * that trade's buildings — and parks it in `tradeExtra` when there is nowhere for it to go.
   */
  private setTradeWorkers(type: BuildingType, delta: number): void {
    setTradeWanted(this.state, type, delta);
    this.persist();
  }

  /** Mark a building for demolition from its own sheet, or take the mark back off. */
  private setBuildingDemolish(id: number, on: boolean): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b) return;
    if (on) {
      // Cancelling a construction site is instant and irreversible — the site vanishes and only
      // ~90% of the delivered materials come back — so it goes through the confirm bar rather than
      // firing on the tap. A finished building's demolition is a reversible *mark*, so it does not.
      if (!b.built && !b.razed) {
        if (!canDemolish(this.state, b)) {
          this.ui.flashHint('Your last barn has to stay standing');
          return;
        }
        this.pendingDemolish = { kind: 'building', ids: [id], label: buildingName(b) };
        return; // the confirm bar carries it out — see refreshConfirmBar / confirmDemolish
      }
      if (!markDemolish(this.state, b)) {
        this.ui.flashHint('Your last barn has to stay standing');
        return;
      }
      // A site cancelled outright is gone; there is nothing left to keep selected.
      if (!this.state.buildings.includes(b)) this.clearInspect();
      else this.ui.log(`${buildingName(b)} marked for demolition`, 'info');
    } else {
      cancelDemolish(b);
      this.ui.flashHint('Demolition called off');
    }
    this.persist();
    if (this.inspectSel) this.refreshInspect();
  }

  /**
   * Climb a home up the housing ladder — house → stone house → grand house. It is a demolition with
   * a note attached: builders pull the old house down and cart the salvage off exactly as they
   * would for any other, and then the plot becomes the construction site for its replacement rather
   * than going back to grass.
   *
   * The next rung is only offered once the village has reached the tier that unlocks it, the same
   * gate as building that type new — so this guards on `buildingUnlocked` too, in case the handler
   * is reached (a stale sheet, the debug hook) after the tier has slipped below it.
   */
  private upgradeBuilding(id: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b || !b.built) return;
    const to = HOUSE_UPGRADE[b.type];
    if (!to || !buildingUnlocked(this.state, to)) return;
    markDemolish(this.state, b, to);
    this.ui.log(`${buildingName(b)} is being rebuilt as a ${BUILDING_DEFS[to].name}`, 'info');
    this.persist();
    if (this.inspectSel) this.refreshInspect();
  }

  /** Set a ranch's desired herd cap (clamped 0..capacity). */
  private setRanchMax(id: number, delta: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b || b.type !== 'ranch') return;
    this.applyRanchMax(b, (b.maxAnimals ?? ranchCapacity(b)) + delta);
  }

  /** Set a ranch's herd limit to an exact figure — what the limit slider commits. */
  private setRanchMaxTo(id: number, value: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b || b.type !== 'ranch') return;
    this.applyRanchMax(b, value);
  }

  /** Clamp and store a ranch's herd limit (0..capacity). Anything over it the rancher culls. */
  private applyRanchMax(b: Building, value: number): void {
    b.maxAnimals = Math.max(0, Math.min(ranchCapacity(b), Math.round(value)));
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

  /** Where the current path drag is anchored, and the tiles that stroke has planned so far. */
  private strokeStart: { x: number; y: number } | null = null;
  private strokeTiles: number[] = [];

  /**
   * A road is two ends, and the second one keeps moving until the player is happy.
   *
   * The first touch plants the start. Every touch after that — drag or tap — moves the *end*, and
   * the route between them is re-found and re-drawn each time, so the player can let go, look at
   * what the village would build, and then shift the far end without starting again. Only
   * confirming or cancelling releases the anchor.
   *
   * This used to end with the finger: lifting cleared the start, so the next touch anchored a
   * fresh stroke somewhere else and the road you were half-way through choosing became two roads.
   */
  private onPaintStart(sx: number, sy: number): void {
    if (!this.selectedPath || !this.running || this.state.gameOver) return;
    const [wx, wy] = this.camera.screenToTile(sx, sy, this.cw, this.ch);
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    if (!this.strokeStart) this.beginStroke(tx, ty);
    else this.paintStroke(tx, ty);
  }

  /** Anchor a path drag at a tile and draw its first (single-tile) route. */
  private beginStroke(tx: number, ty: number): void {
    this.strokeStart = { x: tx, y: ty };
    this.strokeTiles = [];
    this.paintStroke(tx, ty);
    this.ui.showHint('Drag to move the far end — the route follows. Confirm when it looks right.');
  }

  /** The anchor outlives the finger; only a decision about the route lets go of it. */
  private clearStroke(): void {
    this.strokeStart = null;
    this.strokeTiles = [];
  }

  private onPaintEnd(): void {
    // Deliberately nothing: the route stays on screen with its anchor intact.
  }

  /**
   * Draw the road the finger is asking for. Nothing is committed: the whole stroke is re-planned
   * from the anchor to wherever the pointer is now, on every move, and it all sits pending until
   * the confirm bar is accepted.
   *
   * The player is not tracing the road tile by tile — they are naming two ends, and `routePath`
   * finds the sensible way between them, holding a straight line where the ground allows and
   * joining onto roads that are already there. So dragging around a lake redraws the route
   * instead of smearing a trail of every tile the finger passed over, and a wobbly drag still
   * produces a road worth building.
   *
   * A bridge or tunnel is the exception and stays a straight span: a crossing is one decision,
   * from bank to bank, and there is nothing to route around inside it.
   */
  private onPaint(sx: number, sy: number): void {
    if (!this.selectedPath || !this.running || this.state.gameOver) return;
    const [wx, wy] = this.camera.screenToTile(sx, sy, this.cw, this.ch);
    this.paintStroke(Math.floor(wx), Math.floor(wy));
  }

  private paintStroke(tx: number, ty: number): void {
    if (!this.selectedPath) return;
    const from = this.strokeStart;
    if (!from) return;
    const line = isSpanTier(this.selectedPath)
      ? spanLine(from.x, from.y, tx, ty)
      : routePath(this.state, from.x, from.y, tx, ty);
    // No way through — the finger is over water, rock or a building. Hold the last good route on
    // screen rather than blinking it away and back as the pointer crosses an obstacle.
    if (!line) return;
    unplanTiles(this.state, this.strokeTiles);
    this.strokeTiles = [];
    for (const p of line) {
      const prev = inBounds(p.x, p.y) ? this.state.paths[tileIndex(p.x, p.y)] : PATH_NONE;
      // Tiles the tier cannot take are skipped, not fatal: it is what lets a bridge drag start
      // and end on dry land, and a road route run through a stretch that is already paved.
      if (!planPath(this.state, p.x, p.y, this.selectedPath)) continue;
      markPending(this.state, p.x, p.y, prev);
      this.strokeTiles.push(tileIndex(p.x, p.y));
    }
  }

  /** Accept the drawn path tiles — villagers can now lay them. */
  private confirmPaths(): void {
    this.clearStroke();
    const n = confirmPendingPaths(this.state);
    if (n > 0) this.ui.flashHint(`${n} path tile${n > 1 ? 's' : ''} queued for the builders`);
    this.persist();
  }

  /** Throw the drawn path tiles away, clearing them back to bare ground. */
  private cancelPaths(): void {
    this.clearStroke();
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
      let refused = 0;
      let cancelled = 0; // construction sites, which vanish rather than being marked
      let last = '';
      for (const id of target.ids) {
        const b = this.state.buildings.find((x) => x.id === id);
        if (!b) continue;
        last = buildingName(b);
        const wasSite = !b.built && !b.razed;
        if (markDemolish(this.state, b)) {
          n++;
          if (wasSite) cancelled++;
        } else refused++;
      }
      // Marked, not gone: builders have to come and pull a finished building down. A construction
      // site is the exception and vanishes on the spot — there is nothing standing to tear apart —
      // so it reads as cancelled, not marked.
      if (cancelled === n && n === 1) this.ui.log(`${last} construction cancelled`, 'info');
      else if (n === 1) this.ui.log(`${last} marked for demolition`, 'info');
      else if (n > 1) this.ui.log(`${n} buildings marked for demolition`, 'info');
      if (refused > 0) this.ui.flashHint('Your last barn has to stay standing');
    } else {
      // Marked, not gone: a standing road keeps carrying villagers until a builder or free laborer
      // reaches it and pulls it up, hauling the salvage off — the same "mark now, work later" a
      // building demolition uses. A tile that was only ever a plan is simply un-drawn.
      const marked = markPathRaze(this.state, target.ids[0]);
      if (marked === 'razed') this.ui.log('Path marked for removal', 'info');
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

  /**
   * A fire, a bridge burning, or a sickness breaking out (`GameState.disasterAlert`) snaps the
   * game back to 1× the instant the frame loop notices it, so a player who stepped away to another
   * part of the village at 10× comes back to something they can actually react to rather than a
   * building that finished burning three sub-steps ago. Only the speed changes — pause, camera and
   * everything else are left exactly as the player had them.
   *
   * Called once per real frame from `frame`, and once per emulated frame from
   * `debugAdvanceAtSpeed` — the two places sim time actually advances at a chosen speed — so a
   * test can pin the same behaviour a live game gets without going through `requestAnimationFrame`.
   */
  private applyDisasterSpeedReset(): void {
    if (!this.state.disasterAlert) return;
    this.state.disasterAlert = false;
    if (this.speedIndex !== 0) {
      this.speedIndex = 0;
      this.ui.updateHud(this.state, SPEEDS[this.speedIndex], this.paused);
    }
  }

  /**
   * Start a fresh game and write it to `slot`. Directly startable (difficulty-select + headless
   * drivers). Defaults to the autosave slot — the real new-game flow founds a village there and
   * the running game autosaves there from then on. Tests pass a manual slot index to seed one.
   */
  startNewGame(
    size: MapSize = 'small',
    difficulty: Difficulty = 'normal',
    disasters = true,
    slot: number = AUTOSAVE_SLOT,
    seed?: number,
  ): void {
    this.state = newGame(size, difficulty, disasters, seed);
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
    saveGame(this.state, slot);
    this.ui.log('A fresh village begins', 'good');
  }

  // ---- menu flow ----
  /** The title screen: New Game, Continue / Load (if a save exists), Settings. */
  private openMainMenu(): void {
    this.running = false;
    this.paused = false;
    this.ui.showMainMenu({
      hasAutosave: hasSave(AUTOSAVE_SLOT), // a game in progress → Continue
      hasManualSave: hasSave(),           // any of the manual slots → Load Game
      onNew: () => this.openNewGameSetup(true),
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
  /**
   * What the New Village screen currently has selected. Kept on the app rather than in the card so
   * the settings survive the card being re-rendered, which every toggle does.
   */
  private newGameOpts: {
    size: MapSize;
    difficulty: Difficulty;
    disasters: boolean;
    seed: number;
    name: string;
  } = {
    size: 'small',
    difficulty: 'normal',
    disasters: true,
    seed: newSeed(),
    name: '',
  };
  /** Whether New Village was opened mid-game, so Back knows which menu it came from. */
  private newGameFromGame = false;

  /**
   * The one screen a new village is set up on: size, difficulty, disasters, seed.
   *
   * `fresh` means the player has just asked for a new game rather than changed a toggle, so it
   * rolls a new seed — reopening the screen should not silently re-found the same village, but
   * flicking between Small and Large should not throw away a seed that was typed in either.
   */
  private openNewGameSetup(fresh = false): void {
    if (fresh) {
      this.newGameFromGame = this.running;
      this.newGameOpts.seed = newSeed();
      this.newGameOpts.name = '';
    }
    this.running = false;
    this.ui.showNewGameSetup({
      ...this.newGameOpts,
      // The name is optional, so show a neutral placeholder. A new village founds itself in the
      // autosave slot (never a manual slot), so there is no slot number to name here.
      slotLabel: 'Little Village',
      onChange: (patch) => {
        Object.assign(this.newGameOpts, patch);
        this.openNewGameSetup(); // re-render with the new selection
      },
      onStart: ({ seed, name }) => {
        this.newGameOpts.seed = seed;
        this.newGameOpts.name = name;
        this.beginNewGame(name);
      },
      onBack: () => (this.newGameFromGame ? this.openPauseMenu() : this.openMainMenu()),
    });
  }

  /** Found a new village in the autosave slot and start play. A new game never touches a manual
   * slot — those are the player's hard saves, written only from the Save screen. */
  private beginNewGame(name: string): void {
    const { size, difficulty, disasters, seed } = this.newGameOpts;
    this.startNewGame(size, difficulty, disasters, AUTOSAVE_SLOT, seed);
    setSlotName(AUTOSAVE_SLOT, name); // the running village carries its name on the autosave slot
  }

  /**
   * Write the running village into a manual slot as a hard save, carrying its name onto the slot so
   * the save list shows it, then return to the pause menu. The autosave slot is unaffected — this is
   * a separate snapshot, not where the game continues to autosave.
   */
  private saveToSlot(slot: number): void {
    const ok = saveGame(this.state, slot);
    // Stamp the slot with the village's current name (blank clears it to the default "Slot N"), so
    // an overwritten slot never keeps the replaced village's name.
    if (ok) setSlotName(slot, slotName(AUTOSAVE_SLOT) ?? '');
    const label = slotName(slot) ?? `Slot ${slot + 1}`;
    this.ui.flashHint(ok ? `Saved to ${label}` : 'Could not save — storage may be full');
    this.openPauseMenu();
  }

  /**
   * Confirm before a manual save overwrites an existing hard save in `slot`. Cancel returns to the
   * Save list and leaves the slot untouched; only Overwrite writes. `back` is the Save list's own
   * back target, so cancelling lands where the player was.
   */
  private confirmManualOverwrite(slot: number, back: () => void): void {
    const info = slotInfo(slot);
    if (!info) {
      this.saveToSlot(slot); // nothing there (or unreadable) — just save
      return;
    }
    this.ui.showOverwriteConfirm({
      title: info.name ?? `Slot ${slot + 1}`,
      year: info.year,
      pop: info.pop,
      size: info.size,
      onConfirm: () => this.saveToSlot(slot),
      onCancel: () => this.openSlotSelect('save', back),
    });
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
        } else if (hasSave(slot)) {
          // Overwriting an existing hard save asks first, naming the village being replaced.
          this.confirmManualOverwrite(slot, back);
        } else {
          this.saveToSlot(slot); // empty slot — write straight away
        }
      },
      onRename: (slot, name) => {
        if (name.trim() === (slotName(slot) ?? '')) return; // blur with nothing typed
        setSlotName(slot, name);
        this.openSlotSelect(mode, back); // redraw so the row title follows the field
      },
      onDelete: (slot) => {
        // Manual slots are static snapshots — the live game autosaves elsewhere — so deleting one is
        // always safe (it will not be silently rewritten by an autosave).
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

  /**
   * Resume a saved village and play on. With no argument this is **Continue** — it loads the
   * autosave slot (the game in progress). Given a manual slot, it is **Load** — that hard save
   * becomes the live game, so it is copied into the autosave slot and the game autosaves there from
   * now on (Continue will resume it, not the game that was live before). Falls back to the main menu
   * if there is no valid save.
   */
  private continueGame(slot?: number): void {
    const target = typeof slot === 'number' ? slot : AUTOSAVE_SLOT;
    const saved = loadGame(target);
    if (saved == null) {
      this.ui.flashHint('No saved village to load');
      this.openMainMenu();
      return;
    }
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
    // Loading a hard save makes it the live game: carry its name onto the autosave slot and write it
    // there, so autosave continues this village and Continue resumes it. (For Continue itself the
    // target already is the autosave slot, so this just rewrites it in place.)
    if (target !== AUTOSAVE_SLOT) setSlotName(AUTOSAVE_SLOT, slotName(target) ?? '');
    this.persist();
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
      onAchievements: () => this.openAchievements(() => this.openPauseMenu()),
      onSettings: () => this.openSettings(() => this.openPauseMenu()),
      onMainMenu: () => this.openMainMenu(),
    });
  }

  /** The achievements ledger, opened from the pause menu. */
  private openAchievements(onBack: () => void): void {
    this.ui.showAchievements({
      items: ACHIEVEMENTS.map((a) => ({
        title: a.title,
        medal: TIER_MEDAL[a.tier],
        tier: a.tier,
        unlocked: this.unlockedAchievements.has(a.id),
      })),
      count: this.unlockedAchievements.size,
      total: ACHIEVEMENT_COUNT,
      onBack,
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
    const unreachable = !placementReachable(this.state, this.selectedBuild, tx, ty, w, h, this.buildRot);
    const placed = placeBuilding(this.state, this.selectedBuild, tx, ty, w, h, this.buildRot);
    const name = BUILDING_DEFS[this.selectedBuild].name;
    const needsClearing = placed !== null && !footprintClear(this.state, placed);
    // Only speak up when the siting needs the player to *do* something: nothing can reach the plot,
    // or there is ground to clear under it first. A plain, buildable site says nothing — the ghost
    // snapping into place is confirmation enough, builders are demanded automatically, and a line
    // per placement only buried the warnings that matter under a stream of "site marked" noise.
    if (unreachable) {
      this.ui.log(`${name} site marked — but nothing can reach it; lay a road or bridge to it first`, 'bad');
    } else if (needsClearing) {
      this.ui.log(`${name} site marked — clear the trees and stone under it first`, 'info');
    }
    this.persist();
    // A placed building closes the build menu and drops back to the plain screen. Siting one is a
    // deliberate act with its own Build button, not a brush you sweep across the map, and leaving
    // the category open with the ghost still armed only invited an accidental second placement.
    // If the village can no longer afford another, say so on the way out.
    const affordMore = canAfford(this.state, this.selectedBuild);
    this.selectedBuild = null;
    this.ui.clearSelection();
    this.ui.hideSizeWidget();
    if (!affordMore) this.ui.flashHint('Not enough materials in storage for another');
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
    if (isRazing(this.state, idx)) {
      // Tapping a road already queued for teardown calls the order off — nothing was lost, so like
      // un-marking a harvest it needs no confirmation.
      dropPathRaze(this.state, idx);
      this.pendingDemolish = null;
      this.persist();
    } else if (this.state.paths[idx] !== PATH_NONE) {
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

  /**
   * A short, live description of what a villager is doing this moment — errands, work, a break —
   * read off their runtime state rather than any stored plan. The inspect sheet refreshes on the UI
   * clock, so this keeps pace as they move between tasks.
   */
  private citizenDoing(c: Citizen): string {
    // Children and the unwell come first: neither is part of the workforce.
    if (c.age < ADULT_AGE) return c.student ? '📚 At school' : '🧒 Playing';
    if (c.sick) return '🤒 Laid up ill';
    // Groceries beat production: a `toLarder`/`toHouse` carry is household supplies, not output.
    if (c.task?.kind === 'toLarder') return '🏠 Carrying supplies home';
    if (c.task?.kind === 'toHouse') return '🛒 Delivering groceries';
    if ((c.rest ?? 0) > 0) return '☕ Taking a break';
    if (c.carry) return `📦 Hauling ${c.carry.kind} to the barns`;
    const job = c.jobId != null ? this.state.buildings.find((b) => b.id === c.jobId) : null;
    if (job && job.built) {
      const name = buildingName(job);
      if (c.inside) return `⚒️ Working — ${name}`;
      // Outdoor trades never step inside; treat being anywhere in the work circle as on the job,
      // and only the walk out to it as heading there.
      const cx = job.x + footprintW(job) / 2;
      const cy = job.y + footprintH(job) / 2;
      const reach = (fullWorkRadiusOf(job.type) ?? 3) + 2;
      const near = (c.x - cx) ** 2 + (c.y - cy) ** 2 <= reach * reach;
      return near ? `⚒️ Working — ${name}` : `🚶 Heading to ${name}`;
    }
    // A dedicated builder, or a free hand pitching in on the sites and the roads.
    return c.builder ? '🔨 On the build crew' : '🧺 Lending a hand';
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
        const pct = Math.floor((b.progress / buildWorkOf(b.type)) * 100);
        // Colour the status so a site plainly in the way (ground to clear) reads as such, and give a
        // clear plot at 0% a reason rather than the bare number — a plot that never moves reads as
        // broken until the sheet names what it is waiting on.
        rows.push({
          label: 'Status',
          value: clearing > 0 ? 'Clearing the ground' : `Building ${pct}%`,
          tone: clearing > 0 ? 'warn' : 'good',
        });
        // The stall the materials list below cannot show: nobody free to raise it. Builders are any
        // idle adult, so an empty count means every hand is spoken for elsewhere — the fix is on the
        // Job Board, not on this plot.
        const builders = this.state.citizens.reduce((n, c) => n + (c.builder ? 1 : 0), 0);
        if (clearing === 0 && pct < 100 && builders === 0) {
          rows.push({ label: '—', value: 'No free builders — raise them on the Job Board', tone: 'warn' });
        }
        if (clearing > 0) {
          rows.push({ label: '—', value: `${clearing} tile${clearing > 1 ? 's' : ''} to clear first` });
          if (left.trees > 0) rows.push({ label: '🌲 Trees', value: `${left.trees} to fell` });
          if (left.stone > 0) rows.push({ label: `${RESOURCE_ICON.stone} Stone`, value: `${left.stone} to gather` });
          if (left.iron > 0) rows.push({ label: `${RESOURCE_ICON.iron} Iron`, value: `${left.iron} to gather` });
        }
        for (const [k, amt] of Object.entries(costOf(b)) as [ResourceKind, number][]) {
          rows.push({ label: `${RESOURCE_ICON[k]} ${k}`, value: `${Math.floor(b.store[k] ?? 0)}/${amt} delivered` });
        }
      } else if (b.fireTimer || b.damaged) {
        // BURNING/DAMAGED: the one state every building type shows the same way, workplace or
        // home — `workplaceStatus` below only speaks for producers, so a house on fire needs its
        // own line here rather than falling through to residents/larder rows that no longer apply
        // (its occupants were turned out the moment it caught — see `tryIgnite`).
        if (b.fireTimer) {
          rows.push({ label: 'Status', value: '🔥 On fire — evacuated, not working', tone: 'bad' });
          const water = b.fireWater ?? 0;
          rows.push({
            label: 'Bucket brigade',
            value: `${Math.min(water, FIRE_DOUSE_TRIPS_NEEDED)}/${FIRE_DOUSE_TRIPS_NEEDED} loads — ${
              water >= FIRE_DOUSE_TRIPS_NEEDED ? 'may survive' : 'needs more water, fast'
            }`,
            tone: water >= FIRE_DOUSE_TRIPS_NEEDED ? 'good' : 'warn',
          });
        } else {
          rows.push({ label: 'Status', value: '⚠️ Damaged — awaiting repair', tone: 'bad' });
          const cost = repairCostOf(b);
          const pct = Math.floor(repairFraction(b) * 100);
          rows.push({ label: 'Repair', value: `${pct}% — builders will finish it` });
          for (const [k, amt] of Object.entries(cost) as [ResourceKind, number][]) {
            rows.push({
              label: `${RESOURCE_ICON[k]} ${k}`,
              value: `${Math.floor(b.repairStore?.[k] ?? 0)}/${amt} delivered`,
            });
          }
        }
      } else {
        // Why this workplace is (or isn't) producing, in one coloured line above the numbers: switched
        // off, short of hands, out of a material, capped, or slowed for want of tools. It is the answer
        // to "everyone's here, so why is nothing coming out?" — see `workplaceStatus`.
        const status = workplaceStatus(this.state, b);
        if (status) rows.push({ label: 'Status', value: status.text, tone: status.tone });
        if (def.jobs > 0) rows.push({ label: 'Workers', value: `${b.workers.length}/${b.desiredWorkers}` });
        if (isDwelling(b.type)) {
          const residents = this.state.citizens.filter((c) => c.homeId === b.id);
          rows.push({ label: 'Residents', value: `${residents.length}/${dwellingCapacityOf(b.type)}` });
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
        if (b.type === 'tailor') rows.push({ label: 'Sewing from', value: `${b.recipe}` });
        if (b.type === 'luxury') {
          const bench: Record<LuxuryRecipe, string> = {
            glass: '🔷 glass, from sand and coal',
            jewelry: '💍 jewellery, from glass and iron',
            finejewelry: '👑 fine jewellery, from jewellery and gold',
            fineclothes: '👗 fine clothes, from dye and silk',
          };
          rows.push({ label: 'At the bench', value: bench[(b.recipe as LuxuryRecipe) ?? 'glass'] });
        }
        if (b.type === 'farm') {
          rows.push({ label: 'Crop', value: b.crop ? `${CROP_META[b.crop].emoji} ${CROP_META[b.crop].label}` : '🌱 No seed — buy from a trader' });
          rows.push({ label: 'Field', value: `${footprintW(b)}×${footprintH(b)}` });
          rows.push({ label: 'Growth', value: `${Math.round((b.growth ?? 0) * 100)}%` });
        }
        if (b.type === 'ranch') {
          const a = ANIMAL_META[b.animal ?? 'cattle'];
          rows.push({ label: 'Raising', value: `${a.emoji} ${a.label}` });
          rows.push({ label: 'Herd', value: `${Math.floor(b.animals ?? 0)} / ${ranchCapacity(b)} (${footprintW(b)}×${footprintH(b)})` });
          const limit = b.maxAnimals ?? ranchCapacity(b);
          rows.push({ label: 'Herd limit', value: `${limit}` });
          // Over the limit? The rancher is thinning it by hand — surface how many head are still for
          // the knife so the slaughter is visible progress, not a silent stall.
          const overCap = Math.floor(b.animals ?? 0) - limit;
          if (overCap > 0) rows.push({ label: 'Culling', value: `🔪 ${overCap} head`, tone: 'warn' });
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
        // sheet doesn't list the same supplies twice. The rest — chiefly a barn, which can hold two
        // dozen kinds at once — pack two to a line (`grid`) so a full storehouse reads at a glance
        // instead of scrolling off the sheet.
        if (!isDwelling(b.type)) {
          for (const k of RESOURCE_KINDS) {
            const v = b.store[k] ?? 0;
            if (v > 0.5) rows.push({ label: `${RESOURCE_ICON[k]} ${k}`, value: `${Math.floor(v)}`, grid: true });
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
        controls = {
          ...controls,
          buildingId: b.id,
          workers: { value: b.desiredWorkers, max: def.jobs },
          // Every staffed workplace can be switched off; a disabled one reads as such and keeps its
          // worker count for when it is switched back on.
          enable: { on: b.enabled !== false },
        };
        // The books and the rules are what a Town Hall is *for*, so they arrive with the building
        // and are found by tapping it rather than taking up room in the HUD.
        if (b.type === 'townhall' && b.built) {
          const enacted = this.state.policies ?? [];
          const active = activePolicies(this.state);
          const capacity = policyCapacity(this.state);
          controls = {
            ...controls,
            townhall: {
              // One row per resource the village actually holds or moved last season — asking for
              // all thirty would bury the four that matter under a wall of zeroes.
              ledger: RESOURCE_KINDS.map((kind) => ({ kind, row: ledgerFor(this.state, kind) }))
                .filter(({ row }) => row && (row.stock > 0.01 || Math.abs(row.net) > 0.01))
                .map(({ kind, row }) => ({ kind, ...row! })),
              policies: POLICIES.map((id) => ({
                id,
                ...POLICY_META[id],
                enacted: enacted.includes(id),
                active: active.includes(id),
              })),
              capacity,
              canFestival: capacity >= 1 && totalFoodAvailable(this.state) >= FESTIVAL_FOOD,
            },
          };
        }
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
        } else if (b.type === 'tailor') {
          controls.toggle = { group: 'tailor', options: [
            { v: 'leather', label: '🟫 Leather', on: b.recipe !== 'wool' },
            { v: 'wool', label: '🧶 Wool', on: b.recipe === 'wool' },
          ] };
        } else if (b.type === 'luxury') {
          controls.toggle = { group: 'luxury', options: [
            { v: 'glass', label: '🔷 Glass', on: b.recipe === 'glass' || b.recipe === undefined },
            { v: 'jewelry', label: '💍 Jewellery', on: b.recipe === 'jewelry' },
            { v: 'finejewelry', label: '👑 Fine jewellery', on: b.recipe === 'finejewelry' },
            { v: 'fineclothes', label: '👗 Fine clothes', on: b.recipe === 'fineclothes' },
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
        } else if (b.type === 'trading' || b.type === 'port') {
          // Docked *here*, not merely docked: a town with both a post and a harbour has two of
          // these sheets, and a fleet at the quay is no use to the river wharf.
          controls.tradingPost = {
            merchantDocked:
              this.state.merchant.present && merchantBerth(this.state)?.id === b.id,
            port: b.type === 'port',
            // Built on water with no channel to the sea: no boat can ever reach it, so warn.
            landlocked: !berthReachesOpenWater(this.state, b),
          };
        }
      }
      // Demolition and upgrades live on the sheet, not only under the Demolish tool: by the time
      // you have tapped a building to read about it, "and take it away" is the obvious next thing
      // to want, and hunting for a tool at the other end of the screen to do it is not.
      if (b.built) {
        if (b.demolish) {
          rows.push({
            label: '💥 Demolition',
            value: b.demoProgress
              ? `${Math.floor(demoFraction(b) * 100)}% pulled down`
              : 'Waiting on a builder',
          });
          if (b.upgradeTo) {
            rows.push({ label: '⬆️ Then', value: `${BUILDING_DEFS[b.upgradeTo].name} on this spot` });
          }
        }
        controls = {
          ...controls,
          buildingId: b.id,
          demolish: {
            marked: !!b.demolish,
            blocked: !b.demolish && !canDemolish(this.state, b),
            underway: (b.demoProgress ?? 0) > 0,
          },
        };
        // Offer the next rung of the housing ladder, but only once the village's tier has unlocked
        // it — the same gate as building that home type new, so housing progression follows the
        // settlement tier like everything else (no leaping a settlement's houses to stone before it
        // is a hamlet). A grand house is the top rung and offers nothing further.
        const up = HOUSE_UPGRADE[b.type];
        if (up && !b.demolish && buildingUnlocked(this.state, up)) {
          const cost = (Object.entries(BUILDING_DEFS[up].cost) as [ResourceKind, number][])
            .map(([k, a]) => `${RESOURCE_ICON[k]}${a}`)
            .join(' ');
          controls.upgrade = { to: BUILDING_DEFS[up].name, cost };
        }
      } else if (!b.razed) {
        // An unfinished construction site: no walls to pull down, so the sheet offers to cancel it
        // outright. `construction` swaps the button to "Cancel construction"; the click is routed
        // through the confirm bar (see `setBuildingDemolish`) because the refund is only partial and
        // the site vanishes at once — there is no undo once it is gone.
        controls = {
          ...controls,
          buildingId: b.id,
          demolish: { marked: false, blocked: !canDemolish(this.state, b), underway: false, construction: true },
        };
      } else if (b.razed) {
        // Rubble: what is still to be carted off, and what happens to the plot afterwards.
        let left = 0;
        for (const k of RESOURCE_KINDS) left += b.store[k] ?? 0;
        rows.unshift({ label: 'Status', value: 'Rubble — salvage being carted off' });
        rows.push({ label: '📦 To haul', value: `${Math.floor(left)} items` });
        if (b.upgradeTo) {
          rows.push({ label: '⬆️ Then', value: `${BUILDING_DEFS[b.upgradeTo].name} on this spot` });
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
      // What they are up to right now, at the top where a glance finds it.
      rows.push({ label: 'Doing', value: this.citizenDoing(c) });
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
      // Which tool this *specific* villager is holding — a personal belonging (`Citizen.tool`), not
      // a village-wide fact, so two workers at the same bench can read differently here. Children
      // carry none, so the row is for working-age villagers only.
      if (adult) {
        const toolValue =
          c.tool === 'steel'
            ? `${RESOURCE_ICON.steeltools} Steel tools (+15% work)`
            : c.tool === 'iron'
              ? `${RESOURCE_ICON.tools} Iron tools`
              : '✋ Bare hands (−25% work) — picks one up at the next barn with a spare';
        rows.push({ label: 'Tool', value: toolValue, tone: c.tool ? undefined : 'warn' });
      }
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

  /** Debug/testing helper: the game-speed multiplier index — 0 is 1×, see `SPEEDS`. */
  debugSpeedIndex(): number {
    return this.speedIndex;
  }

  /** Debug/testing helper: set the game-speed multiplier index directly, bypassing the toolbar. */
  debugSetSpeedIndex(n: number): void {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, n));
  }

  /**
   * Debug/testing helper: apply the same "a disaster snaps the speed back to 1×" check
   * `frame`/`debugAdvanceAtSpeed` run on their own — for a test that ignites/etc. through a path
   * (`debugIgnite`, `debugFireSeason`, `debugAdvance`) that doesn't already emulate a frame.
   */
  debugApplyDisasterSpeedReset(): void {
    this.applyDisasterSpeedReset();
  }

  /** Debug/testing helper: run the simulation forward by `seconds` in fixed steps. */
  debugAdvance(seconds: number): void {
    const step = 0.1;
    for (let t = 0; t < seconds && !this.state.gameOver; t += step) {
      update(this.state, step, this.log);
    }
  }

  /**
   * Debug/testing helper: run the sim for a single raw tick of `seconds`, with no sub-stepping.
   * Only used to demonstrate that a coarse step diverges from the sub-stepped path — production
   * code never hands `update` a step larger than `SIM_MAX_STEP`.
   */
  debugTick(seconds: number): void {
    update(this.state, seconds, this.log);
  }

  /**
   * Debug/testing helper: advance `seconds` of *simulation* time exactly as the frame loop would
   * at the given speed multiplier — emulating real frames (each the 0.1 s the frame clamp allows)
   * scaled by `speed` and spent in `SIM_MAX_STEP` sub-steps. The point of the sub-stepping is that
   * the resulting village is independent of `speed`: 60 s of sim time at 10× lands on exactly the
   * same state as 60 s at 1×, because both are the same 0.1 s ticks underneath. Tests use this to
   * pin that invariant — advancing the same sim time at 1× and at 10× must agree.
   */
  debugAdvanceAtSpeed(seconds: number, speed = 1): void {
    const frameScaled = SIM_MAX_STEP * speed; // sim seconds one clamped real frame yields at `speed`
    let elapsed = 0;
    while (elapsed < seconds - 1e-9 && !this.state.gameOver) {
      let remaining = Math.min(frameScaled, seconds - elapsed);
      while (remaining > 1e-9 && !this.state.gameOver) {
        const step = Math.min(remaining, SIM_MAX_STEP);
        update(this.state, step, this.log);
        remaining -= step;
        elapsed += step;
      }
      this.applyDisasterSpeedReset();
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

  /** Debug/testing helper: every door tile of a placed building, front first. */
  debugEntrances(id: number): { x: number; y: number }[] {
    const b = this.state.buildings.find((x) => x.id === id);
    return b ? entranceTiles(b) : [];
  }

  /**
   * Debug/testing helper: builder-work a building takes to put up.
   *
   * Same reasoning as `debugFootprint`: `progress` counts work units, not seconds, so a test that
   * wants a site three-quarters raised has to ask what the whole job is rather than assume the
   * number in the def is a duration.
   */
  debugBuildWork(type: BuildingType): number {
    return buildWorkOf(type);
  }

  /** Debug/testing helper: what a building costs to place, so a test need not restate the table. */
  debugCost(type: BuildingType, w?: number, h?: number): Partial<Record<ResourceKind, number>> {
    return buildCost(type, w, h);
  }

  /** Debug/testing helper: what repairing a placed, DAMAGED building costs — see `repairCostOf`. */
  debugRepairCost(id: number): Partial<Record<ResourceKind, number>> {
    const b = this.state.buildings.find((x) => x.id === id);
    return b ? repairCostOf(b) : {};
  }

  /** Debug/testing helper: builder-work a repair takes — see `repairWorkOf`. */
  debugRepairWork(type: BuildingType): number {
    return repairWorkOf(type);
  }

  /** Debug/testing helper: how long a building burns before survive/destroy is decided. */
  debugFireBurnSeconds(): number {
    return FIRE_BURN_SECONDS;
  }

  /** Debug/testing helper: water deliveries a fire needs to be in the running to survive at all. */
  debugFireDouseTripsNeeded(): number {
    return FIRE_DOUSE_TRIPS_NEEDED;
  }

  /** Debug/testing helper: how far (tiles) a villager will drop what they're doing to fight a fire. */
  debugFireResponseRadius(): number {
    return FIRE_RESPONSE_RADIUS;
  }

  /** Debug/testing helper: how large a fire currently reads, 0..1 — see `fireIntensity`. */
  debugFireIntensity(id: number): number {
    const b = this.state.buildings.find((x) => x.id === id);
    return b ? fireIntensity(b) : 0;
  }

  /**
   * Debug/testing helper: hold the simulation's rolls at a fixed value, or `null` to release.
   *
   * The replacement for tests that used to pin `Math.random`; see `pinRandom` in `game/rng.ts`.
   */
  debugPinRandom(v: number | number[] | null, after = 0.5): void {
    pinRandom(v, after);
  }

  /** Debug/testing helper: enact or repeal a standing rule; returns whether it is now in force. */
  debugSetPolicy(id: PolicyId, on: boolean): boolean {
    return setPolicy(this.state, id, on);
  }

  /** Debug/testing helper: the rules enacted, those actually in force, and how many clerks allow. */
  debugPolicies(): { enacted: PolicyId[]; active: PolicyId[]; capacity: number } {
    return {
      enacted: [...(this.state.policies ?? [])],
      active: activePolicies(this.state),
      capacity: policyCapacity(this.state),
    };
  }

  /** Debug/testing helper: hold a festival. */
  debugFestival(): boolean {
    return holdFestival(this.state, this.log);
  }

  /**
   * Debug/testing helper: everything the village holds of one kind — stores, larders and whatever
   * is being carried. The basis the Town Hall's books are kept on.
   */
  debugTotalHeld(kind: ResourceKind): number {
    return totalHeldAll(this.state)[kind] ?? 0;
  }

  /** Debug/testing helper: the Town Hall books for one resource. */
  debugLedger(kind: ResourceKind) {
    return ledgerFor(this.state, kind);
  }

  /** Debug/testing helper: the name stored against a save slot, or null if it is unnamed. */
  debugSlotName(slot: number): string | null {
    return slotName(slot);
  }

  /**
   * Debug/testing helper: point the camera at a tile, optionally from a given distance and angle.
   *
   * For looking at something on purpose — a screenshot of a bridge is worthless if the camera is
   * still sitting over the village where the game left it.
   */
  debugLookAt(x: number, y: number, distance?: number, yaw?: number, pitch?: number): void {
    this.camera.focus(x, y);
    const cam = this.camera as Camera3D;
    if (typeof cam.distance !== 'number') return; // the 2D camera has no orbit to set
    if (distance !== undefined) cam.distance = distance;
    if (yaw !== undefined) cam.yaw = yaw;
    if (pitch !== undefined) cam.pitch = pitch;
    cam.apply();
  }

  /** Debug/testing helper: the tile value a path tier writes when built. */
  debugPathValue(tier: PathTier): number {
    return tier === 'dirt' ? PATH_DIRT
      : tier === 'stone' ? PATH_STONE
      : tier === 'bridge' ? PATH_BRIDGE
      : tier === 'stonebridge' ? PATH_BRIDGE_STONE
      : PATH_TUNNEL;
  }

  /**
   * Debug/testing helper: the shape of the crossing at this tile — where its deck rides, where the
   * arch springs from underneath, and how wide the span it belongs to is.
   */
  debugBridgeShape(x: number, y: number): { deck: number; soffit: number; span: number; slope: number } {
    const d = bridgeDeck(this.state.paths);
    const i = tileIndex(x, y);
    return { deck: d.y[i], soffit: d.soffit[i], span: d.span[i], slope: d.slope[i] };
  }

  /** Debug/testing helper: how many villagers the boarding house sleeps. */
  debugShelterCapacity(): number {
    return SHELTER_CAPACITY;
  }

  /** Debug/testing helper: beds in actual homes — the figure the headroom bonus is measured on. */
  debugHousingCapacity(): number {
    return housingCapacity(this.state);
  }

  /** Debug/testing helper: what a bridge has to clear, and the height its ramps start from. */
  debugBridgeLimits(): { boatTop: number; bank: number } {
    return { boatTop: BOAT_LADEN_TOP, bank: BRIDGE_BANK_Y };
  }

  /** Debug/testing helper: can a villager stand on this tile? */
  debugIsWalkable(x: number, y: number): boolean {
    return isWalkable(this.state, x, y);
  }

  /** Debug/testing helper: the movement multiplier of whatever is on this tile. */
  debugPathSpeed(x: number, y: number): number {
    return pathSpeedMult(this.state, x, y);
  }

  /** Debug/testing helper: roll the season's timber-bridge fire. */
  debugBridgeFireSeason(): void {
    bridgeFireSeason(this.state, this.log);
  }

  /** Debug/testing helper: the seed this village was founded from, and its live stream state. */
  debugSeed(): { seed: number; rng: number } {
    return { seed: this.state.seed, rng: this.state.rng };
  }

  /** Debug/testing helper: work one builder gets through before knocking off. */
  debugShiftWork(): number {
    return BUILDER_SHIFT_WORK;
  }

  /**
   * Debug/testing helper: put a building's materials in storage so it can be placed.
   *
   * Buildings cost real quantities now, and `canPlace` refuses one the village cannot pay for. A
   * test about *where* a mine may stand should not also have to fund it — without this it fails
   * on the cost and never reaches the terrain rule it exists to check.
   */
  /**
   * Debug/testing helper: what pulling a building down hands back to the barns.
   *
   * The figure moved when the price list did — a house used to return 3 wood and now returns 4 —
   * so a test that restates it goes stale silently. Ask the game instead.
   */
  debugSalvage(type: BuildingType): Partial<Record<ResourceKind, number>> {
    const out: Partial<Record<ResourceKind, number>> = {};
    for (const [k, amt] of Object.entries(BUILDING_DEFS[type].cost) as [ResourceKind, number][]) {
      out[k] = amt * REFUND_FRACTION;
    }
    return out;
  }

  debugAfford(type: BuildingType, times = 1): void {
    const at = this.state.origin ?? { x: this.state.w / 2, y: this.state.h / 2 };
    for (const [k, amt] of Object.entries(BUILDING_DEFS[type].cost) as [ResourceKind, number][]) {
      addNearest(this.state, at, k, amt * times);
    }
  }

  /**
   * Debug/testing helper: the display list against the exhaustive one.
   *
   * `RESOURCE_KINDS` is hand-written and drives every inventory the player reads, while
   * `RESOURCE_ICON` is a `Record<ResourceKind, …>` the compiler will not let you leave short. A
   * kind in the second and not the first is invisible in game and perfectly typed.
   */
  /** Debug/testing helper: write the current village to a slot, as autosave does. Returns whether
   * the write happened (false when the state is unsound or storage refused it). */
  debugSaveSlot(slot = 0): boolean {
    return saveGame(this.state, slot);
  }

  /** Debug/testing helper: the autosave cadence in seconds, so a test can pin the interval. */
  debugAutosaveSeconds(): number {
    return AUTOSAVE_SECONDS;
  }

  /** Debug/testing helper: load a slot straight into the live state (bypasses the menu flow). */
  debugLoadSlot(slot = 0): boolean {
    const saved = loadGame(slot);
    if (!saved) return false;
    this.state = saved;
    return true;
  }

  /** Debug/testing helper: the dedicated autosave slot index. */
  debugAutosaveSlot(): number {
    return AUTOSAVE_SLOT;
  }

  /** Debug/testing helper: the raw stored bytes for a slot (no migration), for save-format tests. */
  debugRawSlot(slot = 0): string | null {
    return rawSlot(slot);
  }

  /** Debug/testing helper: overwrite a slot's raw bytes, e.g. to inject an older-format save. */
  debugWriteRawSlot(slot: number, raw: string): void {
    writeRawSlot(slot, raw);
  }

  debugResourceLists(): { listed: string[]; all: string[] } {
    return { listed: [...RESOURCE_KINDS], all: Object.keys(RESOURCE_ICON) };
  }

  /** Debug/testing helper: every buildable type, named, in build-menu order. */
  debugBuildNames(): string[] {
    return BUILD_ORDER.map((t) => BUILDING_DEFS[t].name);
  }

  /** Debug/testing helper: mark a building for demolition. Returns false if it may not be. */
  debugDemolish(id: number, upgradeTo?: BuildingType): boolean {
    const b = this.state.buildings.find((x) => x.id === id);
    return !!b && markDemolish(this.state, b, upgradeTo);
  }

  /** Debug/testing helper: how a demolition is going, or null once the plot is clear. */
  debugDemoState(id: number): { marked: boolean; razed: boolean; progress: number; hauling: number } | null {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b) return null;
    let hauling = 0;
    for (const k of RESOURCE_KINDS) hauling += b.store[k] ?? 0;
    return {
      marked: !!b.demolish,
      razed: !!b.razed,
      progress: demoFraction(b),
      hauling,
    };
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
  /** Debug/testing helper: rancher-seconds of work to cull one head from this pen (scales with size). */
  debugCullWorkPerHead(id: number): number {
    const b = this.state.buildings.find((x) => x.id === id)!;
    return cullWorkPerHead(b);
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

  /** Debug/testing helper: can a villager standing at (fx, fy) walk to the tile (x, y)? */
  debugReachable(fx: number, fy: number, x: number, y: number): boolean {
    return debugReachable(this.state, { x: fx, y: fy }, x, y);
  }

  /** Debug/testing helper: the tile a villager standing at (x, y) would walk to for a building. */
  debugApproach(id: number, x: number, y: number): { x: number; y: number } {
    const b = this.state.buildings.find((v) => v.id === id)!;
    return debugApproach(this.state, b, { x, y });
  }

  /** Debug/testing helper: the village total of one resource, as the limits rule measures it. */
  debugTotalStored(kind: ResourceKind): number {
    return totalStored(this.state, kind);
  }

  /** Debug/testing helper: the tool a specific citizen is actually holding (steel / iron / none). */
  debugCitizenTool(id: number): 'steel' | 'iron' | 'none' {
    const c = this.state.citizens.find((x) => x.id === id);
    return c?.tool ?? 'none';
  }

  /** Debug/testing helper: the output multiplier that citizen's own kit applies to their labour. */
  debugCitizenToolFactor(id: number): number {
    const c = this.state.citizens.find((x) => x.id === id);
    return c ? citizenToolFactor(c) : NO_TOOLS_PENALTY;
  }

  /**
   * Debug/testing helper: hand a citizen a tool directly, bypassing the barn-visit fetch — for
   * tests that want a known starting kit rather than waiting on `tryEquipTool` to happen naturally.
   * `null` strips whatever they're holding, same as a tool wearing out.
   */
  debugSetCitizenTool(id: number, tool: 'iron' | 'steel' | null): void {
    const c = this.state.citizens.find((x) => x.id === id);
    if (!c) return;
    c.tool = tool ?? undefined;
    c.toolWear = 0;
  }

  /** Debug/testing helper: bill one citizen `workerSeasons` of tool wear, as the sim does per work. */
  debugWearCitizenTool(id: number, workerSeasons: number): void {
    const c = this.state.citizens.find((x) => x.id === id);
    if (c) wearCitizenTool(c, workerSeasons);
  }

  /** Debug/testing helper: wear accumulated on the tool a citizen is currently holding (0 if none). */
  debugCitizenToolWear(id: number): number {
    const c = this.state.citizens.find((x) => x.id === id);
    return c?.tool ? (c.toolWear ?? 0) : 0;
  }

  /** Debug/testing helper: food across every edible kind — what a `food` limit is judged against. */
  debugTotalFood(): number {
    return limitStock(this.state, 'food');
  }

  /**
   * Debug/testing helper: drop a large grain buffer into every built barn so a village survives a
   * long, multi-season run instead of starving partway through.
   *
   * Food consumption scales with the population (`FOOD_PER_CITIZEN_PER_SEASON`), so a test that
   * advances thousands of ticks on a founding village's opening stock now watches it eat through
   * that stock and die — which turns a test about happiness, breeding or consumption into a test
   * about famine, and (once everyone is dead) reads nonsense back. This is the deterministic knob
   * for "the run is not about running out of food": it stocks grain, not the balance, so the
   * consumption *rate* the test is measuring is untouched — the village simply cannot go hungry.
   */
  debugStockFood(amount = 99000): void {
    for (const b of this.state.buildings) {
      if (b.built && b.type === 'barn') b.store.grain = (b.store.grain ?? 0) + amount;
    }
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
  /**
   * Debug/testing helper: could this building stand here?
   *
   * Progression is deliberately *not* asked about — this and `debugPlace` both mean "regardless of
   * how far along the village is", which is what almost every test wants: they are about ranches
   * and markets and quarries, not about whether a founding camp has earned one. The gate itself is
   * tested through `debugUnlocked` and the build menu. The pair stay in step: whatever
   * `debugCanPlace` says is placeable, `debugPlace` will place.
   */
  debugCanPlace(type: BuildingType, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): { ok: boolean; reason?: string } {
    const { w, h } = this.placeSize(type);
    return canPlace(this.state, type, x, y, w, h, rot, { ignoreTier: true });
  }

  /** Debug/testing helper: would a building here have a door the village could walk to? */
  debugPlacementReachable(type: BuildingType, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): boolean {
    const { w, h } = this.placeSize(type);
    return placementReachable(this.state, type, x, y, w, h, rot);
  }

  /** Debug/testing helper: how often a quarry load comes up sand. */
  debugSandShare(): number {
    return QUARRY_SAND_SHARE;
  }

  /** Debug/testing helper: what a recipe consumes per cycle. */
  debugRecipeInputs(type: BuildingType, recipe: string): [ResourceKind, number][] {
    return debugConverterInputs({ type, recipe } as unknown as Building);
  }

  /** Debug/testing helper: the season the village is in, by name. */
  debugSeasonName(): Season {
    return SEASONS[this.state.season];
  }

  /** Debug/testing helper: run a season turn now, as the clock would at its boundary. */
  debugEndSeason(): void {
    this.state.seasonTimer = 0;
    debugEndSeason(this.state, this.log);
  }

  /** Debug/testing helper: the odds the season's fleet sails, and the prices they may keep. */
  debugPortChance(): number {
    return PORT_ARRIVAL_CHANCE;
  }
  debugPriceMods(): number[] {
    return [...PORT_PRICE_MODS];
  }
  debugPortStock(category: string): Partial<Record<ResourceKind, number>> {
    return MERCHANT_CATEGORY_STOCK[category as MerchantCategory];
  }

  /** Debug/testing helper: what a resource is worth in trade. */
  debugTradeValue(kind: ResourceKind): number {
    return TRADE_VALUE[kind];
  }

  /** Debug/testing helper: every stockpile the limits panel offers a cap on. */
  debugLimitable(): LimitKey[] {
    return [...LIMITABLE];
  }

  /** Debug/testing helpers: round-trip the village through the autosave slot. */
  debugSave(): boolean {
    return saveGame(this.state, AUTOSAVE_SLOT);
  }
  debugLoad(): boolean {
    const loaded = loadGame(AUTOSAVE_SLOT);
    if (!loaded) return false;
    this.state = loaded;
    return true;
  }

  /** Debug/testing helper: builders the village asks for while this type is going up. */
  debugBuildersWanted(type: BuildingType): number {
    return buildersWantedFor(type);
  }

  /** Debug/testing helper: the town's average mood. */
  debugAvgHappiness(): number {
    return avgHappiness(this.state);
  }

  /** Debug/testing helper: the town's average health. */
  debugAvgHealth(): number {
    return avgHealth(this.state);
  }

  /** Debug/testing helper: a resource's free stock and where it sits against the two warning marks. */
  debugStockState(key: LimitKey): { stock: number; low: boolean; critical: boolean } {
    return {
      stock: limitStock(this.state, key),
      low: isLowStock(this.state, key),
      critical: isCriticalStock(this.state, key),
    };
  }

  /** Debug/testing helper: souls the village's priests can keep between them. */
  debugCongregation(): number {
    let n = 0;
    for (const b of this.state.buildings) {
      if (!b.built || b.razed) continue;
      if (b.type === 'chapel' || b.type === 'cathedral') n += b.workers.length * CONGREGATION_PER_PRIEST;
    }
    return n;
  }

  /** Debug/testing helper: seats a building of this type offers with `staff` teachers on. */
  debugStudentPlaces(_type: BuildingType, staff: number): number {
    return staff * STUDENTS_PER_TEACHER;
  }

  /** Debug/testing helper: the production multiplier learning is worth. */
  debugProduction(educated: boolean, graduate: boolean): number {
    return graduate ? GRADUATE_BONUS : educated ? EDUCATED_BONUS : 1;
  }

  /** Debug/testing helper: the age old age starts at for this much learning. */
  debugOldAgeStart(educated: boolean, graduate: boolean): number {
    return OLD_AGE_START + (graduate ? GRADUATE_LONGEVITY_YEARS : educated ? EDUCATED_LONGEVITY_YEARS : 0);
  }

  /** Debug/testing helper: the village's tier right now. */
  debugTier(): VillageTier {
    return villageTier(this.state);
  }

  /** Debug/testing helper: may the village raise this building yet? */
  debugUnlocked(type: BuildingType): boolean {
    return buildingUnlocked(this.state, type);
  }

  /** Debug/testing helper: may the village lay this kind of road yet? */
  debugPathUnlocked(tier: PathTier): boolean {
    return pathUnlocked(this.state, tier);
  }

  /** Debug/testing helper: force the tier, so a test can get at what it actually cares about. */
  debugPinTier(t: VillageTier | null): void {
    pinTier(t);
    this.ui.updateHud(this.state, SPEEDS[this.speedIndex], this.paused);
  }

  /** Debug/testing helper: place a building (as a construction site) at a tile. */
  debugPlace(type: BuildingType, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): number | null {
    const { w, h } = this.placeSize(type);
    const b = placeBuilding(this.state, type, x, y, w, h, rot, { ignoreTier: true });
    return b ? b.id : null;
  }

  /** Debug/testing helper: move a profession's wanted count, as the job board's stepper does. */
  debugSetTradeWorkers(type: BuildingType, delta: number): void {
    setTradeWanted(this.state, type, delta);
  }

  /** Debug/testing helper: a profession's staffing, its buildings' demand, and who is posted. */
  debugTradeStaff(type: BuildingType): number {
    return tradeStaff(this.state, type);
  }
  debugTradeWanted(type: BuildingType): number {
    return tradeCapacity(this.state, type);
  }
  debugTradeWorking(type: BuildingType): number {
    return tradeWorking(this.state, type);
  }

  /** Debug/testing helper: mark a rectangle for hand-harvesting, as the drag-select does. */
  debugHarvestRect(x0: number, y0: number, x1: number, y1: number, kind: HarvestKind = 'all'): number {
    return markHarvestRect(this.state, x0, y0, x1, y1, kind);
  }

  /** Debug/testing helper: push goods into the nearest storage; returns what wouldn't fit. */
  debugAddNearest(at: { x: number; y: number }, kind: ResourceKind, amount: number): number {
    return addNearest(this.state, at, kind, amount);
  }

  /** Debug/testing helper: plan a path tile directly, bypassing the drag-paint input path. */
  debugPlanPath(tier: PathTier, x: number, y: number): boolean {
    return planPath(this.state, x, y, tier, { ignoreTier: true });
  }

  /**
   * Debug/testing helper: paint a path tile at a known map position — the same plan-then-hold-
   * pending pair `onPaint` performs, minus the screen-to-tile conversion. Tests use this so they
   * exercise the real pending flow without depending on where the camera happens to be looking.
   */
  /**
   * Debug/testing helper: drive a path drag the way a finger does — press at one tile, move
   * through the rest, release. Each move re-routes the whole stroke from the anchor.
   */
  debugDragPath(tier: PathTier, points: { x: number; y: number }[]): number {
    if (points.length === 0) return 0;
    this.selectedPath = tier;
    this.beginStroke(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.paintStroke(points[i].x, points[i].y);
    const n = this.strokeTiles.length;
    this.onPaintEnd();
    return n;
  }

  /**
   * Debug/testing helper: the figures the Codex quotes in prose, read from the constants that
   * actually drive them — so a test can catch the descriptions drifting out of date, which is
   * exactly how a house came to advertise half the beds it has.
   */
  debugFacts(): Record<string, number> {
    return {
      house: houseCapacityOf('house'),
      stonehouse: houseCapacityOf('stonehouse'),
      barn: BARN_CAPACITY,
      market: MARKET_CAPACITY,
      stoneHeatSaving: Math.round((1 - STONE_HOUSE_HEAT_FACTOR) * 100),
      farmMin: SIZABLE.farm!.min,
      farmMax: SIZABLE.farm!.max,
      ranchMin: SIZABLE.ranch!.min,
      ranchMax: SIZABLE.ranch!.max,
    };
  }

  /**
   * Debug/testing helpers driving the road tool the way a finger does: plant the start, move the
   * far end, lift. Tile coordinates rather than screen ones, so a test does not have to know where
   * the camera happens to be pointing.
   */
  debugPaintDown(tier: PathTier, x: number, y: number): void {
    if (this.selectedPath !== tier) this.onSelectPath(tier);
    if (!this.strokeStart) this.beginStroke(x, y);
    else this.paintStroke(x, y);
  }
  debugPaintMove(x: number, y: number): void {
    this.paintStroke(x, y);
  }
  debugPaintUp(): void {
    this.onPaintEnd();
  }
  /** Debug/testing helper: where the road being drawn is anchored, or null between roads. */
  debugStrokeStart(): { x: number; y: number } | null {
    return this.strokeStart ? { ...this.strokeStart } : null;
  }
  /** Debug/testing helper: how many drawn-but-unconfirmed path tiles are waiting. */
  debugPendingPaths(): number {
    return pendingPathCount(this.state);
  }
  /** Debug/testing helper: accept the drawn road, as the confirm bar does. */
  debugConfirmPaths(): void {
    this.confirmPaths();
  }
  /** Debug/testing helper: mark or unmark a rectangle, as the harvest drag does. */
  debugMarkHarvest(x0: number, y0: number, x1: number, y1: number, kind: HarvestKind): number {
    return markHarvestRect(this.state, x0, y0, x1, y1, kind);
  }
  /** Debug/testing helper: how many tiles carry a harvest order. */
  debugHarvestCount(): number {
    let n = 0;
    for (let i = 0; i < this.state.harvest.length; i++) if (this.state.harvest[i]) n++;
    return n;
  }
  /** Debug/testing helper: the work circle a placement ghost draws — fully staffed. */
  debugFullWorkRadius(type: BuildingType): number | undefined {
    return fullWorkRadiusOf(type);
  }
  /** Debug/testing helper: the work circle this building type has on `n` workers. */
  debugWorkRadiusFor(type: BuildingType, n: number): number | undefined {
    return workRadiusOf({ type, desiredWorkers: n });
  }

  /** Debug/testing helper: the route a road would take between two tiles, both ends included. */
  debugRoutePath(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] | null {
    return routePath(this.state, x0, y0, x1, y1);
  }

  debugPaintPath(tier: PathTier, x: number, y: number): boolean {
    // Capture what the tile held first: `markPending` needs it so a cancelled upgrade restores
    // the road underneath instead of clearing the tile.
    const prev = inBounds(x, y) ? this.state.paths[tileIndex(x, y)] : PATH_NONE;
    if (!planPath(this.state, x, y, tier, { ignoreTier: true })) return false;
    markPending(this.state, x, y, prev);
    return true;
  }

  /**
   * Debug/testing helper: pin the global Builders target to exactly `n`.
   *
   * Builders are a manual assignment now — `desiredBuilders` is the player's own number, only
   * clamped to the adult headcount each tick, never derived — so writing it is all this takes.
   */
  debugSetBuilders(n: number): void {
    this.state.desiredBuilders = Math.max(0, n);
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

  /** Debug/testing helper: the height a villager standing at this spot is drawn at (3D only). */
  debugStandHeight(x: number, y: number): number | undefined {
    const r = this.renderer as Renderer3D;
    return typeof r.standHeight === 'function' ? r.standHeight(x, y) : undefined;
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
      // A construction site is cancelled, not demolished — word the bar for what is actually about
      // to happen (the site vanishes and most of its materials return) rather than "demolish".
      const site =
        this.pendingDemolish.kind === 'building' &&
        this.pendingDemolish.ids.every((id) => {
          const b = this.state.buildings.find((x) => x.id === id);
          return b && !b.built && !b.razed;
        });
      this.ui.showConfirm(
        site ? `Cancel ${this.pendingDemolish.label}? Most materials refunded.` : `Demolish ${this.pendingDemolish.label}?`,
        site ? 'Cancel build' : 'Demolish',
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

  /** Latched so the "can't save" warning fires once when saving breaks, not on every attempt. */
  private saveFailed = false;

  /** Autosave: always writes the live game to the dedicated autosave slot, never a manual slot. */
  private persist(): boolean {
    const ok = saveGame(this.state, AUTOSAVE_SLOT);
    if (!ok && !this.saveFailed) {
      this.saveFailed = true;
      this.log('Could not save your village — storage may be full. Progress is not being saved.', 'bad');
    } else if (ok && this.saveFailed) {
      this.saveFailed = false;
      this.log('Saving is working again — your village is being saved.', 'good');
    }
    return ok;
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

  /** Last time the HUD and panels were rebuilt (ms, the animation-frame clock). */
  private lastUiAt = -Infinity;

  /** The globally-earned achievement ids, loaded once and grown as new ones are unlocked. */
  private unlockedAchievements = loadUnlocked();

  /**
   * Check the achievement conditions against the running village and celebrate anything newly won.
   * Called on the UI clock, so it costs eighty simple predicates a tenth of a second — negligible —
   * and never runs on the idle title backdrop or a dead village.
   */
  private checkAchievements(): void {
    if (!this.running || this.state.gameOver) return;
    const fresh = evaluateAchievements(this.state, this.unlockedAchievements);
    for (const a of fresh) {
      this.ui.celebrateAchievement({ title: a.title, medal: TIER_MEDAL[a.tier], tier: a.tier, unlocked: true });
    }
  }

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
      const wasOver = this.state.gameOver;
      // Spend the frame's scaled sim time in sub-steps no larger than SIM_MAX_STEP, so a fast
      // speed just runs more of the same-size ticks rather than one oversized one. `dt` is already
      // clamped to 0.1 s, so at 1× this is a single step (identical to the old single `update`);
      // at 10× it is up to ten. `update` early-returns once the village is game-over, so a death
      // mid-frame stops the remaining sub-steps rather than ticking a dead village.
      let remaining = dt * SPEEDS[this.speedIndex];
      while (remaining > 1e-9 && !this.state.gameOver) {
        const step = Math.min(remaining, SIM_MAX_STEP);
        update(this.state, step, this.log);
        remaining -= step;
      }
      this.applyDisasterSpeedReset();
      this.saveAccum += dt;
      if (this.saveAccum > AUTOSAVE_SECONDS) {
        this.saveAccum = 0;
        this.persist();
      }
      if (this.state.gameOver && !wasOver) {
        this.persist();
        this.ui.showGameOver(this.state, () => this.openNewGameSetup(true), () => this.openMainMenu());
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
      // A legal but unreachable spot is a soft-lock the player is about to build: warn, don't
      // forbid. `warn` only means anything alongside a valid placement — a red ghost is already
      // saying no for a better reason.
      placement.warn =
        placement.valid &&
        !placementReachable(this.state, this.selectedBuild, tx, ty, w, h, this.buildRot);
    }
    this.ui.setPlaceWarn(!!placement.warn);

    if (this.use2d) {
      this.ctx!.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      (this.renderer as Renderer).draw(this.state, this.cw, this.ch, placement);
    } else {
      (this.renderer as Renderer3D).render(this.state, this.camera as Camera3D, placement);
    }
    // The HUD and the open panels are recomputed on a clock of their own rather than once per
    // animation frame. Measured on a village of 220 across 70 buildings with the job board open,
    // that was 0.49ms in `updateHud` and 0.59ms in `refreshPanels` *every frame* — about 6.5% of
    // wall time on a desktop, and a phone's CPU is several times slower. Nothing in either
    // changes fast enough to be worth 60Hz: a season is ten minutes long.
    //
    // The interval is short on purpose. Panels are only ever redrawn from here — no tap handler
    // refreshes its own panel — so this is also how quickly the job board answers a stepper being
    // pressed. At 100ms that reads as instant while still skipping five frames in six.
    if (t - this.lastUiAt >= UI_REFRESH_MS) {
      this.lastUiAt = t;
      this.ui.updateHud(this.state, SPEEDS[this.speedIndex], this.paused);
      this.ui.refreshPanels(this.state);
      if (this.inspectSel) this.refreshInspect();
      this.checkAchievements();
    }
    this.refreshConfirmBar();

    requestAnimationFrame((next) => this.frame(next));
  }
}

const game = new Game();
// Debug hook: lets you inspect/tinker from the browser console (e.g. window.__village.state).
(window as unknown as { __village: Game }).__village = game;
