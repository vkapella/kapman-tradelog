export interface DrawdownSnapshotPoint {
  accountId: string;
  snapshotDate: Date;
  balance: number;
  totalCash: number | null;
  brokerNetLiquidationValue: number | null;
}

type SnapshotSourceRank = 1 | 2 | 3;

interface SeriesPoint {
  snapshotDate: string;
  value: number;
}

function getSnapshotSourceRank(point: DrawdownSnapshotPoint): SnapshotSourceRank {
  if (point.brokerNetLiquidationValue !== null) {
    return 3;
  }

  if (point.totalCash !== null) {
    return 2;
  }

  return 1;
}

function getPreferredSourceRank(points: DrawdownSnapshotPoint[]): SnapshotSourceRank {
  return points.reduce<SnapshotSourceRank>((current, point) => {
    const next = getSnapshotSourceRank(point);
    return next > current ? next : current;
  }, 1);
}

function getValueForRank(point: DrawdownSnapshotPoint, rank: SnapshotSourceRank): number | null {
  if (rank === 3) {
    return point.brokerNetLiquidationValue;
  }

  if (rank === 2) {
    return point.totalCash;
  }

  return point.balance;
}

function getBestAvailableValue(point: DrawdownSnapshotPoint): number {
  return point.brokerNetLiquidationValue ?? point.totalCash ?? point.balance;
}

function buildAccountSeries(points: DrawdownSnapshotPoint[]): SeriesPoint[] {
  const orderedPoints = [...points].sort((left, right) => left.snapshotDate.getTime() - right.snapshotDate.getTime());
  const preferredSourceRank = getPreferredSourceRank(orderedPoints);
  const series: SeriesPoint[] = [];
  let currentValue: number | null = null;
  let hasPreferredSource = false;

  for (const point of orderedPoints) {
    const preferredValue = getValueForRank(point, preferredSourceRank);

    if (preferredValue !== null) {
      currentValue = preferredValue;
      hasPreferredSource = true;
    } else if (!hasPreferredSource) {
      currentValue = getBestAvailableValue(point);
    }

    if (currentValue !== null) {
      series.push({
        snapshotDate: point.snapshotDate.toISOString().slice(0, 10),
        value: currentValue,
      });
    }
  }

  return series;
}

export function computeMaxDrawdown(points: DrawdownSnapshotPoint[]): number | null {
  if (points.length === 0) {
    return null;
  }

  const seriesByAccount = new Map<string, SeriesPoint[]>();

  for (const point of points) {
    if (!seriesByAccount.has(point.accountId)) {
      seriesByAccount.set(point.accountId, []);
    }
  }

  for (const accountId of Array.from(seriesByAccount.keys())) {
    seriesByAccount.set(accountId, buildAccountSeries(points.filter((point) => point.accountId === accountId)));
  }

  const orderedDates = Array.from(
    new Set(
      Array.from(seriesByAccount.values()).flatMap((series) => series.map((point) => point.snapshotDate)),
    ),
  ).sort();

  const nextIndexByAccount = new Map(Array.from(seriesByAccount.keys()).map((accountId) => [accountId, 0]));
  const currentValueByAccount = new Map<string, number | null>();
  const combinedSeries: number[] = [];

  for (const snapshotDate of orderedDates) {
    let combinedValue = 0;
    let hasValue = false;

    for (const [accountId, series] of Array.from(seriesByAccount.entries())) {
      let nextIndex = nextIndexByAccount.get(accountId) ?? 0;

      while (nextIndex < series.length && series[nextIndex]!.snapshotDate <= snapshotDate) {
        currentValueByAccount.set(accountId, series[nextIndex]!.value);
        nextIndex += 1;
      }

      nextIndexByAccount.set(accountId, nextIndex);

      const currentValue = currentValueByAccount.get(accountId);
      if (currentValue === undefined || currentValue === null) {
        continue;
      }

      combinedValue += currentValue;
      hasValue = true;
    }

    if (hasValue) {
      combinedSeries.push(combinedValue);
    }
  }

  if (combinedSeries.length === 0) {
    return null;
  }

  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;

  for (const value of combinedSeries) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, peak - value);
  }

  return maxDrawdown;
}
