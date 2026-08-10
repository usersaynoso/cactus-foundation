#!/usr/bin/env node
// Match the scraped clearance rows to Deskwell products and work out the sale
// price for each. Writes a plan and touches nothing - applying is a separate,
// deliberate step.
//
// Matching, strongest key first:
//   0. a decision - an answer given to the numbered list this script prints,
//      by a human who looked at both product pages. Beats everything below.
//   1. barcode  - the same EAN in both catalogues. Unambiguous, and Deskwell
//      carries one on ~20,800 of its ~21,200 rows.
//   2. supplier code - parsed out of the clearance image filename and matched
//      against shp_products.sku.
// Anything that resolves to no row, or to more than one, is NOT guessed into
// the plan. It is printed as a numbered question with the one product it most
// resembles and a link to each side, to be confirmed or rejected. A price is
// not the place for a good guess.
//
// The sale price is ceil(now x 1.06), matching the 6% the shop already carries
// in its normal pricing formula, rounded up to the whole pound the rest of the
// catalogue is priced in.
//
// The clearance SKU is taken across too: while an item is on clearance it is
// ordered from the supplier by its clearance code (PR1291), not its catalogue
// code (OP000115), so the shop's SKU has to say the same. This is why the
// barcode is the first-choice match key - once the SKU has been swapped, the
// old code is no longer in the row to match on, and the barcode is what still
// ties the two catalogues together. The code that was displaced is kept in the
// plan and in rollback.sql, so putting it back when the sale ends is one file.
// Pass --no-skus to leave SKUs alone and move prices only.
//
// Usage:
//   node plan-sale-prices.mjs --in clearance.json --out-dir clearance_sale_2026_08_10
//     [--confirm "1=yes,2=no,16=I003259"]
//     [--decisions clearance_sale_2026_08_10/decisions.json]
//     [--uplift 1.06] [--include-sold-out] [--no-skus] [--site https://deskwell.co.uk]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const flag = (name) => process.argv.includes(`--${name}`)

const input = arg('in', 'clearance.json')
const outDir = arg('out-dir', 'clearance_sale_plan')
const confirmArg = arg('confirm', null)
const decisionsIn = arg('decisions', null)
const uplift = Number(arg('uplift', '1.06'))
const includeSoldOut = flag('include-sold-out')
const moveSkus = !flag('no-skus')
const site = (arg('site', 'https://deskwell.co.uk') ?? '').replace(/\/$/, '')

if (!Number.isFinite(uplift) || uplift <= 0) throw new Error(`--uplift must be a positive number, got ${arg('uplift')}`)

function directUrl() {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL
  const env = readFileSync('.env', 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DIRECT_URL='))
  if (!line) throw new Error('No DIRECT_URL in the environment or in .env - run this from the repo root.')
  return line.slice('DIRECT_URL='.length).trim().replace(/^["']|["']$/g, '')
}

const csv = (rows, cols) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')

// --- inputs -----------------------------------------------------------------
const { rows: clearance } = JSON.parse(readFileSync(input, 'utf8'))

// Confirmations arrive as `--confirm "1=yes,2=no,4=I003259"`, answering the
// numbered list the previous run printed. The numbers are resolved against that
// run's own plan.json, which is read before this run overwrites it - so the
// numbers on screen are always the numbers that were just quoted, with no
// spreadsheet in the middle.
//
//   N=yes / N=y            take the guess as offered
//   N=no  / N=none / N=skip we do not stock it. A decision, not a maybe
//   N=<SKU>                the guess was wrong, this is the right product
//
// Anything not mentioned stays undecided and is offered again next run, so the
// list can be worked through a few at a time. Decisions accumulate in
// plan.json, so an earlier answer is never asked twice.
const previous = existsSync(join(outDir, 'plan.json'))
  ? JSON.parse(readFileSync(join(outDir, 'plan.json'), 'utf8'))
  : { suggestions: [], decisions: {} }

// Decisions survive between runs, including into a fresh out-dir via
// --decisions. They are keyed on the clearance SKU, which the supplier is free
// to reuse for something else next season - so each one also records the
// product it was made about, and a decision whose title no longer matches is
// dropped rather than applied to a different product. A stale "we do not stock
// this" is the dangerous direction: it hides a real item in silence.
const decisions = new Map()
const loadDecisions = (source) => {
  for (const [sku, entry] of Object.entries(source ?? {})) {
    decisions.set(sku, typeof entry === 'string' || entry === null ? { choice: entry, product: null } : entry)
  }
}
loadDecisions(previous.decisions)
if (decisionsIn) {
  if (!existsSync(decisionsIn)) throw new Error(`No such file: ${decisionsIn}`)
  const carried = JSON.parse(readFileSync(decisionsIn, 'utf8'))
  loadDecisions(carried.decisions ?? carried)
}

if (confirmArg) {
  const numbered = new Map((previous.suggestions ?? []).map((s) => [String(s.n), s]))
  for (const pair of confirmArg.split(',')) {
    const [rawKey, ...rest] = pair.split('=')
    const key = rawKey.trim()
    const answer = rest.join('=').trim()
    if (!key || !answer) continue
    const suggestion = numbered.get(key)
    if (!suggestion) throw new Error(`No item ${key} in the last list from ${join(outDir, 'plan.json')} - re-run without --confirm to print it again.`)
    const record = (choice) => decisions.set(suggestion.clearanceSku, { choice, product: suggestion.clearanceProduct })
    if (/^(no|none|skip|n)$/i.test(answer)) record(null)
    else if (/^(yes|y)$/i.test(answer)) {
      if (!suggestion.guessSku) throw new Error(`Item ${key} had no guess to say yes to - give the SKU instead.`)
      record(suggestion.guessSku)
    } else record(answer)
  }
}

/** A decision only counts for the product it was made about. */
function decisionFor(item) {
  if (item.clearanceSku == null || !decisions.has(item.clearanceSku)) return undefined
  const entry = decisions.get(item.clearanceSku)
  if (entry.product && entry.product !== item.product) return undefined
  return entry.choice
}

const client = new pg.Client({ connectionString: directUrl() })
await client.connect()

// The whole priced catalogue in one read - 21k narrow rows is far cheaper than
// a round trip per clearance variant, and it lets duplicate keys be spotted.
const { rows: catalogue } = await client.query(`
  select p.id, p.sku, p.barcode, p.name, p.slug, p.status,
         p.price::text as price, p.sale_price::text as sale_price,
         parent.name as parent_name, parent.slug as parent_slug
    from shp_products p
    left join svr_variants v on v.child_product_id = p.id
    left join shp_products parent on parent.id = v.product_id
`)
await client.end()

/** A variant child has no page of its own - the shopper lands on the parent
 * listing and picks the option there. */
const deskwellUrl = (row) => `${site}/shop/products/${row.parent_slug ?? row.slug}`

const byBarcode = new Map()
const bySku = new Map()
for (const row of catalogue) {
  if (row.barcode) {
    if (!byBarcode.has(row.barcode)) byBarcode.set(row.barcode, [])
    byBarcode.get(row.barcode).push(row)
  }
  if (row.sku) {
    if (!bySku.has(row.sku)) bySku.set(row.sku, [])
    bySku.get(row.sku).push(row)
  }
}

// --- the guesser ------------------------------------------------------------
// Name similarity, weighted so that the words which actually identify a product
// carry the decision. "Office", "chair" and "black" appear on thousands of rows
// and say nothing; "trapezium", "chester" and "moonstone" appear on a handful
// and say everything. Inverse document frequency does that weighting for free,
// measured over the shop's own catalogue.
const STOP = new Set(['with', 'and', 'the', 'for', 'x', 'mm', 'cm', 'w', 'd', 'h'])
const tokenise = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t))

const docFreq = new Map()
for (const row of catalogue) {
  for (const token of new Set(tokenise(`${row.name} ${row.parent_name ?? ''}`))) {
    docFreq.set(token, (docFreq.get(token) ?? 0) + 1)
  }
}
const idf = (token) => Math.log(catalogue.length / (1 + (docFreq.get(token) ?? 0)))

// Only rows that carry a SKU can be suggested: a confirmation comes back as a
// SKU, and a parent listing has none. Suggesting the parent would leave nothing
// to write the answer with, and the variant is the row that holds the price.
const searchable = catalogue
  .filter((row) => row.status === 'ACTIVE' && row.sku)
  .map((row) => ({ row, tokens: new Set(tokenise(`${row.name} ${row.parent_name ?? ''}`)) }))

/** The shop prices from the supplier's RRP by a fixed formula, and the
 * clearance page still prints that RRP as its "was". So the right product's
 * shop price should land on ceil(was x 0.37 x 1.06) almost exactly - which is a
 * far harder piece of evidence than any amount of name similarity. */
function priceAgreement(item, row) {
  if (!item.was) return 0
  const expected = Math.ceil(item.was * 0.37 * 1.06)
  const actual = Number(row.price)
  if (!Number.isFinite(actual) || actual <= 0) return 0
  const drift = Math.abs(actual - expected) / expected
  if (drift <= 0.02) return 1
  if (drift <= 0.1) return 0.5
  if (drift <= 0.25) return 0.2
  return 0
}

function guess(item, limit = 3) {
  const wanted = new Set(tokenise(`${item.product} ${item.variant === 'Default Title' ? '' : item.variant}`))
  if (wanted.size === 0) return []
  const total = [...wanted].reduce((sum, t) => sum + idf(t), 0)
  if (total <= 0) return []

  const scored = []
  for (const entry of searchable) {
    let hit = 0
    for (const token of wanted) if (entry.tokens.has(token)) hit += idf(token)
    if (hit <= 0) continue
    // Shared weight against what was asked for, nudged down when the shop's own
    // name carries a lot of words the clearance name never mentioned - that is
    // usually a different, more specific product - and lifted when the shop's
    // price is the one the supplier's RRP implies.
    const precision = hit / [...entry.tokens].reduce((sum, t) => sum + idf(t), 0.0001)
    const name = (hit / total) * 0.75 + Math.min(precision, 1) * 0.25
    // Price is a tie-breaker, deliberately weak: the clearance "was" is the RRP
    // of the day the item went into clearance, which drifts from the RRP the
    // shop priced against. Strong enough to separate two near-identical names,
    // never strong enough to beat a name that plainly matches better.
    scored.push({ entry, score: name + priceAgreement(item, entry.row) * 0.08 })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).filter((s) => s.score >= 0.25)
}

// --- match ------------------------------------------------------------------
const planned = []
const skipped = []
const suggestions = []

for (const item of clearance) {
  const note = (reason, extra = {}) => skipped.push({ ...item, reason, ...extra })
  /** Unresolved and worth a human eye: one best guess, two links, a number to
   * answer with. One guess rather than three because a shortlist is a research
   * task and a single named product is a yes or a no. */
  const askAbout = (reason) => {
    const [best] = guess(item, 1)
    const row = best?.entry.row
    skipped.push({ ...item, reason })
    suggestions.push({
      n: suggestions.length + 1,
      clearanceSku: item.clearanceSku,
      clearanceProduct: item.product,
      clearanceVariant: item.variant,
      clearanceNow: item.now,
      clearanceWas: item.was,
      dynamicUrl: item.url,
      reason,
      guessSku: row?.sku ?? null,
      guessName: row ? (row.parent_name ? `${row.parent_name} - ${row.name}` : row.name) : null,
      guessPrice: row ? Number(row.price) : null,
      guessUrl: row ? deskwellUrl(row) : null,
      guessScore: best ? Number(best.score.toFixed(2)) : null,
    })
  }

  if (!item.available && !includeSoldOut) {
    note('sold out on the clearance page')
    continue
  }

  let candidates = null
  let matchedBy = null
  const decision = decisionFor(item)

  if (decision === null) {
    note('confirmed as not stocked by Deskwell')
    continue
  }
  if (typeof decision === 'string') {
    candidates = bySku.get(decision) ?? []
    matchedBy = 'confirmed by hand'
    if (candidates.length === 0) {
      note(`confirmed pairing names SKU ${decision}, which no Deskwell product has`)
      continue
    }
  } else if (item.barcode && byBarcode.has(item.barcode)) {
    candidates = byBarcode.get(item.barcode)
    matchedBy = 'barcode'
  } else if (item.supplierCode && bySku.has(item.supplierCode)) {
    candidates = bySku.get(item.supplierCode)
    matchedBy = `sku (${item.codeSource})`
  }

  if (!candidates) {
    askAbout(
      item.barcode || item.supplierCode
        ? 'no Deskwell product carries this barcode or code'
        : 'clearance listing gives neither a barcode nor a usable code',
    )
    continue
  }
  if (candidates.length > 1) {
    askAbout(`${matchedBy} matches ${candidates.length} Deskwell rows - ambiguous`)
    continue
  }

  const target = candidates[0]
  const price = Number(target.price)
  const newSale = Math.ceil(item.now * uplift)

  if (newSale >= price) {
    note(`sale ${newSale} is not below the shop price ${price} - it would read as a discount of nothing`, { sku: target.sku })
    continue
  }

  // The SKU only moves when there is somewhere to move it to, and never onto a
  // code another product already holds - shp_products.sku is UNIQUE, so a clash
  // would fail the whole transaction at apply time rather than here.
  let newSku = null
  if (moveSkus && item.clearanceSku && item.clearanceSku !== target.sku) {
    const holder = (bySku.get(item.clearanceSku) ?? []).find((r) => r.id !== target.id)
    if (holder) {
      note(`clearance SKU ${item.clearanceSku} is already on ${holder.sku ?? holder.id} (${holder.name})`, { sku: target.sku })
      continue
    }
    newSku = item.clearanceSku
  }

  const salePriceAlreadyRight = target.sale_price != null && Number(target.sale_price) === newSale
  if (salePriceAlreadyRight && !newSku) {
    note(`already on sale at ${newSale} under the clearance SKU`, { sku: target.sku })
    continue
  }

  planned.push({
    id: target.id,
    sku: target.sku,
    newSku,
    barcode: target.barcode,
    name: target.name,
    parentName: target.parent_name,
    status: target.status,
    price,
    currentSale: target.sale_price == null ? null : Number(target.sale_price),
    newSale,
    clearanceNow: item.now,
    clearanceWas: item.was,
    clearanceSku: item.clearanceSku,
    clearanceProduct: item.product,
    clearanceVariant: item.variant,
    matchedBy,
    // Only meaningful when the barcode did the matching: it then says whether
    // the two catalogues agree about which product that barcode belongs to. On
    // a hand-confirmed row the codes are expected to differ, so asking the
    // question would only produce noise.
    codeAgrees: matchedBy !== 'barcode' || !item.supplierCode || !target.sku ? null : item.supplierCode === target.sku,
    dynamicUrl: item.url,
    deskwellUrl: deskwellUrl(target),
  })
}

// Two clearance variants landing on one Deskwell row is fine when they agree on
// the money and a genuine contradiction when they do not.
const byId = new Map()
for (const row of planned) {
  if (!byId.has(row.id)) byId.set(row.id, [])
  byId.get(row.id).push(row)
}
const deduped = []
for (const [id, group] of byId) {
  const prices = new Set(group.map((g) => g.newSale))
  if (prices.size > 1) {
    for (const g of group) skipped.push({ ...g, reason: `clearance lists this row at ${[...prices].join(' and ')} - contradictory` })
    continue
  }
  const skus = new Set(group.map((g) => g.newSku).filter(Boolean))
  if (skus.size > 1) {
    for (const g of group) skipped.push({ ...g, reason: `clearance lists this row under ${[...skus].join(' and ')} - contradictory` })
    continue
  }
  deduped.push({ ...group[0], clearanceRows: group.length, id })
}

// Two different Deskwell rows both being handed the same clearance SKU is the
// same UNIQUE clash as above, just from inside the one run.
const final = []
const claimed = new Map()
for (const row of deduped) {
  if (!row.newSku) continue
  if (!claimed.has(row.newSku)) claimed.set(row.newSku, [])
  claimed.get(row.newSku).push(row)
}
for (const row of deduped) {
  const rivals = row.newSku ? claimed.get(row.newSku) : null
  if (rivals && rivals.length > 1) {
    skipped.push({ ...row, reason: `${rivals.length} Deskwell rows would all be given SKU ${row.newSku}` })
    continue
  }
  final.push(row)
}
final.sort((a, b) => (a.sku ?? '').localeCompare(b.sku ?? ''))

// --- outputs ----------------------------------------------------------------
mkdirSync(outDir, { recursive: true })

writeFileSync(
  join(outDir, 'plan.json'),
  `${JSON.stringify(
    { generatedFrom: input, uplift, site, decisions: Object.fromEntries(decisions), planned: final, skipped, suggestions },
    null,
    2,
  )}\n`,
)
// Kept as a file of its own so next month's run can be handed it directly -
// `--decisions <last run>/decisions.json` - without dragging a whole plan along.
writeFileSync(join(outDir, 'decisions.json'), `${JSON.stringify({ decisions: Object.fromEntries(decisions) }, null, 2)}\n`)

writeFileSync(
  join(outDir, 'plan.csv'),
  `${csv(final, ['sku', 'newSku', 'barcode', 'name', 'parentName', 'price', 'currentSale', 'newSale', 'clearanceNow', 'clearanceWas', 'matchedBy', 'codeAgrees', 'dynamicUrl', 'deskwellUrl'])}\n`,
)
writeFileSync(
  join(outDir, 'unmatched.csv'),
  `${csv(skipped, ['product', 'variant', 'clearanceSku', 'barcode', 'supplierCode', 'now', 'reason'])}\n`,
)

const sqlLiteral = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const rollback = final
  .map(
    (r) =>
      `UPDATE "shp_products" SET "sale_price" = ${r.currentSale == null ? 'NULL' : r.currentSale}` +
      (r.newSku ? `, "sku" = ${sqlLiteral(r.sku)}` : '') +
      ` WHERE "id" = '${r.id}'; -- ${r.sku ?? ''} ${r.name}`,
  )
  .join('\n')
writeFileSync(
  join(outDir, 'rollback.sql'),
  `-- Undo the clearance sale prices and SKU swaps applied from ${outDir}.\n` +
    `-- Restores each row to the price and code it held before the run.\nBEGIN;\n${rollback}\nCOMMIT;\n`,
)

const overwrites = final.filter((r) => r.currentSale != null).length
const skuMoves = final.filter((r) => r.newSku).length
const disagree = final.filter((r) => r.codeAgrees === false).length
const money = (n) => (n == null ? '?' : `£${Number(n).toFixed(2).replace(/\.00$/, '')}`)

console.log(
  `${clearance.length} clearance variants read\n` +
    `  ${final.length} to update (${overwrites} already carry a different sale price, ${skuMoves} change SKU)\n` +
    `  ${suggestions.length} need confirming - listed below\n` +
    `  ${skipped.length} skipped in total - see ${join(outDir, 'unmatched.csv')}\n` +
    (disagree ? `  ${disagree} matched on barcode but the image code disagrees with the SKU - check these by hand\n` : ''),
)

// The list is printed, not filed, and is meant to be relayed into the chat as
// it stands. Each entry is one guess and two links, because the question being
// asked is "is this the same product, yes or no".
if (suggestions.length > 0) {
  console.log('NEEDS CONFIRMING - best guess only, answer by number:\n')
  for (const s of suggestions) {
    console.log(
      `${s.n}. ${s.clearanceProduct}${s.clearanceVariant && s.clearanceVariant !== 'Default Title' ? ` - ${s.clearanceVariant}` : ''}` +
        ` (${s.clearanceSku ?? 'no code'}, now ${money(s.clearanceNow)}${s.clearanceWas ? `, was ${money(s.clearanceWas)}` : ''})\n` +
        `   theirs: ${s.dynamicUrl}\n` +
        (s.guessSku
          ? `   ours:   ${s.guessName} - ${s.guessSku} at ${money(s.guessPrice)} (confidence ${s.guessScore})\n` +
            `           ${s.guessUrl}\n`
          : `   ours:   nothing close enough to guess at\n`),
    )
  }
  console.log(
    'Answer with, for example:\n' +
      `  --confirm "1=yes,2=no,4=I003259"\n` +
      'yes takes the guess, no records that the shop does not stock it, or name the right SKU.\n' +
      'Anything left out stays open and is asked again next run.\n',
  )
}

console.log(
  `Review ${join(outDir, 'plan.csv')}, then apply with:\n` +
    `  node .agents/skills/dynamic-clearance/scripts/apply-sale-prices.mjs --plan ${join(outDir, 'plan.json')} --apply`,
)
