"""Dwellings other than the starter house.

The village's homes are meant to read as a progression at a glance: the timber-framed house is
what people throw up first, the stone house is what they build once they can afford to stop
losing heat through the walls. Same silhouette family, visibly heavier construction.
"""

from common import reset_scene, box, bevel, finish
from parts import chimney, deck, door, posts, stone_walls, window
from style import half_timber, palette, shingled_roof

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


def shelter():
    """Boarding house (3 x 4): three storeys of bunks under one long roof.

    Everything about it says *institution rather than home*. It is the tallest thing in a village
    of cottages, its windows are small and identical and there are a great many of them, and the
    way up to the top two floors is an external stair and gallery bolted to the long side — a
    lodging house, not a family's front door. A masonry ground floor carries the weight of the two
    timber storeys above it, and two flues do the work of heating eighteen people.

    The ridge runs the length of the plot so the block reads long and plain from above, the same
    way the school does; what distinguishes the two at a glance is height and the stair.
    """
    reset_scene()
    m = palette()
    parts = []

    # Narrow for its plot on purpose: the external gallery hangs off the west wall and counts
    # toward the model's width, so the block itself has to give that room back or the finished
    # building overhangs the tile next door.
    hw, hd = 1.88, 3.04
    base_h = 0.24
    storey = 1.02
    wall_h = storey * 3
    roof_h = 1.00
    oy = -0.18  # a little back on the plot, leaving room at the door end

    footing = box("Footing", (hw + 0.14, hd + 0.14, base_h), (0, oy, base_h / 2), m["stone_dark"])
    bevel(footing, 0.02)
    parts.append(footing)

    # Ground floor in masonry, the two lodging floors timber-framed above it. The change of
    # material at first-floor level is what stops three storeys reading as one very tall wall.
    ground = stone_walls("Ground", hw, hd, storey, base_h, m)
    upper = half_timber(hw, hd, storey * 2, base_h + storey, m, name="Upper")
    for ob in ground + upper:
        ob.location.y += oy
    parts += ground + upper

    roof = shingled_roof(hw, hd, roof_h, base_h + wall_h, m, overhang=0.13)
    for ob in roof:
        ob.location.y += oy
    parts += roof

    # Band courses at each floor, so you can count the storeys from across the map.
    for k in (1, 2):
        parts.append(
            box("Band", (hw + 0.12, hd + 0.12, 0.10), (0, oy, base_h + storey * k), m["timber"])
        )

    # The door end, with a small porch.
    front = oy + hd / 2
    parts += door("Front", front, base_h, m, width=0.50, height=0.78)
    parts += posts("Porch", [(-0.34, front + 0.30), (0.34, front + 0.30)], 0.86, 0.08, base_h, m["timber"])
    parts.append(box("PorchRoof", (1.00, 0.44, 0.08), (0, front + 0.22, base_h + 0.90), m["slate"]))

    # Dormitory windows: small, identical, and a lot of them. Three ranks down each long side and
    # a pair in each gable — the repetition is the whole read.
    for dy in (-1.02, -0.34, 0.34, 1.02):
        for sx in (-1, 1):
            for k in (0, 1, 2):
                parts += window(
                    "Bunk", oy + dy, sx * (hw / 2), base_h + storey * k + 0.46, m,
                    width=0.26, height=0.30, axis="x",
                )
    for k in (1, 2):
        for sx in (-1, 1):
            parts += window("Gable", sx * 0.62, front, base_h + storey * k + 0.46, m, width=0.26, height=0.30)

    # External stair and gallery up the west side: the way lodgers reach the upper floors, and the
    # detail that makes the building read as lodgings rather than as a large house.
    gx = -(hw / 2)
    gallery_z = base_h + storey
    parts += deck("Gallery", 0.52, 2.30, 0.08, (gx - 0.30, oy - 0.10, gallery_z), m["timber"], planks=4)
    parts += posts(
        "Gallery",
        [(gx - 0.52, oy - 1.00), (gx - 0.52, oy + 0.10), (gx - 0.52, oy + 1.00)],
        gallery_z - base_h, 0.09, base_h, m["timber"],
    )
    parts.append(box("GalleryRail", (0.06, 2.30, 0.06), (gx - 0.54, oy - 0.10, gallery_z + 0.42), m["timber"]))
    parts += posts(
        "Rail",
        [(gx - 0.54, oy - 1.00), (gx - 0.54, oy + 0.10), (gx - 0.54, oy + 1.00)],
        0.44, 0.05, gallery_z, m["timber"],
    )
    for i in range(6):
        # Steps climbing from the ground at the door end up to the gallery.
        z = base_h + (gallery_z - base_h) * (i + 0.5) / 6
        y = oy + 1.16 - 0.16 * i
        parts.append(box("Step", (0.50, 0.16, 0.06), (gx - 0.30, y, z), m["timber"]))
    parts += door("Gallery", 0, gallery_z, m, width=0.40, height=0.70, x=gx + 0.02, depth=0.10)

    # Two flues: eighteen people is a lot of hearth.
    for sy in (-1, 1):
        parts += chimney("Flue", 0.52, oy + sy * 1.06, base_h + wall_h, 0.72, m, width=0.30)

    for ob in parts:
        bevel(ob, 0.012)
    return finish(parts, "Shelter")
