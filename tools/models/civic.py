"""Everything the village builds for itself rather than for production.

School, tavern, chapel, cemetery, herbalist, hospital, well and barn. These are the buildings a
player looks at rather than through, so each one leans on a single strong silhouette cue — a
bell cupola, a steeple, a run of headstones, a great pair of barn doors at each gable end.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import (barrel, chimney, crate_cluster, door, drying_rack, lean_to, log_pile, posts,
                   sign_board, stone_walls, window)
from style import THATCH_PITCH, courses, palette, shingled_roof, half_timber


def school():
    """School (3 x 4): a two-storey plaster hall under a bell cupola, with a yard at the door end.

    The hall runs the length of the plot with its ridge along it, so from above the school reads
    as the one *long* civic building. It now stands two storeys to match — the tallest thing in a
    village that is otherwise all cottages, which is what a schoolhouse should look like from
    across the map. A band course marks the floor between them and the upper windows sit above it,
    so the extra height reads as a second storey rather than one very tall room.
    """
    reset_scene()
    m = palette()
    parts = []
    hw, hd = 2.30, 2.90
    base_h, wall_h, roof_h = 0.22, 2.02, 0.98
    upper_h = 1.06  # height of the band course marking the first floor
    oy = -0.32

    footing = box("Footing", (hw + 0.12, hd + 0.12, base_h), (0, oy, base_h / 2), m["stone"])
    bevel(footing, 0.02)
    parts.append(footing)
    walls = half_timber(hw, hd, wall_h, base_h, m, name="Hall")
    roof = shingled_roof(hw, hd, roof_h, base_h + wall_h, m, overhang=0.12)
    for ob in walls + roof:
        ob.location.y += oy
    parts += walls + roof

    parts += door("Hall", oy + hd / 2, base_h, m, width=0.46, height=0.76)
    # The band course: a plate right round the building at first-floor level, which is what makes
    # two storeys read as two rather than as one wall that got taller.
    parts.append(box("Band", (hw + 0.10, hd + 0.10, 0.10), (0, oy, base_h + upper_h), m["timber"]))
    # Windows on both floors of the gable end, and down both long sides — a schoolroom is the one
    # building that wants daylight.
    for sx in (-1, 1):
        parts += window("Hall", sx * 0.72, oy + hd / 2, base_h + 0.84, m, width=0.34, height=0.34)
        parts += window("HallUp", sx * 0.72, oy + hd / 2, base_h + upper_h + 0.42, m, width=0.34, height=0.34)
    for dy in (-0.92, 0.0, 0.92):
        for sx in (-1, 1):
            parts += window("Side", oy + dy, sx * (hw / 2), base_h + 0.84, m, width=0.34, height=0.34, axis="x")
            parts += window("SideUp", oy + dy, sx * (hw / 2), base_h + upper_h + 0.42, m, width=0.34, height=0.34, axis="x")

    # Bell cupola straddling the ridge — the one thing that tells a school from a big house.
    cz = base_h + wall_h + roof_h
    parts.append(box("CupolaBase", (0.44, 0.44, 0.18), (0, oy + 0.90, cz + 0.03), m["timber"]))
    parts += posts("Cupola", [(sx * 0.16, oy + 0.90 + sy * 0.16) for sx in (-1, 1) for sy in (-1, 1)],
                   0.34, 0.06, cz + 0.12, m["timber"])
    bpy.ops.mesh.primitive_cone_add(radius1=0.34, radius2=0.0, depth=0.36, vertices=4,
                                    location=(0, oy + 0.90, cz + 0.64))
    cap = bpy.context.active_object
    cap.name = "CupolaCap"
    cap.rotation_euler = (0, 0, math.radians(45))
    cap.data.materials.append(m["slate"])
    parts.append(cap)
    bpy.ops.mesh.primitive_cone_add(radius1=0.085, radius2=0.05, depth=0.16, vertices=8,
                                    location=(0, oy + 0.90, cz + 0.34))
    bell = bpy.context.active_object
    bell.name = "Bell"
    bell.data.materials.append(m["metal"])
    parts.append(bell)

    # The schoolyard: benches either side of the door and a woodpile for the stove.
    for sx in (-1, 1):
        parts.append(box("BenchTop", (0.86, 0.22, 0.07), (sx * 0.82, 1.62, 0.34), m["timber"]))
        parts += posts("Bench", [(sx * 0.82 - 0.34, 1.62), (sx * 0.82 + 0.34, 1.62)], 0.34, 0.07, 0, m["timber_dark"])
    parts += log_pile("Stove", (0.0, 1.66, 0.0), m, rows=2, per_row=3, length=0.58)
    parts += chimney("Stove", -0.86, oy - 1.10, base_h + wall_h, 0.86, m, width=0.28)

    return finish(parts, "School")


def tavern():
    """Tavern (4 x 4): half-timbered and jettied, with a drinking yard of trestles and barrels.

    The upper storey oversails the lower one — the medieval-town cue — and the yard in front of
    it is half the plot, because the tavern's whole point in the simulation is people gathering.
    """
    reset_scene()
    m = palette()
    parts = []
    lw, ld = 2.40, 2.20
    base_h, low_h, up_h, roof_h = 0.20, 0.94, 0.78, 0.94
    oy = -0.52

    footing = box("Footing", (lw + 0.10, ld + 0.10, base_h), (0, oy, base_h / 2), m["stone"])
    bevel(footing, 0.02)
    parts.append(footing)
    lower = half_timber(lw, ld, low_h, base_h, m, braces=False, name="Lower")
    upper = half_timber(lw + 0.24, ld + 0.24, up_h, base_h + low_h, m, name="Upper")
    roof = shingled_roof(lw + 0.24, ld + 0.24, roof_h, base_h + low_h + up_h, m, overhang=0.12)
    for ob in lower + upper + roof:
        ob.location.y += oy
    parts += lower + upper + roof

    front = oy + ld / 2 + 0.12
    parts += door("Tav", front, base_h, m, width=0.44, height=0.70, x=-0.52)
    for sx in (0.30, 0.94):
        parts += window("Tav", sx, front, base_h + 0.62, m, width=0.36, height=0.30)
    for sx in (-1, 1):
        parts += window("Up", sx * 0.72, front, base_h + low_h + 0.42, m, width=0.30, height=0.28)
        parts += window("Up2", sx * 0.24, front, base_h + low_h + 0.42, m, width=0.30, height=0.28)
    parts += chimney("Hearth", -lw / 2 - 0.04, oy - 0.52, base_h + low_h + up_h, 1.06, m, width=0.32)
    parts += sign_board("Sign", 0.02, front, base_h + 0.80, m, width=0.40)

    # The yard: trestle tables, stacked ale barrels, and a lean-to over the brewing tubs.
    for i, tx in enumerate((-1.14, 0.34)):
        parts.append(box("TableTop", (0.94, 0.40, 0.07), (tx, 1.42, 0.42), m["timber"]))
        parts += posts("Table", [(tx - 0.38, 1.42), (tx + 0.38, 1.42)], 0.42, 0.08, 0, m["timber_dark"])
        for sy in (-1, 1):
            parts.append(box("Bench", (0.90, 0.16, 0.05), (tx, 1.42 + sy * 0.38, 0.26), m["timber_dark"]))
    # Ale barrels stacked two-on-one against the yard wall.
    for i, (bx, by, bz) in enumerate(((1.66, 1.24, 0.19), (1.66, 0.78, 0.19), (1.66, 1.01, 0.56))):
        parts += barrel(f"Ale{i}", (bx, by, bz), m["timber" if i % 2 else "timber_dark"])
    # Firewood for the hearth stacked along the west side, out of the weather under the jetty.
    parts += log_pile("Hearth", (-1.76, -0.20, 0.0), m, rows=3, per_row=4, length=0.62)
    brew = lean_to("Brew", 1.10, 0.90, 0.96, m, rise=0.30, toward=1)
    for ob in brew:
        ob.location.x += 1.32
        ob.location.y += -1.30
    parts += brew
    for bx in (1.10, 1.54):
        parts += barrel("Tub", (bx, -1.30, 0.24), m["timber"], radius=0.20, height=0.48)

    return finish(parts, "Tavern")


def chapel():
    """Chapel (4 x 5): a stone nave under a west tower whose spire is the village's tallest thing.

    The player asked for this one to stand five tiles high against everything else's two, and the
    spire is where that height goes — the nave itself stays barely taller than a house. A church
    that is uniformly five tiles tall is a warehouse; a church is a low body with one needle on
    it, and the needle is what you see across the map.
    """
    reset_scene()
    m = palette()
    parts = []
    nw, nd = 3.40, 3.10
    base_h, wall_h, roof_h = 0.24, 1.90, 1.40
    noy = -0.75

    footing = box("Footing", (nw + 0.16, nd + 0.16, base_h), (0, noy, base_h / 2), m["stone_dark"])
    bevel(footing, 0.02)
    parts.append(footing)
    nave = stone_walls("Nave", nw, nd, wall_h, base_h, m)
    roof = shingled_roof(nw, nd, roof_h, base_h + wall_h, m, name="NaveRoof")
    for ob in nave + roof:
        ob.location.y += noy
    parts += nave + roof

    # Buttresses down both flanks — the detail that says "stone" rather than "big shed", and what
    # widens the chapel to fill a 4-tile plot without simply making the nave fatter.
    for dy in (-1.86, -0.85, 0.16):
        for sx in (-1, 1):
            but = box("Buttress", (0.34, 0.42, wall_h * 0.86), (sx * (nw / 2 + 0.10), dy, base_h + wall_h * 0.43), m["stone"])
            bevel(but, 0.02)
            parts.append(but)
            cap = box("ButtressCap", (0.40, 0.48, 0.12), (sx * (nw / 2 + 0.10), dy, base_h + wall_h * 0.86), m["stone_dark"])
            parts.append(cap)

    # Tower at the front, so the door in its base lands on the middle of the face the game uses
    # as the entrance. Taller than the nave by half again, then the spire on top of that.
    tw = 1.70
    toy = 1.58
    tower_h = 4.00
    tower = stone_walls("Tower", tw, tw, tower_h, base_h, m)
    for ob in tower:  # stone_walls builds at the origin; shift the whole tower into place
        ob.location.y += toy
    parts += tower
    parts.append(box("TowerBand", (tw + 0.10, tw + 0.10, 0.14), (0, toy, base_h + tower_h * 0.56), m["stone_dark"]))
    parts.append(box("Parapet", (tw + 0.14, tw + 0.14, 0.22), (0, toy, base_h + tower_h + 0.11), m["stone"]))
    bpy.ops.mesh.primitive_cone_add(radius1=tw * 0.68, radius2=0.0, depth=1.90, vertices=4,
                                    location=(0, toy, base_h + tower_h + 1.17))
    spire = bpy.context.active_object
    spire.name = "Spire"
    spire.rotation_euler = (0, 0, math.radians(45))
    spire.data.materials.append(m["slate"])
    parts.append(spire)
    parts.append(box("Finial", (0.09, 0.09, 0.36), (0, toy, base_h + tower_h + 2.26), m["metal"]))
    # Belfry openings on all four faces, high in the tower.
    for sx, sy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        parts.append(box("Belfry", (0.34 if sy else 0.08, 0.08 if sy else 0.34, 0.52),
                         (sx * (tw / 2 - 0.02), toy + sy * (tw / 2 - 0.02), base_h + tower_h - 0.46), m["window"]))

    # Arched west door in the tower, lancets down the nave, and a rose window over the door.
    parts += door("Chapel", toy + tw / 2, base_h, m, width=0.46, height=0.94)
    parts.append(box("Rose", (0.44, 0.08, 0.44), (0, toy + tw / 2 - 0.03, base_h + 1.50), m["window"]))
    for dy in (-1.86, -0.85, 0.16):
        for sx in (-1, 1):
            parts.append(box("Lancet", (0.09, 0.20, 0.80), (sx * (nw / 2 - 0.03), dy + 0.50, base_h + 0.96), m["window"]))
    # A stepped platform at the door.
    parts.append(box("Step", (1.90, 0.34, 0.14), (0, toy + tw / 2 + 0.16, 0.07), m["stone"]))
    parts.append(box("Step2", (2.20, 0.24, 0.07), (0, toy + tw / 2 + 0.40, 0.035), m["stone_dark"]))

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
    """Herbalist (3 x 3): a thatched cottage with physic beds, drying bundles and tincture casks.

    The only thatched roof left in the working half of the village, which is deliberate — the
    herbalist should read as the oldest and least industrial thing on the map.
    """
    reset_scene()
    m = palette()
    parts = []
    hw, hd = 1.70, 1.45
    base_h, wall_h, roof_h = 0.16, 1.16, 1.02
    ox, oy = -0.58, -0.66

    pad = box("Pad", (hw + 0.14, hd + 0.14, base_h), (ox, oy, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)
    walls = half_timber(hw, hd, wall_h, base_h, m, braces=False, name="Cot")
    roof = _thatch(hw, hd, roof_h, base_h + wall_h, m)
    for ob in walls + roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls + roof
    parts += door("Cot", oy + hd / 2, base_h, m, width=0.38, height=0.66, x=ox)
    parts += window("Cot", ox + 0.54, oy + hd / 2, base_h + 0.72, m, width=0.26, height=0.24)
    parts += chimney("Hearth", ox - 0.56, oy - 0.30, base_h + wall_h, 0.82, m, width=0.26)

    # Physic beds in rows across the yard — the herbalist's whole visual identity, and the one
    # thing worth spending the extra tile on.
    for r, by in enumerate((0.42, 0.86, 1.28)):
        parts.append(box("Bed", (2.24, 0.26, 0.05), (0.18, by, 0.025), m["soil"]))
        for i in range(7):
            parts += _herb(f"Herb{r}{i}", (0.18 - 1.00 + i * 0.333, by, 0.05), m, tall=((i + r) % 2 == 0))

    # Bundles hung to dry under the eave, and the tincture casks by the door.
    parts += drying_rack("Bundles", 0.74, (0.96, -0.52, 0.0), m, bars=4)
    parts += drying_rack("Bundles2", 0.62, (1.10, -1.16, 0.0), m, bars=3)
    parts += barrel("Tincture", (-1.14, 0.40, 0.19), m["timber_dark"])
    parts += barrel("Tincture2", (-1.20, 0.94, 0.19), m["timber"])
    parts += _mortar("Mortar", (-1.16, -1.30, 0.0), m)

    return finish(parts, "Herbalist")


def hospital():
    """Hospital (4 x 5): a long infirmary range with a cross wing and a covered entrance porch.

    Two ranges meeting at right angles is what makes a building read as *institutional* rather
    than domestic — no house in the village has a plan that complicated, and at 4x5 there is
    finally room to draw it properly instead of implying it.
    """
    reset_scene()
    m = palette()
    parts = []
    base_h, wall_h, roof_h = 0.22, 1.40, 1.10
    mw, md = 2.60, 4.00
    mox, moy = 0.30, -0.25

    footing = box("Footing", (mw + 0.14, md + 0.14, base_h), (mox, moy, base_h / 2), m["stone"])
    bevel(footing, 0.02)
    parts.append(footing)
    # Main ward range running the length of the plot...
    main = half_timber(mw, md, wall_h, base_h, m, name="Main")
    main_roof = shingled_roof(mw, md, roof_h, base_h + wall_h, m, overhang=0.12, name="MainRoof")
    for ob in main + main_roof:
        ob.location.x += mox
        ob.location.y += moy
    parts += main + main_roof
    # ...with a cross wing at the far end, its ridge across the main one's.
    ww, wd = 1.70, 2.00
    wox, woy = -1.10, 1.10
    parts.append(box("WingFoot", (ww + 0.12, wd + 0.12, base_h), (wox, woy, base_h / 2), m["stone"]))
    wing = half_timber(ww, wd, wall_h * 0.92, base_h, m, braces=False, name="Wing")
    wing_roof = _ridge_x(ww, wd, roof_h * 0.88, base_h + wall_h * 0.92, m)
    for ob in wing + wing_roof:
        ob.location.x += wox
        ob.location.y += woy
    parts += wing + wing_roof

    # Entrance porch on the main range's gable end, on the middle of the face the game enters by.
    front = moy + md / 2
    parts += door("Main", front, base_h, m, width=0.46, height=0.78, x=mox)
    parts += posts("Porch", [(mox - 0.44, front + 0.52), (mox + 0.44, front + 0.52)], 1.02, 0.08, 0, m["timber"])
    porch = box("PorchRoof", (1.10, 0.72, 0.07), (mox, front + 0.32, 1.08), m["slate"])
    porch.rotation_euler = (math.radians(-16), 0, 0)
    parts.append(porch)
    for sx in (-1, 1):
        parts += window("Front", mox + sx * 0.86, front, base_h + 0.94, m, width=0.32, height=0.34)
    # Ward windows down the long east flank and the wing's front.
    for dy in (-1.30, -0.40, 0.50, 1.40):
        parts += window("Ward", moy + dy, mox + mw / 2, base_h + 0.92, m, width=0.34, height=0.36, axis="x")
    for sx in (-1, 1):
        parts += window("Wing", wox + sx * 0.44, woy + wd / 2, base_h + 0.90, m, width=0.32, height=0.34)
    parts += chimney("Ward", mox + 0.90, moy - 1.60, base_h + wall_h, 1.00, m, width=0.30)
    parts += chimney("Wing", wox - 0.62, woy, base_h + wall_h * 0.92, 0.86, m, width=0.26)

    # A physic garden and a bench in the angle the two ranges make.
    parts.append(box("Bed", (1.50, 0.60, 0.05), (-1.02, -1.10, 0.025), m["soil"]))
    for i in range(5):
        parts += _herb(f"Physic{i}", (-1.02 - 0.60 + i * 0.30, -1.10, 0.05), m, tall=(i % 2 == 0))
    parts.append(box("BenchTop", (0.92, 0.22, 0.07), (-1.30, 2.02, 0.34), m["timber"]))
    parts += posts("Bench", [(-1.66, 2.02), (-0.94, 2.02)], 0.34, 0.07, 0, m["timber_dark"])

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
    """Storage barn (3 x 4): a long boarded shed with cart doors at *both* gable ends.

    Deliberately the plainest big building in the village — no plaster, no windows, just boards
    and doors big enough to back a cart through. The whole village carries things in and out of it
    all day, so it has an end open at each gable and the simulation sends each villager to
    whichever is nearer; the model has to show that, or the second door is a lie. It is also the
    one building that should look *full*, so it fills nearly its whole plot rather than sitting in
    a yard.
    """
    reset_scene()
    m = palette()
    parts = []
    bw, bd = 2.42, 3.23  # 3 x 4 tiles
    base_h, wall_h, roof_h = 0.20, 1.34, 0.98

    footing = box("Footing", (bw + 0.12, bd + 0.12, base_h), (0, 0, base_h / 2), m["stone_dark"])
    bevel(footing, 0.02)
    parts.append(footing)

    # Vertical board-and-batten walls: a plain core with battens standing proud of it. The battens
    # are spaced at a fixed pitch rather than by a fixed count, so a wider barn gets more boards
    # instead of wider ones — the same rule the roof courses follow.
    parts.append(box("Shell", (bw, bd, wall_h), (0, 0, base_h + wall_h / 2), m["timber_dark"]))
    pitch = 0.20
    n = max(4, round(bw / pitch))
    for i in range(n + 1):
        x = -bw / 2 + bw * i / n
        for sy in (-1, 1):
            parts.append(box("Batten", (0.07, 0.05, wall_h), (x, sy * (bd / 2 + 0.01), base_h + wall_h / 2), m["timber"]))
    n = max(4, round(bd / pitch))
    for i in range(n + 1):
        y = -bd / 2 + bd * i / n
        for sx in (-1, 1):
            parts.append(box("Batten", (0.05, 0.07, wall_h), (sx * (bw / 2 + 0.01), y, base_h + wall_h / 2), m["timber"]))
    # Sill and eave plates tie the boarding together.
    for z in (base_h + 0.03, base_h + wall_h - 0.05):
        parts.append(box("Plate", (bw + 0.06, bd + 0.06, 0.09), (0, 0, z), m["timber"]))

    parts += shingled_roof(bw, bd, roof_h, base_h + wall_h, m, overhang=0.16,
                           keys=("shake", "shake_light"))

    # The big doors, with a strap-hinged brace across each leaf — the same pair at each gable end.
    # They stand *proud* of the boarding, and the straps proud of them again: sunk flush the way
    # they were, a door on a wall of the same timber is a slightly paler rectangle nobody reads as
    # a way in, which is no good at all when the whole point is that there are two of them.
    for sy in (-1, 1):
        for sx in (-1, 1):
            leaf = box("Door", (0.56, 0.09, 1.10), (sx * 0.30, sy * (bd / 2 + 0.015), base_h + 0.55), m["timber"])
            parts.append(leaf)
            for z in (base_h + 0.24, base_h + 0.86):
                parts.append(box("Strap", (0.54, 0.06, 0.06), (sx * 0.30, sy * (bd / 2 + 0.07), z), m["metal"]))
        parts.append(box("DoorHead", (1.30, 0.11, 0.11), (0, sy * (bd / 2 + 0.02), base_h + 1.16), m["timber"]))
        # A hay hatch high in each gable, and a loading ramp down to the ground at each end.
        parts.append(box("Hatch", (0.40, 0.08, 0.34), (0, sy * (bd / 2 + 0.01), base_h + wall_h - 0.04), m["timber_dark"]))
        ramp = box("Ramp", (1.40, 0.46, 0.12), (0, sy * (bd / 2 + 0.22), base_h - 0.04), m["timber"])
        ramp.rotation_euler = (math.radians(14 * sy), 0, 0)
        parts.append(ramp)
    # One hoist beam, over the front gable only — two would read as a mirror rather than a barn.
    parts.append(box("Hoist", (0.11, 0.52, 0.11), (0, bd / 2 + 0.20, base_h + wall_h + 0.30), m["timber"]))
    # Goods stacked along the *sides*: both ends have to stay clear for carts now.
    parts += crate_cluster("Yard", (1.34, 0.30, 0.0), m, count=4)
    parts += barrel("Yard", (-1.36, 0.34, 0.19), m["timber"])
    parts += barrel("Yard2", (-1.38, -0.16, 0.19), m["timber_dark"])

    return finish(parts, "Barn")


# ---- local props ------------------------------------------------------------------------------
def _thatch(width, depth, height, base_z, mats, rows=None):
    """A thatched gable roof — deeper courses and a fat ridge, unlike the crisp shingle version."""
    parts = []
    hw = width / 2 + 0.15
    depth_o = depth + 0.30
    pitch = math.atan2(height, hw)
    slope_len = math.hypot(hw, height)
    if rows is None:
        rows = courses(slope_len, THATCH_PITCH)
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


def _ridge_x(width, depth, height, base_z, mats, rows=None):
    """A shingled gable whose ridge runs along X instead of Y — for cross wings."""
    parts = []
    hd = depth / 2 + 0.10
    width_o = width + 0.20
    pitch = math.atan2(height, hd)
    slope_len = math.hypot(hd, height)
    if rows is None:
        rows = courses(slope_len)
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


def _mortar(name, base, mats):
    """A stone mortar on a stump, with the pestle standing in it."""
    parts = []
    x, y, z = base
    bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=0.34, vertices=9, location=(x, y, z + 0.17))
    stump = bpy.context.active_object
    stump.name = f"{name}Stump"
    stump.data.materials.append(mats["bark"])
    parts.append(stump)
    bpy.ops.mesh.primitive_cone_add(radius1=0.13, radius2=0.17, depth=0.20, vertices=10,
                                    location=(x, y, z + 0.44))
    bowl = bpy.context.active_object
    bowl.name = f"{name}Bowl"
    bowl.data.materials.append(mats["stone"])
    parts.append(bowl)
    pestle = box(f"{name}Pestle", (0.05, 0.05, 0.30), (x + 0.04, y, z + 0.62), mats["timber"])
    pestle.rotation_euler = (0, math.radians(18), 0)
    parts.append(pestle)
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
