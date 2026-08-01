# Ground textures

`ground.py` generates the terrain atlas the renderer samples. Everything is procedural, so the
textures live in git as a ~200-line script rather than as binaries someone has to re-source.

```
pip install Pillow numpy
python3 tools/textures/ground.py     # -> public/textures/ground.png, ground_n.png
```

## Layout

One 512x512 atlas of four 256x256 cells, plus a matching normal map derived from each cell's
luminance:

```
grass          forest floor      <- written first, so v = 1 in the shader
rock           dirt
```

**The V axis is flipped.** Textures upload with `flipY`, so the row written first here is the row
at `v = 1` in `TERRAIN_CELL` (renderer3d.ts). Getting this backwards renders every field as rock.

Each cell is generated on a wrapped lattice so it tiles against itself seamlessly — one cell
covers one map tile and thousands sit edge to edge, so a seam would be very visible. The renderer
also flips UVs per tile from a hash of the tile index, and jitters per-tile brightness, so a large
field of one surface does not read as wallpaper.
