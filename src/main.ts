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
  buildTimeOf,
  workRadiusOf,
  footprintW,
  footprintH,
  ranchCapacity,
  SIZABLE,
  RANCH_SPLIT_MIN,
  isHouse,
  houseCapacityOf,
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
  RESOURCE_KINDS,
  ADULT_AGE,
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
  acceptNomads,
  rejectNomads,
  markHarvestRect,
} from './game/simulation';
import { canPlace, placeBuilding, canAfford, demolishBuilding, footprintClear } from './game/buildings';
import { findPath } from './game/pathfind';
import { addNearest, larderFood, larderFoodTarget, larderTarget } from './game/storage';
import { planPath } from './game/paths';
import { saveGame, loadGame, hasSave, clearSave, slotInfo, lastSlot, SLOTS } from './game/save';
import { InspectRow, InspectControls } from './ui/ui';

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
  selectedPath: PathTier | null = null;
  demolish = false;
  harvestMode = false;
  /** Live harvest-marquee rectangle in world coords while dragging, else null. */
  marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
  inspectSel: { kind: 'building' | 'citizen'; id: number } | null = null;
  /** Held rotate button: -1 = counter-clockwise, +1 = clockwise, 0 = released. */
  rotateDir: -1 | 0 | 1 = 0;

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
      onSetBuilders: (d) => this.setBuilders(d),
      onSetMineOutput: (id, o) => this.setMineOutput(id, o),
      onSetSmithRecipe: (id, r) => this.setSmithRecipe(id, r),
      onSetForesterReplant: (id, on) => this.setForesterReplant(id, on),
      onSetCrop: (id, crop) => this.setCrop(id, crop),
      onSetAnimal: (id, animal) => this.setAnimal(id, animal),
      onSizeChange: (dim, delta) => this.onSizeChange(dim, delta),
      onSetRanchMax: (id, delta) => this.setRanchMax(id, delta),
      onCullRanch: (id) => this.cullRanch(id),
      onSplitRanch: (from, to) => this.splitRanch(from, to),
      onTransferRanch: (from, to) => this.transferRanch(from, to),
      onSetTradeOrder: (id, kind, delta) => this.setTradeOrder(id, kind, delta),
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
    this.input = new InputManager(this.canvas, this.camera);
    this.input.onTap = (sx, sy) => this.onTap(sx, sy);
    this.input.onPaint = (sx, sy) => this.onPaint(sx, sy);
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

  private resize(): void {
    this.cw = this.canvas.clientWidth;
    this.ch = this.canvas.clientHeight;
    if (this.use2d) {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.cw * this.dpr);
      this.canvas.height = Math.round(this.ch * this.dpr);
    } else {
      (this.renderer as Renderer3D).setSize(this.cw, this.ch);
      (this.camera as Camera3D).setAspect(this.cw, this.ch);
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
      this.ui.showSizeWidget(BUILDING_DEFS[t].name, this.sizeW, this.sizeH, sz.min, sz.max);
    } else {
      this.ui.hideSizeWidget();
    }
  }

  /** Resize the pending footprint of the selected sizable building (clamped to its bounds). */
  private onSizeChange(dim: 'w' | 'h', delta: number): void {
    const type = this.selectedBuild;
    const sz = type ? SIZABLE[type] : undefined;
    if (!type || !sz) return;
    const clamp = (v: number) => Math.max(sz.min, Math.min(sz.max, v));
    if (dim === 'w') this.sizeW = clamp(this.sizeW + delta);
    else this.sizeH = clamp(this.sizeH + delta);
    this.ui.showSizeWidget(BUILDING_DEFS[type].name, this.sizeW, this.sizeH, sz.min, sz.max);
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
    if (active) {
      this.selectedBuild = null;
      this.selectedPath = null;
      this.harvestMode = false;
      this.clearInspect();
      this.ui.hideSizeWidget();
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
    if (!this.harvestMode) return;
    const [wx0, wy0] = this.camera.screenToTile(sx0, sy0, this.cw, this.ch);
    const [wx1, wy1] = this.camera.screenToTile(sx1, sy1, this.cw, this.ch);
    this.marquee = { x0: wx0, y0: wy0, x1: wx1, y1: wy1 };
  }

  private onMarqueeEnd(sx0: number, sy0: number, sx1: number, sy1: number): void {
    this.marquee = null;
    if (!this.harvestMode || !this.running || this.state.gameOver) return;
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

  /** Adjust the global Builders target (clamped to the number of adults). */
  private setBuilders(delta: number): void {
    const adults = this.state.citizens.reduce((n, c) => n + (c.age >= ADULT_AGE ? 1 : 0), 0);
    this.state.desiredBuilders = Math.max(0, Math.min(adults, this.state.desiredBuilders + delta));
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

  /** Adjust a trading post's stock order for a good (clamped at zero). */
  private setTradeOrder(buildingId: number, kind: ResourceKind, delta: number): void {
    const b = this.state.buildings.find((x) => x.id === buildingId);
    if (!b) return;
    b.orders = b.orders ?? {};
    const next = Math.max(0, (b.orders[kind] ?? 0) + delta);
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

  private onPaint(sx: number, sy: number): void {
    if (!this.selectedPath || !this.running || this.state.gameOver) return;
    const [wx, wy] = this.camera.screenToTile(sx, sy, this.cw, this.ch);
    planPath(this.state, Math.floor(wx), Math.floor(wy), this.selectedPath);
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
      onSettings: () => this.openSettings(() => this.openMainMenu()),
    });
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
    this.ui.showSlotSelect({
      mode,
      slots,
      onPick: (slot) => {
        if (mode === 'load') {
          this.continueGame(slot);
        } else {
          this.currentSlot = slot;
          this.persist();
          this.ui.flashHint(`Saved to Slot ${slot + 1}`);
          this.openPauseMenu();
        }
      },
      onBack: back,
    });
  }

  /** Settings: graphics tier (applies on reload) and clear-all-saves. `back` returns to caller. */
  private openSettings(back: () => void): void {
    this.ui.showSettings({
      gfx: (localStorage.getItem('village-gfx') as 'low' | 'high' | null) ?? 'auto',
      onSetGfx: (g) => {
        if (g === 'auto') localStorage.removeItem('village-gfx');
        else localStorage.setItem('village-gfx', g);
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
    const check = canPlace(this.state, this.selectedBuild, tx, ty, w, h);
    if (!check.ok) {
      this.ui.flashHint(check.reason ?? 'Cannot build here');
      return;
    }
    const placed = placeBuilding(this.state, this.selectedBuild, tx, ty, w, h);
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

  private demolishAt(wx: number, wy: number): void {
    const b = this.buildingAt(wx, wy);
    if (b) {
      demolishBuilding(this.state, b);
      this.ui.log(`${BUILDING_DEFS[b.type].name} demolished`, 'info');
      this.persist();
      return;
    }
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    const idx = ty * MAP_W + tx;
    if (idx < 0 || idx >= this.state.paths.length) return;
    if (this.state.paths[idx] !== 0) {
      const wasStone = this.state.paths[idx] === PATH_STONE || this.state.paths[idx] === PATH_STONE_PLAN;
      const wasBridge = this.state.paths[idx] === PATH_BRIDGE;
      this.state.paths[idx] = 0;
      if (wasStone) addNearest(this.state, { x: tx, y: ty }, 'stone', 0.25);
      if (wasBridge) this.state.navVersion = (this.state.navVersion ?? 0) + 1; // walkability changed
      this.persist();
    } else if (this.state.harvest[idx] !== 0) {
      this.state.harvest[idx] = 0; // un-mark a harvest order
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
        rows.push({ label: 'Status', value: `Building ${Math.floor((b.progress / buildTimeOf(b.type)) * 100)}%` });
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
        if (b.type === 'barn') {
          let load = 0;
          for (const k of RESOURCE_KINDS) load += b.store[k] ?? 0;
          rows.push({ label: 'Stored', value: `${Math.floor(load)} / 5000` });
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
      if (b.built && def.jobs > 0) {
        controls = { buildingId: b.id, workers: { value: b.desiredWorkers, max: def.jobs } };
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
      this.ui.showInspect(`${def.emoji} ${def.name}`, rows, controls);
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
      if (adult) rows.push({ label: 'Schooling', value: c.educated ? 'Educated (+30% work)' : 'Uneducated' });
      if (adult) rows.push({ label: 'Work', value: job ? `${BUILDING_DEFS[job.type].name} worker` : 'Builder / laborer' });
      rows.push({
        label: 'Carrying',
        value: c.carry ? `${RESOURCE_ICON[c.carry.kind]} ${Math.floor(c.carry.amount)} ${c.carry.kind}` : 'nothing',
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

  /** Debug/testing helper: run the simulation forward by `seconds` in fixed steps. */
  debugAdvance(seconds: number): void {
    const step = 0.1;
    for (let t = 0; t < seconds && !this.state.gameOver; t += step) {
      update(this.state, step, this.log);
    }
  }

  /** Debug/testing helper: check a placement at a tile (uses the current ranch size). */
  debugCanPlace(type: BuildingType, x: number, y: number): { ok: boolean; reason?: string } {
    const { w, h } = this.placeSize(type);
    return canPlace(this.state, type, x, y, w, h);
  }

  /** Debug/testing helper: place a building (as a construction site) at a tile. */
  debugPlace(type: BuildingType, x: number, y: number): number | null {
    const { w, h } = this.placeSize(type);
    const b = placeBuilding(this.state, type, x, y, w, h);
    return b ? b.id : null;
  }

  /** Debug/testing helper: plan a path tile directly, bypassing the drag-paint input path. */
  debugPlanPath(tier: PathTier, x: number, y: number): boolean {
    return planPath(this.state, x, y, tier);
  }

  /** Debug/testing helper: set the global Builders target directly (bypasses the adult clamp). */
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
    const [cx, cy] = this.camera.centerTile();
    return {
      tx: Math.round(cx - w / 2),
      ty: Math.round(cy - h / 2),
    };
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
      placement.valid = canPlace(this.state, this.selectedBuild, tx, ty, w, h).ok;
    }

    if (this.use2d) {
      this.ctx!.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      (this.renderer as Renderer).draw(this.state, this.cw, this.ch, placement);
    } else {
      (this.renderer as Renderer3D).render(this.state, this.camera as Camera3D, placement);
    }
    this.ui.updateHud(this.state, SPEEDS[this.speedIndex], this.paused);
    this.ui.refreshPanels(this.state);
    if (this.inspectSel) this.refreshInspect();

    requestAnimationFrame((next) => this.frame(next));
  }
}

const game = new Game();
// Debug hook: lets you inspect/tinker from the browser console (e.g. window.__village.state).
(window as unknown as { __village: Game }).__village = game;
