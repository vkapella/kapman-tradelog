"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AccountLabel } from "@/components/accounts/AccountLabel";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { requestCloseColumnId, toggleOpenColumnId } from "@/components/data-table/filter-panel-interaction";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { VirtualGridBody, VirtualGridHeaderRow, VirtualGridTableShell } from "@/components/data-table/VirtualGridTable";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { ImportPreviewTable } from "@/components/imports/ImportPreviewTable";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { openPositionsStore } from "@/store/openPositionsStore";
import type { CommitImportResponse, ImportRecord, UploadImportResponse } from "@/types/api";

interface CommitPayload {
  data: CommitImportResponse;
}

interface UploadPayload {
  data: UploadImportResponse;
}

type UploadPhase = "idle" | "uploading" | "parsing";

interface ImportsWorkflowPanelProps {
  mode?: "all" | "upload" | "history";
}

const IMPORTS_COLUMN_TEMPLATE = "190px 300px 110px 160px 110px 95px 100px 150px 95px 130px 130px 90px";

const ImportsHistoryTableRow = memo(function ImportsHistoryTableRow({
  row,
  deletingImportId,
  onRequestDeleteImport,
}: {
  row: ImportRecord;
  deletingImportId: string | null;
  onRequestDeleteImport: (row: ImportRecord) => Promise<void>;
}) {
  return (
    <>
          <div className="px-2 py-2">{new Date(row.createdAt).toLocaleString()}</div>
          <div className="px-2 py-2">{row.filename}</div>
          <div className="px-2 py-2">{row.broker}</div>
          <div className="px-2 py-2">
            <AccountLabel accountId={row.accountId} />
          </div>
          <div className="px-2 py-2">{row.status}</div>
          <div className="px-2 py-2 text-right">{row.parsedRows}</div>
          <div className="px-2 py-2 text-right">{row.insertedExecutions}</div>
          <div className="px-2 py-2 text-right">{row.skipped_duplicate}</div>
          <div className="px-2 py-2 text-right">{row.failed}</div>
          <div className="px-2 py-2 font-mono">{`${row.id.slice(0, 8)}...`}</div>
          <div className="px-2 py-2">
            <a href={`/trade-records?tab=executions&import=${row.id}`} className="text-accent underline">
              View executions
            </a>
          </div>
          <div className="px-2 py-2 text-center">
            <button
              type="button"
              onClick={() => void onRequestDeleteImport(row)}
              disabled={deletingImportId === row.id}
              className="inline-flex items-center justify-center rounded border border-[color:var(--neg)] bg-[color:var(--neg-dim)] p-1.5 text-neg disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Delete import ${row.filename}`}
              title={row.status === "COMMITTED" ? "Delete committed import" : "Delete uploaded import"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
              </svg>
            </button>
          </div>
    </>
  );
});

export function ImportsWorkflowPanel({ mode = "all" }: ImportsWorkflowPanelProps) {
  const searchParams = useSearchParams();
  const { selectedAccounts, getAccountDisplayText } = useAccountFilterContext();
  const showUpload = mode !== "history";
  const showHistory = mode !== "upload";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadImportResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitImportResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const [deleteConfirmationImport, setDeleteConfirmationImport] = useState<ImportRecord | null>(null);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const canCommit = Boolean(uploadResult && !uploading && !committing && !discarding && !commitResult);

  const loadHistory = useCallback(async () => {
    if (!showHistory) {
      return;
    }

    if (isMountedRef.current) {
      setHistoryLoading(true);
    }
    try {
      const params = new URLSearchParams();
      applyAccountIdsToSearchParams(params, selectedAccounts);
      const payload = await fetchAllPages<ImportRecord>("/api/imports", params);
      if (isMountedRef.current) {
        setHistory(payload.data);
      }
    } catch {
      if (isMountedRef.current) {
        setHistory([]);
        setError("Unable to load import history right now.");
      }
    } finally {
      if (isMountedRef.current) {
        setHistoryLoading(false);
      }
    }
  }, [selectedAccounts, showHistory]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleUpload() {
    if (!selectedFile) {
      return;
    }

    setUploading(true);
    setUploadPhase("uploading");
    setUploadProgress(0);
    setUploadResult(null);
    setCommitResult(null);
    setError(null);

    const formData = new FormData();
    formData.set("file", selectedFile);

    await new Promise<void>((resolve) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/imports/upload");

      request.upload.onprogress = (event) => {
        if (event.lengthComputable && isMountedRef.current) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      request.upload.onloadend = () => {
        if (isMountedRef.current) {
          setUploadPhase("parsing");
          setUploadProgress(100);
        }
      };

      request.onload = () => {
        try {
          const payload = JSON.parse(request.responseText) as UploadPayload;
          if (request.status >= 200 && request.status < 300) {
            if (isMountedRef.current) {
              setUploadResult(payload.data);
              setUploadProgress(100);
            }
          } else {
            if (isMountedRef.current) {
              setError("Upload failed. Review the file and retry.");
            }
          }
        } catch {
          if (isMountedRef.current) {
            setError("Upload failed due to an invalid server response.");
          }
        } finally {
          if (isMountedRef.current) {
            setUploading(false);
            setUploadPhase("idle");
          }
          void loadHistory();
          resolve();
        }
      };

      request.onerror = () => {
        if (isMountedRef.current) {
          setError("Network error while uploading file.");
          setUploading(false);
          setUploadPhase("idle");
        }
        resolve();
      };

      request.send(formData);
    });
  }

  async function handleCommit() {
    if (!uploadResult) {
      return;
    }

    setError(null);
    setCommitting(true);

    try {
      const response = await fetch(`/api/imports/${uploadResult.importId}/commit`, {
        method: "POST",
      });

      if (!response.ok) {
        if (isMountedRef.current) {
          setError("Commit failed. Import remains recoverable and can be retried.");
        }
        return;
      }

      const payload = (await response.json()) as CommitPayload;
      if (isMountedRef.current) {
        setCommitResult(payload.data);
      }
      openPositionsStore.invalidateAccount(payload.data.accountId);
      if (payload.data.positionSnapshot) {
        void openPositionsStore.followSnapshot([payload.data.accountId], payload.data.positionSnapshot.snapshotId);
      }
      await loadHistory();
    } finally {
      if (isMountedRef.current) {
        setCommitting(false);
      }
    }
  }

  async function handleDiscardUpload() {
    if (!uploadResult || committing || commitResult || discarding) {
      return;
    }

    setError(null);
    setDiscarding(true);

    try {
      const response = await fetch(`/api/imports/${uploadResult.importId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        if (isMountedRef.current) {
          setError("Discard failed. The uploaded import was not removed.");
        }
        return;
      }

      await response.json();
      if (isMountedRef.current) {
        setUploadResult(null);
        setSelectedFile(null);
      }
      await loadHistory();
    } finally {
      if (isMountedRef.current) {
        setDiscarding(false);
      }
    }
  }

  const commitSummary = useMemo(() => {
    if (!commitResult) {
      return null;
    }

    return [
      `${commitResult.parsedRows} parsed`,
      `${commitResult.inserted.executions} executions inserted`,
      `${commitResult.inserted.cashEvents} cash events inserted`,
      `${commitResult.skippedDuplicates.executions} execution duplicates skipped`,
      `${commitResult.skippedDuplicates.cashEvents} cash-event duplicates skipped`,
      `${commitResult.failed} failed`,
    ].join(" · ");
  }, [commitResult]);

  async function executeDeleteImport(row: ImportRecord) {
    setDeletingImportId(row.id);
    setError(null);

    try {
      const response = await fetch(`/api/imports/${row.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (isMountedRef.current) {
          setError(payload.error?.message ?? "Delete failed. The import was not removed.");
        }
        return;
      }

      await response.json();
      if (isMountedRef.current) {
        setDeleteConfirmationImport(null);
      }
      await loadHistory();
    } finally {
      if (isMountedRef.current) {
        setDeletingImportId(null);
      }
    }
  }

  async function requestDeleteImport(row: ImportRecord) {
    if (deletingImportId) {
      return;
    }

    if (row.status === "COMMITTED") {
      setDeleteConfirmationImport(row);
      return;
    }

    await executeDeleteImport(row);
  }

  const columns = useMemo<DataTableColumnDefinition<ImportRecord>[]>(() => [
    {
      id: "createdAt",
      label: "Imported At",
      filterMode: "discrete",
      getFilterValues: (row) => row.createdAt,
      getFilterOptionLabel: (value) => new Date(value).toLocaleString(),
      sortMode: "date",
      getSortValue: (row) => row.createdAt,
      defaultSortDirection: "desc",
      panelWidthClassName: "w-80",
    },
    {
      id: "filename",
      label: "Filename",
      filterMode: "discrete",
      getFilterValues: (row) => row.filename,
      sortMode: "string",
      getSortValue: (row) => row.filename,
      panelWidthClassName: "w-80",
    },
    {
      id: "broker",
      label: "Broker",
      filterMode: "discrete",
      getFilterValues: (row) => row.broker,
      sortMode: "string",
      getSortValue: (row) => row.broker,
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
      id: "status",
      label: "Status",
      filterMode: "discrete",
      getFilterValues: (row) => row.status,
      sortMode: "string",
      getSortValue: (row) => row.status,
    },
    {
      id: "parsedRows",
      label: "Parsed",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => String(row.parsedRows),
      sortMode: "number",
      getSortValue: (row) => row.parsedRows,
    },
    {
      id: "insertedExecutions",
      label: "Inserted",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => String(row.insertedExecutions),
      sortMode: "number",
      getSortValue: (row) => row.insertedExecutions,
    },
    {
      id: "skipped_duplicate",
      label: "Skipped Duplicate",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => String(row.skipped_duplicate),
      sortMode: "number",
      getSortValue: (row) => row.skipped_duplicate,
    },
    {
      id: "failed",
      label: "Failed",
      align: "right",
      filterMode: "discrete",
      getFilterValues: (row) => String(row.failed),
      sortMode: "number",
      getSortValue: (row) => row.failed,
    },
    {
      id: "importId",
      label: "Import ID",
      filterMode: "discrete",
      getFilterValues: (row) => row.id,
      getFilterOptionLabel: (value) => `${value.slice(0, 8)}...`,
      sortMode: "string",
      getSortValue: (row) => row.id,
      panelWidthClassName: "w-80",
    },
    {
      id: "link",
      label: "Link",
      filterMode: "discrete",
      getFilterValues: () => "View executions",
      sortMode: "string",
      getSortValue: () => "View executions",
    },
    {
      id: "delete",
      label: "Delete",
      filterMode: "discrete",
      getFilterValues: () => "Delete",
      sortMode: "string",
      getSortValue: () => "Delete",
    },
  ], [getAccountDisplayText]);

  const table = useDataTableState({
    tableName: "imports",
    rows: history,
    columns,
    initialSort: { columnId: "createdAt", direction: "desc" },
  });

  const isTableHydrated = table.isHydrated;
  const setTableColumnFilter = table.setColumnFilter;

  useEffect(() => {
    if (!isTableHydrated) {
      return;
    }

    const accountParam = searchParams.get("account");
    const importParam = searchParams.get("import");

    if (accountParam) {
      setTableColumnFilter("accountId", [accountParam]);
    }
    if (importParam) {
      setTableColumnFilter("importId", [importParam]);
    }
  }, [searchParams, isTableHydrated, setTableColumnFilter]);

  function applyColumnState(columnId: string, values: string[], direction: SortDirection | null) {
    setTableColumnFilter(columnId, values);
    if (direction) {
      table.setSort({ columnId, direction });
    } else if (table.sort.columnId === columnId) {
      table.setSort({ columnId: null, direction: null });
    }
  }

  const totalRows = table.sortedRows.length;

  return (
    <section className="space-y-6 rounded-2xl border border-border bg-surface p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text">Import Workflow</h2>
        <p className="text-sm text-text-2">Upload, detect, preview, and commit a broker statement into canonical T1 executions.</p>
      </header>

      {showUpload ? (
        <>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"
            />
            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="rounded-lg border border-[color:var(--accent-border)] bg-[color:var(--accent-dim)] px-4 py-2 text-sm text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (uploadPhase === "parsing" ? "Parsing..." : "Uploading...") : "Upload Statement"}
            </button>
          </div>

          {(uploading || uploadProgress > 0) && (
            <div>
              <p className="mb-1 text-xs text-text-2">
                {uploadPhase === "parsing" ? "Upload complete. Parsing preview..." : `Upload progress: ${uploadProgress}%`}
              </p>
              <div className="h-2 rounded-full bg-surface-2">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {uploadResult && (
            <div className="space-y-4 rounded-xl border border-border bg-bg p-4">
              <div>
                <p className="text-sm font-medium text-text">Detection Result</p>
                <p className="mt-1 text-xs text-text-2">
                  Adapter: {uploadResult.detection.adapterId} · Confidence: {uploadResult.detection.confidence} · Format: {" "}
                  {uploadResult.detection.formatVersion}
                </p>
              </div>

              {uploadResult.account ? (
                <div>
                  <p className="text-sm font-medium text-text">Target Account</p>
                  <p className="mt-1 text-sm text-text">
                    Records will be associated with <span className="font-semibold">{uploadResult.account.label}</span>
                    <span className="ml-1 text-xs text-text-2">({uploadResult.account.accountId})</span>
                  </p>
                  {uploadResult.account.isNew ? (
                    <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                      This account does not exist yet — committing will create it. If that is unexpected (for example a renamed or
                      mis-detected file), choose Discard Upload below and no records will be kept.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium text-text">Parse Preview</p>
                <div className="mt-2 overflow-auto rounded border border-border">
                  <ImportPreviewTable adapter={uploadResult.detection.adapterId} rows={uploadResult.previewRows} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={!canCommit}
                  className="rounded-lg border border-[color:var(--pos)] bg-[color:var(--pos-dim)] px-4 py-2 text-sm text-pos disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {committing ? "Committing..." : commitResult ? "Committed" : "Commit Import"}
                </button>
                {!commitResult ? (
                  <button
                    type="button"
                    onClick={() => void handleDiscardUpload()}
                    disabled={committing || discarding}
                    className="rounded-lg border border-[color:var(--neg)] bg-[color:var(--neg-dim)] px-4 py-2 text-sm text-neg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {discarding ? "Discarding..." : "Discard Upload"}
                  </button>
                ) : null}
                {commitSummary && <p className="text-xs text-text">{commitSummary}</p>}
              </div>

              {commitResult?.warnings.length ? (
                <ul className="list-disc space-y-1 pl-4 text-xs text-amber-200">
                  {commitResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {error && <p className="text-sm text-neg">{error}</p>}

      {showHistory ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-text">Import History</h3>
          </div>

          <DataTableToolbar
            activeFilterCount={table.activeFilterCount}
            onClearAllFilters={() => {
              table.clearAllFilters();
            }}
            totalRows={totalRows}
          />

          {historyLoading ? (
            <LoadingSkeleton lines={4} />
          ) : (
            <div className="space-y-2">
              <VirtualGridTableShell scrollContainerRef={scrollContainerRef}>
                <VirtualGridHeaderRow columnTemplate={IMPORTS_COLUMN_TEMPLATE}>
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
                  columnTemplate={IMPORTS_COLUMN_TEMPLATE}
                  rows={table.sortedRows}
                  scrollContainerRef={scrollContainerRef}
                  getRowKey={(row) => row.id}
                  renderRow={(row) => <ImportsHistoryTableRow row={row} deletingImportId={deletingImportId} onRequestDeleteImport={requestDeleteImport} />}
                />
              </VirtualGridTableShell>
            </div>
          )}
        </div>
      ) : null}

      {deleteConfirmationImport ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5">
            <h3 className="text-lg font-semibold text-text">Delete committed import?</h3>
            <dl className="mt-3 grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm text-text">
              <dt className="text-text-3">Filename</dt>
              <dd>{deleteConfirmationImport.filename}</dd>
              <dt className="text-text-3">Inserted count</dt>
              <dd>{deleteConfirmationImport.insertedExecutions}</dd>
            </dl>
            <p className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              This will remove {deleteConfirmationImport.insertedExecutions} executions and all matched lots derived from them. Manual adjustments
              will be preserved and re-applied on next import.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmationImport(null)}
                disabled={Boolean(deletingImportId)}
                className="rounded border border-border px-3 py-2 text-sm text-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteImport(deleteConfirmationImport)}
                disabled={deletingImportId === deleteConfirmationImport.id}
                className="rounded border border-[color:var(--neg)] bg-[color:var(--neg-dim)] px-3 py-2 text-sm text-neg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingImportId === deleteConfirmationImport.id ? "Deleting..." : "Delete Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
