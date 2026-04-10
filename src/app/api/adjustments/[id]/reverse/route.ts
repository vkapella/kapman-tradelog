import { Prisma } from "@prisma/client";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { ReverseManualAdjustmentResponse } from "@/types/api";

export async function POST(_request: Request, context: { params: { id: string } }) {
  const adjustmentId = context.params.id;

  const existing = await prisma.manualAdjustment.findUnique({
    where: { id: adjustmentId },
  });
  if (!existing) {
    return errorResponse("NOT_FOUND", "Adjustment not found.", [`Adjustment ${adjustmentId} does not exist.`], 404);
  }

  if (existing.status === "REVERSED") {
    return errorResponse("ALREADY_REVERSED", "Adjustment is already reversed.", [`Adjustment ${adjustmentId} is already reversed.`], 409);
  }

  const reversal = await prisma.$transaction(async (tx) => {
    const createdReversal = await tx.manualAdjustment.create({
      data: {
        createdBy: "local-user",
        accountId: existing.accountId,
        symbol: existing.symbol,
        effectiveDate: new Date(),
        adjustmentType: existing.adjustmentType,
        payloadJson: existing.payloadJson as Prisma.InputJsonValue,
        reason: `Reversal of adjustment ${existing.id}`,
        evidenceRef: existing.evidenceRef,
        status: "REVERSED",
      },
    });

    await tx.manualAdjustment.update({
      where: { id: existing.id },
      data: {
        status: "REVERSED",
        reversedByAdjustmentId: createdReversal.id,
      },
    });

    return createdReversal;
  });

  const payload: ReverseManualAdjustmentResponse = {
    reversedId: existing.id,
    reversalId: reversal.id,
  };

  return detailResponse(payload);
}
