#!/usr/bin/env node
// Read the Dynamic Office Seating clearance collection and write one row per
// clearance VARIANT.
//
// Two endpoints, because neither alone is enough:
//   /collections/<handle>/products.json  - paginated list of the collection.
//     Public, no cookie. Does NOT carry barcodes.
//   /products/<handle>.js                - one product, and this one DOES carry
//     `barcode` per variant. Barcode is the only identifier the two catalogues
//     genuinely share, so it is worth the extra request per product.
//
// Neither endpoint prints the supplier's own product code (OP000115 and such),
// but the shop's image filenames are named after it, so the code is parsed back
// out of the featured image. That is a convention, not a contract - it is used
// as a SECOND-choice key and never on its own to overwrite a price when the
// barcode disagrees.
//
// Usage:
//   node fetch-clearance.mjs [--collection clearance] [--out clearance.json]

import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const HOST = 'https://dynamicofficeseating.co.uk'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

const collection = arg('collection', 'clearance')
const out = arg('out', 'clearance.json')

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'deskwell-clearance-check' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json()
}

/** Supplier code as it appears at the front of an uploaded image filename:
 * OP000115_1_<shopify-uuid>.jpg -> OP000115. Anchored at the start so a uuid
 * that happens to contain letters-then-digits cannot be mistaken for a code. */
function codeFromImage(src) {
  if (!src) return null
  const file = basename(String(src).split('?')[0]).toUpperCase()
  const m = /^([A-Z]{2,4}[0-9]{4,7})(?![0-9])/.exec(file)
  return m ? m[1] : null
}

const listed = []
for (let page = 1; page <= 20; page += 1) {
  const data = await getJson(`${HOST}/collections/${collection}/products.json?limit=250&page=${page}`)
  const batch = data.products ?? []
  if (batch.length === 0) break
  listed.push(...batch)
  if (batch.length < 250) break
}

if (listed.length === 0) {
  throw new Error(
    `No products came back for /collections/${collection}. Either the collection was renamed or it has been emptied - check the page in a browser before assuming the sale is over.`,
  )
}

const rows = []
for (const listing of listed) {
  const full = await getJson(`${HOST}/products/${listing.handle}.js`)

  // Codes seen anywhere on the listing. Used only as a last resort, and only
  // when the listing is unambiguous (one variant, one code).
  const listingCodes = new Set()
  for (const media of full.media ?? []) {
    const code = codeFromImage(media?.preview_image?.src)
    if (code) listingCodes.add(code)
  }

  for (const variant of full.variants ?? []) {
    const variantCode = codeFromImage(variant?.featured_image?.src)
    const soleListingCode =
      !variantCode && full.variants.length === 1 && listingCodes.size === 1
        ? [...listingCodes][0]
        : null

    rows.push({
      handle: full.handle,
      product: full.title,
      variant: variant.title,
      clearanceSku: variant.sku ?? null,
      barcode: variant.barcode || null,
      // Shopify money fields are integer pence.
      now: variant.price / 100,
      was: variant.compare_at_price ? variant.compare_at_price / 100 : null,
      available: variant.available !== false,
      supplierCode: variantCode ?? soleListingCode,
      codeSource: variantCode ? 'variant-image' : soleListingCode ? 'listing-image' : null,
      url: `${HOST}/products/${full.handle}?variant=${variant.id}`,
    })
  }
}

writeFileSync(out, `${JSON.stringify({ collection, fetchedAt: new Date().toISOString(), rows }, null, 2)}\n`)

const withBarcode = rows.filter((r) => r.barcode).length
const withCode = rows.filter((r) => r.supplierCode).length
console.log(
  `${listed.length} listings, ${rows.length} variants -> ${out}\n` +
    `  barcode present: ${withBarcode}\n` +
    `  supplier code recovered from image name: ${withCode}\n` +
    `  neither: ${rows.filter((r) => !r.barcode && !r.supplierCode).length}`,
)
