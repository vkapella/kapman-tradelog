import { detailResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { TtsEvidenceResponse } from "@/types/api";

export async function GET() {
  const executions = await prisma.execution.findMany({
    select: {
      tradeDate: true,
      quantity: true,
      price: true,
    },
  });

  const tradesPerMonth = executions.length;
  const activeDays = new Set(executions.map((row) => row.tradeDate.toISOString().slice(0, 10))).size;
  const grossProceeds = executions.reduce((sum, row) => {
    const price = Number(row.price ?? 0);
    const quantity = Math.abs(Number(row.quantity));
    return sum + price * quantity;
  }, 0);

  const payload: TtsEvidenceResponse = {
    tradesPerMonth,
    activeDaysPerWeek: Number((activeDays / 4.3).toFixed(2)),
    averageHoldingPeriodDays: 0,
    medianHoldingPeriodDays: 0,
    annualizedTradeCount: tradesPerMonth * 12,
    grossProceedsProxy: grossProceeds.toFixed(2),
  };

  return detailResponse(payload);
}
