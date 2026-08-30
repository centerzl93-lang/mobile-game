# ROADMAP.md — Little Village

The current development roadmap. **This lists only work that is actually planned** — the phased plan
being followed, plus concrete items already scaffolded or explicitly flagged "next step / reserved" in
the code, `PLAYTEST.md`, or `HANDOFF.md`. It intentionally does **not** invent features. Speculative
"could-do" ideas are out; when an item is a decision rather than a build, it says so.

> **Milestone (2026-08-30): gameplay/systems lock.** The browser/Three.js build has reached feature
> completeness — every system in the "Core gameplay loop" section of `CLAUDE.md` is implemented and
> operational, and the economy has been audited and playtested (see `PLAYTEST.md`, especially the
> luxury-economy pass in B13–B15). The project is now transitioning from **"can we make the game?"**
> to **"can we make the game feel alive, polished, performant, and production-ready?"** — see
> "Roadmap philosophy" below. The browser build is not being retired; it continues on as the gameplay,
> balance, simulation, and UI/UX reference, and its own polish work (Phase 2) doubles as groundwork for
> the Unity port (Phase 3+).

Status legend: ✅ done/locked · 🔒 locked (do not change without real playtesting evidence) ·
👉 now · 🔜 next · ⏳ planned · 🎯 deferred decision (tracked, not being pursued right now).

---

## Phased plan

| Phase | Focus | Status |
|---|---|---|
| **1** | Gameplay lock / prototype complete | ✅ done |
| **2** | Villager animation foundation (browser) | 👉 now |
| **3** | Unity migration | 🔜 next |
| **4** | Unity core architecture | ⏳ |
| **5** | Production villager animation system (Unity) | ⏳ |
| **6** | Final audio (Unity) | ⏳ |
| **7** | Visual polish | ⏳ |
| **8** | Mobile optimization | ⏳ |
| **9** | UX polish | ⏳ |
| **10** | Final gameplay validation | ⏳ |
| **11** | Release preparation | ⏳ |

*(This supersedes the old Phase 0–9 numbering used while the game was being built out; that work is
now folded into Phase 1 below, with its own history preserved rather than deleted.)*

---

### Phase 1 — Gameplay lock / prototype complete ✅

The core gameplay systems are implemented and operational, and the game is currently considered
**balanced**. **No new major gameplay systems should be added to the browser prototype unless required
to fix a confirmed bug or serious gameplay issue.** The browser/Three.js build (TypeScript + Three.js
+ Vite + `vite-plugin-pwa`) should now be treated primarily as:

- Gameplay reference implementation
- Balance reference
- Simulation reference
- UI/UX reference
- Prototype/fallback build

#### Systems complete
Every one of these is implemented and operational (see `CLAUDE.md` for the architecture, `PLAYTEST.md`
for the audit trail):

- **Core simulation** — single-tick `update()` pipeline over one serialisable `GameState`, seeded
  deterministic RNG, save-reproducible.
- **Villagers & population** — the citizen task machine, ageing/schooling, reproduction, immigration,
  death (starvation/cold/disease/old age).
- **Housing** — houses/stone houses/shelters, household formation, larders.
- **Food, resources & tools** — 48 table-driven resource kinds, volume-based carrying/storage, the
  per-villager iron/steel tool ladder with personal wear (`citizenToolFactor`, `tryEquipTool`).
- **Clothing** — seasonal coat issue, warm vs. regular clothing.
- **Buildings & construction** — 31 building types, the site → clear → deliver → construct pipeline,
  cancellation, demolition, repair.
- **Storage & hauling** — barns, larders, market delivery, the builder/worker logistics loops.
- **Markets, Trading Post, Port & merchants** — river merchant barter at value parity, scheduled
  seasonal Port fleets, seed unlocks.
- **Livestock** — ranch pens, sizable-footprint buildings.
- **Progression** — the five-tier gate (`villageTier`), computed live, never stored.
- **Town Hall, policies & education** — policy toggles, the ledger/festival, the school→university
  pipeline.
- **Disasters** — fire (with brigade response), sickness, famine, flood — all four wired to the shared
  DAMAGED state machine and repair pipeline.
- **Luxury production & trade** — the sand → glass → jewellery → fine goods chain, audited and
  playtested end to end (`PLAYTEST.md` B11–B15). **Current recipes are 🔒 locked:**
  - `2 Sand + 1 Coal → 3 Glass`
  - `2 Glass + 1 Iron → 2 Jewelry`
  
  Do not change these without concrete evidence from real gameplay testing (not theoretical
  worker-season arithmetic) that they're wrong — see B15's own caveat about the Tools benchmark being
  a theoretical ceiling.
- **Save system** — versioned `localStorage` saves, 3 slots, numbered migrations + load-time defaults.
- **UI/HUD** — the full DOM-based surface: HUD, build toolbar, inspect panels, job board, trade
  overlay, Codex, stockpile limits, Town Hall, achievements, save/load.
- **Mobile/browser controls** — the unified touch + mouse `InputManager` (pan/pinch/tap, marquee,
  path-draw), installable PWA, offline play.
- **Sound event wiring** — the full `src/audio/` architecture (semantic events, asset tables,
  concurrency/cooldown gating, spatial attenuation, haptics) is built and wired end to end. **This is
  architecture only, not final audio assets** — every entry in `AUDIO_ASSET_MAP` currently lists
  `variations: []`, the documented "not recorded yet" state. See Phase 6.
- **Economy/balance validation** — the resource-conversion, tool-efficiency, and luxury-profitability
  audits (`PLAYTEST.md` B6–B15) confirmed the core loop and the luxury chain both clear their own costs
  at a sane worker-season rate.
- **Achievements** — all 80 reviewed for reachability and correct live-vs-tally sourcing.

#### Known deferred tuning questions
These are real open items from the build-out (see `PLAYTEST.md` for the full, current list under
"Balance" and "UI / rendering") that were never resolved into a decision. They are **not** part of
this production transition and are **not** being pursued right now — only revisit one if it turns out
to be a confirmed bug or is blocking Phase 10's validation pass:

- 🎯 Do the largest-footprint buildings (8×8 quarry, 6×6 mine, 5×9 trading post) cost too little for
  their footprint, or does the land itself already price that in?
- 🎯 `workRadius` is measured from centre and doesn't scale with building size, so a big foraging
  building spends more of its circle on its own footprint.
- 🎯 Difficulty (Easy/Normal/Hard) is only a starting-stockpile leg-up, not a differently-tuned ration
  — confirm this is the intended long-term stance.
- 🎯 Top-line HUD wraps to two rows at 430px with the current chip set.
- 🎯 Whole-economy dials (`CONSUMPTION_SLOWDOWN`, housing capacity, `HOUSE_LARDER_SEASONS`, the
  `SEASON_BURN` table, birth rates) want more real play, not more code.

#### History (Phase 0–9 of the old numbering)
Preserved for context — repository cleanup, simulation stability, construction/workforce hardening,
save/load reliability, progression balancing, luxury/Port balancing, the 80-achievement review, UI/UX
passes (per-crop 3D field art, ranch animal glyphs), and the resource-conversion/tool/luxury balance
audits were all carried out and landed on `main`. The detailed, dated record of each of those lives on
in `PLAYTEST.md` (issue-by-issue, with status) and in the merged PR history — not repeated here to
avoid two copies of the same audit trail drifting out of sync.

---

### Phase 2 — Villager animation foundation (browser) 👉 now

**This is the immediate visual-development priority.** Villagers currently walk to a job location and
stay visually idle — `src/render/villager.ts` builds only static body/skin/hair/leg/coat geometry, with
no animation of any kind. The game needs villagers to visibly *perform* their jobs.

**Animations must be driven by actual simulation/job state, not played as cosmetic randomness.** A
villager's visible activity has to correspond to what the simulation says they're actually doing
(`Citizen.task`, `jobId`, `buildSite`, workplace status) — the same "renderer reads state, never
decides it" rule the rest of `src/render/` already follows (see `CLAUDE.md` "Unity migration
architecture").

#### Priority animations (first)
1. Walking
2. Idle
3. Woodcutting
4. Building
5. Mining
6. Fishing

#### Next animation group
7. Farming
8. Gathering
9. Hunting
10. Blacksmithing
11. Tailoring
12. Herbalist work
13. Carrying resources

#### Example job → animation sequences
- **Woodcutter:** walk → arrive at tree → equip/raise axe → swing → tree reaction → repeat → stop →
  carry logs.
- **Builder:** walk → arrive at construction site → building/hammer animation → repeat → construction
  completion → leave.
- **Miner:** walk → enter/work at mine → pickaxe animation → repeat → leave/carry resources.
- **Fisher:** walk → arrive at fishing location → cast → wait → reel/catch → repeat.

#### Architecture decision: keep this lightweight
The browser prototype should **not** receive a large, complicated animation framework, since Unity is
the intended production platform. The purpose of this phase is to:

- Establish the required animation states.
- Establish job-to-animation mappings.
- Verify the simulation actually exposes the events/state transitions animation needs.
- Identify any missing simulation states animation would need that the sim doesn't currently expose.
- Prove the visual behaviour out where practical, cheaply.

The **full production animation system belongs in Unity** (Phase 5), not here.

---

### Phase 3 — Unity migration 🔜 next

Unity becomes the primary production platform. The existing Three.js/browser build **remains
available** as the gameplay and systems reference — it is not being deprecated or removed.

**Feature parity before redesign.** Do not redesign the game simply because it's moving engines.
Preserve the proven gameplay systems as-is:

- Simulation rules
- Economy
- Production ratios
- Building costs
- Progression
- Trade values
- Merchant behaviour
- Population behaviour
- Policies
- Disasters
- Save concepts
- Core UI/UX
- Game pacing

`CLAUDE.md`'s "Unity migration architecture" section already classifies which parts of the codebase
are directly portable (Category A: production formulas, trade values, progression/achievement
conditions), which need a rewrite but keep their design (Category B: the villager task machine,
construction, disasters, save schema), and which are engine-specific and get rebuilt outright
(Category C: `src/render/`, `src/engine/`; Category D: `localStorage`, DOM, PWA). Use that
classification as the migration's own work-breakdown — it was written for exactly this transition.

---

### Phase 4 — Unity core architecture ⏳

Create Unity equivalents for the major systems, preferring a **data-driven** architecture — the same
table-driven convention the browser build already uses for `BUILDING_DEFS`, `RESOURCE_*`, `TRADE_VALUE`
(Category A tables port close to directly). Keep gameplay values separated from visual/animation
components wherever practical, mirroring the browser build's simulation/presentation split.

Include:

- Game state
- Simulation/tick system
- Seasons & years
- Villagers
- Jobs
- Buildings
- Resources
- Inventory
- Storage
- Production
- Construction
- Hauling
- Trade
- Population
- Progression
- Policies
- Disasters
- Save/load

---

### Phase 5 — Production villager animation system (Unity) ⏳

A major Unity milestone. Create a proper animator/state system supporting:

- Idle
- Walking
- Carrying
- Working
- Job-specific actions
- Transitions
- Interrupted work
- Returning to idle/walking
- Simulation-driven animation state

Build a clear mapping between simulation jobs and visual animations, in this priority order:

1. Woodcutter
2. Builder
3. Miner
4. Fisher
5. Farmer
6. Gatherer
7. Hunter
8. Blacksmith
9. Tailor
10. Herbalist

Also include resource-carrying animations. Phase 2's browser-side state/mapping work feeds directly
into this — the goal is that the job → animation mapping and the missing-simulation-state findings
carry over rather than being re-derived from scratch.

**Goal:** a player can zoom into their village and understand what villagers are doing simply by
watching them.

---

### Phase 6 — Final audio (Unity) ⏳

Sound event *wiring* is already ✅ **complete** (Phase 1) — this is different from having final,
production-quality audio **assets**. Unity should become the final audio implementation; the browser
build's event architecture (`src/audio/`) is the reference for what needs to trigger, when, and how
often — don't unnecessarily rebuild that event architecture if it already provides the required
triggers, since the concurrency/cooldown/variation rules it encodes were already unit-tested.

Categories:

- **Environment** — wind, water, birds, forest ambience, seasonal ambience, rain, storms.
- **Villagers** — footsteps, tool impacts, chopping, mining, building, fishing, farming, carrying/work
  sounds.
- **Buildings** — construction, building completion, production, blacksmith, workshops, market, port.
- **Gameplay feedback** — resource collection, building placement, building completion, notifications,
  progression/tier advancement, policy changes, trade completion, disaster events.

Use variation/randomisation where appropriate so repeated actions don't become irritating — the
browser build's `pickVariationAvoidingRepeat` rule is the pattern to carry over.

---

### Phase 7 — Visual polish ⏳

After the Unity core and animation systems are functioning:

- Lighting
- Shadows
- Materials
- Water
- Fire
- Smoke
- Resource-gathering effects
- Construction effects
- Seasonal visuals
- Weather
- Day/night atmosphere
- Vegetation
- Terrain
- Building polish
- Camera behaviour
- Ambient village activity

**Goal:** make the village feel alive.

---

### Phase 8 — Mobile optimization ⏳

Unity development should target mobile performance from the beginning, not as an afterthought:

- Object pooling
- Efficient simulation
- Efficient pathfinding
- LOD
- Culling/occlusion where appropriate
- Texture optimization
- Mesh optimization
- Draw-call reduction
- Animation optimization
- Memory management
- Battery-conscious simulation
- Touch controls

Testing must eventually include actual target phones, not just the Unity Editor.

---

### Phase 9 — UX polish ⏳

Review and improve:

- Building placement
- Camera controls
- Touch controls
- Villager inspection
- Job information
- Production feedback
- Resource information
- Notifications
- Tooltips
- Town Hall UI
- Trade UI
- Save/load UI
- Progression feedback

The player should always be able to understand: **(1)** what is happening, **(2)** why it's happening,
**(3)** what they can do about it.

---

### Phase 10 — Final gameplay validation ⏳

After Unity reaches feature parity, perform structured testing:

- Early / mid / late game
- Population growth
- Food economy
- Tools
- Clothing
- Trade
- Luxury economy
- Disasters
- Progression
- Policies
- Storage
- Hauling
- Large villages
- Mobile performance

**Do not rebalance based solely on theoretical simulation numbers.** Use actual player-style village
layouts and optimized logistics when evaluating economic systems — the same standard `PLAYTEST.md`'s
B6/B13/B14 measurements already held themselves to (real simulated ticks, not arithmetic alone).

---

### Phase 11 — Release preparation ⏳

- Final save system
- Settings
- Audio settings
- Graphics settings
- Tutorial/onboarding
- Error handling
- Performance profiling
- Device testing
- Build pipeline
- App icon
- Store screenshots
- Store description
- Privacy/legal requirements
- Final QA

---

## Roadmap philosophy

Little Village is no longer primarily in the "add more systems" phase. It is transitioning from:

> **"Can we make the game?"**

to:

> **"Can we make the game feel alive, polished, performant, and production-ready?"**

The next major improvements should therefore prioritize, in this order:

**Simulation → Animation → Audio → Visual feedback → Performance → UX**

rather than continuously adding new gameplay mechanics. The browser/Three.js build stays the gameplay,
balance, and UI/UX reference throughout — Unity is where the production experience gets built, not a
from-scratch redesign of the game itself.

---

## Current priority

**NOW**
1. **Villager animation foundation** (Phase 2, browser). Priority animations: walking, idle, chopping,
   building, mining, fishing.

**NEXT**
2. **Unity migration** (Phase 3). Begin moving the proven game systems into Unity.

**THEN**
3. **Unity production animation system** (Phase 5). Connect villager animations directly to
   simulation/job states.
4. **Final audio implementation** (Phase 6). Replace placeholder/prototype sound with production-
   quality audio using the existing sound event architecture.
5. **Visual polish** (Phase 7). Lighting, effects, environment, seasons, weather, fire, smoke, water.
6. **Mobile optimization** (Phase 8). Profile and optimize on actual target devices.

**FINALLY**
7. **Final QA, balance validation, and release preparation** (Phases 10–11).

---

*This roadmap should be updated at the end of each phase. Items graduate from 🎯/⏳/👉/🔜 to ✅ as they
land, and new concrete items are added only when they're genuinely planned — not speculative.*
