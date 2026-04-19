import { PrismaClient, type Prisma } from "@prisma/client";
import { rebuildAccountSetups } from "../src/lib/analytics/rebuild-account-setups";
import { rebuildAccountLedger } from "../src/lib/ledger/rebuild-account-ledger";

interface AccountStats {
  matchedLotCount: number;
  matchedLotPnl: number;
  setupCount: number;
  setupPnl: number;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value) : 0;
}

async function loadAccountStats(prisma: PrismaClient, accountId: string): Promise<AccountStats> {
  const [matchedLotAgg, setupAgg] = await Promise.all([
    prisma.matchedLot.aggregate({
      where: { accountId },
      _count: { _all: true },
      _sum: { realizedPnl: true },
    }),
    prisma.setupGroup.aggregate({
      where: { accountId },
      _count: { _all: true },
      _sum: { realizedPnl: true },
    }),
  ]);

  return {
    matchedLotCount: matchedLotAgg._count._all,
    matchedLotPnl: decimalToNumber(matchedLotAgg._sum.realizedPnl),
    setupCount: setupAgg._count._all,
    setupPnl: decimalToNumber(setupAgg._sum.realizedPnl),
  };
}

function formatSigned(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        accountId: true,
      },
      orderBy: { accountId: "asc" },
    });

    if (accounts.length === 0) {
      console.log("[rebuild:pnl] no accounts found; nothing to rebuild.");
      return;
    }

    console.log(`[rebuild:pnl] rebuilding ${accounts.length} account(s)...`);

    for (const account of accounts) {
      const before = await loadAccountStats(prisma, account.id);
      const rebuilt = await prisma.$transaction(async (tx) => {
        const ledger = await rebuildAccountLedger(tx, account.id, new Date());
        const setups = await rebuildAccountSetups(tx, account.id);
        return { ledger, setups };
      });
      const after = await loadAccountStats(prisma, account.id);

      console.log(`\n[rebuild:pnl] account=${account.accountId}`);
      console.log(
        `  matched_lots: ${before.matchedLotCount} -> ${after.matchedLotCount} | realized_pnl: ${formatSigned(before.matchedLotPnl)} -> ${formatSigned(after.matchedLotPnl)}`,
      );
      console.log(
        `  setup_groups: ${before.setupCount} -> ${after.setupCount} | realized_pnl: ${formatSigned(before.setupPnl)} -> ${formatSigned(after.setupPnl)}`,
      );
      console.log(
        `  ledger: matched_persisted=${rebuilt.ledger.matchedLotsPersisted}, synthetic_persisted=${rebuilt.ledger.syntheticExecutionsPersisted}, warnings=${rebuilt.ledger.warnings.length}`,
      );
      console.log(
        `  setups: persisted=${rebuilt.setups.setupGroupsPersisted}, uncategorized=${rebuilt.setups.uncategorizedCount}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[rebuild:pnl] failed", error);
  process.exit(1);
});
