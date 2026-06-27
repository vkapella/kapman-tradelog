import { fallbackInstrumentKey } from "@/lib/positions/compute-open-positions";
import type {
  ExecutionRecord,
  OpenPosition,
  PortfolioSnapshot,
  PortfolioSnapshotClosedLot,
  PortfolioSnapshotOpenLeg,
} from "@/types/api";

export const TRADELOG_SCHEMA_VERSION = "1.0" as const;

/** OpenPosition with the per-leg mark resolved at compute time. */
export type PricedOpenPosition = OpenPosition & { mark: number | null };

/** Pre-shaped closed-lot input assembled by the route from MatchedLot + its relations. */
export interface ClosedLotInput {
  accountId: string; // internal account id
  symbol: string;
  realizedPnl: number;
  exitDate: string | null;
  closePrice: number | null;
  closeEventType: string | null;
  closeStrike: number | null;
  outcome: string;
  holdingDays: number;
  maePct: number | null;
  mfePct: number | null;
}

export interface BuildPortfolioSnapshotInput {
  exportedAt: string;
  asOf: string;
  /** Resolved external account ids in scope; empty array = all accounts. */
  accountExternalIds: string[];
  /** internal account id -> external account id (human-facing label). */
  accountExternalIdByInternal: Map<string, string>;
  pricedOpenPositions: PricedOpenPosition[];
  /** All executions in scope; the builder filters opening executions itself for the entry-join. */
  executions: ExecutionRecord[];
  closedLots: ClosedLotInput[];
}

function contractMultiplier(assetClass: OpenPosition["assetClass"]): number {
  return assetClass === "OPTION" ? 100 : 1;
}

/**
 * Single-leg structure label using the canonical SetupTag vocabulary
 * (src/lib/analytics/setup-inference.ts). Spreads are NOT collapsed here — each
 * open leg is one row; consumers group legs by spread_group_id to name the spread.
 */
export function deriveStructure(position: Pick<OpenPosition, "assetClass" | "optionType" | "netQty">): string {
  if (position.assetClass === "EQUITY") {
    return "stock";
  }

  const isLong = position.netQty > 0;
  if (position.optionType === "CALL") {
    return isLong ? "long_call" : "short_call";
  }
  if (position.optionType === "PUT") {
    return isLong ? "long_put" : "short_put";
  }

  return "uncategorized";
}

/**
 * Mirrors effectiveClosePrice in src/lib/ledger/fifo-matcher.ts (the price the
 * realized-P&L math actually used): raw close price when present (0 for a
 * synthetic expiration), else the strike for assignment/exercise, else null.
 */
export function effectiveClosePrice(
  closePrice: number | null,
  closeEventType: string | null,
  closeStrike: number | null,
): number | null {
  if (closePrice !== null) {
    return closePrice;
  }
  if ((closeEventType === "ASSIGNMENT" || closeEventType === "EXERCISE") && closeStrike !== null) {
    return closeStrike;
  }
  return null;
}

interface EntryInfo {
  entryDate: string | null;
  spreadGroupId: string | null;
}

function isOpeningExecution(execution: ExecutionRecord): boolean {
  // Mirrors the opening-leg condition in compute-open-positions.ts.
  const isPlainEquityBuy =
    execution.assetClass === "EQUITY" &&
    execution.side === "BUY" &&
    execution.openingClosingEffect === "UNKNOWN" &&
    execution.spreadGroupId === null;
  return execution.openingClosingEffect === "TO_OPEN" || isPlainEquityBuy;
}

function groupKeyForExecution(execution: ExecutionRecord): string {
  const key = execution.instrumentKey ?? fallbackInstrumentKey(execution);
  return execution.accountId + "::" + key;
}

/** entryDate = earliest opening execution; spreadGroupId = the earliest opening leg's group (if any). */
export function buildEntryInfoByGroupKey(executions: ExecutionRecord[]): Map<string, EntryInfo> {
  const byGroup = new Map<string, EntryInfo>();

  for (const execution of executions) {
    if (!isOpeningExecution(execution)) {
      continue;
    }

    const groupKey = groupKeyForExecution(execution);
    const existing = byGroup.get(groupKey);

    if (!existing) {
      byGroup.set(groupKey, { entryDate: execution.tradeDate, spreadGroupId: execution.spreadGroupId });
      continue;
    }

    if (existing.entryDate === null || execution.tradeDate < existing.entryDate) {
      existing.entryDate = execution.tradeDate;
      // Prefer the spreadGroupId of the earliest opening leg.
      existing.spreadGroupId = execution.spreadGroupId ?? existing.spreadGroupId;
    } else if (existing.spreadGroupId === null && execution.spreadGroupId !== null) {
      existing.spreadGroupId = execution.spreadGroupId;
    }
  }

  return byGroup;
}

export function buildPortfolioSnapshot(input: BuildPortfolioSnapshotInput): PortfolioSnapshot {
  const entryInfoByGroupKey = buildEntryInfoByGroupKey(input.executions);

  const open_positions: PortfolioSnapshotOpenLeg[] = input.pricedOpenPositions.map((position) => {
    const multiplier = contractMultiplier(position.assetClass);
    const groupKey = position.accountId + "::" + position.instrumentKey;
    const entryInfo = entryInfoByGroupKey.get(groupKey) ?? { entryDate: null, spreadGroupId: null };

    const entryPrice =
      position.netQty !== 0 ? position.costBasis / (position.netQty * multiplier) : null;
    const unrealizedPnl =
      position.mark === null ? null : position.mark * position.netQty * multiplier - position.costBasis;

    return {
      symbol: position.symbol,
      instrument_key: position.instrumentKey,
      account_id: input.accountExternalIdByInternal.get(position.accountId) ?? position.accountId,
      asset_class: position.assetClass,
      option_type: position.optionType,
      structure: deriveStructure(position),
      direction: position.netQty > 0 ? "LONG" : "SHORT",
      spread_group_id: entryInfo.spreadGroupId,
      strike: position.strike,
      expiration: position.expirationDate,
      net_qty: position.netQty,
      cost_basis: position.costBasis,
      entry_date: entryInfo.entryDate,
      entry_price: entryPrice,
      mark: position.mark,
      unrealized_pnl: unrealizedPnl,
      mae_pct: null,
      mfe_pct: null,
      excursion_as_of: null,
    };
  });

  const closed_lots: PortfolioSnapshotClosedLot[] = input.closedLots.map((lot) => ({
    symbol: lot.symbol,
    account_id: input.accountExternalIdByInternal.get(lot.accountId) ?? lot.accountId,
    realized_pnl: lot.realizedPnl,
    exit_date: lot.exitDate,
    exit_price: effectiveClosePrice(lot.closePrice, lot.closeEventType, lot.closeStrike),
    outcome: lot.outcome,
    holding_days: lot.holdingDays,
    mae_pct: lot.maePct,
    mfe_pct: lot.mfePct,
  }));

  return {
    kind: "portfolio_snapshot",
    source: "kapman-tradelog",
    exported_at: input.exportedAt,
    tradelog_schema_version: TRADELOG_SCHEMA_VERSION,
    account_ids: input.accountExternalIds,
    as_of: input.asOf,
    open_excursions_available: false,
    open_positions,
    closed_lots,
  };
}
