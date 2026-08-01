"""Shared helpers for the model-authoring scripts in this folder.

Each script builds one `.glb` for `public/models/` out of plain Blender primitives, so the
models live in git as readable, diffable source rather than as opaque binaries. Run one with:

    python3 tools/models/build.py house

Authoring conventions (see public/models/README.md for how the game consumes these):
  * 1 Blender unit = 1 map tile. Build a 2x2-tile house 2 units wide.
  * +Z is the direction the building faces; +Y is up in the exported glTF (the exporter
    converts from Blender's Z-up automatically).
  * Keep it low-poly and flat-shaded. The game renders these tiny on a phone, and
    `normalize()` in src/render/models.ts re-centers and rescales every model on load, so
    exact size and origin here are forgiving — orientation is not.
"""

import bpy
import bmesh
from mathutils import Vector


def reset_scene() -> None:
    """Empty the file so a script always starts from a blank scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple[float, float, float], roughness: float = 0.85):
    """A flat, matte Principled material. Colors are linear RGB in 0..1."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def box(name: str, size: tuple[float, float, float], location: tuple[float, float, float], mat=None):
    """An axis-aligned box specified by its full size and its center."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (size[0] / 2 * 2 / 2, size[1] / 2 * 2 / 2, size[2] / 2 * 2 / 2)
    ob.scale = (size[0], size[1], size[2])
    if mat:
        ob.data.materials.append(mat)
    return ob


def prism(name: str, width: float, depth: float, height: float, location: tuple[float, float, float], mat=None):
    """A triangular prism — the gable roof shape. Ridge runs along Y (the building's depth)."""
    mesh = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    hw, hd = width / 2, depth / 2
    verts = [
        (-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0),  # eaves
        (0, -hd, height), (0, hd, height),                        # ridge
    ]
    faces = [(0, 1, 4), (2, 3, 5), (0, 4, 5, 3), (1, 2, 5, 4), (0, 3, 2, 1)]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob.location = location
    if mat:
        ob.data.materials.append(mat)
    return ob


def shade_flat(ob) -> None:
    for poly in ob.data.polygons:
        poly.use_smooth = False


def bevel(ob, width: float = 0.012, segments: int = 1) -> None:
    """A whisper of bevel so edges catch the light instead of reading as dead flat."""
    mesh = ob.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.bevel(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        offset=width,
        segments=segments,
        affect="EDGES",
        profile=0.5,
    )
    bm.to_mesh(mesh)
    bm.free()


def finish(objects, name: str):
    """Join the parts into one object, flat-shade it, and sit it on the ground at the origin."""
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    shade_flat(ob)

    # Sit the model on the ground, centered on its footprint — the same normalization the
    # loader applies, done here too so the .glb looks right in any other viewer.
    bpy.context.view_layer.update()
    corners = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    ob.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return ob


def export_glb(path: str) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )
