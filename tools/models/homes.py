"""Dwellings other than the starter house.

The village's homes are meant to read as a progression at a glance: the timber-framed house is
what people throw up first, the stone house is what they build once they can afford to stop
losing heat through the walls. Same silhouette family, visibly heavier construction.
"""

from common import reset_scene, box, bevel, finish
from parts import chimney, door, stone_walls, window
from style import palette, shingled_roof

W, D = 2.0, 2.0


def stonehouse():
    """Two-tile stone cottage: coursed walls, quoined corners, a deep chimney, shingled roof.

    Reads as the warm house it is in the simulation — thick masonry all the way up instead of
    plaster panels, and a chimney breast built into the gable end rather than poked through the
    roof as an afterthought.
    """
    reset_scene()
    m = palette()
    parts = []

    footing_h = 0.22
    wall_h = 1.45
    roof_h = 1.15

    footing = box("Footing", (W + 0.06, D + 0.06, footing_h), (0, 0, footing_h / 2), m["stone_dark"])
    bevel(footing, 0.02)
    parts.append(footing)

    parts += stone_walls("Wall", W, D, wall_h, footing_h, m)
    # A timber sill plate under the eaves ties the masonry to the roof.
    parts.append(box("Plate", (W + 0.08, D + 0.08, 0.09), (0, 0, footing_h + wall_h - 0.045), m["timber"]))
    parts += shingled_roof(W, D, roof_h, footing_h + wall_h, m, rows=8)

    parts += door("Front", D / 2, footing_h, m)
    for sx in (-1, 1):
        parts += window("Front", sx * 0.64, D / 2, footing_h + 0.78, m)
    parts += window("Side", -0.5, -D / 2, footing_h + 0.78, m)

    # Chimney breast climbing the gable end, wider at the base like a real flue.
    breast = box("Breast", (0.44, 0.52, wall_h), (W / 2 - 0.02, -0.30, footing_h + wall_h / 2), m["stone"])
    bevel(breast, 0.02)
    parts.append(breast)
    parts += chimney("Flue", W / 2 - 0.02, -0.30, footing_h + wall_h, 1.05, m, width=0.34)

    return finish(parts, "StoneHouse")
