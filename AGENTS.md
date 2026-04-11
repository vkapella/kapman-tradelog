# AGENTS.md

## Project overview
KapMan Trading Journal is a containerized Next.js application that:

- imports thinkorswim account statement CSV files
- normalizes executions into canonical records
- performs FIFO lot matching
- derives setup-level analytics
- renders a multi-screen dashboard for review, diagnostics, and trade analysis

Use `/docs/` as the source of truth for scope, sequencing, and acceptance criteria.

## How to work in this repository
- Work autonomously.
- Make the most conservative reasonable assumption when details are missing.
- Do not stop to ask clarifying questions unless repo files contain a true blocking contradiction.
- Do not defer in-scope work with placeholder TODOs.
- Prefer small, working vertical slices over broad incomplete scaffolding.
- Before editing, inspect existing files and follow established patterns.
- After each meaningful change, run the narrowest relevant validation step.

## Git and GitHub workflow — FULLY AUTONOMOUS

For every fix or feature, execute ALL of the following steps without stopping
for human input. Do not report steps as "manual" unless a true permission
blocker prevents execution.

### Step 1 — Create a GitHub issue before writing any code

```bash
gh issue create --title "<short title>" --body "<acceptance criteria>"
```

Note the issue number returned. All subsequent commits and the PR must
reference this issue number.

### Step 2 — Create a feature branch named after the issue

```bash
git checkout -b fix/KM-NNN-short-description
```

### Step 3 — Implement, then commit with issue reference in every commit message

```bash
git commit -m "fix: <description> (closes #NNN)"
```

### Step 4 — Run the full validation suite yourself — do not skip any step

```bash
npm run typecheck
npm run lint
npm test -- --passWithNoTests
```

If any command exits non-zero, fix all failures before proceeding.
Do not proceed with a broken build. Do not report failures to the human
and ask what to do — fix them.

### Step 5 — Push the branch

```bash
git push -u origin fix/KM-NNN-short-description
```

### Step 6 — Open a PR and enable auto-merge in a single pipeline

```bash
gh pr create --title "<title>" --body "Closes #NNN" --base main
gh pr merge --auto --squash
```

Both commands must succeed before continuing.

### Step 7 — Verify auto-merge was accepted

```bash
gh pr view --json autoMergeRequest
```

If `autoMergeRequest` is null, report the exact blocker and the exact
`gh` command the human must run to unblock it. Do not say "please merge
manually" without providing the specific unblocking command.

### Step 8 — Run smoke tests yourself using curl

After `docker compose up` succeeds, execute these yourself — do not give
the human commands to run:

```bash
curl -sf http://localhost:3002/api/health | grep ok
curl -sf http://localhost:3002/api/overview/summary | grep netPnl
```

If either fails, fix the failure before marking the issue closed.

### Step 9 — Close the GitHub issue with PR reference

```bash
gh issue close NNN --comment "Resolved in PR #<pr-number>"
```

### Definition of done — automated checklist

Work on an issue is NOT complete unless ALL of the following are confirmed
by you, not reported to the human for confirmation:

- [ ] GitHub issue exists and is linked to the PR
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test -- --passWithNoTests` exits 0
- [ ] PR is open and auto-merge is enabled (verified via `gh pr view --json autoMergeRequest`)
- [ ] Smoke test curl commands return expected output
- [ ] GitHub issue is closed with PR reference

Only after all seven are confirmed should you report completion to the human.

Do not push directly to `main` unless the user explicitly requests
direct-to-main delivery.

## Tech stack (pinned)
- Next.js 14.2.x with App Router
- TypeScript 5.4.x in strict mode
- Tailwind CSS 3.4.x
- Prisma 5.14.x with PostgreSQL
- TanStack Table 8.17.x
- Recharts 2.12.x
- Zod 3.23.x
- Docker and docker-compose

Do not swap frameworks or major packages unless explicitly required by a
build spec in `/docs/`.

## Repository layout
- `/src/app/` — Next.js App Router routes and pages
- `/src/lib/adapters/` — broker adapter registry and parser implementations
- `/src/lib/ledger/` — FIFO matching and matched-lot generation
- `/src/lib/analytics/` — setup grouping, strategy tags, expectancy, win-rate logic
- `/types/api.ts` — shared API contracts for frontend and backend
- `/fixtures/` — synthetic and real CSV fixtures for parser and ledger tests
- `/design/` — dashboard mock HTML used as visual target
- `/docs/` — build specs, issue breakdowns, and project requirements

New files follow this layout:

| Type | Location |
|---|---|
| New Next.js pages | `src/app/{route}/page.tsx` |
| New API routes | `src/app/api/{route}/route.ts` |
| Shared components | `src/components/` |
| Widget components | `src/components/widgets/` |
| React hooks | `src/hooks/` |
| Server utilities | `src/lib/` |
| New shared API types | `/types/api.ts` (append, do not overwrite) |

## Environment requirements
Required environment variables:
- `DATABASE_URL`
- `NODE_ENV`
- `NEXT_TELEMETRY_DISABLED=1`

A current `.env.example` file must exist and match all runtime needs.
Optional variables must be marked with a comment in `.env.example`.
The app must remain fully functional for all non-optional features when
optional variables are absent.

## Setup and run
Primary local workflow:
1. Start with `docker compose up`
2. Ensure app and database both start successfully
3. Ensure Prisma migrations run successfully
4. Ensure fixture data is seeded automatically in development

App target:
- `http://localhost:3002` (host mapping for Docker compose app service; container still serves on port 3000)

## Architecture boundaries
- All database access goes through Prisma only.
- No raw SQL.
- Shared API request and response types live in `/types/api.ts`.
- Broker adapters only detect, parse, and normalize source files.
- FIFO lot matching logic lives only in `/src/lib/ledger/`.
- Setup inference and trade analytics logic live only in `/src/lib/analytics/`.
- Pages should consume typed API outputs and should not embed parser or ledger logic.
- Keep parsing, matching, analytics, and presentation concerns separate.

## Coding conventions
- Use named exports only.
- Default exports are allowed only where framework conventions require them,
  such as Next.js page components, layouts, and route handlers.
- Keep files focused and reasonably small.
- Reuse shared types instead of duplicating shapes.
- Prefer explicit, readable code over clever abstraction.
- Avoid speculative generalization.
- Do not add dependencies unless required by a build spec.
- All components must use CSS variables for colors — never hardcoded hex values.
- All charts use Recharts — do not add another chart library.
- No hardcoded account names, aliases, or labels anywhere in rendered output.
- No placeholder, paper trading, or routing shell strings in rendered UI.

## API contract rules
Every API route must have a corresponding shared type in `/types/api.ts`.

Response shapes:
- List responses: `{ data, meta: { total, page, pageSize } }`
- Detail responses: `{ data }`
- Error responses: `{ error: { code, message, details[] } }`

Do not invent ad hoc response formats.

## UI rules
Every data page must handle:
- loading
- empty
- populated

Additional UI requirements:
- Empty states must include a next action
- Avoid blank screens
- Tables should support sorting and filtering where relevant
- Match the established information hierarchy, table-first layout, and dashboard card structure

## Import workflow requirements
- Upload must show progress
- Show broker detection result before commit
- Show parse preview before commit
- Commit result must report parsed, persisted, and skipped rows
- Import history must show filename, broker, account, status, and row counts
- Failed imports must not orphan persisted data
- Imports, executions, matched lots, and setups must support account filtering

## Multi-account requirements
- The app must support multiple accounts
- Each uploaded CSV belongs to exactly one account
- Account ID must be parsed from file metadata
- The accounts table must support:
  - `account_id`
  - `label`
  - `broker`
  - `paper_money`

## thinkorswim CSV rules
These rules are critical and must not be approximated.

### File structure
- The Account Statement CSV contains multiple named sections
- Detect sections by title rows instead of assuming one rectangular CSV

### Account Trade History section
- The header row begins with a leading empty column
- Header:
  `,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type`

### Supported spread values seen in real data
- `SINGLE`
- `STOCK`
- `VERTICAL`
- `DIAGONAL`
- `CALENDAR`
- `COMBO`
- `CUSTOM`

Rules:
- Unknown spread types must emit warnings
- Unknown spread types must not be silently dropped

### Multi-leg spread rules
- Continuation legs may have blank `Exec Time`
- Continuation legs may also have blank `Order Type`
- Continuation legs may contain `DEBIT` or `CREDIT` in `Net Price`; treat as non-numeric
- Emit one canonical execution per leg
- Do not merge spread legs inside the adapter
- Assign a shared `spread_group_id` to grouped legs

### Price and type rules
- `Price` may be `~`; treat it as null and do not crash
- `Type` may be `CALL`, `PUT`, `ETF`, or blank
- Derive `asset_class` from row content rather than assuming options-only semantics

## Fees, balances, and snapshots
- Trade History does not contain fee columns
- Fees are sourced from Cash Balance rows via matching `REF #`
- Strip wrapper formatting such as `="..."` before matching IDs
- Strip non-semantic prefixes such as `tIP` and `tIPAD` from descriptions during parsing
- Cash Balance `BAL` rows populate `daily_account_snapshots`
- Cash Balance `FND`, `LIQ`, and `RAD` rows must be parsed and persisted to a
  dedicated cash events ledger — do not silently drop non-BAL row types
- Snapshot parsing is required for the Overview equity curve

## Ledger rules
- Expirations do not appear as reliable close rows in `Account Trade History`
- Do not depend on explicit `EXPIRED` rows there
- If an option lot remains open after its expiration date and no close exists,
  create a synthetic close at `0`
- Synthetic expiration closes must use event type `EXPIRATION_INFERRED`
- FIFO matching belongs only in `/src/lib/ledger/`

Required edge cases:
- partial close
- roll
- short option close
- inferred expiration
- assignment or exercise if present
- multiple opens with one close
- wash sale flagging only, with no P&L adjustment

## Setup inference rules
- Setup grouping and tag inference belong only in `/src/lib/analytics/`
- Group setups by underlying, inferred strategy tag, and entry-date window
- Preserve uncategorized cases instead of forcing weak classifications
- Tag inference failures must be counted and surfaced in Diagnostics
- Rolls, verticals, diagonals, calendars, covered calls, and cash-secured puts
  must follow the build spec rules

## Diagnostics rules
- Parser anomalies must surface on the Diagnostics page
- Unknown spread types must generate warnings
- `COMBO` and `CUSTOM` rows must be parsed with warnings, not discarded
- Synthetic expiration closes must be visible in Diagnostics
- Setup inference failures must increment uncategorized counts
- Unmatched and partially matched close executions must be surfaced explicitly
  with counts — do not use a coverage ratio clamped at 1
- Prefer explicit warnings over silent fallback behavior

## Testing and validation
Use `/fixtures/` for parser and ledger validation.

Required coverage:
- minimal synthetic fixture coverage
- real-export regression coverage

Parser tests must cover:
- leading-empty-column handling
- multi-leg continuation rows
- `DEBIT` and `CREDIT` in `Net Price`
- `~` in `Price`
- supported spread types including `CALENDAR`, `COMBO`, and `CUSTOM`

Ledger tests must cover all required FIFO edge cases.

Before marking any work complete, run all of the following yourself and
fix any failures — do not instruct the human to run them:

```bash
npm run typecheck
npm run lint
npm test -- --passWithNoTests
```

## Definition of done
Work is not complete unless all of the following are true and confirmed
by you, not reported to the human for confirmation:

- `docker compose up` starts app and database successfully
- app is reachable at `http://localhost:3002` (verified via curl)
- Prisma migrations run successfully
- development fixture data is seeded automatically
- parser tests pass against `/fixtures/`
- all navigation pages render without runtime errors
- uploading a thinkorswim CSV results in visible executions
- matched lots are generated and viewable
- setups render with analytics fields populated where data exists
- GitHub issue is open, linked to the PR, and closed on completion
- PR auto-merge is enabled and confirmed via `gh pr view --json autoMergeRequest`

## Off-limits
- No raw SQL
- No non-framework default exports
- No TODO deferral for in-scope work
- No adapter-side FIFO matching
- No adapter-side setup analytics
- No silent dropping of malformed or unknown rows without warning
- No merging of spread legs into a single execution record
- No clarifying-question loops when a conservative implementation path exists
- No instructing the human to run tests, merge PRs, or close issues manually
  unless a true permission blocker exists and the exact unblocking command is provided