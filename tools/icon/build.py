"""Cut the app icons from the source artwork.

    pip install Pillow
    python3 tools/icon/build.py
        -> public/icons/{icon-512,icon-192,apple-touch-icon,favicon-64}.png

The artwork (tools/icon/source.jpg) is already composed as an app icon: a full-bleed village
scene inside a rounded square, with a dark backdrop showing through the corners. Every platform
masks the icon with a rounded shape of *its own* — iOS a squircle, Android whatever the launcher
picks — so shipping the baked corners would draw a dark rim just inside the system mask.

INSET trims far enough in that the crop rectangle's corners sit inside the artwork's rounded
corner, which leaves a square of nothing but scene for the platform to cut its own shape from.
For a corner of radius R that needs R * (1 - 1/sqrt(2)) ~= 0.29R; the source rounds at about
228px on a 1000px image, and 72px of inset clears it with a little to spare.

There is no separate maskable file. The square is scene edge to edge with nothing to lose in
the outer tenth, so the manifest declares the 512 as `any maskable` rather than precaching a
second, byte-identical copy; padding a landscape into the safe zone would only letterbox the
scene inside its own icon.

The icons ship as 256-colour PNGs. They are precached by the service worker, so every kilobyte
is paid on install, and quantising the whole set costs a mean of under 3/255 per channel —
invisible at any size an icon is ever drawn, for a quarter of the bytes.
"""

import os

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source.jpg")
OUT = os.path.join(HERE, "..", "..", "public", "icons")

INSET = 72  # pixels trimmed off each side of the source to shed its rounded frame

# A 64px favicon cannot hold the whole valley — the church, the bridge and the mountains all
# land on a pixel or two apiece and turn to noise. The small sizes zoom to the cottage instead,
# given in fractions of the square master so the framing survives a re-render of the art.
FOCUS = (0.66, 0.54, 0.68)  # centre x, centre y, side


def master() -> Image.Image:
    """The source cropped to a square of pure artwork."""
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    im = im.crop((INSET, INSET, w - INSET, h - INSET))
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def focused(im: Image.Image) -> Image.Image:
    """The master zoomed to the cottage, for sizes too small to read the whole scene."""
    n = im.width
    cx, cy, frac = FOCUS
    side = n * frac
    left = round(cx * n - side / 2)
    top = round(cy * n - side / 2)
    left = max(0, min(left, n - round(side)))
    top = max(0, min(top, n - round(side)))
    return im.crop((left, top, left + round(side), top + round(side)))


def emit(im: Image.Image, name: str, size: int) -> None:
    out = im.resize((size, size), Image.LANCZOS)
    if size <= 192:
        # Lanczos softens edges on a big downscale, and a 64px tab icon has no pixels to spare.
        out = out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=60, threshold=2))
    out = out.convert("RGB").quantize(
        colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG
    )
    path = os.path.join(OUT, name)
    out.save(path, "PNG", optimize=True)
    print("wrote", name, "(%d bytes)" % os.path.getsize(path))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    full = master()
    near = focused(full)
    emit(full, "icon-512.png", 512)
    emit(full, "icon-192.png", 192)
    emit(full, "apple-touch-icon.png", 180)
    emit(near, "favicon-64.png", 64)


if __name__ == "__main__":
    main()
