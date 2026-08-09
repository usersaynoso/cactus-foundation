import { describe, expect, it } from 'vitest'
import { Document, NodeIO } from '@gltf-transform/core'
import sharp from 'sharp'
import { pinStraddlingPalettes } from '@/lib/media/model-palette-pin'
import { optimiseModelBytes } from '@/lib/media/model-optimise'

// The fault these tests are about is invisible to every other check in the
// suite: the file parses, the model loads, the shopper's finish is the right
// picture at the right scale - and the surface is striped with shine, because a
// 32x4 catalogue palette is being read across instead of at one pixel. It got
// onto four live desks and was found by eye. So the assertions here are about
// the two states that matter: a straddling palette is replaced by the flat value
// it stood for, and a palette used properly is not touched at all.

/** pCon's own shape: a tiny atlas of flat values, one pixel per part. */
function palette(pixels: [number, number, number][], width: number, height: number): Promise<Buffer> {
  const px = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = pixels[i % pixels.length] ?? [0, 0, 0]
    px[i * 3] = r
    px[i * 3 + 1] = g
    px[i * 3 + 2] = b
  }
  return sharp(px, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

/**
 * A grid of quads on one material, with a palette in `slot`.
 *
 * `spread` decides which of the two states the model is in: `'cell'` parks all
 * three corners of every face on one palette pixel, which is the supplier's
 * intended use; `'sweep'` gives the faces real UVs running across the whole
 * atlas, which is what re-projecting a part for finish tiling does to them.
 */
async function buildPaletteModel(opts: {
  slot: 'metallicRoughness' | 'baseColor'
  spread: 'cell' | 'sweep'
  pixels: [number, number, number][]
}): Promise<Document> {
  const doc = new Document()
  const buffer = doc.createBuffer()

  const N = 8
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const base = positions.length / 3
      // One flat quad per grid cell, four corners.
      positions.push(i, j, 0, i + 1, j, 0, i + 1, j + 1, 0, i, j + 1, 0)
      if (opts.spread === 'cell') {
        // Every corner on the same pixel: the palette working as designed.
        const u = (i + 0.5) / N
        const v = (j + 0.5) / N
        for (let k = 0; k < 4; k++) uvs.push(u, v)
      } else {
        // A real unwrap, spanning the atlas many times over.
        uvs.push(i, j, i + 1, j, i + 1, j + 1, i, j + 1)
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer)
  const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer)
  const idx = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer)

  const texture = doc.createTexture('PaletteMetallicRoughness')
    .setMimeType('image/png')
    .setImage(await palette(opts.pixels, 32, 4))

  const material = doc.createMaterial('Desk Top')
  if (opts.slot === 'metallicRoughness') material.setMetallicRoughnessTexture(texture)
  else material.setBaseColorTexture(texture)

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', pos)
    .setAttribute('TEXCOORD_0', uv)
    .setIndices(idx)
    .setMaterial(material)
  doc.createScene('scene').addChild(doc.createNode('top').setMesh(doc.createMesh('top').addPrimitive(prim)))

  return doc
}

describe('pinStraddlingPalettes', () => {
  it('unbinds a straddling metallicRoughness palette and pins the value it stood for', async () => {
    // One shade throughout, so the pinned factors are predictable whichever cell
    // wins the vote: green 179 is roughness, blue 0 is metalness - a matt
    // laminate, which is exactly what a desk top is.
    const doc = await buildPaletteModel({ slot: 'metallicRoughness', spread: 'sweep', pixels: [[0, 179, 0]] })

    const repaired = await pinStraddlingPalettes(doc)

    expect(repaired).toBe(1)
    const material = doc.getRoot().listMaterials()[0]
    expect(material).toBeDefined()
    expect(material?.getMetallicRoughnessTexture()).toBeNull()
    expect(material?.getRoughnessFactor()).toBeCloseTo(179 / 255, 4)
    expect(material?.getMetallicFactor()).toBe(0)
  })

  it('pins a straddling baseColor palette as a linear colour factor', async () => {
    const doc = await buildPaletteModel({ slot: 'baseColor', spread: 'sweep', pixels: [[255, 128, 0]] })

    expect(await pinStraddlingPalettes(doc)).toBe(1)
    const material = doc.getRoot().listMaterials()[0]
    expect(material).toBeDefined()
    expect(material?.getBaseColorTexture()).toBeNull()
    // sRGB 255,128,0 in linear, which is what a glTF colour factor holds.
    const [r, g, b, a] = material?.getBaseColorFactor() ?? [0, 0, 0, 0]
    expect(r).toBeCloseTo(1, 4)
    expect(g).toBeCloseTo(0.2158, 3)
    expect(b).toBeCloseTo(0, 4)
    expect(a).toBe(1)
  })

  it('leaves a palette alone when every face reads one cell of it', async () => {
    // The state most of the library is in, and the case an aggregate-UV-span
    // test gets wrong: this material's UVs cover the whole atlas, and every
    // single face still reads one flat value.
    const doc = await buildPaletteModel({
      slot: 'metallicRoughness',
      spread: 'cell',
      pixels: [[0, 179, 0], [0, 255, 40], [0, 101, 3], [0, 158, 107]],
    })

    expect(await pinStraddlingPalettes(doc)).toBe(0)
    expect(doc.getRoot().listMaterials()[0]?.getMetallicRoughnessTexture()).not.toBeNull()
  })

  it('ignores a full-size map, which is meant to tile', async () => {
    const doc = await buildPaletteModel({ slot: 'baseColor', spread: 'sweep', pixels: [[200, 150, 100]] })
    // Swap the palette for a real texture at the same UVs: tiling a weave over a
    // surface is the normal thing to do and must not be "repaired" into a colour.
    const px = Buffer.alloc(256 * 256 * 3, 0x80)
    doc.getRoot().listTextures()[0]?.setImage(await sharp(px, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer())

    expect(await pinStraddlingPalettes(doc)).toBe(0)
    expect(doc.getRoot().listMaterials()[0]?.getBaseColorTexture()).not.toBeNull()
  })
})

describe('optimiseModelBytes with a straddling palette', () => {
  it('repairs the model on the way through, even if the file does not get smaller', async () => {
    const doc = await buildPaletteModel({ slot: 'metallicRoughness', spread: 'sweep', pixels: [[0, 179, 0]] })
    const input = Buffer.from(await new NodeIO().writeBinary(doc))

    const result = await optimiseModelBytes(input, 'model/gltf-binary')

    // A repaired file always comes back, because the alternative is the size
    // verdict quietly throwing the repair away.
    expect(result.optimised).toBe(true)
    if (!result.optimised) return

    // The optimiser writes meshopt, so a plain reader cannot re-open its output.
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
    const { MeshoptDecoder } = await import('meshoptimizer')
    await MeshoptDecoder.ready
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    const out = await io.readBinary(new Uint8Array(result.bytes))
    const material = out.getRoot().listMaterials().find((m) => m.getName() === 'Desk Top')
    expect(material?.getMetallicRoughnessTexture()).toBeNull()
    expect(material?.getRoughnessFactor()).toBeCloseTo(179 / 255, 3)
    // Nothing points at the palette any more, so prune takes the image with it.
    expect(out.getRoot().listTextures()).toHaveLength(0)
  })
})
