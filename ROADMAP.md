# ROADMAP.md — Little Village

The current development roadmap. **This lists only work that is actually planned** — the phased plan
being followed, plus concrete items already scaffolded or explicitly flagged "next step / reserved"
in the code and `HANDOFF.md`. It intentionally does **not** invent features. Speculative "could-do"
ideas are out; when an item is a decision rather than a build, it says so.

Status legend: ✅ done · 🔜 next · ⏳ planned · 🎯 needs-playtest/decision.

---

## Phased plan

The project is being taken through these phases in order:

| Phase | Focus | Status |
|---|---|---|
| **0** | Repository cleanup & project documentation | ✅ done |
| **1** | Simulation stability | 🔜 next |
| **2** | Construction & workforce | ⏳ |
| **3** | Save/load reliability | ⏳ |
| **4** | Progression balancing | ⏳ |
| **5** | Luxury economy & Port balancing | ⏳ |
| **6** | Achievements | ✅ done |
| **7** | UI/UX polish | ⏳ |
| **8** | Full balance / playtesting | ⏳ |
| **9** | Final polish / release | ⏳ |

### Phase 0 — Repository cleanup & documentation ✅
- ✅ Made `main` the single canonical branch (fast-forwarded from the playable build); preserved the
  snapshot as `backup/v0.1.0` + tag `v0.1.0-pre-canonical`; deleted the stale `claude/*` branches.
- ✅ Narrowed both workflow triggers to `main`; refreshed `HANDOFF.md` branch notes.
- ✅ Authored `CLAUDE.md`, `ROADMAP.md`, `PLAYTEST.md`.

### Phase 1 — Simulation stability 🔜
Concrete, code-grounded items (see `PLAYTEST.md` for detail):
- 🔜 Harden the flaky **path-confirm** test (`tests/newgame.spec.ts` › "cancelling a drawn path
  clears it back to bare ground", `@slow`) — camera/timing-sensitive `#confirm` visibility.
- ⏳ Address the residual **"walking-budget" suite flakiness** pattern (tests that depend on a
  villager walking somewhere within a step budget on a random map) — stand villagers where the work
  is; count carried loads everywhere, not only in barns.
- 🎯 Watch the **fuel-delivery** failure mode: with the barn fall-back removed, a household its
  hauler never reaches can freeze beside a full barn. If it bites, the fix is in `stockLarder` / the
  hauler round, not the fuel stock.

### Phase 2 — Construction & workforce ⏳
- ✅ **Construction cancellation.** Cancelling an unfinished site (`cancelConstruction`) removes it,
  refunds `CANCEL_REFUND_FRACTION` (0.9) of the materials already delivered, releases the crew /
  standing staffing order, and cancels the in-flight hauling — behind a player confirmation, with a
  **Cancel construction** control on the site's inspect sheet.
- ✅ **Clear-then-deliver ordering.** Materials are no longer hauled to an obstructed plot: both
  fetching and building now gate on `footprintClear`, so the sequence is place → clear → deliver →
  construct. Verified builder assignment/release and disabled-workplace release with regression tests.
- 🎯 **Do the big buildings cost too little?** (a decision, not a build) — an 8×8 quarry, 6×6 mine and
  5×9 trading post kept their small-footprint costs when footprints grew. Counter-argument: the
  *land* is now the real cost. One-line edits in `BUILDING_DEFS` if raised.
- 🎯 **Work circles don't grow with building size** — `workRadius` is still measured from centre, so a
  big foraging building spends more of its circle on its own footprint (yields sag). Scaling the
  radius in `workRadiusOf` is a couple of lines but is a balance change wanting playtest. (The fishing
  hut already handles this via `dockDepth`.)

### Phase 3 — Save/load reliability ⏳
- ⏳ Exercise and validate the migration path end-to-end (`VERSION` 14, `MIN_VERSION` 12; numbered
  `MIGRATIONS` + load-time defaults; `ageScale`/`workScale` rescalers).
- 🎯 **Old saves with grown footprints** can overlap or wall a door. Current policy is "start a new
  game" rather than build migration machinery for it — confirm this remains the intended stance.

### Phase 4 — Progression balancing ⏳
- 🎯 **Difficulty is only a leg-up, not a ration** now (food/fuel/tools/coats identical across
  Easy/Normal/Hard; only materials, medicine and Easy's free houses differ). If Normal needs to bite
  harder, the lever is starting *materials* / `EASY_START_HOUSES`, not per-difficulty rations.
- 🎯 **Housing as the growth lever** — a couple needs a free house to form. Verify this reads as a
  clear "build more houses" prompt rather than as the village being stuck.
- 🎯 Review the tier gates (`TIER_META`) and birth/immigration pacing against real playthroughs.

### Phase 5 — Luxury economy & Port balancing ⏳
- 🎯 Balance the luxury chain (sand → glass → jewellery → fine goods) and port fleet stock/prices
  (`MERCHANT_CATEGORY_STOCK` port entries, `PORT_ARRIVAL_CHANCE`, `TRADE_VALUE`).
- ⏳ **Trading-post / port polish** (optional): a HUD cue for an arriving boat; tune
  `MERCHANT_ARRIVAL_CHANCE` / category stock.
- ⏳ **Grow the luxury chain** — the `LuxuryRecipe` union is deliberately open for another bench
  (e.g. furniture) as an extension, not a new building.
- ⏳ **Port standing/reputation** — `portTradeCount` is kept as the bare tally a future
  reputation-with-a-fleet system would build on ("a system for later").

### Phase 6 — Achievements ✅
- ✅ Reviewed the 80 achievements (`src/game/achievements.ts`) for reachability and correct
  live-vs-tally sourcing. The existing infrastructure — the 80 milestone table, the per-village
  `VillageStats` tallies stamped in `recordSeasonStats`, the global `localStorage` unlocked set, the
  100ms `checkAchievements` clock, and the achievements panel — is sound and covers every category
  (building, resource, population, trade, port, luxury, tier, happiness, survival). No new
  architecture was added; nothing is unobtainable after the economy changes.
- ✅ **Fixed the "Build your first house" reliability bug.** `checkAchievements` runs on the 100ms UI
  clock, but the `placedTypes`/`builtTypes` tallies are only stamped at *season turnover*
  (`recordSeasonStats`). Every "Build your first X" check read `placedEver` off that tally, so a
  freshly placed building did not light its milestone until the next season boundary — up to ten real
  minutes later. `placedEver` now reads the **live** buildings first (a site counts the instant it is
  laid down) and falls back to the persisted tally (so a type placed-and-demolished in a past season
  still counts, and it survives save/load). This is a one-helper change — no per-building logic was
  scattered around the code.
- ✅ Added `tests/achievements.spec.ts` coverage: placing a house unlocks `house1` on the next clock
  tick off the live village (regression), an earned achievement never re-fires/re-celebrates/duplicates
  in storage, and the `placedTypes` tally works as a save/load fallback.

### Phase 7 — UI/UX polish ⏳
- 🎯 **Top-line HUD wraps to two rows** at 430px with the nine requested chips; fitting one row needs
  materially smaller chips or a horizontal scroll (which hides items on mobile). Decide the trade-off.
- ✅ **Per-crop field art (3D) — five growth stages, three archetypes, a real ground surface** —
  `makeFarmField` furrows the plot and grows a crop stand through five distinct stages (`CropStage`:
  empty → seeded → growing → mature → harvest, via `cropStageOf`), built from one of three crop
  *archetypes* (`CROP_STYLE`): a grain's clustered stalks (`buildStalkPlant`), a vegetable's leaf
  rosette (`buildLeafyPlant`), or a fruiting bush (`buildFruitPlant`) — shape changing with both the
  archetype and the stage, tinted by `cropDesign(crop).color`. Every one of the 16 crops sorts into a
  family by table row alone, so a new crop needs no new geometry to get all five stages.
  `farmDisplayGrowth` computes a smooth 0→1 value straight from the calendar (0→0.5 over spring,
  0.5→1 over summer) rather than reading the stored `b.growth`, which only ever holds three values —
  exactly right for the harvest yield formula, too coarse to watch a field grow. Purely a rendering
  input; it never feeds back into `b.growth` or the harvest math. Swept by `newgame.spec.ts`'s "every
  crop ... moves through all five growth stages" test via the `debugCropStage`/`debugCrops` hooks.
  The ground itself (`makeHeightGrid` + `plotTexture`, shared with the ranch pen) is a continuous
  height-following mesh with a tileable procedural soil/turf texture and baked-in furrows, replacing
  the old slab-per-tile flat fill. The 2D `drawFarm` still draws every crop the same generic tilled
  soil; real per-crop *authored models* (the reserved `CropDesign.model` slot, or small
  Blender-authored stalks instanced like the trees) remain future work — `bpy` isn't guaranteed
  available, and a field's variable, scattered planting doesn't fit a fixed-size model the way one
  building does.
- ✅ **Ranch 3D animal glyphs** — `makeRanchPen` scatters low-poly critters (shape/size/colour by
  `RanchAnimal`, capped and refreshed with the herd) across the pen, closing the gap with the 2D
  renderer.

### Phase 8 — Full balance / playtesting ⏳
- 🎯 Whole-economy **balance review** of the dials that moved recently and want play, not more code:
  `CONSUMPTION_SLOWDOWN` (3), housing capacity (8/10), `HOUSE_LARDER_SEASONS` (0.5) with the ×3
  larder basket, the `SEASON_BURN` table (year-round firewood/clothing), and the birth rates.

### Phase 9 — Final polish / release ⏳
- ⏳ **Repo rename** to `little-village` (manual, in GitHub Settings → General; no API for it). *After*
  renaming, update the base path in lockstep or Pages breaks: `vite.config.ts` `BASE`,
  `playwright.config.ts` `BASE`, the `/mobile-game/` URLs in `README.md`, and the Repo line in
  `HANDOFF.md`. (Package name is already `little-village`.)
- ⏳ Final PWA/deploy verification and release cut.

---

*This roadmap should be updated at the end of each phase. Items graduate from 🎯/⏳ to ✅ as they land,
and new concrete items are added only when they're genuinely planned — not speculative.*
