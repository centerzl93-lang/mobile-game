"""A villager's house: stone footing, half-timbered walls, steep shingled roof, stone chimney.

Two tiles square (BUILDING_DEFS.house is w:2, h:2). The roof carries most of the height — that
steep, deeply-lapped roofline is what makes the style read at a distance.
"""

from common import reset_scene, box, bevel, finish, export_gltf
from style import palette, shingled_roof, half_timber

W, D = 2.0, 2.0
FOOTING_H = 0.30     # stone base the timber frame sits on
WALL_H = 1.40        # half-timbered storey
ROOF_H = 1.25        # ridge above the eaves — taller than the walls, as in the reference


def build():
    reset_scene()
    m = palette()
    parts = []

    footing = box("Footing", (W, D, FOOTING_H), (0, 0, FOOTING_H / 2), m["stone"])
    bevel(footing, 0.02)
    parts.append(footing)

    parts += half_timber(W, D, WALL_H, FOOTING_H, m)
    parts += shingled_roof(W, D, ROOF_H, FOOTING_H + WALL_H, m, rows=8)

    # Door and windows on the +Y face.
    door = box("Door", (0.44, 0.10, 0.72), (0, D / 2 - 0.04, FOOTING_H + 0.36), m["timber_dark"])
    parts.append(door)
    lintel = box("Lintel", (0.60, 0.12, 0.10), (0, D / 2 - 0.04, FOOTING_H + 0.77), m["timber"])
    parts.append(lintel)
    for sx in (-1, 1):
        parts.append(box("Window", (0.30, 0.08, 0.28), (sx * 0.62, D / 2 - 0.04, FOOTING_H + 0.72), m["window"]))
        parts.append(box("WinFrame", (0.38, 0.06, 0.36), (sx * 0.62, D / 2 - 0.02, FOOTING_H + 0.72), m["timber"]))

    # Stone chimney breaking the ridge.
    chim = box("Chimney", (0.30, 0.30, 1.30), (W / 2 - 0.46, -0.42, FOOTING_H + WALL_H + 0.55), m["stone_dark"])
    bevel(chim, 0.02)
    parts.append(chim)
    parts.append(box("ChimneyCap", (0.38, 0.38, 0.10), (W / 2 - 0.46, -0.42, FOOTING_H + WALL_H + 1.22), m["stone"]))

    return finish(parts, "House")


if __name__ == "__main__":
    build()
    export_gltf("public/models/house.gltf")
