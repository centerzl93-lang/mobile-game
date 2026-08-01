"""A loose boulder: a few faceted lumps, flat-shaded so each facet reads as a plane.

Instanced wherever a tile carries loose stone, and reused as the visual vocabulary for the
mountain terrain, so its facet size sets the scale of "rock" everywhere in the game.
"""

import math
import random

import bpy

from common import reset_scene, finish, export_gltf
from style import palette


def build(seed: int = 3):
    reset_scene()
    random.seed(seed)
    m = palette()
    parts = []

    # A cluster of squashed, randomly-rotated icospheres reads as one chipped boulder.
    lumps = [(0.0, 0.0, 0.0, 0.52), (0.34, 0.16, -0.06, 0.30), (-0.26, -0.22, -0.08, 0.26)]
    for i, (x, y, z, r) in enumerate(lumps):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=(x, y, z))
        ob = bpy.context.active_object
        ob.name = f"Lump{i}"
        ob.scale = (1.0, random.uniform(0.8, 1.05), random.uniform(0.55, 0.72))
        ob.rotation_euler = (
            math.radians(random.uniform(0, 360)),
            math.radians(random.uniform(0, 360)),
            math.radians(random.uniform(0, 360)),
        )
        ob.data.materials.append(m["stone"] if i == 0 else m["stone_dark"])
        parts.append(ob)

    return finish(parts, "Rock")


if __name__ == "__main__":
    build()
    export_gltf("public/models/rock.gltf")
