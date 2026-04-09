import type { ComponentType } from "react";
import { AccountBalancesWidget } from "@/components/widgets/AccountBalancesWidget";
import { DiagnosticsWidget } from "@/components/widgets/DiagnosticsWidget";
import { EquityCurveWidget } from "@/components/widgets/EquityCurveWidget";
import { ExpectancyScatterWidget } from "@/components/widgets/ExpectancyScatterWidget";
import { HoldingDistributionWidget } from "@/components/widgets/HoldingDistributionWidget";
import { ImportHealthWidget } from "@/components/widgets/ImportHealthWidget";
import { MonthlyPnlWidget } from "@/components/widgets/MonthlyPnlWidget";
import { OpenPositionsSummaryWidget } from "@/components/widgets/OpenPositionsSummaryWidget";
import { RecentExecutionsWidget } from "@/components/widgets/RecentExecutionsWidget";
import { SetupTagRollupWidget } from "@/components/widgets/SetupTagRollupWidget";
import { StreakWidget } from "@/components/widgets/StreakWidget";
import { SymbolPnlWidget } from "@/components/widgets/SymbolPnlWidget";
import { TopSetupsWidget } from "@/components/widgets/TopSetupsWidget";
import { TtsReadinessWidget } from "@/components/widgets/TtsReadinessWidget";
import { WinLossFlatWidget } from "@/components/widgets/WinLossFlatWidget";

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  defaultColSpan: 1 | 2;
  component: ComponentType;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  { id: "equity-curve", name: "Equity Curve", description: "Daily balance trajectory by account.", defaultColSpan: 2, component: EquityCurveWidget },
  {
    id: "account-balances",
    name: "Account Balances + NLV",
    description: "Cash and mark-to-market net liquidation values.",
    defaultColSpan: 1,
    component: AccountBalancesWidget,
  },
  { id: "win-loss-flat", name: "Win / Loss / Flat", description: "Outcome mix and win-rate center label.", defaultColSpan: 1, component: WinLossFlatWidget },
  {
    id: "holding-dist",
    name: "Holding Distribution",
    description: "Time-in-market holding-day buckets.",
    defaultColSpan: 1,
    component: HoldingDistributionWidget,
  },
  { id: "top-setups", name: "Top Setups by P&L", description: "Highest P&L setup groups.", defaultColSpan: 1, component: TopSetupsWidget },
  { id: "symbol-pnl", name: "Symbol P&L Ranking", description: "Top winning and losing symbols.", defaultColSpan: 2, component: SymbolPnlWidget },
  { id: "monthly-pnl", name: "Monthly P&L Bars", description: "P&L trend by month.", defaultColSpan: 2, component: MonthlyPnlWidget },
  { id: "setup-tags", name: "Setup Tag Rollup", description: "Realized P&L totals by setup tag.", defaultColSpan: 1, component: SetupTagRollupWidget },
  { id: "import-health", name: "Import Health", description: "Import quality and failure/skipped checks.", defaultColSpan: 1, component: ImportHealthWidget },
  { id: "tts-scorecard", name: "TTS Readiness", description: "Evidence scorecard from trading activity.", defaultColSpan: 1, component: TtsReadinessWidget },
  { id: "diag-badge", name: "Diagnostics Badge", description: "Parser/matching quality and warnings.", defaultColSpan: 1, component: DiagnosticsWidget },
  { id: "recent-execs", name: "Recent Executions", description: "Latest execution feed from selected accounts.", defaultColSpan: 2, component: RecentExecutionsWidget },
  {
    id: "open-pos-summary",
    name: "Open Positions Summary",
    description: "Open-position totals and unrealized mark deltas.",
    defaultColSpan: 1,
    component: OpenPositionsSummaryWidget,
  },
  {
    id: "scatter",
    name: "Expectancy vs Hold",
    description: "Setup expectancy scatter against hold duration.",
    defaultColSpan: 2,
    component: ExpectancyScatterWidget,
  },
  { id: "streaks", name: "Win / Loss Streak", description: "Current and longest streak statistics.", defaultColSpan: 1, component: StreakWidget },
];

export const DEFAULT_DASHBOARD_LAYOUT = [
  "equity-curve",
  "account-balances",
  "win-loss-flat",
  "holding-dist",
  "top-setups",
  "import-health",
];
