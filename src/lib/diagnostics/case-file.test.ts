import { describe, expect, it } from "vitest";
import type { ExecutionRecord, MatchedLotRecord, SetupSummaryRecord } from "@/types/api";
import {
  buildAccountInstrumentKey,
  buildExecutionCaseFile,
  buildSetupInferenceCaseFile,
  groupSetupInferenceSamples,
  groupWarningRecords,
} from "./case-file";

function execution(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: overrides.id ?? "execution-1",
    accountId: overrides.accountId ?? "account-1",
    broker: overrides.broker ?? "FIDELITY",
    symbol: overrides.symbol ?? "-INTC250620C25",
    tradeDate: overrides.tradeDate ?? "2025-06-20T00:00:00.000Z",
    eventTimestamp: overrides.eventTimestamp ?? "2025-06-20T00:00:00.000Z",
    eventType: overrides.eventType ?? "EXPIRATION_INFERRED",
    assetClass: overrides.assetClass ?? "OPTION",
    side: overrides.side ?? "BUY",
    quantity: overrides.quantity ?? "1",
    price: overrides.price ?? "0",
    openingClosingEffect: overrides.openingClosingEffect ?? "TO_CLOSE",
    instrumentKey: overrides.instrumentKey ?? "INTC|CALL|25|2025-06-20",
    underlyingSymbol: overrides.underlyingSymbol ?? "INTC",
    optionType: overrides.optionType ?? "CALL",
    strike: overrides.strike ?? "25",
    expirationDate: overrides.expirationDate ?? "2025-06-20T00:00:00.000Z",
    spreadGroupId: overrides.spreadGroupId ?? null,
    importId: overrides.importId ?? "import-1",
  };
}

function matchedLot(overrides: Partial<MatchedLotRecord> = {}): MatchedLotRecord {
  return {
    id: overrides.id ?? "lot-1",
    accountId: overrides.accountId ?? "account-1",
    symbol: overrides.symbol ?? "-INTC250620C25",
    underlyingSymbol: overrides.underlyingSymbol ?? "INTC",
    openTradeDate: overrides.openTradeDate ?? "2025-05-12T00:00:00.000Z",
    closeTradeDate: overrides.closeTradeDate ?? "2025-06-20T00:00:00.000Z",
    openImportId: overrides.openImportId ?? "import-open",
    closeImportId: overrides.closeImportId ?? "import-close",
    quantity: overrides.quantity ?? "1",
    realizedPnl: overrides.realizedPnl ?? "-32",
    holdingDays: overrides.holdingDays ?? 39,
    outcome: overrides.outcome ?? "LOSS",
    openExecutionId: overrides.openExecutionId ?? "execution-open",
    closeExecutionId: overrides.closeExecutionId ?? "execution-1",
  };
}

function setup(overrides: Partial<SetupSummaryRecord> = {}): SetupSummaryRecord {
  return {
    id: overrides.id ?? "setup-1",
    accountId: overrides.accountId ?? "account-1",
    tag: overrides.tag ?? "short_call",
    overrideTag: overrides.overrideTag ?? null,
    underlyingSymbol: overrides.underlyingSymbol ?? "INTC",
    realizedPnl: overrides.realizedPnl ?? "-32",
    winRate: overrides.winRate ?? "0",
    expectancy: overrides.expectancy ?? "-32",
    averageHoldDays: overrides.averageHoldDays ?? "39",
  };
}

describe("groupWarningRecords", () => {
  it("groups duplicate warning messages by account scope and attaches execution case refs when available", () => {
    const groups = groupWarningRecords(
      [
        {
          code: "UNMATCHED_CLOSE_QUANTITY",
          accountId: "account-1",
          message: "Unmatched close quantity 1 for instrument INTC|CALL|23|2025-01-17.",
        },
        {
          code: "UNMATCHED_CLOSE_QUANTITY",
          accountId: "account-1",
          message: "Unmatched close quantity 1 for instrument INTC|CALL|23|2025-01-17.",
        },
        {
          code: "UNMATCHED_CLOSE_QUANTITY",
          accountId: "account-2",
          message: "Unmatched close quantity 1 for instrument INTC|CALL|23|2025-01-17.",
        },
        {
          code: "SYNTHETIC_EXPIRATION_INFERRED",
          accountId: "account-2",
          message: "Synthetic expiration close created for HOOD|PUT|50|2025-06-20 quantity 1.",
        },
      ],
      {
        unmatchedCloseExecutionIdByAccountInstrumentKey: new Map([
          [buildAccountInstrumentKey("account-1", "INTC|CALL|23|2025-01-17"), "execution-unmatched-account-1"],
          [buildAccountInstrumentKey("account-2", "INTC|CALL|23|2025-01-17"), "execution-unmatched-account-2"],
        ]),
        syntheticExecutionIdByAccountInstrumentKey: new Map([
          [buildAccountInstrumentKey("account-2", "HOOD|PUT|50|2025-06-20"), "execution-synth"],
        ]),
      },
    );

    expect(groups).toHaveLength(3);
    const groupedByExecutionId = new Map(
      groups.map((group) => [group.caseRef?.kind === "execution" ? group.caseRef.executionId : "none", group]),
    );
    expect(groupedByExecutionId.get("execution-unmatched-account-1")?.count).toBe(2);
    expect(groupedByExecutionId.get("execution-unmatched-account-2")?.count).toBe(1);
    expect(groupedByExecutionId.get("execution-synth")?.count).toBe(1);
  });
});

describe("groupSetupInferenceSamples", () => {
  it("groups repeated setup inference samples by code and underlying", () => {
    const groups = groupSetupInferenceSamples([
      {
        code: "PAIR_FAIL_NO_OVERLAP_LONG_CALL",
        message: "No overlapping long call anchor was open when this short call opened.",
        underlyingSymbol: "XLE",
        lotIds: ["lot-1"],
      },
      {
        code: "PAIR_FAIL_NO_OVERLAP_LONG_CALL",
        message: "No overlapping long call anchor was open when this short call opened.",
        underlyingSymbol: "XLE",
        lotIds: ["lot-2"],
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(2);
    expect(groups[0]?.caseRef?.kind).toBe("setup_inference");
  });
});

describe("buildExecutionCaseFile", () => {
  it("builds an expiration inferred case file with linked T1/T2/T3 context", () => {
    const result = buildExecutionCaseFile({
      execution: execution(),
      relatedExecutions: [execution({ id: "execution-open", eventType: "TRADE", side: "SELL", price: "0.32", openingClosingEffect: "TO_OPEN", tradeDate: "2025-05-12T00:00:00.000Z", eventTimestamp: "2025-05-12T00:00:00.000Z" })],
      matchedLots: [matchedLot()],
      setups: [setup()],
      rawAction: null,
      evidence: [
        { label: "Original open execution", value: "execution-open" },
        { label: "Remaining quantity", value: "1" },
      ],
    });

    expect(result.target.diagnosticCode).toBe("EXPIRATION_INFERRED");
    expect(result.focusExecutionId).toBe("execution-1");
    expect(result.matchedLots[0]?.id).toBe("lot-1");
    expect(result.setups[0]?.id).toBe("setup-1");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        { label: "Original open execution", value: "execution-open" },
        { label: "Remaining quantity", value: "1" },
      ]),
    );
  });
});

describe("buildSetupInferenceCaseFile", () => {
  it("builds a setup inference failure case file with structured diagnostic evidence", () => {
    const result = buildSetupInferenceCaseFile({
      code: "PAIR_FAIL_NO_OVERLAP_LONG_CALL",
      message: "No overlapping long call anchor was open when this short call opened.",
      underlyingSymbol: "XLE",
      executions: [
        execution({
          id: "execution-short-call",
          symbol: "-XLE260620C55",
          underlyingSymbol: "XLE",
          instrumentKey: "XLE|CALL|55|2026-06-20",
          eventType: "TRADE",
          openingClosingEffect: "TO_OPEN",
          side: "SELL",
        }),
      ],
      matchedLots: [
        matchedLot({
          id: "lot-short-call",
          symbol: "-XLE260620C55",
          underlyingSymbol: "XLE",
          openExecutionId: "execution-short-call",
          closeExecutionId: null,
        }),
      ],
      setups: [setup({ id: "setup-xle", underlyingSymbol: "XLE" })],
      inferenceReasons: ["No overlapping long call anchor existed when the short call opened."],
      evidence: [
        { label: "Short call lot", value: "lot-short-call" },
        { label: "Overlapping long call anchors", value: "0" },
      ],
    });

    expect(result.target.diagnosticCode).toBe("PAIR_FAIL_NO_OVERLAP_LONG_CALL");
    expect(result.target.underlyingSymbol).toBe("XLE");
    expect(result.executions[0]?.id).toBe("execution-short-call");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        { label: "Short call lot", value: "lot-short-call" },
        { label: "Overlapping long call anchors", value: "0" },
      ]),
    );
  });
});
