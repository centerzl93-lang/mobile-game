"""The two timber trades: the forester's lumberyard and the woodcutter's splitting shed.

Banished distinguishes these clearly and so should we — the forester is a hut in a nursery of
saplings, all growing things; the woodcutter is an open-fronted shed buried in split billets, all
cut things. Same trade, opposite ends of it.

Both sit on 3x3 plots. The extra tile went into the *yard* in each case rather than into the
building: the forester gets a third nursery bed and a proper seven-tree row, the woodcutter gets
a working bay wide enough to swing an axe in. Growing the huts instead would have made two
identical sheds with more wall.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import door, firewood, lean_to, log_pile, posts, window
from style import palette, shingled_roof, half_timber


def lumberyard():
    """Forester's lodge (3x3): a timber hut, three nursery beds of saplings, and felled logs."""
    reset_scene()
    m = palette()
    parts = []

    hut_w, hut_d = 1.55, 1.42
    base_h, wall_h, roof_h = 0.16, 1.18, 1.08
    ox, oy = -0.66, -0.66

    pad = box("Pad", (hut_w + 0.14, hut_d + 0.14, base_h), (ox, oy, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)
    walls = half_timber(hut_w, hut_d, wall_h, base_h, m, braces=False, name="Lodge")
    roof = shingled_roof(hut_w, hut_d, roof_h, base_h + wall_h, m, overhang=0.14,
                         name="LodgeRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls + roof
    parts += door("Lodge", oy + hut_d / 2, base_h, m, width=0.38, height=0.66, x=ox)
    parts += window("Lodge", ox + 0.50, oy + hut_d / 2, base_h + 0.72, m, width=0.26, height=0.24)

    # Nursery beds: rows of saplings in turned soil. This is the forester's whole point, and on a
    # 3x3 plot it is finally a nursery rather than a window box — three beds of seven.
    for r, by in enumerate((0.48, 0.92, 1.32)):
        parts.append(box("Bed", (2.30, 0.28, 0.05), (0.16, by, 0.025), m["soil"]))
        for i in range(7):
            sx = 0.16 - 1.03 + i * 0.343
            parts += _sapling(f"Sap{r}{i}", (sx, by, 0.05), m, height=0.28 + ((i + r) % 3) * 0.06)

    # Felled logs stacked ready for the haulers, a sawbuck, and a leaning axe by the door.
    parts += log_pile("Cut", (0.92, -0.56, 0.0), m, rows=3, per_row=4, length=0.70)
    parts += log_pile("Cut2", (1.10, 0.06, 0.0), m, rows=2, per_row=3, length=0.62)
    parts += _sawbuck("Buck", (0.86, -1.22, 0.0), m)
    parts.append(box("AxeHaft", (0.05, 0.05, 0.54), (ox + 0.36, oy + hut_d / 2 + 0.07, 0.27), m["timber"]))
    parts.append(box("AxeHead", (0.13, 0.05, 0.13), (ox + 0.36, oy + hut_d / 2 + 0.07, 0.52), m["metal"]))

    return finish(parts, "Lumberyard")


def woodcutter():
    """Woodcutter's shed (3x3): a closed store, an open working bay, and stacks of split billets.

    The lean-to bay is the readable half — you can see straight into the work, which is what
    tells it apart from the forester's closed lodge at a glance. On the wider plot the store and
    the bay each get a full tile, so the shed reads as two rooms rather than one with a porch.
    """
    reset_scene()
    m = palette()
    parts = []

    store_w, store_d = 1.24, 1.90
    base_h, wall_h, roof_h = 0.18, 1.14, 1.02
    ox = -0.82

    pad = box("Pad", (store_w + 0.14, store_d + 0.14, base_h), (ox, 0, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)
    walls = half_timber(store_w, store_d, wall_h, base_h, m, name="Store")
    roof = shingled_roof(store_w, store_d, roof_h, base_h + wall_h, m, overhang=0.14,
                         name="StoreRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.x += ox
    parts += walls + roof
    parts += door("Store", store_d / 2, base_h, m, width=0.38, height=0.66, x=ox)
    parts += window("Store", ox, -store_d / 2, base_h + 0.70, m, width=0.28, height=0.24)

    # Open working bay alongside, its roof sloping away from the store.
    bay = lean_to("Bay", 1.30, 1.80, base_h + 0.82, m, rise=0.38, toward=1)
    for ob in bay:
        ob.location.x += 0.62
    parts += bay
    parts.append(box("BayFloor", (1.32, 1.82, base_h), (0.62, 0, base_h / 2), m["soil"]))

    # Chopping block with the axe buried in it, a sawbuck, and split billets stacked to season.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.21, depth=0.36, vertices=10, location=(0.52, 0.30, base_h + 0.18))
    block = bpy.context.active_object
    block.name = "Block"
    block.data.materials.append(m["bark"])
    parts.append(block)
    haft = box("AxeHaft", (0.05, 0.05, 0.42), (0.52, 0.30, base_h + 0.54), m["timber"])
    haft.rotation_euler = (math.radians(18), 0, 0)
    parts.append(haft)
    parts.append(box("AxeHead", (0.14, 0.05, 0.12), (0.52, 0.37, base_h + 0.73), m["metal"]))
    parts += _sawbuck("Buck", (1.06, -0.44, base_h), m)

    parts += firewood("Stack", 1.10, (0.30, 1.24, 0.0), m, height=0.62)
    parts += firewood("Stack2", 0.74, (1.04, 0.98, 0.0), m, height=0.48)
    parts += log_pile("Raw", (0.60, -1.25, 0.0), m, rows=3, per_row=3, length=0.64)

    return finish(parts, "Woodcutter")


# ---- local props ------------------------------------------------------------------------------
def _sawbuck(name, base, mats):
    """An X-frame sawhorse with a log laid in it — the other half of 'this is where wood is cut'."""
    parts = []
    x, y, z = base
    for sy in (-1, 1):
        for sx in (-1, 1):
            leg = box(f"{name}Leg", (0.05, 0.05, 0.52), (x + sx * 0.11, y + sy * 0.20, z + 0.24), mats["timber"])
            leg.rotation_euler = (0, sx * math.radians(24), 0)
            parts.append(leg)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=0.66, vertices=8, location=(x, y, z + 0.46))
    ob = bpy.context.active_object
    ob.name = f"{name}Log"
    ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.data.materials.append(mats["bark"])
    parts.append(ob)
    return parts


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
