"""The two extraction sites: the open quarry pit and the mine adit.

Neither of these is really a building — they are holes with equipment around them, and modelling
them as huts would lose the thing that makes them legible from above. The quarry is a terraced
pit worked across a big square plot; the mine is a timbered mouth driven into rock, with a
headframe, a tramway and a spoil heap outside it.

These are the two biggest footprints in the village (quarry 8x8, mine 6x6) and the two that gain
most from the size. At 2x2 the mine was a portal and a stick frame; at 6x6 it is a working yard
with a tramway running out of the adit, which is what an industry is supposed to look like next
to a cottage.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import barrel, crate_cluster, deck, lean_to, log_pile, posts
from style import palette, shingled_roof


def quarry():
    """A stepped stone pit (8 x 8 tiles) with a winch gantry, cut blocks, and a spoil ramp.

    Terraced rather than a plain hole: benches stepping down toward the middle, which is how a
    real quarry is worked and reads far better than a sunken box at this camera angle. The bench
    *steps* are a fixed size, so a bigger pit gets more of them rather than taller ones — that is
    what keeps the quarry at the same visual scale as the buildings around it.
    """
    reset_scene()
    m = palette()
    parts = []
    W, D = 8.0, 8.0

    # Buildings render at a fixed height above the terrain — nothing can actually sink below the
    # ground plane — so the pit is built *upward* as a quarried rock mass with a cut face and a
    # worked floor inside it, rather than downward as a hole that would just clip.
    parts.append(box("Floor", (W - 0.24, D - 0.24, 0.10), (0, 0, 0.05), m["soil"]))
    # Three sides of standing rock, stepped back in benches; the fourth (+Y) is the open haul
    # road, which is also the side the game puts the entrance tile on.
    for i, (inset, h) in enumerate(((0.0, 1.70), (0.52, 1.14), (1.04, 0.62), (1.56, 0.28))):
        z = 0.10 + h / 2
        for sx in (-1, 1):
            face = box(f"Bench{i}", (0.52, D - 1.60 - inset * 2, h),
                       (sx * (W / 2 - 0.26 - inset), -0.60, z), m["stone"])
            bevel(face, 0.02)
            parts.append(face)
        back = box(f"Head{i}", (W - 0.52 - inset * 2, 0.52, h), (0, -(D / 2 - 0.26 - inset), z), m["stone"])
        bevel(back, 0.02)
        parts.append(back)
    # Loose blocks left standing on the benches, so the rim is not a smooth extrusion.
    for i, (bx, by, bh) in enumerate(((-3.30, 1.30, 0.60), (3.34, 0.60, 0.48), (-1.60, -3.30, 0.52),
                                      (1.90, -3.26, 0.66), (3.30, -1.90, 0.44))):
        blk = box(f"Crag{i}", (0.62, 0.66, bh), (bx, by, 0.10 + bh / 2), m["stone_dark"] if i % 2 else m["stone"])
        bevel(blk, 0.03)
        blk.rotation_euler = (0, 0, math.radians((i % 4 - 1) * 8))
        parts.append(blk)

    # Cut blocks stacked by the haul road, waiting to be carried out, and a sawn-block stack.
    for i, (bx, by) in enumerate(((-2.40, 3.10), (-2.40, 2.28), (-1.60, 2.70), (-1.62, 1.90))):
        parts.append(box(f"Block{i}", (0.66, 0.72, 0.42), (bx, by, 0.31), m["stone"]))
    parts.append(box("BlockTop", (0.62, 0.68, 0.40), (-2.02, 2.70, 0.72), m["stone_dark"]))
    parts.append(box("BlockTop2", (0.58, 0.64, 0.38), (-2.02, 2.70, 1.11), m["stone"]))

    # A timber gantry with a winch drum over the pit — the vertical element that stops a big
    # rectangular hole from reading as a texture swatch.
    gy = 0.20
    parts += posts("Gantry", [(sx * 1.55, gy + sy * 0.70) for sx in (-1, 1) for sy in (-1, 1)],
                   2.10, 0.20, 0.10, m["timber"])
    parts.append(box("GantryBeam", (3.50, 0.22, 0.22), (0, gy, 2.30), m["timber"]))
    parts.append(box("GantryTie", (3.50, 0.16, 0.16), (0, gy - 0.70, 1.90), m["timber"]))
    for sx in (-1, 1):  # cross-braces, so the frame reads as a structure not four sticks
        for sy in (-1, 1):
            br = box("GantryBrace", (1.10, 0.13, 0.13), (sx * 1.05, gy + sy * 0.70, 1.80), m["timber"])
            br.rotation_euler = (0, sx * math.radians(28), 0)
            parts.append(br)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.24, depth=0.90, vertices=10, location=(0, gy, 2.06))
    drum = bpy.context.active_object
    drum.name = "Winch"
    drum.rotation_euler = (0, math.pi / 2, 0)
    drum.data.materials.append(m["timber_dark"])
    parts.append(drum)
    parts.append(box("Rope", (0.05, 0.05, 1.20), (0, gy, 1.30), m["cloth"]))
    parts.append(box("Slung", (0.56, 0.60, 0.40), (0, gy, 0.50), m["stone"]))  # a block on the hook

    # Spoil heaps, barrows and split-out rubble across the floor.
    parts += _rubble("Spoil", (2.30, 1.60, 0.10), m, count=9)
    parts += _rubble("Spoil2", (-1.00, -1.60, 0.10), m, count=7)
    parts += _rubble("Spoil3", (2.60, -1.10, 0.10), m, count=6)
    parts += _rubble("Spoil4", (-2.70, -0.40, 0.10), m, count=5)

    # Tool lean-tos at the pit mouth so the site has somewhere for the workers to be, and a
    # ramp of packed spoil climbing out to the haul road.
    for ox in (2.30, -3.10):
        shed = lean_to("Tools", 1.30, 1.10, 0.94, m, rise=0.32, toward=1)
        for ob in shed:
            ob.location.x += ox
            ob.location.y += 3.06
        parts += shed
    parts += crate_cluster("Tools", (2.30, 3.00, 0.10), m, count=3)
    parts += barrel("Water", (-3.10, 2.96, 0.29), m["timber"])
    ramp = box("Ramp", (2.20, 1.90, 0.20), (0.40, 3.10, 0.16), m["soil"])
    ramp.rotation_euler = (math.radians(-7), 0, 0)
    parts.append(ramp)
    parts += _sled("Sled", (0.40, 2.30, 0.10), m)

    return finish(parts, "Quarry")


def mine():
    """A mine yard (6 x 6): a timbered adit into the rock, a headframe, a tramway and spoil.

    Placement forces this against a mountain, so the model leans into that — the rock mass and
    the portal fill the -Y edge, and everything the player reads (headframe, tramway, carts,
    spoil, the winding house) sits on the open +Y side where the entrance tile is.
    """
    reset_scene()
    m = palette()
    parts = []

    # The rock the adit is driven into, along the whole back edge. Stepped and broken up rather
    # than one grey slab — a plain box at this size swallows the portal and reads as a wall.
    for i, (w, d, h, x, y) in enumerate((
        (1.90, 1.40, 2.60, -2.00, -2.20),
        (1.50, 1.10, 1.90, 2.05, -2.36),
        (1.30, 0.90, 1.45, -0.20, -2.55),
        (5.80, 0.80, 1.05, 0.00, -2.74),
        (1.10, 0.80, 2.10, -2.78, -1.30),
        (0.95, 0.70, 1.55, 2.72, -1.15),
    )):
        chunk = box(f"Face{i}", (w, d, h), (x, y, h / 2), m["stone"] if i % 2 else m["stone_dark"])
        bevel(chunk, 0.03)
        chunk.rotation_euler = (0, 0, math.radians(-7 + i * 5))
        parts.append(chunk)
    parts += _rubble("Face", (-1.60, -1.30, 0.0), m, count=6)
    parts += _rubble("Face2", (1.30, -1.40, 0.0), m, count=5)

    # Timbered portal: two heavy posts, a lintel, and a black opening behind them.
    ph, pw = 1.70, 0.30
    for sx in (-1, 1):
        parts.append(box("Portal", (pw, 0.44, ph), (sx * 0.70, -1.70, ph / 2), m["timber_dark"]))
    parts.append(box("PortalHead", (1.80, 0.48, 0.32), (0, -1.70, ph + 0.16), m["timber_dark"]))
    parts.append(box("Adit", (1.12, 0.60, ph), (0, -1.98, ph / 2), m["window"]))  # the dark hole
    # Braces across the head, the detail that says "propped" rather than "carved".
    parts.append(box("Brace", (1.44, 0.20, 0.16), (0, -1.44, ph - 0.20), m["timber"]))
    for sx in (-1, 1):
        br = box("Raker", (0.16, 0.16, 1.00), (sx * 1.02, -1.40, 0.50), m["timber"])
        br.rotation_euler = (0, sx * math.radians(15), 0)
        parts.append(br)

    # Headframe over the portal — the mine's silhouette from any distance, and where its extra
    # tile of height goes. Everything else on the plot stays at working height.
    frame_h = 4.00
    parts += posts("Frame", [(-0.92, 0.20), (0.92, 0.20), (-0.66, -0.86), (0.66, -0.86)],
                   frame_h, 0.20, 0.0, m["timber"])
    parts.append(box("FrameBeam", (2.10, 0.20, 0.20), (0, 0.20, frame_h + 0.10), m["timber"]))
    for sx in (-1, 1):
        parts.append(box("FrameTie", (0.18, 1.24, 0.16), (sx * 0.80, -0.33, frame_h - 0.16), m["timber"]))
        for z, span in ((1.20, 1.90), (2.60, 1.90)):
            parts.append(box("FrameRail", (span, 0.14, 0.14), (0, 0.20 if sx > 0 else -0.86, z), m["timber"]))
        br = box("FrameBrace", (0.16, 0.16, 2.30), (sx * 0.86, -0.33, 2.00), m["timber"])
        br.rotation_euler = (sx * math.radians(20), 0, 0)
        parts.append(br)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.34, depth=0.26, vertices=12, location=(0, 0.20, frame_h + 0.10))
    wheel = bpy.context.active_object
    wheel.name = "Sheave"
    wheel.rotation_euler = (math.pi / 2, 0, 0)
    wheel.data.materials.append(m["metal"])
    parts.append(wheel)
    parts.append(box("Hoist", (0.06, 0.06, 2.40), (0, 0.34, frame_h - 1.10), m["cloth"]))
    parts += barrel("Kibble", (0, 0.34, 0.34), m["timber_dark"], radius=0.30, height=0.68)

    # Plank tramway running out of the adit to the haul road, with loaded ore carts on it.
    parts += deck("Track", 1.10, 4.30, 0.08, (0, 0.70, 0.04), m["timber_dark"], planks=3)
    for sx in (-1, 1):
        parts.append(box("Rail", (0.09, 4.30, 0.09), (sx * 0.36, 0.70, 0.12), m["metal"]))
    parts += _ore_cart("Cart", (0, 1.30, 0.08), m)
    parts += _ore_cart("Cart2", (0, 2.54, 0.08), m)

    # Winding house on one side, tool store on the other, and the spoil tip beyond them.
    shed_w, shed_d = 1.50, 1.60
    for ox, tint in ((2.10, 0), (-2.20, 1)):
        parts.append(box("ShedPad", (shed_w + 0.14, shed_d + 0.14, 0.16), (ox, 0.60, 0.08), m["stone_dark"]))
        parts.append(box("ShedWall", (shed_w, shed_d, 1.10), (ox, 0.60, 0.71), m["timber_dark" if tint else "stone"]))
        roof = shingled_roof(shed_w, shed_d, 0.72, 1.26, m, overhang=0.14, name="ShedRoof",
                             keys=("shake", "shake_light"))
        for ob in roof:
            ob.location.x += ox
            ob.location.y += 0.60
        parts += roof
        parts.append(box("ShedDoor", (0.46, 0.10, 0.74), (ox, 0.60 + shed_d / 2 - 0.04, 0.53), m["timber"]))

    parts += _rubble("Spoil", (2.30, 2.60, 0.0), m, count=9, ore=True)
    parts += _rubble("Spoil2", (-2.40, 2.40, 0.0), m, count=7, ore=True)
    parts += crate_cluster("Yard", (-1.30, 2.70, 0.0), m, count=3)
    parts += log_pile("Props", (1.30, 2.66, 0.0), m, rows=3, per_row=4, length=0.90)
    parts += barrel("Oil", (2.94, 1.30, 0.19), m["timber"])

    return finish(parts, "Mine")


# ---- local props ------------------------------------------------------------------------------
def _sled(name, center, mats):
    """A stone-boat: the low timber sled dressed blocks are dragged out of a pit on."""
    parts = []
    cx, cy, cz = center
    parts += deck(f"{name}Bed", 0.90, 1.20, 0.10, (cx, cy, cz + 0.14), mats["timber"], planks=4)
    for sx in (-1, 1):
        runner = box(f"{name}Runner", (0.12, 1.30, 0.12), (cx + sx * 0.40, cy, cz + 0.06), mats["timber_dark"])
        parts.append(runner)
    parts.append(box(f"{name}Load", (0.56, 0.60, 0.34), (cx, cy - 0.10, cz + 0.36), mats["stone"]))
    return parts


def _rubble(name, center, mats, count=5, ore=False):
    """A scatter of broken rock — quarry spoil, mine tailings, the debris of extraction."""
    parts = []
    cx, cy, cz = center
    mat = mats["ore"] if ore else mats["stone"]
    for i in range(count):
        a = i * 2.399  # golden-angle scatter, so the heap never looks like a grid
        r = 0.14 + 0.075 * i
        s = 0.24 - 0.013 * i
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=s,
                                              location=(cx + math.cos(a) * r, cy + math.sin(a) * r, cz + s * 0.55))
        ob = bpy.context.active_object
        ob.name = f"{name}Chunk"
        ob.scale = (1.0, 0.85, 0.62)
        ob.data.materials.append(mat if i % 3 else mats["stone_dark"])
        parts.append(ob)
    return parts


def _ore_cart(name, center, mats):
    """A four-wheeled tub cart heaped with ore."""
    parts = []
    cx, cy, cz = center
    body = box(f"{name}Body", (0.62, 0.80, 0.40), (cx, cy, cz + 0.31), mats["timber_dark"])
    bevel(body, 0.02)
    parts.append(body)
    parts.append(box(f"{name}Load", (0.52, 0.70, 0.16), (cx, cy, cz + 0.56), mats["ore"]))
    for sx in (-1, 1):
        for dy in (-0.24, 0.24):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.11, depth=0.07, vertices=8,
                                                location=(cx + sx * 0.33, cy + dy, cz + 0.11))
            wob = bpy.context.active_object
            wob.name = f"{name}Wheel"
            wob.rotation_euler = (0, math.pi / 2, 0)
            wob.data.materials.append(mats["metal"])
            parts.append(wob)
    return parts
