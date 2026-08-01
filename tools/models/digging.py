"""The two extraction sites: the open quarry pit and the mine adit.

Neither of these is really a building — they are holes with equipment around them, and modelling
them as huts would lose the thing that makes them legible from above. The quarry is a terraced
pit cut into the ground across a long 3x6 plot; the mine is a timbered mouth driven into rock,
with a headframe and a spoil heap outside it.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import crate_cluster, deck, lean_to, posts
from style import palette, shingled_roof


def quarry():
    """A stepped stone pit (3 x 6 tiles) with a winch, cut blocks, and a spoil ramp.

    Terraced rather than a plain hole: three benches stepping down toward the middle, which is
    how a real quarry is worked and reads far better than a sunken box at this camera angle.
    """
    reset_scene()
    m = palette()
    parts = []
    W, D = 3.0, 6.0

    # Buildings render at a fixed height above the terrain — nothing can actually sink below the
    # ground plane — so the pit is built *upward* as a quarried rock mass with a cut face and a
    # worked floor inside it, rather than downward as a hole that would just clip.
    parts.append(box("Floor", (W - 0.20, D - 0.20, 0.10), (0, 0, 0.05), m["soil"]))
    # Three sides of standing rock, stepped back in benches; the fourth (+Y) is the open haul road.
    for i, (inset, h) in enumerate(((0.0, 0.86), (0.34, 0.54), (0.68, 0.26))):
        z = 0.10 + h / 2
        for sx in (-1, 1):
            face = box(f"Bench{i}", (0.34, D - 1.0 - inset * 2, h), (sx * (W / 2 - 0.17 - inset), -0.30, z), m["stone"])
            bevel(face, 0.02)
            parts.append(face)
        back = box(f"Head{i}", (W - 0.34 - inset * 2, 0.34, h), (0, -(D / 2 - 0.17 - inset), z), m["stone"])
        bevel(back, 0.02)
        parts.append(back)

    # Cut blocks stacked by the haul road, waiting to be carried out.
    for i, (bx, by) in enumerate(((-0.86, 2.30), (-0.86, 1.84), (-0.48, 2.08))):
        parts.append(box(f"Block{i}", (0.36, 0.40, 0.26), (bx, by, 0.23), m["stone"]))
    parts.append(box("BlockTop", (0.34, 0.38, 0.24), (-0.86, 2.08, 0.48), m["stone_dark"]))

    # A timber gantry with a winch drum over the pit — the vertical element that stops a big
    # rectangular hole from reading as a texture swatch.
    gy = 0.30
    parts += posts("Gantry", [(-0.72, gy - 0.30), (0.72, gy - 0.30), (-0.72, gy + 0.30), (0.72, gy + 0.30)],
                   1.30, 0.12, 0.10, m["timber"])
    parts.append(box("GantryBeam", (1.66, 0.14, 0.14), (0, gy, 1.42), m["timber"]))
    for sx in (-1, 1):  # cross-braces, so the frame reads as a structure not four sticks
        br = box("GantryBrace", (0.62, 0.09, 0.09), (sx * 0.44, gy - 0.30, 1.14), m["timber"])
        br.rotation_euler = (0, sx * math.radians(26), 0)
        parts.append(br)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.14, depth=0.54, vertices=10, location=(0, gy, 1.28))
    drum = bpy.context.active_object
    drum.name = "Winch"
    drum.rotation_euler = (0, math.pi / 2, 0)
    drum.data.materials.append(m["timber_dark"])
    parts.append(drum)
    parts.append(box("Rope", (0.035, 0.035, 0.70), (0, gy, 0.75), m["cloth"]))
    parts.append(box("Slung", (0.30, 0.32, 0.24), (0, gy, 0.28), m["stone"]))  # a block on the hook

    # Spoil heaps and a barrow along the haul road out of the pit.
    parts += _rubble("Spoil", (0.92, 1.30, 0.10), m, count=7)
    parts += _rubble("Spoil2", (-0.30, -1.10, 0.10), m, count=5)

    # A tool lean-to at the pit mouth so the site has somewhere for the workers to be.
    shed = lean_to("Tools", 0.90, 0.80, 0.72, m, rise=0.26, toward=1)
    for ob in shed:
        ob.location.x += 0.92
        ob.location.y += 2.30
    parts += shed
    parts += crate_cluster("Tools", (0.92, 2.30, 0.10), m, count=2)

    return finish(parts, "Quarry")


def mine():
    """A mine mouth: a timbered portal into the rock, a headframe, spoil heap and ore carts.

    Placement forces this against a mountain, so the model leans into that — the portal faces
    -Y (into the hill) and everything the player reads sits on the open +Y side.
    """
    reset_scene()
    m = palette()
    parts = []
    W, D = 2.0, 2.0

    # The rock the adit is driven into. Stepped and broken up rather than one grey slab — a plain
    # box at this size swallows the portal and reads as a shipping container.
    for i, (w, d, h, x, y) in enumerate((
        (0.78, 0.62, 1.26, -0.60, -0.66),
        (0.66, 0.50, 0.94, 0.62, -0.72),
        (1.94, 0.34, 0.62, 0.00, -0.82),
    )):
        chunk = box(f"Face{i}", (w, d, h), (x, y, h / 2), m["stone"] if i % 2 else m["stone_dark"])
        bevel(chunk, 0.03)
        chunk.rotation_euler = (0, 0, math.radians(-7 + i * 6))
        parts.append(chunk)
    parts += _rubble("Face", (-0.78, -0.22, 0.0), m, count=4)
    parts += _rubble("Face2", (0.80, -0.30, 0.0), m, count=3)

    # Timbered portal: two heavy posts, a lintel, and a black opening behind them.
    ph, pw = 0.86, 0.15
    for sx in (-1, 1):
        parts.append(box("Portal", (pw, 0.22, ph), (sx * 0.34, -0.26, ph / 2), m["timber_dark"]))
    parts.append(box("PortalHead", (0.88, 0.24, 0.16), (0, -0.26, ph + 0.08), m["timber_dark"]))
    parts.append(box("Adit", (0.56, 0.30, ph), (0, -0.40, ph / 2), m["window"]))  # the dark hole
    # A brace across the head, the detail that says "propped" rather than "carved".
    parts.append(box("Brace", (0.72, 0.10, 0.08), (0, -0.14, ph - 0.10), m["timber"]))

    # Headframe over the portal — the mine's silhouette from any distance.
    parts += posts("Frame", [(-0.44, 0.10), (0.44, 0.10), (-0.30, -0.20), (0.30, -0.20)], 1.30, 0.10, 0.0, m["timber"])
    parts.append(box("FrameBeam", (1.00, 0.10, 0.10), (0, 0.10, 1.32), m["timber"]))
    parts.append(box("FrameTie", (0.10, 0.34, 0.09), (-0.44, -0.05, 1.24), m["timber"]))
    parts.append(box("FrameTie", (0.10, 0.34, 0.09), (0.44, -0.05, 1.24), m["timber"]))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.14, depth=0.16, vertices=10, location=(0, 0.10, 1.32))
    wheel = bpy.context.active_object
    wheel.name = "Sheave"
    wheel.rotation_euler = (math.pi / 2, 0, 0)
    wheel.data.materials.append(m["metal"])
    parts.append(wheel)

    # Plank track running out of the adit, with a loaded ore cart on it.
    parts += deck("Track", 0.46, 1.10, 0.05, (0, 0.42, 0.025), m["timber_dark"], planks=3)
    parts += _ore_cart("Cart", (0, 0.62, 0.05), m)
    # Spoil heap and loose ore to one side.
    parts += _rubble("Spoil", (0.74, 0.66, 0.0), m, count=6, ore=True)
    parts += crate_cluster("Yard", (-0.72, 0.62, 0.0), m, count=2)

    return finish(parts, "Mine")


# ---- local props ------------------------------------------------------------------------------
def _rubble(name, center, mats, count=5, ore=False):
    """A scatter of broken rock — quarry spoil, mine tailings, the debris of extraction."""
    parts = []
    cx, cy, cz = center
    mat = mats["ore"] if ore else mats["stone"]
    for i in range(count):
        a = i * 2.399  # golden-angle scatter, so the heap never looks like a grid
        r = 0.11 + 0.055 * i
        s = 0.20 - 0.012 * i
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
    body = box(f"{name}Body", (0.40, 0.52, 0.26), (cx, cy, cz + 0.20), mats["timber_dark"])
    bevel(body, 0.02)
    parts.append(body)
    parts.append(box(f"{name}Load", (0.34, 0.46, 0.10), (cx, cy, cz + 0.36), mats["ore"]))
    for sx in (-1, 1):
        for dy in (-0.16, 0.16):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.05, vertices=8,
                                                location=(cx + sx * 0.21, cy + dy, cz + 0.07))
            wob = bpy.context.active_object
            wob.name = f"{name}Wheel"
            wob.rotation_euler = (0, math.pi / 2, 0)
            wob.data.materials.append(mats["metal"])
            parts.append(wob)
    return parts
