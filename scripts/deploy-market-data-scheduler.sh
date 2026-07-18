#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${1:-kapman-tradelog}"
MACHINE_NAME="market-data-daily"
REGION="${FLY_PRIMARY_REGION:-iad}"
PUBLICATION_LAG_DAYS="${MARKET_DATA_PUBLICATION_LAG_DAYS:-2}"
LEASE_MINUTES="${MARKET_DATA_PIPELINE_LEASE_MINUTES:-60}"

command -v fly >/dev/null || { echo "fly CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

MACHINES_JSON="$(fly machine list --json -a "${APP_NAME}")"
CURRENT_IMAGE="$(printf '%s' "${MACHINES_JSON}" | jq -r '[.[] | select(.config.metadata.fly_process_group == "app")][0].config.image // empty')"
EXISTING_ID="$(printf '%s' "${MACHINES_JSON}" | jq -r --arg name "${MACHINE_NAME}" '.[] | select(.name == $name) | .id' | head -n 1)"

if [[ -z "${CURRENT_IMAGE}" ]]; then
  echo "Could not resolve the current production app image for ${APP_NAME}." >&2
  exit 1
fi

if [[ -n "${EXISTING_ID}" ]]; then
  fly machine update "${EXISTING_ID}" \
    -a "${APP_NAME}" \
    --image "${CURRENT_IMAGE}" \
    --schedule daily \
    --restart no \
    --vm-size shared-cpu-1x \
    --vm-memory 1024 \
    --env "MARKET_DATA_PUBLICATION_LAG_DAYS=${PUBLICATION_LAG_DAYS}" \
    --env "MARKET_DATA_PIPELINE_LEASE_MINUTES=${LEASE_MINUTES}" \
    --command "timeout --signal=TERM 45m npm run scheduled:market-data" \
    --skip-start \
    --yes
  echo "Updated scheduled Machine ${MACHINE_NAME} (${EXISTING_ID}) to ${CURRENT_IMAGE}."
else
  fly machine run "${CURRENT_IMAGE}" \
    -a "${APP_NAME}" \
    --name "${MACHINE_NAME}" \
    --region "${REGION}" \
    --schedule daily \
    --restart no \
    --vm-size shared-cpu-1x \
    --vm-memory 1024 \
    --env "MARKET_DATA_PUBLICATION_LAG_DAYS=${PUBLICATION_LAG_DAYS}" \
    --env "MARKET_DATA_PIPELINE_LEASE_MINUTES=${LEASE_MINUTES}" \
    -- timeout --signal=TERM 45m npm run scheduled:market-data
  echo "Created scheduled Machine ${MACHINE_NAME} from ${CURRENT_IMAGE}."
fi
