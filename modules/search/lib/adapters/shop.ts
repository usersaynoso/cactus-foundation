import { prisma } from '@/lib/db/prisma'
import { extractPuckText, makeExcerpt } from '../extract'
import { resolveShopProductText, resolveShopProductTextChanges } from '../shop-product-text'
import type { SearchDocument } from '../types'
import type { SearchAdapter } from './types'

// Shop products, categories and collections, read with raw SQL against shp_*
// tables (the shop module has no Prisma models; importing its lib would break
// builds without shop). Visibility predicates mirror modules/shop/lib/sitemap.ts:
// products need status = 'ACTIVE' AND catalogue_hidden = false (hidden rows are
// shop-variations children); categories/collections must contain a product.
// Prices and stock are deliberately NOT indexed - the query path live-joins
// them so a sale never shows a stale figure.

// Whether the shop serves its products off the site root rather than under
// /shop/products/. Read straight from shop's settings row for the same reason
// everything else here is raw SQL: importing shop's lib would break a build
// without shop installed. A shop on the root style has NO /shop/products/<slug>
// address at all, so an index built with the wrong answer sends every search
// result to a 404 - which is also why changing the setting wants a reindex, the
// url being baked into each document as it is written.
async function shopProductsAtRoot(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ style: string | null }>>`
      SELECT "config" ->> 'productUrlStyle' AS style FROM "shp_settings" WHERE "id" = 'singleton' LIMIT 1
    `
    return rows[0]?.style === 'ROOT'
  } catch {
    return false
  }
}

export const shopProductAdapter: SearchAdapter = {
  source: 'shop-product',
  label: 'Products',

  isAvailable(installed) {
    return installed.has('shop')
  },

  async listIds() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "shp_products" WHERE "status" = 'ACTIVE' AND "catalogue_hidden" = false
    `
    return rows.map((r) => r.id)
  },

  async listChangedSince(since) {
    if (!since) {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "shp_products" WHERE "status" = 'ACTIVE' AND "catalogue_hidden" = false
      `
      return rows.map((r) => r.id)
    }
    // A product's own row is not the whole document any more: a companion
    // module's contributed text (variation codes) moves without shop's
    // `updated_at` moving, so those parents are folded in here or an
    // incremental run would never revisit them.
    const [rows, contributed] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "shp_products" WHERE "updated_at" > ${since}
      `,
      resolveShopProductTextChanges(since),
    ])
    return [...new Set([...rows.map((r) => r.id), ...contributed])]
  },

  async fetchDocuments(ids, opts) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT p."id", p."name", p."slug", p."sku", p."short_description", p."description",
             p."description_puck", p."updated_at",
             (SELECT m."url" FROM "shp_product_media" m
                WHERE m."product_id" = p."id" AND m."type" IS DISTINCT FROM 'VIDEO_URL'
                ORDER BY m."is_primary" DESC, m."position" ASC LIMIT 1) AS image_url,
             (SELECT string_agg(m."alt_text", ' ') FROM "shp_product_media" m
                WHERE m."product_id" = p."id" AND m."alt_text" IS NOT NULL) AS alt_text,
             (SELECT string_agg(c."name", ', ') FROM "shp_product_categories" pc
                JOIN "shp_categories" c ON c."id" = pc."category_id"
                WHERE pc."product_id" = p."id") AS category_names,
             (SELECT string_agg(t."name", ' ') FROM "shp_product_tags" pt
                JOIN "shp_tags" t ON t."id" = pt."tag_id"
                WHERE pt."product_id" = p."id") AS tag_names
      FROM "shp_products" p
      WHERE p."id" = ANY(${ids}) AND p."status" = 'ACTIVE' AND p."catalogue_hidden" = false
    `
    // Words another module holds for these products - shop-variations answers
    // with every variation's SKU, so a variation code finds the parent listing.
    const contributed = await resolveShopProductText(rows.map((r) => r.id as string))
    const productsAtRoot = await shopProductsAtRoot()
    return rows.map((r): SearchDocument => {
      const description = (r.description_puck ? extractPuckText(r.description_puck) : null)
        || ((r.description as string | null) ?? '')
      // Codes go in ahead of the description: a designed description can run to
      // tens of thousands of characters and the body is truncated at 100k before
      // it is turned into a tsvector, so anything short and precise sits early.
      const body = [
        (r.short_description as string | null) ?? '',
        (r.sku as string | null) ?? '',
        contributed.get(r.id as string) ?? '',
        description,
        (r.alt_text as string | null) ?? '',
        (r.tag_names as string | null) ?? '',
        (r.category_names as string | null) ?? '',
      ].filter(Boolean).join(' ')
      return {
        source: 'shop-product',
        entityId: r.id as string,
        title: r.name as string,
        excerpt: makeExcerpt((r.short_description as string | null) || description, opts.excerptLength),
        body,
        url: productsAtRoot ? `/${r.slug as string}` : `/shop/products/${r.slug as string}`,
        imageUrl: (r.image_url as string | null) ?? null,
        extra: r.category_names ? { categories: r.category_names as string } : null,
        tier: 'public',
        sourceUpdatedAt: (r.updated_at as Date | null) ?? null,
      }
    })
  },
}

export const shopCategoryAdapter: SearchAdapter = {
  source: 'shop-category',
  label: 'Shop categories',

  isAvailable(installed) {
    return installed.has('shop')
  },

  async listIds() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT c."id" FROM "shp_categories" c
      WHERE EXISTS (SELECT 1 FROM "shp_product_categories" pc WHERE pc."category_id" = c."id")
    `
    return rows.map((r) => r.id)
  },

  async listChangedSince(since) {
    if (!since) return shopCategoryAdapter.listIds()
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "shp_categories" WHERE "updated_at" > ${since}
    `
    return rows.map((r) => r.id)
  },

  async fetchDocuments(ids, opts) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT c."id", c."name", c."slug", c."short_description", c."description",
             c."description_puck", c."image_url", c."updated_at"
      FROM "shp_categories" c
      WHERE c."id" = ANY(${ids})
        AND EXISTS (SELECT 1 FROM "shp_product_categories" pc WHERE pc."category_id" = c."id")
    `
    return rows.map((r): SearchDocument => {
      const description = (r.description_puck ? extractPuckText(r.description_puck) : null)
        || ((r.description as string | null) ?? '')
      const body = [(r.short_description as string | null) ?? '', description].filter(Boolean).join(' ')
      return {
        source: 'shop-category',
        entityId: r.id as string,
        title: r.name as string,
        excerpt: makeExcerpt((r.short_description as string | null) || description, opts.excerptLength),
        body,
        url: `/shop/categories/${r.slug as string}`,
        imageUrl: (r.image_url as string | null) ?? null,
        extra: null,
        tier: 'public',
        sourceUpdatedAt: (r.updated_at as Date | null) ?? null,
      }
    })
  },
}

export const shopCollectionAdapter: SearchAdapter = {
  source: 'shop-collection',
  label: 'Shop collections',

  isAvailable(installed) {
    return installed.has('shop')
  },

  async listIds() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT col."id" FROM "shp_collections" col
      WHERE EXISTS (SELECT 1 FROM "shp_product_collections" pc WHERE pc."collection_id" = col."id")
    `
    return rows.map((r) => r.id)
  },

  async listChangedSince(since) {
    if (!since) return shopCollectionAdapter.listIds()
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "shp_collections" WHERE "updated_at" > ${since}
    `
    return rows.map((r) => r.id)
  },

  async fetchDocuments(ids, opts) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT col."id", col."name", col."slug", col."description", col."updated_at"
      FROM "shp_collections" col
      WHERE col."id" = ANY(${ids})
        AND EXISTS (SELECT 1 FROM "shp_product_collections" pc WHERE pc."collection_id" = col."id")
    `
    return rows.map((r): SearchDocument => {
      const description = (r.description as string | null) ?? ''
      return {
        source: 'shop-collection',
        entityId: r.id as string,
        title: r.name as string,
        excerpt: makeExcerpt(description, opts.excerptLength),
        body: description,
        url: `/shop/collections/${r.slug as string}`,
        imageUrl: null,
        extra: null,
        tier: 'public',
        sourceUpdatedAt: (r.updated_at as Date | null) ?? null,
      }
    })
  },
}
