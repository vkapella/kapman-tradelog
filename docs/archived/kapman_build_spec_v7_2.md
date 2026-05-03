# KapMan Build Spec v7.2

Status: Post-v7 bugfix + correctness patch set  
Base: `docs/kapman_build_spec_v7.md`

## Purpose
v7.2 standardizes dollar semantics for realized P&L across T1/T2/T3, fixes pagination-sensitive T3 summaries, and clarifies metric units/formatting without changing parser behavior, schema, or open-position/NLV formulas.

## Included Manual Override Features
v7.2 preserves and documents manual overrides introduced in v7:
- Manual adjustments route and UI (`/adjustments`)
- Supported adjustment types:
  - `SPLIT`
  - `QTY_OVERRIDE`
  - `PRICE_OVERRIDE`
  - `ADD_POSITION`
  - `REMOVE_POSITION`
- Preview-before-commit behavior for adjustments
- Reversal workflow for active adjustments
- Position reconstruction integration through adjustment application layer

No new adjustment types are added in v7.2.

## v7.2 Fix Scope

### 1) FIFO realized P&L normalization (options multiplier)
- Fix location: FIFO matcher write-path feeding `MatchedLot.realizedPnl`
- Canonical formulas:
  - Equity: `(exitPrice - entryPrice) * quantity`
  - Option: `(exitPrice - entryPrice) * quantity * 100`
- Applies to standard closes, assignment/exercise closes, and synthetic expiration closes.

### 2) Persisted data rebuild support
- New command: `npm run rebuild:pnl`
- Behavior:
  - Rebuild matched lots from existing executions with corrected FIFO P&L
  - Rebuild setup groups from corrected matched lots
  - Print per-account before/after summary for matched-lot and setup P&L totals
- Idempotent by design (safe to rerun).

### 3) Win-rate canonicalization
- Canonical definition: `WIN / (WIN + LOSS)`; FLAT excluded.
- When denominator is zero (all flat), win rate is null/`N/A`.
- Setup-group persistence now follows this rule during rebuilds.

### 4) T3 summary card correctness
- T3 summary cards now compute from the full filtered setup set (`pageSize=1000` fetch), not only the visible table page.
- Summary values remain stable between paginated and show-all modes.

### 5) Labeling + formatting normalization
- T1 executions table header: `Unit Price`
- T2/T3 realized P&L headers: `Realized P&L ($)`
- Win-rate labels: `Win Rate (%)`
- Expectancy labels: `Expectancy ($ / lot)`
- Currency formatting applied to realized P&L displays across T2/T3 panels.
- TTS Evidence `Gross Proceeds Proxy` now renders as compact currency with explanatory tooltip.

## Explicit Non-Goals
- No parser/adapter changes
- No schema/migration changes
- No changes to setup grouping/tag inference rules
- No changes to open-position or NLV valuation formulas
- No change to gross proceeds proxy formula (`sum(abs(quantity) * price)`)

## Validation Requirements
- `npm run test`
- `npm run typecheck`
- `npm run lint`

## Rollout Notes
1. Deploy code changes.
2. Run `npm run rebuild:pnl` against the target environment database.
3. Confirm per-account before/after output reflects option-P&L normalization impact.
4. Verify dashboard/trade-records/analytics/tts-evidence surfaces for updated units and formatting.
