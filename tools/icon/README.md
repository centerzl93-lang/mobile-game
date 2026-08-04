# App icon

`source.jpg` is the icon artwork — a village scene composed as an app icon, rounded frame and
all. `build.py` cuts the shipped sizes out of it.

```
pip install Pillow
python3 tools/icon/build.py     # -> public/icons/*.png
```

The outputs are committed, so nothing regenerates them at build or deploy time. Re-run the
script only after replacing `source.jpg`, and commit what it writes.

| file                 | size | used by                                     |
| -------------------- | ---- | ------------------------------------------- |
| icon-512.png         | 512  | manifest, `purpose: any maskable`           |
| icon-192.png         | 192  | manifest                                    |
| apple-touch-icon.png | 180  | iOS Home Screen (`index.html`)              |
| favicon-64.png       | 64   | browser tab (`index.html`)                  |

Two things the script is doing on purpose:

- **It trims the artwork's own rounded corners.** Every platform masks the icon with its own
  shape, so the baked corners would otherwise show as a dark rim inside the system mask.
  `INSET` crops far enough in that the square is scene edge to edge.
- **The favicon is a different crop.** The whole valley turns to noise at 64px, so the small
  size zooms to the cottage. `FOCUS` frames it, in fractions of the square master.
