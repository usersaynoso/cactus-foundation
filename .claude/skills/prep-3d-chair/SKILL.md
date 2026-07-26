---
name: prep-3d-chair
description: >-
  Prepare a 3D chair model (FBX) for the Cactus shop's product-3d-views fabric
  configurator, and report the chair's height. Use this whenever the user hands
  over a chair/seating/furniture .fbx (or .glb) and wants it made ready for the
  shop's 3D viewer, fabric swatches, or variation colours - phrases like "prep
  this chair", "fix the fabric material", "make it load swatches", "split the
  seat and back fabric", "it's too shiny / too metallic", "match the shininess
  to the other file", or "how tall is this chair". It strips the baked-in fabric
  photo, splits the upholstery into independently-paintable SEAT FABRIC and BACK
  FABRIC materials (the shop's paint-slot contract), drops the finish to matte,
  preserves scale, and ALWAYS returns the height. Reach for it even if the user
  only asks for one of those things.
---

# Prep a 3D chair for the shop 3D viewer

A chair model that comes from a modeller is rarely ready for the shop. Three
things are almost always wrong, and one thing the user always wants to know:

1. **The upholstery has a fabric photo baked into it.** The shop can't recolour a
   baked photo - the fabric configurator (`applyFabricPaint` in
   `modules/product-3d-views-for-shop/lib/three/load-model.ts`) paints the
   shopper's chosen swatch into the material's **base-colour** slot, matching the
   material by **exact name** (the admin picks from `collectMaterialNamesFrom`).
   So the upholstery material must carry the agreed name and must not carry its
   own base-colour photo, or the swatch never appears.
2. **The seat and back are one material.** A shopper usually wants to choose the
   seat colour and the back colour separately (two-tone chairs), and the shop
   paints per named material. One `FABRIC` material can only ever be one colour,
   so the upholstery is split into `SEAT FABRIC` and `BACK FABRIC` - two names the
   admin maps to two different variation attributes.
3. **The materials are too shiny.** FBX exporters routinely write Metalness 1.0,
   which makes plastic and fabric read like polished chrome. glTF/GLB files
   usually carry the correct matte PBR values. Metalness 0 with a sensible
   roughness fixes it.
4. **The height.** The user wants the real-world height for listing/spec copy.

This skill does all of it deterministically with one bundled Blender script.
There is no need to open Blender's UI or reason about nodes by hand.

## How the seat/back split works

The seat and the back are told apart by shape, not by a hard-coded height. Each
is a contiguous piece of mesh; the script groups the fabric into those pieces
(loose parts) and scores each by how backrest-like it is - **high up and
facing sideways** vs the seat which sits **low and faces up**. The seat is the
low, upward-facing outlier; the back (and any headrest) score higher, and the
split falls at the biggest gap between the scores. Keeping each piece whole means
a face never gets stranded in the wrong half by a local dip or curve.

Two shapes need a nudge, both handled:
- **Seat and back modelled as one fused piece** (no separate parts). The script
  warns and falls back to a height-midpoint cut - eyeball the result, or pass
  `--split-z <world-Z>` to place the dividing plane yourself.
- **Auto-guess came out backwards** (rare). Pass `--swap-seat-back` to flip them.

## The one rule that bites: never disturb scale

The chair's scale (typically ~0.009 on every object, giving a ~1.1 m tall chair)
must survive untouched, or it arrives in the viewer the size of a doll's house or
a bus. The script edits **materials only** and exports with FBX settings that
round-trip the importer. Always verify scale round-tripped (see Verify below) -
it is the one silent failure here.

## Running it

Blender is required (macOS path shown; adjust if elsewhere):

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python "<skill-dir>/scripts/process_chair.py" -- \
  --src "/path/to/Chair.fbx" \
  --reference "/path/to/Chair.glb"
```

- `--src` (required): the FBX to prep.
- `--reference` (optional but preferred): a GLB/glTF of the same chair whose
  materials already look right. The script copies each material's roughness and
  specular from it (metalness is always forced to 0 - a wrong metal guess renders
  a part black). **If the user says one file's shininess is correct, pass that
  file as the reference.**
- `--dst` (optional): output path. Defaults to `<src> FABRIC.fbx` beside the
  source, leaving the original as a backup. Prefer the default - don't overwrite
  the original unless the user asks.
- `--fabric-material` (optional): the upholstery material's name. Omit it and the
  script auto-detects the material whose base colour is driven by an image. Pass
  it only if auto-detect complains about zero or several candidates.
- `--no-split`: keep a single material named `FABRIC` instead of splitting into
  seat and back. Use it for a chair with no distinct back (a stool) or when the
  shopper is meant to colour the whole chair as one.
- `--split-z <world-Z>`: place the seat/back dividing plane by hand - fabric faces
  above it become the back. Use when the auto split (or the fused-piece fallback)
  gets the line wrong.
- `--swap-seat-back`: flip the seat and back assignment if the auto-guess came out
  the wrong way round.
- `--fabric-roughness` / `--other-roughness`: fallback roughness when there is no
  reference (defaults 0.98 fabric, 0.75 other - matte, cloth-like and satin
  plastic respectively).
- `--measure-only`: skip all edits, just import and print the height. Use this
  when the user only asks how tall a chair is.

### Several files at once

The script does one chair per run - it takes a single `--src` and a single
`--reference`. When the user hands over a batch, sort and pair the files before
running, then run the script once per FBX:

- **Every `.fbx` is an input to fix. Every `.glb`/`.gltf` is a reference, never
  an output.** A glTF already carries the correct matte materials; that is the
  whole reason it makes a good reference and a poor thing to "repair". So never
  run the script with a `.glb` as `--src`.
- **Pair each FBX with the GLB that shares its name.** `Office Chair A.fbx` goes
  with `Office Chair A.glb`. Match on the filename stem, ignoring differences
  like a trailing `Fix`, `_v3`, or `render`.
- **If the pairing is not obvious** - names that don't line up, more FBX than GLB,
  or one GLB that seems meant for several chairs - stop and ask the user which
  GLB references which FBX rather than guessing. A wrong reference quietly bakes
  the wrong finish in.
- **An FBX with no matching GLB** still gets prepped - just run it without
  `--reference` (it falls back to the default matte values) and say so.

Report each chair's result and height separately so nothing gets conflated.

The script prints machine-readable lines - relay them, don't re-derive:

```
RESULT_FABRIC_RENAMED_FROM: Fabric plain anthracite
RESULT_STRIPPED_IMAGES: ['stoff_schwarz_01_col.jpg']
RESULT_SPLIT: {'kind': 'auto (height+flatness)', 'seat': 4992, 'back': 13582}
RESULT_MATERIALS: [['Fabric plain anthracite', 0.98], ['Plastic matt black', 0.75]]
RESULT_OUTPUT: /path/to/Chair FABRIC.fbx
RESULT_DIMS_M: [0.5761, 0.6259, 1.1105]
HEIGHT_CM: 111.1
```

`RESULT_MATERIALS` lists the finish applied per material at matte time, before
the split renames them - so the fabric still shows under its original name there.
The actual output carries `SEAT FABRIC` and `BACK FABRIC` (verify below).
`RESULT_SPLIT` is `None` only with `--no-split`. Always tell the user the seat and
back face counts from `RESULT_SPLIT` so they can sanity-check the divide.

## Always report the height

Whatever the user asked for, end by telling them the chair's height in cm (and m
if it helps), read from the `HEIGHT_CM` / `RESULT_DIMS_M` lines. It's cheap, it's
what they usually need next for the listing, and the script always computes it -
so there's no reason to leave it out. If they only asked for the height, run with
`--measure-only`.

## Verify before you report done

The transform is silent-failure-prone, so confirm rather than assume:

1. **Scale**: re-import the output and check every object's `scale` and the
   world dims match the source. `HEIGHT_CM` on the output should equal the source
   (run `--measure-only` on the original to compare). A 100x or 0.01x difference
   means the export scale is wrong - stop and investigate, don't ship it.
2. **Fabric contract**: the output has materials named exactly `SEAT FABRIC` and
   `BACK FABRIC` (or `FABRIC` under `--no-split`), each with no base-colour image
   but with its normal/weave map intact.
3. **Split is right way round**: check the Z range of the faces on each fabric
   material - `SEAT FABRIC` faces should sit low, `BACK FABRIC` faces high. If
   they are swapped, re-run with `--swap-seat-back`. This is the check most worth
   doing by eye, because a plausible-but-wrong split still exports cleanly.
4. **Finish**: every material Metalness 0; fabric roughness high (~0.98), others
   matching the reference (or ~0.75).

A quick re-inspection script pattern (adapt as needed):

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python-expr "
import bpy
bpy.ops.import_scene.fbx(filepath='<OUTPUT>.fbx')
for o in bpy.data.objects:
    if o.type=='MESH':
        print(o.name, 'scale', tuple(round(s,4) for s in o.scale),
              [ms.material.name for ms in o.material_slots])
"
```

## Cleaning up

Importing an FBX with embedded textures can leave a `<name>.fbm/` extraction
folder beside the file. It's a throwaway artifact (textures live embedded in the
`.fbx`); remove any `*.fbm` folders you created before finishing.

## Notes and gotchas

- **Only chairs?** No - it works on any furniture FBX with one upholstery
  material and solid-colour hard parts. The "fabric = the material with a
  base-colour image" heuristic is what generalises it. Multiple fabric materials
  need `--fabric-material` (run once per fabric, or extend the script).
- **Why keep the normal map?** The swatch only replaces base colour; the weave
  normal map is never touched by the shop, so keeping it makes both photo swatches
  and flat-colour swatches read as real cloth rather than flat plastic.
- **Blender 5.x sockets**: the specular input is `Specular IOR Level`; older
  Blender called it `Specular`. The script tries both, so it survives either.
