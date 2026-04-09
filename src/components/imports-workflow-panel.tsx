"use client";

import { useEffect, useMemo, useState } from "react";
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

export function ImportsWorkflowPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadImportResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitImportResponse | null>(null);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState("");

  const canCommit = Boolean(uploadResult && !uploading);

  async function loadHistory(accountId = "") {
    setHistoryLoading(true);

    const searchParams = new URLSearchParams();
    if (accountId.trim()) {
      searchParams.set("account", accountId.trim());
    }

    const query = searchParams.toString();
    const response = await fetch(`/api/imports${query ? `?${query}` : ""}`, { cache: "no-store" });
    const payload = (await response.json()) as ImportsListPayload;
    setHistory(payload.data);
    setHistoryLoading(false);
  }

  useEffect(() => {
    void loadHistory();
  }, []);

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
          void loadHistory(accountFilter);
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

    const response = await fetch(`/api/imports/${uploadResult.importId}/commit`, {
      method: "POST",
    });

    if (!response.ok) {
      setError("Commit failed. Import remains recoverable and can be retried.");
      return;
    }

    const payload = (await response.json()) as CommitPayload;
    setCommitResult(payload.data);
    await loadHistory(accountFilter);
  }

  const commitSummary = useMemo(() => {
    if (!commitResult) {
      return null;
    }

    return `${commitResult.parsedRows} parsed · ${commitResult.persistedRows} persisted · ${commitResult.skippedRows} skipped`;
  }, [commitResult]);

  return (
    <section className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-100">Import Workflow</h2>
        <p className="text-sm text-slate-300">Upload, detect, preview, and commit a broker statement into canonical T1 executions.</p>
      </header>

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
              Adapter: {uploadResult.detection.adapterId} · Confidence: {uploadResult.detection.confidence} · Format: {uploadResult.detection.formatVersion}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-100">Parse Preview (first 10 rows)</p>
            <div className="mt-2 overflow-auto rounded border border-slate-700">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-900 text-slate-300">
                  <tr>
                    <th className="px-2 py-2 text-left">Timestamp</th>
                    <th className="px-2 py-2 text-left">Symbol</th>
                    <th className="px-2 py-2 text-left">Side</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Price</th>
                    <th className="px-2 py-2 text-left">Spread</th>
                    <th className="px-2 py-2 text-left">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadResult.previewRows.map((row, index) => (
                    <tr key={`${row.eventTimestamp}-${index}`} className="border-t border-slate-800 text-slate-200">
                      <td className="px-2 py-2">{row.eventTimestamp}</td>
                      <td className="px-2 py-2">{row.symbol}</td>
                      <td className="px-2 py-2">{row.side}</td>
                      <td className="px-2 py-2 text-right">{row.quantity}</td>
                      <td className="px-2 py-2 text-right">{row.price ?? "~"}</td>
                      <td className="px-2 py-2">{row.spread}</td>
                      <td className="px-2 py-2">{row.openingClosingEffect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCommit}
              disabled={!canCommit}
              className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Commit Import
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

      {error && <p className="text-sm text-red-200">{error}</p>}

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-100">Import History</h3>
          <input
            type="text"
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
            placeholder="Filter by account id"
            className="w-56 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
          />
          <button
            type="button"
            onClick={() => void loadHistory(accountFilter)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-200"
          >
            Apply
          </button>
        </div>

        {historyLoading ? (
          <LoadingSkeleton lines={4} />
        ) : (
          <div className="overflow-auto rounded border border-slate-700">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="px-2 py-2 text-left">Imported At</th>
                  <th className="px-2 py-2 text-left">Filename</th>
                  <th className="px-2 py-2 text-left">Broker</th>
                  <th className="px-2 py-2 text-left">Account</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-right">Parsed</th>
                  <th className="px-2 py-2 text-right">Persisted</th>
                  <th className="px-2 py-2 text-right">Skipped</th>
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
                    <td className="px-2 py-2 text-right">{row.persistedRows}</td>
                    <td className="px-2 py-2 text-right">{row.skippedRows}</td>
                    <td className="px-2 py-2">
                      <a href={`/executions?import=${row.id}&account=${row.accountId}`} className="text-blue-300 underline">
                        View executions
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
