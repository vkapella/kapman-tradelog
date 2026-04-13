import { describe, expect, it } from "vitest";
import { computeMaxDrawdown, type DrawdownSnapshotPoint } from "./max-drawdown";

function point(input: {
  accountId: string;
  snapshotDate: string;
  balance: number;
  totalCash?: number | null;
  brokerNetLiquidationValue?: number | null;
}): DrawdownSnapshotPoint {
  return {
    accountId: input.accountId,
    snapshotDate: new Date(`${input.snapshotDate}T00:00:00.000Z`),
    balance: input.balance,
    totalCash: input.totalCash ?? null,
    brokerNetLiquidationValue: input.brokerNetLiquidationValue ?? null,
  };
}

describe("computeMaxDrawdown", () => {
  it("returns null when no snapshots exist", () => {
    expect(computeMaxDrawdown([])).toBeNull();
  });

  it("keeps a preferred higher-fidelity source across lower-fidelity gaps", () => {
    const snapshots = [
      point({ accountId: "acct-a", snapshotDate: "2026-04-01", balance: 100 }),
      point({ accountId: "acct-a", snapshotDate: "2026-04-02", balance: 80 }),
      point({ accountId: "acct-a", snapshotDate: "2026-04-03", balance: 90, brokerNetLiquidationValue: 180 }),
      point({ accountId: "acct-a", snapshotDate: "2026-04-04", balance: 70 }),
      point({ accountId: "acct-a", snapshotDate: "2026-04-05", balance: 75 }),
      point({ accountId: "acct-a", snapshotDate: "2026-04-06", balance: 95, brokerNetLiquidationValue: 190 }),
    ];

    expect(computeMaxDrawdown(snapshots)).toBe(20);
  });

  it("forward-fills each account when aggregating a multi-account series", () => {
    const snapshots = [
      point({ accountId: "acct-a", snapshotDate: "2026-04-01", balance: 100 }),
      point({ accountId: "acct-a", snapshotDate: "2026-04-02", balance: 120 }),
      point({ accountId: "acct-a", snapshotDate: "2026-04-03", balance: 80 }),
      point({ accountId: "acct-b", snapshotDate: "2026-04-02", balance: 10, totalCash: 10 }),
      point({ accountId: "acct-b", snapshotDate: "2026-04-04", balance: 12, totalCash: 12 }),
    ];

    expect(computeMaxDrawdown(snapshots)).toBe(40);
  });
});
