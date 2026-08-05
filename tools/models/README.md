# Model sources

The models in `public/models/` are **built from the Python scripts in this folder**, so the
village lives in git as readable, diffable source instead of opaque binaries. Changing a roof
pitch is a one-line diff and a rebuild, not a re-export from someone's laptop.

Layout of this folder:

- `common.py` — primitives, materials, UV projection, export.
- `style.py` — the palette and the two signature treatments (`half_timber`, `shingled_roof`).
- `parts.py` — the shared prop vocabulary: decking, fences, log piles, barrels, racks, lean-tos.
- `house.py`, `homes.py`, `food.py`, `wood.py`, `digging.py`, `craft.py`, `civic.py` — the
  buildings, grouped by trade. `pine.py` and `rock.py` are the map props.
- `build.py` — the registry mapping each model name to the function that builds it.

## Build

Needs Blender available as a Python module (this is Blender itself, not a binding — no separate
Blender install required):

```
pip install "bpy==4.5.12"        # needs Python 3.11
python3 tools/models/build.py           # build everything
python3 tools/models/build.py house     # build one model
```

Each model is written to `public/models/<name>.gltf` (plus a `.bin`), referencing the shared
textures in `public/textures/` rather than packing its own copies. Register it in
`public/models/manifest.json` for the game to load it — see `public/models/README.md`.

Textures come from `tools/textures/materials.py`; rerun that if you change a material, then
rebuild the models so they pick up the new maps.

**A bare `build.py` retints the whole village.** The glTF exporter cannot represent the Mix node
that multiplies a texture by its material colour, so `export_gltf` writes the colour back as
`baseColorFactor` (see `common.py`). That fix landed after every building had already been
exported, and only the tree models have been rebuilt since — so rebuilding everything applies
never-before-shipped tints to all 29 models at once. That is a deliberate visual change, not a
no-op rebuild. Build the models you actually changed (`python3 tools/models/build.py barn school`),
and if only their geometry moved, drop the new factor back out of any material that also has a
`baseColorTexture` so they still match their neighbours.

## Editing by hand in Blender

These are ordinary Blender scripts. To work on one interactively:

1. Open Blender → **Scripting** tab → **Open** → pick e.g. `house.py`
2. Add this folder to the script's path, or paste `common.py` into the same text block
3. **Run Script** — the model appears in the viewport, ready to sculpt

If you hand-edit a model in Blender and want to keep the result, either fold the change back into
the script (preferred — keeps the source of truth in git) or export over the built file and note
in the script that it is no longer authoritative.

## Conventions

- **1 Blender unit = 1 map tile.** A 2×2-tile house is 2 units wide. Check `BUILDING_DEFS` in
  `src/types.ts` for each building's `w`/`h`.
- **Face +Y in Blender** (the exporter converts to the game's +Z forward). There is no
  auto-rotation on load, so orientation is the one thing you must get right.
- **Low-poly, flat-shaded.** These render small on a phone — put the detail in the silhouette,
  not the surface.
- `normalize()` in `src/render/models.ts` re-centers each model on its footprint, drops it to
  ground level, and scales it to the building's tile size, so exact size and origin here are
  forgiving. Note it scales by the **horizontal** footprint, so a tall narrow model comes out
  very tall — flag it and we can add a per-model override.
