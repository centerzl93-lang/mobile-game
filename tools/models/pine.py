"""A conifer: a bare trunk under stacked, drooping frond tiers.

Instanced across every forest tile, so this is the single most performance-sensitive model in
the game — the tiers are low-segment cones and the whole tree stays a few hundred triangles.
"""

import math
import random

import bpy

from common import reset_scene, box, finish, export_gltf
from style import palette

TIERS = 5
HEIGHT = 2.2


def build(seed: int = 0):
    reset_scene()
    random.seed(seed)
    m = palette()
    parts = []

    trunk = box("Trunk", (0.11, 0.11, HEIGHT * 0.45), (0, 0, HEIGHT * 0.22), m["bark"])
    parts.append(trunk)

    # Frond tiers: widest and darkest at the bottom, tightening and lightening toward the tip.
    for i in range(TIERS):
        t = i / (TIERS - 1)
        radius = 0.42 * (1 - t * 0.74)
        z = HEIGHT * (0.30 + t * 0.62)
        depth = 0.40 * (1 - t * 0.45)
        bpy.ops.mesh.primitive_cone_add(
            vertices=7, radius1=radius, radius2=radius * 0.18, depth=depth, location=(0, 0, z)
        )
        ob = bpy.context.active_object
        ob.name = f"Tier{i}"
        # A little wobble per tier so a forest of these doesn't look stamped.
        ob.rotation_euler = (
            math.radians(random.uniform(-4, 4)),
            math.radians(random.uniform(-4, 4)),
            math.radians(random.uniform(0, 51)),
        )
        mat = m["foliage_dark"] if t < 0.34 else (m["foliage"] if t < 0.72 else m["foliage_light"])
        ob.data.materials.append(mat)
        parts.append(ob)

    # A pointed crown so the silhouette ends in a spike, not a stub.
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=0.13, radius2=0, depth=0.48, location=(0, 0, HEIGHT * 0.99))
    tip = bpy.context.active_object
    tip.name = "Tip"
    tip.data.materials.append(m["foliage_light"])
    parts.append(tip)

    return finish(parts, "Pine")


if __name__ == "__main__":
    build()
    export_gltf("public/models/pine.gltf")
