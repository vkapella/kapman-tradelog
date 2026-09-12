# Kapman secrets design

Date: 2026-09-12. Status: proposed design; no credential or deployment changes authorized or performed. Operational owner: Kapman operator. Tracking: [kapman-tradelog#378](https://github.com/vkapella/kapman-tradelog/issues/378).

## Decision

Adopt **Google Cloud Secret Manager (GSM)** in a project under the Cloud organization associated with **`kapmancapital.com`**, with IAM per person for the operator and Ron, Workload Identity Federation for GitHub Actions (no static Google keys), a gcloud-based local process wrapper, per-app Fly synchronization and audit logging. Keep **Apple Passwords shared groups for human-only logins**. Fly remains a runtime distribution destination; dynamically refreshed Schwab OAuth state stays on its existing volume.

This is the operator's explicit design selection on 2026-09-12. Both operators already use Apple Passwords and Google Workspace; there is no 1Password account. The actual Cloud organization/project/billing and effective IAM remain to be verified, and gcloud is not installed on this machine. Claude.ai connector ownership/storage is unverified; Schwab and Polygon are suspected. Nothing in this design makes arbitrary AI-controlled code safe to run with production credentials.

The immediate priority is revocation of historically exposed credentials after replacement and coordinated consumer cutover. In particular, a historical Tradelog `.env` contains the same token-bearing MCP URL as the current local Tradelog/Research files. Trader history also contains provider credentials, including an Anthropic key that matches the current local file. No provider validity checks were attempted; matching local material does not prove the provider still accepts it.

## Assessment method and limits

All 20 Git repositories under `/Volumes/OWC Envoy Pro SX/App Development/` were enumerated, including a second traversal for nested repositories. Dependency trees and Git internals were excluded from source-variable extraction. Tracked source, shell scripts, examples, Compose, Dockerfiles, Fly configuration, workflow references, named env helpers, and local environment-file **keys** were inspected. Local value equality was compared only inside a process; no values, partial values, or secret hashes are published. Code/default declarations are evidence of an input, not evidence that production supplies or uses it. Tests, archived applications, and vendored assessment evidence are explicitly distinguished below.

Fly secret **names** were retrieved for all seven requested apps using `fly secrets list -a APP --json`. GitHub repository secret names/timestamps were retrieved with `gh secret list --json name,updatedAt`: 19 successful repo queries, one unavailable upstream repo. Neither API exposes secret plaintext. Therefore, local/Fly/GitHub value equality and drift were **not verified**. GitHub environment-level and organization-level inheritance were not exhaustively audited. No Fly shell environment dump, token-file download, shell-history dump, or Claude transcript export was performed.

History: checksum-verified temporary **gitleaks v8.30.1**, default rules, `git --log-opts="--all --full-history" --redact=100 --ignore-gitleaks-allow`, all 20 local repositories, all non-shallow. Every scan completed; findings exits were distinguished from scanner failures. A supplemental in-memory exact-match search of added historical lines against current local credential material caught a tokenized URL missed by default rules. Coverage is all locally reachable refs; unreachable objects, remote-only refs absent locally, LFS content, compressed attachments, remote logs, screenshots, external backups, and deleted transcripts are not certified clean. A zero finding count is not proof of absence.

### Verified corrections to the starting facts

- Ten root plaintext `.env` files exist, all ignored and none tracked **at current HEAD**. That statement is not true of history: Tradelog tracked `.env`, and Trader tracked `.env.backup`.
- Fly currently lists **10 / 12 / 7** entries for Tradelog / Schwab / Viewer, not 11 / 13 / 8. Polygon v2: 3; Finnhub: 2; Fair Value: 1; Tradelog DB: 6. Some entries are plain configuration rather than secrets.
- `direnv` is installed; `op`, `doppler`, `infisical`, `sops`, `age`, `gitleaks`, and `trufflehog` were absent from PATH before the temporary scanner install. `/Applications/1Password.app` was absent; the operator confirms no account.
- No active non-sample Git hook, configured `core.hooksPath`, tracked gitleaks/trufflehog/SOPS configuration, or tracked pre-commit configuration was found across the 20 checkouts. This does not establish whether GitHub platform secret protection is enabled or whether external systems exist.
- The current Schwab checkout has no `Secrets 260309` directory. Its absence does not prove deletion from backups, other machines, or history.
- Schwab `release.yml` deploys and performs production smoke checks. `container.yml` builds/publishes an image using GitHub's generated `GITHUB_TOKEN`; it does not deploy to Fly.
- Global Claude Code settings and KB project settings contain no permission deny rules; they do not establish the effective configuration of every running session.

## Unified inventory

One row per discovered input, plus explicit rows for repositories with none and for Fly-managed DB/runtime state. Paths link to this machine's checkout; line numbers refer to the audited checkout unless a commit is specified. **S** = secret or potentially credential-bearing URL; **I** = identifier, not independently a bearer secret, retained with its credential bundle; **C** = ordinary configuration. A client ID, audience tag, path, bucket, or hostname is not a secret merely because Fly stores it in its secrets service.

Storage: **L** = local ignored `.env` key (presence, not necessarily a nonempty value); **F** = Fly secret-name listing; **G** = GitHub repo-secret listing; **E** = committed example only; **D** = committed default/configuration; **R** = source/workflow reference with actual storage unverified; **T** = test fixture/input; **V** = runtime volume. `GITHUB_TOKEN` is GitHub-generated and is not a manually provisioned repo secret. No Fly query was made for apps outside the seven explicitly named; repositories outside that set may have additional deployments.

Remote observations below were made on 2026-09-12. F/G claims are sourced to the named read-only API command, not inferred from source paths. Every source/input and local-file claim has a file citation. Rows with only E/R/T do not imply that a credential is currently provisioned. Claude.ai connector storage remains unverified for all rows.

| Repository / app | Input | Class | Observed storage / scope | File evidence |
|---|---|---|---|---|
| kapman-tradelog | `API_BEARER_TOKEN` | S | L; F: kapman-tradelog; R: source/tool | [kapman-tradelog/.env:25](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:25>)<br>[kapman-tradelog/src/middleware.ts:104](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/middleware.ts:104>) |
| kapman-tradelog | `APP_GIT_SHA` | C | D; R: source/tool | [kapman-tradelog/Dockerfile:22](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/Dockerfile:22>)<br>[kapman-tradelog/src/app/api/health/route.ts:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/app/api/health/route.ts:9>) |
| kapman-tradelog | `APP_VERSION` | C | D; R: source/tool | [kapman-tradelog/Dockerfile:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/Dockerfile:21>)<br>[kapman-tradelog/src/app/api/health/route.ts:8](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/app/api/health/route.ts:8>) |
| kapman-tradelog | `AWS_ACCESS_KEY_ID` | I | L; F: kapman-tradelog; E | [kapman-tradelog/.env:17](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:17>)<br>[kapman-tradelog/.env.example:22](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:22>) |
| kapman-tradelog | `AWS_SECRET_ACCESS_KEY` | S | L; F: kapman-tradelog; E | [kapman-tradelog/.env:18](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:18>)<br>[kapman-tradelog/.env.example:23](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:23>) |
| kapman-tradelog | `BASIC_AUTH_PASSWORD` | S | L; F: kapman-tradelog | [kapman-tradelog/.env:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:15>) |
| kapman-tradelog | `BASIC_AUTH_USER` | I | L; F: kapman-tradelog | [kapman-tradelog/.env:14](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:14>) |
| kapman-tradelog | `CF_ACCESS_AUD` | C | E; D | [kapman-tradelog/.env.example:16](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:16>)<br>[kapman-tradelog/fly.toml:20](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/fly.toml:20>) |
| kapman-tradelog | `CF_ACCESS_TEAM_DOMAIN` | C | E; D | [kapman-tradelog/.env.example:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:15>)<br>[kapman-tradelog/fly.toml:19](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/fly.toml:19>) |
| kapman-tradelog | `CONTRAST_BASE_URL` | C | R: source/tool | [kapman-tradelog/scripts/check-contrast.ts:26](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/check-contrast.ts:26>) |
| kapman-tradelog | `CONTRAST_ROUTES` | C | R: source/tool | [kapman-tradelog/scripts/check-contrast.ts:35](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/check-contrast.ts:35>) |
| kapman-tradelog | `DATABASE_URL` | S | L; F: kapman-tradelog; E; D; R: source/tool | [kapman-tradelog/.env:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:1>)<br>[kapman-tradelog/.env.example:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:1>)<br>[kapman-tradelog/Dockerfile:16](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/Dockerfile:16>)<br>[kapman-tradelog/prisma/schema.prisma:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/prisma/schema.prisma:7>) |
| kapman-tradelog | `FLY_MACHINE_ID` | C | R: source/tool | [kapman-tradelog/src/app/api/health/route.ts:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/app/api/health/route.ts:10>) |
| kapman-tradelog | `FLY_PRIMARY_REGION` | C | R: source/tool | [kapman-tradelog/scripts/deploy-market-data-scheduler.sh:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/deploy-market-data-scheduler.sh:7>) |
| kapman-tradelog | `KAPMAN_APP_CSS` | C | R: source/tool | [kapman-tradelog/scripts/check-design-system.mjs:55](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/check-design-system.mjs:55>) |
| kapman-tradelog | `KAPMAN_APP_SRC` | C | R: source/tool | [kapman-tradelog/scripts/check-design-system.mjs:32](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/check-design-system.mjs:32>) |
| kapman-tradelog | `KAPMAN_ARCHIVE_DIR` | C | R: source/tool | [kapman-tradelog/ops/archive-db-to-mac.sh:37](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:37>) |
| kapman-tradelog | `KAPMAN_DB_APP` | C | R: source/tool | [kapman-tradelog/ops/archive-db-to-mac.sh:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:30>) |
| kapman-tradelog | `KAPMAN_DB_NAME` | C | R: source/tool | [kapman-tradelog/ops/archive-db-to-mac.sh:31](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:31>) |
| kapman-tradelog | `KAPMAN_JOURNAL_DIR` | C | R: source/tool | [kapman-tradelog/scripts/ingest-recommendations.ts:36](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/ingest-recommendations.ts:36>) |
| kapman-tradelog | `KAPMAN_MIN_DUMP_BYTES` | C | R: source/tool | [kapman-tradelog/ops/archive-db-to-mac.sh:38](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:38>) |
| kapman-tradelog | `KAPMAN_THEME_SOURCE` | C | R: source/tool | [kapman-tradelog/scripts/check-design-system.mjs:46](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/check-design-system.mjs:46>) |
| kapman-tradelog | `KAPMAN_VENDOR_DIR` | C | R: source/tool | [kapman-tradelog/scripts/check-design-system.mjs:43](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/check-design-system.mjs:43>) |
| kapman-tradelog | `MARKET_DATA_PIPELINE_LEASE_MINUTES` | C | E; R: source/tool | [kapman-tradelog/.env.example:40](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:40>)<br>[kapman-tradelog/scripts/deploy-market-data-scheduler.sh:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/deploy-market-data-scheduler.sh:9>) |
| kapman-tradelog | `MARKET_DATA_PUBLICATION_LAG_DAYS` | C | E; R: source/tool | [kapman-tradelog/.env.example:38](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:38>)<br>[kapman-tradelog/scripts/deploy-market-data-scheduler.sh:8](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/deploy-market-data-scheduler.sh:8>) |
| kapman-tradelog | `MARKET_DATA_RUN_RETENTION_DAYS` | C | E; R: source/tool | [kapman-tradelog/.env.example:44](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:44>)<br>[kapman-tradelog/scripts/run-scheduled-market-data.ts:67](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/scripts/run-scheduled-market-data.ts:67>) |
| kapman-tradelog | `MCP_BEARER_TOKEN` | S | L; E; R: source/tool | [kapman-tradelog/.env:8](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:8>)<br>[kapman-tradelog/.env.example:8](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:8>)<br>[kapman-tradelog/src/lib/mcp/client.test.ts:35](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/lib/mcp/client.test.ts:35>) |
| kapman-tradelog | `MCP_SERVER_URL` | S | L; F: kapman-tradelog; E; R: source/tool | [kapman-tradelog/.env:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:6>)<br>[kapman-tradelog/.env.example:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:6>)<br>[kapman-tradelog/src/lib/mcp/client.test.ts:34](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/lib/mcp/client.test.ts:34>) |
| kapman-tradelog | `NEXT_PUBLIC_DEBUG_PERF` | C | R: source/tool | [kapman-tradelog/src/lib/positions/compute-position-snapshot.ts:24](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/lib/positions/compute-position-snapshot.ts:24>) |
| kapman-tradelog | `NEXT_TELEMETRY_DISABLED` | C | L; E; D | [kapman-tradelog/.env:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:3>)<br>[kapman-tradelog/.env.example:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:3>)<br>[kapman-tradelog/Dockerfile:17](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/Dockerfile:17>) |
| kapman-tradelog | `NODE_ENV` | C | L; E; D; R: source/tool | [kapman-tradelog/.env:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:2>)<br>[kapman-tradelog/.env.example:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:2>)<br>[kapman-tradelog/Dockerfile:28](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/Dockerfile:28>)<br>[kapman-tradelog/src/lib/db/prisma.ts:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/lib/db/prisma.ts:9>) |
| kapman-tradelog | `PIPELINE_ALERT_FORMAT` | C | E | [kapman-tradelog/.env.example:68](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:68>) |
| kapman-tradelog | `PIPELINE_ALERT_FRESHNESS_LAG_DAYS` | C | E | [kapman-tradelog/.env.example:55](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:55>) |
| kapman-tradelog | `PIPELINE_ALERT_LOCK_CONTENTION_THRESHOLD` | C | E | [kapman-tradelog/.env.example:58](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:58>) |
| kapman-tradelog | `PIPELINE_ALERT_REPEAT_MINUTES` | C | E | [kapman-tradelog/.env.example:61](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:61>) |
| kapman-tradelog | `PIPELINE_ALERT_TIMEOUT_MS` | C | E | [kapman-tradelog/.env.example:63](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:63>) |
| kapman-tradelog | `PIPELINE_ALERT_WEBHOOK_URL` | S | E | [kapman-tradelog/.env.example:52](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:52>) |
| kapman-tradelog | `PIPELINE_HEARTBEAT_TIMEOUT_MS` | C | E | [kapman-tradelog/.env.example:80](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:80>) |
| kapman-tradelog | `PIPELINE_HEARTBEAT_URL` | S | F: kapman-tradelog; E | [kapman-tradelog/.env.example:78](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:78>) |
| kapman-tradelog | `POLYGON_API_KEY` | S | L; E; R: source/tool | [kapman-tradelog/.env:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:21>)<br>[kapman-tradelog/.env.example:35](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:35>)<br>[kapman-tradelog/src/lib/marketdata/ingest-option-marks.ts:439](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/lib/marketdata/ingest-option-marks.ts:439>) |
| kapman-tradelog | `POLYGON_HISTORICAL_LOOKBACK_YEARS` | C | E | [kapman-tradelog/.env.example:29](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:29>) |
| kapman-tradelog | `POLYGON_HISTORICAL_MARKS_START_DATE` | C | E | [kapman-tradelog/.env.example:32](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:32>) |
| kapman-tradelog | `POLYGON_S3_EQUITY_PREFIX` | C | L; E | [kapman-tradelog/.env:22](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:22>)<br>[kapman-tradelog/.env.example:24](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:24>) |
| kapman-tradelog | `POLYGON_S3_OPTIONS_PREFIX` | C | L; E | [kapman-tradelog/.env:23](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:23>)<br>[kapman-tradelog/.env.example:25](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:25>) |
| kapman-tradelog | `POSTGRES_DB` | C | D | [kapman-tradelog/docker-compose.yml:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/docker-compose.yml:5>) |
| kapman-tradelog | `POSTGRES_PASSWORD` | S | D | [kapman-tradelog/docker-compose.yml:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/docker-compose.yml:7>) |
| kapman-tradelog | `POSTGRES_USER` | I | D | [kapman-tradelog/docker-compose.yml:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/docker-compose.yml:6>) |
| kapman-tradelog | `S3_BUCKET` | C | L; F: kapman-tradelog; E | [kapman-tradelog/.env:20](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:20>)<br>[kapman-tradelog/.env.example:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:21>) |
| kapman-tradelog | `S3_ENDPOINT_URL` | C | L; F: kapman-tradelog; E | [kapman-tradelog/.env:19](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env:19>)<br>[kapman-tradelog/.env.example:20](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/.env.example:20>) |
| kapman-tradelog | `STARTING_CAPITAL` | C | R: source/tool | [kapman-tradelog/src/app/api/accounts/route.test.ts:24](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/src/app/api/accounts/route.test.ts:24>) |
| kapman-schwab-MCP | `ADMIN_AUTH_TOKEN` | S | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:82](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:82>)<br>[kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:156](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:156>) |
| kapman-schwab-MCP | `ADMIN_MAX_BODY_BYTES` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:137](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:137>)<br>[kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:59](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:59>) |
| kapman-schwab-MCP | `ALLOWED_ORIGINS` | C | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/http_app.py:411](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:411>)<br>[kapman-schwab-MCP/tests/test_http_app_observability.py:134](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_http_app_observability.py:134>) |
| kapman-schwab-MCP | `APP` | C | R: source/tool | [kapman-schwab-MCP/scripts/deploy-preserving-mcp-url.sh:4](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/deploy-preserving-mcp-url.sh:4>) |
| kapman-schwab-MCP | `APP_ID` | I | R: workflow (not listed in repo secrets) | [kapman-schwab-MCP/.github/workflows/agent.yaml:57](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/.github/workflows/agent.yaml:57>) |
| kapman-schwab-MCP | `APP_PRIVATE_KEY` | S | R: workflow (not listed in repo secrets) | [kapman-schwab-MCP/.github/workflows/agent.yaml:58](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/.github/workflows/agent.yaml:58>) |
| kapman-schwab-MCP | `BASE_URL` | C | R: source/tool | [kapman-schwab-MCP/scripts/deploy-preserving-mcp-url.sh:32](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/deploy-preserving-mcp-url.sh:32>) |
| kapman-schwab-MCP | `COPILOT_AUTH_JSON` | S | R: workflow (not listed in repo secrets) | [kapman-schwab-MCP/.github/workflows/agent.yaml:84](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/.github/workflows/agent.yaml:84>) |
| kapman-schwab-MCP | `FLY_API_TOKEN` | S | G: repo; R: workflow | [kapman-schwab-MCP/.github/workflows/release.yml:54](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/.github/workflows/release.yml:54>) |
| kapman-schwab-MCP | `FLY_APP_NAME` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:158](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:158>) |
| kapman-schwab-MCP | `GITHUB_TOKEN` | S | G: generated per job; R: workflow | [kapman-schwab-MCP/.github/workflows/container.yml:31](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/.github/workflows/container.yml:31>) |
| kapman-schwab-MCP | `HTTP_RATE_LIMIT_ADMIN_MAX` | C | D; R: source/tool | [kapman-schwab-MCP/fly.toml:18](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:18>)<br>[kapman-schwab-MCP/src/schwab_mcp/http_app.py:496](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:496>) |
| kapman-schwab-MCP | `HTTP_RATE_LIMIT_ENABLED` | C | D; R: source/tool | [kapman-schwab-MCP/fly.toml:16](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:16>)<br>[kapman-schwab-MCP/src/schwab_mcp/http_app.py:490](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:490>) |
| kapman-schwab-MCP | `HTTP_RATE_LIMIT_MCP_MAX` | C | D; R: source/tool | [kapman-schwab-MCP/fly.toml:19](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:19>)<br>[kapman-schwab-MCP/src/schwab_mcp/http_app.py:500](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:500>) |
| kapman-schwab-MCP | `HTTP_RATE_LIMIT_WINDOW_SECONDS` | C | D; R: source/tool | [kapman-schwab-MCP/fly.toml:17](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:17>)<br>[kapman-schwab-MCP/src/schwab_mcp/http_app.py:492](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:492>) |
| kapman-schwab-MCP | `KAPMAN_CHAIN_CACHE_MAX_ENTRIES` | C | D | [kapman-schwab-MCP/fly.toml:24](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:24>) |
| kapman-schwab-MCP | `KAPMAN_CHAIN_CACHE_TTL_SECONDS` | C | D | [kapman-schwab-MCP/fly.toml:23](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:23>) |
| kapman-schwab-MCP | `KAPMAN_FLIP_DTE_MAX` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/tools/kapman_analytics.py:82](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/tools/kapman_analytics.py:82>) |
| kapman-schwab-MCP | `KAPMAN_FLIP_EXPIRATIONS` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/tools/kapman_analytics.py:81](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/tools/kapman_analytics.py:81>) |
| kapman-schwab-MCP | `LOG_LEVEL` | C | D; R: source/tool | [kapman-schwab-MCP/fly.toml:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:15>)<br>[kapman-schwab-MCP/src/schwab_mcp/http_app.py:92](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:92>) |
| kapman-schwab-MCP | `MCP_BEARER_TOKEN` | S | R: source/tool | [kapman-schwab-MCP/scripts/mcp_smoke.py:243](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/mcp_smoke.py:243>) |
| kapman-schwab-MCP | `MCP_ENABLE_ACCOUNT_TOOLS` | C | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/http_app.py:151](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:151>) |
| kapman-schwab-MCP | `MCP_ENABLE_ORDERS` | C | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/http_app.py:153](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:153>)<br>[kapman-schwab-MCP/tests/test_readonly_profile.py:34](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_readonly_profile.py:34>) |
| kapman-schwab-MCP | `MCP_OAUTH_ENABLED` | C | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/http_app.py:475](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/http_app.py:475>)<br>[kapman-schwab-MCP/tests/test_http_app_oauth.py:109](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_http_app_oauth.py:109>) |
| kapman-schwab-MCP | `MCP_OIDC_ALGORITHMS` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:79](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:79>) |
| kapman-schwab-MCP | `MCP_OIDC_AUDIENCE` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:74](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:74>)<br>[kapman-schwab-MCP/tests/test_mcp_oauth.py:73](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_mcp_oauth.py:73>) |
| kapman-schwab-MCP | `MCP_OIDC_ISSUER` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:73](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:73>)<br>[kapman-schwab-MCP/tests/test_mcp_oauth.py:72](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_mcp_oauth.py:72>) |
| kapman-schwab-MCP | `MCP_OIDC_JWKS_URL` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:75](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:75>)<br>[kapman-schwab-MCP/tests/test_mcp_oauth.py:74](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_mcp_oauth.py:74>) |
| kapman-schwab-MCP | `MCP_SERVER_URL` | S | R: source/tool | [kapman-schwab-MCP/scripts/deploy-preserving-mcp-url.sh:31](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/deploy-preserving-mcp-url.sh:31>) |
| kapman-schwab-MCP | `MCP_URL_TOKEN` | S | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:132](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/mcp_oauth.py:132>)<br>[kapman-schwab-MCP/tests/test_http_app_oauth.py:108](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_http_app_oauth.py:108>) |
| kapman-schwab-MCP | `PORT` | C | D | [kapman-schwab-MCP/fly.toml:13](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:13>) |
| kapman-schwab-MCP | `PROD_ADMIN_TOKEN` | S | R: source/tool | [kapman-schwab-MCP/scripts/weekly-refresh.sh:37](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/weekly-refresh.sh:37>) |
| kapman-schwab-MCP | `PROD_APP` | C | R: source/tool | [kapman-schwab-MCP/scripts/weekly-refresh.sh:22](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/weekly-refresh.sh:22>) |
| kapman-schwab-MCP | `PROD_BASE_URL` | C | R: source/tool | [kapman-schwab-MCP/scripts/weekly-refresh.sh:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/weekly-refresh.sh:21>) |
| kapman-schwab-MCP | `PROD_MCP_BEARER_TOKEN` | S | R: workflow (not listed in repo secrets) | [kapman-schwab-MCP/.github/workflows/release.yml:75](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/.github/workflows/release.yml:75>) |
| kapman-schwab-MCP | `PROD_MCP_URL` | S | G: repo; R: workflow | [kapman-schwab-MCP/.github/workflows/release.yml:74](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/.github/workflows/release.yml:74>) |
| kapman-schwab-MCP | `PYTHONDONTWRITEBYTECODE` | C | D | [kapman-schwab-MCP/Dockerfile:17](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/Dockerfile:17>) |
| kapman-schwab-MCP | `REDIRECT_URL` | S | R: source/tool | [kapman-schwab-MCP/scripts/weekly-refresh.sh:69](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/weekly-refresh.sh:69>) |
| kapman-schwab-MCP | `SCHWAB_ANALYTICS_BATCH_DEADLINE_SECONDS` | C | D | [kapman-schwab-MCP/fly.toml:26](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:26>) |
| kapman-schwab-MCP | `SCHWAB_ANALYTICS_MAX_CONCURRENCY` | C | D | [kapman-schwab-MCP/fly.toml:25](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:25>) |
| kapman-schwab-MCP | `SCHWAB_BASE_URL` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:538](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:538>) |
| kapman-schwab-MCP | `SCHWAB_CALLBACK_URL` | C | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:489](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:489>)<br>[kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:92](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:92>) |
| kapman-schwab-MCP | `SCHWAB_CHAIN_RETRY_ATTEMPTS` | C | D | [kapman-schwab-MCP/fly.toml:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:21>) |
| kapman-schwab-MCP | `SCHWAB_CHAIN_RETRY_BACKOFF_SECONDS` | C | D | [kapman-schwab-MCP/fly.toml:22](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:22>) |
| kapman-schwab-MCP | `SCHWAB_CHAIN_TIMEOUT_SECONDS` | C | D | [kapman-schwab-MCP/fly.toml:20](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:20>) |
| kapman-schwab-MCP | `SCHWAB_CLIENT_ID` | I | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:488](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:488>)<br>[kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:90](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:90>) |
| kapman-schwab-MCP | `SCHWAB_CLIENT_SECRET` | S | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:536](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:536>)<br>[kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:91](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:91>) |
| kapman-schwab-MCP | `SCHWAB_MCP_DISCORD_APPROVERS` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/cli.py:261](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/cli.py:261>) |
| kapman-schwab-MCP | `SCHWAB_TOKEN_PATH` | C | F: kapman-schwab-mcp; D; R: source/tool | [kapman-schwab-MCP/fly.toml:14](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:14>)<br>[kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:133](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:133>)<br>[kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:169](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:169>) |
| kapman-schwab-MCP | `SMOKE_SYMBOL` | C | R: source/tool | [kapman-schwab-MCP/scripts/mcp_smoke.py:232](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/mcp_smoke.py:232>) |
| kapman-schwab-MCP | `SMOKE_TIMEOUT_SECONDS` | C | R: source/tool | [kapman-schwab-MCP/scripts/mcp_smoke.py:238](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/mcp_smoke.py:238>) |
| kapman-schwab-MCP | `STAGING_DISABLE_SCHWAB_TOOLS` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/tools/utils.py:78](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/tools/utils.py:78>)<br>[kapman-schwab-MCP/tests/test_utils.py:331](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_utils.py:331>) |
| kapman-schwab-MCP | `TOKEN_CONSOLE_ENV_LABEL` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:158](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:158>) |
| kapman-schwab-MCP | `TOKEN_PROMOTE_DEFAULT_TARGET_URL` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:285](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:285>) |
| kapman-schwab-MCP | `TOKEN_PROMOTE_MAX_AGE_SECONDS` | C | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:147](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:147>)<br>[kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:278](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:278>) |
| kapman-schwab-MCP | `TOKEN_PROMOTE_REQUIRE_ADMIN_AUTH` | C | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:739](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:739>) |
| kapman-schwab-MCP | `TOKEN_PROMOTE_SHARED_SECRET` | S | F: kapman-schwab-mcp; R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:625](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:625>)<br>[kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:200](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/tests/test_admin_oauth_hardening.py:200>) |
| kapman-schwab-MCP | `TOKEN_PROMOTE_TARGET_ADMIN_TOKEN` | S | R: source/tool | [kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:687](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/src/schwab_mcp/admin/oauth.py:687>) |
| kapman-polygon-viewer | `API_BEARER_TOKEN` | S | R: source/tool | [kapman-polygon-viewer/research/forward_log/studies/S006_actual_tradelog_tide/fetch_sources.py:356](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/research/forward_log/studies/S006_actual_tradelog_tide/fetch_sources.py:356>) |
| kapman-polygon-viewer | `AWS_ACCESS_KEY_ID` | I | R: source/tool | [kapman-polygon-viewer/backend/tools/seed_iv_history.py:263](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/tools/seed_iv_history.py:263>) |
| kapman-polygon-viewer | `AWS_SECRET_ACCESS_KEY` | S | R: source/tool | [kapman-polygon-viewer/backend/tools/seed_iv_history.py:264](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/tools/seed_iv_history.py:264>) |
| kapman-polygon-viewer | `CF_ACCESS_AUD` | C | D; R: source/tool | [kapman-polygon-viewer/fly.toml:25](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/fly.toml:25>)<br>[kapman-polygon-viewer/backend/app/config.py:24](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:24>) |
| kapman-polygon-viewer | `CF_ACCESS_CLIENT_ID` | I | L; R: source/tool | [kapman-polygon-viewer/.env:18](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:18>)<br>[kapman-polygon-viewer/backend/tools/upload_iv_seed.py:32](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/tools/upload_iv_seed.py:32>) |
| kapman-polygon-viewer | `CF_ACCESS_CLIENT_SECRET` | S | L; R: source/tool | [kapman-polygon-viewer/.env:19](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:19>)<br>[kapman-polygon-viewer/backend/tools/upload_iv_seed.py:33](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/tools/upload_iv_seed.py:33>) |
| kapman-polygon-viewer | `CF_ACCESS_TEAM_DOMAIN` | C | D; R: source/tool | [kapman-polygon-viewer/fly.toml:24](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/fly.toml:24>)<br>[kapman-polygon-viewer/backend/app/config.py:23](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:23>) |
| kapman-polygon-viewer | `CONTRAST_BASE_URL` | C | R: source/tool | [kapman-polygon-viewer/frontend/scripts/check-contrast.ts:26](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/frontend/scripts/check-contrast.ts:26>) |
| kapman-polygon-viewer | `CONTRAST_ROUTES` | C | R: source/tool | [kapman-polygon-viewer/frontend/scripts/check-contrast.ts:35](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/frontend/scripts/check-contrast.ts:35>) |
| kapman-polygon-viewer | `FLY_API_TOKEN` | S | L; G: repo; R: workflow | [kapman-polygon-viewer/.env:8](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:8>)<br>[kapman-polygon-viewer/.github/workflows/ci.yml:163](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.github/workflows/ci.yml:163>) |
| kapman-polygon-viewer | `FLY_APP_NAME` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:97](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:97>) |
| kapman-polygon-viewer | `FORWARD_EVAL_CACHE_TTL` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:81](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:81>) |
| kapman-polygon-viewer | `FORWARD_EVAL_HORIZON` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:74](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:74>) |
| kapman-polygon-viewer | `FORWARD_EVAL_STOP` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:75](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:75>) |
| kapman-polygon-viewer | `KAPMAN_APP_CSS` | C | R: source/tool | [kapman-polygon-viewer/frontend/scripts/check-design-system.mjs:55](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/frontend/scripts/check-design-system.mjs:55>) |
| kapman-polygon-viewer | `KAPMAN_APP_SRC` | C | R: source/tool | [kapman-polygon-viewer/frontend/scripts/check-design-system.mjs:32](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/frontend/scripts/check-design-system.mjs:32>) |
| kapman-polygon-viewer | `KAPMAN_THEME_SOURCE` | C | R: source/tool | [kapman-polygon-viewer/frontend/scripts/check-design-system.mjs:46](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/frontend/scripts/check-design-system.mjs:46>) |
| kapman-polygon-viewer | `KAPMAN_VENDOR_DIR` | C | R: source/tool | [kapman-polygon-viewer/frontend/scripts/check-design-system.mjs:43](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/frontend/scripts/check-design-system.mjs:43>) |
| kapman-polygon-viewer | `LOG_SNAPSHOT_ENABLED` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:72](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:72>) |
| kapman-polygon-viewer | `LOG_SNAPSHOT_HOUR_ET` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:73](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:73>) |
| kapman-polygon-viewer | `MARKET_CONTEXT_ENABLED` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:48](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:48>) |
| kapman-polygon-viewer | `MARKET_CONTEXT_FETCH_AFTER_ET` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:58](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:58>) |
| kapman-polygon-viewer | `MARKET_CONTEXT_MAX_AGE_TRADING_DAYS` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:63](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:63>) |
| kapman-polygon-viewer | `MARKET_CONTEXT_SYMBOLS` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:51](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:51>) |
| kapman-polygon-viewer | `MARKET_EXTRA_HOLIDAYS` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:66](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:66>) |
| kapman-polygon-viewer | `OAUTH_CLIENT_ID` | I | L; F: kapman-polygon-viewer; E; R: source/tool | [kapman-polygon-viewer/.env:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:2>)<br>[kapman-polygon-viewer/.env.example:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env.example:3>)<br>[kapman-polygon-viewer/backend/app/config.py:14](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:14>) |
| kapman-polygon-viewer | `OAUTH_CLIENT_SECRET` | S | L; F: kapman-polygon-viewer; E; R: source/tool | [kapman-polygon-viewer/.env:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:3>)<br>[kapman-polygon-viewer/.env.example:4](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env.example:4>)<br>[kapman-polygon-viewer/backend/app/config.py:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:15>) |
| kapman-polygon-viewer | `POLYGON_API_KEY` | S | R: source/tool | [kapman-polygon-viewer/backend/tools/seed_iv_history.py:328](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/tools/seed_iv_history.py:328>) |
| kapman-polygon-viewer | `PORT` | C | L; E; D; R: source/tool | [kapman-polygon-viewer/.env:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:7>)<br>[kapman-polygon-viewer/.env.example:34](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env.example:34>)<br>[kapman-polygon-viewer/Dockerfile:33](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/Dockerfile:33>)<br>[kapman-polygon-viewer/backend/app/config.py:25](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:25>) |
| kapman-polygon-viewer | `PROD_VIEWER_PASSWORD` | S | L | [kapman-polygon-viewer/.env:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:5>) |
| kapman-polygon-viewer | `S3_BUCKET` | C | R: source/tool | [kapman-polygon-viewer/backend/tools/seed_iv_history.py:266](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/tools/seed_iv_history.py:266>) |
| kapman-polygon-viewer | `S3_ENDPOINT_URL` | C | R: source/tool | [kapman-polygon-viewer/backend/tools/seed_iv_history.py:262](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/tools/seed_iv_history.py:262>) |
| kapman-polygon-viewer | `SESSION_SECRET` | S | L; F: kapman-polygon-viewer | [kapman-polygon-viewer/.env:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:6>) |
| kapman-polygon-viewer | `VIEWER_API_TOKEN` | S | L; F: kapman-polygon-viewer; R: source/tool | [kapman-polygon-viewer/.env:17](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:17>)<br>[kapman-polygon-viewer/backend/app/config.py:18](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:18>) |
| kapman-polygon-viewer | `VIEWER_CACHE_TTL` | C | D; R: source/tool | [kapman-polygon-viewer/fly.toml:36](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/fly.toml:36>)<br>[kapman-polygon-viewer/backend/app/config.py:29](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:29>) |
| kapman-polygon-viewer | `VIEWER_DB_PATH` | C | D; R: source/tool | [kapman-polygon-viewer/fly.toml:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/fly.toml:15>)<br>[kapman-polygon-viewer/backend/app/config.py:26](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:26>) |
| kapman-polygon-viewer | `VIEWER_MCP_BATCH_MAX` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:28](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:28>) |
| kapman-polygon-viewer | `VIEWER_MCP_CALL_TIMEOUT` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:33](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:33>) |
| kapman-polygon-viewer | `VIEWER_MCP_MAX_CONCURRENCY` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:38](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:38>) |
| kapman-polygon-viewer | `VIEWER_MCP_URL` | C | L; F: kapman-polygon-viewer; E; R: source/tool | [kapman-polygon-viewer/.env:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:1>)<br>[kapman-polygon-viewer/.env.example:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env.example:2>)<br>[kapman-polygon-viewer/backend/app/config.py:13](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:13>) |
| kapman-polygon-viewer | `VIEWER_PASSWORD` | S | L; F: kapman-polygon-viewer | [kapman-polygon-viewer/.env:4](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/.env:4>) |
| kapman-polygon-viewer | `VIEWER_VERSION` | C | D; R: source/tool | [kapman-polygon-viewer/Dockerfile:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/Dockerfile:30>)<br>[kapman-polygon-viewer/backend/app/main.py:70](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/main.py:70>) |
| kapman-polygon-viewer | `WARM_CHUNK_PAUSE_SECONDS` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:44](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:44>) |
| kapman-polygon-viewer | `WARM_ENABLED` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:40](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:40>) |
| kapman-polygon-viewer | `WARM_INCLUDE_OPTIONS` | C | F: kapman-polygon-viewer; D; R: source/tool | [kapman-polygon-viewer/fly.toml:28](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/fly.toml:28>)<br>[kapman-polygon-viewer/backend/app/config.py:43](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:43>) |
| kapman-polygon-viewer | `WARM_INTERVAL_SECONDS` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:41](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:41>) |
| kapman-polygon-viewer | `WARM_OFFHOURS_INTERVAL_SECONDS` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:42](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:42>) |
| kapman-polygon-viewer | `WARM_STARTUP_DELAY_SECONDS` | C | R: source/tool | [kapman-polygon-viewer/backend/app/config.py:69](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-viewer/backend/app/config.py:69>) |
| kapman-polygon-mcp-v2 | `CANONICAL_BATCH_MAX_SYMBOLS` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:157](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:157>) |
| kapman-polygon-mcp-v2 | `FLY_API_TOKEN` | S | G: repo; R: workflow | [kapman-polygon-mcp-v2/.github/workflows/fly-deploy.yml:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/.github/workflows/fly-deploy.yml:21>) |
| kapman-polygon-mcp-v2 | `MCP_AUTH_MODE` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:70](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:70>) |
| kapman-polygon-mcp-v2 | `MCP_SERVICE_TOKENS` | S | R: source/tool | [kapman-polygon-mcp-v2/main.py:80](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:80>) |
| kapman-polygon-mcp-v2 | `OAUTH_CLIENT_ID` | I | L; F: kapman-polygon-mcp-v2; E; R: source/tool | [kapman-polygon-mcp-v2/.env:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/.env:3>)<br>[kapman-polygon-mcp-v2/.env.example:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/.env.example:5>)<br>[kapman-polygon-mcp-v2/main.py:60](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:60>) |
| kapman-polygon-mcp-v2 | `OAUTH_CLIENT_SECRET` | S | L; F: kapman-polygon-mcp-v2; E; R: source/tool | [kapman-polygon-mcp-v2/.env:4](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/.env:4>)<br>[kapman-polygon-mcp-v2/.env.example:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/.env.example:6>)<br>[kapman-polygon-mcp-v2/main.py:61](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:61>) |
| kapman-polygon-mcp-v2 | `OAUTH_REDIRECT_ALLOWLIST` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:90](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:90>) |
| kapman-polygon-mcp-v2 | `OAUTH_TOKEN_TTL_SECONDS` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:94](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:94>) |
| kapman-polygon-mcp-v2 | `POLYGON_API_KEY` | S | L; F: kapman-polygon-mcp-v2; E; R: source/tool | [kapman-polygon-mcp-v2/.env:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/.env:1>)<br>[kapman-polygon-mcp-v2/.env.example:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/.env.example:2>)<br>[kapman-polygon-mcp-v2/backtest/data.py:28](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/backtest/data.py:28>) |
| kapman-polygon-mcp-v2 | `POLYGON_BATCH_MAX_WORKERS` | C | L; R: source/tool | [kapman-polygon-mcp-v2/.env:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/.env:2>)<br>[kapman-polygon-mcp-v2/main.py:158](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:158>) |
| kapman-polygon-mcp-v2 | `POLYGON_BATCH_SYMBOL_TIMEOUT` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:170](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:170>) |
| kapman-polygon-mcp-v2 | `POLYGON_DEALER_CHAIN_MAX_CONTRACTS` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:162](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:162>) |
| kapman-polygon-mcp-v2 | `POLYGON_DEALER_STRIKE_BAND_DOWN` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:221](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:221>) |
| kapman-polygon-mcp-v2 | `POLYGON_DEALER_STRIKE_BAND_UP` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:227](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:227>) |
| kapman-polygon-mcp-v2 | `POLYGON_GAMMA_FLIP_EDGE_STRIKES` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:235](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:235>) |
| kapman-polygon-mcp-v2 | `POLYGON_GAMMA_FLIP_MAX_DISTANCE_PCT` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:246](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:246>) |
| kapman-polygon-mcp-v2 | `POLYGON_GAMMA_FLIP_MIN_BRACKET_RATIO` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:240](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:240>) |
| kapman-polygon-mcp-v2 | `POLYGON_GAMMA_FLIP_MIN_LOCAL_GEX_RATIO` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:252](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:252>) |
| kapman-polygon-mcp-v2 | `POLYGON_HTTP_CONNECT_TIMEOUT` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:166](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:166>) |
| kapman-polygon-mcp-v2 | `POLYGON_HTTP_READ_TIMEOUT` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:167](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:167>) |
| kapman-polygon-mcp-v2 | `POLYGON_OHLCV_CACHE_MAXSIZE` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:693](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:693>) |
| kapman-polygon-mcp-v2 | `POLYGON_OHLCV_CACHE_TTL_SECONDS` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:694](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:694>) |
| kapman-polygon-mcp-v2 | `POLYGON_OPTIONS_CHAIN_MAX_CONTRACTS` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:159](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:159>) |
| kapman-polygon-mcp-v2 | `POLYGON_OPTIONS_CHAIN_MONEYNESS_BAND` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:183](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:183>) |
| kapman-polygon-mcp-v2 | `POLYGON_OPTIONS_WALL_MONEYNESS_MAX` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:215](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:215>) |
| kapman-polygon-mcp-v2 | `POLYGON_VOLATILITY_CHAIN_DTE_MAX` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:202](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:202>) |
| kapman-polygon-mcp-v2 | `POLYGON_VOLATILITY_CHAIN_MAX_CONTRACTS` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:206](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:206>) |
| kapman-polygon-mcp-v2 | `POLYGON_VOLATILITY_LONG_BUCKET_DTE_MIN` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:209](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:209>) |
| kapman-polygon-mcp-v2 | `POLYGON_VOLATILITY_LONG_BUCKET_MAX_CONTRACTS` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:212](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:212>) |
| kapman-polygon-mcp-v2 | `POLYGON_VOLATILITY_MONEYNESS_BAND` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:189](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:189>) |
| kapman-polygon-mcp-v2 | `POLYGON_VOLATILITY_SKEW_MIN_DTE` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:199](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:199>) |
| kapman-polygon-mcp-v2 | `PORT` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:3527](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:3527>) |
| kapman-polygon-mcp-v2 | `PUBLIC_BASE_URL` | C | R: source/tool | [kapman-polygon-mcp-v2/main.py:339](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/main.py:339>) |
| kapman-polygon-mcp-v2 | `PYTHONUNBUFFERED` | C | D | [kapman-polygon-mcp-v2/Dockerfile:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-mcp-v2/Dockerfile:3>) |
| kapman-marketdata-MCP | `CANONICAL_BATCH_MAX_SYMBOLS` | C | L; E; R: source/tool | [kapman-marketdata-MCP/.env:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:7>)<br>[kapman-marketdata-MCP/.env.example:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:7>)<br>[kapman-marketdata-MCP/main.py:76](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/main.py:76>) |
| kapman-marketdata-MCP | `EXPOSE_LEGACY_TOOLS` | C | L; E; R: source/tool | [kapman-marketdata-MCP/.env:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:6>)<br>[kapman-marketdata-MCP/.env.example:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:6>)<br>[kapman-marketdata-MCP/main.py:70](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/main.py:70>) |
| kapman-marketdata-MCP | `MARKETDATA_API_KEY` | S | L; E; R: source/tool | [kapman-marketdata-MCP/.env:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:1>)<br>[kapman-marketdata-MCP/.env.example:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:1>)<br>[kapman-marketdata-MCP/lib/marketdata_client.py:61](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/lib/marketdata_client.py:61>) |
| kapman-marketdata-MCP | `MARKETDATA_BASE_URL` | C | L; E; R: source/tool | [kapman-marketdata-MCP/.env:8](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:8>)<br>[kapman-marketdata-MCP/.env.example:8](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:8>)<br>[kapman-marketdata-MCP/lib/marketdata_client.py:62](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/lib/marketdata_client.py:62>) |
| kapman-marketdata-MCP | `MARKETDATA_DEFAULT_FORMAT` | C | L; E; R: source/tool | [kapman-marketdata-MCP/.env:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:10>)<br>[kapman-marketdata-MCP/.env.example:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:10>)<br>[kapman-marketdata-MCP/lib/marketdata_client.py:64](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/lib/marketdata_client.py:64>) |
| kapman-marketdata-MCP | `MARKETDATA_TIMEOUT_SECONDS` | C | L; E; R: source/tool | [kapman-marketdata-MCP/.env:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:9>)<br>[kapman-marketdata-MCP/.env.example:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:9>)<br>[kapman-marketdata-MCP/lib/marketdata_client.py:63](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/lib/marketdata_client.py:63>) |
| kapman-marketdata-MCP | `OAUTH_CLIENT_ID` | I | L; E; R: source/tool | [kapman-marketdata-MCP/.env:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:2>)<br>[kapman-marketdata-MCP/.env.example:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:2>)<br>[kapman-marketdata-MCP/main.py:53](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/main.py:53>) |
| kapman-marketdata-MCP | `OAUTH_CLIENT_SECRET` | S | L; E; R: source/tool | [kapman-marketdata-MCP/.env:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:3>)<br>[kapman-marketdata-MCP/.env.example:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:3>)<br>[kapman-marketdata-MCP/main.py:54](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/main.py:54>) |
| kapman-marketdata-MCP | `PORT` | C | L; E; R: source/tool | [kapman-marketdata-MCP/.env:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:5>)<br>[kapman-marketdata-MCP/.env.example:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:5>)<br>[kapman-marketdata-MCP/main.py:1289](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/main.py:1289>) |
| kapman-marketdata-MCP | `PUBLIC_BASE_URL` | C | L; E; R: source/tool | [kapman-marketdata-MCP/.env:4](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env:4>)<br>[kapman-marketdata-MCP/.env.example:4](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/.env.example:4>)<br>[kapman-marketdata-MCP/main.py:102](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/main.py:102>) |
| kapman-marketdata-MCP | `PYTHONUNBUFFERED` | C | D | [kapman-marketdata-MCP/Dockerfile:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-marketdata-MCP/Dockerfile:3>) |
| kapman-finnhub-mcp-server | `FINHUB_API_KEY` | S | L; R: source/tool | [kapman-finnhub-mcp-server/.env:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/.env:1>)<br>[kapman-finnhub-mcp-server/finnhub_client.py:27](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/finnhub_client.py:27>)<br>[kapman-finnhub-mcp-server/tests/test_client.py:20](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/tests/test_client.py:20>) |
| kapman-finnhub-mcp-server | `FINNHUB_API_KEY` | S | F: kapman-finnhub-mcp-server; E; R: source/tool | [kapman-finnhub-mcp-server/.env.example:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/.env.example:3>)<br>[kapman-finnhub-mcp-server/finnhub_client.py:27](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/finnhub_client.py:27>)<br>[kapman-finnhub-mcp-server/tests/test_client.py:13](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/tests/test_client.py:13>) |
| kapman-finnhub-mcp-server | `OAUTH_CLIENT_ID` | I | R: source/tool | [kapman-finnhub-mcp-server/main.py:25](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/main.py:25>) |
| kapman-finnhub-mcp-server | `OAUTH_CLIENT_SECRET` | S | F: kapman-finnhub-mcp-server; R: source/tool | [kapman-finnhub-mcp-server/main.py:26](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/main.py:26>) |
| kapman-finnhub-mcp-server | `PORT` | C | R: source/tool | [kapman-finnhub-mcp-server/main.py:649](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/main.py:649>) |
| kapman-finnhub-mcp-server | `PUBLIC_BASE_URL` | C | R: source/tool | [kapman-finnhub-mcp-server/main.py:53](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/main.py:53>) |
| kapman-finnhub-mcp-server | `PYTHONUNBUFFERED` | C | D | [kapman-finnhub-mcp-server/Dockerfile:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-finnhub-mcp-server/Dockerfile:3>) |
| kapman-kb | `KAPMAN_JOURNAL_DIR` | C | R: source/tool | [kapman-kb/scripts/check_repo_sync.sh:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-kb/scripts/check_repo_sync.sh:15>) |
| kapman-journal | No matched environment inputs | — | No local env files, no repo secrets returned; no active hook found | [kapman-journal/.git/HEAD](</Volumes/OWC Envoy Pro SX/App Development/kapman-journal/.git/HEAD>) at `88974dadeb9922c8755e6975fb57123ac9c190a1`; tracked-file enumeration |
| kapman-design | `ALLOW_PENDING` | C | R: source/tool | [kapman-design/tools/check-decisions.mjs:20](</Volumes/OWC Envoy Pro SX/App Development/kapman-design/tools/check-decisions.mjs:20>) |
| kapman-design | `CONTRAST_BASE_URL` | C | R: source/tool | [kapman-design/scripts/check-contrast.ts:26](</Volumes/OWC Envoy Pro SX/App Development/kapman-design/scripts/check-contrast.ts:26>) |
| kapman-design | `CONTRAST_ROUTES` | C | R: source/tool | [kapman-design/scripts/check-contrast.ts:35](</Volumes/OWC Envoy Pro SX/App Development/kapman-design/scripts/check-contrast.ts:35>) |
| kapman-design | `KAPMAN_APP_CSS` | C | R: source/tool | [kapman-design/scripts/check-design-system.mjs:55](</Volumes/OWC Envoy Pro SX/App Development/kapman-design/scripts/check-design-system.mjs:55>) |
| kapman-design | `KAPMAN_APP_SRC` | C | R: source/tool | [kapman-design/scripts/check-design-system.mjs:32](</Volumes/OWC Envoy Pro SX/App Development/kapman-design/scripts/check-design-system.mjs:32>) |
| kapman-design | `KAPMAN_THEME_SOURCE` | C | R: source/tool | [kapman-design/scripts/check-design-system.mjs:46](</Volumes/OWC Envoy Pro SX/App Development/kapman-design/scripts/check-design-system.mjs:46>) |
| kapman-design | `KAPMAN_VENDOR_DIR` | C | R: source/tool | [kapman-design/scripts/check-design-system.mjs:43](</Volumes/OWC Envoy Pro SX/App Development/kapman-design/scripts/check-design-system.mjs:43>) |
| kapman-fair-value-tool | `API_PROXY` | C | R: source/tool | [kapman-fair-value-tool/vite.config.js:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/vite.config.js:9>) |
| kapman-fair-value-tool | `CONTRAST_BASE_URL` | C | R: source/tool | [kapman-fair-value-tool/scripts/check-contrast.ts:37](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/scripts/check-contrast.ts:37>) |
| kapman-fair-value-tool | `FINHUB_API_KEY` | S | R: source/tool | [kapman-fair-value-tool/server/lib/finnhub.js:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/server/lib/finnhub.js:7>) |
| kapman-fair-value-tool | `FINNHUB_API_KEY` | S | L; F: kapman-fair-value-tool; R: source/tool | [kapman-fair-value-tool/.env:4](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/.env:4>)<br>[kapman-fair-value-tool/server/lib/finnhub.js:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/server/lib/finnhub.js:7>) |
| kapman-fair-value-tool | `FLY_API_TOKEN` | S | G: repo; R: workflow | [kapman-fair-value-tool/.github/workflows/ci.yml:100](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/.github/workflows/ci.yml:100>) |
| kapman-fair-value-tool | `FLY_IMAGE_REF` | C | R: source/tool | [kapman-fair-value-tool/server/index.js:742](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/server/index.js:742>) |
| kapman-fair-value-tool | `FLY_MACHINE_ID` | C | R: source/tool | [kapman-fair-value-tool/server/index.js:746](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/server/index.js:746>) |
| kapman-fair-value-tool | `GIT_SHA` | C | D; R: source/tool | [kapman-fair-value-tool/Dockerfile:16](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/Dockerfile:16>)<br>[kapman-fair-value-tool/server/index.js:740](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/server/index.js:740>) |
| kapman-fair-value-tool | `KAPMAN_APP_CSS` | C | R: source/tool | [kapman-fair-value-tool/scripts/check-design-system.mjs:55](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/scripts/check-design-system.mjs:55>) |
| kapman-fair-value-tool | `KAPMAN_APP_SRC` | C | R: source/tool | [kapman-fair-value-tool/scripts/check-design-system.mjs:32](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/scripts/check-design-system.mjs:32>) |
| kapman-fair-value-tool | `KAPMAN_THEME_SOURCE` | C | R: source/tool | [kapman-fair-value-tool/scripts/check-design-system.mjs:46](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/scripts/check-design-system.mjs:46>) |
| kapman-fair-value-tool | `KAPMAN_VENDOR_DIR` | C | R: source/tool | [kapman-fair-value-tool/scripts/check-design-system.mjs:43](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/scripts/check-design-system.mjs:43>) |
| kapman-fair-value-tool | `NODE_ENV` | C | D; R: source/tool | [kapman-fair-value-tool/Dockerfile:18](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/Dockerfile:18>)<br>[kapman-fair-value-tool/server/index.js:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/server/index.js:21>) |
| kapman-fair-value-tool | `PORT` | C | L; R: source/tool | [kapman-fair-value-tool/.env:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/.env:2>)<br>[kapman-fair-value-tool/server/index.js:19](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/server/index.js:19>) |
| kapman-fair-value-tool | `SQLITE_DB_PATH` | C | R: source/tool | [kapman-fair-value-tool/server/index.js:22](</Volumes/OWC Envoy Pro SX/App Development/kapman-fair-value-tool/server/index.js:22>) |
| kapman-trader | `AI_DUMP` | C | R: source/tool | [kapman-trader/core/providers/ai/openai.py:29](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/providers/ai/openai.py:29>)<br>[kapman-trader/tests/unit/ai/test_ai_dump_logging_flag.py:25](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/unit/ai/test_ai_dump_logging_flag.py:25>) |
| kapman-trader | `AI_PROVIDER` | C | D | [kapman-trader/docker-compose.yml:54](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:54>) |
| kapman-trader | `ANTHROPIC_API_KEY` | S | L; R: source/tool | [kapman-trader/.env:19](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:19>)<br>[kapman-trader/core/providers/ai/claude.py:43](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/providers/ai/claude.py:43>)<br>[kapman-trader/scripts/test-providers.py:32](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/scripts/test-providers.py:32>) |
| kapman-trader | `ASYNC_DATABASE_URL` | S | L; R: source/tool | [kapman-trader/.env:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:10>)<br>[kapman-trader/core/db/client.py:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/db/client.py:6>) |
| kapman-trader | `AWS_ACCESS_KEY_ID` | I | L; D; R: source/tool | [kapman-trader/.env:13](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:13>)<br>[kapman-trader/docker-compose.yml:58](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:58>)<br>[kapman-trader/core/config/__init__.py:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:10>)<br>[kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:36](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:36>) |
| kapman-trader | `AWS_REGION` | C | R: source/tool | [kapman-trader/core/config/__init__.py:12](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:12>) |
| kapman-trader | `AWS_SECRET_ACCESS_KEY` | S | L; D; R: source/tool | [kapman-trader/.env:14](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:14>)<br>[kapman-trader/docker-compose.yml:59](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:59>)<br>[kapman-trader/core/config/__init__.py:11](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:11>)<br>[kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:37](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:37>) |
| kapman-trader | `CLAUDE_API_KEY` | S | D; T | [kapman-trader/docker-compose.yml:55](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:55>)<br>[kapman-trader/scripts/test-claude-real.py:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/scripts/test-claude-real.py:7>) |
| kapman-trader | `DATABASE_URL` | S | L; R: source/tool | [kapman-trader/.env:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:9>)<br>[kapman-trader/core/db/a6_migrations.py:136](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/db/a6_migrations.py:136>)<br>[kapman-trader/tests/integration/mcp/test_mcp_integration.py:136](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/integration/mcp/test_mcp_integration.py:136>) |
| kapman-trader | `DB_HOST` | C | R: source/tool | [kapman-trader/core/config/__init__.py:27](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:27>) |
| kapman-trader | `DB_NAME` | C | L; D; R: source/tool | [kapman-trader/.env:8](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:8>)<br>[kapman-trader/docker-compose.yml:76](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:76>)<br>[kapman-trader/core/config/__init__.py:24](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:24>) |
| kapman-trader | `DB_PASSWORD` | S | L; D; R: source/tool | [kapman-trader/.env:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:7>)<br>[kapman-trader/docker-compose.yml:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:30>)<br>[kapman-trader/core/config/__init__.py:26](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:26>) |
| kapman-trader | `DB_PORT` | C | R: source/tool | [kapman-trader/core/config/__init__.py:28](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:28>) |
| kapman-trader | `DB_USER` | I | L; D; R: source/tool | [kapman-trader/.env:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:6>)<br>[kapman-trader/docker-compose.yml:74](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:74>)<br>[kapman-trader/core/config/__init__.py:25](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:25>) |
| kapman-trader | `EODHD_API_TOKEN` | S | R: source/tool | [kapman-trader/core/providers/market_data/unicorn_options.py:52](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/providers/market_data/unicorn_options.py:52>) |
| kapman-trader | `KAPMAN_A4_MODEL_VERSION` | C | R: source/tool | [kapman-trader/core/metrics/a4_volatility_metrics_job.py:42](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/metrics/a4_volatility_metrics_job.py:42>) |
| kapman-trader | `KAPMAN_B1_MODEL_VERSION` | C | R: source/tool | [kapman-trader/core/metrics/b1_wyckoff_regime_job.py:84](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/metrics/b1_wyckoff_regime_job.py:84>) |
| kapman-trader | `KAPMAN_B2_MODEL_VERSION` | C | R: source/tool | [kapman-trader/core/metrics/b2_wyckoff_structural_events_job.py:70](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/metrics/b2_wyckoff_structural_events_job.py:70>) |
| kapman-trader | `KAPMAN_C4_MODEL_VERSION` | C | R: source/tool | [kapman-trader/core/metrics/c4_batch_ai_screening_job.py:100](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/metrics/c4_batch_ai_screening_job.py:100>) |
| kapman-trader | `KAPMAN_OPTIONS_INGEST_PROGRESS_S` | C | R: source/tool | [kapman-trader/core/ingestion/options/pipeline.py:901](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/ingestion/options/pipeline.py:901>)<br>[kapman-trader/tests/unit/options/test_a1_ingestion_shutdown.py:103](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/unit/options/test_a1_ingestion_shutdown.py:103>) |
| kapman-trader | `KAPMAN_REBUILD_ITERATIONS` | C | R: source/tool | [kapman-trader/scripts/db/a5_deterministic_rebuild.py:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/scripts/db/a5_deterministic_rebuild.py:21>) |
| kapman-trader | `KAPMAN_RUN_A2_PARALLEL_TEST` | C | T | [kapman-trader/tests/integration/test_a2_local_ta_snapshot_job.py:134](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/integration/test_a2_local_ta_snapshot_job.py:134>) |
| kapman-trader | `KAPMAN_TEST_DATABASE_URL` | S | T | [kapman-trader/tests/conftest.py:33](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/conftest.py:33>) |
| kapman-trader | `MB_DB_FILE` | C | D | [kapman-trader/docker-compose.yml:162](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:162>) |
| kapman-trader | `MPLCONFIGDIR` | C | R: source/tool | [kapman-trader/scripts/util/generate_ohlcv_ta_chart_pack.py:503](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/scripts/util/generate_ohlcv_ta_chart_pack.py:503>) |
| kapman-trader | `NEXT_PUBLIC_API_URL` | C | R: source/tool | [kapman-trader/frontend/Dockerfile:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/frontend/Dockerfile:15>) |
| kapman-trader | `OHLCV_HISTORY_DAYS` | C | R: source/tool | [kapman-trader/core/ingestion/ohlcv/pipeline.py:239](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/ingestion/ohlcv/pipeline.py:239>) |
| kapman-trader | `OHLCV_SOURCE` | C | D | [kapman-trader/docker-compose.yml:57](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:57>) |
| kapman-trader | `OPENAI_API_KEY` | S | L; R: source/tool | [kapman-trader/.env:20](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:20>)<br>[kapman-trader/core/providers/ai/openai.py:61](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/providers/ai/openai.py:61>)<br>[kapman-trader/tests/unit/ai/providers/test_openai_errors.py:13](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/unit/ai/providers/test_openai_errors.py:13>) |
| kapman-trader | `OPTIONS_PROVIDER` | C | L; R: source/tool | [kapman-trader/.env:23](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:23>)<br>[kapman-trader/core/ingestion/options/pipeline.py:318](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/ingestion/options/pipeline.py:318>)<br>[kapman-trader/tests/integration/test_a1_unicorn_ingestion.py:90](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/integration/test_a1_unicorn_ingestion.py:90>) |
| kapman-trader | `PGADMIN_DEFAULT_EMAIL` | I | D | [kapman-trader/docker-compose.yml:110](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:110>) |
| kapman-trader | `PGADMIN_DEFAULT_PASSWORD` | S | D | [kapman-trader/docker-compose.yml:111](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:111>) |
| kapman-trader | `PGPASSWORD` | S | R: source/tool | [kapman-trader/scripts/cron/catchup_2026-01-13_to_2026-01-16.sh:124](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/scripts/cron/catchup_2026-01-13_to_2026-01-16.sh:124>) |
| kapman-trader | `POLYGON_API_KEY` | S | L; D; R: source/tool | [kapman-trader/.env:21](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:21>)<br>[kapman-trader/docker-compose.yml:56](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:56>)<br>[kapman-trader/core/ingestion/tickers/loader.py:29](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/ingestion/tickers/loader.py:29>)<br>[kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:33](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:33>) |
| kapman-trader | `POLYGON_S3_OHLCV_PREFIX` | C | R: source/tool | [kapman-trader/core/ingestion/ohlcv/s3_flatfiles.py:28](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/ingestion/ohlcv/s3_flatfiles.py:28>) |
| kapman-trader | `PORT` | C | R: source/tool | [kapman-trader/api/src/index.js:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/api/src/index.js:9>) |
| kapman-trader | `POSTGRES_DB` | C | D | [kapman-trader/docker-compose.yml:76](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:76>) |
| kapman-trader | `POSTGRES_PASSWORD` | S | D | [kapman-trader/docker-compose.yml:75](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:75>) |
| kapman-trader | `POSTGRES_USER` | I | D | [kapman-trader/docker-compose.yml:74](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:74>) |
| kapman-trader | `PYTHONDONTWRITEBYTECODE` | C | R: source/tool | [kapman-trader/core/Dockerfile:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/Dockerfile:5>) |
| kapman-trader | `S3_BUCKET` | C | L; D; R: source/tool | [kapman-trader/.env:16](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:16>)<br>[kapman-trader/docker-compose.yml:60](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:60>)<br>[kapman-trader/core/config/__init__.py:13](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:13>)<br>[kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:35](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:35>) |
| kapman-trader | `S3_ENDPOINT_URL` | C | L; R: source/tool | [kapman-trader/.env:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:15>)<br>[kapman-trader/core/config/__init__.py:14](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/config/__init__.py:14>)<br>[kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:34](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/tests/integration/test_a0_bootstrap_then_ohlcv_ingest.py:34>) |
| kapman-trader | `TIMESCALEDB_TELEMETRY` | C | D | [kapman-trader/docker-compose.yml:77](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/docker-compose.yml:77>) |
| kapman-trader | `UNICORN_API_KEY` | S | L; R: source/tool | [kapman-trader/.env:22](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/.env:22>)<br>[kapman-trader/core/providers/market_data/unicorn_options.py:52](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/providers/market_data/unicorn_options.py:52>) |
| kapman-trader | `UNICORN_API_TOKEN` | S | R: source/tool | [kapman-trader/core/providers/market_data/unicorn_options.py:52](</Volumes/OWC Envoy Pro SX/App Development/kapman-trader/core/providers/market_data/unicorn_options.py:52>) |
| jonathan-amar.com | `FLY_API_TOKEN` | S | G: repo; R: workflow | [jonathan-amar.com/.github/workflows/fly-deploy.yml:28](</Volumes/OWC Envoy Pro SX/App Development/jonathan-amar.com/.github/workflows/fly-deploy.yml:28>) |
| jonathan-amar.com | `SMTP_FROM_EMAIL` | C | R: source/tool | [jonathan-amar.com/deploy/php/docker-entrypoint.sh:8](</Volumes/OWC Envoy Pro SX/App Development/jonathan-amar.com/deploy/php/docker-entrypoint.sh:8>) |
| jonathan-amar.com | `SMTP_HOST` | C | R: source/tool | [jonathan-amar.com/deploy/php/docker-entrypoint.sh:4](</Volumes/OWC Envoy Pro SX/App Development/jonathan-amar.com/deploy/php/docker-entrypoint.sh:4>) |
| jonathan-amar.com | `SMTP_PASSWORD` | S | R: source/tool | [jonathan-amar.com/deploy/php/docker-entrypoint.sh:10](</Volumes/OWC Envoy Pro SX/App Development/jonathan-amar.com/deploy/php/docker-entrypoint.sh:10>) |
| jonathan-amar.com | `SMTP_PORT` | C | R: source/tool | [jonathan-amar.com/deploy/php/docker-entrypoint.sh:5](</Volumes/OWC Envoy Pro SX/App Development/jonathan-amar.com/deploy/php/docker-entrypoint.sh:5>) |
| jonathan-amar.com | `SMTP_STARTTLS` | C | R: source/tool | [jonathan-amar.com/deploy/php/docker-entrypoint.sh:7](</Volumes/OWC Envoy Pro SX/App Development/jonathan-amar.com/deploy/php/docker-entrypoint.sh:7>) |
| jonathan-amar.com | `SMTP_TLS` | C | R: source/tool | [jonathan-amar.com/deploy/php/docker-entrypoint.sh:6](</Volumes/OWC Envoy Pro SX/App Development/jonathan-amar.com/deploy/php/docker-entrypoint.sh:6>) |
| jonathan-amar.com | `SMTP_USERNAME` | I | R: source/tool | [jonathan-amar.com/deploy/php/docker-entrypoint.sh:9](</Volumes/OWC Envoy Pro SX/App Development/jonathan-amar.com/deploy/php/docker-entrypoint.sh:9>) |
| kapman-polygon-MCP | `CANONICAL_BATCH_MAX_SYMBOLS` | C | R: source/tool | [kapman-polygon-MCP/main.py:75](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:75>) |
| kapman-polygon-MCP | `EXPOSE_LEGACY_TOOLS` | C | R: source/tool | [kapman-polygon-MCP/main.py:69](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:69>) |
| kapman-polygon-MCP | `OAUTH_CLIENT_ID` | I | R: source/tool | [kapman-polygon-MCP/main.py:51](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:51>) |
| kapman-polygon-MCP | `OAUTH_CLIENT_SECRET` | S | R: source/tool | [kapman-polygon-MCP/main.py:52](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:52>) |
| kapman-polygon-MCP | `POLYGON_API_KEY` | S | L; R: source/tool | [kapman-polygon-MCP/.env:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/.env:1>)<br>[kapman-polygon-MCP/main.py:56](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:56>) |
| kapman-polygon-MCP | `POLYGON_BATCH_MAX_WORKERS` | C | L; R: source/tool | [kapman-polygon-MCP/.env:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/.env:2>)<br>[kapman-polygon-MCP/main.py:76](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:76>) |
| kapman-polygon-MCP | `POLYGON_DEALER_CHAIN_MAX_CONTRACTS` | C | R: source/tool | [kapman-polygon-MCP/main.py:80](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:80>) |
| kapman-polygon-MCP | `POLYGON_DEALER_STRIKE_BAND_DOWN` | C | R: source/tool | [kapman-polygon-MCP/main.py:121](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:121>) |
| kapman-polygon-MCP | `POLYGON_DEALER_STRIKE_BAND_UP` | C | R: source/tool | [kapman-polygon-MCP/main.py:127](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:127>) |
| kapman-polygon-MCP | `POLYGON_GAMMA_FLIP_EDGE_STRIKES` | C | R: source/tool | [kapman-polygon-MCP/main.py:135](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:135>) |
| kapman-polygon-MCP | `POLYGON_GAMMA_FLIP_MIN_BRACKET_RATIO` | C | R: source/tool | [kapman-polygon-MCP/main.py:140](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:140>) |
| kapman-polygon-MCP | `POLYGON_OPTIONS_CHAIN_MAX_CONTRACTS` | C | R: source/tool | [kapman-polygon-MCP/main.py:77](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:77>) |
| kapman-polygon-MCP | `POLYGON_OPTIONS_CHAIN_MONEYNESS_BAND` | C | R: source/tool | [kapman-polygon-MCP/main.py:96](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:96>) |
| kapman-polygon-MCP | `POLYGON_OPTIONS_WALL_MONEYNESS_MAX` | C | R: source/tool | [kapman-polygon-MCP/main.py:115](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:115>) |
| kapman-polygon-MCP | `POLYGON_VOLATILITY_CHAIN_DTE_MAX` | C | R: source/tool | [kapman-polygon-MCP/main.py:108](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:108>) |
| kapman-polygon-MCP | `POLYGON_VOLATILITY_CHAIN_MAX_CONTRACTS` | C | R: source/tool | [kapman-polygon-MCP/main.py:112](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:112>) |
| kapman-polygon-MCP | `POLYGON_VOLATILITY_MONEYNESS_BAND` | C | R: source/tool | [kapman-polygon-MCP/main.py:102](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:102>) |
| kapman-polygon-MCP | `PORT` | C | R: source/tool | [kapman-polygon-MCP/main.py:3129](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:3129>) |
| kapman-polygon-MCP | `PUBLIC_BASE_URL` | C | R: source/tool | [kapman-polygon-MCP/main.py:197](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/main.py:197>) |
| kapman-polygon-MCP | `PYTHONUNBUFFERED` | C | D | [kapman-polygon-MCP/Dockerfile:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-polygon-MCP/Dockerfile:3>) |
| kapman-analyst-research | `ANTHROPIC_API_KEY` | S | E | [kapman-analyst-research/.env.example:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:10>) |
| kapman-analyst-research | `APP_ENV` | C | E | [kapman-analyst-research/.env.example:14](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:14>) |
| kapman-analyst-research | `ARTIFACT_STORE_BACKEND` | C | E | [kapman-analyst-research/.env.example:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:6>) |
| kapman-analyst-research | `DATABASE_URL` | S | E | [kapman-analyst-research/.env.example:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:2>) |
| kapman-analyst-research | `GEMINI_API_KEY` | S | E | [kapman-analyst-research/.env.example:11](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:11>) |
| kapman-analyst-research | `KAPMAN_TIMEZONE` | C | E | [kapman-analyst-research/.env.example:16](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:16>) |
| kapman-analyst-research | `LLM_PROVIDER` | C | E | [kapman-analyst-research/.env.example:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:9>) |
| kapman-analyst-research | `LOG_LEVEL` | C | E | [kapman-analyst-research/.env.example:15](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:15>) |
| kapman-analyst-research | `POSTGRES_DB` | C | D | [kapman-analyst-research/docker-compose.yml:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/docker-compose.yml:5>) |
| kapman-analyst-research | `POSTGRES_PASSWORD` | S | D | [kapman-analyst-research/docker-compose.yml:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/docker-compose.yml:7>) |
| kapman-analyst-research | `POSTGRES_USER` | I | D | [kapman-analyst-research/docker-compose.yml:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/docker-compose.yml:6>) |
| kapman-analyst-research | `RESEARCH_ARCHIVE_ROOT` | C | E | [kapman-analyst-research/.env.example:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-analyst-research/.env.example:5>) |
| wyckoff_fast_bench | No matched environment inputs | — | No local env files, no repo secrets returned; no active hook found | [wyckoff_fast_bench/.git/HEAD](</Volumes/OWC Envoy Pro SX/App Development/wyckoff_fast_bench/.git/HEAD>) at `2c747faeb842145b51c7b75d3eec4ec974d26609`; tracked-file enumeration |
| kapman-danelfin-backtest | `DANELFIN_API_KEY` | S | L; E; R: source/tool | [kapman-danelfin-backtest/.env:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-danelfin-backtest/.env:1>)<br>[kapman-danelfin-backtest/.env.example:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-danelfin-backtest/.env.example:1>)<br>[kapman-danelfin-backtest/dfin_bt/config.py:33](</Volumes/OWC Envoy Pro SX/App Development/kapman-danelfin-backtest/dfin_bt/config.py:33>) |
| kapman-danelfin-backtest | `POLYGON_API_KEY` | S | L; E; R: source/tool | [kapman-danelfin-backtest/.env:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-danelfin-backtest/.env:2>)<br>[kapman-danelfin-backtest/.env.example:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-danelfin-backtest/.env.example:2>)<br>[kapman-danelfin-backtest/dfin_bt/config.py:34](</Volumes/OWC Envoy Pro SX/App Development/kapman-danelfin-backtest/dfin_bt/config.py:34>) |
| kapman-research | `FMP_API_KEY` | S | L; R: source/tool | [kapman-research/.env:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/.env:5>)<br>[kapman-research/lib/data/fmp_mcp.py:56](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/lib/data/fmp_mcp.py:56>) |
| kapman-research | `OAUTH_CLIENT_ID` | I | L; local declaration; consumer unverified | [kapman-research/.env:3](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/.env:3>) |
| kapman-research | `OAUTH_CLIENT_SECRET` | S | L; local declaration; consumer unverified | [kapman-research/.env:4](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/.env:4>) |
| kapman-research | `POLYGON_API_KEY` | S | L; R: source/tool | [kapman-research/.env:1](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/.env:1>)<br>[kapman-research/lib/data/polygon.py:77](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/lib/data/polygon.py:77>) |
| kapman-research | `POLYGON_BATCH_MAX_WORKERS` | C | L; local declaration; consumer unverified | [kapman-research/.env:2](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/.env:2>) |
| kapman-research | `SCHWAB_MCP_URL` | S | L; R: source/tool | [kapman-research/.env:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/.env:6>)<br>[kapman-research/lib/data/schwab_mcp.py:53](</Volumes/OWC Envoy Pro SX/App Development/kapman-research/lib/data/schwab_mcp.py:53>) |
| kapman-assessments | `NEXT_PUBLIC_DEBUG_PERF` | C | R: source/tool; copied evidence, not an app runtime | [kapman-assessments/reviews/R2026-09-05-claude-01/responses/GPT-2026-09-05-01/evidence/source/kapman-tradelog/src/lib/positions/compute-position-snapshot.ts:23](</Volumes/OWC Envoy Pro SX/App Development/kapman-assessments/reviews/R2026-09-05-claude-01/responses/GPT-2026-09-05-01/evidence/source/kapman-tradelog/src/lib/positions/compute-position-snapshot.ts:23>) |
| kapman-assessments | `POLYGON_API_KEY` | S | R: source/tool; copied evidence, not an app runtime | [kapman-assessments/reviews/R2026-09-05-claude-01/responses/GPT-2026-09-05-01/evidence/source/kapman-tradelog/src/lib/marketdata/ingest-option-marks.ts:439](</Volumes/OWC Envoy Pro SX/App Development/kapman-assessments/reviews/R2026-09-05-claude-01/responses/GPT-2026-09-05-01/evidence/source/kapman-tradelog/src/lib/marketdata/ingest-option-marks.ts:439>) |
| kapman-schwab-MCP-ARCHIVE | `DATABASE_URL` | S | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/drizzle.config.ts:12](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/drizzle.config.ts:12>) |
| kapman-schwab-MCP-ARCHIVE | `KAPMAN_AUTHENTICATION_TOKEN` | S | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/server/routes.ts:37](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/server/routes.ts:37>) |
| kapman-schwab-MCP-ARCHIVE | `KAPMAN_FETCH_KEY` | S | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/attached_assets/main_1759801485130.py:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/attached_assets/main_1759801485130.py:10>) |
| kapman-schwab-MCP-ARCHIVE | `NODE_ENV` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/vite.config.ts:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/vite.config.ts:10>) |
| kapman-schwab-MCP-ARCHIVE | `PORT` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/server/index.ts:63](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/server/index.ts:63>) |
| kapman-schwab-MCP-ARCHIVE | `REPL_ID` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/vite.config.ts:11](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/vite.config.ts:11>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_BASE` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:5](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:5>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_CHAIN_URL` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:7>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_CLIENT_ID` | I | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:9](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:9>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_CLIENT_SECRET` | S | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:10](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:10>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_MOVERS_URL` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/server/schwab-api.ts:57](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/server/schwab-api.ts:57>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_PRICE_HISTORY_URL` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/server/schwab-api.ts:56](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/server/schwab-api.ts:56>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_QUOTES_URL` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/server/schwab-api.ts:55](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/server/schwab-api.ts:55>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_REDIRECT_URI` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:12](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:12>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_REFRESH_TOKEN` | S | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:11](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:11>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_REFRESH_TOKEN_UPDATED_AT` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/server/schwab-api.ts:62](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/server/schwab-api.ts:62>) |
| kapman-schwab-MCP-ARCHIVE | `SCHWAB_TOKEN_URL` | C | R: source/tool; archived app; live use unknown | [kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:6](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP-ARCHIVE/attached_assets/fetch_option_chain_1759801485130.py:6>) |
| schwab-mcp-jkoelker | `APP_ID` | I | R: workflow (not listed in repo secrets) | [schwab-mcp-jkoelker/.github/workflows/agent.yaml:57](</Volumes/OWC Envoy Pro SX/App Development/schwab-mcp-jkoelker/.github/workflows/agent.yaml:57>) |
| schwab-mcp-jkoelker | `APP_PRIVATE_KEY` | S | R: workflow (not listed in repo secrets) | [schwab-mcp-jkoelker/.github/workflows/agent.yaml:58](</Volumes/OWC Envoy Pro SX/App Development/schwab-mcp-jkoelker/.github/workflows/agent.yaml:58>) |
| schwab-mcp-jkoelker | `COPILOT_AUTH_JSON` | S | R: workflow (not listed in repo secrets) | [schwab-mcp-jkoelker/.github/workflows/agent.yaml:84](</Volumes/OWC Envoy Pro SX/App Development/schwab-mcp-jkoelker/.github/workflows/agent.yaml:84>) |
| schwab-mcp-jkoelker | `GITHUB_TOKEN` | S | G: generated per job; R: workflow | [schwab-mcp-jkoelker/.github/workflows/container.yml:31](</Volumes/OWC Envoy Pro SX/App Development/schwab-mcp-jkoelker/.github/workflows/container.yml:31>) |
| schwab-mcp-jkoelker | `SCHWAB_CLIENT_ID` | I | T | [schwab-mcp-jkoelker/tests/test_cli_credentials.py:133](</Volumes/OWC Envoy Pro SX/App Development/schwab-mcp-jkoelker/tests/test_cli_credentials.py:133>) |
| schwab-mcp-jkoelker | `SCHWAB_CLIENT_SECRET` | S | T | [schwab-mcp-jkoelker/tests/test_cli_credentials.py:134](</Volumes/OWC Envoy Pro SX/App Development/schwab-mcp-jkoelker/tests/test_cli_credentials.py:134>) |
| schwab-mcp-jkoelker | `SCHWAB_MCP_DISCORD_APPROVERS` | C | R: source/tool | [schwab-mcp-jkoelker/src/schwab_mcp/cli.py:265](</Volumes/OWC Envoy Pro SX/App Development/schwab-mcp-jkoelker/src/schwab_mcp/cli.py:265>) |
| kapman-tradelog-db (Fly app; no separate checkout) | `FLY_CONSUL_URL` | S | F: platform/cluster-owned; not a generic app-sync target | `fly secrets list -a kapman-tradelog-db --json`; [kapman-tradelog/ops/archive-db-to-mac.sh:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:30>) identifies the DB app default |
| kapman-tradelog-db (Fly app; no separate checkout) | `OPERATOR_PASSWORD` | S | F: platform/cluster-owned; not a generic app-sync target | `fly secrets list -a kapman-tradelog-db --json`; [kapman-tradelog/ops/archive-db-to-mac.sh:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:30>) identifies the DB app default |
| kapman-tradelog-db (Fly app; no separate checkout) | `REPL_PASSWORD` | S | F: platform/cluster-owned; not a generic app-sync target | `fly secrets list -a kapman-tradelog-db --json`; [kapman-tradelog/ops/archive-db-to-mac.sh:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:30>) identifies the DB app default |
| kapman-tradelog-db (Fly app; no separate checkout) | `SSH_CERT` | I | F: platform/cluster-owned; not a generic app-sync target | `fly secrets list -a kapman-tradelog-db --json`; [kapman-tradelog/ops/archive-db-to-mac.sh:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:30>) identifies the DB app default |
| kapman-tradelog-db (Fly app; no separate checkout) | `SSH_KEY` | S | F: platform/cluster-owned; not a generic app-sync target | `fly secrets list -a kapman-tradelog-db --json`; [kapman-tradelog/ops/archive-db-to-mac.sh:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:30>) identifies the DB app default |
| kapman-tradelog-db (Fly app; no separate checkout) | `SU_PASSWORD` | S | F: platform/cluster-owned; not a generic app-sync target | `fly secrets list -a kapman-tradelog-db --json`; [kapman-tradelog/ops/archive-db-to-mac.sh:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/archive-db-to-mac.sh:30>) identifies the DB app default |
| kapman-schwab-MCP | `/data/token.yaml` | S / V | Runtime access/refresh-token state; configured on `/data` volume, contents not read | [kapman-schwab-MCP/fly.toml:14](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:14>); [kapman-schwab-MCP/fly.toml:30](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/fly.toml:30>); [kapman-schwab-MCP/scripts/weekly-refresh.sh:7](</Volumes/OWC Envoy Pro SX/App Development/kapman-schwab-MCP/scripts/weekly-refresh.sh:7>) |

### Sharing, stale declarations, and boundaries

Local equality was verified for these credential relationships (remote equality remains unknown):

- Finnhub: Fair Value `FINNHUB_API_KEY` equals Finnhub MCP's misspelled `FINHUB_API_KEY`. The MCP explicitly accepts both spellings. Use one canonical `FINNHUB_API_KEY` vault field; adapt the old env name only where necessary.
- Massive/Polygon S3: Tradelog and Trader share `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. The latter also equals the `POLYGON_API_KEY` stored by legacy Polygon MCP, Polygon v2, Danelfin Backtest, and Research. That is a verified equality, not proof that these are intended provider aliases. Confirm the provider/account association and split API versus object-store credentials when the provider supports it.
- Tradelog and Trader share another `POLYGON_API_KEY` value, distinct from the preceding group. Do not collapse both groups into one field during migration merely because their env names match.
- Viewer, Polygon v2, and Research share `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`. Model the producer/consumer relationship once, with a vault boundary dedicated to this integration.
- Tradelog `MCP_SERVER_URL` equals Research `SCHWAB_MCP_URL`; it contains a URL path credential. Store the token once and derive consumer URLs in memory. Viewer `VIEWER_MCP_URL` is an ordinary base endpoint in its local file, not a token-bearing URL.
- Schwab client credentials are referenced by the active Schwab server, the archived server, and the upstream fork. Only the active app's Fly name listing establishes current provisioning. No local credential equality was established for these three repositories.
- Fly tokens exist in Viewer local `.env` and multiple GitHub repositories. Values and scopes could not be compared through the metadata APIs. Do not assume a shared token, or that a token named `FLY_API_TOKEN` is app-scoped. Replace each with an app-scoped deployment token during migration.

Source paths for each relationship are the corresponding L rows in the inventory. Source-only rows for Viewer seed/research tools expose additional dependencies on Polygon, S3, and Tradelog bearer access even though those keys are absent from Viewer's local `.env`.

The local-file inventory exceeds the examples: Tradelog `.env.example` omits its current `API_BEARER_TOKEN`, while its local/Fly stores retain `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` with no matched current reader. Viewer retains `VIEWER_PASSWORD`, `PROD_VIEWER_PASSWORD`, and `SESSION_SECRET` locally, and some on Fly, while its current config reads `VIEWER_API_TOKEN` and Cloudflare Access identifiers. Treat these as **retirement candidates**, not permission to delete them: inventory the deployed release and all scripts first. These conclusions come from the respective inventory rows and their source/config citations.

Tradelog stores `S3_BUCKET`/`S3_ENDPOINT_URL` in Fly's secrets service, and Schwab/Viewer similarly store some flags and paths there. Move plain values to committed configuration only in a later approved implementation, preserving effective values and checking Fly secret precedence. Tradelog's Dockerfile has a build-only database placeholder; its Compose file has a local database URL/password literal. They are local defaults, not evidence of production DB exposure. The proposed Compose migration must replace the explicit database environment mapping; merely running `op run` cannot override a hardcoded Compose value.

`kapman-trader/.envrc` invokes dotenv loading (line 3); entering the directory can export credentials into the parent shell, where an AI process launched afterward inherits them. Replace that behavior with wrappers, not automatic credential export. The checked global Claude settings at `/Users/vkapella/.claude/settings.json` and project settings at `/Volumes/OWC Envoy Pro SX/App Development/kapman-kb/.claude/settings.json` contain no deny rules. The per-repo inventory also reports the absence of active hooks. Neither ignored files nor an attached-repo workflow is a confidentiality boundary.

## Git-history findings and triage

Gitleaks reported **22 findings in five repositories**. Six credential-shaped findings are in Trader; the other 16 are public identifiers or examples/test material. The supplemental exact-match search found a further genuine exposure in Tradelog. No value is reproduced below. Revocation status is unknown.

| Repository | Commit | File / line at that commit | Assessment |
|---|---|---|---|
| kapman-tradelog | `2e5cfb0e0539d7bc4668da923347c3871dd7c743` | `.env:4` | **Confirmed historical token-bearing `MCP_SERVER_URL`, equal to current local Tradelog/Research URL.** Supplemental exact-match finding; missed by default gitleaks. Rotate the underlying Schwab MCP URL token and update every consumer. |
| kapman-trader | `9a30985389ab22f83b28eea289eb7330ae146ccc` | `.env.backup:8` | **Anthropic credential** under historical `CLAUDE_API_KEY`, equal to current local `ANTHROPIC_API_KEY`. Rotate/revoke. |
| kapman-trader | `9a30985389ab22f83b28eea289eb7330ae146ccc` | `.env.backup:11` | Credential-shaped historical `POLYGON_API_KEY`; differs from current local values checked. Treat as exposed until provider revocation is verified. |
| kapman-trader | `9a30985389ab22f83b28eea289eb7330ae146ccc` | `.env.backup:15–16` | S3 credential pair; access-key ID matches current local Tradelog/Trader ID. Secret-key revocation unknown. Rotate the pair. |
| kapman-trader | `9681536cd3c2d0456a5bcb7a641f07bc305bb51e` | `core/pipeline/s3_universe_loader.py:26–27` | Hardcoded S3 credential pair; access-key ID matches current local pair. Rotate/reconcile with the previous row. |
| kapman-trader | `9a30985389ab22f83b28eea289eb7330ae146ccc`, `c5377b7185455aa8e70c06359bd43656d711080c` | `test_stock_data.py:20` | Hardcoded credential matches current local Tradelog/Trader `POLYGON_API_KEY`; source context also uses S3. Verify provider identity; revoke all affected uses of that credential. Two gitleaks findings. |
| kapman-tradelog | `e7ee74a3b68e76d5904a3b8071219390cd603453` | `fly.toml:20` | `CF_ACCESS_AUD`, public audience identifier; false positive, not a credential rotation target. |
| kapman-tradelog | `f574cce543b31a4b5450a43b9a1f1e512fc5c57e` | `src/lib/auth/bearer.test.ts:4` | Synthetic bearer-test fixture; no current local credential match. Not evidence of a production credential. |
| kapman-polygon-viewer | `7f14f4250df6b4c4f25f09ccbd5bece3e3647a81` | `fly.toml:21` | `CF_ACCESS_AUD`, public audience identifier; false positive. |
| kapman-schwab-MCP | `05ba5c16c8eb6f570440bd0f05d27902369d8cff` | `SCHWAB_TOKEN_REFRESH.md:134` | Admin-header documentation placeholder; false positive. |
| kapman-schwab-MCP | `07079c50d947152a8b797ec60798e84bcde8670c` | `SCHWAB_TOKEN_REFRESH.md:227–228,235–236` | Staging/production admin-header placeholders; two false positives. |
| kapman-schwab-MCP | `2d7c5ef5f7ef3f76106086d462e902695a6c9323` | `SCHWAB_TOKEN_REFRESH.md:243–244` | Admin-header placeholder; false positive. |
| kapman-schwab-MCP-ARCHIVE | `bf5a7ad3c22045815107b7bbd211e7a0f225057e` | `API_SPECIFICATION.md` and `API_SPECIFICATION (copy).md`: each `486–489,493,497,501` | Eight placeholder bearer-header findings. |
| kapman-schwab-MCP-ARCHIVE | `bf5a7ad3c22045815107b7bbd211e7a0f225057e` | `attached_assets/Pasted-Perfect-I-ve-compiled-the-diagnostics-from-the-latest-run-Here-s-what-I-found-Schwab-Options-Dat-1764562270845_1764562270845.txt:54` | Placeholder header in pasted evidence; false positive. |

The other 15 repositories had zero gitleaks findings. Supplemental URL matches in Viewer, Polygon v2 and Assessments were ordinary non-credential endpoints and are not classified as leaks. Historical environment files may contain additional low-entropy/default credentials not detected by gitleaks: Trader `.env.backup:2–4` contains database configuration, including a password declaration; Tradelog's historical `.env:1` contains a database URL. Verify whether these were local-only defaults; rotate if used anywhere beyond disposable local development.

History cleanup is a separate approved operation after revocation. Removing a file from HEAD, adding `.gitignore`, or rewriting history does not revoke a credential or remove copies in forks, clones, caches, AI transcripts, or screenshots. Preserve an incident record containing only provider, identifier/name, affected repos/commits, replacement date, and revocation verification. Do not broadly allowlist `.env`, documentation, archive trees, or high-entropy identifiers to make a scan green.

## Threat model

Protect provider accounts, trading/account-data access, production databases, app authentication, and deployment authority against accidental commits, AI transcript/screenshot/command leakage, theft of a locked laptop, unmanaged copies and drift, and continued access using leaked or forgotten credentials. Repository access and source visibility are assumed normal; production secret access is a separate privilege.

Controls: remove plaintext files, keep secrets out of parent-shell environments, use encrypted vault storage and FileVault/strong device login, restrict machine credentials, inject only into trusted processes, suppress sensitive logs, coordinate rotation, and scan commits/CI. Touch ID gates a local unlock; it does not make an already authorized terminal trustworthy. FileVault status and Touch ID hardware/enrollment were not verified in this audit. These checkouts are on an external volume: internal-disk FileVault does not establish encryption of that external drive; verify external-volume encryption and backup encryption separately.

Excluded: nation-state attacks, a malicious insider deliberately authorized to access secrets, and guarantees against root/admin compromise or arbitrary code execution inside a secret-bearing runtime. Prompt injection and accidental AI overreach remain relevant, but no vault protects a secret from a process that has been given that secret. A vault outage should block new credential retrieval/sync, not stop already running Fly services. Encrypted OS swap, crash dumps, Docker metadata, and app logs remain part of the endpoint threat surface.

## Options comparison and selected solution

The original three candidates remain compared below; **Google Cloud Secret Manager (GSM)** is added because the operator explicitly selected it after confirming that both operators already use Apple Passwords and Google Workspace. Scores are design judgments, **1 weak / 5 strong**; higher cost/lock-in/migration scores mean cheaper, easier to leave, easier to migrate. These are not vendor benchmarks.

| Criterion | 1Password + op | Doppler | SOPS + age | Google Cloud Secret Manager — selected |
|---|---:|---:|---:|---:|
| Single authority / distribution | 4: custom Fly sync | 5: native Fly/GitHub sync | 3: encrypted Git plus custom delivery | 4: central versions and custom Fly sync |
| Rotation effort | 4: edit and fan out | 5: integration fan-out | 2: rotate, encrypt, commit, distribute | 4: new version, pinned manifests, controlled fan-out |
| Unattended machine access | 4: service-account bootstrap token | 5: service tokens / supported identity auth | 3: provision age identity on runner | 5: GitHub OIDC/WIF, no static Google key |
| Accidental AI visibility | 4: child env/default masking | 3: child env; protect CLI cache | 2: accessible key can decrypt covered history | 3: IAM and child env; custom output discipline required |
| Cost for two operators | 3: new team subscription | 3: free tier limits native sync count | 5: no license fee | 5: usage-based, modest-volume allowances |
| Low lock-in | 3: vendor references/API | 3: vendor config/sync | 5: open format | 3: Google IAM/API; portable name/version manifests |
| Low migration effort | 4: supported local runtime tools | 4: setup integrations/configs | 2: own key distribution and sync | 3: own IAM/WIF and local/sync wrappers |
| Total / 35 | 26 | 28 | 22 | **27** |

GSM is selected for individual access under the `kapmancapital.com` organization, keyless GitHub authentication, auditability and reuse of existing human identities. It accepts more initial engineering than 1Password or Doppler. It is the **single authority for operator-managed application secrets**; Apple Passwords remains the **human-login** store. Do not mirror application API keys into Apple Passwords or run two competing application-secret authorities.

1Password would provide Touch ID integration, scoped service accounts, `op run`/`op inject` and an official GitHub action. Its normal env references use `op://vault/item/field`; `op inject` uses `{{ op://vault/item/field }}`. A service account's vault grants, not item naming, define its access boundary. CI would retain a bootstrap token. This option is not selected; no `op` installation, subscription or OP token is required. [CLI run](https://www.1password.dev/cli/reference/commands/run), [inject](https://www.1password.dev/cli/reference/commands/inject), [service accounts](https://www.1password.dev/service-accounts/get-started), [official action](https://www.1password.dev/ci-cd/github-actions).

Doppler is the strongest turnkey Fly drift solution: its native integration continuously syncs changes, with configurable Machine restart behavior; restarts can be concurrent. Its GitHub integrations can replicate repository secrets, or CI can retrieve them at runtime. This is convenient but requires explicit operational control around Tradelog and coordinated MCP token changes. [Fly integration](https://docs.doppler.com/docs/flyio), [GitHub integrations](https://docs.doppler.com/docs/github).

SOPS/age keeps encrypted values in Git, but humans/runners must receive a decryption identity and distribution scripts. A stolen age identity can decrypt historical ciphertext it covers. Re-encrypting with a new data key or removing a recipient does not rotate the underlying provider credential or revoke old ciphertext copies. [SOPS reference](https://github.com/getsops/sops).

Costs checked 2026-09-12: 1Password advertises Teams Starter at $19.95/month for up to ten people; Doppler Developer is free for three users with five config syncs, while Team is $21/user/month with 100 syncs. Six operator-managed app targets (excluding the DB) already exceed five native Fly syncs before GitHub. GSM charges for active secret versions and accesses, with free allowances; Google Cloud billing/log retention costs are separate from Workspace. SOPS has no subscription but higher engineering/recovery cost. Confirm actual billing terms, regional pricing and retained version counts before implementation; an env-name count is not a secret-version cost estimate. [1Password team pricing](https://1password.com/product/teams-small-business-password-manager), [Doppler pricing](https://www.doppler.com/pricing), [GSM pricing](https://cloud.google.com/secret-manager/pricing).

| Surface / threat | 1Password | Doppler | SOPS + age | Selected Google design |
|---|---|---|---|---|
| macOS / direnv | Touch ID, `op run`; no decrypted direnv export | `doppler run`; protect local auth/cache | decrypt into child process; protect age key | individual `gcloud auth login`; wrapper fetches into child env; no decrypted direnv export |
| Fly | custom stdin sync | native continuous sync | custom stdin sync | per-app pinned-version stdin sync; Fly remains runtime cache |
| GitHub Actions | official action + bootstrap token | sync or runtime fetch | runner decryption key | OIDC/WIF + Google's actions; no Google service-account JSON or vault bootstrap token |
| Docker Compose | explicit env mapping required | same | same | same; no secrets at image build; daemon metadata remains sensitive |
| Claude Code | masking and sandbox; no arbitrary code secrecy | sandbox and careful output | key isolation essential | deny credential caches and raw access; isolated trusted execution, output suppressed |
| Claude.ai connectors | manual consent/update | manual consent/update | manual consent/update | same; cannot resolve a GSM reference automatically |
| Accidental commit | references + scanner | no env file + scanner | ciphertext + scanner | references + scanner, including custom MCP URL rule |
| Laptop theft | encrypted vault/device; unlocked session risk | protect local auth/cache | encrypted key storage; historical ciphertext risk | protect gcloud refresh credentials/device/external drive; revoke sessions/IAM on loss |
| AI transcript/screenshot | exact masking is partial defense | no universal app-output protection | decrypted output vulnerable | default wrapper suppresses output; no universal screenshot/encoding protection |
| Drift | owned sync/receipts | native sync strongest | Git version does not prove runtime parity | pinned secret versions, receipts, Machine verification and audit alerts |
| Recovery after leak | provider revocation | provider revocation | provider + decryption-key review | provider revocation plus disable affected GSM versions; reauthorize connectors |

### Existing Apple and Google accounts

Apple Passwords shared groups are suitable for **human-only** shared logins. All members can change shared credentials; removal does not revoke a password already learned. Use separate provider accounts where available and shared logins only where necessary. There is no documented Apple Passwords equivalent to scoped Linux service accounts/Fly sync/CI secret retrieval; do not build this around exports or UI scraping. [Apple shared groups](https://support.apple.com/en-gb/guide/passwords/mchlc00a3602/mac), [membership and revocation](https://support.apple.com/guide/personal-safety/manage-shared-password-and-passkeys-ips3ce9f6e15/web).

Workspace supplies identities, not the GSM service itself. Google Password Manager sharing is family-oriented and work accounts cannot join Google family groups; neither Drive documents nor Google Vault should hold app secrets. The chosen design requires a Google Cloud project parented to the organization's **verified numeric organization ID**, with billing and APIs enabled. The domain name alone is not evidence of that project or permissions. `gcloud` is not currently installed on this machine. [Workspace account restriction](https://support.google.com/accounts/answer/6317858?hl=en), [organization setup](https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization).

## Concrete Google Cloud design

### Organization, project, IAM and secret layout

Proposed project label: **Kapman Secrets**, under the Cloud organization associated with `kapmancapital.com`. The globally unique project ID is not yet verified; examples use `kapman-secrets-example` as an explicitly non-authoritative placeholder. Verify organization ID, billing account, project ID/number and administrators before creation. Enable Secret Manager, IAM, STS, Resource Manager and the required logging services. Select/record automatic or user-managed replication based on location requirements before populating secrets. No project, IAM binding or API has been created by this assessment.

The operator and Ron authenticate with **their own Workspace accounts**, never a shared gcloud login. Grant `roles/secretmanager.secretAccessor` on only the secrets each person needs. Separate rotation permissions (adding/managing versions) from read access and IAM administration; reserve project/IAM/WIF/logging administration for designated administrators and recovery. Avoid broad Owner/Editor and project-wide Secret Accessor. Review inherited org/project roles: per-secret grants do not cancel broader inherited access. Maintain individual audit attribution even if role assignment is managed via a small, controlled Workspace group. [Secret access IAM](https://docs.cloud.google.com/secret-manager/docs/manage-access-to-secrets), [authentication](https://docs.cloud.google.com/secret-manager/docs/authentication).

Use **one secret resource per independent value and environment**, not a large JSON bundle, so IAM and rotation can be precise. Secret IDs follow `<environment>-<owner-or-integration>--<ENV_VAR_NAME>`; preserve env-name spelling on the right. `dev-` and `prod-` naming is organizational, not a security control: grant IAM separately. A future separate dev project can add isolation without changing the authority model. Grant CI access to exact resources, not all secrets sharing a prefix.

| Resource examples in the chosen project | Consumers / policy |
|---|---|
| `prod-shared-massive-flatfiles--AWS_ACCESS_KEY_ID`, `prod-shared-massive-flatfiles--AWS_SECRET_ACCESS_KEY` | Tradelog/Trader; other tools only if confirmed; keep pair metadata linked |
| `prod-shared-massive-primary--POLYGON_API_KEY`, `prod-shared-massive-legacy--POLYGON_API_KEY` | Preserve the two observed groups until provider/account identity is reconciled |
| `prod-shared-finnhub--FINNHUB_API_KEY` | Finnhub MCP and Fair Value; map legacy `FINHUB_API_KEY` to the same resource |
| `prod-polygon-link--OAUTH_CLIENT_ID`, `prod-polygon-link--OAUTH_CLIENT_SECRET` | Polygon v2 producer, Viewer and confirmed Research consumer |
| `prod-schwab-link--MCP_URL_TOKEN` | Schwab producer, Tradelog/Research and smoke consumers; no admin/client-secret access granted to consumers |
| `prod-schwab--SCHWAB_CLIENT_ID`, `prod-schwab--SCHWAB_CLIENT_SECRET`, `prod-schwab--ADMIN_AUTH_TOKEN`, `prod-schwab--TOKEN_PROMOTE_SHARED_SECRET` | Schwab operational boundary; distinct secrets/grants |
| `prod-tradelog--DATABASE_URL`, `prod-tradelog--API_BEARER_TOKEN`, `prod-tradelog--PIPELINE_HEARTBEAT_URL` | DB client credential, inbound API auth and heartbeat capability; separate readers as needed |
| `prod-viewer--VIEWER_API_TOKEN`, `prod-viewer-upload--CF_ACCESS_CLIENT_ID`, `prod-viewer-upload--CF_ACCESS_CLIENT_SECRET` | Separate runtime access from upload tooling |
| `prod-<fly-app>--FLY_API_TOKEN` | One app-scoped expiring Fly deploy token per target; only operator sync and that app's existing deployment job |
| Corresponding `dev-*` resources | Separate reduced-scope dev credentials; any unavoidable production provider reuse is explicitly documented |
| Other provider/integration resources | Marketdata, FMP, Danelfin, OpenAI, Anthropic, Gemini, Unicorn, EODHD, SMTP and CI-agent values only where an active consumer is confirmed |

For each resource record nonsecret labels/metadata: provider/account owner, env, purpose, readers, consumers, expiration, rotation procedure, pending/current/retired status, incident references and last verified rotation. Numeric versions are immutable values; production manifests pin a numeric version, never `latest`, to make rollout and rollback reviewable. Update every consumer manifest for a shared-resource version in one coordinated change. Secret Manager stores one value per version, so no duplicate app copies of the same provider credential are needed. [Version/best-practice guidance](https://docs.cloud.google.com/secret-manager/docs/best-practices).

Fly database cluster-owned secrets remain under supported database operations. GSM owns the app DB-role credential and operational recovery record, not an independently writable copy of replication/SU/operator passwords or SSH internals. Schwab's refreshed token file likewise remains runtime state, not a static version to overwrite on each sync.

### Reference templates and local process injection

Commit `.env.tpl` and `fly.secrets.tpl`; **never render them to a plaintext `.env`**. The custom reference syntax is `gsm://PROJECT_ID/SECRET_ID/NUMERIC_VERSION`, implemented by the loader below, not a native gcloud interpolation format. Fields map directly to env var names; ordinary configuration is literal and nonsecret. There is no shell evaluation or `${...}` interpolation in these templates. Examples show version `1` only as a proposed placeholder; replace it with the approved actual version at implementation.

Example Tradelog `.env.tpl`:

```dotenv
NODE_ENV=development
NEXT_TELEMETRY_DISABLED=1
DATABASE_URL=gsm://kapman-secrets-example/dev-tradelog--DATABASE_URL/1
API_BEARER_TOKEN=gsm://kapman-secrets-example/dev-tradelog--API_BEARER_TOKEN/1
MCP_URL_TOKEN=gsm://kapman-secrets-example/dev-schwab-link--MCP_URL_TOKEN/1
SCHWAB_MCP_BASE_URL=https://schwab-dev.example.invalid
AWS_ACCESS_KEY_ID=gsm://kapman-secrets-example/dev-shared-massive-flatfiles--AWS_ACCESS_KEY_ID/1
AWS_SECRET_ACCESS_KEY=gsm://kapman-secrets-example/dev-shared-massive-flatfiles--AWS_SECRET_ACCESS_KEY/1
POLYGON_API_KEY=gsm://kapman-secrets-example/dev-shared-massive-primary--POLYGON_API_KEY/1
```

`SCHWAB_MCP_BASE_URL` is a new **wrapper** input; replace its non-routable example with a reviewed dev endpoint, not silently with production. The wrapper converts the link token into current Tradelog `MCP_SERVER_URL`. Research uses the same resource with output name `SCHWAB_MCP_URL`. Normal endpoint/bucket/prefix values remain committed config after effective values are verified.

Proposed hub module `ops/secrets_common.py` (all snippets are design-only):

```python
import base64
import os
from pathlib import Path
import re
import subprocess

REFERENCE = re.compile(r"gsm://([a-z][a-z0-9-]{4,61}[a-z0-9])/([A-Za-z0-9_-]+)/([1-9][0-9]*)")
ENV_NAME = re.compile(r"[A-Z][A-Z0-9_]*")


def base_env():
    # Explicitly omit inherited API keys, bearer tokens and arbitrary shell vars.
    return {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "LANG", "TERM")
            if k in os.environ}


def access(reference):
    match = REFERENCE.fullmatch(reference)
    if not match:
        raise ValueError("invalid reference")
    project, secret, version = match.groups()
    cloud_env = base_env()
    # Supports individual local auth and the ephemeral WIF configuration in CI.
    for key in ("CLOUDSDK_CONFIG", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE"):
        if key in os.environ:
            cloud_env[key] = os.environ[key]
    cloud_env.update({"CLOUDSDK_CORE_LOG_HTTP": "false",
                      "CLOUDSDK_CORE_DISABLE_FILE_LOGGING": "true"})
    result = subprocess.run(
        ["gcloud", "secrets", "versions", "access", version,
         "--project=" + project, "--secret=" + secret,
         "--format=get(payload.data)", "--quiet", "--verbosity=none"],
        env=cloud_env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        check=True, timeout=60,
    )
    encoded = result.stdout.strip()
    value = base64.b64decode(encoded, altchars=b"-_", validate=True).decode("utf-8")
    if not value or "\x00" in value:
        raise ValueError("unsupported value")
    return value


def load_template(path, references_only=False):
    entries = []
    seen = set()
    for line in Path(path).read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, sep, raw = line.partition("=")
        if not sep or not ENV_NAME.fullmatch(name) or name in seen:
            raise ValueError("invalid template")
        if not raw or (references_only and not REFERENCE.fullmatch(raw)):
            raise ValueError("invalid template")
        if raw.startswith("gsm://") and not REFERENCE.fullmatch(raw):
            raise ValueError("invalid reference")
        seen.add(name)
        entries.append((name, raw))
    if not entries:
        raise ValueError("empty template")
    # Resolve all before launching a consumer or making a Fly mutation.
    values = {name: access(raw) if raw.startswith("gsm://") else raw
              for name, raw in entries}
    versions = {name: raw for name, raw in entries if raw.startswith("gsm://")}
    return values, versions
```

The base64 is a transient transport representation, not encryption; it is captured and decoded only in memory. The loader disables gcloud HTTP/file logging for these calls and never prints captured stderr. The wrapper uses user gcloud login, **not** a downloaded service-account key; protect gcloud's cached refresh credentials outside AI-accessible paths. Human authentication is a browser/MFA session, not guaranteed Touch ID per retrieval. Do not assume short-lived access tokens mean no persistent local login material. [gcloud access format](https://docs.cloud.google.com/sdk/gcloud/reference/secrets/versions/access), [CLI logging property](https://docs.cloud.google.com/sdk/gcloud/reference/topic/configurations).

Proposed `ops/run-with-secrets.py`:

```python
#!/usr/bin/env python3
import argparse
import os
import resource
import subprocess
import sys
from urllib.parse import quote, urlsplit
from secrets_common import base_env, load_template


def main():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    p = argparse.ArgumentParser()
    p.add_argument("--template", default=".env.tpl")
    p.add_argument("--url-env", choices=["MCP_SERVER_URL", "SCHWAB_MCP_URL"],
                   default="MCP_SERVER_URL")
    p.add_argument("command", nargs=argparse.REMAINDER)
    args = p.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        raise ValueError()
    values, versions = load_template(args.template)
    token = values.pop("MCP_URL_TOKEN", None)
    base = values.pop("SCHWAB_MCP_BASE_URL", None)
    if token or base:
        if not token or not base:
            raise ValueError()
        u = urlsplit(base)
        if u.scheme != "https" or not u.hostname or u.username or u.query or u.fragment:
            raise ValueError()
        if u.path not in ("", "/"):
            raise ValueError()
        values[args.url_env] = base.rstrip("/") + "/mcp/" + quote(token, safe="")
    child = base_env()
    child.update(values)
    # A trusted operator owns this process; output is deliberately suppressed.
    # Do not enable raw stdout/stderr in AI sessions to diagnose a failure.
    completed = subprocess.run(command, env=child,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("Secret-bearing command exit status:", completed.returncode)
    return completed.returncode


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.stderr.write("Secret-bearing command failed; sensitive details suppressed.\n")
        sys.exit(1)
```

Keep one reviewed copy of these tools in the operational hub and point other repos' `bin/with-secrets` wrapper at it. Example wrapper (resolve its absolute hub location through the developer setup, not a guessed relative path):

```bash
#!/usr/bin/env bash
set +x
set -euo pipefail
exec python3 '/Volumes/OWC Envoy Pro SX/App Development/kapman-tradelog/ops/run-with-secrets.py' --template .env.tpl -- "$@"
```

Proposed `.envrc` exposes only the wrapper path:

```bash
watch_file .env.tpl
PATH_add ./bin
# No dotenv, decrypted exports, raw gcloud access, or login here.
```

After an operator signs in with their own Workspace identity through `gcloud auth login`, examples are `bin/with-secrets npm run dev`, `bin/with-secrets uv run python main.py`, and `bin/with-secrets docker compose up`. The templates must match that repo's actual entry point and required config. Wrapper output is suppressed even for failures; add a separately reviewed diagnostic command that reports only health booleans, env **names**, and exit codes. Never expose raw app output to recover convenience. Long-running dev commands run until stopped; their UI can be used normally, with credential-free health checks from a separate session.

Do not launch Claude or an unrestricted shell beneath this wrapper. Minimal environment forwarding must be reviewed per app (e.g. required certificate/proxy settings); do not replace it with all of `os.environ`. The child still has HOME/filesystem access unless isolated, so process environment filtering alone does not protect gcloud caches from arbitrary code. Run production commands in a separate trusted account/runner with no AI write access to the executing code.

Compose requires explicit env mapping; a hardcoded Compose value overrides a shell injection. Replace Tradelog's existing mapping during implementation, keep local DB credentials consistent, and preserve database volumes:

```yaml
services:
  app:
    environment:
      DATABASE_URL: ${DATABASE_URL:?run through bin/with-secrets}
      MCP_SERVER_URL: ${MCP_SERVER_URL:?run through bin/with-secrets}
      API_BEARER_TOKEN: ${API_BEARER_TOKEN:?run through bin/with-secrets}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:?run through bin/with-secrets}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:?run through bin/with-secrets}
```

Docker daemon/container metadata may persist env values; no wrapper can promise zero plaintext on Docker's disk. Restrict daemon access and later consider file-based Compose secrets if stronger isolation is needed. No production secrets in build ARG/ENV, image layers, copied env files, `docker inspect`, or rendered `docker compose config`. Update `.dockerignore` as part of the approved migration. [Compose environment behavior](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

### Per-app Fly sync, no resolved secret file

Keep `ops/secrets/<fly-app>/fly.secrets.tpl` and a small `manifest.json` in Tradelog. Every template contains approved `gsm://.../NUMERIC_VERSION` references. Resolve **all** references before any Fly call; a failed or partial retrieval must never reach `fly secrets import`. No values in command arguments, exception output, temp files, receipts or public hashes. Fly remains an encrypted runtime destination, not an authority.

Example Tradelog `fly.secrets.tpl` for the final active set:

```dotenv
DATABASE_URL=gsm://kapman-secrets-example/prod-tradelog--DATABASE_URL/1
API_BEARER_TOKEN=gsm://kapman-secrets-example/prod-tradelog--API_BEARER_TOKEN/1
MCP_URL_TOKEN=gsm://kapman-secrets-example/prod-schwab-link--MCP_URL_TOKEN/1
AWS_ACCESS_KEY_ID=gsm://kapman-secrets-example/prod-shared-massive-flatfiles--AWS_ACCESS_KEY_ID/1
AWS_SECRET_ACCESS_KEY=gsm://kapman-secrets-example/prod-shared-massive-flatfiles--AWS_SECRET_ACCESS_KEY/1
PIPELINE_HEARTBEAT_URL=gsm://kapman-secrets-example/prod-tradelog--PIPELINE_HEARTBEAT_URL/1
```

The adapter emits `MCP_SERVER_URL`, not a new Tradelog runtime `MCP_URL_TOKEN` variable. `POLYGON_API_KEY` is read locally but absent from the current Fly listing; provision it only after confirming production needs it. First establish parity with existing keys, including still-needed configuration/stale candidates, then separately retire or move nonsecrets to config. Do not silently drop Basic Auth or the current S3 endpoint/bucket entries while migrating.

Example per-app `manifest.json`:

```json
{
  "app": "kapman-tradelog",
  "keys": ["DATABASE_URL", "API_BEARER_TOKEN", "MCP_URL_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "PIPELINE_HEARTBEAT_URL"],
  "deployment_token": "gsm://kapman-secrets-example/prod-kapman-tradelog--FLY_API_TOKEN/1",
  "mcp_base_url": "https://kapman-schwab-mcp.fly.dev"
}
```

Verify the public base endpoint at implementation. Schwab's template maps its five active secret/identifier inputs (`SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET`, `ADMIN_AUTH_TOKEN`, `MCP_URL_TOKEN`, `TOKEN_PROMOTE_SHARED_SECRET`) to their resources. Polygon v2 maps its provider API key and shared OAuth pair; Viewer maps shared OAuth plus `VIEWER_API_TOKEN`; Finnhub maps canonical `FINNHUB_API_KEY` and its own OAuth secret; Fair Value maps canonical `FINNHUB_API_KEY`. Their manifest key lists must exactly match their templates. Flags, origins, callback URL, token **path**, bucket and other plain configuration are moved only after parity review. Do not alter OAuth modes/orders/account-tools flags during secret relocation.

Proposed `ops/sync-fly-secrets.py`:

```python
#!/usr/bin/env python3
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import resource
import subprocess
import sys
from urllib.parse import quote, urlsplit
from secrets_common import access, base_env, load_template

APPS = {
    "kapman-tradelog", "kapman-schwab-mcp", "kapman-polygon-viewer",
    "kapman-polygon-mcp-v2", "kapman-finnhub-mcp-server", "kapman-fair-value-tool"
}
# Narrow, tested single-line transport contract, not a password-generation rule.
SAFE = re.compile(r"[A-Za-z0-9_./:@%+?=&~!,;\-]+")


def main():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    p = argparse.ArgumentParser()
    p.add_argument("app", choices=sorted(APPS))
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()
    folder = Path(__file__).resolve().parent / "secrets" / args.app
    manifest = json.loads((folder / "manifest.json").read_text())
    if manifest["app"] != args.app or len(manifest["keys"]) != len(set(manifest["keys"])):
        raise ValueError()
    values, versions = load_template(folder / "fly.secrets.tpl", references_only=True)
    if set(values) != set(manifest["keys"]) or "FLY_API_TOKEN" in values:
        raise ValueError()
    if not all(SAFE.fullmatch(v) for v in values.values()):
        raise ValueError()
    if args.app == "kapman-tradelog":
        base = manifest["mcp_base_url"]
        u = urlsplit(base)
        if u.scheme != "https" or not u.hostname or u.username or u.query or u.fragment:
            raise ValueError()
        if u.path not in ("", "/"):
            raise ValueError()
        token = values.pop("MCP_URL_TOKEN")
        values["MCP_SERVER_URL"] = base.rstrip("/") + "/mcp/" + quote(token, safe="")
    if not all(SAFE.fullmatch(v) for v in values.values()):
        raise ValueError()
    fly_token = access(manifest["deployment_token"])
    if "\n" in fly_token or "\r" in fly_token:
        raise ValueError()
    payload = "".join(f"{k}={values[k]}\n" for k in sorted(values)).encode()
    child = base_env()
    child["FLY_API_TOKEN"] = fly_token
    command = ["fly", "secrets", "import", "--app", args.app]
    if not args.apply:
        command.append("--stage")
    subprocess.run(command, input=payload, env=child,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   check=True, timeout=300)
    # Nonsecret receipt only; activation still requires per-Machine verification.
    print(json.dumps({"app": args.app, "time": datetime.now(timezone.utc).isoformat(),
                      "versions": versions, "keys": sorted(values),
                      "deployment_token_version": manifest["deployment_token"],
                      "state": "activation-requested" if args.apply else "staged"}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.stderr.write("Secret sync failed; inspect nonsecret status before retrying.\n")
        sys.exit(1)
```

This draft fails closed on whitespace, quotes, newlines, null/empty values, duplicate/missing keys and unresolved/alias references. **Do not change a real credential to fit it.** Add and test a serializer against the pinned Fly parser if an approved current credential needs other characters; do not silently trim, quote or transform it. It supports textual env credentials, not binary keys or token YAML. All proposed code must be reviewed and tested with synthetic data before authorized rollout.

Proposed per-app stage commands:

```bash
python3 ops/sync-fly-secrets.py kapman-fair-value-tool
python3 ops/sync-fly-secrets.py kapman-finnhub-mcp-server
python3 ops/sync-fly-secrets.py kapman-polygon-mcp-v2
python3 ops/sync-fly-secrets.py kapman-polygon-viewer
python3 ops/sync-fly-secrets.py kapman-schwab-mcp
python3 ops/sync-fly-secrets.py kapman-tradelog
```

The DB app is intentionally excluded. Confirm other deployments before adding targets. Default is staging; `--apply` activates secrets and can restart Machines. Staging is already a production mutation: later Machine starts/updates may use staged values. Freeze unrelated deployments during coordinated rotations. `fly secrets import` does not delete unknown keys; compare metadata and remove retired names only through a separate reviewed cleanup. [Fly import/staging](https://fly.io/docs/flyctl/secrets-import/).

A receipt records app, approved numeric versions, template/manifest Git revision, actor/job identity, time, expected output names and rollout result. Add the Git revision and actor from the trusted operator/CI context without recording credential data. Verify every web and scheduler Machine and authenticated behavior before changing receipt status to **verified**. Names/counts alone do not prove parity; no remote values were compared in this audit. Reapplying frozen versions and checking delivery/Machine status is operational convergence, not a cryptographic comparison of runtime values.

No `fly deploy` just to activate Tradelog secrets: its normal deployment applies DB migrations. Preserve the deployed image for secret activation; verify the separately managed scheduler's effective configuration and health. Failed/ambiguous activation may have changed some Machines; inspect sanitized metadata before retry, then roll forward or reapply the last valid version. Never unset all secrets or restore a known-exposed credential.

### GitHub Actions: Workload Identity Federation, no static Google keys

Use GitHub's OIDC issuer `https://token.actions.githubusercontent.com` and a dedicated WIF pool/provider in the secrets project. Prefer **direct federated access** with per-secret Secret Accessor bindings; no Google service-account impersonation is needed for the basic design. An individual human account is never CI's identity. Configure a separate restricted provider/principal boundary per production repo, or equivalently strict attribute-bound grants in a shared pool. Do not grant an entire pool access to every secret.

Map `google.subject=assertion.sub`, `attribute.repository_id=assertion.repository_id`, `attribute.repository_owner_id=assertion.repository_owner_id`, and `attribute.ref=assertion.ref`. The provider condition must check the verified numeric owner ID, numeric repository ID, intended trusted branch/ref, and expected production environment/subject or reviewed workflow identity. Do not rely solely on reusable GitHub names: names can be deleted/reclaimed. Bind each secret to the corresponding repository ID principal set, for example `principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/attribute.repository_id/REPO_ID`; provider conditions supply the additional ref/environment constraints. Verify actual OIDC claim shape for release-tag workflows and GitHub environments; an environment changes the subject format. Preserve existing approved trigger behavior, not a guessed blanket `main` rule. [Google deployment federation guidance](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).

Use Google-maintained `auth@v3` and `get-secretmanager-secrets@v3`; pin their full reviewed commit SHAs in implementation. Example for the **existing Schwab deployment job**, with project/provider resource identifiers in nonsecret GitHub Variables:

```yaml
permissions:
  contents: read
  id-token: write
steps:
  - uses: actions/checkout@v4
    with:
      persist-credentials: false
  - id: google-auth
    uses: google-github-actions/auth@v3
    with:
      project_id: ${{ vars.KAPMAN_SECRETS_PROJECT_ID }}
      workload_identity_provider: ${{ vars.KAPMAN_WIF_PROVIDER }}
      create_credentials_file: true
  - id: deploy-secrets
    uses: google-github-actions/get-secretmanager-secrets@v3
    with:
      export_to_environment: false
      secrets: |-
        FLY_API_TOKEN:projects/${{ vars.KAPMAN_SECRETS_PROJECT_ID }}/secrets/prod-kapman-schwab-mcp--FLY_API_TOKEN/versions/1
  - name: Deploy existing approved release
    env:
      FLY_API_TOKEN: ${{ steps.deploy-secrets.outputs.FLY_API_TOKEN }}
    run: flyctl deploy -a kapman-schwab-mcp --remote-only --update-only
```

This is an excerpt: retain existing Fly setup/build/test/environment gates and replace example version `1` with an approved version. WIF removes the **Google bootstrap credential**; a provider-issued Fly token still exists in GSM because Fly deployment needs it. No `credentials_json`, downloaded service-account key, `OP_SERVICE_ACCOUNT_TOKEN`, or Doppler token is introduced. Build/test/secret-scan jobs get no production access. Tradelog keeps its **operator-only deployment policy**, with no new automatic deployment workflow.

The auth action's generated `gha-creds-*.json` is an ephemeral federated credential configuration, not a static service-account private key, but it is still sensitive. It can be used by later job steps and must be excluded from Git, Docker contexts, caches and artifacts. Checkout must precede auth, and the action removes the file in its post step. Use ephemeral runners, limit subsequent steps, and verify cleanup on failure. Do not claim WIF means no credential material is ever present on disk. [Google auth action](https://github.com/google-github-actions/auth), [secret action](https://github.com/google-github-actions/get-secretmanager-secrets).

For CI, vendor the reviewed helper modules into each consumer repo from a pinned hub revision, recording that revision and checksums; the hub remains the source of truth. Do not fetch mutable scripts during a secret-bearing job or introduce cross-private-repo access tokens solely to download helpers. Updates to the vendored tools are normal reviewed code changes.

For Schwab's existing smoke job, use WIF with access only to its link/bearer resources, install gcloud through the reviewed setup action, and run the same local loader against a **committed numeric-version** `ci.smoke.tpl`:

```dotenv
MCP_URL_TOKEN=gsm://kapman-secrets-example/prod-schwab-link--MCP_URL_TOKEN/1
SCHWAB_MCP_BASE_URL=https://kapman-schwab-mcp.fly.dev
```

Then call the proposed wrapper with `uv run python scripts/mcp_smoke.py`; its env default reads `MCP_SERVER_URL` (see inventory). The wrapper's child output is suppressed, so report only its exit status or an explicitly reviewed health schema. Replace current secret-bearing URL/bearer argv construction. Add `MCP_BEARER_TOKEN` only if confirmed in use; current GitHub lists `PROD_MCP_URL` and `FLY_API_TOKEN`, not `PROD_MCP_BEARER_TOKEN`. `container.yml` retains GitHub's ephemeral `GITHUB_TOKEN`; `agent.yaml` has additional unverified secret references requiring separate review.

Remove old repo secrets only after successful WIF/production smoke validation. Do not allow untrusted fork PRs, untrusted `pull_request_target` checkouts or arbitrary modified scripts to access secrets. Authentication does not make executed source trustworthy. Restrict job refs/environments, use minimal permissions, and never print outputs, debug traces, full errors or signed/authenticated URLs.

### Audit logging and drift detection

Enable **Secret Manager Data Access audit logs**, specifically `DATA_READ`, so `AccessSecretVersion` reads are recorded; do not assume reads are audited merely because Admin Activity exists. Record administrative changes, IAM grants, secret version add/disable/destroy operations and WIF configuration changes. Retain logs in a restricted bucket with an explicit retention policy (proposed 365 days, cost reviewed) and tightly controlled deletion/administration. Choose log-reader access separately from secret-reader access. [Secret Manager audit events](https://docs.cloud.google.com/secret-manager/docs/audit-logging), [enabling Data Access](https://docs.cloud.google.com/logging/docs/audit/configure-data-access).

Example value-free logging filter:

```text
protoPayload.serviceName="secretmanager.googleapis.com"
protoPayload.methodName="google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion"
```

Verify one synthetic read by each human and each CI identity appears with the expected principal/resource before production cutover. Alert on unexpected principals, bulk access, denied reads, IAM/WIF changes, version destruction/disable events outside maintenance, and failed Fly deliveries. Keep alert payloads to actor, resource name/version, time and outcome; never log secret data. Audit logs show vault reads, not what an app does with a value afterward.

Maintain nonsecret delivery receipts and review Fly secret version/status metadata for out-of-band changes. A GSM version change does not automatically update Fly or Claude connectors. Use an approved sync run on each rotation, then Machine/connector verification. Secret Manager rotation schedules send notifications; they do not inherently rotate arbitrary external provider keys. [Rotation behavior](https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations).

### Claude Code hardening

Proposed restrictions are merged into repo and operator/managed settings, with sandbox coverage verified using synthetic canaries. Template references stay readable. This is a starting policy, not a claim that deny rules alone block arbitrary subprocesses:

```json
{
  "permissions": {
    "deny": [
      "Read(/**/.env)",
      "Read(/**/.env.local)",
      "Read(/**/.env.production)",
      "Read(/**/.env.development)",
      "Read(/**/.env.backup*)",
      "Read(/**/token.yaml)",
      "Read(/**/token.yml)",
      "Read(/**/Secrets 260309/**)",
      "Read(/**/gha-creds-*.json)",
      "Read(//data/token.yaml)",
      "Read(//Volumes/OWC Envoy Pro SX/App Development/**/.env)",
      "Read(//Volumes/OWC Envoy Pro SX/App Development/**/Secrets 260309/**)",
      "Read(~/.config/gcloud/**)",
      "Read(~/.fly/**)",
      "Read(~/.config/sops/age/**)",
      "Bash(gcloud secrets versions access *)",
      "Bash(gcloud auth print-access-token*)",
      "Bash(gcloud auth application-default print-access-token*)",
      "Bash(printenv*)",
      "Bash(env)",
      "Bash(docker inspect *)",
      "Bash(docker compose config*)",
      "Bash(fly ssh *)"
    ],
    "ask": ["Bash(bin/with-secrets *)"]
  },
  "sandbox": {"enabled": true, "allowUnsandboxedCommands": false}
}
```

Extend plaintext variants and token/recovery paths to the actual filesystem, including custom `CLOUDSDK_CONFIG` locations and equivalent edit restrictions. Built-in Read deny rules alone do not prevent Python/Bash reads; command patterns are bypassable by alternate invocation forms. Enforce OS sandbox boundaries and test subprocess/symlink access. Keep gcloud/Fly/Docker authority outside the AI execution context. The exact settings supported by the installed Claude Code release must be validated; neither `.gitignore` nor prose instructions constitute sandboxing. [Permission semantics](https://code.claude.com/docs/en/permissions).

Commands requiring production secrets run through the gcloud wrapper in an **operator-owned trusted execution boundary**. AI can prepare code and inspect filtered status, but cannot freely change the executed wrapper/app, read the secret process or credential cache, invoke Fly SSH or inspect Docker. Use a separate OS account/runner or reviewed immutable checkout. Output suppression prevents many transcript accidents but cannot stop network exfiltration by code given the environment. This replaces the initially requested `op run` mechanism following the operator's explicit GSM selection.

Never paste secret files, historical blobs, OAuth callback URLs, QR/recovery codes or credential screenshots into chats. Do not capture terminal history/transcripts wholesale to investigate a leak. A scanner's redaction may cover only its primary match while context contains another credential; publish only allowlisted finding metadata, as this assessment does.

### Schwab runtime token, interactive refresh and connectors

Keep `/data/token.yaml` on the existing volume, governed as **runtime state**. The Schwab client/admin exchange updates it; it is neither committed nor routinely stored/restored as a GSM static secret. Verify owner-only 0600 file permissions, restricted directory/SSH, atomic writes and single-writer behavior during implementation; current token contents/permissions were not read in this assessment. Snapshots containing it are sensitive. Recover expired/revoked state with fresh consent, not blind restoration of old refresh tokens.

The current helper documents weekly interactive refresh and a direct write to production (`scripts/weekly-refresh.sh:7`, admin input at 37, redirect input at 62; full paths in inventory). It prints auth/exchange responses and accepts a callback URL. **Do not call the existing helper transcript-safe.** Weekly cadence is an operating procedure, not an independently verified provider expiry guarantee.

A replacement human-only refresh helper retrieves only `ADMIN_AUTH_TOKEN` via gcloud, opens the authorization URL in the operator browser without printing it, accepts the callback via no-echo input/local callback handler, submits it without argv/files/chat/history, and prints allowlisted success/expiry metadata. It requires an interactive console and purpose-built status output rather than the fully silent general wrapper. The server writes token state directly. No deploy token or Schwab client secret is given to a downstream consumer, and no unattended login bypass is proposed.

`ADMIN_AUTH_TOKEN` is separate from `MCP_URL_TOKEN`. Store the latter once in GSM, derive Tradelog/Research/CI URLs in memory, and update confirmed Claude.ai connector URLs in a human-controlled setup session. A hosted Claude connector cannot resolve a `gsm://` reference itself; OAuth connector tokens remain with Claude/provider and must be re-consented/revoked there. Apple Passwords can hold the human login used for provider consent, not the app API key or runtime token.

Prefer supported header/OAuth authentication over tokenized paths as a future separate application change, but do not infer server support from Tradelog's optional bearer env. Until then, omit full credential-bearing URLs from proxy/app logs, traces and exceptions. The exposed URL-token rotation affects all consumers together. Use a maintenance window or explicitly implement bounded dual-token acceptance first; it is not assumed to exist today.

## Ordered migration and rollback

These are future implementation steps; the current authorization is **design only**. Confirmed exposures may justify an expedited replacement/cutover before the full platform migration. Never delay incident response solely to wait for an ideal architecture.

| Step | Work / acceptance gate | Rollback |
|---|---|---|
| 1. Confirm owners and exposures | Verify provider accounts/revocation, every URL-token consumer, Claude connectors, GitHub environment/org secrets, other Fly apps, backups and both operators' needs. Record identifiers only. Freeze unrelated changes. | Read-only phase; no rollback. Preserve sanitized evidence before cleanup. |
| 2. Establish organization/project | Verify `kapmancapital.com` numeric org ID, project parent, billing and admins; create approved project, APIs/replication, budget alerts, individual IAM and admin recovery. Install gcloud, human login/MFA. | No production change. Remove trial grants/resources; existing services continue. Do not delete authoritative secrets after later cutover. |
| 3. Establish audit and WIF | Enable Data Access logs/retention; configure per-repo/ref/env federation and per-secret grants; test synthetic reads by both humans and CI, deny untrusted subjects. No static Google keys. | Disable provider/revoke exact IAM bindings; no production credential change. Correct restrictive conditions rather than grant blanket access. |
| 4. Populate secret versions | Transfer values directly from the verified authoritative source to GSM through trusted tooling/console, never chat/plaintext export. Preserve distinct provider groups and environment boundaries. Record numeric versions and aliases/consumers. | Production unchanged. Disable mistaken versions; never create a plaintext rollback backup. Known-exposed material is never a valid fallback. |
| 5. Implement/test tools and manifests | Build loader, wrappers, safe diagnostics, per-app sync, plaintext-path check and logging. Synthetic tests cover partial retrieval, wrong project/app, missing/duplicate keys, unsupported chars, stage/apply and no-output failures. Pin tool/action versions. | Revert reviewed code/manifests; keep existing runtime unchanged. Do not broaden sandbox or silence errors. |
| 6. Migrate local development | Pilot low-risk app, then ten env-file repos and other consumers. Replace dotenv auto-export and Compose literals/mappings. Prove dev behavior, then remove plaintext env/backups/Secrets copies. | Use previous valid numeric versions/reference templates or trusted isolated runner. Do not restore plaintext `.env`; preserve DB volumes. |
| 7. Migrate existing CI | Use WIF and scoped secret retrieval in existing Fly/smoke jobs; keep build/test/scans credential-free. Confirm per-identity read logs, safe outputs and ephemeral auth-file cleanup. No new Tradelog deploy job. | Revert job to previous still-valid repo secrets briefly retained, or manual trusted execution with fresh credentials. Never restore leaked/revoked fallback credentials. Remove old repo secrets after success. |
| 8. Migrate Fly distribution | Pilot Fair Value, Finnhub, Polygon v2, Viewer; coordinate Schwab/Tradelog. Establish parity first, stage approved numeric versions, activate deliberately, verify all web/scheduler Machines and auth. Exclude DB internals. | Reapply previous **valid** numeric versions; inspect ambiguous partial rollout before retry. No unset-all or migration-bearing Tradelog deploy. |
| 9. Migrate refresh/connectors | Test human-only no-echo Schwab refresh, volume write/health and connector ownership. Update Tradelog/Research/CI/Claude token consumers as one cutover; re-consent OAuth as necessary. | Restore safe code/config only; obtain fresh token state when revoked/expired. Use coordinated outage instead of compromised credentials. |
| 10. Rotate/revoke | Execute ledger below: mint new provider value, create GSM version, update all manifests, deliver/verify, revoke old, verify rejection, disable old GSM version. | Roll **forward** with a new credential if replacement fails; an exposed or revoked credential is never rollback. DB-role changes use a separate supported DB recovery plan. |
| 11. Enforce and retire | Install hooks/scans in every repo/clone; remove stale copies/secret names after deployed-reader review; check ignored files and Docker contexts. Consider history rewrite separately after revocation. | Correct narrowly reviewed false positives or nonsecret config. Recover from valid GSM versions; no plaintext restore. History rewrite requires a separate collaborator/fork plan. |
| 12. Completion gate | No plaintext repo secret files; all refs resolve; CI/Fly/schedulers/connectors verified; old exposed values rejected; audit attribution/alerts/retention proven; ownership and receipts complete. | Keep status incomplete and last valid deployment until evidence meets the gate. Matching secret counts is insufficient. |

### Rotation ledger

- **Confirmed history:** Schwab `MCP_URL_TOKEN` behind Tradelog/Research URL; Trader historical/current Anthropic key; historical Polygon/Massive keys and S3 pairs in `.env.backup` and source. Reconcile the S3/API reuse and rotate every consumer of the same value, not only the variable name caught by gitleaks.
- **Transcript/chat/screenshot/history exposures:** rotate any displayed Fly token, Schwab client/admin/promotion/link/bearer/OAuth credential, Polygon/Finnhub/provider key, Viewer auth/session key, Tradelog API/basic-auth/DB credential, Cloudflare Access service-token pair, SMTP password, CI App private key or Copilot auth JSON. Include Anthropic/OpenAI/Gemini/FMP/Marketdata/Danelfin/Unicorn/EODHD where exposure occurred. Inventory presence does not itself prove exposure; the operator confirms sources beyond Git. If it cannot be ruled out, conservatively rotate.
- **Human/cloud identity incidents:** revoke compromised gcloud/Workspace sessions and IAM access, investigate WIF trust and runner compromise, then rotate application secrets that identity could retrieve. No routine service-account JSON/bootstrap-token rotation is needed because none is provisioned. Restrict creation/upload of long-lived Google service-account keys through organization policy where feasible.
- **Scope cleanup:** replace broad Fly authority with app-scoped expiring deploy tokens; retire unused Viewer/Tradelog authentication values only after confirming deployed readers. A public audience/client ID alone is not a bearer leak; the provider may reissue an ID as part of a pair rotation.
- **OAuth:** revoke affected Schwab provider sessions, perform a new interactive grant, and reauthorize affected Claude.ai connectors. Deleting token YAML or disabling a GSM version does not revoke provider tokens already issued.
- **DB:** determine whether historical local defaults were ever used on reachable services; rotate affected app roles with coordinated client updates. Database cluster internals use supported cluster procedures, never generic app sync.

For each, record provider/account identifier, consumers, approved new numeric version, delivery/connector receipts, old-value rejection, actor/date and next review. Do not log tokens, signed URLs or raw provider errors. Disable old GSM versions after successful revocation and keep only an appropriately restricted incident record; destroy versions according to the agreed retention/recovery policy. A GSM version disable blocks future retrieval, not use of copies already delivered to Fly.

## Guardrails

### No plaintext repository environments

Policy: no repo working tree carries plaintext `.env`, local/production env, backup env, token YAML, exported secret JSON, or renamed Secrets folder. Ignored plaintext is prohibited too. Commit only value-free examples and reference templates. Keep human-only logins in Apple Passwords; never use its exports as app-secret distribution. Runtime token state outside repos and short-lived WIF job credentials are controlled exceptions, not permission for permanent repo copies.

Local bootstrap/pre-commit must inspect **ignored as well as tracked** file paths and reject plaintext env/backup/token/Secrets files; explicitly allow `.env.tpl`, `.env.example` and nonsecret config. CI cannot see a developer's ignored `.env`, so this needs local enforcement. Add `.gitignore`/`.dockerignore` protections for plaintext variants, token files and `gha-creds-*.json`; ignored files still require the filesystem policy check.

### Pre-commit in all 20 repositories

Install a checksum-verified pinned gitleaks version. Preserve/chain any hook added since this audit. Proposed `.githooks/pre-commit`:

```bash
#!/usr/bin/env bash
set +x
set -euo pipefail
if ! command -v gitleaks >/dev/null 2>&1; then
  printf '%s\n' 'Commit blocked: gitleaks is required.' >&2
  exit 1
fi
# Run the reviewed plaintext-path check here as part of implementation.
# Scanner context can contain another credential beyond its masked match.
if ! gitleaks git --pre-commit --staged --redact=100 --no-banner >/dev/null 2>&1; then
  printf '%s\n' 'Commit blocked: secret scan found an issue or failed.' >&2
  exit 1
fi
```

Install with `git config core.hooksPath .githooks` in every repository and new clone; committing the hook alone does not activate it. Add a synthetic rejection test, including the URL-token custom rule, and remove synthetic data before committing. Do not test with real credentials. Hooks can be bypassed; CI/review must enforce the same policy. [Gitleaks](https://github.com/gitleaks/gitleaks).

### CI secret scan

A separate credential-free workflow runs on pull requests, pushes and manually in every hosted repo, including KB/Journal/research/evidence repositories. Proposed outline:

```yaml
name: Secret scan
on:
  pull_request:
  push:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
      - name: Install pinned scanner
        run: bash scripts/install-gitleaks.sh
      - name: Scan reachable history
        shell: bash
        run: |
          set +x
          set -euo pipefail
          if ! gitleaks git --log-opts="--all --full-history" --redact=100 --no-banner >/dev/null 2>&1; then
            echo 'Secret scan failed; use restricted names-only triage.'
            exit 1
          fi
```

Implementation supplies an installer downloading the official platform release and checking a **reviewed checksum pinned in the script**; no floating download-and-execute script. Pin action commits and scanner version. This CLI workflow needs no Fly/GSM secrets or commercial gitleaks-action integration. Do not publish raw scan artifacts or contextual matched lines.

Full-history CI will initially fail on this audit's findings. After provider revocation, approve narrowly scoped fingerprint exceptions with revocation evidence for historical credentials and triaged placeholders/public IDs, or clean history in a separate authorized operation. Do not baseline an active leak or exclude whole docs/archive trees. Periodically rescan with history exceptions disabled. Add a custom rule for credential-bearing MCP URL paths, since default rules missed Tradelog's confirmed exposure. Scanner errors must fail the gate. Preserve immutable KB archive contents; hooks/CI can scan them without editing them.

### Quarterly checklist

- Review per-person and CI per-secret IAM, inherited grants, WIF repository/ref/env conditions, Workspace account recovery, provider consumers and connector owners. Revoke unused access.
- Rotate applicable long-lived provider/integration/Fly credentials on the recorded schedule; incidents require immediate coordinated replacement, not waiting until quarter end. Verify new access and old-value rejection without emitting values.
- Review active/disabled GSM versions, pinned manifests, receipt/Machine status and out-of-band Fly changes. Avoid indefinite enabled old versions and uncontrolled `latest` references.
- Confirm read/admin audit events, alert delivery, log retention/readers and recovery access. Test both operators' identities and a CI identity with synthetic secrets. Review storage/access/logging bills and budgets.
- Verify no-echo Schwab interactive refresh, expiry checks, token-file permissions and recovery by fresh login. Do not confuse weekly OAuth renewal with static client-secret rotation.
- Inspect ignored local files, backups, Docker contexts, gcloud credential-cache isolation, external drive encryption and device loss/revocation procedures. No raw transcript/history dump into an AI session.
- Rescan all reachable Git refs, review URL-token rules/exceptions and new clones' active hooks; separately verify GitHub platform secret protection.
- Confirm no downloaded Google service-account keys and no unauthorized CI bootstrap credentials. Inspect ephemeral WIF file cleanup/exclusions and trusted-runner/source boundaries.

## Open operator details

The solution choice is settled: **GSM under `kapmancapital.com`, IAM per person, WIF for GitHub, gcloud local injection, per-app Fly sync and audit logging; Apple Passwords for human-only logins.** Remaining details are implementation inputs, not a request to choose a vault again:

1. Verified numeric organization ID, project ID/number, billing owner/account, API permissions, replication/data residency, budget and log-retention policy. These Cloud resources have not been inspected or created.
2. Exact Workspace identities for the operator and Ron, each person's secret-reader/rotation/admin needs, recovery administrators and whether controlled groups should manage grants.
3. Verified numeric GitHub repo/owner IDs, actual release refs/environment subjects, WIF boundaries and existing environment/org secrets. `schwab-mcp-jkoelker` repo-secret metadata was unavailable; Schwab's agent workflow status is unresolved.
4. Actual Claude.ai connectors, owners, OAuth versus token-bearing URLs and storage; Schwab/Polygon are suspected by the operator, not confirmed. Identify all Research/Tradelog/CI consumers before URL-token cutover.
5. Provider/account identity for the two Polygon groups and observed API/S3 reuse; ability to issue independent dev/prod/per-app keys; current validity/revocation of all historical and transcript exposures.
6. Deployed use of stale Basic Auth/Viewer password/session values, whether Tradelog requires a production Polygon API key, and active promotion/bearer paths. A local source scan is not a deployed-release audit.
7. Location of any `Secrets 260309` copies, other laptops/backups/cloud sessions, Google credential caches, and deployments beyond the seven named apps.
8. Touch ID/device lock/FileVault and external-volume encryption, trusted production execution account/runner, and acceptable coordinated downtime or approved dual-token implementation.
9. Database app-role/cluster recovery owner and whether historical local DB defaults were ever used on reachable infrastructure.

## Validation and delivery scope

This is a design document, not an implementation. No secret, `.env`, token file, Fly secret, CI configuration, connector, Google Cloud project/IAM resource or Apple Passwords group was changed. Temporary scanner output was reduced to names/paths/commits; no values or partial values are published. Existing unrelated Tradelog documentation edits are preserved. Code blocks are proposed files and require implementation-level review and synthetic integration tests before production use.

Validation completed: linked local paths/line anchors resolve; Python/JSON snippets parse and Bash snippets pass syntax checks; nine mocked Google loader/local-runner/Fly-sync cases pass, including no-Fly-on-partial-fetch and no-value-output checks. Tradelog typecheck, lint, tests and production build exited 0. Current local credential equality checks found no values in this document. No proposed infrastructure or secret command ran against production.
