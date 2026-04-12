import { detailResponse, errorResponse } from "@/lib/api/responses";
import { rebuildAccountSetups } from "@/lib/analytics/rebuild-account-setups";
import { prisma } from "@/lib/db/prisma";
import { releaseImportExecutionLinks, listLinkedExecutionIdsForImport } from "@/lib/imports/import-execution-links";
import { rebuildAccountLedger } from "@/lib/ledger/rebuild-account-ledger";
import type { DeleteImportResponse } from "@/types/api";

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const importId = context.params.id;

  const existingImport = await prisma.import.findUnique({
    where: { id: importId },
    select: {
      id: true,
      accountId: true,
      status: true,
    },
  });

  if (!existingImport) {
    return errorResponse("NOT_FOUND", "Import not found.", [`Import ${importId} does not exist.`], 404);
  }

  const result = await prisma.$transaction(async (tx) => {
    const linkedExecutionIds = await listLinkedExecutionIdsForImport(tx, importId);

    const deletedSnapshots = await tx.dailyAccountSnapshot.deleteMany({
      where: {
        accountId: existingImport.accountId,
        sourceRef: importId,
      },
    });

    const deletedCashEvents = await tx.cashEvent.deleteMany({
      where: {
        accountId: existingImport.accountId,
        sourceRef: importId,
      },
    });

    let deletedMatchedLots = 0;
    let deletedSetupGroups = 0;

    if (linkedExecutionIds.length > 0) {
      const matchedLots = await tx.matchedLot.findMany({
        where: {
          accountId: existingImport.accountId,
          OR: [
            {
              openExecutionId: {
                in: linkedExecutionIds,
              },
            },
            {
              closeExecutionId: {
                in: linkedExecutionIds,
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

      const matchedLotIds = matchedLots.map((row) => row.id);
      if (matchedLotIds.length > 0) {
        const setupGroupLinks = await tx.setupGroupLot.findMany({
          where: {
            matchedLotId: {
              in: matchedLotIds,
            },
          },
          select: {
            setupGroupId: true,
          },
        });

        const setupGroupIds = uniqueStrings(setupGroupLinks.map((row) => row.setupGroupId));
        if (setupGroupIds.length > 0) {
          const deletedSetups = await tx.setupGroup.deleteMany({
            where: {
              id: {
                in: setupGroupIds,
              },
            },
          });
          deletedSetupGroups = deletedSetups.count;
        }

        const deletedLots = await tx.matchedLot.deleteMany({
          where: {
            id: {
              in: matchedLotIds,
            },
          },
        });
        deletedMatchedLots = deletedLots.count;
      }
    }

    const released = await releaseImportExecutionLinks(tx, importId, linkedExecutionIds);

    await tx.import.delete({
      where: { id: importId },
    });

    let rebuildRan = false;
    let matchedLotsPersisted = 0;
    let syntheticExecutionsPersisted = 0;
    let setupGroupsPersisted = 0;
    if (existingImport.status === "COMMITTED") {
      rebuildRan = true;
      const rebuiltLedger = await rebuildAccountLedger(tx, existingImport.accountId, new Date());
      const rebuiltSetups = await rebuildAccountSetups(tx, existingImport.accountId);
      matchedLotsPersisted = rebuiltLedger.matchedLotsPersisted;
      syntheticExecutionsPersisted = rebuiltLedger.syntheticExecutionsPersisted;
      setupGroupsPersisted = rebuiltSetups.setupGroupsPersisted;
    }

    const manualAdjustmentsPreserved = await tx.manualAdjustment.count({
      where: {
        accountId: existingImport.accountId,
      },
    });

    const payload: DeleteImportResponse = {
      importId: existingImport.id,
      accountId: existingImport.accountId,
      status: existingImport.status,
      deleted: {
        importRows: 1,
        importExecutionLinks: released.deletedLinkCount,
        executions: released.deletedExecutionIds.length,
        matchedLots: deletedMatchedLots,
        setupGroups: deletedSetupGroups,
        snapshots: deletedSnapshots.count,
        cashEvents: deletedCashEvents.count,
      },
      reassignedExecutions: released.reassignedExecutionIds.length,
      manualAdjustmentsPreserved,
      rebuild: {
        ran: rebuildRan,
        matchedLotsPersisted,
        syntheticExecutionsPersisted,
        setupGroupsPersisted,
      },
    };

    return payload;
  });

  return detailResponse(result);
}
