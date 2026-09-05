# To Design — 260905: one filter panel, symbol links everywhere, brand assets

**From:** the Tradelog session (theme owner), consolidating for the operator.
**Covers:** Tradelog, Screener (kapman-polygon-viewer), Fair Value (kapman-fair-value-tool).
**Read with:** `design/README.md` ("Set filters: one meaning for a click", "App icons"),
`design/OPEN-WITH-DESIGN.md` (this batch carries the QUEUED table), Amendment 03 (decisions 48–56).

This is the reverse of the 260830 bundle: the operator asking Design for
specification, not Design handing the repos issues. Two requests, one ruling
to record, an inventory of the week, and a governance proposal.

---

## 1. Request A — the Kapman column filter panel

### The operator's brief, verbatim in substance

> The filter controls behave differently in each app. Fair Value only has a
> search bar; the Screener has checklists. I want a more functional filter tool
> that behaves the same in all three. If dates are available I want to pick
> specific dates or a date range. If dollar figures are available, specific
> dollars or ranges. If it is a list — tickers, option type — individual items.
> Search on all of them. Sort ascending, descending, or clear on all of them.

### What ships today (audited 2026-09-05 against code)

| Capability | Tradelog (`ColumnFilterPanel`) | Screener (AG Grid Community + `SetFilter`) | Fair Value (AG Grid Community) |
|---|---|---|---|
| Sort asc / desc / clear in the panel | Yes | No — header click only | No — header click only |
| Search inside the panel | Yes (set columns) | Yes | Set columns yes; numeric columns no |
| Set picker (checklist) | Yes, 82 columns | Yes, every column | Yes, text/notes columns (ported `SetFilter`) |
| Number: pick exact values | Via the checklist when discrete | Via the checklist | AG native "Equals" popover — **AG's own look, not the theme** |
| Number: from–to range | Yes (UI-2), 32 columns | **No** | AG native "In range" condition — not the theme |
| Date: pick specific dates | Checklist of ISO strings (see screenshot: 2024-01-05, 2024-01-12 …) | Checklist | n/a — no date columns today |
| Date: from–to range | **No** — 10 date-sorted columns, none rangeable | **No** | n/a |
| Commit model | Nothing checked → click adds → **Apply** commits, Esc reverts (ruling 58) | Same (ruling 58) | Same for `SetFilter`; AG native filters commit **per keystroke** |
| Active-filter indicator in the header | Filled icon + count badge | AG filter icon | AG filter icon |
| Persisted shape | filter-model v2 `{values[], range{from,to}, direction}` | `SavedView.filters` `Record<string,string[]>` + `rangeFilters` sibling (decision 48) **with a Python twin** in `export_pass1.py` | AG model `{values}` / native number model, in the profile document |
| Ticker column filterable | Yes | Yes (pinned, with link) | **No** — 76px pinned column cannot host a filter button (QUEUED note) |

Three panels, three looks, and Fair Value's numeric columns surface a
component that is not ours. Ruling 58 aligned what a click *means*; nothing
yet aligns what the panel *is*.

### The requirement, stated as acceptance

One panel, specified once in the Component Reference, implemented in each stack
(Tradelog's own table; a custom AG filter component in both AG apps), such that:

1. **Every filterable column** opens the same panel: **Sort** (Asc · Desc · Clear) when
   the column is sortable, **Search** always, then a **value picker by column type**.
2. **Set columns** (ticker, side, option type, regime, disposition, entity …): the
   checklist with All / None and a `n/m` count. Ruling-58 semantics stay exactly as ruled.
3. **Number and currency columns**: pick **exact values** from the distinct list *or* a
   **from–to range**, in the column's own format (`$`, `%`, contracts).
4. **Date columns**: pick **specific dates** *or* a **from–to range**. Tradelog already has
   a range vocabulary (7d · 30d · YTD · 1yr · 3yr · Kapman start · All); the panel may
   offer the same presets.
5. **Commit on Apply, never per keystroke or toggle; Escape reverts; Clear removes
   the column's filter outright.** Keyboard: Enter commits, Escape reverts, Tab order
   Sort → Search → picker → Clear → Apply.
6. **Same active-state indicator** in every header: filled filter glyph plus a count
   (`3`) for sets, a range glyph or `a–b` for ranges.
7. **Below 768px** the panel is the sheet the ladder already specifies; **768–1024**
   coarse-pointer rows take `--row-h-touch`.
8. **AG Grid Community only** in the two AG apps — no Enterprise set filter, no
   native number/date filter UI. Already true for sets; Fair Value's numeric columns
   must move onto the shared panel.

### Decisions we need from Design

- **D-A1 Anatomy when a column offers both exact and range.** Two stacked sections
  with "either is in force, not both"? A two-tab picker (Values | Range)? A single
  section where typing `>500` or `500–800` in the search box becomes a range? The
  Screener's operator habit is fast keyboard filtering; Tradelog's is checklists.
- **D-A2 Range input format.** Two inputs with the column's unit prefix, or one
  input accepting `from–to`? Date ranges: two date inputs, presets, or both? Is the
  Tradelog preset vocabulary the family vocabulary?
- **D-A3 Header active state.** One glyph for "filtered", or does the glyph encode
  set vs range? Where does the count sit at 30px row height and in a 76px pinned column
  (Fair Value's ticker column has no room today — QUEUED note)?
- **D-A4 Panel placement and size.** Tradelog positions the panel to stay on screen
  (`panel-position.ts`) and reserves height by section (72 sort + 144 set + 64 chrome);
  AG apps anchor under the header. One rule?
- **D-A5 Touch and mobile.** Sheet below 768 (already in the ladder) — confirm the
  panel becomes the sheet's body unchanged, and the 44px floor applies to checklist rows.

### Engineering notes the spec should not contradict

- The **persisted filter shape** is a contract, not styling. Tradelog's filter-model v2
  already carries `values`, `range`, `direction`. The Screener's `SavedView.filters` has
  a Python twin pinned by a parity harness; **decision 48** ruled that new filter kinds
  land as **additive sibling keys** (`rangeFilters`) the twin can ignore until it
  learns them, with export refusing loudly meanwhile. A date range will follow the same
  pattern. Engineering will publish **one JSON filter contract** for the three apps once
  the panel is specified; please don't specify the model, only the UI.
- **Saved views filter at the data layer** in the Screener, before the grid sees the
  data (QUEUED, #109). The panel shows what is committed on the visible cohort; the
  view's own filters show as locked chips (`VIEW · Bias 1 · PT Scenario 1 · Regime 3`).
  That two-level display is worth a line in the spec so nobody removes it.
- **Ruling 58's reopen case** (README) stays: reopening a committed filter shows the
  committed set checked; "nothing checked" is the unfiltered state.

---

## 2. Request B — every symbol is a Barchart link

### What ships today

The Screener renders every ticker through `SymbolLink` (`frontend/src/components/SymbolLink.tsx`):

```
https://www.barchart.com/stocks/quotes/<SYMBOL>/interactive-chart
target="_blank"  rel="noopener noreferrer"  onClick stopPropagation  class="sym-link"
```

It is the grid's `cellRenderer` for the pinned symbol column and is reused in the
Forward Log. Tradelog renders **seven** symbol surfaces as plain text (executions
Symbol, matched lots Symbol, setups Underlying, positions Symbol, adjustments Symbol,
recommendations Ticker, Today Ticker). Fair Value renders the ticker as plain mono
text in the score card, allocation, intrinsic and category grids.

### The requirement

Wherever a ticker or underlying symbol appears in any Kapman app, it is a link that
opens the Barchart interactive chart for that symbol in a new tab, without
triggering the row's own action (selection, detail sheet, remove). Options rows link
the **underlying**. Keyboard reachable; accessible name "Open NVDA chart on Barchart".

### Decisions we need from Design

- **D-B1 The primitive.** A `.km-sym-link` in `kapman-ui.css`: colour (accent? or text
  with an underline-on-hover so a 200-row grid does not read as a wall of links), focus
  ring per §02, external-link affordance yes/no, touch target inside a 30px row.
- **D-B2 Scope rule.** "Every symbol cell" — including chips and detail sheets, or table
  cells only? Money-market funds (SNSXX, FSIXX) and index symbols resolve on Barchart
  inconsistently; link anyway, or suppress for a known set?
- **D-B3 Provider.** Barchart is the operator's chosen destination. Should the spec
  name it as the family default so a future app does not pick TradingView?

---

## 3. Ruling to record — brand assets must be reachable without credentials (2026-09-05)

Already implemented in all three apps and logged in `design/README.md`
("The icon must be reachable without credentials"). For the Component Reference:

- iOS "Add to Home Screen" fetches the touch icon **with no cookies**; behind
  Cloudflare Access (and Tradelog's/Screener's JWT gates) every app showed a letter tile
  while the Mac showed the mark. Three layers, all required: the app serves the seven
  asset paths anonymously; one shared Access application "Kapman public brand assets"
  bypasses them with **explicit-hostname rows** (wildcards lose to the site's own app);
  the page declares `apple-touch-icon`, `manifest`, `theme-color`.
- Titles spell the brand **"Kapman"** — never "KapMan"; repo names lowercase; the
  all-caps eyebrow in the lockup is the one sanctioned variant.
- Still wanted (QUEUED 2026-08-31): a **≥512px master** of the mark; 512 is a 2× upscale
  today, and the mark does not survive 16/32px favicon sizes.

Tradelog #353 · Screener #112, #113 · Fair Value #48.

---

## 4. Inventory — issues opened 2026-08-29 → 2026-09-05

Design-relevant rows are marked ●; the rest are data or ops and listed so the week is
one picture.

| Repo | # | Title | Design |
|---|---|---|---|
| tradelog | 340 | Mobile shell and iPhone usability: responsive shell, tiered tables, PWA | ● shipped the ladder, tiers, PWA |
| tradelog | 341 | Ops: post-deploy iPhone standalone auth verification (PWA) | ● standalone display provisional |
| tradelog | 342 | iPhone: dashboard scroll freezes after closing the Accounts/Range sheet | ● sheet behaviour |
| tradelog | 343 | iPhone: hamburger under the status bar; pin identity column in wide tables | ● safe-area, pinned identity |
| tradelog | 344 | Per-user profiles: identity-keyed auto-saved views | ● save-state pills (UI-1) |
| tradelog | 345 | Profiles: coherent post-CAS snapshot; stop retrying permanent HTTP errors | |
| tradelog | 346 | Overview NLV understates Fidelity by ~$102K | |
| tradelog | 347 | Backfill historical marks for late-onboarded instruments | |
| tradelog | 348 | Corporate account value series internally inconsistent | |
| tradelog | 349 | Recommendation mirror is entity-blind (segregation Phase 3) | ● entity / Paper / Legacy badges reused from #335 |
| tradelog | 350 | Corporate NLV understated by SNSXX reinvestment | |
| tradelog | 351 | Fidelity NLV overstated by $100K: wire rows dropped | |
| tradelog | 352 | Fidelity cash overstated ~$1.5K: starting capital + reinvest rows | |
| tradelog | 353 | iOS home-screen icon behind the auth gate | ● §3 above |
| screener | 106 | Per-user profiles — identity-keyed auto-saved views | ● save-state pills |
| screener | 107 | Post-#105 auth debris | |
| screener | 108 | Grid filter controls need two clicks after any filter is applied | ● generic React + AG Grid hazard (QUEUED) |
| screener | 109 | Filter bar hides the view's own filters; row count never reveals the watchlist total | ● two-level filter display (§1) |
| screener | 110 | Adopt the shared design-system lint; retire check-theme.ts | ● tooling |
| screener | 111 | Conformance audit 2026-09-02: grid CSS @5052040, ruling 58, version chip, two tablists, contrast floor | ● rulings 57/58 landed |
| screener | 112 | iOS home-screen tile: no icons, no manifest, root assets not served | ● §3 |
| screener | 113 | Header lockup renders a 128px mark; use the 256px master | ● one artwork feeds tile and lockup |
| fair value | 43 | Re-vendor the theme at 26f4898; decision 54 on the touch-target utility | ● |
| fair value | 44 | UI-0 step 5 re-split: decision 51 tie-break | ● |
| fair value | 45 | Width model: furniture and the chip are inputs (decision 50) | ● |
| fair value | 46 | Deploy to Fly is not gated by CI | |
| fair value | 47 | No real health endpoint | |
| fair value | 48 | iOS home-screen tile: no icons or manifest; SPA fallback answers assets with HTML | ● §3 |

**Carried with this batch:** the 33 rows of `OPEN-WITH-DESIGN.md` → QUEUED. Amendment 03
(decisions 48–56) has since answered several of them — the saved-view shape (48),
semantic borders (49), the width formula (50), the UI-0 tie-break (51), the UI-2
query (52), the touch floor (54) — and the tracker has **not yet been reconciled**
against it. Reconciling QUEUED against 48–56 is the first step of sending this batch;
the rows still open afterwards are the ones Design should read. The `RULING`-class
survivors we expect: `--pos/--neg` migration scope (143 sites), "ink on a filled chip"
(rule of three fired — five sites, two hues), a row-height variant for provenance
cells, `--text-4` on a disabled label, and the two set-filter/cohort findings from
#108/#109 that §1 now generalises.

---

## 5. Governance proposal — for Design to react to

Today `kapman-tradelog/design/` owns the theme, the lint, the icon recipe and this
tracker; two apps vendor from it on an announced Vendor SHA; the 260830 bundle lives in
an **unversioned folder** beside the repos; findings queue in one markdown file; and
design-relevant issues are filed in whichever app found them.

Proposed, in order of leverage:

1. **A `kapman-design` repository as the system of record** — the theme files, the shared
   scripts (lint, contrast gate, vendor-integrity gate), the icon master and recipe, the
   Component Reference and Spec (the `.dc.html` bundle, versioned at last), the decision
   log, this tracker, and **design issues as GitHub issues** with one label per app. App
   repos keep implementation issues that reference a design issue number. Tradelog stops
   being "master" and becomes the first consumer; the Vendor SHA mechanism is unchanged,
   it just points at a different repo.
2. **A filter contract and a component after it.** The panel in §1 is the first thing the
   three apps should share as *code*, not as three re-implementations of one drawing.
   Stacks differ (AG Grid twice, a bespoke table once), so the realistic sequence is:
   spec (Design) → one JSON filter model (engineering, decision-48 pattern) → one React
   panel package published from `kapman-design` that each app wraps for its grid.
3. **Numbered decisions stay the unit of authority.** Amendments have worked because each
   change is a number the repos can cite in commits. Keep that; move the log into the repo.

---

## 6. What we need back

Decisions D-A1…D-A5 and D-B1…D-B3 as numbered entries; a Component Reference section for
the filter panel (anatomy, states, keyboard, touch) and a `.km-sym-link` primitive in §02;
the brand-asset paragraph in the reference; a reaction to §5. Engineering follows with
the filter contract and three implementation issues, one per repo, as with 260830.
