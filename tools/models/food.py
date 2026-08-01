"""The three foraging workplaces: gatherer's hut, fishing dock, hunting cabin.

All three are Banished-shaped — small, half-open working buildings that live at the edge of the
resource they exploit, with the work spilling out into the yard around them. None of them is a
sealed box; the yard clutter is what tells you what the job is from above.
"""

from common import reset_scene, box, bevel, finish
from parts import (barrel, crate_cluster, deck, door, drying_rack, lean_to, log_pile, posts,
                   rail_fence, window)
from style import palette, shingled_roof, half_timber

W, D = 2.0, 2.0


def gatherer():
    """Gatherer's hut: a low thatched shelter with baskets and a sorting bench in the yard.

    The lightest building in the village — the job is walking the woods, not standing in a shop,
    so it is barely more than a roof over somewhere to put the baskets.
    """
    reset_scene()
    m = palette()
    parts = []

    hut_w, hut_d = 1.15, 1.05
    base_h, wall_h, roof_h = 0.14, 0.86, 0.72
    ox, oy = -0.38, -0.42  # hut sits back in one corner, yard in front

    pad = box("Pad", (hut_w + 0.12, hut_d + 0.12, base_h), (ox, oy, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)

    walls = half_timber(hut_w, hut_d, wall_h, base_h, m, braces=False, name="Hut")
    for ob in walls:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls

    roof = _thatch_roof(hut_w, hut_d, roof_h, base_h + wall_h, m, rows=5)
    for ob in roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += roof

    front = door("Hut", oy + hut_d / 2, base_h, m, width=0.34, height=0.62, x=ox)
    parts += front

    # Yard: a sorting bench, stacked baskets, a barrel of preserved berries.
    bench_h = 0.34
    parts.append(box("BenchTop", (0.92, 0.36, 0.07), (0.34, 0.34, bench_h), m["timber"]))
    parts += posts("Bench", [(0.34 - 0.40, 0.34), (0.34 + 0.40, 0.34)], bench_h, 0.07, 0.0, m["timber_dark"])
    for i, (bx, by) in enumerate(((0.10, 0.34), (0.40, 0.30), (0.62, 0.38))):
        parts += _basket(f"Basket{i}", (bx, by, bench_h + 0.07), m, radius=0.13 - i * 0.01)
    parts += barrel("Yard", (0.68, -0.42, 0.19), m["timber"])
    parts += _basket("Ground", (0.24, -0.52, 0.0), m, radius=0.17)

    return finish(parts, "Gatherer")


def fishing():
    """Fishing dock: a stilted shack over the waterline with a plank jetty and drying nets.

    The trading post is the other building that reaches over water; this one is deliberately
    lighter and messier — a working platform rather than a merchant's wharf.
    """
    reset_scene()
    m = palette()
    parts = []

    # The jetty runs out along +Y, which is the side the placement rule pushes over water.
    deck_z = 0.34
    parts += posts(
        "Stilt",
        [(x, y) for x in (-0.72, 0.0, 0.72) for y in (0.10, 0.62)],
        deck_z, 0.10, -0.10, m["timber_dark"],
    )
    parts += deck("Jetty", 1.86, 0.92, 0.08, (0, 0.36, deck_z), m["timber"], planks=8)

    # Shack on the landward half, on its own low platform.
    shack_w, shack_d = 1.22, 0.98
    base_h, wall_h, roof_h = 0.16, 0.92, 0.64
    oy = -0.46
    parts.append(box("Platform", (shack_w + 0.14, shack_d + 0.14, base_h), (0, oy, base_h / 2), m["timber_dark"]))
    walls = half_timber(shack_w, shack_d, wall_h, base_h, m, braces=False, name="Shack")
    for ob in walls:
        ob.location.y += oy
    parts += walls
    roof = shingled_roof(shack_w, shack_d, roof_h, base_h + wall_h, m, rows=5, overhang=0.14, name="ShackRoof", keys=("shake", "shake_light"))
    for ob in roof:
        ob.location.y += oy
    parts += roof
    parts += door("Shack", oy + shack_d / 2, base_h, m, width=0.34, height=0.60)
    parts += window("Shack", 0.42, oy - shack_d / 2, base_h + 0.58, m, width=0.24, height=0.22)

    # Nets on an A-frame, a couple of barrels of salted catch, and a moored rowing boat.
    parts += drying_rack("Nets", 0.72, (-0.62, -0.06, 0.0), m, bars=3)
    parts += barrel("Catch", (0.74, -0.08, 0.19), m["timber"])
    parts += barrel("Catch2", (0.74, 0.24, 0.19), m["timber_dark"])
    parts += _rowboat("Boat", (0.86, 0.86, 0.10), m)

    return finish(parts, "Fishing")


def hunting():
    """Hunting cabin: squat log walls, a pelt rack, and a game pole in the yard."""
    reset_scene()
    m = palette()
    parts = []

    cab_w, cab_d = 1.42, 1.20
    base_h, wall_h, roof_h = 0.18, 0.90, 0.80
    ox, oy = -0.24, -0.32

    pad = box("Pad", (cab_w + 0.14, cab_d + 0.14, base_h), (ox, oy, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)

    # Stacked-log walls rather than plaster panels — the one building in the village built from
    # whole timber, because it is the one built out in the woods.
    courses = 6
    ch = wall_h / courses
    for i in range(courses):
        z = base_h + (i + 0.5) * ch
        mat = m["bark"] if i % 2 else m["timber"]
        parts.append(box("LogN", (cab_w, ch * 0.92, ch * 0.92), (ox, oy - cab_d / 2 + ch / 2, z), mat))
        parts.append(box("LogS", (cab_w, ch * 0.92, ch * 0.92), (ox, oy + cab_d / 2 - ch / 2, z), mat))
        parts.append(box("LogW", (ch * 0.92, cab_d, ch * 0.92), (ox - cab_w / 2 + ch / 2, oy, z), mat))
        parts.append(box("LogE", (ch * 0.92, cab_d, ch * 0.92), (ox + cab_w / 2 - ch / 2, oy, z), mat))

    roof = shingled_roof(cab_w, cab_d, roof_h, base_h + wall_h, m, rows=6, overhang=0.16, name="CabRoof", keys=("shake", "shake_light"))
    for ob in roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += roof

    parts += door("Cab", oy + cab_d / 2, base_h, m, width=0.36, height=0.64, x=ox)
    parts += window("Cab", ox + 0.46, oy + cab_d / 2, base_h + 0.62, m, width=0.22, height=0.22)

    # Yard: pelts on a rack, and a game pole for hanging the day's catch.
    parts += drying_rack("Pelts", 0.66, (0.62, -0.52, 0.0), m, bars=3)
    parts += posts("Pole", [(0.40, 0.66), (1.00, 0.66)], 0.86, 0.08, 0.0, m["timber_dark"])
    parts.append(box("PoleBeam", (0.72, 0.07, 0.07), (0.70, 0.66, 0.86), m["timber"]))
    parts += log_pile("Wood", (-0.62, 0.62, 0.0), m, rows=2, per_row=3, length=0.52)

    return finish(parts, "Hunting")


# ---- local props ------------------------------------------------------------------------------
def _basket(name, center, mats, radius=0.13):
    """A woven basket — a squat tapered cylinder. The gatherer's whole visual identity."""
    import bpy

    bpy.ops.mesh.primitive_cone_add(radius1=radius * 0.78, radius2=radius, depth=radius * 1.5, vertices=9, location=(center[0], center[1], center[2] + radius * 0.75))
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mats["thatch"])
    return [ob]


def _rowboat(name, center, mats):
    """A small moored boat: a shallow hull with two thwarts."""
    parts = []
    cx, cy, cz = center
    hull = box(f"{name}Hull", (0.34, 0.86, 0.20), (cx, cy, cz + 0.10), mats["timber_dark"])
    bevel(hull, 0.03)
    parts.append(hull)
    for dy in (-0.18, 0.18):
        parts.append(box(f"{name}Thwart", (0.30, 0.07, 0.04), (cx, cy + dy, cz + 0.19), mats["timber"]))
    return parts


def _thatch_roof(width, depth, height, base_z, mats, rows=5):
    """A thatched gable — same construction as the shingled roof, in reed, with a fatter ridge."""
    import math

    import bpy

    parts = []
    hw = width / 2 + 0.14
    depth_o = depth + 0.28
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
