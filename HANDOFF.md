# Session Handoff — Little Village (Village-Builder PWA)

> Living doc. Update the **State** and **Next steps** sections at the end of each session.
> Last updated: 2026-07-23 (jobs board: unbuilt jobs, Laborers field, Builders job)

## Project
**Little Village** — an original 3D village-builder **PWA**: TypeScript + Three.js (v0.185.1) +
Vite + vite-plugin-pwa, installable on iPhone, deployed to GitHub Pages.

- **Repo:** `centerzl93-lang/mobile-game`
- **Working branch:** `claude/banished-ios-app-b4zott` (only push here; don't open PRs unless asked)
- **Asset rule:** CC0/permissive only — never any commercial game's copyrighted assets.

## Current State
Latest feature: the **jobs board overhaul** (this session) — see below. Prior milestones (the farm
overhaul; the ranch overhaul; the trading-post & merchant overhaul; manual staffing + 16 seed-gated
crops; the "Little Village" rename that dropped all Banished references) remain in place. Reference
commits by message, not SHA (this doc sits one commit behind its own history).

### Jobs board overhaul
- **Unbuilt jobs are listed.** `refreshJobBoard` no longer filters on `b.built`, so a placed-but-
  unbuilt site appears immediately (shown as `🏗 under construction`) and its `desiredWorkers` can be
  pre-assigned. Actual hiring still waits for `b.built` (unchanged `target` gate in
  `assignHomesAndJobs`), and `jobSig` now keys on `b.built` too.
- **Dedicated Laborers field.** Free adults = `jobId === null && !c.builder`. Shown on the board
  (`👷 Laborers (free adults): N`) and in the header chip (`#stat-builders`, repurposed to 👷 "Free
  laborers"; `updateHud` counts laborers, not the whole null-job pool).
- **Builders job.** New global job (no building): `GameState.desiredBuilders` (player-set, persisted).
  `assignHomesAndJobs` tags the first N free adults `c.builder = true` (transient, recomputed each
  tick — no citizen save migration). **Only builders construct work buildings**: `runBuilder`'s
  material-hauling + `pickSite` are gated behind `c.builder`; a non-builder laborer only returns a
  carried load to a barn, then harvests/paths. Idle builders fall through to harvest/paths like
  laborers. New games and old saves default to **0 builders** (load-time default in `save.ts`, still
  v12) — nothing constructs until the player assigns some; the placement log hints this when
  `desiredBuilders === 0`.
- **Paths: any adult.** `buildPath` gained an optional squared-distance cap `maxD2`. Free adults
  (laborers + idle builders) lay any reachable path (no cap); *employed* workers detour in `runCitizen`
  to a path within `NEAR_PATH_RADIUS` (6 tiles) before working, so a distant path network doesn't
  strip farms/mines of staff.
- Debug hook `debugSetBuilders(n)` (bypasses the adult clamp) for tests.

### Farm overhaul
Fields now mirror ranches and lay the groundwork for crop visuals.
- **Sizable fields.** Placement sizing was generalized from ranch-only to a shared `SIZABLE`
  map (`types.ts`, `{ranch,farm}: {min:4,max:8}`). `main.ts`/`ui.ts` renamed the ranch size
  widget to a generic one (`sizeW/sizeH`, `onSizeChange`, `showSizeWidget/hideSizeWidget`);
  `placeBuilding`/`makeBuilding` init `w/h` for any `SIZABLE` type. Farm def is now 4×4.
- **Area-scaled harvest.** Autumn yield ×`(footprint area / FARM_BASE_AREA=16)`, so an 8×8 field
  reaps ~4× a 4×4 (`simulation.ts` harvest block). Growth/timing unchanged.
- **Seasonal behavior (confirmed, unchanged):** `+0.5` growth on the transition into Spring and
  into Summer (→ 1.0 by autumn), harvest + reset on the transition into Autumn. A field started
  mid-year only catches the growing-season transitions that occur while it exists ⇒ partial yield.
- **Fenced-field rendering.** 2D `drawFarm` (tilled soil + furrows + fence + growth bar + crop
  emoji); 3D generalized `makeRanchPen → makeFencedPlot(fw,fh,{shed,ground})` — farm = fenced plot,
  no shed. Farm inspect shows Field size + Growth%.
- **Per-crop design scaffold (no visual yet).** `CropDesign`/`CROP_DESIGN` (one color + reserved
  `model` slot per crop) + `cropDesign(crop)` accessor. Renderers mark the hook but draw a generic
  field for now — real crop art plugs in there later.
- **Save migration** (still v12): legacy 3×3 farms default `w/h`=4.

### Ranch overhaul
Ranches went from a fixed 3×3 building over a *global* herd resource to real, sizable pens with
per-ranch herds.
- **Variable footprint.** Buildings gained optional `w`/`h` (only the ranch sets them). Read
  everywhere via `footprintW/H(b)` (`types.ts`) — swapped in for `def.w/h` across placement,
  storage `center`, `buildingCenter`, simulation adjacency, and both renderers. `canPlace`/
  `placeBuilding` take optional `w,h`. Ranch size is `RANCH_MIN`(4)…`RANCH_MAX`(8).
- **Sizing UX.** While a ranch is selected, a `.ranch-size` widget (W/H steppers) sets
  `main.ts` `ranchW/ranchH`; the reticle ghost + placement use them (`PlacementView.pw/ph`).
- **Per-ranch herd.** `Building.animals` (headcount), `maxAnimals` (player cap), `breedProgress`.
  Capacity `ranchCapacity(b) = floor(w*h / ANIMAL_TILES[animal])` — bigger animals need more tiles
  (cattle 3, pigs 2, chickens 1), so pen size *and* species drive the cap.
- **Stocking.** Livestock is still a tradeable storage resource; a rancher **pens it from the
  barns** (`penFromStorage` in `simulation.ts`, routed from `runWorker`), resource → headcount.
- **Breeding & slaughter** (per season, `updateMerchant`-style loop): a pair (≥2) breeds at
  `RANCH_BREED_PER_SEASON`(0.55, ⇒ ≥1 per 2 seasons) + `RANCH_BREED_BONUS_CHANCE`(0.2). Births
  beyond the cap are butchered (`butcherProducts` → meat/leather/eggs, `SLAUGHTER_YIELD`); products
  scale with headcount in `workOutput`.
- **Management** (exported from `simulation.ts`, wired via `main.ts`/`ui.ts` inspect controls):
  `cullRanch` (slaughter all), `splitRanch` (herd ≥ `RANCH_SPLIT_MIN`=10 → ~half to an eligible
  pen), `transferRanch` (whole herd), `eligibleRanchTargets` (same-animal built pens with room).
  Split/Transfer use a **destination picker** overlay (tap to highlight, then Confirm). Species
  toggle only shows on an empty pen.
- **Rendering.** Ranch draws as a fenced pen + corner shed with animal glyphs and a count badge
  (2D `drawRanch`), and a low fence-rail group + shed in 3D (`makeRanchPen`).
- **Save migration** (still v12): ranches default `w/h`=4, `animals`=0, `breedProgress`=0,
  `maxAnimals`=capacity. Legacy 3×3 ranches load as 4×4.

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

**Manual workplace staffing.**
Placed work buildings start at `desiredWorkers: 0` (no auto-fill); player assigns workers via the
inspect / Job-Board stepper. Set in both placement paths: `placeBuilding` (`src/game/buildings.ts`)
and starter `makeBuilding` (`src/game/state.ts`).

**16 seed-gated crop varieties.**
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
- `src/types.ts` — `footprintW/H`, `SIZABLE`, `ranchCapacity`, ranch husbandry constants
  (`ANIMAL_TILES`, `RANCH_BREED_*`, `RANCH_SPLIT_MIN`, `SLAUGHTER_YIELD`), `FARM_BASE_AREA`,
  `CropDesign`/`CROP_DESIGN`/`cropDesign`; `Merchant`/`MerchantCategory` + `MERCHANT_*`/`TRADE_VALUE`;
  `Building` fields (`w/h`, `animals`/`maxAnimals`/`breedProgress`, `orders`); crops/foods, `CROP_META`,
  `SEED_COST`, resource tables.
- `src/game/simulation.ts` — merchant lifecycle (`updateMerchant`/`updateMerchantBoat`/`spawnMerchant`/
  `moveBoatTo`), `runTrader` + `basketTrade`/value helpers; ranch `penFromStorage`, per-season breeding
  + `butcherProducts`, `cullRanch`/`splitRanch`/`transferRanch`/`eligibleRanchTargets`; farm
  area-scaled autumn harvest.
- `src/game/buildings.ts` — sized `canPlace`/`placeBuilding` (`SIZABLE`-driven `w/h` init).
- `src/game/world.ts` — `riverColumnX` (boat's river path).
- `src/game/state.ts` — `makeBuilding` sizable + ranch init; merchant init; `seeds` seeding;
  `desiredWorkers 0` defaults.
- `src/game/save.ts` — merchant-shape + `orders` migration; ranch/farm `w/h` + herd defaults; `seeds`
  default + stale-crop reset (all load-time, still v12).
- `src/main.ts` / `src/ui/ui.ts` — generic placement size widget (`sizeW/H`, `onSizeChange`,
  `showSizeWidget`); inspect controls — ranch (max/cull/split/transfer + destination picker), farm
  (size + growth rows), trading-post overlay (`onSetTradeOrder`/`onBasketTrade`/`onDismissMerchant`).
- `src/render/renderer.ts` / `renderer3d.ts` — `drawRanch`/`drawFarm`/`makeFencedPlot`, merchant boat,
  sized ghost (`PlacementView.pw/ph`).
- **Jobs board** — `src/game/simulation.ts` (`assignHomesAndJobs` builder tagging; `runCitizen`
  nearby-path detour; `runBuilder` `c.builder` gate; `buildPath(…, maxD2)`; `NEAR_PATH_RADIUS`);
  `src/ui/ui.ts` (`refreshJobBoard` unbuilt rows + Builders row + Laborers field; `onSetBuilders`;
  `updateHud` laborers chip); `src/main.ts` (`setBuilders`, placement hint, `debugSetBuilders`);
  `src/game/state.ts`/`save.ts` (`desiredBuilders` init + v12 default); `index.html` (`#stat-builders`
  → 👷).
- `index.html` — removed `#btn-merchant`. `src/style.css` — `.ranch-size`, `.tp-*`, ranch-picker styles.
- `tests/newgame.spec.ts` — merchant, ranch, farm, and **jobs & builders** suites, plus prior
  seed-gate/staffing tests.

## Architecture notes
- **Sizable buildings.** `SIZABLE` (`types.ts`) lists the types the player sizes at placement
  (`ranch`, `farm`; min/max 4/8). Those carry a per-instance `Building.w/h`; **every** footprint read
  goes through `footprintW/H(b)` (`= b.w ?? def.w`), so all other buildings stay fixed-size. The
  placement size widget, ghost (`PlacementView.pw/ph`), `canPlace`/`placeBuilding`, storage `center`,
  `buildingCenter`, and both renderers all use these helpers.
- Resource system is table-driven: everything iterates `RESOURCE_KINDS`/`FOOD_KINDS`, so
  HUD/trade/storage/consumption auto-pick-up new kinds. Foods aggregate behind one 🍽️ HUD chip
  (`HUD_RESOURCES` = kinds minus foods).
- Worker assignment (`assignHomesAndJobs` in `simulation.ts`) fills each **built** workplace up to
  `min(def.jobs, b.desiredWorkers)` from free adults, then tags the first `desiredBuilders` remaining
  free adults `c.builder = true`. A villager's role is: employed (`jobId !== null`), builder
  (`jobId === null && builder`), or laborer (`jobId === null && !builder`). Only builders advance
  construction; any free adult harvests/paths; employed workers only detour to *nearby* paths.
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
  `debugCanPlace`, `debugRanchCapacity`, `debugWorkRadius`, `debugSetBuilders`, `inspectSel`/`refreshInspect`, `persist`,
  plus the sizing fields `sizeW/sizeH` and the private action methods — TS `private` is runtime-callable).
- **Test caveat:** when advancing whole seasons with `debugAdvance`, step *just past* the boundary
  (e.g. `600*2 + 30`), never exactly `N*600` — float drift on the 0.1s steps can miss the boundary and
  run one fewer season, which made season-timed tests flaky. Fields synthesized in tests set
  `store`/`w`/`h`/`animals` directly (see `mkRanch`/`mkFarm` helpers).

## Conventions
Commit messages end with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: <this session's claude.ai/code URL>
```
The `Claude-Session:` URL is **per-session** — use the current session's, not any literal shown here.
Never put the model ID in commits/PRs/code/comments — chat replies only.

## Next steps
- **Repo rename (pending, manual — user will do it):** rename `centerzl93-lang/mobile-game` →
  `little-village` in GitHub **Settings → General**. There is no MCP tool for this. *After* it's
  renamed, update the repo name in lockstep or GitHub Pages breaks: `vite.config.ts` `BASE`,
  `playwright.config.ts` `BASE`, the two `.../mobile-game/` URLs in `README.md`, and the **Repo** line
  above. (Package name is already `little-village`.)
- **Branch name:** `claude/banished-ios-app-b4zott` is the *only* remaining "banished" string — git
  infra, in the two `.github/workflows/*.yml` triggers and the Working-branch line above. Renaming it
  needs the user's go-ahead and updating both workflow triggers (and the working-branch instruction).
- **Per-crop designs:** `CROP_DESIGN` (color + reserved `model` slot) and the render hook in
  `drawFarm`/`makeFencedPlot` exist, but fields draw generically. Next step is real per-crop art at the
  hook, or a cheap first pass tinting the field by `cropDesign(crop).color` (~a couple of lines).
- **Trading-post polish (optional):** boat parks on the *central* river even for an edge-lake post;
  tune `MERCHANT_ARRIVAL_CHANCE`/category stock; optional HUD cue for an arriving boat (top-bar button
  was removed).
- **Minor:** the 3D ranch pen shows no live animal glyphs/count (the 2D renderer does).
- Otherwise awaiting new direction.
