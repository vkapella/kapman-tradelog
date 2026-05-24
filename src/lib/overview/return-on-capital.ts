export const EXTERNAL_CAPITAL_ROW_TYPES = ["TRANSFER_IN", "ACAT_RECEIVE", "ACAT_CREDIT"] as const;

export type ReturnOnCapitalEndingValueSource = "position_snapshot" | "daily_account_snapshot" | "unavailable";

export interface ReturnOnCapitalInput {
  beginningValue: number | null;
  endingValue: number | null;
  positiveExternalContributions: number;
  withdrawals: number;
  missingBeginningValueAccountIds: string[];
  missingEndingValueAccountIds: string[];
  endingValueSource: ReturnOnCapitalEndingValueSource;
}

export interface ReturnOnCapitalResult {
  beginningValue: number | null;
  endingValue: number | null;
  netExternalContributions: number;
  positiveExternalContributions: number;
  withdrawals: number;
  returnDollars: number | null;
  capitalBase: number | null;
  returnOnCapitalPct: number | null;
  missingBeginningValueAccountIds: string[];
  missingEndingValueAccountIds: string[];
  endingValueSource: ReturnOnCapitalEndingValueSource;
}

export function calculateReturnOnCapital(input: ReturnOnCapitalInput): ReturnOnCapitalResult {
  const netExternalContributions = input.positiveExternalContributions - input.withdrawals;
  const missingRequiredValues =
    input.beginningValue === null ||
    input.endingValue === null ||
    input.missingBeginningValueAccountIds.length > 0 ||
    input.missingEndingValueAccountIds.length > 0;
  const capitalBase = input.beginningValue === null ? null : input.beginningValue + input.positiveExternalContributions - input.withdrawals;
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
    endingValue: input.endingValue,
    netExternalContributions,
    positiveExternalContributions: input.positiveExternalContributions,
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
