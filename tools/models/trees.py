"""The broadleaves and the second conifer — everything in the wood that is not the pine.

These are instanced across every forest tile alongside `pine.py`, so they are the most
performance-sensitive models in the game. Each stays a few hundred triangles: low-segment cones
and spheres, no bevels, and a trunk that is a single tapered box or cylinder.

A wood of one species reads as wallpaper however good the individual tree is. Five silhouettes,
each with its own greens and its own bark, is what makes a forest look like a forest: the pine's
narrow spire, the spruce's fuller skirt, the birch's pale trunk under a light open crown, the oak's
heavy dome on a thick bole, and the willow's drooping fall. The renderer picks one per tree from a
hash of the tile, so a stand mixes without anything needing to be stored per tile.
"""

import math
import random

import bpy

from common import reset_scene, box, finish
from style import palette


def _trunk(name, height, radius, mat, taper=0.55, verts=6):
    """A tapered trunk. Cheaper and rounder than a box, and the taper reads as a real tree."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=radius, radius2=radius * taper, depth=height, location=(0, 0, height / 2)
    )
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def _blob(name, radius, location, mat, verts=8, squash=1.0):
    """A leaf mass: a low-poly sphere, optionally squashed into a dome or a column."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=verts, ring_count=max(3, verts // 2), radius=radius, location=location)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (1.0, 1.0, squash)
    ob.data.materials.append(mat)
    return ob


def spruce(seed: int = 1):
    """A second conifer: fuller and bluer than the pine, with a skirt that reaches the ground.

    Where the pine is a bare trunk under stacked tiers, this one is foliage all the way down —
    side by side the two read as different trees rather than two sizes of the same one.
    """
    reset_scene()
    random.seed(seed)
    m = palette()
    parts = []
    height = 2.4
    tiers = 6

    parts.append(box("Trunk", (0.10, 0.10, height * 0.35), (0, 0, height * 0.17), m["bark"]))
    for i in range(tiers):
        t = i / (tiers - 1)
        radius = 0.52 * (1 - t * 0.80)
        z = height * (0.12 + t * 0.76)
        depth = 0.46 * (1 - t * 0.40)
        bpy.ops.mesh.primitive_cone_add(
            vertices=7, radius1=radius, radius2=radius * 0.22, depth=depth, location=(0, 0, z)
        )
        ob = bpy.context.active_object
        ob.name = f"Tier{i}"
        ob.rotation_euler = (
            math.radians(random.uniform(-3, 3)),
            math.radians(random.uniform(-3, 3)),
            math.radians(random.uniform(0, 51)),
        )
        ob.data.materials.append(
            m["spruce_dark"] if t < 0.34 else (m["spruce"] if t < 0.72 else m["spruce_light"])
        )
        parts.append(ob)
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=0.11, radius2=0, depth=0.42, location=(0, 0, height * 0.99))
    tip = bpy.context.active_object
    tip.name = "Tip"
    tip.data.materials.append(m["spruce_light"])
    parts.append(tip)
    return finish(parts, "Spruce")


def birch(seed: int = 2):
    """A slender pale-trunked broadleaf: the one tree that reads light against the ground.

    The trunk runs most of the height before the crown starts, which is what makes a birch stand
    look airy — you see through it to whatever is behind.
    """
    reset_scene()
    random.seed(seed)
    m = palette()
    parts = []
    height = 2.3

    parts.append(_trunk("Trunk", height * 0.80, 0.075, m["birch_bark"], taper=0.62))
    # A few dark bark bands, the birch's one unmistakable marking.
    for z in (0.34, 0.62, 0.95):
        parts.append(box("Band", (0.13, 0.13, 0.045), (0, 0, height * z * 0.8), m["timber_dark"]))
    # Two branches lifting into the crown, so it is not a lollipop on a stick.
    for sx, sy in ((1, 0.3), (-0.8, -0.5)):
        br = box("Branch", (0.045, 0.045, 0.5), (sx * 0.13, sy * 0.13, height * 0.72), m["birch_bark"])
        br.rotation_euler = (math.radians(sy * 26), math.radians(-sx * 26), 0)
        parts.append(br)
    # An open crown: three small masses rather than one solid ball.
    for i, (dx, dy, dz, r) in enumerate(
        ((0.0, 0.0, 0.98, 0.40), (0.26, 0.10, 0.86, 0.28), (-0.20, -0.18, 0.88, 0.26))
    ):
        mat = m["birch_leaf"] if i % 2 == 0 else m["birch_leaf_light"]
        parts.append(_blob(f"Crown{i}", r, (dx, dy, height * dz), mat, verts=8, squash=0.82))
    return finish(parts, "Birch")


def oak(seed: int = 3):
    """A heavy broadleaf: a thick short bole under a wide dome. The biggest thing in the wood."""
    reset_scene()
    random.seed(seed)
    m = palette()
    parts = []
    height = 2.1

    parts.append(_trunk("Trunk", height * 0.55, 0.16, m["oak_bark"], taper=0.70, verts=7))
    # Three limbs spreading out of the bole, which is what gives an oak its shoulders.
    for ang in (0.4, 2.5, 4.4):
        br = box("Limb", (0.075, 0.075, 0.62), (math.cos(ang) * 0.16, math.sin(ang) * 0.16, height * 0.60), m["oak_bark"])
        br.rotation_euler = (math.radians(math.sin(ang) * 34), math.radians(-math.cos(ang) * 34), 0)
        parts.append(br)
    # A broad dome, built from overlapping masses so the outline is lumpy rather than spherical.
    parts.append(_blob("Crown", 0.62, (0, 0, height * 0.82), m["oak_leaf"], verts=9, squash=0.72))
    for i, (dx, dy, dz, r) in enumerate(
        ((0.42, 0.14, 0.74, 0.34), (-0.34, 0.30, 0.76, 0.32), (0.06, -0.42, 0.75, 0.32))
    ):
        parts.append(_blob(f"Lobe{i}", r, (dx, dy, height * dz), m["oak_leaf_dark"], verts=7, squash=0.78))
    return finish(parts, "Oak")


def maple(seed: int = 4):
    """A rust-crowned broadleaf. The one warm tree — a stand of these turns a hillside autumnal."""
    reset_scene()
    random.seed(seed)
    m = palette()
    parts = []
    height = 2.2

    parts.append(_trunk("Trunk", height * 0.62, 0.115, m["bark"], taper=0.60, verts=6))
    for ang in (1.0, 3.2, 5.1):
        br = box("Limb", (0.055, 0.055, 0.5), (math.cos(ang) * 0.12, math.sin(ang) * 0.12, height * 0.66), m["bark"])
        br.rotation_euler = (math.radians(math.sin(ang) * 30), math.radians(-math.cos(ang) * 30), 0)
        parts.append(br)
    # A rounder, tighter crown than the oak's, and lifted higher up the trunk.
    parts.append(_blob("Crown", 0.52, (0, 0, height * 0.88), m["maple_leaf"], verts=9, squash=0.88))
    for i, (dx, dy, dz, r) in enumerate(
        ((0.34, 0.18, 0.80, 0.30), (-0.30, 0.24, 0.82, 0.28), (0.02, -0.34, 0.81, 0.28))
    ):
        parts.append(_blob(f"Lobe{i}", r, (dx, dy, height * dz), m["maple_leaf_light"], verts=7, squash=0.86))
    return finish(parts, "Maple")


def willow(seed: int = 5):
    """A drooping riverside tree: a short leaning trunk under a fall of hanging fronds."""
    reset_scene()
    random.seed(seed)
    m = palette()
    parts = []
    height = 2.0

    trunk = _trunk("Trunk", height * 0.52, 0.13, m["bark"], taper=0.66, verts=6)
    trunk.rotation_euler = (0, math.radians(7), 0)
    parts.append(trunk)
    # The canopy is a flattened dome — willows are wider than they are tall.
    parts.append(_blob("Crown", 0.60, (0.03, 0, height * 0.70), m["willow_leaf"], verts=9, squash=0.58))
    # Fronds hanging off the rim. Tapered cones pointing down, which is the whole silhouette.
    for i in range(7):
        ang = i * (6.283 / 7) + random.uniform(-0.2, 0.2)
        r = 0.46 + random.uniform(-0.05, 0.05)
        length = 0.62 + random.uniform(-0.12, 0.16)
        bpy.ops.mesh.primitive_cone_add(
            vertices=5, radius1=0.15, radius2=0.03,
            depth=length, location=(math.cos(ang) * r + 0.03, math.sin(ang) * r, height * 0.70 - length / 2),
        )
        ob = bpy.context.active_object
        ob.name = f"Frond{i}"
        ob.rotation_euler = (0, 0, 0)  # already pointing down: radius1 at the top, radius2 at the tip
        ob.data.materials.append(m["willow_leaf_light"] if i % 2 else m["willow_leaf"])
        parts.append(ob)
    return finish(parts, "Willow")
