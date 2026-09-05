import { describe, expect, it } from "vitest";
import { parseJournalLogFile, unquoteFrontmatterScalar } from "./journal-md";

// Excerpts below reproduce the real observed shapes of the journal logs.

const PASS2_20260807 = `---
kind: pass2_log
parent_pass1: log/pass1/2026-08/VS-20260807-1425-01.md
as_of: 2026-08-07
decided_at: 2026-08-07T~10:35-10:45 ET (session)
journal_schema_version: 4.0
---

# Pass 2 log — 21 Eligible candidates from VS-20260807-1425-01

## Validated — Full chain, no material drift (11)

| rec_id | ticker | structure | strike/legs | expiration | entry range | chain quality |
|---|---|---|---|---|---|---|
| P2-01 | AMZN | Long Call | 280 | 2026-11-20 (105d) | $16.60–$16.90 | Full |
| P2-02 | HON | Call Debit Spread | 250C/270C | 2026-10-16 (70d) | ~$6.70 debit | Full |

## Flagged (5) — operator acknowledgment required before treating as executable

| rec_id | ticker | reason |
|---|---|---|
| P2-17 | LEU | Material dealer regime reversal: Pass 1 DGPI +45.98 → Pass 2 −43.72. |
`;

const PASS2_20260803 = `---
kind: pass2_log
as_of: 2026-08-03
journal_schema_version: 4.0
---

# Pass 2 log

## Output

| rec_id | ticker | structure | disposition | strike(s) | expiration | entry_range | sizing (P1→P2) | option_mid |
|---|---|---|---|---|---|---|---|---|
| P2-20260803-ETN | ETN | long_call | Validated | 440 | 2026-10-16 | $27.30–$30.90 | Upper→Mid (~2%) | 29.10 |
| P2-20260803-APH | APH | vertical_spread | Validated | 160/175 | 2026-11-20 | net debit $6.20–$7.40 | Upper→Mid (~2%) | 6.20 |
`;

const PASS1_20260807 = `---
kind: pass1_log
source_handoff: VS-20260807-1425-01
as_of: 2026-08-07
decided_at: 2026-08-07T10:28 ET (session)
journal_schema_version: 4.0
---
# Pass 1 log VS-20260807-1425-01

| rec_id | ticker | disposition | structure | sizing | reason |
|---|---|---|---|---|---|
| P1-001 | APPN | ELIGIBLE | LONG_CALL | floor | naked permitted — IV/HV 0.6732 below 1.2 |
| P1-002 | CXM | NO_TRADE | NONE | — | dealer veto — dealer confidence invalid |
| P1-003 | FRSH | WAIT | NONE | — | pending flagged-reading exchange |
`;

describe("parseJournalLogFile — 2026-08-07 pass2 shape", () => {
  const parsed = parseJournalLogFile(PASS2_20260807, "log/pass2/2026-08/VS-20260807-1425-01.md");

  it("derives disposition from the section heading when the table has no column", () => {
    expect(parsed.skipped).toEqual([]);
    const amzn = parsed.rows.find((row) => row.ticker === "AMZN");
    expect(amzn).toMatchObject({
      recId: "VS-20260807-1425-01/P2-01",
      lineageId: "VS-20260807-1425-01",
      pass: "PASS2",
      disposition: "VALIDATED",
      structure: "LONG_CALL",
      strike: 280,
      strikeShort: null,
      optionType: "CALL",
      expirationDate: "2026-11-20",
      entryRangeLow: 16.6,
      entryRangeHigh: 16.9,
      asOf: "2026-08-07",
    });
  });

  it("parses the spread row with per-leg strikes and a point net debit", () => {
    const hon = parsed.rows.find((row) => row.ticker === "HON");
    expect(hon).toMatchObject({
      recId: "VS-20260807-1425-01/P2-02",
      structure: "CALL_DEBIT_SPREAD",
      strike: 250,
      strikeShort: 270,
      optionType: "CALL",
      expirationDate: "2026-10-16",
      entryRangeLow: 6.7,
      entryRangeHigh: 6.7,
    });
  });

  it("parses the reason-only Flagged table", () => {
    const leu = parsed.rows.find((row) => row.ticker === "LEU");
    expect(leu).toMatchObject({
      recId: "VS-20260807-1425-01/P2-17",
      disposition: "FLAGGED",
      structure: null,
      strike: null,
    });
    expect(leu?.reason).toContain("dealer regime reversal");
  });
});

describe("parseJournalLogFile — 2026-08-03 pass2 shape", () => {
  const parsed = parseJournalLogFile(PASS2_20260803, "log/pass2/2026-08/VS-20260803-1353-01.md");

  it("reads the disposition column and option_mid", () => {
    expect(parsed.skipped).toEqual([]);
    const etn = parsed.rows.find((row) => row.ticker === "ETN");
    expect(etn).toMatchObject({
      recId: "VS-20260803-1353-01/P2-20260803-ETN",
      disposition: "VALIDATED",
      structure: "LONG_CALL",
      strike: 440,
      entryRangeLow: 27.3,
      entryRangeHigh: 30.9,
      optionMid: 29.1,
    });
  });

  it("keeps vertical_spread unspecific — no option type is invented", () => {
    const aph = parsed.rows.find((row) => row.ticker === "APH");
    expect(aph).toMatchObject({
      structure: "VERTICAL_SPREAD",
      optionType: null,
      strike: 160,
      strikeShort: 175,
      entryRangeLow: 6.2,
      entryRangeHigh: 7.4,
    });
  });
});

describe("parseJournalLogFile — pass1 shape", () => {
  const parsed = parseJournalLogFile(PASS1_20260807, "log/pass1/2026-08/VS-20260807-1425-01.md");

  it("parses eligible, no-trade, and wait rows", () => {
    expect(parsed.skipped).toEqual([]);
    expect(parsed.rows.map((row) => [row.localRecId, row.disposition, row.structure])).toEqual([
      ["P1-001", "ELIGIBLE", "LONG_CALL"],
      ["P1-002", "NO_TRADE", "NONE"],
      ["P1-003", "WAIT", "NONE"],
    ]);
    expect(parsed.rows[0].pass).toBe("PASS1");
  });
});

describe("parseJournalLogFile — refusals", () => {
  it("skips rows with no derivable disposition instead of guessing", () => {
    const content = `---
kind: pass2_log
as_of: 2026-08-07
---
## Notes

| rec_id | ticker |
|---|---|
| P2-01 | AMZN |
`;
    const parsed = parseJournalLogFile(content, "log/pass2/2026-08/VS-20260807-1425-01.md");
    expect(parsed.rows).toEqual([]);
    expect(parsed.skipped).toHaveLength(1);
    expect(parsed.skipped[0].reason).toContain("no disposition");
  });

  it("derives as_of from the lineage when frontmatter carries no date key", () => {
    const content = `---
kind: pass2_log
---
## Validated

| rec_id | ticker | structure | strike | expiration | entry range |
|---|---|---|---|---|---|
| P2-01 | AMZN | Long Call | 280 | 2026-11-20 | $16.60–$16.90 |
`;
    const parsed = parseJournalLogFile(content, "log/pass2/2026-08/VS-20260807-1425-01.md");
    expect(parsed.rows[0].asOf).toBe("2026-08-07");
  });

  it("reads the drifted date/session_date frontmatter keys", () => {
    const content = `---
session_date: 2026-08-10
---
## Validated

| rec_id | ticker | structure | strike | expiration | entry range |
|---|---|---|---|---|---|
| P2-01 | AMD | Long Call | 200 | 2026-11-20 | $10.00–$11.00 |
`;
    const parsed = parseJournalLogFile(content, "log/pass2/2026-08/VS-20260810-1449-01.md");
    expect(parsed.rows[0].asOf).toBe("2026-08-10");
  });

  it("extracts the lineage prefix from variant filenames", () => {
    const content = `---
kind: pass2_log
---
## Validated

| rec_id | ticker | structure | strike | expiration | entry range |
|---|---|---|---|---|---|
| P2-01 | AMD | Long Call | 200 | 2026-11-20 | $10.00–$11.00 |
`;
    const parsed = parseJournalLogFile(content, "log/pass2/2026-07/VS-20260727-2348-01-pass2.md");
    expect(parsed.rows[0].lineageId).toBe("VS-20260727-2348-01");
  });

  // #349: two runs off one handoff (personal + corporate) share the lineage
  // and local rec ids; the run keys them apart. Legacy files keep the lineage key.
  it("keys scoped run records on the run so two runs off one handoff never collide", () => {
    const table = [
      "## Validated",
      "",
      "| rec_id | ticker | structure | strike | expiration | entry range |",
      "|---|---|---|---|---|---|",
      "| P2-01 | MSFT | Long Call | 510 | 2026-11-20 | $12.00–$13.00 |",
    ].join("\n");
    const personal = parseJournalLogFile(
      ["---", "kind: pass2_log", "run_id: VS-20260901-1400-01-R1", "source_lineage_id: VS-20260901-1400-01", "legal_entity: personal-vkapella", "environment: live", "date: 2026-09-01", "---", table].join("\n"),
      "log/pass2/2026-09/VS-20260901-1400-01-R1.md",
    );
    const corporate = parseJournalLogFile(
      ["---", "kind: pass2_log", "date: 2026-09-01", "legal_entity: kapman-capital", "environment: LIVE", "---", table].join("\n"),
      "log/pass2/2026-09/VS-20260901-1400-01-R2.md",
    );

    expect(personal.rows[0]).toMatchObject({
      recId: "VS-20260901-1400-01-R1/P2-01",
      lineageId: "VS-20260901-1400-01",
      runId: "VS-20260901-1400-01-R1",
      legalEntitySlug: "personal-vkapella",
      environment: "LIVE",
    });
    // Run read from the filename stem when the frontmatter lacks run_id.
    expect(corporate.rows[0]).toMatchObject({
      recId: "VS-20260901-1400-01-R2/P2-01",
      lineageId: "VS-20260901-1400-01",
      runId: "VS-20260901-1400-01-R2",
      legalEntitySlug: "kapman-capital",
      environment: "LIVE",
    });
    expect(personal.rows[0].recId).not.toBe(corporate.rows[0].recId);
  });

  it("leaves legacy single-run files unscoped and keyed on the lineage", () => {
    const parsed = parseJournalLogFile(PASS2_20260807, "log/pass2/2026-08/VS-20260807-1425-01.md");
    expect(parsed.rows[0]).toMatchObject({
      recId: "VS-20260807-1425-01/P2-01",
      runId: null,
      legalEntitySlug: null,
      environment: null,
    });
  });

  it("refuses a file whose name carries no lineage", () => {
    const parsed = parseJournalLogFile("# old format", "log/pass2/2026-06/PASS2-20260629-1352-live.md");
    expect(parsed.rows).toEqual([]);
    expect(parsed.skipped[0].reason).toContain("lineage");
  });
});

describe("unquoteFrontmatterScalar", () => {
  it("strips a single pair of wrapping quotes and keeps everything else verbatim", () => {
    expect(unquoteFrontmatterScalar("'4.0'")).toBe("4.0");
    expect(unquoteFrontmatterScalar('"4.2"')).toBe("4.2");
    expect(unquoteFrontmatterScalar("4.0")).toBe("4.0");
    expect(unquoteFrontmatterScalar("  VS-20260904-0228-01-R2 ")).toBe("VS-20260904-0228-01-R2");
    expect(unquoteFrontmatterScalar("'unterminated")).toBe("'unterminated");
  });
});
