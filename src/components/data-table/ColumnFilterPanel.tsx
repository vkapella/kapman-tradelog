"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { DataTableColumnDefinition, DataTableFilterOption, SortDirection } from "@/components/data-table/types";

const PANEL_GAP_PX = 8;
const PANEL_VIEWPORT_MARGIN_PX = 12;
const PANEL_MIN_HEIGHT_PX = 160;
const PANEL_MAX_HEIGHT_PX = 400;

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
  const [isMounted, setIsMounted] = useState(false);
  const [panelPosition, setPanelPosition] = useState({
    top: PANEL_VIEWPORT_MARGIN_PX,
    left: PANEL_VIEWPORT_MARGIN_PX,
    maxHeight: PANEL_MAX_HEIGHT_PX,
    listMaxHeight: 224,
    ready: false,
  });
  const [draftSearch, setDraftSearch] = useState("");
  const [draftValues, setDraftValues] = useState<string[]>(currentValues);
  const [draftSortDirection, setDraftSortDirection] = useState<SortDirection | null>(currentSortDirection);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setDraftValues(currentValues);
    setDraftSortDirection(currentSortDirection);
    setDraftSearch("");
  }, [currentSortDirection, currentValues]);

  const filteredOptions = useMemo(() => {
    if (!draftSearch.trim()) {
      return options;
    }

    const query = draftSearch.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [draftSearch, options]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!panelRef.current || panelRef.current.contains(target) || anchorRef.current?.contains(target)) {
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
  }, [anchorRef, onClose]);

  useLayoutEffect(() => {
    if (!isMounted || !panelRef.current || !anchorRef.current) {
      return;
    }

    function updatePanelPosition() {
      if (!panelRef.current || !anchorRef.current) {
        return;
      }

      const anchorRect = anchorRef.current.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = Math.min(Math.max(panelRect.width || 288, 200), 320);
      const availableBelow = viewportHeight - anchorRect.bottom - PANEL_VIEWPORT_MARGIN_PX;
      const availableAbove = anchorRect.top - PANEL_VIEWPORT_MARGIN_PX;
      const shouldRenderAbove = availableBelow < PANEL_MIN_HEIGHT_PX && availableAbove > availableBelow;
      const availableHeight = shouldRenderAbove ? availableAbove : availableBelow;
      const maxHeight = Math.max(PANEL_MIN_HEIGHT_PX, Math.min(PANEL_MAX_HEIGHT_PX, availableHeight - PANEL_GAP_PX));
      const panelHeight = Math.min(panelRect.height || maxHeight, maxHeight);
      const preferredLeft = anchorRect.left;
      const rightAnchoredLeft = anchorRect.right - panelWidth;
      const unclampedLeft =
        preferredLeft + panelWidth > viewportWidth - PANEL_VIEWPORT_MARGIN_PX ? rightAnchoredLeft : preferredLeft;
      const left = Math.min(
        Math.max(PANEL_VIEWPORT_MARGIN_PX, unclampedLeft),
        viewportWidth - panelWidth - PANEL_VIEWPORT_MARGIN_PX,
      );
      const unclampedTop = shouldRenderAbove ? anchorRect.top - panelHeight - PANEL_GAP_PX : anchorRect.bottom + PANEL_GAP_PX;
      const top = Math.min(
        Math.max(PANEL_VIEWPORT_MARGIN_PX, unclampedTop),
        viewportHeight - panelHeight - PANEL_VIEWPORT_MARGIN_PX,
      );
      const reservedHeight = (column.sortMode ? 72 : 0) + (column.filterMode === "discrete" ? 144 : 0) + 64;

      setPanelPosition({
        top,
        left,
        maxHeight,
        listMaxHeight: Math.max(120, maxHeight - reservedHeight),
        ready: true,
      });
    }

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    document.addEventListener("scroll", updatePanelPosition, true);

    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      document.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [anchorRef, column.filterMode, column.sortMode, filteredOptions.length, isMounted]);

  function toggleValue(value: string) {
    setDraftValues((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]));
  }

  function apply() {
    onApply(draftValues, draftSortDirection);
    onClose();
  }

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      style={{
        top: panelPosition.top,
        left: panelPosition.left,
        maxHeight: panelPosition.maxHeight,
        visibility: panelPosition.ready ? "visible" : "hidden",
      }}
      className={[
        "fixed z-50 min-w-[200px] max-w-[320px] overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 shadow-2xl",
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

          <div
            style={{ maxHeight: panelPosition.listMaxHeight }}
            className="space-y-1 overflow-y-auto rounded border border-slate-800 bg-slate-900/50 p-2"
          >
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
    document.body,
  );
}
