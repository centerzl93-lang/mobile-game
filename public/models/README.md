# 3D models

Every building, the pine and the loose rock are modelled here. They are **built from the Python
scripts in `tools/models/`** rather than checked in as opaque binaries — see that folder's README
to change one. This file describes how the *game* consumes what those scripts produce.

## What is in here

- `<name>.gltf` + `<name>.bin` — one model each. The `.gltf` is JSON (readable, diffable); the
  `.bin` holds its vertex data.
- `manifest.json` — what the game loads, and which building type each model belongs to.

**Textures are not stored here.** Each `.gltf` references `../textures/mat_*.png`, which is
where the terrain gets its materials too. That is deliberate: a self-contained `.glb` embeds
every image it uses, and with two dozen buildings drawing on the same handful of materials that
meant ~620 KB of duplicated PNG per file. Referencing the shared textures instead keeps each
model at a few tens of KB and the whole village under about 1.5 MB, most of which is textures
downloaded once.

## Adding or replacing a model

1. Put `<name>.gltf` (and its `.bin`) in this folder.
2. List it in `manifest.json`:

   ```json
   {
     "buildings": { "house": "house.gltf", "barn": "barn.gltf" },
     "trees": ["pine.gltf"],
     "rocks": ["rock.gltf"]
   }
   ```

3. Reload. The loader auto-centers each model on its footprint, drops it to ground level and
   scales it to the building's plot, so exact size and origin in the source file are forgiving —
   orientation is not (see the conventions in `tools/models/README.md`).

Anything absent or failing to load keeps its placeholder box, so the game never regresses on a
missing or broken file.

Models are cached by the service worker, so a returning player would otherwise keep the copy
fetched on their first visit. Their URLs carry the build's commit as `?v=…`, which changes the
cache key on every deploy — new art reaches existing installs without any manual cache clearing.

## Building keys

`manifest.json` → `buildings` maps a **building type** to a filename. Valid keys:

```
house  stonehouse  tavern  chapel  cemetery  gatherer  farm  fishing  hunting  ranch
lumberyard  woodcutter  quarry  mine  blacksmith  tailor  trading  school  herbalist
hospital  well  market  barn
```

`farm` and `ranch` are drawn as fenced plots sized by the player, so they ignore any model
listed for them.

`trees` and `rocks` are arrays of filenames used for the forest and loose-stone props (instanced
across the map; the game picks the first that loads).

## If you want to use third-party models instead

Nothing stops you dropping in an external `.glb` — the loader handles both formats. Use only
assets whose license permits it (CC0 needs no attribution; CC-BY does), record them in
[`CREDITS.md`](./CREDITS.md), and **never use assets from a commercial game** — this project is
entirely original. Good CC0 sources: KayKit (kaylousberg.itch.io), Kenney (kenney.nl),
Quaternius (quaternius.com), Poly Pizza (poly.pizza).
