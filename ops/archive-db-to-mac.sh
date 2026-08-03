#!/usr/bin/env bash
#
# Archive the production KapMan database to this Mac.
#
# Read-only against production: takes a `pg_dump` on the Postgres Machine,
# copies it down, verifies it is readable, and stores it in the archive
# directory where Backblaze Personal Backup picks it up off-machine.
#
# The dump is written alongside a row-count manifest captured from production
# at dump time, so `ops/verify-backup.sh` can later confirm a restore matches
# what production actually held — without needing a second production
# connection.
#
# This script NEVER deletes an archive. Pruning is manual and deliberate; see
# RUNBOOK.md section D.
#
# Usage:
#   ops/archive-db-to-mac.sh
#
# Environment overrides:
#   KAPMAN_DB_APP          Fly Postgres app        (default kapman-tradelog-db)
#   KAPMAN_DB_NAME         Database name           (default kapman_tradelog)
#   KAPMAN_ARCHIVE_DIR     Archive destination
#                          (default: App Development/KapMan-DB-Archive, beside
#                          the repo). Must be outside any git working tree.
#   KAPMAN_MIN_DUMP_BYTES  Size floor for sanity   (default 1000000)

set -euo pipefail

APP_DB="${KAPMAN_DB_APP:-kapman-tradelog-db}"
DB_NAME="${KAPMAN_DB_NAME:-kapman_tradelog}"
# Sits beside the repo in App Development/, deliberately NOT inside it — the
# guard below refuses any archive dir within a git working tree, because
# untracked dumps are what `git clean -fd` deletes and `git add -A` commits.
# Note: this APFS volume has `Owners: Disabled`, so the chmod below is
# cosmetic — POSIX permissions are not enforced here.
ARCHIVE_DIR="${KAPMAN_ARCHIVE_DIR:-/Volumes/OWC Envoy Pro SX/App Development/KapMan-DB-Archive}"
MIN_DUMP_BYTES="${KAPMAN_MIN_DUMP_BYTES:-1000000}"
PG_IMAGE="postgres:17-alpine"

log()  { printf '[archive-db] %s\n' "$*"; }
warn() { printf '[archive-db] WARNING: %s\n' "$*" >&2; }
die()  { printf '[archive-db] ERROR: %s\n' "$*" >&2; exit 1; }

command -v flyctl >/dev/null || die "flyctl is required"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REMOTE_DUMP="/tmp/kapman_archive_${STAMP}.dump"
BASENAME="kapman_prod_${STAMP}"
STAGING="$(mktemp -d)"

cleanup() {
  rm -rf "$STAGING"
  # Best-effort: never leave a copy of production data on the Machine's /tmp.
  flyctl ssh console -a "$APP_DB" -C "bash -c 'rm -f ${REMOTE_DUMP}'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Run a script on the Postgres Machine. Base64 avoids every layer of nested
# shell quoting between here and the remote bash.
remote() {
  local encoded
  encoded="$(printf '%s' "$1" | base64 | tr -d '\n')"
  flyctl ssh console -a "$APP_DB" -C "bash -c 'echo ${encoded} | base64 -d | bash'" 2>/dev/null \
    | sed '/^Connecting to /d' | tr -d '\r'
}

mkdir -p "$ARCHIVE_DIR"
chmod 700 "$ARCHIVE_DIR" 2>/dev/null || true  # no-op on volumes with owners disabled

# The archive must never sit inside a git working tree — untracked dumps are
# what `git clean` removes, and financial data must not land in a repo history.
if git -C "$ARCHIVE_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
  die "archive dir ${ARCHIVE_DIR} is inside a git repository ($(git -C "$ARCHIVE_DIR" rev-parse --show-toplevel)) — choose a path outside any repo via KAPMAN_ARCHIVE_DIR"
fi

log "archiving ${APP_DB}/${DB_NAME} -> ${ARCHIVE_DIR}"

# ---------------------------------------------------------------------------
# 1. Row-count manifest, captured from production at dump time.
# ---------------------------------------------------------------------------
log "capturing row-count manifest from production"
MANIFEST="$(remote "
set -e
export PGPASSWORD=\"\$OPERATOR_PASSWORD\"
psql -h localhost -U postgres -d ${DB_NAME} -A -t \
  -c 'select relname from pg_stat_user_tables order by relname' \
| while read -r t; do
    [ -z \"\$t\" ] && continue
    printf '%s=' \"\$t\"
    psql -h localhost -U postgres -d ${DB_NAME} -A -t -c \"select count(*) from \\\"\$t\\\"\"
  done
")"

[ -n "$MANIFEST" ] || die "manifest came back empty — could not reach production"
MANIFEST_TABLES="$(printf '%s\n' "$MANIFEST" | grep -c '=' || true)"
[ "$MANIFEST_TABLES" -gt 0 ] || die "manifest contained no tables"
log "manifest: ${MANIFEST_TABLES} tables"

# ---------------------------------------------------------------------------
# 2. Dump on the Machine (pg_dump version always matches the server there).
# ---------------------------------------------------------------------------
log "running pg_dump on the Postgres Machine"
DUMP_RESULT="$(remote "
set -e
export PGPASSWORD=\"\$OPERATOR_PASSWORD\"
pg_dump -h localhost -U postgres -d ${DB_NAME} -Fc -f ${REMOTE_DUMP}
stat -c %s ${REMOTE_DUMP}
")"

REMOTE_BYTES="$(printf '%s\n' "$DUMP_RESULT" | tail -n1 | tr -dc '0-9')"
[ -n "$REMOTE_BYTES" ] || die "pg_dump did not report a size — dump likely failed"
log "remote dump: ${REMOTE_BYTES} bytes"

# ---------------------------------------------------------------------------
# 3. Copy down and confirm the transfer was byte-exact.
# ---------------------------------------------------------------------------
log "transferring dump to this Mac"
flyctl ssh sftp get "$REMOTE_DUMP" "${STAGING}/${BASENAME}.dump" -a "$APP_DB" >/dev/null

[ -f "${STAGING}/${BASENAME}.dump" ] || die "transfer produced no file"
LOCAL_BYTES="$(wc -c < "${STAGING}/${BASENAME}.dump" | tr -d ' ')"

[ "$LOCAL_BYTES" = "$REMOTE_BYTES" ] \
  || die "size mismatch: remote ${REMOTE_BYTES} vs local ${LOCAL_BYTES}"
[ "$LOCAL_BYTES" -ge "$MIN_DUMP_BYTES" ] \
  || die "dump is only ${LOCAL_BYTES} bytes (floor ${MIN_DUMP_BYTES}) — refusing to archive a suspect file"
log "transfer verified byte-exact: ${LOCAL_BYTES} bytes"

# ---------------------------------------------------------------------------
# 4. Prove the archive is readable and complete before trusting it.
# ---------------------------------------------------------------------------
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  log "verifying archive is readable (pg_restore -l)"
  TOC="$(docker run --rm -v "${STAGING}:/b:ro" "$PG_IMAGE" \
    pg_restore -l "/b/${BASENAME}.dump" 2>/dev/null)" \
    || die "pg_restore could not read the dump — archive is corrupt"

  TOC_TABLES="$(printf '%s\n' "$TOC" | grep -c 'TABLE DATA' || true)"
  [ "$TOC_TABLES" = "$MANIFEST_TABLES" ] \
    || die "dump holds ${TOC_TABLES} tables but production reported ${MANIFEST_TABLES}"
  log "archive readable: ${TOC_TABLES} tables present, matching production"
else
  warn "docker unavailable — skipping readability check. Run ops/verify-backup.sh when docker is up."
fi

# ---------------------------------------------------------------------------
# 5. Move into the archive. Nothing is ever deleted here.
# ---------------------------------------------------------------------------
printf '%s\n' "$MANIFEST" > "${STAGING}/${BASENAME}.manifest.txt"
shasum -a 256 "${STAGING}/${BASENAME}.dump" | awk '{print $1}' > "${STAGING}/${BASENAME}.sha256"

mv "${STAGING}/${BASENAME}.dump"         "${ARCHIVE_DIR}/"
mv "${STAGING}/${BASENAME}.manifest.txt" "${ARCHIVE_DIR}/"
mv "${STAGING}/${BASENAME}.sha256"       "${ARCHIVE_DIR}/"

log "archived:"
log "  ${ARCHIVE_DIR}/${BASENAME}.dump"
log "  ${ARCHIVE_DIR}/${BASENAME}.manifest.txt"
log "  ${ARCHIVE_DIR}/${BASENAME}.sha256"
log "archive now holds $(find "$ARCHIVE_DIR" -name '*.dump' | wc -l | tr -d ' ') dump(s), $(du -sh "$ARCHIVE_DIR" | awk '{print $1}') total"
log "done"
