import {
  GameState,
  BuildingType,
  BUILD_ORDER,
  BUILDING_DEFS,
  MapSize,
  MAP_SIZES,
  Difficulty,
  DIFFICULTIES,
  DIFFICULTY_META,
  RESOURCE_ICON,
  RESOURCE_KINDS,
  HUD_RESOURCES,
  FOOD_ICON,
  ResourceKind,
  SURVIVAL_RESOURCES,
  seasonLabel,
  SEASONS,
  isWorkplace,
  buildingName,
  MineOutput,
  SmithRecipe,
  Crop,
  RanchAnimal,
  CROP_META,
  RANCH_ANIMALS,
  ANIMAL_META,
  BuildCategory,
  CATEGORY_ORDER,
  CATEGORY_META,
  TRADE_VALUE,
  SEED_COST,
  MERCHANT_CATEGORY_META,
  FOOD_PER_CITIZEN_PER_SEASON,
  HEAT_PER_CITIZEN_WINTER,
  CLOTHING_PER_CITIZEN_WINTER,
  ADULT_AGE,
  isInfant,
  isStudent,
  isAdult,
  LIMITABLE,
  LIMIT_META,
  LimitKey,
  limitedOutput,
} from '../types';
import { footprintClear } from '../game/buildings';
import { cappedOut, limitStock } from '../game/simulation';
import { SLOT_NAME_MAX } from '../game/save';
import { totalStored, totalStoredAll, totalFoodAvailable, totalInLarders } from '../game/storage';
import {
  LogKind,
  TradeResult,
  TradeBasket,
  offerValue,
  purchaseValue,
  requiredValue,
  avgHealth,
  avgHappiness,
} from '../game/simulation';

export type PathTier = 'dirt' | 'stone' | 'bridge' | 'tunnel';

/** Version / commit / build date, injected at build time — see `__BUILD_STAMP__`. */
export const BUILD_STAMP = __BUILD_STAMP__;

export interface InspectRow {
  label: string;
  value: string;
}

/** Interactive controls shown at the foot of the inspect sheet for a built workplace. */
export interface InspectControls {
  buildingId: number;
  /** Workplace only: current name, shown in an editable field so the player can rename it. */
  rename?: string;
  /** Worker allocation stepper (current desired vs the job cap). */
  workers?: { value: number; max: number };
  /** A single option toggle (mine output / smith recipe / forester replant / farm crop / ranch animal). */
  toggle?: { group: 'mine' | 'smith' | 'forester' | 'crop' | 'animal'; options: { v: string; label: string; on: boolean }[] };
  /** Trading post: show a button that opens the inventory/trade panel; flags a docked merchant. */
  tradingPost?: { merchantDocked: boolean };
  /** Ranch: herd management — cap stepper, cull, and split/transfer to another pen. */
  ranch?: {
    animals: number;
    capacity: number;
    max: number;
    canSplit: boolean;
    canTransfer: boolean;
    targets: { id: number; label: string }[];
  };
}

export interface UICallbacks {
  onSelectBuild: (type: BuildingType | null) => void;
  onSelectPath: (tier: PathTier | null) => void;
  onSetDemolish: (active: boolean) => void;
  onPauseToggle: () => void;
  onSpeedCycle: () => void;
  onNewGame: () => void;
  onOpenMenu: () => void;
  onSetWorkers: (buildingId: number, delta: number) => void;
  /** Rename a workplace. An empty or blank name restores the automatic default. */
  onRenameBuilding: (buildingId: number, name: string) => void;
  onSetBuilders: (delta: number) => void;
  /** Nudge a resource's stockpile cap by one step (see `LIMIT_STEP`); a cap of 0 means none. */
  onSetLimit: (key: LimitKey, delta: number) => void;
  onSetMineOutput: (buildingId: number, output: MineOutput) => void;
  onSetSmithRecipe: (buildingId: number, recipe: SmithRecipe) => void;
  onSetForesterReplant: (buildingId: number, on: boolean) => void;
  onSetCrop: (buildingId: number, crop: Crop) => void;
  onSetAnimal: (buildingId: number, animal: RanchAnimal) => void;
  onSizeChange: (dim: 'w' | 'h', delta: number) => void;
  /** Turn the building being placed a quarter turn clockwise. */
  onRotateBuild: () => void;
  /** Build the pending building where the ghost is standing. */
  onPlaceBuild: () => void;
  onSetRanchMax: (buildingId: number, delta: number) => void;
  onCullRanch: (buildingId: number) => void;
  onSplitRanch: (fromId: number, toId: number) => void;
  onTransferRanch: (fromId: number, toId: number) => void;
  onSetTradeOrder: (buildingId: number, kind: ResourceKind, delta: number) => void;
  /** Set a standing order to an exact figure — what the typed field commits. */
  onSetTradeOrderTo: (buildingId: number, kind: ResourceKind, value: number) => void;
  onBasketTrade: (basket: TradeBasket) => TradeResult;
  onDismissMerchant: () => void;
  onAcceptNomads: () => void;
  onRejectNomads: () => void;
  onSelectHarvest: (active: boolean) => void;
  /**
   * The inspect sheet was dismissed from its own × button. The game must drop its selection:
   * hiding the sheet alone is not enough, because the frame loop re-renders the sheet every
   * frame for as long as something is still selected.
   */
  onCloseInspect: () => void;
  /**
   * Start or stop a continuous camera rotation. The buttons are *held*: -1 = left
   * (counter-clockwise), +1 = right (clockwise), 0 = released, stop rotating.
   */
  onRotate: (dir: -1 | 0 | 1) => void;
}

const LOW_NEED: Partial<Record<ResourceKind, number>> = {
  firewood: HEAT_PER_CITIZEN_WINTER,
  clothing: CLOTHING_PER_CITIZEN_WINTER,
};

export class UI {
  private el = {
    ages: byId('stat-ages'),
    health: byId('stat-health'),
    happy: byId('stat-happy'),
    sick: byId('stat-sick'),
    resources: byId('stat-resources'),
    season: byId('stat-season'),
    pause: byId('btn-pause'),
    speed: byId('btn-speed'),
    jobs: byId('btn-jobs'),
    menuBtn: byId('btn-menu'),
    rotLeft: byId('btn-rot-left'),
    rotRight: byId('btn-rot-right'),
    log: byId('log'),
    hint: byId('hint'),
    confirm: byId('confirm'),
    toolbar: byId('toolbar'),
    popout: byId('popout'),
    inspect: byId('inspect'),
    overlay: byId('overlay'),
    jobboard: byId('jobboard'),
    limitsBtn: byId('btn-limits'),
    limits: byId('limits'),
    historyBtn: byId('btn-history'),
    history: byId('history'),
    trade: byId('trade-overlay'),
    nomad: byId('nomad'),
  };
  private resChips = new Map<ResourceKind, HTMLElement>();
  private mode: 'inspect' | 'build' | 'path' | 'demolish' | 'harvest' = 'inspect';
  private selectedBuild: BuildingType | null = null;
  private selectedPath: PathTier | null = null;
  private openCategory: BuildCategory | 'paths' | null = null;
  private jobBoardOpen = false;
  private jobSig = '';
  private limitsOpen = false;
  private limitsSig = '';
  private historyOpen = false;
  private historySig = '';
  // Trading post overlay: which post is open, and the in-progress value-matching basket.
  private tradingPostId: number | null = null;
  private basketGive: Partial<Record<ResourceKind, number>> = {};
  private basketGet: Partial<Record<ResourceKind, number>> = {};
  private basketSeeds: Crop[] = [];
  private tradeSig = '';

  constructor(private cb: UICallbacks) {
    this.buildResourceChips();
    this.buildToolbar();
    this.el.pause.addEventListener('click', () => this.cb.onPauseToggle());
    this.el.speed.addEventListener('click', () => this.cb.onSpeedCycle());
    this.el.jobs.addEventListener('click', () => this.toggleJobBoard());
    this.el.limitsBtn.addEventListener('click', () => this.toggleLimits());
    this.el.historyBtn.addEventListener('click', () => this.toggleHistory());
    this.el.menuBtn.addEventListener('click', () => this.cb.onOpenMenu());
    this.holdToRotate(this.el.rotLeft, -1);
    this.holdToRotate(this.el.rotRight, 1);
  }

  /**
   * Wire a rotate button to turn the view for as long as it is held, rather than jumping a fixed
   * step per tap. Release, cancel, and pointer-leave all stop it, and `setPointerCapture` keeps the
   * events coming to this button even if the finger drifts off it mid-hold — without that, sliding
   * off the small button would strand the camera spinning forever.
   */
  private holdToRotate(btn: HTMLElement, dir: -1 | 1): void {
    const stop = (e: PointerEvent) => {
      if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
      this.cb.onRotate(0);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // don't let the press turn into a page scroll / text selection
      btn.setPointerCapture(e.pointerId);
      this.cb.onRotate(dir);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    // A pointer released outside the window never fires pointerup on the button.
    window.addEventListener('blur', () => this.cb.onRotate(0));
  }

  /** Hide the camera rotate buttons (e.g. in the flat 2D view where rotation is a no-op). */
  hideRotateButtons(): void {
    this.el.rotLeft.classList.add('hidden');
    this.el.rotRight.classList.add('hidden');
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
    // Children, students, adults. Old age used to have its own tally, but it told the player
    // nothing they could act on — an elder needs nothing special and leaves on their own schedule.
    // Splitting the *children* is the useful cut: it says how much of the next workforce is nearly
    // ready, and how much schooling the village should be paying for.
    let childCount = 0;
    let studentCount = 0;
    for (const c of s.citizens) {
      if (isInfant(c)) childCount++;
      else if (isStudent(c)) studentCount++;
    }
    const adultCount = pop - childCount - studentCount;
    this.el.ages.querySelector('.val')!.textContent = `🧒${childCount} 🎓${studentCount} 🧑${adultCount}`;
    this.el.health.querySelector('.val')!.textContent = `${Math.round(avgHealth(s))}`;
    this.el.happy.querySelector('.val')!.textContent = `${Math.round(avgHappiness(s))}`;
    this.el.health.classList.toggle('low', avgHealth(s) < 45);
    this.el.happy.classList.toggle('low', avgHappiness(s) < 45);
    const sick = s.citizens.reduce((n, c) => n + (c.sick ? 1 : 0), 0);
    this.el.sick.classList.toggle('hidden', sick === 0);
    this.el.sick.classList.add('low');
    this.el.sick.querySelector('.val')!.textContent = `${sick}`;
    // Count what households have already carried home, not just what is left in the barns.
    // The simulation has always fed villagers from their own larder first and only then from the
    // barns, so a barn-only total reads as famine in a village whose houses are full — which is
    // exactly what it did: the chip went red while every household had a season's food indoors.
    const food = totalFoodAvailable(s);
    this.foodChip.querySelector('.val')!.textContent = `${Math.floor(food)}`;
    this.foodChip.title = 'Total food (all types), including household larders';
    this.foodChip.classList.toggle('low', food < pop * FOOD_PER_CITIZEN_PER_SEASON);
    for (const kind of HUD_RESOURCES) {
      const chip = this.resChips.get(kind)!;
      // Firewood and clothing live in larders too, and are consumed from there first, so their
      // warnings have to count them for the same reason.
      const v = (totals[kind] ?? 0) + totalInLarders(s, kind);
      chip.querySelector('.val')!.textContent = `${Math.floor(v)}`;
      if (SURVIVAL_RESOURCES.includes(kind)) {
        chip.classList.toggle('low', v < pop * (LOW_NEED[kind] ?? 0));
      }
    }
    this.el.season.querySelector('.val')!.textContent = `${seasonLabel(s)} · Yr ${s.year}`;
    this.el.pause.textContent = paused ? '▶' : '⏸';
    this.el.speed.textContent = `${speed}×`;
  }

  // ---- Toolbar / categorized build menu ----
  private buildToolbar(): void {
    const tb = this.el.toolbar;
    tb.innerHTML = '';
    // No Inspect button: inspecting is simply "no tool selected", and deselecting whatever is
    // active drops back to it, so a dedicated button would only ever be a second way to do that.
    const tools: [string, string, () => void, string][] = [
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
      ['harvest', '🪓', () => this.setHarvest(), 'Harvest'],
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
        (key === 'harvest' && this.mode === 'harvest') ||
        (key === this.openCategory) ||
        (this.mode === 'build' && this.selectedBuild && BUILDING_DEFS[this.selectedBuild].category === key) ||
        (this.mode === 'path' && key === 'paths');
      b.classList.toggle('active', !!active);
    }
  }

  /**
   * Open a build category, or close it and drop straight back to inspecting. Closing the last open
   * tool always lands in inspect mode — that is what lets the toolbar do without a dedicated
   * Inspect button, since inspecting is simply "no tool selected".
   */
  private toggleCategory(cat: BuildCategory | 'paths'): void {
    if (this.mode === 'harvest') this.cb.onSelectHarvest(false);
    const closing = this.openCategory === cat;
    this.openCategory = closing ? null : cat;
    if (closing) {
      this.setInspect();
      return;
    }
    this.mode = 'inspect'; // a category is open but nothing inside it is picked yet
    this.cb.onSetDemolish(false);
    this.renderPopout();
    this.refreshToolbar();
  }

  /**
   * Lift the hint bar and event log clear of the build pop-out. The pop-out fills the strip just
   * above the toolbar — exactly where those two sit — so while it is open they move up above it
   * instead of being covered by it.
   */
  private raiseHints(raised: boolean): void {
    this.el.hint.classList.toggle('raised', raised);
    this.el.log.classList.toggle('raised', raised);
    this.el.confirm.classList.toggle('raised', raised);
  }

  private renderPopout(): void {
    const po = this.el.popout;
    if (!this.openCategory) {
      po.classList.add('hidden');
      po.innerHTML = '';
      this.raiseHints(false);
      return;
    }
    po.innerHTML = '';
    if (this.openCategory === 'paths') {
      for (const [tier, emoji, label, cost] of [
        ['dirt', '🟤', 'Dirt Path', 'free'],
        ['stone', '⬜', 'Stone Path', '🪨1/tile'],
        ['bridge', '🌉', 'Bridge', '🪵3/tile'],
        ['tunnel', '⛰️', 'Tunnel', '🪵6 🪨4/tile'],
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
    this.raiseHints(true);
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
    this.cb.onSelectHarvest(false);
    this.renderPopout();
    this.refreshToolbar();
    this.hideHint();
  }

  /** Demolish is a toggle, like harvest — tapping it again returns to inspect. */
  private setDemolish(): void {
    const activating = this.mode !== 'demolish';
    if (!activating) {
      this.setInspect();
      return;
    }
    this.mode = 'demolish';
    this.selectedBuild = null;
    this.selectedPath = null;
    this.openCategory = null;
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(null);
    this.cb.onSelectHarvest(false);
    this.cb.onSetDemolish(true);
    this.cb.onCloseInspect();
    this.renderPopout();
    this.refreshToolbar();
    this.showHint('Tap a building or path to select it, then confirm. 25% of materials are refunded.');
  }

  private setHarvest(): void {
    const activating = this.mode !== 'harvest';
    this.mode = activating ? 'harvest' : 'inspect';
    this.selectedBuild = null;
    this.selectedPath = null;
    this.openCategory = null;
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(null);
    this.cb.onSetDemolish(false);
    this.cb.onSelectHarvest(activating);
    this.cb.onCloseInspect();
    this.renderPopout();
    this.refreshToolbar();
    if (activating) this.showHint('Drag a square over trees or loose stone to mark them for harvest; pan with two fingers.');
    else this.hideHint();
  }

  private selectBuild(type: BuildingType): void {
    this.mode = 'build';
    this.selectedBuild = this.selectedBuild === type ? null : type;
    this.selectedPath = null;
    this.cb.onSetDemolish(false);
    this.cb.onSelectHarvest(false);
    this.cb.onSelectPath(null);
    this.cb.onSelectBuild(this.selectedBuild);
    if (!this.selectedBuild) this.mode = 'inspect';
    this.cb.onCloseInspect();
    this.renderPopout();
    this.refreshToolbar();
    // What the building is for — not how to place it. The Build button under the ghost says that.
    if (this.selectedBuild) this.showHint(BUILDING_DEFS[type].desc);
    else this.hideHint();
  }

  private selectPath(tier: PathTier): void {
    this.mode = 'path';
    this.selectedPath = this.selectedPath === tier ? null : tier;
    this.selectedBuild = null;
    this.cb.onSetDemolish(false);
    this.cb.onSelectHarvest(false);
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(this.selectedPath);
    if (!this.selectedPath) this.mode = 'inspect';
    this.cb.onCloseInspect();
    this.renderPopout();
    this.refreshToolbar();
    if (this.selectedPath) {
      const hint =
        tier === 'bridge'
          ? 'Drag one finger over water to plan a bridge; villagers build it out from the bank.'
          : 'Drag one finger to draw a path; pan with two fingers.';
      this.showHint(hint);
    } else this.hideHint();
  }

  clearSelection(): void {
    this.setInspect();
  }

  // ---- Inspect panel ----
  private inspectSig = '';
  showInspect(title: string, rows: InspectRow[], controls?: InspectControls): void {
    // Only rebuild the DOM when something changed — otherwise per-frame refreshes would clobber
    // the interactive controls (and reset any in-progress tap).
    const sig = JSON.stringify([title, rows, controls]);
    this.el.inspect.classList.remove('hidden');
    if (sig === this.inspectSig) return;
    this.inspectSig = sig;

    const body = rows.map((r) => `<div class="inv-row"><span>${r.label}</span><span>${r.value}</span></div>`).join('');
    let ctrlHtml = '';
    if (controls?.rename !== undefined) {
      ctrlHtml += `<div class="inv-ctrl"><span>Name</span>
        <input class="inv-name" id="insp-name" type="text" maxlength="24" value="${escapeAttr(controls.rename)}" /></div>`;
    }
    if (controls?.workers) {
      const wk = controls.workers;
      ctrlHtml += `<div class="inv-ctrl"><span>Workers <small>(max ${wk.max})</small></span>
        <div class="stepper"><button data-step="-1">−</button><span class="count">${wk.value}</span><button data-step="1">+</button></div></div>`;
    }
    if (controls?.toggle) {
      const opts = controls.toggle.options
        .map((o) => `<button data-v="${o.v}" class="${o.on ? 'on' : ''}">${o.label}</button>`)
        .join('');
      ctrlHtml += `<div class="inv-ctrl"><div class="jr-toggle">${opts}</div></div>`;
    }
    if (controls?.tradingPost) {
      const docked = controls.tradingPost.merchantDocked;
      ctrlHtml += `<div class="inv-ctrl"><button class="tp-open${docked ? ' docked' : ''}" id="insp-tp">${docked ? '🤝 Trade with merchant' : '📦 Manage trading post'}</button></div>`;
    }
    if (controls?.ranch) {
      const r = controls.ranch;
      ctrlHtml += `<div class="inv-ctrl"><span>Breed up to <small>(cap ${r.capacity})</small></span>
        <div class="stepper"><button data-rmax="-1">−</button><span class="count">${r.max}</span><button data-rmax="1">+</button></div></div>
        <div class="inv-ctrl ranch-actions">
          <button class="ranch-btn danger" id="insp-cull"${r.animals > 0 ? '' : ' disabled'}>🔪 Cull all</button>
          <button class="ranch-btn" id="insp-split"${r.canSplit ? '' : ' disabled'}>Split herd</button>
          <button class="ranch-btn" id="insp-transfer"${r.canTransfer ? '' : ' disabled'}>Transfer all</button>
        </div>`;
    }
    this.el.inspect.innerHTML =
      `<div class="inv-head">${title}<button class="close" id="insp-close">×</button></div>` +
      (body || '<div class="inv-row"><span>Empty</span></div>') + ctrlHtml;
    // Closing must clear the *game's* selection, not just this sheet — see `onCloseInspect`.
    byId('insp-close').addEventListener('click', () => this.cb.onCloseInspect());

    if (controls) {
      const id = controls.buildingId;
      const nameField = this.el.inspect.querySelector('#insp-name') as HTMLInputElement | null;
      if (nameField) {
        // Commit on blur and on Enter. The frame loop re-renders this sheet constantly, so the
        // signature above includes the name — otherwise every keystroke would be wiped by the
        // next re-render.
        const commit = () => this.cb.onRenameBuilding(id, nameField.value);
        nameField.addEventListener('change', commit);
        nameField.addEventListener('blur', commit);
        nameField.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') nameField.blur();
        });
      }
      this.el.inspect.querySelector('[data-step="-1"]')?.addEventListener('click', () => this.cb.onSetWorkers(id, -1));
      this.el.inspect.querySelector('[data-step="1"]')?.addEventListener('click', () => this.cb.onSetWorkers(id, 1));
      this.el.inspect.querySelector('#insp-tp')?.addEventListener('click', () => this.openTradingPost(id));
      if (controls.ranch) {
        const rc = controls.ranch;
        this.el.inspect.querySelector('[data-rmax="-1"]')?.addEventListener('click', () => this.cb.onSetRanchMax(id, -1));
        this.el.inspect.querySelector('[data-rmax="1"]')?.addEventListener('click', () => this.cb.onSetRanchMax(id, 1));
        this.el.inspect.querySelector('#insp-cull')?.addEventListener('click', () => this.cb.onCullRanch(id));
        this.el.inspect.querySelector('#insp-split')?.addEventListener('click', () => this.openRanchPicker(id, 'split', rc.targets));
        this.el.inspect.querySelector('#insp-transfer')?.addEventListener('click', () => this.openRanchPicker(id, 'transfer', rc.targets));
      }
      const tog = controls.toggle;
      if (tog) {
        this.el.inspect.querySelectorAll('.jr-toggle button').forEach((btn) =>
          btn.addEventListener('click', () => {
            const v = (btn as HTMLElement).dataset.v!;
            if (tog.group === 'mine') this.cb.onSetMineOutput(id, v as MineOutput);
            else if (tog.group === 'smith') this.cb.onSetSmithRecipe(id, v as SmithRecipe);
            else if (tog.group === 'crop') this.cb.onSetCrop(id, v as Crop);
            else if (tog.group === 'animal') this.cb.onSetAnimal(id, v as RanchAnimal);
            else this.cb.onSetForesterReplant(id, v === 'on');
          }),
        );
      }
    }
  }
  hideInspect(): void {
    this.el.inspect.classList.add('hidden');
    this.el.inspect.innerHTML = '';
    this.inspectSig = '';
  }
  isInspectOpen(): boolean {
    return !this.el.inspect.classList.contains('hidden');
  }

  // ---- Job board ----
  private toggleJobBoard(): void {
    this.jobBoardOpen = !this.jobBoardOpen;
    this.el.jobboard.classList.toggle('hidden', !this.jobBoardOpen);
    this.jobSig = '';
    // The side panels occupy the same strip of screen — opening one closes the others.
    if (this.jobBoardOpen) this.closeOtherPanels('jobs');
  }

  private toggleHistory(): void {
    this.historyOpen = !this.historyOpen;
    this.el.history.classList.toggle('hidden', !this.historyOpen);
    this.historySig = '';
    if (this.historyOpen) this.closeOtherPanels('history');
  }

  private toggleLimits(): void {
    this.limitsOpen = !this.limitsOpen;
    this.el.limits.classList.toggle('hidden', !this.limitsOpen);
    this.limitsSig = '';
    if (this.limitsOpen) this.closeOtherPanels('limits');
  }

  private closeOtherPanels(keep: 'jobs' | 'history' | 'limits'): void {
    if (keep !== 'jobs' && this.jobBoardOpen) this.toggleJobBoard();
    if (keep !== 'history' && this.historyOpen) this.toggleHistory();
    if (keep !== 'limits' && this.limitsOpen) this.toggleLimits();
  }

  /**
   * Render the village chronicle: every logged event, newest first, grouped under the season it
   * happened in. Toasts vanish after five seconds, so this is where the player goes to find out
   * what actually happened while they were looking elsewhere.
   */
  private refreshHistory(s: GameState): void {
    if (!this.historyOpen) return;
    const events = s.events ?? [];
    // Only rebuild when something changed — this runs every frame.
    const sig = `${events.length}|${events[0]?.text ?? ''}`;
    if (sig === this.historySig) return;
    this.historySig = sig;

    const p = this.el.history;
    p.innerHTML = '';
    const head = document.createElement('h3');
    head.innerHTML = `📜 History <button class="close" id="hist-close">×</button>`;
    head.querySelector('#hist-close')!.addEventListener('click', () => this.toggleHistory());
    p.appendChild(head);

    const sum = document.createElement('div');
    sum.className = 'summary';
    sum.textContent = events.length
      ? `${events.length} event${events.length > 1 ? 's' : ''} · newest first`
      : 'Nothing has happened yet.';
    p.appendChild(sum);

    let lastStamp = '';
    for (const e of events) {
      const stamp = `${SEASONS[e.season]} · Yr ${e.year}`;
      if (stamp !== lastStamp) {
        lastStamp = stamp;
        const sep = document.createElement('div');
        sep.className = 'hist-season';
        sep.textContent = stamp;
        p.appendChild(sep);
      }
      const row = document.createElement('div');
      row.className = `hist-row ${e.kind === 'good' ? 'good' : e.kind === 'bad' ? 'bad' : ''}`;
      row.textContent = e.text;
      p.appendChild(row);
    }
  }

  refreshPanels(s: GameState): void {
    if (this.jobBoardOpen) this.refreshJobBoard(s);
    if (this.limitsOpen) this.refreshLimits(s);
    if (this.historyOpen) this.refreshHistory(s);
    if (this.tradingPostId !== null) this.refreshTradingPost(s);
    this.refreshNomadPrompt(s);
  }

  // ---- Nomad arrival prompt ----
  private nomadSig = '';
  private refreshNomadPrompt(s: GameState): void {
    const offer = s.gameOver ? null : s.pendingNomads;
    const sig = offer ? `${offer.count}:${offer.sick}` : '';
    if (sig === this.nomadSig) return; // avoid rebuilding the card every frame
    this.nomadSig = sig;
    if (!offer) {
      this.el.nomad.classList.add('hidden');
      this.el.nomad.innerHTML = '';
      return;
    }
    const warn = offer.sick > 0 ? `<div class="nomad-warn">⚠️ Some of them look unwell.</div>` : '';
    this.el.nomad.innerHTML = `
      <div class="nomad-card">
        <h2>Nomads at the gate</h2>
        <p class="big">🧳</p>
        <p>A band of <strong>${offer.count}</strong> wandering adults asks to settle in your village. They will need food and housing like everyone else.</p>
        ${warn}
        <div class="nomad-actions">
          <button class="reject" id="nomad-reject">Turn away</button>
          <button class="accept" id="nomad-accept">Welcome them</button>
        </div>
      </div>`;
    this.el.nomad.classList.remove('hidden');
    byId('nomad-accept').addEventListener('click', () => this.cb.onAcceptNomads());
    byId('nomad-reject').addEventListener('click', () => this.cb.onRejectNomads());
  }

  /**
   * Stockpile limits: a cap per resource, and what it is currently doing to the village.
   *
   * Only the resources a limit can actually act on are listed (`LIMITABLE`) — offering a cap on
   * something no workplace produces would be a control that does nothing. Each row says how much
   * is stored, what the cap is, and whether it has stood any workplaces down, because "my
   * woodcutters have all become labourers" is otherwise a mystery.
   */
  private refreshLimits(s: GameState): void {
    const rows = LIMITABLE.map((k) => ({
      key: k,
      have: Math.round(limitStock(s, k)),
      cap: s.limits?.[k] ?? 0,
      idled: s.buildings.filter((b) => b.built && limitedOutput(b) === k && cappedOut(s, b)).length,
      places: s.buildings.filter((b) => b.built && limitedOutput(b) === k).length,
    }));
    const sig = rows.map((r) => `${r.key}:${r.have}:${r.cap}:${r.idled}/${r.places}`).join('|');
    if (sig === this.limitsSig) return;
    this.limitsSig = sig;

    const p = this.el.limits;
    p.innerHTML = '';
    const head = document.createElement('h3');
    head.innerHTML = `Stockpile Limits <button class="close" id="lim-close">×</button>`;
    p.appendChild(head);
    head.querySelector('#lim-close')!.addEventListener('click', () => this.toggleLimits());
    const sum = document.createElement('div');
    sum.className = 'summary';
    sum.textContent = 'At its limit, a workplace stops producing and its workers turn to labouring — they keep the job and pick it back up when the stock drops. Fields and pens carry on regardless.';
    p.appendChild(sum);

    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'job-row';
      const capText = r.cap > 0 ? `${r.have} / ${r.cap}` : `${r.have} · no limit`;
      const note = r.places === 0
        ? 'nothing produces this yet'
        : r.idled > 0
          ? `${r.idled} of ${r.places} labouring`
          : `${r.places} working`;
      const meta = LIMIT_META[r.key];
      row.innerHTML =
        `<span class="jr-emoji">${meta.icon}</span>` +
        `<div class="jr-main"><div class="jr-name">${meta.label}</div>` +
        `<div class="jr-sub">${capText} · ${note}</div></div>` +
        `<div class="stepper"><button data-step="-1">−</button><span class="count">${r.cap > 0 ? r.cap : '—'}</span><button data-step="1">+</button></div>`;
      row.querySelector('[data-step="-1"]')!.addEventListener('click', () => this.cb.onSetLimit(r.key, -1));
      row.querySelector('[data-step="1"]')!.addEventListener('click', () => this.cb.onSetLimit(r.key, 1));
      p.appendChild(row);
    }
  }

  private refreshJobBoard(s: GameState): void {
    // Every workplace, built or not — an unbuilt site still shows so workers can be pre-assigned.
    const jobs = s.buildings.filter((b) => BUILDING_DEFS[b.type].jobs > 0);
    const children = s.citizens.reduce((n, c) => n + (isAdult(c) ? 0 : 1), 0);
    const adults = s.citizens.length - children;
    const employed = s.citizens.reduce((n, c) => n + (c.jobId !== null ? 1 : 0), 0);
    const buildersWorking = s.citizens.reduce((n, c) => n + (c.builder ? 1 : 0), 0);
    // Free laborers are unemployed *adults* only — children have no job but can't be assigned.
    const laborers = s.citizens.reduce((n, c) => n + (isAdult(c) && c.jobId === null && !c.builder ? 1 : 0), 0);
    const sig =
      jobs.map((b) => `${b.id}:${b.name ?? ''}:${b.built ? 1 : 0}:${b.built ? 1 : footprintClear(s, b) ? 1 : 0}:${b.workers.length}:${b.desiredWorkers}:${b.output}:${b.recipe}:${b.crop}:${b.animal}`).join('|') +
      `#${adults},${children},${employed},${buildersWorking},${laborers},${s.desiredBuilders}#${s.seeds.join(',')}`;
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
    sum.textContent = `${adults} adults · 🧒 ${children} children · ❤️ ${Math.round(avgHealth(s))} · 😊 ${Math.round(avgHappiness(s))}`;
    p.appendChild(sum);

    // Builders — a global job (only these villagers construct work buildings). Always shown so the
    // player can staff construction even before any workplace exists.
    const brow = document.createElement('div');
    brow.className = 'job-row';
    brow.innerHTML = `
      <span class="jr-emoji">🔨</span>
      <div class="jr-main"><div class="jr-name">Builders</div>
        <div class="jr-sub">${buildersWorking} working / ${s.desiredBuilders} wanted · build sites & paths</div></div>
      <div class="stepper"><button data-step="-1">−</button><span class="count">${s.desiredBuilders}</span><button data-step="1">+</button></div>`;
    brow.querySelector('[data-step="-1"]')!.addEventListener('click', () => this.cb.onSetBuilders(-1));
    brow.querySelector('[data-step="1"]')!.addEventListener('click', () => this.cb.onSetBuilders(1));
    p.appendChild(brow);

    // Dedicated laborers field — free adults available to assign to any job.
    const lab = document.createElement('div');
    lab.className = 'summary';
    lab.textContent = `👷 Laborers (free adults): ${laborers}`;
    p.appendChild(lab);

    for (const b of jobs) {
      const def = BUILDING_DEFS[b.type];
      const row = document.createElement('div');
      row.className = 'job-row';
      let extra = '';
      if (b.type === 'mine') {
        extra = `<div class="jr-toggle" data-toggle="mine"><button data-v="coal" class="${b.output === 'coal' ? 'on' : ''}">Coal</button><button data-v="iron" class="${b.output === 'iron' ? 'on' : ''}">Iron</button></div>`;
      } else if (b.type === 'blacksmith') {
        extra = `<div class="jr-toggle" data-toggle="smith"><button data-v="iron" class="${b.recipe === 'iron' ? 'on' : ''}">Iron</button><button data-v="steel" class="${b.recipe === 'steel' ? 'on' : ''}">Steel</button></div>`;
      } else if (b.type === 'farm') {
        // Only crops the village has seeds for; none owned ⇒ prompt to buy one from a trader.
        extra = s.seeds.length
          ? `<div class="jr-toggle" data-toggle="crop">${s.seeds.map((c) => `<button data-v="${c}" class="${b.crop === c ? 'on' : ''}">${CROP_META[c].emoji}</button>`).join('')}</div>`
          : `<div class="jr-note">🌱 Buy a seed from a trader</div>`;
      } else if (b.type === 'ranch') {
        const cur = b.animal ?? 'cattle';
        extra = `<div class="jr-toggle" data-toggle="animal">${RANCH_ANIMALS.map((a) => `<button data-v="${a}" class="${cur === a ? 'on' : ''}">${ANIMAL_META[a].emoji}</button>`).join('')}</div>`;
      }
      // Unbuilt sites still list here so workers can be queued; hiring only starts once built.
      const status = b.built
        ? `${b.workers.length} working / ${b.desiredWorkers} wanted (max ${def.jobs})`
        : footprintClear(s, b)
          ? `🏗 under construction · ${b.desiredWorkers} wanted (max ${def.jobs})`
          : `🌲 clearing land · ${b.desiredWorkers} wanted (max ${def.jobs})`;
      row.innerHTML = `
        <span class="jr-emoji">${def.emoji}</span>
        <div class="jr-main"><div class="jr-name">${escapeAttr(buildingName(b))}</div>
          <div class="jr-sub">${status}</div>${extra}</div>
        <div class="stepper"><button data-step="-1">−</button><span class="count">${b.desiredWorkers}</span><button data-step="1">+</button></div>`;
      row.querySelector('[data-step="-1"]')!.addEventListener('click', () => this.cb.onSetWorkers(b.id, -1));
      row.querySelector('[data-step="1"]')!.addEventListener('click', () => this.cb.onSetWorkers(b.id, 1));
      const toggle = row.querySelector('.jr-toggle');
      if (toggle)
        toggle.querySelectorAll('button').forEach((btn) =>
          btn.addEventListener('click', () => {
            const v = (btn as HTMLElement).dataset.v!;
            if (b.type === 'mine') this.cb.onSetMineOutput(b.id, v as MineOutput);
            else if (b.type === 'blacksmith') this.cb.onSetSmithRecipe(b.id, v as SmithRecipe);
            else if (b.type === 'farm') this.cb.onSetCrop(b.id, v as Crop);
            else if (b.type === 'ranch') this.cb.onSetAnimal(b.id, v as RanchAnimal);
          }),
        );
      p.appendChild(row);
    }

    // Every remaining kind of work the village could do, listed from the first day so the board
    // shows the full trade a village has available rather than only what has already been placed.
    const builtTypes = new Set(jobs.map((b) => b.type));
    const unbuilt = BUILD_ORDER.filter((t) => isWorkplace(t) && !builtTypes.has(t));
    if (unbuilt.length > 0) {
      const head2 = document.createElement('div');
      head2.className = 'jb-section';
      head2.textContent = 'Not built yet';
      p.appendChild(head2);
      for (const t of unbuilt) {
        const def = BUILDING_DEFS[t];
        const row = document.createElement('div');
        row.className = 'job-row muted';
        const cost = (Object.entries(def.cost) as [ResourceKind, number][])
          .map(([k, a]) => `${RESOURCE_ICON[k]}${a}`)
          .join(' ');
        row.innerHTML = `
          <span class="jr-emoji">${def.emoji}</span>
          <div class="jr-main"><div class="jr-name">${def.name}</div>
            <div class="jr-sub">up to ${def.jobs} worker${def.jobs > 1 ? 's' : ''}${cost ? ` · ${cost}` : ''}</div></div>`;
        p.appendChild(row);
      }
    }
  }

  // ---- Trading post: inventory orders + value-matching merchant basket ----
  /** Open the trading post sheet for a building id (also the entry point debug hooks use). */
  openTradingPost(id: number): void {
    this.tradingPostId = id;
    this.resetBasket();
    this.el.trade.classList.remove('hidden');
    this.el.trade.innerHTML = `<div class="tp-card">
        <h2 id="tp-title">🚢 Trading Post <button class="close" id="tp-close">×</button></h2>
        <div class="summary">Set stock orders and a trader hauls those goods here from your barns. Trades are settled by matching values — offer goods worth at least the price.</div>
        <div class="tp-cols">
          <div class="tp-pane"><h3>Inventory &amp; orders</h3><div class="tp-scroll" id="tp-orders"></div></div>
          <div class="tp-pane" id="tp-merchant"></div>
        </div>
      </div>`;
    byId('tp-close').addEventListener('click', () => this.closeTradingPost());
    this.el.trade.onclick = (e) => {
      if (e.target === this.el.trade) this.closeTradingPost();
    };
    this.tradeSig = '';
  }
  closeTradingPost(): void {
    this.tradingPostId = null;
    this.el.trade.classList.add('hidden');
    this.el.trade.innerHTML = '';
    this.el.trade.onclick = null;
  }

  // ---- Placement widget: turn the building, and size it if it is a field or a pen ----
  private sizeEl: HTMLElement | null = null;
  /**
   * Shown for the whole time a building is selected for placement, sitting just under the ghost
   * at the centre of the screen rather than off in a corner where it covered the build bar.
   *
   * Two buttons and nothing else: build it where the ghost is, or turn it a quarter. The width and
   * height steppers appear above them only for the sizable buildings, which genuinely need them.
   */
  showPlaceWidget(
    label: string,
    rot: 0 | 1 | 2 | 3,
    size: { w: number; h: number; min: number; max: number } | null,
  ): void {
    void label;
    void rot;
    if (!this.sizeEl) {
      const el = document.createElement('div');
      el.className = 'ranch-size';
      document.body.appendChild(el);
      this.sizeEl = el;
    }
    const el = this.sizeEl;
    el.classList.remove('hidden');
    const row = (dim: 'w' | 'h', v: number, min: number, max: number) =>
      `<div class="rs-row"><span>${dim.toUpperCase()}</span><div class="stepper">
        <button data-rs="${dim}-1"${v <= min ? ' disabled' : ''}>−</button><span class="count">${v}</span>
        <button data-rs="${dim}1"${v >= max ? ' disabled' : ''}>+</button></div></div>`;
    const sizeRows = size
      ? row('w', size.w, size.min, size.max) + row('h', size.h, size.min, size.max)
      : '';
    el.innerHTML =
      sizeRows +
      `<div class="rs-actions">` +
      `<button class="rs-build" data-place="1">🔨 Build</button>` +
      `<button class="rs-rot" data-rot="1">⟳ Rotate</button>` +
      `</div>`;
    el.querySelectorAll('[data-rs]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const v = (btn as HTMLElement).dataset.rs!;
        this.cb.onSizeChange(v[0] as 'w' | 'h', Number(v.slice(1)));
      }),
    );
    el.querySelector('[data-rot]')?.addEventListener('click', () => this.cb.onRotateBuild());
    el.querySelector('[data-place]')?.addEventListener('click', () => this.cb.onPlaceBuild());
  }
  hideSizeWidget(): void {
    this.sizeEl?.classList.add('hidden');
  }

  // ---- Ranch split/transfer destination picker (reuses the modal container) ----
  private openRanchPicker(fromId: number, mode: 'split' | 'transfer', targets: { id: number; label: string }[]): void {
    if (targets.length === 0) return;
    let sel: number | null = null;
    this.el.trade.classList.remove('hidden');
    const title = mode === 'split' ? 'Split herd — pick a ranch' : 'Transfer herd — pick a ranch';
    this.el.trade.innerHTML = `<div class="tp-card picker">
        <h2>${title}<button class="close" id="rp-close">×</button></h2>
        <div class="summary">Tap a ranch to select it, then confirm.</div>
        <div class="ranch-targets">${targets.map((t) => `<button class="ranch-target" data-id="${t.id}">${t.label}</button>`).join('')}</div>
        <button class="do-trade" id="rp-confirm" disabled>Confirm</button>
      </div>`;
    byId('rp-close').addEventListener('click', () => this.closeRanchPicker());
    this.el.trade.onclick = (e) => {
      if (e.target === this.el.trade) this.closeRanchPicker();
    };
    this.el.trade.querySelectorAll('.ranch-target').forEach((btn) =>
      btn.addEventListener('click', () => {
        sel = Number((btn as HTMLElement).dataset.id);
        this.el.trade.querySelectorAll('.ranch-target').forEach((b) => b.classList.toggle('on', b === btn));
        (byId('rp-confirm') as HTMLButtonElement).disabled = false;
      }),
    );
    byId('rp-confirm').addEventListener('click', () => {
      if (sel == null) return;
      if (mode === 'split') this.cb.onSplitRanch(fromId, sel);
      else this.cb.onTransferRanch(fromId, sel);
      this.closeRanchPicker();
    });
  }
  private closeRanchPicker(): void {
    this.el.trade.classList.add('hidden');
    this.el.trade.innerHTML = '';
    this.el.trade.onclick = null;
  }

  private resetBasket(): void {
    this.basketGive = {};
    this.basketGet = {};
    this.basketSeeds = [];
  }
  private currentBasket(): TradeBasket {
    return { give: this.basketGive, get: this.basketGet, buySeeds: this.basketSeeds };
  }

  /**
   * The quantity control on a trade row: coarse and fine steps either side of a field the player
   * can just type into.
   *
   * Stepping one at a time is fine for a handful of tools and hopeless for a hundred stone, so
   * every row carries ±1, ±10 and (where there is a ceiling) an All button, with the field itself
   * accepting a typed figure. `attr` names the data attribute the click handlers read, which is
   * also what keeps the three lists — orders, buy, give — from picking up each other's buttons.
   */
  private qtyControl(attr: string, k: string, value: number, max: number): string {
    const cap = max >= 0 ? ` max="${max}"` : '';
    const all = max >= 0 ? `<button class="qty-all" data-${attr}="max" data-k="${k}">All</button>` : '';
    return `<span class="qty">
        <button data-${attr}="-10" data-k="${k}">−10</button>
        <button data-${attr}="-1" data-k="${k}">−</button>
        <input class="qty-in" data-${attr}set="${k}" type="number" inputmode="numeric" min="0"${cap} value="${value}" />
        <button data-${attr}="1" data-k="${k}">+</button>
        <button data-${attr}="10" data-k="${k}">+10</button>${all}
      </span>`;
  }

  /**
   * Wire one list of quantity controls. `step` takes the signed amount (or `max` for All) and
   * `set` an absolute typed figure; the caller decides what those mean for its own list.
   */
  private wireQty(
    root: HTMLElement,
    attr: string,
    step: (k: string, delta: number | 'max') => void,
    set: (k: string, value: number) => void,
  ): void {
    root.querySelectorAll(`button[data-${attr}]`).forEach((btn) => {
      const el = btn as HTMLElement;
      const raw = el.dataset[attr]!;
      el.addEventListener('click', () => step(el.dataset.k!, raw === 'max' ? 'max' : Number(raw)));
    });
    root.querySelectorAll(`input[data-${attr}set]`).forEach((el) => {
      const input = el as HTMLInputElement;
      const k = input.dataset[`${attr}set`]!;
      // Commit on change and on Enter, never on keystroke: the panel rebuilds whenever the post's
      // stock ticks over, and committing per character would replace the field mid-word.
      const commit = () => set(k, Math.floor(Number(input.value)));
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') input.blur();
      });
      input.addEventListener('blur', commit);
    });
  }

  private refreshTradingPost(s: GameState): void {
    const post = this.tradingPostId === null ? null : s.buildings.find((b) => b.id === this.tradingPostId && b.built);
    if (!post) {
      this.closeTradingPost();
      return;
    }
    // Never rebuild under a field the player is typing in — the frame loop calls this constantly
    // and the post's stock changes as haulers arrive, which would otherwise wipe the entry.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.el.trade.contains(active)) return;
    const m = s.merchant;
    const store = post.store ?? {};
    const orders = post.orders ?? {};
    // Signature so we only rebuild when something the panel shows actually changed.
    const sig = JSON.stringify([
      m.present,
      m.category,
      m.stock,
      m.seedStock,
      RESOURCE_KINDS.map((k) => [Math.floor(store[k] ?? 0), orders[k] ?? 0]),
      this.basketGive,
      this.basketGet,
      this.basketSeeds,
      s.seeds.length,
    ]);
    if (sig === this.tradeSig) return;
    this.tradeSig = sig;

    // Inventory & orders: every resource with its unit value, current stock, and an order stepper.
    byId('tp-orders').innerHTML = RESOURCE_KINDS.map((k) => {
      const have = Math.floor(store[k] ?? 0);
      return `<div class="tp-row">
          <span class="tp-good">${RESOURCE_ICON[k]} ${k}</span>
          <span class="tp-val" title="Trade value per unit">◈${TRADE_VALUE[k]}</span>
          <span class="tp-have" title="In the post now">${have}</span>
          ${this.qtyControl('ord', k, orders[k] ?? 0, -1)}
        </div>`;
    }).join('');
    // An order is a standing target, not a basket, so there is no ceiling and no All button.
    this.wireQty(
      byId('tp-orders'),
      'ord',
      (k, d) => this.cb.onSetTradeOrder(post.id, k as ResourceKind, d === 'max' ? 0 : d),
      (k, v) => this.cb.onSetTradeOrderTo(post.id, k as ResourceKind, v),
    );

    this.renderMerchantPane(s, post.store ?? {});
  }

  /** The right-hand pane: the docked merchant's goods and the value-matching basket, or a wait note. */
  private renderMerchantPane(s: GameState, store: Partial<Record<ResourceKind, number>>): void {
    const pane = byId('tp-merchant');
    const m = s.merchant;
    if (!m.present || !m.category) {
      pane.innerHTML = `<h3>Merchant</h3><div class="tp-wait">No merchant docked. One may sail in at any time — the post does not need to be staffed for a boat to call.</div>`;
      return;
    }
    const meta = MERCHANT_CATEGORY_META[m.category];
    const basket = this.currentBasket();
    const offer = offerValue(basket);
    const need = requiredValue(basket);
    const buy = purchaseValue(basket);
    const ok = buy > 0 && offer + 1e-6 >= need;

    // Buy side: merchant resource stock, then seed unlocks.
    const buyRows = (Object.keys(m.stock) as ResourceKind[])
      .filter((k) => (m.stock[k] ?? 0) > 0)
      .map((k) => {
        const stock = Math.floor(m.stock[k] ?? 0);
        return `<div class="tp-row">
            <span class="tp-good">${RESOURCE_ICON[k]} ${k}</span>
            <span class="tp-val">◈${TRADE_VALUE[k]}</span>
            <span class="tp-have"><small>of ${stock}</small></span>
            ${this.qtyControl('buy', k, this.basketGet[k] ?? 0, stock)}
          </div>`;
      })
      .join('');
    const seedRows = m.seedStock
      .map((c) => {
        const picked = this.basketSeeds.includes(c);
        return `<div class="tp-row seed">
            <span class="tp-good">${CROP_META[c].emoji} ${CROP_META[c].label} seed</span>
            <span class="tp-val">◈${SEED_COST}</span>
            <button class="seed-buy${picked ? ' on' : ''}" data-seed="${c}">${picked ? '✓ in cart' : 'add'}</button>
          </div>`;
      })
      .join('');

    // Give side: only goods actually sitting in the post inventory can be offered.
    const giveKinds = RESOURCE_KINDS.filter((k) => (store[k] ?? 0) > 0);
    const giveRows = giveKinds.length
      ? giveKinds
          .map((k) => {
            const have = Math.floor(store[k] ?? 0);
            return `<div class="tp-row">
                <span class="tp-good">${RESOURCE_ICON[k]} ${k}</span>
                <span class="tp-val">◈${TRADE_VALUE[k]}</span>
                <span class="tp-have"><small>of ${have}</small></span>
                ${this.qtyControl('give', k, this.basketGive[k] ?? 0, have)}
              </div>`;
          })
          .join('')
      : `<div class="tp-wait">Nothing in the post yet — set stock orders on the left so your trader brings goods to sell.</div>`;

    pane.innerHTML = `<h3>${meta.emoji} ${meta.label}</h3>
      <div class="tp-sub">You buy</div>${buyRows || '<div class="tp-wait">Sold out.</div>'}${seedRows}
      <div class="tp-sub">You give <small>(from post stock)</small></div>${giveRows}
      <div class="tp-totals ${ok ? 'ok' : 'short'}">Offer ◈${offer.toFixed(0)} / need ◈${need.toFixed(0)} ${buy > 0 ? (ok ? '✓' : '✗') : ''}</div>
      <div class="tp-actions">
        <button class="do-trade" id="tp-do"${ok ? '' : ' disabled'}>Trade</button>
        <button class="tp-dismiss" id="tp-dismiss">⛵ Dismiss</button>
      </div>`;

    // Both baskets clamp to what is actually available: the merchant's stock on the buy side, the
    // post's own inventory on the give side. All fills the row to that ceiling in one tap.
    const setBasket = (
      basket: Partial<Record<ResourceKind, number>>,
      k: ResourceKind,
      value: number,
      max: number,
    ): void => {
      const v = clampInt(value, 0, max);
      if (v > 0) basket[k] = v;
      else delete basket[k];
      this.tradeSig = '';
    };
    this.wireQty(
      pane,
      'buy',
      (key, d) => {
        const k = key as ResourceKind;
        const max = Math.floor(m.stock[k] ?? 0);
        setBasket(this.basketGet, k, d === 'max' ? max : (this.basketGet[k] ?? 0) + d, max);
      },
      (key, v) => setBasket(this.basketGet, key as ResourceKind, v, Math.floor(m.stock[key as ResourceKind] ?? 0)),
    );
    this.wireQty(
      pane,
      'give',
      (key, d) => {
        const k = key as ResourceKind;
        const max = Math.floor(store[k] ?? 0);
        setBasket(this.basketGive, k, d === 'max' ? max : (this.basketGive[k] ?? 0) + d, max);
      },
      (key, v) => setBasket(this.basketGive, key as ResourceKind, v, Math.floor(store[key as ResourceKind] ?? 0)),
    );
    pane.querySelectorAll('button[data-seed]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const c = (btn as HTMLElement).dataset.seed as Crop;
        this.basketSeeds = this.basketSeeds.includes(c) ? this.basketSeeds.filter((x) => x !== c) : [...this.basketSeeds, c];
        this.tradeSig = '';
      }),
    );
    byId('tp-dismiss').addEventListener('click', () => this.cb.onDismissMerchant());
    byId('tp-do').addEventListener('click', () => {
      const r = this.cb.onBasketTrade(this.currentBasket());
      if (r.ok) this.resetBasket();
      this.flashHint(r.ok ? 'Trade complete' : r.reason ?? 'Trade failed');
      this.tradeSig = '';
    });
  }

  // ---- Confirm bar ----
  private confirmSig = '';
  /**
   * Show a pending action awaiting a decision — drawn path tiles, or a building picked for
   * demolition. Rebuilt only when the message changes, since the frame loop calls this constantly.
   */
  showConfirm(text: string, confirmLabel: string, onConfirm: () => void, onCancel: () => void): void {
    const sig = `${text}|${confirmLabel}`;
    this.el.confirm.classList.remove('hidden');
    if (sig === this.confirmSig) return;
    this.confirmSig = sig;
    this.el.confirm.innerHTML =
      `<span class="cf-text">${text}</span>` +
      `<button class="cf-cancel" id="cf-cancel">Cancel</button>` +
      `<button class="cf-ok" id="cf-ok">${confirmLabel}</button>`;
    byId('cf-ok').addEventListener('click', onConfirm);
    byId('cf-cancel').addEventListener('click', onCancel);
  }

  hideConfirm(): void {
    if (this.confirmSig === '') return;
    this.confirmSig = '';
    this.el.confirm.classList.add('hidden');
    this.el.confirm.innerHTML = '';
  }

  // ---- Hints / log ----
  /**
   * Whether the instructional hint bar is shown. Off hides the "here is how this tool works"
   * prompts a player stops needing after their first village; it does *not* silence `flashHint`,
   * which reports the outcome of something the player just did and is never noise.
   */
  private tipsOn = true;
  setTips(on: boolean): void {
    this.tipsOn = on;
    if (!on && this.hintIsTip) this.hideHint();
  }
  tipsEnabled(): boolean {
    return this.tipsOn;
  }
  private hintIsTip = false;

  /** An instructional tip, suppressed when the player has turned tips off. */
  showHint(text: string): void {
    this.hintIsTip = true;
    if (!this.tipsOn) return;
    this.setHintText(text);
  }
  hideHint(): void {
    this.el.hint.classList.add('hidden');
  }
  /** Transient feedback on an action just taken — shown whether or not tips are on. */
  flashHint(text: string): void {
    this.hintIsTip = false;
    this.setHintText(text);
    window.setTimeout(() => {
      if (this.mode === 'inspect') this.hideHint();
    }, 1600);
  }
  private setHintText(text: string): void {
    this.el.hint.textContent = text;
    this.el.hint.classList.remove('hidden');
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

  /** The title screen: New Game, Continue / Load Game (if a save exists), Settings, placeholder. */
  showMainMenu(opts: {
    hasSave: boolean;
    onNew: () => void;
    onContinue: () => void;
    onLoad: () => void;
    onSettings: () => void;
  }): void {
    const saved = opts.hasSave
      ? `<button id="mm-continue">Continue</button><button id="mm-load">Load Game</button>`
      : '';
    this.overlayCard(
      `<h1>Little Village</h1><p class="big">🏡🌲🌾</p>` +
        `<div class="menu-list">` +
        `<button id="mm-new">New Game</button>` +
        saved +
        `<button class="ghost" id="mm-settings">Settings</button>` +
        `<button class="ghost" id="mm-account" disabled>Sign In / Create Account — coming soon</button>` +
        `</div>` +
        // Build stamp: version, commit and build date, so it's obvious whether the device is on
        // the newest deploy or a cached service-worker copy of an older one.
        `<p class="build-stamp" id="mm-build">${BUILD_STAMP}</p>`,
      'menu-card',
    );
    byId('mm-new').addEventListener('click', () => opts.onNew());
    if (opts.hasSave) {
      byId('mm-continue').addEventListener('click', () => opts.onContinue());
      byId('mm-load').addEventListener('click', () => opts.onLoad());
    }
    byId('mm-settings').addEventListener('click', () => opts.onSettings());
  }

  /** Map-size chooser reached from New Game. */
  showSizeSelect(opts: { onPick: (size: MapSize) => void; onBack: () => void }): void {
    const btn = (id: MapSize, label: string) => {
      const dim = MAP_SIZES[id];
      return `<button id="sz-${id}">${label}<span class="sub">${dim}×${dim} tiles</span></button>`;
    };
    this.overlayCard(
      `<h2>Choose a map size</h2>` +
        `<div class="menu-list">` +
        btn('small', 'Small') +
        btn('large', 'Large') +
        `<button class="ghost" id="sz-back">Back</button>` +
        `</div>`,
      'menu-card',
    );
    (['small', 'large'] as MapSize[]).forEach((size) =>
      byId(`sz-${size}`).addEventListener('click', () => opts.onPick(size)),
    );
    byId('sz-back').addEventListener('click', () => opts.onBack());
  }

  /** Difficulty chooser (Easy/Normal/Hard) with an On/Off disasters toggle. */
  showDifficultySelect(opts: {
    disasters: boolean;
    onToggleDisasters: (on: boolean) => void;
    onPick: (difficulty: Difficulty) => void;
    onBack: () => void;
  }): void {
    const diffBtn = (d: Difficulty) =>
      `<button id="diff-${d}">${DIFFICULTY_META[d].label}<span class="sub">${DIFFICULTY_META[d].desc}</span></button>`;
    const seg = (on: boolean, label: string) =>
      `<button class="seg${opts.disasters === on ? ' on' : ''}" id="diff-dis-${on ? 'on' : 'off'}">${label}</button>`;
    this.overlayCard(
      `<h2>Choose difficulty</h2>` +
        `<div class="menu-list">` +
        DIFFICULTIES.map(diffBtn).join('') +
        `<div class="set-label">Disasters (fire &amp; disease)</div>` +
        `<div class="seg-row">${seg(true, 'On')}${seg(false, 'Off')}</div>` +
        `<button class="ghost" id="diff-back">Back</button>` +
        `</div>`,
      'menu-card',
    );
    DIFFICULTIES.forEach((d) => byId(`diff-${d}`).addEventListener('click', () => opts.onPick(d)));
    byId('diff-dis-on').addEventListener('click', () => opts.onToggleDisasters(true));
    byId('diff-dis-off').addEventListener('click', () => opts.onToggleDisasters(false));
    byId('diff-back').addEventListener('click', () => opts.onBack());
  }

  /** In-game pause menu: Resume, Save, Load, Settings, New Game, Main Menu. */
  showPauseMenu(opts: {
    onResume: () => void;
    onSave: () => void;
    onLoad: () => void;
    onSettings: () => void;
    onNewGame: () => void;
    onMainMenu: () => void;
  }): void {
    this.overlayCard(
      `<h2>Paused</h2>` +
        `<div class="menu-list">` +
        `<button id="pm-resume">Resume</button>` +
        `<button id="pm-save">Save</button>` +
        `<button id="pm-load">Load</button>` +
        `<button id="pm-settings">Settings</button>` +
        `<button id="pm-new">New Game</button>` +
        `<button class="ghost" id="pm-main">Main Menu</button>` +
        `</div>`,
      'menu-card',
    );
    byId('pm-resume').addEventListener('click', () => opts.onResume());
    byId('pm-save').addEventListener('click', () => opts.onSave());
    byId('pm-load').addEventListener('click', () => opts.onLoad());
    byId('pm-settings').addEventListener('click', () => opts.onSettings());
    byId('pm-new').addEventListener('click', () => opts.onNewGame());
    byId('pm-main').addEventListener('click', () => opts.onMainMenu());
  }

  /**
   * Slot picker for loading or saving. Empty slots are disabled in load mode.
   *
   * An occupied slot also carries a rename field and a delete button. The name is an input rather
   * than a prompt so it reads as part of the row, and it sits *outside* the big pick button — a
   * text field nested in a button cannot be focused without also triggering the button.
   */
  showSlotSelect(opts: {
    mode: 'load' | 'save';
    slots: { index: number; info: { year: number; pop: number; size: MapSize; name: string | null } | null }[];
    onPick: (slot: number) => void;
    onRename: (slot: number, name: string) => void;
    onDelete: (slot: number) => void;
    onBack: () => void;
  }): void {
    const sizeLabel: Record<MapSize, string> = { small: 'Small', large: 'Large' };
    const rows = opts.slots
      .map(({ index, info }) => {
        const fallback = `Slot ${index + 1}`;
        if (!info) {
          const disabled = opts.mode === 'load' ? ' disabled' : '';
          return `<button id="slot-${index}"${disabled}>${fallback}<span class="sub">Empty</span></button>`;
        }
        const title = info.name ?? fallback;
        return (
          `<div class="slot-row">` +
          `<button id="slot-${index}" class="slot-pick">${escapeHtml(title)}` +
          `<span class="sub">Yr ${info.year} · ${info.pop} people · ${sizeLabel[info.size]}</span></button>` +
          `<div class="slot-edit">` +
          `<input id="slot-name-${index}" class="slot-name" type="text" maxlength="${SLOT_NAME_MAX}"` +
          ` value="${escapeAttr(info.name ?? '')}" placeholder="${fallback}" aria-label="Name for ${fallback}" />` +
          `<button id="slot-del-${index}" class="slot-del" title="Delete this village" aria-label="Delete ${escapeAttr(title)}">🗑</button>` +
          `</div></div>`
        );
      })
      .join('');
    this.overlayCard(
      `<h2>${opts.mode === 'load' ? 'Load Game' : 'Save Game'}</h2>` +
        `<div class="menu-list">${rows}<button class="ghost" id="slot-back">Back</button></div>`,
      'menu-card',
    );
    for (const { index, info } of opts.slots) {
      if (opts.mode === 'load' && !info) continue;
      byId(`slot-${index}`).addEventListener('click', () => opts.onPick(index));
      if (!info) continue;
      const field = byId(`slot-name-${index}`) as HTMLInputElement;
      // Commit on blur and on Enter, the same as the building rename field.
      const commit = () => opts.onRename(index, field.value);
      field.addEventListener('change', commit);
      field.addEventListener('blur', commit);
      field.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') field.blur();
      });
      byId(`slot-del-${index}`).addEventListener('click', () => opts.onDelete(index));
    }
    byId('slot-back').addEventListener('click', () => opts.onBack());
  }

  /** Settings: graphics tier (applies on reload) and clear-all-saves. */
  showSettings(opts: {
    gfx: 'auto' | 'low' | 'high';
    tips: boolean;
    autoStaff: boolean;
    onSetGfx: (g: 'auto' | 'low' | 'high') => void;
    onSetTips: (on: boolean) => void;
    onSetAutoStaff: (on: boolean) => void;
    onClearSaves: () => void;
    onReload: () => void;
    onBack: () => void;
  }): void {
    const gfxBtn = (g: 'auto' | 'low' | 'high', label: string) =>
      `<button class="seg${opts.gfx === g ? ' on' : ''}" id="set-gfx-${g}">${label}</button>`;
    const tipBtn = (on: boolean, label: string) =>
      `<button class="seg${opts.tips === on ? ' on' : ''}" id="set-tips-${on ? 'on' : 'off'}">${label}</button>`;
    const staffBtn = (on: boolean, label: string) =>
      `<button class="seg${opts.autoStaff === on ? ' on' : ''}" id="set-staff-${on ? 'on' : 'off'}">${label}</button>`;
    this.overlayCard(
      `<h2>Settings</h2>` +
        `<div class="menu-list">` +
        `<div class="set-label">Graphics</div>` +
        `<div class="seg-row">${gfxBtn('auto', 'Auto')}${gfxBtn('low', 'Low')}${gfxBtn('high', 'High')}</div>` +
        `<div class="set-note">Graphics changes apply after reloading.</div>` +
        `<div class="set-label">Staff new workplaces</div>` +
        `<div class="seg-row">${staffBtn(true, 'On')}${staffBtn(false, 'Off')}</div>` +
        `<div class="set-note">A finished workplace hires whoever is free instead of standing empty until you staff it. ` +
        `A job left open by a villager dying is always refilled, either way.</div>` +
        `<div class="set-label">Tips</div>` +
        `<div class="seg-row">${tipBtn(true, 'On')}${tipBtn(false, 'Off')}</div>` +
        `<div class="set-note">The hint bar explaining each tool. Warnings and the event log are unaffected.</div>` +
        `<button id="set-reload">Reload now</button>` +
        `<button class="ghost" id="set-clear">Clear all saves</button>` +
        `<button class="ghost" id="set-back">Back</button>` +
        `</div>`,
      'menu-card',
    );
    (['auto', 'low', 'high'] as const).forEach((g) =>
      byId(`set-gfx-${g}`).addEventListener('click', () => {
        opts.onSetGfx(g);
        // Re-render the panel so the selected segment updates.
        this.showSettings({ ...opts, gfx: g });
      }),
    );
    ([true, false] as const).forEach((on) =>
      byId(`set-tips-${on ? 'on' : 'off'}`).addEventListener('click', () => {
        opts.onSetTips(on);
        this.showSettings({ ...opts, tips: on });
      }),
    );
    ([true, false] as const).forEach((on) =>
      byId(`set-staff-${on ? 'on' : 'off'}`).addEventListener('click', () => {
        opts.onSetAutoStaff(on);
        this.showSettings({ ...opts, autoStaff: on });
      }),
    );
    byId('set-reload').addEventListener('click', () => opts.onReload());
    byId('set-clear').addEventListener('click', () => {
      if (confirm('Delete all saved villages? This cannot be undone.')) opts.onClearSaves();
    });
    byId('set-back').addEventListener('click', () => opts.onBack());
  }

  showGameOver(s: GameState, onNew: () => void, onMainMenu: () => void): void {
    this.overlayCard(
      `<h2>Your village is gone</h2><p class="big">🪦</p><p>The last villager is gone after ${s.year} year${s.year > 1 ? 's' : ''}. Store enough food and fuel, and keep everyone clothed for winter.</p>` +
        `<div class="menu-list"><button id="ov-new">Try Again</button><button class="ghost" id="ov-main">Main Menu</button></div>`,
      'menu-card',
    );
    byId('ov-new').addEventListener('click', () => {
      this.hideOverlay();
      onNew();
    });
    byId('ov-main').addEventListener('click', () => {
      this.hideOverlay();
      onMainMenu();
    });
  }
  private overlayCard(inner: string, extraClass = ''): void {
    this.el.overlay.innerHTML = `<div class="card${extraClass ? ' ' + extraClass : ''}">${inner}</div>`;
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

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Escape a string for use inside a double-quoted HTML attribute (building names are player text). */
function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Player-typed text going into element *content* rather than an attribute. */
function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
