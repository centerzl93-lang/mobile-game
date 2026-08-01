# Model sources

The `.glb` files in `public/models/` are **built from the Python scripts in this folder**, so the
models live in git as readable, diffable source instead of opaque binaries. Changing a roof pitch
is a one-line diff and a rebuild, not a re-export from someone's laptop.

## Build

Needs Blender available as a Python module (this is Blender itself, not a binding — no separate
Blender install required):

```
pip install "bpy==4.5.12"        # needs Python 3.11
python3 tools/models/build.py           # build everything
python3 tools/models/build.py house     # build one model
```

Each model is written to `public/models/<name>.glb`. Register it in
`public/models/manifest.json` for the game to load it — see `public/models/README.md`.

## Editing by hand in Blender

These are ordinary Blender scripts. To work on one interactively:

1. Open Blender → **Scripting** tab → **Open** → pick e.g. `house.py`
2. Add this folder to the script's path, or paste `common.py` into the same text block
3. **Run Script** — the model appears in the viewport, ready to sculpt

If you hand-edit a model in Blender and want to keep the result, either fold the change back into
the script (preferred — keeps the source of truth in git) or export the `.glb` over the built one
and note in the script that it is no longer authoritative.

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
