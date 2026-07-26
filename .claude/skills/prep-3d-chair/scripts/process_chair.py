"""
Prep a 3D chair FBX for the Cactus shop's product-3d-views fabric configurator,
split the upholstery into an independently-paintable SEAT and BACK, and always
report the chair's height.

Run headless through Blender, never as plain python:

  /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python process_chair.py -- --src "IN.fbx" [options]

What it does (materials only - geometry and scale are never touched):
  1. Finds the fabric/upholstery material (the one whose Base Color is driven by
     an image, i.e. a fabric photo - plastic/metal parts are solid colours or
     carry only a normal map).
  2. Removes that fabric colour photo but KEEPS the weave normal map. The shop
     loads the shopper's chosen swatch into the base-colour slot and never
     touches the normal map, so the weave survives and every swatch (photo or
     flat colour) still reads as real fabric. Base colour is set to white so the
     swatch is not tinted.
  3. SPLITS the upholstery into two materials - SEAT FABRIC and BACK FABRIC - so
     the shop can paint the seat and the back from different variation attributes
     (e.g. two-tone chairs). The split is by geometry: the seat sits low and its
     surfaces face up, the backrest rises and its surfaces face sideways. Those
     exact names are the contract applyFabricPaint() matches on; the admin maps
     each to a variation via collectMaterialNamesFrom(). Use --no-split to keep a
     single material named FABRIC instead.
  4. Drops every material to a matte, non-metal finish (Metalness 0, Specular
     0.5). Roughness comes from a reference glTF/GLB if you pass one, else
     sensible defaults. Metalness 1 is the usual cause of a chair looking like
     polished chrome.
  5. Exports a new FBX (textures embedded) beside the source, leaving the
     original as a backup.
  6. Prints the chair's height (world bounding box, up axis) in cm and m.

Height is always printed, even with --measure-only (no edit, no export).
Parse the lines prefixed RESULT_ / HEIGHT_CM: to relay back to the user.
"""

import argparse
import os
import re
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
p = argparse.ArgumentParser()
p.add_argument("--src", required=True, help="input FBX")
p.add_argument("--dst", default=None, help="output FBX (default: '<src> FABRIC.fbx')")
p.add_argument("--reference", default=None,
               help="a correct GLB/glTF to copy per-material roughness/metalness/specular from")
p.add_argument("--fabric-material", default=None,
               help="explicit name of the fabric material (default: auto-detect by base-colour image)")
p.add_argument("--fabric-roughness", type=float, default=0.98,
               help="fabric roughness when no reference is given")
p.add_argument("--other-roughness", type=float, default=0.75,
               help="non-fabric roughness when no reference is given")
p.add_argument("--no-split", action="store_true",
               help="keep one fabric material named FABRIC instead of SEAT/BACK")
p.add_argument("--split-z", type=float, default=None,
               help="manual world-Z plane: fabric faces above it are BACK, below are SEAT "
                    "(overrides the automatic seat/back detection)")
p.add_argument("--swap-seat-back", action="store_true",
               help="flip the seat/back assignment if the auto split guessed them the wrong way round")
p.add_argument("--measure-only", action="store_true",
               help="only import and report height; make no changes")
args = p.parse_args(argv)

SRC = os.path.abspath(os.path.expanduser(args.src))
if not os.path.exists(SRC):
    print("RESULT_ERROR: src not found:", SRC)
    sys.exit(1)


def base_name(name):
    """Blender appends '.001' etc on name collision; strip it so a reference
    material matches its same-named source material."""
    return re.sub(r"\.\d+$", "", name)


def principled(mat):
    if not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def set_scalar(bsdf, names, v):
    """Set the first input that exists - the specular socket was renamed across
    Blender versions ('Specular' -> 'Specular IOR Level')."""
    for name in names:
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = v
            return True
    return False


def base_colour_image_nodes(mat):
    """TEX_IMAGE nodes anywhere on the chain feeding Base Color."""
    b = principled(mat)
    if not b:
        return []
    bc = b.inputs.get("Base Color")
    if not bc or not bc.is_linked:
        return []
    found, stack, seen = [], [bc.links[0].from_node], set()
    while stack:
        nd = stack.pop()
        if nd.name in seen:
            continue
        seen.add(nd.name)
        if nd.type == "TEX_IMAGE":
            found.append(nd)
        else:
            for inp in nd.inputs:
                for l in inp.links:
                    stack.append(l.from_node)
    return found


def detect_fabric(materials, explicit):
    if explicit:
        m = bpy.data.materials.get(explicit)
        if not m:
            print("RESULT_ERROR: --fabric-material not found:", explicit)
            sys.exit(1)
        return m
    cands = [m for m in materials if base_colour_image_nodes(m)]
    if len(cands) == 1:
        return cands[0]
    if not cands:
        print("RESULT_WARN: no material has a base-colour image (fabric already stripped?); "
              "skipping rename/strip/split")
        return None
    print("RESULT_ERROR: multiple fabric candidates, pass --fabric-material:",
          [m.name for m in cands])
    sys.exit(1)


def world_height():
    """Combined world bounding box; Z is Blender's up axis after FBX import."""
    lo = [1e18] * 3
    hi = [-1e18] * 3
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return [hi[i] - lo[i] for i in range(3)]


def fabric_slot_index(me, fabric_mat):
    for i, m in enumerate(me.materials):
        if m is fabric_mat:
            return i
    return None


def fabric_islands(obj, fab_slot):
    """Loose parts made only of this object's fabric faces. Returns a list of
    dicts: {faces: [poly indices], zc: world-centroid Z, flat: mean|world normal.z|}.
    Seat and back almost always arrive as separate mesh pieces, so keeping each
    piece intact means a face is never orphaned into the wrong half by a local
    dip or bulge - far safer than slicing every face at one Z plane."""
    me = obj.data
    fab_faces = [i for i, poly in enumerate(me.polygons) if poly.material_index == fab_slot]
    fab_set = set(fab_faces)
    # vertex -> fabric faces touching it
    v2f = {}
    for fi in fab_faces:
        for vi in me.polygons[fi].vertices:
            v2f.setdefault(vi, []).append(fi)

    mw = obj.matrix_world
    nmat = mw.to_3x3()
    seen = set()
    islands = []
    for start in fab_faces:
        if start in seen:
            continue
        stack, comp = [start], []
        while stack:
            fi = stack.pop()
            if fi in seen:
                continue
            seen.add(fi)
            comp.append(fi)
            for vi in me.polygons[fi].vertices:
                for nf in v2f.get(vi, ()):
                    if nf not in seen and nf in fab_set:
                        stack.append(nf)
        zc = 0.0
        flat = 0.0
        for fi in comp:
            poly = me.polygons[fi]
            zc += (mw @ poly.center).z
            flat += abs((nmat @ poly.normal).normalized().z)
        islands.append({"faces": comp, "zc": zc / len(comp), "flat": flat / len(comp)})
    return islands


# ---- load source ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)

if args.measure_only:
    d = world_height()
    print("RESULT_DIMS_M:", [round(v, 4) for v in d])
    print("HEIGHT_CM:", round(d[2] * 100, 1))
    sys.exit(0)

# Snapshot the source's own materials BEFORE any reference import, so the
# reference's materials (which land in the same file, possibly with .001 name
# clashes) can never be mistaken for the chair's own.
src_materials = list(bpy.data.materials)
src_material_ids = set(id(m) for m in src_materials)

# ---- reference values (optional) ----
ref_vals = {}       # base material name -> dict(metalness, roughness, specular)
ref_fabric_name = None
if args.reference:
    REF = os.path.abspath(os.path.expanduser(args.reference))
    before = set(o.name for o in bpy.data.objects)
    ext = os.path.splitext(REF)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=REF)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=REF)
    else:
        print("RESULT_ERROR: unsupported reference type:", ext)
        sys.exit(1)
    ref_objs = [o for o in bpy.data.objects if o.name not in before]
    ref_mats = [m for m in bpy.data.materials if id(m) not in src_material_ids]
    for m in ref_mats:
        b = principled(m)
        if not b:
            continue

        def get(names, default):
            for n in names:
                if n in b.inputs:
                    return b.inputs[n].default_value
            return default

        key = base_name(m.name)
        ref_vals[key] = {
            "metalness": float(get(["Metallic"], 0.0)),
            "roughness": float(get(["Roughness"], args.other_roughness)),
            "specular": float(get(["Specular IOR Level", "Specular"], 0.5)),
        }
        if base_colour_image_nodes(m):
            ref_fabric_name = key
    for o in ref_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in ref_mats:
        if m.users == 0:
            bpy.data.materials.remove(m)

# ---- identify the fabric material in the source ----
fabric = detect_fabric(src_materials, args.fabric_material)
fabric_original_name = fabric.name if fabric else None

# ---- strip fabric photo ----
removed = []
if fabric:
    for nd in base_colour_image_nodes(fabric):
        removed.append(nd.image.name if nd.image else "?")
        fabric.node_tree.nodes.remove(nd)
    b = principled(fabric)
    if b and "Base Color" in b.inputs:
        b.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)

# ---- matte every material; match reference where we can ----
def target_for(mat, is_fabric):
    if ref_vals:
        key = None
        if is_fabric:
            fab_key = base_name(fabric_original_name) if fabric_original_name else None
            key = fab_key if fab_key in ref_vals else ref_fabric_name
        else:
            key = base_name(mat.name) if base_name(mat.name) in ref_vals else None
        if key and key in ref_vals:
            v = dict(ref_vals[key])
            v["metalness"] = 0.0            # never trust a metal guess (renders black if wrong)
            return v
    return {
        "metalness": 0.0,
        "roughness": args.fabric_roughness if is_fabric else args.other_roughness,
        "specular": 0.5,
    }

applied = []
for mat in src_materials:
    b = principled(mat)
    if not b:
        continue
    t = target_for(mat, mat is fabric)
    set_scalar(b, ["Metallic"], t["metalness"])
    set_scalar(b, ["Roughness"], t["roughness"])
    set_scalar(b, ["Specular IOR Level", "Specular"], t["specular"])
    applied.append((mat.name, round(t["roughness"], 3)))

# ---- name / split the fabric ----
split_summary = None
if fabric:
    fabric_objs = [o for o in bpy.data.objects
                   if o.type == "MESH" and fabric_slot_index(o.data, fabric) is not None]

    if args.no_split:
        fabric.name = "FABRIC"
    else:
        # Gather every fabric island across every fabric object, tagged with its
        # object, then classify them all together so a seat object and a back
        # object separate correctly even when each is a single piece.
        pooled = []   # (obj, island)
        for o in fabric_objs:
            slot = fabric_slot_index(o.data, fabric)
            for isl in fabric_islands(o, slot):
                pooled.append((o, isl))

        back_faces = {}   # obj -> set(poly indices) that belong to the BACK

        def mark_back(o, isl):
            back_faces.setdefault(o, set()).update(isl["faces"])

        if args.split_z is not None:
            # Manual plane: any fabric face whose centroid is above it is BACK.
            for o, isl in pooled:
                mw = o.matrix_world
                me = o.data
                for fi in isl["faces"]:
                    if (mw @ me.polygons[fi].center).z > args.split_z:
                        back_faces.setdefault(o, set()).add(fi)
            split_kind = "manual --split-z"
        elif len(pooled) <= 1:
            # One fused upholstery piece: fall back to a per-face height cut at the
            # midpoint of the fabric's own Z span. Loud warning - a fused seat+back
            # is the shape this can get wrong, so the human should eyeball it.
            print("RESULT_WARN: seat and back appear fused into one piece; "
                  "splitting by height midpoint - verify, or pass --split-z")
            all_z = []
            for o, isl in pooled:
                mw = o.matrix_world
                me = o.data
                for fi in isl["faces"]:
                    all_z.append(((mw @ me.polygons[fi].center).z, o, fi))
            if all_z:
                zmid = (min(z for z, _, _ in all_z) + max(z for z, _, _ in all_z)) / 2
                for z, o, fi in all_z:
                    if z > zmid:
                        back_faces.setdefault(o, set()).add(fi)
            split_kind = "fused midpoint"
        else:
            # Automatic: score each island by how "backrest-like" it is - high and
            # vertical (backness = normalised height minus flatness). The seat is
            # the low, upward-facing outlier; the back (and any headrest) score
            # higher. Split at the largest gap in the sorted scores.
            zs = [isl["zc"] for _, isl in pooled]
            zlo, zhi = min(zs), max(zs)
            span = (zhi - zlo) or 1.0
            scored = []
            for o, isl in pooled:
                znorm = (isl["zc"] - zlo) / span
                scored.append((znorm - isl["flat"], o, isl))   # backness
            scored.sort(key=lambda s: s[0])
            # largest gap between consecutive backness scores is the seat|back line
            gap_i, gap = 0, -1.0
            for i in range(len(scored) - 1):
                g = scored[i + 1][0] - scored[i][0]
                if g > gap:
                    gap, gap_i = g, i
            for _, o, isl in scored[gap_i + 1:]:
                mark_back(o, isl)
            split_kind = "auto (height+flatness)"

        # If nothing landed in either half, there is no distinct back to split off.
        any_back = any(back_faces.get(o) for o in fabric_objs)
        if not any_back:
            print("RESULT_WARN: no distinct back region found; keeping a single seat material")
            fabric.name = "SEAT FABRIC"
            split_summary = {"kind": split_kind, "seat": "all", "back": 0}
        else:
            if args.swap_seat_back:
                # Reinterpret: the faces we called back are the seat instead.
                for o in fabric_objs:
                    slot = fabric_slot_index(o.data, fabric)
                    all_fab = set(i for i, poly in enumerate(o.data.polygons)
                                  if poly.material_index == slot)
                    back_faces[o] = all_fab - back_faces.get(o, set())

            fabric.name = "SEAT FABRIC"
            back_mat = fabric.copy()
            back_mat.name = "BACK FABRIC"

            seat_n = back_n = 0
            for o in fabric_objs:
                me = o.data
                seat_slot = fabric_slot_index(me, fabric)
                bset = back_faces.get(o)
                if not bset:
                    seat_n += sum(1 for poly in me.polygons if poly.material_index == seat_slot)
                    continue
                me.materials.append(back_mat)
                back_slot = len(me.materials) - 1
                for poly in me.polygons:
                    if poly.material_index == seat_slot:
                        if poly.index in bset:
                            poly.material_index = back_slot
                            back_n += 1
                        else:
                            seat_n += 1
            split_summary = {"kind": split_kind, "seat": seat_n, "back": back_n}

# ---- purge orphaned images (the stripped fabric photo) ----
for img in list(bpy.data.images):
    if img.users == 0 and img.name not in ("Render Result", "Viewer Node"):
        bpy.data.images.remove(img)

# ---- export, preserving scale/orientation (defaults round-trip the importer) ----
DST = args.dst
if not DST:
    stem, _ = os.path.splitext(SRC)
    DST = stem + " FABRIC.fbx"
DST = os.path.abspath(os.path.expanduser(DST))

bpy.ops.export_scene.fbx(
    filepath=DST,
    use_selection=False,
    global_scale=1.0,
    apply_unit_scale=True,
    apply_scale_options="FBX_SCALE_NONE",
    bake_space_transform=False,
    use_mesh_modifiers=False,
    add_leaf_bones=False,
    path_mode="COPY",
    embed_textures=True,
)

d = world_height()
print("RESULT_FABRIC_RENAMED_FROM:", fabric_original_name)
print("RESULT_STRIPPED_IMAGES:", removed)
print("RESULT_SPLIT:", split_summary)
print("RESULT_MATERIALS:", applied)
print("RESULT_REFERENCE_USED:", bool(ref_vals))
print("RESULT_OUTPUT:", DST)
print("RESULT_DIMS_M:", [round(v, 4) for v in d])
print("HEIGHT_CM:", round(d[2] * 100, 1))
