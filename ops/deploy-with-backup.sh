#!/usr/bin/env bash
#
# Backup-then-deploy: the standard production deploy path for kapman-tradelog
# (#330). Two steps that must happen in this order, wrapped so the backup can
# never be skipped or run second:
#
#   1. ops/archive-db-to-mac.sh — verified pg_dump of the production database
#      into ../KapMan-DB-Archive (sha256 + row-count manifest; Backblaze sweeps
#      it off-machine). A failed or unreadable archive ABORTS the deploy.
#   2. npm run deploy — scripts/deploy.sh: fly deploy (release_command runs
#      `prisma migrate deploy` before new code takes traffic), then re-points
#      and re-arms the scheduled market-data Machine.
#   3. Post-deploy health check against https://<app>.fly.dev/api/health.
#
# Usage:
#   npm run deploy:safe            # or: ops/deploy-with-backup.sh [app-name]
#
# The app name defaults to kapman-tradelog and is passed through to both the
# archive script's defaults and scripts/deploy.sh.

set -euo pipefail

APP_NAME="${1:-kapman-tradelog}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() { printf '[deploy-safe] %s\n' "$*"; }
die() { printf '[deploy-safe] ERROR: %s\n' "$*" >&2; exit 1; }

command -v flyctl >/dev/null || command -v fly >/dev/null || die "fly CLI is required"
command -v npm >/dev/null || die "npm is required"

log "step 1/3 — archiving the production database (abort on failure)"
"${SCRIPT_DIR}/archive-db-to-mac.sh" || die "backup failed — deploy NOT started; fix the archive first"

log "step 2/3 — deploying ${APP_NAME} (migrations run in the release command)"
(cd "${REPO_DIR}" && npm run deploy -- "${APP_NAME}")

log "step 3/3 — post-deploy health check"
for attempt in 1 2 3 4 5 6; do
  if curl -sf --max-time 10 "https://${APP_NAME}.fly.dev/api/health" | grep -q '"ok"'; then
    log "health OK: https://${APP_NAME}.fly.dev/api/health"
    log "done. Scheduler health: Diagnostics -> Scheduled pipeline, or"
    log "  curl -sf -H "Authorization: Bearer \$API_BEARER_TOKEN" https://${APP_NAME}.fly.dev/api/scheduler/status"
    exit 0
  fi
  log "health not ready yet (attempt ${attempt}/6); retrying in 10s"
  sleep 10
done
die "health check failed after deploy — check fly logs -a ${APP_NAME}"
