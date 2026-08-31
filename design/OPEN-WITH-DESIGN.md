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

---

## QUEUED — found, not yet sent

| Item | Class | Found by | Detail |
|---|---|---|---|
| **Semantic palette has no border variant** | `RULING` | Tradelog UI-D2, 2026-08-30 | **This one blocks the last 18 sites of UI-D2.** `--accent` has three levels — `--accent`, `--accent-dim` (13%), `--accent-border` (30%). `--pos`/`--neg`/`--warn` have only two, so a semantic border has no token to migrate to. The theme demonstrates the gap by being inconsistent with itself: `.km-save--saving` uses `var(--accent-border)` cleanly, while `.km-save--saved` and `--failed` inline `color-mix(… 30% …)`, `.km-btn--danger` and `.km-remove:hover` use **40%**, and `.km-pin[aria-pressed]` uses **45%** — three opacities for one concept, plus an 8% fill where `--neg-dim` is 12%. Downstream the app improvises `/40 /50 /60 /70`. **Recommend `--pos-border`/`--neg-border`/`--warn-border` at 30%**, mirroring `--accent-border` and matching what two of the six theme sites already chose. Alternatives: semantic borders use `--border` and only the fill carries meaning; or keep `color-mix` at call sites. Note this is a theme change — three new tokens means both siblings re-vendor, so it should ship with the next batch rather than alone. |
| Touch-floor scoping is inconsistent across primitives | `NOTE` | Tradelog, 2026-08-30 | `.km-btn` / `.km-icon-btn` / `.km-pin` / `.km-input` take 44px under bare `(pointer: coarse)` at **any** width; `.km-nav-item` (`6d78e55`) scopes to `≤1023.98px`. A touchscreen laptop at 1400px gets 44px buttons and 38px nav items. The spec's own rule is scoped by both pointer and width, so the four unbounded ones may be the wrong pair. Not resolved unilaterally — needs one answer applied to all five. |
| `--pos`/`--neg` migration scope | `RULING` | Tradelog lint | **Corrected baseline after D0: 143, not the 233 first reported to Design.** palette-class 103 (verified real, in `className` contexts), token-escape 33, z-index 7. The original total was inflated by lint false positives — 63 GitHub issue references (`#340`) matched as hex, the token-definition file linted against itself, and primitive rules applied to the repo that authors rather than consumes the theme. Proposed as UI-D. |
| Lint false-positive fixes should reach Fair Value | `NOTE` | Tradelog D0, 2026-08-30 | Four fixes made to the shared lint, all reproducible in the authoring repo and two in any repo: 3-digit hex matched issue references; the app's own token file was linted for raw colour; `shadowed-primitive`/coverage assumed a consuming repo; and a suppression reason containing a semicolon silently failed, because the walk-back treated comment prose as a statement boundary. That last one is the worst — a tool that silently ignores a written exemption stops being trusted. |
| "Text on an accent fill" has no token | `NOTE` | Tradelog D0, 2026-08-30 | `.km-btn--primary` in the theme and the filter-count badge in the app both need near-black text on an accent background, and both reached for the literal `#0d0f14`. The app now uses `var(--surface)`, which is that value, but semantically it is "text on accent", not "a surface". Worth a token if a third site appears. |
| `z-[1]` for intra-component stacking | `RULING` | Tradelog lint | 7 sites. Sticky-cell stacking inside a component is arguably not a `--z-*` concern. Suppress with reasons, or extend the scale? |
| Vendor-integrity gate should be shared tooling | `NOTE` | Screener, 2026-08-30 | The Screener built a gate that detects upstream `design/` drift against its vendored copy. Worth having in all three repos, which by the same argument as the lint and the contrast gate means it should live in `kapman-tradelog/scripts/` and be copied out, not reimplemented per repo. **Delivered:** a 73-line patch adding a `vendor-integrity` rule to `scripts/check-design-system.mjs`, at `kapman-polygon-viewer/docs/handoffs/vendor-integrity.patch` (+ `.md`). Re-checked against `9e3b121`: still applies clean. Configured by `KAPMAN_VENDOR_DIR` / `KAPMAN_THEME_SOURCE`, both defaulting to `<repo>/design`, so in the authoring repo it is a self-comparison and stays silent — it does not have the authors-vs-consumes problem `3ab9cc0` had to fix elsewhere. Missing source skips loudly rather than passing. Verified in all four states. In the Screener it has already caught one real stale copy (`6d78e55`). That repo retires its own `check-theme.ts` once this lands. |
| UI-4's v2 saved-view shape breaks a cross-language contract | `BLOCKING` | Screener, 2026-08-30 | UI-4 widens `SavedView.filters` from `Record<string, string[]>` to a `set`/`number` union. In the Screener that value is not frontend-only: `frontend/src/viewFilter.ts` has a **Python twin** (`backend/app/export_pass1.py::apply_view_filters`) and the two are pinned against each other by a node/esbuild **parity harness** (`frontend/parity/harness.ts`, driven from `backend/tests/test_export_pass1.py`). Widening the type breaks the twin and the harness and changes what `/api/export/pass1` accepts — a coordinated three-surface change the issue does not mention. **Ruling wanted:** is the numeric range filter worth that, or should it be expressed without changing the persisted `filters` shape (e.g. a sibling key the twin ignores)? UI-4's theme, pinned group and filter staging shipped; only this is held. |
| UI-2 and UI-3 acceptance lines cannot both hold | `RULING` | Screener, 2026-08-30 | With `useNarrow()` at 768 (what UI-2's scope line directs), 800px measures the **desktop** toolbar beside the 56px rail. UI-2's acceptance — "at 800px the compact toolbar and the icon rail show together" — requires the query at 1024. UI-3's acceptance ("at 800px the rail is 56px and the grid gets viewport − 56px") passes as built, measured. The README ladder table puts the compact toolbar in the 768–1024 band, which argues for 1024. Built at 768 per the explicit scope line; one of the two lines needs rewording. |
| `token-parity` assumes the authoring model; a consuming repo has no `:root` | `NOTE` | Screener, 2026-08-31 | New rule 6 (`3ab9cc0`) reports **48 findings** in the Screener, all false. It requires every vendored token to also exist in the app's own `:root` — correct for Tradelog, which authors `globals.css` and generates `design/` from it. The Screener **imports `design/kapman-ui.css` directly and deliberately has no `:root` of its own** (deleting it was the point of its UI-1). Satisfying the rule would mean hand-duplicating 48 token declarations — reintroducing exactly the hand-sync drift the rule exists to prevent. Same authors-vs-consumes split `3ab9cc0` fixed for `shadowed-primitive` and coverage: suggest gating rule 6 the same way — if the app imports the vendored theme, parity is satisfied by construction. |
| `shadowed-primitive` threshold still misfires in a consuming repo | `NOTE` | Screener, 2026-08-31 | Survived `3ab9cc0` (which fixed the authoring-repo gating, not the threshold): **33 findings** in the Screener, nearly all false. Three shared declarations is a CSS idiom, not shadowing — `.fl-head` "shadows `.km-header`" on `display:flex; align-items:center; gap`; `.docs-table th` likewise; `.pb-col` "shadows `.km-version-chip`" on mono/border/radius. It also got *worse* when `.km-version-chip` gained its 13ch ellipsis bound: a legitimate primitive change manufactured new false positives, which is a bad property for a gate. Suggest requiring at least one distinctive (token-valued colour or border) declaration rather than layout properties alone. |
| UI-4's filter-staging rationale does not hold in the Screener | `NOTE` | Screener, 2026-08-30 | Its acceptance is "toggling five filter values produces one autosave write, not five". Here that is **zero either way**: `handleSaveLayout` deliberately does not capture grid filters, `GridHandle.getFilters()` has no callers, and the profile autosave reports only watchlist/view/options/tab. The other stated reason — re-filtering 224 symbols per toggle — is real and is what staging was implemented for. Acceptance line untestable as written. |
| Column reorder coverage | `NOTE` | Tradelog UI-2 | Reorder lives in `ConfigVirtualTable` only; positions and imports still render pre-migration header rows (#340 debt, not UI-2 scope). |

---

## Vendor SHA

Siblings re-vendor `design/kapman-ui.css` and `design/kapman-grid.css` at the
SHA named here. Do not re-vendor on your own initiative — the theme owner
announces it.

**Current: `007d624`** — adds the rail touch floor (`6d78e55`).
Previous: `0a02ca1`.

No re-vendor is needed for UI-D0/D1/D2-part-1: the lint fixes, the Tailwind
aliases and the semantic migration are all app-side. The next re-vendor will
carry the semantic border tokens, once ruled.
