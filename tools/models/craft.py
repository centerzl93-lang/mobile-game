"""The trades and the two places goods change hands: smithy, tailor, trading dock, market.

The workshops follow the same pattern as the woodcutter — a closed shop plus an open bay you can
see the work happening in. The dock and the market are deliberately not buildings at all: a
plank wharf and a run of stalls around a square, so the eye reads "goods moving" rather than
"another cottage".

Footprints: smithy and tailor 3x3, market 4x4, trading post 5x9. The market and the dock are the
two that change character rather than just size — at 4x4 the market becomes a square with a
covered cross in the middle of it, and at 5x9 the trading post finally has a wharf long enough
for a boat to lie alongside.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import (barrel, chimney, crate_cluster, deck, door, drying_rack, lean_to, log_pile,
                   posts, sign_board, window)
from style import palette, shingled_roof, half_timber


def blacksmith():
    """Smithy (3x3): masonry forge with a fat chimney, an open working bay, anvil and quench trough.

    The chimney is oversized on purpose — the smithy should be identifiable across the map by its
    stack, and that is the one silhouette cue worth exaggerating.
    """
    reset_scene()
    m = palette()
    parts = []
    base_h, wall_h, roof_h = 0.20, 1.12, 1.00
    shop_w, shop_d = 1.30, 2.00
    ox = -0.80

    pad = box("Pad", (shop_w + 0.16, shop_d + 0.16, base_h), (ox, 0, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)
    # Stone to the sill, timber frame above — a forge does not get plaster all the way down.
    parts.append(box("Plinth", (shop_w, shop_d, 0.46), (ox, 0, base_h + 0.23), m["stone"]))
    walls = half_timber(shop_w, shop_d, wall_h - 0.46, base_h + 0.46, m, braces=False, name="Shop")
    roof = shingled_roof(shop_w, shop_d, roof_h, base_h + wall_h, m, overhang=0.15,
                         name="ShopRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.x += ox
    parts += walls + roof
    parts += door("Shop", shop_d / 2, base_h, m, width=0.38, height=0.66, x=ox)
    parts += window("Shop", ox, -shop_d / 2, base_h + 0.72, m, width=0.28, height=0.24)
    parts += chimney("Forge", ox - 0.04, -0.56, base_h + wall_h, 1.30, m, width=0.46)

    # Open bay with the anvil in it, floored in stone against the sparks.
    bay = lean_to("Bay", 1.28, 1.96, base_h + 0.84, m, rise=0.36, toward=1)
    for ob in bay:
        ob.location.x += 0.64
    parts += bay
    parts.append(box("BayFloor", (1.30, 1.98, base_h), (0.64, 0, base_h / 2), m["stone_dark"]))
    parts += _anvil("Anvil", (0.52, 0.34, base_h), m)
    parts += _grindstone("Grind", (1.10, -0.22, base_h), m)
    # Quench trough, coal heap, and finished bar stock leaning in the corner.
    parts.append(box("Trough", (0.52, 0.28, 0.20), (0.46, -0.68, base_h + 0.10), m["timber_dark"]))
    parts.append(box("Water", (0.44, 0.20, 0.04), (0.46, -0.68, base_h + 0.20), m["window"]))
    parts += _heap("Coal", (1.14, 0.94, 0.0), m, mat="window", count=7)
    for i in range(3):
        bar = box(f"Bar{i}", (0.04, 0.04, 0.68), (1.22, 0.24 - i * 0.08, base_h + 0.34), m["metal"])
        bar.rotation_euler = (math.radians(-11), 0, 0)
        parts.append(bar)
    # Iron stock and finished tools stacked out front, where the haulers collect them, and the
    # slag heap round the back where the ash gets raked out of the forge.
    parts += crate_cluster("Stock", (0.30, 1.18, 0.0), m, count=3)
    parts += barrel("Slack", (-0.30, 1.22, 0.19), m["timber_dark"])
    parts += _heap("Slag", (0.70, -1.28, 0.0), m, mat="stone_dark", count=7)
    parts += log_pile("Charcoal", (1.16, -1.22, 0.0), m, rows=2, per_row=3, length=0.58)

    return finish(parts, "Blacksmith")


def tailor():
    """Tailor (3x3): a neat half-timbered shop with an awning, cloth on the racks, tenter frames.

    The one workshop that is tidy. Everything on this plot is hung, folded or stretched flat,
    which is what sets it apart from the smith's soot and the woodcutter's mess.
    """
    reset_scene()
    m = palette()
    parts = []
    base_h, wall_h, roof_h = 0.18, 1.22, 1.02
    shop_w, shop_d = 1.82, 1.60
    ox, oy = -0.52, -0.62

    pad = box("Pad", (shop_w + 0.14, shop_d + 0.14, base_h), (ox, oy, base_h / 2), m["stone"])
    bevel(pad, 0.02)
    parts.append(pad)
    walls = half_timber(shop_w, shop_d, wall_h, base_h, m, name="Shop")
    roof = shingled_roof(shop_w, shop_d, roof_h, base_h + wall_h, m, overhang=0.14,
                         name="ShopRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls + roof
    parts += door("Shop", oy + shop_d / 2, base_h, m, width=0.38, height=0.68, x=ox - 0.48)
    parts += window("Shop", ox + 0.42, oy + shop_d / 2, base_h + 0.72, m, width=0.40, height=0.32)
    parts += window("Side", ox, oy - shop_d / 2, base_h + 0.72, m, width=0.30, height=0.28)
    parts += chimney("Hearth", ox - 0.58, oy - 0.40, base_h + wall_h, 0.92, m, width=0.28)

    # Striped awning over the shop window, on two slender posts.
    aw_z = base_h + 1.00
    parts += posts("Awn", [(ox - 0.06, oy + shop_d / 2 + 0.44), (ox + 0.88, oy + shop_d / 2 + 0.44)],
                   aw_z, 0.06, 0, m["timber"])
    awn = box("Awning", (1.04, 0.58, 0.05), (ox + 0.41, oy + shop_d / 2 + 0.24, aw_z + 0.05), m["cloth"])
    awn.rotation_euler = (math.radians(-13), 0, 0)
    parts.append(awn)

    # Cloth drying on the line, tenter frames, and bolts of fabric stacked by the door.
    parts += drying_rack("Cloth", 0.88, (0.86, 0.44, 0.0), m, bars=4)
    parts += drying_rack("Cloth2", 0.72, (0.94, 1.26, 0.0), m, bars=3)
    parts += _stretch_frame("Frame", (0.92, -0.66, 0.0), m)
    parts += _stretch_frame("Frame2", (0.94, -1.20, 0.0), m)
    for i in range(4):
        parts.append(box(f"Bolt{i}", (0.48, 0.14, 0.14), (-1.02, 0.92, 0.07 + i * 0.15),
                         m["cloth" if i % 2 else "timber"]))

    return finish(parts, "Tailor")


def trading():
    """Trading post (5 x 9): a long plank wharf running out from a warehouse and counting house.

    Placement guarantees a third of the footprint sits on water, so the shape is read end-on: the
    warehouse and the counting house sit at the landward (+Y, door) end, and the wharf runs the
    remaining two thirds of the plot out over the water with the crane at its far end. At the old
    3x2 there was no room for that arrangement and the whole thing had to read as one shed on a
    jetty; nine tiles is what makes it a quay a boat can lie alongside.
    """
    reset_scene()
    m = palette()
    parts = []

    # --- landward end: warehouse, counting house, and the cobbled apron between them and the quay
    base_h, wall_h, roof_h = 0.20, 1.30, 1.10
    ww, wd = 3.10, 2.40
    wox, woy = -0.76, 3.10
    parts.append(box("Pad", (ww + 0.16, wd + 0.16, base_h), (wox, woy, base_h / 2), m["stone"]))
    walls = half_timber(ww, wd, wall_h, base_h, m, name="Ware")
    roof = shingled_roof(ww, wd, roof_h, base_h + wall_h, m, overhang=0.16, name="WareRoof")
    for ob in walls + roof:
        ob.location.x += wox
        ob.location.y += woy
    parts += walls + roof
    # Cart-height double doors on the gable end, like the barn's.
    for sx in (-1, 1):
        parts.append(box("Leaf", (0.46, 0.10, 1.00), (wox + sx * 0.25, woy + wd / 2 - 0.04, base_h + 0.50), m["timber"]))
        for z in (base_h + 0.22, base_h + 0.78):
            parts.append(box("Strap", (0.44, 0.06, 0.06), (wox + sx * 0.25, woy + wd / 2 - 0.06, z), m["metal"]))
    parts.append(box("DoorHead", (1.08, 0.11, 0.11), (wox, woy + wd / 2 - 0.04, base_h + 1.05), m["timber"]))
    for sx in (-1, 1):
        parts += window("Ware", wox + sx * 1.10, woy - wd / 2, base_h + 0.86, m, width=0.32, height=0.30)

    ch_w, ch_d = 1.44, 1.44
    cox, coy = 1.62, 3.56
    parts.append(box("CountPad", (ch_w + 0.12, ch_d + 0.12, base_h), (cox, coy, base_h / 2), m["stone"]))
    c_walls = half_timber(ch_w, ch_d, 1.06, base_h, m, braces=False, name="Count")
    c_roof = shingled_roof(ch_w, ch_d, 0.86, base_h + 1.06, m, overhang=0.14, name="CountRoof")
    for ob in c_walls + c_roof:
        ob.location.x += cox
        ob.location.y += coy
    parts += c_walls + c_roof
    parts += door("Count", coy + ch_d / 2, base_h, m, width=0.36, height=0.64, x=cox)
    parts += sign_board("Sign", cox - 0.62, coy + ch_d / 2, base_h + 0.80, m, width=0.38)

    apron = box("Apron", (4.60, 1.30, 0.09), (0, 1.22, 0.045), m["stone"])
    bevel(apron, 0.02)
    parts.append(apron)

    # --- the quay itself: decking on stilts running out along -Y over the water
    deck_z = 0.36
    parts += posts(
        "Stilt",
        [(x, y) for x in (-1.90, -0.64, 0.64, 1.90) for y in (0.70, -0.60, -1.90, -3.20, -4.10)],
        deck_z, 0.13, -0.14, m["timber_dark"],
    )
    parts += deck("Wharf", 4.60, 5.60, 0.10, (0, -1.60, deck_z), m["timber"], planks=17)
    # Mooring bollards down both edges, and a fender rail along the seaward end.
    for by in (0.60, -0.50, -1.60, -2.70, -3.80):
        for sx in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.085, depth=0.34, vertices=8,
                                                location=(sx * 2.14, by, deck_z + 0.22))
            ob = bpy.context.active_object
            ob.name = "Bollard"
            ob.data.materials.append(m["timber_dark"])
            parts.append(ob)
    parts.append(box("Fender", (4.40, 0.12, 0.14), (0, -4.34, deck_z + 0.10), m["timber_dark"]))

    # A timber derrick at the far end, where a hull would come alongside — the tall element that
    # tells you at a glance which end of the plot the boats use.
    crane_x, crane_y = 1.62, -3.10
    parts.append(box("CranePost", (0.18, 0.18, 2.00), (crane_x, crane_y, deck_z + 1.00), m["timber"]))
    parts.append(box("CraneJib", (0.13, 1.30, 0.13), (crane_x, crane_y - 0.62, deck_z + 1.92), m["timber"]))
    brace = box("CraneBrace", (0.11, 0.90, 0.11), (crane_x, crane_y - 0.34, deck_z + 1.42), m["timber"])
    brace.rotation_euler = (math.radians(38), 0, 0)
    parts.append(brace)
    parts.append(box("CraneRope", (0.04, 0.04, 0.72), (crane_x, crane_y - 1.22, deck_z + 1.52), m["cloth"]))
    parts.append(box("Slung", (0.34, 0.34, 0.28), (crane_x, crane_y - 1.22, deck_z + 1.02), m["timber_dark"]))

    # Cargo waiting on the quay, and a covered goods lean-to halfway down it.
    shelter = lean_to("Shed", 1.30, 1.50, deck_z + 0.94, m, rise=0.34, toward=1)
    for ob in shelter:
        ob.location.x += -1.60
        ob.location.y += -2.50
    parts += shelter
    parts += crate_cluster("Cargo", (-1.72, -2.60, deck_z), m, count=4)
    parts += crate_cluster("Cargo2", (1.40, 0.10, deck_z), m, count=3)
    parts += crate_cluster("Cargo3", (-1.86, 0.28, deck_z), m, count=3)
    for i, (bx, by) in enumerate(((0.30, -0.70), (0.62, -0.62), (0.46, -1.02), (-0.70, -3.70), (-0.34, -3.62))):
        parts += barrel(f"Quay{i}", (bx, by, deck_z + 0.19), m["timber" if i % 2 else "timber_dark"])
    parts += _rope_coil("Coil", (-1.20, -4.00, deck_z), m)
    parts += _rope_coil("Coil2", (1.94, -1.34, deck_z), m)

    return finish(parts, "Trading")


def market():
    """Market (4 x 4): stalls round a cobbled square with a covered market cross in the middle.

    The market's job in the simulation is redistribution, so it should look like a place people
    pass through rather than a place goods are locked up in — no walls anywhere on the plot. The
    cross is what gives it height: at 3x2 the market was the flattest thing in the village and
    read from above as a patch of paving, which is the one thing a market must not do.
    """
    reset_scene()
    m = palette()
    parts = []
    W, D = 4.0, 4.0

    # Cobbled ground, slightly proud of the terrain so the square has an edge.
    floor = box("Floor", (W - 0.12, D - 0.12, 0.09), (0, 0, 0.045), m["stone"])
    bevel(floor, 0.02)
    parts.append(floor)

    # Stalls round three sides. The middle of the +Y side is left open — that is where the door
    # tile is, and a stall parked across it would be a market nobody can walk into.
    for i, (sx, sy) in enumerate(((-1.28, -1.50), (0.0, -1.50), (1.28, -1.50))):
        parts += _stall(f"Back{i}", (sx, sy, 0.09), m, tint=i % 2)
    for i, sx in enumerate((-1.30, 1.30)):
        parts += _stall(f"Front{i}", (sx, 1.50, 0.09), m, flip=True, tint=(i + 1) % 2)
    for i, sy in enumerate((-0.44, 0.62)):
        parts += _stall(f"West{i}", (-1.52, sy, 0.09), m, axis="y", tint=i % 2)

    # The market cross: a stepped stone plinth carrying four posts and a little shingled roof.
    z = 0.09
    for i, s in enumerate((1.34, 1.06, 0.78)):
        step = box(f"Step{i}", (s, s, 0.13), (0, 0, z + 0.065), m["stone_dark"] if i % 2 else m["stone"])
        bevel(step, 0.02)
        parts.append(step)
        z += 0.13
    parts += posts("Cross", [(sx * 0.30, sy * 0.30) for sx in (-1, 1) for sy in (-1, 1)],
                   1.24, 0.13, z, m["timber"])
    parts.append(box("CrossBeam", (0.86, 0.86, 0.12), (0, 0, z + 1.24), m["timber"]))
    parts += shingled_roof(1.16, 1.16, 0.62, z + 1.28, m, overhang=0.14, name="CrossRoof")
    parts += sign_board("Sign", 0.30, -0.30, z + 0.86, m, width=0.38)

    # Goods stacked in the corners the stalls leave free.
    parts += crate_cluster("Goods", (1.44, 0.34, 0.09), m, count=3)
    parts += barrel("Goods", (1.62, -0.52, 0.28), m["timber_dark"])
    parts += barrel("Goods2", (1.36, -0.60, 0.28), m["timber"])
    parts += barrel("Goods3", (-0.10, 1.44, 0.28), m["timber"])
    parts += crate_cluster("Goods2", (0.44, 1.42, 0.09), m, count=2)

    return finish(parts, "Market")


# ---- local props ------------------------------------------------------------------------------
def _stall(name, center, mats, flip=False, tint=0, axis="x"):
    """A market stall: counter, four posts, and a pitched cloth canopy.

    `axis="y"` turns the whole stall a quarter so it can line the side of a square rather than
    the back of it — the same stall, not a second model.
    """
    parts = []
    cx, cy, cz = center
    s = -1 if flip else 1
    counter_h = 0.40

    def at(u, v):
        """Stall-local (across, out-of-counter) -> world, honouring `axis`."""
        return (cx + u, cy + s * v) if axis == "x" else (cx + s * v, cy + u)

    def sized(across, out, tall):
        return (across, out, tall) if axis == "x" else (out, across, tall)

    counter = at(0.0, 0.14)
    parts.append(box(f"{name}Counter", sized(0.78, 0.30, 0.08), (*counter, cz + counter_h), mats["timber"]))
    parts += posts(name, [at(-0.36, -0.18), at(0.36, -0.18), at(-0.36, 0.26), at(0.36, 0.26)],
                   0.76, 0.055, cz, mats["timber_dark"])
    # Canopy: two cloth panels leaning against each other over the counter. Kept low and only a
    # little wider than the stall — at full width it read as a floating billboard from above.
    canopy = mats["cloth"] if tint else mats["thatch"]
    for side in (-1, 1):
        pos = at(0.0, 0.04 + side * 0.14)
        panel = box(f"{name}Canopy", sized(0.84, 0.30, 0.04), (*pos, cz + 0.82), canopy)
        tilt = side * s * math.radians(22)
        panel.rotation_euler = (tilt, 0, 0) if axis == "x" else (0, -tilt, 0)
        parts.append(panel)
    ridge = at(0.0, 0.04)
    parts.append(box(f"{name}Ridge", sized(0.86, 0.06, 0.05), (*ridge, cz + 0.87), mats["timber"]))
    # Wares on the counter.
    for i in range(3):
        pos = at(-0.25 + i * 0.25, 0.14)
        parts.append(box(f"{name}Ware", (0.14, 0.14, 0.10), (*pos, cz + counter_h + 0.09),
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


def _grindstone(name, base, mats):
    """A wheel on a trestle for putting an edge back on a tool."""
    parts = []
    x, y, z = base
    for sy in (-1, 1):
        parts.append(box(f"{name}Leg", (0.06, 0.06, 0.40), (x, y + sy * 0.18, z + 0.20), mats["timber"]))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.19, depth=0.07, vertices=12, location=(x, y, z + 0.44))
    ob = bpy.context.active_object
    ob.name = f"{name}Wheel"
    ob.rotation_euler = (0, math.pi / 2, 0)
    ob.data.materials.append(mats["stone"])
    parts.append(ob)
    return parts


def _rope_coil(name, base, mats):
    """A coil of mooring rope flaked down on the deck."""
    parts = []
    x, y, z = base
    for i, r in enumerate((0.22, 0.15)):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.045, major_segments=10,
                                         minor_segments=5, location=(x, y, z + 0.05 + i * 0.09))
        ob = bpy.context.active_object
        ob.name = f"{name}Turn"
        ob.data.materials.append(mats["cloth"])
        parts.append(ob)
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
