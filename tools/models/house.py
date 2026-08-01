"""A plain villager's house: timber walls, thatched gable roof, door, shutters, chimney.

Two tiles square, matching BUILDING_DEFS.house (w:2, h:2). Faces +Y in Blender, which the
glTF exporter turns into the game's +Z forward.
"""

from common import reset_scene, material, box, prism, bevel, finish, export_glb

W, D = 2.0, 2.0          # footprint in tiles
WALL_H = 1.05            # eaves height
ROOF_H = 0.85            # ridge above the eaves


def build():
    reset_scene()
    plaster = material("Plaster", (0.78, 0.72, 0.60))
    timber = material("Timber", (0.28, 0.19, 0.12))
    thatch = material("Thatch", (0.46, 0.34, 0.16))
    door_m = material("Door", (0.33, 0.21, 0.13))
    stone = material("Stone", (0.42, 0.41, 0.39))

    parts = []

    # Walls, inset slightly so the roof overhangs them.
    walls = box("Walls", (W - 0.18, D - 0.18, WALL_H), (0, 0, WALL_H / 2), plaster)
    bevel(walls)
    parts.append(walls)

    # Corner posts and a mid-rail — the half-timbered look, cheap in polys.
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = box(
                "Post",
                (0.13, 0.13, WALL_H),
                (sx * (W / 2 - 0.13), sy * (D / 2 - 0.13), WALL_H / 2),
                timber,
            )
            parts.append(p)
    rail = box("Rail", (W - 0.16, D - 0.16, 0.09), (0, 0, WALL_H * 0.62), timber)
    parts.append(rail)

    # Thatched gable roof, overhanging the walls on every side.
    roof = prism("Roof", W + 0.22, D + 0.18, ROOF_H, (0, 0, WALL_H), thatch)
    parts.append(roof)

    # Door on the +Y face.
    door = box("Door", (0.42, 0.08, 0.68), (0, D / 2 - 0.10, 0.34), door_m)
    parts.append(door)

    # A shuttered window either side of the door.
    for sx in (-1, 1):
        sh = box("Shutter", (0.30, 0.07, 0.30), (sx * 0.62, D / 2 - 0.10, 0.70), timber)
        parts.append(sh)

    # Stone chimney breaking the ridge line.
    chimney = box("Chimney", (0.26, 0.26, 0.75), (W / 2 - 0.42, -0.35, WALL_H + ROOF_H * 0.55), stone)
    bevel(chimney)
    parts.append(chimney)

    return finish(parts, "House")


if __name__ == "__main__":
    build()
    export_glb("public/models/house.glb")
