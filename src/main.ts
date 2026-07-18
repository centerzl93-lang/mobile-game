import './style.css';
import { Camera } from './engine/camera';
import { InputManager } from './engine/input';
import { Renderer, PlacementView } from './render/renderer';
import { UI } from './ui/ui';
import { GameState, BuildingType, BUILDING_DEFS, MAP_W, MAP_H } from './types';
import { newGame } from './game/state';
import { update, LogKind } from './game/simulation';
import { canPlace, placeBuilding, canAfford } from './game/buildings';
import { saveGame, loadGame } from './game/save';

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

  dpr = 1;
  cw = 0;
  ch = 0;
  lastTime = 0;
  saveAccum = 0;

  constructor() {
    this.state = newGame();
    this.ui = new UI({
      onSelectBuild: (t) => this.onSelectBuild(t),
      onPauseToggle: () => this.togglePause(),
      onSpeedCycle: () => this.cycleSpeed(),
      onNewGame: () => this.startNewGame(),
    });
    this.input = new InputManager(this.canvas, this.camera);
    this.input.onTap = (sx, sy) => this.onTap(sx, sy);

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
    this.ui.clearSelection();
    this.running = true;
    this.persist();
    this.ui.log('A fresh village begins', 'good');
  }

  /** Placement uses a centre-screen reticle: pan to aim, tap to place. */
  private onTap(_sx: number, _sy: number): void {
    if (!this.selectedBuild || !this.running || this.state.gameOver) return;
    const { tx, ty } = this.reticleTile(this.selectedBuild);
    const check = canPlace(this.state, this.selectedBuild, tx, ty);
    if (!check.ok) {
      this.ui.flashHint(check.reason ?? 'Cannot build here');
      return;
    }
    placeBuilding(this.state, this.selectedBuild, tx, ty);
    const def = BUILDING_DEFS[this.selectedBuild];
    this.ui.log(`${def.name} placed`, 'info');
    this.persist();
    // If the next one is now unaffordable, drop out of build mode.
    if (!canAfford(this.state, this.selectedBuild)) {
      this.selectedBuild = null;
      this.ui.clearSelection();
      this.ui.flashHint('Not enough resources for another — gather more first');
    }
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
    const placement: PlacementView = { type: null, tx: 0, ty: 0, valid: false };
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

    requestAnimationFrame((next) => this.frame(next));
  }
}

const game = new Game();
// Debug hook: lets you inspect/tinker from the browser console (e.g. window.__village.state).
(window as unknown as { __village: Game }).__village = game;
