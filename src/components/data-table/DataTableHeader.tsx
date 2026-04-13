"use client";

import { useRef } from "react";
import { ColumnFilterPanel } from "@/components/data-table/ColumnFilterPanel";
import type { DataTableColumnDefinition, DataTableFilterOption, SortDirection } from "@/components/data-table/types";

interface DataTableHeaderProps<Row> {
  column: DataTableColumnDefinition<Row>;
  currentSortDirection: SortDirection | null;
  currentValues: string[];
  isOpen: boolean;
  onApply: (values: string[], direction: SortDirection | null) => void;
  onRequestClose: () => void;
  onToggle: () => void;
  options: DataTableFilterOption[];
}

function alignmentClassName<Row>(align: DataTableColumnDefinition<Row>["align"]): string {
  if (align === "right") {
    return "justify-end text-right";
  }

  if (align === "center") {
    return "justify-center text-center";
  }

  return "justify-between text-left";
}

export function DataTableHeader<Row>({
  column,
  currentSortDirection,
  currentValues,
  isOpen,
  onApply,
  onRequestClose,
  onToggle,
  options,
}: DataTableHeaderProps<Row>) {
  const isActive = currentValues.length > 0 || Boolean(currentSortDirection);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <th className="relative px-2 py-2" title={column.title}>
      <div className={["flex items-center gap-2", alignmentClassName<Row>(column.align)].join(" ")}>
        <span className="font-medium">{column.label}</span>
        <button
          ref={filterButtonRef}
          type="button"
          onClick={onToggle}
          className={isActive ? "rounded border border-blue-400/50 bg-blue-500/20 p-1 text-blue-100" : "rounded border border-transparent p-1 text-inherit hover:border-slate-600 hover:bg-slate-800/60"}
          aria-label={`Filter ${column.label}`}
          aria-expanded={isOpen}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
            <path d="M4 6h16l-6 7v5l-4 2v-7L4 6z" />
          </svg>
        </button>
      </div>
      {isOpen ? (
        <ColumnFilterPanel
          anchorRef={filterButtonRef}
          column={column}
          currentSortDirection={currentSortDirection}
          currentValues={currentValues}
          onApply={onApply}
          onClose={onRequestClose}
          options={options}
        />
      ) : null}
    </th>
  );
}
