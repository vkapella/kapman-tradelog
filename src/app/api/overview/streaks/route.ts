import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { StreakSummaryResponse } from "@/types/api";

export async function GET() {
  const lots = await prisma.matchedLot.findMany({
    include: {
      closeExecution: {
        select: {
          tradeDate: true,
        },
      },
      openExecution: {
        select: {
          tradeDate: true,
        },
      },
    },
    orderBy: [{ closeExecution: { tradeDate: "asc" } }, { id: "asc" }],
  });

  let currentType: "WIN" | "LOSS" | null = null;
  let currentCount = 0;
  let longestWin = 0;
  let longestLoss = 0;

  const sorted = [...lots].sort((left, right) => {
    const leftDate = left.closeExecution?.tradeDate ?? left.openExecution.tradeDate;
    const rightDate = right.closeExecution?.tradeDate ?? right.openExecution.tradeDate;
    return leftDate.getTime() - rightDate.getTime();
  });

  for (const lot of sorted) {
    if (lot.outcome !== "WIN" && lot.outcome !== "LOSS") {
      currentType = null;
      currentCount = 0;
      continue;
    }

    if (lot.outcome === currentType) {
      currentCount += 1;
    } else {
      currentType = lot.outcome;
      currentCount = 1;
    }

    if (currentType === "WIN") {
      longestWin = Math.max(longestWin, currentCount);
    }

    if (currentType === "LOSS") {
      longestLoss = Math.max(longestLoss, currentCount);
    }
  }

  const payload: StreakSummaryResponse = {
    currentStreak: currentCount,
    currentStreakType: currentType,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
  };

  return NextResponse.json(payload);
}
