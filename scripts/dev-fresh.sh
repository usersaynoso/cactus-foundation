#!/usr/bin/env bash
# Restart the local dev server cleanly:
#   1. Kill whatever is listening on the dev port.
#   2. Wait until the port is actually free (graceful, then force).
#   3. Only then start a fresh `next dev`.
# If the old server refuses to die, abort rather than start a second one.
#
# Usage: npm run dev:fresh        (or: bash scripts/dev-fresh.sh)
#        PORT=4000 npm run dev:fresh
set -euo pipefail

PORT="${PORT:-3000}"
export PORT

# PIDs currently listening on $PORT (empty string if none).
listeners() { lsof -ti "tcp:${PORT}" 2>/dev/null || true; }

pids="$(listeners)"
if [ -n "$pids" ]; then
  # shellcheck disable=SC2086
  echo "→ Stopping dev server on :${PORT} (PID(s): $(echo $pids))…"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true

  # Wait up to ~10s for a graceful shutdown.
  for _ in $(seq 1 20); do
    [ -z "$(listeners)" ] && break
    sleep 0.5
  done

  # Anything still holding the port gets SIGKILL.
  remaining="$(listeners)"
  if [ -n "$remaining" ]; then
    echo "→ Still alive, force-killing PID(s): ${remaining}"
    # shellcheck disable=SC2086
    kill -9 $remaining 2>/dev/null || true
    for _ in $(seq 1 10); do
      [ -z "$(listeners)" ] && break
      sleep 0.5
    done
  fi

  if [ -n "$(listeners)" ]; then
    echo "✗ Port ${PORT} is still in use - not starting a second server." >&2
    exit 1
  fi
  echo "✓ Port ${PORT} is free."
else
  echo "→ No existing dev server on :${PORT}."
fi

echo "→ Starting fresh dev server on :${PORT}…"
exec npm run dev
