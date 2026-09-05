# design/ — vendored copies only

**The design system of record moved to `vkapella/kapman-design` on 2026-09-05**
(issue #355): theme source at `kapman-design/theme/`, shared scripts at
`kapman-design/scripts/`, Claude Design's bundle and amendments at
`kapman-design/bundle/260830/`, the rulings README, `SESSION-START.md`, the
`OPEN-WITH-DESIGN.md` tracker and `to-design/` batches all under `theme/`.

This directory now holds only the two vendored files, verbatim, exactly as the
sibling apps hold theirs:

| File | Upstream |
|---|---|
| `kapman-ui.css` | `kapman-design/theme/kapman-ui.css` |
| `kapman-grid.css` | `kapman-design/theme/kapman-grid.css` |

Do not edit them here. A theme change lands in `kapman-design` first, gets a
Vendor SHA, and is re-copied. `npm run lint:design` (CI) checks this repo's
usage of the theme; `npm run lint:design:vendor` additionally compares these
copies against the upstream when `../kapman-design` is checked out beside this
repo. `src/app/globals.css` remains the token authoring source until the open
ruling on self-consumption is answered (tracker, "design-spec-additions" item 4).
