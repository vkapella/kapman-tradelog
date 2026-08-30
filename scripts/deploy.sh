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

# The build's short SHA is the release identifier. It is knowable at build
# time, never drifts, and is what a bug report needs.
# Deliberately NOT `git describe --tags`: this repo's only tags are archive/*
# refs, so describe emitted a 52-character path (the v37 header defect).
# Deliberately NOT the Fly release number: Fly assigns it after the image is
# built and does not expose it to the Machines runtime (no FLY_RELEASE_VERSION
# in the container env), so any value baked here would be an inference.
APP_GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
APP_VERSION="${APP_GIT_SHA}"

echo "==> Deploying ${APP_NAME} ${APP_VERSION} (runs prisma migrate deploy via release_command)"
fly deploy -a "${APP_NAME}" \
  --build-arg APP_VERSION="${APP_VERSION}" \
  --build-arg APP_GIT_SHA="${APP_GIT_SHA}"

echo
echo "==> Updating and re-arming the scheduled market-data Machine"
"${SCRIPT_DIR}/deploy-market-data-scheduler.sh" "${APP_NAME}"

echo
echo "==> Deploy complete. Confirm pipeline health at Diagnostics -> Scheduled pipeline,"
echo "    or: curl -sf -H "Authorization: Bearer \$API_BEARER_TOKEN" https://${APP_NAME}.fly.dev/api/scheduler/status"
