"""Generate the tiling ground textures the terrain blends between.

The terrain is one continuous height-field mesh, and each vertex carries a grass/dirt/rock
weight so surfaces fade into each other instead of changing at a tile boundary. That means the
surfaces must be **separate repeating textures**, not an atlas: a shared atlas would need
fract() on the UVs, whose derivative discontinuity tears mipmaps along every cell seam.

Every texture is generated on a wrapped lattice so it tiles seamlessly at any repeat count.

    python3 tools/textures/ground.py
        -> public/textures/{grass,dirt,rock,sand}.png and ground_n.png
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
    """Turf built from several uncorrelated scales so no single pattern is legible.

    A texture this size covers only two map tiles, so it repeats constantly across a field and
    any strong feature turns into visible wallpaper. The fix is many weak layers rather than one
    strong one: fine blades, a mid clump, a broad tonal drift, and a sparse dark fleck, each on
    its own seed and frequency so their peaks rarely coincide.
    """
    blades_a = fbm(12, size, octaves=(48, 96), weights=(0.6, 0.4))
    blades_b = fbm(17, size, octaves=(64, 128), weights=(0.5, 0.5))
    clump = fbm(11, size, octaves=(8, 16), weights=(0.6, 0.4))
    drift = fbm(14, size, octaves=(3, 5), weights=(0.65, 0.35))
    mask = np.clip(blades_a * 0.34 + blades_b * 0.26 + clump * 0.28 + drift * 0.20, 0, 1)
    rgb = tint("#6d8256", "#4a6140", mask)
    # Sun-bleached patches, kept broad and gentle. The old version thresholded a mid-frequency
    # band hard, which produced exactly the obvious light blotches this replaces.
    dry = np.clip((drift - 0.55) * 1.7, 0, 1) * 0.5 + np.clip((clump - 0.7) * 1.5, 0, 1) * 0.3
    rgb += (np.array([134, 138, 100]) - rgb) * dry[:, :, None]
    # Sparse darker flecks (soil showing through) to break any residual regularity.
    fleck = np.clip((fbm(18, size, octaves=(24, 48), weights=(0.5, 0.5)) - 0.74) * 3.4, 0, 1)
    rgb += (np.array([64, 78, 54]) - rgb) * fleck[:, :, None] * 0.55
    return rgb


def forest_floor(size: int) -> np.ndarray:
    """Darker, mossier, with scattered leaf litter."""
    base = fbm(21, size, octaves=(4, 8, 16), weights=(0.5, 0.3, 0.2))
    rgb = tint("#4a5c3c", "#31402a", np.clip(base * 1.1, 0, 1))
    litter = np.clip((fbm(22, size, octaves=(16, 32), weights=(0.5, 0.5)) - 0.58) * 4, 0, 1)
    rgb += (np.array([96, 74, 43]) - rgb) * litter[:, :, None] * 0.6
    return rgb


def rock(size: int) -> np.ndarray:
    """Fractured grey stone: broad slabs with darker cracks."""
    base = fbm(31, size, octaves=(4, 8, 16, 32), weights=(0.45, 0.3, 0.15, 0.1))
    rgb = tint("#8a8a86", "#5c5c5a", np.clip(base * 1.15, 0, 1))
    cracks = np.clip(1 - np.abs(fbm(32, size, octaves=(6, 12), weights=(0.7, 0.3)) - 0.5) * 7, 0, 1)
    rgb += (np.array([64, 65, 70]) - rgb) * cracks[:, :, None] * 0.5
    return rgb


def dirt(size: int) -> np.ndarray:
    """Trodden earth with small stones — used for foothills and worn ground."""
    base = fbm(41, size, octaves=(4, 8, 16), weights=(0.5, 0.3, 0.2))
    rgb = tint("#836f52", "#5a4a37", np.clip(base * 1.1, 0, 1))
    grit = np.clip((fbm(42, size, octaves=(32, 64), weights=(0.5, 0.5)) - 0.62) * 5, 0, 1)
    rgb += (np.array([150, 143, 128]) - rgb) * grit[:, :, None] * 0.7
    return rgb


def sand(size: int) -> np.ndarray:
    """Wet-margin sand: fine pale grains with faint tide ripples and a few shell-pale flecks."""
    grains = fbm(51, size, octaves=(64, 128), weights=(0.5, 0.5))
    ripple = fbm(52, size, octaves=(6, 14), weights=(0.7, 0.3))
    mask = np.clip(grains * 0.55 + ripple * 0.45, 0, 1)
    rgb = tint("#cbb98d", "#a18f66", mask)
    pale = np.clip((fbm(53, size, octaves=(24, 48), weights=(0.5, 0.5)) - 0.7) * 3.2, 0, 1)
    rgb += (np.array([226, 214, 184]) - rgb) * pale[:, :, None] * 0.6
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


SIZE = 512  # per-surface texture resolution


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    surfaces = {"grass": grass(SIZE), "dirt": dirt(SIZE), "rock": rock(SIZE), "sand": sand(SIZE)}
    written = []
    for name, rgb in surfaces.items():
        path = os.path.join(OUT, f"{name}.png")
        Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(path, optimize=True)
        written.append(f"{name}.png")
    # One shared normal map keeps the fragment shader to a single extra sample while still
    # giving flat ground some relief; the mesh itself supplies the large-scale shape.
    nrm = normal_from_height(height_of(surfaces["grass"]), 7.0)
    Image.fromarray(nrm.astype(np.uint8)).save(os.path.join(OUT, "ground_n.png"), optimize=True)
    written.append("ground_n.png")
    for f in written:
        p = os.path.join(OUT, f)
        print(f"{f:14} {os.path.getsize(p) / 1024:6.0f} KB  ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
