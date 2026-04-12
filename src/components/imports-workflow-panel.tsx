"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ImportPreviewTable } from "@/components/imports/ImportPreviewTable";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { CommitImportResponse, ImportRecord, UploadImportResponse } from "@/types/api";

interface ImportsListPayload {
  data: ImportRecord[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

interface CommitPayload {
  data: CommitImportResponse;
}

interface UploadPayload {
  data: UploadImportResponse;
}

interface ImportsWorkflowPanelProps {
  mode?: "all" | "upload" | "history";
}

const SHOW_ALL_STORAGE_KEY = "kapman_table_imports_showAll";

export function ImportsWorkflowPanel({ mode = "all" }: ImportsWorkflowPanelProps) {
  const searchParams = useSearchParams();
  const showUpload = mode !== "history";
  const showHistory = mode !== "upload";
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadImportResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitImportResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [historyMeta, setHistoryMeta] = useState({ total: 0, page: 1, pageSize: 25 });
  const [historyPage, setHistoryPage] = useState(1);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState("");
  const [importFilter, setImportFilter] = useState("");

  const canCommit = Boolean(uploadResult && !uploading && !committing && !commitResult);

  const loadHistory = useCallback(async (accountId = accountFilter, importId = importFilter, page = historyPage) => {
    setHistoryLoading(true);

    const searchParams = new URLSearchParams();
    if (accountId.trim()) {
      searchParams.set("account", accountId.trim());
    }
    if (importId.trim()) {
      searchParams.set("import", importId.trim());
    }
    searchParams.set("page", String(showAllHistory ? 1 : page));
    searchParams.set("pageSize", String(showAllHistory ? 1000 : 25));

    const query = searchParams.toString();
    const response = await fetch(`/api/imports${query ? `?${query}` : ""}`, { cache: "no-store" });
    const payload = (await response.json()) as ImportsListPayload;
    setHistory(payload.data);
    setHistoryMeta(payload.meta);
    setHistoryLoading(false);
  }, [accountFilter, historyPage, importFilter, showAllHistory]);

  useEffect(() => {
    try {
      setShowAllHistory(window.localStorage.getItem(SHOW_ALL_STORAGE_KEY) === "1");
    } catch {
      setShowAllHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!showHistory) {
      return;
    }

    const accountFromQuery = searchParams.get("account") ?? "";
    const importFromQuery = searchParams.get("import") ?? "";

    setAccountFilter((current) => (current === accountFromQuery ? current : accountFromQuery));
    setImportFilter((current) => (current === importFromQuery ? current : importFromQuery));
    setHistoryPage(1);
  }, [searchParams, showHistory]);

  useEffect(() => {
    void loadHistory(accountFilter, importFilter, historyPage);
  }, [accountFilter, historyPage, importFilter, loadHistory]);

  async function handleUpload() {
    if (!selectedFile) {
      return;
    }

    setUploading(true);
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
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      request.onload = () => {
        try {
          const payload = JSON.parse(request.responseText) as UploadPayload;
          if (request.status >= 200 && request.status < 300) {
            setUploadResult(payload.data);
            setUploadProgress(100);
          } else {
            setError("Upload failed. Review the file and retry.");
          }
        } catch {
          setError("Upload failed due to an invalid server response.");
        } finally {
          setUploading(false);
          void loadHistory(accountFilter, importFilter);
          resolve();
        }
      };

      request.onerror = () => {
        setError("Network error while uploading file.");
        setUploading(false);
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
        setError("Commit failed. Import remains recoverable and can be retried.");
        return;
      }

      const payload = (await response.json()) as CommitPayload;
      setCommitResult(payload.data);
      await loadHistory(accountFilter, importFilter);
    } finally {
      setCommitting(false);
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

  const canGoBack = historyMeta.page > 1;
  const canGoForward = historyMeta.page * historyMeta.pageSize < historyMeta.total;

  function applyHistoryFilter() {
    setHistoryPage(1);
    void loadHistory(accountFilter, importFilter, 1);
  }

  function toggleShowAllHistory() {
    const next = !showAllHistory;
    setShowAllHistory(next);
    setHistoryPage(1);
    try {
      window.localStorage.setItem(SHOW_ALL_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignore localStorage errors.
    }
  }

  return (
    <section className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">Import Workflow</h2>
        <p className="text-sm text-slate-300">Upload, detect, preview, and commit a broker statement into canonical T1 executions.</p>
      </header>

      {showUpload ? (
        <>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            />
            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="rounded-lg border border-blue-400/40 bg-blue-500/20 px-4 py-2 text-sm text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload Statement"}
            </button>
          </div>

          {(uploading || uploadProgress > 0) && (
            <div>
              <p className="mb-1 text-xs text-slate-300">Upload progress: {uploadProgress}%</p>
              <div className="h-2 rounded-full bg-slate-800">
                <div className="h-2 rounded-full bg-blue-400" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {uploadResult && (
            <div className="space-y-4 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
              <div>
                <p className="text-sm font-medium text-slate-100">Detection Result</p>
                <p className="mt-1 text-xs text-slate-300">
                  Adapter: {uploadResult.detection.adapterId} · Confidence: {uploadResult.detection.confidence} · Format:{" "}
                  {uploadResult.detection.formatVersion}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-100">Parse Preview</p>
                <div className="mt-2 overflow-auto rounded border border-slate-700">
                  <ImportPreviewTable adapter={uploadResult.detection.adapterId} rows={uploadResult.previewRows} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={!canCommit}
                  className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {committing ? "Committing..." : commitResult ? "Committed" : "Commit Import"}
                </button>
                {commitSummary && <p className="text-xs text-slate-200">{commitSummary}</p>}
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

      {error && <p className="text-sm text-red-200">{error}</p>}

      {showHistory ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-100">Import History</h3>
            <input
              type="text"
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
              placeholder="Filter by account id"
              className="w-56 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
            />
            <input
              type="text"
              value={importFilter}
              onChange={(event) => setImportFilter(event.target.value)}
              placeholder="Filter by import id"
              className="w-56 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
            />
            <button
              type="button"
              onClick={applyHistoryFilter}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-200"
            >
              Apply
            </button>
            <button type="button" onClick={toggleShowAllHistory} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-200">
              {showAllHistory ? "Show pages" : `Show all ${historyMeta.total}`}
            </button>
          </div>

        {historyLoading ? (
          <LoadingSkeleton lines={4} />
        ) : (
          <div className="space-y-2">
            <div
              className={showAllHistory ? "overflow-y-auto rounded border border-slate-700" : "overflow-auto rounded border border-slate-700"}
              style={showAllHistory ? { maxHeight: "calc(100vh - 280px)" } : undefined}
            >
              <table className="min-w-full text-xs">
                <thead className="bg-slate-900 text-slate-300">
                  <tr>
                    <th className="px-2 py-2 text-left">Imported At</th>
                    <th className="px-2 py-2 text-left">Filename</th>
                    <th className="px-2 py-2 text-left">Broker</th>
                    <th className="px-2 py-2 text-left">Account</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-right">Parsed</th>
                    <th className="px-2 py-2 text-right">Inserted</th>
                    <th className="px-2 py-2 text-right">Skipped Duplicate</th>
                    <th className="px-2 py-2 text-right">Failed</th>
                    <th className="px-2 py-2 text-left">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                      <td className="px-2 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="px-2 py-2">{row.filename}</td>
                      <td className="px-2 py-2">{row.broker}</td>
                      <td className="px-2 py-2">{row.accountId}</td>
                      <td className="px-2 py-2">{row.status}</td>
                      <td className="px-2 py-2 text-right">{row.parsedRows}</td>
                      <td className="px-2 py-2 text-right">{row.inserted}</td>
                      <td className="px-2 py-2 text-right">{row.skipped_duplicate}</td>
                      <td className="px-2 py-2 text-right">{row.failed}</td>
                      <td className="px-2 py-2">
                        <a href={`/trade-records?tab=executions&import=${row.id}&account=${row.accountId}`} className="text-blue-300 underline">
                          View executions
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showAllHistory ? (
              <p className="text-xs text-slate-300">Showing all {historyMeta.total} records</p>
            ) : (
              <div className="flex items-center justify-between text-xs text-slate-300">
                <p>
                  Showing page {historyMeta.page} of {Math.max(1, Math.ceil(historyMeta.total / historyMeta.pageSize))} ({historyMeta.total} rows)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canGoBack}
                    onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                    className="rounded border border-slate-600 px-2 py-1 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={!canGoForward}
                    onClick={() => setHistoryPage((current) => current + 1)}
                    className="rounded border border-slate-600 px-2 py-1 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      ) : null}
    </section>
  );
}
