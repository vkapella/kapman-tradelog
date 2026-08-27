import { Prisma } from "@prisma/client";
import type { AccountRecord } from "@/types/api";

export interface AccountRow {
  id: string;
  accountId: string;
  displayLabel: string | null;
  brokerName: string | null;
  startingCapital: Prisma.Decimal | null;
  paperMoney: boolean;
  legalEntity: { slug: string; legalName: string; kind: "CORPORATION" | "INDIVIDUAL" } | null;
  createdAt: Date;
}

export function mapAccountRowToRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    displayLabel: row.displayLabel,
    brokerName: row.brokerName,
    startingCapital: row.startingCapital?.toString() ?? null,
    paperMoney: row.paperMoney,
    legalEntity: row.legalEntity
      ? { slug: row.legalEntity.slug, legalName: row.legalEntity.legalName, kind: row.legalEntity.kind }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}
