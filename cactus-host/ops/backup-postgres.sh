#!/bin/sh
# Nightly database backups: one compressed dump per database, seven days kept on the
# box, and a copy sent to Backblaze B2 with rclone.
#
# Needs an rclone remote called "b2" using rclone's NATIVE b2 backend (type = b2).
# B2's S3-compatible endpoint has refused writes with "AccessDenied: not entitled"
# even with the right key capabilities; the native backend does not.
#
# A database with its own destination (`cactus-host db destination <name> remote:path`,
# or `--backup` when it was made) is copied there instead, so two businesses on one
# box never share a bucket.
#
# A database cactus-host backs up on its own schedule (`cactus-host db schedule`, or the
# site's Backup & restore screen) is skipped here, so it is not dumped twice a night.
#
# Usage (as root, from cactus-postgres-backup.service):
#   backup-postgres.sh <bucket/path>
set -eu
DEST="${1:?usage: backup-postgres.sh <bucket/path>}"
DIR=/var/backups/cactus-db
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$DIR"
chmod 0700 "$DIR"

# Every database this script is responsible for: all of them, less the ones
# cactus-host schedules itself.
dbs=""
for db in $(sudo -u postgres psql -At -c "select datname from pg_database where not datistemplate and datname <> 'postgres'"); do
  if cactus-host db scheduled "$db" 2>/dev/null; then
    echo "skipped $db (cactus-host backs it up on its own schedule)"
    continue
  fi
  dbs="$dbs $db"
done

for db in $dbs; do
  out="$DIR/$db-$STAMP.dump"
  # Lowest priority, so a backup never slows a page down.
  nice -n 19 ionice -c3 sudo -u postgres pg_dump -Fc -d "$db" > "$out"
  echo "dumped $db ($(du -h "$out" | cut -f1))"
done

find "$DIR" -name '*.dump' -mtime +7 -delete

for db in $dbs; do
  own=$(cactus-host db destination "$db" 2>/dev/null || true)
  target="${own:-b2:$DEST}"
  rclone copy --transfers 2 --include "$db-*.dump" "$DIR" "$target"
  echo "copied $db to $target"
done
