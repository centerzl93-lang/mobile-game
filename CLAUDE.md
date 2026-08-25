# CLAUDE.md — Little Village developer reference

This is the permanent orientation document for working on **Little Village**. It describes the
game and its architecture *as the code actually is today*. Every figure here was read out of the
source; where an older note (e.g. `HANDOFF.md`) disagrees, the code wins.

> **Canonical branch:** `main` is the single canonical development branch. It is the only branch in
> the `push` trigger of both `.github/workflows/deploy.yml` and `test.yml`, so a push to `main` is
> the only push that runs CI and deploys to GitHub Pages. Develop on a `claude/…` (or feature)
> branch and land it on `main` — via PR or fast-forward — to publish. A snapshot of the pre-canonical
> build is preserved as the `backup/v0.1.0` branch and the `v0.1.0-pre-canonical` tag.

---

## Game concept

Little Village is an original **survival village-builder**, shipped as an installable **PWA**
(TypeScript + Three.js `0.185.1` + Vite + `vite-plugin-pwa`) and deployed free to GitHub Pages under
the base path `/mobile-game/`. It is built to be added to an iPhone home screen and played
full-screen and offline; the village auto-saves to `localStorage`. Package name `little-village`,
version `0.2.0`. All art, code and audio are original; assets are CC0/permissive only.

The player founds a settlement of twelve, keeps them fed, warmed and housed through the seasons,
grows the population, and works up through five tiers of civilisation — from a forest camp to a
trading city.

## Core gameplay loop

1. **Place buildings.** Placing a building only marks a **site** — it costs nothing until built.
2. **Builders construct it.** Builders walk to a barn, haul the materials to the site, and lay
   down builder-work on the spot. Nothing teleports; everything is carried by hand.
3. **Villagers work and haul.** Producers work in/around their building, accumulate a load, and
   carry it to the nearest barn. Households keep their own **larders** (food/fuel/clothing/medicine)
   and a resident hauls supplies home from the barns.
4. **Survive the year.** Villagers **eat**, **burn fuel in winter**, and **wear coats**; running out
   of any kills (starve/freeze/illness). Seasons run 10 real minutes each.
5. **Grow.** A couple needs a free house to form a household and bear children; nomads immigrate when
   the village banks a food surplus.
6. **Progress.** Population + required trades + schooled adults raise the **tier**, which unlocks new
   buildings and roadworks.
7. **Trade & specialise.** River merchants and (at city tier) scheduled port fleets barter goods;
   a luxury chain turns quarry sand into glass, jewellery and fine goods.
8. **Earn achievements** (80 of them) across the village's life.

---

## Current architecture

A single-page Vite app. Entry `src/main.ts` builds one `Game` object that owns the state, the
renderer, the camera, input, and the DOM UI.

- **Frame loop** (`Game.frame`, `requestAnimationFrame`): each frame computes `dt` (ms since last
  frame ÷ 1000), **clamps it to 0.1 s** to avoid huge catch-up steps, multiplies by the current
  speed (`SPEEDS`, pausable), and calls `simulation.update(state, dt, log)`. The renderer draws, and
  the UI is refreshed from the same loop (never on its own timer).
- **Autosave**: a `saveAccum` accumulates `dt`; past its interval the game writes to the current
  `localStorage` slot.
- **Two renderers, one interface**: `Renderer3D` (Three.js, the default) and `Renderer` (2D canvas,
  selected with `?2d` in the URL for rollback/tests). `Camera3D`/`Camera` and a shared
  `InputManager` (unified touch + mouse; pan/pinch/tap, marquee, path-draw modes) drive both.
- **UI** (`src/ui/ui.ts`): DOM-based, built on the `index.html` scaffold. Panels and the HUD are
  rebuilt every `UI_REFRESH_MS` (100 ms) from the frame loop.
- **Debug hook**: `window.__village` exposes the `Game` (`__village.state`, `startNewGame`,
  `debugAdvance`, `debugPlace`, `debugFoodPerCitizen`, `debugWorkRadius`, etc.) — the surface the
  test suite drives.

### Important directories / files

| Path | What lives there |
|---|---|
| `src/main.ts` | The `Game` class: frame loop, input wiring, placement, menus, autosave, debug hooks (~2.5k lines). |
| `src/types.ts` | **The hub.** All shared types *and* tunable balance constants; `BUILDING_DEFS`, `RESOURCE_*`, `TRADE_VALUE`, footprint/tier/work helpers (~3k lines). |
| `src/game/simulation.ts` | The tick engine — `update()` and every subsystem it drives (~4.3k lines). |
| `src/game/state.ts` | `newGame()` world/citizen/barn setup; `housingCapacity`, `storageCap`, `jobSlots`. |
| `src/game/save.ts` | Versioned `localStorage` save/load, migrations, slots, slot names. |
| `src/game/storage.ts` | Barn/market/larder logistics: put/take, larder stocking, market delivery. |
| `src/game/world.ts` | Seeded map generation (terrain, forest, ore deposits, lakes, foothills). |
| `src/game/paths.ts` | Roads, bridges, tunnels: planning, building, tearing up. |
| `src/game/pathfind.ts` | A* over the tile grid with a cached solid-grid and nav labels. |
| `src/game/tiers.ts` | The 5-tier progression gate (computed live). |
| `src/game/achievements.ts` | The 80 achievements + global unlock persistence. |
| `src/game/rng.ts` | `mulberry32` seeded RNG (world gen by value; sim stream on `state.rng`). |
| `src/game/names.ts` | Villager name generation. |
| `src/render/renderer3d.ts` | Three.js scene, meshes, work rings, boat, placement ghost. |
| `src/render/renderer.ts` | Legacy 2D canvas renderer (feature-parity for `?2d`). |
| `src/render/models.ts`, `villager.ts`, `bridges.ts` | 3D model loading, villager meshes, bridge geometry. |
| `src/engine/` | `camera.ts`, `camera3d.ts`, `input.ts`. |
| `tests/` | Playwright specs (see Testing). |
| `sim-tests/` | Headless Node tests against the simulation directly — no browser, no renderer (see Testing). |
| `tools/` | `icon/` (app-icon build), `models/` (Python/Blender building geometry + `check.py`), `textures/`. |
| `public/` | Built `.gltf` models, PWA icons. |

---

## Unity migration architecture

The WebGL/Three.js version is the only shipping target and stays the development priority — nothing
below authorizes slowing feature work down for portability's own sake. But a native Unity build is a
live possibility, so new code should default to keeping four layers conceptually separate: **game
data** (`src/types.ts`'s tables and constants), **simulation** (`src/game/*.ts`, driven by `update()`),
**presentation** (`src/render/*.ts`, `src/engine/*.ts`), and **platform-specific glue** (`localStorage`,
DOM, PWA — mostly `src/game/save.ts` and the browser-facing edges of `src/main.ts`). `src/ui/ui.ts` is
presentation too: it reads state and issues commands, it doesn't decide outcomes.

**The rule that matters day to day:** gameplay doesn't know about `THREE.*`, and a renderer reads state
rather than deciding it (`building.fireState = 'burning'` in the sim; `if (fireState === 'burning')
showFireEffect()` in the renderer, never the reverse). This already mostly holds — `src/game/*.ts` has
no `THREE` imports, `src/ui/ui.ts` doesn't mutate `GameState` fields directly, and `sim-tests/` proves
the sim runs headless in Node with no browser or renderer at all. Keep it that way rather than
introducing a parallel Unity-shaped abstraction: no C#-style interfaces, no engine-neutral wrapper
classes, no speculative plumbing for a migration that isn't happening yet. A new building/resource/
recipe/policy is a table entry in `src/types.ts` as it always was; that table *is* the portable
artifact, not a new indirection layer around it.

When a system is genuinely Unity-relevant, classify it in passing (commit message or PR description is
enough — this file doesn't need a running log): **A** highly reusable as-is (production formulas,
trade values, progression/achievement conditions); **B** reusable design, C# rewrite required
(villager task machine, construction, disasters, save schema); **C** engine-specific, rebuilt in Unity
outright (anything in `src/render/`, `src/engine/`); **D** web-specific, needs a native replacement
(`localStorage`, DOM, PWA install/offline). Don't produce this classification for every commit — only
when a system is new or has substantially changed.

**Known coupling to watch, not to fix opportunistically:** `src/game/achievements.ts` mixes the
(portable) achievement table and `evaluateAchievements` logic with direct `localStorage` calls
(`loadUnlocked`/`saveUnlocked`) — a Unity port keeps the table and swaps ~15 lines for PlayerPrefs, but
today the whole file reads as "needs porting." `src/render/renderer3d.ts` reads the `'village-gfx'`
graphics-quality preference straight out of `localStorage` inside the renderer rather than taking it as
a parameter — harmless today, but it's platform code living inside Category C. Neither blocks anything;
note them if you're touching that code anyway, don't detour to fix them on their own.

---

## Simulation architecture

The simulation is a **single-object, single-tick** model. All game state is one `GameState`
(`src/types.ts`): the tile arrays (`tiles`/`paths`/`harvest`, each length `w*h`), `buildings`,
`citizens`, the calendar (`season`/`year`/`seasonTimer`), the `merchant`, the RNG stream (`rng`),
lifetime `stats`, the ledger, policies, and player settings. It is a plain serialisable object — the
save is literally this wrapped in a version envelope.

**Determinism.** Randomness is a seeded `mulberry32` stream whose whole state is one 32-bit integer
on `state.rng`, saved and restored like any other field, so a village resumes its exact luck after a
reload. The map is a pure function of `state.seed` and generated once. `state.seed ^ 0x5bf03635`
opens the sim stream so the founding rolls aren't correlated with where the river went.

**The tick.** `update(s, dt, log)` runs one ordered pipeline every frame (order matters):

1. `ensureNavLabels` — recompute walkable connectivity only when it changed (`navVersion`).
2. `reconcileWorkers` → `assignHomesAndJobs` — settle who is employed / a builder / a laborer.
3. `runCitizen` for every citizen — the per-villager logistics state machine (see Citizen/job).
4. `processFires`, `regrowForest`, `updateMerchant` + `updateMerchantBoat`.
5. `rehouseVillagers` on a short cadence (`rehouseTimer`) — couples move in as houses finish.
6. `eat`, `heat`, `lives` — continuous consumption and ageing/schooling/births/old-age.
7. `warnLowStocks` on a cadence (`warnTimer`).
8. `seasonTimer += dt`; crossing `SEASON_LENGTH` runs `endSeason` (harvest, breeding, clothing
   issue, immigration, disease/fire/famine/flood rolls, ledger, tier check, achievement evaluation).

Consumption (food/fuel) is billed **continuously** (a fraction of a season's ration per tick), not
in lumps at the season boundary — so shortages show as a falling counter well before anyone dies,
and a villager must go unfed/unheated for `STARVE_SECONDS`/`FREEZE_SECONDS` before dying.

Key section headers inside `simulation.ts`: *lives, jobs, movement, per-citizen behaviour, workers
(production logistics), builders (construction + path logistics), harvest orders, season turnover,
merchant, ranch management, population helpers, households, well-being, disease & fire, forest
upkeep.*

## Resource system

**Table-driven.** 48 resource kinds (`RESOURCE_KINDS`), of which 25 are foods (`FOOD_KINDS`).
Everything that walks resources — HUD, trade, storage, consumption — iterates these tables, so
adding a kind is a table edit. Core tables (all `src/types.ts`): `RESOURCE_ICON`, `RESOURCE_VOLUME`,
`TRADE_VALUE`.

- **Volume, not count.** Carrying and storage are measured in wood-equivalent **volume**
  (`RESOURCE_VOLUME`): a log is 1, a crop 0.25, a cow 4. `CARRY_VOLUME` (12) is one trip; a barn
  holds `BARN_CAPACITY` (5000) of volume; a market holds `MARKET_CAPACITY` (2000). A worker holds
  output back until they have a full load (`pending` → `carry`).
- **HUD grouping.** Foods aggregate behind one 🍽️ chip. `HUD_CORE` (wood/stone/iron/firewood/
  tools/clothing/medicine) is the fixed, always-shown resources row — nothing else (processed
  intermediates, livestock, luxuries) reaches the top line; they're still readable in a barn's
  inspect sheet, the trading post, and the stockpile limits panel.
- **Low-stock signalling** is a fraction of each resource's own cap (`LOW_STOCK_FRACTION` 0.2 reddens
  the chip, `WARN_STOCK_FRACTION` 0.1 logs a warning), floored by per-citizen seasonal need.
- **The tool ladder is per villager, not per village.** `tools` (iron) and `steeltools` are **two barn
  goods, one HUD chip, one stockpile-limit row** — the top bar folds them into a single 🛠️ figure and
  the limits panel offers one "Tools" cap for both (`LIMITABLE`/`limitStock`), while the
  barn/smith/villager sheets keep them apart. A smith on either recipe reads `limitedOutput` as
  `'tools'` and stands down once the *combined* stock hits that one cap — steel carries no ceiling
  of its own. What a villager actually works with is their own belonging,
  `Citizen.tool` (`'iron' | 'steel' | undefined`), not a village-wide fact: two workers at the same
  bench can be on different tiers at once. Steel (`STEEL_TOOL_PROD` 1.15) beats iron (`IRON_TOOL_PROD`
  1.0) beats bare hands (`NO_TOOLS_PENALTY` 0.75), read off that citizen by `citizenToolFactor`. A
  bare-handed villager equips the next time they are naturally standing at a barn for another reason —
  delivering a load, fetching a converter input, fetching or returning builder materials
  (`tryEquipTool`) — steel first, then iron; nobody is sent on a dedicated trip just to fetch one, and
  a villager already holding a tool doesn't trade it in just because a better one turns up at the barn.
  A smith set to `steel` forges `steeltools` from iron **+ coal** (the reason a village keeps two
  mines — coal digs slower than iron, `MINE_COAL_FACTOR` < `MINE_IRON_FACTOR`); set to `iron` it
  forges plain `tools` from iron alone.
- **Tool wear is work-based and personal, not seasonal or shared** (`wearCitizenTool`). Wear accrues
  onto the tool the *working citizen* is holding — a slice (`TOOL_WEAR_PER_CYCLE`) each time they
  complete a work cycle, and per unit of builder-work they lay on a site (`TOOL_WEAR_PER_BUILD_WORK`,
  construction *and* demolition) — never in a lump at the season turn, and never drawn from some
  other villager's kit. A producer blocked for want of inputs completes no cycles and so wears
  nothing; a bare-handed villager has nothing to wear either. The rates derive from
  `TOOL_WEAR_PER_WORKER` so a worker labouring flat out still wears through about one tool a season.
  A steel tool absorbs `STEEL_DURABILITY` (2) worker-seasons before it gives out — twice an iron one —
  at which point `Citizen.tool` clears and they go bare-handed until their next barn visit re-equips
  them. Picking one up still books to the ledger via `s.spent` (the same continuous billing as
  `eat`/`heat`), just at checkout time instead of at wear time.

## Building system

`BUILDING_DEFS: Record<BuildingType, BuildingDef>` is the exhaustive building table — **31 building
types**. Each def carries `category`, footprint `w`/`h`, `cost`, `jobs`, `work` (builder-work units),
optional `builders`, terrain gating, `workRadius`, `fireproof`, `doors`, and a `desc`.

- **Placement gating**: `requiresAdjacent`, `requiresTileAny`, `requiresBackHalf` (mines dig into
  foothills), `requiresWaterFraction` / `dockDepth` (docks reach over water). `canPlace`
  (`buildings.ts`) also protects every door tile's reachability.
- **Sizable buildings**: `SIZABLE` (ranch, farm; 4–8 tiles a side) carry a per-instance `w`/`h`;
  **every footprint read goes through `footprintW/H(b)`** (`b.w ?? def.w`), and `buildCost` scales
  cost with area. Everything else is fixed-size.
- **Rotation**: `rot` 0–3 quarter-turns; swaps `w`/`h` and moves the door face (`entranceTile`).
- **Categories**: housing / food / resources / civic / trade (`CATEGORY_ORDER`, `BUILD_ORDER`).

## Citizen / job system

A `Citizen` carries position, `age`, `health`, `happiness`, `sex`, `homeId`, `jobId`, `carry`/
`pending`, a `task` state machine, education flags (`educated`/`graduate`/`student`/`undergrad`),
`partnerId`/`parents`, transient survival counters (`starve`/`chill`/`clothed`), and their own
`tool`/`toolWear` — the tool ladder (see Resource system) is a personal belonging, not a village
fact.

- **Roles** (recomputed every tick in `assignHomesAndJobs`): **employed** (`jobId !== null`),
  **builder** (`jobId === null && builder`), or **laborer** (`jobId === null && !builder`). Only
  builders advance construction; any free adult harvests/lays paths; employed workers only detour to
  *nearby* planned paths.
- **The job board is per-profession, not per-building.** `tradeStaff` = the sum of each building's
  `desiredWorkers` plus `tradeExtra` overflow (staff a trade before it has a building);
  `setTradeWanted` spreads a change across buildings. Builders are separate — derived from open sites
  via `autoBuilderDemand` plus a player `builderExtra`. `autoStaff` opens new jobs automatically.
- **Adulthood** at `ADULT_AGE` (16); a `student`/`undergrad` is over-age but not yet in the
  workforce. Schooling runs `SCHOOL_START_AGE`(12)→`SCHOOL_LEAVING_AGE`(16); a university adds one
  year. Education multiplies work (`EDUCATED_BONUS`/`GRADUATE_BONUS`) and longevity.
- **Reproduction**: a fertile couple (`FERTILE_MIN_AGE`..`FERTILE_MAX_AGE`) in a house with room bears
  a child on a cadence (`birthTimer`), gated by a one-season food surplus (`BIRTH_CHANCE` 0.5 with
  surplus/wellbeing modifiers). **Immigration**: nomad bands (`NomadOffer`) arrive on a food surplus
  and the player accepts/rejects. Death: starvation, cold, disease, or old age (`OLD_AGE_START` 60,
  `MAX_AGE` 80).

## Construction system

- A placed building is a **site** (`built:false`, `progress:0`). The site is worked in order:
  **place → clear the footprint → deliver materials → construct.** `markFootprintHarvest` marks any
  trees / loose stone under the plot at placement, and `pickSite`/`nearestUnbuiltNeeding` gate *both*
  fetching and building on `footprintClear` — nothing is hauled to an obstructed plot, so a load is
  never stranded on ground that still can't be built on. Once clear, builders fetch its `cost`
  materials from barns into the site's `store`, then lay builder-work: `BUILD_WORK_RATE` (1) work per
  builder-second, capped at `BUILDER_SHIFT_WORK` (30) per shift before a `BUILDER_REST_SECONDS` break
  — which is why *where builders live* relative to a big site matters.
- `work` (in `BUILDING_DEFS`) is the honest size of a job: a well is 10, a cathedral 360.
- **Three visual stages** (`buildStage`): site → framing (`BUILD_FRAMING_AT` 0.5) → done.
- **Cancelling a site** (`cancelConstruction`, reached via `markDemolish` on a `!built` plot) is
  instant — there are no walls to tear down. It removes the site, returns `CANCEL_REFUND_FRACTION`
  (0.9) of the materials *already delivered* to the nearest barn (the other 10% is wastage), hands
  any pre-staffed order back to the trade overflow, and clears the plot. In-flight builders re-pick
  the next tick (a carried load returns to a barn), so the hauling/build tasks cancel themselves.
  The UI routes it through the confirm bar (a Demolish-tool tap or the inspect sheet's **Cancel
  construction** button) so it always takes a confirmation. Cancellation rules never touch a finished
  building — that goes the demolition route below.
- **Demolition is a job** (finished buildings only): marking sets `demolish`; a builder tears it down
  over `DEMO_WORK_FRACTION` (0.5) of the build work, salvage + contents become rubble (`razed`)
  hauled back to barns, refunding `REFUND_FRACTION` (0.25). The last barn can't be demolished.
- **House upgrade**: `upgradeTo` razes the old house and raises the new type in place.

## Disaster system

Four hazards, one on/off switch (`state.disasters`, set at New Game) and one shared building state
machine. Each is rolled at most once at a season turn (`endSeason`), and each tests a different
part of the village economy rather than being an undifferentiated "bad thing happens."

- **Fire** (`FIRE_CHANCE`, any season): a building goes BURNING (`fireTimer`) the instant it
  ignites — workers and residents turned out at once (`evictOccupants`), the building still
  standing. Any adult within `FIRE_RESPONSE_RADIUS` drops what they're doing to run water from the
  nearest well (`runFirefighter`). A burning building also has structural health (`fireHealth`,
  0..100) that a small, steady `FIRE_DAMAGE_PER_TICK` wears down every `FIRE_DAMAGE_INTERVAL`
  seconds it keeps burning (halved for masonry — `STONE_FIRE_FACTOR` — and softened by Emergency
  Preparedness — see `fireDamagePerTick`), scaled down as `fireWater` climbs toward
  `FIRE_DOUSE_TRIPS_NEEDED` — see `processFires` — so real (if slow) progress on the bucket count
  is already slowing the damage, not racing an unmoved clock; how long the brigade takes to finish
  is what decides how much damage the building actually takes.
  Reaching that many loads (`processFires`) guarantees the fire is put out and the building ends up
  DAMAGED rather than destroyed — *unless* `fireHealth` has already burned through to
  `FIRE_BURNDOWN_HEALTH` first, which burns the building down (`razeBuilding`, a scorch mark left by
  `markScorched`) outright, whatever the water count. `FIRE_BURN_SECONDS` is only a safety-net cap
  now — almost every fire resolves via water or health well before it runs out. Can spread to
  neighbours (`FIRE_SPREAD_ADJACENT`/`FIRE_SPREAD_NEAR`).
- **Sickness** (`DISEASE_CHANCE`, any season): a share of the healthy population falls sick
  (`DISEASE_INFECT_FRACTION`); each sick citizen rolls for recovery every season, the odds lifted
  by health, a staffed hospital, and medicine administered from the household larder or the barns.
- **Famine** (`FAMINE_CHANCE_PER_SUMMER`, **Summer only**): docks that year's Autumn harvest —
  `FAMINE_PENALTY` (moderate 50%, severe 25% of normal yield) — and nothing else; fishing, hunting,
  gathering and ranching are untouched, so a food economy that isn't farm-only rides it out. Set on
  `state.famine` the moment it's warned about (giving the player the rest of the growing season to
  react), read once by that year's harvest in `endSeason`, then cleared — recovery is automatic,
  never a repair job, and a farm is never destroyed by one. While it stands, the 3D renderer draws a
  share of each field's stand matching `1 - FAMINE_PENALTY` as withered stalks (grey, drooped, no
  ripe head) — see `makeFarmField` — so the shortfall is visible growing, not just totalled at
  harvest.
- **Flood** (`FLOOD_CHANCE_PER_SPRING`, **Spring only**): every built building within
  `FLOOD_RISK_RADIUS` tiles of open water (`nearestWaterDist`, measured from the footprint's edge)
  is a candidate, tiered by distance (`floodRiskTier`) into a `FLOOD_DAMAGE_CHANCE` of actually
  taking damage — so building away from the bank is a real way to sit a flood out, and a flood
  typically damages a handful of riverside buildings, not all of them. Damage goes straight to
  DAMAGED (`floodDamageBuilding`) with no BURNING-equivalent warning phase — flood isn't something a
  bucket brigade fights tile by tile, so the strategic response is where a building was put, not a
  scramble once the water's here. Each resident/worker the flood catches in a building it damages
  also rolls `FLOOD_DEATH_CHANCE` (3%) before being turned out — rare, and only for someone actually
  there — see `floodDamageBuilding`. A flood-damaged building's risk tier becomes its cosmetic
  `damageSeverity` (`floodDamageSeverity`: high→severe, medium→moderate, low→minor), which the 3D
  renderer reads for a waterlogged puddle, scattered debris, wall cracks and a leaning door scaled
  to match (`makeFloodDamageDecor`) — fire keeps its own plain damaged tint; this dressing is
  flood-only.
- **Cooldown.** A famine or flood that actually rolled true the year before halves *that hazard's
  own* chance this year (`FAMINE_COOLDOWN_FACTOR`/`FLOOD_COOLDOWN_FACTOR`, both 0.5) — tracked on
  `state.lastFamineYear`/`lastFloodYear`, compared against the current `state.year`. One year's grace
  only: two quiet years after either and the odds are back to full. Fire and Sickness are unaffected.

**DAMAGED is one state, shared by both causes.** `Building.damaged` gates occupancy/output exactly
once (`disabledByFire`, despite the name — it now means BURNING *or* DAMAGED) everywhere a building
can be worked, lived in, or stored in: `staffWanted`, the houses/shelters filters in
`assignHomesAndJobs` and `rehouseVillagers`, and `births`. `Building.damageReason` (`'fire' |
'flood'`) is carried purely so the inspect sheet can say which, and `Building.damageSeverity`
(flood only) purely for the 3D renderer's decor — neither changes any gameplay. Repair reuses the
ordinary construction pipeline (`pickSite`/`runBuilder`) against a smaller bill —
`REPAIR_FRACTION` (0.4) of the build cost and work, landing in `repairStore`/`repairProgress`
rather than the building's own `store`/`progress` — and finishes instantly and fully
(`finishRepair`) the moment it's paid, whatever put the building there. A DAMAGED barn or market
keeps its stock (`storageNodes`/`totalStored` still count it — nothing is deleted) but drops out of
`accessibleStorageNodes`, so nobody can fetch from or deliver to it until it's repaired.

## Progression system

Five tiers (`src/game/tiers.ts`): **settlement → hamlet → village → town → city**. The tier is
**computed live from the village as it stands** (`villageTier`), never stored or ratcheted — lose the
population or let a required building burn and the tier (and the right to build what it unlocked) goes
with it; what's already built stays. `TIER_META` sets each tier's `pop`, required `needs` buildings,
and (town, city) schooled-adult count. `BUILDING_TIER` (exhaustive `Record<BuildingType>`) gates each
building; `PATH_TIER_AT` gates roadwork. `tierChecks` shows the player exactly which requirement is
holding them back.

## Trading system

River merchants visit a built **Trading Post** (`requiresWaterFraction`). A `Merchant` runs a
lifecycle — `away → arriving → docked → leaving` — with an animated boat sailing the river.

- **Categories** (`MERCHANT_CATEGORIES`): basics, seeds, animals, foods, goods — one rolled per
  visit, stocked from `MERCHANT_CATEGORY_STOCK`.
- **Barter by value at parity**: `TRADE_VALUE` prices both sides; `MERCHANT_MARGIN` is 1 (any margin
  belongs in visible prices, not a hidden divisor). `basketTrade` settles a mixed basket.
- Arrivals roll on `MERCHANT_ARRIVAL_CHANCE` (a built post is the only requirement; staffing moves
  goods in/out via post `orders`, it doesn't summon boats). **Seeds** unlock crops (`SEED_COST`,
  one-time; Easy starts with one).

## Port system

The **Port** (city tier, deep-water quay, `requiresWaterFraction: 1/3`) adds **scheduled seasonal
fleets** on top of the river trade: four categories (`PORT_CATEGORIES` — grain / luxury / industrial /
general), one bound to each season (`PORT_SEASON_MERCHANT`), each rolling `PORT_ARRIVAL_CHANCE` (0.7)
to sail. Their holds are deeper than a river boat's, and they are the **only source of gold, dye and
silk** — the feed for the fine benches. The season→fleet binding is fixed (`PORT_SEASON_MERCHANT`),
so the luxury fleet calls once a year (summer); the winter general fleet carries a smaller luxury
top-up, and the `Harbour` panel shows the year's calendar (`portCalendar`) so a player can plan
around it. `portTradeCount` / `stats.portTradeValue` tally port trade.

## Luxury economy

A production chain layered on the base economy:

- A **Quarry** yields `sand` on `QUARRY_SAND_SHARE` (0.22) of its loads (instead of stone that trip).
- The **Luxury Workshop** runs one `LuxuryRecipe` bench at a time: `glass` (sand + coal) → `jewelry`
  (glass + iron) → and the fine bench's `finejewelry` (jewelry + gold) and `fineclothes` (dyed silk).
- The fine bench needs **imported** gold/dye/silk (port only). The fine goods are **export-only** —
  `finejewelry` and `fineclothes` are made to sell, never consumed by the village (a villager's only
  winter coat is a wool one; fine clothes are not eligible to wear).
- Value chain (`TRADE_VALUE`): sand 1 → glass 5 → jewelry 20 → fine jewelry 40; fine clothes 34.
  Every bench multiplies value, fine clothes included (dye 6 + silk 16 in → 34 out), so no step is a
  break-even chore. The `LuxuryRecipe` union is deliberately open for the chain to grow (e.g.
  furniture) as another bench, not a new building.

## Achievement system

**80 achievements** (`src/game/achievements.ts`), each bronze/silver/gold/platinum. The unlocked-id
set is **global and permanent** — stored in `localStorage` under `lv_achievements`, surviving new
games and reloads; a check only ever flips an achievement *on*. Checks read the **live state** for
"is it true now" facts and the per-village lifetime tallies (`GameState.stats` /`VillageStats`, saved
with the village) for peaks and cumulatives (a village that hit 300 pop and crashed still earned it).
`evaluateAchievements` runs at season turnover and returns the newly earned ones to celebrate.

## Save / load system

`localStorage`, **3 slots** (`little-village-save-v12-slot<N>`) plus a one-time legacy-key migration.
Saves are a version envelope `{ v, state }`:

- `VERSION` is **14**; `MIN_VERSION` is 12. Loads from the future or below `MIN_VERSION` are refused.
- **Two upgrade mechanisms**: numbered `MIGRATIONS` keyed by the version they upgrade *from* (walked
  in order), plus **load-time field defaults** for optional fields added without a version bump.
  Migrations must stay narrow and never reach for a live constant that might move (see the frozen
  `LEGACY_BUILD_TIME` / `ageScale` / `workScale` rescalers). The legacy rescalers only fire when
  their stamp field is absent, so `newGame` stamps **both** `ageScale` and `workScale` — a current
  save must never be mistaken for a pre-rescale one, or its in-progress construction gets inflated.
- **New fields get safe defaults, not holes.** `stats` is merged onto a fresh full `freshStats()` on
  load (`mergeStats`), so a `VillageStats` field added later reads as a real `0`/`false`/`[]` on
  every old save instead of turning to `NaN` at the next turnover. `limits` defaults to `{}`
  (no caps). `nextId` is clamped past every existing id so a post-load spawn can't collide.
- **Save-time guard.** `saveGame` refuses a structurally unsound state (`validState`) and returns a
  boolean, so autosave can never overwrite a good save on disk with a half-built/corrupt one, and a
  failed write (full/blocked storage) surfaces to the player instead of silently dropping saves.
- **Overwrites reclaim their own space.** Writing a slot goes through `writeSlot`, which on a
  `QuotaExceededError` drops the target key (its bytes are being replaced anyway) and retries once —
  so overwriting an existing save (a manual slot, or the rolling autosave slot) only has to fit in
  the space its predecessor already held and does not fail against a near-full store. This is what
  makes "a save always overwrites the one it replaces" hold in practice.
- **The whole state is written** — transient-looking per-citizen fields (nav cache, partial `pending`
  loads, survival counters) included. A save must reproduce the *running* village exactly: dropping
  even the pure nav cache shifts path timing on reload and diverges the shared RNG stream from an
  uninterrupted run, which the "survives a save and load" determinism spec pins down.
- Autosave writes the current slot every **5 minutes** (`AUTOSAVE_SECONDS`, real-clock). Manual
  saves and the game-over write are immediate. Slot **names** are stored beside the save (`…-name`),
  not inside it. Achievement unlocks are stored separately and are *not* part of a slot.

## UI architecture

DOM-based, not canvas-drawn. `index.html` provides the scaffold (HUD chips, toolbar, panels); `ui.ts`
builds and refreshes them every `UI_REFRESH_MS` (100 ms) from the frame loop. Surfaces include: the
top HUD (resource chips + food total, people/ages, clock, health/happiness meters, low-stock/cap
indicators), the build toolbar (categories → building pop-outs), per-building **inspect** panels
(workers, stores, ranch/farm/trading controls), the **job board** (per-profession staffing +
Builders/Laborers), the **trade overlay**, the **Codex** (rules reference), the **stockpile limits**
panel, the **Town Hall** (policies / ledger / festival), the **achievements** panel, and the
**save/load** slot menus. Camera **rotate buttons** show only in 3D.

## Testing architecture

**Playwright**, config `playwright.config.ts`. The `webServer` runs `npm run build && npm run
preview` on port 4173 under `/mobile-game/`; `worker: 1`, `fullyParallel: false`, `retries: 0`.
**325 tests across 8 specs** (`newgame` 250, `menus` 19, `disasters` 16, `world` 14, `achievements` 8,
`updates` 8, `save` 7, `speed` 3), **105 tagged `@slow`**. Scripts: `test` (all), `test:fast`
(`--grep-invert @slow`), `test:slow`.

- **Two lanes.** Headless Chromium renders the 3D view in software at ~2 fps, and Playwright's click
  actionability waits on animation frames — so UI/click-driven specs open on **`?2d&gfx=low`** to run
  fast, and only specs asserting about the 3D renderer stay in 3D.
- **Determinism & the debug hook.** Tests drive `window.__village` (`startNewGame` with `disasters:
  false` for economy tests, `debugAdvance`, `debugPlace`, and `debugFoodPerCitizen` /
  `debugHeatPerCitizen` / `debugBuildTime` / `debugJobCount` — **ask the game for a tuned number,
  never hard-code it into the test**). Stand a villager where the work is (`debugWorkSpot`) rather
  than measuring how far the barn randomly landed. Step *just past* a season boundary, never exactly
  on it. Don't flood a barn to full (a worker holding a load with nowhere to put it looks like
  stopped production).
- CI: `.github/workflows/test.yml` runs the full suite on every push to `main` and every PR (~20 min).
- **`sim-tests/`** (`npm run test:sim`, `tsx --test sim-tests/*.test.ts`) drives `update()` directly in
  Node — no browser, no renderer, no Playwright. It's the concrete example of the engine-independence
  principle in "Unity migration architecture": pure simulation-in, assertions-on-`GameState`-out, so it
  will still make sense once there's a second (Unity) presentation layer reading the same sim. Prefer
  it over a Playwright spec for a pure economy/logic assertion that doesn't need a rendered frame.

## Important balance constants

All in `src/types.ts` unless noted. These are the primary dials.

| Constant | Value | Meaning |
|---|---|---|
| `SEASON_LENGTH` / `YEAR_LENGTH` | 600 s / 2400 s | 10 real min per season at 1×. |
| `AGE_PER_YEAR` | 4 | Human-years aged per calendar year. |
| `ADULT_AGE` | 16 | Childhood ends; `SCHOOL_START_AGE` 12, leaving 16, +1 university year. |
| `CONSUMPTION_SLOWDOWN` | 3 | Divides food & fuel drain (the big recent economy dial). |
| `FOOD_PER_CITIZEN_PER_SEASON` | 20 | Adult ration/season (`CHILD_FOOD_FACTOR` 0.5). |
| `HEAT_PER_CITIZEN_WINTER` | ~13.3 | Winter heat units/season (firewood=1, coal=2). |
| `CLOTHING_PER_CITIZEN_WINTER` / `TOOL_WEAR_PER_WORKER` | 2 / 1 | Coats worn per season; tool wear anchor (≈1 tool per worker-season of *actual* labour — billed per work cycle / builder-work, not by headcount at the season turn). |
| `STARVE_SECONDS` / `FREEZE_SECONDS` | SEASON/3 | Grace before hunger/cold kills. |
| `BARN_CAPACITY` / `MARKET_CAPACITY` | 5000 / 2000 | Storage volume. |
| `CARRY_VOLUME` | 12 | One hauling trip's volume. |
| `BUILD_WORK_RATE` / `BUILDER_SHIFT_WORK` | 1 / 30 | Construction pace & shift length. |
| `BIRTH_CHANCE` | 0.5 | Base per-season birth chance (needs a house + surplus). |
| `HOUSING_PER_HOUSE` / `STONE_HOUSE_CAPACITY` / `SHELTER_CAPACITY` | 8 / 10 / 18 | Housing. |
| `IMMIGRATION_CHANCE` / `NOMAD_SURPLUS_SEASONS` | 0.25 / 4.5 | Nomad arrivals. |
| `DISEASE_CHANCE` / `FIRE_CHANCE` | 0.06 / 0.05 | Per-season disaster rolls. |
| `FAMINE_CHANCE_PER_SUMMER` / `FAMINE_PENALTY` | 0.18 / 0.5, 0.25 | Famine odds; moderate/severe crop-yield factor. |
| `FLOOD_CHANCE_PER_SPRING` / `FLOOD_RISK_RADIUS` | 0.18 / 6 tiles | Flood odds; how far from water it can reach. |
| `MERCHANT_ARRIVAL_CHANCE` / `PORT_ARRIVAL_CHANCE` | 0.5 / 0.7 | Trade cadence. |
| `MERCHANT_MARGIN` | 1 | Trades settle at parity. |
| `REFUND_FRACTION` / `DEMO_WORK_FRACTION` | 0.25 / 0.5 | Demolition. |

Production per worker/season lives in the `// ---- Production` block (`GATHER_FOOD_PER_SEASON`,
`FARM_FOOD_PER_WORKER` 320, `SMITH_IRON_TOOLS_OUT`, etc.); starting stock in `DIFFICULTY_RESOURCES`.

## Coding conventions

- **Comment the *why*.** This codebase documents intent heavily in-line; match that density and voice.
- **Table-driven and exhaustive.** New buildings/resources/tiers go in the `Record<…>` tables
  (`BUILDING_DEFS`, `BUILDING_TIER`, `RESOURCE_ICON`, …); the exhaustive `Record` is what forces the
  decision (e.g. a new building *must* be assigned a tier). Note `RESOURCE_KINDS`/`BUILD_ORDER` are
  hand-ordered display lists — keep them in sync (tests assert `RESOURCE_KINDS` against
  `RESOURCE_ICON`).
- **Compute, don't store, derived facts** (tiers, roles, radii) so they follow the live village.
- **Go through the helpers**: `footprintW/H`, `entranceTile(s)`, `workCentre`, `carryLimit`,
  `dwellingCapacityOf` — never read `def.w`/`def.h` directly for a placed building.
- **Seeded RNG only** (`rand`/`randInt` on the state's stream) inside the simulation — never
  `Math.random()`; it breaks reproducibility and flakes tests.
- **Save changes**: bump `VERSION` + add a `MIGRATIONS` step, or add a load-time default; keep
  migrations frozen against live constants.
- **TypeScript strict**; `tsc --noEmit` + `npm run build` must stay clean.
- **Commits** end with the `Co-Authored-By` / `Claude-Session` footer; never put the model ID in any
  committed artifact.
- **Models**: after any `BUILDING_DEFS` `w`/`h` change, run `python3 tools/models/check.py` (it fails
  on a model that no longer fits its plot).

## Rules for modifying existing systems

> **Before modifying an existing system, inspect the current implementation and extend it rather than
> creating duplicate systems.**

In practice for this codebase:

- A new building, resource, crop, animal, recipe, policy, tier, or achievement is a **table entry**
  (and its bench/behaviour an arm of an existing `switch`), not a new system. The unions
  (`LuxuryRecipe`, `MerchantCategory`, `BuildingType`, …) are written to grow.
- New behaviour on a citizen extends the `runCitizen` task machine and the `update()` pipeline; new
  economy flows extend `consume`/storage/the ledger — don't add a parallel loop that re-walks the
  same citizens or barns.
- Balance changes are one-line edits to the constants in `src/types.ts`; prefer turning a dial to
  adding code, and treat anything economy-shaped as needing playtesting (see `PLAYTEST.md`).
- Don't recompute what a helper already gives you, and don't store what should be computed live.
- When in doubt about whether something exists, grep the tables and helpers first — most "new"
  features are already scaffolded.

See also: `ROADMAP.md` (what's planned) and `PLAYTEST.md` (known issues and their status).
