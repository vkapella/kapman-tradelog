import type { Prisma } from "@prisma/client";

const MONEY_MARKET_BUY_ROW_TYPES = new Set(["MONEY_MARKET", "MONEY_MARKET_BUY", "MONEY_MARKET_EXCHANGE_IN"]);
const MONEY_MARKET_REDEEM_ROW_TYPES = new Set(["REDEMPTION", "MONEY_MARKET_REDEEM"]);

function toNumber(value: Prisma.Decimal | null | undefined): number {
  return Number(value ?? 0);
}

function normalizeSymbol(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase() || "UNKNOWN_MONEY_MARKET";
}

function symbolFromRefNumber(refNumber: string): string | null {
  const match = refNumber.match(/\(([A-Z0-9.-]+)\)$/);
  return match ? match[1] ?? null : null;
}

function applyMoneyMarketEvent(
  holdingsBySymbol: Map<string, number>,
  eligibleSymbols: Set<string>,
  totalHolding: number,
  event: { rowType: string; refNumber: string; amount: Prisma.Decimal },
): number {
  const symbol = normalizeSymbol(symbolFromRefNumber(event.refNumber));
  const currentHolding = holdingsBySymbol.get(symbol) ?? 0;
  const amount = toNumber(event.amount);
  const absoluteAmount = Math.abs(amount);

  let nextHolding = currentHolding;
  if (MONEY_MARKET_BUY_ROW_TYPES.has(event.rowType)) {
    nextHolding = currentHolding + absoluteAmount;
    eligibleSymbols.add(symbol);
  } else if (MONEY_MARKET_REDEEM_ROW_TYPES.has(event.rowType)) {
    nextHolding = currentHolding - absoluteAmount;
  } else if (event.rowType === "MONEY_MARKET_DIVIDEND") {
    if (amount >= 0 || !eligibleSymbols.has(symbol)) {
      return totalHolding;
    }

    nextHolding = currentHolding + absoluteAmount;
  } else if (event.rowType === "MONEY_MARKET_EXCHANGE_OUT") {
    nextHolding = 0;
    eligibleSymbols.delete(symbol);
  } else {
    return totalHolding;
  }

  if (nextHolding === 0) {
    holdingsBySymbol.delete(symbol);
  } else {
    holdingsBySymbol.set(symbol, nextHolding);
  }

  return totalHolding + (nextHolding - currentHolding);
}

function moneyMarketEventPriority(rowType: string, amount: Prisma.Decimal): number {
  const numericAmount = toNumber(amount);

  if (MONEY_MARKET_BUY_ROW_TYPES.has(rowType)) {
    return 1;
  }

  if (rowType === "MONEY_MARKET_DIVIDEND") {
    return numericAmount < 0 ? 2 : 3;
  }

  if (MONEY_MARKET_REDEEM_ROW_TYPES.has(rowType)) {
    return 4;
  }

  if (rowType === "MONEY_MARKET_EXCHANGE_OUT") {
    return 5;
  }

  return 6;
}

export async function hydrateFidelityCashSnapshots(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<{ updated: number }> {
  const [snapshots, moneyMarketEvents] = await Promise.all([
    tx.dailyAccountSnapshot.findMany({
      where: { accountId },
      select: { id: true, snapshotDate: true, balance: true },
      orderBy: [{ snapshotDate: "asc" }, { id: "asc" }],
    }),
    tx.cashEvent.findMany({
      where: {
        accountId,
        rowType: {
          in: [
            "MONEY_MARKET",
            "MONEY_MARKET_BUY",
            "MONEY_MARKET_REDEEM",
            "MONEY_MARKET_DIVIDEND",
            "MONEY_MARKET_EXCHANGE_OUT",
            "MONEY_MARKET_EXCHANGE_IN",
            "REDEMPTION",
          ],
        },
      },
      select: {
        eventDate: true,
        rowType: true,
        refNumber: true,
        amount: true,
      },
      orderBy: [{ eventDate: "asc" }, { id: "asc" }],
    }),
  ]);

  const holdingsBySymbol = new Map<string, number>();
  const eligibleSymbols = new Set<string>();
  const orderedMoneyMarketEvents = [...moneyMarketEvents].sort((left, right) => {
    const dateDelta = left.eventDate.getTime() - right.eventDate.getTime();
    if (dateDelta !== 0) {
      return dateDelta;
    }

    const priorityDelta = moneyMarketEventPriority(left.rowType, left.amount) - moneyMarketEventPriority(right.rowType, right.amount);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.refNumber.localeCompare(right.refNumber);
  });
  let totalHolding = 0;
  let eventIndex = 0;

  for (const snapshot of snapshots) {
    while (eventIndex < orderedMoneyMarketEvents.length && orderedMoneyMarketEvents[eventIndex]!.eventDate <= snapshot.snapshotDate) {
      totalHolding = applyMoneyMarketEvent(holdingsBySymbol, eligibleSymbols, totalHolding, orderedMoneyMarketEvents[eventIndex]!);
      eventIndex += 1;
    }

    await tx.dailyAccountSnapshot.update({
      where: { id: snapshot.id },
      data: {
        totalCash: toNumber(snapshot.balance) + totalHolding,
      },
    });
  }

  return {
    updated: snapshots.length,
  };
}
