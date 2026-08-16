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
| **6** | Achievements | ⏳ |
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

### Phase 6 — Achievements ⏳
- ⏳ Review the 80 achievements (`src/game/achievements.ts`) for reachability and correct
  live-vs-tally sourcing; verify none are unobtainable after the recent economy changes.

### Phase 7 — UI/UX polish ⏳
- 🎯 **Top-line HUD wraps to two rows** at 430px with the nine requested chips; fitting one row needs
  materially smaller chips or a horizontal scroll (which hides items on mobile). Decide the trade-off.
- ⏳ **Per-crop field art** — `CROP_DESIGN` already carries a distinct `color` and a **reserved
  `model` slot** per crop; renderers draw a generic field today. Next step is real per-crop art at
  the `drawFarm`/`makeFencedPlot` hook, or a cheap first pass tinting the field by
  `cropDesign(crop).color`.
- ⏳ **Ranch 3D animal glyphs** — the 2D renderer shows live animals/count in a pen; the 3D one does
  not yet.

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
