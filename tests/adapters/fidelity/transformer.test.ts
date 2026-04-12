import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFidelityCsv } from "@/lib/adapters/fidelity/parser";
import { transformFidelityRows } from "@/lib/adapters/fidelity/transformer";
import type { RawFidelityRow } from "@/lib/adapters/fidelity/types";

function loadRows(filename: string): RawFidelityRow[] {
  return parseFidelityCsv(readFileSync(`tests/adapters/fidelity/fixtures/${filename}`), filename);
}

describe("transformFidelityRows", () => {
  it("uses absolute quantity for SELL rows", () => {
    const rows = loadRows("History_for_Account_X19467537-10.csv");
    const transformed = transformFidelityRows(rows, "X19467537");

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
    const rows = loadRows("History_for_Account_X19467537-10.csv");
    const transformed = transformFidelityRows(rows, "X19467537");

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

    const transformed = transformFidelityRows(syntheticRows, "X19467537");

    expect(transformed.records).toHaveLength(1);
    expect(transformed.records[0]?.kind).toBe("CASH_EVENT");
    if (transformed.records[0]?.kind === "CASH_EVENT") {
      expect(transformed.records[0].cashEventType).toBe("MONEY_MARKET");
    }
  });

  it("links assignment option/equity pairs with shared assignmentLinkId", () => {
    const rows8 = loadRows("History_for_Account_X19467537-8.csv");
    const rows9 = loadRows("History_for_Account_X19467537-9.csv");

    const transformed8 = transformFidelityRows(rows8, "X19467537");
    const transformed9 = transformFidelityRows(rows9, "X19467537");

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

  it("skips blank rows, skips cancelled rows, and records unknown warnings", () => {
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

    const transformed = transformFidelityRows(syntheticRows, "X19467537");

    expect(transformed.records).toHaveLength(0);
    expect(transformed.skippedBlankCount).toBe(1);
    expect(transformed.cancelledCount).toBe(1);
    expect(transformed.warnings.some((warning) => warning.message.includes("Unknown Fidelity action"))).toBe(true);
  });

  it("accounts for all parsed rows in fixture -10 round-trip tally", () => {
    const rows = loadRows("History_for_Account_X19467537-10.csv");
    const transformed = transformFidelityRows(rows, "X19467537");

    const unknownSkippedCount = transformed.warnings.filter((warning) => warning.message.includes("Unknown Fidelity action")).length;

    expect(transformed.records.length + transformed.skippedBlankCount + transformed.cancelledCount + unknownSkippedCount).toBe(rows.length);
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

    const transformed = transformFidelityRows(syntheticRows, "X19467537");

    expect(transformed.warnings.some((warning) => warning.message.includes("could not be paired"))).toBe(true);
    const warningRows = transformed.previewRows.filter((row) => row.status === "WARNING");
    expect(warningRows.length).toBeGreaterThanOrEqual(2);
  });
});
