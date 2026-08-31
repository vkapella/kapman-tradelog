# KapMan shared theme — source of truth

> **New session?** Read `SESSION-START.md` in this directory first — repo map,
> governance, finding classification, current vendor SHA, and the mistakes that
> have already cost time.

`kapman-tradelog` owns the unified UI theme for the three KapMan apps
(**Tradelog**, **Screener** / kapman-polygon-viewer, **Fair Value** /
kapman-fair-value-tool). The two files here are the deliverable of Tradelog
UI-4 (design handoff 260830), generated from the corrected `globals.css`
after UI-0 (token values) and UI-0a (role reassignment) merged.

| File | What it is |
|---|---|
| `kapman-ui.css` | Tokens + control primitives: buttons, inputs, factor-cell states, the four save-status pills, the remove button, the pin toggle, chips (incl. the enumerated width steps), **workspace nav**, header lockup, focus ring, z-layers. |
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
| Sheet, modal, menu, popover, panel nested in a panel | `--surface-2` |
| Dashed placeholder tile on the canvas | `--surface` (dashed border stays) |
| Progress-bar track | inset fill (`--bg` via `.km-inset` idiom, borderless on thin tracks) |
| Calendar day cell (grid in a panel) | `--surface`; P&L tint composites over it |
| Secondary button | `--surface-3` |
| Chip / badge / count pill | `--surface-3` |
| Input / select at rest | `--surface-3` |
| Tab button (inactive), checkbox, drag handle | `--surface-3` |
| Hover | one step above the element's own ground (`--surface` → `-2`, `--surface-2` → `-3`) |
| Row hairline | `--border-subtle` |
| Frozen boundary, drag handle, control hover border | `--border-strong` — nothing else |
| Surface alpha tints (`bg-*/50` etc.) | flatten to the role's token (decision 32); only `--pos/--neg/--warn/--accent`-dim tint over varying ground |

## Workspace nav primitives (`.km-nav*`)

Added 2026-08-30 from the Screener's adoption — all three apps ship this nav
and all three were hand-rolling it. **One markup tree, three presentations**
on the shared ladder:

| Width | Presentation |
|---|---|
| ≥ 1024 | sidebar `--sidebar-w`, text labels left-aligned, icons hidden |
| 768–1024 | rail `--rail-w`, icon-only — every item keeps its `aria-label` |
| < 768 | fixed bottom tab bar `--tabbar-h`, icon over a 10px label (the only variant that centres, because it stacks glyph over label) |

Classes: `.km-nav` (container) · `.km-nav-items` · `.km-nav-item` ·
`.km-nav-icon`. Active state is styled for **both** `aria-selected="true"` (a
real tab widget — the Screener) and `aria-current="page"` (link navigation —
Tradelog and Fair Value, decision 38), so do not convert one to the other to
get the styling.

The page shell must reserve `--tabbar-total` at the bottom so the bar never
covers content. No hamburger at any width.

## The version chip

Carries the **product version only** (decision 05) — for these apps that is the
build's short SHA. Not a `git describe` string (this produced a 52-character
path in Tradelog's v37), and not the Fly release number (Fly assigns it after
the image builds and does not expose it to the Machines runtime — there is no
`FLY_RELEASE_VERSION` in the container env).

**The chip is bounded and truncates.** An unbounded chip escapes the sidebar
and paints over the page title — hit independently in two of three apps.

## Primitives own their box

Every primitive declares its own padding, border, line-height and font, and
must never rely on a framework reset.

This file was authored in a Tailwind app, whose preflight zeroes padding on
every element — so a primitive that omitted its own padding still looked
correct here. `.km-icon-btn` did exactly that, and the Screener (plain CSS, no
preflight) inherited its app's base button padding instead, rendering the
control at the wrong size inside a grid cell. Fixed in `099890c`.

**The Screener is the canary for this class of defect** — Tradelog and Fair
Value are both Tailwind and cannot see it. If you are adding a primitive,
declare the whole box.

## Touch floors

Controls take a ≥44px minimum under a coarse pointer: `.km-btn`,
`.km-icon-btn`, `.km-pin`, `.km-input` / `.km-select`, and `.km-nav-item`
(`6d78e55` — the rail band between 768 and 1023 is where a tablet lives, and
was the one band reaching neither the desktop target nor the bottom bar's
`--tabbar-h`).

Note an unresolved inconsistency, tracked in `OPEN-WITH-DESIGN.md`: the first
four apply at *any* width under a coarse pointer, while `.km-nav-item` scopes
to ≤1023.98px. One answer should apply to all five.

## The brand mark

The 28px tile renders the **commissioned mark**, `assets/kapman-mark.png` from
the handoff bundle. Decision 09's "the type monogram is the shipping mark"
describes the *fallback* where the asset is unavailable; reading it literally
shipped a placeholder monogram in Tradelog next to a sibling showing the real
mark. Vendor the PNG.

## Shared tooling

Three checks live in `kapman-tradelog/scripts/` and are copied outward the way
the CSS is. Each was authored by whichever repo hit the problem first, which is
why they exist at all — every one caught something the other two structurally
could not see.

| Script | Asks | From |
|---|---|---|
| `check-contrast.ts` | Does every text node clear 4.5:1 against its *composited* background? | Tradelog UI-8 |
| `check-design-system.mjs` | Is this repo using the theme correctly — tokens, z-scale, no stock palettes, no hand-rolled primitives? | Fair Value |
| `check-design-system.mjs` → `vendor-integrity` | Is this repo using the **real** theme, byte for byte? | Screener |

`vendor-integrity` is the one no sibling had: a copy edited in place passes
every other rule while silently forking the design system. Configure with
`KAPMAN_VENDOR_DIR` and `KAPMAN_THEME_SOURCE` (both default to `<repo>/design`,
so in this repo it is a self-comparison and stays quiet). A missing source
**skips loudly** rather than passing — a check that passes because it measured
nothing is worse than no check, a lesson all three tools have now learned the
hard way.

Two rules apply only to a **consuming** repo and are gated on whether the app
imports `kapman-ui.css`: `token-parity` (a consumer has no `:root` of its own,
so parity holds by construction) and `shadowed-primitive` (a consumer should
use a primitive rather than restate it). The authoring repo reports `n/a` for
primitive coverage for the same reason.

## Hard rules (the "do not ship" list)

- **Every text input and select is 16px at every width.** Smaller makes iOS
  zoom on focus and pulls frozen columns apart. Not a phone-only rule.
- Focus ring: **2px `--accent` at 2px offset**, identical on every control.
- Destructive controls: real `<button>`, visible at 40% opacity at rest,
  full on `:hover` **and** `:focus-visible`, `aria-label` naming the subject
  ("Remove META"). Never `opacity: 0`, never a clickable text cell.
- `--text-4` never carries prose. `--gold` is the wordmark only.
- **Semantic colour has three levels, exactly like `--accent`**: `--*-dim`
  fill (12%), `--*-border` (30%), solid. A state needing more emphasis than
  the border steps to the **solid** token — never a bespoke `color-mix`
  percentage, and never a stock palette colour at `/40`-`/70` (decision 49).
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
- Fixed-width enumerated chips: specified (decision 36, UI-C) — `--chip-w-1/2/3`
  land with UI-C once each repo's enumerations are confirmed against code.
- `--chart-purple` ruled app-local permanently (Amendment 01): chart colours
  encode series identity, not state; the token system does not cover them.
- ~~Desktop modal panels vs mobile sheet~~ ruled (Amendment 01): both `--surface-2`.

## App icons

**Source of truth: `public/kapman-mark.png`** — the same vendored brand mark
the header renders, so the icon and the lockup can never drift apart. Do not
re-crop from a marketing banner; that produced a slightly different framing
and a second source to keep in sync.

Regenerate with:

```bash
M=public/kapman-mark.png
# Flatten once. The asset carries an alpha channel but is 0% transparent;
# iOS composites any transparency to black, so remove the channel.
magick "$M" -background "#12151c" -alpha remove -alpha off /tmp/bm-master.png
magick /tmp/bm-master.png -resize 180x180 src/app/apple-icon.png      # iOS home screen
magick /tmp/bm-master.png -resize 180x180 public/apple-touch-icon.png # iOS root probe
magick /tmp/bm-master.png -resize 32x32   src/app/icon.png            # browser tab
magick /tmp/bm-master.png -define icon:auto-resize=48,32,16 src/app/favicon.ico
magick /tmp/bm-master.png -resize 192x192 public/icons/icon-192.png
magick /tmp/bm-master.png -filter Lanczos -resize 512x512 public/icons/icon-512.png
magick /tmp/bm-master.png -resize 400x400 -background "#12151c" -gravity center \
  -extent 512x512 public/icons/icon-maskable-512.png          # Android safe zone
```

**The mark is 256×256, so `icon-512.png` is a 2× upscale.** It is acceptable
(Lanczos, and the artwork is flat-shaded vector-like geometry) but a 512px or
larger master from Design would be strictly better. Queued as a `NOTE`.

**The mark does not survive favicon sizes.** At 32px the two animal heads are
muddy; at 16px they are unreadable colour blobs. This is inherent to the
artwork, not the pipeline — a simplified small-size variant is the only real
fix if the browser-tab icon matters.

Two things that are easy to get wrong here:

- **Next's App Router file conventions win over `metadata.icons`.** Icons live at
  `src/app/{favicon.ico,icon.png,apple-icon.png}` and Next emits the `<link>`
  tags from them. Declaring the same icons in `metadata.icons` is silently
  ignored, and a `public/favicon.ico` alongside `src/app/favicon.ico` makes
  `/favicon.ico` return **500** — two handlers for one route.
- **`public/apple-touch-icon.png` is kept deliberately** even though the tag
  points at `/apple-icon.png`: iOS probes the site root for that exact filename
  when a page carries no apple-touch-icon tag.

The icon is opaque by design — iOS composites transparency to black on some
versions — and keeps margin because iOS applies its own squircle mask.
