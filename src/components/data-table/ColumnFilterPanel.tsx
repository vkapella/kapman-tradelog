"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { resolvePanelPosition } from "@/components/data-table/panel-position";
import type { DataTableColumnDefinition, DataTableFilterOption, SortDirection } from "@/components/data-table/types";

interface ColumnFilterPanelProps<Row> {
  anchorRef: RefObject<HTMLElement>;
  column: DataTableColumnDefinition<Row>;
  currentSortDirection: SortDirection | null;
  currentValues: string[];
  onApply: (values: string[], direction: SortDirection | null) => void;
  onClose: () => void;
  options: DataTableFilterOption[];
}

export function ColumnFilterPanel<Row>({
  anchorRef,
  column,
  currentSortDirection,
  currentValues,
  onApply,
  onClose,
  options,
}: ColumnFilterPanelProps<Row>) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [draftValues, setDraftValues] = useState<string[]>(currentValues);
  const [draftSortDirection, setDraftSortDirection] = useState<SortDirection | null>(currentSortDirection);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    setDraftValues(currentValues);
    setDraftSortDirection(currentSortDirection);
    setDraftSearch("");
  }, [currentSortDirection, currentValues]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current || panelRef.current.contains(event.target as Node)) {
        return;
      }

      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const filteredOptions = useMemo(() => {
    if (!draftSearch.trim()) {
      return options;
    }

    const query = draftSearch.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [draftSearch, options]);

  useLayoutEffect(() => {
    if (!anchorRef.current || !panelRef.current) {
      return;
    }

    let frameId = 0;
    const panelElement = panelRef.current;
    const anchorElement = anchorRef.current;

    const updatePosition = () => {
      if (!panelRef.current || !anchorRef.current) {
        return;
      }

      const anchorRect = anchorRef.current.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();
      setPosition(
        resolvePanelPosition({
          anchorRect,
          panelRect,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      );
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updatePosition);
    };

    scheduleUpdate();

    const resizeObserver = new ResizeObserver(() => {
      scheduleUpdate();
    });
    resizeObserver.observe(panelElement);
    resizeObserver.observe(anchorElement);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [anchorRef, column.panelWidthClassName, column.sortMode, draftSearch, filteredOptions.length]);

  function toggleValue(value: string) {
    setDraftValues((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]));
  }

  function apply() {
    onApply(draftValues, draftSortDirection);
    onClose();
  }

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      style={{
        left: position?.left ?? 12,
        top: position?.top ?? 12,
        maxWidth: "calc(100vw - 24px)",
        visibility: position ? "visible" : "hidden",
      }}
      className={[
        "fixed z-40 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 shadow-2xl",
        column.panelWidthClassName ?? "w-72",
      ].join(" ")}
    >
      {column.sortMode ? (
        <div className="space-y-2 border-b border-slate-800 pb-3">
          <p className="font-semibold text-slate-100">Sort</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraftSortDirection("asc")}
              className={draftSortDirection === "asc" ? "rounded border border-blue-400/50 bg-blue-500/20 px-2 py-1 text-blue-100" : "rounded border border-slate-700 px-2 py-1 text-slate-200"}
            >
              Asc
            </button>
            <button
              type="button"
              onClick={() => setDraftSortDirection("desc")}
              className={draftSortDirection === "desc" ? "rounded border border-blue-400/50 bg-blue-500/20 px-2 py-1 text-blue-100" : "rounded border border-slate-700 px-2 py-1 text-slate-200"}
            >
              Desc
            </button>
            <button type="button" onClick={() => setDraftSortDirection(null)} className="rounded border border-slate-700 px-2 py-1 text-slate-300">
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {column.filterMode === "discrete" ? (
        <div className={column.sortMode ? "space-y-3 pt-3" : "space-y-3"}>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-100">Filter values</p>
              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={() => setDraftValues(options.map((option) => option.value))} className="text-blue-300 underline">
                  Select all
                </button>
                <button type="button" onClick={() => setDraftValues([])} className="text-slate-300 underline">
                  Clear all
                </button>
              </div>
            </div>
            <input
              type="text"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder={`Search ${column.label.toLowerCase()}...`}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
            />
          </div>

          <div className="max-h-56 space-y-1 overflow-auto rounded border border-slate-800 bg-slate-900/50 p-2">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-800/80">
                  <input type="checkbox" checked={draftValues.includes(option.value)} onChange={() => toggleValue(option.value)} />
                  <span>{option.label}</span>
                </label>
              ))
            ) : (
              <p className="px-1 py-2 text-slate-400">No matching values.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
        <button type="button" onClick={onClose} className="rounded border border-slate-700 px-2 py-1 text-slate-300">
          Close
        </button>
        <button type="button" onClick={apply} className="rounded border border-blue-400/50 bg-blue-500/20 px-2 py-1 text-blue-100">
          Apply
        </button>
      </div>
    </div>,
    portalTarget,
  );
}
