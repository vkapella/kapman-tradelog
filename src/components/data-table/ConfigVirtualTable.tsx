"use client";

import { useState, type RefObject } from "react";
import {
  configCellClass,
  desktopTemplate,
  dropColumnInOrder,
  mobileTemplate,
  movableColumnIds,
  moveColumnInOrder,
  orderVisibleConfigs,
  visibleConfigsFor,
  type TableColumnConfig,
} from "@/components/data-table/column-config";
import { DataTableHeader } from "@/components/data-table/DataTableHeader";
import { requestCloseColumnId, toggleOpenColumnId } from "@/components/data-table/filter-panel-interaction";
import type { DataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableRangeState, SortDirection } from "@/components/data-table/types";
import { VirtualGridBody, VirtualGridHeaderRow, VirtualGridTableShell } from "@/components/data-table/VirtualGridTable";

interface ConfigVirtualTableProps<Row> {
  configs: TableColumnConfig<Row>[];
  table: DataTableState<Row>;
  openColumnId: string | null;
  setOpenColumnId: (updater: (current: string | null) => string | null) => void;
  scrollContainerRef: RefObject<HTMLDivElement>;
  getRowKey: (row: Row, index: number) => string;
  onRowClick?: (row: Row) => void;
  headerClassName?: string;
  height?: number | string;
  estimateSize?: number;
}

/**
 * Config-driven VirtualGrid (#340): headers, cells, and both breakpoint
 * templates all derive from ONE visible-config array, so they cannot
 * desynchronize. Tier-2 cells are CSS-hidden below md; mobileOnly cells
 * (the Details action) are CSS-hidden at md+.
 */
export function ConfigVirtualTable<Row>({
  configs,
  table,
  openColumnId,
  setOpenColumnId,
  scrollContainerRef,
  getRowKey,
  onRowClick,
  headerClassName,
  height,
  estimateSize,
}: ConfigVirtualTableProps<Row>) {
  const visibleConfigs = orderVisibleConfigs(visibleConfigsFor(configs, table.visibleColumns), table.columnOrder);
  const reorderableIds = movableColumnIds(visibleConfigs);
  // UI-2 drag-reorder: native HTML5 drag between header cells; the grip
  // button also takes ArrowLeft/ArrowRight so the reorder is keyboardable.
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function commitDrop(targetId: string) {
    if (dragColumnId && dragColumnId !== targetId) {
      table.setColumnOrder(dropColumnInOrder(reorderableIds, dragColumnId, targetId));
    }
    setDragColumnId(null);
    setDropTargetId(null);
  }

  function moveColumn(columnId: string, delta: number) {
    table.setColumnOrder(moveColumnInOrder(reorderableIds, columnId, delta));
  }

  function applyColumnState(columnId: string, values: string[], direction: SortDirection | null, range: DataTableRangeState | null) {
    table.setColumnFilter(columnId, values);
    table.setColumnRange(columnId, range);
    if (direction) {
      table.setSort({ columnId, direction });
    } else if (table.sort.columnId === columnId) {
      table.setSort({ columnId: null, direction: null });
    }
  }

  return (
    <VirtualGridTableShell
      scrollContainerRef={scrollContainerRef}
      height={height}
      desktopTemplate={desktopTemplate(visibleConfigs)}
      mobileTemplate={mobileTemplate(visibleConfigs)}
    >
      <VirtualGridHeaderRow className={headerClassName}>
        {visibleConfigs.map((config) => {
          const columnId = config.definition.id;
          const isReorderable = reorderableIds.includes(columnId);
          const isDropTarget = dropTargetId === columnId && dragColumnId !== null && dragColumnId !== columnId;

          if (config.renderHeader) {
            return (
              <div key={columnId} role="columnheader" className={["px-2 py-2", configCellClass(config, "header")].join(" ")}>
                {config.renderHeader()}
              </div>
            );
          }

          return (
            <div
              key={columnId}
              className={["group/reorder relative", configCellClass(config, "header"), isDropTarget ? "shadow-[inset_2px_0_0_var(--accent)]" : ""].join(" ")}
              onDragOver={isReorderable ? (event) => { event.preventDefault(); setDropTargetId(columnId); } : undefined}
              onDragLeave={isReorderable ? () => setDropTargetId((current) => (current === columnId ? null : current)) : undefined}
              onDrop={isReorderable ? (event) => { event.preventDefault(); commitDrop(columnId); } : undefined}
            >
              {isReorderable ? (
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", columnId);
                    setDragColumnId(columnId);
                  }}
                  onDragEnd={() => { setDragColumnId(null); setDropTargetId(null); }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") { event.preventDefault(); moveColumn(columnId, -1); }
                    if (event.key === "ArrowRight") { event.preventDefault(); moveColumn(columnId, 1); }
                  }}
                  aria-label={`Reorder ${config.definition.label} column (arrow keys move it)`}
                  title="Drag to reorder; arrow keys move"
                  className={
                    // design-lint-allow: intra-component sticky stacking (decision 53) — the
                    // drag handle sits above its own header cell inside that cell's stacking
                    // context. The --z-* scale arbitrates between page-level components.
                    "absolute left-0 top-1/2 z-[1] -translate-y-1/2 cursor-grab rounded px-0.5 py-1 text-[9px] leading-none opacity-40 focus-visible:opacity-100 hover:opacity-100 active:cursor-grabbing max-md:hidden"
                  }
                  style={{ color: "var(--border-strong)" }}
                >
                  <span aria-hidden="true">⠿</span>
                </button>
              ) : null}
              <DataTableHeader
                as="div"
                column={config.definition}
                currentSortDirection={table.sort.columnId === columnId ? table.sort.direction : null}
                currentValues={table.filters[columnId] ?? []}
                currentRange={table.rangeFilters[columnId] ?? null}
                isOpen={openColumnId === columnId}
                onApply={(values, direction, range) => applyColumnState(columnId, values, direction, range)}
                onRequestClose={() => setOpenColumnId((current) => requestCloseColumnId(current, columnId))}
                onToggle={() => setOpenColumnId((current) => toggleOpenColumnId(current, columnId))}
                options={table.filterOptions[columnId] ?? []}
              />
            </div>
          );
        })}
      </VirtualGridHeaderRow>
      <VirtualGridBody
        rows={table.sortedRows}
        scrollContainerRef={scrollContainerRef}
        getRowKey={getRowKey}
        onRowClick={onRowClick}
        estimateSize={estimateSize}
        renderRow={(row) => (
          <>
            {visibleConfigs.map((config) => (
              <div key={config.definition.id} className={configCellClass(config)} data-cell={config.definition.id}>
                {config.renderCell(row)}
              </div>
            ))}
          </>
        )}
      />
    </VirtualGridTableShell>
  );
}
