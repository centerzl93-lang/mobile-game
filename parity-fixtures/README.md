# Parity-harness fixtures

Golden-master `GameState` snapshots for the Unity migration (`ROADMAP.md` Phase 3 "Parity harness").
The simulation is fully deterministic (a seeded `mulberry32` stream — see `src/game/rng.ts`), so given
the same seed and the same scripted action sequence, the future C# port must land on the exact same
state at every checkpoint below. These fixtures are that oracle, captured from the TypeScript
reference implementation.

## What's here

One directory per scenario (`tools/parity/scenarios.ts` is the source of truth for what each one
does), one JSON file per checkpoint:

```
parity-fixtures/<scenario>/<checkpoint>.json
```

Each file is:

```json
{
  "scenario": "early-growth",
  "seed": 2002,
  "checkpoint": "season-1",
  "state": { /* the full GameState, verbatim */ }
}
```

`state` is exactly what `src/game/save.ts`'s `serialize()` would write to a save slot — nothing
stripped, nothing rounded. That's a deliberate choice, not an oversight: the codebase's own save
system holds that "the whole state is written" because even fields that look transient (per-citizen
task/nav state, in-flight construction stores) affect exact reproduction, and the same reasoning
applies here — a C# port that reproduces population and resources but drifts on, say, a citizen's
`task` state has not actually reproduced the simulation.

## Scenarios

| Scenario | What it exercises |
|---|---|
| `founding` | World generation + the starting village, a pure function of the seed. |
| `early-growth` | Placing sites and letting builders/laborers/producers finish them — construction, hauling, consumption — over four seasons. |
| `full-year` | A full calendar year of organic play from the founding village alone — calendar, tier, ledger. |
| `disasters` | The shared BURNING/DAMAGED state machine for all four hazards, forced deterministically (see the scenario's own comments in `scenarios.ts` for exactly how each one is triggered without relying on a chance roll). |
| `trade` | A Trading Post from founding, then organic river-merchant barter. |

## Regenerating

```
npm run parity:export
```

This is a **deliberate, reviewed step**, not something CI does automatically. The actual regression
gate is `sim-tests/parity-fixtures.test.ts` (part of `npm run test:sim`): it re-runs every scenario
fresh and deep-equals the result against what's committed here. If it fails, either:

- the simulation changed unintentionally — fix the regression, don't regenerate; or
- the simulation changed on purpose — run `npm run parity:export`, review the diff like any other
  behavioural change, and commit the updated fixtures alongside the code change that caused them.

## How the C# side should use these

Drive the Unity/C# simulation with the same seed and the same scripted actions the scenario
describes (see `scenarios.ts` — `place()`/`finishedBuilding()`/`advance()` map directly onto
placement + fixed-timestep `update()` calls), then compare the resulting state against the matching
checkpoint file. A few notes for that comparison:

- **Integers, strings, booleans, arrays of those** (population counts, building types/ids/positions,
  resource amounts, tier, season/year, the RNG cursor itself) should match **exactly** — the whole
  simulation is integer/seeded-stream driven at its core.
- **Floats accumulated by repeated `dt` addition** (ages, timers, seasonTimer) are IEEE-754 double
  arithmetic in both JS and C# with the same operation order, so they should also match exactly in
  practice; treat a tiny (`&lt;1e-9`) discrepancy as a rounding-mode difference worth noting, not
  automatically a bug, but don't build the comparison with a large tolerance baked in — the point of
  this harness is to catch real divergence, not paper over it.
- `state.rng` matching at every checkpoint is the strongest single signal that the C# port is
  drawing randomness the same number of times, in the same order, as the TypeScript original — it's
  worth asserting on explicitly, not just implicitly via whatever it influenced.
