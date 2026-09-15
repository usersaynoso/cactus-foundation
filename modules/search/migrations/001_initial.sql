-- Search Module - Initial Migration
-- Table prefix: srch_
-- Applied once by the Cactus module migration runner during build.

CREATE TABLE IF NOT EXISTS "srch_settings" (
  "id"                 TEXT PRIMARY KEY DEFAULT 'singleton',
  -- Postgres regconfig name; validated against an allowlist in lib/settings.ts
  "language"           TEXT NOT NULL DEFAULT 'english',
  -- Master per-source switches: { "shop-product": true, ... }. Absent key = enabled.
  "sources"            JSONB NOT NULL DEFAULT '{}',
  -- Optional per-source rank multipliers: { "page": 1.0, ... }. Absent key = 1.
  "weights"            JSONB NOT NULL DEFAULT '{}',
  "query_logging"      BOOLEAN NOT NULL DEFAULT true,
  "log_retention_days" INTEGER NOT NULL DEFAULT 90,
  "excerpt_length"     INTEGER NOT NULL DEFAULT 160,
  -- High-water mark of the last COMPLETED index run (drives incremental runs)
  "last_index_at"      TIMESTAMPTZ,
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The search index. One row per public entity; text is extracted at index time
-- (Puck JSONB bodies cannot be tsvector-indexed in place). search_vector is a
-- plain column written by the indexer, not a generated column, so the language
-- can be a setting rather than baked-in DDL.
CREATE TABLE IF NOT EXISTS "srch_documents" (
  "id"                TEXT PRIMARY KEY,
  "source"            TEXT NOT NULL,
  "entity_id"         TEXT NOT NULL,
  "title"             TEXT NOT NULL,
  "excerpt"           TEXT,
  "body"              TEXT NOT NULL DEFAULT '',
  "url"               TEXT NOT NULL,
  -- Plain stored URL, never a signed URL
  "image_url"         TEXT,
  -- Card data: category names, author, badge label - text only, never prices/stock
  "extra"             JSONB,
  -- 'public' | 'members' (members-only boards / member profiles)
  "tier"              TEXT NOT NULL DEFAULT 'public',
  "source_updated_at" TIMESTAMPTZ,
  "indexed_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "search_vector"     TSVECTOR NOT NULL,
  CONSTRAINT "srch_documents_source_entity_key" UNIQUE ("source", "entity_id")
);

CREATE INDEX IF NOT EXISTS "srch_documents_vector_idx" ON "srch_documents" USING GIN ("search_vector");
CREATE INDEX IF NOT EXISTS "srch_documents_source_idx" ON "srch_documents" ("source");

-- Query log for the admin analytics view. Query text and counts only - no IPs,
-- no session or user ids. Purged past log_retention_days by the cron route.
CREATE TABLE IF NOT EXISTS "srch_queries" (
  "id"           TEXT PRIMARY KEY,
  "query"        TEXT NOT NULL,
  "normalized"   TEXT NOT NULL,
  "result_count" INTEGER NOT NULL,
  "sources"      TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "srch_queries_created_idx" ON "srch_queries" ("created_at");
CREATE INDEX IF NOT EXISTS "srch_queries_normalized_idx" ON "srch_queries" ("normalized");
