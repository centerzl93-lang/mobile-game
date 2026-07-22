# Session Handoff — Banished-inspired Village Builder PWA

> Living doc. Update the **State** and **Next steps** sections at the end of each session.
> Last updated: 2026-07-22 (trading-post & merchant overhaul)

## Project
Original Banished-inspired 3D village-builder **PWA**: TypeScript + Three.js (v0.185.1) +
Vite + vite-plugin-pwa, installable on iPhone, deployed to GitHub Pages.

- **Repo:** `centerzl93-lang/mobile-game`
- **Working branch:** `claude/banished-ios-app-b4zott` (only push here; don't open PRs unless asked)
- **Asset rule:** CC0/permissive only — never Banished's copyrighted assets.

## Current State
Latest feature: the **trading-post & merchant overhaul** (this session) — see below. The prior
milestone (manual staffing + 16 seed-gated crops, feature commit `a4d43a8`) is still in place. The
SHA here is intentionally omitted; reference commits by message since this doc sits one commit
behind its own history.

### Trading post & merchant overhaul
Merchants are now a real trading loop rather than a global barter button.
- **Boats.** A merchant arrives as a boat that sails down the central river (`riverColumnX` in
  `world.ts`, derived from actual water tiles) and moors at the trading post. `Merchant` is now a
  state machine: `phase: 'away' | 'arriving' | 'docked' | 'leaving'`, with an animated
  `boat: {x,y} | null`. Boat motion is per-tick (`updateMerchantBoat`); arrivals/departures are
  per-season (`updateMerchant`).
- **Cadence.** Each season a *staffed* post has a `MERCHANT_ARRIVAL_CHANCE` (0.5) roll; a
  `cooldown` flag guarantees **never back-to-back** visits. A docked merchant stays
  `MERCHANT_STAY_SEASONS` (1) and is **dismissible** early (`dismissMerchant`).
- **Access only via the post.** The global `#btn-merchant` top-bar button is **removed**; the
  merchant opens from the Trading Post inspect sheet (`controls.tradingPost`).
- **Specialization.** Each visit rolls one `MerchantCategory`: `basics | seeds | animals | foods |
  goods`, stocked from `MERCHANT_CATEGORY_STOCK` (customizable). Seed merchants offer unowned crops
  via `seedStock`.
- **Post inventory + manual orders.** Trades draw from the post's **own** `store`, which a trader
  (the post's worker) stocks from the barns to match player-set `Building.orders` targets, returning
  surplus (`runTrader`, mirrors `runVendor`). Orders are set with `onSetTradeOrder` (steps of 10).
- **Value-matching basket.** `basketTrade` settles a `TradeBasket { give, get, buySeeds }`: give
  goods (from the post) must total ≥ `requiredValue` (buy value ÷ `MERCHANT_MARGIN`). Per-unit
  values live in the customizable `TRADE_VALUE` table; seeds priced at `SEED_COST`. UI is the
  two-column Trading Post overlay (`#trade-overlay`, `.tp-*` styles).
- **Boat rendering** in both 2D (`renderer.ts`) and 3D (`renderer3d.ts`, a `THREE.Group` synced in
  `syncBoat`).
- **Save migration** (still v12, load-time defaults): legacy `{present,timer,stock}` merchant →
  new shape; `Building.orders` defaulted to `{}`.

### Prior milestone: manual staffing + 16 seed-gated crops

### Manual workplace staffing
Placed work buildings start at `desiredWorkers: 0` (no auto-fill); player assigns workers via the
inspect / Job-Board stepper. Set in both placement paths: `placeBuilding` (`src/game/buildings.ts`)
and starter `makeBuilding` (`src/game/state.ts`).

### 16 seed-gated crop varieties
wheat, corn, potato, rice, barley, carrot, tomato, onion, pepper, cabbage, beans, pumpkin, apple,
grapes, strawberry, melon — each its own food `ResourceKind`.
- **Seeds are one-time unlocks** (`GameState.seeds: Crop[]`). Buy a crop's seed once → plantable on
  any field forever.
- **Easy** starts with 1 random seed; **Normal/Hard** start with none. Others bought from merchants.
- Seeds sold via a dedicated **Seeds section** in the trade panel (flat `SEED_COST=30` trade-value,
  paid in chosen "Pay in" good) — not qty barter.
- A field with no owned seed produces nothing; crop toggle lists only unlocked crops.
- Removed the old generic `vegetables` resource.
- Diet-variety health saturates at `DIET_VARIETY_TARGET=5` distinct foods.
- **Save migration** (no version bump, still v12): old saves default `seeds` to all 16 crops; stale
  crop selections cleared on load.

## Key files
- `src/types.ts` — `Merchant`/`MerchantCategory`, `Building.orders`, `MERCHANT_*` constants +
  category tables; crops/foods, `CROP_META`, `SEED_COST`, `TRADE_VALUE`, resource tables.
- `src/game/simulation.ts` — `updateMerchant`/`updateMerchantBoat`/`spawnMerchant`/`moveBoatTo`,
  `runTrader` (post stocking), `basketTrade` + value helpers (`offerValue`/`requiredValue`),
  `dismissMerchant`, `tradingPost`.
- `src/game/world.ts` — `riverColumnX` (boat's river path).
- `src/game/state.ts` — merchant init (new shape); `seeds` seeding; `desiredWorkers 0` defaults.
- `src/game/save.ts` — merchant-shape + `orders` migration; `seeds` default + stale-crop reset.
- `src/ui/ui.ts` / `src/main.ts` — Trading Post overlay (inventory/orders + basket), inspect
  `tradingPost` control, `onSetTradeOrder`/`onBasketTrade`/`onDismissMerchant`.
- `src/render/renderer.ts` / `src/render/renderer3d.ts` — merchant boat (2D shape / 3D group).
- `index.html` — removed `#btn-merchant`. `src/style.css` — `.tp-*` overlay styles.
- `tests/newgame.spec.ts` — merchant/trading-post suite (boat dock, basket value-match, seed
  unlock, dismiss, cooldown, order hauling) + prior seed-gate/staffing tests.

## Architecture notes
- Resource system is table-driven: everything iterates `RESOURCE_KINDS`/`FOOD_KINDS`, so
  HUD/trade/storage/consumption auto-pick-up new kinds. Foods aggregate behind one 🍽️ HUD chip
  (`HUD_RESOURCES` = kinds minus foods).
- Worker auto-assignment (`assignJobs` in `simulation.ts`) fills up to
  `min(def.jobs, b.desiredWorkers)`.
- Save is single-slot-per-key `little-village-save-v12-slot<N>`, VERSION 12; new optional fields get
  load-time defaults (no version bump).

## Verification
- `tsc --noEmit` + `npm run build` clean.
- Committed tests: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test`
  (config runs `npm run build && npm run preview` on port 4173).
- Headless scratchpad drivers use `playwright-core` + chromium at
  `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` with SwiftShader flags,
  against `npm run preview` on port 4173 (preview is flaky — run it in the background).
- App exposes a `window.__village` debug hook (`startNewGame`, `debugAdvance`, `debugPlace`,
  `debugCanPlace`, `inspectSel`/`refreshInspect`, `persist`, etc.).

## Conventions
Commit messages end with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JZUkqYfASDALSC37iDWrtr
```
Never put the model ID in commits/PRs/code/comments — chat replies only.

## Next steps
- Possible polish on the trading-post feature (not required, ideas only):
  - Boat only follows the *central* river; a post built on an edge lake still parks the boat in the
    river at that row. Fine in practice, but could path to the nearest water tile to the dock.
  - Tune `MERCHANT_ARRIVAL_CHANCE` / category stock quantities for balance.
  - Consider a HUD cue when a boat is arriving/docked (the top-bar button was removed).
- Otherwise awaiting new direction.
