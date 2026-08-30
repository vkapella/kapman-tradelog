import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import type { TableColumnConfig } from "@/components/data-table/column-config";
import type { OpenPosition } from "@/types/api";

export type PositionsRow = OpenPosition & {
  key: string;
  dte: number | null;
  mark: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  pnlPct: number | null;
  maePct: number | null;
  mfePct: number | null;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
function formatPercent(value: number): string {
  return value.toFixed(2) + "%";
}
function formatExcursionPct(value: number | null): string {
  if (value === null) return "—";
  const pct = value * 100;
  return (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
}
// expirationDate is a UTC-midnight date-only value; format in UTC so it doesn't shift a day back in local time.
function formatExpiry(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });
}

/**
 * Positions column configs (#340). Tier-1 (approved §0.4): Symbol, Qty, Mark,
 * Unrealized P&L, P&L%. Everything renders from this one array — definitions,
 * templates, headers, cells, and detail-sheet fields.
 */
export function buildPositionsColumnConfigs(
  getAccountDisplayText: (accountId: string) => string,
  isMarkLoading: () => boolean,
): TableColumnConfig<PositionsRow>[] {
  return [
    {
      definition: { id: "symbol", label: "Symbol", filterMode: "discrete", getFilterValues: (row) => row.underlyingSymbol, sortMode: "string", getSortValue: (row) => row.underlyingSymbol },
      stickyLeft: true,
      // UI-2: the pinned ticker holds the reference 76px at every width
      // (dropping it on phones was the v1 mocks' central defect).
      width: "76px",
      mobileWidth: "76px",
      renderCell: (row) => <div className="px-2 py-2 font-mono font-semibold">{row.underlyingSymbol}</div>,
    },
    {
      definition: { id: "assetClass", label: "Type", filterMode: "discrete", getFilterValues: (row) => (row.assetClass === "OPTION" ? row.optionType ?? "OPTION" : "EQUITY"), sortMode: "string", getSortValue: (row) => (row.assetClass === "OPTION" ? row.optionType ?? "OPTION" : "EQUITY") },
      width: "100px",
      tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2">{row.assetClass === "OPTION" ? <Badge size={2} variant={row.optionType === "PUT" ? "put" : "call"}>{row.optionType ?? "OPTION"}</Badge> : <Badge size={2} variant="stub">EQUITY</Badge>}</div>
      ),
    },
    {
      definition: { id: "strike", label: "Strike", align: "right", filterMode: "discrete", getFilterValues: (row) => row.strike ?? "—", sortMode: "number", getSortValue: (row) => (row.strike === null ? null : Number(row.strike)) },
      width: "100px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right font-mono">{row.strike ?? "—"}</div>,
    },
    {
      definition: { id: "expirationDate", label: "Expiry", filterMode: "discrete", getFilterValues: (row) => row.expirationDate ?? "—", getFilterOptionLabel: (value) => (value === "—" ? value : formatExpiry(value)), sortMode: "date", getSortValue: (row) => row.expirationDate, defaultSortDirection: "asc" },
      width: "130px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2">{row.expirationDate ? formatExpiry(row.expirationDate) : "—"}</div>,
    },
    {
      definition: { id: "dte", label: "DTE", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.dte === null ? "—" : String(row.dte)), sortMode: "number", getSortValue: (row) => row.dte },
      width: "80px",
      tier: 2,
      renderCell: (row) => (
        <div className={["px-2 py-2 text-right", row.dte === null ? "text-text-2" : row.dte < 7 ? "text-red-300" : row.dte < 30 ? "text-amber-300" : "text-text"].join(" ")}>{row.dte ?? "—"}</div>
      ),
    },
    {
      definition: { id: "netQty", label: "Qty", align: "right", filterMode: "discrete", getFilterValues: (row) => String(row.netQty), sortMode: "number", getSortValue: (row) => row.netQty },
      width: "90px",
      mobileWidth: "minmax(44px, auto)",
      renderCell: (row) => <div className={row.netQty >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>{row.netQty}</div>,
    },
    {
      definition: { id: "costBasis", label: "Cost Basis", align: "right", filterMode: "discrete", getFilterValues: (row) => String(row.costBasis), sortMode: "number", getSortValue: (row) => row.costBasis },
      width: "140px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right font-mono">{formatCurrency(row.costBasis)}</div>,
    },
    {
      definition: { id: "mark", label: "Mark", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.mark === null ? "—" : String(row.mark)), sortMode: "number", getSortValue: (row) => row.mark },
      width: "110px",
      mobileWidth: "minmax(60px, auto)",
      renderCell: (row) => (
        <div className="px-2 py-2 text-right font-mono">{isMarkLoading() ? <span className="text-text-2">...</span> : row.mark === null ? "—" : formatCurrency(row.mark)}</div>
      ),
    },
    {
      definition: { id: "marketValue", label: "Mkt Value", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.marketValue === null ? "—" : String(row.marketValue)), sortMode: "number", getSortValue: (row) => row.marketValue },
      width: "140px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right font-mono">{row.marketValue === null ? "—" : formatCurrency(row.marketValue)}</div>,
    },
    {
      definition: { id: "unrealizedPnl", label: "Unrealized P&L", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.unrealizedPnl === null ? "—" : String(row.unrealizedPnl)), sortMode: "number", getSortValue: (row) => row.unrealizedPnl },
      width: "150px",
      mobileWidth: "minmax(80px, auto)",
      renderCell: (row) => (
        <div className={row.unrealizedPnl !== null && row.unrealizedPnl >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>{row.unrealizedPnl === null ? "—" : formatCurrency(row.unrealizedPnl)}</div>
      ),
    },
    {
      definition: { id: "pnlPct", label: "P&L %", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.pnlPct === null ? "—" : String(row.pnlPct)), sortMode: "number", getSortValue: (row) => row.pnlPct },
      width: "110px",
      mobileWidth: "minmax(52px, auto)",
      renderCell: (row) => (
        <div className={row.pnlPct !== null && row.pnlPct >= 0 ? "px-2 py-2 text-right text-green-300" : "px-2 py-2 text-right text-red-300"}>{row.pnlPct === null ? "—" : formatPercent(row.pnlPct)}</div>
      ),
    },
    {
      definition: { id: "maePct", label: "MAE %", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.maePct === null ? "—" : String(row.maePct)), sortMode: "number", getSortValue: (row) => row.maePct },
      width: "90px",
      tier: 2,
      renderCell: (row) => <div className={row.maePct === null ? "px-2 py-2 text-right text-text-2" : "px-2 py-2 text-right text-red-300"}>{formatExcursionPct(row.maePct)}</div>,
    },
    {
      definition: { id: "mfePct", label: "MFE %", align: "right", filterMode: "discrete", getFilterValues: (row) => (row.mfePct === null ? "—" : String(row.mfePct)), sortMode: "number", getSortValue: (row) => row.mfePct },
      width: "90px",
      tier: 2,
      renderCell: (row) => <div className={row.mfePct === null ? "px-2 py-2 text-right text-text-2" : "px-2 py-2 text-right text-green-300"}>{formatExcursionPct(row.mfePct)}</div>,
    },
    {
      definition: { id: "accountId", label: "Account", filterMode: "discrete", getFilterValues: (row) => row.accountId, getFilterOptionLabel: (value) => getAccountDisplayText(value), sortMode: "string", getSortValue: (row) => getAccountDisplayText(row.accountId), panelWidthClassName: "w-80" },
      width: "160px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-text-2"><AccountLabel accountId={row.accountId} /></div>,
    },
  ];
}
