# Story 01 - Refresh Seed Data From Attached CSV Files

## Context

The development seed currently imports committed fixture CSVs through `prisma/seed.ts`.
Replace the seeded fixture set with the five newly exported files supplied for this work so
local Docker startup reflects the latest Schwab and Fidelity data.

## Goal

Update seed data so `prisma db seed` loads these five files:

- `/Users/vkapella/Downloads/History_for_Account_X19467537-20-2026-05-29.csv`
- `/Users/vkapella/Downloads/History_for_Account_X19467537-20-2025.csv`
- `/Users/vkapella/Downloads/History_for_Account_X19467537-20-2024.csv`
- `/Users/vkapella/Downloads/2026-05-29-AccountStatement54.csv`
- `/Users/vkapella/Downloads/2026-05-29-AccountStatement53.csv`

## Implementation Notes

- Copy the five source CSVs into `/fixtures/` and commit the copied fixtures.
- Update `prisma/seed.ts` so `seedFiles` references the copied fixture filenames.
- Keep adapter-based seeding through `detectAdapter`; do not add broker-specific seed parsing branches.
- Preserve Fidelity cash snapshot hydration after Fidelity cash events are replaced.
- Preserve rebuild of matched lots and setup groups after each seeded import.
- Do not run or trigger any production deploy.

## Acceptance Criteria

- The five new CSV files are committed under `/fixtures/`.
- `prisma/seed.ts` uses only the five new fixture paths for development seeding.
- Schwab and Fidelity files are detected through the adapter registry during seed.
- Fidelity seeded snapshots include cash plus eligible money-market/core-cash handling.
- `docker compose up` runs migrations, seeds all five files, and starts the app locally.
- The local app is reachable at `http://localhost:3002`.
- Smoke checks pass:
  - `curl -sf http://localhost:3002/api/health | grep ok`
  - `curl -sf http://localhost:3002/api/overview/summary | grep netPnl`

## Validation Plan

Run and fix failures before opening the PR:

```bash
npm run typecheck
npm run lint
npm test -- --passWithNoTests
docker compose up -d --build
curl -sf http://localhost:3002/api/health | grep ok
curl -sf http://localhost:3002/api/overview/summary | grep netPnl
```
