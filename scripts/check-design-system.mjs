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

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
// Tradelog owns the theme, so the source of truth is design/ at the repo root
// and the app's own token block is src/app/globals.css.
const THEME = join(ROOT, "design", "kapman-ui.css");
const APP_CSS = join(SRC, "app", "globals.css");

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

for (const file of walk(SRC)) {
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
// APP_CSS is the app's :root — the token definitions themselves. Linting it
// for raw colour asks the source of truth to look itself up.
for (const file of walk(SRC).filter((f) => f !== APP_CSS)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    if (allowed(lines, i)) return;
    for (const match of text.matchAll(COLOR_RE)) {
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

{
  const appTokens = parseTokens(readFileSync(APP_CSS, "utf8"));
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
const appRules = parseRules(readFileSync(APP_CSS, "utf8"));
const SHADOW_THRESHOLD = 3;

// Does this repo load the theme at all? If not, it is the author, not a
// consumer, and primitive-based rules do not apply to it.
const CONSUMES_THEME = /@import[^;]*kapman-ui\.css|kapman-ui\.css["']/.test(
  readFileSync(APP_CSS, "utf8") + walk(SRC).map((f) => readFileSync(f, "utf8")).join("\n"),
);

for (const [appSelector, appDecls] of CONSUMES_THEME ? appRules : []) {
  for (const [themeSelector, themeDecls] of themeRules) {
    if (!themeSelector.startsWith(".km-")) continue;
    const shared = [...appDecls].filter((d) => themeDecls.has(d));
    if (shared.length >= SHADOW_THRESHOLD) {
      report("shadowed-primitive", APP_CSS, 0,
        `"${appSelector}" repeats ${shared.length} declarations of the theme's "${themeSelector}". Use the primitive instead of re-implementing it.`);
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
const available = new Set(primitives);
const sourceText = walk(SRC).map((f) => readFileSync(f, "utf8")).join("\n");
const used = new Set([...available].filter((name) => sourceText.includes(name)));

const json = process.argv.includes("--json");
if (json) {
  console.log(JSON.stringify({ findings, coverage: { used: used.size, available: available.size } }, null, 2));
} else {
  const byRule = findings.reduce((acc, f) => ({ ...acc, [f.rule]: (acc[f.rule] || 0) + 1 }), {});
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line || "?"}  [${finding.rule}]  ${finding.message}`);
  }
  console.log(
    CONSUMES_THEME
      ? `\nPrimitive coverage: ${used.size}/${available.size} theme primitives used.`
      : `\nPrimitive coverage: n/a — this repo authors the theme rather than importing it.`,
  );
  if (findings.length) {
    console.log(`\n${findings.length} finding(s): ${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(", ")}`);
    console.log("Suppress a deliberate exception with a `design-lint-allow: <reason>` comment on or above the line.");
  } else {
    console.log("No design-system findings.");
  }
}

process.exit(findings.length ? 1 : 0);
