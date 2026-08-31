# Open with Design

The single record of what is in flight with the design package, what came
back, and what has been found but not yet sent. **All three sessions read and
append here**; the Tradelog session (theme owner) consolidates and sends.

Why this file exists: findings were previously dripped to Design as one-off
documents from three sessions independently. Design received two partial views
of the same defect (the version-chip overflow, hit separately by Tradelog and
the Screener), one document that was stale before it was read, and two open
threads from one repo at once.

## How to use it

**Classify every finding. Only ever stall on the first kind.**

| Class | Meaning | What the finder does |
|---|---|---|
| `BLOCKING` | Cannot proceed without a ruling | Append here, tell the operator immediately, stop that issue only |
| `RULING` | Can proceed on a stated assumption | Implement, state the assumption in the commit, append here |
| `NOTE` | Spec should record it; no action needed | Append here only |

Append to **Queued**. Do not send to Design yourself — the theme owner batches,
dedupes, and merges corroborations, because two repos independently hitting one
defect is far more persuasive than one repo asserting a rule.

Batches go out when a repo finishes an issue, or when a `BLOCKING` item forces
a send anyway (blockers carry the batch with them).

## Re-vendoring: detection and authorisation are separate

The Screener built a vendor-integrity gate that notices when upstream
`design/` has moved and its copy is stale. Keep it — it is better than
anything the governance originally specified, and it belongs in all three
repos. But it answers only half the question.

**A gate can see that the file changed. It cannot see whether the owner had
finished changing it.** Freshness and completeness are different properties,
and only the owning session knows the second one. On 2026-08-30 the Screener
detected `6d78e55` and re-vendored immediately; its copy came out
byte-identical to the announced SHA and nothing needed redoing — but only
because that change happened to be atomic. Had the gate fired two commits into
a three-commit theme change, it would have vendored a half-state and been
confident, because the file was new and looked coherent.

So:

| | Job |
|---|---|
| **The integrity gate** | Detects drift and **alerts** — "upstream moved, my copy is stale". It never authorises. |
| **The Vendor SHA below** | **Authorises.** The owner names it only once integration is complete. Re-vendor when it is newer than your copy. |

Never re-vendor on drift detection alone.

---

## OPEN — sent, awaiting ruling

### `design-lockup-defects.md` — sent 2026-08-30
| Item | Class | Status |
|---|---|---|
| UI-3 acceptance line is untestable ("chip equals the latest `fly releases` value" — Fly does not expose the release version to the Machines runtime) | `RULING` | Implemented as short SHA; awaiting reword |
| Lockup has no width budget and no overflow rule | `NOTE` | Bounded locally; rule still wanted — hit in 2 of 3 repos |
| Decision 09's "the type monogram is the shipping mark" describes the fallback, not the shipping mark | `NOTE` | Corrected locally; wording still misleads Fair Value |

### `design-spec-additions.md` — sent 2026-08-30
| Item | Class | Status |
|---|---|---|
| 1. New rule: a primitive must own its box (theme was authored under Tailwind preflight; plain-CSS consumers inherit app padding) | `NOTE` | `.km-icon-btn` fixed (`099890c`); rest unaudited |
| 2. Nav primitives belong in Reference §04, not only in code | `NOTE` | Shipped in theme; not in the reference |
| 3. `--pos`/`--neg`/`--warn` has never been enforced anywhere — 103 stock-palette sites in the theme owner | `RULING` | Proposed as UI-D |
| 4. Should the authoring repo consume its own vendored theme? (tokens hand-synced in two files today) | `RULING` | Hand-syncing continues meanwhile |
| 5. Decision 04 needs a concurrency caveat | `NOTE` | Branch-handoff governance already in force |

---

## RULED — came back, and what changed

| Amendment | Ruling | Landed |
|---|---|---|
| 01 | Inset pattern sanctioned via `.km-inset`; `--surface-inset` withdrawn | `9980c1a`, `07b37df` |
| 01 | Decision 38 scopes decision 22 — complete the tab pattern only where a real tab widget exists; link strips take `<nav>` + `aria-current` | `c0d4f44` |
| 01 | Five unmapped roles ruled (modals, placeholders, progress tracks, calendar cells) | `07b37df` |
| 02 | UI-C enumerations ratified — 4 of 6 inferences corrected, 2 missed sets added | `8cddb2d` |
| 02 | Decision 41 — enum values are not display labels | `1a8d8c6` |
| 02 | Decisions 42/43 — Account-kind and Event chips exempt | `8cddb2d` |
| 02 | Decision 44 — Sign out moves to the drawer footer | `1d09ea2` |
| 02 | Decision 45 — calendar inset ruling withdrawn (no referent) | `07b37df` |
| 02 | Decision 28 closed at 30px; measured contrast table replaces §02 arithmetic | `afb5f17`, `036172c` |
| 03 | Decision 53 — `z-[1]`/`z-[2]` for intra-component sticky stacking is sanctioned; the `--z-*` scale does not extend downward. Seven sites suppressed with the written reason, canonical statement at `column-config.ts` | `26f4898` |
| 03 | Decision 54 — the touch floor loses its width clause: one bare `(pointer: coarse)` rule, all five controls. **Fixing it revealed the old rules had never applied to two of them** — see below | `26f4898` |
| 03 | Decision 49 — `--pos-border` / `--neg-border` / `--warn-border` at 30%; the theme's 40%/45% sites converge, `.km-remove:hover`'s 8% fill becomes `--neg-dim`. Semantic colour now has `--accent`'s three levels; more emphasis steps to the solid token, never a bespoke percentage | `af0c364` |

---

## QUEUED — found, not yet sent

| Item | Class | Found by | Detail |
|---|---|---|---|
| `--pos`/`--neg` migration scope | `RULING` | Tradelog lint | **Corrected baseline after D0: 143, not the 233 first reported to Design.** palette-class 103 (verified real, in `className` contexts), token-escape 33, z-index 7. The original total was inflated by lint false positives — 63 GitHub issue references (`#340`) matched as hex, the token-definition file linted against itself, and primitive rules applied to the repo that authors rather than consumes the theme. Proposed as UI-D. |
| Lint false-positive fixes should reach Fair Value | `NOTE` | Tradelog D0, 2026-08-30 | Four fixes made to the shared lint, all reproducible in the authoring repo and two in any repo: 3-digit hex matched issue references; the app's own token file was linted for raw colour; `shadowed-primitive`/coverage assumed a consuming repo; and a suppression reason containing a semicolon silently failed, because the walk-back treated comment prose as a statement boundary. That last one is the worst — a tool that silently ignores a written exemption stops being trusted. |
| "Text on an accent fill" has no token | `NOTE` | Tradelog D0, 2026-08-30 | `.km-btn--primary` in the theme and the filter-count badge in the app both need near-black text on an accent background, and both reached for the literal `#0d0f14`. The app now uses `var(--surface)`, which is that value, but semantically it is "text on accent", not "a surface". Worth a token if a third site appears. |
| Vendor-integrity gate should be shared tooling | `NOTE` | Screener, 2026-08-30 | The Screener built a gate that detects upstream `design/` drift against its vendored copy. Worth having in all three repos, which by the same argument as the lint and the contrast gate means it should live in `kapman-tradelog/scripts/` and be copied out, not reimplemented per repo. **Delivered:** a 73-line patch adding a `vendor-integrity` rule to `scripts/check-design-system.mjs`, at `kapman-polygon-viewer/docs/handoffs/vendor-integrity.patch` (+ `.md`). Re-checked against `9e3b121`: still applies clean. Configured by `KAPMAN_VENDOR_DIR` / `KAPMAN_THEME_SOURCE`, both defaulting to `<repo>/design`, so in the authoring repo it is a self-comparison and stays silent — it does not have the authors-vs-consumes problem `3ab9cc0` had to fix elsewhere. Missing source skips loudly rather than passing. Verified in all four states. In the Screener it has already caught one real stale copy (`6d78e55`). That repo retires its own `check-theme.ts` once this lands. |
| UI-4's v2 saved-view shape breaks a cross-language contract | `BLOCKING` | Screener, 2026-08-30 | UI-4 widens `SavedView.filters` from `Record<string, string[]>` to a `set`/`number` union. In the Screener that value is not frontend-only: `frontend/src/viewFilter.ts` has a **Python twin** (`backend/app/export_pass1.py::apply_view_filters`) and the two are pinned against each other by a node/esbuild **parity harness** (`frontend/parity/harness.ts`, driven from `backend/tests/test_export_pass1.py`). Widening the type breaks the twin and the harness and changes what `/api/export/pass1` accepts — a coordinated three-surface change the issue does not mention. **Ruling wanted:** is the numeric range filter worth that, or should it be expressed without changing the persisted `filters` shape (e.g. a sibling key the twin ignores)? UI-4's theme, pinned group and filter staging shipped; only this is held. |
| UI-2 and UI-3 acceptance lines cannot both hold | `RULING` | Screener, 2026-08-30 | With `useNarrow()` at 768 (what UI-2's scope line directs), 800px measures the **desktop** toolbar beside the 56px rail. UI-2's acceptance — "at 800px the compact toolbar and the icon rail show together" — requires the query at 1024. UI-3's acceptance ("at 800px the rail is 56px and the grid gets viewport − 56px") passes as built, measured. The README ladder table puts the compact toolbar in the 768–1024 band, which argues for 1024. Built at 768 per the explicit scope line; one of the two lines needs rewording. |
| `token-parity` assumes the authoring model; a consuming repo has no `:root` | `NOTE` | Screener, 2026-08-31 | New rule 6 (`3ab9cc0`) reports **48 findings** in the Screener, all false. It requires every vendored token to also exist in the app's own `:root` — correct for Tradelog, which authors `globals.css` and generates `design/` from it. The Screener **imports `design/kapman-ui.css` directly and deliberately has no `:root` of its own** (deleting it was the point of its UI-1). Satisfying the rule would mean hand-duplicating 48 token declarations — reintroducing exactly the hand-sync drift the rule exists to prevent. Same authors-vs-consumes split `3ab9cc0` fixed for `shadowed-primitive` and coverage: suggest gating rule 6 the same way — if the app imports the vendored theme, parity is satisfied by construction. |
| `shadowed-primitive` threshold still misfires in a consuming repo | `NOTE` | Screener, 2026-08-31 | Survived `3ab9cc0` (which fixed the authoring-repo gating, not the threshold): **33 findings** in the Screener, nearly all false. Three shared declarations is a CSS idiom, not shadowing — `.fl-head` "shadows `.km-header`" on `display:flex; align-items:center; gap`; `.docs-table th` likewise; `.pb-col` "shadows `.km-version-chip`" on mono/border/radius. It also got *worse* when `.km-version-chip` gained its 13ch ellipsis bound: a legitimate primitive change manufactured new false positives, which is a bad property for a gate. Suggest requiring at least one distinctive (token-valued colour or border) declaration rather than layout properties alone. |
| UI-4's filter-staging rationale does not hold in the Screener | `NOTE` | Screener, 2026-08-30 | Its acceptance is "toggling five filter values produces one autosave write, not five". Here that is **zero either way**: `handleSaveLayout` deliberately does not capture grid filters, `GridHandle.getFilters()` has no callers, and the profile autosave reports only watchlist/view/options/tab. The other stated reason — re-filtering 224 symbols per toggle — is real and is what staging was implemented for. Acceptance line untestable as written. |
| Brand mark needs a ≥512px master | `NOTE` | Tradelog, 2026-08-31 | `assets/kapman-mark.png` is 256×256. It downscales beautifully to the 180px iOS home-screen icon and 192px PWA icon, but the manifest also wants **512×512**, which is a 2× upscale. Acceptable with Lanczos on flat-shaded artwork, not ideal. A 512 or 1024 master in the bundle would fix it for all three apps. Separately, the mark is unreadable at favicon sizes (32px muddy, 16px colour blobs) — inherent to two animal heads, not to the pipeline. If the browser-tab icon matters, a simplified small-size variant is the only real fix, and it should be a bundle asset rather than three local improvisations. |
| **The theme's coarse-pointer floor had never applied to `.km-icon-btn` or `.km-pin`** | `NOTE` | Tradelog, decision 54 implementation, 2026-08-31 | Found while consolidating the five rules, and it corrects this tracker's own earlier entry, which asserted those two "take 44px under bare `(pointer: coarse)` at **any** width". They took it at no width. `@media (pointer: coarse)` was authored at `kapman-ui.css:226`, *above* `.km-icon-btn` (232) and `.km-pin` (295); a media query adds no specificity, so each control's own `min-height: 36px` won on source order. Measured in headless Chromium before the fix: 36px at 800px and at 1366px under a coarse pointer, while `.km-btn` and `.km-input` — both defined *before* their rule — correctly reported 44px. **`.km-remove` is an `.km-icon-btn`, so UI-5's destructive control was one of the two.** Both siblings vendor this file and inherit the defect verbatim; it is fixed in the announced SHA. Two lessons for the reference: a rule that must beat a same-specificity declaration has a *placement* requirement, and a spec that states a touch floor should require it to be **measured**, not read off the source — the inconsistency was visible in this file for a day and the wrong half was believed. |
| Column reorder coverage | `NOTE` | Tradelog UI-2 | Reorder lives in `ConfigVirtualTable` only; positions and imports still render pre-migration header rows (#340 debt, not UI-2 scope). |
| Column width formula budgets for neither header furniture nor an in-cell chip | `RULING` | Fair Value UI-5 | `ceil(longestWord × 7.5) + 30` measures the longest **word**, which only works for a header that wraps — an ellipsizing one needs its whole label. Two things then cropped the result. **(a)** A sortable, filterable header carries a sort indicator and a filter button beside the label — 40px together as measured in the shipped theme — and the formula budgets nothing for them, so every filterable header in the migrated grids truncated. **(b)** UI-C mandates a 64px `pin`/`model` chip beside every category score, and the formula budgets nothing for cell content, so values clipped to "18…" behind their own markers. Implemented locally as a header affordance plus a content floor (value + chip + padding); wanted as one rule the three repos share, since the Screener's grid will hit both. Note the two specs cropped each other: UI-C mandated the chip and §05 sized the column, and neither knew about the other. |
| The 76px pinned symbol column cannot also host a filter | `NOTE` | Fair Value UI-5 | The pinned group is fixed at 40+44+76=160px and UI-5 asks for header filters; at 76px the label plus a filter button does not fit. Resolved locally by keeping sort on Ticker and dropping its filter — identity is what the column is for and the metric columns carry the filters — but the two rules are in direct conflict and the sibling grids will meet it. |
| A grid row has one height, and no variant for a cell carrying provenance | `RULING` | Fair Value UI-5 | `--row-h` is 30px. Fair Value's intrinsic table shows each EPS with its source and timestamp beneath the value, and the growth suggestion shows value, confidence and delta — three lines, by deliberate earlier design. At 30px the provenance is simply lost. Implemented as a multiple of `--row-h` (`rowLines={3}`) rather than a literal height so UI-7's decision stays upstream, but the spec should say whether a tall-row variant is sanctioned or whether provenance belongs somewhere other than the cell. |
| AG Grid's set filter is Enterprise | `NOTE` | Fair Value UI-5 | UI-5 asks for "set filter on Signal and judgment columns" in all three repos; `agSetColumnFilter` is an Enterprise feature. Fair Value built a Community equivalent (distinct values, toggleable, all/none) rather than take a paid licence for a checkbox list. Worth stating in §05 so neither sibling assumes a licence — and the Screener already ships AG Grid Community, so it has the same constraint. One implementation detail costs an hour if unstated: `doesFilterPass` declared on the colDef is silently ignored for a custom React filter; it has to be registered through `useGridFilter`, or the filter renders and never filters. |
| Measured ratios corroborated in a second repo | `NOTE` | Fair Value UI-8 | Fair Value's gate run reproduces Tradelog's token table **exactly** on every shared token — `--text-4` on canvas 2.79 (published 2.6), `--text-3` on `--surface-3` 4.62, `--text` on canvas 16.66, `--accent` on canvas 11.03. Amendment 02 asked that a disagreement be treated as a finding; agreement to two decimals across two independent implementations is the other half of that, and retires any doubt that §02's arithmetic was the problem rather than the tokens. 2,072 nodes, 0 failures, self-test passing. |
| `--text-4` on a disabled *label* — "never prose" vs. UI-0 step 5 | `RULING` | Fair Value UI-8 | The two rules disagree and every repo will hit it. §02 says `--text-4` is "non-text only … never prose"; UI-0 step 5 enumerates `disabled:` sites as sanctioned `--text-4`. A disabled button reading "Preview 3 tickers" is both: an inactive control (WCAG 1.4.3 excludes it, so not a conformance failure) and unmistakably prose (2.34:1 on `--surface-3` — unreadable). Exempted while disabled only, and flagged rather than settled locally. Options: (a) keep it, `--text-4` means "non-text **or** inactive"; (b) disabled labels go to `--text-3` (4.62:1 on `--surface-3`, still visibly disabled via the fill and cursor), and `--text-4` keeps its literal meaning. |
| Em dash at `--text-4` is a marker, not prose — worth stating | `NOTE` | Fair Value UI-8 | 77 of Fair Value's 78 initial gate failures were one class: the em dash meaning "no value in force", at 2.69:1. The theme already settles it (`.km-cell--missing`), but the reference does not say so where the contrast rule is stated, so each repo re-derives it under a failing gate. Worth one line in §02 next to the `--text-4` swatch: an em-dash placeholder is a sanctioned non-text site. |

---

## Vendor SHA

Siblings re-vendor `design/kapman-ui.css` and `design/kapman-grid.css` at the
SHA named here. Do not re-vendor on your own initiative — the theme owner
announces it.

**Current: `26f4898`** — Amendment 03, both theme rulings, superseding `af0c364`.
Re-vendor once at this SHA and you have both. `kapman-ui.css` only;
`kapman-grid.css` and `scripts/check-design-system.mjs` are unchanged since
`2336389`, so a repo already at that SHA needs the CSS alone.
Previous: `2336389` (`af0c364` was announced and superseded the same day; if
you have not re-vendored yet, skip it).

**Decision 49** — `--pos-border` / `--neg-border` / `--warn-border` at 30%, and
the six divergent theme sites converged onto them.

**Decision 54** — one bare `(pointer: coarse)` touch floor covering all five
controls, replacing three rules. **Read this one before you diff:** it also
fixes a defect your vendored copy has been carrying. The old rule was authored
*above* `.km-icon-btn` and `.km-pin`, and a media query adds no specificity, so
their own `min-height: 36px` won on source order and the 44px floor never
applied to either — `.km-remove` included. Measure your own controls under a
coarse pointer rather than reading the source; that is how it was found.

Two consequences for a consuming repo, neither of them obvious from the diff:

- **Placement is load-bearing.** The consolidated rule must stay *after* all
  five control definitions. If you reorder or re-indent the theme file, or your
  bundler concatenates it ahead of your own control CSS, the floor silently
  stops applying again — same-specificity, source-order loss, no warning.
- **The ruling reaches your own touch-target utility.** Decision 54 names the
  five theme primitives because that is all Design knew about. Tradelog also had
  an app-side `.touch-target` at `(pointer: coarse) and (max-width: 1023px)`;
  the width clause came off it too, or an iPad in landscape would show a 44px
  `.km-btn` beside a 36px `.touch-target` button. Grep for
  `(pointer: coarse) and (max-width:` and judge each hit — **control floors lose
  the width clause; row density keeps it** (that is the UI-1 ladder, decision
  55, and is deliberately width-driven).

Semantic colour now has `--accent`'s three levels — dim (12%) → border (30%) →
solid. When you migrate your own `/40`-`/70` improvisations, a site needing more
emphasis than the border steps to the **solid** token, never to a bespoke
percentage.

UI-D0/D1/D2 remain app-side and carry nothing outward — the lint fixes, the
Tailwind aliases and the semantic migration are all local to this repo.
