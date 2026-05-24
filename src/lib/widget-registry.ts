import type { ComponentType } from "react";
import { AccountBalancesWidget } from "@/components/widgets/AccountBalancesWidget";
import { DiagnosticsWidget } from "@/components/widgets/DiagnosticsWidget";
import { DailyPnlCalendarWidget } from "@/components/widgets/DailyPnlCalendarWidget";
import { EquityCurveWidget } from "@/components/widgets/EquityCurveWidget";
import { ExpectancyScatterWidget } from "@/components/widgets/ExpectancyScatterWidget";
import { HoldingDistributionWidget } from "@/components/widgets/HoldingDistributionWidget";
import { ImportHealthWidget } from "@/components/widgets/ImportHealthWidget";
import { MonthlyPnlWidget } from "@/components/widgets/MonthlyPnlWidget";
import { OpenPositionsSummaryWidget } from "@/components/widgets/OpenPositionsSummaryWidget";
import { RecentMatchedLotsWidget } from "@/components/widgets/RecentMatchedLotsWidget";
import { ReconciliationWidget } from "@/components/widgets/ReconciliationWidget";
import { RecentExecutionsWidget } from "@/components/widgets/RecentExecutionsWidget";
import { SetupExpectancyWidget } from "@/components/widgets/SetupExpectancyWidget";
import { SetupTagRollupWidget } from "@/components/widgets/SetupTagRollupWidget";
import { PeriodReturnWidget } from "@/components/widgets/PeriodReturnWidget";
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
  { id: "equity-curve", name: "Cash Balance Curve", description: "Daily cash-balance trajectory by account.", defaultColSpan: 2, component: EquityCurveWidget },
  { id: "daily-pnl-calendar", name: "Daily P&L Calendar", description: "Realized P&L heatmap by matched-lot close date.", defaultColSpan: 2, component: DailyPnlCalendarWidget },
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
  { id: "recent-matched-lots", name: "Recent Matched Lots", description: "Latest closed matched lots in scope.", defaultColSpan: 1, component: RecentMatchedLotsWidget },
  { id: "recent-execs", name: "Recent Executions", description: "Latest execution feed from selected accounts.", defaultColSpan: 2, component: RecentExecutionsWidget },
  {
    id: "open-pos-summary",
    name: "Open Positions Summary",
    description: "Open-position totals and unrealized mark deltas.",
    defaultColSpan: 1,
    component: OpenPositionsSummaryWidget,
  },
  {
    id: "portfolio-reconciliation",
    name: "Portfolio Reconciliation",
    description: "Bridge realized, unrealized, cash adjustments, and broker NLV.",
    defaultColSpan: 1,
    component: ReconciliationWidget,
  },
  {
    id: "scatter",
    name: "Expectancy vs Hold",
    description: "Setup expectancy scatter against hold duration.",
    defaultColSpan: 2,
    component: ExpectancyScatterWidget,
  },
  { id: "setup-expectancy", name: "Setup Expectancy", description: "Expectancy rollup by setup tag.", defaultColSpan: 1, component: SetupExpectancyWidget },
  { id: "streaks", name: "Win / Loss Streak", description: "Current and longest streak statistics.", defaultColSpan: 1, component: StreakWidget },
  {
    id: "period-return",
    name: "Period Return",
    description: "Net-contribution-adjusted return for the selected date range.",
    defaultColSpan: 1,
    component: PeriodReturnWidget,
  },
];

export const DEFAULT_DASHBOARD_LAYOUT = [
  "equity-curve",
  "daily-pnl-calendar",
  "account-balances",
  "recent-matched-lots",
  "win-loss-flat",
  "holding-dist",
  "setup-expectancy",
];
