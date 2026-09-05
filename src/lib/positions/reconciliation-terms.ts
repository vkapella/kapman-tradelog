import type { Prisma } from "@prisma/client";
import { cashLedgerAmount, inKindTransferValue, summarizeCashRows, type CashRowSummary } from "@/lib/ledger/cash-row-classification";
import type { ManualAdjustmentRecord } from "@/types/api";

export interface ReconciliationCashRow {
  accountId: string;
  rowType: string;
  amount: Prisma.Decimal | number | string;
  description?: string | null;
}

export interface ReconciliationExecutionRow {
  id: string;
  accountId: string;
  assetClass: string;
  side: string | null;
  quantity: Prisma.Decimal | string | number;
  price: Prisma.Decimal | string | number | null;
  rawRowJson?: Prisma.JsonValue | null;
}

export interface AccountReconciliationTerms {
  /** Classified ledger contribution of the account's cash rows (#356). */
  cashAdjustments: number;
  /** Transfer-date value of in-kind receives, with basis overrides applied (#357). */
  inKindContributions: number;
  cashRowSummary: CashRowSummary;
}

export function executionPriceOverrides(adjustments: ManualAdjustmentRecord[]): Map<string, number> {
  const overrides = new Map<string, number>();
  for (const adjustment of adjustments) {
    if (adjustment.status !== "ACTIVE" || adjustment.adjustmentType !== "EXECUTION_PRICE_OVERRIDE") {
      continue;
    }
    const payload = adjustment.payload as unknown as { executionId?: unknown; overridePrice?: unknown };
    if (typeof payload.executionId === "string" && typeof payload.overridePrice === "number" && Number.isFinite(payload.overridePrice)) {
      overrides.set(payload.executionId, payload.overridePrice);
    }
  }
  return overrides;
}

/**
 * Per-account cash and in-kind terms of the reconciliation identity
 *
 *   unexplained = NLV − startingCapital − unrealized − cashAdjustments
 *                 − inKindContributions − realized − manualAdjustments
 *
 * computed from the same classification the value engine uses, so a zero
 * residual means the ledger is internally consistent and a non-zero one is a
 * real data-integrity signal.
 */
export function computeAccountReconciliationTerms(input: {
  accountIds: string[];
  cashRows: ReconciliationCashRow[];
  executions: ReconciliationExecutionRow[];
  adjustments: ManualAdjustmentRecord[];
}): Map<string, AccountReconciliationTerms> {
  const overrides = executionPriceOverrides(input.adjustments);
  const result = new Map<string, AccountReconciliationTerms>();
  for (const accountId of input.accountIds) {
    const rows = input.cashRows.filter((row) => row.accountId === accountId);
    const inKind = input.executions
      .filter((execution) => execution.accountId === accountId)
      .reduce((sum, execution) => sum + inKindTransferValue(execution, overrides.get(execution.id) ?? null), 0);
    result.set(accountId, {
      cashAdjustments: rows.reduce((sum, row) => sum + cashLedgerAmount(row), 0),
      inKindContributions: inKind,
      cashRowSummary: summarizeCashRows(rows),
    });
  }
  return result;
}

export function unexplainedDelta(terms: {
  nlv: number;
  startingCapital: number;
  unrealizedPnl: number;
  cashAdjustments: number;
  inKindContributions: number;
  realizedPnl: number;
  manualAdjustments: number;
}): number {
  return terms.nlv - terms.startingCapital - terms.unrealizedPnl - terms.cashAdjustments - terms.inKindContributions - terms.realizedPnl - terms.manualAdjustments;
}
