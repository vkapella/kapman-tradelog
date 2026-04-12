import { describe, expect, it } from "vitest";
import { parseFidelityCsv } from "@/lib/adapters/fidelity/parser";
import { transformFidelityRows } from "@/lib/adapters/fidelity/transformer";
import type { RawFidelityRow } from "@/lib/adapters/fidelity/types";
import { FIXTURE_ACCOUNT_ID, FIXTURE_FILENAME_10, FIXTURE_FILENAME_8, FIXTURE_FILENAME_9, loadFixtureBuffer } from "./fixture-data";

function loadRows(filename: string): RawFidelityRow[] {
  return parseFidelityCsv(loadFixtureBuffer(filename), filename);
}

function makeRow(overrides: Partial<RawFidelityRow>): RawFidelityRow {
  return {
    runDate: new Date("2025-01-02T00:00:00.000Z"),
    rawAction: "YOU BOUGHT CLOSING TRANSACTION",
    symbol: "-INTC250117C23",
    description: "CALL INTC JAN 17 25 $23",
    marginType: "Margin",
    price: 0.11,
    quantity: 1,
    commission: 0,
    fees: 0,
    accruedInterest: null,
    amount: -11.12,
    cashBalance: 1000,
    settlementDate: new Date("2025-01-03T00:00:00.000Z"),
    ...overrides,
  };
}

describe("transformFidelityRows", () => {
  it("uses absolute quantity for SELL rows", () => {
    const rows = loadRows(FIXTURE_FILENAME_10);
    const transformed = transformFidelityRows(rows, FIXTURE_ACCOUNT_ID);

    const sellOpening = transformed.records.find(
      (record) =>
        record.kind === "EXECUTION" &&
        record.rawAction.includes("YOU SOLD OPENING TRANSACTION") &&
        record.symbol === "-QQQM260417P250",
    );

    if (!sellOpening || sellOpening.kind !== "EXECUTION") {
      throw new Error("Expected QQQM sell-opening execution row.");
    }

    expect(sellOpening.side).toBe("SELL");
    expect(sellOpening.quantity).toBe(1);
  });

  it("never emits SPAXX/FSIXX as execution records", () => {
    const rows = loadRows(FIXTURE_FILENAME_10);
    const transformed = transformFidelityRows(rows, FIXTURE_ACCOUNT_ID);

    const executionSymbols = transformed.records
      .filter((record): record is Extract<(typeof transformed.records)[number], { kind: "EXECUTION" }> => record.kind === "EXECUTION")
      .map((record) => record.symbol);

    expect(executionSymbols).not.toContain("SPAXX");
    expect(executionSymbols).not.toContain("FSIXX");
  });

  it("overrides generic money-market execution classification to CASH_EVENT", () => {
    const syntheticRows: RawFidelityRow[] = [
      {
        runDate: new Date("2026-04-01T00:00:00.000Z"),
        rawAction: "YOU BOUGHT FIDELITY GOVERNMENT MONEY MARKET (SPAXX) (Cash)",
        symbol: "SPAXX",
        description: "Fidelity Government Money Market",
        marginType: "Cash",
        price: 1,
        quantity: 25,
        commission: null,
        fees: null,
        accruedInterest: null,
        amount: -25,
        cashBalance: 100,
        settlementDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    ];

    const transformed = transformFidelityRows(syntheticRows, FIXTURE_ACCOUNT_ID);

    expect(transformed.records).toHaveLength(1);
    expect(transformed.records[0]?.kind).toBe("CASH_EVENT");
    if (transformed.records[0]?.kind === "CASH_EVENT") {
      expect(transformed.records[0].cashEventType).toBe("MONEY_MARKET");
    }
  });

  it("links assignment option/equity pairs with shared assignmentLinkId", () => {
    const rows8 = loadRows(FIXTURE_FILENAME_8);
    const rows9 = loadRows(FIXTURE_FILENAME_9);

    const transformed8 = transformFidelityRows(rows8, FIXTURE_ACCOUNT_ID);
    const transformed9 = transformFidelityRows(rows9, FIXTURE_ACCOUNT_ID);

    const isLinkedExecution = (
      record: (typeof transformed8.records)[number],
    ): record is Extract<(typeof transformed8.records)[number], { kind: "EXECUTION" }> =>
      record.kind === "EXECUTION" && Boolean(record.assignmentLinkId);

    const dalAssignmentRecords = transformed8.records.filter(
      (record): record is Extract<(typeof transformed8.records)[number], { kind: "EXECUTION" }> =>
        isLinkedExecution(record) && record.underlyingTicker === "DAL",
    );

    const intcAssignmentRecords = transformed9.records.filter(
      (record): record is Extract<(typeof transformed9.records)[number], { kind: "EXECUTION" }> =>
        record.kind === "EXECUTION" && Boolean(record.assignmentLinkId) && record.underlyingTicker === "INTC",
    );

    expect(dalAssignmentRecords).toHaveLength(2);
    expect(intcAssignmentRecords).toHaveLength(2);

    const dalLinkIds = new Set(dalAssignmentRecords.map((record) => record.assignmentLinkId));
    const intcLinkIds = new Set(intcAssignmentRecords.map((record) => record.assignmentLinkId));

    expect(dalLinkIds.size).toBe(1);
    expect(intcLinkIds.size).toBe(1);
  });

  it("collapses a complete cancel/correct triplet to a single CORR execution", () => {
    const syntheticRows: RawFidelityRow[] = [
      makeRow({ runDate: new Date("2025-01-02T00:00:00.000Z"), amount: -11.12 }),
      makeRow({
        runDate: new Date("2025-01-21T00:00:00.000Z"),
        rawAction: "BUY CANCEL CLOSING TRANSACTION",
        description: "CXL DESCRIPTION CANCELLED TRADE as of Jan-02-2025",
        quantity: -1,
        amount: 11.12,
      }),
      makeRow({
        runDate: new Date("2025-01-21T00:00:00.000Z"),
        description: "CORR DESCRIPTION CORRECTED CONFIRM as of Jan-02-2025",
        quantity: 1,
        amount: -11.03,
      }),
    ];

    const transformed = transformFidelityRows(syntheticRows, FIXTURE_ACCOUNT_ID);
    const executions = transformed.records.filter(
      (record): record is Extract<(typeof transformed.records)[number], { kind: "EXECUTION" }> => record.kind === "EXECUTION",
    );

    expect(executions).toHaveLength(1);
    expect(executions[0]?.description).toContain("CORR DESCRIPTION CORRECTED CONFIRM");
    expect(executions[0]?.cancelRebookCode).toBe("CANCEL_REBOOK");
    expect(transformed.cancelRebookInfos).toHaveLength(1);
    expect(transformed.cancelRebookInfos[0]?.rowIndexes).toEqual([4, 5, 6]);
    expect(transformed.cancelRebookOriginalDropCount).toBe(1);
    expect(transformed.cancelledCount).toBe(1);
    expect(transformed.warnings.some((warning) => warning.code === "CANCELLED_ROW_SKIPPED")).toBe(false);
  });

  it("drops CANCEL with original when no CORR row exists and emits a structured warning", () => {
    const syntheticRows: RawFidelityRow[] = [
      makeRow({ runDate: new Date("2025-01-02T00:00:00.000Z"), amount: -11.12 }),
      makeRow({
        runDate: new Date("2025-01-21T00:00:00.000Z"),
        rawAction: "BUY CANCEL CLOSING TRANSACTION",
        description: "CXL DESCRIPTION CANCELLED TRADE as of Jan-02-2025",
        quantity: -1,
        amount: 11.12,
      }),
    ];

    const transformed = transformFidelityRows(syntheticRows, FIXTURE_ACCOUNT_ID);

    expect(transformed.records).toHaveLength(0);
    expect(transformed.cancelRebookOriginalDropCount).toBe(1);
    expect(transformed.cancelledCount).toBe(1);
    expect(transformed.warnings.some((warning) => warning.code === "CANCEL_REBOOK_MISSING_CORRECTION")).toBe(true);
    expect(transformed.warnings.some((warning) => warning.message.includes("Trade cancelled with no correction found"))).toBe(true);
    expect(transformed.warnings.some((warning) => warning.code === "CANCELLED_ROW_SKIPPED")).toBe(false);
  });

  it("keeps CORR rows when no matching CANCEL exists and emits a structured warning", () => {
    const syntheticRows: RawFidelityRow[] = [
      makeRow({
        runDate: new Date("2025-01-21T00:00:00.000Z"),
        description: "CORR DESCRIPTION CORRECTED CONFIRM as of Jan-02-2025",
        quantity: 1,
        amount: -11.03,
      }),
    ];

    const transformed = transformFidelityRows(syntheticRows, FIXTURE_ACCOUNT_ID);
    const executions = transformed.records.filter(
      (record): record is Extract<(typeof transformed.records)[number], { kind: "EXECUTION" }> => record.kind === "EXECUTION",
    );

    expect(executions).toHaveLength(1);
    expect(executions[0]?.cancelRebookCode).toBeNull();
    expect(transformed.warnings.some((warning) => warning.code === "CANCEL_REBOOK_MISSING_CANCEL")).toBe(true);
  });

  it("resolves multiple cancel/correct pairs independently in one import", () => {
    const syntheticRows: RawFidelityRow[] = [
      makeRow({
        symbol: "-INTC250117C23",
        runDate: new Date("2025-01-02T00:00:00.000Z"),
        settlementDate: new Date("2025-01-03T00:00:00.000Z"),
      }),
      makeRow({
        symbol: "-INTC250117C23",
        runDate: new Date("2025-01-21T00:00:00.000Z"),
        settlementDate: new Date("2025-01-03T00:00:00.000Z"),
        rawAction: "BUY CANCEL CLOSING TRANSACTION",
        description: "CXL DESCRIPTION CANCELLED TRADE as of Jan-02-2025",
        quantity: -1,
        amount: 11.12,
      }),
      makeRow({
        symbol: "-INTC250117C23",
        runDate: new Date("2025-01-21T00:00:00.000Z"),
        settlementDate: new Date("2025-01-03T00:00:00.000Z"),
        description: "CORR DESCRIPTION CORRECTED CONFIRM as of Jan-02-2025",
        quantity: 1,
        amount: -11.03,
      }),
      makeRow({
        symbol: "-AAPL250117C180",
        runDate: new Date("2025-01-05T00:00:00.000Z"),
        settlementDate: new Date("2025-01-06T00:00:00.000Z"),
        description: "CALL AAPL JAN 17 25 $180",
        amount: -8.12,
      }),
      makeRow({
        symbol: "-AAPL250117C180",
        runDate: new Date("2025-01-22T00:00:00.000Z"),
        settlementDate: new Date("2025-01-06T00:00:00.000Z"),
        rawAction: "BUY CANCEL CLOSING TRANSACTION",
        description: "CXL DESCRIPTION CANCELLED TRADE as of Jan-05-2025",
        quantity: -1,
        amount: 8.12,
      }),
      makeRow({
        symbol: "-AAPL250117C180",
        runDate: new Date("2025-01-22T00:00:00.000Z"),
        settlementDate: new Date("2025-01-06T00:00:00.000Z"),
        description: "CORR DESCRIPTION CORRECTED CONFIRM as of Jan-05-2025",
        quantity: 1,
        amount: -8.01,
      }),
    ];

    const transformed = transformFidelityRows(syntheticRows, FIXTURE_ACCOUNT_ID);
    const executions = transformed.records.filter(
      (record): record is Extract<(typeof transformed.records)[number], { kind: "EXECUTION" }> => record.kind === "EXECUTION",
    );

    expect(executions).toHaveLength(2);
    expect(executions.every((record) => record.cancelRebookCode === "CANCEL_REBOOK")).toBe(true);
    expect(transformed.cancelRebookInfos).toHaveLength(2);
    expect(transformed.cancelRebookOriginalDropCount).toBe(2);
    expect(transformed.cancelledCount).toBe(2);
    expect(transformed.warnings.some((warning) => warning.code?.startsWith("CANCEL_REBOOK_MISSING_"))).toBe(false);
  });

  it("tracks blank rows, cancel rows, and unknown actions distinctly", () => {
    const syntheticRows: RawFidelityRow[] = [
      {
        runDate: null,
        rawAction: " ",
        symbol: "",
        description: "",
        marginType: null,
        price: null,
        quantity: null,
        commission: null,
        fees: null,
        accruedInterest: null,
        amount: null,
        cashBalance: null,
        settlementDate: null,
      },
      {
        runDate: new Date("2026-01-01T00:00:00.000Z"),
        rawAction: "BUY CANCEL CLOSING TRANSACTION CXL DESCRIPTION CANCELLED TRADE",
        symbol: "-INTC260117C23",
        description: "cancelled",
        marginType: "Margin",
        price: 1,
        quantity: -1,
        commission: null,
        fees: null,
        accruedInterest: null,
        amount: 100,
        cashBalance: 100,
        settlementDate: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        runDate: new Date("2026-01-02T00:00:00.000Z"),
        rawAction: "UNRECOGNIZED ACTION",
        symbol: "XYZ",
        description: "unknown",
        marginType: "Cash",
        price: 1,
        quantity: 1,
        commission: null,
        fees: null,
        accruedInterest: null,
        amount: 10,
        cashBalance: 110,
        settlementDate: new Date("2026-01-02T00:00:00.000Z"),
      },
    ];

    const transformed = transformFidelityRows(syntheticRows, FIXTURE_ACCOUNT_ID);

    expect(transformed.records).toHaveLength(0);
    expect(transformed.skippedBlankCount).toBe(1);
    expect(transformed.cancelledCount).toBe(1);
    expect(transformed.unknownSkippedCount).toBe(1);
    expect(transformed.warnings.some((warning) => warning.code === "UNKNOWN_ACTION")).toBe(true);
    expect(transformed.warnings.some((warning) => warning.code === "CANCEL_REBOOK_MISSING_CORRECTION")).toBe(true);
    expect(transformed.warnings.some((warning) => warning.code === "CANCELLED_ROW_SKIPPED")).toBe(false);
  });

  it("accounts for all parsed rows in fixture -10 round-trip tally", () => {
    const rows = loadRows(FIXTURE_FILENAME_10);
    const transformed = transformFidelityRows(rows, FIXTURE_ACCOUNT_ID);

    expect(
      transformed.records.length +
        transformed.skippedBlankCount +
        transformed.cancelledCount +
        transformed.unknownSkippedCount +
        transformed.cancelRebookOriginalDropCount,
    ).toBe(rows.length);
  });

  it("adds warnings for unmatched assignment legs", () => {
    const syntheticRows: RawFidelityRow[] = [
      {
        runDate: new Date("2026-03-13T00:00:00.000Z"),
        rawAction: "ASSIGNED as of Mar-13-2026 PUT (DAL) DELTA AIR LINES INC MAY 16 26 $65 (100 SHS) (Cash)",
        symbol: "-DAL260516P65",
        description: "PUT (DAL) DELTA AIR LINES INC MAY 16 26 $65 (100 SHS)",
        marginType: "Cash",
        price: null,
        quantity: 1,
        commission: null,
        fees: null,
        accruedInterest: null,
        amount: 0,
        cashBalance: 1000,
        settlementDate: null,
      },
      {
        runDate: new Date("2026-03-14T00:00:00.000Z"),
        rawAction: "YOU BOUGHT ASSIGNED PUTS AS OF 03-13-26 INTEL CORP COM USD0.001 (INTC) (Cash)",
        symbol: "INTC",
        description: "INTEL CORP COM USD0.001",
        marginType: "Cash",
        price: 44,
        quantity: 100,
        commission: null,
        fees: null,
        accruedInterest: null,
        amount: -4400,
        cashBalance: -3400,
        settlementDate: new Date("2026-03-14T00:00:00.000Z"),
      },
    ];

    const transformed = transformFidelityRows(syntheticRows, FIXTURE_ACCOUNT_ID);

    expect(transformed.warnings.some((warning) => warning.message.includes("could not be paired"))).toBe(true);
    const warningRows = transformed.previewRows.filter((row) => row.status === "WARNING");
    expect(warningRows.length).toBeGreaterThanOrEqual(2);
  });
});
