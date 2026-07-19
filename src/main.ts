import './style.css';
import { Camera } from './engine/camera';
import { InputManager } from './engine/input';
import { Renderer, PlacementView } from './render/renderer';
import { UI, PathTier } from './ui/ui';
import {
  GameState,
  Building,
  Citizen,
  BuildingType,
  BUILDING_DEFS,
  MAP_W,
  MAP_H,
  MineOutput,
  SmithRecipe,
  ResourceKind,
  RESOURCE_ICON,
  RESOURCE_KINDS,
  ADULT_AGE,
  PATH_STONE,
  PATH_STONE_PLAN,
} from './types';
import { newGame } from './game/state';
import {
  update,
  LogKind,
  tradeWithMerchant,
  TradeResult,
  igniteBuilding,
  acceptNomads,
  rejectNomads,
} from './game/simulation';
import { canPlace, placeBuilding, canAfford, demolishBuilding } from './game/buildings';
import { addNearest } from './game/storage';
import { planPath } from './game/paths';
import { saveGame, loadGame } from './game/save';
import { InspectRow } from './ui/ui';

const SPEEDS = [1, 2, 3];

class Game {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  ctx = this.canvas.getContext('2d')!;
  camera = new Camera();
  renderer = new Renderer(this.ctx, this.camera);
  ui: UI;
  input: InputManager;

  state: GameState;
  running = false;
  paused = false;
  speedIndex = 0;
  selectedBuild: BuildingType | null = null;
  selectedPath: PathTier | null = null;
  demolish = false;
  inspectSel: { kind: 'building' | 'citizen'; id: number } | null = null;

  dpr = 1;
  cw = 0;
  ch = 0;
  lastTime = 0;
  saveAccum = 0;

  constructor() {
    this.state = newGame();
    this.ui = new UI({
      onSelectBuild: (t) => this.onSelectBuild(t),
      onSelectPath: (tier) => this.onSelectPath(tier),
      onSetDemolish: (a) => this.onSetDemolish(a),
      onPauseToggle: () => this.togglePause(),
      onSpeedCycle: () => this.cycleSpeed(),
      onNewGame: () => this.startNewGame(),
      onSetWorkers: (id, d) => this.setWorkers(id, d),
      onSetMineOutput: (id, o) => this.setMineOutput(id, o),
      onSetSmithRecipe: (id, r) => this.setSmithRecipe(id, r),
      onTrade: (give, get, qty) => this.trade(give, get, qty),
      onAcceptNomads: () => this.acceptNomads(),
      onRejectNomads: () => this.rejectNomads(),
    });
    this.input = new InputManager(this.canvas, this.camera);
    this.input.onTap = (sx, sy) => this.onTap(sx, sy);
    this.input.onPaint = (sx, sy) => this.onPaint(sx, sy);

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persist();
    });
    this.resize();

    const saved = loadGame();
    if (saved && saved.citizens.length > 0 && !saved.gameOver) {
      this.state = saved;
      this.centreOnVillage();
      this.running = true;
      this.ui.log('Welcome back to your village', 'good');
    } else {
      this.ui.showStart(() => {
        this.state = newGame();
        this.centreOnVillage();
        this.running = true;
        this.ui.log('Place a house to get started', 'info');
      });
    }

    requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = this.canvas.clientWidth;
    this.ch = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
  }

  private centreOnVillage(): void {
    const cs = this.state.citizens;
    if (cs.length > 0) {
      let x = 0;
      let y = 0;
      for (const c of cs) {
        x += c.x;
        y += c.y;
      }
      this.camera.x = x / cs.length;
      this.camera.y = y / cs.length;
    } else {
      this.camera.x = MAP_W / 2;
      this.camera.y = MAP_H / 2;
    }
    this.camera.zoom = 1.3;
  }

  private onSelectBuild(t: BuildingType | null): void {
    this.selectedBuild = t;
    this.selectedPath = null;
    this.demolish = false;
    this.clearInspect();
    this.input.setMode('normal');
  }

  private onSelectPath(tier: PathTier | null): void {
    this.selectedPath = tier;
    this.selectedBuild = null;
    this.demolish = false;
    this.clearInspect();
    this.input.setMode(tier ? 'path' : 'normal');
  }

  private onSetDemolish(active: boolean): void {
    this.demolish = active;
    if (active) {
      this.selectedBuild = null;
      this.selectedPath = null;
      this.clearInspect();
      this.input.setMode('normal');
    }
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

  private trade(give: ResourceKind, get: ResourceKind, qty: number): TradeResult {
    const r = tradeWithMerchant(this.state, give, get, qty);
    if (r.ok) {
      this.log(`Traded ${r.gave} ${give} for ${qty} ${get}`, 'good');
      this.persist();
    }
    return r;
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
    const [wx, wy] = this.camera.screenToWorld(sx, sy, this.cw, this.ch);
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

  private startNewGame(): void {
    this.state = newGame();
    this.centreOnVillage();
    this.paused = false;
    this.selectedBuild = null;
    this.selectedPath = null;
    this.demolish = false;
    this.clearInspect();
    this.input.setMode('normal');
    this.ui.clearSelection();
    this.running = true;
    this.persist();
    this.ui.log('A fresh village begins', 'good');
  }

  private onTap(sx: number, sy: number): void {
    if (!this.running || this.state.gameOver) return;
    if (this.selectedBuild) {
      this.placeAtReticle();
      return;
    }
    const [wx, wy] = this.camera.screenToWorld(sx, sy, this.cw, this.ch);
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
    const check = canPlace(this.state, this.selectedBuild, tx, ty);
    if (!check.ok) {
      this.ui.flashHint(check.reason ?? 'Cannot build here');
      return;
    }
    placeBuilding(this.state, this.selectedBuild, tx, ty);
    this.ui.log(`${BUILDING_DEFS[this.selectedBuild].name} site marked — builders will haul materials`, 'info');
    this.persist();
    if (!canAfford(this.state, this.selectedBuild)) {
      this.selectedBuild = null;
      this.ui.clearSelection();
      this.ui.flashHint('Not enough materials in storage for another');
    }
  }

  private buildingAt(wx: number, wy: number): Building | null {
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    for (const b of this.state.buildings) {
      const d = BUILDING_DEFS[b.type];
      if (tx >= b.x && tx < b.x + d.w && ty >= b.y && ty < b.y + d.h) return b;
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
    if (idx >= 0 && idx < this.state.paths.length && this.state.paths[idx] !== 0) {
      const wasStone = this.state.paths[idx] === PATH_STONE || this.state.paths[idx] === PATH_STONE_PLAN;
      this.state.paths[idx] = 0;
      if (wasStone) addNearest(this.state, { x: tx, y: ty }, 'stone', 0.25);
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
        rows.push({ label: 'Status', value: `Building ${Math.floor((b.progress / def.buildTime) * 100)}%` });
        for (const [k, amt] of Object.entries(def.cost) as [ResourceKind, number][]) {
          rows.push({ label: `${RESOURCE_ICON[k]} ${k}`, value: `${Math.floor(b.store[k] ?? 0)}/${amt} delivered` });
        }
      } else {
        if (def.jobs > 0) rows.push({ label: 'Workers', value: `${b.workers.length}/${b.desiredWorkers}` });
        if (b.type === 'mine') rows.push({ label: 'Digging', value: b.output });
        if (b.type === 'blacksmith') rows.push({ label: 'Forging', value: `${b.recipe} tools` });
        if (b.type === 'barn') {
          let load = 0;
          for (const k of RESOURCE_KINDS) load += b.store[k] ?? 0;
          rows.push({ label: 'Stored', value: `${Math.floor(load)} / 5000` });
        }
        for (const k of RESOURCE_KINDS) {
          const v = b.store[k] ?? 0;
          if (v > 0.5) rows.push({ label: `${RESOURCE_ICON[k]} ${k}`, value: `${Math.floor(v)}` });
        }
      }
      this.ui.showInspect(`${def.emoji} ${def.name}`, rows);
    } else {
      const c = this.state.citizens.find((x) => x.id === this.inspectSel!.id);
      if (!c) return this.clearInspect();
      const adult = c.age >= ADULT_AGE;
      const job = c.jobId !== null ? this.state.buildings.find((b) => b.id === c.jobId) : null;
      rows.push({ label: 'Sex', value: c.sex === 'm' ? '♂ Male' : '♀ Female' });
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
      const title = !adult ? '🧒 Child' : c.sex === 'm' ? '👨 Villager' : '👩 Villager';
      this.ui.showInspect(title, rows);
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

  private reticleTile(type: BuildingType): { tx: number; ty: number } {
    const def = BUILDING_DEFS[type];
    return {
      tx: Math.round(this.camera.x - def.w / 2),
      ty: Math.round(this.camera.y - def.h / 2),
    };
  }

  private persist(): void {
    saveGame(this.state);
  }

  private log = (msg: string, kind: LogKind = 'info') => this.ui.log(msg, kind);

  private frame(t: number): void {
    const dtMs = this.lastTime ? t - this.lastTime : 16;
    this.lastTime = t;
    let dt = Math.min(dtMs / 1000, 0.1); // clamp to avoid huge catch-up steps

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
        this.ui.showGameOver(this.state, () => this.startNewGame());
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
    };
    if (this.selectedBuild && this.running && !this.state.gameOver) {
      const { tx, ty } = this.reticleTile(this.selectedBuild);
      placement.type = this.selectedBuild;
      placement.tx = tx;
      placement.ty = ty;
      placement.valid = canPlace(this.state, this.selectedBuild, tx, ty).ok;
    }

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.renderer.draw(this.state, this.cw, this.ch, placement);
    this.ui.updateHud(this.state, SPEEDS[this.speedIndex], this.paused);
    this.ui.refreshPanels(this.state);
    if (this.inspectSel) this.refreshInspect();

    requestAnimationFrame((next) => this.frame(next));
  }
}

const game = new Game();
// Debug hook: lets you inspect/tinker from the browser console (e.g. window.__village.state).
(window as unknown as { __village: Game }).__village = game;
