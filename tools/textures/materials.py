"""Generate the tiling building-material textures the models sample.

Wall plaster, framing timber, roof shingle, masonry and thatch, each with a matching normal
map. The models are boxy, so they are UV'd by cube projection at a fixed world scale (see
`finish()` in tools/models/common.py) — which means every texture here must tile seamlessly
and must read correctly at roughly one repeat per map tile.

    python3 tools/textures/materials.py     -> public/textures/mat_*.png
"""

import os

import numpy as np
from PIL import Image

from ground import fbm, tint, height_of, normal_from_height

SIZE = 512
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "textures")


def _stripes(size: int, count: int, axis: int, jitter: float, seed: int) -> np.ndarray:
    """Evenly spaced bands with per-band width jitter — planks, courses, shingle rows."""
    rng = np.random.default_rng(seed)
    offs = rng.random(count) * jitter
    coord = np.arange(size) / size * count
    band = np.floor(coord).astype(int) % count
    frac = coord - np.floor(coord)
    # Distance to the nearest band edge, so the seam between boards reads as a dark groove.
    edge = np.minimum(frac, 1 - frac) * 2
    line = np.clip(edge * 6, 0, 1)
    shade = 0.75 + offs[band] * 0.5  # each board its own tone
    row = line * shade
    return np.tile(row, (size, 1)) if axis == 0 else np.tile(row[:, None], (1, size))


def timber(size: int) -> np.ndarray:
    """Sawn oak: long grain along the board plus a few darker growth lines."""
    grain = fbm(51, size, octaves=(2, 64), weights=(0.35, 0.65))
    # Stretch the noise along one axis so it reads as grain rather than as blobs.
    grain = np.roll(grain, 0, axis=0) * 0.5 + np.repeat(grain[:, :1], size, axis=1) * 0.5
    planks = _stripes(size, 4, 1, 0.5, 52)
    mask = np.clip(grain * 0.55 + (1 - planks) * 0.5, 0, 1)
    rgb = tint("#7c5636", "#4a3320", mask)
    knots = np.clip((fbm(53, size, octaves=(8, 16), weights=(0.6, 0.4)) - 0.78) * 6, 0, 1)
    rgb += (np.array([58, 38, 22]) - rgb) * knots[:, :, None] * 0.8
    return rgb


def plaster(size: int) -> np.ndarray:
    """Lime render: near-flat, with a subtle trowel mottle and a little staining low down."""
    mottle = fbm(61, size, octaves=(4, 12, 32), weights=(0.5, 0.3, 0.2))
    rgb = tint("#efe8d6", "#d3cab4", np.clip(mottle * 0.85, 0, 1))
    stain = np.clip((fbm(62, size, octaves=(3, 6), weights=(0.7, 0.3)) - 0.6) * 3, 0, 1)
    rgb += (np.array([190, 180, 158]) - rgb) * stain[:, :, None] * 0.5
    return rgb


def shingle(size: int) -> np.ndarray:
    """Slate roof: overlapping courses, each tile its own tone, with weathered edges."""
    # Staggered like real slating — each course laid to break joint with the one below.
    mask = _brick(size, courses=9, per_course=7, seed=71)
    rgb = tint("#4a5570", "#2c3345", mask)
    weather = fbm(73, size, octaves=(6, 24), weights=(0.6, 0.4))
    rgb += (np.array([104, 112, 132]) - rgb) * np.clip((weather - 0.6) * 2.2, 0, 1)[:, :, None] * 0.55
    return rgb


def shake(size: int) -> np.ndarray:
    """Split-timber roof shakes: the same staggered courses as slate, but riven wood.

    This has to be its own map rather than a tinted slate one — the material tint *multiplies*
    the texture, so warming a blue slate map just yields dark blue. Working buildings need a roof
    that actually reads as brown from across the map.
    """
    mask = _brick(size, courses=9, per_course=6, seed=131)
    rgb = tint("#9a7042", "#5a3f24", mask)
    # Riven wood splits along the grain, so run fine streaks down each shake.
    grain = fbm(132, size, octaves=(48, 96), weights=(0.5, 0.5))
    grain = np.repeat(grain[:, :1], size, axis=1) * 0.5 + grain * 0.5
    rgb *= (0.84 + 0.32 * grain)[:, :, None]
    weather = np.clip((fbm(133, size, octaves=(5, 14), weights=(0.6, 0.4)) - 0.58) * 2.4, 0, 1)
    rgb += (np.array([146, 132, 108]) - rgb) * weather[:, :, None] * 0.45  # silvered patches
    return rgb


def wool(size: int) -> np.ndarray:
    """Coarse woven wool for villagers' tunics and coats.

    Near-white on purpose: the renderer tints every garment per villager to give the population
    its variety, and the tint multiplies, so anything strongly coloured here would drag all six
    outfits toward the same hue. What this map contributes is the *weave* — a visible warp and
    weft plus slubs in the yarn — so a villager reads as cloth rather than as a plastic capsule.
    """
    warp = _stripes(size, 26, 0, 0.35, 141)
    weft = _stripes(size, 26, 1, 0.35, 142)
    # Over-under: alternate which thread sits on top, checkerboard fashion, so the cloth has an
    # actual weave rather than a grid of crossing lines.
    coord = np.arange(size) / size * 26
    cell = np.floor(coord).astype(int)
    over = ((cell[None, :] + cell[:, None]) % 2).astype(float)
    mask = np.clip(warp * over + weft * (1 - over), 0, 1)
    rgb = tint("#f2efe8", "#b9b2a4", mask)
    slub = fbm(143, size, octaves=(12, 40), weights=(0.5, 0.5))  # thick spots in the yarn
    rgb *= (0.90 + 0.20 * slub)[:, :, None]
    return rgb


def path_dirt(size: int) -> np.ndarray:
    """A trodden earth track: compacted soil, loose grit, a few stones pressed into it.

    Deliberately free of any large-scale feature. A path tile is drawn one texture repeat per
    map tile, so anything with a recognisable centre would stamp itself down the whole path and
    turn a road into a row of identical squares — which is exactly how the flat-coloured tiles
    read before. What sells continuity is grain fine enough that the eye cannot find the seam.
    """
    grit = fbm(151, size, octaves=(16, 40, 90), weights=(0.45, 0.35, 0.2))
    rgb = tint("#8a6d4c", "#5a442d", np.clip(grit * 1.05, 0, 1))
    # Wheel-worn hollows: broad, low-contrast damp patches.
    worn = fbm(152, size, octaves=(5, 11), weights=(0.6, 0.4))
    rgb *= (0.88 + 0.24 * worn)[:, :, None]
    # A scatter of small stones trodden into the surface.
    pebbles = np.clip((fbm(153, size, octaves=(30, 60), weights=(0.5, 0.5)) - 0.70) * 5, 0, 1)
    rgb += (np.array([150, 142, 128]) - rgb) * pebbles[:, :, None] * 0.7
    return rgb


def path_stone(size: int) -> np.ndarray:
    """A cobbled road: rounded setts bedded in sand, in the irregular courses a paver lays them.

    Uses the same staggered-course construction as the walls, at a much finer pitch and with the
    joints widened, so it reads as cobbles rather than as brickwork seen from above.
    """
    mask = _brick(size, courses=11, per_course=9, seed=161)
    rgb = tint("#9d9a92", "#605c53", mask)
    # Each sett weathers differently, and the whole road dips and rises.
    grain = fbm(162, size, octaves=(28, 64), weights=(0.5, 0.5))
    rgb *= (0.88 + 0.24 * grain)[:, :, None]
    damp = np.clip((fbm(163, size, octaves=(4, 9), weights=(0.6, 0.4)) - 0.55) * 2.2, 0, 1)
    rgb += (np.array([92, 92, 96]) - rgb) * damp[:, :, None] * 0.35
    return rgb


def path_plank(size: int) -> np.ndarray:
    """Bridge decking: boards running across the span, with gaps you could drop a coin through."""
    boards = _stripes(size, 9, 1, 0.5, 171)
    grain = fbm(172, size, octaves=(40, 90), weights=(0.5, 0.5))
    grain = np.repeat(grain[:1, :], size, axis=0) * 0.6 + grain * 0.4  # grain along the board
    mask = np.clip(boards * 0.7 + grain * 0.3, 0, 1)
    rgb = tint("#8a6238", "#4a3320", mask)
    nails = np.clip((fbm(173, size, octaves=(64, 128), weights=(0.5, 0.5)) - 0.80) * 6, 0, 1)
    rgb += (np.array([70, 70, 74]) - rgb) * nails[:, :, None] * 0.6
    return rgb


def masonry(size: int) -> np.ndarray:
    """Coursed rubble stone for footings, chimneys and walls.

    Crossing two stripe fields gives a perfect rectangular lattice, which at the game's texel
    density read as graph paper on every stone surface. Real coursed rubble staggers: each course
    starts at a different offset and the blocks within it are unequal. `_brick` does that, and the
    result tiles seamlessly because the offsets repeat with the course count.
    """
    mask = _brick(size, courses=6, per_course=5, seed=81)
    rgb = tint("#8f8c83", "#4f4d47", mask)
    grit = fbm(83, size, octaves=(24, 48), weights=(0.5, 0.5))
    rgb += (np.array([118, 115, 108]) - rgb) * np.clip((grit - 0.55) * 2, 0, 1)[:, :, None] * 0.45
    # Broad mottling so whole areas of the wall differ in tone, not just individual stones.
    patch = fbm(84, size, octaves=(3, 7), weights=(0.6, 0.4))
    rgb *= (0.86 + 0.28 * patch)[:, :, None]
    return rgb


def _brick(size: int, courses: int, per_course: int, seed: int) -> np.ndarray:
    """A staggered block field: horizontal courses, each offset and subdivided differently.

    Returns 1 in the face of a block and 0 in the mortar joint, so callers can `tint` between a
    stone colour and a joint colour. Offsets are drawn per course from a seeded RNG, so the
    pattern is irregular but reproducible, and it wraps because every coordinate is taken modulo
    the course/block count.
    """
    rng = np.random.default_rng(seed)
    ys = np.arange(size) / size * courses
    course = np.floor(ys).astype(int) % courses
    yfrac = ys - np.floor(ys)
    # Mortar bed between courses.
    bed = np.clip(np.minimum(yfrac, 1 - yfrac) * 2 * 7, 0, 1)

    offsets = rng.random(courses)
    tone = 0.72 + rng.random((courses, per_course + 2)) * 0.56
    xs = np.arange(size) / size
    out = np.zeros((size, size))
    for c in range(courses):
        rows = course == c
        if not rows.any():
            continue
        u = (xs + offsets[c]) * per_course
        block = np.floor(u).astype(int) % per_course
        ufrac = u - np.floor(u)
        joint = np.clip(np.minimum(ufrac, 1 - ufrac) * 2 * 6, 0, 1)
        row = np.minimum(joint, 1.0) * tone[c][block]
        out[rows] = row
    return np.clip(out * bed[:, None], 0, 1)


def thatch(size: int) -> np.ndarray:
    """Bundled reed: strongly directional straw with a combed lower edge."""
    straw = fbm(91, size, octaves=(64, 128), weights=(0.55, 0.45))
    straw = np.repeat(straw[:, :1], size, axis=1) * 0.6 + straw * 0.4  # comb it in one direction
    courses = _stripes(size, 5, 1, 0.4, 92)
    mask = np.clip(straw * 0.6 + courses * 0.4, 0, 1)
    rgb = tint("#b9a066", "#7a6438", mask)
    return rgb


def foliage(size: int) -> np.ndarray:
    """Needled conifer canopy: fine directional needles over clumped tonal variation."""
    needles = fbm(101, size, octaves=(64, 128), weights=(0.55, 0.45))
    clump = fbm(102, size, octaves=(6, 14), weights=(0.6, 0.4))
    mask = np.clip(needles * 0.6 + clump * 0.4, 0, 1)
    rgb = tint("#7d9a63", "#3f5a34", mask)
    sun = np.clip((clump - 0.66) * 3.0, 0, 1)
    rgb += (np.array([146, 168, 112]) - rgb) * sun[:, :, None] * 0.5
    return rgb


def bark(size: int) -> np.ndarray:
    """Furrowed trunk bark: strong vertical ridges with darker splits."""
    ridges = _stripes(size, 7, 0, 0.55, 111)
    grain = fbm(112, size, octaves=(16, 48), weights=(0.5, 0.5))
    mask = np.clip((1 - ridges) * 0.6 + grain * 0.4, 0, 1)
    rgb = tint("#6b513a", "#3a2a1d", mask)
    return rgb


def ore(size: int) -> np.ndarray:
    """Iron-bearing rock: dark stone shot through with rusty oxide veins."""
    base = fbm(121, size, octaves=(6, 16, 32), weights=(0.5, 0.3, 0.2))
    rgb = tint("#7a6a5e", "#3f3730", np.clip(base * 1.1, 0, 1))
    rust = np.clip((fbm(122, size, octaves=(8, 20), weights=(0.6, 0.4)) - 0.52) * 3.0, 0, 1)
    rgb += (np.array([150, 78, 40]) - rgb) * rust[:, :, None] * 0.85
    specks = np.clip((fbm(123, size, octaves=(48, 96), weights=(0.5, 0.5)) - 0.74) * 4, 0, 1)
    rgb += (np.array([196, 122, 70]) - rgb) * specks[:, :, None] * 0.6
    return rgb


MATERIALS = {
    "foliage": (foliage, 7.0),
    "bark": (bark, 10.0),
    "ore": (ore, 11.0),
    "timber": (timber, 9.0),
    "plaster": (plaster, 4.0),
    "shingle": (shingle, 11.0),
    "shake": (shake, 12.0),
    "wool": (wool, 6.0),
    "path_dirt": (path_dirt, 9.0),
    "path_stone": (path_stone, 13.0),
    "path_plank": (path_plank, 10.0),
    "masonry": (masonry, 12.0),
    "thatch": (thatch, 10.0),
}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, (fn, strength) in MATERIALS.items():
        rgb = fn(SIZE)
        col_path = os.path.join(OUT, f"mat_{name}.png")
        nrm_path = os.path.join(OUT, f"mat_{name}_n.png")
        Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(col_path, optimize=True)
        Image.fromarray(normal_from_height(height_of(rgb), strength).astype(np.uint8)).save(nrm_path, optimize=True)
        kb = (os.path.getsize(col_path) + os.path.getsize(nrm_path)) / 1024
        print(f"mat_{name:9} {kb:6.0f} KB  (colour + normal)")


if __name__ == "__main__":
    main()
