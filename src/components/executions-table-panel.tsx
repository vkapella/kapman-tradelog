"use client";

import Link from "next/link";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { deriveDefinitions, type TableColumnConfig } from "@/components/data-table/column-config";
import { ConfigVirtualTable } from "@/components/data-table/ConfigVirtualTable";
import { detailsColumnConfig } from "@/components/data-table/details-column";
import { HiddenStateChips } from "@/components/data-table/HiddenStateChips";
import { RowDetailSheet } from "@/components/data-table/RowDetailSheet";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { buildDiagnosticCaseHref } from "@/lib/diagnostics/case-file-link";
import type { ApiDetailResponse, ExecutionDetailRecord, ExecutionRecord, ImportRecord } from "@/types/api";

interface ExecutionDetailPayload extends ApiDetailResponse<ExecutionDetailRecord> {}


function displayExecutionSymbol(row: Pick<ExecutionRecord, "symbol" | "underlyingSymbol">): string {
  return row.underlyingSymbol ?? row.symbol;
}

function renderOptionValue(row: Pick<ExecutionRecord, "optionType" | "strike" | "expirationDate">): string {
  if (!row.optionType) {
    return "-";
  }

  return `${row.optionType} ${row.strike ?? "-"} ${row.expirationDate?.slice(0, 10) ?? "-"}`;
}

/** Decision 41: enum values are not display labels. Raw values keep flowing
 *  through filters, the detail sheet, and exports. */
const EVENT_TYPE_LABELS: Record<string, string> = {
  TRADE: "Trade",
  EXPIRATION_INFERRED: "Expired (inferred)",
  ASSIGNMENT: "Assigned",
  EXERCISE: "Exercised",
};

function canInvestigateExecution(row: Pick<ExecutionRecord, "eventType" | "openingClosingEffect">): boolean {
  return row.eventType === "EXPIRATION_INFERRED" || row.openingClosingEffect === null || row.openingClosingEffect === "UNKNOWN";
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...`;
}


export function ExecutionsTablePanel() {
  const searchParams = useSearchParams();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);

  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rows, setRows] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExecutionDetailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    const executionParam = searchParams.get("execution");
    setSelectedExecutionId(executionParam || null);
  }, [searchParams]);

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

    async function loadExecutions() {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);
        const payload = await fetchAllPages<ExecutionRecord>("/api/executions", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load executions right now.");
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadExecutions();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  useEffect(() => {
    let canceled = false;

    async function loadExecutionDetail() {
      if (!selectedExecutionId) {
        setDetail(null);
        setDetailError(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(null);
      setCopyStatus("idle");

      try {
        const query = new URLSearchParams();
        applyAccountIdsToSearchParams(query, selectedAccounts);
        applyRangeToSearchParams(query);
        const response = await fetch(`/api/executions/${selectedExecutionId}?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          if (!canceled) {
            setDetail(null);
            setDetailError("Unable to load execution detail right now.");
          }
          return;
        }

        const payload = (await response.json()) as ExecutionDetailPayload;
        if (!canceled) {
          setDetail(payload.data);
        }
      } catch {
        if (!canceled) {
          setDetail(null);
          setDetailError("Unable to load execution detail right now.");
        }
      } finally {
        if (!canceled) {
          setDetailLoading(false);
        }
      }
    }

    void loadExecutionDetail();

    return () => {
      canceled = true;
    };
  }, [selectedExecutionId, selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const importLabelById = useMemo(() => {
    return new Map(imports.map((entry) => [entry.id, `${entry.filename} (${getAccountDisplayText(entry.accountId)})`]));
  }, [getAccountDisplayText, imports]);

  const [detailRow, setDetailRow] = useState<ExecutionRecord | null>(null);
  // Tier-1 (approved §0.4 / T1): Event Time (date), Symbol, Side, Qty, Price.
  const configs = useMemo<TableColumnConfig<ExecutionRecord>[]>(() => [
    {
      definition: {
      id: "eventTimestamp",
      label: "Event Time",
      filterMode: "discrete",
      getFilterValues: (row) => row.eventTimestamp,
      getFilterOptionLabel: (value) => new Date(value).toLocaleString(),
      sortMode: "date",
      getSortValue: (row) => row.eventTimestamp,
      defaultSortDirection: "desc",
      panelWidthClassName: "w-80",
    },
      width: "190px",
      mobileWidth: "minmax(72px, auto)",
      stickyLeft: true,
      renderCell: (row) => (
        <div className="px-2 py-2">
          <span className="max-md:hidden">{new Date(row.eventTimestamp).toLocaleString()}</span>
          <span className="md:hidden">{row.eventTimestamp.slice(0, 10)}</span>
        </div>
      ),
    },
    {
      definition: {
      id: "tradeDate",
      label: "Trade Date",
      filterMode: "discrete",
      getFilterValues: (row) => row.tradeDate,
      getFilterOptionLabel: (value) => value.slice(0, 10),
      sortMode: "date",
      getSortValue: (row) => row.tradeDate,
      defaultSortDirection: "desc",
    },
      width: "120px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2">{row.tradeDate.slice(0, 10)}</div>,
    },
    {
      definition: {
      id: "symbol",
      label: "Symbol",
      filterMode: "discrete",
      getFilterValues: (row) => displayExecutionSymbol(row),
      sortMode: "string",
      getSortValue: (row) => displayExecutionSymbol(row),
    },
      width: "90px",
      mobileWidth: "minmax(52px, auto)",
      renderCell: (row) => <div className="px-2 py-2">{displayExecutionSymbol(row)}</div>,
    },
    {
      definition: {
      id: "side",
      label: "Side",
      filterMode: "discrete",
      getFilterValues: (row) => row.side ?? "-",
      sortMode: "string",
      getSortValue: (row) => row.side ?? "-",
    },
      width: "78px",
      mobileWidth: "minmax(48px, auto)",
      renderCell: (row) => (
        <div className="px-2 py-2">{row.side === "BUY" ? <Badge variant="buy">BUY</Badge> : row.side === "SELL" ? <Badge variant="sell">SELL</Badge> : "-"}</div>
      ),
    },
    {
      definition: {
      id: "quantity",
      label: "Qty",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => row.quantity,
      sortMode: "number",
      getSortValue: (row) => Number(row.quantity),
    },
      width: "64px",
      mobileWidth: "minmax(36px, auto)",
      renderCell: (row) => <div className="px-2 py-2 text-right">{row.quantity}</div>,
    },
    {
      definition: {
      id: "price",
      label: "Unit Price",
      align: "right",
      title: "Execution price per share (equity) or per contract share (option). Multiply options by 100 for dollar value.",
      filterMode: "discrete",
      getFilterValues: (row) => row.price ?? "~",
      sortMode: "number",
      getSortValue: (row) => (row.price === null ? null : Number(row.price)),
    },
      width: "96px",
      mobileWidth: "minmax(52px, auto)",
      renderCell: (row) => <div className="px-2 py-2 text-right">{row.price ?? "~"}</div>,
    },
    {
      definition: {
      id: "eventType",
      label: "Event",
      filterMode: "discrete",
      getFilterValues: (row) => row.eventType,
      // Decision 41: EXPIRATION_INFERRED is a wire value, not a label.
      getFilterOptionLabel: (value) => EVENT_TYPE_LABELS[value] ?? value,
      sortMode: "string",
      getSortValue: (row) => row.eventType,
    },
      width: "110px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2">{EVENT_TYPE_LABELS[row.eventType] ?? row.eventType}</div>,
      renderDetailValue: (row) => row.eventType,
    },
    {
      definition: {
      id: "effect",
      label: "Effect",
      filterMode: "discrete",
      getFilterValues: (row) => row.openingClosingEffect ?? "UNKNOWN",
      // Decision 41: enum values are not display labels. The chip reads
      // OPEN/CLOSE; TO_OPEN/TO_CLOSE (the broker-wire values) survive in the
      // filter values, the detail sheet, and every export.
      getFilterOptionLabel: (value) => (value === "TO_OPEN" ? "OPEN" : value === "TO_CLOSE" ? "CLOSE" : value),
      sortMode: "string",
      getSortValue: (row) => row.openingClosingEffect ?? "UNKNOWN",
    },
      width: "110px",
      tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2">
          {row.openingClosingEffect === "TO_OPEN" ? (
            <Badge variant="to-open">OPEN</Badge>
          ) : row.openingClosingEffect === "TO_CLOSE" ? (
            <Badge variant="to-close">CLOSE</Badge>
          ) : (
            "UNKNOWN"
          )}
        </div>
      ),
      renderDetailValue: (row) => row.openingClosingEffect ?? "UNKNOWN",
    },
    {
      definition: {
      id: "option",
      label: "Option",
      filterMode: "discrete",
      getFilterValues: (row) => renderOptionValue(row),
      sortMode: "string",
      getSortValue: (row) => renderOptionValue(row),
      panelWidthClassName: "w-80",
    },
      width: "190px",
      tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2">
          {row.optionType ? (
            <span className="inline-flex items-center gap-1">
              <Badge variant={row.optionType === "PUT" ? "put" : "call"}>{row.optionType}</Badge>
              <span className="font-mono">
                {row.strike ?? "-"} {row.expirationDate?.slice(0, 10) ?? "-"}
              </span>
            </span>
          ) : (
            "-"
          )}
        </div>
      ),
    },
    {
      definition: {
      id: "accountId",
      label: "Account",
      filterMode: "discrete",
      getFilterValues: (row) => row.accountId,
      getFilterOptionLabel: (value) => getAccountDisplayText(value),
      sortMode: "string",
      getSortValue: (row) => getAccountDisplayText(row.accountId),
      panelWidthClassName: "w-80",
    },
      width: "130px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2"><AccountLabel accountId={row.accountId} /></div>,
    },
    {
      definition: {
      id: "importId",
      label: "Import",
      filterMode: "discrete",
      getFilterValues: (row) => row.importId,
      getFilterOptionLabel: (value) => importLabelById.get(value) ?? value,
      sortMode: "string",
      getSortValue: (row) => importLabelById.get(row.importId) ?? row.importId,
      panelWidthClassName: "w-80",
    },
      width: "420px",
      tier: 2,
      renderCell: (row) => <div className="px-2 py-2">{importLabelById.get(row.importId) ?? shortId(row.importId)}</div>,
    },
    {
      definition: {
      id: "executionId",
      label: "Execution ID",
      filterMode: "discrete",
      getFilterValues: (row) => row.id,
      getFilterOptionLabel: (value) => shortId(value),
      sortMode: "string",
      getSortValue: (row) => row.id,
      panelWidthClassName: "w-80",
    },
      width: "130px",
      tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2 font-mono">
          <button type="button" onClick={() => setSelectedExecutionId(row.id)} className="text-accent underline">
            {shortId(row.id)}
          </button>
        </div>
      ),
    },
    {
      definition: {
      id: "investigate",
      label: "Investigate",
      filterMode: "discrete",
      getFilterValues: (row) => (canInvestigateExecution(row) ? "Case file" : "-"),
      sortMode: "string",
      getSortValue: (row) => (canInvestigateExecution(row) ? "Case file" : "-"),
    },
      width: "130px",
      tier: 2,
      renderCell: (row) => (
        <div className="px-2 py-2">
          {canInvestigateExecution(row) ? (
            <Link href={buildDiagnosticCaseHref({ kind: "execution", executionId: row.id })} className="text-accent underline">
              Case file
            </Link>
          ) : (
            "-"
          )}
        </div>
      ),
    },
    detailsColumnConfig<ExecutionRecord>(setDetailRow),
  ], [getAccountDisplayText, importLabelById]);
  const columns = useMemo(() => deriveDefinitions(configs), [configs]);

  const table = useDataTableState({
    tableName: "executions",
    rows,
    columns,
    initialSort: { columnId: "eventTimestamp", direction: "desc" },
  });

  const isTableHydrated = table.isHydrated;
  const setTableColumnFilter = table.setColumnFilter;

  useEffect(() => {
    if (!isTableHydrated) {
      return;
    }

    const symbolParam = searchParams.get("symbol");
    const importParam = searchParams.get("import");
    const executionParam = searchParams.get("execution");

    if (symbolParam) {
      setTableColumnFilter("symbol", [symbolParam]);
    }
    if (importParam) {
      setTableColumnFilter("importId", [importParam]);
    }
    if (executionParam) {
      setTableColumnFilter("executionId", [executionParam]);
    }
  }, [searchParams, isTableHydrated, setTableColumnFilter]);

  const totalRows = table.sortedRows.length;
  const hasRows = table.sortedRows.length > 0;

  async function copyInstrumentKey() {
    if (!detail?.instrumentKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(detail.instrumentKey);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6 max-md:p-2">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text">Execution Audit Table (T1)</h2>
        <p className="text-sm text-text-2">Filter and inspect normalized execution events with import/account context for auditability.</p>
      </header>

      <DataTableToolbar
        activeFilterCount={table.activeFilterCount}
        onClearAllFilters={() => {
          table.clearAllFilters();
        }}
        totalRows={totalRows}
      />
      <HiddenStateChips configs={configs} visibleColumns={table.visibleColumns} sort={table.sort} filters={table.filters} rangeFilters={table.rangeFilters} setSort={table.setSort} setColumnFilter={table.setColumnFilter} setColumnRange={table.setColumnRange} />

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-neg">{error}</p> : null}

      {!loading && !error && totalRows === 0 ? (
        <div className="rounded-xl border border-border bg-bg p-6">
          <h3 className="text-lg font-medium text-text">No executions found</h3>
          <p className="mt-2 text-sm text-text-2">Adjust filters or commit an import to generate canonical execution rows.</p>
          <Link href="/imports" className="mt-3 inline-block text-sm text-accent underline">
            Go to Imports & Connections
          </Link>
        </div>
      ) : null}

      {!loading && !error && hasRows ? (
        <div className="space-y-3">
          <ConfigVirtualTable
            configs={configs}
            table={table}
            openColumnId={openColumnId}
            setOpenColumnId={setOpenColumnId}
            scrollContainerRef={scrollContainerRef}
            getRowKey={(row) => row.id}
            onRowClick={setDetailRow}
          />
          <RowDetailSheet configs={configs} row={detailRow} title="Execution details" onClose={() => setDetailRow(null)} />
        </div>
      ) : null}

      {selectedExecutionId ? (
        <section className="space-y-3 rounded-xl border border-border bg-bg p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text">Execution Detail Drill-through</h3>
            <button type="button" onClick={() => setSelectedExecutionId(null)} className="text-xs text-text-2 underline">
              Close
            </button>
          </div>

          {detailLoading ? <LoadingSkeleton lines={5} /> : null}
          {!detailLoading && detailError ? <p className="text-xs text-neg">{detailError}</p> : null}

          {!detailLoading && detail ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs text-text-3">Execution ID</p>
                  <p className="break-all font-mono text-xs text-text">{detail.id}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Import ID</p>
                  <p className="break-all font-mono text-xs text-text">{detail.importId}</p>
                  <Link href={`/imports?tab=history&import=${encodeURIComponent(detail.importId)}`} className="text-xs text-accent underline">
                    Open parent import record
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-text-3">Account</p>
                  <p className="break-all font-mono text-xs text-text">{detail.accountId}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Trade Date</p>
                  <p className="text-xs text-text">{detail.tradeDate.slice(0, 10)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Symbol</p>
                  <p className="text-xs text-text">{displayExecutionSymbol(detail)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Side</p>
                  <p className="text-xs text-text">{detail.side ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Qty</p>
                  <p className="text-xs text-text">{detail.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Unit Price</p>
                  <p className="text-xs text-text">{detail.price ?? "~"}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Event</p>
                  <p className="text-xs text-text">{detail.eventType}</p>
                </div>
                <div>
                  <p className="text-xs text-text-3">Effect</p>
                  <p className="text-xs text-text">{detail.openingClosingEffect ?? "UNKNOWN"}</p>
                  {canInvestigateExecution(detail) ? (
                    <Link href={buildDiagnosticCaseHref({ kind: "execution", executionId: detail.id })} className="text-xs text-accent underline">
                      Open diagnostics case file
                    </Link>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs text-text-3">Option</p>
                  <p className="text-xs text-text">{renderOptionValue(detail)}</p>
                </div>
              </div>

              <div className="space-y-2 rounded border border-border bg-bg p-3">
                <p className="text-xs text-text-3">Instrument Key</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    readOnly
                    value={detail.instrumentKey ?? ""}
                    className="min-w-[18rem] flex-1 rounded border border-border bg-surface-3 px-2 py-1 font-mono text-xs text-text"
                  />
                  <button
                    type="button"
                    onClick={copyInstrumentKey}
                    disabled={!detail.instrumentKey}
                    className="rounded border border-border bg-surface-3 px-3 py-1 text-xs text-text disabled:opacity-50"
                  >
                    Copy
                  </button>
                </div>
                {copyStatus === "copied" ? <p className="text-xs text-pos">Instrument key copied.</p> : null}
                {copyStatus === "failed" ? <p className="text-xs text-neg">Clipboard write failed. Copy manually.</p> : null}
              </div>

              <details className="rounded border border-border bg-bg p-3">
                <summary className="cursor-pointer text-xs font-semibold text-text">Raw Row JSON</summary>
                <pre className="mt-2 overflow-auto rounded border border-border bg-bg p-3 text-xs text-text">
                  {JSON.stringify(detail.rawRowJson ?? null, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
