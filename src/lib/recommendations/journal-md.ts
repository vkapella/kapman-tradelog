/**
 * Parser for kapman-journal pass1/pass2 log files (markdown, one file per run).
 *
 * The files are LLM-authored and their table shapes drift run to run: rec_id
 * conventions differ (P2-01 vs P2-20260803-ETN), section headings differ,
 * column sets differ per section (Flagged tables may carry only
 * rec_id/ticker/reason). This parser is header-driven with a column-alias map,
 * derives the disposition from the enclosing section heading when the table
 * has no disposition column, and reports every row it cannot parse instead of
 * guessing. Nulls stay null.
 */

import {
  normalizeDisposition,
  normalizeStructure,
  optionTypeFromStructure,
  parseEntryRange,
  parseExpiration,
  parseStrikes,
  type NormalizedDisposition,
} from "@/lib/recommendations/normalize";
import type { RecommendationIngest, TradingEnvironmentValue } from "@/lib/recommendations/types";

export interface SkippedRow {
  line: number;
  reason: string;
  cells: Record<string, string>;
}

export interface ParsedJournalFile {
  rows: RecommendationIngest[];
  skipped: SkippedRow[];
}

type ColumnKey =
  | "recId"
  | "ticker"
  | "structure"
  | "disposition"
  | "strikes"
  | "expiration"
  | "entryRange"
  | "sizing"
  | "chainQuality"
  | "optionMid"
  | "reason";

const COLUMN_ALIASES: Record<string, ColumnKey> = {
  rec_id: "recId",
  recid: "recId",
  ticker: "ticker",
  structure: "structure",
  disposition: "disposition",
  state: "disposition",
  strike: "strikes",
  strikes: "strikes",
  "strike(s)": "strikes",
  "strike/legs": "strikes",
  expiration: "expiration",
  exp: "expiration",
  "entry range": "entryRange",
  entry_range: "entryRange",
  sizing: "sizing",
  "sizing band": "sizing",
  "sizing (p1→p2)": "sizing",
  "chain quality": "chainQuality",
  chain_quality: "chainQuality",
  option_mid: "optionMid",
  "option mid": "optionMid",
  reason: "reason",
};

function parseFrontmatter(lines: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (lines[0]?.trim() !== "---") return result;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

function dispositionFromHeading(heading: string): NormalizedDisposition | null {
  const lower = heading.toLowerCase();
  if (lower.includes("validated")) return "VALIDATED";
  if (lower.includes("flagged")) return "FLAGGED";
  if (lower.includes("rejected")) return "REJECTED";
  return null;
}

function lineageFromPath(relativePath: string): string | null {
  const base = relativePath.split("/").pop() ?? "";
  // Prefix match: canonical names are <lineage>.md, but variants like
  // "VS-20260727-2348-01-pass2.md" exist; the lineage is still the prefix.
  const match = base.match(/^([A-Z]{2}-\d{8}-\d{4}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Since journal_schema_version 4.1 run records are named by their run_id stem,
 * `<lineage>-RNN.md` (JOURNAL_MGMT "Run ID format"). The run is read from the
 * frontmatter first and the filename second; two runs off one handoff must
 * never collapse into one recId (#349).
 */
function runIdFromPath(relativePath: string): string | null {
  const base = relativePath.split("/").pop() ?? "";
  const match = base.match(/^([A-Z]{2}-\d{8}-\d{4}-\d{2}-R\d+)/);
  return match ? match[1] : null;
}

/**
 * The as_of key itself drifts across runs (as_of / date / session_date, or
 * absent). The lineage ID is derived from the export's own exported_at
 * timestamp (JOURNAL_MGMT), so reading the date out of the lineage is
 * derivation from the canonical source, not a guess.
 */
function resolveAsOf(frontmatter: Record<string, string>, lineageId: string): string | null {
  for (const key of ["as_of", "date", "session_date"]) {
    const value = frontmatter[key];
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  const fromLineage = lineageId.match(/^[A-Z]{2}-(\d{4})(\d{2})(\d{2})-/);
  return fromLineage ? `${fromLineage[1]}-${fromLineage[2]}-${fromLineage[3]}` : null;
}

/** kb writes `environment: live | paper`; anything else is left unset, never guessed. */
function normalizeEnvironment(value: string | undefined): TradingEnvironmentValue | null {
  const upper = value?.trim().toUpperCase();
  return upper === "LIVE" || upper === "PAPER" ? upper : null;
}

function passFromPath(relativePath: string, kind: string | undefined): "PASS1" | "PASS2" | null {
  if (relativePath.includes("/pass1/") || kind === "pass1_log") return "PASS1";
  if (relativePath.includes("/pass2/") || kind === "pass2_log") return "PASS2";
  return null;
}

function emptyCell(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "—" || trimmed === "-";
}

export function parseJournalLogFile(content: string, relativePath: string): ParsedJournalFile {
  const lines = content.split("\n");
  const frontmatter = parseFrontmatter(lines);
  const lineageId = lineageFromPath(relativePath);
  const runId = frontmatter.run_id?.trim() || runIdFromPath(relativePath);
  const legalEntitySlug = frontmatter.legal_entity?.trim() || null;
  const environment = normalizeEnvironment(frontmatter.environment);
  const pass = passFromPath(relativePath, frontmatter.kind);
  const rows: RecommendationIngest[] = [];
  const skipped: SkippedRow[] = [];

  if (!lineageId) {
    skipped.push({ line: 0, reason: `cannot derive lineage from filename: ${relativePath}`, cells: {} });
    return { rows, skipped };
  }
  if (!pass) {
    skipped.push({ line: 0, reason: `cannot determine pass from path/kind: ${relativePath}`, cells: {} });
    return { rows, skipped };
  }

  const asOf = resolveAsOf(frontmatter, lineageId);
  if (!asOf) {
    skipped.push({
      line: 0,
      reason: "no as_of/date/session_date in frontmatter and none derivable from lineage",
      cells: {},
    });
    return { rows, skipped };
  }

  let currentHeading = "";
  let header: (ColumnKey | null)[] | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith("#")) {
      currentHeading = line.replace(/^#+\s*/, "");
      header = null;
      continue;
    }

    if (!line.trimStart().startsWith("|")) {
      header = null;
      continue;
    }

    if (isSeparatorRow(line)) continue;

    const cells = splitTableRow(line);

    const looksLikeHeader = cells.some((cell) => COLUMN_ALIASES[cell.toLowerCase()] === "recId");
    if (looksLikeHeader) {
      header = cells.map((cell) => COLUMN_ALIASES[cell.toLowerCase()] ?? null);
      continue;
    }

    if (!header) continue;

    const record: Partial<Record<ColumnKey, string>> = {};
    header.forEach((key, index) => {
      if (key && !emptyCell(cells[index])) record[key] = cells[index].trim();
    });
    const cellsForReport = Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, value ?? ""]),
    );

    const localRecId = record.recId;
    const ticker = record.ticker;
    if (!localRecId || !ticker) {
      skipped.push({ line: i + 1, reason: "row missing rec_id or ticker", cells: cellsForReport });
      continue;
    }

    const disposition =
      normalizeDisposition(record.disposition) ?? dispositionFromHeading(currentHeading);
    if (!disposition) {
      skipped.push({
        line: i + 1,
        reason: `no disposition: column absent/unrecognized ("${record.disposition ?? ""}") and section heading "${currentHeading}" names none`,
        cells: cellsForReport,
      });
      continue;
    }

    const structure = normalizeStructure(record.structure);
    const strikes = parseStrikes(record.strikes);
    const entryRange = parseEntryRange(record.entryRange);
    const expiration = parseExpiration(record.expiration);
    const optionMid = record.optionMid ? Number(record.optionMid.replace(/[^0-9.]/g, "")) : null;
    const optionType = strikes?.optionType ?? optionTypeFromStructure(structure);

    rows.push({
      // A scoped run keys its rows on the run so two runs off one handoff
      // never collide; legacy files keep the lineage key (#349).
      recId: `${runId ?? lineageId}/${localRecId}`,
      lineageId,
      localRecId,
      runId,
      legalEntitySlug,
      environment,
      pass,
      disposition,
      asOf,
      decidedAtRaw: frontmatter.decided_at ?? null,
      decidedAt: null,
      ticker: ticker.toUpperCase(),
      structure,
      structureRaw: record.structure ?? null,
      direction: null,
      reason: record.reason ?? null,
      optionType,
      strike: strikes?.strike ?? null,
      strikeShort: strikes?.strikeShort ?? null,
      expirationDate: expiration,
      entryRangeLow: entryRange?.low ?? null,
      entryRangeHigh: entryRange?.high ?? null,
      entryRangeRaw: record.entryRange ?? null,
      sizingBand: record.sizing ?? null,
      chainQuality: record.chainQuality ?? null,
      optionMid: optionMid !== null && Number.isFinite(optionMid) ? optionMid : null,
      underlyingRef: null,
      journalSchemaVersion: frontmatter.journal_schema_version ?? null,
      sourceFile: relativePath,
      raw: { heading: currentHeading, cells: cellsForReport },
    });
  }

  return { rows, skipped };
}
