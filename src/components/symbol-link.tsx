// Every ticker or underlying is a link to the family chart destination
// (decisions 64–66, Amendment 04 §2; kapman-design 239072b).
//
// Decision 64 — the theme's .km-sym-link: inherits the cell's colour and
// weight, hairline underline at rest, accent on hover, inset focus ring,
// stretches to its cell so the hit area is the row (the cell must be a flex
// container for that); opens in a new tab and stops propagation so the row's
// own action — selection, the detail sheet — never fires; the accessible name
// carries the destination.
// Decision 65 — every symbol links by default. Suppression, if ever wanted for
// cash-like instruments, is an explicit isChartable predicate added here,
// never a symbol list. Options rows link the UNDERLYING: pass the displayed
// text as `symbol` and the underlying as `chartSymbol` when they differ.
// Decision 66 — Barchart is the family destination; one URL builder; the
// symbol is URL-encoded (BRK.B, symbols with slashes). Changing the provider
// is a decision-log entry, not a local edit.

export function chartUrl(symbol: string): string {
  return `https://www.barchart.com/stocks/quotes/${encodeURIComponent(symbol)}/interactive-chart`;
}

interface SymbolLinkProps {
  /** The text rendered — the ticker or the display symbol. */
  symbol: string | null | undefined;
  /** The symbol the chart opens for, when it differs from the text (options rows link the underlying). */
  chartSymbol?: string | null;
  className?: string;
}

export function SymbolLink({ symbol, chartSymbol, className }: SymbolLinkProps) {
  if (!symbol) return null;
  const target = chartSymbol || symbol;
  return (
    <a
      href={chartUrl(target)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      aria-label={`Open ${target} chart on Barchart`}
      className={["km-sym-link", className].filter(Boolean).join(" ")}
    >
      {symbol}
    </a>
  );
}
