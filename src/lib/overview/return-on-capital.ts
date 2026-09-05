import { EXTERNAL_FLOW_ROW_TYPES } from "@/lib/ledger/cash-row-classification";

/**
 * Cash-event row types that are external capital flows (contributions when
 * positive, withdrawals when negative). Wires out and Fidelity's signed wire
 * adjustments joined in #351 so return-on-capital and the value engine see the
 * money that left to fund another account.
 */
export const EXTERNAL_CAPITAL_ROW_TYPES = EXTERNAL_FLOW_ROW_TYPES;

export type ReturnOnCapitalBeginningValueSource = "broker_nlv" | "value_snapshot" | "daily_snapshot_cash" | "mixed" | "unavailable";

export type ReturnOnCapitalEndingValueSource = "position_snapshot" | "daily_account_snapshot" | "mixed" | "unavailable";

export interface ReturnOnCapitalInput {
  beginningValue: number | null;
  beginningValueSource?: ReturnOnCapitalBeginningValueSource;
  endingValue: number | null;
  positiveExternalContributions: number;
  /** Transfer-date value of in-kind receives inside the period; added to positive contributions (#357). */
  inKindContributions?: number;
  withdrawals: number;
  missingBeginningValueAccountIds: string[];
  missingEndingValueAccountIds: string[];
  endingValueSource: ReturnOnCapitalEndingValueSource;
}

export interface ReturnOnCapitalResult {
  beginningValue: number | null;
  beginningValueSource: ReturnOnCapitalBeginningValueSource;
  endingValue: number | null;
  netExternalContributions: number;
  positiveExternalContributions: number;
  inKindContributions: number;
  withdrawals: number;
  returnDollars: number | null;
  capitalBase: number | null;
  returnOnCapitalPct: number | null;
  missingBeginningValueAccountIds: string[];
  missingEndingValueAccountIds: string[];
  endingValueSource: ReturnOnCapitalEndingValueSource;
}

export function calculateReturnOnCapital(input: ReturnOnCapitalInput): ReturnOnCapitalResult {
  const inKindContributions = input.inKindContributions ?? 0;
  const positiveExternalContributions = input.positiveExternalContributions + inKindContributions;
  const netExternalContributions = positiveExternalContributions - input.withdrawals;
  const missingRequiredValues =
    input.beginningValue === null ||
    input.endingValue === null ||
    input.missingBeginningValueAccountIds.length > 0 ||
    input.missingEndingValueAccountIds.length > 0;
  const capitalBase = input.beginningValue === null ? null : input.beginningValue + positiveExternalContributions - input.withdrawals;
  const returnDollars =
    input.beginningValue === null || input.endingValue === null
      ? null
      : input.endingValue - input.beginningValue - netExternalContributions;
  const returnOnCapitalPct =
    !missingRequiredValues && capitalBase !== null && capitalBase > 0 && returnDollars !== null
      ? (returnDollars / capitalBase) * 100
      : null;

  return {
    beginningValue: input.beginningValue,
    beginningValueSource: input.beginningValueSource ?? (input.beginningValue === null ? "unavailable" : "daily_snapshot_cash"),
    endingValue: input.endingValue,
    netExternalContributions,
    positiveExternalContributions,
    inKindContributions,
    withdrawals: input.withdrawals,
    returnDollars,
    capitalBase,
    returnOnCapitalPct,
    missingBeginningValueAccountIds: input.missingBeginningValueAccountIds,
    missingEndingValueAccountIds: input.missingEndingValueAccountIds,
    endingValueSource: input.endingValueSource,
  };
}

export function snapshotValue(row: {
  brokerNetLiquidationValue: { toString(): string } | number | null;
  totalCash: { toString(): string } | number | null;
  balance: { toString(): string } | number;
}): number {
  return Number(row.brokerNetLiquidationValue ?? row.totalCash ?? row.balance);
}

/**
 * Beginning value for a period: broker NLV when the daily snapshot has it;
 * otherwise the value engine's total for that date (cash plus marked
 * securities); only as a last resort the cash-only daily snapshot, which
 * excludes securities held on the beginning date and overstates return (#358).
 */
export function resolveBeginningValue(row: {
  brokerNetLiquidationValue: { toString(): string } | number | null;
  totalCash: { toString(): string } | number | null;
  balance: { toString(): string } | number;
}, valueSnapshotTotal: { toString(): string } | number | null | undefined): { value: number; source: ReturnOnCapitalBeginningValueSource } {
  if (row.brokerNetLiquidationValue !== null && row.brokerNetLiquidationValue !== undefined) {
    return { value: Number(row.brokerNetLiquidationValue), source: "broker_nlv" };
  }
  if (valueSnapshotTotal !== null && valueSnapshotTotal !== undefined) {
    return { value: Number(valueSnapshotTotal), source: "value_snapshot" };
  }
  return { value: Number(row.totalCash ?? row.balance), source: "daily_snapshot_cash" };
}

export function combineBeginningValueSources(sources: ReturnOnCapitalBeginningValueSource[]): ReturnOnCapitalBeginningValueSource {
  const distinct = new Set(sources.filter((source) => source !== "unavailable"));
  if (distinct.size === 0) {
    return "unavailable";
  }
  return distinct.size === 1 ? Array.from(distinct)[0] : "mixed";
}
