import sharp from 'sharp'
import type { Document, Transform } from '@gltf-transform/core'

// ---------------------------------------------------------------------------
// Optimise a 3D model's bytes: smaller download, same picture.
//
// A product model arrives here exactly as its authoring tool wrote it, and
// authoring tools optimise for the person editing the file, not the shopper
// downloading it. A typical export carries duplicate meshes, materials nothing
// references any more, uncompressed vertex buffers, and 4096px textures for a
// chair that is never drawn larger than a thousand pixels on the page. Tens of
// megabytes of it, fetched by every shopper who opens the product.
//
// Everything in here is chosen to be invisible in the render. Nothing decimates
// geometry, nothing re-topologises, nothing touches the material graph beyond
// removing parts of it that were already unreachable. The two passes that do
// change bytes on purpose - vertex compression and texture re-encoding - are
// both run at their conservative settings, described where they are applied.
// The rule for this file is that a shopper must not be able to tell it ran.
//
// GLB only, deliberately. A .gltf is a JSON file whose geometry and textures
// live in sibling .bin and .png files that were never uploaded with it (see
// modules/product-3d-views-for-shop/lib/formats.ts), so there is no complete
// model here to optimise - only the part of one. OBJ, FBX and 3DS have no
// equivalent compression to apply and would have to be converted to glTF first,
// which is a different job with different risks. Both are reported as a reason
// rather than attempted.
// ---------------------------------------------------------------------------

// The longest edge a texture is allowed to keep. A product viewer's canvas is a
// few hundred CSS pixels on a phone and around a thousand on a desktop, so a
// 4096px map is between four and eight times more texture than any shopper's
// screen can resolve - it costs download time and GPU memory to deliver detail
// the rasteriser then throws away. 2048 is deliberately generous rather than
// tight: it still holds up under the close zoom the viewer allows, which is the
// one case where a lower cap would show.
const MAX_TEXTURE_EDGE = 2048

// WebP quality for the two kinds of texture in a PBR material, which tolerate
// lossy encoding very differently.
//
// A baseColor or emissive map is a picture, and 85 is the usual "no visible
// artefacts" point for one - the same reasoning as the library's image optimise
// at 82, nudged up because a texture gets magnified across a surface rather than
// viewed at its own size.
//
// A normal, metallicRoughness or occlusion map is NOT a picture. Its pixels are
// numbers the shader does arithmetic on: a normal map's channels are a surface
// direction, and the block artefacts that are invisible in a photograph become
// visible banding in a reflection once that vector is bent by them. Those are
// encoded losslessly instead, which is still a real saving over the PNG they
// almost always arrive as, because WebP's lossless mode simply beats PNG's - and
// it is a byte-exact saving, with no channel value changed at all.
const COLOUR_TEXTURE_QUALITY = 85

// glTF texture slots, split by which of the two treatments above they get.
const COLOUR_SLOTS = ['baseColorTexture', 'emissiveTexture']
const DATA_SLOTS = ['normalTexture', 'metallicRoughnessTexture', 'occlusionTexture']

export type ModelOptimiseResult =
  | { optimised: false; reason: string; before?: number; after?: number }
  | { optimised: true; before: number; after: number; bytes: Buffer }

// The decoders and the encoder are WebAssembly modules that cost real time to
// instantiate and are safe to reuse, so each is built once per server process
// and shared. Held as the promise rather than the result so two models
// optimising at once share one instantiation rather than racing to build two -
// the same trick the viewer's loader cache uses, for the same reason. The bulk
// action runs six of these at a time, which is precisely when the race would
// otherwise happen.
let ioPromise: Promise<import('@gltf-transform/core').NodeIO> | null = null

async function getIO(): Promise<import('@gltf-transform/core').NodeIO> {
  if (!ioPromise) {
    const building = (async () => {
      const { NodeIO } = await import('@gltf-transform/core')
      const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
      const draco3d = await import('draco3d')
      const { MeshoptDecoder, MeshoptEncoder } = await import('meshoptimizer')

      await MeshoptDecoder.ready
      await MeshoptEncoder.ready

      // Every extension registered for READING, not because we intend to write
      // them all, but because an unregistered extension on an incoming file is a
      // hard parse failure rather than something skipped. An admin's export can
      // carry anything - sheen, transmission, variants, instancing - and refusing
      // to optimise a file because it uses a material feature we did not list
      // would read as "optimise is broken" rather than as a missing registration.
      //
      // The decoders are the other half of that: a model already compressed with
      // Draco or meshopt (Blender's "Compression" tick, gltfpack, most "optimise
      // my GLB" tools) cannot even be opened without one, and those files are
      // exactly the ones most likely to arrive here.
      return new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
          'draco3d.decoder': await draco3d.createDecoderModule(),
          'meshopt.decoder': MeshoptDecoder,
          'meshopt.encoder': MeshoptEncoder,
        })
    })()
    // Hold the promise so concurrent optimises share one instantiation, but
    // never cache a rejection: if the wasm fails to load once (a transient fault,
    // or a bad bundle fixed by the next deploy), a later call gets a fresh try
    // instead of every optimise on this warm process failing forever.
    building.catch(() => {
      if (ioPromise === building) ioPromise = null
    })
    ioPromise = building
  }
  return ioPromise
}

/**
 * Optimise GLB bytes. Returns the smaller file, or a reason it was left alone.
 *
 * Never throws for a file it simply cannot improve - a model that is already
 * tight comes back as `optimised: false` with a reason, which the caller records
 * so the file is not offered for optimising over and over. A genuinely corrupt
 * or unreadable file does throw, because that is a fault worth surfacing rather
 * than a verdict about the model.
 */
export async function optimiseModelBytes(input: Buffer, mimeType: string): Promise<ModelOptimiseResult> {
  if (mimeType !== 'model/gltf-binary') {
    return { optimised: false, reason: 'Only GLB models can be optimised' }
  }

  const io = await getIO()
  const { MeshoptEncoder } = await import('meshoptimizer')
  const { dedup, prune, weld, meshopt, textureCompress } = await import('@gltf-transform/functions')

  const document: Document = await io.readBinary(new Uint8Array(input))

  const transforms: Transform[] = [
    // Merge accessors, meshes, materials and textures that are byte-for-byte the
    // same thing stored twice. Exporters produce these constantly - a chair with
    // four identical legs commonly ships four copies of one leg's geometry - and
    // collapsing them changes nothing about what is drawn.
    dedup(),
    // Drop what nothing references: materials left behind by a deleted object,
    // textures no material points at, empty nodes, unused animation channels.
    // This is the pass that most often accounts for a surprising chunk of a file,
    // because an authoring session's dead ends all get written out.
    //
    // keepAttributes, though, against the library's default. Left to itself, prune
    // also deletes a vertex attribute nothing in the FILE uses - and its headline
    // example is "UVs without an assigned texture", which is precisely what a model
    // destined for the material configurator looks like: the shopper's finish is
    // painted onto the named material at runtime, so the uploaded GLB carries UVs
    // and a plain colour, and not one texture between them. Pruning those UVs is
    // silent and total. The model still loads, still spins, still paints its
    // colours; but every texture-scale measurement the configurator takes off the
    // mesh reads zero, so every material reports "not measured" however many times
    // the admin presses Detect, and the shop draws every weave untiled. The bytes
    // saved were never the point - a UV set is small - and the file cannot be
    // recovered afterwards, because the optimised model is written back over its
    // own key.
    prune({ keepAttributes: true }),
    // Merge vertices that are bitwise identical across every attribute, so an
    // indexed primitive stores each one once. This is a deduplication rather than
    // a simplification - it has no tolerance to set and cannot move a surface -
    // and it also lets the GPU's vertex cache do its job.
    weld(),

    // Textures, in two passes because the two kinds tolerate loss differently.
    // See the constants above for why. Both passes cap the longest edge; a
    // texture already at or under the cap is left at its own size rather than
    // being scaled up to it.
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: new RegExp(`^(${COLOUR_SLOTS.join('|')})$`),
      quality: COLOUR_TEXTURE_QUALITY,
      resize: [MAX_TEXTURE_EDGE, MAX_TEXTURE_EDGE],
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: new RegExp(`^(${DATA_SLOTS.join('|')})$`),
      lossless: true,
      resize: [MAX_TEXTURE_EDGE, MAX_TEXTURE_EDGE],
    }),

    // Vertex compression, and the single biggest saving on a geometry-heavy
    // model. 'medium' rather than 'high' on purpose: both quantise attributes to
    // fixed-point, and 'high' uses fewer bits, which on a large model can show as
    // faint faceting on a surface that should be smooth. 'medium' is the setting
    // that is understood to be visually lossless, and it still typically takes
    // vertex data to a third of its size.
    //
    // Chosen over Draco for the same reason the viewer prefers it: meshopt
    // decodes far faster in the browser and its decoder is bundled with three
    // (see the viewer's load-model.ts), so a compressed file costs the shopper
    // almost nothing to open. Draco trades browser time for a slightly smaller
    // file, which is the wrong way round when the point is a fast product page.
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  ]

  await document.transform(...transforms)

  const bytes = Buffer.from(await io.writeBinary(document))
  const before = input.length
  const after = bytes.length

  // A file that came back the same size or larger was already optimised, by us
  // or by the tool that exported it. Reported rather than written, so the caller
  // keeps the original bytes and simply stops offering the action.
  if (after >= before) return { optimised: false, reason: 'Already as small as it gets', before, after }

  return { optimised: true, before, after, bytes }
}
