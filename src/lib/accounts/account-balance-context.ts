import { Prisma } from "@prisma/client";
import { buildAccountIdWhere, buildAccountScopeWhere } from "@/lib/api/account-scope";
import { prisma } from "@/lib/db/prisma";

export interface AccountBalanceContextRecord {
  accountExternalId: string;
  brokerNetLiquidationValue: number | null;
  cash: number;
  cashAsOf: string | null;
}

const INTERNAL_CASH_EQUIVALENT_ROW_TYPES = new Set(["MONEY_MARKET", "MONEY_MARKET_BUY", "REDEMPTION"]);

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

export async function loadAccountBalanceContext(accountIds: string[]): Promise<AccountBalanceContextRecord[]> {
  const [accounts, latestImports, snapshotRows, executionSums, cashEventSums] = await Promise.all([
    prisma.account.findMany({
      where: buildAccountIdWhere(accountIds) as Prisma.AccountWhereInput | undefined,
      select: { id: true, accountId: true },
      orderBy: { accountId: "asc" },
    }),
    prisma.import.findMany({
      where: {
        ...(buildAccountScopeWhere(accountIds) as Prisma.ImportWhereInput | undefined),
        status: "COMMITTED",
      },
      select: { id: true, accountId: true },
      orderBy: [{ accountId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.dailyAccountSnapshot.findMany({
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
    prisma.execution.groupBy({
      by: ["accountId"],
      where: buildAccountScopeWhere(accountIds) as Prisma.ExecutionWhereInput | undefined,
      _sum: { netAmount: true },
      _max: { tradeDate: true },
    }),
    prisma.cashEvent.groupBy({
      by: ["accountId"],
      where: buildAccountScopeWhere(accountIds) as Prisma.CashEventWhereInput | undefined,
      _sum: { amount: true },
      _max: { eventDate: true },
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

  const executionSummaryByAccount = new Map(
    executionSums.map((row) => [
      row.accountId,
      {
        cashDelta: toNumber(row._sum.netAmount),
        latestDate: row._max.tradeDate?.toISOString() ?? null,
      },
    ]),
  );
  const latestImportIdByAccount = new Map<string, string>();
  for (const row of latestImports) {
    if (!latestImportIdByAccount.has(row.accountId)) {
      latestImportIdByAccount.set(row.accountId, row.id);
    }
  }

  const latestImportInternalCashEquivalentSums =
    latestImportIdByAccount.size > 0
      ? await prisma.cashEvent.groupBy({
          by: ["accountId"],
          where: {
            sourceRef: { in: Array.from(latestImportIdByAccount.values()) },
            rowType: { in: Array.from(INTERNAL_CASH_EQUIVALENT_ROW_TYPES) },
          },
          _sum: { amount: true },
        })
      : [];

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
    latestImportInternalCashEquivalentSums.map((row) => [row.accountId, toNumber(row._sum.amount)]),
  );

  return accounts.map((account) => {
    const latestSnapshot = latestSnapshotByAccount.get(account.id);
    const executionSummary = executionSummaryByAccount.get(account.id);
    const cashEventSummary = cashEventSummaryByAccount.get(account.id);
    const internalCashEquivalentDelta = internalCashEquivalentDeltaByAccount.get(account.id) ?? 0;
    // Fidelity core sweep rows move value between settlement cash and a money-market cash equivalent.
    // Use only the latest import's sweep rows because Fidelity imports are rolling history windows,
    // and lifetime cash-event accumulation can overstate the current core-account balance.
    const fallbackCash = (executionSummary?.cashDelta ?? 0) + (cashEventSummary?.cashDelta ?? 0) - internalCashEquivalentDelta;
    const cash =
      latestSnapshot !== undefined
        ? Number(latestSnapshot.totalCash ?? latestSnapshot.balance)
        : fallbackCash;
    const cashAsOf =
      latestSnapshot?.snapshotDate.toISOString() ??
      maxIsoDate(executionSummary?.latestDate ?? null, cashEventSummary?.latestDate ?? null);

    return {
      accountExternalId: account.accountId,
      cash,
      cashAsOf,
      brokerNetLiquidationValue:
        latestSnapshot?.brokerNetLiquidationValue != null ? Number(latestSnapshot.brokerNetLiquidationValue) : null,
    };
  });
}
