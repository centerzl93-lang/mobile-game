# Session Handoff — Little Village (Village-Builder PWA)

> Living doc. Update the **State** and **Next steps** sections at the end of each session.
> Last updated: 2026-08-02 (landscape play, and building footprints; see Current State)

## Project
**Little Village** — an original 3D village-builder **PWA**: TypeScript + Three.js (v0.185.1) +
Vite + vite-plugin-pwa, installable on iPhone, deployed to GitHub Pages.

- **Repo:** `centerzl93-lang/mobile-game`
- **Working branch:** `claude/banished-ios-app-b4zott` (only push here; don't open PRs unless
  asked). Earlier sessions used `claude/game-opportunities-impl-8qxrqc` /
  `claude/hud-workers-building-updates-32npee`; all share the same history.
  **Push here specifically, whatever branch a session is told to develop on** — this is the only
  non-`main` branch in the `branches:` trigger of *both* `.github/workflows/deploy.yml` and
  `test.yml`, so it is the only one where a push actually deploys to Pages and runs CI. Work
  pushed to a session-named branch is safe but invisible: no site update, no test run, no signal.
  The footprint session was told to develop on `claude/banished-ios-handoff-ejj6dh` and the player
  chose to publish from here instead of widening the triggers.
- **Asset rule:** CC0/permissive only — never any commercial game's copyrighted assets.

## Current State
Latest work: **landscape play** and, before it, **building footprints** — both this session.
Earlier, **confirm-before-apply, live rehousing, implicit inspect**, the **storage/job-board/naming pass**,
the **household model**, the **opportunities pass**, the **HUD / UX pass**, then the **jobs board
overhaul** — further down.

### Landscape (this session)
The player asked to play on a phone held sideways, and reported that rotating distorted the
picture and that rotating back left it distorted.

**The distortion was a stale resize, and the fix is to stop listening for one.** `resize()` ran
only from the `window.resize` event. On iOS a rotation fires that event *before* the layout has
settled, so the handler read the pre-rotation width and height, sized the drawing buffer to a
portrait shape, and no second event ever arrived to correct it — the buffer then stretched to
fill a landscape canvas. Rotating back was no better, because that event is stale too. `resize()`
is now called at the top of every frame and returns immediately unless the canvas box actually
moved, so it needs no event and nothing can arrive too early.

Measured with a probe that compares the buffer's aspect to the CSS box's — their ratio *is* the
stretch. Before: **0.214** in landscape (a 390x844 buffer in an 844x390 box, so nearly 5x). After:
**1.000** at every step of portrait → landscape → portrait → landscape.

A warning for whoever tests this next: Playwright's `setViewportSize` fires a clean, correctly
sized resize event, so it does **not** reproduce the bug — the first version of that probe passed
against the broken code and proved nothing. Reshape the canvas *without* a resize event (set
`#app`'s width/height directly) to get the real failure.

**Layout.** The manifest asks for `orientation: 'landscape'` (installed app only; a browser tab
still follows the phone's rotation lock, so the CSS is an adaptation and not an assumption). A
`@media (orientation: landscape) and (max-height: 540px)` block spends width, which is now
plentiful, to buy back height: tighter HUD chips and toolbar, and two changes worth knowing about
because both were bugs the first time round —

- **The inspect sheet becomes a right-hand column.** At `42vh` of a 390px screen it was a 160px
  slot still covering the middle of the map. It is inset to `right: 60px` so it clears the
  control stack, which keeps its own column down that edge — at `8px` it sat straight on top of it.
- **The hint moves to the top, under the HUD.** Portrait lifts it above the build pop-out; doing
  the same in landscape put it in the middle of the screen, which is exactly where the placement
  controls sit while you site a building. `elementFromPoint` at the hint's centre returned
  `.rs-actions`, not the hint. At the top there is nothing to collide with and `raised` is a no-op.

**The Playwright viewport is now landscape** (844x390), because that is how the game is played and
it is the shape where the chrome crowds the map. All 24 UI-layout tests pass on it, plus menus.

### Building footprints (this session)
The player asked for varied building sizes so the village stops reading as one repeated cottage,
plus larger maps so the density stays similar. Done: the maps, the footprints, the models that had
to be redrawn to fit them, and the fallout.

**Maps.** Small 48 -> **72** tiles a side, medium 96 -> **144**; large stays 192. `MAP_SIZES` in
`src/types.ts`.

**Footprints.** `BUILDING_DEFS` now carries the player's table:

| Building | Plot | | Building | Plot | | Building | Plot |
|---|---|---|---|---|---|---|---|
| House | 2x2 | | Herbalist | 3x3 | | School | 3x4 |
| Stone House | 2x2 | | Blacksmith | 3x3 | | Fishing Dock | 3x5 |
| Well | 1x1 | | Tailor | 3x3 | | Market | 4x4 |
| Cemetery | 2x2 | | Hunting Cabin | 3x3 | | Tavern | 4x4 |
| Storage Barn | 3x3 | | Wood Cutter | 3x3 | | Hospital | 4x5 |
| Gatherer's Hut | 3x3 | | Forester Lodge | 3x3 | | Chapel | 4x5 |
| Mine | 6x6 | | Quarry | 8x8 | | Trading Post | 5x9 |

House, stone house, well and cemetery keep the sizes they had; the field and the pen stay
player-sized (4x4-8x8) and so are absent from the table.

**Models.** Every resized building was **re-authored at its new plot**, not scaled: a 3x3 workshop
is a bigger shop plus a wider working bay, not a 2x2 rendered at 150%. This was the bulk of the
work, and it had to land in the same commit as the footprints — `normalize()`
(`src/render/models.ts`) fits a model's longest axis to 1 and `makeBuildingModel`
(`src/render/renderer3d.ts`) multiplies by `max(def.w, def.h)`, so a model authored at the wrong
aspect ratio overhangs its plot with all its detail at the wrong scale.

What changed structurally, building by building: the market became a *square* with a covered
market cross in the middle (it used to be the flattest thing on the map and read from above as
paving); the trading post became a warehouse and counting house at the landward end with a
five-tile wharf and a derrick running out from them; the mine became a yard with a tramway,
winding house and ore carts around the adit; the quarry gained two more benches and a second tool
shed; the chapel's tower carries a spire that is the tallest thing in the village; the forester
got a third nursery bed of seven; the herbalist three physic beds; the hospital a real cross wing.

**Texture density is automatic, but only for surfaces.** `finish()` in `tools/models/common.py`
cube-projects UVs at world scale (`UV_WORLD_SCALE = 1.0`, one repeat per tile), so wall and roof
*maps* keep their texel density as a building grows with no work at all. What did **not** scale
was anything built from a hard-coded count of parts — a roof of `rows=8` shingle courses over a
wider roof is eight *bigger* shakes. Those now derive their count from their own geometry:
`courses()` in `style.py` (`COURSE_PITCH` 0.21, `THATCH_PITCH` 0.19) drives `shingled_roof`,
`lean_to`, `_thatch`, `_ridge_x`; the barn's board-and-batten and the hunting cabin's log courses
count from a fixed pitch the same way. **Add nothing to this codebase with a hard-coded row
count** — it is the trap the whole session was spent climbing out of.

**`tools/models/check.py` is new and is how you verify this.** It reads `BUILDING_DEFS`, measures
every built `.gltf`, and reports what the game will actually draw:

```
python3 tools/models/check.py            # every building
python3 tools/models/check.py school     # just one
```

It exits non-zero when a model does not fit its plot, so a footprint change that outruns its model
fails loudly instead of shipping a building overhanging its neighbours. The `height` column is the
rendered height in tiles: the house is the reference at **2.46**, and the player's height column
reads against that — everything marked "2" lands 2.2-2.9, the mine ("3") at 3.73, the chapel
("5") at 5.93.

Every building was also **looked at** at `?gfx=high`, in rows of five on flat ground and then one
at a time beside a house for scale. Two things that only a screenshot catches, both worth knowing
before writing the next driver: `canPlace` charges for materials, so clearing `s.buildings` to
tidy the shot removes the barn and every placement then fails on cost — keep the barn and stock
it. And models stream in *after* the first frame, so a building placed too early keeps the flat
fallback box permanently; wait on `renderer.models.loadedCount` before placing or the shot lies
to you. The overview camera sits 54° above the horizon, which foreshortens height so badly that
the chapel spire and the quarry's benches are unreadable — drop `camera.pitch` to ~0.4 to judge
anything vertical.

**`nearbyStone` was silently broken by this and is fixed** (`src/game/buildings.ts`). It counted
rock in a fixed box around a building's *centre*, which was the same as "around its edge" while
every workplace was 2x2 — but an 8x8 quarry's centre is four tiles from its own wall, so a
radius-4 scan saw nothing but the pit. No tile under a building can be rock, so it would have read
zero everywhere: the quarry's mountainside bonus unreachable, and the **mine pinned at its 0.15
yield floor wherever it was dug**. The radius is now measured out from the footprint edge. Nothing
else scales off a footprint like this — `forestInCircle` and `nearbyWater` are circles centred on
the building and degrade gracefully — but it is the first thing to check if another building grows.

**Test fallout.** `tests/world.spec.ts`: the rotation/door test used the quarry for its asymmetry
and the quarry is square now, so it uses the **school (3x4)** instead; the mine/quarry terrain test
scans 6x6 and 8x8 sites, and asserts the mine is refused *for the foothill rule specifically*
rather than merely refused. `tests/newgame.spec.ts`: the clearing-land tests and the quarry yield
test now ask the game for the footprint via a new **`debugFootprint(type)`** hook instead of
hard-coding it — use that in any new test that lays out a site. Both specs' site scans were relaxed
from "all grass" to "grass or forest", which is what the rule under test actually needs (a build
site fells what stands on it) and which matters far more now that a clearing has to be 64 tiles.

The two failures that were *not* obvious both came from the same buried assumption — **a tile the
test believed was outside a building was inside the 3x3 barn**. `s.buildings.some(b => x < b.x +
(b.w ?? 2) …)` appeared twice in `newgame.spec.ts`: `b.w` is only ever set on the ranch and the
field, so the `?? 2` fallback silently claimed every other building was 2x2, and a path planned
under the barn is one no laborer can ever lay. `world.spec.ts` picked its "near" harvest tile as
`barn.x + 2, barn.y + 2`, one clear tile past a 2x2 barn and the corner of a 3x3 one; `pickHarvest`
only returns reachable tiles, so it silently answered with the far tile instead. Both now derive
the footprint from the game. **Grep for `?? 2` before changing a footprint again** — it is the
shape this bug takes.

**Placement was measured, not assumed** — the previous handoff flagged the 5x9 trading post as the
thing most likely to become unplaceable, since a third of its 45 tiles must be water and its door
must still land on walkable ground. Counting every legal site at every rotation across three
generated worlds per map size: on a **small** (72-tile) map the trading post has **585-776** sites,
the 8x8 quarry 1458-2140, the 6x6 mine 261-304 (foothills are the constraint, as intended), the 3x5
fishing dock 290-330. Nothing is scarce. The larger maps are what bought that, and it is why
`MAP_SIZES` and the footprints belong to the same piece of work.

**Costs are unchanged, by design.** An 8x8 quarry still costs 30 wood and a 3x3 barn still costs
16. Whether that is right is a balance question for the player, not something to fix silently —
see Next steps.

### Confirm-before-apply, live rehousing, implicit inspect (previous session)
- **Inspect is the resting state, not a button.** The toolbar is now
  `housing food resources civic trade paths harvest demolish` — no `inspect`. `toggleCategory`
  closing a category clears the active tool, which *is* inspect mode, so tapping the open category
  again returns you to tapping things to look at them. One fewer button and one fewer way to be in
  a mode you didn't mean to be in.
- **Paths and demolition confirm before they apply.** Drawing a path drags out `pendingPaths`
  (tile indices held on the state, saved and reloaded) and raises a confirm bar —
  "N path tiles drawn | Cancel | Place". `buildPath` skips any tile still pending, so builders
  cannot start on a route the player hasn't committed to. Demolish likewise only *selects*
  (`pendingDemolish`) and shows "Demolish House? | Cancel | Demolish". The one exemption is
  un-marking a harvest tile, which is itself the undo of a free action and doesn't want a prompt.
  The bar is refreshed from the frame loop (`refreshConfirmBar`) so it tracks a drag in progress.
- **Villagers relocate whenever an opportunity appears**, not at the season turn.
  `rehouseVillagers` now runs every `REHOUSE_INTERVAL` (2s of game time) off `s.rehouseTimer`
  instead of once per season. Measured: a newly finished house is occupied within **2 seconds**
  where it used to wait up to a full 600s season. This is what makes "build a house" feel like a
  lever the player is pulling rather than a bet on the next season.
  **Test caveat:** three larder/heat tests assumed villagers stayed put in the one stocked house
  and started failing because rehousing spread them into the empty houses the tests create. The fix
  is to pin the setup — `burnEntering` and the eat-and-heat test strip every other house
  (`s.buildings.filter(b => b.id === picked.b.id || !isHouse(b.type))`), and the shortage test trims
  the stocked household to its couple so nobody is surplus. Any future test that cares *which* house
  a villager is in must do the same.

### Storage, job board, names, HUD, difficulty (previous session)
- **Storage is volume too.** `barnLoad` measures `units × RESOURCE_VOLUME`, `barnFree` returns
  volume, and `unitsThatFit(kind, volume)` converts back wherever goods are put down (`addNearest`,
  the market vendor). `BARN_CAPACITY`/`MARKET_CAPACITY` are unchanged numbers reinterpreted as
  space, so bulky storage is exactly what it always was and a barn now takes 20000 grain rather
  than 5000. The barn sheet reads "Space used 25 / 5000 (100 items)".
- **Job board lists every job from the first day.** Placed workplaces first (with their names and
  worker steppers), then a muted "Not built yet" section for every remaining workplace type with
  its worker cap and build cost.
- **Workplaces are named.** `Building.name`, auto-assigned at placement by `nextBuildingName`
  ("Woodcutter 1", "Woodcutter 2" — lowest *unused* index, so demolishing and rebuilding reuses the
  number). Editable from the inspect sheet; blank restores the default. Only types with jobs get a
  name (`isWorkplace`), so barns and houses are unaffected. Old saves are numbered on load.
  Note the inspect signature includes the name, so a rename re-renders but typing does not.
- **HUD:** the 👤 population/housing and 👷 free-laborer chips are gone. The laborer count still
  lives on the job board, which is where workers are assigned anyway.
- **Normal and Hard start with no wood or stone.** Hard now differs by halving everything else
  rather than by materials. Several tests placed buildings they could no longer afford — where a
  test is about terrain or seeds rather than cost, it now stocks the barn first.

### Household assignment fixes (previous session)
Player report: children all ended up in one house and the population got stuck.

- **Children must live with an adult.** `placeChild` only ever considers houses that already hold
  a grown-up, and `placeChildrenWithAdults` runs at the end of `rehouseVillagers` to repair any
  child left behind by the adult moves above. A house of nothing but children raises nobody, bears
  nobody, and parks a chunk of the village's housing where it can do no good.
- **Children spread instead of piling up.** The old homeless-child path was
  `houses.find(hasRoom)` — literally the first house in the list — so the four founding children
  (who have no recorded `parents`) all landed together, in a house with no adult, and nothing ever
  moved them. `placeChild` now prefers a parent's household, then whichever eligible household has
  the *fewest* children.
- **`placeAdult` prefers an empty house, and no longer strands couples.** Order is now: the
  partner's home when they keep it alone → **an empty house** → (only if the mover is still single)
  a house with one lone unpartnered non-kin adult of the opposite sex → crowding, homeless only.
  Sending a *partnered* villager to move in with an unrelated single used to put two half-households
  under one roof while both partners lived elsewhere.

Measured over 16 seasons: zero children in adultless houses and zero homeless children in all of
easy/no-extra-houses, easy/10-houses and normal/6-houses; households read as families
(`2a/5k 2a/4k 2a/6k …`); population 12→41 with housing, 12→24 and correctly capped without.

### Volume hauling, build stamp, housing-prompt fix (previous session)

- **Hauling is volume-based.** `CARRY_VOLUME` (12) is the space in a villager's arms and
  `RESOURCE_VOLUME` gives each resource a size, read through `carryLimit(kind, volume?)`. A log is
  volume 1 (twelve per trip, exactly as before) and a crop is 0.25 (forty-eight). **Nothing carries
  worse than it did** under the old flat count — bulky goods sit at the volume-1 baseline and only
  compact goods gain — which keeps this a pure improvement rather than a rebalance.
  This is what fixes farming: an 8×8 field yields ~2560 units, which at twelve per trip took years
  to bring in and now clears in about a season. `LARDER_CARRY_VOLUME` stays at ×3: trimming it once
  food got denser would have *reduced* firewood per grocery run (firewood is volume 1) and broken
  larder stocking for the one thing that must be home before winter. Larders now converge to 100%
  of target on every kind. **Storage is still counted in units** (`BARN_CAPACITY`) — making barns
  volume-based too is the obvious follow-up, deliberately not done here.
- **Build stamp on the main menu.** `__BUILD_STAMP__` is injected by `define` in vite.config.ts as
  `v<major>.<minor>.<commit count> · <short sha> · <date>`, rendered under the menu buttons. The
  patch is the **commit count**, so it rises by itself on every push — nothing to remember to bump
  and no way for it to drift from what is deployed. **CI must check out full history**
  (`fetch-depth: 0`, set in both workflows): a shallow clone counts only what it has, and would show
  a *lower* number than the previous deploy, which is exactly the confusion this removes. A shallow
  build is detected and stamps `?` rather than a plausible-but-wrong number. Needed `@types/node`
  (the config reads package.json and shells out to git) and `"node"` in tsconfig `types`.
- **No housing prompt — by design.** A seasonal "N couples are waiting for a home" warning was
  built and then **deliberately removed**: spotting that houses are the bottleneck is the player's
  job, not something the game announces. Do not re-add it. The state stays *discoverable* — a
  villager's inspect sheet shows `Partner · 🏠 needs a home` via the still-exported
  `coupleNeedsAHome` — but nothing is pushed at the player.
  While that prompt existed it exposed a real bug that **is** still fixed: `rehouseVillagers`
  bailed out early when the village had no houses, so on Normal and Hard (which start with *zero*)
  nobody ever paired at all. Pairing now runs regardless of housing, so a waiting couple moves in
  the moment a house is built instead of losing a further season to pairing lag.

### Household model (previous session)
Player feedback after the opportunities pass: breeding was still too slow. The fix was structural,
not a rate tweak. **A house is now one couple plus their children.**

- **Capacity 8** (`HOUSING_PER_HOUSE` 4 → 8, `STONE_HOUSE_CAPACITY` 5 → 10). A birth needs room
  under capacity, so at 4 a couple was full after two children and never bore another.
- **Explicit partnerships.** `Citizen.partnerId` (mutual, both directions) and `Citizen.parents`
  (the couple whose household they were born into). `formCouples` pairs unpartnered adults sharing
  a house, fertile first; `releaseLostPartners` + `removeCitizen` widow the survivor so they can
  pair again.
- **`areCloseKin` — do not remove.** Grown children pile up at home whenever the village has no
  spare house. Without a kinship check `formCouples` happily pairs two siblings with each other,
  who then occupy their parents' house as a second "couple" and bear children there. The same check
  gates `placeAdult`'s tier 1, so nobody is sent to pair with a sibling who already moved out.
- **One couple per house.** `rehouseVillagers` finds the household's couple (`householdCouple`) and
  moves every *other* adult out — a grown child, a spare founder, a widowed lodger. Couples are
  never split: a partner is never the one asked to leave.
- **`placeAdult` tiers, and why tier 3 is opt-in.** (1) a house with one lone unpartnered
  non-kin adult of the opposite sex, (2) an empty house, (3) *only* with `allowCrowding` — anywhere
  with room, used just for the homeless. Without that restriction a surplus adult in a village with
  no spare house shuffles into another household every season, is surplus there too, and churns
  forever. Staying put until the player builds is the correct end state.
- **Children stay with their parents** until they come of age, then `placeAdult` moves them out.
  A homeless child (house burned down) follows a parent via `Citizen.parents` in
  `assignHomesAndJobs`.
- **Births come from the household couple** — a partnered pair, both resident, both fertile.
  Housemates who never paired do not breed.
- **Pairing does not wait for housing.** `formCouples` matches housemates first (at most one pair
  per house — a house is one household) and then everyone still single *village-wide*. A couple with
  nowhere to live still forms; they simply cannot set up a household or bear children until a house
  is free. `houseCouplesTogether` moves a new couple into one partner's home when they live there
  alone, else an empty house, never into a house that already has a household.
  `coupleNeedsAHome` marks a couple that is living apart *or* lodging in someone else's house, and
  `warnOfShortfalls` reports the count each season ("🏠 3 couples are waiting for a home of their
  own — build houses"); the citizen inspect flags it too. This is the point: a housing shortage now
  shows up as named demand the player can act on rather than a village of singles that quietly
  stops growing. Measured with only the 3 starter houses: 6 couples but 3 households, 0 pairable
  singles left, and the prompt firing every season.
- **`larderHauler` prefers idle hands** (free laborer > builder > employed). Picking purely by id
  handed the shopping to whoever was lowest-numbered, often someone staffing a workplace, who then
  abandoned their post — this is what made the trading-post test flake.
- **`LARDER_CARRY_CAP` = `CARRY_CAP` × 3.** A household eats its whole larder every season, so its
  one shopper must haul that much again just to break even. At `CARRY_CAP` an eight-person house
  needed ~20 round trips a season, which does not fit in a season: larders sat near-empty forever
  while still costing a villager their working day. Verified converging at ×3.
- Citizen inspect shows Partner / Children / Parents so the model is legible in-game.

Measured under generous conditions (spare housing, full barns, disasters off): **12 → 49 over five
years**, 11 couples, zero broken links, zero couples living apart, zero kin pairings, no house with
two couples, and every child living with a parent.

### Opportunities pass (previous session)
Worked from a player-supplied priority list. All eleven items landed; 68 tests green.

- **Household larders (P0).** Houses keep their residents' food, firewood and medicine
  (`HOUSE_LARDER_SEASONS` = 0.5 per resident — a buffer, not self-sufficiency; 1.0 makes a household
  independent for a season but ties its shopper up hauling for most of it). One resident per house —
  the lowest-id able adult (`larderHauler`) — runs errands via a new `toLarder` task and
  `stockLarder`, which must sit *ahead* of the job dispatch in `runCitizen` or `runWorker` treats
  the groceries as production and carries them back to a barn. Consumption draws larder-first, then
  barns. Larders are deliberately **not** `storageNodes`, which is what keeps them out of the HUD;
  helpers `totalAvailable` / `totalFoodAvailable` / `foodVarietyAvailable` (`storage.ts`) are the
  larder-inclusive counterparts used by warnings, wellbeing and the birth gate. A demolished or burned
  house returns its larder to the barns (`removeBuilding`).
- **Shortages target the villagers who went short.** Food and fuel are consumed per citizen, so
  `killFrom(s, candidates, n)` draws its victims (eldest first, as before) from the specific
  villagers left without — otherwise stocking a larder would not save your household. `killCitizens`
  is now a thin wrapper passing the whole population.
- **Villager breeding (P0).** Three structural blocks, not tuning: starter houses held four adults
  (at capacity ⇒ never room for a child), grown children never moved out, and the food gate read
  barn stock only (larders made a comfortable village read as famine). Fixes: `rehouseVillagers`
  runs each season and moves every adult past a household's couple out; `placeAdult` places new
  adults preferring **a house with a single unpartnered adult of the opposite sex**, then an empty
  house, then anywhere — sending them to the *emptiest* house instead scatters them one per house
  where they never pair up and growth stalls just as hard. Plus a fertile window
  (`FERTILE_MIN_AGE` 6 … `FERTILE_MAX_AGE` 34), `BIRTH_CHANCE` 0.35 → 0.55, and a chance scaling
  with food surplus (`BIRTH_FOOD_SURPLUS_TARGET`) and health/happiness. Measured: flat at 12 → 26
  over five years under generous conditions.
- **Hold-to-rotate (P0).** The corner buttons are held (`ROTATE_SPEED` 45°/s, applied in the frame
  loop off real time so it works while paused) rather than jumping 45° per tap. `setPointerCapture`
  keeps the hold alive if the finger drifts off; pointercancel/window-blur release it. **The
  direction was already correct** and matches the glyphs — yaw runs +Z→+X and the camera orbits
  opposite to the apparent scene motion, so ↺ (yaw down) reads as the village turning
  counter-clockwise. The discrete jump was what made it read as flipped.
- **Year-round burn rates (P1).** `SEASON_BURN` — winter 1.0 (the anchor, unchanged), spring/autumn
  0.45, summer 0.15 — applies to both firewood and clothing, so the *annual* bill is higher than
  before (only winter used to charge). Clothing is issued first; a villager who got a ration is
  `clothed` (transient, never saved) and burns `CLOTHED_HEAT_FACTOR` (0.75) of the fuel. Only a
  winter shortfall is lethal.
- **Paths own their tiles (P1).** `planPath` refuses a tile under a building; `placeBuilding` tears
  up any path under its footprint (`clearPathsUnder`, bumping `navVersion` when a bridge goes);
  `regrowForest` and `plantCircle` skip path tiles; and laying a path over forest clears the trees
  via `clearGroundForPath`, crediting the wood and loose stone to the barns rather than destroying
  them.
- **Quarry (P1).** A fixed **3×6** pit (of the two sizes suggested, 3×6 places reliably on a 48×48
  small map where 4×8 often will not fit), `requiresAdjacent: ['stone']` dropped so it goes anywhere
  on buildable ground, cost/buildTime scaled up (wood 12→30, buildTime 7→14, jobs 2→4). Yield had to
  change with it: `factorStone` would drop an inland quarry to `MIN_FACTOR` (15%), making "anywhere"
  a lie, so `quarryRichness` pays the base rate anywhere and adds `QUARRY_ROCK_BONUS` (+50%) against
  a mountainside. The mine is untouched and still needs a foothill seam.
- **HUD (P1).** `HUD_RESOURCES` is now an explicit eight (wood, stone, iron, coal, tools, clothing,
  medicine, firewood) plus the aggregate food chip; leather and the livestock herds came off the
  line and remain in the barn sheet and trading post. Note nine chips still wrap to two rows at
  430px — one row cannot fit them.
- **Season phases (P1).** `seasonLabel` / `seasonPhaseOf` give Early / plain / Late by thirds, so
  ten-minute seasons tell the player how long they have to prepare.
- **Village history (P2).** `GameState.events` — a capped (`EVENT_LOG_MAX` 250) newest-first
  chronicle, written by `recordEvent` from `Game.log` (the single logging entry point, so the
  scrollback always matches the toasts). A 📜 side panel (`#history`, `refreshHistory`) groups it by
  season; it rides along in the save with a load-time default.
- **Inspect × / hints (P1).** The × called `ui.hideInspect()`, which hid the node but left
  `Game.inspectSel` set, so the frame loop re-rendered it next frame. New `onCloseInspect` callback
  clears the selection; the demolish/harvest/build/path tool switches had the same bug and now route
  through it. `#hint` and `#log` had no z-index and painted under `#toolbar`/`#popout` (both 6) —
  now 8, and they lift above the build pop-out while it is open (`raiseHints`).

### HUD / UX pass (previous session)
- **Available-workers counter counts adults only.** The 👷 "Free laborers" HUD chip and the Job
  Board's "Laborers (free adults)" field previously counted `jobId === null && !c.builder`, which
  swept in children (who have no job but can't work). Both now add `isAdult(c)` (`ui.ts` `updateHud`
  + `refreshJobBoard`, and the board's `jobSig`).
- **On-screen rotate buttons replace the twist gesture.** Two round buttons pinned to the top
  corners (`#btn-rot-left` ↺ / `#btn-rot-right` ↻, `index.html` + `.rotate-btn` in `style.css`)
  rotate the 3D camera a fixed `ROTATE_STEP` (45°) per tap via `UICallbacks.onRotate` →
  `Game.rotateView` → `camera.rotateBy`. The two-finger twist-to-rotate was removed from
  `input.ts` (pinch-zoom + two-finger pan stay). The flat 2D camera gained a no-op `rotateBy`, and
  the buttons hide in `?2d` (`ui.hideRotateButtons`). `#hud-top` left inset widened to clear the
  left button.
- **Barns (and wells) are fireproof.** `BuildingDef.fireproof` + `isFireproof(type)` (`types.ts`),
  set on `well` and `barn`. The hard-coded `type === 'well'` fire checks in `simulation.ts`
  (`fireSeason` flammable filter, `tryIgnite` guard, `adjacentBuildings` spread target) now use
  `isFireproof`; the well-*dousing* check stays keyed on `'well'`.
- **Clear resources under a footprint before building.** Placing a building over trees or loose
  stone now marks those footprint tiles for harvest (`markFootprintHarvest` in `placeBuilding`), and
  construction is gated on `footprintClear(s, b)` (exported from `buildings.ts`, checked in
  `pickSite` before the `build` action). The free-adult workforce clears the marks via the existing
  `pickHarvest`/`runHarvest` path; material hauling may proceed in parallel. Trees and loose stone
  are mutually exclusive per tile in map gen, matching the single-valued harvest layer. The Job
  Board shows "🌲 clearing land" for such a site, and placement logs a "clear the trees and stone"
  hint (`main.ts`).

### Jobs board overhaul Prior milestones (the farm
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
- `tools/models/` — the village's geometry, in Python. `common.py` (primitives, world-scale UV
  projection, glTF export), `style.py` (palette, `courses()`, `shingled_roof`, `half_timber`),
  `parts.py` (the shared prop vocabulary), then one module per trade. `build.py` builds; **`check.py`
  verifies every model still fits its plot** — run it after any `BUILDING_DEFS` `w`/`h` change.
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
  seed-gate/staffing tests, and this session's **available workers count**, **fireproof buildings**,
  **clearing land before building**, and **camera rotate buttons** suites.

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
- **Models:** `python3 tools/models/build.py` then `python3 tools/models/check.py` (exits non-zero
  on any model that no longer fits its plot). Needs `pip install "bpy==4.5.12"` on Python 3.11 —
  Blender as a library, no GUI. The build is deterministic: rebuilding an unedited model reproduces
  the committed `.gltf`/`.bin` byte for byte, so `git status` after a full rebuild is an honest
  diff of what you actually changed.
- Committed tests: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test`
  (config runs `npm run build && npm run preview` on port 4173).
- Headless scratchpad drivers use `playwright-core` + chromium at
  `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` with SwiftShader flags,
  against `npm run preview` on port 4173 (preview is flaky — run it in the background).
- App exposes a `window.__village` debug hook (`startNewGame`, `debugAdvance`, `debugPlace`,
  `debugCanPlace`, `debugRanchCapacity`, `debugWorkRadius`, `debugSetBuilders`, `debugPlanPath`,
  `inspectSel`/`refreshInspect`, `persist`, plus the sizing fields `sizeW/sizeH`, `rotateDir`, and the
  private action methods and `log` — TS `private` is runtime-callable).
- **Test caveats learned this session.** Kill any stray `npm run preview` before running Playwright —
  the config reuses an existing server on 4173 and will happily test a **stale build**. Don't assert
  wall-clock rates against animation frames (headless rAF is slow and irregular; drive N frames
  explicitly instead). Panel contents render on the next `refreshPanels` frame, not on the click, so
  wait for a row rather than reading the DOM immediately. Pass `disasters = false` to `startNewGame`
  in any consumption/economy measurement — a fire destroying the house under test silently changes the
  numbers. When isolating one household's consumption, leave **clothing** in the barns (it is
  village-wide, not a larder item) or winter illness confounds the result, and capture the resident
  count *before* the turnover, since `rehouseVillagers` moves adults out afterwards.
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
- **Do the big buildings cost too little?** (Ask the player — deliberately not decided here.) The
  footprint pass changed no costs, so an 8x8 quarry is still 30 wood, a 6x6 mine still 14 wood and
  10 stone, and a 5x9 trading post still 20 wood and 10 stone. The quarry in particular is now the
  largest structure in the village at the price of two houses. Raising them is a one-line edit each
  in `BUILDING_DEFS`; the counter-argument is that the *land* is now the real cost — finding eight
  clear tiles a side is most of what placing a quarry takes.
- **Work circles did not grow with the buildings.** `workRadius` is still 4-6 tiles measured from
  the building's centre, so a 3x5 fishing hut's radius-4 circle now spends 15 of its ~50 tiles on
  its own footprint where the 2x2 spent 4. Yields sag a little for the biggest foraging buildings.
  Scaling the radius with the footprint is a couple of lines in `workRadiusOf`, but it is a balance
  change and wants play-testing rather than a guess.
- **Old saves keep their tile positions but pick up the new sizes** (`footprintW/H` falls back to
  the def for everything but the field and the pen), so a village saved before this change can have
  buildings overlapping each other, and in the worst case a door covered by a neighbour that grew.
  Same as when the quarry went 2x2 -> 3x6 in an earlier session, and handled the same way: start a
  new game. Say so if the player hits it rather than building migration machinery for one save.
- **Balance review.** Knobs that moved the economy and want play-testing rather
  than more code: housing capacity (8/10), `HOUSE_LARDER_SEASONS` (0.5) with `LARDER_CARRY_CAP`
  (×3), the `SEASON_BURN` table (firewood and clothing now cost across the whole year, so the annual
  bill is meaningfully higher), and the birth rates (`BIRTH_CHANCE` 0.55 + surplus/wellbeing).
- **Housing is now the growth lever**, by design: a couple needs a free house to move into before
  they can form. Grown children stay home until the player builds. Watch that this reads as a clear
  prompt to build rather than as the village being stuck.
- **Rotate direction.** Verified correct against the glyphs and covered by a test; if the player
  still wants it inverted after trying the hold behaviour it is a one-line sign flip in
  `Game.rotateView` (and the two direction assertions in the rotate suite).
- **Quarry placement reliability.** 3×6 was originally chosen over 4×8 because a big pit is hard to
  site on a small map; at 8×8 that worry is live again, which is part of why small maps went to 72
  tiles a side. Both quarry tests retry across up to 8 generated worlds to find a site — if that
  starts failing, the pit has outgrown the map rather than the test having gone flaky.
- **Top-line HUD still wraps to two rows** at 430px with the requested nine chips. Fitting one row
  would need materially smaller chips or a horizontal scroll (which hides items on mobile).
- **A house of only children gets no larder** — no adult resident to run errands, so those children
  eat from the barns via the normal fallback. Harmless today; it would go away if home assignment
  kept children with a parent.
- **Repo rename (pending, manual — user will do it):** rename `centerzl93-lang/mobile-game` →
  `little-village` in GitHub **Settings → General**. There is no MCP tool for this. *After* it's
  renamed, update the repo name in lockstep or GitHub Pages breaks: `vite.config.ts` `BASE`,
  `playwright.config.ts` `BASE`, the two `.../mobile-game/` URLs in `README.md`, and the **Repo** line
  above. (Package name is already `little-village`.)
- **Deploying from a session-named branch.** Each session is handed a fresh
  `claude/…` branch to develop on, and none of them is in the workflow triggers — so a push there
  deploys nothing and tests nothing. Today the answer is "push to
  `claude/banished-ios-app-b4zott` regardless" (see Project above), which works but quietly makes
  the branch instruction a formality. The durable fixes, in rising order of commitment: add each
  session branch to the two `branches:` lists as it is created; switch the triggers to a wildcard
  (`claude/**`); or merge to `main` at the end of a session and let `main` be the thing that
  deploys. Worth asking the player which they want rather than carrying the workaround forever.
  Renaming the branches away from the "banished" string needs the same trigger edit, so the two
  jobs are best done together.
- **Per-crop designs:** `CROP_DESIGN` (color + reserved `model` slot) and the render hook in
  `drawFarm`/`makeFencedPlot` exist, but fields draw generically. Next step is real per-crop art at the
  hook, or a cheap first pass tinting the field by `cropDesign(crop).color` (~a couple of lines).
- **Trading-post polish (optional):** boat parks on the *central* river even for an edge-lake post;
  tune `MERCHANT_ARRIVAL_CHANCE`/category stock; optional HUD cue for an arriving boat (top-bar button
  was removed).
- **Minor:** the 3D ranch pen shows no live animal glyphs/count (the 2D renderer does).
- **The villager-breeding tests get slower the later they run — this is unsolved and worth an
  hour.** All five drive `growUnderIdealConditions`, sixteen season turnovers on a whole village.
  Timings for the *identical* test:

  | when it ran | time |
  |---|---|
  | first in a 3-test run, idle machine | **1.6m** ✓ |
  | second in that same run, still idle | **6.8m** ✗ |
  | 59th in the full suite | **8.1m** ✗ (hit the cap) |

  Not the map seed, and not this session's change: the commit *before* the footprints shows the
  same pattern, and there the first breeding test passed while the later one timed out. What
  predicts the time is **position in the browser session**, which points at something accumulating
  across page loads — leaked WebGL contexts under SwiftShader is the obvious suspect, since each
  `open()` builds a fresh Three.js renderer. Chasing that is the real fix; a `page.close()` /
  fresh-context per test in the breeding describe is the cheap experiment to try first.

  They share a named `GROWTH_TIMEOUT` (480s), which is a plaster, not a cure — it was 240s and
  raising it did not make the full-suite run green. **Do not raise it again**; it is already at
  eight minutes for one test. Until the leak is found, expect the last two or three breeding
  tests to fail in a full run and pass in isolation.
- **Suite flakiness.** Several latent map-seed flakes were hunted down; the recurring pattern is a
  test that depends on villagers *walking* somewhere within a step budget, which an unlucky map
  (target across a river, or simply far) breaks. The fix that works is to stand the villagers where
  the behaviour under test happens — done for the quarry yield test and the path-paving test — since
  neither is testing pathfinding. The other recurring pattern is sampling a resource total in barns
  alone while a load is still being carried; count it everywhere instead. Worth not reintroducing: `placeGatherer` and `findSpot` searched
  only a fixed radius and returned null/`[-1,-1]`, which callers then dereferenced; the ranch
  breeding test ran with disasters on, so a fire could take the pen mid-measurement; the world
  spec's quarry scan checked terrain but not `debugCanPlace`, so it could pick a tile under a
  building or unaffordable at the quarry's new 30-wood cost; and the quarry yield test depended on
  workers walking to a site that can sit across a river (it now stands them in the pit, since it is
  testing the yield rule and not pathfinding).
