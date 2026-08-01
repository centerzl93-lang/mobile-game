"""Everything the village builds for itself rather than for production.

School, tavern, chapel, cemetery, herbalist, hospital, well and barn. These are the buildings a
player looks at rather than through, so each one leans on a single strong silhouette cue — a
bell cupola, a steeple, a run of headstones, a great pair of barn doors.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import (barrel, chimney, crate_cluster, deck, door, drying_rack, lean_to, posts,
                   rail_fence, sign_board, stone_walls, window)
from style import palette, shingled_roof, half_timber

W, D = 2.0, 2.0


def school():
    """A long plaster hall with a bell cupola on the ridge and a bench outside."""
    reset_scene()
    m = palette()
    parts = []
    hw, hd = 1.72, 1.30
    base_h, wall_h, roof_h = 0.22, 1.16, 0.96

    footing = box("Footing", (hw + 0.10, hd + 0.10, base_h), (0, 0, base_h / 2), m["stone"])
    bevel(footing, 0.02)
    parts.append(footing)
    parts += half_timber(hw, hd, wall_h, base_h, m, name="Hall")
    parts += shingled_roof(hw, hd, roof_h, base_h + wall_h, m, rows=7)

    parts += door("Hall", hd / 2, base_h, m, width=0.42, height=0.72)
    for sx in (-1, 1):
        parts += window("Hall", sx * 0.60, hd / 2, base_h + 0.80, m, width=0.32, height=0.34)
        parts += window("Side", sx * 0.52, -hd / 2, base_h + 0.80, m, width=0.32, height=0.34)

    # Bell cupola straddling the ridge — the one thing that tells a school from a big house.
    cz = base_h + wall_h + roof_h
    parts.append(box("CupolaBase", (0.36, 0.36, 0.16), (0, 0.14, cz + 0.02), m["timber"]))
    parts += posts("Cupola", [(-0.13, 0.01), (0.13, 0.01), (-0.13, 0.27), (0.13, 0.27)], 0.30, 0.05, cz + 0.10, m["timber"])
    bpy.ops.mesh.primitive_cone_add(radius1=0.28, radius2=0.0, depth=0.30, vertices=4, location=(0, 0.14, cz + 0.55))
    cap = bpy.context.active_object
    cap.name = "CupolaCap"
    cap.rotation_euler = (0, 0, math.radians(45))
    cap.data.materials.append(m["slate"])
    parts.append(cap)
    bpy.ops.mesh.primitive_cone_add(radius1=0.075, radius2=0.045, depth=0.14, vertices=8, location=(0, 0.14, cz + 0.30))
    bell = bpy.context.active_object
    bell.name = "Bell"
    bell.data.materials.append(m["metal"])
    parts.append(bell)

    # A bench by the door, because a schoolyard needs somewhere to sit.
    parts.append(box("BenchTop", (0.72, 0.20, 0.06), (0.62, hd / 2 + 0.40, 0.32), m["timber"]))
    parts += posts("Bench", [(0.34, hd / 2 + 0.40), (0.90, hd / 2 + 0.40)], 0.32, 0.06, 0, m["timber_dark"])

    return finish(parts, "School")


def tavern():
    """Alehouse: half-timbered, jettied upper floor, hanging sign, barrels stacked outside."""
    reset_scene()
    m = palette()
    parts = []
    lw, ld = 1.44, 1.30
    base_h, low_h, up_h, roof_h = 0.20, 0.86, 0.68, 0.88

    footing = box("Footing", (lw + 0.08, ld + 0.08, base_h), (0, 0, base_h / 2), m["stone"])
    bevel(footing, 0.02)
    parts.append(footing)
    parts += half_timber(lw, ld, low_h, base_h, m, braces=False, name="Lower")
    # Jettied upper storey oversailing the ground floor — the medieval-town cue.
    parts += half_timber(lw + 0.22, ld + 0.22, up_h, base_h + low_h, m, name="Upper")
    parts += shingled_roof(lw + 0.22, ld + 0.22, roof_h, base_h + low_h + up_h, m, rows=6)

    parts += door("Tav", ld / 2 + 0.11, base_h, m, width=0.40, height=0.66, x=-0.30)
    parts += window("Tav", 0.36, ld / 2 + 0.11, base_h + 0.58, m, width=0.34, height=0.28)
    for sx in (-1, 1):
        parts += window("Up", sx * 0.44, ld / 2 + 0.11, base_h + low_h + 0.38, m, width=0.28, height=0.26)
    parts += chimney("Hearth", -lw / 2 - 0.02, -0.34, base_h + low_h + up_h, 0.98, m, width=0.30)
    parts += sign_board("Sign", 0.66, ld / 2 + 0.11, base_h + 0.74, m, width=0.36)

    # Ale barrels and a trestle table in the yard.
    for i, (bx, by) in enumerate(((0.74, -0.52), (0.74, -0.16), (0.98, -0.34))):
        parts += barrel(f"Ale{i}", (bx, by, 0.19), m["timber" if i % 2 else "timber_dark"])
    parts.append(box("TableTop", (0.78, 0.34, 0.06), (0.34, 0.82, 0.40), m["timber"]))
    parts += posts("Table", [(0.02, 0.82), (0.66, 0.82)], 0.40, 0.07, 0, m["timber_dark"])

    return finish(parts, "Tavern")


def chapel():
    """A small stone chapel with a west tower, a tall shingled nave and an arched door."""
    reset_scene()
    m = palette()
    parts = []
    nw, nd = 1.10, 1.62
    base_h, wall_h, roof_h = 0.22, 1.16, 0.98
    ox = 0.28

    footing = box("Footing", (nw + 0.14, nd + 0.14, base_h), (ox, 0, base_h / 2), m["stone_dark"])
    bevel(footing, 0.02)
    parts.append(footing)
    nave = stone_walls("Nave", nw, nd, wall_h, base_h, m)
    roof = shingled_roof(nw, nd, roof_h, base_h + wall_h, m, rows=7, name="NaveRoof")
    for ob in nave + roof:
        ob.location.x += ox
    parts += nave + roof

    # Tower at the west end, taller than the nave, with a spire.
    tw = 0.62
    tox = ox - nw / 2 - tw / 2 + 0.08
    tower_h = wall_h + 0.72
    tower = stone_walls("Tower", tw, tw, tower_h, base_h, m)
    for ob in tower:  # stone_walls builds at the origin; shift the whole tower into place
        ob.location.x += tox
    parts += tower
    bpy.ops.mesh.primitive_cone_add(radius1=tw * 0.78, radius2=0.0, depth=0.86, vertices=4,
                                    location=(tox, 0, base_h + tower_h + 0.43))
    spire = bpy.context.active_object
    spire.name = "Spire"
    spire.rotation_euler = (0, 0, math.radians(45))
    spire.data.materials.append(m["slate"])
    parts.append(spire)
    parts.append(box("Belfry", (0.20, 0.06, 0.30), (tox, tw / 2 - 0.02, base_h + tower_h - 0.26), m["window"]))

    # Arched door in the tower, lancet windows down the nave.
    parts += door("Chapel", tw / 2, base_h, m, width=0.34, height=0.66, x=tox)
    for dy in (-0.46, 0.0, 0.46):
        parts.append(box("Lancet", (0.08, 0.16, 0.44), (ox + nw / 2 - 0.03, dy, base_h + 0.68), m["window"]))
        parts.append(box("Lancet", (0.08, 0.16, 0.44), (ox - nw / 2 + 0.03, dy, base_h + 0.68), m["window"]))

    return finish(parts, "Chapel")


def cemetery():
    """A walled burying ground: low stone wall, a lych gate, rows of headstones, one yew."""
    reset_scene()
    m = palette()
    parts = []

    # Turf slightly proud of the terrain, inside a low wall with a gap for the gate. Green, not
    # bare earth — a graveyard is grassed over, and soil-coloured ground made it read as a patio.
    parts.append(box("Turf", (1.82, 1.82, 0.07), (0, 0, 0.035), m["foliage_dark"]))
    wall_h, t = 0.34, 0.14
    for sx in (-1, 1):
        parts.append(box("Wall", (t, 1.86, wall_h), (sx * 0.93, 0, wall_h / 2), m["stone"]))
    parts.append(box("Wall", (1.86, t, wall_h), (0, -0.93, wall_h / 2), m["stone"]))
    for sx in (-1, 1):
        parts.append(box("Wall", (0.62, t, wall_h), (sx * 0.62, 0.93, wall_h / 2), m["stone"]))

    # Lych gate over the entrance — a roofed gateway, the classic churchyard silhouette.
    parts += posts("Gate", [(-0.30, 0.86), (0.30, 0.86), (-0.30, 1.00), (0.30, 1.00)], 0.86, 0.09, 0, m["timber"])
    gate_roof = shingled_roof(0.74, 0.30, 0.32, 0.86, m, rows=3, overhang=0.10, name="GateRoof")
    for ob in gate_roof:
        ob.location.y += 0.93
    parts += gate_roof

    # Headstones in loose rows. Tall enough to clear the wall and read from the game camera, with
    # varied heights, a slight lean and a couple of round-topped ones so they are unmistakably
    # graves rather than a row of fence posts.
    for r in range(3):
        for c in range(4):
            k = r * 4 + c
            x = -0.60 + c * 0.40
            y = -0.54 + r * 0.44
            h = 0.40 + (k % 3) * 0.10
            st = box("Stone", (0.26, 0.09, h), (x, y, 0.07 + h / 2), m["stone_dark"] if k % 2 else m["stone"])
            st.rotation_euler = (math.radians((k % 5 - 2) * 3.5), 0, math.radians((k % 3 - 1) * 5))
            parts.append(st)
            if k % 3 == 0:  # a rounded cap on some of them
                bpy.ops.mesh.primitive_cylinder_add(radius=0.13, depth=0.09, vertices=8,
                                                    location=(x, y, 0.07 + h))
                cap = bpy.context.active_object
                cap.name = "StoneCap"
                cap.rotation_euler = (math.pi / 2, 0, 0)
                cap.data.materials.append(m["stone"] if k % 2 else m["stone_dark"])
                parts.append(cap)
    # A yew in the corner, as every churchyard has.
    parts += _yew("Yew", (0.66, 0.58, 0.07), m)

    return finish(parts, "Cemetery")


def herbalist():
    """A thatched cottage under a drying loft, with herb beds and bundles hanging in the eaves."""
    reset_scene()
    m = palette()
    parts = []
    hw, hd = 1.24, 1.10
    base_h, wall_h, roof_h = 0.16, 0.94, 0.84
    ox, oy = -0.30, -0.32

    pad = box("Pad", (hw + 0.12, hd + 0.12, base_h), (ox, oy, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)
    walls = half_timber(hw, hd, wall_h, base_h, m, braces=False, name="Cot")
    for ob in walls:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls
    roof = _thatch(hw, hd, roof_h, base_h + wall_h, m, rows=6)
    for ob in roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += roof
    parts += door("Cot", oy + hd / 2, base_h, m, width=0.34, height=0.62, x=ox)
    parts += chimney("Hearth", ox - 0.44, oy - 0.24, base_h + wall_h, 0.74, m, width=0.24)

    # Herb beds in rows, and bundles hung to dry under the eave.
    for r, by in enumerate((0.44, 0.74)):
        parts.append(box("Bed", (1.10, 0.22, 0.05), (0.28, by, 0.025), m["soil"]))
        for i in range(5):
            parts += _herb(f"Herb{r}{i}", (0.28 - 0.44 + i * 0.22, by, 0.05), m, tall=(i % 2 == 0))
    parts += drying_rack("Bundles", 0.56, (0.72, -0.56, 0.0), m, bars=4)
    parts += barrel("Tincture", (-0.76, 0.40, 0.19), m["timber_dark"])

    return finish(parts, "Herbalist")


def hospital():
    """A long two-winged infirmary in plaster and stone, with a covered entrance porch."""
    reset_scene()
    m = palette()
    parts = []
    base_h, wall_h, roof_h = 0.22, 1.14, 0.84

    footing = box("Footing", (1.86, 1.54, base_h), (0, 0, base_h / 2), m["stone"])
    bevel(footing, 0.02)
    parts.append(footing)
    # Main range across the plot...
    parts += half_timber(1.76, 1.02, wall_h, base_h, m, name="Main")
    parts += shingled_roof(1.76, 1.02, roof_h, base_h + wall_h, m, rows=6, name="MainRoof")
    # ...with a cross wing at one end, which is what gives it an institutional footprint.
    wing = half_timber(0.86, 1.44, wall_h * 0.94, base_h, m, braces=False, name="Wing")
    wing_roof = _ridge_x(0.86, 1.44, roof_h * 0.86, base_h + wall_h * 0.94, m, rows=5)
    for ob in wing + wing_roof:
        ob.location.x += -0.44
        ob.location.y += 0.24
    parts += wing + wing_roof

    parts += door("Main", 0.51, base_h, m, width=0.42, height=0.72, x=0.52)
    # Porch over the door.
    parts += posts("Porch", [(0.26, 0.90), (0.78, 0.90)], 0.92, 0.07, 0, m["timber"])
    porch = box("PorchRoof", (0.66, 0.50, 0.06), (0.52, 0.78, 0.96), m["slate"])
    porch.rotation_euler = (math.radians(-16), 0, 0)
    parts.append(porch)
    for sx in (0.20, 1.06):
        parts += window("Main", sx - 0.62, -0.51, base_h + 0.78, m, width=0.30, height=0.32)
    parts += window("Wing", -0.44, 0.96, base_h + 0.76, m, width=0.30, height=0.32)
    parts += chimney("Ward", 0.72, -0.30, base_h + wall_h, 0.88, m, width=0.28)

    return finish(parts, "Hospital")


def well():
    """A single-tile well: stone ring, timber frame, shingled cap, bucket on a rope."""
    reset_scene()
    m = palette()
    parts = []

    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=0.40, vertices=12, location=(0, 0, 0.20))
    ring = bpy.context.active_object
    ring.name = "Ring"
    ring.data.materials.append(m["stone"])
    parts.append(ring)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.24, depth=0.06, vertices=12, location=(0, 0, 0.39))
    shaft = bpy.context.active_object
    shaft.name = "Shaft"
    shaft.data.materials.append(m["window"])  # the dark water below
    parts.append(shaft)
    # Cobbled apron so the well sits in a paved spot rather than floating on grass.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.46, depth=0.05, vertices=12, location=(0, 0, 0.025))
    apron = bpy.context.active_object
    apron.name = "Apron"
    apron.data.materials.append(m["stone_dark"])
    parts.append(apron)

    parts += posts("Well", [(-0.28, 0), (0.28, 0)], 0.72, 0.09, 0.38, m["timber"])
    parts.append(box("Beam", (0.66, 0.09, 0.09), (0, 0, 1.10), m["timber"]))
    parts += shingled_roof(0.62, 0.52, 0.28, 1.12, m, rows=3, overhang=0.12, name="Cap")
    # Windlass and bucket.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.44, vertices=8, location=(0, 0, 0.98))
    drum = bpy.context.active_object
    drum.name = "Windlass"
    drum.rotation_euler = (0, math.pi / 2, 0)
    drum.data.materials.append(m["timber_dark"])
    parts.append(drum)
    parts.append(box("Rope", (0.03, 0.03, 0.30), (0, 0, 0.80), m["cloth"]))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.10, depth=0.16, vertices=8, location=(0, 0, 0.58))
    bucket = bpy.context.active_object
    bucket.name = "Bucket"
    bucket.data.materials.append(m["timber"])
    parts.append(bucket)

    return finish(parts, "Well")


def barn():
    """A great timber barn: tall doors on the gable end, boarded walls, a shallower roof.

    Deliberately the plainest big building in the village — no plaster, no windows, just boards
    and a pair of doors big enough to back a cart through.
    """
    reset_scene()
    m = palette()
    parts = []
    bw, bd = 1.80, 1.60
    base_h, wall_h, roof_h = 0.20, 1.14, 0.84

    footing = box("Footing", (bw + 0.10, bd + 0.10, base_h), (0, 0, base_h / 2), m["stone_dark"])
    bevel(footing, 0.02)
    parts.append(footing)

    # Vertical board-and-batten walls: a plain core with battens standing proud of it.
    parts.append(box("Shell", (bw, bd, wall_h), (0, 0, base_h + wall_h / 2), m["timber_dark"]))
    n = 9
    for i in range(n + 1):
        x = -bw / 2 + bw * i / n
        for sy in (-1, 1):
            parts.append(box("Batten", (0.07, 0.05, wall_h), (x, sy * (bd / 2 + 0.01), base_h + wall_h / 2), m["timber"]))
    for i in range(8):
        y = -bd / 2 + bd * i / 7
        for sx in (-1, 1):
            parts.append(box("Batten", (0.05, 0.07, wall_h), (sx * (bw / 2 + 0.01), y, base_h + wall_h / 2), m["timber"]))
    # Sill and eave plates tie the boarding together.
    for z in (base_h + 0.03, base_h + wall_h - 0.05):
        parts.append(box("Plate", (bw + 0.06, bd + 0.06, 0.09), (0, 0, z), m["timber"]))

    parts += shingled_roof(bw, bd, roof_h, base_h + wall_h, m, rows=7, overhang=0.16,
                           keys=("shake", "shake_light"))

    # The big doors, with a strap-hinged brace across each leaf.
    for sx in (-1, 1):
        leaf = box("Door", (0.42, 0.09, 0.94), (sx * 0.23, bd / 2 - 0.03, base_h + 0.47), m["timber"])
        parts.append(leaf)
        for z in (base_h + 0.20, base_h + 0.74):
            parts.append(box("Strap", (0.40, 0.06, 0.06), (sx * 0.23, bd / 2 - 0.05, z), m["metal"]))
    parts.append(box("DoorHead", (1.00, 0.10, 0.10), (0, bd / 2 - 0.03, base_h + 0.99), m["timber"]))
    # A hay hatch high in the gable, and a cart parked outside.
    parts.append(box("Hatch", (0.34, 0.08, 0.30), (0, bd / 2 - 0.02, base_h + wall_h - 0.02), m["timber_dark"]))
    parts += crate_cluster("Yard", (0.86, 0.92, 0.0), m, count=3)

    return finish(parts, "Barn")


# ---- local props ------------------------------------------------------------------------------
def _thatch(width, depth, height, base_z, mats, rows=5):
    """A thatched gable roof — deeper courses and a fat ridge, unlike the crisp shingle version."""
    parts = []
    hw = width / 2 + 0.15
    depth_o = depth + 0.30
    pitch = math.atan2(height, hw)
    slope_len = math.hypot(hw, height)
    for side in (-1, 1):
        for i in range(rows):
            t = (i + 0.5) / rows
            bpy.ops.mesh.primitive_cube_add(size=1)
            ob = bpy.context.active_object
            ob.name = "ThatchCourse"
            ob.scale = (slope_len / rows * 1.4, depth_o, 0.10)
            ob.rotation_euler = (0, side * pitch, 0)
            ob.location = (side * hw * (1 - t), 0, base_z + height * t)
            ob.data.materials.append(mats["thatch"])
            parts.append(ob)
    parts.append(box("ThatchRidge", (0.26, depth_o, 0.16), (0, 0, base_z + height), mats["thatch"]))
    return parts


def _ridge_x(width, depth, height, base_z, mats, rows=5):
    """A shingled gable whose ridge runs along X instead of Y — for cross wings."""
    parts = []
    hd = depth / 2 + 0.10
    width_o = width + 0.20
    pitch = math.atan2(height, hd)
    slope_len = math.hypot(hd, height)
    for side in (-1, 1):
        for i in range(rows):
            t = (i + 0.5) / rows
            bpy.ops.mesh.primitive_cube_add(size=1)
            ob = bpy.context.active_object
            ob.name = "WingCourse"
            ob.scale = (width_o, slope_len / rows * 1.34, 0.055)
            ob.rotation_euler = (-side * pitch, 0, 0)
            ob.location = (0, side * hd * (1 - t), base_z + height * t)
            ob.data.materials.append(mats["slate" if i % 2 == 0 else "slate_light"])
            parts.append(ob)
    parts.append(box("WingRidge", (width_o, 0.16, 0.10), (0, 0, base_z + height), mats["slate"]))
    return parts


def _yew(name, base, mats):
    """A dark, broad churchyard yew — rounder and heavier than the map's conifers."""
    parts = []
    x, y, z = base
    bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=0.34, vertices=7, location=(x, y, z + 0.17))
    trunk = bpy.context.active_object
    trunk.name = f"{name}Trunk"
    trunk.data.materials.append(mats["bark"])
    parts.append(trunk)
    for i, (r, dz) in enumerate(((0.30, 0.44), (0.24, 0.66))):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=(x, y, z + dz))
        ob = bpy.context.active_object
        ob.name = f"{name}Crown"
        ob.scale = (1.0, 1.0, 0.78)
        ob.data.materials.append(mats["foliage_dark" if i == 0 else "foliage"])
        parts.append(ob)
    return parts


def _herb(name, base, mats, tall=False):
    """A clump of herbs in a bed — a few leaf blades fanned out of the soil."""
    parts = []
    x, y, z = base
    h = 0.20 if tall else 0.14
    for k in range(3):
        a = math.radians(-24 + k * 24)
        blade = box(f"{name}Leaf", (0.045, 0.045, h), (x + math.sin(a) * 0.03, y, z + h / 2), mats["foliage_light" if k % 2 else "foliage"])
        blade.rotation_euler = (0, a, 0)
        parts.append(blade)
    return parts
