import { describe, expect, it } from "vitest";
import type { AccountBalanceContextRecord } from "@/lib/accounts/account-balance-context";
import type { PositionSnapshotOpenPosition } from "@/types/api";
import { resolveLiveAccountValue, sumCompleteReconstructedNlv } from "./live-account-value";

function balance(overrides: Partial<AccountBalanceContextRecord> = {}): AccountBalanceContextRecord {
  return {
    accountExternalId: "X19467537",
    brokerNetLiquidationValue: null,
    brokerNlvAsOf: null,
    cash: 59474.32,
    cashAsOf: "2026-07-17T00:00:00.000Z",
    cashSource: "snapshot",
    ...overrides,
  };
}

function position(overrides: Partial<PositionSnapshotOpenPosition> = {}): PositionSnapshotOpenPosition {
  return {
    symbol: "SPY",
    underlyingSymbol: "SPY",
    assetClass: "EQUITY",
    optionType: null,
    strike: null,
    expirationDate: null,
    instrumentKey: "SPY",
    netQty: 1,
    costBasis: 700,
    accountId: "account-1",
    mark: 750,
    ...overrides,
  };
}

describe("resolveLiveAccountValue", () => {
  it("reconstructs Fidelity NLV without silently substituting a broker value", () => {
    const value = resolveLiveAccountValue({
      accountId: "account-1",
      accountExternalId: "X19467537",
      positions: [
        position({ mark: 68215.7 }),
        position({
          symbol: "D",
          instrumentKey: "D|CALL|65|2026-09-18",
          assetClass: "OPTION",
          optionType: "CALL",
          netQty: 1,
          mark: 6.9,
        }),
      ],
      balance: balance(),
      marksAsOf: new Date("2026-07-19T01:45:19.401Z"),
    });

    expect(value).toMatchObject({
      cashAndEquivalents: "59474.32",
      equityMarketValue: "68215.70",
      optionMarketValue: "690.00",
      reconstructedNlv: "128380.02",
      brokerReportedNlv: null,
      reconciliationDelta: null,
      status: "MIXED_AS_OF",
      valuationBasis: "MARK",
    });
  });

  it("keeps Schwab broker NLV secondary and exposes a non-zero reconciliation", () => {
    const value = resolveLiveAccountValue({
      accountId: "account-1",
      accountExternalId: "D-68011054",
      positions: [position({ mark: 89806.4 })],
      balance: balance({
        accountExternalId: "D-68011054",
        cash: 6101.21,
        brokerNetLiquidationValue: 95905.61,
        brokerNlvAsOf: "2026-07-17T00:00:00.000Z",
      }),
      marksAsOf: new Date("2026-07-18T01:26:05.944Z"),
    });

    expect(value).toMatchObject({
      reconstructedNlv: "95907.61",
      brokerReportedNlv: "95905.61",
      reconciliationDelta: "2.00",
      status: "MIXED_AS_OF",
    });
  });

  it("reports an exact Schwab reconciliation without changing the primary formula", () => {
    const value = resolveLiveAccountValue({
      accountId: "account-1",
      accountExternalId: "D-68011053",
      positions: [position({ mark: 39371.5 })],
      balance: balance({
        accountExternalId: "D-68011053",
        cash: 200321.42,
        brokerNetLiquidationValue: 239692.92,
        brokerNlvAsOf: "2026-07-17T00:00:00.000Z",
      }),
      marksAsOf: new Date("2026-07-17T20:00:00.000Z"),
    });

    expect(value.reconstructedNlv).toBe("239692.92");
    expect(value.reconciliationDelta).toBe("0.00");
    expect(value.status).toBe("CURRENT");
  });

  it("withholds live NLV when any open position is missing a mark", () => {
    const value = resolveLiveAccountValue({
      accountId: "account-1",
      accountExternalId: "account-external-1",
      positions: [position({ mark: null })],
      balance: balance(),
      marksAsOf: new Date("2026-07-17T20:00:00.000Z"),
    });

    expect(value.reconstructedNlv).toBeNull();
    expect(value.missingMarkCount).toBe(1);
    expect(value.status).toBe("INCOMPLETE_MARKS");
  });

  it("supports cash-only accounts and rejects incomplete multi-account totals", () => {
    const cashOnly = resolveLiveAccountValue({
      accountId: "cash-account",
      accountExternalId: "cash-account",
      positions: [],
      balance: balance({ cash: 5000, cashAsOf: "2026-07-17T00:00:00.000Z" }),
      marksAsOf: new Date("2026-07-17T20:00:00.000Z"),
    });
    const incomplete = { ...cashOnly, accountId: "incomplete", reconstructedNlv: null, status: "INCOMPLETE_MARKS" as const };

    expect(cashOnly.reconstructedNlv).toBe("5000.00");
    expect(sumCompleteReconstructedNlv([cashOnly])).toBe(5000);
    expect(sumCompleteReconstructedNlv([cashOnly, incomplete])).toBeNull();
  });
});

describe("resolveLiveAccountValue stale marks", () => {
  function resolve(positions: PositionSnapshotOpenPosition[], cashAsOf = "2026-08-17T00:00:00.000Z") {
    return resolveLiveAccountValue({
      accountId: "account-1",
      accountExternalId: "X19467537",
      positions,
      balance: balance({ cash: 1000, cashAsOf }),
      marksAsOf: new Date("2026-08-17T14:30:00.000Z"),
    });
  }

  it("still reconstructs NLV when a position is priced from a daily close", () => {
    const value = resolve([
      position({ mark: 750, markSource: "LIVE" }),
      position({ instrumentKey: "QQQM", symbol: "QQQM", mark: 250, markSource: "HISTORICAL", markAsOf: "2026-08-14" }),
    ]);

    // 1000 cash + 750 + 250: a stale price still yields a usable value.
    expect(value.reconstructedNlv).toBe("2000.00");
    expect(value.status).toBe("STALE_MARKS");
    expect(value.staleMarkCount).toBe(1);
    expect(value.staleMarkAsOf).toBe("2026-08-14");
  });

  it("does not treat a par-value money-market mark as stale", () => {
    const value = resolve([
      position({ instrumentKey: "SNSXX", symbol: "SNSXX", mark: 1, netQty: 199960, markSource: "PAR" }),
    ]);

    // 1000 cash + 199,960 at $1.00 par.
    expect(value.reconstructedNlv).toBe("200960.00");
    expect(value.staleMarkCount).toBe(0);
    expect(value.status).toBe("CURRENT");
  });

  it("reports the oldest contributing close as the account's stale date", () => {
    const value = resolve([
      position({ mark: 750, markSource: "HISTORICAL", markAsOf: "2026-08-14" }),
      position({ instrumentKey: "QQQM", symbol: "QQQM", mark: 250, markSource: "HISTORICAL", markAsOf: "2026-08-11" }),
    ]);

    expect(value.staleMarkCount).toBe(2);
    expect(value.staleMarkAsOf).toBe("2026-08-11");
  });

  it("keeps a missing mark more severe than a stale one", () => {
    const value = resolve([
      position({ mark: null }),
      position({ instrumentKey: "QQQM", symbol: "QQQM", mark: 250, markSource: "HISTORICAL", markAsOf: "2026-08-14" }),
    ]);

    expect(value.status).toBe("INCOMPLETE_MARKS");
    expect(value.reconstructedNlv).toBeNull();
    expect(value.missingMarkCount).toBe(1);
  });

  it("ranks stale marks above a cash and mark date mismatch", () => {
    const value = resolve(
      [position({ mark: 750, markSource: "HISTORICAL", markAsOf: "2026-08-14" })],
      "2026-08-15T00:00:00.000Z",
    );

    expect(value.status).toBe("STALE_MARKS");
  });

  it("reports CURRENT when every mark is live and dates agree", () => {
    const value = resolve([position({ mark: 750, markSource: "LIVE" })]);

    expect(value.status).toBe("CURRENT");
    expect(value.staleMarkCount).toBe(0);
    expect(value.staleMarkAsOf).toBeNull();
  });

  it("treats a snapshot without mark provenance as live", () => {
    // Snapshots persisted before mark source existed must not report as stale.
    const value = resolve([position({ mark: 750 })]);

    expect(value.staleMarkCount).toBe(0);
    expect(value.status).toBe("CURRENT");
  });
});
