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
function allowed(lines, index) {
  if (MARKER.test(lines[index])) return true;
  for (let i = index - 1; i >= 0 && index - i <= MAX_COMMENT_LINES; i -= 1) {
    if (MARKER.test(lines[i])) return true;
    if (CODE_BOUNDARY.test(lines[i])) break;
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
// looked up. The vendored theme is exempt; it is where values are allowed to
// live.
// ---------------------------------------------------------------------------
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/g;
for (const file of [...walk(SRC), APP_CSS]) {
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
// Rule 5 — shadowed primitives. This is the Screener's actual failure mode:
// re-implementing a theme primitive locally rather than using it. Any app CSS
// rule that repeats most of a primitive's declarations is that primitive,
// hand-rolled.
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

for (const [appSelector, appDecls] of appRules) {
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
  console.log(`\nPrimitive coverage: ${used.size}/${available.size} theme primitives used.`);
  if (findings.length) {
    console.log(`\n${findings.length} finding(s): ${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(", ")}`);
    console.log("Suppress a deliberate exception with a `design-lint-allow: <reason>` comment on or above the line.");
  } else {
    console.log("No design-system findings.");
  }
}

process.exit(findings.length ? 1 : 0);
