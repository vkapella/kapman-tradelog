import { formatCurrency, formatDays, formatInteger, formatPercent, safeNumber } from "@/components/widgets/utils";
import type { KpiCardColorVariant } from "@/components/KpiCard";
import type { OverviewSummaryResponse } from "@/types/api";

export interface KpiHelpText {
  formula: string;
  source: string;
  interpretation: string;
}

export interface KpiDefinition {
  id: string;
  name: string;
  description: string;
  dataSource: string;
  helpText: KpiHelpText;
  formatValue: (summary: OverviewSummaryResponse) => string;
  getColorVariant: (summary: OverviewSummaryResponse) => KpiCardColorVariant;
}

function parseNullableMetric(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNullablePercent(value: string | null | undefined, digits = 1): string {
  const parsed = parseNullableMetric(value);
  return parsed === null ? "N/A" : formatPercent(parsed, digits);
}

function formatNullableCurrency(value: string | null | undefined): string {
  const parsed = parseNullableMetric(value);
  return parsed === null ? "N/A" : formatCurrency(parsed);
}

function formatNullableRatio(value: string | null | undefined): string {
  const parsed = parseNullableMetric(value);
  return parsed === null ? "N/A" : parsed.toFixed(2);
}

function signVariant(value: string | null | undefined): KpiCardColorVariant {
  const parsed = parseNullableMetric(value);

  if (parsed === null || parsed === 0) {
    return "neutral";
  }

  return parsed > 0 ? "pos" : "neg";
}

export const DEFAULT_KPI_LAYOUT = [
  "realized-pnl",
  "execution-count",
  "matched-lot-count",
  "setup-count",
  "avg-hold-days",
  "snapshot-count",
];

export const KPI_REGISTRY: KpiDefinition[] = [
  {
    id: "realized-pnl",
    name: "Realized P&L",
    description: "Sum of matched lot realized P&L.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Sum of realized P&L across matched lots.",
      source: "/api/overview/summary",
      interpretation: "Shows closed-trade performance. Positive values indicate realized gains.",
    },
    formatValue: (summary) => formatCurrency(safeNumber(summary.netPnl)),
    getColorVariant: (summary) => signVariant(summary.netPnl),
  },
  {
    id: "execution-count",
    name: "Execution Count",
    description: "Total T1 execution rows in scope.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Count of execution rows after account scoping.",
      source: "/api/overview/summary",
      interpretation: "Higher counts indicate more raw trading activity.",
    },
    formatValue: (summary) => formatInteger(summary.executionCount),
    getColorVariant: () => "accent",
  },
  {
    id: "matched-lot-count",
    name: "Matched Lot Count",
    description: "Total closed matched lots in scope.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Count of matched lots after FIFO matching.",
      source: "/api/overview/summary",
      interpretation: "Shows how many closed lots are available for performance analysis.",
    },
    formatValue: (summary) => formatInteger(summary.matchedLotCount),
    getColorVariant: () => "accent",
  },
  {
    id: "setup-count",
    name: "Setup Count",
    description: "Total T3 setup groups in scope.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Count of persisted setup groups for the selected scope.",
      source: "/api/overview/summary",
      interpretation: "Shows how many grouped setups exist for review and analytics.",
    },
    formatValue: (summary) => formatInteger(summary.setupCount),
    getColorVariant: () => "accent",
  },
  {
    id: "avg-hold-days",
    name: "Avg Hold Days",
    description: "Average matched lot holding period.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Average holdingDays across matched lots.",
      source: "/api/overview/summary",
      interpretation: "Lower values indicate shorter average holding periods.",
    },
    formatValue: (summary) => formatDays(safeNumber(summary.averageHoldDays), 1),
    getColorVariant: () => "accent",
  },
  {
    id: "win-rate",
    name: "Win Rate",
    description: "WIN / (WIN + LOSS) across matched lots.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "WIN count divided by WIN plus LOSS count. FLAT lots are excluded.",
      source: "/api/overview/summary",
      interpretation: "Shows the share of closed lots that finished profitably.",
    },
    formatValue: (summary) => formatNullablePercent(summary.winRate, 1),
    getColorVariant: () => "accent",
  },
  {
    id: "total-return-pct",
    name: "Total Return %",
    description: "Current NLV relative to starting capital.",
    dataSource: "/api/overview/summary + /api/accounts/starting-capital",
    helpText: {
      formula: "(Current NLV - starting capital) / starting capital * 100.",
      source: "/api/overview/summary",
      interpretation: "Shows portfolio-level performance against configured starting capital.",
    },
    formatValue: (summary) => formatNullablePercent(summary.totalReturnPct, 2),
    getColorVariant: (summary) => signVariant(summary.totalReturnPct),
  },
  {
    id: "profit-factor",
    name: "Profit Factor",
    description: "Gross wins divided by gross losses.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Gross winning lot P&L divided by absolute gross losing lot P&L.",
      source: "/api/overview/summary",
      interpretation: "Values above 1.00 indicate gains outweigh losses.",
    },
    formatValue: (summary) => formatNullableRatio(summary.profitFactor),
    getColorVariant: (summary) => {
      const value = parseNullableMetric(summary.profitFactor);
      if (value === null) {
        return "neutral";
      }
      if (value > 1) {
        return "pos";
      }
      if (value < 1) {
        return "neg";
      }
      return "neutral";
    },
  },
  {
    id: "expectancy",
    name: "Expectancy",
    description: "Average realized P&L per matched lot.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Total realized P&L divided by matched lot count.",
      source: "/api/overview/summary",
      interpretation: "Shows average realized value per closed lot.",
    },
    formatValue: (summary) => formatNullableCurrency(summary.expectancy),
    getColorVariant: (summary) => signVariant(summary.expectancy),
  },
  {
    id: "max-drawdown",
    name: "Max Drawdown",
    description: "Largest peak-to-trough decline in the snapshot series.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Largest decline from a running peak in the aggregated snapshot series.",
      source: "/api/overview/summary",
      interpretation: "Higher values indicate a deeper pullback from prior equity highs.",
    },
    formatValue: (summary) => formatNullableCurrency(summary.maxDrawdown),
    getColorVariant: (summary) => {
      const value = parseNullableMetric(summary.maxDrawdown);
      return value && value > 0 ? "neg" : "neutral";
    },
  },
  {
    id: "snapshot-count",
    name: "Snapshot Count",
    description: "Total snapshot rows available in scope.",
    dataSource: "/api/overview/summary",
    helpText: {
      formula: "Count of daily account snapshots in scope.",
      source: "/api/overview/summary",
      interpretation: "Shows the amount of historical balance data available for widgets and reconciliation.",
    },
    formatValue: (summary) => formatInteger(summary.snapshotCount),
    getColorVariant: () => "neutral",
  },
];
