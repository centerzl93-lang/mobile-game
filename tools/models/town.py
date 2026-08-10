"""The six buildings a village only reaches once it has become a town.

Each of them has to read, at a glance and from the play camera, as *more* than the thing it grew
out of: the university against the school, the port against the trading post, the grand house
against the stone house, the cathedral against the chapel. So they share their ancestors' language
— slate roofs, plaster and timber, dressed stone — and differ in the ways a town differs from a
village: another storey, a colonnade, a spire, glass.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import (barrel, chimney, crate_cluster, deck, door, log_pile, posts, stone_walls,
                   window)
from style import courses, half_timber, palette, shingled_roof


def _spire(name, x, y, base_z, height, radius, mat, sides=4):
    """A needle over a tower: what tells a cathedral or a university from a large hall."""
    bpy.ops.mesh.primitive_cone_add(radius1=radius, radius2=0.0, depth=height,
                                    vertices=sides, location=(x, y, base_z + height / 2))
    ob = bpy.context.active_object
    ob.name = name
    if sides == 4:
        ob.rotation_euler = (0, 0, math.radians(45))
    ob.data.materials.append(mat)
    return [ob]


def _colonnade(name, xs, y, base_z, height, mats, radius=0.11):
    """A row of columns with a shared entablature — the town's architectural signature."""
    parts = []
    for x in xs:
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, vertices=8,
                                            location=(x, y, base_z + height / 2))
        col = bpy.context.active_object
        col.name = f"{name}Column"
        col.data.materials.append(mats["stone"])
        parts.append(col)
        parts.append(box(f"{name}Cap", (radius * 2.6, radius * 2.6, 0.08),
                         (x, y, base_z + height - 0.04), mats["stone_dark"]))
        parts.append(box(f"{name}Base", (radius * 2.6, radius * 2.6, 0.09),
                         (x, y, base_z + 0.045), mats["stone_dark"]))
    span = max(xs) - min(xs)
    parts.append(box(f"{name}Architrave", (span + radius * 4, radius * 2.8, 0.16),
                     ((max(xs) + min(xs)) / 2, y, base_z + height + 0.08), mats["stone"]))
    return parts


def university():
    """University (5 x 5, three storeys): a quadrangle range with a lecture tower and a colonnade.

    The school is a plaster hall with a bell; this has to read as the same institution grown up.
    So: the same slate and plaster, but three storeys of tall windows instead of two of small ones,
    a stone colonnade across the front where a school has a door, and a low tower with a spire —
    the place learning is *kept*, not just done.
    """
    reset_scene()
    m = palette()
    parts = []
    hw, hd = 3.60, 3.30
    base_h, storey, roof_h = 0.26, 1.06, 0.92
    wall_h = storey * 3

    parts.append(box("Plinth", (hw + 0.24, hd + 0.24, base_h), (0, 0, base_h / 2), m["stone_dark"]))
    parts += stone_walls("Range", hw, hd, storey, base_h, m)
    parts += half_timber(hw, hd, storey * 2, base_h + storey, m, name="Upper")
    parts += shingled_roof(hw, hd, roof_h, base_h + wall_h, m, overhang=0.16)

    for k in (1, 2):
        parts.append(box("Band", (hw + 0.14, hd + 0.14, 0.11), (0, 0, base_h + storey * k), m["stone"]))

    # Tall windows in ranks: a lecture room wants light, and the height is the read.
    for k in range(3):
        for x in (-1.24, -0.42, 0.42, 1.24):
            parts += window("Front", x, hd / 2, base_h + storey * k + 0.52, m, width=0.30, height=0.52)
        for y in (-1.10, 0.0, 1.10):
            for sx in (-1, 1):
                parts += window("Side", y, sx * (hw / 2), base_h + storey * k + 0.52, m,
                                width=0.30, height=0.52, axis="x")

    # The colonnade across the front, and the doorway behind it.
    parts += _colonnade("Portico", [-1.05, -0.35, 0.35, 1.05], hd / 2 + 0.42, base_h, 1.28, m)
    parts.append(box("PorticoRoof", (2.90, 1.10, 0.10), (0, hd / 2 + 0.30, base_h + 1.46), m["slate"]))
    parts += door("Main", hd / 2, base_h, m, width=0.62, height=0.94)

    # Lecture tower over the west end, with its spire.
    tx, ty = -1.06, -0.70
    tw = 1.02
    parts.append(box("Tower", (tw, tw, wall_h + 1.15), (tx, ty, base_h + (wall_h + 1.15) / 2), m["plaster"]))
    for sz in (base_h + wall_h + 0.30, base_h + wall_h + 0.86):
        parts.append(box("TowerBand", (tw + 0.12, tw + 0.12, 0.10), (tx, ty, sz), m["stone"]))
    for sx in (-1, 1):
        parts += window("Belfry", tx + sx * 0.24, ty + tw / 2, base_h + wall_h + 0.56, m,
                        width=0.20, height=0.40)
    parts += _spire("Spire", tx, ty, base_h + wall_h + 1.15, 1.30, 0.80, m["slate"])

    for ob in parts:
        bevel(ob, 0.012)
    return finish(parts, "University")


def port():
    """Port (5 x 9, two storeys): a stone quay with a warehouse, cranes and a lighthouse beacon.

    The trading post is a timber wharf. A port is what a town builds when the trading post is not
    enough: masonry quay walls instead of piles, a two-storey bonded warehouse, two treadwheel
    cranes, and a beacon at the seaward end so the bigger traders can find it.

    Authored along Y like the trading post it replaces, so it berths the same way.
    """
    reset_scene()
    m = palette()
    parts = []
    qw, qd = 3.30, 7.40
    quay_h = 0.34

    # The quay itself: a masonry apron with a plank deck along the water side.
    parts.append(box("Quay", (qw, qd, quay_h), (0, 0, quay_h / 2), m["stone"]))
    for i, y in enumerate([-2.9 + 1.18 * k for k in range(6)]):
        parts.append(box("QuayCourse", (qw + 0.10, 0.18, 0.12), (0, y, quay_h - 0.06), m["stone_dark"]))
    parts += deck("Apron", 1.05, qd - 0.5, 0.09, (qw / 2 - 0.52, 0, quay_h + 0.04), m["timber"], planks=8)

    # Bonded warehouse at the landward end: two storeys, big cargo doors, shuttered lofts.
    ww, wd, wh = 2.40, 2.70, 2.10
    wy = -2.10
    # Built at the origin and slid back along the quay as one piece: the helpers all centre what
    # they make, so collecting the warehouse first and moving it once is the only way to keep its
    # walls, its upper storey and its roof together.
    store = (
        stone_walls("Store", ww, wd, wh * 0.5, quay_h, m)
        + half_timber(ww, wd, wh * 0.5, quay_h + wh * 0.5, m, name="StoreUp")
        + shingled_roof(ww, wd, 0.92, quay_h + wh, m, overhang=0.16, name="StoreRoof")
        + [box("StoreBand", (ww + 0.12, wd + 0.12, 0.10), (0, 0, quay_h + wh * 0.5), m["timber"])]
    )
    for ob in store:
        ob.location.y += wy
    parts += store
    parts += door("Cargo", wy + wd / 2, quay_h, m, width=0.86, height=1.10)
    for k in (0, 1):
        for sx in (-1, 1):
            parts += window("Loft", wy + sx * 0.80, ww / 2 * (1 if k else -1), quay_h + wh * 0.5 + 0.44, m,
                            width=0.30, height=0.34, axis="x")

    # Two treadwheel cranes along the quay — the silhouette that says "port" from across the map.
    for cy in (0.35, 2.45):
        parts += posts("Crane", [(-0.55, cy - 0.28), (-0.55, cy + 0.28)], 1.85, 0.13, quay_h, m["timber"])
        parts.append(box("CraneHead", (0.22, 0.80, 0.22), (-0.55, cy, quay_h + 1.90), m["timber_dark"]))
        jib = box("CraneJib", (1.90, 0.16, 0.16), (0.30, cy, quay_h + 2.18), m["timber"])
        jib.rotation_euler = (0, math.radians(-19), 0)
        parts.append(jib)
        parts.append(box("CraneRope", (0.05, 0.05, 0.62), (1.12, cy, quay_h + 1.62), m["timber_dark"]))
        parts.append(box("CraneHook", (0.20, 0.20, 0.14), (1.12, cy, quay_h + 1.26), m["timber_dark"]))
        # The wheel the crew walk to lift with.
        bpy.ops.mesh.primitive_cylinder_add(radius=0.44, depth=0.34, vertices=12,
                                            location=(-0.55, cy, quay_h + 1.02))
        wheel = bpy.context.active_object
        wheel.name = "CraneWheel"
        wheel.rotation_euler = (0, math.radians(90), 0)
        wheel.data.materials.append(m["timber"])
        parts.append(wheel)

    # Beacon at the seaward end, and bollards down the quay edge.
    parts.append(box("BeaconBase", (0.70, 0.70, 0.36), (-0.30, 3.15, quay_h + 0.18), m["stone_dark"]))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.30, depth=1.70, vertices=10,
                                        location=(-0.30, 3.15, quay_h + 1.21))
    tower = bpy.context.active_object
    tower.name = "Beacon"
    tower.data.materials.append(m["plaster"])
    parts.append(tower)
    parts.append(box("BeaconLamp", (0.42, 0.42, 0.34), (-0.30, 3.15, quay_h + 2.22), m["timber_dark"]))
    parts += _spire("BeaconCap", -0.30, 3.15, quay_h + 2.39, 0.44, 0.32, m["slate"], sides=8)
    parts += posts("Bollard", [(qw / 2 - 0.16, y) for y in (-2.2, -0.7, 0.8, 2.3)], 0.30, 0.16, quay_h,
                   m["stone_dark"])
    parts += crate_cluster("Cargo", (-0.10, 1.30, quay_h), m, count=4)
    parts += barrel("Barrel", (0.55, -0.60, quay_h + 0.19), m["timber"], radius=0.17, height=0.38)

    for ob in parts:
        bevel(ob, 0.012)
    return finish(parts, "Port")


def grandhouse():
    """Grand House (2 x 2, two storeys): a stone town house with glazing, a parapet and a portico.

    Same plot as a cottage and unmistakably a better address. Ashlar rather than rubble, a stone
    band between the floors, tall glazed windows where a cottage has shutters, a little portico at
    the door, and a parapet with urns instead of an eave — the details that cost money.
    """
    reset_scene()
    m = palette()
    parts = []
    W = D = 1.94
    base_h, storey = 0.22, 1.02
    wall_h = storey * 2

    parts.append(box("Plinth", (W + 0.20, D + 0.20, base_h), (0, 0, base_h / 2), m["stone_dark"]))
    parts += stone_walls("Wall", W, D, wall_h, base_h, m)
    parts.append(box("Band", (W + 0.10, D + 0.10, 0.11), (0, 0, base_h + storey), m["stone_dark"]))
    parts += shingled_roof(W, D, 0.62, base_h + wall_h + 0.16, m, overhang=0.04)
    # Parapet hiding the roof's foot, with an urn at each corner: the town-house silhouette.
    parts.append(box("Parapet", (W + 0.16, D + 0.16, 0.30), (0, 0, base_h + wall_h + 0.15), m["stone"]))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("Urn", (0.20, 0.20, 0.26),
                             (sx * (W / 2 + 0.02), sy * (D / 2 + 0.02), base_h + wall_h + 0.42),
                             m["stone_dark"]))

    parts += door("Front", D / 2, base_h, m, width=0.50, height=0.86)
    parts += _colonnade("Porch", [-0.34, 0.34], D / 2 + 0.26, base_h, 0.94, m, radius=0.08)
    for k in (0, 1):
        for sx in (-1, 1):
            parts += window("Front", sx * 0.60, D / 2, base_h + storey * k + 0.56, m,
                            width=0.34, height=0.50)
            parts += window("Side", sx * 0.52, W / 2, base_h + storey * k + 0.56, m,
                            width=0.34, height=0.50, axis="x")
    parts += chimney("Flue", -W / 2 + 0.30, -0.42, base_h + wall_h + 0.30, 0.86, m, width=0.30)
    parts += chimney("Flue2", W / 2 - 0.30, -0.42, base_h + wall_h + 0.30, 0.86, m, width=0.30)

    for ob in parts:
        bevel(ob, 0.012)
    return finish(parts, "GrandHouse")


def cathedral():
    """Cathedral (7 x 7, five storeys): a cruciform church with a crossing tower and west front.

    The chapel is a small hall with a bellcote. This is the same building at the scale a town
    builds: a nave crossed by transepts, a tower over the crossing carrying a tall spire, a west
    front with a rose window, and buttresses down every flank. Five storeys of height is almost all
    tower and spire — a cathedral is tall in one place, not everywhere.
    """
    reset_scene()
    m = palette()
    parts = []
    nave_w, nave_d = 2.30, 5.60
    tran_w, tran_d = 5.40, 2.20
    base_h, wall_h = 0.30, 2.30

    parts.append(box("Plinth", (nave_w + 0.30, nave_d + 0.30, base_h), (0, 0, base_h / 2), m["stone_dark"]))
    parts.append(box("PlinthT", (tran_w + 0.30, tran_d + 0.30, base_h), (0, 0.30, base_h / 2), m["stone_dark"]))
    parts += stone_walls("Nave", nave_w, nave_d, wall_h, base_h, m)
    parts += shingled_roof(nave_w, nave_d, 1.15, base_h + wall_h, m, overhang=0.14)
    # Transepts: a second range crossing the first, which is what makes the plan a cross.
    tran = stone_walls("Tran", tran_w, tran_d, wall_h, base_h, m)
    troof = shingled_roof(tran_w, tran_d, 1.00, base_h + wall_h, m, overhang=0.14, name="TranRoof")
    for ob in tran + troof:
        ob.location.y += 0.30
    parts += tran + troof

    # Buttresses down both flanks of the nave, stepped like the real thing.
    for sx in (-1, 1):
        for y in (-2.35, -1.55, 1.90, 2.55):
            parts.append(box("Buttress", (0.36, 0.34, wall_h * 0.82),
                             (sx * (nave_w / 2 + 0.10), y, base_h + wall_h * 0.41), m["stone"]))
            parts.append(box("ButtressCap", (0.42, 0.40, 0.16),
                             (sx * (nave_w / 2 + 0.10), y, base_h + wall_h * 0.82 + 0.08), m["stone_dark"]))

    # West front: the doorway, a rose window over it, and a gable above that.
    front = -nave_d / 2
    parts += door("West", front, base_h, m, width=0.78, height=1.20)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.52, depth=0.16, vertices=12,
                                        location=(0, front - 0.02, base_h + 1.72))
    rose = bpy.context.active_object
    rose.name = "Rose"
    rose.rotation_euler = (math.radians(90), 0, 0)
    rose.data.materials.append(m["stone_dark"])
    parts.append(rose)
    for i in range(8):
        a = math.pi * i / 8
        spoke = box("RoseSpoke", (0.92, 0.07, 0.07), (0, front - 0.06, base_h + 1.72), m["stone"])
        spoke.rotation_euler = (0, a, 0)
        parts.append(spoke)

    # Lancet windows down the nave and across the transept ends.
    for y in (-1.95, -1.15, 1.50, 2.20):
        for sx in (-1, 1):
            parts += window("Lancet", y, sx * (nave_w / 2), base_h + 1.10, m,
                            width=0.26, height=0.72, axis="x")
    for sx in (-1, 1):
        parts += window("TranEnd", 0.30, sx * (tran_w / 2), base_h + 1.10, m, width=0.34, height=0.86, axis="x")

    # The crossing tower and its spire: five storeys of height, all of it here.
    tw = 1.50
    tower_h = 2.60
    parts.append(box("Tower", (tw, tw, tower_h), (0, 0.30, base_h + wall_h + tower_h / 2 - 0.30), m["stone"]))
    for i, z in enumerate((0.70, 1.60)):
        parts.append(box("TowerBand", (tw + 0.14, tw + 0.14, 0.12),
                         (0, 0.30, base_h + wall_h + z - 0.30), m["stone_dark"]))
    for sy, face in ((1, 0.30 + tw / 2), (-1, 0.30 - tw / 2)):
        for sx in (-1, 1):
            parts += window("Belfry", sx * 0.34, face, base_h + wall_h + 1.05, m, width=0.24, height=0.62)
    for sx in (-1, 1):
        for dy in (-0.34, 0.34):
            parts += window("BelfryS", 0.30 + dy, sx * (tw / 2), base_h + wall_h + 1.05, m,
                            width=0.24, height=0.62, axis="x")
    spire_base = base_h + wall_h + tower_h - 0.30
    parts += _spire("Spire", 0, 0.30, spire_base, 2.40, 1.16, m["slate"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts += _spire("Pinnacle", sx * (tw / 2 - 0.08), 0.30 + sy * (tw / 2 - 0.08),
                            spire_base, 0.72, 0.20, m["stone_dark"])

    for ob in parts:
        bevel(ob, 0.012)
    return finish(parts, "Cathedral")


def luxury():
    """Luxury Workshop (5 x 4, two storeys): a glazed craft hall with a showroom front.

    A blacksmith is a shed with a forge. This is the trade done for people with money: a stone
    ground floor with a wide glazed shopfront, a timbered workshop above it, a hanging sign, and a
    small kiln at the back. The benches are empty for now, which is why the front is the detail
    that carries it.
    """
    reset_scene()
    m = palette()
    parts = []
    # Shallow for its plot: the canopy stands proud of the front and the kiln off one end, and
    # both count toward the model's depth. A 5x4 plot leaves less room front-to-back than it looks.
    hw, hd = 3.40, 2.06
    base_h, storey = 0.24, 1.06

    parts.append(box("Plinth", (hw + 0.18, hd + 0.18, base_h), (0, 0, base_h / 2), m["stone_dark"]))
    parts += stone_walls("Shop", hw, hd, storey, base_h, m)
    parts += half_timber(hw, hd, storey, base_h + storey, m, name="Loft")
    parts += shingled_roof(hw, hd, 0.86, base_h + storey * 2, m, overhang=0.15)
    parts.append(box("Band", (hw + 0.12, hd + 0.12, 0.11), (0, 0, base_h + storey), m["timber"]))

    # The shopfront: three tall glazed bays under a canopy, which is the whole read.
    for x in (-1.05, 0.0, 1.05):
        parts += window("Shop", x, hd / 2, base_h + 0.56, m, width=0.72, height=0.74)
    parts.append(box("Canopy", (hw - 0.20, 0.52, 0.09), (0, hd / 2 + 0.22, base_h + 1.02), m["cloth"]))
    parts += door("Side", -hd / 2, base_h, m, width=0.48, height=0.80)
    for x in (-1.05, 0.0, 1.05):
        parts += window("Loft", x, hd / 2, base_h + storey + 0.50, m, width=0.34, height=0.42)

    # Hanging sign on an iron bracket, and a kiln at the back.
    parts.append(box("Bracket", (0.52, 0.07, 0.07), (hw / 2 - 0.10, hd / 2 + 0.24, base_h + 1.34), m["timber_dark"]))
    parts.append(box("Sign", (0.42, 0.05, 0.34), (hw / 2 + 0.10, hd / 2 + 0.24, base_h + 1.12), m["timber"]))
    # Kiln and crates off the *end* rather than the back — the plot is wide, not deep.
    kx = -hw / 2 - 0.38
    bpy.ops.mesh.primitive_cylinder_add(radius=0.34, depth=0.86, vertices=10,
                                        location=(kx, -0.30, base_h + 0.43))
    kiln = bpy.context.active_object
    kiln.name = "Kiln"
    kiln.data.materials.append(m["stone_dark"])
    parts.append(kiln)
    parts += chimney("KilnFlue", kx, -0.30, base_h + 0.86, 0.72, m, width=0.22)
    parts += crate_cluster("Crates", (hw / 2 + 0.34, -0.42, base_h), m, count=2)

    for ob in parts:
        bevel(ob, 0.012)
    return finish(parts, "Luxury")


def monument():
    """Monument (3 x 3, four storeys): a stepped plinth carrying a fluted column and a figure.

    It does nothing, so it has to be worth looking at. A square stepped base a villager could sit
    on, a fluted column, and a figure on top — tall and thin, so it reads against the skyline from
    anywhere in the town rather than competing with the roofs around it.
    """
    reset_scene()
    m = palette()
    parts = []

    # Stepped base: three courses, each smaller than the last.
    for i, (w, h) in enumerate(((2.60, 0.26), (2.10, 0.24), (1.66, 0.22))):
        z = sum(x[1] for x in ((2.60, 0.26), (2.10, 0.24), (1.66, 0.22))[:i])
        parts.append(box(f"Step{i}", (w, w, h), (0, 0, z + h / 2), m["stone" if i % 2 else "stone_dark"]))
    base_top = 0.72

    # Pedestal with a carved panel on each face.
    parts.append(box("Pedestal", (1.16, 1.16, 1.02), (0, 0, base_top + 0.51), m["stone"]))
    for sx, sy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        parts.append(box("Panel", (0.72 if sx == 0 else 0.06, 0.06 if sx == 0 else 0.72, 0.58),
                         (sx * 0.59, sy * 0.59, base_top + 0.52), m["stone_dark"]))
    parts.append(box("PedestalCap", (1.34, 1.34, 0.14), (0, 0, base_top + 1.09), m["stone_dark"]))

    # Fluted column: a cylinder with ribs standing proud of it.
    col_h = 2.90
    col_z = base_top + 1.16
    bpy.ops.mesh.primitive_cylinder_add(radius=0.40, depth=col_h, vertices=12,
                                        location=(0, 0, col_z + col_h / 2))
    shaft = bpy.context.active_object
    shaft.name = "Shaft"
    shaft.data.materials.append(m["stone"])
    parts.append(shaft)
    for i in range(8):
        a = 2 * math.pi * i / 8
        parts.append(box("Flute", (0.10, 0.10, col_h - 0.16),
                         (math.cos(a) * 0.38, math.sin(a) * 0.38, col_z + col_h / 2), m["stone_dark"]))
    parts.append(box("Capital", (1.00, 1.00, 0.22), (0, 0, col_z + col_h + 0.11), m["stone_dark"]))

    # The figure: a plain standing form, which reads as a person at this scale without a face.
    fz = col_z + col_h + 0.22
    parts.append(box("Figure", (0.34, 0.26, 0.78), (0, 0, fz + 0.39), m["stone"]))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.17, segments=10, ring_count=6, location=(0, 0, fz + 0.92))
    head = bpy.context.active_object
    head.name = "Head"
    head.data.materials.append(m["stone"])
    parts.append(head)
    arm = box("Arm", (0.62, 0.15, 0.15), (0.20, 0, fz + 0.66), m["stone"])
    arm.rotation_euler = (0, math.radians(-32), 0)
    parts.append(arm)

    for ob in parts:
        bevel(ob, 0.012)
    return finish(parts, "Monument")
