import { describe, expect, it } from "vitest";
import { computeCashDrift } from "./cash-drift";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("computeCashDrift", () => {
  it("reports a persistent level offset when every common date is over tolerance by nearly the same amount", () => {
    const engine = [
      { accountId: "fid", snapshotDate: d("2026-08-13"), cashValue: 57047.87 },
      { accountId: "fid", snapshotDate: d("2026-08-28"), cashValue: 23535.67 },
      { accountId: "fid", snapshotDate: d("2026-08-31"), cashValue: 23706.76 },
    ];
    const broker = [
      { accountId: "fid", snapshotDate: d("2026-08-13"), totalCash: 57540.8 },
      { accountId: "fid", snapshotDate: d("2026-08-28"), totalCash: 24028.41 },
      { accountId: "fid", snapshotDate: d("2026-08-31"), totalCash: 24199.5 },
      { accountId: "fid", snapshotDate: d("2026-09-01"), totalCash: 24199.5 },
    ];
    const [record] = computeCashDrift(["fid"], engine, broker, 25);
    expect(record).toMatchObject({ accountId: "fid", comparedDates: 3, datesOverTolerance: 3, latestDate: "2026-08-31", latestGap: "492.74", persistentOffset: true });
  });

  it("stays within tolerance and ignores broker rows without cash or without an engine counterpart", () => {
    const engine = [{ accountId: "corp", snapshotDate: d("2026-09-03"), cashValue: 40 }];
    const broker = [
      { accountId: "corp", snapshotDate: d("2026-09-03"), totalCash: 40.01 },
      { accountId: "corp", snapshotDate: d("2026-09-02"), totalCash: null },
      { accountId: "corp", snapshotDate: d("2026-08-27"), totalCash: 0 },
    ];
    const [record] = computeCashDrift(["corp"], engine, broker);
    expect(record).toMatchObject({ comparedDates: 1, datesOverTolerance: 0, latestGap: "0.01", persistentOffset: false });
  });

  it("returns an empty comparison for an account with no common dates", () => {
    expect(computeCashDrift(["x"], [], [])[0]).toMatchObject({ comparedDates: 0, latestDate: null, latestGap: null, persistentOffset: false });
  });
});
