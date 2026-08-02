#!/usr/bin/env python3
"""Report each built model's footprint and height, and flag any that mis-fit their plot.

`normalize()` in src/render/models.ts divides every model by its longest footprint axis, and
`makeBuildingModel` in renderer3d.ts multiplies it back up by `max(def.w, def.h)`. That only
lands the building inside its plot if the model was authored at the building's own aspect ratio
— a 2x2 model in a 3x4 plot comes out 4x4 and overhangs by a tile on every side.

This checks that invariant against `BUILDING_DEFS` without launching the game:

    python3 tools/models/check.py            # every building model
    python3 tools/models/check.py school     # just one

Height is reported as it renders in tiles, so the table in HANDOFF.md can be read straight off.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "public", "models")

# The renderer's own fudge: models fill 95% of the plot so neighbours never touch.
PLOT_FILL = 0.95
# How far, in tiles, a model may sit from the plot it is *meant* to fill before it is worth a
# look. Measured against `plot x PLOT_FILL` rather than against the raw plot, because the 5%
# margin is deliberate and grows with the building — on a 9-tile quay it is nearly half a tile.
TOLERANCE = 0.34


def defs() -> dict:
    """Scrape `w`/`h` out of BUILDING_DEFS rather than duplicating the table here."""
    src = open(os.path.join(ROOT, "src", "types.ts"), encoding="utf-8").read()
    body = src.split("export const BUILDING_DEFS", 1)[1]
    out = {}
    for m in re.finditer(r"type: '(\w+)'.*?w: (\d+), h: (\d+)", body, re.S):
        name, w, h = m.group(1), int(m.group(2)), int(m.group(3))
        if name not in out:
            out[name] = (w, h)
    return out


def bounds(path: str):
    """Model bounding box in Blender axes (width, depth, height), from the POSITION accessors."""
    doc = json.load(open(path, encoding="utf-8"))
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for mesh in doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            acc = doc["accessors"][prim["attributes"]["POSITION"]]
            for i in range(3):
                lo[i] = min(lo[i], acc["min"][i])
                hi[i] = max(hi[i], acc["max"][i])
    # glTF is Y-up with -Z forward; Blender is Z-up with +Y forward.
    return (hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1])


def main() -> None:
    table = defs()
    wanted = sys.argv[1:] or sorted(table)
    bad = 0
    print(f"{'model':12} {'plot':>7}  {'authored':>12}  {'renders':>12}  height")
    for name in wanted:
        path = os.path.join(MODELS, f"{name}.gltf")
        if name not in table or not os.path.exists(path):
            continue
        pw, ph = table[name]
        w, d, h = bounds(path)
        # What the game actually draws: normalize by the longest axis, scale by the longest plot side.
        k = max(pw, ph) * PLOT_FILL / max(w, d)
        rw, rd, rh = w * k, d * k, h * k
        over = max(rw - pw * PLOT_FILL, rd - ph * PLOT_FILL)
        under = max(pw * PLOT_FILL - rw, ph * PLOT_FILL - rd)
        flag = ""
        if over > TOLERANCE:
            flag, bad = f"  <-- overhangs by {over:.2f}", bad + 1
        elif under > TOLERANCE:
            flag, bad = f"  <-- {under:.2f} short of its plot", bad + 1
        print(f"{name:12} {pw}x{ph:<5}  {w:5.2f}x{d:<5.2f}  {rw:5.2f}x{rd:<5.2f}  {rh:4.2f}{flag}")
    if bad:
        sys.exit(f"\n{bad} model(s) do not fit their plot — re-author them at the plot's aspect ratio.")


if __name__ == "__main__":
    main()
