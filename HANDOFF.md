# Session Handoff — Little Village (Village-Builder PWA)

> Living doc. Update the **State** and **Next steps** sections at the end of each session.
> Last updated: 2026-08-06 (taller toolbar buttons, ages run 4x the calendar, the full herd model,
> sheep/wool/mutton, larder-hauling collapse fixed, real Hard difficulty, low-stock warnings,
> two-door barn, taller school; see Current State)

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
Latest work: **taller toolbar buttons**,
**ages run four to the calendar year**,
**sheep, wool and mutton**,
**villages no longer freeze beside a full barn**,
**a real Hard difficulty**, **low-stock warnings on every resource**,
**a barn with a door at each end**,
**roads are routed, not traced**,
**demolition as a job + house upgrades + a delivering market**,
**a codex + opening caps**, **a HUD/toolbar pass**, **a real app icon**, **build sites show what is in the way**, **merchant docks properly**,
**stockpile limits**, **workers go where the work is**,
**five more tree species**,
**named/deletable save slots**,
**lives on ticks (ageing/births)**,
**opening stock + tool/coat economy**,
**consumption tuning + hearth-only fuel**,
**self-filling jobs**, a **seven-item gameplay pass**, **staged construction**,
**render optimisation**, a **renderer teardown leak**, **lakes**, **landscape play** and
**building footprints** — all this session.
Earlier, **confirm-before-apply, live rehousing, implicit inspect**, the **storage/job-board/naming pass**,
the **household model**, the **opportunities pass**, the **HUD / UX pass**, then the **jobs board
overhaul** — further down.

### The toolbar buttons grow into the home-indicator inset (this session)

`#toolbar` padded its bottom by the full `--safe-bottom`. On an iPhone that is a **39px strip of
empty bar** below the buttons — as deep as the 30px buttons themselves, and holding nothing. The
inset exists so nothing important sits under the home indicator, but it was being read as *unusable*
rather than *reserved*: a button may extend into it as long as a clearance is kept.

So the bar keeps the same height and spends it differently. `--safe-bottom` splits **0.7 into the
buttons, 0.3 into the clearance under them**; `#tools` gains `grid-auto-rows: 1fr` so both rows
share the height instead of sizing to content, and a `min-height` of `64px + inset*0.7` (55px in
landscape). Measured at three shapes:

| | Inset | Bar | Button | Clearance |
|---|---|---|---|---|
| Phone portrait | 34px | 108px | 30 → **42px** | 15px |
| Phone landscape | 21px | 82px | 26 → **33px** | 9px |
| No inset (desktop) | 0px | 74px | 30px | 5px |

**The bar's total height is unchanged at every one of them**, which is the point: `--bar-h` is a
contract six other elements measure their offsets from (pop-out, hint, log, confirm bar, inspect
sheet, placement controls), and none of them moved. A screen with no inset renders byte-identically
to before — `inset*0.7` is zero there, so the desktop layout is untouched and only devices that
were actually wasting the space get the taller targets.

### Ages run four to the calendar year (this session)

Age used to advance in step with the calendar, which forced a choice between ages that read like
ages and a village that grows inside a session — and it had picked neither. A villager was a
working adult at **4**, could not have a child until **6**, and the founders were 20. Six years of
play, twenty-four seasons, before a newborn could have a child of its own.

`AGE_PER_YEAR` (4) uncouples the two. The ladder is in human years and reads like one; divide by
four for play time.

| | Age | Play time |
|---|---|---|
| Enrols at school | 8 | 2 years |
| Adult, unschooled | 12 | **3 years** |
| Adult, schooled | 16 | **4 years** (2 of them studying) |
| Fertile | 12–45 | from adulthood |
| Old age / death | 60 / 80 | ~15 / 20 years |

**Fertility now opens at adulthood.** The old two-year gap between grown and fertile was the
single largest part of the wait between generations, and deleting it halves birth→breeding from
six years to three.

**Adulthood is no longer a fixed age**, which is the part that bites. A child at a staffed school
keeps growing up to `SCHOOL_LEAVING_AGE`; one without goes to work at `ADULT_AGE`. So a student can
be *over* `ADULT_AGE` and not an adult — and `isAdult` had always been exactly "over `ADULT_AGE`".
It now excludes students, and every one of its ~50 call sites depends on that: without it a
12-year-old at school reads as a member of the workforce. Pairing goes through `isAdult` too, which
is why a 14-year-old is `isFertile` by age and still cannot have children.

Edge rules, all in `lives()`: a school that loses its teacher turns its pupils back into children,
and any already past 12 go straight to work with whatever schooling they sat; a child who passes 12
with no school cannot be enrolled by one built afterwards.

**Measured, all else held equal** — 20 houses, unlimited food and fuel, same seed, eight years:

    before   12 → 92
    after    12 → 162

**Old saves** carry no `ageScale`, and there is no other way to tell them apart: a child of 3 was
nearly grown on the old scale and is an infant on this one, and it is the same number. The loader
stretches pre-change children across the new childhood so they keep the growing up they had done
(3 → 9), leaves adults alone, and stamps the state.

### Sheep, wool and mutton (this session)

A fourth herd, bought from an animals trader like the other three. Sheep are deliberately the
**mirror of cattle**: a cow is meat that happens to leave a hide, a sheep is a fleece that happens
to leave mutton. That inversion is the whole reason to keep both — a clothing economy runs on sheep, a food economy on cattle, and the two
pens are not interchangeable. At `ANIMAL_TILES` 2 (against cattle's 3) more sheep fit the same pen.

**Every herd gives one thing alive and another dead.** `ANIMAL_META` carries two lists:

| Herd | Alive (`products`) | Butchered (`butchered`) |
|---|---|---|
| Cattle | milk | leather (×1.4 — the hide worth having) + meat |
| Pigs | *nothing* | pork + leather (×0.7) |
| Sheep | wool | mutton |
| Chickens | eggs | chicken |

**Hide only ever comes off a carcass.** No pen produces leather while its animals live, which is
the rule the old model broke — cattle used to shed leather on the living roll, and culling a flock
of sheep produced wool. A pig pen is the extreme case: it pays *nothing* until something dies, so
`workOutput` returns null for an empty `products` list and the rancher works a cycle with no load.

What dies is usually not a decision. A pen at its cap keeps breeding and every birth with nowhere
to go goes straight to the butcher (`endSeason` → `butcherProducts`), so a full pen is a standing
supply of meat and hide with nobody culling anything. Measured over six seasons, a full pig pen
turns its overflow into pork and leather on its own.

Per head, from a cull of a half-full pen: cattle 2.0 leather, pigs 0.6.

**Shearing is not slaughter, and the model says so.** `ANIMAL_META` now separates the standing
yield (`products` — what a rancher collects from *living* animals on an ordinary work cycle) from
the butcher's yield (`butchered`, defaulting to `products` so the other three herds are unchanged).
Sheep are the reason the split exists: `products` is wool alone and `butchered` is mutton alone, so
a flock clothes the village indefinitely without losing a head, and mutton only ever comes off one
that was culled or born past the pen's cap. Before this, culling a flock produced wool — you got a
fleece by killing the animal wearing it.

There is no seasonal gate on any of it: a pen is shorn in winter as readily as in spring. Do note
that a *test* of that has to stock the households first — a rancher whose own hearth is nearly out
drops the shears and hauls firewood, which is the larder-priority rule below working as intended
and is otherwise indistinguishable from wool having a closed season.

**Cattle still yield leather without slaughter** (`meat` 0.7 / `leather` 0.3 on the living roll),
so the contrast is currently one-sided. Making hide slaughter-only would complete it and is a
balance decision nobody has taken.

Five new `ResourceKind`s — `wool`, `mutton`, `pork`, `chicken`, `milk`. `chicken` is the bird
on the plate and `chickens` the bird in the pen; they are one letter apart, so the icons carry the
difference (🍗 against 🐔) wherever the two could appear in the same list. **The foods are in `FOOD_KINDS`**, so it feeds villagers and counts toward
diet variety (`DIET_VARIETY_TARGET`); **wool is a material**, and like leather it stays off the HUD
chips — those are deliberately a short list. Both got icons, volumes, trade values and merchant
stock; `sheep` itself is tradeable at 16, between a pig and a cow.

**The tailor now has a recipe toggle**, mirroring the blacksmith's: `TailorRecipe = 'leather' |
'wool'`, `TAILOR_LEATHER_IN` 5 vs `TAILOR_WOOL_IN` 4 for the same 4 coats, so wool goes further per
unit. `Building.recipe` is typed `SmithRecipe | TailorRecipe` — one field, two buildings, and they
never share a building so they never disagree about what the value means.

**`RESOURCE_KINDS` is the trap.** It is a hand-written array — *not* derived from the
`ResourceKind` union — and it is what the barn sheet, the trade screen and the stockpile panel all
walk. All five new goods were added to the union, the icons, the volumes, the trade values and the
merchant tables, typechecked clean, worked in the simulation, and were **invisible in every
inventory the player reads**, because nothing had added them here. The compiler cannot help: the
array is `ResourceKind[]`, and a short list is still a valid one.

There is now a test for it. `RESOURCE_ICON` is a `Record<ResourceKind, …>` and so is exhaustive by
construction; the test asserts `RESOURCE_KINDS` covers everything in it. Add a resource, forget the
list, and the suite says so.

**Two things worth knowing if you extend this:**

- `Building.recipe` is defaulted in **two** constructors — `makeBuilding` in `state.ts` *and*
  `placeBuilding` in `buildings.ts`. Setting only the first left every tailor the player actually
  built reading "Sewing from iron", which is how this was caught.
- The ranch product roll used to size a load with `p.kind === 'meat' || p.kind === 'eggs'`. It asks
  `FOOD_KINDS` now, so a new animal's produce is hauled at the right size without anyone
  remembering to extend a condition — mutton would otherwise have moved as if it were a hide.

### Villages stopped freezing to death beside a full barn (this session)

Playing all six difficulty × map-size combinations turned up a collapse that made the core loop
self-defeating: **putting buildings down killed the village.** Same seed, same map, only the
player's action differing — do nothing and the hearths stayed stocked; place four buildings and
every household but one sat at zero fuel forever while the barn held 552 firewood it never spent.
The game even logged *"the barns are stocked but nobody is carrying it"* three times, then everyone
froze. Population went 20 → 3.

Three separate faults, and **two of them were introduced by the two-door barn work above**:

1. **`buildingApproach` picked the nearest *walkable* door, not the nearest *reachable* one.** The
   dominant cause. A household north of a barn headed for the north door — perfectly good grass
   with no route to it — and queued there for good. One door, one destination, no way to be wrong;
   two doors and the choice could be made on distance alone. It now prefers a door it can path to
   (`reachableFrom`, the component check `reachableTile` already used), whatever the distance.
2. **`canPlace` let a site cover one of a two-door building's doors** as long as the other was
   `isWalkable`. Walkable is not reachable — see above — so a barn could lose its only *usable*
   door to a lumberyard and become unenterable. Every door is protected again; two doors means two
   tiles stay clear.
3. **`larderShortfall` asked for goods in a fixed order, food first** (pre-existing, latent until a
   household got large). Food is eaten continuously, so a big household is always under its food
   threshold, so every trip fetched food and fuel was never fetched at all. It now ranks gaps by
   **fill ratio** and returns the emptiest — `larderShortfalls` is the ranked list.

On top of that, two changes the player asked for directly:

- **Any free adult runs the errand.** `larderHauler` used to anoint one resident per household by
  rank and stick with them; if that villager was tied up the whole house went cold with idle
  housemates standing around. Now anyone may go, and what is rationed is how many go *at once*.
- **Housemates fetch different things.** Which gap a villager takes is their index among the
  household's adults against the ranked list (`wants[slot % wants.length]`) — stateless on purpose.
  A first attempt used a shared "claimed" set and deadlocked the moment a claim went stale, which
  made things measurably worse.
- **A low larder outranks work and leisure.** `larderUrgency` returns `'low'` under
  `LARDER_URGENT_AT` (0.25 of target); that cuts a leisure break short, blocks a new one, and
  raises the concurrent-shopper cap to `MAX_LARDER_SHOPPERS`.

Result on the repro, same seed: the worst arm went from a total wipe by Y2S0 to a village growing
**13 → 25 with no cold households and no warnings at all**.

### Hard is a different game from Normal (this session)

`DIFFICULTY_RESOURCES.normal` and `.hard` were both bare `SURVIVAL_START` — identical stock,
identical limits, neither with houses. Eight seeded playthroughs produced byte-identical
season-by-season series and event logs. The picker meanwhile promised Hard came with "half the food,
fuel and tools". `HARD_FACTOR` (0.5) now applies to everything `SURVIVAL_START` hands over: 600
food, 24 tools, 24 coats. The blurb lost "fuel", which neither setting has ever started with.

### Every stock warns when it runs low (this session)

`isLowStock`/`lowStockMark` (`simulation.ts`) give one uniform rule for every resource: low is the
higher of `LOW_STOCK_FRACTION` (10%) of that stock's own cap and, for the goods where it is the
real measure, what the population gets through in a season (`PER_CITIZEN_SEASON_NEED`). Measured on
**free barn stock only** — a larder is that family's winter, not stock the village can spend.

The log line is deliberately the same shape every time (`X is low`) rather than a bespoke sentence
per good, and it is **latched**: `s.lowWarned` fires it when a stock *becomes* low and re-arms when
it recovers. Without the latch a village that has never mined iron is told so four times a year
forever. The Autumn fuel/clothing warnings stay as they were — those carry timing, not level, and
their kinds are skipped that season so nothing is said twice.

The HUD chip mirrors it: `.stat.low` is red with a **▼**, the exact counterpart of `.stat.full`
green with **▲**. Two shapes as well as two colours, so the pair survives colour-blindness and a
glance on a phone. The tooltip names the barn figure, because the number on the chip still counts
larders for firewood and clothing and the two would otherwise look inconsistent.

### The barn is 3×4 and opens at both ends (this session)

The barn is where the whole village walks all day — every harvest, every haul, every builder
fetching materials — and it had one door like a cottage. However the building was turned, every
load queued at the same corner of the plot. It is now **3×4** with a cart door at each gable.

`BuildingDef.doors?: 2` is the flag (`types.ts`); nothing else sets it yet. `entrancesAt(x, y, w,
h, rot, type)` returns every door of a footprint — the second is simply `entranceAt(…, (rot + 2) %
4)`, the same rule half a turn round, so a barn opens at both ends whichever way it is built.
`entranceTiles(b)` is the placed-building form. `entranceTile`/`entranceAt` still exist and still
mean "the front one", which is what a one-door building wants.

Three call sites had to learn that a door is now a *set*:

- **`buildingApproach(s, b, from?)`** (`simulation.ts`) picks the nearest **walkable** door to
  whoever is walking there. `from` is the villager; without it the front door is the answer, which
  is what layout checks want. Every `goTo(c, buildingApproach(s, X))` now passes `c` — about thirty
  sites — and so do the distance-ranking ones in `pickSite`, `leisureDestination`,
  `nearestUnbuiltNeeding` and `workSpot`. **Miss one and it still compiles**: `from` is optional,
  and the villager silently walks to the far end of the barn.
- **`canPlace`** (`buildings.ts`) asks that *one* door be walkable, not all of them — a barn backed
  onto a cliff at one end is fine. From the other side, a site may cover one of a neighbour's doors
  but never its last one.
- **The founding layout** (`state.ts`) keeps starter houses off *every* barn door, not just the
  front one.

The placement ghost draws a second facing arrow for a two-door building (`faceArrowBack` in
`renderer3d.ts`) so the player can see both tiles that have to stay clear. Both arrows are disposed
on teardown — they draw with `depthTest: false`, so a leaked one points at a door through the
terrain of a map that no longer exists.

**Model** (`tools/models/civic.py`): `bw, bd = 2.42, 3.23`, with doors, straps, head, hay hatch and
loading ramp mirrored `for sy in (-1, 1)`. One hoist beam over the front gable only — two read as a
mirror rather than a barn — and the yard goods moved to the *sides*, because both ends have to stay
clear for carts. The door leaves and their strap hinges now stand **proud** of the boarding; sunk
flush the way they were, a door on a wall of the same timber is a slightly paler rectangle nobody
reads as a way in.

**Old saves**: footprints come from the def, not the save, so a barn in an existing village grows a
tile southward on load and may end up overlapping whatever was behind it. That is how the earlier
footprint pass behaved too and the save version is unchanged (still 12) — the overlap is cosmetic,
since nothing re-runs `canPlace` on a loaded building.

The school got a second storey in the same pass: `wall_h` 1.16 → 2.02 with a band course at
first-floor level and a second row of windows, so the hall stands about 3 units where the cottages
around it stand about 2. Its footprint is unchanged (3×4).

**Careful with `tools/models/build.py`.** Only the tree models have ever shipped the
`baseColorFactor` tint that `export_gltf` re-attaches (see `common.py`); every building was
exported before that fix. A plain rebuild therefore retints **the whole village** — 29 files — which
is a deliberate visual decision, not a no-op. The barn and school were rebuilt with that factor
stripped back out of their textured materials, so they still match their neighbours. If the retint
is ever wanted, it is one `python3 tools/models/build.py` away and should be its own change.

### The job board is per profession (this session)
It listed one row per *building* and a dead "Not built yet" catalogue underneath. Now it lists one
row per **trade**, whether the village has one of those buildings or not, and every row can be
staffed: `3 working / 4 wanted`.

**The two sides of a row mean different things.** *Wanted* is `tradeCapacity` — the trade's
**finished** buildings times the hands each takes, the village's own demand rather than a number
the player types. Put up a second fishing hut and two more fishermen are wanted; pull one down and
the figure falls. The stepper is the other side: `tradeStaff`, how many people are put to the
trade, and it is not bounded by the demand. A site still going up counts for nothing — it cannot
employ anybody yet.

**A trade can be staffed before it has anywhere to work.** `tradeExtra` on the state holds the part
of an ask that has nowhere to go — every building of that type is already fully asked for, or there
is no building at all. Nobody is employed by it; until there is a post those villagers are laborers
like any other, which is what `0 working / 2 wanted` says. `drawFromTradeExtra` hands a newly
finished building its opening staff out of that pool, so "I want two fishermen" survives until
there is a hut, and `razeBuilding` gives a demolished building's ask *back* to the pool rather than
quietly shrinking the village's plans.

`b.desiredWorkers` is still the per-building number and still settable on a building's own panel —
`tradeWanted` is their sum plus the overflow. `setTradeWanted` spreads a change across the trade's
buildings, filling the emptiest and taking from the fullest, so four foresters across two huts land
two and two.

Two numbers came off at the same time: a staffed row read `(max 3)` — already where the + button
stops moving — and the catalogue rows carried `up to 2 workers · 🪵10`, a build-menu question on a
staffing panel. The top line is now `👷 Laborers: N` in place of the population and mood figures,
which the HUD already shows the whole time.

**Lost with the per-building rows**: the board's per-site "🌲 clearing land · 3 tiles left", and
the mine/smith/crop/animal toggles. All of them are per-building decisions and all of them live on
that building's inspect sheet.

### Harvest picks its kind (this session)
The harvest drag took everything inside the square, which is right for clearing a plot and wrong
for everything else — a village that wants the ore out of a wood does not want the wood felled to
reach it. The Harvest tool now opens a picker (the same pop-out buildings and paths use):
**Everything · Trees · Stone · Iron**, `HARVEST_KINDS` in `types.ts`, and `markHarvestRect` takes
the kind. One tap still arms it on Everything and the choice is sticky, so the common case costs
nothing and the tool reopens on whatever was last used.

A tile holds one order and trees are checked first, so under **Everything** a wooded tile that also
carries ore is marked for felling — the trees have to come off before the ore is reachable anyway.
Asking for **Iron** marks that same tile for the ore and leaves the trees standing, which is the
point of choosing.

### The Codex audited against the code (this session)
A house advertised room for four; `HOUSING_PER_HOUSE` has been **8** for some time. The capacities
were raised and the prose was not, which is the failure mode a reference page has — so every
description was read back against the constant that drives it:

- **House 4 → 8**, **Stone House 5 → 10** (`STONE_HOUSE_CAPACITY`).
- The stone house's "burns far less fuel" is now the actual figure, **40% less**
  (`STONE_HOUSE_HEAT_FACTOR` 0.6), and its fire resistance is stated as the half it is
  (`STONE_FIRE_FACTOR`).
- **Barn**: "stores up to 5000 goods" was a unit error — `BARN_CAPACITY` is *volume*, and a sack of
  grain takes a quarter of a log's room. It now says space and gives the exchange rate. The market
  says its 2000 against the barn's 5000.
- **Work circles** were quoted at their one-worker radius, which under-sold every work building by
  half. The facts line shows the range (`⭕8–12` for a market), and the legend says so.
- **Field and Ranch** showed `4×4`, their smallest setting, as though it were their footprint. Now
  `4×4–8×8`, from `SIZABLE`.
- Smaller: the forester no longer implies only it has a growing circle (they all do) and now
  mentions clearing rock and ore, which it does; the mine points at both places its output can be
  switched; the school states the half-year attendance rule `SCHOOL_ATTENDANCE` actually applies.

`debugFacts()` exposes the driving constants and a test asserts the prose against them, so the next
balance change that moves a capacity fails the suite instead of quietly making the Codex a liar.

### The rules moved into the Codex (this session)
The stockpile panel opened with a four-line paragraph explaining what a limit *does*, and every row
carried "nothing produces this yet" — which was true of most rows for most of a village's life and
was not something the player could act on. Both are gone: the panel opens on the controls, and a
row's sub-line is the stock against its cap, mentioning workplaces only when there are some.

The rule itself is now `CODEX_NOTES` (`types.ts`), printed in the Codex under **How the village
works**, alongside two more that had no home anywhere: what marking a demolition actually does, and
what upgrading a house involves. A rule you learn once does not belong above the controls you use
constantly; the Codex is where a player already goes to find out how something works.

### Roads are routed, not traced (this session)
Drawing a road used to paint whatever tile the finger was over, which meant the road *was* the
trail: a wobbly drag built a wobbly road, and altering it meant cancelling and starting again. Now
a drag names two ends. `onPaintStart` anchors, and every pointer move re-plans the **whole stroke**
from the anchor to wherever the finger is now — the mechanism bridges and tunnels already used for
their spans, generalised to every tier. Keep dragging and the route keeps changing; nothing is
committed until the confirm bar is accepted, exactly as before.

`routePath` (`src/game/paths.ts`) finds the line. It is a second A*, deliberately not `findPath`:
that one answers where a villager can *walk*, this one where a road can *go*, and they differ on
every tile of forest, every stretch of open water and every unbuilt bridge. Three things shape it:

- **`TURN_COST` (0.45)** — without it, every zig-zag between two points costs exactly what the
  straight L costs, and A* returns whichever it expanded first. Charging for a change of direction
  breaks the tie towards long straight runs and a few deliberate corners. Measured: a 12-tile run
  comes back with 0 turns, a diagonal with 0, and 12-across-3-down with exactly 1.
- **`ROAD_REUSE` (0.35)** — a tile that already carries a road is cheap, so routes join up the
  network rather than laying a second road beside the first.
- **`routable`** is looser than `planPath`: it allows tiles that already carry this road (the
  stroke simply has a gap there) and built bridges and tunnels, so a road drawn across a river
  follows the crossing instead of refusing.

If the finger is over water, rock or a building there is no route, and the last good one stays on
screen rather than blinking away — the preview holds instead of flickering as the pointer crosses
an obstacle.

**A latent bug came out with it.** `unplanTiles` cleared re-planned tiles to `PATH_NONE` instead of
the value they held before, and filtered `pendingPaths` without filtering the parallel
`pendingPrev` — so every tile after a dropped one was paired with the wrong history. Nearly
harmless when only a bridge drag re-planned, and much less so now that every pointer move does:
re-routing a stone road away from a dirt one would have scrubbed the dirt. Both fixed.

### Demolition is a job, houses upgrade, and the market delivers (this session)

**Demolishing is work now, not a menu action.** The Demolish tool *marks* — `markDemolish` — and
builders come and do it. A marked building keeps standing, keeps its residents and keeps working
right up until somebody swings a hammer, so a mis-tap costs nothing until then; `cancelDemolish`
takes the order back off while the walls are still up. The teardown runs on `demoTimeOf` (half the
build time) and reuses the construction visual backwards: `buildStage` returns `done` → `framing` →
`site` for a demolition, and `framedFraction` counts the frame *down* instead of up. It is
deliberately not the mirror image — construction is bare ground for its first half and then a frame
rising, while a teardown stands whole for its first quarter (`DEMO_FRAME_AT`) and then comes down
over the long tail — and there is no fetch-materials leg at all, which is the other way it is less
linear than building.

**Salvage is carried, not conjured.** `razeBuilding` puts the `REFUND_FRACTION` of the build cost
*into the building's own store*, on top of whatever it was already holding, and flips it to
`razed`: a rubble pile that is no longer a workplace, a home or a warehouse. `pickSite` gained two
actions — `raze` and `salvage` — and builders cart the pile away a load at a time through the
carry-to-barn path they already had (which will divert a load to a construction site that needs it,
which is a feature). `clearRubble` frees the plot when the pile is empty. So a demolished barn's
grain is walked out of it by hand, and its contents leave the village totals until they arrive.

**The last barn cannot be marked** (`canDemolish`): everything the village owns lives in one, and
with no barn left the salvage would have nowhere to go — the demolition could never finish.

**Demolish and Upgrade are on the building's own sheet**, not only under the tool. A house offers
**⬆️ Upgrade to Stone House**, which is a demolition with a note attached (`upgradeTo`): the old
house is razed and carted off exactly as any other, and then `clearRubble` turns the same plot into
the construction site for its replacement instead of clearing it. Residents are turned out when the
walls come down and move back in when the new roof goes on. Condemned houses are left out of
`rehouseVillagers` and the housing passes, so nobody is moved into a building that is about to go.

**The market is a delivery service.** 4×4 (unchanged), now **3 jobs** and a `workRadius` of
`MARKET_RADIUS` = 8, which `WORK_RADIUS_PER_WORKER` takes to **12 at three vendors** — the largest
circle in the game, because a market is not producing out there, it is delivering. `runVendor`
leads with `marketErrand`: the first household inside the circle whose larder is short of something
the stall holds, loaded up by the basket and walked to the door. Restocking the stall from the
barns is still there, as the second leg. First match rather than nearest — a house drops out of the
search as soon as it is back over `LARDER_RESTOCK_AT`, so service rotates on its own without
measuring every home every tick. Food falls back to whatever food the stall actually has when the
shortfall names one it does not.

### A codex, opening caps, and less medicine (this session)

**The placement blurb became a Codex.** Picking a building printed its description in the hint
bar, which sits exactly where the Build and Rotate buttons appear — four lines of text with the
controls stamped across the middle, on the one screen where the player needs both. `selectBuild`
now says nothing, and `showCodex` (`src/ui/ui.ts`) lists every building grouped by category with
its footprint, cost, worker count and work radius, one legend line explaining the shorthand. It
hangs off **Codex** on the title screen *and* in the pause menu — "what does a Tailor do" is a
question you have mid-village, and the answer used to be one tap away on the map. The card claims
the height it is allowed and scrolls inside itself, since twenty-three entries are taller than any
phone; the landscape branch spends width to win reading area back. Path hints stay: those are
instructions ("drag one finger to draw"), not explainers.

**A village is founded with caps set** — `START_LIMITS` in `types.ts`, keyed by difficulty and
copied into `newGame`. `BASE_LIMITS` is food 2000, wood/stone/iron 500, firewood 500, and 100 each
of medicine, coal, tools and clothing; **Easy raises wood and firewood to 1000** because it is
handed 660 and 600 of them. That is the rule the table follows: a cap the village is already over
is a hut that stands down on its first day, which is not what a default is for. Applied to new
villages only; a save from before this had no caps deliberately and loading it should not quietly
change what its huts are doing.

**Normal and Hard now start with no firewood at all.** `SURVIVAL_START` no longer carries any —
Easy gets its 600 in `DIFFICULTY_RESOURCES` alongside the wood, stone and medicine. The game opens
in Early Spring and only winter kills (`SEASON_BURN`, and the `chill` clock in `heat()` only runs
in Winter), so a coat and a roof carry a villager to the turn of the year: the three seasons
before it are the ones in which houses have to go up and a woodcutter has to fill them. The 500
ceiling lets them bank roughly three winters' worth for the founding twelve
(`HEAT_PER_CITIZEN_WINTER` × 12 ≈ 160) before the woodcutter downs tools.

**Starting medicine**: Easy 120 → **50**; Normal and Hard get none, as before.

### HUD meters, a two-row toolbar, and a cap indicator (this session)
Three UI changes in one pass.

**Health and happiness are five pips each**, one lit per 20 points, and they have swapped places
with the season chip — season now sits beside the ages, the meters follow it. A bare "62" needed
the player to know the scale it was out of; five hearts read peripherally, which is the point of a
number you are meant to notice *changing*. `setPips` (`src/ui/ui.ts`) lights `floor(v / 20)` of
`PIPS`, dims the rest rather than removing them so the row never reflows, and writes the exact
figure to the chip's `title`. It runs every frame, so it only rewrites DOM when the count moves.

**The toolbar is a 4×2 grid filling the width.** One row wanted 530px for eight tools and a
portrait phone has 390, so half the build menu sat behind a sideways swipe most players never
made. `#tools` is a grid of four `1fr` columns, each button turned horizontal — icon then label —
so a tool is a wide target rather than a small square one. The clock briefly lived at the right
end of the bar and has moved back to the control column down the right edge, where the panel
buttons are; the tools spread into the space it left.

`--bar-h` is how tall the bar stands (74px, 61px in landscape) and every offset above it —
pop-out, hint, log, confirm bar, inspect sheet, placement controls — is measured from it, so
making the buttons taller is one line rather than six offsets drifting apart. Landscape also
shrinks the control column to 38px buttons: six 44px ones plus their gaps do not fit between the
HUD and the bar on a 390px screen, and the menu button ended up half behind it (the bar is
z-index 6 to the column's 5).

**The build pop-out wraps instead of scrolling** for the same reason (resources holds eight
buildings). Its height is no longer a constant: `renderPopout` measures it and publishes
`--popout-h`, and the hint bar, event log and confirm bar all lift by
`pop-out bottom + --popout-h + 8px` instead of the 158px/148px they used to hard-code. Without
that the log sat on top of the second row.

**A stock at its limit reads green with a ▲.** `atLimit(s, key)` came out of `cappedOut`, which
now calls it, so the chip and the workers agree by construction — the arrow means *these trades
have downed tools*, not merely "this number is large". Green because every other colour in the HUD
means trouble and a cap is the village doing what it was told; the arrow carries the meaning where
colour alone would not. `low` is suppressed while `full` is set so a chip can never be both.

### The app icon is artwork now (this session)
The player supplied a painted village scene; it replaces the little house-and-pine emblem the old
Node script drew. Source art lives at `tools/icon/source.jpg`, and `tools/icon/build.py` (Pillow)
cuts the shipped sizes.

**The corners had to go.** The art arrives already composed as an app icon — rounded square,
dark backdrop showing through the corners. Every platform masks with a shape of *its own*, so
those baked corners would have drawn a dark rim just inside the system mask. `INSET = 72` crops
past them: for a corner of radius *R*, clearing it takes `R·(1 − 1/√2) ≈ 0.29R`, and the source
rounds at ~228px on a 1000px image. What is left is a square of scene edge to edge, which is also
why there is **no separate maskable file** — the manifest declares the one 512 as
`purpose: 'any maskable'` rather than precaching a byte-identical twin, and padding a landscape
into the safe zone would only letterbox the scene inside its own icon.

**The favicon is a different crop.** The whole valley — church, bridge, mountains — turns to
noise at 64px, so the small size zooms to the cottage (`FOCUS`, given in fractions of the square
master so the framing survives a re-render of the art).

**They are 256-colour PNGs.** The service worker precaches them, so every kilobyte is paid at
install; quantising costs a mean of under 3/255 per channel (measured against truecolour) and
takes the set from ~1.1MB to 174KB.

**CI no longer regenerates them.** `deploy.yml` and `test.yml` both ran `node scripts/gen-icons.mjs`
before building, which would have redrawn the old emblem over this on every deploy. Those steps
are gone, the script is deleted, and the icons are committed like the textures are. `favicon.svg`
went with it — it was a hand-drawn copy of the old emblem — so `index.html` now points at
`favicon-64.png`.

### A build site says what is in its way (this session)
A site sits at 0% while the village hand-clears the wood off it, and from outside that was
indistinguishable from a site nobody had been assigned to. `footprintToClear(s, b)` counts the
tiles under a footprint still holding trees, rock or ore, and `footprintClear` is now derived from
it. Both places that could answer "why is nothing happening here" do:

- **The inspect sheet** leads with `Clearing the ground` instead of `Building 0%`, then the total
  and a line per kind (`🌲 Trees 3 to fell`, `🪨 Stone 1 to gather`, …). The sheet's signature is
  the rows themselves, so the counts tick down on their own as the ground is cleared.
- **The job board** row reads `🌲 clearing land · 3 tiles left`. Its signature had to change with
  it: it previously folded in `footprintClear` as a *boolean*, which would have frozen the number
  at whatever it was when the site was placed.

Counted in tiles rather than resource units, because a tile is one trip for whoever clears it —
that is the number that says how much work is left.

### The merchant now actually docks (this session)
Two separate faults behind one screenshot of a speck floating in a lake.

**It never moored at the post.** `updateMerchantBoat` parked the boat at `riverColumnX(dockY)` —
the *central river's* column at the post's row — whatever water the post was built on. A post on a
lake therefore had its merchant sit in open water on the far side of the map. The berth now comes
from the post: `dockSpot` takes the water tile nearest its middle, preferring one just outside the
footprint so the boat lies alongside the wharf rather than on it, and `boatEntry` starts the run
from the map-edge water tile nearest that berth so the crossing stays on the same water.
`moveBoatTo` sails a straight line to a point instead of following the river column, and records
a heading on `Merchant.boat.h` so the renderer can point the bow along the course.

**It was drawn one tile long.** Models arrive normalized to a one-tile footprint and the boat was
never scaled up, so it was a speck beside a 5x9 wharf. `BOAT_SIZE` is 3.5 tiles now — but note the
trap it cost: **multiply the template's scale, never set it.** The normalizing factor *lives on
that scale*, so `setScalar(3.5)` drew the hull at 3.5x its raw authored size (five tiles, swamping
the wharf) rather than 3.5 tiles. The size test measures the drawn extent off the scene graph for
exactly this reason — a constant that looks right can still be drawing the wrong thing.

### Stockpile limits (this session)
A cap per stockpile, in a new 📦 panel beside the job board. Over the cap, the workplaces that make
that thing stop producing — **their workers keep the job** and simply labour instead: hauling,
clearing marked ground, laying drawn roads. Nothing else can hire them, and they pick their trade
straight back up the moment the stock drops, so a limit is a standing instruction rather than
something the player has to re-staff around.

- **Food is one category, not one cap per edible thing** (`LimitKey = ResourceKind | 'food'`). A
  village wants a full larder, not "1000 fish" — one `food` cap stands the gatherer, the fisherman
  and the hunter down together, judged against every food kind in storage.
- **Fields and pens are exempt** (`limitedOutput` returns null for them). A crop half-grown in the
  ground and a herd that needs feeding are not work you can walk away from because the barn is full.
- The rule is `cappedOut(s, b)`, checked in `runCitizen`: a capped worker runs `runBuilder` instead
  of `runWorker`. A load already in hand is still delivered first.
- `LIMIT_STEP` is 50, and the first tap up from "no limit" lands on the current stock rounded up to
  a step — a cap you set while looking at the panel should be about where the stock is now.

### Workers go where the work is (this session)
Every worker used to stand on their building's doorstep whatever their trade. Now `workSpot` in
`src/game/simulation.ts` decides where a cycle happens, and there are three answers:

- **Circle trades** (`CIRCLE_WORK` — forester, gatherer, hunter, herbalist) pick a tile out in
  their work circle, walk to it, and hold it in `Citizen.workAt` until the cycle completes, so
  they settle at one tree rather than re-picking a destination every frame. A forester takes rock
  and ore out of the circle *before* wood — every deposit cleared is another tile that can be
  planted — and fells the tile he is standing on rather than thinning the whole circle evenly.
- **Indoor trades** (`worksIndoors` — everything with a door that is not a circle trade or the
  fishing hut) go in. `Citizen.inside` is set on arrival at the bench, and the renderer scales
  those villagers to nothing, so a smith at his anvil is out of sight instead of loitering
  outdoors. It is cleared at the top of `runCitizen` every tick and re-set by the work branch, so
  anyone who breaks off to haul, shop or rest reappears immediately.
- **Fields, pens and the fishing hut** are unchanged: open ground and a jetty, where the worker
  should be visible standing on the job.

Note the renderer *scales* an indoor villager away rather than skipping them — every instanced
layer indexes by the citizen's position in the array, and leaving a slot out would shift everyone
after them onto the wrong body.

### Five more tree species, and the tint bug that hid them (this session)
The wood was all pine. There are six species now — `pine` plus `spruce`, `birch`, `oak`, `maple`
and `willow` in `tools/models/trees.py` — mixing conifer spires with broadleaf domes and a
drooping willow, each with its own greens and bark.

**No per-tile state.** The renderer keeps one `InstancedModel` per species and picks between them
from a hash of the tile and the tree's index within it, salted separately from the position jitter
so moving a tree never changes what kind it is. Nothing is stored on the tile and nothing changes
across a save. Two consequences to respect: the species layers are only built once **every**
species has loaded (`ModelLibrary.treesReady`), because manifest order is what the hash indexes and
a late arrival would reshuffle a live forest; and each layer is sized for the *whole* forest, since
the hash could deal one species most of a small wood and an under-sized layer drops trees silently.

**The tints had never worked.** `material()` multiplies a texture by the material colour through a
Mix node, and the glTF exporter cannot represent that — it wrote the texture and dropped the
colour, so `baseColorFactor` was absent on every material in every model. Every "retint" of a
shared map was identical: five new tree species came out in one flat green, and `stone` /
`stone_dark`, `foliage` / `foliage_light` and so on have always been the same. `material()` now
stashes the colour on the Blender material and `export_gltf` writes it back as `baseColorFactor`.

**Only the trees have been rebuilt with the fix.** Every other model still carries its old
untinted materials, so the village looks exactly as it did. Running `python3 tools/models/build.py`
would rebuild them all *and apply tints that have never been visible* — the buildings would change
appearance in one go. That is the authored intent finally working, and it may well look better, but
it is a deliberate visual decision rather than a no-op rebuild. Decide it on purpose.

### Named and deletable save slots (this session)
Each occupied slot in the Load/Save picker now carries a rename field and a delete button; empty
slots carry neither. A slot with no name shows "Slot N", and clearing the field puts that back.

- **The name lives beside the save, not in it** — `little-village-save-v12-slot{N}-name`. The game
  autosaves over the slot every few seconds, so a name inside the envelope would have to be read
  back and re-attached on every one of those writes to survive, and would be lost by any save path
  that forgot. `clearSave(slot)` removes the name with the save, so a slot reused later cannot
  inherit the last village's name.
- **Deleting the village you are playing is refused**, with a hint saying why. It is not a
  confirmation the player can insist past: the next autosave is a few seconds away and would put
  the file straight back, which would read as the delete having silently failed.
- **Two layout traps**, both from `.card button`. It sets `width: 100%`, and a flex item resolves
  its `auto` basis from that — so the bin button took the whole row and squeezed the name field to
  22px until `width: auto` was set on it. And the global `*` reset turns text selection off, which
  a field you type into needs back (`user-select: text`).
- The name is player-typed text rendered into markup, so the row title goes through a new
  `escapeHtml` (the existing `escapeAttr` is for attributes, and is still used for the field value).

### Lives run on ticks, not seasons (this session)
Ageing, schooling, coming of age, old age and births used to land in one lump at the turn of the
year: the whole village had a birthday together, every child who was going to grow up did so in the
same frame, every elder who was going to die died in it, and every household that was going to bear
a child bore it then. A village stood still for four seasons and lurched once. All of it now runs in
`lives()` (`src/game/simulation.ts`), called every tick from `update` — the same move already made
for eating, heating and construction.

- **`c.age` is a float now**, gaining `dt / YEAR_LENGTH` a tick. Both display sites already did
  `Math.floor`, so nothing needed changing there, but **anything new that shows an age must floor
  it**. Old saves carry whole-number ages and simply carry on from them.
- **The odds are preserved, not re-tuned.** `chanceOver(p, part, whole)` = `1 - (1-p)^(part/whole)`
  restates a probability for a shorter span, so the yearly old-age roll and the per-season birth
  roll keep exactly the odds they had. This is the bit to be careful with if you move anything else
  off the boundary: `p * dt / whole` is *not* the same number, and neither is rolling `p` per tick.
- **Births run on a 5-second cadence** (`BIRTH_INTERVAL`, `GameState.birthTimer`), not every tick —
  deciding them means walking every house and pairing off its residents, far too much to do sixty
  times a second. A season holds 120 of these, so from the player's side children simply arrive
  whenever they arrive. Measured: 16 of 17 population changes over two years fell away from a
  season boundary.
- **Schooling is counted, not sampled.** With continuous ageing, "did they attend?" can no longer
  be a snapshot at the year boundary — a school staffed for one tick would educate a whole cohort.
  `Citizen.schooling` accumulates seconds actually attended and `SCHOOL_ATTENDANCE` (0.5) is how
  much of the school year has to be sat.
- **Measurement tests must now pin demographics, not just housing.** The three seasonal-burn tests
  measure a household's fuel per head over a 500-second window, and that window can now contain a
  birth, a child coming of age and moving out, or an elder dying — each changes the head count the
  figure is divided by, and the first two change the burn as well. Spring and autumn came out 12%
  apart on a rate that is equal by definition. The fix is in `burnDuring`: every resident is moved
  clear of the thresholds they could cross in 0.21 of a year (children to 1, adults to **34.5** —
  past `FERTILE_MAX_AGE` so the house cannot bear, still short of `OLD_AGE_START` at the end of the
  window). **Ages, not partnerships** — `rehouseVillagers` pairs singles off again every couple of
  seconds, so clearing `partnerId` buys about two seconds. And not by turning children into adults:
  that leaves a houseful of surplus adults and rehousing moves one out.
- **`GameState.seasonDeaths` carries the morale tally.** `endSeason` measured deaths by the
  population dropping across its own call, which worked while old age was settled there. Elders now
  die whenever their time comes, so the count is accumulated and folded in at the turnover —
  without it, old age would have silently stopped weighing on morale.

### Opening stock and the tool/coat economy (this session)
**Every difficulty now starts with the same survival rations**: 1200 food, 600 firewood, 48 tools,
48 coats. Those numbers are tuned against the founding twelve, not against difficulty. What
difficulty changes is the leg-up — Easy still hands over 660 wood, 120 stone, 120 medicine and
three finished houses; Normal and Hard grant no building materials at all.

While setting them I folded away `STARTING_STOCK_SCALE`. The tables used to be written at a third
of their real size and multiplied by 3 on the way into the barn, so the table said 120 tools and
the game gave 360 — a trap for anyone reading it to answer "what do we start with". The figures in
`DIFFICULTY_RESOURCES` are now what the barn actually receives, and the dead `START_RESOURCES`
table (a second, now-wrong source of truth) is gone.

**Wear rates**, both re-tuned to "one per villager per season":

| | was | now | a year costs |
|---|---|---|---|
| `TOOL_WEAR_PER_WORKER` | 4 / employed worker / season | **1** | workers × 4 |
| `CLOTHING_PER_CITIZEN_WINTER` | 5 / villager / winter | **2** | villagers × 4.1 |

Coats are billed through `SEASON_BURN` (winter 1, spring/autumn 0.45, summer 0.15 — 2.05 over a
year), so 2 a winter averages out to about one coat per villager per season. Measured: the founding
twelve reach exactly **0 coats at the end of year one**, which is the intended cliff. Tools are not
season-weighted and only *employed* villagers wear them, so the founding eight workers get about six
seasons out of 48 — measured at exactly 8 a season for 8 workers. The margin closes as the village
grows; past twelve workers, 48 is a year and no more.

That is the loop the player asked for: a staffed blacksmith turns out 8 tools a worker a season
(≈16 workers kept supplied) and a tailor 6 coats (≈one village's worth), so both have to be running
before the opening stock is gone.

**A knock-on worth knowing:** the nomad gate is written as a multiple of the ration
(`totalFoodAvailable > pop * FOOD_PER_CITIZEN_PER_SEASON * n`), so cutting the ration by three cut
the bar with it — from 1080 food for a founding village to 360, which a fresh start clears three
times over. Nomads began knocking every season from day one. `NOMAD_SURPLUS_SEASONS` (4.5, up from
a hard-coded 1.5) holds the bar at the same *absolute* larder it always meant. Anything else keyed
to `FOOD_PER_CITIZEN_PER_SEASON` as a threshold rather than as a rate deserves the same look.

**A wipe this uncovered.** Normal and Hard start every villager roofless, and the previous change
had made fuel burnable *only* from a house larder — so on those difficulties everybody froze in the
first winter beside a full, untouched 600-firewood pile, before a single house could be raised.
Measured: pop 12 → 0 in year one with food and firewood barely touched. A villager with no house at
all now falls back to the village pile; they have nowhere to keep fuel, so the rule cannot apply to
them. A *housed* villager still has no fall-back, which is the case the rule was for.

### Consumption, hearths, and the road that never got built (this session)
Three asks, and the third turned out to be a fault the *previous* change had introduced.

**Food and fuel drain a third as fast.** `CONSUMPTION_SLOWDOWN = 3` divides
`FOOD_PER_CITIZEN_PER_SEASON` (60 → 20) and `HEAT_PER_CITIZEN_WINTER` (40 → 13⅓). Everything else
is derived from those two — larder targets, the low-stores warnings, the "seasons banked" mood
check — so the whole economy scales with them and nothing needed adjusting alongside. Production is
untouched, so this is a straight loosening of the survival pressure; it is one number to turn back.

**Fuel is only burned in a hearth.** `heat()` used to fall back to the village fuel pile for
whatever a household's woodpile didn't cover, which meant the barn stock drained on its own while
the houses it was meant to supply stood cold. That fall-back is gone: a villager burns firewood
(then coal, if a house ever holds any) from their own home larder and nothing else. Carrying fuel
home is now the only way it is ever spent, so a full barn beside an unstocked house keeps nobody
warm. A villager with no house burns nothing at all — verified: twelve roofless villagers next to
a 400-firewood barn leave all 400 of it where it is.

**The sting in hearth-only fuel: a barn nobody can walk to is now fatal.** Eating draws on village
totals without anyone moving, and heating used to as well — so a barn walled in behind new
buildings, or cut off across a river, cost nothing. Now fuel has to be *carried*, and a household
whose hauler cannot reach a barn goes cold beside a full woodpile; in winter that kills everyone.
This surfaced as four breeding tests dying outright: `growUnderIdealConditions` packs ten houses in
a tight ring from `r = 3` around the barn, which strangles the approach — no larder in that village
ever received *anything*, food included, and it had simply never mattered before. The helper now
starts its ring at `r = 10`. Two of those four had been timing out for several sessions and now
pass, which is a real gain, not just a restored baseline.

Because none of the stock warnings can see this (they all read village totals, which are healthy),
`warnOfShortfalls` gained one that can: when the village holds fuel but half or more of its
occupied houses have none at home, it says so and names the delivery, not the stock. Without it the
player's first sign of a blockaded barn is a pile of corpses.

**And roads stopped being built.** This is the "dirt paths are green" report: a *planned* path is
tinted green and only goes brown once laid, so "green paths" meant nothing was laying them. The
cause was the auto-staffing default from the previous change. Only a **free** adult lays a planned
tile at any distance; an employed one merely detours to tiles within `NEAR_PATH_RADIUS` (6) of
their workplace. Auto-staffing hires every workplace to its cap, so "free adult" became nobody —
and with nobody free there are no builders either, meaning **no roads, no construction, and no
harvesting, permanently.** Measured before the fix: a fully staffed village laid 0 of 6 confirmed
tiles in 600 seconds, and stayed at 0.

Two changes fix it. `autoBuilderDemand` now counts confirmed-but-unlaid road tiles as well as
construction sites (one builder to get a road moving, up to three for a long run). And
`assignHomesAndJobs` **reserves that many adults before the workplaces hire**, releasing staff from
the most recently built workplaces if they have already taken everyone. When nothing is
outstanding the reserve is zero and every job fills as before; the player's `builderExtra` still
adjusts it either way.

### Jobs fill themselves (this session)
Two halves of one request, and they turned out to be quite different jobs.

**A job left open by a death was already refilled** — `assignHomesAndJobs` runs every tick and
tops every built workplace back up to its `desiredWorkers` from the free adults, and
`removeCitizen` strips the dead from `b.workers` on the way out. Measured it rather than assumed
it: worker 5 dies, worker 7 has the slot on the next tick. So nothing was built for this half; it
is now pinned by a test that kills a worker and checks the roster, with the setting below both on
and off, so it cannot quietly regress.

**A newly finished workplace was the real gap.** `placeBuilding` sets `desiredWorkers: 0` — a hut
stood empty until the player went to the Job Board — so `finishConstruction` now opens its jobs
(`desiredWorkers = def.jobs`) when `s.autoStaff` is set, and the existing hiring loop fills what it
can and picks up the rest as villagers come free.

**The toggle** is *Settings → Staff new workplaces*, **default on**: the request was to stop
re-staffing every hut by hand, so the toggle exists for players who want the old behaviour rather
than to opt into the new one. It lives in `localStorage` (`village-auto-staff`) like the tips
preference — it follows the player, not the village — and is copied onto `state.autoStaff` at
`startNewGame` and `continueGame` so the simulation reads it from one place. Deliberately **not**
persisted when toggled: Settings is reachable from the main menu, where `state` is only the idle
backdrop village, and saving there would write that over whatever is really in the slot.

Builders are outside all of this, as asked: their count is derived from the open construction sites
(`autoBuilderDemand`, below) and no workplace slot is involved.

### Seven gameplay fixes (this session)
One request, seven separate things. Taken in order, with what each actually touched:

**1. Schooling is a building, not a life stage.** Children used to spend years as "students" with
nothing teaching them. Now `isStudent(c)` reads a `student` flag that only gets set — at the yearly
ageing pass in `src/game/simulation.ts` — when a school is *staffed*, and only for the last year
before `ADULT_AGE` (`SCHOOL_AGE`). No school, no students: children go straight to adults. The HUD
chip counts the enrolled, so it now says how many are actually being educated rather than how many
happen to be the right age.

**2. Placing a construction asks for builders.** `autoBuilderDemand(s)` in `src/types.ts` sums
`buildersWantedFor(type)` over every unbuilt building — 2 for a small plot, 3 from 9 tiles, 4 from
20 — and `assignHomesAndJobs` sets `s.desiredBuilders` to that plus `s.builderExtra`, clamped to
the adult count. Demand therefore stacks across sites and falls back to nothing when the last one
finishes. `builderExtra` is the player's own adjustment on top, so dragging the Builders slider
still works: `setBuilders(n)` stores `n - autoBuilderDemand(s)` rather than the raw figure.

**3. The fishing hut stands its dock in the water.** `BuildingDef.dockDepth` (2 for `fishing`)
replaced the old `requiresAdjacent: ['water']`. `canPlace` now requires the far two rows of the
plot to be ≥60% water and the near rows to include land, so the jetty is over the lake and the
shack is on the bank — at any rotation. `workCentre(b)` returns the dock end rather than the middle
of the plot, and `buildingCenterTile` routes through it, so `nearbyWater` and the work circle both
measure from where the villager actually stands to fish. The model in `tools/models/food.py` was
mirrored to match (jetty at -Y, door on the +Y landward face) — **if you re-author it, the jetty
must stay at -Y or the model reads backwards against `dockDepth`.**

Work circles are also drawn *while siting* now, not only after selecting a built building:
`syncOverlays` builds a `Placed` ghost from the placement preview and runs the same `workCentre`.
`Placed` (in `src/types.ts`) is the `type/x/y/rot/w/h` subset the footprint helpers need, which is
what lets a preview measure by exactly the same rules as a building.

**4. Foresters work the wood in a scattered order.** `plantCircle`/`depleteCircleTrees` swept the
work circle in row order, so a lodge clear-cut a moving edge. `scatteredCircleTiles()` shuffles the
tile list (Fisher-Yates) before handing it out, so planting and felling land all over the circle.

**5. Demolish takes a drag-square.** `onMarqueeEnd` collects every building *fully enclosed* by the
box; `pendingDemolish` grew from a single id to `{ kind; ids; label }` so the confirm bar can offer
"Demolish 6 buildings" as one decision.

**6. Idle villagers stay home.** `s.origin` records the founding clearing at `newGame`, and
`loiterPoint()` sends anyone without a task back toward it, so an unemployed village no longer
drifts to the middle of the map. Old saves default `origin` to their first barn.

**7. Two map sizes.** `MAP_SIZES` is `{ small: 72, large: 144 }` — the old medium renamed, the old
192 large retired. `slotInfo` reports anything wider than 72 as Large, so a save made on the 192 map
still lists sensibly.

### Construction now has three looks (this session)
A placed building used to be the finished model in glass until the moment it completed. It is
three stages now, and the glass is kept for the one place it tells the truth:

| when | drawn as |
|---|---|
| choosing where to put it | the silhouette (the placement preview — unchanged) |
| placed, under half built | **site**: turned earth, stone footings round the plot, corner stakes, materials stacked |
| half built to finished | **frame**: the real model rising out of those footings, cut off at the height the work has reached, inside a cage of scaffold poles |
| finished | the building |

`buildStage(b)` / `framedFraction(b)` / `BUILD_FRAMING_AT` live in `src/types.ts` so the rule is
one place. The renderer picks an object kind from the stage (`userData.kind`, which is also what
tells it when to rebuild) and `syncBuildings`' signature carries the stage plus the frame height
quantised into twelfths — the frame has to rise as work goes on without rebuilding every frame.

Two things worth knowing if you touch this:

- **The frame is the real model with a clipping plane, not a second model.** Every building gets
  the stage for free and the shape you watch going up is the shape you end up with. It needs
  `renderer.localClippingEnabled = true` (set in the constructor) and the cut faces drawn
  `DoubleSide` — a one-sided wall sliced across reads as a hole in the building rather than as a
  wall that has not been finished yet. The scaffold poles are unit-tall and centred on their own
  middle, so raising one means moving it up half as much again; scaling alone sinks it through
  the ground.
- **This only works because building materials are per-instance.** Clipping planes are set on the
  material, so with the old shared materials one building's frame would have sliced every other
  building of that type in half. That fix is in the commit before this one.

`styleBuilding` no longer takes a `built` flag: nothing standing on the map is transparent, so
all it does now is the flat colour for box fallbacks and the burning tint.

**`debugBuildTime(type)` is new** and tests laying out a part-built building must use it.
`buildTime` on the def is multiplied by `BUILD_TIME_SCALE` (2), so setting `progress` from the
raw number lands at half the fraction you meant — which is exactly how the first screenshot of
this feature came out showing three identical foundations and no frame at all.

### Render optimisation (this session)
The player reported lag on medium. Profiling first, guessing never: the scene was drawing
**2.16 million triangles a frame** on a 144x144 map, in only 72 draw calls, so it was geometry
volume and not batching. Now **1.03M**, a 52% cut, with no visible change.

Where it went, and what each was worth:

| | before | after |
|---|---|---|
| trees (144-tri pine each) | 1,222,416 | ~700k, and only what is near the camera |
| loose stone | 712,500 | 82,440 |
| water plane | 41,472 | 10,368 |
| `animate` (JS, per frame) | 4.95 ms | 1.26 ms |
| `syncIron` (JS, per frame) | 0.64 ms | 0.05 ms |

Three changes:

- **`rocksPerTile` claimed 5 but `syncRocks` wrote one matrix per tile.** Four fifths of the
  instances kept the zero matrix — degenerate, invisible, and still submitted every frame. The
  constant now says what is drawn. Raising it again means writing the extra matrices *with* it
  (nest the loop the way `syncIron` does); raising it alone is what produced the waste.
- **The water plane had a vertex per tile.** The swell is two sine waves about ten tiles long
  with an amplitude of 0.03 — `WATER_SEG = 2` samples that five times a wave and cut the plane,
  the per-frame ripple, and its per-frame `computeVertexNormals` by four.
- **Scatter props are culled to a radius around the camera target** (`updateViewRegion` /
  `inView`, applied to trees, stone and ore). `InstancedMesh` cannot cull per instance, so this
  is by hand. A *radius*, not a frustum, deliberately: it is rotation-invariant, so turning the
  view costs nothing and panning only rebuilds once the camera crosses a 6-tile cell. `syncIron`
  also gained the signature gate the other two already had — it had been rewriting every ore
  matrix and re-uploading the buffer on every frame.

**The radius is measured, not guessed, and that matters.** Sweeping the ground plane at every
zoom and yaw, the furthest on-screen point sits at almost exactly **1.7x the camera distance**
(8 tiles out at distance 7, 144 at distance 85). A first attempt at `1.5x + 12` fitted the middle
of the range and silently cut 33 on-screen tiles at full zoom-out; a "tightened" `1.2x + 10` cut
284. The check that catches this is in the handoff's spirit: project every forest tile at
tree-top height through the live camera at 8 zooms x 5 yaws x 3 map sizes and count any that are
on screen but outside the radius. It must be **zero**, and it is, over three separate world sets.
Re-run that before changing the formula — a radius that is 10% too small does not look like a
bug, it looks like trees appearing as you pan.

**Still on the table, in rough order of value:** the pine is 144 triangles and trees are still
~70% of the scene, so a lower-poly pine would be the next big cut (it changes how every tree
looks, so it is the player's call); `syncTerrain` costs ~1.3 ms a frame and has not been looked
at; and the signature scans walk every tile of their layer every frame (`syncPaths` walks all
20,736 on medium) which is cheap per tile but adds up.

### The renderer leaked the old map into the new one (this session)
The player reported iron deposits floating in the middle of a lake. The cause was not generation:
`clearWaterMargin` strips deposits from every tile within `DEPOSIT_WATER_MARGIN` of water, and a
direct count over 18 worlds found **zero** deposits on or adjacent to a water tile, on any map
size. The ore in the lake belonged to a *previous* map.

`teardown()` (`src/render/renderer3d.ts`) releases the map's meshes before `init()` rebuilds
them, and two were missing from the list:

- **`ironNodes`** — so every new game left the last one's ore chunks in the scene, still at the
  positions they were given for terrain that had since become forest, mountain or lake. Water is
  simply where a stray chunk is unmistakable.
- **`faceArrow`** — rebuilt by `init` every game, and it draws with `depthTest: false`, so a
  leaked one is not just still there, it is still there *through the terrain*.

A census of scene geometry after four consecutive new games told the whole story and is the way
to check this class of bug:

| | game 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Octahedron (iron) | 2 | 3 | 4 | 5 |
| Cone + Box (arrow) | +2/+2 each game | | | |
| after the fix | identical counts on every game |

**How to find the next one:** count meshes by `geometry.type` across `scene.traverse` after
repeated `startNewGame`. Anything that grows is leaking. Do *not* check a single fresh world —
the first four probes I wrote all did, and all reported "clean", because the bug needs two games
to exist. One of them also sampled instance matrices before `syncIron` had run and measured
unwritten zeros, which reads exactly like "nothing over water". Await several frames *and* start
a second game before believing a negative result here.

**Known and not fixed — `syncRocks` writes one matrix per tile but sets the count to
`rockTiles.length * rocksPerTile()` (5).** Four fifths of the loose-stone instances are therefore
never written and stay at the zero matrix: degenerate, invisible, but drawn. So loose stone
renders one rock per tile where the code intends five, and the instance buffer is 5x the size it
needs. Fixing it is a two-line change (nest the write loop the way `syncIron` does) but it makes
visible stone deposits five times denser, which is a look change the player should agree to
rather than find in a bug fix.

### Lakes (this session)
The player asked for more lakes now that the maps are bigger, and for one in the middle that the
river runs into and out of. `generateWorld` (`src/game/world.ts`) now builds three kinds of water:

- **The river's own lake**, centred on `riverCx(midY)` — the meander line, not the map's centre.
  That is what makes the channel meet it head-on: the river narrows in at the top, opens into the
  lake, and narrows out at the bottom. Its radii are fractions of the map, so it stays the same
  feature at every size.
- **The two edge lakes**, unchanged, centred just off the map so they read as a larger body.
- **A scatter of inland lakes**, `0.55` per thousand tiles — linear in area on purpose. What a
  player notices is how *often* they meet water, which is a density, so a fixed count would make
  a large map read as a drought. Small gets 3, medium 11, large 20.

Shores are wobbled by two harmonics per lake. A bare ellipse reads as a stamped hole from the
game camera and a dozen identical ones is the first thing the eye picks up.

Measured across four worlds per size: water **18-24%** of a small map, **11-15%** medium,
**12-14%** large, with 3-5 separate bodies on small and 14-17 on large. Small stays proportionally
wettest because the river and the edge lakes are a fixed number of tiles wide against a smaller
map — **the river does not scale with map size**, which is a deliberate non-change: its width is
tuned against bridge cost and dock placement, so widening it on large maps is a gameplay decision
for the player rather than a knock-on of adding lakes.

**The founding site now keeps 8 tiles of clearance from the map edge** (`START_EDGE_MARGIN`).
This fell out of the lake work: more water displaced the start, and on 2 of 12 small worlds the
village was founded **two tiles from the border** — no room for the buildings that need it, and
the biggest is an 8x8 quarry. Two things made the first two attempts at this fail, both worth
knowing:

- The margin has to apply to **both** tiers of the search, not just the top one. An all-grass core
  is genuinely scarce on a small map (the founding clearing is carved *after* this runs, so it is
  choosing from raw terrain that is ~19% open), so the decision often falls through to the plains
  score — and guarding only the first tier left that path unguarded.
- Elbow room has to **outrank** a perfect core. `clearStartArea` carves the clearing to grass
  anyway and can fix woodland, rock and deposits; the one thing it skips is water. So the real
  requirement is "no water in the core" (`coreIsDry`), and all-grass is a preference on top.
  Ordering the perfect core first kept picking the site two tiles from the edge.

After: every world in a 12-world sample founds at least 8 tiles in, on all three map sizes.

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
`src/types.ts`. (Superseded later the same session — see item 7 above: there are two sizes now,
small 72 and large 144, and the 192 map is gone.)

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
- `tools/icon/` — `source.jpg` (the icon artwork) + `build.py`, which crops past the art's own
  rounded corners and writes `public/icons/*.png`. Outputs are committed; nothing regenerates them
  at build or deploy time.
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
- `src/game/buildings.ts` — demolition lifecycle (`canDemolish`/`markDemolish`/`cancelDemolish`/
  `razeBuilding`/`rubbleEmpty`/`clearRubble`); sized `canPlace`/`placeBuilding` (`SIZABLE`-driven `w/h` init); the
  `dockDepth` check that keeps a fishing hut's jetty over water; `buildingCenterTile` routing
  through `workCentre`.
- `src/game/world.ts` — `riverColumnX` (boat's river path).
- `src/game/state.ts` — `makeBuilding` sizable + ranch init; merchant init; `seeds` seeding;
  `desiredWorkers 0` defaults; `START_LIMITS` copied onto every new village.
- `src/game/save.ts` — merchant-shape + `orders` migration; ranch/farm `w/h` + herd defaults; `seeds`
  default + stale-crop reset (all load-time, still v12); per-slot names (`slotName`/`setSlotName`,
  stored beside the save and cleared with it).
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
- `index.html` — removed `#btn-merchant`; `#hud-people` order (ages, season, then the two meters);
  `#toolbar` now wraps `#tools` + `#clock`, and pause/speed moved there out of `#controls`.
- `src/style.css` — `.ranch-size`, `.tp-*`, ranch-picker styles; `.stat.meter`/`.pip`/`.stat.full`
  (HUD meters and the cap chip); the `#toolbar`/`#tools`/`#clock` grid; `--popout-h`, which the
  raised hint/log/confirm offsets are calculated from.
- `tests/newgame.spec.ts` — merchant, ranch, farm, and **jobs & builders** suites, plus prior
  seed-gate/staffing tests, and this session's **available workers count**, **fireproof buildings**,
  **clearing land before building**, **camera rotate buttons**, **construction stages**,
  **placement controls**, **fishing dock**, **auto-staffing**, **consumption and fuel**,
  **roads get laid**, **lives run on ticks**, **HUD meters/cap chips**, **two-row toolbar** and
  **codex**, **demolition is a job** and **the market delivers** suites. Several sim tests now open
  with `s.limits = {}` — a village is founded capped, and a test about where a forester stands
  should not be measuring a cap. The market's delivery test lays the households up sick and lodges
  the vendors nowhere (a villager runs their own errands before their job, so otherwise the vendors
  spend the run shopping for themselves), and retries across generated maps the way the
  trading-post tests do — a market the terrain walls off from the village is a placement accident,
  not a fact about delivery. The toolbar pair measures the real boxes — eight buttons in exactly two rows of four,
  neither the grid nor the pop-out scrolling, the clock stacked inside the bar to the right of the
  tools, and the event log clear of however many rows the pop-out needed. The fishing-dock pair
  scans every tile and
  rotation on a generated map and asserts that no accepted site has a dry dock, a floating shack,
  or a work circle sitting on the plot instead of the jetty — plus a count check, so it can't pass
  by finding nowhere to build.

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
  (config runs `npm run build && npm run preview` on port 4173). **Run the three specs separately** —
  the whole suite takes well over 15 minutes, so a wrapping `timeout` will cut it off mid-run and
  tell you nothing. Last full state: `world` 13/13, `menus` 10/10, `newgame` **111/111**
  — a clean sweep. Do not read one green run as the suite being flake-free, though: over this
  session `household larders > residents stock their own house`, `trading post > a stock order
  pulls goods`, `trading post > a merchant can sail in mid-season`, `household larders > a shortage takes the
  villagers who went without` and `villager breeding > with no spare housing adults still pair up`
  have each failed once in a full run and passed on their own straight after. All three are the
  walking-budget pattern below, and the first two got tighter when fuel started having to be
  carried home. Re-run a lone failure before believing it.
- Headless scratchpad drivers use `playwright-core` + chromium at
  `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` with SwiftShader flags,
  against `npm run preview` on port 4173 (preview is flaky — run it in the background).
- App exposes a `window.__village` debug hook (`startNewGame`, `debugAdvance`, `debugPlace`,
  `debugCanPlace`, `debugFootprint`, `debugBuildTime`, `debugWorkCentre`, `debugJobCount`,
  `debugFoodPerCitizen`, `debugHeatPerCitizen`,
  `debugReticleTile`,
  `debugRanchCapacity`, `debugWorkRadius`, `debugSetBuilders`, `debugPlanPath`,
  `inspectSel`/`refreshInspect`, `persist`, plus the sizing fields `sizeW/sizeH`, `rotateDir`, and the
  private action methods and `log` — TS `private` is runtime-callable). `debugFootprint` and
  `debugBuildTime` exist because both numbers are transformed before they mean anything —
  `buildTime` is multiplied by `BUILD_TIME_SCALE`, and a rotated footprint swaps `w`/`h` — and a
  test that reads the raw def value lands somewhere else than it thinks.
- **Headless Chromium renders the 3D view in software, at about 2 fps.** Measured on this box at
  390x844, `?gfx=low`: **2.4 fps** on a small map, **1.3 fps** on a large one — and only 13% of that
  frame is `renderer.render` in JS. The other 87% is SwiftShader rasterising, which no amount of
  JS optimisation touches. This is a *test-harness* number, not a device number: it says nothing
  about the game on a phone with a real GPU.

  It matters because **Playwright's click actionability check waits on animation frames**. At 2 fps
  a single menu click takes seconds: two clicks measured **15.4s** in 3D against **165ms** on `?2d`.
  Any click-driven test therefore burns its 30s budget on rendering. `tests/menus.spec.ts` now
  opens on `?2d&gfx=low` for exactly this reason — it drives menus, sizes and save slots, none of
  which involve the 3D view — and went from a timeout at 1.8m to 7 passing in 38s. **Reach for
  `?2d` in any new spec that clicks its way through the UI**; keep the 3D renderer only where the
  assertions are about the 3D renderer (`newgame.spec.ts` reads `renderer.buildingMeshes` and
  `renderer.workRing`, so it stays).
- **Test caveats learned this session.** Kill any stray `npm run preview` before running Playwright —
  the config reuses an existing server on 4173 and will happily test a **stale build**. Don't assert
  wall-clock rates against animation frames (headless rAF is slow and irregular; drive N frames
  explicitly instead). Panel contents render on the next `refreshPanels` frame, not on the click, so
  wait for a row rather than reading the DOM immediately. Pass `disasters = false` to `startNewGame`
  in any consumption/economy measurement — a fire destroying the house under test silently changes the
  numbers. When isolating one household's consumption, leave **clothing** in the barns (it is
  village-wide, not a larder item) or winter illness confounds the result, and capture the resident
  count *before* the turnover, since `rehouseVillagers` moves adults out afterwards.
- **Do not flood a barn to pay for a test's buildings.** `barn.store.wood = 9e4` fills it to
  capacity, and a worker who then finishes a load can never put it down — they stand holding it
  for ever, and the test measures a stuck villager. It cost an afternoon: production appeared to
  have stopped when it was delivery that had. A thousand is plenty for anything a test puts up.
- **A test about *what* a worker does should stand them where the work is.** `debugWorkSpot(id)`
  returns the tile their job would send them to; setting `c.x/c.y` to it (and clearing `c.route`)
  takes the walk out of the measurement. Without it these tests are really measuring how far the
  barn happens to be on a randomly generated map, and they flake accordingly.
- **Never write a tuned constant into a test — ask the game.** The food gate test set each
  household `residents * 60` grain and called it "one season's rations". `FOOD_PER_CITIZEN_PER_SEASON`
  is 20 now, so that was three seasons of plenty and the test had quietly inverted into asserting
  that births *do* happen. `debugFoodPerCitizen` / `debugHeatPerCitizen` / `debugBuildTime` /
  `debugJobCount` all exist for exactly this: the number they return is the one the game is using.
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
  the building's centre, so a big foraging building's circle now spends more of its tiles on its own
  footprint than the 2x2 version did. Yields sag a little for the biggest ones. Scaling the radius
  with the footprint is a couple of lines in `workRadiusOf`, but it is a balance change and wants
  play-testing rather than a guess. The fishing hut is the one already handled — `dockDepth` moves
  its circle out to the end of the jetty, so it fishes water rather than its own decking — and the
  same trick would suit anything else that works off one edge.
- **Old saves keep their tile positions but pick up the new sizes** (`footprintW/H` falls back to
  the def for everything but the field and the pen), so a village saved before this change can have
  buildings overlapping each other, and in the worst case a door covered by a neighbour that grew.
  Same as when the quarry went 2x2 -> 3x6 in an earlier session, and handled the same way: start a
  new game. Say so if the player hits it rather than building migration machinery for one save.
- **Balance review.** Knobs that moved the economy and want play-testing rather
  than more code: `CONSUMPTION_SLOWDOWN` (3 — the newest and largest of these; demand fell by two
  thirds and nothing on the supply side moved to meet it, so the village should now be markedly
  easier to feed and heat, and may be too easy), housing capacity (8/10), `HOUSE_LARDER_SEASONS`
  (0.5) with `LARDER_CARRY_CAP` (×3), the `SEASON_BURN` table (firewood and clothing cost across
  the whole year), and the birth rates (`BIRTH_CHANCE` 0.55 + surplus/wellbeing).
- **Difficulty is now only a leg-up, not a ration.** Food, firewood, tools and coats are identical
  on Easy, Normal and Hard; only building materials, medicine and Easy's three free houses differ.
  That was the explicit ask, but it does flatten the ladder — if Normal needs to bite harder, the
  lever to reach for is the starting *materials*, or `EASY_START_HOUSES`, rather than putting the
  survival rations back on a per-difficulty curve.
- **Fuel now has a delivery problem rather than a supply problem.** With the barn fall-back gone,
  a household that its hauler never reaches goes cold no matter how much firewood the village owns
  — and in winter that kills. The 3× slowdown gives a woodpile three times the runway, so the two
  changes were made together deliberately. If villagers start freezing beside full barns, the thing
  to look at is `stockLarder` and the hauler's round, not the fuel stock.
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
- **Trading-post polish (optional):** tune `MERCHANT_ARRIVAL_CHANCE`/category stock; optional HUD
  cue for an arriving boat (top-bar button was removed). The boat parking on the central river
  regardless of where the post was is fixed — see the docking section above.
- **Minor:** the 3D ranch pen shows no live animal glyphs/count (the 2D renderer does).
- **The villager-breeding tests are fixed (was: "unsolved and worth an hour").** They used to get
  slower the later they ran — 1.6m first in a run, 6.8m second, 8.1m at position 59 — and two or
  three of them timed out in every full suite. Two causes, both now removed:

  1. **A WebGL context per page.** Headless Chromium renders the 3D view in software (see the
     ~2 fps note above), and every `open()` built a fresh Three.js renderer. The whole breeding
     describe now opens on `?2d` — none of it asserts anything about the 3D view — which fixed
     one of the three failures on its own. Getting the last two needed the second cause as well;
     if you are tempted to leave a simulation-heavy test on the 3D opener, this is why not.
  2. **The setup strangled its own barn.** `growUnderIdealConditions` ringed ten houses from
     `r = 3` around the barn, walling in the approach, so no larder ever received anything. That
     was invisible while food and fuel both drew on village totals without anyone walking; it
     became fatal the moment fuel had to be carried to a hearth. Ring now starts at `r = 10`.

  All seven now pass, and the whole describe runs in **3.6m** rather than timing out. `GROWTH_TIMEOUT`
  (480s) is left where it is and is no longer being approached — **still do not raise it**; if these
  start creeping again, look for a third accumulator rather than more headroom.
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
