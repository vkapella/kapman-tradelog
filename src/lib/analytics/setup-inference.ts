export type SetupTag =
  | "long_call"
  | "long_put"
  | "covered_call"
  | "cash_secured_put"
  | "bull_vertical"
  | "bear_vertical"
  | "diagonal"
  | "calendar"
  | "roll"
  | "uncategorized";

export interface SetupInferenceLot {
  id: string;
  accountId: string;
  symbol: string;
  underlyingSymbol: string;
  openTradeDate: Date;
  closeTradeDate: Date | null;
  realizedPnl: number;
  holdingDays: number;
  openAssetClass: "EQUITY" | "OPTION" | "CASH" | "OTHER";
  openSide: "BUY" | "SELL" | null;
  optionType: string | null;
  strike: number | null;
  expirationDate: Date | null;
}

export interface InferredSetupGroup {
  accountId: string;
  underlyingSymbol: string;
  tag: SetupTag;
  lotIds: string[];
  realizedPnl: number;
  winRate: number;
  expectancy: number;
  averageHoldDays: number;
}

export interface SetupInferenceResult {
  groups: InferredSetupGroup[];
  uncategorizedCount: number;
}

function daysBetween(start: Date, end: Date): number {
  const millis = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / millis);
}

function isSameDate(value: Date | null, other: Date | null): boolean {
  if (!value || !other) {
    return false;
  }

  return value.toISOString().slice(0, 10) === other.toISOString().slice(0, 10);
}

function hasRollSignal(lots: SetupInferenceLot[], rollWindowDays: number): boolean {
  const sorted = [...lots].sort((left, right) => left.openTradeDate.getTime() - right.openTradeDate.getTime());
  for (const closedLot of sorted) {
    if (!closedLot.closeTradeDate) {
      continue;
    }

    const latestAllowed = new Date(closedLot.closeTradeDate);
    latestAllowed.setUTCDate(latestAllowed.getUTCDate() + rollWindowDays);

    const reopened = sorted.some((candidate) => {
      return (
        candidate.id !== closedLot.id &&
        candidate.symbol === closedLot.symbol &&
        candidate.openTradeDate > closedLot.closeTradeDate! &&
        candidate.openTradeDate <= latestAllowed
      );
    });

    if (reopened) {
      return true;
    }
  }

  return false;
}

function inferVerticalTag(a: SetupInferenceLot, b: SetupInferenceLot): SetupTag {
  if (!a.optionType || !b.optionType || a.optionType !== b.optionType) {
    return "uncategorized";
  }
  if (a.strike === null || b.strike === null || a.strike === b.strike) {
    return "uncategorized";
  }
  if (a.openSide === null || b.openSide === null || a.openSide === b.openSide) {
    return "uncategorized";
  }

  const [lowerStrikeLot, higherStrikeLot] = a.strike < b.strike ? [a, b] : [b, a];

  if (a.optionType === "CALL") {
    if (lowerStrikeLot.openSide === "BUY" && higherStrikeLot.openSide === "SELL") {
      return "bull_vertical";
    }
    if (lowerStrikeLot.openSide === "SELL" && higherStrikeLot.openSide === "BUY") {
      return "bear_vertical";
    }
    return "uncategorized";
  }

  if (lowerStrikeLot.openSide === "SELL" && higherStrikeLot.openSide === "BUY") {
    return "bull_vertical";
  }
  if (lowerStrikeLot.openSide === "BUY" && higherStrikeLot.openSide === "SELL") {
    return "bear_vertical";
  }
  return "uncategorized";
}

function inferSetupTag(lots: SetupInferenceLot[], rollWindowDays: number): SetupTag {
  const optionLots = lots.filter((lot) => lot.openAssetClass === "OPTION");
  const stockLots = lots.filter((lot) => lot.openAssetClass === "EQUITY");
  const shortCalls = optionLots.filter((lot) => lot.optionType === "CALL" && lot.openSide === "SELL");

  if (stockLots.length > 0 && shortCalls.length > 0) {
    return "covered_call";
  }

  if (stockLots.length > 0 && optionLots.length === 0) {
    return "uncategorized";
  }

  if (optionLots.length === 1 && lots.length === 1) {
    const lot = optionLots[0];
    if (lot.optionType === "CALL" && lot.openSide === "BUY") {
      return "long_call";
    }
    if (lot.optionType === "PUT" && lot.openSide === "BUY") {
      return "long_put";
    }
    if (lot.optionType === "PUT" && lot.openSide === "SELL") {
      return "cash_secured_put";
    }
    if (lot.optionType === "CALL" && lot.openSide === "SELL" && stockLots.length > 0) {
      return "covered_call";
    }
  }

  if (optionLots.length === 2 && lots.length === 2) {
    const [first, second] = optionLots;
    const sameExpiry = isSameDate(first.expirationDate, second.expirationDate);
    const sameStrike = first.strike !== null && second.strike !== null && first.strike === second.strike;
    const differentStrike = first.strike !== null && second.strike !== null && first.strike !== second.strike;
    const differentExpiry = !sameExpiry && first.expirationDate !== null && second.expirationDate !== null;

    if (sameExpiry && differentStrike) {
      return inferVerticalTag(first, second);
    }
    if (sameStrike && differentExpiry) {
      return "calendar";
    }
    if (differentStrike && differentExpiry) {
      return "diagonal";
    }
  }

  if (hasRollSignal(lots, rollWindowDays)) {
    return "roll";
  }

  return "uncategorized";
}

function createClusterMetrics(lots: SetupInferenceLot[]): Pick<InferredSetupGroup, "realizedPnl" | "winRate" | "expectancy" | "averageHoldDays"> {
  const realizedPnl = lots.reduce((sum, lot) => sum + lot.realizedPnl, 0);
  const wins = lots.filter((lot) => lot.realizedPnl > 0).length;
  const expectancy = lots.length > 0 ? realizedPnl / lots.length : 0;
  const averageHoldDays = lots.length > 0 ? lots.reduce((sum, lot) => sum + lot.holdingDays, 0) / lots.length : 0;

  return {
    realizedPnl,
    winRate: lots.length > 0 ? wins / lots.length : 0,
    expectancy,
    averageHoldDays,
  };
}

function clusterLotsByUnderlyingAndWindow(lots: SetupInferenceLot[], groupingWindowDays: number): SetupInferenceLot[][] {
  const byUnderlying = new Map<string, SetupInferenceLot[]>();

  for (const lot of lots) {
    const key = lot.underlyingSymbol;
    const entries = byUnderlying.get(key) ?? [];
    entries.push(lot);
    byUnderlying.set(key, entries);
  }

  const clusters: SetupInferenceLot[][] = [];

  for (const underlyingLots of Array.from(byUnderlying.values())) {
    const sorted = [...underlyingLots].sort((left, right) => left.openTradeDate.getTime() - right.openTradeDate.getTime());
    let currentCluster: SetupInferenceLot[] = [];
    let clusterAnchorDate: Date | null = null;

    for (const lot of sorted) {
      if (!clusterAnchorDate) {
        currentCluster = [lot];
        clusterAnchorDate = lot.openTradeDate;
        continue;
      }

      const daysFromAnchor = daysBetween(clusterAnchorDate, lot.openTradeDate);
      const rollLinkedToCluster = currentCluster.some((existingLot) => {
        if (!existingLot.closeTradeDate) {
          return false;
        }

        const rollGapDays = daysBetween(existingLot.closeTradeDate, lot.openTradeDate);
        return lot.openTradeDate > existingLot.closeTradeDate && rollGapDays <= groupingWindowDays;
      });

      if (daysFromAnchor <= groupingWindowDays || rollLinkedToCluster) {
        currentCluster.push(lot);
        continue;
      }

      clusters.push(currentCluster);
      currentCluster = [lot];
      clusterAnchorDate = lot.openTradeDate;
    }

    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }
  }

  return clusters;
}

export function inferSetupGroups(
  lots: SetupInferenceLot[],
  options?: { groupingWindowDays?: number; rollWindowDays?: number },
): SetupInferenceResult {
  const groupingWindowDays = options?.groupingWindowDays ?? 5;
  const rollWindowDays = options?.rollWindowDays ?? 5;
  const clusters = clusterLotsByUnderlyingAndWindow(lots, groupingWindowDays);

  const groups = clusters.map((cluster) => {
    const metrics = createClusterMetrics(cluster);
    const tag = inferSetupTag(cluster, rollWindowDays);

    return {
      accountId: cluster[0].accountId,
      underlyingSymbol: cluster[0].underlyingSymbol,
      tag,
      lotIds: cluster.map((lot) => lot.id),
      realizedPnl: metrics.realizedPnl,
      winRate: metrics.winRate,
      expectancy: metrics.expectancy,
      averageHoldDays: metrics.averageHoldDays,
    } satisfies InferredSetupGroup;
  });

  return {
    groups,
    uncategorizedCount: groups.filter((group) => group.tag === "uncategorized").length,
  };
}
