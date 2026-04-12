"use client";

import { Fragment, useMemo, useState } from "react";
import type { BrokerId, FidelityExecutionPreviewRow, PreviewRow } from "@/types/api";

interface ImportPreviewTableProps {
  adapter: BrokerId;
  rows: PreviewRow[];
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) {
    return "~";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function statusBadgeClass(status: FidelityExecutionPreviewRow["status"]): string {
  if (status === "VALID") {
    return "border-emerald-400/50 bg-emerald-500/15 text-emerald-200";
  }

  if (status === "WARNING") {
    return "border-amber-400/50 bg-amber-500/15 text-amber-200";
  }

  return "border-slate-500/60 bg-slate-700/40 text-slate-200";
}

function statusLabel(status: FidelityExecutionPreviewRow["status"]): string {
  if (status === "SKIPPED") {
    return "SKIPPED";
  }

  if (status === "CANCELLED") {
    return "CANCELLED";
  }

  return status;
}

export function ImportPreviewTable({ adapter, rows }: ImportPreviewTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const fidelityRows = useMemo(
    () => rows.filter((row): row is FidelityExecutionPreviewRow => row.kind === "fidelity"),
    [rows],
  );

  const legacyRows = useMemo(
    () => rows.filter((row): row is Exclude<PreviewRow, FidelityExecutionPreviewRow> => row.kind !== "fidelity"),
    [rows],
  );

  if (adapter === "fidelity") {
    const statusCounts = fidelityRows.reduce(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      { VALID: 0, WARNING: 0, SKIPPED: 0, CANCELLED: 0 },
    );

    return (
      <div>
        <p className="px-2 py-2 text-[11px] text-slate-300">
          Rows: {fidelityRows.length} · VALID {statusCounts.VALID} · WARNING {statusCounts.WARNING} · SKIPPED{" "}
          {statusCounts.SKIPPED} · CANCELLED {statusCounts.CANCELLED}
        </p>
        <table className="min-w-full text-xs">
          <thead className="bg-slate-900 text-slate-300">
            <tr>
              <th className="px-2 py-2 text-left">Run Date</th>
              <th className="px-2 py-2 text-left">Classified Action</th>
              <th className="px-2 py-2 text-left">Symbol</th>
              <th className="px-2 py-2 text-left">Underlying</th>
              <th className="px-2 py-2 text-left">Asset Class</th>
              <th className="px-2 py-2 text-left">Side</th>
              <th className="px-2 py-2 text-left">Open/Close</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">Amount ($)</th>
              <th className="px-2 py-2 text-left">Margin</th>
              <th className="px-2 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {fidelityRows.map((row) => {
              const key = `fidelity-${row.rowIndex}`;
              const expandable = Boolean(row.warningMessage);
              const expanded = Boolean(expandedRows[key]);

              return (
                <Fragment key={key}>
                  <tr
                    onClick={expandable ? () => setExpandedRows((current) => ({ ...current, [key]: !expanded })) : undefined}
                    className={`border-t border-slate-800 text-slate-200 ${expandable ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-2 py-2">{row.executionDate ?? "~"}</td>
                    <td className="px-2 py-2">{row.actionClassification}</td>
                    <td className="px-2 py-2">{row.symbol || "~"}</td>
                    <td className="px-2 py-2">{row.underlyingTicker ?? "~"}</td>
                    <td className="px-2 py-2">{row.assetClass ?? "~"}</td>
                    <td className="px-2 py-2">{row.side ?? "~"}</td>
                    <td className="px-2 py-2">{row.openClose ?? "~"}</td>
                    <td className="px-2 py-2 text-right">{row.quantity === null ? "~" : row.quantity}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(row.price)}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(row.amount)}</td>
                    <td className="px-2 py-2">{row.marginType ?? "~"}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                  {expanded && row.warningMessage ? (
                    <tr className="border-t border-slate-800 bg-amber-500/5 text-amber-100">
                      <td className="px-2 py-2" colSpan={12}>
                        {row.warningMessage}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
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
        {legacyRows.map((row, index) => (
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
  );
}
