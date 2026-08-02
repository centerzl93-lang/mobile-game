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
SHAKE = "#B99A72"        # split-timber roofing on working buildings (tints the shake map)
SHAKE_LIGHT = "#D4B78C"
CLOTH = "#CFC3AA"        # awnings, drying racks, sails
METAL = "#4A4B50"        # wrought iron
SOIL = "#6B4F35"         # turned earth: quarry floors, spoil heaps, graves

# Roof pitch in degrees. Steep is the single most recognisable trait of the reference.
PITCH_DEG = 54.0

# How far apart shingle courses sit, in Blender units (= map tiles). A course is a physical
# object — a split shake is the same size on a cottage and on a barn — so roofs count their rows
# from their own slope length rather than taking a fixed number. Hard-coding `rows` was fine
# while every building was 2x2; the moment a workshop grew to 3x3 the same eight courses spread
# out into eight *bigger* shakes, and the roof read as a doll's-house version of itself next to
# its neighbours. `COURSE_PITCH` is what keeps that from happening as footprints change.
COURSE_PITCH = 0.21
THATCH_PITCH = 0.19  # reed is laid in fatter courses than split timber


def courses(slope_len: float, pitch: float = COURSE_PITCH) -> int:
    """How many shingle rows a roof of this slope length needs to keep its texel density."""
    return max(3, round(slope_len / pitch))


def palette() -> dict:
    """Build every shared material once, keyed by name."""
    return {
        # Roughness carries a lot of the material read: damp slate is glossier than dry
        # plaster, and planed timber sits between the two.
        "plaster": material("Plaster", srgb(PLASTER), roughness=0.95, tex="plaster"),
        "timber": material("Timber", srgb(TIMBER), roughness=0.72, tex="timber"),
        "timber_dark": material("TimberDark", srgb(TIMBER_DARK), roughness=0.70, tex="timber"),
        "stone": material("Stone", srgb(STONE), roughness=0.88, tex="masonry"),
        "stone_dark": material("StoneDark", srgb(STONE_DARK), roughness=0.86, tex="masonry"),
        "slate": material("Slate", srgb(SLATE), roughness=0.52, tex="shingle"),
        "slate_light": material("SlateLight", srgb(SLATE_LIGHT), roughness=0.48, tex="shingle"),
        "window": material("Window", srgb(WINDOW), roughness=0.35),
        "thatch": material("Thatch", srgb(THATCH), roughness=0.95, tex="thatch"),
        "foliage": material("Foliage", srgb(FOLIAGE), roughness=0.80, tex="foliage"),
        "foliage_dark": material("FoliageDark", srgb(FOLIAGE_DARK), roughness=0.82, tex="foliage"),
        "foliage_light": material("FoliageLight", srgb(FOLIAGE_LIGHT), roughness=0.78, tex="foliage"),
        "bark": material("Bark", srgb(BARK), roughness=0.90, tex="bark"),
        # Wooden shakes: the same shingle map tinted warm. Working buildings — barns, sheds,
        # cabins, the trades — are roofed in split timber; slate is reserved for civic work. Two
        # roofing families is what keeps two dozen buildings from reading as one repeated cottage.
        "shake": material("Shake", srgb(SHAKE), roughness=0.86, tex="shake"),
        "shake_light": material("ShakeLight", srgb(SHAKE_LIGHT), roughness=0.84, tex="shake"),
        "ore": material("Ore", srgb("#9C6A4A"), roughness=0.70, tex="ore"),
        # Undyed linen/canvas: awnings, drying laundry, market stall covers. Left untextured —
        # it reads as cloth by being the one smooth, pale surface among all the grain and grit.
        "cloth": material("Cloth", srgb(CLOTH), roughness=0.88),
        # Wrought iron: anvils, hinges, tools, mine rails. The only material with any metalness.
        "metal": material("Metal", srgb(METAL), roughness=0.42),
        "soil": material("Soil", srgb(SOIL), roughness=1.0, tex="masonry"),
    }


def shingled_roof(width, depth, height, base_z, mats, rows=None, overhang=0.10, name="Roof",
                  keys=("slate", "slate_light")):
    """A steep gable roof built from stacked shingle courses.

    Each course is a slab spanning the ridge direction, tilted to the roof pitch and lapped over
    the one below, so the roof reads as rows of shingles in silhouette instead of a bare plane —
    the detail that most sells the reference style. The ridge runs along Y (the building's depth).

    `rows` defaults to however many courses this slope needs at `COURSE_PITCH`, so a wider roof
    gets *more* shingles rather than bigger ones. Pass a number only to override that.
    """
    parts = []
    hw = width / 2 + overhang
    depth_o = depth + overhang * 2
    pitch = math.atan2(height, hw)
    slope_len = math.hypot(hw, height)
    if rows is None:
        rows = courses(slope_len)
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
            ob.data.materials.append(mats[keys[0] if i % 2 == 0 else keys[1]])
            parts.append(ob)
    # Ridge cap along the top.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, base_z + height))
    cap = bpy.context.active_object
    cap.name = f"{name}Ridge"
    cap.scale = (0.16, depth_o, 0.10)
    cap.data.materials.append(mats[keys[0]])
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
