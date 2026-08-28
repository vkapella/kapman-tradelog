#!/usr/bin/env bash

# Full production deploy: ship the app, then point the scheduled market-data
# Machine at the new image and re-arm its daily schedule.
#
# These two steps must stay together. `fly deploy` alone leaves the scheduled
# Machine on the previous image and, because it is never started, leaves it
# holding a `schedule = daily` config that Fly does not act on. That failure is
# silent: the last run stays SUCCEEDED while market data quietly ages.

set -euo pipefail

APP_NAME="${1:-kapman-tradelog}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v fly >/dev/null || { echo "fly CLI is required" >&2; exit 1; }

echo "==> Deploying ${APP_NAME} (runs prisma migrate deploy via release_command)"
fly deploy -a "${APP_NAME}"

echo
echo "==> Updating and re-arming the scheduled market-data Machine"
"${SCRIPT_DIR}/deploy-market-data-scheduler.sh" "${APP_NAME}"

echo
echo "==> Deploy complete. Confirm pipeline health at Diagnostics -> Scheduled pipeline,"
echo "    or: curl -sf -H "Authorization: Bearer \$API_BEARER_TOKEN" https://${APP_NAME}.fly.dev/api/scheduler/status"
