"use client";

import { useEffect } from "react";
import type { KpiDefinition } from "@/lib/registries/kpi-registry";

interface KpiPickerProps {
  open: boolean;
  kpis: KpiDefinition[];
  onClose: () => void;
  onSelect: (kpiId: string) => void;
}

export function KpiPicker({ open, kpis, onClose, onSelect }: KpiPickerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-panel p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Add KPI</h2>
          <button type="button" onClick={onClose} className="rounded border border-border px-2 py-1 text-xs text-muted">
            Close
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((kpi) => (
            <button
              key={kpi.id}
              type="button"
              onClick={() => {
                onSelect(kpi.id);
                onClose();
              }}
              className="rounded-lg border border-border bg-panel-2 p-3 text-left"
            >
              <p className="text-sm font-semibold text-text">{kpi.name}</p>
              <p className="mt-1 text-xs text-muted">{kpi.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
