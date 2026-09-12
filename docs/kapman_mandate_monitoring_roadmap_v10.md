# Kapman Tradelog — Mandate Monitoring and Performance Roadmap (v10)

**Status:** PROPOSAL for CTO/CEO review — 2026-09-11
**Inputs:** Investment Playbook v5 DRAFT r5 (2026-09-10); CEO request of 2026-09-10 (trade-return distribution, market/sector breadth, fear gauge, "what do the widgets tell you"); Codex assessment of OVTLYR breadth versus KapMan Tide.
**Baseline:** as-built Tradelog at `2445c05` (see `docs/architecture.md`, `docs/data_model.md`, `docs/metrics_calcs.md`).
**Convention:** stories follow `docs/kapman_github_issues_v9.md` (type, priority, effort, deliverables, acceptance criteria, dependencies). Sprint tags are `[v10-M0]` … `[v10-M6]`; story IDs are `KM-201` onward (v9 stopped at KM-137).

---

## 0. Summary

The playbook makes Tradelog "the corporate record for executions, campaign linkage, P&L, portfolio risk and compliance history" (§8). Today Tradelog is a strong execution, ledger, valuation and reconciliation record, but it has **no notion of a campaign, a mandate limit, a Trading Base, a drawdown tier, delta exposure, or broker margin**. Every compliance number in §4 and §7 therefore has to be built, and most of them need two new fact sources (option deltas persisted with marks; broker balances for maintenance requirement).

The roadmap has seven phases. The first two deliver visible value in weeks with data that already exists; the middle phases build the governance spine (campaigns, limits, exposure, margin, drawdown); the last two connect market context and produce the CEO's weekly/monthly reporting.

| Phase | Tag | Theme | What becomes visible |
|---|---|---|---|
| M0 | `[v10-M0]` | Foundations | Mandate versions and limits as data; Trading Base (B) from NAV and the reserve schedule; per-trade return basis persisted; entity-scoped compliance guard |
| M1 | `[v10-M1]` | CEO distribution widget + configurable Analytics | The 30/40/30 trade-return histogram with adjustable cutoffs, percentile bands, controlled-loss check; Analytics page gains a widget registry and profile-saved layout |
| MB | `[v10-MB]` | Broker API sync (corporate account) | Nightly and on-demand pull of balances, positions and transactions from the Schwab API through the MCP; the corporate account no longer needs statement CSV imports for new activity; daily NAV/cash snapshots and margin facts land automatically |
| M2 | `[v10-M2]` | Campaigns and Trade Records | `Campaign` model, lifecycle events, frozen loss budgets, execution linkage (auto-suggest from KB recommendations + manual), `/campaigns` page, unlinked-execution coverage check |
| M3 | `[v10-M3]` | Exposure engine | Delta-equivalent (gross bullish, hedge, net), stock and assignment concentration, premium at risk, hedge limits; Compliance Board and Exposure widgets |
| M4 | `[v10-M4]` | Margin, drawdown and breach history | Broker balances (maintenance ≤ 30% NAV, buying power), flow-adjusted high-water-mark drawdown with 8/12/15 tiers, daily-loss control, risk-state machine, breach/exception log, nightly compliance snapshots |
| M5 | `[v10-M5]` | Market context | Market Tide, Sector Tide and Positioning Pressure ingested from the viewer/marketdata pipeline; tiles on the dashboard; values stamped on campaigns for forward validation |
| M6 | `[v10-M6]` | Reporting for the CEO/CFO | Weekly report page/export (NAV, P&L, drawdown state, exposures, concentrations, breaches), monthly performance by strategy and campaign, QQQ/SPY benchmark comparison, hedge effectiveness, dashboard presets (CTO daily / CEO weekly / performance review) |

The KB and Journal today have no campaign, Trading Base or planned-loss concept; their ticket grammar is the nearest thing to a trade record, and their sizing denominator ("entity real capital") is not B. Three things must therefore be true outside Tradelog for the full picture: the Schwab MCP must expose account balances (it has the tools, hidden behind `MCP_ENABLE_ACCOUNT_TOOLS`, and the Schwab app scope must allow them); the viewer/marketdata pipeline must compute Market and Sector Tide on a fixed universe; and the KB/Journal must hand Tradelog a campaign intent record (Appendix B) so a trade record exists "before the opening order is placed". Section 10 states those contracts.

---

## 1. What the mandate asks Tradelog to do

Every clause below is a monitoring or record-keeping requirement that Tradelog can satisfy with data it has or can obtain. "Have" means the fact exists in the database today; "Need" means a new fact source or model.

| Playbook clause | Requirement | Have | Need | Story |
|---|---|---|---|---|
| §2 Trading Base | B = NAV − designated operating/tax/other reserves; CEO/CFO maintains the schedule | NAV per account (broker NLV or reconstructed, `PositionSnapshotAccount`) | Reserve schedule per legal entity; B computed and shown everywhere a % of B appears | KM-201, KM-202 |
| §3 Authorized trading | Detect prohibited instruments/structures: naked short calls, short stock, futures, OTC, crypto, 0/1 DTE, undefined-risk | Executions with asset class, option type, side, expiration; spread groups; setup inference (covered call vs short call) | Instrument reference (ETF, inverse, leverage); rule set; classification of short calls as covered/defined-risk/naked | KM-222, KM-224, KM-247 |
| §4 Planned campaign loss (1% / 2% of B) | Budget frozen at open, by campaign class | — | Campaign model with class, B at open, frozen budget | KM-211 |
| §4 Aggregate planned loss ≤ 6% of B | Sum of open directional campaign budgets | — | Campaign model; compliance metric | KM-211, KM-215, KM-231 |
| §4 Purchased/defined-risk options ≤ 20% of B | Remaining premium (long options) or max defined loss (spreads) | Open positions with marks; spread groups (thinkorswim); Fidelity spreads need #377 | Structure-level max-loss computation | KM-224, KM-231 |
| §4 Stock exposure ≤ 40% / 10% per issuer | Long stock market value | Open equity positions with marks | Exclude cash equivalents and inverse ETFs (instrument reference) | KM-223 |
| §4 Short-put assignment ≤ 45% / 20% per issuer incl. shares held | Strike × 100 × qty for open short puts, plus shares held | Open short puts; open equity | Metric | KM-223 |
| §4 Directional exposure (gross bullish ≤ 150% B; net 0–100% B) | Delta-equivalent from shares and option delta; hedges reported separately | Option quotes carry `delta`, but only `mark` is persisted in `PositionSnapshot` | Persist delta/underlying price with each snapshot; hedge recognition | KM-221, KM-222, KM-231, KM-233 |
| §4 Broker margin ≤ 30% NAV per account and aggregate | Maintenance requirement from the broker | thinkorswim statement Account Summary has NLV and Stock/Option Buying Power only; parser keeps NLV and Total Cash | Broker balance snapshots (Schwab API via MCP account tools; statement fields; manual fallback) | KM-241, KM-242 |
| §4 Hedge exposure (option risk ≤ 3% B; inverse ETF ≤ 15% B) | Hedge classification and valuation | — | Campaign class HEDGE; instrument reference for inverse ETFs | KM-222, KM-224 |
| §5 Trade record before entry | Thesis, trigger, structure, horizon, budget, invalidation, target, catalyst risk | `TradeRecommendation` mirror carries ticker, structure, entry range, sizing band, chain quality — not a trade record | Campaign intent record; KB hand-off; manual entry | KM-211, KM-212, KM-213 |
| §5 Rolls realize the old trade; replacement fits the remaining budget | Campaign-level budget consumption across rolls | FIFO lots; setup inference "roll" tag | Campaign events (ROLL) linking closes and opens | KM-214 |
| §5 Exhausted budget → joint approval to restart | Exception record | — | `ComplianceEvent` with approval reference | KM-211, KM-245 |
| §6 Margin pre-checks (buying power, maintenance, assignment exposure, collateral, settlement liquidity, stress test) | Pre-trade check output PASS/WARN/BLOCK | — | Compliance status endpoint consumed by KB Pass 2; stress estimate | KM-242, KM-243, KM-248 |
| §7 Daily loss ≥ 2% | Same-day P&L against prior NAV, flow-adjusted | Daily snapshots; position snapshots; external-flow classification | Daily-loss metric and RESTRICTED state | KM-244 |
| §7 Drawdown 8% / 12% / 15% from flow-adjusted HWM | Unitized NAV series, HWM, tiers | `maxDrawdown` on raw snapshot series (not flow-adjusted); return-on-capital knows external flows | Flow-adjusted NAV index; tier ladder; risk-state machine | KM-244 |
| §7 Reserve shortfall / margin call / breach → no additional risk until cured; notify; document | Breach log with cure and notification | — | `ComplianceEvent`; breach widget; alert hook (reuse pipeline alert webhook) | KM-245 |
| §8 Daily record | Open positions checked against invalidation/target/time rules and active restrictions | Positions with DTE | Campaign invalidation/target/review DTE; "Review Due" widget | KM-216 |
| §8 Weekly record to CEO/CFO | NAV, P&L, drawdown state, exposures, concentrations, breaches, exceptions | Most inputs after M3/M4 | Weekly report page/export | KM-261 |
| §8 Monthly/quarterly | Performance by strategy and campaign, losses, exceptions, hedge effectiveness, vs QQQ and SPY | Setup analytics by inferred tag; no benchmarks | Campaign outcomes; benchmark bars; hedge effectiveness | KM-262, KM-263, KM-264, KM-265 |
| §8 System ownership | TradeLog = executions, campaign linkage, P&L, portfolio risk, compliance history; broker = live facts | Executions, P&L, reconciliation | Campaign linkage; compliance history; broker facts marked authoritative with as-of | all |
| App. A operating standards (DTE windows, review points) | Flags when a position drifts outside its standard | DTE on positions | Standards table per strategy in the mandate version; review triggers | KM-201, KM-216, KM-264 |
| App. B minimum trade record | Field list | partial (`TradeRecommendation`) | `Campaign` fields + entry-time context JSON | KM-211, KM-213 |

---

## 2. The CEO's requests, translated

### 2.1 The trade-return "bell curve" (Analytics dashboard)

What was asked: a distribution of trades by profitability with three bands — losers (≤ −10%), neither (−10% to +10%), big winners (> +10%) — against an expected mix of 30% / 40% / 30%; the cutoffs adjustable from the widget; x-axis is return % with break-even at the centre, y-axis is the number of trades; plot the existing data now; also show how profitable the top trades are ("top 95%") and whether losers were controlled ("we're not going to lose more than 30% of the investment").

What that needs from the data:

- **A per-trade return percentage.** Matched lots persist realized P&L but not cost basis or return %. The excursions API derives `realizedReturnPct` on the fly from the reconstructed entry price. M0 persists `investmentBasis` and `realizedReturnPct` on every matched lot and on every setup group at ledger rebuild, with an explicit basis rule per structure (§9.1), so the histogram, the percentile table and the controlled-loss check all read one number.
- **A definition of "a trade".** A matched lot is a leg, not a trade: a vertical's long leg reads as a loss while its short leg reads as a gain. The widget therefore offers a unit selector — **setup** (inferred structure, default today), **lot**, and **campaign** (once M2 lands, the governance unit the CEO actually means).
- **Adjustable thresholds that persist.** Cutoffs (−10% / +10%), target mix (30/40/30), controlled-loss line (−30% of investment, or the campaign budget = −1R when a campaign exists) live in the per-user profile (#344 leaves), with the widget's defaults as fallback.

The widget is story KM-205 (Phase M1). It renders on the Analytics page and is also available in the dashboard widget picker.

### 2.2 Market and sector breadth, and a "fear gauge"

Adopt Codex's structure (Market Tide, Sector Tide, stock state, alignment shown as components, forward validation, a transparent "Positioning Pressure" measure) with one placement decision: **Tradelog consumes, it does not compute.** Tradelog holds only marks for instruments it has held; it has no universe of bars, no Wyckoff engine, and no sector metadata. The viewer/marketdata pipeline computes daily values on a fixed S&P 500 universe and publishes them; Tradelog ingests one row per day into `MarketContextSnapshot`, renders the tiles, stamps the values onto campaigns at open and close, and exposes them for the forward log. That keeps the S006 conclusion intact: breadth is context and evidence, never a gate, until a study says otherwise.

What the survey found in the viewer (2026-09-11): `breadth_daily()` computes the three measures at read time from the forward panel's watchlist rows, bands them at 35% / 65% (weak / mixed / strong), persists nothing, and pools one row per watchlist per symbol per day, so a symbol on two watchlists does count twice in the header. S006 already built a point-in-time S&P 500 constituent resolver and a 672-session breadth series that a nightly Market Tide job can reuse. The viewer serves machine callers through a bearer-token, GET-only allowlist behind Cloudflare Access, which is the path Tradelog will use to ingest.

The fear/greed request becomes the **Positioning Pressure** gauge (Codex's name), built from named components (IV percentile, skew, put/call, DGPI, price extension, volume surprise) and displayed with its components visible. It is labelled as unvalidated until a forward study exists.

### 2.3 "What are the widgets displaying that help you?"

The dashboard today answers "what happened" (P&L, win rate, hold time, reconciliation). The mandate needs it to answer three more questions at a glance — **Am I allowed to add risk right now? How much room is left under each limit? What needs a decision today?** — and the CEO's weekly view needs the §8 report contents without a spreadsheet. Section 7 proposes the two default layouts, and section 6 gives each widget a one-line "what it tells you", which is also its help-tooltip interpretation text.

---

## 3. Codex assessment: what we adopt and what we set aside

| Codex point | Decision |
|---|---|
| Tide is watchlist participation, not market breadth; the pooled header can double-count | Agree. Confirmed in code: the pooled query groups by date without a distinct-symbol step. Tradelog never labels Tide as breadth; the fix is a viewer story (V1, §10.2). |
| S006 does not support a breadth gate, "trade only on green", sizing change or Tide-agreement filter | Agree. Market context is displayed and stamped, never enforced. The compliance engine (M3/M4) contains no market-context rule. |
| Build Market Tide on a fixed point-in-time S&P 500 universe with 1/5/10-session deltas | Adopt; computed in the viewer/marketdata pipeline (V2, seeded by S006's constituent resolver), ingested by Tradelog (KM-251). |
| Sector Tide using the SIC-to-sector map | Adopt; same pipeline. Tradelog also needs the sector per held underlying for concentration and alignment display (KM-252 symbol reference). |
| Alignment display showing components rather than collapsing to 40/30/30 weights | Adopt (KM-253). |
| Stamp Market/Sector Tide on every onset and recommendation for forward validation | Adopt at the campaign level in Tradelog (KM-254) and leave recommendation stamping to the KB. |
| Positioning Pressure / Stretch instead of fear/greed until validated | Adopt the name and the component-visible display (KM-255). |
| Massive scans the universe; option analytics only on the shortlist; Schwab is Pass 2 | Agree; nothing in Tradelog fetches chains for a universe. |
| Licensing caution on Massive redistribution and derived works | Tradelog stores derived aggregates (percentages, composites), not bars, and serves them only inside the authenticated app. No licensing text exists in any KapMan repo, so the caution is neither confirmed nor cleared; confirm the subscription terms before M5 ships (open question §12). |
| OVTLYR subscription versus building | Out of scope for this roadmap; the tiles are cheap once the pipeline exists. |

---

## 4. Where Tradelog stands today (relevant as-built)

**Have, and reused as-is**

- Executions, FIFO matched lots, setup inference (stock, long call/put, covered call, cash-secured put, verticals, diagonal, calendar, roll, short call), diagnostics and case files.
- Valuation: daily broker snapshots, the value engine (`AccountValueSnapshot`), position snapshots with per-account typed results (`PositionSnapshotAccount`: cash, equity MV, option MV, broker NLV, reconstructed NLV, mark provenance), MFE/MAE per lot and per open leg, the nightly `market-data-daily` Fly Machine with run history and alert states.
- Return on capital with external-flow classification (`src/lib/ledger/cash-row-classification.ts`), period return, max drawdown (raw series).
- Legal entities on accounts, aggregate-scope flags (`mixedEntity`, `mixedEnvironment`, `unscopedRequest`), and the fail-closed KB export.
- KB mirror (`TradeRecommendation` with run scope, sizing band, entry range, chain quality), plan-vs-actual fill matching, HITL queue (`QueueItem`, declarations, outcomes), the Today screen.
- Configurable dashboard (KPI registry, widget registry, colSpan 1–3, per-user profile persistence), help tooltips with formula/source/interpretation on every widget and KPI, the vendored kapman-design theme, symbol links.
- Option quotes already return `delta`, `theta`, `iv`, `dte` (`src/lib/mcp/market-data.ts`), but the snapshot persists only the mark.

**Gaps this roadmap fills**

| Gap | Consequence today |
|---|---|
| No `Campaign` / trade record | Cannot compute planned loss, aggregate planned loss, budget consumption, roll continuity, exit reasons, or per-campaign performance |
| No mandate/limit configuration | Nothing to compare exposures against; thresholds would be hard-coded |
| No Trading Base or reserve schedule | Every "% of B" is undefined |
| Delta not persisted | No delta-equivalent exposure, no net directional |
| No broker balances beyond NLV | No maintenance requirement, no buying power, no margin limit |
| No instrument reference (sector, ETF, inverse, leverage) | Cannot separate inverse ETFs, leveraged ETFs, cash equivalents from stock exposure; no sector rollups |
| Drawdown is on raw NLV | Contributions and distributions distort the high-water mark |
| No compliance history | Weekly reporting has nothing to cite; breaches are not recorded |
| Analytics page layout is fixed | New analytics widgets must be hard-mounted |
| No benchmark bars | No QQQ/SPY comparison |
| No per-trade return % persisted | The histogram would depend on the excursion path |

---

## 5. Design principles for the build

1. **The mandate is data, versioned.** Limits, tiers, campaign classes and Appendix A standards are rows in `MandateVersion`, keyed by legal entity with effective dates and a status (DRAFT / APPROVED / SUPERSEDED). Compliance snapshots record which version they were evaluated against. A DRAFT version can be monitored in "shadow" mode while shareholders review it, and the widgets say so.
2. **The campaign is the governance unit.** Executions, lots and setups stay as they are; a `Campaign` links to executions, freezes its budget and B at open, and carries the Appendix B record. Analytics can roll up to it; compliance is evaluated on it.
3. **Compliance is computed from snapshots and persisted.** A `ComplianceSnapshot` is produced by the nightly pipeline, on import commit, and on demand, from the same position snapshot the reconciliation widget uses. The dashboard reads the latest snapshot; the weekly report reads history. Nothing recomputes exposure in a request path (the S1.5 rule).
4. **Every number is explainable.** Each metric carries value, limit, ratio, status (PASS / WARN / BLOCK), the inputs' as-of timestamps, and missing-data flags, and every widget keeps the formula / source / interpretation tooltip.
5. **Entity-scoped by construction.** Limits are percentages of one entity's B. Compliance widgets refuse mixed-entity or mixed-environment scope with a next action ("select the corporate LIVE accounts"), exactly as the KB export does. Performance widgets accept any scope but label it.
6. **Broker facts are authoritative and dated.** Maintenance requirement, buying power and balances come from the broker (Schwab API through the MCP, or the statement) and display their source and as-of. When the broker fact is missing, the metric is UNKNOWN, never zero (the #327 lesson).
7. **Market context is evidence, not a rule.** Tide and Positioning Pressure are displayed and stamped, and never feed a PASS/WARN/BLOCK.
8. **Existing conventions hold.** Recharts only; CSS variables only; named exports; API contracts in `types/api.ts`; list/detail/error response shapes; loading/empty/populated states with a next action; account and range filters; tables sortable and filterable; no hard-coded labels.
9. **Design rulings hold.** Signal colour is never the only carrier of meaning, so every status shows its word; semantic colour uses the three sanctioned levels (`--*-dim`, `--*-border`, solid); chart colours encode series identity, not state. The theme has no gauge, status-chip or `warn` KPI primitive today, so those ship app-local under the rulings and are queued to kapman-design (§10.4).

---

## 6. Widget catalog

Each entry gives: what it shows, what it tells the reader (the tooltip interpretation), sources, default span, phase. "Entity-scoped" widgets require a single legal entity and a single environment.

### 6.1 Dashboard (operate the mandate)

| ID | Widget | Shows | Tells you | Sources | Span | Phase |
|---|---|---|---|---|---|---|
| D1 | **Mandate Compliance Board** (entity-scoped) | One row per hard limit (§4): current value, limit, utilization bar, PASS / WARN / BLOCK, as-of; header names the mandate version (and "DRAFT" when applicable) | Whether any limit is binding and how much room remains | `/api/compliance/latest` | 2 | M3 (limits fill in as M2–M4 land) |
| D2 | **Drawdown and Loss Controls** (entity-scoped) | Flow-adjusted NAV index vs high-water mark, current drawdown %, tier ladder 8 / 12 / 15 with the active tier and its required action, today's P&L vs the −2% rule, headline **Risk state: OPEN / RESTRICTED / RISK-REDUCING ONLY / SUSPENDED** | Whether new risk is permitted right now, and what §7 requires | `/api/compliance/latest`, `/api/analysis/nav-index` | 1 | M4 |
| D3 | **Directional Exposure** (entity-scoped) | Gross bullish delta-equivalent, recognized hedge exposure, net directional, each as $ and % of B against 150% / 0–100%; bars per underlying (top 10) with bullish/bearish split | Which names carry the book's direction, and whether hedges are doing their job | `/api/compliance/latest` (exposure block) | 2 | M3 |
| D4 | **Concentration** (entity-scoped) | Per issuer: long stock MV % of B (10%), short-put assignment notional incl. shares held % of B (20%); aggregate rows for 40% / 45% | Which issuer is closest to a concentration limit | same | 1 | M3 |
| D5 | **Options Premium at Risk** (entity-scoped) | Remaining premium and max defined loss by structure, aggregate vs 20% of B; hedge-option risk vs 3%; inverse-ETF purchase value vs 15% | How much of B is committed to option premium and hedges | same | 1 | M3 |
| D6 | **Campaign Budgets** (entity-scoped) | Open campaigns: frozen budget, current loss against budget, remaining, % consumed; aggregate planned loss vs 6% of B; campaigns with exhausted budgets; executions since the mandate effective date that are not linked to any campaign | Whether any campaign is near or past its loss budget, and whether the trade-record rule is being kept | `/api/campaigns?status=OPEN`, `/api/compliance/latest` | 1 | M2 (budget) / M3 (aggregate limit) |
| D7 | **Margin and Capital** (entity-scoped) | Per account and aggregate: NAV, maintenance requirement and % of NAV (30%), stock and option buying power, cash and equivalents, reserves, Trading Base B; source (Schwab API / statement / manual) and as-of; stress estimate (later) | Whether margin usage is inside the limit and how much B is actually deployable | `/api/broker-balances/latest`, `/api/mandate/trading-base` | 1 | M4 |
| D8 | **Review Due** | Open positions and campaigns hitting Appendix A triggers: swing options inside 20 DTE, short puts near 21 DTE, LEAPS under 12 months, verticals past their midpoint, campaign review dates, earnings inside the horizon (when an earnings source is wired) | What needs a decision today | positions snapshot + campaigns | 2 | M2 |
| D9 | **Breach and Exception Log** (entity-scoped) | Open and recently cured breaches and warnings: limit, value at open, when, cure note, approvals; exceptions and restarts with their approval reference | What the CEO/CFO must be told this week | `/api/compliance/events` | 3 | M4 |
| D10 | **Market Context** | Market Tide (% above 200-day SMA, bull-family %, weekly-up %, 1/5/10-session deltas), Sector Tide strip (11 sectors), Positioning Pressure with its components; all labelled "context, not a rule" | Whether the tape is broadly supported or carried by a few names, and how stretched positioning is | `/api/market-context/latest` | 1 | M5 |
| D11 | **Alignment** | For each open campaign: market state, sector state, stock state side by side (components, not a composite score) | Whether open theses are swimming with or against their sector and the market | `/api/market-context/latest` + campaigns + symbol reference | 2 | M5 |

KPI strip additions (all from `/api/compliance/latest` unless noted): **Risk State**, **Drawdown %** (flow-adjusted), **Daily P&L % of NAV**, **Net Directional % of B**, **Gross Bullish % of B**, **Maintenance % of NAV**, **Aggregate Planned Loss % of B**, **Open Breaches**, **Trading Base (B)**, **Reserves**.

### 6.2 Analytics (understand performance)

| ID | Widget | Shows | Tells you | Sources | Span | Phase |
|---|---|---|---|---|---|---|
| A1 | **Trade Return Distribution** (the CEO's bell curve) | Histogram of per-trade return % (x, centred at 0) by count (y); three shaded bands with draggable/typed cutoffs (default −10% / +10%); band shares vs target mix (default 30 / 40 / 30) as three small tiles with the delta to target; controlled-loss line at −30% of investment (or −1R when campaigns exist) with the count of losers beyond it; unit selector lot / setup / campaign; basis selector % of investment / R-multiple | Whether the book is producing the intended shape: few uncontrolled losers, a fat right tail | `/api/analysis/trade-returns` | 3 | M1 |
| A2 | **Return Percentile Bands** | P5 / P10 / P25 / P50 / P75 / P90 / P95 of return % and $; share of total P&L from the top 10% and top 30% of trades; worst 10% | How profitable the best trades are and how much the book depends on them | same | 1 | M1 |
| A3 | **Performance by Strategy vs Standard** | Per strategy class (Appendix A): count, win rate, expectancy, average entry DTE vs the standard window, average exit DTE vs the "before the final 20 DTE" rule, share of trades inside standard | Which strategies work, and whether they were run to standard | `/api/analysis/strategy-performance` | 2 | M6 |
| A4 | **Campaign Outcomes** | Closed campaigns: P&L, P&L as a multiple of the frozen budget (R), budget used, exit reason, hold days; scatter of R vs hold days; hit rate on target vs invalidation vs time exit | Whether losses stayed inside plan and winners reached their objective | `/api/campaigns?status=CLOSED` | 2 | M6 |
| A5 | **Benchmark Comparison** | Flow-adjusted portfolio index vs QQQ and SPY over the selected range; MTD / QTD / YTD / 1Y return table | The §2 objective: are we beating QQQ over the cycle | `/api/analysis/nav-index`, benchmark marks | 2 | M6 |
| A6 | **Hedge Effectiveness** | Hedge campaigns: cost as % of B per period, P&L during portfolio drawdown windows, coverage ratio (hedge delta / gross bullish delta) over time | Whether hedges reduced drawdowns for what they cost | campaigns + compliance history | 2 | M6 |
| A7 | **Excursion vs Plan** (extension of the existing MFE/MAE widget) | For campaign-linked lots, MFE against the recorded profit target and MAE against the invalidation | Whether targets were reachable and stops were placed where the market actually went | existing excursions + campaigns | 3 | M6 |

Existing analytics widgets stay (Account Value Curve, MFE/MAE, P&L by Setup Tag, Win/Loss/Flat, Setup Analytics Table). The Analytics page gets its own KPI strip and widget registry (KM-206) so these can be arranged and saved per user.

### 6.3 New pages

| Route | Nav group | Purpose | Phase |
|---|---|---|---|
| `/campaigns` | TRADE RECORDS | Campaign list (status, class, underlying, budget, used, R, exit reason), detail sheet with the Appendix B record, linked executions/lots/setups, lifecycle events, entry-time and market context, exceptions; create/edit; link executions (suggested + manual) | M2 |
| `/mandate` | EVIDENCE & AUDIT | Mandate versions and their limits (view, load a new version, approve), reserve schedule (CEO/CFO), compliance snapshot history, breach and exception log with cure/approval entry, weekly report generator | M0 (versions), M4 (history), M6 (report) |

`Today` gains a "Risk state" banner and the Review Due list; `Open Positions` gains delta, delta-equivalent $, and campaign columns.

---

## 7. Layouts

Both layouts are defaults in the registries; users still customize and the profile persists their arrangement (#344). Presets (KM-266) let a user switch between "CTO daily", "CEO weekly" and "Performance review" without rebuilding by hand.

### 7.1 Dashboard default — "CTO daily"

```
KPI strip (6 of the registry):
[Risk State] [Drawdown %] [Daily P&L % NAV] [Net Directional % B] [Maintenance % NAV] [Agg. Planned Loss % B]

Widget grid (3 columns):
| D1 Mandate Compliance Board ---------------- (2) | D2 Drawdown & Loss Controls (1) |
| D3 Directional Exposure -------------------- (2) | D6 Campaign Budgets          (1) |
| D4 Concentration (1) | D5 Premium at Risk (1) | D7 Margin & Capital          (1) |
| D8 Review Due ------------------------------ (2) | D10 Market Context           (1) |
| Account Balances + NLV (1) | Portfolio Reconciliation (1) | Open Positions Summary (1) |
| D9 Breach & Exception Log ----------------------------------------------------- (3) |
```

Reading order follows the three questions: permitted to add risk? (strip, D2) → room under each limit? (D1, D3–D7) → decisions today? (D8, D10) → is the record clean? (existing reconciliation trio, D9).

### 7.2 Dashboard preset — "CEO weekly" (the §8 weekly record)

```
KPI strip: [NAV] [Return on Capital] [Drawdown %] [Risk State] [Open Breaches] [Trading Base]

| A5 Benchmark Comparison ------------------- (2) | D2 Drawdown & Loss Controls (1) |
| D1 Mandate Compliance Board --------------- (2) | D4 Concentration             (1) |
| D3 Directional Exposure ------------------- (2) | D7 Margin & Capital          (1) |
| D9 Breach & Exception Log ----------------------------------------------------- (3) |
| A1 Trade Return Distribution -------------------------------------------------- (3) |
```

The weekly report (KM-261) renders the same content as a printable page and a Markdown export, dated and versioned, so the record survives independently of the live dashboard.

### 7.3 Analytics default — "Performance review"

```
KPI strip: [Return on Capital] [vs QQQ] [vs SPY] [Win Rate] [Expectancy] [Profit Factor]

| A1 Trade Return Distribution --------------------------------------------------- (3) |
| Account Value Curve (existing) ------------------------------------------------- (3) |
| A3 Performance by Strategy vs Standard ---- (2) | A2 Return Percentile Bands    (1) |
| A4 Campaign Outcomes ---------------------- (2) | Win / Loss / Flat (existing)  (1) |
| A5 Benchmark Comparison ------------------- (2) | P&L by Setup Tag (existing)   (1) |
| MFE / MAE with plan overlay (existing + A7) ------------------------------------ (3) |
| Setup Analytics Table (existing) ----------------------------------------------- (3) |
```

Until M6, the slots for A3–A6 are simply absent; A1 and A2 ship in M1 above the existing widgets.

### 7.4 Mobile

The bottom tab bar keeps its five slots (#340). The compliance widgets follow the tiered-table rule: on phones the Compliance Board shows limit, utilization and status only; exposure bars collapse to the top five names.

---

## 8. Data model changes

All new tables are additive migrations (the #339 idiom: no destructive change, backfill scripts idempotent). Money columns are `Decimal(20, 6)`; percentages are stored as fractions (`0.015` for 1.5%) and formatted in the UI, matching `SetupGroup.winRate`.

### 8.1 Mandate configuration (M0)

**`MandateVersion`** — one row per mandate document version per legal entity.
`id`, `legalEntityId` (FK), `label` (e.g. `v5 DRAFT r5`), `status` enum `DRAFT | APPROVED | SUPERSEDED`, `effectiveFrom`, `effectiveTo?`, `approvedAt?`, `approvedBy?` (free text, both shareholders), `sourceDocRef` (path or URL of the signed document), `limits` (Json, validated by `MandateLimitsV1` — see below), `standards` (Json, Appendix A per strategy class: typical DTE window, review rule), `notes`, timestamps.

`MandateLimitsV1` (Zod schema in `src/lib/mandate/limits-schema.ts`, type exported in `types/api.ts`):

```
campaignLoss: { SWING_DIRECTIONAL: 0.01, LEAPS: 0.02, STOCK: 0.02, SHORT_PUT: 0.02 }   // fraction of B
aggregatePlannedLossPctB: 0.06
purchasedOptionsPctB: 0.20
stockAggregatePctB: 0.40, stockIssuerPctB: 0.10
assignmentAggregatePctB: 0.45, assignmentIssuerPctB: 0.20
grossBullishDeltaPctB: 1.50, netDirectionalMinPctB: 0.00, netDirectionalMaxPctB: 1.00
maintenancePctNav: 0.30
hedgeOptionRiskPctB: 0.03, inverseEtfPctB: 0.15
dailyLossPct: 0.02
drawdownTiers: [ { pct: 0.08, action: "HALVE_SIZING" }, { pct: 0.12, action: "RISK_REDUCING_ONLY" }, { pct: 0.15, action: "SUSPEND" } ]
warnRatio: 0.80          // WARN when value ≥ 80% of a limit
prohibited: { nakedShortCalls: true, shortStock: true, futures: true, otc: true, crypto: true, maxDteSpeculative: 1 }
```

**`ReserveScheduleEntry`** — the CEO/CFO reserve schedule.
`id`, `legalEntityId`, `effectiveDate`, `operatingReserve`, `taxReserve`, `otherReserve`, `note`, `createdBy`, timestamps. B on any date = NAV − the latest entry at or before that date. No entry → B is UNKNOWN and every % of B metric reports UNKNOWN.

### 8.2 Per-trade return basis (M0)

**`MatchedLot`** gains `entryPrice`, `investmentBasis` (Decimal, multiplier-inclusive), `investmentBasisKind` enum `COST | ASSIGNMENT_NOTIONAL | MAX_DEFINED_LOSS`, `realizedReturnPct` (fraction). Written by the FIFO rebuild (`src/lib/ledger/rebuild-account-ledger.ts`), so every rebuild refreshes them; a backfill script rebuilds all accounts once.

**`SetupGroup`** gains `investmentBasis`, `investmentBasisKind`, `realizedReturnPct`, `setupOpenDate`, `setupCloseDate` (the latter two are already derived in the API and are persisted here — `docs/recommendations.md` §2).

### 8.3 Campaigns (M2)

**`Campaign`**
Identity: `id`, `campaignCode` (`C-YYYY-NNNN`, unique per entity), `legalEntityId`, `environment` (`LIVE | PAPER`), `underlyingSymbol`, `strategyClass` enum `SWING_DIRECTIONAL | LEAPS | STOCK | SHORT_PUT | DEBIT_VERTICAL | CREDIT_VERTICAL | COVERED_CALL | HEDGE | OTHER`, `structureLabel`, `direction` enum `BULLISH | BEARISH | NEUTRAL | HEDGE`, `status` enum `PLANNED | OPEN | CLOSED | ABANDONED`, `openedAt?`, `closedAt?`.
Thesis and entry: `thesis`, `entryTrigger`, `horizonDays`, `approvedEntryLow?`, `approvedEntryHigh?`, `plannedLegs` (Json).
Risk (frozen at open): `tradingBaseAtOpen`, `navAtOpen`, `plannedLossDollars`, `plannedLossPctB`, `maxDefinedLoss?`, `assignmentObligation?`, `budgetFrozenAt`.
Exit plan: `invalidationText`, `invalidationPrice?`, `profitTargetText`, `profitTargetPrice?`, `reviewDte?`, `reviewDate?`, `catalystConstraint?`.
Lineage: `ticketId?` (`<run_id>/P2-NN/T1`, the K1 idempotency key), `recId?`, `runId?`, `lineageId?`, `journalRef?`, `kbSchemaVersion?`.
Context: `entryContext` (Json — the KB's write-once block stored verbatim and marked historical: `entry_wyckoff_phase`, `entry_dgpi_tier`, `entry_flip_zone`, `entry_iv_hv_band`, `entry_vol_status`, `entry_wyckoff_event`, `entry_phase`, `phase_c_confirmed`, the eight SIGNAL stop/profit levels, `option_mid`, chain quality, sizing band), `marketContextAtOpen` (Json, from `MarketContextSnapshot`), `marketContextAtClose?`.
Lifecycle: `exitReason?` enum `TARGET | INVALIDATION | TIME | BUDGET_EXHAUSTED | GUARDRAIL | DISCRETIONARY | ASSIGNMENT | EXPIRATION | ROLLED`, `realizedPnl?` (derived at close), `postTradeNote?`, `createdBy`, `source` enum `KB | MANUAL | INFERRED`, timestamps.

**`CampaignExecutionLink`** — `campaignId`, `executionId` (unique), `role` enum `OPEN | ADD | ROLL_CLOSE | ROLL_OPEN | PARTIAL_EXIT | EXIT | HEDGE | ASSIGNMENT`, `linkedBy` enum `AUTO | MANUAL`, `note?`. Lots and setups reach a campaign through their executions.

**`CampaignEvent`** — the audit trail: `campaignId`, `kind` enum `CREATED | OPENED | ADD | ROLL | PARTIAL_EXIT | EXIT | BUDGET_EXCEPTION | RESTART_APPROVAL | REVIEW | NOTE | CLOSED`, `occurredAt`, `payload` (Json), `createdBy`.

**Rules encoded**
- The budget never increases after `budgetFrozenAt`; edits are refused and recorded as `BUDGET_EXCEPTION` only with an approval reference.
- A roll is two links (`ROLL_CLOSE`, `ROLL_OPEN`) on the same campaign; the closed leg's realized P&L consumes budget.
- A same-thesis restart after exhaustion is a new campaign that references the old one (`restartOfCampaignId`) and requires a `RESTART_APPROVAL` event before status can be OPEN.

### 8.4 Exposure inputs (M3)

**`PositionSnapshotOpenPosition`** (JSON in `PositionSnapshot`/`PositionSnapshotAccount`) gains `delta`, `theta`, `iv`, `dte`, `underlyingPrice`, `deltaSource` (`LIVE | MODEL | ASSUMED`). Live delta comes from the quote path that already parses it; `MODEL` is a Black–Scholes fallback from mark, strike, DTE and IV when the provider omits delta; `ASSUMED` is 1.0 per share for equity. Older snapshots stay valid (fields optional).

**`SymbolReference`** — `symbol` (unique), `name?`, `assetType` enum `STOCK | ETF | INDEX | MONEY_MARKET | OTHER`, `isInverse`, `leverageFactor` (1 = unleveraged), `sector?`, `industry?`, `sic?`, `source`, `asOf`. Populated by the marketdata pipeline (ticker details) with a manual override path; consumed by concentration, hedge and prohibited-instrument checks and by sector rollups.

### 8.5 Compliance and margin (M3, M4)

**`BrokerBalanceSnapshot`** (M4) — `accountId`, `asOf`, `source` enum `SCHWAB_API | STATEMENT | MANUAL`, `netLiquidationValue`, `cashAndEquivalents?`, `maintenanceRequirement?`, `marginBalance?`, `stockBuyingPower?`, `optionBuyingPower?`, `dayTradingBuyingPower?`, `equity?`, `isInCall` (bool?), `raw` (Json), `createdBy?`. Unique on (`accountId`, `asOf`, `source`).

**`ComplianceSnapshot`** (M3 — the Board needs history from its first day) — `legalEntityId`, `environment`, `asOf`, `trigger` enum `NIGHTLY | IMPORT | MANUAL`, `mandateVersionId`, `positionSnapshotId?`, `nav`, `reserves`, `tradingBase`, `metrics` (Json: array of `{ key, value, limit, ratio, status, unit, asOf, inputs, missing[] }`), `overallStatus` enum `PASS | WARN | BLOCK | UNKNOWN`, `riskState` enum `OPEN | RESTRICTED | RISK_REDUCING_ONLY | SUSPENDED`, `drawdownPct`, `highWaterMark`, `dailyPnlPct?`, `missingInputs` (Json), timestamps.

**`ComplianceEvent`** (M4) — `legalEntityId`, `kind` enum `BREACH | WARNING | MARGIN_CALL | RESERVE_SHORTFALL | EXCEPTION | RESTART_APPROVAL | SUSPENSION | NOTE`, `limitKey?`, `openedAt`, `curedAt?`, `status` enum `OPEN | CURED | WAIVED`, `valueAtOpen?`, `limitAtOpen?`, `campaignId?`, `correctiveAction?`, `approvalRef?`, `notifiedAt?`, `notifiedTo?`, `createdBy`, timestamps. Breaches open automatically from a snapshot transition PASS→BLOCK and cure automatically on BLOCK→PASS, with the operator's notes attached; exceptions and approvals are entered by hand.

### 8.6 Market context (M5)

**`MarketContextSnapshot`** — `date` (unique per `universe`), `universe` (e.g. `SP500-2026Q3`), `pctAbove200Sma`, `pctBullFamily`, `pctWeeklyUp`, `delta1`, `delta5`, `delta10` (Json of the three measures), `sectors` (Json: per sector the same three measures and deltas), `positioningPressure` (Json: components with values and percentiles, composite, method version), `source`, `sourceVersion`, `ingestedAt`.

### 8.7 Benchmarks and profiles (M6, M1)

- Benchmark bars reuse `HistoricalMark` with `QQQ` and `SPY` added to the equity ingestion list (config `BENCHMARK_SYMBOLS`); no new table.
- `UserProfile.settings` gains leaves `analytics.widgets`, `analytics.kpis`, `widgetSettings.tradeReturnDistribution` (cutoffs, target mix, controlled-loss line, unit, basis) and `dashboard.preset`.

### 8.8 Migration and backfill order

1. M0: `MandateVersion`, `ReserveScheduleEntry`; `MatchedLot`/`SetupGroup` columns + `rebuild:pnl` backfill.
2. M2: `Campaign`, `CampaignExecutionLink`, `CampaignEvent`.
3. M3: `SymbolReference`, `ComplianceSnapshot`; snapshot JSON fields (no migration).
4. M4: `BrokerBalanceSnapshot`, `ComplianceEvent`.
5. M5: `MarketContextSnapshot`.
Every deploy with a migration goes through `npm run deploy:safe` (backup first), per `AGENTS.md`.

---

## 9. Calculations

Formulas use the playbook's definitions (NAV, B, assignment notional, delta-equivalent). Each has a named source and a known gap.

### 9.1 Per-trade return (M0)

`realizedReturnPct = realizedPnl / investmentBasis`, where `investmentBasis` depends on the structure:

| Structure (setup tag / campaign class) | Investment basis | Rationale |
|---|---|---|
| stock, long call, long put, LEAPS | cost (entry price × qty × multiplier) | "the investment" is the premium or purchase |
| debit vertical, diagonal, calendar | net debit paid | defined-risk debit structures |
| credit vertical | max defined loss = (width − credit) × qty × 100 | the capital genuinely at risk |
| cash-secured / margin-secured short put | assignment notional = strike × qty × 100 | the obligation (conservative; matches the mandate's assignment measure) |
| covered call | stock cost basis of the covered shares (call premium reduces it) | one economic position (Appendix A) |
| roll | attributed to the campaign; per-lot value stays cost-based | rolls realize the old trade |
| uncategorized, short call | cost of the long side if any; else max defined loss if computable; else null (excluded from %-based widgets, counted in a caveat) | never invent a denominator |

When a campaign exists, `R = realizedPnl / plannedLossDollars` is the second basis.

### 9.2 Trading Base and NAV

`NAV(entity, asOf)` = Σ over the entity's LIVE accounts of broker NLV when available, else reconstructed NLV from the latest complete `PositionSnapshotAccount`; each account contributes its own as-of, and the aggregate reports the oldest. `B = NAV − reserves(asOf)`. Source flags: `broker_nlv | reconstructed | mixed`.

### 9.3 Delta-equivalent exposure (M3)

Per position: options `deltaEq = delta × netQty × 100 × underlyingPrice`; equity `deltaEq = netQty × mark × leverageFactor × (isInverse ? −1 : 1)`. Money-market and cash equivalents are excluded.

- **Gross bullish** = Σ positive `deltaEq` over non-hedge positions.
- **Bearish (non-hedge)** = Σ negative `deltaEq` over non-hedge positions (short calls of covered calls, bearish campaigns).
- **Hedge exposure** = Σ |`deltaEq`| over positions whose campaign class is HEDGE, or, when unlinked, that match the hedge heuristic (long index/ETF puts or put spreads, inverse ETFs, VIX calls), flagged as `HEURISTIC` in the metric inputs.
- **Net directional** = gross bullish + bearish (non-hedge) − hedge exposure.
- Limits: gross bullish ≤ 150% of B; 0 ≤ net directional ≤ 100% of B. Hedge exposure is reported before netting, as the definitions section requires.

Gaps: delta requires a live quote or a model; equity beta is deliberately not applied (the mandate says delta-equivalent, not beta-adjusted) — noted for a later study.

### 9.4 Concentration and assignment (M3)

- Long stock MV per issuer = Σ `netQty × mark` for `assetType STOCK | ETF` with `leverageFactor = 1` and not inverse; aggregate ≤ 40% of B, issuer ≤ 10%.
- Assignment notional per issuer = Σ short puts `strike × |netQty| × 100` + long stock MV already held in that issuer; aggregate short-put notional ≤ 45% of B, issuer ≤ 20%.

### 9.5 Options premium at risk (M3)

- Long options: remaining premium = `mark × netQty × 100` (current value, since that is what can still be lost).
- Debit spreads: current net value of the spread.
- Credit spreads: max defined loss = `(width − credit received) × qty × 100`.
- Aggregate ≤ 20% of B. Hedge options (class HEDGE) are counted separately against 3% of B; inverse-ETF purchase value = cost basis of open inverse ETF positions against 15% of B.
- Uncovered short calls (no shares, no long leg) are a **prohibited-instrument BLOCK**, not a premium metric.

### 9.6 Margin (M4)

`maintenance % NAV = maintenanceRequirement / NLV` per account, and Σ maintenance / Σ NLV in aggregate, ≤ 30%. Source: `BrokerBalanceSnapshot` (Schwab API preferred; statement `Stock/Option Buying Power` gives buying power but not the requirement; manual entry as fallback). Missing requirement → UNKNOWN with a next action ("enable Schwab account tools or enter today's balances").

Stress estimate (later story KM-243): reprice open positions at ±10% / ±20% underlying moves using delta and gamma where available (gamma from the chain), sum P&L and an approximate requirement change; labelled an estimate, never the broker's number.

### 9.7 Daily loss and drawdown (M4)

Flow-adjusted daily return `r_t = (NAV_t − NAV_{t−1} − F_t) / (NAV_{t−1} + max(F_t, 0))` where `F_t` are the day's external flows (`external_flow` rows from the shared classification plus in-kind receives, #357). NAV index `I_t = Π (1 + r_s)`; high-water mark `H_t = max_{s ≤ t} I_s`; drawdown `D_t = I_t / H_t − 1`.

- Daily loss control: `r_today ≤ −2%` → risk state RESTRICTED for the session; requires a reconciliation note (`ComplianceEvent` NOTE) before it clears.
- Tiers: `D ≤ −8%` HALVE_SIZING (new-campaign budgets are checked at half the class limit); `D ≤ −12%` RISK_REDUCING_ONLY; `D ≤ −15%` SUSPENDED (clears only with a `RESTART_APPROVAL` event carrying both shareholders' approval).
- The most restrictive active control governs; the risk state is the max of daily-loss, drawdown-tier, margin-call/breach states.

The existing `maxDrawdown` KPI stays for continuity and is re-labelled "raw NLV drawdown"; the new KPI is "Drawdown (flow-adjusted)".

### 9.8 Campaign budgets (M2)

`plannedLossPctB = plannedLossDollars / tradingBaseAtOpen` is checked against the class limit at open (and at half the limit under tier 1). Budget used = −min(0, campaign realized P&L + campaign unrealized P&L). Aggregate planned loss = Σ `plannedLossDollars` over OPEN directional campaigns (HEDGE excluded), compared with 6% of **current** B; the snapshot also records the sum against B-at-open for transparency.

### 9.9 Status rules

`ratio = value / limit`. `PASS` if `ratio < warnRatio`; `WARN` if `warnRatio ≤ ratio < 1`; `BLOCK` if `ratio ≥ 1`; `UNKNOWN` if any required input is missing (the row states which). Two-sided limits (net directional) use the distance to the nearer bound.

---

## 10. Cross-repo contracts

Tradelog is "record and transport, never the authority" in the KB's contracts (`kapman-kb/engineering_only/HITL_QUEUE_CONTRACT_v4.0.md`), and the same rule holds here: Tradelog records intent it is handed, computes deterministic facts, and reports status; it never decides a trade. Endpoint names below are proposals; per the KB convention they enter a KB contract only after live verification.

### 10.1 KB / Journal (`kapman-kb`, `kapman-journal`)

What exists today (survey of 2026-09-11): the recommendation mirror (`POST /api/recommendations`, idempotent on `rec_id`), the HITL queue surfaces, the §A2 portfolio snapshot consumed by Portfolio mode, and a **ticket grammar** (`JOURNAL_MGMT_v4.0.md` §ticket) that is the closest thing to a trade record: instrument block and `legs[]` with `osi_symbol`, entry range, chain quality, sizing band, an exit contract (`stop{level, basis, dealer_window, durability}`, `targets{level, probability, horizon}`, `trail`, earnings/catalyst advisories), a manifest with `denominator{value, source, as_of, status}`, `account`, `side: open`, `status: PROPOSED`; quantity is born only at APPROVED, and lifecycle is separate `_approved/_rejected/_expired/_executed` event files. Entry-time context is written once to `positions.md` (`entry_wyckoff_phase`, `entry_dgpi_tier`, `entry_flip_zone`, `entry_iv_hv_band`, `entry_vol_status`, `entry_wyckoff_event`, `entry_phase`, `phase_c_confirmed`, the eight SIGNAL levels, `option_mid`). The KB has **no** campaign, Trading Base, planned-loss, PASS/WARN/BLOCK, drawdown-tier, daily-loss or margin concept; its sizing bands (top ≈3% / mid ≈2% / floor ≈1% of entity real capital, 5% per-name ceiling, CSP/LEAP by assignment cost) are position-size rules, not loss budgets.

| ID | Contract | Direction | Content |
|---|---|---|---|
| K1 | **Campaign intent hand-off** | KB → Tradelog `POST /api/campaigns/intent` | Fired when a ticket becomes APPROVED (quantity exists). Payload = Appendix B mapped from the ticket: `ticket_id` (`<run_id>/P2-NN/T1`, idempotency key), `rec_id`, `run_id`, `lineage_id`, `legal_entity`, `environment`, `account`, `underlying`, `structure`, `legs[]` (`osi_symbol`, side, quantity), entry range, `sizing_band`, `chain_quality`, exit contract (stop level and basis, targets, trail), advisories, `denominator{value, source, as_of}`, `planned_loss{dollars, pct_of_b}` when the KB can compute it from stop × quantity, thesis/trigger text, horizon, and the entry-time context block verbatim. Tradelog creates a `PLANNED` campaign (`source: KB`) and answers with `campaign_code`. Re-POST updates only while PLANNED; after OPEN the budget is frozen and a changed budget is refused with `BUDGET_FROZEN`. |
| K2 | **Trading Base for sizing** | KB ← Tradelog `GET /api/mandate/trading-base?legalEntity=&environment=` | Returns `{ nav, reserves, tradingBase, asOf, sources, mandateVersion }`. Proposal: the KB's sizing `denominator` becomes B (NAV − reserves) instead of "entity real capital", so a 1% floor band and a 1%-of-B campaign loss speak the same unit. Open question §12. |
| K3 | **Pre-trade check** | KB ← Tradelog `POST /api/compliance/pretrade` | Body: proposed legs (`osi_symbol`/underlying, side, quantity, price), campaign class, planned loss. Response: per-limit `{ key, projectedValue, limit, status }` evaluated on the latest compliance snapshot plus the proposal, overall `PASS | WARN | BLOCK | UNKNOWN`, `riskState`, and the snapshot's as-of. The KB records the result in the ticket manifest (Appendix B "Portfolio checks"); a BLOCK is advisory inside the KB (Tradelog is not the authority) but is part of the record. |
| K4 | **Campaign code on the §A2 export** | KB ← Tradelog `GET /api/export/portfolio-snapshot` (schema 1.2) | Each open leg gains `campaign_code` and `campaign_class` so `positions.md` can carry the campaign identity; unlinked legs carry `null` and Portfolio mode can flag "no trade record". |
| K5 | **Executed event linkage** | KB → Tradelog (optional) | The `_executed` ticket event may carry broker order ids; Tradelog's auto-link (KM-214) prefers them over the plan-vs-actual date-window join when present. |
| K6 | **Calibration / Review feed** | KB ← Tradelog | The Integration Plan's Stream 2 (`Kapman_System_Integration_Plan_v1.0.md` §8) can read `/api/campaigns` (outcomes, R, exit reasons), `/api/analysis/trade-returns` and `/api/analysis/nav-index` in addition to today's excursions endpoint. No new contract beyond stable response shapes. |

### 10.2 Viewer / marketdata (`kapman-polygon-viewer`, `kapman-polygon-mcp-v2`, `kapman-marketdata-MCP`)

What exists: `breadth_daily()` computes three watchlist measures at read time (never persisted) with 35/65 bands, served in `GET /api/forward-log/status.breadth` behind Cloudflare Access with a machine bearer token (`VIEWER_API_TOKEN`) on a GET-only allowlist; the pooled header double-counts a symbol present on two watchlists (documented in the code as acceptable "while snapshots effectively cover one watchlist"). S006 built a point-in-time S&P 500 constituent resolver and a 672-session breadth series (`research/forward_log/studies/S006_actual_tradelog_tide/build_spx_breadth.py`). `get_batch_wyckoff_scan` handles at most 30 symbols per call; ticker details expose `sic_code`; IV percentile/rank, 25-delta skew, volume-based put/call, DGPI, `rvol_20`/`vol_z_score` exist per symbol; VIX/VIX3M term structure does not (index candles are available through `get_index_candles`). No licensing text exists in any of these repos.

| ID | Work | Notes |
|---|---|---|
| V1 | Dedupe the pooled Tide (`DISTINCT symbol` per `log_date`) | Small; keeps the per-watchlist paths unchanged |
| V2 | **Market Tide job**: nightly, fixed point-in-time S&P 500 universe (reuse S006's resolver), % above 200-day SMA, bull-family %, weekly-up %, 1/5/10-session deltas; persisted (`market_tide_daily`) | Regime for ~500 names = ~17 `get_batch_wyckoff_scan` calls per night, or a cheaper regime proxy for the universe with the full engine reserved for the shortlist — the job decides, the contract only promises the three measures and the method version |
| V3 | **Sector Tide**: the same measures per sector, sector from `sic_code` via `SIC_SECTOR_MAP_v4.0` (11 sectors) | Also publishes the symbol → sector mapping Tradelog needs (V6) |
| V4 | **Positioning Pressure v0**: components with values, percentiles and as-of — SPY/QQQ DGPI and position vs flip (`/api/market-context`), universe-median IV percentile, 25-delta skew, put/call, % distance from 50/200-day SMA (new field), volume surprise, and VIX/VIX3M ratio (new, via index candles); a composite with a method version; explicitly unvalidated | Codex's name; never a gate |
| V5 | Publish `GET /api/market-context/daily?from&to` on the bearer GET allowlist | Tradelog ingests nightly (KM-251) with `VIEWER_API_URL` / `VIEWER_API_TOKEN` |
| V6 | Publish `GET /api/symbols/reference?symbols=` (asset type, ETF flags incl. inverse and leverage, sector, SIC, name) | Feeds `SymbolReference` (KM-222); alternatively Tradelog calls `get_batch_symbol_data(details)` through a second MCP endpoint |

### 10.3 Schwab MCP (`kapman-schwab-MCP`)

**Verified 2026-09-12 against the deployed server (`kapman-schwab-mcp.fly.dev`, machine version 39, HEAD `83fa7b2`).** `MCP_ENABLE_ACCOUNT_TOOLS` is set as a Fly secret and the server exposes 26 tools, including `get_account_numbers`, `get_accounts`, `get_accounts_with_positions`, `get_account`, `get_account_with_positions`, `get_user_preferences`, `get_transactions` and `get_transaction`; order tools are not registered. Tradelog reaches it through the URL-token path in `MCP_SERVER_URL` (no bearer). A live `get_accounts` call succeeded: exactly one linked account (the corporate margin account), with `currentBalances` carrying `liquidationValue`, `equity`, `maintenanceRequirement`, `maintenanceCall`, `regTCall`, `buyingPower`, `availableFunds`, `sma`, `marginBalance`, `longMarketValue`, `longOptionMarketValue`, `shortOptionMarketValue`, `moneyMarketFund`/`mutualFundValue`, and `projectedBalances.isInCall`; positions carry a per-position `maintenanceRequirement`, `marketValue`, `averagePrice`, `longOpenProfitLoss` and `currentDayProfitLoss`. Option chains return `delta`, `gamma`, `theta`, `vega`, `underlyingPrice` and `multiplier`. The paper accounts (thinkorswim paperMoney) and the Fidelity account are not reachable through this API.

| ID | Work | Notes |
|---|---|---|
| S1 | **Done.** Account tools are enabled and answer for the corporate account. Remaining: keep the weekly token renewal healthy (a lapsed token turns every balance into UNKNOWN), and decide the polling cadence for KM-241 (nightly plus on-demand; intraday only if the daily-loss rule is measured intraday) | Balances verified live on 2026-09-12; per-position maintenance requirement also available, which makes the stress estimate (KM-243) cheaper |
| S2 | Optional: `get_accounts_with_positions` as an independent position check against Tradelog's reconstruction | A reconciliation bonus, not required by the mandate |

Statement (`Stock Buying Power`, `Option Buying Power`; no maintenance requirement) and manual entry remain the fallbacks for the paper accounts and for Fidelity, which the Schwab API does not cover; the margin metric always reports its source.

### 10.4 Design system (`kapman-design`)

No gauge, meter, progress or status-chip primitive exists in the theme; the KPI tile has no `warn` variant; there is no ruling on operator-adjustable widget parameters. The rulings that bind: signal colour is never the only carrier of meaning; semantic colour has three levels (`--*-dim` 12%, `--*-border` 30%, solid); progress tracks are inset fills; `--text-on-fill` is the ink on filled chips; chart colours encode series identity, not state. Queue one handoff (`theme/to-design/`) covering: a **status chip** PASS / WARN / BLOCK / UNKNOWN (word + colour), a **utilization bar** (inset track, solid fill, over-limit rendering, limit tick), a **KPI `warn` variant**, a **tier ladder** (three rungs, active rung), **band shading** in a Recharts histogram (`ReferenceArea` with `--neg-dim` / `--pos-dim`), and an **adjustable-parameter control** (inline numeric input with a "mandate default" reset and a "modified" marker). KM-203 ships app-local versions under those rulings and re-vendors when the handoff lands.

---

## 11. Roadmap phases and stories

Effort key as in v9 (XS < 2h, S 2–4h, M 4–8h, L 8–16h, XL 16–24h). Priority: P0 = needed for the mandate's hard limits or the CEO's explicit request; P1 = needed for the §8 reporting cadence; P2 = valuable, deferrable. Every story follows the AGENTS.md workflow (issue first, direct-to-main, validation suite, `deploy:safe` when a migration ships). Stories that add a widget also add its help entry (formula / source / interpretation), its loading/empty/populated states with a next action, and a unit test on the calculation module.

### Dependency graph

```
M0  KM-201 mandate versions ─┬─▶ KM-202 trading base ─┬─▶ KM-215 campaign budgets ─▶ KM-231 engine ─▶ KM-232 board
    KM-203 scope guard + primitives ─────────────────────┤                              ▲               ▲
    KM-204 per-trade return basis ─▶ M1 KM-205/207 histogram, percentiles              │               │
                                        KM-206 analytics registry                      │               │
M2  KM-211 campaigns ─▶ KM-212 KB intent ─▶ KM-213 page ─▶ KM-214 linkage ─▶ KM-216 review due          │
M3  KM-221 delta ─▶ KM-222 symbol ref ─▶ KM-223 concentration ─▶ KM-224 premium ─▶ KM-231 ─▶ KM-233 exposure widgets
M4  KM-241 balances ─▶ KM-242 margin metric ─▶ KM-243 stress (P2)
    KM-244 nav index / drawdown / risk state ─▶ KM-245 events + breach log ─▶ KM-246 mandate history page ─▶ KM-248 pretrade
M5  V2/V5 ─▶ KM-251 ingest ─▶ KM-253 tiles ─▶ KM-254 stamping;  V4 ─▶ KM-255 positioning pressure
M6  KM-263 benchmarks; KM-264 strategy; KM-265 campaign outcomes/hedges/excursion plan; KM-261 weekly; KM-262 monthly; KM-266 presets
```

### Phase M0 — Foundations (`[v10-M0]`, ≈ 3–4 dev days)

#### KM-201 — [v10-M0] Mandate versions and limits as data

**Type:** feat | **Priority:** P0 | **Effort:** L

**Context.** Every compliance number compares a fact against a limit. The playbook is a draft that will be approved, renewed annually and amended; thresholds must not be hard-coded (the TTS readiness registry is the precedent to avoid repeating).

**Deliverables.**
1. Prisma `MandateVersion` (§8.1) with `limits` and `standards` JSON; Zod `MandateLimitsV1` / `MandateStandardsV1` in `src/lib/mandate/`; types in `types/api.ts`.
2. Seed: Playbook v5 DRAFT r5 limits and Appendix A standards for the corporate entity, status `DRAFT`, `sourceDocRef` = the Drive path.
3. `GET /api/mandate/versions`, `POST /api/mandate/versions` (load a new version from JSON), `PATCH /api/mandate/versions/:id` (status transitions DRAFT→APPROVED→SUPERSEDED with `approvedBy`, `approvedAt`; only one APPROVED per entity per date).
4. `/mandate` page (EVIDENCE & AUDIT): versions table, limits table with the playbook clause reference per row, status badge; empty state links to the seed instructions.
5. Helper `resolveMandateVersion(legalEntityId, asOf)` = APPROVED effective at `asOf`, else the latest DRAFT flagged `shadow: true`.

**Acceptance.**
- [ ] Seeded version renders all §4 limits, §7 tiers and Appendix A windows with their clause references.
- [ ] Status transitions are validated; a second APPROVED version overlapping in dates is refused.
- [ ] `resolveMandateVersion` unit tests cover approved, draft-only (shadow) and none.
- [ ] Migration applied via `deploy:safe`; typecheck, lint, tests, build green.

**Depends on:** nothing. **Blocks:** KM-202, KM-215, KM-231.

#### KM-202 — [v10-M0] Reserve schedule and Trading Base (B)

**Type:** feat | **Priority:** P0 | **Effort:** M

**Deliverables.**
1. Prisma `ReserveScheduleEntry` (§8.1); `GET/POST /api/mandate/reserves`; editing on `/mandate` (CEO/CFO enters operating, tax, other reserves with an effective date and note).
2. `GET /api/mandate/trading-base?legalEntity&environment&asOf` → `{ nav, navSource, navAsOf, reserves, reserveAsOf, tradingBase, mandateVersion, shadow }` (§9.2). NAV from the latest complete `PositionSnapshotAccount` rows of the entity's LIVE accounts (broker NLV preferred).
3. KPI registry: **Trading Base (B)** and **Reserves**; both `UNKNOWN` with next action when no schedule entry exists.

**Acceptance.**
- [ ] With a schedule entry, B = NAV − reserves; without, B is UNKNOWN and the KPI says "enter the reserve schedule on /mandate".
- [ ] NAV source and as-of are reported; mixed sources read `mixed`.
- [ ] Route declares `force-dynamic`; unit tests for the B resolver.

**Depends on:** KM-201. **Blocks:** KM-215, KM-231, KM-244.

#### KM-203 — [v10-M0] Compliance scope guard and status primitives

**Type:** feat | **Priority:** P0 | **Effort:** M

**Context.** Limits are per entity; the account filter can select anything. The design system has no status chip, utilization bar or `warn` KPI variant, and signal colour may never be the only carrier of meaning.

**Deliverables.**
1. `useComplianceScope()` hook: resolves the selection to exactly one legal entity and one environment, else returns a refusal reason; reuses `selectionWarnings` from `AccountFilterContext`. A `ComplianceScopeGate` wrapper renders the standard refusal state ("Compliance limits are per entity. Select the corporate LIVE accounts.") with a one-click fix.
2. `StatusChip` (PASS / WARN / BLOCK / UNKNOWN: word plus `--pos` / `--warn` / `--neg` / neutral, `--*-dim` background, `--text-on-fill` where filled), `UtilizationBar` (inset track, solid fill, limit tick at 100%, over-limit state), `TierLadder`, and a `KpiCard` `warn` variant; all token-based, documented in `design/README.md` as app-local pending the kapman-design handoff (§10.4).
3. Shared status resolver `resolveLimitStatus(value, limit, warnRatio, twoSided?)` (§9.9) with tests.

**Acceptance.**
- [ ] Mixed-entity or mixed-environment selection shows the refusal state in every widget that uses the gate; single-entity LIVE selection passes.
- [ ] Every status renders its word; `npm run lint:design` passes.
- [ ] Resolver tests cover PASS/WARN/BLOCK/UNKNOWN and the two-sided case.

**Depends on:** nothing. **Blocks:** KM-215, KM-232, KM-233, KM-245.

#### KM-204 — [v10-M0] Per-trade return basis persisted; trade-returns endpoint

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.**
1. `MatchedLot` and `SetupGroup` columns from §8.2, written by the ledger and setup rebuilds using the §9.1 basis table; `rebuild:pnl` backfills all accounts.
2. `GET /api/analysis/trade-returns?unit=lot|setup|campaign&accountIds&date_from&date_to` → list of `{ id, unit, symbol, underlyingSymbol, structure, openDate, closeDate, realizedPnl, investmentBasis, investmentBasisKind, realizedReturnPct, rMultiple? , campaignCode? }` with meta counts of excluded rows (null basis) and the reason.
3. `docs/metrics_calcs.md` gains the basis table.

**Acceptance.**
- [ ] For the fixtures, a long call lot reports P&L ÷ premium; a cash-secured put reports P&L ÷ (strike × 100 × qty); a bull vertical setup reports P&L ÷ net debit; uncategorized rows are excluded with a count.
- [ ] Rebuild is idempotent; the excursions API's derived `realizedReturnPct` equals the persisted value on every priced lot (regression test).
- [ ] Route supports the standard list response and the shared range semantics (open-trade-date cohort).

**Depends on:** nothing. **Blocks:** KM-205, KM-207, KM-264.

### Phase M1 — The CEO's distribution widget (`[v10-M1]`, ≈ 3 dev days)

#### KM-205 — [v10-M1] Trade Return Distribution widget (A1)

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.**
1. `TradeReturnDistributionWidget` on the Analytics page (above Account Value Curve) and in the dashboard registry; Recharts `BarChart` histogram of `realizedReturnPct` with adaptive bins (2% default; wider when the range is large), `ReferenceArea` shading for the three bands (`--neg-dim`, none, `--pos-dim`), `ReferenceLine` at 0 and at the controlled-loss line, tooltip listing count and the trades in the bin.
2. Controls in the card header: loss cutoff (default −10%), win cutoff (+10%), target mix (30/40/30), controlled-loss line (−30% of investment; −1R when basis = R), unit (setup default; lot; campaign when any exist), basis (% of investment; R multiple). Values persist in the profile leaf `widgetSettings.tradeReturnDistribution`; "Reset to defaults" restores the widget defaults.
3. Band tiles: for each band, count, share, target share and the gap, plus average return and total P&L; a "losers beyond the controlled-loss line" tile.
4. Optional smoothed density line (kernel estimate) toggled from the legend; default off.
5. Help text: formula (basis table), source (`/api/analysis/trade-returns`), interpretation ("the intended shape is few uncontrolled losers and a fat right tail").

**Acceptance.**
- [ ] With existing production data the widget renders at unit = setup with non-zero counts in all three bands; the excluded-row caveat shows the count.
- [ ] Changing a cutoff re-bands immediately and persists across reload for the same identity; reset restores defaults.
- [ ] Band shares sum to 100% (± rounding); the controlled-loss count equals the rows with return ≤ the line.
- [ ] Loading, empty ("no closed trades in range — widen the range or import statements") and populated states exist; phone layout stacks tiles under the chart.

**Depends on:** KM-204. **Blocks:** KM-266.

#### KM-206 — [v10-M1] Analytics page: registry, KPI strip and saved layout (revives KM-112)

**Type:** feat | **Priority:** P1 | **Effort:** L

**Deliverables.** `ANALYTICS_WIDGET_REGISTRY` and `ANALYTICS_KPI_REGISTRY` (existing analytics blocks become registered widgets: Account Value Curve, MFE/MAE, P&L by Setup Tag, Win/Loss/Flat, Setup Analytics Table, plus A1/A2), the dashboard's edit mode, pickers, drag/resize reused; layout persisted in profile leaves `analytics.widgets` / `analytics.kpis` (not localStorage as KM-112 said; #344 supersedes); defaults per §7.3.

**Acceptance.**
- [ ] Default analytics layout matches §7.3 (M1 subset); customizing persists per identity; reset restores defaults.
- [ ] The setup table keeps its tiered mobile columns and symbol links.

**Depends on:** nothing (KM-205 mounts directly if this lands later). **Blocks:** KM-266.

#### KM-207 — [v10-M1] Return Percentile Bands widget (A2)

**Type:** feat | **Priority:** P1 | **Effort:** M

**Deliverables.** Percentile table (P5…P95) of return % and $ for the same unit/basis as A1; contribution of the top 10% / top 30% and the bottom 10% of trades to total P&L; the widget shares A1's settings.

**Acceptance.** Percentiles verified against a fixture with known values; shares of P&L sum correctly; help text present.

**Depends on:** KM-204, KM-205.

### Phase M2 — Campaigns and Trade Records (`[v10-M2]`, ≈ 8–10 dev days)

#### KM-211 — [v10-M2] Campaign model, lifecycle events and API

**Type:** feat | **Priority:** P0 | **Effort:** XL

**Deliverables.**
1. Prisma `Campaign`, `CampaignExecutionLink`, `CampaignEvent` (§8.3) with enums; `campaignCode` generator per entity and year.
2. `src/lib/campaigns/`: create/open/close/abandon transitions; budget freeze at OPEN (`tradingBaseAtOpen` from KM-202, `plannedLossPctB`, class-limit check against the resolved mandate version — a breach of the class limit is recorded as a `BUDGET_EXCEPTION` event and the campaign is refused OPEN without `approvalRef`); budget-used and realized P&L derivation from linked executions and lots; restart-after-exhaustion rule.
3. Routes: `GET /api/campaigns` (filters: status, class, underlying, entity, environment, date range; list response), `POST /api/campaigns`, `GET/PATCH /api/campaigns/:id`, `POST /api/campaigns/:id/events`, `POST /api/campaigns/:id/links`, `DELETE /api/campaigns/:id/links/:executionId`. Types in `types/api.ts`.
4. `docs/data_model.md` and `docs/metrics_calcs.md` updated.

**Acceptance.**
- [ ] A campaign cannot be OPEN without a frozen budget and B; the budget cannot change after OPEN except through a `BUDGET_EXCEPTION` event with an approval reference.
- [ ] Rolls link close and open legs to one campaign; budget used reflects the realized leg.
- [ ] Unit tests for every transition and for budget arithmetic on fixture executions.

**Depends on:** KM-201, KM-202. **Blocks:** KM-212–KM-216, KM-231, KM-254, KM-265.

#### KM-212 — [v10-M2] KB campaign intent hand-off (`POST /api/campaigns/intent`)

**Type:** feat | **Priority:** P0 | **Effort:** M

**Deliverables.** Endpoint per §10.1 K1 with bearer auth (existing `API_BEARER_TOKEN` path), Zod validation, idempotency on `ticket_id`, `entryContext` stored verbatim, scope validation (entity and environment must resolve; unknown entity refused as in the recommendation mirror), `BUDGET_FROZEN` refusal after OPEN; a sample payload in `docs/` and a replay script pattern like `ingest-recommendations.ts`.

**Acceptance.** Replaying the same payload twice yields one campaign; a payload for an unknown entity is refused; after OPEN a changed `planned_loss` is refused and logged.

**Depends on:** KM-211.

#### KM-213 — [v10-M2] `/campaigns` page

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** TRADE RECORDS nav entry; virtualized table (code, status, class, underlying, opened, budget $, budget used %, realized P&L, R, exit reason, source) with sorting/filtering/tiers; row detail sheet with the Appendix B record grouped as Identity / Thesis / Entry / Risk / Exit plan / Portfolio checks / Entry-time context / Lifecycle; create and edit forms for manual campaigns (source `MANUAL`); close form with exit reason and post-trade note; event timeline.

**Acceptance.** Loading/empty/populated states; a manual campaign can be created, opened (budget frozen), linked and closed from the UI; phone tier shows code, underlying, budget used, status.

**Depends on:** KM-211.

#### KM-214 — [v10-M2] Execution linkage: suggestions, manual links, rolls, coverage

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.**
1. Suggestion engine: for a PLANNED campaign with a `recId`, reuse the plan-vs-actual join (ticker, strike, expiration, entry window) to propose OPEN links; for OPEN campaigns, propose later executions on the same `instrumentKey`/`spreadGroupId` as ADD / PARTIAL_EXIT / EXIT / ROLL pairs; broker order ids from K5 win when present.
2. Link/unlink UI on the campaign detail and on the executions table (row action "Link to campaign").
3. Coverage check: `GET /api/campaigns/coverage` counts LIVE corporate opening executions since the mandate's effective date without a campaign link; surfaced in D6 and Diagnostics.

**Acceptance.** Suggestions are never auto-applied without confirmation unless K5 order ids match exactly; coverage count is correct on fixtures; unlinking restores the count.

**Depends on:** KM-211, KM-213.

#### KM-215 — [v10-M2] Campaign Budgets widget (D6) and Aggregate Planned Loss KPI

**Type:** feat | **Priority:** P0 | **Effort:** M

**Deliverables.** Widget per §6.1 D6 using the scope gate; aggregate planned loss vs 6% of current B with a status chip (limit from the mandate version; shadow label when DRAFT); coverage gap line; KPI **Aggregate Planned Loss % of B**.

**Acceptance.** Sum, ratio and status match the engine's later computation (shared module); mixed scope refused; help text present.

**Depends on:** KM-211, KM-202, KM-203.

#### KM-216 — [v10-M2] Review Due widget (D8), Today banner, positions columns

**Type:** feat | **Priority:** P1 | **Effort:** M

**Deliverables.** Triggers from the mandate `standards` (Appendix A) evaluated on open positions and campaigns: DTE thresholds per class, campaign `reviewDate`/`reviewDte`, LEAPS under 12 months, verticals past midpoint; list sorted by urgency with the rule that fired; Today page shows the list under the queue; Open Positions gains Campaign and DTE-rule columns.

**Acceptance.** Fixture with a swing call at 18 DTE appears with "swing: close/reduce/roll before 20 DTE"; positions without a campaign are still evaluated by structure with a "no campaign" note.

**Depends on:** KM-201, KM-211.

### Phase M3 — Exposure engine and Compliance Board (`[v10-M3]`, ≈ 8–10 dev days)

#### KM-221 — [v10-M3] Persist option delta and underlying price in position snapshots

**Type:** feat | **Priority:** P0 | **Effort:** M

**Deliverables.** `PositionSnapshotOpenPosition` gains `delta`, `theta`, `iv`, `dte`, `underlyingPrice`, `deltaSource`; the quote path already parses delta — carry it through `getOptionQuotesBatch`; Black–Scholes fallback (`src/lib/positions/model-delta.ts`) when the provider omits delta but mark, strike, DTE and IV exist; equity `delta = 1`, `deltaSource = ASSUMED`; Open Positions table shows Delta and Delta-equivalent $ (tier 2 columns).

**Acceptance.** Snapshot JSON round-trips the new fields; older snapshots still parse; model delta within 0.02 of provider delta on a fixture chain; `deltaSource` visible in the row detail.

**Depends on:** nothing. **Blocks:** KM-231.

#### KM-222 — [v10-M3] Symbol reference: asset type, inverse/leverage, sector

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** Prisma `SymbolReference` (§8.4); population job in the nightly pipeline for every symbol held or traded (source: viewer V6 or a second MCP endpoint for ticker details; name heuristics for inverse/leveraged ETFs flagged for review); manual override on `/mandate` (or Adjustments) with reason; sector via the SIC map (the KB's 11-sector table vendored as data, with its version); classification helpers `isCashEquivalent`, `isInverseEtf`, `isLeveraged`, `sectorOf`.

**Acceptance.** SNSXX/SPAXX classify as cash equivalents; an inverse ETF (e.g. SH) flags `isInverse`; a leveraged ETF flags `leverageFactor > 1`; unknown symbols report `UNKNOWN` and appear in Diagnostics.

**Depends on:** V6 (or MCP config). **Blocks:** KM-223, KM-224, KM-231.

#### KM-223 — [v10-M3] Concentration and assignment metrics

**Type:** feat | **Priority:** P0 | **Effort:** M

**Deliverables.** `src/lib/compliance/metrics/concentration.ts` per §9.4: long stock MV aggregate and per issuer; short-put assignment notional aggregate and per issuer (including shares held); inputs from the priced snapshot and `SymbolReference`; unit tests on fixtures including a covered call, a cash-secured put on a held name, and a money-market position (excluded).

**Acceptance.** Values match hand-computed fixtures; issuer rows carry both measures; missing marks produce `UNKNOWN` with the affected symbols listed.

**Depends on:** KM-222.

#### KM-224 — [v10-M3] Premium at risk, hedge and prohibited-structure metrics

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** `premium-at-risk.ts` per §9.5 (long options current value, debit spreads current net, credit spreads max defined loss, grouped by `spreadGroupId` and campaign); `hedges.ts` (campaign class HEDGE, else heuristic with `HEURISTIC` flag; hedge option value vs 3%, inverse-ETF cost basis vs 15%); `prohibited.ts` (uncovered short calls, short stock, ≤1 DTE opens, non-listed asset classes) producing BLOCK rows with the offending positions; Fidelity verticals need #377 for grouping and are flagged `UNGROUPED` until linked.

**Acceptance.** Fixture set with a credit vertical, a naked-looking short call that is covered by shares, a true uncovered short call, and an inverse ETF produce the expected metrics and one prohibited-structure BLOCK.

**Depends on:** KM-222, KM-211 (class), #377.

#### KM-231 — [v10-M3] Compliance engine, snapshot persistence and nightly stage

**Type:** feat | **Priority:** P0 | **Effort:** XL

**Deliverables.**
1. Prisma `ComplianceSnapshot` (§8.5) — moved here from M4 because the Board needs history from day one.
2. `src/lib/compliance/evaluate.ts`: given entity, environment, as-of, mandate version, B, the priced snapshot, campaigns, symbol reference and (when present) balances, produce the metric array (§9.3–§9.5, §9.8) with statuses (§9.9), `overallStatus`, provenance and missing inputs. Margin, daily loss and drawdown rows are emitted as `UNKNOWN` until M4 fills them.
3. Triggers: a `compliance` stage appended to the scheduled market-data pipeline (after values), `POST /api/compliance/compute` (manual, and fired after import commit like the position snapshot), and `GET /api/compliance/latest?legalEntity&environment`, `GET /api/compliance/history`.
4. Scheduler status and Diagnostics show the stage; alerts reuse `PipelineAlertState` for a failed stage.

**Acceptance.**
- [ ] A snapshot for the corporate LIVE scope persists every §4 metric with value, limit, ratio, status and inputs; DRAFT mandate → `shadow: true`.
- [ ] Two consecutive computes with unchanged data produce identical metrics (determinism test).
- [ ] The nightly run writes one snapshot per entity/environment; failures surface in `/api/scheduler/status`.

**Depends on:** KM-201–KM-203, KM-211, KM-221–KM-224. **Blocks:** KM-232, KM-233, KM-242, KM-244, KM-248.

#### KM-232 — [v10-M3] Mandate Compliance Board widget (D1) and compliance KPIs

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** Widget per §6.1 D1 (one row per limit, utilization bar, status chip with the word, as-of, missing-input note, drill-through to the offending positions or campaigns); KPI registry entries **Net Directional % of B**, **Gross Bullish % of B**, **Open Breaches** (0 until M4), header shows mandate version and shadow label; default dashboard layout updated per §7.1 (M3 subset).

**Acceptance.** Board rows equal the latest snapshot; clicking a row opens the contributing positions; refusal state on mixed scope; phone tier shows limit, bar and status only.

**Depends on:** KM-231, KM-203.

#### KM-233 — [v10-M3] Exposure widgets: Directional (D3), Concentration (D4), Premium at Risk (D5)

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** Three widgets reading the exposure blocks of the latest snapshot; per-underlying bars (categorical colours by campaign class), issuer table with both concentration measures, premium table by structure; each with help text and drill-through to positions.

**Acceptance.** Sums on the widgets equal the Board's rows; mixed scope refused; symbol links present.

**Depends on:** KM-231, KM-232.

### Phase M4 — Margin, drawdown, risk state and breach history (`[v10-M4]`, ≈ 8–10 dev days)

#### KM-241 — [v10-M4] Broker balance snapshots and Margin & Capital widget (D7)

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** Prisma `BrokerBalanceSnapshot` (§8.5); Schwab source through the MCP account tools (S1) in the nightly pipeline and on manual refresh; statement source: extend `parseThinkorswimAccountSummary` to persist `Stock Buying Power` / `Option Buying Power` on the statement date; manual source: form on `/mandate` (per account, per date, with note); `GET /api/broker-balances/latest`; widget per §6.1 D7 with source and as-of per account.

**Acceptance.** With S1 enabled, maintenance requirement and buying power populate for the Schwab accounts; without it, the statement path fills buying power and the widget shows "maintenance requirement: not available from statement — enter manually or enable Schwab account tools"; Fidelity rows show manual-only.

**Depends on:** S1 (or fallback). **Blocks:** KM-242.

#### KM-242 — [v10-M4] Margin metric in the engine

**Type:** feat | **Priority:** P0 | **Effort:** S

**Deliverables.** `margin.ts` per §9.6, per account and aggregate, `UNKNOWN` when the requirement is missing; margin-call flag from `isInCall` raises `riskState` to RISK_REDUCING_ONLY.

**Acceptance.** Fixture balances produce the expected ratios; missing requirement yields UNKNOWN with the next action; an `isInCall` balance sets the state.

**Depends on:** KM-231, KM-241.

#### KM-243 — [v10-M4] Stress estimate (±10% / ±20%)

**Type:** feat | **Priority:** P2 | **Effort:** L

**Deliverables.** Reprice open positions under underlying shocks using delta and gamma (gamma from the chain when available, else finite-difference on the model), sum P&L and an approximate maintenance change, label as an estimate; shown in D7 and returned by the pre-trade check.

**Acceptance.** For a long-call fixture the −10% scenario loss is bounded by premium; the widget marks the estimate's method and coverage.

**Depends on:** KM-221, KM-241.

#### KM-244 — [v10-M4] Flow-adjusted NAV index, daily loss, drawdown tiers, risk state (D2)

**Type:** feat | **Priority:** P0 | **Effort:** XL

**Deliverables.**
1. `src/lib/analysis/nav-index.ts` per §9.7 from `AccountValueSnapshot` / daily broker snapshots and classified external flows; `GET /api/analysis/nav-index?legalEntity&environment&from&to` (series with NAV, flows, index, HWM, drawdown).
2. Engine rows: daily loss, drawdown tier; `riskState` resolver (max of daily-loss, tier, margin-call, uncured breach, suspension) with tier-1's "half sizing" propagated to campaign class limits.
3. Widget D2 per §6.1; KPIs **Risk State**, **Drawdown % (flow-adjusted)**, **Daily P&L % of NAV**; the existing Max Drawdown KPI re-labelled "raw NLV drawdown".
4. `docs/metrics_calcs.md` documents the index and tier rules.

**Acceptance.**
- [ ] A contribution on a flat day produces zero return and no HWM jump; a withdrawal produces no drawdown (fixture series).
- [ ] Tier thresholds from the mandate version drive the state; a DRAFT version labels the state as shadow.
- [ ] The risk state headline changes when a −2.5% day is injected in a fixture.

**Depends on:** KM-202, KM-231. **Blocks:** KM-245, KM-248, KM-261.

#### KM-245 — [v10-M4] Compliance events: breaches, cures, exceptions, approvals (D9) and alerts

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** Prisma `ComplianceEvent` (§8.5); automatic BREACH open on PASS/WARN→BLOCK transitions and cure on return to PASS, with the operator's corrective-action note editable; manual EXCEPTION / RESTART_APPROVAL / SUSPENSION / NOTE entries with `approvalRef` and the approver identity (Cloudflare Access email); `GET/POST /api/compliance/events`; widget D9; the pipeline alert webhook sends a breach notice once per breach key (reuse `PipelineAlertState` dedupe); KPI **Open Breaches**.

**Acceptance.** A fixture transition creates one BREACH, the next PASS cures it, no duplicate alerts; an EXCEPTION requires an approval reference; the Board links each BLOCK row to its open event.

**Depends on:** KM-231, KM-244.

#### KM-246 — [v10-M4] `/mandate` history: snapshots and events

**Type:** feat | **Priority:** P1 | **Effort:** M

**Deliverables.** Compliance snapshot history table (date, version, overall status, risk state, drawdown, key ratios) with a detail sheet showing the full metric array; events tab; CSV export of both (KM-116 pattern).

**Acceptance.** History renders the nightly snapshots; filters by date and status; export matches the table.

**Depends on:** KM-231, KM-245.

#### KM-247 — [v10-M4] Prohibited-instrument and out-of-mandate positions on Diagnostics

**Type:** feat | **Priority:** P1 | **Effort:** S

**Deliverables.** Diagnostics section listing positions the engine classified as prohibited or unclassifiable (unknown symbol reference, ungrouped Fidelity spreads, the corporate money-market position's treatment); case-file links.

**Acceptance.** The fixture uncovered short call appears with its BLOCK; an unknown symbol appears with "classify on /mandate".

**Depends on:** KM-224, KM-231.

#### KM-248 — [v10-M4] Pre-trade check endpoint for the KB (K3)

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** `POST /api/compliance/pretrade` per §10.1 K3: overlay proposed legs on the latest snapshot (delta from the chain via the existing quote path, notional from strikes, premium from the proposal price), recompute the affected metrics, return per-limit projected status, the risk state, and the campaign-class budget check; bearer auth; documented sample in `docs/`.

**Acceptance.** A proposal that would push gross bullish over 150% of B returns BLOCK on that row and PASS elsewhere; a proposal while SUSPENDED returns BLOCK with reason `RISK_STATE`; response time under 2 s on production-sized data (no full recompute — overlay only).

**Depends on:** KM-231, KM-244.

### Phase M5 — Market context (`[v10-M5]`, ≈ 4–5 dev days in Tradelog; viewer work separate)

#### KM-251 — [v10-M5] Ingest Market and Sector Tide from the viewer

**Type:** feat | **Priority:** P1 | **Effort:** M

**Deliverables.** Prisma `MarketContextSnapshot` (§8.6); nightly stage calling `GET /api/market-context/daily` (V5) with `VIEWER_API_URL` / `VIEWER_API_TOKEN` (optional env, graceful `unavailable` like MCP); until V2/V5 exist, an interim adapter reads `GET /api/forward-log/status.breadth` and stores it labelled `universe: WATCHLIST_POOLED` so the tile can say "watchlist participation, not market breadth".

**Acceptance.** One row per date per universe; missing days do not fail the pipeline; provenance visible.

**Depends on:** V5 (interim: none).

#### KM-253 — [v10-M5] Market Context (D10) and Alignment (D11) widgets

**Type:** feat | **Priority:** P1 | **Effort:** L

**Deliverables.** D10 tile: three measures with 1/5/10-session deltas, sector strip (11 sectors, `--pos-dim`/`--neg-dim`/neutral by band with the word), "context, not a rule" caption, universe and as-of; D11: per open campaign the market, sector and stock state (stock state from the campaign's stamped entry context and, when fresh, the latest viewer panel row if available) shown as components, no composite score.

**Acceptance.** Interim watchlist data renders with the honest label; the tile never colours a PASS/WARN/BLOCK; sector unknown → "unclassified" not blank.

**Depends on:** KM-251, KM-222.

#### KM-254 — [v10-M5] Stamp market context on campaigns; forward-log export

**Type:** feat | **Priority:** P1 | **Effort:** M

**Deliverables.** On campaign OPEN and CLOSE, copy the latest `MarketContextSnapshot` (market and the campaign's sector) into `marketContextAtOpen/AtClose`; `GET /api/campaigns/export?format=csv` with outcomes, R, exit reason, entry context keys and market context for study use (S006's successor).

**Acceptance.** A campaign opened on a date with a snapshot carries it; export columns documented; export refuses mixed scope.

**Depends on:** KM-211, KM-251.

#### KM-255 — [v10-M5] Positioning Pressure gauge

**Type:** feat | **Priority:** P2 | **Effort:** M

**Deliverables.** Ingest V4's components and composite into `MarketContextSnapshot.positioningPressure`; gauge in D10 with the component list (value, percentile, as-of), the method version and an "unvalidated" label; never feeds compliance.

**Acceptance.** Gauge renders only when components exist; each component shows its source; label present.

**Depends on:** V4, KM-251.

### Phase M6 — Reporting for the CEO/CFO (`[v10-M6]`, ≈ 8–10 dev days)

#### KM-261 — [v10-M6] Weekly report page and export (§8 weekly record)

**Type:** feat | **Priority:** P1 | **Effort:** L

**Deliverables.** `/mandate/weekly?week=` printable page and Markdown export: NAV and P&L (week, MTD, YTD, flow-adjusted), drawdown state and risk state, principal directional / assignment / margin exposures, material concentrations, open breaches and exceptions, campaigns opened/closed with R, mandate version; generated from compliance snapshots and campaigns so the record is reproducible for any past week; "send" is out of scope (copy/download only).

**Acceptance.** A past week renders from history without recomputation; export is deterministic; the CEO preset (§7.2) links to it.

**Depends on:** KM-231, KM-244, KM-245.

#### KM-262 — [v10-M6] Monthly and quarterly review export (§8)

**Type:** feat | **Priority:** P1 | **Effort:** M

**Deliverables.** Performance by strategy class and by campaign, material losses (campaigns beyond budget), exceptions, hedge effectiveness summary, portfolio vs QQQ and SPY over the period; Markdown/CSV export.

**Acceptance.** Period totals reconcile to the analytics KPIs for the same range; export deterministic.

**Depends on:** KM-263, KM-264, KM-265.

#### KM-263 — [v10-M6] Benchmark bars and Benchmark Comparison widget (A5)

**Type:** feat | **Priority:** P1 | **Effort:** M

**Deliverables.** `BENCHMARK_SYMBOLS=QQQ,SPY` added to the equity marks ingestion (always ingested regardless of holdings); A5 widget: indexed lines (portfolio NAV index from KM-244 vs QQQ vs SPY, base 100 at range start), period table MTD/QTD/YTD/1Y/range; KPIs **vs QQQ** and **vs SPY** (difference in period return, percentage points).

**Acceptance.** Benchmarks ingest nightly; missing benchmark days interpolate visibly (dashed) and are counted; KPI signs correct on a fixture.

**Depends on:** KM-244.

#### KM-264 — [v10-M6] Performance by Strategy vs Standard (A3)

**Type:** feat | **Priority:** P1 | **Effort:** M

**Deliverables.** `GET /api/analysis/strategy-performance`: per strategy class (campaign class when linked, else inferred setup tag mapped to a class) count, win rate, expectancy, average return %, average entry DTE, average exit DTE, share inside the Appendix A window; widget with the standard shown beside each measure.

**Acceptance.** A fixture swing call opened at 60 DTE and closed at 15 DTE counts as outside standard on exit; unlinked setups map by tag with a "inferred" marker.

**Depends on:** KM-204, KM-201.

#### KM-265 — [v10-M6] Campaign Outcomes (A4), Hedge Effectiveness (A6), Excursion vs Plan (A7)

**Type:** feat | **Priority:** P1 | **Effort:** L

**Deliverables.** A4 table and scatter (R vs hold days, colour by exit reason); A6 hedge cost % of B per period, hedge P&L inside drawdown windows (from the NAV index), coverage ratio over time; A7 overlays profit target and invalidation on the MFE/MAE widget for campaign-linked lots and reports "target reached before invalidation" rates.

**Acceptance.** Fixtures with two closed campaigns and one hedge produce the expected R, coverage and overlay; help text present.

**Depends on:** KM-211, KM-244.

#### KM-266 — [v10-M6] Layout presets: CTO daily, CEO weekly, Performance review

**Type:** feat | **Priority:** P2 | **Effort:** M

**Deliverables.** Named presets for dashboard and analytics (§7.1–§7.3) in the registries; preset switcher in edit mode; profile leaf `dashboard.preset` / `analytics.preset`; "Reset to preset" alongside "Reset to app defaults" (revives KM-117 in the profile era).

**Acceptance.** Switching presets replaces the layout; customizing after a switch marks the layout as modified; reset restores the preset.

**Depends on:** KM-206, KM-232, KM-263.

### Phase MB — Broker API sync for the corporate account (`[v10-MB]`, ≈ 6–8 dev days; runs after M0, before M4)

**Decisions recorded 2026-09-12:** compliance is scoped to the corporate LIVE account; both shareholders approve hard-limit changes; balance polling is nightly plus a refresh button. The operator also wants to stop importing by CSV anything the Schwab API can supply.

**What the API supplies (verified live 2026-09-12 through Tradelog's `MCP_SERVER_URL`).** One linked account (the corporate margin account). `get_accounts` returns current balances (NLV, equity, cash, money-market value, maintenance requirement, calls, buying power, SMA). `get_accounts_with_positions` returns holdings with quantity, average price, market value, per-position maintenance requirement and open P&L. `get_transactions` returns up to one year of activity by type: `TRADE` (with `positionEffect` OPENING/CLOSING, per-item `amount`, `cost`, `price`, and for equities/options the instrument block with `putCall`, `underlyingSymbol`, `strikePrice`, `expirationDate`, plus fee items by `feeType`), `RECEIVE_AND_DELIVER` (money-market reinvestment legs), `DIVIDEND_OR_INTEREST`, `WIRE_IN`, `JOURNAL` (bank sweep). Equity and option `TRADE` shapes are documented but unverified on this account because it has not traded securities yet. Six type queries (`ACH_*`, `CASH_*`, `ELECTRONIC_FUND`, `WIRE_OUT`, `MEMORANDUM`, `MARGIN_CALL`, `MONEY_MARKET`, `SMA_ADJUSTMENT`) returned an empty body rather than `[]`; the MCP should normalize that (cross-repo S3). Date arguments must be `YYYY-MM-DD`.

**What the API does not supply.** Historical daily balances (only the current snapshot, so the daily series is built by polling from the cutover date onward), anything older than one year, the thinkorswim paper accounts, and Fidelity. Those stay on CSV.

#### KM-271 — [v10-MB] `SCHWAB_API` broker source and account link

**Type:** feat | **Priority:** P0 | **Effort:** M

**Deliverables.** `Broker` enum gains `SCHWAB_API`; `Account` gains `apiAccountHash` (from `get_account_numbers`) and `apiSyncEnabled`; the Accounts page links a Schwab API account to the existing corporate `Account` row (the account number must match the statement's, otherwise refused); server-side client methods in `src/lib/mcp/schwab-account.ts` wrapping the six account tools with the existing `McpUnavailableError` degradation; `.env.example` unchanged (same `MCP_SERVER_URL`).

**Acceptance.** Linking succeeds only for the matching account number; with the MCP down, every sync reports `unavailable` and nothing is written.

#### KM-272 — [v10-MB] Balance and position sync (nightly stage + refresh button)

**Type:** feat | **Priority:** P0 | **Effort:** L

**Deliverables.** `BrokerBalanceSnapshot` (§8.5) written from `get_accounts` with `source: SCHWAB_API`; `DailyAccountSnapshot` upserted for the trading date with broker NLV and total cash (the API becomes the daily-snapshot producer for this account, replacing the statement's Account Summary); broker positions stored as `BrokerPositionSnapshot` rows (symbol, asset type, option fields, quantity, average price, market value, maintenance) for reconciliation against Tradelog's reconstructed open positions (difference surfaced on Diagnostics and the Reconciliation widget); a `broker-sync` stage in the nightly pipeline; `POST /api/broker-sync/refresh` behind a Refresh button on Open Positions and the Margin widget; last-sync time shown wherever the data is used.

**Acceptance.** After a sync, the Margin widget shows maintenance % of NAV with source `SCHWAB_API` and an as-of; the daily snapshot for the date exists; a position present at the broker but absent in Tradelog (or vice versa) raises a diagnostics warning with the symbol.

#### KM-273 — [v10-MB] Transaction sync adapter (executions, cash events, fees)

**Type:** feat | **Priority:** P0 | **Effort:** XL

**Deliverables.** A new adapter under `src/lib/adapters/schwab-api/` that maps API activities to the existing normalized model: `TRADE` items → executions (one per leg, `spreadGroupId` = the activity's `orderId` when several legs share it, `openingClosingEffect` from `positionEffect`, fees from fee items summed per leg, `brokerRefNumber` = `orderId` so the dedupe id matches statement rows that carried the same reference), `RECEIVE_AND_DELIVER` + `DIVIDEND_OR_INTEREST` on a money-market fund → the same synthesized reinvestment the CSV path produces (par-priced), `WIRE_IN`/`WIRE_OUT`/`ELECTRONIC_FUND`/`ACH_*` → `TRANSFER_IN`/`TRANSFER_OUT` cash events, `JOURNAL` sweeps → internal cash-equivalent rows, dividends/interest → `DIVIDEND`; unknown types → `SCHWAB_API_UNHANDLED_TYPE` warning, never dropped. Each sync is recorded as an `Import` row (`broker: SCHWAB_API`, `filename` = the date window, `sourceFileText` = the raw JSON) so replay, delete and the existing commit pipeline (ledger rebuild, setup rebuild, snapshot compute) work unchanged. Sync window: from the account's `apiSyncCursor` (last synced activity time minus a two-day overlap) to tomorrow; overlap rows dedupe on `brokerTxId`.

**Acceptance.** A recorded API fixture (captured JSON with equity, single option, vertical, assignment, wire, dividend, sweep) round-trips to the same executions, cash events and warnings as the equivalent statement CSV fixture, lot for lot; re-running the sync inserts nothing new; the unhandled-type warning fires on an unknown type.

#### KM-274 — [v10-MB] Cutover and overlap reconciliation

**Type:** feat | **Priority:** P0 | **Effort:** M

**Deliverables.** Per-account `csvHistoryThrough` date (the last committed statement date); the API sync starts at that date; a one-time overlap report lists activities the API returned inside the CSV era that did not dedupe (timestamp or reference mismatch) for operator review; the Imports page shows the account as "API-synced since <date>" and warns when a CSV is uploaded for an API-synced period.

**Acceptance.** For the corporate account the overlap report is empty or fully explained before `apiSyncEnabled` is set; a CSV upload for a post-cutover window is refused with the reason.

#### KM-275 — [v10-MB] Sync health on Diagnostics and alerts

**Type:** feat | **Priority:** P1 | **Effort:** S

**Deliverables.** Scheduler status shows the broker-sync stage; Diagnostics shows last successful sync, cursor date, token health (the MCP's `/readyz` and a lapsed-token signature), and the position reconciliation delta; the pipeline alert webhook fires once when a sync fails on two consecutive nights.

**Acceptance.** A simulated MCP outage produces a single alert and leaves prior data intact.

**Cross-repo (Schwab MCP).** S3: return `[]` instead of an empty body for transaction types with no activity; S4: expose `get_orders` read-only (order status, fills, timestamps) so KM-214's execution linkage can use broker order ids; S5: keep the weekly token renewal documented and monitored, since every balance becomes UNKNOWN when it lapses.

---

## 12. Open questions for the CTO and CEO

Decisions received 2026-09-12: compliance is corporate LIVE only (questions 1 and 8 of the earlier list are settled in that direction); both shareholders approve hard-limit changes (question 9); balance polling is nightly plus a refresh button (question 6 leans close-to-close).

1. **Mandate status.** Load v5 DRAFT r5 now in shadow mode (widgets labelled "draft mandate") so monitoring starts before signature, and mark APPROVED on the second signature?
2. **Reserve schedule.** Who enters it, at what cadence, and are reserves held inside the corporate brokerage accounts (the SNSXX position) or outside NAV? The answer decides whether B subtracts a schedule amount or excludes a position.
3. **Histogram defaults.** Cutoffs at ±10% (the CEO suspects higher is right), target mix 30/40/30, controlled-loss line at −30% of investment; unit = setup until campaigns exist; short puts measured on assignment notional. Confirm or change before KM-205 ships.
4. **Hedge recognition.** Campaign class only (strict, needs a record for every hedge) or heuristics allowed with a flag (index/ETF puts, inverse ETFs, VIX calls)?
5. **Aggregate planned loss denominator.** Current B (the roadmap's choice) or B at each campaign's open?
6. **Daily loss measurement.** Prior close NAV to the latest intraday snapshot, or close-to-close only (nightly)? Intraday needs a compute during the session.
7. **KB alignment.** Should the KB's sizing denominator become B (K2), and should the KB compute `planned_loss` from stop × quantity in the ticket (K1) or leave it to the operator at campaign open?
8. **Schwab account scope.** Can the Schwab developer app be granted account scopes (S1)? If not, margin is statement + manual only, and the 30% NAV limit is monitored with a lag.
9. **Approvals in the app.** Exceptions and restarts record an approver identity string and a reference; there is no role enforcement today. Is that sufficient for the Shareholders' Agreement, or do we need distinct CTO/CEO roles?
10. **Massive/Polygon terms.** Confirm the subscription permits displaying derived breadth aggregates inside the authenticated app before M5 tiles ship.
11. **Beta adjustment.** The mandate says delta-equivalent; the roadmap does not beta-adjust equities. Confirm.
12. **Fidelity spreads.** #377 (manual spread link) is a prerequisite for correct premium-at-risk on the Fidelity account; schedule it before M3.

---

## Appendix A — Playbook clause to story traceability

| Clause | Stories |
|---|---|
| §2 Trading Base, reserves | KM-201, KM-202, K2 |
| §3 Authorized / prohibited | KM-222, KM-224, KM-247 |
| §4 Planned campaign loss; aggregate 6% | KM-211, KM-215, KM-231 |
| §4 Purchased options 20%; hedges 3% / 15% | KM-224, KM-231, KM-233 |
| §4 Stock 40% / 10%; assignment 45% / 20% | KM-223, KM-231, KM-233 |
| §4 Directional 150% / 0–100% | KM-221, KM-231, KM-233 |
| §4 Margin 30% NAV | KM-241, KM-242, S1 |
| §5 Trade record before entry; rolls; restarts | KM-211–KM-214, K1, K4, K5 |
| §6 Margin pre-checks; margin call | KM-242, KM-243, KM-248, K3 |
| §7 Daily loss; drawdown tiers; breach → cure | KM-244, KM-245 |
| §8 Daily record | KM-216 |
| §8 Weekly record | KM-261, KM-266 |
| §8 Monthly/quarterly; vs QQQ/SPY; hedge effectiveness | KM-262–KM-265 |
| §8 System ownership | K1–K6, S1 |
| §9 Governance, exceptions | KM-245, KM-246 |
| App. A standards | KM-201, KM-216, KM-264 |
| App. B minimum record | KM-211, KM-213, K1 |
| CEO: distribution widget | KM-204, KM-205, KM-207 |
| CEO: breadth and fear gauge | KM-251–KM-255, V1–V6 |
| CEO: "what the widgets tell you" | §6, §7, KM-266 |
