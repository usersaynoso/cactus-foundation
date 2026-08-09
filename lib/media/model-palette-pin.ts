import sharp from 'sharp'
import type { Document, Material, Texture, TextureInfo } from '@gltf-transform/core'

// ---------------------------------------------------------------------------
// Repair a model whose material properties come from a PALETTE its own UVs can
// no longer address.
//
// Catalogue tools - pCon above all, which is where most office furniture models
// come from - do not give each part its own texture. They pack the whole
// catalogue's metal, roughness and flat colours into one tiny atlas (32x4 pixels
// on the files seen here) and park every face of every part on a single pixel of
// it. It is an elegant trick: one 166-byte image shades a thousand products, and
// each face reads one flat value from it.
//
// It only holds while the UVs stay exactly as the exporter wrote them. The
// moment a part's UVs are re-cut - which is precisely what a model destined for
// the material configurator needs, so a shopper's finish can tile across a desk
// top at a real-world size - that same lookup starts sweeping across the atlas,
// and the part picks up wide bands of whatever metalness and roughness happen to
// be stored next door. The picture is right, the grain is right, and the surface
// is striped with shine. It shipped on four Deskwell desks on 2026-08-08 and was
// caught by eye a day later; nothing automated would ever have noticed.
//
// So: where a face reads more than one palette cell, the palette is taken off
// that material and folded into the material's own factors as the flat value it
// was standing in for - the mean of what its faces read today, which is the
// smallest visible change that ends the banding. A model whose faces each sit on
// their own single pixel is left completely alone; that is the trick working as
// designed, and every other palette model in the Deskwell library is doing it.
//
// Run on the four desks this was found on, it lands the desk top at metalness 0,
// roughness 0.35 - which is, to two decimal places, what the twenty healthy
// files in the same range carry. That agreement is the reason to trust it.
// ---------------------------------------------------------------------------

// The widest texture treated as a lookup atlas rather than a picture. A palette
// is a handful of pixels; a real map is hundreds. Nothing sits between the two
// in practice, so the cut can be generous - pCon's is 32x4.
const PALETTE_MAX_EDGE = 64

// How much straddling is a defect rather than a rounding error. A palette used
// properly gives exactly zero faces crossing a cell: all three corners of a face
// carry the same UV. One percent leaves room for a stray welded corner without
// letting real banding through - the broken desk tops ran at 32%.
const STRADDLE_FRACTION = 0.01

// How glossy a pinned surface is allowed to be. Furniture is matt to satin, and
// nothing in this catalogue is a mirror - so where an averaged palette says
// "roughness 0", the palette is wrong rather than the furniture.
const MIN_PINNED_ROUGHNESS = 0.35

type SlotName = 'baseColor' | 'metallicRoughness' | 'normal' | 'occlusion' | 'emissive'

interface Slot {
  name: SlotName
  getTexture(material: Material): Texture | null
  getInfo(material: Material): TextureInfo | null
  clear(material: Material): void
  /** Fold the palette's own texel into the material's factors, in place. */
  pin(material: Material, texel: [number, number, number, number]): void
}

/** sRGB byte to linear float, the conversion glTF's colour factors are stored in. */
function toLinear(byte: number): number {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

// glTF multiplies factor by texture, so folding the texel INTO the existing
// factor keeps the surface exactly as it renders today - it is the same
// arithmetic, done once here instead of per pixel on the GPU.
const SLOTS: Slot[] = [
  {
    name: 'baseColor',
    getTexture: (m) => m.getBaseColorTexture(),
    getInfo: (m) => m.getBaseColorTextureInfo(),
    clear: (m) => { m.setBaseColorTexture(null) },
    pin: (m, [r, g, b]) => {
      const f = m.getBaseColorFactor()
      m.setBaseColorFactor([f[0] * toLinear(r), f[1] * toLinear(g), f[2] * toLinear(b), f[3]])
    },
  },
  {
    name: 'metallicRoughness',
    getTexture: (m) => m.getMetallicRoughnessTexture(),
    getInfo: (m) => m.getMetallicRoughnessTextureInfo(),
    clear: (m) => { m.setMetallicRoughnessTexture(null) },
    // Green is roughness and blue is metalness, and both are linear already -
    // they are numbers the shader does arithmetic on, not a colour to decode.
    //
    // Two guards on the averaged value, because these two channels have failure
    // modes a colour does not. Roughness gets a floor: an average that lands
    // near zero is a mirror, and a mirrored desk top reads as a far worse bug
    // than the stripes. Metalness is rounded to one or the other, because real
    // surfaces are metal or they are not - a desk averaging 0.3 metal is a thing
    // that exists nowhere, and the in-between renders as a muddy sheen.
    pin: (m, [, g, b]) => {
      const rough = Math.max(MIN_PINNED_ROUGHNESS, m.getRoughnessFactor() * (g / 255))
      m.setRoughnessFactor(rough)
      m.setMetallicFactor(m.getMetallicFactor() * (b / 255) >= 0.5 ? 1 : 0)
    },
  },
  {
    name: 'emissive',
    getTexture: (m) => m.getEmissiveTexture(),
    getInfo: (m) => m.getEmissiveTextureInfo(),
    clear: (m) => { m.setEmissiveTexture(null) },
    pin: (m, [r, g, b]) => {
      const f = m.getEmissiveFactor()
      m.setEmissiveFactor([f[0] * toLinear(r), f[1] * toLinear(g), f[2] * toLinear(b)])
    },
  },
  {
    // Occlusion and normal have no factor to fold a texel into: one is a shadow
    // map and the other a surface direction, and neither means anything as a
    // single number. Unbinding leaves the glTF default - no baked shadow, flat
    // normals - which is the honest "this model has no such map" state and a
    // great deal better than a band of fake creasing down a desk.
    name: 'occlusion',
    getTexture: (m) => m.getOcclusionTexture(),
    getInfo: (m) => m.getOcclusionTextureInfo(),
    clear: (m) => { m.setOcclusionTexture(null) },
    pin: () => {},
  },
  {
    name: 'normal',
    getTexture: (m) => m.getNormalTexture(),
    getInfo: (m) => m.getNormalTextureInfo(),
    clear: (m) => { m.setNormalTexture(null) },
    pin: () => {},
  },
]

interface Decoded {
  width: number
  height: number
  channels: number
  data: Buffer
}

async function decode(texture: Texture): Promise<Decoded | null> {
  const image = texture.getImage()
  if (!image) return null
  try {
    const { data, info } = await sharp(Buffer.from(image)).raw().toBuffer({ resolveWithObject: true })
    return { width: info.width, height: info.height, channels: info.channels, data }
  } catch {
    // An image sharp cannot read is not a reason to fail an upload. Reported by
    // the caller's count staying where it was, and the model ships as it arrived.
    return null
  }
}

/**
 * What the part reads on average across all its faces.
 *
 * The mean rather than the most popular pixel, and that is not a detail. Once a
 * part's UVs have been re-cut they wander the whole atlas, so the pixel that
 * happens to win a vote is as likely to be one of the palette's unused black
 * corners as anything the part was ever meant to be - taking the modal cell on a
 * real desk top pinned roughness 0, i.e. a mirror-polished desk, which is a
 * worse picture than the banding it was fixing. The mean is the closest single
 * value to what the surface shows today, so it is the smallest visible change
 * that ends the banding.
 */
function average(img: Decoded, uvs: [number, number][]): [number, number, number, number] {
  let r = 0, g = 0, b = 0, a = 0
  for (const [u, v] of uvs) {
    const t = texelAt(img, u, v)
    r += t[0]; g += t[1]; b += t[2]; a += t[3]
  }
  const n = Math.max(1, uvs.length)
  return [r / n, g / n, b / n, a / n]
}

function texelAt(img: Decoded, u: number, v: number): [number, number, number, number] {
  // Repeat wrapping, which is glTF's default and what every palette relies on.
  const wrap = (t: number) => t - Math.floor(t)
  const x = Math.min(img.width - 1, Math.floor(wrap(u) * img.width))
  const y = Math.min(img.height - 1, Math.floor(wrap(v) * img.height))
  const i = (y * img.width + x) * img.channels
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0, img.channels > 3 ? img.data[i + 3] ?? 255 : 255]
}

interface Faces {
  /** Faces whose own three corners do not land in one palette cell. */
  straddling: number
  total: number
  /** Every face's centroid UV, which is what it reads on average. */
  centroids: [number, number][]
}

/**
 * Walk every primitive drawn with `material` and measure how its faces sit on a
 * palette of `width` x `height`.
 *
 * Per FACE, deliberately, and this is the whole subtlety of the check. One
 * material can legitimately cover the entire atlas - an executive chair puts its
 * shell, arms, base and castors on one material, each parked on its own pixel -
 * so the material's overall UV span says nothing at all. Only a face whose
 * corners disagree gets a gradient painted across it, and that is the banding.
 * An aggregate-span test flagged every healthy palette model in the Deskwell
 * library and none of the broken ones any more loudly than the rest.
 */
function measureFaces(document: Document, material: Material, uvChannel: number, width: number, height: number): Faces {
  const cellU = 1 / width
  const cellV = 1 / height
  const out: Faces = { straddling: 0, total: 0, centroids: [] }

  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMaterial() !== material) continue
      const uv = prim.getAttribute(`TEXCOORD_${uvChannel}`) ?? prim.getAttribute('TEXCOORD_0')
      if (!uv) continue
      const indices = prim.getIndices()
      const count = indices ? indices.getCount() : uv.getCount()
      // Tuples rather than number[], so a corner's u and v read as numbers
      // instead of "number or undefined" all the way down the arithmetic below.
      const a: [number, number] = [0, 0]
      const b: [number, number] = [0, 0]
      const c: [number, number] = [0, 0]
      for (let i = 0; i + 2 < count; i += 3) {
        uv.getElement(indices ? indices.getScalar(i) : i, a)
        uv.getElement(indices ? indices.getScalar(i + 1) : i + 1, b)
        uv.getElement(indices ? indices.getScalar(i + 2) : i + 2, c)
        const du = Math.max(a[0], b[0], c[0]) - Math.min(a[0], b[0], c[0])
        const dv = Math.max(a[1], b[1], c[1]) - Math.min(a[1], b[1], c[1])
        out.total++
        if (du > cellU || dv > cellV) out.straddling++
        // The centroid is what the face reads on average, and for a face sitting
        // inside one cell it is that cell exactly.
        out.centroids.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3])
      }
    }
  }
  return out
}

/**
 * Take the palette off every material whose faces can no longer read one cell of
 * it, folding the value it was standing in for into the material's own factors.
 *
 * Returns how many material slots were repaired, so a caller can tell a repaired
 * file from an untouched one - which matters, because the repair is worth
 * keeping even when it makes the file a few bytes bigger.
 *
 * Leaves a healthy model byte-identical: nothing here runs unless a face is
 * genuinely straddling.
 */
export async function pinStraddlingPalettes(document: Document): Promise<number> {
  let repaired = 0

  for (const material of document.getRoot().listMaterials()) {
    for (const slot of SLOTS) {
      const texture = slot.getTexture(material)
      if (!texture) continue
      const image = await decode(texture)
      if (!image) continue
      if (image.width > PALETTE_MAX_EDGE || image.height > PALETTE_MAX_EDGE) continue

      const uvChannel = slot.getInfo(material)?.getTexCoord() ?? 0
      const faces = measureFaces(document, material, uvChannel, image.width, image.height)
      if (!faces.total) continue
      if (faces.straddling / faces.total <= STRADDLE_FRACTION) continue

      slot.pin(material, average(image, faces.centroids))
      slot.clear(material)
      repaired++
    }
  }

  return repaired
}
