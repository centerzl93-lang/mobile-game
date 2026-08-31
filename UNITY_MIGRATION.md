# UNITY_MIGRATION.md — Little Village

Reference doc for `ROADMAP.md` Phase 3 ("Unity migration"). Covers the three concrete deliverables of
that phase: where the Unity project should live relative to this repo, the bootstrap steps a human
runs locally (this can't be done from an automated coding session — no Unity Editor, Xcode, Android
SDK, or physical devices are available there), the parity harness that proves the future C# port
matches this one, and the save-migration decision. See `CLAUDE.md`'s "Unity migration architecture"
section for the Category A/B/C/D classification this whole migration is organized around.

---

## Repository structure

**Don't nest the Unity project inside `mobile-game`, and don't copy this repo into it.** Create a
**new, separate Git repository** for the Unity project instead (e.g. `little-village-unity`).

Why: Unity Hub generates the project's own folder shape (`Assets/`, `Packages/manifest.json`,
`ProjectSettings/`) when you create a New Project — nothing from this repo goes inside it directly.
Unity's `Library/`/`Temp/`/`Build` folders are large and churn on every Editor open, and need Unity's
own `.gitignore` convention — mixing that with this repo's Pages-deploy CI (pinned to `main` pushes,
see `CLAUDE.md`'s canonical-branch note) tangles two unrelated toolchains for no benefit.

What actually needs to cross the boundary is **data, not code**: this repo's **parity-harness
fixtures** (`parity-fixtures/`, below) get generated here and copied into the new Unity repo — e.g.
under `Assets/StreamingAssets/ParityFixtures/` — so the C# test suite (Phase 4b) can assert against
them. A plain copy-and-commit is enough for JSON files; a git submodule pointing at this repo is an
option later if tighter coupling is ever wanted, but isn't necessary just for this.

## Unity project bootstrap (run locally)

1. **Unity Hub** → install the latest Unity **LTS**. Add the **iOS Build Support** and **Android
   Build Support** platform modules from the same install screen.
2. **New Project** → the **URP** template (Core / "3D (URP)") → point it at the new, separate repo's
   folder. Unity Hub generates the project structure — don't hand-build `ProjectSettings`/
   `Packages/manifest.json` yourself.
3. **Orientation** — `ROADMAP.md` already settled this: **landscape**, locked at the project level.
   In **Project Settings → Player → Resolution and Presentation**, set Default Orientation to
   **Landscape** (Auto Rotation, Landscape Left/Right allowed, Portrait unchecked) for **both** the
   iOS and Android Player tabs.
4. **Placeholder native identity** — a bundle ID (iOS) / package name (Android) good enough to
   produce a signed build. The *real*, permanent identity is Phase 11a's job, not this one — don't
   treat whatever you type here as final.
5. **Recommended `Assets/` layout**, mirroring `CLAUDE.md`'s four-layer split so Phase 4's actual
   port has somewhere sensible to land — lightweight, not prescriptive:
   ```
   Assets/_Project/
     Data/          # Phase 4a — ScriptableObjects for BUILDING_DEFS, RESOURCE_*, TRADE_VALUE, tiers
     Simulation/     # Phase 4b — the C# update() pipeline, renderer-free
     Presentation/   # Phase 4/7 — scenes, materials, prefabs, animation
     Platform/       # Phase 4c — save/load, app lifecycle, input
   ```
6. **One development build per platform, deployed to a physical device** (this is the actual Phase 3
   acceptance bar — the Editor running the empty template isn't):
   - **iOS**: File → Build Settings → switch platform to iOS → Build (generates an Xcode project) →
     open it in Xcode → set a signing team → Build & Run to a connected iPhone.
   - **Android**: switch platform to Android → enable USB debugging on the device → Build And Run
     (or build an APK and `adb install` it).
7. Mark both device builds done once you've actually run them — this is the one Phase 3 item that
   has to be attested locally; it can't be verified from an automated session.

## Parity harness

Implemented in this repo — see `parity-fixtures/README.md` for the full contract. In short:
`tools/parity/scenarios.ts` scripts a fixed set of seeded action sequences against the real
`src/game/*` simulation (no browser needed, the same "pure simulation-in,
assertions-on-`GameState`-out" style `sim-tests/` already uses), `npm run parity:export` writes the
resulting `GameState` at each checkpoint to `parity-fixtures/`, and
`sim-tests/parity-fixtures.test.ts` is the regression gate that keeps them from silently drifting.

The C# port (Phase 4b) is **done** for a given scenario/checkpoint when, given the same seed and the
same scripted actions, it reproduces the same fixture — see `parity-fixtures/README.md`'s comparison
notes (exact match on integers/strings/booleans, and in practice on floats too, since both languages
do IEEE-754 double arithmetic in the same operation order).

## Save-migration decision

**Native installs start fresh.** No native build reads a web `localStorage` blob — that decision is
already final (see `ROADMAP.md`'s "Settled Unity-specific decisions"). What ports is the
save-schema **concepts**, not the stored bytes, so Phase 4c has a precise spec rather than needing to
re-derive one from prose. From `src/game/save.ts`'s real API:

- **A versioned envelope**: `{ v: number, state: GameState }`. The port doesn't need to match the
  TypeScript build's version numbers (`VERSION = 15`, `MIN_VERSION = 12` today) — it needs its own
  version counter with the same shape.
- **Numbered migrations, keyed by the version they upgrade *from***, walked in order up to the
  current version on load — never a single big "convert anything old" function. (`MIGRATIONS` in
  `save.ts` is the reference: v12→v13 backfills `seed`/`rng` for pre-RNG saves, v13→v14 backfills
  `stats`, v14→v15 handles a removed merchant category and a new boat-routing flag.)
- **Load-time field defaults** for fields added *without* a version bump — a save missing a field
  gets a real default (`0`/`false`/`[]`/a merged default object), never `null`/`NaN`/a crash. Keep
  this mechanism narrow and never derive a default from a live tunable constant that might move
  later (`save.ts`'s own comment on its frozen legacy rescalers explains why: a migration that reads
  a constant which changes after the migration shipped silently reinterprets old saves).
- **3 manual slots + 1 dedicated autosave slot** (`SLOTS = 3`, a 4th index reserved for autosave in
  the TypeScript build) — the count itself isn't sacred, but the shape (a few player-named slots
  plus one that autosave owns exclusively) is worth keeping.
- **Slot display names stored outside the envelope**, so autosave doesn't have to round-trip a name
  it never changes.
- **A structural soundness guard before every write** (`validState` in `save.ts`) — refuse to save a
  state that's missing basic invariants (array lengths matching the map dimensions, required fields
  present) so a corrupt in-memory state can never overwrite a good save on disk.

Cloud saves (Phase 11c) are pursued only once this native local save system is stable — they're an
addition on top of it, not a substitute for getting the local version right first.
