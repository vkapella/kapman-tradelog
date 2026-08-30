# KapMan shared theme — source of truth

`kapman-tradelog` owns the unified UI theme for the three KapMan apps
(**Tradelog**, **Screener** / kapman-polygon-viewer, **Fair Value** /
kapman-fair-value-tool). The two files here are the deliverable of Tradelog
UI-4 (design handoff 260830), generated from the corrected `globals.css`
after UI-0 (token values) and UI-0a (role reassignment) merged.

| File | What it is |
|---|---|
| `kapman-ui.css` | Tokens + control primitives: buttons, inputs, factor-cell states, the four save-status pills, the remove button, the pin toggle, chips, header lockup, focus ring, z-layers. |
| `kapman-grid.css` | Grid theme: row heights, hairlines, frozen boundary, numerics, sort indicator, pinned widths, pane-lockstep rules, and an `.ag-theme-kapman` adapter for AG Grid. Load after `kapman-ui.css`. |

## Copy-in (governance: decision 04)

**Vendored copies per repo. No published package. No runtime cross-repo fetch.**

1. Copy both files **verbatim** into the consuming repo (e.g. `src/design/`).
2. Load `kapman-ui.css` before all app CSS; `kapman-grid.css` after it.
3. Do not edit the copies. A needed change lands **here first**, then re-copies
   outward. Vendoring converts to a package cheaply later; the reverse does not.
4. Tailwind repos additionally map config aliases onto the tokens
   (see `tailwind.config.ts` in this repo for the reference alias set:
   `surface`, `surface-2`, `surface-3`, `border`, `border-subtle`,
   `border-strong`, `text`…`text-4`, `accent`, `accent-soft`, `gold`,
   `pos`, `neg`, `warn`). Editing `:root` alone does not make a token
   reachable from a class name.

## The role mapping (from UI-0a — do not re-derive)

Apply by **role**, not by whatever token or colour a call site used before.
This table is the part a repo cannot infer on its own; re-inferring it is how
the apps diverge.

| Role | Token |
|---|---|
| Page canvas | `--bg` |
| **Inset card inside a panel** (stat tiles, drill-downs) | `--bg` — *sanctioned by owner 2026-08-30; the one component use of `--bg`* |
| Card / panel / section sitting on the canvas | `--surface` |
| Table body, data rows | `--surface` |
| Sticky / pinned cell | `--surface` — must equal the table body exactly |
| Table head | `--surface-2` |
| Header / topbar | `--surface-2` |
| Toolbar | `--surface-2` |
| Sidebar / rail | `--surface-2` |
| Bottom tab bar | `--surface-2` |
| Sheet, menu, popover, panel nested in a panel | `--surface-2` |
| Secondary button | `--surface-3` |
| Chip / badge / count pill | `--surface-3` |
| Input / select at rest | `--surface-3` |
| Tab button (inactive), checkbox, drag handle | `--surface-3` |
| Hover | one step above the element's own ground (`--surface` → `-2`, `--surface-2` → `-3`) |
| Row hairline | `--border-subtle` |
| Frozen boundary, drag handle, control hover border | `--border-strong` — nothing else |
| Surface alpha tints (`bg-*/50` etc.) | flatten to the role's token (decision 32); only `--pos/--neg/--warn/--accent`-dim tint over varying ground |

## Hard rules (the "do not ship" list)

- **Every text input and select is 16px at every width.** Smaller makes iOS
  zoom on focus and pulls frozen columns apart. Not a phone-only rule.
- Focus ring: **2px `--accent` at 2px offset**, identical on every control.
- Destructive controls: real `<button>`, visible at 40% opacity at rest,
  full on `:hover` **and** `:focus-visible`, `aria-label` naming the subject
  ("Remove META"). Never `opacity: 0`, never a clickable text cell.
- `--text-4` never carries prose. `--gold` is the wordmark only.
- No zebra striping; no hover that changes row height.
- No control inside a pinned cell gets a pixel height equal to the row's
  `min-height` — `align-self: stretch` instead (pane lockstep).
- Signal colour is never the only carrier of meaning (BUY keeps its word,
  a pin keeps its marker, an override keeps its dot).
- z-indexes come from the `--z-*` scale only.

## Breakpoints

One ladder, Tailwind's default screens (revised 2026-08-30 — the earlier
1180/820 ladder's "720px table floor" was asserted, not derived):

| Width | Nav | Rows |
|---|---|---|
| ≥ 1024 (`lg`) | Sidebar `--sidebar-w` | `--row-h` |
| 768–1024 (`md`) | Rail `--rail-w`, icons + `aria-label` | `--row-h-touch` |
| < 768 | Bottom tabs `--tabbar-h` + safe-area | `--row-h-touch` |

No hamburger drawer at any width; primary nav is always visible.

## Icons

`lucide-react` everywhere. Size follows the **call site**, not the icon:
`w-3.5 h-3.5` top-level chrome · `w-3 h-3` subtab strips · `w-4 h-4` the mark.
`Target` and `Calculator` legitimately appear at two sizes — do not normalise.

## Open items tracked upstream

- `--row-h` 30 vs 36: Tradelog UI-7 records the decision; if 36 wins, the
  value changes in `kapman-ui.css` and the Screener moves up.
- Fixed-width chips within a table column (uniform column edge): designer
  question pending; will land here as a chip-width mechanism when ratified.
- `--chart-purple` stays app-local until the chart palette is specified.
- Desktop modal panels vs mobile sheet fill (`--surface` vs `--surface-2`):
  designer ruling pending.
