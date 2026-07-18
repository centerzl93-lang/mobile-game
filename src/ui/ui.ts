import {
  GameState,
  BuildingType,
  BUILD_ORDER,
  BUILDING_DEFS,
  RESOURCE_ICON,
  RESOURCE_KINDS,
  HUD_RESOURCES,
  FOOD_ICON,
  ResourceKind,
  SURVIVAL_RESOURCES,
  SEASONS,
  MineOutput,
  SmithRecipe,
  BuildCategory,
  CATEGORY_ORDER,
  CATEGORY_META,
  FOOD_PER_CITIZEN_PER_SEASON,
  HEAT_PER_CITIZEN_WINTER,
  CLOTHING_PER_CITIZEN_WINTER,
  ADULT_AGE,
  OLD_AGE_START,
  isAdult,
} from '../types';
import { housingCapacity } from '../game/state';
import { totalStoredAll, totalStored, totalFood } from '../game/storage';
import { LogKind, tradeCost, TradeResult, avgHealth, avgHappiness } from '../game/simulation';

export type PathTier = 'dirt' | 'stone';

export interface InspectRow {
  label: string;
  value: string;
}

export interface UICallbacks {
  onSelectBuild: (type: BuildingType | null) => void;
  onSelectPath: (tier: PathTier | null) => void;
  onSetDemolish: (active: boolean) => void;
  onPauseToggle: () => void;
  onSpeedCycle: () => void;
  onNewGame: () => void;
  onSetWorkers: (buildingId: number, delta: number) => void;
  onSetMineOutput: (buildingId: number, output: MineOutput) => void;
  onSetSmithRecipe: (buildingId: number, recipe: SmithRecipe) => void;
  onTrade: (give: ResourceKind, get: ResourceKind, qty: number) => TradeResult;
}

const LOW_NEED: Partial<Record<ResourceKind, number>> = {
  firewood: HEAT_PER_CITIZEN_WINTER,
  clothing: CLOTHING_PER_CITIZEN_WINTER,
};

export class UI {
  private el = {
    pop: byId('stat-pop'),
    ages: byId('stat-ages'),
    health: byId('stat-health'),
    happy: byId('stat-happy'),
    sick: byId('stat-sick'),
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
    toolbar: byId('toolbar'),
    popout: byId('popout'),
    inspect: byId('inspect'),
    overlay: byId('overlay'),
    jobboard: byId('jobboard'),
    trade: byId('trade-overlay'),
  };
  private resChips = new Map<ResourceKind, HTMLElement>();
  private mode: 'inspect' | 'build' | 'path' | 'demolish' = 'inspect';
  private selectedBuild: BuildingType | null = null;
  private selectedPath: PathTier | null = null;
  private openCategory: BuildCategory | 'paths' | null = null;
  private jobBoardOpen = false;
  private jobSig = '';
  private tradeGive: ResourceKind = 'grain';
  private tradeGet: ResourceKind = 'livestock';
  private tradeQty = 1;

  constructor(private cb: UICallbacks) {
    this.buildResourceChips();
    this.buildToolbar();
    this.el.pause.addEventListener('click', () => this.cb.onPauseToggle());
    this.el.speed.addEventListener('click', () => this.cb.onSpeedCycle());
    this.el.jobs.addEventListener('click', () => this.toggleJobBoard());
    this.el.merchant.addEventListener('click', () => this.openTrade());
    this.el.newBtn.addEventListener('click', () => {
      if (confirm('Start a new village? Your current one will be lost.')) this.cb.onNewGame();
    });
  }

  // ---- HUD ----
  private foodChip!: HTMLElement;
  private buildResourceChips(): void {
    // One combined food chip (all food types), then a chip per non-food resource.
    const food = document.createElement('div');
    food.className = 'stat mini';
    food.title = 'Total food (all types)';
    food.innerHTML = `<span class="ico">${FOOD_ICON}</span><span class="val">0</span>`;
    this.el.resources.appendChild(food);
    this.foodChip = food;
    for (const kind of HUD_RESOURCES) {
      const chip = document.createElement('div');
      chip.className = 'stat mini';
      chip.innerHTML = `<span class="ico">${RESOURCE_ICON[kind]}</span><span class="val">0</span>`;
      this.el.resources.appendChild(chip);
      this.resChips.set(kind, chip);
    }
  }

  updateHud(s: GameState, speed: number, paused: boolean): void {
    const totals = totalStoredAll(s);
    const pop = s.citizens.length;
    let childCount = 0;
    let elderCount = 0;
    for (const c of s.citizens) {
      if (c.age < ADULT_AGE) childCount++;
      else if (c.age >= OLD_AGE_START) elderCount++;
    }
    const adultCount = pop - childCount - elderCount;
    const builders = s.citizens.reduce((n, c) => n + (c.jobId === null ? 1 : 0), 0);
    this.el.pop.querySelector('.val')!.textContent = `${pop}/${housingCapacity(s)}`;
    this.el.ages.querySelector('.val')!.textContent = `🧒${childCount} 🧑${adultCount} 👴${elderCount}`;
    this.el.health.querySelector('.val')!.textContent = `${Math.round(avgHealth(s))}`;
    this.el.happy.querySelector('.val')!.textContent = `${Math.round(avgHappiness(s))}`;
    this.el.health.classList.toggle('low', avgHealth(s) < 45);
    this.el.happy.classList.toggle('low', avgHappiness(s) < 45);
    const sick = s.citizens.reduce((n, c) => n + (c.sick ? 1 : 0), 0);
    this.el.sick.classList.toggle('hidden', sick === 0);
    this.el.sick.classList.add('low');
    this.el.sick.querySelector('.val')!.textContent = `${sick}`;
    this.el.builders.querySelector('.val')!.textContent = `${builders}`;
    const food = totalFood(s);
    this.foodChip.querySelector('.val')!.textContent = `${Math.floor(food)}`;
    this.foodChip.classList.toggle('low', food < pop * FOOD_PER_CITIZEN_PER_SEASON);
    for (const kind of HUD_RESOURCES) {
      const chip = this.resChips.get(kind)!;
      const v = totals[kind] ?? 0;
      chip.querySelector('.val')!.textContent = `${Math.floor(v)}`;
      if (SURVIVAL_RESOURCES.includes(kind)) {
        chip.classList.toggle('low', v < pop * (LOW_NEED[kind] ?? 0));
      }
    }
    this.el.season.querySelector('.val')!.textContent = `${SEASONS[s.season]} · Yr ${s.year}`;
    this.el.pause.textContent = paused ? '▶' : '⏸';
    this.el.speed.textContent = `${speed}×`;
    this.el.merchant.classList.toggle('hidden', !s.merchant.present);
  }

  // ---- Toolbar / categorized build menu ----
  private buildToolbar(): void {
    const tb = this.el.toolbar;
    tb.innerHTML = '';
    const tools: [string, string, () => void, string][] = [
      ['inspect', '👆', () => this.setInspect(), 'Inspect'],
      ...CATEGORY_ORDER.map(
        (cat) =>
          [cat, CATEGORY_META[cat].emoji, () => this.toggleCategory(cat), CATEGORY_META[cat].label] as [
            string,
            string,
            () => void,
            string,
          ],
      ),
      ['paths', '🛣️', () => this.toggleCategory('paths'), 'Paths'],
      ['demolish', '💥', () => this.setDemolish(), 'Demolish'],
    ];
    for (const [key, emoji, fn, label] of tools) {
      const b = document.createElement('button');
      b.className = 'tool-btn';
      b.dataset.tool = key;
      b.innerHTML = `<span class="emoji">${emoji}</span><span class="tname">${label}</span>`;
      b.addEventListener('click', fn);
      tb.appendChild(b);
    }
    this.refreshToolbar();
  }

  private refreshToolbar(): void {
    for (const child of Array.from(this.el.toolbar.children)) {
      const b = child as HTMLElement;
      const key = b.dataset.tool!;
      const active =
        (key === 'inspect' && this.mode === 'inspect') ||
        (key === 'demolish' && this.mode === 'demolish') ||
        (key === this.openCategory) ||
        (this.mode === 'build' && this.selectedBuild && BUILDING_DEFS[this.selectedBuild].category === key) ||
        (this.mode === 'path' && key === 'paths');
      b.classList.toggle('active', !!active);
    }
  }

  private toggleCategory(cat: BuildCategory | 'paths'): void {
    this.openCategory = this.openCategory === cat ? null : cat;
    this.renderPopout();
    this.refreshToolbar();
  }

  private renderPopout(): void {
    const po = this.el.popout;
    if (!this.openCategory) {
      po.classList.add('hidden');
      po.innerHTML = '';
      return;
    }
    po.innerHTML = '';
    if (this.openCategory === 'paths') {
      for (const [tier, emoji, label, cost] of [
        ['dirt', '🟤', 'Dirt Path', 'free'],
        ['stone', '⬜', 'Stone Path', '🪨1/tile'],
      ] as [PathTier, string, string, string][]) {
        po.appendChild(this.buildBtn(emoji, label, cost, tier === this.selectedPath, () => this.selectPath(tier)));
      }
    } else {
      const types = BUILD_ORDER.filter((t) => BUILDING_DEFS[t].category === this.openCategory);
      for (const type of types) {
        const def = BUILDING_DEFS[type];
        const cost = (Object.entries(def.cost) as [ResourceKind, number][])
          .map(([k, a]) => `${RESOURCE_ICON[k]}${a}`)
          .join(' ');
        po.appendChild(
          this.buildBtn(def.emoji, def.name, cost, type === this.selectedBuild, () => this.selectBuild(type)),
        );
      }
    }
    po.classList.remove('hidden');
  }

  private buildBtn(emoji: string, name: string, cost: string, selected: boolean, fn: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'build-btn' + (selected ? ' selected' : '');
    btn.innerHTML = `<span class="emoji">${emoji}</span><span class="name">${name}</span><span class="cost">${cost}</span>`;
    btn.addEventListener('click', fn);
    return btn;
  }

  private setInspect(): void {
    this.mode = 'inspect';
    this.selectedBuild = null;
    this.selectedPath = null;
    this.openCategory = null;
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(null);
    this.cb.onSetDemolish(false);
    this.renderPopout();
    this.refreshToolbar();
    this.hideHint();
  }

  private setDemolish(): void {
    this.mode = 'demolish';
    this.selectedBuild = null;
    this.selectedPath = null;
    this.openCategory = null;
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(null);
    this.cb.onSetDemolish(true);
    this.hideInspect();
    this.renderPopout();
    this.refreshToolbar();
    this.showHint('Tap a building or path to demolish it (25% of materials refunded).');
  }

  private selectBuild(type: BuildingType): void {
    this.mode = 'build';
    this.selectedBuild = this.selectedBuild === type ? null : type;
    this.selectedPath = null;
    this.cb.onSetDemolish(false);
    this.cb.onSelectPath(null);
    this.cb.onSelectBuild(this.selectedBuild);
    if (!this.selectedBuild) this.mode = 'inspect';
    this.hideInspect();
    this.renderPopout();
    this.refreshToolbar();
    if (this.selectedBuild) this.showHint(`Line up the outline and tap to place the ${BUILDING_DEFS[type].name}. ${BUILDING_DEFS[type].desc}`);
    else this.hideHint();
  }

  private selectPath(tier: PathTier): void {
    this.mode = 'path';
    this.selectedPath = this.selectedPath === tier ? null : tier;
    this.selectedBuild = null;
    this.cb.onSetDemolish(false);
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(this.selectedPath);
    if (!this.selectedPath) this.mode = 'inspect';
    this.hideInspect();
    this.renderPopout();
    this.refreshToolbar();
    if (this.selectedPath) this.showHint('Drag one finger to draw a path; pan with two fingers.');
    else this.hideHint();
  }

  clearSelection(): void {
    this.setInspect();
  }

  // ---- Inspect panel ----
  showInspect(title: string, rows: InspectRow[]): void {
    const body = rows.map((r) => `<div class="inv-row"><span>${r.label}</span><span>${r.value}</span></div>`).join('');
    this.el.inspect.innerHTML = `<div class="inv-head">${title}<button class="close" id="insp-close">×</button></div>${body || '<div class="inv-row"><span>Empty</span></div>'}`;
    this.el.inspect.classList.remove('hidden');
    byId('insp-close').addEventListener('click', () => this.hideInspect());
  }
  hideInspect(): void {
    this.el.inspect.classList.add('hidden');
    this.el.inspect.innerHTML = '';
  }
  isInspectOpen(): boolean {
    return !this.el.inspect.classList.contains('hidden');
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
    const children = s.citizens.reduce((n, c) => n + (isAdult(c) ? 0 : 1), 0);
    const adults = s.citizens.length - children;
    const employed = s.citizens.reduce((n, c) => n + (c.jobId !== null ? 1 : 0), 0);
    const builders = adults - employed;
    const sig =
      jobs.map((b) => `${b.id}:${b.workers.length}:${b.desiredWorkers}:${b.output}:${b.recipe}`).join('|') +
      `#${adults},${children},${employed}`;
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
    sum.textContent = `${adults} adults (🔨 ${builders} free) · 🧒 ${children} children · ❤️ ${Math.round(avgHealth(s))} · 😊 ${Math.round(avgHappiness(s))}`;
    p.appendChild(sum);
    if (jobs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'summary';
      empty.textContent = 'No workplaces built yet.';
      p.appendChild(empty);
      return;
    }
    for (const b of jobs) {
      const def = BUILDING_DEFS[b.type];
      const row = document.createElement('div');
      row.className = 'job-row';
      let extra = '';
      if (b.type === 'mine') {
        extra = `<div class="jr-toggle" data-toggle="mine"><button data-v="coal" class="${b.output === 'coal' ? 'on' : ''}">Coal</button><button data-v="iron" class="${b.output === 'iron' ? 'on' : ''}">Iron</button></div>`;
      } else if (b.type === 'blacksmith') {
        extra = `<div class="jr-toggle" data-toggle="smith"><button data-v="iron" class="${b.recipe === 'iron' ? 'on' : ''}">Iron</button><button data-v="steel" class="${b.recipe === 'steel' ? 'on' : ''}">Steel</button></div>`;
      }
      row.innerHTML = `
        <span class="jr-emoji">${def.emoji}</span>
        <div class="jr-main"><div class="jr-name">${def.name}</div>
          <div class="jr-sub">${b.workers.length} working / ${b.desiredWorkers} wanted (max ${def.jobs})</div>${extra}</div>
        <div class="stepper"><button data-step="-1">−</button><span class="count">${b.desiredWorkers}</span><button data-step="1">+</button></div>`;
      row.querySelector('[data-step="-1"]')!.addEventListener('click', () => this.cb.onSetWorkers(b.id, -1));
      row.querySelector('[data-step="1"]')!.addEventListener('click', () => this.cb.onSetWorkers(b.id, 1));
      const toggle = row.querySelector('.jr-toggle');
      if (toggle)
        toggle.querySelectorAll('button').forEach((btn) =>
          btn.addEventListener('click', () => {
            const v = (btn as HTMLElement).dataset.v!;
            if (b.type === 'mine') this.cb.onSetMineOutput(b.id, v as MineOutput);
            else this.cb.onSetSmithRecipe(b.id, v as SmithRecipe);
          }),
        );
      p.appendChild(row);
    }
  }

  // ---- Trade ----
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
      <div class="trade-row"><label>Amount</label><div class="stepper"><button id="tr-minus">−</button><span class="count" id="tr-qty">1</span><button id="tr-plus">+</button></div></div>
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
    const stockKinds = (Object.keys(s.merchant.stock) as ResourceKind[]).filter((k) => (s.merchant.stock[k] ?? 0) > 0);
    if (!s.merchant.present || stockKinds.length === 0) {
      this.closeTrade();
      return;
    }
    byId('tr-stock').innerHTML = stockKinds
      .map((k) => `<span class="stock">${RESOURCE_ICON[k]} ${k}: ${Math.floor(s.merchant.stock[k]!)}</span>`)
      .join('');
    const getSel = byId('tr-get') as HTMLSelectElement;
    if (!stockKinds.includes(this.tradeGet)) this.tradeGet = stockKinds[0];
    getSel.innerHTML = stockKinds.map((k) => `<option value="${k}">${RESOURCE_ICON[k]} ${k}</option>`).join('');
    getSel.value = this.tradeGet;
    (byId('tr-give') as HTMLSelectElement).value = this.tradeGive;
    byId('tr-qty').textContent = `${this.tradeQty}`;
    const cost = tradeCost(this.tradeGive, this.tradeGet, this.tradeQty);
    byId('tr-cost').textContent = `Give ${cost} ${RESOURCE_ICON[this.tradeGive]} ${this.tradeGive} → get ${this.tradeQty} ${RESOURCE_ICON[this.tradeGet]} ${this.tradeGet}`;
    const affordable = totalStored(s, this.tradeGive) >= cost && (s.merchant.stock[this.tradeGet] ?? 0) >= this.tradeQty;
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
      if (this.mode === 'inspect') this.hideHint();
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
      `<h1>Little Village</h1><p class="big">🏡🌲🌾</p><p>Build houses, gather food and firewood, and keep your villagers alive through the seasons. Villagers now haul every resource by hand — give them barns and short trips.</p><button id="ov-start">Start Village</button>`,
    );
    byId('ov-start').addEventListener('click', () => {
      this.hideOverlay();
      onStart();
    });
  }
  showGameOver(s: GameState, onNew: () => void): void {
    this.overlayCard(
      `<h2>Your village is gone</h2><p class="big">🪦</p><p>The last villager is gone after ${s.year} year${s.year > 1 ? 's' : ''}. Store enough food and fuel, and keep everyone clothed for winter.</p><button id="ov-new">Try Again</button>`,
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
