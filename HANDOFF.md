# Session Handoff — Banished-inspired Village Builder PWA

> Living doc. Update the **State** and **Next steps** sections at the end of each session.
> Last updated: 2026-07-22

## Project
Original Banished-inspired 3D village-builder **PWA**: TypeScript + Three.js (v0.185.1) +
Vite + vite-plugin-pwa, installable on iPhone, deployed to GitHub Pages.

- **Repo:** `centerzl93-lang/mobile-game`
- **Working branch:** `claude/banished-ios-app-b4zott` (only push here; don't open PRs unless asked)
- **Asset rule:** CC0/permissive only — never Banished's copyrighted assets.

## Current State
All work through **manual staffing + 16 seed-gated crops** is complete, committed, and pushed.
Branch HEAD = `a4d43a8` ("Add 16 seed-gated crop varieties and manual workplace staffing").

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
- `src/types.ts` — crops/foods, `CROP_META`, `SEED_COST`, `DIET_VARIETY_TARGET`, resource tables.
- `src/game/state.ts` — `seeds` seeding by difficulty; `makeBuilding` defaults (`desiredWorkers 0`).
- `src/game/buildings.ts` — `placeBuilding` (`desiredWorkers 0` + crop default).
- `src/game/simulation.ts` — seed-gated farm output/harvest, diet rebalance, `buySeed`/`seedCost`.
- `src/game/save.ts` — `seeds` default + stale-crop reset.
- `src/ui/ui.ts` / `src/main.ts` — seeded-only crop toggle, Seeds buy section, `onBuySeed`.
- `src/render/renderer.ts` — 2D colour map for the new foods.
- `tests/newgame.spec.ts` — seed-gate + unstaffed-placement tests.

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
- None pending. Awaiting new direction.
