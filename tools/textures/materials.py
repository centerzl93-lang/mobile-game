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
    courses = _stripes(size, 8, 1, 0.55, 71)
    tiles_ = _stripes(size, 6, 0, 0.45, 72)
    mask = np.clip(courses * 0.6 + tiles_ * 0.4, 0, 1)
    rgb = tint("#4a5570", "#2c3345", mask)
    weather = fbm(73, size, octaves=(6, 24), weights=(0.6, 0.4))
    rgb += (np.array([104, 112, 132]) - rgb) * np.clip((weather - 0.6) * 2.2, 0, 1)[:, :, None] * 0.55
    return rgb


def masonry(size: int) -> np.ndarray:
    """Coursed rubble stone for footings and chimneys: blocks with deep mortar joints."""
    courses = _stripes(size, 6, 1, 0.4, 81)
    blocks = _stripes(size, 5, 0, 0.5, 82)
    mask = np.clip(courses * 0.55 + blocks * 0.45, 0, 1)
    rgb = tint("#8f8c83", "#4f4d47", mask)
    grit = fbm(83, size, octaves=(24, 48), weights=(0.5, 0.5))
    rgb += (np.array([118, 115, 108]) - rgb) * np.clip((grit - 0.55) * 2, 0, 1)[:, :, None] * 0.45
    return rgb


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
