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
| Touch-floor scoping is inconsistent across primitives | `NOTE` | Tradelog, 2026-08-30 | `.km-btn` / `.km-icon-btn` / `.km-pin` / `.km-input` take 44px under bare `(pointer: coarse)` at **any** width; `.km-nav-item` (`6d78e55`) scopes to `≤1023.98px`. A touchscreen laptop at 1400px gets 44px buttons and 38px nav items. The spec's own rule is scoped by both pointer and width, so the four unbounded ones may be the wrong pair. Not resolved unilaterally — needs one answer applied to all five. |
| `--pos`/`--neg` migration scope | `RULING` | Tradelog lint | 233 lint findings in the theme owner: palette-class 103, raw-color 88, token-escape 33, z-index 7. Proposed as UI-D, one commit per rule. |
| `z-[1]` for intra-component stacking | `RULING` | Tradelog lint | 7 sites. Sticky-cell stacking inside a component is arguably not a `--z-*` concern. Suppress with reasons, or extend the scale? |
| Column reorder coverage | `NOTE` | Tradelog UI-2 | Reorder lives in `ConfigVirtualTable` only; positions and imports still render pre-migration header rows (#340 debt, not UI-2 scope). |

---

## Vendor SHA

Siblings re-vendor `design/kapman-ui.css` and `design/kapman-grid.css` at the
SHA named here. Do not re-vendor on your own initiative — the theme owner
announces it.

**Current: `007d624`** — adds the rail touch floor (`6d78e55`).
Previous: `0a02ca1`.
