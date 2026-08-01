#!/usr/bin/env python3
"""Build one or all of the models in this folder into public/models/.

    python3 tools/models/build.py            # everything
    python3 tools/models/build.py house      # just the house

Needs the `bpy` module (Blender as a library):  pip install "bpy==4.5.12"
You can also open any of these scripts inside Blender's Scripting tab and press Run to get the
same model in a real Blender session to edit by hand.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "models")
sys.path.insert(0, HERE)

# Model name -> "module" (its `build()`), or "module:function" when one module holds several
# related models — the workshops share so many parts that splitting them into a file each would
# be more scrolling than it is worth. Add new models here.
MODELS = {
    "house": "house",
    "pine": "pine",
    "rock": "rock",
    "stonehouse": "homes:stonehouse",
    "gatherer": "food:gatherer",
    "fishing": "food:fishing",
    "hunting": "food:hunting",
    "lumberyard": "wood:lumberyard",
    "woodcutter": "wood:woodcutter",
    "quarry": "digging:quarry",
    "mine": "digging:mine",
    "blacksmith": "craft:blacksmith",
    "tailor": "craft:tailor",
    "trading": "craft:trading",
    "market": "craft:market",
    "school": "civic:school",
    "tavern": "civic:tavern",
    "chapel": "civic:chapel",
    "cemetery": "civic:cemetery",
    "herbalist": "civic:herbalist",
    "hospital": "civic:hospital",
    "well": "civic:well",
    "barn": "civic:barn",
}


def build(name: str) -> str:
    target = MODELS[name]
    mod_name, _, fn_name = target.partition(":")
    mod = importlib.import_module(mod_name)
    getattr(mod, fn_name or "build")()
    path = os.path.join(OUT, f"{name}.gltf")
    from common import export_gltf

    export_gltf(path)
    return path


def main() -> None:
    wanted = sys.argv[1:] or list(MODELS)
    unknown = [w for w in wanted if w not in MODELS]
    if unknown:
        sys.exit(f"unknown model(s): {', '.join(unknown)}. known: {', '.join(MODELS)}")
    os.makedirs(OUT, exist_ok=True)
    for name in wanted:
        path = build(name)
        print(f"{name:12} -> {os.path.relpath(path, ROOT)}  ({os.path.getsize(path) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
