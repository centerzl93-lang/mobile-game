"""The shared visual language for every model in this folder.

Extracted from the project's art reference: stylised medieval vernacular — cream plaster panels
in a warm timber frame over a grey stone footing, steep slate-blue shingled roofs with flared
eaves, everything softly bevelled so edges catch the light. Detail lives in the silhouette and
in big readable bands of colour, because the game draws these small on a phone.

Import the palette from here rather than hand-typing colours in each model, so a change to the
scheme is one edit and a rebuild.
"""

import math

import bpy

from common import material


def srgb(hex_color: str) -> tuple[float, float, float]:
    """Convert a sRGB hex string to the linear RGB that Blender's colour inputs expect."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2])


# ---- Palette -------------------------------------------------------------------------------
PLASTER = "#EDE6D4"      # wall infill panels
TIMBER = "#7A5535"       # exposed frame, beams, fences
TIMBER_DARK = "#5E3F27"  # doors, deeper structural members
STONE = "#8E8D86"        # footings, chimneys, cobbles
STONE_DARK = "#6E6D67"
SLATE = "#3F4A63"        # roof shingles
SLATE_LIGHT = "#4E5B78"  # alternating shingle rows, for banding
WINDOW = "#2A2B33"
THATCH = "#B99A5E"
FOLIAGE = "#4C6B3C"
FOLIAGE_DARK = "#3B5430"
FOLIAGE_LIGHT = "#5F7F46"
BARK = "#5A4433"

# Roof pitch in degrees. Steep is the single most recognisable trait of the reference.
PITCH_DEG = 54.0


def palette() -> dict:
    """Build every shared material once, keyed by name."""
    return {
        "plaster": material("Plaster", srgb(PLASTER)),
        "timber": material("Timber", srgb(TIMBER)),
        "timber_dark": material("TimberDark", srgb(TIMBER_DARK)),
        "stone": material("Stone", srgb(STONE)),
        "stone_dark": material("StoneDark", srgb(STONE_DARK)),
        "slate": material("Slate", srgb(SLATE)),
        "slate_light": material("SlateLight", srgb(SLATE_LIGHT)),
        "window": material("Window", srgb(WINDOW), roughness=0.35),
        "thatch": material("Thatch", srgb(THATCH)),
        "foliage": material("Foliage", srgb(FOLIAGE)),
        "foliage_dark": material("FoliageDark", srgb(FOLIAGE_DARK)),
        "foliage_light": material("FoliageLight", srgb(FOLIAGE_LIGHT)),
        "bark": material("Bark", srgb(BARK)),
    }


def shingled_roof(width, depth, height, base_z, mats, rows=7, overhang=0.10, name="Roof"):
    """A steep gable roof built from stacked shingle courses.

    Each course is a slab spanning the ridge direction, tilted to the roof pitch and lapped over
    the one below, so the roof reads as rows of shingles in silhouette instead of a bare plane —
    the detail that most sells the reference style. The ridge runs along Y (the building's depth).
    """
    parts = []
    hw = width / 2 + overhang
    depth_o = depth + overhang * 2
    pitch = math.atan2(height, hw)
    slope_len = math.hypot(hw, height)
    for side in (-1, 1):
        for i in range(rows):
            t = (i + 0.5) / rows
            # Centre of this course, on the line from eave to ridge.
            cx = side * hw * (1 - t)
            cz = base_z + height * t
            course = slope_len / rows * 1.34  # lap each course generously over the one below
            thick = 0.055
            bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, 0, cz))
            ob = bpy.context.active_object
            ob.name = f"{name}Course"
            ob.scale = (course, depth_o, thick)
            ob.rotation_euler = (0, side * pitch, 0)
            # Nudge each course out along the roof normal so the laps catch a shadow line.
            nx, nz = math.sin(side * pitch), math.cos(side * pitch)
            ob.location = (cx + nx * thick * 0.5, 0, cz + nz * thick * 0.5)
            ob.data.materials.append(mats["slate" if i % 2 == 0 else "slate_light"])
            parts.append(ob)
    # Ridge cap along the top.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, base_z + height))
    cap = bpy.context.active_object
    cap.name = f"{name}Ridge"
    cap.scale = (0.16, depth_o, 0.10)
    cap.data.materials.append(mats["slate"])
    parts.append(cap)
    return parts


def half_timber(width, depth, height, base_z, mats, braces=True, name="Wall"):
    """A plaster box laced with an exposed timber frame: sill, corner posts, mid-rail, braces."""
    from common import box

    parts = []
    panel = box(f"{name}Panel", (width - 0.14, depth - 0.14, height), (0, 0, base_z + height / 2), mats["plaster"])
    parts.append(panel)
    t = 0.12
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(
                box(
                    f"{name}Post",
                    (t, t, height),
                    (sx * (width / 2 - t / 2), sy * (depth / 2 - t / 2), base_z + height / 2),
                    mats["timber"],
                )
            )
    for z in (base_z + height * 0.55, base_z + height - t / 2):
        parts.append(box(f"{name}Rail", (width, depth, t * 0.8), (0, 0, z), mats["timber"]))
    if braces:
        # Diagonal braces on the two long faces — the signature half-timber read.
        for sy in (-1, 1):
            for sx in (-1, 1):
                bpy.ops.mesh.primitive_cube_add(size=1)
                br = bpy.context.active_object
                br.name = f"{name}Brace"
                br.scale = (height * 0.42, t * 0.7, t * 0.7)
                br.location = (sx * width * 0.26, sy * (depth / 2 - t * 0.35), base_z + height * 0.26)
                br.rotation_euler = (0, sx * math.radians(52), 0)
                br.data.materials.append(mats["timber"])
                parts.append(br)
    return parts
