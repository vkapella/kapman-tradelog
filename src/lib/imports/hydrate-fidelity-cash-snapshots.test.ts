import { describe, expect, it } from "vitest";
import { hydrateFidelityCashSnapshots } from "./hydrate-fidelity-cash-snapshots";

interface StoredSnapshot {
  id: string;
  accountId: string;
  snapshotDate: Date;
  balance: number;
  totalCash: number | null;
}

interface StoredCashEvent {
  id: string;
  accountId: string;
  eventDate: Date;
  rowType: string;
  refNumber: string;
  amount: number;
}

class InMemoryFidelitySnapshotStore {
  public snapshots: StoredSnapshot[];
  public cashEvents: StoredCashEvent[];

  public constructor(input: { snapshots: StoredSnapshot[]; cashEvents: StoredCashEvent[] }) {
    this.snapshots = input.snapshots;
    this.cashEvents = input.cashEvents;
  }

  public get tx() {
    return {
      dailyAccountSnapshot: {
        findMany: async ({ where }: { where: { accountId: string } }) =>
          this.snapshots
            .filter((row) => row.accountId === where.accountId)
            .sort((left, right) => left.snapshotDate.getTime() - right.snapshotDate.getTime()),
        update: async ({ where, data }: { where: { id: string }; data: { totalCash: number } }) => {
          const target = this.snapshots.find((row) => row.id === where.id);
          if (!target) {
            throw new Error(`Snapshot ${where.id} not found`);
          }

          target.totalCash = data.totalCash;
          return target;
        },
      },
      cashEvent: {
        findMany: async ({
          where,
        }: {
          where: {
            accountId: string;
            rowType: { in: string[] };
          };
        }) =>
          this.cashEvents
            .filter((row) => row.accountId === where.accountId && where.rowType.in.includes(row.rowType))
            .sort((left, right) => {
              const dateDelta = left.eventDate.getTime() - right.eventDate.getTime();
              if (dateDelta !== 0) {
                return dateDelta;
              }

              return left.id.localeCompare(right.id);
            }),
      },
    };
  }
}

describe("hydrateFidelityCashSnapshots", () => {
  it("hydrates snapshots from lifetime money-market activity and treats FISXX-to-FSIXX exchanges as a wash", async () => {
    const store = new InMemoryFidelitySnapshotStore({
      snapshots: [
        {
          id: "snapshot-2024",
          accountId: "acct-1",
          snapshotDate: new Date("2024-12-31T00:00:00.000Z"),
          balance: 3904.63,
          totalCash: null,
        },
        {
          id: "snapshot-2025",
          accountId: "acct-1",
          snapshotDate: new Date("2025-12-31T00:00:00.000Z"),
          balance: 34778.12,
          totalCash: null,
        },
        {
          id: "snapshot-2026",
          accountId: "acct-1",
          snapshotDate: new Date("2026-04-10T00:00:00.000Z"),
          balance: 0,
          totalCash: null,
        },
      ],
      cashEvents: [
        {
          id: "01",
          accountId: "acct-1",
          eventDate: new Date("2024-01-12T00:00:00.000Z"),
          rowType: "MONEY_MARKET_BUY",
          refNumber: "FIDELITY-01(FISXX)",
          amount: -700,
        },
        {
          id: "02",
          accountId: "acct-1",
          eventDate: new Date("2024-02-26T00:00:00.000Z"),
          rowType: "MONEY_MARKET_EXCHANGE_OUT",
          refNumber: "FIDELITY-02(FISXX)",
          amount: 4326.77,
        },
        {
          id: "03",
          accountId: "acct-1",
          eventDate: new Date("2024-02-26T00:00:00.000Z"),
          rowType: "MONEY_MARKET_EXCHANGE_IN",
          refNumber: "FIDELITY-03(FSIXX)",
          amount: -4326.77,
        },
        {
          id: "04",
          accountId: "acct-1",
          eventDate: new Date("2024-03-28T00:00:00.000Z"),
          rowType: "MONEY_MARKET_DIVIDEND",
          refNumber: "FIDELITY-04(SPAXX)",
          amount: 18.43,
        },
        {
          id: "05",
          accountId: "acct-1",
          eventDate: new Date("2024-03-28T00:00:00.000Z"),
          rowType: "MONEY_MARKET_DIVIDEND",
          refNumber: "FIDELITY-05(SPAXX)",
          amount: -18.43,
        },
        {
          id: "06",
          accountId: "acct-1",
          eventDate: new Date("2025-05-19T00:00:00.000Z"),
          rowType: "MONEY_MARKET_BUY",
          refNumber: "FIDELITY-06(FSIXX)",
          amount: -8225.37,
        },
        {
          id: "07",
          accountId: "acct-1",
          eventDate: new Date("2026-04-01T00:00:00.000Z"),
          rowType: "MONEY_MARKET_BUY",
          refNumber: "FIDELITY-07(FSIXX)",
          amount: -55339.78,
        },
        {
          id: "08",
          accountId: "acct-1",
          eventDate: new Date("2026-04-10T00:00:00.000Z"),
          rowType: "MONEY_MARKET_REDEEM",
          refNumber: "FIDELITY-08(FSIXX)",
          amount: 13090.54,
        },
      ],
    });

    const result = await hydrateFidelityCashSnapshots(store.tx as never, "acct-1");

    expect(result.updated).toBe(3);
    expect(store.snapshots[0]?.id).toBe("snapshot-2024");
    expect(store.snapshots[0]?.totalCash).toBeCloseTo(8231.4, 2);
    expect(store.snapshots[1]?.id).toBe("snapshot-2025");
    expect(store.snapshots[1]?.totalCash).toBeCloseTo(47330.26, 2);
    expect(store.snapshots[2]?.id).toBe("snapshot-2026");
    expect(store.snapshots[2]?.totalCash).toBeCloseTo(54801.38, 2);
  });
});
