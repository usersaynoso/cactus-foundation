#!/usr/bin/env bash
# Cloud Agent install phase for Cactus.
#
# Idempotent: safe to run repeatedly and against a partially prepared VM. It
# prepares everything a fresh checkout needs to run `npm run dev` end to end:
#   - a local PostgreSQL (the one system dependency the default image lacks);
#   - Node dependencies;
#   - a local .env.local (only created if absent - a real one is never clobbered);
#   - the Prisma client, the full migration chain, and the generated module wiring.
#
# Long-running processes belong in start.sh / terminals, never here.
set -euo pipefail

PG_VERSION=16
PG_HOST=127.0.0.1
PG_PORT=5432
DB_NAME=cactus
DB_USER=cactus
DB_PASS=cactus

echo "→ [install] Ensuring PostgreSQL is installed…"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
fi

echo "→ [install] Starting PostgreSQL (needed to apply migrations during install)…"
if ! pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
  sudo pg_ctlcluster "$PG_VERSION" main start || true
fi
for _ in $(seq 1 30); do
  pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1 && break
  sleep 1
done

echo "→ [install] Ensuring the '$DB_USER' role and '$DB_NAME' database exist…"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS' SUPERUSER CREATEDB;"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "→ [install] Installing Node dependencies…"
npm install

if [ ! -f .env.local ]; then
  echo "→ [install] Writing a local .env.local (localhost dev, throwaway Postgres)…"
  SECRET="$(openssl rand -base64 32)"
  ENC_KEY="$(openssl rand -hex 32)"
  cat > .env.local <<EOF
# Local development env for Cloud Agent. Not committed (gitignored).
# Cactus runs in "local development mode" whenever Vercel's VERCEL=1 is absent.
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$PG_HOST:$PG_PORT/$DB_NAME?sslmode=disable
DIRECT_URL=postgresql://$DB_USER:$DB_PASS@$PG_HOST:$PG_PORT/$DB_NAME?sslmode=disable
SESSION_SECRET=$SECRET
# Needed to enrol an authenticator app (TOTP) and to store GitHub App creds.
ENCRYPTION_KEY=$ENC_KEY
SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
EOF
fi

# Load the local env so the Prisma/migration steps see DATABASE_URL + DIRECT_URL.
# (These node scripts read process.env directly; only Next.js auto-loads .env.local.)
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

echo "→ [install] Generating the Prisma client…"
npx prisma generate

echo "→ [install] Applying the migration chain (init → core reconcile → module migrations)…"
npx prisma migrate deploy
node scripts/reconcile-core-schema.mjs
node scripts/run-module-migrations.mjs

echo "→ [install] Generating module wiring…"
node scripts/generate-all.mjs

echo "✓ [install] Done."
