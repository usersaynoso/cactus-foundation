# deskwell-product-import

A Claude Code skill for importing supplier product lists into the Deskwell shop
catalogue: fewest possible listings, variations bundled onto options, hard maximum of
four options per listing.

`SKILL.md` is the instruction set Claude reads. This file is for whoever is setting it up.

## Install in your checkout

The skill's files are tracked here under `.agents/skills/`, but Claude Code discovers
skills from `.claude/skills/`, which is not tracked. So each checkout needs the symlink
once - the same step the `neon-postgres-egress-optimizer` skill needs:

```bash
ln -s ../../.agents/skills/deskwell-product-import .claude/skills/deskwell-product-import
```

## What it needs to run

- `psql` from libpq. On macOS homebrew keeps it off PATH, so the scripts look in
  `/opt/homebrew/opt/libpq/bin` and `/usr/local/opt/libpq/bin`; set `PSQL_BIN` if yours
  lives elsewhere.
- `DIRECT_URL` (or `DATABASE_URL`) in the repo's root `.env` - the scripts find the repo
  by walking up from their own location, and `CACTUS_ROOT` overrides that.
- Python 3, standard library only.
- `rclone` plus `B2_KEY_ID` / `B2_KEY` in the same `.env`, whenever the import has
  images: it lists the landing folder so variations get their photos, and
  `file_media.py` uses it to copy each blob to its canonical per-product folder
  (server-side) and to hide the originals. An image-free import needs neither.

## Shape of it

| Path | What it is |
|---|---|
| `SKILL.md` | the workflow Claude follows |
| `references/catalogue_conventions.md` | how the existing catalogue bundles, prices and files products |
| `references/bundling_worked_examples.md` | real before/after cases from the July 2026 import |
| `scripts/analyse_catalogue.py` | read-only survey of the live catalogue + duplicate detection |
| `scripts/import_config.py` | the per-import rules - the file you edit for a new supplier |
| `scripts/import_lib.py` | the planning and SQL-writing engine |
| `scripts/run_import.py` | `plan` / `emit` / `sql` / `check` / `apply` |
| `scripts/file_media.py` | `copy` / `finish` - blobs from `media/dynamic` to their canonical per-product folders, media-library rows re-pointed, originals hidden |
| `scripts/graft_variants.py` | add variations to a listing that already exists |
| `scripts/verify.sql` | integrity checks, run inside the dry run and again after applying |

## Safety

Nothing writes to the database until `apply`. `check` runs the real import inside a
transaction that rolls back, which is safe against live and is what proves the
constraints hold. `apply` is a single transaction, and `sql --replace-since` deletes an
earlier run of the same import first so the shop is never missing products mid-flight.

On the storage side, `file_media.py copy` only ever adds copies (server-side, verified
afterwards), and the `finish` step's tidy-up of the originals is a hide, not a delete -
the rclone remote runs with `hard_delete=false`, so B2 keeps every hidden file as a
recoverable version.

The one thing the skill deliberately will not do is Push to the catalogue Google Sheet -
that writes to the owner's spreadsheet, so it stays a human decision. It does need doing
after an import, though: the sheet integration treats a database product it cannot find
in the sheet as a deletion candidate.
