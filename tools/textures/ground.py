"""Generate the tiling ground atlas the terrain samples.

One 2x2 atlas holds the four land surfaces — grass, forest floor, rock, dirt — and a matching
normal map gives them relief under the sun. The renderer picks a cell per tile and jitters the
UVs so a field of identical tiles does not read as wallpaper (see syncTerrain in renderer3d.ts).

Each cell is generated **seamlessly**: all noise is built on a torus (wrapped offsets) so a cell
tiles against itself without a visible seam, which matters because one cell covers one map tile
and there are thousands of them side by side.

    python3 tools/textures/ground.py        -> public/textures/ground.png, ground_n.png
"""

import os

import numpy as np
from PIL import Image

CELL = 256                     # pixels per atlas cell
ATLAS = CELL * 2               # 2x2 atlas
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "textures")

# Cell order must match TERRAIN_CELL in renderer3d.ts.
#   (0,0) grass   (1,0) forest floor
#   (0,1) rock    (1,1) dirt


def _smooth_noise(rng: np.random.Generator, size: int, freq: int) -> np.ndarray:
    """Value noise that wraps, built by upsampling a small periodic lattice with cosine easing."""
    lattice = rng.random((freq, freq))
    # Bilinear-ish sample with wrap, eased so cells blend instead of showing the lattice grid.
    ys = np.linspace(0, freq, size, endpoint=False)
    xs = np.linspace(0, freq, size, endpoint=False)
    y0 = np.floor(ys).astype(int) % freq
    x0 = np.floor(xs).astype(int) % freq
    y1 = (y0 + 1) % freq
    x1 = (x0 + 1) % freq
    fy = ys - np.floor(ys)
    fx = xs - np.floor(xs)
    ey = (1 - np.cos(fy * np.pi)) / 2
    ex = (1 - np.cos(fx * np.pi)) / 2
    top = lattice[np.ix_(y0, x0)] * (1 - ex)[None, :] + lattice[np.ix_(y0, x1)] * ex[None, :]
    bot = lattice[np.ix_(y1, x0)] * (1 - ex)[None, :] + lattice[np.ix_(y1, x1)] * ex[None, :]
    return top * (1 - ey)[:, None] + bot * ey[:, None]


def fbm(seed: int, size: int, octaves=(4, 8, 16, 32), weights=(0.5, 0.25, 0.15, 0.10)) -> np.ndarray:
    """Fractal noise in 0..1 that tiles seamlessly."""
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size))
    for f, w in zip(octaves, weights):
        out += _smooth_noise(rng, size, f) * w
    out -= out.min()
    return out / max(1e-6, out.max())


def tint(base: str, shade: str, mask: np.ndarray) -> np.ndarray:
    """Blend two hex colours by a 0..1 mask, returning float RGB in 0..255."""
    b = np.array([int(base[i : i + 2], 16) for i in (1, 3, 5)], dtype=float)
    s = np.array([int(shade[i : i + 2], 16) for i in (1, 3, 5)], dtype=float)
    return b[None, None, :] + (s - b)[None, None, :] * mask[:, :, None]


def grass(size: int) -> np.ndarray:
    """Blades: fine high-frequency streaks over a soft patchy base."""
    base = fbm(11, size, octaves=(3, 6, 12), weights=(0.6, 0.3, 0.1))
    blades = fbm(12, size, octaves=(32, 64), weights=(0.6, 0.4))
    mask = np.clip(base * 0.55 + blades * 0.65, 0, 1)
    rgb = tint("#5c8442", "#3f6330", mask)
    # A few sun-bleached tufts so the field is not one flat value.
    dry = np.clip((fbm(13, size, octaves=(6, 12), weights=(0.7, 0.3)) - 0.62) * 4, 0, 1)
    rgb += (np.array([132, 138, 74]) - rgb) * dry[:, :, None] * 0.55
    return rgb


def forest_floor(size: int) -> np.ndarray:
    """Darker, mossier, with scattered leaf litter."""
    base = fbm(21, size, octaves=(4, 8, 16), weights=(0.5, 0.3, 0.2))
    rgb = tint("#3d5c31", "#26401f", np.clip(base * 1.1, 0, 1))
    litter = np.clip((fbm(22, size, octaves=(16, 32), weights=(0.5, 0.5)) - 0.58) * 4, 0, 1)
    rgb += (np.array([96, 74, 43]) - rgb) * litter[:, :, None] * 0.6
    return rgb


def rock(size: int) -> np.ndarray:
    """Fractured grey stone: broad slabs with darker cracks."""
    base = fbm(31, size, octaves=(4, 8, 16, 32), weights=(0.45, 0.3, 0.15, 0.1))
    rgb = tint("#8e9096", "#5f6167", np.clip(base * 1.15, 0, 1))
    cracks = np.clip(1 - np.abs(fbm(32, size, octaves=(6, 12), weights=(0.7, 0.3)) - 0.5) * 7, 0, 1)
    rgb += (np.array([64, 65, 70]) - rgb) * cracks[:, :, None] * 0.5
    return rgb


def dirt(size: int) -> np.ndarray:
    """Trodden earth with small stones — used for foothills and worn ground."""
    base = fbm(41, size, octaves=(4, 8, 16), weights=(0.5, 0.3, 0.2))
    rgb = tint("#8a7250", "#5f4c33", np.clip(base * 1.1, 0, 1))
    grit = np.clip((fbm(42, size, octaves=(32, 64), weights=(0.5, 0.5)) - 0.62) * 5, 0, 1)
    rgb += (np.array([150, 143, 128]) - rgb) * grit[:, :, None] * 0.7
    return rgb


def height_of(rgb: np.ndarray) -> np.ndarray:
    """Luminance doubles as a height field for deriving the normal map."""
    return (rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114) / 255.0


def normal_from_height(h: np.ndarray, strength: float) -> np.ndarray:
    """Sobel-free central-difference normal map, wrapped so it tiles with the colour."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * strength
    nz = np.ones_like(h)
    ln = np.sqrt(dx * dx + dy * dy + nz * nz)
    return np.stack([(-dx / ln * 0.5 + 0.5), (-dy / ln * 0.5 + 0.5), (nz / ln * 0.5 + 0.5)], axis=2) * 255


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    cells = {(0, 0): grass(CELL), (1, 0): forest_floor(CELL), (0, 1): rock(CELL), (1, 1): dirt(CELL)}
    strengths = {(0, 0): 6.0, (1, 0): 6.0, (0, 1): 12.0, (1, 1): 8.0}
    color = np.zeros((ATLAS, ATLAS, 3))
    normal = np.zeros((ATLAS, ATLAS, 3))
    for (cx, cy), rgb in cells.items():
        x, y = cx * CELL, cy * CELL
        color[y : y + CELL, x : x + CELL] = np.clip(rgb, 0, 255)
        normal[y : y + CELL, x : x + CELL] = normal_from_height(height_of(rgb), strengths[(cx, cy)])
    Image.fromarray(color.astype(np.uint8)).save(os.path.join(OUT, "ground.png"), optimize=True)
    Image.fromarray(normal.astype(np.uint8)).save(os.path.join(OUT, "ground_n.png"), optimize=True)
    for f in ("ground.png", "ground_n.png"):
        p = os.path.join(OUT, f)
        print(f"{f:14} {os.path.getsize(p) / 1024:6.0f} KB  ({ATLAS}x{ATLAS})")


if __name__ == "__main__":
    main()
