import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PatVariationColumn } from '@/modules/product-attributes-for-shop/lib/types'

// Repro: does diffVariationRows detect an ATTRIBUTE-ONLY edit (e.g. the "Catalog"
// column contributed by product-attributes-for-shop), where nothing else on the
// row changed? If it reads 'unchanged', filterGridByDiff drops the row and the
// edit is silently lost.

// --- attributes provider DB seam (mirrors the provider's own test) ---
const listVariationColumns = vi.fn(async (_id: string): Promise<PatVariationColumn[]> => [
  { assignmentId: 'asg-catalog', attributeId: 'attr-catalog', name: 'Catalog', position: 0, values: [] },
])
// Child 'child-1' currently holds catalog value "Spring" (id v-spring).
const getVariantAttributeValues = vi.fn(
  async (_p: string, _c: string[]): Promise<Record<string, Record<string, { valueId: string; label: string }>>> => ({
    'child-1': { 'asg-catalog': { valueId: 'v-spring', label: 'Spring' } },
  }),
)
const setVariantAttributeValue = vi.fn(async () => {})
const ensureAttributeValueByLabel = vi.fn(async (_a: string, label: string): Promise<string | null> => `v-${label.toLowerCase()}`)
// Read-only: a label the vocabulary has NOT seen yet has no id (null), exactly
// like the real query. Known seed labels resolve to their id.
const KNOWN = new Set(['spring', 'summer'])
const findAttributeValueByLabel = vi.fn(async (_a: string, label: string): Promise<string | null> =>
  KNOWN.has(label.toLowerCase()) ? `v-${label.toLowerCase()}` : null,
)

vi.mock('@/modules/product-attributes-for-shop/components/admin/ProductAttributesVariantCell', () => ({
  ProductAttributesVariantCell: () => null,
}))
vi.mock('@/modules/product-attributes-for-shop/lib/db/membership', () => ({
  listVariationColumns: (...a: unknown[]) => listVariationColumns(...(a as [string])),
  getVariantAttributeValues: (...a: unknown[]) => getVariantAttributeValues(...(a as [string, string[]])),
  setVariantAttributeValue: (...a: unknown[]) => setVariantAttributeValue(),
  ensureAttributeValueByLabel: (...a: unknown[]) => ensureAttributeValueByLabel(...(a as [string, string])),
  findAttributeValueByLabel: (...a: unknown[]) => findAttributeValueByLabel(...(a as [string, string])),
  // The Catalog attribute in these tests is already assigned to the product, so
  // auto-assign never fires; an empty vocabulary keeps it that way.
  listAllAttributes: async () => [],
  upsertProductAttribute: async () => null,
}))

// --- shop / variations DB seams diffVariationRows imports ---
const buildProductCsvRows = vi.fn(async (): Promise<Record<string, string>[]> => [])
vi.mock('@/modules/shop/lib/csv-rows', () => ({ buildProductCsvRows: (...a: unknown[]) => buildProductCsvRows(...(a as [])) }))
// Overridable per test, so the designed-description cases can control what the
// product currently holds in shp_products.description_puck.
type StoredProduct = { id: string; name: string; slug: string; descriptionPuck: unknown }
const getProductsBySlugs = vi.fn(async (_slugs: string[]): Promise<Map<string, StoredProduct>> =>
  new Map([['widget', { id: 'p1', name: 'Widget', slug: 'widget', descriptionPuck: null }]]))
vi.mock('@/modules/shop/lib/db/products', () => ({
  getProductsBySlugs: (...a: unknown[]) => getProductsBySlugs(...(a as [string[]])),
}))
// A fake product-field provider whose rowChanged the test drives, so diffProductRows'
// provider-awareness is exercised without the real attribute DB.
const productRowChanged = vi.fn(async (): Promise<boolean> => false)
vi.mock('@/modules/shop/lib/product-field-providers', () => ({
  resolveProductFieldProviders: vi.fn(async () => [{
    id: 'product-attributes',
    provider: {
      listColumns: async () => [],
      getValues: async () => ({}),
      beginImport: async () => ({}),
      applyImportedRow: async () => false,
      rowChanged: (...a: unknown[]) => productRowChanged(...(a as [])),
    },
  }]),
}))
vi.mock('@/modules/shop-variations/lib/variants-service', () => ({
  getEditorPayloadsBatch: vi.fn(async () => new Map([['p1', {
    product: { id: 'p1', name: 'Widget', slug: 'widget', price: 10 },
    options: [{ name: 'Size', values: [{ id: 'val-large', label: 'Large' }] }],
    variants: [{
      variantId: 'var-1', childProductId: 'child-1', optionValueIds: ['val-large'], label: 'Large',
      enabled: true, price: 10, salePrice: null, retailPrice: null, tradePrice: null, costPrice: null,
      sku: null, barcode: null, supplier: null, trackInventory: false, stockCount: null, weight: null, imageUrls: [],
    }],
    addons: [],
  }]])),
}))
vi.mock('@/modules/shop-variations/lib/csv', () => ({ parseVariantImages: (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean) }))
// One VAT class, reachable by code "vat" or name "VAT" - the two spellings an
// owner might type. Mirrors buildTaxClassRefIndex's own keying.
vi.mock('@/modules/shop/lib/db/tax-shipping', () => ({
  buildTaxClassRefIndex: vi.fn(async () => new Map([
    ['vat', { id: 'tc-vat', name: 'VAT', code: 'vat' }],
    ['reduced', { id: 'tc-reduced', name: 'Reduced', code: 'reduced' }],
  ])),
}))

// resolveVariantFieldProviders returns the REAL attributes provider, so the diff
// runs the real rowChanged path.
import { productAttributesVariantFieldProvider } from '@/modules/product-attributes-for-shop/lib/variant-field-provider'
vi.mock('@/modules/shop-variations/lib/variant-field-providers', () => ({
  resolveVariantFieldProviders: vi.fn(async () => [
    { id: 'product-attributes-for-shop', provider: productAttributesVariantFieldProvider },
  ]),
}))

import { diffVariationRows, diffProductRows } from '@/modules/google-sheet-products-for-shop/lib/pull-diff'
import { DESCRIPTION_PUCK_COLUMN, descriptionPuckCell } from '@/modules/google-sheet-products-for-shop/lib/description-puck'
import { CSV_COLUMNS } from '@/modules/shop/lib/csv'

describe('diffVariationRows - attribute-only edit', () => {
  it('flags a Catalog attribute change as update, not unchanged', async () => {
    const grid = [
      ['Parent Slug', 'Option 1', 'Value 1', 'Variant ID', 'Catalog'],
      // Same variant (child-1, Size=Large), only the Catalog cell changed Spring -> Summer.
      ['widget', 'Size', 'Large', 'child-1', 'Summer'],
    ]
    const results = await diffVariationRows(grid)
    expect(results).toHaveLength(1)
    expect(results[0]?.kind).toBe('update')
  })

  it('leaves an unchanged Catalog cell as unchanged', async () => {
    const grid = [
      ['Parent Slug', 'Option 1', 'Value 1', 'Variant ID', 'Catalog'],
      ['widget', 'Size', 'Large', 'child-1', 'Spring'],
    ]
    const results = await diffVariationRows(grid)
    expect(results[0]?.kind).toBe('unchanged')
  })

  // Regression: the Pull used to drop the first values typed into a brand-new
  // attribute's column. The variant had no value yet (stored null) and the label
  // was one the vocabulary had never seen (resolves null too), so the diff read
  // null === null as "unchanged" and filterGridByDiff dropped the row before the
  // importer - which would have created and assigned the value - ever saw it.
  it('flags the first value typed into a brand-new attribute column as update', async () => {
    getVariantAttributeValues.mockResolvedValueOnce({}) // child-1 has no catalog value
    const grid = [
      ['Parent Slug', 'Option 1', 'Value 1', 'Variant ID', 'Catalog'],
      ['widget', 'Size', 'Large', 'child-1', 'Autumn 2026 Brochure'],
    ]
    const results = await diffVariationRows(grid)
    expect(results[0]?.kind).toBe('update')
  })
})

// The Products-tab twin: a row whose fixed columns all match the shop but whose
// product-level attribute column (Markup) was edited must read as an update, or
// filterGridByDiff drops it and the attribute edit is lost - the same silent-loss
// bug the variation side has.
describe('diffProductRows - product-level attribute edit', () => {
  // An existing "Widget" whose fixed columns match the sheet exactly, so the only
  // possible change is a provider (attribute) column.
  const existing = { ...Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])), name: 'Widget', slug: 'widget', type: 'PHYSICAL', price: '10' } as Record<string, string>
  const header = [...CSV_COLUMNS, 'Markup']
  const rowCells = (markup: string) => [...CSV_COLUMNS.map((c) => existing[c] ?? ''), markup]

  it('flags a Markup attribute change as update, not unchanged', async () => {
    buildProductCsvRows.mockResolvedValueOnce([existing])
    productRowChanged.mockResolvedValueOnce(true)
    const results = await diffProductRows([header, rowCells('Premium')])
    expect(results).toHaveLength(1)
    expect(results[0]?.kind).toBe('update')
  })

  it('leaves an unchanged product alone', async () => {
    buildProductCsvRows.mockResolvedValueOnce([existing])
    productRowChanged.mockResolvedValueOnce(false)
    const results = await diffProductRows([header, rowCells('')])
    expect(results[0]?.kind).toBe('unchanged')
  })
})

// Tax class round-trips as a code ("vat") but an owner naturally types the name
// ("VAT"). The diff must treat the two spellings of the same class as equal (or a
// Pull re-flags the row forever), yet still flag a genuinely different or unknown
// value so the row reaches the importer.
describe('diffProductRows - tax class name vs code', () => {
  const base = { ...Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])), name: 'Widget', slug: 'widget', type: 'PHYSICAL', price: '10' } as Record<string, string>
  const cellsWith = (tax: string) => CSV_COLUMNS.map((c) => (c === 'tax_class' ? tax : base[c] ?? ''))

  it('reads the name "VAT" as unchanged against a stored "vat" code', async () => {
    buildProductCsvRows.mockResolvedValueOnce([{ ...base, tax_class: 'vat' }])
    productRowChanged.mockResolvedValueOnce(false)
    const results = await diffProductRows([[...CSV_COLUMNS], cellsWith('VAT')])
    expect(results[0]?.kind).toBe('unchanged')
  })

  it('flags a switch to a different tax class as update', async () => {
    buildProductCsvRows.mockResolvedValueOnce([{ ...base, tax_class: 'vat' }])
    productRowChanged.mockResolvedValueOnce(false)
    const results = await diffProductRows([[...CSV_COLUMNS], cellsWith('Reduced')])
    expect(results[0]?.kind).toBe('update')
  })

  it('flags setting a tax class on a product that had none', async () => {
    buildProductCsvRows.mockResolvedValueOnce([{ ...base, tax_class: '' }])
    productRowChanged.mockResolvedValueOnce(false)
    const results = await diffProductRows([[...CSV_COLUMNS], cellsWith('VAT')])
    expect(results[0]?.kind).toBe('update')
  })

  it('flags an unknown tax class so the importer can report it', async () => {
    buildProductCsvRows.mockResolvedValueOnce([{ ...base, tax_class: 'vat' }])
    productRowChanged.mockResolvedValueOnce(false)
    const results = await diffProductRows([[...CSV_COLUMNS], cellsWith('GST')])
    expect(results[0]?.kind).toBe('update')
  })
})

describe('diffProductRows - multi-column products edits', () => {
  it('flags a row as updated when several editable columns change together', async () => {
    const base = { ...Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])), name: 'Chiro Plus High Back Ergonomic Posture 24-Hour Office Chair', slug: 'chiro-plus-high-back-ergonomic-posture-24-hour-office-chair', type: 'PHYSICAL', status: 'ACTIVE', description: 'Chiropractor-approved Chiro High Back posture chair with optional headrest. Fully adjustable ergonomic support for real back relief. Stock or bespoke fabrics.', price: '499', retail_price: '999', cost_price: '456', track_inventory: 'FALSE', out_of_stock_behaviour: 'BLOCK', is_pre_order: 'FALSE', related_mode: 'AUTOMATIC', related_limit: '4', upsell_mode: 'AUTOMATIC', upsell_limit: '4', categories: 'task-operator-chairs|ergonomic-chairs|24-hour-heavy-duty-chairs', image_urls: 'IMAGE:https://media.deskwell.co.uk/media/shop/ergonomic-chairs/chiro-plus-high-back-ergonomic-posture-24-hour-office-chair/chiro-plus-high-back-ergonomic-posture-24-hour-office-chair1.webp|IMAGE:https://media.deskwell.co.uk/media/shop/ergonomic-chairs/chiro-plus-high-back-ergonomic-posture-24-hour-office-chair/chiro-plus-high-back-ergonomic-posture-24-hour-office-chair2.webp', image_alt: '', supplier: 'Seating' } as Record<string, string>
    buildProductCsvRows.mockResolvedValueOnce([base])
    productRowChanged.mockResolvedValueOnce(true)

    const edited = { ...base, cost_price: '', tax_class: 'VAT', image_alt: '', supplier: 'Seating', barcode: 'Dynamic' } as Record<string, string>
    const results = await diffProductRows([[...CSV_COLUMNS, 'Markup'], [...CSV_COLUMNS.map((c) => edited[c] ?? ''), '6']])

    expect(results).toHaveLength(1)
    expect(results[0]?.kind).toBe('update')
  })
})

describe('diffProductRows - blank price on an existing product', () => {
  // A variable product priced "from £x" off its cheapest variation carries no
  // meaningful parent price, and the price column is NOT NULL - so a blank price
  // cell on an EXISTING product means "leave it alone", never an error or a
  // change. A blank price on a NEW product is still a hard error (nothing to
  // create it with).
  const base = { ...Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])), name: 'Widget', slug: 'widget', type: 'PHYSICAL', price: '10' } as Record<string, string>
  const cells = (over: Record<string, string>) => CSV_COLUMNS.map((c) => (c in over ? over[c]! : base[c] ?? ''))

  it('reads a blanked price with nothing else changed as unchanged', async () => {
    buildProductCsvRows.mockResolvedValueOnce([{ ...base }])
    productRowChanged.mockResolvedValueOnce(false)
    const results = await diffProductRows([[...CSV_COLUMNS], cells({ price: '' })])
    expect(results[0]?.kind).toBe('unchanged')
  })

  it('flags the row as update on other edits but never lists price as a change', async () => {
    buildProductCsvRows.mockResolvedValueOnce([{ ...base, retail_price: '999' }])
    productRowChanged.mockResolvedValueOnce(false)
    const results = await diffProductRows([[...CSV_COLUMNS], cells({ price: '', retail_price: '' })])
    expect(results[0]?.kind).toBe('update')
    const changes = (results[0] as { changes: { field: string }[] }).changes
    expect(changes.some((c) => c.field === 'price')).toBe(false)
    expect(changes.some((c) => c.field === 'retail_price')).toBe(true)
  })

  it('still errors a blank price on a product that does not exist yet', async () => {
    buildProductCsvRows.mockResolvedValueOnce([])
    const results = await diffProductRows([[...CSV_COLUMNS], cells({ name: 'Newthing', slug: 'newthing', price: '' })])
    expect(results[0]?.kind).toBe('error')
    expect((results[0] as { reason: string }).reason).toMatch(/price/i)
  })
})

// The designed description (shp_products.description_puck) rides in this module's
// own column, which shop's import engine cannot see - so the diff must judge it
// itself, or an edited design is read as "unchanged" and dropped before the
// write-back pass ever runs.
describe('diffProductRows - designed description column', () => {
  const base = { ...Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])), name: 'Widget', slug: 'widget', type: 'PHYSICAL', price: '10' } as Record<string, string>
  const header = [...CSV_COLUMNS, DESCRIPTION_PUCK_COLUMN]
  const rowCells = (design: string) => [...CSV_COLUMNS.map((c) => base[c] ?? ''), design]
  const doc = { root: { props: {} }, content: [{ type: 'Text' }] }
  const stored = (descriptionPuck: unknown) =>
    getProductsBySlugs.mockResolvedValueOnce(new Map([['widget', { id: 'p1', name: 'Widget', slug: 'widget', descriptionPuck }]]))

  // Earlier describes queue rowChanged answers they never consume (a row with a
  // fixed-column change returns before the provider is asked), and a stale one
  // would answer for a row here instead. Start every test from a clean "no
  // attribute change" so these cases only ever prove the design column.
  beforeEach(() => {
    productRowChanged.mockReset()
    productRowChanged.mockResolvedValue(false)
  })

  it('reads the cell a Push just wrote as unchanged', async () => {
    buildProductCsvRows.mockResolvedValueOnce([base])
    stored(doc)
    const results = await diffProductRows([header, rowCells(descriptionPuckCell(doc as never))])
    expect(results[0]?.kind).toBe('unchanged')
  })

  it('flags an edited design as update', async () => {
    buildProductCsvRows.mockResolvedValueOnce([base])
    stored(doc)
    const edited = { ...doc, content: [{ type: 'Text' }, { type: 'Heading' }] }
    const results = await diffProductRows([header, rowCells(descriptionPuckCell(edited as never))])
    expect(results[0]?.kind).toBe('update')
    const changes = (results[0] as { changes: { field: string; from: string; to: string }[] }).changes
    expect(changes).toContainEqual({ field: DESCRIPTION_PUCK_COLUMN, from: 'design (1 block)', to: 'design (2 blocks)' })
  })

  it('flags a cleared cell as update so the design is removed', async () => {
    buildProductCsvRows.mockResolvedValueOnce([base])
    stored(doc)
    const results = await diffProductRows([header, rowCells('')])
    expect(results[0]?.kind).toBe('update')
  })

  it('leaves a product with no design and a blank cell unchanged', async () => {
    buildProductCsvRows.mockResolvedValueOnce([base])
    stored(null)
    const results = await diffProductRows([header, rowCells('')])
    expect(results[0]?.kind).toBe('unchanged')
  })

  it('flags an unreadable cell so the Pull reports the row rather than skipping it', async () => {
    buildProductCsvRows.mockResolvedValueOnce([base])
    stored(doc)
    const results = await diffProductRows([header, rowCells('{ not json')])
    expect(results[0]?.kind).toBe('update')
    const changes = (results[0] as { changes: { to: string }[] }).changes
    expect(changes.some((c) => c.to === 'unreadable design')).toBe(true)
  })

  it('never lists the whole document in a change, however big it is', async () => {
    buildProductCsvRows.mockResolvedValueOnce([base])
    stored(null)
    const big = { root: {}, content: Array.from({ length: 50 }, () => ({ type: 'Text', props: { text: 'x'.repeat(200) } })) }
    const results = await diffProductRows([header, rowCells(descriptionPuckCell(big as never))])
    const changes = (results[0] as { changes: { from: string; to: string }[] }).changes
    for (const c of changes) expect(c.from.length + c.to.length).toBeLessThan(80)
  })

  it('ignores the column entirely when the sheet does not carry it', async () => {
    buildProductCsvRows.mockResolvedValueOnce([base])
    stored(doc)
    const results = await diffProductRows([[...CSV_COLUMNS], CSV_COLUMNS.map((c) => base[c] ?? '')])
    expect(results[0]?.kind).toBe('unchanged')
  })
})

// Regression: Push preserves an owner's price formula when its result matches
// the shop within float tolerance (formula-preserve's numbersMatch), so the
// sheet legitimately holds 122.10000000000002 where the shop holds 122.1. The
// diff used exact numeric equality, so every preserved-formula row read as an
// update on every Pull, forever - on the live deskwell sheet that was 284 of
// 575 variation rows flagged straight after a Push that changed nothing.
describe('float noise from preserved formulas reads as unchanged', () => {
  it('variation Price with formula float noise is unchanged', async () => {
    const grid = [
      ['Parent Slug', 'Option 1', 'Value 1', 'Variant ID', 'Price', 'Catalog'],
      // v.price is 10; a preserved "=x*y" formula reads back with float noise.
      ['widget', 'Size', 'Large', 'child-1', '10.000000000000002', 'Spring'],
    ]
    const results = await diffVariationRows(grid)
    expect(results[0]?.kind).toBe('unchanged')
  })

  it('a real variation price change still flags as update', async () => {
    const grid = [
      ['Parent Slug', 'Option 1', 'Value 1', 'Variant ID', 'Price', 'Catalog'],
      ['widget', 'Size', 'Large', 'child-1', '10.5', 'Spring'],
    ]
    const results = await diffVariationRows(grid)
    expect(results[0]?.kind).toBe('update')
  })

  it('product price with formula float noise is unchanged', async () => {
    const noisy = { ...Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])), name: 'Widget', slug: 'widget', type: 'PHYSICAL', price: '122.1' } as Record<string, string>
    buildProductCsvRows.mockResolvedValueOnce([noisy])
    productRowChanged.mockResolvedValueOnce(false)
    const cells = CSV_COLUMNS.map((c) => (c === 'price' ? '122.10000000000002' : noisy[c] ?? ''))
    const results = await diffProductRows([[...CSV_COLUMNS], cells])
    expect(results[0]?.kind).toBe('unchanged')
  })
})
