# Start here

You are one of three sessions working the KapMan unified-UI programme. Read
this first — it is three minutes, and it exists because every rule below was
learned by something going wrong.

## The three repos

| Repo | App | Stack | Role |
|---|---|---|---|
| `kapman-tradelog` | Tradelog | Next.js · Tailwind | **Owns the shared theme and tooling.** Integration point. |
| `kapman-polygon-viewer` | Screener | React/Vite · plain CSS · FastAPI | Consumer |
| `kapman-fair-value-tool` | Fair Value | React/Vite · Tailwind · Express | Consumer |

Design package: `~/kapman-design-handoff260830/` (sibling of the repos).
Read `AMENDMENT-01.md` and `AMENDMENT-02.md` **before** the issue files — the
amendments override them, and the bundle no longer ships CSS.

## Read order

1. This file.
2. `kapman-tradelog/design/OPEN-WITH-DESIGN.md` — what is in flight with
   Design, what came back, what is queued. **Check it before reporting a
   finding**; someone may already have it.
3. `kapman-tradelog/design/README.md` — the theme, the role mapping table, the
   hard rules, the shared tooling.
4. Your own repo's `issues/kapman-<repo>-issues.md`.

## Governance

**Theme changes.** The theme lives in `kapman-tradelog/design/`. Consumers copy
it verbatim and never edit their copy. To change it:

1. Work in a **detached `git worktree`**, not a checkout in the shared clone.
   Three sessions share this filesystem; a checkout moves `main` under someone
   else's build. (Fair Value worked this out first; adopt it.)
2. Branch `theme/<short-name>`, **`design/` only** — never `src/`, `scripts/`,
   or `package.json`.
3. **Never `--amend`, rebase, or force-push** anything that might already carry
   another session's work. Rebasing your *own unmerged* handoff branch onto
   `origin/main` is the one sanctioned exception.
4. `git fetch && git rebase origin/main` before handoff, then report the branch
   name and one line on what it fixes. A stale base makes
   `git diff origin/main..branch` show the owner's newer work as deletions —
   one branch appeared to revert 221 lines and did not.
5. The Tradelog session merges, documents it in `design/README.md`, and
   announces the next Vendor SHA.

**Re-vendoring.** Detection and authorisation are separate:

- A **vendor-integrity gate** detects that upstream changed and alerts. It
  cannot tell whether the owner had *finished* changing it.
- The **Vendor SHA** below authorises. Re-vendor when it is newer than your
  copy. Never on drift detection alone.

## Findings: classify, and only ever stall on the first kind

| Class | Meaning | What you do |
|---|---|---|
| `BLOCKING` | Cannot proceed without a ruling | Append, tell the operator now, stop **that issue only** |
| `RULING` | Can proceed on a stated assumption | Implement, state the assumption in the commit, append |
| `NOTE` | Spec should record it; no action | Append only |

Append to **QUEUED** in `OPEN-WITH-DESIGN.md`. **Do not send Design your own
document** — the owner batches, dedupes, and merges corroborations. Two repos
independently hitting one defect is far more persuasive than one repo asserting
a rule, and that leverage was lost twice before this file existed.

Ground a finding in code before raising it. Quote file and line. The package's
own "current state" claims were wrong more than once — the Tradelog token
tables described a draft, not the repo.

## Shared tooling

Three checks live in `kapman-tradelog/scripts/` and are copied outward like the
CSS. Each was written by whichever repo hit the problem first.

| Script | Asks |
|---|---|
| `check-contrast.ts` | Does every text node clear 4.5:1 against its *composited* background? |
| `check-design-system.mjs` | Is this repo using the theme correctly? |
| …its `vendor-integrity` rule | Is this repo using the **real** theme, byte for byte? |

`token-parity` and `shadowed-primitive` are gated on whether your app imports
`kapman-ui.css`; a consumer satisfies parity by construction.

## Lessons that cost real time

- **Silent success is the dangerous failure mode.** Hit three times
  independently: a contrast gate reported "passed" having measured *zero*
  nodes; a lint suppression whose reason contained a semicolon was silently
  ignored; a lint counted 63 GitHub issue references (`#340`) as raw colours.
  If a check can pass vacuously, make it fail loudly instead.
- **Verify the tool before acting on its output.** The design lint reported 233
  findings; 90 were the tool. Fix the tool first or you chase ghosts.
- **Verify claims against code — including your own.** Four of six chip
  enumerations Design inferred were wrong; two more were missed entirely.
- **Independence is the mechanism, not overhead.** Nearly every real find came
  from a repo seeing what the others structurally could not: the Screener
  (plain CSS) found the theme's dependency on Tailwind's preflight; it also
  found the `token-parity` bug because it is a consumer and Tradelog is the
  author. Do not assume another session has already noticed something.
- **Framework conventions beat configuration.** Next's App Router file
  conventions (`app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`)
  silently override `metadata.icons`, and a duplicate `public/favicon.ico`
  makes the route 500.
- **zsh does not word-split unquoted expansions.** `for f in $FILES` iterates
  once with the whole list. Use `while IFS= read -r`.

## Current state — 2026-08-31

- **Vendor SHA: `af0c364`.** Amendment 03 / decision 49 — the semantic border
  tokens. `kapman-ui.css` only; the grid CSS and `check-design-system.mjs` are
  unchanged since `2336389`.
- Tradelog: UI-0 → UI-8, UI-C, and UI-D0/D1/D2-part-1 merged; in production at
  Fly v39. Design lint at 25 findings (18 blocked on a ruling, 7 `z-index`).
- **10 items open with Design, 22 queued.** Two are `BLOCKING`: the Screener's
  cross-language `SavedView` contract, and the semantic palette's missing
  border variant. Batch 01 has been sent.

Before you deploy anything: clean tree, and `origin/main` matching local. A
deploy once stamped its release SHA while another session's commit was landing.
