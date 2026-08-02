"""Reusable props and structural pieces shared by the building scripts.

`style.py` holds the palette and the two signature wall/roof treatments; this holds the smaller
vocabulary the village is assembled from — decking, fences, log piles, barrels, racks, lean-to
roofs and so on. Keeping them here means a woodcutter's firewood stack and a market stall's
crates are literally the same objects, which is what makes two dozen separate models read as one
place rather than as two dozen unrelated props.

Every helper returns a list of objects to append to the caller's `parts`, and works in the same
frame as the rest of the tooling: 1 unit = 1 map tile, +Z is the front, Z is up (Blender).
"""

import math

import bpy

from common import box


def deck(name, width, depth, thickness, center, mat, planks=7, gap=0.02):
    """A plank deck — dock surfaces, cart beds, market stall counters.

    Drawn as separate boards with a hair of gap between them so the seams catch shadow, which is
    what stops a flat quad from reading as painted-on wood.
    """
    parts = []
    cx, cy, cz = center
    span = width / planks
    for i in range(planks):
        x = cx - width / 2 + span * (i + 0.5)
        parts.append(box(f"{name}Plank", (span - gap, depth, thickness), (x, cy, cz), mat))
    return parts


def posts(name, positions, height, thickness, base_z, mat):
    """Vertical timber posts at each (x, y) — stilts, porch supports, fence uprights."""
    return [
        box(f"{name}Post", (thickness, thickness, height), (x, y, base_z + height / 2), mat)
        for x, y in positions
    ]


def rail_fence(name, width, depth, base_z, mat, height=0.42, gap_front=0.0):
    """A post-and-rail fence around a width x depth plot.

    `gap_front` leaves an opening of that width centred on the +Y side, for a gate.
    """
    parts = []
    t = 0.07
    hw, hd = width / 2, depth / 2
    # Uprights around the perimeter, roughly every 0.7 units.
    for x in _spread(-hw, hw, 0.7):
        for y in (-hd, hd):
            if y > 0 and abs(x) < gap_front / 2:
                continue
            parts.append(box(f"{name}Post", (t, t, height), (x, y, base_z + height / 2), mat))
    for y in _spread(-hd, hd, 0.7):
        for x in (-hw, hw):
            parts.append(box(f"{name}Post", (t, t, height), (x, y, base_z + height / 2), mat))
    # Two horizontal rails per side.
    for frac in (0.42, 0.86):
        z = base_z + height * frac
        for y in (-hd, hd):
            if y > 0 and gap_front > 0:
                # Split the front rail either side of the gate opening.
                for sx in (-1, 1):
                    seg = (width - gap_front) / 2
                    parts.append(box(f"{name}Rail", (seg, t * 0.7, t), (sx * (gap_front + seg) / 2, y, z), mat))
            else:
                parts.append(box(f"{name}Rail", (width, t * 0.7, t), (0, y, z), mat))
        for x in (-hw, hw):
            parts.append(box(f"{name}Rail", (t * 0.7, depth, t), (x, 0, z), mat))
    return parts


def lean_to(name, width, depth, base_z, mats, rise=0.42, toward=1):
    """A single-pitch open roof on posts — the working half of a workshop.

    Banished's woodcutter and blacksmith both read as "a hut with an open working bay stuck onto
    it", and this is that bay. The roof falls toward +Y (or -Y if `toward` is -1).
    """
    parts = []
    hw, hd = width / 2, depth / 2
    high, low = base_z + rise, base_z
    for sx in (-1, 1):
        parts.append(box(f"{name}Post", (0.1, 0.1, high - 0.1), (sx * (hw - 0.06), toward * (hd - 0.06), (high - 0.1) / 2), mats["timber"]))
        parts.append(box(f"{name}Post", (0.1, 0.1, high + rise - 0.1), (sx * (hw - 0.06), -toward * (hd - 0.06), (high + rise - 0.1) / 2), mats["timber"]))
    # The sloping roof itself, in shingle courses like the gable roofs.
    from style import courses

    pitch = math.atan2(rise, depth)
    slope = math.hypot(depth, rise)
    rows = courses(slope)
    for i in range(rows):
        t = (i + 0.5) / rows
        y = -toward * hd + toward * depth * t
        z = high + rise * (1 - t) - 0.02
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, z))
        ob = bpy.context.active_object
        ob.name = f"{name}Course"
        ob.scale = (width + 0.12, slope / rows * 1.3, 0.05)
        ob.rotation_euler = (toward * pitch, 0, 0)
        ob.data.materials.append(mats["slate" if i % 2 == 0 else "slate_light"])
        parts.append(ob)
    return parts


def log_pile(name, center, mats, rows=2, per_row=4, length=0.62, radius=0.075):
    """A stack of cut logs lying on their sides — woodcutter yards, lumber camps, cart loads."""
    parts = []
    cx, cy, cz = center
    for r in range(rows):
        n = per_row - r
        for i in range(n):
            bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=length, vertices=8)
            ob = bpy.context.active_object
            ob.name = f"{name}Log"
            ob.rotation_euler = (0, math.pi / 2, 0)
            ob.location = (cx, cy + (i - (n - 1) / 2) * radius * 2.05, cz + radius + r * radius * 1.8)
            ob.data.materials.append(mats["bark"])
            parts.append(ob)
    return parts


def firewood(name, width, center, mats, height=0.5):
    """A stack of split billets — shorter and squarer than round logs, stacked end-on."""
    parts = []
    cx, cy, cz = center
    cols = max(2, int(width / 0.13))
    rows = max(2, int(height / 0.14))
    for r in range(rows):
        for c in range(cols):
            x = cx - width / 2 + (c + 0.5) * (width / cols)
            parts.append(
                box(f"{name}Billet", (width / cols - 0.02, 0.34, height / rows - 0.02),
                    (x, cy, cz + (r + 0.5) * (height / rows)), mats["timber" if (r + c) % 2 else "bark"])
            )
    return parts


def barrel(name, center, mat, radius=0.16, height=0.38):
    """A coopered barrel — ale, salt fish, stored grain."""
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, vertices=10, location=center)
    ob = bpy.context.active_object
    ob.name = f"{name}Barrel"
    ob.data.materials.append(mat)
    return [ob]


def crate(name, center, mat, size=0.30):
    """A shipping crate. Slightly rotated copies of these do a lot of scene-dressing work."""
    return [box(f"{name}Crate", (size, size, size * 0.82), center, mat)]


def crate_cluster(name, center, mats, count=3):
    """A little heap of crates and a barrel, for dockside and market dressing."""
    parts = []
    cx, cy, cz = center
    spots = [(0.0, 0.0, 0.0), (0.34, 0.10, 0.0), (0.16, -0.26, 0.0), (0.14, 0.02, 0.26)]
    for i in range(min(count, len(spots))):
        dx, dy, dz = spots[i]
        parts += crate(name, (cx + dx, cy + dy, cz + 0.13 + dz), mats["timber" if i % 2 else "timber_dark"])
    return parts


def drying_rack(name, width, center, mats, bars=4):
    """An A-frame rack: hides curing, fish drying, herbs hanging, cloth airing."""
    parts = []
    cx, cy, cz = center
    h = 0.62
    for sy in (-1, 1):
        parts.append(box(f"{name}Leg", (0.06, 0.06, h), (cx - width / 2, cy + sy * 0.16, cz + h / 2), mats["timber"]))
        parts.append(box(f"{name}Leg", (0.06, 0.06, h), (cx + width / 2, cy + sy * 0.16, cz + h / 2), mats["timber"]))
    parts.append(box(f"{name}Beam", (width + 0.12, 0.06, 0.06), (cx, cy, cz + h), mats["timber"]))
    for i in range(bars):
        x = cx - width / 2 + (i + 0.5) * (width / bars)
        parts.append(box(f"{name}Hang", (width / bars * 0.55, 0.03, 0.34), (x, cy, cz + h - 0.19), mats["cloth"]))
    return parts


def chimney(name, x, y, base_z, height, mats, width=0.30):
    """A stone flue with a flared cap, breaking the roofline."""
    parts = [box(f"{name}Stack", (width, width, height), (x, y, base_z + height / 2), mats["stone_dark"])]
    parts.append(box(f"{name}Cap", (width * 1.28, width * 1.28, 0.09), (x, y, base_z + height), mats["stone"]))
    return parts


def stone_walls(name, width, depth, height, base_z, mats, quoins=True):
    """A masonry shell with corner quoins — the alternative to `half_timber` for grander work."""
    parts = [box(f"{name}Wall", (width, depth, height), (0, 0, base_z + height / 2), mats["stone"])]
    if quoins:
        # Alternating corner blocks, the detail that says "dressed stone" at a glance.
        for sx in (-1, 1):
            for sy in (-1, 1):
                for i, z in enumerate(_spread(base_z + 0.14, base_z + height - 0.14, 0.26)):
                    w = 0.20 if i % 2 else 0.13
                    parts.append(
                        box(f"{name}Quoin", (w, w, 0.16),
                            (sx * (width / 2 - w / 2 + 0.015), sy * (depth / 2 - w / 2 + 0.015), z),
                            mats["stone_dark"])
                    )
    return parts


def door(name, y_face, base_z, mats, width=0.44, height=0.74, x=0.0, depth=0.10):
    """A plank door with a timber lintel, set into the wall at +Y (pass a negative face for -Y)."""
    inset = 0.04 * (1 if y_face > 0 else -1)
    parts = [box(f"{name}Door", (width, depth, height), (x, y_face - inset, base_z + height / 2), mats["timber_dark"])]
    parts.append(box(f"{name}Lintel", (width * 1.34, depth * 1.2, 0.10), (x, y_face - inset, base_z + height + 0.05), mats["timber"]))
    return parts


def window(name, x, y_face, z, mats, width=0.30, height=0.28, axis="y"):
    """A shuttered window: dark glass panel with a timber surround standing slightly proud.

    Set in the wall at +Y by default (pass a negative face for -Y). `axis="x"` sets it into an
    east/west wall instead, with `x` then reading as the position *along* that wall and `y_face`
    as the wall's own X — which is what the long-sided buildings (the school hall, the hospital's
    main range) need to get daylight down their flanks.
    """
    inset = 0.04 * (1 if y_face > 0 else -1)
    if axis == "x":
        return [
            box(f"{name}Glass", (0.08, width, height), (y_face - inset, x, z), mats["window"]),
            box(f"{name}Frame", (0.06, width * 1.26, height * 1.28), (y_face - inset * 0.5, x, z), mats["timber"]),
        ]
    return [
        box(f"{name}Glass", (width, 0.08, height), (x, y_face - inset, z), mats["window"]),
        box(f"{name}Frame", (width * 1.26, 0.06, height * 1.28), (x, y_face - inset * 0.5, z), mats["timber"]),
    ]


def sign_board(name, x, y, z, mats, width=0.34):
    """A shop sign hanging from a bracket — taverns, markets, the trading post."""
    return [
        box(f"{name}Arm", (0.05, 0.30, 0.05), (x, y - 0.15, z + 0.20), mats["timber"]),
        box(f"{name}Board", (width, 0.05, 0.24), (x, y - 0.28, z), mats["timber_dark"]),
    ]


def _spread(lo, hi, step):
    """Positions from lo to hi inclusive, spaced as evenly as possible at about `step`."""
    n = max(1, int(round((hi - lo) / step)))
    return [lo + (hi - lo) * i / n for i in range(n + 1)]
