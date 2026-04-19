import { detailResponse, errorResponse } from "@/lib/api/responses";
import { rebuildAccountSetups } from "@/lib/analytics/rebuild-account-setups";
import { prisma } from "@/lib/db/prisma";
import { rebuildAccountLedger } from "@/lib/ledger/rebuild-account-ledger";
import type { AccountLedgerRebuildResponse } from "@/types/api";

export async function POST(_request: Request, context: { params: { id: string } }) {
  const accountParam = context.params.id;
  const account = await prisma.account.findFirst({
    where: {
      OR: [{ id: accountParam }, { accountId: accountParam }],
    },
    select: {
      id: true,
      accountId: true,
    },
  });

  if (!account) {
    return errorResponse("ACCOUNT_NOT_FOUND", "Account not found.", [`No account exists for id ${accountParam}.`], 404);
  }

  const rebuiltAt = new Date();
  const rebuilt = await prisma.$transaction(async (tx) => {
    const ledger = await rebuildAccountLedger(tx, account.id, rebuiltAt);
    const setups = await rebuildAccountSetups(tx, account.id);
    return { ledger, setups };
  });

  const payload: AccountLedgerRebuildResponse = {
    matchedLotsPersisted: rebuilt.ledger.matchedLotsPersisted,
    syntheticExecutionsPersisted: rebuilt.ledger.syntheticExecutionsPersisted,
    warningsCleared: rebuilt.ledger.warningsCleared,
    setupGroupsPersisted: rebuilt.setups.setupGroupsPersisted,
  };

  return detailResponse(payload);
}
