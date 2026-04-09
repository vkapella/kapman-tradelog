import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { SetupDetailResponse } from "@/types/api";

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export async function GET(_request: Request, context: { params: { id: string } }) {
  const setupGroup = await prisma.setupGroup.findUnique({
    where: { id: context.params.id },
    include: {
      lots: {
        include: {
          matchedLot: {
            include: {
              openExecution: true,
              closeExecution: true,
            },
          },
        },
      },
    },
  });

  if (!setupGroup) {
    return errorResponse("NOT_FOUND", "Setup group not found.", [`Setup ${context.params.id} does not exist.`], 404);
  }

  const lots = setupGroup.lots.map((entry) => entry.matchedLot);
  const executionIds = lots.flatMap((lot) => [lot.openExecutionId, lot.closeExecutionId].filter(Boolean) as string[]);
  const effectiveTag = setupGroup.overrideTag ?? setupGroup.tag;

  const optionLots = lots.filter((lot) => lot.openExecution.assetClass === "OPTION");
  const shortCallLots = optionLots.filter((lot) => lot.openExecution.optionType === "CALL" && lot.openExecution.side === "SELL");
  const reasons: string[] = [];

  if (effectiveTag === "bull_vertical" || effectiveTag === "bear_vertical" || effectiveTag === "calendar" || effectiveTag === "diagonal") {
    reasons.push(`This setup is tagged ${effectiveTag} because paired call-leg structure matched spread inference rules.`);
  }

  if (effectiveTag === "short_call" || effectiveTag === "uncategorized") {
    const firstShortOpenDate = shortCallLots.reduce<Date | null>((earliest, lot) => {
      const tradeDate = lot.openExecution.tradeDate;
      if (!earliest || tradeDate < earliest) {
        return tradeDate;
      }
      return earliest;
    }, null);

    if (firstShortOpenDate) {
      const overlappingLongCalls = await prisma.matchedLot.findMany({
        where: {
          accountId: setupGroup.accountId,
          openExecution: {
            assetClass: "OPTION",
            optionType: "CALL",
            side: "BUY",
            underlyingSymbol: setupGroup.underlyingSymbol,
            tradeDate: { lte: firstShortOpenDate },
          },
          OR: [{ closeExecution: null }, { closeExecution: { tradeDate: { gte: firstShortOpenDate } } }],
        },
        select: { id: true },
      });

      if (effectiveTag === "short_call") {
        if (overlappingLongCalls.length === 0) {
          reasons.push(`No overlapping long-call anchor existed on ${dateOnly(firstShortOpenDate)}; this setup falls back to short_call.`);
        } else {
          reasons.push(
            `Overlapping long-call anchors exist (${overlappingLongCalls.length}), but no eligible vertical/calendar/diagonal pairing passed deterministic rules.`,
          );
        }
      }

      if (effectiveTag === "uncategorized") {
        if (optionLots.length > 0 && optionLots.length === shortCallLots.length) {
          reasons.push(
            "All option lots are short calls, but pairing could not classify this into a supported spread; review possible entry-side mistakes or unsupported leg structure.",
          );
        } else {
          reasons.push("Lot composition did not match supported inference tags; kept as uncategorized.");
        }
      }
    }
  }

  if (effectiveTag === "long_call" || effectiveTag === "long_put" || effectiveTag === "cash_secured_put") {
    reasons.push(`Homogeneous multi-lot ${effectiveTag} grouping is supported; all grouped lots matched this base setup type.`);
  }

  if (reasons.length === 0) {
    reasons.push("No additional inference notes were generated for this setup.");
  }

  const payload: SetupDetailResponse = {
    setup: {
      id: setupGroup.id,
      accountId: setupGroup.accountId,
      tag: setupGroup.tag,
      overrideTag: setupGroup.overrideTag,
      underlyingSymbol: setupGroup.underlyingSymbol,
      realizedPnl: setupGroup.realizedPnl?.toString() ?? null,
      winRate: setupGroup.winRate?.toString() ?? null,
      expectancy: setupGroup.expectancy?.toString() ?? null,
      averageHoldDays: setupGroup.averageHoldDays?.toString() ?? null,
    },
    lots: lots.map((lot) => ({
      id: lot.id,
      accountId: lot.accountId,
      symbol: lot.openExecution.symbol,
      openTradeDate: lot.openExecution.tradeDate.toISOString(),
      closeTradeDate: lot.closeExecution?.tradeDate.toISOString() ?? null,
      openImportId: lot.openExecution.importId,
      closeImportId: lot.closeExecution?.importId ?? null,
      quantity: lot.quantity.toString(),
      realizedPnl: lot.realizedPnl.toString(),
      holdingDays: lot.holdingDays,
      outcome: lot.outcome,
      openExecutionId: lot.openExecutionId,
      closeExecutionId: lot.closeExecutionId,
    })),
    executionIds,
    inference: {
      reasons: uniqueStrings(reasons),
    },
  };

  return detailResponse(payload);
}
