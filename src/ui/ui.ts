import {
  GameState,
  BuildingType,
  BUILD_ORDER,
  POLICY_META,
  activePolicies,
  PolicyId,
  BUILDING_DEFS,
  MapSize,
  Difficulty,
  DIFFICULTIES,
  DIFFICULTY_META,
  RESOURCE_ICON,
  RESOURCE_KINDS,
  HUD_CORE,
  FOOD_ICON,
  ResourceKind,
  seasonLabel,
  SEASONS,
  isWorkplace,
  buildingName,
  MineOutput,
  SmithRecipe,
  TailorRecipe,
  LuxuryRecipe,
  Crop,
  RanchAnimal,
  CROP_META,
  RANCH_ANIMALS,
  ANIMAL_META,
  BuildCategory,
  CATEGORY_ORDER,
  CATEGORY_META,
  CODEX_NOTES,
  tradePosts,
  tradeStaff,
  tradeCapacity,
  tradeWorking,
  Building,
  HarvestKind,
  HARVEST_KINDS,
  HARVEST_KIND_META,
  SIZABLE,
  WORK_RADIUS_PER_WORKER,
  TRADE_VALUE,
  SEED_COST,
  MERCHANT_CATEGORY_META,
  PORT_SEASON_MERCHANT,
  PORT_ARRIVAL_CHANCE,
  ADULT_AGE,
  isInfant,
  isStudent,
  isAdult,
  LIMITABLE,
  LIMIT_META,
  demoFraction,
  LimitKey,
  limitedOutput,
} from '../types';
import { footprintToClear } from '../game/buildings';
import { atLimit, cappedOut, isLowStock, limitStock } from '../game/simulation';
import { SLOT_NAME_MAX } from '../game/save';
import { newSeed } from '../game/rng';
import { totalStored, totalStoredAll, totalFoodAvailable, totalInLarders } from '../game/storage';
import {
  LogKind,
  TradeResult,
  TradeBasket,
  offerValue,
  purchaseValue,
  requiredValue,
  merchantBerth,
  avgHealth,
  avgHappiness,
} from '../game/simulation';

import {
  BUILDING_TIER,
  PATH_TIER_AT,
  TIERS,
  TIER_META,
  VillageTier,
  buildingsAt,
  pathsAt,
  tierChecks,
  tierReaches,
  villageTier,
} from '../game/tiers';

/**
 * What each kind of roadway is called in the progression panel.
 *
 * The build menu builds these labels inline from its own table; naming them once here keeps the
 * two panels saying the same words for the same thing.
 */
const PATH_LABEL: Record<PathTier, string> = {
  dirt: '🟤 Dirt Path',
  stone: '⬜ Stone Path',
  bridge: '🌉 Timber Bridge',
  stonebridge: '🏛️ Stone Bridge',
  tunnel: '⛰️ Tunnel',
};

export type PathTier = 'dirt' | 'stone' | 'bridge' | 'stonebridge' | 'tunnel';

/** The four tabs of the one village menu — jobs and limits to set, history and progress to read. */
export type VillageTab = 'jobs' | 'limits' | 'history' | 'progress';

/** One row of the achievements ledger, ready for the UI — no game logic, just what to draw. */
export interface AchRow {
  title: string;
  /** The tier's medal glyph. */
  medal: string;
  /** Tier slug, for the bubble's colour. */
  tier: string;
  unlocked: boolean;
}

/** Version / commit / build date, injected at build time — see `__BUILD_STAMP__`. */
export const BUILD_STAMP = __BUILD_STAMP__;

export interface InspectRow {
  label: string;
  value: string;
  /**
   * Colour a row that carries a status rather than a plain reading: a stop (bad, red), a caution
   * (warn, amber), an intended pause (capped, the HUD's "full" green), or all-well (good, green).
   * Left unset for the ordinary label/value rows, which stay muted.
   */
  tone?: 'good' | 'warn' | 'bad' | 'capped';
  /**
   * Pack this row into a compact two-column grid alongside its neighbours instead of giving it a
   * full-width line of its own. Used for the raw stock dump on a barn, where a resource per line
   * ran the sheet off the screen — see `.inv-grid`.
   */
  grid?: boolean;
}

/** Interactive controls shown at the foot of the inspect sheet for a built workplace. */
export interface InspectControls {
  buildingId: number;
  /** Workplace only: current name, shown in an editable field so the player can rename it. */
  rename?: string;
  /** Worker allocation stepper (current desired vs the job cap). */
  workers?: { value: number; max: number };
  /**
   * Switch this workplace on or off. `on` is its current state; disabled sends its workers to
   * labour elsewhere and halts production while keeping the worker count for when it comes back.
   */
  enable?: { on: boolean };
  /** A single option toggle (mine output / smith recipe / forester replant / farm crop / ranch animal). */
  toggle?: { group: 'mine' | 'smith' | 'tailor' | 'luxury' | 'forester' | 'crop' | 'animal'; options: { v: string; label: string; on: boolean }[] };
  /**
   * Trading post or Port: show a button that opens the inventory/trade panel, and flag a merchant
   * tied up *at this berth* — a river trader at the post, a fleet at the harbour.
   */
  tradingPost?: { merchantDocked: boolean; port: boolean; landlocked?: boolean };
  /**
   * Pull it down, or call it off. `blocked` is the village's last barn, which has to stay
   * standing; `marked` swaps the button for a cancel, right up until the walls actually come down.
   * `construction` flags an unfinished site: there is nothing to pull down, so the button reads
   * "Cancel construction" and takes the site away at once (materials mostly refunded) once confirmed.
   */
  demolish?: { marked: boolean; blocked: boolean; underway: boolean; construction?: boolean };
  /** Wooden house: trade up to stone. A builder razes it and raises the replacement in its place. */
  upgrade?: { to: string; cost: string };
  /** Ranch: herd management — limit slider, cull, and split/transfer to another pen. */
  ranch?: {
    animals: number;
    capacity: number;
    max: number;
    canSplit: boolean;
    canTransfer: boolean;
    targets: { id: number; label: string }[];
  };
  /**
   * Town Hall: the books and the rules. Both live here rather than in the HUD on purpose — they
   * are what this building is *for*, so they arrive when it is built and are found by tapping it.
   */
  townhall?: {
    /** One row per resource the village holds, as the books recorded it last season. */
    ledger: { kind: ResourceKind; stock: number; inn: number; out: number; net: number; seasonsLeft: number | null }[];
    /** Every standing rule, whether it is enacted, and whether a clerk is actually keeping it. */
    policies: { id: PolicyId; label: string; emoji: string; gain: string; cost: string; enacted: boolean; active: boolean }[];
    /** Clerks at their desks, and how many rules that allows. */
    capacity: number;
    /** Whether a festival could be held right now (a clerk free, and the food for it). */
    canFestival: boolean;
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
  /** Move a whole profession's wanted count by one, spread across whatever buildings it has. */
  onSetTradeWorkers: (type: BuildingType, delta: number) => void;
  /** Mark this building for demolition, or take the mark back off. */
  onDemolishBuilding: (buildingId: number, on: boolean) => void;
  /** Trade a wooden house up to a stone one: raze in place, then rebuild. */
  onUpgradeBuilding: (buildingId: number) => void;
  /** Rename a workplace. An empty or blank name restores the automatic default. */
  onRenameBuilding: (buildingId: number, name: string) => void;
  /** Enact a standing rule, or repeal one already in force. */
  onTogglePolicy: (id: PolicyId) => void;
  /** Hold a festival, at the Town Hall's expense. */
  onFestival: () => void;
  onSetBuilders: (delta: number) => void;
  /** Nudge a resource's stockpile cap by one step (see `LIMIT_STEP`); a cap of 0 means none. */
  onSetLimit: (key: LimitKey, delta: number) => void;
  onSetMineOutput: (buildingId: number, output: MineOutput) => void;
  onSetSmithRecipe: (buildingId: number, recipe: SmithRecipe) => void;
  onSetTailorRecipe: (buildingId: number, recipe: TailorRecipe) => void;
  onSetLuxuryRecipe: (buildingId: number, recipe: LuxuryRecipe) => void;
  onSetForesterReplant: (buildingId: number, on: boolean) => void;
  /** Switch a workplace on or off. Off frees its workers to labour and stops production. */
  onSetBuildingEnabled: (buildingId: number, on: boolean) => void;
  onSetCrop: (buildingId: number, crop: Crop) => void;
  onSetAnimal: (buildingId: number, animal: RanchAnimal) => void;
  onSizeChange: (dim: 'w' | 'h', delta: number) => void;
  /** Turn the building being placed a quarter turn clockwise. */
  onRotateBuild: () => void;
  /** Build the pending building where the ghost is standing. */
  onPlaceBuild: () => void;
  onSetRanchMax: (buildingId: number, delta: number) => void;
  /** Set a ranch's herd limit to an exact figure — what the limit slider commits on release. */
  onSetRanchMaxTo: (buildingId: number, value: number) => void;
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
  /** Turn the harvest tool on with the kind of harvest to mark, or null to turn it off. */
  onSelectHarvest: (kind: HarvestKind | null) => void;
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

/** Pips in a health/happiness meter. Five of them across 0-100 is one per 20 points. */
const PIPS = 5;

export class UI {
  private el = {
    ages: byId('stat-ages'),
    health: byId('stat-health'),
    happy: byId('stat-happy'),
    sick: byId('stat-sick'),
    resources: byId('stat-resources'),
    policies: byId('hud-policies'),
    season: byId('stat-season'),
    tier: byId('stat-tier'),
    pause: byId('btn-pause'),
    speed: byId('btn-speed'),
    villageBtn: byId('btn-village'),
    menuBtn: byId('btn-menu'),
    rotLeft: byId('btn-rot-left'),
    rotRight: byId('btn-rot-right'),
    log: byId('log'),
    hint: byId('hint'),
    confirm: byId('confirm'),
    tools: byId('tools'),
    popout: byId('popout'),
    inspect: byId('inspect'),
    overlay: byId('overlay'),
    // The one menu. History and Progress are tabs inside it, reached from its own tab row — they
    // have no buttons of their own in the right column any more.
    village: byId('village'),
    trade: byId('trade-overlay'),
    nomad: byId('nomad'),
  };
  private resChips = new Map<ResourceKind, HTMLElement>();
  private mode: 'inspect' | 'build' | 'path' | 'demolish' | 'harvest' = 'inspect';
  private selectedBuild: BuildingType | null = null;
  private selectedPath: PathTier | null = null;
  /** Which harvest the drag marks. Sticky, so the tool reopens on whatever was last used. */
  private harvestKind: HarvestKind = 'all';
  private openCategory: BuildCategory | 'paths' | 'harvest' | null = null;
  /** The village's tier as of the last HUD refresh — what the build menus grey themselves against. */
  private tier: VillageTier = 'settlement';
  /** The latest state seen by `updateHud`, kept so a tapped lock can read the live tier requirements. */
  private lastState: GameState | null = null;
  private villagePanelOpen = false;
  private villageSig = '';
  /** Which tab of the one village menu is showing. Remembered across openings. */
  private villageTab: VillageTab = 'jobs';
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
    this.el.villageBtn.addEventListener('click', () => this.toggleVillagePanel());
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
  private chip(kind: ResourceKind): HTMLElement {
    const chip = document.createElement('div');
    chip.className = 'stat mini';
    // The ▲ only shows while the chip is `full` (see `.stat .cap`); the ▼ while it is low.
    chip.innerHTML = `<span class="ico">${RESOURCE_ICON[kind]}</span><span class="val">0</span><span class="cap">▲</span><span class="dn">▼</span>`;
    this.resChips.set(kind, chip);
    return chip;
  }
  private buildResourceChips(): void {
    const row = this.el.resources;
    // Food total, then the fixed set of headline resources — always on the HUD, nothing hidden
    // behind a toggle (see `HUD_CORE`).
    const food = document.createElement('div');
    food.className = 'stat mini';
    food.innerHTML = `<span class="ico">${FOOD_ICON}</span><span class="val">0</span><span class="cap">▲</span><span class="dn">▼</span>`;
    row.appendChild(food);
    this.foodChip = food;
    for (const kind of HUD_CORE) row.appendChild(this.chip(kind));
  }

  /**
   * Draw a 0-100 average as five pips, one lit per 20 points.
   *
   * A bare "62" said nothing without knowing the scale it was out of; five hearts read at a
   * glance and, more to the point, read *peripherally* — a pip going dark is visible without
   * looking straight at the number. The rounded figure stays on the title for anyone who wants
   * it, and DOM is only rewritten when the count changes so this can run every frame.
   */
  private setPips(el: HTMLElement, value: number, glyph: string, label: string): void {
    const lit = Math.max(0, Math.min(PIPS, Math.floor(value / (100 / PIPS))));
    const pips = el.querySelector('.pips')!;
    if (pips.childElementCount !== PIPS) {
      pips.innerHTML = `<span class="pip">${glyph}</span>`.repeat(PIPS);
    }
    for (let i = 0; i < PIPS; i++) {
      (pips.children[i] as HTMLElement).classList.toggle('off', i >= lit);
    }
    el.title = `${label}: ${Math.round(value)}%`;
    el.classList.toggle('low', lit <= 1);
  }

  /**
   * Flag a chip whose stock has reached the limit set on it. A cap is the one "problem" in the
   * HUD that is not a problem — the village has all it asked for — so it reads green with a ▲
   * rather than red, and it is worth showing at all because it is *also* the reason a hut full
   * of workers has stopped producing. Without it the only way to tell a capped trade from an
   * idle one was to open the stockpile panel and compare the numbers by hand.
   */
  private markLimit(chip: HTMLElement, s: GameState, key: LimitKey, base: string): void {
    const full = atLimit(s, key);
    chip.classList.toggle('full', full);
    chip.title = full ? `${base} — at your limit of ${s.limits?.[key]}; its trades have paused` : base;
  }

  /**
   * Red with a ▼ when the barns are running low on this, the mirror of `markLimit`'s green ▲.
   *
   * Counts only free barn stock, which is why the number beside it can look healthy while the chip
   * is red: firewood and clothing already carried into people's larders are that household's
   * winter, not stock the village can spend. The tooltip says which is which so the two numbers
   * never look like a bug.
   */
  private markLow(chip: HTMLElement, s: GameState, key: LimitKey): void {
    const low = isLowStock(s, key);
    chip.classList.toggle('low', low);
    if (low) chip.title = `${chip.title} — barns hold ${Math.floor(limitStock(s, key))}, running low`;
  }

  updateHud(s: GameState, speed: number, paused: boolean): void {
    this.lastState = s;
    this.updatePolicyStrip(s);
    // How far along the village is, which decides what the build menus offer. Re-rendered rather
    // than left stale: crossing a tier should ungrey the buildings it opened there and then, and
    // slipping back below one should grey them again.
    const tier = villageTier(s);
    if (tier !== this.tier) {
      this.tier = tier;
      // Slipping back below a tier takes the tool out of your hand too, not just the button off
      // the menu — otherwise the reticle keeps placing a building the village can no longer raise.
      if (this.selectedBuild && !tierReaches(tier, BUILDING_TIER[this.selectedBuild])) {
        this.selectedBuild = null;
        this.cb.onSelectBuild(null);
      }
      if (this.selectedPath && !tierReaches(tier, PATH_TIER_AT[this.selectedPath])) {
        this.selectedPath = null;
        this.cb.onSelectPath(null);
      }
      if (this.openCategory) this.renderPopout();
      this.refreshToolbar();
    }
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
    this.setPips(this.el.health, avgHealth(s), '❤️', 'Average health');
    this.setPips(this.el.happy, avgHappiness(s), '😊', 'Average happiness');
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
    this.markLimit(this.foodChip, s, 'food', 'Total food (all types), including household larders');
    this.markLow(this.foodChip, s, 'food');
    // Every resource chip reads the same way. Firewood and clothing live in larders too, and are
    // consumed from there first, so their warnings have to count them for the same reason.
    for (const kind of HUD_CORE) {
      const chip = this.resChips.get(kind)!;
      let v = (totals[kind] ?? 0) + totalInLarders(s, kind);
      // The top bar shows one tool figure, not two: iron and steel tools are separate goods in the
      // barn (and on a villager's belt), but a glance at the HUD only wants "have we got tools".
      if (kind === 'tools') v += (totals['steeltools'] ?? 0) + totalInLarders(s, 'steeltools');
      chip.querySelector('.val')!.textContent = `${Math.floor(v)}`;
      this.markLimit(chip, s, kind, LIMIT_META[kind].label);
      this.markLow(chip, s, kind);
    }
    this.el.season.querySelector('.val')!.textContent = `${seasonLabel(s)} · Yr ${s.year}`;
    this.el.tier.querySelector('.val')!.textContent = `${TIER_META[tier].emoji} ${TIER_META[tier].name}`;
    this.el.pause.textContent = paused ? '▶' : '⏸';
    this.el.speed.textContent = `${speed}×`;
  }

  // ---- Toolbar / categorized build menu ----
  private buildToolbar(): void {
    const tb = this.el.tools;
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
    for (const child of Array.from(this.el.tools.children)) {
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
    if (this.mode === 'harvest') this.cb.onSelectHarvest(null);
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
      const kinds = [
        ['dirt', '🟤', 'Dirt Path', 'free'],
        ['stone', '⬜', 'Stone Path', '🪨1/tile'],
        ['bridge', '🌉', 'Timber Bridge', '🪵3/tile'],
        ['stonebridge', '🏛️', 'Stone Bridge', '🪵2 🪨4/tile'],
        ['tunnel', '⛰️', 'Tunnel', '🪵6 🪨4/tile'],
      ] as [PathTier, string, string, string][];
      // Once a kind of road is picked the row narrows to just it — the rest are only clutter over
      // the map you are drawing on until it is unpicked. Tapping it again brings the row back.
      const shown = this.selectedPath ? kinds.filter(([t]) => t === this.selectedPath) : kinds;
      for (const [tier, emoji, label, cost] of shown) {
        const locked = this.tier && !tierReaches(this.tier, PATH_TIER_AT[tier])
          ? PATH_TIER_AT[tier]
          : undefined;
        po.appendChild(
          this.buildBtn(emoji, label, cost, tier === this.selectedPath, () => this.selectPath(tier), locked),
        );
      }
    } else if (this.openCategory === 'harvest') {
      for (const kind of HARVEST_KINDS) {
        const meta = HARVEST_KIND_META[kind];
        // No sub-line: "Trees" says what it marks, and the hint under the pop-out already spells
        // out what the drag will leave behind.
        po.appendChild(
          this.buildBtn(meta.emoji, meta.label, '', kind === this.harvestKind, () =>
            this.selectHarvestKind(kind),
          ),
        );
      }
    } else {
      let types = BUILD_ORDER.filter((t) => BUILDING_DEFS[t].category === this.openCategory);
      // Once a building is picked, the pop-out narrows to just it. The row of alternatives has
      // done its job — the choice is made — and leaving it up only crowds the map while the player
      // sites the ghost. Tapping the lone button again deselects and brings the whole row back;
      // placing the building closes the menu outright (see `clearSelection`, called on placement).
      if (this.selectedBuild && BUILDING_DEFS[this.selectedBuild].category === this.openCategory) {
        types = [this.selectedBuild];
      }
      for (const type of types) {
        const def = BUILDING_DEFS[type];
        const cost = (Object.entries(def.cost) as [ResourceKind, number][])
          .map(([k, a]) => `${RESOURCE_ICON[k]}${a}`)
          .join(' ');
        const locked = this.tier && !tierReaches(this.tier, BUILDING_TIER[type])
          ? BUILDING_TIER[type]
          : undefined;
        po.appendChild(
          this.buildBtn(
            def.emoji, def.name, cost, type === this.selectedBuild,
            () => this.selectBuild(type), locked,
          ),
        );
      }
    }
    po.classList.remove('hidden');
    // The pop-out wraps, so its height depends on the category and the screen. Publish it so the
    // hint bar, event log and confirm bar lift clear of however many rows it turned out to be.
    document.documentElement.style.setProperty('--popout-h', `${po.offsetHeight}px`);
    this.raiseHints(true);
  }

  /**
   * A pop-out choice. `cost` is optional: some choices cost nothing and have nothing to say.
   *
   * `lockedAt` is the tier a building is still waiting on. On the button it shows as the tier's
   * name in place of the cost — what a market costs is beside the point when the village cannot
   * build one. Tapping the locked button spells out *what the village still lacks* to reach that
   * tier (see `lockedHint`), the room to explain it that the chip itself does not have.
   */
  private buildBtn(
    emoji: string,
    name: string,
    cost: string,
    selected: boolean,
    fn: () => void,
    lockedAt?: VillageTier,
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'build-btn' + (selected ? ' selected' : '') + (lockedAt ? ' locked' : '');
    btn.innerHTML =
      `<span class="emoji">${emoji}</span><span class="name">${name}</span>` +
      (lockedAt
        ? `<span class="cost lock">🔒 ${TIER_META[lockedAt].name}</span>`
        : cost
          ? `<span class="cost">${cost}</span>`
          : '');
    if (lockedAt) {
      btn.disabled = true;
      // Still worth a tap: a disabled button that does nothing at all reads as broken, and this is
      // where the player learns *why* it is locked and what would open it.
      btn.addEventListener('click', () => this.flashHint(this.lockedHint(name, lockedAt)));
    } else {
      btn.addEventListener('click', fn);
    }
    return btn;
  }

  /**
   * Why a building is still locked, and what would open it: the requirements the village has yet to
   * meet on its way up to `target`, in plain words.
   *
   * Tiers accumulate — you cannot skip a rung — so this walks every tier from the one above the
   * village's current standing up to the target and gathers the checks that are not yet met, with
   * the village's own numbers against them ("Villagers 32 / 50"). Duplicated labels are dropped so
   * the nearest population gate is named once rather than repeated at every tier that wants more,
   * and the list is trimmed to a handful so it fits the hint bar.
   */
  private lockedHint(name: string, target: VillageTier): string {
    const s = this.lastState;
    const targetName = TIER_META[target].name;
    if (!s) return `${name} unlocks at ${targetName}`;
    const now = villageTier(s);
    const seen = new Set<string>();
    const unmet: string[] = [];
    for (const t of TIERS) {
      if (!tierReaches(target, t) || tierReaches(now, t)) continue; // only unmet tiers up to target
      for (const c of tierChecks(s, t)) {
        if (c.met || seen.has(c.label)) continue;
        seen.add(c.label);
        unmet.push(c.detail ? `${c.label} ${c.detail}` : c.label);
      }
    }
    if (unmet.length === 0) return `${name} unlocks at ${targetName}`;
    const shown = unmet.slice(0, 3).join(', ') + (unmet.length > 3 ? '…' : '');
    return `${name} needs ${targetName}: ${shown}`;
  }

  private setInspect(): void {
    this.mode = 'inspect';
    this.selectedBuild = null;
    this.selectedPath = null;
    this.openCategory = null;
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(null);
    this.cb.onSetDemolish(false);
    this.cb.onSelectHarvest(null);
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
    this.cb.onSelectHarvest(null);
    this.cb.onSetDemolish(true);
    this.cb.onCloseInspect();
    this.renderPopout();
    this.refreshToolbar();
    this.showHint('Tap a building or path to select it, then confirm. 25% of materials are refunded.');
  }

  /**
   * Turn the harvest tool on, with the kind of harvest last chosen, and open the picker so it can
   * be changed. One tap still marks everything — the choice is there for when it matters, not in
   * the way of the common case.
   */
  private setHarvest(): void {
    const activating = this.mode !== 'harvest';
    this.mode = activating ? 'harvest' : 'inspect';
    this.selectedBuild = null;
    this.selectedPath = null;
    this.openCategory = activating ? 'harvest' : null;
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(null);
    this.cb.onSetDemolish(false);
    this.cb.onSelectHarvest(activating ? this.harvestKind : null);
    this.cb.onCloseInspect();
    this.renderPopout();
    this.refreshToolbar();
    if (activating) this.harvestHint();
    else this.hideHint();
  }

  private selectHarvestKind(kind: HarvestKind): void {
    this.harvestKind = kind;
    this.mode = 'harvest';
    this.openCategory = 'harvest';
    this.cb.onSelectHarvest(kind);
    this.renderPopout();
    this.refreshToolbar();
    this.harvestHint();
  }

  private harvestHint(): void {
    // Unmark is the one kind that does not *mark* anything, so it gets its own sentence rather
    // than being fed through a template that starts "Drag a square to mark".
    const hint = HARVEST_KIND_META[this.harvestKind].hint;
    this.showHint(
      this.harvestKind === 'clear'
        ? 'Drag a square to call off the orders inside it; pan with two fingers.'
        : `Drag a square to mark ${hint}; pan with two fingers.`,
    );
  }

  private selectBuild(type: BuildingType): void {
    this.mode = 'build';
    this.selectedBuild = this.selectedBuild === type ? null : type;
    this.selectedPath = null;
    this.cb.onSetDemolish(false);
    this.cb.onSelectHarvest(null);
    this.cb.onSelectPath(null);
    this.cb.onSelectBuild(this.selectedBuild);
    if (!this.selectedBuild) this.mode = 'inspect';
    this.cb.onCloseInspect();
    this.renderPopout();
    this.refreshToolbar();
    // No description here. It used to print the building's blurb in the hint bar, which sits
    // exactly where the Build and Rotate buttons appear — four lines of text with the controls
    // stamped over the middle of it, on the one screen where the player needs to see both. What
    // each building is for now lives in the Codex on the title screen, read before you build
    // rather than over the top of the thing you are building.
    this.hideHint();
  }

  private selectPath(tier: PathTier): void {
    this.mode = 'path';
    this.selectedPath = this.selectedPath === tier ? null : tier;
    this.selectedBuild = null;
    this.cb.onSetDemolish(false);
    this.cb.onSelectHarvest(null);
    this.cb.onSelectBuild(null);
    this.cb.onSelectPath(this.selectedPath);
    if (!this.selectedPath) this.mode = 'inspect';
    this.cb.onCloseInspect();
    this.renderPopout();
    this.refreshToolbar();
    if (this.selectedPath) {
      const hint =
        tier === 'bridge'
          ? 'Drag over water to plan a timber bridge. Quick and cheap — but it can burn.'
          : tier === 'stonebridge'
            ? 'Masonry over water: as fast as a stone road, and it cannot burn. Lay it over a timber bridge to upgrade.'
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

    // Runs of `grid` rows are wrapped in one `.inv-grid` so they lay out two-up; everything else is
    // a full-width line. Each cell is still an `.inv-row`, so nothing that reads the sheet by row
    // has to know about the packing.
    const rowHtml = (r: InspectRow): string =>
      `<div class="inv-row${r.tone ? ` tone-${r.tone}` : ''}"><span>${r.label}</span><span>${r.value}</span></div>`;
    let body = '';
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].grid) {
        let j = i;
        while (j < rows.length && rows[j].grid) j++;
        body += `<div class="inv-grid">${rows.slice(i, j).map(rowHtml).join('')}</div>`;
        i = j - 1;
      } else {
        body += rowHtml(rows[i]);
      }
    }
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
    if (controls?.enable) {
      // On/off is deliberately its own line, worded as the state and the action: a disabled
      // workplace reads "Disabled" and offers to switch it on, so the player can tell it apart from
      // one that is simply short of hands.
      const on = controls.enable.on;
      ctrlHtml += `<div class="inv-ctrl"><span>${on ? 'Working' : '⏸ Disabled'}</span>
        <button class="ranch-btn${on ? '' : ' danger'}" id="insp-enable">${on ? '⏸ Disable' : '▶ Enable'}</button></div>`;
    }
    if (controls?.toggle) {
      const opts = controls.toggle.options
        .map((o) => `<button data-v="${o.v}" class="${o.on ? 'on' : ''}">${o.label}</button>`)
        .join('');
      ctrlHtml += `<div class="inv-ctrl"><div class="jr-toggle">${opts}</div></div>`;
    }
    if (controls?.tradingPost) {
      const { merchantDocked: docked, port, landlocked } = controls.tradingPost;
      const label = docked
        ? port ? '🤝 Trade with the fleet' : '🤝 Trade with merchant'
        : port ? '⚓ Manage harbour' : '📦 Manage trading post';
      ctrlHtml += `<div class="inv-ctrl"><button class="tp-open${docked ? ' docked' : ''}" id="insp-tp">${label}</button></div>`;
      // Built on water that has no channel out to the sea — no boat can ever sail here, so no
      // merchant will call. Flagged loudly so the player rebuilds on the river or an edge lake.
      if (landlocked) {
        ctrlHtml += `<div class="inv-error">⚠ No route to open water — this ${port ? 'harbour' : 'trading post'} is on a landlocked lake, so no ${port ? 'fleet' : 'merchant'} can reach it. Rebuild on the river or a lake that meets the map edge.</div>`;
      }
    }
    if (controls?.ranch) {
      const r = controls.ranch;
      // Herd-limit slider: all the way right pens the animal to the plot's full capacity; drag it
      // left and the pen keeps fewer head — anything already penned above the new limit the rancher
      // culls for meat and hide, one at a time. The label reads out the live thumb value (and how
      // many head that leaves for the knife) as it is dragged; the value is only committed on
      // release, so the sheet's 100 ms rebuild never fights the drag. See `rmaxLabel`.
      ctrlHtml += `<div class="inv-ctrl ranch-limit"><span>Herd limit</span>
          <span class="ranch-avail" id="insp-rmax-label">${rmaxLabel(r.max, r.capacity, r.animals)}</span></div>
        <div class="inv-ctrl"><input type="range" class="ranch-slider" id="insp-rmax"
          min="0" max="${r.capacity}" step="1" value="${r.max}" /></div>
        <div class="inv-ctrl ranch-actions">
          <button class="ranch-btn danger" id="insp-cull"${r.animals > 0 ? '' : ' disabled'}>🔪 Cull all</button>
          <button class="ranch-btn" id="insp-split"${r.canSplit ? '' : ' disabled'}>Split herd</button>
          <button class="ranch-btn" id="insp-transfer"${r.canTransfer ? '' : ' disabled'}>Transfer all</button>
        </div>`;
    }
    if (controls?.townhall) {
      const t = controls.townhall;
      // The books. One row a resource: what is held, what last season brought in and took out,
      // and how long the store lasts at that rate. Measured, never modelled — see `ledgerFor`.
      const num = (n: number) => (Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
      const rows = t.ledger
        .map((r) => {
          const cls = r.net > 0.05 ? 'up' : r.net < -0.05 ? 'down' : '';
          const left =
            r.seasonsLeft === null
              ? ''
              : `<span class="th-left${r.seasonsLeft <= 4 ? ' warn' : ''}">${Math.floor(r.seasonsLeft)} left</span>`;
          return (
            `<div class="th-row"><span class="th-kind">${RESOURCE_ICON[r.kind]}</span>` +
            `<span class="th-held">${num(r.stock)}</span>` +
            `<span class="th-flow">+${num(r.inn)} / −${num(r.out)}</span>` +
            `<span class="th-net ${cls}">${r.net >= 0 ? '+' : ''}${num(r.net)}</span>${left}</div>`
          );
        })
        .join('');
      ctrlHtml +=
        `<div class="th-sec">Last season's books</div>` +
        (rows ? `<div class="th-ledger">${rows}</div>` : `<p class="th-none">The clerks have not closed a season yet.</p>`);

      // The rules. Every one shows what it gives and what it costs, because that is the decision.
      const pol = t.policies
        .map((p) => {
          const state = p.active ? ' on' : p.enacted ? ' lapsed' : '';
          const note = p.enacted && !p.active ? '<span class="th-lapsed">No clerk — lapsed</span>' : '';
          return (
            `<button class="th-policy${state}" data-policy="${p.id}">` +
            `<span class="th-pname">${p.emoji} ${p.label}</span>` +
            `<span class="th-pgain">${p.gain}</span>` +
            `<span class="th-pcost">${p.cost}</span>${note}</button>`
          );
        })
        .join('');
      ctrlHtml +=
        `<div class="th-sec">Policies <small>${t.policies.filter((p) => p.active).length}/${t.capacity} clerks</small></div>` +
        `<div class="th-policies">${pol}</div>` +
        `<div class="inv-ctrl"><button class="ranch-btn" id="insp-festival"${t.canFestival ? '' : ' disabled'}>🎉 Hold a festival</button></div>`;
    }
    if (controls?.upgrade) {
      const u = controls.upgrade;
      ctrlHtml += `<div class="inv-ctrl"><button class="ranch-btn" id="insp-upgrade">⬆️ Upgrade to ${u.to} <small>${u.cost}</small></button></div>`;
    }
    if (controls?.demolish) {
      const d = controls.demolish;
      // Once the walls are coming down there is nothing to cancel — the button says so rather
      // than offering an undo that would leave a half-dismantled building standing.
      const label = d.construction
        ? '✖️ Cancel construction'
        : d.underway
          ? '🧱 Being pulled down'
          : d.marked
            ? '✖️ Cancel demolition'
            : d.blocked
              ? '🛖 Last barn — cannot demolish'
              : '💥 Demolish';
      const cls = d.marked && !d.underway ? 'ranch-btn' : 'ranch-btn danger';
      const dis = d.blocked || d.underway ? ' disabled' : '';
      ctrlHtml += `<div class="inv-ctrl"><button class="${cls}" id="insp-demolish"${dis}>${label}</button></div>`;
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
      this.el.inspect
        .querySelector('#insp-enable')
        ?.addEventListener('click', () => this.cb.onSetBuildingEnabled(id, controls.enable?.on === false));
      this.el.inspect.querySelector('#insp-tp')?.addEventListener('click', () => this.openTradingPost(id));
      this.el.inspect
        .querySelector('#insp-demolish')
        ?.addEventListener('click', () => this.cb.onDemolishBuilding(id, !controls.demolish?.marked));
      this.el.inspect
        .querySelector('#insp-upgrade')
        ?.addEventListener('click', () => this.cb.onUpgradeBuilding(id));
      if (controls.ranch) {
        const rc = controls.ranch;
        const slider = this.el.inspect.querySelector('#insp-rmax') as HTMLInputElement | null;
        const label = this.el.inspect.querySelector('#insp-rmax-label') as HTMLElement | null;
        if (slider) {
          // Live read-out while dragging, without committing: the value is set on release (`change`),
          // so the sheet's periodic rebuild — keyed on the *committed* limit — leaves the thumb alone
          // mid-drag. Updating the label directly (not through a rebuild) keeps the drag smooth.
          slider.addEventListener('input', () => {
            if (label) label.textContent = rmaxLabel(Number(slider.value), rc.capacity, rc.animals);
          });
          slider.addEventListener('change', () => this.cb.onSetRanchMaxTo(id, Number(slider.value)));
        }
        this.el.inspect.querySelector('#insp-cull')?.addEventListener('click', () => this.cb.onCullRanch(id));
        this.el.inspect.querySelector('#insp-split')?.addEventListener('click', () => this.openRanchPicker(id, 'split', rc.targets));
        this.el.inspect.querySelector('#insp-transfer')?.addEventListener('click', () => this.openRanchPicker(id, 'transfer', rc.targets));
      }
      if (controls.townhall) {
        this.el.inspect.querySelectorAll('[data-policy]').forEach((btn) =>
          btn.addEventListener('click', () =>
            this.cb.onTogglePolicy((btn as HTMLElement).dataset.policy as PolicyId),
          ),
        );
        this.el.inspect.querySelector('#insp-festival')?.addEventListener('click', () => this.cb.onFestival());
      }
      const tog = controls.toggle;
      if (tog) {
        this.el.inspect.querySelectorAll('.jr-toggle button').forEach((btn) =>
          btn.addEventListener('click', () => {
            const v = (btn as HTMLElement).dataset.v!;
            if (tog.group === 'mine') this.cb.onSetMineOutput(id, v as MineOutput);
            else if (tog.group === 'smith') this.cb.onSetSmithRecipe(id, v as SmithRecipe);
            else if (tog.group === 'tailor') this.cb.onSetTailorRecipe(id, v as TailorRecipe);
            else if (tog.group === 'luxury') this.cb.onSetLuxuryRecipe(id, v as LuxuryRecipe);
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

  // ---- Village menu: jobs, limits, history and progress, one panel of tabs ----
  /**
   * One menu, four tabs. Jobs and limits are the two halves of the same decision — how many hands
   * on a trade, and how much of what it makes to keep — and history and progress are the two things
   * you read rather than set. The 📋 button opens the menu, always on Jobs; the other three tabs
   * are reached from the tab row inside it.
   */
  private toggleVillagePanel(): void {
    if (this.villagePanelOpen) {
      this.villagePanelOpen = false;
      this.el.village.classList.add('hidden');
      return;
    }
    // Always open on Jobs, whatever tab was left showing last time. It is the tab you come to the
    // menu to use; History and Progress are things you go looking for, one tab away.
    this.villageTab = 'jobs';
    this.villagePanelOpen = true;
    this.el.village.classList.remove('hidden');
    this.villageSig = '';
  }

  /**
   * The village chronicle: every logged event, newest first, grouped under the season it happened
   * in. Toasts vanish after five seconds, so this is where the player goes to find out what
   * actually happened while they were looking elsewhere. Rendered into the menu's scrolling body.
   */
  private buildHistoryBody(body: HTMLElement, s: GameState): void {
    const events = s.events ?? [];
    const sum = document.createElement('div');
    sum.className = 'summary';
    sum.textContent = events.length
      ? `${events.length} event${events.length > 1 ? 's' : ''} · newest first`
      : 'Nothing has happened yet.';
    body.appendChild(sum);

    let lastStamp = '';
    for (const e of events) {
      const stamp = `${SEASONS[e.season]} · Yr ${e.year}`;
      if (stamp !== lastStamp) {
        lastStamp = stamp;
        const sep = document.createElement('div');
        sep.className = 'hist-season';
        sep.textContent = stamp;
        body.appendChild(sep);
      }
      const row = document.createElement('div');
      row.className = `hist-row ${e.kind === 'good' ? 'good' : e.kind === 'bad' ? 'bad' : ''}`;
      row.textContent = e.text;
      body.appendChild(row);
    }
  }

  /**
   * The strip of rules in force, across the top of the HUD.
   *
   * Only the ones a clerk is actually keeping: a rule the player enacted but that has lapsed for
   * want of staff is not in force, and showing it here would be a lie the player acts on. The row
   * takes no space at all when nothing is enacted, which is most villages most of the time.
   */
  private policySig = '';
  private updatePolicyStrip(s: GameState): void {
    const active = activePolicies(s);
    const sig = active.join(',');
    if (sig === this.policySig) return;
    this.policySig = sig;
    const el = this.el.policies;
    if (!el) return;
    el.classList.toggle('hidden', active.length === 0);
    el.innerHTML = active
      .map(
        (id) =>
          `<div class="stat policy" title="${POLICY_META[id].label}: ${POLICY_META[id].gain}; ${POLICY_META[id].cost}">` +
          `<span class="ico">${POLICY_META[id].emoji}</span><span class="val">${POLICY_META[id].label}</span></div>`,
      )
      .join('');
  }

  refreshPanels(s: GameState): void {
    if (this.villagePanelOpen) this.refreshVillagePanel(s);
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
    // What is wrong with them — sickness or anything else — is not advertised. Taking strangers in
    // is a gamble; the player decides on the offer itself, not on a health inspection at the gate.
    this.el.nomad.innerHTML = `
      <div class="nomad-card">
        <h2>Nomads at the gate</h2>
        <p class="big">🧳</p>
        <p>A band of <strong>${offer.count}</strong> wandering adults asks to settle in your village. They will need food and housing like everyone else.</p>
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
   * The one village menu: four tabs — Jobs and Limits to set, History and Progress to read — over a
   * frozen header. The header and the tab row stay put while the body scrolls, so the tabs are
   * always within reach however long the history or the trade list runs.
   *
   * Jobs and limits are cut back to the number that matters: a trade says `2/4` and a stockpile row
   * says its limit and nothing else.
   */
  private refreshVillagePanel(s: GameState): void {
    const trades = BUILD_ORDER.filter((t) => BUILDING_DEFS[t].jobs > 0);
    const buildersWorking = s.citizens.reduce((n, c) => n + (c.builder ? 1 : 0), 0);
    // Free laborers are unemployed *adults* only — children have no job but can't be assigned.
    const laborers = s.citizens.reduce((n, c) => n + (isAdult(c) && c.jobId === null && !c.builder ? 1 : 0), 0);
    // The signature carries the active tab and only the data that tab shows, so switching tabs
    // rebuilds and a change under the open tab rebuilds, but a change under a hidden one does not.
    const now = villageTier(s);
    const tabSig =
      this.villageTab === 'jobs'
        ? trades.map((t) => `${tradeWorking(s, t)}:${tradeStaff(s, t)}:${tradeCapacity(s, t)}:${tradePosts(s, t).length}`).join('|') +
          `#${buildersWorking},${laborers},${s.desiredBuilders}`
        : this.villageTab === 'limits'
          ? LIMITABLE.map((k) => s.limits?.[k] ?? 0).join(',')
          : this.villageTab === 'history'
            ? `${(s.events ?? []).length}|${s.events?.[0]?.text ?? ''}`
            : now + TIERS.map((t) => tierChecks(s, t).map((c) => `${c.label}${c.detail}${c.met ? 1 : 0}`).join(',')).join('|');
    const sig = `${this.villageTab}#${laborers}#${tabSig}`;
    if (sig === this.villageSig) return;
    this.villageSig = sig;

    const p = this.el.village;
    p.innerHTML = '';

    // No title line: the tab row *is* the top of the panel now, with the close × riding on its
    // right. Four tabs, read at different moments: staff a trade, move a cap, read what happened,
    // or see what the village is working toward. This row stays frozen; only the body below scrolls
    // (see `.panel-body` in the stylesheet).
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    for (const [key, label] of [['jobs', 'Jobs'], ['limits', 'Limits'], ['history', 'History'], ['progress', 'Progress']] as const) {
      const b = document.createElement('button');
      b.className = 'tab' + (this.villageTab === key ? ' on' : '');
      b.textContent = label;
      b.dataset.tab = key;
      b.addEventListener('click', () => {
        this.villageTab = key;
        this.villageSig = '';
        this.refreshVillagePanel(s);
      });
      tabs.appendChild(b);
    }
    const close = document.createElement('button');
    close.className = 'close tab-close';
    close.id = 'vp-close';
    close.textContent = '×';
    close.addEventListener('click', () => this.toggleVillagePanel());
    tabs.appendChild(close);
    p.appendChild(tabs);

    const body = document.createElement('div');
    body.className = 'panel-body';
    p.appendChild(body);

    if (this.villageTab === 'jobs') this.buildJobsBody(body, s, trades, buildersWorking, laborers);
    else if (this.villageTab === 'limits') this.buildLimitsBody(body, s);
    else if (this.villageTab === 'history') this.buildHistoryBody(body, s);
    else this.buildProgressBody(body, s);
  }

  private buildJobsBody(body: HTMLElement, s: GameState, trades: BuildingType[], buildersWorking: number, laborers: number): void {
    // The free hands, at the head of the jobs tab — the number every row below is spent against.
    const free = document.createElement('div');
    free.className = 'hd-note jobs-free';
    free.textContent = `👷 ${laborers} free`;
    body.appendChild(free);
    // Two columns, so the whole trade list is on screen at once instead of a scroll that hides
    // half the village's work below the fold.
    const grid = document.createElement('div');
    grid.className = 'job-grid';
    body.appendChild(grid);

    // Builders — a global job (only these villagers construct work buildings). Always shown so the
    // player can staff construction even before any workplace exists.
    grid.appendChild(
      this.staffRow('🔨', 'Builders', buildersWorking, s.desiredBuilders, s.desiredBuilders, false, (d) =>
        this.cb.onSetBuilders(d),
      ),
    );
    // One row per profession, listed whether the village has one of those buildings or not: a trade
    // with nowhere to work yet is still something to decide, and set before the hut is up it opens
    // staffed. What a single building decides for itself — which seam a mine digs — is on its sheet.
    for (const type of trades) {
      const def = BUILDING_DEFS[type];
      grid.appendChild(
        this.staffRow(
          def.emoji, def.name, tradeWorking(s, type), tradeCapacity(s, type), tradeStaff(s, type),
          tradePosts(s, type).length === 0, (d) => this.cb.onSetTradeWorkers(type, d),
        ),
      );
    }
  }

  private buildLimitsBody(body: HTMLElement, s: GameState): void {
    const limGrid = document.createElement('div');
    limGrid.className = 'job-grid';
    body.appendChild(limGrid);
    // Only the resources a limit can act on (`LIMITABLE`) — a cap on something no workplace
    // produces would be a control that does nothing.
    for (const k of LIMITABLE) {
      const cap = s.limits?.[k] ?? 0;
      const meta = LIMIT_META[k];
      const row = document.createElement('div');
      row.className = 'job-row limit-row';
      row.innerHTML =
        `<span class="jr-emoji">${meta.icon}</span>` +
        `<div class="jr-main"><div class="jr-name">${meta.label}</div></div>` +
        `<div class="stepper"><button data-step="-1">−</button>` +
        `<span class="count">${cap > 0 ? cap : '—'}</span><button data-step="1">+</button></div>`;
      row.querySelector('[data-step="-1"]')!.addEventListener('click', () => this.cb.onSetLimit(k, -1));
      row.querySelector('[data-step="1"]')!.addEventListener('click', () => this.cb.onSetLimit(k, 1));
      limGrid.appendChild(row);
    }
  }

  /**
   * A staffing row: who is at the job over how many the village wants, and a stepper for the
   * number the player is asking for.
   *
   * `2/4` and nothing else. The words it replaces said the same thing twice as long, on a panel
   * where every row is the same shape and the reading is learned once.
   */
  private staffRow(
    emoji: string,
    name: string,
    working: number,
    wanted: number,
    asked: number,
    muted: boolean,
    step: (delta: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'job-row staff-row' + (muted ? ' muted' : '');
    // The name is what gives when a column is narrow, so keep the whole of it within reach.
    row.title = name;
    row.innerHTML =
      `<span class="jr-emoji">${emoji}</span>` +
      `<div class="jr-main"><div class="jr-name">${name}</div>` +
      `<div class="jr-sub">${working}/${wanted}</div></div>` +
      `<div class="stepper"><button data-step="-1">−</button>` +
      `<span class="count">${asked}</span><button data-step="1">+</button></div>`;
    row.querySelector('[data-step="-1"]')!.addEventListener('click', () => step(-1));
    row.querySelector('[data-step="1"]')!.addEventListener('click', () => step(1));
    return row;
  }

  /**
   * Progression: the five tiers, what each asks for, and what each opens.
   *
   * The build menu names only the tier a locked building waits on; this is the tab that place was
   * leaving room for. Requirements show their working — "37 / 50" rather than a bare cross — so the
   * line holding the village back is the one the player can see. Rendered into the menu's body.
   */
  private buildProgressBody(body: HTMLElement, s: GameState): void {
    const now = villageTier(s);
    for (const t of TIERS) {
      const meta = TIER_META[t];
      const reached = tierReaches(now, t);
      const block = document.createElement('div');
      block.className = 'tier-block' + (t === now ? ' current' : '') + (reached ? ' reached' : '');

      const checks = tierChecks(s, t);
      const reqs = checks.length
        ? checks
            .map(
              (c) =>
                `<div class="tier-req${c.met ? ' met' : ''}">` +
                `<span class="tick">${c.met ? '✓' : '·'}</span>` +
                `<span class="rq-name">${c.label}</span>` +
                (c.detail ? `<span class="rq-val">${c.detail}</span>` : '') +
                `</div>`,
            )
            .join('')
        : `<div class="tier-req met"><span class="tick">✓</span><span class="rq-name">Where every village starts</span></div>`;

      const opens = [
        ...buildingsAt(t).map((b) => `${BUILDING_DEFS[b].emoji} ${BUILDING_DEFS[b].name}`),
        ...pathsAt(t).map((k) => PATH_LABEL[k]),
      ];
      const unlocks = opens.length
        ? opens.map((o) => `<span class="unlock">${o}</span>`).join('')
        : `<span class="unlock none">Still to come</span>`;

      block.innerHTML =
        `<div class="tier-head"><span class="tier-emoji">${meta.emoji}</span>` +
        `<span class="tier-name">${meta.name}</span>` +
        `<span class="tier-state">${t === now ? 'You are here' : reached ? 'Reached' : ''}</span></div>` +
        `<div class="tier-reqs">${reqs}</div>` +
        `<div class="tier-unlocks">${unlocks}</div>`;
      body.appendChild(block);
    }
  }

  // ---- Trading post: inventory orders + value-matching merchant basket ----
  /** Open the trading post sheet for a building id (also the entry point debug hooks use). */
  openTradingPost(id: number): void {
    this.tradingPostId = id;
    this.resetBasket();
    this.el.trade.classList.remove('hidden');
    // The header says post or harbour; `refreshTradingPost` fills it in, since only the state
    // knows which building this id belongs to.
    this.el.trade.innerHTML = `<div class="tp-card">
        <h2 id="tp-title">🚢 Trading Post <button class="close" id="tp-close">×</button></h2>
        <div class="summary" id="tp-summary"></div>
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

  private placeWarnEl: HTMLElement | null = null;
  /**
   * The "Unreachable" tag over a placement ghost sitting where nothing can walk to it.
   *
   * A floating badge above the centre reticle — where the ghost is — rather than a hint down by
   * the toolbar, so the warning reads as belonging to the building the player is siting. Toggled
   * every frame from the render loop; the DOM is only touched when the state flips, so this is
   * cheap to call at 60Hz.
   */
  setPlaceWarn(show: boolean): void {
    if (!this.placeWarnEl) {
      if (!show) return; // nothing to hide, and don't build the node until first needed
      const el = document.createElement('div');
      el.id = 'place-warn';
      el.className = 'place-warn hidden';
      el.textContent = '⚠️ Unreachable';
      document.body.appendChild(el);
      this.placeWarnEl = el;
    }
    this.placeWarnEl.classList.toggle('hidden', !show);
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
      m.priceMod ?? 1,
      // Moorage, to the minute. Any finer and the panel would rebuild every frame a boat is in.
      Math.ceil(m.stayTimer / 60),
      s.season,
      merchantBerth(s)?.id ?? null,
      RESOURCE_KINDS.map((k) => [Math.floor(store[k] ?? 0), orders[k] ?? 0]),
      this.basketGive,
      this.basketGet,
      this.basketSeeds,
      s.seeds.length,
    ]);
    if (sig === this.tradeSig) return;
    this.tradeSig = sig;

    const isPort = post.type === 'port';
    byId('tp-title').innerHTML = isPort
      ? `⚓ Harbour <button class="close" id="tp-close">×</button>`
      : `🚢 Trading Post <button class="close" id="tp-close">×</button>`;
    byId('tp-close').addEventListener('click', () => this.closeTradingPost());
    byId('tp-summary').textContent = isPort
      ? 'Set stock orders and a carrier hauls those goods down to the quay from your barns. The deep-water fleets keep a calendar — one to a season — and settle by matching values, so offer goods worth at least the price.'
      : 'Set stock orders and a trader hauls those goods here from your barns. Trades are settled by matching values — offer goods worth at least the price.';

    // Inventory & orders: every resource with its unit value, current stock, and an order stepper.
    byId('tp-orders').innerHTML = RESOURCE_KINDS.map((k) => {
      const have = Math.floor(store[k] ?? 0);
      return `<div class="tp-row">
          <span class="tp-good">${RESOURCE_ICON[k]} ${k}</span>
          <span class="tp-val" title="Trade value per unit">◈${TRADE_VALUE[k]}</span>
          <span class="tp-have" title="${isPort ? 'On the quay now' : 'In the post now'}">${have}</span>
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

    this.renderMerchantPane(s, post);
  }

  /**
   * The tide table a harbour is worth building for.
   *
   * A Port's whole point is that its trade is *scheduled*: the grain ships come in spring, the
   * medicine ship in winter. That is only worth anything if the player can read the calendar
   * before the season turns, so an empty quay shows the year ahead rather than the shrug a
   * trading post gives — which fleet each season brings, and which one is due now.
   */
  private portCalendar(s: GameState): string {
    const now = SEASONS[s.season];
    const rows = SEASONS.map((season) => {
      const meta = MERCHANT_CATEGORY_META[PORT_SEASON_MERCHANT[season]];
      return `<div class="tp-row fleet${season === now ? ' now' : ''}">
          <span class="tp-good">${meta.emoji} ${meta.label}</span>
          <span class="tp-season">${season}${season === now ? ' · now' : ''}</span>
        </div>`;
    }).join('');
    return `<div class="tp-sub">The year's fleets</div>${rows}
      <div class="tp-wait">Each sails ${Math.round(PORT_ARRIVAL_CHANCE * 100)} times in a hundred — often enough to plan a year around, not often enough to bet the winter on.</div>`;
  }

  /** The right-hand pane: the docked merchant's goods and the value-matching basket, or a wait note. */
  private renderMerchantPane(s: GameState, post: Building): void {
    const pane = byId('tp-merchant');
    const store = post.store ?? {};
    const m = s.merchant;
    const isPort = post.type === 'port';
    // A boat is only tradeable through the building it actually tied up at. A town with both a
    // post and a harbour has two of these sheets, and only one of them has a merchant in it.
    const here = m.present && m.category !== null && merchantBerth(s)?.id === post.id;
    if (!here || !m.category) {
      const wait = isPort
        ? `<div class="tp-wait">The quay is empty. A fleet does not need the harbour staffed to call.</div>${this.portCalendar(s)}`
        : `<div class="tp-wait">No merchant docked. One may sail in at any time — the post does not need to be staffed for a boat to call.</div>`;
      pane.innerHTML = `<h3>${isPort ? 'Harbour' : 'Merchant'}</h3>${wait}`;
      return;
    }
    const meta = MERCHANT_CATEGORY_META[m.category];
    const basket = this.currentBasket();
    // The mod is the merchant's own prices, and it is applied to what they *ask*, so the panel has
    // to charge it too. Quoting the book value here and the real one at the till was a sheet that
    // said a trade was covered and a Trade button that refused it.
    const priceMod = m.priceMod ?? 1;
    const offer = offerValue(basket);
    const need = requiredValue(basket, priceMod);
    const buy = purchaseValue(basket);
    const ok = buy > 0 && offer + 1e-6 >= need;
    // How they bargain, and how long they will wait. Both only mean something for a fleet keeping
    // a calendar, but a river trader keeps prices and moorage too, so both sheets get them.
    const mins = Math.ceil(m.stayTimer / 60);
    const price =
      priceMod > 1 ? `<span class="tp-price dear">Hard bargainers · +${Math.round((priceMod - 1) * 100)}%</span>`
      : priceMod < 1 ? `<span class="tp-price keen">Keen to deal · −${Math.round((1 - priceMod) * 100)}%</span>`
      : `<span class="tp-price">Trading at book value</span>`;
    const berthed = `<div class="tp-berth">${price}<span class="tp-stay">⏳ Sails in about ${mins} min${mins === 1 ? '' : 's'}</span></div>`;

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
      : `<div class="tp-wait">Nothing ${isPort ? 'on the quay' : 'in the post'} yet — set stock orders on the left so your ${isPort ? 'carriers bring' : 'trader brings'} goods to sell.</div>`;

    pane.innerHTML = `<h3>${meta.emoji} ${meta.label}</h3>${berthed}
      <div class="tp-sub">You buy</div>${buyRows || '<div class="tp-wait">Sold out.</div>'}${seedRows}
      <div class="tp-sub">You give <small>(from ${isPort ? 'harbour' : 'post'} stock)</small></div>${giveRows}
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
    /** A game is in progress in the autosave slot — offer Continue. */
    hasAutosave: boolean;
    /** At least one manual slot holds a hard save — offer Load Game. */
    hasManualSave: boolean;
    onNew: () => void;
    onContinue: () => void;
    onLoad: () => void;
    onSettings: () => void;
    onCodex: () => void;
  }): void {
    // Continue resumes the autosave; Load opens the hard-save slots. They are independent now — a
    // fresh game that has never been hard-saved offers Continue but not Load, and vice versa.
    const cont = opts.hasAutosave ? `<button id="mm-continue">Continue</button>` : '';
    const load = opts.hasManualSave ? `<button id="mm-load">Load Game</button>` : '';
    this.overlayCard(
      `<h1>Little Village</h1><p class="big">🏡🌲🌾</p>` +
        `<div class="menu-list">` +
        `<button id="mm-new">New Game</button>` +
        cont +
        load +
        `<button class="ghost" id="mm-codex">Codex</button>` +
        `<button class="ghost" id="mm-settings">Settings</button>` +
        `<button class="ghost" id="mm-account" disabled>Sign In / Create Account — coming soon</button>` +
        `</div>` +
        // Build stamp: version, commit and build date, so it's obvious whether the device is on
        // the newest deploy or a cached service-worker copy of an older one.
        `<p class="build-stamp" id="mm-build">${BUILD_STAMP}</p>`,
      'menu-card',
    );
    byId('mm-new').addEventListener('click', () => opts.onNew());
    if (opts.hasAutosave) byId('mm-continue').addEventListener('click', () => opts.onContinue());
    if (opts.hasManualSave) byId('mm-load').addEventListener('click', () => opts.onLoad());
    byId('mm-codex').addEventListener('click', () => opts.onCodex());
    byId('mm-settings').addEventListener('click', () => opts.onSettings());
  }

  /**
   * The Codex: every building, what it is for and what it costs.
   *
   * This is where the placement blurb went. Printing it over the map put four lines of text under
   * the ghost with the Build and Rotate buttons stamped across the middle of them — unreadable
   * exactly when it mattered. A reference page is the better shape for it anyway: you can compare
   * two buildings before committing wood to either, which a hint that only ever describes the one
   * you already picked could never do.
   */
  showCodex(opts: { onBack: () => void }): void {
    const entry = (type: BuildingType): string => {
      const d = BUILDING_DEFS[type];
      const cost =
        (Object.entries(d.cost) as [ResourceKind, number][])
          .map(([k, a]) => `${RESOURCE_ICON[k]}${a}`)
          .join(' ') || 'free';
      // The facts a player weighs before spending: what it occupies, what it costs, who staffs it.
      // A field or a pen is sized by the player at placement, so quoting its smallest setting as
      // if it were the building's footprint is only a third of the truth.
      const size = SIZABLE[type]
        ? `${SIZABLE[type]!.min}×${SIZABLE[type]!.min}–${SIZABLE[type]!.max}×${SIZABLE[type]!.max}`
        : `${d.w}×${d.h}`;
      const facts = [size, cost];
      if (d.jobs > 0) facts.push(`👷${d.jobs}`);
      if (d.workRadius) {
        // The circle is not one number: it is what a single worker reaches, widening with each
        // one hired. Printing only the base under-sold every work building by half.
        const max = d.workRadius + Math.max(0, d.jobs - 1) * WORK_RADIUS_PER_WORKER;
        facts.push(`⭕${d.workRadius}${max > d.workRadius ? `–${max}` : ''}`);
      }
      return (
        `<div class="cx-row">` +
        `<div class="cx-head"><span class="cx-emoji">${d.emoji}</span>` +
        `<span class="cx-name">${d.name}</span>` +
        `<span class="cx-facts">${facts.join(' · ')}</span></div>` +
        `<p class="cx-desc">${d.desc}</p>` +
        `</div>`
      );
    };
    const groups = CATEGORY_ORDER.map((cat) => {
      const types = BUILD_ORDER.filter((t) => BUILDING_DEFS[t].category === cat);
      if (types.length === 0) return '';
      const meta = CATEGORY_META[cat];
      return `<h3 class="cx-cat">${meta.emoji} ${meta.label}</h3>${types.map(entry).join('')}`;
    }).join('');
    // The rules that are not about any one building — they used to sit as paragraphs on top of the
    // panels they governed, where they were re-read every time and pushed the controls down.
    const notes =
      `<h3 class="cx-cat cx-rules">📖 How the village works</h3>` +
      CODEX_NOTES.map(
        (n) =>
          `<div class="cx-note"><div class="cx-head"><span class="cx-emoji">${n.icon}</span>` +
          `<span class="cx-name">${n.title}</span></div><p class="cx-desc">${n.body}</p></div>`,
      ).join('');
    this.overlayCard(
      `<h2>Codex</h2>` +
        // What the shorthand on each row means, once, rather than a word per fact on 23 rows.
        `<p class="cx-legend">tiles · cost · 👷 workers · ⭕ work circle, one worker to full staff</p>` +
        `<div class="cx-list">${groups}${notes}</div>` +
        `<div class="menu-list"><button class="ghost" id="cx-back">Back</button></div>`,
      'menu-card codex-card',
    );
    byId('cx-back').addEventListener('click', () => opts.onBack());
  }

  /**
   * Everything about a new village on one screen: size, difficulty, disasters and the seed.
   *
   * This used to be two cards to click through — pick a size, then pick a difficulty — which meant
   * the settings could not be seen together and changing your mind about the first meant backing
   * out of the second. One screen also gives the seed somewhere to live, which it needs now that a
   * village is reproducible from one.
   *
   * The three toggles re-render the card; the seed field deliberately does not, because rebuilding
   * the card under a focused input would throw away the caret mid-type. Reroll writes straight to
   * the field, and Start reads whatever is in it.
   */
  showNewGameSetup(opts: {
    size: MapSize;
    difficulty: Difficulty;
    disasters: boolean;
    seed: number;
    name: string;
    slotLabel: string;
    onChange: (patch: { size?: MapSize; difficulty?: Difficulty; disasters?: boolean }) => void;
    onStart: (setup: { seed: number; name: string }) => void;
    onBack: () => void;
  }): void {
    const seg = (id: string, on: boolean, label: string, sub?: string) =>
      `<button class="seg${on ? ' on' : ''}" id="${id}">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
    const sizes = (['small', 'large'] as MapSize[])
      .map((z) => seg(`ng-size-${z}`, opts.size === z, z === 'small' ? 'Small' : 'Large'))
      .join('');
    const diffs = DIFFICULTIES.map((d) =>
      seg(`ng-diff-${d}`, opts.difficulty === d, DIFFICULTY_META[d].label),
    ).join('');
    const dis = seg('ng-dis-on', opts.disasters, 'On') + seg('ng-dis-off', !opts.disasters, 'Off');

    this.overlayCard(
      `<h2>New Village</h2>` +
        `<div class="menu-list ng-list">` +
        `<div class="set-label">Name</div>` +
        `<input id="ng-name" class="ng-name" type="text" maxlength="${SLOT_NAME_MAX}" autocomplete="off"` +
        ` value="${escapeAttr(opts.name)}" placeholder="${escapeAttr(opts.slotLabel)}" aria-label="Village name">` +
        `<div class="set-label">Map size</div><div class="seg-row">${sizes}</div>` +
        `<div class="set-label">Difficulty</div><div class="seg-row">${diffs}</div>` +
        `<p class="ng-desc">${DIFFICULTY_META[opts.difficulty].desc}</p>` +
        `<div class="set-label">Disasters (fire &amp; disease)</div><div class="seg-row">${dis}</div>` +
        `<div class="set-label">Seed</div>` +
        `<div class="ng-seed">` +
        `<input id="ng-seed" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" value="${opts.seed}">` +
        `<button id="ng-reroll" title="Reroll the seed" aria-label="Reroll the seed">🎲</button>` +
        `<button id="ng-copy" title="Copy the seed" aria-label="Copy the seed">📋</button>` +
        `</div>` +
        // Empty until something happens to it. The line stays in the layout so confirming a copy
        // does not shove the Start button down the card.
        `<p class="ng-hint" id="ng-hint"></p>` +
        `<button id="ng-start">Start</button>` +
        `<button class="ghost" id="ng-back">Back</button>` +
        `</div>`,
      'menu-card newgame-card',
    );

    const field = byId('ng-seed') as HTMLInputElement;
    const nameField = byId('ng-name') as HTMLInputElement;
    const hint = byId('ng-hint');
    /** A seed is an unsigned 32-bit number; anything else in the box falls back to what we had. */
    const readSeed = (): number => {
      const n = Number.parseInt(field.value.trim(), 10);
      return Number.isFinite(n) && n >= 0 ? n >>> 0 : opts.seed;
    };

    (['small', 'large'] as MapSize[]).forEach((z) =>
      byId(`ng-size-${z}`).addEventListener('click', () => opts.onChange({ size: z })),
    );
    DIFFICULTIES.forEach((d) =>
      byId(`ng-diff-${d}`).addEventListener('click', () => opts.onChange({ difficulty: d })),
    );
    byId('ng-dis-on').addEventListener('click', () => opts.onChange({ disasters: true }));
    byId('ng-dis-off').addEventListener('click', () => opts.onChange({ disasters: false }));

    byId('ng-reroll').addEventListener('click', () => {
      field.value = String(newSeed());
      hint.textContent = 'A fresh seed — a village nobody has founded before.';
    });
    byId('ng-copy').addEventListener('click', async () => {
      const text = String(readSeed());
      try {
        await navigator.clipboard.writeText(text);
        hint.textContent = `Copied ${text}`;
      } catch {
        // No clipboard permission (or an insecure context): select it so it can be copied by hand
        // rather than leaving the button looking broken.
        field.focus();
        field.select();
        hint.textContent = 'Press and hold to copy the seed.';
      }
    });

    byId('ng-start').addEventListener('click', () =>
      opts.onStart({ seed: readSeed(), name: nameField.value.trim().slice(0, SLOT_NAME_MAX) }),
    );
    byId('ng-back').addEventListener('click', () => opts.onBack());
  }

  /** In-game pause menu: Resume, Save, Load, Codex, Achievements, Settings, Main Menu. */
  showPauseMenu(opts: {
    onResume: () => void;
    onSave: () => void;
    onLoad: () => void;
    onCodex: () => void;
    onAchievements: () => void;
    onSettings: () => void;
    onMainMenu: () => void;
  }): void {
    this.overlayCard(
      `<h2>Paused</h2>` +
        `<div class="menu-list">` +
        `<button id="pm-resume">Resume</button>` +
        `<button id="pm-save">Save</button>` +
        `<button id="pm-load">Load</button>` +
        // Also here, not only on the title screen: "what does a Tailor do" is a question you have
        // mid-village, and the answer used to be one tap away on the map.
        `<button id="pm-codex">Codex</button>` +
        // New Game moved out of the pause menu — starting over lives on the title screen and Main
        // Menu — and its slot is the achievements the village has earned.
        `<button id="pm-achievements">Achievements</button>` +
        `<button id="pm-settings">Settings</button>` +
        `<button class="ghost" id="pm-main">Main Menu</button>` +
        `</div>`,
      'menu-card',
    );
    byId('pm-resume').addEventListener('click', () => opts.onResume());
    byId('pm-save').addEventListener('click', () => opts.onSave());
    byId('pm-load').addEventListener('click', () => opts.onLoad());
    byId('pm-codex').addEventListener('click', () => opts.onCodex());
    byId('pm-achievements').addEventListener('click', () => opts.onAchievements());
    byId('pm-settings').addEventListener('click', () => opts.onSettings());
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
          // Loading needs an occupied slot, so empty rows are disabled there; saving can pick an
          // empty slot to write a fresh hard save into.
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
    // Saving to an occupied slot asks for confirmation on pick (see the overwrite modal); the list
    // itself just names each hard save.
    const note = opts.mode === 'save'
      ? `<p class="slot-note">These are your hard saves. The game autosaves separately, on its own.</p>`
      : '';
    this.overlayCard(
      `<h2>${opts.mode === 'load' ? 'Load Game' : 'Save Game'}</h2>` +
        `<div class="menu-list">${note}${rows}<button class="ghost" id="slot-back">Back</button></div>`,
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

  /**
   * Last line of defence before a new village is written over an existing one: a modal that names
   * the village being replaced and makes Overwrite and Cancel plainly separate actions. Cancel is
   * the safe default (the ghost button) and must leave the save untouched; only Overwrite proceeds.
   */
  showOverwriteConfirm(opts: {
    title: string;
    year: number;
    pop: number;
    size: MapSize;
    onConfirm: () => void;
    onCancel: () => void;
  }): void {
    const sizeLabel: Record<MapSize, string> = { small: 'Small', large: 'Large' };
    this.overlayCard(
      `<h2>Overwrite save?</h2>` +
        `<div class="menu-list">` +
        `<div class="ow-village"><strong>${escapeHtml(opts.title)}</strong>` +
        `<span class="sub">Yr ${opts.year} · ${opts.pop} people · ${sizeLabel[opts.size]}</span></div>` +
        `<p class="ow-warn">This village will be permanently replaced.</p>` +
        `<button id="ow-confirm">Overwrite</button>` +
        `<button class="ghost" id="ow-cancel">Cancel</button>` +
        `</div>`,
      'menu-card',
    );
    byId('ow-confirm').addEventListener('click', () => opts.onConfirm());
    byId('ow-cancel').addEventListener('click', () => opts.onCancel());
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
  /**
   * The achievements ledger: a running count and a bubble per feat, medal first, the earned ones
   * lit green. Opened from the pause menu (where it took New Game's place).
   */
  showAchievements(opts: { items: AchRow[]; count: number; total: number; onBack: () => void }): void {
    const rows = opts.items
      .map(
        (it) =>
          `<div class="ach-bubble tier-${it.tier}${it.unlocked ? ' earned' : ''}">` +
          `<span class="ach-medal">${it.medal}</span>` +
          `<span class="ach-title">${it.title}</span>` +
          `<span class="ach-tick">${it.unlocked ? '✓' : ''}</span>` +
          `</div>`,
      )
      .join('');
    this.overlayCard(
      `<h2>Achievements <span class="ach-count">${opts.count} / ${opts.total}</span></h2>` +
        `<div class="ach-list">${rows}</div>` +
        `<div class="menu-list"><button class="ghost" id="ach-back">Back</button></div>`,
      'menu-card ach-card',
    );
    byId('ach-back').addEventListener('click', () => opts.onBack());
  }

  // ---- Achievement unlock celebration ----
  private celebrateQueue: AchRow[] = [];
  private celebrateEl: HTMLElement | null = null;
  /** Pop a celebration on screen for a newly-earned achievement; several queue up and play in turn. */
  celebrateAchievement(a: AchRow): void {
    this.celebrateQueue.push(a);
    if (this.celebrateQueue.length === 1) this.playCelebration();
  }
  private playCelebration(): void {
    const a = this.celebrateQueue[0];
    if (!a) return;
    if (!this.celebrateEl) {
      const el = document.createElement('div');
      el.id = 'ach-pop';
      document.body.appendChild(el);
      this.celebrateEl = el;
    }
    const el = this.celebrateEl;
    el.className = `ach-pop tier-${a.tier}`;
    el.innerHTML =
      `<div class="ach-pop-card">` +
      `<div class="ach-pop-head">🎉 Achievement unlocked</div>` +
      `<div class="ach-pop-medal">${a.medal}</div>` +
      `<div class="ach-pop-title">${a.title}</div>` +
      `</div>`;
    // A frame out of the DOM change, then the `show` class drives the entrance transition.
    void el.offsetWidth;
    el.classList.add('show');
    window.setTimeout(() => {
      el.classList.remove('show');
      window.setTimeout(() => {
        this.celebrateQueue.shift();
        if (this.celebrateQueue.length > 0) this.playCelebration();
        else el.className = 'ach-pop';
      }, 450);
    }, 3200);
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

/**
 * The herd-limit slider's read-out: how many head the pen is set to keep of its full capacity, and
 * — when the herd already stands over that limit — how many the rancher is culling to get there.
 */
function rmaxLabel(limit: number, capacity: number, animals: number): string {
  const over = Math.floor(animals) - limit;
  return over > 0
    ? `keep ${limit} / ${capacity} · 🔪 culling ${over}`
    : `keep ${limit} / ${capacity}`;
}

/** Escape a string for use inside a double-quoted HTML attribute (building names are player text). */
function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Player-typed text going into element *content* rather than an attribute. */
function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
