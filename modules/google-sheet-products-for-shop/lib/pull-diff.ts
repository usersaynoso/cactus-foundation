import { CSV_COLUMNS, type CsvColumn } from '@/modules/shop/lib/csv'
import { buildProductCsvRows, type ProductCsvRow } from '@/modules/shop/lib/csv-rows'
import { slugify } from '@/modules/shop/lib/slug'
import { getProductsBySlugs } from '@/modules/shop/lib/db/products'
import type { ShpProduct } from '@/modules/shop/lib/types'
import { buildTaxClassRefIndex } from '@/modules/shop/lib/db/tax-shipping'
import { getEditorPayloadsBatch, type VariantEditorRow } from '@/modules/shop-variations/lib/variants-service'
import { parseVariantImages } from '@/modules/shop-variations/lib/csv'
import { parseValueCell } from '@/modules/shop-variations/lib/value-cell'
import { resolveVariantFieldProviders } from '@/modules/shop-variations/lib/variant-field-providers'
import { resolveProductFieldProviders } from '@/modules/shop/lib/product-field-providers'
import {
  DESCRIPTION_PUCK_COLUMN,
  describeDescriptionPuck,
  describeDescriptionPuckCell,
  descriptionPuckChanged,
  readDescriptionPuckCell,
} from '@/modules/google-sheet-products-for-shop/lib/description-puck'
import type { SyncRowError } from '@/modules/google-sheet-products-for-shop/lib/types'
import { numbersMatch } from '@/modules/google-sheet-products-for-shop/lib/numeric-cell'

// Row-level diff of the sheet against the shop, shared by the Pull preview (what
// the confirm dialog lists) and the Pull itself (which rows actually get fed to
// the importers). One diff, two consumers - the dialog can never promise a
// different Pull than the one that runs.
//
// The point of the exercise: a Pull used to push EVERY row through the import
// engines, and a row that changes nothing still costs the same DB round trips as
// one that changes everything. On a big catalogue where the owner edited two
// cells, that made "pull two cells" take minutes. Rows this diff proves unchanged
// are dropped before the importers ever see them.
//
// Being wrong in the "unchanged" direction quietly loses an edit, so every
// comparison here is conservative: anything we cannot positively prove equal
// counts as changed and goes through the importer, which is merely slower, never
// wrong.

export type Change = { field: string; from: string; to: string }

export type ProductRowResult =
  | { row: number; kind: 'error'; reason: string }
  | { row: number; kind: 'create'; sku: string | null; name: string }
  | { row: number; kind: 'update'; sku: string | null; name: string; changes: Change[] }
  | { row: number; kind: 'unchanged'; sku: string | null; name: string }

// parentName/label ride along on 'update' rows so the preview can say WHICH
// variation a row touches, not just how many rows will change.
export type VariationRowResult = { row: number; kind: 'create' | 'update' | 'unchanged' | 'error'; reason?: string; parentName?: string; label?: string }

const VALID_STATUS = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED'])
const VALID_TYPE = new Set(['PHYSICAL', 'DIGITAL', 'SERVICE'])

// Columns whose stored value is an enum or boolean the importer reads
// case-insensitively, so "active" in the sheet equals ACTIVE in the shop.
const CASE_INSENSITIVE_COLUMNS: ReadonlySet<CsvColumn> = new Set<CsvColumn>([
  'type', 'status', 'track_inventory', 'is_pre_order', 'out_of_stock_behaviour', 'related_mode', 'upsell_mode',
])

// Same numeric-tolerant equality the eye would use: "9.9" and "9.90" are equal
// (Sheets strips trailing zeros off numeric cells), but two non-numbers compare
// as trimmed strings. Numbers compare through numbersMatch, the same float
// tolerance formula preservation uses on Push: a preserved "=B2*1.1" reads back
// as 122.10000000000002 where the shop holds 122.1, and an exact compare called
// every such row changed on every Pull, forever (importing it changes nothing -
// the database column's scale rounds the noise away again).
function sameValue(a: string, b: string): boolean {
  const ta = a.trim()
  const tb = b.trim()
  if (ta !== '' && tb !== '') {
    const na = Number(ta)
    const nb = Number(tb)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return numbersMatch(na, nb)
  }
  return ta === tb
}

function normHeader(grid: string[][]): string[] {
  return (grid[0] ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
}

// Diff every Products row against what a Push would write for the matching
// product - the exact same row builder, column for column. A column absent from
// the sheet is not part of the sync and is never compared (the importer leaves
// its field alone too). `results[i].row` is the grid row index (1-based data
// rows start at 1), so callers can filter the grid by it.
export async function diffProductRows(productsGrid: string[][]): Promise<ProductRowResult[]> {
  const header = normHeader(productsGrid)
  // The header as typed, for the record handed to product-field providers - they
  // match a column by its attribute name, so it must not be normalised.
  const rawHeader = (productsGrid[0] ?? []).map((h) => h.trim())
  // Only diff header columns that are ours; an owner's own extra columns are
  // invisible to the importer, so they must be invisible here too.
  const compared: Array<{ col: CsvColumn; idx: number }> = []
  for (const col of CSV_COLUMNS) {
    const idx = header.indexOf(col)
    if (idx >= 0) compared.push({ col, idx })
  }

  // Tax class round-trips as a code but an owner may type the name, so the diff
  // must resolve both sides the same way the importer does - otherwise "VAT" typed
  // over a "vat" code reads as a change on every Pull (harmless but noisy), or an
  // already-correct value reads as changed forever. Only loaded when the sheet
  // carries the column.
  const taxIndex = header.includes('tax_class') ? await buildTaxClassRefIndex() : null
  function taxClassEqual(from: string, to: string): boolean {
    const f = from.trim().toLowerCase()
    const t = to.trim().toLowerCase()
    if (f === t) return true
    if (!taxIndex) return false
    const fc = taxIndex.get(f)
    const tc = taxIndex.get(t)
    // Both resolve to the same class (name vs code) -> equal. A non-empty value
    // that resolves to nothing never equals the stored one, so the row goes
    // through and the importer reports the unknown tax class rather than the Pull
    // silently swallowing it.
    return !!fc && !!tc && fc.id === tc.id
  }

  const csvRows = await buildProductCsvRows()
  const bySku = new Map<string, ProductCsvRow>()
  const bySlug = new Map<string, ProductCsvRow>()
  for (const r of csvRows) {
    if (r.sku) bySku.set(r.sku, r)
    bySlug.set(r.slug, r)
  }

  // Product-field providers (product-level attributes) so a row whose only edit is
  // one of their columns is not mistaken for unchanged and dropped - the Products
  // twin of the variation-attribute handling in diffVariationRows. A provider that
  // owns columns but cannot diff them makes "unchanged" unprovable, so every
  // matched row is treated as an update: slower, never wrong.
  const allProviders = await resolveProductFieldProviders()
  const providers = allProviders.filter((p) => typeof p.provider.rowChanged === 'function')
  const undiffableProviders = allProviders.length > providers.length
  // The designed-description column is this module's own, so shop's CSV columns
  // above say nothing about it - it is compared separately, against the stored
  // Puck document, and only when the sheet actually carries the column.
  const designCol = header.indexOf(DESCRIPTION_PUCK_COLUMN)
  const productBySlug = allProviders.length > 0 || designCol >= 0
    ? await getProductsBySlugs(csvRows.map((r) => r.slug))
    : new Map<string, ShpProduct>()
  const providerCtx = new Map<string, unknown>()
  if (providers.length > 0) {
    const productIds = [...new Set([...productBySlug.values()].map((p) => p.id))]
    for (const { id, provider } of providers) {
      if (provider.beginImport) providerCtx.set(id, await provider.beginImport(productIds))
    }
  }

  const nameCol = header.indexOf('name')
  const typeCol = header.indexOf('type')
  const priceCol = header.indexOf('price')
  const statusCol = header.indexOf('status')
  const skuCol = header.indexOf('sku')
  const slugCol = header.indexOf('slug')

  const results: ProductRowResult[] = []
  for (let r = 1; r < productsGrid.length; r++) {
    const row = productsGrid[r] ?? []
    // A row blank across every pushed column is not a product - a spacer the
    // owner left, or a gap a v0.1.33 Push blanked in place before deletions
    // started removing the whole row. Skip it silently rather than reporting
    // "Missing name" on it forever. Owner columns are ignored here.
    if (compared.every(({ idx }) => (row[idx] ?? '').trim() === '')) continue
    const at = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '')
    const name = at(nameCol)
    const type = at(typeCol).toUpperCase()
    const priceRaw = at(priceCol)
    const statusRaw = at(statusCol)
    const sku = at(skuCol) || null

    if (!name) { results.push({ row: r, kind: 'error', reason: 'Missing name' }); continue }
    if (!VALID_TYPE.has(type)) { results.push({ row: r, kind: 'error', reason: `Invalid type "${at(typeCol)}"` }); continue }
    if (statusRaw && !VALID_STATUS.has(statusRaw.toUpperCase())) { results.push({ row: r, kind: 'error', reason: `Invalid status "${statusRaw}"` }); continue }

    // Same identity the import engine uses: SKU when the row carries one, else
    // the row's own slug (or the slug its name would derive).
    const rowSlug = slugify(at(slugCol) || name)
    const existing = sku ? bySku.get(sku) : bySlug.get(rowSlug)
    if (!existing) {
      if (!priceRaw || Number.isNaN(Number(priceRaw)) || Number(priceRaw) < 0) { results.push({ row: r, kind: 'error', reason: 'Missing or invalid price' }); continue }
      results.push({ row: r, kind: 'create', sku, name }); continue
    }

    const changes: Change[] = []
    for (const { col, idx } of compared) {
      const to = (row[idx] ?? '').trim()
      const from = existing[col]
      // A blank price on an EXISTING product is "leave it alone", not a change:
      // the price column is NOT NULL, so the importer keeps the stored value (a
      // variable product priced "from £x" carries no meaningful parent price).
      // Comparing it as a change would flag the row on every Pull, forever, and
      // the import would no-op it every time.
      const equal = col === 'price' && to === ''
        ? true
        : col === 'tax_class'
          ? taxClassEqual(from, to)
          : CASE_INSENSITIVE_COLUMNS.has(col)
            ? from.trim().toUpperCase() === to.toUpperCase()
            : sameValue(from, to)
      if (!equal) changes.push({ field: col, from, to })
    }

    // The designed description. Compared through the document itself, not the
    // cell text, so re-indented or re-ordered JSON is not read as an edit and
    // dragged through the importer on every Pull. Both sides are described
    // rather than printed: the confirm dialog lists changes inline and a whole
    // JSON document would bury the rest of the list.
    const product = productBySlug.get(existing.slug)
    if (designCol >= 0) {
      const cell = (row[designCol] ?? '').trim()
      if (!product) {
        // Cannot read what is stored, so cannot prove the cell matches it. The
        // write-back pass matches rows by its own query and may well apply this
        // one, so the row must not be dropped from the Pull.
        if (readDescriptionPuckCell(cell).kind !== 'skip') {
          changes.push({ field: DESCRIPTION_PUCK_COLUMN, from: 'unknown', to: describeDescriptionPuckCell(cell) })
        }
      } else if (descriptionPuckChanged(cell, product.descriptionPuck)) {
        changes.push({
          field: DESCRIPTION_PUCK_COLUMN,
          from: describeDescriptionPuck(product.descriptionPuck),
          to: describeDescriptionPuckCell(cell),
        })
      }
    }

    if (changes.length > 0) { results.push({ row: r, kind: 'update', sku, name, changes }); continue }

    // No fixed-column change: a product-level attribute column may still have been
    // edited. Ask each provider; only when none reports a change is the row truly
    // unchanged and safe to drop from the Pull.
    const productId = product?.id
    if (productId && (undiffableProviders || await providerRowChangedProduct(providers, productId, rawHeader, row, providerCtx))) {
      results.push({ row: r, kind: 'update', sku, name, changes: [{ field: 'attributes', from: '', to: 'edited in sheet' }] })
    } else {
      results.push({ row: r, kind: 'unchanged', sku, name })
    }
  }
  return results
}

// Would any product-field provider column change for this row? Builds the same
// header-keyed record the pass hands providers, then asks each provider's
// read-only rowChanged, stopping at the first that says yes.
async function providerRowChangedProduct(
  providers: Awaited<ReturnType<typeof resolveProductFieldProviders>>,
  productId: string,
  header: string[],
  cols: string[],
  providerCtx: Map<string, unknown>,
): Promise<boolean> {
  const rowRecord: Record<string, string> = {}
  header.forEach((h, i) => { rowRecord[h] = (cols[i] ?? '').trim() })
  for (const { id, provider } of providers) {
    if (await provider.rowChanged!(productId, rowRecord, providerCtx.get(id))) return true
  }
  return false
}

// Blank/non-numeric -> undefined, exactly as the importer's num() treats a cell.
function numCell(s: string): number | undefined {
  if (s.trim() === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

// Would the importer actually write anything for this row? Mirrors the changed
// check in upsertVariantForCombination plus its image compare, field for field.
function variationRowChanged(
  v: VariantEditorRow,
  cols: string[],
  col: { sku: number; saleSku: number; price: number; salePrice: number; rrp: number; tradePrice: number; costPrice: number; stock: number; barcode: number; supplier: number; weight: number; image: number },
): boolean {
  const cell = (i: number) => (cols[i] ?? '').trim()
  // Every number compares through numbersMatch, the float tolerance Push's
  // formula preservation uses: a preserved cost-price formula reads back as
  // 122.10000000000002 against a stored 122.1, and an exact compare flagged
  // every such row as an update on every Pull, forever.
  if (col.price >= 0) {
    const price = numCell(cell(col.price))
    if (price !== undefined && !numbersMatch(v.price, price)) return true
  }
  // The optional price types: a blank cell means "cleared" (null), matching the
  // importer, so an unset figure left blank in the sheet reads as unchanged.
  const priceCellChanged = (colIndex: number, current: number | null): boolean => {
    if (colIndex < 0) return false
    const raw = cell(colIndex)
    const next = raw === '' ? null : numCell(raw) ?? null
    if (next === null || current === null) return next !== current
    return !numbersMatch(next, current)
  }
  if (priceCellChanged(col.salePrice, v.salePrice)) return true
  if (priceCellChanged(col.rrp, v.retailPrice)) return true
  if (priceCellChanged(col.tradePrice, v.tradePrice)) return true
  if (priceCellChanged(col.costPrice, v.costPrice)) return true
  if (col.sku >= 0 && (v.sku ?? null) !== (cell(col.sku) || null)) return true
  if (col.saleSku >= 0 && (v.saleSku ?? null) !== (cell(col.saleSku) || null)) return true
  if (col.barcode >= 0 && (v.barcode ?? null) !== (cell(col.barcode) || null)) return true
  if (col.supplier >= 0 && (v.supplier ?? null) !== (cell(col.supplier) || null)) return true
  const numChanged = (a: number | null, b: number | null): boolean =>
    a === null || b === null ? a !== b : !numbersMatch(a, b)
  if (col.stock >= 0 && numChanged(v.stockCount ?? null, numCell(cell(col.stock)) ?? null)) return true
  if (col.weight >= 0 && numChanged(v.weight ?? null, numCell(cell(col.weight)) ?? null)) return true
  if (col.image >= 0) {
    const urls = parseVariantImages(cell(col.image))
    if (urls.length !== v.imageUrls.length || urls.some((u, i) => u !== v.imageUrls[i])) return true
  }
  return false
}

// Would any provider column change for this row? Builds the same header-keyed row
// record the importer hands providers, then asks each provider's read-only
// rowChanged, stopping at the first that says yes.
async function providerRowChanged(
  providers: Awaited<ReturnType<typeof resolveVariantFieldProviders>>,
  parentId: string,
  childProductId: string,
  header: string[],
  cols: string[],
  providerCtx: Map<string, unknown>,
): Promise<boolean> {
  const rowRecord: Record<string, string> = {}
  header.forEach((h, i) => { rowRecord[h] = (cols[i] ?? '').trim() })
  for (const { id, provider } of providers) {
    if (await provider.rowChanged!(parentId, childProductId, rowRecord, providerCtx.get(id))) return true
  }
  return false
}

// Diff every Variations row: create / update / unchanged / error, per grid row.
// Same resolution the importer uses (parent by slug, variant by its unordered
// option-value set), with module-provided columns (3D files, attributes) diffed
// through each provider's read-only rowChanged. A provider without rowChanged
// cannot be diffed, so its rows are never called unchanged - see below.
export async function diffVariationRows(grid: string[][]): Promise<VariationRowResult[]> {
  const results: VariationRowResult[] = []
  if (grid.length < 2) return results

  const header = (grid[0] ?? []).map((h) => h.trim())
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
  const slugCol = idx('Parent Slug')
  if (slugCol < 0) {
    results.push({ row: 0, kind: 'error', reason: 'Missing "Parent Slug" column' })
    return results
  }
  const optionPairs: Array<{ nameCol: number; valueCol: number }> = []
  for (let i = 1; ; i++) {
    const nameCol = idx(`Option ${i}`)
    const valueCol = idx(`Value ${i}`)
    if (nameCol < 0 || valueCol < 0) break
    optionPairs.push({ nameCol, valueCol })
  }
  const fieldCol = {
    sku: idx('Variant SKU'), saleSku: idx('Sale SKU'), price: idx('Price'),
    salePrice: idx('Sale Price'), rrp: idx('RRP'), tradePrice: idx('Trade Price'), costPrice: idx('Cost Price'),
    stock: idx('Stock'),
    barcode: idx('Barcode'), supplier: idx('Supplier'), weight: idx('Weight'), image: idx('Image'),
  }
  const idCol = idx('Variant ID')

  // The module's own columns, used to tell a genuine "no parent slug" error from a
  // fully-blank placeholder row a Push leaves for a deleted variant.
  const knownVarCols = [slugCol, idCol, ...optionPairs.flatMap((p) => [p.nameCol, p.valueCol]), ...Object.values(fieldCol)].filter((i) => i >= 0)

  const allProviders = await resolveVariantFieldProviders()
  const providers = allProviders.filter((p) => typeof p.provider.rowChanged === 'function')
  // A provider that owns columns but cannot say whether a row would change them
  // makes "unchanged" unprovable for every row - so nothing may be skipped, and
  // every matched row counts as an update. Slower, never wrong.
  const undiffableProviders = allProviders.length > providers.length

  const groups = new Map<string, Array<{ row: number; cols: string[] }>>()
  for (let r = 1; r < grid.length; r++) {
    const cols = grid[r] ?? []
    const slug = (cols[slugCol] ?? '').trim()
    if (!slug) {
      // Fully-blank row (a spacer, or a gap left by a v0.1.33 Push) - skip
      // silently. Only a row with real content but no slug is an error.
      if (knownVarCols.every((i) => (cols[i] ?? '').trim() === '')) continue
      results.push({ row: r, kind: 'error', reason: 'Missing parent slug' })
      continue
    }
    const list = groups.get(slug) ?? []
    list.push({ row: r, cols })
    groups.set(slug, list)
  }

  // Both the parent lookup and each parent's editor payload are resolved once for
  // every distinct slug in the sheet, rather than per group.
  const parentBySlug = await getProductsBySlugs([...groups.keys()])
  const payloadByParentId = await getEditorPayloadsBatch([...parentBySlug.values()])

  for (const [slug, rows] of groups) {
    const parent = parentBySlug.get(slug)
    if (!parent) {
      for (const gr of rows) results.push({ row: gr.row, kind: 'error', reason: `Parent product not found: ${slug}` })
      continue
    }
    const payload = payloadByParentId.get(parent.id)
    // Slug first, label as the legacy fallback - the same resolution order the
    // importer applies to a "(slug)Label" cell. Where duplicate labels exist the
    // label map keeps the first (position order), which is why the Push always
    // writes the slug.
    const valueIdByKey = new Map<string, string>()
    const valueIdBySlug = new Map<string, string>()
    const valueLabelById = new Map<string, string>()
    for (const o of payload?.options ?? []) {
      for (const v of o.values) {
        if (!valueIdByKey.has(`${o.name.toLowerCase()}|${v.label.toLowerCase()}`)) {
          valueIdByKey.set(`${o.name.toLowerCase()}|${v.label.toLowerCase()}`, v.id)
        }
        valueIdBySlug.set(`${o.name.toLowerCase()}|${v.slug}`, v.id)
        valueLabelById.set(v.id, v.label)
      }
    }
    const variantByKey = new Map((payload?.variants ?? []).map((v) => [[...v.optionValueIds].sort().join('|'), v]))
    const variantByChildId = new Map((payload?.variants ?? []).map((v) => [v.childProductId, v]))

    // Preload each provider's current state for this parent's existing children,
    // exactly as the importer does, so rowChanged diffs in memory rather than
    // per row.
    const providerCtx = new Map<string, unknown>()
    if (providers.length > 0) {
      const childIds = (payload?.variants ?? []).map((v) => v.childProductId)
      for (const { id, provider } of providers) {
        if (provider.beginImport) providerCtx.set(id, await provider.beginImport(parent.id, childIds))
      }
    }

    for (const gr of rows) {
      // Stable identity first: a row carrying a Variant ID names an exact
      // variant whatever its labels say. Renamed values used to read as brand
      // new combinations here (kind 'create'), while the deletion planner
      // offered the originals up for deletion - one rename, counted twice.
      const byId = idCol >= 0 ? variantByChildId.get(((gr.cols[idCol] ?? '')).trim()) : undefined
      const ids: string[] = []
      let allResolvable = true
      // A "(slug)Label" cell whose slug resolves but whose label differs from
      // the stored one is a value rename typed into the sheet. The row must
      // reach the importer even when every other cell matches, or the rename
      // would be filtered out as "unchanged" and never applied.
      let labelDrift = false
      for (const pair of optionPairs) {
        const optName = (gr.cols[pair.nameCol] ?? '').trim()
        const rawCell = (gr.cols[pair.valueCol] ?? '').trim()
        if (!optName || !rawCell) continue
        const parsed = parseValueCell(rawCell)
        const id = parsed.slug
          ? valueIdBySlug.get(`${optName.toLowerCase()}|${parsed.slug}`)
          : valueIdByKey.get(`${optName.toLowerCase()}|${parsed.label.toLowerCase()}`)
        if (!id) { allResolvable = false; break } // a new option/value = a new combination
        if (parsed.slug && valueLabelById.get(id) !== parsed.label) labelDrift = true
        ids.push(id)
      }
      if (!allResolvable) {
        // An id-matched row with unrecognisable labels is a rename/reassignment
        // the importer will resolve in place - an update, never a create.
        results.push(byId
          ? { row: gr.row, kind: 'update', parentName: parent.name, label: byId.label }
          : { row: gr.row, kind: 'create' })
        continue
      }
      if (ids.length === 0) { results.push({ row: gr.row, kind: 'error', reason: 'No options on this row' }); continue }
      // An id-matched row whose combination now belongs to a different variant is
      // a reassignment - an update to that variant, handled by the importer.
      if (byId && [...ids].sort().join('|') !== [...byId.optionValueIds].sort().join('|')) {
        results.push({ row: gr.row, kind: 'update', parentName: parent.name, label: byId.label })
        continue
      }
      const existing = byId ?? variantByKey.get([...ids].sort().join('|'))
      if (!existing) { results.push({ row: gr.row, kind: 'create' }); continue }
      if (labelDrift) { results.push({ row: gr.row, kind: 'update', parentName: parent.name, label: existing.label }); continue }
      if (variationRowChanged(existing, gr.cols, fieldCol)) { results.push({ row: gr.row, kind: 'update', parentName: parent.name, label: existing.label }); continue }
      if (undiffableProviders || (providers.length > 0 && await providerRowChanged(providers, parent.id, existing.childProductId, header, gr.cols, providerCtx))) {
        results.push({ row: gr.row, kind: 'update', parentName: parent.name, label: existing.label })
        continue
      }
      results.push({ row: gr.row, kind: 'unchanged' })
    }
  }

  return results
}

// Header + every row the diff did NOT prove unchanged, in sheet order. What the
// Pull stores and feeds to the importers: creates, updates and error rows all go
// through (the importer reports its own row errors, exactly as before); rows
// that match the shop cell-for-cell are the only thing dropped.
//
// `sheetRows` carries the original 1-based sheet row number of each kept data
// row (aligned with the returned grid's data rows), so an error the Pull reports
// against the filtered grid can be translated back to the row the owner sees.
export function filterGridByDiff(
  grid: string[][],
  results: Array<{ row: number; kind: string }>,
): { grid: string[][]; sheetRows: number[] } {
  const keep = new Set(results.filter((r) => r.kind !== 'unchanged').map((r) => r.row))
  const out: string[][] = [grid[0] ?? []]
  const sheetRows: number[] = []
  for (let r = 1; r < grid.length; r++) {
    if (keep.has(r)) {
      out.push(grid[r] ?? [])
      sheetRows.push(r + 1) // grid index r -> sheet row r+1 (row 0 is the header)
    }
  }
  return { grid: out, sheetRows }
}
