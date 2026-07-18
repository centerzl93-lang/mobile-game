import {
  GameState,
  BuildingType,
  BUILD_ORDER,
  BUILDING_DEFS,
  RESOURCE_ICON,
  ResourceKind,
} from '../types';
import { SEASONS } from '../types';
import { storageCap, housingCapacity } from '../game/state';
import { LogKind } from '../game/simulation';

export interface UICallbacks {
  onSelectBuild: (type: BuildingType | null) => void;
  onPauseToggle: () => void;
  onSpeedCycle: () => void;
  onNewGame: () => void;
}

export class UI {
  private el = {
    pop: byId('stat-pop'),
    builders: byId('stat-builders'),
    food: byId('stat-food'),
    wood: byId('stat-wood'),
    firewood: byId('stat-firewood'),
    stone: byId('stat-stone'),
    coal: byId('stat-coal'),
    season: byId('stat-season'),
    pause: byId('btn-pause'),
    speed: byId('btn-speed'),
    newBtn: byId('btn-new'),
    log: byId('log'),
    hint: byId('hint'),
    menu: byId('build-menu'),
    overlay: byId('overlay'),
  };
  private selected: BuildingType | null = null;

  constructor(private cb: UICallbacks) {
    this.buildMenu();
    this.el.pause.addEventListener('click', () => this.cb.onPauseToggle());
    this.el.speed.addEventListener('click', () => this.cb.onSpeedCycle());
    this.el.newBtn.addEventListener('click', () => {
      if (confirm('Start a new village? Your current one will be lost.')) {
        this.cb.onNewGame();
      }
    });
  }

  private buildMenu(): void {
    this.el.menu.innerHTML = '';
    for (const type of BUILD_ORDER) {
      const def = BUILDING_DEFS[type];
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.dataset.type = type;
      const cost = (Object.entries(def.cost) as [ResourceKind, number][])
        .map(([k, a]) => `${RESOURCE_ICON[k]}${a}`)
        .join(' ');
      btn.innerHTML = `<span class="emoji">${def.emoji}</span><span class="name">${def.name}</span><span class="cost">${cost}</span>`;
      btn.addEventListener('click', () => this.toggleSelect(type));
      this.el.menu.appendChild(btn);
    }
  }

  private toggleSelect(type: BuildingType): void {
    this.selected = this.selected === type ? null : type;
    this.refreshMenuSelection();
    this.cb.onSelectBuild(this.selected);
    if (this.selected) {
      const def = BUILDING_DEFS[type];
      this.showHint(`Tap the map to place the ${def.name}. ${def.desc}`);
    } else {
      this.hideHint();
    }
  }

  clearSelection(): void {
    this.selected = null;
    this.refreshMenuSelection();
    this.hideHint();
  }

  private refreshMenuSelection(): void {
    for (const child of Array.from(this.el.menu.children)) {
      const b = child as HTMLElement;
      b.classList.toggle('selected', b.dataset.type === this.selected);
    }
  }

  updateHud(s: GameState, speed: number, paused: boolean): void {
    const cap = storageCap(s);
    const builders = s.citizens.reduce((n, c) => n + (c.jobId === null ? 1 : 0), 0);
    this.el.pop.querySelector('.val')!.textContent =
      `${s.citizens.length}/${housingCapacity(s)}`;
    this.el.builders.querySelector('.val')!.textContent = `${builders}`;
    setStat(this.el.food, s.resources.food, cap);
    setStat(this.el.wood, s.resources.wood, cap);
    setStat(this.el.firewood, s.resources.firewood, cap);
    setPlain(this.el.stone, s.resources.stone);
    setPlain(this.el.coal, s.resources.coal);
    this.el.season.querySelector('.val')!.textContent =
      `${SEASONS[s.season]} · Yr ${s.year}`;
    this.el.pause.textContent = paused ? '▶' : '⏸';
    this.el.speed.textContent = `${speed}×`;
  }

  showHint(text: string): void {
    this.el.hint.textContent = text;
    this.el.hint.classList.remove('hidden');
  }
  hideHint(): void {
    this.el.hint.classList.add('hidden');
  }

  flashHint(text: string): void {
    this.showHint(text);
    window.setTimeout(() => {
      // Only clear if nothing is being placed.
      if (!this.selected) this.hideHint();
    }, 1600);
  }

  log(msg: string, kind: LogKind = 'info'): void {
    const line = document.createElement('div');
    line.className = `log-line ${kind === 'good' ? 'good' : kind === 'bad' ? 'bad' : ''}`;
    line.textContent = msg;
    this.el.log.appendChild(line);
    while (this.el.log.children.length > 5) {
      this.el.log.removeChild(this.el.log.firstChild!);
    }
    window.setTimeout(() => {
      line.style.transition = 'opacity .4s';
      line.style.opacity = '0';
      window.setTimeout(() => line.remove(), 400);
    }, 5000);
  }

  showStart(onStart: () => void): void {
    this.overlayCard(
      `<h1>Little Village</h1>
       <p class="big">🏡🌲🌾</p>
       <p>Build houses, gather food and firewood, and keep your villagers alive through the seasons. Winter is the real test.</p>
       <button id="ov-start">Start Village</button>`,
    );
    byId('ov-start').addEventListener('click', () => {
      this.hideOverlay();
      onStart();
    });
  }

  showGameOver(s: GameState, onNew: () => void): void {
    this.overlayCard(
      `<h2>Your village is gone</h2>
       <p class="big">🪦</p>
       <p>The last villager is gone after ${s.year} year${s.year > 1 ? 's' : ''}. Every winter needs enough food stored and firewood split ahead of time.</p>
       <button id="ov-new">Try Again</button>`,
    );
    byId('ov-new').addEventListener('click', () => {
      this.hideOverlay();
      onNew();
    });
  }

  private overlayCard(inner: string): void {
    this.el.overlay.innerHTML = `<div class="card">${inner}</div>`;
    this.el.overlay.classList.remove('hidden');
  }
  hideOverlay(): void {
    this.el.overlay.classList.add('hidden');
    this.el.overlay.innerHTML = '';
  }
}

function setStat(el: HTMLElement, value: number, cap: number): void {
  el.querySelector('.val')!.textContent = `${Math.floor(value)}`;
  el.classList.toggle('low', value <= cap * 0.12);
}

function setPlain(el: HTMLElement, value: number): void {
  el.querySelector('.val')!.textContent = `${Math.floor(value)}`;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}
