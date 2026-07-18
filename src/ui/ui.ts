import {
  GameState,
  BuildingType,
  BUILD_ORDER,
  BUILDING_DEFS,
  RESOURCE_ICON,
  RESOURCE_KINDS,
  ResourceKind,
  SURVIVAL_RESOURCES,
  SEASONS,
  MineOutput,
  SmithRecipe,
} from '../types';
import { storageCap, housingCapacity } from '../game/state';
import { LogKind, tradeCost, TradeResult } from '../game/simulation';

export type PathTier = 'dirt' | 'stone';

export interface UICallbacks {
  onSelectBuild: (type: BuildingType | null) => void;
  onSelectPath: (tier: PathTier | null) => void;
  onPauseToggle: () => void;
  onSpeedCycle: () => void;
  onNewGame: () => void;
  onSetWorkers: (buildingId: number, delta: number) => void;
  onSetMineOutput: (buildingId: number, output: MineOutput) => void;
  onSetSmithRecipe: (buildingId: number, recipe: SmithRecipe) => void;
  onTrade: (give: ResourceKind, get: ResourceKind, qty: number) => TradeResult;
}

export class UI {
  private el = {
    pop: byId('stat-pop'),
    builders: byId('stat-builders'),
    resources: byId('stat-resources'),
    season: byId('stat-season'),
    pause: byId('btn-pause'),
    speed: byId('btn-speed'),
    jobs: byId('btn-jobs'),
    merchant: byId('btn-merchant'),
    newBtn: byId('btn-new'),
    log: byId('log'),
    hint: byId('hint'),
    menu: byId('build-menu'),
    overlay: byId('overlay'),
    jobboard: byId('jobboard'),
    trade: byId('trade-overlay'),
  };
  private resChips = new Map<ResourceKind, HTMLElement>();
  private selectedBuild: BuildingType | null = null;
  private selectedPath: PathTier | null = null;
  private jobBoardOpen = false;
  private jobSig = '';
  private tradeGive: ResourceKind = 'food';
  private tradeGet: ResourceKind = 'livestock';
  private tradeQty = 1;

  constructor(private cb: UICallbacks) {
    this.buildResourceChips();
    this.buildMenu();
    this.el.pause.addEventListener('click', () => this.cb.onPauseToggle());
    this.el.speed.addEventListener('click', () => this.cb.onSpeedCycle());
    this.el.jobs.addEventListener('click', () => this.toggleJobBoard());
    this.el.merchant.addEventListener('click', () => this.openTrade());
    this.el.newBtn.addEventListener('click', () => {
      if (confirm('Start a new village? Your current one will be lost.')) this.cb.onNewGame();
    });
  }

  // ---- HUD ----
  private buildResourceChips(): void {
    for (const kind of RESOURCE_KINDS) {
      const chip = document.createElement('div');
      chip.className = 'stat';
      chip.innerHTML = `<span class="ico">${RESOURCE_ICON[kind]}</span><span class="val">0</span>`;
      this.el.resources.appendChild(chip);
      this.resChips.set(kind, chip);
    }
  }

  updateHud(s: GameState, speed: number, paused: boolean): void {
    const cap = storageCap(s);
    const builders = s.citizens.reduce((n, c) => n + (c.jobId === null ? 1 : 0), 0);
    this.el.pop.querySelector('.val')!.textContent = `${s.citizens.length}/${housingCapacity(s)}`;
    this.el.builders.querySelector('.val')!.textContent = `${builders}`;
    for (const kind of RESOURCE_KINDS) {
      const chip = this.resChips.get(kind)!;
      chip.querySelector('.val')!.textContent = `${Math.floor(s.resources[kind])}`;
      if (SURVIVAL_RESOURCES.includes(kind)) {
        chip.classList.toggle('low', s.resources[kind] <= cap * 0.12);
      }
    }
    this.el.season.querySelector('.val')!.textContent = `${SEASONS[s.season]} · Yr ${s.year}`;
    this.el.pause.textContent = paused ? '▶' : '⏸';
    this.el.speed.textContent = `${speed}×`;
    this.el.merchant.classList.toggle('hidden', !s.merchant.present);
  }

  // ---- Build menu (buildings + paths) ----
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
      btn.addEventListener('click', () => this.selectBuild(type));
      this.el.menu.appendChild(btn);
    }
    for (const [tier, emoji, label, cost] of [
      ['dirt', '🟤', 'Dirt Path', 'free'],
      ['stone', '⬜', 'Stone Path', '🪨1/tile'],
    ] as [PathTier, string, string, string][]) {
      const btn = document.createElement('button');
      btn.className = 'build-btn path';
      btn.dataset.path = tier;
      btn.innerHTML = `<span class="emoji">${emoji}</span><span class="name">${label}</span><span class="cost">${cost}</span>`;
      btn.addEventListener('click', () => this.selectPath(tier));
      this.el.menu.appendChild(btn);
    }
  }

  private selectBuild(type: BuildingType): void {
    this.selectedBuild = this.selectedBuild === type ? null : type;
    this.selectedPath = null;
    this.refreshMenuSelection();
    this.cb.onSelectPath(null);
    this.cb.onSelectBuild(this.selectedBuild);
    if (this.selectedBuild) this.showHint(`Tap the map to place the ${BUILDING_DEFS[type].name}. ${BUILDING_DEFS[type].desc}`);
    else this.hideHint();
  }

  private selectPath(tier: PathTier): void {
    this.selectedPath = this.selectedPath === tier ? null : tier;
    this.selectedBuild = null;
    this.refreshMenuSelection();
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(this.selectedPath);
    if (this.selectedPath) this.showHint('Drag one finger to draw a path. Pan with two fingers.');
    else this.hideHint();
  }

  clearSelection(): void {
    this.selectedBuild = null;
    this.selectedPath = null;
    this.refreshMenuSelection();
    this.hideHint();
  }

  private refreshMenuSelection(): void {
    for (const child of Array.from(this.el.menu.children)) {
      const b = child as HTMLElement;
      const sel =
        (b.dataset.type && b.dataset.type === this.selectedBuild) ||
        (b.dataset.path && b.dataset.path === this.selectedPath);
      b.classList.toggle('selected', !!sel);
    }
  }

  // ---- Job board ----
  private toggleJobBoard(): void {
    this.jobBoardOpen = !this.jobBoardOpen;
    this.el.jobboard.classList.toggle('hidden', !this.jobBoardOpen);
    this.jobSig = '';
  }

  refreshPanels(s: GameState): void {
    if (this.jobBoardOpen) this.refreshJobBoard(s);
    if (!this.el.trade.classList.contains('hidden')) this.refreshTrade(s);
  }

  private refreshJobBoard(s: GameState): void {
    const jobs = s.buildings.filter((b) => b.built && BUILDING_DEFS[b.type].jobs > 0);
    const builders = s.citizens.reduce((n, c) => n + (c.jobId === null ? 1 : 0), 0);
    const employed = s.citizens.length - builders;
    const sig =
      jobs.map((b) => `${b.id}:${b.workers.length}:${b.desiredWorkers}:${b.output}:${b.recipe}`).join('|') +
      `#${s.citizens.length},${builders}`;
    if (sig === this.jobSig) return;
    this.jobSig = sig;

    const p = this.el.jobboard;
    p.innerHTML = '';
    const head = document.createElement('h3');
    head.innerHTML = `Job Board <button class="close" id="jb-close">×</button>`;
    p.appendChild(head);
    head.querySelector('#jb-close')!.addEventListener('click', () => this.toggleJobBoard());
    const sum = document.createElement('div');
    sum.className = 'summary';
    sum.textContent = `👤 ${s.citizens.length}  ·  employed ${employed}  ·  🔨 ${builders} free`;
    p.appendChild(sum);

    if (jobs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'summary';
      empty.textContent = 'No workplaces built yet. Place a job building to staff it here.';
      p.appendChild(empty);
      return;
    }

    for (const b of jobs) {
      const def = BUILDING_DEFS[b.type];
      const row = document.createElement('div');
      row.className = 'job-row';
      let extra = '';
      if (b.type === 'mine') {
        extra = `<div class="jr-toggle" data-toggle="mine">
          <button data-v="coal" class="${b.output === 'coal' ? 'on' : ''}">Coal</button>
          <button data-v="iron" class="${b.output === 'iron' ? 'on' : ''}">Iron</button></div>`;
      } else if (b.type === 'blacksmith') {
        extra = `<div class="jr-toggle" data-toggle="smith">
          <button data-v="iron" class="${b.recipe === 'iron' ? 'on' : ''}">Iron</button>
          <button data-v="steel" class="${b.recipe === 'steel' ? 'on' : ''}">Steel</button></div>`;
      }
      row.innerHTML = `
        <span class="jr-emoji">${def.emoji}</span>
        <div class="jr-main">
          <div class="jr-name">${def.name}</div>
          <div class="jr-sub">${b.workers.length} working / ${b.desiredWorkers} wanted (max ${def.jobs})</div>
          ${extra}
        </div>
        <div class="stepper">
          <button data-step="-1">−</button>
          <span class="count">${b.desiredWorkers}</span>
          <button data-step="1">+</button>
        </div>`;
      row.querySelector('[data-step="-1"]')!.addEventListener('click', () => this.cb.onSetWorkers(b.id, -1));
      row.querySelector('[data-step="1"]')!.addEventListener('click', () => this.cb.onSetWorkers(b.id, 1));
      const toggle = row.querySelector('.jr-toggle');
      if (toggle) {
        toggle.querySelectorAll('button').forEach((btn) =>
          btn.addEventListener('click', () => {
            const v = (btn as HTMLElement).dataset.v!;
            if (b.type === 'mine') this.cb.onSetMineOutput(b.id, v as MineOutput);
            else this.cb.onSetSmithRecipe(b.id, v as SmithRecipe);
          }),
        );
      }
      p.appendChild(row);
    }
  }

  // ---- Trade panel ----
  private openTrade(): void {
    this.el.trade.classList.remove('hidden');
    this.buildTrade();
  }
  closeTrade(): void {
    this.el.trade.classList.add('hidden');
  }

  private buildTrade(): void {
    const card = document.createElement('div');
    card.className = 'trade-card';
    card.innerHTML = `
      <h2>Merchant <button class="close" id="tr-close">×</button></h2>
      <div class="summary">Barter goods by value. The merchant keeps a small cut.</div>
      <div class="stocklist" id="tr-stock"></div>
      <div class="trade-row"><label>Get</label><select id="tr-get"></select></div>
      <div class="trade-row"><label>Amount</label>
        <div class="stepper"><button id="tr-minus">−</button><span class="count" id="tr-qty">1</span><button id="tr-plus">+</button></div>
      </div>
      <div class="trade-row"><label>Pay in</label><select id="tr-give"></select></div>
      <div class="trade-cost" id="tr-cost"></div>
      <button class="do-trade" id="tr-do">Trade</button>`;
    this.el.trade.innerHTML = '';
    this.el.trade.appendChild(card);
    card.querySelector('#tr-close')!.addEventListener('click', () => this.closeTrade());
    this.el.trade.addEventListener('click', (e) => {
      if (e.target === this.el.trade) this.closeTrade();
    });
    (card.querySelector('#tr-give') as HTMLSelectElement).innerHTML = RESOURCE_KINDS.map(
      (k) => `<option value="${k}">${RESOURCE_ICON[k]} ${k}</option>`,
    ).join('');
    card.querySelector('#tr-get')!.addEventListener('change', (e) => {
      this.tradeGet = (e.target as HTMLSelectElement).value as ResourceKind;
    });
    card.querySelector('#tr-give')!.addEventListener('change', (e) => {
      this.tradeGive = (e.target as HTMLSelectElement).value as ResourceKind;
    });
    card.querySelector('#tr-minus')!.addEventListener('click', () => {
      this.tradeQty = Math.max(1, this.tradeQty - 1);
    });
    card.querySelector('#tr-plus')!.addEventListener('click', () => {
      this.tradeQty += 1;
    });
    card.querySelector('#tr-do')!.addEventListener('click', () => {
      const r = this.cb.onTrade(this.tradeGive, this.tradeGet, this.tradeQty);
      this.flashHint(r.ok ? `Traded for ${this.tradeQty} ${this.tradeGet}` : r.reason ?? 'Trade failed');
    });
  }

  private refreshTrade(s: GameState): void {
    const stockKinds = (Object.keys(s.merchant.stock) as ResourceKind[]).filter(
      (k) => (s.merchant.stock[k] ?? 0) > 0,
    );
    if (!s.merchant.present || stockKinds.length === 0) {
      this.closeTrade();
      return;
    }
    const stockEl = byId('tr-stock');
    stockEl.innerHTML = stockKinds
      .map((k) => `<span class="stock">${RESOURCE_ICON[k]} ${k}: ${Math.floor(s.merchant.stock[k]!)}</span>`)
      .join('');
    const getSel = byId('tr-get') as HTMLSelectElement;
    if (!stockKinds.includes(this.tradeGet)) this.tradeGet = stockKinds[0];
    getSel.innerHTML = stockKinds.map((k) => `<option value="${k}">${RESOURCE_ICON[k]} ${k}</option>`).join('');
    getSel.value = this.tradeGet;
    (byId('tr-give') as HTMLSelectElement).value = this.tradeGive;
    byId('tr-qty').textContent = `${this.tradeQty}`;
    const cost = tradeCost(this.tradeGive, this.tradeGet, this.tradeQty);
    const costEl = byId('tr-cost');
    costEl.textContent = `Give ${cost} ${RESOURCE_ICON[this.tradeGive]} ${this.tradeGive} → get ${this.tradeQty} ${RESOURCE_ICON[this.tradeGet]} ${this.tradeGet}`;
    const affordable = s.resources[this.tradeGive] >= cost && (s.merchant.stock[this.tradeGet] ?? 0) >= this.tradeQty;
    (byId('tr-do') as HTMLButtonElement).disabled = !affordable || this.tradeGive === this.tradeGet;
  }

  // ---- Hints / log ----
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
      if (!this.selectedBuild && !this.selectedPath) this.hideHint();
    }, 1600);
  }

  log(msg: string, kind: LogKind = 'info'): void {
    const line = document.createElement('div');
    line.className = `log-line ${kind === 'good' ? 'good' : kind === 'bad' ? 'bad' : ''}`;
    line.textContent = msg;
    this.el.log.appendChild(line);
    while (this.el.log.children.length > 5) this.el.log.removeChild(this.el.log.firstChild!);
    window.setTimeout(() => {
      line.style.transition = 'opacity .4s';
      line.style.opacity = '0';
      window.setTimeout(() => line.remove(), 400);
    }, 5000);
  }

  // ---- Overlays ----
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
       <p>The last villager is gone after ${s.year} year${s.year > 1 ? 's' : ''}. Store enough food and fuel, and keep everyone clothed for winter.</p>
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

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}
