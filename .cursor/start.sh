#!/usr/bin/env bash
# Cloud Agent start phase for Cactus.
#
# Runs on every boot. The PostgreSQL process does not survive from the install
# phase (or from a snapshot), so bring it back up and wait until it accepts
# connections. The database contents (migrations already applied) persist on
# disk, so this is a plain daemon start - no schema work belongs here.
set -euo pipefail

PG_VERSION=16
PG_HOST=127.0.0.1
PG_PORT=5432

echo "→ [start] Starting PostgreSQL…"
if ! pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
  sudo pg_ctlcluster "$PG_VERSION" main start || true
fi

for _ in $(seq 1 30); do
  if pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
    echo "✓ [start] PostgreSQL is accepting connections on $PG_HOST:$PG_PORT."
    exit 0
  fi
  sleep 1
done

echo "✗ [start] PostgreSQL did not become ready in time." >&2
exit 1
