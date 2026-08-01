"""The two timber trades: the forester's lumberyard and the woodcutter's splitting shed.

Banished distinguishes these clearly and so should we — the forester is a hut in a nursery of
saplings, all growing things; the woodcutter is an open-fronted shed buried in split billets, all
cut things. Same trade, opposite ends of it.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import door, firewood, lean_to, log_pile, posts, window
from style import palette, shingled_roof, half_timber

W, D = 2.0, 2.0


def lumberyard():
    """Forester's lodge: a small timber hut, a seedling nursery, and felled logs waiting to go."""
    reset_scene()
    m = palette()
    parts = []

    hut_w, hut_d = 1.10, 1.05
    base_h, wall_h, roof_h = 0.16, 0.94, 0.74
    ox, oy = -0.42, -0.40

    pad = box("Pad", (hut_w + 0.12, hut_d + 0.12, base_h), (ox, oy, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)
    walls = half_timber(hut_w, hut_d, wall_h, base_h, m, braces=False, name="Lodge")
    roof = shingled_roof(hut_w, hut_d, roof_h, base_h + wall_h, m, rows=5, overhang=0.14, name="LodgeRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls + roof
    parts += door("Lodge", oy + hut_d / 2, base_h, m, width=0.34, height=0.62, x=ox)

    # Nursery beds: rows of saplings in turned soil. This is the forester's whole point.
    for r, by in enumerate((0.30, 0.66)):
        parts.append(box("Bed", (1.05, 0.26, 0.05), (0.36, by, 0.025), m["soil"]))
        for i in range(4):
            sx = 0.36 - 0.42 + i * 0.28
            parts += _sapling(f"Sap{r}{i}", (sx, by, 0.05), m, height=0.30 + (i % 2) * 0.08)

    # Felled logs stacked ready for the haulers, plus a leaning axe by the door.
    parts += log_pile("Cut", (0.62, -0.52, 0.0), m, rows=2, per_row=4, length=0.66)
    parts.append(box("AxeHaft", (0.05, 0.05, 0.52), (ox + 0.34, oy + hut_d / 2 + 0.06, 0.26), m["timber"]))
    parts.append(box("AxeHead", (0.13, 0.05, 0.13), (ox + 0.34, oy + hut_d / 2 + 0.06, 0.50), m["metal"]))

    return finish(parts, "Lumberyard")


def woodcutter():
    """Woodcutter's shed: a closed store with an open working bay, chopping block, and stacks.

    The lean-to bay is the readable half — you can see straight into the work, which is what
    tells it apart from the forester's closed lodge at a glance.
    """
    reset_scene()
    m = palette()
    parts = []

    store_w, store_d = 1.05, 1.30
    base_h, wall_h, roof_h = 0.18, 1.00, 0.80
    ox = -0.44

    pad = box("Pad", (store_w + 0.12, store_d + 0.12, base_h), (ox, 0, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)
    walls = half_timber(store_w, store_d, wall_h, base_h, m, name="Store")
    roof = shingled_roof(store_w, store_d, roof_h, base_h + wall_h, m, rows=6, overhang=0.14, name="StoreRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.x += ox
    parts += walls + roof
    parts += door("Store", store_d / 2, base_h, m, width=0.36, height=0.64, x=ox)
    parts += window("Store", ox, -store_d / 2, base_h + 0.62, m, width=0.24, height=0.22)

    # Open working bay alongside, its roof sloping away from the store.
    bay = lean_to("Bay", 0.96, 1.20, base_h + 0.72, m, rise=0.34, toward=1)
    for ob in bay:
        ob.location.x += 0.48
    parts += bay
    parts.append(box("BayFloor", (0.98, 1.22, base_h), (0.48, 0, base_h / 2), m["soil"]))

    # Chopping block with the axe buried in it, and split billets stacked to season.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.19, depth=0.34, vertices=10, location=(0.42, 0.30, base_h + 0.17))
    block = bpy.context.active_object
    block.name = "Block"
    block.data.materials.append(m["bark"])
    parts.append(block)
    haft = box("AxeHaft", (0.05, 0.05, 0.40), (0.42, 0.30, base_h + 0.52), m["timber"])
    haft.rotation_euler = (math.radians(18), 0, 0)
    parts.append(haft)
    parts.append(box("AxeHead", (0.14, 0.05, 0.12), (0.42, 0.36, base_h + 0.70), m["metal"]))

    parts += firewood("Stack", 0.86, (0.50, -0.44, base_h), m, height=0.54)
    parts += log_pile("Raw", (0.44, 0.78, 0.0), m, rows=2, per_row=3, length=0.60)

    return finish(parts, "Woodcutter")


def _sapling(name, base, mats, height=0.32):
    """A young conifer: a stubby trunk under two stacked cones. Deliberately tiny — these are
    the trees the forester has *just* planted, and they should read as not-yet-timber."""
    parts = []
    x, y, z = base
    bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=height * 0.35, vertices=6, location=(x, y, z + height * 0.175))
    trunk = bpy.context.active_object
    trunk.name = f"{name}Trunk"
    trunk.data.materials.append(mats["bark"])
    parts.append(trunk)
    for i, (r, h) in enumerate(((0.11, 0.30), (0.075, 0.24))):
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0.0, depth=height * h * 2.2, vertices=7,
                                        location=(x, y, z + height * (0.30 + i * 0.30)))
        cone = bpy.context.active_object
        cone.name = f"{name}Tier"
        cone.data.materials.append(mats["foliage_light" if i else "foliage"])
        parts.append(cone)
    return parts
