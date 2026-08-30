"use client";

import type { RefObject } from "react";
import {
  configCellClass,
  desktopTemplate,
  mobileTemplate,
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
  const visibleConfigs = visibleConfigsFor(configs, table.visibleColumns);

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
        {visibleConfigs.map((config) =>
          config.renderHeader ? (
            <div key={config.definition.id} role="columnheader" className={["px-2 py-2", configCellClass(config, "header")].join(" ")}>
              {config.renderHeader()}
            </div>
          ) : (
            <DataTableHeader
              key={config.definition.id}
              as="div"
              className={configCellClass(config, "header")}
              column={config.definition}
              currentSortDirection={table.sort.columnId === config.definition.id ? table.sort.direction : null}
              currentValues={table.filters[config.definition.id] ?? []}
              currentRange={table.rangeFilters[config.definition.id] ?? null}
              isOpen={openColumnId === config.definition.id}
              onApply={(values, direction, range) => applyColumnState(config.definition.id, values, direction, range)}
              onRequestClose={() => setOpenColumnId((current) => requestCloseColumnId(current, config.definition.id))}
              onToggle={() => setOpenColumnId((current) => toggleOpenColumnId(current, config.definition.id))}
              options={table.filterOptions[config.definition.id] ?? []}
            />
          ),
        )}
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
