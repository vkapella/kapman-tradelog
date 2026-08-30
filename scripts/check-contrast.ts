/**
 * UI-8 (decision 13): measure text contrast on the BUILT pages, not from
 * token arithmetic — two published ratios were wrong before pass 5 caught
 * them, which is the case for automating this.
 *
 * For every visible text node on each audited route, the in-page walker:
 *   1. resolves the text's used colour,
 *   2. composites the effective background by walking ancestors until the
 *      accumulated colour is opaque (alpha layers — accent-dim, pos-dim —
 *      composite over what is underneath; color-mix/oklch resolve via a
 *      1px canvas so no CSS colour parsing is reimplemented),
 *   3. computes the WCAG ratio and fails anything below 4.5:1.
 *
 * Exemptions: aria-hidden text, zero-size/invisible nodes, nodes under a
 * background-image (uncomputable → reported as skipped), and elements
 * carrying data-contrast-exempt — the sanctioned --text-4 non-text sites.
 *
 * Usage:
 *   npm run check:contrast                       # against BASE_URL or :3000
 *   npm run check:contrast -- --self-test        # inject a regression, expect failure
 *   npm run check:contrast -- --report           # print the measured token table
 */
import { chromium, type Page } from "playwright";

const BASE_URL = process.env.CONTRAST_BASE_URL ?? "http://localhost:3000";
const SELF_TEST = process.argv.includes("--self-test");
const REPORT = process.argv.includes("--report");

const ROUTES = [
  "/dashboard",
  "/today",
  "/analytics",
  "/positions",
  "/trade-records?tab=executions",
  "/trade-records?tab=matched-lots",
  "/trade-records?tab=setups",
  "/recommendations",
  "/imports?tab=upload",
  "/imports?tab=history",
  "/accounts",
  "/adjustments",
  "/tts-evidence",
  "/diagnostics",
];

const MIN_RATIO = 4.5;

interface Finding {
  route: string;
  selector: string;
  text: string;
  color: string;
  background: string;
  ratio: number;
}

interface WalkResult {
  findings: Finding[];
  skipped: number;
  checked: number;
}

async function walkPage(page: Page, route: string): Promise<WalkResult> {
  return page.evaluate((routeName: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    function toRgba(cssColor: string): [number, number, number, number] | null {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = cssColor; // invalid values keep the previous fillStyle
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2], data[3] / 255];
    }

    function luminance([r, g, b]: [number, number, number, number]): number {
      const chan = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
    }

    function ratio(fg: [number, number, number, number], bg: [number, number, number, number]): number {
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function compositeOver(top: [number, number, number, number], bottom: [number, number, number, number]): [number, number, number, number] {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (t: number, b: number) => (t * top[3] + b * bottom[3] * (1 - top[3])) / a;
      return [mix(top[0], bottom[0]), mix(top[1], bottom[1]), mix(top[2], bottom[2]), a];
    }

    function selectorFor(element: Element): string {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && parts.length < 4 && current !== document.body) {
        const id = current.id ? `#${current.id}` : "";
        const cls = typeof current.className === "string" && current.className ? "." + current.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
        parts.unshift(current.tagName.toLowerCase() + id + cls);
        current = current.parentElement;
      }
      return parts.join(" > ");
    }

    const findings: Array<{ route: string; selector: string; text: string; color: string; background: string; ratio: number }> = [];
    let skipped = 0;
    let checked = 0;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seenElements = new Set<Element>();

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      if (!text) continue;
      const element = node.parentElement;
      if (!element || seenElements.has(element)) continue;
      seenElements.add(element);

      if (element.closest("[aria-hidden='true'], [data-contrast-exempt], script, style, noscript")) continue;

      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      // composite background up the tree
      let bg: [number, number, number, number] = [0, 0, 0, 0];
      let cursor: Element | null = element;
      let unknowable = false;
      while (cursor) {
        const cursorStyle = getComputedStyle(cursor);
        if (cursorStyle.backgroundImage !== "none") {
          unknowable = true;
          break;
        }
        const layer = toRgba(cursorStyle.backgroundColor);
        if (layer && layer[3] > 0) {
          bg = compositeOver(bg, layer);
          if (bg[3] >= 0.999) break;
        }
        cursor = cursor.parentElement;
      }
      if (unknowable) {
        skipped += 1;
        continue;
      }
      if (bg[3] < 0.999) {
        // fell through to the root: composite over the body/canvas colour
        const bodyBg = toRgba(getComputedStyle(document.body).backgroundColor) ?? [8, 9, 12, 1];
        bg = compositeOver(bg, [bodyBg[0], bodyBg[1], bodyBg[2], 1]);
      }

      const fg = toRgba(style.color);
      if (!fg) {
        skipped += 1;
        continue;
      }
      // text colour with alpha composites over the background first
      const usedFg = fg[3] < 1 ? compositeOver(fg, bg) : fg;

      checked += 1;
      const measured = ratio(usedFg, bg);
      if (measured < 4.5) {
        findings.push({
          route: routeName,
          selector: selectorFor(element),
          text: text.slice(0, 40),
          color: style.color,
          background: `rgba(${bg.map((v, i) => (i === 3 ? v.toFixed(2) : Math.round(v))).join(",")})`,
          ratio: Math.round(measured * 100) / 100,
        });
      }
    }

    return { findings, skipped, checked };
  }, route);
}

async function measureTokenTable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const resolve = (token: string): [number, number, number] => {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#000";
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2]];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const chan = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
    };
    const ratio = (a: [number, number, number], b: [number, number, number]) => {
      const l1 = lum(a);
      const l2 = lum(b);
      return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
    };
    const texts = ["--text", "--text-2", "--text-3", "--text-4", "--accent"];
    const grounds = ["--bg", "--surface", "--surface-2", "--surface-3"];
    const lines: string[] = ["MEASURED token ratios (for reference §02):"];
    for (const t of texts) {
      const row = grounds.map((g) => `${g.replace("--", "")}=${ratio(resolve(t), resolve(g))}`).join("  ");
      lines.push(`  ${t.padEnd(9)} ${row}`);
    }
    return lines;
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // tsx/esbuild wraps nested functions in __name() helpers, which do not
  // exist inside the browser context page.evaluate serializes into.
  await page.addInitScript(() => {
    (globalThis as unknown as Record<string, unknown>).__name = (fn: unknown) => fn;
  });

  const allFindings: Finding[] = [];
  let totalChecked = 0;
  let totalSkipped = 0;

  for (const route of ROUTES) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
    if (SELF_TEST) {
      // Deliberate regression: --text-2 drops to the non-text tier. The gate
      // MUST fail and name selectors, or the gate itself is broken.
      await page.addStyleTag({ content: ":root { --text-2: #4f586c; }" });
      await page.waitForTimeout(100);
    }
    const result = await walkPage(page, route);
    allFindings.push(...result.findings);
    totalChecked += result.checked;
    totalSkipped += result.skipped;
    console.log(`${route.padEnd(36)} checked=${result.checked} skipped=${result.skipped} failing=${result.findings.length}`);
    if (SELF_TEST && allFindings.length > 0) break; // one route proves it
  }

  if (REPORT) {
    for (const line of await measureTokenTable(page)) {
      console.log(line);
    }
  }

  await browser.close();

  if (SELF_TEST) {
    if (allFindings.length > 0) {
      console.log(`\nSELF-TEST OK: deliberate regression produced ${allFindings.length} failure(s); first offender:`);
      const first = allFindings[0];
      console.log(`  ${first.route} ${first.selector} — ${first.ratio}:1 ("${first.text}")`);
      process.exit(0);
    }
    console.error("\nSELF-TEST FAILED: the injected regression was not detected — the gate is broken.");
    process.exit(1);
  }

  console.log(`\nTotal: ${totalChecked} text nodes checked, ${totalSkipped} skipped (background-image/unresolvable).`);
  if (allFindings.length > 0) {
    console.error(`\nCONTRAST GATE FAILED — ${allFindings.length} text node(s) below ${MIN_RATIO}:1\n`);
    for (const finding of allFindings.slice(0, 50)) {
      console.error(`  ${finding.ratio.toFixed(2)}:1  ${finding.route}\n         ${finding.selector}\n         "${finding.text}" — ${finding.color} on ${finding.background}\n`);
    }
    process.exit(1);
  }
  console.log("Contrast gate passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
