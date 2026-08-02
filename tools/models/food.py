"""The three foraging workplaces: gatherer's hut, fishing dock, hunting cabin.

All three are Banished-shaped — small, half-open working buildings that live at the edge of the
resource they exploit, with the work spilling out into the yard around them. None of them is a
sealed box; the yard clutter is what tells you what the job is from above.

Footprints: gatherer and hunting are 3x3, the fishing dock 3x5. Each is laid out for its own
plot rather than scaled from the 2x2 versions these replace — a bigger gatherer's hut gets a
longer sorting bench and a second row of baskets, not the same bench rendered at 150%.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import (barrel, crate_cluster, deck, door, drying_rack, lean_to, log_pile, posts,
                   rail_fence, window)
from style import THATCH_PITCH, courses, palette, shingled_roof, half_timber


def gatherer():
    """Gatherer's hut (3x3): a thatched shelter in one corner, the sorting yard filling the rest.

    The lightest building in the village — the job is walking the woods, not standing in a shop,
    so it is barely more than a roof over somewhere to put the baskets. At 3x3 the hut gains a
    lean-to sorting bay along one side and the yard gains a second bench and a handcart, so the
    plot reads as a working clearing rather than as one hut with a lot of grass around it.
    """
    reset_scene()
    m = palette()
    parts = []

    hut_w, hut_d = 1.62, 1.40
    base_h, wall_h, roof_h = 0.16, 1.20, 1.10
    ox, oy = -0.62, -0.64  # hut sits back in one corner, yard wrapping round it

    pad = box("Pad", (hut_w + 0.14, hut_d + 0.14, base_h), (ox, oy, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)

    walls = half_timber(hut_w, hut_d, wall_h, base_h, m, braces=False, name="Hut")
    roof = _thatch_roof(hut_w, hut_d, roof_h, base_h + wall_h, m)
    for ob in walls + roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += walls + roof

    parts += door("Hut", oy + hut_d / 2, base_h, m, width=0.38, height=0.68, x=ox)
    parts += window("Hut", ox + 0.52, oy + hut_d / 2, base_h + 0.74, m, width=0.26, height=0.24)

    # A lean-to sorting bay off the hut's east wall, open to the yard.
    bay = lean_to("Sort", 0.94, 1.30, base_h + 0.80, m, rise=0.30, toward=1)
    for ob in bay:
        ob.location.x += 0.78
        ob.location.y += oy
    parts += bay
    parts.append(box("BayFloor", (0.96, 1.32, base_h), (0.78, oy, base_h / 2), m["soil"]))

    # Yard: the sorting bench down the east side, baskets on it and stacked on the ground.
    bench_h = 0.36
    parts.append(box("BenchTop", (0.44, 1.24, 0.08), (1.14, 0.76, bench_h), m["timber"]))
    parts += posts("Bench", [(1.14, 0.28), (1.14, 1.24)], bench_h, 0.08, 0.0, m["timber_dark"])
    for i, by in enumerate((0.34, 0.72, 1.10)):
        parts += _basket(f"Basket{i}", (1.14, by, bench_h + 0.08), m, radius=0.15 - i * 0.015)
    parts += _basket("Ground", (-1.14, 0.56, 0.0), m, radius=0.20)
    parts += _basket("Ground2", (-1.20, 1.10, 0.0), m, radius=0.16)
    parts += barrel("Yard", (0.42, 1.20, 0.19), m["timber"])
    parts += barrel("Yard2", (0.72, 1.12, 0.19), m["timber_dark"])

    # A handcart at the yard mouth — what the baskets go out to the barns on.
    parts += _handcart("Cart", (-0.34, 0.92, 0.0), m)

    return finish(parts, "Gatherer")


def fishing():
    """Fishing dock (3x5): a stilted shack at the landward end, a long jetty running out from it.

    The trading post is the other building that reaches over water; this one is deliberately
    lighter and messier — a working platform rather than a merchant's wharf. The 3x5 plot is what
    finally gives the jetty room to be a jetty: it runs two thirds the length of the plot, with
    the boat moored off the end of it rather than tucked alongside.
    """
    reset_scene()
    m = palette()
    parts = []

    # Shack on the landward half, on its own low platform, at the -Y end of the plot.
    shack_w, shack_d = 1.86, 1.54
    base_h, wall_h, roof_h = 0.18, 1.06, 1.02
    oy = -1.62
    parts.append(box("Platform", (shack_w + 0.16, shack_d + 0.16, base_h), (0, oy, base_h / 2), m["timber_dark"]))
    walls = half_timber(shack_w, shack_d, wall_h, base_h, m, braces=False, name="Shack")
    roof = shingled_roof(shack_w, shack_d, roof_h, base_h + wall_h, m, overhang=0.16,
                         name="ShackRoof", keys=("shake", "shake_light"))
    for ob in walls + roof:
        ob.location.y += oy
    parts += walls + roof
    parts += door("Shack", oy + shack_d / 2, base_h, m, width=0.38, height=0.66)
    for sx in (-1, 1):
        parts += window("Shack", sx * 0.62, oy + shack_d / 2, base_h + 0.74, m, width=0.26, height=0.24)
    parts += window("Side", 0.0, oy - shack_d / 2, base_h + 0.74, m, width=0.30, height=0.26)

    # The jetty: decking on stilts running out along +Y from the shack's threshold.
    deck_z = 0.34
    parts += posts(
        "Stilt",
        [(x, y) for x in (-1.00, 0.0, 1.00) for y in (-0.55, 0.35, 1.25, 2.05)],
        deck_z, 0.11, -0.12, m["timber_dark"],
    )
    parts += deck("Jetty", 2.60, 3.30, 0.09, (0, 0.72, deck_z), m["timber"], planks=11)
    # Mooring bollards down the seaward edge, and a rail along one side of the walk.
    for by in (0.30, 1.30, 2.20):
        parts.append(box("Bollard", (0.16, 0.16, 0.30), (1.16, by, deck_z + 0.19), m["timber_dark"]))
    parts += posts("Rail", [(-1.22, y) for y in (0.10, 0.90, 1.70, 2.34)], 0.52, 0.08, deck_z, m["timber"])
    parts.append(box("RailBar", (0.08, 2.36, 0.08), (-1.22, 1.22, deck_z + 0.48), m["timber"]))

    # Nets on A-frames, barrels of salted catch, creels, and a moored rowing boat off the end.
    parts += drying_rack("Nets", 0.86, (-0.96, -0.34, 0.0), m, bars=4)
    parts += drying_rack("Nets2", 0.70, (0.98, -0.44, 0.0), m, bars=3)
    parts += barrel("Catch", (0.44, -0.42, 0.19), m["timber"])
    parts += barrel("Catch2", (0.10, -0.50, 0.19), m["timber_dark"])
    for i, (cx, cy) in enumerate(((-0.60, 1.10), (-0.34, 1.46), (0.52, 1.90))):
        parts += _creel(f"Creel{i}", (cx, cy, deck_z + 0.09), m)
    parts += _rowboat("Boat", (1.14, 1.72, 0.10), m)

    return finish(parts, "Fishing")


def hunting():
    """Hunting cabin (3x3): squat log walls, a pelt rack, and a game pole in the yard.

    The one building in the village built from whole timber, because it is the one built out in
    the woods. At 3x3 the cabin gets a covered porch along its front — somewhere to butcher out
    of the rain — and the yard gets the full pelt-drying line rather than a single rack.
    """
    reset_scene()
    m = palette()
    parts = []

    cab_w, cab_d = 1.90, 1.56
    base_h, wall_h, roof_h = 0.18, 1.16, 1.04
    ox, oy = -0.42, -0.66

    pad = box("Pad", (cab_w + 0.16, cab_d + 0.16, base_h), (ox, oy, base_h / 2), m["stone_dark"])
    bevel(pad, 0.02)
    parts.append(pad)

    # Stacked-log walls rather than plaster panels. The courses are a fixed physical size, so a
    # longer wall gets more logs — not the same six logs made fatter.
    logs = max(4, round(wall_h / 0.19))
    ch = wall_h / logs
    for i in range(logs):
        z = base_h + (i + 0.5) * ch
        mat = m["bark"] if i % 2 else m["timber"]
        parts.append(box("LogN", (cab_w, ch * 0.92, ch * 0.92), (ox, oy - cab_d / 2 + ch / 2, z), mat))
        parts.append(box("LogS", (cab_w, ch * 0.92, ch * 0.92), (ox, oy + cab_d / 2 - ch / 2, z), mat))
        parts.append(box("LogW", (ch * 0.92, cab_d, ch * 0.92), (ox - cab_w / 2 + ch / 2, oy, z), mat))
        parts.append(box("LogE", (ch * 0.92, cab_d, ch * 0.92), (ox + cab_w / 2 - ch / 2, oy, z), mat))

    roof = shingled_roof(cab_w, cab_d, roof_h, base_h + wall_h, m, overhang=0.18,
                         name="CabRoof", keys=("shake", "shake_light"))
    for ob in roof:
        ob.location.x += ox
        ob.location.y += oy
    parts += roof

    parts += door("Cab", oy + cab_d / 2, base_h, m, width=0.40, height=0.70, x=ox)
    parts += window("Cab", ox + 0.62, oy + cab_d / 2, base_h + 0.76, m, width=0.24, height=0.24)
    parts += window("CabW", ox - 0.62, oy + cab_d / 2, base_h + 0.76, m, width=0.24, height=0.24)

    # Covered porch along the cabin front, on log posts.
    porch_y = oy + cab_d / 2 + 0.34
    parts += posts("Porch", [(ox - 0.74, porch_y), (ox + 0.74, porch_y)], 1.02, 0.11, base_h, m["timber"])
    porch = box("PorchRoof", (cab_w + 0.20, 0.76, 0.08), (ox, oy + cab_d / 2 + 0.24, base_h + 1.14), m["shake"])
    porch.rotation_euler = (math.radians(-14), 0, 0)
    parts.append(porch)

    # Yard: pelts on the drying line, a game pole, a butchering block, seasoned firewood.
    parts += drying_rack("Pelts", 0.92, (0.86, -1.06, 0.0), m, bars=4)
    parts += drying_rack("Pelts2", 0.72, (1.02, 0.06, 0.0), m, bars=3)
    parts += posts("Pole", [(0.30, 1.02), (1.20, 1.02)], 1.08, 0.10, 0.0, m["timber_dark"])
    parts.append(box("PoleBeam", (1.02, 0.09, 0.09), (0.75, 1.02, 1.08), m["timber"]))
    parts.append(box("Hung", (0.20, 0.20, 0.52), (0.62, 1.02, 0.78), m["timber_dark"]))
    parts += log_pile("Wood", (-1.02, 1.02, 0.0), m, rows=3, per_row=4, length=0.66)

    return finish(parts, "Hunting")


# ---- local props ------------------------------------------------------------------------------
def _basket(name, center, mats, radius=0.13):
    """A woven basket — a squat tapered cylinder. The gatherer's whole visual identity."""
    bpy.ops.mesh.primitive_cone_add(radius1=radius * 0.78, radius2=radius, depth=radius * 1.5, vertices=9, location=(center[0], center[1], center[2] + radius * 0.75))
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mats["thatch"])
    return [ob]


def _creel(name, center, mats):
    """A lobster creel — a low hooped basket, the prop that says 'fishing' on bare decking."""
    parts = []
    cx, cy, cz = center
    bpy.ops.mesh.primitive_cylinder_add(radius=0.19, depth=0.20, vertices=8, location=(cx, cy, cz + 0.10))
    ob = bpy.context.active_object
    ob.name = f"{name}Body"
    ob.rotation_euler = (0, math.pi / 2, 0)
    ob.data.materials.append(mats["thatch"])
    parts.append(ob)
    parts.append(box(f"{name}Band", (0.22, 0.05, 0.22), (cx, cy, cz + 0.10), mats["timber_dark"]))
    return parts


def _handcart(name, center, mats):
    """A two-wheeled handcart with a plank bed and shafts down to the ground."""
    parts = []
    cx, cy, cz = center
    parts += deck(f"{name}Bed", 0.66, 0.44, 0.06, (cx, cy, cz + 0.36), mats["timber"], planks=4)
    for sx in (-1, 1):
        parts.append(box(f"{name}Side", (0.04, 0.44, 0.16), (cx + sx * 0.33, cy, cz + 0.46), mats["timber_dark"]))
        bpy.ops.mesh.primitive_cylinder_add(radius=0.17, depth=0.05, vertices=10,
                                            location=(cx + sx * 0.36, cy, cz + 0.17))
        wob = bpy.context.active_object
        wob.name = f"{name}Wheel"
        wob.rotation_euler = (0, math.pi / 2, 0)
        wob.data.materials.append(mats["timber_dark"])
        parts.append(wob)
    for sx in (-1, 1):
        shaft = box(f"{name}Shaft", (0.05, 0.46, 0.05), (cx + sx * 0.24, cy + 0.30, cz + 0.24), mats["timber"])
        shaft.rotation_euler = (math.radians(26), 0, 0)
        parts.append(shaft)
    return parts


def _rowboat(name, center, mats):
    """A small moored boat: a shallow hull with two thwarts."""
    parts = []
    cx, cy, cz = center
    hull = box(f"{name}Hull", (0.42, 1.06, 0.24), (cx, cy, cz + 0.12), mats["timber_dark"])
    bevel(hull, 0.03)
    parts.append(hull)
    for dy in (-0.22, 0.22):
        parts.append(box(f"{name}Thwart", (0.36, 0.08, 0.05), (cx, cy + dy, cz + 0.23), mats["timber"]))
    return parts


def _thatch_roof(width, depth, height, base_z, mats, rows=None):
    """A thatched gable — same construction as the shingled roof, in reed, with a fatter ridge."""
    parts = []
    hw = width / 2 + 0.14
    depth_o = depth + 0.28
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
