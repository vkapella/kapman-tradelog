"use client";

import Link from "next/link";
import { memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { Badge } from "@/components/Badge";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { requestCloseColumnId, toggleOpenColumnId } from "@/components/data-table/filter-panel-interaction";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { VirtualGridBody, VirtualGridHeaderRow, VirtualGridTableShell } from "@/components/data-table/VirtualGridTable";
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

const EXECUTIONS_COLUMN_TEMPLATE = "190px 120px 90px 78px 64px 96px 110px 110px 190px 130px 420px 130px 130px";

function displayExecutionSymbol(row: Pick<ExecutionRecord, "symbol" | "underlyingSymbol">): string {
  return row.underlyingSymbol ?? row.symbol;
}

function renderOptionValue(row: Pick<ExecutionRecord, "optionType" | "strike" | "expirationDate">): string {
  if (!row.optionType) {
    return "-";
  }

  return `${row.optionType} ${row.strike ?? "-"} ${row.expirationDate?.slice(0, 10) ?? "-"}`;
}

function canInvestigateExecution(row: Pick<ExecutionRecord, "eventType" | "openingClosingEffect">): boolean {
  return row.eventType === "EXPIRATION_INFERRED" || row.openingClosingEffect === null || row.openingClosingEffect === "UNKNOWN";
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...`;
}

const ExecutionsTableRow = memo(function ExecutionsTableRow({
  row,
  importLabelById,
  onSelectExecution,
}: {
  row: ExecutionRecord;
  importLabelById: Map<string, string>;
  onSelectExecution: (executionId: string) => void;
}) {
  return (
    <>
          <div className="px-2 py-2">{new Date(row.eventTimestamp).toLocaleString()}</div>
          <div className="px-2 py-2">{row.tradeDate.slice(0, 10)}</div>
          <div className="px-2 py-2">{displayExecutionSymbol(row)}</div>
          <div className="px-2 py-2">
            {row.side === "BUY" ? <Badge variant="buy">BUY</Badge> : row.side === "SELL" ? <Badge variant="sell">SELL</Badge> : "-"}
          </div>
          <div className="px-2 py-2 text-right">{row.quantity}</div>
          <div className="px-2 py-2 text-right">{row.price ?? "~"}</div>
          <div className="px-2 py-2">{row.eventType}</div>
          <div className="px-2 py-2">
            {row.openingClosingEffect === "TO_OPEN" ? (
              <Badge variant="to-open">TO_OPEN</Badge>
            ) : row.openingClosingEffect === "TO_CLOSE" ? (
              <Badge variant="to-close">TO_CLOSE</Badge>
            ) : (
              "UNKNOWN"
            )}
          </div>
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
          <div className="px-2 py-2">
            <AccountLabel accountId={row.accountId} />
          </div>
          <div className="px-2 py-2">{importLabelById.get(row.importId) ?? shortId(row.importId)}</div>
          <div className="px-2 py-2 font-mono">
            <button type="button" onClick={() => onSelectExecution(row.id)} className="text-accent underline">
              {shortId(row.id)}
            </button>
          </div>
          <div className="px-2 py-2">
            {canInvestigateExecution(row) ? (
              <Link href={buildDiagnosticCaseHref({ kind: "execution", executionId: row.id })} className="text-accent underline">
                Case file
              </Link>
            ) : (
              "-"
            )}
          </div>
    </>
  );
});

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

  const columns = useMemo<DataTableColumnDefinition<ExecutionRecord>[]>(() => [
    {
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
    {
      id: "tradeDate",
      label: "Trade Date",
      filterMode: "discrete",
      getFilterValues: (row) => row.tradeDate,
      getFilterOptionLabel: (value) => value.slice(0, 10),
      sortMode: "date",
      getSortValue: (row) => row.tradeDate,
      defaultSortDirection: "desc",
    },
    {
      id: "symbol",
      label: "Symbol",
      filterMode: "discrete",
      getFilterValues: (row) => displayExecutionSymbol(row),
      sortMode: "string",
      getSortValue: (row) => displayExecutionSymbol(row),
    },
    {
      id: "side",
      label: "Side",
      filterMode: "discrete",
      getFilterValues: (row) => row.side ?? "-",
      sortMode: "string",
      getSortValue: (row) => row.side ?? "-",
    },
    {
      id: "quantity",
      label: "Qty",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => row.quantity,
      sortMode: "number",
      getSortValue: (row) => Number(row.quantity),
    },
    {
      id: "price",
      label: "Unit Price",
      align: "right",
      title: "Execution price per share (equity) or per contract share (option). Multiply options by 100 for dollar value.",
      filterMode: "discrete",
      getFilterValues: (row) => row.price ?? "~",
      sortMode: "number",
      getSortValue: (row) => (row.price === null ? null : Number(row.price)),
    },
    {
      id: "eventType",
      label: "Event",
      filterMode: "discrete",
      getFilterValues: (row) => row.eventType,
      sortMode: "string",
      getSortValue: (row) => row.eventType,
    },
    {
      id: "effect",
      label: "Effect",
      filterMode: "discrete",
      getFilterValues: (row) => row.openingClosingEffect ?? "UNKNOWN",
      sortMode: "string",
      getSortValue: (row) => row.openingClosingEffect ?? "UNKNOWN",
    },
    {
      id: "option",
      label: "Option",
      filterMode: "discrete",
      getFilterValues: (row) => renderOptionValue(row),
      sortMode: "string",
      getSortValue: (row) => renderOptionValue(row),
      panelWidthClassName: "w-80",
    },
    {
      id: "accountId",
      label: "Account",
      filterMode: "discrete",
      getFilterValues: (row) => row.accountId,
      getFilterOptionLabel: (value) => getAccountDisplayText(value),
      sortMode: "string",
      getSortValue: (row) => getAccountDisplayText(row.accountId),
      panelWidthClassName: "w-80",
    },
    {
      id: "importId",
      label: "Import",
      filterMode: "discrete",
      getFilterValues: (row) => row.importId,
      getFilterOptionLabel: (value) => importLabelById.get(value) ?? value,
      sortMode: "string",
      getSortValue: (row) => importLabelById.get(row.importId) ?? row.importId,
      panelWidthClassName: "w-80",
    },
    {
      id: "executionId",
      label: "Execution ID",
      filterMode: "discrete",
      getFilterValues: (row) => row.id,
      getFilterOptionLabel: (value) => shortId(value),
      sortMode: "string",
      getSortValue: (row) => row.id,
      panelWidthClassName: "w-80",
    },
    {
      id: "investigate",
      label: "Investigate",
      filterMode: "discrete",
      getFilterValues: (row) => (canInvestigateExecution(row) ? "Case file" : "-"),
      sortMode: "string",
      getSortValue: (row) => (canInvestigateExecution(row) ? "Case file" : "-"),
    },
  ], [getAccountDisplayText, importLabelById]);

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

  function applyColumnState(columnId: string, values: string[], direction: SortDirection | null) {
    setTableColumnFilter(columnId, values);
    if (direction) {
      table.setSort({ columnId, direction });
    } else if (table.sort.columnId === columnId) {
      table.setSort({ columnId: null, direction: null });
    }
  }

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
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6">
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
          <VirtualGridTableShell scrollContainerRef={scrollContainerRef}>
            <VirtualGridHeaderRow columnTemplate={EXECUTIONS_COLUMN_TEMPLATE}>
              {columns.map((column) => (
                <DataTableHeader
                  key={column.id}
                  as="div"
                  column={column}
                  currentSortDirection={table.sort.columnId === column.id ? table.sort.direction : null}
                  currentValues={table.filters[column.id] ?? []}
                  isOpen={openColumnId === column.id}
                  onApply={(values, direction) => applyColumnState(column.id, values, direction)}
                  onRequestClose={() => setOpenColumnId((current) => requestCloseColumnId(current, column.id))}
                  onToggle={() => setOpenColumnId((current) => toggleOpenColumnId(current, column.id))}
                  options={table.filterOptions[column.id] ?? []}
                />
              ))}
            </VirtualGridHeaderRow>
            <VirtualGridBody
              columnTemplate={EXECUTIONS_COLUMN_TEMPLATE}
              rows={table.sortedRows}
              scrollContainerRef={scrollContainerRef}
              getRowKey={(row) => row.id}
              renderRow={(row) => <ExecutionsTableRow row={row} importLabelById={importLabelById} onSelectExecution={setSelectedExecutionId} />}
            />
          </VirtualGridTableShell>
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
                    className="min-w-[18rem] flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text"
                  />
                  <button
                    type="button"
                    onClick={copyInstrumentKey}
                    disabled={!detail.instrumentKey}
                    className="rounded border border-border bg-surface px-3 py-1 text-xs text-text disabled:opacity-50"
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
