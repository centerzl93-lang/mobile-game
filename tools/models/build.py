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

# Model name -> the module that builds it. Add new models here.
MODELS = ["house", "pine", "rock"]


def build(name: str) -> str:
    mod = importlib.import_module(name)
    mod.build()
    path = os.path.join(OUT, f"{name}.glb")
    from common import export_glb

    export_glb(path)
    return path


def main() -> None:
    wanted = sys.argv[1:] or MODELS
    unknown = [w for w in wanted if w not in MODELS]
    if unknown:
        sys.exit(f"unknown model(s): {', '.join(unknown)}. known: {', '.join(MODELS)}")
    os.makedirs(OUT, exist_ok=True)
    for name in wanted:
        path = build(name)
        print(f"{name:12} -> {os.path.relpath(path, ROOT)}  ({os.path.getsize(path) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
