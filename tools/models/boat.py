"""The merchant's boat: a small single-masted trader that ties up at the wharf.

Sized against the trading post rather than against reality — a hull long enough to read as a
vessel from the play camera but short enough to sit alongside a 3-tile dock without dwarfing it.
The bow points along +Y, the same face every building presents, so the renderer can turn it with
the same yaw convention.

Cargo on deck is the point of the whole thing: crates, barrels and a covered load say "this boat
is carrying goods" from a distance where no amount of hull detail would register.
"""

import math

import bpy

from common import reset_scene, box, bevel, finish
from parts import barrel, crate, crate_cluster, posts
from style import palette

# Hull dimensions. Length runs along Y (the bow direction), beam across X.
LEN = 2.30
BEAM = 0.86
DEPTH = 0.34
DECK_Z = 0.30


def _hull(m) -> list:
    """A planked hull: a slab bottom, flared sides, and a stem and stern that taper to a point."""
    parts = []
    # Bottom slab, slightly narrower than the beam so the sides sit proud of it.
    parts.append(box("HullBottom", (BEAM - 0.14, LEN - 0.30, 0.16), (0, 0, 0.08), m["timber_dark"]))
    # Sides, tilted out a little — a straight-walled box reads as a crate, not a boat.
    for sx in (-1, 1):
        ob = box("HullSide", (0.09, LEN - 0.24, DEPTH), (sx * (BEAM / 2 - 0.045), 0, DEPTH / 2 + 0.06),
                 m["timber"])
        ob.rotation_euler = (0, math.radians(-9 * sx), 0)
        parts.append(ob)
    # Stem and stern: short wedges that close the ends and give the silhouette a point.
    for sy, name in ((1, "Stem"), (-1, "Stern")):
        ob = box(name, (BEAM - 0.20, 0.40, DEPTH + 0.06), (0, sy * (LEN / 2 - 0.22), DEPTH / 2 + 0.06),
                 m["timber"])
        ob.rotation_euler = (math.radians(18 * sy), 0, 0)
        parts.append(ob)
    # Gunwale rail capping the sides, and a rubbing strake along them.
    for sx in (-1, 1):
        parts.append(box("Gunwale", (0.12, LEN - 0.20, 0.06), (sx * (BEAM / 2 - 0.05), 0, DECK_Z + 0.08),
                         m["timber_dark"]))
    # Deck planking, laid across the beam.
    for i, y in enumerate(_spread(-(LEN / 2 - 0.30), LEN / 2 - 0.30, 0.20)):
        parts.append(box(f"Plank{i}", (BEAM - 0.20, 0.17, 0.05), (0, y, DECK_Z), m["timber"]))
    return parts


def _spread(lo: float, hi: float, step: float) -> list:
    """Evenly spaced positions from lo to hi, inclusive of both ends."""
    n = max(1, int(round((hi - lo) / step)))
    return [lo + (hi - lo) * i / n for i in range(n + 1)]


def _rig(m) -> list:
    """Mast, boom, a square canvas sail and its rigging."""
    parts = []
    mast_h = 1.55
    parts.append(box("Mast", (0.09, 0.09, mast_h), (0, 0.18, DECK_Z + mast_h / 2), m["timber_dark"]))
    # Yard across the top, and the boom the foot of the sail is laced to.
    parts.append(box("Yard", (1.16, 0.07, 0.07), (0, 0.18, DECK_Z + mast_h - 0.06), m["timber_dark"]))
    parts.append(box("Boom", (1.02, 0.06, 0.06), (0, 0.18, DECK_Z + 0.52), m["timber_dark"]))
    # The sail itself: a thin slab rather than a plane, so it catches light on both faces and
    # never disappears edge-on. Bellied slightly by splitting it into three panels with a kink.
    for i, (x, tilt) in enumerate(((-0.36, -7), (0.0, 0), (0.36, 7))):
        ob = box(f"Sail{i}", (0.38, 0.04, 0.92), (x, 0.18 + abs(x) * 0.10, DECK_Z + 1.02), m["cloth"])
        ob.rotation_euler = (0, 0, math.radians(tilt))
        parts.append(ob)
    # Forestay and backstay, as thin as the geometry budget allows.
    for sy in (1, -1):
        ob = box("Stay", (0.03, 0.03, 1.30), (0, 0.18 + sy * 0.44, DECK_Z + 0.80), m["timber_dark"])
        ob.rotation_euler = (math.radians(-20 * sy), 0, 0)
        parts.append(ob)
    return parts


def _cargo(m) -> list:
    """What the boat is here for: crates lashed amidships, barrels aft, a canvas over the load."""
    parts = []
    parts += crate_cluster("Cargo", (0.0, -0.42, DECK_Z + 0.17), m, count=3)
    parts += barrel("Barrel", (-0.20, -0.86, DECK_Z + 0.19), m["timber"], radius=0.14, height=0.36)
    parts += barrel("Barrel2", (0.22, -0.92, DECK_Z + 0.19), m["timber_dark"], radius=0.12, height=0.32)
    # Tarpaulin over the forward hold — one pale plane breaks up all that brown.
    tarp = box("Tarp", (BEAM - 0.26, 0.62, 0.10), (0, 0.66, DECK_Z + 0.10), m["cloth"])
    tarp.rotation_euler = (math.radians(6), 0, 0)
    parts.append(tarp)
    # A crate on the foredeck, sitting proud of the tarp.
    parts += crate("Deckload", (0.0, 0.62, DECK_Z + 0.28), m["timber"], size=0.26)
    # Tiller at the stern.
    tiller = box("Tiller", (0.06, 0.42, 0.06), (0, -(LEN / 2 - 0.34), DECK_Z + 0.16), m["timber_dark"])
    tiller.rotation_euler = (math.radians(-12), 0, 0)
    parts.append(tiller)
    # Mooring posts, so it looks like something that ties up.
    parts += posts("Bitt", [(-0.24, LEN / 2 - 0.42), (0.24, LEN / 2 - 0.42)], 0.20, 0.06, DECK_Z, m["timber_dark"])
    return parts


def boat():
    """The whole vessel, ready to export."""
    reset_scene()
    m = palette()
    parts = _hull(m) + _rig(m) + _cargo(m)
    for ob in parts:
        bevel(ob, 0.012)
    return finish(parts, "Boat")


if __name__ == "__main__":
    boat()
