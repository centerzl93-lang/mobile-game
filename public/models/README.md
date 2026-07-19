# Drop-in 3D models

The game renders in 3D (Three.js). Buildings, trees, and rocks show **placeholder shapes**
until you add real low-poly models here. This is entirely optional and incremental — add one
file or all of them; anything you don't provide keeps its placeholder.

## How to add models

1. Get some **low-poly `.glb`** models (see *Where to get them* below). One model per file.
2. Put the `.glb` files in **this folder** (`public/models/`).
3. List them in **`manifest.json`** so the game loads them. Example:

   ```json
   {
     "buildings": {
       "house": "house.glb",
       "barn": "barn.glb",
       "chapel": "church.glb",
       "well": "well.glb"
     },
     "trees": ["pine.glb", "oak.glb"],
     "rocks": ["rock.glb"]
   }
   ```

4. Reload the game. That's it — the loader auto-centers each model on its footprint, drops it
   to ground level, and scales it to the building's tile size, so exact size/orientation in
   the source file doesn't matter much. (If something looks too big/small or turned the wrong
   way, tell me and I'll add a per-model scale/rotation tweak.)

You do **not** need to redeploy code — models are plain assets. For the installed PWA, the
first load after adding a model must be online; after that it's cached for offline play.

## Building keys

`manifest.json` → `buildings` maps a **building type** to a filename. Valid keys:

```
house  stonehouse  tavern  chapel  cemetery  gatherer  farm  fishing  hunting  ranch
lumberyard  woodcutter  quarry  mine  blacksmith  tailor  trading  school  herbalist
hospital  well  market  barn
```

`trees` and `rocks` are arrays of filenames used for the forest and loose-stone props
(instanced across the map; the game picks the first that loads).

## Where to get CC0 models (free, no attribution required)

- **KayKit** — kaylousberg.itch.io — CC0 medieval packs (Builder / Hexagon / City). Best match
  for this village look.
- **Kenney** — kenney.nl — CC0 (Nature Kit, Medieval Town, Castle Kit).
- **Quaternius** — quaternius.com — CC0 (Ultimate Nature, Medieval Village).
- **Poly Pizza** — poly.pizza — CC0 search, direct `.glb` downloads.

You can also generate custom models with AI tools (Meshy, Luma Genie, Tripo, Rodin, Sloyd) or
model them in Blender — export as `.glb`. If a tool's output isn't CC0, make sure its license
allows use in your project.

## Please record what you add

When you add models, note each one (name, author, source URL, license) in
[`CREDITS.md`](./CREDITS.md). CC0 needs no attribution, but keeping a record is good practice
and required if you use any CC-BY assets.
