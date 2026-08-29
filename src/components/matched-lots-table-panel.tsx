"use client";

import Link from "next/link";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import { deriveDefinitions, type TableColumnConfig } from "@/components/data-table/column-config";
import { ConfigVirtualTable } from "@/components/data-table/ConfigVirtualTable";
import { detailsColumnConfig } from "@/components/data-table/details-column";
import { HiddenStateChips } from "@/components/data-table/HiddenStateChips";
import { RowDetailSheet } from "@/components/data-table/RowDetailSheet";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { formatCurrency, formatNullablePercent, safeNumber } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import type { ImportRecord, MatchedLotRecord } from "@/types/api";


function displayMatchedLotSymbol(row: Pick<MatchedLotRecord, "symbol" | "underlyingSymbol">): string {
  return row.underlyingSymbol ?? row.symbol;
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...`;
}

function formatFractionPercent(value: string | null | undefined): string {
  return value === null || value === undefined ? "N/A" : formatNullablePercent(safeNumber(value) * 100, 1);
}

export function MatchedLotsTablePanel() {
  const searchParams = useSearchParams();
  const dateFromParam = searchParams.get("date_from");
  const dateToParam = searchParams.get("date_to");
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);

  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<MatchedLotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadImports() {
      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        const payload = await fetchAllPages<ImportRecord>("/api/imports", query);
        if (!cancelled) {
          setImports(payload.data);
        }
      } catch {
        if (!cancelled) {
          setImports([]);
        }
      }
    }

    void loadImports();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts]);

  useEffect(() => {
    let cancelled = false;

    async function loadMatchedLots() {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);
        if (dateFromParam) {
          query.set("date_from", dateFromParam);
        }
        if (dateToParam) {
          query.set("date_to", dateToParam);
        }
        const payload = await fetchAllPages<MatchedLotRecord>("/api/matched-lots", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Unable to load matched lots right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMatchedLots();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams, dateFromParam, dateToParam]);

  const importLabelById = useMemo(() => {
    return new Map(imports.map((entry) => [entry.id, `${entry.filename} (${getAccountDisplayText(entry.accountId)})`]));
  }, [getAccountDisplayText, imports]);

  const [detailRow, setDetailRow] = useState<MatchedLotRecord | null>(null);
  // Tier-1 (approved §0.4 / T2): Close Date, Symbol, Qty, Realized P&L, Outcome.
  const configs = useMemo<TableColumnConfig<MatchedLotRecord>[]>(() => [
    {
      definition: { id: "closeTradeDate", label: "Close Date", filterMode: "discrete", getFilterValues: (row) => row.closeTradeDate ?? row.openTradeDate, getFilterOptionLabel: (value) => value.slice(0, 10), sortMode: "date", getSortValue: (row) => row.closeTradeDate ?? row.openTradeDate, defaultSortDirection: "desc" },
      stickyLeft: true, width: "120px", mobileWidth: "minmax(76px, auto)",
      renderCell: (row) => <div className="px-2 py-2">{(row.closeTradeDate ?? row.openTradeDate).slice(0, 10)}</div>,
    },
    {
      definition: { id: "symbol", label: "Symbol", filterMode: "discrete", getFilterValues: (row) => displayMatchedLotSymbol(row), sortMode: "string", getSortValue: (row) => displayMatchedLotSymbol(row) },
      width: "110px", mobileWidth: "minmax(56px, auto)",
      renderCell: (row) => <div className="px-2 py-2">{displayMatchedLotSymbol(row)}</div>,
    },
    {
      definition: { id: "accountId", label: "Account", filterMode: "discrete", getFilterValues: (row) => row.accountId, getFilterOptionLabel: (value) => getAccountDisplayText(value), sortMode: "string", getSortValue: (row) => getAccountDisplayText(row.accountId), panelWidthClassName: "w-80" },
      width: "150px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2"><AccountLabel accountId={row.accountId} /></div>,
    },
    {
      definition: { id: "importIds", label: "Import", filterMode: "discrete", getFilterValues: (row) => [row.openImportId, row.closeImportId].filter((value): value is string => Boolean(value)), getFilterOptionLabel: (value) => importLabelById.get(value) ?? value, sortMode: "string", getSortValue: (row) => importLabelById.get(row.closeImportId ?? row.openImportId) ?? row.closeImportId ?? row.openImportId, panelWidthClassName: "w-80" },
      width: "340px", tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2">
          {[row.openImportId, row.closeImportId]
            .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
            .map((value) => importLabelById.get(value) ?? shortId(value))
            .join(" / ")}
        </div>
      ),
    },
    {
      definition: { id: "quantity", label: "Qty", align: "right", filterMode: "discrete", getFilterValues: (row) => row.quantity, sortMode: "number", getSortValue: (row) => Number(row.quantity) },
      width: "80px", mobileWidth: "minmax(40px, auto)",
      renderCell: (row) => <div className="px-2 py-2 text-right">{row.quantity}</div>,
    },
    {
      definition: { id: "realizedPnl", label: "Realized P&L ($)", align: "right", filterMode: "discrete", getFilterValues: (row) => row.realizedPnl, sortMode: "number", getSortValue: (row) => Number(row.realizedPnl) },
      width: "130px", mobileWidth: "minmax(80px, auto)",
      renderCell: (row) => (
        <div className={`px-2 py-2 text-right ${Number(row.realizedPnl) >= 0 ? "text-pos" : "text-neg"}`}>{formatCurrency(safeNumber(row.realizedPnl))}</div>
      ),
    },
    {
      definition: { id: "holdingDays", label: "Hold Days", align: "right", filterMode: "discrete", getFilterValues: (row) => String(row.holdingDays), sortMode: "number", getSortValue: (row) => row.holdingDays },
      width: "110px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right">{row.holdingDays}</div>,
    },
    {
      definition: { id: "outcome", label: "Outcome", filterMode: "discrete", getFilterValues: (row) => row.outcome, sortMode: "string", getSortValue: (row) => row.outcome },
      width: "110px", mobileWidth: "minmax(52px, auto)",
      renderCell: (row) => (
        <div className="px-2 py-2">{row.outcome === "WIN" ? <Badge variant="win">WIN</Badge> : row.outcome === "LOSS" ? <Badge variant="loss">LOSS</Badge> : <Badge variant="flat">FLAT</Badge>}</div>
      ),
    },
    {
      definition: { id: "mfe", label: "MFE ($)", align: "right", filterMode: "discrete", getFilterValues: (row) => row.excursion?.mfe ?? "N/A", sortMode: "number", getSortValue: (row) => safeNumber(row.excursion?.mfe) },
      width: "110px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right text-pos">{row.excursion ? formatCurrency(safeNumber(row.excursion.mfe)) : "N/A"}</div>,
    },
    {
      definition: { id: "mae", label: "MAE ($)", align: "right", filterMode: "discrete", getFilterValues: (row) => row.excursion?.mae ?? "N/A", sortMode: "number", getSortValue: (row) => safeNumber(row.excursion?.mae) },
      width: "110px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right text-neg">{row.excursion ? formatCurrency(safeNumber(row.excursion.mae)) : "N/A"}</div>,
    },
    {
      definition: { id: "mfePct", label: "MFE (%)", align: "right", filterMode: "discrete", getFilterValues: (row) => row.excursion?.mfePct ?? "N/A", sortMode: "number", getSortValue: (row) => safeNumber(row.excursion?.mfePct) },
      width: "100px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right">{formatFractionPercent(row.excursion?.mfePct)}</div>,
    },
    {
      definition: { id: "maePct", label: "MAE (%)", align: "right", filterMode: "discrete", getFilterValues: (row) => row.excursion?.maePct ?? "N/A", sortMode: "number", getSortValue: (row) => safeNumber(row.excursion?.maePct) },
      width: "100px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right">{formatFractionPercent(row.excursion?.maePct)}</div>,
    },
    {
      definition: { id: "unpricedDays", label: "Unpriced", align: "right", filterMode: "discrete", getFilterValues: (row) => String(row.excursion?.unpricedDays ?? "N/A"), sortMode: "number", getSortValue: (row) => row.excursion?.unpricedDays ?? 0 },
      width: "90px", tier: 2,
      renderCell: (row) => <div className={`px-2 py-2 text-right ${row.excursion && row.excursion.unpricedDays > 0 ? "text-warn" : ""}`}>{row.excursion?.unpricedDays ?? "N/A"}</div>,
    },
    {
      definition: { id: "openExecutionId", label: "Open Execution", filterMode: "discrete", getFilterValues: (row) => row.openExecutionId, getFilterOptionLabel: (value) => shortId(value), sortMode: "string", getSortValue: (row) => row.openExecutionId, panelWidthClassName: "w-80" },
      width: "150px", tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2 font-mono">
          <Link href={`/trade-records?tab=executions&execution=${row.openExecutionId}&account=${row.accountId}`} className="text-accent underline">
            {shortId(row.openExecutionId)}
          </Link>
        </div>
      ),
    },
    {
      definition: { id: "closeExecutionId", label: "Close Execution", filterMode: "discrete", getFilterValues: (row) => row.closeExecutionId ?? "-", getFilterOptionLabel: (value) => (value === "-" ? value : shortId(value)), sortMode: "string", getSortValue: (row) => row.closeExecutionId ?? "-", panelWidthClassName: "w-80" },
      width: "150px", tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2 font-mono">
          {row.closeExecutionId ? (
            <Link href={`/trade-records?tab=executions&execution=${row.closeExecutionId}&account=${row.accountId}`} className="text-accent underline">
              {shortId(row.closeExecutionId)}
            </Link>
          ) : (
            "-"
          )}
        </div>
      ),
    },
    {
      definition: { id: "investigate", label: "Investigate", filterMode: "discrete", getFilterValues: () => "Case file", sortMode: "string", getSortValue: () => "Case file" },
      width: "120px", tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2">
          <Link href={buildDiagnosticCaseHref({ kind: "matched_lot", matchedLotId: row.id })} className="text-accent underline">
            Case file
          </Link>
        </div>
      ),
    },
    detailsColumnConfig<MatchedLotRecord>(setDetailRow),
  ], [getAccountDisplayText, importLabelById]);
  const columns = useMemo(() => deriveDefinitions(configs), [configs]);

  const table = useDataTableState({ tableName: "matched-lots", rows, columns, initialSort: { columnId: "closeTradeDate", direction: "desc" } });

  useEffect(() => {
    if (!table.isHydrated) {
      return;
    }
    const symbolParam = searchParams.get("symbol");
    const importParam = searchParams.get("import");
    const outcomeParam = searchParams.get("outcome");

    if (symbolParam) {
      table.setColumnFilter("symbol", [symbolParam]);
    }
    if (importParam) {
      table.setColumnFilter("importIds", [importParam]);
    }
    if (outcomeParam) {
      table.setColumnFilter("outcome", [outcomeParam]);
    }
  }, [searchParams, table]);

  const totalRows = table.sortedRows.length;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6 max-md:p-2">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text">Matched Lots Table (T2)</h2>
        <p className="text-sm text-text-2">Review FIFO close-to-open linkage, realized P&amp;L, and holding period by lot.</p>
      </header>

      <DataTableToolbar activeFilterCount={table.activeFilterCount} onClearAllFilters={() => table.clearAllFilters()} totalRows={totalRows} />
      <HiddenStateChips configs={configs} visibleColumns={table.visibleColumns} sort={table.sort} filters={table.filters} setSort={table.setSort} setColumnFilter={table.setColumnFilter} />

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-neg">{error}</p> : null}

      {!loading && !error && totalRows === 0 ? (
        <div className="rounded-xl border border-border bg-bg p-6">
          <h3 className="text-lg font-medium text-text">No matched lots found</h3>
          <p className="mt-2 text-sm text-text-2">Commit an import and run matching to populate FIFO lot records.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-accent underline">Go to Imports &amp; Connections</Link>
        </div>
      ) : null}

      {!loading && !error && totalRows > 0 ? (
        <>
          <ConfigVirtualTable
            configs={configs}
            table={table}
            openColumnId={openColumnId}
            setOpenColumnId={setOpenColumnId}
            scrollContainerRef={scrollContainerRef}
            getRowKey={(row) => row.id}
            onRowClick={setDetailRow}
          />
          <RowDetailSheet configs={configs} row={detailRow} title="Matched lot details" onClose={() => setDetailRow(null)} />
        </>
      ) : null}
    </section>
  );
}
