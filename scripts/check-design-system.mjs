#!/usr/bin/env node
// Design-system lint (handoff 260830).
//
// Authored in kapman-fair-value-tool and adopted here verbatim except for
// paths. Tradelog owns the shared theme, so this now lives alongside it as
// shared tooling: the Screener copies it from here the way it copies the CSS.
//
// Why this exists: the Screener shipped a hand-rolled equivalent of the shared
// theme — one `km-` usage against 43 available primitives — and nothing caught
// it until someone thought to grep. Reviewing for "did you use the theme?" is
// exactly the kind of check a human stops doing; this makes the regression
// fail CI instead.
//
// Every rule below is a mechanical restatement of a rule the spec already
// carries. Suppress a single line with a trailing or preceding comment
// containing `design-lint-allow: <reason>` — the reason is required, so an
// exemption has to be argued for in the diff.
//
// Usage: node scripts/check-design-system.mjs [--json]

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// SRC and APP_CSS describe the APP BEING LINTED, which is not always this
// repo: a consuming sibling runs this script from its own root against our
// path. While these derived from the script's own location, CONSUMES_THEME
// below was computed over Tradelog's source no matter who ran it — so a
// consumer got `No design-system findings` for a repo the tool never opened.
// The fourth silent success this programme has paid for. Screener, 2026-08-31.
const SRC = process.env.KAPMAN_APP_SRC
  ? resolve(process.env.KAPMAN_APP_SRC)
  : join(ROOT, "src");
// Tradelog owns the theme, so the source of truth is design/ at the repo root
// and the app's own token block is src/app/globals.css.
// Vendor integrity (decision 04: "copy VERBATIM ... do not edit the copies").
// A consuming repo holds its copy under VENDOR_DIR and must match the source
// of truth byte for byte. THEME_SOURCE points at the authoring repo's design/;
// when it is absent (CI without the sibling checkout) the rule SKIPS loudly
// rather than passing silently. In the authoring repo VENDOR_DIR === the
// source, so the rule is a self-comparison and trivially passes.
const VENDOR_DIR = process.env.KAPMAN_VENDOR_DIR
  ? resolve(process.env.KAPMAN_VENDOR_DIR)
  : join(ROOT, "design");
const THEME_SOURCE = process.env.KAPMAN_THEME_SOURCE
  ? resolve(process.env.KAPMAN_THEME_SOURCE)
  : join(ROOT, "design");
const VENDORED_FILES = ["kapman-ui.css", "kapman-grid.css"];
// Lint against the theme THIS repo actually ships. In the authoring repo
// VENDOR_DIR defaults to design/, so this is the same file it always was; in a
// consumer it reads their vendored copy rather than ours, which matters the
// moment a consumer is stale.
const THEME = join(VENDOR_DIR, "kapman-ui.css");
const APP_CSS = process.env.KAPMAN_APP_CSS
  ? resolve(process.env.KAPMAN_APP_CSS)
  : join(SRC, "app", "globals.css");

// Missing app source: HARD FAIL when the path was explicitly configured — a
// wrong KAPMAN_APP_SRC must never read as a clean run — but warn and skip on
// defaults, which is a consumer with no app CSS of its own, or CI without the
// sibling checked out. Same split vendor-integrity uses for a missing theme
// source; a uniform hard fail would break a legitimate configuration.
function missingAppSource(label, path, envVar) {
  if (process.env[envVar]) {
    console.error(
      `ERROR ${label} not found at ${path} — ${envVar} is set, so this is a ` +
        `configuration error, not an absent optional file. Fix the path.`,
    );
    process.exit(2);
  }
  console.warn(
    `WARN  ${label} not found at ${path}. Source rules SKIPPED, not passed — ` +
      `set ${envVar} to the app you mean to lint.`,
  );
  return false;
}
// The trap that produced the original report: pointing VENDOR_DIR at another
// repo while leaving the app source defaulted means the flags below are
// evaluated over THIS repo and the summary describes a repo nobody asked
// about. Legitimate for a vendor-integrity-only drift check, so it warns
// rather than fails — but it must say so, because the summary line alone
// reads as a clean bill of health.
if (process.env.KAPMAN_VENDOR_DIR && !process.env.KAPMAN_APP_SRC
    && resolve(VENDOR_DIR) !== resolve(join(ROOT, "design"))) {
  console.warn(
    `WARN  KAPMAN_VENDOR_DIR points at ${VENDOR_DIR} but KAPMAN_APP_SRC is unset, ` +
      `so the source rules read ${SRC} — this script's own repo, not the vendored one. ` +
      `Set KAPMAN_APP_SRC/KAPMAN_APP_CSS, or ignore this if you meant a vendor-integrity-only check.`,
  );
}

const SRC_OK = existsSync(SRC) || missingAppSource("app source", SRC, "KAPMAN_APP_SRC");
const APP_CSS_OK = existsSync(APP_CSS) || missingAppSource("app CSS", APP_CSS, "KAPMAN_APP_CSS");

const findings = [];
const report = (rule, file, line, message) =>
  findings.push({ rule, file: relative(ROOT, file), line, message });

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "design") continue; // the vendored theme is not ours to lint
      if (entry === "node_modules" || entry === "__tests__") continue;
      walk(full, out);
    } else if ([".jsx", ".js", ".tsx", ".ts"].includes(extname(entry)) && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

// Walk once, and only if the source is actually there.
const SRC_FILES = SRC_OK ? walk(SRC) : [];
const APP_CSS_TEXT = APP_CSS_OK ? readFileSync(APP_CSS, "utf8") : "";

const MARKER = /design-lint-allow:\s*\S/;
const CODE_BOUNDARY = /[;{}]/;
const MAX_COMMENT_LINES = 6;

// A suppression covers its own line, or attaches to the comment block directly
// above it — so a reason long enough to be worth reading can wrap across
// lines. Walking back stops at the previous statement, which keeps a marker
// from silently covering code further down the file.
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

function allowed(lines, index) {
  if (MARKER.test(lines[index])) return true;
  for (let i = index - 1; i >= 0 && index - i <= MAX_COMMENT_LINES; i -= 1) {
    if (MARKER.test(lines[i])) return true;
    // Only real code ends the walk-back. Prose inside a comment routinely
    // contains a semicolon, and treating that as a statement boundary made a
    // multi-line reason silently fail to suppress — the worst failure mode
    // for a tool whose whole value is being trusted.
    if (!COMMENT_LINE.test(lines[i]) && CODE_BOUNDARY.test(lines[i])) break;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rule 1 — palette classes. Tailwind's stock palettes are not the shared
// scale; every colour reaches through a token alias (UI-0).
// Rule 2 — token escapes. `[color:var(--x)]` bypasses the alias layer and
// makes a migration unreviewable, which is why UI-0 built the aliases first.
// Rule 3 — z-index. The --z-* scale is the only sanctioned one; a bare z-[71]
// happens to match today and silently drifts tomorrow.
// ---------------------------------------------------------------------------
const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PALETTE_RE = new RegExp(`\\b(?:${PALETTE})-(?:50|100|200|300|400|500|600|700|800|900|950)\\b`, "g");
const ESCAPE_RE = /\[(?:color|background|background-color|border-color|fill|stroke):var\(--/g;
const Z_RE = /\bz-\[?(\d+)\]?\b/g;
const SANCTIONED_Z = new Set(["0", "10", "20", "30", "40", "42", "60", "61", "70", "71", "80"]);

for (const file of SRC_FILES) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    if (allowed(lines, i)) return;

    for (const match of text.matchAll(PALETTE_RE)) {
      report("palette-class", file, i + 1,
        `"${match[0]}" is a stock Tailwind palette colour. Use the token alias (bg-surface-2, text-text-3, border-border, …).`);
    }
    for (const match of text.matchAll(ESCAPE_RE)) {
      report("token-escape", file, i + 1,
        `"${match[0]}…" reaches a token through an arbitrary value. Add or use a tailwind.config alias instead.`);
    }
    for (const match of text.matchAll(Z_RE)) {
      if (!SANCTIONED_Z.has(match[1])) {
        report("z-index", file, i + 1,
          `z-index ${match[1]} is not on the --z-* scale (30 page controls, 40 topbar, 42 tabbar, 60/61 drawer, 70/71 sheet, 80 modal).`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Rule 4 — raw colour literals. A hex in app code is a token that was not
// looked up. Two things are exempt because they are where values legitimately
// live: the vendored theme, and the app's own token-definition file.
//
// Hex must be 6 or 8 digits. The 3-digit form matched this repo's GitHub issue
// references — `(#340)`, `#344` — 63 of them, which is most of what this rule
// originally reported. A 3-digit CSS colour is not worth reintroducing that
// noise for; none of the three apps uses one.
// ---------------------------------------------------------------------------
const COLOR_RE = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|\brgba?\(|\bhsla?\(|\boklch\(/g;
// A hex inside a COMMENT is documentation, not a colour the app ships. The
// Screener's format.ts:56 records a measured contrast decision —
// `// #1d7549 (not the old #1f7a4d): ... 4.45:1` — and both hexes were
// reported. Same family as the 3-digit issue-reference fix, different
// trigger; and a rule that fires on the rationale specifically punishes
// writing the rationale down. Block state is tracked across lines. The `://`
// guard keeps a URL from truncating its own line.
function stripComments(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = "";
    for (let i = 0; i < line.length; i += 1) {
      if (inBlock) {
        if (line.startsWith("*/", i)) {
          inBlock = false;
          i += 1;
        }
        continue;
      }
      if (line.startsWith("/*", i)) {
        inBlock = true;
        i += 1;
        continue;
      }
      if (line.startsWith("//", i) && line[i - 1] !== ":") break;
      out += line[i];
    }
    return out;
  });
}

// APP_CSS is the app's :root — the token definitions themselves. Linting it
// for raw colour asks the source of truth to look itself up.
for (const file of SRC_FILES.filter((f) => f !== APP_CSS)) {
  const lines = readFileSync(file, "utf8").split("\n");
  // Raw lines for allowed() — it reads comments to find the suppression
  // marker — and comment-stripped lines for matching.
  const code = stripComments(lines);
  lines.forEach((text, i) => {
    if (allowed(lines, i)) return;
    for (const match of code[i].matchAll(COLOR_RE)) {
      report("raw-color", file, i + 1,
        `raw colour "${match[0]}" — use a token from the shared theme, or mark the line with design-lint-allow and a reason.`);
    }
  });
}

// ---------------------------------------------------------------------------
// Rule 5 — shadowed primitives, and the coverage count below.
//
// Both only mean something in a repo that CONSUMES the vendored theme. The
// authoring repo (Tradelog) writes kapman-ui.css and never loads it — it
// re-expresses the same primitives as Tailwind utilities — so it scored 0/39
// and had its own `body` reported as a hand-rolled `.km-btn`. Those were
// false signals, not findings. Gate both on whether the app actually imports
// the theme.
// Does this repo CONSUME the vendored theme, or AUTHOR it? Three rules depend
// on the answer — shadowed-primitive, token parity, and the coverage count —
// because a consuming app has no :root and no reason to restate a primitive,
// while the authoring app has both by definition.
const CONSUMES_THEME = /@import[^;]*kapman-ui\.css|kapman-ui\.css["']/.test(
  APP_CSS_TEXT + SRC_FILES.map((f) => readFileSync(f, "utf8")).join("\n"),
);

// ---------------------------------------------------------------------------
// Rule 6 — token parity between the app's :root and the vendored theme.
//
// The authoring repo defines its tokens twice: once in its own :root, once in
// design/kapman-ui.css for the siblings to vendor. Nothing kept them in step
// except memory. This makes a divergence a build failure instead of a silent
// difference between production and what the other two apps copy.
//
// Restructuring into a shared tokens file would also fix it, but would force
// both siblings to vendor a third file and break their builds until they did.
// This gets the same protection at no coordination cost.
const APP_ONLY_TOKENS = new Map([
  ["--chart-purple", "app-local by design ruling — chart series identity is not a semantic token"],
  ["--vgrid-cols", "app-internal grid template, set inline per table; never a theme token"],
]);

function parseTokens(css) {
  const tokens = new Map();
  // Every definition of each token, in source order — NOT just the last one.
  // A token is often defined once in :root and overridden in a media query,
  // and the two files format that override differently (one multi-line, one
  // inline), so comparing only the final value compares different things.
  //
  // Normalise structure before matching rather than dropping the line anchor:
  // an unanchored match reads BEM selectors as declarations, because
  // `.km-btn--primary:hover` and `.km-cell--overridden::before` both contain
  // `--name:`. Splitting on braces and semicolons puts every real declaration
  // at the start of its own line, so the anchor can stay.
  const normalised = css.replace(/([{};])/g, "$1\n");
  for (const match of normalised.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
    const value = match[2].replace(/\s*\/\*.*/, "").trim();
    tokens.set(match[1], [...(tokens.get(match[1]) ?? []), value]);
  }
  return tokens;
}

const sameValues = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Skipped entirely in a consuming repo. The Screener imports the theme and
// deliberately has NO :root of its own — deleting it was the point of its
// UI-1 — so this rule demanded it hand-duplicate 48 token declarations, which
// is precisely the drift the rule exists to prevent. Reported by the Screener
// against 3ab9cc0, the same commit that fixed this split for two other rules
// and then reintroduced it in a third.
if (!APP_CSS_OK) {
  // Already warned above. Skipping is the point — reporting every theme token
  // as "missing from the app" against a file that does not exist is the same
  // false-clean failure in the other direction.
} else if (CONSUMES_THEME) {
  // Parity holds by construction: there is one copy of the tokens.
} else {
  const appTokens = parseTokens(APP_CSS_TEXT);
  const themeTokens = parseTokens(readFileSync(THEME, "utf8"));

  for (const [name, themeValue] of themeTokens) {
    if (!appTokens.has(name)) {
      report("token-parity", APP_CSS, 0,
        `"${name}" is in the vendored theme but missing from this app's :root — the siblings would get a token production does not have.`);
    } else if (!sameValues(appTokens.get(name), themeValue)) {
      report("token-parity", APP_CSS, 0,
        `"${name}" is [${appTokens.get(name).join(", ")}] here and [${themeValue.join(", ")}] in the vendored theme — production and the siblings disagree.`);
    }
  }
  for (const name of appTokens.keys()) {
    if (!themeTokens.has(name) && !APP_ONLY_TOKENS.has(name)) {
      report("token-parity", APP_CSS, 0,
        `"${name}" is defined here but not in the vendored theme. Add it there, or declare it in APP_ONLY_TOKENS with a reason.`);
    }
  }
}

// ---------------------------------------------------------------------------
function parseRules(css) {
  const rules = new Map();
  // Flat rule parse — good enough for a token/primitive sheet, which has no
  // nesting beyond @media blocks whose inner rules parse the same way.
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().split("\n").pop().trim();
    if (!selector || selector.startsWith("@") || selector.startsWith(":root")) continue;
    const decls = new Set(
      match[2]
        .split(";")
        .map((d) => d.trim().replace(/\s+/g, " ").toLowerCase())
        .filter((d) => d.includes(":") && !d.startsWith("/*"))
    );
    if (decls.size) rules.set(selector, decls);
  }
  return rules;
}

const themeRules = parseRules(readFileSync(THEME, "utf8"));
const appRules = parseRules(APP_CSS_TEXT);
// Score by COVERAGE OF THE PRIMITIVE, not by an absolute count of shared
// declarations. An absolute count cannot tell a copy from an idiom —
// `display:flex; align-items:center; gap` describes half the rules ever
// written — and it had a failure property that got worse as the theme got
// better: adding a declaration to a primitive can only ever ADD matches, so
// `.km-version-chip` gaining a legitimate 13ch bound manufactured new
// findings. Requiring one token-valued agreement (the first attempt at a fix)
// took the Screener 33 -> 22 but kept its named false positives, because
// border and radius are token-valued in every rule in the system.
//
// A ratio inverts that: unshared declarations grow the denominator, so
// enriching a primitive LOWERS the scores against it. The Screener's
// `.pb-col` case goes 3/11 -> 4/14 (27% -> 29%) and stays filtered. Measured
// on its styles.css this rule reports 2 where the previous one reported 22,
// and both survivors were worth reading.
//
// KNOWN BIAS, stated because this programme keeps paying for undocumented
// tool properties: coverage-of-primitive favours SMALL primitives.
// `.km-btn--primary` has 4 declarations, so 3 shared trips at 75%;
// `.km-btn` has ~14, so a genuine copy needs 7. Expect over-flagging of
// modifiers and under-flagging of copies of the big primitives. It is why the
// Screener's `.fb-btn` surfaced against `.km-pin` and not against `.km-btn` —
// the primitive it should actually adopt.
const SHADOW_MIN_SHARED = 3;
const SHADOW_MIN_COVERAGE = 0.5;

for (const [appSelector, appDecls] of CONSUMES_THEME ? appRules : []) {
  for (const [themeSelector, themeDecls] of themeRules) {
    if (!themeSelector.startsWith(".km-")) continue;
    const shared = [...appDecls].filter((d) => themeDecls.has(d));
    const coverage = shared.length / themeDecls.size;
    if (shared.length >= SHADOW_MIN_SHARED && coverage >= SHADOW_MIN_COVERAGE) {
      // Worded as a LEAD, not a verdict. Both of the Screener's survivors were
      // true findings under the wrong name: one was a third site for an
      // untokenised pairing, the other an adoption gap against a different
      // primitive than the one named. "Use the primitive instead of
      // re-implementing it" would have had both actioned wrongly.
      report("shadowed-primitive", APP_CSS, 0,
        `"${appSelector}" shares ${shared.length} of "${themeSelector}"'s ${themeDecls.size} declarations (${Math.round(coverage * 100)}%) — its closest match in the theme. Worth checking whether it should adopt a primitive, or whether the theme is missing one.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Coverage — informational. This is the number that would have exposed the
// Screener: primitives available versus primitives actually reached.
// ---------------------------------------------------------------------------
const primitives = [...themeRules.keys()]
  .flatMap((selector) => selector.split(",").map((s) => s.trim()))
  .filter((selector) => selector.startsWith(".km-"))
  .map((selector) => selector.replace(/^\./, "").split(/[\s:>[]/)[0]);
// ---- rule: vendor-integrity ------------------------------------------
// The check no sibling had. Everything else here asks "is this repo using the
// theme correctly?"; this asks "is this repo using the REAL theme?" — a copy
// edited in place passes every other rule while silently forking the design
// system. It caught a stale copy in kapman-polygon-viewer within minutes of
// kapman-tradelog@6d78e55 landing.
if (!existsSync(THEME_SOURCE)) {
  console.warn(
    `WARN  vendor-integrity SKIPPED — theme source not found at ${THEME_SOURCE}. ` +
      `Set KAPMAN_THEME_SOURCE to the authoring repo's design/ directory.`,
  );
} else if (resolve(VENDOR_DIR) !== resolve(THEME_SOURCE)) {
  for (const file of VENDORED_FILES) {
    const mine = join(VENDOR_DIR, file);
    const theirs = join(THEME_SOURCE, file);
    if (!existsSync(theirs)) {
      console.warn(`WARN  vendor-integrity: ${file} absent upstream — cannot compare.`);
      continue;
    }
    if (!existsSync(mine)) {
      report("vendor-integrity", mine, 0,
        `${file} is missing from the vendored theme directory.`);
      continue;
    }
    if (readFileSync(mine, "utf8") !== readFileSync(theirs, "utf8")) {
      report("vendor-integrity", mine, 0,
        `differs from the source of truth. Decision 04: the copy is never ` +
        `edited — land the change in the authoring repo's design/${file} on a ` +
        `theme/<name> branch, merge, then re-vendor. (diff "${mine}" "${theirs}")`);
    }
  }
}

const available = new Set(primitives);
const sourceText = SRC_FILES.map((f) => readFileSync(f, "utf8")).join("\n");
const used = new Set([...available].filter((name) => sourceText.includes(name)));

const json = process.argv.includes("--json");
if (json) {
  console.log(JSON.stringify({ findings, coverage: { used: used.size, available: available.size } }, null, 2));
} else {
  const byRule = findings.reduce((acc, f) => ({ ...acc, [f.rule]: (acc[f.rule] || 0) + 1 }), {});
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line || "?"}  [${finding.rule}]  ${finding.message}`);
  }
  // Name the source that was actually linted. Four times now this programme
  // has read a clean summary for a repo the tool never opened; a run that
  // states its own inputs cannot do that silently.
  // Relative when it is genuinely shorter, absolute otherwise — a path that
  // climbs out of cwd is less readable than the real one, and this line only
  // works if it is read.
  const shortPath = (path) => {
    const rel = relative(process.cwd(), path);
    return rel && !rel.startsWith("..") ? rel : path;
  };
  console.log(
    `\nLinted: ${shortPath(SRC)}${APP_CSS_OK ? `, ${shortPath(APP_CSS)}` : " (no app CSS)"} ` +
      `against ${shortPath(THEME)}`,
  );
  console.log(
    CONSUMES_THEME
      ? `Primitive coverage: ${used.size}/${available.size} theme primitives used.`
      : `Primitive coverage: n/a — this repo authors the theme rather than importing it.`,
  );
  if (findings.length) {
    console.log(`\n${findings.length} finding(s): ${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(", ")}`);
    console.log("Suppress a deliberate exception with a `design-lint-allow: <reason>` comment on or above the line.");
  } else {
    console.log("No design-system findings.");
  }
}

process.exit(findings.length ? 1 : 0);
