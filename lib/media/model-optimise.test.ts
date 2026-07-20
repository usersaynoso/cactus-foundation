import { describe, expect, it } from 'vitest'
import { Document, NodeIO } from '@gltf-transform/core'
import sharp from 'sharp'
import { optimiseModelBytes } from '@/lib/media/model-optimise'

// A model optimise is the kind of change nothing else in the suite would notice
// going wrong: the file still parses, the page still renders, and the only
// symptom of a broken pass is a shopper's chair quietly losing its texture or
// growing a seam. So these tests assert the two things the feature actually
// promises - that the file gets smaller, and that what is in it survives.

// Build a GLB with something for every pass to do: duplicated vertices for weld,
// an oversized colour map and normal map for the texture passes, and an orphaned
// material and texture for prune.
async function buildTestModel(): Promise<Buffer> {
  const doc = new Document()
  const buffer = doc.createBuffer()

  const N = 60
  const positions: number[] = []
  const uvs: number[] = []
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u = i / N
      const v = j / N
      const x = Math.cos(u * Math.PI * 2) * (1 + 0.3 * Math.sin(v * Math.PI * 6))
      const y = v * 2 - 1
      const z = Math.sin(u * Math.PI * 2) * (1 + 0.3 * Math.sin(v * Math.PI * 6))
      // Three copies of each vertex, so weld() has identical ones to merge.
      for (let k = 0; k < 3; k++) {
        positions.push(x, y, z)
        uvs.push(u, v)
      }
    }
  }

  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer)
  const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer)

  const noise = (size: number, seed: number): Promise<Buffer> => {
    const px = Buffer.alloc(size * size * 3)
    for (let i = 0; i < px.length; i++) px[i] = Math.floor(Math.sin(i * seed) * 127 + 128) & 0xff
    return sharp(px, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer()
  }

  const base = doc.createTexture('base').setMimeType('image/png').setImage(await noise(4096, 0.7))
  const normal = doc.createTexture('normal').setMimeType('image/png').setImage(await noise(4096, 1.3))

  const material = doc.createMaterial('body').setBaseColorTexture(base).setNormalTexture(normal)
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('TEXCOORD_0', uv).setMaterial(material)
  doc.createScene('scene').addChild(doc.createNode('body').setMesh(doc.createMesh('body').addPrimitive(prim)))

  doc.createMaterial('leftover-from-a-deleted-object')
  doc.createTexture('unreferenced').setMimeType('image/png').setImage(await noise(1024, 2.1))

  return Buffer.from(await new NodeIO().writeBinary(doc))
}

describe('optimiseModelBytes', () => {
  it('refuses anything that is not a GLB, without throwing', async () => {
    for (const type of ['model/gltf+json', 'model/obj', 'model/x-fbx', 'model/x-3ds']) {
      const result = await optimiseModelBytes(Buffer.from('not a glb'), type)
      expect(result.optimised).toBe(false)
      if (!result.optimised) expect(result.reason).toBe('Only GLB models can be optimised')
    }
  })

  it('makes a GLB substantially smaller', async () => {
    const input = await buildTestModel()
    const result = await optimiseModelBytes(input, 'model/gltf-binary')

    expect(result.optimised).toBe(true)
    if (!result.optimised) return

    expect(result.before).toBe(input.length)
    expect(result.after).toBe(result.bytes.length)
    expect(result.after).toBeLessThan(result.before)
  }, 120_000)

  it('keeps the material name, its texture slots and its geometry', async () => {
    const input = await buildTestModel()
    const result = await optimiseModelBytes(input, 'model/gltf-binary')
    expect(result.optimised).toBe(true)
    if (!result.optimised) return

    // Read the output back with the same decoders the browser has, which is the
    // real assertion: a file that cannot be re-opened is not an optimised file.
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
    const { MeshoptDecoder } = await import('meshoptimizer')
    await MeshoptDecoder.ready
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    const doc = await io.readBinary(new Uint8Array(result.bytes))

    // The material NAME is the contract the fabric configurator matches on (see
    // the viewer's applyFabricPaint). Losing it would leave every configured
    // product silently unpaintable, with nothing failing until a shopper tried.
    const materials = doc.getRoot().listMaterials()
    const body = materials.find((m) => m.getName() === 'body')
    expect(body).toBeDefined()
    expect(body?.getBaseColorTexture()).not.toBeNull()
    expect(body?.getNormalTexture()).not.toBeNull()

    // prune() should have taken the orphans with it and left the real one.
    expect(materials.map((m) => m.getName())).not.toContain('leftover-from-a-deleted-object')

    // The mesh still has its geometry, and weld() has indexed it.
    const prim = doc.getRoot().listMeshes()[0]?.listPrimitives()[0]
    expect(prim).toBeDefined()
    expect(prim?.getAttribute('POSITION')?.getCount()).toBeGreaterThan(0)
    expect(prim?.getAttribute('TEXCOORD_0')).not.toBeNull()
  }, 120_000)

  it('caps texture size at 2048 and re-encodes to WebP', async () => {
    const input = await buildTestModel()
    const result = await optimiseModelBytes(input, 'model/gltf-binary')
    expect(result.optimised).toBe(true)
    if (!result.optimised) return

    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
    const { MeshoptDecoder } = await import('meshoptimizer')
    await MeshoptDecoder.ready
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    const doc = await io.readBinary(new Uint8Array(result.bytes))

    for (const texture of doc.getRoot().listTextures()) {
      expect(texture.getMimeType()).toBe('image/webp')
      const size = texture.getSize()
      expect(size).not.toBeNull()
      if (!size) continue
      expect(Math.max(size[0], size[1])).toBeLessThanOrEqual(2048)
    }
  }, 120_000)

  it('reports a model it cannot improve rather than growing it', async () => {
    const input = await buildTestModel()
    const first = await optimiseModelBytes(input, 'model/gltf-binary')
    expect(first.optimised).toBe(true)
    if (!first.optimised) return

    // Running the same passes over already-optimised bytes must not hand back a
    // bigger file as an "improvement" - the caller writes whatever it is given.
    const second = await optimiseModelBytes(first.bytes, 'model/gltf-binary')
    if (second.optimised) {
      expect(second.after).toBeLessThan(second.before)
    } else {
      expect(second.reason).toBe('Already as small as it gets')
    }
  }, 180_000)
})
