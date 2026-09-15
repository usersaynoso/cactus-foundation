import { prisma } from '@/lib/db/prisma'
import { isAllowedLanguage, type SearchSettings, type SearchSourceKey } from './types'

export { ALLOWED_LANGUAGES, isAllowedLanguage } from './types'

function mapRow(r: Record<string, unknown>): SearchSettings {
  const language = r.language as string
  return {
    id: r.id as string,
    language: isAllowedLanguage(language) ? language : 'english',
    sources: (r.sources as SearchSettings['sources'] | null) ?? {},
    weights: (r.weights as SearchSettings['weights'] | null) ?? {},
    queryLogging: r.query_logging as boolean,
    logRetentionDays: r.log_retention_days as number,
    excerptLength: r.excerpt_length as number,
    lastIndexAt: (r.last_index_at as Date | null) ?? null,
    updatedAt: r.updated_at as Date,
  }
}

const DEFAULTS: SearchSettings = {
  id: 'singleton', language: 'english', sources: {}, weights: {},
  queryLogging: true, logRetentionDays: 90, excerptLength: 160,
  lastIndexAt: null, updatedAt: new Date(0),
}

export async function getSearchSettings(): Promise<SearchSettings> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "srch_settings" WHERE "id" = 'singleton' LIMIT 1
  `
  return rows[0] ? mapRow(rows[0]) : { ...DEFAULTS, updatedAt: new Date() }
}

export type UpdateSearchSettingsInput = Partial<{
  language: string
  sources: Partial<Record<SearchSourceKey, boolean>>
  weights: Partial<Record<SearchSourceKey, number>>
  queryLogging: boolean
  logRetentionDays: number
  excerptLength: number
}>

export async function updateSearchSettings(input: UpdateSearchSettingsInput): Promise<SearchSettings> {
  const current = await getSearchSettings()
  const merged = { ...current, ...input }
  if (!isAllowedLanguage(merged.language)) merged.language = 'english'
  merged.logRetentionDays = Math.max(1, Math.min(3650, Math.round(merged.logRetentionDays)))
  merged.excerptLength = Math.max(60, Math.min(600, Math.round(merged.excerptLength)))

  await prisma.$executeRaw`
    INSERT INTO "srch_settings" (
      "id", "language", "sources", "weights", "query_logging",
      "log_retention_days", "excerpt_length", "last_index_at", "updated_at"
    ) VALUES (
      'singleton', ${merged.language}, ${JSON.stringify(merged.sources)}::jsonb, ${JSON.stringify(merged.weights)}::jsonb,
      ${merged.queryLogging}, ${merged.logRetentionDays}, ${merged.excerptLength}, ${merged.lastIndexAt}, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("id") DO UPDATE SET
      "language" = ${merged.language},
      "sources" = ${JSON.stringify(merged.sources)}::jsonb,
      "weights" = ${JSON.stringify(merged.weights)}::jsonb,
      "query_logging" = ${merged.queryLogging},
      "log_retention_days" = ${merged.logRetentionDays},
      "excerpt_length" = ${merged.excerptLength},
      "updated_at" = CURRENT_TIMESTAMP
  `
  return getSearchSettings()
}

export async function setLastIndexAt(at: Date): Promise<void> {
  // Ensure the row exists first so a fresh install's very first index run sticks.
  await prisma.$executeRaw`
    INSERT INTO "srch_settings" ("id", "last_index_at") VALUES ('singleton', ${at})
    ON CONFLICT ("id") DO UPDATE SET "last_index_at" = ${at}
  `
}
