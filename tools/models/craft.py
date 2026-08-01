"""The trades and the two places goods change hands: smithy, tailor, trading dock, market.

The workshops follow the same pattern as the woodcutter — a closed shop plus an open bay you can
see the work happening in. The dock and the market are deliberately not buildings at all: a
plank wharf and a run of stalls, so the eye reads "goods moving" rather than "another cottage".
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import (barrel, chimney, crate_cluster, deck, door, drying_rack, lean_to, log_pile,
                   posts, sign_board, window)
from style import palette, shingled_roof, half_timber


def blacksmith():
    """Smithy: masonry forge with a fat chimney, an open working bay, anvil and quench trough.

    The chimney is oversized on purpose. In Banished the smithy is identifiable across the map by
    its stack, and that is the one silhouette cue worth exaggerating.
    """
    reset_scene()
    m = palette()
    parts = []
    base_h, wall_h, roof_h = 0.20, 1.02, 0.86
    shop_w, shop_d = 1.10, 1.34
    ox = -0.42

    pad = box("Pad", (shop_w + 0.14, shop_d + 0.14, base_h), (ox, 0, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)
    # Stone to the sill, timber frame above — a forge does not get plaster all the way down.
    parts.append(box("Plinth", (shop_w, shop_d, 0.42), (ox, 0, base_h + 0.21), m["stone"]))
    walls = half_timber(shop_w, shop_d, wall_h - 0.42, base_h + 0.42, m, braces=False, name="Shop")
    roof = shingled_roof(shop_w, shop_d, roof_h, base_h + wall_h, m, rows=6, overhang=0.14, name="ShopRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.x += ox
    parts += walls + roof
    parts += door("Shop", shop_d / 2, base_h, m, width=0.34, height=0.62, x=ox)
    parts += chimney("Forge", ox - 0.02, -0.44, base_h + wall_h, 1.25, m, width=0.40)

    # Open bay with the anvil in it.
    bay = lean_to("Bay", 0.94, 1.16, base_h + 0.74, m, rise=0.32, toward=1)
    for ob in bay:
        ob.location.x += 0.50
    parts += bay
    parts.append(box("BayFloor", (0.96, 1.18, base_h), (0.50, 0, base_h / 2), m["stone_dark"]))
    parts += _anvil("Anvil", (0.48, 0.18, base_h), m)
    # Quench trough, coal heap, and finished bar stock leaning in the corner.
    parts.append(box("Trough", (0.46, 0.24, 0.18), (0.52, -0.34, base_h + 0.09), m["timber_dark"]))
    parts.append(box("Water", (0.40, 0.18, 0.04), (0.52, -0.34, base_h + 0.18), m["window"]))
    parts += _heap("Coal", (0.86, 0.48, base_h), m, mat="window", count=5)
    for i in range(3):
        bar = box(f"Bar{i}", (0.04, 0.04, 0.62), (0.86 - i * 0.07, -0.02, base_h + 0.31), m["metal"])
        bar.rotation_euler = (0, math.radians(11), 0)
        parts.append(bar)

    return finish(parts, "Blacksmith")


def tailor():
    """Tailor: a neat half-timbered shop with an awning, cloth on the racks, and a stretching frame."""
    reset_scene()
    m = palette()
    parts = []
    base_h, wall_h, roof_h = 0.18, 1.10, 0.92
    shop_w, shop_d = 1.30, 1.24
    ox, oy = -0.28, -0.28

    pad = box("Pad", (shop_w + 0.12, shop_d + 0.12, base_h), (ox, oy, base_h / 2), m["stone"])
    bevel(pad, 0.02)
    parts.append(pad)
    walls = half_timber(shop_w, shop_d, wall_h, base_h, m, name="Shop")
    roof = shingled_roof(shop_w, shop_d, roof_h, base_h + wall_h, m, rows=7, overhang=0.16, name="ShopRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls + roof
    parts += door("Shop", oy + shop_d / 2, base_h, m, width=0.36, height=0.66, x=ox - 0.32)
    parts += window("Shop", ox + 0.36, oy + shop_d / 2, base_h + 0.66, m, width=0.34, height=0.30)
    parts += chimney("Hearth", ox - 0.42, oy - 0.30, base_h + wall_h, 0.86, m, width=0.26)

    # Striped awning over the shop window, on two slender posts.
    aw_z = base_h + 0.96
    parts += posts("Awn", [(ox - 0.24, oy + shop_d / 2 + 0.40), (ox + 0.52, oy + shop_d / 2 + 0.40)], aw_z, 0.06, 0, m["timber"])
    awn = box("Awning", (0.86, 0.52, 0.05), (ox + 0.14, oy + shop_d / 2 + 0.22, aw_z + 0.04), m["cloth"])
    awn.rotation_euler = (math.radians(-13), 0, 0)
    parts.append(awn)

    # Cloth drying, a stretching frame, and bolts of fabric stacked by the door.
    parts += drying_rack("Cloth", 0.74, (0.62, 0.42, 0.0), m, bars=4)
    parts += _stretch_frame("Frame", (0.72, -0.56, 0.0), m)
    for i in range(3):
        parts.append(box(f"Bolt{i}", (0.44, 0.13, 0.13), (-0.62, 0.66, 0.07 + i * 0.14), m["cloth" if i % 2 else "timber"]))

    return finish(parts, "Tailor")


def trading():
    """Trading post (3 x 2): a plank wharf reaching out over the water behind a small counting house.

    Placement guarantees part of the footprint sits on water, so the wharf runs the length of the
    plot and the building huddles at one end of it — the shape reads as "this is where boats come"
    even before a boat arrives.
    """
    reset_scene()
    m = palette()
    parts = []
    W, D = 3.0, 2.0

    # Wharf decking over the +Y half (the water side), on stilts.
    deck_z = 0.34
    parts += posts("Stilt", [(x, y) for x in (-1.20, -0.40, 0.40, 1.20) for y in (0.20, 0.82)],
                   deck_z, 0.11, -0.12, m["timber_dark"])
    parts += deck("Wharf", 2.86, 0.96, 0.09, (0, 0.50, deck_z), m["timber"], planks=11)
    # Mooring bollards along the outer edge.
    for bx in (-1.10, 0.10, 1.10):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.30, vertices=8, location=(bx, 0.92, deck_z + 0.19))
        ob = bpy.context.active_object
        ob.name = "Bollard"
        ob.data.materials.append(m["timber_dark"])
        parts.append(ob)

    # Counting house on the landward side, at one end so the wharf stays clear.
    hw, hd = 1.20, 0.94
    base_h, wall_h, roof_h = 0.18, 1.00, 0.78
    ox, oy = -0.78, -0.48
    parts.append(box("Pad", (hw + 0.12, hd + 0.12, base_h), (ox, oy, base_h / 2), m["stone"]))
    walls = half_timber(hw, hd, wall_h, base_h, m, name="House")
    roof = shingled_roof(hw, hd, roof_h, base_h + wall_h, m, rows=6, overhang=0.15, name="HouseRoof")
    for ob in walls + roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls + roof
    parts += door("House", oy + hd / 2, base_h, m, width=0.36, height=0.64, x=ox)
    parts += sign_board("Sign", ox + 0.66, oy + hd / 2, base_h + 0.78, m)

    # Cargo waiting on the quay: crates, barrels, a coil of rope, a crane post.
    parts += crate_cluster("Cargo", (0.66, -0.42, 0.0), m, count=4)
    parts += barrel("Quay", (1.24, -0.30, 0.19), m["timber"])
    parts += barrel("Quay2", (1.24, 0.02, 0.19), m["timber_dark"])
    parts.append(box("CranePost", (0.13, 0.13, 1.34), (1.24, 0.44, deck_z + 0.67), m["timber"]))
    parts.append(box("CraneJib", (0.10, 0.80, 0.10), (1.24, 0.82, deck_z + 1.28), m["timber"]))
    parts.append(box("CraneRope", (0.035, 0.035, 0.54), (1.24, 1.18, deck_z + 0.94), m["cloth"]))

    return finish(parts, "Trading")


def market():
    """Market (3 x 2): a run of open awninged stalls around a cobbled square. No walls at all.

    The market's job in the simulation is redistribution, so it should look like a place people
    pass through rather than a place goods are locked up in.
    """
    reset_scene()
    m = palette()
    parts = []
    W, D = 3.0, 2.0

    # Cobbled ground, slightly proud of the terrain so the plot has an edge.
    floor = box("Floor", (W - 0.10, D - 0.10, 0.09), (0, 0, 0.045), m["stone"])
    bevel(floor, 0.02)
    parts.append(floor)

    # Three stalls along the back, one along the front-left, leaving an open square.
    for i, (sx, sy, rot) in enumerate(((-1.00, -0.62, 0), (0.0, -0.62, 0), (1.00, -0.62, 0), (-1.00, 0.62, math.pi))):
        parts += _stall(f"Stall{i}", (sx, sy, 0.09), m, flip=rot != 0, tint=i % 2)

    # A central notice post with the market sign, and goods stacked around the square.
    parts.append(box("Post", (0.11, 0.11, 0.98), (0.62, 0.42, 0.58), m["timber"]))
    parts += sign_board("Sign", 0.62, 0.42, 0.84, m, width=0.36)
    parts += crate_cluster("Goods", (1.16, 0.36, 0.09), m, count=3)
    parts += barrel("Goods", (0.06, 0.60, 0.28), m["timber_dark"])
    parts += barrel("Goods2", (0.30, 0.66, 0.28), m["timber"])

    return finish(parts, "Market")


# ---- local props ------------------------------------------------------------------------------
def _stall(name, center, mats, flip=False, tint=0):
    """A market stall: counter, four posts, and a pitched cloth canopy."""
    parts = []
    cx, cy, cz = center
    s = -1 if flip else 1
    counter_h = 0.40
    parts.append(box(f"{name}Counter", (0.78, 0.30, 0.08), (cx, cy + s * 0.14, cz + counter_h), mats["timber"]))
    parts += posts(name, [(cx - 0.36, cy - s * 0.18), (cx + 0.36, cy - s * 0.18),
                          (cx - 0.36, cy + s * 0.26), (cx + 0.36, cy + s * 0.26)],
                   0.76, 0.055, cz, mats["timber_dark"])
    # Canopy: two cloth panels leaning against each other over the counter. Kept low and only a
    # little wider than the stall — at full width it read as a floating billboard from above.
    canopy = mats["cloth"] if tint else mats["thatch"]
    for side in (-1, 1):
        panel = box(f"{name}Canopy", (0.84, 0.30, 0.04), (cx, cy + s * (0.04 + side * 0.14), cz + 0.82), canopy)
        panel.rotation_euler = (side * s * math.radians(22), 0, 0)
        parts.append(panel)
    parts.append(box(f"{name}Ridge", (0.86, 0.06, 0.05), (cx, cy + s * 0.04, cz + 0.87), mats["timber"]))
    # Wares on the counter.
    for i in range(3):
        parts.append(box(f"{name}Ware", (0.14, 0.14, 0.10), (cx - 0.25 + i * 0.25, cy + s * 0.14, cz + counter_h + 0.09),
                         mats["thatch" if i % 2 else "cloth"]))
    return parts


def _anvil(name, base, mats):
    """An anvil on a log stump — small, but it is the one prop that says 'smith'."""
    parts = []
    x, y, z = base
    bpy.ops.mesh.primitive_cylinder_add(radius=0.13, depth=0.30, vertices=9, location=(x, y, z + 0.15))
    stump = bpy.context.active_object
    stump.name = f"{name}Stump"
    stump.data.materials.append(mats["bark"])
    parts.append(stump)
    parts.append(box(f"{name}Body", (0.13, 0.30, 0.09), (x, y, z + 0.34), mats["metal"]))
    parts.append(box(f"{name}Waist", (0.08, 0.14, 0.07), (x, y, z + 0.26), mats["metal"]))
    parts.append(box(f"{name}Horn", (0.07, 0.12, 0.06), (x, y + 0.20, z + 0.35), mats["metal"]))
    return parts


def _stretch_frame(name, base, mats):
    """A tenter frame with a hide or cloth stretched across it."""
    parts = []
    x, y, z = base
    h = 0.74
    for sx in (-1, 1):
        parts.append(box(f"{name}Leg", (0.06, 0.06, h), (x + sx * 0.34, y, z + h / 2), mats["timber"]))
    parts.append(box(f"{name}Top", (0.80, 0.06, 0.06), (x, y, z + h), mats["timber"]))
    parts.append(box(f"{name}Cloth", (0.60, 0.03, 0.50), (x, y, z + h - 0.28), mats["cloth"]))
    return parts


def _heap(name, base, mats, mat="stone", count=5):
    """A conical heap of loose material — coal, sand, grain."""
    parts = []
    x, y, z = base
    for i in range(count):
        a = i * 2.399
        r = 0.06 + 0.035 * i
        s = 0.11 - 0.008 * i
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=s,
                                              location=(x + math.cos(a) * r, y + math.sin(a) * r, z + s * 0.5))
        ob = bpy.context.active_object
        ob.name = f"{name}Lump"
        ob.scale = (1.0, 0.9, 0.6)
        ob.data.materials.append(mats[mat])
        parts.append(ob)
    return parts
