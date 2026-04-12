import { prisma } from "@/lib/db/prisma";
import { buildAccountDefaults } from "@/lib/accounts/defaults";

export async function ensureAccountDefaults(): Promise<void> {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      label: true,
      broker: true,
      displayLabel: true,
      brokerName: true,
      startingCapital: true,
    },
  });

  for (const account of accounts) {
    const data = buildAccountDefaults(account);
    if (Object.keys(data).length === 0) {
      continue;
    }

    await prisma.account.update({
      where: { id: account.id },
      data,
    });
  }
}
