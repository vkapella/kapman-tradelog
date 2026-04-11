import type { Prisma } from "@prisma/client";
import type { NormalizedCashEvent } from "@/lib/adapters/types";

export interface ReplaceImportCashEventsResult {
  parsed: number;
  upserted: number;
  deleted: number;
}

export async function replaceImportCashEvents(
  tx: Prisma.TransactionClient,
  importId: string,
  accountId: string,
  cashEvents: NormalizedCashEvent[],
): Promise<ReplaceImportCashEventsResult> {
  const refNumbers = cashEvents.map((cashEvent) => cashEvent.refNumber);

  const deleted = await tx.cashEvent.deleteMany({
    where: {
      accountId,
      sourceRef: importId,
      ...(refNumbers.length > 0 ? { refNumber: { notIn: refNumbers } } : {}),
    },
  });

  let upserted = 0;
  for (const cashEvent of cashEvents) {
    await tx.cashEvent.upsert({
      where: {
        accountId_refNumber: {
          accountId,
          refNumber: cashEvent.refNumber,
        },
      },
      update: {
        eventDate: cashEvent.eventDate,
        rowType: cashEvent.rowType,
        description: cashEvent.description,
        amount: cashEvent.amount,
        sourceRef: importId,
      },
      create: {
        accountId,
        eventDate: cashEvent.eventDate,
        rowType: cashEvent.rowType,
        refNumber: cashEvent.refNumber,
        description: cashEvent.description,
        amount: cashEvent.amount,
        sourceRef: importId,
      },
    });
    upserted += 1;
  }

  return {
    parsed: cashEvents.length,
    upserted,
    deleted: deleted.count,
  };
}
