import { Prisma } from "@prisma/client";
import type { AccountRecord } from "@/types/api";

export interface AccountRow {
  id: string;
  accountId: string;
  displayLabel: string | null;
  brokerName: string | null;
  startingCapital: Prisma.Decimal | null;
  createdAt: Date;
}

export function mapAccountRowToRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    displayLabel: row.displayLabel,
    brokerName: row.brokerName,
    startingCapital: row.startingCapital?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
