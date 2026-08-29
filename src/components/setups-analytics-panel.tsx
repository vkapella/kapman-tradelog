"use client";

import Link from "next/link";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { requestCloseColumnId, toggleOpenColumnId } from "@/components/data-table/filter-panel-interaction";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { deriveDefinitions, type TableColumnConfig } from "@/components/data-table/column-config";
import { ConfigVirtualTable } from "@/components/data-table/ConfigVirtualTable";
import { detailsColumnConfig } from "@/components/data-table/details-column";
import { HiddenStateChips } from "@/components/data-table/HiddenStateChips";
import { RowDetailSheet } from "@/components/data-table/RowDetailSheet";
import { VirtualGridBody, VirtualGridHeaderRow, VirtualGridTableShell } from "@/components/data-table/VirtualGridTable";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { InfoTooltip } from "@/components/widgets/InfoTooltip";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import { formatCurrency, formatNullablePercent, safeNumber } from "@/components/widgets/utils";
import type { ApiDetailResponse, SetupDetailResponse, SetupSummaryRecord } from "@/types/api";

interface SetupDetailPayload extends ApiDetailResponse<SetupDetailResponse> {}

const SETUP_LOTS_COLUMN_TEMPLATE = "140px 80px 150px 110px 110px 190px 190px";

export function SetupsAnalyticsPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);

  const [rows, setRows] = useState<SetupSummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SetupDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const drawerLotsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedSetupId(searchParams.get("setup"));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    async function loadSetups() {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);
        const payload = await fetchAllPages<SetupSummaryRecord>("/api/setups", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Unable to load setup groups right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadSetups();
    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  useEffect(() => {
    let cancelled = false;
    async function loadSetupDetail() {
      if (!selectedSetupId) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(null);
        }
        return;
      }
      if (!cancelled) {
        setDetailLoading(true);
        setDetailError(null);
      }
      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);
        const response = await fetch(`/api/setups/${selectedSetupId}?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setDetail(null);
            setDetailError("Unable to load setup detail right now.");
          }
          return;
        }
        const payload = (await response.json()) as SetupDetailPayload;
        if (!cancelled) {
          setDetail(payload.data);
        }
      } catch {
        if (!cancelled) {
          setDetail(null);
          setDetailError("Unable to load setup detail right now.");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }
    void loadSetupDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, selectedSetupId, range.startDate, range.endDate, applyRangeToSearchParams]);

  const [detailRow, setDetailRow] = useState<SetupSummaryRecord | null>(null);
  // Tier-1 (approved §0.4 / T3), field mappings pinned: Setup = overrideTag ?? tag,
  // Symbol = underlyingSymbol, Lot Count = setupLotCount, Realized P&L = realizedPnl.
  // Lot Count is mobileOnly: it joins the phone tier without adding a desktop
  // column (desktop pixel-equivalence).
  const configs = useMemo<TableColumnConfig<SetupSummaryRecord>[]>(() => [
    {
      definition: { id: "tag", label: "Setup", filterMode: "discrete", getFilterValues: (row) => row.overrideTag ?? row.tag, sortMode: "string", getSortValue: (row) => row.overrideTag ?? row.tag },
      stickyLeft: true, width: "180px", mobileWidth: "minmax(88px, auto)",
      renderCell: (row) => <div className="px-2 py-2">{row.overrideTag ?? row.tag}</div>,
    },
    {
      definition: { id: "underlyingSymbol", label: "Underlying", filterMode: "discrete", getFilterValues: (row) => row.underlyingSymbol, sortMode: "string", getSortValue: (row) => row.underlyingSymbol },
      width: "140px", mobileWidth: "minmax(56px, auto)",
      renderCell: (row) => <div className="px-2 py-2">{row.underlyingSymbol}</div>,
    },
    {
      definition: { id: "accountId", label: "Account", filterMode: "discrete", getFilterValues: (row) => row.accountId, getFilterOptionLabel: (value) => getAccountDisplayText(value), sortMode: "string", getSortValue: (row) => getAccountDisplayText(row.accountId), panelWidthClassName: "w-80" },
      width: "160px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2"><AccountLabel accountId={row.accountId} /></div>,
    },
    {
      definition: { id: "setupLotCount", label: "Lots", align: "right", filterMode: "discrete", getFilterValues: (row) => String(row.setupLotCount ?? 0), sortMode: "number", getSortValue: (row) => row.setupLotCount ?? 0 },
      width: "56px", mobileOnly: true,
      renderCell: (row) => <div className="px-2 py-2 text-right">{row.setupLotCount ?? 0}</div>,
    },
    {
      definition: { id: "realizedPnl", label: "Realized P&L ($)", align: "right", filterMode: "discrete", getFilterValues: (row) => row.realizedPnl ?? "0", sortMode: "number", getSortValue: (row) => safeNumber(row.realizedPnl) },
      width: "150px", mobileWidth: "minmax(84px, auto)",
      renderCell: (row) => <div className={`px-2 py-2 text-right ${safeNumber(row.realizedPnl) >= 0 ? "text-pos" : "text-neg"}`}>{formatCurrency(safeNumber(row.realizedPnl))}</div>,
    },
    {
      definition: { id: "winRate", label: "Win Rate (%)", align: "right", title: "Percent of closed lots with positive outcome. Flat lots excluded.", filterMode: "discrete", getFilterValues: (row) => (row.winRate === null ? "-" : String(Math.round(safeNumber(row.winRate) * 1000) / 10)), sortMode: "number", getSortValue: (row) => (row.winRate === null ? null : safeNumber(row.winRate)) },
      width: "130px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right">{formatNullablePercent(row.winRate === null ? null : safeNumber(row.winRate) * 100, 1)}</div>,
    },
    {
      definition: { id: "expectancy", label: "Expectancy ($ / lot)", align: "right", title: "Average realized P&L per matched lot in this setup.", filterMode: "discrete", getFilterValues: (row) => row.expectancy ?? "0", sortMode: "number", getSortValue: (row) => safeNumber(row.expectancy) },
      width: "170px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right">{`${formatCurrency(safeNumber(row.expectancy))} / lot`}</div>,
    },
    {
      definition: { id: "averageHoldDays", label: "Avg Hold", align: "right", filterMode: "discrete", getFilterValues: (row) => row.averageHoldDays ?? "0", sortMode: "number", getSortValue: (row) => safeNumber(row.averageHoldDays) },
      width: "120px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2 text-right">{safeNumber(row.averageHoldDays).toFixed(2)}</div>,
    },
    {
      definition: { id: "detail", label: "Detail", filterMode: "discrete", getFilterValues: () => "View detail", sortMode: "string", getSortValue: () => "View detail" },
      width: "120px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2"><Link href={`${pathname}?setup=${row.id}#setup-detail`} className="text-accent underline">View detail</Link></div>,
    },
    {
      definition: { id: "investigate", label: "Investigate", filterMode: "discrete", getFilterValues: () => "Case file", sortMode: "string", getSortValue: () => "Case file" },
      width: "120px", tier: 2,
      renderCell: (row) => <div className="px-2 py-2"><Link href={buildDiagnosticCaseHref({ kind: "setup", setupId: row.id })} className="text-accent underline">Case file</Link></div>,
    },
    detailsColumnConfig<SetupSummaryRecord>(setDetailRow),
  ], [getAccountDisplayText, pathname]);
  const columns = useMemo(() => deriveDefinitions(configs), [configs]);

  const table = useDataTableState({ tableName: "setups", rows, columns, initialSort: { columnId: "realizedPnl", direction: "desc" } });

  useEffect(() => {
    if (!table.isHydrated) {
      return;
    }
    const accountParam = searchParams.get("account");
    const tagParam = searchParams.get("tag");
    if (accountParam) {
      table.setColumnFilter("accountId", [accountParam]);
    }
    if (tagParam) {
      table.setColumnFilter("tag", [tagParam]);
    }
  }, [searchParams, table]);

  const summary = useMemo(() => {
    if (table.sortedRows.length === 0) {
      return { totalPnl: 0, averageWinRate: null as number | null, averageExpectancy: 0, averageHoldDays: 0 };
    }
    const totalPnl = table.sortedRows.reduce((sum, row) => sum + safeNumber(row.realizedPnl), 0);
    const winRates = table.sortedRows.map((row) => (row.winRate === null ? null : safeNumber(row.winRate))).filter((value): value is number => value !== null);
    const averageWinRateRatio = winRates.length > 0 ? winRates.reduce((sum, value) => sum + value, 0) / winRates.length : null;
    const expectancies = table.sortedRows.map((row) => safeNumber(row.expectancy));
    const averageExpectancy = expectancies.length > 0 ? expectancies.reduce((sum, value) => sum + value, 0) / expectancies.length : 0;
    const holdDays = table.sortedRows.map((row) => safeNumber(row.averageHoldDays));
    const averageHoldDays = holdDays.length > 0 ? holdDays.reduce((sum, value) => sum + value, 0) / holdDays.length : 0;
    return { totalPnl, averageWinRate: averageWinRateRatio === null ? null : averageWinRateRatio * 100, averageExpectancy, averageHoldDays };
  }, [table.sortedRows]);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6 max-md:p-2">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-text">Setup Analytics (T3)</h2>
          <InfoTooltip
            label="Setup Analytics"
            content={{
              formula: "Selected date ranges include setups only when linked lots opened inside the range.",
              source: "/api/setups and /api/matched-lots",
              interpretation:
                "Portfolio return measures NLV change over the selected date range after external capital flows. Strategy analytics include only trades opened within the selected range, so the two views may not reconcile exactly.",
            }}
          />
        </div>
        <p className="text-sm text-text-2">Grouped setup performance summary with drill-through to matched lots and source executions.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-text-3">Performance Summary ($)</p><p className={`text-lg font-semibold ${summary.totalPnl >= 0 ? "text-pos" : "text-neg"}`}>{formatCurrency(summary.totalPnl)}</p></div>
        <div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-text-3" title="Percent of closed lots with positive outcome. Flat lots excluded.">Win Rate (%)</p><p className="text-lg font-semibold text-text">{formatNullablePercent(summary.averageWinRate, 1)}</p></div>
        <div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-text-3" title="Average realized P&L per matched lot in this setup.">Expectancy ($ / lot)</p><p className="text-lg font-semibold text-text">{formatCurrency(summary.averageExpectancy)} / lot</p></div>
        <div className="rounded-lg border border-border bg-bg p-3"><p className="text-xs text-text-3">Average Hold (Days)</p><p className="text-lg font-semibold text-text">{summary.averageHoldDays.toFixed(2)}</p></div>
      </div>

      <DataTableToolbar activeFilterCount={table.activeFilterCount} onClearAllFilters={() => table.clearAllFilters()} totalRows={table.sortedRows.length} />

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-neg">{error}</p> : null}

      {!loading && !error && table.sortedRows.length > 0 ? (
        <>
          <HiddenStateChips configs={configs} visibleColumns={table.visibleColumns} sort={table.sort} filters={table.filters} setSort={table.setSort} setColumnFilter={table.setColumnFilter} />
          <ConfigVirtualTable
            configs={configs}
            table={table}
            openColumnId={openColumnId}
            setOpenColumnId={setOpenColumnId}
            scrollContainerRef={scrollContainerRef}
            getRowKey={(row) => row.id}
            onRowClick={setDetailRow}
          />
          <RowDetailSheet configs={configs} row={detailRow} title="Setup details" onClose={() => setDetailRow(null)} />
        </>
      ) : null}

      {selectedSetupId ? (
        <section id="setup-detail" className="space-y-3 rounded-xl border border-border bg-bg p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text">Setup Detail Drill-through</h3>
            <button type="button" onClick={() => router.push(pathname, { scroll: false })} className="text-xs text-text-2 underline">Close</button>
          </div>
          {detailLoading ? <LoadingSkeleton lines={4} /> : null}
          {!detailLoading && detailError ? <p className="text-xs text-neg">{detailError}</p> : null}
          {!detailLoading && detail ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-text-2">
                <p>{detail.setup.overrideTag ?? detail.setup.tag} · {detail.setup.underlyingSymbol} · setup id {detail.setup.id}</p>
                <Link href={buildDiagnosticCaseHref({ kind: "setup", setupId: detail.setup.id })} className="text-accent underline">Open diagnostics case file</Link>
              </div>
              <div className="rounded border border-border bg-bg p-3">
                <h4 className="text-xs font-semibold text-text">Inference Notes</h4>
                {detail.inference.reasons.length === 0 ? <p className="mt-2 text-xs text-text-3">No inference notes available.</p> : (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-text-2">{detail.inference.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>
                )}
              </div>
              <VirtualGridTableShell height={320} scrollContainerRef={drawerLotsScrollRef}>
                <VirtualGridHeaderRow columnTemplate={SETUP_LOTS_COLUMN_TEMPLATE}>
                  <div className="px-2 py-2 text-left">Symbol</div>
                  <div className="px-2 py-2 text-right">Qty</div>
                  <div className="px-2 py-2 text-right">Realized P&amp;L ($)</div>
                  <div className="px-2 py-2 text-right">Hold Days</div>
                  <div className="px-2 py-2 text-left">Outcome</div>
                  <div className="px-2 py-2 text-left">Open Execution</div>
                  <div className="px-2 py-2 text-left">Close Execution</div>
                </VirtualGridHeaderRow>
                <VirtualGridBody
                  columnTemplate={SETUP_LOTS_COLUMN_TEMPLATE}
                  rows={detail.lots}
                  scrollContainerRef={drawerLotsScrollRef}
                  getRowKey={(lot) => lot.id}
                  renderRow={(lot) => (
                    <>
                      <div className="px-2 py-2">{lot.symbol}</div>
                      <div className="px-2 py-2 text-right">{lot.quantity}</div>
                      <div className={`px-2 py-2 text-right ${safeNumber(lot.realizedPnl) >= 0 ? "text-pos" : "text-neg"}`}>{formatCurrency(safeNumber(lot.realizedPnl))}</div>
                      <div className="px-2 py-2 text-right">{lot.holdingDays}</div>
                      <div className="px-2 py-2">{lot.outcome}</div>
                      <div className="px-2 py-2"><Link href={`/trade-records?tab=executions&execution=${lot.openExecutionId}&account=${lot.accountId}`} className="text-accent underline">{lot.openExecutionId.slice(0, 8)}...</Link></div>
                      <div className="px-2 py-2">{lot.closeExecutionId ? <Link href={`/trade-records?tab=executions&execution=${lot.closeExecutionId}&account=${lot.accountId}`} className="text-accent underline">{lot.closeExecutionId.slice(0, 8)}...</Link> : "-"}</div>
                    </>
                  )}
                />
              </VirtualGridTableShell>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
