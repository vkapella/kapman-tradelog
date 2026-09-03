import { Prisma, type PrismaClient } from "@prisma/client";
import { buildAccountIdWhere, buildAccountScopeWhere } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";

type DbClient = Prisma.TransactionClient | PrismaClient;

export type AccountBalanceCashSource = "snapshot" | "value_snapshot" | "heuristic_fallback";

export interface AccountBalanceContextRecord {
  accountExternalId: string;
  brokerNetLiquidationValue: number | null;
  brokerNlvAsOf: string | null;
  cash: number;
  cashAsOf: string | null;
  /**
   * snapshot          - DailyAccountSnapshot.totalCash (broker-reported cash).
   * value_snapshot    - AccountValueSnapshot.cashValue (the reconciled value-engine
   *                     ledger). Used when the daily snapshot's cash is itself a
   *                     reconstruction we cannot trust (#346).
   * heuristic_fallback- summed ledger deltas; only for accounts with no snapshots.
   */
  cashSource: AccountBalanceCashSource;
}

/**
 * Brokers whose DailyAccountSnapshot.totalCash is NOT broker-reported but
 * rebuilt by the importer. Fidelity's totalCash = CSV "Cash Balance" + a
 * money-market holding reconstructed from explicit MONEY_MARKET_* rows, and
 * Fidelity sweeps deposits into the core MMF without emitting those rows, so
 * every swept deposit since inception is missing (#346: ~$102K on 2026-08-30).
 * The value engine (backfill-value-snapshots) reconstructs cash from
 * startingCapital + trade deltas + the cash-event ledger with sweeps zeroed,
 * which reconciled with the broker, so for these brokers it wins.
 *
 * thinkorswim's "Total Cash" is broker-reported and stays authoritative; the
 * value engine can be wrong there when the ledger is (#348), so it must not
 * override a broker figure.
 */
const RECONSTRUCTED_SNAPSHOT_CASH_BROKERS: ReadonlySet<string> = new Set(["FIDELITY"]);

const INTERNAL_CASH_EQUIVALENT_ROW_TYPES = new Set([
  "MONEY_MARKET",
  "MONEY_MARKET_BUY",
  "MONEY_MARKET_REDEEM",
  "MONEY_MARKET_EXCHANGE_OUT",
  "MONEY_MARKET_EXCHANGE_IN",
  "REDEMPTION",
]);

function toNumber(value: Prisma.Decimal | null | undefined): number {
  return Number(value ?? 0);
}

function maxIsoDate(left: string | null, right: string | null): string | null {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return left >= right ? left : right;
}

export async function loadAccountBalanceContext(accountIds: string[], db: DbClient = prisma): Promise<AccountBalanceContextRecord[]> {
  const [accounts, snapshotRows, valueSnapshotRows, executionSums, cashEventSums, internalCashEquivalentSums] = await Promise.all([
    db.account.findMany({
      where: buildAccountIdWhere(accountIds) as Prisma.AccountWhereInput | undefined,
      select: { id: true, accountId: true, broker: true },
      orderBy: { accountId: "asc" },
    }),
    db.dailyAccountSnapshot.findMany({
      where: buildAccountScopeWhere(accountIds) as Prisma.DailyAccountSnapshotWhereInput | undefined,
      select: {
        accountId: true,
        snapshotDate: true,
        balance: true,
        totalCash: true,
        brokerNetLiquidationValue: true,
        id: true,
      },
      orderBy: [{ accountId: "asc" }, { snapshotDate: "desc" }, { id: "desc" }],
    }),
    db.accountValueSnapshot.findMany({
      where: buildAccountScopeWhere(accountIds) as Prisma.AccountValueSnapshotWhereInput | undefined,
      select: { accountId: true, snapshotDate: true, cashValue: true },
      orderBy: [{ accountId: "asc" }, { snapshotDate: "desc" }],
    }),
    db.execution.groupBy({
      by: ["accountId"],
      where: buildAccountScopeWhere(accountIds) as Prisma.ExecutionWhereInput | undefined,
      _sum: { netAmount: true },
      _max: { tradeDate: true },
    }),
    db.cashEvent.groupBy({
      by: ["accountId"],
      where: buildAccountScopeWhere(accountIds) as Prisma.CashEventWhereInput | undefined,
      _sum: { amount: true },
      _max: { eventDate: true },
    }),
    db.cashEvent.groupBy({
      by: ["accountId"],
      where: {
        AND: [
          ...(buildAccountScopeWhere(accountIds) ? [buildAccountScopeWhere(accountIds) as Prisma.CashEventWhereInput] : []),
          { rowType: { in: Array.from(INTERNAL_CASH_EQUIVALENT_ROW_TYPES) } },
        ],
      },
      _sum: { amount: true },
    }),
  ]);

  const latestSnapshotByAccount = new Map<
    string,
    {
      balance: Prisma.Decimal;
      brokerNetLiquidationValue: Prisma.Decimal | null;
      snapshotDate: Date;
      totalCash: Prisma.Decimal | null;
    }
  >();
  for (const row of snapshotRows) {
    if (!latestSnapshotByAccount.has(row.accountId)) {
      latestSnapshotByAccount.set(row.accountId, row);
    }
  }

  const latestValueSnapshotByAccount = new Map<string, { snapshotDate: Date; cashValue: Prisma.Decimal }>();
  for (const row of valueSnapshotRows) {
    if (!latestValueSnapshotByAccount.has(row.accountId)) {
      latestValueSnapshotByAccount.set(row.accountId, row);
    }
  }

  const executionSummaryByAccount = new Map(
    executionSums.map((row) => [
      row.accountId,
      {
        cashDelta: toNumber(row._sum.netAmount),
        latestDate: row._max.tradeDate?.toISOString() ?? null,
      },
    ]),
  );
  const cashEventSummaryByAccount = new Map(
    cashEventSums.map((row) => [
      row.accountId,
      {
        cashDelta: toNumber(row._sum.amount),
        latestDate: row._max.eventDate?.toISOString() ?? null,
      },
    ]),
  );
  const internalCashEquivalentDeltaByAccount = new Map(
    internalCashEquivalentSums.map((row) => [row.accountId, toNumber(row._sum.amount)]),
  );

  return accounts.map((account) => {
    const latestSnapshot = latestSnapshotByAccount.get(account.id);
    const latestValueSnapshot = latestValueSnapshotByAccount.get(account.id);
    const executionSummary = executionSummaryByAccount.get(account.id);
    const cashEventSummary = cashEventSummaryByAccount.get(account.id);
    const internalCashEquivalentDelta = internalCashEquivalentDeltaByAccount.get(account.id) ?? 0;
    const fallbackCash = (executionSummary?.cashDelta ?? 0) + (cashEventSummary?.cashDelta ?? 0) - internalCashEquivalentDelta;
    // Imported accounts should read from persisted snapshots. The fallback only protects
    // brand-new or otherwise empty accounts that still have zero snapshot rows.
    const hasSnapshot = latestSnapshot !== undefined;
    const preferValueSnapshot =
      latestValueSnapshot !== undefined && RECONSTRUCTED_SNAPSHOT_CASH_BROKERS.has(String(account.broker));

    let cash: number;
    let cashAsOf: string | null;
    let cashSource: AccountBalanceCashSource;
    if (preferValueSnapshot) {
      cash = Number(latestValueSnapshot.cashValue);
      cashAsOf = latestValueSnapshot.snapshotDate.toISOString();
      cashSource = "value_snapshot";
    } else if (hasSnapshot) {
      cash = Number(latestSnapshot.totalCash ?? latestSnapshot.balance);
      cashAsOf = latestSnapshot.snapshotDate.toISOString();
      cashSource = "snapshot";
    } else {
      cash = fallbackCash;
      cashAsOf = maxIsoDate(executionSummary?.latestDate ?? null, cashEventSummary?.latestDate ?? null);
      cashSource = "heuristic_fallback";
    }

    return {
      accountExternalId: account.accountId,
      cash,
      cashAsOf,
      cashSource,
      brokerNetLiquidationValue:
        latestSnapshot?.brokerNetLiquidationValue != null ? Number(latestSnapshot.brokerNetLiquidationValue) : null,
      brokerNlvAsOf:
        latestSnapshot?.brokerNetLiquidationValue != null ? latestSnapshot.snapshotDate.toISOString() : null,
    };
  });
}
