import type { AccountBalanceContextRecord } from "@/lib/accounts/account-balance-context";
import type { LiveAccountValue, PositionSnapshotOpenPosition } from "@/types/api";

interface ResolveLiveAccountValueInput {
  accountId: string;
  accountExternalId: string;
  positions: PositionSnapshotOpenPosition[];
  balance: AccountBalanceContextRecord | null;
  marksAsOf: Date;
}

function money(value: number): string {
  return value.toFixed(2);
}

function dateKey(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function resolveLiveAccountValue(input: ResolveLiveAccountValueInput): LiveAccountValue {
  let equityMarketValue = 0;
  let optionMarketValue = 0;
  let missingMarkCount = 0;

  for (const position of input.positions.filter((row) => row.accountId === input.accountId)) {
    if (position.mark === null || !Number.isFinite(position.mark)) {
      missingMarkCount += 1;
      continue;
    }

    const marketValue = position.mark * position.netQty * (position.assetClass === "OPTION" ? 100 : 1);
    if (position.assetClass === "OPTION") {
      optionMarketValue += marketValue;
    } else {
      equityMarketValue += marketValue;
    }
  }

  const cash = input.balance?.cash ?? 0;
  const securitiesMarketValue = equityMarketValue + optionMarketValue;
  const reconstructedNlv = missingMarkCount === 0 ? cash + securitiesMarketValue : null;
  const brokerReportedNlv = input.balance?.brokerNetLiquidationValue ?? null;
  const reconciliationDelta = reconstructedNlv === null || brokerReportedNlv === null
    ? null
    : reconstructedNlv - brokerReportedNlv;
  const cashAsOf = input.balance?.cashAsOf ?? null;
  const marksAsOf = input.marksAsOf.toISOString();
  const status = missingMarkCount > 0
    ? "INCOMPLETE_MARKS"
    : dateKey(cashAsOf) !== dateKey(input.marksAsOf)
      ? "MIXED_AS_OF"
      : "CURRENT";

  return {
    accountId: input.accountId,
    accountExternalId: input.accountExternalId,
    cashAndEquivalents: money(cash),
    equityMarketValue: money(equityMarketValue),
    optionMarketValue: money(optionMarketValue),
    securitiesMarketValue: money(securitiesMarketValue),
    reconstructedNlv: reconstructedNlv === null ? null : money(reconstructedNlv),
    brokerReportedNlv: brokerReportedNlv === null ? null : money(brokerReportedNlv),
    reconciliationDelta: reconciliationDelta === null ? null : money(reconciliationDelta),
    cashAsOf,
    marksAsOf,
    brokerNlvAsOf: input.balance?.brokerNlvAsOf ?? null,
    missingMarkCount,
    status,
    valuationBasis: "MARK",
    cashSource: input.balance?.cashSource ?? "heuristic_fallback",
  };
}

export function sumCompleteReconstructedNlv(values: LiveAccountValue[]): number | null {
  if (values.length === 0 || values.some((value) => value.reconstructedNlv === null)) {
    return null;
  }
  return values.reduce((sum, value) => sum + Number(value.reconstructedNlv), 0);
}
