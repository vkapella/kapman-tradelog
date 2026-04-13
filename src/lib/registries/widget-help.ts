import type { InfoTooltipContent } from "@/components/widgets/InfoTooltip";

const WIDGET_HELP_BY_TITLE: Record<string, InfoTooltipContent> = {
  "Account Balances + NLV": {
    formula: "Cash plus broker net liquidation value for each account, compared to configured starting capital when available.",
    source: "/api/overview/summary + /api/accounts/starting-capital",
    interpretation: "Shows current account-level cash and NLV standing against the configured baseline.",
  },
  "Diagnostics Badge": {
    formula: "Aggregated parser warnings, unmatched closes, partial matches, and synthetic-expiration counts.",
    source: "/api/diagnostics",
    interpretation: "Highlights data-quality issues that can affect trust in downstream analytics.",
  },
  "Equity Curve": {
    formula: "Daily snapshot balances grouped by date, rendered as combined or per-account lines.",
    source: "/api/overview/summary",
    interpretation: "Shows how account value has evolved over time and where major inflections occurred.",
  },
  "Expectancy vs Hold": {
    formula: "Scatter plot of setup expectancy on Y, average hold days on X, with bubble size tied to realized P&L magnitude.",
    source: "/api/setups",
    interpretation: "Helps spot whether longer holds are improving or degrading expected value.",
  },
  "Holding Distribution": {
    formula: "Matched lots bucketed into 0-1d, 2-5d, 6-20d, and 21d+ holding periods.",
    source: "/api/matched-lots",
    interpretation: "Shows how quickly closed lots turn over across the selected accounts.",
  },
  "Import Health": {
    formula: "Committed, failed, parsed, and skipped row counts aggregated across imports.",
    source: "/api/overview/summary",
    interpretation: "Summarizes import pipeline quality and whether recent files introduced parser friction.",
  },
  "Monthly P&L Bars": {
    formula: "Realized P&L grouped by calendar month from matched lots.",
    source: "/api/matched-lots",
    interpretation: "Shows month-over-month consistency and where gains or losses concentrated.",
  },
  "Open Positions Summary": {
    formula: "Totals current open-position cost basis, market value, and unrealized P&L from cached marks.",
    source: "/api/positions",
    interpretation: "Shows current exposure and the mark-to-market swing on open risk.",
  },
  "Portfolio Reconciliation": {
    formula: "Starting capital, current NLV, realized P&L, unrealized P&L, cash adjustments, and unexplained delta from the latest snapshot.",
    source: "/api/positions/snapshot + /api/overview/reconciliation",
    interpretation: "Bridges broker value back to known realized and unrealized drivers.",
  },
  "Recent Executions": {
    formula: "Most recent execution records sorted by event time.",
    source: "/api/executions",
    interpretation: "Provides a quick feed of the latest trading activity in scope.",
  },
  "Setup Tag Rollup": {
    formula: "Realized P&L aggregated by setup tag or override tag.",
    source: "/api/setups",
    interpretation: "Shows which strategy buckets are driving gains and losses.",
  },
  "Symbol P&L Ranking": {
    formula: "Realized P&L grouped by symbol and ranked from strongest to weakest.",
    source: "/api/matched-lots",
    interpretation: "Surfaces concentration of profits or losses by ticker.",
  },
  "Top Setups by P&L": {
    formula: "Setup groups ranked by realized P&L.",
    source: "/api/setups",
    interpretation: "Highlights the highest-contributing setup groups in the current scope.",
  },
  "TTS Readiness": {
    formula: "Trading-frequency, holding-period, and gross-proceeds metrics used as TTS evidence signals.",
    source: "/api/tts/evidence",
    interpretation: "Summarizes court-relevant readiness indicators, not a legal determination.",
  },
  "Win / Loss / Flat": {
    formula: "Counts matched-lot outcomes by WIN, LOSS, and FLAT, with win rate excluding FLAT from the denominator.",
    source: "/api/matched-lots",
    interpretation: "Shows closed-lot outcome mix and the proportion of profitable closes.",
  },
  "Win / Loss Streak": {
    formula: "Current and longest streaks computed from ordered matched-lot outcomes.",
    source: "/api/matched-lots",
    interpretation: "Shows persistence of winning or losing runs in recent closed activity.",
  },
};

export function getWidgetHelpTextByTitle(title: string): InfoTooltipContent | null {
  return WIDGET_HELP_BY_TITLE[title] ?? null;
}
