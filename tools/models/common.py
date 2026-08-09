"""Shared helpers for the model-authoring scripts in this folder.

Each script builds one `.gltf` for `public/models/` out of plain Blender primitives, so the
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

import os

import bpy
import bmesh
from mathutils import Matrix, Vector

TEXTURE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "textures")
)


UV_WORLD_SCALE = 1.0  # one texture repeat per Blender unit, i.e. per map tile


def reset_scene() -> None:
    """Empty the file so a script always starts from a blank scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple[float, float, float], roughness: float = 0.85, tex: str | None = None):
    """A Principled material, optionally textured from public/textures/mat_<tex>.png.

    `color` still applies when a texture is given: it multiplies the map, so one source can be
    retinted per use (the same shingle serving a blue slate and a grey one). The matching `_n`
    normal map is wired automatically when it exists. `export_gltf` points the exported model at
    the shared PNGs in public/textures/ rather than packing a copy into every file.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if not tex:
        return mat

    col_path = os.path.join(TEXTURE_DIR, f"mat_{tex}.png")
    if not os.path.exists(col_path):
        return mat  # best-effort: an untextured model still builds
    img = bpy.data.images.load(col_path, check_existing=True)
    tex_node = nt.nodes.new("ShaderNodeTexImage")
    tex_node.image = img
    tex_node.location = (-600, 200)
    # Multiply the map by the material colour so one texture can serve several tints.
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 1.0
    mix.inputs["Color2"].default_value = (*color, 1.0)
    mix.location = (-300, 200)
    nt.links.new(tex_node.outputs["Color"], mix.inputs["Color1"])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    # The glTF exporter cannot represent a Mix node between the image and Base Color: it writes the
    # texture and drops the tint, so every "retint" of a shared map came out identical — five tree
    # species in one green, stone and stone_dark the same grey. The colour is stashed here and
    # written back as `baseColorFactor` by `export_gltf`, which is exactly what that factor means.
    mat["tint"] = list(color)

    nrm_path = os.path.join(TEXTURE_DIR, f"mat_{tex}_n.png")
    if os.path.exists(nrm_path):
        nimg = bpy.data.images.load(nrm_path, check_existing=True)
        nimg.colorspace_settings.name = "Non-Color"
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = nimg
        ntex.location = (-600, -150)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.8
        nmap.location = (-300, -150)
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
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


def _tidy(ob, name: str) -> None:
    """Flat-shade a joined object and give it the village's shared cube-projected UVs."""
    ob.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    shade_flat(ob)
    if not ob.data.uv_layers:
        ob.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=UV_WORLD_SCALE, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def _join(objects, name: str):
    """Join a list of parts into one object named `name`, and make it active."""
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    return bpy.context.active_object


def finish_parts(groups, name: str, pivots=None):
    """Like `finish`, but keeps named sub-assemblies as separate objects in one model.

    A model whose parts have to move at runtime cannot be a single joined mesh — the boat's rig is
    lowered to shoot a bridge, and that needs a node the renderer can turn on its own. Each group
    is joined by itself and they are then normalized *together*, against the combined bounds, so
    the pieces keep exactly the relative positions they were authored in.

    `groups` is a list of (suffix, parts). `pivots` optionally maps a suffix to the point that
    part should turn about, in authored coordinates: the object's origin is put there, so a
    rotation applied to its node in the renderer swings it about that point rather than about the
    model's centre. The mast has to pivot at its foot, or lowering it drags the heel through the
    deck.

    The offset is left on each object's *location* rather than applied into its vertices, because
    applying it would move every origin back to the model centre and undo the pivots.
    """
    pivots = pivots or {}
    made = []
    for suffix, parts in groups:
        ob = _join(parts, f"{name}{suffix}")
        _tidy(ob, f"{name}{suffix}")
        pivot = pivots.get(suffix)
        if pivot is not None:
            # Move the origin to the pivot by shifting the mesh the other way, so nothing in the
            # scene appears to move.
            delta = Vector(pivot) - ob.location
            ob.data.transform(Matrix.Translation(-delta))
            ob.location += delta
        made.append(ob)

    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in made:
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    offset = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for ob in made:
        ob.location -= offset
    return made


def finish(objects, name: str):
    """Join the parts into one object, flat-shade it, and sit it on the ground at the origin."""
    ob = _join(objects, name)
    # Cube-project the UVs at a fixed world scale. These buildings are boxy, so a cube projection
    # gives every face sensible texture direction with no hand-unwrapping, and one shared scale
    # keeps texel density consistent across every model in the village.
    _tidy(ob, name)

    # Sit the model on the ground, centered on its footprint — the same normalization the
    # loader applies, done here too so the model looks right in any other viewer.
    bpy.context.view_layer.update()
    corners = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    ob.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return ob


#: Whether a textured material's tint is written out as `baseColorFactor`. See `export_gltf`.
#: False matches the models in public/models/; True re-tints and requires rebuilding all of them.
TINT_TEXTURED = False


def export_gltf(path: str) -> None:
    """Export a .gltf that *references* the shared textures instead of packing them.

    A GLB embeds every image it uses, and the whole village draws on the same handful of
    materials — packing them per model meant ~620 KB of duplicated PNG in each of two dozen
    files. Exporting separately and pointing the image URIs back at `public/textures/` (the very
    same files the terrain already loads) leaves each model a few tens of KB of geometry, and the
    browser fetches each texture once for the entire game.

    Blender writes its own copies of the images next to the .gltf; those are rewritten away and
    deleted here, so `public/models/` holds only `.gltf` + `.bin`.
    """
    import json
    import shutil

    out_dir = os.path.dirname(os.path.abspath(path))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLTF_SEPARATE",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_keep_originals=False,
    )
    with open(path, "r", encoding="utf-8") as fh:
        doc = json.load(fh)
    # Re-attach the tints the exporter dropped (see `material`). Untextured materials already
    # carry their colour as the factor, so only the textured ones need this.
    #
    # ...except that the models actually shipped in public/models/ carry **no** factor on their
    # textured materials: the tint pass was written, seen to change all 29 of them at once, and
    # reverted rather than shipped. That left the script and the art disagreeing, and the
    # disagreement was a trap — a newly built model came out multiplied by its tint (stone at
    # 0.27 x its own texture) and stood in the village three shades darker than every neighbour.
    # The Town Hall was built and looked burnt for exactly this reason.
    #
    # So the script now matches the art. Turning this on is a deliberate decision to re-export
    # every model together, not something a single new building should trip over; it is worth
    # doing one day, because untinted means `stone` and `stone_dark` render identically and the
    # five tree species share one green.
    if TINT_TEXTURED:
        tints = {m.name: list(m["tint"]) for m in bpy.data.materials if m.get("tint") is not None}
    else:
        tints = {}
    for mat_doc in doc.get("materials", []):
        tint = tints.get(mat_doc.get("name"))
        if tint is None:
            continue
        pbr = mat_doc.setdefault("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr:
            pbr["baseColorFactor"] = [*tint, 1.0]
    copied = []
    for image in doc.get("images", []):
        uri = image.get("uri")
        if not uri:
            continue
        copied.append(os.path.join(out_dir, uri))
        # Relative to the model, which lives in public/models/.
        image["uri"] = "../textures/" + os.path.basename(uri)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    for dup in copied:
        if os.path.exists(dup):
            os.remove(dup)
    # Blender 4.x may also drop the textures into a sibling folder.
    stray = os.path.join(out_dir, "textures")
    if os.path.isdir(stray):
        shutil.rmtree(stray)
